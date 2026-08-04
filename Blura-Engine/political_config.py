"""
Political Saga configuration for Telangana — Blura Engine.
RSS feeds, keywords, category rules — covering Indian national politics,
Telangana state, and constituency-level news (INC / BRS / BJP / AIMIM).
"""

# ── RSS Feeds ──────────────────────────────────────────────────────────────────
RSS_FEEDS = [
    # ── National English ────────────────────────────────────────
    {"url": "https://www.ndtv.com/feed/india-news",                         "source_name": "NDTV India",               "language": "en"},
    {"url": "https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms", "source_name": "Times of India National",  "language": "en"},
    {"url": "https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml", "source_name": "Hindustan Times India","language": "en"},
    {"url": "https://www.thehindu.com/news/national/feeder/default.rss",    "source_name": "The Hindu National",       "language": "en"},
    {"url": "https://www.theprint.in/feed/",                                "source_name": "The Print",                "language": "en"},
    {"url": "https://scroll.in/feed",                                       "source_name": "Scroll India",             "language": "en"},
    {"url": "https://www.indiatoday.in/rss/1206514",                        "source_name": "India Today",              "language": "en"},
    {"url": "https://www.news18.com/rss/politics/politics.xml",             "source_name": "News18 Politics",          "language": "en"},
    {"url": "https://www.business-standard.com/rss/politics-and-economy-0.rss", "source_name": "Business Standard Politics", "language": "en"},
    {"url": "https://www.livemint.com/rss/politics",                        "source_name": "LiveMint Politics",        "language": "en"},

    # ── Telangana English Feeds & Google News ──────────────────────
    {"url": "https://www.thehindu.com/news/national/telangana/feeder/default.rss", "source_name": "The Hindu Telangana", "language": "en"},
    {"url": "https://timesofindia.indiatimes.com/rssfeeds/-2128816011.cms", "source_name": "TOI Hyderabad",            "language": "en"},
    {"url": "https://telanganatoday.com/feed",                             "source_name": "Telangana Today",          "language": "en"},
    {"url": "https://www.deccanchronicle.com/rss/nation/current-affairs",  "source_name": "Deccan Chronicle",         "language": "en"},
    {"url": "https://www.siasat.com/feed/",                                "source_name": "The Siasat Daily",         "language": "en"},
    {"url": "https://news.google.com/rss/search?q=%22Telangana+politics%22+OR+BRS+OR+%22Telangana+Congress%22+OR+AIMIM&hl=en-IN&gl=IN&ceid=IN:en", "source_name": "Google News – TG Politics EN", "language": "en", "follow_redirect": True},
    {"url": "https://news.google.com/rss/search?q=%22Revanth+Reddy%22+OR+%22KCR%22+OR+%22KT+Rama+Rao%22+OR+%22Harish+Rao%22+OR+%22Bhatti+Vikramarka%22&hl=en-IN&gl=IN&ceid=IN:en", "source_name": "Google News – TG Leaders EN", "language": "en", "follow_redirect": True},
    {"url": "https://news.google.com/rss/search?q=Kaleshwaram+OR+%22Musi+riverfront%22+OR+%22Regional+Ring+Road%22+OR+%22Future+City%22&hl=en-IN&gl=IN&ceid=IN:en", "source_name": "Google News – TG Projects", "language": "en", "follow_redirect": True},
    {"url": "https://news.google.com/rss/search?q=Telangana+government+OR+welfare+OR+%22Rythu+Bharosa%22+OR+%22Gruha+Jyothi%22&hl=en-IN&gl=IN&ceid=IN:en", "source_name": "Google News – TG Welfare EN", "language": "en", "follow_redirect": True},

    # ── Telugu Portals & Feeds (Google News Telugu) ─────────────────
    {"url": "https://news.google.com/rss/search?q=Telangana+politics&hl=te&gl=IN&ceid=IN:te", "source_name": "Google News Telugu – TG Politics", "language": "te", "follow_redirect": True},
    # "రేవంత్ రెడ్డి OR కేసీఆర్ OR కేటీఆర్ OR హరీష్ రావు"
    {"url": "https://news.google.com/rss/search?q=%E0%B0%B0%E0%B1%87%E0%B0%B5%E0%B0%82%E0%B0%A4%E0%B1%8D+%E0%B0%B0%E0%B1%86%E0%B0%A1%E0%B1%8D%E0%B0%A1%E0%B0%BF+OR+%E0%B0%95%E0%B1%87%E0%B0%B8%E0%B1%80%E0%B0%86%E0%B0%B0%E0%B1%8D+OR+%E0%B0%95%E0%B1%87%E0%B0%9F%E0%B1%80%E0%B0%86%E0%B0%B0%E0%B1%8D+OR+%E0%B0%B9%E0%B0%B0%E0%B1%80%E0%B0%B7%E0%B1%8D+%E0%B0%B0%E0%B0%BE%E0%B0%B5%E0%B1%81&hl=te&gl=IN&ceid=IN:te", "source_name": "Google News Telugu – TG Leaders", "language": "te", "follow_redirect": True},
    {"url": "https://news.google.com/rss/search?q=Telangana+source:Eenadu&hl=te&gl=IN&ceid=IN:te", "source_name": "Google News – Eenadu Telangana", "language": "te", "follow_redirect": True},
    {"url": "https://news.google.com/rss/search?q=Telangana+source:Sakshi&hl=te&gl=IN&ceid=IN:te", "source_name": "Google News – Sakshi Telangana", "language": "te", "follow_redirect": True},
    {"url": "https://news.google.com/rss/search?q=Telangana+source:Namasthe+Telangana&hl=te&gl=IN&ceid=IN:te", "source_name": "Google News – Namasthe Telangana", "language": "te", "follow_redirect": True},
    {"url": "https://news.google.com/rss/search?q=Telangana+source:V6+Velugu&hl=te&gl=IN&ceid=IN:te", "source_name": "Google News – V6 Velugu", "language": "te", "follow_redirect": True},
    {"url": "https://news.google.com/rss/search?q=Telangana+source:TV9+Telugu&hl=te&gl=IN&ceid=IN:te", "source_name": "Google News – TV9 Telugu TG", "language": "te", "follow_redirect": True},
    {"url": "https://news.google.com/rss/search?q=Telangana+source:NTV+Telugu&hl=te&gl=IN&ceid=IN:te", "source_name": "Google News – NTV Telugu TG", "language": "te", "follow_redirect": True},
    {"url": "https://www.v6velugu.com/feed/", "source_name": "V6 Velugu News Portal", "language": "te"},
    {"url": "https://telugu.samayam.com/telangana/rssfeeds/48317770.cms", "source_name": "Samayam Telugu Telangana", "language": "te"},
    {"url": "https://telugu.oneindia.com/rss/feeds/telugu-telangana-news-fb.xml", "source_name": "OneIndia Telugu Telangana", "language": "te"},

    # ── Constituency-focused Telugu papers (Kodangal & Madhira) ──────
    # Per-outlet feeds so we can see WHICH paper (Sakshi / Eenadu /
    # Namasthe Telangana / NTV) is covering our key seats and what they
    # publish — the source_name carries the outlet, which powers booth-level
    # narrative monitoring. (Google News source: queries are used because
    # these portals don't publish per-district RSS directly.)
    # Kodangal = CM Revanth Reddy's seat; Madhira = Dy CM Bhatti Vikramarka's.
    {"url": "https://news.google.com/rss/search?q=Kodangal+source:Sakshi&hl=te&gl=IN&ceid=IN:te",              "source_name": "Sakshi – Kodangal",              "language": "te", "follow_redirect": True},
    {"url": "https://news.google.com/rss/search?q=Kodangal+source:Eenadu&hl=te&gl=IN&ceid=IN:te",              "source_name": "Eenadu – Kodangal",              "language": "te", "follow_redirect": True},
    {"url": "https://news.google.com/rss/search?q=Kodangal+source:Namasthe+Telangana&hl=te&gl=IN&ceid=IN:te",  "source_name": "Namasthe Telangana – Kodangal",  "language": "te", "follow_redirect": True},
    {"url": "https://news.google.com/rss/search?q=Kodangal+source:NTV+Telugu&hl=te&gl=IN&ceid=IN:te",          "source_name": "NTV Telugu – Kodangal",          "language": "te", "follow_redirect": True},
    {"url": "https://news.google.com/rss/search?q=Madhira+source:Sakshi&hl=te&gl=IN&ceid=IN:te",               "source_name": "Sakshi – Madhira",               "language": "te", "follow_redirect": True},
    {"url": "https://news.google.com/rss/search?q=Madhira+source:Eenadu&hl=te&gl=IN&ceid=IN:te",               "source_name": "Eenadu – Madhira",               "language": "te", "follow_redirect": True},
    {"url": "https://news.google.com/rss/search?q=Madhira+source:Namasthe+Telangana&hl=te&gl=IN&ceid=IN:te",   "source_name": "Namasthe Telangana – Madhira",   "language": "te", "follow_redirect": True},
    {"url": "https://news.google.com/rss/search?q=Madhira+source:NTV+Telugu&hl=te&gl=IN&ceid=IN:te",           "source_name": "NTV Telugu – Madhira",           "language": "te", "follow_redirect": True},
]

# ── Per-district Telugu coverage (all 31 mapped Telangana districts) ─────────
# The Telugu portals (Sakshi, Eenadu, Namasthe Telangana, …) organise news by
# district but don't expose per-district RSS, so we pull each district's Telugu
# news via Google News. detect_district() tags each article to its district, and
# the backend's `constituencymasters` collection maps district -> constituencies
# — so this one feed-per-district set covers every constituency
# (Kodangal ⊂ Vikarabad, Madhira ⊂ Khammam, …) for booth-level monitoring.
#
# The canonical names below MUST match the district labels produced by
# backend/src/config/districtNormalizer.js, which are in turn the districts
# present in telangana_districts.geojson. Hanamkonda and Mulugu are absent
# because the source shapefile predates their creation; they fold into Warangal
# and Jayashankar Bhupalapally respectively (search terms include them so their
# news is still collected).
#
# (canonical district, search term for Google News)
TELANGANA_DISTRICTS = [
    ('Adilabad',                  'Adilabad'),
    ('Bhadradri Kothagudem',      'Bhadradri Kothagudem'),
    ('Hyderabad',                 'Hyderabad'),
    ('Jagtial',                   'Jagtial'),
    ('Jangaon',                   'Jangaon'),
    ('Jayashankar Bhupalapally',  'Bhupalpally Mulugu'),
    ('Jogulamba Gadwal',          'Jogulamba Gadwal'),
    ('Kamareddy',                 'Kamareddy'),
    ('Karimnagar',                'Karimnagar'),
    ('Khammam',                   'Khammam'),
    ('Kumuram Bheem Asifabad',    'Kumuram Bheem Asifabad'),
    ('Mahabubabad',               'Mahabubabad'),
    ('Mahabubnagar',              'Mahabubnagar'),
    ('Mancherial',                'Mancherial'),
    ('Medak',                     'Medak'),
    ('Medchal-Malkajgiri',        'Medchal Malkajgiri'),
    ('Nagarkurnool',              'Nagarkurnool'),
    ('Nalgonda',                  'Nalgonda'),
    ('Narayanpet',                'Narayanpet'),
    ('Nirmal',                    'Nirmal'),
    ('Nizamabad',                 'Nizamabad'),
    ('Peddapalli',                'Peddapalli'),
    ('Rajanna Sircilla',          'Rajanna Sircilla'),
    ('Rangareddy',                'Ranga Reddy'),
    ('Sangareddy',                'Sangareddy'),
    ('Siddipet',                  'Siddipet'),
    ('Suryapet',                  'Suryapet'),
    ('Vikarabad',                 'Vikarabad'),
    ('Wanaparthy',                'Wanaparthy'),
    ('Warangal',                  'Warangal Hanamkonda'),
    ('Yadadri Bhuvanagiri',       'Yadadri Bhuvanagiri'),
]

# Legacy alias — the AP build exported this name.
AP_DISTRICTS = TELANGANA_DISTRICTS


def _district_feed(canonical, search):
    from urllib.parse import quote_plus
    query = quote_plus(f"{search} Telangana")
    return {
        "url": f"https://news.google.com/rss/search?q={query}&hl=te&gl=IN&ceid=IN:te",
        "source_name": f"TG District – {canonical}",
        "language": "te",
        "district": canonical,   # attached to each article (see political_rss.process_feed)
        "follow_redirect": True,
    }


RSS_FEEDS += [_district_feed(canonical, search) for canonical, search in TELANGANA_DISTRICTS]

# Fetch Telugu (and the district) feeds FIRST each cycle. A single run can be
# slow, so front-loading the priority Telugu coverage guarantees it's collected
# even if a run doesn't get through every English national feed. Python's sort
# is stable, so the original order within each language group is preserved.
RSS_FEEDS.sort(key=lambda f: 0 if f.get('language') == 'te' else 1)

# ── Relevance filter keywords (any 1 match = relevant) ───────────────────────
POLITICAL_RELEVANCE_KEYWORDS = [
    # ── Key Telangana leaders — ours ──
    'revanth reddy', 'revanth', 'anumula revanth', 'telangana cm',
    'bhatti vikramarka', 'bhatti', 'uttam kumar reddy', 'sridhar babu',
    'ponnam prabhakar', 'seethakka', 'komatireddy', 'konda surekha', 'jupally',
    'రేవంత్ రెడ్డి', 'రేవంత్', 'భట్టి విక్రమార్క', 'ఉత్తమ్ కుమార్ రెడ్డి', 'సీతక్క',

    # ── Key Telangana leaders — opposition ──
    'kcr', 'chandrashekar rao', 'ktr', 'rama rao', 'harish rao',
    'kishan reddy', 'bandi sanjay', 'eatala rajender', 'owaisi', 'asaduddin owaisi',
    'కేసీఆర్', 'కేటీఆర్', 'హరీష్ రావు', 'ఒవైసీ', 'బండి సంజయ్', 'ఈటల',

    # ── Key parties & topics ──
    'telangana congress', 'tpcc', 'inc telangana', 'congress government',
    'brs', 'trs', 'bharat rashtra samithi', 'telangana rashtra samithi',
    'bjp telangana', 'aimim', 'mim', 'majlis',
    'telangana politics', 'telangana assembly', 'telangana elections',
    'assembly elections', 'six guarantees', 'praja palana', 'praja darbar',
    'కాంగ్రెస్', 'బీఆర్ఎస్', 'టీఆర్ఎస్', 'బీజేపీ', 'ఎంఐఎం',
    'తెలంగాణ రాజకీయాలు', 'ప్రజాపాలన', 'ఆరు గ్యారంటీలు',

    # ── Key regions / issues ──
    'hyderabad', 'secunderabad', 'warangal', 'karimnagar', 'nizamabad',
    'khammam', 'nalgonda', 'mahabubnagar', 'kodangal', 'gajwel', 'sircilla',
    'kaleshwaram', 'musi river', 'musi riverfront', 'regional ring road',
    'rythu bharosa', 'rythu bandhu', 'gruha jyothi', 'indiramma', 'arogyasri',
    'kalyana lakshmi', 'shaadi mubarak', 'loan waiver', 'formula e',
    'group 1', 'group 2', 'tgpsc', 'tspsc', 'pension', 'welfare scheme',
    'హైదరాబాద్', 'వరంగల్', 'కరీంనగర్', 'నిజామాబాద్', 'ఖమ్మం', 'నల్గొండ',
    'కాళేశ్వరం', 'మూసీ', 'రైతు భరోసా', 'గృహజ్యోతి', 'ఇందిరమ్మ', 'రుణమాఫీ', 'పెన్షన్'
]

# ── Category classification keywords ─────────────────────────────────────────
CATEGORY_KEYWORDS = {
    'crime': [
        # English
        'crime', 'murder', 'theft', 'robbery', 'rape', 'assault', 'arrested', 'gangster',
        'drug', 'drugs', 'narcotics', 'smuggling', 'fraud', 'scam', 'kidnap', 'extortion',
        'police', 'fir', 'case registered', 'nabbed', 'caught', 'crime branch',
        'corruption', 'bribery', 'embezzlement', 'money laundering', 'disproportionate assets',
        # Telugu
        'నేరం', 'హత్య', 'అరెస్ట్', 'దోపిడీ', 'అవినీతి', 'స్మగ్లింగ్', 'పోలీస్'
    ],
    'politics': [
        # English
        'politics', 'political', 'election', 'vote', 'congress', 'brs', 'trs', 'bjp', 'aimim',
        'mla', 'mp', 'mlc', 'minister', 'cabinet', 'assembly', 'parliament', 'rally', 'campaign',
        'revanth', 'kcr', 'ktr', 'harish rao', 'owaisi', 'bhatti',
        'lok sabha', 'vidhan sabha', 'constituency', 'party', 'governance',
        'opposition', 'ruling', 'coalition', 'alliance', 'seat', 'candidate', 'defection',
        # Telugu
        'రాజకీయాలు', 'ఎన్నికలు', 'ఓటు', 'అసెంబ్లీ', 'ముఖ్యమంత్రి', 'ప్రభుత్వం', 'ఫిరాయింపు'
    ],
    'development': [
        # English
        'development', 'infrastructure', 'project', 'scheme', 'highway', 'bridge',
        'metro', 'flyover', 'smart city', 'industrial', 'investment', 'tender',
        'construction', 'inaugurate', 'launch', 'upgrade', 'fund released',
        'mission', 'welfare', 'yojana', 'kaleshwaram project', 'musi riverfront',
        'regional ring road', 'future city', 'metro rail expansion',
        'sewage', 'drain', 'drainage', 'road repair', 'streetlight', 'water supply',
        # Telugu
        'అభివృద్ధి', 'ప్రాజెక్ట్', 'పథకం', 'నిర్మాణం', 'మెట్రో', 'కాళేశ్వరం', 'మూసీ'
    ],
    'communal': [
        # English
        'communal', 'riot', 'religious', 'temple', 'mosque', 'church', 'mandir', 'masjid',
        'conversion', 'yadadri temple', 'bhadrachalam', 'bonalu', 'bathukamma',
        'festival', 'minority', 'majority', 'hindu', 'muslim', 'christian',
        'old city', 'waqf', 'reservation',
        # Telugu
        'మతపరమైన', 'ఆలయం', 'యాదాద్రి', 'భద్రాచలం', 'బోనాలు', 'బతుకమ్మ', 'మత మార్పిడి'
    ],
    'law_order': [
        # English
        'law', 'order', 'curfew', 'protest', 'agitation', 'strike', 'bandh',
        'section 144', 'lathi charge', 'riot', 'unrest', 'demonstration',
        'crackdown', 'operation', 'nia', 'cbi', 'cid', 'police clash',
        # Telugu
        'శాంతిభద్రతలు', 'నిరసన', 'లాఠీఛార్జ్', 'ధర్నా', 'బంధ్', 'కర్ఫ్యూ'
    ]
}

# ── Telangana location mapping ────────────────────────────────────────────────
LOCATION_KEYWORDS = {
    'Hyderabad':      ['hyderabad', 'హైదరాబాద్', 'ghmc', 'charminar', 'old city'],
    'Secunderabad':   ['secunderabad', 'సికింద్రాబాద్', 'cantonment'],
    'Warangal':       ['warangal', 'వరంగల్', 'hanamkonda', 'హనుమకొండ'],
    'Karimnagar':     ['karimnagar', 'కరీంనగర్'],
    'Nizamabad':      ['nizamabad', 'నిజామాబాద్'],
    'Khammam':        ['khammam', 'ఖమ్మం'],
    'Nalgonda':       ['nalgonda', 'నల్గొండ'],
    'Mahabubnagar':   ['mahabubnagar', 'mahbubnagar', 'మహబూబ్‌నగర్', 'palamuru'],
    'Adilabad':       ['adilabad', 'ఆదిలాబాద్'],
    'Siddipet':       ['siddipet', 'సిద్దిపేట'],
    'Sangareddy':     ['sangareddy', 'సంగారెడ్డి'],
    'Rangareddy':     ['rangareddy', 'ranga reddy', 'రంగారెడ్డి'],
    'Medak':          ['medak', 'మెదక్'],
    'Kodangal':       ['kodangal', 'కొడంగల్'],
    'Madhira':        ['madhira', 'మధిర'],
    'Gajwel':         ['gajwel', 'గజ్వేల్'],
    'Sircilla':       ['sircilla', 'సిరిసిల్ల', 'rajanna sircilla'],
    'Suryapet':       ['suryapet', 'సూర్యాపేట'],
    'Nagarkurnool':   ['nagarkurnool', 'నాగర్‌కర్నూల్'],
    'Vikarabad':      ['vikarabad', 'వికారాబాద్'],
    'Bhadrachalam':   ['bhadrachalam', 'భద్రాచలం', 'bhadradri'],
    'Yadadri':        ['yadadri', 'యాదాద్రి', 'bhuvanagiri', 'bhongir'],
}

# ── Telangana centroid Lat/Lng ────────────────────────────────────────────────
TELANGANA_LAT = 17.9784
TELANGANA_LNG = 79.5941

# Aliases for compatibility with the AP-era module names.
ANDHRA_LAT = TELANGANA_LAT
ANDHRA_LNG = TELANGANA_LNG
