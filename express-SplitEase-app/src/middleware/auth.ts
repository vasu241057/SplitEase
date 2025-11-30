import { Request, Response, NextFunction } from 'express';
import { createSupabaseClient } from '../supabase';

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const token = authHeader.replace('Bearer ', '');
  const supabase = createSupabaseClient();

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Attach user to request
  (req as any).user = user;

  next();
};
