/**
 * Delete grievances that do NOT contain any specific Bandi Sanjay Kumar terms.
 * This removes the accumulated garbage from BEFORE the keyword filter was fixed.
 *
 * Run: node scripts/cleanup-garbage-grievances.js
 * WARNING: This DELETES documents. Review the dry-run output first.
 */
require('dotenv').config();
const mongoose = require('mongoose');

// A grievance is considered "relevant" if its text contains ANY of these terms.
// Everything else is garbage and will be deleted.
const RELEVANT_TERMS = [
  'bandi sanjay',
  'bandisanjay',
  'bsk',
  'sanjay kumar',
  'బండి సంజయ్',
  'बंडी संजय',
  'भगीरथ',
  'bhageerath',
  'bhagirath',
  'karimnagar mp',
  'కరీంనగర్ ఎంపీ',
  'करिमनगर',
  '@bandisanjay_bjp',
  '#bandisanjay',
  '#bandisanjaykumar',
  '#bandimustresign',
  '#bandisanjaymustresign',
  '#bandibhageerath',
  '#bandibhagirath',
  '#bandibageerath',
  '#saibhagirath',
  '#bandisonabsconding',
  '#bjpcongressbhaibhai',
  '#karimnagarmp',
  'bandi_sanjay_dhf_ravi',
  'bjp telangana president',
  'bandi sanjay murder',
  'kill bandi sanjay',
  'bandi sanjay abuse',
  'bandi sanjay arrest',
  'bandi sanjay shielding son',
  'bandi sanjay protecting son',
  'congress bjp nexus bandi',
  'phone switched off bandi',
];

const DRY_RUN = process.argv.includes('--dry-run');

async function run() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bsk-watch';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  const Grievance = require('../src/models/Grievance');

  const allGrievances = await Grievance.find({}).select('_id content.text tweet_id platform tagged_account').lean();
  console.log(`Total grievances in DB: ${allGrievances.length}`);

  const toDelete = [];

  for (const g of allGrievances) {
    const text = String(g.content?.text || g.content?.full_text || '').toLowerCase().normalize('NFKC');
    const isRelevant = RELEVANT_TERMS.some(term => text.includes(term.toLowerCase().normalize('NFKC')));

    if (!isRelevant) {
      toDelete.push({
        _id: g._id,
        tweet_id: g.tweet_id,
        text: String(g.content?.text || '').substring(0, 100),
        platform: g.platform,
        tagged_account: g.tagged_account
      });
    }
  }

  console.log(`\nGarbage grievances to DELETE: ${toDelete.length}`);

  if (toDelete.length > 0) {
    console.log('\nFirst 10 examples of what will be deleted:');
    toDelete.slice(0, 10).forEach(g => {
      console.log(`  [${g.platform}] ${g.text}... (tagged: ${g.tagged_account})`);
    });
  }

  if (DRY_RUN) {
    console.log('\nDRY RUN — no deletions performed. Remove --dry-run to actually delete.');
    await mongoose.disconnect();
    return;
  }

  if (toDelete.length === 0) {
    console.log('Nothing to delete.');
    await mongoose.disconnect();
    return;
  }

  const idsToDelete = toDelete.map(g => g._id);
  const result = await Grievance.deleteMany({ _id: { $in: idsToDelete } });
  console.log(`\nDeleted ${result.deletedCount} garbage grievances`);

  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
