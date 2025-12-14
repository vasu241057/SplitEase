import { SupabaseClient } from '@supabase/supabase-js';

export const recalculateBalances = async (supabase: SupabaseClient) => {
  console.log('[DEBUG] Starting RecalculateBalances (Multi-User)...');

  // 1. Fetch all Friends (to reset and for lookups)
  const { data: friendsData, error: friendsError } = await supabase
    .from('friends')
    .select('id, owner_id, linked_user_id');

  if (friendsError) {
    console.error('[DEBUG] Error fetching friends:', friendsError);
    throw friendsError;
  }

  // Map: FriendID -> Balance (Initialize to 0)
  const friendBalances = new Map<string, number>();
  // Map: `${ownerId}:${linkedUserId}` -> FriendID (For Global-Global lookup)
  const globalFriendLookup = new Map<string, string>();
  // Map: FriendID -> LinkedUserId (For translating local friend to global user)
  const friendIdToLinkedUser = new Map<string, string>();

  friendsData.forEach((f: any) => {
    friendBalances.set(f.id, 0);
    if (f.owner_id && f.linked_user_id) {
      globalFriendLookup.set(`${f.owner_id}:${f.linked_user_id}`, f.id);
      // Store the mapping from friend_id to linked_user_id
      friendIdToLinkedUser.set(f.id, f.linked_user_id);
    }
  });

  console.log(`[DEBUG] Loaded ${friendsData.length} friend records.`);

  // 2. Fetch Active Expenses
  const { data: expensesData, error: expensesError } = await supabase
    .from('expenses')
    .select('id, amount, payer_user_id, payer_id, description, splits:expense_splits(user_id, friend_id, amount, paid_amount, paid)')
    .eq('deleted', false);

  if (expensesError) {
    console.error('[DEBUG] Error fetching expenses:', expensesError);
    throw expensesError;
  }

  console.log(`[DEBUG] Processing ${expensesData.length} expenses...`);

  // 3. Calculate Net Balances per Entity (User or LocalFriend)
  expensesData.forEach((expense: any) => {
    const netBalances = new Map<string, number>();

    // Identify Payer
    // Payer can be a Global User (payer_user_id) or Local Friend (payer_id)
    const payerId = expense.payer_user_id || expense.payer_id;
    if (!payerId) {
      console.warn(`[DEBUG] Expense ${expense.id} has no payer! Skipping.`);
      return;
    }

    // Initialize logic:
    // We assume the sum of splits equals expense amount? 
    // Usually SplitEase/Splitwise logic:
    // Each split is "Cost for Person X".
    // "Paid Amount" tracks how much Person X contributed.
    // Net = Paid - Cost.
    // If Payer paid everything, Payer's Paid = Total, Cost = Payer's Split.
    // The splits table in this schema seems to contain entries for EVERYONE involved.
    
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
          console.log(`[BALANCE_DEBUG] Translated friend_id ${split.friend_id} to linked_user_id ${linkedUserId}`);
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
      console.log(`[DEBUG] Expense ${expense.id}: Credited payer ${payerId} with missing amount ${unpaidAmount}`);
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
       processTransfer(debtor.id, creditor.id, transferAmount, friendBalances, globalFriendLookup);

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
  
  // Create quick lookup for Friend Details
  const friendMap = new Map<string, { owner_id: string, linked_user_id: string | null, name: string }>();
  friendsData.forEach((f: any) => friendMap.set(f.id, f));

  transactionsData.forEach((tx: any) => {
    // Use created_by to determine who initiated the transaction
    const creatorId = tx.created_by || tx.friend?.owner_id;
    const friendLinkedUserId = tx.friend?.linked_user_id;
    const otherUserId = friendLinkedUserId || null;
    
    console.log(`[DEBUG] Processing TX ${tx.id} Type: ${tx.type} Amount: ${tx.amount} Creator: ${creatorId} Other: ${otherUserId || tx.friend_id}`);
    
    // Find the friend record where: creator owns it AND it links to the other user
    // This gives us the correct friend record from the creator's perspective
    const creatorFriendKey = otherUserId ? `${creatorId}:${otherUserId}` : null;
    const creatorFriendId = creatorFriendKey ? globalFriendLookup.get(creatorFriendKey) : tx.friend_id;
    
    if (creatorFriendId) {
      const current = friendBalances.get(creatorFriendId) || 0;
      
      // From creator's perspective:
      // 'paid' = I paid them → balance increases (they owe me more / I owe less)
      // 'received' = They paid me → balance decreases (they owe me less)
      if (tx.type === 'paid') {
        friendBalances.set(creatorFriendId, current + tx.amount);
        console.log(`[DEBUG] Updated Creator's Friend ${creatorFriendId}: ${current} -> ${current + tx.amount}`);
      } else {
        friendBalances.set(creatorFriendId, current - tx.amount);
        console.log(`[DEBUG] Updated Creator's Friend ${creatorFriendId}: ${current} -> ${current - tx.amount}`);
      }
    }
    
    // Update inverse friend record (other user's view of creator)
    if (otherUserId && creatorId) {
      const inverseKey = `${otherUserId}:${creatorId}`;
      const inverseFriendId = globalFriendLookup.get(inverseKey);
      
      if (inverseFriendId) {
        const inverseCurrent = friendBalances.get(inverseFriendId) || 0;
        
        console.log(`[DEBUG] Found Inverse Friend Record! ID: ${inverseFriendId} (Key: ${inverseKey})`);

        // Apply OPPOSITE effect
        // If creator paid other (type=paid), other's view: they received → balance decreases
        // If creator received from other (type=received), other's view: they paid → balance increases
        if (tx.type === 'paid') {
           friendBalances.set(inverseFriendId, inverseCurrent - tx.amount);
           console.log(`[DEBUG] Updated Inverse ${inverseFriendId}: ${inverseCurrent} -> ${inverseCurrent - tx.amount}`);
        } else {
           friendBalances.set(inverseFriendId, inverseCurrent + tx.amount);
           console.log(`[DEBUG] Updated Inverse ${inverseFriendId}: ${inverseCurrent} -> ${inverseCurrent + tx.amount}`);
        }
      } else {
        console.warn(`[DEBUG] Inverse Friend Record NOT FOUND for Key: ${inverseKey}`);
      }
    }
  });

  // 6. DB Updates
  console.log('[BALANCE_DEBUG] ===== PERSISTING BALANCE UPDATES =====');
  console.log('[BALANCE_DEBUG] Total friend records to update:', friendBalances.size);
  
  // First, fetch current balances for comparison
  const friendIds = Array.from(friendBalances.keys());
  const { data: currentBalancesData } = await supabase
    .from('friends')
    .select('id, owner_id, linked_user_id, balance, name')
    .in('id', friendIds);
  
  const currentBalancesMap = new Map<string, any>();
  currentBalancesData?.forEach((f: any) => currentBalancesMap.set(f.id, f));
  
  const validUpdates = Array.from(friendBalances.entries()).map(async ([id, balance]) => {
     const finalBalance = Math.round(balance * 100) / 100;
     const currentRecord = currentBalancesMap.get(id);
     const oldBalance = currentRecord?.balance || 0;
     const delta = finalBalance - oldBalance;
     
     // Log every balance change
     console.log(`[BALANCE_DEBUG] Friend Update:`, {
       friendId: id,
       name: currentRecord?.name || 'unknown',
       ownerId: currentRecord?.owner_id,
       linkedUserId: currentRecord?.linked_user_id,
       oldBalance: oldBalance,
       newBalance: finalBalance,
       delta: delta,
       changed: Math.abs(delta) > 0.001
     });
     
     await supabase.from('friends').update({ balance: finalBalance }).eq('id', id);
  });
  
  await Promise.all(validUpdates);
  console.log('[BALANCE_DEBUG] ===== BALANCE PERSISTENCE COMPLETE =====');
};

// Helper to routing debt updates
function processTransfer(
  debtorId: string, 
  creditorId: string, 
  amount: number, 
  friendBalances: Map<string, number>,
  globalLookup: Map<string, string>
) {
  // Determine Type of Debtor/Creditor
  // If ID exists in friendBalances (initially 0 keys), it's a LOCAL FRIEND?
  // Wait, friendBalances keys are ALL friend IDs.
  // BUT Global User IDs are NOT in friendBalances keys.
  // So:
  const isDebtorLocal = friendBalances.has(debtorId);
  const isCreditorLocal = friendBalances.has(creditorId);

  // Case 1: Global User A owes Global User B
  if (!isDebtorLocal && !isCreditorLocal) {
    // Debtor (A) -> Creditor (B)
    // 1. In A's Friend List: Find B. Update B's balance -= Amount (A owes B).
    const friendRecordForB = globalLookup.get(`${debtorId}:${creditorId}`);
    if (friendRecordForB) {
      friendBalances.set(friendRecordForB, (friendBalances.get(friendRecordForB) || 0) - amount);
    }
    
    // 2. In B's Friend List: Find A. Update A's balance += Amount (A owes B).
    const friendRecordForA = globalLookup.get(`${creditorId}:${debtorId}`);
    if (friendRecordForA) {
      friendBalances.set(friendRecordForA, (friendBalances.get(friendRecordForA) || 0) + amount);
    }
    return;
  }

  // Case 2: Local Friend F owes Global User A
  // Usually F is owned by A.
  if (isDebtorLocal && !isCreditorLocal) {
     const friendId = debtorId;
     // If Creditor is the Owner of this Friend, easy.
     // Friend owes Owner. Friend Balance += Amount.
     // We assume Creditor IS Owner for local interactions.
     const current = friendBalances.get(friendId) || 0;
     friendBalances.set(friendId, current + amount);
     return;
  }

  // Case 3: Global User A owes Local Friend F
  if (!isDebtorLocal && isCreditorLocal) {
     const friendId = creditorId;
     // Owner owes Friend. Friend Balance -= Amount.
     const current = friendBalances.get(friendId) || 0;
     friendBalances.set(friendId, current - amount);
     return;
  }

  // Case 4: Local F owes Local G?
  // Should ideally not happen or just ignore if cross-owner.
  // If same owner, maybe update both? 
  // For now, ignore complex local-local graphs.
}
