// Formulário para o cliente preencher o custo dos produtos que ainda não têm
// custo. Os valores vão direto para a aba "Custos" da planilha, pelo mesmo
// script que recebe as contagens.
(function () {
  'use strict';

  const CHAVE_RASCUNHO = 'fastshake-custos-rascunho-v1';
  const CHAVE_NOME = 'fastshake-custos-nome-v1';
  const app = document.getElementById('app');
  const url = (window.CONFIG.URL_PLANILHA || '').trim();

  let produtos = [];
  let rascunho = carregar(CHAVE_RASCUNHO) || {};

  function carregar(chave) {
    try { return JSON.parse(localStorage.getItem(chave)); } catch (e) { return null; }
  }
  function guardar(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* sem armazenamento */ }
  }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  // Aceita "1.234,56", "3,50", "3.50" e "R$ 3,50".
  function lerValor(t) {
    let v = String(t == null ? '' : t).replace(/R\$\s?/, '').trim();
    if (!v) return null;
    if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, '');
    const n = Number(v);
    return isFinite(n) && n >= 0 ? n : null;
  }
  function formatar(n) {
    return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4, useGrouping: false });
  }
  const chave = (p) => p.categoria + '|' + p.produto;

  // Mesma ordem de categorias do app de contagem.
  function agrupar(lista) {
    const ordem = window.CATEGORIAS.map((c) => c.nome);
    const grupos = {};
    lista.forEach((p) => { (grupos[p.categoria] = grupos[p.categoria] || []).push(p); });
    return Object.keys(grupos).sort((a, b) => {
      const ia = ordem.indexOf(a), ib = ordem.indexOf(b);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    }).map((g) => ({ nome: g, itens: grupos[g] }));
  }

  function telaEstado(html) {
    app.innerHTML = `<section class="inicio"><img class="logo" src="img/logo.png" alt="Fast Shake"><div class="estado">${html}</div></section>`;
  }

  async function carregarPendentes() {
    telaEstado('<span class="carregando escuro"></span> Carregando produtos…');
    if (!url) { telaEstado('<p>Formulário ainda não configurado.</p>'); return; }
    try {
      const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'acao=custos-pendentes');
      const json = await r.json();
      if (!json || !Array.isArray(json.produtos)) throw new Error('resposta inválida');
      produtos = json.produtos;
      if (!produtos.length) { telaConcluido(); return; }
      telaFormulario();
    } catch (e) {
      telaEstado(`<p>Não foi possível carregar a lista de produtos. Verifique a internet.</p>
        <button class="btn btn-primario" id="tentar">Tentar de novo</button>`);
      document.getElementById('tentar').onclick = carregarPendentes;
    }
  }

  function telaConcluido(enviados) {
    telaEstado(`<div class="selo" style="width:80px;height:80px;border-radius:50%;background:var(--verde-claro);color:var(--verde);display:grid;place-items:center;font-size:2.6rem">✓</div>
      <h1 style="color:var(--laranja)">${enviados ? 'Custos enviados!' : 'Tudo preenchido!'}</h1>
      <p>${enviados ? `${enviados} custo(s) recebido(s). ` : ''}Todos os produtos já têm custo cadastrado. Obrigado!</p>`);
  }

  function telaFormulario() {
    const nome = carregar(CHAVE_NOME) || '';
    const grupos = agrupar(produtos);
    app.innerHTML = `
      <section class="inicio" style="padding-bottom:130px">
        <img class="logo" src="img/logo.png" alt="Fast Shake">
        <div class="faixa-titulo">
          <h1>Custos dos produtos</h1>
          <p>Informe quanto custa <strong>1 unidade</strong> de cada produto, do jeito que a loja conta: 1 frasco, 1 galão, 1 copo, 1 lata, 1 pacotinho…</p>
        </div>
        <div class="alerta-envio" id="alerta-envio" hidden></div>
        <div class="cartao">
          <div class="campo"><label for="nome">Seu nome</label>
            <input id="nome" type="text" autocomplete="name" value="${esc(nome)}" placeholder="Quem está preenchendo"></div>
          <p class="aviso">Não sabe o preço de 1 unidade? Toque em <strong>Calcular pela caixa</strong> e informe o preço da caixa (ou fardo, ou pacote) e quantas unidades vêm nela.
            Pode preencher só os que souber e enviar; os outros continuam aqui para depois.</p>
          <p class="aviso"><strong>Importante:</strong> os valores só chegam quando você toca no botão laranja <strong>Enviar</strong>, lá embaixo.</p>
        </div>
        <div id="grupos">${grupos.map((g) => `
          <h2 class="grupo-titulo">${esc(g.nome)}</h2>
          <ul class="lista-custos">${g.itens.map((p) => {
            const v = rascunho[chave(p)] || '';
            return `<li class="custo-item ${lerValor(v) != null ? 'preenchido' : ''}" data-chave="${esc(chave(p))}">
              <div class="custo-linha">
                <div class="item-nome"><span class="ok" aria-hidden="true">✓</span>${esc(p.produto)}</div>
                <label class="campo-real"><span>R$</span>
                  <input type="text" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${esc(v)}" data-campo="custo"
                    aria-label="Custo de 1 unidade de ${esc(p.produto)}"></label>
              </div>
              <button type="button" class="link-calc" data-calc>Calcular pela caixa</button>
              <div class="calc">
                <div class="custo-linha"><span>Preço da caixa/fardo/pacote (R$)</span><input type="text" inputmode="decimal" data-calc-preco></div>
                <div class="custo-linha"><span>Unidades que vêm nela</span><input type="text" inputmode="numeric" data-calc-qtd></div>
              </div>
            </li>`;
          }).join('')}</ul>`).join('')}</div>
      </section>
      <footer class="rodape">
        <div class="rodape-interno" style="grid-template-columns:1fr">
          <button class="btn btn-primario" id="enviar">Enviar custos</button>
          <p class="falta" id="status"></p>
        </div>
      </footer>`;

    const lista = document.getElementById('grupos');
    const status = document.getElementById('status');
    const botao = document.getElementById('enviar');

    function atualizar() {
      const preenchidos = produtos.filter((p) => lerValor(rascunho[chave(p)]) != null).length;
      botao.disabled = !preenchidos;
      botao.textContent = preenchidos ? `Enviar ${preenchidos} custo(s)` : 'Enviar custos';
      status.textContent = `${preenchidos} de ${produtos.length} produtos preenchidos`;
      const alerta = document.getElementById('alerta-envio');
      alerta.hidden = !preenchidos;
      alerta.innerHTML = `<strong>${preenchidos} custo(s) digitado(s) ainda não enviado(s).</strong> Toque em <strong>Enviar</strong> para eles chegarem.`;
    }

    function gravar(li, valor) {
      rascunho[li.dataset.chave] = valor;
      guardar(CHAVE_RASCUNHO, rascunho);
      li.classList.toggle('preenchido', lerValor(valor) != null);
      atualizar();
    }

    document.getElementById('nome').oninput = (e) => guardar(CHAVE_NOME, e.target.value.trim());

    lista.addEventListener('input', (e) => {
      const li = e.target.closest('.custo-item');
      if (!li) return;
      if (e.target.dataset.campo === 'custo') { gravar(li, e.target.value); return; }
      // Calculadora: preço da embalagem ÷ unidades.
      const preco = lerValor(li.querySelector('[data-calc-preco]').value);
      const qtd = lerValor(li.querySelector('[data-calc-qtd]').value);
      if (preco != null && qtd > 0) {
        const unidade = Math.round((preco / qtd) * 10000) / 10000;
        const campo = li.querySelector('[data-campo="custo"]');
        campo.value = formatar(unidade);
        gravar(li, campo.value);
      }
    });
    lista.addEventListener('click', (e) => {
      const b = e.target.closest('[data-calc]');
      if (!b) return;
      const li = b.closest('.custo-item');
      li.classList.toggle('calculando');
      if (li.classList.contains('calculando')) li.querySelector('[data-calc-preco]').focus();
    });
    lista.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.target.dataset.campo !== 'custo') return;
      e.preventDefault();
      const campos = [...lista.querySelectorAll('[data-campo="custo"]')];
      const proximo = campos.slice(campos.indexOf(e.target) + 1).find((c) => !c.value) || campos[campos.indexOf(e.target) + 1];
      if (proximo) proximo.focus(); else e.target.blur();
    });

    botao.onclick = async () => {
      const nomeAtual = document.getElementById('nome').value.trim();
      if (!nomeAtual) { status.innerHTML = '<span class="aviso-erro">Informe seu nome antes de enviar.</span>'; document.getElementById('nome').focus(); return; }
      const custos = produtos.map((p) => ({ categoria: p.categoria, produto: p.produto, custo: lerValor(rascunho[chave(p)]) }))
        .filter((c) => c.custo != null);
      if (!confirm(`Enviar ${custos.length} custo(s)?`)) return;
      botao.disabled = true;
      botao.innerHTML = '<span class="carregando"></span> Enviando…';
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ acao: 'custos', nome: nomeAtual, custos }),
        });
        const json = await r.json();
        if (!json.ok) throw new Error(json.erro || 'erro');
        custos.forEach((c) => { delete rascunho[chave(c)]; });
        guardar(CHAVE_RASCUNHO, rascunho);
        const enviados = json.gravados;
        produtos = produtos.filter((p) => !custos.some((c) => chave(c) === chave(p)));
        if (!produtos.length) { telaConcluido(enviados); return; }
        telaFormulario();
        document.getElementById('status').textContent = `${enviados} custo(s) enviado(s). Faltam ${produtos.length}.`;
        window.scrollTo(0, 0);
      } catch (e) {
        botao.disabled = false;
        atualizar();
        status.innerHTML = '<span class="aviso-erro">Não foi possível enviar. Verifique a internet e tente de novo — nada foi perdido.</span>';
      }
    };

    atualizar();
  }

  // Avisa antes de sair da página com custos digitados e não enviados.
  window.addEventListener('beforeunload', (e) => {
    const pendentes = produtos.some((p) => lerValor(rascunho[chave(p)]) != null);
    if (pendentes) { e.preventDefault(); e.returnValue = ''; }
  });

  carregarPendentes();
})();
