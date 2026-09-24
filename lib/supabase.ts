import { createClient } from '@supabase/supabase-js';

// One client for the whole app, reused everywhere rather than reconnecting per
// call. It talks to the repair module's Supabase project ONLY — the sales
// dashboard (lib/salesData.ts, lib/csvStore.ts, app/dashboard/data-context.tsx)
// must never import this file. That boundary is the whole reason the Director's
// sales data can be promised to never leave his machine: see
// docs/REPAIR_MODULE_SPEC.md §3.3.
//
// The key here is the PUBLISHABLE key, safe to ship in the browser bundle.
// Every access decision it can make is enforced by Postgres Row Level Security
// on the other end, not by anything on this side — this client asserts an
// identity (once signed in), it does not grant one.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. ' +
    'See .env.example — both are safe to commit to a local .env.local, they are public by design.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // Keep the session in the browser and refresh it automatically, so a
    // signed-in counter tablet stays signed in across reloads without staff
    // re-entering a password every time the page refreshes.
    persistSession: true,
    autoRefreshToken: true,
  },
});
