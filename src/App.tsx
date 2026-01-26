import { Routes, Route, Navigate, useLocation } from "react-router-dom"
import { AnimatePresence } from "framer-motion"
import { MainLayout } from "./layouts/MainLayout"
import { Friends } from "./pages/Friends"
import { FriendDetail } from "./pages/FriendDetail"
import { Groups } from "./pages/Groups"
import { GroupDetail } from "./pages/GroupDetail"
import { Activity } from "./pages/Activity"
import { Settings } from "./pages/Settings"
import { GroupSettingsPage } from "./pages/GroupSettingsPage"
import { GroupSpendingBreakdown } from "./pages/GroupSpendingBreakdown"
import { AddExpense } from "./pages/AddExpense"
import { SettleUp } from "./pages/SettleUp"
import { SettleUpTotal } from "./pages/SettleUpTotal"
import { ExpenseDetail } from "./pages/ExpenseDetail"
import { CreateGroup } from "./pages/CreateGroup"
import { TransactionDetail } from "./pages/TransactionDetail"
import { Login } from "./pages/Login"
import { Signup } from "./pages/Signup"
import { InviteFriend } from "./pages/InviteFriend"
import { AcceptInvite } from "./pages/AcceptInvite"

import { ToastProvider } from "./context/ToastContext"
import { ToastContainer } from "./components/ui/Toast"
import { useAuth } from "./context/AuthContext"
import { DeepLinkProvider, useDeepLink } from "./context/DeepLinkContext"

import { Skeleton } from "./components/ui/skeleton"
import { Card } from "./components/ui/card"

// Full-page skeleton that matches the Friends page layout
const AppLoadingSkeleton = () => (
  <div className="min-h-screen bg-background">
    {/* Header skeleton */}
    <div className="flex items-center justify-between p-4 border-b">
      <Skeleton className="h-8 w-24" />
      <Skeleton className="h-9 w-28 rounded-md" />
    </div>
    
    <div className="p-4 space-y-6">
      {/* Total balance skeleton */}
      <div className="bg-primary text-primary-foreground p-6 rounded-2xl shadow-lg">
        <Skeleton className="h-4 w-32 bg-primary-foreground/20 mb-2" />
        <Skeleton className="h-10 w-48 bg-primary-foreground/20" />
      </div>

      {/* Friend cards skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-6 w-16" />
            </div>
          </Card>
        ))}
      </div>
    </div>

    {/* Bottom nav skeleton */}
    <div className="fixed bottom-0 left-0 right-0 bg-background border-t">
      <div className="flex justify-around p-4">
        <Skeleton className="h-6 w-6" />
        <Skeleton className="h-6 w-6" />
        <Skeleton className="h-6 w-6" />
        <Skeleton className="h-6 w-6" />
      </div>
    </div>
  </div>
);

/**
 * SmartHomeRedirect - Only redirects to /friends AFTER deep-link is resolved
 * This prevents the default redirect from "winning" over deep-link navigation
 */
const SmartHomeRedirect = () => {
  const { isDeepLinkResolved, isDeepLinkPending, navigatedToDeepLink } = useDeepLink();
  
  // If we already navigated to a deep link, don't redirect to /friends
  if (navigatedToDeepLink) {
    return null;
  }
  
  // If deep-link is pending or not resolved, show skeleton instead of redirecting
  if (!isDeepLinkResolved || isDeepLinkPending) {
    return <AppLoadingSkeleton />;
  }
  
  // Deep-link resolved, safe to redirect to /friends
  return <Navigate to="/friends" replace />;
};

const RequireAuth = ({ children }: { children: React.ReactElement }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <AppLoadingSkeleton />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

function AppRoutes() {
  const location = useLocation()
  const state = location.state as { backgroundLocation?: Location }
  const backgroundLocation = state?.backgroundLocation || location

  return (
    <ToastProvider>
      <Routes location={backgroundLocation}>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/invite/:code" element={<AcceptInvite />} />
        
        <Route element={<RequireAuth><MainLayout /></RequireAuth>}>
          <Route path="/invite-friend" element={<InviteFriend />} />
          <Route path="/" element={<SmartHomeRedirect />} />
          <Route path="/settle-up" element={<SettleUp />} />
          <Route path="/settle-up-total" element={<SettleUpTotal />} />
          <Route path="/create-group" element={<CreateGroup />} />
          <Route path="/add-expense" element={<AddExpense />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="/groups/:id" element={<GroupDetail />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/friends/:id" element={<FriendDetail />} />
          <Route path="/expenses/:id" element={<ExpenseDetail />} />
          <Route path="/payments/:id" element={<TransactionDetail />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/groups/:id/settings" element={<GroupSettingsPage />} />
          <Route path="/groups/:id/spending" element={<GroupSpendingBreakdown />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>

      <AnimatePresence>
        {location.pathname === "/add-expense" && state?.backgroundLocation && (
          <Routes location={location}>
            <Route path="/add-expense" element={<RequireAuth><AddExpense /></RequireAuth>} />
          </Routes>
        )}
        {location.pathname === "/create-group" && state?.backgroundLocation && (
          <Routes location={location}>
            <Route path="/create-group" element={<RequireAuth><CreateGroup /></RequireAuth>} />
          </Routes>
        )}
      </AnimatePresence>
      <ToastContainer />
    </ToastProvider>
  )
}

function App() {
  return (
    <DeepLinkProvider>
      <AppRoutes />
    </DeepLinkProvider>
  );
}

export default App
