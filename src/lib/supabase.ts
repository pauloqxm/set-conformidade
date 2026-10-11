import { createClient } from '@supabase/supabase-js'

const url = 'https://izbhilmzevbsglixbnbe.supabase.co'
const publishableKey = 'sb_publishable_TFLaL0Fe4Vnl5SqP2b-SxA_gWLxltP9'

export const supabase = createClient(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})
