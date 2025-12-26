export type SimplifiedDebt = {
    from: string;
    to: string;
    amount: number;
};

export type MemberBalance = {
    userId: string;
    balance: number;
};

/**
 * Simplifies a list of net balances into the minimum number of transactions
 * using a greedy algorithm.
 *
 * Constraints:
 * - Input balances must sum to zero (within epsilon).
 * - Deterministic output (Sorting by amount DESC, then userId ASC).
 * - Returns a list of payment instructions.
 * 
 * @param balances List of users and their net balances (+ve = owed, -ve = owes)
 * @returns List of simplified debt instructions
 */
const EPSILON = 0.005; // 0.5 paise tolerance

/**
 * Internal core greedy algorithm.
 * Simplifies a list of net balances into the minimum number of transactions.
 */
function coreSimplifyGroupDebts(balances: MemberBalance[]): SimplifiedDebt[] {
    // 1. Validate Input (Sum must be ~0)
    const totalBalance = balances.reduce((sum, b) => sum + b.balance, 0);
    
    if (Math.abs(totalBalance) > EPSILON) {
       throw new Error(`Invalid balances: Sum is ${totalBalance}, expected 0.`);
    }

    // 2. Separate into Debtors and Creditors & Filter zeros
    // We work with PAISE (sub-units) to avoid floating point issues during the loop
    const debtors: { userId: string; amount: number }[] = [];
    const creditors: { userId: string; amount: number }[] = [];
    
    balances.forEach(b => {
        if (Math.abs(b.balance) < EPSILON) return;
        
        // Round to nearest paisa to ensure stability
        const paise = Math.round(b.balance * 100);
        
        if (paise < 0) {
            debtors.push({ userId: b.userId, amount: -paise }); // Store as positive debt
        } else if (paise > 0) {
            creditors.push({ userId: b.userId, amount: paise });
        }
    });

    // 3. Sort Deterministically
    // Primary: Amount (Descending) - Greedy approach
    // Secondary: ID (Ascending) - Consistency
    const sortFn = (a: { userId: string; amount: number }, b: { userId: string; amount: number }) => {
        if (b.amount !== a.amount) {
            return b.amount - a.amount;
        }
        return a.userId < b.userId ? -1 : 1;
    };

    debtors.sort(sortFn);
    creditors.sort(sortFn);

    const results: SimplifiedDebt[] = [];

    // 4. Greedy Match
    let debtorIdx = 0;
    let creditorIdx = 0;

    while (debtorIdx < debtors.length && creditorIdx < creditors.length) {
        const debtor = debtors[debtorIdx];
        const creditor = creditors[creditorIdx];

        // The amount to settle is the minimum of what is owed vs what is owed to creditor
        const amountPaise = Math.min(debtor.amount, creditor.amount);

        // Record valid transaction
        if (amountPaise > 0) {
            results.push({
                from: debtor.userId,
                to: creditor.userId,
                amount: amountPaise / 100
            });
        }

        // Update internal tracking
        debtor.amount -= amountPaise;
        creditor.amount -= amountPaise;

        // Move pointers if settled
        if (debtor.amount === 0) debtorIdx++;
        if (creditor.amount === 0) creditorIdx++;
    }

    return results;
}

/**
 * Public safe wrapper.
 * Runs the simplification and validates strict financial invariants.
 * Returns NULL if any invariant is violated, triggering a safe fallback to raw ledger.
 */
export function simplifyGroupDebts(balances: MemberBalance[]): SimplifiedDebt[] | null {
    try {
        const results = coreSimplifyGroupDebts(balances);

        // --- INVARIANT VALIDATION ---
        
        // 1. Validate Net Position Preservation
        // For every user: FinalNetChange == InitialBalance
        // FinalNetChange = (Sum Received) - (Sum Paid)
        // InitialBalance = +ve (owed to me) / -ve (I owe)
        // Wait: The Prompt definitions:
        // Input: +ve (Owed), -ve (Owes)
        // Output Instructions: (Payer, Payee, Amount) -> Payer pays Payee.
        // Payer's balance increases (becomes less negative).
        // Payee's balance decreases (becomes less positive).
        
        const verificationMap = new Map<string, number>();
        
        // Load initial state (inverted logic compared to flow? No.)
        // If I am +100 (Creditor), I should Receive 100 via transactions.
        // If I am -100 (Debtor), I should Pay 100 via transactions.
        // Check: NetChangeFromTransactions == InitialBalance?
        // Let's calculate implied balance from transactions:
        // implied = (Received) - (Paid)
        // Should equal InitialBalance.
        
        results.forEach(tx => {
            verificationMap.set(tx.to, (verificationMap.get(tx.to) || 0) + tx.amount);
            verificationMap.set(tx.from, (verificationMap.get(tx.from) || 0) - tx.amount);
        });

        for (const user of balances) {
            const initial = user.balance;
            const implied = verificationMap.get(user.userId) || 0;
            
            // Check diff
            if (Math.abs(initial - implied) > EPSILON) {
                console.error(`[SIMPLIFY_DEBTS_INVARIANT_FAIL] Balance mismatch for ${user.userId}. Initial: ${initial}, Implied: ${implied}`);
                return null;
            }
        }

        // 2. Validate Zero Sum of Simplified Edges? 
        // Not strictly needed if (1) passes for all users and sum(initial) is 0, but safe to check.
        // sum(implied) should be 0.
        // Since for every tx, +X and -X are added to map, sum is always 0 by definition of transaction list.

        // 3. Circularity Check (Optional but good)
        // The greedy algo on a DAG shouldn't produce cycles.
        // We can trust Greedy for acyclicity unless logic is broken.
        // Given complexity limits, Net Position check is the strongest guard.

        return results;

    } catch (error) {
        console.error("[SIMPLIFY_DEBTS_Error]", error);
        return null;
    }
}
