import { render, screen } from '@testing-library/react';
import { Friends } from '../pages/Friends';
import { FriendDetail } from '../pages/FriendDetail';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Mock DataContext
const mockUseData = vi.fn();
vi.mock('../context/DataContext', () => ({
  useData: () => mockUseData(),
}));

// Mock AuthContext
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user_me', email: 'me@test.com' } }),
}));

// Mock basic UI components to avoid rendering complexities
vi.mock('../components/ui/button', () => ({ Button: ({ children, ...props }: any) => <button {...props}>{children}</button> }));
vi.mock('../components/ui/avatar', () => ({ 
    Avatar: ({ children }: any) => <div>{children}</div>,
    AvatarImage: () => <img alt="avatar" />,
    AvatarFallback: () => <span>FB</span>
}));
vi.mock('lucide-react', () => ({
    Plus: () => <span>+</span>,
    Bell: () => <span>Bell</span>,
    X: () => <span>X</span>,
    ArrowLeft: () => <span>Back</span>,
    Banknote: () => <span>Cash</span>,
    Users: () => <span>Users</span>,
    ArrowRightLeft: () => <span>Swap</span>,
    ChevronDown: () => <span>Down</span>,
    ChevronUp: () => <span>Up</span>
}));

Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
  writable: true
});

Object.defineProperty(window, 'sessionStorage', {
  value: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
  writable: true
});

vi.mock('../components/TotalBalance', () => ({
    TotalBalance: () => <div>TotalBalance Mock</div>
}));

vi.mock('../components/FloatingAddExpense', () => ({
    FloatingAddExpense: () => <div>Floating Add</div>
}));

vi.mock('../components/ui/card', () => ({
    Card: ({children, className}: any) => <div className={className}>{children}</div>,
    CardContent: ({children}: any) => <div>{children}</div>
}));

const mockCurrentUser = { id: 'user_me', name: 'Me', email: 'me@test.com' };

describe('Phase 2 Frontend Component Coverage', () => {
    
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Section A: Friends List Filtration & Totals', () => {
        it('hides group-only friends (ghosts) when their calculated balance is zero', () => {
            const groupOnlyFriend = { 
                id: 'friend_ghost', 
                name: 'GhostUserUniqueName', 
                isGroupMemberOnly: true, 
                balance: 0 
            };

            mockUseData.mockReturnValue({
                friends: [groupOnlyFriend],
                loading: false,
                currentUser: mockCurrentUser,
                groups: [{ id: 'g1', members: [{id: 'user_me', userId: 'user_me'}, {id: 'friend_ghost', userId: 'friend_ghost_uid'}] }],
                expenses: [], 
                transactions: [],
                allExpenses: []
            });

            render(
                <MemoryRouter>
                    <Friends />
                </MemoryRouter>
            );

            expect(screen.queryByText('GhostUserUniqueName')).not.toBeInTheDocument();
        });

        it('shows group-only friends when calculation reveals a non-zero balance', () => {
            const groupOnlyFriend = { 
                id: 'friend_active', 
                name: 'Active Ghost', 
                isGroupMemberOnly: true,
                balance: 0,
                linked_user_id: 'friend_active_uid'
            };

            const expense = {
                id: 'e1', groupId: 'g1', amount: 100, payerId: 'user_me', date: new Date().toISOString(),
                splits: [
                    { userId: 'user_me', amount: 50, paidAmount: 100 }, 
                    { userId: 'friend_active_uid', amount: 50, paidAmount: 0 }
                ]
            };

            mockUseData.mockReturnValue({
                friends: [groupOnlyFriend],
                loading: false,
                currentUser: mockCurrentUser,
                groups: [{ id: 'g1', members: [{id: 'user_me', userId: 'user_me'}, {id: 'friend_active', userId: 'friend_active_uid'}] }],
                expenses: [expense],
                transactions: [],
                allExpenses: [expense]
            });

            render(
                <MemoryRouter>
                    <Friends />
                </MemoryRouter>
            );

            expect(screen.getByText('Active Ghost')).toBeInTheDocument();
            expect(screen.getByText('owes you')).toBeInTheDocument();
            // Allow multiple matches for amount
            expect(screen.getAllByText(/₹50.00/).length).toBeGreaterThan(0);
        });
    });

    describe('Section D: Activity Feed Accuracy (FriendDetail)', () => {
        it('displays "You lent" when I paid for friend (Personal Expense)', () => {
            const friend = { id: 'friend_bob', name: 'Bob', balance: 50 };
            const expense = {
                id: 'e1', groupId: undefined, description: 'Dinner', amount: 100, payerId: 'user_me', date: new Date().toISOString(),
                splits: [
                    { userId: 'user_me', amount: 50, paidAmount: 100 }, 
                    { userId: 'friend_bob', amount: 50, paidAmount: 0 }
                ]
            };

             mockUseData.mockReturnValue({
                friends: [friend],
                loading: false,
                currentUser: mockCurrentUser,
                groups: [{ id: 'g1', members: [{id: 'user_me', userId: 'user_me'}, {id: 'friend_bob', userId: 'friend_bob'}] }],
                expenses: [expense],
                transactions: []
            });

            render(
                <MemoryRouter initialEntries={['/friends/friend_bob']}>
                    <Routes>
                        <Route path="/friends/:id" element={<FriendDetail />} />
                    </Routes>
                </MemoryRouter>
            );

            expect(screen.getByText('Dinner')).toBeInTheDocument();
            expect(screen.getByText('You paid')).toBeInTheDocument();
            expect(screen.getByText(/You lent/)).toBeInTheDocument();
            expect(screen.getAllByText(/₹50.00/).length).toBeGreaterThan(0);
        });

        it('displays "You borrowed" when friend paid for me (Personal Expense)', () => {
             const friend = { id: 'friend_alice', name: 'Alice', balance: -50 };
             const expense = {
                id: 'e2', groupId: undefined, description: 'Uber', amount: 100, payerId: 'friend_alice', date: new Date().toISOString(),
                splits: [
                    { userId: 'friend_alice', amount: 50, paidAmount: 100 },
                    { userId: 'user_me', amount: 50, paidAmount: 0 } 
                ]
            };

            mockUseData.mockReturnValue({
                friends: [friend],
                loading: false,
                currentUser: mockCurrentUser,
                groups: [{ id: 'g1', members: [{id: 'user_me', userId: 'user_me'}, {id: 'friend_alice', userId: 'friend_alice'}] }],
                expenses: [expense],
                transactions: []
            });

             render(
                <MemoryRouter initialEntries={['/friends/friend_alice']}>
                    <Routes>
                        <Route path="/friends/:id" element={<FriendDetail />} />
                    </Routes>
                </MemoryRouter>
            );

            expect(screen.getByText('Uber')).toBeInTheDocument();
            expect(screen.getByText('They paid')).toBeInTheDocument();
            expect(screen.getByText(/You borrowed/)).toBeInTheDocument();
            expect(screen.getAllByText(/₹50.00/).length).toBeGreaterThan(0);
        });
    });
});
