/**
 * Painel DRE / CMV Fast Shake.
 *
 * Projeto Apps Script SEPARADO do app de contagem. Ele lê as contagens da
 * planilha "Estoque Fast Shake", guarda compras, custos e faturamento em abas
 * próprias e mostra o painel. Publique como App da Web com
 * "Executar como: Eu" e "Quem pode acessar: Somente eu" (veja o README).
 */

const ABA_CONTAGENS = 'Contagens';
const ABA_COMPRAS = 'Compras';
const ABA_CUSTOS = 'Custos';
const ABA_FATURAMENTO = 'Faturamento';
const ABA_IGNORADAS = 'Contagens ignoradas';

const CAB_COMPRAS = ['ID compra', 'Data da compra', 'Loja', 'Fornecedor', 'Nº documento', 'Descrição na nota',
  'Categoria', 'Produto', 'Situação', 'Embalagens', 'Unid. por embalagem', 'Total (unidades)',
  'Valor total (R$)', 'Custo por unidade (R$)', 'Fotos', 'Lançado em'];
const CAB_CUSTOS = ['Categoria', 'Produto', 'Custo por unidade (R$)', 'Vigente desde', 'Origem', 'ID compra', 'Registrado em'];
const CAB_FATURAMENTO = ['Loja', 'Contagem inicial (ID)', 'Contagem final (ID)', 'Início', 'Fim', 'Faturamento (R$)', 'Atualizado em'];
const CAB_IGNORADAS = ['ID contagem', 'Loja', 'Data', 'Ignorada em'];

const MODELO_IA = 'claude-opus-5-5';
const PASTA_FOTOS = 'Fast Shake - Notas fiscais';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Painel')
    .setTitle('Painel DRE · Fast Shake')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ---------- Configuração ----------

function props_() { return PropertiesService.getScriptProperties(); }

function planilha_() {
  const id = props_().getProperty('PLANILHA_ID');
  if (!id) throw new Error('CONFIGURAR');
  return SpreadsheetApp.openById(id);
}

function obterConfig() {
  const p = props_();
  let nome = '';
  if (p.getProperty('PLANILHA_ID')) {
    try { nome = planilha_().getName(); } catch (e) { nome = ''; }
  }
  return { planilha: nome, temPlanilha: !!nome, temChave: !!p.getProperty('ANTHROPIC_API_KEY') };
}

function salvarConfig(cfg) {
  const p = props_();
  if (cfg.planilha) {
    const m = String(cfg.planilha).match(/\/d\/([a-zA-Z0-9-_]+)/);
    const id = m ? m[1] : String(cfg.planilha).trim();
    SpreadsheetApp.openById(id); // falha aqui se o link estiver errado
    p.setProperty('PLANILHA_ID', id);
  }
  if (cfg.chave) p.setProperty('ANTHROPIC_API_KEY', String(cfg.chave).trim());
  return obterConfig();
}

// ---------- Leitura de tudo que o painel precisa ----------

function carregarDados() {
  const ss = planilha_();
  const tz = ss.getSpreadsheetTimeZone();
  const fmt = function (d, padrao) {
    return d instanceof Date ? Utilities.formatDate(d, tz, padrao || "yyyy-MM-dd'T'HH:mm") : String(d || '');
  };

  // Contagens: lê a aba "Contagens" e as abas "Contagens (formato antigo …)".
  const contagens = {};
  ss.getSheets().forEach(function (aba) {
    const nome = aba.getName();
    if ((nome !== ABA_CONTAGENS && nome.indexOf(ABA_CONTAGENS + ' (formato antigo') !== 0) || aba.getLastRow() < 2) return;
    lerContagens_(aba.getDataRange().getValues(), fmt).forEach(function (c) {
      if (!contagens[c.id]) contagens[c.id] = c;
    });
  });

  const ignoradas = linhas_(ss, ABA_IGNORADAS, CAB_IGNORADAS).map(function (r) { return String(r[0]); });

  const compras = linhas_(ss, ABA_COMPRAS, CAB_COMPRAS).map(function (r) {
    return { id: String(r[0]), dia: fmt(r[1], 'yyyy-MM-dd'), loja: String(r[2]), fornecedor: String(r[3]), documento: String(r[4]),
      descricao: String(r[5]), categoria: String(r[6]), produto: String(r[7]), situacao: String(r[8]),
      embalagens: num_(r[9]), porEmbalagem: num_(r[10]), unidades: num_(r[11]), valor: num_(r[12]), fotos: String(r[14]) };
  });

  const custos = linhas_(ss, ABA_CUSTOS, CAB_CUSTOS).map(function (r) {
    return { categoria: String(r[0]), produto: String(r[1]), custo: num_(r[2]), desde: fmt(r[3], 'yyyy-MM-dd'),
      origem: String(r[4]), compra: String(r[5]) };
  });

  const faturamento = linhas_(ss, ABA_FATURAMENTO, CAB_FATURAMENTO).map(function (r) {
    return { loja: String(r[0]), inicial: String(r[1]), final: String(r[2]), valor: num_(r[5]) };
  });

  return {
    contagens: Object.keys(contagens).map(function (k) { return contagens[k]; }),
    ignoradas: ignoradas, compras: compras, custos: custos, faturamento: faturamento,
    temChave: !!props_().getProperty('ANTHROPIC_API_KEY'),
  };
}

/**
 * Converte as linhas de uma aba de contagens em contagens agrupadas por ID.
 * Formato atual: tem as colunas "Situação" e "Total (unidades)".
 * Formato anterior: tem "Quantidade" e "Medida". Só são aproveitadas as
 * contagens em que tudo veio em unidades ("un"), ou seja, as enviadas pelo
 * app novo antes de o script da planilha ser atualizado.
 */
function lerContagens_(valores, fmt) {
  const cab = valores[0];
  const col = function (nome) { return cab.indexOf(nome); };
  const c = { data: col('Data/hora'), loja: col('Unidade'), resp: col('Responsável'), cat: col('Categoria'), prod: col('Produto'),
    sit: col('Situação'), total: col('Total (unidades)'), qtd: col('Quantidade'), medida: col('Medida'), id: col('ID') };
  const novo = c.sit >= 0 && c.total >= 0;
  const antigo = !novo && c.qtd >= 0 && c.medida >= 0;
  if (c.id < 0 || (!novo && !antigo)) return [];

  const grupos = {};
  const soUnidades = {};
  for (let i = 1; i < valores.length; i++) {
    const v = valores[i];
    const id = String(v[c.id]);
    if (!id) continue;
    if (!grupos[id]) {
      grupos[id] = { id: id, loja: String(v[c.loja]), data: fmt(v[c.data]), responsavel: String(v[c.resp]), itens: [] };
      soUnidades[id] = true;
    }
    if (novo) {
      grupos[id].itens.push([String(v[c.cat]), String(v[c.prod]), String(v[c.sit]), v[c.total] === '' ? null : Number(v[c.total])]);
    } else {
      if (String(v[c.medida]) !== 'un') soUnidades[id] = false;
      grupos[id].itens.push([String(v[c.cat]), String(v[c.prod]), 'Contada', v[c.qtd] === '' ? 0 : Number(v[c.qtd])]);
    }
  }
  return Object.keys(grupos).filter(function (id) { return novo || soUnidades[id]; }).map(function (id) { return grupos[id]; });
}

// ---------- Gravações ----------

function salvarFaturamento(f) {
  const ss = planilha_();
  const aba = aba_(ss, ABA_FATURAMENTO, CAB_FATURAMENTO);
  const valores = aba.getDataRange().getValues();
  const linha = [texto_(f.loja), texto_(f.inicial), texto_(f.final), texto_(f.inicio), texto_(f.fim),
    f.valor === '' || f.valor == null ? '' : Number(f.valor), new Date()];
  for (let i = 1; i < valores.length; i++) {
    if (String(valores[i][1]) === f.inicial && String(valores[i][2]) === f.final) {
      aba.getRange(i + 1, 1, 1, linha.length).setValues([linha]);
      return true;
    }
  }
  aba.appendRow(linha);
  return true;
}

function salvarCusto(c) {
  const aba = aba_(planilha_(), ABA_CUSTOS, CAB_CUSTOS);
  aba.appendRow([texto_(c.categoria), texto_(c.produto), Number(c.custo), c.desde ? new Date(c.desde + 'T12:00:00') : new Date(),
    'Manual', '', new Date()]);
  return true;
}

function alternarContagemIgnorada(c) {
  const aba = aba_(planilha_(), ABA_IGNORADAS, CAB_IGNORADAS);
  const valores = aba.getDataRange().getValues();
  for (let i = valores.length - 1; i >= 1; i--) {
    if (String(valores[i][0]) === c.id) { aba.deleteRow(i + 1); return false; }
  }
  aba.appendRow([texto_(c.id), texto_(c.loja), texto_(c.data), new Date()]);
  return true;
}

/**
 * Grava uma compra: uma linha por item, as fotos/PDFs no Google Drive e, para
 * cada item de estoque, o novo custo por unidade (última compra).
 */
function salvarCompra(compra) {
  const ss = planilha_();
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const id = Utilities.getUuid().slice(0, 8);
    const dia = new Date(compra.dia + 'T12:00:00');
    const agora = new Date();

    let fotos = '';
    if (compra.fotos && compra.fotos.length) {
      const pasta = pastaFotos_();
      fotos = compra.fotos.map(function (arq, i) {
        const pdf = arq.tipo === 'application/pdf';
        const blob = Utilities.newBlob(Utilities.base64Decode(arq.dados), pdf ? 'application/pdf' : 'image/jpeg',
          compra.dia + ' ' + compra.loja + ' ' + (compra.fornecedor || 'nota') + ' ' + (i + 1) + (pdf ? '.pdf' : '.jpg'));
        return pasta.createFile(blob).getUrl();
      }).join(' ');
    }

    const linhas = compra.itens.map(function (it) {
      const unidades = it.situacao === 'Estoque' ? Number(it.embalagens) * Number(it.porEmbalagem) : '';
      const custo = unidades ? Number(it.valor) / unidades : '';
      return [id, dia, texto_(compra.loja), texto_(compra.fornecedor), texto_(compra.documento), texto_(it.descricao),
        texto_(it.categoria), texto_(it.produto), it.situacao, Number(it.embalagens) || '', Number(it.porEmbalagem) || '',
        unidades, Number(it.valor) || 0, custo, fotos, agora];
    });
    const abaCompras = aba_(ss, ABA_COMPRAS, CAB_COMPRAS);
    abaCompras.getRange(abaCompras.getLastRow() + 1, 1, linhas.length, CAB_COMPRAS.length).setValues(linhas);

    const custos = linhas.filter(function (l) { return l[8] === 'Estoque' && l[13] > 0; }).map(function (l) {
      return [l[6], l[7], l[13], dia, 'Nota ' + (compra.fornecedor || '') + (compra.documento ? ' nº ' + compra.documento : ''), id, agora];
    });
    if (custos.length) {
      const abaCustos = aba_(ss, ABA_CUSTOS, CAB_CUSTOS);
      abaCustos.getRange(abaCustos.getLastRow() + 1, 1, custos.length, CAB_CUSTOS.length).setValues(custos);
    }
    return id;
  } finally {
    lock.releaseLock();
  }
}

function excluirCompra(id) {
  const ss = planilha_();
  [[ABA_COMPRAS, CAB_COMPRAS, 0], [ABA_CUSTOS, CAB_CUSTOS, 5]].forEach(function (a) {
    const aba = aba_(ss, a[0], a[1]);
    const valores = aba.getDataRange().getValues();
    for (let i = valores.length - 1; i >= 1; i--) {
      if (String(valores[i][a[2]]) === id) aba.deleteRow(i + 1);
    }
  });
  return true;
}

// ---------- Leitura da nota com IA ----------

/**
 * Envia as fotos e/ou PDFs da nota para o Claude e devolve os itens lidos, já
 * associados aos produtos do catálogo da contagem.
 * catalogo: lista de "Categoria | Produto" (o índice é usado na resposta).
 */
function lerNota(fotos, catalogo) {
  const chave = props_().getProperty('ANTHROPIC_API_KEY');
  if (!chave) throw new Error('Cadastre a chave da API na aba Configurações.');

  const listaProdutos = catalogo.map(function (p, i) { return i + ' | ' + p; }).join('\n');
  const instrucoes =
    'Você lê fotos e PDFs de notas fiscais (DANFE) e cupons fiscais brasileiros de compras de uma sorveteria (Fast Shake) ' +
    'e extrai os itens comprados para dar entrada no estoque.\n\n' +
    'Para cada item da nota, informe:\n' +
    '- descricao: o texto do item como está na nota.\n' +
    '- quantidade: a quantidade comprada, na unidade da nota.\n' +
    '- unidadeNota: a unidade da nota (UN, CX, FD, PCT, KG, L etc.).\n' +
    '- unidadesPorEmbalagem: quantas unidades vêm em cada embalagem comprada, quando a descrição deixar claro ' +
    '(ex.: "CX C/12" = 12, "FD 6X2L" = 6). Use 1 quando o item foi comprado por unidade. Use 0 quando não der para saber.\n' +
    '- valorTotal: o valor total pago no item (com descontos do item), em reais.\n' +
    '- produto: o número do produto do catálogo abaixo que corresponde ao item, ou -1 quando nenhum corresponde ' +
    '(por exemplo, itens que não são controlados no estoque).\n' +
    '- confianca: "alta", "media" ou "baixa" para a associação com o produto.\n\n' +
    'Informe também o fornecedor (nome do emitente), o número do documento, a data de emissão (AAAA-MM-DD) e o ' +
    'valor total da nota. Deixe vazio (ou 0) o que não estiver legível; não invente valores.\n\n' +
    'Catálogo de produtos do estoque (número | categoria | produto):\n' + listaProdutos;

  const conteudo = fotos.map(function (arq) {
    if (arq.tipo === 'application/pdf') {
      return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: arq.dados } };
    }
    return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: arq.dados } };
  });
  conteudo.push({ type: 'text', text: 'Extraia os itens desta nota/cupom fiscal.' });

  const esquema = {
    type: 'object',
    additionalProperties: false,
    required: ['fornecedor', 'documento', 'data', 'valorNota', 'itens'],
    properties: {
      fornecedor: { type: 'string' },
      documento: { type: 'string' },
      data: { type: 'string' },
      valorNota: { type: 'number' },
      itens: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['descricao', 'quantidade', 'unidadeNota', 'unidadesPorEmbalagem', 'valorTotal', 'produto', 'confianca'],
          properties: {
            descricao: { type: 'string' },
            quantidade: { type: 'number' },
            unidadeNota: { type: 'string' },
            unidadesPorEmbalagem: { type: 'number' },
            valorTotal: { type: 'number' },
            produto: { type: 'integer' },
            confianca: { type: 'string', enum: ['alta', 'media', 'baixa'] },
          },
        },
      },
    },
  };

  const corpo = {
    model: MODELO_IA,
    max_tokens: 16000,
    // Leitura de nota é uma extração direta: esforço baixo responde mais
    // rápido e cabe no tempo limite do Apps Script.
    output_config: { effort: 'low', format: { type: 'json_schema', schema: esquema } },
    // Se o modelo recusar a solicitação, a própria API tenta outro modelo.
    fallbacks: 'default',
    system: instrucoes,
    messages: [{ role: 'user', content: conteudo }],
  };

  const resposta = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': chave,
      'anthropic-version': '2026-10-21',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
    },
    payload: JSON.stringify(corpo),
    muteHttpExceptions: true,
  });

  const status = resposta.getResponseCode();
  const json = JSON.parse(resposta.getContentText() || '{}');
  if (status !== 200) {
    const msg = json.error && json.error.message ? json.error.message : 'HTTP ' + status;
    if (status === 401) throw new Error('Chave da API inválida. Confira em Configurações.');
    if (status === 429 || status === 529) throw new Error('Serviço da IA ocupado no momento. Tente de novo em instantes.');
    throw new Error('Erro ao ler a nota: ' + msg);
  }
  if (json.stop_reason === 'refusal') throw new Error('A IA não conseguiu processar esta imagem. Lance os itens manualmente.');
  if (json.stop_reason === 'max_tokens') throw new Error('A nota é longa demais para uma leitura só. Envie em partes (menos arquivos por vez).');

  const texto = (json.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
  return JSON.parse(texto);
}

// ---------- Utilidades ----------

function aba_(ss, nome, cabecalho) {
  let aba = ss.getSheetByName(nome);
  if (!aba) {
    aba = ss.insertSheet(nome);
    aba.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho])
      .setFontWeight('bold').setBackground('#273393').setFontColor('#FFFFFF').setWrap(true);
    aba.setFrozenRows(1);
  }
  return aba;
}

function linhas_(ss, nome, cabecalho) {
  const aba = aba_(ss, nome, cabecalho);
  if (aba.getLastRow() < 2) return [];
  return aba.getRange(2, 1, aba.getLastRow() - 1, cabecalho.length).getValues();
}

function pastaFotos_() {
  const p = props_();
  const id = p.getProperty('PASTA_FOTOS_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* pasta apagada: cria outra */ }
  }
  const pasta = DriveApp.createFolder(PASTA_FOTOS);
  p.setProperty('PASTA_FOTOS_ID', pasta.getId());
  return pasta;
}

function num_(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

// Evita que um texto vire fórmula na planilha.
function texto_(v) {
  const s = String(v == null ? '' : v).slice(0, 500);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
