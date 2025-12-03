
import React, { createContext, useContext, useState, useEffect } from "react"
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
  restoreExpense: (id: string) => Promise<void>
  updateExpense: (expense: Expense) => Promise<void>
  refreshGroups: () => Promise<void>
  refreshExpenses: () => Promise<void>
  loading: boolean
}

const DataContext = createContext<DataContextType | undefined>(undefined)

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [friends, setFriends] = useState<Friend[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]) // Raw expenses including deleted
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  const currentUser: User = {
    id: user?.id || "currentUser",
    name: user?.user_metadata?.full_name || "You",
    email: user?.email || "user@example.com",
    avatar: user?.user_metadata?.avatar_url || "",
  }

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [friendsData, groupsData, expensesData, transactionsData] = await Promise.all([
          api.get('/api/friends'),
          api.get('/api/groups'),
          api.get('/api/expenses'),
          api.get('/api/transactions')
        ])

        setFriends(friendsData)
        setGroups(groupsData)
        setAllExpenses(expensesData) // Store ALL expenses
        setTransactions(transactionsData)
      } catch (error) {
        console.error("Failed to fetch data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Derived filtered expenses
  const expenses = allExpenses.filter(e => !e.deleted)

  const addExpense = async (expense: Omit<Expense, "id" | "date">) => {
    try {
      const res = await api.post('/api/expenses', expense)
      if (res) {
        const newExpense = res
        setAllExpenses(prev => [newExpense, ...prev])
        
        // Refresh friends to update balances
        // Refresh friends to update balances
        const friendsData = await api.get('/api/friends')
        setFriends(friendsData)
      }
    } catch (error) {
      console.error("Failed to add expense:", error)
    }
  }

  const addFriend = async (name: string, email?: string) => {
    try {
      const res = await api.post('/api/friends', { name, email })
      if (res) {
        const newFriend = res
        setFriends((prev) => [...prev, newFriend])
      }
    } catch (error) {
      console.error("Failed to add friend:", error)
    }
  }

  const addGroup = async (name: string, type: Group["type"], members: string[]) => {
    try {
      const res = await api.post('/api/groups', { name, type, members })
      if (res) {
        const newGroup = res
        setGroups((prev) => [...prev, newGroup])
      }
    } catch (error) {
      console.error("Failed to add group:", error)
    }
  }

  const refreshGroups = async () => {
    try {
      const res = await api.get('/api/groups')
      if (res) {
        const groupsData = res
        setGroups(groupsData)
      }
    } catch (error) {
      console.error("Failed to refresh groups:", error)
    }
  }

  const refreshExpenses = async () => {
    try {
      const res = await api.get('/api/expenses')
      if (res) {
        const expensesData = res
        setAllExpenses(expensesData)
      }
    } catch (error) {
      console.error("Failed to refresh expenses:", error)
    }
  }

  const settleUp = async (friendId: string, amount: number, type: "paid" | "received") => {
    try {
      const res = await api.post('/api/transactions/settle-up', { friendId, amount, type })
      if (res) {
        const newTransaction = res
        setTransactions((prev) => [...prev, newTransaction])

        // Refresh friends to update balances
        // Refresh friends to update balances
        const friendsData = await api.get('/api/friends')
        setFriends(friendsData)
      }
    } catch (error) {
      console.error("Failed to settle up:", error)
    }
  }

  const deleteExpense = async (id: string) => {
    try {
      await api.delete(`/api/expenses/${id}`)
      if (true) {
        setAllExpenses((prev: Expense[]) => prev.map(e => e.id === id ? { ...e, deleted: true } : e))
        
        // Refresh friends to update balances
        // Refresh friends to update balances
        const friendsData = await api.get('/api/friends')
        setFriends(friendsData)
      }
    } catch (error) {
      console.error("Failed to delete expense:", error)
    }
  }

  const restoreExpense = async (id: string) => {
    try {
      const res = await api.post(`/api/expenses/${id}/restore`, {})
      if (res) {
        // Update allExpenses to mark as not deleted
        setAllExpenses(prev => prev.map(e => e.id === id ? { ...e, deleted: false } : e))
        
        // Refresh friends to update balances
        // Refresh friends to update balances
        const friendsData = await api.get('/api/friends')
        setFriends(friendsData)
      }
    } catch (error) {
      console.error("Failed to restore expense:", error)
    }
  }

  const updateExpense = async (expense: Expense) => {
     // For now, Edit = Delete + Add
     // This is simpler given the complex balance logic.
     // But we need to keep the ID? 
     // Or just create new. User said "details will be filled...".
     // If we create new, ID changes. That's fine usually.
     // But if we want to "Edit", usually we keep ID.
     // Let's implement a proper PUT /expenses/:id later if needed.
     // For now, the plan implies using AddExpense screen.
     // If AddExpense saves, it does POST.
     // We might need to modify AddExpense to do PUT if editing.
     
     // Actually, let's stick to the plan: AddExpense handles the save.
     // If we are editing, we probably want to Delete the old one and Add a new one
     // OR update the existing one.
     // Updating existing is better.
     
     // Let's add updateExpense here but we need backend support for PUT.
     // For this iteration, let's assume AddExpense will handle the API call logic
     // or we add PUT support.
     
     // Let's add PUT support to backend quickly?
     // Or just Delete + Add in frontend?
     // Delete + Add is risky if Add fails.
     // Let's add PUT to backend in next step if needed.
     // For now, let's just leave updateExpense placeholder or implement it assuming PUT exists.
     
     try {
         const res = await api.put(`/api/expenses/${expense.id}`, expense)
         if (res) {
            const updated = res
           setAllExpenses((prev: Expense[]) => prev.map(e => e.id === expense.id ? updated : e))
           const friendsData = await api.get('/api/friends')
           setFriends(friendsData)
        }
     } catch (error) {
        console.error("Failed to update expense", error)
     }
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
        restoreExpense,
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
