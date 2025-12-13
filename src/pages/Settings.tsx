import { useState } from "react"
import { Moon, Sun, Globe, Info, Pencil, Check, X, Bell, Loader2, QrCode } from "lucide-react"
import { useTheme } from "../context/ThemeContext"
import { useAuth } from "../context/AuthContext"
import { Button } from "../components/ui/button"
import { Card } from "../components/ui/card"
import { Avatar, AvatarFallback } from "../components/ui/avatar"
import { Input } from "../components/ui/input"
import { api } from "../utils/api"
import { QRScanner } from "../components/QRScanner"

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
  const [showScanner, setShowScanner] = useState(false)

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
            const registration = await navigator.serviceWorker.ready;

            if (!registration.pushManager) {
                throw new Error("Push Manager not available in this browser/context");
            }

            const convertedKey = urlBase64ToUint8Array(PUBLIC_VAPID_KEY);
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: convertedKey
            });

            await api.post('/api/notifications/subscribe', { subscription });
            
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

  const [scanStatus, setScanStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
  const [scanMessage, setScanMessage] = useState("");

  const handleScanSuccess = async (decodedText: string) => {
      setShowScanner(false);
      setScanStatus("processing");
      
      try {
          // Extract Invite Code from URL or Raw Text
          let inviteCode = decodedText;
          if (decodedText.includes('/invite/')) {
              const parts = decodedText.split('/invite/');
              if (parts.length > 1) inviteCode = parts[1];
          }
          
          const res = await api.post('/api/friends/accept-invite', { inviteCode });
          if (res) {
              setScanStatus("success");
              setScanMessage(`Successfully added friend: ${res.friend.name || 'Unknown'}`);
          }
      } catch (error: any) {
          console.error("Failed to accept invite", error);
          setScanStatus("error");
          setScanMessage("Failed to accept invite: " + (error.response?.data?.error || error.message));
      }
  }

  const closeScanResult = () => {
    setScanStatus("idle");
    setScanMessage("");
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
           <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setShowScanner(true)}>
             <div className="flex items-center gap-3">
               <QrCode className="h-5 w-5 text-muted-foreground" />
               <span className="font-medium">Scan Invite Code</span>
             </div>
             <Button variant="ghost" size="sm">Scan</Button>
           </div>

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

      {showScanner && (
        <QRScanner 
           onScanSuccess={handleScanSuccess} 
           onClose={() => setShowScanner(false)} 
        />
      )}

      {/* Result Modal */}
      {scanStatus !== 'idle' && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
            <Card className="max-w-xs w-full p-6 flex flex-col items-center gap-4 text-center animate-in fade-in zoom-in-95 duration-200">
                {scanStatus === 'processing' && (
                    <>
                        <Loader2 className="h-10 w-10 animate-spin text-primary" />
                        <p className="font-medium">Processing Invite...</p>
                    </>
                )}
                {scanStatus === 'success' && (
                    <>
                        <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                            <Check className="h-6 w-6 text-green-600" />
                        </div>
                        <div className="space-y-1">
                            <h3 className="font-bold text-lg">Success!</h3>
                            <p className="text-sm text-muted-foreground">{scanMessage}</p>
                        </div>
                        <Button className="w-full" onClick={closeScanResult}>Done</Button>
                    </>
                )}
                {scanStatus === 'error' && (
                    <>
                         <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                            <X className="h-6 w-6 text-red-600" />
                        </div>
                        <div className="space-y-1">
                            <h3 className="font-bold text-lg">Error</h3>
                            <p className="text-sm text-muted-foreground">{scanMessage}</p>
                        </div>
                        <Button variant="outline" className="w-full" onClick={closeScanResult}>Close</Button>
                    </>
                )}
            </Card>
        </div>
      )}
    </div>
  )
}
