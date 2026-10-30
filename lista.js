// Seaninho no celular: a lógica da lista de sessões (busca, filtros, fixadas) e do painel da aba Início, sem tela
// (testada no Node: test_lista.cjs). A página desenha; aqui só se decide o que entra e em que ordem.
(function (raiz) {
"use strict";

const PARADA_S = 3600;   // ociosa há mais de 1 h: parada
const ESTADOS = [["esperando", "Esperando você"], ["trabalhando", "Trabalhando"], ["ociosa", "Ociosas"], ["parada", "Paradas"]];
const GRUPOS = ["SZI", "Seaninho", "Pessoais", "Outras"];
const MAX_FIXADAS = 30;

// O estado de uma sessão na lista e no painel: "esperando" (pergunta, enquete ou permissão), "trabalhando",
// "ociosa" (parou há menos de 1 h) ou "parada".
function estadoDe(s, agoraMs) {
  if (s.estado === "perguntando" || s.permissao || s.enquete) return "esperando";
  if (s.estado === "trabalhando") return "trabalhando";
  return agoraMs / 1000 - (s.desde || 0) > PARADA_S ? "parada" : "ociosa";
}

// O grupo pela pasta: C:\dev\SZI\…, C:\dev\Seaninho\…, C:\dev\pessoal\… ou o resto.
function grupoDe(cwd) {
  const c = String(cwd || "").replace(/\//g, "\\").toLowerCase();
  if (/\\dev\\szi(\\|$)/.test(c)) return "SZI";
  if (/\\dev\\seaninho(\\|$)/.test(c)) return "Seaninho";
  if (/\\dev\\pessoal(\\|$)/.test(c)) return "Pessoais";
  return "Outras";
}

// Para buscar sem acento nem caixa: "Sessão" acha "sessao".
function normalizar(t) {
  return String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

// A sessão tem todas as palavras da busca no título, no nome, na pasta, no PC, no lugar ou na última fala?
function combina(s, busca, previa) {
  const termos = normalizar(busca).split(" ").filter(Boolean);
  if (!termos.length) return true;
  const onde = normalizar([s.titulo, s.nome, s.pasta, s.pc, s.onde, s.detalhe, previa].join(" "));
  return termos.every(t => onde.includes(t));
}

const semFiltro = f => !f || !(f.estado || f.pc || f.grupo || f.pasta);

// As sessões que passam nos filtros (um valor por dimensão; vazio = qualquer um) e na busca.
function filtrar(ss, f, busca, previaDe, agoraMs) {
  f = f || {};
  return ss.filter(s => (!f.estado || estadoDe(s, agoraMs) === f.estado) && (!f.pc || s.pc === f.pc)
    && (!f.grupo || grupoDe(s.cwd) === f.grupo) && (!f.pasta || s.pasta === f.pasta)
    && combina(s, busca, previaDe ? previaDe(s) : ""));
}

// As contas do painel e dos chips: total, por estado, por PC, por grupo e por pasta.
function contar(ss, agoraMs) {
  const c = {total: ss.length, esperando: 0, trabalhando: 0, ociosa: 0, parada: 0, porPc: {}, porGrupo: {}, porPasta: {}};
  for (const s of ss) {
    c[estadoDe(s, agoraMs)] += 1;
    c.porPc[s.pc] = (c.porPc[s.pc] || 0) + 1;
    const g = grupoDe(s.cwd);
    c.porGrupo[g] = (c.porGrupo[g] || 0) + 1;
    if (s.pasta) c.porPasta[s.pasta] = (c.porPasta[s.pasta] || 0) + 1;
  }
  return c;
}

// ---- Fixadas (a lista vai inteira para o banco, cel_preferencia "fixadas") -----------------------------
const mesma = (a, b) => a.id === b.id && a.pc === b.pc;
function fixada(fixadas, s) { return (fixadas || []).some(f => mesma(f, s)); }
function alternarFixada(fixadas, s) {
  const lista = (fixadas || []).filter(f => f && f.id);
  if (fixada(lista, s)) return lista.filter(f => !mesma(f, s));
  return [...lista, {pc: s.pc, id: s.id, titulo: String(s.titulo || "").slice(0, 80), pasta: String(s.pasta || "").slice(0, 60)}]
    .slice(-MAX_FIXADAS);
}
function moverFixada(fixadas, i, j) {
  const out = [...(fixadas || [])];
  if (i < 0 || i >= out.length) return out;
  const [x] = out.splice(i, 1);
  out.splice(Math.max(0, Math.min(out.length, j)), 0, x);
  return out;
}
// Cada fixada com a sessão viva dela (ou null: fechada no PC; continua fixada para quando voltar).
function fixadasNaTela(fixadas, ss) {
  return (fixadas || []).filter(f => f && f.id).map(f => ({f, s: ss.find(s => mesma(f, s)) || null}));
}

// ---- Contas do Claude ---------------------------------------------------------------------------------
// "tecnologia.claude148@seazone.com.br" -> "claude148" (o pedaço que muda entre as contas do pool).
function contaCurta(email) {
  const local = String(email || "").split("@")[0];
  const partes = local.split(".").filter(Boolean);
  return partes.length ? partes[partes.length - 1] : local;
}
const nivel = pct => pct >= 95 ? "critico" : pct >= 80 ? "alto" : "";

// ---- Painel ------------------------------------------------------------------------------------------
// Os pedidos que deram erro nas últimas `horas` (mandados pelo celular ou pelo Monitor geral), por PC.
function falhasRecentes(pedidos, agoraMs, horas) {
  const limite = agoraMs - (horas || 24) * 3600 * 1000, out = {};
  for (const p of pedidos || []) {
    if (p.estado !== "erro" || !["claude", "acao"].includes(p.tipo || "claude")) continue;
    if (new Date(p.atualizado_em || p.criado_em).getTime() < limite) continue;
    out[p.pc] = (out[p.pc] || 0) + 1;
  }
  return out;
}

// A aba Hoje numa linha: o próximo compromisso (ou o que está acontecendo) e as tarefas.
function resumoHoje(h, agoraMs, diaIso) {
  const ev = (h && h.agenda || []).filter(e => new Date(e.fim).getTime() > agoraMs)
    .sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)))[0] || null;
  const tarefas = h && h.tarefas || [];
  return {evento: ev, agora: !!ev && new Date(ev.inicio).getTime() <= agoraMs,
          tarefas: tarefas.length, atrasadas: tarefas.filter(t => t.data && t.data < diaIso).length,
          deHoje: tarefas.filter(t => t.data === diaIso).length};
}

// A série de 7 dias do painel (suas mensagens por dia), junta das métricas de todos os PCs e dos PRs.
function serieDosDias(paineis) {
  const dias = {};
  for (const p of paineis || []) {
    for (const d of (p && p.metricas && p.metricas.dias) || []) {
      const x = dias[d.dia] || (dias[d.dia] = {dia: d.dia, eu: 0, claude: 0, sessoes: 0, abertos: 0, mergeados: 0});
      x.eu += d.eu || 0; x.claude += d.claude || 0; x.sessoes += d.sessoes || 0;
    }
  }
  const prs = (paineis || []).map(p => p && p.prs).find(Boolean);   // os PRs são da pessoa: o primeiro PC que tiver
  for (const d of (prs && prs.dias) || []) {
    const x = dias[d.dia] || (dias[d.dia] = {dia: d.dia, eu: 0, claude: 0, sessoes: 0, abertos: 0, mergeados: 0});
    x.abertos = d.abertos || 0; x.mergeados = d.mergeados || 0;
  }
  return Object.values(dias).sort((a, b) => a.dia.localeCompare(b.dia)).slice(-7);
}

// Versões: a maior versão do agente entre os PCs e a que a página conhece; cada PC atrás disso fica marcado.
function compararVersao(a, b) {
  const pa = String(a || "0").split(".").map(Number), pb = String(b || "0").split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

const Lista = {PARADA_S, ESTADOS, GRUPOS, MAX_FIXADAS, estadoDe, grupoDe, normalizar, combina, semFiltro, filtrar, contar,
  fixada, alternarFixada, moverFixada, fixadasNaTela, contaCurta, nivel, falhasRecentes, resumoHoje, serieDosDias,
  compararVersao};
if (typeof module !== "undefined" && module.exports) module.exports = Lista;
else raiz.Lista = Lista;
})(typeof window !== "undefined" ? window : globalThis);
