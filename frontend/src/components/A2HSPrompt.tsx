import { useState, useMemo } from 'react'
import { X, Share, Plus } from 'lucide-react'
import { Button } from './ui/button'

const A2HS_DISMISSED_KEY = 'splitease_a2hs_dismissed'

// Platform detection
const getA2HSStatus = () => {
  if (typeof window === 'undefined') return { canShow: false, isIOS: false, isAndroid: false }
  
  const ua = navigator.userAgent
  const isIOS = /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua)
  const isAndroid = /Android/.test(ua) && /Chrome/.test(ua)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
  // Use localStorage - cleared on logout (see AuthContext.tsx signOut)
  const isDismissed = localStorage.getItem(A2HS_DISMISSED_KEY) === 'true'
  
  return {
    canShow: (isIOS || isAndroid) && !isStandalone && !isDismissed,
    isIOS,
    isAndroid,
    isStandalone
  }
}

interface A2HSPromptProps {
  isLoggedIn: boolean
  hasCreatedNewExpense: boolean // Computed by parent component
}

export function A2HSPrompt({ isLoggedIn, hasCreatedNewExpense }: A2HSPromptProps) {
  // Use useMemo to compute platform info once (avoids setState in useEffect)
  const { canShow, isIOS, isAndroid } = useMemo(() => getA2HSStatus(), [])
  
  // Track dismissal state separately
  const [isDismissed, setIsDismissed] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  
  // Only show after user creates NEW expense in THIS session
  const showPrompt = isLoggedIn && hasCreatedNewExpense && canShow && !isDismissed
  const platform = { isIOS, isAndroid }

  const handleDismiss = () => {
    localStorage.setItem(A2HS_DISMISSED_KEY, 'true')
    setIsDismissed(true)
  }

  const handleAddClick = () => {
    setShowInstructions(true)
  }

  const handleInstructionsClose = () => {
    setShowInstructions(false)
    handleDismiss() // Dismiss prompt after viewing instructions
  }

  if (!showPrompt && !showInstructions) return null

  return (
    <>
      {/* Inline Nudge Banner - styled like notification banner */}
      {showPrompt && !showInstructions && (
        <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 rounded-xl p-4 relative">
          <button 
            onClick={handleDismiss}
            className="absolute top-2 right-2 text-indigo-400 hover:text-indigo-600"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-start gap-3 pr-6">
            <Plus className="h-5 w-5 text-indigo-500 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-indigo-900 dark:text-indigo-100">
                Add to Home Screen
              </p>
              <p className="text-xs text-indigo-700 dark:text-indigo-300">
                Quick access and better notifications.{" "}
                <button onClick={handleAddClick} className="underline font-medium">
                  See how
                </button>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Instruction Overlay */}
      {showInstructions && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-background rounded-xl max-w-sm w-full p-6 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="text-center">
              <h2 className="text-xl font-bold">Add to Home Screen</h2>
              <p className="text-sm text-muted-foreground mt-1">Follow these steps</p>
            </div>

            {platform.isIOS ? (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <span className="font-bold text-blue-600">1</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Tap the Share button</p>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
                      <span>Look for</span>
                      <Share className="h-4 w-4" />
                      <span>at the bottom</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <span className="font-bold text-blue-600">2</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Tap "Add to Home Screen"</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Scroll down if you don't see it
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <span className="font-bold text-green-600">3</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Tap "Add"</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      SplitEase will appear on your home screen
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <span className="font-bold text-blue-600">1</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Tap the menu (⋮)</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      At the top right of Chrome
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <span className="font-bold text-blue-600">2</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Tap "Add to Home screen"</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Or "Install app" if available
                    </p>
                  </div>
                </div>
              </div>
            )}

            <Button className="w-full" onClick={handleInstructionsClose}>
              Got it
            </Button>
          </div>
        </div>
      )}
    </>
  )
}

// Standalone Instructions component for Settings page
interface A2HSInstructionsProps {
  isOpen: boolean
  onClose: () => void
}

export function A2HSInstructions({ isOpen, onClose }: A2HSInstructionsProps) {
  // Use useMemo to compute platform info once (avoids setState in useEffect)
  const platform = useMemo(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    const isIOS = /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua)
    const isAndroid = /Android/.test(ua) && /Chrome/.test(ua)
    return { isIOS, isAndroid }
  }, [])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-background rounded-xl max-w-sm w-full p-6 space-y-5 animate-in zoom-in-95 duration-200">
        <div className="text-center">
          <h2 className="text-xl font-bold">Add to Home Screen</h2>
          <p className="text-sm text-muted-foreground mt-1">Follow these steps</p>
        </div>

        {platform.isIOS ? (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <span className="font-bold text-blue-600">1</span>
              </div>
              <div className="flex-1">
                <p className="font-medium">Tap the Share button</p>
                <div className="flex items-center gap-1 text-sm text-muted-foreground mt-0.5">
                  <span>Look for</span>
                  <Share className="h-4 w-4" />
                  <span>at the bottom</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <span className="font-bold text-blue-600">2</span>
              </div>
              <div className="flex-1">
                <p className="font-medium">Tap "Add to Home Screen"</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Scroll down if you don't see it
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <span className="font-bold text-green-600">3</span>
              </div>
              <div className="flex-1">
                <p className="font-medium">Tap "Add"</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  SplitEase will appear on your home screen
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <span className="font-bold text-blue-600">1</span>
              </div>
              <div className="flex-1">
                <p className="font-medium">Tap the menu (⋮)</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  At the top right of Chrome
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <span className="font-bold text-blue-600">2</span>
              </div>
              <div className="flex-1">
                <p className="font-medium">Tap "Add to Home screen"</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Or "Install app" if available
                </p>
              </div>
            </div>
          </div>
        )}

        <Button className="w-full" onClick={onClose}>
          Got it
        </Button>
      </div>
    </div>
  )
}

// Export for Settings page
export { A2HS_DISMISSED_KEY }
