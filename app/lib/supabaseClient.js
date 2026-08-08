import { createClient } from '@supabase/supabase-js';

let client;

export function getSupabaseBrowserClient() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Supabase Browser-Konfiguration fehlt.');
  }

  client = createClient(url, anonKey);
  return client;
}
