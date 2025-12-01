import { useState } from "react"
import { Moon, Sun, Globe, Info, Pencil, Check, X } from "lucide-react"
import { useTheme } from "../context/ThemeContext"
import { useAuth } from "../context/AuthContext"
import { Button } from "../components/ui/button"
import { Card } from "../components/ui/card"
import { Avatar, AvatarFallback } from "../components/ui/avatar"
import { Input } from "../components/ui/input"
import { api } from "../utils/api"

export function Settings() {
  const { theme, setTheme } = useTheme()
  const { signOut, user } = useAuth()
  const [isEditing, setIsEditing] = useState(false)
  const [newName, setNewName] = useState(user?.user_metadata?.full_name || "")
  const [loading, setLoading] = useState(false)

  const handleLogout = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error("Failed to log out", error)
    }
  }

  const handleSaveName = async () => {
    if (!newName.trim()) return
    setLoading(true)
    try {
      await api.put('/user/profile', { full_name: newName })
      // Ideally update local user context here, but for now reload or rely on re-fetch
      setIsEditing(false)
      window.location.reload() // Simple way to refresh user data
    } catch (error) {
      console.error("Failed to update name", error)
      alert("Failed to update name")
    } finally {
      setLoading(false)
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
        <div className="flex-1">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <Input 
                value={newName} 
                onChange={(e) => setNewName(e.target.value)}
                className="max-w-[200px]"
              />
              <Button size="icon" variant="ghost" onClick={handleSaveName} disabled={loading}>
                <Check className="h-4 w-4 text-green-500" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setIsEditing(false)}>
                <X className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">
                {user?.user_metadata?.full_name || "User"}
              </h2>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => {
                setNewName(user?.user_metadata?.full_name || "")
                setIsEditing(true)
              }}>
                <Pencil className="h-3 w-3 text-muted-foreground" />
              </Button>
            </div>
          )}
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
