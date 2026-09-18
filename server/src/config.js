const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mem;
async function connectDB(uri) {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (uri) {
    // Fail fast (10s) with a clear message instead of hanging 30s on a wrong URI.
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    return mongoose.connection;
  }
  mem = await MongoMemoryServer.create();
  await mongoose.connect(mem.getUri());
  return mongoose.connection;
}

async function closeDB() {
  await mongoose.disconnect();
  if (mem) {
    await mem.stop();
    mem = null;
  }
}

module.exports = { connectDB, closeDB };
