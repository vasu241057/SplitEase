import { useState, useMemo, useEffect } from "react"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import { ArrowLeft, Banknote, Plus, Search, Settings, X, Info, Wallet } from "lucide-react"
import { useData } from "../context/DataContext"
import { Button } from "../components/ui/button"
import { Card } from "../components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar"
import { Input } from "../components/ui/input"
import { cn } from "../utils/cn"
import { api } from "../utils/api"
import { useGroupBalance } from "../hooks/useGroupBalance"
import { matchesMember, calculatePairwiseExpenseDebt, type GroupMember } from "../utils/groupBalanceUtils"

export function GroupDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { groups, expenses, friends, refreshGroups, refreshExpenses, currentUser, loading, transactions } = useData() 

  const [showAddMember, setShowAddMember] = useState(false)
  const [showSettleUpModal, setShowSettleUpModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [errorModal, setErrorModal] = useState<string | null>(null) // State for generic errors handling

  const handleBack = () => {
    const fromFriendId = location.state?.fromFriendId
    if (fromFriendId) {
      navigate(`/friends/${fromFriendId}`)
    } else {
      navigate("/groups")
    }
  }

  useEffect(() => {
    refreshExpenses()
  }, [refreshExpenses])

  const group = groups.find((g) => g.id === id)

  // Use shared hook for balances
  const { isGroupSettled } = useGroupBalance(group);

  // Handle Actions from Settings Page Redirects
  useEffect(() => {
      if (location.state?.action === 'addMember') {
          setShowAddMember(true);
          // Clear state so it doesn't reopen on refresh
          navigate('.', { replace: true, state: {} }); 
      } else if (location.state?.action === 'settleUp') {
          setShowSettleUpModal(true);
          navigate('.', { replace: true, state: {} }); 
      }
  }, [location.state, navigate]);

  // Filter friends not in group
  const availableFriends = useMemo(() => {
    if (!group) return []
    // Extract member IDs for checking
    const memberIds = group.members.map(m => m.id);
    return friends.filter(
      (friend) =>
        !memberIds.includes(friend.id) &&
        friend.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [friends, group?.members, searchQuery])

  // View-Specific Balances (For the Cards "You owe X") - Using unified utilities
  const balancesRelativeToMe = useMemo(() => {
       if (!group) return [];
       
       const groupExpenses = expenses.filter(e => e.groupId === group.id);
       const groupTransactions = transactions.filter(t => t.groupId === group.id && !t.deleted);
       
       // Find current user's member record in the group to get their friend_id
       const myMemberRecord = group.members.find(
           (m: any) => m.id === currentUser.id || m.userId === currentUser.id
       );
       
       // Use friend_id from group membership, falling back to global user ID
       const meRef: GroupMember = { 
           id: myMemberRecord?.id || currentUser.id, 
           userId: currentUser.id 
       };
      
       const results = group.members.map(member => {
            if (member.id === currentUser.id || member.userId === currentUser.id) {
                return null;
            }
            
            // Other member as GroupMember for unified matching
            const themRef: GroupMember = { id: member.id, userId: member.userId ?? undefined };
             
            let balance = 0;

             groupExpenses.forEach((expense) => {
                 const expenseEffect = calculatePairwiseExpenseDebt(expense, meRef, themRef);
                 balance += expenseEffect;
             });
             
             groupTransactions.forEach((t) => {
                 if (matchesMember(t.fromId, meRef) && matchesMember(t.toId, themRef)) {
                     balance += t.amount;
                 } else if (matchesMember(t.fromId, themRef) && matchesMember(t.toId, meRef)) {
                     balance -= t.amount;
                 }
             });
             
             const isSettled = Math.abs(balance) < 0.01;
             
             return { member, balance, isSettled };
       }).filter((m): m is NonNullable<typeof m> => m !== null && !m.isSettled);

       return results;
  }, [group, expenses, transactions, currentUser.id]);


  if (loading) {
    return (
       <div className="flex items-center justify-center min-h-screen">
          <p className="text-muted-foreground">Loading group...</p>
       </div>
    )
  }

  if (!group) {
    return <div>Group not found</div>
  }

  const groupExpenses = expenses.filter((e) => e.groupId === group.id)
  const groupTransactions = transactions.filter((t) => t.groupId === group.id && !t.deleted)
  
  // Combined activity: expenses + transactions, sorted by date (newest first)
  const groupActivity = [
    ...groupExpenses.map(e => ({ type: 'expense' as const, data: e, date: new Date(e.date) })),
    ...groupTransactions.map(t => ({ type: 'transaction' as const, data: t, date: new Date(t.date) }))
  ].sort((a, b) => b.date.getTime() - a.date.getTime())


  const getMemberName = (id: string) => {
    if (id === currentUser.id) return "You"
    const member = group.members.find(m => m.id === id);
    if (member) {
        if (member.userId === currentUser.id) return "You";
        return member.name;
    }
    return friends.find((f) => f.id === id || f.linked_user_id === id)?.name || "Unknown"
  }

  const handleAddMember = async (friendId: string) => {
    try {
      const res = await api.post(`/api/groups/${group.id}/members`, { memberId: friendId })
      if (res) {
        await refreshGroups()
      }
    } catch (error) {
      console.error("Failed to add member:", error)
    }
    setShowAddMember(false)
    setSearchQuery("")
  }

  return (
    <div className="space-y-6 pb-20 relative min-h-screen"> 
      {/* Header */}
      <div className="flex items-center gap-4 sticky top-0 bg-background/95 backdrop-blur z-10 py-2 border-b">
        <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{group.name}</h1>
          <p className="text-sm text-muted-foreground capitalize">
            {group.type}
          </p>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(`/groups/${id}/settings`)}
        >
          <Settings className="h-5 w-5" />
        </Button>
      </div>

      {/* Group Balance Summary (Relative to Me) */}
      <div className="space-y-1 px-1">
        {isGroupSettled ? (
             <div className="flex items-center justify-center  bg-muted/20 rounded-lg py-3">
                <span className="text-muted-foreground font-medium flex items-center gap-2">
                        All settled up! 🎉
                </span>
            </div>
        ) : balancesRelativeToMe.length === 0 ? (
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                 <p className="text-sm text-yellow-600 dark:text-yellow-400 font-medium flex items-center gap-2">
                     <Info className="h-4 w-4" />
                     Unknown Balance Discrepancy
                 </p>
                 <p className="text-xs text-muted-foreground mt-1 ml-6">
                     Expenses don't match sum of splits. Please check expense details.
                 </p>
            </div>
        ) : (
            balancesRelativeToMe.map(({ member, balance }) => {
                const isOwe = balance < 0;
                const amount = Math.abs(balance).toFixed(2);
                return (
                    <div key={member.id} className="flex items-center justify-between py-1 px-2">
                        <div className="flex items-center gap-2">
                            <Avatar className="h-6 w-6">
                                <AvatarImage src={member.avatar} />
                                <AvatarFallback>{member.name[0]}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium">{member.name}</span>
                        </div>
                        <span className={cn("text-sm font-bold", 
                            isOwe ? "text-red-500" : "text-green-500"
                        )}>
                            {isOwe ? "you owe" : "owes you"} ₹{amount}
                        </span>
                    </div>
                )
            })
        )}
      </div>

      {/* Activity List (Expenses + Transactions) */}
      <div className="space-y-4 pb-24">
          {groupActivity.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Banknote className="h-12 w-12 mb-4 opacity-20" />
                <p>No activity yet.</p>
                <p className="text-sm">Tap + to add an expense.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {groupActivity.map((item) => {
                if (item.type === 'expense') {
                  const expense = item.data;
                  return (
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
                          <p className="font-medium truncate">
                            {expense.description}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(expense.date).toLocaleDateString()} •{" "}
                            {expense.payerId === currentUser.id
                              ? "You paid"
                              : `${getMemberName(expense.payerId)} paid`}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">₹{expense.amount}</p>
                        </div>
                      </div>
                    </Card>
                  );
                } else {
                  const transaction = item.data;
                  const isFromMe = transaction.fromId === currentUser.id;
                  const isToMe = transaction.toId === currentUser.id;
                  
                  // Determine the display text based on who is involved
                  let displayText: string;
                  let amountClass: string;
                  let amountPrefix: string;
                  
                  if (isFromMe) {
                    // I paid someone
                    displayText = `You paid ${getMemberName(transaction.toId)}`;
                    amountClass = "text-red-500";
                    amountPrefix = "-";
                  } else if (isToMe) {
                    // Someone paid me
                    displayText = `${getMemberName(transaction.fromId)} paid you`;
                    amountClass = "text-green-500";
                    amountPrefix = "+";
                  } else {
                    // Third-party transaction - I'm not involved
                    displayText = `${getMemberName(transaction.fromId)} paid ${getMemberName(transaction.toId)}`;
                    amountClass = "text-muted-foreground";
                    amountPrefix = "";
                  }
                  
                  return (
                    <Card 
                      key={transaction.id} 
                      className="overflow-hidden cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => navigate(`/payments/${transaction.id}`)}
                    >
                      <div className="flex items-center p-4 gap-4">
                        <div className="h-10 w-10 bg-green-500/10 rounded-full flex items-center justify-center text-green-600">
                          <Wallet className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">
                            {displayText}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(transaction.date).toLocaleDateString()} • Settle up
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={cn("font-bold", amountClass)}>
                            {amountPrefix}₹{transaction.amount}
                          </p>
                        </div>
                      </div>
                    </Card>
                  );
                }
              })}
            </div>
          )}
      </div>

      {/* Floating Action Button - Positioned higher (bottom-24) to avoid bottom nav */}
      <Button
        className="fixed bottom-24 right-6 h-14 w-14 rounded-full shadow-lg z-40 transition-transform active:scale-95"
        size="icon"
        onClick={() => navigate("/add-expense", { state: { preSelectedGroup: group } })}
      >
        <Plus className="h-6 w-6" />
      </Button>

      {/* Add Member Modal */}
      {showAddMember && (
        <div className="fixed inset-0 bg-background z-[60] flex flex-col animate-in slide-in-from-bottom-5 duration-200">
           <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-xl font-bold">Add Member</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setShowAddMember(false)
                setSearchQuery("")
              }}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="p-4 border-b">
             <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search friends..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                autoFocus
              />
            </div>
           </div>
           <div className="flex-1 overflow-y-auto p-4">
              {availableFriends.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                    {searchQuery ? "No friends found" : "All friends are already in this group"}
                </p>
              ) : (
                <div className="space-y-2">
                    {availableFriends.map((friend) => (
                    <div
                        key={friend.id}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => handleAddMember(friend.id)}
                    >
                        <Avatar>
                        <AvatarImage src={friend.avatar} />
                        <AvatarFallback>{friend.name[0]}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{friend.name}</span>
                    </div>
                    ))}
                </div>
              )}
           </div>
        </div>
      )}

      {/* Settle Up Selection Modal */}
      {showSettleUpModal && (
        <div className="fixed inset-0 bg-background z-[60] flex flex-col animate-in slide-in-from-bottom-5 duration-200">
           <div className="flex items-center justify-between p-4 border-b">
                <h2 className="text-xl font-bold">Settle Up</h2>
                <Button variant="ghost" size="icon" onClick={() => setShowSettleUpModal(false)}>
                    <X className="h-5 w-5" />
                </Button>
            </div>
            
            <div className="p-4 overflow-y-auto space-y-3">
                <p className="text-sm text-muted-foreground mb-2">Select a friend to settle up with in this group.</p>
                {/* We iterate members and show only non-me */}
                {group.members.map(member => {
                    if (member.id === currentUser.id || member.userId === currentUser.id) return null;
                    
                    // FIX: Use proper member matching like Group Wall
                    // Find current user's member record in the group to get their friend_id
                    const myMemberRecord = group.members.find(
                        (m: any) => m.id === currentUser.id || m.userId === currentUser.id
                    );
                    
                    let balance = 0;


                     console.log('┌──────────────────────────────────────────────────────────────');
                     console.log('│ [SETTLE-UP MODAL] Balance Calculation (FIXED)');
                     console.log('│ Member:', member.name);
                     console.log('│ Current User ID:', currentUser.id);
                     console.log('│ My Member Record ID (friend_id):', myMemberRecord?.id);
                     console.log('│ isMember checks: member.id=', member.id, ', member.userId=', member.userId);

                     const meRef: GroupMember = {
                        id: myMemberRecord?.id || currentUser.id,
                        userId: currentUser.id
                     };
                     
                     groupExpenses.forEach((expense) => {
                        const expenseEffect = calculatePairwiseExpenseDebt(
                            expense,
                            meRef, // ME
                            { id: member.id, userId: member.userId ?? undefined } // THEM
                        );
                        balance += expenseEffect;
                     });
                      const groupTransactions = transactions.filter((t: any) => t.groupId === group.id && !t.deleted);
                      groupTransactions.forEach((t: any) => {
                          // Clean use of matchesMember via unified object
                          // ME -> THEM: I paid (positive balance for me if I am creditor? Wait.)
                          // Logic: if I paid, balance += amount (They owe Me)
                          const themRef: GroupMember = { id: member.id, userId: member.userId ?? undefined };
                          
                          if (matchesMember(t.fromId, meRef) && matchesMember(t.toId, themRef)) {
                              balance += t.amount;
                          } else if (matchesMember(t.fromId, themRef) && matchesMember(t.toId, meRef)) {
                              balance -= t.amount;
                          }
                      });

                     console.log('│ SETTLE-UP BALANCE:', balance);
                     console.log('└──────────────────────────────────────────────────────────────');

                     const isOwe = balance < 0;
                     const amount = Math.abs(balance).toFixed(2);
                     
                     return (
                        <Card key={member.id} className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Avatar>
                                    <AvatarImage src={member.avatar} />
                                    <AvatarFallback>{member.name[0]}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <p className="font-medium">{member.name}</p>
                                    <p className={cn("text-sm", isOwe ? "text-red-500" : "text-green-500")}>
                                        {isOwe ? "you owe" : "owes you"} ₹{amount}
                                    </p>
                                </div>
                            </div>
                            <Button size="sm" onClick={() => {
                                navigate("/settle-up", { 
                                    state: { 
                                        friendId: member.id,
                                        groupId: group.id,
                                        defaultDirection: isOwe ? "paying" : "receiving",
                                        amount: Math.abs(balance).toFixed(2)
                                    } 
                                });
                            }}>
                                Settle
                            </Button>
                        </Card>
                    )
                })}
            </div>
        </div>
      )}
      
      {/* Generic Error Modal */}
      {errorModal && (
          <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-6 animate-in fade-in duration-200">
               <div className="bg-background rounded-lg p-6 max-w-sm w-full space-y-4 shadow-xl">
                   <div className="flex items-center gap-2 text-destructive">
                       <Info className="h-6 w-6" />
                       <h3 className="font-bold text-lg">Action Failed</h3>
                   </div>
                   <p className="text-muted-foreground">{errorModal}</p>
                   <div className="flex justify-end">
                       <Button onClick={() => setErrorModal(null)}>Okay</Button>
                   </div>
               </div>
          </div>
      )}
    </div>
  )
}
