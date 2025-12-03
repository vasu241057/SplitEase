import { Banknote, ArrowRightLeft } from "lucide-react"
import { cn } from "../utils/cn"
import { useData } from "../context/DataContext"
import { Card } from "../components/ui/card"
import { FloatingAddExpense } from "../components/FloatingAddExpense"
import { Link } from "react-router-dom"

export function Activity() {
  const { allExpenses, transactions, currentUser } = useData()

  // Combine and sort activities
  type ActivityItem = (
    | (typeof allExpenses[0] & { type: 'expense' })
    | (typeof transactions[0] & { type: 'payment' })
  ) & { deleted?: boolean }

  const activities: ActivityItem[] = [
    ...allExpenses
      .filter(e => e.payerId === currentUser.id || e.splits.some(s => s.userId === currentUser.id))
      .map(e => ({ ...e, type: 'expense' as const })),
    ...transactions
      .filter(t => t.fromId === currentUser.id || t.toId === currentUser.id)
      .map(t => ({ ...t, type: 'payment' as const }))
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Activity</h1>

      <div className="space-y-3 pb-20">
        {activities.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            No activity yet.
          </p>
        ) : (
          activities.map((activity) => {
            const content = (
              <div className="flex items-center p-4 gap-4">
                <div className={cn(
                  "h-10 w-10 rounded-full flex items-center justify-center",
                  activity.deleted ? "bg-red-100 text-red-500" : "bg-primary/10 text-primary"
                )}>
                  {activity.deleted ? (
                     <Banknote className="h-5 w-5" />
                  ) : activity.type === 'expense' ? (
                    <Banknote className="h-5 w-5" />
                  ) : (
                    <ArrowRightLeft className="h-5 w-5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn("font-medium truncate", activity.deleted && "line-through text-muted-foreground")}>
                    {activity.description || (activity.type === 'expense' ? 'Expense' : 'Payment')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {activity.deleted ? "Deleted on " : ""}
                    {new Date(activity.date).toLocaleDateString()} • {new Date(activity.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="text-right">
                  <p className={cn("font-bold", activity.deleted && "line-through text-muted-foreground")}>₹{activity.amount}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {activity.deleted ? "Deleted" : activity.type}
                  </p>
                </div>
              </div>
            )

            return (
              <Card key={activity.id} className={cn("overflow-hidden", activity.deleted && "opacity-60 bg-muted/50")}>
                {activity.type === 'expense' ? (
                  <Link to={`/expenses/${activity.id}`} className="block">
                    {content}
                  </Link>
                ) : (
                  content
                )}
              </Card>
            )
          })
        )}
      </div>
      <FloatingAddExpense />
    </div>
  )
}
