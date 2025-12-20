
import { describe, it, expect } from 'vitest';
import { calculatePairwiseExpenseDebt, matchesMember, type GroupMember } from '../utils/groupBalanceUtils';
import { getFriendBalanceBreakdown } from '../utils/balanceBreakdown';

// Mock Data Types to match strict TS interfaces
const mockUser = { id: 'user_A', name: 'Me', email: 'me@test.com', avatar: '' };
const mockFriend = { id: 'friend_B', name: 'Friend B', email: 'b@test.com', avatar: '', balance: 0, owner_id: 'user_A', linked_user_id: 'user_B' };

const meRef: GroupMember = { id: 'user_A', userId: 'user_A' };
const friendRef: GroupMember = { id: 'friend_B', userId: 'user_B' };

describe('Frontend Balance Consistency', () => {

    describe('Core Math Consistency (Group Utils vs Breakdown Utils)', () => {
        // Scenario: Multi-Payer Split
        // Total 100. A paid 60, B paid 40.
        // Split: A=50, B=50.
        // Net: A paid 60, cost 50 -> +10.
        // Net: B paid 40, cost 50 -> -10.
        // Expected: B owes A 10.
        
        const expense = {
            id: 'exp1',
            groupId: 'g1',
            description: 'Test',
            amount: 100,
            date: new Date().toISOString(),
            payerId: 'user_A',
            splits: [
                { userId: 'user_A', amount: 50, paidAmount: 60 },
                { userId: 'user_B', amount: 50, paidAmount: 40 }
            ],
            deleted: false,
            created_by: 'user_A'
        };

        it('groupBalanceUtils calculates correct pairwise debt', () => {
            // Me vs Friend
            const debt = calculatePairwiseExpenseDebt(expense, meRef, friendRef);
            // Result > 0 means Them (Friend) owes Me.
            expect(debt).toBeCloseTo(10, 2);
        });

        it('balanceBreakdown calculates IDENTICAL debt for same inputs', () => {
            // We need to construct the environment for getFriendBalanceBreakdown
            const group = { id: 'g1', name: 'G1', type: 'trip' as const, members: [
                { id: 'user_A', userId: 'user_A', name: 'Me' },
                { id: 'friend_B', userId: 'user_B', name: 'Friend B' }
            ]};

            const breakdown = getFriendBalanceBreakdown(
                mockFriend,
                mockUser,
                [group],
                [expense],
                [] // no transactions
            );

            // Expect 1 group item
            expect(breakdown).toHaveLength(1);
            expect(breakdown[0].amount).toBeCloseTo(10, 2);
            expect(breakdown[0].name).toBe('G1');
        });
    });

    describe('Complex Multi-Payer Scenario', () => {
        // A=400 (Paid 1000), B=400 (Paid 200), C=400 (Paid 0). Total 1200.
        // A Net: +600.
        // B Net: -200.
        // C Net: -400.
        // B owes A 200. C owes A 400.
        
        const expense = {
            id: 'exp_complex',
            groupId: 'g1',
            description: 'Complex',
            amount: 1200,
            date: new Date().toISOString(),
            payerId: 'user_A',
            splits: [
                { userId: 'user_A', amount: 400, paidAmount: 1000 },
                { userId: 'user_B', amount: 400, paidAmount: 200 },
                { userId: 'user_C', amount: 400, paidAmount: 0 }
            ],
            deleted: false,
            created_by: 'user_A'
        };

        it('Correctly attributes debt between A and B', () => {
             const debt = calculatePairwiseExpenseDebt(expense, meRef, friendRef); // A vs B
             expect(debt).toBeCloseTo(200, 2);
        });
        it('accumulates penny rounding correctly', () => {
            // 3 expenses of 100 split 3 ways (33.33 each, one person pays 0.01 extra)
            // Backend handles this by storing splits as 33.33, 33.33, 33.34.
            // Let's assume we have 3 expenses where user_A pays 33.33 for user_B.
            
            const exp1 = {
                id: 'exp1', groupId: 'g1', description: 'Penny', amount: 33.33, date: new Date().toISOString(), payerId: 'user_A',
                splits: [{ userId: 'user_A', amount: 0, paidAmount: 33.33 }, { userId: 'user_B', amount: 33.33, paidAmount: 0 }],
                deleted: false, created_by: 'user_A'
            };
            const exp2 = { ...exp1, id: 'exp2', splits: [{ userId: 'user_A', amount: 0, paidAmount: 33.33 }, { userId: 'user_B', amount: 33.33, paidAmount: 0 }] };
            const exp3 = { ...exp1, id: 'exp3', splits: [{ userId: 'user_A', amount: 0, paidAmount: 33.33 }, { userId: 'user_B', amount: 33.33, paidAmount: 0 }] };

            const group = { id: 'g1', name: 'G1', type: 'trip' as const, members: [
                { id: 'user_A', userId: 'user_A', name: 'Me' },
                { id: 'friend_B', userId: 'user_B', name: 'Friend B' }
            ]};

            const breakdown = getFriendBalanceBreakdown(mockFriend, mockUser, [group], [exp1, exp2, exp3], []);
            
            // Total should be 99.99
            expect(breakdown[0].amount).toBeCloseTo(99.99, 2);
        });
        });

        it('maintains consistency when applying settle-up transactions', () => {
             // Scenario: A paid 100 for B in Group G.
             // Then B pays A 50 (Partial Settle Up).
             // Both Group View and Friend View should show "B owes A 50".
             
             const expense = {
                id: 'exp_settle', groupId: 'g1', description: 'Lunch', amount: 100, date: new Date().toISOString(), payerId: 'user_A',
                splits: [{ userId: 'user_A', amount: 0, paidAmount: 100 }, { userId: 'user_B', amount: 50, paidAmount: 0 }], // A paid 100? Wait. Amount 100. Split 50 owed by B?
                // Split logic: cost for A is 50, cost for B is 50.
                // Splits array defines OWED amounts (cost). A owes 50, B owes 50.
                // Payer logic (paidAmount) defines who paid. A paid 100.
                // My mock structure here: Splits: [{userId: A, amount: 50, paidAmount: 100}, {userId: B, amount: 50, paidAmount: 0}]
             };
             
             // Correcting the mock expense structure for "Split equally"
             const validExpense = {
                 ...expense,
                 splits: [
                     { userId: 'user_A', amount: 50, paidAmount: 100 }, 
                     { userId: 'user_B', amount: 50, paidAmount: 0 }
                 ]
             };

             const transaction = {
                 id: 'trans_1', groupId: 'g1', fromId: 'user_B', toId: 'user_A', amount: 50, date: new Date().toISOString(), deleted: false
             };

             const group = { id: 'g1', name: 'G1', type: 'trip' as const, members: [
                { id: 'user_A', userId: 'user_A', name: 'Me' },
                { id: 'friend_B', userId: 'user_B', name: 'Friend B' } // Friend B has member ID 'friend_B'
             ]};

             // 1. Check Group Balance Logic (simulate useGroupBalance loop)
             // We need to calc expense debt + transaction debt
             let groupBal = 0;
             const meRef = { id: 'user_A', userId: 'user_A' };
             const friendRef = { id: 'friend_B', userId: 'user_B' };

             // Expense effect
             groupBal += calculatePairwiseExpenseDebt(validExpense, meRef, friendRef); 
             // Should be 50 (B owes A)
             
             // Transaction effect (B pays A)
             // matchesMember(trans.from, friendRef) && matchesMember(trans.to, meRef) -> bal -= amount
             if (matchesMember(transaction.fromId, meRef) && matchesMember(transaction.toId, friendRef)) {
                 groupBal += transaction.amount;
             } else if (matchesMember(transaction.fromId, friendRef) && matchesMember(transaction.toId, meRef)) {
                 groupBal -= transaction.amount;
             }
             
             expect(groupBal).toBe(0); // 50 - 50 = 0? 
             // Wait. Expense: B owes A 50. (+50)
             // Transaction: B pays A 50. (-50)
             // Result: 0.

             // 2. Check Friend Balance Breakdown Logic
             const breakdown = getFriendBalanceBreakdown(mockFriend, mockUser, [group], [validExpense], [transaction]);
             
             // Should be 0 (or close to 0) -> Empty array if < 0.01
             if (breakdown.length > 0) {
                 expect(breakdown[0].amount).toBeCloseTo(0, 2);
             } else {
                 expect(breakdown.length).toBe(0);
             }
        });

});
