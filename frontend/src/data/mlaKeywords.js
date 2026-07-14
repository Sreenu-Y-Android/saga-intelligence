/**
 * MLA keyword registry for tracked politicians.
 *
 * Each entry extends the auto-defaults (name + shortName + constituency).
 * Fields:
 *   aliases  - name variants, role titles, common references used in social media
 *   handles  - official X/Twitter handles WITHOUT the @ prefix
 *              used both as posted_by_handle filter AND as @mention search terms
 *   party    - party abbreviations / names used in social media context
 *   topics   - scheme/issue monitoring terms (praise + criticism, EN + Telugu)
 *              that count toward this leader's relevance even with no name
 *              mention — e.g. "HYDRA demolitions" or "Rythu Bharosa delay"
 *              are about the CM's government even if he isn't named.
 *              Mirrors backend/scripts/seed_monitoring_keywords.js — keep in sync.
 *
 * Weights in keywordService.js:
 *   handle (5) > primary name (3) > alias (2) = topic (2) > party (1) > constituency (1)
 *
 * Handles below are web-verified against each leader's live X account (2026-07).
 * Ids match the ids in backend/src/config/politicalData.js and
 * telanganaMlaDirectory.js so the same person resolves consistently everywhere.
 */

const MLA_KEYWORD_OVERRIDES = {
  // ─── Chief Minister ────────────────────────────────────────────────────────
  'revanth-reddy': {
    aliases: [
      'CM Revanth', 'Chief Minister Revanth', 'CM of Telangana',
      'A Revanth Reddy', 'Revanth CM', 'TPCC Revanth',
      'Anumula Revanth Reddy', 'Anumula Revanth', 'CM Revanth Reddy',
      'Revanth Reddy CM', 'Telangana CM Revanth',
    ],
    handles: ['revanth_anumula', 'TelanganaCMO'],
    party: ['Congress', 'INC', 'TPCC', 'Telangana Congress', 'Indian National Congress'],
    topics: [
      // Criticism (EN)
      'six guarantees', 'six guarantees failure', 'loan waiver delay', 'Rythu Bharosa delay',
      'unemployment', 'job notifications delay', 'HYDRA demolitions', 'Musi River project controversy',
      'Musi beautification protests', 'land acquisition', 'corruption allegations', 'governance failure',
      'anti farmer', 'anti youth', 'power cuts', 'fiscal crisis', 'debt burden',
      'Praja Palana criticism', 'betrayal', 'administration failure',
      '#FailedPromises', '#CongressFailedTelangana', '#RevanthFailed', '#SaveTelangana', '#BrokenPromises',
      '#CongressFailures', '#TelanganaBetrayed', '#HYDRAVictims', '#StopHYDRA', '#MusiProject',
      '#MusiEvictions', '#JoblessYouth', '#FarmerIssues', '#LoanWaiverDelay', '#PrajaPalanaFailure',
      // Praise (EN)
      'Telangana Rising', 'investments', 'Praja Palana success', 'reforms', 'investment summit',
      'Future City Hyderabad', 'industrial growth', 'tourism development', 'farmer welfare',
      'economic growth', 'infrastructure',
      '#TelanganaRising', '#PrajaPalana', '#TelanganaDevelopment', '#FutureCity', '#InvestInTelangana',
      '#CongressForTelangana', '#TelanganaProgress', '#NewTelangana', '#PeopleFirstGovernance',
      '#TelanganaGrowth', '#RevanthForTelangana', '#TelanganaTransformation', '#DevelopingTelangana',
      // Criticism (Telugu)
      'రేవంత్ రెడ్డి హామీలు', 'రేవంత్ రెడ్డి ఆరు గ్యారంటీలు', 'కాంగ్రెస్ హామీలు అమలు కాలేదు',
      'రైతు రుణమాఫీ ఆలస్యం', 'రైతు భరోసా ఆలస్యం', 'రేవంత్ రెడ్డి నిరుద్యోగం', 'ఉద్యోగాల భర్తీ ఆలస్యం',
      'హైడ్రా కూల్చివేతలు', 'హైడ్రా వివాదం', 'మూసీ ప్రాజెక్ట్ వివాదం', 'మూసీ సుందరీకరణ వ్యతిరేకత',
      'కాంగ్రెస్ రైతు వ్యతిరేకం', 'కాంగ్రెస్ యువత వ్యతిరేకం', 'రేవంత్ పాలన వైఫల్యం', 'కాంగ్రెస్ మోసం తెలంగాణ',
      'నెరవేరని హామీలు', 'రేవంత్ రెడ్డి అప్పులు', 'విద్యుత్ కోతలు తెలంగాణ',
      '#హామీలమోసం', '#కాంగ్రెస్‌మోసం', '#రేవంత్‌విఫలం', '#హైడ్రాబాధితులు', '#మూసీవివాదం',
      '#రైతులసమస్యలు', '#నిరుద్యోగయువత', '#నెరవేరనిహామీలు',
      // Praise (Telugu)
      'రేవంత్ రెడ్డి అభివృద్ధి', 'తెలంగాణ రైజింగ్', 'ప్రజా పాలన విజయవంతం', 'రేవంత్ రెడ్డి పెట్టుబడులు',
      'రేవంత్ రెడ్డి ఉపాధి', 'కాంగ్రెస్ సంక్షేమం', 'తెలంగాణ అభివృద్ధి', 'భవిష్యత్ నగరం',
      'పారిశ్రామిక వృద్ధి తెలంగాణ', 'రైతు సంక్షేమం తెలంగాణ', 'రేవంత్ రెడ్డి సంస్కరణలు', 'తెలంగాణ ఆర్థిక వృద్ధి',
      '#రేవంత్‌రెడ్డి', '#ప్రజాపాలన', '#తెలంగాణఅభివృద్ధి', '#కొత్తతెలంగాణ', '#అభివృద్ధితెలంగాణ',
      '#తెలంగాణప్రగతి', '#తెలంగాణరైజింగ్',
      // Schemes / entities (neutral)
      'HYDRA Telangana', 'Musi River Project', 'Rythu Bharosa Telangana', 'Indiramma Housing',
      'Indiramma Illu', 'Mahalakshmi Scheme Telangana', 'Gruha Jyothi Telangana', 'Cheyutha Telangana',
      'Telangana CMO', 'Telangana Secretariat',
      '#IndirammaIllu', '#IndirammaHousing', '#RythuBharosa', '#MahalakshmiScheme', '#GruhaJyothi',
      '#Cheyutha', '#FreeBusScheme', '#TelanganaWelfare', '#TelanganaCM', '#TelanganaGovernment',
      '#RevanthReddyGovernment',
    ],
  },

  // ─── Deputy Chief Minister ─────────────────────────────────────────────────
  'bhatti-vikramarka': {
    aliases: [
      'Dy CM Bhatti', 'Deputy CM Bhatti', 'Vikramarka',
      'Bhatti Mallu', 'Mallu Bhatti', 'Finance Minister Telangana',
      'Deputy CM Vikramarka', 'Bhatti Vikramarka Finance',
      'Mallu Bhatti Vikramarka',
    ],
    handles: ['Bhatti_Mallu'],
    party: ['Congress', 'INC', 'TPCC', 'Telangana Congress'],
  },

  // ─── IT & Industries Minister ──────────────────────────────────────────────
  'sridhar-babu': {
    aliases: [
      'D Sridhar Babu', 'IT Minister Telangana', 'Sridhar Industries Minister',
      'Manthani MLA Sridhar', 'D Sridhar Babu IT', 'Industries Minister Telangana',
    ],
    handles: ['OffDSB', 'Min_SridharBabu'],
    party: ['Congress', 'INC', 'TPCC'],
  },

  // ─── Roads & Buildings Minister ────────────────────────────────────────────
  'venkat-reddy': {
    aliases: [
      'Komatireddy Venkat', 'Roads Minister Telangana', 'Komatireddy',
      'Venkat Roads', 'Komatireddy Venkat Reddy', 'Roads and Buildings Minister',
    ],
    handles: ['KomatireddyKVR'],
    party: ['Congress', 'INC', 'TPCC'],
  },

  // ─── Transport & BC Welfare Minister ───────────────────────────────────────
  'ponnam-prabhakar': {
    aliases: [
      'Ponnam', 'Ponnam Transport', 'Transport Minister Telangana',
      'Ponnam Husnabad', 'BC Welfare Minister', 'Transport & BC Welfare Minister',
    ],
    handles: ['Ponnam_INC'],
    party: ['Congress', 'INC', 'TPCC'],
  },

  // ─── Irrigation Minister ──────────────────────────────────────────────────
  'uttam-kumar': {
    aliases: [
      'Uttam Kumar', 'TPCC President Uttam', 'Irrigation Minister Telangana',
      'N Uttam Kumar', 'Uttam Huzurnagar', 'N Uttam Kumar Reddy',
      'TPCC President', 'Telangana PCC President Uttam',
    ],
    handles: ['UttamINC'],
    party: ['Congress', 'INC', 'TPCC'],
  },

  // ─── Agriculture Minister ──────────────────────────────────────────────────
  'tummala': {
    aliases: [
      'Tummala Nageshwara', 'Tummala Nageswara Rao', 'Agriculture Minister Telangana',
      'Tummala Khammam', 'Khammam MLA Tummala',
    ],
    handles: ['Tummala_INC'],
    party: ['Congress', 'INC', 'TPCC'],
  },

  // ─── Panchayat Raj & Women's Welfare Minister ──────────────────────────────
  'seethakka': {
    aliases: [
      'Anasuya Seethakka', 'Danasari Anasuya', 'Panchayat Raj Minister Telangana',
      'Seethakka Panchayat Raj', 'Danasari Seethakka', 'Mulug MLA Seethakka',
      'Women Child Welfare Minister',
    ],
    handles: ['seethakkaMLA'],
    party: ['Congress', 'INC', 'TPCC'],
  },

  // ─── Environment, Forests & Endowments Minister ────────────────────────────
  'konda-surekha': {
    aliases: [
      'Surekha Minister', 'Environment Minister Telangana', 'Konda Surekha Minister',
      'Warangal East MLA Surekha', 'Forest Minister Telangana',
    ],
    handles: ['iamkondasurekha'],
    party: ['Congress', 'INC', 'TPCC'],
  },

  // ─── Tourism & Culture Minister ───────────────────────────────────────────
  'jupally': {
    aliases: [
      'Jupally Krishna', 'Jupally Krishna Rao', 'Tourism Minister Telangana',
      'Kollapur MLA Jupally', 'Tourism Culture Minister', 'Excise Minister Telangana',
    ],
    handles: ['jupallyk_rao'],
    party: ['Congress', 'INC', 'TPCC'],
  },

  // ─── Health & Medical Minister ─────────────────────────────────────────────
  'damodar': {
    aliases: [
      'Damodar Raja', 'Damodar Narasimha', 'Health Minister Telangana',
      'Damodar Raja Narasimha', 'Andole MLA Damodar', 'Science Technology Minister',
    ],
    handles: ['DamodarCilarapu'],
    party: ['Congress', 'INC', 'TPCC'],
  },

  // ─── Revenue, Housing & IPR Minister ───────────────────────────────────────
  'ponguleti-palair': {
    aliases: [
      'Ponguleti Srinivasa Reddy', 'Ponguleti Srinivas Reddy', 'Revenue Minister Telangana',
      'Palair MLA Ponguleti', 'Housing Minister Telangana',
    ],
    handles: ['INC_Ponguleti'],
    party: ['Congress', 'INC', 'TPCC'],
  },

  // ─── Labour & Mines Minister ────────────────────────────────────────────────
  'gaddam-vivekanand': {
    aliases: [
      'Gaddam Vivekanand', 'G Vivekanand', 'Gaddam Vivek Venkatswamy',
      'Labour Minister Telangana', 'Chennur MLA Vivekanand', 'Mines Minister Telangana',
    ],
    handles: [],
    party: ['Congress', 'INC', 'TPCC'],
  },

  // ─── SC/ST & Disabilities Welfare Minister ─────────────────────────────────
  'adluri-laxman': {
    aliases: [
      'Adluri Laxman Kumar', 'SC Welfare Minister Telangana', 'Dharmapuri MLA Adluri',
      'Tribal Welfare Minister Telangana',
    ],
    handles: ['minister_adluri'],
    party: ['Congress', 'INC', 'TPCC'],
  },

  // ─── Animal Husbandry, Fisheries & Sports Minister ─────────────────────────
  'vakiti-makthal': {
    aliases: [
      'Vakiti Srihari', 'Animal Husbandry Minister Telangana', 'Makthal MLA Vakiti',
      'Sports Minister Telangana',
    ],
    handles: ['Vakiti_srihari'],
    party: ['Congress', 'INC', 'TPCC'],
  },

  // ─── Public Enterprises & Minorities Welfare Minister ──────────────────────
  'mohammad-azharuddin': {
    aliases: [
      'Mohammad Azharuddin', 'Mohammed Azharuddin', 'Azharuddin Minister',
      'Minorities Welfare Minister Telangana', 'MLC Azharuddin',
    ],
    handles: ['azharflicks'],
    party: ['Congress', 'INC', 'TPCC'],
  },

  // ─── Warangal West MLA (non-minister) ──────────────────────────────────────
  'naini-reddy': {
    aliases: [
      'Naini Rajender', 'Naini Rajender Reddy', 'Warangal West MLA Naini',
    ],
    handles: ['naini_rajender'],
    party: ['Congress', 'INC', 'TPCC'],
  },

  // ─── BRS Chief ──────────────────────────────────────────────────────────────
  'kcr': {
    aliases: [
      'KCR', 'Chandrashekar Rao', 'K Chandrashekar Rao', 'Former CM KCR',
      'BRS Chief KCR', 'BRS President',
    ],
    handles: ['KCRBRSPresident'],
    party: ['BRS', 'Bharat Rashtra Samithi'],
  },

  // ─── BRS Working President ─────────────────────────────────────────────────
  'ktr': {
    aliases: [
      'KTR', 'K T Rama Rao', 'Rama Rao', 'BRS Working President',
    ],
    handles: ['KTRBRS'],
    party: ['BRS', 'Bharat Rashtra Samithi'],
  },

  // ─── BRS Senior Leader ──────────────────────────────────────────────────────
  'harish-rao': {
    aliases: [
      'Harish Rao', 'T Harish Rao', 'Siddipet MLA Harish Rao',
    ],
    handles: ['BRSHarish'],
    party: ['BRS', 'Bharat Rashtra Samithi'],
  },

  // ─── BJP Senior Leader ──────────────────────────────────────────────────────
  't-raja-singh': {
    aliases: [
      'Raja Singh', 'T Raja Singh', 'Goshamahal MLA Raja Singh',
    ],
    handles: ['TigerRajaSingh'],
    party: ['BJP', 'Bharatiya Janata Party'],
  },

  // ─── BJP Floor Leader ───────────────────────────────────────────────────────
  'alleti-maheshwar-reddy': {
    aliases: [
      'Alleti Maheshwar Reddy', 'Maheshwar Reddy', 'Nirmal MLA Alleti', 'BJP Floor Leader',
    ],
    handles: ['maheshreddy_bjp'],
    party: ['BJP', 'Bharatiya Janata Party'],
  },

  // ─── AIMIM Floor Leader ─────────────────────────────────────────────────────
  'akbaruddin-owaisi': {
    aliases: [
      'Akbaruddin Owaisi', 'Akbaruddin', 'Chandrayangutta MLA Akbaruddin',
    ],
    handles: ['AkbarOwaisi_MIM'],
    party: ['AIMIM', 'Majlis'],
  },

  // ─── AIMIM Senior Leader ────────────────────────────────────────────────────
  'majid-hussain': {
    aliases: [
      'Majid Hussain', 'Mohammed Majid Hussain', 'Nampally MLA Majid Hussain',
    ],
    handles: ['Md_MajidHussain'],
    party: ['AIMIM', 'Majlis'],
  },
};

export default MLA_KEYWORD_OVERRIDES;
