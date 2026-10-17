const router = require('express').Router();
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const House = require('../models/House');
const Round = require('../models/Round');
const Question = require('../models/Question');
const ActivityLog = require('../models/ActivityLog');
const asyncHandler = require('../utils/asyncHandler');
const { auth, requireRole } = require('../middleware/auth');

router.use(auth, requireRole('super_admin'));

const tenantView = (tenant, counts = null, admin = tenant.admin) => ({
  _id: tenant._id,
  title: tenant.title,
  slug: tenant.slug,
  active: tenant.active,
  createdAt: tenant.createdAt,
  admin: admin && typeof admin === 'object' && admin.username
    ? { name: admin.name, username: admin.username }
    : null,
  counts,
});

async function countsFor(tenantId) {
  const filter = { tenantId };
  const [users, houses, rounds, questions, activity] = await Promise.all([
    User.countDocuments(filter),
    House.countDocuments(filter),
    Round.countDocuments(filter),
    Question.countDocuments(filter),
    ActivityLog.countDocuments(filter),
  ]);
  return { users, houses, rounds, questions, activity };
}

router.patch(
  '/password',
  asyncHandler(async (req, res) => {
    const currentPassword = String(req.body.currentPassword || '');
    const password = String(req.body.password || '');
    if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    const user = await User.findById(req.user._id).select('+password');
    if (!user || !(await user.comparePassword(currentPassword))) {
      return res.status(401).json({ message: 'Current password is incorrect.' });
    }
    user.password = password;
    user.tokenVersion += 1;
    await user.save();
    res.json({ ok: true });
  })
);

router.get(
  '/tenants',
  asyncHandler(async (req, res) => {
    const tenants = await Tenant.find().populate('admin', 'name username').sort({ createdAt: 1 }).lean();
    res.json(await Promise.all(tenants.map(async (tenant) => tenantView(tenant, await countsFor(tenant._id)))));
  })
);

router.post(
  '/tenants',
  asyncHandler(async (req, res) => {
    const title = String(req.body.title || '').trim();
    const adminName = String(req.body.adminName || '').trim();
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!title) return res.status(400).json({ message: 'Quiz title is required.' });
    if (!adminName) return res.status(400).json({ message: 'Admin name is required.' });
    if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username)) {
      return res.status(400).json({ message: 'Admin username must be 3–30 characters using letters, numbers, dots, underscores, or hyphens.' });
    }
    if (password.length < 8) return res.status(400).json({ message: 'Admin password must be at least 8 characters.' });

    const baseSlug = title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'quiz';
    let slug = baseSlug;
    let suffix = 2;
    while (await Tenant.exists({ slug })) slug = `${baseSlug.slice(0, 56)}-${suffix++}`;

    const tenant = await Tenant.create({ title, slug });
    let admin = null;
    try {
      admin = await User.create({
        name: adminName,
        username,
        password,
        role: 'admin',
        tenantId: tenant._id,
      });
      tenant.admin = admin._id;
      await tenant.save();
      res.status(201).json(tenantView(tenant, await countsFor(tenant._id), admin));
    } catch (error) {
      if (admin) await User.deleteOne({ _id: admin._id });
      await Tenant.deleteOne({ _id: tenant._id });
      throw error;
    }
  })
);

router.patch(
  '/tenants/:id/status',
  asyncHandler(async (req, res) => {
    if (typeof req.body.active !== 'boolean') {
      return res.status(400).json({ message: 'Set active to true or false.' });
    }
    const tenant = await Tenant.findByIdAndUpdate(
      req.params.id,
      { $set: { active: req.body.active } },
      { new: true, runValidators: true }
    );
    if (!tenant) return res.status(404).json({ message: 'Quiz not found.' });
    const admin = tenant.admin ? await User.findById(tenant.admin).select('name username') : null;
    res.json(tenantView(tenant, await countsFor(tenant._id), admin));
  })
);

router.post(
  '/tenants/:id/admin-password',
  asyncHandler(async (req, res) => {
    const password = String(req.body.password || '');
    if (password.length < 8) return res.status(400).json({ message: 'Admin password must be at least 8 characters.' });
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ message: 'Quiz not found.' });
    const admin = tenant.admin ? await User.findById(tenant.admin) : null;
    if (!admin || admin.tenantId?.toString() !== tenant._id.toString() || admin.role !== 'admin') {
      return res.status(409).json({ message: 'This quiz does not have a valid Admin account.' });
    }
    admin.password = password;
    admin.tokenVersion += 1;
    await admin.save();
    res.json({ ok: true });
  })
);

module.exports = router;
