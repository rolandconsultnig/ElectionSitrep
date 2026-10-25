import { useMemo, useState } from 'react'

/* ----------------------------- Data interfaces ----------------------------- */

export interface ContactInfo {
  officerName: string
  rank: string
  phone: string
  email: string
}

export interface StationData {
  name: string
  location: string
  contact: ContactInfo
}

export interface DivisionData {
  name: string
  hqLocation: string
  contact: ContactInfo
  stations: StationData[]
}

export interface AreaCommandData {
  code: string
  name: string
  hqLocation: string
  districts: string
  contact: ContactInfo
  divisions: DivisionData[]
}

export interface StateCommandData {
  state: string
  zone: string
  hq: string
  cpRank: string
  contact: ContactInfo
  areaCommands: AreaCommandData[]
}

export interface ZonalCommand {
  zone: string
  hq: string
  states: string[]
  mandate: string
  contact: ContactInfo
  stateCommands: StateCommandData[]
}

export interface ForceHqData {
  name: string
  location: string
  contact: ContactInfo
  zones: ZonalCommand[]
}

/* ------------------------------ Contact helper ----------------------------- */

function c(officerName: string, rank: string, phone: string, email: string): ContactInfo {
  return { officerName, rank, phone, email }
}

/* --------------------------- Force Headquarters ---------------------------- */

const FORCE_HQ: ForceHqData = {
  name: 'Force Headquarters (FHQ)',
  location: 'Louis Edet House, Area 10, Garki, Abuja',
  contact: c('Inspector-General of Police', 'IGP', '+234 803 000 0001', 'igp@npf.gov.ng'),
  zones: [],
}

/* ----------------------------- Zonal Commands ------------------------------ */

const ZONAL_COMMANDS: ZonalCommand[] = [
  {
    zone: 'Zone 1',
    hq: 'Bompai, Kano State',
    states: ['Kano', 'Jigawa'],
    mandate: 'Commercial northwest axis, trans-Saharan trade corridors, border security',
    contact: c('AIG Zone 1', 'AIG', '+234 803 100 0001', 'aig.zone1@npf.gov.ng'),
    stateCommands: [],
  },
  {
    zone: 'Zone 2',
    hq: 'Onikan, Lagos State',
    states: ['Lagos', 'Ogun'],
    mandate: 'Commercial maritime capital, industrial hubs, seaports & border defense',
    contact: c('AIG Zone 2', 'AIG', '+234 803 100 0002', 'aig.zone2@npf.gov.ng'),
    stateCommands: [],
  },
  {
    zone: 'Zone 3',
    hq: 'Yola, Adamawa State',
    states: ['Adamawa', 'Taraba'],
    mandate: 'North-eastern international border corridors, Mandara mountain axis',
    contact: c('AIG Zone 3', 'AIG', '+234 803 100 0003', 'aig.zone3@npf.gov.ng'),
    stateCommands: [],
  },
  {
    zone: 'Zone 4',
    hq: 'Makurdi, Benue State',
    states: ['Benue', 'Plateau', 'Nasarawa'],
    mandate: 'Middle-belt agrarian security, food-basket transit lines & inter-community peace',
    contact: c('AIG Zone 4', 'AIG', '+234 803 100 0004', 'aig.zone4@npf.gov.ng'),
    stateCommands: [],
  },
  {
    zone: 'Zone 5',
    hq: 'Benin City, Edo State',
    states: ['Edo', 'Delta'],
    mandate: 'Western Niger-Delta hydrocarbon assets, waterway corridors & coastal safety',
    contact: c('AIG Zone 5', 'AIG', '+234 803 100 0005', 'aig.zone5@npf.gov.ng'),
    stateCommands: [],
  },
  {
    zone: 'Zone 6',
    hq: 'Calabar, Cross River State',
    states: ['Cross River', 'Akwa Ibom'],
    mandate: 'Eastern coastal littoral border, Bakassi maritime corridor & eco-tourism zones',
    contact: c('AIG Zone 6', 'AIG', '+234 803 100 0006', 'aig.zone6@npf.gov.ng'),
    stateCommands: [],
  },
  {
    zone: 'Zone 7',
    hq: 'FCT Abuja',
    states: ['FCT Abuja', 'Niger'],
    mandate: 'Federal Capital Territory seat of government, federal highway defense & national monuments',
    contact: c('AIG Zone 7', 'AIG', '+234 803 100 0007', 'aig.zone7@npf.gov.ng'),
    stateCommands: [],
  },
  {
    zone: 'Zone 8',
    hq: 'Lokoja, Kogi State',
    states: ['Kogi', 'Kwara'],
    mandate: 'Confluence nexus connecting Northern and Southern arterial transit highways',
    contact: c('AIG Zone 8', 'AIG', '+234 803 100 0008', 'aig.zone8@npf.gov.ng'),
    stateCommands: [],
  },
  {
    zone: 'Zone 9',
    hq: 'Umuahia, Abia State',
    states: ['Abia', 'Imo', 'Ebonyi'],
    mandate: 'South-east commercial trading centers, industrial peacebuilding & border harmony',
    contact: c('AIG Zone 9', 'AIG', '+234 803 100 0009', 'aig.zone9@npf.gov.ng'),
    stateCommands: [],
  },
  {
    zone: 'Zone 10',
    hq: 'Sokoto, Sokoto State',
    states: ['Sokoto', 'Kebbi', 'Zamfara'],
    mandate: 'Northwestern desert border patrol, anti-banditry tactical operations & livestock defense',
    contact: c('AIG Zone 10', 'AIG', '+234 803 100 0010', 'aig.zone10@npf.gov.ng'),
    stateCommands: [],
  },
  {
    zone: 'Zone 11',
    hq: 'Osogbo, Osun State',
    states: ['Osun', 'Oyo'],
    mandate: 'South-west inland agrarian security, tertiary university corridors & heritage protection',
    contact: c('AIG Zone 11', 'AIG', '+234 803 100 0011', 'aig.zone11@npf.gov.ng'),
    stateCommands: [],
  },
  {
    zone: 'Zone 12',
    hq: 'Bauchi, Bauchi State',
    states: ['Bauchi', 'Gombe'],
    mandate: 'North-east gateway security, regional logistical hub & tactical staging',
    contact: c('AIG Zone 12', 'AIG', '+234 803 100 0012', 'aig.zone12@npf.gov.ng'),
    stateCommands: [],
  },
  {
    zone: 'Zone 13',
    hq: 'Ukpo / Dunukofia, Anambra State',
    states: ['Anambra', 'Enugu'],
    mandate: 'Manufacturing centers (Onitsha, Nnewi), Coal City metropolis & critical transit corridors',
    contact: c('AIG Zone 13', 'AIG', '+234 803 100 0013', 'aig.zone13@npf.gov.ng'),
    stateCommands: [],
  },
  {
    zone: 'Zone 14',
    hq: 'Katsina, Katsina State',
    states: ['Katsina', 'Kaduna'],
    mandate: 'Northern industrial and rail nexus, Niger Republic international border patrol',
    contact: c('AIG Zone 14', 'AIG', '+234 803 100 0014', 'aig.zone14@npf.gov.ng'),
    stateCommands: [],
  },
  {
    zone: 'Zone 15',
    hq: 'Maiduguri, Borno State',
    states: ['Borno', 'Yobe'],
    mandate: 'Lake Chad basin defense, joint counter-insurgency task force operations',
    contact: c('AIG Zone 15', 'AIG', '+234 803 100 0015', 'aig.zone15@npf.gov.ng'),
    stateCommands: [],
  },
  {
    zone: 'Zone 16',
    hq: 'Yenagoa, Bayelsa State',
    states: ['Bayelsa', 'Rivers'],
    mandate: 'Core Niger-Delta energy infrastructure, mangrove creeks & marine counter-piracy',
    contact: c('AIG Zone 16', 'AIG', '+234 803 100 0016', 'aig.zone16@npf.gov.ng'),
    stateCommands: [],
  },
  {
    zone: 'Zone 17',
    hq: 'Akure, Ondo State',
    states: ['Ondo', 'Ekiti'],
    mandate: 'Agro-forestry belt, coastal riverine Ilaje axis & mineral transit security',
    contact: c('AIG Zone 17', 'AIG', '+234 803 100 0017', 'aig.zone17@npf.gov.ng'),
    stateCommands: [],
  },
]

/* ----------------------------- State Commands ------------------------------ */

function div(name: string, hqLocation: string, contactOfficer: string, rank: string, phone: string, stations: string[]): DivisionData {
  return {
    name,
    hqLocation,
    contact: c(contactOfficer, rank, phone, `${name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 20)}@npf.gov.ng`),
    stations: stations.map((sName, idx) => ({
      name: sName,
      location: sName,
      contact: c(`${sName} DPO`, 'CSP', `+234 803 2${String(idx).padStart(6, '0')}`, `${sName.toLowerCase().replace(/[^a-z]/g, '').slice(0, 15)}@npf.gov.ng`),
    })),
  }
}

function area(code: string, name: string, hqLocation: string, districts: string, acpName: string, phone: string, divisions: DivisionData[]): AreaCommandData {
  return {
    code,
    name,
    hqLocation,
    districts,
    contact: c(acpName, 'ACP', phone, `${code.toLowerCase().replace(/\s/g, '')}@npf.gov.ng`),
    divisions,
  }
}

function stateCmd(state: string, zone: string, hq: string, cpName: string, cpRank: string, phone: string, areaCommands: AreaCommandData[]): StateCommandData {
  return {
    state,
    zone,
    hq,
    cpRank,
    contact: c(cpName, cpRank, phone, `cp.${state.toLowerCase().replace(/\s/g, '')}@npf.gov.ng`),
    areaCommands,
  }
}

const STATE_COMMANDS: StateCommandData[] = [
  stateCmd(
    'Lagos State', 'Zone 2', 'State Command HQ, Ikeja',
    'CP Lagos', 'Commissioner of Police (CP Lagos)', '+234 803 200 0001',
    [
      area('Area A', 'Lion Building Area Command', 'Lion Building, Lagos Island', 'Lagos Island, Victoria Island, Ikoyi, Onikan', 'ACP Lion Building', '+234 803 300 0001', [
        div('Central Police Station (CPS) Lagos Island', 'Lagos Island', 'DPO CPS Lagos Island', 'CSP', '+234 803 400 0001', ['CPS Lagos Island', 'Marina Outpost', 'Broad Street Post']),
        div('Lion Building Division', 'Lagos Island', 'DPO Lion Building', 'CSP', '+234 803 400 0002', ['Lion Building', 'Race Course Outpost']),
        div('Victoria Island Division', 'Victoria Island', 'DPO Victoria Island', 'CSP', '+234 803 400 0003', ['Victoria Island (Bar Beach)', 'Bishop Oluwole', 'Adeola Odeku']),
        div('Ikoyi Division', 'Ikoyi', 'DPO Ikoyi', 'CSP', '+234 803 400 0004', ['Ikoyi (Kingsway Road)', 'Banana Island', 'Parkview']),
        div('Onikan Division', 'Onikan', 'DPO Onikan', 'CSP', '+234 803 400 0005', ['Onikan', 'Tafawa Balewa Square']),
        div('Adeniji Adele Division', 'Adeniji Adele', 'DPO Adeniji Adele', 'CSP', '+234 803 400 0006', ['Adeniji Adele', 'Idumagbo']),
      ]),
      area('Area B', 'Apapa Area Command', 'Apapa Port Corridor', 'Apapa Wharfs, Ajegunle, Ajeromi-Ifelodun', 'ACP Apapa', '+234 803 300 0002', [
        div('Apapa Divisional Headquarters', 'Apapa', 'DPO Apapa', 'CSP', '+234 803 400 0007', ['Apapa', 'Wharf Road', 'Port Authority']),
        div('Ajegunle Division', 'Ajegunle', 'DPO Ajegunle', 'CSP', '+234 803 400 0008', ['Ajegunle', 'Layeni', 'Tolu']),
        div('Trinity Division', 'Trinity', 'DPO Trinity', 'CSP', '+234 803 400 0009', ['Trinity', 'Ijora']),
        div('Kirikiri Division', 'Kirikiri', 'DPO Kirikiri', 'CSP', '+234 803 400 0010', ['Kirikiri', 'Kirikiri Prison']),
        div('Ijora Badia Division', 'Ijora', 'DPO Ijora Badia', 'CSP', '+234 803 400 0011', ['Ijora Badia', 'Ijora Oloye']),
      ]),
      area('Area C', 'Surulere Area Command', 'Surulere', 'Surulere, Yaba, Ebute Metta, Iponri', 'ACP Surulere', '+234 803 300 0003', [
        div('Surulere Divisional Headquarters', 'Surulere', 'DPO Surulere', 'CSP', '+234 803 400 0012', ['Surulere HQ', 'Aguda']),
        div('Yaba Division', 'Yaba', 'DPO Yaba', 'CSP', '+234 803 400 0013', ['Yaba', 'Tejuosho', 'Saboe']),
        div('Bode Thomas Division', 'Bode Thomas', 'DPO Bode Thomas', 'CSP', '+234 803 400 0014', ['Bode Thomas', 'Shitta']),
        div('Denton Division', 'Ebute Metta', 'DPO Denton', 'CSP', '+234 803 400 0015', ['Denton (Ebute Metta)', 'Iddo']),
        div('Iponri Division', 'Iponri', 'DPO Iponri', 'CSP', '+234 803 400 0016', ['Iponri', 'Bode Thomas Outpost']),
        div('Orile Division', 'Orile', 'DPO Orile', 'CSP', '+234 803 400 0017', ['Orile', 'Coker']),
      ]),
      area('Area F', 'Ikeja Area Command', 'Ikeja (State Capital)', 'Ikeja, Alausa Secretariat, Ojodu, Ilupeju', 'ACP Ikeja', '+234 803 300 0004', [
        div('Ikeja Divisional Headquarters', 'Ikeja', 'DPO Ikeja', 'CSP', '+234 803 400 0018', ['Ikeja HQ', 'Allen Avenue', 'Opebi']),
        div('Alausa Division', 'Alausa Secretariat', 'DPO Alausa', 'CSP', '+234 803 400 0019', ['Alausa (State Secretariat)', 'Secretariat Gate']),
        div('Ojodu Division', 'Ojodu', 'DPO Ojodu', 'CSP', '+234 803 400 0020', ['Ojodu', 'Ojodu Berger', 'Agidingbi']),
        div('Ilupeju Division', 'Ilupeju', 'DPO Ilupeju', 'CSP', '+234 803 400 0021', ['Ilupeju', 'Town Planning Way']),
        div('Shogunle Division', 'Shogunle', 'DPO Shogunle', 'CSP', '+234 803 400 0022', ['Shogunle', 'Oshodi']),
        div('Makinde Division', 'Makinde', 'DPO Makinde', 'CSP', '+234 803 400 0023', ['Makinde', 'Mafoluku']),
      ]),
    ],
  ),
  stateCmd(
    'FCT Abuja', 'Zone 7', 'Command HQ, Zaria Street, Garki II, Abuja',
    'CP FCT', 'Commissioner of Police (CP FCT)', '+234 803 200 0002',
    [
      area('Area Metro', 'Area Command Metro (Abuja City)', 'Maitama (Nile Street)', 'Central Business District, Maitama, Wuse, Asokoro, Garki, Utako, Lugbe', 'ACP Metro', '+234 803 300 0005', [
        div('Central Police Station (CPS Federal Secretariat)', 'Federal Secretariat', 'DPO CPS Federal Secretariat', 'CSP', '+234 803 400 0024', ['CPS Federal Secretariat', 'Three Arms Zone']),
        div('Maitama Division', 'Maitama (Nile Street)', 'DPO Maitama', 'CSP', '+234 803 400 0025', ['Maitama', 'Mississippi Street', 'Ibro Hotel Axis']),
        div('Wuse Division', 'Wuse Zone 3', 'DPO Wuse', 'CSP', '+234 803 400 0026', ['Wuse Zone 3', 'Wuse Zone 4', 'Wuse Zone 5']),
        div('Garki Division', 'Garki II', 'DPO Garki', 'CSP', '+234 803 400 0027', ['Garki II', 'Area 10', 'Garki Modern Market']),
        div('Asokoro Division', 'Asokoro (AYA)', 'DPO Asokoro', 'CSP', '+234 803 400 0028', ['Asokoro (AYA)', 'Yakubu Gowon Crescent', 'Aso Drive']),
        div('Utako Division', 'Utako', 'DPO Utako', 'CSP', '+234 803 400 0029', ['Utako', 'Jabi', 'Wuye']),
        div('Lugbe Division', 'Airport Road', 'DPO Lugbe', 'CSP', '+234 803 400 0030', ['Lugbe', 'Airport Road', 'Trademore Estate']),
      ]),
      area('Area Gwagwalada', 'Area Command Gwagwalada', 'Specialist Hospital Road', 'Gwagwalada Area Council, Airport Corridor, Zuba', 'ACP Gwagwalada', '+234 803 300 0006', [
        div('Gwagwalada Main Divisional HQ', 'Gwagwalada', 'DPO Gwagwalada', 'CSP', '+234 803 400 0031', ['Gwagwalada Main', 'Gwagwalada Market']),
        div('Zuba Division', 'Zuba', 'DPO Zuba', 'CSP', '+234 803 400 0032', ['Zuba', 'Zuba Motor Park', 'Madalla Junction']),
        div('Iddo Division', 'Iddo Sarki', 'DPO Iddo', 'CSP', '+234 803 400 0033', ['Iddo Sarki', 'Airport Road']),
      ]),
      area('Area Kubwa', 'Area Command Kubwa', 'Kubwa Phase 4', 'Kubwa Township, Dei-Dei, Dutse, Gwarimpa extensions', 'ACP Kubwa', '+234 803 300 0007', [
        div('Kubwa Phase 4 Divisional HQ', 'Kubwa Phase 4', 'DPO Kubwa', 'CSP', '+234 803 400 0034', ['Kubwa Phase 4', 'Kubwa Phase 2', 'Kubwa Phase 3']),
        div('Dei-Dei Division', 'Dei-Dei', 'DPO Dei-Dei', 'CSP', '+234 803 400 0035', ['Dei-Dei', 'Building Materials Market']),
        div('Gwarimpa Division', 'Gwarimpa', 'DPO Gwarimpa', 'CSP', '+234 803 400 0036', ['Gwarimpa 1st Avenue', 'Gwarimpa 2nd Avenue', 'Gwarimpa 3rd Avenue']),
      ]),
      area('Area Bwari', 'Area Command Bwari', 'Bwari Township', 'Bwari Area Council, Ushafa, Niger/Kaduna boundary axis', 'ACP Bwari', '+234 803 300 0008', [
        div('Bwari Main Divisional HQ', 'Bwari', 'DPO Bwari', 'CSP', '+234 803 400 0037', ['Bwari Main', 'Bwari Market']),
        div('Ushafa Division', 'Ushafa', 'DPO Ushafa', 'CSP', '+234 803 400 0038', ['Ushafa', 'Byazhin']),
      ]),
    ],
  ),
  stateCmd(
    'Kano State', 'Zone 1', 'State Command HQ, Bompai, Kano',
    'CP Kano', 'Commissioner of Police (CP Kano)', '+234 803 200 0003',
    [
      area('Area Metro', 'Metro Area Command', 'Central Kano', 'Kano Municipal, Fagge, Sabon Gari, Nassarawa', 'ACP Metro Kano', '+234 803 300 0009', [
        div('Central Police Station (CPS)', 'Central Kano', 'DPO CPS Kano', 'CSP', '+234 803 400 0039', ['CPS Kano', 'Emir Palace Road']),
        div('Fagge Division', 'Fagge', 'DPO Fagge', 'CSP', '+234 803 400 0040', ['Fagge', 'Fagge GO']),
        div('Sabon Gari Division', 'Sabon Gari', 'DPO Sabon Gari', 'CSP', '+234 803 400 0041', ['Sabon Gari', 'New Road']),
        div('Nassarawa Division', 'Nassarawa', 'DPO Nassarawa', 'CSP', '+234 803 400 0042', ['Nassarawa', 'Nassarawa GRA']),
      ]),
      area('Area Dala', 'Dala Area Command', 'Dala', 'Dala, Gwale, Mandawari historical quarters', 'ACP Dala', '+234 803 300 0010', [
        div('Dala Division', 'Dala', 'DPO Dala', 'CSP', '+234 803 400 0043', ['Dala', 'Dala Hills']),
        div('Kwalli Division', 'Kwalli', 'DPO Kwalli', 'CSP', '+234 803 400 0044', ['Kwalli', 'Kofar Kwalli']),
        div('Gwale Division', 'Gwale', 'DPO Gwale', 'CSP', '+234 803 400 0045', ['Gwale', 'Gwale Outpost']),
      ]),
      area('Area Bichi', 'Bichi Area Command', 'Bichi Town', 'Bichi, Gwarzo, Bagwai, Tofa', 'ACP Bichi', '+234 803 300 0011', [
        div('Bichi Divisional HQ', 'Bichi', 'DPO Bichi', 'CSP', '+234 803 400 0046', ['Bichi', 'Bichi Outpost']),
        div('Gwarzo Division', 'Gwarzo', 'DPO Gwarzo', 'CSP', '+234 803 400 0047', ['Gwarzo', 'Gwarzo Town']),
        div('Tofa Division', 'Tofa', 'DPO Tofa', 'CSP', '+234 803 400 0048', ['Tofa', 'Bagwai']),
      ]),
    ],
  ),
  stateCmd(
    'Rivers State', 'Zone 16', 'State Command HQ, Moscow Road, Port Harcourt',
    'CP Rivers', 'Commissioner of Police (CP Rivers)', '+234 803 200 0004',
    [
      area('Area Metro', 'Port Harcourt Metro Area Command', 'Moscow Road / Old GRA', 'Port Harcourt City, Diobu, Borokiri', 'ACP PH Metro', '+234 803 300 0012', [
        div('Central Police Station (CPS Port Harcourt)', 'Moscow Road', 'DPO CPS PH', 'CSP', '+234 803 400 0049', ['CPS PH', 'Moscow Road']),
        div('Borokiri Division', 'Borokiri', 'DPO Borokiri', 'CSP', '+234 803 400 0050', ['Borokiri', 'Navy Base']),
        div('Mile 1 Diobu Division', 'Mile 1 Diobu', 'DPO Mile 1', 'CSP', '+234 803 400 0051', ['Mile 1 Diobu', 'Mile 2']),
        div('Old GRA Division', 'Old GRA', 'DPO Old GRA', 'CSP', '+234 803 400 0052', ['Old GRA', 'GRA Phase 2']),
      ]),
      area('Area Choba', 'Choba Area Command', 'Choba Axis', 'Choba, Ozuoba, Rumuolumeni, University corridor', 'ACP Choba', '+234 803 300 0013', [
        div('Choba Divisional HQ', 'Choba', 'DPO Choba', 'CSP', '+234 803 400 0053', ['Choba', 'University of Port Harcourt']),
        div('Rumuolumeni Division', 'Rumuolumeni', 'DPO Rumuolumeni', 'CSP', '+234 803 400 0054', ['Rumuolumeni', 'Rumuolumeni Outpost']),
        div('Ozuoba Division', 'Ozuoba', 'DPO Ozuoba', 'CSP', '+234 803 400 0055', ['Ozuoba', 'Ozuoba Town']),
      ]),
      area('Area Bori', 'Bori Area Command', 'Bori (Ogoni Land)', 'Khana, Gokana, Tai', 'ACP Bori', '+234 803 300 0014', [
        div('Bori Divisional HQ', 'Bori', 'DPO Bori', 'CSP', '+234 803 400 0056', ['Bori', 'Bori Market']),
        div('Gokana Division', 'Gokana', 'DPO Gokana', 'CSP', '+234 803 400 0057', ['Gokana', 'B-Dere']),
        div('Tai Division', 'Tai', 'DPO Tai', 'CSP', '+234 803 400 0058', ['Tai', 'Saakpenwa']),
      ]),
    ],
  ),
  stateCmd(
    'Kaduna State', 'Zone 14', 'State Command HQ, Bida Road, Kaduna',
    'CP Kaduna', 'Commissioner of Police (CP Kaduna)', '+234 803 200 0005',
    [
      area('Area Metro', 'Kaduna Metro Area Command', 'Kaduna City Central', 'Kaduna North and South LGAs', 'ACP Kaduna Metro', '+234 803 300 0015', [
        div('Sabon Gari Division', 'Sabon Gari', 'DPO Sabon Gari', 'CSP', '+234 803 400 0059', ['Sabon Gari', 'Sabon Gari Market']),
        div('Kabala Doki Division', 'Kabala Doki', 'DPO Kabala Doki', 'CSP', '+234 803 400 0060', ['Kabala Doki', 'Kabala West']),
        div('Unguwan Rimi Division', 'Unguwan Rimi', 'DPO Unguwan Rimi', 'CSP', '+234 803 400 0061', ['Unguwan Rimi', 'Unguwan Rimi Outpost']),
        div('Kawo Division', 'Kawo', 'DPO Kawo', 'CSP', '+234 803 400 0062', ['Kawo', 'Kawo Market']),
        div('Tudun Wada Division', 'Tudun Wada', 'DPO Tudun Wada', 'CSP', '+234 803 400 0063', ['Tudun Wada', 'Tudun Wada Outpost']),
      ]),
      area('Area Zaria', 'Zaria Area Command', 'Zaria City', 'Zaria, Sabon Gari Zaria, Samaru', 'ACP Zaria', '+234 803 300 0016', [
        div('Zaria City Division', 'Zaria City', 'DPO Zaria City', 'CSP', '+234 803 400 0064', ['Zaria City', 'Zaria City Gate']),
        div('Samaru Division', 'Samaru', 'DPO Samaru', 'CSP', '+234 803 400 0065', ['Samaru', 'ABU Samaru']),
        div('Sabon Gari Zaria Division', 'Sabon Gari Zaria', 'DPO Sabon Gari Zaria', 'CSP', '+234 803 400 0066', ['Sabon Gari Zaria', 'Sabon Gari Market']),
      ]),
      area('Area Kafanchan', 'Kafanchan Area Command', 'Kafanchan', 'Southern Kaduna, Jemaa, Zangon Kataf', 'ACP Kafanchan', '+234 803 300 0017', [
        div('Kafanchan Divisional HQ', 'Kafanchan', 'DPO Kafanchan', 'CSP', '+234 803 400 0067', ['Kafanchan', 'Kafanchan Market']),
        div('Zonkwa Division', 'Zonkwa', 'DPO Zonkwa', 'CSP', '+234 803 400 0068', ['Zonkwa', 'Zonkwa Town']),
        div('Kagoro Division', 'Kagoro', 'DPO Kagoro', 'CSP', '+234 803 400 0069', ['Kagoro', 'Kagoro Hills']),
      ]),
    ],
  ),
  stateCmd(
    'Anambra State', 'Zone 13', 'State Command HQ, Zik Avenue, Awka',
    'CP Anambra', 'Commissioner of Police (CP Anambra)', '+234 803 200 0006',
    [
      area('Area Awka', 'Awka Metro Area Command', 'Awka', 'Awka Capital Territory, Dunukofia, Anaocha', 'ACP Awka', '+234 803 300 0018', [
        div('Central Police Station (CPS Awka)', 'Awka', 'DPO CPS Awka', 'CSP', '+234 803 400 0070', ['CPS Awka', 'Awka Capital']),
        div("'B' Division Awka", 'Awka', "DPO B Division", 'CSP', '+234 803 400 0071', ['B Division Awka', 'Amansea Outpost']),
        div('Dunukofia Division', 'Dunukofia', 'DPO Dunukofia', 'CSP', '+234 803 400 0072', ['Dunukofia', 'Ukpo']),
        div('Abagana Division', 'Abagana', 'DPO Abagana', 'CSP', '+234 803 400 0073', ['Abagana', 'Neni']),
      ]),
      area('Area Onitsha', 'Onitsha Area Command', 'Onitsha Commercial City', 'Onitsha North/South, Ogbaru, River Niger bridgehead', 'ACP Onitsha', '+234 803 300 0019', [
        div('Central Police Station (CPS Onitsha)', 'Onitsha', 'DPO CPS Onitsha', 'CSP', '+234 803 400 0074', ['CPS Onitsha', 'Main Market']),
        div('Inland Town Division', 'Inland Town', 'DPO Inland Town', 'CSP', '+234 803 400 0075', ['Inland Town', 'Fegge Road']),
        div('Fegge Division', 'Fegge', 'DPO Fegge', 'CSP', '+234 803 400 0076', ['Fegge', 'Fegge Outpost']),
        div('Okpoko Division', 'Okpoko', 'DPO Okpoko', 'CSP', '+234 803 400 0077', ['Okpoko', 'Okpoko Market']),
      ]),
      area('Area Nnewi', 'Nnewi Area Command', 'Nnewi Industrial Hub', 'Nnewi North/South, Ozubulu', 'ACP Nnewi', '+234 803 300 0020', [
        div('Central Police Station (CPS Nnewi)', 'Nnewi', 'DPO CPS Nnewi', 'CSP', '+234 803 400 0078', ['CPS Nnewi', 'Nnewi Main']),
        div('Nnewi Division', 'Nnewi', 'DPO Nnewi', 'CSP', '+234 803 400 0079', ['Nnewi', 'Otolo Road']),
        div('Ozubulu Division', 'Ozubulu', 'DPO Ozubulu', 'CSP', '+234 803 400 0080', ['Ozubulu', 'Ozubulu Town']),
      ]),
    ],
  ),
]

/* ------------------------- Wire zones to states ---------------------------- */

// Link each state command to its zonal command
STATE_COMMANDS.forEach((st) => {
  const zone = ZONAL_COMMANDS.find((z) => z.zone === st.zone)
  if (zone && !zone.stateCommands.includes(st)) zone.stateCommands.push(st)
})

FORCE_HQ.zones = ZONAL_COMMANDS

/* --------------------------- Drill-down types ------------------------------ */

type Level = 'force' | 'zone' | 'state' | 'area' | 'division' | 'station'

type DrillState =
  | { level: 'force' }
  | { level: 'zone'; zoneIndex: number }
  | { level: 'state'; zoneIndex: number; stateIndex: number }
  | { level: 'area'; zoneIndex: number; stateIndex: number; areaIndex: number }
  | { level: 'division'; zoneIndex: number; stateIndex: number; areaIndex: number; divisionIndex: number }
  | { level: 'station'; zoneIndex: number; stateIndex: number; areaIndex: number; divisionIndex: number; stationIndex: number }

/* --------------------------- Contact card UI -------------------------------- */

function ContactCard({ contact, label }: { contact: ContactInfo; label: string }) {
  return (
    <div className="rounded-xl border border-[#00c46a]/25 bg-gradient-to-r from-[#00c46a]/8 to-transparent p-4">
      <p className="font-(--font-mono) text-[10px] font-bold uppercase tracking-wider text-[#00c46a]">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-full bg-[#00c46a]/20 font-(--font-display) text-sm font-bold text-[#00c46a]">
          {contact.officerName.charAt(0)}
        </span>
        <div>
          <p className="font-(--font-display) text-sm font-bold text-[var(--sr-heading)]">{contact.officerName}</p>
          <p className="font-(--font-mono) text-[10px] uppercase tracking-wider text-[var(--portal-dim)]">{contact.rank}</p>
        </div>
      </div>
      <div className="mt-3 space-y-1.5 border-t border-[#00c46a]/15 pt-2.5">
        <a href={`tel:${contact.phone.replace(/\s/g, '')}`} className="flex items-center gap-2 text-xs text-[var(--portal-fg)] transition hover:text-[#00c46a]">
          <span aria-hidden>📞</span> {contact.phone}
        </a>
        <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-xs text-[var(--portal-fg)] transition hover:text-[#00c46a]">
          <span aria-hidden>✉️</span> {contact.email}
        </a>
      </div>
    </div>
  )
}

/* ------------------------------ Breadcrumb --------------------------------- */

function Breadcrumb({ trail, onNavigate }: {
  trail: { label: string; level: Level }[]
  onNavigate: (level: Level, index?: number) => void
}) {
  return (
    <nav className="flex flex-wrap items-center gap-1 font-(--font-mono) text-[11px]">
      {trail.map((item, idx) => (
        <span key={idx} className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onNavigate(item.level, idx)}
            className={`rounded px-1.5 py-0.5 font-semibold transition ${
              idx === trail.length - 1
                ? 'bg-[#00c46a]/15 text-[#00c46a]'
                : 'text-[var(--portal-muted)] hover:text-[var(--portal-fg)]'
            }`}
          >
            {item.label}
          </button>
          {idx < trail.length - 1 && <span className="text-[var(--portal-dim)]">›</span>}
        </span>
      ))}
    </nav>
  )
}

/* --------------------------- Child item button ----------------------------- */

function ChildButton({ label, sublabel, badge, onClick, accent }: {
  label: string
  sublabel?: string
  badge?: string
  onClick: () => void
  accent?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center justify-between gap-3 rounded-xl border border-[color:var(--portal-border)] bg-gradient-to-b from-[color:var(--sr-card-grad-a)] to-[color:var(--sr-card-grad-b)] p-4 text-left shadow-[var(--sr-card-shadow)] transition hover:border-[#00c46a]/40 hover:shadow-[0_4px_20px_rgba(0,196,106,0.12)]"
    >
      <div className="min-w-0 flex-1">
        {badge && (
          <span className="inline-block rounded bg-[#0DCCB0]/20 px-2 py-0.5 font-(--font-mono) text-[10px] font-bold text-[#0DCCB0]">
            {badge}
          </span>
        )}
        <h5 className="mt-1 font-(--font-display) text-sm font-bold text-[var(--sr-heading)]">{label}</h5>
        {sublabel && <p className="mt-0.5 truncate text-xs text-[var(--portal-muted)]">{sublabel}</p>}
      </div>
      <span className={`shrink-0 font-(--font-mono) text-lg transition group-hover:translate-x-0.5 ${accent ?? 'text-[#00c46a]'}`} aria-hidden>
        ›
      </span>
    </button>
  )
}

/* ============================== Main component ============================== */

export function NpfCommandDirectoryView() {
  const [drill, setDrill] = useState<DrillState>({ level: 'force' })
  const [searchQuery, setSearchQuery] = useState('')

  /* Breadcrumb trail */
  const trail: { label: string; level: Level }[] = useMemo(() => {
    const t: { label: string; level: Level }[] = [{ label: 'Force HQ', level: 'force' }]
    if (drill.level === 'force') return t
    const zone = ZONAL_COMMANDS[drill.zoneIndex]
    t.push({ label: zone.zone, level: 'zone' })
    if (drill.level === 'zone') return t
    const st = zone.stateCommands[drill.stateIndex]
    t.push({ label: st.state, level: 'state' })
    if (drill.level === 'state') return t
    const ac = st.areaCommands[drill.areaIndex]
    t.push({ label: ac.code, level: 'area' })
    if (drill.level === 'area') return t
    const dv = ac.divisions[drill.divisionIndex]
    t.push({ label: dv.name, level: 'division' })
    if (drill.level === 'division') return t
    const sn = dv.stations[drill.stationIndex]
    t.push({ label: sn.name, level: 'station' })
    return t
  }, [drill])

  function navigate(level: Level, index?: number) {
    if (level === 'force') setDrill({ level: 'force' })
    else if (level === 'zone' && typeof index === 'number') setDrill({ level: 'zone', zoneIndex: ZONAL_COMMANDS.findIndex((z) => z.zone === trail[index]?.label) })
    else if (level === 'zone') setDrill({ level: 'zone', zoneIndex: (drill as Extract<DrillState, { level: 'zone' }>).zoneIndex })
    else if (level === 'state' && typeof index === 'number') {
      // Find zone from breadcrumb
      const zoneLabel = trail.slice(0, index + 1).find((b) => b.level === 'zone')?.label
      const zoneIndex = ZONAL_COMMANDS.findIndex((z) => z.zone === zoneLabel)
      const stateLabel = trail[index]?.label
      const stateIndex = ZONAL_COMMANDS[zoneIndex]?.stateCommands.findIndex((s) => s.state === stateLabel) ?? 0
      setDrill({ level: 'state', zoneIndex, stateIndex })
    } else if (level === 'state') setDrill({ level: 'state', zoneIndex: (drill as Extract<DrillState, { level: 'state' }>).zoneIndex, stateIndex: (drill as Extract<DrillState, { level: 'state' }>).stateIndex })
    else if (level === 'area' && typeof index === 'number') {
      const d = drill as Extract<DrillState, { level: 'area' | 'division' | 'station' }>
      setDrill({ level: 'area', zoneIndex: d.zoneIndex, stateIndex: d.stateIndex, areaIndex: d.areaIndex })
    } else if (level === 'division' && typeof index === 'number') {
      const d = drill as Extract<DrillState, { level: 'division' | 'station' }>
      setDrill({ level: 'division', zoneIndex: d.zoneIndex, stateIndex: d.stateIndex, areaIndex: d.areaIndex, divisionIndex: d.divisionIndex })
    }
  }

  /* Search across all levels */
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null
    const q = searchQuery.toLowerCase()
    const results: { level: Level; label: string; sublabel: string; drill: DrillState }[] = []
    ZONAL_COMMANDS.forEach((z, zi) => {
      if (z.zone.toLowerCase().includes(q) || z.hq.toLowerCase().includes(q) || z.states.some((s) => s.toLowerCase().includes(q))) {
        results.push({ level: 'zone', label: z.zone, sublabel: z.hq, drill: { level: 'zone', zoneIndex: zi } })
      }
      z.stateCommands.forEach((st, si) => {
        if (st.state.toLowerCase().includes(q) || st.hq.toLowerCase().includes(q)) {
          results.push({ level: 'state', label: st.state, sublabel: st.hq, drill: { level: 'state', zoneIndex: zi, stateIndex: si } })
        }
        st.areaCommands.forEach((ac, ai) => {
          if (ac.name.toLowerCase().includes(q) || ac.code.toLowerCase().includes(q) || ac.districts.toLowerCase().includes(q)) {
            results.push({ level: 'area', label: `${ac.code} · ${ac.name}`, sublabel: ac.hqLocation, drill: { level: 'area', zoneIndex: zi, stateIndex: si, areaIndex: ai } })
          }
          ac.divisions.forEach((dv, di) => {
            if (dv.name.toLowerCase().includes(q)) {
              results.push({ level: 'division', label: dv.name, sublabel: dv.hqLocation, drill: { level: 'division', zoneIndex: zi, stateIndex: si, areaIndex: ai, divisionIndex: di } })
            }
            dv.stations.forEach((sn, sti) => {
              if (sn.name.toLowerCase().includes(q)) {
                results.push({ level: 'station', label: sn.name, sublabel: sn.location, drill: { level: 'station', zoneIndex: zi, stateIndex: si, areaIndex: ai, divisionIndex: di, stationIndex: sti } })
              }
            })
          })
        })
      })
    })
    return results.slice(0, 50)
  }, [searchQuery])

  return (
    <div className="space-y-5">
      {/* Banner */}
      <div className="flex flex-col gap-4 rounded-2xl border border-[#00c46a]/30 bg-gradient-to-r from-[#00c46a]/10 via-[color:var(--portal-table-row-hover)] to-transparent p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 font-(--font-mono) text-[10px] font-bold uppercase tracking-widest text-[#00c46a]">
            <span className="size-2 rounded-full bg-[#00c46a] animate-pulse" />
            Official Police Directory
          </span>
          <h3 className="mt-1 font-(--font-display) text-lg font-bold text-[var(--sr-heading)]">
            NPF National Command Directory & Territorial Cascade
          </h3>
          <p className="mt-1 text-xs text-[var(--portal-muted)]">
            Click Force HQ to drill down through Zonal Commands → State Commands → Area Commands → Divisions → Stations.
            Each level shows the contact officer, phone, and email.
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

      {/* Search bar */}
      <div className="relative max-w-md">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search Zone, State, Area, Division, or Station…"
          className="w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-input-bg)] py-2 pl-9 pr-3 text-xs text-[var(--portal-fg)] placeholder:text-[var(--portal-dim)] focus:border-[#00c46a] focus:outline-none"
        />
        <span className="pointer-events-none absolute left-3 top-2.5 text-xs text-[var(--portal-dim)]">🔍</span>
      </div>

      {/* Search results */}
      {searchResults ? (
        <div className="space-y-2">
          <p className="font-(--font-mono) text-[10px] font-bold uppercase tracking-wider text-[var(--portal-dim)]">
            {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
          </p>
          {searchResults.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--portal-muted)]">No matches for &ldquo;{searchQuery}&rdquo;.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {searchResults.map((r, i) => (
                <ChildButton
                  key={i}
                  badge={r.level.toUpperCase()}
                  label={r.label}
                  sublabel={r.sublabel}
                  onClick={() => { setDrill(r.drill); setSearchQuery('') }}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Breadcrumb */}
          <Breadcrumb trail={trail} onNavigate={navigate} />

          {/* FORCE HQ level */}
          {drill.level === 'force' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-red-500/30 bg-gradient-to-b from-red-500/10 to-transparent p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <span className="rounded bg-red-500/20 px-2.5 py-0.5 font-(--font-mono) text-[11px] font-bold text-red-300">
                      Tier 1 · National
                    </span>
                    <h4 className="mt-2 font-(--font-display) text-xl font-bold text-[var(--sr-heading)]">{FORCE_HQ.name}</h4>
                    <p className="mt-1 text-xs text-[var(--portal-muted)]">{FORCE_HQ.location}</p>
                    <p className="mt-2 text-[11px] text-[var(--portal-dim)]">
                      Led by the <strong>Inspector-General of Police (IGP)</strong> and 7 DIGs. Overall election security command.
                    </p>
                  </div>
                  <div className="min-w-[240px]">
                    <ContactCard contact={FORCE_HQ.contact} label="Force HQ Contact" />
                  </div>
                </div>
              </div>
              <div>
                <p className="mb-2 font-(--font-mono) text-[10px] font-bold uppercase tracking-wider text-[var(--portal-dim)]">
                  Click a Zonal Command to drill down ↓
                </p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {FORCE_HQ.zones.map((z, zi) => (
                    <ChildButton
                      key={z.zone}
                      badge={z.zone}
                      label={z.hq}
                      sublabel={`${z.states.length} state${z.states.length > 1 ? 's' : ''}: ${z.states.join(', ')}`}
                      onClick={() => setDrill({ level: 'zone', zoneIndex: zi })}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ZONE level */}
          {drill.level === 'zone' && (() => {
            const z = ZONAL_COMMANDS[drill.zoneIndex]
            return (
              <div className="space-y-4">
                <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-emerald-500/10 to-transparent p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <span className="rounded bg-emerald-500/20 px-2.5 py-0.5 font-(--font-mono) text-[11px] font-bold text-emerald-300">
                        Tier 2 · Regional
                      </span>
                      <h4 className="mt-2 font-(--font-display) text-xl font-bold text-[var(--sr-heading)]">{z.zone}</h4>
                      <p className="mt-1 text-xs text-[var(--portal-muted)]">HQ: {z.hq}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {z.states.map((st) => (
                          <span key={st} className="rounded border border-[color:var(--portal-border)] bg-[color:var(--portal-table-row-hover)] px-2 py-0.5 font-(--font-mono) text-[10px] font-semibold text-[var(--portal-fg)]">
                            {st}
                          </span>
                        ))}
                      </div>
                      <p className="mt-3 max-w-xl text-[11px] leading-relaxed text-[var(--portal-muted)]">{z.mandate}</p>
                    </div>
                    <div className="min-w-[240px]">
                      <ContactCard contact={z.contact} label="Zonal HQ Contact" />
                    </div>
                  </div>
                </div>
                <div>
                  <p className="mb-2 font-(--font-mono) text-[10px] font-bold uppercase tracking-wider text-[var(--portal-dim)]">
                    State Commands under {z.zone} — click to drill down ↓
                  </p>
                  {z.stateCommands.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {z.stateCommands.map((st, si) => (
                        <ChildButton
                          key={st.state}
                          badge={st.zone}
                          label={st.state}
                          sublabel={st.hq}
                          onClick={() => setDrill({ level: 'state', zoneIndex: drill.zoneIndex, stateIndex: si })}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-table-row-hover)] p-4 text-xs text-[var(--portal-muted)]">
                      No detailed state command data linked to {z.zone} yet. The states under this zone are {z.states.join(', ')}.
                    </p>
                  )}
                </div>
              </div>
            )
          })()}

          {/* STATE level */}
          {drill.level === 'state' && (() => {
            const z = ZONAL_COMMANDS[drill.zoneIndex]
            const st = z.stateCommands[drill.stateIndex]
            return (
              <div className="space-y-4">
                <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-b from-cyan-500/10 to-transparent p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <span className="rounded bg-cyan-500/20 px-2.5 py-0.5 font-(--font-mono) text-[11px] font-bold text-cyan-300">
                        Tier 3 · State
                      </span>
                      <h4 className="mt-2 font-(--font-display) text-xl font-bold text-[var(--sr-heading)]">{st.state} Police Command</h4>
                      <p className="mt-1 text-xs text-[var(--portal-muted)]">{st.hq}</p>
                      <p className="mt-2 font-(--font-mono) text-[10px] uppercase tracking-wider text-[#d9b64a]">{st.zone} Oversight</p>
                    </div>
                    <div className="min-w-[240px]">
                      <ContactCard contact={st.contact} label="State CP Contact" />
                    </div>
                  </div>
                </div>
                <div>
                  <p className="mb-2 font-(--font-mono) text-[10px] font-bold uppercase tracking-wider text-[var(--portal-dim)]">
                    Area Commands under {st.state} — click to drill down ↓
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {st.areaCommands.map((ac, ai) => (
                      <ChildButton
                        key={ac.code}
                        badge={ac.code}
                        label={ac.name}
                        sublabel={`HQ: ${ac.hqLocation} · ${ac.divisions.length} divisions`}
                        onClick={() => setDrill({ level: 'area', zoneIndex: drill.zoneIndex, stateIndex: drill.stateIndex, areaIndex: ai })}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* AREA level */}
          {drill.level === 'area' && (() => {
            const z = ZONAL_COMMANDS[drill.zoneIndex]
            const st = z.stateCommands[drill.stateIndex]
            const ac = st.areaCommands[drill.areaIndex]
            return (
              <div className="space-y-4">
                <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-500/10 to-transparent p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <span className="rounded bg-amber-500/20 px-2.5 py-0.5 font-(--font-mono) text-[11px] font-bold text-amber-300">
                        Tier 4 · Sub-State
                      </span>
                      <h4 className="mt-2 font-(--font-display) text-xl font-bold text-[var(--sr-heading)]">{ac.code} · {ac.name}</h4>
                      <p className="mt-1 text-xs text-[var(--portal-muted)]">HQ: {ac.hqLocation}</p>
                      <p className="mt-1 text-xs text-[var(--portal-dim)]"><strong>Jurisdiction:</strong> {ac.districts}</p>
                    </div>
                    <div className="min-w-[240px]">
                      <ContactCard contact={ac.contact} label="Area Commander Contact" />
                    </div>
                  </div>
                </div>
                <div>
                  <p className="mb-2 font-(--font-mono) text-[10px] font-bold uppercase tracking-wider text-[var(--portal-dim)]">
                    Divisions under {ac.code} — click to see stations ↓
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {ac.divisions.map((dv, di) => (
                      <ChildButton
                        key={dv.name}
                        label={dv.name}
                        sublabel={`HQ: ${dv.hqLocation} · ${dv.stations.length} station${dv.stations.length > 1 ? 's' : ''}`}
                        onClick={() => setDrill({ level: 'division', zoneIndex: drill.zoneIndex, stateIndex: drill.stateIndex, areaIndex: drill.areaIndex, divisionIndex: di })}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* DIVISION level */}
          {drill.level === 'division' && (() => {
            const z = ZONAL_COMMANDS[drill.zoneIndex]
            const st = z.stateCommands[drill.stateIndex]
            const ac = st.areaCommands[drill.areaIndex]
            const dv = ac.divisions[drill.divisionIndex]
            return (
              <div className="space-y-4">
                <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-b from-purple-500/10 to-transparent p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <span className="rounded bg-purple-500/20 px-2.5 py-0.5 font-(--font-mono) text-[11px] font-bold text-purple-300">
                        Tier 5 · Divisional
                      </span>
                      <h4 className="mt-2 font-(--font-display) text-xl font-bold text-[var(--sr-heading)]">{dv.name}</h4>
                      <p className="mt-1 text-xs text-[var(--portal-muted)]">Divisional HQ: {dv.hqLocation}</p>
                    </div>
                    <div className="min-w-[240px]">
                      <ContactCard contact={dv.contact} label="Divisional DPO Contact" />
                    </div>
                  </div>
                </div>
                <div>
                  <p className="mb-2 font-(--font-mono) text-[10px] font-bold uppercase tracking-wider text-[var(--portal-dim)]">
                    Police Stations under {dv.name} — click for station contact ↓
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {dv.stations.map((sn, sti) => (
                      <ChildButton
                        key={sn.name}
                        label={sn.name}
                        sublabel={sn.location}
                        onClick={() => setDrill({ level: 'station', zoneIndex: drill.zoneIndex, stateIndex: drill.stateIndex, areaIndex: drill.areaIndex, divisionIndex: drill.divisionIndex, stationIndex: sti })}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* STATION level (leaf) */}
          {drill.level === 'station' && (() => {
            const z = ZONAL_COMMANDS[drill.zoneIndex]
            const st = z.stateCommands[drill.stateIndex]
            const ac = st.areaCommands[drill.areaIndex]
            const dv = ac.divisions[drill.divisionIndex]
            const sn = dv.stations[drill.stationIndex]
            return (
              <div className="space-y-4">
                <div className="rounded-2xl border border-[#00c46a]/30 bg-gradient-to-b from-[#00c46a]/10 to-transparent p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <span className="rounded bg-[#00c46a]/20 px-2.5 py-0.5 font-(--font-mono) text-[11px] font-bold text-[#00c46a]">
                        Frontline Station
                      </span>
                      <h4 className="mt-2 font-(--font-display) text-xl font-bold text-[var(--sr-heading)]">{sn.name}</h4>
                      <p className="mt-1 text-xs text-[var(--portal-muted)]">Location: {sn.location}</p>
                      <p className="mt-1 text-xs text-[var(--portal-dim)]">
                        Under {dv.name} · {ac.code} · {st.state}
                      </p>
                    </div>
                    <div className="min-w-[240px]">
                      <ContactCard contact={sn.contact} label="Station DPO Contact" />
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDrill({ level: 'division', zoneIndex: drill.zoneIndex, stateIndex: drill.stateIndex, areaIndex: drill.areaIndex, divisionIndex: drill.divisionIndex })}
                  className="inline-flex items-center gap-1.5 font-(--font-mono) text-[11px] font-semibold text-[#00c46a] transition hover:text-[var(--sr-heading)]"
                >
                  ← Back to {dv.name}
                </button>
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}
