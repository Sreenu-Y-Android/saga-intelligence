require('dotenv').config();
const mongoose = require('mongoose');
const Grievance = require('./src/models/Grievance');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://vamsiworkspace54_db_user:fFFXbSGICBaWnY7p@cluster0.zoko5u5.mongodb.net/punjab-government?appName=Cluster0';

async function run() {
    try {
        console.log(`Connecting to MongoDB...`);
        await mongoose.connect(MONGODB_URI);
        console.log(`Connected to MongoDB.`);

        const count = await Grievance.countDocuments();
        console.log(`Current grievance count: ${count}`);

        console.log(`Deleting all grievances...`);
        const result = await Grievance.deleteMany({});
        console.log(`Deleted ${result.deletedCount} grievances.`);

        console.log(`Grievances cleared successfully.`);
        process.exit(0);
    } catch (error) {
        console.error(`Script failed:`, error);
        process.exit(1);
    }
}

run();
