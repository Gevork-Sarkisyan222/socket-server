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

const getUser = (userId) => {
  return users.find(user => user.userId === userId)
}

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

  // for Instagram clone 

  // send a private message and get to user 
  socket.on('sendMessageInstagram', ({ senderId, receiverId, text }) => {
    const user = getUser(receiverId);
    if (user && user.socketId) {
      io.to(user.socketId).emit("getMessageInstagram", {
        senderId,
        text
      });
    } else {
      console.log("Пользователь не найден или не имеет сокета");
    }
  });

  // delete message with socket
  socket.on('deleteMessageInstagram', ({ receiverId, messageId }) => {
    const user = getUser(receiverId);
    console.log('Сообщение удалено:', messageId);
    if (user && user.socketId) {
      io.to(user.socketId).emit("messageDeletedInstagram", {
        messageId
      })
    } else {
      console.log("Пользователь не найден или не имеет сокета не удалось удалить сообщение");
    }
  })

  // edit message with socket
  socket.on('editMessageInstagram', ({ receiverId, messageId, editedMessage }) => {
    const user = getUser(receiverId);
    console.log('Сообщение изменено:', messageId);
    if (user && user.socketId) {
      io.to(user.socketId).emit("messageEditedInstagram", {
        messageId,
        editedMessage
      })
    } else {
      console.log("Пользователь не найден или не имеет сокета не удалось изменить сообщение");
    }
  })

  // when disconnect
  socket.on('disconnect', () => {
    console.log('user disconnected', socket.id);
    removeUser(socket.id);
    io.emit('getUsers', users);
  });
});
