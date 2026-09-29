const { app, connectDatabase } = require('../server/server');

module.exports = async function handler(req, res) {
  try {
    await connectDatabase();
    return app(req, res);
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    return res.status(500).json({ message: 'Database connection failed.' });
  }
};