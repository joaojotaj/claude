// Transforma o retorno de relatorio_financeiro (valores em centavos, com sinal: despesa < 0)
// nos números que o relatório mostra. Nada aqui busca dados: é cálculo puro e testável.

import { moduloSetor } from './setores.js';

export function calcular(dados, projeto = {}, opcoes = {}) {
  const g = dados.dre || {};
  const G = k => Number(g[k] || 0);
  const meses = Number(dados.periodo?.meses) || 1;

  const rec = G('rec'), ded = G('ded'), cvar = G('cvar'), cfix = G('cfix'), dop = G('dop');
  const rfin = G('rfin'), rnop = G('rnop'), dnop = G('dnop');
  const recliq = rec + ded;
  const mc = recliq + cvar;
  const resop = mc + cfix + dop;
  const resliq = resop + rfin + rnop + dnop;

  const categorias = (dados.categorias || []).map(c => ({ ...c, v: Number(c.v) }));
  const soma = (re, grupos) => categorias
    .filter(c => grupos.includes(c.grupo) && re.test(c.chave))
    .reduce((s, c) => s + c.v, 0);

  // Valores positivos (custo), por período.
  const das = -soma(/simples nacional/, ['ded']);
  const taxas = -soma(/taxas? de (cartao|antecipacao)|tarifa de venda/, ['ded', 'cvar', 'dop']);
  const repasse = -soma(/^repasse a profissionais/, ['cvar']);
  const insumos = -soma(/produtos e insumos|materiais descartaveis|^cmv/, ['cvar']);
  const retiradas = -soma(/distribuicao de lucros|retiradas|pessoais dos socios|despesas com socios|emprestimos a socios/, ['dnop']);
  const investimentos = -soma(/moveis|maquinario|imobilizado|aquisicao de ativos|consorcio/, ['dnop']);
  const movDn = -soma(/movimento entre/, ['dnop']);
  const movRn = soma(/movimento entre/, ['rnop']);
  const movimento = movDn - movRn;

  const pag = dados.pagamentos || [];
  const totalPag = pag.reduce((s, p) => s + Number(p.v), 0);
  const credito = pag.find(p => p.forma === 'credito');

  const recMes = rec / meses;
  const fixosMes = -(cfix + dop) / meses;
  const mcPct = rec ? mc / rec : 0;
  const pe = mcPct > 0 ? fixosMes / mcPct : null;
  const peComRetiradas = mcPct > 0 ? (fixosMes + retiradas / meses) / mcPct : null;

  const mensal = (dados.dre_mensal || []).map(m => {
    const x = k => Number(m.grupos[k] || 0);
    const r = x('rec');
    return { mes: m.mes, rec: r, resop: r + x('ded') + x('cvar') + x('cfix') + x('dop'), despesas: x('ded') + x('cvar') + x('cfix') + x('dop') };
  });
  const ult = mensal[mensal.length - 1], ant = mensal[mensal.length - 2];
  const varReceita = ult && ant && ant.rec ? (ult.rec / ant.rec - 1) * 100 : null;

  const vendas = dados.vendas || {};
  const setor = moduloSetor(projeto.setor);
  const dias = dados.dias_semana || [];
  const totalDias = dias.reduce((s, d) => s + Number(d.v), 0);

  return {
    projeto, periodo: dados.periodo, meses,
    dre: { rec, ded, cvar, cfix, dop, rfin, rnop, dnop, recliq, mc, resop, resliq },
    categorias,
    chaves: { das, taxas, repasse, insumos, retiradas, investimentos, movimento, movDn, movRn },
    recMes, fixosMes, mcPct, pe, peComRetiradas,
    margemSeguranca: pe != null && recMes > 0 ? 1 - pe / recMes : null,
    mensal, varReceita,
    vendas: {
      ...vendas,
      ticket: vendas.qtd ? vendas.total / vendas.qtd : null,
      itensPorVenda: vendas.qtd ? vendas.itens / vendas.qtd : null,
    },
    pagamentos: pag.map(p => ({ ...p, v: Number(p.v), pct: totalPag ? Number(p.v) / totalPag * 100 : 0 })),
    credito: credito ? { v: Number(credito.v), parcelas: Number(credito.parcelas_media), custoPct: credito.v ? taxas / credito.v * 100 : 0 } : null,
    dias: dias.map(d => ({ ...d, v: Number(d.v), pct: totalDias ? Number(d.v) / totalDias * 100 : 0, ticket: d.qtd ? d.v / d.qtd : 0 })),
    setor,
    mix: setor.mix(dados),
    profissionais: setor.profissionais(dados, opcoes),
    repasses: dados.repasses || [],
    saldos: dados.saldos || {},
    abertos: dados.abertos || {},
    lancamentos: dados.lancamentos || {},
    repassesSemContraparte: dados.repasses_sem_contraparte || 0,
  };
}
