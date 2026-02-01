import { Users, User, Activity, Settings } from "lucide-react"
import { NavLink } from "react-router-dom"
import { cn } from "../utils/cn"

const navItems = [
  { icon: User, label: "Friends", path: "/friends" },
  { icon: Users, label: "Groups", path: "/groups" },
  { icon: Activity, label: "Activity", path: "/activity" },
  { icon: Settings, label: "Settings", path: "/settings" },
]

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t bg-background pb-safe z-50 md:hidden">
      <div className="flex justify-around items-center h-16">
        {navItems.map(({ icon: Icon, label, path }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center w-full h-full gap-1 text-xs font-medium transition-colors hover:text-primary",
                isActive ? "text-primary" : "text-muted-foreground"
              )
            }
          >
            <Icon className="h-5 w-5" />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
