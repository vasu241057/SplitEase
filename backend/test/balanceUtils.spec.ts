import { describe, it, expect } from 'vitest';
import { calculatePairwiseExpenseDebt } from '../src/utils/balanceUtils';

describe('balanceUtils: calculatePairwiseExpenseDebt', () => {
    
    // 🧪 Solipsist Split
    it('returns 0 when payer pays 100% and splits 100% to self', () => {
        const expense = {
            amount: 100,
            expense_splits: [
                { user_id: 'A', amount: 100, paid_amount: 100 }
            ]
        };
        // A vs B
        const result = calculatePairwiseExpenseDebt(expense, 'A', 'B');
        expect(result).toBe(0);
    });

    // 💰 Penny Split (Rounding)
    it('handles penny rounding robustness (33.33 split)', () => {
        // Total 100. Payer A. 3 people (A, B, C).
        // Splits: 33.33, 33.33, 33.34 (sum 100)
        // A paid 100.
        // B owes A 33.33. C owes A 33.34.
        const expense = {
            amount: 100,
            expense_splits: [
                { user_id: 'A', amount: 33.33, paid_amount: 100 },
                { user_id: 'B', amount: 33.33, paid_amount: 0 },
                { user_id: 'C', amount: 33.34, paid_amount: 0 }
            ]
        };

        const bOwesA = calculatePairwiseExpenseDebt(expense, 'A', 'B');
        expect(bOwesA).toBeCloseTo(33.33, 2);

        const cOwesA = calculatePairwiseExpenseDebt(expense, 'A', 'C');
        expect(cOwesA).toBeCloseTo(33.34, 2);
    });

    // 🔥 Multi-Payer: The "Bug" Scenario
    it('correctly credits partial payer (A=1000, B=200, Total=1200, Equal Split)', () => {
        // Correct: A Paid 1000 (Share 400) -> +600
        //          B Paid  200 (Share 400) -> -200
        //          C Paid    0 (Share 400) -> -400
        // Simplified: B owes A 200. C owes A 400.
        const expense = {
            amount: 1200,
            expense_splits: [
                { user_id: 'A', amount: 400, paid_amount: 1000 },
                { user_id: 'B', amount: 400, paid_amount: 200 },
                { user_id: 'C', amount: 400, paid_amount: 0 }
            ]
        };

        const bOwesA = calculatePairwiseExpenseDebt(expense, 'A', 'B');
        expect(bOwesA).toBeCloseTo(200, 2); 
    });

    // 🔄 Overpayment (Net Creditor vs Net Creditor?)
    // No, Simplify Debt matches Debtors to Creditors.
    // Scenario: A Paid 1200 (Share 400). B Paid 0 (Share 400). C Paid 0 (Share 400).
    // A is +800. B is -400. C is -400.
    // B owes A 400.
    it('handles single payer for 3 people', () => {
        const expense = {
            amount: 1200,
            expense_splits: [
                { user_id: 'A', amount: 400, paid_amount: 1200 },
                { user_id: 'B', amount: 400, paid_amount: 0 },
                { user_id: 'C', amount: 400, paid_amount: 0 }
            ]
        };
        const bOwesA = calculatePairwiseExpenseDebt(expense, 'A', 'B');
        expect(bOwesA).toBeCloseTo(400, 2);
    });

    // 🧪 Zero Amount Expense (Edge Case)
    it('returns 0 for zero amount expense', () => {
         const expense = {
            amount: 0,
            expense_splits: [
                { user_id: 'A', amount: 0, paid_amount: 0 },
                { user_id: 'B', amount: 0, paid_amount: 0 }
            ]
        };
        const result = calculatePairwiseExpenseDebt(expense, 'A', 'B');
        expect(result).toBe(0);
    });

    // 🔄 Payer not in Split (Third Party)
    it('handles payer who is not in the split (paid for others)', () => {
        // A paid 100. Split between B and C (50 each).
        // A: +100. B: -50. C: -50.
        // B owes A 50.
        const expense = {
            amount: 100,
            expense_splits: [
                { user_id: 'A', amount: 0, paid_amount: 100 }, // Payer, share 0
                { user_id: 'B', amount: 50, paid_amount: 0 },
                { user_id: 'C', amount: 50, paid_amount: 0 }
            ]
        };
        const result = calculatePairwiseExpenseDebt(expense, 'A', 'B');
        expect(result).toBeCloseTo(50, 2);
    });

    // 🧪 Friend ID Alias Matching
    it('matches users by friend_id alias if needed', () => {
         // Same scenario: A paid 100, B share 50.
         // But split uses 'friend_id', we query with 'userId'
         const expense = {
            amount: 100,
            expense_splits: [
                { friend_id: 'friend_A', amount: 0, paid_amount: 100 }, 
                { friend_id: 'friend_B', amount: 50, paid_amount: 0 },
                { friend_id: 'friend_C', amount: 50, paid_amount: 0 }
            ]
        };
        // userId: 'user_A', friendId: 'friend_A'
        const result = calculatePairwiseExpenseDebt(
            expense, 
            'user_A', 'user_B', 
            'friend_A', 'friend_B'
        );
        expect(result).toBeCloseTo(50, 2);
    });
});
