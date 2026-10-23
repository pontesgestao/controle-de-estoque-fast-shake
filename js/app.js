(function () {
  'use strict';

  const CHAVE_RASCUNHO = 'fastshake-contagem-v1';
  const CHAVE_PERFIL = 'fastshake-perfil-v1';
  const app = document.getElementById('app');

  // Cada item ganha um id pelo nome (categoria + produto), assim incluir ou
  // reordenar produtos não embaralha uma contagem que já estava em andamento.
  const categorias = window.CATEGORIAS.map((cat) => ({
    nome: cat.nome,
    itens: cat.itens.map((item) => ({ ...item, id: cat.nome + '|' + item.nome })),
  }));
  const totalItens = categorias.reduce((s, c) => s + c.itens.length, 0);

  let estado = carregar(CHAVE_RASCUNHO) || null;

  // ---------- Utilidades ----------
  function carregar(chave) {
    try { return JSON.parse(localStorage.getItem(chave)); } catch (e) { return null; }
  }
  function guardar(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* sem armazenamento */ }
  }
  function apagar(chave) {
    try { localStorage.removeItem(chave); } catch (e) { /* sem armazenamento */ }
  }
  function salvar() { guardar(CHAVE_RASCUNHO, estado); }

  function esc(texto) {
    return String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Aceita "2", "2,5", "2.5" e "1/2".
  function lerNumero(texto) {
    const t = String(texto || '').trim().replace(',', '.');
    if (t === '') return null;
    if (/^\d+\s*\/\s*\d+$/.test(t)) {
      const [a, b] = t.split('/').map(Number);
      return b ? a / b : null;
    }
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  function formatar(n) {
    return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2, useGrouping: false });
  }

  function valor(id) { return estado.valores[id] || { q: '', a: '' }; }
  function preenchido(id) { return lerNumero(valor(id).q) !== null; }
  function categoriaCompleta(ci) { return categorias[ci].itens.every((it) => preenchido(it.id)); }
  function liberada(ci) {
    for (let i = 0; i < ci; i++) if (!categoriaCompleta(i)) return false;
    return true;
  }
  function contarPreenchidos() {
    let n = 0;
    categorias.forEach((c) => c.itens.forEach((it) => { if (preenchido(it.id)) n++; }));
    return n;
  }
  function porcentagem() { return Math.round((contarPreenchidos() / totalItens) * 100); }

  function gerarId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  // ---------- Tela inicial ----------
  function telaInicio() {
    const perfil = carregar(CHAVE_PERFIL) || {};
    const temRascunho = estado && estado.valores && Object.keys(estado.valores).length > 0;
    const unidades = (window.CONFIG.UNIDADES || []).filter(Boolean);

    const campoUnidade = unidades.length
      ? `<select id="unidade" required>
           <option value="">Selecione a unidade</option>
           ${unidades.map((u) => `<option ${u === perfil.unidade ? 'selected' : ''}>${esc(u)}</option>`).join('')}
         </select>`
      : `<input id="unidade" type="text" autocomplete="organization" placeholder="Ex.: Loja Centro" value="${esc(perfil.unidade || '')}" required>`;

    app.innerHTML = `
      <section class="inicio">
        <img class="logo" src="img/logo.png" alt="Fast Shake">
        <div class="faixa-titulo">
          <h1>Contagem de estoque</h1>
          <p>Preencha categoria por categoria. Seu progresso fica salvo neste aparelho.</p>
        </div>

        ${temRascunho ? `
          <div class="cartao pilha">
            <p class="aviso">Você tem uma contagem em andamento de <strong>${esc(estado.unidade)}</strong>
              (${porcentagem()}% concluída).</p>
            <button class="btn btn-primario btn-bloco" id="continuar">Continuar contagem</button>
            <button class="btn btn-texto" id="descartar">Descartar e começar outra</button>
          </div>` : `
          <form class="cartao" id="form-inicio" novalidate>
            <div class="campo">
              <label for="unidade">Unidade</label>
              ${campoUnidade}
            </div>
            <div class="campo">
              <label for="responsavel">Seu nome</label>
              <input id="responsavel" type="text" autocomplete="name" placeholder="Nome do gerente" value="${esc(perfil.responsavel || '')}" required>
            </div>
            <p class="aviso aviso-erro" id="erro-inicio" hidden></p>
            <button class="btn btn-primario btn-bloco" type="submit">Iniciar contagem</button>
          </form>`}
      </section>`;

    if (temRascunho) {
      document.getElementById('continuar').onclick = () => telaContagem(estado.passo || 0);
      document.getElementById('descartar').onclick = () => {
        if (!confirm('Descartar a contagem em andamento? Os números digitados serão perdidos.')) return;
        estado = null;
        apagar(CHAVE_RASCUNHO);
        telaInicio();
      };
      return;
    }

    document.getElementById('form-inicio').onsubmit = (e) => {
      e.preventDefault();
      const unidade = document.getElementById('unidade').value.trim();
      const responsavel = document.getElementById('responsavel').value.trim();
      const erro = document.getElementById('erro-inicio');
      if (!unidade || !responsavel) {
        erro.textContent = 'Informe a unidade e o seu nome para começar.';
        erro.hidden = false;
        return;
      }
      guardar(CHAVE_PERFIL, { unidade, responsavel });
      estado = { id: gerarId(), unidade, responsavel, iniciadoEm: new Date().toISOString(), valores: {}, passo: 0, observacoes: '' };
      salvar();
      telaContagem(0);
    };
  }

  // ---------- Topo com progresso e etapas ----------
  function htmlTopo(passoAtual) {
    const etapas = categorias.map((c, ci) => {
      let classe = 'etapa';
      if (ci === passoAtual) classe += ' atual';
      else if (categoriaCompleta(ci)) classe += ' feita';
      else if (!liberada(ci)) classe += ' bloqueada';
      const marca = categoriaCompleta(ci) && ci !== passoAtual ? '✓' : ci + 1;
      return `<button class="${classe}" data-passo="${ci}" ${liberada(ci) ? '' : 'aria-disabled="true"'}>
                <span class="num">${marca}</span>${esc(c.nome)}</button>`;
    }).join('');
    const revisaoLiberada = liberada(categorias.length);
    const revisao = `<button class="etapa ${passoAtual === 'revisao' ? 'atual' : ''} ${revisaoLiberada ? '' : 'bloqueada'}" data-passo="revisao">
                       <span class="num">★</span>Revisar e enviar</button>`;
    const p = porcentagem();
    return `
      <header class="topo">
        <div class="topo-linha">
          <div class="marca"><span>FAST</span><span class="tag-azul">SHAKE</span><span>· ${esc(estado.unidade)}</span></div>
          <div class="porcentagem" id="pct">${p}%</div>
        </div>
        <div class="barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}" id="barra"><div style="width:${p}%"></div></div>
        <div class="topo-sub"><span id="itens-feitos">${contarPreenchidos()} de ${totalItens} itens</span><span>${esc(estado.responsavel)}</span></div>
      </header>
      <nav class="etapas" aria-label="Categorias">${etapas}${revisao}</nav>`;
  }

  function ligarEtapas() {
    app.querySelectorAll('.etapa').forEach((b) => {
      b.onclick = () => {
        const alvo = b.dataset.passo;
        if (alvo === 'revisao') { if (liberada(categorias.length)) telaRevisao(); return; }
        const ci = Number(alvo);
        if (liberada(ci)) telaContagem(ci);
      };
    });
    const atual = app.querySelector('.etapa.atual');
    if (atual) atual.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function atualizarProgresso() {
    const p = porcentagem();
    document.getElementById('pct').textContent = p + '%';
    const barra = document.getElementById('barra');
    barra.setAttribute('aria-valuenow', p);
    barra.firstElementChild.style.width = p + '%';
    document.getElementById('itens-feitos').textContent = `${contarPreenchidos()} de ${totalItens} itens`;
  }

  // ---------- Contagem de uma categoria ----------
  function telaContagem(ci) {
    if (!liberada(ci)) ci = 0;
    estado.passo = ci;
    salvar();
    const cat = categorias[ci];
    const ultima = ci === categorias.length - 1;

    const itens = cat.itens.map((it) => {
      const v = valor(it.id);
      return `
        <li class="item ${preenchido(it.id) ? 'preenchido' : ''}" data-id="${esc(it.id)}">
          <div>
            <div class="item-nome"><span class="ok" aria-hidden="true">✓</span>${esc(it.nome)}</div>
            <span class="item-medida">${esc(it.medida)}</span>
          </div>
          <div class="contador-qtd">
            <button type="button" data-acao="menos" aria-label="Diminuir ${esc(it.nome)}">−</button>
            <input type="text" inputmode="decimal" autocomplete="off" enterkeyhint="next"
                   aria-label="Quantidade de ${esc(it.nome)} em ${esc(it.medida)}"
                   placeholder="–" value="${esc(v.q)}" data-campo="q">
            <button type="button" data-acao="mais" aria-label="Aumentar ${esc(it.nome)}">+</button>
          </div>
          ${it.avulsas ? `
            <label class="avulsas">+ unidades soltas
              <input type="text" inputmode="numeric" autocomplete="off" placeholder="0" value="${esc(v.a)}" data-campo="a"
                     aria-label="Unidades soltas de ${esc(it.nome)}">
            </label>` : ''}
        </li>`;
    }).join('');

    app.innerHTML = `
      ${htmlTopo(ci)}
      <section class="conteudo">
        <div class="cabecalho-categoria">
          <h2>${esc(cat.nome)}</h2>
          <span class="contador" id="contador-cat"></span>
        </div>
        <p class="dica">Digite a quantidade de cada item. Se não houver nenhum, coloque <strong>0</strong>. Aceita meio: <strong>0,5</strong>.</p>
        <ul class="itens">${itens}</ul>
      </section>
      <footer class="rodape">
        <div class="rodape-interno">
          <button class="btn btn-secundario" id="voltar">${ci === 0 ? 'Início' : '← Anterior'}</button>
          <button class="btn btn-primario" id="avancar">${ultima ? 'Revisar contagem →' : 'Próxima categoria →'}</button>
          <p class="falta" id="falta"></p>
        </div>
      </footer>`;

    ligarEtapas();

    const lista = app.querySelector('.itens');
    const btnAvancar = document.getElementById('avancar');

    function atualizarCategoria() {
      const feitos = cat.itens.filter((it) => preenchido(it.id)).length;
      const falta = cat.itens.length - feitos;
      document.getElementById('contador-cat').textContent = `${feitos}/${cat.itens.length}`;
      btnAvancar.disabled = falta > 0;
      document.getElementById('falta').textContent = falta > 0
        ? `Falta${falta > 1 ? 'm' : ''} ${falta} ${falta > 1 ? 'itens' : 'item'} para liberar a próxima etapa`
        : 'Categoria completa!';
      atualizarProgresso();
      // Atualiza as bolinhas das etapas sem redesenhar a tela.
      app.querySelectorAll('.etapa').forEach((b) => {
        const alvo = b.dataset.passo;
        const idx = alvo === 'revisao' ? categorias.length : Number(alvo);
        const ok = liberada(idx);
        b.classList.toggle('bloqueada', !ok && idx !== ci);
        if (ok) b.removeAttribute('aria-disabled'); else b.setAttribute('aria-disabled', 'true');
        if (alvo !== 'revisao' && idx !== ci) {
          b.classList.toggle('feita', categoriaCompleta(idx));
          b.querySelector('.num').textContent = categoriaCompleta(idx) ? '✓' : idx + 1;
        }
      });
    }

    function gravar(li, campo, texto) {
      const id = li.dataset.id;
      const v = { ...valor(id) };
      v[campo] = texto;
      estado.valores[id] = v;
      li.classList.toggle('preenchido', preenchido(id));
      salvar();
      atualizarCategoria();
    }

    lista.addEventListener('input', (e) => {
      const input = e.target;
      if (!input.dataset.campo) return;
      // Mantém só números, vírgula, ponto e barra.
      const limpo = input.value.replace(/[^\d.,/]/g, '');
      if (limpo !== input.value) input.value = limpo;
      gravar(input.closest('.item'), input.dataset.campo, limpo);
    });

    lista.addEventListener('click', (e) => {
      const botao = e.target.closest('button[data-acao]');
      if (!botao) return;
      const li = botao.closest('.item');
      const input = li.querySelector('input[data-campo="q"]');
      const atual = lerNumero(input.value);
      let novo;
      if (botao.dataset.acao === 'mais') novo = atual === null ? 1 : Math.floor(atual) + 1;
      else novo = atual === null ? 0 : Math.max(0, Math.ceil(atual) - 1);
      input.value = formatar(novo);
      gravar(li, 'q', input.value);
    });

    // "Enter"/"próximo" do teclado leva ao próximo item vazio.
    lista.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const campos = [...lista.querySelectorAll('input[data-campo="q"]')];
      const i = campos.indexOf(e.target);
      const proximo = campos.slice(i + 1).find((c) => c.value === '') || campos[i + 1];
      if (proximo) proximo.focus(); else e.target.blur();
    });

    lista.addEventListener('focusin', (e) => {
      if (e.target.matches('input')) setTimeout(() => e.target.select(), 0);
    });

    document.getElementById('voltar').onclick = () => (ci === 0 ? telaInicio() : telaContagem(ci - 1));
    btnAvancar.onclick = () => {
      if (!categoriaCompleta(ci)) return;
      if (ultima) telaRevisao(); else telaContagem(ci + 1);
    };

    atualizarCategoria();
    window.scrollTo(0, 0);
  }

  // ---------- Revisão e envio ----------
  function montarEnvio() {
    const itens = [];
    categorias.forEach((c) => c.itens.forEach((it) => {
      const v = valor(it.id);
      itens.push({
        categoria: c.nome,
        produto: it.nome,
        quantidade: lerNumero(v.q),
        medida: it.medida,
        avulsas: it.avulsas ? (lerNumero(v.a) || 0) : '',
      });
    }));
    return {
      id: estado.id,
      unidade: estado.unidade,
      responsavel: estado.responsavel,
      iniciadoEm: estado.iniciadoEm,
      enviadoEm: new Date().toISOString(),
      observacoes: estado.observacoes || '',
      itens,
    };
  }

  function telaRevisao() {
    if (!liberada(categorias.length)) return telaContagem(estado.passo || 0);
    estado.passo = categorias.length - 1;
    salvar();

    const blocos = categorias.map((c, ci) => `
      <article class="cartao revisao-cat">
        <header>
          <h3>${esc(c.nome)}</h3>
          <button class="btn btn-texto" data-editar="${ci}">Corrigir</button>
        </header>
        <dl>${c.itens.map((it) => {
          const v = valor(it.id);
          const q = lerNumero(v.q);
          const a = it.avulsas ? lerNumero(v.a) : null;
          return `<dt>${esc(it.nome)}</dt>
                  <dd class="${q === 0 && !a ? 'zero' : ''}">${formatar(q)} ${esc(it.medida)}${a ? ` + ${formatar(a)} un` : ''}</dd>`;
        }).join('')}</dl>
      </article>`).join('');

    app.innerHTML = `
      ${htmlTopo('revisao')}
      <section class="conteudo">
        <div class="cabecalho-categoria"><h2>Revisar e enviar</h2></div>
        <p class="dica">Confira os números. Itens zerados aparecem em vermelho. Toque em <strong>Corrigir</strong> para ajustar.</p>
        ${blocos}
        <div class="cartao">
          <div class="campo">
            <label for="obs">Observações (opcional)</label>
            <textarea id="obs" placeholder="Ex.: produto vencido, embalagem avariada…">${esc(estado.observacoes || '')}</textarea>
          </div>
        </div>
      </section>
      <footer class="rodape">
        <div class="rodape-interno">
          <button class="btn btn-secundario" id="voltar">← Voltar</button>
          <button class="btn btn-azul" id="enviar">Enviar contagem</button>
          <p class="falta" id="status-envio">Depois de enviada, a contagem não pode ser alterada.</p>
        </div>
      </footer>`;

    ligarEtapas();
    app.querySelectorAll('[data-editar]').forEach((b) => { b.onclick = () => telaContagem(Number(b.dataset.editar)); });
    document.getElementById('obs').oninput = (e) => { estado.observacoes = e.target.value; salvar(); };
    document.getElementById('voltar').onclick = () => telaContagem(categorias.length - 1);
    document.getElementById('enviar').onclick = enviar;
    window.scrollTo(0, 0);
  }

  async function enviar() {
    const botao = document.getElementById('enviar');
    const status = document.getElementById('status-envio');
    const url = (window.CONFIG.URL_PLANILHA || '').trim();
    if (!url) {
      status.innerHTML = '<span class="aviso-erro">A planilha ainda não foi configurada. Avise o responsável.</span>';
      return;
    }
    if (!confirm('Enviar a contagem agora?')) return;

    botao.disabled = true;
    botao.innerHTML = '<span class="carregando"></span> Enviando…';
    status.textContent = 'Enviando, não feche esta página…';

    const dados = montarEnvio();
    try {
      // text/plain evita a verificação prévia (CORS) que o Apps Script não suporta.
      const resposta = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(dados),
      });
      const json = await resposta.json();
      if (!json.ok) throw new Error(json.erro || 'Erro na planilha');
      apagar(CHAVE_RASCUNHO);
      const enviado = estado;
      estado = null;
      telaSucesso(enviado, dados.enviadoEm);
    } catch (err) {
      botao.disabled = false;
      botao.textContent = 'Tentar enviar de novo';
      status.innerHTML = '<span class="aviso-erro">Não foi possível enviar. Verifique a internet e tente de novo — nada foi perdido.</span>';
    }
  }

  function telaSucesso(enviado, quando) {
    const data = new Date(quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    app.innerHTML = `
      <section class="sucesso">
        <img class="logo" src="img/logo.png" alt="Fast Shake">
        <div class="selo" aria-hidden="true">✓</div>
        <h1>Contagem enviada!</h1>
        <p><strong>${esc(enviado.unidade)}</strong> · ${esc(enviado.responsavel)}<br>${data}</p>
        <p>Obrigado! Pode fechar esta página.</p>
        <button class="btn btn-secundario" id="nova">Fazer nova contagem</button>
      </section>`;
    document.getElementById('nova').onclick = telaInicio;
    window.scrollTo(0, 0);
  }

  // Avisa antes de fechar a página no meio de um envio não concluído.
  window.addEventListener('beforeunload', (e) => {
    const botao = document.getElementById('enviar');
    if (botao && botao.disabled) { e.preventDefault(); e.returnValue = ''; }
  });

  telaInicio();
})();
