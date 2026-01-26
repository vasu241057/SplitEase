import { useState } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { ArrowLeft, Loader2, AlertCircle, Check } from "lucide-react"
import { useData } from "../context/DataContext"
import { Button } from "../components/ui/button"
import { Card } from "../components/ui/card"
import { cn } from "../utils/cn"

export function SettleUpTotal() {
  const navigate = useNavigate()
  const { friends, settleUpTotal } = useData()
  const location = useLocation()
  
  const friendId = location.state?.friendId
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const friend = friends.find(f => f.id === friendId)

  if (!friend) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Settle Everything</h1>
        </div>
        <Card className="p-6">
          <p className="text-muted-foreground">Friend not found</p>
        </Card>
      </div>
    )
  }

  // Extract breakdown and total
  const breakdown = friend.group_breakdown || []
  const totalAmount = Math.abs(friend.balance)
  const isOwed = friend.balance > 0 // They owe me

  // Filter out zero balances
  const nonZeroBreakdown = breakdown.filter(b => Math.abs(b.amount) >= 0.01)

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)
    
    // 🔴 Issue #6 FIX: Re-validate balance hasn't changed
    const latestFriend = friends.find(f => f.id === friendId);
    
    if (!latestFriend) {
      setError("Friend not found. Please go back and try again.");
      setLoading(false);
      return;
    }
    
    const latestTotal = Math.abs(latestFriend.balance);
    
    if (Math.abs(latestTotal - totalAmount) > 0.01) {
      setError(`Balance has changed (now ₹${latestTotal.toFixed(2)}). Please go back and refresh.`);
      setLoading(false);
      return;
    }
    
    try {
      await settleUpTotal(friendId, totalAmount)
      navigate(-1) // Go back to friend detail
    } catch (err: any) {
      console.error("Error settling up total:", err)
      setError(err.response?.data?.error || "Failed to settle up. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  if (totalAmount < 0.01) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold">Settle Everything</h1>
        </div>
        <Card className="p-6 text-center">
          <Check className="h-12 w-12 mx-auto text-green-600 mb-4" />
          <p className="font-semibold text-lg mb-2">Already Settled!</p>
          <p className="text-sm text-muted-foreground">
            You have no outstanding balances with {friend.name}
          </p>
          <Button className="mt-4" onClick={() => navigate(-1)}>
            Go Back
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">Settle Everything</h1>
      </div>

      {/* Warning Banner */}
      <Card className="p-4 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold text-blue-900 dark:text-blue-100">
              Total Settlement
            </p>
            <p className="text-sm text-blue-800 dark:text-blue-200">
              This will settle all personal and group balances with {friend.name}. 
              The amount cannot be changed.
            </p>
          </div>
        </div>
      </Card>

      {/* Total Amount Card */}
      <Card className="p-6 text-center">
        <p className="text-sm text-muted-foreground mb-2">Total Amount</p>
        <div className={cn(
          "text-4xl font-bold mb-2",
          isOwed ? "text-green-600" : "text-red-600"
        )}>
          ₹{totalAmount.toFixed(2)}
        </div>
        <p className="text-sm text-muted-foreground">
          {isOwed ? "You will receive" : "You will pay"}
        </p>
      </Card>

      {/* Breakdown */}
      <div className="space-y-3">
        <h2 className="font-semibold text-sm text-muted-foreground">
          Settlement Breakdown
        </h2>
        
        {nonZeroBreakdown.map((item, idx) => {
          const isPersonal = item.groupId === null
          const itemAmount = Math.abs(item.amount)
          const itemIsOwed = item.amount > 0
          
          return (
            <Card key={idx} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {isPersonal ? "Personal Expenses" : item.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {itemIsOwed ? "They owe you" : "You owe them"}
                  </p>
                </div>
                <div className="text-right">
                  <p className={cn(
                    "font-bold",
                    itemIsOwed ? "text-green-600" : "text-red-600"
                  )}>
                    ₹{itemAmount.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {itemIsOwed ? "receive" : "pay"}
                  </p>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Error Message */}
      {error && (
        <Card className="p-4 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        </Card>
      )}

      {/* Confirmation */}
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Check className="h-5 w-5 text-green-600" />
            <p className="text-sm">
              {nonZeroBreakdown.length} balance{nonZeroBreakdown.length !== 1 ? 's' : ''} will be settled
            </p>
          </div>
          <Button 
            className="w-full" 
            size="lg"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              `Confirm Settlement (₹${totalAmount.toFixed(2)})`
            )}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => navigate(-1)}
            disabled={loading}
          >
            Cancel
          </Button>
        </div>
      </Card>
    </div>
  )
}
