// Bahasa Melayu (default) and English strings.
const STRINGS = {
  ms: {
    search: 'Ke mana?',
    searching: 'Mencari…',
    noResults: 'Tiada hasil',
    report: 'Lapor',
    reportWhat: 'Apa yang anda nampak?',
    reportSent: 'Terima kasih! Laporan dihantar.',
    reportMerged: 'Terima kasih! Laporan sedia ada telah disahkan.',
    reportFailed: 'Gagal menghantar laporan',
    reportHere: 'Laporan akan dibuat di lokasi anda',
    reportAtCenter: 'Lokasi tidak diketahui — laporan dibuat di tengah peta',
    cancel: 'Batal',
    send: 'Hantar',
    notePlaceholder: 'Catatan (pilihan)',
    stillThere: 'Masih ada',
    notThere: 'Tiada lagi',
    thanks: 'Terima kasih!',
    go: 'Mula',
    routes: 'Laluan',
    best: 'Terbaik',
    incidents: (n) => (n === 0 ? 'Tiada laporan di laluan' : `${n} laporan di laluan`),
    via: 'melalui',
    stop: 'Tamat',
    simulate: 'Simulasi',
    arrived: 'Anda telah tiba',
    rerouting: 'Mengira semula laluan…',
    routeFailed: 'Tidak dapat mencari laluan',
    locating: 'Mencari lokasi anda…',
    locationDenied: 'Akses lokasi ditolak — titik mula ialah tengah peta',
    ahead: (what, dist) => `${what} di hadapan, ${dist}`,
    in: (dist) => `Dalam ${dist}`,
    then: 'kemudian',
    ago: (m) => (m < 1 ? 'baru sahaja' : m < 60 ? `${m} min lalu` : `${Math.round(m / 60)} jam lalu`),
    confirmations: (n) => `${n} pengesahan`,
    eta: 'Tiba',
    min: 'min',
    h: 'j',
    km: 'km',
    m: 'm',
    live: 'Langsung',
    deviceOnly: 'Peranti ini sahaja',
    offline: 'Luar talian',
    types: {
      jam: 'Kesesakan',
      police: 'Polis',
      accident: 'Kemalangan',
      hazard: 'Bahaya',
      flood: 'Banjir',
      closure: 'Jalan ditutup',
      camera: 'Kamera',
    },
    subtypes: {
      moderate: 'Sederhana',
      heavy: 'Teruk',
      standstill: 'Tidak bergerak',
      visible: 'Kelihatan',
      hidden: 'Tersembunyi',
      roadblock: 'Sekatan jalan raya (SJR)',
      minor: 'Kecil',
      major: 'Besar',
      pothole: 'Lubang jalan',
      object: 'Objek di jalan',
      stopped_vehicle: 'Kenderaan berhenti',
      animal: 'Haiwan',
      oil_spill: 'Tumpahan minyak',
      passable: 'Boleh dilalui',
      impassable: 'Tidak boleh dilalui',
      roadworks: 'Kerja jalan',
      event: 'Acara',
      landslide: 'Tanah runtuh',
      speed: 'Had laju',
      red_light: 'Lampu merah',
      awas: 'AWAS',
    },
    maneuver: {
      depart: 'Mula perjalanan',
      arrive: 'Tiba di destinasi',
      left: 'Belok kiri',
      right: 'Belok kanan',
      'slight left': 'Condong ke kiri',
      'slight right': 'Condong ke kanan',
      'sharp left': 'Belok tajam ke kiri',
      'sharp right': 'Belok tajam ke kanan',
      straight: 'Terus',
      uturn: 'Buat pusingan U',
      roundabout: (exit) => `Di bulatan, ambil susur keluar ke-${exit}`,
      mergeLeft: 'Masuk ke kiri',
      mergeRight: 'Masuk ke kanan',
      rampLeft: 'Ambil susur kiri',
      rampRight: 'Ambil susur kanan',
      keepLeft: 'Kekal di kiri',
      keepRight: 'Kekal di kanan',
      onto: 'ke',
    },
  },
  en: {
    search: 'Where to?',
    searching: 'Searching…',
    noResults: 'No results',
    report: 'Report',
    reportWhat: 'What do you see?',
    reportSent: 'Thanks! Report sent.',
    reportMerged: 'Thanks! You confirmed an existing report.',
    reportFailed: 'Could not send report',
    reportHere: 'Reporting at your location',
    reportAtCenter: 'Location unknown — reporting at the map centre',
    cancel: 'Cancel',
    send: 'Send',
    notePlaceholder: 'Note (optional)',
    stillThere: 'Still there',
    notThere: 'Not there',
    thanks: 'Thanks!',
    go: 'Go',
    routes: 'Routes',
    best: 'Best',
    incidents: (n) => (n === 0 ? 'No reports on route' : `${n} report${n > 1 ? 's' : ''} on route`),
    via: 'via',
    stop: 'End',
    simulate: 'Simulate',
    arrived: 'You have arrived',
    rerouting: 'Rerouting…',
    routeFailed: 'Could not find a route',
    locating: 'Finding your location…',
    locationDenied: 'Location denied — starting from the map centre',
    ahead: (what, dist) => `${what} ahead, ${dist}`,
    in: (dist) => `In ${dist}`,
    then: 'then',
    ago: (m) => (m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`),
    confirmations: (n) => `${n} confirmation${n === 1 ? '' : 's'}`,
    eta: 'ETA',
    min: 'min',
    h: 'h',
    km: 'km',
    m: 'm',
    live: 'Live',
    deviceOnly: 'This device only',
    offline: 'Offline',
    types: {
      jam: 'Traffic jam',
      police: 'Police',
      accident: 'Accident',
      hazard: 'Hazard',
      flood: 'Flood',
      closure: 'Road closed',
      camera: 'Camera',
    },
    subtypes: {
      moderate: 'Moderate',
      heavy: 'Heavy',
      standstill: 'Standstill',
      visible: 'Visible',
      hidden: 'Hidden',
      roadblock: 'Roadblock (SJR)',
      minor: 'Minor',
      major: 'Major',
      pothole: 'Pothole',
      object: 'Object on road',
      stopped_vehicle: 'Stopped vehicle',
      animal: 'Animal',
      oil_spill: 'Oil spill',
      passable: 'Passable',
      impassable: 'Impassable',
      roadworks: 'Roadworks',
      event: 'Event',
      landslide: 'Landslide',
      speed: 'Speed',
      red_light: 'Red light',
      awas: 'AWAS',
    },
    maneuver: {
      depart: 'Start driving',
      arrive: 'Arrive at destination',
      left: 'Turn left',
      right: 'Turn right',
      'slight left': 'Bear left',
      'slight right': 'Bear right',
      'sharp left': 'Turn sharp left',
      'sharp right': 'Turn sharp right',
      straight: 'Continue straight',
      uturn: 'Make a U-turn',
      roundabout: (exit) => `At the roundabout, take exit ${exit}`,
      mergeLeft: 'Merge left',
      mergeRight: 'Merge right',
      rampLeft: 'Take the ramp on the left',
      rampRight: 'Take the ramp on the right',
      keepLeft: 'Keep left',
      keepRight: 'Keep right',
      onto: 'onto',
    },
  },
};

let lang = 'ms';
try {
  lang = localStorage.getItem('lang') || (navigator.language?.startsWith('en') ? 'en' : 'ms');
} catch {}

export const getLang = () => lang;
export function setLang(l) {
  lang = l;
  try {
    localStorage.setItem('lang', l);
  } catch {}
}
export const t = () => STRINGS[lang];
export const speechLang = () => (lang === 'ms' ? 'ms-MY' : 'en-MY');

export function formatDistance(m) {
  const s = t();
  if (m >= 1000) return `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} ${s.km}`;
  if (m >= 100) return `${Math.round(m / 50) * 50} ${s.m}`;
  return `${Math.max(10, Math.round(m / 10) * 10)} ${s.m}`;
}

export function formatDuration(sec) {
  const s = t();
  const mins = Math.max(1, Math.round(sec / 60));
  if (mins < 60) return `${mins} ${s.min}`;
  return `${Math.floor(mins / 60)} ${s.h} ${mins % 60} ${s.min}`;
}

export function instruction(step) {
  const M = t().maneuver;
  const mod = step.modifier;
  let text;
  switch (step.type) {
    case 'depart':
      text = M.depart;
      break;
    case 'arrive':
      return M.arrive;
    case 'roundabout':
    case 'rotary':
    case 'exit roundabout':
    case 'exit rotary':
      text = M.roundabout(step.exit ?? 1);
      break;
    case 'merge':
      text = mod?.includes('left') ? M.mergeLeft : M.mergeRight;
      break;
    case 'on ramp':
    case 'off ramp':
      text = mod?.includes('left') ? M.rampLeft : M.rampRight;
      break;
    case 'fork':
      text = mod?.includes('left') ? M.keepLeft : M.keepRight;
      break;
    default:
      text = M[mod] ?? M.straight;
  }
  return step.name ? `${text} ${M.onto} ${step.name}` : text;
}
