// Regras que transformam os números em decisões (capítulo 1) e em checagens de dados (capítulo 5).
// Cada decisão: { s: 'crit'|'warn'|'info', t, f, a, i, valor } — valor (centavos/mês) ordena dentro da severidade.
// Os limites (LIMITES) são o ponto de partida da JOTA; ajuste conforme a carteira.

import { mil, pct } from './formato.js';

export const LIMITES = {
  retiradasSobreResultado: 0.7,  // sócios levando 70%+ do resultado operacional
  retiradaSugerida: 0.6,         // retirada fixa sugerida: 60% do resultado
  repasseSobreReceita: 0.45,
  insumosSobreReceita: 0.10,
  custoCredito: 0.05,            // taxas + antecipação sobre o que entra no crédito
  migracaoPix: 0.2,
  concentracaoDia: 0.33,
  semProfissional: 30,           // % da produção
  concentracaoTop5: 60,          // % dos repasses
  pagamentoSemForma: 15,         // % da receita
};

export function decisoes(m, L = LIMITES) {
  const out = [];
  const { dre, chaves: k, meses } = m;
  const mes = v => v / meses;
  const rec = dre.rec;
  if (rec <= 0) return [];

  if (dre.resop < 0) {
    out.push({
      s: 'crit', t: 'Operação no prejuízo',
      f: `O resultado operacional é de <b>${mil(mes(dre.resop))}/mês</b>. O ponto de equilíbrio é <b>${m.pe ? mil(m.pe) : '—'}/mês</b> e a receita está em ${mil(m.recMes)}/mês.`,
      a: 'Cortar custos fixos ou subir preço até a margem de contribuição cobrir a estrutura. Comece pelas maiores linhas do capítulo 2.',
      i: m.pe ? `Faltam ${mil(m.pe - m.recMes)}/mês de receita` : 'Margem de contribuição negativa',
      valor: -dre.resop,
    });
  } else if (k.retiradas > 0 && k.retiradas / dre.resop >= L.retiradasSobreResultado) {
    const sugerida = mes(dre.resop) * L.retiradaSugerida;
    out.push({
      s: 'crit', t: `Retiradas levam ${pct(k.retiradas / dre.resop * 100, 0)} do lucro`,
      f: `O resultado operacional é de <b>${mil(mes(dre.resop))}/mês</b>. Retiradas e despesas dos sócios somam <b>${mil(mes(k.retiradas))}/mês</b>. Sobram ${mil(mes(dre.resliq))}/mês para o caixa.`,
      a: `Fixar uma retirada mensal e distribuir o lucro só no fim do trimestre, depois de formar reserva de 2 meses de custo fixo (${mil(m.fixosMes * 2)}).`,
      i: `+${mil(mes(k.retiradas) - sugerida)}/mês no caixa com retirada fixa de ${mil(sugerida)}`,
      valor: mes(k.retiradas) - sugerida,
    });
  }

  if (k.repasse / rec >= L.repasseSobreReceita) {
    out.push({
      s: 'crit', t: `Repasse consome ${pct(k.repasse / rec * 100, 0)} da receita`,
      f: `Os repasses somam <b>${mil(mes(k.repasse))}/mês</b>. A margem de contribuição fica em ${pct(m.mcPct * 100)}.`,
      a: 'Revisar a tabela de comissão por tipo de serviço: percentual menor nos serviços que usam produto do salão.',
      i: `${mil(m.recMes * 0.01)}/mês por ponto percentual a menos`,
      valor: m.recMes * 0.01,
    });
  }

  if (k.das > 0 && k.repasse > 0) {
    const aliquota = k.das / rec;
    out.push({
      s: 'warn', t: `DAS em ${pct(aliquota * 100)} da receita`,
      f: `O Simples custa <b>${mil(mes(k.das))}/mês</b>, e os repasses aos parceiros somam ${mil(mes(k.repasse))}/mês.`,
      a: 'Confirmar com a contabilidade se a cota-parte dos parceiros já sai da base do Simples (Lei do Salão Parceiro, 13.352/2016). Exige contratos de parceria homologados.',
      i: `até ${mil(mes(k.repasse) * aliquota)}/mês`,
      valor: mes(k.repasse) * aliquota,
    });
  }

  if (m.credito && m.credito.custoPct / 100 >= L.custoCredito) {
    const ganho = mes(m.credito.v) * L.migracaoPix * m.credito.custoPct / 100;
    out.push({
      s: 'warn', t: `Parcelamento custa ${pct(m.credito.custoPct)} do crédito`,
      f: `${pct(m.pagamentos.find(p => p.forma === 'credito').pct, 0)} da receita entra no crédito, em <b>${m.credito.parcelas.toLocaleString('pt-BR')} parcelas</b> em média. Taxas e antecipação: ${mil(mes(k.taxas))}/mês.`,
      a: 'Limitar o número de parcelas por faixa de valor e oferecer desconto no PIX para os serviços de maior ticket.',
      i: `${mil(ganho)}/mês a cada ${pct(L.migracaoPix * 100, 0)} do crédito que migrar para PIX`,
      valor: ganho,
    });
  }

  if (k.insumos / rec >= L.insumosSobreReceita) {
    out.push({
      s: 'warn', t: `Produtos em ${pct(k.insumos / rec * 100)} da receita`,
      f: `O consumo de produtos e insumos é de <b>${mil(mes(k.insumos))}/mês</b>.`,
      a: 'Montar ficha técnica dos serviços que mais consomem produto (gramas por aplicação) e revisar o preço dos adicionais.',
      i: `${mil(m.recMes * 0.01)}/mês por ponto percentual a menos`,
      valor: m.recMes * 0.01,
    });
  }

  if (k.movimento > 0) {
    out.push({
      s: 'warn', t: `${mil(k.movimento)} de transferência entre unidades`,
      f: 'Há lançamentos de "movimento entre" unidades classificados como receita ou despesa.',
      a: 'Marcar esses lançamentos como transferência no Conta Azul. Eles não são custo da operação.',
      i: 'Resultado correto na DRE',
      valor: 0,
    });
  }

  const forte = [...m.dias].sort((a, b) => b.v - a.v)[0];
  const fraco = [...m.dias].sort((a, b) => a.v - b.v)[0];
  if (forte && fraco && forte.pct / 100 >= L.concentracaoDia) {
    out.push({
      s: 'info', t: `${DIA[forte.dow]} concentra ${pct(forte.pct, 0)} da receita`,
      f: `${DIA[forte.dow]} faz ${pct(forte.pct, 0)} da receita. ${DIA[fraco.dow]} faz ${pct(fraco.pct, 0)}.`,
      a: `Levar promoções e pacotes para ${DIA[fraco.dow].toLowerCase()} e reservar a agenda de ${DIA[forte.dow].toLowerCase()} para os serviços de maior ticket.`,
      i: `${mil(fraco.ticket * 10)} a cada 10 atendimentos extras`,
      valor: 0,
    });
  }

  const p = m.profissionais;
  if (p?.modo === 'producao' && p.semProfissionalPct >= L.semProfissional) {
    out.push({
      s: 'info', t: 'Cadastrar o profissional em toda venda',
      f: `<b>${pct(p.semProfissionalPct, 0)} da produção</b> não tem profissional identificado.`,
      a: 'Exigir o profissional em cada item de venda no Conta Azul ou integrar o sistema de agenda.',
      i: 'Comissão e ranking confiáveis', valor: 0,
    });
  }
  if (p?.modo === 'repasse' && p.top5Pct >= L.concentracaoTop5) {
    out.push({
      s: 'info', t: `5 profissionais recebem ${pct(p.top5Pct, 0)} dos repasses`,
      f: 'A receita depende de poucas pessoas. Se uma delas sair, a receita cai junto.',
      a: 'Plano de retenção para os principais profissionais e agenda distribuída entre a equipe.',
      i: 'Menos risco de queda de receita', valor: 0,
    });
  }

  const ordem = { crit: 0, warn: 1, info: 2 };
  return out.sort((a, b) => ordem[a.s] - ordem[b.s] || b.valor - a.valor);
}

export function checagens(m, L = LIMITES) {
  const out = [];
  const semGrupo = m.categorias.filter(c => c.grupo === 'sem_grupo');
  out.push(semGrupo.length
    ? ['warn', `Categorias sem grupo na DRE (ficam fora do resultado): ${semGrupo.map(c => `"${c.categoria}"`).join(', ')}.`]
    : ['ok', 'Todas as categorias têm grupo na DRE.']);
  if (m.lancamentos.sem_categoria) out.push(['warn', `${m.lancamentos.sem_categoria} lançamentos sem categoria.`]);

  const vazios = m.mensal.filter(x => x.rec === 0 && x.despesas < 0).map(x => x.mes);
  if (vazios.length) out.push(['warn', `Meses com despesas e nenhuma receita: ${vazios.join(', ')}.`]);

  if (!m.vendas.qtd) out.push(['warn', 'Nenhuma venda no período: ticket, mix e dias da semana ficam vazios.']);
  else if (m.vendas.sem_detalhe) out.push(['warn', `${m.vendas.sem_detalhe} vendas sem detalhe do serviço.`]);

  if (m.profissionais?.modo === 'producao' && m.profissionais.semProfissionalPct >= L.semProfissional)
    out.push(['warn', `${pct(m.profissionais.semProfissionalPct, 0)} da produção sem profissional identificado.`]);
  if (m.profissionais?.modo === 'repasse')
    out.push(['warn', 'As vendas não trazem o profissional. O ranking usa o repasse como sinal da produção.']);
  if (m.repassesSemContraparte) out.push(['warn', `${m.repassesSemContraparte} repasses sem contraparte: o nome só aparece na descrição do pagamento.`]);
  if (m.repasses.some(r => /^\(impostos/i.test(r.profissional)))
    out.push(['warn', 'DAS e DARF dos parceiros lançados dentro de "Repasse a Profissionais Parceiros". Separe para medir a comissão real.']);
  if (m.chaves.movimento) out.push(['warn', 'Movimento entre unidades lançado como receita ou despesa.']);

  const semForma = m.pagamentos.find(p => p.forma === 'outros');
  if (semForma && semForma.pct >= L.pagamentoSemForma) out.push(['warn', `${pct(semForma.pct, 0)} da receita sem forma de pagamento identificada.`]);

  out.push(m.saldos.contas
    ? ['ok', `Saldos de ${m.saldos.contas} conta(s) informados até ${dataBR(m.saldos.data)}.`]
    : ['crit', 'Saldos bancários não informados. Sem eles não há fôlego de caixa.']);
  return out;
}

export const DIA = { 1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta', 6: 'Sábado', 7: 'Domingo' };
export const dataBR = d => d ? d.split('-').reverse().join('/') : '—';
