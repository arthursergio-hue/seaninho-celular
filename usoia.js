// Seaninho no celular: o uso de IA da semana (0.8.7), como o painel "Seu uso de IA" do Monitor geral do Seaninho Pro,
// somando os PCs como o servidor da Seazone soma (somar_valores do coletor: volumes somam, skills novas pela união dos
// nomes, Organização pela média) e com a faixa pela regra estrita do banda_semana (todos os mínimos da faixa e das de
// baixo; P75 e P100 em tarefas pedem tarefa em 4 dias diferentes). Sem tela (testado no Node: test_usoia.cjs).
(function (raiz) {
"use strict";

const ORDEM = ["tokens_saida", "sessoes_iniciadas", "mensagens", "tarefas_operacionais", "tarefas_internas",
  "skills_novas", "linhas_sistema", "linhas_agente", "cron_jobs", "workflows", "organizacao"];
const ROTULO = {tokens_saida: "Tokens de saída", sessoes_iniciadas: "Sessões", mensagens: "Mensagens",
  tarefas_operacionais: "Tarefas operacionais", tarefas_internas: "Tarefas internas", skills_novas: "Skills novas",
  linhas_sistema: "Código de sistemas", linhas_agente: "Código de agentes", cron_jobs: "Cron jobs",
  workflows: "Workflows", organizacao: "Organização"};
const ESTIMADAS = ["tarefas_operacionais", "tarefas_internas"];
const ESTADOS = ["organizacao"];             // um estado, não um volume: não tem ritmo por dia
const DIAS_BANDAS = ["P75", "P100"], DIAS_MIN = 4;
const BANDAS = ["P0", "P25", "P50", "P75", "P100"];
// A evolução diária (o que o coletor guarda por dia): "linhas" junta o código da sessão e o dos subagentes.
const DIARIAS = [["mensagens", "Mensagens"], ["sessoes_iniciadas", "Sessões"], ["tokens_saida", "Tokens"],
  ["workflows", "Workflows"], ["linhas", "Código"]];

const VIRADA_MS = 24 * 3600 * 1000;   // nas primeiras 24 h da semana nova, a que fechou aparece ao lado (0.8.8)
const num = v => typeof v === "number" && isFinite(v);
const arred1 = v => Math.round(v * 10) / 10;

// As medidas que entram na conta: as da semana mais nova entre os PCs (um PC de outra semana fica de fora).
function daSemana(lista) {
  const boas = (lista || []).filter(u => u && u.valores && u.semana);
  const semana = boas.map(u => u.semana).sort().pop();
  return boas.filter(u => u.semana === semana);
}

// Soma dos PCs (medidas da MESMA semana): {valores, dias} ou null.
function somar(lista) {
  const ok = (lista || []).filter(u => u && u.valores);
  if (!ok.length) return null;
  const valores = {};
  for (const m of ORDEM) {
    const nums = ok.map(u => u.valores[m]).filter(num);
    valores[m] = nums.length ? nums.reduce((a, b) => a + b, 0) : null;
  }
  const contas = ok.map(u => u.valores.skills_novas).filter(num);
  if (ok.every(u => Array.isArray(u.skills))) {   // a mesma skill nos dois PCs conta uma vez
    valores.skills_novas = Math.max(new Set(ok.flatMap(u => u.skills)).size, ...(contas.length ? contas : [0]));
  }
  valores.organizacao = arred1(ok.reduce((t, u) => t + Number(u.valores.organizacao || 0), 0) / ok.length);
  const comDias = ok.filter(u => u.dias_tarefas && Object.keys(u.dias_tarefas).length);
  const dias = comDias.length ? Object.fromEntries(ESTIMADAS.map(m =>
    [m, [...new Set(comDias.flatMap(u => u.dias_tarefas[m] || []))].sort()])) : null;
  return {valores, dias};
}

function bate(valores, dias, m, b, minimo) {
  if ((valores[m] || 0) < minimo) return false;
  return !(dias && ESTIMADAS.includes(m) && DIAS_BANDAS.includes(b) && (dias[m] || []).length < DIAS_MIN);
}

// A faixa atingida, a próxima, o que falta para ela e o que já está cumprido (o banda_semana do coletor).
function banda(valores, dias, regua, bandas = BANDAS, pontos = {}) {
  let atingida = bandas[0];
  for (const b of bandas.slice(1)) {
    if (Object.entries(regua || {}).every(([m, mins]) => !(b in mins) || bate(valores, dias, m, b, mins[b]))) atingida = b;
    else break;
  }
  const i = bandas.indexOf(atingida), proxima = bandas[i + 1] || null;
  const faltas = {}, cumpridas = [];
  if (proxima) for (const m of ORDEM) {
    const mins = (regua || {})[m] || {};
    if (!(proxima in mins)) continue;
    const v = valores[m] || 0;
    if (v < mins[proxima]) faltas[m] = {valor: v, minimo: mins[proxima], falta: mins[proxima] - v};
    else if (!bate(valores, dias, m, proxima, mins[proxima]))
      faltas[m] = {valor: v, minimo: mins[proxima], falta: 0, dias: ((dias || {})[m] || []).length, dias_minimos: DIAS_MIN};
    else cumpridas.push(m);
  }
  return {banda: atingida, pontos: pontos[atingida] ?? 0, proxima, faltas, cumpridas};
}

// Quanto por dia, até o fim da semana (sexta 17h), para bater o que falta: o dia de hoje conta.
function ritmo(falta, fimIso, agoraMs) {
  const fim = Date.parse(fimIso);
  if (!falta || !isFinite(fim) || fim <= agoraMs) return 0;   // a semana já fechou: não há mais "por dia"
  const dias = Math.max(1, Math.ceil((fim - agoraMs) / 86400000));
  return Math.ceil(falta / dias);
}

// A evolução diária da semana, somando os PCs: [{dia, mensagens, sessoes_iniciadas, tokens_saida, workflows, linhas}].
function porDia(lista) {
  const dias = {};
  for (const u of lista || []) for (const [d, v] of Object.entries((u && u.por_dia) || {})) {
    const x = dias[d] = dias[d] || {dia: d, mensagens: 0, sessoes_iniciadas: 0, tokens_saida: 0, workflows: 0, linhas: 0};
    for (const k of ["mensagens", "sessoes_iniciadas", "tokens_saida", "workflows"]) x[k] += Number(v[k] || 0);
    x.linhas += Number(v.linhas_codigo || 0) + Number(v.linhas_codigo_subagente || 0);
  }
  return Object.values(dias).sort((a, b) => a.dia.localeCompare(b.dia));
}

// As semanas anteriores (o que cada agente guardou), somando os PCs, das mais novas para as mais velhas. "fechada": todos
// os PCs têm a medida da semana inteira (o agente 0.8.8 mede de novo até sexta 17h); senão, "medido_em" é a mais velha.
// Um PC que desligou antes da virada (0.8.9) ainda tem a semana velha em "valores": ela entra como a última medida dele,
// para a semana que fechou somar os dois PCs (antes saía "só o SEAZONE192" até o WIN ligar de novo).
function semanas(lista, regua, bandas = BANDAS, pontos = {}) {
  const por = {};
  for (const u of lista || []) for (const s of (u && u.semanas) || []) if (s && s.semana && s.valores)
    (por[s.semana] = por[s.semana] || []).push({...s, pc: u.pc});
  const nova = (lista || []).map(u => u && u.valores && u.semana).filter(Boolean).sort().pop();
  for (const u of lista || []) {
    if (!u || !u.valores || !u.semana || u.semana >= nova || (por[u.semana] || []).some(s => s.pc === u.pc)) continue;
    (por[u.semana] = por[u.semana] || []).push({semana: u.semana, valores: u.valores, skills: u.skills, dias_tarefas: u.dias_tarefas,
      fechada: false, pc: u.pc, medido_em: u.gerado ? new Date(u.gerado * 1000).toISOString() : ""});
  }
  return Object.entries(por).sort((a, b) => b[0].localeCompare(a[0])).map(([semana, itens]) => {
    const t = somar(itens);
    return {semana, valores: t.valores, ...banda(t.valores, t.dias, regua, bandas, pontos), pcs: itens.length,
      nomes: itens.map(s => s.pc), fechada: itens.every(s => s.fechada),
      medido_em: itens.map(s => String(s.medido_em || "")).sort()[0] || ""};
  });
}

// Tudo o que a tela mostra: a soma, a faixa, cada critério contra a próxima faixa (com o ritmo e o valor de cada PC).
function montar(lista, agoraMs) {
  const doPc = daSemana(lista);
  if (!doPc.length) return null;
  const ref = doPc.slice().sort((a, b) => (b.gerado || 0) - (a.gerado || 0))[0];
  const regua = ref.regua || {}, bandas = ref.bandas || BANDAS, pontos = ref.pontos_banda || {};
  const t = somar(doPc), b = banda(t.valores, t.dias, regua, bandas, pontos);
  const topo = bandas[bandas.length - 1];
  const hoje = porDia(doPc).find(d => d.dia === ref.hoje) || null;
  const criterios = ORDEM.map(m => {
    const mins = regua[m] || {}, valor = t.valores[m], meta = b.proxima ? mins[b.proxima] : undefined;
    const falta = b.faltas[m] || null, max = mins[topo] || Math.max(1, ...Object.values(mins));
    const atingida = [...bandas].reverse().find(x => x !== bandas[0] && x in mins && bate(t.valores, t.dias, m, x, mins[x])) || bandas[0];
    return {chave: m, rotulo: ROTULO[m] || m, valor, meta, minimos: mins, faixa: atingida, estimada: ESTIMADAS.includes(m),
      estado: ESTADOS.includes(m), ok: !falta, falta: falta ? falta.falta : 0, dias: falta && "dias" in falta ? falta.dias : null,
      porDia: falta && falta.falta && !ESTADOS.includes(m) ? ritmo(falta.falta, ref.fim, agoraMs) : 0,
      pct: Math.min(100, Math.round(100 * Number(valor || 0) / max)),
      pcs: doPc.map(u => ({pc: u.pc, valor: u.valores[m]}))};
  });
  const anteriores = semanas(lista, regua, bandas, pontos);
  // A virada (sexta 17h): a semana nova começa do zero; nas primeiras 24 h, a que fechou vai ao lado, com a faixa final.
  const comeco = Date.parse(ref.inicio), fechou = anteriores.find(w => w.semana < ref.semana) || null;
  const virada = fechou && agoraMs >= comeco && agoraMs - comeco < VIRADA_MS ? {desde: agoraMs - comeco, fechou} : null;
  if (virada) for (const c of criterios) c.anterior = fechou.valores[c.chave];
  return {semana: ref.semana, numero: String(ref.semana || "").split("-W")[1] || "", inicio: ref.inicio, fim: ref.fim,
    hoje: ref.hoje, medido: Math.max(...doPc.map(u => u.gerado || 0)), pcs: doPc.map(u => u.pc), bandas, pontos,
    ...b, criterios, faltam: Object.keys(b.faltas).length, dias: porDia(doPc), diaHoje: hoje, anteriores, virada,
    encerrada: Date.parse(ref.fim) <= agoraMs,                    // a semana desta medida já fechou (a nova vem já)
    atrasados: (lista || []).filter(u => u && u.valores && u.semana && u.semana < ref.semana).map(u => ({pc: u.pc, semana: u.semana})),
    erros: erros(lista)};
}

// A medida que falhou de verdade (o agente 0.8.8 manda "erro"): diferente da virada, que não é erro.
const erros = lista => (lista || []).filter(u => u && u.erro).map(u => ({pc: u.pc, erro: String(u.erro),
  quando: Number(u.falhou_em || 0), medido: Number(u.gerado || 0), semNumeros: !u.valores}));

// Números como o coletor escreve: tokens em milhões ("50,2 MM"), o resto com ponto de milhar.
function formatar(v, chave) {
  if (!num(v)) return "–";
  if (chave === "tokens_saida" || v >= 1e6) return (v / 1e6).toFixed(1).replace(".", ",") + " MM";
  if (chave === "organizacao") return String(v).replace(".", ",");
  return Math.round(v).toLocaleString("pt-BR");
}

const UsoIa = {ORDEM, ROTULO, ESTIMADAS, ESTADOS, BANDAS, DIARIAS, DIAS_MIN, VIRADA_MS, daSemana, somar, bate, banda, ritmo, porDia,
  semanas, montar, erros, formatar};
if (typeof module !== "undefined" && module.exports) module.exports = UsoIa;
else raiz.UsoIa = UsoIa;
})(typeof window !== "undefined" ? window : globalThis);
