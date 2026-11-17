/*!
 * Ajedrez Kirito — motor de reglas
 * Creado por Kirito
 * Licencia MIT
 *
 * Tablero: índice 0 = a8, 63 = h1. Piezas: 'wP', 'bK', etc. (color + tipo).
 */
(function (root) {
  'use strict';

  const FILES = 'abcdefgh';
  const sqName = (i) => FILES[i & 7] + (8 - (i >> 3));

  const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const KG = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  function initialState() {
    const board = new Array(64).fill(null);
    const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
    for (let f = 0; f < 8; f++) {
      board[f] = 'b' + back[f];
      board[8 + f] = 'bP';
      board[48 + f] = 'wP';
      board[56 + f] = 'w' + back[f];
    }
    return {
      board,
      turn: 'w',
      castling: { wK: true, wQ: true, bK: true, bQ: true },
      ep: -1,
      half: 0,
      full: 1,
    };
  }

  function findKing(board, color) {
    return board.indexOf(color + 'K');
  }

  function attacked(board, sq, by) {
    const r = sq >> 3, f = sq & 7;
    // Peones
    const pr = by === 'w' ? r + 1 : r - 1;
    if (pr >= 0 && pr < 8) {
      for (const df of [-1, 1]) {
        const pf = f + df;
        if (pf >= 0 && pf < 8 && board[pr * 8 + pf] === by + 'P') return true;
      }
    }
    // Caballos
    for (const [dr, df] of KN) {
      const rr = r + dr, ff = f + df;
      if (rr >= 0 && rr < 8 && ff >= 0 && ff < 8 && board[rr * 8 + ff] === by + 'N') return true;
    }
    // Rey
    for (const [dr, df] of KG) {
      const rr = r + dr, ff = f + df;
      if (rr >= 0 && rr < 8 && ff >= 0 && ff < 8 && board[rr * 8 + ff] === by + 'K') return true;
    }
    // Alfil / Dama
    for (const [dr, df] of DIAG) {
      let rr = r + dr, ff = f + df;
      while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
        const p = board[rr * 8 + ff];
        if (p) {
          if (p[0] === by && (p[1] === 'B' || p[1] === 'Q')) return true;
          break;
        }
        rr += dr; ff += df;
      }
    }
    // Torre / Dama
    for (const [dr, df] of ORTH) {
      let rr = r + dr, ff = f + df;
      while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
        const p = board[rr * 8 + ff];
        if (p) {
          if (p[0] === by && (p[1] === 'R' || p[1] === 'Q')) return true;
          break;
        }
        rr += dr; ff += df;
      }
    }
    return false;
  }

  function pseudo(s) {
    const { board, turn: us, castling, ep } = s;
    const them = us === 'w' ? 'b' : 'w';
    const out = [];
    const add = (from, to, extra) =>
      out.push(Object.assign(
        { from, to, piece: board[from][1], captured: board[to] ? board[to][1] : null },
        extra || {}
      ));

    for (let from = 0; from < 64; from++) {
      const p = board[from];
      if (!p || p[0] !== us) continue;
      const t = p[1], r = from >> 3, f = from & 7;

      if (t === 'P') {
        const dir = us === 'w' ? -1 : 1;
        const start = us === 'w' ? 6 : 1;
        const last = us === 'w' ? 0 : 7;
        const r1 = r + dir;
        if (r1 < 0 || r1 > 7) continue;
        const one = r1 * 8 + f;
        if (!board[one]) {
          if (r1 === last) {
            for (const pr of 'QRBN') add(from, one, { promo: pr });
          } else {
            add(from, one);
            if (r === start && !board[one + dir * 8]) add(from, one + dir * 8, { double: true });
          }
        }
        for (const df of [-1, 1]) {
          const ff = f + df;
          if (ff < 0 || ff > 7) continue;
          const to = r1 * 8 + ff;
          const tp = board[to];
          if (tp && tp[0] === them) {
            if (r1 === last) for (const pr of 'QRBN') add(from, to, { promo: pr });
            else add(from, to);
          } else if (!tp && to === ep) {
            add(from, to, { enPassant: true, captured: 'P' });
          }
        }
      } else if (t === 'N' || t === 'K') {
        for (const [dr, df] of (t === 'N' ? KN : KG)) {
          const rr = r + dr, ff = f + df;
          if (rr < 0 || rr > 7 || ff < 0 || ff > 7) continue;
          const to = rr * 8 + ff;
          const tp = board[to];
          if (!tp || tp[0] === them) add(from, to);
        }
      } else {
        const dirs = t === 'B' ? DIAG : t === 'R' ? ORTH : DIAG.concat(ORTH);
        for (const [dr, df] of dirs) {
          let rr = r + dr, ff = f + df;
          while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
            const to = rr * 8 + ff;
            const tp = board[to];
            if (!tp) add(from, to);
            else {
              if (tp[0] === them) add(from, to);
              break;
            }
            rr += dr; ff += df;
          }
        }
      }
    }

    // Enroques
    const home = us === 'w' ? 60 : 4;
    if (board[home] === us + 'K' && !attacked(board, home, them)) {
      if (castling[us + 'K'] && board[home + 3] === us + 'R' &&
          !board[home + 1] && !board[home + 2] &&
          !attacked(board, home + 1, them) && !attacked(board, home + 2, them)) {
        add(home, home + 2, { castle: 'K' });
      }
      if (castling[us + 'Q'] && board[home - 4] === us + 'R' &&
          !board[home - 1] && !board[home - 2] && !board[home - 3] &&
          !attacked(board, home - 1, them) && !attacked(board, home - 2, them)) {
        add(home, home - 2, { castle: 'Q' });
      }
    }
    return out;
  }

  function apply(s, m) {
    const board = s.board.slice();
    const us = s.turn;
    const them = us === 'w' ? 'b' : 'w';
    const piece = board[m.from];
    board[m.from] = null;
    if (m.enPassant) board[m.to + (us === 'w' ? 8 : -8)] = null;
    board[m.to] = m.promo ? us + m.promo : piece;
    if (m.castle === 'K') { board[m.to - 1] = board[m.to + 1]; board[m.to + 1] = null; }
    if (m.castle === 'Q') { board[m.to + 1] = board[m.to - 2]; board[m.to - 2] = null; }

    const c = Object.assign({}, s.castling);
    if (piece[1] === 'K') { c[us + 'K'] = false; c[us + 'Q'] = false; }
    for (const [sq, key] of [[63, 'wK'], [56, 'wQ'], [7, 'bK'], [0, 'bQ']]) {
      if (m.from === sq || m.to === sq) c[key] = false;
    }
    return {
      board,
      turn: them,
      castling: c,
      ep: m.double ? (m.from + m.to) / 2 : -1,
      half: (piece[1] === 'P' || m.captured) ? 0 : s.half + 1,
      full: s.full + (us === 'b' ? 1 : 0),
    };
  }

  function legal(s) {
    const us = s.turn;
    const them = us === 'w' ? 'b' : 'w';
    return pseudo(s).filter((m) => {
      const ns = apply(s, m);
      return !attacked(ns.board, findKing(ns.board, us), them);
    });
  }

  function inCheck(s) {
    const them = s.turn === 'w' ? 'b' : 'w';
    return attacked(s.board, findKing(s.board, s.turn), them);
  }

  function key(s) {
    const c = s.castling;
    return s.board.map((x) => x || '-').join('') + s.turn +
      (c.wK ? 'K' : '') + (c.wQ ? 'Q' : '') + (c.bK ? 'k' : '') + (c.bQ ? 'q' : '') + s.ep;
  }

  function insufficient(board) {
    const minors = [];
    for (let i = 0; i < 64; i++) {
      const p = board[i];
      if (!p || p[1] === 'K') continue;
      if (p[1] === 'P' || p[1] === 'R' || p[1] === 'Q') return false;
      minors.push({ t: p[1], shade: ((i >> 3) + (i & 7)) % 2 });
    }
    if (minors.length <= 1) return true;
    if (minors.every((m) => m.t === 'B') && minors.every((m) => m.shade === minors[0].shade)) return true;
    return false;
  }

  function toSan(m, legalList) {
    if (m.castle) return m.castle === 'K' ? 'O-O' : 'O-O-O';
    let out = '';
    const cap = !!m.captured;
    if (m.piece === 'P') {
      if (cap) out += FILES[m.from & 7] + 'x';
      out += sqName(m.to);
      if (m.promo) out += '=' + m.promo;
    } else {
      out += m.piece;
      const others = legalList.filter((o) => o.piece === m.piece && o.to === m.to && o.from !== m.from);
      if (others.length) {
        const sameFile = others.some((o) => (o.from & 7) === (m.from & 7));
        const sameRank = others.some((o) => (o.from >> 3) === (m.from >> 3));
        if (!sameFile) out += FILES[m.from & 7];
        else if (!sameRank) out += 8 - (m.from >> 3);
        else out += sqName(m.from);
      }
      if (cap) out += 'x';
      out += sqName(m.to);
    }
    return out;
  }

  class Game {
    constructor() { this.reset(); }

    reset() {
      this.state = initialState();
      this.history = [];
      this.keys = [key(this.state)];
      this._legal = null;
    }

    get board() { return this.state.board; }
    get turn() { return this.state.turn; }

    findKing(color) { return findKing(this.state.board, color); }
    inCheck() { return inCheck(this.state); }

    legalMoves() {
      if (!this._legal) this._legal = legal(this.state);
      return this._legal;
    }

    movesFrom(sq) { return this.legalMoves().filter((m) => m.from === sq); }

    move(from, to, promo) {
      const list = this.legalMoves();
      const find = (pr) => list.find((x) => x.from === from && x.to === to && (x.promo || null) === (pr || null));
      const m = find(promo) || (promo ? null : find('Q'));
      if (!m) return null;

      let san = toSan(m, list);
      const prev = this.state;
      const mover = prev.turn;
      this.state = apply(prev, m);
      this._legal = null;
      const nextMoves = this.legalMoves();
      if (nextMoves.length === 0) san += inCheck(this.state) ? '#' : '';
      else if (inCheck(this.state)) san += '+';

      const rec = {
        move: m,
        san,
        color: mover,
        captured: m.captured ? (mover === 'w' ? 'b' : 'w') + m.captured : null,
        prev,
      };
      this.history.push(rec);
      this.keys.push(key(this.state));
      return rec;
    }

    undo() {
      const rec = this.history.pop();
      if (!rec) return false;
      this.keys.pop();
      this.state = rec.prev;
      this._legal = null;
      return true;
    }

    status() {
      const check = inCheck(this.state);
      const moves = this.legalMoves();
      if (moves.length === 0) {
        if (check) {
          return { over: true, result: 'checkmate', winner: this.state.turn === 'w' ? 'b' : 'w', check };
        }
        return { over: true, result: 'draw', reason: 'stalemate', check };
      }
      if (insufficient(this.state.board)) return { over: true, result: 'draw', reason: 'material', check };
      if (this.state.half >= 100) return { over: true, result: 'draw', reason: 'fifty', check };
      const cur = this.keys[this.keys.length - 1];
      if (this.keys.filter((k) => k === cur).length >= 3) {
        return { over: true, result: 'draw', reason: 'repetition', check };
      }
      return { over: false, check };
    }
  }

  const api = { Game, sqName, initialState, _internals: { legal, apply } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.KiritoChess = api;
})(typeof window !== 'undefined' ? window : globalThis);
