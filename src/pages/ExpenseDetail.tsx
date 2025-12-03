import { useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { ArrowLeft, Pencil, Trash2, Calendar, Receipt } from "lucide-react"
import { useData } from "../context/DataContext"
import { Button } from "../components/ui/button"
import { Card } from "../components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar"

import { useToast } from "../context/ToastContext"

export function ExpenseDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { allExpenses, friends, deleteExpense, restoreExpense, currentUser, loading } = useData()
  
  const expense = allExpenses.find(e => e.id === id)

  if (loading) {
     return (
        <div className="flex items-center justify-center min-h-[50vh]">
           <p className="text-muted-foreground">Loading expense details...</p>
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

  const { showToast } = useToast()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleDelete = async () => {
    await deleteExpense(expense.id)
    showToast("Expense deleted", "info", {
      label: "Undo",
      onClick: async () => {
        await restoreExpense(expense.id)
        showToast("Expense restored", "success")
      }
    })
    navigate(-1)
  }

  const handleRestore = async () => {
    await restoreExpense(expense.id)
    showToast("Expense restored", "success")
    navigate(-1) // Or stay on page? Navigate back seems safer as it might disappear from some lists
  }

  const handleEdit = () => {
    navigate("/add-expense", { state: { editExpense: expense } })
  }

  const getMemberName = (id: string) => {
    if (id === "currentUser" || id === currentUser.id) return "You"
    if (!friends) return "Unknown"
    const friend = friends.find(f => f.id === id || f.linked_user_id === id)
    return friend ? friend.name : "Unknown"
  }
  
  const getMemberAvatar = (id: string) => {
     if (id === "currentUser" || id === currentUser.id) return currentUser.avatar
     if (!friends) return undefined
     const friend = friends.find(f => f.id === id || f.linked_user_id === id)
     return friend?.avatar
  }

  // Determine who paid
  // Note: split.paidAmount might be undefined if not set, default to 0
  const splits = (expense.splits || []).filter(s => s && s.userId)
  console.log('ExpenseDetail render:', { expense, splits, friends })
  
  const payers = splits.filter(s => (s.paidAmount || 0) > 0)
  const paidText = payers.length === 1 && payers[0]
    ? `${getMemberName(payers[0].userId)} paid ₹${expense.amount}`
    : `${payers.length} people paid ₹${expense.amount}`

  return (
    <div className="space-y-6 container mx-auto px-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-6 w-6" />
        </Button>
        {expense.deleted ? (
           <div className="flex items-center gap-2">
             <span className="bg-red-100 text-red-600 px-3 py-1 rounded-full text-sm font-bold">Deleted</span>
             <Button size="sm" variant="outline" onClick={handleRestore}>Restore</Button>
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

      {/* Main Content */}
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
           
           <div className="space-y-4">
              {splits.map(split => {
                 const name = getMemberName(split.userId)
                 const avatar = getMemberAvatar(split.userId)
                 
                 // Logic to show "owed" or "lent"
                 // If paidAmount > amount (share), they lent (are owed)
                 // If paidAmount < amount, they owe
                 
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
                    <div key={split.userId} className="flex items-center justify-between">
                       <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                             <AvatarImage src={avatar} />
                             <AvatarFallback>{name[0]}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{name}</span>
                       </div>
                       <span className={`text-sm font-bold ${statusColor}`}>{statusText}</span>
                    </div>
                 )
              })}
           </div>
        </Card>
      </div>
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
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
