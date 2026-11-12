// Seaninho no celular: o "⚡ Rodar no PC" do Para você (v24, CONTRATO-v24 seção 5). O item do Para você com um bloco de
// código entre três crases (o "🔧 Ação sua" do maestro: "Cole no PowerShell: ```…```") ganha a caixa do comando com
// Copiar, o "⚡ Rodar no <PC>" e o "✓ Rodei", como o card da aba Revisões do Monitor geral (geral_revisoes.js). O
// Rodar abre uma folha com o comando inteiro e o PC; só o toque em "Rodar agora" monta o pedido, que leva a chave do
// item e o sha256 do comando: o agente só roda o que está, igual, num item do Para você que ele vê naquela hora. Sem
// tela (testado no Node: test_rodar.cjs); a página desenha, copia e manda o pedido (cel_pedir tipo "acao").
(function (raiz) {
"use strict";

// O comandoDoTexto do Monitor (geral_revisoes.js) e o do caixa.py da orquestra: o primeiro bloco de três crases, com
// as quebras de linha, sem espaços nas pontas, até 2.000 letras. A etiqueta da linguagem (```bash, ```json) fica à parte:
// o PC roda tudo no PowerShell, então só o bloco sem etiqueta ou de PowerShell ganha o "⚡ Rodar" (o crítico viu o
// "⚡ Rodar" num ```bash com "MSYS_NO_PATHCONV=1 schtasks", que no PowerShell não roda); os outros ficam só com o Copiar.
const RX_BLOCO = /```([\w+#.-]*)[ \t]*\n?([\s\S]*?)```/;
const RODAVEIS = ["", "powershell", "ps1", "ps", "pwsh", "posh"];   // a mesma regra do agente (rodar_comando)
const NOME_LINGUAGEM = {bash: "Git Bash", sh: "Git Bash", shell: "Git Bash", zsh: "Git Bash", console: "Git Bash", cmd: "Prompt de comando",
  bat: "Prompt de comando", batch: "Prompt de comando", python: "Python", py: "Python", json: "JSON", yaml: "YAML", yml: "YAML",
  sql: "SQL", js: "JavaScript", javascript: "JavaScript", node: "Node", text: "Texto", txt: "Texto", md: "Markdown"};
const COMANDO_MAX = 2000;
const NOTA_MAX = 300;                 // a frase do "✓ Rodei" (o rodeiFrase do Monitor)
const ONLINE_MS = 150000;             // o mesmo online() da página
const EM_CURSO = ["novo", "escrevendo", "pronto", "enviar", "enviando"];   // os estados do pedido antes do fim
const LINHAS_CURTAS = 6, LETRAS_CURTAS = 420;   // o fim da saída no cartão; o resto no "ver tudo"

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const nomeCurto = pc => String(pc || "").length > 11 && String(pc).includes("-") ? String(pc).split("-")[0] : String(pc || "");
function ms(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v < 1e12 ? v * 1000 : v;
  const t = Date.parse(String(v || ""));
  return Number.isFinite(t) ? t : 0;
}

// ==== O comando =======================================================================================================
function blocoDe(texto) {
  const m = RX_BLOCO.exec(String(texto ?? ""));
  return m ? m[2].trim() : "";
}
// A etiqueta do bloco, em minúsculas ("" sem etiqueta ou sem bloco).
function linguagemDe(texto) {
  const m = RX_BLOCO.exec(String(texto ?? ""));
  return m ? m[1].trim().toLowerCase() : "";
}
// O comando do texto do item ("" sem bloco de código).
function comandoDe(texto) { return blocoDe(texto).slice(0, COMANDO_MAX).trim(); }
// O comando passou do teto e foi cortado? Aí só o Copiar: rodar um pedaço de comando é perigoso.
const cortado = texto => blocoDe(texto).length > COMANDO_MAX;
// O comando do item: o campo "comando" se o agente publicar (o mesmo que ele confere), senão o do texto.
function comandoDoItem(it) {
  if (!it || typeof it !== "object") return "";
  if (typeof it.comando === "string" && it.comando.trim()) return it.comando.trim().slice(0, COMANDO_MAX).trim();
  return comandoDe(it.texto);
}
const cortadoDoItem = it => !!it && !(typeof it.comando === "string" && it.comando.trim()) && cortado(it.texto);
// A linguagem do comando do item: o campo "linguagem" se o agente publicar, senão a etiqueta do bloco do texto.
function linguagemDoItem(it) {
  if (!it || typeof it !== "object") return "";
  if (typeof it.linguagem === "string") return it.linguagem.trim().toLowerCase();
  return linguagemDe(it.texto);
}
// Dá para mandar o PC rodar (no PowerShell)? Só o bloco sem etiqueta ou de PowerShell, e nunca o item com senha ou
// chave ("segredo": o agente manda sem o comando, com o texto mascarado, e também não roda; corretor de 12/11).
const rodavel = it => !(it && it.segredo === true) && RODAVEIS.includes(linguagemDoItem(it));
// A frase do item com senha ou chave (a mesma do agente, rodar_pc.COM_SEGREDO).
const COM_SEGREDO = "Esse comando tem uma senha ou chave: ele não vai ao celular. Copie e rode no PC";
// O nome do terminal para o título e o aviso do Copiar ("PowerShell", "Git Bash", "JSON" …).
function ondeColar(it) {
  const l = linguagemDoItem(it);
  return RODAVEIS.includes(l) ? "PowerShell" : NOME_LINGUAGEM[l] || l;
}

// ==== O sha256 (hex, UTF-8, sem espaços nas pontas) ===================================================================
const hex = b => Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
const rot = (x, n) => (x >>> n) | (x << (32 - n));
// O SHA-256 em JS puro, para o navegador sem crypto.subtle (fora de https): o mesmo resultado, conferido no teste.
function sha256Puro(bytes) {
  const n = bytes.length, total = ((n + 9 + 63) >> 6) << 6;
  const m = new Uint8Array(total);
  m.set(bytes);
  m[n] = 0x80;
  const dv = new DataView(m.buffer), bits = n * 8;
  dv.setUint32(total - 8, Math.floor(bits / 0x100000000));
  dv.setUint32(total - 4, bits >>> 0);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rot(W[i - 15], 7) ^ rot(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rot(W[i - 2], 17) ^ rot(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32), dvo = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) dvo.setUint32(i * 4, H[i]);
  return out;
}
function cripto() {
  const g = typeof globalThis !== "undefined" ? globalThis : raiz;
  if (g.crypto && g.crypto.subtle) return g.crypto;
  if (typeof require === "function") { try { return require("crypto").webcrypto; } catch (e) { /* sem o módulo: o JS puro */ } }
  return null;
}
async function sha256(comando) {
  const dados = new TextEncoder().encode(String(comando ?? "").trim());
  const c = cripto();
  if (c && c.subtle) return hex(new Uint8Array(await c.subtle.digest("SHA-256", dados)));
  return hex(sha256Puro(dados));
}

// ==== Os PCs ==========================================================================================================
// Os PCs ligados agora: a lista de nomes, a lista {pc, ligado|online|visto_em} ou o objeto de PCs da página.
function pcsLigados(pcs, agoraMs) {
  const agora = agoraMs ?? Date.now(), out = [];
  for (const p of Array.isArray(pcs) ? pcs : Object.values(pcs || {})) {
    if (typeof p === "string") { if (p && !out.includes(p)) out.push(p); continue; }
    if (!p || !p.pc) continue;
    const lig = typeof p.ligado === "boolean" ? p.ligado : typeof p.online === "boolean" ? p.online : agora - ms(p.visto_em) < ONLINE_MS;
    if (lig && !out.includes(String(p.pc))) out.push(String(p.pc));
  }
  return out;
}
// O PC padrão: o da central, se ligado; senão, o primeiro ligado; sem nenhum, o da central (desligado).
function pcPadrao(pcCentral, ligados) {
  const l = ligados || [];
  return pcCentral && l.includes(pcCentral) ? pcCentral : l[0] || String(pcCentral || "");
}

// ==== O pedido, a nota e o resultado ==================================================================================
// O pedido do "Rodar agora" (uma Promise: o sha256 é assíncrono no navegador).
async function pedidoRodar(chave, comando) {
  const c = String(comando ?? "").trim(), k = String(chave ?? "").trim();
  if (!k) throw new Error("Sem a chave do item do Para você");
  if (!c) throw new Error("Sem comando para rodar");
  return {acao: "rodar_comando", chave: k, sha: await sha256(c)};
}
// A frase do "✓ Rodei" ao maestro, a do Monitor: "Rodei o comando: …" numa linha, até 300 letras. "" quando uma das
// respostas prontas do item já diz que rodou ("Rodei o …", "Já rodei").
function notaRodei(comando, frases) {
  if ((frases || []).some(f => /^\s*(?:j[áa]\s+)?rodei\b/i.test(String(f)))) return "";
  const t = String(comando ?? "").replace(/\s+/g, " ").trim().replace(/[?.!…]+$/, "");
  return (t ? `Rodei o comando: ${t}` : "Rodei o comando").slice(0, NOTA_MAX);
}
// A resposta do pedido: o código de saída e o fim da saída. Aceita o JSON {"codigo", "saida"} ou o texto com o código
// na primeira linha ("Saída 0", "código de saída: 1", "exit code 2"); sem código, {codigo: null, saida: o texto}.
function lerResultado(resposta) {
  const t = String(resposta ?? "");
  if (/^\s*\{/.test(t)) {
    try {
      const j = JSON.parse(t);
      if (j && typeof j === "object") {
        const c = [j.codigo, j.code, j.exit].find(v => v !== undefined && v !== null && v !== "");
        return {codigo: Number.isFinite(Number(c)) ? Number(c) : null, saida: String(j.saida ?? j.output ?? j.texto ?? "")};
      }
    } catch (e) { /* não era JSON: lê como texto */ }
  }
  const quebra = t.indexOf("\n"), primeira = quebra < 0 ? t : t.slice(0, quebra);
  const m = /(?:c[óo]digo(?: de sa[íi]da)?|sa[íi]da|exit(?: code)?)\s*[:=]?\s*(-?\d+)\b/i.exec(primeira);
  if (m) return {codigo: Number(m[1]), saida: quebra < 0 ? "" : t.slice(quebra + 1)};
  return {codigo: null, saida: t};
}
// O "ver tudo" da saída de cada pedido: lembrado entre um desenho e outro.
const abertos = new Set();
function alternar(id) { const k = String(id); if (abertos.has(k)) abertos.delete(k); else abertos.add(k); return abertos.has(k); }
function fimDa(saida) {
  const linhas = saida.split("\n").slice(-LINHAS_CURTAS).join("\n");
  return linhas.length > LETRAS_CURTAS ? linhas.slice(-LETRAS_CURTAS) : linhas;
}
// O resultado no cartão: pedindo / rodando, o código de saída e o fim da saída ("ver tudo"), ou o erro.
// pedido = a linha do cel_pedir ({id, pc, estado, resposta, erro}); op.pc: o PC, se a linha não disser.
function htmlResultado(p, op) {
  if (!p || typeof p !== "object") return "";
  const onde = nomeCurto((op && op.pc) || p.pc) || "PC";
  if (EM_CURSO.includes(p.estado)) {
    return `<div class="rd-res anda" role="status"><i class="rd-roda" aria-hidden="true"></i>${p.estado === "novo" ? `Pedi ao ${esc(onde)}…` : `Rodando no ${esc(onde)}… (até 5 min)`}</div>`;
  }
  if (p.estado === "erro" || p.estado === "cancelado") {
    return `<div class="rd-res erro" role="status">⚠ Não rodou: ${esc(String(p.erro || "").trim() || "o PC não conseguiu")}</div>`;
  }
  if (p.estado !== "entregue") return "";
  const r = lerResultado(p.resposta), saida = r.saida.replace(/\s+$/, ""), id = String(p.id || "");
  const ok = r.codigo === null || r.codigo === 0;
  const cab = r.codigo === null ? `✓ Rodou no ${esc(onde)}` : r.codigo === 0 ? `✓ Rodou no ${esc(onde)} · saída 0` : `⚠ Terminou com erro no ${esc(onde)} · saída ${r.codigo}`;
  const longa = saida.split("\n").length > LINHAS_CURTAS || saida.length > LETRAS_CURTAS;
  const tudo = abertos.has(id), mostra = !longa || tudo ? saida : fimDa(saida);
  return `<div class="rd-res ${ok ? "ok" : "erro"}" role="status"><div class="rd-res-t">${cab}</div>
    ${saida ? `<pre class="rd-saida">${longa && !tudo ? "…\n" : ""}${esc(mostra)}</pre>` : `<div class="rd-sem">(sem saída)</div>`}
    ${longa && id ? `<button type="button" class="rd-tudo" data-rd-tudo="${esc(id)}" aria-expanded="${tudo}">${tudo ? "ver menos ▴" : "ver tudo ▾"}</button>` : ""}</div>`;
}

// ==== O HTML ==========================================================================================================
const jaRodou = it => ((it && it.respostas) || []).some(f => /^\s*(?:j[áa]\s+)?rodei\b/i.test(String(f)));
// A caixa do comando no item do Para você ("" sem comando, no item do Slack e no de sessão pessoal).
// op: {pcCentral, pcs (os PCs que podem rodar: os da página ou a lista), agora, pedido (a linha do cel_pedir do último
// Rodar deste item), bloqueio (o motivo de o botão ficar apagado agora, ex.: sem internet), desligado (o "motivo" do
// sinal do agente, hoje.painel.rodar: sem nenhum PC com o Rodar ligado, a caixa fica só com o Copiar e o ✓ Rodei, e
// esta linha diz por quê; corretor de 12/11: o botão que só daria erro não aparece), rodei: false (sem o ✓ Rodei)}.
function htmlCaixa(it, op) {
  const o = op || {};
  if (!it || it.slack || it.pessoal) return "";
  const chave = String(it.chave || "");
  const rodeiB = () => (o.rodei === false || jaRodou(it) ? "" : `<button type="button" class="rd-b" data-rd-rodei="${esc(chave)}">✓ Rodei</button>`);
  if (it.segredo === true) {   // o comando tem senha ou chave: ele não vem; só a frase e o ✓ Rodei de quem rodou no PC
    if (!comandoDoItem(it)) return "";   // sem o bloco no texto, não era um comando (o texto do agente já diz o resto)
    const r = rodeiB();
    return `<div class="rd-caixa segredo" data-rd-item="${esc(chave)}">
  <div class="rd-tit">🔒 Comando com senha ou chave</div><p class="rd-pq">${esc(COM_SEGREDO)}.</p>
  ${r ? `<div class="rd-acoes">${r}</div>` : ""}
</div>`;
  }
  const cmd = comandoDoItem(it);
  if (!cmd) return "";
  const ligados = pcsLigados(o.pcs, o.agora), alvo = pcPadrao(o.pcCentral, ligados);
  const onde = ondeColar(it), desligado = rodavel(it) && o.desligado ? String(o.desligado) : "";
  const p0 = o.pedido && typeof o.pedido === "object" ? o.pedido : null;
  if (!rodavel(it) || desligado) {   // ```bash, ```json… ou o Rodar desligado: o Copiar e o ✓ Rodei de quem rodou à mão
    const rodei1 = p0 && p0.estado === "entregue" ? "" : rodeiB();
    return `<div class="rd-caixa" data-rd-item="${esc(chave)}">
  <div class="rd-tit">📋 ${esc(onde)}: copie e cole</div>
  <div class="rd-cod"><div class="rd-cod-bar"><span>${esc(onde)}</span><button type="button" class="rd-copiar" data-rd-copiar="${esc(chave)}" aria-label="Copiar o comando">Copiar</button></div><pre class="rd-pre"><code>${esc(cmd)}</code></pre></div>
  ${rodei1 ? `<div class="rd-acoes">${rodei1}</div>` : ""}${desligado ? `<p class="rd-pq" data-rd-porque><span aria-hidden="true">⚡</span> ${esc(desligado.replace(/[.\s]+$/, ""))}.</p>` : ""}${desligado && p0 ? htmlResultado(p0, {pc: p0.pc || alvo}) : ""}
</div>`;
  }
  const p = p0;
  const andando = !!(p && EM_CURSO.includes(p.estado));
  const motivo = o.bloqueio ? String(o.bloqueio)
    : !chave ? "Sem a chave do item"
    : cortadoDoItem(it) ? "Comando grande demais: copie e cole"
    : !alvo ? "Nenhum PC ligado"
    : !ligados.includes(alvo) ? `${nomeCurto(alvo)} desligado` : "";
  const feito = p && p.estado === "entregue";
  const rotulo = `⚡ Rodar ${feito ? "de novo " : ""}no ${esc(nomeCurto(alvo))}`;
  const rodar = `<button type="button" class="rd-b ouro" data-rd-rodar="${esc(chave)}" data-rd-alvo="${esc(alvo)}"${motivo || andando ? " disabled" : ""}>${motivo ? esc(motivo) : rotulo}</button>`;
  const rodei = o.rodei === false || jaRodou(it) || feito ? "" : `<button type="button" class="rd-b" data-rd-rodei="${esc(chave)}">✓ Rodei</button>`;
  return `<div class="rd-caixa" data-rd-item="${esc(chave)}">
  <div class="rd-tit">⚡ Rodar no PC: copie e cole no PowerShell</div>
  <div class="rd-cod"><div class="rd-cod-bar"><span>PowerShell</span><button type="button" class="rd-copiar" data-rd-copiar="${esc(chave)}" aria-label="Copiar o comando">Copiar</button></div><pre class="rd-pre"><code>${esc(cmd)}</code></pre></div>
  <div class="rd-acoes">${rodar}${rodei}</div>${p ? htmlResultado(p, {pc: p.pc || alvo}) : ""}
</div>`;
}

// A folha de confirmação: o comando inteiro, o PC (com a troca para outro PC ligado), "Rodar agora" e "Cancelar". O
// toque fora da folha também cancela. Só o "Rodar agora" com um PC ligado escolhido manda.
// op: {mudou: true} quando o comando do item mudou com a folha aberta (a folha mostra o novo, avisa e trava o "Rodar
// agora" por um instante: o toque que já vinha não roda o que a pessoa não viu).
function htmlConfirmar(comando, pc, pcsLigadosLista, op) {
  const cmd = String(comando ?? "").trim(), lig = (pcsLigadosLista || []).map(String).filter(Boolean);
  const escolhido = String(pc || ""), mudou = !!(op && op.mudou), ok = !!cmd && !!escolhido && lig.includes(escolhido) && !(op && op.travado);
  const opcoes = [...lig];
  if (escolhido && !opcoes.includes(escolhido)) opcoes.unshift(escolhido);
  const chips = opcoes.map(x => {
    const on = x === escolhido, liga = lig.includes(x);
    return `<button type="button" role="radio" aria-checked="${on}" class="rd-pc${on ? " on" : ""}" data-rd-pc="${esc(x)}"${liga ? "" : " disabled"} title="${esc(x)}">${on ? "● " : ""}${esc(nomeCurto(x))}${liga ? "" : " (desligado)"}</button>`;
  }).join("");
  const aviso = !cmd ? "Sem comando para rodar." : !lig.length ? "Nenhum PC ligado agora: copie o comando e cole no PowerShell."
    : !lig.includes(escolhido) ? `O ${esc(nomeCurto(escolhido) || "PC")} está desligado: escolha um PC ligado.`
    : mudou ? "⚠ O comando mudou no PC: confira de novo o que está acima antes de rodar." : "";
  return `<div class="rd-fundo" data-rd-fundo>
  <div class="rd-folha" role="dialog" aria-modal="true" aria-labelledby="rd-f-t" data-rd-folha>
    <div class="rd-pega" aria-hidden="true"></div>
    <h4 class="rd-f-t" id="rd-f-t">⚡ Rodar no ${esc(nomeCurto(escolhido) || "PC")}</h4>
    <p class="rd-frase">O PC roda isto agora, escondido, e devolve a saída.</p>
    <pre class="rd-f-cmd"><code>${esc(cmd)}</code></pre>
    ${opcoes.length ? `<div class="rd-f-rot" id="rd-f-pcs">Em qual PC</div><div class="rd-pcs" role="radiogroup" aria-labelledby="rd-f-pcs">${chips}</div>` : ""}
    ${aviso ? `<div class="rd-aviso" role="alert">${aviso}</div>` : ""}
    <div class="rd-f-acoes"><button type="button" class="rd-b" data-rd-cancelar>Cancelar</button><button type="button" class="rd-b ouro" data-rd-confirmar="${esc(escolhido)}"${ok ? "" : " disabled"}>Rodar agora</button></div>
  </div>
</div>`;
}

// O que um toque pede: {acao: "copiar"|"rodar"|"rodei", chave, pc?}, {acao: "pc"|"confirmar", pc}, {acao: "cancelar"}
// ou {acao: "tudo", id} (a página chama alternar(id) e redesenha). O toque dentro da folha, fora dos botões: null.
function acaoDe(el) {
  const n = el && el.closest ? el.closest("[data-rd-copiar],[data-rd-rodar],[data-rd-rodei],[data-rd-pc],[data-rd-confirmar],[data-rd-cancelar],[data-rd-tudo],[data-rd-folha],[data-rd-fundo]") : null;
  const d = n && n.dataset;
  if (!d || n.disabled) return null;
  if (d.rdCopiar !== undefined) return {acao: "copiar", chave: d.rdCopiar};
  if (d.rdRodar !== undefined) return {acao: "rodar", chave: d.rdRodar, pc: d.rdAlvo || ""};
  if (d.rdRodei !== undefined) return {acao: "rodei", chave: d.rdRodei};
  if (d.rdPc !== undefined) return {acao: "pc", pc: d.rdPc};
  if (d.rdConfirmar !== undefined) return {acao: "confirmar", pc: d.rdConfirmar};
  if (d.rdCancelar !== undefined || d.rdFundo !== undefined) return {acao: "cancelar"};
  if (d.rdTudo !== undefined) return {acao: "tudo", id: d.rdTudo};
  return null;   // dentro da folha, fora dos botões
}

const CSS = `
.rd-caixa{margin-top:10px;padding:10px;border-radius:14px;background:rgba(0,0,0,.22);border:1px solid rgba(226,184,74,.38);min-width:0}
.rd-tit{font-size:13.5px;font-weight:650;color:var(--gold-2,#F6D77E)}
.rd-cod{margin-top:8px;border-radius:10px;overflow:hidden;border:1px solid var(--stroke);background:rgba(0,0,0,.35)}
.rd-cod-bar{display:flex;align-items:center;justify-content:space-between;padding-left:12px;border-bottom:1px solid var(--stroke);font-size:12px;color:var(--muted)}
.rd-copiar{min-height:44px;min-width:76px;padding:0 14px;color:var(--gold-2,#F6D77E);font-size:14px;font-weight:650}
.rd-pre{margin:0;max-height:180px;overflow:auto;padding:10px 12px;font:13px/1.45 ui-monospace,Menlo,Consolas,monospace;color:var(--ink);white-space:pre-wrap;overflow-wrap:anywhere}
.rd-acoes{display:flex;gap:8px;margin-top:8px}
.rd-pq{margin:8px 0 0;font-size:12.5px;line-height:1.4;color:var(--muted)}
.rd-caixa.segredo .rd-pq{margin-top:4px}
.rd-b{flex:1 1 auto;min-height:44px;padding:0 14px;border-radius:12px;background:var(--glass-2);border:1px solid var(--stroke);color:var(--ink);font-size:15px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rd-b.ouro{background:var(--gold);border-color:var(--gold);color:var(--navy)}
.rd-b[disabled]{opacity:.5}
.rd-b.ouro[disabled]{background:var(--glass-2);border-color:var(--stroke);color:var(--muted);opacity:1}
.rd-res{margin-top:8px;padding:9px 11px;border-radius:12px;font-size:13.5px;background:var(--glass);border:1px solid var(--stroke);color:var(--muted)}
.rd-res.anda{display:flex;align-items:center;gap:8px}
.rd-res.ok{background:rgba(72,214,128,.07);border-color:rgba(72,214,128,.25)}
.rd-res.ok .rd-res-t{color:#86E8AE;font-weight:650}
.rd-res.erro{background:rgba(255,90,79,.09);border-color:rgba(255,90,79,.32);color:#FFA49C}
.rd-res.erro .rd-res-t{font-weight:650}
.rd-saida{margin:6px 0 0;max-height:46vh;overflow:auto;padding:8px 10px;border-radius:8px;background:rgba(0,0,0,.3);font:12.5px/1.4 ui-monospace,Menlo,Consolas,monospace;color:var(--ink);white-space:pre-wrap;overflow-wrap:anywhere}
.rd-sem{margin-top:4px;font-size:12.5px;color:var(--muted)}
.rd-tudo{display:block;min-height:44px;padding:0 2px;color:var(--gold-2,#F6D77E);font-size:14px;font-weight:650}
.rd-roda{display:inline-block;flex:none;width:14px;height:14px;border-radius:50%;border:2px solid rgba(255,255,255,.18);border-top-color:var(--gold);animation:rd-gira .9s linear infinite}
@keyframes rd-gira{to{transform:rotate(360deg)}}
.rd-fundo{position:fixed;inset:0;z-index:9;background:rgba(0,0,0,.55);display:flex;align-items:flex-end}
.rd-folha{width:100%;max-height:88vh;overflow:auto;background:#10264F;border-radius:18px 18px 0 0;border-top:1px solid var(--stroke);padding:8px 16px calc(var(--bottom,0px) + 14px);color:var(--ink)}
.rd-pega{width:38px;height:5px;border-radius:999px;background:var(--stroke-2,rgba(255,255,255,.18));margin:2px auto 10px}
.rd-f-t{margin:0;font-size:18px;font-weight:700}
.rd-frase{margin:4px 0 10px;font-size:14px;color:var(--muted)}
.rd-f-cmd{margin:0;max-height:38vh;overflow:auto;padding:10px 12px;border-radius:10px;background:rgba(0,0,0,.35);border:1px solid var(--stroke);font:13.5px/1.45 ui-monospace,Menlo,Consolas,monospace;color:var(--ink);white-space:pre-wrap;overflow-wrap:anywhere}
.rd-f-rot{margin:12px 0 6px;font-size:12.5px;font-weight:650;color:var(--muted)}
.rd-pcs{display:flex;gap:8px;flex-wrap:wrap}
.rd-pc{min-height:44px;padding:0 16px;border-radius:999px;background:var(--glass);border:1px solid var(--stroke);color:var(--muted);font-size:15px;font-weight:650}
.rd-pc.on{background:rgba(226,184,74,.16);border-color:rgba(226,184,74,.55);color:var(--gold-2,#F6D77E)}
.rd-pc[disabled]{opacity:.5}
.rd-aviso{margin-top:10px;padding:8px 11px;border-radius:10px;background:rgba(255,90,79,.1);border:1px solid rgba(255,90,79,.3);color:#FFA49C;font-size:13.5px}
.rd-f-acoes{display:flex;gap:8px;margin-top:14px}
@media (prefers-reduced-motion:reduce){.rd-roda{animation:none}}
`;

const Rodar = {COMANDO_MAX, RODAVEIS, COM_SEGREDO, comandoDe, comandoDoItem, linguagemDe, linguagemDoItem, rodavel, ondeColar, cortado, sha256, sha256Puro, pcsLigados, pcPadrao, pedidoRodar,
  notaRodei, lerResultado, htmlCaixa, htmlConfirmar, htmlResultado, alternar, acaoDe, CSS};
if (typeof module !== "undefined" && module.exports) module.exports = Rodar;
else raiz.Rodar = Rodar;
})(typeof window !== "undefined" ? window : globalThis);
