/**
 * Seed PolicyMapping categories (BNS legal sections + platform-policy mappings)
 * into MongoDB.
 *
 * Run:  node scripts/seed_policy_mappings.js
 *       node scripts/seed_policy_mappings.js --force   (overwrite existing)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const PolicyMapping = require('../src/models/PolicyMapping');

const categories = [
  {
    category_id: 'Communal_Violence',
    definition: 'Promotes or supports physical violence, riots or destruction between religious or communal groups.',
    legal_sections: [
      { id: 'BNS_196', code: '196', title: 'Promoting enmity between groups' },
      { id: 'BNS_351', code: '351', title: 'Criminal intimidation' },
      { id: 'BNS_353_2', code: '353(2)', title: 'Statements conducing to public mischief' }
    ],
    platform_policies: {
      youtube: [{ id: 'VIOLENT_GRAPHIC_CONTENT', name: 'Violent or Graphic Content' }],
      x: [{ id: 'VIOLENT_SPEECH', name: 'Violent Speech' }],
      facebook: [{ id: 'VIOLENCE_INCITEMENT', name: 'Violence and Incitement' }],
      instagram: [{ id: 'VIOLENCE_INCITEMENT', name: 'Violence and Incitement' }]
    },
    keywords: [],
    severity_level: 'High',
    is_active: true
  },
  {
    category_id: 'Hate_Speech',
    definition: 'Insults, dehumanises or promotes hatred against a protected group (religion, caste, community, ethnicity, nationality, etc.) without a physical threat.',
    legal_sections: [
      { id: 'BNS_196', code: '196', title: 'Promoting enmity between groups' },
      { id: 'BNS_299', code: '299', title: 'Religious insult' }
    ],
    platform_policies: {
      youtube: [{ id: 'HATE_SPEECH', name: 'Hate Speech' }],
      x: [{ id: 'HATEFUL_CONDUCT', name: 'Hateful Conduct' }],
      facebook: [{ id: 'HATE_SPEECH', name: 'Hate Speech' }],
      instagram: [{ id: 'HATE_SPEECH', name: 'Hate Speech' }]
    },
    keywords: [],
    severity_level: 'High',
    is_active: true
  },
  {
    category_id: 'Hate_Speech_Threat',
    definition: 'Hate speech with a direct or implied physical threat against a protected group.',
    legal_sections: [
      { id: 'BNS_196', code: '196', title: 'Promoting enmity between groups' },
      { id: 'BNS_351', code: '351', title: 'Criminal intimidation' }
    ],
    platform_policies: {
      youtube: [
        { id: 'HATE_SPEECH', name: 'Hate Speech' },
        { id: 'HARASSMENT_CYBERBULLYING', name: 'Harassment & Cyberbullying' }
      ],
      x: [
        { id: 'HATEFUL_CONDUCT', name: 'Hateful Conduct' },
        { id: 'VIOLENT_SPEECH', name: 'Violent Speech' }
      ],
      facebook: [
        { id: 'HATE_SPEECH', name: 'Hate Speech' },
        { id: 'VIOLENCE_INCITEMENT', name: 'Violence and Incitement' }
      ],
      instagram: [
        { id: 'HATE_SPEECH', name: 'Hate Speech' },
        { id: 'VIOLENCE_INCITEMENT', name: 'Violence and Incitement' }
      ]
    },
    keywords: [],
    severity_level: 'High',
    is_active: true
  },
  {
    category_id: 'Hate_Speech_Threat_Extremist',
    definition: 'Hate or violent content supporting extremist, terrorist or organised violent ideology.',
    legal_sections: [
      { id: 'BNS_152', code: '152', title: 'Endangering sovereignty or integrity' },
      { id: 'BNS_196', code: '196', title: 'Promoting enmity between groups' },
      { id: 'BNS_197', code: '197', title: 'Prejudicial to national integration' }
    ],
    platform_policies: {
      youtube: [{ id: 'VIOLENT_CRIMINAL_ORGS', name: 'Violent Criminal Organizations' }],
      x: [{ id: 'VIOLENT_SPEECH', name: 'Violent Speech' }],
      facebook: [{ id: 'DANGEROUS_ORGANIZATIONS', name: 'Dangerous Individuals and Organizations' }],
      instagram: [{ id: 'DANGEROUS_ORGANIZATIONS', name: 'Dangerous Individuals and Organizations' }]
    },
    keywords: [],
    severity_level: 'High',
    is_active: true
  },
  {
    category_id: 'Harassment',
    definition: 'Targeted hostile or intimidating behaviour against a specific person.',
    legal_sections: [
      { id: 'BNS_352', code: '352', title: 'Intentional insult provoking breach of peace' },
      { id: 'BNS_356', code: '356', title: 'Defamation' }
    ],
    platform_policies: {
      youtube: [{ id: 'HARASSMENT_CYBERBULLYING', name: 'Harassment & Cyberbullying' }],
      x: [{ id: 'ABUSE_HARASSMENT', name: 'Abuse and Harassment' }],
      facebook: [{ id: 'BULLYING_HARASSMENT', name: 'Bullying and Harassment' }],
      instagram: [{ id: 'BULLYING_HARASSMENT', name: 'Bullying and Harassment' }]
    },
    keywords: [],
    severity_level: 'Medium',
    is_active: true
  },
  {
    category_id: 'Abusive',
    definition: 'Personal insults, profanity or degrading remarks about a person or people (including vulgar family or sexualised slurs in any language), without threats and without protected-group targeting.',
    legal_sections: [
      { id: 'BNS_352', code: '352', title: 'Intentional insult provoking breach of peace' }
    ],
    platform_policies: {
      youtube: [{ id: 'HARASSMENT_CYBERBULLYING', name: 'Harassment & Cyberbullying' }],
      x: [{ id: 'ABUSE_HARASSMENT', name: 'Abuse and Harassment' }],
      facebook: [{ id: 'BULLYING_HARASSMENT', name: 'Bullying and Harassment' }],
      instagram: [{ id: 'BULLYING_HARASSMENT', name: 'Bullying and Harassment' }]
    },
    keywords: [],
    severity_level: 'High',
    is_active: true
  },
  {
    category_id: 'Sexual_Harassment',
    definition: 'Unwelcome sexual remarks or sexualised targeting.',
    legal_sections: [
      { id: 'BNS_72', code: '72', title: 'Sexual harassment' },
      { id: 'BNS_74', code: '74', title: 'Outraging modesty' },
      { id: 'BNS_79', code: '79', title: 'Insulting modesty of a woman' }
    ],
    platform_policies: {
      youtube: [{ id: 'HARASSMENT_CYBERBULLYING', name: 'Harassment & Cyberbullying' }],
      x: [
        { id: 'ABUSE_HARASSMENT', name: 'Abuse and Harassment' },
        { id: 'SENSITIVE_MEDIA', name: 'Sensitive Media' }
      ],
      facebook: [
        { id: 'BULLYING_HARASSMENT', name: 'Bullying and Harassment' },
        { id: 'SEXUAL_EXPLOITATION', name: 'Sexual Exploitation' }
      ],
      instagram: [
        { id: 'BULLYING_HARASSMENT', name: 'Bullying and Harassment' },
        { id: 'SEXUAL_EXPLOITATION', name: 'Sexual Exploitation' }
      ]
    },
    keywords: [],
    severity_level: 'High',
    is_active: true
  },
  {
    category_id: 'Sexual_Violence',
    definition: 'Threats or support of rape or sexual assault.',
    legal_sections: [
      { id: 'BNS_74', code: '74', title: 'Outraging modesty' },
      { id: 'BNS_351', code: '351', title: 'Criminal intimidation' }
    ],
    platform_policies: {
      youtube: [{ id: 'VIOLENT_GRAPHIC_CONTENT', name: 'Violent or Graphic Content' }],
      x: [
        { id: 'VIOLENT_SPEECH', name: 'Violent Speech' },
        { id: 'SENSITIVE_MEDIA', name: 'Sensitive Media' }
      ],
      facebook: [
        { id: 'VIOLENCE_INCITEMENT', name: 'Violence and Incitement' },
        { id: 'SEXUAL_EXPLOITATION', name: 'Sexual Exploitation' }
      ],
      instagram: [
        { id: 'VIOLENCE_INCITEMENT', name: 'Violence and Incitement' },
        { id: 'SEXUAL_EXPLOITATION', name: 'Sexual Exploitation' }
      ]
    },
    keywords: [],
    severity_level: 'High',
    is_active: true
  },
  {
    category_id: 'Sexual',
    definition: 'Sexual references without targeting or coercion.',
    legal_sections: [
      { id: 'BNS_74', code: '74', title: 'Outraging modesty' },
      { id: 'BNS_294', code: '294', title: 'Obscene acts and songs' }
    ],
    platform_policies: {
      youtube: [{ id: 'SEXUAL_CONTENT', name: 'Nudity and Sexual Content' }],
      x: [
        { id: 'SENSITIVE_MEDIA', name: 'Sensitive Media' },
        { id: 'ADULT_CONTENT', name: 'Adult Content' }
      ],
      facebook: [
        { id: 'SEXUAL_ACTIVITY', name: 'Sexual Activity' },
        { id: 'NUDITY', name: 'Adult Nudity' }
      ],
      instagram: [{ id: 'NUDITY', name: 'Nudity and Sexual Activity' }]
    },
    keywords: [],
    severity_level: 'Medium',
    is_active: true
  },
  {
    category_id: 'threat',
    definition: 'Direct threat of physical harm against a person or group (not identity-based).',
    legal_sections: [
      { id: 'BNS_351', code: '351', title: 'Criminal intimidation' }
    ],
    platform_policies: {
      youtube: [{ id: 'HARASSMENT_CYBERBULLYING', name: 'Harassment & Cyberbullying' }],
      x: [{ id: 'VIOLENT_SPEECH', name: 'Violent Speech' }],
      facebook: [{ id: 'VIOLENCE_INCITEMENT', name: 'Violence and Incitement' }],
      instagram: [{ id: 'VIOLENCE_INCITEMENT', name: 'Violence and Incitement' }]
    },
    keywords: [],
    severity_level: 'High',
    is_active: true
  },
  {
    category_id: 'threat_incitement',
    definition: 'Urging or mobilising others to commit violence.',
    legal_sections: [
      { id: 'BNS_351', code: '351', title: 'Criminal intimidation' },
      { id: 'BNS_353_2', code: '353(2)', title: 'Statements conducing to public mischief' }
    ],
    platform_policies: {
      youtube: [{ id: 'VIOLENT_GRAPHIC_CONTENT', name: 'Violent or Graphic Content' }],
      x: [{ id: 'VIOLENT_SPEECH', name: 'Violent Speech' }],
      facebook: [{ id: 'VIOLENCE_INCITEMENT', name: 'Violence and Incitement' }],
      instagram: [{ id: 'VIOLENCE_INCITEMENT', name: 'Violence and Incitement' }]
    },
    keywords: [],
    severity_level: 'High',
    is_active: true
  },
  {
    category_id: 'Normal',
    definition: 'News, complaints, political messaging, slogans, lyrics, praise, opinions or neutral discussion without abuse, threats, hate, sexual targeting or misinformation.',
    legal_sections: [],
    platform_policies: {
      youtube: [],
      x: [],
      facebook: [],
      instagram: []
    },
    keywords: [],
    severity_level: 'Low',
    is_active: true
  }
];

async function seed() {
  const force = process.argv.slice(2).includes('--force');

  try {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.DB_NAME });
    console.log('Connected to MongoDB');

    let inserted = 0, updated = 0, skipped = 0;
    for (const cat of categories) {
      const existing = await PolicyMapping.findOne({ category_id: cat.category_id });
      if (existing) {
        if (force) {
          existing.set(cat);
          await existing.save();
          console.log(`  UPDATE ${cat.category_id}`);
          updated++;
        } else {
          console.log(`  SKIP   ${cat.category_id} (already exists)`);
          skipped++;
        }
      } else {
        await PolicyMapping.create(cat);
        console.log(`  INSERT ${cat.category_id}`);
        inserted++;
      }
    }

    console.log(`\nDone — inserted: ${inserted}, updated: ${updated}, skipped: ${skipped}`);
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
