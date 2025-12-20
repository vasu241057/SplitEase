import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import expenseRoutes from '../../src/routes/expenses';

// Mock Supabase
const mockSupabase = {
    from: vi.fn(),
    rpc: vi.fn()
};

// Mock createSupabaseClient
vi.mock('../../src/supabase', () => ({
    createSupabaseClient: () => mockSupabase
}));

// Mock Middleware
vi.mock('../../src/middleware/auth', () => ({
    authMiddleware: (req: any, res: any, next: any) => {
        req.user = { id: 'user_A' };
        next();
    }
}));

// Mock Recalculate Logic to isolate route testing
import { recalculateBalances } from '../../src/utils/recalculate';

// Mock Recalculate Logic to isolate route testing
vi.mock('../../src/utils/recalculate', () => ({
    recalculateBalances: vi.fn()
}));

// Mock Notification logic (Push) to avoid internal imports/errors
vi.mock('../../src/utils/push', () => ({
    sendPushNotification: vi.fn()
}));

const app = express();
app.use(express.json());
app.use('/expenses', expenseRoutes);

describe('Expense Routes Integration', () => {

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Default RPC mock for create_expense_with_splits
        mockSupabase.rpc.mockImplementation((funcName: string, args: any) => {
            if (funcName === 'create_expense_with_splits') {
                return Promise.resolve({
                    data: {
                        id: `exp_${Date.now()}`,
                        description: args.p_description,
                        amount: args.p_amount,
                        date: args.p_date,
                        payer_id: args.p_payer_id,
                        payer_user_id: args.p_payer_user_id,
                        group_id: args.p_group_id,
                        created_by: args.p_created_by,
                        deleted: false
                    },
                    error: null
                });
            }
            return Promise.resolve({ data: [], error: null });
        });
    });

    // Helper for Supabase chain
    const createChain = (data: any = [], error: any = null) => {
        const chain: any = {
            select: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis(),
            delete: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            then: (resolve: any) => resolve({ data, error })
        };
        return chain;
    };

    describe('POST /expenses (Creation)', () => {
        
        it('rejects zero amount', async () => {
            const res = await request(app).post('/expenses').send({
                description: 'Zero',
                amount: 0,
                splits: [{ userId: 'user_A', amount: 0 }]
            });
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/positive number/);
        });

        it('rejects negative amount', async () => {
            const res = await request(app).post('/expenses').send({
                description: 'Negative',
                amount: -100,
                splits: [{ userId: 'user_A', amount: -100 }]
            });
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/positive number/);
        });

        it('rejects if split sum does not match total amount', async () => {
            const res = await request(app).post('/expenses').send({
                description: 'Math Fail',
                amount: 100,
                splits: [
                    { userId: 'user_A', amount: 50 },
                    { userId: 'user_B', amount: 40 } // Sum = 90
                ]
            });
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/must equal expense amount/);
        });

        it('rejects if paid amount sum does not match total amount (Multi-Payer Safety)', async () => {
            // New strict validation added in previous sessions
            const res = await request(app).post('/expenses').send({
                description: 'Paid Fail',
                amount: 100,
                splits: [
                    { userId: 'user_A', amount: 50, paidAmount: 60 },
                    { userId: 'user_B', amount: 50, paidAmount: 30 } // Paid Sum = 90
                ]
            });
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/Total paid amount/);
        });

        it('accepts valid single payer scenario', async () => {
            // Mock DB insert
            const insertSpy = vi.fn().mockReturnThis();
            const selectSpy = vi.fn().mockReturnThis();
            const singleSpy = vi.fn().mockResolvedValue({ data: { id: 'exp_1', amount: 100 }, error: null });
            
            mockSupabase.from.mockImplementation((table: string) => {
                if (table === 'expenses') {
                    return {
                        insert: insertSpy,
                        select: selectSpy,
                        single: singleSpy
                    };
                }
                if (table === 'expense_splits') {
                     return { insert: vi.fn().mockResolvedValue({ error: null }) };
                }
                return createChain({});
            });

            // Ensure Profile Check returns false (so it falls back to user_id logic if needed, or null)
            // The route calls checks on payerId.
            // If payerId is 'user_A', calls isProfileId. Mock select single.
            mockSupabase.from.mockImplementation((table: string) => {
                 if (table === 'profiles') return createChain({ id: 'user_A' }); // Finds profile -> treated as Friend ID?
                 // Wait, isProfileId returns true if data exists.
                 // If true, payer_user_id = null, payer_id = id.
                 // If the input is 'user_A' (Global ID), isProfileId check essentially asks "Is this a known User ID?".
                 // Actually isProfileId checks if it's a PROFILE. User IDs have profiles.
                 // The logic in route: 
                 // payer_id: ... isProfileId ? null : payerId
                 // payer_user_id: ... isProfileId ? payerId : null
                 // WAIT. Logic in route:
                 // payer_id: ... (await isProfileId(supabase, payerId) ? null : payerId) -- If it IS a profile (User), PayerID (FriendID) is NULL.
                 // payer_user_id: ... isProfileId ? payerId : null -- If it IS a profile, PayerUserID is SET.
                 // Correct for Global User.
                 
                 // We need to support the profile check chain in the mock.
                 if (table === 'expenses') return { 
                    insert: insertSpy, 
                    select: selectSpy, 
                    single: singleSpy 
                 };
                 if (table === 'expense_splits') return { insert: vi.fn().mockResolvedValue({ error: null }) };
                 if (table === 'comments') return createChain({});
                 if (table === 'profiles') return createChain({ id: 'user_A' }, null); // isProfileId -> true
                 return createChain({});
            });

            const res = await request(app).post('/expenses').send({
                description: 'Valid',
                amount: 100,
                payerId: 'user_A',
                splits: [
                    { userId: 'user_A', amount: 50, paidAmount: 100 },
                    { userId: 'user_B', amount: 50, paidAmount: 0 }
                ]
            });
            
            
            expect(res.status).toBe(201);
            
            // STRICT ASSERTION: RPC was called with correct payload
            expect(mockSupabase.rpc).toHaveBeenCalledWith(
                'create_expense_with_splits',
                expect.objectContaining({
                    p_amount: 100,
                    p_payer_user_id: 'user_A', // Because isProfileId=true for 'user_A'
                    p_payer_id: null
                })
            );
            
            // STRICT ASSERTION: Triggered Recalculation
            expect(recalculateBalances).toHaveBeenCalled();
        });

        it('accepts valid single payer unequal split', async () => {
             mockSupabase.from.mockReturnValue(createChain({ id: 'exp_unequal', amount: 100 }));
             const res = await request(app).post('/expenses').send({
                description: 'Unequal',
                amount: 100,
                payerId: 'user_A',
                splits: [
                    { userId: 'user_A', amount: 70, paidAmount: 100 },
                    { userId: 'user_B', amount: 30, paidAmount: 0 }
                ]
            });
            expect(res.status).toBe(201);
        });

        it('accepts Payer excluded from split', async () => {
             mockSupabase.from.mockReturnValue(createChain({ id: 'exp_excluded', amount: 100 }));
            
            // "Payer excluded from split" usually means they don't owe anything.
            const res = await request(app).post('/expenses').send({
                description: 'Excluded',
                amount: 100,
                payerId: 'user_A',
                splits: [
                    { userId: 'user_A', amount: 0, paidAmount: 100 }, // Payer: Share 0, Paid 100
                    { userId: 'user_B', amount: 50, paidAmount: 0 },
                    { userId: 'user_C', amount: 50, paidAmount: 0 }
                ]
            });
            expect(res.status).toBe(201);
        });

        it('accepts split amount = 0', async () => {
             mockSupabase.from.mockReturnValue(createChain({ id: 'exp_zero_share', amount: 100 }));
            const res = await request(app).post('/expenses').send({
                description: 'Zero Share',
                amount: 100,
                payerId: 'user_A',
                splits: [
                    { userId: 'user_A', amount: 0, paidAmount: 100 },
                    { userId: 'user_B', amount: 100, paidAmount: 0 }
                ]
            });
            expect(res.status).toBe(201);
        });

        it('accepts valid multi-payer (partial payment) scenario', async () => {
            mockSupabase.from.mockReturnValue(createChain({ id: 'exp_multi', amount: 100 }));

            const res = await request(app).post('/expenses').send({
                description: 'Multi Valid',
                amount: 100,
                payerId: 'user_A', // nominal payer reference
                splits: [
                    { userId: 'user_A', amount: 10, paidAmount: 60 },
                    { userId: 'user_B', amount: 30, paidAmount: 40 },
                    { userId: 'user_C', amount: 60, paidAmount: 0 }
                ]
            });
            
            expect(res.status).toBe(201);
        });
        
        it('accepts multi-payer with one payer paying 0', async () => {
            // "One payer pays 0" means they are in the Multi-Payer expense context but contributed nothing.
            // effectively just a consumer.
            mockSupabase.from.mockReturnValue(createChain({ id: 'exp_multi_zero', amount: 100 }));
            const res = await request(app).post('/expenses').send({
                description: 'Multi Zero Payer',
                amount: 100,
                payerId: 'user_A', 
                splits: [
                    { userId: 'user_A', amount: 50, paidAmount: 100 },
                    { userId: 'user_B', amount: 25, paidAmount: 0 }, // "Payer" in logic but paid 0
                    { userId: 'user_C', amount: 25, paidAmount: 0 }
                ]
            });
            expect(res.status).toBe(201);
        });

        it('accepts decimal splits logic (Penny check)', async () => {
             mockSupabase.from.mockReturnValue(createChain({ id: 'exp_penny', amount: 100 }));
             
             // 33.33 * 3 = 99.99 != 100.
             // We need 33.34 + 33.33 + 33.33 = 100.
             const res = await request(app).post('/expenses').send({
                description: 'Penny',
                amount: 100,
                payerId: 'user_A',
                splits: [
                    { userId: 'user_A', amount: 33.34, paidAmount: 100 },
                    { userId: 'user_B', amount: 33.33, paidAmount: 0 },
                    { userId: 'user_C', amount: 33.33, paidAmount: 0 } 
                ]
            });
             
            expect(res.status).toBe(201);
        });
        
        // --- Section C: Failure & Safety ---
        it('Delete then Revert Flow (Balance Logic)', async () => {
             // We cannot test DB state changes with specific values in Unit Test.
             // But we verify the sequence of endpoint calls.
             // 1. DELETE /expenses/:id -> calls update deleted=true -> calls recalculate.
             const resDel = await request(app).delete('/expenses/exp_1');
             expect(resDel.status).toBe(200);
             
             // 2. RESTORE /expenses/:id/restore -> calls update deleted=false -> calls recalculate.
             const resRestore = await request(app).post('/expenses/exp_1/restore');
             expect(resRestore.status).toBe(200);
        });
    });

    describe('PUT /expenses/:id (Logic)', () => {
        it('rejects if logic invariants are broken on update', async () => {
             const res = await request(app).put('/expenses/exp_1').send({
                description: 'Broken Update',
                amount: 100,
                splits: [
                     { userId: 'user_A', amount: 100, paidAmount: 50 } // Mismatch paid
                ]
            });
            expect(res.status).toBe(400);
        });
    });
});
