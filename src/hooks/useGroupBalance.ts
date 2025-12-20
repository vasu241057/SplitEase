import { useMemo, useCallback } from "react";
import { useData } from "../context/DataContext";
import { 
  calculateExpenseBalance, 
  calculateTransactionBalance,
  matchesMember,
  calculatePairwiseExpenseDebt,
  type GroupMember 
} from "../utils/groupBalanceUtils";

export function useGroupBalance(group: any) {
    const { expenses, transactions, currentUser } = useData();

    const memberBalances = useMemo(() => {
        if (!group) return {};
        
        const balances: Record<string, number> = {};
        const groupExpenses = expenses.filter((e) => e.groupId === group.id);
        const groupTransactions = transactions.filter((t: any) => t.groupId === group.id && !t.deleted);
        
        group.members.forEach((member: any) => {
            const memberRef: GroupMember = {
                id: member.id,
                userId: member.userId,
                name: member.name
            };
            
            let balance = 0;
            
            // Calculate balance from expenses using unified utility
            groupExpenses.forEach((expense) => {
                const expenseEffect = calculateExpenseBalance(expense, memberRef);
                balance += expenseEffect;   
            });
            
            // Calculate balance from transactions
            groupTransactions.forEach((tx: any) => {
                const txEffect = calculateTransactionBalance(tx, memberRef);
                balance += txEffect;
            });
            
            balances[member.id] = balance;
        });
        
        return balances;
    }, [group, expenses, transactions, currentUser.id]);

    const isGroupSettled = useMemo(() => {
        return Object.values(memberBalances).every(b => Math.abs(b) < 0.05);
    }, [memberBalances]);

    /**
     * Check if a specific member is fully settled with ALL other members
     * This calculates PAIRWISE balances, not just net position.
     * A member is settled only if they have zero balance with EVERY other member.
     */
    const isMemberFullySettled = useCallback((memberId: string): boolean => {
        if (!group) return true;
        
        const groupExpenses = expenses.filter((e) => e.groupId === group.id);
        const groupTransactions = transactions.filter((t: any) => t.groupId === group.id && !t.deleted);
        
        const member = group.members.find((m: any) => m.id === memberId);
        if (!member) return true;
        
        const memberRef: GroupMember = { id: member.id, userId: member.userId ?? undefined };
        
        // Check pairwise balance with EACH other member
        for (const otherMember of group.members) {
            if (otherMember.id === memberId) continue;
            
            const otherRef: GroupMember = { id: otherMember.id, userId: otherMember.userId ?? undefined };
            let pairwiseBalance = 0;
            
            // Calculate pairwise expense balance
            groupExpenses.forEach((expense) => {
                const expenseEffect = calculatePairwiseExpenseDebt(expense, memberRef, otherRef);
                pairwiseBalance += expenseEffect;
            });
            
            // Calculate pairwise transaction balance
            groupTransactions.forEach((t: any) => {
                if (matchesMember(t.fromId, memberRef) && matchesMember(t.toId, otherRef)) {
                    pairwiseBalance += t.amount;
                } else if (matchesMember(t.fromId, otherRef) && matchesMember(t.toId, memberRef)) {
                    pairwiseBalance -= t.amount;
                }
            });
            
            // If any pairwise balance is non-zero, member is NOT fully settled
            if (Math.abs(pairwiseBalance) > 0.01) {
                return false;
            }
        }
        
        return true;
    }, [group, expenses, transactions]);

    return { memberBalances, isGroupSettled, isMemberFullySettled };
}
