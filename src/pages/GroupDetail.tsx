import { useState, useMemo, useEffect } from "react"
import { useParams, Link, useNavigate } from "react-router-dom"
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
  const { groups, expenses, friends, refreshGroups, refreshExpenses, currentUser } = useData()
  const [activeTab, setActiveTab] = useState<"expenses" | "members">("expenses")
  const [showAddMember, setShowAddMember] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Refresh expenses when component mounts or when returning from AddExpense
  useEffect(() => {
    refreshExpenses()
  }, [refreshExpenses])

  const group = groups.find((g) => g.id === id)

  if (!group) {
    return <div>Group not found</div>
  }

  const groupExpenses = expenses.filter((e) => e.groupId === group.id)

  const getMemberName = (id: string) => {
    if (id === currentUser.id) return "You"
    return friends.find((f) => f.id === id || f.linked_user_id === id)?.name || "Unknown"
  }

  // Filter friends not in group
  const availableFriends = useMemo(() => {
    return friends.filter(
      (friend) =>
        !group.members.includes(friend.id) &&
        friend.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [friends, group.members, searchQuery])

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
        <Button variant="ghost" size="icon" asChild>
          <Link to="/groups">
            <ArrowLeft className="h-5 w-5" />
          </Link>
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
          <div className="flex justify-end">
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
                {group.members.map((memberId) => (
                  <Card key={memberId} className="p-4">
                    <div className="flex items-center gap-4">
                      <Avatar>
                        <AvatarImage src={friends.find(f => f.id === memberId)?.avatar} />
                        <AvatarFallback>
                          {getMemberName(memberId)
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-medium">{getMemberName(memberId)}</p>
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
    </div>
  )
}
