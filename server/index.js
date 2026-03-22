import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  initFood, addPlayer, removePlayer,
  movePlayer, shootBullet, applyUpgrade,
  checkFoodCollisions, updateBullets,
  getLeaderboard, getGameState,
  respawnPlayer,
} from './gameLoop.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  pingInterval: 10000,
  pingTimeout: 5000,
});
app.use(express.static(join(__dirname, 'client')));
initFood();
const inputs = {};
const rooms = new Map();
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
function createRoom(hostId, nickname) {
  const code = generateRoomCode();
  const room = {
    code,
    hostId,
    players: [{ id: hostId, nickname, ready: false }],
    state: 'waiting',
  };
  rooms.set(code, room);
  return room;
}
function getRoomState(code) {
  const room = rooms.get(code);
  if (!room) return null;
  return {
    code: room.code,
    hostId: room.hostId,
    players: room.players.map(p => ({ id: p.id, nickname: p.nickname, ready: p.ready })),
    state: room.state,
  };
}
io.on('connection', (socket) => {
  console.log(`[CONNECTED] ${socket.id}`);
  socket.on('createRoom', (nickname) => {
    const name = String(nickname).trim().slice(0, 16) || 'Tank';
    const room = createRoom(socket.id, name);
    socket.join(room.code);
    socket.emit('roomCreated', getRoomState(room.code));
    console.log(`[ROOM CREATED] ${room.code} by ${name}`);
  });
  socket.on('joinRoom', ({ code, nickname }) => {
    const name = String(nickname).trim().slice(0, 16) || 'Tank';
    const upperCode = String(code).toUpperCase();
    const room = rooms.get(upperCode);
    
    if (!room) {
      socket.emit('roomError', 'ROOM NOT FOUND');
      return;
    }
    if (room.state !== 'waiting') {
      socket.emit('roomError', 'GAME IN PROGRESS');
      return;
    }
    if (room.players.length >= 8) {
      socket.emit('roomError', 'ROOM FULL');
      return;
    }
    room.players.push({ id: socket.id, nickname: name, ready: false });
    socket.join(upperCode);
    socket.emit('roomJoined', getRoomState(upperCode));
    io.to(upperCode).emit('roomUpdate', getRoomState(upperCode));
    console.log(`[ROOM JOINED] ${name} joined ${upperCode}`);
  });
  socket.on('toggleReady', () => {
    for (const [code, room] of rooms) {
      const player = room.players.find(p => p.id === socket.id);
      if (player) {
        player.ready = !player.ready;
        io.to(code).emit('roomUpdate', getRoomState(code));
        
        const allReady = room.players.length > 0 && room.players.every(p => p.ready);
        if (allReady) {
          room.state = 'playing';
          room.players.forEach(p => {
            addPlayer(p.id, p.nickname);
            inputs[p.id] = { up: false, down: false, left: false, right: false, angle: 0 };
            io.to(p.id).emit('joined', { id: p.id });
          });
          io.to(code).emit('gameStart');
          console.log(`[GAME START] ${code}`);
        }
        break;
      }
    }
  });
  socket.on('leaveRoom', () => {
    for (const [code, room] of rooms) {
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        socket.leave(code);
        
        if (socket.id === room.hostId && room.players.length > 1) {
          room.hostId = room.players[(idx + 1) % room.players.length].id;
        }
        
        room.players.splice(idx, 1);
        
        if (room.players.length === 0) {
          rooms.delete(code);
        } else {
          io.to(code).emit('roomUpdate', getRoomState(code));
        }
        break;
      }
    }
  });
  socket.on('input', (data) => {
    if (inputs[socket.id]) inputs[socket.id] = data;
  });
  socket.on('shoot', () => {
    shootBullet(socket.id);
  });
  socket.on('upgrade', (type) => {
    applyUpgrade(socket.id, type);
  });
  socket.on('disconnect', () => {
    removePlayer(socket.id);
    delete inputs[socket.id];
    
    for (const [code, room] of rooms) {
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        socket.to(code).emit('playerLeft', socket.id);
        room.players.splice(idx, 1);
        
        if (room.players.length === 0) {
          rooms.delete(code);
        } else {
          if (socket.id === room.hostId) {
            room.hostId = room.players[0].id;
          }
          io.to(code).emit('roomUpdate', getRoomState(code));
        }
        break;
      }
    }
    
    console.log(`[DISCONNECTED] ${socket.id}`);
  });
});
const playerDeathCallbacks = new Map();
function handlePlayerDeath(playerId) {
  io.to(playerId).emit('playerDied');
  
  playerDeathCallbacks.set(playerId, setTimeout(() => {
    respawnPlayer(playerId);
    io.to(playerId).emit('respawn');
    playerDeathCallbacks.delete(playerId);
  }, 3000));
}
setInterval(() => {
  for (const id in inputs) {
    movePlayer(id, inputs[id]);
  }
  checkFoodCollisions();
  
  const deadPlayers = updateBullets();
  deadPlayers.forEach(pid => {
    if (!playerDeathCallbacks.has(pid)) {
      handlePlayerDeath(pid);
    }
  });
  const state = getGameState();
  const leaderboard = getLeaderboard();
  io.emit('state', state);
  io.emit('leaderboard', leaderboard);
}, 1000 / 30);
const PORT = process.env.PORT || 10000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════╗
║     TankAgar Server Running            ║
║     http://localhost:${PORT}                ║
╚═══════════════════════════════════════════╝
  `);
});
