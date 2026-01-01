/**
 * @deprecated
 * Friend balance breakdown is now computed by backend.
 * Do not use for new features.
 */

import type { Friend, User, Group, Expense, Transaction } from "../types"
import { matchesMember, calculatePairwiseExpenseDebt, type GroupMember } from "./groupBalanceUtils"

export function getFriendBalanceBreakdown(
  friend: Friend | undefined,
  currentUser: User | null,
  groups: Group[],
  expenses: Expense[],
  transactions: Transaction[]
) {
  if (!friend || !currentUser) return []

  const items: { name: string; amount: number; isGroup: boolean }[] = []

  // Create unified member refs for matching
  const meRef: GroupMember = { id: currentUser.id, userId: currentUser.id }
  const friendRef: GroupMember = { 
    id: friend.id, 
    userId: friend.linked_user_id ?? undefined 
  }

  // Helper: Use Shared Logic
  const calculateExpenseDebt = (expense: Expense): number => {
       // Adapt to Shared Utility Signature
       return calculatePairwiseExpenseDebt(
           { splits: expense.splits }, 
           meRef, 
           friendRef
       );
  }

  // 1. Mutual Groups
  const mutualGroups = groups.filter(g => {
    const isMeIn = g.members.some(m => matchesMember(currentUser.id, m as GroupMember))
    const isFriendIn = g.members.some(m => 
        m.id === friend.id || (friend.linked_user_id && m.userId === friend.linked_user_id)
    )
    return isMeIn && isFriendIn
  })

  mutualGroups.forEach(group => {
    const gExpenses = expenses.filter(e => e.groupId === group.id)
    const gTrans = transactions.filter((t: any) => t.groupId === group.id && !t.deleted)

    // RESOLVE CORRECT MEMBER REFS FOR THIS GROUP
    // "Me" might be represented by a group-specific friend_id
    const groupMe = group.members.find(m => m.userId === currentUser.id) || 
                    group.members.find(m => m.id === currentUser.id); // Fallback
    
    const realMeRef: GroupMember = {
        id: groupMe?.id || currentUser.id,
        userId: currentUser.id
    };

    // "Friend" might be represented by a group-specific friend_id or linked user
    // We match by linked_user_id if available, or fall back to the generic friend.id
    const groupFriend = group.members.find(m => 
        (friend.linked_user_id && m.userId === friend.linked_user_id) || 
        m.id === friend.id
    );

    const realFriendRef: GroupMember = {
        id: groupFriend?.id || friend.id,
        userId: friend.linked_user_id ?? undefined
    };

    let bal = 0
    
    // Process Expenses using rigorous logic and group-specific refs
    gExpenses.forEach(e => {
        // Use the group-specific refs!
        const debt = calculatePairwiseExpenseDebt(
           { splits: e.splits }, 
           realMeRef, 
           realFriendRef
        );
        bal += debt;
    })

    // RE-INSTATE original transaction logic strictly to avoid regression
    gTrans.forEach((t: any) => {
      // Use the group-specific refs!
      if (matchesMember(t.fromId, realMeRef) && matchesMember(t.toId, realFriendRef)) {
        bal += t.amount
      } else if (matchesMember(t.fromId, realFriendRef) && matchesMember(t.toId, realMeRef)) {
        bal -= t.amount
      }
    })

    if (Math.abs(bal) > 0.01) {
      items.push({ name: group.name, amount: bal, isGroup: true })
    }
  })

  // 2. Non-Group expenses
  const ngExpenses = expenses.filter(
    e =>
      !e.groupId &&
      e.splits.some(s => matchesMember(s.userId, friendRef))
  )
  const ngTrans = transactions.filter(
    (t: any) =>
      !t.groupId &&
      !t.deleted &&
      ((matchesMember(t.fromId, meRef) && matchesMember(t.toId, friendRef)) ||
        (matchesMember(t.fromId, friendRef) && matchesMember(t.toId, meRef)))
  )

  let ngBal = 0
  ngExpenses.forEach(e => {
      ngBal += calculateExpenseDebt(e);
  })

  // Keep original transaction logic
  ngTrans.forEach((t: any) => {
    if (matchesMember(t.fromId, meRef) && matchesMember(t.toId, friendRef)) {
      ngBal += t.amount
    } else if (matchesMember(t.fromId, friendRef) && matchesMember(t.toId, meRef)) {
      ngBal -= t.amount
    }
  })

  if (Math.abs(ngBal) > 0.01) {
    items.push({ name: "Non-group expenses", amount: ngBal, isGroup: false })
  }

  return items.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
}
