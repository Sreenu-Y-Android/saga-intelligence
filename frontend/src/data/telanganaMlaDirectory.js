import { TELANGANA_MINISTERS } from './telanganaMinistersData';

export const MLA_PARTY_META = {
  INC: {
    label: 'INC',
    fullName: 'Indian National Congress',
    color: '#2563eb',
    accent: 'from-blue-500/10 to-transparent',
  },
  BRS: {
    label: 'BRS',
    fullName: 'Bharat Rashtra Samithi',
    color: '#ec4899',
    accent: 'from-pink-500/10 to-transparent',
  },
  BJP: {
    label: 'BJP',
    fullName: 'Bharatiya Janata Party',
    color: '#f97316',
    accent: 'from-orange-500/10 to-transparent',
  },
  AIMIM: {
    label: 'AIMIM',
    fullName: 'All India Majlis-e-Ittehadul Muslimeen',
    color: '#059669',
    accent: 'from-emerald-500/10 to-transparent',
  },
  CPI: {
    label: 'CPI',
    fullName: 'Communist Party of India',
    color: '#dc2626',
    accent: 'from-rose-500/10 to-transparent',
  },
};

const PARTY_WISE_IMAGE_FILES = {
  AIMIM: [
    'SRI  AHMED BIN ABDULLAH BALALA.jpg',
    'SRI  AKBAR UDDIN OWAISI.jpg',
    'SRI  JAFFAR HUSSAIN.jpg',
    'SRI  KAUSAR MOHIUDDIN.jpg',
    'SRI  MIR ZULFEQAR ALI.jpg',
    'SRI  MOHAMMED  MUBEEN.jpg',
    'SRI  MOHAMMED MAJID HUSSAIN.jpg',
  ],
  BJP: [
    'PALVAI HARISH BABU.jpg',
    'SRI  ALLETI MAHESHWAR REDDY.jpg',
    'SRI  DHANPAL SURYANARAYANA.jpg',
    'SRI  KATIPALLY VENKATA RAMANA REDDY.jpg',
    'SRI  PAIDI RAKESH REDDY.jpg',
    'SRI  PAYAL SHANKER.jpg',
    'SRI  RAM RAO PAWAR.jpg',
    'SRI  T. RAJA SINGH.jpg',
  ],
  BRS: [
    'KOVA LAXMI.jpg',
    'PATLOLLA SABITHA INDRA REDDY.jpg',
    'SRI  ANIL JADHAV.jpg',
    'SRI  AREKAPUDI GANDHI.jpg',
    'SRI  BANDARI LAKSHMA REDDY.jpg',
    'SRI  BANDLA KRISHNA MOHAN REDDY.jpg',
    'SRI  CHAMAKURA MALLA REDDY.jpg',
    'SRI  CHINTA PRABHAKAR.jpg',
    'SRI  DANAM NAGENDER.jpg',
    'SRI  DEVIREDDY SUDHIR REDDY.jpg',
    'SRI  DR. SANJAY.jpg',
    'SRI  GANGULA KAMALAKAR.jpg',
    'SRI  GUDEM MAHIPAL REDDY.jpg',
    'SRI  GUNTAKANDLA JAGADISH REDDY.jpg',
    'SRI  K.P. VIVEKANAND.jpg',
    'SRI  KADIYAM SRIHARI.jpg',
    'SRI  KALE YADAIAH.jpg',
    'SRI  KALERU VENKATESH.jpg',
    'SRI  KALVAKUNTLA CHANDRASHEKAR RAO.jpg',
    'SRI  KALVAKUNTLA SANJAY.jpg',
    'SRI  KALVAKUNTLA TARAKA RAMA RAO (K.T.R).jpg',
    'SRI  KAUSHIK REDDY PADI.jpg',
    'SRI  KONINTY MANIK RAO.jpg',
    'SRI  KOTTA PRABHAKAR REDDY.jpg',
    'SRI  MADHAVARAM KRISHNA RAO.jpg',
    'SRI  MARRI RAJASHEKAR REDDY.jpg',
    'SRI  MUTA GOPAL.jpg',
    'SRI  PADMA RAO. T.jpg',
    'SRI  PALLA RAJESHWAR REDDY.jpg',
    'SRI  PRASHANTH REDDY VEMULA.jpg',
    'SRI  SRINIVAS REDDY PARIGE (POCHARAM).jpg',
    'SRI  T. PRAKASH GOUD.jpg',
    'SRI  TALASANI SRINIVAS YADAV.jpg',
    'SRI  THANNEERU HARISH RAO.jpg',
    'SRI  VIJAYUDU.jpg',
    'TELLAM VENKATA RAO.jpg',
    'VAKITI SUNITHA LAXMA REDDY.jpg',
  ],
  CPI: [
    'SRI  KUNAMNENI SAMBASIVA RAO.jpg',
  ],
  INC: [
    'ANASUYA SEETHAKKA DANASARI.jpg',
    'CHITTEM PARNIKA REDDY.jpg',
    'KAVVAMPALLY SATYANARAYANA.jpg',
    'KONDA SUREKHA.jpg',
    'KUCHKULLA RAJESH REDDY.jpg',
    'MATTA RAGAMAYEE.jpg',
    'MURALI  NAIK BHUKYA.jpg',
    'NALAMADA PADMAVATHI REDDY.jpg',
    'SRI  A.  REVANTH REDDY.jpg',
    'SRI  AADI SRINIVAS.jpg',
    'SRI  ADINARAYANA JARE.jpg',
    'SRI  ADLURI LAXMAN KUMAR.jpg',
    'SRI  ANIRUDH REDDY JANAMPALLI.jpg',
    'SRI  B. MANOHAR REDDY.jpg',
    'SRI  BALU NAIK NENAVATH.jpg',
    'SRI  BATHULA LAXMA REDDY.jpg',
    'SRI  BHATTI VIKRAMARKA MALLU.jpg',
    'SRI  BHOOPATHI REDDY REKULAPALLY.jpg',
    'SRI  C. DAMODAR RAJANARSIMHA.jpg',
    'SRI  CHIKKUDU VAMSHI KRISHNA.jpg',
    'SRI  CHINTHAKUNTA VIJAYA RAMANA RAO.jpg',
    'SRI  DONTHI MADHAVA REDDY.jpg',
    'SRI  DUDDILLA SRIDHAR BABU.jpg',
    'SRI  GADDAM PRASAD KUMAR.jpg',
    'SRI  GADDAM VINOD.jpg',
    'SRI  GANDRA SATYANARAYANA RAO.jpg',
    'SRI  GAVINOLLA MADHUSUDAN REDDY (GMR).jpg',
    'SRI  ILAIAH BEERLA.jpg',
    'SRI  JATOTH RAM CHANDER NAIK.jpg',
    'SRI  JUPALLY KRISHNA RAO.jpg',
    'SRI  K. SHANKARAIAH.jpg',
    'SRI  K.R. NAGARAJ. K.jpg',
    'SRI  KASIREDDY NARAYAN REDDY.jpg',
    'SRI  KOKKIRALA PREMSAGAR RAO.jpg',
    'SRI  KOMATI REDDY VENKAT REDDY.jpg',
    'SRI  KOMATIREDDY RAJ GOPAL REDDY.jpg',
    'SRI  KORAM KANAKAIAH.jpg',
    'SRI  KUMBAM ANIL KUMAR REDDY.jpg',
    'SRI  KUNDURU JAYAVEER.jpg',
    'SRI  LAXMI KANTHA RAO THOTA.jpg',
    'SRI  MADAN MOHAN RAO. K.jpg',
    'SRI  MAKKAN SINGH RAJ THAKUR.jpg',
    'SRI  MALREDDY RANGA REDDY.jpg',
    'SRI  MANDULA SAMEL.jpg',
    'SRI  MEDIPALLY SATHYAM.jpg',
    'SRI  MEGHA REDDY TUDI.jpg',
    'SRI  MYNAMPALLY ROHITH.jpg',
    'SRI  NAINI RAJENDER REDDY.jpg',
    'SRI  NAVEEN YADAV. V.jpg',
    'SRI  P. SUDARSHAN REDDY.jpg',
    'SRI  PATLOLLA SANJEEVA REDDY.jpg',
    'SRI  PAYAM VENKATESWARLU.jpg',
    'SRI  PONGULETI SRINIVASA  REDDY.jpg',
    'SRI  PONNAM PRABHAKAR.jpg',
    'SRI  RAMDAS MALOTH.jpg',
    'SRI  REVURI PRAKASH REDDY.jpg',
    'SRI  SRIGANESH.jpg',
    'SRI  TUMMALA NAGESWARA RAO.jpg',
    'SRI  UTTAM KUMAR REDDY NALAMADA.jpg',
    'SRI  VAKITI SRIHARI.jpg',
    'SRI  VEDMA. BHOJJU.jpg',
    'SRI  VEMULA VEERESHAM.jpg',
    'SRI  VIVEK VENKAT SWAMY.jpg',
    'T. RAM MOHAN REDDY.jpg',
    'YASHASWINI MAMIDALA.jpg',
  ],
};

const PARTY_ORDER = ['INC', 'BRS', 'BJP', 'AIMIM', 'CPI'];

const PARTY_PRIORITY_FILE_ORDER = {
  INC: [
    'SRI  A.  REVANTH REDDY.jpg',
    'SRI  BHATTI VIKRAMARKA MALLU.jpg',
    'SRI  DUDDILLA SRIDHAR BABU.jpg',
    'SRI  C. DAMODAR RAJANARSIMHA.jpg',
    'SRI  JUPALLY KRISHNA RAO.jpg',
    'SRI  PONGULETI SRINIVASA  REDDY.jpg',
    'SRI  TUMMALA NAGESWARA RAO.jpg',
    'SRI  KOMATI REDDY VENKAT REDDY.jpg',
    'SRI  UTTAM KUMAR REDDY NALAMADA.jpg',
    'SRI  PONNAM PRABHAKAR.jpg',
    'ANASUYA SEETHAKKA DANASARI.jpg',
    'KONDA SUREKHA.jpg',
    'SRI  NAINI RAJENDER REDDY.jpg',
  ],
  BRS: [
    'SRI  KALVAKUNTLA CHANDRASHEKAR RAO.jpg',
    'SRI  KALVAKUNTLA TARAKA RAMA RAO (K.T.R).jpg',
    'SRI  THANNEERU HARISH RAO.jpg',
    'SRI  GUNTAKANDLA JAGADISH REDDY.jpg',
    'SRI  TALASANI SRINIVAS YADAV.jpg',
    'PATLOLLA SABITHA INDRA REDDY.jpg',
    'SRI  GANGULA KAMALAKAR.jpg',
    'SRI  KADIYAM SRIHARI.jpg',
    'SRI  PALLA RAJESHWAR REDDY.jpg',
    'SRI  DANAM NAGENDER.jpg',
    'SRI  CHAMAKURA MALLA REDDY.jpg',
    'SRI  KALERU VENKATESH.jpg',
    'SRI  PADMA RAO. T.jpg',
    'SRI  K.P. VIVEKANAND.jpg',
    'SRI  MADHAVARAM KRISHNA RAO.jpg',
  ],
  BJP: [
    'SRI  T. RAJA SINGH.jpg',
    'SRI  ALLETI MAHESHWAR REDDY.jpg',
    'SRI  PAYAL SHANKER.jpg',
    'SRI  KATIPALLY VENKATA RAMANA REDDY.jpg',
    'SRI  DHANPAL SURYANARAYANA.jpg',
    'SRI  PAIDI RAKESH REDDY.jpg',
    'SRI  RAM RAO PAWAR.jpg',
    'PALVAI HARISH BABU.jpg',
  ],
  AIMIM: [
    'SRI  AKBAR UDDIN OWAISI.jpg',
    'SRI  MOHAMMED MAJID HUSSAIN.jpg',
    'SRI  KAUSAR MOHIUDDIN.jpg',
    'SRI  MIR ZULFEQAR ALI.jpg',
    'SRI  AHMED BIN ABDULLAH BALALA.jpg',
    'SRI  JAFFAR HUSSAIN.jpg',
    'SRI  MOHAMMED  MUBEEN.jpg',
  ],
  CPI: [
    'SRI  KUNAMNENI SAMBASIVA RAO.jpg',
  ],
};

const MEMBER_CONSTITUENCY_REFERENCE = {
  AIMIM: {
    'SRI  AHMED BIN ABDULLAH BALALA.jpg': 'Malakpet',
    'SRI  AKBAR UDDIN OWAISI.jpg': 'Chandrayangutta',
    'SRI  JAFFAR HUSSAIN.jpg': 'Yakutpura',
    'SRI  KAUSAR MOHIUDDIN.jpg': 'Karwan',
    'SRI  MIR ZULFEQAR ALI.jpg': 'Charminar',
    'SRI  MOHAMMED  MUBEEN.jpg': 'Bahadurpura',
    'SRI  MOHAMMED MAJID HUSSAIN.jpg': 'Nampally',
  },
  BJP: {
    'PALVAI HARISH BABU.jpg': 'Sirpur',
    'SRI  ALLETI MAHESHWAR REDDY.jpg': 'Nirmal',
    'SRI  DHANPAL SURYANARAYANA.jpg': 'Nizamabad (Urban)',
    'SRI  KATIPALLY VENKATA RAMANA REDDY.jpg': 'Kamareddy',
    'SRI  PAIDI RAKESH REDDY.jpg': 'Armoor',
    'SRI  PAYAL SHANKER.jpg': 'Adilabad',
    'SRI  RAM RAO PAWAR.jpg': 'Mudhole',
    'SRI  T. RAJA SINGH.jpg': 'Goshamahal',
  },
  BRS: {
    'KOVA LAXMI.jpg': 'Asifabad (ST)',
    'PATLOLLA SABITHA INDRA REDDY.jpg': 'Maheshwaram',
    'SRI  ANIL JADHAV.jpg': 'Boath (ST)',
    'SRI  AREKAPUDI GANDHI.jpg': 'Serilingampally',
    'SRI  BANDARI LAKSHMA REDDY.jpg': 'Uppal',
    'SRI  BANDLA KRISHNA MOHAN REDDY.jpg': 'Gadwal',
    'SRI  CHAMAKURA MALLA REDDY.jpg': 'Medchal',
    'SRI  CHINTA PRABHAKAR.jpg': 'Sangareddy',
    'SRI  DANAM NAGENDER.jpg': 'Khairatabad',
    'SRI  DEVIREDDY SUDHIR REDDY.jpg': 'LB Nagar',
    'SRI  DR. SANJAY.jpg': 'Jagitial',
    'SRI  GANGULA KAMALAKAR.jpg': 'Karimnagar',
    'SRI  GUDEM MAHIPAL REDDY.jpg': 'Patancheru',
    'SRI  GUNTAKANDLA JAGADISH REDDY.jpg': 'Suryapet',
    'SRI  K.P. VIVEKANAND.jpg': 'Quthbullapur',
    'SRI  KADIYAM SRIHARI.jpg': 'Ghanpur',
    'SRI  KALE YADAIAH.jpg': 'Chevella (SC)',
    'SRI  KALERU VENKATESH.jpg': 'Amberpet',
    'SRI  KALVAKUNTLA CHANDRASHEKAR RAO.jpg': 'Gajwel',
    'SRI  KALVAKUNTLA SANJAY.jpg': 'Koratla',
    'SRI  KALVAKUNTLA TARAKA RAMA RAO (K.T.R).jpg': 'Sircilla',
    'SRI  KAUSHIK REDDY PADI.jpg': 'Huzurabad',
    'SRI  KONINTY MANIK RAO.jpg': 'Zahirabad (SC)',
    'SRI  KOTTA PRABHAKAR REDDY.jpg': 'Dubbak',
    'SRI  MADHAVARAM KRISHNA RAO.jpg': 'Kukatpally',
    'SRI  MARRI RAJASHEKAR REDDY.jpg': 'Malkajgiri',
    'SRI  MUTA GOPAL.jpg': 'Musheerabad',
    'SRI  PADMA RAO. T.jpg': 'Secunderabad',
    'SRI  PALLA RAJESHWAR REDDY.jpg': 'Jangaon',
    'SRI  PRASHANTH REDDY VEMULA.jpg': 'Balkonda',
    'SRI  SRINIVAS REDDY PARIGE (POCHARAM).jpg': 'Banswada',
    'SRI  T. PRAKASH GOUD.jpg': 'Rajendranagar',
    'SRI  TALASANI SRINIVAS YADAV.jpg': 'Sanathnagar',
    'SRI  THANNEERU HARISH RAO.jpg': 'Siddipet',
    'SRI  VIJAYUDU.jpg': 'Alampur (SC)',
    'TELLAM VENKATA RAO.jpg': 'Bhadrachalam (ST)',
    'VAKITI SUNITHA LAXMA REDDY.jpg': 'Narsapur',
  },
  CPI: {
    'SRI  KUNAMNENI SAMBASIVA RAO.jpg': 'Kothagudem',
  },
  INC: {
    'ANASUYA SEETHAKKA DANASARI.jpg': 'Mulug (ST)',
    'CHITTEM PARNIKA REDDY.jpg': 'Narayanpet',
    'KAVVAMPALLY SATYANARAYANA.jpg': 'Manakondur (SC)',
    'KONDA SUREKHA.jpg': 'Warangal East',
    'KUCHKULLA RAJESH REDDY.jpg': 'Nagarkurnool',
    'MATTA RAGAMAYEE.jpg': 'Sathupalle (SC)',
    'MURALI  NAIK BHUKYA.jpg': 'Mahabubabad (ST)',
    'NALAMADA PADMAVATHI REDDY.jpg': 'Kodad',
    'SRI  A.  REVANTH REDDY.jpg': 'Kodangal',
    'SRI  AADI SRINIVAS.jpg': 'Vemulawada',
    'SRI  ADINARAYANA JARE.jpg': 'Aswaraopeta (ST)',
    'SRI  ADLURI LAXMAN KUMAR.jpg': 'Dharmapuri (SC)',
    'SRI  ANIRUDH REDDY JANAMPALLI.jpg': 'Jadcherla',
    'SRI  B. MANOHAR REDDY.jpg': 'Tandur',
    'SRI  BALU NAIK NENAVATH.jpg': 'Devarakonda (ST)',
    'SRI  BATHULA LAXMA REDDY.jpg': 'Miryalguda',
    'SRI  BHATTI VIKRAMARKA MALLU.jpg': 'Madhira (SC)',
    'SRI  BHOOPATHI REDDY REKULAPALLY.jpg': 'Nizamabad (Rural)',
    'SRI  C. DAMODAR RAJANARSIMHA.jpg': 'Andole (SC)',
    'SRI  CHIKKUDU VAMSHI KRISHNA.jpg': 'Achampet (SC)',
    'SRI  CHINTHAKUNTA VIJAYA RAMANA RAO.jpg': 'Peddapalle',
    'SRI  DONTHI MADHAVA REDDY.jpg': 'Narasampet',
    'SRI  DUDDILLA SRIDHAR BABU.jpg': 'Manthani',
    'SRI  GADDAM PRASAD KUMAR.jpg': 'Vikarabad (SC)',
    'SRI  GADDAM VINOD.jpg': 'Bellampalli (SC)',
    'SRI  GANDRA SATYANARAYANA RAO.jpg': 'Bhupalpalle',
    'SRI  GAVINOLLA MADHUSUDAN REDDY (GMR).jpg': 'Devarakadra',
    'SRI  ILAIAH BEERLA.jpg': 'Alair',
    'SRI  JATOTH RAM CHANDER NAIK.jpg': 'Dornakal (ST)',
    'SRI  JUPALLY KRISHNA RAO.jpg': 'Kollapur',
    'SRI  K. SHANKARAIAH.jpg': 'Shadnagar',
    'SRI  K.R. NAGARAJ. K.jpg': 'Wardhannapet (SC)',
    'SRI  KASIREDDY NARAYAN REDDY.jpg': 'Kalwakurthy',
    'SRI  KOKKIRALA PREMSAGAR RAO.jpg': 'Mancherial',
    'SRI  KOMATI REDDY VENKAT REDDY.jpg': 'Nalgonda',
    'SRI  KOMATIREDDY RAJ GOPAL REDDY.jpg': 'Munugode',
    'SRI  KORAM KANAKAIAH.jpg': 'Yellandu (ST)',
    'SRI  KUMBAM ANIL KUMAR REDDY.jpg': 'Bhongir',
    'SRI  KUNDURU JAYAVEER.jpg': 'Nagarjunasagar',
    'SRI  LAXMI KANTHA RAO THOTA.jpg': 'Jukkal (SC)',
    'SRI  MADAN MOHAN RAO. K.jpg': 'Yellareddy',
    'SRI  MAKKAN SINGH RAJ THAKUR.jpg': 'Ramagundam',
    'SRI  MALREDDY RANGA REDDY.jpg': 'Ibrahimpatnam',
    'SRI  MANDULA SAMEL.jpg': 'Thungathurthy (SC)',
    'SRI  MEDIPALLY SATHYAM.jpg': 'Choppadandi (SC)',
    'SRI  MEGHA REDDY TUDI.jpg': 'Wanaparthy',
    'SRI  MYNAMPALLY ROHITH.jpg': 'Medak',
    'SRI  NAINI RAJENDER REDDY.jpg': 'Warangal West',
    'SRI  NAVEEN YADAV. V.jpg': 'Jubilee Hills',
    'SRI  P. SUDARSHAN REDDY.jpg': 'Bodhan',
    'SRI  PATLOLLA SANJEEVA REDDY.jpg': 'Narayankhed',
    'SRI  PAYAM VENKATESWARLU.jpg': 'Pinapaka (ST)',
    'SRI  PONGULETI SRINIVASA  REDDY.jpg': 'Palair',
    'SRI  PONNAM PRABHAKAR.jpg': 'Husnabad',
    'SRI  RAMDAS MALOTH.jpg': 'Wyra (ST)',
    'SRI  REVURI PRAKASH REDDY.jpg': 'Parkal',
    'SRI  SRIGANESH.jpg': 'Secunderabad Cantonment (SC)',
    'SRI  TUMMALA NAGESWARA RAO.jpg': 'Khammam',
    'SRI  UTTAM KUMAR REDDY NALAMADA.jpg': 'Huzurnagar',
    'SRI  VAKITI SRIHARI.jpg': 'Makthal',
    'SRI  VEDMA. BHOJJU.jpg': 'Khanapur (ST)',
    'SRI  VEMULA VEERESHAM.jpg': 'Nakrekal (SC)',
    'SRI  VIVEK VENKAT SWAMY.jpg': 'Chennur (SC)',
    'T. RAM MOHAN REDDY.jpg': 'Pargi',
    'YASHASWINI MAMIDALA.jpg': 'Palakurthi',
  },
};

const CONGRESS_PROFILE_ORDER = new Map(
  TELANGANA_MINISTERS.map((member, index) => [member.id, index])
);

const CONGRESS_ROLE_ORDER = {
  'Chief Minister': 0,
  'Deputy Chief Minister': 1,
  'Cabinet Minister': 2,
  MLA: 3,
};

const CONSTITUENCY_DISTRICT_REFERENCE = {
  'achampet': 'Nagarkurnool',
  'adilabad': 'Adilabad',
  'alair': 'Yadadri Bhuvanagiri',
  'alampur': 'Jogulamba Gadwal',
  'amberpet': 'Hyderabad',
  'andole': 'Sangareddy',
  'armoor': 'Nizamabad',
  'asifabad': 'Komaram Bheem Asifabad',
  'aswaraopeta': 'Bhadradri Kothagudem',
  'bahadurpura': 'Hyderabad',
  'balkonda': 'Nizamabad',
  'banswada': 'Kamareddy',
  'bellampalli': 'Mancherial',
  'bhadrachalam': 'Bhadradri Kothagudem',
  'bhongir': 'Yadadri Bhuvanagiri',
  'bhupalpalle': 'Jayashankar Bhupalpally',
  'bodhan': 'Nizamabad',
  'boath': 'Adilabad',
  'chandrayangutta': 'Hyderabad',
  'charminar': 'Hyderabad',
  'chennur': 'Mancherial',
  'chevella': 'Rangareddy',
  'choppadandi': 'Karimnagar',
  'devarakadra': 'Mahabubnagar',
  'devarakonda': 'Nalgonda',
  'dharmapuri': 'Jagtial',
  'dornakal': 'Mahabubabad',
  'dubbak': 'Siddipet',
  'gadwal': 'Jogulamba Gadwal',
  'gajwel': 'Siddipet',
  'ghanpur': 'Jangaon',
  'goshamahal': 'Hyderabad',
  'husnabad': 'Siddipet',
  'huzurabad': 'Karimnagar',
  'huzurnagar': 'Suryapet',
  'ibrahimpatnam': 'Rangareddy',
  'jadcherla': 'Mahabubnagar',
  'jagitial': 'Jagtial',
  'jangaon': 'Jangaon',
  'jubilee hills': 'Hyderabad',
  'jukkal': 'Kamareddy',
  'kalwakurthy': 'Nagarkurnool',
  'kamareddy': 'Kamareddy',
  'karimnagar': 'Karimnagar',
  'karwan': 'Hyderabad',
  'khairatabad': 'Hyderabad',
  'khammam': 'Khammam',
  'khanapur': 'Nirmal',
  'kodad': 'Suryapet',
  'kodangal': 'Vikarabad',
  'kollapur': 'Nagarkurnool',
  'koratla': 'Jagtial',
  'kothagudem': 'Bhadradri Kothagudem',
  'kukatpally': 'Medchal-Malkajgiri',
  'lb nagar': 'Rangareddy',
  'mahabubabad': 'Mahabubabad',
  'mahabubnagar': 'Mahabubnagar',
  'makthal': 'Narayanpet',
  'malakpet': 'Hyderabad',
  'malkajgiri': 'Medchal-Malkajgiri',
  'manakondur': 'Karimnagar',
  'mancherial': 'Mancherial',
  'manthani': 'Peddapalli',
  'medak': 'Medak',
  'medchal': 'Medchal-Malkajgiri',
  'miryalaguda': 'Nalgonda',
  'mudhole': 'Nirmal',
  'mulug': 'Mulugu',
  'munugode': 'Nalgonda',
  'musheerabad': 'Hyderabad',
  'madhira': 'Khammam',
  'nagarkurnool': 'Nagarkurnool',
  'nagarjunasagar': 'Nalgonda',
  'nalgonda': 'Nalgonda',
  'nampally': 'Hyderabad',
  'narasampet': 'Warangal',
  'narayanpet': 'Narayanpet',
  'narayankhed': 'Sangareddy',
  'narsapur': 'Medak',
  'nakrekal': 'Nalgonda',
  'nirmal': 'Nirmal',
  'nizamabad rural': 'Nizamabad',
  'nizamabad urban': 'Nizamabad',
  'nizamabad': 'Nizamabad',
  'palair': 'Khammam',
  'palakurthi': 'Jangaon',
  'pargi': 'Vikarabad',
  'parkal': 'Hanamkonda',
  'patancheru': 'Sangareddy',
  'pargi': 'Vikarabad',
  'peddapalle': 'Peddapalli',
  'pinapaka': 'Bhadradri Kothagudem',
  'quthbullapur': 'Medchal-Malkajgiri',
  'rajendranagar': 'Rangareddy',
  'ramagundam': 'Peddapalli',
  'sangareddy': 'Sangareddy',
  'sanathnagar': 'Hyderabad',
  'sathupalle': 'Khammam',
  'secunderabad': 'Hyderabad',
  'secunderabad cantonment': 'Hyderabad',
  'serilingampally': 'Rangareddy',
  'shadnagar': 'Rangareddy',
  'siddipet': 'Siddipet',
  'sirpur': 'Komaram Bheem Asifabad',
  'sircilla': 'Rajanna Sircilla',
  'suryapet': 'Suryapet',
  'tandur': 'Vikarabad',
  'thungathurthy': 'Suryapet',
  'wanaparthy': 'Wanaparthy',
  'wardhannapet': 'Hanamkonda',
  'warangal east': 'Hanamkonda',
  'warangal west': 'Hanamkonda',
  'vikarabad': 'Vikarabad',
  'vemulawada': 'Rajanna Sircilla',
  'wyra': 'Khammam',
  'yakutpura': 'Hyderabad',
  'yellandu': 'Bhadradri Kothagudem',
  'yellareddy': 'Kamareddy',
  'zahirabad': 'Sangareddy',
};

const PROFILE_OVERRIDES = {
  INC: {
    'SRI  A.  REVANTH REDDY.jpg': {
      name: 'Anumula Revanth Reddy',
      shortName: 'Anumula Revanth Reddy',
      role: 'Chief Minister',
      department: 'Chief Minister',
    },
    'SRI  BHATTI VIKRAMARKA MALLU.jpg': {
      name: 'Mallu Bhatti Vikramarka',
      shortName: 'Mallu Bhatti Vikramarka',
      role: 'Deputy Chief Minister',
      department: 'Deputy Chief Minister',
    },
    'SRI  UTTAM KUMAR REDDY NALAMADA.jpg': {
      name: 'Nalamada Uttam Kumar Reddy',
      shortName: 'Uttam Kumar Reddy',
      role: 'Cabinet Minister',
      department: 'Irrigation, Civil Supplies',
    },
    'SRI  DUDDILLA SRIDHAR BABU.jpg': {
      name: 'Duddilla Sridhar Babu',
      shortName: 'Duddilla Sridhar Babu',
      role: 'Cabinet Minister',
      department: 'IT, Industries',
    },
    'SRI  KOMATI REDDY VENKAT REDDY.jpg': {
      name: 'Komatireddy Venkat Reddy',
      shortName: 'Komatireddy Venkat Reddy',
      role: 'Cabinet Minister',
      department: 'Roads & Buildings',
    },
    'SRI  JUPALLY KRISHNA RAO.jpg': {
      role: 'Cabinet Minister',
      department: 'Excise, Tourism',
    },
    'SRI  C. DAMODAR RAJANARSIMHA.jpg': {
      name: 'C. Damodar Raja Narasimha',
      shortName: 'Damodar Raja Narasimha',
      role: 'Cabinet Minister',
      department: 'Health',
    },
    'SRI  PONGULETI SRINIVASA  REDDY.jpg': {
      name: 'Ponguleti Srinivasa Reddy',
      shortName: 'Ponguleti Srinivasa Reddy',
      role: 'Cabinet Minister',
      department: 'Revenue, Housing',
    },
    'ANASUYA SEETHAKKA DANASARI.jpg': {
      name: 'Dansari Anasuya Seethakka',
      shortName: 'Seethakka',
      role: 'Cabinet Minister',
      department: 'Panchayat Raj, Women & Child',
    },
    'SRI  TUMMALA NAGESWARA RAO.jpg': {
      name: 'Tummala Nageswara Rao',
      shortName: 'Tummala Nageswara Rao',
      role: 'Cabinet Minister',
      department: 'Agriculture',
    },
    'KONDA SUREKHA.jpg': {
      role: 'Cabinet Minister',
      department: 'Forest, Endowments',
    },
    'SRI  VIVEK VENKAT SWAMY.jpg': {
      name: 'Gaddam Vivek Venkatswamy',
      shortName: 'Gaddam Vivek Venkatswamy',
      role: 'Cabinet Minister',
      department: 'Labour, Mines',
    },
    'SRI  ADLURI LAXMAN KUMAR.jpg': {
      role: 'Cabinet Minister',
      department: 'SC/ST & Welfare',
    },
    'SRI  VAKITI SRIHARI.jpg': {
      role: 'Cabinet Minister',
      department: 'Animal Husbandry, Sports',
    },
    'SRI  GADDAM VINOD.jpg': {
      role: 'MLA',
      department: '',
    },
  },
  BRS: {
    'PATLOLLA SABITHA INDRA REDDY.jpg': {
      district: 'Ranga Reddy',
    },
    'SRI  BANDARI LAKSHMA REDDY.jpg': {
      district: 'Medchal-Malkajgiri',
    },
    'SRI  KALVAKUNTLA CHANDRASHEKAR RAO.jpg': {
      id: 'kcr',
      name: 'K. Chandrashekar Rao',
      shortName: 'K. Chandrashekar Rao',
      role: 'Party Founder',
    },
    'SRI  KALVAKUNTLA TARAKA RAMA RAO (K.T.R).jpg': {
      id: 'ktr',
      name: 'K. T. Rama Rao',
      shortName: 'K. T. Rama Rao',
      role: 'Working President',
    },
    'SRI  THANNEERU HARISH RAO.jpg': {
      id: 'harish-rao',
      name: 'T. Harish Rao',
      shortName: 'T. Harish Rao',
      role: 'Senior Leader',
    },
  },
  BJP: {
    'SRI  T. RAJA SINGH.jpg': {
      id: 't-raja-singh',
      name: 'T. Raja Singh',
      shortName: 'T. Raja Singh',
      role: 'Senior Leader',
    },
    'SRI  ALLETI MAHESHWAR REDDY.jpg': {
      id: 'alleti-maheshwar-reddy',
      name: 'Alleti Maheshwar Reddy',
      shortName: 'Alleti Maheshwar Reddy',
      role: 'Floor Leader',
    },
  },
  AIMIM: {
    'SRI  AKBAR UDDIN OWAISI.jpg': {
      id: 'akbaruddin-owaisi',
      name: 'Akbaruddin Owaisi',
      shortName: 'Akbaruddin Owaisi',
      role: 'Floor Leader',
    },
    'SRI  MOHAMMED MAJID HUSSAIN.jpg': {
      id: 'majid-hussain',
      name: 'Mohammed Majid Hussain',
      shortName: 'Majid Hussain',
      role: 'Senior Leader',
    },
  },
};

const MANUAL_NAME_ALIASES = {
  'C DAMODAR RAJANARSIMHA': 'DAMODAR RAJA NARASIMHA',
  'K R NAGARAJ K': 'K R NAGARAJ',
  'TUMMALA NAGESWARA RAO': 'TUMMALA NAGESHWARA RAO',
  'VEDMA BHOJJU': 'VEDMA BHOJJU',
  'VIVEK VENKAT SWAMY': 'GADDAM VIVEKANAND',
  'BHATTI VIKRAMARKA MALLU': 'MALLU BHATTI VIKRAMARKA',
  'DUDDILLA SRIDHAR BABU': 'D SRIDHAR BABU',
  'KOMATI REDDY VENKAT REDDY': 'KOMATIREDDY VENKAT REDDY',
  'UTTAM KUMAR REDDY NALAMADA': 'N UTTAM KUMAR REDDY',
  'ANASUYA SEETHAKKA DANASARI': 'DANASARI ANASUYA SEETHAKKA',
};

const normalizeConstituencyKey = (value = '') =>
  value
    .toLowerCase()
    .replace(/\s*\(\s*(sc|st|bc|gen|urban|rural)\s*\)\s*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

const formatDisplayName = (rawName) => {
  const cleaned = rawName
    .replace(/\.[^.]+$/, '')
    .replace(/\b(SRI|SHRI|SMT)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned
    .split(' ')
    .map((part) => {
      if (!part) return part;
      if (/^[A-Z]\.?$/.test(part)) return part.toUpperCase();
      if (/\(.*\)/.test(part)) return part.toUpperCase();
      if (part.includes('.')) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
};

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const normalizeName = (value = '') => {
  const stripped = value
    .toUpperCase()
    .replace(/\.[A-Z]/g, (match) => match.replace('.', ' '))
    .replace(/\b(SRI|SHRI|SMT|DR|DRS)\b/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return MANUAL_NAME_ALIASES[stripped] || stripped;
};

const buildCongressProfileIndex = () => {
  const index = new Map();

  TELANGANA_MINISTERS.forEach((member) => {
    const candidates = [
      member.name,
      member.shortName,
      `${member.name} ${member.shortName}`,
    ];

    candidates.forEach((candidate) => {
      const normalized = normalizeName(candidate);
      if (normalized) index.set(normalized, member);
    });
  });

  return index;
};

const congressProfileIndex = buildCongressProfileIndex();

const resolveLinkedProfile = (party, fileName) => {
  if (party !== 'INC') return null;
  const normalizedFileName = normalizeName(fileName.replace(/\.[^.]+$/, ''));
  return congressProfileIndex.get(normalizedFileName) || null;
};

const getPriorityRank = (party, fileName) => {
  const priorityList = PARTY_PRIORITY_FILE_ORDER[party] || [];
  const index = priorityList.indexOf(fileName);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
};

const sortMembersForParty = (party, members) => {
  const sorted = [...members].sort((a, b) => {
    const priorityDiff = getPriorityRank(party, a.sourceFileName) - getPriorityRank(party, b.sourceFileName);
    if (priorityDiff !== 0) return priorityDiff;

    if (party === 'INC') {
      const roleDiff = (CONGRESS_ROLE_ORDER[a.role] ?? 99) - (CONGRESS_ROLE_ORDER[b.role] ?? 99);
      if (roleDiff !== 0) return roleDiff;

      const aProfileOrder = a.linkedProfile ? (CONGRESS_PROFILE_ORDER.get(a.linkedProfile.id) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
      const bProfileOrder = b.linkedProfile ? (CONGRESS_PROFILE_ORDER.get(b.linkedProfile.id) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
      if (aProfileOrder !== bProfileOrder) return aProfileOrder - bProfileOrder;
    }

    return a.sourceOrder - b.sourceOrder;
  });

  return sorted;
};

const buildMember = (party, fileName, index) => {
  const imagePath = `/MLA_Images/${party}/${fileName}`;
  const matchedProfile = resolveLinkedProfile(party, fileName);
  const overrides = PROFILE_OVERRIDES[party]?.[fileName] || {};
  const referenceConstituency = MEMBER_CONSTITUENCY_REFERENCE[party]?.[fileName] || '';
  const fallbackName = formatDisplayName(fileName);
  const selectionProfile = {
    id: overrides.id || matchedProfile?.id || `${party.toLowerCase()}-${index + 1}-${slugify(fileName)}`,
    name: overrides.name || matchedProfile?.name || fallbackName,
    shortName: overrides.shortName || matchedProfile?.shortName || fallbackName,
    role: overrides.role || matchedProfile?.role || 'MLA',
    party,
    partyFullName: MLA_PARTY_META[party].fullName,
    constituency: referenceConstituency || matchedProfile?.constituency || '',
    district: overrides.district || matchedProfile?.district || CONSTITUENCY_DISTRICT_REFERENCE[normalizeConstituencyKey(referenceConstituency || matchedProfile?.constituency || '')] || '',
    department: overrides.department ?? matchedProfile?.department ?? '',
    activityScore: matchedProfile?.activityScore ?? null,
    color: matchedProfile?.color || MLA_PARTY_META[party].color,
    image: imagePath,
  };

  return {
    ...selectionProfile,
    party,
    partyFullName: MLA_PARTY_META[party].fullName,
    image: imagePath,
    linkedProfile: selectionProfile,
    sourceFileName: fileName,
    sourceOrder: index,
    selectable: Boolean(selectionProfile.constituency),
  };
};

export const PARTY_WISE_MLA_DIRECTORY = [
  ...PARTY_ORDER.map((party) => ({
    party,
    ...MLA_PARTY_META[party],
    members: sortMembersForParty(
      party,
      PARTY_WISE_IMAGE_FILES[party].map((fileName, index) => buildMember(party, fileName, index))
    ),
  })),
];

export const TOTAL_MLA_DIRECTORY_COUNT = PARTY_WISE_MLA_DIRECTORY.reduce(
  (sum, partyGroup) => sum + partyGroup.members.length,
  0
);
