export const BALANCE_TOLERANCE = 0.05; // 5 cents tolerance

/**
 * Calculate the precise pairwise transfer amount between two users for a specific expense.
 * Implements the "Simplify Debt" algorithm per expense to handle multi-payer correctly.
 * 
 * Logic mirrored from frontend `groupBalanceUtils.ts`.
 * 
 * Returns:
 *  > 0: 'them' (userId2) owes 'me' (userId1) (positive)
 *  < 0: 'me' (userId1) owes 'them' (userId2) (negative)
 *  0: No debt between these two
 */
export function calculatePairwiseExpenseDebt(
    expense: {
        amount: number;
        expense_splits: Array<{ user_id?: string; friend_id?: string; amount: number | string; paid_amount?: number | string }>;
    },
    userId1: string,
    userId2: string,
    friendId1?: string, // friend_id representing userId1 (if known/needed for matching)
    friendId2?: string  // friend_id representing userId2 (if known/needed for matching)
): number {
    // Helper to check if an ID matches user1
    const matchesUser1 = (id: string | undefined | null) => {
        if (!id) return false;
        return id === userId1 || (friendId1 && id === friendId1);
    };

    // Helper to check if an ID matches user2
    const matchesUser2 = (id: string | undefined | null) => {
        if (!id) return false;
        return id === userId2 || (friendId2 && id === friendId2);
    };

    // 1. Calculate Net Balances for everyone in the expense
    const nets = new Map<string, number>();

    expense.expense_splits.forEach((s: any) => {
        // We use user_id as primary key if available, else friend_id
        // Actually, better to normalize: IF user_id is present on split, key is user_id.
        // IF only friend_id, key is 'F:'+friend_id to avoid collision? 
        // Or simpler: The inputs userId1/userId2 are our targets. We just need to know if 'this split' belongs to them.
        // But to calculate 'simplify debt', we need the FULL graph of the expense.
        
        // Let's use a composite key or just normalize everything to "The Identity String"
        // But backend splits have user_id (nullable) and friend_id (nullable).
        // Let's rely on the fact that for pairwise calc, we only care about A and B's roles *after* simplification.
        // But Simplification requires knowing everybody's net.
        
        // Strategy: Use a generated unique ID for each participant for the purpose of this calculation.
        // If s.user_id exists, use it. If not, use s.friend_id.
        
        const id = s.user_id || s.friend_id;
        if (!id) return;

        const paid = parseFloat(s.paid_amount || '0');
        const cost = parseFloat(s.amount || '0');
        
        const current = nets.get(id) || 0;
        nets.set(id, current + (paid - cost));
    });

    // 2. Separate into Debtors and Creditors
    const debtors: { id: string, amount: number }[] = [];
    const creditors: { id: string, amount: number }[] = [];

    nets.forEach((amount, id) => {
        if (amount < -0.01) debtors.push({ id, amount });
        if (amount > 0.01) creditors.push({ id, amount });
    });

    // 3. Sort (Debtors Asc, Creditors Desc)
    debtors.sort((a, b) => a.amount - b.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    // 4. Resolve Transfers specific to User1 <-> User2
    let balanceDelta = 0; // +ve means User2 owes User1

    let i = 0;
    let j = 0;

    while (i < debtors.length && j < creditors.length) {
        const debtor = debtors[i];
        const creditor = creditors[j];

        // How much can be transferred?
        const amount = Math.min(Math.abs(debtor.amount), creditor.amount);

        // Check if this transfer involves User1 and User2
        const debtorIsUser1 = matchesUser1(debtor.id);
        const debtorIsUser2 = matchesUser2(debtor.id);
        const creditorIsUser1 = matchesUser1(creditor.id);
        const creditorIsUser2 = matchesUser2(creditor.id);

        if (debtorIsUser2 && creditorIsUser1) {
            // User2 pays User1 (User2 owes User1) -> Positive balance for User1
            balanceDelta += amount;
        } else if (debtorIsUser1 && creditorIsUser2) {
            // User1 pays User2 (User1 owes User2) -> Negative balance for User1
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
