/**
 * Provisions the development Super Admin and the example quiz, and assigns
 * legacy single-quiz records to that quiz.
 *   npm run seed
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Tenant = require('./models/Tenant');
const House = require('./models/House');
const Round = require('./models/Round');
const Question = require('./models/Question');
const GameState = require('./models/GameState');
const ActivityLog = require('./models/ActivityLog');
const { runWithTenant } = require('./middleware/tenantContext');

const HOUSES = [
  { name: 'Ruby', color: '#d64550', username: 'ruby', password: 'ruby123' },
  { name: 'Sapphire', color: '#3478d4', username: 'sapphire', password: 'sapphire123' },
  { name: 'Emerald', color: '#1f9d6b', username: 'emerald', password: 'emerald123' },
  { name: 'Amber', color: '#f4a712', username: 'amber', password: 'amber123' },
];

const QUESTIONS = [
  ['General Knowledge', 'What is the capital city of France?', 'Paris', 'easy'],
  ['Science', 'What planet is known as the Red Planet?', 'Mars', 'easy'],
  ['Mathematics', 'What is 12 multiplied by 8?', '96', 'easy'],
  ['Geography', 'Which is the largest ocean on Earth?', 'Pacific Ocean', 'medium'],
  ['History', 'Who was the first person to walk on the Moon?', 'Neil Armstrong', 'medium'],
  ['Science', 'What gas do plants absorb from the atmosphere?', 'Carbon dioxide', 'medium'],
  ['Literature', 'Who wrote Romeo and Juliet?', 'William Shakespeare', 'medium'],
  ['Geography', 'What is the longest river in South America?', 'Amazon River', 'hard'],
];

async function run() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) throw new Error('MONGO_URI is missing. Set it to a reachable MongoDB connection string.');
  await mongoose.connect(mongoUri);

  let tenant = await Tenant.findOne({ slug: 'gyanpunja-quiz' });
  if (!tenant) tenant = await Tenant.create({ title: 'Gyanpunja Quiz', slug: 'gyanpunja-quiz' });

  await User.updateMany(
    { tenantId: null, role: { $ne: 'super_admin' } },
    { $set: { tenantId: tenant._id } }
  );
  for (const Model of [House, Round, Question, GameState, ActivityLog]) {
    await Model.updateMany({ tenantId: null }, { $set: { tenantId: tenant._id } });
  }
  for (const Model of [House, Round, GameState]) await Model.syncIndexes();

  let superAdmin = await User.findOne({ username: 'superadmin' }).select('+password');
  if (!superAdmin) {
    superAdmin = await User.create({
      name: 'Super Admin',
      username: 'superadmin',
      password: 'superadmin123',
      role: 'super_admin',
      tenantId: null,
    });
    console.log('Created development Super Admin account: superadmin');
  } else if (superAdmin.role !== 'super_admin') {
    throw new Error('Username "superadmin" is already in use by a non-Super Admin account.');
  } else {
    if (superAdmin.tenantId) {
      superAdmin.tenantId = null;
      await superAdmin.save();
    }
    console.log('Super Admin account exists; password unchanged.');
  }

  await runWithTenant(tenant._id, async () => {
    const ensureUser = async (data) => {
      let user = await User.findOne({ username: data.username });
      if (user) {
        if (user.role !== data.role) {
          throw new Error(`Seeded username "${data.username}" already has the role "${user.role}".`);
        }
        console.log(`  exists: ${data.username}`);
        return user;
      }
      user = await User.create(data);
      console.log(`  created: ${data.username}`);
      return user;
    };

    console.log(`Quiz: ${tenant.title}`);
    const admin = await ensureUser({ name: 'Quiz Admin', username: 'admin', password: 'admin123', role: 'admin' });
    tenant.admin = admin._id;
    await tenant.save();
    await ensureUser({ name: 'Quiz Host', username: 'host', password: 'host123', role: 'host' });

    console.log('Houses');
    for (const h of HOUSES) {
      let house = await House.findOne({ name: h.name });
      if (!house) house = await House.create({ name: h.name, color: h.color });
      await ensureUser({
        name: `${h.name} Leader`,
        username: h.username,
        password: h.password,
        role: 'house_leader',
        house: house._id,
      });
    }

    if ((await Question.countDocuments()) === 0) {
      await Question.insertMany(
        QUESTIONS.map(([category, questionText, correctAnswer, difficulty]) => ({
          category,
          questionText,
          correctAnswer,
          difficulty,
        }))
      );
      console.log(`Questions: added ${QUESTIONS.length} samples`);
    } else {
      console.log('Questions: bank not empty, skipped');
    }

    await GameState.updateOne({ key: 'main' }, { $setOnInsert: { key: 'main' } }, { upsert: true });
  });

  await mongoose.disconnect();
  console.log('Seed complete. Change the Super Admin password before deployment.');
}

run().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
