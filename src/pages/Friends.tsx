import { useState } from "react"
import { Plus, X } from "lucide-react"
import { Link } from "react-router-dom"
import { useData } from "../context/DataContext"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar"
import { Card } from "../components/ui/card"
import { cn } from "../utils/cn"
import { TotalBalance } from "../components/TotalBalance"
import { FloatingAddExpense } from "../components/FloatingAddExpense"

export function Friends() {
  const { friends, addFriend } = useData()
  const [isAdding, setIsAdding] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")

  const totalOwed = friends
    .filter((f) => f.balance > 0)
    .reduce((acc, curr) => acc + curr.balance, 0)

  const totalOwe = friends
    .filter((f) => f.balance < 0)
    .reduce((acc, curr) => acc + Math.abs(curr.balance), 0)

  const netBalance = totalOwed - totalOwe

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name) return
    await addFriend(name, email)
    setIsAdding(false)
    setName("")
    setEmail("")
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Friends</h1>
        <Button size="sm" className="gap-2" onClick={() => setIsAdding(!isAdding)}>
          {isAdding ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {isAdding ? "Cancel" : "Add Friend"}
        </Button>
      </div>

      {isAdding && (
        <Card className="p-4 animate-in slide-in-from-top-2">
          <form onSubmit={handleAddFriend} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="Friend's name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email (Optional)</Label>
              <Input
                id="email"
                type="email"
                placeholder="friend@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full">
              Save Friend
            </Button>
          </form>
        </Card>
      )}

      <TotalBalance amount={netBalance} />

      <div className="space-y-3 pb-20">
        {friends.length === 0 ? (
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
