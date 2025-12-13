
import type { Friend, User, Group, Expense, Transaction } from "../types"

export function getFriendBalanceBreakdown(
  friend: Friend | undefined,
  currentUser: User | null,
  groups: Group[],
  expenses: Expense[],
  transactions: Transaction[]
) {
  if (!friend || !currentUser) return []

  const items: { name: string; amount: number; isGroup: boolean }[] = []

  // 1. Mutual Groups
  const mutualGroups = groups.filter(g => {
    const isMeIn = g.members.some(m => m.id === currentUser.id || m.userId === currentUser.id)
    const isFriendIn = g.members.some(
      m => m.id === friend.id || (friend.linked_user_id && m.userId === friend.linked_user_id)
    )
    return isMeIn && isFriendIn
  })

  mutualGroups.forEach(group => {
    const groupMe = group.members.find(m => m.userId === currentUser.id || m.id === currentUser.id)
    const groupFriend = group.members.find(
      m => m.id === friend.id || (friend.linked_user_id && m.userId === friend.linked_user_id)
    )
    if (!groupMe || !groupFriend) return

    const gExpenses = expenses.filter(e => e.groupId === group.id)
    const gTrans = transactions.filter((t: any) => t.groupId === group.id && !t.deleted)

    let bal = 0
    const isMe = (id: string) => id === groupMe.id || (groupMe.userId && id === groupMe.userId)
    const isFriend = (id: string) =>
      id === groupFriend.id || (groupFriend.userId && id === groupFriend.userId)

    gExpenses.forEach(e => {
      if (isMe(e.payerId)) {
        const s = e.splits.find(s => isFriend(s.userId))
        if (s) bal += s.amount || 0
      } else if (isFriend(e.payerId)) {
        const s = e.splits.find(s => isMe(s.userId))
        if (s) bal -= s.amount || 0
      }
    })
    gTrans.forEach((t: any) => {
      if (isMe(t.fromId) && isFriend(t.toId)) bal += t.amount
      else if (isFriend(t.fromId) && isMe(t.toId)) bal -= t.amount
    })

    if (Math.abs(bal) > 0.01) {
      items.push({ name: group.name, amount: bal, isGroup: true })
    }
  })

  // 2. Non-Group
  const ngExpenses = expenses.filter(
    e =>
      !e.groupId &&
      e.splits.some(
        s => s.userId === friend.id || (friend.linked_user_id && s.userId === friend.linked_user_id)
      )
  )
  const ngTrans = transactions.filter(
    (t: any) =>
      !t.groupId &&
      !t.deleted &&
      ((t.fromId === currentUser.id &&
        (t.toId === friend.id || t.toId === friend.linked_user_id)) ||
        ((t.fromId === friend.id || t.fromId === friend.linked_user_id) &&
          t.toId === currentUser.id))
  )

  let ngBal = 0
  ngExpenses.forEach(e => {
    // Helper to match friend in splits (check both friend.id and linked_user_id)
    const isFriendSplit = (s: any) => 
      s.userId === friend.id || (friend.linked_user_id && s.userId === friend.linked_user_id)
    
    if (e.payerId === currentUser.id) {
      // I paid - look for friend's split
      const s = e.splits.find(isFriendSplit)
      if (s) ngBal += s.amount || 0
    } else if (
      e.payerId === friend.id ||
      (friend.linked_user_id && e.payerId === friend.linked_user_id)
    ) {
      // Friend paid - look for my split
      const s = e.splits.find(s => s.userId === currentUser.id)
      if (s) ngBal -= s.amount || 0
    }
  })

  ngTrans.forEach((t: any) => {
    if (t.fromId === currentUser.id) ngBal += t.amount
    else ngBal -= t.amount
  })

  if (Math.abs(ngBal) > 0.01) {
    items.push({ name: "Non-group expenses", amount: ngBal, isGroup: false })
  }

  return items.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
}
