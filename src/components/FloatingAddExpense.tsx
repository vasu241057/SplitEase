import { useState, useEffect } from "react"
import { Link, useLocation } from "react-router-dom"
import { Plus, Receipt } from "lucide-react"
import { Button } from "./ui/button"
import { cn } from "../utils/cn"

export function FloatingAddExpense() {
  const [isExpanded, setIsExpanded] = useState(true)
  const [lastScrollY, setLastScrollY] = useState(0)
  const location = useLocation()

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY
      
      // Collapse if scrolled down more than 50px
      if (currentScrollY > 50 && currentScrollY > lastScrollY) {
        setIsExpanded(false)
      } else if (currentScrollY < lastScrollY || currentScrollY < 50) {
        setIsExpanded(true)
      }
      
      setLastScrollY(currentScrollY)
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [lastScrollY])

  return (
    <div className="fixed bottom-20 right-4 z-40 md:bottom-8 md:right-8">
      <Button
        asChild
        size="lg"
        className={cn(
          "rounded-full shadow-lg transition-all duration-300 ease-in-out active:scale-95",
          isExpanded ? "px-6" : "w-14 h-14 px-0"
        )}
      >
        <Link 
          to="/add-expense" 
          state={{ backgroundLocation: location }}
          className="flex items-center gap-2"
        >
          {isExpanded ? (
            <>
              <Receipt className="h-5 w-5" />
              <span className="font-semibold">Add Expense</span>
            </>
          ) : (
            <Plus className="h-6 w-6" />
          )}
        </Link>
      </Button>
    </div>
  )
}
