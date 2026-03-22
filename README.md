# TankAgar CLI Edition

Минималистичный онлайн танковый агарио с ASCII-эстетикой.

![TankAgar](https://img.shields.io/badge/version-1.0.0-00ff88?style=for-the-badge)
![Socket.io](https://img.shields.io/badge/Socket.io-4.7.2-00d4ff?style=for-the-badge)
![Three.js](https://img.shields.io/badge/Three.js-0.160.0-ff6b35?style=for-the-badge)

## Запуск

```bash
cd agar-clone
npm install
npm start
```

Открой `http://localhost:3000`

## Управление

| Клавиша | Действие |
|---------|----------|
| WASD / ЦФЫВ | Движение |
| ЛКМ / Пробел | Стрельба |
| U | Панель улучшений |

## Улучшения

- **▲ Speed** - увеличение скорости
- **◆ Armor** - HP и размер
- **● Damage** - урон снарядов

## Firebase (опционально)

Для полноценного хостинга без сервера:

1. Создай проект на [Firebase Console](https://console.firebase.google.com)
2. Включи **Realtime Database**
3. Скопируй credentials в `client/firebase.js`
4. Разверни на Firebase Hosting

```javascript
// client/firebase.js - замени на свои данные
export const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "my-project.firebaseapp.com",
  databaseURL: "https://my-project-default-rtdb.firebaseio.com",
  projectId: "my-project",
  // ...
};
```

## Структура проекта

```
agar-clone/
├── client/
│   ├── index.html      #SPA markup
│   ├── main.js         #Game loop, Three.js rendering
│   ├── style.css       #Terminal UI styles
│   └── firebase.js     #Firebase config (optional)
├── server/
│   ├── index.js        #Express + Socket.io server
│   └── gameLoop.js     #Game state management
└── SPEC.md             #Design specification
```

## Текущий стек

- **Frontend**: Three.js (3D рендеринг), Socket.io (синхронизация)
- **Backend**: Node.js + Express + Socket.io
- **UI**: CSS с терминальной эстетикой

## TODO

- [ ] Firebase Realtime Database sync
- [ ] Внедрение Firebase Auth
- [ ] Firebase Hosting deployment
- [ ] Дополнительные режимы игры
- [ ] Звуковые эффекты
