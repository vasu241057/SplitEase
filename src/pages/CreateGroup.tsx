import { useState } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { Plane, Home, Heart, FileText } from "lucide-react"
import { motion } from "framer-motion"
import { useData } from "../context/DataContext"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { cn } from "../utils/cn"

const groupTypes = [
  { value: "trip" as const, label: "Trip", icon: Plane },
  { value: "home" as const, label: "Home", icon: Home },
  { value: "couple" as const, label: "Couple", icon: Heart },
  { value: "other" as const, label: "Other", icon: FileText },
]

export function CreateGroup() {
  const navigate = useNavigate()
  const location = useLocation()
  const { addGroup } = useData()
  const [name, setName] = useState("")
  const [type, setType] = useState<"trip" | "home" | "couple" | "other">("trip")

  const origin = (location.state as { origin?: { x: number; y: number } })?.origin
  const clipPathOrigin = origin ? `${origin.x}px ${origin.y}px` : "90% 20%"

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    // Create group with no members initially
    await addGroup(name, type, [])
    
    // Navigate back to groups page
    navigate("/groups")
  }

  return (
    <motion.div
      initial={{ clipPath: `circle(0% at ${clipPathOrigin})` }}
      animate={{ clipPath: `circle(150% at ${clipPathOrigin})` }}
      exit={{ clipPath: `circle(0% at ${clipPathOrigin})` }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
      className="fixed inset-0 bg-background z-50 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <Button
          variant="ghost"
          onClick={() => navigate("/groups")}
        >
          Cancel
        </Button>
        <h1 className="text-lg font-semibold">Create a group</h1>
        <Button
          variant="ghost"
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="text-primary disabled:text-muted-foreground"
        >
          Done
        </Button>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-6">
        <form onSubmit={handleSubmit} className="max-w-md mx-auto space-y-8">
          <div className="space-y-2">
            <Label htmlFor="groupName" className="text-muted-foreground">
              Group name
            </Label>
            <Input
              id="groupName"
              placeholder="e.g., NYC trip"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="text-lg border-0 border-b rounded-none px-0 focus-visible:ring-0 focus-visible:border-primary"
            />
          </div>

          <div className="space-y-3">
            <Label className="text-muted-foreground">Type</Label>
            <div className="grid grid-cols-4 gap-3">
              {groupTypes.map((groupType) => {
                const Icon = groupType.icon
                return (
                  <button
                    key={groupType.value}
                    type="button"
                    onClick={() => setType(groupType.value)}
                    className={cn(
                      "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
                      type === groupType.value
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <Icon className={cn(
                      "h-6 w-6",
                      type === groupType.value ? "text-primary" : "text-muted-foreground"
                    )} />
                    <span className={cn(
                      "text-sm font-medium",
                      type === groupType.value ? "text-primary" : "text-foreground"
                    )}>
                      {groupType.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </form>
      </div>
    </motion.div>
  )
}
