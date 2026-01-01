import { useState, useMemo, useEffect } from "react"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import { ArrowLeft, Banknote, Plus, Search, Settings, X, Info, Wallet, Loader2, Check } from "lucide-react"
import { useData } from "../context/DataContext"
import { Button } from "../components/ui/button"
import { Card } from "../components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar"
import { Input } from "../components/ui/input"
import { cn } from "../utils/cn"
import { api } from "../utils/api"
import { useGroupBalance } from "../hooks/useGroupBalance"
import { matchesMember, type GroupMember } from "../utils/groupBalanceUtils"
import { simplifyGroupDebts, type MemberBalance } from "../utils/debtSimplification"

export function GroupDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { groups, expenses, friends, refreshGroups, refreshExpenses, currentUser, loading, transactions } = useData() 

  const [showAddMember, setShowAddMember] = useState(false)
  const [showSettleUpModal, setShowSettleUpModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [errorModal, setErrorModal] = useState<string | null>(null) // State for generic errors handling
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]) // For bulk selection
  const [isAddingMembers, setIsAddingMembers] = useState(false) // Loading state for bulk add

  const group = groups.find((g) => g.id === id)

  const [isReverting, setIsReverting] = useState(false);

  // Simplify Debts Preference (Driven by DB now)
  const simplifyDebts = group?.simplifyDebtsEnabled === true;

  const handleRevertToRaw = async () => {
      if (!group) return;
      setIsReverting(true);
      try {
          await api.put(`/api/groups/${group.id}`, { simplifyDebtsEnabled: false });
          await refreshGroups();
      } catch (err) {
          console.error("Failed to revert simplify:", err);
      } finally {
          setIsReverting(false);
      }
  };

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




  useEffect(() => {
    if (group) {
        // AUDIT LOG: Applying View
        console.log('[SIMPLIFY STATE]', {
            groupId: group.id,
            enabled: group.simplifyDebtsEnabled,
            screenName: 'GroupDetail'
        });

        // [GROUP TX AUDIT] Ground Truth Check - REMOVED
        // [GROUP EXPENSE AUDIT] Ground Truth Check - REMOVED
    }
  }, [group?.id, group?.simplifyDebtsEnabled, transactions, expenses, group?.name]);

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

  // Define group activity arrays early
  const groupExpenses = useMemo(() => expenses.filter((e) => e.groupId === group?.id), [expenses, group?.id]);
  const groupTransactions = useMemo(() => transactions.filter((t) => t.groupId === group?.id && !t.deleted), [transactions, group?.id]);

  // Combined activity: expenses + transactions, sorted by date (newest first)
  const groupActivity = useMemo(() => [
    ...groupExpenses.map(e => ({ type: 'expense' as const, data: e, date: new Date(e.date) })),
    ...groupTransactions.map(t => ({ type: 'transaction' as const, data: t, date: new Date(t.date) }))
  ].sort((a, b) => b.date.getTime() - a.date.getTime()), [groupExpenses, groupTransactions]);

  // Group activity by month (YYYY-MM) for display headers
  const activityByMonth = useMemo(() => {
    const grouped: Record<string, typeof groupActivity> = {};
    
    groupActivity.forEach(item => {
      const monthKey = `${item.date.getFullYear()}-${String(item.date.getMonth() + 1).padStart(2, '0')}`;
      if (!grouped[monthKey]) {
        grouped[monthKey] = [];
      }
      grouped[monthKey].push(item);
    });
    
    // Sort months in descending order
    const sortedMonths = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
    
    return sortedMonths.map(monthKey => ({
      monthKey,
      label: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(
        new Date(parseInt(monthKey.split('-')[0]), parseInt(monthKey.split('-')[1]) - 1)
      ),
      items: grouped[monthKey]
    }));
  }, [groupActivity]);

  // Calculate Net Balances for Simplification
  // STRICT CONTRACT: Use group.user_balances (Backend Artifact)
  const netBalances = useMemo<MemberBalance[]>(() => {
    if (!group || !group.user_balances) return [];
    
    // Map the backend user_balances object (userId -> balance) to the array format
    return Object.entries(group.user_balances).map(([userId, balance]) => ({
        userId,
        balance: Number(balance) || 0
    }));
  }, [group]);

  // Derived Simplified Debts
  const calculationResult = useMemo(() => {
      if (!simplifyDebts) return [];
      try {
          return simplifyGroupDebts(netBalances);
      } catch (e) {
          console.error("Simplification failed:", e);
          return null;
      }
  }, [simplifyDebts, netBalances]);

  const simplificationError = simplifyDebts && calculationResult === null;
  const simplifiedDebts = calculationResult || [];


  // View-Specific Balances (For the Cards "You owe X") - Using unified utilities
  const balancesRelativeToMe = useMemo(() => {
       if (!group) return [];
       
       // Find current user's member record in the group
       const myMemberRecord = group.members.find(
           (m: any) => m.id === currentUser.id || m.userId === currentUser.id
       );
       
       const meRef: GroupMember = { 
           id: myMemberRecord?.id || currentUser.id, 
           userId: currentUser.id 
       };

       if (simplifyDebts && !simplificationError) {
           // --- SIMPLIFIED MODE (Unchanged) ---
           return simplifiedDebts
                .filter(d => d.from === meRef.id || d.to === meRef.id)
                .map(debt => {
                    const isOwe = debt.from === meRef.id;
                    const otherId = isOwe ? debt.to : debt.from;
                    const member = group.members.find(m => m.id === otherId);
                    
                    if (!member) return null;

                    return {
                        member,
                        balance: isOwe ? -debt.amount : debt.amount,
                        isSettled: false
                    };
                })
                .filter((m): m is NonNullable<typeof m> => m !== null);

       } else {
           // --- RAW LEDGER MODE (Backend Driven) ---
           // STRICT CONTRACT: Use friend.group_breakdown
           return group.members.map(member => {
                // Skip Me
                if (member.id === currentUser.id || member.userId === currentUser.id) {
                    return null;
                }

                // Find the Friend Record
                // The group.members 'id' corresponds to the 'friend.id' in the backend schema for this user context
                const friend = friends.find(f => f.id === member.id);
                
                let balance = 0;
                if (friend && friend.group_breakdown) {
                    const breakdown = friend.group_breakdown.find(b => b.groupId === group.id);
                    if (breakdown) {
                        balance = breakdown.amount; // Positive = Friend owes Me. Negative = I owe Friend.
                    }
                }

                const isSettled = Math.abs(balance) < 0.01;
                return { member, balance, isSettled };

           }).filter((m): m is NonNullable<typeof m> => m !== null && !m.isSettled);
       }
  }, [group, friends, currentUser.id, simplifyDebts, simplifiedDebts, simplificationError]);


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

  // groupExpenses/Transactions defined above

  // Helper to format date as "20 Dec"
  const formatShortDate = (date: Date) => {
    const day = date.getDate();
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    return `${day} ${month}`;
  };


  const getMemberName = (id: string) => {
    if (id === currentUser.id) return "You"
    const member = group.members.find(m => m.id === id);
    if (member) {
        if (member.userId === currentUser.id) return "You";
        return member.name;
    }
    return friends.find((f) => f.id === id || f.linked_user_id === id)?.name || "Unknown"
  }

  // Toggle selection for bulk add
  const toggleMemberSelection = (friendId: string) => {
    setSelectedMembers(prev => 
      prev.includes(friendId) 
        ? prev.filter(id => id !== friendId)
        : [...prev, friendId]
    )
  }

  // Bulk add selected members
  const handleAddSelectedMembers = async () => {
    if (selectedMembers.length === 0) return
    
    setIsAddingMembers(true)
    try {
      // Add each selected member (notifications sent by API)
      for (const friendId of selectedMembers) {
        await api.post(`/api/groups/${group.id}/members`, { memberId: friendId })
      }
      await refreshGroups()
    } catch (error) {
      console.error("Failed to add members:", error)
    } finally {
      setIsAddingMembers(false)
      setSelectedMembers([])
      setShowAddMember(false)
      setSearchQuery("")
    }
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
          <p className="text-sm text-muted-foreground capitalize flex items-center gap-2">
            {group.type}
            {group.simplifyDebtsEnabled && (
                <span 
                    title="Everyone in this group sees the same payment suggestions"
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 cursor-help"
                >
                    Simplified View (Group)
                </span>
            )}
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
        {/* Safety Warning Banner */}
        {simplificationError && (
             <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-2 animate-in fade-in slide-in-from-top-2">
                 <p className="text-sm text-amber-600 dark:text-amber-400 font-medium flex items-center gap-2">
                     <Info className="h-4 w-4" />
                     Simplification Unavailable
                 </p>
                 <p className="text-xs text-muted-foreground mt-1 ml-6">
                     Unable to simplify debts due to a balance mismatch. Showing original balances to ensure accuracy.
                 </p>
            </div>
        )}

        {/* Simplified View Banner - Explain & Revert */}
        {simplifyDebts && !simplificationError && (
             <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 mb-2 flex items-start justify-between">
                 <div className="flex-1">
                     <p className="text-sm text-blue-600 dark:text-blue-400 font-medium flex items-center gap-2">
                         <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                         Simplified View (Group)
                     </p>
                     <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                        <p>This view shows a simplified payment route.</p>
                        <p>It does NOT change what anyone owes overall.</p>
                        <p>You can always switch back to the original ledger.</p>
                     </div>
                 </div>
                 <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-auto py-1 px-2 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                    onClick={handleRevertToRaw}
                    disabled={isReverting}
                 >
                     {isReverting ? "Reverting..." : "View Original Debts"}
                 </Button>
             </div>
        )}

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
                        <div className="flex items-center gap-2">
                            <span className={cn("text-sm font-bold", 
                                isOwe ? "text-red-500" : "text-green-500"
                            )}>
                                {isOwe ? "you owe" : "owes you"} ₹{amount}
                            </span>
                            {/* User Education: Why this payment? */}
                            {simplifyDebts && !simplificationError && (
                                <div className="group relative flex items-center">
                                    <Info className="h-3 w-3 text-muted-foreground/50 cursor-help" />
                                    <div className="absolute right-0 top-full mt-1 z-50 w-48 p-2 bg-popover text-popover-foreground text-xs rounded-md shadow-md border opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                        This payment simplifies the group’s debts.<br/> 
                                        Instead of multiple people paying each other, this settles everything with fewer payments.
                                    </div>
                                </div>
                            )}
                        </div>
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
            <div className="space-y-6">
              {activityByMonth.map(({ monthKey, label, items }) => (
                <div key={monthKey} className="space-y-3">
                  {/* Month Header */}
                  <h3 className="text-sm font-semibold text-muted-foreground sticky top-0 bg-background py-2 z-10">
                    {label}
                  </h3>
                  
                  {/* Items for this month */}
                  <div className="space-y-3">
                    {items.map((item) => {
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
                            {formatShortDate(item.date)} •{" "}
                            {(() => {
                              // Find the current user's member record in this group
                              // This is needed because split.userId may contain the friend_id (how others see us)
                              // rather than the auth user_id
                              const myMemberRecord = group.members.find(
                                (m: any) => m.id === currentUser.id || m.userId === currentUser.id
                              );
                              
                              // Create a GroupMember ref with BOTH IDs for proper matching:
                              // - id: friend_id (how others see us in the group)
                              // - userId: auth user_id (our actual user ID)
                              const meRef: GroupMember = { 
                                id: myMemberRecord?.id || currentUser.id, 
                                userId: currentUser.id 
                              };

                              // Check if user is involved in this expense using proper member matching
                              // BUG FIX: Previously used s.userId === currentUser.id which fails when
                              // split.userId is a friend_id and currentUser.id is the auth user_id
                              const isUserPayer = matchesMember(expense.payerId, meRef) ||
                                expense.splits.some(s => matchesMember(s.userId, meRef) && (s.paidAmount || 0) > 0);
                              const isUserInSplits = expense.splits.some(s => matchesMember(s.userId, meRef));
                              const isUserInvolved = isUserPayer || isUserInSplits;

                              // Show normal payer summary
                              // Check for multi-payer scenario
                              const payers = expense.splits.filter(s => (s.paidAmount || 0) > 0);
                              const isMultiPayer = payers.length > 1;

                              // Determine what text will be shown
                              let resolvedSummaryText = "";

                              if (!isUserInvolved) {
                                resolvedSummaryText = "You are not involved";
                              } else if (isMultiPayer) {
                                // Use matchesMember for proper ID comparison
                                const userPaid = payers.find(p => matchesMember(p.userId, meRef));
                                if (userPaid) {
                                  resolvedSummaryText = `You paid ₹${userPaid.paidAmount}`;
                                } else {
                                  resolvedSummaryText = `${payers.length} people paid`;
                                }
                              } else {
                                resolvedSummaryText = matchesMember(expense.payerId, meRef)
                                  ? "You paid"
                                  : `${getMemberName(expense.payerId)} paid`;
                              }

                              return resolvedSummaryText;
                            })()}
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
                            {formatShortDate(item.date)} • Settle up
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
                </div>
              ))}
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
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setShowAddMember(false)
                setSearchQuery("")
                setSelectedMembers([])
              }}
            >
              <X className="h-5 w-5" />
            </Button>
            <h2 className="text-xl font-bold">Add Members</h2>
            <Button
              variant="ghost"
              onClick={handleAddSelectedMembers}
              disabled={selectedMembers.length === 0 || isAddingMembers}
              className="text-primary disabled:text-muted-foreground"
            >
              {isAddingMembers ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                `Done${selectedMembers.length > 0 ? ` (${selectedMembers.length})` : ''}`
              )}
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
                    {availableFriends.map((friend) => {
                      const isSelected = selectedMembers.includes(friend.id)
                      return (
                        <div
                            key={friend.id}
                            className={cn(
                              "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors",
                              isSelected ? "bg-primary/10" : "hover:bg-muted/50"
                            )}
                            onClick={() => toggleMemberSelection(friend.id)}
                        >
                            {/* Checkbox */}
                            <div className={cn(
                              "h-5 w-5 rounded border-2 flex items-center justify-center transition-colors",
                              isSelected 
                                ? "bg-primary border-primary" 
                                : "border-muted-foreground"
                            )}>
                              {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                            </div>
                            <Avatar>
                              <AvatarImage src={friend.avatar} />
                              <AvatarFallback>{friend.name[0]}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{friend.name}</span>
                        </div>
                      )
                    })}
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

                     const meRef: GroupMember = {
                        id: myMemberRecord?.id || currentUser.id,
                        userId: currentUser.id
                     };
                     
                     
                     // SIMPLIFIED MODE HANDLING IN SETTLE UP
                     if (simplifyDebts && !simplificationError) {
                         // Find simplified edge
                         // 1. Me -> Them (I owe)
                         const iOweThem = simplifiedDebts.find(d => d.from === meRef.id && d.to === member.id);
                         if (iOweThem) {
                             balance = -iOweThem.amount;
                         } else {
                             // 2. Them -> Me (They owe)
                             const theyOweMe = simplifiedDebts.find(d => d.from === member.id && d.to === meRef.id);
                             if (theyOweMe) {
                                 balance = theyOweMe.amount;
                             } else {
                                 balance = 0; // Settled in simplified view
                             }
                         }
                     } else {
                         // RAW PAIRWISE CALCULATION (Backend Driven)
                         const friend = friends.find(f => f.id === member.id);
                         if (friend && friend.group_breakdown) {
                             const breakdown = friend.group_breakdown.find(b => b.groupId === group.id);
                             if (breakdown) {
                                 balance = breakdown.amount; 
                                 // Note: Positive = They owe Me. Negative = I owe Them.
                                 // SettleUp Logic below expects: 
                                 // "isOwe = balance < 0" (I owe them) -> Correct.
                             }
                         }
                     }

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
                                    <div className="flex items-center gap-2">
                                        <p className={cn("text-sm", isOwe ? "text-red-500" : "text-green-500")}>
                                            {isOwe ? "you owe" : "owes you"} ₹{amount}
                                        </p>
                                        {/* User Education: Why 0.00? */}
                                        {simplifyDebts && !simplificationError && Math.abs(balance) < 0.01 && (
                                            <div className="group relative flex items-center">
                                                <Info className="h-3 w-3 text-muted-foreground/50 cursor-help" />
                                                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 p-2 bg-popover text-popover-foreground text-xs rounded-md shadow-md border opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                                    You’re already settled through another member’s payment.
                                                </div>
                                            </div>
                                        )}
                                    </div>
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
