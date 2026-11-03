/**
 * Recebe as contagens do app Fast Shake e grava na planilha.
 * Cole este código em Extensões > Apps Script da sua planilha (veja o README).
 */

// Coloque seu e-mail para receber um aviso a cada contagem enviada (ou deixe vazio).
const EMAIL_AVISO = '';

const ABA_RESUMO = 'Resumo';
const ABA_CONTAGENS = 'Contagens';
const ABA_PRODUTOS_NOVOS = 'Produtos novos';
const ABA_CUSTOS = 'Custos';
const CABECALHO_CUSTOS = ['Categoria', 'Produto', 'Custo por unidade (R$)', 'Vigente desde', 'Origem', 'ID compra', 'Registrado em'];
const CABECALHO_RESUMO = ['Data/hora', 'Unidade', 'Responsável', 'Itens contados', 'Itens zerados', 'Observações',
  'Início da contagem', 'ID', 'Categorias não contadas'];
const CABECALHO_CONTAGENS = ['Data/hora', 'Unidade', 'Responsável', 'Categoria', 'Produto', 'Situação',
  'Forma de contagem', 'Embalagens fechadas', 'Unidades por embalagem', 'Unidades soltas', 'Total (unidades)', 'ID'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents);
    if (d && d.acao === 'custos') return responder(salvarCustosFormulario_(d));
    if (!d || !d.id || !d.unidade || !Array.isArray(d.itens) || d.itens.length === 0) {
      return responder({ ok: false, erro: 'Dados incompletos' });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const resumo = obterAba(ss, ABA_RESUMO, CABECALHO_RESUMO);
    const contagens = obterAba(ss, ABA_CONTAGENS, CABECALHO_CONTAGENS);

    // Se o gerente tocar em "enviar" duas vezes, grava só uma.
    const repetido = resumo.getRange('H:H').createTextFinder(texto(d.id)).matchEntireCell(true).findNext();
    if (repetido) return responder({ ok: true, repetido: true });

    const quando = new Date(d.enviadoEm || Date.now());
    const unidade = texto(d.unidade);
    const responsavel = texto(d.responsavel);

    const linhas = d.itens.map(function (i) {
      return [quando, unidade, responsavel, texto(i.categoria), texto(i.produto), texto(i.situacao),
        texto(i.forma), numero(i.embalagens), numero(i.unidadesPorEmbalagem), numero(i.unidadesSoltas),
        numero(i.totalUnidades), texto(d.id)];
    });
    contagens.getRange(contagens.getLastRow() + 1, 1, linhas.length, linhas[0].length).setValues(linhas);

    const contados = d.itens.filter(function (i) { return i.situacao === 'Contada'; });
    const zerados = contados.filter(function (i) { return i.totalUnidades === 0; });
    const naoContadas = (d.categoriasNaoContadas || []).join(', ');
    resumo.appendRow([quando, unidade, responsavel, contados.length, zerados.length, texto(d.observacoes),
      d.iniciadoEm ? new Date(d.iniciadoEm) : '', texto(d.id), texto(naoContadas)]);

    if (EMAIL_AVISO) {
      MailApp.sendEmail(EMAIL_AVISO,
        'Contagem de estoque enviada: ' + d.unidade,
        'Unidade: ' + d.unidade + '\nResponsável: ' + d.responsavel +
        (naoContadas ? '\nCategorias não contadas: ' + naoContadas : '') +
        '\nItens zerados (' + zerados.length + '): ' + zerados.map(function (i) { return i.produto; }).join(', ') +
        (d.observacoes ? '\nObservações: ' + d.observacoes : '') +
        '\n\nPlanilha: ' + ss.getUrl());
    }

    return responder({ ok: true });
  } catch (err) {
    return responder({ ok: false, erro: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// Permite testar o endereço no navegador.
// ?acao=produtos devolve os produtos criados no Painel DRE (aba
// "Produtos novos"), para o app de contagem incluir na lista.
// Sem parâmetro, só confirma que o endereço funciona.
function doGet(e) {
  if (e && e.parameter && e.parameter.acao === 'custos-pendentes') {
    return responder({ ok: true, produtos: produtosSemCusto_(SpreadsheetApp.getActiveSpreadsheet()) });
  }
  if (e && e.parameter && e.parameter.acao === 'produtos') {
    const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ABA_PRODUTOS_NOVOS);
    const produtos = !aba || aba.getLastRow() < 2 ? [] : aba.getRange(2, 1, aba.getLastRow() - 1, 2).getValues()
      .filter(function (r) { return r[0] && r[1]; })
      .map(function (r) { return { categoria: String(r[0]).trim(), produto: String(r[1]).trim() }; });
    return responder({ ok: true, produtos: produtos });
  }
  return responder({ ok: true, app: 'Contagem Fast Shake' });
}

// ---------- Formulário de custos (custos.html) ----------

// Produtos das contagens e da aba "Produtos novos" que ainda não têm
// nenhum custo na aba "Custos". Devolve só os nomes, nunca valores.
function produtosSemCusto_(ss) {
  const lista = [];
  const vistos = {};
  const incluir = function (cat, prod) {
    cat = String(cat).trim();
    prod = String(prod).trim();
    const k = cat + '|' + prod;
    if (cat && prod && !vistos[k]) { vistos[k] = true; lista.push({ categoria: cat, produto: prod }); }
  };
  const contagens = ss.getSheetByName(ABA_CONTAGENS);
  if (contagens && contagens.getLastRow() > 1) {
    contagens.getRange(2, 4, contagens.getLastRow() - 1, 2).getValues().forEach(function (r) { incluir(r[0], r[1]); });
  }
  const novos = ss.getSheetByName(ABA_PRODUTOS_NOVOS);
  if (novos && novos.getLastRow() > 1) {
    novos.getRange(2, 1, novos.getLastRow() - 1, 2).getValues().forEach(function (r) { incluir(r[0], r[1]); });
  }
  const comCusto = {};
  const custos = ss.getSheetByName(ABA_CUSTOS);
  if (custos && custos.getLastRow() > 1) {
    custos.getRange(2, 1, custos.getLastRow() - 1, 2).getValues().forEach(function (r) {
      comCusto[String(r[0]).trim() + '|' + String(r[1]).trim()] = true;
    });
  }
  return lista.filter(function (p) { return !comCusto[p.categoria + '|' + p.produto]; });
}

// Grava os custos enviados pelo formulário como custo inicial. Só aceita
// produtos que ainda não têm custo, para o formulário nunca alterar um
// custo que já existe.
function salvarCustosFormulario_(d) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pendentes = {};
  produtosSemCusto_(ss).forEach(function (p) { pendentes[p.categoria + '|' + p.produto] = true; });
  const origem = 'Formulário de custos' + (d.nome ? ' (' + String(d.nome).slice(0, 60) + ')' : '');
  const agora = new Date();
  const desde = new Date('2000-01-01T12:00:00');
  const linhas = [];
  let ignorados = 0;
  (Array.isArray(d.custos) ? d.custos : []).forEach(function (c) {
    const k = String(c.categoria).trim() + '|' + String(c.produto).trim();
    const custo = Number(c.custo);
    if (!pendentes[k] || !isFinite(custo) || custo < 0 || custo > 100000) { ignorados++; return; }
    delete pendentes[k];
    linhas.push([texto(c.categoria), texto(c.produto), Math.round(custo * 10000) / 10000, desde, texto(origem), '', agora]);
  });
  if (linhas.length) {
    let aba = ss.getSheetByName(ABA_CUSTOS);
    if (!aba) {
      aba = ss.insertSheet(ABA_CUSTOS);
      aba.getRange(1, 1, 1, CABECALHO_CUSTOS.length).setValues([CABECALHO_CUSTOS])
        .setFontWeight('bold').setBackground('#273393').setFontColor('#FFFFFF').setWrap(true);
      aba.setFrozenRows(1);
    }
    aba.getRange(aba.getLastRow() + 1, 1, linhas.length, CABECALHO_CUSTOS.length).setValues(linhas);
  }
  return { ok: true, gravados: linhas.length, ignorados: ignorados };
}

// Rode uma vez pelo editor para criar as abas formatadas.
function configurar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  obterAba(ss, ABA_RESUMO, CABECALHO_RESUMO);
  obterAba(ss, ABA_CONTAGENS, CABECALHO_CONTAGENS);
}

// Cria a aba se não existir. Se ela existir num formato antigo, guarda a
// antiga com outro nome e cria uma nova, para não misturar colunas.
function obterAba(ss, nome, cabecalho) {
  let aba = ss.getSheetByName(nome);
  if (aba) {
    const atual = aba.getRange(1, 1, 1, cabecalho.length).getValues()[0];
    const igual = cabecalho.every(function (c, i) { return atual[i] === c; });
    if (igual) return aba;
    if (nome === ABA_RESUMO && atual.slice(0, 8).every(function (c, i) { return c === cabecalho[i] || i === 3; })) {
      // Resumo antigo: só acrescenta a coluna nova no fim.
      aba.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho])
        .setFontWeight('bold').setBackground('#ED4400').setFontColor('#FFFFFF');
      return aba;
    }
    aba.setName(nome + ' (formato antigo ' + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'dd-MM-yyyy') + ')');
  }
  aba = ss.insertSheet(nome, 0);
  aba.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho])
    .setFontWeight('bold').setBackground('#ED4400').setFontColor('#FFFFFF').setWrap(true);
  aba.setFrozenRows(1);
  aba.getRange('A:A').setNumberFormat('dd/MM/yyyy HH:mm');
  aba.setColumnWidths(1, cabecalho.length, 130);
  aba.getRange(1, 1, 1, cabecalho.length).createFilter();
  return aba;
}

// Evita que um texto digitado vire fórmula na planilha.
function texto(v) {
  const s = String(v == null ? '' : v).slice(0, 500);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function numero(v) {
  if (v === '' || v == null) return '';
  const n = Number(v);
  return isFinite(n) ? n : '';
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
