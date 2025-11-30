import { SupabaseClient } from '@supabase/supabase-js';

// Types (Mirroring the DB schema)
interface Friend {
  id: string;
  balance: number;
}

interface Expense {
  id: string;
  amount: number;
  payer_id: string; // or null if currentUser
  deleted: boolean;
  splits: Split[];
}

interface Split {
  friend_id: string; // or null if currentUser
  amount: number;
  paid_amount: number;
  paid: boolean;
}

interface Transaction {
  friend_id: string;
  amount: number;
  type: 'paid' | 'received';
}

export const recalculateBalances = async (supabase: SupabaseClient) => {
  // 1. Reset all friend balances to 0
  // We can do this by fetching all friends, setting balance to 0 in memory, then calculating, then updating.
  // Or simpler: Update all friends to balance = 0 in DB first? No, that's too many writes.
  // Better: Fetch all friends, calculate new balances in memory, then update only changed ones.
  
  const { data: friendsData, error: friendsError } = await supabase.from('friends').select('id, balance');
  if (friendsError) throw friendsError;
  
  const friendsMap = new Map<string, number>();
  friendsData.forEach((f: any) => friendsMap.set(f.id, 0));

  // 2. Fetch all ACTIVE expenses with splits
  const { data: expensesData, error: expensesError } = await supabase
    .from('expenses')
    .select('*, splits:expense_splits(*)')
    .eq('deleted', false);
    
  if (expensesError) throw expensesError;

  // 3. Iterate and calculate
  expensesData.forEach((expense: any) => {
    const netBalances: Record<string, number> = {};
    
    expense.splits.forEach((split: any) => {
      // Logic from original server.js
      // const paid = split.paidAmount || (split.paid ? split.amount : 0); 
      // const net = paid - split.amount;
      
      const paid = split.paid_amount || (split.paid ? split.amount : 0);
      const net = paid - split.amount;
      
      // If friend_id is null, it's currentUser. We track currentUser balance implicitly or just ignore for friend updates?
      // The original logic tracked "netBalances" for everyone including currentUser.
      const userId = split.friend_id || 'currentUser';
      netBalances[userId] = (netBalances[userId] || 0) + net;
    });

    // Simplify Debt Logic
    const debtors = Object.entries(netBalances).filter(([_, bal]) => bal < -0.01).sort((a, b) => a[1] - b[1]);
    const creditors = Object.entries(netBalances).filter(([_, bal]) => bal > 0.01).sort((a, b) => b[1] - a[1]);
    
    let i = 0;
    let j = 0;
    
    const currentDebtors: [string, number][] = debtors.map(([id, val]) => [id, val]);
    const currentCreditors: [string, number][] = creditors.map(([id, val]) => [id, val]);
    
    while (i < currentDebtors.length && j < currentCreditors.length) {
      const debtor = currentDebtors[i];
      const creditor = currentCreditors[j];
      
      const amount = Math.min(Math.abs(debtor[1]), creditor[1]);
      
      const debtorId = debtor[0];
      const creditorId = creditor[0];
      
      if (creditorId === 'currentUser') {
        // Debtor owes Me. Debtor must be a friend.
        if (debtorId !== 'currentUser') {
           friendsMap.set(debtorId, (friendsMap.get(debtorId) || 0) + amount);
        }
      } else if (debtorId === 'currentUser') {
        // I owe Creditor. Creditor must be a friend.
        if (creditorId !== 'currentUser') {
           friendsMap.set(creditorId, (friendsMap.get(creditorId) || 0) - amount);
        }
      }
      
      debtor[1] += amount;
      creditor[1] -= amount;
      
      if (Math.abs(debtor[1]) < 0.01) i++;
      if (creditor[1] < 0.01) j++;
    }
  });

  // 4. Apply Settle Up Transactions
  const { data: transactionsData, error: txError } = await supabase.from('transactions').select('*');
  if (txError) throw txError;

  transactionsData.forEach((tx: any) => {
    const currentBal = friendsMap.get(tx.friend_id) || 0;
    if (tx.type === 'paid') {
      friendsMap.set(tx.friend_id, currentBal + tx.amount);
    } else {
      friendsMap.set(tx.friend_id, currentBal - tx.amount);
    }
  });

  // 5. Update Friends in DB
  // We can do this in parallel
  const updates = Array.from(friendsMap.entries()).map(async ([id, balance]) => {
    // Only update if changed? Or just update all.
    // For now, update all to be safe.
    await supabase.from('friends').update({ balance }).eq('id', id);
  });

  await Promise.all(updates);
};
