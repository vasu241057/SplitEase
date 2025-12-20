import { describe, it, expect } from 'vitest';
import { calculatePairwiseExpenseDebt } from '../src/utils/balanceUtils';

// Helper to calculate total net position for a user across all peers
function calculateNetPosition(userId: string, peers: string[], expense: any) {
    let net = 0;
    peers.forEach(peerId => {
        if (peerId === userId) return;
        // Debt from Me to Peer (Negative means I owe them)
        // calculatePairwiseExpenseDebt(expense, userId, peerId) returns > 0 if peer owes me.
        const balanceAndSign = calculatePairwiseExpenseDebt(expense, userId, peerId, undefined, undefined);
        net += balanceAndSign;
    });
    return net;
}

describe('Global Ledger Invariants (Backend)', () => {
    
    describe('Conservation of Money (Zero-Sum Property)', () => {
        
        it('Standard Split: Sum of all net balances must be 0', () => {
            // Scenario: A pays 60. Split: A=20, B=20, C=20.
            const users = ['user_A', 'user_B', 'user_C'];
            const expense = {
                amount: 60,
                expense_splits: [
                    { user_id: 'user_A', amount: 20, paid_amount: 60 },
                    { user_id: 'user_B', amount: 20, paid_amount: 0 },
                    { user_id: 'user_C', amount: 20, paid_amount: 0 }
                ]
            };

            let systemSum = 0;
            users.forEach(u => {
                const net = calculateNetPosition(u, users, expense);
                systemSum += net;
            });

            expect(systemSum).toBeCloseTo(0, 5);
        });

        it('Multi-Payer Complex: Sum of all net balances must be 0', () => {
             // Scenario: Total 100.
             // A pays 60, B pays 40.
             // Splits: A=10, B=30, C=60.
             // A's position: Paid 60, Consumed 10. Net +50.
             // B's position: Paid 40, Consumed 30. Net +10.
             // C's position: Paid 0, Consumed 60. Net -60.
             // Total: 50 + 10 - 60 = 0.
             
             const users = ['user_A', 'user_B', 'user_C'];
             const expense = {
                 amount: 100,
                 expense_splits: [
                     { user_id: 'user_A', amount: 10, paid_amount: 60 },
                     { user_id: 'user_B', amount: 30, paid_amount: 40 },
                     { user_id: 'user_C', amount: 60, paid_amount: 0 }
                 ]
             };
 
             let systemSum = 0;
             users.forEach(u => {
                 const net = calculateNetPosition(u, users, expense);
                 systemSum += net;
             });
             
             expect(systemSum).toBeCloseTo(0, 5);
        });

        it('Weird Pennies: Sum of all net balances must be 0', () => {
            // Scenario: 100 / 3.
            // A Pays 100.
            // A=33.34, B=33.33, C=33.33.
            // A Net: +100 - 33.34 = +66.66
            // B Net: -33.33
            // C Net: -33.33
            // Sum: 66.66 - 33.33 - 33.33 = 0.
            
            const users = ['user_A', 'user_B', 'user_C'];
             const expense = {
                 amount: 100,
                 expense_splits: [
                     { user_id: 'user_A', amount: 33.34, paid_amount: 100 },
                     { user_id: 'user_B', amount: 33.33, paid_amount: 0 },
                     { user_id: 'user_C', amount: 33.33, paid_amount: 0 }
                 ]
             };
 
             let systemSum = 0;
             users.forEach(u => {
                 const net = calculateNetPosition(u, users, expense);
                 systemSum += net;
             });
             
             expect(systemSum).toBeCloseTo(0, 10);
        });
    });

    describe('State Validity', () => {
        it('No user can be net positive and negative simultaneously', () => {
            // This is implicitly handled by the return value being a scalar,
            // but let's verify that a user X doesn't owe Y while Z owes X 
            // in a way that creates "simultaneous states" that are invalid?
            // Actually, the prompt says "No user is both debtor & creditor for same expense".
            // This means for a single expense, your net position is strictly >0, <0, or 0.
            
            const expense = {
                 amount: 1200,
                 expense_splits: [
                     { user_id: 'user_A', amount: 400, paid_amount: 1000 }, // +600
                     { user_id: 'user_B', amount: 400, paid_amount: 200 },  // -200
                     { user_id: 'user_C', amount: 400, paid_amount: 0 }     // -400
                 ]
             };
             
             // Check A
             const users = ['user_A', 'user_B', 'user_C'];
             const netA = calculateNetPosition('user_A', users, expense);
             // Verify we don't return ambiguous results
             expect(netA).toBeGreaterThan(0);
             
             // Check B
             const netB = calculateNetPosition('user_B', users, expense);
             expect(netB).toBeLessThan(0);
        });
    });
});
