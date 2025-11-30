import { createClient } from '@supabase/supabase-js';
import { env } from 'cloudflare:workers';

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export const createSupabaseClient = () => {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env as unknown as Env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};
