
import { useParams, useNavigate } from "react-router-dom"
import { ArrowLeft, Trash2, RotateCcw, ArrowRightLeft, Calendar, User, Loader2 } from "lucide-react"
import { useData } from "../context/DataContext"
import { Button } from "../components/ui/button"
import { useToast } from "../context/ToastContext"
import { useState } from "react"
import { cn } from "../utils/cn"
import { Skeleton } from "../components/ui/skeleton"

export function TransactionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { transactions, currentUser, deleteTransaction, restoreTransaction, friends, loading } = useData()
  const { showToast } = useToast()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)

  const transaction = transactions.find(t => t.id === id)

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
         <div className="container mx-auto px-4 py-4 min-h-screen flex flex-col">
            <div className="flex justify-between items-center mb-8">
               <div className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <Skeleton className="h-6 w-40" />
               </div>
               <Skeleton className="h-10 w-10 rounded-full" />
            </div>
            
            <div className="space-y-8">
               <div className="flex flex-col items-center py-8 gap-4">
                  <Skeleton className="h-20 w-20 rounded-full" />
                  <Skeleton className="h-10 w-32" />
               </div>
               
               <div className="border rounded-xl p-4 space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
               </div>
            </div>
         </div>
      </div>
    )
  }

  if (!transaction) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <p className="text-muted-foreground mb-4">Transaction not found</p>
        <Button onClick={() => navigate(-1)}>Go Back</Button>
      </div>
    )
  }

  const handleDelete = async () => {
    try {
      setIsDeleting(true)
      await deleteTransaction(transaction.id)
      showToast("Payment deleted", "info")
      navigate(-1)
    } catch (error) {
      showToast("Failed to delete payment", "error")
      setIsDeleting(false)
    }
  }

  const handleRestore = async () => {
    try {
      setIsRestoring(true)
      await restoreTransaction(transaction.id)
      showToast("Payment restored", "success")
      navigate(-1)
    } catch (error) {
      showToast("Failed to restore payment", "error")
      setIsRestoring(false)
    }
  }

  // Determine Friend Name
  // If fromId is me, friend is toId. If toId is me, friend is fromId.
  const friendId = transaction.fromId === currentUser.id ? transaction.toId : transaction.fromId
  const friend = friends.find(f => f.id === friendId || f.linked_user_id === friendId)
  const friendName = friend ? friend.name : "Unknown Friend"

  const isPayerMe = transaction.fromId === currentUser.id

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      <div className="container mx-auto px-4 py-4 min-h-screen flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-6 w-6" />
            </Button>
            <h1 className="text-xl font-bold">Payment Details</h1>
          </div>
          <div className="flex gap-2">
            {transaction.deleted ? (
                <Button 
                    variant="outline" 
                    size="sm" 
                    className="text-green-600 border-green-200 hover:bg-green-50"
                    onClick={handleRestore}
                    disabled={isRestoring}
                >
                    {isRestoring ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                    Restore
                </Button>
            ) : (
                <Button variant="ghost" size="icon" onClick={() => setShowDeleteConfirm(true)} className="text-destructive">
                    <Trash2 className="h-5 w-5" />
                </Button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="space-y-8">
            {/* Amount and Icon */}
            <div className="flex flex-col items-center justify-center py-8 gap-4">
                 <div className={cn(
                    "h-20 w-20 rounded-full flex items-center justify-center",
                    transaction.deleted ? "bg-red-100 text-red-500" : "bg-primary/10 text-primary"
                  )}>
                    <ArrowRightLeft className="h-10 w-10" />
                 </div>
                 <div className="text-center">
                    <div className={cn("text-3xl font-bold", transaction.deleted && "line-through text-muted-foreground")}>
                        ₹{transaction.amount}
                    </div>
                    {transaction.deleted && <p className="text-sm text-destructive font-medium mt-1">Deleted</p>}
                 </div>
            </div>

            {/* Details Card */}
            <div className="bg-card border rounded-xl p-4 space-y-4">
                <div className="flex items-center gap-3 pb-4 border-b">
                    <User className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                        <p className="text-sm text-muted-foreground">Paid by</p>
                        <p className="font-medium">{isPayerMe ? "You" : friendName}</p>
                    </div>
                </div>
                
                 <div className="flex items-center gap-3 pb-4 border-b">
                    <User className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                        <p className="text-sm text-muted-foreground">Paid to</p>
                        <p className="font-medium">{isPayerMe ? friendName : "You"}</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-muted-foreground" />
                    <div className="flex-1">
                        <p className="text-sm text-muted-foreground">Date</p>
                        <p className="font-medium">
                            {new Date(transaction.date).toLocaleDateString()} at {new Date(transaction.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                    </div>
                </div>
            </div>
            
            {transaction.deleted && (
                <div className="bg-muted p-4 rounded-lg text-sm text-muted-foreground text-center">
                    This payment was deleted. Restore it to affect balances again.
                </div>
            )}
        </div>
      </div>

       {/* Delete Confirmation Modal */}
       {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-lg max-w-sm w-full p-6 space-y-4">
            <h2 className="text-xl font-bold">Delete Payment?</h2>
            <p className="text-muted-foreground">
              This will remove the payment record and revert the balance changes. You can restore it later.
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
