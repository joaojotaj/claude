# Replica Dashboards

Código do projeto **Teste _ Replica dashboards** (Claude), conectado ao projeto
**Financeiro Brabo** no Supabase (`vqhnehzadzvpwzapojwn`).

## Configuração

1. Instale as dependências:
   ```bash
   npm install
   ```
2. Copie `.env.example` para `.env` e preencha `SUPABASE_PUBLISHABLE_KEY`
   (Supabase > Project Settings > API > chave `sb_publishable_...`).
3. Teste a conexão:
   ```bash
   npm run test:conexao
   ```

## Uso

```js
import { supabase } from './src/supabaseClient.js'

const { data, error } = await supabase.from('nome_da_tabela').select('*')
```

## Segurança

- O `.env` não vai para o Git (está no `.gitignore`).
- A chave publishable pode ir para o frontend; a chave secret/service_role, nunca.
- Ative RLS (Row Level Security) em toda tabela criada no schema `public`.
