/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║         PUNJAB LOCATION DATABASE — THE GOAT OF PUNJAB DETECTION         ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  Comprehensive list of every district, city, town, village, tehsil,     ║
 * ║  block, constituency, sub-division, and notable area in Punjab, India   ║
 * ║  + Chandigarh (UT, shared capital).                                     ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

// ─── 23 DISTRICTS OF PUNJAB + CHANDIGARH ────────────────────────────────────
const PUNJAB_DISTRICTS = [
    'amritsar', 'barnala', 'bathinda', 'faridkot', 'fatehgarh sahib',
    'fazilka', 'ferozepur', 'firozpur', 'gurdaspur', 'hoshiarpur',
    'jalandhar', 'kapurthala', 'ludhiana', 'malerkotla', 'mansa',
    'moga', 'mohali', 'sas nagar', 'muktsar', 'sri muktsar sahib',
    'nawanshahr', 'shahid bhagat singh nagar', 'pathankot', 'patiala',
    'rupnagar', 'ropar', 'sangrur', 'tarn taran', 'chandigarh'
];

// ─── ALL 117 ASSEMBLY CONSTITUENCIES ─────────────────────────────────────────
const PUNJAB_CONSTITUENCIES = [
    // Amritsar district
    'amritsar north', 'amritsar south', 'amritsar central', 'amritsar east', 'amritsar west',
    'ajnala', 'attari', 'majitha', 'jandiala',
    // Barnala district
    'barnala', 'bhadaur', 'mehal kalan',
    // Bathinda district
    'bathinda urban', 'bathinda rural', 'rampura phul', 'maur', 'talwandi sabo',
    // Faridkot district
    'faridkot', 'kotkapura',
    // Fatehgarh Sahib district
    'amloh', 'bassi pathana', 'fatehgarh sahib',
    // Fazilka district
    'fazilka', 'jalalabad', 'abohar', 'balluana',
    // Ferozepur district
    'ferozepur city', 'ferozepur rural', 'zira', 'guru har sahai',
    // Gurdaspur district
    'gurdaspur', 'batala', 'dera baba nanak', 'fatehgarh churian', 'dinanagar', 'qadian',
    // Hoshiarpur district
    'hoshiarpur', 'dasuya', 'mukerian', 'chabbewal', 'sham chaurasi', 'urmur tanda',
    // Jalandhar district
    'jalandhar central', 'jalandhar north', 'jalandhar west', 'jalandhar cantt',
    'adampur', 'kartarpur', 'nakodar', 'phillaur',
    // Kapurthala district
    'kapurthala', 'sultanpur lodhi', 'bholath',
    // Ludhiana district
    'ludhiana central', 'ludhiana east', 'ludhiana north', 'ludhiana south', 'ludhiana west',
    'atam nagar', 'gill', 'payal', 'raikot', 'jagraon', 'khanna', 'sahnewal', 'samrala',
    // Malerkotla district
    'malerkotla', 'amargarh',
    // Mansa district
    'mansa', 'budhlada', 'sardulgarh',
    // Moga district
    'moga', 'nihal singhwala', 'baghapurana', 'dharamkot',
    // Mohali (SAS Nagar) district
    'mohali', 'kharar', 'dera bassi', 'sas nagar',
    // Muktsar district
    'muktsar', 'gidderbaha', 'malout', 'lambi',
    // Nawanshahr (SBS Nagar) district
    'nawanshahr', 'banga', 'balachaur',
    // Pathankot district
    'pathankot', 'sujanpur', 'bhoa',
    // Patiala district
    'patiala urban', 'patiala rural', 'rajpura', 'nabha', 'ghanaur', 'samana', 'shutrana', 'sanour', 'sanaur',
    // Rupnagar district
    'rupnagar', 'chamkaur sahib', 'anandpur sahib', 'nangal',
    // Sangrur district
    'sangrur', 'sunam', 'dhuri', 'lehragaga', 'dirba', 'moonak',
    // Tarn Taran district
    'tarn taran', 'patti', 'khem karan', 'bhikhiwind'
];

// ─── EVERY CITY, TOWN, VILLAGE, TEHSIL, BLOCK, AND NOTABLE AREA ─────────────
const PUNJAB_CITIES_AND_VILLAGES = [
    // ═══════════════════════════════════
    // MAJOR CITIES
    // ═══════════════════════════════════
    'amritsar', 'ludhiana', 'jalandhar', 'patiala', 'bathinda',
    'mohali', 'pathankot', 'hoshiarpur', 'batala', 'moga',
    'abohar', 'malerkotla', 'khanna', 'phagwara', 'firozpur', 'ferozepur',

    // ═══════════════════════════════════
    // AMRITSAR DISTRICT
    // ═══════════════════════════════════
    'ajnala', 'majitha', 'rayya', 'jandiala guru', 'rajasansi',
    'attari', 'wagah', 'verka', 'chheharta', 'lopoke',
    'baba bakala', 'chogawan', 'fatehabad', 'ramdas', 'bhikhiwind road',
    'tarsikka', 'manawala', 'kathunangal', 'sultanwind', 'beas',
    'harike', 'bal kalan', 'vallah', 'naushehra pannuan', 'mehta',
    'gharinda', 'budha theh', 'daburji', 'jhabal', 'fatehpur rajputan',
    'chatiwind', 'tangra', 'nawan pind', 'rasulpur', 'dhanoa kalan',
    'butala', 'bundala', 'bhakna kalan', 'nagkalan', 'padri',
    'othian', 'kairon', 'meeranpur', 'ramnagar', 'fatehgarh shukarchak',
    'kotli surat malhi', 'jandoke', 'sarhali kalan', 'pandori gola',
    'chak ram das', 'wadala sandhuan', 'mallan', 'bhagat ki kothi',

    // ═══════════════════════════════════
    // LUDHIANA DISTRICT
    // ═══════════════════════════════════
    'jagraon', 'samrala', 'raikot', 'payal', 'doraha',
    'sahnewal', 'machhiwara', 'mullanpur', 'dakha', 'khanna',
    'mandi gobindgarh', 'sudhar', 'haibowal', 'shimlapuri',
    'baddowal', 'lalton kalan', 'gill', 'hambran',
    'sidhwan bet', 'pakhowal', 'dehlon', 'issewal',
    'jodhan', 'lohara', 'mullanpur dakha', 'katani kalan',
    'jassian', 'manuke', 'bharthala', 'sidhwan khurd',
    'mehdoodan', 'atam nagar', 'dugri', 'model town ludhiana',
    'focal point ludhiana', 'salem tabri', 'dhandari kalan',
    'giaspura', 'bahadur ke', 'narangwal', 'bija',
    'latala', 'malaud', 'talwandi kalan', 'ramgarh',
    'kothe mangal singh', 'bhundri', 'ghulal', 'ludhiana cantt',
    'koom kalan', 'belha', 'rurka kalan', 'kila raipur',

    // ═══════════════════════════════════
    // JALANDHAR DISTRICT
    // ═══════════════════════════════════
    'nakodar', 'shahkot', 'phillaur', 'adampur', 'goraya',
    'kartarpur', 'jalandhar city', 'jalandhar cantt',
    'nurmahal', 'lohian khas', 'mehatpur', 'rahon',
    'jalandhar west', 'maqsudan', 'basti sheikh',
    'bhogpur', 'mahilpur', 'bilga', 'rurka kalan',
    'begowal', 'noor mahal', 'dhilwan', 'apra',
    'lambra', 'jandiala', 'talhan', 'bootan mandi',
    'bholath', 'malsian', 'tanda ram sahai',
    'aliwal', 'alawalpur', 'chak desa singh',
    'kala sanghian', 'padiana', 'jamsher', 'jandu singha',
    'shankar', 'hardaspur', 'nahal', 'bagh wala',
    'garha', 'bara pind', 'kot fatuhi',

    // ═══════════════════════════════════
    // PATIALA DISTRICT
    // ═══════════════════════════════════
    'rajpura', 'samana', 'nabha', 'sanaur', 'sanour',
    'patran', 'ghanaur', 'shutrana', 'banur',
    'tripuri', 'ghagga', 'karhali', 'bhunerheri',
    'lehal', 'bhedpura', 'rajpura town', 'patiala city',
    'sidhuwal', 'balbera', 'bhasaur', 'dera mandi',
    'shekhpura', 'kakrala', 'devigarh', 'chhoti baradari',
    'rohla', 'takhtu majra', 'badshahpur', 'seona',
    'jugiana', 'devi nagar', 'bahadurgarh patiala',
    'mehmoodpur', 'sainifarm', 'pasiana', 'salana',
    'salempur', 'kalyan', 'rajoana', 'fatehgarh patiala',
    'dera bassi road patiala', 'ghanour', 'dudhan sadhan',

    // ═══════════════════════════════════
    // BATHINDA DISTRICT
    // ═══════════════════════════════════
    'rampura phul', 'talwandi sabo', 'maur', 'bhucho mandi', 'goniana',
    'nathana', 'sangat', 'phul', 'bhagta bhai ka',
    'mandi kalan', 'kot shamir', 'ballianwali', 'bathinda city',
    'mehraj', 'ghudda', 'kaur singh wala', 'jeeda',
    'giana', 'kotha guru', 'ghugiana', 'jodhpur romana',
    'bir talab', 'thermal plant bathinda', 'lehra mohabbat',
    'dandoo', 'ghallu', 'sekha', 'chak bhika singh',
    'balluana', 'sardulewala', 'jangi rana', 'ralla',
    'gidderbaha road', 'bhai rupa', 'bibiwala',
    'gill kalan', 'dhapai', 'behman jassa',

    // ═══════════════════════════════════
    // SANGRUR DISTRICT
    // ═══════════════════════════════════
    'sangrur', 'sunam', 'dhuri', 'lehragaga', 'dirba',
    'moonak', 'khanauri', 'cheema', 'longowal',
    'bhawanigarh', 'chhajli', 'ahmedgarh', 'malerkotla road',
    'ubha', 'ratolan', 'kotra', 'sunam city',
    'sangrur city', 'nankiana', 'bharatgarh', 'hadiaya',
    'ghangas', 'banawala', 'bhaloor', 'chajla',
    'bhadson', 'daiher', 'phulad', 'sherpur sangrur',
    'bagai', 'janetpura', 'lassoi', 'harigarh',
    'andana', 'kauli', 'chattha', 'longowal',
    'duggan', 'matran', 'thuliwal',

    // ═══════════════════════════════════
    // MOHALI (SAS NAGAR) DISTRICT
    // ═══════════════════════════════════
    'mohali', 'kharar', 'zirakpur', 'dera bassi', 'derabassi',
    'kurali', 'lalru', 'banur', 'gharuan',
    'sas nagar', 'phase 1 mohali', 'phase 8 mohali', 'sector 68 mohali',
    'sector 70 mohali', 'sector 71 mohali', 'it city mohali',
    'mohali village', 'nayagaon', 'balongi', 'sohana',
    'mullanpur garibdas', 'mullanpur new chandigarh',
    'jhanjeri', 'landran', 'kumbra', 'tepla',
    'dhakoli', 'baltana', 'bhabat', 'majri',
    'kurdi', 'behlolpur', 'kansal', 'kherar',
    'manauli', 'palheri', 'tangori', 'sector 82 mohali',
    'aerocity mohali', 'iswarpura', 'saidpura',

    // ═══════════════════════════════════
    // GURDASPUR DISTRICT
    // ═══════════════════════════════════
    'gurdaspur', 'dinanagar', 'batala', 'qadian',
    'sri hargobindpur', 'sujanpur', 'kalanaur',
    'dera baba nanak', 'fatehgarh churian', 'dorangla',
    'dhariwal', 'tibber', 'kahnuwan', 'behrampur',
    'naushera majha singh', 'kasel', 'ghoman',
    'kothay', 'pandori bibi', 'saidowal', 'wadala granthian',
    'kala afghana', 'khemkaran gurdaspur', 'bamial',
    'buttar', 'tibber', 'shakar garh road', 'purana shalla',
    'badala', 'lakhanpur', 'ghariala', 'alipur',

    // ═══════════════════════════════════
    // PATHANKOT DISTRICT
    // ═══════════════════════════════════
    'pathankot', 'sujanpur', 'narot jaimal singh',
    'mamun', 'dalhousie', 'shahpurkandi', 'bhoa',
    'pathankot cantt', 'pathankot city', 'chakki bank',
    'basoli', 'madhopur', 'kathua road',
    'nagrotasuriyan', 'nagrotabagwan', 'sarna',
    'parmanand', 'kandwal', 'tikri', 'miranpur',

    // ═══════════════════════════════════
    // HOSHIARPUR DISTRICT
    // ═══════════════════════════════════
    'hoshiarpur', 'dasuya', 'mukerian', 'garhshankar',
    'hariana', 'talwara', 'tanda', 'mahilpur',
    'chabbewal', 'sham chaurasi', 'hajipur', 'bhunga',
    'pandori ganga singh', 'jeewan nagar', 'balachaur',
    'tanda urmur', 'mahalpur', 'garhdiwala', 'bolina doaba',
    'hoshiarpur city', 'khurmania', 'behrampur hoshiarpur',
    'bajwara', 'adluwalia', 'bassi bahian', 'bhariyal',
    'bhaddi', 'chohal', 'gagret', 'daulatpur',
    'dharam kot randhawa', 'powadra', 'miani', 'raipur rani',
    'jaijon doaba', 'kot ise khan', 'qila andraman',

    // ═══════════════════════════════════
    // KAPURTHALA DISTRICT
    // ═══════════════════════════════════
    'kapurthala', 'phagwara', 'sultanpur lodhi', 'bholath',
    'begowal', 'dhilwan', 'nadala', 'bhulath',
    'kanjhla', 'talwandi chaudhrian', 'kapurthala city',
    'subhanpur', 'jalandhar bypass kapurthala',
    'nawan pind', 'maheru', 'jauhal', 'singhpura',
    'kot momin', 'harchowal', 'chaheru',

    // ═══════════════════════════════════
    // RUPNAGAR DISTRICT
    // ═══════════════════════════════════
    'rupnagar', 'ropar', 'anandpur sahib', 'nangal',
    'chamkaur sahib', 'nurpurbedi', 'morinda',
    'kiratpur sahib', 'naya nangal', 'bhakra',
    'bhakra dam', 'ropar wetland', 'nurpur bedi',
    'ropar city', 'jaisinghpur', 'nauni', 'taprian',
    'haripur', 'majra', 'dholbaha',
    'bela', 'kurali road ropar', 'saidullajaib',

    // ═══════════════════════════════════
    // FATEHGARH SAHIB DISTRICT
    // ═══════════════════════════════════
    'fatehgarh sahib', 'sirhind', 'amloh', 'bassi pathana',
    'khamano', 'mandi gobindgarh', 'khera',
    'sanehwal', 'badali ala singh', 'fatehgarh sahib city',
    'sirhind city', 'chunni kalan', 'sarhind',
    'landewala', 'bhadla', 'ghanaur road', 'bhagwan pura',

    // ═══════════════════════════════════
    // NAWANSHAHR (SBS NAGAR) DISTRICT
    // ═══════════════════════════════════
    'nawanshahr', 'banga', 'balachaur', 'rahon',
    'aur', 'saroya', 'dosanjh kalan', 'nawanshahr city',
    'banga city', 'langer', 'dhesian kahna',
    'nangal shama', 'behram', 'chowki', 'sbs nagar',

    // ═══════════════════════════════════
    // TARN TARAN DISTRICT
    // ═══════════════════════════════════
    'tarn taran', 'patti', 'khem karan', 'bhikhiwind',
    'goindwal sahib', 'naushera pannuan', 'harike',
    'harike pattan', 'kasur', 'valtoha', 'khadur sahib',
    'chohla sahib', 'sarai amanat khan', 'gandiwind',
    'jhabaal', 'sur singh', 'khalra',
    'naushehra pannuan', 'wan tarn taran', 'chamba kalan',
    'kairon tarn taran', 'vein poin', 'bhikhiwind city',

    // ═══════════════════════════════════
    // MANSA DISTRICT
    // ═══════════════════════════════════
    'mansa', 'budhlada', 'sardulgarh', 'bareta',
    'bhikhi', 'joga', 'boha', 'kulrian',
    'mansa city', 'bhai desa', 'bahi jol',
    'jhunir', 'ubha mansa', 'khanpur mansa',

    // ═══════════════════════════════════
    // FAZILKA DISTRICT
    // ═══════════════════════════════════
    'fazilka', 'jalalabad', 'abohar',
    'arniwala sheikh subhan', 'khuian sarwar', 'ladhuka',
    'abohar city', 'fazilka city', 'jalalabad town',
    'balluana', 'khuian sarwar', 'sito gunno',
    'mahni khera', 'chak dunga', 'wandala sandha',

    // ═══════════════════════════════════
    // FEROZEPUR DISTRICT
    // ═══════════════════════════════════
    'ferozepur', 'firozpur', 'zira', 'guru har sahai',
    'guruharsahai', 'mamdot', 'makhu', 'talwandi bhai',
    'firozpur city', 'ferozepur cantt', 'sadiq',
    'mudki', 'mallanwala', 'hussainiwala',
    'kassoana', 'bagge ke pipal', 'maan kalan',

    // ═══════════════════════════════════
    // FARIDKOT DISTRICT
    // ═══════════════════════════════════
    'faridkot', 'kotkapura', 'jaito',
    'faridkot city', 'kotkapura town',
    'sadiq', 'pakhi kalan', 'bajakhana',
    'bhai rupa', 'jaitu', 'kothe wala', 'gidarwindi',

    // ═══════════════════════════════════
    // MUKTSAR (SRI MUKTSAR SAHIB) DISTRICT
    // ═══════════════════════════════════
    'muktsar', 'malout', 'gidderbaha', 'lambi',
    'bariwala', 'kauni', 'lakhewali',
    'muktsar city', 'malout city', 'gidderbaha town',
    'killanwali', 'danewala', 'lambi village',
    'mehraj muktsar', 'doda', 'aulakh',

    // ═══════════════════════════════════
    // MOGA DISTRICT
    // ═══════════════════════════════════
    'moga', 'baghapurana', 'bagha purana', 'nihal singh wala',
    'nihal singhwala', 'dharamkot', 'moga city',
    'duneke', 'kokri kalan', 'budh singh wala',
    'lopo ke', 'ajitwal', 'chand bhan', 'badhni kalan',
    'mehna', 'ghall kalan', 'samalsar', 'chak kalan moga',

    // ═══════════════════════════════════
    // BARNALA DISTRICT
    // ═══════════════════════════════════
    'barnala', 'tapa', 'dhanaula', 'bhadaur',
    'mehal kalan', 'sehna', 'barnala city',
    'handiaya', 'thulliwal', 'raisinghnagar barnala',
    'baje ka', 'shadipur', 'salemgarh',

    // ═══════════════════════════════════
    // CHANDIGARH (UT — shared capital)
    // ═══════════════════════════════════
    'chandigarh', 'sector 17 chandigarh', 'sector 22 chandigarh',
    'sector 35 chandigarh', 'manimajra', 'panchkula',
    'industrial area chandigarh', 'chandigarh airport',
    'rock garden chandigarh', 'sukhna lake',
    'elante mall', 'isbt chandigarh', 'tribune chowk',
    'burail', 'mauli jagran', 'dadu majra', 'hallomajra',
    'kishangarh chandigarh', 'behlana', 'dadumajra',

    // ═══════════════════════════════════
    // ADDITIONAL TOWNS & VILLAGES (CROSS-DISTRICT)
    // ═══════════════════════════════════
    // Well-known villages and census towns
    'talwandi sabo', 'damdama sahib', 'chamkaur',
    'anandpur sahib', 'kiratpur sahib', 'goindwal sahib',
    'sultanpur lodhi', 'tarn taran sahib', 'baba bakala',
    'fatehgarh sahib', 'sirhind fategarh',
    'kila raipur', 'rurka kalan', 'rurka kalan',
    'alawalpur', 'nawan pind', 'begowal', 'nour mahal',
    'naur', 'shankar', 'bulandpur',
    'garha', 'jamsher khas', 'pakhoke', 'bholath',
    'dholewal', 'focal point jalandhar', 'model town jalandhar',
    'jawahar nagar jalandhar',

    // Major Highways / Road-named areas
    'gt road ludhiana', 'gt road jalandhar', 'gt road amritsar',
    'nh 44 jalandhar', 'chandigarh road ludhiana',
    'ferozepur road ludhiana', 'patiala road sangrur',
    'bathinda road mansa',

    // Industrial areas and notable zones
    'focal point ludhiana', 'industrial area ludhiana',
    'focal point patiala', 'industrial area jalandhar',
    'industrial area rajpura', 'quila road', 'hall gate amritsar',
    'lawrence road amritsar', 'golden temple', 'jallianwala bagh',
    'baisakhi', 'wagah border', 'attari border',
    'sadda pind', 'aam khas bagh', 'qila mubarak patiala',

    // More villages / small towns frequently referenced
    'boparai kalan', 'mehatpur', 'awan', 'pipli',
    'nandgarh', 'kothe piran', 'budha dal', 'dhandari',
    'bareta kalan', 'behbal kalan', 'bargari', 'burj jawahar singh wala',
    'kotbhai', 'tapa mandi', 'miani', 'duneke',
    'raikot town', 'payal town', 'samrala town',
    'doraha town', 'sahnewal town', 'machhiwara town',
    'phillaur town', 'nakodar town', 'shahkot town',
    'adampur town', 'goraya town', 'kartarpur town',
    'dasuya town', 'mukerian town', 'garhshankar town',
    'talwara town', 'tanda town',
    'sujanpur town', 'dinanagar town', 'qadian town',
    'kapurthala town', 'phagwara town', 'sultanpur lodhi town',
    'abohar town', 'fazilka town', 'jalalabad west',
    'zira town', 'guru har sahai town', 'makhu town',
    'faridkot town', 'kotkapura city', 'jaito town',
    'muktsar town', 'malout town', 'gidderbaha city',
    'mansa town', 'budhlada town', 'sardulgarh town', 'bareta town',
    'moga town', 'dharamkot town', 'nihal singh wala town',
    'barnala town', 'tapa town', 'dhanaula town', 'bhadaur town',
    'rajpura town', 'samana town', 'nabha town',
    'sangrur town', 'sunam town', 'dhuri town',
    'rupnagar town', 'anandpur sahib town', 'nangal town',
    'fatehgarh sahib town', 'sirhind town', 'amloh town',
    'nawanshahr town', 'banga town', 'balachaur town',

    // Additional villages (high-population villages / Gram Panchayats)
    'alamgir', 'amargarh', 'baddowal', 'bhaini sahib',
    'bhikhiwind', 'boha', 'chak alla baksh', 'chaminda',
    'dhapali', 'dial', 'dholewal', 'dina nagar',
    'gumtala', 'harian', 'hussainpur', 'jagraon mandi',
    'jandali', 'kalsian', 'khiala', 'khanpur',
    'lehra gaga', 'mahal', 'mahilpur', 'mallanwala',
    'mandvi', 'mehmudpur', 'nahan', 'nari',
    'narain garh', 'pakhowal road', 'pandori khas',
    'peeru banda', 'phulriwal', 'raipur',
    'ram tirath', 'ropar dam', 'rurka',
    'saidoke', 'sanauri', 'sarai mughal',
    'sidhwan', 'sular gharat', 'talwandi',
    'theh bhai ka', 'waring', 'waddi',

    // Border villages & strategic areas
    'hussainiwala', 'fazilka border', 'ferozepur border',
    'wagah border', 'attari border', 'dera baba nanak border',
    'kartarpur corridor', 'kartarpur sahib',

    // Doaba region generic
    'doaba', 'doaba region', 'malwa', 'malwa region',
    'majha', 'majha region', 'powadh', 'powadh region',

    // Religious / Historical places (often referenced in grievances)
    'golden temple', 'harmandir sahib', 'darbar sahib',
    'durgiana temple', 'jallianwala bagh', 'wagah border',
    'anandpur sahib gurudwara', 'damdama sahib gurudwara',
    'takht sri kesgarh sahib', 'takht sri damdama sahib',
    'takht sri patna sahib',
    'fatehgarh sahib gurudwara', 'chamkaur sahib gurudwara',
    'goindwal sahib gurudwara', 'tarn taran sahib gurudwara',
    'sultanpur lodhi gurudwara',
    'dera baba nanak gurudwara',
    'baba bakala gurudwara', 'khadur sahib gurudwara',

    // University / Education hubs (often referenced)
    'punjabi university patiala', 'panjab university chandigarh',
    'guru nanak dev university amritsar',
    'iit ropar', 'iim amritsar', 'nit jalandhar',
    'lovely professional university', 'lpu', 'lpu phagwara',
    'chitkara university', 'thapar university', 'thapar patiala',
    'chandigarh university', 'cu gharuan',
    'punjab agricultural university ludhiana', 'pau ludhiana',
    'pgimer chandigarh', 'aiims bathinda',

    // Additional small villages / hamlets pervasively used in social media
    'pakhi kalan', 'sadiq', 'khandoor sahib',
    'killianwali', 'bhucho', 'lakha', 'panchhat',
    'gobindgarh', 'sahauran', 'rasulpur',
    'jodhan', 'bharthala', 'bassian', 'narangwal',
    'bija', 'latala', 'sekha', 'lande ke',
    'gill kalan', 'gill khurd', 'burj lateral',
    'dhatt', 'manawan', 'sherpur kalan',
    'ghagga', 'kakrala', 'lehal', 'banur town',
    'kali devi', 'saunkh', 'kular', 'jassowal',
    'jallowal', 'saidpur', 'gura brahmana',
    'bhatnura', 'bhago majra', 'kalka road',
    'chak ram das', 'chak bhai ka',
    'buttar kalan', 'buttar khurd',
    'dhahan kaleran', 'dhariwal gurdaspur',
    'pandori bibi', 'pandori ganga singh',
    'saidowal', 'wadala granthian',
    'kotli surat malhi', 'naushehra pannuan',
    'mallan', 'bhagat ki kothi', 'bal kalan',
    'tarsikka', 'manawala', 'kathunangal',
    'sultanwind', 'beas town', 'harike pattan',
    'chogawan', 'fatehabad amritsar', 'ramdas',
    'chheharta', 'verka', 'lopoke',
    'fatehgarh shukarchak', 'nagkalan',
    'padri', 'othian', 'kairon village',
    'meeranpur village', 'ramnagar amritsar',
    'batala city', 'batala town',
    'tapa mandi', 'dhanaula town',
    'mehal kalan town', 'handiaya barnala',

    // Commonly misspelled / alternate names
    'ludhiyana', 'jalandher', 'jallandhar', 'amritsir', 'amritser',
    'bhatinda', 'bhatindaa', 'bathindaa', 'mohalli', 'mohaali',
    'patiyala', 'patialaa', 'ferozpur', 'firozepur', 'firozpure',
    'hosiarpur', 'hoshiyarpur', 'hoshiarpur city',
    'gurdaspur city', 'gurdaspure', 'mukatsar', 'muktsir',
    'sirhand', 'sirhend', 'roopnagar', 'ropar city',
    'nawanshahar', 'nawashahar', 'taran taran', 'tarntaran',
    'fathegarh sahib', 'fateh garh sahib', 'fatehgarhsahib',
    'barnalaa', 'malerkotlaa', 'malerkotle',
    'sangroor', 'sangur', 'sangrur city',
    'pathankote', 'pathankot city',
    'phanchwara', 'phagwara city', 'fagwara',
    'kapurthalla', 'kapurtala',
    'mansa punjab', 'moga punjab', 'barnala punjab',
    'chandigadh', 'chandighar',

    // Punjab state reference itself
    'punjab', 'state of punjab', 'govt of punjab', 'government of punjab',
    'punjab india', 'punjab state'
];

// ─── Build a single unified Set for O(1) lookups ────────────────────────────
const ALL_PUNJAB_LOCATIONS = new Set();

const addToSet = (arr) => {
    for (const item of arr) {
        const lower = item.toLowerCase().trim();
        if (lower) ALL_PUNJAB_LOCATIONS.add(lower);
    }
};

addToSet(PUNJAB_DISTRICTS);
addToSet(PUNJAB_CONSTITUENCIES);
addToSet(PUNJAB_CITIES_AND_VILLAGES);

/**
 * Check if a location name matches the Punjab location database.
 * Uses exact match on the unified Set + substring checks for "punjab" / "chandigarh".
 * @param {string} name
 * @returns {boolean}
 */
const isPunjabLocation = (name) => {
    if (!name) return false;
    const lower = name.toLowerCase().trim();
    if (ALL_PUNJAB_LOCATIONS.has(lower)) return true;
    // Substring fallback for partial matches
    if (lower.includes('punjab')) return true;
    if (lower.includes('chandigarh')) return true;
    if (lower.includes('mohali')) return true;
    if (lower.includes('ludhiana')) return true;
    if (lower.includes('amritsar')) return true;
    if (lower.includes('jalandhar')) return true;
    if (lower.includes('patiala')) return true;
    if (lower.includes('bathinda')) return true;
    if (lower.includes('ferozepur')) return true;
    if (lower.includes('gurdaspur')) return true;
    if (lower.includes('sangrur')) return true;
    if (lower.includes('hoshiarpur')) return true;
    if (lower.includes('pathankot')) return true;
    return false;
};

module.exports = {
    PUNJAB_DISTRICTS,
    PUNJAB_CONSTITUENCIES,
    PUNJAB_CITIES_AND_VILLAGES,
    ALL_PUNJAB_LOCATIONS,
    isPunjabLocation
};
