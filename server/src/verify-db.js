// npm --workspace server run verify — proves the app talks to YOUR MongoDB.
// Open the same MONGO_URI in Compass: you should see this DB + collections.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('./config');

(async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is empty in .env — set it to your own URI first.');
    process.exit(1);
  }
  const safe = uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:<hidden>@');
  console.log('connecting to:', safe);
  const conn = await connectDB(uri);
  console.log('connected. DB name:', conn.name, '| host:', `${conn.host}:${conn.port}`);
  const cols = await mongoose.connection.db.listCollections().toArray();
  if (!cols.length) console.log('no collections yet — register a user / run seed to create data.');
  for (const c of cols.map((x) => x.name).sort()) {
    const n = await mongoose.connection.db.collection(c).countDocuments();
    console.log(`- ${c}: ${n} doc(s)`);
  }
  console.log('\nOpen this exact URI in MongoDB Compass to browse the same data.');
  process.exit(0);
})().catch((e) => { console.error('verify failed:', e.message); process.exit(1); });
