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

// A side-specific paid curb already represents these exact City meter records.
// Keep the curb and its evidence; do not draw a third, overlapping meter marker.
export function filterMetersCoveredByCurbs(meters, feeds) {
  const ids = new Set(feeds.flatMap(feed => feed?.sections || [])
    .filter(section => section.accessOverride?.category === 'paid')
    .map(section => section.accessOverride.meterId).filter(Boolean).map(String));
  return meters.filter(meter => !ids.has(String(meter.meter_id)));
}

const paidStyle = rate => rate <= 2 ? ['p1', '#16a34a'] : rate <= 4 ? ['p2', '#d97706']
  : rate <= 6 ? ['p3', '#ea580c'] : ['p4', '#dc2626'];

export function curbState(section, mins, dow) {
  if (section.category === 'no-parking') return {free:false,rate:null,group:'prohibited',cls:'p-unknown',color:'#dc2626',label:'No parking',status:'PDF shows a no-parking restriction; check posted signs for its exact limits'};
  if (section.category === 'permit-window') {
    const s = section.schedule;
    return s.days?.includes(dow) && mins >= s.start && mins < s.end
      ? {free:false,rate:null,group:'restrictions',cls:'p-permit',color:'#7c3aed',label:'Permit only',status:'Resident permit required during listed hours'}
      : {free:false,rate:null,group:'unverified',cls:'p-unknown',color:'#a16207',label:'Check signs',status:'Outside listed permit hours — restrictions unknown'};
  }
  if (section.category === 'paid') {
    if (['historical-conflict','user-reported-conflict'].includes(section.verification)) return {free:false,rate:null,group:'unverified',cls:'p-unknown',color:'#a16207',label:section.bestJudgment?.label || section.spotChecks?.at(-1)?.mapLabel || 'Sign conflict · verify',status:section.bestJudgment ? `${section.bestJudgment.summary} near the photographed sign; extent and current rule unverified` : 'A local sign report conflicts with the PDF paid bar. Exact limits and current rule need checking'};
    const s = section.schedule;
    if (mins >= s.start && mins < s.end) return {free:false,rate:null,group:'paid',cls:'p2',color:'#d97706',label:'Paid · verify',status:'PDF shows pay parking; rate and days not specified'};
    return section.outsideSchedule === 'permit-only'
      ? {free:false,rate:null,group:'restrictions',cls:'p-permit',color:'#7c3aed',label:'Permit only',status:'PDF shows permit-only outside paid hours; days not specified'}
      : {free:false,rate:null,group:'unverified',cls:'p-unknown',color:'#a16207',label:'Check signs',status:'Outside listed paid hours — restrictions unknown'};
  }
  if (section.accessOverride?.category === 'reserved') return {free:false,rate:null,group:'restrictions',cls:'p-permit',color:'#7c3aed',label:'Reserved parking',status:section.accessOverride.summary};
  if (section.accessOverride?.category === 'paid') {
    const a = section.accessOverride;
    if (mins >= a.start && mins < a.end) {
      const evening = mins >= 1080;
      const limit = evening ? a.eveningLimitMinutes : a.dayLimitMinutes;
      const [cls, color] = paidStyle(a.rate);
      return {free:false,rate:a.rate,group:'paid',cls,color,label:`$${a.rate} /hr · ${limit / 60}h`,status:'Paid parking'};
    }
    return {free:true,rate:0,group:'free',cls:'p-free',color:'#2563eb',label:'Free',status:'Free outside paid hours, per user instruction; check posted signs'};
  }
  if (section.accessOverride?.category === 'prohibited') return {free:false,rate:null,group:'prohibited',cls:'p-unknown',color:'#dc2626',label:'No parking',status:`${section.accessOverride.restriction} · ${section.accessOverride.arrows}`};
  if (section.accessOverride?.category === 'public') {
    const a = section.accessOverride;
    if (mins < a.start || mins >= a.end) return {free:true,rate:0,group:'free',cls:'p-free',color:'#2563eb',label:'Free · assumed',status:'Free outside 9am–8pm assumed by user; check signs'};
    if (section.schedule.days?.includes(dow)) return {free:true,rate:0,group:'free',cls:'p-free',color:'#2563eb',label:'Free · 2h',status:'User confirmed hours; days from PDF'};
    return {free:false,rate:null,group:'unverified',cls:'p-unknown',color:'#a16207',label:'Check signs',status:'Daytime rules for this day not confirmed'};
  }
  if (section.accessOverride?.category === 'permit') return { free:false, rate:null, group:'restrictions', cls:'p-permit', color:'#7c3aed', label:'Permit only', status:'Permit required; hours not confirmed' };
  if (section.bestJudgment && section.verification !== 'historical-sign-match') return {free:false,rate:null,group:'unverified',cls:'p-unknown',color:'#a16207',label:section.bestJudgment.label,status:`${section.bestJudgment.summary} Exact curb extent and current rule remain unverified`};
  if (section.category !== 'permit' && !['historical-sign-match', 'pdf-guide'].includes(section.verification)) {
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
  if (section.accessOverride?.category === 'prohibited' || section.category === 'no-parking') return false;
  return filters[curbState(section, mins, dow).group] !== false;
}

const clock = (m) => `${Math.floor(m / 60) % 12 || 12}${m % 60 ? ':' + String(m % 60).padStart(2, '0') : ''}${m < 720 ? 'am' : 'pm'}`;
export function curbSchedule(section) {
  if (section.accessOverride?.category === 'permit') return 'Permit required · hours not confirmed';
  if (section.category === 'permit') return 'Full-time permit parking · every day, all hours';
  const s = section.schedule;
  const days = s.label || (s.days == null ? 'days unspecified in PDF' : s.days.join() === '1,2,3,4,5,6' ? 'Mon–Sat' : s.days.join() === '1,2,3,4,5' ? 'Mon–Fri' : 'Every day');
  if (section.category === 'permit-window') return `Permit required · ${clock(s.start)}–${clock(s.end)} · ${days}`;
  if (section.category === 'paid') return `Paid parking · ${clock(s.start)}–${clock(s.end)} · ${days} · rate unknown`;
  return `${section.limitMinutes / 60} hour${section.limitMinutes === 60 ? '' : 's'} · ${clock(s.start)}–${clock(s.end)} · ${days}`;
}

// Weekly rule rows reuse the same schedule table as meters. A missing day or an
// unlisted period must never become an unrestricted/free row.
export function curbTableSegments(section, dow) {
  const check = section.spotChecks?.findLast(c => c.url && c.imageryDate);
  const sourceEvidence = check ? [{ label: 'Street View imagery', status: check.imageryDate, url: check.url, rate: null, applies: false }]
    : section.streetViewUrl ? [{ label: 'Street View · sign not verified', status: 'Open', url: section.streetViewUrl,
      linkLabel: 'Open Street View near this curb; sign not verified', rate: null, applies: false }] : [];
  const evidence = section.splitBoundaryNote
    ? [{ label: 'Curb limits', status: 'Approximate · check signs', rate: null, applies: false }, ...sourceEvidence]
    : sourceEvidence;
  if (section.category === 'permit-window') return [
    {from:section.schedule.start,to:section.schedule.end,days:section.schedule.label,status:'Permit required',rate:null,applies:section.schedule.days?.includes(dow)},
    {label:'Other times',status:'Check signs',rate:null,applies:false},
    ...evidence,
  ];
  if (section.category === 'paid' && ['historical-conflict','user-reported-conflict'].includes(section.verification)) return [
    {label:'Best local reading',status:section.bestJudgment?.summary || section.spotChecks?.at(-1)?.summary || 'Sign seen',rate:null,applies:false},
    {label:'PDF guide',status:'Paid shown · conflicts',rate:null,applies:false},
    {label:'Extent / current rule',status:'Check signs',rate:null,applies:false},
    ...evidence,
  ];
  if (section.category === 'paid') return [
    {from:section.schedule.start,to:section.schedule.end,days:section.schedule.label,status:'Paid · rate unknown',rate:null,applies:false},
    {label:'Other times',status:section.outsideSchedule === 'permit-only' ? 'Permit required' : 'Check signs',rate:null,applies:false},
    ...evidence,
  ];
  if (section.category === 'no-parking') return [
    {from:section.schedule.start,to:section.schedule.end,days:section.schedule.label,status:'No parking',rate:null,applies:section.schedule.days?.includes(dow)},
    {label:'Other times',status:'Check signs',rate:null,applies:false},
    ...evidence,
  ];
  if (section.accessOverride?.category === 'reserved') return [
    {from:0,to:1440,label:section.accessOverride.summary,status:'Reserved',rate:null},
    {label:'Verified sign directions',status:section.accessOverride.directions,rate:null,applies:false},
    ...evidence,
  ];
  if (section.accessOverride?.category === 'paid') {
    const a = section.accessOverride;
    return [
      {from:a.start,to:1080,limit:a.dayLimitMinutes,rate:a.rate,status:'Paid',applies:true},
      {from:1080,to:a.end,limit:a.eveningLimitMinutes,rate:a.rate,status:'Paid',applies:true},
      {label:`Before ${clock(a.start)} · after ${clock(a.end)}`,status:'Free',rate:0,activeOutside:[a.start,a.end]},
      ...evidence,
    ];
  }
  if (section.accessOverride?.category === 'prohibited') return [{from:0,to:1440,label:`${section.accessOverride.restriction} · ${section.accessOverride.arrows}`,status:'No parking',rate:null}, {label:'Verified sign',status:section.accessOverride.checkedOn,rate:null,applies:false}, ...evidence];
  if (section.accessOverride?.category === 'public') return [
    {from:540,to:1200,days:'Mon–Sat (PDF)',limit:120,rate:0,status:'Free',applies:section.schedule.days?.includes(dow)},
    {from:0,to:540,rate:0,status:'Free · assumed'},
    {from:1200,to:1440,rate:0,status:'Free · assumed'},
    {label:'Off-hours rule',status:'User assumption',rate:null,applies:false},
    ...evidence,
  ];
  if (section.accessOverride?.category === 'permit') return [{ label:'Hours not confirmed', status:'Permit required', rate:null, applies:false }, { label:'User sign check', status:section.accessOverride.checkedOn, rate:null, applies:false }, ...evidence];
  if (section.bestJudgment && section.verification !== 'historical-sign-match') return [
    {label:'Best local reading',status:section.bestJudgment.summary,rate:null,applies:false},
    {label:'Reported other times',status:section.bestJudgment.otherTimes || 'Not established',rate:null,applies:false},
    {label:'Extent / current rule',status:'Check signs',rate:null,applies:false},
    ...evidence,
  ];
  if (section.category !== 'permit' && !['historical-sign-match', 'pdf-guide'].includes(section.verification)) return [{ from: 0, to: 1440, label: section.verification === 'historical-conflict' ? 'Conflicting sign evidence' : 'Restrictions unconfirmed', status: 'Check signs', rate: null }, ...evidence];
  if (section.category === 'permit') return [{ from: 0, to: 1440, label: 'Every day · All hours', status: 'Permit required', rate: null }, ...evidence];
  const s = section.schedule;
  const applies = s.days?.includes(dow) === true;
  const days = s.label || (s.days == null ? 'Days unknown' : s.days.join() === '1,2,3,4,5' ? 'Mon–Fri' : s.days.join() === '0,1,2,3,4,5,6' ? 'Every day' : 'Mon–Sat');
  return [
    { from: s.start, to: s.end, days, limit: section.limitMinutes,
      rate: s.days == null ? null : 0, status: s.days == null ? 'Check signs' : 'Free', applies },
    { from: 0, to: 1440, label: 'Other times', status: 'Check signs', rate: null,
      activeOutside: applies ? [s.start, s.end] : [] },
    ...(section.bestJudgment ? [{label:'Adjacent sign',status:section.bestJudgment.summary,rate:null,applies:false}] : []),
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
    streetViewUrl: f.streetViewUrl || null,
    rate1: null, rate2: null, flat: null,
    limits: { day: null, eve: null, wkndDay: null, wkndEve: null },
    rushes: [], pts: [], count: 0, spaces: 0, card: false,
  }));
}
