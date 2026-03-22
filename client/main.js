import * as THREE from 'three';

const MAP_SIZE = 3000;

let scene, camera, renderer;
let playerTank, otherTanks = {}, bullets = {}, foodMeshes = {};
let currentPlayerId = null;
let currentRoomCode = null;
let gameState = 'menu';

const keys = { up: false, down: false, left: false, right: false };
let mouseAngle = 0;

const canvasContainer = document.getElementById('canvas-container');
const loginScreen = document.getElementById('login-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const gameUI = document.getElementById('game-ui');
const deathOverlay = document.getElementById('death-overlay');

const nicknameInput = document.getElementById('nickname-input');
const roomCodeInput = document.getElementById('room-code-input');
const createBtn = document.getElementById('create-btn');
const joinBtn = document.getElementById('join-btn');
const playBotBtn = document.getElementById('play-bot-btn');
const exitGameBtn = document.getElementById('exit-game-btn');
const errorMsg = document.getElementById('error-msg');
const displayRoomCode = document.getElementById('display-room-code');
const copyCodeBtn = document.getElementById('copy-code-btn');
const playersList = document.getElementById('players-list');
const readyBtn = document.getElementById('ready-btn');
const leaveBtn = document.getElementById('leave-btn');
const waitingMsg = document.getElementById('waiting-msg');
const tankPreview = document.getElementById('tank-preview');

let isReady = false;
let socket;
let isBotMode = false;
let localGameState = null;

let currentDifficulty = 'medium';
let selectedTankType = 'basic';
let agarkiCurrency = parseInt(localStorage.getItem('agarki') || '0');
let hardcoreMode = false;
let hardcoreDeathTime = 0;

const TANK_CATALOG = {
  basic: { name: 'BASIC', price: 0, color: 0x00ff88, desc: 'Стандартный танк' },
  fast: { name: 'SPEED', price: 100, color: 0x00ffff, desc: 'Быстрый, но слабый' },
  heavy: { name: 'HEAVY', price: 150, color: 0xff6b35, desc: 'Медленный, но живучий' },
  code: { name: 'CODE', price: 500, color: 0xff00ff, desc: 'Максимальная мощь' }
};

initThree();
setupEventListeners();
requestAnimationFrame(animate);

function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0f);
  scene.fog = new THREE.Fog(0x0a0a0f, 500, 2000);

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 3000);
  camera.position.set(0, 400, 400);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  canvasContainer.appendChild(renderer.domElement);

  const ambient = new THREE.AmbientLight(0x203040, 0.8);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0x00ff88, 0.6);
  dirLight.position.set(100, 200, 100);
  scene.add(dirLight);

  createGrid();
  createLights();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function createGrid() {
  const size = MAP_SIZE;
  const divisions = 30;
  
  const gridHelper = new THREE.GridHelper(size, divisions, 0x1a1a2e, 0x111122);
  scene.add(gridHelper);

  const borderGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(size, size));
  const borderMat = new THREE.LineBasicMaterial({ color: 0x00ff88, opacity: 0.3, transparent: true });
  const border = new THREE.LineSegments(borderGeo, borderMat);
  border.rotation.x = -Math.PI / 2;
  border.position.y = 1;
  scene.add(border);
}

function createLights() {
  const pointLight = new THREE.PointLight(0x00ff88, 0.3, 800);
  pointLight.position.set(0, 200, 0);
  scene.add(pointLight);
}

function createTank(color = 0x00ff88, tankType = 'basic') {
  const group = new THREE.Group();
  group.userData.tankType = tankType;
  group.userData.turretGroup = new THREE.Group();

  let bodyScale = 1;
  let bodyDepth = 40;
  
  if (tankType === 'heavy') bodyScale = 1.4;
  else if (tankType === 'fast') bodyScale = 0.75;
  else if (tankType === 'code') { bodyScale = 1.2; bodyDepth = 45; }

  let bodyColor = color;
  let bodyEmissive = color;
  let bodyEmissiveIntensity = 0.1;
  let bodyShininess = 80;
  
  if (tankType === 'code') {
    bodyColor = 0x00ffff;
    bodyEmissive = 0x00ffff;
    bodyEmissiveIntensity = 0.4;
    bodyShininess = 100;
  }

  const bodyGeo = new THREE.BoxGeometry(30 * bodyScale, 12 * bodyScale, bodyDepth * bodyScale);
  const bodyMat = new THREE.MeshPhongMaterial({ 
    color: bodyColor, 
    shininess: bodyShininess,
    emissive: bodyEmissive,
    emissiveIntensity: bodyEmissiveIntensity
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 8 * bodyScale;
  group.add(body);

  const turretSize = 8 * bodyScale;
  const turretGeo = new THREE.CylinderGeometry(turretSize * 0.8, turretSize, turretSize * 0.8, 8);
  let turretColor = 0x00d4ff;
  let turretEmissive = 0x00d4ff;
  if (tankType === 'heavy') { turretColor = 0xff6b35; turretEmissive = 0xff6b35; }
  else if (tankType === 'fast') { turretColor = 0x00ff88; turretEmissive = 0x00ff88; }
  else if (tankType === 'code') { turretColor = 0xffdd00; turretEmissive = 0xffdd00; }
  
  const turretMat = new THREE.MeshPhongMaterial({ 
    color: turretColor, 
    emissive: turretEmissive,
    shininess: 100,
    emissiveIntensity: 0.3
  });
  const turret = new THREE.Mesh(turretGeo, turretMat);
  turret.position.y = 16 * bodyScale;
  group.userData.turretGroup.add(turret);

  const barrelLength = 25 * bodyScale;
  const barrelGeo = new THREE.BoxGeometry(3 * bodyScale * 0.7, 3 * bodyScale * 0.7, barrelLength);
  let barrelColor = 0xffdd00;
  let barrelEmissive = 0xffdd00;
  if (tankType === 'heavy') { barrelColor = 0xff3333; barrelEmissive = 0xff3333; }
  else if (tankType === 'fast') { barrelColor = 0x00ffff; barrelEmissive = 0x00ffff; }
  else if (tankType === 'code') { barrelColor = 0xff00ff; barrelEmissive = 0xff00ff; }
  
  const barrelMat = new THREE.MeshPhongMaterial({ 
    color: barrelColor, 
    emissive: barrelEmissive,
    shininess: 100,
    emissiveIntensity: 0.5
  });
  const barrel = new THREE.Mesh(barrelGeo, barrelMat);
  barrel.position.set(0, 16 * bodyScale, -barrelLength / 2 - 3);
  group.userData.turretGroup.add(barrel);

  group.add(group.userData.turretGroup);

  const trackGeo = new THREE.BoxGeometry(6 * bodyScale, 8 * bodyScale, bodyDepth * bodyScale + 4);
  const trackMat = new THREE.MeshPhongMaterial({ 
    color: 0x222233,
    emissive: 0x111122,
    emissiveIntensity: 0.3
  });
  
  const leftTrack = new THREE.Mesh(trackGeo, trackMat);
  leftTrack.position.set(-18 * bodyScale, 4 * bodyScale, 0);
  group.add(leftTrack);

  const rightTrack = new THREE.Mesh(trackGeo, trackMat);
  rightTrack.position.set(18 * bodyScale, 4 * bodyScale, 0);
  group.add(rightTrack);

  return group;
}

function initLobbyPreview() {
  tankPreview.innerHTML = '';
  const previewScene = new THREE.Scene();
  previewScene.background = new THREE.Color(0x050508);

  const previewCamera = new THREE.PerspectiveCamera(50, 380 / 140, 1, 1000);
  previewCamera.position.set(60, 50, 80);
  previewCamera.lookAt(0, 10, 0);

  const previewRenderer = new THREE.WebGLRenderer({ antialias: true });
  previewRenderer.setSize(380, 140);
  tankPreview.appendChild(previewRenderer.domElement);

  const ambLight = new THREE.AmbientLight(0x203040, 0.8);
  previewScene.add(ambLight);
  
  const dirLight = new THREE.DirectionalLight(0x00ff88, 1);
  dirLight.position.set(50, 100, 50);
  previewScene.add(dirLight);

  const tank = createTank(0x00ff88);
  previewScene.add(tank);

  function animatePreview() {
    requestAnimationFrame(animatePreview);
    tank.rotation.y += 0.01;
    previewRenderer.render(previewScene, previewCamera);
  }
  animatePreview();
}

function updateCamera(player) {
  if (!player) return;
  const targetX = player.x;
  const targetZ = player.z + 300;
  const targetY = 350;
  camera.position.lerp(new THREE.Vector3(targetX, targetY, targetZ), 0.08);
  camera.lookAt(player.x, 0, player.z);
}

function randRange(min, max) {
  return Math.random() * (max - min) + min;
}

function getPlayerRadius(p) {
  const sizes = [1, 1.2, 1.5, 1.9, 2.4];
  return 22 * sizes[p.upgrades.size];
}

function getPlayerSpeed(p) {
  const speeds = [3, 4, 5.5, 7, 9];
  let base = speeds[p.upgrades.speed];
  if (p.tankType === 'fast') base *= 1.4;
  if (p.tankType === 'heavy') base *= 0.6;
  return base;
}

function getPlayerDamage(p) {
  const damages = [8, 12, 18, 26, 38];
  let base = damages[p.upgrades.damage];
  if (p.tankType === 'heavy') base *= 1.5;
  if (p.tankType === 'fast') base *= 0.7;
  if (p.tankType === 'code') base *= 2;
  return Math.floor(base);
}

function getPlayerMaxHp(p) {
  let base = 100;
  if (p.tankType === 'heavy') base = 200;
  if (p.tankType === 'fast') base = 70;
  if (p.tankType === 'code') base = 150;
  if (p.upgrades.size > 0) {
    const sizes = [1, 1.2, 1.5, 1.9, 2.4];
    base *= sizes[p.upgrades.size];
  }
  return Math.floor(base);
}

const BOT_NAMES = ['R2D2', 'C3PO', 'HAL', 'JARVIS', 'WALL-E', 'EVE', 'T-800', 'DATA', 'BENDER', 'ROBBY', 'GERTY', 'SONNY'];
const BOT_NAMES_TANKS = ['Patton', 'Tiger', 'Sherman', 'Panther', 'T-34', 'IS-2', 'KV-1', 'PzIV', 'Comet', 'Cromwell', 'M4A3', 'Churchill', 'Matilda', 'Valentine', 'Crusader'];
const TANK_TYPES = ['basic', 'fast', 'heavy'];
const DIFFICULTIES = ['easy', 'medium', 'hard', 'hardcore'];

let currentGameMode = 'agar';

function startBotGame(nickname, difficulty = currentDifficulty) {
  isBotMode = true;
  hardcoreMode = difficulty === 'hardcore';
  loginScreen.classList.add('hidden');
  deathOverlay.classList.add('hidden');
  gameState = 'playing';
  
  document.getElementById('game-mode').textContent = currentGameMode === 'tanks' ? '[ TANKS ]' : '[ AGARIO ]';
  document.getElementById('wot-hud').style.display = currentGameMode === 'tanks' ? 'flex' : 'none';

  const mapSize = currentGameMode === 'tanks' ? 10000 : MAP_SIZE;
  const half = mapSize / 2;
  localGameState = {
    players: {},
    food: [],
    bullets: [],
    mapSize: mapSize,
    foodIdCounter: 0,
    bulletIdCounter: 0,
    countdown: currentGameMode === 'tanks' ? 15 : 0,
    battleStarted: false,
    captureZones: currentGameMode === 'tanks' ? [
      { x: -half * 0.5, z: 0, team: 'none', progress: 0 },
      { x: half * 0.5, z: 0, team: 'none', progress: 0 }
    ] : [],
    teamScores: { ally: 0, enemy: 0 }
  };

  for (let i = 0; i < 300; i++) {
    localGameState.food.push({
      id: localGameState.foodIdCounter++,
      x: randRange(-half + 100, half - 100),
      z: randRange(-half + 100, half - 100),
      value: Math.floor(randRange(1, 5))
    });
  }

  const spawnX = currentGameMode === 'tanks' ? -half + 500 : 0;
  const spawnZ = currentGameMode === 'tanks' ? 0 : 0;

  localGameState.players.player = {
    id: 'player',
    nickname: nickname,
    x: spawnX,
    z: spawnZ,
    angle: 0,
    score: 0,
    level: 1,
    upgrades: { speed: 0, size: 0, damage: 0 },
    upgradePoints: 0,
    hp: hardcoreMode ? 10 : (currentGameMode === 'tanks' ? 200 : 100),
    maxHp: hardcoreMode ? 10 : (currentGameMode === 'tanks' ? 200 : 100),
    alive: true,
    shootCooldown: 0,
    tankType: selectedTankType,
    team: currentGameMode === 'tanks' ? 'ally' : 'none',
    kills: 0,
    damageDealt: 0,
    damageTaken: 0
  };
  localGameState.players.player.maxHp = getPlayerMaxHp(localGameState.players.player);
  localGameState.players.player.hp = localGameState.players.player.maxHp;

  let botCount = currentGameMode === 'tanks' ? 50 : 5;
  let botSpeedMult = currentGameMode === 'tanks' ? 1 : 0.6;
  let botDamageMult = currentGameMode === 'tanks' ? 1 : 0.8;
  let botHpMult = currentGameMode === 'tanks' ? 1 : 1;
  
  if (difficulty === 'easy') { botSpeedMult *= 0.7; botDamageMult *= 0.6; botHpMult *= 0.8; }
  else if (difficulty === 'hard') { botSpeedMult *= 1.2; botDamageMult *= 1.3; botHpMult *= 1.3; }
  else if (difficulty === 'hardcore') { botSpeedMult *= 1.4; botDamageMult *= 1.5; botHpMult *= 1.5; }

  const namesArray = currentGameMode === 'tanks' ? BOT_NAMES_TANKS : BOT_NAMES;
  const teamSize = Math.floor(botCount / 2);
  
  for (let i = 0; i < botCount; i++) {
    const botId = 'bot' + i;
    const botType = TANK_TYPES[Math.floor(Math.random() * TANK_TYPES.length)];
    const team = currentGameMode === 'tanks' ? (i < teamSize ? 'ally' : 'enemy') : 'none';
    
    let botX, botZ;
    if (currentGameMode === 'tanks') {
      if (team === 'ally') {
        botX = randRange(-half + 300, -half + 2000);
        botZ = randRange(-half + 300, half - 300);
      } else {
        botX = randRange(half - 2000, half - 300);
        botZ = randRange(-half + 300, half - 300);
      }
    } else {
      botX = randRange(-half + 100, half - 100);
      botZ = randRange(-half + 100, half - 100);
    }
    
    localGameState.players[botId] = {
      id: botId,
      nickname: namesArray[i % namesArray.length],
      x: botX,
      z: botZ,
      angle: team === 'ally' ? 0 : Math.PI,
      score: 0,
      level: 1,
      upgrades: { speed: 0, size: 0, damage: 0 },
      upgradePoints: 0,
      hp: Math.floor((currentGameMode === 'tanks' ? 200 : 100) * botHpMult),
      maxHp: Math.floor((currentGameMode === 'tanks' ? 200 : 100) * botHpMult),
      alive: true,
      shootCooldown: 0,
      targetX: 0,
      targetZ: 0,
      aiState: 'wander',
      tankType: botType,
      team: team,
      speedMult: botSpeedMult,
      damageMult: botDamageMult
    };
  }

  if (currentGameMode === 'tanks') {
    showCountdown();
  } else {
    localGameState.countdown = 0;
    localGameState.battleStarted = true;
    gameUI.classList.remove('hidden');
  }

  localGameState.codeTankSpawnTime = Date.now();
  localGameState.codeTankActive = false;
  localGameState.codeTankLoading = false;

  const tankColor = TANK_CATALOG[selectedTankType]?.color || 0x00ff88;
  playerTank = createTank(tankColor, selectedTankType);
  scene.add(playerTank);
}

function showCountdown() {
  const countdownOverlay = document.createElement('div');
  countdownOverlay.id = 'countdown-overlay';
  countdownOverlay.style.cssText = `
    position: fixed; inset: 0; z-index: 200;
    background: rgba(10,10,20,0.95);
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    font-family: 'Fira Code', monospace;
  `;
  
  const title = document.createElement('div');
  title.style.cssText = 'font-size: 24px; color: #00ff88; margin-bottom: 40px; letter-spacing: 4px;';
  title.textContent = '// PREPARE FOR BATTLE //';
  countdownOverlay.appendChild(title);
  
  const timer = document.createElement('div');
  timer.id = 'countdown-timer';
  timer.style.cssText = 'font-size: 120px; color: #ffdd00; font-weight: bold; text-shadow: 0 0 30px #ffdd00;';
  timer.textContent = '15';
  countdownOverlay.appendChild(timer);
  
  const info = document.createElement('div');
  info.style.cssText = 'font-size: 14px; color: #667; margin-top: 30px;';
  info.textContent = 'Capture zones will spawn after battle starts';
  countdownOverlay.appendChild(info);
  
  document.body.appendChild(countdownOverlay);
  
  let count = 15;
  const interval = setInterval(() => {
    count--;
    timer.textContent = count;
    if (count <= 5) {
      timer.style.color = '#ff4444';
    }
    if (count <= 0) {
      clearInterval(interval);
      countdownOverlay.remove();
      localGameState.battleStarted = true;
      gameUI.classList.remove('hidden');
    }
  }, 1000);
}

function spawnCodeTank() {
  const half = MAP_SIZE / 2;
  const botId = 'codeTank';
  const player = localGameState.players.player;
  
  let spawnX = randRange(-half + 200, half - 200);
  let spawnZ = randRange(-half + 200, half - 200);
  
  if (player && player.alive) {
    const dx = player.x - spawnX;
    const dz = player.z - spawnZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 300) {
      spawnX = player.x + (dx > 0 ? 400 : -400);
      spawnZ = player.z + (dz > 0 ? 400 : -400);
    }
  }
  
  localGameState.players[botId] = {
    id: botId,
    nickname: 'CODE_TANK',
    x: spawnX,
    z: spawnZ,
    angle: 0,
    score: 500,
    level: 10,
    upgrades: { speed: 4, size: 4, damage: 4 },
    upgradePoints: 0,
    hp: 400,
    maxHp: 400,
    alive: true,
    shootCooldown: 0,
    targetX: 0,
    targetZ: 0,
    aiState: 'chase',
    tankType: 'code',
    speedMult: 1.5,
    damageMult: 2.5,
    isCodeTank: true,
    loadingPhase: true
  };
  
  if (otherTanks[botId]) {
    scene.remove(otherTanks[botId]);
    delete otherTanks[botId];
  }
  
  const dmg = Math.floor(localGameState.players.player.score * 0.2);
  localGameState.players.player.hp -= dmg;
  if (localGameState.players.player.hp <= 0) {
    localGameState.players.player.hp = 0;
    localGameState.players.player.alive = false;
    if (hardcoreMode) {
      showHardcoreDeath();
    } else {
      showDeathOverlay();
    }
  }
  
  localGameState.codeTankActive = true;
}

function updateLocalBotAI() {
  if (!localGameState || !localGameState.battleStarted) return;
  
  const half = MAP_SIZE / 2;
  
  for (const id in localGameState.players) {
    if (id === 'player') continue;
    
    const bot = localGameState.players[id];
    if (!bot.alive) continue;

    if (Math.random() < 0.02) {
      bot.aiState = Math.random() < 0.3 ? 'chase' : 'wander';
      bot.targetX = randRange(-half + 200, half - 200);
      bot.targetZ = randRange(-half + 200, half - 200);
    }

    const player = localGameState.players.player;
    if (player.alive && bot.score < player.score + 20) {
      const dx = player.x - bot.x;
      const dz = player.z - bot.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < 400) {
        bot.aiState = 'chase';
        bot.targetX = player.x;
        bot.targetZ = player.z;
      }
    }

    let dx = 0, dz = 0;
    if (bot.aiState === 'chase') {
      dx = bot.targetX - bot.x;
      dz = bot.targetZ - bot.z;
    } else {
      dx = bot.targetX - bot.x;
      dz = bot.targetZ - bot.z;
    }

    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > 20) {
      bot.angle = Math.atan2(dx, -dz);
      
      const speed = getPlayerSpeed(bot);
      const mult = bot.speedMult || 0.6;
      bot.x += (dx / dist) * speed * mult;
      bot.z += (dz / dist) * speed * mult;
    }

    bot.x = Math.max(-half + 30, Math.min(half - 30, bot.x));
    bot.z = Math.max(-half + 30, Math.min(half - 30, bot.z));

    if (bot.shootCooldown > 0) bot.shootCooldown--;
    
    if (bot.shootCooldown === 0 && dist < 300) {
      bot.shootCooldown = 25;
      const bulletId = localGameState.bulletIdCounter++;
      const r = getPlayerRadius(bot);
      const mult = bot.damageMult || 1;
      localGameState.bullets.push({
        id: bulletId,
        ownerId: bot.id,
        x: bot.x + Math.sin(bot.angle) * (r + 10),
        z: bot.z - Math.cos(bot.angle) * (r + 10),
        vx: Math.sin(bot.angle) * 18,
        vz: -Math.cos(bot.angle) * 18,
        damage: Math.floor(getPlayerDamage(bot) * mult),
        life: 80
      });
    }
  }
}

function updateLocalGame() {
  if (!localGameState || gameState !== 'playing') return;

  const player = localGameState.players.player;
  const canMove = localGameState.battleStarted || currentGameMode !== 'tanks';
  
  if (player && player.alive && canMove) {
    let dx = 0, dz = 0;
    if (keys.up) dz -= 1;
    if (keys.down) dz += 1;
    if (keys.left) dx -= 1;
    if (keys.right) dx += 1;

    if (dx !== 0 && dz !== 0) {
      dx *= 0.707;
      dz *= 0.707;
    }

    player.x += dx * getPlayerSpeed(player);
    player.z += dz * getPlayerSpeed(player);
    player.angle = mouseAngle;

    const half = localGameState.mapSize / 2;
    const r = getPlayerRadius(player);
    player.x = Math.max(-half + r, Math.min(half - r, player.x));
    player.z = Math.max(-half + r, Math.min(half - r, player.z));
  }

  if (player && player.shootCooldown > 0) player.shootCooldown--;

  updateLocalBotAI();

  const half = localGameState.mapSize / 2;
  localGameState.bullets = localGameState.bullets.filter(b => {
    b.x += b.vx;
    b.z += b.vz;
    b.life--;

    if (b.life <= 0 || Math.abs(b.x) > half || Math.abs(b.z) > half) {
      return false;
    }

    for (const pid in localGameState.players) {
      const p = localGameState.players[pid];
      if (pid === b.ownerId || !p.alive) continue;
      
      if (currentGameMode === 'tanks') {
        const shooter = localGameState.players[b.ownerId];
        if (shooter && p.team === shooter.team) continue;
      }
      
      const dx = b.x - p.x;
      const dz = b.z - p.z;
      const r = getPlayerRadius(p);
      if (dx * dx + dz * dz < r * r) {
        p.hp -= b.damage;
        
        if (p.id === 'player') {
          p.damageTaken = (p.damageTaken || 0) + b.damage;
          showHitIndicator(b);
        }
        if (b.ownerId === 'player') {
          player.damageDealt = (player.damageDealt || 0) + b.damage;
        }
        
        if (p.hp <= 0) {
          p.hp = 0;
          p.alive = false;
          const shooter = localGameState.players[b.ownerId];
          if (shooter) {
            shooter.score += Math.floor(p.score * 0.3);
            shooter.kills = (shooter.kills || 0) + 1;
            if (pid !== 'player') {
              const reward = Math.floor(p.score * 0.1);
              agarkiCurrency += reward;
              localStorage.setItem('agarki', agarkiCurrency);
            }
          }
          if (pid === 'player') {
            if (hardcoreMode) {
              hardcoreDeathTime = Date.now();
              agarkiCurrency += Math.floor(localGameState.players.player.score * 0.1);
              localStorage.setItem('agarki', agarkiCurrency);
              showHardcoreDeath();
            } else {
              showDeathOverlay();
              setTimeout(() => {
                respawnLocalPlayer();
              }, 3000);
            }
          }
        }
        return false;
      }
    }
    return true;
  });

  for (const pid in localGameState.players) {
    const p = localGameState.players[pid];
    if (!p.alive) continue;
    
    const r = getPlayerRadius(p);
    localGameState.food = localGameState.food.filter(f => {
      const dx = p.x - f.x;
      const dz = p.z - f.z;
      if (dx * dx + dz * dz < r * r) {
        p.score += f.value;
        const newLevel = Math.floor(p.score / 40) + 1;
        if (newLevel > p.level) {
          p.upgradePoints += newLevel - p.level;
          p.level = newLevel;
        }
        const newFood = {
          id: localGameState.foodIdCounter++,
          x: randRange(-half + 100, half - 100),
          z: randRange(-half + 100, half - 100),
          value: Math.floor(randRange(1, 5))
        };
        localGameState.food.push(newFood);
        return false;
      }
      return true;
    });
  }

  while (localGameState.food.length < 300) {
    localGameState.food.push({
      id: localGameState.foodIdCounter++,
      x: randRange(-half + 100, half - 100),
      z: randRange(-half + 100, half - 100),
      value: Math.floor(randRange(1, 5))
    });
  }

  renderLocalGameState();
}

function respawnLocalPlayer() {
  if (!localGameState) return;
  const player = localGameState.players.player;
  if (!player) return;
  player.x = randRange(-400, 400);
  player.z = randRange(-400, 400);
  player.hp = player.maxHp;
  player.alive = true;
  player.score = Math.floor(player.score * 0.5);
  hideDeathOverlay();
}

function renderLocalGameState() {
  const player = localGameState.players.player;
  updateCamera(player);
  updateStats(localGameState);
  updateWoTHUD();

  if (playerTank) {
    playerTank.position.set(player.x, 0, player.z);
    playerTank.rotation.y = -player.angle + Math.PI / 2;
    if (playerTank.userData.turretGroup) {
      playerTank.userData.turretGroup.rotation.y = 0;
    }
    playerTank.visible = player.alive;
  }

  for (const id in localGameState.players) {
    if (id === 'player') continue;
    const p = localGameState.players[id];
    
    if (!otherTanks[id]) {
      let tankColor = 0xff6b35;
      if (currentGameMode === 'tanks') {
        tankColor = p.team === 'ally' ? 0x4488ff : 0xff4444;
      }
      otherTanks[id] = createTank(tankColor, p.tankType || 'basic');
      scene.add(otherTanks[id]);
    }
    otherTanks[id].position.set(p.x, 0, p.z);
    otherTanks[id].rotation.y = -p.angle + Math.PI / 2;
    if (otherTanks[id].userData.turretGroup) {
      otherTanks[id].userData.turretGroup.rotation.y = 0;
    }
    otherTanks[id].visible = p.alive;
  }

  for (const id in otherTanks) {
    if (!localGameState.players[id]) {
      scene.remove(otherTanks[id]);
      delete otherTanks[id];
    }
  }

  if (currentGameMode === 'tanks' && localGameState.battleStarted) {
    renderCaptureZones();
  }

  const foodGeo = new THREE.BoxGeometry(8, 8, 8);
  const foodColors = [0x00ff88, 0xffdd00, 0xff6b35, 0x00d4ff, 0xff44ff];
  const foodMap = new Map();

  localGameState.food.forEach(f => {
    foodMap.set(f.id, f);
    if (!foodMeshes[f.id]) {
      const mat = new THREE.MeshPhongMaterial({
        color: foodColors[Math.floor(Math.random() * foodColors.length)],
        emissive: 0x222200,
        emissiveIntensity: 0.5
      });
      foodMeshes[f.id] = new THREE.Mesh(foodGeo, mat);
      scene.add(foodMeshes[f.id]);
    }
    foodMeshes[f.id].position.set(f.x, 4 + Math.sin(Date.now() / 200 + f.id) * 2, f.z);
  });

  for (const id in foodMeshes) {
    if (!foodMap.has(parseInt(id))) {
      scene.remove(foodMeshes[id]);
      delete foodMeshes[id];
    }
  }

  const bulletGeo = new THREE.SphereGeometry(4, 8, 8);
  const bulletMat = new THREE.MeshPhongMaterial({
    color: 0xffdd00,
    emissive: 0xffdd00,
    emissiveIntensity: 0.8
  });
  const bulletSet = new Set(localGameState.bullets.map(b => b.id));

  localGameState.bullets.forEach(b => {
    if (!bullets[b.id]) {
      bullets[b.id] = new THREE.Mesh(bulletGeo, bulletMat);
      scene.add(bullets[b.id]);
    }
    bullets[b.id].position.set(b.x, 10, b.z);
  });

  for (const id in bullets) {
    if (!bulletSet.has(parseInt(id))) {
      scene.remove(bullets[id]);
      delete bullets[id];
    }
  }

  const leaderboard = Object.values(localGameState.players)
    .filter(p => p.alive || p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(p => ({ nickname: p.nickname, score: p.score }));
  updateLeaderboard(leaderboard);
}

function handleLocalUpgrade(type) {
  if (!localGameState) return;
  const player = localGameState.players.player;
  if (!player) return;
  
  const TANK_UPGRADES = {
    speed: [5, 6.5, 8, 10, 13],
    size: [1, 1.2, 1.5, 1.9, 2.4],
    damage: [10, 15, 22, 32, 45],
  };

  if (player.upgradePoints <= 0) return;
  if (player.upgrades[type] >= TANK_UPGRADES[type].length - 1) return;
  
  player.upgrades[type]++;
  player.upgradePoints--;
  
  if (type === 'size') {
    player.maxHp = 100 * TANK_UPGRADES.size[player.upgrades.size];
    player.hp = player.maxHp;
  }
}

function localShoot() {
  if (!localGameState) return;
  const player = localGameState.players.player;
  if (!player || !player.alive) return;
  if (player.shootCooldown > 0) return;

  player.shootCooldown = 20;
  const bulletId = localGameState.bulletIdCounter++;
  const r = getPlayerRadius(player);
  localGameState.bullets.push({
    id: bulletId,
    ownerId: 'player',
    x: player.x + Math.sin(player.angle) * (r + 10),
    z: player.z - Math.cos(player.angle) * (r + 10),
    vx: Math.sin(player.angle) * 18,
    vz: -Math.cos(player.angle) * 18,
    damage: getPlayerDamage(player),
    life: 80
  });
}

function setupEventListeners() {
  socket = io();
  
  updateCurrencyDisplay();

  document.querySelectorAll('.tank-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const tank = btn.dataset.tank;
      const price = TANK_CATALOG[tank]?.price || 0;
      if (tank === 'basic' || agarkiCurrency >= price || tank === selectedTankType) {
        document.querySelectorAll('.tank-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedTankType = tank;
      } else {
        showError('NOT ENOUGH AGARKI!');
      }
    });
  });

  document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      currentDifficulty = btn.dataset.diff;
    });
  });

  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      currentGameMode = btn.dataset.mode;
    });
  });

  createBtn.addEventListener('click', () => {
    const nickname = nicknameInput.value.trim() || 'Tank' + Math.floor(Math.random() * 999);
    socket.emit('createRoom', nickname);
  });

  joinBtn.addEventListener('click', () => {
    const nickname = nicknameInput.value.trim() || 'Tank' + Math.floor(Math.random() * 999);
    const code = roomCodeInput.value.trim().toUpperCase();
    if (!code || code.length !== 4) {
      showError('ENTER 4-CHAR CODE');
      return;
    }
    socket.emit('joinRoom', { code, nickname });
  });

  nicknameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const code = roomCodeInput.value.trim().toUpperCase();
      if (code.length === 4) {
        const nickname = nicknameInput.value.trim() || 'Tank' + Math.floor(Math.random() * 999);
        socket.emit('joinRoom', { code, nickname });
      } else {
        socket.emit('createRoom', nicknameInput.value.trim() || 'Tank' + Math.floor(Math.random() * 999));
      }
    }
  });

  roomCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinBtn.click();
  });

  playBotBtn.addEventListener('click', () => {
    const nickname = nicknameInput.value.trim() || 'Tank';
    startBotGame(nickname);
  });

  exitGameBtn.addEventListener('click', () => {
    exitToMenu();
  });

  copyCodeBtn.addEventListener('click', () => {
    if (currentRoomCode) {
      navigator.clipboard.writeText(currentRoomCode);
      copyCodeBtn.textContent = '[ COPIED ]';
      setTimeout(() => copyCodeBtn.textContent = '[ COPY ]', 1500);
    }
  });

  readyBtn.addEventListener('click', () => {
    socket.emit('toggleReady');
  });

  leaveBtn.addEventListener('click', () => {
    socket.emit('leaveRoom');
    leaveLobby();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'u' || e.key === 'U' || e.key === 'р' || e.key === 'Р') {
      if (gameState === 'playing') toggleUpgrades();
    }
    if (gameState !== 'playing') return;
    if (e.key === 'w' || e.key === 'W' || e.key === 'ц' || e.key === 'Ц') keys.up = true;
    if (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы') keys.down = true;
    if (e.key === 'a' || e.key === 'A' || e.key === 'ф' || e.key === 'Ф') keys.left = true;
    if (e.key === 'd' || e.key === 'D' || e.key === 'в' || e.key === 'В') keys.right = true;
    if (e.code === 'Space') { 
      if (isBotMode) localShoot(); 
      else socket.emit('shoot'); 
      e.preventDefault(); 
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.key === 'w' || e.key === 'W' || e.key === 'ц' || e.key === 'Ц') keys.up = false;
    if (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы') keys.down = false;
    if (e.key === 'a' || e.key === 'A' || e.key === 'ф' || e.key === 'Ф') keys.left = false;
    if (e.key === 'd' || e.key === 'D' || e.key === 'в' || e.key === 'В') keys.right = false;
  });

  document.addEventListener('mousemove', (e) => {
    if (gameState !== 'playing') return;
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    mouseAngle = Math.atan2(e.clientX - centerX, centerY - e.clientY);
  });

  document.addEventListener('click', (e) => {
    if (gameState === 'playing' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') {
      if (isBotMode) localShoot();
      else socket.emit('shoot');
    }
  });

  document.querySelectorAll('.upg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (isBotMode) handleLocalUpgrade(btn.dataset.type);
      else socket.emit('upgrade', btn.dataset.type);
    });
  });

  setupSocketListeners();
}

function setupSocketListeners() {
  socket.on('roomCreated', enterLobby);
  socket.on('roomJoined', enterLobby);
  socket.on('roomError', showError);
  socket.on('roomUpdate', updateLobbyUI);

  socket.on('playerLeft', () => {
    waitingMsg.textContent = '// player disconnected... //';
  });

  socket.on('gameStart', () => {
    lobbyScreen.classList.add('hidden');
    gameUI.classList.remove('hidden');
    deathOverlay.classList.add('hidden');
    gameState = 'playing';
  });

  socket.on('joined', (data) => {
    currentPlayerId = data.id;
  });

  socket.on('state', renderGameState);
  socket.on('leaderboard', updateLeaderboard);
  socket.on('playerDied', showDeathOverlay);
  socket.on('respawn', hideDeathOverlay);
}

function exitToMenu() {
  isBotMode = false;
  localGameState = null;
  gameState = 'menu';
  gameUI.classList.add('hidden');
  deathOverlay.classList.add('hidden');
  loginScreen.classList.remove('hidden');
  
  Object.keys(otherTanks).forEach(id => {
    scene.remove(otherTanks[id]);
    delete otherTanks[id];
  });
  Object.keys(bullets).forEach(id => {
    scene.remove(bullets[id]);
    delete bullets[id];
  });
  Object.keys(foodMeshes).forEach(id => {
    scene.remove(foodMeshes[id]);
    delete foodMeshes[id];
  });
  
  if (playerTank) {
    scene.remove(playerTank);
    playerTank = null;
  }
}

function showError(msg) {
  errorMsg.textContent = '! ' + msg;
  errorMsg.classList.remove('hidden');
  setTimeout(() => errorMsg.classList.add('hidden'), 3000);
}

function enterLobby(roomState) {
  currentRoomCode = roomState.code;
  loginScreen.classList.add('hidden');
  lobbyScreen.classList.remove('hidden');
  gameState = 'lobby';
  isReady = false;
  updateLobbyUI(roomState);
  initLobbyPreview();
}

function leaveLobby() {
  lobbyScreen.classList.add('hidden');
  loginScreen.classList.remove('hidden');
  gameState = 'menu';
  currentRoomCode = null;
  isReady = false;
}

function updateLobbyUI(roomState) {
  displayRoomCode.textContent = roomState.code;

  playersList.innerHTML = roomState.players.map(p => {
    const isHost = p.id === roomState.hostId;
    const isMe = p.id === currentPlayerId;
    const readyClass = p.ready ? 'status-ready' : 'status-not-ready';
    const readyText = p.ready ? '[READY]' : '[WAIT]';
    return `
      <div class="player-item ${isMe ? 'is-me' : ''}">
        <div class="player-name">
          ${p.nickname}${isMe ? ' (you)' : ''}
          ${isHost ? '<span class="player-host">HOST</span>' : ''}
        </div>
        <span class="player-status ${readyClass}">${readyText}</span>
      </div>
    `;
  }).join('');

  const allReady = roomState.players.length > 0 && roomState.players.every(p => p.ready);
  
  if (allReady) {
    waitingMsg.textContent = '// ALL READY - STARTING //';
  } else if (roomState.players.length === 1) {
    waitingMsg.textContent = '// waiting for opponent... //';
  } else {
    waitingMsg.textContent = '// waiting for players... //';
  }

  if (isReady) {
    readyBtn.classList.add('is-ready');
    readyBtn.textContent = '[ WAIT ]';
  } else {
    readyBtn.classList.remove('is-ready');
    readyBtn.textContent = '[ READY ]';
  }
}

function toggleUpgrades() {
  const upgradesPanel = document.getElementById('upgrades');
  upgradesPanel.classList.toggle('hidden');
}

function updateCurrencyDisplay() {
  const balance = document.getElementById('agarki-balance');
  if (balance) balance.textContent = agarkiCurrency;
  
  const gameBalance = document.getElementById('game-agarki');
  if (gameBalance) gameBalance.textContent = agarkiCurrency;
}

function updateWoTHUD() {
  if (currentGameMode !== 'tanks') return;
  
  const player = localGameState?.players?.player;
  if (!player) return;
  
  document.getElementById('speed-value').textContent = Math.floor(getPlayerSpeed(player) * 10);
  
  const reloadProgress = document.getElementById('reload-progress');
  if (player.shootCooldown > 0) {
    const progress = ((20 - player.shootCooldown) / 20) * 100;
    reloadProgress.style.width = progress + '%';
  } else {
    reloadProgress.style.width = '100%';
  }
  
  document.getElementById('dmg-dealt-value').textContent = player.damageDealt || 0;
  document.getElementById('dmg-taken-value').textContent = player.damageTaken || 0;
  document.getElementById('kills-value').textContent = player.kills || 0;
  
  updateCaptureZones();
}

let captureZoneMeshes = [];

function renderCaptureZones() {
  captureZoneMeshes.forEach(m => scene.remove(m));
  captureZoneMeshes = [];
  
  if (!localGameState.captureZones) return;
  
  localGameState.captureZones.forEach((zone, i) => {
    const color = zone.team === 'ally' ? 0x4488ff : zone.team === 'enemy' ? 0xff4444 : 0xffff00;
    
    const circleGeo = new THREE.RingGeometry(80, 100, 32);
    const circleMat = new THREE.MeshBasicMaterial({ 
      color, 
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6
    });
    const circle = new THREE.Mesh(circleGeo, circleMat);
    circle.rotation.x = -Math.PI / 2;
    circle.position.set(zone.x, 2, zone.z);
    scene.add(circle);
    captureZoneMeshes.push(circle);
    
    const innerGeo = new THREE.CircleGeometry(60, 32);
    const innerMat = new THREE.MeshBasicMaterial({ 
      color, 
      transparent: true, 
      opacity: 0.3 
    });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    inner.rotation.x = -Math.PI / 2;
    inner.position.set(zone.x, 1, zone.z);
    scene.add(inner);
    captureZoneMeshes.push(inner);
    
    const progressGeo = new THREE.RingGeometry(0, 80 * (zone.progress / 100), 32);
    const progressMat = new THREE.MeshBasicMaterial({ 
      color: 0x00ff88, 
      side: THREE.DoubleSide,
      transparent: true, 
      opacity: 0.4 
    });
    const progress = new THREE.Mesh(progressGeo, progressMat);
    progress.rotation.x = -Math.PI / 2;
    progress.position.set(zone.x, 3, zone.z);
    scene.add(progress);
    captureZoneMeshes.push(progress);
  });
}

function updateCaptureZones() {
  if (!localGameState || !localGameState.battleStarted) return;
  
  localGameState.captureZones.forEach(zone => {
    let allyCount = 0;
    let enemyCount = 0;
    const range = 120;
    
    for (const id in localGameState.players) {
      const p = localGameState.players[id];
      if (!p.alive) continue;
      
      const dx = p.x - zone.x;
      const dz = p.z - zone.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      
      if (dist < range) {
        if (p.team === 'ally') allyCount++;
        if (p.team === 'enemy') enemyCount++;
      }
    }
    
    if (allyCount > enemyCount) {
      zone.progress = Math.min(100, zone.progress + 0.3);
      zone.team = 'ally';
    } else if (enemyCount > allyCount) {
      zone.progress = Math.min(100, zone.progress + 0.3);
      zone.team = 'enemy';
    } else {
      zone.progress = Math.max(0, zone.progress - 0.1);
      if (zone.progress === 0) zone.team = 'none';
    }
    
    if (zone.progress >= 100) {
      if (zone.team === 'ally') {
        localGameState.teamScores.ally += 1;
      } else {
        localGameState.teamScores.enemy += 1;
      }
      zone.progress = 0;
      zone.team = 'none';
    }
  });
  
  renderCaptureZones();
}

function showHitIndicator(bullet) {
  const indicator = document.getElementById('hit-indicator');
  if (!indicator) return;
  
  const player = localGameState.players.player;
  if (!player) return;
  
  const dx = bullet.x - player.x;
  const dz = bullet.z - player.z;
  
  const angle = Math.atan2(dx, -dz);
  const relAngle = angle - player.angle;
  
  indicator.classList.remove('hidden');
  indicator.classList.add('show');
  
  setTimeout(() => {
    indicator.classList.remove('show');
  }, 300);
}

function showHardcoreDeath() {
  deathOverlay.classList.remove('hidden');
  const deathText = document.querySelector('.death-text');
  deathText.textContent = '// FALLEN IN BATTLE //';
  const respawnText = document.querySelector('.respawn-text');
  respawnText.innerHTML = 'spectating...<br>+' + Math.floor(localGameState?.players?.player?.score * 0.1 || 0) + ' Agarki';
  
  let countdown = 300;
  const timer = document.getElementById('respawn-timer');
  
  const interval = setInterval(() => {
    countdown--;
    const mins = Math.floor(countdown / 60);
    const secs = countdown % 60;
    timer.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    if (countdown <= 0) {
      clearInterval(interval);
      exitToMenu();
    }
  }, 1000);
}

function createHpBar(current, max) {
  const filled = Math.round((current / max) * 10);
  const empty = 10 - filled;
  let colorClass = '';
  if (current / max < 0.3) colorClass = 'critical';
  else if (current / max < 0.5) colorClass = 'low';
  
  return `<span class="hp-filled ${colorClass}">${'█'.repeat(filled)}</span><span class="hp-empty">${'░'.repeat(empty)}</span> ${current}/${max}`;
}

function updateStats(state) {
  let me;
  if (isBotMode) {
    me = state.players.player;
  } else {
    me = state.players.find(p => p.id === currentPlayerId);
  }
  if (!me) return;
  
  document.querySelector('#stat-hp .hp-bar').innerHTML = createHpBar(me.hp, me.maxHp);
  document.querySelector('#stat-score span').textContent = me.score;
  document.querySelector('#stat-level span').textContent = me.level;
  document.querySelector('#stat-points span').textContent = me.upgradePoints;
  
  document.getElementById('stat-damage').textContent = getPlayerDamage(me);
  document.getElementById('stat-speed').textContent = getPlayerSpeed(me).toFixed(1);
  document.getElementById('stat-type').textContent = 'TYPE: ' + (me.tankType?.toUpperCase() || 'BASIC');
  document.getElementById('stat-tank-type').textContent = '▸ ' + (me.tankType?.toUpperCase() || 'BASIC');

  document.getElementById('upg-points-left').textContent = `(${me.upgradePoints} pts)`;
  
  updateCurrencyDisplay();
  
  const gameDiff = document.getElementById('game-difficulty');
  if (gameDiff) {
    gameDiff.textContent = currentDifficulty.toUpperCase();
    gameDiff.className = 'game-diff ' + currentDifficulty;
  }
}

function updateLeaderboard(leaderboard) {
  const list = document.getElementById('leaderboard-list');
  list.innerHTML = leaderboard.slice(0, 5).map((p, i) => 
    `<li>${i + 1}. ${p.nickname} <span>${p.score}</span></li>`
  ).join('');
}

function showDeathOverlay() {
  deathOverlay.classList.remove('hidden');
  let countdown = 3;
  const timer = document.getElementById('respawn-timer');
  timer.textContent = countdown;
  
  const interval = setInterval(() => {
    countdown--;
    timer.textContent = countdown;
    if (countdown <= 0) clearInterval(interval);
  }, 1000);
}

function hideDeathOverlay() {
  deathOverlay.classList.add('hidden');
}

function renderGameState(state) {
  const me = state.players.find(p => p.id === currentPlayerId);
  updateCamera(me);
  updateStats(state);

  state.players.forEach(p => {
    if (p.id === currentPlayerId) {
      if (!playerTank) {
        playerTank = createTank(0x00ff88);
        scene.add(playerTank);
      }
      playerTank.position.set(p.x, 0, p.z);
      playerTank.rotation.y = -p.angle + Math.PI / 2;
      playerTank.visible = p.alive;
    } else {
      if (!otherTanks[p.id]) {
        otherTanks[p.id] = createTank(0xff6b35);
        scene.add(otherTanks[p.id]);
      }
      otherTanks[p.id].position.set(p.x, 0, p.z);
      otherTanks[p.id].rotation.y = -p.angle + Math.PI / 2;
      otherTanks[p.id].visible = p.alive;
    }
  });

  for (const id in otherTanks) {
    if (!state.players.find(p => p.id === id)) {
      scene.remove(otherTanks[id]);
      delete otherTanks[id];
    }
  }

  const foodGeo = new THREE.BoxGeometry(8, 8, 8);
  const foodColors = [0x00ff88, 0xffdd00, 0xff6b35, 0x00d4ff, 0xff44ff];
  
  state.food.forEach(f => {
    if (!foodMeshes[f.id]) {
      const mat = new THREE.MeshPhongMaterial({ 
        color: foodColors[Math.floor(Math.random() * foodColors.length)],
        emissive: 0x222200,
        emissiveIntensity: 0.5
      });
      foodMeshes[f.id] = new THREE.Mesh(foodGeo, mat);
      scene.add(foodMeshes[f.id]);
    }
    foodMeshes[f.id].position.set(f.x, 4 + Math.sin(Date.now() / 200 + f.id) * 2, f.z);
  });

  for (const id in foodMeshes) {
    if (!state.food.find(f => f.id == id)) {
      scene.remove(foodMeshes[id]);
      delete foodMeshes[id];
    }
  }

  const bulletGeo = new THREE.SphereGeometry(4, 8, 8);
  const bulletMat = new THREE.MeshPhongMaterial({ 
    color: 0xffdd00, 
    emissive: 0xffdd00,
    emissiveIntensity: 0.8
  });

  state.bullets.forEach(b => {
    if (!bullets[b.id]) {
      bullets[b.id] = new THREE.Mesh(bulletGeo, bulletMat);
      scene.add(bullets[b.id]);
    }
    bullets[b.id].position.set(b.x, 10, b.z);
  });

  for (const id in bullets) {
    if (!state.bullets.find(b => b.id == id)) {
      scene.remove(bullets[id]);
      delete bullets[id];
    }
  }
}

function animate() {
  requestAnimationFrame(animate);

  if (isBotMode && gameState === 'playing') {
    if (!localGameState.codeTankActive && Date.now() - localGameState.codeTankSpawnTime > 60000) {
      spawnCodeTank();
    }
    updateLocalGame();
  } else if (gameState === 'playing' && socket) {
    const input = {
      up: keys.up,
      down: keys.down,
      left: keys.left,
      right: keys.right,
      angle: mouseAngle,
    };
    socket.emit('input', input);
  }

  renderer.render(scene, camera);
}
