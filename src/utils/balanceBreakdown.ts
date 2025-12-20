
import type { Friend, User, Group, Expense, Transaction } from "../types"
import { matchesMember, type GroupMember } from "./groupBalanceUtils"

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

  // Helper: Calculate Pairwise Debt for a single expense (Simulate Backend Logic)
  const calculateExpenseDebt = (splits: any[]): number => {
      // 1. Calculate Net Balances for everyone
      const nets = new Map<string, number>();
      
      // We need to resolve IDs to a canonical form for matching?
      // In frontend, 'splits' usually have 'userId'.
      // GroupMember matching is complex because of 'id' vs 'userId'.
      // Strategy: Use the 'userId' from the split as the key.
      
      splits.forEach(s => {
          const uid = s.userId;
          if (!uid) return;
          const paid = (s.paidAmount || 0);
          const cost = (s.amount || 0);
          const current = nets.get(uid) || 0;
          nets.set(uid, current + (paid - cost));
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

      // 4. Resolve Transfers specific to Me <-> Friend
      let balanceDelta = 0; // +ve means Friend owes Me. -ve means I owe Friend.

      let i = 0;
      let j = 0;
      
      while (i < debtors.length && j < creditors.length) {
          const debtor = debtors[i];
          const creditor = creditors[j];
          
          const amount = Math.min(Math.abs(debtor.amount), creditor.amount);
          
          // Check if this transfer involves Me and Friend
          const debtorIsMe = matchesMember(debtor.id, meRef);
          const debtorIsFriend = matchesMember(debtor.id, friendRef);
          const creditorIsMe = matchesMember(creditor.id, meRef);
          const creditorIsFriend = matchesMember(creditor.id, friendRef);

          if (debtorIsFriend && creditorIsMe) {
              // Friend pays Me (Friend owes Me)
              balanceDelta += amount;
          } else if (debtorIsMe && creditorIsFriend) {
               // I pay Friend (I owe Friend)
               balanceDelta -= amount;
          }

          // Update Nets
          debtor.amount += amount;
          creditor.amount -= amount;

          if (Math.abs(debtor.amount) < 0.001) i++;
          if (creditor.amount < 0.001) j++;
      }
      
      return balanceDelta;
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
        bal += calculateExpenseDebt(e.splits);
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
      ngBal += calculateExpenseDebt(e.splits);
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
