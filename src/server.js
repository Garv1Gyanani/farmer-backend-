const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const dotenv = require('dotenv');
const { Server } = require('socket.io');

// Load environment variables (check both backend root and cwd)
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

const connectDB = require('./config/db');
const { initSocket } = require('./socket/socketHandler');
const errorHandler = require('./middleware/errorHandler');

// Route imports
const authRoutes = require('./routes/authRoutes');
const farmerRoutes = require('./routes/farmerRoutes');
const agentRoutes = require('./routes/agentRoutes');
const providerRoutes = require('./routes/providerRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const walletRoutes = require('./routes/walletRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const adminRoutes = require('./routes/adminRoutes');
const storageRoutes = require('./routes/storageRoutes');
const weatherRoutes = require('./routes/weatherRoutes');
const mapsRoutes = require('./routes/mapsRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const { initCronJobs } = require('./services/cronService');

// Initialize app & server
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});
initSocket(io);

// Connect to MongoDB Atlas
connectDB();

// Global Middlewares
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);
app.use(cors({ origin: '*' }));
app.use(compression());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

const fs = require('fs');

// Serve uploaded files statically
const staticUploadsDir = fs.existsSync('/www/wwwroot/apiagritech.divanex.in/uploads')
  ? '/www/wwwroot/apiagritech.divanex.in/uploads'
  : path.join(__dirname, '../uploads');
app.use('/uploads', express.static(staticUploadsDir));
app.use('/api/uploads', express.static(staticUploadsDir));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/api/uploads', express.static(path.join(__dirname, '../uploads')));

// Direct file serving fallback for all uploaded documents
app.get(['/uploads/*', '/api/uploads/*'], (req, res, next) => {
  const relativePath = req.params[0] || req.path.replace(/^\/(api\/)?uploads\//, '');
  const possiblePaths = [
    path.join('/www/wwwroot/apiagritech.divanex.in/uploads', relativePath),
    path.join(__dirname, '../uploads', relativePath),
    path.join(__dirname, '../../uploads', relativePath),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return res.sendFile(p);
    }
  }
  next();
});

// Health Check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'online',
    platform: 'ProFarmer Agricultural SaaS Backend',
    database: 'MongoDB Atlas Connected',
    time: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/farmers', farmerRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/maps', mapsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payment', paymentRoutes);

// Initialize Automated Background Cron Jobs
initCronJobs();

// Serve Admin Panel Web Console Build
const adminDistPath = path.join(__dirname, '../../admin_panel/dist');
if (fs.existsSync(adminDistPath)) {
  app.use(express.static(adminDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }
    res.sendFile(path.join(adminDistPath, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.status(200).json({
      message: 'Welcome to ProFarmer Multi-Role Rural Marketplace API',
      endpoints: {
        auth: '/api/auth',
        farmers: '/api/farmers',
        agents: '/api/agents',
        providers: '/api/providers',
        services: '/api/services',
        bookings: '/api/bookings',
        wallet: '/api/wallet',
        notifications: '/api/notifications',
        admin: '/api/admin',
        uploads: '/uploads',
        health: '/api/health',
      },
    });
  });
}

// Global Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 5001;

server.listen(PORT, () => {
  console.log(`[ProFarmer API] Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

module.exports = { app, server };

