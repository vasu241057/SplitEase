import { useMemo, useState } from "react"
import { useParams, Link, useNavigate } from "react-router-dom"
import { ArrowLeft, Banknote, Users, ArrowRightLeft, ChevronDown, ChevronUp } from "lucide-react"
import { useData } from "../context/DataContext"
import { Button } from "../components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar"
import { Card } from "../components/ui/card"
import { cn } from "../utils/cn"
import { groupByMonth } from "../utils/dateUtils"

import { calculatePairwiseExpenseDebt, matchesMember } from "../utils/groupBalanceUtils"

export function FriendDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { friends, expenses, currentUser, groups, transactions } = useData()
  const [showAllBalances, setShowAllBalances] = useState(false)
  
  const friend = friends.find((f) => f.id === id)

  // IMPORTANT:
  // Friend balances MUST ALWAYS use RAW ledger math.
  // Group-level simplified debts must NEVER affect this screen.
  // Group-level simplifications are handled via reading the amount/rawAmount fields directly.
  // Debug logging removed.
  // Calculate effective balances - use backend data strictly

  // Use backend provided breakdown
  const breakdown = useMemo(() => {
    return (friend?.group_breakdown || []).map(b => {
      // [VISUAL_BADGE] Determine if this amount is simplified
      // If rawAmount exists and is different from effective Amount, it's routed.
      // Using a small epsilon for float comparison.
      const isRouted = b.rawAmount !== undefined && Math.abs(b.amount - b.rawAmount) > 0.01;
      
      // Detect personal entry (groupId is null)
      const isPersonal = b.groupId === null;
      
      return {
        name: b.name, // Backend already provides "Personal Expenses" for personal entry
        amount: b.amount, // EFFECTIVE Amount (Primary Display)
        rawAmount: b.rawAmount, // Available for debug/future
        isGroup: !isPersonal, // false for personal, true for groups
        isPersonal, // true if this is the personal entry
        id: b.groupId, // helper for keys (null for personal)
        isRouted // For UI Badge
      };
    })
    .filter(item => Math.abs(item.amount) > 0.01) // Filter out zero entries
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)); // Sort Absolute Descending (Magnitude)
  }, [friend?.group_breakdown]);


  // Memoize all sorted items (Groups + Personal) for the timeline
  const sortedItems = useMemo(() => {
    if (!friend || !currentUser) return []
    
    // Create Global Refs for Non-Group Items
    const globalMeRef = { id: currentUser.id, userId: currentUser.id };
    const globalFriendRef = { id: friend.id, userId: friend.linked_user_id || undefined };

    const combinedItems: Array<{
        type: 'group' | 'expense' | 'transaction';
        date: string;
        id: string; // ID of the item itself (group ID, expense ID, transaction ID)
        data: any; // The original object
        amount?: number; // For groups/transactions
    }> = []
    
    // 1. Groups (with latest activity date)
    const mutualGroups = groups.filter(g => {
        const isMeIn = g.members.some(m => m.id === currentUser.id || m.userId === currentUser.id);
        const isFriendIn = g.members.some(m => m.id === friend.id || (friend.linked_user_id && m.userId === friend.linked_user_id));
        return isMeIn && isFriendIn;
    });
    
    mutualGroups.forEach(group => {
        const groupMe = group.members.find(m => m.userId === currentUser.id || m.id === currentUser.id);
        const groupFriend = group.members.find(m => m.id === friend.id || (friend.linked_user_id && m.userId === friend.linked_user_id));
        
        if (!groupMe || !groupFriend) return;



        const gExpenses = expenses.filter(e => e.groupId === group.id);
        const gTrans = transactions.filter((t: any) => t.groupId === group.id && !t.deleted);

        // [VIOLATION FIX] Use Backend Artifact for Balance
        const breakdownItem = (friend.group_breakdown || []).find(b => b.groupId === group.id);
        const bal = breakdownItem ? breakdownItem.amount : 0;
        
        let latestDate = new Date(0).toISOString();

        // Keep date logic only - No financial math
        gExpenses.forEach(e => {
             if (new Date(e.date) > new Date(latestDate)) latestDate = e.date;
        });

        gTrans.forEach((t: any) => {
             if (new Date(t.date) > new Date(latestDate)) latestDate = t.date;
        });

        combinedItems.push({
            type: 'group',
            date: latestDate,
            id: group.id,
            data: { name: group.name },
            amount: bal
        });
    });

    // 2. Personal Expenses (Non-Group)
    expenses.forEach(e => {
        // Use Global Refs and Utility to check relevance
        const debt = calculatePairwiseExpenseDebt(e, globalMeRef, globalFriendRef);
        
        if (!e.groupId && Math.abs(debt) > 0.001) {
            combinedItems.push({
                type: 'expense',
                date: e.date,
                id: e.id,
                data: e
            });
        }
    });

    // 3. Personal Transactions (Non-Group)
    transactions.forEach((t: any) => {
        if (!t.groupId && !t.deleted) {
            if (matchesMember(t.fromId, globalMeRef) && matchesMember(t.toId, globalFriendRef)) {
                // I paid
                combinedItems.push({
                    type: 'transaction',
                    date: t.date,
                    id: t.id,
                    data: t,
                    amount: t.amount 
                });
            } else if (matchesMember(t.fromId, globalFriendRef) && matchesMember(t.toId, globalMeRef)) {
                // They paid
                 combinedItems.push({
                    type: 'transaction',
                    date: t.date,
                    id: t.id,
                    data: t,
                    amount: t.amount 
                });
            }
        }
    });

    return combinedItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [friend, currentUser, groups, expenses, transactions])

  // Group sorted items by month
  const itemsByMonth = useMemo(() => {
    return groupByMonth(sortedItems, item => new Date(item.date));
  }, [sortedItems]);

  if (!friend) {
    return <div>Friend not found</div>
  }

  const visibleBreakdown = showAllBalances || breakdown.length <= 3 
        ? breakdown 
        : breakdown.slice(0, 2);

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

      <Card className="p-6 text-center space-y-4">
        <div>
            <p className="text-sm text-muted-foreground mb-1">Total Balance</p>
            <div
            className={cn(
                "text-3xl font-bold",
                friend.balance > 0
                ? "text-green-600"
                : friend.balance < 0
                ? "text-red-600"
                : "text-muted-foreground"
            )}
            >
            {friend.balance === 0
                ? "All settled"
                : friend.balance > 0
                ? `You are owed ₹${friend.balance.toFixed(2)}`
                : `You owe ₹${Math.abs(friend.balance).toFixed(2)}`}
            </div>
        </div>

        {/* Breakdown Buckets */}
        {breakdown.length > 0 && (
            <div className="text-left space-y-2 border-t pt-4">
                {visibleBreakdown.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-1">
                            {item.isGroup ? `In "${item.name}"` : item.name}
                            {item.isRouted && (
                                <span title="Simplified Debt (Routed)" className="text-[10px] cursor-help opacity-70">
                                    ⚡
                                </span>
                            )}
                        </span>
                        <span className={item.amount > 0 ? "text-green-600" : "text-red-600"}>
                            {item.amount > 0 ? "you are owed" : "you owe"} ₹{Math.abs(item.amount).toFixed(2)}
                        </span>
                    </div>
                ))}
                
                {breakdown.length > 3 && (
                    <button 
                        onClick={() => setShowAllBalances(!showAllBalances)}
                        className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground mt-2"
                    >
                        {showAllBalances ? (
                            <>Show less <ChevronUp className="h-3 w-3" /></>
                        ) : (
                            <>+ {breakdown.length - 2} more balances <ChevronDown className="h-3 w-3" /></>
                        )}
                    </button>
                )}
            </div>
        )}

        <div className="flex justify-center gap-4 pt-2">
          <Button 
            className="w-full max-w-xs"
            onClick={() => navigate("/settle-up", { 
              state: { 
                friendId: friend.id,
                defaultDirection: friend.balance > 0 ? "receiving" : "paying",
                amount: Math.abs(friend.balance).toFixed(2)
              } 
            })}
          >
            Settle Up
          </Button>
        </div>
      </Card>

      {/* UNIFIED LIST */}
      <div className="space-y-6">
        {sortedItems.length === 0 ? (
             <p className="text-muted-foreground text-sm text-center py-8">No unified history yet.</p>
        ) : (
            itemsByMonth.map(({ monthKey, label, items }) => (
              <div key={monthKey} className="space-y-3">
                {/* Month Header */}
                <h3 className="text-sm font-semibold text-muted-foreground sticky top-0 bg-background py-2 z-10">
                  {label}
                </h3>
                
                {/* Items for this month */}
                <div className="space-y-3">
                  {items.map(item => {
                if (item.type === 'group') {
                    // GROUP CARD - Keep existing layout but fix wording
                    return (
                        <Card 
                            key={`group-${item.id}`}
                            className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-colors border-l-4 border-l-secondary"
                            onClick={() => navigate(`/groups/${item.id}`, { state: { fromFriendId: friend.id } })}
                        >
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 bg-secondary rounded-lg flex items-center justify-center text-secondary-foreground">
                                    <Users className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="font-medium">{item.data.name}</p>
                                    <p className={cn("text-xs font-medium", 
                                        Math.abs(item.amount || 0) < 0.01 ? "text-muted-foreground" :
                                        (item.amount || 0) > 0 ? "text-green-600" : "text-red-600"
                                    )}>
                                        {Math.abs(item.amount || 0) < 0.01 ? "All settled" : 
                                        (item.amount || 0) > 0 ? `you are owed ₹${(item.amount || 0).toFixed(2)}` : 
                                        `you owe ₹${Math.abs(item.amount || 0).toFixed(2)}`}
                                    </p>
                                </div>
                            </div>
                            <div className="text-xs text-muted-foreground">
                                {new Date(item.date).getFullYear() > 1970 ? new Date(item.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'No activity'}
                            </div>
                        </Card>
                    );
                } else if (item.type === 'expense') {
                    // EXPENSE CARD - New layout with date block
                    const expense = item.data;
                    const expenseDate = new Date(expense.date);
                    const monthShort = expenseDate.toLocaleDateString('en-US', { month: 'short' });
                    const dayNum = expenseDate.getDate();
                    
                    // Calculate payer text
                    const payers = expense.splits.filter((s: any) => (s.paidAmount || 0) > 0);
                    let payerText = "";
                    if (payers.length > 1) {
                      // Multi-payer: Always show count + total (perspective-neutral)
                      payerText = `${payers.length} people paid ₹${expense.amount}`;
                    } else if (payers.length === 1) {
                      const payer = payers[0];
                      if (payer.userId === currentUser.id) {
                        payerText = `You paid ₹${payer.paidAmount}`;
                      } else {
                        payerText = `${friend.name} paid ₹${payer.paidAmount}`;
                      }
                    } else {
                      payerText = expense.payerId === currentUser.id ? `You paid ₹${expense.amount}` : `${friend.name} paid ₹${expense.amount}`;
                    }
                    
                    // Calculate net effect
                    const meRef = { id: currentUser.id, userId: currentUser.id };
                    const friendRef = { id: friend.id, userId: friend.linked_user_id || undefined };
                    const debt = calculatePairwiseExpenseDebt({ splits: expense.splits }, meRef, friendRef);
                    
                    return (
                        <Card 
                            key={`expense-${item.id}`}
                            className="overflow-hidden cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => navigate(`/expenses/${expense.id}`)}
                        >
                            <div className="flex items-center py-4 pl-1 pr-2 gap-3">
                                {/* Left: Date + Icon grouped */}
                                <div className="flex items-center gap-1 shrink-0">
                                  <div className="flex flex-col items-center justify-center w-10 text-center">
                                    <span className="text-xs font-medium text-muted-foreground uppercase leading-tight">{monthShort}</span>
                                    <span className="text-lg font-bold leading-tight">{dayNum}</span>
                                  </div>
                                  <div className="h-10 w-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                                    <Banknote className="h-5 w-5" />
                                  </div>
                                </div>
                                
                                {/* Middle: Description + Payer */}
                                <div className="flex-1 min-w-0">
                                  <p className="text-base font-medium truncate">{expense.description}</p>
                                  <p className="text-sm text-muted-foreground">{payerText}</p>
                                </div>
                                
                                {/* Right: Net Effect (two lines) */}
                                <div className="text-right shrink-0">
                                  {Math.abs(debt) < 0.01 ? (
                                    <p className="text-sm text-muted-foreground">Settled</p>
                                  ) : debt > 0 ? (
                                    <>
                                      <p className="text-sm text-green-600">You lent</p>
                                      <p className="text-base font-bold text-green-600">₹{debt.toFixed(0)}</p>
                                    </>
                                  ) : (
                                    <>
                                      <p className="text-sm text-red-600">You borrowed</p>
                                      <p className="text-base font-bold text-red-600">₹{Math.abs(debt).toFixed(0)}</p>
                                    </>
                                  )}
                                </div>
                            </div>
                        </Card>
                    );
                } else {
                    // TRANSACTION CARD - New layout with date block
                    const transaction = item.data;
                    const isPaid = transaction.fromId === currentUser.id;
                    const txDate = new Date(transaction.date);
                    const monthShort = txDate.toLocaleDateString('en-US', { month: 'short' });
                    const dayNum = txDate.getDate();
                    
                    return (
                        <Card 
                            key={`trans-${item.id}`}
                            className="overflow-hidden cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => navigate(`/payments/${transaction.id}`)}
                        >
                            <div className="flex items-center py-4 pl-1 pr-2 gap-3">
                                {/* Left: Date + Icon grouped */}
                                <div className="flex items-center gap-1 shrink-0">
                                  <div className="flex flex-col items-center justify-center w-10 text-center">
                                    <span className="text-xs font-medium text-muted-foreground uppercase leading-tight">{monthShort}</span>
                                    <span className="text-lg font-bold leading-tight">{dayNum}</span>
                                  </div>
                                  <div className="h-10 w-10 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center text-green-600">
                                    <ArrowRightLeft className="h-5 w-5" />
                                  </div>
                                </div>
                                
                                {/* Middle: Description */}
                                <div className="flex-1 min-w-0">
                                  <p className="text-base font-medium truncate">{isPaid ? `You paid ${friend.name}` : `${friend.name} paid you`}</p>
                                  <p className="text-sm text-muted-foreground">Settle up</p>
                                </div>
                                
                                {/* Right: Net Effect */}
                                <div className="text-right shrink-0">
                                  <p className={cn("text-base font-bold", isPaid ? "text-red-600" : "text-green-600")}>
                                    {isPaid ? `-₹${transaction.amount}` : `+₹${transaction.amount}`}
                                  </p>
                                </div>
                            </div>
                        </Card>
                    );
                }
            })}
                </div>
              </div>
            ))
        )}
      </div>
    </div>
  )
}
