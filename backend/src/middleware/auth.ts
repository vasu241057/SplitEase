import { Request, Response, NextFunction } from 'express';
import { createSupabaseClient } from '../supabase';

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const token = authHeader.replace('Bearer ', '').trim();

  
  if (!token) {
    console.error('DEBUG: Token is empty');
    return res.status(401).json({ error: 'Token is empty' });
  }

  const supabase = createSupabaseClient();

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    console.error('Auth Error:', error);
    return res.status(401).json({ error: 'Invalid or expired token', details: error?.message });
  }

  // Attach user to request
  (req as any).user = user;

  next();
};
