// Seaninho no celular: o card comum do Monitor (o geral_cards.js do Pro), para todas as telas (13/11, entrega 1 do
// PLANO-MONITOR-NO-CELULAR: "quero todas as funções do monitor aqui"). Um card tem, de cima para baixo:
//   ▌ a faixa da cor do estado (à esquerda) · o ícone · o título curto · o chip do PC · a bolinha com "há X"
//   ▌ a linha de baixo do título (quem, projeto, o selo do estado)
//   ▌ a miniatura (a prova) ao lado do texto e da barra de progresso
//   ▌ os botões ícone + palavra ([👁 Abrir] [✓ Aprovar] [✎ Ajuste] [🖥 No PC] [⋯ extra])
//   ▌ o 👍 / 👎
//   ▌ o "💬 comentar…" (que abre a caixa de quem usa)
//   ▌ a linha da ação: 🕓 enviado · ✓ chegou · ✓✓ visto (como os balões do chat), com a frase do PC
// Sem tela (testado no Node: test_cards.cjs): aqui só se monta o HTML. Quem usa (o entregas.js, o Para você do
// index.html, a aba Revisões) diz o que vai em cada parte e põe os próprios data-* nos botões: o toque continua com
// cada tela, e a casca velha (sem este arquivo) não quebra quem não usa.
(function (raiz) {
"use strict";

// As cores da faixa, da bolinha e do botão principal. Quem usa escolhe pelo nome (o estado de cada tela vira uma cor).
const CORES = {ouro: "var(--gold,#E2B84A)", verde: "var(--green,#48D680)", laranja: "#E8805C", azul: "#6FA8FF",
  vermelho: "var(--coral,#FF5A4F)", roxo: "#A78BFA", cinza: "var(--stroke-2,rgba(255,255,255,.18))"};
// A linha da ação (o andamento de um pedido ao PC), como o chat: 🕓 o celular mandou (ainda no caminho ou na fila do
// banco), ✓ chegou ao PC (ele fez), ✓✓ visto (o PC mostra o efeito: a lista dele já mudou, o maestro anotou). "fila":
// ainda no celular (sem rede ou o cel_pedir no meio); "erro": não deu (a frase diz por quê); "esperando": o PC vai
// tentar de novo.
const FASES = ["fila", "enviado", "chegou", "visto", "erro", "esperando"];
const PASSOS = [{fase: "enviado", sinal: "🕓", rotulo: "enviado"}, {fase: "chegou", sinal: "✓", rotulo: "chegou"},
  {fase: "visto", sinal: "✓✓", rotulo: "visto"}];
const ALCANCE = {fila: 1, enviado: 1, esperando: 1, chegou: 2, visto: 3, erro: 0};
const ARIA_PASSO = {fila: "ainda no celular", enviado: "enviado, esperando o PC", esperando: "o PC vai tentar de novo",
  chegou: "chegou ao PC", visto: "chegou e foi visto"};
const TITULO_MAX = 120;      // o título curto (duas linhas no card; o inteiro fica no aria-label e no title)
const BOTOES_MAX = 8;        // o card nunca vira uma parede de botões
const ONLINE_MS = 150000;    // o mesmo online() da página

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const umaLinha = (t, n) => { const s = String(t ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; };
const doisDig = n => String(n).padStart(2, "0");
// WIN-EAD6OD66GE7 vira WIN; SEAZONE192 fica (o nomeCurtoPc da página)
const nomeCurto = pc => String(pc || "").length > 11 && String(pc).includes("-") ? String(pc).split("-")[0] : String(pc || "");
// O horário em ms: o ISO do contrato ("2026-11-11T18:40:00-03:00") ou segundos/ms da época.
function ms(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v < 1e12 ? v * 1000 : v;
  const t = Date.parse(String(v || ""));
  return Number.isFinite(t) ? t : 0;
}
const corDe = c => (Object.prototype.hasOwnProperty.call(CORES, c) ? c : "cinza");

// ---- o tempo ------------------------------------------------------------------------------------------------------
function inicioDoDia(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
function horaDe(t) { const d = new Date(t); return `${doisDig(d.getHours())}:${doisDig(d.getMinutes())}`; }
function diaDe(t) { const d = new Date(t); return `${doisDig(d.getDate())}/${doisDig(d.getMonth() + 1)}`; }
// "agora", "há 5 min", "há 2 h", "ontem 14:32", "09/11 14:32" (o haTexto do Monitor)
function haTexto(t, agora) {
  t = ms(t);
  if (!t) return "";
  const a = ms(agora) || Date.now(), s = Math.max(0, (a - t) / 1000);
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (t >= inicioDoDia(a)) return `há ${Math.floor(s / 3600)} h`;
  if (t >= inicioDoDia(inicioDoDia(a) - 1)) return `ontem ${horaDe(t)}`;
  return `${diaDe(t)} ${horaDe(t)}`;
}

// ---- os atributos -------------------------------------------------------------------------------------------------
// {nome: valor} → ' nome="valor"' (escapado). true: o atributo sozinho; false, null e undefined: fora. Nome que não é
// de atributo (com espaço, aspas, "on…", o style) não entra: só os data-*, aria-* e uns poucos de sempre.
const RX_ATTR = /^(data-[a-z0-9-]+|aria-[a-z]+|role|title|id|tabindex|lang|dir|hidden|inert)$/;
function attrs(o) {
  let out = "";
  for (const [k, v] of Object.entries(o || {})) {
    if (!RX_ATTR.test(k) || v === false || v === null || v === undefined) continue;
    out += v === true ? ` ${k}` : ` ${k}="${esc(v)}"`;
  }
  return out;
}
// As classes que quem usa acrescenta: só letras, números, "-" e "_" (nada de aspas no class).
const classes = c => String(c || "").split(/\s+/).filter(x => /^[A-Za-z_][A-Za-z0-9_-]*$/.test(x)).join(" ");

// ---- as peças -----------------------------------------------------------------------------------------------------
// Um botão ícone + palavra: {icone, rotulo, attrs, cor ("ouro": o principal), classe, desligado, dica (o title), aria}.
// O texto é uma frase só ("✓ Aprovar"): o leitor de tela lê o mesmo que se vê, e o innerText é o rótulo inteiro.
function botao(b) {
  if (!b || !String(b.rotulo || b.icone || "").trim()) return "";
  const cls = ["card-b", b.cor === "ouro" ? "ouro" : b.cor === "perigo" ? "perigo" : "", classes(b.classe)].filter(Boolean).join(" ");
  const texto = [b.icone, b.rotulo].map(x => String(x ?? "").trim()).filter(Boolean).join(" ");
  return `<button type="button" class="${cls}"${attrs({...(b.attrs || {}), title: b.dica || undefined, "aria-label": b.aria || undefined})}`
    + `${b.desligado ? " disabled" : ""}>${esc(texto)}</button>`;
}
function botoes(lista, extra) {
  const html = (lista || []).filter(Boolean).slice(0, BOTOES_MAX).map(botao).join("");
  return html ? `<div class="card-acoes${extra ? " " + classes(extra) : ""}">${html}</div>` : "";
}
// O 👍 / 👎: {sim: attrs, nao: attrs, atual: "sim" | "nao" | "", rotulo (o que se vota, para o leitor de tela), desligado}.
function voto(v) {
  if (!v) return "";
  const r = String(v.rotulo || "este card");
  const um = (lado, sinal, dica) => `<button type="button" class="card-v ${lado}${v.atual === lado ? " on" : ""}"`
    + `${attrs({...(v[lado] || {}), "aria-pressed": String(v.atual === lado), "aria-label": `${dica}: ${r}`})}${v.desligado ? " disabled" : ""}>${sinal}</button>`;
  return `<div class="card-voto" role="group" aria-label="${esc(`Gostei ou não de ${r}`)}">${um("sim", "👍", "Gostei")}${um("nao", "👎", "Não gostei")}</div>`;
}
// O "💬 comentar…": fechado, um botão do tamanho do dedo (attrs: o data-* que abre a caixa de quem usa; valor: o
// rascunho já escrito, que aparece no lugar do "comentar…"); aberto, o HTML da caixa de quem usa (c.html, já pronto).
function comentar(c) {
  if (!c) return "";
  if (c.aberto) return String(c.html || "");
  const rasc = umaLinha(c.valor, 80);
  return `<button type="button" class="card-com${rasc ? " tem" : ""}"${attrs({...(c.attrs || {}), "aria-label": c.aria || undefined})}>`
    + `<span class="card-com-i" aria-hidden="true">💬</span><span class="card-com-t">${esc(rasc || c.rotulo || "comentar…")}</span></button>`;
}
// A barra de progresso: {pct (0 a 100), texto ("80%" ou "3 de 5"), cor}. Sem número, nada.
function progresso(p) {
  if (!p || p.pct === null || p.pct === undefined || p.pct === "") return "";
  const n = Number(p.pct);
  if (!Number.isFinite(n)) return "";
  const pct = Math.max(0, Math.min(100, Math.round(n))), texto = p.texto === undefined ? `${pct}%` : String(p.texto);
  return `<div class="card-prog cor-${corDe(p.cor || "ouro")}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"`
    + ` aria-label="${esc(p.aria || texto)}"><span class="card-prog-b"><i style="width:${pct}%"></i></span><span class="card-prog-t">${esc(texto)}</span></div>`;
}
// A miniatura: o HTML de quem usa (texto: a prova das Entregas, com as classes e o data-* dela) ou
// {src (a imagem que a página já tem), foto (a id hex que a página baixa: vira data-foto-mini), alt, attrs (o toque),
// vazio (a frase sem imagem), icone (o da caixa vazia)}. O src só de imagem segura (data:, blob:, https:).
const RX_SRC = /^(data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+|blob:[^\s"'<>]+|https:\/\/[^\s"'<>]+)$/;
const RX_FOTO = /^[0-9a-f]{16,40}$/;
function mini(m) {
  if (!m) return "";
  if (typeof m === "string") return m;
  const src = RX_SRC.test(String(m.src || "")) ? String(m.src) : "";
  const dentro = src ? `<img src="${esc(src)}" alt="${esc(m.alt || "")}" loading="lazy" decoding="async">`
    : RX_FOTO.test(String(m.foto || "")) ? `<span class="card-mini-ph" data-foto-mini="${esc(m.foto)}"><i class="card-roda" aria-hidden="true"></i></span>`
    : `<span class="card-mini-v">${esc(m.icone || "")}${m.icone && m.vazio ? "<br>" : ""}${esc(m.vazio || "")}</span>`;
  const toca = (src || RX_FOTO.test(String(m.foto || ""))) && m.attrs;
  return toca ? `<button type="button" class="card-mini"${attrs(m.attrs)}>${dentro}</button>`
    : `<div class="card-mini${src ? "" : " vazio"}" aria-hidden="${src ? "false" : "true"}">${dentro}</div>`;
}
// A linha da ação: {fase (FASES), texto (a frase do PC ou da página, com o sinal dela: "✓ Aprovada", "⚠ Não deu: …"),
// html (no lugar do texto: a frase já pronta e escapada por quem usa, com link ou a rodinha dela, como as do Slack no
// Para você), passos (false: só a frase), roda (a rodinha enquanto vai), classe}. Os três passos aparecem sempre (os
// alcançados acesos), como o "🕓 enviado · ✓ chegou · ✓✓ visto" do Monitor; no erro, só a frase, em vermelho.
function linha(l) {
  if (!l || !FASES.includes(l.fase)) return "";
  const n = ALCANCE[l.fase], comPassos = l.passos !== false && l.fase !== "erro";
  const passos = comPassos ? `<span class="cl-passos" role="img" aria-label="${esc(ARIA_PASSO[l.fase] || "")}">${PASSOS.map((p, i) =>
    `<span class="cl-p${i < n ? " on" : ""}${i === 0 && l.fase === "fila" ? " pend" : ""}">${p.sinal} ${p.rotulo}</span>`).join('<span class="cl-sep" aria-hidden="true">·</span>')}</span>` : "";
  const roda = l.roda ? `<i class="card-roda" aria-hidden="true"></i>` : "";
  const frase = l.html !== undefined && l.html !== null ? String(l.html) : esc(umaLinha(String(l.texto || "").trim(), 200));
  return `<div class="card-linha f-${l.fase}${l.classe ? " " + classes(l.classe) : ""}" role="status">${passos}`
    + `${frase || roda ? `<span class="cl-txt">${roda}${frase}</span>` : ""}</div>`;
}
// A fase de um pedido ao PC (a linha do cel_pedir: novo, entregue, erro, cancelado) e o que a página sabe dele:
// {semId: o cel_pedir ainda não voltou, visto: o efeito já aparece na lista do PC, esperando: "Esperando: …"}.
function faseDoPedido(p, o) {
  const x = o || {};
  if (x.erro || (p && ["erro", "cancelado"].includes(p.estado))) return "erro";
  if (!p || x.semId) return "fila";
  if (p.estado === "entregue") return x.visto ? "visto" : "chegou";
  if (String(p.erro || "").startsWith("Esperando:")) return "esperando";
  return "enviado";
}
// O chip do PC e a bolinha com o "há X". ligado: true (bolinha verde), false (cinza, "desligado" no title) ou
// undefined (a bolinha na cor do card).
const chipCurto = pc => { const n = nomeCurto(pc), m = /^([A-Za-z])[A-Za-z]{4,}(\d{2,})$/.exec(n); return m ? (m[1] + m[2]).toUpperCase() : n; };
function chipPc(pc) {
  const n = chipCurto(pc);
  return n ? `<span class="card-pc" title="${esc(pc)}">${esc(n)}</span>` : "";
}
function ha(quando, agora, ligado, cor) {
  const t = ms(quando), txt = haTexto(t, agora);
  if (!txt) return "";
  const bola = ligado === true ? "on" : ligado === false ? "off" : `c-${corDe(cor)}`;
  const dica = [t ? `${diaDe(t)} ${horaDe(t)}` : "", ligado === false ? "PC desligado" : ""].filter(Boolean).join(" · ");
  return `<span class="card-ha"${dica ? ` title="${esc(dica)}"` : ""}><i class="card-bola b-${bola}" aria-hidden="true"></i>${esc(txt)}</span>`;
}

// ---- o card -------------------------------------------------------------------------------------------------------
// c: {cor, icone, titulo, tituloInteiro (o aria-label; padrão: o título), pc, quando, agora, ligado, sub (HTML: a linha
// de baixo do título, com o selo e o "quem"), mini, progresso, corpo (HTML de quem usa: o resumo, a caixa do comando),
// botoes, voto, comentar, linha, rodape (HTML), classe (as classes de quem usa: "ent-card st-nova"), attrs (os data-*
// do card), tag ("article"; "div" dentro de uma lista), tituloTag ("h3")}.
// Os campos de texto (titulo, pc) são escapados aqui; sub, corpo, rodape e a mini em texto vêm prontos de quem usa
// (e escapados por ele).
function card(c) {
  const o = c || {}, cor = corDe(o.cor), tag = o.tag === "div" ? "div" : o.tag === "section" ? "section" : "article";
  const tt = ["h3", "h4", "div"].includes(o.tituloTag) ? o.tituloTag : "h3";
  const inteiro = String(o.tituloInteiro ?? o.titulo ?? ""), curto = umaLinha(o.titulo, TITULO_MAX);
  const lado = `${chipPc(o.pc)}${ha(o.quando, o.agora ?? Date.now(), o.ligado, cor)}`;
  const cab = `<div class="card-cab">${o.icone ? `<span class="card-ic" aria-hidden="true">${esc(o.icone)}</span>` : ""}`
    + `<${tt} class="card-tit"${inteiro.length > curto.length ? ` title="${esc(umaLinha(inteiro, 400))}"` : ""}>${esc(curto)}</${tt}>`
    + `${lado ? `<span class="card-lado">${lado}</span>` : ""}</div>`;
  const m = mini(o.mini), info = `${o.sub ? `<div class="card-sub">${o.sub}</div>` : ""}${progresso(o.progresso)}${o.corpo || ""}`;
  const meio = m ? `<div class="card-meio">${m}<div class="card-info">${info}</div></div>` : info ? `<div class="card-info">${info}</div>` : "";
  const cls = ["card-comum", `cor-${cor}`, classes(o.classe)].filter(Boolean).join(" ");
  return `<${tag} class="${cls}"${attrs({...(o.attrs || {}), "aria-label": umaLinha(inteiro, 300) || undefined})}>${cab}${meio}`
    + `${botoes(o.botoes)}${voto(o.voto)}${comentar(o.comentar)}${linha(o.linha)}${o.rodape || ""}</${tag}>`;
}

// O que um toque pede no card comum, pelo elemento tocado: {acao: "voto", lado, alvo} para o 👍/👎 (quem usa põe os
// próprios data-* e trata o resto). null fora dele.
function votoDe(el) {
  const b = el && el.closest ? el.closest(".card-v") : null;
  if (!b || b.disabled) return null;
  return {acao: "voto", lado: b.classList.contains("sim") ? "sim" : "nao", ligado: b.getAttribute("aria-pressed") !== "true"};
}
const online = (p, agora) => !!p && (ms(agora) || Date.now()) - ms(p.visto_em) < ONLINE_MS;

// ==== O CSS (com as variáveis do index.html: --glass, --glass-2, --stroke, --gold, --ink, --muted, --navy) ==========
const CSS = `
.card-comum{--card-cor:${CORES.cinza};position:relative;display:flex;flex-direction:column;gap:8px;min-width:0;margin:0 0 10px;padding:11px 12px 11px 14px;border-radius:16px;
  background:var(--glass);border:1px solid var(--stroke);border-left:4px solid var(--card-cor)}
${Object.keys(CORES).map(k => `.card-comum.cor-${k}{--card-cor:${CORES[k]}}`).join("\n")}
.card-cab{display:flex;align-items:flex-start;gap:8px;min-width:0}
.card-ic{flex:none;font-size:18px;line-height:22px}
.card-tit{flex:1;min-width:0;margin:0;font-size:15.5px;font-weight:650;line-height:22px;color:var(--ink);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere;
  text-transform:none;letter-spacing:normal}
/* dentro de um bloco do Início (o .bloco h3 é o título da seção, em maiúsculas): o título do card fica como é */
.bloco .card-comum .card-tit{display:-webkit-box;gap:0;margin:0;font-size:15.5px;font-weight:650;color:var(--ink);text-transform:none;letter-spacing:normal}
.card-lado{flex:none;display:flex;align-items:center;gap:6px;margin-left:auto;height:22px;font-size:12px;color:var(--muted);white-space:nowrap}
.card-pc{padding:1px 7px;border-radius:6px;background:var(--glass-2);border:1px solid var(--stroke);font-weight:700;letter-spacing:.2px;color:var(--ink)}
.card-ha{display:inline-flex;align-items:center;gap:5px}
.card-bola{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--card-cor)}
.card-bola.b-on{background:var(--green,#48D680);box-shadow:0 0 6px rgba(72,214,128,.6)}
.card-bola.b-off{background:var(--faint,#6B7A99)}
${Object.keys(CORES).map(k => `.card-bola.b-c-${k}{background:${CORES[k]}}`).join("\n")}
.card-sub{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-width:0;font-size:13px;color:var(--muted)}
.card-meio{display:flex;gap:12px;min-width:0}
.card-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
.card-mini{flex:none;width:104px;height:78px;padding:0;border-radius:11px;overflow:hidden;display:grid;place-items:center;background:rgba(0,0,0,.28);border:1px solid var(--stroke)}
button.card-mini{cursor:zoom-in}
.card-mini img{width:100%;height:100%;object-fit:cover;object-position:top center;display:block}
.card-mini.vazio{color:var(--muted);font-size:12px;text-align:center;padding:6px}
.card-mini-ph{display:grid;place-items:center;width:100%;height:100%}
.card-mini-v{font-size:12px;line-height:1.3}
.card-prog{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.card-prog-b{flex:1;height:8px;border-radius:999px;background:rgba(255,255,255,.1);overflow:hidden}
.card-prog-b i{display:block;height:100%;border-radius:inherit;background:var(--card-cor)}
${Object.keys(CORES).map(k => `.card-prog.cor-${k} .card-prog-b i{background:${CORES[k]}}`).join("\n")}
.card-acoes{display:flex;flex-wrap:wrap;gap:8px}
.card-b{flex:1 1 auto;min-height:44px;min-width:44px;padding:0 14px;border-radius:12px;background:var(--glass-2);border:1px solid var(--stroke);color:var(--ink);font-size:15px;font-weight:650;white-space:nowrap}
a.card-b{display:inline-flex;align-items:center;justify-content:center;text-decoration:none}
.card-b.ouro{background:var(--gold);border-color:var(--gold);color:var(--navy)}
.card-b.perigo{color:#FFA49C}
.card-b[disabled]{opacity:.45}
.card-b:active{filter:brightness(1.15)}
.card-voto{display:flex;gap:8px}
.card-v{flex:1;min-height:44px;min-width:44px;border-radius:12px;background:var(--glass-2);border:1px solid var(--stroke);font-size:20px;line-height:1}
.card-v.sim.on{background:rgba(72,214,128,.2);border-color:rgba(72,214,128,.7)}
.card-v.nao.on{background:rgba(255,138,130,.2);border-color:rgba(255,138,130,.7)}
.card-com{display:flex;align-items:center;gap:8px;width:100%;min-height:44px;padding:0 12px;border-radius:12px;background:rgba(0,0,0,.18);border:1px dashed var(--stroke-2,rgba(255,255,255,.18));color:var(--muted);font-size:14.5px;text-align:left}
.card-com.tem{color:var(--ink);border-style:solid}
.card-com-t{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card-linha{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;font-size:12.5px;color:var(--muted)}
.cl-passos{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.cl-p{opacity:.42}
.cl-p.on{opacity:1;color:var(--ink);font-weight:600}
.cl-p.pend{animation:card-pisca 1.4s ease-in-out infinite}
.cl-sep{opacity:.5}
.cl-txt{min-width:0;font-size:13.5px;overflow-wrap:anywhere}
.cl-txt .card-roda{margin-right:6px;vertical-align:-2px}
.card-linha.f-chegou .cl-txt,.card-linha.f-visto .cl-txt{color:#86E8AE}
.card-linha.f-visto .cl-p.on{color:#7FD3FF}
.card-linha.f-erro .cl-txt{color:#FFA49C}
.card-roda{display:inline-block;flex:none;width:14px;height:14px;border-radius:50%;border:2px solid rgba(255,255,255,.18);border-top-color:var(--gold);animation:card-gira .9s linear infinite}
@keyframes card-gira{to{transform:rotate(360deg)}}
@keyframes card-pisca{50%{opacity:.35}}
@media (prefers-reduced-motion:reduce){.card-roda,.cl-p.pend{animation:none}}
`;

const Cards = {CORES, FASES, PASSOS, TITULO_MAX, esc, umaLinha, nomeCurto, ms, haTexto, horaDe, diaDe, inicioDoDia, attrs,
  botao, botoes, voto, comentar, progresso, mini, linha, faseDoPedido, chipCurto, chipPc, ha, card, votoDe, online, CSS};
if (typeof module !== "undefined" && module.exports) module.exports = Cards;
else raiz.Cards = Cards;
})(typeof window !== "undefined" ? window : globalThis);
