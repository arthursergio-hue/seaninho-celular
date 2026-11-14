// Seaninho no celular: a tela de Workflows (0.9.1.1), sem tela. Três abas: Workflows (o que o maestro delegou e os
// Workflows do Claude nos dois PCs), Automações (as tarefas agendadas de cada PC, com o "Rodar agora" pelo maestro) e
// Skills. Junta as listas que os PCs publicam (cel_trabalhos), cruza com as sessões que a página já tem e decide
// estado, textos, filtros, ordem, contagens e botões (testada no Node: test_workflows.cjs). A página desenha.
// Pedidos do Arthur: 03/11 ("uma tela de workflows para eu gerenciar todos que estão ativos, finalizados e etc.") e
// 04/11 11h05 ("um painel de monitoramento das automações ... uma aba para automações, outra aba para skills").
//
// O que chega de cada PC (a coluna trabalhos, uma por PC): {v: 1, lido_em, itens: [workflows], delegacoes: [só no PC
// do maestro], total_hoje: {terminados, mostrados}, automacoes: [...], skills: [...], pedidos_automacao: [só no PC do
// maestro], aceita_rodar?: false, automacoes_erro? e automacoes_lidas_em? (o Agendador do PC não respondeu),
// skills_erro? (o inventário estragado ou a leitura das skills falhou)}. No hoje.painel.trabalhos (sem a lista), o
// resumo_hoje do trabalhos.py, com o workflows_rodando do Trocar conta. Épocas em segundos (do relógio do PC); o
// celular usa o agoraRede() da página.
// 0.9.0.4: a parte "Frentes" (a aba Workflows que saiu antes do resto): uma linha por frente de trabalho, com a vista
// que o agente também calcula (frentes-casos.json) e os botões e o detalhe da frente.
(function (raiz) {
"use strict";

const AGENTE_TRABALHOS = "0.9.1.1";   // o agente que publica a lista (e, no PC do maestro, leva o "Rodar agora")
const AGENTE_QUALQUER = "0.9.0.15";   // o que entrega no terminal, no app e no segundo plano (o mesmo da página e do chat.js)
const ONLINE_MS = 150000;             // o mesmo online() da página
const DESLIGADO_MS = 600000;          // e o desligadoHa: depois disso, os itens do PC ficam congelados
const PRAZO_PERTO_MS = 15 * 60000;    // o prazo fica âmbar a 15 min
const SEM_SINAL_MS = 10 * 60000;      // rodando sem mexer nisso: "sem sinal há N min" (um Bash longo do Revit não escreve)
const MEXEU_PASSO_MS = 5 * 60000;     // 0.9.1.1: o "mexeu" chega em degraus de 5 min, para baixo (trabalhos.py)
const FOLGA_MS = 60000;               // relógios do PC e do celular
const DISPENSA_DESFAZER_MS = 6000;    // o Dispensar tem Desfazer por 6 s
const DISPENSA_GUARDA_MS = 2 * 86400000;
const RODAR_DESFAZER_MS = 3000;       // o "Rodar agora" espera 3 s com Desfazer, como as sugestões
const RODAR_REPETIR_MS = 2 * 60000;   // pedida há menos de 2 min: o botão fica cinza
const RODAR_EXPIRA_MS = 30 * 60000;   // sem resposta do maestro em 30 min: "expirou"
const RODAR_MOSTRA_MS = 30 * 60000;   // o fim do pedido fica no cartão por 30 min

const ESTADOS_WF = ["rodando", "terminado", "parado", "falhou", "interrompido"];
const CHIP = {
  rodando: ["Rodando", "anda"], esperando: ["Esperando você", "espera"], terminado: ["Terminado", "ok"],
  parado: ["Parado antes do fim", "off"], falhou: ["Falhou", "erro"], interrompido: ["Interrompido", "erro"],
  fechada: ["Sessão fechada", "espera"], espera: ["Em espera", "off"], outro: ["Sem estado conhecido", "off"],
  // 0.9.1.1: a delegação que o maestro tirou da lista sem STATUS: (não entregue, a sessão sumiu, cancelada); o
  // estado continua "outro" (como no trabalhos.py), só o chip e a voz mudam
  encerrada: ["Encerrada sem resultado", "off"]};
const VOZ = {rodando: "rodando", esperando: "esperando você", terminado: "terminado", parado: "parado antes do fim",
  falhou: "falhou", interrompido: "interrompido", fechada: "com a sessão fechada", espera: "em espera",
  outro: "sem estado conhecido", encerrada: "encerrada sem resultado"};
const chaveChip = it => it.estado === "outro" && it.tipo === "delegacao" ? "encerrada" : it.estado;
const FALHAS = new Set(["falhou", "interrompido", "fechada"]);       // as que o Dispensar tira do Ativos
const FINS = new Set(["terminado", "parado", "falhou", "interrompido", "outro"]);   // entram em Terminados hoje
const FILTROS = [["ativos", "Ativos"], ["esperando", "Esperando você"], ["hoje", "Terminados hoje"], ["todos", "Todos"]];
const SECOES = [["rodando", "Rodando"], ["esperando", "Esperando você"], ["falhas", "Falharam"], ["espera", "Em espera"],
  ["desligado", "PC desligado"]];
const VAZIO = {ativos: "Nada rodando agora. Os de hoje ficam em Terminados", esperando: "Nada esperando você",
  hoje: "Nada terminou hoje", todos: "Nada hoje por aqui"};
const ICONE = {delegacao: "🎼", workflow: "⚙", espera: "⏳"};

// 0.9.1.1: "desconhecida" é o processo que o PC não conseguiu ver (o PowerShell falhou e não há leitura boa;
// automacoes.py). Não vira "Ativa" nem "Nunca rodou": fica cinza, com a voz "não deu para ver agora".
const SITUACAO = {rodando: ["Rodando", "anda"], ativa: ["Ativa", "ok"], parada: ["Parada", "off"],
  com_erro: ["Com erro", "erro"], nunca_rodou: ["Nunca rodou", "off"], desconhecida: ["Sem leitura agora", "off"]};
const VOZ_SITUACAO = {desconhecida: "não deu para ver agora"};
// a ordem do automacoes.ordenar (com erro, rodando, parada, nunca rodou, sem leitura, ativa), para o desempate
const ORDEM_SITUACAO = Object.fromEntries(["com_erro", "rodando", "parada", "nunca_rodou", "desconhecida", "ativa"].map((s, i) => [s, i]));
const ordemSituacao = a => Object.prototype.hasOwnProperty.call(ORDEM_SITUACAO, a.situacao) ? ORDEM_SITUACAO[a.situacao] : 9;
const FILTROS_AUT = [["todas", "Todas"], ["rodando", "Rodando"], ["com_erro", "Com erro"], ["paradas", "Paradas"]];
const VAZIO_AUT = {todas: "Nenhuma automação publicada pelos PCs", rodando: "Nenhuma automação rodando agora",
  com_erro: "Nenhuma automação com erro", paradas: "Nenhuma automação parada"};
const GRUPOS_SKILL = [["pc", "Neste PC"], ["time", "Do time"], ["pessoal", "Pessoais"]];
const FAIXA_EXEMPLO = "Dados de exemplo; o inventário chega com a auditoria";

// ---- Pequenos ----------------------------------------------------------------------------------------
const arr = v => Array.isArray(v) ? v : [];
const txt = (v, n = 300) => { const t = String(v == null ? "" : v).replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t; };
const maiuscula = t => t ? t[0].toUpperCase() + t.slice(1) : t;
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const dd = n => String(n).padStart(2, "0");
// Época do PC (segundos), milissegundos ou texto ISO: sempre milissegundos (0 quando não dá para saber).
function ms(v) {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : /^\s*\d+(\.\d+)?\s*$/.test(String(v)) ? Number(v) : NaN;
  if (!isNaN(n)) return n > 0 ? (n < 1e11 ? Math.round(n * 1000) : Math.round(n)) : 0;
  const t = Date.parse(String(v));
  return isNaN(t) ? 0 : t;
}
const horaCurta = t => { const d = new Date(t); return `${d.getHours()}h${d.getMinutes() ? dd(d.getMinutes()) : ""}`; };
const hhmm = t => { const d = new Date(t); return `${dd(d.getHours())}:${dd(d.getMinutes())}`; };
const ddmm = t => { const d = new Date(t); return `${dd(d.getDate())}/${dd(d.getMonth() + 1)}`; };
const meiaNoite = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const diasEntre = (a, b) => Math.round((meiaNoite(a) - meiaNoite(b)) / 86400000);   // round: o horário de verão
const DIA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
// "16h41" hoje; "ontem 16h41"; "qui 16h41" na semana; "28/10" antes.
function horaOuDia(t, agora) {
  const n = diasEntre(agora, t);
  return n === 0 ? horaCurta(t) : n === 1 ? `ontem ${horaCurta(t)}` : n > 1 && n < 7 ? `${DIA[new Date(t).getDay()]} ${horaCurta(t)}` : ddmm(t);
}
// Para trás: "hoje 10h56", "ontem 18h", "há 3 dias".
function quandoFoi(t, agora) {
  const n = diasEntre(agora, t);
  return n <= 0 ? `hoje ${horaCurta(t)}` : n === 1 ? `ontem ${horaCurta(t)}` : `há ${n} dias`;
}
// Para frente: "11h06", "amanhã 8h", "sex 8h", "12/11".
function quandoVai(t, agora) {
  const n = diasEntre(t, agora);
  return n <= 0 ? horaCurta(t) : n === 1 ? `amanhã ${horaCurta(t)}` : n < 7 ? `${DIA[new Date(t).getDay()]} ${horaCurta(t)}` : ddmm(t);
}
function duracao(d) {
  const m = Math.floor(Math.max(0, d) / 60000);
  if (m < 1) return "menos de 1 min";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 24) return r ? `${h} h ${r} min` : `${h} h`;
  return plural(Math.floor(h / 24), "dia", "dias");
}
const nomeCurtoPc = pc => String(pc || "").length > 11 && String(pc).includes("-") ? String(pc).split("-")[0] : String(pc || "");
const juntarNomes = l => l.length <= 1 ? (l[0] || "") : `${l.slice(0, -1).join(", ")} e ${l[l.length - 1]}`;
const versaoN = v => String(v || "").replace(/^v/i, "").split("-")[0].split(".").map(x => parseInt(x, 10) || 0);
function compararVersao(a, b) {
  const x = versaoN(a), y = versaoN(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
}

// A busca e os grupos de pasta são os da aba Sessões (lista.js), para as duas telas agruparem igual.
let _lista = null;
function L() {
  if (_lista) return _lista;
  if (raiz.Lista) return (_lista = raiz.Lista);
  try { if (typeof module !== "undefined" && typeof require === "function") return (_lista = require("./lista.js")); } catch { /* sem a lista */ }
  return (_lista = {GRUPOS: ["SZI", "Seaninho", "Pessoais", "Outras"],
    normalizar: t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim(),
    grupoDe: cwd => { const c = String(cwd || "").replace(/\//g, "\\").toLowerCase();
      return /\\dev\\szi(\\|$)/.test(c) ? "SZI" : /\\dev\\seaninho(\\|$)/.test(c) ? "Seaninho" : /\\dev\\pessoal(\\|$)/.test(c) ? "Pessoais" : "Outras"; }});
}
const normalizar = t => L().normalizar(t);
const combina = (alvo, busca) => { const ts = normalizar(busca).split(" ").filter(Boolean); return !ts.length || ts.every(t => alvo.includes(t)); };

// ---- PCs ---------------------------------------------------------------------------------------------
const listaPcs = pcs => (Array.isArray(pcs) ? pcs : Object.values(pcs || {})).filter(p => p && p.pc);
const pcDe = (pcs, nome) => listaPcs(pcs).find(p => p.pc === nome) || null;
const vistoMs = p => ms(p && p.visto_em);
const online = (p, agora) => !!p && agora - vistoMs(p) < ONLINE_MS;
const desligado = (p, agora) => !p || agora - vistoMs(p) >= DESLIGADO_MS;
const agenteNovo = p => !!p && (compararVersao(p.versao, AGENTE_TRABALHOS) >= 0 || !!painelDe(p).automacoes);   // entrega 4 (Estoque): quem publica o hoje.painel.automacoes já recebe o Rodar
const painelDe = p => (p && p.hoje && p.hoje.painel) || {};
// O banco já tem a coluna trabalhos (v10)? O cel_estado novo traz o trabalhos_em em cada PC, mesmo vazio.
const bancoV10 = pcs => listaPcs(pcs).some(p => Object.prototype.hasOwnProperty.call(p, "trabalhos_em"));
// O PC do maestro: o que publica o quadro da orquestra (como o orquestraDe da página).
function maestroDe(pcs) {
  for (const p of listaPcs(pcs)) { const o = painelDe(p).orquestra; if (o) return {...o, pc: p.pc}; }
  return null;
}
// "O WIN está desligado" | "O WIN está sem sinal" (de 150 s a 10 min).
const foraDoAr = (p, nome, agora) => `O ${nomeCurtoPc(nome || (p && p.pc))} está ${!p || desligado(p, agora) ? "desligado" : "sem sinal"}`;
const linhasValidas = linhas => arr(linhas).filter(l => l && l.pc && l.trabalhos && typeof l.trabalhos === "object");
// A rede: true/false ou o {ok, em} da página.
const semRede = r => r === false || !!(r && typeof r === "object" && r.ok === false);
// 0.9.1.1: as pastas pessoais que valem em qualquer PC (o PC dono ainda marca as dele, com a lista do coletor). Reforço
// para nada pessoal ir ao maestro, mesmo se o PC esquecer a marca.
// 0.9.0.4 (achado de 04/11): as letras do Drive mudam de PC para PC (o orq.DRIVE_SEAZONE / DRIVE_OUTRO do agente): o
// Drive pessoal é o G:\ no WIN e o H:\ no SEAZONE192 (lá o G:\ é o Drive da Seazone). PC fora do mapa, ou sem o PC:
// os dois contam como pessoais (fechado).
const PESSOAIS = [/^c:\\dev\\(pessoal|selah-app|whatsapp-mcp)(\\|$)/i, /\\linkedin - postagens(\\|$)/i];
const DRIVE_PESSOAL = {"WIN-EAD6OD66GE7": ["g"], "SEAZONE192": ["h"]};
const pastaPessoal = (cwd, pc) => {
  const c = String(cwd || "").replace(/\//g, "\\"), drives = DRIVE_PESSOAL[String(pc || "").toUpperCase()] || ["g", "h"];
  return PESSOAIS.some(r => r.test(c)) || drives.some(l => c.toLowerCase().startsWith(l + ":\\"));
};

// ---- A linha STATUS: -------------------------------------------------------------------------------------
// "STATUS: pronta — <frase>" ou "STATUS: precisa — <frase>" (CICLO.md do maestro), com travessão, meia-risca ou
// hífen, em negrito ou não, no fim ou no meio do texto. Vale a última. {tipo: pronta|precisa|outra, frase, linha} | null.
// 0.9.0.7: a 1ª palavra pode ser número ("STATUS: 3 frentes concluídas no WIN"); aspas, emoji e símbolos antes dela
// ficam de fora ("STATUS: ✅ concluída", "STATUS: “aguardando o Arthur”"). A mesma gramática do _STATUS_LIVRE do
// trabalhos.py, para os dois lerem as mesmas linhas. Uma classe só depois de "STATUS:" (o grupo aninhado tinha
// retrocesso exponencial e travava a página com uma linha "STATUS:" seguida de muitos símbolos; o verificador).
const STATUS_RE = /(?:^|[\s>(])[*_`]*STATUS:[^A-Za-zÀ-ÿ0-9\n]*([A-Za-zÀ-ÿ0-9]+)([^\n]*)/g;
// 0.9.0.7: a mesma leitura tolerante do trabalhos.py (tipo_do_status): a 1ª palavra canônica (pronta, precisa) vale
// como sempre; sem ela, a linha inteira: esperando você, parada, em andamento e, por último, terminou.
// - Esperando você: as palavras do pedido em qualquer parte (precisa, aguardando, esperando, "Arthur decide",
//   decisão), o "aguardo", "falta o Arthur", "depende do Arthur / de você" e "aguarda/espera o Arthur / você / sua…".
//   Decidir, decisões, escolha e aprovar só com o Arthur (ou você, seu, sua) na mesma oração e sem particípio de coisa
//   feita (respondidas, tomada, aplicadas…).
// - A palavra negada na mesma oração não conta; "0" e "zero" negam só logo antes e nunca o terminou.
// As frases de teste são as do status-frases.json, as mesmas do test_trabalhos.py.
const STATUS_ESPERA = /\b(?:precis\w*|aguardando|esperando|aguardo|arthur decide|decisao|faltam? (?:[oa] )?arthur|depend(?:e|em) (?:do arthur|de voce|da sua|do seu)|(?:aguarda|aguardam|espera|esperam) (?:[oa] )?(?:arthur|voce|sua|seu))\b/g;
const STATUS_DECIDE = /\b(?:decid(?:ir|e|a|am|em|as)|decis(?:ao|oes)|escolh(?:a|as|er|am|e)|aprov(?:ar|acao|e|em))\b/g;
const STATUS_QUEM = /\b(?:arthur|voce|sua|seu|suas|seus)\b/;
const STATUS_FEITO = /\b(?:respondid|tomad|aplicad|resolvid|feit|aprovad|decidid|escolhid|fechad)\w*/;
const STATUS_TIPOS = [
  ["parada", /\b(?:parad[ao]s?|pausad[ao]s?|parei|pausei)\b/g, true],
  ["andamento", /\bem andamento\b/g, true],
  ["pronta", /\b(?:pront[ao]s?|conclu(?:i|iu|id[ao]s?)|termin(?:ou|ei|ad[ao]s?)|feit[ao]s?|entregues?|encerrad[ao]s?|finalizad[ao]s?)\b/g, false],
];
const STATUS_NEGA = new Set(["nao", "nada", "nenhum", "nenhuma", "nenhuns", "nenhumas", "sem", "ninguem", "nem", "nunca"]);
const STATUS_ZERO = new Set(["0", "zero"]);
const STATUS_ORACOES = /[,;:·—–.!?()[\]|/]+|\s-\s/;
function statusNegada(palavras, junto, inicio, zero) {
  const i = (junto.slice(0, inicio).match(/ /g) || []).length;
  return palavras.slice(Math.max(0, i - 3), i).some(p => STATUS_NEGA.has(p)) || (zero && i > 0 && STATUS_ZERO.has(palavras[i - 1]));
}
function casos(rx, junto) {
  rx.lastIndex = 0;
  const out = [];
  let m;
  while ((m = rx.exec(junto))) out.push(m);
  return out;
}
function statusEspera(palavras) {
  const junto = palavras.join(" "), feito = STATUS_FEITO.test(junto);
  for (const m of casos(STATUS_ESPERA, junto)) {
    if (!(m[0] === "decisao" && feito) && !statusNegada(palavras, junto, m.index, true)) return true;
  }
  if (!feito && STATUS_QUEM.test(junto)) return casos(STATUS_DECIDE, junto).some(m => !statusNegada(palavras, junto, m.index, true));
  return false;
}
function statusTem(rx, oracoes, zero) {
  return oracoes.some(palavras => {
    const junto = palavras.join(" ");
    return casos(rx, junto).some(m => !statusNegada(palavras, junto, m.index, zero));
  });
}
function tipoDoStatus(palavra, resto) {
  const linha = normalizar(`${palavra}${resto}`).replace(/[*_`]+/g, " ").replace(/\s+/g, " ").trim();
  const primeira = (linha.match(/[a-z0-9]+/) || [""])[0];
  if (/^pront/.test(primeira)) return "pronta";
  if (/^precis/.test(primeira)) return "precisa";
  const oracoes = linha.split(STATUS_ORACOES).map(o => o.match(/[a-z0-9]+/g) || []);
  if (oracoes.some(statusEspera)) return "precisa";
  for (const [tipo, rx, zero] of STATUS_TIPOS) if (statusTem(rx, oracoes, zero)) return tipo;
  return "outra";
}
function linhaStatus(texto) {
  const t = String(texto || "");
  let m, ult = null;
  STATUS_RE.lastIndex = 0;
  while ((m = STATUS_RE.exec(t))) ult = m;
  if (!ult) return null;
  const tipo = tipoDoStatus(ult[1], ult[2]);
  const frase = ult[2].replace(/[*_`]+/g, "").replace(/^\s*(de voce|de você)?\s*[—–:-]+\s*/i, "").trim();
  return {tipo, frase: txt(frase, 280), linha: txt(`STATUS: ${ult[1]}${ult[2]}`.replace(/[*_`]+/g, ""), 300)};
}

// ---- As sessões --------------------------------------------------------------------------------------
const pede = s => !!s && (s.estado === "perguntando" || !!s.permissao || !!s.enquete);
function sessaoDe(it, sessoes) {
  const ss = arr(sessoes);
  if (!it || !it.sessao) return null;
  // o workflow é do PC que o publicou; a delegação diz o PC dela (sem ele, vale o id em qualquer PC)
  return ss.find(s => s.id === it.sessao && s.pc === it.pc) || (it.pc ? null : ss.find(s => s.id === it.sessao)) || null;
}
const projetoDe = cwd => { const p = String(cwd || "").replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean); return p.length > 1 ? p[p.length - 1] : ""; };
const nomeWorkflow = n => { const t = txt(String(n || "").replace(/^wf_[0-9a-f-]+$/i, "").replace(/[-_]+/g, " "), 80); return t ? t[0].toUpperCase() + t.slice(1) : "Workflow"; };

// ---- Um item da lista ------------------------------------------------------------------------------------
// O estado de uma delegação: o maestro só diz que delegou; a sessão real diz como está (o em_andamento guarda itens que
// já acabaram). Terminou = sessão ociosa, ou perguntando com STATUS depois da delegação; "precisa" = esperando você.
// O PC do maestro já cruza com as sessões que ele vê (trabalhos.py); o celular refaz com as sessões mais novas e, sem a
// sessão, fica com o que o PC disse. Diferença combinada: "STATUS: precisa" com a sessão viva é "esperando você" aqui.
const ESTADO_DO_PC = {sessao_fechada: "fechada", em_espera: "espera"};
function estadoDelegacao(d, s) {
  const desde = ms(d.desde), guardada = linhaStatus(d.status_linha);
  const doPc = ESTADO_DO_PC[d.estado] || d.estado;
  if (d.fonte === "concluida") {
    // 0.9.1.1: tirada da lista sem STATUS: (não entregue, a sessão sumiu, o Arthur cancelou): o PC publica "outro",
    // com o motivo no resumo. Não é "Terminado" em verde
    if (doPc === "outro" && !guardada) return {estado: "outro", status: null, fim: ms(d.fim) || desde,
      nota: maiuscula(txt(d.resumo || d.resultado, 160))};
    return {estado: guardada && guardada.tipo === "parada" ? "parado" : "terminado", status: guardada,
      fim: ms(d.fim) || desde};   // 0.9.0.7: o STATUS de parada não é Terminado
  }
  if (s) {
    // a última fala só vale se veio depois da delegação (a sessão pode ser reaproveitada)
    const depois = !desde || (s.desde || 0) * 1000 >= desde - FOLGA_MS;
    const viva = depois ? linhaStatus(s.resposta) : null, st = viva || guardada;
    // trabalhando em outra coisa depois de um "pronta" já visto: a delegação acabou (o em_andamento guarda itens velhos)
    if (s.estado === "trabalhando" && !pede(s)) return guardada && guardada.tipo === "pronta"
      ? {estado: "terminado", status: guardada, fim: ms(d.fim)} : {estado: "rodando", status: guardada};
    if (pede(s)) return viva && viva.tipo !== "precisa" ? {estado: "terminado", status: viva, fim: (s.desde || 0) * 1000}
      : {estado: "esperando", status: depois ? st : null};
    if (!depois) return {estado: "rodando", status: null, nota: "A mensagem ainda não entrou na sessão"};
    if ((st && st.tipo === "precisa") || s.paraVoce) return {estado: "esperando", status: st};
    if (st && st.tipo === "andamento") return {estado: "rodando", status: st};  // 0.9.0.7
    // 0.9.0.7 (revisão): "STATUS: parado, sem acesso ao Drive" / "pausada até amanhã" não é Terminado: é o "Parado
    // antes do fim", como a frente (Parada) no trabalhos.py
    if (st && st.tipo === "parada") return {estado: "parado", status: st, fim: (s.desde || 0) * 1000};
    return {estado: "terminado", status: st, fim: (s.desde || 0) * 1000};
  }
  // sem a sessão aqui: fechou depois de um STATUS visto = terminou; senão vale o que o PC viu (segundo plano, ou a
  // lista de sessões do celular atrasada); sem nada, "sessão fechada"
  if (guardada) return {estado: guardada.tipo === "parada" ? "parado" : "terminado", status: guardada, fim: ms(d.fim)};
  if (["rodando", "esperando", "terminado", "fechada"].includes(doPc)) return {estado: doPc, status: null, fim: doPc === "terminado" ? ms(d.fim) : 0};
  // 0.9.1.1: "desconhecido" = o maestro não via o PC da sessão (sem sinal). Não é "sessão fechada" nem falha: fica
  // "rodando" (com o PC fora do ar, congelado: "era: rodando") e fora das contagens, como no resumo_hoje do PC
  if (doPc === "desconhecido") return {estado: "rodando", status: null, incerto: true};
  return {estado: d.fonte === "bg" ? "rodando" : "fechada", status: null};
}

function prazoDe(prazo, estado, agora) {
  if (!prazo) return {info: null, texto: "sem prazo"};
  if (!["rodando", "esperando", "fechada"].includes(estado)) return {info: null, texto: horaOuDia(prazo, agora)};
  const falta = prazo - agora;
  if (falta < 0) return {info: {texto: `atrasado ${duracao(-falta)}`, cor: "erro"}, texto: `atrasado ${duracao(-falta)}`};
  return {info: {texto: `prazo ${horaOuDia(prazo, agora)}`, cor: falta <= PRAZO_PERTO_MS ? "espera" : ""}, texto: horaOuDia(prazo, agora)};
}

function barraDe(w) {
  const a = w.agentes && typeof w.agentes === "object" ? w.agentes : {};
  const n = k => Math.max(0, parseInt(a[k], 10) || 0);
  const prontos = n("prontos"), rodando = n("rodando"), erro = n("erro"), fila = n("fila"), total = prontos + rodando + erro + fila;
  const fases = arr(w.fases).filter(f => f && f.nome);
  const feita = f => /^(feita|feito|pronta|pronto|done|completed|terminad)/i.test(String(f.estado || ""));
  const atual = fases.find(f => /^(rodando|progress|running|start)/i.test(String(f.estado || ""))) || null;
  if (!total && !fases.length) return null;
  const partes = total ? [plural(prontos, "pronto", "prontos"), rodando ? `${rodando} rodando` : "", fila ? `${fila} na fila` : ""].filter(Boolean)
    : [`${fases.filter(feita).length} de ${fases.length} fases`];
  return {texto: `${atual ? txt(atual.nome, 40) + " · " : ""}${partes.join(", ")}`, erro: erro ? `${erro} com erro` : "",
    pct: total ? prontos / total : fases.length ? fases.filter(feita).length / fases.length : 0, prontos, total};
}

function linhaTempo(it, agora) {
  if (!it.desde) return it.fim ? `terminou ${horaOuDia(it.fim, agora)}` : "";
  if (it.fim && FINS.has(it.estado)) return `${horaOuDia(it.desde, agora)} a ${horaCurta(it.fim)} (${duracao(it.fim - it.desde)})`;
  return `desde ${horaOuDia(it.desde, agora)} (${duracao(agora - it.desde)})`;
}

function vozDe(it, agora) {
  if (it.tipo === "espera") return `Em espera: ${it.nome}${it.antes ? `, antes: ${it.antes}` : ""}`;
  const tipo = it.tipo === "workflow" ? "Workflow" : "Delegação";
  const voz = VOZ[chaveChip(it)] || VOZ.outro;
  const est = it.congelado ? `era ${voz}` : voz;
  const partes = [`${tipo} ${it.nome}, ${est} no ${it.pcCurto}${it.desde ? ` desde ${horaOuDia(it.desde, agora)}` : ""}`];
  if (it.barra && it.barra.total) partes.push(`${it.barra.prontos} de ${it.barra.total} prontos`);
  if (it.barra && it.barra.erro) partes.push(it.barra.erro);
  if (it.prazoInfo) partes.push(it.prazoInfo.texto);
  if (it.congelado) partes.push(`${it.pcSemSinal ? "PC sem sinal" : "PC desligado"}${it.visto ? `, visto ${horaOuDia(it.visto, agora)}` : ""}`);
  return partes.join(", ");
}

function completar(it, {agora, pcs, sessoes}) {
  const s = sessaoDe(it, sessoes), p = pcDe(pcs, it.pc);
  it.sessaoNome = txt((s && s.titulo) || it.sessaoNome || (it.sessao ? "sessão sem nome" : ""), 60);
  it.onde = (s && s.onde) || it.onde || "";
  it.cwd = it.cwd || (s && s.cwd) || "";
  it.projeto = projetoDe(it.cwd) || "sem pasta";
  it.grupo = L().grupoDe(it.cwd);
  // pergunta 44 a: no celular aparece tudo, como na aba Sessões; sem pasta conta como pessoal para o que vai ao maestro
  it.pessoal = it.pessoal === true || !it.cwd || pastaPessoal(it.cwd, it.pc);
  it.pcCurto = nomeCurtoPc(it.pc);
  // 0.9.1.1: a delegação "desconhecido" (o maestro não via o PC) com o PC ainda fora do ar também fica congelada
  it.congelado = !!(p ? desligado(p, agora) : (s && s.desligado)) || (!!it.incerto && !(p && online(p, agora)));
  it.pcSemSinal = it.congelado && !!p && !desligado(p, agora);
  it.visto = p ? vistoMs(p) : (s && s.desligado ? ms(s.desligado) : 0);
  const [rot, cor] = CHIP[chaveChip(it)] || CHIP.outro;
  const chip = it.estado === "terminado" && it.erros ? `Terminado com ${plural(it.erros, "erro", "erros")}` : rot;
  it.chip = it.congelado ? {texto: `era: ${chip.toLowerCase()}${it.visto ? ` · visto ${horaOuDia(it.visto, agora)}` : ""}`, cor: "off"}
    : {texto: chip, cor: it.estado === "terminado" && it.erros ? "espera" : cor};
  const pz = prazoDe(it.prazo, it.estado, agora);
  it.prazoInfo = it.congelado ? null : pz.info;
  it.prazoTexto = pz.texto;
  it.tempo = linhaTempo(it, agora);
  // 0.9.1.1: o "sem sinal" é o do PC (que vê o horário exato). Aqui só o que dá para garantir: o mexeu publicado é
  // arredondado para baixo, então o run está quieto há MAIS que agora - mexeu - 5 min (e nunca menos de 10 min se o PC
  // já disse sem sinal). Assim nem aparece antes da hora nem passa da idade real.
  const calado = it.mexeu ? agora - it.mexeu - MEXEU_PASSO_MS : 0;
  if (it.estado === "rodando" && it.tipo === "workflow" && !it.congelado && (it.semSinal || calado >= SEM_SINAL_MS))
    it.nota = `sem sinal há mais de ${duracao(Math.max(calado, SEM_SINAL_MS))}`;
  else if (!it.nota && it.motivo) it.nota = it.motivo;   // o PC diz o porquê do "interrompido" ("A sessão fechou antes do fim")
  // 0.9.1.1: o PC voltou, mas a sessão ainda não apareceu: o maestro diz na próxima volta
  if (it.incerto && !it.congelado && !it.nota) it.nota = "Ainda sem notícia desta sessão";
  // 0.9.1.1: o que deu, em uma linha (cartão e detalhe): a frase do STATUS:, o resumo ou, sem os dois, o resultado
  // que o PC mandou (o diário antigo só traz o "resultado")
  it.resultadoLinha = txt((it.status && it.status.frase) || it.resumo || (typeof it.resultado === "string" ? it.resultado : ""), 300);
  it.falha = FALHAS.has(it.estado);
  it.voz = vozDe(it, agora);
  it.busca = normalizar([it.nome, it.sessaoNome, it.projeto, it.pc, it.pcCurto, it.origem, it.o_que,
    it.status && it.status.frase, ...arr(it.dentro).map(w => w.nome)].join(" "));
  return it;
}

function agenteDe(a) {
  const dur = Math.max(0, parseInt(a.dur, 10) || 0);
  return {rotulo: txt(a.rotulo, 80), estado: String(a.estado || ""), dur: dur || null, durTexto: dur ? duracao(dur * 1000) : "",
    passo: txt(a.passo, 100)};
}

function normWorkflow(w, pc, ctx) {
  const s = sessaoDe({sessao: w.sessao, pc}, ctx.sessoes);
  let estado = ESTADOS_WF.includes(w.estado) ? w.estado : "outro";
  if (estado === "rodando" && pede(s) && !s.desligado) estado = "esperando";   // o workflow nunca pergunta; a sessão dona sim
  const fim = ms(w.fim), mexeu = ms(w.mexeu);
  return {tipo: "workflow", id: `workflow:${pc}:${w.chave}`, chave: String(w.chave || ""), pc, publicadoPor: pc,
    icone: ICONE.workflow, nome: nomeWorkflow(w.nome), sessao: String(w.sessao || ""), cwd: String(w.cwd || ""),
    pessoal: w.pessoal === true, estado, desde: ms(w.desde), fim: fim || (FINS.has(estado) ? mexeu : 0), mexeu, prazo: 0,
    status: linhaStatus(w.status_linha), resumo: txt(w.resumo, 600), erros: Math.max(0, parseInt(w.erros, 10) || 0),
    tokens: Math.max(0, parseInt(w.tokens, 10) || 0), fases: arr(w.fases).filter(f => f && f.nome).map(f => ({nome: txt(f.nome, 60),
      estado: String(f.estado || "")})), agentes: w.agentes || null, barra: barraDe(w), dentro: [],
    // o detalhe (T4): o erro, o resultado, os últimos logs e os agentes que o PC mandou (sem o prompt)
    erro: txt(w.erro, 300), resultado: typeof w.resultado === "string" ? txt(w.resultado, 600) : w.resultado || null,
    // 0.9.1.1: de cada agente, também a duração (dur, em segundos) e o passo (o que faz agora; no que falhou, a 1ª
    // linha do erro)
    logs: arr(w.logs).map(x => txt(x, 160)).slice(-10), agentesLista: arr(w.lista_agentes).filter(a => a && a.rotulo)
      .map(agenteDe), formatoNovo: w.formato_novo === true,
    motivo: txt(w.motivo, 120), semSinal: w.sem_sinal === true};
}

function normDelegacao(d, publicadoPor, ctx) {
  const espera = d.tipo === "espera" || d.fonte === "espera";
  const pedido = d.pedido && arr(ctx.pedidos).find(x => x && x.id === d.pedido);
  const doPedido = pedido ? txt(String(pedido.texto || "").split("\n")[0].replace(/^\s*🎼?\s*Orquestra:\s*/i, ""), 60) : "";
  const it = {tipo: espera ? "espera" : "delegacao", id: `${espera ? "espera" : "delegacao"}:${d.chave || d.sessao || d.o_que}`,
    // o "em espera" é do maestro: fica no PC dele (o que publicou)
    chave: String(d.chave || d.sessao || ""), pc: String(d.pc || (espera ? publicadoPor : "")), publicadoPor, icone: ICONE[espera ? "espera" : "delegacao"],
    sessao: String(d.sessao || ""), sessaoNome: txt(d.nome, 60), cwd: String(d.cwd || ""), pessoal: d.pessoal === true,
    origem: txt(d.origem, 80), link: /^https:\/\//.test(String(d.link || "")) ? String(d.link) : "", desde: ms(d.desde),
    prazo: ms(d.prazo), run: String(d.run || ""), fonte: String(d.fonte || ""), antes: txt(d.antes, 120), o_que: txt(d.o_que, 200),
    // 0.9.1.1: o resultado da terminada (o "resultado" do diário ou do concluidas): a reserva do cartão, do detalhe e
    // da citação quando não há STATUS: nem resumo
    resumo: txt(d.resumo, 600), resultado: txt(d.resultado, 600), barra: null, dentro: []};
  if (!it.pc && it.sessao) { const s = arr(ctx.sessoes).find(x => x.id === it.sessao); if (s) it.pc = s.pc; }
  it.nome = espera ? (it.o_que || "Em espera") : txt(d.titulo, 60) || doPedido || txt(d.resumo, 60)
    || [it.origem, it.sessaoNome].filter(Boolean).join(" · ") || "Delegação";
  if (espera) { it.estado = "espera"; it.status = null; it.fim = 0; return it; }
  const r = estadoDelegacao(d, sessaoDe(it, ctx.sessoes));
  it.estado = r.estado; it.status = r.status || null; it.fim = r.fim || 0; if (r.nota) it.nota = r.nota;
  if (r.incerto) it.incerto = true;
  // a concluída vem do diário de hoje; sem hora nenhuma, conta como de hoje (o PC republica depois da meia-noite)
  if (it.fonte === "concluida" && !it.fim && !it.desde) it.semHora = true;
  return it;
}

// Junta delegações, workflows e "em espera" dos PCs, já cruzados com as sessões; o workflow que uma delegação lançou
// vai dentro dela ("dentro"). ctx: {pcs, sessoes (as da página, com pc e desligado), agora, pedidos (do cel_estado)}.
function juntar(linhas, ctx = {}) {
  const c = {pcs: ctx.pcs || [], sessoes: arr(ctx.sessoes), agora: ctx.agora || Date.now(), pedidos: arr(ctx.pedidos)};
  const wfs = new Map(), dels = new Map();
  for (const l of linhasValidas(linhas)) {
    for (const w of arr(l.trabalhos.itens)) if (w && (w.tipo === "workflow" || !w.tipo) && w.chave) wfs.set(`${l.pc}|${w.chave}`, normWorkflow(w, l.pc, c));
    for (const d of arr(l.trabalhos.delegacoes)) if (d && ["delegacao", "espera", undefined].includes(d.tipo) && (d.chave || d.sessao || d.o_que))
      dels.set(String(d.chave || d.sessao || d.o_que), normDelegacao(d, l.pc, c));
  }
  const soltos = [...wfs.values()];
  for (const d of [...dels.values()].filter(x => x.tipo === "delegacao").sort((a, b) => b.desde - a.desde)) {
    for (const w of soltos.filter(w => !w.pai)) {
      const peloRun = d.run && w.chave === d.run;
      const pelaSessao = !d.run && d.sessao && w.sessao === d.sessao && w.pc === d.pc && (!d.desde || !w.desde || w.desde >= d.desde - FOLGA_MS);
      if (peloRun || pelaSessao) { w.pai = d.chave; d.dentro.push(w); }
    }
  }
  const topo = [...dels.values(), ...soltos.filter(w => !w.pai)];
  for (const it of [...topo, ...topo.flatMap(x => x.dentro)]) completar(it, c);
  return ordenar(topo, "todos");
}

// ---- Filtros, ordem e seções -----------------------------------------------------------------------------
const fimDe = it => it.fim || it.mexeu || it.desde || 0;
const terminouHoje = (it, agora) => FINS.has(it.estado) && (it.semHora || fimDe(it) >= meiaNoite(agora));
function secaoDe(it) {
  // do PC desligado, só o que estava ativo fica no Ativos (congelado); o que já tinha terminado vai para os terminados
  if (it.congelado) return ["terminado", "parado", "outro"].includes(it.estado) ? "" : "desligado";
  if (it.estado === "rodando") return "rodando";
  if (it.estado === "esperando") return "esperando";
  if (FALHAS.has(it.estado)) return "falhas";
  if (it.estado === "espera") return "espera";
  return "";
}
// Ativos: prazo mais perto primeiro (com prazo antes de sem prazo), depois o mais novo. Falhas e terminados: o fim mais novo.
function compararAtivos(a, b) {
  if (!!a.prazo !== !!b.prazo) return a.prazo ? -1 : 1;
  if (a.prazo && b.prazo && a.prazo !== b.prazo) return a.prazo - b.prazo;
  return b.desde - a.desde;
}
const compararFim = (a, b) => fimDe(b) - fimDe(a);
function ordenar(itens, filtro) {
  const ordem = Object.fromEntries(SECOES.map(([k], i) => [k, i]));
  return [...itens].sort((a, b) => {
    const sa = secaoDe(a), sb = secaoDe(b), ra = sa ? ordem[sa] : 99, rb = sb ? ordem[sb] : 99;
    if (filtro !== "hoje" && ra !== rb) return ra - rb;
    if (filtro === "hoje" || ra === 99 || sa === "falhas") return compararFim(a, b);
    return compararAtivos(a, b);
  });
}

// O que aparece na tela. f: {filtro, projeto, grupo, pc, busca, mostrarDispensadas}; dispensadas: {chave: ms}.
// {secoes: [{k, titulo, itens}], itens, total, dispensadas: n escondidas, vazio: {texto, limpar} | null, corte}.
function filtrar(itens, f = {}, {agora = Date.now(), dispensadas = {}, totalHoje = null} = {}) {
  const filtro = FILTROS.some(([k]) => k === f.filtro) ? f.filtro : "ativos";
  const disp = it => !!(dispensadas && dispensadas[it.id]);
  const passa = it => (!f.pc || it.pc === f.pc) && (!f.projeto || it.projeto === f.projeto) && (!f.grupo || it.grupo === f.grupo)
    && combina(it.busca, f.busca);
  let base = arr(itens), escondidas = 0;
  if (filtro === "ativos") {
    base = base.filter(it => secaoDe(it));
    escondidas = base.filter(it => it.falha && disp(it) && passa(it)).length;
    if (!f.mostrarDispensadas) base = base.filter(it => !(it.falha && disp(it)));
  } else if (filtro === "esperando") base = base.filter(it => it.estado === "esperando" && !it.congelado);
  else if (filtro === "hoje") base = base.filter(it => terminouHoje(it, agora));
  const lista = ordenar(base.filter(passa), filtro);
  let secoes;
  if (filtro === "ativos") secoes = SECOES.map(([k, titulo]) => ({k, titulo, itens: lista.filter(it => secaoDe(it) === k)})).filter(s => s.itens.length);
  else if (filtro === "todos") secoes = [{k: "ativos", titulo: "Ativos", itens: lista.filter(it => secaoDe(it))},
    {k: "outros", titulo: "Terminados", itens: lista.filter(it => !secaoDe(it))}].filter(s => s.itens.length);
  else secoes = lista.length ? [{k: filtro, titulo: FILTROS.find(([k]) => k === filtro)[1], itens: lista}] : [];
  let vazio = null;
  if (!lista.length) {
    const busca = String(f.busca || "").trim();
    if (busca) vazio = {texto: `Nada encontrado para “${busca}”`, limpar: true};
    else if (f.projeto || f.grupo || f.pc) vazio = {texto: `Nada encontrado em ${f.projeto || f.grupo || nomeCurtoPc(f.pc)}`, limpar: true};
    else vazio = {texto: VAZIO[filtro], limpar: false};
  }
  const t = totalHoje || {};
  const corte = ["hoje", "todos"].includes(filtro) && t.terminados > t.mostrados
    ? `${t.mostrados} de ${t.terminados} terminados hoje · ver no PC` : "";
  return {filtro, secoes, itens: lista, total: lista.length, dispensadas: escondidas,
    mostrarDispensadas: filtro === "ativos" && escondidas && !f.mostrarDispensadas ? `Mostrar dispensadas (${escondidas})` : "", vazio, corte};
}

// Os chips de filtro com as contagens, o "Projeto ▾" (pastas agrupadas como em Sessões) e o "PC ▾" (só com dois PCs).
function opcoes(itens, {agora = Date.now(), dispensadas = {}} = {}) {
  const n = k => filtrar(itens, {filtro: k}, {agora, dispensadas}).total;
  const porPasta = {};
  for (const it of arr(itens)) { const k = it.grupo + "|" + it.projeto; porPasta[k] = (porPasta[k] || 0) + 1; }
  const projetos = L().GRUPOS.map(g => ({grupo: g, pastas: Object.entries(porPasta).filter(([k]) => k.split("|")[0] === g)
    .map(([k, q]) => ({pasta: k.split("|")[1], n: q})).sort((a, b) => b.n - a.n || a.pasta.localeCompare(b.pasta))})).filter(g => g.pastas.length);
  const pcs = [...new Set(arr(itens).map(it => it.pc).filter(Boolean))].sort();
  return {filtros: FILTROS.map(([k, titulo]) => ({k, titulo, n: n(k)})), projetos, pcs: pcs.length > 1 ? pcs : []};
}

// Os totais de hoje de todos os PCs ("15 de 25 terminados hoje"): os workflows (total_hoje) e as delegações
// terminadas (total_delegacoes, só no PC do maestro).
function totalHoje(linhas) {
  const t = {terminados: 0, mostrados: 0};
  const n = v => Math.max(0, parseInt(v, 10) || 0);
  for (const l of linhasValidas(linhas)) {
    const x = l.trabalhos.total_hoje || {}, d = l.trabalhos.total_delegacoes || {};
    t.terminados += n(x.terminados) + n(d.terminadas);
    t.mostrados += n(x.mostrados) + n(d.mostradas);
  }
  return t;
}

// ---- Bloco do Início ------------------------------------------------------------------------------------
// Contadores (cada um abre a tela já no filtro) e até 3 linhas urgentes: esperando você e falhas primeiro, depois o
// prazo mais perto. Sem nenhum item hoje, o bloco some (mostrar: false). Os itens de PC desligado não contam como
// rodando nem esperando (como as sessões). 0.9.1.1: nem como falha (a falha do PC desligado fica na seção "PC
// desligado", não em Falharam), e a delegação "desconhecido" (o maestro não via o PC) não conta como rodando nem é
// urgente, como no resumo_hoje do PC: assim o Início com a lista e sem ela dão os mesmos números.
function contagens(itens, {agora = Date.now(), dispensadas = {}} = {}) {
  const vivos = arr(itens).filter(it => !it.congelado && !it.incerto);
  const disp = it => !!(dispensadas && dispensadas[it.id]);
  const c = {rodando: vivos.filter(it => it.estado === "rodando").length,
    esperando: vivos.filter(it => it.estado === "esperando").length,
    falharam: vivos.filter(it => it.falha && !disp(it) && (it.estado === "fechada" || terminouHoje(it, agora) || !fimDe(it))).length,
    terminadosHoje: arr(itens).filter(it => terminouHoje(it, agora)).length,
    filtro: {rodando: "ativos", esperando: "esperando", falharam: "ativos", terminadosHoje: "hoje"}};
  const urg = [...vivos.filter(it => it.estado === "esperando").sort((a, b) => compararAtivos(a, b)),
    ...vivos.filter(it => it.falha && !disp(it)).sort(compararFim),
    ...vivos.filter(it => it.estado === "rodando" && it.prazo).sort((a, b) => a.prazo - b.prazo),
    ...vivos.filter(it => it.estado === "rodando" && !it.prazo).sort((a, b) => b.desde - a.desde)];
  c.urgentes = urg.slice(0, 3).map(it => ({id: it.id, chave: it.chave, icone: it.icone, nome: it.nome, chip: it.chip,
    pcCurto: it.pcCurto, pct: it.barra ? it.barra.pct : null, voz: it.voz}));
  c.mostrar = !!(c.rodando || c.esperando || c.falharam || c.terminadosHoje || arr(itens).some(it => it.estado === "espera"));
  return c;
}

// Sem o banco novo, o bloco usa as contagens que cada PC põe no hoje.painel.trabalhos (até 1 KB): {rodando, esperando,
// falharam, terminados_hoje, urgentes: [{nome, estado, pc, pct}]}. Os nomes aceitos variam pouco (leitura tolerante).
function contagensDoHoje(pcs, {agora = Date.now()} = {}) {
  const c = {rodando: 0, esperando: 0, falharam: 0, terminadosHoje: 0, urgentes: [], soContagens: true,
    filtro: {rodando: "ativos", esperando: "esperando", falharam: "ativos", terminadosHoje: "hoje"}};
  const num = (o, ...ks) => { for (const k of ks) if (o[k] != null) return Math.max(0, parseInt(o[k], 10) || 0); return 0; };
  for (const p of listaPcs(pcs)) {
    const t = painelDe(p).trabalhos;
    if (!t || typeof t !== "object") continue;
    const vivo = !desligado(p, agora);
    // 0.9.1.1: do PC desligado, nem as falhas (como o contagens com a lista: elas ficam na seção "PC desligado")
    if (vivo) { c.rodando += num(t, "rodando"); c.esperando += num(t, "esperando"); c.falharam += num(t, "falharam", "falhou", "falhas"); }
    c.terminadosHoje += num(t, "terminados_hoje", "terminados", "hoje");
    if (vivo) for (const u of arr(t.urgentes || t.linhas).slice(0, 3)) {
      if (!u || typeof u !== "object") continue;
      const e = CHIP[ESTADO_DO_PC[u.estado] || u.estado] ? ESTADO_DO_PC[u.estado] || u.estado : "rodando";
      const pct = typeof u.pct === "number" ? u.pct : u.total > 0 ? Math.max(0, Number(u.feitos) || 0) / u.total : null;
      c.urgentes.push({chave: String(u.chave || ""), nome: u.tipo === "workflow" || !u.tipo ? nomeWorkflow(u.nome) : txt(u.nome, 60) || "Delegação",
        icone: ICONE[u.tipo] || ICONE.workflow, chip: {texto: CHIP[e][0], cor: CHIP[e][1]}, pcCurto: nomeCurtoPc(u.pc || p.pc), pct, estado: e});
    }
  }
  const peso = u => u.estado === "esperando" || FALHAS.has(u.estado) ? 0 : 1;
  c.urgentes = c.urgentes.sort((a, b) => peso(a) - peso(b)).slice(0, 3);
  c.mostrar = !!(c.rodando || c.esperando || c.falharam || c.terminadosHoje);
  return c;
}

// ---- A folha do Trocar conta (a troca reinicia as sessões e para os workflows do PC) ----------------------------
// {texto, nomes, n, sabe} ou null quando não há nada rodando (vale a confirmação de sempre).
function folhaTrocarConta(pc, {linhas = [], pcs = [], agora = Date.now()} = {}) {
  const p = pcDe(pcs, pc), curto = nomeCurtoPc(pc);
  const naoSei = {texto: `Não sei se há workflows rodando no ${curto} (agente antigo ou sem sinal). Trocar mesmo?`, nomes: [], n: 0, sabe: false};
  if (!p || !online(p, agora) || !agenteNovo(p)) return naoSei;
  const l = linhasValidas(linhas).find(x => x.pc === pc);
  const vao = n => `${plural(n, "workflow rodando", "workflows rodando")} no ${curto} ${n === 1 ? "vai" : "vão"} parar`;
  if (l) {
    const rodando = arr(l.trabalhos.itens).filter(w => w && w.estado === "rodando").map(w => nomeWorkflow(w.nome));
    if (!rodando.length) return null;
    const nomes = rodando.length > 3 ? [...rodando.slice(0, 3), `mais ${rodando.length - 3}`] : rodando;
    return {texto: `${vao(rodando.length)}: ${juntarNomes(nomes)}. Trocar mesmo?`, nomes: rodando, n: rodando.length, sabe: true};
  }
  // 0.9.1.1: sem a lista, o workflows_rodando do resumo_hoje (só os workflows deste PC). O "rodando" soma as delegações
  // (no PC do maestro, as que rodam no outro PC) e deixa de fora o workflow cuja sessão dona pergunta; só com agente velho
  const t = painelDe(p).trabalhos;
  const conta = t && typeof t === "object" ? (t.workflows_rodando != null ? t.workflows_rodando : t.rodando) : null;
  if (conta != null) {
    const n = Math.max(0, parseInt(conta, 10) || 0);
    return n ? {texto: `${vao(n)}. Trocar mesmo?`, nomes: [], n, sabe: true} : null;
  }
  return naoSei;
}

// ---- Dispensar (só no aparelho: localStorage, pela chave do item; nada vai ao banco nem ao maestro) ------------
const dispensar = (mapa, id, agora) => ({...(mapa || {}), [id]: agora});
const restaurar = (mapa, id) => { const m = {...(mapa || {})}; delete m[id]; return m; };
// O Desfazer do aviso vale 6 s; depois disso, só pelo "Mostrar dispensadas".
const desfazerDispensa = (mapa, id, agora) => mapa && mapa[id] && agora - mapa[id] <= DISPENSA_DESFAZER_MS ? restaurar(mapa, id) : (mapa || {});
function lerDispensadas(texto, agora) {
  let m;
  try { m = JSON.parse(texto || "{}"); } catch { return {}; }
  if (!m || typeof m !== "object" || Array.isArray(m)) return {};
  return Object.fromEntries(Object.entries(m).filter(([k, v]) => k.length < 300 && typeof v === "number" && agora - v < DISPENSA_GUARDA_MS));
}
const gravarDispensadas = (mapa, agora) => JSON.stringify(lerDispensadas(JSON.stringify(mapa || {}), agora));

// O filtro guardado no aparelho (aba, filtro, projeto, PC).
function lerFiltro(texto) {
  let f;
  try { f = JSON.parse(texto || "{}"); } catch { f = {}; }
  f = f && typeof f === "object" ? f : {};
  const um = (v, l) => l.some(([k]) => k === v) ? v : l[0][0];
  return {aba: ["workflows", "automacoes", "skills"].includes(f.aba) ? f.aba : "workflows", filtro: um(f.filtro, FILTROS),
    filtroAut: um(f.filtroAut, FILTROS_AUT), projeto: txt(f.projeto, 80), pc: txt(f.pc, 40)};
}

// ---- Estados da tela ----------------------------------------------------------------------------------------
// ctx: {carregando, erro, rede: {ok, em}, lidoEm (ms da última leitura boa), pcs, linhas, agora, aba}.
// {linha: {texto, cor, botao?, sub?}, esqueleto, semLista, faixas: [{texto, cor}]}.
function estadoTela({carregando = false, erro = "", rede = {}, lidoEm = 0, pcs = [], linhas = [], agora = Date.now(), aba = "workflows"} = {}) {
  const out = {linha: null, esqueleto: false, semLista: "", faixas: []};
  if (semRede(rede)) out.linha = {texto: `Sem internet desde ${horaOuDia(rede.em || lidoEm || agora, agora)}; esta é a última leitura`, cor: "espera"};
  else if (erro) out.linha = {texto: "Não consegui ler a lista", cor: "erro", botao: "Tentar de novo", sub: lidoEm ? `Última leitura às ${horaOuDia(lidoEm, agora)}` : ""};
  else if (carregando && !lidoEm) { out.linha = {texto: "Carregando", cor: "anda", sub: "Lendo os trabalhos dos PCs…"}; out.esqueleto = true; }
  else out.linha = {texto: lidoEm ? `Atualizado às ${horaOuDia(lidoEm, agora)}` : "Ainda sem leitura", cor: "", botao: "↻"};
  if (listaPcs(pcs).length && !bancoV10(pcs)) {
    out.semLista = "A lista chega quando o banco for atualizado. Por enquanto, só as contagens.";
    return out;
  }
  const oQue = {workflows: "Os workflows", automacoes: "As automações", skills: "As skills"}[aba] || "Os workflows";
  const comLista = new Set(linhasValidas(linhas).map(l => l.pc));
  for (const p of listaPcs(pcs).sort((a, b) => a.pc.localeCompare(b.pc))) {
    if (!agenteNovo(p)) out.faixas.push({texto: `${oQue} do ${nomeCurtoPc(p.pc)} aparecem quando o Seaninho do celular for atualizado lá`, cor: "espera"});
    else if (desligado(p, agora) && comLista.has(p.pc)) out.faixas.push({texto: `O ${nomeCurtoPc(p.pc)} está desligado: o que é dele ficou como estava (visto ${horaOuDia(vistoMs(p), agora)})`, cor: "off"});
  }
  const o = maestroDe(pcs), pm = o && pcDe(pcs, o.pc);
  if (aba === "workflows" && o && (!online(pm, agora) || o.vigia === false))
    out.faixas.push({texto: !online(pm, agora) ? `O maestro está desligado (${nomeCurtoPc(o.pc)}): as delegações são da última leitura`
      : "A vigia do maestro está desligada: as delegações podem estar atrasadas", cor: "espera"});
  // o relógio do ciclo, quando o maestro grava (trabalhos.maestro: {visto, proxima})
  const lm = o && linhasValidas(linhas).find(l => l.pc === o.pc), rel = (lm && lm.trabalhos.maestro) || {};
  if (aba === "workflows" && ms(rel.visto)) out.maestro = `Maestro visto às ${horaOuDia(ms(rel.visto), agora)}${
    ms(rel.proxima) > agora ? ` · próxima volta às ${horaOuDia(ms(rel.proxima), agora)}` : ""}`;
  const porPc = linhasValidas(linhas).sort((a, b) => String(a.pc).localeCompare(String(b.pc)));
  // 0.9.1.1: o Agendador do PC não respondeu (automacoes.py: automacoes_erro). A lista é a da última leitura boa
  // (automacoes_lidas_em, até 24 h) ou, sem ela, só os processos e as rotinas. O texto do erro não aparece (é do
  // PowerShell); a faixa diz o que a lista mostra
  if (aba === "automacoes") for (const l of porPc.filter(l => l.trabalhos.automacoes_erro)) {
    const lidas = ms(l.trabalhos.automacoes_lidas_em);
    out.faixas.push({texto: `Não consegui ler o Agendador do ${nomeCurtoPc(l.pc)}; ${lidas
      ? `mostrando a leitura ${leituraDe(lidas, agora)}` : "só os processos e as rotinas, sem as tarefas agendadas"}`, cor: "espera"});
  }
  // 0.9.1.1: o inventário estragado ou a leitura das skills que falhou (skills.py: skills_erro, texto curto feito para
  // a faixa). O mesmo texto nos dois PCs (o inventário fica no Drive) vira uma faixa só. Com o inventário estragado, o
  // juntarSkills não põe a faixa do exemplo: esta fica no lugar
  if (aba === "skills") {
    const erros = new Map();
    for (const l of porPc.filter(l => l.trabalhos.skills_erro)) {
      const t = textoDoErro(l.trabalhos.skills_erro);
      if (t) erros.set(t, [...(erros.get(t) || []), nomeCurtoPc(l.pc)]);
    }
    for (const [t, nomes] of erros) out.faixas.push({texto: `${nomes.length > 1 ? "Nos PCs" : "No"} ${juntarNomes(nomes)}: ${t}`, cor: "espera"});
  }
  return out;
}
// "das 14h20" (hoje), "de ontem, 18h" ou "de 02/11".
function leituraDe(t, agora) {
  const n = diasEntre(agora, t);
  return n <= 0 ? `das ${horaCurta(t)}` : n === 1 ? `de ontem, ${horaCurta(t)}` : `de ${ddmm(t)}`;
}
// O texto de erro que o PC mandou, sem o nome técnico da exceção ("(PermissionError)").
const textoDoErro = v => maiuscula(txt(String(v || "").replace(/\s*\((?:[A-Za-z]+(?:Error|Exception|Warning)|OSError)\)/g, ""), 160));

// O link #wf=<chave> (ou a notificação) de um item: {item, pai} ou, se ele sumiu, o aviso e a tela no Ativos.
// conhecidos: {chave: ms} que a página guarda dos itens já vistos; em: a data que veio no link, se veio.
function doLink(itens, chave, {conhecidos = {}, em = 0} = {}) {
  for (const it of arr(itens)) {
    if (it.chave === chave) return {item: it, pai: null};
    const w = arr(it.dentro).find(x => x.chave === chave);
    if (w) return {item: w, pai: it};
  }
  const quando = ms(em) || ms(conhecidos && conhecidos[chave]);
  return {item: null, sumiu: true, filtro: "ativos", texto: `Este item não existe mais${quando ? ` (era de ${ddmm(quando)})` : ""}`};
}

// ---- Botões do cartão --------------------------------------------------------------------------------------
// Os arquivos do resultado: os PDFs e imagens que a sessão dona mostrou na conversa depois do fim (workflow) ou
// depois da delegação. Nada é pedido ao PC aqui.
function arquivosDoResultado(it, sessoes) {
  const s = sessaoDe(it, sessoes);
  if (!s) return [];
  const desde = (it.tipo === "workflow" ? (it.fim || it.desde) : it.desde) - FOLGA_MS;
  const vistos = new Set(), out = [];
  for (const m of [...arr(s.conversa)].reverse()) {
    if (!m || m.de !== "claude" || (m.t || 0) * 1000 < desde) continue;
    for (const d of arr(m.docs)) if (d && d.id && !vistos.has("pdf:" + d.id)) { vistos.add("pdf:" + d.id); out.push({tipo: "pdf", id: d.id, nome: d.nome || "PDF", paginas: d.paginas || 0}); }
    for (const f of arr(m.fotos)) if (f && f.nome && !vistos.has("img:" + f.nome)) { vistos.add("img:" + f.nome); out.push({tipo: "imagem", id: f.id || "", nome: f.nome, src: f.src || ""}); }
  }
  return out.slice(0, 12);
}

// Abrir resultado: {ok, motivo, nota?, arquivos, previa}. ctx.noAparelho(arq) diz o que já está guardado no aparelho;
// ctx.sumiu(arq), o que o PC disse que não existe mais.
function abrirResultado(it, {pcs = [], sessoes = [], agora = Date.now(), rede = true, noAparelho = null, sumiu = null} = {}) {
  let arqs = arquivosDoResultado(it, sessoes);
  const previa = (arqs.find(a => a.tipo === "imagem" && a.src) || {}).src || "";
  if (!arqs.length) return {ok: false, motivo: "A sessão não mostrou nenhum arquivo do resultado", arquivos: [], previa};
  if (sumiu) { const ficam = arqs.filter(a => !sumiu(a)); if (!ficam.length) return {ok: false, motivo: "O arquivo não está mais no PC", arquivos: [], previa}; arqs = ficam; }
  const p = pcDe(pcs, it.pc), fora = semRede(rede) || !online(p, agora);
  if (!fora) return {ok: true, motivo: "", arquivos: arqs, previa};
  const motivo = semRede(rede) ? "Sem internet" : foraDoAr(p, it.pc, agora);
  const guardados = noAparelho ? arqs.filter(a => noAparelho(a)) : [];
  return guardados.length ? {ok: true, motivo: "", nota: `${motivo}: só o que já está no aparelho`, arquivos: guardados, previa}
    : {ok: false, motivo, arquivos: arqs, previa};
}

// Responder (pergunta 55 a): direto à sessão dona, como no chat e no Para você; na delegação, o maestro fica sabendo
// pelo "respondido" (avisarMaestro). Sessão fechada: pelo maestro, numa próxima versão. 0.9.0.15: terminal, app do
// Claude e segundo plano entram (o agente 0.9.0.15 manda pelo maestro ou de fundo); sem caminho, o porquê dele
// (motivo_entrega); com o agente de antes no PC da sessão, fora do VS Code, o aviso é atualizar.
function responder(it, {pcs = [], sessoes = [], agora = Date.now(), rede = true} = {}) {
  if (it.tipo === "espera") {
    const o = maestroDe(pcs), pm = o && pcDe(pcs, o.pc);
    const ok = !semRede(rede) && !!o && online(pm, agora) && !!o.sessao;
    return {acao: "responder_maestro", texto: "Responder ao maestro", ok, conversa: null, resolvido: true,
      motivo: ok ? "" : semRede(rede) ? "Sem internet" : !o || !o.sessao ? "O maestro não está aberto" : foraDoAr(pm, o.pc, agora)};
  }
  const s = sessaoDe(it, sessoes), conversa = s ? {pc: s.pc, id: s.id} : null, p = pcDe(pcs, it.pc);
  const base = {acao: "responder", texto: "Responder", conversa, avisarMaestro: it.tipo === "delegacao"};
  if (semRede(rede)) return {...base, ok: false, motivo: "Sem internet"};
  if (!online(p, agora)) return {...base, ok: false, motivo: foraDoAr(p, it.pc, agora)};
  if (!s) return {...base, ok: false, motivo: "A sessão foi fechada: responder pelo maestro chega numa próxima versão"};
  if (s.onde && s.onde !== "VS Code" && !s.entregavel) {
    const pcS = pcDe(pcs, s.pc) || p;
    if (!pcS || compararVersao(pcS.versao, AGENTE_QUALQUER) < 0)
      return {...base, ok: false, motivo: `A sessão está no ${s.onde}: o ${nomeCurtoPc(s.pc || it.pc) || "PC"} precisa do Seaninho do celular ${AGENTE_QUALQUER} para entregar nela`};
    // a pergunta com opções e a permissão que o PC responde daqui (respondivel) vão pelos botões do chat, sem a caixa
    if (!(s.respondivel && (s.enquete || s.permissao)))
      return {...base, ok: false, motivo: txt(s.motivo_entrega, 200) || `A sessão está no ${s.onde} e agora nenhum caminho chega até ela`};
  }
  return {...base, ok: true, motivo: ""};
}

// O botão principal do cartão: Responder (esperando você), Responder ao maestro (em espera), Abrir resultado (terminou
// com arquivo) ou Ver. O resto vai no ⋯ (outros), com o Dispensar nas falhas.
function botoes(it, ctx = {}) {
  const outros = [];
  const conversa = (() => { const s = sessaoDe(it, ctx.sessoes); return s ? {pc: s.pc, id: s.id} : null; })();
  let principal;
  if (it.estado === "esperando") principal = responder(it, ctx);
  else if (it.tipo === "espera") { principal = responder(it, ctx); outros.push({acao: "resolvido", texto: "✓ Resolvido", ok: principal.ok, motivo: principal.motivo}); }
  else if (FINS.has(it.estado)) {
    const r = abrirResultado(it, ctx);
    principal = r.arquivos.length || r.ok ? {acao: "abrir_resultado", texto: "Abrir resultado", ...r} : {acao: "ver", texto: "Ver", ok: true, motivo: ""};
    if (principal.acao === "ver") outros.push({acao: "abrir_resultado", texto: "Abrir resultado", ok: false, motivo: r.motivo});
  } else principal = {acao: "ver", texto: "Ver", ok: true, motivo: ""};
  if (conversa && principal.acao !== "responder") outros.push({acao: "abrir_conversa", texto: "Abrir a conversa", ok: true, motivo: "", conversa});
  if (principal.acao === "responder" && conversa) outros.push({acao: "abrir_conversa", texto: "Abrir a conversa", ok: true, motivo: "", conversa});
  if (it.falha) outros.push({acao: (ctx.dispensadas || {})[it.id] ? "restaurar" : "dispensar",
    texto: (ctx.dispensadas || {})[it.id] ? "Trazer de volta" : "Dispensar", ok: true, motivo: ""});
  return {principal, outros};
}

// A citação da resposta pela tela (Chat.citacao monta a linha): "↩ Respondendo a (Workflows · <nome>, 16:41): "…"".
function citacaoDe(it, sessoes) {
  const s = sessaoDe(it, sessoes);
  const t = s && s.desde ? s.desde * 1000 : it.mexeu || it.desde || Date.now();
  return {nome: `Workflows · ${String(it.nome).replace(/[,()]/g, " ").trim()}`, hora: hhmm(t),
    texto: (it.status && it.status.linha) || it.resumo || (typeof it.resultado === "string" && it.resultado) || it.nome};
}
// Nada pessoal vai ao maestro (pergunta 44 a): item de pasta pessoal ou sem pasta fica só no celular.
const podeIrAoMaestro = it => !!it && !it.pessoal && !!it.cwd;

// ---- Automações ---------------------------------------------------------------------------------------------
// O resultado da última execução em palavras: "ok", o texto que o PC traduziu ("arquivo não encontrado") ou "deu erro"
// quando só veio um código. Processos e crons não têm código (codigo null): vale o texto deles.
function resultadoTexto(r, situacao) {
  if (situacao === "rodando") return "rodando";
  if (!r || typeof r !== "object") return "";
  if (r.codigo != null && r.codigo !== "" && Number(r.codigo) === 0) return "ok";
  const t = txt(r.texto, 60);
  if (r.codigo == null || r.codigo === "") return t;
  return !t || /^(erro\s*)?(0x[0-9a-f]+|-?\d+)$/i.test(t) ? "deu erro" : t;
}
const nomeAutomacao = (a, caminho) => txt(a.nome, 60) || txt(String(caminho).split(/[\\/]/).filter(Boolean).pop() || "", 60) || "Automação";
// 0.9.1.1: sem a data da última execução, "nunca rodou" só quando o PC diz nunca_rodou. Nas outras (ativa, parada, com
// erro, sem leitura) ela já rodou ou não se sabe: vale o que o PC disse do resultado ("pela auditoria de 04/11: 29/10",
// "não achei no Agendador deste PC"); sem isso, "sem registro da última execução". Não servem sem a data: o "ok" (código
// 0 sem execução), o "rodando" (o chip já diz) e o "o que a auditoria viu" (o texto de reserva do automacoes.py, que não
// diz nada da última).
const SEM_REGISTRO = "sem registro da última execução";
const RES_SEM_DATA_VAZIO = /^(ok|rodando|o que a auditoria viu)$/i;
function semUltimaTexto(situacao, res) {
  if (situacao === "nunca_rodou") return "nunca rodou";
  if (!res || RES_SEM_DATA_VAZIO.test(res)) return SEM_REGISTRO;
  return /^pela auditoria\b/i.test(res) ? `última ${res}` : res;
}

function normAutomacao(a, pc, agora, p) {
  const caminho = String(a.caminho || "");
  const situacao = SITUACAO[a.situacao] ? a.situacao : ms(a.ultima) ? "ativa" : "nunca_rodou";
  const ultima = ms(a.ultima), proxima = ms(a.proxima), res = resultadoTexto(a.resultado, situacao);
  const congelado = !!p && desligado(p, agora), visto = p ? vistoMs(p) : 0;
  const [rot, cor] = SITUACAO[situacao];
  const it = {tipo: "automacao", id: `automacao:${a.chave || pc + "|" + caminho}`, chave: String(a.chave || `${pc}|${caminho}`),
    pc: String(a.pc || pc), caminho, nome: nomeAutomacao(a, caminho), faz: txt(a.faz, 140), situacao, ultima, proxima,
    resultado: res, pessoal: a.pessoal === true, congelado, visto};
  it.pcCurto = nomeCurtoPc(it.pc);
  // 0.9.1.1: a que o PC não conseguiu ver também não roda (o automacoes.py já manda pode_rodar false; reforço)
  it.pode_rodar = a.pode_rodar !== false && !it.pessoal && situacao !== "desconhecida";
  it.motivo = it.pessoal ? "Pessoal: rode no próprio PC" : a.pode_rodar === false ? maiuscula(txt(a.motivo, 120)) || "Esta não roda pelo celular"
    : situacao === "desconhecida" ? "Sem leitura do PC agora" : "";
  // o que o PC manda a mais (automacoes.py): o horário em palavras, o veredito da auditoria e a última linha do log
  it.origem = String(a.origem || "agendador");
  it.quando = txt(a.quando, 80);
  it.veredito = txt(a.veredito, 30);
  it.nota = txt(a.nota, 200);
  const r = a.resultado && typeof a.resultado === "object" ? a.resultado : {};
  it.log = txt(r.log, 160);
  it.logErro = r.log_erro === true;
  it.chip = congelado ? {texto: `era: ${rot.toLowerCase()} · visto ${horaOuDia(visto, agora)}`, cor: "off"} : {texto: rot, cor};
  // a que repete a cada poucos minutos vem com a última em degraus de 5 min e sem a próxima (ultima_aprox)
  const ultimaQuando = a.ultima_aprox ? quandoFoi(ultima, agora).replace(/(\d+h\d*)$/, "por volta das $1") : quandoFoi(ultima, agora);
  it.ultimaTexto = ultima ? `última: ${ultimaQuando}${res ? " · " + res : ""}` : semUltimaTexto(situacao, res);
  it.proximaTexto = situacao === "parada" ? "" : proxima ? `próxima: ${quandoVai(proxima, agora)}` : it.quando;
  // na "desconhecida", a voz não repete o "não consegui ver" que vem no resultado
  const voz = VOZ_SITUACAO[situacao] || rot.toLowerCase(), resVoz = situacao === "desconhecida" ? "" : res;
  it.voz = [`Automação ${it.nome} no ${it.pcCurto}`, congelado ? `era ${voz}, PC desligado` : voz,
    ultima ? `última ${ultimaQuando}${resVoz ? ", " + resVoz : ""}` : semUltimaTexto(situacao, resVoz),
    proxima && it.proximaTexto ? `próxima ${quandoVai(proxima, agora)}` : it.proximaTexto].filter(Boolean).join(", ");
  it.busca = normalizar([it.nome, it.faz, it.pc, it.pcCurto, caminho, it.quando, it.veredito].join(" "));
  return it;
}

// As automações dos PCs, na ordem da tela: com erro e rodando primeiro, depois a próxima execução; PC desligado no fim.
function juntarAutomacoes(linhas, {pcs = [], agora = Date.now()} = {}) {
  const m = new Map();
  for (const l of linhasValidas(linhas))
    for (const a of arr(l.trabalhos.automacoes)) if (a && (a.tipo === "automacao" || !a.tipo) && (a.caminho || a.chave)) {
      const it = normAutomacao(a, l.pc, agora, pcDe(pcs, a.pc || l.pc));
      m.set(it.chave, it);
    }
  return ordenarAutomacoes([...m.values()]);
}
function ordenarAutomacoes(l) {
  const rank = a => (a.congelado ? 10 : 0) + (a.situacao === "com_erro" ? 0 : a.situacao === "rodando" ? 1 : 2);
  // sem próxima nos dois (Infinity - Infinity dá NaN, que passa adiante): a ordem do automacoes.py, com a "sem leitura"
  // entre a parada e a ativa; depois o nome
  return [...l].sort((a, b) => rank(a) - rank(b) || (a.proxima || Infinity) - (b.proxima || Infinity)
    || ordemSituacao(a) - ordemSituacao(b) || a.nome.localeCompare(b.nome, "pt"));
}
// f: {filtro: todas|rodando|com_erro|paradas, pc, busca}. {itens, contagens, vazio}.
function filtrarAutomacoes(lista, f = {}) {
  const filtro = FILTROS_AUT.some(([k]) => k === f.filtro) ? f.filtro : "todas";
  const da = {todas: () => true, rodando: a => a.situacao === "rodando", com_erro: a => a.situacao === "com_erro", paradas: a => a.situacao === "parada"}[filtro];
  const passa = a => (!f.pc || a.pc === f.pc) && combina(a.busca, f.busca);
  const itens = ordenarAutomacoes(arr(lista).filter(a => da(a) && passa(a)));
  const cont = Object.fromEntries(FILTROS_AUT.map(([k]) => [k, arr(lista).filter(a => ({todas: () => true, rodando: x => x.situacao === "rodando",
    com_erro: x => x.situacao === "com_erro", paradas: x => x.situacao === "parada"})[k](a) && passa(a)).length]));
  const busca = String(f.busca || "").trim();
  const vazio = itens.length ? null : busca ? {texto: `Nada encontrado para “${busca}”`, limpar: true}
    : f.pc ? {texto: `Nada encontrado no ${nomeCurtoPc(f.pc)}`, limpar: true} : {texto: VAZIO_AUT[filtro], limpar: false};
  const pcs = [...new Set(arr(lista).map(a => a.pc))].sort();
  return {filtro, itens, contagens: cont, filtros: FILTROS_AUT.map(([k, titulo]) => ({k, titulo, n: cont[k]})), pcs: pcs.length > 1 ? pcs : [], vazio};
}

// ---- Rodar agora (o celular não dispara no PC: o pedido vai à caixa do maestro, que confere e roda) ----------------
// O andamento de cada pedido, publicado pelo PC do maestro (pedidos_automacao).
const andamentosDe = linhas => linhasValidas(linhas).flatMap(l => arr(l.trabalhos.pedidos_automacao)).filter(x => x && x.ref);
const novoRef = (agora, aleatorio = Math.random) => `ra${Math.floor(agora / 1000).toString(36)}-${Math.floor(aleatorio() * 36 ** 6).toString(36).padStart(6, "0")}`;
const REF_OK = /^[a-z0-9-]{6,40}$/;   // o agente aceita [0-9A-Za-z-]{6,40} e grava "cel-<ref>" na caixa
// o agente confere de novo (validar_pedido_rodar): até 120 letras, sem "..", sem quebra de linha nem aspas
const caminhoSeguro = c => typeof c === "string" && c.length > 0 && c.length <= 120 && c === c.trim() && !c.includes("..")
  && !/[\u0000-\u001f\u007f"`<>]/.test(c);
// Os "Rodar agora" do banco (os pedidos do cel_estado, tipo acao), já com o texto lido: [{p, t}].
const pedidosRodar = pedidos => arr(pedidos).filter(p => p && p.tipo === "acao").map(p => {
  let t; try { t = JSON.parse(p.texto || "{}"); } catch { return null; }
  return t && typeof t === "object" && t.acao === "rodar_automacao" && typeof t.ref === "string" ? {p, t} : null;
}).filter(Boolean);
function pedidoDoBanco(pedidos, ref) {
  const x = pedidosRodar(pedidos).find(x => x.t.ref === ref);
  return x ? x.p : null;
}
// 0.9.1.1: os refs dos pedidos desta automação que estão no banco (o PC e o caminho do texto iguais aos do cartão, sem
// diferença de maiúsculas, como o agente confere). Depois de recarregar a página o toque some e o andamento do maestro
// pode demorar (ele publica a cada 30 s, e só quando muda): é o pedido do banco que segura o botão até lá.
const refsDoBanco = (pedidos, a) => {
  const igual = (x, y) => String(x || "").toLowerCase() === String(y || "").toLowerCase();
  return pedidosRodar(pedidos).filter(x => igual(x.t.pc, a.pc) && igual(x.t.caminho, a.caminho)).map(x => x.t.ref);
};
const PEDIDO_VIVO = new Set(["enviado", "recebido", "rodando"]);

// O estado do "Rodar agora" no cartão: {etapa, texto, cor, botao: {texto, ok, motivo}, desfazerAte?, enviar?, ref?}.
// Etapas: disponivel | cinza | tocado | enviado | recebido | rodando | feito | erro | expirou.
// toque (só na página): {ref, em, enviado?}; pedidos: os do cel_estado; linhas: as do cel_trabalhos (o andamento
// publicado pelo PC do maestro e o aceita_rodar dele).
function rodarAgora(a, {agora = Date.now(), rede = true, pcs = [], toque = null, pedidos = [], linhas = []} = {}) {
  const andamentos = andamentosDe(linhas);
  const botao = (ok, motivo = "") => ({texto: "Rodar agora", ok, motivo});
  if (toque && toque.erro && !toque.enviado) {   // o cel_pedir falhou (a página guarda o erro no toque): dá para tentar de novo
    const r = rodarAgora(a, {agora, rede, pcs, toque: null, pedidos, linhas});
    return {...r, etapa: "erro", texto: `Não consegui pedir: ${txt(toque.erro, 120)}`, cor: "erro", ref: toque.ref};
  }
  if (toque && !toque.enviado) {
    const ate = toque.em + RODAR_DESFAZER_MS;
    return {etapa: "tocado", texto: "Pedindo ao maestro…", cor: "anda", desfazerAte: ate, enviar: agora >= ate, ref: toque.ref, botao: botao(false)};
  }
  // Os pedidos desta automação: o tocado aqui, os que o maestro publicou e (0.9.1.1) os que já estão no banco. Cada um
  // com a etapa dele; vale o que ainda está em andamento (o toque, se for ele) e, sem nenhum, o mais novo.
  const situacaoDe = r => {
    const and = arr(andamentos).find(x => x.ref === r) || null, ped = pedidoDoBanco(pedidos, r);
    const meu = toque && toque.ref === r ? toque : null;
    if (!and && ped && ped.estado === "cancelado") return null;   // cancelado antes de chegar ao maestro: não conta
    const em = (meu && meu.em) || ms(and && and.pedido_em) || ms(ped && ped.criado_em);
    let st = null;
    if (and && ["enviado", "recebido", "rodando", "feito", "erro", "expirou"].includes(and.estado)) st = and.estado;
    else if (ped && ped.estado === "erro") st = "erro";
    else if (ped || meu) st = "enviado";
    let quando = ms(and && and.atualizado_em) || ms(ped && ped.atualizado_em) || em;
    if (["enviado", "recebido"].includes(st) && em && agora - em > RODAR_EXPIRA_MS) { st = "expirou"; quando = em + RODAR_EXPIRA_MS; }
    // 0.9.1.1: o erro que não veio do andamento do maestro é o do agente, que recusou antes da caixa (não rodou)
    const recusa = st === "erro" && !(and && and.estado === "erro");
    return {ref: r, st, em, quando, recusa, msg: txt((and && and.mensagem) || (st === "erro" && ped && ped.erro) || "", 160)};
  };
  const refs = new Set([...(toque ? [toque.ref] : []), ...arr(andamentos).filter(x => x.chave_automacao === a.chave).map(x => x.ref),
    ...refsDoBanco(pedidos, a)]);
  const todos = [...refs].map(situacaoDe).filter(Boolean).sort((x, y) => y.em - x.em);
  const atual = todos.find(x => PEDIDO_VIVO.has(x.st)) || (toque && todos.find(x => x.ref === toque.ref)) || todos[0]
    || {ref: toque ? toque.ref : undefined, st: null, em: 0, quando: 0, msg: ""};
  const {ref, st, em, quando, msg, recusa} = atual;
  const ETAPA = {enviado: ["Pedido enviado ao maestro", "anda"], recebido: ["O maestro recebeu o pedido", "anda"],
    rodando: [textoEtapa("rodando", msg), "anda"], feito: [textoEtapa("feito", msg), "ok"],
    erro: [textoEtapa("erro", msg, {recusa}), "erro"], expirou: [textoEtapa("expirou", msg), "erro"]};
  if (["enviado", "recebido", "rodando"].includes(st)) return {etapa: st, texto: ETAPA[st][0], cor: ETAPA[st][1], ref, botao: botao(false, "Já pedida: acompanhe aqui")};
  const fim = st && agora - quando < RODAR_MOSTRA_MS ? {etapa: st, texto: ETAPA[st][0], cor: ETAPA[st][1], ref} : null;
  // o botão: cinza com o motivo, nesta ordem
  const o = maestroDe(pcs), pm = o && pcDe(pcs, o.pc), pa = pcDe(pcs, a.pc);
  const lMaestro = o && linhasValidas(linhas).find(l => l.pc === o.pc);
  let motivo = "";
  if (a.pessoal) motivo = "Pessoal: rode no próprio PC";
  else if (a.pode_rodar === false) motivo = a.motivo || "Esta não roda pelo celular";
  else if (semRede(rede)) motivo = "Sem internet";
  else if (!o) motivo = "O maestro não está rodando em nenhum PC";
  else if (!online(pm, agora)) motivo = `O PC do maestro (${nomeCurtoPc(o.pc)}) está desligado`;
  else if (!agenteNovo(pm)) motivo = `Atualize o Seaninho do celular no PC do maestro (${nomeCurtoPc(o.pc)})`;
  else if (lMaestro && lMaestro.trabalhos.aceita_rodar === false) motivo = "O maestro ainda não aceita este pedido";
  else if (!online(pa, agora)) motivo = foraDoAr(pa, a.pc, agora);
  else if (a.situacao === "rodando") motivo = "Já está rodando";
  else if (em && agora - em < RODAR_REPETIR_MS) motivo = agora - em < 60000 ? "Já pedida agora há pouco" : `Já pedida há ${Math.floor((agora - em) / 60000)} min`;
  return {...(fim || {etapa: motivo ? "cinza" : "disponivel", texto: "", cor: ""}), botao: botao(!motivo, motivo)};
}
// 0.9.1.1: o texto da etapa com a mensagem do maestro. Ele grava a mensagem já com a palavra do estado (passo 1b do
// CICLO.md: "rodando agora", "terminou: <resultado>", "expirou: cheguei tarde; não rodei"): aí ela vai como veio, sem
// o rótulo na frente ("Rodando: rodando agora"). O andamento que não começa com "rodando" ("pedindo à sessão X no
// PC", no outro PC) ainda não é a tarefa rodando: "O maestro está cuidando: …".
const PALAVRA_ETAPA = {rodando: /^rodando\b\s*[:—–-]?\s*/i, feito: /^(terminou|terminado|feito)\b\s*[:—–-]?\s*/i,
  erro: /^erro\b\s*[:—–-]?\s*/i, expirou: /^expirou\b\s*[:—–-]?\s*/i};
// 0.9.1.1: o "erro" cobre dois casos, e só um é "Não rodou". (1) O pedido que não chegou a rodar: o agente recusou (o
// erro do pedido no banco, sem andamento do maestro), a vigia fechou ("recusado: …; não rodei") ou o maestro parou na
// conferência do passo 1b (1) ("pessoal: …", "não sei rodar esse tipo daqui", "a tarefa não existe…"). (2) O run que
// rodou e deu errado (passo 1b (4): erro <id> "<o que deu>"): "Rodou com erro: …" quando a mensagem começa com
// "rodou"/"terminou"; sem pista nenhuma, "Deu erro: …", que vale nos dois casos.
const JA_DIZ_NAO_RODOU = /^(recusad[oa]|não\s+rodou|não\s+rodei)\b/i;
const NAO_RODOU = /^pessoal\b|\bnão\s+(rodei|rodou|rodo|vou\s+rodar|sei\s+rodar|pode\s+rodar|existe)\b|\bsem\s+rodar\b/i;
const RODOU = /^(rodou|terminou|executou)\b/i;
const RODOU_PALAVRA = /^(rodou|terminou|executou)\b(\s*,?\s*(e|mas)\s+deu\s+erro|\s+com\s+erro)?\s*([:—–-]\s*|$)/i;
function textoErro(m, recusa) {
  const r = m.replace(PALAVRA_ETAPA.erro, "");
  if (!r) return recusa ? "Não rodou: o pedido foi recusado" : "Deu erro; o maestro não disse o quê";
  if (JA_DIZ_NAO_RODOU.test(r)) return maiuscula(r);   // "Recusado: …; não rodei", sem "Não rodou: recusado: …"
  // o "pessoal: rode no próprio PC" do passo 1b (1) sem os dois-pontos em dobro
  if (recusa || (!RODOU.test(r) && NAO_RODOU.test(r))) return `Não rodou: ${r.replace(/^pessoal\s*:\s*/i, "pessoal, ")}`;
  if (RODOU.test(r)) { const d = r.replace(RODOU_PALAVRA, ""); return d ? `Rodou com erro: ${d}` : "Rodou com erro"; }
  return `Deu erro: ${r}`;
}
// recusa: o erro veio do agente (o pedido do banco), antes da caixa do maestro; o pedido não rodou.
function textoEtapa(st, msg, {recusa = false} = {}) {
  const m = txt(msg, 160);
  if (st === "erro") return textoErro(m, recusa);
  const tinha = PALAVRA_ETAPA[st].test(m), resto = m.replace(PALAVRA_ETAPA[st], "");
  if (st === "rodando") return !resto ? "Rodando agora" : tinha ? maiuscula(m) : `O maestro está cuidando: ${m}`;
  if (st === "feito") return !resto ? "Terminou" : tinha || /^j[áa] estava rodando/i.test(m) ? maiuscula(m) : `Terminou: ${m}`;
  return !resto ? "O maestro não respondeu em 30 min" : tinha ? maiuscula(m) : `Expirou: ${m}`;
}

// O toque: só vale com o botão liberado (o toque duplo não manda dois). Devolve o toque novo ou null.
function tocar(a, ctx = {}, aleatorio = Math.random) {
  const e = rodarAgora(a, ctx);
  if (!e.botao.ok) return null;
  return {ref: novoRef(ctx.agora || Date.now(), aleatorio), em: ctx.agora || Date.now(), enviado: false};
}
// Desfazer dentro dos 3 s: o toque some (null). Depois, já foi.
const desfazerToque = (toque, agora) => toque && !toque.enviado && agora < toque.em + RODAR_DESFAZER_MS ? null : toque;
const marcarEnviado = (toque, agora) => toque ? {...toque, enviado: true, enviado_em: agora} : toque;
// O pedido ao agente do PC do maestro (cel_pedir tipo acao). Nunca de automação pessoal; só com campos que passam.
function pedidoRodar(a, {pcs = [], ref = ""} = {}) {
  const o = maestroDe(pcs);
  if (!o || !a || a.pessoal || a.pode_rodar === false || !REF_OK.test(ref) || !caminhoSeguro(a.caminho) || !pcDe(pcs, a.pc)) return null;
  return {pc: o.pc, tipo: "acao", texto: JSON.stringify({acao: "rodar_automacao", pc: a.pc, caminho: a.caminho, ref})};
}

// ---- Skills -----------------------------------------------------------------------------------------------------
function versaoMenor(a, b) {
  if (!a || !b) return false;
  const data = /^\d{4}-\d{2}-\d{2}/;
  if (data.test(a) && data.test(b)) return String(a) < String(b);
  return compararVersao(a, b) < 0;
}
// "2026-11-03" é um dia, não um instante: sem passar por Date (o fuso puxaria para 02/11).
const DATA_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const dataTexto = v => { const d = DATA_RE.exec(String(v || "")); if (d) return `${d[3]}/${d[2]}`; const t = ms(v); return t ? ddmm(t) : ""; };
const versaoMostrar = v => DATA_RE.test(String(v || "")) ? dataTexto(v) : String(v || "");

function normSkill(s, pc) {
  const fonte = ["local", "sincronizada", "repositorio", "inventario", "exemplo"].includes(s.fonte) ? s.fonte : "local";
  // a que está neste PC diz a versão deste PC. 0.9.1.1: a que está só no clone do repositório do time (skills.py:
  // "repositorio", sem PC) não está instalada, como a do inventário: fica fora dos PCs e das versões por PC
  const instalada = !["inventario", "exemplo", "repositorio"].includes(fonte);
  const pcs = [...new Set([...arr(s.pcs), ...(instalada && pc ? [pc] : [])].filter(Boolean).map(String))].sort();
  // a versão do repositório é a do time: com ela, as cópias instaladas que estão atrás aparecem (completarSkill)
  const versao = txt(s.versao, 20), versaoTime = txt(s.versao_time, 20) || (fonte === "repositorio" ? versao : "");
  return {tipo: "skill", id: `skill:${txt(s.nome, 80)}${fonte === "exemplo" ? ":exemplo" : ""}`, chave: String(s.chave || `skill:${s.nome}`),
    nome: txt(s.nome, 80), faz: txt(s.faz, 160), versao, versaoTime, data: s.data || "",
    onde: ["pc", "time", "pessoal"].includes(s.onde) ? s.onde : "pc", pcs, caminho: txt(s.caminho, 200), fonte,
    exemplo: fonte === "exemplo", repositorio: txt(s.repositorio, 120),
    compartilhada_com: arr(s.compartilhada_com).filter(x => x && x.pessoa).map(x => ({pessoa: txt(x.pessoa, 40), versao: txt(x.versao, 20),
      atualizada: x.atualizada === true ? true : x.atualizada === false ? false : null})),
    porPc: instalada && pc ? {[pc]: versao} : {}, atrasadaEm: instalada && pc && s.atualizada_aqui === false ? [pc] : []};
}

// As skills de todos os PCs: a mesma skill nos dois PCs vira um cartão só (a versão mais nova, os PCs e as pessoas
// juntos). Os itens de exemplo (sem o inventário, o PC manda as locais e o exemplo do formato final) ficam à parte,
// marcados, com a faixa. {itens, exemplo: bool, faixa}.
const SEM_PC = new Set(["inventario", "repositorio"]);   // as fontes que não dizem que a skill está instalada num PC
const maiorVersao = (a, b) => !a ? b : !b ? a : versaoMenor(a, b) ? b : a;
// Onde a skill mora quando os PCs discordam: pessoal manda (nada pessoal vira do time), depois o repositório do time.
const ondeJunto = (a, b) => [a, b].includes("pessoal") ? "pessoal" : [a, b].includes("time") ? "time" : a || b;

function juntarSkills(linhas) {
  const todas = linhasValidas(linhas).flatMap(l => arr(l.trabalhos.skills)
    .filter(s => s && s.nome && (s.tipo === "skill" || !s.tipo)).map(s => normSkill(s, l.pc)));
  const m = new Map();
  for (const n of todas) {
    const k = normalizar(n.nome) + (n.exemplo ? "#exemplo" : ""), ja = m.get(k);
    if (!ja) { m.set(k, n); continue; }
    const nova = versaoMenor(ja.versao, n.versao) || (!ja.versao && n.versao) ? n : ja;
    const pessoas = new Map([...ja.compartilhada_com, ...n.compartilhada_com, ...nova.compartilhada_com].map(x => [x.pessoa, x]));
    // 0.9.1.1: a versão do time é a mais nova que algum PC viu (no clone do repositório ou no inventário)
    m.set(k, {...nova, pcs: [...new Set([...ja.pcs, ...n.pcs])].sort(), porPc: {...ja.porPc, ...n.porPc},
      versaoTime: maiorVersao(ja.versaoTime, n.versaoTime), compartilhada_com: [...pessoas.values()],
      atrasadaEm: [...new Set([...ja.atrasadaEm, ...n.atrasadaEm])].sort(), onde: ondeJunto(ja.onde, n.onde),
      fonte: SEM_PC.has(ja.fonte) ? n.fonte : ja.fonte});
  }
  const exemplo = todas.some(s => s.exemplo);
  // 0.9.1.1: o exemplo que veio de um PC com o inventário estragado não é "o inventário chega com a auditoria" (seria
  // falso): lá vale a faixa do erro, do estadoTela da aba Skills. A faixa do exemplo fica só se algum PC manda o
  // exemplo por ainda não ter o inventário
  const semInventario = linhasValidas(linhas).some(l => !inventarioRuim(l.trabalhos)
    && arr(l.trabalhos.skills).some(s => s && s.fonte === "exemplo"));
  return {itens: [...m.values()].map(completarSkill), exemplo, faixa: semInventario ? {texto: FAIXA_EXEMPLO, cor: "espera"} : null};
}
// O PC achou o inventário, mas estragado ou de outra versão (o skills_erro do skills.py fala do inventário; ou, se um
// dia vier, o skills_inventario "estragado" do ler_tudo).
const inventarioRuim = t => t.skills_inventario === "estragado" || /invent[aá]rio/i.test(String(t.skills_erro || ""));

function completarSkill(s) {
  const ref = s.versaoTime || s.versao;   // a de referência: a do time, se o inventário disser; senão a mais nova
  const atrasadas = s.compartilhada_com.filter(x => x.atualizada === false || (x.atualizada !== true && versaoMenor(x.versao, ref)));
  const versoes = Object.entries(s.porPc).filter(([, v]) => v);
  const difere = new Set(versoes.map(([, v]) => v)).size > 1;
  const onde = s.onde === "time" ? "no repositório do time" : s.onde === "pessoal" ? "pessoal"
    : s.pcs.length > 1 ? `nos PCs ${juntarNomes(s.pcs.map(nomeCurtoPc))}` : s.pcs.length ? `no ${nomeCurtoPc(s.pcs[0])}` : "";
  const com = s.compartilhada_com.map(x => x.pessoa);
  // "em dia" só quando dá para saber de todos (atualizada true, ou a versão de cada um igual ou maior)
  const emDia = com.length && s.compartilhada_com.every(x => x.atualizada === true || (x.atualizada == null && x.versao && ref && !versaoMenor(x.versao, ref)));
  const desatualizada = atrasadas.length === 1 && atrasadas[0].versao ? `Desatualizada para ${atrasadas[0].pessoa} (tem ${versaoMostrar(atrasadas[0].versao)})`
    : atrasadas.length ? `Desatualizada para ${juntarNomes(atrasadas.map(x => x.pessoa))}` : "";
  // a deste PC atrás da do time (atualizada_aqui: false). 0.9.1.1: e a cópia de cada PC atrás da versão do time que
  // outro PC viu (o clone do repositório num PC, a skill instalada no outro)
  const atrasadaEm = [...new Set([...s.atrasadaEm, ...Object.entries(s.porPc).filter(([, v]) => versaoMenor(v, s.versaoTime))
    .map(([pc]) => pc)])].sort();
  const aqui = atrasadaEm.length ? `Desatualizada ${atrasadaEm.length > 1 ? "nos PCs" : "no"} ${juntarNomes(atrasadaEm.map(nomeCurtoPc))}${
    s.versaoTime ? ` (a do time é a ${versaoMostrar(s.versaoTime)})` : ""}` : "";
  const porData = DATA_RE.test(s.versao);   // versão que é uma data: aparece uma vez, como data
  const out = {...s, atrasadaEm, desatualizadaPara: atrasadas.map(x => x.pessoa), desatualizada, desatualizadaAqui: aqui, onde_texto: onde,
    versaoTexto: [s.versao && !porData ? `versão ${s.versao}` : "", dataTexto(porData ? s.versao : s.data)].filter(Boolean).join(" · "),
    compartilhada: com.length ? `${emDia ? "Em dia com" : "Com"} ${juntarNomes(com)}` : "Só você usa",
    difereTexto: difere ? `Versões diferentes nos PCs: ${versoes.sort().map(([pc, v]) => `${nomeCurtoPc(pc)} ${versaoMostrar(v)}`).join(", ")}` : ""};
  const min = t => t ? t[0].toLowerCase() + t.slice(1) : "";
  out.voz = [`Skill ${s.nome}${s.exemplo ? " (exemplo)" : ""}`, out.versaoTexto, onde, desatualizada ? min(desatualizada) : com.length ? min(out.compartilhada) : "",
    min(aqui), min(out.difereTexto)].filter(Boolean).join(", ");
  out.busca = normalizar([s.nome, s.faz, ...s.pcs, ...com, onde].join(" "));
  return out;
}

// 0.9.1.1: a desatualizada que conta (no número da aba, no total da aba e na ordem). A do exemplo do formato ("Colega B
// (exemplo)") aparece no cartão, mas não é de ninguém: sem o inventário, a aba diria "2 desatualizadas" de mentira.
const desatualizadaDeVerdade = s => !!s && !!s.desatualizada && !s.exemplo;

// Os grupos da aba (Neste PC, Do time, Pessoais), com a busca; as desatualizadas primeiro em cada grupo.
function agruparSkills(itens, busca = "") {
  const l = arr(itens).filter(s => combina(s.busca, busca));
  const grupos = GRUPOS_SKILL.map(([k, titulo]) => ({k, titulo, itens: l.filter(s => s.onde === k)
    .sort((a, b) => (desatualizadaDeVerdade(b) - desatualizadaDeVerdade(a)) || a.nome.localeCompare(b.nome, "pt"))})).filter(g => g.itens.length);
  const b = String(busca || "").trim();
  return {grupos, total: l.length, desatualizadas: l.filter(desatualizadaDeVerdade).length,
    vazio: l.length ? null : b ? {texto: `Nada encontrado para “${b}”`, limpar: true} : {texto: "Nenhuma skill publicada ainda", limpar: false}};
}

// ---- Frentes (0.9.0.4) ------------------------------------------------------------------------------------------
// Pedido do Arthur (04/11, 19h10): "acompanhar os processos ... ver cada um trabalhando ... como uma barra de
// progresso, clicar e ver a pasta, o que ele colocou na pasta". Uma linha por FRENTE de trabalho (o em_andamento do
// maestro e os workflows que ele lançou direto), não por sessão. O PC do maestro publica as frentes com o estado já
// calculado (hoje.painel.frentes, trabalhos.py) e cada PC os sinais das sessões dele (hoje.painel.sinais: quando
// gravou por último e a barra do workflow, lida do journal). Aqui fica a vista: a ordem (esperando você primeiro), o
// vermelho de 20 min sem gravar, a barra e o resumo. É a mesma conta do vista_das_frentes do agente (os dois lados
// testam contra o frentes-casos.json; CONTRATO.md da 0.9.0.4, seção 5). Épocas do PC em segundos; o agora em ms.
const AGENTE_FRENTES = "0.9.0.4";
const SEM_NOVIDADE_MIN = 20;        // trabalhando sem gravar nada há 20 min ou mais: vermelho
const NOVIDADE_DIZ_MIN = 10;        // daqui em diante o cartão diz "sem novidade há N min" (antes, "novidade há N min")
const ORDEM_FRENTES = ["esperando", "parada", "limite", "sem_novidade", "trabalhando", "sem_sinal"];
const ESTADO_FRENTE = {trabalhando: ["Trabalhando", "anda"], esperando: ["Esperando você", "espera"],
  limite: ["Parada no limite da conta", "espera"], parada: ["Parada sem andar", "erro"], terminou: ["Terminou", "ok"]};
const SEM_RESULTADO = ["Encerrada sem resultado", "off"];
// O filtro de cada chip do resumo: os grupos que ele mostra (o "terminaram" abre a seção das terminadas).
const NO_FILTRO = {trabalhando: ["trabalhando", "sem_novidade"], sem_novidade: ["sem_novidade"], esperando: ["esperando"],
  paradas: ["parada", "limite"], sem_sinal: ["sem_sinal"]};
const CHIPS_RESUMO = [["esperando", n => `${n} esperando você`], ["paradas", n => plural(n, "parada", "paradas")],
  ["sem_novidade", n => `${n} sem novidade`], ["trabalhando", n => `${n} trabalhando`], ["sem_sinal", n => `${n} sem sinal`],
  ["terminaram", n => `${n} ${n === 1 ? "terminou" : "terminaram"} hoje`]];
const SEM_MAESTRO = `As frentes aparecem quando o Seaninho do celular ${AGENTE_FRENTES} estiver no PC do maestro`;
const BANCO_SEM_TRABALHOS = "Os arquivos e os agentes aparecem depois da atualização do banco";
const TIPOS_ARQ = new Set(["imagem", "pdf", "texto", "outro"]);
const objeto = v => !!v && typeof v === "object" && !Array.isArray(v);
const tem = (o, k) => objeto(o) && Object.prototype.hasOwnProperty.call(o, k);
const segundos = v => { const n = Number(v); return isFinite(n) && n > 0 ? n : 0; };
const porTexto = (a, b) => a < b ? -1 : a > b ? 1 : 0;   // como o sort do Python (ponto de código), não o localeCompare

// 0.9.0.4 (crítico): o workflow que acabou diz como acabou no fim da barra (a barra cheia de uma frente parada, ou a de
// 3/8 que falhou, não parece ainda rodando). O mesmo FIM_DA_BARRA do trabalhos.py.
const FIM_DA_BARRA = {terminado: "✓ terminou", falhou: "✗ falhou", parado: "■ parou", interrompido: "■ parou"};
// "3h12m", "1h00m", "42m" ("0m" abaixo de 1 min): o tempo da barra, como o claude logs.
function tempoDaBarra(s) {
  const m = Math.floor(Math.max(0, s) / 60), h = Math.floor(m / 60);
  return h ? `${h}h${dd(m % 60)}m` : `${m}m`;
}
// A barra do workflow da frente: "▰▰▰▰▰▰▰▱ 12/13 · Gerar imagens · 3h12m", ou null. wf: o sinal.wf do PC; desde: o
// começo da frente (segundos). O workflow que já tinha acabado quando a frente começou (o fim, ou sem ele o desde,
// mais de 1 min antes) é de outra coisa: fica de fora (0.9.0.4, céticos e dados reais: o que roda é o trabalho dela
// agora, e o que acabou depois do começo também conta; o hokage regrava o desde quando refaz a lista). Nunca cheia
// antes do fim (12/13 não vira 8 de 8) e nunca vazia com algum feito (1/13 mostra um bloco). O que acabou ganha
// "· ✓ terminou", "· ✗ falhou" ou "· ■ parou" no fim.
function barraDaFrente(wf, desde, agora = Date.now()) {
  if (!objeto(wf)) return null;
  const agoraS = agora / 1000, wDesde = segundos(wf.desde), fDesde = segundos(desde);
  if (fDesde && wDesde && wf.estado !== "rodando" && (segundos(wf.fim) || wDesde) < fDesde - 60) return null;
  const feitos = Math.max(0, parseInt(wf.feitos, 10) || 0), total = Math.max(0, parseInt(wf.total, 10) || 0);
  const partes = [];
  if (total) {
    let n = Math.floor(8 * feitos / total + 0.5);
    if (feitos > 0 && n === 0) n = 1;
    if (feitos < total && n === 8) n = 7;
    n = Math.min(8, Math.max(0, n));   // feitos > total (dado estragado) não quebra o repeat
    partes.push("▰".repeat(n) + "▱".repeat(8 - n) + ` ${feitos}/${total}`);
  }
  const fase = String(wf.fase || "").trim();
  if (fase) partes.push(fase);
  if (wDesde) partes.push(tempoDaBarra((segundos(wf.fim) || agoraS) - wDesde));
  if (partes.length && tem(FIM_DA_BARRA, wf.estado)) partes.push(FIM_DA_BARRA[wf.estado]);   // 0.9.0.4: como acabou
  return partes.length ? partes.join(" · ") : null;
}

// O PC que publica as frentes (o do maestro): com mais de um, o de ciclo_em mais novo (empate: o nome maior, como o
// max do Python). null quando nenhum PC publica.
function maestroDasFrentes(pcs) {
  let m = null;
  for (const p of listaPcs(pcs)) {
    const fr = painelDe(p).frentes;
    if (!objeto(fr)) continue;
    const c = Number(fr.ciclo_em) || 0;
    if (!m || c > m.c || (c === m.c && p.pc > m.p.pc)) m = {p, fr, c};
  }
  return m;
}
// O sinal da sessão no PC dela: pelo id; o maestro às vezes guarda só o começo do id (8 letras ou mais): vale a única
// sessão que começa com ele (duas ou mais: nenhuma).
function sinalDaSessao(sessao, p) {
  const sinais = painelDe(p).sinais, ss = objeto(sinais) && objeto(sinais.sessoes) ? sinais.sessoes : {};
  const s = String(sessao || "");
  let sinal = s && tem(ss, s) ? ss[s] : null;
  if (sinal == null && s.length >= 8) {
    const ks = Object.keys(ss).filter(k => k.startsWith(s));
    sinal = ks.length === 1 ? ss[ks[0]] : null;
  }
  return objeto(sinal) ? sinal : null;
}
// 0.9.0.4 (céticos): a frente incerta (o maestro não via o PC dela) diz "Sem sinal do WIN · visto 21h03", e não
// "era: trabalhando": ninguém viu aquela frente trabalhar. O "era: <estado>" fica para a que o PC dela publicou.
// 0.9.0.4 (crítico): a frente que espera uma decisão do Arthur pela nota, com o PC dela fora do ar, diz "Esperando você
// · WIN desligado" (fica no grupo esperando, ver vistaDasFrentes); a pausa de propósito ("pausada…", "ociosa…" na nota)
// diz "Pausada", em cinza, e não conta no selo da aba.
function chipDaFrente(it, agora) {
  if (it.grupo === "terminou") { const [texto, cor] = it.f.sem_resultado ? SEM_RESULTADO : ESTADO_FRENTE.terminou; return {texto, cor}; }
  const [rot, cor] = ESTADO_FRENTE[it.estado];
  if (it.grupo === "esperando" && (it.congelado || it.incerto))
    return {texto: `${rot} · ${it.pcCurto} ${it.congelado && (!it.visto || agora - it.visto >= DESLIGADO_MS) ? "desligado" : "sem sinal"}`, cor};
  const visto = it.congelado && it.visto ? ` · visto ${horaOuDia(it.visto, agora)}` : "";
  if (it.incerto) return {texto: (maiuscula(txt(it.f.motivo, 40)) || "Sem sinal") + visto, cor: "off"};
  // 0.9.0.4 (verificador final): a pausada de propósito num PC sem sinal diz "era: pausada · visto …" (antes saía
  // "era: parada sem andar", incoerente com o "Pausada" das frentes dos PCs ligados)
  if (it.congelado) return {texto: `era: ${it.pausada ? "pausada" : rot.toLowerCase()}${visto}`, cor: "off"};
  if (it.pausada) return {texto: "Pausada", cor: "off"};
  return {texto: rot, cor};
}

// A vista: {maestro, maestroPc, cicloEm, ilegivel, totalTerminadas, itens, terminadas, resumo}. pcs: a lista do
// cel_estado (visto_em ISO e o hoje de cada PC). Cada item: chave, grupo, congelado, vermelho, sem_novidade_min,
// barra (os campos dos casos) e o que a tela usa (f: a frente publicada, pc, pcCurto, titulo, chip, wf, mexeu...).
function vistaDasFrentes(pcs, {agora = Date.now()} = {}) {
  const lista = listaPcs(pcs), m = maestroDasFrentes(lista);
  const resumo = {trabalhando: 0, esperando: 0, paradas: 0, sem_novidade: 0, sem_sinal: 0, terminaram: 0};
  if (!m) return {maestro: null, maestroPc: null, cicloEm: 0, ilegivel: false, totalTerminadas: 0, totalAbertas: 0, itens: [], terminadas: [], resumo};
  const porPc = new Map(lista.map(p => [p.pc, p]));
  const agoraS = agora / 1000, itens = [], terminadas = [];
  for (const f of arr(m.fr.itens)) {
    if (!objeto(f) || !f.chave) continue;
    const dono = String(f.pc || m.p.pc), p = porPc.get(dono) || null;
    const congelado = !p || agora - vistoMs(p) >= ONLINE_MS;
    const sinal = p ? sinalDaSessao(f.sessao, p) : null;
    const mexeu = sinal ? segundos(sinal.mexeu) : 0;
    const snm = mexeu ? Math.max(0, Math.floor((agoraS - mexeu) / 60)) : null;
    // o PC já manda um dos 5 estados; outro texto conta como "parada" (a regra 9 do estado_da_frente)
    const estado = tem(ESTADO_FRENTE, f.estado) ? f.estado : "parada";
    const vermelho = estado === "trabalhando" && !congelado && !f.incerto && snm !== null && snm >= SEM_NOVIDADE_MIN;
    // 0.9.0.4 (crítico): a decisão que espera o Arthur (pela nota do hokage) fica no "esperando você" com o PC desligado
    const esperaNota = estado === "esperando" && f.pela_nota === true;
    const grupo = estado === "terminou" ? "terminou" : (congelado || f.incerto) && !esperaNota ? "sem_sinal"
      : estado === "trabalhando" ? (vermelho ? "sem_novidade" : "trabalhando") : estado;
    const wf = sinal && objeto(sinal.wf) ? sinal.wf : null;
    const it = {chave: String(f.chave), grupo, congelado, vermelho, sem_novidade_min: snm, barra: barraDaFrente(wf, f.desde, agora),
      f, pc: dono, pcCurto: nomeCurtoPc(dono), estado, sinal, wf, mexeu, incerto: !!f.incerto,
      tipo: f.tipo === "sessao" ? "sessao" : "delegacao", titulo: txt(f.titulo, 80) || "Frente sem nome",
      pausada: estado === "parada" && f.pausada === true,   // 0.9.0.4: a pausa de propósito (chip cinza, fora do selo)
      desde: segundos(f.desde), fim: segundos(f.fim), visto: p ? vistoMs(p) : 0, versao: p ? String(p.versao || "") : ""};
    it.icone = it.tipo === "sessao" ? "⚙" : "🎼";
    it.chip = chipDaFrente(it, agora);
    (grupo === "terminou" ? terminadas : itens).push(it);
  }
  const k = it => it.grupo === "esperando" ? it.desde : it.grupo === "parada" || it.grupo === "limite" ? -(it.fim || it.desde)
    : it.grupo === "sem_novidade" ? it.mexeu : -it.desde;
  itens.sort((a, b) => (ORDEM_FRENTES.indexOf(a.grupo) - ORDEM_FRENTES.indexOf(b.grupo)) || (k(a) - k(b)) || porTexto(a.chave, b.chave));
  terminadas.sort((a, b) => ((b.fim || b.desde) - (a.fim || a.desde)) || porTexto(a.chave, b.chave));
  const conta = (...gs) => itens.filter(i => gs.includes(i.grupo)).length;
  Object.assign(resumo, {trabalhando: conta("trabalhando", "sem_novidade"), esperando: conta("esperando"), paradas: conta("parada", "limite"),
    sem_novidade: conta("sem_novidade"), sem_sinal: conta("sem_sinal"), terminaram: terminadas.length});
  // 0.9.0.4: totalAbertas (as não terminadas antes do corte do maestro): o "e mais N frentes" da lista
  return {maestro: m.p.pc, maestroPc: m.p, cicloEm: ms(m.fr.ciclo_em), ilegivel: m.fr.ilegivel === true,
    totalTerminadas: Math.max(terminadas.length, parseInt(m.fr.total_terminadas, 10) || 0),
    totalAbertas: Math.max(itens.length, parseInt(m.fr.total_abertas, 10) || 0), itens, terminadas, resumo};
}

// O selo da aba Workflows: as que esperam você e as paradas, menos as pausadas de propósito (0.9.0.4, crítico).
const seloDasFrentes = v => !v ? 0 : arr(v.itens).filter(i => i.grupo === "esperando"
  || ((i.grupo === "parada" || i.grupo === "limite") && !i.pausada)).length;
// "3 trabalhando (1 sem novidade) · 1 esperando você · 2 paradas" (e " · 1 sem sinal" quando houver).
function textoDoResumo(r) {
  const n = k => Math.max(0, parseInt((r || {})[k], 10) || 0);
  const partes = [`${n("trabalhando")} trabalhando${n("sem_novidade") ? ` (${n("sem_novidade")} sem novidade)` : ""}`,
    `${n("esperando")} esperando você`, plural(n("paradas"), "parada", "paradas")];
  if (n("sem_sinal")) partes.push(`${n("sem_sinal")} sem sinal`);
  return partes.join(" · ");
}
// Os chips do topo (só os que têm alguma), na ordem de quem precisa de você.
const chipsDoResumo = r => CHIPS_RESUMO.filter(([k]) => ((r || {})[k] || 0) > 0).map(([k, f]) => ({k, n: r[k], texto: f(r[k])}));
// A lista com o filtro de um chip ("" = todas).
const filtrarFrentes = (itens, filtro) => !tem(NO_FILTRO, filtro) ? arr(itens) : arr(itens).filter(i => NO_FILTRO[filtro].includes(i.grupo));
// "às 19h28" (hoje), "de ontem, 18h" ou "de 02/11": quando o maestro leu o ciclo pela última vez.
const quandoDaLista = (t, agora) => !t ? "" : diasEntre(agora, t) <= 0 ? `às ${horaCurta(t)}` : leituraDe(t, agora).replace(/^das /, "às ");

// O tempo sem gravar nada: "novidade agora", "novidade há 4 min" ou, a partir de 10 min, "sem novidade há 27 min".
function novidadeDaFrente(it) {
  if (!it || it.grupo === "terminou" || it.sem_novidade_min == null) return "";
  const n = it.sem_novidade_min, t = n < 60 ? `${n} min` : duracao(n * 60000);
  return n < 1 ? "novidade agora" : n < NOVIDADE_DIZ_MIN ? `novidade há ${t}` : `sem novidade há ${t}`;
}
// "desde 15h30" (ou "desde ontem 22h"); a terminada: "15h30 a 18h40".
function tempoDaFrente(it, agora = Date.now(), {longo = false} = {}) {
  if (!it || !it.desde) return it && it.fim ? `terminou ${horaOuDia(it.fim * 1000, agora)}` : "";
  const d = it.desde * 1000;
  if (it.grupo === "terminou" && it.fim) return `${horaOuDia(d, agora)} a ${horaCurta(it.fim * 1000)}${longo ? ` (${duracao(it.fim * 1000 - d)})` : ""}`;
  return `desde ${horaOuDia(d, agora)}${longo ? ` (${duracao(agora - d)})` : ""}`;
}

// A última fala em 1 linha: a primeira linha com texto, sem o markdown (títulos, negrito, código, citação, marcadores
// de lista, links como texto), cortada em 140. O "_" só sai quando é ênfase (o pano_03 fica pano_03).
function umaLinha(texto, n = 140) {
  for (const bruta of String(texto == null ? "" : texto).split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(bruta)) continue;
    let l = bruta.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/^\s*(?:>\s*)+/, "").replace(/^\s*#{1,6}\s+/, "").replace(/^\s*(?:[-*+]|\d{1,3}[.)])\s+(?:\[[ xX]\]\s+)?/, "")
      .replace(/[*`]+/g, "").replace(/~~/g, "").replace(/(^|[\s([])_{1,2}(?=\S)/g, "$1").replace(/(\S)_{1,2}(?=$|[\s).,;:!?\]])/g, "$1");
    if (/^\s*\|/.test(l)) l = l.split("|").map(c => c.trim()).filter(Boolean).join(" · ");   // linha de tabela
    l = l.replace(/\s+/g, " ").trim();
    if (!l || /^[-=_|:·\s]+$/.test(l)) continue;   // linha horizontal ou o separador da tabela
    return txt(l, n);
  }
  return "";
}

// A sessão da frente entre as da página (todasSessoes): a do mesmo PC e id; sem ela, com o id curto (8 letras ou
// mais), a única do PC que começa com ele.
function sessaoDaFrente(it, sessoes) {
  const id = String((it && it.f && it.f.sessao) || "");
  if (!id) return null;
  const ss = arr(sessoes).filter(s => s && s.pc === it.pc);
  const exata = ss.find(s => s.id === id);
  if (exata) return exata;
  if (id.length < 8) return null;
  const c = ss.filter(s => String(s.id || "").startsWith(id));
  return c.length === 1 ? c[0] : null;
}
const ultimaDoClaude = s => { const m = [...arr(s && s.conversa)].reverse().find(x => x && x.de === "claude" && x.texto); return m ? String(m.texto) : ""; };
// A última fala: o "resposta" da sessão (o fim da conversa, se ele vier vazio); na frente de segundo plano (bg), que
// não tem aba, a fala que o maestro publicou. 0.9.0.4 (crítico): no detalhe (com as `linhas` do cel_trabalhos), a da
// frente de fundo vem antes da coluna "falas" do PC (inteira, até 1500 letras): no hoje.painel ela vai a 300 quando a
// lista enche. Primeiro a linha do PC da frente, depois as outras (a fala é do PC do maestro).
function falaDaColuna(it, linhas) {
  const id = String((it && it.f && it.f.sessao) || "");
  if (!id || !linhas) return "";
  const ls = linhasValidas(linhas);
  for (const l of [...ls.filter(x => x.pc === it.pc), ...ls.filter(x => x.pc !== it.pc)]) {
    const fs = objeto(l.trabalhos.falas) ? l.trabalhos.falas : null;
    if (fs && typeof fs[id] === "string" && fs[id].trim()) return fs[id];
  }
  return "";
}
function falaDaFrente(it, sessoes, linhas = null) {
  const s = sessaoDaFrente(it, sessoes), daSessao = s ? String(s.resposta || "") || ultimaDoClaude(s) : "";
  const doMaestro = String((it && it.f && it.f.fala) || "");
  return it && it.f && it.f.fonte === "bg" ? falaDaColuna(it, linhas) || doMaestro || daSessao : daSessao || doMaestro;
}
// 0.9.0.4 (céticos): a nota do hokage (o "estado" que ele escreve em texto livre no em_andamento: "parada às 20h56 com
// tudo salvo…"). É o que mais informa com a sessão fechada ou o PC desligado: a 4ª linha do cartão quando não há fala,
// e no detalhe. "" sem ela.
const notaDaFrente = it => txt(it && it.f && it.f.nota, 200);
// "e mais 4 frentes": as abertas que o maestro deixou fora do corte (o total_abertas), ou "".
const maisFrentes = v => { const n = Math.max(0, ((v && v.totalAbertas) || 0) - arr(v && v.itens).length);
  return n ? `e mais ${n} ${n === 1 ? "frente que não coube" : "frentes que não couberam"} na lista` : ""; };

// Os botões do detalhe. pasta: "Abrir a pasta no PC" (a entrega, senão a pasta da frente), cinza com o motivo.
// mensagem: a conversa da sessão viva (o chat de hoje, com as travas dele); sem a sessão, na frente de segundo plano
// vira "Falar com o maestro" (a conversa dele com "Sobre a frente …" na caixa); nas outras, cinza.
// ctx: {pcs, sessoes, agora, rede, maestro (o orquestraDe da página), nomeMaestro ("maestro" ou o nome dele)}.
function botoesDaFrente(it, {pcs = [], sessoes = [], agora = Date.now(), rede = true, maestro, nomeMaestro = "maestro"} = {}) {
  const p = pcDe(pcs, it.pc), curto = it.pcCurto || nomeCurtoPc(it.pc);
  const pasta = String((it.f && (it.f.entrega || it.f.cwd)) || "");
  const motivo = !pasta ? "A frente não tem pasta" : pastaPessoal(pasta, it.pc) ? "Pasta pessoal: não abro pelo celular."
    : semRede(rede) ? "Sem internet" : !online(p, agora) ? foraDoAr(p, it.pc, agora)
    : compararVersao(p.versao, AGENTE_FRENTES) < 0 ? `Precisa do Seaninho do celular ${AGENTE_FRENTES} no ${curto}` : "";
  const abrirPasta = {acao: "abrir_pasta", texto: "Abrir a pasta no PC", ok: !motivo, motivo, pasta, pc: it.pc, frente: it.chave};
  const s = sessaoDaFrente(it, sessoes);
  let mensagem;
  if (s) mensagem = {acao: "conversa", texto: "Mandar mensagem", ok: !s.desligado, motivo: s.desligado ? foraDoAr(p, it.pc, agora) : "",
    conversa: {pc: s.pc, id: s.id}};
  else if (it.f && it.f.fonte === "bg") {
    const o = maestro !== undefined ? maestro : maestroDe(pcs), pm = o && pcDe(pcs, o.pc);
    const mot = !o || !o.sessao ? `O ${nomeMaestro} não está aberto` : !online(pm, agora) ? foraDoAr(pm, o.pc, agora) : "";
    mensagem = {acao: "maestro", texto: `Falar com o ${nomeMaestro}`, ok: !mot, motivo: mot,
      conversa: o && o.sessao ? {pc: o.pc, id: o.sessao} : null, rascunho: `Sobre a frente “${it.titulo}” (${curto}): `};
  } else mensagem = {acao: "conversa", texto: "Mandar mensagem", ok: false, motivo: "A sessão desta frente está fechada", conversa: null};
  return {pasta: abrirPasta, mensagem};
}

// ---- O detalhe: o run e os arquivos novos (cel_trabalhos, banco novo) -----------------------------------------------
const linhaDoPc = (linhas, pc) => linhasValidas(linhas).find(l => l.pc === pc) || null;
const tamanhoArq = b => b >= 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
const hex = (v, n = 64) => typeof v === "string" && new RegExp(`^[0-9a-f]{8,${n}}$`, "i").test(v) ? v : "";
// Os arquivos novos da pasta de saída que o PC da frente publicou ({pasta, total, cortado, erro, itens}, os mais novos
// primeiro), ou null quando o PC ainda não publicou a lista desta frente.
function arquivosDaFrente(it, linhas, {agora = Date.now()} = {}) {
  const l = linhaDoPc(linhas, it.pc), todos = l && objeto(l.trabalhos.arquivos) ? l.trabalhos.arquivos : {};
  const a = tem(todos, it.chave) && objeto(todos[it.chave]) ? todos[it.chave] : null;
  if (!a) return null;
  const itens = arr(a.itens).filter(x => objeto(x) && x.nome).map(x => {
    const nome = String(x.nome), base = nome.split(/[\\/]/).filter(Boolean).pop() || nome;
    const tipo = TIPOS_ARQ.has(x.tipo) ? x.tipo : "outro", t = ms(x.t), b = Math.max(0, Number(x.b) || 0);
    const d = objeto(x.doc) && hex(x.doc.id) ? {id: x.doc.id, paginas: Math.max(1, parseInt(x.doc.paginas, 10) || 1),
      w: Number(x.doc.w) || 0, h: Number(x.doc.h) || 0} : null;
    return {nome, base, ext: (base.includes(".") ? base.split(".").pop() : "").toUpperCase().slice(0, 5), tipo, t, b,
      hora: t ? horaOuDia(t, agora) : "", tamanho: b ? tamanhoArq(b) : "", mini: hex(x.mini), id: hex(x.id), nitida: x.nitida === true,
      doc: tipo === "pdf" ? d : null};
  }).sort((x, y) => y.t - x.t);
  return {pasta: String(a.pasta || ""), total: Math.max(itens.length, parseInt(a.total, 10) || 0), cortado: a.cortado === true,
    erro: txt(a.erro, 160), itens};
}
// O run (workflow) da sessão da frente no PC dela: o do sinal (mesma chave); senão o rodando mais novo; senão o
// terminado mais novo. {nome, estado, fases, agentes, contas} ou null.
function runDaFrente(it, linhas) {
  const l = linhaDoPc(linhas, it.pc), id = String((it.f && it.f.sessao) || "");
  if (!l || !id) return null;
  const casa = s => s === id || (id.length >= 8 && s.startsWith(id));
  const runs = arr(l.trabalhos.itens).filter(w => objeto(w) && (w.tipo || "workflow") === "workflow" && w.sessao && casa(String(w.sessao)));
  if (!runs.length) return null;
  const quando = w => ms(w.fim) || ms(w.mexeu) || ms(w.desde);
  const chave = it.wf && it.wf.chave;
  const w = (chave && runs.find(x => x.chave === chave)) || runs.filter(x => x.estado === "rodando").sort((a, b) => ms(b.desde) - ms(a.desde))[0]
    || runs.slice().sort((a, b) => quando(b) - quando(a))[0];
  return {nome: nomeWorkflow(w.nome), estado: String(w.estado || ""), contas: objeto(w.agentes) ? w.agentes : null,
    fases: arr(w.fases).filter(f => objeto(f) && f.nome).map(f => ({nome: txt(f.nome, 60), estado: String(f.estado || "")})),
    agentes: arr(w.lista_agentes).filter(a => objeto(a) && a.rotulo).map(agenteDe)};
}
// O detalhe da frente com o banco novo: {arquivos, run, nota, carregando}. linhas: o que o cel_trabalhos devolveu
// (null = ainda não veio); semFuncao: o banco sem a migração; erro: a última falha da leitura.
function detalheDaFrente(it, {linhas = null, semFuncao = false, erro = "", agora = Date.now(), pcs = []} = {}) {
  if (semFuncao) return {arquivos: null, run: null, nota: BANCO_SEM_TRABALHOS, carregando: false};
  if (linhas === null) return {arquivos: null, run: null, nota: erro ? `Não deu para ler os arquivos agora: ${erro}` : "Carregando os arquivos…", carregando: !erro};
  const run = runDaFrente(it, linhas), a = arquivosDaFrente(it, linhas, {agora}), curto = it.pcCurto || nomeCurtoPc(it.pc);
  if (a) return {arquivos: a, run, carregando: false, nota: a.erro || (a.itens.length ? ""
    : `Nenhum arquivo novo na pasta${it.desde ? ` desde ${horaOuDia(it.desde * 1000, agora)}` : ""}`)};
  const p = pcDe(pcs, it.pc);
  const nota = linhaDoPc(linhas, it.pc) ? `O ${curto} ainda não leu a pasta desta frente (ele lê a cada minuto)`
    : p && compararVersao(p.versao, AGENTE_FRENTES) < 0 ? `Os arquivos aparecem quando o ${curto} tiver o Seaninho do celular ${AGENTE_FRENTES}`
    : `O ${curto} ainda não publicou os arquivos`;
  return {arquivos: null, run, nota, carregando: false};
}

// As faixas do topo e o texto da lista vazia: {vazio, faixas: [{texto, cor}]}. maestro: o orquestraDe da página.
function faixasDasFrentes(vista, {pcs = [], agora = Date.now(), maestro} = {}) {
  if (!vista || !vista.maestro) {
    const o = maestro !== undefined ? maestro : maestroDe(pcs), pm = o && pcDe(pcs, o.pc);
    const versao = pm && compararVersao(pm.versao, AGENTE_FRENTES) < 0 ? ` (o ${nomeCurtoPc(pm.pc)} está com a ${pm.versao || "versão antiga"})` : "";
    return {vazio: SEM_MAESTRO + versao, faixas: []};
  }
  const faixas = [];
  if (!online(vista.maestroPc, agora)) faixas.push({texto: `${foraDoAr(vista.maestroPc, vista.maestro, agora)}: frentes da última leitura`, cor: "off"});
  if (vista.ilegivel) faixas.push({texto: "O ciclo do maestro não abriu agora: lista da última leitura boa", cor: "espera"});
  // o PC de alguma frente com o agente de antes: a frente aparece, mas sem a barra e sem o "há quanto tempo"
  for (const nome of [...new Set(vista.itens.map(i => i.pc))].sort()) {
    const p = pcDe(pcs, nome);
    if (p && online(p, agora) && compararVersao(p.versao, AGENTE_FRENTES) < 0)
      faixas.push({texto: `O ${nomeCurtoPc(nome)} está com o Seaninho do celular ${p.versao || "antigo"}: as frentes dele ficam sem a barra e sem o tempo sem novidade até a ${AGENTE_FRENTES}`, cor: "espera"});
  }
  return {vazio: vista.itens.length || vista.terminadas.length ? "" : "Nenhuma frente de trabalho agora", faixas};
}
// O link #frente=<chave> (ou o toque): {item} ou, se ela saiu da lista, o aviso.
function frenteDoLink(vista, chave) {
  const it = [...arr(vista && vista.itens), ...arr(vista && vista.terminadas)].find(x => x.chave === chave);
  return it ? {item: it} : {item: null, sumiu: true, texto: "Esta frente não está mais na lista"};
}
// O que o leitor de tela diz do cartão (sem os ▰▱: "12 de 13 agentes prontos").
function vozDaFrente(it, agora = Date.now(), fala = "") {
  const w = it.barra && it.wf ? it.wf : null, total = w ? Math.max(0, parseInt(w.total, 10) || 0) : 0;
  const prog = w ? [total ? `${Math.max(0, parseInt(w.feitos, 10) || 0)} de ${total} agentes prontos` : "", String(w.fase || "").trim() ? `fase ${String(w.fase).trim()}` : ""]
    .filter(Boolean).join(", ") : "";
  return [`${it.tipo === "sessao" ? "Workflow" : "Frente"} ${it.titulo}`, `${it.chip.texto}, no ${it.pcCurto}`, prog,
    novidadeDaFrente(it), tempoDaFrente(it, agora), fala ? `Última fala: ${fala}` : ""].filter(Boolean).join(". ");
}

// ---- Tudo de uma vez (o que a página chama a cada desenho) ------------------------------------------------------
// ctx: {pcs, sessoes, agora, pedidos, dispensadas}. O "Rodar agora" de cada cartão: rodarAgora(a, {..., linhas}).
function montar(linhas, ctx = {}) {
  const agora = ctx.agora || Date.now();
  const itens = juntar(linhas, {...ctx, agora});
  const automacoes = juntarAutomacoes(linhas, {pcs: ctx.pcs, agora});
  const skills = juntarSkills(linhas);
  const cont = contagens(itens, {agora, dispensadas: ctx.dispensadas});
  return {itens, automacoes, skills, andamentos: andamentosDe(linhas), totalHoje: totalHoje(linhas), contagens: cont,
    bancoV10: bancoV10(ctx.pcs), maestro: maestroDe(ctx.pcs),
    abas: {workflows: cont.rodando + cont.esperando + cont.falharam, automacoes: automacoes.filter(a => a.situacao === "com_erro" && !a.congelado).length,
      skills: skills.itens.filter(desatualizadaDeVerdade).length}};
}

const Workflows = {AGENTE_TRABALHOS, ONLINE_MS, DESLIGADO_MS, PRAZO_PERTO_MS, DISPENSA_DESFAZER_MS, RODAR_DESFAZER_MS,
  RODAR_REPETIR_MS, RODAR_EXPIRA_MS, FILTROS, SECOES, FILTROS_AUT, GRUPOS_SKILL, FAIXA_EXEMPLO,
  linhaStatus, estadoDelegacao, juntar, filtrar, opcoes, totalHoje, contagens, contagensDoHoje, folhaTrocarConta,
  dispensar, restaurar, desfazerDispensa, lerDispensadas, gravarDispensadas, lerFiltro, estadoTela, doLink,
  arquivosDoResultado, abrirResultado, responder, botoes, citacaoDe, podeIrAoMaestro, pastaPessoal,
  juntarAutomacoes, filtrarAutomacoes, andamentosDe, rodarAgora, textoEtapa, tocar, desfazerToque, marcarEnviado, pedidoRodar, novoRef,
  juntarSkills, agruparSkills, montar, bancoV10, maestroDe, nomeCurtoPc, compararVersao, ms, duracao,
  // 0.9.0.4: as frentes de trabalho (a aba Workflows da 0.9.0.4)
  AGENTE_FRENTES, SEM_NOVIDADE_MIN, SEM_MAESTRO, BANCO_SEM_TRABALHOS, vistaDasFrentes, barraDaFrente, umaLinha, botoesDaFrente,
  textoDoResumo, chipsDoResumo, filtrarFrentes, quandoDaLista, novidadeDaFrente, tempoDaFrente, sessaoDaFrente, falaDaFrente,
  notaDaFrente, maisFrentes, seloDasFrentes, FIM_DA_BARRA,
  arquivosDaFrente, runDaFrente, detalheDaFrente, faixasDasFrentes, frenteDoLink, vozDaFrente, tamanhoArq, horaOuDia, horaCurta};
if (typeof module !== "undefined" && module.exports) module.exports = Workflows;
raiz.Workflows = Workflows;
})(typeof window !== "undefined" ? window : globalThis);
