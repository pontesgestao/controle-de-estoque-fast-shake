/**
 * Recebe as contagens do app Fast Shake e grava na planilha.
 * Cole este código em Extensões > Apps Script da sua planilha (veja o README).
 */

// Coloque seu e-mail para receber um aviso a cada contagem enviada (ou deixe vazio).
const EMAIL_AVISO = '';

const ABA_RESUMO = 'Resumo';
const ABA_CONTAGENS = 'Contagens';
const CABECALHO_RESUMO = ['Data/hora', 'Unidade', 'Responsável', 'Itens', 'Itens zerados', 'Observações', 'Início da contagem', 'ID'];
const CABECALHO_CONTAGENS = ['Data/hora', 'Unidade', 'Responsável', 'Categoria', 'Produto', 'Quantidade', 'Medida', 'Unidades soltas', 'ID'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents);
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
      return [quando, unidade, responsavel, texto(i.categoria), texto(i.produto),
        numero(i.quantidade), texto(i.medida), i.avulsas === '' ? '' : numero(i.avulsas), texto(d.id)];
    });
    contagens.getRange(contagens.getLastRow() + 1, 1, linhas.length, linhas[0].length).setValues(linhas);

    const zerados = d.itens.filter(function (i) { return Number(i.quantidade) === 0 && !Number(i.avulsas); });
    resumo.appendRow([quando, unidade, responsavel, d.itens.length, zerados.length,
      texto(d.observacoes), d.iniciadoEm ? new Date(d.iniciadoEm) : '', texto(d.id)]);

    if (EMAIL_AVISO) {
      MailApp.sendEmail(EMAIL_AVISO,
        'Contagem de estoque enviada: ' + d.unidade,
        'Unidade: ' + d.unidade + '\nResponsável: ' + d.responsavel +
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
function doGet() {
  return responder({ ok: true, app: 'Contagem Fast Shake' });
}

// Rode uma vez pelo editor para criar as abas formatadas.
function configurar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  obterAba(ss, ABA_RESUMO, CABECALHO_RESUMO);
  obterAba(ss, ABA_CONTAGENS, CABECALHO_CONTAGENS);
}

function obterAba(ss, nome, cabecalho) {
  let aba = ss.getSheetByName(nome);
  if (!aba) {
    aba = ss.insertSheet(nome);
    aba.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho])
      .setFontWeight('bold').setBackground('#ED4400').setFontColor('#FFFFFF');
    aba.setFrozenRows(1);
    aba.getRange('A:A').setNumberFormat('dd/MM/yyyy HH:mm');
    aba.setColumnWidths(1, cabecalho.length, 140);
    aba.getRange(1, 1, 1, cabecalho.length).createFilter();
  }
  return aba;
}

// Evita que um texto digitado vire fórmula na planilha.
function texto(v) {
  const s = String(v == null ? '' : v).slice(0, 500);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function numero(v) {
  const n = Number(v);
  return isFinite(n) ? n : '';
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
