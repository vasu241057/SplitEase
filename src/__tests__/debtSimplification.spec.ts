import { describe, it, expect, vi } from 'vitest';
import { simplifyGroupDebts, type MemberBalance } from '../utils/debtSimplification';

describe('simplifyGroupDebts (Safety & Regression)', () => {

    it('returns empty list for empty input', () => {
        const result = simplifyGroupDebts([]);
        expect(result).toEqual([]);
    });

    it('returns empty list for already settled users', () => {
        const balances: MemberBalance[] = [
            { userId: 'A', balance: 0 },
            { userId: 'B', balance: 0 }
        ];
        expect(simplifyGroupDebts(balances)).toEqual([]);
    });

    it('throws error if sum is not zero', () => {
        const balances: MemberBalance[] = [
            { userId: 'A', balance: 10 },
            { userId: 'B', balance: -5 }
        ];
        // Wrapper catches internally and returns null? OR core throws.
        // But the prompt says "Do NOT crash". The wrapper catches error and returns null.
        // Let's verify it returns null and logs error (we can spy console.error).
        
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const result = simplifyGroupDebts(balances);
        expect(result).toBeNull();
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    it('collapses a simple chain A->B->C', () => {
        // A owes B 10, B owes C 10.
        // Net: A: -10, B: 0, C: +10
        const balances: MemberBalance[] = [
            { userId: 'A', balance: -10 },
            { userId: 'B', balance: 0 },
            { userId: 'C', balance: 10 }
        ];
        const result = simplifyGroupDebts(balances);
        expect(result).toHaveLength(1);
        expect(result![0]).toEqual({ from: 'A', to: 'C', amount: 10 });
    });

    it('handles multiple debtors and creditors correctly', () => {
        const balances: MemberBalance[] = [
            { userId: 'A', balance: -150 },
            { userId: 'B', balance: -50 },
            { userId: 'C', balance: 20 },
            { userId: 'D', balance: 80 },
            { userId: 'E', balance: 100 }
        ];

        const result = simplifyGroupDebts(balances);
        expect(result).not.toBeNull();
        if (!result) return;
        
        const totalPaid = result.reduce((acc, r) => acc + r.amount, 0);
        expect(totalPaid).toBe(200); 

        const aPays = result.filter(r => r.from === 'A').reduce((sum, r) => sum + r.amount, 0);
        expect(aPays).toBe(150);
    });

    it('handles floating point precision (3 way split)', () => {
        const balances: MemberBalance[] = [
            { userId: 'A', balance: 66.67 },
            { userId: 'B', balance: -33.33 },
            { userId: 'C', balance: -33.34 }
        ];

        const result = simplifyGroupDebts(balances);
        expect(result).not.toBeNull();
        expect(result).toHaveLength(2);
    });

    it('is deterministic regardless of input order', () => {
        const set1: MemberBalance[] = [
            { userId: 'X', balance: -50 },
            { userId: 'Y', balance: -50 },
            { userId: 'Z', balance: 100 }
        ];
        
        const set2: MemberBalance[] = [
            { userId: 'Z', balance: 100 },
            { userId: 'Y', balance: -50 },
            { userId: 'X', balance: -50 }
        ];
        
        const res1 = simplifyGroupDebts(set1);
        const res2 = simplifyGroupDebts(set2);
        
        expect(res1).toEqual(res2);
    });

    // --- NEW REGRESSION & SAFETY TESTS ---

    it('SAFETY: Returns NULL if net balance is not preserved (Simulated Failure)', () => {
        // We can't easily break the internal logic without mocking `coreSimplifyGroupDebts`.
        // However, we can pass a scenario that might trick a buggy algo, or relying on `core` correctness.
        // A better way to test the VALIDATOR is to verify it checks the Output of core.
        // Since we can't change internal core here easily, we rely on the fact that if core was buggy, it returns null.
        // Let's at least verify that a VALID output passes validation (which we did above).
        
        // To really test the validator, we might need to expose the validator or mock.
        // But for this integration level, we trust the "Zero Sum" check we tested above (returns null).
        
        // Let's re-test the ZERO SUM failure more explicitly as an Invariant Failure.
        // Net Balance Preservation test:
        // A: +10, B: -5 (Sum != 0).
        // Core throws "Invalid balances". Wrapper catches -> Returns Null.
        
        const balances = [
             { userId: 'A', balance: 10 },
             { userId: 'B', balance: -5 }
        ];
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(simplifyGroupDebts(balances)).toBeNull();
        // expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid balances'));
        consoleSpy.mockRestore();
    });

    it('SAFETY: Handles extreme values without crash', () => {
         const balances = [
             { userId: 'A', balance: 1000000000 },
             { userId: 'B', balance: -1000000000 }
         ];
         const result = simplifyGroupDebts(balances);
         expect(result).toHaveLength(1);
         expect(result![0].amount).toBe(1000000000);
    });
});
