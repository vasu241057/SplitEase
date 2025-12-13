import { Banknote, ArrowRightLeft, Users, User } from "lucide-react"
import { cn } from "../utils/cn"
import { useData } from "../context/DataContext"
import { Card } from "../components/ui/card"
import { FloatingAddExpense } from "../components/FloatingAddExpense"
import { Link } from "react-router-dom"
import { Skeleton } from "../components/ui/skeleton"

export function Activity() {
  const { allExpenses, transactions, currentUser, loading, groups } = useData()

  // Combine and sort activities
  type ActivityItem = (
    | (typeof allExpenses[0] & { type: 'expense' })
    | (typeof transactions[0] & { type: 'payment' })
  ) & { deleted?: boolean }

  const activities: ActivityItem[] = [
    ...allExpenses
      .filter(e => {
         const isPayer = e.payerId === currentUser.id
         const isInSplit = e.splits.some(s => s.userId === currentUser.id)
         return isPayer || isInSplit
      })
      .map(e => ({ ...e, type: 'expense' as const })),
    ...transactions
      .filter(t => t.fromId === currentUser.id || t.toId === currentUser.id)
      .map(t => ({ ...t, type: 'payment' as const }))
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Activity</h1>

      {loading ? (
        <div className="space-y-3">
           {Array.from({ length: 5 }).map((_, i) => (
             <Card key={i} className="p-4 overflow-hidden">
               <div className="flex items-center gap-4">
                 <Skeleton className="h-10 w-10 rounded-full" />
                 <div className="flex-1 space-y-2">
                   <Skeleton className="h-4 w-3/4" />
                   <Skeleton className="h-3 w-1/2" />
                 </div>
                 <div className="flex flex-col items-end gap-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-3 w-12" />
                 </div>
               </div>
             </Card>
           ))}
        </div>
      ) : (
        <div className="space-y-3 pb-20">
          {activities.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No activity yet.
            </p>
          ) : (
            activities.map((activity) => {
              const group = groups.find(g => g.id === activity.groupId)
              const ContextIcon = group ? Users : User
              const contextLabel = group ? group.name : "Personal"
              const isGroup = !!group

              const content = (
                <div className="flex items-center p-4 gap-4">
                  <div className={cn(
                    "h-10 w-10 rounded-full flex items-center justify-center transition-colors",
                    activity.deleted 
                      ? "bg-red-100 text-red-500" 
                      : isGroup 
                        ? "bg-indigo-50 text-indigo-600" 
                        : "bg-primary/10 text-primary"
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
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1 bg-muted/50 px-1.5 py-0.5 rounded-sm">
                        <ContextIcon className="h-3 w-3" />
                        <span className="font-medium truncate max-w-[100px]">{contextLabel}</span>
                      </div>
                      <span>•</span>
                      <span>{new Date(activity.date).toLocaleDateString()}</span>
                    </div>
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
                    <Link to={`/payments/${activity.id}`} className="block">
                      {content}
                    </Link>
                  )}
                </Card>
              )
            })
          )}
        </div>
      )}
      <FloatingAddExpense />
    </div>
  )
}
