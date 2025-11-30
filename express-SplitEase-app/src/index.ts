import { httpServerHandler } from 'cloudflare:node';
import express from 'express';
import cors from 'cors';
import friendsRoutes from './routes/friends';
import groupsRoutes from './routes/groups';
import expensesRoutes from './routes/expenses';
import transactionsRoutes from './routes/transactions';
import { authMiddleware } from './middleware/auth';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Auth Middleware (applied to /api routes)
app.use('/api', authMiddleware);

// Routes
app.use('/api/friends', friendsRoutes);
app.use('/api/groups', groupsRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/transactions', transactionsRoutes);

app.get('/', (req, res) => {
  res.send('SplitEase Worker API (Express) is running!');
});

app.listen(3000);
export default httpServerHandler({ port: 3000 });
