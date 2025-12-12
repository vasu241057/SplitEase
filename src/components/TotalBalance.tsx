import { Card, CardContent } from "./ui/card"
import { cn } from "../utils/cn"

interface TotalBalanceProps {
  amount: number
}

export function TotalBalance({ amount }: TotalBalanceProps) {
  const isPositive = amount > 0
  const isNegative = amount < 0

  return (
    <Card className={cn(
      "border-none shadow-sm",
      isPositive ? "bg-green-100 dark:bg-green-950/40" : 
      isNegative ? "bg-red-100 dark:bg-red-950/40" : 
      "bg-secondary"
    )}>
      <CardContent className="p-6 text-center">
        <p className={cn(
          "text-sm font-medium mb-1",
          isPositive ? "text-green-600 dark:text-green-400" :
          isNegative ? "text-red-600 dark:text-red-400" :
          "text-muted-foreground"
        )}>
          {isPositive ? "Overall, you are owed" :
           isNegative ? "Overall, you owe" :
           "All settled up"}
        </p>
        <div className={cn(
          "text-3xl font-bold",
          isPositive ? "text-green-700 dark:text-green-300" :
          isNegative ? "text-red-700 dark:text-red-300" :
          "text-foreground"
        )}>
          {amount !== 0 && `₹${Math.abs(amount).toFixed(2)}`}
          {amount === 0 && "₹0"}
        </div>
      </CardContent>
    </Card>
  )
}
