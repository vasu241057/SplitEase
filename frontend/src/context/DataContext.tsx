
import React, { createContext, useContext } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from '../utils/api';
import { useAuth } from './AuthContext';
import type { Friend, Group, Expense, Transaction } from "../types"

type User = {
  id: string
  name: string
  email: string
  avatar: string
}

type DataContextType = {
  currentUser: User
  friends: Friend[]
  groups: Group[]
  expenses: Expense[]
  allExpenses: Expense[]
  transactions: Transaction[]
  addExpense: (expense: Omit<Expense, "id" | "date">) => Promise<void>
  addFriend: (name: string, email?: string) => Promise<void>
  addGroup: (name: string, type: Group["type"], members: string[]) => Promise<void>
  settleUp: (friendId: string, amount: number, type: "paid" | "received", groupId?: string) => Promise<void>
  settleUpTotal: (friendId: string, amount: number) => Promise<void>
  deleteExpense: (id: string) => Promise<void>
  deleteTransaction: (id: string) => Promise<void>
  restoreExpense: (id: string) => Promise<void>
  restoreTransaction: (id: string) => Promise<void>
  updateExpense: (expense: Expense) => Promise<void>
  refreshGroups: () => Promise<void>
  refreshExpenses: () => Promise<void>
  loading: boolean
}

const DataContext = createContext<DataContextType | undefined>(undefined)

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const currentUser: User = {
    id: user?.id || "currentUser",
    name: user?.user_metadata?.full_name || "You",
    email: user?.email || "user@example.com",
    avatar: user?.user_metadata?.avatar_url || "",
  }

  // --- Queries ---
  const { data: friends = [], isLoading: loadingFriends } = useQuery({
    queryKey: ['friends'],
    queryFn: () => api.get('/api/friends').then(res => res || [])
  })

  const { data: groups = [], isLoading: loadingGroups } = useQuery({
    queryKey: ['groups'],
    queryFn: () => api.get('/api/groups').then(res => res || [])
  })

  // Fetch ALL expenses including deleted ones
  const { data: allExpenses = [], isLoading: loadingExpenses } = useQuery({
    queryKey: ['expenses'],
    queryFn: () => api.get('/api/expenses').then(res => res || [])
  })

  const { data: transactions = [], isLoading: loadingTransactions } = useQuery({
    queryKey: ['transactions'],
    queryFn: () => api.get('/api/transactions').then(res => res || [])
  })

  // Derived state
  const loading = loadingFriends || loadingGroups || loadingExpenses || loadingTransactions
  const expenses = allExpenses.filter((e: Expense) => !e.deleted)

  // --- Mutations ---

  const addExpenseMutation = useMutation({
    mutationFn: (expense: Omit<Expense, "id" | "date">) => api.post('/api/expenses', expense),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['friends'] }) // Balances update
      queryClient.invalidateQueries({ queryKey: ['groups'] })  // Group balances update
    }
  })

  const addFriendMutation = useMutation({
    mutationFn: (data: { name: string, email?: string }) => api.post('/api/friends', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friends'] })
    }
  })

  const addGroupMutation = useMutation({
    mutationFn: (data: { name: string, type: Group["type"], members: string[] }) => api.post('/api/groups', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
    }
  })

  const settleUpMutation = useMutation({
    mutationFn: (data: { friendId: string, amount: number, type: "paid" | "received", groupId?: string }) => {
      // [FRIEND_BALANCE_DIAG] Log settle-up call from frontend
      console.log('╔═══════════════════════════════════════════════════════════════════');
      console.log('║ [FRIEND_BALANCE_DIAG] SETTLE-UP CALLED FROM FRONTEND');
      console.log('╠═══════════════════════════════════════════════════════════════════');
      console.log('║ Friend ID:', data.friendId);
      console.log('║ Amount:', data.amount);
      console.log('║ Type:', data.type);
      console.log('║ Group ID:', data.groupId || 'NULL (non-group settle-up)');
      console.log('╚═══════════════════════════════════════════════════════════════════');
      return api.post('/api/transactions/settle-up', data);
    },
    onSuccess: () => {
      console.log('[FRIEND_BALANCE_DIAG] Settle-up SUCCESS - Invalidating queries: transactions, friends, groups');
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      queryClient.invalidateQueries({ queryKey: ['groups'] })  // Group balances update
    }
  })

  const settleUpTotalMutation = useMutation({
    mutationFn: (data: { friendId: string, amount: number }) => {
      console.log('[TOTAL SETTLE-UP] Called from frontend:', data);
      return api.post('/api/transactions/settle-up-total', data);
    },
    onSuccess: () => {
      console.log('[TOTAL SETTLE-UP] SUCCESS - Invalidating all queries');
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      queryClient.invalidateQueries({ queryKey: ['groups'] })
    }
  })

  const deleteTransactionMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/transactions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      queryClient.invalidateQueries({ queryKey: ['groups'] })  // Group balances update
    },
    // Optimistic Update could be added here, but SWR style revalidation is safer for balances
  })

  const restoreTransactionMutation = useMutation({
      mutationFn: (id: string) => api.post(`/api/transactions/${id}/restore`, {}),
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['transactions'] })
          queryClient.invalidateQueries({ queryKey: ['friends'] })
          queryClient.invalidateQueries({ queryKey: ['groups'] })  // Group balances update
      }
  })

  const deleteExpenseMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/expenses/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['friends'] })
      queryClient.invalidateQueries({ queryKey: ['groups'] })  // Group balances update
    }
  })

  const restoreExpenseMutation = useMutation({
      mutationFn: (id: string) => api.post(`/api/expenses/${id}/restore`, {}),
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['expenses'] })
          queryClient.invalidateQueries({ queryKey: ['friends'] })
          queryClient.invalidateQueries({ queryKey: ['groups'] })  // Group balances update
      }
  })

   // TODO: Add PUT support in backend for better update logic
  const updateExpenseMutation = useMutation({
      mutationFn: (expense: Expense) => api.put(`/api/expenses/${expense.id}`, expense),
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['expenses'] })
          queryClient.invalidateQueries({ queryKey: ['friends'] })
          queryClient.invalidateQueries({ queryKey: ['groups'] })  // Group balances update
      }
  })

  // --- Exposed Handlers (Adapters to match old interface) ---

  const addExpense = React.useCallback(async (expense: Omit<Expense, "id" | "date">) => {
    await addExpenseMutation.mutateAsync(expense)
  }, [addExpenseMutation])

  const addFriend = React.useCallback(async (name: string, email?: string) => {
     await addFriendMutation.mutateAsync({ name, email })
  }, [addFriendMutation])

  const addGroup = React.useCallback(async (name: string, type: Group["type"], members: string[]) => {
      await addGroupMutation.mutateAsync({ name, type, members })
  }, [addGroupMutation])

  const settleUp = React.useCallback(async (friendId: string, amount: number, type: "paid" | "received", groupId?: string) => {
      await settleUpMutation.mutateAsync({ friendId, amount, type, groupId })
  }, [settleUpMutation])

  const settleUpTotal = React.useCallback(async (friendId: string, amount: number) => {
      await settleUpTotalMutation.mutateAsync({ friendId, amount })
  }, [settleUpTotalMutation])

  const deleteTransaction = React.useCallback(async (id: string) => {
      await deleteTransactionMutation.mutateAsync(id)
  }, [deleteTransactionMutation])

  const restoreTransaction = React.useCallback(async (id: string) => {
      await restoreTransactionMutation.mutateAsync(id)
  }, [restoreTransactionMutation])

  const deleteExpense = React.useCallback(async (id: string) => {
      await deleteExpenseMutation.mutateAsync(id)
  }, [deleteExpenseMutation])

  const restoreExpense = React.useCallback(async (id: string) => {
      await restoreExpenseMutation.mutateAsync(id)
  }, [restoreExpenseMutation])

  const updateExpense = React.useCallback(async (expense: Expense) => {
      await updateExpenseMutation.mutateAsync(expense)
  }, [updateExpenseMutation])

  const refreshGroups = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['groups'] })
  }, [queryClient])

  const refreshExpenses = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['expenses'] })
  }, [queryClient])

  const value = React.useMemo(() => ({
    currentUser,
    friends,
    groups,
    expenses,
    allExpenses,
    transactions,
    addExpense,
    addFriend,
    addGroup,
    settleUp,
    settleUpTotal,
    deleteExpense,
    deleteTransaction,
    restoreExpense,
    restoreTransaction,
    updateExpense,
    refreshGroups,
    refreshExpenses,
    loading,
  }), [
    currentUser, friends, groups, expenses, allExpenses, transactions,
    addExpense, addFriend, addGroup, settleUp, settleUpTotal, deleteExpense, 
    deleteTransaction, restoreExpense, restoreTransaction, updateExpense,
    refreshGroups, refreshExpenses, loading
  ])

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  )
}

export const useData = () => {
  const context = useContext(DataContext)
  if (context === undefined) {
    throw new Error("useData must be used within a DataProvider")
  }
  return context
}
