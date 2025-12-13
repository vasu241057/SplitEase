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

  friendsData.forEach((f: any) => {
    friendBalances.set(f.id, 0);
    if (f.owner_id && f.linked_user_id) {
      globalFriendLookup.set(`${f.owner_id}:${f.linked_user_id}`, f.id);
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
      const personId = split.user_id || split.friend_id;
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
    .select('*')
    .in('type', ['paid', 'received'])
    .eq('deleted', false);
  if (txError) {
    console.error('[DEBUG] Error fetching transactions:', txError);
    throw txError;
  }
  
  // Create quick lookup for Friend Details to find linked_user_id
  const friendMap = new Map<string, { owner_id: string, linked_user_id: string | null, name: string }>();
  friendsData.forEach((f: any) => friendMap.set(f.id, f));

  transactionsData.forEach((tx: any) => {
    // 1. Update Current Friend Record
    const current = friendBalances.get(tx.friend_id) || 0;
    
    // Log transaction processing
    console.log(`[DEBUG] Processing TX ${tx.id} Type: ${tx.type} Amount: ${tx.amount} FriendID: ${tx.friend_id}`);

    if (tx.type === 'paid') {
      friendBalances.set(tx.friend_id, current + tx.amount);
    } else {
      friendBalances.set(tx.friend_id, current - tx.amount);
    }

    // 2. Update Inverse Friend Record (if Global User)
    const friendInfo = friendMap.get(tx.friend_id);
    if (friendInfo && friendInfo.owner_id && friendInfo.linked_user_id) {
       // Find the Inverse Record: where Owner is the Linked User, and Linked User is the Owner
       const inverseKey = `${friendInfo.linked_user_id}:${friendInfo.owner_id}`;
       const inverseFriendId = globalFriendLookup.get(inverseKey);
       
       if (inverseFriendId) {
          const inverseCurrent = friendBalances.get(inverseFriendId) || 0;
          
          console.log(`[DEBUG] Found Inverse Friend Record! ID: ${inverseFriendId} (Key: ${inverseKey})`);

          // Apply OPPOSITE effect
          // If A paid B (A->B +Amount), then B received from A (B->A -Amount)
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
  console.log('[DEBUG] Updating Friend Balances...');
  const validUpdates = Array.from(friendBalances.entries()).map(async ([id, balance]) => {
     // Optional: Round to 2 decimals
     const finalBalance = Math.round(balance * 100) / 100;
     // Optimization: Only update if changed? 
     // For now, update all to be safe.
     // console.log(`[DEBUG] Setting Balance for Friend ${id} -> ${finalBalance}`);
     await supabase.from('friends').update({ balance: finalBalance }).eq('id', id);
  });
  
  await Promise.all(validUpdates);
  console.log('[DEBUG] Recalculate Complete.');
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
