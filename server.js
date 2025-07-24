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
  const users = Array.from(connectedUsers.entries()).map(([id, name]) => ({ 
    id, 
    name: users.name,
    avatarStyle: users.avatarStyle,
    avatarSeed: users.avatarSeed
  }));
  io.emit('user list', users);
}

io.on('connection', (socket) => { //yeni bir kullanıcı bağlandığında bu fonksiyon
  const name = socket.handshake.query.name;
  connectedUsers.set(socket.id, name); //kullanıcıyı connetcedUsers listesine ekler

  console.log(`${name} connected`);
  broadcastUserList(); //güncel listeyi herkese yollar



   // Gruptan ayrıl
    socket.on('leave group', ({ groupId }) => {
        const group = groups.get(groupId);
        if (!group) return;
        const username = connectedUsers.get(socket.id);
        group.members = group.members.filter(m => m !== username);
        io.emit('group updated', { groupId, members: group.members });
    });

    // Grubu sil
    socket.on('delete group', ({ groupId }) => {
        if (groups.has(groupId)) {
            groups.delete(groupId);
            io.emit('group deleted', { groupId });
        }
    });
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
// Grup oluşturma işlemi 
socket.on('create group', ({ groupName, members }, callback) => {
  try {
    const groupId = `group_${Date.now()}`;
    const creator = connectedUsers.get(socket.id);
    
    // Geçerli kullanıcıları filtrele
    const validMembers = members.filter(member => 
      [...connectedUsers.values()].includes(member)
    );
    
    const allMembers = [...new Set([...validMembers, creator])];
    
    groups.set(groupId, {
      name: groupName,
      members: allMembers,
      creator
    });

    // Tüm üyelere bilgi gönder
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

    // Başarılı yanıt
    callback({ success: true, groupId });
  } catch (error) {
    console.error('Grup oluşturma hatası:', error);
    callback({ success: false, message: 'Grup oluşturulamadı' });
  }
});
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
// add users group 
socket.on('add users to group', ({ groupId, users }) => {
    const group = groups.get(groupId);
    if (!group) {
        console.log('Group not found:', groupId);
        return;
    }
    console.log('Adding users:', users, 'to group:', groupId);
    
    // Mevcut üyelerle yeni üyeleri birleştir (tekrarları önle)
    const updatedMembers = [...new Set([...group.members, ...users])];
    
    // Grubu güncelle
    groups.set(groupId, {
        ...group,
        members: updatedMembers
    });

    //  Tüm grup üyelerine güncellemeyi gönder
    updatedMembers.forEach(member => {
        const memberSocket = [...connectedUsers.entries()]
            .find(([id, name]) => name === member)?.[0];
        if (memberSocket) {
            io.to(memberSocket).emit('group updated', {
                groupId,
                members: updatedMembers
            });
        }
    });

    //  Yeni eklenen üyelere grup bilgisini gönder
    users.forEach(newMember => {
        const memberSocket = [...connectedUsers.entries()]
            .find(([id, name]) => name === newMember)?.[0];
        if (memberSocket) {
            io.to(memberSocket).emit('group created', {
                groupId,
                groupName: group.name,
                members: updatedMembers
            });
        }
    });
    console.log('Updated group members:', updatedMembers);
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