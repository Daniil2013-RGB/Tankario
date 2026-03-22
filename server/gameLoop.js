const MAP_SIZE = 3000;
const FOOD_COUNT = 400;

const TANK_UPGRADES = {
  speed:  [5, 6.5, 8, 10, 13],
  size:   [1, 1.2, 1.5, 1.9, 2.4],
  damage: [10, 15, 22, 32, 45],
};

const BULLET_SPEED = 18;
const BULLET_LIFETIME = 80;
const SHOOT_COOLDOWN = 20;

let players = {};
let food = {};
let bullets = {};
let foodIdCounter = 0;
let bulletIdCounter = 0;

function randRange(min, max) {
  return Math.random() * (max - min) + min;
}

function spawnFood() {
  const id = foodIdCounter++;
  food[id] = {
    id,
    x: randRange(-MAP_SIZE / 2 + 100, MAP_SIZE / 2 - 100),
    z: randRange(-MAP_SIZE / 2 + 100, MAP_SIZE / 2 - 100),
    value: Math.floor(randRange(1, 5)),
  };
  return food[id];
}

function initFood() {
  for (let i = 0; i < FOOD_COUNT; i++) spawnFood();
}

function addPlayer(id, nickname) {
  players[id] = {
    id,
    nickname,
    x: randRange(-400, 400),
    z: randRange(-400, 400),
    angle: 0,
    score: 0,
    level: 1,
    upgrades: { speed: 0, size: 0, damage: 0 },
    upgradePoints: 0,
    hp: 100,
    maxHp: 100,
    alive: true,
    shootCooldown: 0,
  };
  return players[id];
}

function removePlayer(id) {
  delete players[id];
}

export function getPlayerRadius(p) {
  return 22 * TANK_UPGRADES.size[p.upgrades.size];
}

export function getPlayerSpeed(p) {
  return TANK_UPGRADES.speed[p.upgrades.speed];
}

export function getPlayerDamage(p) {
  return TANK_UPGRADES.damage[p.upgrades.damage];
}

function movePlayer(id, input) {
  const p = players[id];
  if (!p || !p.alive) return;

  const speed = getPlayerSpeed(p);
  let dx = 0, dz = 0;
  if (input.up)    dz -= 1;
  if (input.down)  dz += 1;
  if (input.left)  dx -= 1;
  if (input.right) dx += 1;

  if (dx !== 0 && dz !== 0) {
    dx *= 0.707;
    dz *= 0.707;
  }

  p.x += dx * speed;
  p.z += dz * speed;
  if (typeof input.angle === 'number') p.angle = input.angle;

  const half = MAP_SIZE / 2;
  const r = getPlayerRadius(p);
  p.x = Math.max(-half + r, Math.min(half - r, p.x));
  p.z = Math.max(-half + r, Math.min(half - r, p.z));

  if (p.shootCooldown > 0) p.shootCooldown--;
}

function shootBullet(id) {
  const p = players[id];
  if (!p || !p.alive) return null;
  if (p.shootCooldown > 0) return null;

  p.shootCooldown = SHOOT_COOLDOWN;
  const bid = bulletIdCounter++;
  const r = getPlayerRadius(p);
  bullets[bid] = {
    id: bid,
    ownerId: id,
    x: p.x + Math.sin(p.angle) * (r + 10),
    z: p.z - Math.cos(p.angle) * (r + 10),
    vx: Math.sin(p.angle) * BULLET_SPEED,
    vz: -Math.cos(p.angle) * BULLET_SPEED,
    damage: getPlayerDamage(p),
    life: BULLET_LIFETIME,
  };
  return bullets[bid];
}

function applyUpgrade(id, type) {
  const p = players[id];
  if (!p || !TANK_UPGRADES[type]) return false;
  if (p.upgradePoints <= 0) return false;
  if (p.upgrades[type] >= TANK_UPGRADES[type].length - 1) return false;
  p.upgrades[type]++;
  p.upgradePoints--;
  if (type === 'size') {
    p.maxHp = 100 * TANK_UPGRADES.size[p.upgrades.size];
    p.hp = p.maxHp;
  }
  return true;
}

function checkFoodCollisions() {
  for (const pid in players) {
    const p = players[pid];
    if (!p.alive) continue;
    const r = getPlayerRadius(p);
    for (const fid in food) {
      const f = food[fid];
      const dx = p.x - f.x;
      const dz = p.z - f.z;
      if (dx * dx + dz * dz < r * r) {
        p.score += f.value;
        const newLevel = Math.floor(p.score / 40) + 1;
        if (newLevel > p.level) {
          p.upgradePoints += newLevel - p.level;
          p.level = newLevel;
        }
        delete food[fid];
        spawnFood();
      }
    }
  }
}

function updateBullets() {
  const deadPlayers = [];
  const newBullets = [];
  for (const bid in bullets) {
    const b = bullets[bid];
    b.x += b.vx;
    b.z += b.vz;
    b.life--;

    const half = MAP_SIZE / 2;
    if (b.life <= 0 || Math.abs(b.x) > half || Math.abs(b.z) > half) {
      delete bullets[bid];
      continue;
    }

    let hit = false;
    for (const pid in players) {
      if (pid === b.ownerId) continue;
      const p = players[pid];
      if (!p.alive) continue;
      const r = getPlayerRadius(p);
      const dx = b.x - p.x;
      const dz = b.z - p.z;
      if (dx * dx + dz * dz < r * r) {
        p.hp -= b.damage;
        if (p.hp <= 0) {
          p.hp = 0;
          p.alive = false;
          const shooter = players[b.ownerId];
          if (shooter) {
            shooter.score += Math.floor(p.score * 0.3);
          }
          deadPlayers.push(pid);
        }
        delete bullets[bid];
        hit = true;
        break;
      }
    }
    if (!hit) newBullets.push(b);
  }
  return deadPlayers;
}

export function playerDied(id) {
  const p = players[id];
  if (!p) return;
  p.alive = false;
  p.hp = 0;
}

export function respawnPlayer(id) {
  const p = players[id];
  if (!p) return;
  p.x = randRange(-400, 400);
  p.z = randRange(-400, 400);
  p.hp = p.maxHp;
  p.alive = true;
  p.score = Math.floor(p.score * 0.5);
}

function getLeaderboard() {
  return Object.values(players)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(p => ({ nickname: p.nickname, score: p.score, level: p.level }));
}

function getGameState() {
  return {
    players: Object.values(players).map(p => ({
      id: p.id,
      nickname: p.nickname,
      x: p.x,
      z: p.z,
      angle: p.angle,
      score: p.score,
      level: p.level,
      upgrades: { ...p.upgrades },
      upgradePoints: p.upgradePoints,
      radius: getPlayerRadius(p),
      hp: p.hp,
      maxHp: p.maxHp,
      alive: p.alive,
      speed: getPlayerSpeed(p),
      damage: getPlayerDamage(p),
    })),
    food: Object.values(food),
    bullets: Object.values(bullets),
  };
}

export {
  initFood,
  addPlayer,
  removePlayer,
  movePlayer,
  shootBullet,
  applyUpgrade,
  checkFoodCollisions,
  updateBullets,
  getLeaderboard,
  getGameState,
  MAP_SIZE,
};
