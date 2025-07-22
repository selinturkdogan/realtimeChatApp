const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Statik dosyalar
app.use(express.static(path.join(__dirname, 'public')));

const connectedUsers = new Map();

function broadcastUserList() {
  const users = Array.from(connectedUsers.entries()).map(([id, name]) => ({ id, name }));
  io.emit('user list', users);
}

io.on('connection', (socket) => {
  const name = socket.handshake.query.name;
  connectedUsers.set(socket.id, name);

  console.log(`${name} connected`);
  broadcastUserList();

  // TYPING eventi dinle ve karşı kullanıcıya gönder
  socket.on('typing', ({ to, typing }) => {
    io.to(to).emit('typing', { from: connectedUsers.get(socket.id), typing });
  });

  socket.on('private message', ({ to, text }) => {
    const from = connectedUsers.get(socket.id);
    const timestamp = new Date();

    io.to(to).emit('private message', {
      from,
      text,
      timestamp
    });

    socket.emit('private message', {
      from,
      text,
      timestamp,
      own: true
    });
  });

  socket.on('disconnect', () => {
    console.log(`${connectedUsers.get(socket.id)} disconnected`);
    connectedUsers.delete(socket.id);
    broadcastUserList();
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
