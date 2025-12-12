import { useParams, Link, useNavigate } from "react-router-dom"
import { ArrowLeft, Banknote } from "lucide-react"
import { useData } from "../context/DataContext"
import { Button } from "../components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar"
import { Card } from "../components/ui/card"
import { cn } from "../utils/cn"

export function FriendDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { friends, expenses, currentUser, groups, transactions } = useData()
  const friend = friends.find((f) => f.id === id)

  if (!friend) {
    return <div>Friend not found</div>
  }

  const sharedExpenses = expenses.filter((e) =>
    e.splits.some((s) => s.userId === friend.id || (friend.linked_user_id && s.userId === friend.linked_user_id))
  )

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
                ? "Settled"
                : friend.balance > 0
                ? `Owes you ₹${friend.balance}`
                : `You owe ₹${Math.abs(friend.balance)}`}
            </div>
        </div>

        {/* Breakdown */}
        <div className="text-left space-y-2 border-t pt-4">
            {(() => {
                const breakdown = [];
                
                // 1. Mutual Groups
                const mutualGroups = groups.filter(g => g.members.includes(currentUser.id) && g.members.includes(friend.id));
                
                mutualGroups.forEach(group => {
                    // Filter Expenses
                    const gExpenses = expenses.filter(e => e.groupId === group.id);
                    // Filter Transactions
                    const gTrans = transactions.filter((t: any) => t.groupId === group.id && !t.deleted);
                    
                    let bal = 0;
                    // Expense Logic
                    gExpenses.forEach(e => {
                         if (e.payerId === currentUser.id) {
                             const s = e.splits.find(s => s.userId === friend.id);
                             if (s) bal += (s.amount || 0);
                         } else if (e.payerId === friend.id || (friend.linked_user_id && e.payerId === friend.linked_user_id)) {
                             const s = e.splits.find(s => s.userId === currentUser.id);
                             if (s) bal -= (s.amount || 0);
                         }
                    });
                    // Transaction Logic
                    gTrans.forEach((t: any) => {
                        if (t.fromId === currentUser.id && (t.toId === friend.id || (friend.linked_user_id && t.toId === friend.linked_user_id))) {
                             bal += t.amount;
                        } else if ((t.fromId === friend.id || (friend.linked_user_id && t.fromId === friend.linked_user_id)) && t.toId === currentUser.id) {
                             bal -= t.amount;
                        }
                    });

                    if (Math.abs(bal) > 0.01) {
                        breakdown.push({ name: group.name, amount: bal, isGroup: true });
                    }
                });

                // 2. Non-Group
                const ngExpenses = expenses.filter(e => !e.groupId && 
                     e.splits.some(s => s.userId === friend.id || (friend.linked_user_id && s.userId === friend.linked_user_id))
                );
                const ngTrans = transactions.filter((t: any) => !t.groupId && !t.deleted &&
                     ((t.fromId === currentUser.id && (t.toId === friend.id || t.toId === friend.linked_user_id)) ||
                      ((t.fromId === friend.id || t.fromId === friend.linked_user_id) && t.toId === currentUser.id))
                );

                let ngBal = 0;
                 ngExpenses.forEach(e => {
                         if (e.payerId === currentUser.id) {
                             const s = e.splits.find(s => s.userId === friend.id);
                             if (s) ngBal += (s.amount || 0);
                         } else if (e.payerId === friend.id || (friend.linked_user_id && e.payerId === friend.linked_user_id)) {
                             const s = e.splits.find(s => s.userId === currentUser.id);
                             if (s) ngBal -= (s.amount || 0);
                         }
                    });
                 ngTrans.forEach((t: any) => {
                        if (t.fromId === currentUser.id) {
                             ngBal += t.amount;
                        } else {
                             ngBal -= t.amount;
                        }
                    });
                
                if (Math.abs(ngBal) > 0.01) {
                    breakdown.push({ name: "Non-group expenses", amount: ngBal, isGroup: false });
                }

                return breakdown.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{item.isGroup ? `In "${item.name}"` : item.name}</span>
                        <span className={item.amount > 0 ? "text-green-600" : "text-red-600"}>
                            {item.amount > 0 ? "owes you" : "you owe"} ₹{Math.abs(item.amount).toFixed(2)}
                        </span>
                    </div>
                ));
            })()}
        </div>

        <div className="flex justify-center gap-4 pt-2">
          <Button 
            className="w-full max-w-xs"
            onClick={() => navigate("/settle-up", { 
              state: { 
                friendId: friend.id,
                defaultDirection: friend.balance > 0 ? "receiving" : "paying"
              } 
            })}
          >
            Settle Up
          </Button>
        </div>
      </Card>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Shared Expenses</h2>
        {sharedExpenses.length === 0 ? (
          <p className="text-muted-foreground text-sm">No shared expenses.</p>
        ) : (
          <div className="space-y-3">
            {sharedExpenses.map((expense) => (
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
                    <p className="font-medium truncate">{expense.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(expense.date).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">₹{expense.amount}</p>
                    <p className="text-xs text-muted-foreground">
                      {expense.payerId === currentUser.id
                        ? `You paid`
                        : expense.payerId === friend.id || (friend.linked_user_id && expense.payerId === friend.linked_user_id)
                        ? `${friend.name} paid`
                        : "Someone else paid"}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
