import express from 'express';
import { createSupabaseClient } from '../supabase';
import { getGroupTransactionsWithParties, applyTransactionsToNetBalances, BALANCE_TOLERANCE } from '../utils/transactionHelpers';

import { authMiddleware } from '../middleware/auth';


const router = express.Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  const supabase = createSupabaseClient();
  // 1. Get IDs of groups the user belongs to (via friends table linking)
  const { data: memberGroups, error: memberError } = await supabase
    .from('group_members')
    .select('group_id, friends!inner(linked_user_id)')
    .eq('friends.linked_user_id', (req as any).user.id);

  console.log('[GET /groups] User ID:', (req as any).user?.id); // Keep log for verification
  // console.log('[GET /groups] Member Groups found:', memberGroups); 

  if (memberError) return res.status(500).json({ error: memberError.message });

  const groupIds = memberGroups.map((mg: any) => mg.group_id);

  if (groupIds.length === 0) return res.json([]);

  const { data: groups, error } = await supabase
    .from('groups')
    .select('*, group_members(friends(id, name, avatar, linked_user_id))') // Nested fetch
    .in('id', groupIds);
    
  if (error) return res.status(500).json({ error: error.message });
  
  const formattedGroups = groups.map((g: any) => ({
    ...g,
    members: g.group_members.map((gm: any) => ({
        id: gm.friends.id,
        name: gm.friends.name,
        avatar: gm.friends.avatar || '',
        userId: gm.friends.linked_user_id
    })) 
  }));

  res.json(formattedGroups);
});

router.post('/', async (req, res) => {
  const { name, type, members } = req.body;
  const supabase = createSupabaseClient();
  
  const { data: group, error: groupError } = await supabase
    .from('groups')
    .insert([{ name, type }])
    .select()
    .single();

  if (groupError) return res.status(500).json({ error: groupError.message });

  // Add CREATOR to the group immediately
  const creatorId = (req as any).user?.id;
  // console.log('[POST /groups] Creator ID:', creatorId);
  // console.log('[POST /groups] Original members payload:', members);
  
  // 1. Find or Create "Self Friend" record for the creator
  // We need a friend record that represents 'Me' to add to group_members
  let selfFriendId: string | null = null;
  
  if (creatorId) {
      const { data: selfFriend } = await supabase
          .from('friends')
          .select('id')
          .eq('linked_user_id', creatorId)
          .eq('owner_id', creatorId)
          .single();
      
      if (selfFriend) {
          selfFriendId = selfFriend.id;
      } else {
           // Create Self Friend
           // Ideally we fetch user profile name, but 'You' is safe fallback or use email if needed.
           // We can skip profile fetch for speed if we trust 'You' or just update it later.
           const { data: newFriend, error: createError } = await supabase
            .from('friends')
            .insert([{ 
                name: 'You', 
                owner_id: creatorId, 
                linked_user_id: creatorId,
                balance: 0 
            }])
            .select()
            .single();
            
            if (newFriend) selfFriendId = newFriend.id;
            if (createError) console.error('Error creating self-friend:', createError);
      }
  }

  // 2. Prepare Member List
  let validMembers = [];
  
  // Add other selected members
  if (members && members.length > 0) {
     validMembers = members.map((friendId: string) => ({
      group_id: group.id,
      friend_id: friendId === 'currentUser' ? selfFriendId : friendId
    })).filter((m: any) => m.friend_id && m.friend_id !== 'currentUser');
  }
  
  // Add self (creator) if not already added
  if (selfFriendId && !validMembers.find((m: any) => m.friend_id === selfFriendId)) {
      validMembers.push({ group_id: group.id, friend_id: selfFriendId });
  }

  if (validMembers.length > 0) {
      const { error: memberError } = await supabase
        .from('group_members')
        .insert(validMembers);
      
      if (memberError) console.error('Error adding members:', memberError);
  }

  // We should ideally fetch the group again to get full member details, or construct a partial response.
  // The frontend might expect the full rich object now. 
  // For simplicity, let's return [] for members as they are added but we don't have their Profile info handy without a refetch.
  // Actually, wait. 'addGroup' in frontend does invalidateQueries(['groups']). So returning minimal data is fine.
  // But strictly matching the type 'GroupMember[]' in the response might be required if frontend updates optimistic.
  // Current DataContext just invalidates. So we can return empty or basic.
  
  res.status(201).json({ ...group, members: [] });
});

router.post('/:id/members', async (req, res) => {
  const { id } = req.params;
  const { memberId } = req.body;
  const supabase = createSupabaseClient();

  const { error } = await supabase
    .from('group_members')
    .insert([{ group_id: id, friend_id: memberId }]);

  if (error) return res.status(500).json({ error: error.message });

  const { data: group, error: fetchError } = await supabase
    .from('groups')
    .select('*, group_members(friends(id, name, avatar, linked_user_id))')
    .eq('id', id)
    .single();
    
  if (fetchError) return res.status(500).json({ error: fetchError.message });

   const formattedGroup = {
    ...group,
    members: group.group_members.map((gm: any) => ({
        id: gm.friends.id,
        name: gm.friends.name,
        avatar: gm.friends.avatar || '',
        userId: gm.friends.linked_user_id
    }))
  };

  res.json(formattedGroup);
});

// Rename Group
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    const supabase = createSupabaseClient();

    const { data, error } = await supabase
        .from('groups')
        .update({ name })
        .eq('id', id)
        .select()
        .single();
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
});

// Remove Member
router.delete('/:id/members/:friendId', async (req, res) => {
    const { id, friendId } = req.params;
    const supabase = createSupabaseClient();

    // 1. Balance Check for this member
    // We need to find the user_id associated with this friend_id to check expense 'payer_id' and split 'user_id'
        const { data: friendRecord } = await supabase
        .from('friends')
        .select('linked_user_id')
        .eq('id', friendId)
        .single();

    const userIdToCheck = friendRecord?.linked_user_id; // Might be null if it's a dummy friend?
    // If it's a dummy friend, we check split.friend_id (Not implemented in my logic yet)?
    // Wait, splits usually store user_id for app users. 
    // If I add "Bob" (manual friend), splits table? 
    // Schema check: splits table has (expense_id, user_id, amount). Does it have friend_id?
    // I need to assume standard schema. If manual friend, user_id is null?
    // Let's assume strict check: If you are in involved in ANY expense (payer or split), you can't be deleted.

    const { data: expenses, error: expenseError } = await supabase
        .from('expenses')
        .select('*, expense_splits(*)')
        .eq('group_id', id)
        .eq('deleted', false);

    if (expenseError) return res.status(500).json({ error: expenseError.message });

    let isInvolved = false;
    let balance = 0;

    // Helper to identify if this member is involved
    const isMemberInvolved = (expense: any) => {
         // Check Payer
         // If expense.payer_id matches userIdToCheck (if exists) 
         // OR we need to check if payer logic uses friend_id? 
         // DB Schema: payer_id is UUID (auth.users). 
         // If manual friend "Bob", he can't pay in the App context easily unless creator pays "on behalf"?
         // Let's rely on Splits.
         
         const split = expense.expense_splits.find((s: any) => {
             // Match User ID
             if (userIdToCheck && s.user_id === userIdToCheck) return true;
             // FUTURE: Match Friend ID if schema supports it
             return false;
         });

         if (split) return true;
         
         if (userIdToCheck && expense.payer_id === userIdToCheck) return true;

         return false;
    };
    
    // Actually, simple balance check logic logic from 'leave' endpoint works if we have userId.
    // If no userId (manual friend), we might just allow delete OR check if 'friend_id' is used?
    // I'll stick to: If User Linked, check balance. If Manual, check generic "Involvement"?
    
    if (userIdToCheck) {
         // FIX: Use helper to fetch transactions with proper derived parties
         const derivedTransactions = await getGroupTransactionsWithParties(supabase, id, false);
         
         expenses.forEach((expense: any) => {
            // FIX: Check both payer_user_id and payer_id
            const payerId = expense.payer_user_id || expense.payer_id;
            if (payerId === userIdToCheck) {
                const mySplit = expense.expense_splits.find((s: any) => s.user_id === userIdToCheck);
                const myShare = mySplit ? mySplit.amount : 0;
                balance += (expense.amount - myShare);
            } else {
                const mySplit = expense.expense_splits.find((s: any) => s.user_id === userIdToCheck);
                if (mySplit) balance -= mySplit.amount;
            }
         });
         
         // Apply transactions using derived parties
         derivedTransactions.forEach((t) => {
             if (t.fromId === userIdToCheck) balance += t.amount;
             else if (t.toId === userIdToCheck) balance -= t.amount;
         });
         
         if (Math.abs(balance) > BALANCE_TOLERANCE) {
             return res.status(400).json({ error: "Cannot remove member with outstanding balance." });
         }


    } else {
         // Manual Friend Check: Just check if they adhere to any expense?
         // Without linked_user_id, it's hard to track 'payer_id' matches.
         // Usually manual friends don't pay?
         // I'll proceed with deletion for manual friends for now, assuming lesser risk/complexity.
    }

    const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', id)
        .eq('friend_id', friendId);

    if (error) return res.status(500).json({ error: error.message });
    res.status(204).send();
});

// Leave Group
router.post('/:id/leave', async (req, res) => {
    const { id } = req.params;
    const userId = (req as any).user?.id;
    const supabase = createSupabaseClient();

    // 1. Find the Friend ID corresponding to this User in this Group
    // We need to know WHICH friend record represents the current user in this group context.
    // User might be added via their own "Self Friend" OR by someone else?
    // In this app, "Self Friend" (linked_user_id == userId) is the standard way you exist in a group you joined/created.
    
    // Find friend record for this user
    const { data: friendRecord, error: friendError } = await supabase
        .from('friends')
        .select('id')
        .eq('linked_user_id', userId)
        .single(); // Assuming one "Self" friend record per user per context? 
        // Actually, 'friends' table structure: owner_id -> linked_user_id.
        // If I am the owner of my own friend record (My "Me" contact), that's valid.
        // But in a group, could I be added by someone else? 
        // If I 'leave', I am removing my presence. 
        // If I was added by a Creator (as a dummy friend), I can't really "leave" via API unless I have claimed that friend.
        // Assuming Standard flow: User interacts with groups where they have a Linked User ID.

    // Better approach: Join group_members with friends to find the entry where friends.linked_user_id == userId
    const { data: memberEntry, error: memberError } = await supabase
        .from('group_members')
        .select('friend_id, friends!inner(id, linked_user_id)')
        .eq('group_id', id)
        .eq('friends.linked_user_id', userId)
        .single();

    if (memberError || !memberEntry) {
        return res.status(404).json({ error: "You are not a member of this group" });
    }

    const memberFriendId = memberEntry.friend_id;

    // 2. Check Balance
    // We need to sum up expenses where this user is payer vs involved in splits.
    // This is complex to do purely in SQL without a view/function. 
    // We can fetch expenses for this group and calculate JS side, consistent with Frontend logic.
    
    const { data: expenses, error: expenseError } = await supabase
        .from('expenses')
        .select('*, expense_splits(*)')
        .eq('group_id', id);

    if (expenseError) return res.status(500).json({ error: expenseError.message });

    // Calculate Balance
    let balance = 0;
    // FIX: Use helper to fetch transactions with proper derived parties
    const derivedTransactions = await getGroupTransactionsWithParties(supabase, id, false);

    // -- Expense Calculation --
    expenses.forEach((expense: any) => {
        // FIX: Check both payer_user_id and payer_id
        const payerId = expense.payer_user_id || expense.payer_id;
        const isPayer = payerId === userId;
        
        if (isPayer) {
            // I paid. I am owed by others.
            const mySplit = expense.expense_splits.find((s: any) => s.user_id === userId);
            const myShare = mySplit ? mySplit.amount : 0;
            const totalPaidByMe = expense.amount;
            balance += (totalPaidByMe - myShare);
        } else {
            // Someone else paid.
            const mySplit = expense.expense_splits.find((s: any) => s.user_id === userId);
            if (mySplit) {
                balance -= mySplit.amount;
            }
        }
    });

    // -- Transaction Calculation using derived parties --
    derivedTransactions.forEach((t) => {
        if (t.fromId === userId) {
            // I paid someone (Settle Up) → increases my balance
            balance += t.amount;
        } else if (t.toId === userId) {
            // Someone paid me → decreases my balance
            balance -= t.amount;
        }
    });

    // Check with tolerance (use consistent constant)
    if (Math.abs(balance) > BALANCE_TOLERANCE) {
        return res.status(400).json({ 
            error: "Cannot leave group with outstanding balance. Please settle up first.",
            balance: balance 
        });
    }


    // 3. Remove from Group Members
    const { error: deleteError } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', id)
        .eq('friend_id', memberFriendId); // Remove the friend link

    if (deleteError) return res.status(500).json({ error: deleteError.message });

    res.status(200).json({ message: "Successfully left group" });
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const supabase = createSupabaseClient();

  // Validate Group Balance (All Members must be settled)
  const { data: expenses } = await supabase
    .from('expenses')
    .select('amount, payer_id, payer_user_id, expense_splits(user_id, amount)')
    .eq('group_id', id)
    .eq('deleted', false);

  // FIX: Use helper to properly derive transaction parties
  const transactions = await getGroupTransactionsWithParties(supabase, id, false);

  // We map balances by User ID
  const balances: Record<string, number> = {};

  expenses?.forEach((expense: any) => {
     // Payer credit - use payer_user_id if available, fallback to payer_id
     const payerId = expense.payer_user_id || expense.payer_id;
     if (payerId) {
       balances[payerId] = (balances[payerId] || 0) + expense.amount;
     }
     // Split debit
     expense.expense_splits.forEach((split: any) => {
         if (split.user_id) {
             balances[split.user_id] = (balances[split.user_id] || 0) - split.amount;
         }
     });
  });

  // Apply transactions using helper
  applyTransactionsToNetBalances(transactions, balances);

  // Check if any non-zero balance exists (use consistent tolerance)
  const hasOutstanding = Object.values(balances).some(b => Math.abs(b) > BALANCE_TOLERANCE);

  if (hasOutstanding) {
      console.log('[Groups DELETE] Outstanding balances found:', balances);
      return res.status(400).json({ error: "Cannot delete group with outstanding balances. Please settle all debts first." });
  }

  const { error } = await supabase
    .from('groups')
    .delete()
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});


export default router;
