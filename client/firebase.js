// Firebase configuration template
// Replace these values with your Firebase project credentials
// Get them from: Firebase Console > Project Settings > Your apps > Web app

export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Firebase Realtime Database structure for TankAgar:
//
// /rooms/{roomId}/
//   - hostId: string
//   - state: "waiting" | "playing"
//   - createdAt: timestamp
//   /players/{playerId}/
//     - nickname: string
//     - ready: boolean
//     - joinedAt: timestamp
//
// /game/{roomId}/
//   /players/{playerId}/
//     - x, z, angle: number
//     - hp, maxHp: number
//     - score: number
//     - level: number
//     - upgrades: { speed, size, damage }
//     - alive: boolean
//     - lastUpdate: timestamp
//   /food/{foodId}/
//     - x, z, value: number
//   /bullets/{bulletId}/
//     - x, z, vx, vz, damage, ownerId: string
//     - life: number
//
// /meta/{roomId}/
//   - lastActivity: timestamp
//   - playerCount: number

let firebaseInitialized = false;

export async function initFirebase() {
  if (firebaseInitialized) return;
  
  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
    const { getDatabase, ref, set, onValue, onDisconnect, remove, update, get, serverTimestamp } = 
      await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
    
    const app = initializeApp(firebaseConfig);
    const database = getDatabase(app);
    
    firebaseInitialized = true;
    
    return {
      database,
      ref,
      set,
      onValue,
      onDisconnect,
      remove,
      update,
      get,
      serverTimestamp
    };
  } catch (error) {
    console.error('Firebase initialization failed:', error);
    return null;
  }
}

export async function createRoomFB(roomCode, hostId, nickname) {
  const fb = await initFirebase();
  if (!fb) return null;
  
  const { ref, set, onDisconnect } = fb;
  const roomRef = ref(database, `rooms/${roomCode}`);
  const gameRef = ref(database, `game/${roomCode}`);
  
  await set(roomRef, {
    hostId,
    state: 'waiting',
    createdAt: Date.now()
  });
  
  await set(ref(database, `rooms/${roomCode}/players/${hostId}`), {
    nickname,
    ready: false,
    joinedAt: Date.now()
  });
  
  await set(gameRef, { initialized: true });
  
  onDisconnect(roomRef).remove();
  
  return { roomRef, gameRef };
}

export async function joinRoomFB(roomCode, playerId, nickname) {
  const fb = await initFirebase();
  if (!fb) return null;
  
  const { ref, set, onValue, onDisconnect } = fb;
  const roomRef = ref(database, `rooms/${roomCode}`);
  const playerRef = ref(database, `rooms/${roomCode}/players/${playerId}`);
  
  const snapshot = await get(roomRef);
  if (!snapshot.exists()) return null;
  
  await set(playerRef, {
    nickname,
    ready: false,
    joinedAt: Date.now()
  });
  
  onDisconnect(playerRef).remove();
  
  return { roomRef, playerRef };
}

export async function updatePlayerStateFB(roomCode, playerId, state) {
  const fb = await initFirebase();
  if (!fb) return;
  
  const { ref, update } = fb;
  await update(ref(database, `game/${roomCode}/players/${playerId}`), {
    ...state,
    lastUpdate: Date.now()
  });
}
