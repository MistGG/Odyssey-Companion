/** Supabase for meter parse upload — set at build time via Vite env (not user settings). */
export function getMeterSupabaseCredentials(): { url: string; anonKey: string } {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? ''
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? ''
  return { url, anonKey }
}
