import { describe, it, expect } from 'vitest';
import { calculatePairwiseExpenseDebt } from '../../../src/utils/groupBalanceUtils';

describe('groupBalanceUtils: calculatePairwiseExpenseDebt (Frontend)', () => {
    
    // 🧪 Solipsist Split
    it('returns 0 when payer pays 100% and splits 100% to self', () => {
        const expense = {
            amount: 100,
            splits: [
                { userId: 'A', amount: 100, paidAmount: 100 }
            ],
            payerId: 'A' // Legacy field, mostly ignored by robust logic but present in type
        };
        // Me vs Them
        // User A vs User B (B not even in split)
        const result = calculatePairwiseExpenseDebt(expense as any, { id: 'A', userId: 'A' }, { id: 'B', userId: 'B' });
        expect(result).toBe(0);
    });

    // 💰 Penny Split (Rounding)
    it('handles penny rounding robustness (33.33 split)', () => {
        const expense = {
            amount: 100,
            splits: [
                { userId: 'A', amount: 33.33, paidAmount: 100 },
                { userId: 'B', amount: 33.33, paidAmount: 0 },
                { userId: 'C', amount: 33.34, paidAmount: 0 }
            ],
            payerId: 'A'
        };

        const bOwesA = calculatePairwiseExpenseDebt(expense as any, { id: 'A', userId: 'A' }, { id: 'B', userId: 'B' });
        
        // Note: Frontend Utility returns signed float. 
        // Logic: > 0 means Them (B) owes Me (A).
        // B owes A 33.33. So expected +33.33
        expect(bOwesA).toBeCloseTo(33.33, 2);

        const cOwesA = calculatePairwiseExpenseDebt(expense as any, { id: 'A', userId: 'A' }, { id: 'C', userId: 'C' });
        expect(cOwesA).toBeCloseTo(33.34, 2);
    });

    // 🔥 Multi-Payer: The "Bug" Scenario
    it('correctly credits partial payer (A=1000, B=200, Total=1200, Equal Split)', () => {
        // A Paid 1000 (Share 400) -> +600
        // B Paid  200 (Share 400) -> -200
        // C Paid    0 (Share 400) -> -400
        // B owes A 200.
        const expense = {
            amount: 1200,
            splits: [
                { userId: 'A', amount: 400, paidAmount: 1000 },
                { userId: 'B', amount: 400, paidAmount: 200 },
                { userId: 'C', amount: 400, paidAmount: 0 }
            ],
            payerId: 'A'
        };

        const bOwesA = calculatePairwiseExpenseDebt(expense as any, { id: 'A', userId: 'A' }, { id: 'B', userId: 'B' });
        expect(bOwesA).toBeCloseTo(200, 2); 
    });

     // 🔄 Payer not in Split (Third Party)
    it('handles payer who is not in the split', () => {
        // A paid 100. Share 0.
        // B share 50. C share 50.
        // B owes A 50.
        const expense = {
            amount: 100,
            splits: [
                 // A is not in splits list usually if share is 0? 
                 // Or A is in splits list with amount 0 and paidAmount 100?
                 // The utility handles both. Let's assume explicit record.
                { userId: 'A', amount: 0, paidAmount: 100 },
                { userId: 'B', amount: 50, paidAmount: 0 },
                { userId: 'C', amount: 50, paidAmount: 0 }
            ],
            payerId: 'A'
        };
        const result = calculatePairwiseExpenseDebt(expense as any, { id: 'A', userId: 'A' }, { id: 'B', userId: 'B' });
        expect(result).toBeCloseTo(50, 2);
    });
});
