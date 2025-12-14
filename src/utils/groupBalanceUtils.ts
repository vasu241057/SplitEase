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
