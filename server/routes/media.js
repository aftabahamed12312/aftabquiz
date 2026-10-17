const router = require('express').Router();
const mongoose = require('mongoose');

router.get('/:id', (req, res, next) => {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) {
    return res.status(404).json({ message: 'Media not found.' });
  }

  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'media' });
  const download = bucket.openDownloadStream(new mongoose.Types.ObjectId(req.params.id));
  download.on('file', (file) => {
    res.set('Content-Type', file.metadata?.contentType || 'application/octet-stream');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
  });
  download.on('error', (error) => {
    if (res.headersSent) return res.destroy(error);
    if (error.code === 'ENOENT') return res.status(404).json({ message: 'Media not found.' });
    next(error);
  });
  download.pipe(res);
});

module.exports = router;
