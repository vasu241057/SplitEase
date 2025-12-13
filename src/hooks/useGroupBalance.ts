import { useMemo } from "react";
import { useData } from "../context/DataContext";

export function useGroupBalance(group: any) {
    const { expenses, transactions, currentUser } = useData();

    const memberBalances = useMemo(() => {
        if (!group) return {};

        const balances: Record<string, number> = {};
        const groupExpenses = expenses.filter((e) => e.groupId === group.id);
        const groupTransactions = transactions.filter((t: any) => t.groupId === group.id && !t.deleted);
        
        group.members.forEach((member: any) => {
            const memberUserId = member.userId; 
            let balance = 0; 
            
            // GLOBAL Balance Calculation for Member N:
            groupExpenses.forEach(expense => {
                // If Member Paid
                if ((memberUserId && expense.payerId === memberUserId)) {
                   balance += expense.amount; // They paid formatted amount
                }
                
                // Minus their share
                const split = expense.splits.find((s: any) => {
                   if (memberUserId && s.userId === memberUserId) return true;
                   return false; 
                });
                if (split) {
                    balance -= (split.amount || 0);
                }
            });
            
            // Transactions
             groupTransactions.forEach((t: any) => {
                if (memberUserId && t.fromId === memberUserId) {
                    balance += t.amount;
                }
                if (memberUserId && t.toId === memberUserId) {
                    balance -= t.amount;
                }
            });

            balances[member.id] = balance;
        });
        
        return balances;
    }, [group, expenses, transactions, currentUser.id]);

    const isGroupSettled = useMemo(() => {
        return Object.values(memberBalances).every(b => Math.abs(b) < 0.05);
    }, [memberBalances]);

    return { memberBalances, isGroupSettled };
}
