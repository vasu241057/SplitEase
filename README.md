# SplitEase

SplitEase is a modern expense splitting application designed to make sharing costs with friends and groups easy and transparent. It features a premium UI, real-time data synchronization, and a robust backend.

## 🚀 Tech Stack

**Frontend:**
*   **React** (Vite)
*   **Tailwind CSS** (Styling)
*   **Framer Motion** (Animations)
*   **Supabase Auth** (Authentication)
*   **Lucide React** (Icons)

**Backend:**
*   **Cloudflare Workers** (Serverless Compute)
*   **Express.js** (API Framework via `cloudflare:node`)
*   **Supabase** (PostgreSQL Database & Auth)

## 📂 Project Structure

This project is a **Monorepo** managed via npm workspaces:

*   `src/`: Frontend React application.
*   `express-SplitEase-app/`: Backend Cloudflare Worker application.

## 🛠️ Prerequisites

*   Node.js (v18+)
*   npm
*   Wrangler CLI (`npm install -g wrangler`)
*   A Supabase project

## ⚙️ Setup

### 1. Clone the repository
```bash
git clone <repository-url>
cd SplitEase
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables

**Frontend (`.env`):**
Create a `.env` file in the root directory:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

**Backend (`express-SplitEase-app/.dev.vars`):**
Create a `.dev.vars` file in the `express-SplitEase-app` directory for local development:
```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

> **Note:** For production deployment, use `wrangler secret put` to set these variables.

## 🏃‍♂️ Running the App

Start both the frontend and backend with a single command:

```bash
npm run go
```

*   **Frontend:** http://localhost:5173
*   **Backend:** http://localhost:8787

## 📜 API Endpoints

The backend exposes the following API endpoints (protected by Supabase Auth):

*   `GET /api/friends` - List all friends
*   `POST /api/friends` - Add a new friend
*   `GET /api/groups` - List all groups
*   `POST /api/groups` - Create a new group
*   `GET /api/expenses` - List all expenses
*   `POST /api/expenses` - Add a new expense
*   `POST /api/transactions/settle-up` - Settle debts

## 📄 License

MIT
