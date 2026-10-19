// Formatação em pt-BR. Todos os valores de entrada estão em centavos.

export const brl = v => 'R$ ' + Math.round(v / 100).toLocaleString('pt-BR');

export const mil = v => {
  const reais = v / 100;
  if (Math.abs(reais) < 1000) return brl(v);
  return (reais < 0 ? '−' : '') + 'R$ ' + (Math.abs(reais) / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mil';
};

export const pct = (v, casas = 1) =>
  (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) + '%';

// Valor em "R$ por R$ 100 de receita"
export const por100 = v => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const mesCurto = iso => { const [a, m] = iso.split('-'); return `${MESES[+m - 1]}/${a.slice(2)}`; };

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
