import { useState, useEffect, useMemo, useRef } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { ArrowLeft, Loader2, Info, ChevronDown, ChevronUp } from "lucide-react"
import { useData } from "../context/DataContext"
import { Button } from "../components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar"
import { cn } from "../utils/cn"

// UI label: "Everything" / Internal mode name: "total"
type SettleMode = "personal" | "total" | "group";

export function SettleUp() {
  const navigate = useNavigate()
  const { friends, settleUp, settleUpTotal, groups } = useData()
  
  const location = useLocation()
  const friendId = location.state?.friendId || ""
  const groupId = location.state?.groupId || ""
  const entryMode = location.state?.entryMode
  const [amount, setAmount] = useState(location.state?.amount || "")
  const [direction, setDirection] = useState<"paying" | "receiving">(
    (location.state?.defaultDirection as "paying" | "receiving") || "paying"
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const breakdownRef = useRef<HTMLDivElement>(null)
  const groupAmountInitialized = useRef(false)
  
  // Determine current friend for balance checks
  const currentFriend = friends.find(f => f.id === friendId)
  
  // Pre-calculate balances for mode switching
  const personalBalance = useMemo(() => {
    return currentFriend?.group_breakdown?.find(b => b.groupId === null)?.amount || 0;
  }, [currentFriend]);
  
  const totalBalance = useMemo(() => {
    return currentFriend?.balance || 0;
  }, [currentFriend]);
  
  const hasPersonalBalance = Math.abs(personalBalance) >= 0.01;
  const hasTotalBalance = Math.abs(totalBalance) >= 0.01;
  
  // Track if default mode has been set
  const [hasSetDefaultMode, setHasSetDefaultMode] = useState(false);
  
  // Mode state - starts as personal, will be updated by useEffect once
  const [mode, setMode] = useState<SettleMode>(() => {
    if (groupId) return "group";
    return "personal"; // Default, will be corrected by useEffect if needed
  });
  
  // Set default mode ONCE when friend data loads (not on every mode change)
  useEffect(() => {
    if (!hasSetDefaultMode && entryMode === "friend-wall" && currentFriend && !groupId) {
      // Only set default if we haven't already
      if (!hasPersonalBalance && hasTotalBalance) {
        setMode("total");
      }
      setHasSetDefaultMode(true);
    }
  }, [currentFriend, hasPersonalBalance, hasTotalBalance, entryMode, groupId, hasSetDefaultMode]);
  
  // Initialize amount based on mode (fix missing amount initialization)
  useEffect(() => {
    if (currentFriend && entryMode === "friend-wall" && !groupId) {
      if (mode === "personal" && hasPersonalBalance) {
        setAmount(Math.abs(personalBalance).toFixed(2));
        setDirection(personalBalance < 0 ? "paying" : "receiving");
      } else if (mode === "total" && hasTotalBalance) {
        setAmount(Math.abs(totalBalance).toFixed(2));
        setDirection(totalBalance < 0 ? "paying" : "receiving");
      }
    }
  }, [mode, currentFriend, personalBalance, totalBalance, hasPersonalBalance, hasTotalBalance, entryMode, groupId]);
  
  // Clear errors when mode changes
  useEffect(() => {
    setError(null);
  }, [mode]);

  // Check if simplification is enabled for this group (DB Flag)
  const selectedGroup = groups.find(g => g.id === groupId);
  const isSimplified = selectedGroup?.simplifyDebtsEnabled === true;

  // Initialize amount from Context if not passed in state (for group mode)
  useEffect(() => {
      if (!groupAmountInitialized.current && friendId && selectedGroup) {
          const member = selectedGroup.members.find(m => m.id === friendId);
          const memberUserId = member?.userId;
          
          const friend = friends.find(f => 
              (memberUserId && f.linked_user_id === memberUserId) || f.id === friendId
          );
          
          if (friend && friend.group_breakdown) {
              const breakdown = friend.group_breakdown.find(b => b.groupId === groupId);
              if (breakdown) {
                  const balance = breakdown.amount; 
                  if (balance !== 0) {
                      setAmount(Math.abs(balance).toFixed(2));
                      setDirection(balance < 0 ? "paying" : "receiving");
                      groupAmountInitialized.current = true;
                  }
              }
          }
      }
  }, [friendId, groupId, selectedGroup, friends]);

  // Compute balance and correct direction for BOTH group and personal modes
  const balanceInfo = useMemo(() => {
    if (!friendId) return null;
    
    const member = selectedGroup?.members.find(m => m.id === friendId);
    const memberUserId = member?.userId;
    
    const friend = friends.find(f => 
      (memberUserId && f.linked_user_id === memberUserId) || f.id === friendId
    );
    
    if (!friend?.group_breakdown) return null;
    
    if (mode === "group" && groupId) {
      const breakdown = friend.group_breakdown.find(b => b.groupId === groupId);
      if (!breakdown) return null;
      return {
        amount: breakdown.amount,
        absolute: Math.abs(breakdown.amount),
        correctDirection: breakdown.amount < 0 ? 'paying' as const : 'receiving' as const
      };
    } else if (mode === "personal") {
      const breakdown = friend.group_breakdown.find(b => b.groupId === null);
      if (!breakdown) return null;
      return {
        amount: breakdown.amount,
        absolute: Math.abs(breakdown.amount),
        correctDirection: breakdown.amount < 0 ? 'paying' as const : 'receiving' as const
      };
    } else if (mode === "total") {
      return {
        amount: friend.balance,
        absolute: Math.abs(friend.balance),
        correctDirection: friend.balance < 0 ? 'paying' as const : 'receiving' as const
      };
    }
    return null;
  }, [friendId, selectedGroup, friends, groupId, mode]);

  const maxBalance = balanceInfo?.absolute || null;

  const parsedAmount = useMemo(() => {
    const parsed = parseFloat(amount);
    return isNaN(parsed) ? 0 : parsed;
  }, [amount]);

  // Get payment breakdown for Everything mode
  const paymentBreakdown = useMemo(() => {
    if (!currentFriend?.group_breakdown) return [];
    return currentFriend.group_breakdown
      .filter(b => Math.abs(b.amount) >= 0.01)
      .map(b => ({
        name: b.groupId === null ? "Personal Expenses" : b.name,
        amount: b.amount,
        isPersonal: b.groupId === null
      }));
  }, [currentFriend]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!friendId || !amount) return
    
    if (parsedAmount <= 0) {
      setError("Please enter a valid positive amount");
      return;
    }

    if (mode === "total") {
      if (currentFriend && Math.abs(parsedAmount - Math.abs(currentFriend.balance)) > 0.01) {
        setError("Total settlement amount cannot be changed. It must exactly match the total balance.");
        return;
      }
    }

    // Note: Direction validation removed - direction is now auto-set from balance sign
    // and UI no longer allows manual direction change

    setLoading(true)
    try {
        if (mode === "total") {
          await settleUpTotal(friendId, parsedAmount);
        } else {
          await settleUp(
            friendId,
            parsedAmount,
            direction === "paying" ? "paid" : "received",
            groupId || undefined
          );
        }
        navigate(-1)
    } catch (error) {
        console.error("Error settling up:", error)
    } finally {
        setLoading(false)
    }
  }

  // Determine if we show mode switcher (only for friend-wall entry, not group)
  const showModeSwitcher = !groupId && entryMode === "friend-wall";

  // Auto-scroll to breakdown when opened
  useEffect(() => {
    if (showBreakdown && breakdownRef.current) {
      breakdownRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [showBreakdown]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Full-screen container with padding */}
      <div className="flex-1 container mx-auto px-4 py-6 flex flex-col">
        {/* Header with divider */}
        <div className="flex items-center gap-4 pb-4 border-b border-border">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">Settle Up</h1>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto py-6 pb-24 space-y-6">
        
        {/* Mode Switcher - Pill style matching Figma */}
        {showModeSwitcher && currentFriend && (
          <div className="flex p-1 bg-muted/50 rounded-full border border-border">
            <button
              type="button"
              className={cn(
                "flex-1 py-3 text-sm font-medium rounded-full transition-all",
                mode === "personal" 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground",
                !hasPersonalBalance && "opacity-50 cursor-not-allowed"
              )}
              onClick={() => {
                if (hasPersonalBalance) {
                  setMode("personal");
                }
              }}
              disabled={!hasPersonalBalance}
            >
              Personal
            </button>
            <button
              type="button"
              className={cn(
                "flex-1 py-3 text-sm font-medium rounded-full transition-all",
                mode === "total" 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground",
                !hasTotalBalance && "opacity-50 cursor-not-allowed"
              )}
              onClick={() => {
                if (hasTotalBalance) {
                  setMode("total");
                }
              }}
              disabled={!hasTotalBalance}
            >
              Everything
            </button>
          </div>
        )}

        {/* Context Banner - Matching Figma style */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/30 border border-border">
          <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <p className="text-sm text-foreground">
            {mode === "personal" && "You are settling personal expenses only."}
            {mode === "total" && "You are settling all balances across personal and all groups."}
            {mode === "group" && (selectedGroup ? `You are settling balances in ${selectedGroup.name}.` : "You are settling group balances.")}
          </p>
        </div>

        {/* Who are you settling with? - Locked friend card */}
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Who are you settling with?</p>
          <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/30 border border-border">
            <Avatar className="h-10 w-10">
              <AvatarImage src={currentFriend?.avatar} />
              <AvatarFallback className="bg-primary/20 text-primary">
                {currentFriend?.name?.split(" ").map(n => n[0]).join("") || "?"}
              </AvatarFallback>
            </Avatar>
            <span className="flex-1 font-medium">{currentFriend?.name || "Select friend"}</span>
            {location.state?.friendId && (
              <span className="px-3 py-1 text-xs font-medium text-muted-foreground bg-muted rounded-full">
                Locked
              </span>
            )}
          </div>
        </div>

        {/* Amount Field */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              {direction === "paying" ? "You are paying" : "You are getting"}
            </p>
            {mode === "personal" && maxBalance !== null && (
              <p className="text-sm text-muted-foreground">
                Balance: ₹{maxBalance.toFixed(2)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/30 border border-border overflow-visible">
            <span className="text-lg text-muted-foreground">₹</span>
            <input
              type="number"
              placeholder="0"
              className={cn(
                "w-0 flex-1 min-w-0 bg-transparent text-2xl font-semibold outline-none",
                "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                mode === "total" && "cursor-not-allowed"
              )}
              value={amount}
              onChange={(e) => {
                if (mode !== "total") {
                  setAmount(e.target.value);
                }
              }}
              disabled={loading || mode === "total"}
              readOnly={mode === "total"}
              min="0"
              step="0.01"
            />
            {mode === "total" && (
              <span className="shrink-0 px-3 py-1 text-xs font-medium text-muted-foreground bg-muted rounded-full">
                Locked
              </span>
            )}
          </div>
          
          {/* Error message */}
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          
          {/* Group simplification helper */}
          {mode === "group" && isSimplified && (
            <p className="text-xs text-muted-foreground">
              This amount reflects simplified group debts.
            </p>
          )}
          
          {/* Overpay warning (not for total mode) */}
          {mode !== "total" && maxBalance !== null && parsedAmount > maxBalance + 0.01 && parsedAmount > 0 && (
            <p className="text-xs text-blue-500">
              You are overpaying by ₹{(parsedAmount - maxBalance).toFixed(2)} — this will create a reverse balance.
            </p>
          )}
        </div>

        {/* Payment Breakdown - Collapsible, Everything mode only */}
        {mode === "total" && paymentBreakdown.length > 0 && (
          <div ref={breakdownRef} className="rounded-xl bg-muted/30 border border-border overflow-hidden">
            <button
              type="button"
              className="flex items-center justify-between w-full p-4 text-left"
              onClick={() => setShowBreakdown(!showBreakdown)}
            >
              <span className="text-sm font-medium">Payment breakdown</span>
              {showBreakdown ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            
            {showBreakdown && (
              <div className="border-t border-border divide-y divide-border">
                {paymentBreakdown.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center p-4">
                    <span className="text-sm">{item.name}</span>
                    <span className={cn(
                      "text-sm font-medium",
                      item.amount > 0 ? "text-green-500" : "text-red-500"
                    )}>
                      {item.amount > 0 ? "+" : "-"}₹{Math.abs(item.amount).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        </div>
      </div>

      {/* Fixed Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t border-border z-10">
        <div className="container mx-auto">
          <Button 
            type="submit" 
            className="w-full py-6 text-base font-medium rounded-xl" 
            size="lg" 
            disabled={loading || !friendId || !amount}
            onClick={handleSubmit}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              mode === "total" ? "Settle Everything" : "Record Payment"
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
