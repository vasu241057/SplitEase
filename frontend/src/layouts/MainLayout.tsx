import { Outlet } from "react-router-dom"
import { BottomNav } from "../components/BottomNav"

export function MainLayout() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 container mx-auto px-4 py-6 pb-24 md:pb-6">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
