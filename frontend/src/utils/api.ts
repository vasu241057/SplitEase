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

const BASE_URL = import.meta.env.VITE_API_URL || '';

export const api = {
  get: async (url: string) => {
    const headers = await getAuthHeaders();
    const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
    const res = await fetch(fullUrl, { headers });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `Request failed with status ${res.status}`);
    }
    return res.json();
  },

  post: async (url: string, body: any) => {
    const headers = await getAuthHeaders();
    const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
    const res = await fetch(fullUrl, {
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
    const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
    const res = await fetch(fullUrl, {
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
    const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
    const res = await fetch(fullUrl, {
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
