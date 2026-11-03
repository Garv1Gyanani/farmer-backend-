const jwt = require('jsonwebtoken');

let io = null;

const initSocket = (socketIoInstance) => {
  io = socketIoInstance;

  // Optional JWT Authentication Middleware
  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '') ||
        socket.handshake.query?.token;

      if (token && process.env.JWT_SECRET) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.id || decoded._id;
        socket.userRole = decoded.role;
      }
    } catch (err) {
      // Allow connection even if token expired or invalid; client can still emit join_*
      console.warn(`[Socket.IO] Handshake auth fallback for socket ${socket.id}: ${err.message}`);
    }
    next();
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    // Auto-join if authenticated via handshake
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
      console.log(`[Socket.IO] Socket ${socket.id} auto-joined user:${socket.userId}`);
    }
    if (socket.userRole) {
      socket.join(`role:${socket.userRole}`);
      console.log(`[Socket.IO] Socket ${socket.id} auto-joined role:${socket.userRole}`);
    }

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
