// Authoritative simulation. Runs ONLY on the server. Clients send inputs in,
// and render whatever state comes back out — they never decide outcomes themselves.
// Map geometry here is kept IN SYNC with the client's WORLD/BLUE_BASE/RED_BASE/
// laneWaypoints/setupTowers/setupJungle so the server's real map matches what
// players see: 3 lanes (top/mid/bot), a jungle with camps, 2 towers + 1 base
// tower per lane per side.

const WORLD = { w: 3200, h: 3200 };
const BLUE_BASE = { x: 260, y: WORLD.h - 260 };
const RED_BASE = { x: WORLD.w - 260, y: 260 };

function laneWaypoints(lane) {
  if (lane === 'top') {
    return [
      { x: BLUE_BASE.x, y: BLUE_BASE.y },
      { x: 260, y: 400 },
      { x: 900, y: 260 },
      { x: 1900, y: 260 },
      { x: RED_BASE.x, y: 260 },
      { x: RED_BASE.x, y: RED_BASE.y }
    ];
  } else if (lane === 'mid') {
    return [
      { x: BLUE_BASE.x, y: BLUE_BASE.y },
      { x: 1000, y: 2100 },
      { x: 1600, y: 1600 },
      { x: 2200, y: 1100 },
      { x: RED_BASE.x, y: RED_BASE.y }
    ];
  } else {
    return [
      { x: BLUE_BASE.x, y: BLUE_BASE.y },
      { x: 400, y: WORLD.h - 260 },
      { x: 2300, y: WORLD.h - 260 },
      { x: 2940, y: 1900 },
      { x: RED_BASE.x, y: RED_BASE.y }
    ];
  }
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function pathLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
  return len;
}
function pointAlongPath(pts, t) {
  const total = pathLength(pts);
  let target = clamp(t, 0, 1) * total;
  for (let i = 1; i < pts.length; i++) {
    const segLen = dist(pts[i - 1], pts[i]);
    if (target <= segLen || i === pts.length - 1) {
      const segT = segLen === 0 ? 0 : target / segLen;
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * segT,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * segT
      };
    }
    target -= segLen;
  }
  return pts[pts.length - 1];
}

const LANES = ['top', 'mid', 'bot'];
const LANE_PATHS = { top: laneWaypoints('top'), mid: laneWaypoints('mid'), bot: laneWaypoints('bot') };
const LANE_LENGTHS = { top: pathLength(LANE_PATHS.top), mid: pathLength(LANE_PATHS.mid), bot: pathLength(LANE_PATHS.bot) };

// Tower layout matches the client's setupTowers() exactly.
const TOWER_DEFS = [
  { team: 'blue', lane: 'top', x: 700, y: 300, tier: 'outer' },
  { team: 'blue', lane: 'top', x: 1500, y: 260, tier: 'inner' },
  { team: 'red', lane: 'top', x: 2400, y: 260, tier: 'outer' },
  { team: 'red', lane: 'top', x: 1900, y: 400, tier: 'inner' },

  { team: 'blue', lane: 'mid', x: 1000, y: 1900, tier: 'outer' },
  { team: 'blue', lane: 'mid', x: 1450, y: 1550, tier: 'inner' },
  { team: 'red', lane: 'mid', x: 2200, y: 1300, tier: 'outer' },
  { team: 'red', lane: 'mid', x: 1750, y: 1650, tier: 'inner' },

  { team: 'blue', lane: 'bot', x: 700, y: WORLD.h - 300, tier: 'outer' },
  { team: 'blue', lane: 'bot', x: 1500, y: WORLD.h - 300, tier: 'inner' },
  { team: 'red', lane: 'bot', x: 2400, y: WORLD.h - 300, tier: 'outer' },
  { team: 'red', lane: 'bot', x: 1900, y: WORLD.h - 500, tier: 'inner' },

  { team: 'blue', lane: 'base', x: BLUE_BASE.x + 90, y: BLUE_BASE.y - 90, tier: 'base' },
  { team: 'red', lane: 'base', x: RED_BASE.x - 90, y: RED_BASE.y + 90, tier: 'base' }
];

const JUNGLE_DEFS = [
  { x: 900, y: 1000, kind: 'buff-blue', hp: 1400, atk: 90 },
  { x: 2300, y: 2200, kind: 'buff-red', hp: 1400, atk: 90 },
  { x: 1600, y: 900, kind: 'lord', hp: 5500, atk: 180 },
  { x: 1600, y: 2300, kind: 'turtle', hp: 3800, atk: 90 },
  { x: 700, y: 1700, kind: 'small', hp: 900, atk: 90 },
  { x: 2500, y: 1500, kind: 'small', hp: 900, atk: 90 }
];

function createInitialGameState(teamA, teamB, picks) {
  const units = {};
  teamA.forEach((p, i) => { units[p.id] = makeHero(p, 'blue', picks[p.id], i); });
  teamB.forEach((p, i) => { units[p.id] = makeHero(p, 'red', picks[p.id], i); });

  return {
    time: 0,
    units,           // id -> unit
    minions: [],
    towers: makeTowers(),
    jungle: makeJungle(),
    projectiles: [],
    killsBlue: 0,
    killsRed: 0,
    minionSpawnTimer: 3,
    nextId: 1
  };
}

function makeHero(player, team, hero, slotIndex) {
  const base = team === 'blue' ? BLUE_BASE : RED_BASE;
  // Spread the 5 teammates around their base instead of stacking on top of each other.
  const angle = (slotIndex || 0) * (Math.PI * 2 / 5);
  const spreadRadius = 70;
  const ox = Math.cos(angle) * spreadRadius;
  const oy = Math.sin(angle) * spreadRadius;
  const laneBySlot = ['top', 'top', 'mid', 'bot', 'bot'];
  return {
    id: player.id, kind: 'hero', name: player.name, hero: hero || 'Ronin', isBot: !!player.isBot,
    team, x: base.x + ox, y: base.y + oy,
    hp: 640, maxHp: 640, mp: 280, maxMp: 280,
    level: 1, xp: 0, xpNeeded: 100, gold: 350,
    attackDamage: 55, armor: 20, attackRange: 60, speed: 150,
    atkCd: 0, abilityCd: [0, 0, 0, 0],
    dead: false, respawnAt: 0, facing: team === 'blue' ? Math.PI * 0.25 : Math.PI * 1.25,
    lane: laneBySlot[slotIndex || 0] || 'mid',
    input: { moveX: 0, moveY: 0, attackTargetId: null, castAbility: null },
    lastInputAt: 0,
    kills: 0, deaths: 0
  };
}

function makeTowers() {
  return TOWER_DEFS.map((d, i) => ({
    id: 'tower_' + i, kind: 'tower', team: d.team, lane: d.lane, tier: d.tier,
    x: d.x, y: d.y, hp: d.tier === 'base' ? 3000 : d.tier === 'inner' ? 2200 : 1800,
    maxHp: d.tier === 'base' ? 3000 : d.tier === 'inner' ? 2200 : 1800,
    dead: false, atkCd: 0
  }));
}

function makeJungle() {
  return JUNGLE_DEFS.map((d, i) => ({
    id: 'jungle_' + i, kind: 'jungle', team: 'neutral', x: d.x, y: d.y,
    hp: d.hp, maxHp: d.hp, atkDamage: d.atk, campKind: d.kind,
    dead: false, atkCd: 0, respawnAt: 0
  }));
}

// Client calls this whenever the local player moves the joystick, taps attack, or casts a skill.
// The server is the only place that turns that intent into an actual state change.
function applyPlayerInput(state, playerId, input) {
  const u = state.units[playerId];
  if (!u || u.dead) return;
  if (typeof input.moveX === 'number') u.input.moveX = clamp(input.moveX, -1, 1);
  if (typeof input.moveY === 'number') u.input.moveY = clamp(input.moveY, -1, 1);
  if (input.attackTargetId !== undefined) u.input.attackTargetId = input.attackTargetId;
  if (input.castAbility !== undefined) u.input.castAbility = input.castAbility; // {slot, targetX, targetY}
  u.lastInputAt = state.time;
}

function allUnits(state) {
  return [...Object.values(state.units), ...state.minions, ...state.towers, ...state.jungle];
}

// If no input packet has arrived recently (dropped connection, backgrounded tab,
// network hiccup), treat movement as released rather than letting a stale
// moveX/moveY keep pushing the hero forever — this was the "keeps moving after
// I stop" bug reported from the client's own prediction fighting a stuck input.
const INPUT_STALE_AFTER = 0.6; // seconds

function simulateTick(state, dt) {
  state.time += dt;

  // spawn waves along all 3 lanes
  state.minionSpawnTimer -= dt;
  if (state.minionSpawnTimer <= 0) {
    for (const lane of LANES) {
      for (let i = 0; i < 3; i++) {
        state.minions.push(makeMinion(state, 'blue', lane));
        state.minions.push(makeMinion(state, 'red', lane));
      }
    }
    state.minionSpawnTimer = 10;
  }

  for (const u of Object.values(state.units)) updateHero(state, u, dt);
  for (const m of state.minions) if (!m.dead) updateMinion(state, m, dt);
  for (const t of state.towers) if (!t.dead) updateTower(state, t, dt);
  for (const j of state.jungle) updateJungleCamp(state, j, dt);

  state.minions = state.minions.filter(m => !m.dead || (m._cullT = (m._cullT || 0) + dt) < 1);
  updateProjectiles(state, dt);

  const towersBlueAlive = state.towers.some(t => t.team === 'blue' && !t.dead);
  const towersRedAlive = state.towers.some(t => t.team === 'red' && !t.dead);
  if (!towersRedAlive) return { matchOver: true, winner: 'blue' };
  if (!towersBlueAlive) return { matchOver: true, winner: 'red' };
  return { matchOver: false };
}

function makeMinion(state, team, lane) {
  const path = LANE_PATHS[lane];
  const start = team === 'blue' ? path[0] : path[path.length - 1];
  return {
    id: 'minion_' + (state.nextId++), kind: 'minion', team, lane, x: start.x, y: start.y,
    t: team === 'blue' ? 0 : 1, dir: team === 'blue' ? 1 : -1,
    hp: 220, maxHp: 220, speed: 60, attackRange: 55, attackDamage: 22, atkCd: 0, dead: false
  };
}

function findTarget(state, u, range) {
  let best = null, bd = range;
  for (const other of allUnits(state)) {
    if (other.dead || other.team === u.team || other.id === u.id || other.kind === 'jungle') continue;
    const d = dist(u, other);
    if (d < bd) { bd = d; best = other; }
  }
  return best;
}

function dealDamage(state, source, target, amount) {
  const armor = target.armor || 0;
  const dmg = Math.max(1, amount - armor * 0.5);
  target.hp -= dmg;
  if (target.hp <= 0 && !target.dead) killUnit(state, source, target);
}

function killUnit(state, source, target) {
  target.dead = true;
  if (target.kind === 'hero') {
    target.deaths++;
    target.respawnAt = state.time + 5 + target.level * 0.6;
    if (source && source.kind === 'hero' && source.team !== target.team) {
      source.kills++;
      source.gold += 150 + target.level * 15;
      grantXp(source, 80);
      if (source.team === 'blue') state.killsBlue++; else state.killsRed++;
    }
  } else if (target.kind === 'minion') {
    if (source && source.kind === 'hero') { grantXp(source, 18); source.gold += 12; }
  } else if (target.kind === 'jungle') {
    target.respawnAt = state.time + (target.campKind === 'lord' || target.campKind === 'turtle' ? 180 : 90);
    if (source && source.kind === 'hero') { grantXp(source, target.campKind === 'lord' ? 200 : 40); source.gold += target.campKind === 'lord' ? 100 : 25; }
  }
}

function grantXp(hero, amount) {
  hero.xp += amount;
  while (hero.xp >= hero.xpNeeded) {
    hero.xp -= hero.xpNeeded;
    hero.level++;
    hero.xpNeeded = Math.round(hero.xpNeeded * 1.18);
    hero.maxHp += 75; hero.hp = Math.min(hero.maxHp, hero.hp + 75);
    hero.maxMp += 20; hero.mp = Math.min(hero.maxMp, hero.mp + 20);
    hero.attackDamage += 6;
  }
}

function updateHero(state, u, dt) {
  if (u.dead) {
    if (state.time >= u.respawnAt) {
      const base = u.team === 'blue' ? BLUE_BASE : RED_BASE;
      u.dead = false; u.x = base.x; u.y = base.y; u.hp = u.maxHp; u.mp = u.maxMp;
    }
    return;
  }
  u.hp = Math.min(u.maxHp, u.hp + dt * 4.5);
  u.mp = Math.min(u.maxMp, u.mp + dt * 4);
  u.atkCd = Math.max(0, u.atkCd - dt);
  for (let i = 0; i < u.abilityCd.length; i++) u.abilityCd[i] = Math.max(0, u.abilityCd[i] - dt);

  if (u.isBot) { runBotAI(state, u, dt); return; }

  // Stale input protection: if the client hasn't sent anything in a while,
  // stop moving instead of continuing to drift on the last received vector.
  if (state.time - (u.lastInputAt || 0) > INPUT_STALE_AFTER) {
    u.input.moveX = 0; u.input.moveY = 0;
  }

  const atkTarget = u.input.attackTargetId
    ? (state.units[u.input.attackTargetId] || state.minions.find(m => m.id === u.input.attackTargetId) || state.towers.find(t => t.id === u.input.attackTargetId) || state.jungle.find(j => j.id === u.input.attackTargetId))
    : null;

  if (atkTarget && !atkTarget.dead) {
    const d = dist(u, atkTarget);
    u.facing = Math.atan2(atkTarget.y - u.y, atkTarget.x - u.x);
    if (d > u.attackRange) moveToward(u, atkTarget.x, atkTarget.y, dt);
    else if (u.atkCd <= 0) { dealDamage(state, u, atkTarget, u.attackDamage); u.atkCd = 0.95; }
  } else if (u.input.moveX || u.input.moveY) {
    const m = Math.hypot(u.input.moveX, u.input.moveY) || 1;
    u.x = clamp(u.x + (u.input.moveX / m) * u.speed * dt, 0, WORLD.w);
    u.y = clamp(u.y + (u.input.moveY / m) * u.speed * dt, 0, WORLD.h);
    u.facing = Math.atan2(u.input.moveY, u.input.moveX);
  }

  if (u.input.castAbility) {
    const slot = u.input.castAbility.slot;
    if (u.abilityCd[slot] <= 0 && u.mp >= 40) {
      u.mp -= 40; u.abilityCd[slot] = [5, 8, 12, 60][slot] || 8;
      const tx = u.input.castAbility.targetX, ty = u.input.castAbility.targetY;
      for (const other of allUnits(state)) {
        if (other.dead || other.team === u.team || other.kind === 'jungle') continue;
        if (dist({ x: tx, y: ty }, other) < 120) dealDamage(state, u, other, 90 + u.level * 5);
      }
    }
    u.input.castAbility = null;
  }
}

function moveToward(u, tx, ty, dt) {
  const d = dist(u, { x: tx, y: ty });
  if (d < 4) return true;
  u.facing = Math.atan2(ty - u.y, tx - u.x);
  const step = Math.min(d, u.speed * dt); // never overshoot the target
  u.x += ((tx - u.x) / d) * step;
  u.y += ((ty - u.y) / d) * step;
  return false;
}

function runBotAI(state, u, dt) {
  const enemy = findTarget(state, u, 380);
  if (enemy) {
    const d = dist(u, enemy);
    if (d > u.attackRange * 0.9) moveToward(u, enemy.x, enemy.y, dt);
    else if (u.atkCd <= 0) { dealDamage(state, u, enemy, u.attackDamage); u.atkCd = 0.95; }
  } else {
    // Push down the bot's assigned lane toward the enemy base.
    const path = LANE_PATHS[u.lane] || LANE_PATHS.mid;
    const goal = u.team === 'blue' ? path[path.length - 1] : path[0];
    moveToward(u, goal.x, goal.y, dt);
  }
}

function updateMinion(state, m, dt) {
  m.atkCd = Math.max(0, m.atkCd - dt);
  const target = findTarget(state, m, 140);
  if (target) {
    const d = dist(m, target);
    if (d > m.attackRange) moveToward(m, target.x, target.y, dt);
    else if (m.atkCd <= 0) { dealDamage(state, m, target, m.attackDamage); m.atkCd = 1.1; }
  } else {
    const path = LANE_PATHS[m.lane] || LANE_PATHS.mid;
    const total = LANE_LENGTHS[m.lane] || LANE_LENGTHS.mid;
    m.t = clamp(m.t + m.dir * dt / (total / m.speed), 0, 1);
    const p = pointAlongPath(path, m.t);
    m.x = p.x; m.y = p.y;
  }
}

function updateTower(state, t, dt) {
  t.atkCd = Math.max(0, t.atkCd - dt);
  const target = findTarget(state, t, 180);
  if (target && t.atkCd <= 0) { dealDamage(state, t, target, t.tier === 'base' ? 100 : t.tier === 'inner' ? 85 : 70); t.atkCd = 0.9; }
}

function updateJungleCamp(state, j, dt) {
  if (j.dead) {
    if (state.time >= j.respawnAt) { j.dead = false; j.hp = j.maxHp; }
    return;
  }
  j.atkCd = Math.max(0, j.atkCd - dt);
  // Camps only fight back if a hero is standing right next to them (simple aggro).
  let attacker = null, bd = 60;
  for (const u of Object.values(state.units)) {
    if (u.dead) continue;
    const d = dist(j, u);
    if (d < bd) { bd = d; attacker = u; }
  }
  if (attacker && j.atkCd <= 0) { dealDamage(state, j, attacker, j.atkDamage * 0.4); j.atkCd = 1.2; }
}

function updateProjectiles(state, dt) {
  state.projectiles = state.projectiles.filter(p => { p.life -= dt; return p.life > 0; });
}

module.exports = { createInitialGameState, simulateTick, applyPlayerInput, WORLD, BLUE_BASE, RED_BASE, LANE_PATHS };
