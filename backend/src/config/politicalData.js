/**
 * Political Data — Single source of truth for all party / leader information.
 *
 * Used by:
 *   - personDetectionService  (entity resolution by name/handle)
 *   - llmService               (dynamic prompt context: OUR + OPPOSITION)
 *   - grievanceController      (handle-based filtering across tagged + identified leaders)
 *
 * Adding/removing a leader anywhere in this file automatically flows through
 * detection, LLM prompting, storage, and UI filters — no other file needs editing.
 */

const normalizeHandle = (h) =>
  String(h || '').trim().replace(/^@/, '').toLowerCase();

const tagLeaders = (leaders, party, side) =>
  leaders.map((l) => {
    const handles = l.handles || [];
    const primary_handle = handles[0] || '';
    return {
      ...l,
      party,
      side, // 'ours' | 'opposition'
      primary_handle,
      primary_handle_normalized: normalizeHandle(primary_handle),
      handles_normalized: handles.map(normalizeHandle).filter(Boolean)
    };
  });

// ─────────────────────────────────────────────────────────
// OUR PARTY (Client) — INC, ruling party in Telangana
// ─────────────────────────────────────────────────────────
const OUR_PARTY = {
  id: 'inc',
  name: 'INC',
  full_name: 'Indian National Congress',
  aliases: ['Congress', 'Congress Party', 'INC', 'Hand symbol party'],
  alliance: 'INDIA',
  role: 'ruling',
  state: 'Telangana',
  chief: 'A. Revanth Reddy'
};

const _CABINET_RAW = [
  { id: 'revanth-reddy', name: 'A. Revanth Reddy', shortName: 'Revanth Reddy', role: 'Chief Minister', constituency: 'Kodangal', district: 'Vikarabad', handles: ['@revanth_anumula', '@TelanganaCMO'] },
  { id: 'bhatti-vikramarka', name: 'Mallu Bhatti Vikramarka', shortName: 'Bhatti Vikramarka', role: 'Deputy Chief Minister', constituency: 'Madhira', district: 'Khammam', handles: ['@Bhatti_Mallu'] },
  { id: 'sridhar-babu', name: 'D. Sridhar Babu', shortName: 'Sridhar Babu', role: 'Cabinet Minister', constituency: 'Manthani', district: 'Peddapalli', handles: ['@OffDSB', '@Min_SridharBabu'] },
  { id: 'venkat-reddy', name: 'Komatireddy Venkat Reddy', shortName: 'Venkat Reddy', role: 'Cabinet Minister', constituency: 'Nalgonda', district: 'Nalgonda', handles: ['@KomatireddyKVR'] },
  { id: 'ponnam-prabhakar', name: 'Ponnam Prabhakar', shortName: 'Ponnam Prabhakar', role: 'Cabinet Minister', constituency: 'Husnabad', district: 'Peddapalli', handles: ['@Ponnam_INC'] },
  { id: 'tummala', name: 'Tummala Nageshwara Rao', shortName: 'Tummala Nageshwara', role: 'Cabinet Minister', constituency: 'Khammam', district: 'Khammam', handles: ['@Tummala_INC'] },
  { id: 'uttam-kumar', name: 'N. Uttam Kumar Reddy', shortName: 'Uttam Kumar Reddy', role: 'Cabinet Minister', constituency: 'Huzurnagar', district: 'Suryapet', handles: ['@UttamINC'] },
  { id: 'jupally', name: 'Jupally Krishna Rao', shortName: 'Jupally Krishna Rao', role: 'Cabinet Minister', constituency: 'Kollapur', district: 'Nagarkurnool', handles: ['@jupallyk_rao'] },
  { id: 'damodar', name: 'Damodar Raja Narasimha', shortName: 'Damodar Narasimha', role: 'Cabinet Minister', constituency: 'Andole', district: 'Sangareddy', handles: ['@DamodarCilarapu'] },
  { id: 'seethakka', name: 'Danasari Anasuya (Seethakka)', shortName: 'Seethakka', role: 'Cabinet Minister', constituency: 'Mulug', district: 'Mulugu', handles: ['@seethakkaMLA'] },
  { id: 'konda-surekha', name: 'Konda Surekha', shortName: 'Konda Surekha', role: 'Cabinet Minister', constituency: 'Warangal East', district: 'Hanamkonda', handles: ['@iamkondasurekha'] },
  { id: 'ponguleti', name: 'Ponguleti Srinivasa Reddy', shortName: 'Ponguleti Srinivasa', role: 'Cabinet Minister', constituency: 'Palair', district: 'Khammam', handles: ['@INC_Ponguleti'] },
  { id: 'gaddam-vivekanand', name: 'Gaddam Vivekanand', shortName: 'Gaddam Vivekanand', role: 'Cabinet Minister', constituency: 'Chennur', district: 'Mancherial', handles: [] },
  { id: 'adluri-laxman', name: 'Adluri Laxman Kumar', shortName: 'Adluri Laxman', role: 'Cabinet Minister', constituency: 'Dharmapuri', district: 'Jagtial', handles: ['@minister_adluri'] },
  { id: 'vakiti-makthal', name: 'Vakiti Srihari', shortName: 'Vakiti Srihari', role: 'Cabinet Minister', constituency: 'Makthal', district: 'Narayanpet', handles: ['@Vakiti_srihari'] },
  { id: 'mohammad-azharuddin', name: 'Mohammad Azharuddin', shortName: 'Azharuddin', role: 'Cabinet Minister (MLC)', constituency: '', district: 'Hyderabad', handles: ['@azharflicks'] }
];

const _CONGRESS_MLAS_RAW = [
  { id: 'vamshi-krishna-achampet', name: 'Chikkudu Vamshi Krishna', shortName: 'Vamshi Krishna', role: 'MLA', constituency: 'Achampet', district: 'Nagarkurnool', handles: [] },
  { id: 'ilaiah-beerla', name: 'Ilaiah Beerla', shortName: 'Ilaiah Beerla', role: 'MLA', constituency: 'Alair', district: 'Yadadri', handles: [] },
  { id: 'adinarayana-jare', name: 'Adinarayana Jare', shortName: 'Adinarayana Jare', role: 'MLA', constituency: 'Aswaraopeta', district: 'Bhadradri Kothagudem', handles: [] },
  { id: 'gaddam-vinod', name: 'Gaddam Vinod', shortName: 'Gaddam Vinod', role: 'MLA', constituency: 'Bellampalli', district: 'Mancherial', handles: [] },
  { id: 'anil-kumar-bhongir', name: 'Kumbam Anil Kumar Reddy', shortName: 'Anil Kumar Reddy', role: 'MLA', constituency: 'Bhongir', district: 'Yadadri', handles: [] },
  { id: 'satyanarayana-bhupalpalle', name: 'Gandra Satyanarayana Rao', shortName: 'Gandra Satyanarayana', role: 'MLA', constituency: 'Bhupalpalle', district: 'Jayashankar Bhupalpally', handles: [] },
  { id: 'sudarshan-bodhan', name: 'P. Sudarshan Reddy', shortName: 'Sudarshan Reddy', role: 'MLA', constituency: 'Bodhan', district: 'Nizamabad', handles: [] },
  { id: 'medipally-sathyam', name: 'Medipally Sathyam', shortName: 'Medipally Sathyam', role: 'MLA', constituency: 'Choppadandi', district: 'Karimnagar', handles: [] },
  { id: 'balu-naik-devarakonda', name: 'Balu Naik Nenavath', shortName: 'Balu Naik', role: 'MLA', constituency: 'Devarakonda', district: 'Nalgonda', handles: [] },
  { id: 'gmr-devarkadra', name: 'Gavinolla Madhusudan Reddy', shortName: 'GMR Devarkadra', role: 'MLA', constituency: 'Devarkadra', district: 'Mahabubnagar', handles: [] },
  { id: 'jatoth-dornakal', name: 'Jatoth Ram Chander Naik', shortName: 'Jatoth Ram Naik', role: 'MLA', constituency: 'Dornakal', district: 'Mahabubabad', handles: [] },
  { id: 'malreddy-ibrahimpatnam', name: 'Malreddy Ranga Reddy', shortName: 'Malreddy Ranga', role: 'MLA', constituency: 'Ibrahimpatnam', district: 'Rangareddy', handles: [] },
  { id: 'anirudh-jadcherla', name: 'Anirudh Reddy Janampalli', shortName: 'Anirudh Reddy', role: 'MLA', constituency: 'Jadcherla', district: 'Mahabubnagar', handles: [] },
  { id: 'laxmikantha-jukkal', name: 'Laxmi Kantha Rao Thota', shortName: 'Laxmikantha Rao', role: 'MLA', constituency: 'Jukkal', district: 'Kamareddy', handles: [] },
  { id: 'narayan-kalwakurthy', name: 'Narayan Reddy Kasireddy', shortName: 'Narayan Reddy', role: 'MLA', constituency: 'Kalwakurthy', district: 'Nagarkurnool', handles: [] },
  { id: 'vedma-khanapur', name: 'Vedma Bhojju', shortName: 'Vedma Bhojju', role: 'MLA', constituency: 'Khanapur', district: 'Nirmal', handles: [] },
  { id: 'padmavathi-kodad', name: 'Nalamada Padmavathi Reddy', shortName: 'Padmavathi Reddy', role: 'MLA', constituency: 'Kodad', district: 'Suryapet', handles: [] },
  { id: 'murali-naik-mahabubabad', name: 'Dr. Murali Naik Bhukya', shortName: 'Murali Naik', role: 'MLA', constituency: 'Mahabubabad', district: 'Mahabubabad', handles: [] },
  { id: 'kavvampally-manakondur', name: 'Dr. Kavvampally Satyanarayana', shortName: 'Kavvampally', role: 'MLA', constituency: 'Manakondur', district: 'Rajanna Sircilla', handles: [] },
  { id: 'premsagar-mancherial', name: 'Kokkirala Premsagar Rao', shortName: 'Premsagar Rao', role: 'MLA', constituency: 'Mancherial', district: 'Mancherial', handles: [] },
  { id: 'mynampally-medak', name: 'Mynampally Rohith', shortName: 'Mynampally Rohith', role: 'MLA', constituency: 'Medak', district: 'Medak', handles: [] },
  { id: 'bathula-miryalaguda', name: 'Bathula Laxma Reddy', shortName: 'Bathula Laxma', role: 'MLA', constituency: 'Miryalaguda', district: 'Nalgonda', handles: [] },
  { id: 'raj-gopal-munugode', name: 'Komatireddy Raj Gopal Reddy', shortName: 'Raj Gopal Reddy', role: 'MLA', constituency: 'Munugode', district: 'Nalgonda', handles: [] },
  { id: 'jayaveer-nagarjunasagar', name: 'Kunduru Jayaveer', shortName: 'Kunduru Jayaveer', role: 'MLA', constituency: 'Nagarjuna Sagar', district: 'Nalgonda', handles: [] },
  { id: 'rajesh-nagarkurnool', name: 'Dr. Kuchkulla Rajesh Reddy', shortName: 'Rajesh Reddy', role: 'MLA', constituency: 'Nagarkurnool', district: 'Nagarkurnool', handles: [] },
  { id: 'veeresham-nakrekal', name: 'Vemula Veeresham', shortName: 'Vemula Veeresham', role: 'MLA', constituency: 'Nakrekal', district: 'Nalgonda', handles: [] },
  { id: 'sanjeeva-narayankhed', name: 'Patlolla Sanjeeva Reddy', shortName: 'Sanjeeva Reddy', role: 'MLA', constituency: 'Narayankhed', district: 'Sangareddy', handles: [] },
  { id: 'parnika-narayanpet', name: 'Chittem Parnika Reddy', shortName: 'Parnika Reddy', role: 'MLA', constituency: 'Narayanpet', district: 'Narayanpet', handles: [] },
  { id: 'madhava-narsampet', name: 'Donthi Madhava Reddy', shortName: 'Madhava Reddy', role: 'MLA', constituency: 'Narsampet', district: 'Warangal', handles: [] },
  { id: 'bhoopathi-nizamabad', name: 'Bhoopathi Reddy Rekulapally', shortName: 'Bhoopathi Reddy', role: 'MLA', constituency: 'Nizamabad Rural', district: 'Nizamabad', handles: [] },
  { id: 'yashaswini-palakurthi', name: 'Yashaswini Mamidala', shortName: 'Yashaswini', role: 'MLA', constituency: 'Palakurthi', district: 'Suryapet', handles: [] },
  { id: 'rammohan-pargi', name: 'Tammannagari Ram Mohan Reddy', shortName: 'Ram Mohan Reddy', role: 'MLA', constituency: 'Pargi', district: 'Vikarabad', handles: [] },
  { id: 'prakash-parkal', name: 'Revuri Prakash Reddy', shortName: 'Prakash Reddy', role: 'MLA', constituency: 'Parkal', district: 'Hanamkonda', handles: [] },
  { id: 'vijayaramana-peddapalle', name: 'Chinthakunta Vijaya Ramana Rao', shortName: 'Vijaya Ramana Rao', role: 'MLA', constituency: 'Peddapalle', district: 'Peddapalli', handles: [] },
  { id: 'payam-pinapaka', name: 'Payam Venkateswarlu', shortName: 'Payam Venkateswarlu', role: 'MLA', constituency: 'Pinapaka', district: 'Bhadradri Kothagudem', handles: [] },
  { id: 'makkan-ramagundam', name: 'Makkan Singh Raj Thakur', shortName: 'Makkan Singh', role: 'MLA', constituency: 'Ramagundam', district: 'Peddapalli', handles: [] },
  { id: 'ragamayee-sathupalle', name: 'Matta Ragamayee', shortName: 'Matta Ragamayee', role: 'MLA', constituency: 'Sathupalle', district: 'Khammam', handles: [] },
  { id: 'shankaraiah-shadnagar', name: 'K. Shankaraiah', shortName: 'K. Shankaraiah', role: 'MLA', constituency: 'Shadnagar', district: 'Rangareddy', handles: [] },
  { id: 'manohar-tandur', name: 'B. Manohar Reddy', shortName: 'Manohar Reddy', role: 'MLA', constituency: 'Tandur', district: 'Vikarabad', handles: [] },
  { id: 'samel-thungathurthi', name: 'Mandula Samel', shortName: 'Mandula Samel', role: 'MLA', constituency: 'Thungathurthi', district: 'Suryapet', handles: [] },
  { id: 'aadi-vemulawada', name: 'Aadi Srinivas', shortName: 'Aadi Srinivas', role: 'MLA', constituency: 'Vemulawada', district: 'Rajanna Sircilla', handles: [] },
  { id: 'prasad-vikarabad', name: 'Gaddam Prasad Kumar', shortName: 'Gaddam Prasad', role: 'MLA', constituency: 'Vikarabad', district: 'Vikarabad', handles: [] },
  { id: 'megha-wanaparthy', name: 'Megha Reddy Tudi', shortName: 'Megha Reddy', role: 'MLA', constituency: 'Wanaparthy', district: 'Wanaparthy', handles: [] },
  { id: 'naini-reddy', name: 'Naini Rajender Reddy', shortName: 'Naini Rajender', role: 'MLA', constituency: 'Warangal West', district: 'Hanamkonda', handles: ['@naini_rajender'] },
  { id: 'nagaraj-waradhanapet', name: 'K.R. Nagaraj', shortName: 'K.R. Nagaraj', role: 'MLA', constituency: 'Waradhanapet', district: 'Hanamkonda', handles: [] },
  { id: 'ramdas-wyra', name: 'Ramdas Maloth', shortName: 'Ramdas Maloth', role: 'MLA', constituency: 'Wyra', district: 'Khammam', handles: [] },
  { id: 'kanakaiah-yellandu', name: 'Koram Kanakaiah', shortName: 'Koram Kanakaiah', role: 'MLA', constituency: 'Yellandu', district: 'Bhadradri Kothagudem', handles: [] }
];

const CABINET_MINISTERS = tagLeaders(_CABINET_RAW, 'INC', 'ours');
const CONGRESS_MLAS = tagLeaders(_CONGRESS_MLAS_RAW, 'INC', 'ours');
const OUR_LEADERS = [...CABINET_MINISTERS, ...CONGRESS_MLAS];

// ─────────────────────────────────────────────────────────
// OPPOSITION PARTIES — extend freely, downstream auto-adapts
// ─────────────────────────────────────────────────────────
const _BRS_LEADERS_RAW = [
  { id: 'kcr', name: 'K. Chandrashekar Rao', shortName: 'KCR', aliases: ['KCR', 'Chandrashekar Rao'], role: 'Former CM / BRS Chief', constituency: 'Gajwel', district: 'Siddipet', handles: ['@KCRBRSPresident'] },
  { id: 'ktr', name: 'K. T. Rama Rao', shortName: 'KTR', aliases: ['KTR', 'Rama Rao'], role: 'BRS Working President', constituency: 'Sircilla', district: 'Rajanna Sircilla', handles: ['@KTRBRS'] },
  { id: 'harish-rao', name: 'T. Harish Rao', shortName: 'Harish Rao', aliases: ['Harish Rao'], role: 'BRS Senior Leader', constituency: 'Siddipet', district: 'Siddipet', handles: ['@BRSHarish'] }
];

const _BJP_LEADERS_RAW = [
  { id: 'modi', name: 'Narendra Modi', shortName: 'Modi', role: 'Prime Minister', constituency: 'Varanasi', district: 'Varanasi', handles: ['@narendramodi'] },
  { id: 'amit-shah', name: 'Amit Shah', shortName: 'Amit Shah', role: 'Union Home Minister', constituency: 'Gandhinagar', district: 'Gandhinagar', handles: ['@AmitShah'] },
  { id: 'kishan-reddy', name: 'G. Kishan Reddy', shortName: 'Kishan Reddy', role: 'Union Minister / TG BJP Chief', constituency: 'Secunderabad', district: 'Hyderabad', handles: ['@kishanreddybjp'] },
  { id: 'bandi-sanjay', name: 'Bandi Sanjay Kumar', shortName: 'Bandi Sanjay', role: 'Union MoS Home', constituency: 'Karimnagar', district: 'Karimnagar', handles: ['@bandisanjay_bjp'] },
  { id: 'eatala-rajender', name: 'Eatala Rajender', shortName: 'Eatala', role: 'BJP Leader', constituency: 'Malkajgiri', district: 'Medchal-Malkajgiri', handles: ['@Eatala_Rajender'] }
];

const _AIMIM_LEADERS_RAW = [
  { id: 'asaduddin-owaisi', name: 'Asaduddin Owaisi', shortName: 'Owaisi', role: 'AIMIM President / MP', constituency: 'Hyderabad', district: 'Hyderabad', handles: ['@asadowaisi'] },
  { id: 'akbaruddin-owaisi', name: 'Akbaruddin Owaisi', shortName: 'Akbaruddin', role: 'AIMIM Floor Leader / MLA', constituency: 'Chandrayangutta', district: 'Hyderabad', handles: ['@AkbarOwaisi_MIM'] }
];

const OPPOSITION_PARTIES = [
  {
    id: 'brs',
    name: 'BRS',
    full_name: 'Bharat Rashtra Samithi',
    // BRS was renamed from TRS (Telangana Rashtra Samithi) in 2022 — still
    // overwhelmingly referred to as "TRS" in everyday posts. Every alias here
    // MUST resolve to the opposition, same as a named BRS leader would.
    aliases: ['TRS', 'Telangana Rashtra Samithi', 'BRS', 'Car symbol party'],
    alliance: 'BRS',
    leaders: tagLeaders(_BRS_LEADERS_RAW, 'BRS', 'opposition')
  },
  { id: 'bjp', name: 'BJP', full_name: 'Bharatiya Janata Party', aliases: ['BJP', 'Bharatiya Janata Party', 'Lotus symbol party'], alliance: 'NDA', leaders: tagLeaders(_BJP_LEADERS_RAW, 'BJP', 'opposition') },
  { id: 'aimim', name: 'AIMIM', full_name: 'All India Majlis-e-Ittehadul Muslimeen', aliases: ['AIMIM', 'MIM', 'Majlis'], alliance: 'AIMIM', leaders: tagLeaders(_AIMIM_LEADERS_RAW, 'AIMIM', 'opposition') }
];

const OPPOSITION_LEADERS = OPPOSITION_PARTIES.flatMap((p) => p.leaders);

// ─────────────────────────────────────────────────────────
// UNIFIED LIST — used by personDetectionService
// ─────────────────────────────────────────────────────────
const ALL_LEADERS = [...OUR_LEADERS, ...OPPOSITION_LEADERS];

module.exports = {
  // Meta
  OUR_PARTY,
  OPPOSITION_PARTIES,
  // Tagged collections
  CABINET_MINISTERS,
  CONGRESS_MLAS,
  OUR_LEADERS,
  OPPOSITION_LEADERS,
  ALL_LEADERS,
  // Helpers
  normalizeHandle
};
