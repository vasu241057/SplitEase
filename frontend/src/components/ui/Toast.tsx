import { X } from "lucide-react"
import { useToast } from "../../context/ToastContext"
import { Button } from "./button"
import { AnimatePresence, motion } from "framer-motion"

export function ToastContainer() {
  const { toasts, removeToast } = useToast()

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map(toast => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            layout
            className="pointer-events-auto bg-foreground text-background px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[300px] max-w-[400px]"
          >
            <div className="flex-1 text-sm font-medium">{toast.message}</div>
            {toast.action && (
              <Button 
                variant="secondary" 
                size="sm" 
                className="h-7 px-2 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => {
                  toast.action?.onClick()
                  removeToast(toast.id)
                }}
              >
                {toast.action.label}
              </Button>
            )}
            <button 
              onClick={() => removeToast(toast.id)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
