const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express(); //express uygulamasını baslatır
const server = http.createServer(app);
const io = new Server(server);

// Statik dosyalar
app.use(express.static(path.join(__dirname, 'public'))); //public klasöründeki dosyalar statik olarak sunulur

const connectedUsers = new Map();
const groups = new Map();

function broadcastUserList() {
  const users = Array.from(connectedUsers.entries()).map(([id, name]) => ({ id, name }));
  io.emit('user list', users);
}

io.on('connection', (socket) => { //yeni bir kullanıcı bağlandığında bu fonksiyon
  const name = socket.handshake.query.name;
  connectedUsers.set(socket.id, name); //kullanıcıyı connetcedUsers listesine ekler

  console.log(`${name} connected`);
  broadcastUserList(); //güncel listeyi herkese yollar

  // Yazıyor bilgisi (typing)
  socket.on('typing', ({ to, typing }) => { //Kullanıcı biriyle mesajlaşırken yazıyo/yazmıyor bilgisi gönderir
    if (to.startsWith('group_')) { //eğer hedef grupsa
      const group = groups.get(to); //grup bilgisi alınır
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
    //alıcıya mesaj gönderilir
    io.to(to).emit('private message', {
      from,
      text,
      timestamp
    });

    socket.emit('private message', {
      from,
      text,
      timestamp,
      own: true //göndericiye aynı mesaj gönderilir
    });
  });

  // Grup oluşturma
  socket.on('create group', ({ groupName, members }) => {
    const groupId = `group_${Date.now()}`;
    const creator = connectedUsers.get(socket.id); //grubu oluşturan kişi belirlenir
    
    // Gruba oluşturan kişi eklenir 
    const allMembers = [...new Set([...members, creator])];
    
    groups.set(groupId, { //grup bilgileri groups listesine eklenir
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

  // Grup mesajı 
// Grup mesajı
socket.on('group message', ({ groupId, text }) => {
  const group = groups.get(groupId);
  if (!group) return;

  const from = connectedUsers.get(socket.id);
  const timestamp = new Date();

  group.members.forEach(member => {
    const memberSocket = [...connectedUsers.entries()]
      .find(([id, n]) => n === member)?.[0];
    if (memberSocket && memberSocket !== socket.id) { // gönderici hariç
      io.to(memberSocket).emit('group message', { groupId, from, text, timestamp, own: false });
    }
  });
});


  socket.on('disconnect', () => { //bağlantı kesilirse
    console.log(`${connectedUsers.get(socket.id)} disconnected`);
    connectedUsers.delete(socket.id);
    broadcastUserList(); //güncel userlist tüm kullanıcılara gönderilir, çevrimdışı olanlar listede görünmez
  });
});

//Anasayfa (/) isteği
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});