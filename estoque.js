// Seaninho no celular: o Estoque (entrega 4 do Monitor no celular, 13/11; CONTRATO-estoque.md, seções 1.1, 1.2, 2 e 4),
// as skills e os crons dos PCs, como a visão Estoque do Monitor geral. Pedido do Arthur (13/11, 16:58): "quero todas as
// funções do monitor aqui". SÓ DO DONO.
//
// O que chega: a coluna trabalhos de cada PC (cel_trabalhos, só com a tela aberta) com as skills (e o uso de cada uma:
// ultimo_uso, usos_hoje, usos_semana) e as automações (com links e tem_log); e o hoje.painel.automacoes de cada PC (o
// resumo do cel_estado, que a página já tem), que dá a entrada na aba Workflows sem baixar nada e diz que o PC tem o
// agente desta entrega (a capacidade: recebe as ações do Estoque).
//
// Funções puras (testadas no Node: test_estoque.cjs): juntar, filtrar, botoesDoCron, entrada, urlOk, pedidoAcao,
// pedidoLink, lerLog, lerEstado/gravarEstado, porColuna/escolherOrdem/inverter, nomeColuna, o HTML e o acaoDe. A
// junção das listas, o "Rodar agora" e as horas são os do workflows.js (juntarSkills, juntarAutomacoes, rodarAgora,
// tocar, desfazerToque, marcarEnviado, pedidoRodar, horaOuDia), para as duas telas dizerem o mesmo.
//
// A página só liga (index.html):
//   window.EstoqueTela = Estoque.ligar({rpc, esperarPedido, voltaJa, motivoRede, agora: agoraRede, pcs: () => pcs,
//     pedidos: () => pedidos, rede: () => rede, aba: () => aba, ativo: () => !!chave});
//   e chama EstoqueTela.desenhar() a cada desenharWorkflows().
// ligar() devolve {desenhar, abrir, fechar, aberta, carregar} e cria sozinho os elementos: o <style id="estiloEstoque">,
// a tela <div id="estoque"> no fim do body (.ar-topo e .ar-corpo#esCorpo, como as outras telas cheias) e a entrada
// <div id="wfEstoque"> logo depois do #wfTopo. Os toques passam por delegação (acaoDe); o histórico é o #estoque=1 (o ‹
// e o voltar do iPhone fecham; a página aberta com #estoque=1 já abre a tela). O cel_trabalhos só roda com a tela aberta
// e a página visível: ao abrir, a cada 2 min e no ↻ (o banco sem a função, PGRST202: 10 min sem tentar).
(function (raiz) {
"use strict";

let _w = null;
function W() {
  if (_w) return _w;
  if (raiz.Workflows) return (_w = raiz.Workflows);
  return (_w = require("./workflows.js"));
}
let _l = null;
function L() {
  if (_l) return _l;
  if (raiz.Lista) return (_l = raiz.Lista);
  return (_l = require("./lista.js"));
}

const LS = "seaninho.estoque";
const TRAB_MS = 120000;            // o cel_trabalhos com a tela aberta (~25 a 45 KB por PC)
const SEM_FUNCAO_MS = 600000;      // o banco sem o cel_trabalhos: 10 min sem tentar de novo
const ONLINE_MS = 150000, DESLIGADO_MS = 600000;   // os mesmos do workflows.js e da página
const AVISO_MS = 8000, AVISO_ERRO_MS = 15000, RELER_LINK_MS = 15000;
const LINKS_MAX = 4, ROTULO_MAX = 40, URL_MAX = 200, LOG_LINHAS = 20, LINHA_MAX = 300;
const SEMANA_MS = 7 * 86400000;
const ABAS = [["skills", "Skills"], ["crons", "Crons"]];
const GRUPOS = {
  skills: [["todos", "Todos"], ["pc", "Neste PC"], ["time", "Do time"], ["pessoal", "Pessoais"]],
  crons: [["todos", "Todos"], ["com_erro", "Com erro"], ["rodando", "Rodando"], ["paradas", "Paradas"], ["nunca_rodou", "Nunca rodou"],
    ["agendador", "Agendador"], ["processo", "Processos"], ["cron", "Crons do Claude"], ["rotina", "Rotinas"], ["desktop", "Claude Desktop"]]};
const ORDENS = {skills: [["uso", "Uso"], ["nome", "Nome"], ["versao", "Versão"], ["pc", "PC"]],
  crons: [["situacao", "Situação"], ["nome", "Nome"], ["ultima", "Última"], ["proxima", "Próxima"], ["pc", "PC"]]};
// A direção do primeiro toque em cada coluna (o segundo toque no mesmo cabeçalho inverte): o mais usado, a versão mais
// nova e a última execução mais recente no alto; nome e PC de A a Z; a próxima execução mais perto no alto.
const DIR_PADRAO = {uso: "desc", nome: "asc", versao: "desc", pc: "asc", situacao: "asc", ultima: "desc", proxima: "asc"};
const DO_GRUPO = {com_erro: a => a.situacao === "com_erro", rodando: a => a.situacao === "rodando", paradas: a => a.situacao === "parada",
  nunca_rodou: a => a.situacao === "nunca_rodou"};
const ICONE = {agendador: "⏰", processo: "⚙️", cron: "🔁", rotina: "🎼", desktop: "🖥️"};
const SEM_FUNCAO = "O Estoque chega com a atualização do banco (a função cel_trabalhos): por enquanto, só o total na aba Workflows";

// ---- Pequenos ----------------------------------------------------------------------------------------------------
const arr = v => Array.isArray(v) ? v : [];
const objeto = v => !!v && typeof v === "object" && !Array.isArray(v);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const letras = s => [...String(s ?? "")];
const cortar = (s, n) => { const l = letras(s); return l.length > n ? l.slice(0, n - 1).join("").trimEnd() + "…" : l.join(""); };
const umaLinha = (s, n = 300) => cortar(String(s ?? "").replace(/\s+/g, " ").trim(), n);
const inteiro = v => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const porTexto = (a, b) => String(a).localeCompare(String(b), "pt", {sensitivity: "base"});
const porNome = (a, b) => porTexto(a.nome, b.nome);
const mesmoDia = (a, b) => { const x = new Date(a), y = new Date(b); return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate(); };
const normalizar = t => L().normalizar(t);
const combina = (alvo, busca) => { const ts = normalizar(busca).split(" ").filter(Boolean); return !ts.length || ts.every(t => String(alvo || "").includes(t)); };
const semRede = r => r === false || !!(r && typeof r === "object" && r.ok === false);
const listaPcs = pcs => (Array.isArray(pcs) ? pcs : Object.values(pcs || {})).filter(p => p && p.pc);
// A máquina de fila (a VPS) aparece entre os PCs da conta, mas não tem skills, crons nem as ações: a regra do
// Maquinas.ehMaquina da página (a mesma do automacoes.eh_maquina do agente).
function ehMaquina(p) {
  if (raiz.Maquinas && typeof raiz.Maquinas.ehMaquina === "function") return raiz.Maquinas.ehMaquina(p);
  return objeto(p) && (/^kit /.test(String(p.versao || "")) || objeto(p.hoje && p.hoje.maquina) || objeto(p.maquina));
}
const pcsReais = pcs => listaPcs(pcs).filter(p => !ehMaquina(p));
const painelDe = p => (p && p.hoje && objeto(p.hoje.painel) ? p.hoje.painel : {});
// A capacidade: o PC que publica o hoje.painel.automacoes tem o agente desta entrega (recebe as ações do Estoque).
const temEstoque = p => objeto(painelDe(p).automacoes);
const vistoMs = p => { const t = Date.parse(String((p && p.visto_em) || "")); return Number.isFinite(t) ? t : 0; };
const validas = linhas => arr(linhas).filter(l => l && l.pc && objeto(l.trabalhos));
// O nome do PC na coluna estreita: "WIN-EAD6OD66GE7" -> "WIN" (o nomeCurtoPc); o que passa de 6 letras vira a 1ª letra
// mais os dígitos do fim ("SEAZONE192" -> "S192"); sem dígitos no fim, as 5 primeiras e "…".
function nomeColuna(pc) {
  const c = W().nomeCurtoPc(pc);
  if (c.length <= 6) return c;
  const d = (/\d+$/.exec(c) || [""])[0];
  return d && d.length <= 5 ? c[0] + d : c.slice(0, 5) + "…";
}
const curto = pc => W().nomeCurtoPc(pc);
// O caminho que o agente aceita (o caminhoSeguro do workflows.js e o caminho_valido do automacoes.py conferem de novo).
const caminhoOk = c => typeof c === "string" && c.length > 0 && c.length <= 120 && c === c.trim() && !c.includes("..")
  && !/[\u0000-\u001f\u007f"`<>]/.test(c);

// O link que entra (o url_ok do agente, estoque_celular.py): começa com https://, até 200 letras, com o nome do site,
// sem espaço, aspas, crase, barra invertida, < ou >, nem caractere de controle ou invisível.
function urlOk(url) {
  if (typeof url !== "string" || !url.startsWith("https://") || letras(url).length > URL_MAX) return false;
  if (/[\s"'`<>\\]/.test(url) || /[\p{Cc}\p{Cf}]/u.test(url)) return false;
  const auth = url.slice(8).split(/[/?#]/)[0];
  if (auth.includes("@")) return false;   // 2ª revisão do PR #36: nada de usuário e senha na URL (o url_ok do agente)
  const host = auth.replace(/:\d*$/, "");
  return host.length > 0 && !host.startsWith(".");
}
// Os links que vêm no cartão (até 4, só os que passam no urlOk; o rótulo numa linha, até 40).
const linksDe = v => arr(v).filter(l => objeto(l) && urlOk(l.url)).slice(0, LINKS_MAX)
  .map(l => ({rotulo: umaLinha(l.rotulo, ROTULO_MAX) || l.url.slice(8).split(/[/?#]/)[0].replace(/^www\./, ""), url: l.url}));

// ---- O uso das skills ---------------------------------------------------------------------------------------------
// A mesma chave do juntarSkills (o nome sem acento nem caixa; o exemplo à parte): a skill dos dois PCs soma o uso.
const chaveSkill = (nome, exemplo) => normalizar(nome) + (exemplo ? "#exemplo" : "");
// O uso somado entre os PCs: o usos_hoje só do PC cuja ultimo_uso é de hoje no relógio do celular (o PC desligado desde
// ontem traria o "hoje" dele, velho); o usos_semana só do PC com uso nos últimos 7 dias; a ultimo_uso mais nova.
function usosDasSkills(linhas, agora) {
  const m = new Map();
  for (const l of validas(linhas)) for (const s of arr(l.trabalhos.skills)) {
    if (!objeto(s) || !s.nome || (s.tipo && s.tipo !== "skill")) continue;
    const ult = W().ms(s.ultimo_uso);
    if (!ult) continue;
    const k = chaveSkill(s.nome, s.fonte === "exemplo"), u = m.get(k) || {hoje: 0, semana: 0, ultimo: 0};
    if (mesmoDia(ult, agora)) u.hoje += inteiro(s.usos_hoje);
    if (agora - ult < SEMANA_MS) u.semana += inteiro(s.usos_semana);
    u.ultimo = Math.max(u.ultimo, ult);
    m.set(k, u);
  }
  return m;
}
// {hoje, semana, ultimo, nivel: "hoje" | "semana" | "", texto: "hoje 4×" | "semana 3×" | "—", voz}.
function usoDe(u) {
  const x = u || {hoje: 0, semana: 0, ultimo: 0};
  const nivel = x.hoje > 0 ? "hoje" : x.semana > 0 ? "semana" : "";
  const texto = nivel === "hoje" ? `hoje ${x.hoje}×` : nivel === "semana" ? `semana ${x.semana}×` : "—";
  const voz = nivel === "hoje" ? `usada hoje, ${plural(x.hoje, "vez", "vezes")}` : nivel === "semana" ? `usada ${plural(x.semana, "vez", "vezes")} na semana` : "sem uso na semana";
  return {...x, nivel, texto, voz};
}

// ---- Juntar --------------------------------------------------------------------------------------------------------
// linhas: o que o cel_trabalhos devolveu; ctx: {pcs (as linhas do cel_estado), agora, rede, lidoEm, erro, carregando,
// semFuncao}. {skills, crons, pcs (os nomes para o filtro), faixas: {skills, crons}, leitura, erros (crons com erro)}.
function juntar(linhas, ctx = {}) {
  const w = W(), agora = ctx.agora || Date.now(), reais = pcsReais(ctx.pcs), ls = validas(linhas);
  const sk = w.juntarSkills(ls), usos = usosDasSkills(ls, agora);
  const skills = sk.itens.map(s => {
    const k = chaveSkill(s.nome, s.exemplo);
    return {...s, k, uso: usoDe(usos.get(k))};
  });
  const brutos = new Map();
  for (const l of ls) for (const a of arr(l.trabalhos.automacoes))
    if (objeto(a) && (a.caminho || a.chave)) brutos.set(String(a.chave || `${l.pc}|${String(a.caminho || "")}`), a);
  const crons = w.juntarAutomacoes(ls, {pcs: reais, agora}).map((a, i) => {
    const b = brutos.get(a.chave) || {};
    return {...a, i, links: linksDe(b.links), temLog: b.tem_log === true, icone: ICONE[a.origem] || "⏰",
      tarefa: a.origem === "agendador" && a.caminho.startsWith("\\")};
  });
  const nomes = [...new Set([...reais.map(p => p.pc), ...crons.map(a => a.pc), ...skills.flatMap(s => s.pcs)])].filter(Boolean).sort();
  // As faixas do estadoTela do workflows.js (o PC com o agente de antes, o PC desligado, o Agendador que não respondeu,
  // o erro das skills), mais o banco sem o cel_trabalhos, o inventário de exemplo e a rede.
  const faixas = {};
  let leitura = null;
  for (const [aba, wAba] of [["skills", "skills"], ["crons", "automacoes"]]) {
    const t = w.estadoTela({carregando: !!ctx.carregando, erro: ctx.erro || "", rede: ctx.rede || {}, lidoEm: ctx.lidoEm || 0,
      pcs: reais, linhas: ls, agora, aba: wAba});
    const f = [];
    if (ctx.semFuncao) f.push({texto: SEM_FUNCAO, cor: "espera"});
    else if (t.semLista) f.push({texto: t.semLista, cor: "espera"});
    if (t.linha && (t.linha.cor === "espera" || t.linha.cor === "erro"))
      f.push({texto: [t.linha.texto, t.linha.sub].filter(Boolean).join(" · "), cor: t.linha.cor});
    f.push(...t.faixas);
    if (aba === "skills" && sk.faixa) f.push(sk.faixa);
    faixas[aba] = f;
    leitura = t.linha && !["espera", "erro"].includes(t.linha.cor) ? t.linha.texto : "";
  }
  return {skills, crons, pcs: nomes, faixas, leitura, exemplo: sk.exemplo,
    erros: crons.filter(a => a.situacao === "com_erro" && !a.congelado).length};
}

// ---- Ordem e filtros ---------------------------------------------------------------------------------------------
const RANK_USO = {hoje: 2, semana: 1, "": 0};
const DATA = /^\d{4}-\d{2}-\d{2}/;
const cmpVersao = (a, b) => DATA.test(a) && DATA.test(b) ? porTexto(a, b) : W().compararVersao(a, b);
const COLUNAS = {
  skills: {
    uso: [(a, b) => RANK_USO[a.uso.nivel] - RANK_USO[b.uso.nivel] || a.uso.hoje - b.uso.hoje || a.uso.semana - b.uso.semana
      || a.uso.ultimo - b.uso.ultimo, () => false],
    nome: [porNome, () => false],
    versao: [(a, b) => cmpVersao(a.versao, b.versao), s => !s.versao],
    pc: [(a, b) => porTexto(a.pcs[0], b.pcs[0]), s => !s.pcs.length]},
  crons: {
    situacao: [(a, b) => a.i - b.i, () => false],
    nome: [porNome, () => false],
    ultima: [(a, b) => a.ultima - b.ultima, a => !a.ultima],
    proxima: [(a, b) => a.proxima - b.proxima, a => !a.proxima],
    pc: [(a, b) => porTexto(a.pc, b.pc), a => !a.pc]}};
// O que não tem valor na coluna (sem versão, sem próxima) fica no fim nas duas direções; o empate vai pelo nome.
function ordenar(lista, aba, coluna, dir) {
  const [cmp, vazio] = COLUNAS[aba][coluna] || COLUNAS[aba][ORDENS[aba][0][0]], sinal = dir === "asc" ? 1 : -1;
  return [...arr(lista)].sort((a, b) => (vazio(a) - vazio(b)) || sinal * cmp(a, b) || porNome(a, b));
}
// estado: {aba, pc, grupo: {skills, crons}, ordem: {skills, crons}, dir: {skills, crons}, busca}.
// {aba, itens, total, vazio: {texto, limpar} | null}.
function filtrar(m, estado) {
  const e = estado || lerEstado(""), aba = e.aba === "crons" ? "crons" : "skills", pc = e.pc || "", g = e.grupo[aba];
  const lista = aba === "skills" ? arr(m && m.skills) : arr(m && m.crons);
  const doPc = aba === "skills" ? s => !pc || s.pcs.includes(pc) : a => !pc || a.pc === pc;
  const doGrupo = aba === "skills" ? s => g === "todos" || s.onde === g : a => g === "todos" || (DO_GRUPO[g] ? DO_GRUPO[g](a) : a.origem === g);
  const itens = ordenar(lista.filter(x => doPc(x) && doGrupo(x) && combina(x.busca, e.busca)), aba, e.ordem[aba], e.dir[aba]);
  const busca = String(e.busca || "").trim();
  const vazio = itens.length ? null : busca ? {texto: `Nada encontrado para “${busca}”`, limpar: true}
    : lista.length ? {texto: "Nada neste filtro", limpar: true}
    : {texto: aba === "skills" ? "Nenhuma skill publicada pelos PCs ainda" : "Nenhum cron publicado pelos PCs ainda", limpar: false};
  return {aba, itens, total: lista.length, vazio};
}

// ---- O estado da tela (no aparelho; a busca não fica) -----------------------------------------------------------
function lerEstado(texto) {
  let f;
  try { f = JSON.parse(texto || "{}"); } catch { f = {}; }
  f = objeto(f) ? f : {};
  const um = (v, l) => l.some(([k]) => k === v) ? v : l[0][0];
  const de = (campo, aba) => objeto(f[campo]) ? f[campo][aba] : undefined;
  const grupo = {}, ordem = {}, dir = {};
  for (const [aba] of ABAS) {
    grupo[aba] = um(de("grupo", aba), GRUPOS[aba]);
    ordem[aba] = um(de("ordem", aba), ORDENS[aba]);
    dir[aba] = ["asc", "desc"].includes(de("dir", aba)) ? de("dir", aba) : DIR_PADRAO[ordem[aba]];
  }
  return {aba: f.aba === "crons" ? "crons" : "skills", pc: typeof f.pc === "string" ? f.pc.slice(0, 40) : "", grupo, ordem, dir, busca: ""};
}
const gravarEstado = e => JSON.stringify({aba: e.aba, pc: e.pc || "", grupo: e.grupo, ordem: e.ordem, dir: e.dir});
// O toque no cabeçalho: a coluna nova com a direção dela; a mesma coluna de novo inverte.
function porColuna(e, col) {
  const aba = e.aba;
  if (!ORDENS[aba].some(([k]) => k === col)) return e;
  const dir = e.ordem[aba] === col ? (e.dir[aba] === "asc" ? "desc" : "asc") : DIR_PADRAO[col];
  return {...e, ordem: {...e.ordem, [aba]: col}, dir: {...e.dir, [aba]: dir}};
}
// A escolha no "Ordem": a coluna com a direção dela (a mesma coluna fica como estava).
const escolherOrdem = (e, col) => e.ordem[e.aba] === col ? e : porColuna(e, col);
const inverter = e => ({...e, dir: {...e.dir, [e.aba]: e.dir[e.aba] === "asc" ? "desc" : "asc"}});
function mudarFiltro(e, nome, valor) {
  if (nome === "pc") return {...e, pc: String(valor || "").slice(0, 40)};
  if (nome === "grupo") return GRUPOS[e.aba].some(([k]) => k === valor) ? {...e, grupo: {...e.grupo, [e.aba]: valor}} : e;
  if (nome === "ordem") return escolherOrdem(e, valor);
  return e;
}

// ---- A entrada na aba Workflows (só o hoje.painel.automacoes: nada a mais do banco) --------------------------------
function entrada(pcs) {
  const com = pcsReais(pcs).filter(temEstoque);
  const soma = k => com.reduce((n, p) => n + inteiro(painelDe(p).automacoes[k]), 0);
  const total = soma("total"), comErro = soma("com_erro");
  const resumo = !com.length ? "os PCs ainda não publicam" : `${plural(total, "cron", "crons")}${comErro ? ` · ${comErro} com erro` : ""}`;
  return {total, comErro, pcs: com.map(p => p.pc), resumo, voz: `Estoque: skills e crons dos PCs. ${resumo}. Abrir`};
}

// Onde tirar um link (2ª revisão do PR #36): os da tarefa do Agendador ficam no estoque do PC (o Monitor geral tira);
// os dos extras (processo:, cron:…), que o Monitor não mostra, no arquivo de descrições
const ondeTirar = a => String((a && a.caminho) || "").startsWith("\\") ? "no Monitor geral do PC" : "no arquivo de descrições do PC";

// ---- Os botões do cron -----------------------------------------------------------------------------------------
// ctx: {agora, rede, pcs, toque (o do Rodar, na página), pedidos, linhas, emVoo: {"<acao>|<chave>": true}}.
// {rodar, agendador, log, link}: cada um {ok, motivo, texto, mostra}; o rodar leva a etapa do rodarAgora.
function botoesDoCron(a, ctx = {}) {
  const w = W(), agora = ctx.agora || Date.now(), reais = pcsReais(ctx.pcs);
  const r = w.rodarAgora(a, {agora, rede: ctx.rede === undefined ? true : ctx.rede, pcs: reais, toque: ctx.toque || null,
    pedidos: arr(ctx.pedidos), linhas: arr(ctx.linhas)});
  const p = reais.find(x => x.pc === a.pc) || null, nome = curto(a.pc);
  // revisão do PR #36: o agente só faz as ações do Estoque para um celular aprovado, como o ⚡ Rodar no PC; o sinal dele
  // (hoje.painel.rodar = {ligado, motivo}: sem a v9 no banco ou sem celular aprovado) desliga os botões com o motivo
  const sinalDe = q => q && objeto(painelDe(q).rodar) && painelDe(q).rodar.ligado === false
    ? umaLinha(painelDe(q).rodar.motivo, 200) || "Desligado neste PC" : "";
  const desligadoNoPc = sinalDe(p);
  // o ▶ Rodar vai ao PC do maestro (é ele que confere o pedido): o sinal dele; sem o maestro na lista, o do PC daqui
  const m = w.maestroDe ? w.maestroDe(reais) : null;
  const desligadoRodar = (m && reais.find(x => x.pc === (m.pc || m))) ? sinalDe(reais.find(x => x.pc === (m.pc || m))) : desligadoNoPc;
  const geral = () => semRede(ctx.rede) ? "Sem internet"
    : !p || agora - vistoMs(p) >= DESLIGADO_MS ? `O ${nome} está desligado`
    : agora - vistoMs(p) >= ONLINE_MS ? `O ${nome} está sem sinal`
    : !temEstoque(p) ? `Atualize o Seaninho do celular no ${nome}`
    : desligadoNoPc ? desligadoNoPc
    : !caminhoOk(a.caminho) ? "O nome desta automação tem sinais que o PC não aceita" : "";
  const voo = k => !!(ctx.emVoo && ctx.emVoo[`${k}|${a.chave}`]);
  const ag = !a.tarefa ? "Só as tarefas do Agendador abrem no Agendador" : a.pessoal ? "Pessoal: abra no próprio PC"
    : geral() || (voo("agendador") ? "Abrindo o Agendador…" : "");
  const lg = !a.temLog ? "Esta automação não tem log no arquivo de descrições" : geral() || (voo("log") ? "Lendo o log…" : "");
  const lk = geral() || (arr(a.links).length >= LINKS_MAX ? `Já tem ${LINKS_MAX} links; tire um ${ondeTirar(a)}`
    : voo("link") ? "Guardando o link…" : "");
  const b = (texto, motivo, mostra = true) => ({ok: !motivo, motivo, texto, mostra});
  const rodarMotivo = r.botao.ok && desligadoRodar ? desligadoRodar : r.botao.motivo || "";
  return {desligado: desligadoRodar,   // o clique no ▶ Rodar confere antes de contar o toque (revisão do PR #36)
    rodar: {ok: r.botao.ok && !desligadoRodar, motivo: rodarMotivo, texto: "▶ Rodar", mostra: true, etapa: r},
    agendador: b("🗓 Agendador", ag, !!a.tarefa), log: b("📄 Log", lg, !!a.temLog), link: b("+ link", lk)};
}

// ---- Os pedidos ao PC (cel_pedir tipo "acao"; o agente confere tudo de novo) ------------------------------------
const pedidoAcao = (acao, a, extra = {}) => ({pc: a.pc, tipo: "acao", texto: JSON.stringify({acao, pc: a.pc, caminho: a.caminho, ...extra})});
// O "+ link": {pedido} ou {erro} (nada sai). O rótulo vazio o PC troca pelo nome do site.
function pedidoLink(a, rotulo, url) {
  const r = umaLinha(rotulo, 1000), u = String(url ?? "").trim();
  if (!urlOk(u)) return {erro: "O link precisa começar com https:// (até 200 letras)."};
  if (letras(r).length > ROTULO_MAX) return {erro: `O rótulo tem até ${ROTULO_MAX} letras.`};
  if (arr(a.links).length >= LINKS_MAX && !arr(a.links).some(l => l.url === u)) return {erro: `Essa automação já tem ${LINKS_MAX} links; tire um ${ondeTirar(a)}.`};
  return {pedido: pedidoAcao("automacao_link", a, {rotulo: r, url: u})};
}
// A resposta do 📄 Log ({"log": {nome, em, linhas, mais}}) -> {nome, em (ms), linhas, mais} ou null.
function lerLog(texto) {
  let j;
  try { j = JSON.parse(String(texto ?? "")); } catch { return null; }
  const l = objeto(j) ? j.log : null;
  if (!objeto(l) || !Array.isArray(l.linhas)) return null;
  return {nome: umaLinha(l.nome, 120), em: W().ms(l.em), mais: l.mais === true,
    linhas: l.linhas.filter(x => typeof x === "string").slice(-LOG_LINHAS).map(x => cortar(x.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ""), LINHA_MAX))};
}

// ---- O HTML (tudo que vem do PC passa por esc; link só https, com rel="noopener noreferrer") ---------------------
function htmlEntrada(e) {
  return `<button type="button" class="es-entrada${e.comErro ? " erro" : ""}" data-es-abrir aria-label="${esc(e.voz)}">`
    + `<span class="es-en-t"><b>📦 Estoque</b> · skills e crons dos PCs</span><span class="es-en-r">${esc(e.resumo)} ›</span></button>`;
}
function htmlAbas(m, e) {
  return `<div class="es-abas" role="tablist" aria-label="Skills ou crons">${ABAS.map(([k, t]) => {
    const on = e.aba === k, n = k === "skills" ? m.skills.length : m.crons.length;
    return `<button type="button" role="tab" class="es-aba${on ? " on" : ""}" data-es-aba="${k}" aria-selected="${on}">${t} <b>${n}</b>${
      k === "crons" && m.erros ? ` <i class="es-n-erro" aria-label="${m.erros} com erro">${m.erros}</i>` : ""}</button>`;
  }).join("")}</div>`;
}
function htmlFiltros(m, e) {
  const sel = (nome, rot, opcoes, valor) => `<label class="es-sel"><span>${rot}</span><select data-es-sel="${nome}">${
    opcoes.map(([k, t]) => `<option value="${esc(k)}"${k === valor ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
  const nomes = e.pc && !m.pcs.includes(e.pc) ? [...m.pcs, e.pc] : m.pcs, d = e.dir[e.aba];
  return `<div class="es-filtros">${sel("pc", "PC", [["", "Todos"], ...nomes.map(pc => [pc, curto(pc)])], e.pc)}${
    sel("grupo", "Grupo", GRUPOS[e.aba], e.grupo[e.aba])}${sel("ordem", "Ordem", ORDENS[e.aba], e.ordem[e.aba])}`
    + `<button type="button" class="es-dir" data-es-dir aria-label="Inverter a ordem (agora ${d === "asc" ? "crescente" : "decrescente"})">${d === "asc" ? "↑" : "↓"}</button></div>`;
}
const htmlFaixas = fs => arr(fs).map(f => `<p class="es-faixa ${esc(f.cor || "")}" role="status">${esc(f.texto)}</p>`).join("");
const versaoCurta = s => s.versao ? (DATA.test(s.versao) ? `${s.versao.slice(8, 10)}/${s.versao.slice(5, 7)}` : cortar(/^\d/.test(s.versao) ? "v" + s.versao : s.versao, 9))
  : DATA.test(String(s.data || "")) ? `${s.data.slice(8, 10)}/${s.data.slice(5, 7)}` : "—";
function detalheSkill(s, agora) {
  const porPc = Object.entries(s.porPc || {}).filter(([, v]) => v).map(([pc, v]) => `${curto(pc)} ${v}`).join(" · ");
  const uso = s.uso.ultimo ? `${s.uso.voz} · última ${W().horaOuDia(s.uso.ultimo, agora)}` : s.uso.voz;
  const dd = (rot, v) => v ? `<dt>${rot}</dt><dd>${esc(v)}</dd>` : "";
  return `<div class="es-sk-det"><p>${esc(s.faz || "Sem descrição")}</p><dl>${dd("Onde", s.onde_texto || "—")}${
    dd("Versão", [s.versaoTexto, porPc && Object.keys(s.porPc).length > 1 ? porPc : ""].filter(Boolean).join(" · ") || "—")}${
    dd("Uso", uso)}${dd("Com quem", [s.compartilhada, s.desatualizada, s.desatualizadaAqui].filter(Boolean).join(" · "))}${
    dd("Pasta", s.caminho)}</dl></div>`;
}
function htmlSkills(itens, e, ctx = {}) {
  const abertas = ctx.abertas || new Set(), d = e.dir.skills;
  const cab = `<div class="es-cab es-grade" role="row">${ORDENS.skills.map(([k, t]) => {
    const on = e.ordem.skills === k;
    return `<button type="button" class="es-col es-col-${k}${on ? " on" : ""}" data-es-col="${k}" aria-sort="${on ? (d === "asc" ? "ascending" : "descending") : "none"}">${t}${on ? (d === "asc" ? " ▲" : " ▼") : ""}</button>`;
  }).join("")}</div>`;
  const linhas = itens.map(s => {
    const aberta = abertas.has(s.k), pc = s.pcs.length ? nomeColuna(s.pcs[0]) + (s.pcs.length > 1 ? `+${s.pcs.length - 1}` : "") : "—";
    const voz = [`Skill ${s.nome}`, s.versaoTexto, s.uso.voz, s.pcs.length ? `no ${s.pcs.join(" e ")}` : s.onde_texto].filter(Boolean).join(", ");
    return `<div class="es-sk-item" role="listitem"><button type="button" class="es-sk es-grade uso-${s.uso.nivel || "nada"}" data-es-skill="${esc(s.k)}" aria-expanded="${aberta}" aria-label="${esc(voz)}">`
      + `<span class="es-barra" aria-hidden="true"></span><span class="es-sk-nome">${esc(s.nome)}${s.exemplo ? " <small>(exemplo)</small>" : ""}</span>`
      + `<span class="es-sk-v">${esc(versaoCurta(s))}</span><span class="es-sk-uso">${esc(s.uso.texto)}</span>`
      + `<span class="es-sk-pc" title="${esc(s.pcs.join(", "))}">${esc(pc)}</span></button>${aberta ? detalheSkill(s, ctx.agora || Date.now()) : ""}</div>`;
  }).join("");
  return `${cab}<div class="es-sks" role="list">${linhas}</div>`;
}
function cartaoCron(a, ctx = {}) {
  const b = botoesDoCron(a, {...ctx, toque: (ctx.toques || {})[a.chave] || null}), et = b.rodar.etapa;
  const and = et && et.texto ? `<div class="es-and ${esc(et.cor)}" role="status">${esc(et.texto)}${et.etapa === "tocado"
    ? ` <button type="button" class="es-desfazer" data-es-desfazer="${esc(a.chave)}">Desfazer</button>` : ""}</div>` : "";
  const botao = (k, x) => !x.mostra ? "" : `<button type="button" class="es-b${x.ok ? "" : " off"}" data-es-${k}="${esc(a.chave)}"${
    x.ok ? "" : ` aria-disabled="true"`}${x.motivo ? ` title="${esc(x.motivo)}"` : ""}>${esc(x.texto)}</button>`;
  const porques = [...new Set(["rodar", "agendador", "log", "link"].map(k => b[k]).filter(x => x.mostra && !x.ok && x.motivo).map(x => x.motivo))];
  const links = a.links.length ? `<div class="es-links">${a.links.map(l => `<a class="es-link" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.rotulo)} ↗</a>`).join("")}</div>` : "";
  return `<article class="es-cron st-${esc(a.chip.cor)}" data-es-cron="${esc(a.chave)}" aria-label="${esc(a.voz)}">`
    + `<div class="es-c1"><span class="es-ico" aria-hidden="true">${a.icone}</span><b class="es-nome">${esc(a.nome)}</b>`
    + `<span class="es-chip ${esc(a.chip.cor)}">${esc(a.chip.texto)}</span><span class="es-pc" title="${esc(a.pc)}">${esc(nomeColuna(a.pc))}</span></div>`
    + `${a.faz ? `<div class="es-faz">${esc(a.faz)}</div>` : ""}<div class="es-c2">${esc([a.ultimaTexto, a.proximaTexto].filter(Boolean).join(" · "))}</div>`
    + `${a.log ? `<div class="es-logl${a.logErro ? " erro" : ""}">${esc(a.log)}</div>` : ""}${links}${and}`
    + `<div class="es-bts">${botao("rodar", b.rodar)}${botao("agendador", b.agendador)}${botao("log", b.log)}${botao("link", b.link)}</div>`
    + `${porques.length ? `<p class="es-porque">${esc(porques.join(" · "))}</p>` : ""}</article>`;
}
// A lista da aba (com o "M de N" quando um filtro tira algo, ou o vazio com Ver tudo). ctx: o dos botões + {abertas,
// toques, carregando}.
function htmlLista(m, e, ctx = {}) {
  const f = filtrar(m, e);
  if (ctx.carregando && !f.total) return `<div class="es-vazio"><span><i class="es-roda" aria-hidden="true"></i> Lendo o Estoque dos PCs…</span></div>`;
  if (f.vazio) return `<div class="es-vazio"><b>${esc(f.vazio.texto)}</b>${f.vazio.limpar ? `<button type="button" class="es-b" data-es-ver-tudo>Ver tudo</button>` : ""}</div>`;
  const conta = f.itens.length < f.total ? `<p class="es-conta">${f.itens.length} de ${plural(f.total, f.aba === "skills" ? "skill" : "cron", f.aba === "skills" ? "skills" : "crons")}</p>` : "";
  return conta + (f.aba === "skills" ? htmlSkills(f.itens, e, ctx) : f.itens.map(a => cartaoCron(a, ctx)).join(""));
}
function htmlFolhaLog(f, a, agora = Date.now()) {
  const nome = a ? a.nome : "Automação", pc = a ? curto(a.pc) : "PC";
  let corpo;
  if (f.fase === "pedindo") corpo = `<p class="es-f-meta"><i class="es-roda" aria-hidden="true"></i> Pedindo as últimas linhas ao ${esc(pc)}…</p>`;
  else if (f.fase === "erro") corpo = `<p class="es-f-erro" role="alert">⚠ ${esc(f.erro)}</p>`;
  else {
    const l = f.log;
    corpo = `<p class="es-f-meta">${esc(l.nome)}${l.em ? ` · ${esc(W().horaOuDia(l.em, agora))}` : ""}</p>${l.mais ? `<p class="es-f-meta">… o arquivo tem linhas mais velhas</p>` : ""}`
      + `<pre class="es-log">${esc(l.linhas.join("\n")) || "(o log está vazio)"}</pre>`;
  }
  return `<div class="es-folha" role="dialog" aria-modal="true" aria-labelledby="esFolhaT"><div class="es-f-cab"><b id="esFolhaT">📄 Log · ${esc(nome)}</b>`
    + `<button type="button" class="es-f-x" data-es-fechar-folha aria-label="Fechar o log">✕</button></div>${corpo}</div>`;
}
function htmlFolhaLink(f, a) {
  if (!a) return `<div class="es-folha" role="dialog" aria-modal="true"><div class="es-f-cab"><b>+ link</b><button type="button" class="es-f-x" data-es-fechar-folha aria-label="Fechar">✕</button></div><p class="es-f-erro" role="alert">⚠ Essa automação saiu da lista</p></div>`;
  return `<form class="es-folha" data-es-form-link="${esc(a.chave)}" role="dialog" aria-modal="true" aria-labelledby="esFolhaT" novalidate>`
    + `<div class="es-f-cab"><b id="esFolhaT">+ link · ${esc(a.nome)}</b><button type="button" class="es-f-x" data-es-fechar-folha aria-label="Cancelar">✕</button></div>`
    + `<label class="es-f-rot" for="esLinkRotulo">Rótulo <small>(opcional: vazio vira o nome do site)</small></label>`
    + `<input id="esLinkRotulo" class="es-campo" maxlength="${ROTULO_MAX}" autocomplete="off" value="${esc(f.rotulo || "")}">`
    + `<label class="es-f-rot" for="esLinkUrl">Endereço</label>`
    + `<input id="esLinkUrl" class="es-campo" type="url" inputmode="url" placeholder="https://" maxlength="${URL_MAX}" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(f.url || "")}">`
    + `${f.erro ? `<p class="es-f-erro" role="alert">⚠ ${esc(f.erro)}</p>` : ""}`
    + `<p class="es-f-meta">O link fica no estoque do ${esc(curto(a.pc))} (o mesmo do Monitor geral) e aparece no cartão. Tirar um link: no Monitor geral.</p>`
    + `<div class="es-f-bts"><button type="button" class="es-b" data-es-fechar-folha>Cancelar</button><button type="submit" class="es-b ouro" data-es-guardar-link="${esc(a.chave)}">Guardar</button></div></form>`;
}

// O que um toque pede, pelo elemento tocado: {acao, valor?, off?} ou null. off: o botão cinza (a tela diz o porquê).
const ATRS = [["esAbrir", "abrir"], ["esVoltar", "voltar"], ["esAtualizar", "atualizar"], ["esAba", "aba"], ["esCol", "col"],
  ["esDir", "dir"], ["esSkill", "skill"], ["esRodar", "rodar"], ["esDesfazer", "desfazer"], ["esAgendador", "agendador"],
  ["esLog", "log"], ["esLink", "link"], ["esFecharFolha", "fecharFolha"], ["esLimpar", "limpar"], ["esVerTudo", "verTudo"]];
const SELETOR = ATRS.map(([k]) => `[data-${k.replace(/[A-Z]/g, c => "-" + c.toLowerCase())}]`).join(",");
function acaoDe(el) {
  const n = el && el.closest ? el.closest(SELETOR) : null;
  if (!n || !n.dataset || n.disabled) return null;
  for (const [k, acao] of ATRS) if (n.dataset[k] !== undefined) {
    const off = n.getAttribute && n.getAttribute("aria-disabled") === "true";
    return {acao, ...(n.dataset[k] ? {valor: n.dataset[k]} : {}), ...(off ? {off: true} : {})};
  }
  return null;
}

// ---- O CSS (prefixo es-; as variáveis da página; nada passa de 390 px; alvos de 40 px) ----------------------------
const CSS = `
#estoque{position:fixed;inset:0;z-index:6;display:flex;flex-direction:column;padding-left:var(--esq,0px);padding-right:var(--dir,0px);color:var(--ink);
  background:#050C24 var(--ceu,linear-gradient(170deg,#0E224A,#08142E 60%)) 0 0/100vw auto no-repeat}
#estoque .ar-topo button{width:44px;height:44px;flex:none}
#estoque .ar-topo b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#estoque .ar-corpo{padding-bottom:calc(var(--bottom,0px) + 24px);overscroll-behavior:contain;min-width:0}
body.es-aberta #appAviso{z-index:8}
.es-entrada{display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px;width:100%;min-height:48px;margin:0 0 12px;padding:8px 14px;border-radius:14px;background:var(--glass);border:1px solid var(--stroke);color:var(--ink);text-align:left}
.es-entrada.erro{border-color:rgba(255,90,79,.45)}
.es-en-t{flex:1 1 auto;min-width:0;font-size:14.5px;color:var(--muted)}
.es-en-t b{color:var(--ink);font-weight:650}
.es-en-r{flex:none;font-size:13px;font-weight:650;color:var(--gold-2,#F6D77E);white-space:nowrap}
.es-entrada.erro .es-en-r{color:var(--tag-erro,#FFA49C)}
.es-abas{display:flex;gap:6px;margin:0 0 10px}
.es-aba{flex:1;min-width:0;min-height:44px;padding:0 10px;border-radius:999px;background:var(--glass);border:1px solid var(--stroke);color:var(--muted);font-size:15px;font-weight:600}
.es-aba b{font-weight:500;opacity:.85;font-variant-numeric:tabular-nums}
.es-aba.on{background:rgba(226,184,74,.16);border-color:rgba(226,184,74,.5);color:var(--gold-2,#F6D77E)}
.es-n-erro{display:inline-block;min-width:20px;padding:0 6px;border-radius:999px;background:var(--tag-erro-f,rgba(255,90,79,.17));color:var(--tag-erro,#FFA49C);font-style:normal;font-size:12px;font-weight:700}
.es-busca{position:relative;margin:0 0 8px}
.es-busca input{display:block;width:100%;min-height:44px;padding:0 44px 0 14px;border-radius:12px;border:1px solid var(--stroke-2);background:var(--glass-2);color:var(--ink);font-size:16px}
.es-limpar{position:absolute;right:2px;top:2px;width:40px;height:40px;border-radius:10px;color:var(--muted)}
.es-filtros{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.25fr) minmax(0,1.1fr) 44px;gap:6px;align-items:end;margin:0 0 10px}
.es-sel{display:flex;flex-direction:column;gap:2px;min-width:0;font-size:11px;font-weight:650;color:var(--faint,#6B7A99);text-transform:uppercase;letter-spacing:.4px}
.es-sel select{width:100%;min-width:0;min-height:40px;padding:0 6px;border-radius:10px;border:1px solid var(--stroke-2);background:var(--glass-2);color:var(--ink);font-size:14px;text-transform:none;letter-spacing:0}
.es-sel option{background:#10264F;color:var(--ink)}
.es-dir{width:44px;min-height:40px;border-radius:10px;background:var(--glass-2);border:1px solid var(--stroke-2);color:var(--ink);font-size:18px}
.es-leitura{margin:0 2px 8px;font-size:12.5px;color:var(--faint,#6B7A99)}
.es-leitura:empty{display:none}
.es-faixa{margin:0 0 8px;padding:9px 12px;border-radius:12px;font-size:13.5px;line-height:1.35;background:rgba(226,184,74,.1);border:1px solid rgba(226,184,74,.35);color:var(--gold-2,#F6D77E);overflow-wrap:anywhere}
.es-faixa.off{background:var(--glass);border-color:var(--stroke-2);color:var(--muted)}
.es-faixa.erro{background:rgba(255,90,79,.09);border-color:rgba(255,90,79,.35);color:var(--tag-erro,#FFA49C)}
.es-aviso{margin:0 0 10px;padding:9px 12px;border-radius:12px;font-size:14px;background:var(--glass);border:1px solid var(--stroke-2);color:var(--ink);overflow-wrap:anywhere}
.es-aviso:empty{display:none}
.es-aviso.ok{border-color:rgba(72,214,128,.45);color:var(--tag-ok,#86E8AE)}
.es-aviso.erro{border-color:rgba(255,90,79,.45);color:var(--tag-erro,#FFA49C)}
.es-conta{margin:0 2px 6px;font-size:12.5px;color:var(--muted)}
.es-grade{display:grid;grid-template-columns:4px minmax(0,1fr) 54px 70px 46px;align-items:center;gap:8px}
.es-cab{position:sticky;top:-14px;z-index:1;background:rgba(5,12,36,.94);border-bottom:1px solid var(--stroke)}
.es-col{min-width:0;min-height:40px;padding:0 2px;font-size:11.5px;font-weight:650;color:var(--muted);text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:uppercase;letter-spacing:.3px}
.es-col.on{color:var(--gold-2,#F6D77E)}
.es-col-nome{grid-column:2;grid-row:1}
.es-col-versao{grid-column:3;grid-row:1}
.es-col-uso{grid-column:4;grid-row:1}
.es-col-pc{grid-column:5;grid-row:1}
.es-sk-item{border-bottom:1px solid var(--stroke)}
.es-sk{width:100%;min-height:46px;padding:6px 0;text-align:left;color:var(--ink)}
.es-barra{align-self:stretch;min-height:30px;border-radius:3px;background:transparent}
.uso-hoje .es-barra{background:var(--gold)}
.uso-semana .es-barra{background:rgba(226,184,74,.38)}
.es-sk-nome{min-width:0;font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.es-sk-nome small{font-weight:400;color:var(--muted)}
.es-sk-v,.es-sk-uso,.es-sk-pc{min-width:0;font-size:13px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.uso-hoje .es-sk-uso{color:var(--gold-2,#F6D77E);font-weight:650}
.es-sk-pc{font-weight:650}
.es-sk-det{margin:0 0 10px 12px;padding:10px 12px;border-radius:12px;background:var(--glass);border:1px solid var(--stroke);font-size:13.5px;color:var(--muted);overflow-wrap:anywhere}
.es-sk-det p{margin:0 0 6px;color:var(--ink)}
.es-sk-det dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 10px;margin:0}
.es-sk-det dt{font-weight:650;color:var(--faint,#6B7A99)}
.es-sk-det dd{margin:0;min-width:0}
.es-cron{display:flex;flex-direction:column;gap:6px;padding:12px;margin:0 0 10px;border-radius:16px;background:var(--glass);border:1px solid var(--stroke);border-left:4px solid var(--stroke-2);min-width:0}
.es-cron.st-erro{border-left-color:#FF5A4F}
.es-cron.st-anda{border-left-color:#7FD3FF}
.es-cron.st-ok{border-left-color:#48D680}
.es-c1{display:flex;align-items:center;gap:8px;min-width:0}
.es-ico{flex:none}
.es-nome{flex:1;min-width:0;font-size:15.5px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.es-chip{flex:none;padding:2px 8px;border-radius:999px;font-size:11.5px;font-weight:700;white-space:nowrap;background:var(--glass-2);color:var(--muted)}
.es-chip.ok{background:var(--tag-ok-f);color:var(--tag-ok)}
.es-chip.erro{background:var(--tag-erro-f);color:var(--tag-erro)}
.es-chip.anda{background:var(--tag-anda-f);color:var(--tag-anda)}
.es-chip.espera{background:var(--tag-espera-f);color:var(--tag-espera)}
.es-pc{flex:none;padding:1px 7px;border-radius:6px;background:var(--glass-2);font-size:12px;font-weight:650;color:var(--muted)}
.es-faz,.es-c2{font-size:13px;color:var(--muted);overflow-wrap:anywhere}
.es-logl{font:12px/1.35 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.es-logl.erro{color:var(--tag-erro,#FFA49C)}
.es-links{display:flex;flex-wrap:wrap;gap:6px;min-width:0}
.es-link{display:inline-flex;align-items:center;min-height:40px;max-width:100%;padding:0 12px;border-radius:999px;background:var(--glass-2);border:1px solid var(--stroke);color:#7FD3FF;font-size:13px;font-weight:600;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.es-and{display:flex;align-items:center;flex-wrap:wrap;gap:8px;font-size:13.5px;color:var(--tag-anda,#A5DBFF);overflow-wrap:anywhere}
.es-and.ok{color:var(--tag-ok,#86E8AE)}
.es-and.erro{color:var(--tag-erro,#FFA49C)}
.es-desfazer{min-height:40px;padding:0 12px;border-radius:10px;background:var(--glass-2);border:1px solid var(--stroke-2);color:var(--ink);font-weight:650}
.es-bts{display:flex;flex-wrap:wrap;gap:6px}
.es-b{flex:1 1 auto;min-height:40px;padding:0 12px;border-radius:12px;background:var(--glass-2);border:1px solid var(--stroke);color:var(--ink);font-size:14px;font-weight:650;white-space:nowrap}
.es-b.off{opacity:.45}
.es-b.ouro{background:var(--gold);border-color:var(--gold);color:var(--navy)}
.es-porque{margin:0;font-size:12.5px;color:var(--faint,#6B7A99);overflow-wrap:anywhere}
.es-vazio{display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:16px;border-radius:16px;background:var(--glass);border:1px dashed var(--stroke);color:var(--muted);font-size:14px}
.es-vazio b{color:var(--ink)}
.es-vazio .es-b{flex:none}
.es-folha-fundo{position:absolute;inset:0;z-index:3;display:flex;align-items:flex-end;background:rgba(0,0,0,.5)}
.es-folha{display:flex;flex-direction:column;gap:8px;width:100%;max-height:80%;overflow:auto;margin:0;padding:10px 16px calc(var(--bottom,0px) + 16px);border-radius:18px 18px 0 0;background:#10264F;border-top:1px solid var(--stroke-2)}
.es-f-cab{display:flex;align-items:center;gap:8px}
.es-f-cab b{flex:1;min-width:0;font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.es-f-x{flex:none;width:40px;height:40px;border-radius:50%;background:var(--glass);color:var(--muted);font-size:18px}
.es-f-meta{margin:0;font-size:12.5px;color:var(--muted);overflow-wrap:anywhere}
.es-f-erro{margin:0;font-size:13.5px;color:var(--tag-erro,#FFA49C);overflow-wrap:anywhere}
.es-log{margin:0;padding:10px;border-radius:10px;background:rgba(0,0,0,.3);font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--ink);white-space:pre-wrap;overflow-wrap:anywhere;max-height:50vh;overflow:auto}
.es-f-rot{font-size:13px;font-weight:650;color:var(--muted)}
.es-f-rot small{font-weight:400}
.es-campo{display:block;width:100%;min-height:44px;padding:0 12px;border-radius:12px;border:1px solid var(--stroke-2);background:var(--glass-2);color:var(--ink);font-size:16px}
.es-f-bts{display:flex;gap:8px}
.es-roda{display:inline-block;width:14px;height:14px;border-radius:50%;border:2px solid rgba(255,255,255,.18);border-top-color:var(--gold);animation:es-gira .9s linear infinite;vertical-align:-2px}
@keyframes es-gira{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.es-roda{animation:none}}
`;

const TELA_HTML = `<div class="ar-topo"><button type="button" data-es-voltar aria-label="Fechar o Estoque">‹</button><b id="esTitulo">📦 Estoque</b>`
  + `<button type="button" data-es-atualizar aria-label="Atualizar agora">↻</button></div>`
  + `<div class="ar-corpo" id="esCorpo"><div id="esAbas"></div>`
  + `<div class="es-busca"><input id="esBusca" type="search" placeholder="Buscar skill ou cron" enterkeyhint="search" autocomplete="off" aria-label="Buscar no Estoque">`
  + `<button type="button" class="es-limpar hidden" data-es-limpar aria-label="Limpar a busca">✕</button></div>`
  + `<div id="esFiltros"></div><div id="esLeitura" class="es-leitura"></div><div id="esFaixas"></div>`
  + `<div id="esAviso" class="es-aviso" role="status" aria-live="polite"></div><div id="esLista"></div></div>`
  + `<div id="esFolha" class="es-folha-fundo hidden"></div>`;

// ---- A ligação com a página ------------------------------------------------------------------------------------
function ligar(deps = {}) {
  const nada = {desenhar() {}, abrir() {}, fechar() {}, soltar() {}, aberta: () => false, carregar() {}};
  if (typeof document === "undefined" || !document.body) return nada;
  const d = deps, $ = id => document.getElementById(id);
  const agora = () => (d.agora ? d.agora() : Date.now());
  const todos = () => Object.values((d.pcs && d.pcs()) || {});
  const motivo = e => (d.motivoRede ? d.motivoRede(e) : String((e && e.message) || e || "erro"));
  const guardado = () => { try { return localStorage.getItem(LS) || ""; } catch { return ""; } };
  let estado = lerEstado(guardado());
  const salvar = () => { try { localStorage.setItem(LS, gravarEstado(estado)); } catch { /* sem espaço: fica só nesta visita */ } };
  const trab = {linhas: null, erro: "", semFuncaoAte: 0, carregando: false, lidoEm: 0, lidoOk: 0, timer: null};
  const toques = {}, timersToque = {}, emVoo = {}, abertas = new Set();
  let folha = null, avisoTimer = null, aberto = false, ultimo = null;

  if (!$("estiloEstoque")) { const st = document.createElement("style"); st.id = "estiloEstoque"; st.textContent = CSS; document.head.appendChild(st); }
  let tela = $("estoque");
  if (!tela) {
    tela = document.createElement("div");
    tela.id = "estoque"; tela.className = "hidden";
    tela.setAttribute("role", "dialog"); tela.setAttribute("aria-modal", "true"); tela.setAttribute("aria-labelledby", "esTitulo");
    tela.innerHTML = TELA_HTML;
    document.body.appendChild(tela);
  }
  let ent = $("wfEstoque");
  if (!ent && $("wfTopo")) { ent = document.createElement("div"); ent.id = "wfEstoque"; $("wfTopo").insertAdjacentElement("afterend", ent); }
  const por = (el, html) => { if (el && el._esHtml !== html) { el._esHtml = html; el.innerHTML = html; } };
  const ctxBotoes = () => ({agora: agora(), rede: d.rede ? d.rede() : true, pcs: todos(), pedidos: d.pedidos ? d.pedidos() : [],
    linhas: trab.linhas || [], emVoo, toques, abertas});
  const cronDe = chave => (ultimo ? ultimo.crons.find(x => x.chave === chave) : null) || null;

  function desenhar() {
    if (ent && (!d.aba || d.aba() === "Workflows")) por(ent, htmlEntrada(entrada(todos())));
    if (!aberto) return;
    const c = ctxBotoes();
    ultimo = juntar(trab.linhas || [], {pcs: c.pcs, agora: c.agora, rede: c.rede, lidoEm: trab.lidoOk, erro: trab.erro,
      carregando: trab.carregando, semFuncao: Date.now() < trab.semFuncaoAte});
    por($("esAbas"), htmlAbas(ultimo, estado));
    const foco = document.activeElement;
    if (!(foco && foco.tagName === "SELECT" && tela.contains(foco))) por($("esFiltros"), htmlFiltros(ultimo, estado));
    por($("esLeitura"), esc(ultimo.leitura || ""));
    por($("esFaixas"), htmlFaixas(ultimo.faixas[estado.aba]));
    por($("esLista"), htmlLista(ultimo, estado, {...c, carregando: trab.linhas === null && Date.now() >= trab.semFuncaoAte}));
    const b = $("esBusca");
    if (b && foco !== b && b.value !== estado.busca) b.value = estado.busca;
    tela.querySelector("[data-es-limpar]").classList.toggle("hidden", !estado.busca);
  }
  function avisar(texto, {erro = false, ok = false} = {}) {
    const el = $("esAviso");
    clearTimeout(avisoTimer);
    if (!el) return;
    el.className = `es-aviso${texto ? (erro ? " erro" : ok ? " ok" : "") : ""}`;
    el.textContent = texto ? `${erro ? "⚠ " : ok ? "✓ " : ""}${texto}` : "";
    if (texto) avisoTimer = setTimeout(() => avisar(""), erro ? AVISO_ERRO_MS : AVISO_MS);
  }
  function desenharFolha() {
    const el = $("esFolha");
    if (!folha) { el.classList.add("hidden"); el.innerHTML = ""; return; }
    const a = cronDe(folha.chave);
    el.innerHTML = folha.tipo === "log" ? htmlFolhaLog(folha, a, agora()) : htmlFolhaLink(folha, a);
    el.classList.remove("hidden");
  }
  function fecharFolha() { folha = null; desenharFolha(); }

  // O cel_trabalhos: só com a tela aberta, a chave e a página visível; o relógio de 2 min e o ↻.
  async function carregar(forcar = false) {
    if (!aberto || (d.ativo && !d.ativo()) || document.visibilityState !== "visible" || trab.carregando || Date.now() < trab.semFuncaoAte) return;
    if (forcar !== true && Date.now() - trab.lidoEm < TRAB_MS - 1000) return;
    trab.carregando = true; trab.lidoEm = Date.now();
    desenhar();
    try {
      const r = await d.rpc("cel_trabalhos", {});
      trab.linhas = Array.isArray(r) ? r : []; trab.erro = ""; trab.lidoOk = agora();
    } catch (e) {
      if ((e && e.codigo) === "PGRST202" || /could not find the function|PGRST202/i.test(String((e && e.message) || ""))) trab.semFuncaoAte = Date.now() + SEM_FUNCAO_MS;
      else trab.erro = motivo(e);
    } finally { trab.carregando = false; desenhar(); }
  }

  // ▶ Rodar: o toque (3 s com Desfazer), depois o cel_pedir do pedidoRodar ao PC do maestro; o andamento vem pelo rodarAgora.
  function rodar(a) {
    const ctx = {...ctxBotoes(), toque: toques[a.chave] || null};
    const t = W().tocar(a, ctx);
    if (!t) return avisar(W().rodarAgora(a, ctx).botao.motivo || "Não dá para rodar agora", {erro: true});
    toques[a.chave] = t;
    clearTimeout(timersToque[a.chave]);
    timersToque[a.chave] = setTimeout(() => mandarRodar(a.chave), W().RODAR_DESFAZER_MS);
    desenhar();
  }
  async function mandarRodar(chave) {
    delete timersToque[chave];
    const t = toques[chave], a = cronDe(chave);
    if (!t || t.enviado) return;
    const ped = a && W().pedidoRodar(a, {pcs: pcsReais(todos()), ref: t.ref});
    if (!ped) { toques[chave] = {...t, erro: "a automação ou o maestro saiu da lista"}; return desenhar(); }
    try {
      await d.rpc("cel_pedir", ped);
      if (toques[chave] && toques[chave].ref === t.ref) toques[chave] = W().marcarEnviado(toques[chave], agora());
      avisar(`Pedido enviado ao maestro: rodar ${a.nome}`, {ok: true});
      if (d.voltaJa) d.voltaJa();
    } catch (e) {
      if (toques[chave] && toques[chave].ref === t.ref) toques[chave] = {...toques[chave], erro: motivo(e)};
      avisar(`Não consegui pedir: ${motivo(e)}`, {erro: true});
    }
    desenhar();
  }
  function desfazer(chave) {
    const t = toques[chave], ainda = W().desfazerToque(t, agora());
    if (t && !ainda) { delete toques[chave]; clearTimeout(timersToque[chave]); delete timersToque[chave]; avisar("Desfeito: nada foi ao maestro", {ok: true}); }
    desenhar();
  }
  // As ações que vão ao PC da automação e esperam a resposta (Agendador, Log, + link).
  async function pedirAoPc(chaveVoo, pedido) {
    emVoo[chaveVoo] = true; desenhar();
    try {
      const id = await d.rpc("cel_pedir", pedido);
      if (d.voltaJa) d.voltaJa();
      return await d.esperarPedido(id);
    } finally { delete emVoo[chaveVoo]; desenhar(); }
  }
  async function agendador(a) {
    avisar(`Pedi ao ${curto(a.pc)} para abrir o Agendador…`);
    try { const p = await pedirAoPc(`agendador|${a.chave}`, pedidoAcao("automacao_agendador", a)); avisar(umaLinha(p && p.resposta, 240) || `Abri o Agendador no ${curto(a.pc)}.`, {ok: true}); }
    catch (e) { avisar(`Não abriu o Agendador: ${motivo(e)}`, {erro: true}); }
  }
  async function verLog(a) {
    const f = folha = {tipo: "log", chave: a.chave, fase: "pedindo"};
    desenharFolha();
    try {
      const p = await pedirAoPc(`log|${a.chave}`, pedidoAcao("automacao_log", a));
      const log = lerLog(p && p.resposta);
      if (!log) throw new Error("a resposta do PC veio num formato que não conheço");
      Object.assign(f, {fase: "ok", log});
    } catch (e) { Object.assign(f, {fase: "erro", erro: motivo(e)}); }
    if (folha === f) desenharFolha();
  }
  function abrirLink(a) {
    folha = {tipo: "link", chave: a.chave, rotulo: "", url: "", erro: ""};
    desenharFolha();
    setTimeout(() => { const i = $("esLinkUrl"); if (i) i.focus(); }, 60);
  }
  async function guardarLink(form) {
    const f = folha, a = f && cronDe(f.chave);
    if (!f || f.tipo !== "link") return;
    const rotulo = form.querySelector("#esLinkRotulo").value, url = form.querySelector("#esLinkUrl").value;
    const b = a ? botoesDoCron(a, ctxBotoes()).link : {ok: false, motivo: "Essa automação saiu da lista"};
    const r = b.ok ? pedidoLink(a, rotulo, url) : {erro: b.motivo};
    if (r.erro) { Object.assign(f, {rotulo, url, erro: r.erro}); return desenharFolha(); }
    fecharFolha();
    avisar(`Guardando o link no ${curto(a.pc)}…`);
    try {
      const p = await pedirAoPc(`link|${a.chave}`, r.pedido);
      avisar(umaLinha(p && p.resposta, 240) || "Link guardado.", {ok: true});
      setTimeout(() => carregar(true), RELER_LINK_MS);   // o PC relê as automações na volta seguinte
    } catch (e) { avisar(`O link não foi guardado: ${motivo(e)}`, {erro: true}); }
  }

  function abrir() {
    if (d.ativo && !d.ativo()) return;
    const nova = !aberto;
    aberto = true;
    tela.classList.remove("hidden");
    document.body.classList.add("es-aberta");
    document.body.style.overflow = "hidden";
    if (!(history.state && history.state.estoque)) history.pushState({estoque: 1}, "", "#estoque=1");
    desenhar();
    if (nova) {
      $("esCorpo").scrollTop = 0;
      carregar(true);
      clearInterval(trab.timer);
      trab.timer = setInterval(carregar, TRAB_MS);
    }
  }
  function esconder() {
    if (!aberto) return;
    aberto = false; folha = null;
    clearInterval(trab.timer); trab.timer = null;
    tela.classList.add("hidden");
    desenharFolha();
    document.body.classList.remove("es-aberta");
    document.body.style.overflow = "";
  }
  function fechar() {
    const tinha = aberto;
    esconder();
    if (tinha && history.state && history.state.estoque) history.back();
  }

  tela.addEventListener("click", e => {
    const a = acaoDe(e.target);
    if (!a) { if (e.target === $("esFolha")) fecharFolha(); return; }
    if (a.acao === "voltar") return fechar();
    if (a.acao === "atualizar") return carregar(true);
    if (a.acao === "fecharFolha") return fecharFolha();
    if (a.acao === "aba") { estado = {...estado, aba: a.valor === "crons" ? "crons" : "skills"}; salvar(); desenhar(); $("esCorpo").scrollTop = 0; return; }
    if (a.acao === "col") { estado = porColuna(estado, a.valor); salvar(); return desenhar(); }
    if (a.acao === "dir") { estado = inverter(estado); salvar(); return desenhar(); }
    if (a.acao === "skill") { if (abertas.has(a.valor)) abertas.delete(a.valor); else abertas.add(a.valor); return desenhar(); }
    if (a.acao === "limpar" || a.acao === "verTudo") {
      estado = a.acao === "limpar" ? {...estado, busca: ""} : {...estado, busca: "", pc: "", grupo: {...estado.grupo, [estado.aba]: "todos"}};
      $("esBusca").value = ""; salvar(); return desenhar();
    }
    if (a.acao === "desfazer") return desfazer(a.valor);
    const cron = cronDe(a.valor);
    if (!cron) return avisar("Essa automação saiu da lista", {erro: true});
    if (a.acao === "rodar") {   // revisão do PR #36: sem a v9 ou sem celular aprovado, o toque nem conta (o agente recusaria)
      const bs = botoesDoCron(cron, ctxBotoes());
      if (bs.desligado) return avisar(bs.desligado, {erro: true});
      return rodar(cron);
    }
    const b = botoesDoCron(cron, ctxBotoes())[a.acao];
    if (!b || !b.ok) return avisar((b && b.motivo) || "Não dá agora", {erro: true});
    if (a.acao === "agendador") return agendador(cron);
    if (a.acao === "log") return verLog(cron);
    if (a.acao === "link") return abrirLink(cron);
  });
  tela.addEventListener("change", e => {
    const s = e.target && e.target.closest ? e.target.closest("[data-es-sel]") : null;
    if (!s) return;
    estado = mudarFiltro(estado, s.dataset.esSel, s.value); salvar(); desenhar();
  });
  tela.addEventListener("input", e => { if (e.target && e.target.id === "esBusca") { estado = {...estado, busca: e.target.value}; desenhar(); } });
  tela.addEventListener("submit", e => {
    const f = e.target && e.target.closest ? e.target.closest("[data-es-form-link]") : null;
    if (f) { e.preventDefault(); guardarLink(f); }
  });
  if (ent) ent.addEventListener("click", e => { const a = acaoDe(e.target); if (a && a.acao === "abrir") abrir(); });
  addEventListener("popstate", e => {
    const s = e.state || {};
    if (aberto && !s.estoque) esconder();
    else if (!aberto && s.estoque) abrir();
  });
  document.addEventListener("visibilitychange", () => { if (aberto && document.visibilityState === "visible") carregar(); });
  // A página aberta com #estoque=1 (o link, ou recarregada com a tela aberta): a base vira a página sem o "#" e a tela
  // entra por cima, como as telas da v24 (o ‹ volta para ela).
  setTimeout(() => {
    if (aberto || !new URLSearchParams(location.hash.slice(1)).get("estoque")) return;
    history.replaceState(null, "", location.pathname + location.search);
    abrir();
  }, 0);
  // O trem 0.9.0.18 (revisão da junção): o aviso tocado com o Estoque aberto abria a tela dele por baixo do Estoque, e o
  // voltar trazia o Estoque de novo. A página chama o soltar() antes de abrir o destino: o Estoque sai e a entrada dele
  // no histórico vira a página (sem o history.back, que correria com o pushState da tela do aviso).
  function soltar() {
    if (!aberto) return;
    esconder();
    if (history.state && history.state.estoque) history.replaceState(null, "", location.pathname + location.search);
  }
  return {desenhar, abrir, fechar, soltar, aberta: () => aberto, carregar};
}

const Estoque = {LS, TRAB_MS, SEM_FUNCAO_MS, LINKS_MAX, ROTULO_MAX, URL_MAX, LOG_LINHAS, ABAS, GRUPOS, ORDENS, DIR_PADRAO,
  juntar, filtrar, ordenar, usoDe, usosDasSkills, botoesDoCron, entrada, urlOk, linksDe, pedidoAcao, pedidoLink, lerLog,
  lerEstado, gravarEstado, porColuna, escolherOrdem, inverter, mudarFiltro, nomeColuna, temEstoque, ehMaquina,
  htmlEntrada, htmlAbas, htmlFiltros, htmlFaixas, htmlSkills, cartaoCron, htmlLista, htmlFolhaLog, htmlFolhaLink, acaoDe, ligar, CSS};
if (typeof module !== "undefined" && module.exports) module.exports = Estoque;
else raiz.Estoque = Estoque;
})(typeof window !== "undefined" ? window : globalThis);
