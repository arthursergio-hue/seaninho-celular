// Seaninho no celular: a seção Computadores (0.9.0), sem tela. O estado de cada PC, o que a folha de desligar avisa,
// quando os botões de energia valem, o "Ligar" e o histórico (testada no Node: test_pcs.cjs). A página desenha.
// Pedido do Arthur pelo celular (02/11/2026): juntar num lugar só os PCs, a saúde e as contas, com ligar e desligar.
(function (raiz) {
"use strict";

const ONLINE_MS = 150000;        // o mesmo online() da página
const DESLIGADO_MS = 600000;     // e o desligadoHa
const PEGAR_MS = 15000;          // o agente olha os pedidos a cada 2,5 s: em 15 s ele já pegou
const NAO_VOLTOU_MS = 6 * 60000; // reiniciou e não deu sinal nisso: "não voltou"
const RECENTE_MS = 10 * 60000;   // o pedido que ainda muda o estado do cartão
const AGENTE_ENERGIA = "0.9.0";
const ACAO = {
  hibernar: {rot: "Hibernar", verbo: "hiberna", ando: "Hibernando", feito: "Hibernado", passado: "hibernou",
             desc: "Guarda tudo. Quando ligar, volta como estava."},
  reiniciar: {rot: "Reiniciar", verbo: "reinicia", ando: "Reiniciando", feito: "Reiniciado", passado: "reiniciou",
              desc: "O Seaninho só volta quando você entrar no Windows."},
  desligar: {rot: "Desligar", verbo: "desliga", ando: "Desligando", feito: "Desligado", passado: "desligou",
             desc: "Fecha tudo. Depois, só liga pelo botão do PC."},
  bloquear: {rot: "Bloquear", verbo: "bloqueia", ando: "Bloqueando", feito: "Bloqueado", passado: "bloqueou",
             desc: "A tela de bloqueio. Tudo continua rodando."},
  forcar: {rot: "Forçar", verbo: "desliga à força", ando: "Forçando", feito: "Forçado", passado: "forçou",
           desc: "Fecha os programas sem salvar."},
};
const EVENTO = {ligou: "Ligou", desligou: "Desligou", caiu: "Caiu (desligou sem avisar)", dormiu: "Dormiu",
  acordou: "Acordou", pediu_desligar: "Desligar pedido", pediu_reiniciar: "Reiniciar pedido",
  pediu_hibernar: "Hibernar pedido", pediu_bloquear: "Bloquear pedido", pediu_forcar_desligar: "Forçar pedido"};
const POR = {celular: "pelo celular", iniciar: "pelo Iniciar", comando: "por um comando",
  "atualização do Windows": "pela atualização do Windows"};

const versaoN = v => String(v || "").split("-")[0].split(".").map(x => parseInt(x, 10) || 0);
function compararVersao(a, b) {
  const x = versaoN(a), y = versaoN(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
}
const energiaDe = p => (p && p.hoje && p.hoje.painel && p.hoje.painel.energia) || {};
const online = (p, agora) => agora - (Date.parse(p && p.visto_em) || 0) < ONLINE_MS;
const json = s => { try { const v = JSON.parse(s || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; } };
const acaoDe = ped => (ped ? json(ped.texto).acao : "") || "";
const doisDig = n => String(n).padStart(2, "0");
const hm = ms => { const d = new Date(ms); return `${doisDig(d.getHours())}:${doisDig(d.getMinutes())}`; };
const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${doisDig(s % 60)}`; };
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const DIA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
function dia(ms, agora) {   // "hoje", "ontem" ou "qui"
  const d = new Date(ms), h = new Date(agora), o = new Date(agora - 86400000);
  if (d.toDateString() === h.toDateString()) return "hoje";
  if (d.toDateString() === o.toDateString()) return "ontem";
  return DIA[d.getDay()];
}
const quando = (ms, agora) => `${dia(ms, agora) === "hoje" ? "" : dia(ms, agora) + " "}${hm(ms)}`;
const ehMaestro = (s, orquestra) => String(s.titulo || "").trim().toUpperCase() === "MAESTRO"
  || !!(orquestra && orquestra.sessao && orquestra.sessao === s.id);

// O pedido de energia mais novo deste PC (o cel_estado traz os do último dia).
function pedidoDe(pedidos, pc) {
  return (pedidos || []).filter(x => x && x.tipo === "energia" && x.pc === pc)
    .sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)))[0] || null;
}
const emCurso = ped => !!ped && ["novo", "escrevendo"].includes(ped.estado);

// O estado do cartão: {k, texto, cor (ok|espera|anda|erro|off), cancelar?, ate?, forcar?, sub?}.
function estado(p, {agora, ped = null, vizinhos = [], dispensado = 0} = {}) {
  const e = energiaDe(p), visto = Date.parse(p.visto_em) || 0, dt = agora - visto, on = dt < ONLINE_MS;
  if (ped) {
    const acao = acaoDe(ped), A = ACAO[acao] || ACAO.desligar;
    const criado = Date.parse(ped.criado_em) || 0, atual = Date.parse(ped.atualizado_em) || criado;
    if (ped.estado === "novo") return agora - criado < PEGAR_MS
      ? {k: "pedindo", texto: "Pedindo ao PC…", cor: "anda", cancelar: true}
      : {k: "nao_pegou", texto: "O PC não pegou o pedido em 15 s: talvez já esteja desligado", cor: "erro", cancelar: true};
    if (ped.estado === "escrevendo") {
      const r = json(ped.resposta);
      if (r.estado === "esperando") return {k: "esperando", cor: "anda", cancelar: true,
        texto: `${A.rot} quando terminarem · ${(r.trabalhando || []).length || 1} trabalhando · até ${hm(r.ate * 1000)}`};
      if (r.estado === "contando") return {k: "contando", cor: "espera", cancelar: true, ate: r.ate * 1000, acao,
        texto: `${A.verbo[0].toUpperCase() + A.verbo.slice(1)} em ${mmss(r.ate * 1000 - agora)}`};
      return {k: "recebido", texto: "O PC recebeu o pedido…", cor: "anda", cancelar: true};
    }
    if (ped.estado === "entregue" && acao !== "bloquear" && agora - atual < RECENTE_MS) {
      const voltou = visto > atual + 20000;
      if (!voltou) {
        if (on && !e.nao_apagou) return {k: "executando", texto: `${A.ando}…`, cor: "anda"};
        if (!on) {
          if (acao === "reiniciar") return agora - atual < NAO_VOLTOU_MS
            ? {k: "reiniciando", texto: "Reiniciando… o Seaninho volta quando você entrar no Windows", cor: "anda"}
            : {k: "nao_voltou", texto: `Reiniciou e não voltou em 6 min (falta entrar no Windows?)`, cor: "erro"};
          return {k: "apagado", texto: `${A.feito} pelo celular às ${hm(atual)}`, cor: "off"};
        }
      }
    }
    if (ped.estado === "cancelado" && agora - atual < 5 * 60000)
      return on ? {k: "cancelado", texto: ped.erro ? ped.erro : "Cancelado pelo celular", cor: "ok"}
        : {k: "cancelado", texto: ped.erro || "Cancelado", cor: "off"};
    if (ped.estado === "erro" && agora - atual < 5 * 60000)
      return {k: "erro", texto: `Não ${A.passado}: ${ped.erro || "o PC não conseguiu"}`, cor: "erro"};
  }
  if (on && e.nao_apagou && e.nao_apagou.t * 1000 > dispensado) {
    const apps = e.nao_apagou.apps || [];
    return {k: "nao_apagou", cor: "erro", forcar: true, texto: `Não ${e.nao_apagou.acao === "reiniciar" ? "reiniciou" : "desligou"}: ${
      apps.length ? `${apps.slice(0, 2).join(" e ")} ${apps.length === 1 ? "está" : "estão"} impedindo` : "um programa segurou"}`};
  }
  if (on) return e.usando ? {k: "em_uso", texto: "Ligado · em uso", cor: "ok"}
    : {k: "ligado", texto: e.bloqueado ? "Ligado · bloqueado" : "Ligado", cor: "ok"};
  if (dt < DESLIGADO_MS) return {k: "sem_sinal", texto: `Sem sinal há ${Math.max(1, Math.round(dt / 60000))} min`, cor: "espera"};
  const ip = ((e.placas || []).find(x => x && x.conectada && x.ip) || {}).ip;
  if (ip && vizinhos.includes(ip)) return {k: "sem_agente", texto: "Ligado, sem o Seaninho", cor: "espera",
    sub: "A rede vê o PC, mas o Seaninho do celular dele está parado."};
  return {k: "desligado", texto: `Desligado · visto ${quando(visto, agora)}`, cor: "off"};
}

// Os IPs que os outros PCs ligados veem na rede (pela ponte de cópias).
const vizinhosDe = (todos, agora) => [...new Set((todos || []).filter(x => online(x, agora)).flatMap(x => energiaDe(x).vizinhos || []))];

// Os botões de energia valem? {ok, motivo}. O motivo aparece no lugar do botão (ele não some).
function podeEnergia(p, {agora, bancoV9, aprovado, rede = true, ped = null} = {}) {
  if (!bancoV9) return {ok: false, motivo: "Chega quando o banco novo (v9) entrar"};
  if (!aprovado) return {ok: false, motivo: "Este celular ainda não pode ligar e desligar os PCs (⚙ Ajustes)"};
  if (rede === false) return {ok: false, motivo: "Sem internet"};
  if (!online(p, agora)) return {ok: false, motivo: "PC sem sinal"};
  if (compararVersao(p.versao, AGENTE_ENERGIA) < 0) return {ok: false, motivo: "Atualize o Seaninho do celular neste PC"};
  if (emCurso(ped)) return {ok: false, motivo: "Já tem um pedido em andamento"};
  return {ok: true, motivo: ""};
}

// O que a folha avisa antes de hibernar, reiniciar ou desligar (só o que valer). {ico, texto, forte?}
function avisosDaFolha(p, {sessoes = [], orquestra = null, acao = "desligar"} = {}) {
  const e = energiaDe(p), out = [];
  const minhas = sessoes.filter(s => s.pc === p.pc && !s.desligado);
  const trab = minhas.filter(s => s.estado === "trabalhando" && !ehMaestro(s, orquestra));
  const luas = minhas.reduce((n, s) => n + (Array.isArray(s.luas) ? s.luas.length : 0), 0) + (e.sem_janela || 0);
  const esperando = minhas.filter(s => s.estado === "perguntando" || s.permissao || s.enquete).length;
  if (trab.length) out.push({ico: "⚙️", forte: true, texto: `Trabalhando: ${trab.slice(0, 3).map(s => s.titulo || "sessão").join(", ")}${
    trab.length > 3 ? ` e mais ${trab.length - 3}` : ""}`});
  if (luas) out.push({ico: "🌙", texto: `${plural(luas, "tarefa", "tarefas")} em segundo plano`});
  if (esperando) out.push({ico: "🔔", texto: `Esperando você: ${esperando}`});
  if (orquestra && orquestra.pc === p.pc) out.push({ico: "🎼", forte: true, texto: "O maestro roda aqui: a orquestra para"});
  if (p.hoje && p.hoje.principal) out.push({ico: "📣", texto: "Os avisos do Seaninho, o AI Rats e as Tarefas Claude saem deste PC"});
  if (e.usando) out.push({ico: "👤", forte: true, texto: "Alguém está usando este PC agora"});
  else if (e.bloqueado) out.push({ico: "🔒", texto: "Bloqueado: ninguém aí vê o aviso da contagem"});
  if ((e.apps || []).length) out.push({ico: "📂", texto: `Aberto: ${e.apps.join(", ")} (pode ter algo sem salvar)`});
  if (e.tomada === false) out.push({ico: "🔋", texto: `Na bateria${e.bateria != null ? ` (${e.bateria}%)` : ""}`});
  if (e.reinicio_pendente && acao !== "hibernar") out.push({ico: "⬆️", texto: "Há atualização do Windows esperando: pode demorar"});
  if (acao === "reiniciar") out.push({ico: "🔑", forte: true, texto: "O Seaninho só volta quando você entrar no Windows aí"});
  else out.push({ico: "⏻", forte: true, texto: "Depois, só liga pelo botão do PC"});
  return out;
}

// Ligar pelo celular: ainda não nesta versão; o cartão diz o que este PC precisaria.
function podeLigar(p) {
  const l = energiaDe(p).ligar || {};
  return {pode: false, agora: "Ligar pelo celular chega numa próxima versão",
          motivo: l.motivo || "O PC ainda não contou se dá para ligar pela rede (agente 0.9.0)", daria: !!l.pode};
}

// Os últimos eventos de energia do PC (o log do Windows mais os pedidos do celular), do mais novo.
function historico(p, agora, n = 5) {
  return (energiaDe(p).historico || []).filter(x => x && EVENTO[x.e] && agora - x.t * 1000 < 7 * 86400000)
    .slice(0, n).map(x => ({quando: quando(x.t * 1000, agora), texto: EVENTO[x.e] + (x.por ? ` ${POR[x.por] || "por " + x.por}` : "")}));
}

const Pcs = {AGENTE_ENERGIA, ACAO, ONLINE_MS, energiaDe, pedidoDe, emCurso, estado, vizinhosDe, podeEnergia,
  avisosDaFolha, podeLigar, historico, mmss, hm, compararVersao, ehMaestro};
if (typeof module !== "undefined" && module.exports) module.exports = Pcs;
raiz.Pcs = Pcs;
})(typeof window !== "undefined" ? window : globalThis);
