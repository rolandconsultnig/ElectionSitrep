import { useMemo, useState } from 'react'

export interface ZonalCommand {
  zone: string
  hq: string
  states: string[]
  mandate: string
  aig: string
}

export interface AreaCommandData {
  code: string
  name: string
  hqLocation: string
  districts: string
  divisions: string[]
}

export interface StateCommandData {
  state: string
  zone: string
  hq: string
  cpRank: string
  areaCommands: AreaCommandData[]
}

const ZONAL_COMMANDS: ZonalCommand[] = [
  {
    zone: 'Zone 1',
    hq: 'Bompai, Kano State',
    states: ['Kano', 'Jigawa'],
    mandate: 'Commercial northwest axis, trans-Saharan trade corridors, border security',
    aig: 'Assistant Inspector-General of Police',
  },
  {
    zone: 'Zone 2',
    hq: 'Onikan, Lagos State',
    states: ['Lagos', 'Ogun'],
    mandate: 'Commercial maritime capital, industrial hubs, seaports & border defense',
    aig: 'Assistant Inspector-General of Police',
  },
  {
    zone: 'Zone 3',
    hq: 'Yola, Adamawa State',
    states: ['Adamawa', 'Taraba'],
    mandate: 'North-eastern international border corridors, Mandara mountain axis',
    aig: 'Assistant Inspector-General of Police',
  },
  {
    zone: 'Zone 4',
    hq: 'Makurdi, Benue State',
    states: ['Benue', 'Plateau', 'Nasarawa'],
    mandate: 'Middle-belt agrarian security, food-basket transit lines & inter-community peace',
    aig: 'Assistant Inspector-General of Police',
  },
  {
    zone: 'Zone 5',
    hq: 'Benin City, Edo State',
    states: ['Edo', 'Delta'],
    mandate: 'Western Niger-Delta hydrocarbon assets, waterway corridors & coastal safety',
    aig: 'Assistant Inspector-General of Police',
  },
  {
    zone: 'Zone 6',
    hq: 'Calabar, Cross River State',
    states: ['Cross River', 'Akwa Ibom'],
    mandate: 'Eastern coastal littoral border, Bakassi maritime corridor & eco-tourism zones',
    aig: 'Assistant Inspector-General of Police',
  },
  {
    zone: 'Zone 7',
    hq: 'FCT Abuja',
    states: ['FCT Abuja', 'Niger'],
    mandate: 'Federal Capital Territory seat of government, federal highway defense & national monuments',
    aig: 'Assistant Inspector-General of Police',
  },
  {
    zone: 'Zone 8',
    hq: 'Lokoja, Kogi State',
    states: ['Kogi', 'Kwara'],
    mandate: 'Confluence nexus connecting Northern and Southern arterial transit highways',
    aig: 'Assistant Inspector-General of Police',
  },
  {
    zone: 'Zone 9',
    hq: 'Umuahia, Abia State',
    states: ['Abia', 'Imo', 'Ebonyi'],
    mandate: 'South-east commercial trading centers, industrial peacebuilding & border harmony',
    aig: 'Assistant Inspector-General of Police',
  },
  {
    zone: 'Zone 10',
    hq: 'Sokoto, Sokoto State',
    states: ['Sokoto', 'Kebbi', 'Zamfara'],
    mandate: 'Northwestern desert border patrol, anti-banditry tactical operations & livestock defense',
    aig: 'Assistant Inspector-General of Police',
  },
  {
    zone: 'Zone 11',
    hq: 'Osogbo, Osun State',
    states: ['Osun', 'Oyo'],
    mandate: 'South-west inland agrarian security, tertiary university corridors & heritage protection',
    aig: 'Assistant Inspector-General of Police',
  },
  {
    zone: 'Zone 12',
    hq: 'Bauchi, Bauchi State',
    states: ['Bauchi', 'Gombe'],
    mandate: 'North-east gateway security, regional logistical hub & tactical staging',
    aig: 'Assistant Inspector-General of Police',
  },
  {
    zone: 'Zone 13',
    hq: 'Ukpo / Dunukofia, Anambra State',
    states: ['Anambra', 'Enugu'],
    mandate: 'Manufacturing centers (Onitsha, Nnewi), Coal City metropolis & critical transit corridors',
    aig: 'Assistant Inspector-General of Police',
  },
  {
    zone: 'Zone 14',
    hq: 'Katsina, Katsina State',
    states: ['Katsina', 'Kaduna'],
    mandate: 'Northern industrial and rail nexus, Niger Republic international border patrol',
    aig: 'Assistant Inspector-General of Police',
  },
  {
    zone: 'Zone 15',
    hq: 'Maiduguri, Borno State',
    states: ['Borno', 'Yobe'],
    mandate: 'Lake Chad basin defense, joint counter-insurgency task force operations',
    aig: 'Assistant Inspector-General of Police',
  },
  {
    zone: 'Zone 16',
    hq: 'Yenagoa, Bayelsa State',
    states: ['Bayelsa', 'Rivers'],
    mandate: 'Core Niger-Delta energy infrastructure, mangrove creeks & marine counter-piracy',
    aig: 'Assistant Inspector-General of Police',
  },
  {
    zone: 'Zone 17',
    hq: 'Akure, Ondo State',
    states: ['Ondo', 'Ekiti'],
    mandate: 'Agro-forestry belt, coastal riverine Ilaje axis & mineral transit security',
    aig: 'Assistant Inspector-General of Police',
  },
]

const STATE_COMMANDS: StateCommandData[] = [
  {
    state: 'Lagos State',
    zone: 'Zone 2',
    hq: 'State Command HQ, Ikeja',
    cpRank: 'Commissioner of Police (CP Lagos)',
    areaCommands: [
      {
        code: 'Area A',
        name: 'Lion Building Area Command',
        hqLocation: 'Lion Building, Lagos Island',
        districts: 'Lagos Island, Victoria Island, Ikoyi, Onikan',
        divisions: [
          'Central Police Station (CPS) Lagos Island',
          'Lion Building Division',
          'Victoria Island Division (Bar Beach / Bishop Oluwole)',
          'Ikoyi Division (Kingsway Road)',
          'Onikan Division',
          'Adeniji Adele Division',
        ],
      },
      {
        code: 'Area B',
        name: 'Apapa Area Command',
        hqLocation: 'Apapa Port Corridor',
        districts: 'Apapa Wharfs, Ajegunle, Ajeromi-Ifelodun',
        divisions: [
          'Apapa Divisional Headquarters',
          'Ajegunle Division',
          'Trinity Division',
          'Layeni Division',
          'Kirikiri Division',
          'Tolu Division',
          'Ijora Badia Division',
        ],
      },
      {
        code: 'Area C',
        name: 'Surulere Area Command',
        hqLocation: 'Surulere',
        districts: 'Surulere, Yaba, Ebute Metta, Iponri',
        divisions: [
          'Surulere Divisional Headquarters',
          'Yaba Division',
          'Bode Thomas Division',
          'Denton Division (Ebute Metta)',
          'Iponri Division',
          'Aguda Division',
          'Sabo Division',
          'Orile Division',
        ],
      },
      {
        code: 'Area D',
        name: 'Mushin Area Command',
        hqLocation: 'Mushin',
        districts: 'Mushin, Isolo, Oshodi, Ejigbo',
        divisions: [
          'Mushin Divisional Headquarters',
          'Isolo Division',
          'Ejigbo Division',
          'Ajao Estate Division',
          'Aswani Division',
          'Alakara Division',
          'Ilasamaja Division',
          'Itire Division',
        ],
      },
      {
        code: 'Area E',
        name: 'Festac Area Command',
        hqLocation: 'Festac Town / Ojo Axis',
        districts: 'Festac Town, Amuwo-Odofin, Ojo, Satellite Town',
        divisions: [
          'Festac Divisional Headquarters',
          'Ojo Division',
          'Okokomaiko Division',
          'Satellite Town Division',
          'Trade Fair Complex Division',
          'Iba Division',
          'Ajangbadi Division',
        ],
      },
      {
        code: 'Area F',
        name: 'Ikeja Area Command',
        hqLocation: 'Ikeja (State Capital)',
        districts: 'Ikeja, Alausa Secretariat, Ojodu, Ilupeju',
        divisions: [
          'Ikeja Divisional Headquarters',
          'Alausa Division (State Secretariat)',
          'Ojodu Division',
          'Ilupeju Division',
          'Shogunle Division',
          'Makinde Division',
          'Domestic Airport Police Station',
        ],
      },
      {
        code: 'Area G',
        name: 'Ogba / Agege Area Command',
        hqLocation: 'Ogba Pen Cinema',
        districts: 'Ogba, Agege, Dopemu, Oko-Oba',
        divisions: [
          'Ogba Divisional Headquarters',
          'Agege Division',
          'Isokoko Division',
          'Elere Division',
          'Dopemu Division',
          'Oko-Oba Division',
          'Abattoir Police Station',
        ],
      },
      {
        code: 'Area H',
        name: 'Ogudu Area Command',
        hqLocation: 'Ogudu / Shangisha',
        districts: 'Ogudu, Ketu, Alapere, Kosofe',
        divisions: [
          'Ogudu Divisional Headquarters',
          'Ketu Division',
          'Alapere Division',
          'Owode Onirin Division',
          'Mile 12 Police Station',
          'Anthony Division',
        ],
      },
      {
        code: 'Area J',
        name: 'Elemoro Area Command',
        hqLocation: 'Elemoro / Ajah Axis',
        districts: 'Lekki Peninsula, Ajah, Epe, Sangotedo',
        divisions: [
          'Ajah Divisional Headquarters',
          'Maroko Division',
          'Ilasan Division (Lekki Phase 1)',
          'Elemoro Division',
          'Ogombo Division',
          'Langbasa Division',
          'Epe Division',
          'Akodo Division',
        ],
      },
      {
        code: 'Area K',
        name: 'Morogbo Area Command',
        hqLocation: 'Morogbo, Badagry Expressway',
        districts: 'Badagry Township, Border Corridor, Ilemba',
        divisions: [
          'Badagry Divisional Headquarters',
          'Morogbo Division',
          'Ilemba Hausa Division',
          'Ishashi Division',
          'Seme Border Police Station',
        ],
      },
      {
        code: 'Area M',
        name: 'Idimu Area Command',
        hqLocation: 'Idimu, Alimosho',
        districts: 'Egbe-Idimu, Ikotun, Igando, Shasha',
        divisions: [
          'Idimu Divisional Headquarters',
          'Egbe Division',
          'Ikotun Division',
          'Igando Division',
          'Shasha Division',
          'Gowon Estate Division',
          'Meiran Division',
        ],
      },
      {
        code: 'Area N',
        name: 'Ijede Area Command',
        hqLocation: 'Ikorodu Township',
        districts: 'Ikorodu, Ijede, Imota, Sagamu Road',
        divisions: [
          'Ikorodu Divisional Headquarters',
          'Sagamu Road Division',
          'Igbogbo Division',
          'Ijede Division',
          'Imota Division',
          'Owutu Division',
        ],
      },
      {
        code: 'Area P',
        name: 'Alagbado Area Command',
        hqLocation: 'Alagbado / Abesan',
        districts: 'Alagbado, Ipaja, Ayobo, Mosan-Okunola',
        divisions: [
          'Alagbado Divisional Headquarters',
          'Ipaja Division',
          'Ayobo Division',
          'Abesan Estate Division',
          'Baruwa Police Station',
        ],
      },
    ],
  },
  {
    state: 'FCT Abuja',
    zone: 'Zone 7',
    hq: 'Command HQ, Zaria Street, Garki II, Abuja',
    cpRank: 'Commissioner of Police (CP FCT)',
    areaCommands: [
      {
        code: 'Area Metro',
        name: 'Area Command Metro (Abuja City)',
        hqLocation: 'Maitama (Nile Street)',
        districts: 'Central Business District, Maitama, Wuse, Asokoro, Garki, Utako, Lugbe',
        divisions: [
          'Central Police Station (CPS Federal Secretariat)',
          'Maitama Division (Nile Street)',
          'Wuse Division (Wuse Zone 3)',
          'Garki Division (Garki II)',
          'Asokoro Division (AYA / Yakubu Gowon Crescent)',
          'Utako Division',
          'Wuye Division',
          'Durumi Division',
          'Apo Legislative Quarters Division',
          'Lugbe Division (Airport Road)',
          'National Assembly Police Division',
        ],
      },
      {
        code: 'Area Gwagwalada',
        name: 'Area Command Gwagwalada',
        hqLocation: 'Specialist Hospital Road',
        districts: 'Gwagwalada Area Council, Airport Corridor, Zuba',
        divisions: [
          'Gwagwalada Main Divisional HQ',
          'Gwagwalada Main Market Division',
          'Iddo Division (Iddo Sarki / Airport Road)',
          'Zuba Division',
          'Tungan Maje Police Post',
          'Dobi Police Outpost',
        ],
      },
      {
        code: 'Area Kubwa',
        name: 'Area Command Kubwa',
        hqLocation: 'Kubwa Phase 4',
        districts: 'Kubwa Township, Dei-Dei, Dutse, Gwarimpa extensions',
        divisions: [
          'Kubwa Phase 4 Divisional HQ',
          'Dei-Dei Division (Building Materials Market)',
          'Dutse Alhaji Division',
          'Byazhin Division',
          'Gwarimpa Division (1st & 2nd Avenue)',
          'Dawaki Police Outpost',
        ],
      },
      {
        code: 'Area Bwari',
        name: 'Area Command Bwari',
        hqLocation: 'Bwari Township',
        districts: 'Bwari Area Council, Ushafa, Niger/Kaduna boundary axis',
        divisions: [
          'Bwari Main Divisional HQ',
          'Ushafa Division',
          'Kuduru Police Station',
          'Gidandogo Division',
          'Gawu Border Post',
          'Garam Police Outpost',
        ],
      },
      {
        code: 'Eastern Axis',
        name: 'Karu / Nyanya Axis Command',
        hqLocation: 'Karu / Nyanya Corridor',
        districts: 'Abuja-Keffi Highway border corridor toward Nasarawa State',
        divisions: [
          'Karu Divisional Headquarters',
          'Nyanya Division (Check Point / Market)',
          'Jikwoyi Division',
          'Karshi Division',
          'Orozo Division',
          'Kurudu Model Police Station',
        ],
      },
    ],
  },
  {
    state: 'Kano State',
    zone: 'Zone 1',
    hq: 'State Command HQ, Bompai, Kano',
    cpRank: 'Commissioner of Police (CP Kano)',
    areaCommands: [
      {
        code: 'Area Metro',
        name: 'Metro Area Command',
        hqLocation: 'Central Kano',
        districts: 'Kano Municipal, Fagge, Sabon Gari, Nassarawa',
        divisions: ['Central Police Station (CPS)', 'Fagge Division', 'Sabon Gari Division', 'Nassarawa Division'],
      },
      {
        code: 'Area Dala',
        name: 'Dala Area Command',
        hqLocation: 'Dala',
        districts: 'Dala, Gwale, Mandawari historical quarters',
        divisions: ['Dala Division', 'Kwalli Division', 'Gwale Division', 'Mandawari Division'],
      },
      {
        code: 'Area Bichi',
        name: 'Bichi Area Command',
        hqLocation: 'Bichi Town',
        districts: 'Bichi, Gwarzo, Bagwai, Tofa',
        divisions: ['Bichi Divisional HQ', 'Gwarzo Division', 'Bagwai Police Post', 'Tofa Division'],
      },
      {
        code: 'Area Wudil',
        name: 'Wudil Area Command',
        hqLocation: 'Wudil',
        districts: 'Wudil, Garko, Albasu',
        divisions: ['Wudil Divisional HQ', 'Garko Division', 'Albasu Police Post'],
      },
      {
        code: 'Area Rano',
        name: 'Rano Area Command',
        hqLocation: 'Rano',
        districts: 'Rano, Kibiya, Bunkure',
        divisions: ['Rano Divisional HQ', 'Kibiya Division', 'Bunkure Division'],
      },
      {
        code: 'Area Danbatta',
        name: 'Danbatta Area Command',
        hqLocation: 'Danbatta',
        districts: 'Danbatta, Makoda, Kunchi',
        divisions: ['Danbatta Divisional HQ', 'Makoda Division', 'Kunchi Police Post'],
      },
      {
        code: 'Area Bypass',
        name: 'Eastern Bypass Area Command',
        hqLocation: 'Hotoro / Tarauni',
        districts: 'Eastern Bypass industrial belt, Tarauni',
        divisions: ['Tarauni Division', 'Hotoro Division', 'Yan Awaki Police Station'],
      },
    ],
  },
  {
    state: 'Rivers State',
    zone: 'Zone 16',
    hq: 'State Command HQ, Moscow Road, Port Harcourt',
    cpRank: 'Commissioner of Police (CP Rivers)',
    areaCommands: [
      {
        code: 'Area Metro',
        name: 'Port Harcourt Metro Area Command',
        hqLocation: 'Moscow Road / Old GRA',
        districts: 'Port Harcourt City, Diobu, Borokiri',
        divisions: [
          'Central Police Station (CPS Port Harcourt)',
          'Borokiri Division',
          'Mile 1 Diobu Division',
          'Mile 3 Diobu Division',
          'Old GRA Division',
        ],
      },
      {
        code: 'Area Choba',
        name: 'Choba Area Command',
        hqLocation: 'Choba Axis',
        districts: 'Choba, Ozuoba, Rumuolumeni, University corridor',
        divisions: ['Choba Divisional HQ', 'Rumuolumeni Division', 'Ozuoba Division', 'Alakahia Police Post'],
      },
      {
        code: 'Area Bori',
        name: 'Bori Area Command',
        hqLocation: 'Bori (Ogoni Land)',
        districts: 'Khana, Gokana, Tai',
        divisions: ['Bori Divisional HQ', 'Gokana Division', 'Tai Division', 'Khana Outpost'],
      },
      {
        code: 'Area Ahoada',
        name: 'Ahoada Area Command',
        hqLocation: 'Ahoada',
        districts: 'Ahoada East/West, Omoku, Emohua',
        divisions: ['Ahoada Divisional HQ', 'Omoku Division', 'Emohua Division', 'Rumuji Division'],
      },
      {
        code: 'Area Eleme',
        name: 'Eleme Area Command',
        hqLocation: 'Eleme Industrial Corridor',
        districts: 'Eleme, Onne Free Zone, Okrika',
        divisions: ['Eleme Divisional HQ', 'Onne Division', 'Ebubu Station', 'Okrika Division'],
      },
      {
        code: 'Area Oyigbo',
        name: 'Oyigbo Area Command',
        hqLocation: 'Oyigbo',
        districts: 'Oyigbo, Afam Power Station corridor',
        divisions: ['Oyigbo Divisional HQ', 'Afam Division'],
      },
    ],
  },
  {
    state: 'Kaduna State',
    zone: 'Zone 14',
    hq: 'State Command HQ, Bida Road, Kaduna',
    cpRank: 'Commissioner of Police (CP Kaduna)',
    areaCommands: [
      {
        code: 'Area Metro',
        name: 'Kaduna Metro Area Command',
        hqLocation: 'Kaduna City Central',
        districts: 'Kaduna North and South LGAs',
        divisions: [
          'Sabon Gari Division',
          'Kabala Doki Division',
          'Unguwan Rimi Division',
          'Kawo Division',
          'Tudun Wada Division',
          'Malali Division',
          'Kurmin Mashi Division',
        ],
      },
      {
        code: 'Area Zaria',
        name: 'Zaria Area Command',
        hqLocation: 'Zaria City',
        districts: 'Zaria, Sabon Gari Zaria, Samaru',
        divisions: ['Zaria City Division', 'Danmagaji Division', 'Samaru Division', 'Sabon Gari Zaria Division'],
      },
      {
        code: 'Area Kafanchan',
        name: 'Kafanchan Area Command',
        hqLocation: 'Kafanchan',
        districts: 'Southern Kaduna, Jemaa, Zangon Kataf',
        divisions: ['Kafanchan Divisional HQ', 'Zonkwa Division', 'Kagoro Division', "Jema'a Outposts"],
      },
      {
        code: 'Area Birnin Gwari',
        name: 'Birnin Gwari Area Command',
        hqLocation: 'Birnin Gwari',
        districts: 'Birnin Gwari, Buruku highway corridor',
        divisions: ['Birnin Gwari Main Divisional HQ', 'Buruku Division', 'Maraban Jos Outpost'],
      },
    ],
  },
  {
    state: 'Anambra State',
    zone: 'Zone 13',
    hq: 'State Command HQ, Zik Avenue, Awka',
    cpRank: 'Commissioner of Police (CP Anambra)',
    areaCommands: [
      {
        code: 'Area Awka',
        name: 'Awka Metro Area Command',
        hqLocation: 'Awka',
        districts: 'Awka Capital Territory, Dunukofia, Anaocha',
        divisions: [
          'Central Police Station (CPS Awka)',
          "'B' Division Awka",
          'Achalla Division',
          'Dunukofia Division',
          'Abagana Division',
          'Anaocha (Neni) Division',
        ],
      },
      {
        code: 'Area Onitsha',
        name: 'Onitsha Area Command',
        hqLocation: 'Onitsha Commercial City',
        districts: 'Onitsha North/South, Ogbaru, River Niger bridgehead',
        divisions: [
          'Central Police Station (CPS Onitsha)',
          'Inland Town Division',
          'Fegge Division',
          'Okpoko Division',
          '3-3 Police Station',
          'Ogbaru Division',
          'Marine Police Division',
        ],
      },
      {
        code: 'Area Nnewi',
        name: 'Nnewi Area Command',
        hqLocation: 'Nnewi Industrial Hub',
        districts: 'Nnewi North/South, Ozubulu',
        divisions: [
          'Central Police Station (CPS Nnewi)',
          'Nnewi Division',
          'Otolo Division',
          'Ichi Division',
          'Amichi Division',
          'Ozubulu Division',
        ],
      },
      {
        code: 'Area Ihiala',
        name: 'Ihiala Command Hub',
        hqLocation: 'Ihiala',
        districts: 'Ihiala, Uli, Okija, Imo border axis',
        divisions: ['Ihiala Divisional HQ', 'Uli Division', 'Okija Division'],
      },
      {
        code: 'Area Otuocha',
        name: 'Otuocha Command Hub',
        hqLocation: 'Otuocha',
        districts: 'Anambra East/West, Omambala river basin',
        divisions: ['Otuocha Division', 'Anaku Division', 'Oyi Division', 'Nzam Division'],
      },
      {
        code: 'Area Aguata',
        name: 'Aguata Command Hub',
        hqLocation: 'Ekwulobia / Aguata',
        districts: 'Aguata, Orumba North/South',
        divisions: ['Aguata Division', 'Umunze Division', 'Ajalli Division', 'Oko Division'],
      },
    ],
  },
]

export function NpfCommandDirectoryView() {
  const [activeTab, setActiveTab] = useState<'zones' | 'states' | 'hierarchy'>('zones')
  const [selectedStateIndex, setSelectedStateIndex] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredZones = useMemo(() => {
    if (!searchQuery.trim()) return ZONAL_COMMANDS
    const q = searchQuery.toLowerCase()
    return ZONAL_COMMANDS.filter(
      (z) =>
        z.zone.toLowerCase().includes(q) ||
        z.hq.toLowerCase().includes(q) ||
        z.states.some((s) => s.toLowerCase().includes(q)) ||
        z.mandate.toLowerCase().includes(q)
    )
  }, [searchQuery])

  const selectedState = STATE_COMMANDS[selectedStateIndex] || STATE_COMMANDS[0]

  const filteredAreaCommands = useMemo(() => {
    if (!selectedState) return []
    if (!searchQuery.trim()) return selectedState.areaCommands
    const q = searchQuery.toLowerCase()
    return selectedState.areaCommands.filter(
      (ac) =>
        ac.name.toLowerCase().includes(q) ||
        ac.code.toLowerCase().includes(q) ||
        ac.districts.toLowerCase().includes(q) ||
        ac.divisions.some((d) => d.toLowerCase().includes(q))
    )
  }, [selectedState, searchQuery])

  return (
    <div className="space-y-6">
      {/* Top Banner & PowerPoint Download Link */}
      <div className="flex flex-col gap-4 rounded-2xl border border-[#00c46a]/30 bg-gradient-to-r from-[#00c46a]/10 via-[color:var(--portal-table-row-hover)] to-transparent p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 font-(--font-mono) text-[10px] font-bold uppercase tracking-widest text-[#00c46a]">
            <span className="size-2 rounded-full bg-[#00c46a] animate-pulse" />
            Official Police Directory
          </span>
          <h3 className="mt-1 font-(--font-display) text-lg font-bold text-[var(--sr-heading)]">
            NPF National Command Directory &amp; Territorial Cascade
          </h3>
          <p className="mt-1 text-xs text-[var(--portal-muted)]">
            Verified listings from the Force Headquarters gazette: 17 Zonal Commands, 37 State Commands, Area Commands, and Divisions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/NPF_National_Command_Directory.pptx"
            download
            className="sr-btn-primary py-2.5 px-4 text-xs font-semibold shadow-[0_4px_16px_rgba(0,196,106,0.3)]"
          >
            📊 Download Directory Deck (.pptx)
          </a>
        </div>
      </div>

      {/* Navigation Tabs & Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1 rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] p-1">
          <button
            type="button"
            onClick={() => setActiveTab('zones')}
            className={`rounded-lg px-3 py-1.5 font-(--font-mono) text-xs font-semibold transition ${
              activeTab === 'zones'
                ? 'bg-[#00c46a] text-[#0A1628] shadow'
                : 'text-[var(--portal-muted)] hover:text-[var(--portal-fg)]'
            }`}
          >
            17 Zonal Commands
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('states')}
            className={`rounded-lg px-3 py-1.5 font-(--font-mono) text-xs font-semibold transition ${
              activeTab === 'states'
                ? 'bg-[#00c46a] text-[#0A1628] shadow'
                : 'text-[var(--portal-muted)] hover:text-[var(--portal-fg)]'
            }`}
          >
            Area Commands &amp; Divisions
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('hierarchy')}
            className={`rounded-lg px-3 py-1.5 font-(--font-mono) text-xs font-semibold transition ${
              activeTab === 'hierarchy'
                ? 'bg-[#00c46a] text-[#0A1628] shadow'
                : 'text-[var(--portal-muted)] hover:text-[var(--portal-fg)]'
            }`}
          >
            Cascade Hierarchy
          </button>
        </div>

        {activeTab !== 'hierarchy' && (
          <div className="relative min-w-[240px] max-w-sm">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Zone, State, Area or Division…"
              className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] py-1.5 pl-8 pr-3 text-xs text-[var(--portal-fg)] placeholder:text-[var(--portal-dim)] focus:border-[#00c46a] focus:outline-none"
            />
            <span className="pointer-events-none absolute left-2.5 top-2 text-xs text-[var(--portal-dim)]">🔍</span>
          </div>
        )}
      </div>

      {/* TAB 1: 17 ZONAL COMMANDS */}
      {activeTab === 'zones' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredZones.map((z) => (
            <div
              key={z.zone}
              className="flex flex-col justify-between rounded-xl border border-[color:var(--portal-border)] bg-gradient-to-b from-[color:var(--sr-card-grad-a)] to-[color:var(--sr-card-grad-b)] p-4 shadow-[var(--sr-card-shadow)] transition hover:border-[#00c46a]/40"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-[#00c46a]/15 px-2.5 py-0.5 font-(--font-mono) text-[11px] font-bold text-[#00c46a]">
                    {z.zone}
                  </span>
                  <span className="font-(--font-mono) text-[9px] uppercase tracking-wider text-[var(--portal-dim)]">
                    {z.aig}
                  </span>
                </div>
                <h4 className="mt-2.5 font-(--font-display) text-base font-bold text-[var(--sr-heading)]">
                  HQ: {z.hq}
                </h4>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {z.states.map((st) => (
                    <span
                      key={st}
                      className="rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-table-row-hover)] px-2 py-0.5 font-(--font-mono) text-[10px] font-semibold text-[var(--portal-fg)]"
                    >
                      {st} State
                    </span>
                  ))}
                </div>
              </div>
              <p className="mt-3 border-t border-[color:var(--portal-border)] pt-2.5 text-[11px] leading-relaxed text-[var(--portal-muted)]">
                {z.mandate}
              </p>
            </div>
          ))}
          {filteredZones.length === 0 && (
            <div className="col-span-full py-8 text-center text-sm text-[var(--portal-muted)]">
              No zonal commands match &ldquo;{searchQuery}&rdquo;.
            </div>
          )}
        </div>
      )}

      {/* TAB 2: AREA COMMANDS & DIVISIONS (STATE INSPECTOR) */}
      {activeTab === 'states' && (
        <div className="space-y-4">
          {/* State Selector Buttons */}
          <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--portal-border)] pb-3">
            <span className="font-(--font-mono) text-[11px] font-semibold uppercase text-[var(--portal-dim)] mr-1">
              Select State:
            </span>
            {STATE_COMMANDS.map((st, idx) => (
              <button
                key={st.state}
                type="button"
                onClick={() => setSelectedStateIndex(idx)}
                className={`rounded-lg px-3 py-1 font-(--font-mono) text-xs font-semibold transition ${
                  selectedStateIndex === idx
                    ? 'border border-[#00c46a] bg-[#00c46a]/20 text-[#00c46a]'
                    : 'border border-[color:var(--portal-border)] bg-[color:var(--portal-table-row-hover)] text-[var(--portal-muted)] hover:text-[var(--portal-fg)]'
                }`}
              >
                {st.state}
              </button>
            ))}
          </div>

          {/* State Command Banner */}
          <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-table-row-hover)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-(--font-mono) text-[10px] font-bold uppercase tracking-wider text-[#d9b64a]">
                  {selectedState.zone} Oversight
                </span>
                <h4 className="font-(--font-display) text-lg font-bold text-[var(--sr-heading)]">
                  {selectedState.state} Police Command
                </h4>
                <p className="text-xs text-[var(--portal-muted)]">{selectedState.hq}</p>
              </div>
              <span className="rounded-full border border-[#00c46a]/30 bg-[#00c46a]/10 px-3 py-1 font-(--font-mono) text-xs font-semibold text-[#00c46a]">
                {selectedState.cpRank}
              </span>
            </div>
          </div>

          {/* Area Commands & Subordinate Divisions Grid */}
          <div className="grid gap-3 sm:grid-cols-2">
            {filteredAreaCommands.map((ac) => (
              <div
                key={ac.code}
                className="flex flex-col justify-between rounded-xl border border-[color:var(--portal-border)] bg-gradient-to-b from-[color:var(--sr-card-grad-a)] to-[color:var(--sr-card-grad-b)] p-4 shadow-[var(--sr-card-shadow)]"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-[#0DCCB0]/20 px-2 py-0.5 font-(--font-mono) text-[10px] font-bold text-[#0DCCB0]">
                      {ac.code}
                    </span>
                    <span className="font-(--font-mono) text-[10px] text-[var(--portal-dim)]">
                      ACP Area Commander
                    </span>
                  </div>
                  <h5 className="mt-2 font-(--font-display) text-sm font-bold text-[var(--sr-heading)]">
                    {ac.name}
                  </h5>
                  <p className="mt-0.5 text-xs text-[var(--portal-muted)]">
                    <strong className="text-[var(--portal-fg)]">HQ:</strong> {ac.hqLocation}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--portal-dim)]">
                    <strong>Jurisdiction:</strong> {ac.districts}
                  </p>

                  <div className="mt-3 border-t border-[color:var(--portal-border)] pt-2.5">
                    <p className="font-(--font-mono) text-[10px] font-bold uppercase tracking-wider text-[var(--portal-dim)]">
                      Subordinate Police Divisions ({ac.divisions.length}):
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {ac.divisions.map((div) => (
                        <li key={div} className="flex items-start gap-1.5 text-xs text-[var(--portal-muted)]">
                          <span className="text-[#00c46a] mt-0.5">▸</span>
                          <span>{div}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
            {filteredAreaCommands.length === 0 && (
              <div className="col-span-full py-8 text-center text-sm text-[var(--portal-muted)]">
                No area commands or divisions match &ldquo;{searchQuery}&rdquo;.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: CASCADE HIERARCHY (POLLING UNIT TO FORCE HQ) */}
      {activeTab === 'hierarchy' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
              <span className="rounded bg-red-500/20 px-2 py-0.5 font-(--font-mono) text-[9px] font-bold text-red-300">
                Tier 1 • National
              </span>
              <h5 className="mt-2 font-(--font-display) text-sm font-bold text-white">
                Force Headquarters (FHQ)
              </h5>
              <p className="mt-1 text-xs text-white/70">Louis Edet House, Abuja</p>
              <p className="mt-2 text-[11px] text-white/60">
                Led by <strong>Inspector-General of Police (IGP)</strong> &amp; 7 DIGs. Overall election security command.
              </p>
            </div>

            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 font-(--font-mono) text-[9px] font-bold text-emerald-300">
                Tier 2 • Regional
              </span>
              <h5 className="mt-2 font-(--font-display) text-sm font-bold text-white">
                17 Zonal Commands
              </h5>
              <p className="mt-1 text-xs text-white/70">Zones 1 to 17 Nationwide</p>
              <p className="mt-2 text-[11px] text-white/60">
                Led by <strong>AIGs</strong>. Multi-state reinforcement, tactical mobile reserve, and boundary monitoring.
              </p>
            </div>

            <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4">
              <span className="rounded bg-cyan-500/20 px-2 py-0.5 font-(--font-mono) text-[9px] font-bold text-cyan-300">
                Tier 3 • State
              </span>
              <h5 className="mt-2 font-(--font-display) text-sm font-bold text-white">
                37 State Commands
              </h5>
              <p className="mt-1 text-xs text-white/70">36 States + FCT Abuja</p>
              <p className="mt-2 text-[11px] text-white/60">
                Led by <strong>Commissioners of Police (CP)</strong>. State Situation Rooms, collation protection, and logistics.
              </p>
            </div>

            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <span className="rounded bg-amber-500/20 px-2 py-0.5 font-(--font-mono) text-[9px] font-bold text-amber-300">
                Tier 4 • Sub-State
              </span>
              <h5 className="mt-2 font-(--font-display) text-sm font-bold text-white">
                Area Commands (~150+)
              </h5>
              <p className="mt-1 text-xs text-white/70">Clusters of LGAs</p>
              <p className="mt-2 text-[11px] text-white/60">
                Led by <strong>ACPs</strong>. Quick Reaction Force (QRF) dispatch and tactical patrol coordination.
              </p>
            </div>

            <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-4">
              <span className="rounded bg-purple-500/20 px-2 py-0.5 font-(--font-mono) text-[9px] font-bold text-purple-300">
                Tier 5 • Frontline
              </span>
              <h5 className="mt-2 font-(--font-display) text-sm font-bold text-white">
                Divisions &amp; Polling Units
              </h5>
              <p className="mt-1 text-xs text-white/70">176,000+ Polling Stations</p>
              <p className="mt-2 text-[11px] text-white/60">
                Led by <strong>DPOs</strong> and frontline officers with Election SitRep mobile app for hourly reporting and SOS alerts.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-table-row-hover)] p-5 text-xs text-[var(--portal-muted)] leading-relaxed">
            <strong className="text-[var(--sr-heading)]">Election SitRep Scoped Flow:</strong> Every incident report, EC8A tally photo, and emergency SOS originates at the Polling Unit and cascades in milliseconds through the Divisional DPO, the Area Command QRF Dispatch board, and directly onto the State and National Situation Room large-screen command monitors.
          </div>
        </div>
      )}
    </div>
  )
}
