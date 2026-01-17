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

// Mock Recalculate Logic - include ALL exports used by expenses.ts
vi.mock('../../src/utils/recalculate', () => ({
    recalculateGroupBalances: vi.fn().mockResolvedValue(undefined),
    recalculateUserPersonalLedger: vi.fn().mockResolvedValue(undefined)
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
        
        // === REJECTION TESTS (Invariant Validation) ===
        
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

        // === VALID 2-PERSON PERSONAL EXPENSE TESTS ===

        it('accepts valid 2-person single payer scenario', async () => {
            mockSupabase.from.mockImplementation((table: string) => {
                 if (table === 'profiles') return createChain({ id: 'user_A' }, null);
                 if (table === 'comments') return createChain({});
                 return createChain({});
            });

            const res = await request(app).post('/expenses').send({
                description: 'Valid 2-Person',
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
                    p_payer_user_id: 'user_A',
                    p_payer_id: null
                })
            );
        });

        it('accepts valid 2-person unequal split', async () => {
             mockSupabase.from.mockReturnValue(createChain({ id: 'exp_unequal', amount: 100 }));
             const res = await request(app).post('/expenses').send({
                description: 'Unequal 2-Person',
                amount: 100,
                payerId: 'user_A',
                splits: [
                    { userId: 'user_A', amount: 70, paidAmount: 100 },
                    { userId: 'user_B', amount: 30, paidAmount: 0 }
                ]
            });
            expect(res.status).toBe(201);
        });

        it('accepts 2-person split with zero share', async () => {
             mockSupabase.from.mockReturnValue(createChain({ id: 'exp_zero_share', amount: 100 }));
            const res = await request(app).post('/expenses').send({
                description: 'Zero Share 2-Person',
                amount: 100,
                payerId: 'user_A',
                splits: [
                    { userId: 'user_A', amount: 0, paidAmount: 100 },
                    { userId: 'user_B', amount: 100, paidAmount: 0 }
                ]
            });
            expect(res.status).toBe(201);
        });

        // === N-PERSON PERSONAL EXPENSE TESTS (REJECTED BY DESIGN) ===
        // INVARIANT: Personal expenses currently support exactly 2 participants

        it('accepts 3-person personal expense (N-person supported)', async () => {
             mockSupabase.from.mockReturnValue(createChain({ id: 'exp_included', amount: 100 }));
            
            const res = await request(app).post('/expenses').send({
                description: 'Included',
                amount: 100,
                payerId: 'user_A',
                splits: [
                    { userId: 'user_A', amount: 0, paidAmount: 100 },
                    { userId: 'user_B', amount: 50, paidAmount: 0 },
                    { userId: 'user_C', amount: 50, paidAmount: 0 }
                ]
            });
            expect(res.status).toBe(201);
        });

        it('accepts multi-payer 3-person scenario (N-person supported)', async () => {
            mockSupabase.from.mockReturnValue(createChain({ id: 'exp_multi', amount: 100 }));

            const res = await request(app).post('/expenses').send({
                description: 'Multi Valid',
                amount: 100,
                payerId: 'user_A',
                splits: [
                    { userId: 'user_A', amount: 10, paidAmount: 60 },
                    { userId: 'user_B', amount: 30, paidAmount: 40 },
                    { userId: 'user_C', amount: 60, paidAmount: 0 }
                ]
            });
            
            expect(res.status).toBe(201);
        });
        
        it('accepts 3-person with one paying 0 (N-person supported)', async () => {
            mockSupabase.from.mockReturnValue(createChain({ id: 'exp_multi_zero', amount: 100 }));
            const res = await request(app).post('/expenses').send({
                description: 'Multi Zero Payer',
                amount: 100,
                payerId: 'user_A', 
                splits: [
                    { userId: 'user_A', amount: 50, paidAmount: 100 },
                    { userId: 'user_B', amount: 25, paidAmount: 0 },
                    { userId: 'user_C', amount: 25, paidAmount: 0 }
                ]
            });
            expect(res.status).toBe(201);
        });

        it('accepts 3-person penny split (N-person supported)', async () => {
             mockSupabase.from.mockReturnValue(createChain({ id: 'exp_penny', amount: 100 }));
             
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
        
        // === DELETE/RESTORE FLOW ===
        // These tests require mock setup for personal expense with exactly 2 participants
        
        it('Delete then Revert Flow (Balance Logic) - 2 person expense', async () => {
             // Mock for delete: returns expense with 2 splits
             mockSupabase.from.mockImplementation((table: string) => {
                if (table === 'expenses') {
                    return {
                        select: vi.fn().mockReturnThis(),
                        update: vi.fn().mockReturnThis(),
                        eq: vi.fn().mockReturnThis(),
                        single: vi.fn().mockResolvedValue({ 
                            data: { id: 'exp_1', group_id: null, payer_user_id: 'user_A' }, 
                            error: null 
                        }),
                        then: (resolve: any) => resolve({ data: { id: 'exp_1' }, error: null })
                    };
                }
                if (table === 'expense_splits') {
                    return {
                        select: vi.fn().mockReturnThis(),
                        eq: vi.fn().mockReturnThis(),
                        then: (resolve: any) => resolve({ 
                            data: [
                                { user_id: 'user_A' },
                                { user_id: 'user_B' }
                            ], 
                            error: null 
                        })
                    };
                }
                if (table === 'comments') return createChain({});
                return createChain({});
             });
             
             // 1. DELETE /expenses/:id
             const resDel = await request(app).delete('/expenses/exp_1');
             expect(resDel.status).toBe(200);
             
             // 2. RESTORE /expenses/:id/restore
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
