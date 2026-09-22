// Schematic curb records have their own access state. Never send them through
// rateNow(null, null), which would turn a permit or unknown schedule into Free.
export function buildWestEndBlocks(data) {
  return data.sections.map((section) => {
    const coords = section.geometry.coordinates;
    return {
      id: section.id, curb: section,
      lat: (coords[0][1] + coords.at(-1)[1]) / 2,
      lon: (coords[0][0] + coords.at(-1)[0]) / 2,
      line: coords.map(([lon, lat]) => [lat, lon]),
      hblock: `${section.street} · ${section.side} side · ${section.between.join('–')}`,
      sources: section.sourceIds.map((id) => data.sources[id]),
      geometryNote: data.geometryNote, restrictionNote: data.restrictionNote,
      pts: [], rushes: [],
    };
  });
}

export function curbState(section, mins, dow) {
  if (section.category !== 'permit' && section.verification !== 'historical-sign-match') {
    return { free: false, rate: null, group: 'unverified', cls: 'p-unknown', color: '#a16207', label: 'Check signs', status: section.verification === 'historical-conflict' ? 'Street View conflicts with PDF' : 'Parking restrictions not confirmed' };
  }
  if (section.category === 'permit') {
    return { free: false, rate: null, group: 'restrictions', cls: 'p-permit', color: '#7c3aed', label: 'Permit only', status: 'Permit required at all times' };
  }
  const s = section.schedule;
  const active = s.days?.includes(dow) && mins >= s.start && mins < s.end;
  const hours = section.limitMinutes / 60;
  return active
    ? { free: true, rate: 0, group: 'free', cls: 'p-free', color: '#2563eb', label: `Free · ${hours}h`, status: `${hours}h public parking during listed hours; check signs` }
    : { free: false, rate: null, group: 'unverified', cls: 'p-unknown', color: '#a16207', label: `${hours}h · Verify`, status: s.days == null ? 'Days not specified — check signs' : 'Outside listed hours — restrictions unknown' };
}

export function curbVisible(section, mins, dow, filters) {
  return filters[curbState(section, mins, dow).group] !== false;
}

const clock = (m) => `${Math.floor(m / 60) % 12 || 12}${m % 60 ? ':' + String(m % 60).padStart(2, '0') : ''}${m < 720 ? 'am' : 'pm'}`;
export function curbSchedule(section) {
  if (section.category === 'permit') return 'Full-time permit parking · every day, all hours';
  const s = section.schedule;
  const days = s.days == null ? 'days unspecified in PDF' : s.days.join() === '1,2,3,4,5,6' ? 'Mon–Sat' : 'Every day';
  return `${section.limitMinutes / 60} hour${section.limitMinutes === 60 ? '' : 's'} · ${clock(s.start)}–${clock(s.end)} · ${days}`;
}

// Weekly rule rows reuse the same schedule table as meters. A missing day or an
// unlisted period must never become an unrestricted/free row.
export function curbTableSegments(section, dow) {
  const check = section.spotChecks?.findLast(c => c.url && c.imageryDate);
  const evidence = check ? [{ label: 'Street View imagery', status: check.imageryDate, url: check.url, rate: null, applies: false }] : [];
  if (section.category !== 'permit' && section.verification !== 'historical-sign-match') return [{ from: 0, to: 1440, label: section.verification === 'historical-conflict' ? 'Conflicting sign evidence' : 'Restrictions unconfirmed', status: 'Check signs', rate: null }, ...evidence];
  if (section.category === 'permit') return [{ from: 0, to: 1440, label: 'Every day · All hours', status: 'Permit required', rate: null }];
  const s = section.schedule;
  const applies = s.days?.includes(dow) === true;
  const days = s.days == null ? 'Days unknown' : 'Mon–Sat';
  return [
    { from: s.start, to: s.end, days, limit: section.limitMinutes,
      rate: s.days == null ? null : 0, status: s.days == null ? 'Check signs' : 'Free', applies },
    { from: 0, to: 1440, label: 'Other times', status: 'Check signs', rate: null,
      activeOutside: applies ? [s.start, s.end] : [] },
    ...evidence,
  ];
}

// More specific curb guides supersede broad inferred free-parking estimates.
export function filterInferredFree(records, feeds) {
  const excluded = new Set(feeds.flatMap(feed => feed?.excludeInferredBlocks || [])
    .map(name => name.trim().toLowerCase()));
  return records.filter(record => !excluded.has(record.h.trim().toLowerCase()));
}


// Enforcement counts locate a candidate block; they do not prove public parking.
export function buildInferredBlocks(arr) {
  return arr.map((f, i) => ({
    id: 1e6 + i, lat: f.lat, lon: f.lon, unverified: true, hblock: f.h, tickets: f.n,
    rate1: null, rate2: null, flat: null,
    limits: { day: null, eve: null, wkndDay: null, wkndEve: null },
    rushes: [], pts: [], count: 0, spaces: 0, card: false,
  }));
}
