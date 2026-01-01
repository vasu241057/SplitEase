import { SupabaseClient } from '@supabase/supabase-js';

export const recalculateBalances = async (supabase: SupabaseClient) => {
  const MAX_RETRIES = 3;
  let attempts = 0;

  while (attempts < MAX_RETRIES) {
    attempts++;
    console.log(`[DEBUG] RecalculateBalances Attempt ${attempts}/${MAX_RETRIES}`);

    // 0. CAPTURE STATE TIMESTAMP (Optimistic Lock)
    // We check the latest activity time to detect concurrent mutations during calculation.
    const { data: latestExpense } = await supabase.from('expenses').select('created_at').order('created_at', { ascending: false }).limit(1).single();
    const { data: latestTx } = await supabase.from('transactions').select('created_at').order('created_at', { ascending: false }).limit(1).single();
    
    const signatureStart = `${latestExpense?.created_at || '0'}|${latestTx?.created_at || '0'}`;

    // Map: GroupID -> Map<UserId, number> (For Group List Optimization)
    // We only track Global User IDs here, as this is for the "Your Balance" view.
    const groupUserBalances = new Map<string, Map<string, number>>();

    // Helper to add delta to deep map
    const addGroupDelta = (friendId: string, groupId: string | undefined, delta: number) => {
        if (!groupId) return; // Ignore non-group expenses for breakdown
        
        // 1. Update Friend Group Breakdown (Existing Logic)
        if (!friendGroupBalances.has(friendId)) {
            friendGroupBalances.set(friendId, new Map<string, number>());
        }
        const groupMap = friendGroupBalances.get(friendId)!;
        const current = groupMap.get(groupId) || 0;
        groupMap.set(groupId, current + delta);

        // 2. Update Group User Balances (New Logic for Groups List)
        // Resolve FriendID -> Global UserID
        const globalUserId = friendIdToLinkedUser.get(friendId);
        if (globalUserId) {
            if (!groupUserBalances.has(groupId)) {
                groupUserBalances.set(groupId, new Map<string, number>());
            }
            const userMap = groupUserBalances.get(groupId)!;
            const userCurrent = userMap.get(globalUserId) || 0;
            userMap.set(globalUserId, userCurrent + delta);
        }
    };

    // 1. Fetch all Friends (to reset and for lookups)
    const { data: friendsData, error: friendsError } = await supabase
        .from('friends')
        .select('id, owner_id, linked_user_id, group_breakdown');

    if (friendsError) {
        console.error('[DEBUG] Error fetching friends:', friendsError);
        throw friendsError;
    }

    // Map: FriendID -> Balance (Initialize to 0)
    const friendBalances = new Map<string, number>();
    // Map: FriendID -> Map<GroupId, Balance>
    const friendGroupBalances = new Map<string, Map<string, number>>();
    
    // Map: `${ownerId}:${linkedUserId}` -> FriendID (For Global-Global lookup)
    const globalFriendLookup = new Map<string, string>();
    // Map: FriendID -> LinkedUserId (For translating local friend to global user)
    const friendIdToLinkedUser = new Map<string, string>();

    friendsData.forEach((f: any) => {
        friendBalances.set(f.id, 0);
        friendGroupBalances.set(f.id, new Map<string, number>());
        if (f.owner_id && f.linked_user_id) {
            globalFriendLookup.set(`${f.owner_id}:${f.linked_user_id}`, f.id);
            // Store the mapping from friend_id to linked_user_id
            friendIdToLinkedUser.set(f.id, f.linked_user_id);
        }
    });

    // 2. Fetch Active Expenses
    const { data: expensesData, error: expensesError } = await supabase
        .from('expenses')
        .select('id, amount, payer_user_id, payer_id, group_id, description, splits:expense_splits(user_id, friend_id, amount, paid_amount, paid)')
        .eq('deleted', false);
    
    // Fetch Groups to map IDs to Names for breakdown
    const { data: groupsData } = await supabase
        .from('groups')
        .select('id, name');
        
    const groupNameMap = new Map<string, string>();
    groupsData?.forEach((g: any) => groupNameMap.set(g.id, g.name));

    if (expensesError) {
        console.error('[DEBUG] Error fetching expenses:', expensesError);
        throw expensesError;
    }

    // 3. Calculate Net Balances per Entity (User or LocalFriend)
    expensesData.forEach((expense: any) => {
        const netBalances = new Map<string, number>();
        const groupId = expense.group_id;

        // Identify Payer
        // Payer can be a Global User (payer_user_id) or Local Friend (payer_id)
        const payerId = expense.payer_user_id || expense.payer_id;
        if (!payerId) {
            return;
        }

        expense.splits.forEach((split: any) => {
            // Identity: Global User (user_id) or Local Friend (friend_id)
            // FIX: If friend_id has a linked_user_id, use that for global routing
            let personId = split.user_id;
            
            if (!personId && split.friend_id) {
                // Check if this friend has a linked global user
                const linkedUserId = friendIdToLinkedUser.get(split.friend_id);
                if (linkedUserId) {
                // Use the global user ID for proper Global-Global routing
                personId = linkedUserId;
                } else {
                // No linked user, use friend_id as local friend
                personId = split.friend_id;
                }
            }
            
            if (!personId) return;
    
            const cost = split.amount;
            const paid = split.paid_amount || (split.paid ? split.amount : 0);
            
            const current = netBalances.get(personId) || 0;
            netBalances.set(personId, current + (paid - cost));
        });
        
        // FIX: Ensure payer is always credited for the full expense amount
        // Calculate how much was already credited via paid_amount in splits
        const totalPaidInSplits = expense.splits.reduce(
            (sum: number, s: any) => sum + (s.paid_amount || 0), 
            0
        );
        
        // If paid_amount sum doesn't match expense amount, credit the difference to payer
        const unpaidAmount = expense.amount - totalPaidInSplits;
        
        if (unpaidAmount > 0.01) {
            // Credit the missing amount to the payer
            const current = netBalances.get(payerId) || 0;
            netBalances.set(payerId, current + unpaidAmount);
        }


        // 4. Simplify Debt (Debtors -> Creditors)
        const debtors: {id: string, amount: number}[] = [];
        const creditors: {id: string, amount: number}[] = [];

        netBalances.forEach((bal, id) => {
            if (bal < -0.01) debtors.push({ id, amount: bal }); // owes money
            if (bal > 0.01) creditors.push({ id, amount: bal }); // is owed money
        });

        debtors.sort((a, b) => a.amount - b.amount); // Ascending (most negative first)
        creditors.sort((a, b) => b.amount - a.amount); // Descending (most positive first)

        let i = 0; 
        let j = 0;

        while (i < debtors.length && j < creditors.length) {
            const debtor = debtors[i];
            const creditor = creditors[j];

            const transferAmount = Math.min(Math.abs(debtor.amount), creditor.amount);

            // Apply Transfer: Debtor -> Creditor
            processTransfer(debtor.id, creditor.id, transferAmount, friendBalances, globalFriendLookup, groupId, addGroupDelta);

            // Update temp calculations
            debtor.amount += transferAmount;
            creditor.amount -= transferAmount;
            
            if (Math.abs(debtor.amount) < 0.01) i++;
            if (creditor.amount < 0.01) j++;
        }
    });

    // 5. Apply Transactions (Settle Up)
    const { data: transactionsData, error: txError } = await supabase
        .from('transactions')
        .select('*, friend:friends(owner_id, linked_user_id)')
        .in('type', ['paid', 'received'])
        .eq('deleted', false);
    if (txError) {
        console.error('[DEBUG] Error fetching transactions:', txError);
        throw txError;
    }
    
    // Note: Transactions also affect group balances if group_id is present!
    // We must apply them to the breakdown as well.

    transactionsData.forEach((tx: any) => {
        const groupId = tx.group_id;
        const creatorId = tx.created_by || tx.friend?.owner_id;
        const friendLinkedUserId = tx.friend?.linked_user_id;
        const otherUserId = friendLinkedUserId || null;
        
        const creatorFriendKey = otherUserId ? `${creatorId}:${otherUserId}` : null;
        const creatorFriendId = creatorFriendKey ? globalFriendLookup.get(creatorFriendKey) : tx.friend_id;
        
        if (creatorFriendId) {
            const current = friendBalances.get(creatorFriendId) || 0;
            if (tx.type === 'paid') {
                friendBalances.set(creatorFriendId, current + tx.amount);
                addGroupDelta(creatorFriendId, groupId, tx.amount);
            } else {
                friendBalances.set(creatorFriendId, current - tx.amount);
                addGroupDelta(creatorFriendId, groupId, -tx.amount);
            }
        }
        
        if (otherUserId && creatorId) {
            const inverseKey = `${otherUserId}:${creatorId}`;
            const inverseFriendId = globalFriendLookup.get(inverseKey);
            
            if (inverseFriendId) {
                const inverseCurrent = friendBalances.get(inverseFriendId) || 0;
                if (tx.type === 'paid') {
                    friendBalances.set(inverseFriendId, inverseCurrent - tx.amount);
                    addGroupDelta(inverseFriendId, groupId, -tx.amount);
                } else {
                    friendBalances.set(inverseFriendId, inverseCurrent + tx.amount);
                    addGroupDelta(inverseFriendId, groupId, tx.amount);
                }
            }
        }
    });

    // 0. RE-VERIFY STATE TIMESTAMP
    const { data: latestExpenseCheck } = await supabase.from('expenses').select('created_at').order('created_at', { ascending: false }).limit(1).single();
    const { data: latestTxCheck } = await supabase.from('transactions').select('created_at').order('created_at', { ascending: false }).limit(1).single();
    
    const signatureEnd = `${latestExpenseCheck?.created_at || '0'}|${latestTxCheck?.created_at || '0'}`;

    if (signatureStart !== signatureEnd) {
        console.warn(`[CONCURRENCY_GUARD] Race detected! Data changed during calculation. START=${signatureStart} END=${signatureEnd}. Retrying...`);
        // Retry loop
        await new Promise(r => setTimeout(r, Math.random() * 200 + 100)); // Jitter
        continue; 
    }

    // 6. DB Updates (Only if Signature Matches)
    console.log('[BALANCE_DEBUG] Persisting updates...');
    const friendIds = Array.from(friendBalances.keys());
    const { data: currentBalancesData } = await supabase
        .from('friends')
        .select('id, balance, group_breakdown')
        .in('id', friendIds);
    
    const currentBalancesMap = new Map<string, any>();
    currentBalancesData?.forEach((f: any) => currentBalancesMap.set(f.id, f));
    
    // 6a. Update Friends
    const validUpdates = Array.from(friendBalances.entries()).map(async ([id, balance]) => {
        const finalBalance = Math.round(balance * 100) / 100;
        
        // Compute Final Breakdown JSON
        const rawBreakdown = friendGroupBalances.get(id);
        const breakdownList: { groupId: string, name: string, amount: number }[] = [];
        
        if (rawBreakdown) {
            rawBreakdown.forEach((amt, gid) => {
                if (Math.abs(amt) > 0.01) {
                    breakdownList.push({
                        groupId: gid,
                        name: groupNameMap.get(gid) || 'Unknown Group',
                        amount: Math.round(amt * 100) / 100
                    });
                }
            });
        }
        // Invariant Check (Optional but recommended): Sum(Breakdown) ~= Balance (modulo non-group expenses)
        // Wait, non-group expenses are NOT in the breakdown. So Sum != Balance necessarily.
        // Friend Balance = Sum(Group Balances) + Sum(Non-Group Balances)
        // Correct.
        
        const currentRecord = currentBalancesMap.get(id);
        const oldBalance = currentRecord?.balance || 0;
        const oldBreakdownJSON = JSON.stringify(currentRecord?.group_breakdown || []);
        const newBreakdownJSON = JSON.stringify(breakdownList);

        const balanceChanged = Math.abs(finalBalance - oldBalance) > 0.001;
        const breakdownChanged = oldBreakdownJSON !== newBreakdownJSON;
        
        if (balanceChanged || breakdownChanged) { 
             await supabase.from('friends').update({ 
                 balance: finalBalance,
                 group_breakdown: breakdownList 
             }).eq('id', id);
        }
    });

    // 6b. Update Groups (New Persistence)
    const groupUpdates = Array.from(groupUserBalances.entries()).map(async ([groupId, userMap]: [string, Map<string, number>]) => {
        const userBalancesObj: Record<string, number> = {};
        userMap.forEach((amt: number, uid: string) => {
            if (Math.abs(amt) > 0.01) {
                userBalancesObj[uid] = Math.round(amt * 100) / 100;
            }
        });
        
        // Optimistic check could be added here similar to friends, but for now blind update is safe-ish
        // for the "Single Source of Truth" goal.
        await supabase.from('groups').update({
            user_balances: userBalancesObj
        }).eq('id', groupId);
    });
    
    await Promise.all([...validUpdates, ...groupUpdates]);
    console.log('[BALANCE_DEBUG] Persistence Complete.');
    return; // Success, exit loop
  }
  
  console.error(`[CONCURRENCY_GUARD] Failed to settle balances after ${MAX_RETRIES} attempts due to high contention.`);
};

// Helper to routing debt updates
function processTransfer(
  debtorId: string, 
  creditorId: string, 
  amount: number, 
  friendBalances: Map<string, number>,
  globalLookup: Map<string, string>,
  groupId: string | undefined,
  addGroupDelta: (fid: string, gid: string | undefined, delta: number) => void
) {
  const isDebtorLocal = friendBalances.has(debtorId);
  const isCreditorLocal = friendBalances.has(creditorId);

  // Case 1: Global User A owes Global User B
  if (!isDebtorLocal && !isCreditorLocal) {
    // Debtor (A) -> Creditor (B)
    const friendRecordForB = globalLookup.get(`${debtorId}:${creditorId}`);
    if (friendRecordForB) {
      friendBalances.set(friendRecordForB, (friendBalances.get(friendRecordForB) || 0) - amount);
      addGroupDelta(friendRecordForB, groupId, -amount); 
    }
    
    // In B's Friend List: Find A. Update A's balance += Amount (A owes B).
    const friendRecordForA = globalLookup.get(`${creditorId}:${debtorId}`);
    if (friendRecordForA) {
      friendBalances.set(friendRecordForA, (friendBalances.get(friendRecordForA) || 0) + amount);
      addGroupDelta(friendRecordForA, groupId, amount);
    }
    return;
  }

  // Case 2: Local Friend F owes Global User A
  if (isDebtorLocal && !isCreditorLocal) {
     const friendId = debtorId;
     const current = friendBalances.get(friendId) || 0;
     friendBalances.set(friendId, current + amount);
     addGroupDelta(friendId, groupId, amount);
     return;
  }

  // Case 3: Global User A owes Local Friend F
  if (!isDebtorLocal && isCreditorLocal) {
     const friendId = creditorId;
     const current = friendBalances.get(friendId) || 0;
     friendBalances.set(friendId, current - amount);
     addGroupDelta(friendId, groupId, -amount);
     return;
  }

  // Case 4: Local F owes Local G?
  // Ignore for now.
}
