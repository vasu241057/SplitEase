/**
 * Unified ID Matching Utility for SplitEase
 * 
 * This module provides consistent ID matching logic for all balance calculations.
 * The problem: splits can contain user_id (global) OR friend_id (local).
 * This utility normalizes the matching process across all components.
 */

export interface GroupMember {
  id: string;        // friend_id
  userId?: string;   // linked_user_id (global)
  name?: string;
}

/**
 * Check if a given ID matches a specific member.
 * Handles both global user IDs and local friend IDs.
 */
export function matchesMember(id: string | undefined | null, member: GroupMember): boolean {
  if (!id) return false;
  
  // Match by friend_id (member.id)
  if (id === member.id) return true;
  
  // Match by global user ID (member.userId)
  if (member.userId && id === member.userId) return true;
  
  return false;
}

/**
 * Find a split that belongs to a specific member.
 * Handles splits with user_id OR friend_id.
 */
export function findMemberSplit(
  splits: Array<{ userId?: string; amount?: number; paidAmount?: number }>,
  member: GroupMember
): { userId?: string; amount?: number; paidAmount?: number } | undefined {
  return splits.find(s => matchesMember(s.userId, member));
}

/**
 * Check if a payer ID matches a specific member.
 */
export function payerIsMember(payerId: string | undefined | null, member: GroupMember): boolean {
  return matchesMember(payerId, member);
}

/**
 * Check if a transaction involves a specific member as sender or receiver.
 */
export function transactionInvolvesMember(
  tx: { fromId?: string; toId?: string },
  member: GroupMember
): { isFrom: boolean; isTo: boolean } {
  return {
    isFrom: matchesMember(tx.fromId, member),
    isTo: matchesMember(tx.toId, member)
  };
}

/**
 * Get the current user as a GroupMember for consistent matching.
 */
export function getCurrentUserAsMember(currentUserId: string): GroupMember {
  return {
    id: currentUserId,
    userId: currentUserId
  };
}

/**
 * Calculate a member's balance for a single expense.
 * Returns the net effect (positive = owed, negative = owes).
 */
export function calculateExpenseBalance(
  expense: {
    payerId: string;
    amount: number;
    splits: Array<{ userId?: string; amount?: number }>;
  },
  member: GroupMember
): number {
  let balance = 0;
  
  // If member paid, they're owed the full amount
  if (payerIsMember(expense.payerId, member)) {
    balance += expense.amount;
  }
  
  // Subtract their share
  const split = findMemberSplit(expense.splits, member);
  if (split) {
    balance -= (split.amount || 0);
  }
  
  return balance;
}

/**
 * Calculate a member's transaction balance adjustment.
 * fromId = payer (reduces debt), toId = receiver (increases debt).
 */
export function calculateTransactionBalance(
  tx: { fromId?: string; toId?: string; amount: number },
  member: GroupMember
): number {
  const { isFrom, isTo } = transactionInvolvesMember(tx, member);
  
  if (isFrom) return tx.amount;   // Member paid, reduces their debt
  if (isTo) return -tx.amount;    // Member received, increases their debt
  return 0;
}

/**
 * Calculate the precise pairwise transfer amount between two members for a specific expense.
 * Implements the "Simplify Debt" algorithm per expense to handle multi-payer correctly.
 * 
 * Returns:
 *  > 0: 'them' owes 'me' (positive)
 *  < 0: 'me' owes 'them' (negative)
 *  0: No debt between these two
 */
export function calculatePairwiseExpenseDebt(
  expense: {
    splits: Array<{ userId?: string; amount?: number; paidAmount?: number }>;
  },
  me: GroupMember,
  them: GroupMember
): number {
  // 1. Calculate Net Balances for everyone in the expense
  // 1. Calculate Net Balances for everyone in the expense
  const nets = new Map<string, number>();
  
  // Helper to canonicalize identity strictly for NETTING purposes
  // Goal: Merge "Me (User ID)" and "Me (Friend ID)" into one bucket
  const getCanonicalId = (id: string): string => {
    if (matchesMember(id, me)) return 'C_ME';
    if (matchesMember(id, them)) return 'C_THEM';
    return id; // Other participants keep their unique ID
  };

  expense.splits.forEach(s => {
    const uid = s.userId;
    if (!uid) return;
    
    const canonicalId = getCanonicalId(uid);
    const paid = (s.paidAmount || 0);
    const cost = (s.amount || 0);
    
    const current = nets.get(canonicalId) || 0;
    nets.set(canonicalId, current + (paid - cost));
  });

  // 2. Separate into Debtors and Creditors
  const debtors: {id: string, amount: number}[] = [];
  const creditors: {id: string, amount: number}[] = [];

  nets.forEach((amount, id) => {
    if (amount < -0.01) debtors.push({ id, amount });
    if (amount > 0.01) creditors.push({ id, amount });
  });

  // 3. Sort (Match Backend: Debtors Asc, Creditors Desc)
  debtors.sort((a, b) => a.amount - b.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  // 4. Resolve Transfers specific to Me <-> Them
  let balanceDelta = 0; // +ve means Them owes Me.

  let i = 0;
  let j = 0;
  
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    
    // How much can be transferred?
    const amount = Math.min(Math.abs(debtor.amount), creditor.amount);
    
    // Check if this transfer involves Me and Them
    // Check if this transfer involves Me and Them
    // Since we canonicalized to 'C_ME' and 'C_THEM', we check directly
    const debtorIsMe = debtor.id === 'C_ME' || matchesMember(debtor.id, me); // Fallback for safety
    const debtorIsThem = debtor.id === 'C_THEM' || matchesMember(debtor.id, them);
    const creditorIsMe = creditor.id === 'C_ME' || matchesMember(creditor.id, me);
    const creditorIsThem = creditor.id === 'C_THEM' || matchesMember(creditor.id, them);

    if (debtorIsThem && creditorIsMe) {
        // Them pays Me (Them owes Me) -> Positive balance for Me
        balanceDelta += amount;
    } else if (debtorIsMe && creditorIsThem) {
         // I pay Them (I owe Them) -> Negative balance for Me
         balanceDelta -= amount;
    }

    // Update Nets (simulate transaction)
    debtor.amount += amount;
    creditor.amount -= amount;

    if (Math.abs(debtor.amount) < 0.001) i++;
    if (creditor.amount < 0.001) j++;
  }
  
  return balanceDelta;
}

/**
 * Calculate the total balance for a specific user in a group.
 * Aggregates all pairwise debts within the group context.
 * 
 * @param group The group object (must contain members)
 * @param currentUser The user object (must contain id)
 * @param expenses List of expenses (will be filtered by groupId if passed all, or assumed filtered)
 * @param transactions List of transactions (will be filtered by groupId if passed all, or assumed filtered)
 */
export function calculateUserGroupBalance(
  group: { id: string; members: any[] },
  currentUser: { id: string },
  expenses: Array<{ groupId?: string; splits: any[]; payerId: string; amount: number }>,
  transactions: Array<{ groupId?: string; fromId: string; toId: string; amount: number; deleted?: boolean }>
): number {
  // Find current user's member record in this group
  const myMemberRecord = group.members.find(
    (m: any) => m.id === currentUser.id || m.userId === currentUser.id
  );

  if (!myMemberRecord) {
    return 0;
  }

  const meRef: GroupMember = {
    id: myMemberRecord.id,
    userId: currentUser.id
  };

  // Filter if not already filtered (safety check)
  const groupExpenses = expenses.filter(e => e.groupId === group.id);
  const groupTransactions = transactions.filter(t => t.groupId === group.id && !t.deleted);

  let myBalance = 0;

  // Calculate balance with each other member
  group.members.forEach((member: any) => {
    // Skip self
    if (member.id === myMemberRecord.id || member.userId === currentUser.id) return;

    const themRef: GroupMember = { id: member.id, userId: member.userId ?? undefined };

    // 1. Expenses Effect
    groupExpenses.forEach(expense => {
      // Logic: calculatePairwiseExpenseDebt returns "Them owes Me" (Positive)
      // So if >0, I am owed. If <0, I owe.
      // We sum this up to get my total net position.
      myBalance += calculatePairwiseExpenseDebt(expense, meRef, themRef);
    });

    // 2. Transactions Effect
    groupTransactions.forEach(t => {
      // Directions relative to Me
      if (matchesMember(t.fromId, meRef) && matchesMember(t.toId, themRef)) {
        // Me -> Them (I paid Them)
        // Does this increase or decrease my balance?
        // If I paid, I gave money.
        // In "Balance" context (Net Asset), paying someone usually reduces what I owe them, or increases what they owe me?
        // Wait. `calculatePairwiseExpenseDebt` returns "Amount Them Owes Me".
        // If I hand them cash (Transaction), "Them Owes Me" DECREASES?
        // Or "I Owe Them" DECREASES (becomes less negative -> positive shift).
        // Let's look at `Groups.tsx` reference logic:
        // if (matchesMember(t.fromId, meRef) && matchesMember(t.toId, themRef)) myBalance += t.amount;
        // Logic: I paid. My "Asset" position increases?
        // If I owed -100, and I pay 50. My balance becomes -50. (-100 + 50).
        // So += Amount is correct.
        myBalance += t.amount;
      } else if (matchesMember(t.fromId, themRef) && matchesMember(t.toId, meRef)) {
        // Them -> Me (They paid Me)
        // If They owed 100, and pay 50. My asset becomes 50. (100 - 50).
        // So -= Amount is correct.
        myBalance -= t.amount;
      }
    });
  });

  return myBalance;
}
