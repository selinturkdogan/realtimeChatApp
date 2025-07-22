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
const groups = new Map();

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
    if (to.startsWith('group_')) {
      // Grup typing indicator'ı
      const group = groups.get(to);
      if (group && group.members.includes(connectedUsers.get(socket.id))) {
        group.members.forEach(member => {
          const memberSocket = [...connectedUsers.entries()]
            .find(([id, n]) => n === member)?.[0];
          if (memberSocket && memberSocket !== socket.id) {
            io.to(memberSocket).emit('typing', { 
              from: connectedUsers.get(socket.id), 
              typing,
              groupId: to
            });
          }
        });
      }
    } else {
      // Bireysel sohbet typing indicator'ı
      io.to(to).emit('typing', { from: connectedUsers.get(socket.id), typing });
    }
  });

  // Bireysel mesaj
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

  // Grup oluşturma
  socket.on('create group', ({ groupName, members }) => {
    const groupId = `group_${Date.now()}`;
    const creator = connectedUsers.get(socket.id);
    
    // Gruba creator'ı da ekle
    const allMembers = [...new Set([...members, creator])];
    
    groups.set(groupId, {
      name: groupName,
      members: allMembers,
      creator
    });

    // Tüm üyelere grup bilgisini gönder
    allMembers.forEach(member => {
      const memberSocket = [...connectedUsers.entries()]
        .find(([id, n]) => n === member)?.[0];
      if (memberSocket) {
        io.to(memberSocket).emit('group created', {
          groupId,
          groupName,
          members: allMembers
        });
      }
    });
  });

socket.on('group message', ({ groupId, text }) => {
  const group = groups.get(groupId);
  if (!group) return;

  const from = connectedUsers.get(socket.id);
  const timestamp = new Date();

  // Mesajı gönderen hariç diğer üyelere gönder
  group.members.forEach(member => {
    const memberSocket = [...connectedUsers.entries()]
      .find(([id, n]) => n === member)?.[0];
    if (memberSocket) {
      // Gönderen kullanıcıya 'own: true' diğerlerine 'false' olarak gönder
      io.to(memberSocket).emit('group message', {
        groupId,
        from,
        text,
        timestamp,
        own: memberSocket === socket.id
      });
    }
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