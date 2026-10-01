const router = require('express').Router();
const Question = require('../models/Question');
const asyncHandler = require('../utils/asyncHandler');
const { auth, requireRole } = require('../middleware/auth');
const game = require('../services/game');
const Round = require('../models/Round');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

router.use(auth);

const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const allowedMedia = new Map([
  ['image/jpeg', '.jpg'], ['image/png', '.png'], ['image/webp', '.webp'], ['image/gif', '.gif'],
  ['audio/mpeg', '.mp3'], ['audio/mp4', '.m4a'], ['audio/wav', '.wav'], ['audio/x-wav', '.wav'],
  ['audio/ogg', '.ogg'], ['audio/webm', '.webm'], ['audio/aac', '.aac'],
]);
const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${allowedMedia.get(file.mimetype) || ''}`),
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, allowedMedia.has(file.mimetype)),
});

async function pick(b) {
  const data = {};
  let selectedRound = null;
  for (const key of ['questionText', 'correctAnswer', 'difficulty', 'imageUrl', 'audioUrl']) {
    if (b[key] !== undefined) data[key] = b[key];
  }
  if (b.roundId !== undefined) {
    selectedRound = b.roundId ? await Round.findById(b.roundId) : null;
    if (b.roundId && !selectedRound) throw Object.assign(new Error('Round not found.'), { status: 400 });
    data.round = selectedRound ? selectedRound._id : null;
  }
  if (b.category !== undefined) data.category = b.category;
  if (!selectedRound && b.roundId === undefined && b.category) {
    selectedRound = await Round.findOne({ nameKey: String(b.category).trim().toLowerCase() });
    if (selectedRound) data.round = selectedRound._id;
  }
  if (selectedRound) data.category = selectedRound.name;
  if (b.approved !== undefined) data.approved = Boolean(b.approved);
  return data;
}

// Admin sees the whole bank. Host only ever sees the approved pool.
router.get(
  '/',
  requireRole('admin', 'host'),
  asyncHandler(async (req, res) => {
    const questions = await Question.find().populate('round').sort({ createdAt: 1 });
    questions.sort(
      (a, b) =>
        (a.round?.order ?? 9999) - (b.round?.order ?? 9999) ||
        a.createdAt - b.createdAt ||
        String(a._id).localeCompare(String(b._id))
    );
    const numbered = questions.map((question, index) => ({
      ...question.toObject(),
      questionNumber: index + 1,
    }));
    const visible = numbered.filter(
      (question) =>
        (req.user.role !== 'host' || question.approved) &&
        (!req.query.status || question.status === req.query.status) &&
        (!req.query.category || question.category === req.query.category)
    );
    res.json(visible);
  })
);

router.post('/media', requireRole('admin'), (req, res, next) => {
  mediaUpload.single('file')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ message: 'Upload failed. Images and audio must be supported files no larger than 15 MB.' });
      }
      return next(err);
    }
    if (!req.file) return res.status(400).json({ message: 'Choose a supported image or audio file (maximum 15 MB).' });
    res.status(201).json({ url: `/uploads/${req.file.filename}` });
  });
});

router.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const q = await Question.create(await pick(req.body));
    await game.log(req.user, 'question_created', q.questionText);
    res.status(201).json(q);
  })
);

// Bulk import: { questions: [{ category, questionText, correctAnswer, difficulty }] }
router.post(
  '/bulk',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const list = Array.isArray(req.body.questions) ? req.body.questions : [];
    if (!list.length) return res.status(400).json({ message: 'Provide a non-empty "questions" array.' });
    const created = await Question.insertMany(await Promise.all(list.map(pick)), { ordered: true });
    await game.log(req.user, 'questions_imported', `${created.length} questions`);
    res.status(201).json({ count: created.length });
  })
);

router.patch(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const update = await pick(req.body);
    Object.keys(update).forEach((k) => update[k] === undefined && delete update[k]);
    const q = await Question.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!q) return res.status(404).json({ message: 'Question not found.' });
    await q.populate('round');
    res.json(q);
  })
);

router.patch(
  '/:id/approve',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const q = await Question.findByIdAndUpdate(
      req.params.id,
      { approved: Boolean(req.body.approved) },
      { new: true }
    );
    if (!q) return res.status(404).json({ message: 'Question not found.' });
    await game.log(req.user, q.approved ? 'question_approved' : 'question_unapproved', q.questionText);
    res.json(q);
  })
);

router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const state = await game.loadState();
    if (state && state.currentQuestion && String(state.currentQuestion._id) === req.params.id) {
      return res.status(409).json({ message: 'This question is on stage right now. Clear it first.' });
    }
    await Question.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  })
);

module.exports = router;
