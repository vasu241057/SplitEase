import React from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import App from "./App"
import { ThemeProvider } from "./context/ThemeContext"
import { DataProvider } from "./context/DataContext"
import { AuthProvider } from "./context/AuthContext"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import "./index.css"

// ============================================
// COLD START DEEP-LINK CAPTURE
// ============================================
// This runs BEFORE React renders - critical for preserving notification deep-links
// that would otherwise be lost during auth loading redirects.
const PENDING_DEEPLINK_KEY = 'splitease_pending_deeplink';
const rootPaths = ['/', '/friends', '/groups', '/activity', '/settings', '/login', '/signup'];
const initialPath = window.location.pathname;

// If this is a deep-link path (not a root navigation tab), preserve it
if (!rootPaths.includes(initialPath) && initialPath.length > 1) {
  // Only set if not already set (avoid overwriting during SPA navigation)
  if (!sessionStorage.getItem(PENDING_DEEPLINK_KEY)) {
    console.log('[main.tsx] Capturing cold-start deep-link:', initialPath);
    sessionStorage.setItem(PENDING_DEEPLINK_KEY, initialPath);
  }
}
// ============================================

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <DataProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </DataProvider>
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('SW registered: ', registration);
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });


  });
}
