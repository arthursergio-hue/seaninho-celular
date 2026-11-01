// Seaninho no celular: o ninja da faixa do uso de IA (0.8.10; 0.8.11: as 7 faixas e a regra do TeamZone). O ninja veste
// a faixa da semana e aparece num puff de fumaça toda vez que a seção entra na tela; quando a faixa sobe, a faixa nova
// amarra numa comemoração. Só SVG e CSS, sem biblioteca. O desenho e as contas rodam sem tela (testados no Node:
// test_ninja.cjs); vigiar a tela e tocar a animação, só no navegador.
(function (raiz) {
"use strict";

// As 7 faixas do Treinamento de IA Nível 3 (o Bill, 28/10: "da branca à preta"), nas cores do quadrinho da t.souza no
// #szni-investimentos (29/10), com a ponteira preta e a lista vermelha.
const FAIXAS = {
  branca:  {nome: "Branca",  cor: "#F4F4F2", sombra: "#C9CCD3", contorno: "#7D869B"},
  amarela: {nome: "Amarela", cor: "#F5C518", sombra: "#C99A06", contorno: "#6E5200"},
  verde:   {nome: "Verde",   cor: "#2E9D4F", sombra: "#1F7238", contorno: "#0C3A1B"},
  azul:    {nome: "Azul",    cor: "#1F5FBF", sombra: "#17468C", contorno: "#0A2350"},
  roxa:    {nome: "Roxa",    cor: "#6B2FA3", sombra: "#4E2278", contorno: "#26103F"},
  marrom:  {nome: "Marrom",  cor: "#6B4226", sombra: "#4D2F1B", contorno: "#24160B"},
  preta:   {nome: "Preta",   cor: "#17181C", sombra: "#000000", contorno: "#6A7184"},
};
const ORDEM_FAIXAS = ["branca", "amarela", "verde", "azul", "roxa", "marrom", "preta"];

const semAcento = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
// A faixa pelo nome ("Azul", "faixa azul"): {chave, nome, cor, ...} ou null (sem faixa).
function faixaDe(nome) {
  const k = semAcento(nome).replace(/^faixa\s+/, "");
  return FAIXAS[k] ? com(k) : null;
}
const com = chave => chave ? {chave, ...FAIXAS[chave]} : null;
const rotulo = nome => { const f = faixaDe(nome); return f ? `Faixa ${f.nome}` : "Ainda sem faixa"; };

// ---- a regra do TeamZone (seazone-tech/teamzone, src/lib/uso-ia/faixas.ts, lida em 31/10), linha a linha ----------
// Os mínimos de cada faixa saem do P100 da régua da semana: a Branca tem base própria (21 sessões, 200 mensagens,
// organização 61); a organização sobe em linha reta até o P100 e as outras métricas em progressão geométrica, em 6
// passos, até a Preta (= o P100). As métricas sem base não contam na Branca.
const FAIXAS_TIME = ["Branca", "Amarela", "Verde", "Azul", "Roxa", "Marrom", "Preta"];
const METRICAS_TIME = ["sessoes_iniciadas", "mensagens", "tarefas_operacionais", "tarefas_internas", "skills_novas",
  "linhas_sistema", "linhas_agente", "cron_jobs", "workflows", "organizacao"];
const WHITE = {sessoes_iniciadas: 21, mensagens: 200, organizacao: 61};

// regua = {versao, metricas, bandas, minimos: {métrica: {banda: n}}}; null se faltar o P100 de alguma métrica.
function faixasDaRegua(regua) {
  if (!regua || !String(regua.versao || "").trim() || !(regua.bandas || []).includes("P100")) return null;
  const result = Object.fromEntries(FAIXAS_TIME.map(f => [f, {}]));
  for (const m of METRICAS_TIME) {
    const black = ((regua.minimos || {})[m] || {}).P100;
    if (!(regua.metricas || []).includes(m) || !Number.isFinite(black) || black <= 0 || black < (WHITE[m] ?? 1)
      || (m === "organizacao" && black > 100)) return null;
    for (let i = 0; i < FAIXAS_TIME.length; i++) {
      const white = WHITE[m];
      if (i === 0 && white === undefined) continue;
      const raw = m === "organizacao" ? white + (black - white) * i / 6
        : white === undefined ? Math.pow(black, (i - 1) / 5) : white * Math.pow(black / white, i / 6);
      // como no TeamZone: estabiliza em 9 casas antes do teto (as âncoras exatas da progressão ficam exatas)
      result[FAIXAS_TIME[i]][m] = i === 6 ? black : Math.ceil(Number(raw.toFixed(9)));
    }
  }
  return result;
}

// O mínimo até agora: proporcional aos dias já fechados da semana (sexta 17h a sexta 17h), menos a organização.
const metaToDate = (minimo, metrica, dias) =>
  metrica === "organizacao" ? minimo : Math.ceil(minimo * Math.max(0, Math.min(7, dias)) / 7);

// Os dias fechados até a medida: fechaEm = a sexta em que a semana fecha ("2026-11-06"); geradoEm = a hora da medida.
function diasFechados(fechaEm, geradoEm) {
  if (!geradoEm || !Number.isFinite(Date.parse(geradoEm))) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(geradoEm)).map(part => [part.type, part.value]));
  const day = Date.parse(`${p.year}-${p.month}-${p.day}T12:00:00Z`);
  const saturday = Date.parse(`${fechaEm}T12:00:00Z`) - 6 * 86400000;
  return Math.max(0, Math.min(7, Math.round((day - saturday) / 86400000) + (Number(p.hour) >= 17 ? 1 : 0)));
}

// O teto pela banda do coletor: P0 fica sem faixa; P25 chega no máximo à Branca; da P50 à P100, só os mínimos decidem.
// Uma banda que a régua não conhece fica sem faixa. Devolve o índice mais alto permitido em FAIXAS_TIME (-1 = nenhum).
const tetoDaBanda = banda => banda === "P25" ? 0 : ["P50", "P75", "P100"].includes(banda) ? FAIXAS_TIME.length - 1 : -1;

// A faixa atual (a mais alta em que todas as métricas batem o mínimo até agora, limitada pela banda), a próxima, as
// metas até agora da próxima (ou as da Preta, no topo) e quantas já bateram.
function classificarFaixa(valores, faixas, dias, banda) {
  if (!faixas || dias === null || dias === undefined) return null;
  let pelosMinimos = null;
  for (const f of FAIXAS_TIME) {
    if (Object.entries(faixas[f]).some(([m, n]) => !Number.isFinite(valores[m]) || valores[m] < metaToDate(n, m, dias))) break;
    pelosMinimos = f;
  }
  const teto = tetoDaBanda(banda);
  const limitadaPelaBanda = pelosMinimos !== null && FAIXAS_TIME.indexOf(pelosMinimos) > teto;
  const atual = limitadaPelaBanda ? (teto < 0 ? null : FAIXAS_TIME[teto]) : pelosMinimos;
  const proxima = FAIXAS_TIME[atual === null ? 0 : FAIXAS_TIME.indexOf(atual) + 1] ?? null;
  const metas = Object.fromEntries(Object.entries(proxima ? faixas[proxima] : faixas.Preta)
    .map(([m, n]) => [m, metaToDate(n, m, dias)]));
  const atingidos = proxima ? Object.entries(metas).filter(([m, n]) => Number.isFinite(valores[m]) && valores[m] >= n).length : 0;
  return {atual, proxima, metas, atingidos, total: proxima ? Object.keys(metas).length : 0, limitadaPelaBanda, pelosMinimos};
}

// O farol de cada métrica, como no TeamZone: verde bateu; amarelo, ao menos 70% da meta; vermelho, abaixo.
function farol(valor, meta) {
  if (valor === undefined || valor === null || !Number.isFinite(valor)) return "neutro";
  if (meta === undefined || !Number.isFinite(meta)) return "neutro";
  return valor >= meta ? "ok" : valor >= meta * 0.7 ? "quase" : "longe";
}

// A comemoração: a faixa subiu desde a última vez que o ninja foi visto nesta semana (a semana nova começa sem faixa).
// Na primeira vez, só guarda.
function subiu(visto, semana, i) {
  if (!visto || !visto.semana || !semana) return false;
  if (visto.semana === semana) return i > (Number(visto.i) || 0);
  return semana > visto.semana && i > 0;
}
const guardar = (visto, semana, i) => ({semana, i: visto && visto.semana === semana ? Math.max(i, Number(visto.i) || 0) : i});

// ---- o desenho (viewBox 120 x 130) ------------------------------------------------------------------------------
const F = n => Math.round(n * 100) / 100;
const FUMACA = [[60, 98, 17], [41, 92, 13], [79, 92, 13], [47, 73, 12], [73, 73, 12], [60, 62, 14], [31, 104, 9], [89, 104, 9], [60, 116, 10]];
const ESTRELAS = [[14, 18, 1.3], [104, 13, 1.1], [109, 44, 0.9], [9, 55, 1], [24, 7, 0.8], [96, 70, 0.8]];

function faixaSvg(f) {
  if (!f) return `<path class="nj-sem" d="M38.4 88.5C52 92 68 92 81.6 88.5L82.4 95.5C68 99 52 99 37.6 95.5Z"/>`;
  const p = `fill="${f.cor}" stroke="${f.contorno}"`;
  return `<g class="nj-faixa">
    <path class="nj-cinta" ${p} d="M38.4 88.5C52 92 68 92 81.6 88.5L82.4 95.5C68 99 52 99 37.6 95.5Z"/>
    <path class="nj-trama" stroke="${f.sombra}" d="M39 92C52 95.5 68 95.5 81 92"/>
    <g class="nj-pontas">
      <path ${p} d="M57.5 98.5L50.5 112.5C52 114 54 114.6 55.6 114L61 99.5Z"/>
      <path ${p} d="M62.5 98.5L70 112C68.6 113.8 66.6 114.4 65 114L59.6 99.5Z"/>
      <path class="nj-ponteira" d="M66.25 105.25L68.65 109.57L64.03 111.39L62.3 106.75Z"/>
      <path class="nj-lista" d="M66.7 106.06L62.62 107.62M68.2 108.76L63.7 110.5"/>
    </g>
    <rect class="nj-no" ${p} x="55" y="91" width="10" height="8.5" rx="2.4"/>
    <path class="nj-trama" stroke="${f.sombra}" d="M57.2 95.2H62.8"/></g>`;
}

// O ninja em SVG: faixa = o nome dela ("Azul") ou null (sem faixa); dorme = sem a medida (olhos fechados e zzz).
function svg(faixa, {dorme = false} = {}) {
  const f = dorme ? null : faixaDe(faixa);
  const linha = `<path class="nj-linha" d="`;   // o contorno escuro por baixo da manga
  return `<svg class="nj${dorme ? " dorme" : ""}" viewBox="0 0 120 130" aria-hidden="true" focusable="false">
  <g class="nj-ceu"><circle class="nj-halo" cx="60" cy="52" r="47"/><circle class="nj-halo" cx="60" cy="52" r="42.5"/>
    <circle class="nj-astro" cx="60" cy="52" r="38"/><circle class="nj-cratera" cx="80" cy="33" r="5"/><circle class="nj-cratera" cx="88" cy="58" r="3.4"/>
    <circle class="nj-cratera" cx="36" cy="32" r="3"/>${ESTRELAS.map(([x, y, r]) => `<circle class="nj-estrela" cx="${x}" cy="${y}" r="${r}"/>`).join("")}
    <g class="nj-nuvem"><ellipse cx="17" cy="24" rx="11" ry="4.6"/><ellipse cx="24" cy="21" rx="7" ry="5"/><ellipse cx="101" cy="78" rx="12" ry="4.4"/><ellipse cx="95" cy="75" rx="6.5" ry="4.6"/></g>
    <rect class="nj-solo" x="0" y="113" width="120" height="17"/></g>
  <ellipse class="nj-chao" cx="60" cy="120" rx="27" ry="4.4"/>
  <g class="nj-corpo"><g class="nj-pula">
    <g class="nj-fita"><path d="M36 34C28 30 20 31 13 36C21 36 27 38 33 39Z"/><path d="M36 38C30 42 25 48 23 56C29 50 33 46 38 42Z"/></g>
    <rect class="nj-gi" x="46" y="100" width="11" height="16" rx="5"/><rect class="nj-gi" x="63" y="100" width="11" height="16" rx="5"/>
    <ellipse class="nj-pe" cx="51" cy="117" rx="8" ry="3.6"/><ellipse class="nj-pe" cx="69" cy="117" rx="8" ry="3.6"/>
    ${linha}M44 78C36 82 32 89 36 96"/><path class="nj-manga" d="M44 78C36 82 32 89 36 96"/><circle class="nj-mao" cx="37" cy="97" r="5"/>
    <path class="nj-gi" d="M41 80C41 73 46 70 52 70H68C74 70 79 73 79 80L82 101C82 106 79 108 75 108H45C41 108 38 106 38 101Z"/>
    <path class="nj-peito" d="M53 70.5L60 81L67 70.5Z"/><path class="nj-gola" d="M51 71L60 85L69 71"/>
    ${faixaSvg(f)}
    <g class="nj-repouso">${linha}M76 78C84 82 88 89 84 96"/><path class="nj-manga" d="M76 78C84 82 88 89 84 96"/><circle class="nj-mao" cx="83" cy="97" r="5"/></g>
    <g class="nj-aceno">${linha}M76 77C84 73 89 66 90 58"/><path class="nj-manga" d="M76 77C84 73 89 66 90 58"/><circle class="nj-mao" cx="90.5" cy="55.5" r="5.4"/></g>
    <g class="nj-cabeca"><circle class="nj-gi" cx="60" cy="44" r="27"/><path class="nj-brilho" d="M41 31C46 23 54 19.5 63 19.5"/>
      <path class="nj-testa-linha" d="M34.5 33.5C49 27 71 27 85.5 33.5"/><path class="nj-testa" d="M34.5 33.5C49 27 71 27 85.5 33.5"/>
      <rect class="nj-rosto" x="37.5" y="38.5" width="45" height="16.5" rx="8.25"/>
      <path class="nj-sobrancelha" d="M46 36.6Q49.8 34.6 53.6 36.2M74 36.6Q70.2 34.6 66.4 36.2"/>
      <g class="nj-olhos"><ellipse class="nj-olho" cx="51" cy="47" rx="3.7" ry="4.5"/><ellipse class="nj-olho" cx="69" cy="47" rx="3.7" ry="4.5"/>
        <circle class="nj-luz" cx="52.4" cy="45.2" r="1.35"/><circle class="nj-luz" cx="70.4" cy="45.2" r="1.35"/></g>
      <path class="nj-fechado" d="M47 47.5C49 50 53 50 55 47.5M65 47.5C67 50 71 50 73 47.5"/>
      <ellipse class="nj-bochecha" cx="43.6" cy="51.3" rx="2.8" ry="1.5"/><ellipse class="nj-bochecha" cx="76.4" cy="51.3" rx="2.8" ry="1.5"/>
      <path class="nj-sorriso" d="M54.5 61.5Q60 65.5 65.5 61.5"/></g>
  </g></g>
  <g class="nj-fumaca">${FUMACA.map(([x, y, r], i) => `<circle cx="${x}" cy="${y}" r="${r}" style="transform-origin:${x}px ${y}px;animation-delay:${F(i * 0.025)}s"/>`).join("")}</g>
  <g class="nj-brilhos">${[...Array(8)].map((_, i) => {
    const a = i * Math.PI / 4 + Math.PI / 8, x = F(60 + 16 * Math.cos(a)), y = F(76 + 16 * Math.sin(a));
    return `<g transform="translate(${x} ${y})"><path fill="${i % 2 && f ? f.cor : "#F6D77E"}" style="--dx:${F(30 * Math.cos(a))}px;--dy:${F(30 * Math.sin(a))}px;animation-delay:${F(1.18 + (i % 3) * 0.05)}s" d="M0-5.5L1.4-1.4L5.5 0L1.4 1.4L0 5.5L-1.4 1.4L-5.5 0L-1.4-1.4Z"/></g>`;
  }).join("")}</g>
  ${dorme ? `<g class="nj-zzz"><text x="89" y="29" font-size="9">z</text><text x="96" y="20" font-size="11">z</text><text x="104" y="10" font-size="13">Z</text></g>` : ""}
</svg>`;
}

// ---- a tela: o palco do ninja num lugar ("bloco", "tela", "folha"), que anima quando entra na tela -----------------
// Cada lugar tem um modo: "espera" (fora da tela: o ninja some, para surgir no puff quando aparecer), "entra" (o puff),
// "festa" (o puff e a faixa nova amarrando) e "parado". O painel redesenha o HTML a cada atualização: o modo fica aqui, e
// o palco novo continua a animação do ponto em que a anterior estava.
const DUR = {entra: 1700, festa: 4600};
const estado = {};
const agora = () => Date.now();
const reduzir = () => !!(raiz.matchMedia && raiz.matchMedia("(prefers-reduced-motion: reduce)").matches);
const lugarDe = lugar => estado[lugar] || (estado[lugar] = {modo: reduzir() ? "parado" : "espera", visivel: false});
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));

// O HTML do palco. festa = {titulo, sub} quando a faixa subiu; aoVer = o que fazer quando o ninja for visto de verdade
// (a página guarda a faixa vista).
function palco(lugar, faixa, {festa = null, dorme = false, aoVer = null, tamanho = 84} = {}) {
  const s = lugarDe(lugar), f = dorme ? null : faixaDe(faixa);
  s.aoVer = aoVer;
  if (festa && !s.festa && !s.festejou) {
    s.festa = festa;
    if (s.modo === "parado" && s.visivel && !reduzir()) s.modo = "espera";   // a faixa subiu com o ninja na tela: festeja já
  }
  if (!festa) s.festejou = false;
  const modo = s.modo, classes = modo === "espera" ? " espera" : modo === "festa" ? " entra festa" : modo === "entra" ? " entra" : "";
  const pilula = s.festa && (modo === "festa" || modo === "espera" || reduzir())
    ? `<span class="np-festa"><b>${esc(s.festa.titulo)}</b>${s.festa.sub ? `<small>${esc(s.festa.sub)}</small>` : ""}</span>` : "";
  const claro = f && (f.chave === "branca" || f.chave === "amarela");
  return `<span class="ninja-palco${classes}${f ? "" : " sem-faixa"}" data-ninja="${esc(lugar)}" style="--np:${tamanho}px${f ? `;--fx:${f.cor};--fx-txt:${claro ? "#0B1E3F" : "#FFFFFF"}` : ""}">${svg(faixa, {dorme})}${pilula}</span>`;
}

function aplicar(el, s) {
  el.classList.toggle("espera", s.modo === "espera");
  el.classList.toggle("entra", s.modo === "entra" || s.modo === "festa");
  el.classList.toggle("festa", s.modo === "festa");
  if (s.modo === "parado" && !(reduzir() && s.festa)) { const p = el.querySelector(".np-festa"); if (p) p.remove(); }
}
const noDoc = lugar => document.querySelector(`[data-ninja="${lugar}"]`);

function comecar(lugar) {
  const s = lugarDe(lugar);
  if (s.modo !== "espera") return;
  clearTimeout(s.timer);
  const festa = !!s.festa;
  s.modo = festa ? "festa" : "entra"; s.t0 = agora();
  if (festa) { s.festejou = true; }
  const el = noDoc(lugar);
  if (el) aplicar(el, s);
  if (s.aoVer) try { s.aoVer(); } catch (e) { /* guardar a faixa vista não pode travar a animação */ }
  s.timer = setTimeout(() => { s.modo = "parado"; s.festa = null; const e = noDoc(lugar); if (e) aplicar(e, s); }, DUR[s.modo]);
}
function armar(lugar) {
  const s = lugarDe(lugar);
  if (reduzir() || s.modo === "espera") return;
  clearTimeout(s.timer);
  if (s.modo === "festa") s.festa = null;   // já foi vista: não festeja de novo
  s.modo = "espera";
  const el = noDoc(lugar);
  if (el) aplicar(el, s);
}

let io = null;
const vigiados = new Set();
// Depois de cada desenho: vigia os palcos novos e, se um entrou no meio da animação, continua de onde ela estava.
function vigiar() {
  if (typeof document === "undefined") return;
  if (!io && typeof IntersectionObserver !== "undefined") {
    io = new IntersectionObserver(es => {
      for (const e of es) {
        const lugar = e.target.dataset.ninja, s = lugarDe(lugar);
        if (noDoc(lugar) !== e.target) continue;
        s.visivel = e.isIntersecting && e.intersectionRatio >= 0.45;
        if (reduzir()) { if (s.visivel) verParado(lugar); continue; }
        if (s.visivel && !document.hidden) comecar(lugar); else if (!e.isIntersecting) armar(lugar);
      }
    }, {threshold: [0, 0.45, 1]});
  }
  for (const el of vigiados) if (!el.isConnected) { if (io) io.unobserve(el); vigiados.delete(el); }
  for (const el of document.querySelectorAll("[data-ninja]")) {
    if (vigiados.has(el)) continue;
    vigiados.add(el);
    if (io) io.observe(el);
    const s = lugarDe(el.dataset.ninja);
    if ((s.modo === "entra" || s.modo === "festa") && el.getAnimations) {
      const ja = agora() - s.t0;
      for (const a of el.getAnimations({subtree: true})) try { a.currentTime = ja; } catch (e) { /* segue do começo */ }
    }
    if (s.modo === "espera" && s.visivel && !document.hidden && !reduzir()) comecar(el.dataset.ninja);
    if (!io) { s.modo = "parado"; aplicar(el, s); }
  }
}
// "Reduzir movimento": o ninja fica parado; a faixa nova aparece escrita por uns segundos.
function verParado(lugar) {
  const s = lugarDe(lugar);
  if (s.vistoParado) return;
  s.vistoParado = true;
  if (s.aoVer) try { s.aoVer(); } catch (e) { /* idem */ }
  if (s.festa) { s.festejou = true; setTimeout(() => { s.festa = null; const p = noDoc(lugar); if (p && p.querySelector(".np-festa")) p.querySelector(".np-festa").remove(); }, 6000); }
}
// O app saiu da frente: na volta, o ninja surge de novo (o IntersectionObserver não avisa da troca de app).
function acordar() {
  for (const lugar of Object.keys(estado)) {
    const s = estado[lugar];
    if (document.hidden) { armar(lugar); s.vistoParado = false; } else if (s.visivel && !reduzir()) comecar(lugar);
  }
}
if (typeof document !== "undefined") document.addEventListener("visibilitychange", acordar);

const Ninja = {FAIXAS, ORDEM_FAIXAS, FAIXAS_TIME, METRICAS_TIME, WHITE, faixaDe, rotulo, faixasDaRegua, metaToDate,
  diasFechados, tetoDaBanda, classificarFaixa, farol, subiu, guardar, svg, palco, vigiar, estado, DUR};
if (typeof module !== "undefined" && module.exports) module.exports = Ninja;
else raiz.Ninja = Ninja;
})(typeof window !== "undefined" ? window : globalThis);
