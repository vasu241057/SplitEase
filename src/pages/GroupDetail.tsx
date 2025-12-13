import { useState, useMemo, useEffect } from "react"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import { ArrowLeft, Banknote, Plus, UserPlus, X, Search } from "lucide-react"
import { useData } from "../context/DataContext"
import { Button } from "../components/ui/button"
import { Card } from "../components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar"
import { Input } from "../components/ui/input"
import { cn } from "../utils/cn"
import { api } from "../utils/api"

  export function GroupDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { groups, expenses, friends, refreshGroups, refreshExpenses, currentUser, loading, transactions } = useData() 
  
  const [activeTab, setActiveTab] = useState<"expenses" | "members">("expenses")
  const [showAddMember, setShowAddMember] = useState(false)
  const [showSettleUpModal, setShowSettleUpModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleBack = () => {
    const fromFriendId = location.state?.fromFriendId
    if (fromFriendId) {
      navigate(`/friends/${fromFriendId}`)
    } else {
      navigate("/groups")
    }
  }

  // Refresh expenses when component mounts or when returning from AddExpense
  useEffect(() => {
    refreshExpenses()
  }, [refreshExpenses])

  const group = groups.find((g) => g.id === id)

  // Filter friends not in group - call useMemo UNCONDITIONALLY
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

  console.log("[GroupDetail] Render:", { 
      groupId: group.id, 
      memberCount: group.members.length, 
      expensesCount: groupExpenses.length,
      currentUser: currentUser.id
  });

  const getMemberName = (id: string) => {
    if (id === currentUser.id) return "You"
    const member = group.members.find(m => m.id === id);
    if (member) {
        if (member.userId === currentUser.id) return "You";
        return member.name;
    }
    // Fallback to searching friends if not in group members (rare for group detail context but safe)
    return friends.find((f) => f.id === id || f.linked_user_id === id)?.name || "Unknown"
  }

  const handleAddMember = async (friendId: string) => {
    try {
      const res = await api.post(`/api/groups/${group.id}/members`, { memberId: friendId })
      if (res) {
        // Refresh groups to get updated member list
        await refreshGroups()
      }
    } catch (error) {
      console.error("Failed to add member:", error)
    }
    setShowAddMember(false)
    setSearchQuery("")
  }

  const handleDeleteGroup = async () => {
    try {
      await api.delete(`/api/groups/${group.id}`)
      if (true) {
        await refreshGroups()
        navigate('/groups')
      }
    } catch (error) {
      console.error("Failed to delete group:", error)
    }
    setShowDeleteConfirm(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
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
          size="sm"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => setShowDeleteConfirm(true)}
        >
          Delete
        </Button>
      </div>

      {/* Group Balance Summary */}
      <div className="space-y-1 px-1">
      {/* Group Balance Summary */}
      <div className="space-y-1 px-1">
        {(() => {
            // 1. Calculate all balances first
            const memberBalances = group.members.map(member => {
                const memberId = member.id;
                const isMe = memberId === currentUser.id || member.userId === currentUser.id;
                
                if (isMe) return null;

                let balance = 0;
                
                // Helper to check if a generic ID matches this specific Member
                // We assume 'id' could be:
                // 1. The member.id itself (Group Creator's Friend ID)
                // 2. A Friend ID from MY list that links to the same Global User as this member
                // 3. The Global User ID itself
                const isThisMember = (targetId: string) => {
                    // Direct Match
                    if (targetId === memberId) return true;
                    if (member.userId && targetId === member.userId) return true;

                    // Linked Friend Match (Context: I added expense using My Friend List)
                    const myFriend = friends.find(f => f.id === targetId);
                    if (myFriend && myFriend.linked_user_id && myFriend.linked_user_id === member.userId) {
                        return true;
                    }
                    return false;
                };

                // Expense Debts
                groupExpenses.forEach(expense => {
                    if (expense.payerId === currentUser.id) {
                        // I paid, they owe me their split
                        const split = expense.splits.find(s => isThisMember(s.userId));
                        if (split) balance += (split.amount || 0);
                    } else if (isThisMember(expense.payerId)) {
                        // They paid, I owe them my split
                        const split = expense.splits.find(s => s.userId === currentUser.id);
                        if (split) balance -= (split.amount || 0);
                    }
                });

                // Settle Up Transactions
                const groupTransactions = transactions.filter((t: any) => t.groupId === group.id && !t.deleted);
                groupTransactions.forEach((t: any) => {
                    if (t.fromId === currentUser.id && isThisMember(t.toId)) {
                        balance += t.amount;
                    } else if (isThisMember(t.fromId) && t.toId === currentUser.id) {
                        balance -= t.amount;
                    }
                });

                return {
                    member,
                    balance,
                    isSettled: Math.abs(balance) < 0.01
                };
            }).filter((m): m is NonNullable<typeof m> => m !== null);

            // 2. Filter out settled members
            const activeBalances = memberBalances.filter(m => !m.isSettled);

            // 3. Render
            if (activeBalances.length === 0) {
                return (
                    <div className="flex items-center justify-center  bg-muted/20 rounded-lg">
                        <span className="text-muted-foreground font-medium flex items-center gap-2">
                             All settled up! 🎉
                        </span>
                    </div>
                );
            }

            return activeBalances.map(({ member, balance }) => {
                const isOwe = balance < 0;
                const amount = Math.abs(balance).toFixed(2);
                
                return (
                    <div key={member.id} className="flex items-center justify-between py-1">
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
                );
            });
        })()}
      </div>
      </div>

      <div className="flex border-b">
        <button
          className={cn(
            "flex-1 pb-3 text-sm font-medium transition-colors border-b-2",
            activeTab === "expenses"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setActiveTab("expenses")}
        >
          Expenses
        </button>
        <button
          className={cn(
            "flex-1 pb-3 text-sm font-medium transition-colors border-b-2",
            activeTab === "members"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setActiveTab("members")}
        >
          Members
        </button>
      </div>

      {activeTab === "expenses" ? (
        <div className="space-y-4">
          <div className="flex justify-between">
            <Button size="sm" variant="outline" onClick={() => setShowSettleUpModal(true)}>
              Settle Up
            </Button>
            <Button size="sm" className="gap-2" onClick={() => navigate("/add-expense", { state: { preSelectedGroup: group } })}>
              <Plus className="h-4 w-4" /> Add Expense
            </Button>
          </div>
          {groupExpenses.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">
              No expenses in this group yet.
            </p>
          ) : (
            <div className="space-y-3">
              {groupExpenses.map((expense) => (
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
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {group.members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <UserPlus className="h-16 w-16 text-muted-foreground/50" />
              <p className="text-muted-foreground text-center">
                No members in this group yet
              </p>
              <Button
                size="lg"
                className="gap-2 text-lg"
                onClick={() => setShowAddMember(true)}
              >
                <Plus className="h-5 w-5" />
                Add Member
              </Button>
            </div>
          ) : (
            <>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={() => setShowAddMember(true)}
                >
                  <Plus className="h-4 w-4" />
                  Add Member
                </Button>
              </div>
              <div className="space-y-3">
            {group.members.map(member => (
              <Card key={member.id} className="p-4">
                <div className="flex items-center gap-4">
                  <Avatar>
                    <AvatarImage src={member.avatar} />
                    <AvatarFallback>
                      {member.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-medium">
                        {(member.userId === currentUser.id) ? 'You' : member.name}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Add Member Modal */}
      {showAddMember && (
        <div className="fixed inset-0 bg-background z-50 flex flex-col">
          {/* Header */}
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

          {/* Search */}
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

          {/* Friends List */}
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

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-lg max-w-sm w-full p-6 space-y-4">
            <h2 className="text-xl font-bold">Delete Group</h2>
            <p className="text-muted-foreground">
              Are you sure you want to delete "{group.name}"? This action cannot be undone.
            </p>
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handleDeleteGroup}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Group Settle Up Modal */}
      {showSettleUpModal && (
        <div className="fixed inset-0 bg-background z-50 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
                <h2 className="text-xl font-bold">Settle Up</h2>
                <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSettleUpModal(false)}
                >
                <X className="h-5 w-5" />
                </Button>
            </div>
            
            <div className="p-4 overflow-y-auto space-y-3">
                <p className="text-sm text-muted-foreground mb-2">Select a friend to settle up with in this group.</p>
                {group.members.map(member => {
                    const memberId = member.id;
                    const isMe = memberId === currentUser.id || member.userId === currentUser.id;
                    if (isMe) return null;
                    
                    const name = member.name;
                    const avatar = member.avatar;

                    // Calculate Balance specific to this Group (Duplicate logic to ensure isolation)
                    let balance = 0;
                    
                    const isMember = (id: string) => id === memberId || (member.userId && id === member.userId);
                    const isCurrentUser = (id: string) => id === currentUser.id; // Helper for consistency

                    groupExpenses.forEach(expense => {
                        if (isCurrentUser(expense.payerId)) {
                            // I paid, checking if they owe me
                            const split = expense.splits.find(s => isMember(s.userId));
                            if (split) {
                                const amt = (split.amount || 0);
                                balance += amt;
                            }
                        } else if (isMember(expense.payerId)) {
                            // They paid, checking if I owe them
                            const split = expense.splits.find(s => isCurrentUser(s.userId));
                            if (split) {
                                const amt = (split.amount || 0);
                                balance -= amt;
                            }
                        }
                    });

                    const groupTransactions = transactions.filter((t: any) => t.groupId === group.id && !t.deleted);
                    groupTransactions.forEach((t: any) => {
                        if (isCurrentUser(t.fromId) && isMember(t.toId)) {
                            // I paid them (Settle Up)
                            balance += t.amount;
                        } else if (isMember(t.fromId) && isCurrentUser(t.toId)) {
                            // They paid me (Settle Up)
                            balance -= t.amount;
                        }
                    });

                    // We now show ALL members, even if balance is 0, so users can settle/pay anyone.
                    // if (Math.abs(balance) < 0.01) return null;

                    const isOwe = balance < 0;
                    const amount = Math.abs(balance).toFixed(2);

                    return (
                        <Card key={memberId} className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Avatar>
                                    <AvatarImage src={avatar} />
                                    <AvatarFallback>{name[0]}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <p className="font-medium">{name}</p>
                                    <p className={cn("text-sm", isOwe ? "text-red-500" : "text-green-500")}>
                                        {isOwe ? "you owe" : "owes you"} ₹{amount}
                                    </p>
                                </div>
                            </div>
                            <Button size="sm" onClick={() => {
                                navigate("/settle-up", { 
                                    state: { 
                                        friendId: memberId,
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
    </div>
  )
}
