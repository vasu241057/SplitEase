
import { describe, it, expect } from 'vitest';
import { coreSimplifyGroupDebts } from '../src/utils/recalculate';

describe('Simplification Engine (Greedy Algorithm)', () => {
    
    // Helper to sum inputs and outputs for invariant checking
    const verifyInvariant = (inputs: { userId: string, balance: number }[], outputs: { from: string, to: string, amount: number }[]) => {
        const inputSum = inputs.reduce((sum, i) => sum + i.balance, 0);
        // Net flow from outputs
        // We aren't checking flow conservation per node here (the test asserts specific edges), 
        // but we MUST check global money conservation. 
        // Actually, simplified edges don't sum to input sum directly. 
        // Input Sum is NET (should be 0). Output Sum is total volume of transfers.
        // The Invariant is: Sum(Input Net) must be ~0.
        expect(inputSum).toBeCloseTo(0, 5); 
    };

    it('should simplify a basic chain: A->B->C => A->C', () => {
        // A owes B 10, B owes C 10.
        // Net: A = -10, B = 0, C = +10
        const inputs = [
            { userId: 'A', balance: -10 },
            { userId: 'B', balance: 0 },
            { userId: 'C', balance: 10 }
        ];

        verifyInvariant(inputs, []);
        const results = coreSimplifyGroupDebts(inputs);
        
        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({ from: 'A', to: 'C', amount: 10 });
    });

    it('should resolve circular debt completely: A->B->C->A => Settled', () => {
        // A->B 10, B->C 10, C->A 10
        // Net: A=0, B=0, C=0
        const inputs = [
            { userId: 'A', balance: 0 },
            { userId: 'B', balance: 0 },
            { userId: 'C', balance: 0 }
        ];

        const results = coreSimplifyGroupDebts(inputs);
        expect(results).toHaveLength(0);
    });

    it('should preserve necessary splits: A owes B (10) and C (10)', () => {
        // A owes B 10, A owes C 10
        // Net: A = -20, B = +10, C = +10
        const inputs = [
            { userId: 'A', balance: -20 },
            { userId: 'B', balance: 10 },
            { userId: 'C', balance: 10 }
        ];

        const results = coreSimplifyGroupDebts(inputs);
        
        // Expect A->B (10) and A->C (10). Order might vary but both must exist.
        expect(results).toHaveLength(2);
        const aToB = results.find(r => r.to === 'B');
        const aToC = results.find(r => r.to === 'C');
        
        expect(aToB).toMatchObject({ from: 'A', amount: 10 });
        expect(aToC).toMatchObject({ from: 'A', amount: 10 });
    });

    it('should handle multi-path merge: A->B->D and C->B->D', () => {
        // A owes B 10 (A=-10, B=+10)
        // C owes B 10 (C=-10, B=+10 => B=+20)
        // B owes D 20 (B=+20-20=0, D=+20)
        // Net: A=-10, C=-10, B=0, D=+20
        const inputs = [
            { userId: 'A', balance: -10 },
            { userId: 'C', balance: -10 },
            { userId: 'B', balance: 0 },
            { userId: 'D', balance: 20 }
        ];

        const results = coreSimplifyGroupDebts(inputs);
        
        expect(results).toHaveLength(2);
        // Should be A->D and C->D
        const toD = results.filter(r => r.to === 'D');
        expect(toD).toHaveLength(2);
        expect(toD.find(r => r.from === 'A')?.amount).toBe(10);
        expect(toD.find(r => r.from === 'C')?.amount).toBe(10);
    });

    it('should handle precision with floating point numbers', () => {
        // A owes B 33.33, B owes C 33.33
        // Net: A = -33.33, B = 0, C = +33.33
        const inputs = [
            { userId: 'A', balance: -33.33 },
            { userId: 'B', balance: 0 },
            { userId: 'C', balance: 33.33 }
        ];

        const results = coreSimplifyGroupDebts(inputs);
        
        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({ from: 'A', to: 'C', amount: 33.33 });
    });

    it('should abort simplification if non-zero sum (Safety)', () => {
        // Sum is not zero
        const inputs = [
            { userId: 'A', balance: -10 },
            { userId: 'B', balance: 5 } // Missing +5
        ];

        // Should return empty array and log warning
        const results = coreSimplifyGroupDebts(inputs);
        expect(results).toEqual([]);
    });

     it('should handle complex mixed graph', () => {
        // Example:
        // A owes B 50
        // B owes C 30
        // C owes A 10
        // Net:
        // A: -50 + 10 = -40
        // B: +50 - 30 = +20
        // C: +30 - 10 = +20
        // Check Sum: -40 + 20 + 20 = 0. OK.
        
        // Proposed Simplification:
        // A pays B 20. (A remaining: -20, B settled 0)
        // A pays C 20. (A remaining: 0, C settled 0)
        
        const inputs = [
            { userId: 'A', balance: -40 },
            { userId: 'B', balance: 20 },
            { userId: 'C', balance: 20 }
        ];

        const results = coreSimplifyGroupDebts(inputs);
        
        // Sort results to be deterministic for assertion
        results.sort((a, b) => a.to.localeCompare(b.to));

        expect(results).toHaveLength(2);
        // A->B 20
        // A->C 20
        expect(results).toEqual(expect.arrayContaining([
             { from: 'A', to: 'B', amount: 20 },
             { from: 'A', to: 'C', amount: 20 }
        ]));
    });
});
