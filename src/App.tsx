import { Routes, Route, Navigate, useLocation } from "react-router-dom"
import { AnimatePresence } from "framer-motion"
import { MainLayout } from "./layouts/MainLayout"
import { Friends } from "./pages/Friends"
import { FriendDetail } from "./pages/FriendDetail"
import { Groups } from "./pages/Groups"
import { GroupDetail } from "./pages/GroupDetail"
import { Activity } from "./pages/Activity"
import { Settings } from "./pages/Settings"
import { AddExpense } from "./pages/AddExpense"
import { SettleUp } from "./pages/SettleUp"
import { ExpenseDetail } from "./pages/ExpenseDetail"
import { CreateGroup } from "./pages/CreateGroup"
import { Login } from "./pages/Login"
import { Signup } from "./pages/Signup"
import { InviteFriend } from "./pages/InviteFriend"
import { AcceptInvite } from "./pages/AcceptInvite"

import { ToastProvider } from "./context/ToastContext"
import { ToastContainer } from "./components/ui/Toast"
import { AuthProvider, useAuth } from "./context/AuthContext"

const RequireAuth = ({ children }: { children: React.ReactElement }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

function App() {
  const location = useLocation()
  const state = location.state as { backgroundLocation?: Location }
  const backgroundLocation = state?.backgroundLocation || location

  return (
    <AuthProvider>
      <ToastProvider>
        <Routes location={backgroundLocation}>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/invite/:code" element={<AcceptInvite />} />
          
          <Route element={<RequireAuth><MainLayout /></RequireAuth>}>
            <Route path="/invite-friend" element={<InviteFriend />} />
            <Route path="/" element={<Navigate to="/friends" replace />} />
            <Route path="/settle-up" element={<SettleUp />} />
            <Route path="/create-group" element={<CreateGroup />} />
            <Route path="/groups" element={<Groups />} />
            <Route path="/groups/:id" element={<GroupDetail />} />
            <Route path="/friends" element={<Friends />} />
            <Route path="/friends/:id" element={<FriendDetail />} />
            <Route path="/expenses/:id" element={<ExpenseDetail />} />
            <Route path="/activity" element={<Activity />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>

        <AnimatePresence>
          {location.pathname === "/add-expense" && (
            <Routes location={location}>
              <Route path="/add-expense" element={<RequireAuth><AddExpense /></RequireAuth>} />
            </Routes>
          )}
          {location.pathname === "/create-group" && (
            <Routes location={location}>
              <Route path="/create-group" element={<RequireAuth><CreateGroup /></RequireAuth>} />
            </Routes>
          )}
        </AnimatePresence>
        <ToastContainer />
      </ToastProvider>
    </AuthProvider>
  )
}

export default App
