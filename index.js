import { Server } from "socket.io";

const io = new Server(8080, {
  cors: { origin: "*" },
  transports: ["websocket", "polling"],
  maxHttpBufferSize: 1e6, // ограничим полезную нагрузку ~1MB (SDP/ICE помещаются)
});

// ======================
// Users registry (онлайн)
// ======================
let users = [];

// Перезаписываем сокет, если пользователь переподключился
const addUser = (userId, socketId) => {
  if (!userId) return;
  users = users.filter((u) => u.userId !== userId);
  users.push({ userId, socketId });
};

const removeUser = (socketId) => {
  users = users.filter((user) => user.socketId !== socketId);
};

const getUser = (userId) => users.find((user) => user.userId === userId);

// NEW(WebRTC): утилита — получить userId по socket.id
const getUserIdBySocket = (socketId) =>
  users.find((u) => u.socketId === socketId)?.userId || null;

// NEW(WebRTC): опциональный лимит участников звонка (mesh тяжёлый)
// const MAX_CALL_ROOM = 16;

io.on("connection", (socket) => {
  // connect socket
  console.log("a user connected", socket.id);

  // when connect
  socket.on("addUser", (userId) => {
    addUser(userId, socket.id);
    io.emit("getUsers", users);
  });

  // send and get message
  socket.on("sendMessage", ({ messageId, userId, message, user }) => {
    console.log("user id nor", userId, "and name", user);
    io.emit("getMessage", { messageId, userId, message, user });
  });

  // delete message
  socket.on("deleteMessage", ({ messageId }) => {
    console.log("Сообщение удалено:", messageId);
    io.emit("messageDeleted", { messageId });
  });

  // update message
  socket.on("updateMessage", ({ messageId, editedMessage }) => {
    console.log("Сообшение изменено", messageId, editedMessage);
    io.emit("messageUpdated", { messageId, editedMessage });
  });

  // upload file into client & server
  socket.on("uploadImage", ({ selectedImage, messageId, user }) => {
    console.log("messageId", messageId);
    console.log("Выбранный файл", selectedImage);
    io.emit("uploadedImage", { selectedImage, messageId, user });
  });

  // clear chat
  socket.on("clearChat", ({ userId }) => {
    console.log(`Чат успешно был очищен ${userId} ом`);
    io.emit("chatCleared", { userId });
    socket.broadcast.emit("chatCleared", { userId });
  });

  // ======================
  // Instagram clone events
  // ======================
  // send a private message and get to user
  socket.on("sendMessageInstagram", ({ senderId, receiverId, text }) => {
    const user = getUser(receiverId);
    if (user?.socketId) {
      io.to(user.socketId).emit("getMessageInstagram", { senderId, text });
    } else {
      console.log("Пользователь не найден или не имеет сокета");
    }
  });

  // delete message with socket
  socket.on("deleteMessageInstagram", ({ receiverId, messageId }) => {
    const user = getUser(receiverId);
    console.log("Сообщение удалено:", messageId);
    if (user?.socketId) {
      io.to(user.socketId).emit("messageDeletedInstagram", { messageId });
    } else {
      console.log(
        "Пользователь не найден или не имеет сокета не удалось удалить сообщение"
      );
    }
  });

  // edit message with socket
  socket.on(
    "editMessageInstagram",
    ({ receiverId, messageId, editedMessage }) => {
      const user = getUser(receiverId);
      console.log("Сообщение изменено:", messageId);
      if (user?.socketId) {
        io.to(user.socketId).emit("messageEditedInstagram", {
          messageId,
          editedMessage,
        });
      } else {
        console.log(
          "Пользователь не найден или не имеет сокета не удалось изменить сообщение"
        );
      }
    }
  );

  // ===========================
  // NEW(WebRTC): сигнальный слой
  // ===========================

  // Войти в комнату звонка (roomId = общий чат, например 'general' или ваш chatId)
  socket.on("call:join", ({ roomId, meta }) => {
    if (typeof roomId !== "string" || !roomId) return;

    // Пример лимита для mesh:
    // const size = io.sockets.adapter.rooms.get(roomId)?.size || 0;
    // if (size >= MAX_CALL_ROOM) {
    //   io.to(socket.id).emit('call:full', { roomId, max: MAX_CALL_ROOM });
    //   return;
    // }

    socket.join(roomId);

    // Список уже подключённых пиров (socketId), кроме себя
    const peers = Array.from(io.sockets.adapter.rooms.get(roomId) || []).filter(
      (sid) => sid !== socket.id
    );

    // Сообщаем новому участнику, с кем устанавливать WebRTC-сессии
    io.to(socket.id).emit("call:peers", {
      roomId,
      peers, // массив socketId существующих участников
    });

    // Уведомляем остальных: к комнате подключился новый участник
    socket.to(roomId).emit("call:peer-joined", {
      roomId,
      socketId: socket.id,
      userId: getUserIdBySocket(socket.id),
      meta: meta || null, // опционально имя/аватар
    });
  });

  // Покинуть комнату звонка
  socket.on("call:leave", ({ roomId }) => {
    if (typeof roomId !== "string" || !roomId) return;
    socket.leave(roomId);
    socket.to(roomId).emit("call:peer-left", {
      roomId,
      socketId: socket.id,
      userId: getUserIdBySocket(socket.id),
    });
  });

  // Точечная пересылка SDP offer
  socket.on("call:offer", ({ toSocketId, toUserId, sdp, roomId }) => {
    const targetSid =
      toSocketId || (toUserId ? getUser(toUserId)?.socketId : null);
    if (!targetSid || !sdp) return;
    io.to(targetSid).emit("call:offer", {
      fromSocketId: socket.id,
      fromUserId: getUserIdBySocket(socket.id),
      roomId: roomId || null,
      sdp,
    });
  });

  // Точечная пересылка SDP answer
  socket.on("call:answer", ({ toSocketId, toUserId, sdp, roomId }) => {
    const targetSid =
      toSocketId || (toUserId ? getUser(toUserId)?.socketId : null);
    if (!targetSid || !sdp) return;
    io.to(targetSid).emit("call:answer", {
      fromSocketId: socket.id,
      fromUserId: getUserIdBySocket(socket.id),
      roomId: roomId || null,
      sdp,
    });
  });

  // Точечная пересылка ICE-кандидатов
  socket.on("call:ice", ({ toSocketId, toUserId, candidate, roomId }) => {
    const targetSid =
      toSocketId || (toUserId ? getUser(toUserId)?.socketId : null);
    if (!targetSid || !candidate) return;
    io.to(targetSid).emit("call:ice", {
      fromSocketId: socket.id,
      fromUserId: getUserIdBySocket(socket.id),
      roomId: roomId || null,
      candidate,
    });
  });

  // Завершение вызова (по желанию — уведомить конкретного адресата или всех в комнате)
  socket.on("call:hangup", ({ toSocketId, toUserId, roomId }) => {
    if (toSocketId) {
      io.to(toSocketId).emit("call:hangup", {
        fromSocketId: socket.id,
        fromUserId: getUserIdBySocket(socket.id),
        roomId: roomId || null,
      });
    } else if (toUserId) {
      const u = getUser(toUserId);
      if (u?.socketId) {
        io.to(u.socketId).emit("call:hangup", {
          fromSocketId: socket.id,
          fromUserId: getUserIdBySocket(socket.id),
          roomId: roomId || null,
        });
      }
    } else if (roomId) {
      socket.to(roomId).emit("call:hangup", {
        fromSocketId: socket.id,
        fromUserId: getUserIdBySocket(socket.id),
        roomId,
      });
    }
  });

  // При отключении сокета — оповестим все комнаты звонков, где он был
  socket.on("disconnecting", () => {
    for (const roomId of socket.rooms) {
      if (roomId === socket.id) continue;
      socket.to(roomId).emit("call:peer-left", {
        roomId,
        socketId: socket.id,
        userId: getUserIdBySocket(socket.id),
      });
    }
  });

  // when disconnect
  socket.on("disconnect", () => {
    console.log("user disconnected", socket.id);
    removeUser(socket.id);
    io.emit("getUsers", users);
  });
});
