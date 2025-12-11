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

export function Friends() {
  const { friends, loading } = useData()
  
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
            <Link key={friend.id} to={`/friends/${friend.id}`}>
              <Card className="p-4 hover:bg-accent/50 transition-colors">
                <div className="flex items-center gap-4">
                  <Avatar>
                    <AvatarImage src={friend.avatar} />
                    <AvatarFallback>
                      {friend.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{friend.name}</p>
                    <p
                      className={cn(
                        "text-sm",
                        friend.balance > 0
                          ? "text-green-600"
                          : friend.balance < 0
                          ? "text-red-600"
                          : "text-muted-foreground"
                      )}
                    >
                      {friend.balance > 0
                        ? "owes you"
                        : friend.balance < 0
                        ? "you owe"
                        : "settled"}
                    </p>
                  </div>
                  <div
                    className={cn(
                      "font-bold",
                      friend.balance > 0
                        ? "text-green-600"
                        : friend.balance < 0
                        ? "text-red-600"
                        : "text-muted-foreground"
                    )}
                  >
                    {friend.balance !== 0 && `₹${Math.abs(friend.balance)}`}
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
