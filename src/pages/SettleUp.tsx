import { useState, useEffect, useMemo } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { ArrowLeft, Loader2, Info } from "lucide-react"
import { useData } from "../context/DataContext"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { cn } from "../utils/cn"

export function SettleUp() {
  const navigate = useNavigate()
  const { friends, settleUp, groups, currentUser } = useData()
  
  const location = useLocation()
  const [friendId, setFriendId] = useState(location.state?.friendId || "")
  const groupId = location.state?.groupId || ""
  const [amount, setAmount] = useState(location.state?.amount || "")
  const [direction, setDirection] = useState<"paying" | "receiving">(
    (location.state?.defaultDirection as "paying" | "receiving") || "paying"
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  console.log("[SettleUp] Render", {
      state: location.state,
      groupId,
      friendId,
      totalGroups: groups.length
  })

  // Check if simplification is enabled for this group (DB Flag)
  const selectedGroup = groups.find(g => g.id === groupId);
  const isSimplified = selectedGroup?.simplifyDebtsEnabled === true;

  // Initialize amount from Context if not passed in state
  useEffect(() => {
      if (!amount && friendId && selectedGroup) {
          // FIX: friendId from GroupDetail may be member.id, not friend.id
          // First find the member to get their userId, then find the friend
          const member = selectedGroup.members.find(m => m.id === friendId);
          const memberUserId = member?.userId;
          
          // Try to find friend by linked_user_id (if we have memberUserId) or by id (fallback)
          const friend = friends.find(f => 
              (memberUserId && f.linked_user_id === memberUserId) || f.id === friendId
          );
          
          if (friend && friend.group_breakdown) {
              const breakdown = friend.group_breakdown.find(b => b.groupId === groupId);
              if (breakdown) {
                  // Default to Effective Amount (Simplified) if enabled, else Raw
                  const balance = breakdown.amount; 
                  if (balance !== 0) {
                      setAmount(Math.abs(balance).toFixed(2));
                      setDirection(balance < 0 ? "paying" : "receiving");
                  }
              }
          }
      }
  }, [friendId, groupId, selectedGroup, friends]); // Run once when dependencies settle



  // Derive available users to settle with
  // If Group is selected: Show Group Members (excluding me)
  // If No Group: Show Friends
  const availableUsers = selectedGroup 
    ? selectedGroup.members
        .filter(m => m.id !== currentUser.id && m.userId !== currentUser.id)
        .map(m => {
            // Try to resolve rich details if available in friend list, else use group member details
            // GroupMember already has name/avatar.
            return {
                id: m.id,
                name: m.name,
                avatar: m.avatar,
                isGroupMember: true
            }
        })
    : friends.map(f => ({ id: f.id, name: f.name, avatar: f.avatar, isGroupMember: false }));

  // Compute balance and correct direction for BOTH group and personal modes
  const balanceInfo = (() => {
    if (!friendId) return null;
    
    // Find member to get their userId
    const member = selectedGroup?.members.find(m => m.id === friendId);
    const memberUserId = member?.userId;
    
    // Find friend by linked_user_id or id
    const friend = friends.find(f => 
      (memberUserId && f.linked_user_id === memberUserId) || f.id === friendId
    );
    
    if (!friend?.group_breakdown) return null;
    
    if (groupId) {
      // Group mode: find group balance
      const breakdown = friend.group_breakdown.find(b => b.groupId === groupId);
      if (!breakdown) return null;
      return {
        amount: breakdown.amount,
        absolute: Math.abs(breakdown.amount),
        correctDirection: breakdown.amount < 0 ? 'paying' : 'receiving'
      };
    } else {
      // Personal mode: find personal balance
      const breakdown = friend.group_breakdown.find(b => b.groupId === null);
      if (!breakdown) return null;
      return {
        amount: breakdown.amount,
        absolute: Math.abs(breakdown.amount),
        correctDirection: breakdown.amount < 0 ? 'paying' : 'receiving'
      };
    }
  })();

  const maxBalance = balanceInfo?.absolute || null;
  const correctDirection = balanceInfo?.correctDirection || null;

  // 🔴 Issue #2 FIX: Parse amount once with useMemo to avoid NaN issues
  const parsedAmount = useMemo(() => {
    const parsed = parseFloat(amount);
    return isNaN(parsed) ? 0 : parsed;
  }, [amount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!friendId || !amount) return
    
    // Validate basic input sanity (parsedAmount already computed via useMemo)
    if (parsedAmount <= 0) {
      setError("Please enter a valid positive amount");
      return;
    }

    // 🔴 CRITICAL: Validate direction matches balance sign
    if (correctDirection && direction !== correctDirection) {
      const context = groupId ? 'this group' : 'personal expenses';
      setError(`Invalid direction. You should be ${correctDirection} for ${context}.`);
      return;
    }

    setLoading(true)
    try {
        await settleUp(
          friendId,
          parsedAmount,
          direction === "paying" ? "paid" : "received",
          groupId || undefined
        )
        navigate(-1) // Go back to where we came from (Group or Friend detail)
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

      <div className="bg-muted/30 p-4 rounded-lg border text-center">
          <p className="text-sm text-muted-foreground mb-1">Recording payment for</p>
          <p className="font-semibold text-primary">
              {selectedGroup ? `Group: "${selectedGroup.name}"` : "Non-group expenses (General)"}
          </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label>Who are you settling with?</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={friendId}
            onChange={(e) => {
                setFriendId(e.target.value);
            }}
            required
            disabled={loading || !!location.state?.friendId} // Lock friend if pre-selected (Group flow usually pre-selects)
          >
            <option value="">Select a friend</option>
            {availableUsers.map(user => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-2 p-1 bg-muted rounded-lg">
          <button
            type="button"
            className={cn(
              "flex-1 py-2 text-sm font-medium rounded-md transition-all",
              direction === "paying" ? "bg-background shadow" : "text-muted-foreground",
              correctDirection && direction !== "paying" && "opacity-50 cursor-not-allowed"
            )}
            onClick={() => setDirection("paying")}
            disabled={loading || (correctDirection !== null && correctDirection !== "paying")}
          >
            I paid
          </button>
          <button
            type="button"
            className={cn(
              "flex-1 py-2 text-sm font-medium rounded-md transition-all",
              direction === "receiving" ? "bg-background shadow" : "text-muted-foreground",
              correctDirection && direction !== "receiving" && "opacity-50 cursor-not-allowed"
            )}
            onClick={() => setDirection("receiving")}
            disabled={loading || (correctDirection !== null && correctDirection !== "receiving")}
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
          {isSimplified && (
              <div className="flex items-start gap-2 mt-2 text-xs text-muted-foreground animate-in fade-in">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <p>
                      This amount reflects simplified group debts.<br/>
                      <span className="opacity-80">Simplification reduces payments but keeps totals unchanged.</span>
                  </p>
              </div>
          )}
          {/* Overpay warning for settle-ups */}
          {maxBalance !== null && parsedAmount > maxBalance + 0.01 && parsedAmount > 0 && (
              <div className="flex items-start gap-2 mt-2 text-xs text-blue-600 dark:text-blue-400 animate-in fade-in bg-blue-50 dark:bg-blue-950/20 p-2 rounded border border-blue-200 dark:border-blue-800">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <p>
                      <span className="font-semibold">You are overpaying by ₹{(parsedAmount - maxBalance).toFixed(2)}</span><br/>
                      This will create a reverse balance {groupId ? 'in this group' : 'for personal expenses'} — they will owe you instead.
                  </p>
              </div>
          )}
          {/* Error message */}
          {error && (
              <div className="flex items-start gap-2 mt-2 text-xs text-red-600 animate-in fade-in">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <p>{error}</p>
              </div>
          )}
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
