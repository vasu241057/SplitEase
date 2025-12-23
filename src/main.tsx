import React from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import App from "./App"
import { ThemeProvider } from "./context/ThemeContext"
import { DataProvider } from "./context/DataContext"
import { AuthProvider } from "./context/AuthContext"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import "./index.css"

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
  console.log('[MAIN SW] Starting SW registration...');
  console.log('[MAIN SW] Current controller at startup:', navigator.serviceWorker.controller);
  
  window.addEventListener('load', () => {
    console.log('[MAIN SW] Window loaded, registering SW...');
    
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('[MAIN SW] SW registered:', registration);
      console.log('[MAIN SW] Installing SW:', registration.installing);
      console.log('[MAIN SW] Waiting SW:', registration.waiting);
      console.log('[MAIN SW] Active SW:', registration.active);
      console.log('[MAIN SW] Controller after register:', navigator.serviceWorker.controller);
      
      // Track state changes
      if (registration.installing) {
        console.log('[MAIN SW] SW is installing...');
        registration.installing.addEventListener('statechange', (e) => {
          console.log('[MAIN SW] Installing SW state changed:', (e.target as ServiceWorker).state);
        });
      }
      
      if (registration.waiting) {
        console.log('[MAIN SW] SW is waiting to activate');
      }
      
      if (registration.active) {
        console.log('[MAIN SW] SW is active, state:', registration.active.state);
      }
      
    }).catch(registrationError => {
      console.log('[MAIN SW] SW registration failed:', registrationError);
    });
  });
  
  // Listen for controller change globally
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('[MAIN SW] Controller changed globally! New controller:', navigator.serviceWorker.controller);
  });
}
