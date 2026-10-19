# Replica Dashboards

Código do projeto **Teste _ Replica dashboards** (Claude), conectado ao projeto
**jota-insights** no Supabase (`yybtmctpaqfkthuhqplj`).

## Relatório financeiro unificado

Um único relatório, em 5 capítulos, substitui as páginas soltas de relatório:

| # | Capítulo | Conteúdo |
|---|---|---|
| 1 | Resumo | 4 números do mês e decisões com impacto em R$ |
| 2 | Resultado | "Cada R$ 100", destino do lucro, ponto de equilíbrio e mês a mês |
| 3 | Operação | Indicadores do setor (em salões: profissionais, mix, dias da semana, pagamentos) |
| 4 | Caixa | Fôlego, saldo projetado em 90 dias, contas em aberto e vencidos |
| 5 | Dados | O que corrigir no Conta Azul |

### Arquivos

```
supabase/migrations/0006_relatorio_financeiro.sql   função relatorio_financeiro() — todo o cálculo pesado no banco
relatorio/relatorio.js    montarRelatorio() e renderRelatorio(): monta os 5 capítulos
relatorio/modelo.js       transforma o retorno da função nos números do relatório
relatorio/regras.js       decisões do mês e checagens de dados (limites em LIMITES)
relatorio/setores.js      capítulo 3 por setor (beleza + padrão); registre novos setores aqui
relatorio/formato.js      formatação pt-BR (valores em centavos)
relatorio/relatorio.css   estilo, escopado em .jr; inclui regras de impressão (PDF)
```

### Como instalar no projeto

1. **Banco:** rode `supabase/migrations/0006_relatorio_financeiro.sql` no SQL Editor do Supabase
   (ou `supabase db push`). Cria `normaliza_categoria()` e `relatorio_financeiro()`; não altera tabelas.
2. **Arquivos:** copie a pasta `relatorio/` para o projeto.
3. **Página do relatório:**

   ```html
   <link rel="stylesheet" href="relatorio/relatorio.css">
   <div id="relatorio"></div>
   <script type="module">
     import { montarRelatorio } from './relatorio/relatorio.js';
     import { supabase } from './src/supabaseClient.js'; // o cliente que o app já usa

     montarRelatorio(document.getElementById('relatorio'), {
       supabase,
       projetoId: 'uuid-do-projeto',
       de: '2026-08-01',
       ate: '2026-09-30',
       profissionais: [], // opcional: quem atende e não recebe repasse (ex.: sócia)
     });
   </script>
   ```

4. **Remova as páginas antigas** de relatório e a página de lançamentos do menu. O menu fica com um item: "Relatório".

O navegador recebe só os totais calculados no banco (algumas dezenas de KB), nunca a lista de lançamentos.
As políticas de RLS continuam valendo: cada usuário só vê os projetos a que tem acesso.

### PDF e link compartilhado

O mesmo relatório serve para os três usos. Para PDF, imprima a página: cada capítulo vai para
uma página e a navegação some. Para o link com PIN, chame `renderRelatorio(el, projeto, dados)`
com o retorno de `relatorio_financeiro()` obtido pelo servidor.

### Ajustes

- **Limites das decisões** (ex.: repasse acima de 45% da receita): `LIMITES` em `relatorio/regras.js`.
- **Grupos da DRE:** vêm de `plano_contas.grupo` (rec, ded, cvar, cfix, dop, rfin, rnop, dnop).
  Categoria sem grupo aparece no capítulo 5 e fica fora do resultado.
- **Setor novo:** crie um módulo em `relatorio/setores.js` com `mix()` e `profissionais()` e registre em `SETORES`.
- **Tema escuro:** ativa quando um elemento acima do relatório tem `data-theme="dark"` ou a classe `dark`.
- **Fontes:** usa `--font-display` e `--font-body` do app, se existirem.

## Conexão com o Supabase

1. `npm install`
2. Copie `.env.example` para `.env` e preencha `SUPABASE_PUBLISHABLE_KEY`
   (Supabase > Project Settings > API > chave `sb_publishable_...`).
3. `npm run test:conexao`

## Segurança

- O `.env` não vai para o Git (está no `.gitignore`).
- A chave publishable pode ir para o frontend; a chave secret/service_role, nunca.
- Ative RLS (Row Level Security) em toda tabela criada no schema `public`.
