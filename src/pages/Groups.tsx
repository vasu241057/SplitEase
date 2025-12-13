import { Plus, Users } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"
import { useData } from "../context/DataContext"
import { Button } from "../components/ui/button"
import { Card } from "../components/ui/card"
import { TotalBalance } from "../components/TotalBalance"
import { FloatingAddExpense } from "../components/FloatingAddExpense"
import { Skeleton } from "../components/ui/skeleton"

export function Groups() {
  const { groups, friends, loading, expenses } = useData()
  const navigate = useNavigate()

  // Calculate net balance for groups (mock logic as group balance isn't directly stored)
  // In a real app, we'd sum up balances from all groups
  const totalOwed = friends
    .filter((f) => f.balance > 0)
    .reduce((acc, curr) => acc + curr.balance, 0)

  const totalOwe = friends
    .filter((f) => f.balance < 0)
    .reduce((acc, curr) => acc + Math.abs(curr.balance), 0)

  const netBalance = totalOwed - totalOwe

  // Count expenses per group
  const getGroupExpenseCount = (groupId: string) => {
    return expenses.filter(e => e.groupId === groupId && !e.deleted).length
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Groups</h1>
        <Button 
          size="sm" 
          className="gap-2" 
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect()
            const x = rect.left + rect.width / 2
            const y = rect.top + rect.height / 2
            navigate("/create-group", { state: { origin: { x, y } } })
          }}
        >
          <Plus className="h-4 w-4" />
          Create Group
        </Button>
      </div>

      <TotalBalance amount={netBalance} />

      <div className="space-y-3 pb-20">
        {loading ? (
           Array.from({ length: 3 }).map((_, i) => (
             <Card key={i} className="p-4">
               <div className="flex items-center gap-4">
                 <Skeleton className="h-12 w-12 rounded-lg" />
                 <div className="flex-1 space-y-2">
                   <Skeleton className="h-4 w-32" />
                   <Skeleton className="h-3 w-20" />
                 </div>
                 <Skeleton className="h-4 w-16" />
               </div>
             </Card>
           ))
        ) : groups.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            You haven't joined any groups yet.
          </p>
        ) : (
          groups.map((group) => {
            const expenseCount = getGroupExpenseCount(group.id)
            return (
            <Link key={group.id} to={`/groups/${group.id}`} className="block">
              <Card className="p-4 hover:bg-accent/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 bg-secondary rounded-lg flex items-center justify-center text-secondary-foreground">
                    <Users className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{group.name}</p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {group.type} • {group.members.length} members
                    </p>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {expenseCount === 0 ? "No expenses" : `${expenseCount} expense${expenseCount > 1 ? 's' : ''}`}
                  </div>
                </div>
              </Card>
            </Link>
          )})
        )}
      </div>
      <FloatingAddExpense />
    </div>
  )
}
