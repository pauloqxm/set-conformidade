import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = 'https://izbhilmzevbsglixbnbe.supabase.co'
export const supabasePublishableKey = 'sb_publishable_TFLaL0Fe4Vnl5SqP2b-SxA_gWLxltP9'

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})
