 
import { useState, useMemo } from "react"
import { Plus, Bell, X } from "lucide-react"
import { Link } from "react-router-dom"
import { useData } from "../context/DataContext"
import { useAuth } from "../context/AuthContext"
import { Button } from "../components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar"
import { Card } from "../components/ui/card"
import { cn } from "../utils/cn"
import { TotalBalance } from "../components/TotalBalance"
import { FloatingAddExpense } from "../components/FloatingAddExpense"
import { Skeleton } from "../components/ui/skeleton"
import { A2HSPrompt } from "../components/A2HSPrompt"

const NOTIF_BANNER_DISMISSED_KEY = "splitease_notif_banner_dismissed"
const A2HS_INITIAL_COUNT_KEY = "splitease_a2hs_initial_count"

export function Friends() {
  const { friends, loading, allExpenses } = useData()
  const { user } = useAuth()
  
  // Calculate effective balances - use backend data strictly
  const friendsWithEffectiveBalance = friends;

  // Notification banner state - only show once
  const [showNotifBanner, setShowNotifBanner] = useState(() => {
    if (typeof window === 'undefined') return false
    return !localStorage.getItem(NOTIF_BANNER_DISMISSED_KEY)
  })
  
  const dismissNotifBanner = () => {
    setShowNotifBanner(false)
    localStorage.setItem(NOTIF_BANNER_DISMISSED_KEY, "true")
  }
  
  // Track initial expense count for A2HS - store in sessionStorage per session
  // Compute and store in one pass without useState/useEffect
  const hasCreatedNewExpense = useMemo(() => {
    if (typeof window === 'undefined' || loading) return false
    
    // Get or set initial count
    let storedInitial = sessionStorage.getItem(A2HS_INITIAL_COUNT_KEY)
    if (storedInitial === null) {
      // First time: capture initial count
      sessionStorage.setItem(A2HS_INITIAL_COUNT_KEY, String(allExpenses.length))
      return false // No new expense yet (just set baseline)
    }
    
    // Compare current to initial
    return allExpenses.length > parseInt(storedInitial, 10)
  }, [loading, allExpenses.length])
  
  // Filter for display:
  // 1. Always show explicit friends (isGroupMemberOnly false/undefined)
  // 2. Show group-only friends ONLY if they have a non-zero balance
  const visibleFriends = useMemo(() => {
    return friendsWithEffectiveBalance.filter(friend => {
      // Use the derived effective balance
      const hasBalance = Math.abs(friend.balance) > 0.01;
      
       // Check if explicit or output of minimal graph
      const isGroupMemberOnly = (friend as any).isGroupMemberOnly;
      
      // SHOW IF: Explicit Friend OR Has Debt
      if (!isGroupMemberOnly) return true;
      return hasBalance; 
    });
  }, [friendsWithEffectiveBalance]);

  const totalOwed = visibleFriends
    .filter((f) => f.balance > 0)
    .reduce((acc, curr) => acc + curr.balance, 0)

  const totalOwe = visibleFriends
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

      {/* One-time notification onboarding banner */}
      {showNotifBanner && (
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl p-4 relative">
          <button 
            onClick={dismissNotifBanner}
            className="absolute top-2 right-2 text-blue-400 hover:text-blue-600"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-start gap-3 pr-6">
            <Bell className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Enable notifications
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Get notified when friends add expenses. Go to{" "}
                <Link to="/settings" className="underline font-medium">Settings</Link>
                {" "}to enable.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* A2HS nudge - show after first new expense this session */}
      <A2HSPrompt isLoggedIn={!!user} hasCreatedNewExpense={hasCreatedNewExpense} />

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
        ) : visibleFriends.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            You haven't added any friends yet.
          </p>
        ) : (
          visibleFriends.map((friend) => (
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
                         // Use Backend Provided Breakdown and Sort by Magnitude
                         const breakdown = [...(friend.group_breakdown || [])].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
                         
                         if (breakdown.length === 0) return null;

                         // Rules: 1-3 = show all, >3 = show 2 + remaining
                         const showAll = breakdown.length <= 3;
                         const visibleBreakdown = showAll ? breakdown : breakdown.slice(0, 2);
                         const remaining = breakdown.length - 2;

                         return (
                            <div className="space-y-1 mt-2">
                                {visibleBreakdown.map((item, idx) => (
                                    <div key={idx} className="flex justify-between text-xs">
                                        <span className="text-muted-foreground truncate max-w-[150px]">{item.name}</span>
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
