import { useState, useMemo } from "react"
import { useParams, useNavigate, useSearchParams } from "react-router-dom"
import { ArrowLeft, Pencil, Trash2, Calendar, Receipt, Loader2, RotateCcw } from "lucide-react"
import { useData } from "../context/DataContext"
import { Button } from "../components/ui/button"
import { Card } from "../components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar"
import { Skeleton } from "../components/ui/skeleton"
import { CommentSection } from "../components/CommentSection"



export function ExpenseDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { allExpenses, friends, groups, deleteExpense, restoreExpense, currentUser, loading } = useData()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  
  const expense = allExpenses.find(e => e.id === id)

  // Helper functions must be defined before use if used in useMemo or other hooks
  const getMemberName = (id: string) => {
    // 1. Check Current User
    if (id === "currentUser" || id === currentUser.id) return "You"
    
    // 2. Check Friends List
    const friend = friends?.find(f => f.id === id || f.linked_user_id === id)
    if (friend) return friend.name
    
    // 3. Check Group Members (if expense belongs to a group)
    if (expense?.groupId) {
        const group = groups.find(g => g.id === expense.groupId)
        const member = group?.members.find(m => m.id === id || m.userId === id)
        if (member) {
            console.log(`[ExpenseDetail] Resolved ${id} via Group ${group?.name}: ${member.name}`)
            return member.name
        }
    }

    console.warn(`[ExpenseDetail] Failed to resolve name for ${id}`)
    return "Unknown"
  }
  
  const getMemberAvatar = (id: string) => {
     if (id === "currentUser" || id === currentUser.id) return currentUser.avatar
     
     const friend = friends?.find(f => f.id === id || f.linked_user_id === id)
     if (friend) return friend.avatar

     if (expense?.groupId) {
        const group = groups.find(g => g.id === expense.groupId)
        const member = group?.members.find(m => m.id === id || m.userId === id)
        if (member) return member.avatar
     }
     
     return undefined
  }

  // Determine who paid
  // Safe access to expense.splits with optional chaining
  const splits = useMemo(() => (expense?.splits || []).filter(s => s && s.userId), [expense?.splits])
  
  const payers = useMemo(() => splits.filter(s => (s.paidAmount || 0) > 0), [splits])
  
  const paidText = useMemo(() => {
    if (!expense) return ""
    return payers.length === 1 && payers[0]
    ? `${getMemberName(payers[0].userId)} paid ₹${expense.amount}`
    : `${payers.length} people paid ₹${expense.amount}`
  }, [payers, expense?.amount]) 

  // --- Conditional Returns AFTER all hooks ---

  if (loading) {
     return (
        <div className="space-y-6 container mx-auto px-4 py-4">
           {/* Header Skeleton */}
           <div className="flex justify-between items-center">
             <Skeleton className="h-10 w-10 rounded-full" />
             <div className="flex gap-2">
               <Skeleton className="h-10 w-10 rounded-full" />
               <Skeleton className="h-10 w-10 rounded-full" />
             </div>
           </div>
           
           {/* Main Content Skeleton */}
           <div className="flex items-center gap-4">
             <Skeleton className="h-16 w-16 rounded-full" />
             <div className="space-y-2">
               <Skeleton className="h-6 w-48" />
               <Skeleton className="h-8 w-32" />
             </div>
           </div>
           
           <Skeleton className="h-4 w-32" />
           
           <Card className="p-4 space-y-4">
             <Skeleton className="h-6 w-full mb-4" />
             {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
             ))}
           </Card>
        </div>
     )
  }

  if (!expense) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <p className="text-muted-foreground">Expense not found</p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          Go Back
        </Button>
      </div>
    )
  }

  const handleDelete = async () => {
    try {
      setIsDeleting(true)
      await deleteExpense(expense.id)
      navigate(-1)
    } catch (error) {
       setIsDeleting(false)
    }
  }

  const handleRestore = async () => {
    try {
      setIsRestoring(true)
      await restoreExpense(expense.id)
      navigate(-1)
    } catch (error) {
       setIsRestoring(false)
    }
  }

  const handleEdit = () => {
    navigate("/add-expense", { state: { editExpense: expense } })
  }

  return (
    <div className="fixed top-0 left-0 right-0 bottom-16 md:bottom-0 z-40 bg-background flex flex-col">
      <div className="flex-none container mx-auto px-4 pt-4 pb-3 space-y-6 max-h-[60vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-50 bg-background flex items-center justify-between pb-1">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-6 w-6" />
          </Button>
          {expense.deleted ? (
             <div className="flex items-center gap-2">
               <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-sm font-bold">Deleted</span>
               <Button size="sm" variant="outline" className="text-green-600 border-green-200 hover:bg-green-50 disabled:bg-background disabled:text-green-600 disabled:border-green-200 disabled:opacity-100" onClick={handleRestore} disabled={isRestoring}>
                  {isRestoring ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RotateCcw className="h-4 w-4 mr-2" />
                  )}
                  Restore
                </Button>
             </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" onClick={handleEdit}>
                <Pencil className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setShowDeleteConfirm(true)} className="text-red-500 hover:text-red-600 hover:bg-red-50">
                <Trash2 className="h-5 w-5" />
              </Button>
            </div>
          )}
        </div>

        {/* Main Content Info */}
        <div className="space-y-6">
          <div className="flex items-center gap-4">
             <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center">
                <Receipt className="h-8 w-8 text-primary" />
             </div>
             <div>
                <h1 className="text-2xl font-bold">{expense.description}</h1>
                <p className="text-3xl font-bold mt-1">₹{expense.amount}</p>
             </div>
          </div>
          
          <div className="text-sm text-muted-foreground flex items-center gap-2">
             <Calendar className="h-4 w-4" />
             Added on {new Date(expense.date).toLocaleDateString()}
          </div>

          <Card className="p-4 space-y-4">
             <div className="flex items-center justify-between pb-4 border-b">
                <span className="font-medium text-muted-foreground">{paidText}</span>
             </div>
             
             <div className="space-y-1">
                {splits.map(split => {
                   const name = getMemberName(split.userId)
                   const avatar = getMemberAvatar(split.userId)
                   
                   const net = (split.paidAmount || 0) - split.amount
                   let statusText = ""
                   let statusColor = ""
                   
                   if (Math.abs(net) < 0.01) {
                      statusText = "settled"
                      statusColor = "text-muted-foreground"
                   } else if (net > 0) {
                      statusText = `gets back ₹${net.toFixed(2)}`
                      statusColor = "text-green-600"
                   } else {
                      statusText = `owes ₹${Math.abs(net).toFixed(2)}`
                      statusColor = "text-red-600"
                   }

                   return (
                      <div key={split.userId} className="flex items-center justify-between py-2">
                         <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                               <AvatarImage src={avatar} />
                               <AvatarFallback>{name[0]}</AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col">
                               <span className="font-medium text-sm">{name}</span>
                               <span className="text-xs text-muted-foreground">
                                  Paid ₹{split.paidAmount || 0} • Share ₹{split.amount}
                               </span>
                            </div>
                         </div>
                         <span className={`text-sm font-bold ${statusColor}`}>{statusText}</span>
                      </div>
                   )
                })}
             </div>
          </Card>
        </div>
      </div>

      <CommentSection 
        entityType="expense" 
        entityId={expense.id} 
        className="border-t" 
        autoFocus={searchParams.get("action") === "chat"}
      />

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-background rounded-lg max-w-sm w-full p-6 space-y-4">
            <h2 className="text-xl font-bold">Delete Expense</h2>
            <p className="text-muted-foreground">
              Are you sure you want to delete "{expense?.description}"?
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
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
