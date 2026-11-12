// Where the app's accounts and data live (Supabase).
// The publishable key is meant to be public: it only reaches what the
// database's row-level security rules allow. Never put a secret key here.

export const SUPABASE_URL = 'https://tylodszndhehbiedlqjp.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable__Ekahk-Fi8yx2wZ7rcUrTQ_fXtCgqxs';

// Public half of the phone-notification key pair. Meant to be public.
// The private half lives only in Supabase (Edge Functions, Secrets).
// Make the pair with tools/notification-keys.html. Empty until that is done:
// the app then says phone notifications are not available yet.
export const VAPID_PUBLIC_KEY = '';
