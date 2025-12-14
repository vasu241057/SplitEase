import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Balance tolerance for floating-point comparisons.
 * Use this consistently across all balance checks.
 */
export const BALANCE_TOLERANCE = 0.01;

/**
 * Transaction with derived from/to parties.
 * The DB stores friend_id + type, but we need fromId/toId for balance calculations.
 */
export interface DerivedTransaction {
  id: string;
  friend_id: string;
  amount: number;
  type: 'paid' | 'received';
  group_id: string | null;
  deleted: boolean;
  date: string;
  // Derived fields
  fromId: string;
  toId: string;
}

/**
 * Derives fromId and toId from a transaction based on friend relationship.
 * 
 * Semantics:
 * - type='paid': Owner paid Friend → fromId=owner, toId=friend
 * - type='received': Friend paid Owner → fromId=friend, toId=owner
 * 
 * @param transaction - Raw transaction from DB
 * @param friendOwnerId - The owner_id of the friend record
 * @param friendLinkedUserId - The linked_user_id of the friend record (null if local friend)
 */
export function deriveTransactionParties(
  transaction: {
    id: string;
    friend_id: string;
    amount: number;
    type: 'paid' | 'received';
    group_id?: string | null;
    deleted?: boolean;
    date?: string;
  },
  friendOwnerId: string,
  friendLinkedUserId: string | null
): DerivedTransaction {
  let fromId: string;
  let toId: string;

  if (transaction.type === 'paid') {
    // "I (owner) paid Friend": From Owner -> To Friend
    fromId = friendOwnerId;
    toId = friendLinkedUserId || transaction.friend_id;
  } else {
    // "Friend paid Me (owner)": From Friend -> To Owner
    fromId = friendLinkedUserId || transaction.friend_id;
    toId = friendOwnerId;
  }

  return {
    id: transaction.id,
    friend_id: transaction.friend_id,
    amount: transaction.amount,
    type: transaction.type,
    group_id: transaction.group_id || null,
    deleted: transaction.deleted || false,
    date: transaction.date || new Date().toISOString(),
    fromId,
    toId,
  };
}

/**
 * Fetches transactions for a group with derived from/to parties.
 * This is the canonical way to get transaction data for balance calculations.
 * 
 * @param supabase - Supabase client
 * @param groupId - Group ID to filter by
 * @param includeDeleted - Whether to include deleted transactions (default: false)
 */
export async function getGroupTransactionsWithParties(
  supabase: SupabaseClient,
  groupId: string,
  includeDeleted: boolean = false
): Promise<DerivedTransaction[]> {
  let query = supabase
    .from('transactions')
    .select('*, friend:friends(linked_user_id)')
    .eq('group_id', groupId);

  if (!includeDeleted) {
    query = query.eq('deleted', false);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[TransactionHelpers] Error fetching group transactions:', error);
    return [];
  }

  return (data || []).map((t: any) => {
    // Use created_by for proper transaction direction derivation
    const creatorId = t.created_by || '';
    const linkedId = t.friend?.linked_user_id || null;
    const otherPartyId = linkedId || t.friend_id;
    
    let fromId: string;
    let toId: string;
    
    if (t.type === 'paid') {
      fromId = creatorId;
      toId = otherPartyId;
    } else {
      fromId = otherPartyId;
      toId = creatorId;
    }
    
    return {
      id: t.id,
      friend_id: t.friend_id,
      amount: t.amount,
      type: t.type,
      group_id: t.group_id || null,
      deleted: t.deleted || false,
      date: t.date || new Date().toISOString(),
      fromId,
      toId,
    };
  });
}

/**
 * Apply transaction effects to a balance map.
 * Positive balance = they owe you, Negative = you owe them.
 * 
 * When you PAY someone (fromId=you), your balance with them should INCREASE
 * (you're reducing your debt, so they effectively owe you more relatively).
 * 
 * When you RECEIVE from someone (toId=you), your balance with them should DECREASE
 * (they're reducing their debt).
 * 
 * @param transactions - Array of derived transactions
 * @param userId - The user's perspective for balance calculation
 * @param balances - Mutable balance map to update (keyed by other party's ID)
 */
export function applyTransactionsToBalances(
  transactions: DerivedTransaction[],
  userId: string,
  balances: Record<string, number>
): void {
  transactions.forEach(t => {
    if (t.fromId === userId) {
      // I paid → increases my position (they owe me more / I owe them less)
      balances[t.toId] = (balances[t.toId] || 0) + t.amount;
    } else if (t.toId === userId) {
      // They paid me → decreases my position (they owe me less)
      balances[t.fromId] = (balances[t.fromId] || 0) - t.amount;
    }
  });
}

/**
 * Apply transaction effects to a global per-user net balance map.
 * Used for checking if a group is fully settled (all balances should sum to 0).
 * 
 * @param transactions - Array of derived transactions
 * @param netBalances - Mutable map of userId -> net balance
 */
export function applyTransactionsToNetBalances(
  transactions: DerivedTransaction[],
  netBalances: Record<string, number>
): void {
  transactions.forEach(t => {
    // From pays To: From's net position increases, To's decreases
    if (t.fromId) {
      netBalances[t.fromId] = (netBalances[t.fromId] || 0) + t.amount;
    }
    if (t.toId) {
      netBalances[t.toId] = (netBalances[t.toId] || 0) - t.amount;
    }
  });
}
