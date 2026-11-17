// pro-103: a atividade da VPS (a máquina de fila) num painel só. Pedido do Arthur (16/11, 21h1x): "O que está
// trabalhando na VPS? E quando vou ver melhor a atividade dela pela Seaninho ou monitor geral?".
// O MESMO arquivo, byte a byte, no Monitor geral do Seaninho Pro (scripto/assets/vps_atividade.js) e no outro lado que
// mostra o painel (com o nome vpsatividade.js); o CSS também (vps_atividade.css / vpsatividade.css). Os testes de cada
// lado conferem o sha256 dos dois contra o vps-atividade-casos.json, o mesmo arquivo nos dois repositórios, e rodam
// cada caso.
// - modelo(maquina, agora_s, opcoes?): o bloco "maquina" (formato 1) já em palavras: {leitura, resumo, grupos,
//   rotinas, saude}. Aceita o bloco do Pro (c.maquina depois da lista branca, com o "sem_noticia"; ou o item inteiro,
//   com o "visto" dele), o da tabela dos aparelhos (hoje.maquina; ou a linha inteira, com o "visto_em") e o kit sem os
//   campos novos (crons, orcamento_usd, publicado, pr, pergunta, ultima): o que falta some;
// - html(modelo, opcoes?): o painel inteiro, com tudo escapado e as classes va-*. Botões: data-va="abrir" (o cartão abre
//   e fecha), data-va="log" + data-va-id (o "Ver log" de cada lado) e data-va="link" (só no login, só para o
//   login.tailscale.com). Quem liga os cliques é a página de cada lado;
// - _puro: as peças menores, para os testes.
// Sem tela, sem rede e sem relógio: o "agora" entra como argumento (epoch s). Todo texto que vem do kit passa de novo pela
// limpeza (caminho absoluto, ~/, id de sessão, cara de token, URL com token): sai limpo mesmo se o kit falhar. Vai
// embutido no script da página do Pro: sem a marca de fim de script nem a de comentário de HTML.
;(function (root) {
"use strict";

// ==== Pequenos =======================================================================================================
const ENT = {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"};
const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ENT[c]);
const obj = v => !!v && typeof v === "object" && !Array.isArray(v);
const ls = v => (Array.isArray(v) ? v : []);
const num = v => (typeof v === "number" && isFinite(v) ? v : null);   // nunca bool, nunca texto
const str = v => (typeof v === "string" ? v : "");
const virgula = (v, casas) => v.toFixed(casas).replace(".", ",");
const dois = n => String(n).padStart(2, "0");
const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const segDe = iso => { const t = Date.parse(str(iso)); return isFinite(t) ? t / 1000 : 0; };   // ISO 8601 → epoch s
// o valor de uma tabela daqui só pela chave dela ("constructor" e "toString" vindos do kit não pegam o do Object)
const da = (o, k) => (typeof k === "string" && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);

// ==== A limpeza de defesa ============================================================================================
// O kit e o agente já mascaram; aqui é a segunda trava, para nada disto chegar à tela: cara de token, id de sessão
// (UUID), hexadecimal longo, caminho absoluto (Linux, Windows, ~/ e $HOME; com espaço no nome das pastas também) e URL
// com token ou senha.
const TOKEN = new RegExp([
  "\\bsk-ant-[A-Za-z0-9_-]{6,}", "\\bsk-[A-Za-z0-9_-]{12,}", "\\bgh[pousr]_[A-Za-z0-9]{12,}", "\\bgithub_pat_[A-Za-z0-9_]{12,}",
  "\\bxox[abeprs]-[A-Za-z0-9-]{8,}", "\\bAKIA[0-9A-Z]{16}\\b", "\\bglpat-[A-Za-z0-9_-]{12,}",
  "\\beyJ[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{8,}\\.[A-Za-z0-9_-]{4,}"].join("|"), "g");
const SEGREDO_PAR = /\b(token|senha|password|passwd|secret|api[_-]?key)(\s*[=:]\s*)[^\s,;]{6,}/gi;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const HEX = /\b[0-9a-f]{32,}\b/gi;
const URL_RE = /\b(?:https?|wss?|ftp):\/\/[^\s<>"'`]+/gi;
const URL_SEGREDO = /[?&#;][^=&#\s]*(?:token|key|secret|senha|password|sig|signature|auth|code|session|cred)[^=&#\s]*=|\/\/[^/\s@]+@/i;
// o caminho começa no início ou depois de um espaço ou pontuação (assim "dono/repo/pasta" e "5/20" ficam). A pasta com
// espaço no nome continua o caminho ("G:\Meu Drive\02 - Projetos\Cliente\book.pdf" sai inteiro): até 4 palavras e outro
// separador depois delas (a palavra não começa outro caminho: "a.txt e ~/x/b.md" são dois). O último trecho com
// espaço, sem separador depois, não dá para separar da frase e fica
const CAMINHO = /(^|[\s("'=:,;[{<>])((?:(?:[A-Za-z]:[\\/]|~[\\/]|\$HOME[\\/]|[\\/](?=[^\s\\/]+[\\/]))[^\s"'<>|]*|\/(?:home|root)\b[^\s"'<>|]*)(?:(?:[ \t]+[^\s"'<>|\\/~$:]+){1,4}[\\/][^\s"'<>|]*)*)/g;
function troca(caminho) {   // o arquivo fica só com o nome ("vps.py"); a pasta vira "…"
  const partes = caminho.replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean), ult = partes[partes.length - 1] || "";
  return partes.length > 1 && /^[^.\s][^\s]*\.[A-Za-z0-9]{1,8}$/.test(ult) && !/[:$~]/.test(ult) ? ult : "…";
}
function semCaminho(s) {   // a pontuação que fecha a frase (".", ",", ")"…) fica fora do caminho
  return s.replace(CAMINHO, (m, antes, c) => {
    const fim = (/[.,;:!?)\]}]+$/.exec(c) || [""])[0];
    return antes + troca(c.slice(0, c.length - fim.length)) + fim;
  });
}
function limpar(v, max) {
  let s = typeof v === "number" && isFinite(v) ? String(v) : str(v);
  if (!s) return "";
  s = s.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\p{Cf}/gu, "").replace(/`+|\*\*/g, "");
  let fora = "", i = 0;   // as URLs à parte: a de token some; o resto do texto perde os caminhos
  s.replace(URL_RE, (u, at) => {
    fora += semCaminho(s.slice(i, at)) + (URL_SEGREDO.test(u) ? "(link)" : u);
    i = at + u.length;
    return u;
  });
  s = fora + semCaminho(s.slice(i));
  s = s.replace(TOKEN, "•••").replace(BEARER, "$1 •••").replace(SEGREDO_PAR, "$1$2•••").replace(UUID, "•••").replace(HEX, "•••");
  s = s.replace(/\s+/g, " ").trim();
  const letras = [...s];
  return max && letras.length > max ? letras.slice(0, Math.max(1, max - 1)).join("").trimEnd() + "…" : s;
}

// ==== O tempo (sem relógio: "agora" entra; fuso_min fixa o fuso, senão o do aparelho) ===============================
function relogio(ts, fuso) {
  const d = new Date(ts * 1000 + (fuso == null ? 0 : fuso * 60000));
  return fuso == null ? {h: d.getHours(), m: d.getMinutes(), d: d.getDate(), mes: d.getMonth() + 1, a: d.getFullYear()}
    : {h: d.getUTCHours(), m: d.getUTCMinutes(), d: d.getUTCDate(), mes: d.getUTCMonth() + 1, a: d.getUTCFullYear()};
}
// "17:40"; de outro dia, "15/11 17:40"
function hora(ts, agora, fuso) {
  if (!ts) return "";
  const r = relogio(ts, fuso), h = relogio(agora, fuso), hm = `${dois(r.h)}:${dois(r.m)}`;
  return r.d === h.d && r.mes === h.mes && r.a === h.a ? hm : `${dois(r.d)}/${dois(r.mes)} ${hm}`;
}
// "40 min", "2 h 10 min", "3 dias"
function duracao(s) {
  const min = Math.floor(Math.max(0, num(s) || 0) / 60);
  if (min < 1) return "menos de 1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), r = min % 60;
  if (h < 24) return `${h} h${r ? ` ${r} min` : ""}`;
  const d = Math.floor(h / 24);
  return d === 1 ? "1 dia" : `${d} dias`;
}
// o "há" curto: "agora", "há 25 min", "há 4 h", "há 2 dias"
function ha(s) {
  const min = Math.floor(Math.max(0, num(s) || 0) / 60);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "há 1 dia" : `há ${d} dias`;
}
const usd = v => "US$ " + virgula(v, 2);
const usdTeto = v => "US$ " + (Number.isInteger(v) ? String(v) : virgula(v, 2));
const gb = mb => virgula(mb / 1000, 1);

// ==== A entrada (os dois jeitos) =====================================================================================
const ID_RE = /^\d{4}-\d{6}-[a-z0-9-]{1,40}$/;
const LINK_RE = /^https:\/\/login\.tailscale\.com\/[A-Za-z0-9/_?=&.%-]{1,200}$/;
const SEM_NOTICIA_S = 180;   // a regra B.5: sem notícia do item há mais que isso
const LENDO = ["online", "kit_antigo"];
// {m (o bloco ou null), visto_item (epoch s ou 0), sem_noticia}
function entrada(x, agora, op) {
  let m = x, vistoItem = num(op.visto_item) || 0;
  if (obj(x) && obj(x.maquina)) {   // o item do sessoes-remotas.json (Pro)
    m = x.maquina;
    vistoItem = vistoItem || num(x.visto) || 0;
  } else if (obj(x) && obj(x.hoje) && obj(x.hoje.maquina)) {   // a linha da tabela dos aparelhos
    m = x.hoje.maquina;
    vistoItem = vistoItem || segDe(x.visto_em);
  } else if (obj(x) && !("formato" in x) && ("pc" in x || "visto_em" in x)) {   // a linha que chegou sem o bloco
    m = null;
    vistoItem = vistoItem || segDe(x.visto_em);
  }
  if (!obj(m)) m = null;
  const semNoticia = typeof op.sem_noticia === "boolean" ? op.sem_noticia
    : m && typeof m.sem_noticia === "boolean" ? m.sem_noticia : vistoItem ? agora - vistoItem > SEM_NOTICIA_S : false;
  return {m, vistoItem, semNoticia};
}

// ==== A leitura (a faixa do alto: o que houve e o que fazer) =========================================================
const FRASES = {
  login: ["A {r} está sem leitura: o Tailscale pediu confirmação",
    "Toque em Confirmar no Tailscale e entre com a sua conta. A leitura volta sozinha em até 1 min."],
  sem_tailscale: ["A {r} está sem leitura: o Tailscale do {por} está desligado", "Ligue o Tailscale no {por} e entre na sua conta."],
  fora: ["A {r} está sem leitura: ela não respondeu",
    "Espere alguns minutos. Se continuar, confira se a {r} está ligada no painel de quem hospeda."],
  chave_mudou: ["A {r} está sem leitura: a chave dela mudou", "Não aceite sozinho: confirme com quem cuida da {r}."],
  erro: ["A {r} está sem leitura: a resposta veio estranha", "Peça ao {coord} para conferir o kit da {r}."],
};
const COR_LEITURA = {online: "ok", kit_antigo: "atencao", login: "atencao", sem_tailscale: "erro", fora: "erro",
  chave_mudou: "erro", erro: "erro", sem_noticia: "neutro", nunca: "neutro", formato_novo: "atencao"};
function leitura(m, b, ctx) {
  const {agora, fuso, r, por, coord, semNoticia, vistoItem, vistoDados} = ctx;
  const boa = vistoDados ? `${hora(vistoDados, agora, fuso)} (${ha(agora - vistoDados)})` : "";
  const out = (estado, titulo, oque, extra) => Object.assign({estado, cor: COR_LEITURA[estado], titulo, oque_fazer: oque},
    extra || {}, {ultima_boa: boa, velha: !!b && !LENDO.includes(estado)});
  const frase = s => s.replace(/\{r\}/g, r).replace(/\{por\}/g, por).replace(/\{coord\}/g, coord);
  if (m && m.formato !== 1) return Object.assign(out("formato_novo", `A ${r} mandou um formato novo`,
    "Atualize o Seaninho para ver a atividade dela."), {ultima_boa: "", velha: false});
  // sem a hora do item (só o bloco veio), a da última tentativa de quem traz: foi quando se teve notícia dele
  const desde = vistoItem || (m && num(m.tentado) > 0 ? m.tentado : 0);
  if (semNoticia) return out("sem_noticia", desde ? `Sem notícia da ${r} desde ${hora(desde, agora, fuso)}` : `Sem notícia da ${r}`,
    `Quem lê a ${r} é o ${por}: ligue-o ou confira a rede dele.`);
  const e = m ? str(m.estado) : "";
  if (!m || (LENDO.includes(e) && !b)) return out("nunca", `A ${r} ainda não foi lida`, `Quem lê a ${r} é o ${por}; a primeira leitura sai sozinha.`);
  if (LENDO.includes(e)) {
    const quando = vistoDados ? hora(vistoDados, agora, fuso) : "";
    const titulo = !quando ? `${r} lida` : quando.length > 5 ? `${r} lida em ${quando.slice(0, 5)} às ${quando.slice(6)}` : `${r} lida às ${quando}`;
    return out(e, titulo, e === "kit_antigo" ? "kit antigo: atualize para ver tudo" : "");
  }
  const est = da(FRASES, e) ? e : "erro", [t, o] = FRASES[est];
  const link = est === "login" && LINK_RE.test(str(m.link)) ? {link: m.link} : null;
  return out(est, frase(t), frase(o), link);
}

// ==== As tarefas =====================================================================================================
const ESTADO_CHIP = {rodando: ["rodando", "andamento"], "na-fila": ["na fila", "neutro"], esperando: ["esperando", "neutro"],
  precisa: ["espera resposta", "atencao"], pronto: ["pronta", "ok"], falhou: ["falhou", "erro"], caiu: ["caiu", "erro"],
  parada: ["parada", "neutro"]};
const PR_ESTADOS = ["aberto", "juntado", "fechado"];
const GRUPOS = [
  {chave: "precisa", titulo: "Esperam resposta", icone: "❓", cor: "atencao"},
  {chave: "rodando", titulo: "Rodando", icone: "⚙️", cor: "andamento"},
  {chave: "fila", titulo: "Na fila", icone: "⏳", cor: "neutro"},
  {chave: "pronto_sem_pr", titulo: "Prontas sem PR", icone: "📦", cor: "atencao"},
  {chave: "falhou", titulo: "Falharam", icone: "⛔", cor: "erro"},
  {chave: "fechadas", titulo: "Fechadas", icone: "✅", cor: "neutro", recolhido: true},
];
// O PR que o kit sabe (por arquivo local): {numero, estado}, ou null
function prDe(t) {
  const p = obj(t.pr) ? t.pr : null, n = p && num(p.numero);
  return n != null && n > 0 && Number.isInteger(n) ? {numero: n, estado: PR_ESTADOS.includes(p.estado) ? p.estado : ""} : null;
}
// O nome da tarefa em palavras: o que vem depois do "repo: " do título, com a 1ª letra maiúscula
function curto(titulo) {
  const s = str(titulo), i = s.indexOf(": ");
  return cap(i > 0 && i < s.length - 2 ? s.slice(i + 2) : s);
}
const repoCurto = repo => limpar(str(repo).split("/").filter(Boolean).pop() || "", 60);
// O grupo de cada tarefa. A pronta com PR, ou com a branch publicada, vai para as Fechadas: o kit só sabe do PR ABERTO
// (a varredura do GitHub lista só os abertos), e a publicada sem "pr" é quase sempre a do PR já juntado. Fica em
// "Prontas sem PR" só a pronta sem PR e sem a branch publicada (publicado falso, ou sem notícia, como no kit 1.3.0)
function grupoDe(t) {
  const e = t.estado;
  if (e === "precisa") return "precisa";
  if (e === "rodando") return "rodando";
  if (e === "na-fila" || e === "esperando") return "fila";
  if (e === "falhou" || e === "caiu") return "falhou";
  if (e === "pronto") return prDe(t) || t.publicado === true ? "fechadas" : "pronto_sem_pr";
  return "fechadas";
}
// A hora de um momento: "às 17:23" (hoje) ou "em 16/11 às 17:23"; com "desde": "desde 17:23" ou "desde 16/11 às 17:23"
function horaDe(ts, tempo, desde) {
  const h = hora(ts, tempo.agora, tempo.fuso);
  return h.length > 5 ? `${desde ? "desde" : "em"} ${h.slice(0, 5)} às ${h.slice(6)}` : `${desde ? "desde" : "às"} ${h}`;
}
// O "quando" de cada estado. tempo: {agora, fuso, velha}. Lida agora, quanto tempo faz ("parou há 18 min"); com os dados
// velhos (sem leitura), a hora de cada coisa ("parou às 17:23"), porque contar da última leitura boa engana e contar de
// agora diria que ainda roda
function quandoDe(t, tempo) {
  const e = t.estado;
  const q = (iso, rot, desde) => {
    const s = segDe(iso);
    if (!s) return "";
    return tempo.velha ? `${rot} ${horaDe(s, tempo, desde)}` : `${rot} há ${duracao(tempo.agora - s)}`;
  };
  if (e === "rodando") return q(t.inicio, "rodando", true) || "rodando";
  if (e === "na-fila" || e === "esperando") return q(t.criada, "na fila", true);
  if (e === "pronto") return q(t.fim, "pronta");
  if (["precisa", "falhou", "caiu", "parada"].includes(e)) return q(t.fim, "parou");
  return "";
}
function cartao(t, grupo, tempo) {
  const e = str(t.estado), id = ID_RE.test(str(t.id)) ? t.id : "";
  const custo = num(t.custo_usd), teto = num(t.orcamento_usd), pr = prDe(t);
  const [rot, cor] = da(ESTADO_CHIP, e) || [limpar(e, 20) || "?", "neutro"];
  const chips = [{rot, cor}];
  if (e === "pronto") {
    chips.push(pr ? {rot: `PR #${pr.numero}${pr.estado ? " " + pr.estado : ""}`, cor: pr.estado === "fechado" ? "neutro" : "ok"}
      : t.publicado === false ? {rot: "branch não subiu", cor: "atencao"}
      : grupo === "pronto_sem_pr" ? {rot: "sem PR", cor: "atencao"} : {rot: "branch subiu", cor: "neutro"});
  }
  if (str(t.prioridade) === "alta" && (grupo === "fila" || grupo === "rodando")) chips.push({rot: "prioridade alta", cor: "atencao"});
  return {id, titulo: limpar(curto(t.titulo), 80) || id || "Tarefa", repo: repoCurto(t.repo), quando: quandoDe(t, tempo),
    custo: custo != null && custo >= 0 ? usd(custo) : "", teto: teto != null && teto > 0 ? usdTeto(teto) : "",
    pct: custo != null && custo >= 0 && teto != null && teto > 0 ? Math.max(0, Math.min(100, Math.round(custo / teto * 100))) : null,
    chips, ultima: limpar(t.ultima, 140),
    pergunta: e === "precisa" ? limpar(t.pergunta, 240) || limpar(t.motivo, 240) : "",
    motivo: ["falhou", "caiu", "parada"].includes(e) ? limpar(t.motivo, 200) : "",
    acoes: id ? ["log"] : []};
}
// A fila na ordem em que sai: a prioridade alta primeiro, depois a mais velha
function ordemFila(a, b) {
  const pa = str(a.prioridade) === "alta" ? 0 : 1, pb = str(b.prioridade) === "alta" ? 0 : 1;
  return pa - pb || segDe(a.criada) - segDe(b.criada);
}
function grupos(tarefas, tempo) {
  const por = {};
  for (const t of tarefas) { const g = grupoDe(t); (por[g] = por[g] || []).push(t); }
  if (por.fila) por.fila.sort(ordemFila);
  return GRUPOS.filter(g => (por[g.chave] || []).length).map(g => ({chave: g.chave, titulo: g.titulo, icone: g.icone, cor: g.cor,
    recolhido: !!g.recolhido, cartoes: por[g.chave].map(t => cartao(t, g.chave, tempo))}));
}
// Os chips do alto: só os que têm número; "fila vazia" se nada
function resumo(f, gs) {
  const n = k => ((gs.find(g => g.chave === k) || {}).cartoes || []).length;
  const fila = obj(f) ? f : {};
  const rodando = num(fila.rodando) != null ? fila.rodando : n("rodando");
  const naFila = num(fila.esperando) != null ? fila.esperando : n("fila");
  const p = n("precisa"), s = n("pronto_sem_pr"), x = n("falhou");
  const out = [];
  if (rodando > 0) out.push({rot: `${rodando} rodando`, cor: "andamento"});
  if (naFila > 0) out.push({rot: `${naFila} na fila`, cor: "neutro"});
  if (p > 0) out.push({rot: `${p} ${p === 1 ? "espera" : "esperam"} resposta`, cor: "atencao"});
  if (s > 0) out.push({rot: `${s} ${s === 1 ? "pronta" : "prontas"} sem PR`, cor: "atencao"});
  if (x > 0) out.push({rot: `${x} ${x === 1 ? "falhou" : "falharam"}`, cor: "erro"});
  return out.length ? out : [{rot: "fila vazia", cor: "neutro"}];
}

// ==== As rotinas (os crons da VPS) ===================================================================================
const NOMES = {"github-varredura": "Varredura do GitHub", "testes-noite": "Testes da noite", "relatorio-dia": "Relatório do dia",
  "olheiro-internet": "Olheiro da internet"};
// o que cada rotina conhecida faz, em palavras (o "o_que" do registro do kit traz termos internos); outra rotina fica
// com o "o_que" que o kit mandou
const DESCRICOES = {"github-varredura": "Confere os PRs abertos e as branches sem PR dos repositórios",
  "testes-noite": "Roda os testes de cada repositório numa cópia nova", "relatorio-dia": "Junta o dia da VPS: tarefas, custo, rotinas e saúde",
  "olheiro-internet": "Põe na fila a pesquisa das novidades de IA da semana"};
const COR_NIVEL = {ok: "ok", atencao: "atencao", problema: "erro"};
const nomeRotina = n => da(NOMES, n) || cap(limpar(n, 40).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim()) || "Rotina";
// A agenda do kit em palavras: "diario 07:30,19:30" → "todo dia às 07:30 e 19:30", "seg-sex 18:30" → "de segunda a sexta
// às 18:30", "cada 30min" → "a cada 30 min", "cada 6h" → "a cada 6 h". Outra coisa fica como veio (limpa). O corte é o
// do kit (60), o mesmo do agente e do Seaninho Pro
function agendaDe(a) {
  const s = limpar(a, 60), x = s.toLowerCase().replace(/\s+/g, " ").trim();
  const horas = t => {
    const hs = t.split(",").map(h => h.trim());
    return hs.length && hs.every(h => /^([01]?\d|2[0-3]):[0-5]\d$/.test(h)) ? hs.map(h => h.padStart(5, "0")) : null;
  };
  const juntar = hs => (hs.length > 1 ? `${hs.slice(0, -1).join(", ")} e ${hs[hs.length - 1]}` : hs[0]);
  const d = /^(di[aá]rio|seg-sex) (.+)$/.exec(x), hs = d && horas(d[2]);
  if (hs) return `${d[1] === "seg-sex" ? "de segunda a sexta" : "todo dia"} às ${juntar(hs)}`;
  const c = /^cada (\d{1,4}) ?(min|h)$/.exec(x);
  if (c && +c[1] > 0) return `a cada ${+c[1]} ${c[2]}`;
  return s;
}
// tempo: {agora, fuso, velha}. Com os dados velhos, só a hora da rodada (o "há" contaria da última leitura boa)
function rotinas(crons, tempo) {
  return ls(crons).filter(c => obj(c) && str(c.nome).trim()).slice(0, 8).map(c => {
    const ult = segDe(c.ultima), ligado = c.ligado !== false, nome = str(c.nome);
    const quando = !ult ? "ainda não rodou" : horaDe(ult, tempo) + (tempo.velha ? "" : ` (${ha(tempo.agora - ult)})`)
      + (num(c.duracao_s) != null && c.duracao_s >= 0 ? ` · levou ${duracao(c.duracao_s)}` : "");
    return {nome: nomeRotina(nome), o_que: da(DESCRICOES, nome) || limpar(c.o_que, 100), agenda: agendaDe(c.agenda),
      quando, resumo: limpar(c.resumo, 160), cor: ligado ? da(COR_NIVEL, c.nivel) || "neutro" : "neutro", ligado};
  });
}

// ==== A saúde ========================================================================================================
function saude(b) {
  const chips = [], itens = [];
  const ram = obj(b.ram) ? b.ram : {}, f = obj(b.fila) ? b.fila : {}, d = obj(b.disco) ? b.disco : {}, cpu = obj(b.cpu) ? b.cpu : {};
  const livre = num(ram.livre_mb), total = num(ram.total_mb);
  if (livre != null) chips.push({rot: total ? `RAM ${gb(livre)} de ${gb(total)} GB livres` : `RAM ${gb(livre)} GB livres`,
    cor: livre < 700 ? "erro" : livre < 1500 ? "atencao" : "ok"});
  const rod = num(f.rodando), max = num(f.max_sessoes);
  if (rod != null && max) chips.push({rot: `Sessões ${rod} de ${max}`, cor: rod >= max ? "atencao" : "ok"});
  const barrada = ls(f.esperando_por).map(x => limpar(x, 160)).filter(Boolean).slice(0, 3);
  if (f.pausada === true) chips.push({rot: "Fila pausada", cor: "atencao"});
  else if (barrada.length) chips.push({rot: limpar(`Fila barrada: ${barrada.join(" · ")}`, 180), cor: "atencao"});
  const dl = num(d.livre_gb), dt = num(d.total_gb);
  if (dl != null) chips.push({rot: dt ? `Disco ${Math.round(dl)} de ${Math.round(dt)} GB livres` : `Disco ${Math.round(dl)} GB livres`,
    cor: dl < 5 ? "erro" : dl < 10 ? "atencao" : "ok"});
  const carga = num(cpu.carga), nuc = num(cpu.nucleos);
  if (carga != null && nuc && carga > 2.5 * nuc) chips.push({rot: `Carga alta: ${virgula(carga, 2)}`, cor: "atencao"});
  const co = obj(b.coordenador) ? b.coordenador : {}, min = num(co.min);
  if (min != null && min > 45) itens.push({texto: `O coordenador não dá sinal há ${duracao(min * 60)}`, cor: "atencao"});
  for (const i of ls(obj(b.saude) ? b.saude.itens : null).slice(0, 6)) {
    if (!obj(i) || !da(COR_NIVEL, i.nivel) || i.nivel === "ok") continue;
    const texto = limpar(i.texto, 200);
    if (texto) itens.push({texto, cor: COR_NIVEL[i.nivel]});
  }
  return {chips, itens};
}

// ==== O modelo =======================================================================================================
// opcoes: {por (o PC que traz a VPS), sem_noticia (bool), visto_item (epoch s: a última notícia do item), rotulo,
// coordenador (o nome de quem cuida do kit, na frase do erro; padrão "coordenador"), fuso_min (o fuso em minutos, -180
// em Brasília; sem ele, o do aparelho)}
function modelo(maquina, agora_s, opcoes) {
  const op = obj(opcoes) ? opcoes : {}, agora = num(agora_s) || 0, fuso = num(op.fuso_min);
  const {m, vistoItem, semNoticia} = entrada(maquina, agora, op);
  const b = m && m.formato === 1 && obj(m.batida) ? m.batida : null;
  const r = limpar(op.rotulo, 20) || (m && limpar(m.rotulo, 20)) || "VPS";
  const por = limpar(op.por, 40) || (m && limpar(m.por, 40)) || "outro computador";
  const coord = limpar(op.coordenador, 30) || "coordenador";
  const vistoDados = (m && num(m.visto) > 0 ? m.visto : 0) || (b ? segDe(b.quando) : 0);
  const L = leitura(m, b, {agora, fuso, r, por, coord, semNoticia, vistoItem, vistoDados});
  if (!b) return {leitura: L, resumo: [], grupos: [], rotinas: [], saude: {chips: [], itens: []}};
  // sem leitura, os tempos saem como hora ("parou às 17:23"), não como "há" (que contaria da última leitura boa)
  const tempo = {agora, fuso, velha: L.velha};
  const tarefas = ls(b.tarefas).filter(obj).slice(0, 12);
  const gs = grupos(tarefas, tempo);
  return {leitura: L, resumo: resumo(b.fila, gs), grupos: gs, rotinas: rotinas(b.crons, tempo), saude: saude(b)};
}

// ==== O HTML =========================================================================================================
const ICONE_LEITURA = {online: "☁", kit_antigo: "☁", login: "🔑", sem_tailscale: "🔌", fora: "⏳", chave_mudou: "🔐", erro: "⚠",
  sem_noticia: "📡", nunca: "☁", formato_novo: "⬆"};
const COR_OK = ["ok", "atencao", "erro", "andamento", "neutro"];
const cl = cor => "va-c-" + (COR_OK.includes(cor) ? cor : "neutro");
const chip = c => `<span class="va-chip ${cl(c.cor)}">${esc(c.rot)}</span>`;
const cabGrupo = (icone, titulo, n) => `<span class="va-gi" aria-hidden="true">${esc(icone)}</span><span class="va-gt">${esc(titulo)}</span>${
  n != null ? `<span class="va-n">${esc(n)}</span>` : ""}`;
function cartaoHtml(c, g, aberto, logOk, porque) {
  const id = esc(c.id), previa = c.pergunta || c.motivo || c.ultima;
  const barra = c.pct != null ? `<span class="va-barra" role="img" aria-label="${esc(c.pct)}% do teto"><i style="width:${esc(c.pct)}%"></i></span>` : "";
  const custo = c.custo && c.teto ? `${c.custo} de ${c.teto}` : c.custo ? c.custo : c.teto ? `teto ${c.teto}` : "";
  const linha = (rot, txt, extra) => (txt ? `<p class="va-d${extra || ""}"><span class="va-dr">${esc(rot)}</span><span>${esc(txt)}</span></p>` : "");
  const agoraRot = g.chave === "rodando" ? "Agora" : "Por último";
  return `<article class="va-card ${cl(g.cor)}${aberto ? " va-aberto" : ""}"${c.id ? ` data-va-card="${id}"` : ""}>`
    + `<button type="button" class="va-cab" data-va="abrir"${c.id ? ` data-va-id="${id}"` : ""} aria-expanded="${aberto ? "true" : "false"}">`
    + `<span class="va-l1"><b class="va-t">${esc(c.titulo)}</b>${c.repo ? `<span class="va-repo">${esc(c.repo)}</span>` : ""}</span>`
    + `<span class="va-l2">${c.chips.map(chip).join("")}${c.quando ? `<span class="va-q">${esc(c.quando)}</span>` : ""}${
      c.custo ? `<span class="va-q">${esc(c.custo)}</span>` : ""}</span>`
    + (previa ? `<span class="va-l3">${esc(previa)}</span>` : "")
    + `</button><div class="va-det">`
    + (custo ? `<p class="va-d va-custo"><span class="va-dr">Custo</span><span>${esc(custo)}</span>${barra}</p>` : "")
    + linha("Pergunta", c.pergunta, " va-forte") + linha("Motivo", c.motivo) + linha(agoraRot, c.ultima)
    + (c.repo ? linha("Repositório", c.repo) : "")
    + (c.acoes.includes("log") && c.id ? `<div class="va-bs"><button type="button" class="va-bt" data-va="log" data-va-id="${id}"${
      logOk ? "" : ` disabled title="${esc(porque)}"`}>Ver log</button></div>` : "")
    + `</div></article>`;
}
function grupoHtml(g, abertos, logOk, porque) {
  const cs = `<div class="va-cs">${g.cartoes.map(c => cartaoHtml(c, g, abertos.has(c.id), logOk, porque)).join("")}</div>`;
  if (g.recolhido) {
    return `<details class="va-g ${cl(g.cor)} va-recolhido" data-va-grupo="${esc(g.chave)}"${abertos.has("grupo:" + g.chave) ? " open" : ""}>`
      + `<summary class="va-gh">${cabGrupo(g.icone, g.titulo, g.cartoes.length)}</summary>${cs}</details>`;
  }
  return `<section class="va-g ${cl(g.cor)}" data-va-grupo="${esc(g.chave)}"><h4 class="va-gh">${cabGrupo(g.icone, g.titulo, g.cartoes.length)}</h4>${cs}</section>`;
}
function rotinasHtml(rs) {
  if (!rs.length) return "";
  return `<section class="va-g va-rotinas" data-va-grupo="rotinas"><h4 class="va-gh">${cabGrupo("⏰", "Rotinas", rs.length)}</h4><ul class="va-rs">${
    rs.map(r => `<li class="va-r ${cl(r.cor)}${r.ligado ? "" : " va-desligada"}"><i class="va-dot" aria-hidden="true"></i><div class="va-rc">`
      + `<p class="va-rt"><b>${esc(r.nome)}</b>${r.agenda ? `<small>${esc(r.agenda)}</small>` : ""}${r.ligado ? "" : `<span class="va-tag">desligada</span>`}</p>`
      + `<p class="va-rq">${esc(r.quando)}</p>${r.resumo || r.o_que ? `<p class="va-rr">${esc(r.resumo || r.o_que)}</p>` : ""}</div></li>`).join("")}</ul></section>`;
}
function saudeHtml(s) {
  if (!s.chips.length && !s.itens.length) return "";
  return `<section class="va-g va-saude" data-va-grupo="saude"><h4 class="va-gh">${cabGrupo("🩺", "Saúde")}</h4>`
    + (s.chips.length ? `<div class="va-chips">${s.chips.map(chip).join("")}</div>` : "")
    + (s.itens.length ? `<ul class="va-itens">${s.itens.map(i => `<li class="${cl(i.cor)}"><i class="va-dot" aria-hidden="true"></i><span>${esc(i.texto)}</span></li>`).join("")}</ul>` : "")
    + `</section>`;
}
// opcoes: {abertos: [ids das tarefas abertas e "grupo:fechadas"], log: false (o "Ver log" desligado de vez)}
function html(md, opcoes) {
  if (!obj(md) || !obj(md.leitura)) return "";
  const op = obj(opcoes) ? opcoes : {}, L = md.leitura, abertos = new Set(ls(op.abertos).map(String));
  const lendo = LENDO.includes(L.estado), logOk = lendo && op.log !== false;
  const porque = lendo ? "O log não está disponível agora" : "A VPS está sem leitura agora";
  const faixa = `<div class="va-leitura ${cl(L.cor)}" role="status" data-va-estado="${esc(L.estado)}">`
    + `<span class="va-li" aria-hidden="true">${esc(ICONE_LEITURA[L.estado] || "☁")}</span>`
    + `<div class="va-lt"><b>${esc(L.titulo)}</b>${L.oque_fazer ? `<span>${esc(L.oque_fazer)}</span>` : ""}</div>`
    + (L.link && LINK_RE.test(L.link) ? `<a class="va-bt va-bt-forte" data-va="link" href="${esc(L.link)}" target="_blank" rel="noopener noreferrer">Confirmar no Tailscale</a>` : "")
    + `</div>`;
  const resumoVazio = !ls(md.resumo).length;
  if (resumoVazio) return `<div class="va" data-va-estado="${esc(L.estado)}">${faixa}${L.estado === "nunca" || L.estado === "formato_novo" ? ""
    : `<p class="va-vazio">Ainda sem a primeira leitura.</p>`}</div>`;
  const velha = L.velha ? `<p class="va-velha">Dados de ${esc(L.ultima_boa || "antes")}: a última leitura boa.</p>` : "";
  const corpo = `<div class="va-chips va-resumo">${md.resumo.map(chip).join("")}</div>`
    + ls(md.grupos).map(g => grupoHtml(g, abertos, logOk, porque)).join("")
    + rotinasHtml(ls(md.rotinas)) + saudeHtml(obj(md.saude) ? {chips: ls(md.saude.chips), itens: ls(md.saude.itens)} : {chips: [], itens: []});
  return `<div class="va${L.velha ? " va-tem-velha" : ""}" data-va-estado="${esc(L.estado)}">${faixa}${velha}<div class="va-corpo${L.velha ? " va-apagado" : ""}">${corpo}</div></div>`;
}

const VpsAtividade = {
  modelo, html,
  _puro: {limpar, esc, hora, horaDe, duracao, ha, curto, repoCurto, prDe, grupoDe, quandoDe, cartao, grupos, resumo, rotinas, saude,
    leitura, entrada, nomeRotina, agendaDe, usd, usdTeto, gb, ID_RE, LINK_RE, GRUPOS, FRASES, DESCRICOES, SEM_NOTICIA_S},
};
root.VpsAtividade = VpsAtividade;
if (typeof module !== "undefined" && module.exports) module.exports = VpsAtividade;
})(typeof window !== "undefined" ? window : globalThis);
