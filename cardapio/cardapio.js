// Cardápio interativo Fast Shake: o cliente monta a sacola e envia o pedido
// pelo WhatsApp da loja (mensagem pronta) ou baixa o PDF do pedido.
(function () {
  'use strict';

  const WHATSAPP_LOJA = '5543988501854';
  const VERSAO = 5;
  const TELEFONE_LOJA = '(43) 98850-1854';
  // Categorias escondidas por enquanto (apague da lista para voltar a mostrar).
  const OCULTAS = ['Promoções', 'Casquinha e Cascão'];
  const CHAVE_SACOLA = 'fastshake-sacola-v1';
  const CHAVE_CLIENTE = 'fastshake-cliente-v1';

  // ---------- Opções dos itens montados na hora ----------
  const ADICIONAIS = [
    { nome: 'Nutella', preco: 4 }, { nome: 'Ferrero Rocher', preco: 4 }, { nome: 'Ovomaltine', preco: 3 },
    { nome: 'Amendoim', preco: 3 }, { nome: 'Granulado', preco: 3 }, { nome: 'Paçoca', preco: 1.5 }, { nome: 'Tubete', preco: 0.5 },
  ];
  const SABORES = ['Baunilha', 'Chocolate', 'Frozen', 'Leite Condensado', 'Leite Ninho', 'Maracujá', 'Morango', 'Uva'];
  const COBERTURAS = ['Abacaxi', 'Amendoim', 'Amora', 'Banana', 'Baunilha', 'Beijinho', 'Blue Ice', 'Bombom', 'Brigadeiro',
    'Cappuccino', 'Caramelo', 'Cereja', 'Chocolate', 'Chocolate Branco', 'Coco', 'Cupuaçu', 'Doce de Leite', 'Floresta Negra',
    'Frutas Tropicais', 'Frutas Vermelhas', 'Goiaba', 'Groselha', 'Iogurte', 'Kiwi', 'Leite Condensado', 'Limão', 'Mamão',
    'Maracujá', 'Melão', 'Menta', 'Milho Verde', 'Morango', 'Nozes', 'Pêssego', 'Pistache', 'Tutti-frutti', 'Uva', 'Vinho'];
  const ACOMPANHAMENTOS = ['Banana', 'Morango', 'Kiwi', 'Granola', 'Leite Condensado', 'Leite Ninho', 'Leitinho', 'Ninho Trufado',
    'Paçoca', 'Amendoim', 'Granulado', 'Chocoball', 'Confete', 'Sucrilhos', 'Flocos de Arroz', 'Coco Ralado', 'Ovomaltine em Pó', 'Cupuaçu'];
  const TOPPINGS_CASCAO = ['Amendoim', 'Coco Ralado', 'Granulado', 'Ovomaltine'];

  const GRUPO_ADICIONAIS = { id: 'adicionais', titulo: 'Adicionais', tipo: 'varios', itens: ADICIONAIS };
  const OPCOES = {
    milkshake: [{ id: 'sabor', titulo: 'Sabor', tipo: 'um', obrigatorio: true, itens: SABORES }, GRUPO_ADICIONAIS],
    sundae: [
      { id: 'sabor', titulo: 'Sabor do sorvete', tipo: 'um', obrigatorio: true, itens: SABORES },
      { id: 'cobertura', titulo: 'Cobertura', tipo: 'um', obrigatorio: true, itens: COBERTURAS },
      GRUPO_ADICIONAIS,
    ],
    acai: [{ id: 'acomp', titulo: 'Acompanhamentos', tipo: 'varios', itens: ACOMPANHAMENTOS }, GRUPO_ADICIONAIS],
    cascao: [{ id: 'topping', titulo: 'Topping', tipo: 'um', itens: TOPPINGS_CASCAO }],
    promo: [{ id: 'sabores', titulo: 'Quais sabores?', tipo: 'texto', obrigatorio: true,
      dica: 'Picolés de fruta e ao leite. Ex.: 5 morango ao leite, 3 limão, 2 uva' }],
  };
  const DICAS_CATEGORIA = {
    'Promoções': 'Escolha os sabores dos picolés de fruta e ao leite.',
    'Milk Shake': 'Escolha o sabor e, se quiser, adicionais.',
    'Açaí': 'Monte do seu jeito: escolha os acompanhamentos.',
    'Sundae': 'Escolha o sabor do sorvete e a cobertura.',
  };
  const DETALHE_OPCOES = { milkshake: 'Escolha o sabor', sundae: 'Sabor + cobertura', acai: 'Monte do seu jeito', cascao: 'Com topping', promo: 'Escolha os sabores' };

  // ---------- Utilidades ----------
  const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function carregar(chave) { try { return JSON.parse(localStorage.getItem(chave)); } catch (e) { return null; } }
  function guardar(chave, v) { try { localStorage.setItem(chave, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } }
  const semAcento = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }

  const itens = window.CARDAPIO_ITENS.filter((i) => !OCULTAS.includes(i.categoria));
  const porCodigo = {};
  itens.forEach((i) => { porCodigo[i.codigo] = i; });
  const categorias = [];
  itens.forEach((i) => { if (!categorias.includes(i.categoria)) categorias.push(i.categoria); });
  const idCategoria = (c) => 'cat-' + semAcento(c).replace(/[^a-z0-9]+/g, '-');

  // Sacola: [{ id, codigo, qtd, precoUnit, escolhas: [{ titulo, texto }], obs }]
  let sacola = (carregar(CHAVE_SACOLA) || []).filter((l) => porCodigo[l.codigo]);
  const salvarSacola = () => guardar(CHAVE_SACOLA, sacola);
  const qtdTotal = () => sacola.reduce((s, l) => s + l.qtd, 0);
  const valorTotal = () => sacola.reduce((s, l) => s + l.qtd * l.precoUnit, 0);
  const linhaSimples = (codigo) => sacola.find((l) => l.codigo === codigo && !l.escolhas.length && !l.obs);

  // ---------- Página ----------
  const app = document.getElementById('app');
  app.innerHTML = `
    <header class="capa">
      <img src="../img/logo.png" alt="Fast Shake">
      <h1>Cardápio</h1>
      <p>Monte seu pedido e envie pelo WhatsApp</p>
    </header>
    <div class="barra-fixa">
      <div class="barra-interna">
        <input class="busca" id="busca" type="search" placeholder="Buscar no cardápio…" aria-label="Buscar no cardápio">
        <nav class="categorias" id="categorias" aria-label="Categorias">
          ${categorias.map((c) => `<button data-cat="${esc(idCategoria(c))}">${esc(c)}</button>`).join('')}
        </nav>
      </div>
    </div>
    <main id="lista"></main>
    <div class="barra-sacola" id="barra-sacola" hidden>
      <button id="abrir-sacola"><span>Ver sacola <span class="contagem" id="sacola-qtd"></span></span><span class="num" id="sacola-total"></span></button>
    </div>`;

  const lista = document.getElementById('lista');
  let busca = '';

  function htmlProduto(i) {
    const linha = !i.opcoes && linhaSimples(i.codigo);
    const naSacola = sacola.some((l) => l.codigo === i.codigo);
    const controle = linha
      ? `<div class="qtd"><button data-menos="${i.codigo}" aria-label="Diminuir ${esc(i.nome)}">−</button><span>${linha.qtd}</span>
         <button data-mais="${i.codigo}" aria-label="Aumentar ${esc(i.nome)}">+</button></div>`
      : `<button class="btn-add" data-add="${i.codigo}" aria-label="Adicionar ${esc(i.nome)}">+</button>`;
    return `<li class="produto ${naSacola ? 'na-sacola' : ''}" data-codigo="${i.codigo}">
      <div class="info"><div class="nome">${esc(i.nome)}</div>
        ${i.opcoes ? `<div class="detalhe">${esc(DETALHE_OPCOES[i.opcoes] || '')}</div>` : ''}
        <div class="preco num">${brl(i.preco)}</div></div>
      ${controle}</li>`;
  }

  function desenharLista() {
    const b = semAcento(busca.trim());
    const secoes = categorias.map((c) => {
      const doGrupo = itens.filter((i) => i.categoria === c && (!b || semAcento(i.nome + ' ' + c).includes(b)));
      if (!doGrupo.length) return '';
      return `<section class="secao" id="${idCategoria(c)}"><h2>${esc(c)}</h2>
        ${DICAS_CATEGORIA[c] && !b ? `<p class="dica">${esc(DICAS_CATEGORIA[c])}</p>` : ''}
        <ul class="itens">${doGrupo.map(htmlProduto).join('')}</ul></section>`;
    }).join('');
    lista.innerHTML = (secoes || '<p class="vazio">Nenhum produto encontrado.</p>') +
      `<p class="versao">Fast Shake · cardápio versão ${VERSAO}</p>`;
    atualizarBarra();
    observarSecoes();
  }

  function atualizarBarra() {
    const q = qtdTotal();
    document.getElementById('barra-sacola').hidden = !q;
    document.getElementById('sacola-qtd').textContent = q + (q === 1 ? ' item' : ' itens');
    document.getElementById('sacola-total').textContent = brl(valorTotal());
  }

  // Redesenha só os cartões dos produtos que mudaram, sem refazer a lista toda
  // (refazer 200 cartões durante a rolagem deixa o celular travado).
  function atualizarProdutos(codigos) {
    new Set(codigos).forEach((codigo) => {
      const li = lista.querySelector(`li[data-codigo="${codigo}"]`);
      if (li) li.outerHTML = htmlProduto(porCodigo[codigo]);
    });
    atualizarBarra();
  }

  function adicionarSimples(codigo, delta) {
    let l = linhaSimples(codigo);
    if (!l && delta > 0) {
      l = { id: novoId(), codigo, qtd: 0, precoUnit: porCodigo[codigo].preco, escolhas: [], obs: '' };
      sacola.push(l);
    }
    if (!l) return;
    l.qtd += delta;
    if (l.qtd <= 0) sacola = sacola.filter((x) => x !== l);
    salvarSacola();
    atualizarProdutos([codigo]);
  }

  lista.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) {
      const i = porCodigo[add.dataset.add];
      if (i.opcoes) abrirOpcoes(i); else { adicionarSimples(i.codigo, 1); toast(`${i.nome} na sacola`); }
      return;
    }
    const mais = e.target.closest('[data-mais]');
    if (mais) { adicionarSimples(mais.dataset.mais, 1); return; }
    const menos = e.target.closest('[data-menos]');
    if (menos) adicionarSimples(menos.dataset.menos, -1);
  });

  document.getElementById('busca').addEventListener('input', (e) => { busca = e.target.value; desenharLista(); });
  document.getElementById('categorias').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    const alvo = document.getElementById(b.dataset.cat);
    if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // Destaca na barra a categoria que está no topo da tela. O navegador avisa
  // (IntersectionObserver) só quando uma seção entra ou sai dessa faixa, então
  // nada é calculado durante a rolagem e o dedo desliza livre no celular.
  const navCategorias = document.getElementById('categorias');
  const visiveis = new Set();
  let categoriaAtual = null;
  let centralizar = null;
  const observador = 'IntersectionObserver' in window ? new IntersectionObserver((entradas) => {
    entradas.forEach((e) => { if (e.isIntersecting) visiveis.add(e.target.id); else visiveis.delete(e.target.id); });
    const primeira = [...lista.querySelectorAll('.secao')].find((s) => visiveis.has(s.id));
    if (primeira) marcarCategoria(primeira.id);
  }, { rootMargin: '-150px 0px -60% 0px' }) : null;

  function marcarCategoria(id) {
    if (id === categoriaAtual) return;
    const antigo = navCategorias.querySelector('[aria-current="true"]');
    if (antigo) antigo.removeAttribute('aria-current');
    const btn = navCategorias.querySelector(`[data-cat="${id}"]`);
    categoriaAtual = id;
    if (!btn) return;
    btn.setAttribute('aria-current', 'true');
    // Centraliza o botão na barra um pouco depois, sem animação.
    clearTimeout(centralizar);
    centralizar = setTimeout(() => {
      navCategorias.scrollLeft = btn.offsetLeft - (navCategorias.clientWidth - btn.offsetWidth) / 2;
    }, 250);
  }

  function observarSecoes() {
    if (!observador) return;
    observador.disconnect();
    visiveis.clear();
    lista.querySelectorAll('.secao').forEach((s) => observador.observe(s));
  }

  // ---------- Janela de opções ----------
  function abrirJanela(html) {
    const dlg = document.createElement('dialog');
    dlg.className = 'folha';
    dlg.innerHTML = `<div class="folha-conteudo">${html}</div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-fechar]')) dlg.close(); });
    dlg.showModal();
    return dlg;
  }

  function abrirOpcoes(item) {
    const grupos = OPCOES[item.opcoes] || [];
    const htmlGrupo = (g) => {
      if (g.tipo === 'texto') {
        return `<div class="grupo"><h3>${esc(g.titulo)} ${g.obrigatorio ? '<small class="obrigatorio">obrigatório</small>' : ''}</h3>
          ${g.dica ? `<p class="aviso">${esc(g.dica)}</p>` : ''}<textarea data-grupo="${g.id}" style="margin-top:8px"></textarea></div>`;
      }
      const tipoInput = g.tipo === 'um' ? 'radio' : 'checkbox';
      return `<div class="grupo"><h3>${esc(g.titulo)}
          <small class="${g.obrigatorio ? 'obrigatorio' : ''}">${g.obrigatorio ? 'escolha 1 (obrigatório)' : g.tipo === 'um' ? 'escolha 1 (opcional)' : 'opcional'}</small></h3>
        <div class="opcoes ${g.itens.some((o) => typeof o !== 'string') ? 'com-preco' : ''}">${g.itens.map((o, k) => {
          const nome = typeof o === 'string' ? o : o.nome;
          const preco = typeof o === 'string' ? 0 : o.preco;
          return `<label class="opcao"><input type="${tipoInput}" name="${g.id}" value="${k}" data-grupo="${g.id}">
            <span>${esc(nome)}</span>${preco ? `<span class="extra">+ ${brl(preco)}</span>` : ''}</label>`;
        }).join('')}</div></div>`;
    };

    const dlg = abrirJanela(`
      <div class="folha-topo"><div><h2>${esc(item.nome)}</h2><div class="preco num">${brl(item.preco)}</div></div>
        <button class="fechar" data-fechar aria-label="Fechar">✕</button></div>
      <div class="folha-corpo">
        ${grupos.map(htmlGrupo).join('')}
        <div class="campo"><label for="obs-item">Observação (opcional)</label>
          <textarea id="obs-item" placeholder="Ex.: sem canudo, bem gelado…"></textarea></div>
      </div>
      <div class="folha-rodape">
        <p class="erro" id="erro-opcoes" hidden></p>
        <div class="linha-qtd">
          <div class="qtd"><button data-q="-1" aria-label="Diminuir quantidade">−</button><span id="q-item">1</span><button data-q="1" aria-label="Aumentar quantidade">+</button></div>
          <button class="btn btn-primario" id="confirmar-item">Adicionar <span class="num" id="total-item"></span></button>
        </div>
      </div>`);

    let qtd = 1;
    const ler = () => {
      let extra = 0;
      const escolhas = [];
      const faltando = [];
      grupos.forEach((g) => {
        if (g.tipo === 'texto') {
          const t = dlg.querySelector(`textarea[data-grupo="${g.id}"]`).value.trim();
          if (t) escolhas.push({ titulo: g.titulo.replace('?', ''), texto: t });
          else if (g.obrigatorio) faltando.push(g.titulo);
          return;
        }
        const marcados = [...dlg.querySelectorAll(`input[data-grupo="${g.id}"]:checked`)].map((inp) => g.itens[Number(inp.value)]);
        if (!marcados.length) { if (g.obrigatorio) faltando.push(g.titulo); return; }
        marcados.forEach((o) => { extra += typeof o === 'string' ? 0 : o.preco; });
        escolhas.push({ titulo: g.titulo, texto: marcados.map((o) => (typeof o === 'string' ? o : `${o.nome} (+${brl(o.preco)})`)).join(', ') });
      });
      return { precoUnit: item.preco + extra, escolhas, faltando };
    };
    const atualizar = () => {
      document.getElementById('q-item').textContent = qtd;
      document.getElementById('total-item').textContent = brl(ler().precoUnit * qtd);
    };
    dlg.addEventListener('change', () => { document.getElementById('erro-opcoes').hidden = true; atualizar(); });
    dlg.querySelectorAll('[data-q]').forEach((b) => { b.onclick = () => { qtd = Math.max(1, qtd + Number(b.dataset.q)); atualizar(); }; });
    document.getElementById('confirmar-item').onclick = () => {
      const r = ler();
      const erro = document.getElementById('erro-opcoes');
      if (r.faltando.length) { erro.textContent = 'Escolha: ' + r.faltando.join(', '); erro.hidden = false; return; }
      sacola.push({ id: novoId(), codigo: item.codigo, qtd, precoUnit: r.precoUnit, escolhas: r.escolhas, obs: document.getElementById('obs-item').value.trim() });
      salvarSacola();
      dlg.close();
      atualizarProdutos([item.codigo]);
      toast(`${item.nome} na sacola`);
    };
    atualizar();
  }

  // ---------- Sacola e envio ----------
  function abrirSacola() {
    const cliente = carregar(CHAVE_CLIENTE) || {};
    const dlg = abrirJanela(`
      <div class="folha-topo"><h2>Sua sacola</h2><button class="fechar" data-fechar aria-label="Fechar">✕</button></div>
      <div class="folha-corpo">
        <div id="linhas-sacola" style="display:flex;flex-direction:column;gap:10px"></div>
        <div class="total"><span>Total</span><span class="num" id="total-sacola"></span></div>
        <div class="grupo" style="display:flex;flex-direction:column;gap:12px">
          <div class="campo"><label for="c-nome">Seu nome</label><input id="c-nome" autocomplete="name" value="${esc(cliente.nome || '')}"></div>
          <div class="campo"><span class="rotulo">Como quer receber?</span>
            <div class="escolha-dupla">
              <label><input type="radio" name="modo" value="retirada" ${cliente.modo !== 'entrega' ? 'checked' : ''}> Retirar na loja</label>
              <label><input type="radio" name="modo" value="entrega" ${cliente.modo === 'entrega' ? 'checked' : ''}> Entrega</label>
            </div></div>
          <div class="campo" id="bloco-endereco"><label for="c-endereco">Endereço de entrega</label>
            <input id="c-endereco" autocomplete="street-address" placeholder="Rua, número, bairro" value="${esc(cliente.endereco || '')}">
            <p class="aviso">A taxa de entrega é combinada com a loja pelo WhatsApp.</p></div>
          <div class="campo"><label for="c-pagamento">Pagamento</label>
            <select id="c-pagamento">${['Pix', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro'].map((p) =>
              `<option ${p === cliente.pagamento ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
          <div class="campo" id="bloco-troco"><label for="c-troco">Troco para quanto? (opcional)</label>
            <input id="c-troco" inputmode="decimal" placeholder="Ex.: R$ 50,00"></div>
          <div class="campo"><label for="c-obs">Observações do pedido (opcional)</label><textarea id="c-obs"></textarea></div>
        </div>
      </div>
      <div class="folha-rodape">
        <p class="erro" id="erro-sacola" hidden></p>
        <button class="btn btn-whatsapp" id="enviar-whats">Enviar pedido em PDF pelo WhatsApp</button>
        <p class="aviso" id="aviso-envio">Vai abrir o compartilhamento do celular: escolha o <strong>WhatsApp</strong> e a conversa da
          <strong>Fast Shake ${TELEFONE_LOJA}</strong>.</p>
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">
          <button class="btn btn-texto" id="enviar-texto">Enviar só o texto do pedido</button>
          <button class="btn btn-texto" id="limpar-sacola" style="color:var(--erro)">Esvaziar sacola</button>
        </div>
      </div>`);

    const desenharLinhas = () => {
      const caixa = document.getElementById('linhas-sacola');
      if (!sacola.length) { dlg.close(); return; }
      caixa.innerHTML = sacola.map((l) => {
        const i = porCodigo[l.codigo];
        return `<div class="item-sacola" data-linha="${l.id}">
          <div class="cab"><span>${esc(i.nome)}</span><span class="num">${brl(l.precoUnit * l.qtd)}</span></div>
          ${l.escolhas.length || l.obs ? `<div class="escolhas">${l.escolhas.map((e) => `${esc(e.titulo)}: ${esc(e.texto)}`).join('<br>')}
            ${l.obs ? `${l.escolhas.length ? '<br>' : ''}Obs.: ${esc(l.obs)}` : ''}</div>` : ''}
          <div class="acoes"><div class="qtd"><button data-lq="-1" aria-label="Diminuir">−</button><span>${l.qtd}</span><button data-lq="1" aria-label="Aumentar">+</button></div>
            <button class="remover" data-remover>Remover</button></div></div>`;
      }).join('');
      document.getElementById('total-sacola').textContent = brl(valorTotal());
    };
    document.getElementById('linhas-sacola').addEventListener('click', (e) => {
      const caixa = e.target.closest('[data-linha]');
      if (!caixa) return;
      const l = sacola.find((x) => x.id === caixa.dataset.linha);
      const q = e.target.closest('[data-lq]');
      if (q) l.qtd += Number(q.dataset.lq);
      if (e.target.closest('[data-remover]') || l.qtd <= 0) sacola = sacola.filter((x) => x !== l);
      salvarSacola();
      desenharLinhas();
      atualizarProdutos([l.codigo]);
    });

    const mostrarCampos = () => {
      const modo = dlg.querySelector('input[name="modo"]:checked').value;
      document.getElementById('bloco-endereco').hidden = modo !== 'entrega';
      document.getElementById('bloco-troco').hidden = document.getElementById('c-pagamento').value !== 'Dinheiro';
    };
    dlg.addEventListener('change', mostrarCampos);
    dlg.addEventListener('input', () => { document.getElementById('erro-sacola').hidden = true; });

    const lerCliente = () => ({
      nome: document.getElementById('c-nome').value.trim(),
      modo: dlg.querySelector('input[name="modo"]:checked').value,
      endereco: document.getElementById('c-endereco').value.trim(),
      pagamento: document.getElementById('c-pagamento').value,
      troco: document.getElementById('c-troco').value.trim(),
      obs: document.getElementById('c-obs').value.trim(),
    });
    const validar = () => {
      const c = lerCliente();
      const erro = document.getElementById('erro-sacola');
      const falta = !c.nome ? 'Informe seu nome.' : c.modo === 'entrega' && !c.endereco ? 'Informe o endereço de entrega.' : '';
      erro.textContent = falta;
      erro.hidden = !falta;
      if (falta) return null;
      guardar(CHAVE_CLIENTE, { nome: c.nome, modo: c.modo, endereco: c.endereco, pagamento: c.pagamento });
      return c;
    };

    // O PDF é refeito sempre que algo muda na sacola ou no formulário.
    let arquivo = null;
    let numeroPedido = null;
    const invalidar = () => { arquivo = null; };
    dlg.addEventListener('input', invalidar);
    dlg.addEventListener('change', invalidar);
    dlg.addEventListener('click', (e) => { if (e.target.closest('[data-lq],[data-remover]')) invalidar(); });
    carregarLibs().catch(() => {});

    const marcarEnviado = () => {
      document.getElementById('limpar-sacola').textContent = 'Pedido enviado? Começar um novo';
    };
    const enviarTexto = (c) => {
      const url = `https://wa.me/${WHATSAPP_LOJA}?text=${encodeURIComponent(mensagem(c))}`;
      const aba = window.open(url, '_blank');
      if (!aba) location.href = url;
      marcarEnviado();
    };

    const botaoEnviar = document.getElementById('enviar-whats');
    const textoBotao = botaoEnviar.textContent;
    botaoEnviar.onclick = async () => {
      const c = validar();
      if (!c) return;
      const aviso = document.getElementById('aviso-envio');
      if (!arquivo) {
        botaoEnviar.disabled = true;
        botaoEnviar.innerHTML = '<span class="carregando"></span> Preparando o PDF…';
        try {
          numeroPedido = numeroPedido || gerarNumero();
          arquivo = await gerarPdf(c, numeroPedido);
        } catch (err) {
          botaoEnviar.disabled = false;
          botaoEnviar.textContent = textoBotao;
          aviso.innerHTML = '<span class="erro">Não foi possível gerar o PDF. Verifique a internet ou use "Enviar só o texto do pedido".</span>';
          return;
        }
        botaoEnviar.disabled = false;
        botaoEnviar.textContent = textoBotao;
      }
      const legenda = `Pedido ${numeroPedido} — ${c.nome} — Total ${brl(valorTotal())}`;
      if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
        try {
          await navigator.share({ files: [arquivo], text: legenda, title: 'Pedido Fast Shake' });
          marcarEnviado();
        } catch (e) {
          // Se o celular não abriu o menu (demorou para gerar), um novo toque abre na hora.
          if (e.name !== 'AbortError') {
            botaoEnviar.textContent = 'Toque de novo para enviar o PDF';
          }
        }
        return;
      }
      // Sem compartilhamento de arquivo (computador): baixa o PDF e abre a conversa com o texto.
      baixarArquivo(arquivo);
      aviso.innerHTML = 'O PDF foi baixado. A conversa com a loja abriu com o pedido em texto: se quiser, anexe o PDF nela.';
      enviarTexto(c);
    };
    document.getElementById('enviar-texto').onclick = () => {
      const c = validar();
      if (c) enviarTexto(c);
    };
    document.getElementById('limpar-sacola').onclick = () => {
      if (!confirm('Esvaziar a sacola?')) return;
      sacola = [];
      salvarSacola();
      dlg.close();
      desenharLista();
    };

    desenharLinhas();
    mostrarCampos();
  }
  document.getElementById('abrir-sacola').onclick = abrirSacola;

  function linhasTexto() {
    return sacola.map((l) => {
      const i = porCodigo[l.codigo];
      let t = `• ${l.qtd}x ${i.nome} — ${brl(l.precoUnit * l.qtd)}`;
      l.escolhas.forEach((e) => { t += `\n   ${e.titulo}: ${e.texto}`; });
      if (l.obs) t += `\n   Obs.: ${l.obs}`;
      return t;
    });
  }

  function mensagem(c) {
    const partes = [
      '*Novo pedido — Fast Shake*',
      '',
      `*Cliente:* ${c.nome}`,
      c.modo === 'entrega' ? `*Entrega:* ${c.endereco}` : '*Retirada na loja*',
      `*Pagamento:* ${c.pagamento}${c.pagamento === 'Dinheiro' && c.troco ? ` (troco para ${c.troco})` : ''}`,
      '',
      '*Itens*',
      ...linhasTexto(),
      '',
      `*Total: ${brl(valorTotal())}*${c.modo === 'entrega' ? ' + taxa de entrega' : ''}`,
    ];
    if (c.obs) partes.push('', `*Observações:* ${c.obs}`);
    return partes.join('\n');
  }

  // ---------- PDF do pedido ----------
  const LIBS = ['https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
    'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js'];
  let libs = null;
  function carregarLibs() {
    if (!libs) {
      libs = LIBS.reduce((p, src) => p.then(() => new Promise((ok, falha) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = ok;
        s.onerror = () => { libs = null; falha(new Error('sem conexão')); };
        document.head.appendChild(s);
      })), Promise.resolve());
    }
    return libs;
  }
  function logoJpeg() {
    return new Promise((ok) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = 400;
        c.height = Math.round(400 * img.naturalHeight / img.naturalWidth);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        ok({ dados: c.toDataURL('image/jpeg', 0.88), prop: c.height / c.width });
      };
      img.onerror = () => ok(null);
      img.src = '../img/logo.png';
    });
  }
  const limpar = (t) => String(t).replace(/[–—]/g, '-').replace(/[•]/g, '-');

  function gerarNumero() {
    return Date.now().toString(36).slice(-5).toUpperCase();
  }

  function baixarArquivo(f) {
    const url = URL.createObjectURL(f);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  // PDF do pedido no mesmo padrão visual do app de contagem.
  async function gerarPdf(c, numero) {
    await carregarLibs();
    const logo = await logoJpeg();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const larg = doc.internal.pageSize.getWidth();
    const alt = doc.internal.pageSize.getHeight();
    const m = 14;
    const LARANJA = [237, 68, 0], AZUL = [39, 51, 147], TEXTO = [42, 26, 18], SUAVE = [122, 101, 88], FUNDO = [255, 246, 239];

    if (logo) doc.addImage(logo.dados, 'JPEG', m, 10, 46, 46 * logo.prop);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...LARANJA);
    doc.setFontSize(22);
    doc.text('Pedido', larg - m, 20, { align: 'right' });
    doc.setFontSize(12);
    doc.setTextColor(...AZUL);
    doc.text('Nº ' + numero, larg - m, 27, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...SUAVE);
    doc.text(new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }), larg - m, 33, { align: 'right' });
    doc.text('Fast Shake · WhatsApp ' + TELEFONE_LOJA, larg - m, 38, { align: 'right' });

    // Faixa laranja e azul da marca.
    const yFaixa = 50;
    doc.setFillColor(...LARANJA);
    doc.rect(m, yFaixa, (larg - 2 * m) / 2, 2.2, 'F');
    doc.setFillColor(...AZUL);
    doc.rect(m + (larg - 2 * m) / 2, yFaixa, (larg - 2 * m) / 2, 2.2, 'F');

    // Dados do cliente num quadro claro.
    const dados = [
      ['Cliente', c.nome],
      ['Receber', c.modo === 'entrega' ? 'Entrega em: ' + c.endereco : 'Retirada na loja'],
      ['Pagamento', c.pagamento + (c.pagamento === 'Dinheiro' && c.troco ? ` (troco para ${c.troco})` : '')],
    ];
    doc.setFontSize(10.5);
    const linhasDados = dados.map(([r, v]) => [r, doc.splitTextToSize(limpar(v), larg - 2 * m - 40)]);
    const altQuadro = 8 + linhasDados.reduce((s, [, l]) => s + 5.5 * l.length + 1.5, 0);
    let y = yFaixa + 7;
    doc.setFillColor(...FUNDO);
    doc.roundedRect(m, y, larg - 2 * m, altQuadro, 3, 3, 'F');
    y += 7;
    linhasDados.forEach(([r, l]) => {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...SUAVE);
      doc.text(r, m + 5, y);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...TEXTO);
      doc.text(l, m + 34, y);
      y += 5.5 * l.length + 1.5;
    });

    doc.autoTable({
      startY: yFaixa + 7 + altQuadro + 6,
      margin: { left: m, right: m, bottom: 18 },
      head: [['Qtd', 'Item', 'Valor']],
      body: sacola.map((l) => {
        const i = porCodigo[l.codigo];
        const det = l.escolhas.map((e) => `${e.titulo}: ${e.texto}`).concat(l.obs ? ['Obs.: ' + l.obs] : []);
        return [{ content: l.qtd + 'x', styles: { fontStyle: 'bold', halign: 'center' } },
          { content: limpar(i.nome), det: det.map(limpar) },
          { content: brl(l.precoUnit * l.qtd), styles: { fontStyle: 'bold', halign: 'right' } }];
      }),
      foot: [[{ content: '', styles: { fillColor: AZUL } },
        { content: 'Total' + (c.modo === 'entrega' ? ' (+ taxa de entrega)' : ''), styles: { fillColor: AZUL } },
        { content: brl(valorTotal()), styles: { halign: 'right', fillColor: AZUL } }]],
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 11, textColor: TEXTO, cellPadding: { top: 3, bottom: 3, left: 3, right: 3 }, valign: 'top' },
      headStyles: { fillColor: LARANJA, textColor: 255, fontStyle: 'bold', fontSize: 10 },
      footStyles: { textColor: 255, fontStyle: 'bold', fontSize: 12 },
      columnStyles: { 0: { cellWidth: 16 }, 2: { cellWidth: 34 } },
      alternateRowStyles: { fillColor: FUNDO },
      // Detalhes (sabor, cobertura, adicionais) em letra menor e cinza, abaixo do nome.
      didParseCell: (d) => {
        if (d.section === 'body' && d.column.index === 1 && d.cell.raw.det && d.cell.raw.det.length) {
          d.cell.styles.cellPadding = { top: 3, bottom: 4 + d.cell.raw.det.length * 4.6, left: 3, right: 3 };
          d.cell.styles.fontStyle = 'bold';
        } else if (d.section === 'body' && d.column.index === 1) {
          d.cell.styles.fontStyle = 'bold';
        }
      },
      didDrawCell: (d) => {
        if (d.section !== 'body' || d.column.index !== 1 || !d.cell.raw.det) return;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...SUAVE);
        d.cell.raw.det.forEach((t, k) => {
          doc.text(doc.splitTextToSize(t, d.cell.width - 6)[0], d.cell.x + 3, d.cell.y + 10 + k * 4.6);
        });
      },
    });

    let yFim = doc.lastAutoTable.finalY + 8;
    if (c.obs) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...AZUL);
      doc.text('Observações', m, yFim);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      doc.setTextColor(...TEXTO);
      doc.text(doc.splitTextToSize(limpar(c.obs), larg - 2 * m), m, yFim + 6);
    }
    doc.setFontSize(8.5);
    doc.setTextColor(...SUAVE);
    doc.text('Pedido feito pelo cardápio digital da Fast Shake. Pagamento na ' + (c.modo === 'entrega' ? 'entrega.' : 'retirada.'), larg / 2, alt - 10, { align: 'center' });

    const nome = `Pedido-${numero}-Fast-Shake.pdf`;
    return new File([doc.output('blob')], nome, { type: 'application/pdf' });
  }

  desenharLista();
})();
