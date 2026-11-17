/*!
 * Ajedrez Kirito — interfaz y multijugador (WebRTC con PeerJS)
 * Creado por Kirito
 * Licencia MIT
 */
(() => {
  'use strict';

  const { Game, sqName } = window.KiritoChess;
  const $ = (id) => document.getElementById(id);

  const GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
  const VALUE = { Q: 9, R: 5, B: 3, N: 3, P: 1 };
  const NAMES = { w: 'Blancas', b: 'Negras' };
  const PREFIX = 'kirito-chess-';

  const game = new Game();
  let mode = 'local';            // 'local' | 'online'
  let myColor = null;            // en online: 'w' | 'b'
  let flipped = false;
  let selected = null;
  let targets = [];
  let over = false;
  let resultText = '';
  let peer = null, conn = null, connected = false;
  let roomCode = '';

  /* ───────────── Utilidades ───────────── */
  const other = (c) => (c === 'w' ? 'b' : 'w');

  function randomCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  }

  function setNet(msg) { $('netMsg').textContent = msg; }

  function chatLine(text, cls) {
    const p = document.createElement('p');
    if (cls) p.className = cls;
    p.textContent = text;
    const log = $('chatLog');
    log.appendChild(p);
    log.scrollTop = log.scrollHeight;
  }

  /* ───────────── Render ───────────── */
  function render() {
    const board = $('board');
    board.innerHTML = '';
    const last = game.history.length ? game.history[game.history.length - 1].move : null;
    const st = game.status();
    const kingSq = st.check ? game.findKing(game.turn) : -1;

    for (let i = 0; i < 64; i++) {
      const sq = flipped ? 63 - i : i;
      const r = sq >> 3, f = sq & 7;
      const d = document.createElement('div');
      d.className = 'sq ' + (((r + f) % 2 === 0) ? 'light' : 'dark');
      d.dataset.sq = sq;
      if (sq === selected) d.classList.add('selected');
      if (last && (sq === last.from || sq === last.to)) d.classList.add('last');
      if (sq === kingSq) d.classList.add('check');
      const tg = targets.find((m) => m.to === sq);
      if (tg) d.classList.add(game.board[sq] || tg.enPassant ? 'cap' : 'dot');

      const p = game.board[sq];
      if (p) {
        const s = document.createElement('span');
        s.className = 'piece ' + p[0];
        s.textContent = GLYPH[p[1]] + '︎';
        d.appendChild(s);
      }
      if (i % 8 === 0) {
        const e = document.createElement('i');
        e.className = 'co rank';
        e.textContent = 8 - r;
        d.appendChild(e);
      }
      if (i >> 3 === 7) {
        const e = document.createElement('i');
        e.className = 'co file';
        e.textContent = 'abcdefgh'[f];
        d.appendChild(e);
      }
      board.appendChild(d);
    }

    renderPlayers();
    renderMoves();
    renderStatus(st);
    updateButtons();
  }

  function renderPlayers() {
    const bottom = flipped ? 'b' : 'w';
    const top = other(bottom);
    const label = (c) => {
      if (mode === 'online' && myColor) return (c === myColor ? 'Tú' : 'Rival') + ' · ' + NAMES[c];
      return NAMES[c];
    };
    $('nameTop').textContent = label(top);
    $('nameBottom').textContent = label(bottom);
    $('dotTop').className = 'dot ' + top;
    $('dotBottom').className = 'dot ' + bottom;
    $('playerTop').classList.toggle('active', !over && game.turn === top);
    $('playerBottom').classList.toggle('active', !over && game.turn === bottom);

    const caps = { w: [], b: [] }; // piezas capturadas POR cada color
    for (const rec of game.history) {
      if (rec.captured) caps[rec.color].push(rec.captured);
    }
    const draw = (color) => {
      const list = caps[color].slice().sort((a, b) => VALUE[b[1]] - VALUE[a[1]]);
      return list.map((p) => `<span class="${p[0] === 'w' ? 'cw' : 'cb'}">${GLYPH[p[1]]}︎</span>`).join('');
    };
    $('capTop').innerHTML = draw(top);
    $('capBottom').innerHTML = draw(bottom);
  }

  function renderMoves() {
    const ol = $('moves');
    ol.innerHTML = '';
    const h = game.history;
    for (let i = 0; i < h.length; i += 2) {
      const li = document.createElement('li');
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = (i / 2 + 1) + '.';
      li.appendChild(n);
      for (let k = i; k < i + 2; k++) {
        const s = document.createElement('span');
        s.className = 'm' + (k === h.length - 1 ? ' cur' : '');
        s.textContent = h[k] ? h[k].san : '';
        li.appendChild(s);
      }
      ol.appendChild(li);
    }
    ol.scrollTop = ol.scrollHeight;
  }

  function renderStatus(st) {
    const el = $('status');
    el.classList.remove('over', 'warn');
    if (over) {
      el.textContent = resultText;
      el.classList.add('over');
      return;
    }
    if (mode === 'online' && !connected) {
      el.textContent = 'Esperando conexión con el rival…';
      el.classList.add('warn');
      return;
    }
    let t = 'Turno de ' + NAMES[game.turn];
    if (mode === 'online' && myColor) t += game.turn === myColor ? ' (tu turno)' : ' (turno del rival)';
    if (st.check) t += ' · ¡Jaque!';
    el.textContent = t;
  }

  function updateButtons() {
    const online = mode === 'online';
    $('btnUndo').classList.toggle('hidden', online);
    $('btnUndo').disabled = game.history.length === 0;
    $('btnNew').disabled = online && !connected;
    $('btnDraw').disabled = over || (online && !connected);
    $('btnResign').disabled = over || (online && !connected);
    $('btnNew').textContent = online ? 'Revancha' : 'Nueva partida';
  }

  /* ───────────── Jugar ───────────── */
  function canInteract() {
    if (over) return false;
    if (mode === 'online') return connected && myColor === game.turn;
    return true;
  }

  function onBoardClick(e) {
    const el = e.target.closest('.sq');
    if (!el || !canInteract()) return;
    const sq = Number(el.dataset.sq);
    const piece = game.board[sq];

    if (selected !== null) {
      const cand = targets.filter((m) => m.to === sq);
      if (cand.length) {
        if (cand.some((m) => m.promo)) askPromotion(selected, sq);
        else commit(selected, sq);
        return;
      }
    }
    if (piece && piece[0] === game.turn) {
      selected = sq;
      targets = game.movesFrom(sq);
    } else {
      selected = null;
      targets = [];
    }
    render();
  }

  function askPromotion(from, to) {
    const box = $('promoBtns');
    box.innerHTML = '';
    for (const t of ['Q', 'R', 'B', 'N']) {
      const b = document.createElement('button');
      b.className = game.turn;
      b.textContent = GLYPH[t] + '︎';
      b.title = { Q: 'Dama', R: 'Torre', B: 'Alfil', N: 'Caballo' }[t];
      b.onclick = () => { $('promo').classList.add('hidden'); commit(from, to, t); };
      box.appendChild(b);
    }
    $('promo').classList.remove('hidden');
  }

  function commit(from, to, promo) {
    const rec = game.move(from, to, promo);
    if (!rec) return;
    if (mode === 'online') send({ t: 'move', from, to, promo: promo || null });
    afterMove();
  }

  function afterMove() {
    selected = null;
    targets = [];
    const st = game.status();
    if (st.over) {
      over = true;
      if (st.result === 'checkmate') {
        resultText = `Jaque mate · Ganan las ${NAMES[st.winner]}`;
        if (mode === 'online') resultText += st.winner === myColor ? ' · ¡Ganaste!' : ' · Perdiste';
      } else {
        const why = {
          stalemate: 'rey ahogado',
          material: 'material insuficiente',
          fifty: 'regla de los 50 movimientos',
          repetition: 'triple repetición',
        }[st.reason];
        resultText = 'Tablas por ' + why;
      }
    }
    render();
  }

  function endGame(text) {
    over = true;
    resultText = text;
    selected = null;
    targets = [];
    render();
  }

  function resetGame() {
    game.reset();
    over = false;
    resultText = '';
    selected = null;
    targets = [];
    $('promo').classList.add('hidden');
    render();
  }

  /* ───────────── Red (PeerJS / WebRTC) ───────────── */
  function send(obj) {
    if (conn && connected) {
      try { conn.send(obj); } catch (_) { /* ignorar */ }
    }
  }

  function closeNet() {
    connected = false;
    roomCode = '';
    try { if (conn) conn.close(); } catch (_) {}
    try { if (peer) peer.destroy(); } catch (_) {}
    conn = null;
    peer = null;
    $('roomBox').classList.add('hidden');
    $('onlineMenu').classList.remove('hidden');
  }

  function showRoom(code) {
    roomCode = code;
    $('roomCode').textContent = code;
    $('roomBox').classList.remove('hidden');
    $('onlineMenu').classList.add('hidden');
  }

  function startOnline(color) {
    myColor = color;
    flipped = color === 'b';
    resetGame();
    chatLine(`Partida iniciada. Juegas con ${NAMES[color]}.`, 'sys');
    setNet('Conectado con tu rival.');
  }

  function bindConn(c, isHost) {
    conn = c;
    const onOpen = () => {
      connected = true;
      setNet('Conectado con tu rival.');
      if (isHost) {
        const hostWhite = Math.random() < 0.5;
        startOnline(hostWhite ? 'w' : 'b');
        send({ t: 'start', color: hostWhite ? 'b' : 'w' });
      }
      render();
    };
    if (c.open) onOpen(); else c.on('open', onOpen);

    c.on('data', onData);
    c.on('close', () => {
      if (conn !== c) return;
      connected = false;
      setNet('El rival se desconectó.');
      chatLine('El rival se desconectó.', 'sys');
      render();
    });
    c.on('error', () => setNet('Error en la conexión con el rival.'));
  }

  function createRoom() {
    if (!window.Peer) { setNet('No se pudo cargar PeerJS. Revisa tu conexión a internet.'); return; }
    closeNet();
    setNet('Creando sala…');
    const code = randomCode();
    const p = new window.Peer(PREFIX + code);
    peer = p;
    p.on('open', () => {
      showRoom(code);
      setNet('Sala lista. Comparte el código o el enlace y espera a tu rival.');
      myColor = null;
      resetGame();
      render();
    });
    p.on('connection', (c) => {
      if (conn && connected) { c.on('open', () => c.close()); return; }
      bindConn(c, true);
    });
    p.on('error', (err) => {
      if (err.type === 'unavailable-id') createRoom();
      else setNet('Error de red: ' + err.type);
    });
  }

  function joinRoom(raw) {
    const code = String(raw || '').trim().toUpperCase();
    if (code.length !== 6) { setNet('Escribe el código de 6 caracteres.'); return; }
    if (!window.Peer) { setNet('No se pudo cargar PeerJS. Revisa tu conexión a internet.'); return; }
    closeNet();
    setNet('Conectando con la sala ' + code + '…');
    const p = new window.Peer();
    peer = p;
    p.on('open', () => {
      showRoom(code);
      const c = p.connect(PREFIX + code, { reliable: true });
      bindConn(c, false);
      setTimeout(() => {
        if (!connected && peer === p) setNet('No se pudo conectar. Verifica el código.');
      }, 12000);
    });
    p.on('error', (err) => {
      if (err.type === 'peer-unavailable') {
        setNet('Esa sala no existe o ya no está disponible.');
        closeNet();
      } else {
        setNet('Error de red: ' + err.type);
      }
    });
  }

  function onData(d) {
    if (!d || typeof d !== 'object') return;
    switch (d.t) {
      case 'start':
        if (d.color === 'w' || d.color === 'b') startOnline(d.color);
        break;
      case 'move':
        if (mode === 'online' && !over && myColor && game.turn !== myColor &&
            Number.isInteger(d.from) && Number.isInteger(d.to)) {
          const promo = ['Q', 'R', 'B', 'N'].includes(d.promo) ? d.promo : undefined;
          if (game.move(d.from, d.to, promo)) afterMove();
        }
        break;
      case 'resign':
        if (!over) endGame('El rival se rindió · ¡Ganaste!');
        break;
      case 'draw':
        if (!over) {
          const ok = window.confirm('Tu rival ofrece tablas. ¿Aceptas?');
          send({ t: ok ? 'draw-yes' : 'draw-no' });
          if (ok) endGame('Tablas por acuerdo');
        }
        break;
      case 'draw-yes':
        if (!over) endGame('Tablas por acuerdo');
        break;
      case 'draw-no':
        chatLine('Tu rival rechazó las tablas.', 'sys');
        break;
      case 'rematch': {
        const ok = window.confirm('Tu rival quiere la revancha (cambian los colores). ¿Aceptas?');
        send({ t: ok ? 'rematch-yes' : 'rematch-no' });
        if (ok) startOnline(other(myColor));
        break;
      }
      case 'rematch-yes':
        startOnline(other(myColor));
        break;
      case 'rematch-no':
        chatLine('Tu rival rechazó la revancha.', 'sys');
        break;
      case 'chat':
        if (typeof d.text === 'string') chatLine('Rival: ' + d.text.slice(0, 300));
        break;
      default:
    }
  }

  /* ───────────── Modos ───────────── */
  function setMode(m) {
    if (m === mode) return;
    mode = m;
    $('tabLocal').classList.toggle('active', m === 'local');
    $('tabOnline').classList.toggle('active', m === 'online');
    $('onlinePanel').classList.toggle('hidden', m !== 'online');
    $('chatPanel').classList.toggle('hidden', m !== 'online');
    closeNet();
    myColor = null;
    flipped = false;
    setNet('Crea una sala y comparte el código o el enlace con tu rival.');
    resetGame();
  }

  /* ───────────── Eventos ───────────── */
  $('board').addEventListener('click', onBoardClick);
  $('tabLocal').onclick = () => setMode('local');
  $('tabOnline').onclick = () => setMode('online');
  $('btnCreate').onclick = createRoom;
  $('btnJoin').onclick = () => joinRoom($('joinCode').value);
  $('joinCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom($('joinCode').value); });
  $('btnLeave').onclick = () => {
    closeNet();
    myColor = null;
    setNet('Saliste de la sala.');
    resetGame();
  };
  $('btnCopy').onclick = async () => {
    const url = location.origin + location.pathname + '?sala=' + roomCode;
    try {
      await navigator.clipboard.writeText(url);
      setNet('Enlace copiado. Envíaselo a tu rival.');
    } catch (_) {
      window.prompt('Copia este enlace:', url);
    }
  };

  $('btnNew').onclick = () => {
    if (mode === 'online') {
      send({ t: 'rematch' });
      setNet('Revancha solicitada, esperando respuesta…');
    } else if (!game.history.length || window.confirm('¿Empezar una nueva partida?')) {
      resetGame();
    }
  };
  $('btnFlip').onclick = () => { flipped = !flipped; render(); };
  $('btnUndo').onclick = () => {
    if (mode !== 'local') return;
    if (game.undo()) { over = false; resultText = ''; selected = null; targets = []; render(); }
  };
  $('btnDraw').onclick = () => {
    if (over) return;
    if (mode === 'online') {
      send({ t: 'draw' });
      chatLine('Ofreciste tablas.', 'sys');
    } else if (window.confirm('¿Ambos jugadores aceptan las tablas?')) {
      endGame('Tablas por acuerdo');
    }
  };
  $('btnResign').onclick = () => {
    if (over) return;
    if (!window.confirm('¿Seguro que quieres rendirte?')) return;
    if (mode === 'online') {
      send({ t: 'resign' });
      endGame('Te rendiste · Gana el rival');
    } else {
      endGame(`Las ${NAMES[game.turn]} se rinden · Ganan las ${NAMES[other(game.turn)]}`);
    }
  };

  $('chatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('chatInput');
    const text = input.value.trim();
    if (!text || !connected) return;
    send({ t: 'chat', text });
    chatLine('Tú: ' + text, 'me');
    input.value = '';
  });

  /* ───────────── Inicio ───────────── */
  render();
  const params = new URLSearchParams(location.search);
  const sala = params.get('sala');
  if (sala) {
    setMode('online');
    $('joinCode').value = sala.toUpperCase().slice(0, 6);
    joinRoom(sala);
  }

  // Exponer para depuración desde la consola
  window.__kirito = { game, sqName };
})();
