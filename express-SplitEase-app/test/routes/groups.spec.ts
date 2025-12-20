import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import groupRoutes from '../../src/routes/groups';

// Mock Supabase
const mockSupabase = {
    from: vi.fn()
};

// Mock the createSupabaseClient function
vi.mock('../../src/supabase', () => ({
    createSupabaseClient: () => mockSupabase
}));

// Mock Middleware to assume logged in user
vi.mock('../../src/middleware/auth', () => ({
    authMiddleware: (req: any, res: any, next: any) => {
        req.user = { id: 'user_A' }; // Default me to A
        next();
    }
}));

const app = express();
app.use(express.json());
app.use('/groups', groupRoutes);

describe('Group Routes Integration', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    function mockTableData(table: string, data: any, op?: string) {
        // This helper can be expanded, but for now we inline logic per test
    }
    
    // Helper to create a Thenable chain with data
    const createChain = (table: string, dataOverrides: any) => {
        const state = { data: [], error: null, ...dataOverrides };
        
        const chain: any = {
            then: (resolve: any) => resolve(state),
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockReturnThis(),
            delete: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis()
        };
        // For 'single', update state to return one item or first item?
        // But some routes call single() on a list result. 
        // We usually just pre-seed 'state.data' as the expected final result of the query.
        return chain;
    };


    describe('DELETE /groups/:id (Delete Group)', () => {
        const expensesMultiPayer = [
             {
                 amount: 1200, payer_user_id: 'user_A',
                 expense_splits: [
                     { user_id: 'user_A', amount: 400, paid_amount: 1000 },
                     { user_id: 'user_B', amount: 400, paid_amount: 200 },
                     { user_id: 'user_C', amount: 400, paid_amount: 0 }
                 ]
             }
         ];

        it('blocks deletion if outstanding balances exist', async () => {
             mockSupabase.from.mockImplementation((table) => {
                 if (table === 'expenses') return createChain(table, { data: expensesMultiPayer });
                 if (table === 'transactions') return createChain(table, { data: [] });
                 if (table === 'groups') return createChain(table, { error: null });
                 return createChain(table, { data: [] });
             });

            const res = await request(app).delete('/groups/group_123');
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/outstanding balances/);
        });

        it('allows deletion if fully settled', async () => {
             const expensesSettled = [
                 { amount: 100, payer_user_id: 'user_A', expense_splits: [{ user_id: 'user_A', amount: 100, paid_amount: 100 }] }
             ];

             mockSupabase.from.mockImplementation((table) => {
                 if (table === 'expenses') return createChain(table, { data: expensesSettled });
                 if (table === 'transactions') return createChain(table, { data: [] });
                 if (table === 'groups') return createChain(table, { error: null });
                 return createChain(table, { data: [] });
             });

             const res = await request(app).delete('/groups/group_123');
             expect(res.status).toBe(204);
        });
    });

    describe('POST /groups/:id/leave (Leave Group)', () => {
        const groupMembers = [
            { friend_id: 'friend_A', friends: { linked_user_id: 'user_A' } },
            { friend_id: 'friend_B', friends: { linked_user_id: 'user_B' } },
            { friend_id: 'friend_C', friends: { linked_user_id: 'user_C' } }
        ];

        const expensesMultiPayer = [
             {
                 amount: 1200, payer_user_id: 'user_A',
                 expense_splits: [
                     { user_id: 'user_A', amount: 400, paid_amount: 1000 },
                     { user_id: 'user_B', amount: 400, paid_amount: 200 },
                     { user_id: 'user_C', amount: 400, paid_amount: 0 }
                 ]
             }
         ];

        it('blocks leaving if outstanding balances exist', async () => {
            mockSupabase.from.mockImplementation((table) => {
                 if (table === 'group_members') {
                     // Route logic:
                     // 1. Select single inner join friends (Find my entry)
                     // 2. Select All Members (for balance check)
                     // 3. Delete (at end)
                     // Because of re-use, we return the "Find my entry" data OR "Members List" data?
                     // The route awaits TWO different calls to 'group_members'.
                     // First call: Find myself. (Expects single object with friend_id)
                     // Second call: List (Expects array).
                     // This simple mock returns the SAME data every time.
                     
                     // We need to implement a stateful mock or check calls?
                     // Let's return a "Super Record" that satisfies both? 
                     // select('...').single() -> Expects object.
                     // select('...').eq() -> Expects array.
                     
                     // If we return an Array that ALSO has properties of a single object? No.
                     // If we return { data: Object }, then .map on it fails.
                     // If we return { data: Array }, then .single() usually implies getting data[0]?
                     // But our mock returns .data directly.
                     
                     // OK, we must use `mockImplementationOnce` for sequence if tables are same.
                     // But table routing is inside the impl.
                     
                     // Let's use internal state to toggle return?
                     // Or check `single` call usage?
                 }
                 
                 // SIMPLIFIED STRATEGY: 
                 // We will skip testing the "Finding Myself" logic if possible or just mock it carefully.
                 // Actually, `mockImplementation` creates a NEW chain each time `from()` is called.
                 // So verify call order in route:
                 // 1. group_members (Find me) -> single()
                 // 2. group_members (List) -> default select
                 // 3. expenses
                 // ...
                 
                 // We can use a counter for 'group_members'.
                 return createChain(table, {}); 
            });
            
             let groupMembersCallCount = 0;
             mockSupabase.from.mockImplementation((table) => {
                 if (table === 'group_members') {
                     groupMembersCallCount++;
                     if (groupMembersCallCount === 1) {
                         // Find Me
                         return createChain(table, { data: { friend_id: 'friend_A', friends: { id: 'friend_A', linked_user_id: 'user_A' } } });
                     } else if (groupMembersCallCount === 2) {
                         // List Members
                         return createChain(table, { data: groupMembers });
                     } else {
                         return createChain(table, {});
                     }
                 }
                 if (table === 'expenses') return createChain(table, { data: expensesMultiPayer });
                 if (table === 'transactions') return createChain(table, { data: [] });
                 return createChain(table, {});
             });

            const res = await request(app).post('/groups/group_123/leave');
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/outstanding balance/);
        });

        it('allows leaving if fully settled', async () => {
             const expensesSettled = [
                 { amount: 100, payer_user_id: 'user_A', expense_splits: [{ user_id: 'user_A', amount: 100, paid_amount: 100 }] }
             ];
             const groupMembersSmall = [
                 { friend_id: 'friend_A', friends: { linked_user_id: 'user_A' } },
                 { friend_id: 'friend_B', friends: { linked_user_id: 'user_B' } }
             ];

             let groupMembersCallCount = 0;
             mockSupabase.from.mockImplementation((table) => {
                 if (table === 'group_members') {
                     groupMembersCallCount++;
                     if (groupMembersCallCount === 1) {
                         // Find Me
                         return createChain(table, { data: { friend_id: 'friend_A', friends: { id: 'friend_A', linked_user_id: 'user_A' } } });
                     } else if (groupMembersCallCount === 2) {
                         // List Members
                         return createChain(table, { data: groupMembersSmall });
                     } else {
                         // DELETE call
                         return createChain(table, { error: null });
                     }
                 }
                 if (table === 'expenses') return createChain(table, { data: expensesSettled });
                 if (table === 'transactions') return createChain(table, { data: [] });
                 return createChain(table, {});
             });

             const res = await request(app).post('/groups/group_123/leave');
             expect(res.status).toBe(200);
        });
    });

    describe('DELETE /groups/:id/members/:friendId (Remove Member)', () => {
         const groupMembers = [
            { friend_id: 'friend_A', friends: { linked_user_id: 'user_A' } },
            { friend_id: 'friend_B', friends: { linked_user_id: 'user_B' } },
            { friend_id: 'friend_C', friends: { linked_user_id: 'user_C' } }
        ];
        
        const expensesMultiPayer = [
             {
                 amount: 1200, payer_user_id: 'user_A',
                 expense_splits: [
                     { user_id: 'user_A', amount: 400, paid_amount: 1000 },
                     { user_id: 'user_B', amount: 400, paid_amount: 200 },
                     { user_id: 'user_C', amount: 400, paid_amount: 0 }
                 ]
             }
         ];

        it('blocks removing member if outstanding balances exist', async () => {
             // Mock call sequence:
             // 1. friends (Find Friend Record)
             // 2. group_members (List all)
             // 3. expenses (List all)
             mockSupabase.from.mockImplementation((table) => {
                 if (table === 'friends') return createChain(table, { data: { linked_user_id: 'user_B' } });
                 if (table === 'group_members') return createChain(table, { data: groupMembers });
                 if (table === 'expenses') return createChain(table, { data: expensesMultiPayer });
                 if (table === 'transactions') return createChain(table, { data: [] });
                 return createChain(table, {});
             });

             const res = await request(app).delete('/groups/group_123/members/friend_B');
             expect(res.status).toBe(400);
             expect(res.body.error).toMatch(/outstanding balance/);
        });

        it('allows removing member if fully settled', async () => {
            const expensesSettled = [
                 { amount: 100, payer_user_id: 'user_A', expense_splits: [{ user_id: 'user_A', amount: 100, paid_amount: 100 }] }
             ];
             
             mockSupabase.from.mockImplementation((table) => {
                 if (table === 'friends') return createChain(table, { data: { linked_user_id: 'user_B' } });
                 if (table === 'group_members') return createChain(table, { data: groupMembers });
                 if (table === 'expenses') return createChain(table, { data: expensesSettled });
                 if (table === 'transactions') return createChain(table, { data: [] });
                 return createChain(table, { error: null }); // Delete success
             });

             const res = await request(app).delete('/groups/group_123/members/friend_B');
             expect(res.status).toBe(204);
        });
    });
});
