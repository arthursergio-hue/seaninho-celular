// Seaninho no celular: o ninja da faixa do uso de IA (0.8.10; 0.8.11: as 7 faixas; v24: a regra do TeamZone de hoje, o
// plano B da página quando o PC não manda o conjunto). O ninja veste a faixa da semana e aparece num puff de fumaça toda
// vez que a seção entra na tela; quando a faixa sobe, a faixa nova amarra numa comemoração. Só SVG e CSS, sem
// biblioteca. O desenho e as contas rodam sem tela (testados no Node: test_ninja.cjs, com os casos do faixa_casos.json);
// vigiar a tela e tocar a animação, só no navegador.
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

// ---- a regra do TeamZone (v24, 12/11), o plano B da página -----------------------------------------------------
// A faixa oficial chega pronta no `uso_ia_conjunto` (o Seaninho Pro soma os PCs e lê o TeamZone; CONTRATO-v24, seção
// 6). Sem ele, a página conta sozinha com a MESMA regra, copiada linha a linha do TeamZone (seazone-tech/teamzone,
// src/lib/uso-ia/: faixas.ts, semana.ts, regua-painel.ts e o "dia 0 sem faixa" de consultas/uso-ia.ts, lidos em 11/11)
// e do `scripto/uso_ia_faixa.py` do Pro, que é a cópia em Python; os dois passam pelos mesmos casos
// (faixa_casos.json, test_ninja.cjs). Até a v23 a página dava Branca quando o TeamZone dava Azul: aplicava o portão da
// banda (que acabou na W44), tirava a régua de uma fórmula sobre o P100 do coletor e contava os dias pela hora da medida.
const FAIXAS_TIME = ["Branca", "Amarela", "Verde", "Azul", "Roxa", "Marrom", "Preta"];
const METRICAS_TIME = ["sessoes_iniciadas", "mensagens", "tarefas_operacionais", "tarefas_internas", "skills_novas",
  "linhas_sistema", "linhas_agente", "cron_jobs", "workflows", "organizacao"];
const WHITE = {sessoes_iniciadas: 21, mensagens: 200, organizacao: 61};
// O portão da banda acabou com a W44 (R-28.63, 09/11: a W45 foi reprocessada sem ele). O comentário do calculo.ts do
// TeamZone ainda diz W45: é armadilha; vale a constante do faixas.ts.
const PORTAO_DA_BANDA_ATE = "2026-W44";
// Da W45 em diante a régua é a TABELA do painel (as 70 células); a fórmula sobre o P100 só vale para as semanas de antes,
// e sempre com o aviso. A régua do coletor nunca decide a faixa da W45 em diante (ela varia por pessoa; a do TeamZone é
// uma por semana, a mesma para todos).
const PRIMEIRA_SEMANA_DA_TABELA = "2026-W45";
const MOTIVO_PRIMEIRO_DIA = "as faixas aparecem no sábado, às 17h";
const MOTIVO_SEM_REGUA = "sem régua da semana (o TeamZone também ainda não tem)";
const AVISO_SEM_PAINEL = "sem a régua do painel";
const SELO_PAGINA = "régua lida no TeamZone";
const SELO_CODIGO = "régua do código do TeamZone";
// O fuso é fixo, −03:00 (o corte das 17h do TeamZone e o FUSO_REGUA do coletor; São Paulo não tem horário de verão
// desde 2019): a conta não depende do fuso do aparelho (o iPhone numa viagem dava outro dia fechado).
const FUSO_MS = 3 * 3600000, CORTE_H = 17, DIA_MS = 86400000;

const finito = v => typeof v === "number" && Number.isFinite(v);
// O `num` do coletor.ts: número, ou texto numérico; o resto vale 0.
const num = v => finito(v) ? v : typeof v === "string" && /^-?[0-9]+(\.[0-9]+)?$/.test(v.trim()) ? Number(v.trim()) : 0;
// Uma diferença sem o ruído do ponto flutuante (84 − 83,7 dá 0,3, e não 0,2999…), como o `_limpo` do Pro.
const limpo = x => Math.round(x * 1e6) / 1e6;
// Um momento em ms: Date, número (ms; até 1e11, segundos, como o `gerado` do agente) ou texto ISO (sem fuso, −03:00).
function instante(x) {
  if (x instanceof Date) return Number.isFinite(x.getTime()) ? x.getTime() : null;
  if (finito(x)) return x < 1e11 ? x * 1000 : x;
  if (typeof x !== "string" || !x.trim()) return null;
  const s = x.trim(), semFuso = /T\d\d:\d\d(:\d\d(\.\d+)?)?$/.test(s);
  const t = Date.parse(semFuso ? s + "-03:00" : s);
  return Number.isFinite(t) ? t : null;
}
// O dia e a hora do momento em −03:00: {dia: "AAAA-MM-DD", hora}.
function emSP(ms) {
  const d = new Date(ms - FUSO_MS);
  return {dia: d.toISOString().slice(0, 10), hora: d.getUTCHours(), minuto: d.getUTCMinutes()};
}
const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;
const diaValido = d => typeof d === "string" && DIA_RE.test(d) && new Date(`${d}T12:00:00Z`).toISOString().slice(0, 10) === d;
const meioDia = dia => Date.parse(`${dia}T12:00:00Z`);
const somarDias = (dia, n) => new Date(meioDia(dia) + n * DIA_MS).toISOString().slice(0, 10);
const diaDaSemanaIso = dia => { const d = new Date(meioDia(dia)).getUTCDay(); return d === 0 ? 7 : d; };   // 1 = segunda

// ---- a semana do programa (semana.ts) -----------------------------------------------------------------------------
// A semana ISO do dia (a da quinta-feira dela), como "AAAA-Wnn".
function rotuloIso(dia) {
  const quinta = somarDias(dia, 4 - diaDaSemanaIso(dia));
  const ano = Number(quinta.slice(0, 4));
  const diaDoAno = Math.round((meioDia(quinta) - Date.UTC(ano, 0, 1, 12)) / DIA_MS);
  return `${ano}-W${String(Math.floor(diaDoAno / 7) + 1).padStart(2, "0")}`;
}
// A semana em andamento no instante: de sexta 17h a sexta 17h, rotulada pela sexta em que fecha (nunca o ISO de hoje:
// sábado 07/11 é a W46; sexta 13/11 às 17h00 já é a W47; sexta 01/01/2027 às 16h é a 2026-W53). {rotulo, fecha_em}.
function semanaDoPrograma(agora) {
  const t = instante(agora);
  if (t === null) return null;
  const {dia: hoje, hora} = emSP(t);
  let sexta = somarDias(hoje, 5 - diaDaSemanaIso(hoje));
  if (hoje > sexta || (hoje === sexta && hora >= CORTE_H)) sexta = somarDias(sexta, 7);
  return {rotulo: rotuloIso(sexta), fecha_em: sexta};
}
// A sexta em que a semana "AAAA-Wnn" fecha (o inverso do rótulo). Rótulo inválido: null.
function sextaDoRotulo(rotulo) {
  if (typeof rotulo !== "string" || !/^\d{4}-W\d{2}$/.test(rotulo)) return null;
  const ano = Number(rotulo.slice(0, 4)), semana = Number(rotulo.slice(6)), quatro = `${ano}-01-04`;
  const sexta = somarDias(somarDias(quatro, 1 - diaDaSemanaIso(quatro)), (semana - 1) * 7 + 4);
  return semana >= 1 && rotuloIso(sexta) === rotulo ? sexta : null;
}
// A semana da linha do coletor de data `dia` (a linha de D cobre D−1 17h a D 17h; sábado a sexta pela data).
function semanaDaData(dia) {
  const fecha = somarDias(dia, (5 - new Date(meioDia(dia)).getUTCDay() + 7) % 7);
  return {rotulo: rotuloIso(fecha), fecha_em: fecha};
}
// A data da janela diária (17h a 17h) do instante: quarta 16h59 é a janela de quarta; quarta 17h00, a de quinta.
const janelaDoMomento = agora => { const t = instante(agora); return t === null ? null : emSP(t + 7 * 3600000).dia; };
// A sexta 17h em que a semana fecha, e o corte (o sábado seguinte, 17h): até ele o TeamZone ainda relê a semana.
const fimDaSemana = fechaEm => Date.parse(`${fechaEm}T17:00:00-03:00`);
const corteDaSemana = fechaEm => Date.parse(`${somarDias(fechaEm, 1)}T17:00:00-03:00`);

// Os dias já fechados da semana que fecha na sexta `fechaEm`, no instante `agora` (o `diasFechados` do faixas.ts, com o
// fuso fixo): o dia fecha às 17h; sábado 17h é o dia 1 e sexta 17h o dia 7; de sexta 17h a sábado 17h, 0. A página
// passa a hora de AGORA, como o TeamZone, que conta pelo relógio de quem abre (consultas/uso-ia.ts:293): de quinta
// 17h00 em diante os mesmos números já dão "faltam 290", antes de o dado novo chegar às 17h35. null sem o instante.
function diasFechados(fechaEm, agora) {
  const t = instante(agora);
  if (t === null || !diaValido(fechaEm)) return null;
  const {dia, hora} = emSP(t);
  const sabado = meioDia(fechaEm) - 6 * DIA_MS;
  return Math.max(0, Math.min(7, Math.round((meioDia(dia) - sabado) / DIA_MS) + (hora >= CORTE_H ? 1 : 0)));
}

// ---- a faixa (faixas.ts, calculo.ts) ------------------------------------------------------------------------------
// A meta até hoje: o mínimo da semana inteira × dias fechados ÷ 7, para cima; a organização não se divide.
const metaToDate = (minimo, metrica, dias) =>
  metrica === "organizacao" ? minimo : Math.ceil(minimo * Math.max(0, Math.min(7, dias)) / 7);

// O portão da banda (só até a W44): P0 sem faixa; P25 no máximo Branca; da P50 à P100, só os mínimos. Devolve o índice
// mais alto permitido em FAIXAS_TIME (-1 = nenhum).
const tetoDaBanda = banda => banda === "P25" ? 0 : ["P50", "P75", "P100"].includes(banda) ? FAIXAS_TIME.length - 1 : -1;
const temPortaoDaBanda = rotulo => String(rotulo) <= PORTAO_DA_BANDA_ATE;
const tetoDaSemana = (rotulo, banda) => temPortaoDaBanda(rotulo) ? tetoDaBanda(banda) : FAIXAS_TIME.length - 1;

// O `classificarFaixa` do faixas.ts, linha por linha: a faixa mais alta cujos mínimos (pela meta até hoje) a pessoa bate,
// todos, com as de baixo também batidas; depois o teto da semana (sem `rotulo`, o portão vale sempre, como no TeamZone).
// Com 0 dias dá Preta só pela organização: quem desenha usa `faixaDaSemana`, que esconde a faixa no dia 0.
function classificarFaixa(valores, faixas, dias, banda, rotulo) {
  if (!faixas || dias === null || dias === undefined) return null;
  let pelosMinimos = null;
  for (const f of FAIXAS_TIME) {
    if (Object.entries(faixas[f] || {}).some(([m, n]) => !finito(valores[m]) || valores[m] < metaToDate(n, m, dias))) break;
    pelosMinimos = f;
  }
  const teto = rotulo === undefined || rotulo === null ? tetoDaBanda(banda) : tetoDaSemana(rotulo, banda);
  const limitadaPelaBanda = pelosMinimos !== null && FAIXAS_TIME.indexOf(pelosMinimos) > teto;
  const atual = limitadaPelaBanda ? (teto < 0 ? null : FAIXAS_TIME[teto]) : pelosMinimos;
  const proxima = FAIXAS_TIME[atual === null ? 0 : FAIXAS_TIME.indexOf(atual) + 1] ?? null;
  const metas = Object.fromEntries(Object.entries(proxima ? faixas[proxima] : faixas.Preta)
    .map(([m, n]) => [m, metaToDate(n, m, dias)]));
  const atingidos = proxima ? Object.entries(metas).filter(([m, n]) => finito(valores[m]) && valores[m] >= n).length : 0;
  return {atual, proxima, metas, atingidos, total: proxima ? Object.keys(metas).length : 0, limitadaPelaBanda, pelosMinimos};
}
// Só os 10 critérios, ausente ou não numérico = 0 (o `valoresDosFatores` do calculo.ts). Tokens ficam de fora.
const valoresDosFatores = v => Object.fromEntries(METRICAS_TIME.map(m => [m, finito((v || {})[m]) ? v[m] : 0]));

// O que a tela do TeamZone mostra para os números na semana `rotulo` com `dias` fechados (o `faixa_da_semana` do Pro):
// {faixa, proxima, metas, faltam ({critério: quanto falta}, só os abaixo da meta da próxima), atingidos, total,
// limitada_pela_banda, dias, sem_regua, primeiro_dia, sem_faixa, motivo}. Sem régua, sem faixa e sem meta (nada é
// inventado); no dia 0, sem faixa ("as faixas aparecem no sábado, às 17h"). `regua`: {faixas} ou a tabela {faixa:
// {critério: mínimo}}. "sem_faixa" (pro-62): true quando não há faixa para mostrar (sem régua, dia 0, sem os dias; o
// "motivo" diz qual); false quando houve conta, e aí "faixa" null é abaixo da Branca.
function faixaDaSemana(valores, regua, dias, rotulo, banda = "", primeiroDia = null) {
  const out = {faixa: null, proxima: null, metas: {}, faltam: {}, atingidos: 0, total: 0, limitada_pela_banda: false,
    dias, sem_regua: false, primeiro_dia: false, sem_faixa: true, motivo: ""};
  if (dias === null || dias === undefined) return {...out, dias: null, motivo: "sem os dias da semana"};
  if (!regua) return {...out, sem_regua: true, motivo: MOTIVO_SEM_REGUA};
  if (primeiroDia === null) primeiroDia = dias === 0;
  if (primeiroDia) return {...out, primeiro_dia: true, motivo: MOTIVO_PRIMEIRO_DIA};
  const v = valoresDosFatores(valores);
  const c = classificarFaixa(v, regua.faixas || regua, dias, banda, rotulo);
  if (!c) return {...out, sem_regua: true, motivo: MOTIVO_SEM_REGUA};
  const faltam = c.proxima ? Object.fromEntries(Object.entries(c.metas).filter(([m, meta]) => v[m] < meta)
    .map(([m, meta]) => [m, limpo(meta - v[m])])) : {};
  return {...out, faixa: c.atual, proxima: c.proxima, metas: c.metas, faltam, atingidos: c.atingidos, total: c.total,
    limitada_pela_banda: c.limitadaPelaBanda, pelos_minimos: c.pelosMinimos, sem_faixa: false};
}

// A faixa dos números lidos no TeamZone, desenhada com o relógio de AGORA (o `faixa_do_oficial` do Pro): na semana em
// andamento, os dias fechados de agora; na que já fechou, 7. "fechando": de sexta 17h a sábado 17h (o TeamZone ainda
// relê a semana); "fechada": depois do corte de sábado 17h. A faixa lida (`lido`) só confere o leitor.
function faixaDoOficial(oficial, regua, agora, banda = "") {
  const semana = String((oficial || {}).semana || "");
  const fechaEm = diaValido((oficial || {}).fecha_em) ? oficial.fecha_em : sextaDoRotulo(semana);
  const t = instante(agora);
  if (t === null || !fechaEm) return {...faixaDaSemana({}, null, null, semana), semana, fecha_em: fechaEm, fechada: false, fechando: false};
  const emAndamento = semana === semanaDoPrograma(t).rotulo;
  const dias = emAndamento ? diasFechados(fechaEm, t) : 7;
  const fechada = !emAndamento && t >= corteDaSemana(fechaEm);
  const out = faixaDaSemana(oficial.valores || {}, regua, dias, semana, banda, !fechada && dias === 0);
  return {...out, semana, fecha_em: fechaEm, fechada, fechando: !emAndamento && !fechada};
}
// Confere o leitor da página do TeamZone: a faixa recalculada com os números e os dias da leitura tem de dar a lida.
function conferirLeitura(oficial, regua, banda = "") {
  const lido = oficial && oficial.lido && typeof oficial.lido === "object" ? oficial.lido : null;
  if (!lido || !finito(lido.dias_na_leitura)) return {ok: false, motivo: "a leitura não trouxe a faixa nem os dias"};
  const f = faixaDaSemana(oficial.valores || {}, regua, Math.trunc(lido.dias_na_leitura), String(oficial.semana || ""), banda);
  const erros = [];
  if (f.faixa !== (lido.faixa ?? null)) erros.push(`faixa ${f.faixa} × lida ${lido.faixa}`);
  if ("proxima" in lido && f.proxima !== lido.proxima) erros.push(`próxima ${f.proxima} × lida ${lido.proxima}`);
  for (const [m, n] of Object.entries(lido.faltam || {})) if (f.faltam[m] !== n) erros.push(`faltam ${m} ${f.faltam[m]} × lidas ${n}`);
  return {ok: !erros.length, motivo: erros.join("; ")};
}

// O farol de cada critério, como no TeamZone: verde bateu; amarelo, ao menos 70% da meta; vermelho, abaixo.
function farol(valor, meta) {
  if (valor === undefined || valor === null || !finito(valor)) return "neutro";
  if (meta === undefined || !finito(meta)) return "neutro";
  return valor >= meta ? "ok" : valor >= meta * 0.7 ? "quase" : "longe";
}

// ---- a régua da semana (regua-painel.ts) --------------------------------------------------------------------------
// As linhas do painel ([{metrica, minimos: {faixa: número ou null}}]) viram a régua, sem arredondar nem recalcular (o
// `reguaDasLinhasDoPainel`). Recusa (lança Error) o que não dá para ler sem adivinhar: critério faltando, repetido ou de
// fora, faixa faltando ou de fora, valor que não é número ≥ 0, Preta vazia, célula vazia acima de uma cheia, escada que
// desce e organização acima de 100. {semana, versao, fonte, faixas: {faixa: {critério: mínimo}}, branca, preta}.
function reguaDasLinhas(semana, versao, fonte, linhas) {
  const falha = motivo => Object.assign(new Error(`régua do painel da ${semana} recusada: ${motivo}`), {recusada: true});
  if (typeof semana !== "string" || !/^\d{4}-W\d{2}$/.test(semana)) throw falha("semana inválida");
  if (typeof versao !== "string" || !versao.trim() || versao.length > 93) throw falha("versão do painel ausente ou longa demais (até 93 caracteres)");
  if (typeof fonte !== "string" || !fonte.trim()) throw falha("fonte ausente");
  if (!Array.isArray(linhas) || !linhas.every(x => x && typeof x === "object")) throw falha("linhas inválidas");
  const metricas = linhas.map(x => String(x.metrica));
  if (JSON.stringify([...metricas].sort()) !== JSON.stringify([...METRICAS_TIME].sort()))
    throw falha(`os critérios precisam ser exatamente os 10 do TeamZone (veio: ${metricas.join(", ")})`);
  const faixas = Object.fromEntries(FAIXAS_TIME.map(f => [f, {}])), branca = {}, preta = {};
  for (const m of METRICAS_TIME) {
    const minimos = linhas.find(x => x.metrica === m).minimos;
    if (!minimos || typeof minimos !== "object" || JSON.stringify(Object.keys(minimos).sort()) !== JSON.stringify([...FAIXAS_TIME].sort()))
      throw falha(`${m}: as faixas precisam ser exatamente ${FAIXAS_TIME.join(", ")}`);
    let anterior = null;
    for (const f of FAIXAS_TIME) {
      const v = minimos[f];
      if (v === null || v === undefined) {
        if (anterior !== null) throw falha(`${m}: ${f} vazia acima de uma faixa com mínimo`);
        continue;
      }
      if (!finito(v) || v < 0) throw falha(`${m}: ${f} não é um número ≥ 0`);
      if (m === "organizacao" && v > 100) throw falha(`${m}: ${f} acima de 100`);
      if (anterior !== null && v < anterior) throw falha(`${m}: ${f} (${v}) abaixo da faixa anterior (${anterior})`);
      faixas[f][m] = v;
      anterior = v;
    }
    if (minimos.Preta === null || minimos.Preta === undefined) throw falha(`${m}: a Preta não tem mínimo`);
    branca[m] = minimos.Branca ?? 0;
    preta[m] = minimos.Preta;
  }
  return {semana, versao, fonte, faixas, branca, preta};
}
// O inverso: a tabela {faixa: {critério: mínimo}} (a régua lida na página, no oficial e no conjunto) vira as linhas.
const linhasDasFaixas = faixas => METRICAS_TIME.map(m =>
  ({metrica: m, minimos: Object.fromEntries(FAIXAS_TIME.map(f => [f, ((faixas || {})[f] || {})[m] ?? null]))}));

// As réguas do painel transcritas no TeamZone (regua-painel.ts, LINHAS_DO_PAINEL; os fixtures uso-ia-painel-regua-W45 e
// -W46): a régua embutida, para quando o PC não manda a da semana. Validadas ao carregar: uma transcrição errada quebra
// o teste. Semana nova entra aqui só copiando a tabela do painel, nunca por fórmula.
const LINHAS_DO_PAINEL = {
  "2026-W45": {versao: "auto-2026-W45-oficial-w44-20261102", fonte: "painel:/api/farol (semana fechada) lida em 2026-11-09T12:19:31-03:00",
    tabela: {sessoes_iniciadas: [21, 40, 76, 144, 272, 514, 974], mensagens: [200, 355, 628, 1112, 1970, 3489, 6180],
      tarefas_operacionais: [null, 1, 4, 12, 38, 128, 428], tarefas_internas: [null, 1, 5, 17, 69, 281, 1150],
      skills_novas: [null, 1, 2, 3, 5, 8, 13], linhas_sistema: [null, 1, 12, 137, 1601, 18723, 219000],
      linhas_agente: [null, 1, 10, 87, 802, 7441, 69100], cron_jobs: [null, 1, 2, 4, 8, 16, 30],
      workflows: [null, 1, 4, 13, 46, 165, 589], organizacao: [61, 67, 73, 78, 84, 90, 95]}},
  "2026-W46": {versao: "auto-2026-W46", fonte: "painel:/api/regua lida em 2026-11-09T12:19:25-03:00",
    tabela: {sessoes_iniciadas: [21, 36, 61, 103, 174, 295, 500], mensagens: [200, 326, 532, 867, 1412, 2301, 3750],
      tarefas_operacionais: [null, 1, 4, 12, 38, 128, 428], tarefas_internas: [null, 1, 5, 17, 69, 281, 1150],
      skills_novas: [null, 1, 2, 3, 5, 8, 13], linhas_sistema: [null, 1, 12, 137, 1601, 18723, 219000],
      linhas_agente: [null, 1, 10, 87, 802, 7441, 69100], cron_jobs: [null, 1, 2, 4, 8, 16, 30],
      workflows: [null, 1, 4, 13, 46, 165, 589], organizacao: [61, 67, 73, 78, 84, 90, 95]}},
};
const REGUAS_DO_PAINEL = Object.freeze(Object.fromEntries(Object.entries(LINHAS_DO_PAINEL).map(([semana, r]) =>
  [semana, reguaDasLinhas(semana, r.versao, r.fonte, METRICAS_TIME.map(m =>
    ({metrica: m, minimos: Object.fromEntries(FAIXAS_TIME.map((f, i) => [f, r.tabela[m][i]]))})))])));

// Os mínimos de cada faixa pela fórmula sobre o P100 da régua do coletor (o `faixasDaRegua` do faixas.ts): só para as
// semanas de antes da W45, que não têm a tabela do painel, e sempre com o aviso "sem a régua do painel".
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
const iguais = (a, b) => JSON.stringify(linhasDasFaixas(a)) === JSON.stringify(linhasDasFaixas(b));

// A régua da semana, nesta ordem (o `regua_da_semana` do Pro, a seção 2 do PLANO):
//  1. a lida na página do TeamZone (`oficial` da mesma semana), que manda: se a página diz "a régua desta semana ainda
//     não foi gravada" (`sem_regua`), vale "sem régua", mesmo com o código do TeamZone já tendo a régua;
//  2. a que veio no conjunto do Pro (`conjunto.regua`: a do gh ou a que vai com o Seaninho, com a fonte dela), a do gh
//     (`gh`: {fonte, reguas: {semana: tabela}}, para os casos) e a embutida aqui (W45 e W46), com o selo do código;
//  3. só nas semanas de antes da W45, a fórmula sobre o P100 da régua do coletor (`coletor`), com o aviso "sem a régua
//     do painel". Da W45 em diante a régua do coletor nunca entra.
// {regua: {semana, versao, fonte, faixas, ...} | null, fonte, selo, sem_regua, avisos: [texto]}.
function reguaDaSemana(semana, {oficial = null, conjunto = null, gh = null, coletor = null} = {}) {
  const avisos = [];
  let pagina = null, paginaSemRegua = false;
  if (oficial && typeof oficial === "object" && oficial.semana === semana && !oficial.erro) {
    if (oficial.sem_regua === true) paginaSemRegua = true;
    else if (oficial.regua && typeof oficial.regua === "object" && Object.keys(oficial.regua).length) {
      try {
        pagina = reguaDasLinhas(semana, String(oficial.regua_versao || `pagina-${semana}`), "pagina:" + String(oficial.fonte || "teamzone"),
          linhasDasFaixas(oficial.regua));
      } catch (e) { avisos.push(`a régua lida na página foi recusada (${e.message}): vale a do código do TeamZone`); }
    }
  }
  let codigo = null, origem = null;
  const doConjunto = conjunto && conjunto.semana === semana && conjunto.regua && conjunto.regua.faixas;
  if (doConjunto) {
    try {
      const c = conjunto.regua;
      codigo = reguaDasLinhas(semana, String(c.versao || `conjunto-${semana}`), String(c.fonte || "conjunto"), linhasDasFaixas(c.faixas));
      origem = String(c.fonte || "conjunto");
    } catch (e) { avisos.push(`a régua que veio do PC foi recusada (${e.message})`); }
  }
  if (!codigo && gh && gh.reguas && gh.reguas[semana]) {
    try {
      codigo = reguaDasLinhas(semana, `gh-${semana}`, String(gh.fonte || "gh"), linhasDasFaixas(gh.reguas[semana]));
      origem = String(gh.fonte || "gh");
    } catch (e) { avisos.push(`a régua do gh foi recusada (${e.message})`); }
  }
  if (!codigo && REGUAS_DO_PAINEL[semana]) { codigo = REGUAS_DO_PAINEL[semana]; origem = "asset"; }
  const curta = String(semana).split("-W").pop();
  // a régua do conjunto lida na página pelo Pro é a da página (o selo diz isso), mesmo sem o oficial aqui
  const selo = o => /^pagina/.test(String(o)) ? SELO_PAGINA : SELO_CODIGO;
  if (paginaSemRegua) {
    if (codigo) avisos.push(`o código do TeamZone já tem a régua da semana ${curta}, mas a página ainda não: vale a página`);
    return {regua: null, fonte: "pagina", selo: SELO_PAGINA, sem_regua: true, avisos};
  }
  if (pagina) {
    if (codigo && !iguais(codigo.faixas, pagina.faixas)) avisos.push(`a régua da página difere da do código do TeamZone (${origem}): vale a da página`);
    // a página não escreve a versão: a do conjunto da semana, ou a do código quando a tabela é a mesma
    else if (!oficial.regua_versao && codigo) pagina.versao = codigo.versao;
    if (!oficial.regua_versao && doConjunto && conjunto.regua.versao) pagina.versao = String(conjunto.regua.versao);
    return {regua: {...pagina, origem: "pagina"}, fonte: "pagina", selo: SELO_PAGINA, sem_regua: false, avisos};
  }
  if (codigo) return {regua: {...codigo, origem}, fonte: origem, selo: selo(origem), sem_regua: false, avisos};
  if (String(semana) < PRIMEIRA_SEMANA_DA_TABELA) {
    const faixas = faixasDaRegua(coletor);
    if (faixas) return {regua: {semana, versao: String(coletor.versao), fonte: "coletor", faixas}, fonte: "coletor",
      selo: AVISO_SEM_PAINEL, sem_regua: false, avisos: [`${AVISO_SEM_PAINEL}: os mínimos saem da fórmula sobre o P100 da régua do coletor`]};
  }
  return {regua: null, fonte: null, selo: "", sem_regua: true, avisos};
}

// 1 casa, empate para o par com folga de 1e-9 (o `umaCasa` do coletor.ts): 0,35 dá 0,4 e 98,25 dá 98,2. Não é o
// `round` do Python (0,35 dá 0,3) nem o Math.round puro.
function umaCasa(x) {
  const y = x * 10, piso = Math.floor(y), resto = y - piso;
  const inteiro = Math.abs(resto - 0.5) < 1e-9 ? (piso % 2 === 0 ? piso : piso + 1) : Math.round(y);
  return inteiro / 10;
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

const Ninja = {FAIXAS, ORDEM_FAIXAS, FAIXAS_TIME, METRICAS_TIME, WHITE, PORTAO_DA_BANDA_ATE, PRIMEIRA_SEMANA_DA_TABELA,
  MOTIVO_PRIMEIRO_DIA, MOTIVO_SEM_REGUA, AVISO_SEM_PAINEL, SELO_PAGINA, SELO_CODIGO, REGUAS_DO_PAINEL,
  faixaDe, rotulo, instante, emSP, num, limpo, somarDias, rotuloIso, semanaDoPrograma, sextaDoRotulo, semanaDaData, janelaDoMomento,
  fimDaSemana, corteDaSemana, diasFechados, metaToDate, tetoDaBanda, temPortaoDaBanda, tetoDaSemana, classificarFaixa,
  valoresDosFatores, faixaDaSemana, faixaDoOficial, conferirLeitura, farol, reguaDasLinhas, linhasDasFaixas, faixasDaRegua,
  reguaDaSemana, umaCasa, subiu, guardar, svg, palco, vigiar, estado, DUR};
if (typeof module !== "undefined" && module.exports) module.exports = Ninja;
else raiz.Ninja = Ninja;
})(typeof window !== "undefined" ? window : globalThis);
