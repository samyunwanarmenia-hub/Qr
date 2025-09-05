import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; // Or SUPABASE_SERVICE_ROLE_KEY for server-side

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase URL or Anon Key is not set in environment variables.');
  // In a real application, you might throw an error or handle this more gracefully.
  // For this context, we'll proceed with a potentially uninitialized client,
  // and rely on error handling in the API route.
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');