
import { vi } from 'vitest';

export class StatefulSupabaseMock {
    dataStore: Record<string, any[]> = {
        expenses: [],
        expense_splits: [],
        friends: [],
        transactions: [],
        profiles: [],
        group_members: [],
        groups: []
    };

    constructor(initialData: any = {}) {
        this.dataStore = { ...this.dataStore, ...initialData };
    }

    from(table: string) {
        if (!this.dataStore[table]) {
            this.dataStore[table] = [];
        }
        return new QueryBuilder(table, this.dataStore);
    }

    rpc(funcName: string, args: any) {
        if (funcName === 'create_expense_with_splits') {
             // Mock ATOMIC creation
             const { 
                 p_description, p_amount, p_date, 
                 p_payer_id, p_payer_user_id, p_group_id, p_created_by, 
                 p_splits 
             } = args;
 
             const expenseId = `mock_exp_rpc_${Math.random().toString(36).substr(2, 9)}`;
             const expense = {
                 id: expenseId,
                 description: p_description,
                 amount: p_amount,
                 date: p_date,
                 payer_id: p_payer_id,
                 payer_user_id: p_payer_user_id,
                 group_id: p_group_id,
                 created_by: p_created_by,
                 deleted: false,
                 created_at: new Date().toISOString()
             };
 
             this.dataStore['expenses'].push(expense);
 
             if (Array.isArray(p_splits)) {
                 p_splits.forEach((s: any) => {
                     this.dataStore['expense_splits'].push({
                         id: `mock_split_${Math.random().toString(36).substr(2, 9)}`,
                         expense_id: expenseId,
                         user_id: s.user_id,
                         friend_id: s.friend_id,
                         amount: s.amount,
                         paid_amount: s.paid_amount,
                         paid: s.paid,
                         created_at: new Date().toISOString()
                     });
                 });
             }
 
             // Return Thenable resolving to expense record
             return {
                 then: (resolve: any) => resolve({ data: expense, error: null })
             };
        }
        
        // Default Mock for other RPCs
        return {
            select: () => ({ data: [], error: null }),
            then: (resolve: any) => resolve({ data: [], error: null }) // Support direct await
        };
    }
}

class QueryBuilder {
    table: string;
    store: Record<string, any[]>;
    filters: Array<(row: any) => boolean> = [];
    isSingle: boolean = false;
    modifiers: any[] = [];
    currentData: any = null; // For insert/update pipeline

    constructor(table: string, store: Record<string, any[]>) {
        this.table = table;
        this.store = store;
    }

    select(columns?: string) {
        return this;
    }

    eq(column: string, value: any) {
        this.filters.push(row => row[column] === value);
        return this;
    }

    in(column: string, values: any[]) {
        this.filters.push(row => values.includes(row[column]));
        return this;
    }

    single() {
        this.isSingle = true;
        return this;
    }

    order(column: string) {
        return this; // Sort logic not implemented in mock yet (default order)
    }

    limit(n: number) {
        return this;
    }

    async then(resolve: (result: { data: any, error: any }) => void) {
        // Execute Query
        let result = this.store[this.table].filter(row => {
            return this.filters.every(f => f(row));
        });

        // If this was an insert/update chain
        if (this.currentData) {
            result = Array.isArray(this.currentData) ? this.currentData : [this.currentData];
        }

        // === JOIN HACK for Recalculation ===
        // If table is 'expenses' and we want 'splits', populate them manually.
        // We really should parse 'select' columns but for this specific test case we know what is needed.
        if (this.table === 'expenses') {
             result = result.map(exp => ({
                 ...exp,
                 splits: this.store['expense_splits']?.filter(s => s.expense_id === exp.id) || []
             }));
        }
        
        // Same for Transactions -> Friends join?
        // select('*, friend:friends(owner_id, linked_user_id)')
        if (this.table === 'transactions') {
            result = result.map(tx => ({
                ...tx,
                friend: this.store['friends']?.find(f => f.id === tx.friend_id) || null
            }));
        }
        // === END HACK ===

        if (this.isSingle) {
            if (result.length === 0) {
                resolve({ data: null, error: { message: 'Row not found' } });
            } else {
                resolve({ data: result[0], error: null });
            }
        } else {
            resolve({ data: result, error: null });
        }
    }

    insert(data: any | any[]) {
        const rows = Array.isArray(data) ? data : [data];
        const newRows = rows.map(r => ({
            id: r.id || `mock_${this.table}_${Math.random().toString(36).substr(2, 9)}`,
            created_at: new Date().toISOString(),
            ...r
        }));
        
        this.store[this.table].push(...newRows);
        this.currentData = Array.isArray(data) ? newRows : newRows[0];
        
        // Return a builder that can handle .select() chain or .single() chain
        // In real Supabase, insert returns a PostgrestFilterBuilder.
        // We will just return 'this' but conceptually we move to specific item context?
        // Actually, normally .insert().select().single() is the pattern.
        return this;
    }

    update(updates: any) {
        // Defer update until we know which rows (via eq)
        // This is tricky because Supabase builder allows .update(..).eq(..)
        // So we store the update and apply it when 'then' is called or filter is finalized?
        // We'll wrap the logic: When .then() is called, we apply updates to all matching rows.
        
        // But wait, 'then' is a promise.
        // We need to change how 'then' works.
        // We'll attach a mutation operation to the resolve?
        
        // Actually, simpler: Use a separate execution method that triggers on 'then'.
        const originalThen = this.then;
        
        this.then = (resolve: any) => {
            // Find matches
            const matchingRows = this.store[this.table].filter(row => {
                return this.filters.every(f => f(row));
            });

            // Apply updates
            matchingRows.forEach(row => {
                Object.assign(row, updates);
            });
            
            // Return updated rows?
            // Usually update returns null unless .select() is called?
            // Let's assume .select() was called implicitly? 
            // Or just return null if not?
            resolve({ data: matchingRows, error: null });
        };

        return this;
    }

    delete() {
        this.then = (resolve: any) => {
             const keepRows = this.store[this.table].filter(row => {
                return !this.filters.every(f => f(row));
            });
            this.store[this.table] = keepRows;
            resolve({ data: [], error: null });
        };
        return this;
    }
}
