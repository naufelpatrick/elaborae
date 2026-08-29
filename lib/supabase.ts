import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = "https://pfropbkmeedoogzboitg.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_6TNmhZ4sZy-NluoO5qCe3A_wjGf2adN";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || DEFAULT_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || DEFAULT_SUPABASE_PUBLISHABLE_KEY;

let browserClient: SupabaseClient | null = null;

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

export function getSupabaseBrowserClient() {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }

  if (!browserClient) {
    browserClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return browserClient;
}

export function getSupabaseServerClient(accessToken?: string) {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }

  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : undefined,
  });
}
