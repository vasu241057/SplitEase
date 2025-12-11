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
