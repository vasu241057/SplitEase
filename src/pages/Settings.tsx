import { useState } from "react"
import { Moon, Sun, Globe, Info, Pencil, Check, X, Bell, Loader2 } from "lucide-react"
import { useTheme } from "../context/ThemeContext"
import { useAuth } from "../context/AuthContext"
import { Button } from "../components/ui/button"
import { Card } from "../components/ui/card"
import { Avatar, AvatarFallback } from "../components/ui/avatar"
import { Input } from "../components/ui/input"
import { api } from "../utils/api"

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const PUBLIC_VAPID_KEY = "BOgFWXxAEi9KkhmM7hbNqUByhTZ9vKtXoIxjtsk9q73rg5rnYKpsQLP-ULNhWos7gCAgGue76roRD6khIkMzY1g";

export function Settings() {
  const { theme, setTheme } = useTheme()
  const { signOut, user } = useAuth()
  const [isEditing, setIsEditing] = useState(false)
  const [newName, setNewName] = useState(user?.user_metadata?.full_name || "")
  const [loading, setLoading] = useState(false)
  const [notifLoading, setNotifLoading] = useState(false)

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

  const handleEnableNotifications = async () => {
    if (!('serviceWorker' in navigator)) {
        console.error("Service Worker not supported");
        alert("Service Worker not supported in this browser");
        return;
    }
    setNotifLoading(true);
    try {
        console.log("Requesting notification permission...");
        const permission = await Notification.requestPermission();
        console.log("Permission status:", permission);

        if (permission === 'granted') {
            console.log("Waiting for Service Worker ready...");
            const registration = await navigator.serviceWorker.ready;
            console.log("Service Worker registration:", registration);

            // Check if pushManager exists
            if (!registration.pushManager) {
                throw new Error("Push Manager not available in this browser/context");
            }

            console.log("Subscribing to Push Manager with key:", PUBLIC_VAPID_KEY);
            const convertedKey = urlBase64ToUint8Array(PUBLIC_VAPID_KEY);
            console.log("Converted Key length:", convertedKey.length);

            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: convertedKey
            });
            console.log("Subscription successful:", subscription);

            console.log("Sending subscription to backend...");
            await api.post('/api/notifications/subscribe', { subscription });
            console.log("Backend registration successful");
            
            alert("Notifications enabled successfully!");
        } else {
            console.warn("Permission denied by user");
            alert("Permission denied. Please enable notifications in your browser settings.");
        }
    } catch (error: any) {
        console.error("Failed to enable notifications full error:", error);
        alert(`Failed to enable notifications: ${error.name} - ${error.message}`);
    } finally {
        setNotifLoading(false);
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
               <Bell className="h-5 w-5 text-muted-foreground" />
               <span className="font-medium">Notifications</span>
             </div>
             <Button variant="outline" size="sm" onClick={handleEnableNotifications} disabled={notifLoading}>
                {notifLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enable"}
             </Button>
          </div>
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
