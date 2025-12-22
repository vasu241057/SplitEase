import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GroupDetail } from '../../pages/GroupDetail';
import { MemoryRouter } from 'react-router-dom';

// -----------------------------------------------------
// MOCKS
// -----------------------------------------------------

// Mock Icons
vi.mock('lucide-react', () => ({
    ArrowLeft: () => <div data-testid="icon-arrow-left" />,
    Banknote: () => <div data-testid="icon-banknote" />,
    Plus: () => <div data-testid="icon-plus" />,
    Search: () => <div data-testid="icon-search" />,
    Settings: () => <div data-testid="icon-settings" />,
    X: () => <div data-testid="icon-x" />,
    Info: () => <div data-testid="icon-info" />,
    Wallet: () => <div data-testid="icon-wallet" />
}));

// Mock API
vi.mock('../../utils/api', () => ({
    api: {
        post: vi.fn(),
        get: vi.fn()
    }
}));

// Mock Params
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useParams: () => ({ id: 'group_123' }),
        useNavigate: () => vi.fn(),
        useLocation: () => ({ state: {}, pathname: '/groups/group_123' })
    };
});


// Mock Auth
vi.mock('../../context/AuthContext', () => ({
    useAuth: () => ({ currentUser: { id: 'user_A' } }),
    AuthProvider: ({ children }: any) => <div>{children}</div>
}));

// Mock Data
vi.mock('../../context/DataContext', () => ({
    useData: () => ({
        groups: [
            {
                id: 'group_123',
                name: 'Test Group',
                type: 'trip',
                members: [
                    { id: 'friend_A', userId: 'user_A', name: 'Me', avatar: '' },
                    { id: 'friend_B', userId: 'user_B', name: 'Other', avatar: '' }
                ]
            }
        ],
        friends: [
             { id: 'friend_A', name: 'Me' },
             { id: 'friend_B', name: 'Other' }
        ],
        currentUser: { id: 'user_A' },
        expenses: [
             {
                 id: 'exp1',
                 groupId: 'group_123',
                 amount: 100,
                 date: new Date().toISOString(),
                 description: 'Dinner',
                 payerId: 'friend_A', // Me, mapped from user_A
                 splits: [
                     { userId: 'user_A', amount: 50, paidAmount: 100, paid: true },
                     { userId: 'user_B', amount: 50, paidAmount: 0, paid: false }
                 ]
             }
        ],
        transactions: [],
        addGroupExpense: vi.fn(),
        addGroupTransaction: vi.fn(),
        loading: false,
        refreshData: vi.fn(),
        refreshGroups: vi.fn(),
        refreshExpenses: vi.fn()
    }),
    DataProvider: ({ children }: any) => <div>{children}</div>
}));

// Mock Group Balance Hook (Critical Logic Layer)
vi.mock('../../hooks/useGroupBalance', () => ({
    useGroupBalance: () => ({
        balances: {
            'user_B': 100 // Positive means THEY owe ME
        },
        simplifiedDebts: [
             { from: 'user_B', to: 'user_A', amount: 100 }
        ],
        memberBalances: {
            'user_A': 100,
            'user_B': -100
        },
        loading: false,
        isMemberFullySettled: () => false,
        isGroupSettled: false
    })
}));

// Mock LocalStorage
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
  writable: true
});


describe('GroupDetail Component', () => {

    it('renders group name correctly', () => {
         render(
             <MemoryRouter>
                <GroupDetail />
             </MemoryRouter>
         );
         expect(screen.getByText('Test Group')).toBeInTheDocument();
    });

    it('shows correct balance summary from hook', () => {
         // The component renders individual cards "owes you ₹50.00"
         render(
             <MemoryRouter>
                <GroupDetail />
             </MemoryRouter>
         );
         expect(screen.getByText(/owes you/i)).toBeInTheDocument();
         expect(screen.getByText(/50.00/)).toBeInTheDocument();
    });

});
