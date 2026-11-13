// Seaninho no celular: a máquina de fila (a VPS) no Computadores, sem tela (página v27, agente 0.9.0.16).
// A linha da máquina chega na tabela dos PCs (o agente do PC que a traz publica `hoje.maquina`, o bloco formato 1), mas
// ela não é um PC: não tem sessões, nem ⏻, nem "Pedir". Aqui: reconhecer a máquina, a lista branca do bloco, o estado da
// tela (online, login, sem notícia…), o HTML do cartão e das folhas, o texto dos pedidos (tipo "acao", acao "maquina") e
// a leitura da resposta. A página desenha e manda; testado no Node (test_maquinas.cjs).
// Pedido do Arthur (13/11, 06h05): "quero ver o vps na seaninho" e "colocar ele para rodar demandas".
(function (raiz) {
"use strict";

const FORMATO = 1;
const SEM_NOTICIA_MS = 180000;   // o visto_em da linha mais velho que isso: sem notícia (a vida sai a cada 60 s)
const ONLINE_PC_MS = 150000;     // o online() da página, para dizer se o PC que traz a máquina está desligado
const PEGAR_MS = 60000;          // o pedido "novo" depois disso: o PC ainda não pegou
const ESPERA_MS = 180000;        // a folha para de perguntar depois disso
const TEXTO_MAX = 4000, LINHAS_PADRAO = 60, LINHAS_MAX = 80, PEDIDO_MAX = 8000;
const MODOS = ["enviar", "log", "pausar", "retomar"];
const MODO_TITULO = {enviar: "mandar tarefa", log: "ver log", pausar: "pausar a fila", retomar: "retomar a fila"};
const MODO_ACEITA = {enviar: "mandar tarefa", log: "ver log", pausar: "pausar", retomar: "retomar"};
const ESTADOS = ["online", "kit_antigo", "login", "sem_tailscale", "chave_mudou", "fora", "erro"];
const ID_RE = /^\d{4}-\d{6}-[a-z0-9-]{1,40}$/;
const NOME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
const LINK_RE = /^https:\/\/login\.tailscale\.com\/[A-Za-z0-9/_?=&.%-]{1,200}$/;
const MODELO_RE = /^[a-z0-9.-]{1,30}$/;
// a pílula de cada estado de tarefa: [texto, cor]
const TAREFA = {"na-fila": ["na fila", "espera"], esperando: ["esperando", "espera"], rodando: ["rodando", "anda"],
  pronto: ["pronto", "ok"], precisa: ["precisa de resposta", "espera"], falhou: ["falhou", "erro"], caiu: ["caiu", "erro"],
  parada: ["parada", "off"]};
const CLIQUES = ["enviar", "log", "pausar", "retomar", "tarefa-log", "ver-todas", "mandar", "escolher", "de-novo",
  "cancelar-pedido", "fechar"];

// ---- pequenos ----
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const obj = v => !!v && typeof v === "object" && !Array.isArray(v);
const num = v => typeof v === "number" && Number.isFinite(v) ? v : null;   // nunca bool, nunca texto
const inteiro = v => num(v) !== null ? Math.round(v) : null;
const texto = (v, max) => typeof v === "string" ? [...v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")].slice(0, max).join("") : "";
const letras = s => [...String(s || "")].length;
const lista = (v, max) => Array.isArray(v) ? v.slice(0, max) : [];
const doisDig = n => String(n).padStart(2, "0");
const virgula = (v, casas) => v.toFixed(casas).replace(".", ",");
const msDe = iso => { const t = Date.parse(iso || ""); return Number.isFinite(t) ? t : 0; };
// "08:00" no mesmo dia; de outro dia, "12/11 22:10"
function quando(ms, agora) {
  if (!ms) return "";
  const d = new Date(ms), h = new Date(agora), hm = `${doisDig(d.getHours())}:${doisDig(d.getMinutes())}`;
  return d.toDateString() === h.toDateString() ? hm : `${doisDig(d.getDate())}/${doisDig(d.getMonth() + 1)} ${hm}`;
}
const gbDeMb = mb => virgula(mb / 1000, 1) + " GB";
const usd = v => "US$ " + virgula(v, 2);
const usdLimite = v => Number.isInteger(v) ? String(v) : virgula(v, 2);
// o número como o Python escreve um float no json.dumps (2 → "2.0", 2.5 → "2.5"): o texto do pedido sai igual ao do Monitor
const float = v => Number.isInteger(v) ? v.toFixed(1) : String(v);
function duracao(s) {
  if (s == null || s < 0) return "";
  if (s < 60) return "<1 min";
  const min = Math.round(s / 60);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`;
}
const juntarE = xs => xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`;
const juntarOu = xs => xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ou ${xs[xs.length - 1]}`;

// ---- reconhecer e normalizar ----
const blocoDe = p => obj(p) ? (obj(p.hoje) && obj(p.hoje.maquina) ? p.hoje.maquina : obj(p.maquina) ? p.maquina : null) : null;
// A máquina pelo versao ("kit 1.1.2", que a leve também traz) ou pelo bloco; o resto é PC.
function ehMaquina(p) {
  if (!obj(p)) return false;
  return /^kit /.test(String(p.versao || "")) || !!blocoDe(p);
}

function normalizarBatida(b) {
  if (!obj(b)) return null;
  const r = {versao: texto(b.versao, 20), quando: texto(b.quando, 40)};
  if (obj(b.ram)) r.ram = {total_mb: num(b.ram.total_mb), livre_mb: num(b.ram.livre_mb), swap_total_mb: num(b.ram.swap_total_mb),
                           swap_usado_mb: num(b.ram.swap_usado_mb)};
  if (obj(b.disco)) r.disco = {livre_gb: num(b.disco.livre_gb), total_gb: num(b.disco.total_gb)};
  if (obj(b.cpu)) r.cpu = {carga: num(b.cpu.carga), nucleos: inteiro(b.cpu.nucleos)};
  if (obj(b.fila)) {
    const f = b.fila;
    r.fila = {pausada: f.pausada === true, rodando: inteiro(f.rodando), esperando: inteiro(f.esperando),
              max_sessoes: inteiro(f.max_sessoes), esperando_por: lista(f.esperando_por, 3).map(x => texto(x, 160)).filter(Boolean),
              despachante_em: texto(f.despachante_em, 40), despachante_min: inteiro(f.despachante_min)};
  }
  if (obj(b.saude)) r.saude = {quando: texto(b.saude.quando, 40), nivel: texto(b.saude.nivel, 20),
    itens: lista(b.saude.itens, 6).filter(obj).map(i => ({nivel: texto(i.nivel, 20), texto: texto(i.texto, 200)})).filter(i => i.texto)};
  if (obj(b.avisos)) r.avisos = {novos: Math.max(0, inteiro(b.avisos.novos) || 0),
    recentes: lista(b.avisos.recentes, 3).filter(obj).map(a => ({quando: texto(a.quando, 40),
      novos: lista(a.novos, 4).map(x => texto(x, 200)).filter(Boolean),
      resolvidos: lista(a.resolvidos, 4).map(x => texto(x, 80)).filter(Boolean)}))};
  if (obj(b.coordenador)) r.coordenador = {batida: texto(b.coordenador.batida, 40), min: inteiro(b.coordenador.min)};
  r.tarefas = lista(b.tarefas, 12).filter(obj).map(t => ({
    id: ID_RE.test(String(t.id || "")) ? String(t.id) : "", titulo: texto(t.titulo, 80), estado: texto(t.estado, 20),
    criada: texto(t.criada, 40), inicio: texto(t.inicio, 40), fim: texto(t.fim, 40), custo_usd: num(t.custo_usd),
    duracao_s: num(t.duracao_s), motivo: texto(t.motivo, 120), repo: texto(t.repo, 80), branch: texto(t.branch, 120),
    modelo: texto(t.modelo, 30), prioridade: texto(t.prioridade, 20), commits: inteiro(t.commits)}));
  return r;
}

// A lista branca do bloco (o da linha da tabela dos PCs, ou o próprio bloco). Nunca quebra: o que falta vira vazio.
// Devolve null se não for máquina. `carregando`: a linha chegou (pela leve) e o bloco ainda não.
function normalizar(p) {
  if (!obj(p)) return null;
  const ehBloco = "formato" in p && "estado" in p && !("pc" in p);
  const b = ehBloco ? p : blocoDe(p);
  if (!ehBloco && !ehMaquina(p)) return null;
  const nome = ehBloco ? texto(b.nome, 40) : texto(p.pc, 40) || texto((b || {}).nome, 40);
  const base = {pc: NOME_RE.test(nome) ? nome : "", vistoEm: ehBloco ? 0 : msDe(p.visto_em), versao: ehBloco ? "" : texto(p.versao, 30)};
  if (!b) return {...base, carregando: true, formato: FORMATO, rotulo: rotuloDe(base.pc), estado: "", motivo: "", link: "",
    tentado: 0, visto: 0, intervalo_s: 300, por: "", acoes: [], modelos: [], orcamento: {min: 0.1, max: 20, padrao: 2}, batida: null,
    kit: kitDe(base.versao, null)};
  const formato = inteiro(b.formato);
  if (formato !== FORMATO) return {...base, formato, rotulo: texto(b.rotulo, 20) || rotuloDe(base.pc), estado: "erro",
    motivo: "Formato novo da máquina: atualize o app.", link: "", tentado: 0, visto: 0, intervalo_s: 300, por: texto(b.por, 40),
    acoes: [], modelos: [], orcamento: {min: 0.1, max: 20, padrao: 2}, batida: null, kit: "", novo: true};
  const estado = ESTADOS.includes(b.estado) ? b.estado : "erro";
  const link = typeof b.link === "string" && LINK_RE.test(b.link) ? b.link : "";
  const orc = obj(b.orcamento) ? b.orcamento : {};
  const min = num(orc.min) ?? 0.1, max = num(orc.max) ?? 20;
  const modelos = lista(b.modelos, 6).filter(x => typeof x === "string" && MODELO_RE.test(x));
  const batida = normalizarBatida(b.batida);
  return {...base, formato, tipo: texto(b.tipo, 20), rotulo: texto(b.rotulo, 20) || rotuloDe(base.pc), estado,
    motivo: texto(b.motivo, 200) || (ESTADOS.includes(b.estado) ? "" : "Estado desconhecido da máquina."),
    link: estado === "login" ? link : "", tentado: inteiro(b.tentado) || 0, visto: inteiro(b.visto) || 0,
    intervalo_s: Math.min(3600, Math.max(60, inteiro(b.intervalo_s) || 300)), por: texto(b.por, 40),
    acoes: lista(b.acoes, 4).filter(x => MODOS.includes(x)), modelos,
    orcamento: {min, max, padrao: Math.min(max, Math.max(min, num(orc.padrao) ?? 2))}, batida, kit: kitDe(base.versao, batida)};
}
const rotuloDe = pc => String(pc || "máquina").split("-")[0].toUpperCase().slice(0, 20);
const kitDe = (versao, batida) => (batida && batida.versao) || (/^kit (\S+)/.exec(versao || "") || [])[1] || "";

// ---- o estado na tela (igual ao Monitor) ----
// {cor: ok|espera|erro|off, texto, faixa: {tipo, texto, link?} | null, responde, dadosDe, semNoticia}
function situacao(m, agora, pcs = {}) {
  if (!m) return {cor: "off", texto: "", faixa: null, responde: false, dadosDe: "", semNoticia: true};
  const dadosDe = m.visto ? quando(m.visto * 1000, agora) : "";
  const semNoticia = !m.vistoEm || agora - m.vistoEm > SEM_NOTICIA_MS;
  if (semNoticia) {
    const por = m.por || "PC", pc = obj(pcs) ? pcs[m.por] : null;
    const desligado = obj(pc) && !(agora - msDe(pc.visto_em) < ONLINE_PC_MS);
    return {cor: "off", texto: m.vistoEm ? `sem notícia desde ${quando(m.vistoEm, agora)}` : "sem notícia",
      faixa: {tipo: "off", texto: `Quem traz a ${m.rotulo} é o ${por}.${desligado ? ` (o ${por} está desligado)` : ""}`},
      responde: false, dadosDe, semNoticia: true};
  }
  if (m.carregando) return {cor: "espera", texto: "carregando os dados…", faixa: null, responde: false, dadosDe, semNoticia: false};
  if (m.novo) return {cor: "erro", texto: "formato novo: atualize", faixa: {tipo: "erro", texto: m.motivo}, responde: false, dadosDe, semNoticia: false};
  if (m.estado === "online" || m.estado === "kit_antigo") return {cor: "ok", texto: m.visto ? `online · dados de ${dadosDe}` : "online",
    faixa: m.estado === "kit_antigo" && m.motivo ? {tipo: "espera", texto: m.motivo} : null, responde: true, dadosDe, semNoticia: false};
  if (m.estado === "login") return {cor: "espera", texto: "precisa do seu login",
    faixa: {tipo: "espera", texto: m.motivo || "Precisa do seu login.", ...(m.link ? {link: m.link} : {})}, responde: false, dadosDe, semNoticia: false};
  return {cor: "erro", texto: m.visto ? `sem resposta desde ${dadosDe}` : "sem resposta",
    faixa: {tipo: "erro", texto: m.motivo || "A máquina não respondeu."}, responde: false, dadosDe, semNoticia: false};
}

// as cores do kit: RAM livre < 1500 MB (a fila não abre sessão) e < 700 MB; disco < 10 e < 5 GB; carga > 2,5 × núcleos
const corRam = livre => livre == null ? "" : livre < 700 ? "erro" : livre < 1500 ? "espera" : "ok";
const corDisco = livre => livre == null ? "" : livre < 5 ? "erro" : livre < 10 ? "espera" : "ok";
const corCarga = (carga, nucleos) => carga == null || !nucleos ? "" : carga > 2.5 * nucleos ? "espera" : "ok";
function ramPct(b) {
  const r = b && b.ram;
  return r && r.total_mb && r.livre_mb != null ? Math.max(0, Math.min(100, Math.round(100 * (1 - r.livre_mb / r.total_mb)))) : null;
}
function linhaFila(f) {
  if (!f) return "";
  return [f.rodando != null ? `${f.rodando} rodando` : "", f.esperando != null ? `${f.esperando} esperando` : "",
    f.max_sessoes ? `até ${f.max_sessoes} ao mesmo tempo` : ""].filter(Boolean).join(" · ");
}
function tempoTarefa(t, agora) {
  if (t.estado === "rodando") { const i = msDe(t.inicio); return i ? `rodando há ${duracao((agora - i) / 1000)}` : ""; }
  const d = t.duracao_s != null ? t.duracao_s : msDe(t.inicio) && msDe(t.fim) ? (msDe(t.fim) - msDe(t.inicio)) / 1000 : null;
  return duracao(d);
}
const pilula = estado => { const [t, c] = TAREFA[estado] || [estado || "?", "off"]; return `<span class="mq-pill ${c}">${esc(t)}</span>`; };
const tarefaDe = (m, id) => ((m && m.batida && m.batida.tarefas) || []).find(t => t.id === id) || null;
// a que o "Ver log" marca: a mais nova rodando; senão, a mais nova
function tarefaDoLog(m) {
  const ts = ((m && m.batida && m.batida.tarefas) || []).filter(t => t.id);
  const mais = xs => xs.slice().sort((a, b) => b.id.localeCompare(a.id))[0] || null;
  return mais(ts.filter(t => t.estado === "rodando")) || mais(ts);
}

// ---- HTML: o mini-cartão do Início ----
function htmlResumo(m, ctx = {}) {
  if (!m || !m.pc) return "";
  const agora = ctx.agora || Date.now(), s = situacao(m, agora, ctx.pcs), b = m.batida;
  const nums = [b && !s.semNoticia ? linhaCurtaFila(b.fila) : "", b && ramPct(b) != null && !s.semNoticia ? `RAM ${ramPct(b)}%` : ""]
    .filter(Boolean).join(" · ");
  const al = [];
  if (s.faixa && s.faixa.tipo !== "off") al.push({texto: m.estado === "login" ? "precisa do seu login no card" : s.faixa.texto, critico: s.faixa.tipo === "erro"});
  if (!s.semNoticia && b && b.avisos && b.avisos.novos) al.push({texto: `${b.avisos.novos} ${b.avisos.novos === 1 ? "aviso novo" : "avisos novos"}`});
  if (!s.semNoticia && b && b.fila && b.fila.pausada) al.push({texto: "fila pausada"});
  return `<button class="pcm maq ${s.cor === "off" ? "off" : ""}" data-pcs-abrir="${esc(m.pc)}" aria-label="${esc(m.rotulo)}, máquina de fila: ${esc(s.texto)}. Abrir">
      <span class="pcm-cab"><i class="dot ${s.cor}"></i><b><span aria-hidden="true">☁</span> ${esc(m.rotulo)}</b><small class="mq-sub">máquina de fila</small></span>
      <span class="pcm-est">${esc(s.texto)}</span>${nums ? `<span class="pcm-num">${esc(nums)}</span>` : ""}
      ${al.slice(0, 2).map(a => `<span class="pcm-al ${a.critico ? "critico" : ""}">${esc(a.texto)}</span>`).join("")}</button>`;
}
const linhaCurtaFila = f => f ? [f.rodando != null ? `${f.rodando} rodando` : "", f.esperando != null ? `${f.esperando} esperando` : ""]
  .filter(Boolean).join(" · ") : "";

// ---- HTML: o cartão da tela Computadores ----
// ctx: {agora, pcs, todas (o "ver todas" aberto), coordenador (o nome da linha do coordenador; padrão "coordenador")}
function htmlCartao(m, ctx = {}) {
  if (!m || !m.pc) return "";
  const agora = ctx.agora || Date.now(), s = situacao(m, agora, ctx.pcs), b = m.batida, pc = esc(m.pc);
  const sub = ["máquina de fila", m.kit ? `kit ${m.kit}` : ""].filter(Boolean).join(" · ");
  const topo = `<div class="pc-topo"><span class="ico" aria-hidden="true">☁</span>
      <div class="nome"><b>${esc(m.rotulo)}</b><small class="${s.cor}"><i class="dot ${s.cor}"></i><span>${esc(s.texto)}</span></small></div></div>
    <p class="pc-sub">${esc(sub)}</p>`;
  const faixa = s.faixa ? `<div class="mq-faixa ${s.faixa.tipo}" role="status"><span>${esc(s.faixa.texto)}</span>${s.faixa.link
    ? `<a class="btn" href="${esc(s.faixa.link)}" target="_blank" rel="noopener">Abrir o login</a>` : ""}</div>` : "";
  let corpo;
  if (m.novo) corpo = "";
  else if (m.carregando) corpo = `<div class="mq-sec"><p class="mq-vazio"><span class="spin"></span>Carregando os dados da máquina…</p></div>`;
  else if (!b || !m.visto) corpo = `<div class="mq-sec"><p class="mq-vazio">Ainda sem a primeira leitura.</p></div>`;
  else corpo = (s.responde ? "" : `<p class="mq-velho">Os dados abaixo são de ${esc(s.dadosDe)}, a última leitura boa.</p>`)
    + secSaude(b) + secFila(b) + secTarefas(m, b, agora, {...ctx, logOk: s.responde && m.acoes.includes("log")}) + secAvisos(b, agora, ctx);
  const pode = modo => s.responde && m.acoes.includes(modo) ? "" : "disabled";
  const bt = (modo, rot, cls) => `<button class="btn ${cls}" data-mq="${modo}" data-mq-pc="${pc}" ${pode(modo)}>${rot}</button>`;
  const botoes = m.novo ? "" : `<div class="mq-bts">${bt("enviar", `<span aria-hidden="true">+</span> Mandar tarefa`, "")}
      <div class="mq-bts3">${bt("log", "Ver log", "sec")}${bt("pausar", "Pausar", "sec")}${bt("retomar", "Retomar", "sec")}</div></div>`;
  const rodape = m.por ? `<p class="mq-rodape">trazida pelo ${esc(m.por)} a cada ${Math.round(m.intervalo_s / 60)} min</p>` : "";
  return `<section class="pcc maq ${s.cor === "off" ? "off" : ""}" data-pc-card="${pc}" aria-label="${esc(m.rotulo)}, máquina de fila">${topo}${faixa}${corpo}${botoes}${rodape}</section>`;
}
function secSaude(b) {
  const out = [], r = b.ram, d = b.disco, c = b.cpu, pct = ramPct(b);
  if (r && r.livre_mb != null) {
    const cor = corRam(r.livre_mb);
    out.push(`<div class="mq-ram"><div class="mq-lin"><span>RAM</span>${pct != null ? `<b class="${cor}">${pct}% em uso</b>` : ""}</div>
      ${pct != null ? `<div class="barra" role="img" aria-label="RAM ${pct}% em uso"><i class="${cor}" style="width:${pct}%"></i></div>` : ""}
      <small class="${cor === "ok" ? "" : cor}">${gbDeMb(r.livre_mb)} livres${r.total_mb ? ` de ${gbDeMb(r.total_mb)}` : ""}</small>
      ${r.swap_usado_mb != null && r.swap_usado_mb > 2048 ? `<small class="espera">usando ${gbDeMb(r.swap_usado_mb)} da reserva</small>` : ""}</div>`);
  }
  if (d && d.livre_gb != null) out.push(`<div class="mq-lin"><span>Disco</span><b class="${corDisco(d.livre_gb)}">${Math.round(d.livre_gb)} GB livres${
    d.total_gb ? ` de ${Math.round(d.total_gb)} GB` : ""}</b></div>`);
  if (c && c.carga != null) out.push(`<div class="mq-lin"><span>Carga</span><b class="${corCarga(c.carga, c.nucleos)}">${virgula(c.carga, 2)}${
    c.nucleos ? ` · ${c.nucleos} ${c.nucleos === 1 ? "núcleo" : "núcleos"}` : ""}</b></div>`);
  return out.length ? `<div class="mq-sec"><h4>🩺 Saúde</h4>${out.join("")}</div>` : "";
}
function secFila(b) {
  const f = b.fila;
  if (!f) return "";
  const linha = linhaFila(f);
  return `<div class="mq-sec"><h4>📥 Fila ${f.pausada ? `<span class="mq-pill espera">pausada</span>` : ""}</h4>
    ${linha ? `<div class="mq-fila">${esc(linha)}</div>` : ""}
    ${f.esperando_por.length ? `<div class="mq-apagado">esperando: ${esc(f.esperando_por.join(" · "))}</div>` : ""}</div>`;
}
function secTarefas(m, b, agora, ctx) {
  const ts = b.tarefas || [];
  if (!ts.length) return `<div class="mq-sec"><h4>🧾 Tarefas</h4><p class="mq-vazio">Nenhuma tarefa nas últimas leituras.</p></div>`;
  const vistas = ctx.todas ? ts : ts.slice(0, 5);
  const linha = t => {
    const meta = [t.custo_usd != null ? usd(t.custo_usd) : "", tempoTarefa(t, agora), t.prioridade === "alta" ? "⬆ alta" : "",
      t.commits ? `${t.commits} ${t.commits === 1 ? "commit" : "commits"}` : ""].filter(Boolean).join(" · ");
    const motivo = ["falhou", "caiu", "precisa", "parada"].includes(t.estado) && t.motivo ? t.motivo : "";
    return `<div class="mq-tarefa"><div class="mq-t"><div class="mq-t1"><b>${esc(t.titulo || t.id || "Tarefa")}</b>${pilula(t.estado)}</div>
        ${meta ? `<small>${esc(meta)}</small>` : ""}${motivo ? `<small class="mq-motivo">${esc(motivo)}</small>` : ""}</div>
      ${t.id ? `<button class="mq-logbt" data-mq="tarefa-log" data-mq-pc="${esc(m.pc)}" data-mq-id="${esc(t.id)}" aria-label="Ver o log de ${esc(t.titulo || t.id)}" ${ctx.logOk ? "" : "disabled"}>log</button>` : ""}</div>`;
  };
  const resto = ts.length - vistas.length;
  return `<div class="mq-sec"><h4>🧾 Tarefas <span class="mq-conta-t">${ts.length}</span></h4>${vistas.map(linha).join("")}
    ${resto > 0 ? `<button class="mq-mais" data-mq="ver-todas" data-mq-pc="${esc(m.pc)}">ver todas (${ts.length})</button>`
      : ctx.todas && ts.length > 5 ? `<button class="mq-mais" data-mq="ver-todas" data-mq-pc="${esc(m.pc)}">mostrar menos</button>` : ""}</div>`;
}
function secAvisos(b, agora, ctx) {
  const itens = ((b.saude && b.saude.itens) || []).filter(i => i.nivel !== "ok");
  const vistos = new Set(itens.map(i => i.texto));
  // Os avisos recentes vêm do mais novo ao mais velho. Cético de 13/11: o aviso que uma linha mais nova resolveu aparecia
  // como se fosse atual ("o hokage não dá sinal" logo acima de "última batida há 5 min"). O kit não leva a chave de cada
  // aviso novo, só a dos resolvidos; e o que ainda está aberto está na saúde (acima). Então: a resolução aparece (✓), e
  // os novos de antes dela saem (os que seguem abertos continuam na saúde, com o texto de agora).
  const recentes = [];
  let resolveu = false;
  for (const a of (b.avisos && b.avisos.recentes) || []) {
    for (const r of a.resolvidos || []) recentes.push({quando: a.quando, texto: "resolvido: " + (r.includes(":") ? r.slice(r.indexOf(":") + 1) : r), ok: true});
    if (!resolveu) for (const t of a.novos) if (!vistos.has(t)) { vistos.add(t); recentes.push({quando: a.quando, texto: t}); }
    if ((a.resolvidos || []).length) resolveu = true;
  }
  const co = b.coordenador;
  let coord = "";
  if (co && (co.batida || co.min != null)) {
    const t = msDe(co.batida), min = t ? Math.max(0, Math.floor((agora - t) / 60000)) : co.min;
    coord = `<li class="${min > 45 ? "espera" : "apagado"}"><span aria-hidden="true">🎼</span><span>${esc(ctx.coordenador || "coordenador")}: última batida há ${
      min < 60 ? `${min} min` : duracao(min * 60)}</span></li>`;
  }
  const novos = b.avisos && b.avisos.novos;
  if (!itens.length && !recentes.length && !coord && !novos) return `<div class="mq-sec"><h4>🔔 Avisos</h4><p class="mq-vazio">Nenhum aviso.</p></div>`;
  return `<div class="mq-sec"><h4>🔔 Avisos ${novos ? `<span class="mq-pill espera">${novos} ${novos === 1 ? "aviso novo" : "avisos novos"}</span>` : ""}</h4><ul class="mq-avisos">
    ${itens.map(i => `<li class="${i.nivel === "problema" ? "erro" : "espera"}"><span aria-hidden="true">${i.nivel === "problema" ? "⛔" : "⚠"}</span><span>${esc(i.texto)}</span></li>`).join("")}
    ${recentes.map(r => `<li class="apagado"><span aria-hidden="true">${r.ok ? "✓" : "•"}</span><span>${msDe(r.quando) ? `<b>${esc(quando(msDe(r.quando), agora))}</b> ` : ""}${esc(r.texto)}</span></li>`).join("")}
    ${coord}</ul></div>`;
}

// ---- HTML: as folhas (na #folha da página, que a volta não refaz) ----
const titulo = (m, t) => `<div class="pega"></div><h4 class="en-titulo"><span aria-hidden="true">☁</span> ${esc(t)}</h4>`;
function htmlFolhaEnviar(m, rascunho = {}) {
  const r = obj(rascunho) ? rascunho : {};
  const t = typeof r.texto === "string" ? r.texto : "", n = letras(t.trim());
  const modelos = m.modelos.length ? m.modelos : ["sonnet"];
  const modelo = modelos.includes(r.modelo) ? r.modelo : modelos.includes("sonnet") ? "sonnet" : modelos[0];
  const orc = num(r.orcamento) != null && r.orcamento >= m.orcamento.min && r.orcamento <= m.orcamento.max ? r.orcamento : m.orcamento.padrao;
  return `${titulo(m, `Mandar tarefa à ${m.rotulo}`)}
    <label class="mq-rot" for="mqTexto">A tarefa</label>
    <textarea id="mqTexto" class="pv-rasc mq-texto" rows="7" placeholder="# Título da tarefa&#10;repo: dono/nome&#10;&#10;O que fazer, e como saber que ficou pronto.">${esc(t)}</textarea>
    <div class="mq-contador ${n > TEXTO_MAX ? "erro" : ""}" id="mqConta" aria-live="polite">${n}/${TEXTO_MAX}</div>
    <p class="en-dica">A 1ª linha '# Título' vira o título; 'repo: dono/nome' faz a tarefa trabalhar num repositório.</p>
    <div class="mq-campos">
      <label class="mq-campo"><span>Modelo</span><select id="mqModelo" class="campo">${modelos.map(x => `<option value="${esc(x)}" ${x === modelo ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
      <label class="mq-campo"><span>Orçamento US$</span><input id="mqOrc" class="campo" type="number" inputmode="decimal" min="${m.orcamento.min}" max="${m.orcamento.max}" step="0.1" value="${orc}"></label>
    </div>
    <label class="en-esperar mq-alta"><input type="checkbox" id="mqAlta" ${r.alta === true ? "checked" : ""}><span>Prioridade alta <small>passa na frente da fila</small></span></label>
    <p class="mq-nota">A ${esc(m.rotulo)} não publica nada: sem push, PR nem mensagem. Quem sobe é o hokage.</p>
    <div class="mq-status" id="mqStatus" aria-live="polite"></div>
    <div class="dupla"><button class="btn sec" data-nf-fechar>Cancelar</button><button class="btn" id="mqMandar" data-mq="mandar" data-mq-pc="${esc(m.pc)}" ${n && n <= TEXTO_MAX ? "" : "disabled"}>Mandar</button></div>`;
}
// A espera e o fim de um pedido (enviar, pausar), na mesma folha. lp: o lerPedido; extra: o fim de cada modo
function htmlAndamento(m, modo, lp) {
  const t = {enviar: `Mandar tarefa à ${m.rotulo}`, pausar: `Pausar a fila da ${m.rotulo}`, retomar: `Retomar a fila da ${m.rotulo}`,
             log: `Log da ${m.rotulo}`}[modo] || m.rotulo;
  return `${titulo(m, t)}${statusDe(lp, modo)}${botoesDoFim(lp, modo)}`;
}
function statusDe(lp, modo) {
  if (!lp) return "";
  if (lp.fase === "espera" || lp.fase === "anda") return `<div class="status" role="status"><span class="spin"></span>${esc(lp.msg)}</div>`;
  if (lp.fase === "ok") {
    const r = lp.resposta || {};
    const paradas = modo === "pausar" && r.paradas && r.paradas.length ? `<ul class="mq-paradas">${r.paradas.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
    return `<div class="status ok" role="status">✓ ${esc(lp.msg)}</div>${paradas}`;
  }
  return `<div class="status err" role="alert">${esc(lp.msg)}</div>`;
}
function botoesDoFim(lp, modo) {
  if (!lp) return "";
  if (lp.fase === "espera" && lp.cancelar) return `<div class="dupla"><button class="btn sec" data-nf-fechar>Fechar</button><button class="btn perigo" data-mq="cancelar-pedido">Cancelar pedido</button></div>`;
  if (lp.fase === "erro" && !lp.semResposta) return `<div class="dupla"><button class="btn sec" data-nf-fechar>Fechar</button><button class="btn" data-mq="de-novo">Tentar de novo</button></div>`;
  return `<button class="op en-nao" data-nf-fechar>Fechar</button>`;
}
// estado: {m, fase: "escolher"|"pedindo"|"ok"|"erro", id, lp (o lerPedido, no pedindo), resposta, msg, semResposta}
function htmlFolhaLog(estado = {}) {
  const m = estado.m;
  if (!m) return "";
  if (estado.fase === "escolher") {
    const ts = ((m.batida && m.batida.tarefas) || []).filter(t => t.id), marca = tarefaDoLog(m);
    if (!ts.length) return `${titulo(m, `Ver log · ${m.rotulo}`)}<p class="mq-vazio">Nenhuma tarefa com log nas últimas leituras.</p><button class="op en-nao" data-nf-fechar>Fechar</button>`;
    return `${titulo(m, `Ver log · ${m.rotulo}`)}<p class="en-dica">Escolha a tarefa.</p>
      ${ts.map(t => `<button class="op mq-op ${marca && t.id === marca.id ? "on" : ""}" data-mq="escolher" data-mq-id="${esc(t.id)}"><span class="mq-op-t">${esc(t.titulo || t.id)}</span>${pilula(t.estado)}</button>`).join("")}
      <button class="op en-nao" data-nf-fechar>Cancelar</button>`;
  }
  const t = tarefaDe(m, estado.id), nome = (t && t.titulo) || estado.id || "";
  const cab = `${titulo(m, `Log · ${m.rotulo}`)}<div class="mq-log-cab"><b>${esc(nome)}</b>${t || (estado.resposta && estado.resposta.estado)
    ? pilula((estado.resposta && estado.resposta.estado) || t.estado) : ""}</div>`;
  if (estado.fase === "pedindo") {
    // "pedindo o log à VPS…" e, embaixo, onde o pedido está (o C.5)
    const lp = estado.lp && (estado.lp.fase === "espera" || estado.lp.fase === "anda") ? estado.lp : null;
    return `${cab}<div class="status" role="status"><span class="spin"></span>pedindo o log à ${esc(m.rotulo)}…${lp
      ? `<small class="mq-onde">${esc(lp.msg)}</small>` : ""}</div>${lp && lp.cancelar ? botoesDoFim(lp, "log") : `<button class="op en-nao" data-nf-fechar>Fechar</button>`}`;
  }
  if (estado.fase === "erro") return `${cab}<div class="status err" role="alert">${esc(estado.msg || "Não veio o log.")}</div>${
    estado.semResposta ? `<button class="op en-nao" data-nf-fechar>Fechar</button>`
      : `<div class="dupla"><button class="btn sec" data-nf-fechar>Fechar</button><button class="btn" data-mq="de-novo" data-mq-id="${esc(estado.id || "")}">Tentar de novo</button></div>`}`;
  const r = estado.resposta || {};
  const linhas = r.linhas || [];
  const corpo = r.encolhido ? `<p class="mq-vazio">${esc(r.msg || "Log já visto: peça de novo para ver")}</p>`
    : linhas.length ? `<pre class="mq-log" tabindex="0">${esc(linhas.join("\n"))}</pre>` : `<p class="mq-vazio">O log ainda está vazio.</p>`;
  return `${cab}${corpo}${r.cortado ? `<p class="en-dica">mostrando as últimas ${linhas.length} linhas</p>` : ""}
    <div class="dupla"><button class="btn sec" data-nf-fechar>Fechar</button><button class="btn" data-mq="de-novo" data-mq-id="${esc(estado.id || "")}">De novo</button></div>`;
}
function htmlFolhaPausar(m, agora = false) {
  const rodando = (m.batida && m.batida.fila && m.batida.fila.rodando) || 0;
  return `${titulo(m, `Pausar a fila da ${m.rotulo}?`)}
    <p class="mq-pergunta">Nada novo começa até você retomar.</p>
    <label class="en-esperar mq-agora"><input type="checkbox" id="mqAgora" ${agora ? "checked" : ""}><span>Parar também as que estão rodando (${rodando}): elas ficam 'parada' e dá para continuar depois</span></label>
    <div class="mq-status" id="mqStatus" aria-live="polite"></div>
    <div class="dupla"><button class="btn sec" data-nf-fechar>Cancelar</button><button class="btn ${agora ? "perigo" : ""}" id="mqPausar" data-mq="mandar" data-mq-pc="${esc(m.pc)}">Pausar</button></div>`;
}

// ---- o pedido (o `texto` de cel_pedir, igual ao do Monitor) ----
// campos: enviar {texto, modelo, orcamento, alta}; log {id, linhas}; pausar {agora}; retomar {}
function pedido(modo, campos = {}, m = null) {
  const c = obj(campos) ? campos : {};
  const acoes = m && m.acoes && m.acoes.length ? m.acoes : MODOS;
  if (!MODOS.includes(modo) || !acoes.includes(modo)) return {ok: false, msg: `Esta máquina só aceita: ${juntarE(acoes.map(x => MODO_ACEITA[x]))}.`};
  const rotulo = (m && m.rotulo) || "Máquina", tit = `${rotulo} · ${MODO_TITULO[modo]}`;
  let t;
  if (modo === "enviar") {
    const tarefa = typeof c.texto === "string" ? c.texto.trim() : "";
    if (!tarefa || letras(tarefa) > TEXTO_MAX) return {ok: false, msg: `Escreva a tarefa (até ${TEXTO_MAX} letras).`};
    const modelos = m && m.modelos && m.modelos.length ? m.modelos : ["haiku", "sonnet", "opus"];
    if (typeof c.modelo !== "string" || !MODELO_RE.test(c.modelo) || !modelos.includes(c.modelo))
      return {ok: false, msg: `Modelo fora da lista: use ${juntarOu(modelos)}.`};
    const o = (m && m.orcamento) || {min: 0.1, max: 20};
    const orc = num(c.orcamento) != null ? Math.round(c.orcamento * 100) / 100 : null;
    if (orc == null || orc < o.min || orc > o.max) return {ok: false, msg: `Orçamento fora do limite: de US$ ${usdLimite(o.min)} a US$ ${usdLimite(o.max)}.`};
    if (c.alta != null && typeof c.alta !== "boolean") return {ok: false, msg: "Prioridade inválida."};
    t = `{"acao":"maquina","modo":"enviar","texto":${JSON.stringify(tarefa)},"modelo":${JSON.stringify(c.modelo)},"orcamento":${float(orc)},"alta":${c.alta === true}}`;
  } else if (modo === "log") {
    if (typeof c.id !== "string" || !ID_RE.test(c.id)) return {ok: false, msg: "Tarefa inválida para o log."};
    const n = c.linhas == null ? LINHAS_PADRAO : num(c.linhas) != null ? Math.min(LINHAS_MAX, Math.max(1, Math.round(c.linhas))) : null;
    if (n == null) return {ok: false, msg: "Tarefa inválida para o log."};
    t = `{"acao":"maquina","modo":"log","id":${JSON.stringify(c.id)},"linhas":${n}}`;
  } else if (modo === "pausar") {
    if (c.agora != null && typeof c.agora !== "boolean") return {ok: false, msg: "Pedido inválido."};
    t = `{"acao":"maquina","modo":"pausar","agora":${c.agora === true}}`;
  } else t = `{"acao":"maquina","modo":"retomar"}`;
  if (letras(t) > PEDIDO_MAX) return {ok: false, msg: "A tarefa ficou grande demais para mandar: encurte o texto."};   // o banco conta letras
  return {ok: true, titulo: tit, texto: t, modo};
}

// ---- a resposta (o C.5: o que a folha mostra enquanto espera e no fim) ----
function respostaDe(s) {
  let r;
  try { r = JSON.parse(s || ""); } catch { r = null; }
  if (!obj(r)) return {msg: texto(String(s || ""), 200)};
  const out = {modo: MODOS.includes(r.modo) ? r.modo : "", msg: texto(r.msg, 200)};
  if (typeof r.id === "string" && ID_RE.test(r.id)) out.id = r.id;
  if (typeof r.estado === "string") out.estado = texto(r.estado, 20);
  if (Array.isArray(r.linhas)) out.linhas = r.linhas.slice(-LINHAS_MAX).map(x => texto(String(x ?? ""), 300));
  if (typeof r.cortado === "boolean") out.cortado = r.cortado;
  if (r.encolhido === true) out.encolhido = true;
  if (Array.isArray(r.paradas)) out.paradas = r.paradas.filter(x => typeof x === "string" && ID_RE.test(x)).slice(0, 10);
  return out;
}
// p: o pedido (da lista de pedidos da página); ctx: {agora, desde (quando a folha começou a esperar), m}
// → {fase: espera|anda|ok|erro, msg, resposta?, cancelar?, semResposta?}
function lerPedido(p, ctx = {}) {
  const agora = ctx.agora || Date.now(), m = ctx.m || {}, por = m.por || "PC", rotulo = m.rotulo || "máquina";
  const fim = p && ["entregue", "erro", "cancelado"].includes(p.estado);
  if (!fim && ctx.desde && agora - ctx.desde > ESPERA_MS)
    return {fase: "erro", semResposta: true, msg: "sem resposta em 3 min; o pedido pode ainda sair. Veja o card daqui a pouco."};
  if (!p || p.estado === "novo" || !p.estado) {
    const criado = (p && msDe(p.criado_em)) || ctx.desde || agora;
    return agora - criado > PEGAR_MS
      ? {fase: "espera", cancelar: !!p, msg: `o ${por} ainda não pegou o pedido (ele está ligado?)`}
      : {fase: "espera", msg: `esperando o ${por} pegar…`};
  }
  if (p.estado === "escrevendo") return {fase: "anda", msg: `a ${rotulo} está fazendo…`};
  if (p.estado === "entregue") {
    const r = respostaDe(p.resposta);
    return {fase: "ok", msg: r.msg || "feito", resposta: r};
  }
  if (p.estado === "cancelado") return {fase: "erro", msg: "Pedido cancelado."};
  return {fase: "erro", msg: texto(String(p.erro || ""), 300) || "A máquina não conseguiu."};
}

// O clique de um botão data-mq (no cartão ou na folha): {acao, id, pc} ou null (o desligado não vale).
function acaoDe(el) {
  const b = el && typeof el.closest === "function" ? el.closest("[data-mq]") : null;
  if (!b || b.disabled) return null;
  const d = b.dataset || {}, acao = String(d.mq || "");
  if (!CLIQUES.includes(acao)) return null;
  const id = String(d.mqId || ""), pc = String(d.mqPc || "");
  return {acao, id: ID_RE.test(id) ? id : "", pc: NOME_RE.test(pc) ? pc : ""};
}

const chaveRascunho = nome => `maquina-rascunho:${nome}`;

const Maquinas = {FORMATO, SEM_NOTICIA_MS, PEGAR_MS, ESPERA_MS, TEXTO_MAX, LINHAS_PADRAO, LINHAS_MAX, MODOS, ID_RE, LINK_RE,
  ehMaquina, normalizar, situacao, htmlResumo, htmlCartao, htmlFolhaEnviar, htmlFolhaLog, htmlFolhaPausar, htmlAndamento,
  pedido, lerPedido, respostaDe, acaoDe, tarefaDoLog, tarefaDe, chaveRascunho, letras, quando, duracao, ramPct, corRam,
  corDisco, corCarga, esc};
if (typeof module !== "undefined" && module.exports) module.exports = Maquinas;
raiz.Maquinas = Maquinas;
})(typeof window !== "undefined" ? window : globalThis);
