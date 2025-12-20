import { describe, it, expect } from 'vitest';
import { applyTransactionsToNetBalances } from '../src/utils/transactionHelpers';

describe('transactionHelpers: applyTransactionsToNetBalances', () => {

    // 🧪 Basic 1-to-1 Settle Up
    it('correctly reduces debt when A pays B', () => {
        // Balances: A owes B 100. (A: -100, B: +100)
        // Transaction: A pays B 100.
        // Result: A: 0, B: 0.
        const balances: Record<string, number> = {
            'A': -100,
            'B': 100
        };
        const transactions = [
            { fromId: 'A', toId: 'B', amount: 100 }
        ];

        applyTransactionsToNetBalances(transactions as any, balances);

        expect(balances['A']).toBe(0);
        expect(balances['B']).toBe(0);
    });

    // 🔄 Partial Settle Up
    it('handles partial payment correctly', () => {
        // Balances: A owes B 100.
        // Transaction: A pays B 50.
        // Result: A: -50, B: +50.
        const balances: Record<string, number> = {
            'A': -100,
            'B': 100
        };
        const transactions = [
            { fromId: 'A', toId: 'B', amount: 50 }
        ];

        applyTransactionsToNetBalances(transactions as any, balances);

        expect(balances['A']).toBe(-50);
        expect(balances['B']).toBe(50);
    });

    // ⚠️ Overpayment (Flipped Balance)
    it('flips balance direction on overpayment', () => {
        // Balances: A owes B 10.
        // Transaction: A pays B 50.
        // Result: A: +40, B: -40. (B now owes A 40).
        const balances: Record<string, number> = {
            'A': -10,
            'B': 10
        };
        const transactions = [
            { fromId: 'A', toId: 'B', amount: 50 }
        ];

        applyTransactionsToNetBalances(transactions as any, balances);

        expect(balances['A']).toBe(40);
        expect(balances['B']).toBe(-40);
    });

    // ⚡ Multi-Party Settle Up
    it('handles multiple transactions affecting same user', () => {
        // A owes B 100. A owes C 100.
        // A pays B 100. A pays C 50.
        // Expect: A: -50. B: 0. C: +50 (initially C was +100).
        const balances: Record<string, number> = {
            'A': -200,
            'B': 100,
            'C': 100
        };
        const transactions = [
            { fromId: 'A', toId: 'B', amount: 100 },
            { fromId: 'A', toId: 'C', amount: 50 }
        ];

        applyTransactionsToNetBalances(transactions as any, balances);

        expect(balances['A']).toBe(-50);
        expect(balances['B']).toBe(0);
        expect(balances['C']).toBe(50);
    });
});
