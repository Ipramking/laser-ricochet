/**
 * Laser Ricochet — Chain Casino SDK bridge (guest side).
 *
 * Speaks the real Chain.wtf guest protocol from the Casino SDK:
 *   - Penpal handshake via `connectGameToHost` (vendored below; penpal is lazy-loaded
 *     only when embedded, so the standalone demo stays dependency-free and instant).
 *   - Exposes `GuestApiV1.setState(snapshot)`; the host pushes `HostSnapshotV1`.
 *   - Places bets with `hostApi.openSession({ wager, gameData })`, watches
 *     `snapshot.sessions.items` for the matching session to reach a terminal phase,
 *     then calls `hostApi.revealOutcome({ sessionId })` when the animation finishes.
 *
 * Money is authoritative on-chain: in embedded mode the settled multiplier/payout come
 * from the host snapshot (decoded from the contract's committed `gameState`), never from
 * client raycast math. Standalone mode keeps a local provably-fair simulation for the demo.
 *
 * See docs/CHAIN_WTF_CASINO_GAMES.md §3 and §8.1 (vendoring is explicitly supported).
 */

const PENPAL_URL = 'https://esm.sh/penpal@7.0.4';
const CONNECT_TIMEOUT_MS = 4000;

// SessionPhase enum (ICasinoGameV2.sol)
const PHASE = { NONE: 0, WAITING_RANDOMNESS: 1, WAITING_PLAYER_ACTION: 2, SETTLED: 3, FORFEITED: 4, CANCELLED: 5 };
const isTerminalPhase = (p) => p === PHASE.SETTLED || p === PHASE.FORFEITED || p === PHASE.CANCELLED;

// --- minimal ABI / unit helpers (avoid a viem dependency in the buildless demo) ---
const toWord = (n) => BigInt(n).toString(16).padStart(64, '0');

/** abi.encode(uint8 channel, uint8 mode) */
function encodeGameData(channel, mode) {
  return '0x' + toWord(channel) + toWord(mode);
}

/** decode contract gameState abi.encode(uint8,uint8,bytes32,uint256) */
function decodeGameState(hex) {
  if (!hex || typeof hex !== 'string') return null;
  const h = hex.replace(/^0x/, '');
  if (h.length < 256) return null;
  const word = (i) => h.slice(i * 64, (i + 1) * 64);
  const channel = parseInt(word(0), 16);
  const mode = parseInt(word(1), 16);
  const randomness = '0x' + word(2);
  const payoutBps = BigInt('0x' + word(3));
  return { channel, mode, randomness, payoutBps };
}

function parseUnits(value, decimals) {
  const [whole, frac = ''] = String(value).split('.');
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  const digits = (whole + fracPadded).replace(/^0+/, '') || '0';
  return BigInt(digits).toString();
}

function formatUnits(base, decimals) {
  const s = BigInt(base).toString().padStart(decimals + 1, '0');
  const whole = s.slice(0, -decimals) || '0';
  const frac = s.slice(-decimals).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}

export class ChainCasinoBridge {
  constructor() {
    this.isEmbedded = typeof window !== 'undefined' && window.parent !== window;
    this.mode = 'standalone';        // resolved to 'embedded' after a successful handshake
    this.hostApi = null;
    this.snapshot = null;
    this.connection = null;
    this.listeners = [];
    // standalone wallet
    this.local = { balance: '1000.00', currency: 'USDC', activeSession: null };
  }

  async init() {
    if (this.isEmbedded) {
      try {
        await this._connectHost();
        this.mode = 'embedded';
        return;
      } catch (err) {
        console.warn('[LaserRicochet] Host handshake failed — standalone demo mode:', err);
      }
    }
    this._initStandalone();
  }

  async _connectHost() {
    const { WindowMessenger, connect } = await import(/* @vite-ignore */ PENPAL_URL);
    const allowedOrigins = (() => {
      try { return document.referrer ? [new URL(document.referrer).origin] : ['*']; }
      catch { return ['*']; }
    })();

    this.connection = connect({
      messenger: new WindowMessenger({ remoteWindow: window.parent, allowedOrigins }),
      methods: {
        setState: async (snapshot) => {
          this.snapshot = snapshot;
          this._emit();
        },
      },
    });

    this.hostApi = await Promise.race([
      this.connection.promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('handshake timeout')), CONNECT_TIMEOUT_MS)),
    ]);
  }

  _initStandalone() {
    this.mode = 'standalone';
    this._emit();
  }

  // ---- UI state ----
  subscribeState(cb) { this.listeners.push(cb); cb(this.getState()); }
  _emit() { const s = this.getState(); this.listeners.forEach((cb) => cb(s)); }

  getState() {
    if (this.mode === 'embedded' && this.snapshot) {
      const decimals = this.snapshot.token?.decimals ?? 18;
      const bal = this.snapshot.balances?.smartVaultBalance;
      return {
        connected: this.snapshot.wallet?.status === 'ready',
        balance: bal != null ? formatUnits(bal, decimals) : '0',
        currency: this.snapshot.token?.symbol ?? 'chUSD',
        walletStatus: this.snapshot.wallet?.status ?? 'disconnected',
        embedded: true,
      };
    }
    return {
      connected: true,
      balance: this.local.balance,
      currency: this.local.currency,
      walletStatus: 'ready',
      embedded: false,
    };
  }

  /**
   * Place a bet. Resolves once the round is settled and ready to animate:
   *   { seed, sessionId, authoritative, settled? { multiplier, payoutBps } }
   * In standalone mode the caller's raycast determines the multiplier (authoritative=false).
   */
  async openRound(wagerAmount, gameData) {
    const { channel, mode } = gameData; // mode: 0 standard, 1 overcharge

    if (this.mode === 'embedded') {
      if (this.snapshot?.wallet?.status !== 'ready') throw new Error('Wallet not ready');
      const decimals = this.snapshot.token?.decimals ?? 18;
      const wager = parseUnits(wagerAmount, decimals);
      const encoded = encodeGameData(channel, mode);

      const { sessionKey } = await this.hostApi.openSession({ wager, gameData: encoded });
      const item = await this._waitForSettled(sessionKey);

      const decoded = decodeGameState(item.raw?.gameState) || {};
      const seed = decoded.randomness || item.raw?.randomness || ('0x' + '0'.repeat(64));
      const payoutBps = decoded.payoutBps ?? 0n;
      return {
        seed,
        sessionId: item.sessionId,
        authoritative: true,
        settled: { multiplier: Number(payoutBps) / 10000, payoutBps },
      };
    }

    // ---- standalone: local provably-fair seed, caller raycasts the outcome ----
    const wager = parseFloat(wagerAmount);
    const bal = parseFloat(this.local.balance);
    if (wager > bal) throw new Error('Insufficient balance');
    this.local.balance = (bal - wager).toFixed(2);
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const seed = '0x' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    this.local.activeSession = { sessionId: 'sim_' + Date.now(), wager };
    this._emit();
    return { seed, sessionId: this.local.activeSession.sessionId, authoritative: false, settled: null };
  }

  _waitForSettled(sessionKey) {
    const find = () => (this.snapshot?.sessions?.items || []).find(
      (it) => it.sessionKey === sessionKey && (it.isSettled || isTerminalPhase(it.phase)),
    );
    const existing = find();
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve) => {
      const cb = () => { const it = find(); if (it) { this.listeners = this.listeners.filter((l) => l !== cb); resolve(it); } };
      this.listeners.push(cb);
    });
  }

  /** Called when the win animation finishes. Embedded: reveal so the host credits the payout. */
  async reveal(sessionId, multiplier) {
    if (this.mode === 'embedded') {
      try { await this.hostApi.revealOutcome({ sessionId }); } catch (e) { console.warn('[LaserRicochet] revealOutcome failed', e); }
      return;
    }
    // standalone: credit local balance
    const sess = this.local.activeSession;
    if (!sess) return;
    const payout = sess.wager * multiplier;
    this.local.balance = (parseFloat(this.local.balance) + payout).toFixed(2);
    this.local.activeSession = null;
    this._emit();
  }
}

export const bridge = new ChainCasinoBridge();
