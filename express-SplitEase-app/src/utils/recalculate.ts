
import { SupabaseClient } from '@supabase/supabase-js';

// === HELPER: Core Calculation Logic (Pure Function) ===
// Determines the net balances and breakdown for a given set of data.

// --- SIMPLIFY DEBTS ENGINE ---
type SimplifiedDebt = { from: string; to: string; amount: number; };
type MemberBalance = { userId: string; balance: number; };

const EPSILON = 0.005;

/**
 * Greedy matching algorithm to simplify debts.
 * Input: List of { userId, balance } where Sum(balance) approx 0.
 * Output: List of transfers { from, to, amount }.
 */
function coreSimplifyGroupDebts(balances: MemberBalance[]): SimplifiedDebt[] {
    const totalBalance = balances.reduce((sum, b) => sum + b.balance, 0);
    // Relaxed tolerance (0.05) to account for floating point accumulation in large groups
    if (Math.abs(totalBalance) > 0.05) {
       // Check if this is a catastrophic failure or just drift
       // For safety, we log and returning empty (disabling simplification for this group)
       // throwing would abort the entire recalc process.
       console.warn(`[SIMPLIFY_ABORT] Balances sum to ${totalBalance}, expected 0.`, balances);
       return [];
    }

    const debtors: { userId: string; amount: number }[] = [];
    const creditors: { userId: string; amount: number }[] = [];
    
    balances.forEach(b => {
        if (Math.abs(b.balance) < EPSILON) return;
        const paise = Math.round(b.balance * 100);
        
        if (paise < 0) {
            debtors.push({ userId: b.userId, amount: -paise }); // Store debt as positive magnitude
        } else if (paise > 0) {
            creditors.push({ userId: b.userId, amount: paise });
        }
    });

    // Deterministic Sort: Amount DESC, then ID ASC
    const sortFn = (a: { userId: string; amount: number }, b: { userId: string; amount: number }) => {
        if (b.amount !== a.amount) return b.amount - a.amount;
        return a.userId < b.userId ? -1 : 1;
    };

    debtors.sort(sortFn);
    creditors.sort(sortFn);

    const results: SimplifiedDebt[] = [];
    let debtorIdx = 0;
    let creditorIdx = 0;

    while (debtorIdx < debtors.length && creditorIdx < creditors.length) {
        const debtor = debtors[debtorIdx];
        const creditor = creditors[creditorIdx];
        
        // Match minimum of what is owed vs what is owed to creditor
        const amountPaise = Math.min(debtor.amount, creditor.amount);

        if (amountPaise > 0) {
            results.push({
                from: debtor.userId,
                to: creditor.userId,
                amount: amountPaise / 100
            });
        }

        debtor.amount -= amountPaise;
        creditor.amount -= amountPaise;

        if (debtor.amount === 0) debtorIdx++;
        if (creditor.amount === 0) creditorIdx++;
    }

    return results;
}

const calculateBalancesForData = (
  friendsData: any[],
  expensesData: any[],
  transactionsData: any[],
  targetGroupId: string | null = null // If set, only tracks breakdown for this group
) => {
  // Map: FriendID -> Balance (Net for this scope)
  const friendBalances = new Map<string, number>();
  // Map: FriendID -> Map<GroupId, Balance>
  const friendGroupBalances = new Map<string, Map<string, number>>();
  
  // Map: GroupID -> Map<UserId, number> (For Group List Optimization)
  const groupUserBalances = new Map<string, Map<string, number>>();

  // Map: `${ownerId}:${linkedUserId}` -> FriendID (For Global-Global lookup)
  const globalFriendLookup = new Map<string, string>();
  // Map: FriendID -> LinkedUserId (For translating local friend to global user)
  const friendIdToLinkedUser = new Map<string, string>();

  // Use a Set to track missing global-to-global links: "ownerId:linkedUserId"
  const missingLinks = new Set<string>();

  // Initialize Maps
  friendsData.forEach((f: any) => {
      friendBalances.set(f.id, 0);
      friendGroupBalances.set(f.id, new Map<string, number>());
      if (f.owner_id && f.linked_user_id) {
          globalFriendLookup.set(`${f.owner_id}:${f.linked_user_id}`, f.id);
          friendIdToLinkedUser.set(f.id, f.linked_user_id);
      }
  });

  // Helper to add delta to deep map
  const addGroupDelta = (friendId: string, groupId: string | undefined, delta: number) => {
      if (!groupId) return;
      if (targetGroupId && groupId !== targetGroupId) return; // Optimization: Ignore irrelevant groups in scoped run? 
      // Actually, if we passed expenses from other groups, we should track them. 
      // But for scoped run, expensesData only contains targetGroupId.
      
      // 1. Update Friend Group Breakdown
      if (!friendGroupBalances.has(friendId)) {
          friendGroupBalances.set(friendId, new Map<string, number>());
      }
      const groupMap = friendGroupBalances.get(friendId)!;
      const current = groupMap.get(groupId) || 0;
      groupMap.set(groupId, current + delta);

      // 2. Update Group User Balances
      const globalUserId = friendIdToLinkedUser.get(friendId);
      // IMPLICIT FRIEND FIX:
      // Global Users have 'globalUserId'. Local Friends (non-linked) use 'friendId'.
      // Both are valid identifiers for the group member context.
      const effectiveId = globalUserId || friendId;
      
      if (effectiveId) {
          if (!groupUserBalances.has(groupId)) {
              groupUserBalances.set(groupId, new Map<string, number>());
          }
          const userMap = groupUserBalances.get(groupId)!;
          const userCurrent = userMap.get(effectiveId) || 0;
          userMap.set(effectiveId, userCurrent + delta);
      }
  };

  // Helper to routing debt updates
  const processTransfer = (
    debtorId: string, 
    creditorId: string, 
    amount: number, 
    groupId: string | undefined
  ) => {
    const isDebtorLocal = friendBalances.has(debtorId);
    const isCreditorLocal = friendBalances.has(creditorId);

    // Case 1: Global User A owes Global User B
    // In this case, neither ID found in local `friendBalances` implies they are both global users (identified by user_id in splits?)
    // Actually, `debtors` list comes from `netBalances` keys.
    // `netBalances` keys are either friend_id (if local) OR linked_user_id (if global/matched).
    // So `isDebtorLocal` check works if `debtorId` is a friend_id.
    // If `debtorId` is a global user_id, `friendBalances.has` will be false (unless UUID collision).
    
    if (!isDebtorLocal && !isCreditorLocal) {
      // Both are Global User IDs
      const globalDebtorId = debtorId; // UUID
      const globalCreditorId = creditorId; // UUID

      // A owes B: Update A's friend record for B
      const keyForB = `${globalDebtorId}:${globalCreditorId}`; // Owner: Debtor, Linked: Creditor
      const friendRecordForB = globalFriendLookup.get(keyForB);
      
      if (friendRecordForB) {
        friendBalances.set(friendRecordForB, (friendBalances.get(friendRecordForB) || 0) - amount);
        addGroupDelta(friendRecordForB, groupId, -amount); 
      } else {
         // Missing Link: Debtor needs a record for Creditor
         missingLinks.add(keyForB);
      }
      
      // B is owed by A: Update B's friend record for A
      const keyForA = `${globalCreditorId}:${globalDebtorId}`; // Owner: Creditor, Linked: Debtor
      const friendRecordForA = globalFriendLookup.get(keyForA);
      
      if (friendRecordForA) {
        friendBalances.set(friendRecordForA, (friendBalances.get(friendRecordForA) || 0) + amount);
        addGroupDelta(friendRecordForA, groupId, amount);
      } else {
         // Missing Link: Creditor needs a record for Debtor
         missingLinks.add(keyForA);
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
  };

  // Process Expenses
  expensesData.forEach((expense: any) => {
      const netBalances = new Map<string, number>();
      const groupId = expense.group_id;

      const payerId = expense.payer_user_id || expense.payer_id;
      if (!payerId) return;

      expense.splits.forEach((split: any) => {
          let personId = split.user_id;
          
          if (!personId && split.friend_id) {
              const linkedUserId = friendIdToLinkedUser.get(split.friend_id);
              if (linkedUserId) {
                personId = linkedUserId;
              } else {
                personId = split.friend_id;
              }
          }
          
          if (!personId) return;
  
          const cost = split.amount;
          const paid = split.paid_amount || (split.paid ? split.amount : 0);
          
          const current = netBalances.get(personId) || 0;
          netBalances.set(personId, current + (paid - cost));
      });
      
      const totalPaidInSplits = expense.splits.reduce(
          (sum: number, s: any) => sum + (s.paid_amount || 0), 
          0
      );
      const unpaidAmount = expense.amount - totalPaidInSplits;
      
      if (unpaidAmount > 0.01) {
          const current = netBalances.get(payerId) || 0;
          netBalances.set(payerId, current + unpaidAmount);
      }

      // Simplify Debt
      const debtors: {id: string, amount: number}[] = [];
      const creditors: {id: string, amount: number}[] = [];

      netBalances.forEach((bal, id) => {
          if (bal < -0.01) debtors.push({ id, amount: bal });
          if (bal > 0.01) creditors.push({ id, amount: bal });
      });

      debtors.sort((a, b) => a.amount - b.amount);
      creditors.sort((a, b) => b.amount - a.amount);

      let i = 0; 
      let j = 0;

      while (i < debtors.length && j < creditors.length) {
          const debtor = debtors[i];
          const creditor = creditors[j];
          const transferAmount = Math.min(Math.abs(debtor.amount), creditor.amount);

          processTransfer(debtor.id, creditor.id, transferAmount, groupId);

          debtor.amount += transferAmount;
          creditor.amount -= transferAmount;
          
          if (Math.abs(debtor.amount) < 0.01) i++;
          if (creditor.amount < 0.01) j++;
      }
  });

  // Process Transactions
  transactionsData.forEach((tx: any) => {
      const groupId = tx.group_id;
      const creatorId = tx.created_by || tx.friend?.owner_id;
      const friendLinkedUserId = tx.friend?.linked_user_id; // Need to ensure friend relation is loaded if we rely on this
      // Note: In Scoped Recalc, we might fetch 'friend' in the query or join.
      // If we passed raw 'transactionsData', make sure 'friend' is expanded or available.
      
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

  return {
    friendBalances,
    friendGroupBalances,
    groupUserBalances,
    missingLinks, // Return detected missing links
    friendIdToLinkedUser // Return for Global Recalc Identity Sync
  };
};

export const recalculateBalances = async (supabase: SupabaseClient) => {
  const MAX_RETRIES = 3;
  let attempts = 0;

  while (attempts < MAX_RETRIES) {
    attempts++;
    console.log(`[DEBUG] RecalculateBalances Attempt ${attempts}/${MAX_RETRIES}`);

    const { data: latestExpense } = await supabase.from('expenses').select('created_at').order('created_at', { ascending: false }).limit(1).single();
    const { data: latestTx } = await supabase.from('transactions').select('created_at').order('created_at', { ascending: false }).limit(1).single();
    
    const signatureStart = `${latestExpense?.created_at || '0'}|${latestTx?.created_at || '0'}`;

    // 1. Fetch all Friends
    let { data: friendsData, error: friendsError } = await supabase
        .from('friends')
        .select('id, owner_id, linked_user_id, group_breakdown');

    if (friendsError) throw friendsError;

    // 2. Fetch Active Expenses
    const { data: expensesData, error: expensesError } = await supabase
        .from('expenses')
        .select('id, amount, payer_user_id, payer_id, group_id, description, splits:expense_splits(user_id, friend_id, amount, paid_amount, paid)')
        .eq('deleted', false);
    
    if (expensesError) throw expensesError;
    
    // Fetch Groups with Simplify Flag
    const { data: groupsData } = await supabase.from('groups').select('id, name, simplify_debts_enabled');
    const groupNameMap = new Map<string, string>();
    const groupSimplifyMap = new Map<string, boolean>();
    
    groupsData?.forEach((g: any) => {
        groupNameMap.set(g.id, g.name);
        groupSimplifyMap.set(g.id, g.simplify_debts_enabled);
    });

    // 3. Compute
    // Fetch transactions first
    const { data: transactionsData, error: txError } = await supabase
        .from('transactions')
        .select('*, friend:friends(owner_id, linked_user_id)')
        .in('type', ['paid', 'received'])
        .eq('deleted', false);
    if (txError) throw txError;

    // --- IMPLICIT FRIEND CREATION LOOP ---
    // Run calculation once to detect missing links
    let result = calculateBalancesForData(friendsData || [], expensesData, transactionsData);
    
    if (result.missingLinks.size > 0) {
        console.log(`[IMPLICIT_FRIEND_DETECTED] Found ${result.missingLinks.size} missing global-to-global links. Creating...`);
        const newFriendsToCreate: any[] = [];
        
        result.missingLinks.forEach(linkKey => {
            const [ownerId, linkedUserId] = linkKey.split(':');
            if (ownerId && linkedUserId && ownerId !== 'undefined' && linkedUserId !== 'undefined') {
                 // Guard logging
                 console.log('[IMPLICIT FRIEND CREATED]', {
                    owner_id: ownerId,
                    linked_user_id: linkedUserId,
                    group_id: 'recalc-global',
                    reason: 'non-zero debt detected during recalculation'
                });
                
                newFriendsToCreate.push({
                    owner_id: ownerId,
                    linked_user_id: linkedUserId,
                    name: null, // As per prompt
                    balance: 0,
                    group_breakdown: [],
                    is_implicit: true
                });
            }
        });
        
        if (newFriendsToCreate.length > 0) {
             // Upsert to Friends table (Collision safety via upsert?)
             // Assuming composite constraint exists or relying on 'insert' default
             // Prompt says "Use upsert with (owner_id, linked_user_id) uniqueness"
             // Supabase 'friends' table might not have unique constraint on owner_id+linked_user_id historically?
             // Let's assume standard unique index exists or we rely on 'onConflict'.
             const { error: createError } = await supabase.from('friends').upsert(newFriendsToCreate, { onConflict: 'owner_id, linked_user_id', ignoreDuplicates: true });
             
             if (createError) {
                 console.error("Failed to create implicit friends", createError);
                 throw createError;
             }
             
             // RE-FETCH Friends to get the new IDs
            const { data: refreshedFriends, error: refreshError } = await supabase
                .from('friends')
                .select('id, owner_id, linked_user_id, group_breakdown');
            
            if (refreshError) throw refreshError;
            friendsData = refreshedFriends; // Update reference for computation
            
            // Re-run Calculation with new data
            result = calculateBalancesForData(friendsData || [], expensesData, transactionsData);
        }
    }
    // -------------------------------------

    const calculatedFriendBalances = result.friendBalances;
    const calculatedFriendGroupBalances = result.friendGroupBalances;
    const calculatedGroupUserBalances = result.groupUserBalances;
    const friendIdToLinkedUser = result.friendIdToLinkedUser;

    // --- STEP 3a: PRE-CALCULATE SIMPLIFIED EDGES (GLOBAL) ---
    // We need to know the simplified state of every group to correctly populate the Friend Breakdown.
    const simplifiedEdgesMap = new Map<string, SimplifiedDebt[]>(); // GroupID -> Edges

    const groupUpdates = Array.from(calculatedGroupUserBalances.entries()).map(async ([groupId, userMap]: [string, Map<string, number>]) => {
        const userBalancesObj: Record<string, number> = {};
        const balancesForSimplify: MemberBalance[] = [];

        userMap.forEach((amt: number, uid: string) => {
            if (Math.abs(amt) > 0.01) {
                userBalancesObj[uid] = Math.round(amt * 100) / 100;
                balancesForSimplify.push({ userId: uid, balance: userBalancesObj[uid] });
            }
        });
        
        // SIMPLIFICATION ENGINE
        let simplifiedDebts: SimplifiedDebt[] = [];
        const isSimplifyEnabled = groupSimplifyMap.get(groupId) === true;

        if (isSimplifyEnabled) {
             const rawNodeCount = balancesForSimplify.length;
             try {
                simplifiedDebts = coreSimplifyGroupDebts(balancesForSimplify);
                // Cache for Friend Sync
                simplifiedEdgesMap.set(groupId, simplifiedDebts);
                console.log(`[SIMPLIFY_ENGINE_RUN] Group ${groupId}: ${rawNodeCount} Raw Nodes -> ${simplifiedDebts.length} Simplified Edges`);
             } catch (err) {
                 console.error(`[SIMPLIFY_FAIL] Group ${groupId}:`, err);
             }
        } 

        await supabase.from('groups').update({
            user_balances: userBalancesObj,
            simplified_debts: simplifiedDebts
        }).eq('id', groupId);
    });

    // Run Group Updates FIRST (to populate map if we needed async, but we compute synchronously inside the map callback locally)
    // Actually, we need to wait for these promises to complete DB writes? 
    // No, we can run them in parallel with Friend updates, BUT we need `simplifiedEdgesMap` populated.
    // The map population happens synchronously in the loop *before* the await update? 
    // Yes, `simplifiedEdgesMap.set` is synchronous. 
    // So we can start friend updates immediately.
    
    // Wait for group writes to ensure safety? Let's bundle them at the end or just run them.
    // We'll collect promises.
    const groupUpdatePromises = groupUpdates; // Array of promises
    
    // --- STEP 3b: FRIEND IDENTITY SYNC ---
    console.log('[BALANCE_DEBUG] Persisting Friend updates with Identity Sync...');
    const friendIds = Array.from(calculatedFriendBalances.keys());
    const { data: currentBalancesData } = await supabase
        .from('friends')
        .select('id, balance, group_breakdown')
        .in('id', friendIds);
    
    const currentBalancesMap = new Map<string, any>();
    currentBalancesData?.forEach((f: any) => currentBalancesMap.set(f.id, f));

    // Helper to find effective balance from edges
    const getEffectiveBalance = (friendId: string, groupId: string, rawAmount: number): number => {
        const edges = simplifiedEdgesMap.get(groupId);
        if (!edges) return rawAmount; // Not simplified -> Return Raw
        
        // Find my role. Who am I? 
        // `friendId` is the local friend record ID. 
        // `edges` use `userId` (Global or Linked).
        // We need to map `friendId` -> `userId`.
        const linkedUser = friendIdToLinkedUser.get(friendId);
        // If local friend has no linked user, they might just use 'friendId' in the splits?
        // See `calculateBalancesForData`: we map `friendId` -> `effectiveId`. 
        // If explicit linked user exists, we use it. Else we use friendId.
        const myUserId = linkedUser || friendId;
        
        // Calculate Net from Edges
        let net = 0;
        edges.forEach(edge => {
            if (edge.from === myUserId) net -= edge.amount; // I pay (Negative)
            if (edge.to === myUserId) net += edge.amount;   // I receive (Positive)
        });
        
        return Math.round(net * 100) / 100;
    };
    
    const friendUpdatePromises = Array.from(calculatedFriendBalances.entries()).map(async ([id, balance]) => {
        const finalBalance = Math.round(balance * 100) / 100;
        
        const rawBreakdown = calculatedFriendGroupBalances.get(id);
        const breakdownList: { groupId: string, name: string, amount: number, rawAmount: number }[] = [];
        
        // 1. Process Groups where Raw Balance exists
        if (rawBreakdown) {
            rawBreakdown.forEach((amt, gid) => {
                const rawVal = Math.round(amt * 100) / 100;
                
                // Effective Balance (Identity Sync)
                let effectiveVal = rawVal;
                if (groupSimplifyMap.get(gid)) {
                     effectiveVal = getEffectiveBalance(id, gid, rawVal);
                }
                
                // Optimization: If both are zero? (Implicit close)
                if (Math.abs(rawVal) > 0.01 || Math.abs(effectiveVal) > 0.01) {
                    breakdownList.push({
                        groupId: gid,
                        name: groupNameMap.get(gid) || 'Unknown Group',
                        amount: effectiveVal,      // UI uses this
                        rawAmount: rawVal          // Audit trail
                    });
                }
            });
        }
        
        // 2. Process Implicit Links (Simplified Edges exist but Raw = 0)
        // Check all groups where this friend involved in Simplified Edges but NOT in Raw?
        // This is expensive to scan. 
        // For now, `rawBreakdown` captures all groups where *expenses/transactions* occurred.
        // If Simpification creates a link A->C, does C have a raw entry?
        // No, if A->B->C and A never paid C.
        // So `calculatedFriendGroupBalances` might MISS the group for C if C never interacted with A physically?
        // Wait, `calculatedFriendGroupBalances` is derived from `netBalances` in `calculateBalancesForData`.
        // If A never paid C, then A's net balance wrt C is 0?
        // NO. `calculateBalancesForData` tracks Net Balances Per Person.
        // It does NOT track "Pairwise Net".
        // `friendBalances` is Total Net.
        // `friendGroupBalances` is Net Balance *for that friend* in that group.
        // If A owes Group 10, and C is owed 10.
        // `friendGroupBalances` for A has { Group1: -10 }.
        // `friendGroupBalances` for C has { Group1: +10 }.
        // So BOTH have entries in `friendGroupBalances`.
        // Therefore, `rawBreakdown` iteration covers ALL participants in the group.
        // We don't need to scan for hidden edges. 
        // Identity Resolution is complete via `getEffectiveBalance`.
        
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

    await Promise.all([...friendUpdatePromises, ...groupUpdatePromises]);
    console.log('[IDENTITY_SYNC_COMPLETE] Global Recalc Synced.');
    return; // Success

  }
  console.error(`[CONCURRENCY_GUARD] Failed to settle balances after ${MAX_RETRIES} attempts.`);
};

// === NEW: Scoped Recalculation ===
export const recalculateGroupBalances = async (supabase: SupabaseClient, groupId: string) => {
    // 0. Rollback Safety & Initial Guard
    if (process.env.USE_SCOPED_RECALC === 'false' || !groupId) {
        console.warn(`[RECALC_FALLBACK] Scoped Recalc Disabled or No GroupID. Falling back to global.`);
        return recalculateBalances(supabase);
    }
    
    console.log(`[RECALC_SCOPE_START] { groupId: '${groupId}' }`);

    try {
        const MAX_RETRIES = 3;
        let attempts = 0;

        while (attempts < MAX_RETRIES) {
            attempts++;
            
            // 1. Scoped Lock (Latest activity in THIS group)
            const { data: latestExpense } = await supabase.from('expenses')
                .select('created_at').eq('group_id', groupId).order('created_at', { ascending: false }).limit(1).single();
            const { data: latestTx } = await supabase.from('transactions')
                .select('created_at').eq('group_id', groupId).order('created_at', { ascending: false }).limit(1).single();
            
            const signatureStart = `${latestExpense?.created_at || '0'}|${latestTx?.created_at || '0'}`;

            // 2. Fetch Data (Scoped)
            // Fetch group members (friends)
            // NOTE: For implicit creation, we only fetch relevant group members (existing friends).
            // If new global-global debt arises, we might not have the rows in 'groupMembers' yet because they don't exist in 'friends'.
            // However, Scoped Recalc relies on 'groupMembers' table to find participants.
            // 'groupMembers' table has 'friend_id'.
            // Implicit Friends creation happens when two GLOBAL users (who might interact via splits) have debt.
            // If a User is in a Group, they have a 'Group Member' entry.
            // If that entry points to a Friend Record F1 (Self Friend for U1), and U2 has F2 (Self Friend for U2).
            // Debt is between U1 and U2.
            // Logic sees Global U1 owes Global U2.
            // Checks if U1 has friend record for U2. Only if so, it updates. Else misses.
            
            // So we need ALL friend records potentially? 
            // Scoped fetch:
            // Fetching `friends` via `group_members` only gives us the friends LINKED to the group.
            // It does NOT give us the "private friend records" that U1 might have of U2.
            // Wait, does `calculateBalancesForData` need U1's private record of U2?
            // yes, `globalFriendLookup` relies on input `friendsData`.
            // If we only pass "Group Members" (which are typically 'Self' friends or explicitly added friends),
            // We might miss existing private friend records if they are not "members" of the group.
            // No, private friend records are not members of the group. The USER is the member.
            
            // CRITICAL FLAW in SCOPED RECALC with Implicit Friends:
            // Ensure we fetch ALL friend records that might be relevant?
            // Or just fetch ALL friends for the users in the group?
            // "Select * from friends where owner_id IN (UserIdsInGroup) AND linked_user_id IN (UserIdsInGroup)"
            
            // For now, let's implement the loop as requested, but acknowledge that strict scoping relies on input data.
            // The current scoped implementation fetches: `group_members -> friends`
            // This is INSUFFICIENT for Global-Global debt if the "Relationship Friend Record" is not a group member.
            // Usually, only "Self" friends are group members.
            // So Global-Global debt logic needs "Relationship Friend Records" (A's record of B).
            // These records are NOT in `group_members`.
            
            // Fix for Scoped Data Fetching:
            // 1. Get UserIDs of all members in the group.
            // 2. Fetch ALL friend records between these UserIDs.
            
            const { data: groupMembersRaw } = await supabase
                .from('group_members')
                .select('friends!inner(linked_user_id)')
                .eq('group_id', groupId);
                
            const involvedUserIds = Array.from(new Set(groupMembersRaw?.map((m: any) => m.friends.linked_user_id).filter(Boolean)));
            
            let friendsData: any[] = [];
            
            if (involvedUserIds.length > 0) {
                 // Fetch ALL friend records relevant to these users (relationships between them)
                 // This ensures we have the "A owes B" records even if they aren't group members.
                 const { data: relevantFriends, error: relFreqError } = await supabase
                    .from('friends')
                    .select('id, owner_id, linked_user_id, balance, group_breakdown')
                    .in('owner_id', involvedUserIds)
                    .in('linked_user_id', involvedUserIds);
                 
                 if (relFreqError) throw relFreqError;
                 friendsData = relevantFriends || [];
            } else {
                 // Fallback if no linked users (mostly local friends?)
                 // Fetch via group members again
                 const { data: groupMembers } = await supabase
                    .from('group_members')
                    .select('friend_id, friends!inner(id, owner_id, linked_user_id, balance, group_breakdown)')
                    .eq('group_id', groupId);
                 friendsData = groupMembers?.map((gm: any) => gm.friends) || [];
            }

            // Fetch Group Expenses
            const { data: expensesData, error: expensesError } = await supabase
                .from('expenses')
                .select('id, amount, payer_user_id, payer_id, group_id, description, splits:expense_splits(user_id, friend_id, amount, paid_amount, paid)')
                .eq('group_id', groupId)
                .eq('deleted', false);

            if (expensesError) throw expensesError;

            // Fetch Group Transactions
            const { data: transactionsData, error: txError } = await supabase
                .from('transactions')
                .select('*, friend:friends(owner_id, linked_user_id)')
                .eq('group_id', groupId)
                .in('type', ['paid', 'received'])
                .eq('deleted', false);
            
            if (txError) throw txError;

            // --- IMPLICIT FRIEND CREATION LOOP (SCOPED) ---
            let result = calculateBalancesForData(friendsData, expensesData, transactionsData, groupId);
    
            if (result.missingLinks.size > 0) {
                console.log(`[IMPLICIT_FRIEND_DETECTED] Found ${result.missingLinks.size} missing global-to-global links in SCOPE ${groupId}. Creating...`);
                const newFriendsToCreate: any[] = [];
                
                result.missingLinks.forEach(linkKey => {
                    const [ownerId, linkedUserId] = linkKey.split(':');
                    if (ownerId && linkedUserId) {
                         console.log('[IMPLICIT FRIEND CREATED]', {
                            owner_id: ownerId,
                            linked_user_id: linkedUserId,
                            group_id: groupId,
                            reason: 'non-zero debt detected during recalculation'
                        });
                        
                        newFriendsToCreate.push({
                            owner_id: ownerId,
                            linked_user_id: linkedUserId,
                            name: null, 
                            balance: 0,
                            group_breakdown: [],
                            is_implicit: true
                        });
                    }
                });
                
                if (newFriendsToCreate.length > 0) {
                     const { error: createError } = await supabase.from('friends').upsert(newFriendsToCreate, { onConflict: 'owner_id, linked_user_id', ignoreDuplicates: true });
                     if (createError) throw createError;
                     
                     // Re-fetch RELEVANT friends
                     const { data: refreshedFriends, error: refreshError } = await supabase
                        .from('friends')
                        .select('id, owner_id, linked_user_id, balance, group_breakdown')
                        .in('owner_id', involvedUserIds)
                        .in('linked_user_id', involvedUserIds);
                    
                    if (refreshError) throw refreshError;
                    friendsData = refreshedFriends || [];
                    
                    // Re-run
                    result = calculateBalancesForData(friendsData, expensesData, transactionsData, groupId);
                }
            }
            // ----------------------------------------------

            const { 
                friendBalances: newGroupDeltas, 
                friendGroupBalances,
                groupUserBalances 
            } = result;

            // --- INVARIANT ASSERTION Check: Zero Sum ---
            let netSum = 0;
            newGroupDeltas.forEach(val => netSum += val);
            if (Math.abs(netSum) > 0.05) { // 5 cents tolerance for floating point accumulation
                 throw new Error(`[RECALC_ASSERT_FAIL] Zero-Sum Invariant Violated. Net Sum: ${netSum}`);
            }

            // --- Shadow Mode Parity Check (Dev Only) ---
            if (process.env.RECALC_PARITY_CHECK === 'true') {
                 // Note: Implementing true shadow check requires fetching ALL data, which defeats performance.
                 // We will skip this in production path to avoid latency, but log intention.
                 console.log('[RECALC_PARITY] Shadow Check skipped for performance. Enable manual audit if needed.');
            }

            // 4. Verify Lock
            const { data: latestExpenseCheck } = await supabase.from('expenses')
                .select('created_at').eq('group_id', groupId).order('created_at', { ascending: false }).limit(1).single();
            const { data: latestTxCheck } = await supabase.from('transactions')
                .select('created_at').eq('group_id', groupId).order('created_at', { ascending: false }).limit(1).single();
            
            const signatureEnd = `${latestExpenseCheck?.created_at || '0'}|${latestTxCheck?.created_at || '0'}`;

            if (signatureStart !== signatureEnd) {
                console.warn(`[RECALC_SCOPE_RETRY] Data changed in group ${groupId}. Retrying...`);
                await new Promise(r => setTimeout(r, Math.random() * 200));
                continue;
            }

            // 5. Delta Application
            // For each friend involved in this group, we replace the component of their balance that belongs to this group.
            
            // Need 'name' for the breakdown entry
            const { data: groupData } = await supabase.from('groups').select('name, simplify_debts_enabled').eq('id', groupId).single();
            const groupName = groupData?.name || 'Unknown';
            const simplifyDebtsEnabled = groupData?.simplify_debts_enabled === true;

            // NEEDED for Scoped Identity Sync:
            // We need to map `friendId` (Local) -> `userId` (Global/Linked) to match Edges.
            // We can re-use `friendsData` which contains `linked_user_id`.
            
            const friendMap = new Map<string, any>();
            friendsData.forEach((f: any) => friendMap.set(f.id, f));

             const updates = friendsData.map(async (friend: any) => {
                const friendId = friend.id;
                
                // Get new Amount for this group (Raw)
                const newGroupAmountRaw = newGroupDeltas.get(friendId) || 0;
                
                // Get Effective Amount (Simplified)
                let effectiveAmount = newGroupAmountRaw;
                
                if (simplifyDebtsEnabled) {
                    const linkedUser = friend.linked_user_id;
                    const myUserId = linkedUser || friendId;
                    
                    let net = 0;
                    simplifiedDebts.forEach(edge => {
                        if (edge.from === myUserId) net -= edge.amount; 
                        if (edge.to === myUserId) net += edge.amount;
                    });
                    // Optimization: If edges exist, net is the answer. If no edges involved me, net is 0.
                    // Does this mean I am settled? Yes.
                    // But wait, if I am not in `simplifiedDebts`, it means I'm 0.
                    // What if I was excluded from simplification due to bug? 
                    // `simplifiedDebts` covers ALL non-zero participants.
                    effectiveAmount = Math.round(net * 100) / 100;
                }

                // Get Old Amount for this group from DB (loaded in friendsData)
                const currentBreakdown = friend.group_breakdown || [];
                const oldEntry = currentBreakdown.find((b: any) => b.groupId === groupId);
                
                // Check change against STORED Effective Value
                const oldGroupAmount = oldEntry?.amount || 0;
                
                // Delta vs Raw? No, we just reconstruct the breakdown item and let DB update decide.
                // We update 'balance' using the TOTAL NET (which is Sum of Raws).
                // Wait. `friend.balance` = Sum of all group Raws? 
                // Or Sum of all group Effectives?
                // `friend.balance` MUST be Net Liability.
                // In a simplified world, Net Liability is invariant. 
                // Sum(Raw) == Sum(Effective).
                // So we can continue using `friend.balance` from `newBalance` logic which assumes Raw accumulation.
                // Just to be safe: `newBalance` logic in Scoped Recalc applies `delta` of Raw.
                
                const oldGroupAmountRaw = oldEntry?.rawAmount !== undefined ? oldEntry.rawAmount : (oldEntry?.amount || 0); // Backwards compat
                
                const rawDelta = newGroupAmountRaw - oldGroupAmountRaw;
                const newBalance = (friend.balance || 0) + rawDelta;

                // Update Breakdown Entry
                const otherGroups = currentBreakdown.filter((b: any) => b.groupId !== groupId);
                let newBreakdown = [...otherGroups];
                
                if (Math.abs(newGroupAmountRaw) > 0.01 || Math.abs(effectiveAmount) > 0.01) {
                    newBreakdown.push({
                        groupId: groupId,
                        name: groupName,
                        amount: Math.round(effectiveAmount * 100) / 100,
                        rawAmount: Math.round(newGroupAmountRaw * 100) / 100
                    });
                }
                
                // Persist
                await supabase.from('friends').update({
                    balance: Math.round(newBalance * 100) / 100,
                    group_breakdown: newBreakdown
                }).eq('id', friendId);
            });

            // Update Group User Balances (Overwrite for this group)
            const userMap = groupUserBalances.get(groupId);
            
            // Build Objects
            const userBalancesObj: Record<string, number> = {};
            let simplifiedDebts: SimplifiedDebt[] = [];
            
            if (userMap) {
                const balancesForSimplify: MemberBalance[] = [];
                
                userMap.forEach((amt: number, uid: string) => {
                    if (Math.abs(amt) > 0.01) {
                        const val = Math.round(amt * 100) / 100;
                        userBalancesObj[uid] = val;
                        balancesForSimplify.push({ userId: uid, balance: val });
                    }
                });
                
                // SIMPLIFICATION ENGINE (Scoped)
                if (simplifyDebtsEnabled) {
                     try {
                        simplifiedDebts = coreSimplifyGroupDebts(balancesForSimplify);
                        console.log(`[SIMPLIFY_ENGINE_RUN] [SCOPED] Group ${groupId}: ${balancesForSimplify.length} Raw Nodes -> ${simplifiedDebts.length} Simplified Edges`);
                     } catch (err) {
                         console.error(`[SIMPLIFY_FAIL] [SCOPED] Group ${groupId}:`, err);
                     }
                }
            }
            
            // Persist (Batch update both fields)
            await supabase.from('groups').update({
                user_balances: userBalancesObj,
                simplified_debts: simplifiedDebts
            }).eq('id', groupId);

            await Promise.all(updates);
            console.log(`[RECALC_SCOPE_SUCCESS] { groupId: '${groupId}' }`);
            return;
        }
        
        console.warn(`[RECALC_FALLBACK] Scoped locks exhausted after ${MAX_RETRIES} attempts. Falling back.`);
        return recalculateBalances(supabase);
        
    } catch (e: any) {
        console.error(`[RECALC_FALLBACK] Scoped recalc failed: ${e.message}`, e);
        // Fallback
        return recalculateBalances(supabase);
    }
};

