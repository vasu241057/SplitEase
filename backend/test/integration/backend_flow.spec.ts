
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
// We need to import the route, but we must mock the dependency FIRST.
import { StatefulSupabaseMock } from '../helpers/statefulMock';

// 1. Setup Shared State
const sharedMock = new StatefulSupabaseMock({
    profiles: [
        { id: 'user_A', full_name: 'User A' },
        { id: 'user_B', full_name: 'User B' }
    ],
    friends: [
        { id: 'friend_AB', owner_id: 'user_A', linked_user_id: 'user_B', name: 'User B', balance: 0 },
        { id: 'friend_BA', owner_id: 'user_B', linked_user_id: 'user_A', name: 'User A', balance: 0 }
    ]
});

// 2. Mock Supabase Client Factory
vi.mock('../../src/supabase', () => ({
    createSupabaseClient: () => sharedMock
}));

// 3. Mock Auth Middleware (Always User A)
vi.mock('../../src/middleware/auth', () => ({
    authMiddleware: (req: any, res: any, next: any) => {
        req.user = { id: 'user_A' };
        next();
    }
}));

// 4. Mock Push Notifications (to avoid error)
vi.mock('../../src/utils/push', () => ({
    sendPushNotification: vi.fn()
}));

// Import Routes AFTER mocking
import expenseRoutes from '../../src/routes/expenses';

const app = express();
app.use(express.json());
app.use('/expenses', expenseRoutes);

describe('Backend Integration Flow (Stateful Mock)', () => {
    
    beforeEach(() => {
        // Reset DB State roughly? Or keep accumulating?
        // For a flow test, accumulating is good.
        // We just ensure initial clean state if possible.
        // Or we just checking a sequence.
    });

    it('Scenario: A pays for Lunch, then Cab, then B Settles Up', async () => {
        // === Step 1: Initial State ===
        // Friend AB (A's view of B) should be 0.
        let friendAB = sharedMock.dataStore.friends.find(f => f.id === 'friend_AB');
        expect(friendAB.balance).toBe(0);

        // === Step 2: A pays 100 for Lunch (Split 50/50) ===
        // A Paid 100. Cost 50. Net +50.
        // B Paid 0. Cost 50. Net -50.
        // B owes A 50.
        const res1 = await request(app).post('/expenses').send({
            description: 'Lunch',
            amount: 100,
            payerId: 'user_A', // Use Global User ID explicitly
            groupId: null, // Non-group
            splits: [
                { userId: 'user_A', amount: 50, paidAmount: 100 },
                { userId: 'user_B', amount: 50, paidAmount: 0 }
            ]
        });
        
        expect(res1.status).toBe(201);
        expect(res1.body.payerId).toBe('user_A');

        // Verify Side Effects (Recalculation)
        // Recalculation runs IN-BAND in the route (awaited).
        friendAB = sharedMock.dataStore.friends.find(f => f.id === 'friend_AB');
        expect(friendAB.balance).toBe(50); // B owes A 50.

        // Check Inverse? (B's view of A)
        // Logic might not update B's view if B didn't trigger it? 
        // RecalculateBalances (Multi-User) iterates ALL friends?
        // Yes, the implementation fetches ALL friends and iterates expenses.
        // So B's view should also update.
        const friendBA = sharedMock.dataStore.friends.find(f => f.id === 'friend_BA');
        expect(friendBA.balance).toBe(-50); // A owes B -50 (i.e. B owes A 50)

        // === Invariant Check ===
        expect(friendAB.balance + friendBA.balance).toBe(0);


        // === Step 3: A pays 50 for Cab (Split 50/50) ===
        // A Paid 50. Cost 25. Net +25.
        // B Paid 0. Cost 25. Net -25.
        // Accumulate: B owes A (50 + 25) = 75.
        const res2 = await request(app).post('/expenses').send({
            description: 'Cab',
            amount: 50,
            payerId: 'user_A',
            splits: [
                { userId: 'user_A', amount: 25, paidAmount: 50 },
                { userId: 'user_B', amount: 25, paidAmount: 0 }
            ]
        });
        expect(res2.status).toBe(201);

        friendAB = sharedMock.dataStore.friends.find(f => f.id === 'friend_AB');
        expect(friendAB.balance).toBe(75);
        
        // === Step 4: B Settles Up 75 ===
        // Ideally this is a POST /transactions usually?
        // Or simply recorded as a payment?
        // The implementation reads from 'transactions' table.
        // We need an endpoint to create a transaction OR we insert directly to mock?
        // Let's assume we don't have a route test for transactions in this file...
        // But we can simulate the "Settle Up" by inserting into the mock manually 
        // and then calling recalculate via an endpoint or manually?
        // Let's trigger a dummy update to an expense to force recalculation?
        // Or finding a route that adds a transaction.
        
        // Since we are testing *Backend Flow*, and we mocked the DB,
        // we can inject the Transaction directly and then call an endpoint that triggers recalc.
        // PUT /expenses/:id triggers recalc.
        
        sharedMock.dataStore.transactions.push({
            id: 'tx_1',
            type: 'paid', // B paid A
            amount: 75,
            friend_id: 'friend_BA', // B created it, paying A (Friend BA is "User A" from B's eyes)
            created_by: 'user_B',
            deleted: false
        });
        
        // We need to trigger recalculate. 
        // Let's toggle the deleted status of expense 1 back and forth?
        // Or just POST a dummy expense and delete it?
        await request(app).delete(`/expenses/${res2.body.id}`); // This triggers recalc
        
        // Wait... if I delete the expense (Cab), the debt from Cab (25) is gone.
        // So TOTAL debt should be: 50 (Lunch) - 75 (Payment) = -25 (Overpaid).
        // Let's restore it to verify correct state.
        await request(app).post(`/expenses/${res2.body.id}/restore`); 
        
        // Final State:
        // Debt: 75.
        // Payment: 75.
        // Balance: 0.
        
        friendAB = sharedMock.dataStore.friends.find(f => f.id === 'friend_AB');
        expect(friendAB.balance).toBe(0);
        
        const friendBAFinal = sharedMock.dataStore.friends.find(f => f.id === 'friend_BA');
        expect(friendBAFinal.balance).toBe(0);
    });
});
