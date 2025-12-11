import { useState } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { ArrowLeft, Loader2 } from "lucide-react"
import { useData } from "../context/DataContext"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { cn } from "../utils/cn"

export function SettleUp() {
  const navigate = useNavigate()
  const { friends, settleUp } = useData()
  
  const location = useLocation()
  const [friendId, setFriendId] = useState(location.state?.friendId || "")
  const [amount, setAmount] = useState("")
  const [direction, setDirection] = useState<"paying" | "receiving">(
    (location.state?.defaultDirection as "paying" | "receiving") || "paying"
  )
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!friendId || !amount) return

    setLoading(true)
    try {
        await settleUp(
          friendId,
          parseFloat(amount),
          direction === "paying" ? "paid" : "received"
        )
        navigate("/")
    } catch (error) {
        console.error("Error settling up:", error)
    } finally {
        setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">Settle Up</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label>Who are you settling with?</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={friendId}
            onChange={(e) => setFriendId(e.target.value)}
            required
            disabled={loading}
          >
            <option value="">Select a friend</option>
            {friends.map(friend => (
              <option key={friend.id} value={friend.id}>{friend.name}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-2 p-1 bg-muted rounded-lg">
          <button
            type="button"
            className={cn(
              "flex-1 py-2 text-sm font-medium rounded-md transition-all",
              direction === "paying" ? "bg-background shadow" : "text-muted-foreground"
            )}
            onClick={() => setDirection("paying")}
            disabled={loading}
          >
            I paid
          </button>
          <button
            type="button"
            className={cn(
              "flex-1 py-2 text-sm font-medium rounded-md transition-all",
              direction === "receiving" ? "bg-background shadow" : "text-muted-foreground"
            )}
            onClick={() => setDirection("receiving")}
            disabled={loading}
          >
            I received
          </button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="amount">Amount</Label>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-muted-foreground">₹</span>
            <Input
              id="amount"
              type="number"
              placeholder="0.00"
              className="pl-7"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              min="0"
              step="0.01"
              disabled={loading}
            />
          </div>
        </div>

        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? (
             <>
               <Loader2 className="mr-2 h-4 w-4 animate-spin" />
               Recording...
             </>
          ) : (
             "Record Payment"
          )}
        </Button>
      </form>
    </div>
  )
}
