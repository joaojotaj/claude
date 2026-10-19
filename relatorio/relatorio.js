// Relatório financeiro unificado (5 capítulos) da plataforma jota-insights.
//
// Uso:
//   import { montarRelatorio } from './relatorio/relatorio.js';
//   montarRelatorio(document.getElementById('relatorio'), {
//     supabase, projetoId, de: '2026-08-01', ate: '2026-09-30',
//     profissionais: ['Karine Guimarães'],   // opcional: quem atende e não recebe repasse
//   });
//
// Precisa de relatorio.css na página e da migration 0006_relatorio_financeiro.sql aplicada.

import { calcular } from './modelo.js';
import { decisoes, checagens, DIA, dataBR } from './regras.js';
import { brl, mil, pct, por100, mesCurto, esc } from './formato.js';

export async function montarRelatorio(el, { supabase, projetoId, de, ate, profissionais = [] }) {
  el.classList.add('jr');
  el.innerHTML = '<p class="jr-status">Carregando relatório…</p>';
  const [proj, rel] = await Promise.all([
    supabase.from('projetos').select('nome, setor, regime_tributario').eq('id', projetoId).single(),
    supabase.rpc('relatorio_financeiro', { p_projeto: projetoId, p_de: de, p_ate: ate }),
  ]);
  const erro = proj.error || rel.error;
  if (erro) {
    el.innerHTML = `<p class="jr-status jr-erro">Não foi possível montar o relatório: ${esc(erro.message)}</p>`;
    return null;
  }
  return renderRelatorio(el, proj.data, rel.data, { profissionais });
}

// Separado da busca para permitir PDF, link compartilhado e testes com dados prontos.
export function renderRelatorio(el, projeto, dados, opcoes = {}) {
  const m = calcular(dados, projeto, opcoes);
  const acoes = decisoes(m);
  const checks = checagens(m);
  el.classList.add('jr');
  el.innerHTML = [cabecalho(m, checks), nav(), capResumo(m, acoes), capResultado(m), capOperacao(m), capCaixa(m), capDados(checks), rodape(m)].join('');
  ligarNavegacao(el);
  return { modelo: m, acoes, checks };
}

// ---------- blocos ----------

const periodoTxt = p => `${dataBR(p.de)} a ${dataBR(p.ate)}`;

function cabecalho(m, checks) {
  const pend = checks.filter(c => c[0] !== 'ok');
  const nivel = pend.some(c => c[0] === 'crit') ? 'crit' : pend.length ? 'warn' : 'ok';
  const selo = nivel === 'ok' ? 'Dados completos' : `Dados com ressalvas · ${pend.length} ${pend.length === 1 ? 'ponto' : 'pontos'} a corrigir`;
  const v = m.vendas;
  return `
  <header class="jr-head">
    <div>
      <div class="jr-eyebrow">Relatório financeiro${m.setor.nome ? ' · ' + esc(m.setor.nome) : ''}</div>
      <h1>${esc(m.projeto.nome)}</h1>
      <div class="jr-meta">${esc(m.projeto.regime_tributario || '')} · financeiro de ${periodoTxt(m.periodo)}${v.qtd ? ` · vendas de ${dataBR(v.de)} a ${dataBR(v.ate)}` : ''}</div>
    </div>
    <span class="jr-seal ${nivel}"><i></i>${selo}</span>
  </header>`;
}

const CAPS = [['resumo', 'Resumo'], ['resultado', 'Resultado'], ['operacao', 'Operação'], ['caixa', 'Caixa'], ['dados', 'Dados']];
const nav = () => `<nav class="jr-chapters" aria-label="Capítulos do relatório">${CAPS.map(([id, t], i) => `<button type="button" data-ch="${id}"><b>${i + 1}</b>${t}</button>`).join('')}</nav>`;

const capHead = (n, titulo, sub, extra = '') =>
  `<div class="jr-ch-head"><span class="jr-ch-n">${n}</span><div><h2 class="jr-ch-t">${titulo}${extra}</h2><p class="jr-ch-s">${sub}</p></div></div>`;

const panelHead = (titulo, sub) => `<div class="jr-panel-head"><div><h3>${titulo}</h3>${sub ? `<div class="jr-sub">${sub}</div>` : ''}</div></div>`;

function kpis(m) {
  const { dre, meses, vendas: v } = m;
  const tagVar = m.varReceita == null ? null
    : [`${mesCurto(m.mensal.at(-1).mes)} ${m.varReceita >= 0 ? '+' : ''}${pct(m.varReceita)} vs mês anterior`, m.varReceita >= 0 ? 'good' : m.varReceita > -10 ? 'warn' : 'crit'];
  const resPct = dre.rec ? dre.resop / dre.rec * 100 : 0;
  const ret = m.chaves.retiradas;
  const partSocios = dre.resop > 0 ? ret / dre.resop * 100 : null;
  const itens = [
    { t: 'Receita média por mês', v: mil(m.recMes), d: `Receita bruta de ${periodoTxt(m.periodo)}`, tag: tagVar },
    v.ticket
      ? { t: 'Ticket médio por venda', v: brl(v.ticket), d: `Mediana de ${brl(v.ticket_mediano)} · ${v.itensPorVenda.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} item por venda`, tag: [`${v.clientes} clientes · ${v.clientes_recorrentes} voltaram`, 'good'] }
      : { t: 'Margem de contribuição', v: pct(m.mcPct * 100), d: 'O que sobra de cada venda para pagar a estrutura', tag: null },
    { t: 'Resultado operacional', v: mil(dre.resop / meses), d: `${pct(resPct)} da receita, antes dos sócios`, tag: resPct >= 15 ? ['Operação saudável', 'good'] : resPct >= 0 ? ['Margem apertada', 'warn'] : ['Prejuízo', 'crit'] },
    { t: 'Sobra depois dos sócios', v: mil(dre.resliq / meses), d: partSocios != null && ret ? `Sócios levaram ${pct(partSocios, 0)} do resultado` : 'Depois de retiradas, investimentos e não operacionais',
      tag: dre.resliq < 0 || (partSocios ?? 0) >= 80 ? ['Caixa não cresce', 'crit'] : dre.resliq < dre.rec * 0.05 ? ['Sobra pequena', 'warn'] : ['Caixa crescendo', 'good'] },
  ];
  return `<div class="jr-kpis">${itens.map(x => `
    <div class="jr-kpi"><span class="jr-eyebrow">${x.t}</span><span class="v">${x.v}</span><span class="d">${esc(x.d)}</span>${x.tag ? `<span class="jr-tag ${x.tag[1]}">${esc(x.tag[0])}</span>` : ''}</div>`).join('')}</div>`;
}

function capResumo(m, acoes) {
  const rot = { crit: 'Urgente', warn: 'Importante', info: 'Oportunidade' };
  const cards = acoes.length
    ? acoes.map(x => `<article class="jr-act ${x.s}"><span class="jr-prio ${x.s}">${rot[x.s]}</span><h4>${esc(x.t)}</h4><p>${x.f}</p><p><b>Ação:</b> ${x.a}</p><span class="jr-impact">${esc(x.i)}</span></article>`).join('')
    : '<p class="jr-sub">Nenhum ponto de atenção pelas regras atuais.</p>';
  return `<section class="jr-chapter" id="resumo">
    ${capHead(1, 'Resumo do mês', 'Os números que o dono precisa ver e o que fazer com eles.')}
    ${kpis(m)}
    <div class="jr-panel">${panelHead('Decisões do mês', 'Ordenadas pela urgência. O valor estimado é por mês.')}<div class="jr-actions">${cards}</div></div>
  </section>`;
}

function capResultado(m) {
  const { dre, meses } = m;
  const rec = dre.rec || 1;
  const p100 = v => Math.abs(v) / rec * 100;

  // Deduções e custos variáveis por categoria (as menores que 3% viram "outros").
  const variaveis = m.categorias.filter(c => (c.grupo === 'ded' || c.grupo === 'cvar') && c.v < 0).sort((a, b) => a.v - b.v);
  const grandes = variaveis.filter(c => p100(c.v) >= 3);
  const resto = variaveis.filter(c => p100(c.v) < 3).reduce((s, c) => s + c.v, 0);
  const cores = ['v1', 'v2', 'v3', 'v4'];
  const seg = [
    ...grandes.map((c, i) => ({ n: c.categoria, v: -c.v, cor: cores[Math.min(i, 3)], fam: 'v' })),
    ...(resto ? [{ n: 'Outras deduções e variáveis', v: -resto, cor: 'v4', fam: 'v' }] : []),
    { n: 'Custos fixos', v: -dre.cfix, cor: 'f1', fam: 'f' },
    { n: 'Despesas operacionais', v: -dre.dop, cor: 'f3', fam: 'f' },
    ...(dre.resop > 0 ? [{ n: 'Resultado operacional', v: dre.resop, cor: 'r1', fam: 'r' }] : []),
  ].filter(s => s.v > 0);
  const escuro = new Set(['v3', 'v4']);
  const fam = { v: 0, f: 0, r: 0 };
  seg.forEach(s => { fam[s.fam] += p100(s.v); });

  const barra = `<div class="jr-hundred" role="img" aria-label="Destino de cada R$ 100 de receita">${seg.map(s =>
    `<div class="${escuro.has(s.cor) ? 'dark' : ''}" style="flex:${p100(s.v)} 1 0;background:var(--jr-${s.cor})" title="${esc(s.n)}: ${por100(p100(s.v))}">${p100(s.v) >= 4 ? 'R$ ' + Math.round(p100(s.v)) : ''}</div>`).join('')}</div>
    <div class="jr-families"><span style="flex:${fam.v} 1 0">Impostos, taxas e variáveis · ${por100(fam.v)}</span><span style="flex:${fam.f} 1 0">Estrutura · ${por100(fam.f)}</span>${fam.r ? `<span style="flex:${fam.r} 1 0">Resultado</span>` : ''}</div>`;
  const legenda = `<div class="jr-legend">${seg.map(s => `
    <div class="row"><span class="sw" style="background:var(--jr-${s.cor})"></span><span>${esc(s.n)}<br><span class="r">${mil(s.v / meses)}/mês</span></span><b>${por100(p100(s.v))}</b></div>`).join('')}</div>`;

  // Abaixo do resultado operacional: sócios, investimentos, financeiro e não operacionais.
  const k = m.chaves;
  // Valores positivos saem do resultado; negativos entram. A soma fecha em resop − resliq.
  const partes = [
    ['Sócios', k.retiradas, 'crit'],
    ['Movimento entre unidades', k.movimento, 'warn'],
    ['Investimentos', k.investimentos, 'f3'],
    ['Outras não operacionais', -dre.dnop - k.retiradas - k.investimentos - k.movDn, 'f4'],
    ['Resultado financeiro', -dre.rfin, 'f2'],
    ['Receitas não operacionais', -(dre.rnop - k.movRn), 'r1'],
  ].filter(([, v]) => Math.abs(v) >= 100);
  const sobra = dre.resliq;
  const pedacos = [...partes.filter(([, v]) => v > 0), ...(sobra > 0 ? [['Sobra', sobra, 'r1']] : [])];
  const textoPartes = partes.map(([n, v]) => `${n.toLowerCase()} ${v >= 0 ? '' : '+'}${por100(p100(v))}`).join(', ');
  const depois = dre.resop > 0
    ? `<p>Dos <b>${por100(p100(dre.resop))}</b> de resultado operacional: ${esc(textoPartes)}. ${sobra >= 0 ? `<b>Sobraram ${por100(p100(sobra))}.</b>` : `<b>Faltaram ${por100(p100(sobra))}.</b>`}</p>
       <div class="jr-mini" role="img" aria-label="Destino do resultado operacional">${pedacos.map(([n, v, c]) => `<div title="${esc(n)}" style="flex:${v} 1 0;background:var(--jr-${c})"></div>`).join('')}</div>
       <div class="jr-paylegend">${pedacos.map(([n, v, c]) => `<span><i style="background:var(--jr-${c})"></i>${esc(n)} · ${por100(p100(v))}</span>`).join('')}</div>`
    : `<p>Os custos passaram a receita em <b>${mil(-dre.resop / meses)}/mês</b>. Não há resultado para distribuir.</p>`;
  const equilibrio = m.pe != null
    ? `<p>Ponto de equilíbrio: <b>${mil(m.pe)}/mês</b>${m.margemSeguranca == null ? '' : m.margemSeguranca >= 0 ? ` (margem de segurança de ${pct(m.margemSeguranca * 100, 0)})` : ` (a receita está ${pct(-m.margemSeguranca * 100 / (1 - m.margemSeguranca), 0)} abaixo dele)`}.${k.retiradas && m.peComRetiradas ? ` Contando as retiradas como custo fixo: <b>${mil(m.peComRetiradas)}/mês</b>.` : ''}</p>`
    : '<p>A margem de contribuição está negativa: cada venda aumenta o prejuízo.</p>';

  return `<section class="jr-chapter" id="resultado">
    ${capHead(2, 'Resultado', 'A DRE do período lida como uma barra: quanto fica com impostos, profissionais, estrutura e sócios.')}
    <div class="jr-panel">${panelHead('Para onde vai cada R$ 100 que entra', `Receita bruta de ${periodoTxt(m.periodo)} = R$ 100.`)}
      ${barra}${legenda}<div class="jr-after">${depois}${equilibrio}</div>
    </div>
    ${tabelaDre(m)}
  </section>`;
}

function tabelaDre(m) {
  const meses = m.mensal;
  if (!meses.length) return '';
  const linhas = [['Receita bruta', 'rec'], ['Resultado operacional', 'resop']];
  return `<div class="jr-panel">${panelHead('Mês a mês')}
    <div class="jr-scroll"><table class="jr-table"><thead><tr><th></th>${meses.map(x => `<th>${mesCurto(x.mes)}</th>`).join('')}</tr></thead>
    <tbody>${linhas.map(([t, k]) => `<tr><th>${t}</th>${meses.map(x => `<td class="${x[k] < 0 ? 'neg' : ''}">${mil(x[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
}

function barras(itens, fmt) {
  const max = Math.max(...itens.map(x => x.v), 1);
  return `<div class="jr-bars">${itens.map((x, i) => `
    <div class="jr-bar"><span class="lbl" title="${esc(x.nome)}">${esc(x.nome)}<small>${esc(x.detalhe || '')}</small></span>
      <span class="track"><span class="fill ${x.apagado ? 'muted' : i === 0 ? 'hi' : ''}" style="width:${(x.v / max * 100).toFixed(1)}%"></span></span>
      <span class="val">${fmt(x)}</span></div>`).join('')}</div>`;
}

function capOperacao(m) {
  const paineis = [];
  const p = m.profissionais;
  if (p) {
    const sub = p.modo === 'producao' ? 'Produção pelo nome do profissional que aparece no serviço vendido.' : 'As vendas não trazem o profissional. O ranking usa o repasse pago no período.';
    const nota = p.modo === 'producao'
      ? (p.semProfissionalPct >= 1 ? `<b>${pct(p.semProfissionalPct, 0)} da produção não tem profissional.</b> Cadastre o profissional em cada item de venda.` : '')
      : `<b>5 profissionais recebem ${pct(p.top5Pct, 0)} dos repasses.</b> Para ver a produção real, o profissional precisa vir na venda.`;
    paineis.push(`<section class="jr-panel">${panelHead('Vendas por profissional', sub)}${barras(p.itens, x => mil(x.v))}${nota ? `<div class="jr-note">${nota}</div>` : ''}</section>`);
  }
  if (m.mix.length) {
    paineis.push(`<section class="jr-panel">${panelHead(m.setor.nome ? 'Mix de serviços' : 'Mais vendidos', `${m.vendas.qtd} vendas · ${mil(m.vendas.total)}`)}${barras(m.mix.map(x => ({ ...x, detalhe: `${x.q} itens · média ${brl(x.medio)}` })), x => pct(x.pct))}</section>`);
  }
  if (m.dias.length) {
    const max = Math.max(...m.dias.map(d => d.v));
    const semana = [1, 2, 3, 4, 5, 6, 7].map(dow => m.dias.find(d => d.dow === dow)).filter(Boolean);
    const forte = semana.reduce((a, b) => (b.v > a.v ? b : a));
    paineis.push(`<section class="jr-panel">${panelHead('Receita por dia da semana', `Vendas de ${dataBR(m.vendas.de)} a ${dataBR(m.vendas.ate)}.`)}
      <div class="jr-cols" style="grid-template-columns:repeat(${semana.length},minmax(0,1fr))">${semana.map(d => `
        <div class="col"><span class="t">${pct(d.pct, 0)}</span><span class="bx ${d === forte ? 'hi' : ''}" style="height:${(d.v / max * 150).toFixed(0)}px"></span><span class="p">${d.qtd} vendas<br>tkt ${brl(d.ticket)}</span></div>`).join('')}</div>
      <div class="jr-days" style="grid-template-columns:repeat(${semana.length},minmax(0,1fr))">${semana.map(d => `<span>${DIA[d.dow].slice(0, 3)}</span>`).join('')}</div></section>`);
  }
  if (m.pagamentos.length) {
    const nomes = { credito: 'Crédito', debito: 'Débito', pix: 'PIX', dinheiro: 'Dinheiro', outros: 'Sem forma identificada' };
    const cor = { credito: 'v1', debito: 'f2', pix: 'r1', dinheiro: 'f3', outros: 'f4' };
    const c = m.credito;
    const fatos = c ? [
      [`${c.parcelas.toLocaleString('pt-BR')}x`, 'parcelas em média no crédito', c.parcelas >= 4 ? 'warn' : ''],
      [pct(c.custoPct), 'do crédito vai para taxas e antecipação', c.custoPct >= 7 ? 'crit' : c.custoPct >= 5 ? 'warn' : ''],
      [mil(m.chaves.taxas / m.meses), 'por mês em taxas de cartão', ''],
    ] : [];
    paineis.push(`<section class="jr-panel">${panelHead('Como o cliente paga', 'Receita do período por forma de pagamento.')}
      <div class="jr-paystrip">${m.pagamentos.map(p => `<div class="${p.forma === 'outros' ? 'dark' : ''}" style="flex:${p.pct} 1 0;background:var(--jr-${cor[p.forma]})">${p.pct >= 8 ? pct(p.pct, 0) : ''}</div>`).join('')}</div>
      <div class="jr-paylegend">${m.pagamentos.map(p => `<span><i style="background:var(--jr-${cor[p.forma]})"></i>${nomes[p.forma]} · ${pct(p.pct)}</span>`).join('')}</div>
      <div class="jr-facts">${fatos.map(([v, t, s]) => `<div class="fact ${s}"><div class="v">${v}</div><div class="d">${t}</div></div>`).join('')}</div></section>`);
  }
  const setor = m.setor.nome ? `<span class="jr-sector">${esc(m.setor.nome)}</span>` : '';
  return `<section class="jr-chapter" id="operacao">
    ${capHead(3, 'Operação', 'Indicadores do setor do cliente. O restante do relatório é igual para todos.', setor)}
    ${paineis.length ? `<div class="jr-grid2">${paineis.join('')}</div>` : '<div class="jr-panel jr-waiting"><p class="jr-sub">Sem vendas no período. Este capítulo usa o módulo de vendas do Conta Azul.</p></div>'}
  </section>`;
}

function capCaixa(m) {
  const s = m.saldos, a = m.abertos, meses = m.meses;
  const vencidos = (a.vencidos || []).reduce((t, x) => t + Number(x.v), 0);
  const fatos = [
    [mil(Number(a.receber_90 || 0)), 'a receber nos 90 dias seguintes ao período', ''],
    [mil(-Number(a.pagar_90 || 0)), 'a pagar nos mesmos 90 dias', ''],
    [mil(vencidos), 'de recebíveis vencidos em aberto', vencidos > 0 ? 'warn' : ''],
  ];
  let topo;
  if (s.contas) {
    const saldo = Number(s.total);
    const cobertura = m.fixosMes > 0 ? saldo / m.fixosMes : null;
    const fluxoMes = m.dre.resliq / meses;
    const projetado = saldo + Number(a.receber_90 || 0) + Number(a.pagar_90 || 0);
    topo = `<div class="jr-kpis">
      <div class="jr-kpi"><span class="jr-eyebrow">Saldo em ${dataBR(s.data)}</span><span class="v">${mil(saldo)}</span><span class="d">${s.contas} conta(s)</span></div>
      <div class="jr-kpi"><span class="jr-eyebrow">Fôlego</span><span class="v">${cobertura != null ? cobertura.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' meses' : '—'}</span><span class="d">de custo fixo cobertos pelo saldo</span>${cobertura != null ? `<span class="jr-tag ${cobertura >= 3 ? 'good' : cobertura >= 1 ? 'warn' : 'crit'}">${cobertura >= 3 ? 'Reserva saudável' : cobertura >= 1 ? 'Reserva curta' : 'Sem reserva'}</span>` : ''}</div>
      <div class="jr-kpi"><span class="jr-eyebrow">Ritmo do caixa</span><span class="v">${mil(fluxoMes)}</span><span class="d">${fluxoMes < 0 ? `por mês · o saldo zera em ${(saldo / -fluxoMes).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} meses` : 'por mês depois dos sócios'}</span></div>
      <div class="jr-kpi"><span class="jr-eyebrow">Saldo projetado em 90 dias</span><span class="v">${mil(projetado)}</span><span class="d">Saldo + a receber − a pagar já lançados</span></div>
    </div>`;
  } else {
    topo = `<div class="jr-panel jr-waiting">${panelHead('Aguardando os saldos bancários', 'Informe o saldo de cada conta na tela Saldos para calcular o fôlego de caixa e o saldo projetado.')}</div>`;
  }
  return `<section class="jr-chapter" id="caixa">
    ${capHead(4, 'Caixa', 'Quanto tempo o caixa aguenta e o que entra e sai nos próximos 90 dias.')}
    ${topo}
    <div class="jr-panel">${panelHead('Contas em aberto no Conta Azul')}<div class="jr-facts">${fatos.map(([v, t, c]) => `<div class="fact ${c}"><div class="v">${v}</div><div class="d">${t}</div></div>`).join('')}</div></div>
  </section>`;
}

function capDados(checks) {
  const lbl = { ok: 'Ok', warn: 'Corrigir', crit: 'Falta' };
  return `<section class="jr-chapter" id="dados">
    ${capHead(5, 'Confiabilidade dos dados', 'O que precisa ser corrigido no Conta Azul para o próximo relatório sair completo.')}
    <div class="jr-panel"><ul class="jr-checks">${checks.map(([s, t]) => `<li><span class="jr-pill ${s}">${lbl[s]}</span><span>${esc(t)}</span></li>`).join('')}</ul></div>
  </section>`;
}

const rodape = m => `<footer class="jr-footer"><span>Fonte: Conta Azul via jota-insights · competência de ${periodoTxt(m.periodo)}.</span><span>Elaborado por JOTA Finanças</span></footer>`;

function ligarNavegacao(el) {
  const reduz = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const botoes = [...el.querySelectorAll('.jr-chapters button')];
  botoes.forEach(b => b.addEventListener('click', () =>
    el.querySelector('#' + b.dataset.ch)?.scrollIntoView({ behavior: reduz ? 'auto' : 'smooth', block: 'start' })));
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) botoes.forEach(b => b.classList.toggle('on', b.dataset.ch === e.target.id));
  }), { rootMargin: '-30% 0px -60% 0px' });
  el.querySelectorAll('.jr-chapter').forEach(s => io.observe(s));
}
