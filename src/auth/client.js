// Connects to Supabase. The library is loaded the first time it is needed,
// so the welcome screen still opens quickly and the tests need no network.

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../config.js';

const LIBRARY_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

let clientPromise = null;

/** @returns {Promise<object>} the shared Supabase client */
export function getClient() {
  if (clientPromise === null) {
    clientPromise = import(LIBRARY_URL)
      .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: {
          // PKCE sends people back with "?code=..." rather than putting tokens
          // after "#", which this app uses for its own screen addresses.
          flowType: 'pkce',
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }))
      .catch((error) => {
        clientPromise = null; // let the next attempt try again
        throw error;
      });
  }
  return clientPromise;
}
