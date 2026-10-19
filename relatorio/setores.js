// Capítulo 3 (Operação) muda conforme o setor do projeto. Cada módulo recebe os dados da
// função relatorio_financeiro e devolve os painéis específicos do setor.
// Para um setor novo, crie um objeto com { nome, mix(dados), profissionais(dados, opcoes) }
// e registre em SETORES.

import { brl } from './formato.js';

const semAcento = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
export const chaveTexto = s => semAcento(s).toUpperCase().replace(/\s+/g, ' ').trim();

// A ordem importa: a primeira regra que casar define o grupo (produtos antes de tratamentos,
// para "Máscara Hidratação 175g" não virar serviço).
const GRUPOS_BELEZA = [
  ['Sem detalhe', /SEM DETALHE/],
  ['Copa', /^COPA\b/],
  ['Produtos (revenda)', /\d{8,}|\d+ ?(ML|L|G)\b| - NULL$| -$/],
  ['Taxas e créditos', /TAXA ADM|CREDITO DO CLIENTE/],
  ['Coloração e mechas', /COLORA|LUZES|MECHA|TONALIZ|RETOQUE DE|MORENA|BALAYAGE|ESFUMAD|DESCOLOR|MATIZ|REFLEX|ILUMINAD|ABERTURA DE FUNDO|DECAPAGEM|BLOND|RUIVO/],
  ['Sobrancelha, cílios e depilação', /SOBRANCELHA|CILIO|DEPILA|EPILA|BUCO|HENNA|BROW|LASH|DESIGN|VOLUME BRASILEIRO/],
  ['Tratamentos', /TRATAMENTO|HIDRATA|CRONOGRAMA|FUSIO|RECONS|NUTRI|CAUTERIZ|BOTOX|TERAPIA|AMPOLA|DETOX|REPAIR|TAILORING|GLOSS|BRILHO/],
  ['Alisamento e cachos', /ALISA|PROGRESSIVA|REDUTORA|SELAGEM|RELAXA|CACHOS/],
  ['Barbearia', /BARBERSHOP|BARBA/],
  ['Corte', /CORTE/],
  ['Escova e finalização', /ESCOVA|PENTEADO|BABY ?LISS|PRANCHA/],
  ['Unhas', /UNHA|MANICURE|PEDICURE|ESMALT|\bGEL\b|FIBRA/],
  ['Mega hair e alongamento', /MEGA HAIR|ALONGAMENTO/],
  ['Maquiagem', /MAQUIA|MAKE/],
];
const QUIMICA = /COLORA|LUZES|MECHA|TONALIZ|ALISA|PROGRESSIVA|REDUTORA|DESCOLOR|BLOND|ABERTURA DE FUNDO/;

function agrupar(servicos, regras, outros) {
  const total = servicos.reduce((s, x) => s + x.v, 0) || 1;
  const map = new Map();
  for (const s of servicos) {
    const d = chaveTexto(s.d);
    const nome = (regras.find(([, re]) => re.test(d)) || [outros])[0];
    const g = map.get(nome) || { nome, q: 0, v: 0 };
    g.q += s.q; g.v += s.v;
    map.set(nome, g);
  }
  return [...map.values()]
    .map(g => ({ ...g, pct: g.v / total * 100, medio: g.q ? g.v / g.q : 0, apagado: g.nome === outros || g.nome === 'Sem detalhe' }))
    .filter(g => g.pct >= 0.1)
    .sort((a, b) => b.v - a.v);
}

const beleza = {
  nome: 'Beleza e Bem-Estar',
  mix: dados => agrupar(dados.servicos || [], GRUPOS_BELEZA, 'Outros (a classificar)'),

  // Produção por profissional quando o nome aparece no serviço (ex.: "MECHAS MILENE").
  // Os nomes vêm dos repasses do período e de opcoes.profissionais (sócios que atendem, por exemplo).
  profissionais(dados, opcoes = {}) {
    const servicos = dados.servicos || [];
    const repasses = (dados.repasses || []).filter(r => !r.profissional.startsWith('('));
    const nomes = new Map();
    for (const n of opcoes.profissionais || []) nomes.set(chaveTexto(n).split(' ')[0], n);
    for (const r of repasses) {
      const primeiro = chaveTexto(r.profissional).split(' ')[0];
      if (primeiro.length >= 3 && !nomes.has(primeiro)) nomes.set(primeiro, r.profissional);
    }
    const total = servicos.reduce((s, x) => s + x.v, 0);
    const prod = new Map();
    let atribuido = 0;
    for (const s of servicos) {
      const d = chaveTexto(s.d);
      const hit = [...nomes.keys()].find(n => new RegExp(`\\b${n}\\b`).test(d));
      const chave = hit ? nomes.get(hit) : null;
      const p = prod.get(chave) || { nome: chave, q: 0, v: 0, quimica: 0 };
      p.q += s.q; p.v += s.v;
      if (QUIMICA.test(d)) p.quimica += s.v;
      prod.set(chave, p);
      if (hit) atribuido += s.v;
    }
    if (total > 0 && atribuido / total >= 0.1) {
      const lista = [...prod.values()].filter(p => p.nome).sort((a, b) => b.v - a.v);
      const sem = prod.get(null);
      return {
        modo: 'producao',
        semProfissionalPct: sem ? sem.v / total * 100 : 0,
        itens: [
          ...lista.map(p => ({ nome: nomeCurto(p.nome), v: p.v, detalhe: `${p.q} serviços · média ${brl(p.v / p.q)} · ${Math.round(p.quimica / p.v * 100)}% química` })),
          ...(sem ? [{ nome: 'Sem profissional', v: sem.v, detalhe: `${sem.q} serviços · média ${brl(sem.v / sem.q)}`, apagado: true }] : []),
        ],
      };
    }
    if (!repasses.length) return null;
    const totalRep = repasses.reduce((s, r) => s + r.v, 0);
    const top = repasses.slice(0, 6);
    const resto = repasses.slice(6);
    return {
      modo: 'repasse',
      top5Pct: repasses.slice(0, 5).reduce((s, r) => s + r.v, 0) / totalRep * 100,
      itens: [
        ...top.map(r => ({ nome: nomeCurto(r.profissional), v: r.v, detalhe: 'repasse no período' })),
        ...(resto.length ? [{ nome: `Outros ${resto.length} profissionais`, v: resto.reduce((s, r) => s + r.v, 0), detalhe: 'repasse no período', apagado: true }] : []),
      ],
    };
  },
};

const padrao = {
  nome: null,
  // Sem regras do setor: os 8 itens mais vendidos.
  mix: dados => {
    const servicos = dados.servicos || [];
    const total = servicos.reduce((s, x) => s + x.v, 0) || 1;
    return servicos.slice(0, 8).map(x => ({ nome: x.d, q: x.q, v: x.v, pct: x.v / total * 100, medio: x.q ? x.v / x.q : 0 }));
  },
  profissionais: () => null,
};

const SETORES = [
  [/BELEZA|ESTETICA|SALAO|BARBEARIA|CABELEIREIRO/, beleza],
];

export function moduloSetor(setor) {
  const s = chaveTexto(setor);
  return (SETORES.find(([re]) => re.test(s)) || [null, padrao])[1];
}

// "MARIA JAYANE" -> "Maria J."
export function nomeCurto(n) {
  const p = semAcento(n).toLowerCase().split(' ').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1));
  return p.length > 1 ? `${p[0]} ${p[1][0]}.` : (p[0] || n);
}
