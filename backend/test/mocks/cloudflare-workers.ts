// Mock for cloudflare:workers used in unit tests
export const env = {
  SUPABASE_URL: 'http://mock-supabase.local',
  SUPABASE_SERVICE_ROLE_KEY: 'mock-service-key',
  VAPID_PUBLIC_KEY: 'mock-vapid-public',
  VAPID_PRIVATE_KEY: 'mock-vapid-private',
  VAPID_SUBJECT: 'mailto:test@test.com'
};
