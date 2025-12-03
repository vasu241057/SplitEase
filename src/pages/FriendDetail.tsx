import { useParams, Link, useNavigate } from "react-router-dom"
import { ArrowLeft, Banknote } from "lucide-react"
import { useData } from "../context/DataContext"
import { Button } from "../components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar"
import { Card } from "../components/ui/card"
import { cn } from "../utils/cn"

export function FriendDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { friends, expenses, currentUser } = useData()
  const friend = friends.find((f) => f.id === id)

  if (!friend) {
    return <div>Friend not found</div>
  }

  const sharedExpenses = expenses.filter((e) =>
    e.splits.some((s) => s.userId === friend.id || (friend.linked_user_id && s.userId === friend.linked_user_id))
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/friends">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={friend.avatar} />
            <AvatarFallback>
              {friend.name
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-xl font-bold">{friend.name}</h1>
            <p className="text-sm text-muted-foreground">{friend.email}</p>
          </div>
        </div>
      </div>

      <Card className="p-6 text-center">
        <p className="text-sm text-muted-foreground mb-1">Total Balance</p>
        <div
          className={cn(
            "text-3xl font-bold mb-4",
            friend.balance > 0
              ? "text-green-600"
              : friend.balance < 0
              ? "text-red-600"
              : "text-muted-foreground"
          )}
        >
          {friend.balance === 0
            ? "Settled"
            : friend.balance > 0
            ? `Owes you ₹${friend.balance}`
            : `You owe ₹${Math.abs(friend.balance)}`}
        </div>
        <div className="flex justify-center gap-4">
          <Button 
            className="w-full max-w-xs"
            onClick={() => navigate("/settle-up", { 
              state: { 
                friendId: friend.id,
                defaultDirection: friend.balance > 0 ? "receiving" : "paying"
              } 
            })}
          >
            Settle Up
          </Button>
        </div>
      </Card>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Shared Expenses</h2>
        {sharedExpenses.length === 0 ? (
          <p className="text-muted-foreground text-sm">No shared expenses.</p>
        ) : (
          <div className="space-y-3">
            {sharedExpenses.map((expense) => (
              <Card 
                key={expense.id} 
                className="overflow-hidden cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => navigate(`/expenses/${expense.id}`)}
              >
                <div className="flex items-center p-4 gap-4">
                  <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                    <Banknote className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{expense.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(expense.date).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">₹{expense.amount}</p>
                    <p className="text-xs text-muted-foreground">
                      {expense.payerId === currentUser.id
                        ? `You paid`
                        : expense.payerId === friend.id || (friend.linked_user_id && expense.payerId === friend.linked_user_id)
                        ? `${friend.name} paid`
                        : "Someone else paid"}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
