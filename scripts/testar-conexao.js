// Verifica se o projeto responde com as credenciais do .env.
import '../src/supabaseClient.js'

const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/health`, {
  headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY },
})

if (!res.ok) {
  console.error(`Falha na conexão: HTTP ${res.status}`)
  process.exit(1)
}

console.log('Conectado ao Supabase:', await res.json())
