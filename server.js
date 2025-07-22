const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

//expresste public klasörü statik dosya sunucu olarak ayarlanır
app.use(express.static(path.join(__dirname, 'public')));

const connectedUsers = new Map(); //bağlı kullanıcıları takip etmek için Map oluşturur

function broadcastUserList() {
  const users = Array.from(connectedUsers.entries()).map(([id, name]) => ({ id, name }));
  io.emit('user list', users); //io.emit() ile bu liste tüm bağlı istemcilere yayınlanır
  }

io.on('connection', (socket) => {
  const name = socket.handshake.query.name;
  connectedUsers.set(socket.id, name);

  console.log(`${name} connected`);
  broadcastUserList(); //tüm kullanıcılara güncel user listesini gönderir

  socket.on('private message', ({ to, text }) => {
    const from = connectedUsers.get(socket.id); //mesaji gönderen kullanicinin ismini alir
    const timestamp = new Date(); //mesajin gönderildiği zamanı alır

    io.to(to).emit('private message', { //mesajı to idsine sahip kullanıcıya gönderir
      from,
      text,
      timestamp
    });

    socket.emit('private message', { //mesajı gönderen kullanıcıya da aynı mesajı tekrar gönderir 
      from,
      text,
      timestamp,
      own: true //mesajın gönderene ait olduğunu belirtir
    });
  });

  //kullanıcı bağlantısını kestiğinde
  socket.on('disconnect', () => {
    console.log(`${connectedUsers.get(socket.id)} disconnected`);
    connectedUsers.delete(socket.id); //kullanıcı connectedUsers dan silinir
    broadcastUserList(); //güncellenen listeyi tüm istemcilere gönderir
  });
});

//Anasayfa  (/) isteği
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
