const { app, connectDatabase } = require('../server/server');

module.exports = async (req, res) => {
  try {
    await connectDatabase();
    app(req, res);
  } catch (error) {
    console.error('Serverless request setup failed:', error);
    res.status(503).json({ message: 'The quiz service is temporarily unavailable.' });
  }
};
