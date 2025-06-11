const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

const rooms = {};

io.on('connection', (socket) => {
  console.log(`🔗 New connection: ${socket.id}`);

  socket.on('join_room', ({ roomId, name }) => {
    socket.join(roomId);
    if (!rooms[roomId]) {
      rooms[roomId] = { players: [], choices: {}, timers: {} };
    }

    rooms[roomId].players.push({ id: socket.id, name });
    io.to(roomId).emit('players_update', rooms[roomId].players);
    console.log(`👥 ${name} joined ${roomId}`);
  });

  socket.on('player_choice', ({ roomId, choice }) => {
    if (!rooms[roomId]) return;
    rooms[roomId].choices[socket.id] = choice;

    notifyOpponentMove(roomId, socket.id);

    if (Object.keys(rooms[roomId].choices).length === 1) {
      startChoiceTimer(roomId);
    }

    if (Object.keys(rooms[roomId].choices).length === 2) {
      finishRound(roomId);
    }
  });

  socket.on('chat_message', ({ roomId, name, message }) => {
    io.to(roomId).emit('chat_message', { name, message });
  });

  socket.on('signal', ({ roomId, target, signal }) => {
    io.to(target).emit('signal', { sender: socket.id, signal });
  });

  socket.on('leave_room', ({ roomId }) => {
    if (rooms[roomId]) {
      rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
      delete rooms[roomId].choices[socket.id];
      if (rooms[roomId].players.length === 0) {
        clearTimeout(rooms[roomId].timers.choice);
        delete rooms[roomId];
      } else {
        io.to(roomId).emit('players_update', rooms[roomId].players);
      }
    }
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      const room = rooms[roomId];
      room.players = room.players.filter(p => p.id !== socket.id);
      delete room.choices[socket.id];

      if (room.players.length === 0) {
        clearTimeout(room.timers.choice);
        delete rooms[roomId];
      } else {
        io.to(roomId).emit('players_update', room.players);
      }
    }
  });
});

function notifyOpponentMove(roomId, playerId) {
  const room = rooms[roomId];
  room.players.forEach((player) => {
    if (player.id !== playerId) {
      io.to(player.id).emit('opponent_moved');
    }
  });
}

function startChoiceTimer(roomId) {
  if (!rooms[roomId]) return;

  rooms[roomId].timers.choice = setTimeout(() => {
    const room = rooms[roomId];
    if (!room) return;

    room.players.forEach((player) => {
      if (!room.choices[player.id]) {
        const randomChoice = getRandomChoice();
        room.choices[player.id] = randomChoice;
        io.to(player.id).emit('auto_choice', randomChoice);
      }
    });

    finishRound(roomId);
  }, 10000);
}

function finishRound(roomId) {
  const room = rooms[roomId];
  if (!room || room.players.length < 2) return;

  clearTimeout(room.timers.choice);

  const [p1, p2] = room.players;
  const c1 = room.choices[p1.id];
  const c2 = room.choices[p2.id];

  const result = getGameResult(c1, c2);
  io.to(roomId).emit('round_result', {
    [p1.id]: { choice: c1, result: result[0] },
    [p2.id]: { choice: c2, result: result[1] }
  });

  room.choices = {};
}

function getRandomChoice() {
  const choices = ['rock', 'paper', 'scissors'];
  return choices[Math.floor(Math.random() * choices.length)];
}

function getGameResult(choice1, choice2) {
  if (choice1 === choice2) return ['draw', 'draw'];
  if (
    (choice1 === 'rock' && choice2 === 'scissors') ||
    (choice1 === 'scissors' && choice2 === 'paper') ||
    (choice1 === 'paper' && choice2 === 'rock')
  ) {
    return ['win', 'lose'];
  }
  return ['lose', 'win'];
}

server.listen(5000, () => console.log('🚀 Server running on http://localhost:5000'));
