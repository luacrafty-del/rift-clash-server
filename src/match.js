const {
  HEROES, BAN_PHASE_MS, BAN_SLOTS, PICK_PHASE_MS, PICK_TURN_MS, LOADING_MS, TICK_RATE
} = require('./constants');
const { simulateTick, createInitialGameState, applyPlayerInput } = require('./simulation');

let matchCounter = 0;

/**
 * One full match: ban -> pick -> loading -> live simulation -> ended.
 * Broadcasts state to every connected player (real or spectating), drives bots itself.
 */
class Match {
  constructor(teamA, teamB, registerMatch) {
    this.id = 'match_' + (++matchCounter) + '_' + Date.now().toString(36);
    this.teamA = teamA; // blue
    this.teamB = teamB; // red
    this.players = [...teamA, ...teamB];
    this.registerMatch = registerMatch;

    this.phase = 'ban'; // ban -> pick -> loading -> live -> ended
    this.bans = [];             // [{ team, hero }]
    this.picks = {};            // playerId -> hero
    this.pickOrder = this._buildDraftOrder();
    this.pickIndex = 0;
    this.phaseEndsAt = Date.now() + BAN_PHASE_MS;
    this.loadProgress = {};     // playerId -> 0..100

    this.gameState = null;
    this.tickHandle = null;
    this.phaseTimer = null;

    this._broadcastAll();
    this._scheduleBanPhaseEnd();
  }

  // ---------- draft order: alternating blue/red, roughly MLBB-style ----------
  _buildDraftOrder() {
    const order = [];
    for (let i = 0; i < 5; i++) {
      order.push(this.teamA[i % this.teamA.length].id);
      order.push(this.teamB[i % this.teamB.length].id);
    }
    return order;
  }

  _playerById(id) { return this.players.find(p => p.id === id); }
  _teamOf(id) { return this.teamA.some(p => p.id === id) ? 'blue' : 'red'; }

  // ---------- BAN PHASE ----------
  handleBan(playerId, hero) {
    if (this.phase !== 'ban') return;
    if (this.bans.length >= BAN_SLOTS) return;
    if (this.bans.some(b => b.hero === hero)) return;
    this.bans.push({ team: this._teamOf(playerId), hero, by: playerId });
    this._broadcastAll();
    if (this.bans.length >= BAN_SLOTS) this._startPickPhase();
  }

  _scheduleBanPhaseEnd() {
    this.phaseTimer = setTimeout(() => {
      // auto-fill remaining bans randomly so the draft never stalls
      while (this.bans.length < BAN_SLOTS) {
        const available = HEROES.filter(h => !this.bans.some(b => b.hero === h));
        const hero = available[Math.floor(Math.random() * available.length)];
        const team = this.bans.length % 2 === 0 ? 'blue' : 'red';
        this.bans.push({ team, hero, by: null });
      }
      this._startPickPhase();
    }, BAN_PHASE_MS);
  }

  // ---------- PICK PHASE ----------
  _startPickPhase() {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phase = 'pick';
    this.pickIndex = 0;
    this.phaseEndsAt = Date.now() + PICK_PHASE_MS;
    this._broadcastAll();
    this._scheduleNextPickTurn();
  }

  _scheduleNextPickTurn() {
    if (this.pickIndex >= this.pickOrder.length) { this._startLoading(); return; }
    const currentPlayerId = this.pickOrder[this.pickIndex];
    this.currentPickDeadline = Date.now() + PICK_TURN_MS;
    this._broadcastAll();
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phaseTimer = setTimeout(() => {
      const p = this._playerById(currentPlayerId);
      if (p && !this.picks[currentPlayerId]) {
        this._autoPick(currentPlayerId);
      }
    }, PICK_TURN_MS);
  }

  handlePick(playerId, hero) {
    if (this.phase !== 'pick') return;
    if (this.pickOrder[this.pickIndex] !== playerId) return; // not your turn
    if (this.bans.some(b => b.hero === hero)) return;
    if (Object.values(this.picks).includes(hero)) return;
    this.picks[playerId] = hero;
    this.pickIndex++;
    this._broadcastAll();
    this._scheduleNextPickTurn();
  }

  _autoPick(playerId) {
    const taken = new Set([...this.bans.map(b => b.hero), ...Object.values(this.picks)]);
    const available = HEROES.filter(h => !taken.has(h));
    const hero = available[Math.floor(Math.random() * available.length)] || HEROES[0];
    this.picks[playerId] = hero;
    this.pickIndex++;
    this._broadcastAll();
    this._scheduleNextPickTurn();
  }

  // ---------- LOADING PHASE ----------
  _startLoading() {
    this.phase = 'loading';
    this.phaseEndsAt = Date.now() + LOADING_MS;
    for (const p of this.players) this.loadProgress[p.id] = p.isBot ? 100 : 0;
    this._broadcastAll();
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phaseTimer = setTimeout(() => this._startLive(), LOADING_MS);
  }

  handleLoadProgress(playerId, pct) {
    if (this.phase !== 'loading') return;
    this.loadProgress[playerId] = Math.max(0, Math.min(100, pct));
    this._broadcastAll();
  }

  // ---------- LIVE MATCH ----------
  _startLive() {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phase = 'live';
    this.gameState = createInitialGameState(this.teamA, this.teamB, this.picks);
    this._broadcastAll();

    const dt = 1 / TICK_RATE;
    this.tickHandle = setInterval(() => {
      const result = simulateTick(this.gameState, dt);
      this._broadcastState();
      if (result.matchOver) this._endMatch(result.winner);
    }, 1000 / TICK_RATE);
  }

  handleInput(playerId, input) {
    if (this.phase !== 'live' || !this.gameState) return;
    applyPlayerInput(this.gameState, playerId, input);
  }

  _endMatch(winner) {
    if (this.tickHandle) clearInterval(this.tickHandle);
    this.phase = 'ended';
    this.winner = winner;
    this._broadcastAll();
  }

  // ---------- networking ----------
  _send(player, msg) {
    if (player.socket && player.socket.readyState === 1) {
      player.socket.send(JSON.stringify(msg));
    }
  }

  _broadcastAll() {
    const payload = {
      type: 'match_state',
      matchId: this.id,
      phase: this.phase,
      teamA: this.teamA.map(p => ({ id: p.id, name: p.name, isBot: !!p.isBot })),
      teamB: this.teamB.map(p => ({ id: p.id, name: p.name, isBot: !!p.isBot })),
      bans: this.bans,
      picks: this.picks,
      pickOrder: this.pickOrder,
      pickIndex: this.pickIndex,
      phaseEndsAt: this.phaseEndsAt,
      loadProgress: this.loadProgress,
      winner: this.winner || null
    };
    for (const p of this.players) this._send(p, { ...payload, you: p.id, yourTeam: this._teamOf(p.id) });
  }

  _broadcastState() {
    if (!this.gameState) return;
    const payload = { type: 'game_tick', matchId: this.id, state: this.gameState };
    for (const p of this.players) this._send(p, payload);
  }

  removePlayer(playerId) {
    // Real player disconnected mid-match: hand control to a bot rather than crashing the match.
    const p = this._playerById(playerId);
    if (p) p.isBot = true;
  }
}

module.exports = { Match };
                    
