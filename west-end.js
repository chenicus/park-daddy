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
  if (section.category === 'permit') {
    return { free: false, rate: null, group: 'restrictions', cls: 'p-permit', color: '#7c3aed', label: 'Permit only', status: 'Permit required at all times' };
  }
  const s = section.schedule;
  const active = s.days?.includes(dow) && mins >= s.start && mins < s.end;
  const hours = section.limitMinutes / 60;
  return active
    ? { free: true, rate: 0, group: 'free', cls: 'p-free', color: '#2563eb', label: `Free · ${hours}h`, status: `${hours}h public parking during listed hours; check signs` }
    : { free: false, rate: null, group: 'restrictions', cls: 'p-unknown', color: '#a16207', label: `${hours}h · Verify`, status: s.days == null ? 'Days not specified — check signs' : 'Outside listed hours — restrictions unknown' };
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
  if (section.category === 'permit') return [{ from: 0, to: 1440, label: 'Every day · All hours', status: 'Permit required', rate: null }];
  const s = section.schedule;
  const applies = s.days?.includes(dow) === true;
  const days = s.days == null ? 'Days unknown' : 'Mon–Sat';
  return [
    { from: s.start, to: s.end, days, limit: section.limitMinutes,
      rate: s.days == null ? null : 0, status: s.days == null ? 'Check signs' : 'Free', applies },
    { from: 0, to: 1440, label: 'Other times', status: 'Check signs', rate: null,
      activeOutside: applies ? [s.start, s.end] : [] },
  ];
}
