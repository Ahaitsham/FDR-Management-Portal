require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const Institution = require('../models/Institution');

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD in .env');

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      console.log('Admin already exists, skipping');
    } else {
      await User.create({
        name: 'System Admin',
        email,
        role: 'ADMIN',
        passwordHash: await bcrypt.hash(password, 12),
        mustChangePassword: false
      });
      console.log('Admin created:', email);
    }

//sample instituition
    const sample = await Institution.findOne({ aicteId: 'DEMO-AICTE-0001' });
    if (!sample) {
      const inst = await Institution.create({
        name: 'Demo Institute of Technology',
        aicteId: 'DEMO-AICTE-0001',
        type: 'ENGINEERING',
        address: { city: 'Navi Mumbai', state: 'Maharashtra' }
      });
      console.log('Sample institution id:', inst._id.toString());
    }
  } catch (err) {
    console.error('Seed failed:', err.message);
  } finally {
    await mongoose.disconnect();
  }
}

seed();