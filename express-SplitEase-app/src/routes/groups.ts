import express from 'express';
import { createSupabaseClient } from '../supabase';
import { getGroupTransactionsWithParties, applyTransactionsToNetBalances } from '../utils/transactionHelpers';
import { calculatePairwiseExpenseDebt, BALANCE_TOLERANCE } from '../utils/balanceUtils';
import { cleanupAfterMemberExit } from '../utils/memberCleanup';
import { recalculateGroupBalances } from '../utils/recalculate';

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
    .select('*, created_by, group_members(friends(id, name, avatar, linked_user_id, owner_id))') // Include created_by
    .in('id', groupIds);
    
  if (error) return res.status(500).json({ error: error.message });
  
  const currentUserId = (req as any).user.id;

  const formattedGroups = groups.map((g: any) => ({
    ...g,
    createdBy: g.created_by, // Include creator ID for Admin badge
    simplifyDebtsEnabled: g.simplify_debts_enabled,
    currentUserBalance: g.user_balances ? (g.user_balances[currentUserId] || 0) : 0, // <-- Backend Logic
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
  
  // Get creator ID from authenticated user
  const creatorId = (req as any).user?.id;
  
  const { data: group, error: groupError } = await supabase
    .from('groups')
    .insert([{ name, type, created_by: creatorId }])
    .select()
    .single();

  if (groupError) return res.status(500).json({ error: groupError.message });

  // Add CREATOR to the group immediately (creatorId already declared above)
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
           // Create Self Friend - FETCH REAL PROFILE NAME first
           // Get user's profile name from profiles table
           let profileName = 'User'; // Safe fallback
           const { data: profile } = await supabase
               .from('profiles')
               .select('full_name')
               .eq('id', creatorId)
               .single();
           
           if (profile?.full_name) {
               profileName = profile.full_name;
           }
           
           const { data: newFriend, error: createError } = await supabase
            .from('friends')
            .insert([{ 
                name: profileName,  // Use actual profile name, not 'You'
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
  const currentUserId = (req as any).user?.id;

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

  // === GROUP INVITE NOTIFICATION ===
  const envKey = process.env as any;
  const env = {
    SUPABASE_URL: envKey.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: envKey.SUPABASE_SERVICE_ROLE_KEY,
    VAPID_PUBLIC_KEY: envKey.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: envKey.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: envKey.VAPID_SUBJECT
  };

  if (env.VAPID_PUBLIC_KEY) {
    try {
      // Get the added member's linked_user_id
      const { data: addedFriend } = await supabase
        .from('friends')
        .select('linked_user_id')
        .eq('id', memberId)
        .single();
      
      const recipientUserId = addedFriend?.linked_user_id;
      
      // Only notify if it's a real user and not the person adding themselves
      if (recipientUserId && recipientUserId !== currentUserId) {
        // Get sender name
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', currentUserId)
          .single();
        
        const senderName = profile?.full_name || 'Someone';
        const title = `Added to ${group.name} 👥`;
        const body = `${senderName} added you`;
        const url = `/groups/${id}`;
        
        console.log(`[Groups] Notifying new member. User: ${recipientUserId}, Group: ${group.name}`);
        
        const { sendPushNotification } = await import('../utils/push');
        await sendPushNotification(env, [recipientUserId], title, body, url);
      }
    } catch (err) {
      console.error('[Groups] Failed to send group invite notification:', err);
    }
  }

  res.json(formattedGroup);
});

// Update Group (Name or Settings)
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { name, simplifyDebtsEnabled } = req.body;
    const currentUserId = (req as any).user?.id;
    const supabase = createSupabaseClient();

    // Fetch current simplify_debts_enabled value to detect actual change
    let previousSimplifyValue: boolean | null = null;
    if (simplifyDebtsEnabled !== undefined) {
        const { data: currentGroup } = await supabase
            .from('groups')
            .select('simplify_debts_enabled')
            .eq('id', id)
            .single();
        previousSimplifyValue = currentGroup?.simplify_debts_enabled ?? null;
    }

    // Prepare update object
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (simplifyDebtsEnabled !== undefined) updates.simplify_debts_enabled = simplifyDebtsEnabled;

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No fields to update" });
    }

    // Perform Update
    const { data: updatedGroup, error } = await supabase
        .from('groups')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
    
    if (error) return res.status(500).json({ error: error.message });

    // Trigger scoped recalculation ONLY if simplify toggle actually changed
    const simplifyValueChanged = simplifyDebtsEnabled !== undefined && previousSimplifyValue !== simplifyDebtsEnabled;
    if (simplifyValueChanged) {
        console.log(`[Groups] Simplify toggle changed for group ${id}: ${previousSimplifyValue} → ${simplifyDebtsEnabled}. Triggering scoped recalc.`);
        await recalculateGroupBalances(supabase, id);
    }

    // Handle Notifications for Simplify Toggle
    if (simplifyDebtsEnabled !== undefined) {
        try {
            // 1. Get Group Members (to notify)
            const { data: members } = await supabase
                .from('group_members')
                .select('friends(linked_user_id)')
                .eq('group_id', id);

            // 2. Get Actor Name
            const { data: profile } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('id', currentUserId)
                .single();
            
            const actorName = profile?.full_name || 'Someone';
            const actionText = simplifyDebtsEnabled ? 'enabled' : 'disabled';
            const title = `Group Settings Updated ⚙️`;
            const body = `Simplified debts ${actionText} by ${actorName}`;
            const url = `/groups/${id}/settings`; // Direct to settings so they can see the toggle

            // 3. Filter Recipients (Exclude current user)
            const recipients = members
                ?.map((m: any) => m.friends?.linked_user_id)
                .filter((uid: string) => uid && uid !== currentUserId) || [];

            if (recipients.length > 0) {
                console.log(`[Groups] Notifying simplify toggle. Group: ${id}, Actor: ${actorName}, Action: ${actionText}`);
                const { sendPushNotification } = await import('../utils/push');
                
                // Construct env object for utility
                const envKey = process.env as any;
                const env = {
                    SUPABASE_URL: envKey.SUPABASE_URL,
                    SUPABASE_SERVICE_ROLE_KEY: envKey.SUPABASE_SERVICE_ROLE_KEY,
                    VAPID_PUBLIC_KEY: envKey.VAPID_PUBLIC_KEY,
                    VAPID_PRIVATE_KEY: envKey.VAPID_PRIVATE_KEY,
                    VAPID_SUBJECT: envKey.VAPID_SUBJECT
                };
                
                await sendPushNotification(env, recipients, title, body, url);
            }

        } catch (notifyError) {
            console.error('[Groups] Failed to send simplify notification:', notifyError);
            // Non-blocking error
        }
    }

    res.json(updatedGroup);
});

// Remove Member
router.delete('/:id/members/:friendId', async (req, res) => {
    const { id, friendId } = req.params;
    const supabase = createSupabaseClient();

    // 1. Get the friend record to check linked_user_id
    const { data: friendRecord } = await supabase
        .from('friends')
        .select('linked_user_id')
        .eq('id', friendId)
        .single();

    const linkedUserId = friendRecord?.linked_user_id;
    
    // Create matcher function to check if an ID matches this member
    const matchesMember = (id: string | null | undefined) => {
        if (!id) return false;
        if (id === friendId) return true;
        if (linkedUserId && id === linkedUserId) return true;
        return false;
    };

    // 2. Fetch all group members to get their IDs for pairwise checks
    const { data: members } = await supabase
        .from('group_members')
        .select('friend_id, friends(linked_user_id)')
        .eq('group_id', id);
    
    // 3. Fetch group expenses and transactions
    const { data: expenses, error: expenseError } = await supabase
        .from('expenses')
        .select('*, expense_splits(*)')
        .eq('group_id', id)
        .eq('deleted', false);

    if (expenseError) return res.status(500).json({ error: expenseError.message });
    
    const derivedTransactions = await getGroupTransactionsWithParties(supabase, id, false);

    // 4. Check pairwise balance with EACH other member
    let hasOutstandingBalance = false;
    const balanceDetails: string[] = [];
    
    for (const otherMember of (members || [])) {
        if (otherMember.friend_id === friendId) continue; // Skip self
        
        const otherLinkedUserId = (otherMember.friends as any)?.linked_user_id;
        
        // Matcher for other member
        const matchesOther = (id: string | null | undefined) => {
            if (!id) return false;
            if (id === otherMember.friend_id) return true;
            if (otherLinkedUserId && id === otherLinkedUserId) return true;
            return false;
        };
        
        let pairwiseBalance = 0;
        
        // Calculate pairwise expense balance using shared utility
        expenses?.forEach((expense: any) => {
            const expenseEffect = calculatePairwiseExpenseDebt(
                expense, 
                friendId, // Me (User to remove)
                otherMember.friend_id, // Them (Other member)
                linkedUserId,      // My Linked User ID
                otherLinkedUserId  // Their Linked User ID
            );
            pairwiseBalance += expenseEffect;
        });
        
        // Calculate pairwise transaction balance
        derivedTransactions.forEach((t) => {
            if (matchesMember(t.fromId) && matchesOther(t.toId)) {
                pairwiseBalance += t.amount;
            } else if (matchesOther(t.fromId) && matchesMember(t.toId)) {
                pairwiseBalance -= t.amount;
            }
        });
        
        if (Math.abs(pairwiseBalance) > BALANCE_TOLERANCE) {
            hasOutstandingBalance = true;
            balanceDetails.push(`Balance with member ${otherMember.friend_id}: ${pairwiseBalance.toFixed(2)}`);
        }
    }
    
    if (hasOutstandingBalance) {
        console.log(`[Remove Member] Cannot remove ${friendId}: ${balanceDetails.join(', ')}`);
        return res.status(400).json({ 
            error: "Cannot remove member with outstanding balance. Member must settle all balances first." 
        });
    }

    // 5. Delete the member from the group
    const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', id)
        .eq('friend_id', friendId);

    if (error) return res.status(500).json({ error: error.message });

    // 6. Cleanup stale data (user_balances, simplified_debts, friend breakdowns)
    if (linkedUserId) {
        await cleanupAfterMemberExit(supabase, id, linkedUserId);
    }

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

    // 2. Fetch all group members for pairwise balance check
    const { data: members } = await supabase
        .from('group_members')
        .select('friend_id, friends(linked_user_id)')
        .eq('group_id', id);

    const { data: expenses, error: expenseError } = await supabase
        .from('expenses')
        .select('*, expense_splits(*)')
        .eq('group_id', id)
        .eq('deleted', false);

    if (expenseError) return res.status(500).json({ error: expenseError.message });

    const derivedTransactions = await getGroupTransactionsWithParties(supabase, id, false);

    // Create matcher for current user
    const matchesMe = (id: string | null | undefined) => {
        if (!id) return false;
        if (id === userId) return true;
        if (id === memberFriendId) return true;
        return false;
    };

    // 3. Check PAIRWISE balance with EACH other member
    let hasOutstandingBalance = false;
    
    for (const otherMember of (members || [])) {
        if (otherMember.friend_id === memberFriendId) continue; // Skip self
        
        const otherLinkedUserId = (otherMember.friends as any)?.linked_user_id;
        
        const matchesOther = (id: string | null | undefined) => {
            if (!id) return false;
            if (id === otherMember.friend_id) return true;
            if (otherLinkedUserId && id === otherLinkedUserId) return true;
            return false;
        };
        
        let pairwiseBalance = 0;
        
        expenses?.forEach((expense: any) => {
            const expenseEffect = calculatePairwiseExpenseDebt(
                expense,
                userId, // Me (User leaving) - pass UserId first as it's the primary identity here
                (otherMember.friends as any)?.linked_user_id || otherMember.friend_id, // Them (User ID preferred, else Friend ID)
                memberFriendId, // My Friend ID alias
                otherMember.friend_id // Their Friend ID alias
            );
            pairwiseBalance += expenseEffect;
        });
        
        derivedTransactions.forEach((t) => {
            if (matchesMe(t.fromId) && matchesOther(t.toId)) {
                pairwiseBalance += t.amount;
            } else if (matchesOther(t.fromId) && matchesMe(t.toId)) {
                pairwiseBalance -= t.amount;
            }
        });
        
        if (Math.abs(pairwiseBalance) > BALANCE_TOLERANCE) {
            hasOutstandingBalance = true;
            break;
        }
    }
    
    if (hasOutstandingBalance) {
        return res.status(400).json({ 
            error: "Cannot leave group with outstanding balance. Please settle up first."
        });
    }


    // 3. Remove from Group Members
    const { error: deleteError } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', id)
        .eq('friend_id', memberFriendId); // Remove the friend link

    if (deleteError) return res.status(500).json({ error: deleteError.message });

    // 4. Cleanup stale data (user_balances, simplified_debts, friend breakdowns)
    await cleanupAfterMemberExit(supabase, id, userId);

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
     expense.expense_splits.forEach((split: any) => {
         const uid = split.user_id || split.friend_id;
         if (uid) {
             const paid = parseFloat(split.paid_amount || '0');
             const share = parseFloat(split.amount || '0');
             balances[uid] = (balances[uid] || 0) + (paid - share);
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
