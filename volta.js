// Seaninho no celular: a volta da página no banco com o corte de tráfego (v24, 12/11), sem tela (testada no Node:
// test_volta.cjs). Aqui fica o que pedir em cada volta e como juntar a resposta; a página faz as chamadas e desenha.
//
// Por quê: o banco grátis novo tem 5 GB/mês de SAÍDA para a conta inteira, e os dois agentes (já cortados) gastam
// ~30–75 MB/dia cada. A página chamava o cel_estado INTEIRO a cada 4 s com o app aberto: mesmo sem nada mudar, ele
// devolvia os 40 pedidos do último dia (~80 KB), o vapid e as prefs; e, a cada publicação de um PC (3–8 s com sessão
// trabalhando), o estado inteiro dele (~130 KB: sessões, atualizações e o hoje). Dava ~73–186 MB por hora de app
// aberto, mais que os dois agentes juntos num dia.
//
// Agora, sem SQL novo (o cel_estado_leve é o da banco-v10-estado-leve.sql):
// - a cada 4 s, a leve (só a parte leve de cada PC: visto, versão, mudou_em, cópias): quem está ligado e quem mudou;
// - a conversa aberta fica ao vivo: na mesma chamada, a leve com o pc e a sessao dela traz só aquela sessão quando o PC
//   mudou desde a conversa que a página tem (sem mudança, volta "igual" e não custa);
// - a lista das sessões e o Início: o PC que mudou manda as sessões dele pela leve com o pc (sem o hoje);
// - o INTEIRO (o hoje — painel, uso de IA, decisões, entregas, frentes —, os pedidos, as prefs, o vapid e os aparelhos)
//   ao abrir o app, ao voltar a ele (se já era a vez), no puxar/↻ (se o último tem mais de 1 min), na volta seguinte ao
//   fim de uma ação que muda o hoje (a água, a tarefa, a conta), quando algum PC mudou (2 min ou o orçamento) e a cada
//   10 min sem mudança;
// - os pedidos que a página acompanha (os seus envios, as ações vigiadas, os do chat aberto) pela leve com o pedido,
//   um por chamada (até 5 por volta), enquanto não chegam ao fim;
// - sem a leve no banco (PGRST202), volta ao inteiro, mas a cada 20 s, e tenta a leve de novo a cada 10 min.
//
// Corretor de 12/11 (os achados do cético da página): com 6 sessões por PC (o PC de ~227 KB, o cenário 6 do
// TRAFEGO-0.9.0.12.md), o tempo fixo dava 40–71 MB por hora de app aberto, 2 a 3 vezes a conta do TRAFEGO-PAGINA-v24.md.
// - O orçamento de bytes, como o outros.py do agente: a espera até a próxima lista de cada PC, até o próximo inteiro e
//   até a próxima descida da conversa aberta é o custo da última (corpo + cabeçalho) dividido pelo orçamento por hora,
//   nunca menos que o tempo fixo de antes. Com 3 sessões (a lista ~48 KB, o inteiro ~355 KB, a conversa ~16 KB) nada
//   muda; com 6 ou 10, a espera cresce e o gasto fica no teto.
// - Com a conversa aberta, o que está atrás dela (as listas, o hoje) anda mais devagar: as listas no mínimo a cada 90 s
//   e os dois com metade do orçamento. Ao fechar a conversa, a conta volta à de fora dela na mesma volta (o que já
//   venceu vem na hora).
// - A conversa que você acabou de abrir, em que mandou algo ou que tem pedido seu andando fica a cada volta (quente,
//   2 min) sem o orçamento. A que desce igual (o PC mudou por outra sessão) 3 vezes seguidas passa a 12 s; 6, a 30 s.
// - O fim de uma ação acompanhada que muda o hoje (a água, a tarefa, a conta, o Para você…) pede o inteiro na volta
//   seguinte (o PC dá "entregue" e publica o hoje novo logo depois); em troca, mandar não pede mais o inteiro na hora
//   (a leve com o pedido traz o pedido novo).
// - O inteiro que falha espera 20 s, 40 s, 80 s e 2 min antes de tentar de novo (a leve segue no meio); o online e a
//   volta ao app zeram a espera. O inteiro em voo atende os pedidos de antes dele (não sai outro igual).
// - O aviso do PC (o push: a sessão pergunta, terminou, parou no limite) pede a lista daquele PC já; o de decisões e o
//   do Para você, o inteiro.
(function (raiz) {
"use strict";

const VOLTA_MS = 4000;              // a volta do laço (a leve com pc '')
const LISTA_MS = 30000;             // as sessões de um PC que mudou: no mínimo esse tempo entre uma lista e outra
const INTEIRO_MUDOU_MS = 120000;    // o inteiro quando algum PC mudou desde o último (o hoje novo): no mínimo isso
const INTEIRO_PARADO_MS = 600000;   // e sem mudança nenhuma
const SEM_LEVE_MS = 20000;          // sem a leve no banco: o inteiro no máximo a cada isso
const LEVE_DE_NOVO_MS = 600000;     // e a leve tentada de novo depois disso (o banco pode ganhar a v10)
const PEDIDOS_POR_VOLTA = 5;
const ACOMPANHAR_MS = 15 * 60000;   // depois disso o pedido sai do acompanhamento (o banco dá erro aos 10 min parado);
//                                    o que ainda mudar vem no inteiro
const DEVAGAR_DEPOIS_MS = 2 * 60000;   // o pedido que não chegou ao fim em 2 min (alguém usando o PC, a fila de lá) é
const DEVAGAR_CADA_MS = 20000;         // olhado a cada 20 s, e não a cada volta
// A volta anda um pouco mais que 4 s (a resposta do banco, o desenho): os prazos acima valem com essa folga, senão o
// "a cada 30 s" virava a cada 32 s (oito voltas e não sete)
const FOLGA_MS = 600;
const CABECALHO_B = 600;            // o cabeçalho HTTP de cada resposta (a mesma estimativa do TRAFEGO-0.9.0.12.md)
// Corretor de 12/11, o orçamento de bytes (por hora; a espera = o custo da última ÷ o orçamento, nunca menos que o tempo
// fixo). Fora da conversa: a lista de cada PC (3 sessões, ~48 KB: a cada 30 s, como antes; 6, ~142 KB: ~85 s; 10,
// ~235 KB: ~2,4 min) e o inteiro (3 sessões, ~355 KB: 2 min, como antes; 6, ~540 KB: ~3 min).
const ORCAMENTO_LISTA_B_H = 6e6;           // por PC
const ORCAMENTO_INTEIRO_B_H = 11e6;
// Com a conversa aberta (a tela é o chat): as listas no mínimo a cada 90 s e metade do orçamento; o inteiro também.
const LISTA_CONVERSA_MS = 90000;
const ORCAMENTO_LISTA_CONVERSA_B_H = 3e6;  // por PC
const ORCAMENTO_INTEIRO_CONVERSA_B_H = 6e6;
// A conversa aberta que fala muito: ~16 KB a cada volta (como antes); ~22 KB a cada ~8 s; ~42 KB a cada ~12 s. A quente
// (aberta há pouco, você mandou algo, pedido do chat andando) a cada volta, sem o orçamento.
const ORCAMENTO_CONVERSA_B_H = 16e6;
const CONVERSA_QUENTE_MS = 120000;
const CONVERSA_PARADA = [[6, 30000], [3, 12000]];   // [descidas iguais seguidas, espera mínima]
const INTEIRO_FALHOU_MS = [20000, 40000, 80000, 120000];   // o inteiro que falhou: a próxima tentativa (a leve no meio)
const INTEIRO_PUXAR_MS = 60000;     // o puxar/↻ pede o inteiro se o último tem mais que isso; senão, as listas
const FORCAR_MS = 30000;            // a lista pedida pelo aviso do PC vale por isso
const FIM = ["entregue", "erro", "cancelado"];
// O pronto (a prévia esperando o seu OK) não muda sozinho: fica sem olhar até você confirmar (o cel_confirmar
// acompanha de novo)
const PARADO_EM_VOCE = ["pronto"];
// A leve só busca pedido por uuid (o parâmetro é uuid: outro id dá erro no banco)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// O fim destes não muda nada que só o inteiro traz: a conversa (a mensagem, a enquete, a permissão, as imagens do
// chat, a opção da entrega), o ditado e o PDF (quem espera olha o pedido), abrir a pasta e o aviso de teste. O resto
// (a água, a pausa, a tarefa, a conta, o horário de silêncio, o Para você, as decisões, as entregas, o Rodar, a energia,
// os comandos e o que vier de novo) pede o inteiro na volta seguinte ao fim.
const SEM_INTEIRO_TIPOS = ["claude", "transcrever"];
const SEM_INTEIRO_ACOES = ["anexo", "pdf_paginas", "pdf_recorte", "pdf_original", "ler_texto", "abrir_pasta", "aviso_teste",
  "responder_enquete", "responder_permissao", "recusar_enquete", "entrega_opcao"];
// v27, a máquina de fila: o "ver log" não muda nada que só o inteiro traz (o log vem na resposta do pedido); mandar,
// pausar e retomar mudam o cartão (o agente republica o bloco antes do fim), e pedem o inteiro
const SEM_INTEIRO_MODOS = {maquina: ["log"]};

// O estado do corte (um por página):
// - inteiroEm: quando saiu o último inteiro que chegou; querInteiro: quantas vezes a página pediu o inteiro (voltou ao
//   app, a rede voltou, o aviso, o pedido que a leve não busca); inteiroAtende: quantos desses pedidos o último inteiro
//   já atende (os de antes de ele sair); inteiroEmVoo: os que o inteiro que está no ar atende. Contado, e não pela hora:
//   o pedido e o inteiro no mesmo milissegundo não se confundem;
// - inteiroCusto: os bytes do último inteiro (o orçamento); inteiroFalhas/inteiroProximo: a espera depois do que falhou;
//   fimEm: o inteiro pedido pelo fim de uma ação (a partir dessa hora);
// - semLeveEm: quando o banco disse que não tem a leve (0: tem);
// - banco[pc]: o mudou_em mais novo que o banco mostrou; sessoes[pc]: o da lista de sessões que a página tem;
//   listaEm[pc]: quando a lista veio; listaCusto[pc]: os bytes dela; forcar[pc]: quando o aviso do PC pediu a lista;
// - conversa: {pc, id, marca, em, custo, assinatura, iguais, quente} da conversa aberta (em: quando ela desceu por
//   último; assinatura: o resumo do que desceu, para contar as iguais; quente: até quando fica a cada volta);
// - acompanhados: id do pedido -> {desde, olhadoEm, proximo}.
function novo() {
  return {inteiroEm: 0, querInteiro: 0, inteiroAtende: 0, inteiroEmVoo: 0, inteiroCusto: 0, inteiroFalhas: 0,
          inteiroProximo: 0, fimEm: 0, semLeveEm: 0, banco: {}, sessoes: {}, listaEm: {}, listaCusto: {}, forcar: {},
          conversa: null, acompanhados: new Map()};
}

const mesmoId = (a, b) => String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();
// Os bytes de uma resposta (o JSON e o cabeçalho): a base do orçamento
function tamanho(x) {
  try { return String(JSON.stringify(x ?? null)).length + CABECALHO_B; } catch { return CABECALHO_B; }
}
// O resumo de um texto (para saber se a conversa desceu igual sem guardar os ~40 KB dela)
function resumo(s) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${s.length}:${(h2 >>> 0).toString(36)}${(h1 >>> 0).toString(36)}`;
}
// Algum PC mudou desde o último inteiro (o mudou_em de cada PC na página é o do último inteiro: a leve não mexe nele)
const algumMudou = (st, pcs) => Object.keys(st.banco).some(pc => pcs[pc] && st.banco[pc] !== pcs[pc].mudou_em);

// ---- O orçamento --------------------------------------------------------------------------------------------------
const espera = (custo, orcamento, minimo) => Math.max(minimo, (custo || 0) * 3600e3 / orcamento);
// A espera até a próxima lista do PC e até o próximo inteiro (quando algum PC mudou). Com a conversa aberta, mais
// devagar: a tela é o chat, e o que está atrás dele vence na hora em que você sai dela.
function listaEspera(st, pc) {
  return st.conversa ? espera(st.listaCusto[pc], ORCAMENTO_LISTA_CONVERSA_B_H, LISTA_CONVERSA_MS)
    : espera(st.listaCusto[pc], ORCAMENTO_LISTA_B_H, LISTA_MS);
}
function inteiroEspera(st) {
  return espera(st.inteiroCusto, st.conversa ? ORCAMENTO_INTEIRO_CONVERSA_B_H : ORCAMENTO_INTEIRO_B_H, INTEIRO_MUDOU_MS);
}
// A conversa aberta: quente, a cada volta; senão, o orçamento dela, e a que desce igual seguidas vezes, mais devagar.
function conversaEspera(c, agora) {
  if (c.quente > agora) return 0;
  let ms = (c.custo || 0) * 3600e3 / ORCAMENTO_CONVERSA_B_H;
  for (const [n, min] of CONVERSA_PARADA) if (c.iguais >= n) { ms = Math.max(ms, min); break; }
  return ms;
}
const conversaVez = (c, agora) => agora - (c.em || 0) >= conversaEspera(c, agora) - FOLGA_MS;

// O inteiro pode sair agora? Não na espera depois de um que falhou.
const podeInteiro = (st, agora) => !st.inteiroFalhas || agora >= st.inteiroProximo;

// O inteiro nesta volta? "" (não: a leve), "espera" (sem a leve no banco, ainda não é a vez do inteiro: nada nesta
// volta) ou o motivo: abrir, pedido (o aviso, voltou ao app, a rede voltou, o pedido que a leve não busca), fim (a ação
// que muda o hoje acabou), sem_leve, mudou, parado.
function motivoInteiro(st, pcs, agora) {
  if (!podeInteiro(st, agora)) return st.semLeveEm && agora - st.semLeveEm < LEVE_DE_NOVO_MS - FOLGA_MS ? "espera" : "";
  if (!st.inteiroEm) return "abrir";
  if (st.querInteiro > Math.max(st.inteiroAtende, st.inteiroEmVoo)) return "pedido";
  if (st.fimEm && agora >= st.fimEm) return "fim";
  if (st.semLeveEm) {
    if (agora - st.semLeveEm >= LEVE_DE_NOVO_MS - FOLGA_MS) return "";
    return agora - st.inteiroEm >= SEM_LEVE_MS - FOLGA_MS ? "sem_leve" : "espera";
  }
  const mudou = algumMudou(st, pcs);
  return agora - st.inteiroEm >= (mudou ? inteiroEspera(st) : INTEIRO_PARADO_MS) - FOLGA_MS ? (mudou ? "mudou" : "parado") : "";
}

// A conversa aberta (aberta = {pc, id} da página, ou null): a marca da que a página tem. Ao abrir outra, a marca é a da
// lista daquele PC (a lista traz a conversa de cada sessão) e ela fica quente (a cada volta) nos 2 primeiros min.
function conversaDe(st, aberta, agora = 0) {
  if (!aberta || !aberta.pc || !aberta.id) return (st.conversa = null);
  const c = st.conversa;
  if (!c || c.pc !== aberta.pc || !mesmoId(c.id, aberta.id))
    st.conversa = {pc: aberta.pc, id: aberta.id, marca: st.sessoes[aberta.pc] || "", em: 0, custo: 0, assinatura: "",
                   iguais: 0, quente: agora ? agora + CONVERSA_QUENTE_MS : 0};
  return st.conversa;
}
// Você mandou algo na conversa aberta (ou há pedido seu andando nela): a cada volta pelos próximos 2 min.
function conversaQuente(st, agora) {
  if (st.conversa) st.conversa.quente = Math.max(st.conversa.quente || 0, agora + CONVERSA_QUENTE_MS);
}
// A conversa desceu (sozinha, na lista do PC ou no inteiro): quando, quanto custou e se veio igual à de antes.
function vistaConversa(c, sessao, agora, custo = 0) {
  const json = String(JSON.stringify(sessao ?? null)), ass = resumo(json);
  c.iguais = c.assinatura && ass === c.assinatura ? c.iguais + 1 : 0;
  c.assinatura = ass;
  c.em = agora;
  c.custo = custo || json.length + 1000 + CABECALHO_B;   // sem a resposta dela: a sessão e a parte leve dos PCs
}

// O aviso do PC pediu a lista dele (a sessão que pergunta, terminou ou parou no limite): vale por 30 s.
const forcada = (st, pc, agora) => !!st.forcar[pc] && agora - st.forcar[pc] < FORCAR_MS;
function forcarLista(st, pc, agora) { if (pc) st.forcar[pc] = agora; }

// A lista do PC está vencida: ele mudou desde a lista que a página tem e já passou a espera dela (ou o aviso pediu).
const listaVence = (st, pcs, pc, agora) => !!pcs[pc] && st.banco[pc] !== undefined && st.banco[pc] !== st.sessoes[pc]
  && (forcada(st, pc, agora) || agora - (st.listaEm[pc] || 0) >= listaEspera(st, pc) - FOLGA_MS);
const pedidoLista = (st, pc) => ({pc, sessao: "", conhecidos: {...st.banco, [pc]: st.sessoes[pc] || ""}});
const pedidoConversa = (st, c) => ({pc: c.pc, sessao: c.id, conhecidos: {...st.banco, [c.pc]: c.marca}});

// A primeira chamada da volta: {pc, sessao, conhecidos}. A lista que o aviso do PC pediu; com a conversa aberta, a
// lista do PC dela quando vence (a lista traz a conversa junto) ou, se é a vez da conversa, a leve com o pc e a sessao
// dela (o PC que não mudou volta "igual", sem nada; o que mudou traz só a conversa). Senão, a lista vencida de um PC
// (pelo que a volta de antes mostrou) ou a leve só com a parte leve (pc ''). Os outros PCs vêm sempre só com a parte leve.
function primeira(st, pcs, aberta, agora) {
  const c = conversaDe(st, aberta, agora);
  const forcado = Object.keys(pcs).sort().find(pc => forcada(st, pc, agora));
  if (forcado) return pedidoLista(st, forcado);
  if (c && pcs[c.pc]) {
    if (listaVence(st, pcs, c.pc, agora)) return pedidoLista(st, c.pc);
    if (conversaVez(c, agora)) return pedidoConversa(st, c);
  }
  const pc = Object.keys(pcs).sort().find(x => listaVence(st, pcs, x, agora));
  return pc ? pedidoLista(st, pc) : {pc: "", sessao: "", conhecidos: {...st.banco}};
}

// As outras chamadas da volta, depois da primeira (feitas: as chamadas já feitas nesta volta): a conversa aberta, se o
// PC dela mudou e é a vez dela, e a lista de cada PC que venceu. O PC cuja conversa veio nesta volta deixa a lista para a
// próxima (ela traria a conversa de novo).
function resto(st, pcs, aberta, agora, feitas = []) {
  const out = [], c = conversaDe(st, aberta, agora);
  const feito = pc => feitas.some(f => f.pc === pc);
  if (c && pcs[c.pc] && !feito(c.pc) && st.banco[c.pc] !== undefined && st.banco[c.pc] !== c.marca && conversaVez(c, agora))
    out.push(listaVence(st, pcs, c.pc, agora) ? pedidoLista(st, c.pc) : pedidoConversa(st, c));
  for (const pc of Object.keys(pcs).sort()) {
    if (feito(pc) || out.some(x => x.pc === pc) || !listaVence(st, pcs, pc, agora)) continue;
    out.push(pedidoLista(st, pc));
  }
  return out;
}

// Troca (ou põe, ou tira) uma sessão na lista do PC. Sem a sessão na resposta, ela fechou no PC: sai da lista (o chat
// guarda a última vista).
function trocarSessao(lista, id, nova) {
  const l = Array.isArray(lista) ? lista : [];
  const i = l.findIndex(s => s && mesmoId(s.id, id));
  if (!nova) return i < 0 ? l : l.filter((_, j) => j !== i);
  return i < 0 ? [...l, nova] : l.map((s, j) => (j === i ? nova : s));
}

// Uma resposta da leve no estado da página. Cada PC ganha o visto, a versão e as cópias novos; o resto fica (o hoje, as
// atualizações, o ligou_em e o mudou_em do último inteiro). Com as sessões (a leve com o pc da chamada `c`), a lista
// inteira ou só a sessão pedida entra no lugar, sem apagar o hoje nem as atualizações de antes; "igual" no PC da
// chamada: o que a página tem já é o de agora. O PC que a página ainda não tem fica para o inteiro (apareceu: true); o
// que saiu da conta sai. Devolve {pcs, apareceu}.
function juntar(st, pcs, r, c = {}, agora = Date.now()) {
  if (!r || !Array.isArray(r.pcs)) return {pcs, apareceu: false};   // resposta sem a lista dos PCs: não apaga nenhum
  const novos = {};
  let apareceu = false;
  for (const p of r.pcs) {
    if (!p || !p.pc) continue;
    st.banco[p.pc] = p.mudou_em;
    const v = pcs[p.pc];
    if (!v) { apareceu = true; continue; }
    const x = {...v, visto_em: p.visto_em, versao: p.versao, copias_em: p.copias_em};
    if (c.pc && p.pc === c.pc) {
      const conv = st.conversa && st.conversa.pc === p.pc ? st.conversa : null;
      if (!c.sessao) delete st.forcar[p.pc];   // a lista que o aviso pediu veio (ou o PC está igual)
      if (Array.isArray(p.sessoes) && c.sessao) {
        x.sessoes = trocarSessao(v.sessoes, c.sessao, p.sessoes[0]);
        if (conv && mesmoId(conv.id, c.sessao)) { conv.marca = p.mudou_em; vistaConversa(conv, p.sessoes[0], agora, tamanho(r)); }
      } else if (Array.isArray(p.sessoes)) {
        x.sessoes = p.sessoes;
        st.sessoes[p.pc] = p.mudou_em;
        st.listaCusto[p.pc] = tamanho(r);
        if (conv) { conv.marca = p.mudou_em; vistaConversa(conv, p.sessoes.find(s => s && mesmoId(s.id, conv.id)), agora); }
      } else if (p.igual) {
        if (c.sessao) { if (conv && mesmoId(conv.id, c.sessao)) conv.marca = p.mudou_em; }
        else { st.sessoes[p.pc] = p.mudou_em; if (conv) conv.marca = p.mudou_em; }
      }
    }
    novos[p.pc] = x;
  }
  return {pcs: novos, apareceu};
}

// O inteiro vai sair (quando a página já pediu `querInteiro` vezes): ele atende esses pedidos. Devolve quantos.
function inteiroSaiu(st) { st.inteiroEmVoo = st.querInteiro; return st.querInteiro; }
// O inteiro não veio: a próxima tentativa espera 20 s, 40 s, 80 s e depois 2 min (a leve segue no meio); os pedidos de
// inteiro que ele atenderia continuam esperando.
function inteiroFalhou(st, agora) {
  st.inteiroFalhas++;
  st.inteiroProximo = agora + INTEIRO_FALHOU_MS[Math.min(st.inteiroFalhas, INTEIRO_FALHOU_MS.length) - 1] - FOLGA_MS;
  st.inteiroEmVoo = st.inteiroAtende;
}

// O inteiro chegou (saiu em `inicio`, quando a página já tinha pedido `atende` vezes): as marcas do que ele trouxe. O PC
// "igual" no inteiro não mudou desde o inteiro anterior, então as sessões que a página tem também valem. O inteiro conta
// como a lista de cada PC (a espera da próxima conta dele) e, no PC da conversa aberta, como a conversa.
function inteiroChegou(st, r, inicio, atende = st.querInteiro) {
  st.inteiroEm = inicio;
  st.inteiroAtende = Math.max(st.inteiroAtende, atende);
  st.inteiroEmVoo = st.inteiroAtende;
  st.inteiroFalhas = st.inteiroProximo = 0;
  st.inteiroCusto = tamanho(r);
  if (st.fimEm && inicio >= st.fimEm) st.fimEm = 0;
  const vistos = new Set();
  for (const p of (r && r.pcs) || []) {
    if (!p || !p.pc) continue;
    vistos.add(p.pc);
    st.banco[p.pc] = st.sessoes[p.pc] = p.mudou_em;
    st.listaEm[p.pc] = inicio;
    delete st.forcar[p.pc];
    const conv = st.conversa && st.conversa.pc === p.pc ? st.conversa : null;
    if (conv) conv.marca = p.mudou_em;
    if (!p.igual && Array.isArray(p.sessoes)) {
      st.listaCusto[p.pc] = tamanho(p.sessoes) + 1000;   // a lista pela leve: as sessões e a parte leve dos PCs
      if (conv) vistaConversa(conv, p.sessoes.find(s => s && mesmoId(s.id, conv.id)), inicio);
    }
  }
  for (const k of ["banco", "sessoes", "listaEm", "listaCusto"]) for (const pc of Object.keys(st[k])) if (!vistos.has(pc)) delete st[k][pc];
}

// ---- Voltar ao app, a rede que voltou, o puxar e o aviso do PC ----------------------------------------------------
// A página pede o inteiro na próxima volta (o pedido que a leve não busca, o aviso de decisões ou do Para você).
function quererInteiro(st) { st.querInteiro++; }
// Voltou ao app (ou a rede voltou): a espera do inteiro que falhou zera, e o inteiro sai na hora se já era a vez dele
// (2 min ou o orçamento: o que mudou com o app no fundo). Antes, a cada volta ao app: ir ao WhatsApp e voltar a cada
// minuto pedia ~60 inteiros por hora. Devolve se pediu.
function voltou(st, agora) {
  st.inteiroFalhas = st.inteiroProximo = 0;
  if (!st.inteiroEm || agora - st.inteiroEm < inteiroEspera(st) - FOLGA_MS) return false;
  st.querInteiro++;
  return true;
}
// O puxar/↻: o inteiro se o último tem mais de 1 min ("inteiro"); senão, a lista de cada PC que mudou ("leve").
function puxar(st, pcs, agora) {
  st.inteiroFalhas = st.inteiroProximo = 0;
  if (!st.inteiroEm || agora - st.inteiroEm >= INTEIRO_PUXAR_MS - FOLGA_MS) return "inteiro";
  for (const pc of Object.keys(pcs)) st.forcar[pc] = agora;
  return "leve";
}
// O aviso que o PC mandou ao celular (o push) com o app aberto: a sessão que pergunta, terminou ou parou no limite pede
// a lista daquele PC já (o "Esperando você" e o número da aba em ~4 s, e não na lista seguinte); o de decisões, do Para
// você, do AI Rats, de aparelho novo e do PC que caiu ou voltou, o inteiro (o que mudou está no hoje). Devolve o que fez.
const AVISO_DE_SESSAO = ["pergunta", "terminou", "limite"];
const AVISO_DO_HOJE = ["decisoes", "para_voce", "ai_rats", "aparelho", "pc", "seaninho_caiu"];
function avisoDoPc(st, d, agora) {
  if (!d) return "";
  if (AVISO_DE_SESSAO.includes(d.aviso) && d.pc) { forcarLista(st, d.pc, agora); return "lista"; }
  if (AVISO_DO_HOJE.includes(d.aviso)) { st.querInteiro++; return "inteiro"; }
  return "";
}

// ---- Os pedidos acompanhados --------------------------------------------------------------------------------------
// Um pedido que a página mandou (cel_pedir), confirmou (cel_confirmar) ou cancelou (cel_cancelar): acompanhar até chegar
// ao fim. Devolve false se a leve não busca (o id não é uuid): aí quem mandou pede o inteiro.
function acompanhar(st, id, agora) {
  if (!UUID.test(String(id || ""))) return false;
  st.acompanhados.set(String(id), {desde: agora, olhadoEm: 0, proximo: 0});
  return true;
}

// O fim deste pedido pede o inteiro? (ver SEM_INTEIRO_*)
function pedeInteiroNoFim(p) {
  if (!p || SEM_INTEIRO_TIPOS.includes(p.tipo)) return false;
  if (p.tipo !== "acao") return true;
  let a = "", modo = "";
  try { const t = JSON.parse(p.texto || "{}") || {}; a = String(t.acao || ""); modo = String(t.modo || ""); } catch {}
  return !SEM_INTEIRO_ACOES.includes(a) && !(SEM_INTEIRO_MODOS[a] || []).includes(modo);
}
// A ação acabou: o inteiro na volta seguinte (o PC publica o hoje novo logo depois do "entregue"; o inteiro na mesma
// volta podia trazer o hoje de antes, e a água ficava com o número velho até o inteiro dos 2 min).
function fimDeAcao(st, agora) { st.fimEm = Math.max(st.fimEm || 0, agora + VOLTA_MS - FOLGA_MS); }

const doChat = (p, aberta) => !!aberta && p.pc === aberta.pc && mesmoId(p.sessao, aberta.id);

// Os pedidos para olhar nesta volta (até 5), o que foi olhado há mais tempo primeiro: os acompanhados e os do chat
// aberto que ainda não chegaram ao fim (a conversa com pedido andando fica quente). Sai do acompanhamento o que chegou
// ao fim (entregue, erro, cancelado; o que muda o hoje pede o inteiro) e o que passou de 15 min.
function pedidosParaOlhar(st, pedidos, aberta, agora) {
  const lista = Array.isArray(pedidos) ? pedidos : [];
  if (aberta) for (const p of lista) {
    if (!p || !doChat(p, aberta) || FIM.includes(p.estado) || PARADO_EM_VOCE.includes(p.estado)) continue;
    const criado = Date.parse(p.criado_em) || agora;
    if (agora - criado >= ACOMPANHAR_MS) continue;
    conversaQuente(st, agora);
    if (!st.acompanhados.has(p.id) && UUID.test(String(p.id || ""))) st.acompanhados.set(p.id, {desde: Math.min(criado, agora), olhadoEm: 0, proximo: 0});
  }
  const porId = new Map(lista.map(p => [p && p.id, p]));
  const vez = [];
  for (const [id, a] of st.acompanhados) {
    const p = porId.get(id);
    if (p && FIM.includes(p.estado)) {
      st.acompanhados.delete(id);
      if (pedeInteiroNoFim(p)) fimDeAcao(st, agora);
      continue;
    }
    if (agora - a.desde >= ACOMPANHAR_MS) { st.acompanhados.delete(id); continue; }
    if ((p && PARADO_EM_VOCE.includes(p.estado)) || a.proximo > agora) continue;
    vez.push([id, a]);
  }
  return vez.sort((x, y) => x[1].olhadoEm - y[1].olhadoEm || x[1].desde - y[1].desde).slice(0, PEDIDOS_POR_VOLTA).map(([id]) => id);
}

// O pedido foi olhado agora (`veio`: a lista de pedidos da resposta): sem ele na resposta (não é desta conta, ou
// sumiu), sai do acompanhamento; no fim, sai e, se muda o hoje, pede o inteiro na volta seguinte (devolve o pedido);
// senão, o próximo olhar é na próxima volta (nos 2 primeiros min) ou daqui a 20 s.
function olhado(st, id, agora, veio) {
  const a = st.acompanhados.get(id);
  if (!a) return null;
  const p = (veio || []).find(x => x && x.id === id);
  if (!p) { st.acompanhados.delete(id); return null; }
  if (FIM.includes(p.estado)) {
    st.acompanhados.delete(id);
    if (pedeInteiroNoFim(p)) fimDeAcao(st, agora);
    return p;
  }
  a.olhadoEm = agora;
  a.proximo = agora - a.desde < DEVAGAR_DEPOIS_MS ? 0 : agora + DEVAGAR_CADA_MS - FOLGA_MS;
  return null;
}

// O pedido que veio pela leve entra na lista no lugar dele (a mais nova primeiro, como no inteiro).
function juntarPedidos(pedidos, novos) {
  let out = Array.isArray(pedidos) ? pedidos : [];
  for (const p of novos || []) {
    if (!p || !p.id) continue;
    const i = out.findIndex(x => x && x.id === p.id);
    if (i >= 0) { out = out.slice(); out[i] = p; continue; }
    const k = out.findIndex(x => String((x && x.criado_em) || "") < String(p.criado_em || ""));
    out = k < 0 ? [...out, p] : [...out.slice(0, k), p, ...out.slice(k)];
  }
  return out;
}

// O banco ainda não tem o cel_estado_leve (falta a banco-v10-estado-leve.sql): o PostgREST responde PGRST202 ("Could
// not find the function"). Só esse erro faz voltar ao inteiro; rede, 5xx e chave seguem como antes.
const semLeve = e => !!e && (e.codigo === "PGRST202" || /PGRST202|Could not find the function/i.test(String(e.message || e)));

const Volta = {VOLTA_MS, LISTA_MS, INTEIRO_MUDOU_MS, INTEIRO_PARADO_MS, SEM_LEVE_MS, LEVE_DE_NOVO_MS, PEDIDOS_POR_VOLTA,
  ACOMPANHAR_MS, DEVAGAR_DEPOIS_MS, DEVAGAR_CADA_MS, FOLGA_MS, CABECALHO_B, ORCAMENTO_LISTA_B_H, ORCAMENTO_INTEIRO_B_H,
  LISTA_CONVERSA_MS, ORCAMENTO_LISTA_CONVERSA_B_H, ORCAMENTO_INTEIRO_CONVERSA_B_H, ORCAMENTO_CONVERSA_B_H,
  CONVERSA_QUENTE_MS, CONVERSA_PARADA, INTEIRO_FALHOU_MS, INTEIRO_PUXAR_MS, FORCAR_MS, FIM, UUID, novo, tamanho, resumo,
  listaEspera, inteiroEspera, conversaEspera, conversaVez, podeInteiro, motivoInteiro, conversaDe, conversaQuente,
  forcarLista, primeira, resto, trocarSessao, juntar, inteiroSaiu, inteiroFalhou, inteiroChegou, quererInteiro, voltou,
  puxar, avisoDoPc, acompanhar, pedeInteiroNoFim, fimDeAcao, pedidosParaOlhar, olhado, juntarPedidos, semLeve};
if (typeof module !== "undefined" && module.exports) module.exports = Volta;
raiz.Volta = Volta;
})(typeof window !== "undefined" ? window : globalThis);
