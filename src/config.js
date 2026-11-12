// Where the app's accounts and data live (Supabase).
// The publishable key is meant to be public: it only reaches what the
// database's row-level security rules allow. Never put a secret key here.

export const SUPABASE_URL = 'https://tylodszndhehbiedlqjp.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable__Ekahk-Fi8yx2wZ7rcUrTQ_fXtCgqxs';

// Public half of the phone-notification key pair. Meant to be public.
// The private half lives only in Supabase (Edge Functions, Secrets).
export const VAPID_PUBLIC_KEY = 'BOr_3SdDY_DlINPA5yHEZe-_FKaCXLeQ_HQIKdrwW5pla7rh806N7g3FRAe8rrgUjyn2XAzv9q4G0jJPCzNXdfI';
