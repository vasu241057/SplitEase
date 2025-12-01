import { Moon, Sun, Globe, Info } from "lucide-react"
import { useTheme } from "../context/ThemeContext"
import { useAuth } from "../context/AuthContext"
import { Button } from "../components/ui/button"
import { Card } from "../components/ui/card"
import { Avatar, AvatarFallback } from "../components/ui/avatar"

export function Settings() {
  const { theme, setTheme } = useTheme()
  const { signOut, user } = useAuth()

  const handleLogout = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error("Failed to log out", error)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <div className="flex items-center gap-4 py-4">
        <Avatar className="h-16 w-16">
          <AvatarFallback className="text-xl">
            {user?.email ? user.email[0].toUpperCase() : "U"}
          </AvatarFallback>
        </Avatar>
        <div>
          <h2 className="text-xl font-bold">You</h2>
          <p className="text-muted-foreground">{user?.email || "user@example.com"}</p>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Preferences
        </h3>
        <Card className="divide-y">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              {theme === "dark" ? (
                <Moon className="h-5 w-5 text-muted-foreground" />
              ) : (
                <Sun className="h-5 w-5 text-muted-foreground" />
              )}
              <span className="font-medium">Theme</span>
            </div>
            <div className="flex items-center bg-secondary rounded-full p-1">
              <Button
                variant={theme === "light" ? "default" : "ghost"}
                size="sm"
                className="h-7 rounded-full px-3"
                onClick={() => setTheme("light")}
              >
                Light
              </Button>
              <Button
                variant={theme === "dark" ? "default" : "ghost"}
                size="sm"
                className="h-7 rounded-full px-3"
                onClick={() => setTheme("dark")}
              >
                Dark
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Globe className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">Language</span>
            </div>
            <span className="text-sm text-muted-foreground">English</span>
          </div>
        </Card>

        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          About
        </h3>
        <Card className="divide-y">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Info className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">Version</span>
            </div>
            <span className="text-sm text-muted-foreground">1.0.0</span>
          </div>
        </Card>

        <div className="pt-4">
          <Button variant="destructive" className="w-full" onClick={handleLogout}>
            Log Out
          </Button>
        </div>
      </div>
    </div>
  )
}
