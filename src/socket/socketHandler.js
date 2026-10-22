let io = null;

const initSocket = (socketIoInstance) => {
  io = socketIoInstance;

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    // Join user private room
    socket.on('join_user', (userId) => {
      if (userId) {
        socket.join(`user:${userId}`);
        console.log(`[Socket.IO] Socket ${socket.id} joined room user:${userId}`);
      }
    });

    // Join role room (e.g. role:admin, role:provider)
    socket.on('join_role', (role) => {
      if (role) {
        socket.join(`role:${role}`);
        console.log(`[Socket.IO] Socket ${socket.id} joined room role:${role}`);
      }
    });

    // Join booking live tracking room
    socket.on('join_booking', (bookingId) => {
      if (bookingId) {
        socket.join(`booking:${bookingId}`);
        console.log(`[Socket.IO] Socket ${socket.id} joined room booking:${bookingId}`);
      }
    });

    // Handle provider live GPS location broadcast
    socket.on('provider_location_update', ({ bookingId, providerId, latitude, longitude, heading, speed }) => {
      if (bookingId) {
        io.to(`booking:${bookingId}`).emit('machinery_location_changed', {
          bookingId,
          providerId,
          latitude,
          longitude,
          heading,
          speed,
          updatedAt: new Date(),
        });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });
};

const getIO = () => {
  return io;
};

// Helper methods to emit from controllers
const emitToUser = (userId, event, data) => {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
};

const emitToRole = (role, event, data) => {
  if (io) {
    io.to(`role:${role}`).emit(event, data);
  }
};

const emitToBooking = (bookingId, event, data) => {
  if (io) {
    io.to(`booking:${bookingId}`).emit(event, data);
  }
};

const broadcastEvent = (event, data) => {
  if (io) {
    io.emit(event, data);
  }
};

module.exports = {
  initSocket,
  getIO,
  emitToUser,
  emitToRole,
  emitToBooking,
  broadcastEvent,
};
