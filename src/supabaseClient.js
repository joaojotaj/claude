import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error('Defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY no arquivo .env')
}

export const supabase = createClient(url, key)
