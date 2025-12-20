
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

    let bal = 0
    
    // Process Expenses using rigorous logic
    gExpenses.forEach(e => {
        bal += calculateExpenseDebt(e);
    })

    // RE-INSTATE original transaction logic strictly to avoid regression
    gTrans.forEach((t: any) => {
      if (matchesMember(t.fromId, meRef) && matchesMember(t.toId, friendRef)) {
        bal += t.amount
      } else if (matchesMember(t.fromId, friendRef) && matchesMember(t.toId, meRef)) {
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
