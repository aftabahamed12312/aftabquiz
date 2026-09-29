/**
 * Creates the first Admin, a Host, four houses with a leader each, and sample questions.
 * Safe to run more than once (existing records are left alone).
 *   npm run seed
 * CHANGE THESE PASSWORDS before a real event.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const House = require('./models/House');
const Question = require('./models/Question');
const GameState = require('./models/GameState');

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
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/gyanpunja_quiz');

  const ensureUser = async (data) => {
    if (await User.findOne({ username: data.username })) return console.log(`  exists: ${data.username}`);
    await User.create(data);
    console.log(`  created: ${data.username} / ${data.password}`);
  };

  console.log('Staff');
  await ensureUser({ name: 'Quiz Admin', username: 'admin', password: 'admin123', role: 'admin' });
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
  await mongoose.disconnect();
  console.log('Seed complete.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
