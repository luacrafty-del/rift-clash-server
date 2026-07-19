// Authoritative simulation. Runs ONLY on the server. Clients send inputs in,
// and render whatever state comes back out — they never decide outcomes themselves.
// This is what makes the match shared instead of "everyone playing a local copy".

const LANE_START = { x: 40, y: 40 };
const LANE_END = { x: 760, y: 760 };
const LANE_LEN = Math.hypot(LANE_END.x - LANE_START.x, LANE_END.y - LANE_START.y);

function lanePoint(t) {
  return { x: LANE_START.x + (LANE_END.x - LANE_START.x) * t, y: LANE_START.y + (LANE_END.y - LANE_START.y) * t };
}
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function createInitialGameState(teamA, teamB, picks) {
  const units = {};
  teamA.forEach((p, i) => { units[p.id] = makeHero(p, 'blue', picks[p.id], i); });
  teamB.forEach((p, i) => { units[p.id] = makeHero(p, 'red', picks[p.id], i); });

  return {
    time: 0,
    units,           // id -> unit
    minions: [],
    towers: makeTowers(),
    projectiles: [],
    killsBlue: 0,
    killsRed: 0,
    minionSpawnTimer: 3,
    nextId: 1
  };
}

function makeHero(player, team, hero, slotIndex) {
  const spawn = team === 'blue' ? LANE_START : LANE_END;
  const offset = (slotIndex - 2) * 14;
  return {
    id: player.id, kind: 'hero', name: player.name, hero: hero || 'Ronin', isBot: !!player.isBot,
    team, x: spawn.x + offset, y: spawn.y + offset,
    hp: 640, maxHp: 640, mp: 280, maxMp: 280,
    level: 1, xp: 0, xpNeeded: 100, gold: 350,
    attackDamage: 55, armor: 20, attackRange: 60, speed: 150,
    atkCd: 0, abilityCd: [0, 0, 0, 0],
    dead: false, respawnAt: 0,
    input: { moveX: 0, moveY: 0, attackTargetId: null, castAbility: null },
    kills: 0, deaths: 0
  };
}

function makeTowers() {
  const defs = [
    { team: 'blue', t: 0.20 }, { team: 'blue', t: 0.42 },
    { team: 'red', t: 0.80 }, { team: 'red', t: 0.58 }
  ];
  return defs.map((d, i) => {
    const p = lanePoint(d.t);
    return { id: 'tower_' + i, kind: 'tower', team: d.team, x: p.x, y: p.y, hp: 1800, maxHp: 1800, dead: false, atkCd: 0 };
  });
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
}

function allUnits(state) {
  return [...Object.values(state.units), ...state.minions, ...state.towers];
}

function simulateTick(state, dt) {
  state.time += dt;

  // spawn waves
  state.minionSpawnTimer -= dt;
  if (state.minionSpawnTimer <= 0) {
    for (let i = 0; i < 3; i++) {
      state.minions.push(makeMinion(state, 'blue'));
      state.minions.push(makeMinion(state, 'red'));
    }
    state.minionSpawnTimer = 8;
  }

  for (const u of Object.values(state.units)) updateHero(state, u, dt);
  for (const m of state.minions) if (!m.dead) updateMinion(state, m, dt);
  for (const t of state.towers) if (!t.dead) updateTower(state, t, dt);

  state.minions = state.minions.filter(m => !m.dead || (m._cullT = (m._cullT || 0) + dt) < 1);
  updateProjectiles(state, dt);

  const towersBlueAlive = state.towers.some(t => t.team === 'blue' && !t.dead);
  const towersRedAlive = state.towers.some(t => t.team === 'red' && !t.dead);
  if (!towersRedAlive) return { matchOver: true, winner: 'blue' };
  if (!towersBlueAlive) return { matchOver: true, winner: 'red' };
  return { matchOver: false };
}

function makeMinion(state, team) {
  const p = lanePoint(team === 'blue' ? 0.02 : 0.98);
  return {
    id: 'minion_' + (state.nextId++), kind: 'minion', team, x: p.x, y: p.y,
    t: team === 'blue' ? 0.02 : 0.98, dir: team === 'blue' ? 1 : -1,
    hp: 220, maxHp: 220, speed: 60, attackRange: 55, attackDamage: 22, atkCd: 0, dead: false
  };
}

function findTarget(state, u, range) {
  let best = null, bd = range;
  for (const other of allUnits(state)) {
    if (other.dead || other.team === u.team || other.id === u.id) continue;
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
  } else if (target.kind === 'tower') {
    // handled by alive-check in simulateTick
  } else if (target.kind === 'minion') {
    if (source && source.kind === 'hero') { grantXp(source, 18); source.gold += 12; }
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
      const spawn = u.team === 'blue' ? LANE_START : LANE_END;
      u.dead = false; u.x = spawn.x; u.y = spawn.y; u.hp = u.maxHp; u.mp = u.maxMp;
    }
    return;
  }
  u.hp = Math.min(u.maxHp, u.hp + dt * 4.5);
  u.mp = Math.min(u.maxMp, u.mp + dt * 4);
  u.atkCd = Math.max(0, u.atkCd - dt);
  for (let i = 0; i < u.abilityCd.length; i++) u.abilityCd[i] = Math.max(0, u.abilityCd[i] - dt);

  if (u.isBot) { runBotAI(state, u, dt); return; }

  // real player: driven by their last-sent input
  const atkTarget = u.input.attackTargetId ? state.units[u.input.attackTargetId] || state.minions.find(m => m.id === u.input.attackTargetId) || state.towers.find(t => t.id === u.input.attackTargetId) : null;

  if (atkTarget && !atkTarget.dead) {
    const d = dist(u, atkTarget);
    if (d > u.attackRange) moveToward(u, atkTarget.x, atkTarget.y, dt);
    else if (u.atkCd <= 0) { dealDamage(state, u, atkTarget, u.attackDamage); u.atkCd = 0.95; }
  } else if (u.input.moveX || u.input.moveY) {
    const m = Math.hypot(u.input.moveX, u.input.moveY) || 1;
    u.x += (u.input.moveX / m) * u.speed * dt;
    u.y += (u.input.moveY / m) * u.speed * dt;
  }

  if (u.input.castAbility) {
    const slot = u.input.castAbility.slot;
    if (u.abilityCd[slot] <= 0 && u.mp >= 40) {
      u.mp -= 40; u.abilityCd[slot] = [5, 8, 12, 60][slot] || 8;
      const tx = u.input.castAbility.targetX, ty = u.input.castAbility.targetY;
      for (const other of allUnits(state)) {
        if (other.dead || other.team === u.team) continue;
        if (dist({ x: tx, y: ty }, other) < 120) dealDamage(state, u, other, 90 + u.level * 5);
      }
    }
    u.input.castAbility = null;
  }
}

function moveToward(u, tx, ty, dt) {
  const d = dist(u, { x: tx, y: ty });
  if (d < 4) return true;
  u.x += ((tx - u.x) / d) * u.speed * dt;
  u.y += ((ty - u.y) / d) * u.speed * dt;
  return false;
}

function runBotAI(state, u, dt) {
  const enemy = findTarget(state, u, 380);
  if (enemy) {
    const d = dist(u, enemy);
    if (d > u.attackRange * 0.9) moveToward(u, enemy.x, enemy.y, dt);
    else if (u.atkCd <= 0) { dealDamage(state, u, enemy, u.attackDamage); u.atkCd = 0.95; }
  } else {
    const goal = u.team === 'blue' ? LANE_END : LANE_START;
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
    m.t = clamp(m.t + m.dir * dt / (LANE_LEN / m.speed), 0, 1);
    const p = lanePoint(m.t);
    m.x = p.x; m.y = p.y;
  }
}

function updateTower(state, t, dt) {
  t.atkCd = Math.max(0, t.atkCd - dt);
  const target = findTarget(state, t, 180);
  if (target && t.atkCd <= 0) { dealDamage(state, t, target, 70); t.atkCd = 0.9; }
}

function updateProjectiles(state, dt) {
  state.projectiles = state.projectiles.filter(p => { p.life -= dt; return p.life > 0; });
}

module.exports = { createInitialGameState, simulateTick, applyPlayerInput };
