
import type { Friend, User, Group, Expense, Transaction } from "../types"
import { matchesMember, findMemberSplit, type GroupMember } from "./groupBalanceUtils"

export function getFriendBalanceBreakdown(
  friend: Friend | undefined,
  currentUser: User | null,
  groups: Group[],
  expenses: Expense[],
  transactions: Transaction[]
) {
  if (!friend || !currentUser) return []

  const items: { name: string; amount: number; isGroup: boolean }[] = []

  // Create unified member refs
  const meRef: GroupMember = { id: currentUser.id, userId: currentUser.id }
  const friendRef: GroupMember = { 
    id: friend.id, 
    userId: friend.linked_user_id ?? undefined 
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
    const groupMe = group.members.find(m => m.userId === currentUser.id || m.id === currentUser.id)
    const groupFriend = group.members.find(
      m => m.id === friend.id || (friend.linked_user_id && m.userId === friend.linked_user_id)
    )
    if (!groupMe || !groupFriend) return

    // Build GroupMember refs for unified matching
    const groupMeRef: GroupMember = { id: groupMe.id, userId: groupMe.userId ?? undefined }
    const groupFriendRef: GroupMember = { id: groupFriend.id, userId: groupFriend.userId ?? undefined }

    const gExpenses = expenses.filter(e => e.groupId === group.id)
    const gTrans = transactions.filter((t: any) => t.groupId === group.id && !t.deleted)

    let bal = 0

    gExpenses.forEach(e => {
      if (matchesMember(e.payerId, groupMeRef)) {
        // I paid - find friend's split
        const s = findMemberSplit(e.splits, groupFriendRef)
        if (s) {
          bal += s.amount || 0
        }
      } else if (matchesMember(e.payerId, groupFriendRef)) {
        // Friend paid - find my split
        const s = findMemberSplit(e.splits, groupMeRef)
        if (s) {
          bal -= s.amount || 0
        }
      }
    })
    
    gTrans.forEach((t: any) => {
      if (matchesMember(t.fromId, groupMeRef) && matchesMember(t.toId, groupFriendRef)) {
        bal += t.amount
      } else if (matchesMember(t.fromId, groupFriendRef) && matchesMember(t.toId, groupMeRef)) {
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
    if (matchesMember(e.payerId, meRef)) {
      // I paid - look for friend's split
      const s = findMemberSplit(e.splits, friendRef)
      if (s) {
        ngBal += s.amount || 0
      }
    } else if (matchesMember(e.payerId, friendRef)) {
      // Friend paid - look for my split
      const s = findMemberSplit(e.splits, meRef)
      if (s) {
        ngBal -= s.amount || 0
      }
    }
  })

  ngTrans.forEach((t: any) => {
    if (matchesMember(t.fromId, meRef)) {
      ngBal += t.amount
    } else {
      ngBal -= t.amount
    }
  })

  if (Math.abs(ngBal) > 0.01) {
    items.push({ name: "Non-group expenses", amount: ngBal, isGroup: false })
  }

  return items.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
}
