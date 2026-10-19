-- Relatório financeiro unificado: uma chamada devolve tudo o que os 5 capítulos precisam
-- (resumo, resultado, operação, caixa e dados), já agregado no banco.
-- O navegador recebe só os totais, nunca a lista de lançamentos.

-- Mesma chave usada em plano_contas.chave: minúsculas, sem acento, espaços simples.
create or replace function public.normaliza_categoria(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(trim(translate(coalesce(p, ''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')), '\s+', ' ', 'g'))
$$;

-- SECURITY INVOKER (padrão): as políticas de RLS de lancamentos, vendas e saldos continuam valendo.
create or replace function public.relatorio_financeiro(p_projeto uuid, p_de date, p_ate date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  r jsonb;
begin
  if p_de is null or p_ate is null or p_ate < p_de then
    raise exception 'Período inválido: % a %', p_de, p_ate;
  end if;

  with
  l as (
    select l.*, pc.grupo, public.normaliza_categoria(l.categoria) as chave
    from public.lancamentos l
    left join public.plano_contas pc
      on pc.projeto_id = l.projeto_id and pc.chave = public.normaliza_categoria(l.categoria)
    where l.projeto_id = p_projeto
      and l.situacao <> 'excluido'
      and not l.transferencia
      and l.data_competencia between p_de and p_ate
  ),
  dre as (
    select coalesce(grupo, 'sem_grupo') as grupo, sum(valor_centavos) as v
    from l group by 1
  ),
  dre_mes as (
    select to_char(date_trunc('month', data_competencia), 'YYYY-MM') as mes,
           coalesce(grupo, 'sem_grupo') as grupo, sum(valor_centavos) as v
    from l group by 1, 2
  ),
  cats as (
    select coalesce(grupo, 'sem_grupo') as grupo, categoria, chave, count(*) as n, sum(valor_centavos) as v
    from l group by 1, 2, 3
  ),
  pag as (
    select case
             when descricao ~* 'pix' then 'pix'
             when descricao ~* 'cr[ée]d' then 'credito'
             when descricao ~* 'd[ée]b' then 'debito'
             when descricao ~* 'dinheiro|esp[ée]cie' then 'dinheiro'
             else 'outros'
           end as forma,
           coalesce(substring(descricao from '^\d+/(\d+)\s'), '1')::int as parcelas,
           valor_centavos as v
    from l where grupo = 'rec'
  ),
  -- Profissional = contraparte ou nome tirado da descrição do PIX, sem números/CNPJ e sem
  -- "da/de/do", reduzido a dois nomes para juntar "LUCAS DA SILVA" e "30.495.021 LUCAS DA SILVA CARDOSO".
  rep as (
    select case when descricao ~* '\m(das|darf|gps|inss)\M' then null
                else upper(coalesce(nullif(trim(contraparte), ''), descricao)) end as bruto,
           (trim(coalesce(contraparte, '')) = '') as sem_contraparte,
           -valor_centavos as v
    from l where chave = 'repasse a profissionais parceiros'
  ),
  rep1 as (
    select case when bruto is null then '(impostos dos parceiros)'
                else coalesce(nullif(array_to_string((regexp_split_to_array(trim(regexp_replace(regexp_replace(regexp_replace(
                       public.normaliza_categoria(bruto),
                       '^(pix enviado|pagamento( de| a)?|ted|transferencia( enviada)?)\s*', ''),
                       '[0-9./-]+|\m(da|de|do|das|dos|e)\M', ' ', 'g'), '\s+', ' ', 'g')), ' '))[1:2], ' '), ''),
                     '(sem nome)') end as nome,
           v
    from rep
  ),
  rep2 as (
    select upper(nome) as profissional, sum(v) as v, count(*) as n
    from rep1 group by 1
  ),
  v as (
    select * from public.vendas where projeto_id = p_projeto and data between p_de and p_ate
  ),
  itens as (
    select v.id as venda_id, it->>'descricao' as d,
           coalesce((it->>'valor_total_centavos')::bigint, 0) as c
    from v, jsonb_array_elements(v.itens) it
  ),
  cli as (
    select cliente_nome, count(*) as n from v where coalesce(cliente_nome, '') <> '' group by 1
  ),
  saldos as (
    select distinct on (conta) conta, data, saldo_centavos
    from public.saldos_informados
    where projeto_id = p_projeto and data <= p_ate
    order by conta, data desc
  ),
  abertos as (
    select tipo, valor_centavos, data_vencimento
    from public.lancamentos
    where projeto_id = p_projeto and situacao = 'aberto' and not transferencia and data_vencimento is not null
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object(
      'de', p_de, 'ate', p_ate,
      'meses', (extract(year from p_ate) - extract(year from p_de)) * 12
               + extract(month from p_ate) - extract(month from p_de) + 1),
    'dre', coalesce((select jsonb_object_agg(grupo, v) from dre), '{}'::jsonb),
    'dre_mensal', coalesce((
      select jsonb_agg(jsonb_build_object('mes', mes, 'grupos', g) order by mes)
      from (select mes, jsonb_object_agg(grupo, v) as g from dre_mes group by mes) x), '[]'::jsonb),
    'categorias', coalesce((
      select jsonb_agg(jsonb_build_object('grupo', grupo, 'categoria', categoria, 'chave', chave, 'n', n, 'v', v) order by abs(v) desc)
      from cats), '[]'::jsonb),
    'lancamentos', jsonb_build_object(
      'total', (select count(*) from l),
      'sem_categoria', (select count(*) from l where coalesce(categoria, '') = ''),
      'sem_grupo', (select count(*) from l where grupo is null)),
    'pagamentos', coalesce((
      select jsonb_agg(jsonb_build_object('forma', forma, 'v', v, 'parcelas_media', pm) order by v desc)
      from (select forma, sum(v) as v,
                   round(sum(v * parcelas)::numeric / nullif(sum(v), 0), 1) as pm
            from pag group by forma) x), '[]'::jsonb),
    'repasses', coalesce((
      select jsonb_agg(jsonb_build_object('profissional', profissional, 'v', v, 'n', n) order by v desc)
      from rep2), '[]'::jsonb),
    'repasses_sem_contraparte', (select count(*) from rep where sem_contraparte),
    'vendas', jsonb_build_object(
      'qtd', (select count(*) from v),
      'total', (select coalesce(sum(valor_total_centavos), 0) from v),
      'ticket_mediano', (select percentile_cont(0.5) within group (order by valor_total_centavos) from v),
      'itens', (select count(*) from itens),
      'clientes', (select count(*) from cli),
      'clientes_recorrentes', (select count(*) from cli where n >= 2),
      'sem_detalhe', (select count(distinct venda_id) from itens where d ilike '%sem detalhe%')
                     + (select count(*) from v where jsonb_array_length(v.itens) = 0),
      'de', (select min(data) from v), 'ate', (select max(data) from v)),
    'servicos', coalesce((
      select jsonb_agg(jsonb_build_object('d', d, 'q', q, 'v', c) order by c desc)
      from (select d, count(*) as q, sum(c) as c from itens group by d order by sum(c) desc limit 400) x), '[]'::jsonb),
    'dias_semana', coalesce((
      select jsonb_agg(jsonb_build_object('dow', dow, 'qtd', q, 'v', s) order by dow)
      from (select extract(isodow from data)::int as dow, count(*) as q, sum(valor_total_centavos) as s
            from v group by 1) x), '[]'::jsonb),
    'saldos', jsonb_build_object(
      'contas', (select count(*) from saldos),
      'total', (select sum(saldo_centavos) from saldos),
      'data', (select max(data) from saldos)),
    'abertos', jsonb_build_object(
      'receber_90', (select coalesce(sum(valor_centavos), 0) from abertos
                     where tipo = 'Receita' and data_vencimento > p_ate and data_vencimento <= p_ate + 90),
      'pagar_90', (select coalesce(sum(valor_centavos), 0) from abertos
                   where tipo = 'Despesa' and data_vencimento > p_ate and data_vencimento <= p_ate + 90),
      'vencidos', coalesce((
        select jsonb_agg(jsonb_build_object('faixa', faixa, 'v', s) order by faixa)
        from (select case
                       when current_date - data_vencimento <= 30 then '1-30'
                       when current_date - data_vencimento <= 60 then '31-60'
                       when current_date - data_vencimento <= 90 then '61-90'
                       else '90+'
                     end as faixa, sum(valor_centavos) as s
              from abertos where tipo = 'Receita' and data_vencimento < current_date
              group by 1) x), '[]'::jsonb))
  ) into r;

  return r;
end
$$;

revoke all on function public.relatorio_financeiro(uuid, date, date) from public, anon;
grant execute on function public.relatorio_financeiro(uuid, date, date) to authenticated;
