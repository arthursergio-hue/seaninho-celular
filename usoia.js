// Seaninho no celular: o uso de IA da semana (0.8.7; v24, 12/11: igual ao TeamZone). A manchete é a do TeamZone: o
// `uso_ia_conjunto` que o Seaninho Pro publica pelo agente (o oficial lido no TeamZone, a régua da semana e a "próxima
// atualização", que soma ao oficial o que ainda não entrou), recalculado com os dias fechados de AGORA, como o TeamZone
// faz a cada abertura. Sem o conjunto, o plano B: os PCs somados como o TeamZone soma (coletor.ts: volumes linha a linha;
// skills e crons pelos números diários, sem juntar nomes; o workflow 1 vez por dia por roteiro; a sessão que aparece nos
// dois PCs conta uma vez; a Organização pela média das máquinas do último dia com sessão, com o `umaCasa`) e a faixa pela
// regra do ninja.js. A banda P0–P100 do coletor saiu da manchete (era outra escala, que não existe no TeamZone). Sem
// tela (testado no Node: test_usoia.cjs, com os casos do faixa_casos.json).
(function (raiz) {
"use strict";

// a regra da faixa (ninja.js): no Node vem pelo require; no navegador, o window.Ninja (carregado na mesma página)
const Regra = typeof require === "function" && typeof module !== "undefined" ? require("./ninja.js") : null;
const N = () => Regra || raiz.Ninja;

const ORDEM = ["tokens_saida", "sessoes_iniciadas", "mensagens", "tarefas_operacionais", "tarefas_internas",
  "skills_novas", "linhas_sistema", "linhas_agente", "cron_jobs", "workflows", "organizacao"];
const CRITERIOS = ORDEM.slice(1);   // os 10 do TeamZone (os tokens nunca entram na faixa)
const ROTULO = {tokens_saida: "Tokens de saída", sessoes_iniciadas: "Sessões", mensagens: "Mensagens",
  tarefas_operacionais: "Tarefas operacionais", tarefas_internas: "Tarefas internas", skills_novas: "Skills novas",
  linhas_sistema: "Código de sistemas", linhas_agente: "Código de agentes", cron_jobs: "Cron jobs",
  workflows: "Workflows", organizacao: "Organização"};
// Como a falta se lê numa frase ("faltam 88 mensagens"): [singular, plural].
const UNIDADE = {sessoes_iniciadas: ["sessão", "sessões"], mensagens: ["mensagem", "mensagens"],
  tarefas_operacionais: ["tarefa operacional", "tarefas operacionais"], tarefas_internas: ["tarefa interna", "tarefas internas"],
  skills_novas: ["skill nova", "skills novas"], linhas_sistema: ["linha de código de sistemas", "linhas de código de sistemas"],
  linhas_agente: ["linha de código de agentes", "linhas de código de agentes"], cron_jobs: ["cron job", "cron jobs"],
  workflows: ["workflow", "workflows"], organizacao: ["ponto de Organização", "pontos de Organização"]};
const ESTIMADAS = ["tarefas_operacionais", "tarefas_internas"];
const ESTADOS = ["organizacao"];             // um estado, não um volume: não tem ritmo por dia
const VOLUMES = CRITERIOS.filter(m => m !== "organizacao");
const DEDUP_METRICAS = ["tokens_saida", "sessoes_iniciadas", "mensagens", "linhas_sistema", "linhas_agente"];   // coletor
const DIAS_BANDAS = ["P75", "P100"], DIAS_MIN = 4;
const BANDAS = ["P0", "P25", "P50", "P75", "P100"];
// A evolução diária (o que o coletor guarda por dia): "linhas" junta o código da sessão e o dos subagentes.
const DIARIAS = [["mensagens", "Mensagens"], ["sessoes_iniciadas", "Sessões"], ["tokens_saida", "Tokens"],
  ["workflows", "Workflows"], ["linhas", "Código"]];
// Quantas máquinas o TeamZone conta quando ainda não chegou leitura nenhuma dele (as 3 do Arthur em 11/11: os dois
// PCs e uma identidade a mais do coletor; PLANO, seção 1, item 13). A leitura do TeamZone, quando vem, manda.
const MAQUINAS_PADRAO = 3;

const VIRADA_MS = 24 * 3600 * 1000;   // nas primeiras 24 h da semana nova, a que fechou aparece ao lado (0.8.8)
const num = v => typeof v === "number" && isFinite(v);
const arred1 = v => Math.round(v * 10) / 10;

// ---- a soma como o TeamZone (coletor.ts) e como o coletor desconta (o `uso_ia_faixa.py` do Pro, linha a linha) ---
const maquina = linha => String((linha && linha.pc) || "").trim().toLowerCase().replace(/\.local$/, "");
// Um inteiro do jeito do `int()` do Python (número ou texto de inteiro); o resto, null (a cópia fica de fora).
function inteiro(v) {
  if (num(v)) return Math.trunc(v);
  if (typeof v === "string" && /^\s*[-+]?\d+\s*$/.test(v)) return parseInt(v, 10);
  return null;
}

// A organização da semana como o `agregar` do coletor.ts: a média, com o `umaCasa`, das máquinas do último dia que
// tiveram sessão na semana (todas as do último dia, se nenhuma teve); a linha sem nota conta 0. `linhas`: [{pc, dia,
// valores}]; `semanaInteira`, se vier, é onde se procura quem teve sessão. Sem linha: null.
function organizacaoComoTeamzone(linhas, semanaInteira = null) {
  const R = N(), ls = (linhas || []).filter(x => x && typeof x === "object" && /^\d{4}-\d{2}-\d{2}$/.test(String(x.dia)));
  if (!ls.length) return null;
  const ultimo = ls.map(x => x.dia).sort().pop();
  const doUltimo = ls.filter(x => x.dia === ultimo);
  const comSessao = new Set((semanaInteira || ls).filter(x => x && R.num((x.valores || {}).sessoes_iniciadas) > 0).map(maquina));
  const usadas = doUltimo.filter(x => comSessao.has(maquina(x)));
  const notas = (usadas.length ? usadas : doUltimo).map(x => R.num((x.valores || {}).organizacao));
  return R.umaCasa(notas.reduce((a, b) => a + b, 0) / notas.length);
}

// A sessão que aparece em mais de um PC conta uma vez (o `descontar_repetidas` do coletor 1.4.47, sem mudança): por id
// fica a cópia com mais pedidos; empate, mais tokens, depois mais mensagens, depois o nome menor do PC, depois a
// primeira lista. `copias`: o `por_sessao` de cada PC ({id curto: {p, v: {DEDUP_METRICAS}}}); `maquinas`: os nomes.
// {total: {métrica: o que sai}, n: cópias que saem, porLista: [{métrica: o que sai daquele PC}]}.
function descontarRepetidas(copias, maquinas = []) {
  const vistas = new Map();
  copias.forEach((lista, i) => {
    for (const [sid, x] of Object.entries(lista || {})) {
      const p = inteiro(x && x.p);
      if (p === null || !x.v || typeof x.v !== "object") continue;
      const v = {};
      let ok = true;
      for (const m of DEDUP_METRICAS) { const n = inteiro(x.v[m] || 0); if (n === null) { ok = false; break; } v[m] = n; }
      if (!ok) continue;
      if (!vistas.has(sid)) vistas.set(sid, []);
      vistas.get(sid).push([-p, -v.tokens_saida, -v.mensagens, String(maquinas[i] ?? ""), i, v]);
    }
  });
  const total = Object.fromEntries(DEDUP_METRICAS.map(m => [m, 0]));
  const porLista = copias.map(() => Object.fromEntries(DEDUP_METRICAS.map(m => [m, 0])));
  let n = 0;
  const cmp = (a, b) => { for (let k = 0; k < 5; k++) if (a[k] !== b[k]) return a[k] < b[k] ? -1 : 1; return 0; };
  for (const lst of vistas.values()) {
    if (lst.length < 2) continue;
    lst.sort(cmp);
    for (const t of lst.slice(1)) {
      const i = t[4], v = t[5];
      n++;
      for (const m of DEDUP_METRICAS) { total[m] += v[m]; porLista[i][m] += v[m]; }
    }
  }
  return {total, n, porLista};
}
// As tarefas estimadas do PC que perde a cópia ficam com a parte das mensagens que sobrou (o coletor, sem mudança).
function tarefasSemRepetidas(tarefas, mensagens, mensagensRepetidas) {
  if (!num(tarefas) || !num(mensagens) || mensagens <= 0 || mensagensRepetidas <= 0) return tarefas;
  return Math.floor(tarefas * Math.max(0, mensagens - mensagensRepetidas) / mensagens + 0.5);
}
// As linhas de uma janela diária (um PC por linha) somadas como o TeamZone soma e como o coletor desconta no envio.
// {valores: {volume: soma}, sessoes_repetidas: n, sem_lista: [os PCs sem o por_sessao num dia em que outro PC o traz:
// ali a sessão repetida não dá para descontar]} (o `somar_dia` do Pro).
function somarDia(linhas) {
  const R = N(), valores = Object.fromEntries(VOLUMES.map(m => [m, 0]));
  for (const x of linhas) for (const m of VOLUMES) valores[m] += R.num((x.valores || {})[m]);
  const comLista = linhas.filter(x => x.por_sessao && typeof x.por_sessao === "object" && !Array.isArray(x.por_sessao));
  const varios = new Set(linhas.map(maquina)).size > 1 && comLista.length > 0;
  const semLista = varios ? [...new Set(linhas.filter(x => !comLista.includes(x)).map(x => String(x.pc || "")))].sort() : [];
  let n = 0;
  if (comLista.length > 1) {
    const d = descontarRepetidas(comLista.map(x => x.por_sessao), comLista.map(x => String(x.pc || "")));
    n = d.n;
    for (const m of DEDUP_METRICAS) if (m in valores) valores[m] = Math.max(0, valores[m] - d.total[m]);
    comLista.forEach((x, i) => {
      const v = x.valores || {};
      for (const m of ESTIMADAS) {
        const antes = R.num(v[m]);
        valores[m] -= antes - tarefasSemRepetidas(antes, R.num(v.mensagens), d.porLista[i].mensagens);
      }
    });
  }
  return {valores, sessoes_repetidas: n, sem_lista: semLista};
}

const oficialValido = (o, semana) => !!(o && typeof o === "object" && o.semana === semana && !o.erro && o.valores
  && typeof o.valores === "object" && N().instante(o.atualizado_em) !== null);

// ---- a situação de cada janela e a importação de hoje (o `situacao` e o `importacao_de_hoje` do Pro, pro-62) --------
const ENVIO_ATE_MS = 40 * 60000;       // o coletor manda a janela que fechou às 17h por volta das 17h24: às 17h40 já foi
const IMPORTACAO_ATE_MS = 45 * 60000;  // o TeamZone importa aos :35; até 17h45 a importação de hoje pode não ter rodado
const fechamentoDaJanela = dia => Date.parse(`${dia}T17:00:00-03:00`);
// O nome curto do PC nos avisos (o `nome_curto` do Pro): WIN-EAD6OD66GE7 vira WIN; SEAZONE192 fica igual.
const nomeCurto = pc => { const n = String(pc || ""), c = n.split("-")[0]; return c.length >= 3 ? c : n; };
const diaBr = dia => /^\d{4}-\d{2}-\d{2}$/.test(String(dia)) ? `${dia.slice(8, 10)}/${dia.slice(5, 7)}` : String(dia);
const horaSP = ms => { const s = N().emSP(ms); return `${String(s.hora).padStart(2, "0")}h${String(s.minuto).padStart(2, "0")}`; };

// Onde a linha está em relação ao oficial: "oficial" (o TeamZone já tem), "fora" (ainda não tem) ou "incerta" (pode já
// ter: fica fora da soma, com aviso). "oficial": o PRIMEIRO envio (`enviado_em`; o reenvio não conta) até a "Última
// atualização de uso", ou quem chama disse (`no_oficial`). "incerta": a janela fechada sem envio numa medida
// (`medido_em`) de antes do envio normal (fechamento + 40 min), com o PC visto depois do fechamento (ou sem saber quando)
// e a "Última atualização" depois do fechamento: o coletor de lá pode ter mandado depois da medida, e o TeamZone já
// importado (o cético viu 1.163 no lugar de 1.043 contando a janela duas vezes).
function situacao(x, atualizado, aberta) {
  const R = N();
  if (atualizado === null || x.dia === aberta) return "fora";
  if (typeof x.no_oficial === "boolean") return x.no_oficial ? "oficial" : "fora";
  const enviado = R.instante(x.enviado_em);
  if (enviado !== null) return enviado <= atualizado ? "oficial" : "fora";
  const medido = R.instante(x.medido_em);
  if (medido === null) return "fora";
  const fechou = fechamentoDaJanela(x.dia), visto = R.instante(x.visto_em);
  return medido < fechou + ENVIO_ATE_MS && atualizado >= fechou && (visto === null || visto >= fechou) ? "incerta" : "fora";
}
// A importação de hoje: das 17h00 às 17h45, enquanto o oficial não tem nada depois das 17h de hoje, a próxima importação
// é a das 17h35, só com as janelas fechadas e com os dias de agora; a janela que acabou de abrir fica para a de amanhã
// (o cético viu "faltam 451" com 7 dias no lugar de "faltam 250" com 6, às 17h10).
function importacaoDeHoje(t, aberta, atualizado) {
  if (!aberta) return false;
  const fechou = fechamentoDaJanela(N().somarDias(aberta, -1));
  return fechou <= t && t < fechou + IMPORTACAO_ATE_MS && (atualizado === null || atualizado < fechou);
}
// As linhas da semana, uma por (PC, dia): a mesma duas vezes vale a última.
function linhasDaSemana(linhas, semana) {
  const R = N(), unicas = new Map();
  for (const x of linhas || []) {
    if (!x || typeof x !== "object" || !/^\d{4}-\d{2}-\d{2}$/.test(String(x.dia)) || R.semanaDaData(x.dia).rotulo !== semana) continue;
    unicas.set(`${maquina(x)}|${x.dia}`, x);
  }
  return [...unicas.values()];
}
// As linhas que entram na média da organização, como o TeamZone vai contar (o `_linhas_da_media` do Pro): a nota da
// linha; sem ela, a nota que o coletor manda com as linhas daquele PC (`nota_do_pc`); o PC sem nota nenhuma entra com 0,
// como o `num` do TeamZone (antes a página tirava a linha sem nota da média: 99 no lugar de 49,5). {naMedia: [[linha,
// linha com a nota que conta]], semNota: [PCs]}.
function linhasDaMedia(todas) {
  const nota = x => { const v = (x.valores || {}).organizacao; return num(v) ? v : num(x.nota_do_pc) ? x.nota_do_pc : null; };
  const comNota = new Set(todas.filter(x => nota(x) !== null).map(maquina));
  const semNota = [...new Set(todas.filter(x => !comNota.has(maquina(x))).map(x => String(x.pc || "")))].sort();
  const naMedia = [];
  for (const x of todas) {
    const n = nota(x);
    if (n !== null) naMedia.push([x, num((x.valores || {}).organizacao) ? x : {...x, valores: {...(x.valores || {}), organizacao: n}}]);
    else if (!comNota.has(maquina(x))) naMedia.push([x, x]);   // conta 0
  }
  return {naMedia, semNota};
}

// A camada "próxima atualização" (o `somar_como_teamzone` do Pro, pro-62): o que o TeamZone vai mostrar na próxima
// importação se a pessoa parar agora. Base = o oficial, mais o que ainda não entrou nele, por PC (`situacao`): as janelas
// fechadas que o TeamZone ainda não tem (sem envio, ou com o PRIMEIRO envio depois da "Última atualização de uso") e a
// janela aberta; a janela "incerta" fica fora, com aviso. Somadas como o TeamZone soma (`somarDia`, a sessão repetida
// descontada contra as linhas do mesmo dia). Sem oficial da semana, a soma inteira das linhas ("base": "estimativa").
// Os dias: enquanto a semana está aberta, os fechados + 1 (é assim que o TeamZone vai contar quando a janela fechar),
// menos na importação de hoje (`importacaoDeHoje`: os dias de agora, sem a janela recém-aberta). Com 0 dias, sem faixa.
// `linhas`: [{pc, dia, valores, enviado_em, por_sessao, no_oficial, medido_em, visto_em, nota_do_pc}]. Devolve o
// formato do `faixaDaSemana`, mais {base, semana, fecha_em, dias_agora, aberta, importacao_de_hoje, valores,
// fora_do_oficial: {janelas, por_pc, valores, incertas}, sessoes_repetidas, pcs, sem_nota, avisos}.
function somarComoTeamzone(oficial, linhas, agora, regua = null, semana = null, banda = "") {
  const R = N(), t = R.instante(agora);
  if (t === null) throw new Error(`momento inválido: ${agora}`);
  if (!semana) semana = (oficial && oficial.semana) || R.semanaDoPrograma(t).rotulo;
  const fechaEm = R.sextaDoRotulo(semana);
  if (!fechaEm) throw new Error(`semana inválida: ${semana}`);
  const avisos = [];
  const base = oficialValido(oficial, semana) ? "oficial" : "estimativa";
  if (oficial && oficial.semana === semana && base === "estimativa")
    avisos.push("a leitura do TeamZone desta semana não serve (erro ou sem a hora da atualização): estimativa");
  const atualizado = base === "oficial" ? R.instante(oficial.atualizado_em) : null;
  const aberta = t < R.fimDaSemana(fechaEm) ? R.janelaDoMomento(t) : null;
  const diasAgora = R.diasFechados(fechaEm, t);
  const hoje = importacaoDeHoje(t, aberta, atualizado);

  const todas = linhasDaSemana(linhas, semana);
  const sit = new Map(todas.map(x => [x, situacao(x, atualizado, aberta)]));
  if (hoje) for (const x of todas) if (x.dia === aberta) sit.set(x, "depois");
  const contaNa = x => sit.get(x) === "oficial" || sit.get(x) === "fora";
  const ordem = (a, b) => a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : maquina(a) < maquina(b) ? -1 : maquina(a) > maquina(b) ? 1 : 0;
  const fora = todas.filter(x => sit.get(x) === "fora");
  const incertas = {};
  for (const x of todas.slice().sort(ordem)) {
    if (sit.get(x) !== "incerta") continue;
    (incertas[String(x.pc || "")] = incertas[String(x.pc || "")] || []).push(x.dia);
    const medido = R.instante(x.medido_em);
    avisos.push(`${nomeCurto(x.pc)}: a janela de ${diaBr(x.dia)} pode já estar no TeamZone (a medida de lá é das `
      + `${medido === null ? "?" : horaSP(medido)}, de antes do envio): fica fora da soma até a próxima medida`);
  }
  const porDia = {};
  for (const x of todas) if (contaNa(x)) (porDia[x.dia] = porDia[x.dia] || []).push(x);
  const delta = Object.fromEntries(VOLUMES.map(m => [m, 0]));
  let repetidas = 0;
  const semLista = new Set();
  for (const dia of [...new Set(fora.map(x => x.dia))].sort()) {
    const depois = somarDia(porDia[dia]), antes = somarDia(porDia[dia].filter(x => sit.get(x) === "oficial"));
    repetidas += depois.sessoes_repetidas - antes.sessoes_repetidas;
    for (const p of depois.sem_lista) semLista.add(p);
    for (const m of VOLUMES) delta[m] += depois.valores[m] - antes.valores[m];
  }
  if (semLista.size) avisos.push("sessões repetidas entre os computadores não descontadas: falta o Seaninho novo em "
    + [...semLista].sort().map(nomeCurto).join(", "));
  // a organização: a linha sem nota leva a do PC; o PC sem nota nenhuma entra com 0, como o TeamZone conta; sem linha
  // nova na média, a do oficial
  const contam = todas.filter(contaNa);
  const {naMedia, semNota} = linhasDaMedia(contam);
  for (const pc of semNota) avisos.push(`${nomeCurto(pc)} sem nota de organização: o TeamZone conta 0`);
  let valores, organizacao;
  if (base === "oficial") {
    const of = R.valoresDosFatores(oficial.valores);
    valores = Object.fromEntries(VOLUMES.map(m => [m, R.limpo(of[m] + delta[m])]));
    organizacao = naMedia.some(([x]) => sit.get(x) === "fora") ? organizacaoComoTeamzone(naMedia.map(([, y]) => y), contam) : of.organizacao;
  } else {
    valores = Object.fromEntries(VOLUMES.map(m => [m, R.limpo(delta[m])]));
    organizacao = organizacaoComoTeamzone(naMedia.map(([, y]) => y), contam);
  }
  valores.organizacao = organizacao ?? 0;
  const dias = aberta && !hoje ? Math.min(7, diasAgora + 1) : diasAgora;
  const faixa = R.faixaDaSemana(valores, regua, dias, semana, banda, dias === 0);
  const porPc = {};
  for (const x of fora.slice().sort(ordem)) (porPc[String(x.pc || "")] = porPc[String(x.pc || "")] || []).push(x.dia);
  const janelas = [...new Set(fora.map(x => x.dia))].sort().map(d => d === aberta ? `${d} aberta` : d);
  return {...faixa, base, semana, fecha_em: fechaEm, dias_agora: diasAgora, aberta, importacao_de_hoje: hoje, valores,
    fora_do_oficial: {janelas, por_pc: porPc, valores: Object.fromEntries(Object.entries(delta).filter(([, n]) => n).map(([m, n]) => [m, R.limpo(n)])), incertas},
    sessoes_repetidas: repetidas, pcs: [...new Set(todas.map(x => String(x.pc || "")))].sort(), sem_nota: semNota, avisos};
}

// ---- o plano B pelos PCs -----------------------------------------------------------------------------------------
// As linhas diárias de um PC (o agente 0.9.0.14, usoia.diario_para_o_celular, manda `janelas`: dia → valores da janela
// de 17h a 17h, com o `por_sessao` daquele dia dentro, e `enviados`: dia → {hora, primeiro, semana}, ou a hora solta do
// formato de antes: vale o PRIMEIRO envio, como no Pro; um valor que o medidor não leu vem null). Cada linha leva também a
// hora da medida do PC (`medido_em`, o `gerado`), quando ele foi visto (`visto_em`) e a nota de organização dele
// (`nota_do_pc`): é com elas que a janela fechada sem envio vira "incerta" e a linha sem nota entra na média. Sem as
// janelas: [].
function linhasDoPc(u) {
  if (!u || !u.janelas || typeof u.janelas !== "object") return [];
  const R = N(), env = u.enviados && typeof u.enviados === "object" ? u.enviados : {};
  const nota = u.valores && num(u.valores.organizacao) ? u.valores.organizacao : null;
  return Object.entries(u.janelas).filter(([d, v]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && v && typeof v === "object").map(([dia, v]) => {
    const e = env[dia], hora = e && typeof e === "object" ? e.primeiro || e.hora || e.em : e;
    const {por_sessao, ...valores} = v;
    const linha = {pc: u.pc, dia, valores, enviado_em: R.instante(hora) === null ? null : hora};
    if (por_sessao && typeof por_sessao === "object") linha.por_sessao = por_sessao;
    if (R.instante(u.gerado) !== null) linha.medido_em = R.instante(u.gerado);
    if (R.instante(u.visto) !== null) linha.visto_em = R.instante(u.visto);
    if (nota !== null) linha.nota_do_pc = nota;
    return linha;
  });
}
// Um contador diário do coletor (skills, crons e workflows por dia): {dia: n} ou {dia: [nomes]}, mais os
// "pendentes" do dia aberto à parte. A soma dos números, sem juntar nomes entre dias nem entre PCs (como o TeamZone).
function somaDiaria(d) {
  if (!d || typeof d !== "object") return null;
  let t = 0;
  for (const v of Object.values(d)) t += Array.isArray(v) ? new Set(v).size : num(v) ? v : 0;
  return t;
}

// As medidas que entram na conta: as da semana mais nova entre os PCs (um PC de outra semana fica de fora).
function daSemana(lista) {
  const boas = (lista || []).filter(u => u && u.valores && u.semana);
  const semana = boas.map(u => u.semana).sort().pop();
  return boas.filter(u => u.semana === semana);
}

// Soma dos PCs (medidas da MESMA semana), como o TeamZone soma: {valores, dias} ou null. Volumes somam; skills e crons
// pelos números diários de cada PC (`skills_dia`, `crons_dia`), sem juntar os nomes (a 0.8.7 juntava, e o TeamZone
// não junta: 26 × 14 skills em 11/11); o workflow, 1 vez por dia por roteiro (`wf_dia`), quando vem assim;
// Organização pela média das máquinas com sessão na semana, com o `umaCasa`.
function somar(lista) {
  const ok = (lista || []).filter(u => u && u.valores);
  if (!ok.length) return null;
  const valores = {};
  for (const m of ORDEM) {
    const nums = ok.map(u => u.valores[m]).filter(num);
    valores[m] = nums.length ? nums.reduce((a, b) => a + b, 0) : null;
  }
  const pelosDias = (m, campo) => {
    if (!ok.some(u => u[campo])) return;
    valores[m] = ok.reduce((t, u) => t + (somaDiaria(u[campo]) ?? (num(u.valores[m]) ? u.valores[m] : 0)), 0);
  };
  pelosDias("skills_novas", "skills_dia");
  pelosDias("cron_jobs", "crons_dia");
  pelosDias("workflows", "wf_dia");
  const comSessao = ok.filter(u => Number(u.valores.sessoes_iniciadas || 0) > 0);
  const orgs = (comSessao.length ? comSessao : ok).map(u => Number(u.valores.organizacao || 0));
  valores.organizacao = N().umaCasa(orgs.reduce((t, x) => t + x, 0) / orgs.length);
  const comDias = ok.filter(u => u.dias_tarefas && Object.keys(u.dias_tarefas).length);
  const dias = comDias.length ? Object.fromEntries(ESTIMADAS.map(m =>
    [m, [...new Set(comDias.flatMap(u => u.dias_tarefas[m] || []))].sort()])) : null;
  return {valores, dias};
}

// ---- o painel: a manchete, a "próxima atualização", a semana que fecha e quem entra na soma -------------------------
// Os PCs que um conjunto cobre: as chaves de `proxima_atualizacao.pcs` (ou `pcs`, se vier lista); sem isso, quem publicou.
function cobertos(c, publicou = "") {
  const pa = (c && c.proxima_atualizacao) || {};
  if (pa.pcs && typeof pa.pcs === "object" && !Array.isArray(pa.pcs) && Object.keys(pa.pcs).length) return Object.keys(pa.pcs);
  if (Array.isArray(c && c.pcs) && c.pcs.length) return c.pcs.map(String);
  return publicou ? [publicou] : [];
}
// A hora da medida mais velha do conjunto (o "medido_em mínimo"): o conjunto vale o que vale a medida mais velha dele.
function medidoMinimo(c) {
  const R = N(), pa = (c && c.proxima_atualizacao) || {};
  const ts = Object.values(pa.pcs && typeof pa.pcs === "object" ? pa.pcs : {}).map(p => R.instante(p && p.medido_em)).filter(x => x !== null);
  if (ts.length) return Math.min(...ts);
  return R.instante(pa.medido_em) ?? R.instante(c && c.gerado) ?? 0;
}
// Entre dois conjuntos (os dois PCs publicando), vale o que cobre mais PCs; no empate, o de medida mínima mais nova
// (e não o publicado por último, que pode ter a medida velha do outro PC). [{conjunto, pc}] → o escolhido ou null.
function escolherConjunto(candidatos) {
  const cs = (candidatos || []).filter(x => x && x.conjunto && typeof x.conjunto === "object");
  if (!cs.length) return null;
  return cs.slice().sort((a, b) => (cobertos(b.conjunto, b.pc).length - cobertos(a.conjunto, a.pc).length)
    || (medidoMinimo(b.conjunto) - medidoMinimo(a.conjunto)))[0];
}
// Quando a "próxima atualização" entra no TeamZone: a janela (17h a 17h) fecha às 17h e o TeamZone importa aos :35.
const quandoEntra = janela => Date.parse(`${janela}T17:35:00-03:00`);

// A faixa de uma camada com a régua: o oficial (com o relógio de agora) ou valores soltos com os dias dados.
function camadaOficial(oficial, regua, agora) {
  const f = N().faixaDoOficial(oficial, regua, agora);
  return {...f, valores: N().valoresDosFatores(oficial.valores)};
}

// A camada "se parar agora": valores (os de uma medida que inclui a janela aberta) classificados com os dias que o
// TeamZone vai contar quando essa janela fechar. `janela`: a data da janela da medida (a aberta quando ela foi feita).
function camadaProxima(valores, regua, semana, fechaEm, janela, agora, extra = {}) {
  const R = N();
  if (!janela || janela > fechaEm) return null;   // a janela da medida já é da semana seguinte
  const fecha = R.fimDaSemana(fechaEm), entra = Math.min(Date.parse(`${janela}T17:00:00-03:00`), fecha);
  const dias = R.diasFechados(fechaEm, entra);
  const f = R.faixaDaSemana(valores, regua, dias, semana, "", dias === 0);
  return {...f, valores: R.valoresDosFatores(valores), janela, quando: quandoEntra(janela),
    passou: quandoEntra(janela) <= R.instante(agora), ...extra};
}

// Tudo o que a manchete e a tela do uso de IA mostram, para a semana em curso no instante `agora`.
// `lista`: um item por PC, como a página monta ({pc, ligado, visto, valores, semana, gerado, regua, bandas, banda?,
// janelas?, enviados?, conjunto (o painel.uso_ia_conjunto), oficial (o painel.uso_ia_oficial), ...}).
// Devolve null sem nada para mostrar; senão {semana, numero, fecha_em, inicio, fim, dias, origem ("conjunto" | "pcs"),
// base ("oficial" | "estimativa"), regua, manchete, valores, teamzone, proxima, pcs, maquinas, medido, fora, fechando,
// conferencia, avisos, ninja}.
function painel(lista, agora, {maquinasPadrao = MAQUINAS_PADRAO} = {}) {
  const R = N(), t = R.instante(agora);
  if (t === null) return null;
  const itens = (lista || []).filter(Boolean);
  const atual = R.semanaDoPrograma(t), semana = atual.rotulo, fechaEm = atual.fecha_em;
  const anterior = {fecha_em: R.somarDias(fechaEm, -7)};
  anterior.rotulo = R.rotuloIso(anterior.fecha_em);
  const diasAgora = R.diasFechados(fechaEm, t);
  const coletor = (itens.find(u => u.regua && u.valores) || {});
  const reguaColetor = coletor.regua ? {versao: coletor.regua_versao || "coletor", metricas: Object.keys(coletor.regua),
    bandas: coletor.bandas || BANDAS, minimos: coletor.regua} : null;

  // o conjunto da semana (de qualquer PC, sem limite de idade) e o oficial (o do conjunto ou o que o PC publica à parte)
  const doConjunto = s => itens.filter(u => u.conjunto && u.conjunto.semana === s).map(u => ({conjunto: u.conjunto, pc: u.pc}));
  const escolhido = escolherConjunto(doConjunto(semana));
  const c = escolhido ? escolhido.conjunto : null;
  const oficiais = [c && c.oficial, ...itens.map(u => u.oficial)].filter(o => oficialValido(o, semana));
  // a leitura mais nova; no empate (o oficial do conjunto e o uso_ia_oficial são a mesma leitura), a que traz as
  // máquinas e a hora da leitura (o oficial de dentro do conjunto do Pro não traz)
  const oficial = oficiais.sort((a, b) => R.instante(b.atualizado_em) - R.instante(a.atualizado_em)
    || (num(b.maquinas) ? 1 : 0) - (num(a.maquinas) ? 1 : 0))[0] || null;
  const regua = R.reguaDaSemana(semana, {oficial, conjunto: c, coletor: reguaColetor});
  const avisos = [...regua.avisos, ...((c && c.avisos) || []).map(String)];

  // quem entra na soma: o conjunto cobre os PCs dele (o uso_ia próprio desses PCs fica de fora: sem contar duas vezes)
  const daSemanaAtual = itens.filter(u => u.valores && u.semana === semana);
  const pcs = c ? cobertos(c, escolhido.pc) : daSemanaAtual.map(u => u.pc);
  // o nome do PC como o coletor o identifica (minúsculo, sem .local): o conjunto pode trazer "seazone192"
  const cobertas = new Set(pcs.map(x => maquina({pc: x})));
  const fora = itens.filter(u => !cobertas.has(maquina(u)) && (u.valores || u.instalado !== undefined)).map(u => ({pc: u.pc,
    motivo: u.instalado === false ? "sem o coletor" : !u.valores ? "sem medida desta semana"
      : u.semana !== semana ? (u.semana < semana ? `ainda com a semana ${String(u.semana || "").split("-W")[1] || "?"} (a ${semana.split("-W")[1]} chega em poucos minutos)`
        : `com a semana ${String(u.semana || "").split("-W")[1] || "?"}`)
      : c ? "fora da soma (o conjunto ainda não tem a medida dele)" : "",
    ligado: u.ligado, visto: u.visto}));

  let base, manchete = null, valores, proxima = null, medido = null, bandaDoColetor = "";
  const pa = c && c.proxima_atualizacao && c.proxima_atualizacao.valores ? c.proxima_atualizacao : null;
  const comJanelas = daSemanaAtual.length > 0 && daSemanaAtual.every(u => linhasDoPc(u).length);
  if (pa) medido = medidoMinimo(c) || null;
  if (oficial) {
    base = "oficial";
    const m = camadaOficial(oficial, regua.regua, t);
    manchete = m; valores = m.valores;
  } else if (pa) {
    base = "estimativa";
    valores = R.valoresDosFatores(pa.valores);
  } else if (daSemanaAtual.length) {
    base = "estimativa";
    const soma = comJanelas ? somarComoTeamzone(null, daSemanaAtual.flatMap(linhasDoPc), t, regua.regua, semana)
      : {valores: R.valoresDosFatores((somar(daSemanaAtual) || {}).valores)};
    valores = soma.valores;
    // a banda do coletor só conta nas semanas com o portão (até a W44): a que o agente mandou ou a da régua dele
    if (R.temPortaoDaBanda(semana)) {
      const s = somar(daSemanaAtual) || {};
      bandaDoColetor = daSemanaAtual.map(u => u.banda).filter(Boolean)[0]
        || (coletor.regua ? banda(s.valores || {}, s.dias, coletor.regua, coletor.bandas || BANDAS).banda : "");
    }
    medido = Math.max(...daSemanaAtual.map(u => R.instante(u.gerado) || 0)) || null;
  } else if (diasAgora === 0) {
    base = "estimativa"; valores = R.valoresDosFatores({});
    manchete = R.faixaDaSemana(valores, regua.regua, 0, semana);
  } else return null;

  // a "próxima atualização" (se parar agora): a do conjunto; sem ele, a soma dos PCs com a janela da medida. Na
  // importação de hoje (17h00 a 17h45), a janela é a que acabou de fechar: o TeamZone das 17h35 conta os dias de agora.
  if (pa) {
    const janela = pa.importacao_de_hoje && pa.aberta ? R.somarDias(pa.aberta, -1) : pa.aberta || R.janelaDoMomento(medido || t);
    proxima = camadaProxima(pa.valores, regua.regua, semana, fechaEm, janela, t,
      {base: pa.base || base, fora_do_oficial: pa.fora_do_oficial || null, sessoes_repetidas: pa.sessoes_repetidas || 0,
       importacao_de_hoje: !!pa.importacao_de_hoje});
  } else if (comJanelas) {
    const s = somarComoTeamzone(oficial, daSemanaAtual.flatMap(linhasDoPc), t, regua.regua, semana);
    proxima = s.aberta ? camadaProxima(s.valores, regua.regua, semana, fechaEm, s.importacao_de_hoje ? R.somarDias(s.aberta, -1) : s.aberta, t,
      {base: s.base, fora_do_oficial: s.fora_do_oficial, sessoes_repetidas: s.sessoes_repetidas, importacao_de_hoje: s.importacao_de_hoje,
       avisos: s.avisos}) : null;
  } else if (!oficial && daSemanaAtual.length) {
    // sem as janelas: a janela da medida; a medida da janela recém-aberta, na importação de hoje, conta na de hoje
    const daMedida = R.janelaDoMomento(medido || t), aberta = t < R.fimDaSemana(fechaEm) ? R.janelaDoMomento(t) : null;
    const hoje = daMedida === aberta && importacaoDeHoje(t, aberta, null);
    proxima = camadaProxima(valores, regua.regua, semana, fechaEm, hoje ? R.somarDias(daMedida, -1) : daMedida, t, {base, importacao_de_hoje: hoje});
  }
  if (proxima && proxima.avisos) { for (const a of proxima.avisos) if (!avisos.includes(a)) avisos.push(a); delete proxima.avisos; }

  // Sem o oficial, a manchete é a estimativa do que o TeamZone vai mostrar com esses números: os dias da camada
  // "próxima" (os fechados + 1 com a janela aberta; os de agora na importação de hoje), como o Pro (a manchete sem
  // oficial é a proxima_atualizacao dele). Os dias de agora sobre números que já têm a janela aberta davam a falsa
  // folga do cético (Azul, faltam 379, quando o TeamZone e o Pro dão Verde, faltam 114). Depois que essa importação
  // passou, os dias de agora (o TeamZone recalcula com o relógio de quem abre).
  if (!manchete) {
    const dias = proxima && !proxima.passou && proxima.dias !== null ? proxima.dias : diasAgora;
    manchete = R.faixaDaSemana(valores, regua.regua, dias, semana, bandaDoColetor);
  }
  // no dia 0, sem faixa, como o TeamZone: com a régua da semana nova, "as faixas aparecem no sábado"; sem ela, o "sem
  // régua" (a tela do TeamZone só marca o primeiro dia quando há régua: consultas-uso-ia.ts)
  if (diasAgora === 0 && regua.regua && !manchete.primeiro_dia) manchete = {...manchete, faixa: null, proxima: null, metas: {}, faltam: {},
    atingidos: 0, total: 0, dias: 0, primeiro_dia: true, sem_faixa: true, motivo: R.MOTIVO_PRIMEIRO_DIA};

  // a semana que fecha (de sexta 17h a sábado 17h, o dia 0 da nova): o oficial dela (o que o TeamZone mostra, como no
  // Pro, em que o oficial vence a projeção); sem ele, o conjunto dela ou os PCs. A "próxima atualização" do conjunto
  // fica só como a projeção ("se o que falta entrar até sábado 17h"), nunca com o selo do TeamZone.
  let fechando = null;
  if (t < R.corteDaSemana(anterior.fecha_em)) {
    const cf = (c && c.fechando && c.fechando.semana === anterior.rotulo) ? {conjunto: c.fechando, pc: escolhido.pc}
      : escolherConjunto(doConjunto(anterior.rotulo));
    const of = [cf && cf.conjunto.oficial, ...itens.map(u => u.oficial)].filter(o => oficialValido(o, anterior.rotulo))
      .sort((a, b) => R.instante(b.atualizado_em) - R.instante(a.atualizado_em))[0] || null;
    const rf = R.reguaDaSemana(anterior.rotulo, {oficial: of, conjunto: cf && cf.conjunto, coletor: reguaColetor});
    let mf = null, bf = "estimativa", pcsF = [], projecao = null;
    const paF = cf && cf.conjunto.proxima_atualizacao && cf.conjunto.proxima_atualizacao.valores ? cf.conjunto.proxima_atualizacao : null;
    const daProjecao = () => ({...R.faixaDaSemana(paF.valores, rf.regua, 7, anterior.rotulo), valores: R.valoresDosFatores(paF.valores),
      base: paF.base || "estimativa", fora_do_oficial: paF.fora_do_oficial || null});
    if (paF) pcsF = cobertos(cf.conjunto, cf.pc);
    if (of) {
      mf = camadaOficial(of, rf.regua, t); bf = "oficial";
      if (paF) projecao = daProjecao();
    } else if (paF) { mf = daProjecao(); bf = "estimativa"; }
    else {
      // a medida da semana que fecha: a de agora, se o PC ainda está nela, ou a guardada em `semanas` (0.8.8)
      const daAnterior = itens.map(u => {
        if (u.semana === anterior.rotulo && u.valores) return u;
        const w = (u.semanas || []).find(x => x && x.semana === anterior.rotulo && x.valores);
        return w ? {pc: u.pc, semana: w.semana, valores: w.valores, skills_dia: w.skills_dia, crons_dia: w.crons_dia,
          wf_dia: w.wf_dia, banda: w.banda} : null;
      }).filter(Boolean);
      if (daAnterior.length) {
        const s = somar(daAnterior);
        pcsF = daAnterior.map(u => u.pc);
        mf = {...R.faixaDaSemana(s.valores, rf.regua, 7, anterior.rotulo, daAnterior.map(u => u.banda).filter(Boolean)[0] || ""), valores: R.valoresDosFatores(s.valores)};
      }
    }
    if (mf) fechando = {semana: anterior.rotulo, numero: anterior.rotulo.split("-W")[1], fecha_em: anterior.fecha_em, manchete: mf,
      base: bf, teamzone: of ? {atualizado_em: R.instante(of.atualizado_em), maquinas: of.maquinas} : null, pcs: pcsF, regua: rf,
      projecao: projecao && (projecao.faixa !== mf.faixa || JSON.stringify(projecao.faltam) !== JSON.stringify(mf.faltam)) ? projecao : null,
      retrato: R.corteDaSemana(anterior.fecha_em) + 5 * 60000};
  }

  // o ninja veste a faixa da semana; no dia 0 (sem faixa ainda, com ou sem a régua nova), a da semana que fecha
  const iDe = f => f ? R.FAIXAS_TIME.indexOf(f) + 1 : 0;
  const ninja = manchete.faixa ? {faixa: manchete.faixa, semana, i: iDe(manchete.faixa), fechou: false}
    : (manchete.primeiro_dia || diasAgora === 0) && fechando && fechando.manchete.faixa
      ? {faixa: fechando.manchete.faixa, semana: fechando.semana, i: iDe(fechando.manchete.faixa), fechou: true}
      : {faixa: null, semana, i: 0, fechou: false};
  const maquinas = oficial && num(oficial.maquinas) ? oficial.maquinas : maquinasPadrao;
  // As janelas que o medidor de um PC não conseguiu medir (o agente 0.9.0.14 publica no uso_ia o "janelas_parcial" e o
  // "janelas_cobertura": {janelas, de, faltam: [dias]}, o "parcial" e a "cobertura" das janelas da pro-62): na soma
  // pelos PCs, esses dias ficam de fora, e a soma é um piso. O aviso diz quais.
  const semJanelas = c ? [] : daSemanaAtual.map(u => {
    const cob = u.janelas_cobertura && typeof u.janelas_cobertura === "object" ? u.janelas_cobertura : {};
    const faltam = Array.isArray(cob.faltam) ? cob.faltam.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(String(d))) : [];
    return u.janelas_parcial === true || faltam.length ? {pc: u.pc, faltam} : null;
  }).filter(Boolean);
  for (const x of semJanelas) {
    const dias = x.faltam.map(d => d.slice(8, 10) + "/" + d.slice(5, 7));
    const a = `a medida do ${x.pc} ${dias.length ? `não tem ${dias.length === 1 ? "a janela de" : "as janelas de"} ${dias.join(", ")}` : "não mediu todas as janelas"}: a soma fica abaixo do TeamZone`;
    if (!avisos.includes(a)) avisos.push(a);
  }
  // Sem o conjunto e sem o oficial, a soma é só a dos PCs ligados ao celular (o agente de antes do 0.9.0.12 não publica
  // o conjunto): a faixa é um piso, e o TeamZone, que soma as N máquinas, pode estar acima (o cético viu Verde aqui e
  // Azul lá). A tela diz isso ("Faixa Verde ou acima", "faltam até 175"). O mesmo com uma janela que faltou medir.
  const parcial = base === "estimativa" && !c && (pcs.length < maquinas || semJanelas.length > 0);
  return {semana, numero: semana.split("-W")[1], fecha_em: fechaEm, inicio: R.fimDaSemana(anterior.fecha_em),
    fim: R.fimDaSemana(fechaEm), dias: diasAgora, origem: c ? "conjunto" : "pcs", base, parcial, regua, manchete, valores,
    teamzone: oficial ? {atualizado_em: R.instante(oficial.atualizado_em), maquinas: num(oficial.maquinas) ? oficial.maquinas : null,
      lido_em: R.instante(oficial.lido_em)} : null,
    proxima, pcs, visto: pa && pa.pcs && typeof pa.pcs === "object" && !Array.isArray(pa.pcs) ? pa.pcs : {}, maquinas, medido, fora, fechando,
    conferencia: c && c.conferencia && typeof c.conferencia === "object" ? c.conferencia : null, avisos, ninja};
}

// "faltam 88 mensagens", "falta 1 sessão", "faltam 14 sessões e 20 mensagens", "faltam …, … e mais 2 critérios".
function faltasTxt(faltam, limite = 2) {
  const itens = Object.entries(faltam || {}).filter(([, n]) => num(n) && n > 0);
  if (!itens.length) return "";
  const parte = ([m, n]) => `${formatar(n, m)} ${(UNIDADE[m] || [m, m])[n < 2 ? 0 : 1]}`;
  const vistos = itens.slice(0, limite).map(parte), resto = itens.length - vistos.length;
  const lista = resto > 0 ? `${vistos.join(", ")} e mais ${resto} ${resto === 1 ? "critério" : "critérios"}`
    : vistos.length > 1 ? `${vistos.slice(0, -1).join(", ")} e ${vistos[vistos.length - 1]}` : vistos[0];
  return `${itens.length === 1 && itens[0][1] < 2 ? "falta" : "faltam"} ${lista}`;
}

// ---- a banda do coletor (só para o portão das semanas até a W44 e o histórico; fora da manchete) ------------------
function bate(valores, dias, m, b, minimo) {
  if ((valores[m] || 0) < minimo) return false;
  return !(dias && ESTIMADAS.includes(m) && DIAS_BANDAS.includes(b) && (dias[m] || []).length < DIAS_MIN);
}

// A banda atingida, a próxima, o que falta para ela e o que já está cumprido (o banda_semana do coletor).
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
  const fim = typeof fimIso === "number" ? fimIso : Date.parse(fimIso);
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

// A soma dos PCs e o que vem com ela (a evolução de cada dia, as semanas anteriores, a virada e os erros), para a parte
// da tela que não é a manchete. A faixa da manchete é a do `painel`.
function montar(lista, agoraMs) {
  const doPc = daSemana(lista);
  if (!doPc.length) return null;
  const ref = doPc.slice().sort((a, b) => (b.gerado || 0) - (a.gerado || 0))[0];
  const regua = ref.regua || {}, bandas = ref.bandas || BANDAS, pontos = ref.pontos_banda || {};
  const t = somar(doPc), b = banda(t.valores, t.dias, regua, bandas, pontos);
  const hoje = porDia(doPc).find(d => d.dia === ref.hoje) || null;
  const criterios = ORDEM.map(m => ({chave: m, rotulo: ROTULO[m] || m, valor: t.valores[m], estimada: ESTIMADAS.includes(m),
    estado: ESTADOS.includes(m), pcs: doPc.map(u => ({pc: u.pc, valor: u.valores[m]}))}));
  const anteriores = semanas(lista, regua, bandas, pontos);
  // A virada (sexta 17h): a semana nova começa do zero; nas primeiras 24 h, a que fechou vai ao lado, com a faixa final.
  const comeco = Date.parse(ref.inicio), fechou = anteriores.find(w => w.semana < ref.semana) || null;
  const virada = fechou && agoraMs >= comeco && agoraMs - comeco < VIRADA_MS ? {desde: agoraMs - comeco, fechou} : null;
  if (virada) for (const c of criterios) c.anterior = fechou.valores[c.chave];
  return {semana: ref.semana, numero: String(ref.semana || "").split("-W")[1] || "", inicio: ref.inicio, fim: ref.fim,
    hoje: ref.hoje, medido: Math.max(...doPc.map(u => u.gerado || 0)), pcs: doPc.map(u => u.pc), bandas, pontosBanda: pontos,
    valores: t.valores, minimos: regua, reguaVersao: ref.regua_versao || "", ...b, criterios, faltam: Object.keys(b.faltas).length,
    dias: porDia(doPc), diaHoje: hoje, anteriores, virada,
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
  if (chave === "organizacao" || !Number.isInteger(v)) return String(Math.round(v * 10) / 10).replace(".", ",");
  return Math.round(v).toLocaleString("pt-BR");
}
// Curto, para caber na régua 7 × 10 no celular: 867, 1.009, 9.999, 63 mil, 156 mil, 1,2 mi.
function curto(v, chave) {
  if (!num(v)) return "–";
  if (chave === "organizacao" || v < 10000) return formatar(v, chave);
  if (v < 1e6) return Math.round(v / 1000) + " mil";
  return (Math.round(v / 1e5) / 10).toFixed(1).replace(".", ",") + " mi";
}

const UsoIa = {ORDEM, CRITERIOS, ROTULO, UNIDADE, ESTIMADAS, ESTADOS, VOLUMES, DEDUP_METRICAS, BANDAS, DIARIAS, DIAS_MIN,
  VIRADA_MS, MAQUINAS_PADRAO, organizacaoComoTeamzone, descontarRepetidas, tarefasSemRepetidas, somarDia, somarComoTeamzone,
  situacao, importacaoDeHoje, linhasDaSemana, linhasDaMedia,
  linhasDoPc, somaDiaria, daSemana, somar, cobertos, medidoMinimo, escolherConjunto, painel, faltasTxt, bate, banda, ritmo,
  porDia, semanas, montar, erros, formatar, curto};
if (typeof module !== "undefined" && module.exports) module.exports = UsoIa;
else raiz.UsoIa = UsoIa;
})(typeof window !== "undefined" ? window : globalThis);
