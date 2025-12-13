import { Plus } from "lucide-react"
import { Link } from "react-router-dom"
import { useData } from "../context/DataContext"
import { Button } from "../components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar"
import { Card } from "../components/ui/card"
import { cn } from "../utils/cn"
import { TotalBalance } from "../components/TotalBalance"
import { FloatingAddExpense } from "../components/FloatingAddExpense"
import { Skeleton } from "../components/ui/skeleton"
import { getFriendBalanceBreakdown } from "../utils/balanceBreakdown"

export function Friends() {
  const { friends, loading, currentUser, groups, expenses, transactions } = useData()
  
  const totalOwed = friends
    .filter((f) => f.balance > 0)
    .reduce((acc, curr) => acc + curr.balance, 0)

  const totalOwe = friends
    .filter((f) => f.balance < 0)
    .reduce((acc, curr) => acc + Math.abs(curr.balance), 0)

  const netBalance = totalOwed - totalOwe



  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Friends</h1>
        <Link to="/invite-friend">
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Friend
          </Button>
        </Link>
      </div>



      {loading ? (
        <div className="bg-primary text-primary-foreground p-6 rounded-2xl shadow-lg">
           <Skeleton className="h-4 w-32 bg-primary-foreground/20 mb-2" />
           <Skeleton className="h-10 w-48 bg-primary-foreground/20" />
        </div>
      ) : (
        <TotalBalance amount={netBalance} />
      )}

      <div className="space-y-3 pb-20">
        {loading ? (
           Array.from({ length: 5 }).map((_, i) => (
             <Card key={i} className="p-4">
               <div className="flex items-center gap-4">
                 <Skeleton className="h-10 w-10 rounded-full" />
                 <div className="flex-1 space-y-2">
                   <Skeleton className="h-4 w-32" />
                   <Skeleton className="h-3 w-20" />
                 </div>
                 <Skeleton className="h-6 w-16" />
               </div>
             </Card>
           ))
        ) : friends.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            You haven't added any friends yet.
          </p>
        ) : (
          friends.map((friend) => (
            <Link key={friend.id} to={`/friends/${friend.id}`} className="block">
              <Card className="p-4 hover:bg-accent/50 transition-colors">
                <div className="flex items-start gap-4">
                  <Avatar className="mt-1">
                    <AvatarImage src={friend.avatar} />
                    <AvatarFallback>
                      {friend.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-2">
                        <p className="font-medium truncate text-lg">{friend.name}</p>
                        <div className="text-right">
                             <p
                                className={cn(
                                    "text-xs font-medium mb-1",
                                    friend.balance > 0 ? "text-green-600" : friend.balance < 0 ? "text-red-600" : "text-muted-foreground"
                                )}
                              >
                                {friend.balance > 0 ? "owes you" : friend.balance < 0 ? "you owe" : "settled"}
                              </p>
                              <div
                                className={cn(
                                    "font-bold text-lg leading-none",
                                    friend.balance > 0 ? "text-green-600" : friend.balance < 0 ? "text-red-600" : "text-muted-foreground"
                                )}
                              >
                                {friend.balance !== 0 && `₹${Math.abs(friend.balance).toFixed(2)}`}
                              </div>
                        </div>
                    </div>
                    
                    {/* Buckets Breakdown */}
                    {(() => {
                         const breakdown = getFriendBalanceBreakdown(friend, currentUser, groups, expenses, transactions);
                         
                         if (breakdown.length === 0) return null;

                         // Rules: 1-3 = show all, >3 = show 2 + remaining
                         const showAll = breakdown.length <= 3;
                         const visibleBreakdown = showAll ? breakdown : breakdown.slice(0, 2);
                         const remaining = breakdown.length - 2;

                         return (
                            <div className="space-y-1 mt-2">
                                {visibleBreakdown.map((item, idx) => (
                                    <div key={idx} className="flex justify-between text-xs">
                                        <span className="text-muted-foreground truncate max-w-[150px]">{item.isGroup ? `In "${item.name}"` : item.name}</span>
                                        <span className={item.amount > 0 ? "text-green-600" : "text-red-600"}>
                                            {item.amount > 0 ? "owes you" : "you owe"} ₹{Math.abs(item.amount).toFixed(2)}
                                        </span>
                                    </div>
                                ))}
                                {!showAll && remaining > 0 && (
                                    <p className="text-xs text-muted-foreground italic">
                                        + {remaining} more balances
                                    </p>
                                )}
                            </div>
                         )
                    })()}
                  </div>
                </div>
              </Card>
            </Link>
          ))
        )}
      </div>
      <FloatingAddExpense />
    </div>
  )
}
