const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const User = require('./src/models/User');
const { buildEmailLookup, normalizeEmail } = require('./src/utils/authIdentity');

async function createAdmin() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        
        const email = normalizeEmail(process.env.DEFAULT_ADMIN_EMAIL || 'bcss@blurasaga.com');
        const password = process.env.DEFAULT_ADMIN_PASSWORD || '#Punjab@SAGA2026';
        const fullName = process.env.DEFAULT_ADMIN_NAME || 'BCSS Super Admin';
        const role = 'superadmin';
        const legacyEmails = ['admin@punjabsaga.com', 'admin@blurahub.com', 'admin@blurasaga.com'];

        // Check if user exists
        const userExists = await User.findOne({
            $or: [email, ...legacyEmails.map(normalizeEmail)].map((candidateEmail) => ({
                email: buildEmailLookup(candidateEmail)
            }))
        });
        if (userExists) {
            console.log('User already exists. Updating email, password, and role...');
            const salt = await bcrypt.genSalt(10);
            userExists.email = email;
            userExists.password = await bcrypt.hash(password, salt);
            userExists.role = role;
            userExists.full_name = fullName;
            await userExists.save();
            console.log('User updated successfully.');
        } else {
            console.log('Creating new superadmin user...');
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            
            await User.create({
                email,
                password: hashedPassword,
                full_name: fullName,
                role: role
            });
            console.log('Superadmin user created successfully.');
        }
        
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

createAdmin();
