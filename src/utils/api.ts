import { supabase } from '../supabase';

const getAuthHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  return headers;
};

export const api = {
  get: async (url: string) => {
    const headers = await getAuthHeaders();
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `Request failed with status ${res.status}`);
    }
    return res.json();
  },

  post: async (url: string, body: any) => {
    const headers = await getAuthHeaders();
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `Request failed with status ${res.status}`);
    }
    return res.json();
  },

  put: async (url: string, body: any) => {
    const headers = await getAuthHeaders();
    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `Request failed with status ${res.status}`);
    }
    return res.json();
  },

  delete: async (url: string) => {
    const headers = await getAuthHeaders();
    const res = await fetch(url, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `Request failed with status ${res.status}`);
    }
    // DELETE might return 204 No Content
    if (res.status === 204) return;
    return res.json();
  },
};
