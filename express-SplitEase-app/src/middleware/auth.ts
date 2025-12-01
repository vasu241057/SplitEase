import { Request, Response, NextFunction } from 'express';
import { createSupabaseClient } from '../supabase';

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const token = authHeader.replace('Bearer ', '').trim();
  console.error('DEBUG: Received Token:', token.substring(0, 20) + '...');
  
  if (!token) {
    console.error('DEBUG: Token is empty');
    return res.status(401).json({ error: 'Token is empty' });
  }

  const supabase = createSupabaseClient();
  
  // DEBUG: Verify Admin Access
  const { data: adminData, error: adminError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (adminError) {
    console.error('DEBUG: Admin Access Failed! Service Role Key is likely invalid.', adminError);
  } else {
    console.error('DEBUG: Admin Access Successful. Backend is configured correctly.');
  }

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    console.error('Auth Error:', error);
    return res.status(401).json({ error: 'Invalid or expired token', details: error?.message });
  }

  // Attach user to request
  (req as any).user = user;

  next();
};
