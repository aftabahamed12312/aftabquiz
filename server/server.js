require('dotenv').config();
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

const game = require('./services/game');
const registerSockets = require('./socket');

const {
  PORT = 5000,
  MONGO_URI = 'mongodb://127.0.0.1:27017/gyanpunja_quiz',
  CLIENT_ORIGIN = 'http://localhost:5173',
} = process.env;

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is missing. Copy .env.example to .env and set it.');
}

const origins = CLIENT_ORIGIN.split(',').map((s) => s.trim());
const app = express();
app.use(cors({ origin: origins }));
app.use(express.json({ limit: '1mb' }));
const uploads = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
fs.mkdirSync(uploads, { recursive: true });
app.use('/uploads', express.static(uploads, { maxAge: '7d', immutable: true }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/houses', require('./routes/houses'));
app.use('/api/rounds', require('./routes/rounds'));
app.use('/api/questions', require('./routes/questions'));
app.use('/api/game', require('./routes/game'));
app.use('/api', require('./routes/health'));

// Serve the built React app in production (client/dist)
const dist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res, next) => (req.path.startsWith('/api') ? next() : res.sendFile(path.join(dist, 'index.html'))));
}

// Central error handler
app.use((err, req, res, next) => {
  if (err.status || err.statusCode) return res.status(err.status || err.statusCode).json({ message: err.message });
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'value';
    return res.status(409).json({ message: `That ${field} is already in use.` });
  }
  if (err.name === 'ValidationError') {
    return res.status(400).json({ message: Object.values(err.errors).map((e) => e.message).join(' ') });
  }
  if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid id.' });
  console.error(err);
  res.status(500).json({ message: 'Something went wrong on the server.' });
});

let mongoConnection;

function connectDatabase() {
  if (mongoose.connection.readyState === 1) return Promise.resolve();
  if (!mongoConnection) {
    mongoConnection = mongoose.connect(MONGO_URI).catch((err) => {
      mongoConnection = null;
      throw err;
    });
  }
  return mongoConnection;
}

async function start() {
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: origins } });
  registerSockets(io);

  try {
    await connectDatabase();
    console.log('MongoDB connected');
    await game.init(io);
    server.listen(PORT, '0.0.0.0', () => console.log(`Gyanpunja Quiz server running on port ${PORT}`));
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  }
}

if (require.main === module) start();

module.exports = { app, connectDatabase };
