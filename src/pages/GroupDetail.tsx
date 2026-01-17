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
import { matchesMember, matchesDebtParticipant, type GroupMember } from "../utils/groupBalanceUtils"
import { groupByMonth } from "../utils/dateUtils"

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

  // Simplify Debts Preference (Driven by DB now)
  const simplifyDebts = group?.simplifyDebtsEnabled === true;

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
    // Audit logs removed
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
    return groupByMonth(groupActivity, item => item.date);
  }, [groupActivity]);

  // Derived Simplified Debts (BACKEND DRIVEN)
  const simplifiedDebts = useMemo(() => {
     if (!group || !group.simplified_debts) return [];
     return group.simplified_debts;
  }, [group]);

  const simplificationError = false; // Backend handles errors (returns empty array), so no client error state needed.


  // View-Specific Balances (For the Cards "You owe X") - Using unified utilities
  // View-Specific Balances (Cards)
  const balancesRelativeToMe = useMemo(() => {
       if (!group) return [];

       // DISPLAY LOGIC:
       // If Simplify Enabled -> Use Backend Simplified Edges
       // FAILSAFE: If simplifiedDebts is empty but group is NOT settled, fallback to Raw View (to prevent showing "Unknown Discrepancy")
       const shouldUseSimplified = simplifyDebts && (simplifiedDebts.length > 0 || isGroupSettled);

       if (shouldUseSimplified) {
           // FIX: Use currentUser.id (actual user ID) instead of meRef.id (member/friend ID)
           // simplified_debts uses actual user IDs, not member IDs
           return simplifiedDebts
                .filter(d => d.from === currentUser.id || d.to === currentUser.id)
                .map(debt => {
                    const isOwe = debt.from === currentUser.id;
                    const otherId = isOwe ? debt.to : debt.from;
                    // FIX: Match member by userId (actual user ID), not by member.id
                    const member = group.members.find(m => m.userId === otherId || m.id === otherId);
                    
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
           return group.members.map(member => {
                if (member.id === currentUser.id || member.userId === currentUser.id) return null;

                // FIX: Use linked_user_id to match member.userId (both are auth user IDs)
                const friend = friends.find(f => f.linked_user_id === member.userId);
                let balance = 0;
                
                if (friend && friend.group_breakdown) {
                    const breakdown = friend.group_breakdown.find(b => b.groupId === group.id);
                    if (breakdown) {
                        // In Raw Mode (Simplify OFF), 'amount' IS the raw amount.
                        balance = breakdown.amount;
                    }
                }

                const isSettled = Math.abs(balance) < 0.01;
                return { member, balance, isSettled };

           }).filter((m): m is NonNullable<typeof m> => m !== null && !m.isSettled);
       }
  }, [group, friends, currentUser.id, simplifyDebts, simplifiedDebts]);


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

  // [DISCREPANCY_DEBUG] INSTRUMENTATION
  if (group && !isGroupSettled && balancesRelativeToMe.length === 0) {
     console.log('[DISCREPANCY_DEBUG] Checking Invariant...');
     console.log('[DISCREPANCY_DEBUG] Trigger: Group NOT settled but Balances are EMPTY.');
     console.log('[DISCREPANCY_DEBUG] Toggle State:', { simplifyDebts });
     
     // Log Group Context
     console.log('[DISCREPANCY_DEBUG] Group Context:', {
         id: group.id,
         name: group.name,
         currentUserBalance: group.currentUserBalance,
         simplifyDebtsEnabled: group.simplifyDebtsEnabled,
         simplifiedDebts: group.simplified_debts
     });

     // [NEW] Log all members with their IDs
     console.log('[DISCREPANCY_DEBUG] Group Members:', group.members.map(m => ({
         memberId: m.id,
         userId: m.userId,
         name: m.name
     })));

     // [NEW] Log all friends with their IDs and group_breakdown
     console.log('[DISCREPANCY_DEBUG] All Friends (truncated):', friends.slice(0, 10).map(f => ({
         friendId: f.id,
         linkedUserId: f.linked_user_id,
         name: f.name,
         hasGroupBreakdown: !!f.group_breakdown,
         groupBreakdownCount: f.group_breakdown?.length || 0,
         groupBreakdown: f.group_breakdown?.map(b => ({
             groupId: b.groupId,
             name: b.name,
             amount: b.amount
         }))
     })));

     // [NEW] Trace the exact lookup for each member
     console.log('[DISCREPANCY_DEBUG] Member → Friend Lookup Trace:');
     group.members.forEach(m => {
         const friendByMemberId = friends.find(f => f.id === m.id);
         const friendByUserId = friends.find(f => f.id === m.userId);
         const friendByLinkedUserId = friends.find(f => f.linked_user_id === m.userId);
         
         console.log(`  Member: ${m.name} (id: ${m.id}, userId: ${m.userId})`, {
             matchBy_fId_eq_mId: friendByMemberId ? {
                 friendId: friendByMemberId.id,
                 breakdown: friendByMemberId.group_breakdown?.find(b => b.groupId === group.id) || 'NOT_FOUND'
             } : 'NO_MATCH',
             matchBy_fId_eq_mUserId: friendByUserId ? {
                 friendId: friendByUserId.id,
                 breakdown: friendByUserId.group_breakdown?.find(b => b.groupId === group.id) || 'NOT_FOUND'
             } : 'NO_MATCH',
             matchBy_fLinkedUserId_eq_mUserId: friendByLinkedUserId ? {
                 friendId: friendByLinkedUserId.id,
                 breakdown: friendByLinkedUserId.group_breakdown?.find(b => b.groupId === group.id) || 'NOT_FOUND'
             } : 'NO_MATCH'
         });
     });

     // Log Friend Breakdowns relevant to this group (original)
     const memberBreakdowns = group.members.map(m => {
        const friend = friends.find(f => f.id === m.id);
        const breakdown = friend?.group_breakdown?.find(b => b.groupId === group.id);
        return {
            memberId: m.id,
            name: m.name,
            breakdown: breakdown || 'MISSING'
        };
     });
     console.log('[DISCREPANCY_DEBUG] Friend Breakdowns (by f.id === m.id):', JSON.stringify(memberBreakdowns, null, 2));

     // Audit Expenses
     console.log('[DISCREPANCY_DEBUG] Auditing Group Expenses...');
     groupExpenses.forEach(e => {
         const sumSplits = e.splits.reduce((acc, s) => acc + (s.amount || 0), 0);
         if (Math.abs(e.amount - sumSplits) > 0.01) {
             console.log('[DISCREPANCY_DEBUG] FAILED EXPENSE FOUND:', {
                 id: e.id,
                 desc: e.description,
                 amount: e.amount,
                 sumSplits: sumSplits,
                 delta: e.amount - sumSplits
             });
         }
     });
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
          {/* Group Total Display */}
          {group.currentUserBalance !== undefined && Math.abs(group.currentUserBalance) >= 0.01 && (
            <p className={cn(
              "text-sm font-medium mt-0.5",
              group.currentUserBalance > 0 ? "text-green-600" : "text-red-600"
            )}>
              {group.currentUserBalance > 0 ? "you get back" : "you owe"} ₹{Math.abs(group.currentUserBalance).toFixed(2)}
            </p>
          )}
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

        {/* Simplified View Banner - Explain & Revert & Toggle */}


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
                  
                  // Find the current user's member record in this group
                  const myMemberRecord = group.members.find(
                    (m: any) => m.id === currentUser.id || m.userId === currentUser.id
                  );
                  
                  const meRef: GroupMember = { 
                    id: myMemberRecord?.id || currentUser.id, 
                    userId: currentUser.id 
                  };

                  // Calculate payers info
                  const payers = expense.splits.filter((s: any) => (s.paidAmount || 0) > 0);
                  const isMultiPayer = payers.length > 1;
                  
                  // Payer text logic
                  let payerText = "";
                  if (isMultiPayer) {
                    // Multi-payer: Always show count + total (perspective-neutral)
                    payerText = `${payers.length} people paid ₹${expense.amount}`;
                  } else if (payers.length === 1) {
                    const singlePayer = payers[0];
                    if (matchesMember(singlePayer.userId, meRef)) {
                      payerText = `You paid ₹${singlePayer.paidAmount}`;
                    } else {
                      payerText = `${getMemberName(singlePayer.userId)} paid ₹${singlePayer.paidAmount}`;
                    }
                  } else {
                    // Fallback to payerId if no paidAmount in splits
                    if (matchesMember(expense.payerId, meRef)) {
                      payerText = `You paid ₹${expense.amount}`;
                    } else {
                      payerText = `${getMemberName(expense.payerId)} paid ₹${expense.amount}`;
                    }
                  }

                  // Calculate net effect on current user
                  const mySplit = expense.splits.find((s: any) => matchesMember(s.userId, meRef));
                  const myPaidAmount = mySplit?.paidAmount || 0;
                  const myOwedAmount = mySplit?.amount || 0;
                  const netEffect = myPaidAmount - myOwedAmount;
                  
                  // Extract date parts
                  const expenseDate = item.date;
                  const monthShort = expenseDate.toLocaleDateString('en-US', { month: 'short' });
                  const dayNum = expenseDate.getDate();

                  return (
                    <Card 
                      key={expense.id} 
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
                          {Math.abs(netEffect) < 0.01 ? (
                            <p className="text-sm text-muted-foreground">Settled</p>
                          ) : netEffect > 0 ? (
                            <>
                              <p className="text-sm text-green-600">You lent</p>
                              <p className="text-base font-bold text-green-600">₹{netEffect.toFixed(0)}</p>
                            </>
                          ) : (
                            <>
                              <p className="text-sm text-red-600">You borrowed</p>
                              <p className="text-base font-bold text-red-600">₹{Math.abs(netEffect).toFixed(0)}</p>
                            </>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                } else {
                  const transaction = item.data;
                  const isFromMe = transaction.fromId === currentUser.id;
                  const isToMe = transaction.toId === currentUser.id;
                  
                  // Extract date parts
                  const txDate = item.date;
                  const monthShort = txDate.toLocaleDateString('en-US', { month: 'short' });
                  const dayNum = txDate.getDate();
                  
                  // Determine display text and styling
                  let displayText: string;
                  let netText: string;
                  let netClass: string;
                  
                  if (isFromMe) {
                    displayText = `You paid ${getMemberName(transaction.toId)}`;
                    netText = `-₹${transaction.amount}`;
                    netClass = "text-red-600";
                  } else if (isToMe) {
                    displayText = `${getMemberName(transaction.fromId)} paid you`;
                    netText = `+₹${transaction.amount}`;
                    netClass = "text-green-600";
                  } else {
                    displayText = `${getMemberName(transaction.fromId)} paid ${getMemberName(transaction.toId)}`;
                    netText = `₹${transaction.amount}`;
                    netClass = "text-muted-foreground";
                  }
                  
                  return (
                    <Card 
                      key={transaction.id} 
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
                          <div className="h-10 w-10 bg-green-500/10 rounded-full flex items-center justify-center text-green-600">
                            <Wallet className="h-5 w-5" />
                          </div>
                        </div>
                        
                        {/* Middle: Description */}
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-medium truncate">{displayText}</p>
                          <p className="text-sm text-muted-foreground">Settle up</p>
                        </div>
                        
                        {/* Right: Net Effect */}
                        <div className="text-right shrink-0">
                          <p className={cn("text-base font-bold", netClass)}>{netText}</p>
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
                    
                    let balance = 0;
                     
                     
                     // SIMPLIFIED MODE HANDLING IN SETTLE UP
                     if (simplifyDebts && !simplificationError) {
                         // Find simplified edge using User IDs (simplified_debts uses User IDs)
                         // FIX: Use matchesDebtParticipant for proper User ID matching
                         // 1. Me -> Them (I owe)
                         const iOweThem = simplifiedDebts.find(d => d.from === currentUser.id && matchesDebtParticipant(d.to, member));
                         if (iOweThem) {
                             balance = -iOweThem.amount;
                         } else {
                             // 2. Them -> Me (They owe)
                             const theyOweMe = simplifiedDebts.find(d => matchesDebtParticipant(d.from, member) && d.to === currentUser.id);
                             if (theyOweMe) {
                                 balance = theyOweMe.amount;
                             } else {
                                 balance = 0; // Settled in simplified view
                             }
                         }
                     } else {
                         // RAW PAIRWISE CALCULATION (Backend Driven)
                         // FIX: Use linked_user_id to match member.userId (both are auth user IDs)
                         const friend = friends.find(f => f.linked_user_id === member.userId);
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
