

export function Navbar() {
  return (
    <nav className="border-b bg-background sticky top-0 z-50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-bold text-xl">
            S
          </div>
          <span className="text-xl font-bold text-primary">SplitEase</span>
        </div>
      </div>
    </nav>
  )
}
