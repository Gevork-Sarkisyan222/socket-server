import { Server } from 'socket.io';

const io = new Server(8080, {
  cors: {
    origin: '*',
  },
});

// adding users into array
let users = [];

const addUser = (userId, socketId) => {
  !users.some((user) => user.userId === userId) && users.push({ userId, socketId });
};

const removeUser = (socketId) => {
  users = users.filter((user) => user.socketId !== socketId);
};

io.on('connection', (socket) => {
  // connect socket
  console.log('a user connected', socket.id);

  // when connect
  socket.on('addUser', (userId) => {
    addUser(userId, socket.id);
    io.emit('getUsers', users);
  });

  // send and get message
  socket.on('sendMessage', ({ messageId, userId, message, user }) => {
    console.log('user id nor', userId, 'and name', user);

    io.emit('getMessage', {
      messageId,
      userId,
      message,
      user,
    });
  });

  // delete message
  socket.on('deleteMessage', ({ messageId }) => {
    console.log('Сообщение удалено:', messageId);
    io.emit('messageDeleted', { messageId });
  });

  // update message
  socket.on('updateMessage', ({ messageId, editedMessage }) => {
    console.log('Сообшение изменено', messageId, editedMessage);
    io.emit('messageUpdated', { messageId, editedMessage });
  });

  // upload file into client & server
  socket.on('uploadImage', ({ selectedImage, messageId, user }) => {
    console.log('messageId', messageId);

    console.log('Выбранный файл', selectedImage);
    io.emit('uploadedImage', { selectedImage, messageId, user });
  });

  // clear chat
  socket.on('clearChat', ({ userId }) => {
    console.log(`Чат успешно был очищен ${userId} ом`);

    io.emit('chatCleared', { userId: userId });
    socket.broadcast.emit('chatCleared', { userId: userId });
  });

  // when disconnect
  socket.on('disconnect', () => {
    console.log('user disconnected');
    removeUser(socket.id);
    io.emit('getUsers', users);
  });
});
