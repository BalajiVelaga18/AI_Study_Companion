const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { connectDB } = require('./config');
const { User } = require('./models');

(async () => {
  await connectDB(process.env.MONGO_URI);
  for (const [email, role, pw] of [['admin@demo.local', 'admin', 'admin123'], ['user@demo.local', 'user', 'user123']]) {
    if (!await User.findOne({ email })) await User.create({ email, role, passwordHash: bcrypt.hashSync(pw, 10) });
  }
  console.log('seeded admin@demo.local / user@demo.local');
  process.exit(0);
})();
