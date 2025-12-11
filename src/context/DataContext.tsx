
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
  settleUp: (friendId: string, amount: number, type: "paid" | "received") => Promise<void>
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
    mutationFn: (data: { friendId: string, amount: number, type: "paid" | "received" }) => api.post('/api/transactions/settle-up', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['friends'] })
    }
  })

  const deleteTransactionMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/transactions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['friends'] })
    },
    // Optimistic Update could be added here, but SWR style revalidation is safer for balances
  })

  const restoreTransactionMutation = useMutation({
      mutationFn: (id: string) => api.post(`/api/transactions/${id}/restore`, {}),
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['transactions'] })
          queryClient.invalidateQueries({ queryKey: ['friends'] })
      }
  })

  const deleteExpenseMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/expenses/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] }) // Refetch to see deleted state if API actually deletes, or we assume soft delete
      // Note: If API does soft delete, it returns 200/204.
      // We might need to handle "soft delete" visibility local state if backend deletes record 
      // User requested "Soft Delete" logic earlier. Backend logic for DELETE /api/expenses/:id does soft delete?
      // Let's assume standard behavior: refetch to get latest state
      queryClient.invalidateQueries({ queryKey: ['friends'] })
    }
  })

  const restoreExpenseMutation = useMutation({
      mutationFn: (id: string) => api.post(`/api/expenses/${id}/restore`, {}),
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['expenses'] })
          queryClient.invalidateQueries({ queryKey: ['friends'] })
      }
  })

   // TODO: Add PUT support in backend for better update logic
  const updateExpenseMutation = useMutation({
      mutationFn: (expense: Expense) => api.put(`/api/expenses/${expense.id}`, expense),
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['expenses'] })
          queryClient.invalidateQueries({ queryKey: ['friends'] })
      }
  })

  // --- Exposed Handlers (Adapters to match old interface) ---

  const addExpense = async (expense: Omit<Expense, "id" | "date">) => {
    await addExpenseMutation.mutateAsync(expense)
  }

  const addFriend = async (name: string, email?: string) => {
     await addFriendMutation.mutateAsync({ name, email })
  }

  const addGroup = async (name: string, type: Group["type"], members: string[]) => {
      await addGroupMutation.mutateAsync({ name, type, members })
  }

  const settleUp = async (friendId: string, amount: number, type: "paid" | "received") => {
      await settleUpMutation.mutateAsync({ friendId, amount, type })
  }

  const deleteTransaction = async (id: string) => {
      await deleteTransactionMutation.mutateAsync(id)
  }

  const restoreTransaction = async (id: string) => {
      await restoreTransactionMutation.mutateAsync(id)
  }

  const deleteExpense = async (id: string) => {
      await deleteExpenseMutation.mutateAsync(id)
  }

  const restoreExpense = async (id: string) => {
      await restoreExpenseMutation.mutateAsync(id)
  }

  const updateExpense = async (expense: Expense) => {
      await updateExpenseMutation.mutateAsync(expense)
  }

  const refreshGroups = async () => {
    await queryClient.invalidateQueries({ queryKey: ['groups'] })
  }

  const refreshExpenses = async () => {
    await queryClient.invalidateQueries({ queryKey: ['expenses'] })
  }

  return (
    <DataContext.Provider
      value={{
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
        deleteExpense,
        deleteTransaction,
        restoreExpense,
        restoreTransaction,
        updateExpense,
        refreshGroups,
        refreshExpenses,
        loading,
      }}
    >
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
