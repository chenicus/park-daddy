import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildWestEndBlocks, buildInferredBlocks, curbState, curbVisible, curbSchedule, curbTableSegments, filterMetersCoveredByCurbs } from '../west-end.js';
import { createLabelLayer, buildSeattleFreeBlocks } from '../labels.js';
import { rptKey } from '../reports.js';

const data = JSON.parse(fs.readFileSync(new URL('../data/west-end-plateau.json', import.meta.url)));
const audit = JSON.parse(fs.readFileSync(new URL('../data/sources/pdf-street-view-audit.json', import.meta.url)));
const blocks = buildWestEndBlocks(data);
const permit = blocks.find(b => b.curb.category === 'permit');
const barclay = blocks.find(b => b.curb.street === 'Barclay' && b.curb.limitMinutes === 60);
const haro = blocks.find(b => b.curb.street === 'Haro' && b.curb.limitMinutes === 60);
const bidwell = blocks.find(b => b.curb.id === 'wep-0b108f9e2b1a');
const kitsNorth = JSON.parse(fs.readFileSync(new URL('../data/kitsilano-north.json', import.meta.url)));
const kitsSouth = JSON.parse(fs.readFileSync(new URL('../data/kitsilano-south.json', import.meta.url)));
const kitsPoint = JSON.parse(fs.readFileSync(new URL('../data/kitsilano-point.json', import.meta.url)));
const reportReviews = JSON.parse(fs.readFileSync(new URL('../data/sources/downtown-report-reviews.json', import.meta.url)));
const mountPleasant = JSON.parse(fs.readFileSync(new URL('../data/mount-pleasant.json', import.meta.url)));
const beachPacific = JSON.parse(fs.readFileSync(new URL('../data/beach-pacific-street-view.json', import.meta.url)));

test('Beach and Pacific public signs show user-assumed free time outside the limit', () => {
  assert.equal(beachPacific.sections.length, 3);
  assert.deepEqual(new Set(beachPacific.sections.map(s => s.side)), new Set(['north', 'south']));
  const beach583 = beachPacific.sections.find(s => s.id === 'beach-crescent-583-north-2h');
  assert.deepEqual(beach583.schedule.days, [1, 2, 3, 4, 5]);
  assert.equal(curbState(beach583, 600, 1).group, 'free');
  assert.equal(curbState(beach583, 600, 6).label, 'Free');
  assert.match(curbSchedule(beach583), /Mon–Fri/);
  for (const section of beachPacific.sections) {
    if (section !== beach583) assert.equal(section.schedule.days, null);
    assert.equal(curbState(section, 600, 1).group, 'free');
    assert.equal(curbState(section, 600, 1).label, 'Free · 2h');
    assert.ok(curbTableSegments(section, 1).some(row => row.status === 'Free'));
    assert.equal(curbState(section, 1200, 1).label, 'Free');
    assert.ok(curbTableSegments(section, 1).some(row => row.label === 'Other times' && row.status === 'Free'));
    assert.ok(!curbTableSegments(section, 1).some(row => row.label === 'Curb limits'));
    assert.ok(curbTableSegments(section, 1).some(row => row.url === section.spotChecks[0].url));
  }
});

test('West 11th sign separates permit and public portions without asserting unreadable days', () => {
  const [publicPart, permitPart] = mountPleasant.sections;
  assert.equal(publicPart.side, 'south');
  assert.equal(permitPart.side, 'south');
  assert.equal(publicPart.schedule.days, null);
  assert.equal(curbState(publicPart, 600, 1).free, false);
  assert.equal(curbState(publicPart, 600, 1).group, 'unverified');
  assert.equal(curbState(permitPart, 600, 1).label, 'Permit only');
  assert.ok(curbTableSegments(permitPart, 1).some(row => row.url === permitPart.spotChecks[0].url));
  assert.ok(mountPleasant.excludeInferredBlocks.includes('200 W 11Th Av'));
});

test('Kits North PDF curb bars use their printed schedules and street sides', () => {
  const sections = kitsNorth.sections;
  assert.ok(sections.length >= 60);
  assert.equal(new Set(sections.map(section => section.id)).size, sections.length);
  assert.ok(sections.every(section => section.geometry.type === 'LineString' && section.geometryStatus === 'approximate-schematic'));
  assert.ok(sections.every(section => section.sourceIds.includes('city-kits-north-pdf')));
  const mondayFriday = sections.find(section => section.pdfBar.rule === '2mf');
  const mondaySaturday = sections.find(section => section.pdfBar.rule === '2ms');
  const permitOnly = sections.find(section => section.pdfBar.rule === 'p');
  assert.ok(mondayFriday && mondaySaturday && permitOnly);
  assert.ok(sections.filter(section => section.category === 'time-limited').every(section =>
    section.streetViewUrl?.startsWith('https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=')));
  assert.ok(curbTableSegments(mondayFriday, 1).some(segment => segment.url === mondayFriday.streetViewUrl &&
    segment.label.includes('sign not verified')));
  assert.equal(curbState(mondayFriday, 600, 1).label, 'Free · 2h');
  assert.equal(curbState(mondayFriday, 600, 6).label, 'Free');
  assert.equal(curbState(mondaySaturday, 600, 6).label, 'Free · 2h');
  assert.equal(curbState(mondaySaturday, 1080, 6).label, 'Free');
  assert.equal(curbState(permitOnly, 600, 1).label, 'Permit only');
  assert.equal(curbState(permitOnly, 600, 0).free, false);
  assert.match(curbSchedule(mondayFriday), /Mon–Fri/);
  assert.ok(!JSON.stringify(kitsNorth).includes('Polygon'));
});

test('South and Point guide curbs retain timed permits and unknown paid rates', () => {
  assert.equal(kitsSouth.sections.length, 95);
  assert.equal(kitsPoint.sections.length, 26);
  assert.deepEqual(kitsSouth.excludeInferredBlocks, ['2100 W 5Th Av', '2000 W 6Th Av', '2000 W 7Th Av', '1800 W 7Th Av']);
  for (const guide of [kitsSouth, kitsPoint]) {
    assert.ok(guide.sections.every(s => s.geometry.type === 'LineString' && s.geometryStatus === 'approximate-schematic'));
    assert.ok(!JSON.stringify(guide).includes('Polygon'));
  }
  const resident = kitsSouth.sections.find(s => s.pdfBar.rule === 'rmf');
  assert.equal(curbState(resident, 600, 1).label, 'Permit only');
  assert.equal(curbState(resident, 1200, 1).free, false);
  const publicTwoHour = kitsSouth.sections.find(s => s.pdfBar.rule === '2m8');
  assert.equal(curbState(publicTwoHour, 1140, 6).label, 'Free · 2h');
  assert.ok(curbTableSegments(publicTwoHour, 6).some(s => s.url === publicTwoHour.streetViewUrl));
  const fifthSign = kitsSouth.sections.find(s => s.id === 'kits-south-4aec57e73048');
  assert.equal(fifthSign.spotChecks[0].status, 'historical-partial-match');
  assert.match(fifthSign.spotChecks[0].finding, /Days and arrow extents/);
  for (const paid of kitsPoint.sections.filter(s => s.category === 'paid')) {
    assert.equal(curbState(paid, 600, 1).free, false);
    assert.equal(curbState(paid, 600, 1).rate, null);
    if (['historical-conflict','user-reported-conflict'].includes(paid.verification)) {
      assert.equal(curbState(paid, 600, 1).group, 'unverified');
      assert.match(curbState(paid, 600, 1).label, /near sign/);
      assert.ok(paid.bestJudgment?.summary);
      assert.ok(curbTableSegments(paid, 1).some(s => s.url === paid.streetViewUrl));
    } else {
      assert.match(curbState(paid, 600, 1).label, /Paid/);
      assert.ok(paid.streetViewUrl?.startsWith('https://www.google.com/maps/@?api=1&map_action=pano&viewpoint='));
      assert.ok(curbTableSegments(paid, 1).some(s => s.url === paid.streetViewUrl && s.label.includes('sign not verified')));
    }
  }
  assert.ok(kitsPoint.sections.filter(s => s.verification === 'historical-conflict').length >= 3);
  const ogden = kitsPoint.sections.find(s => s.street === 'Ogden' && s.side === 'south' && s.verification === 'historical-conflict');
  assert.equal(curbState(ogden, 600, 1).label, 'Permit near sign');
  assert.equal(curbState(ogden, 600, 1).free, false);
  assert.match(ogden.spotChecks[0].summary, /west arrow/);
  const split = kitsPoint.sections.find(s => s.pdfBar.rule === 'pay-split');
  assert.equal(curbState(split, 1200, 1).label, 'Permit only');
});

test('individual lines retain evidence and never acquire residential-free defaults', () => {
  assert.equal(blocks.length, 174);
  assert.equal(new Set(blocks.map(b => b.id)).size, blocks.length);
  assert.equal(new Set(blocks.map(rptKey)).size, blocks.length);
  for (const b of blocks) {
    assert.equal(b.curb.geometry.type, 'LineString');
    assert.ok(['approximate-schematic','approximate-sign-split','approximate-sign-slice'].includes(b.curb.geometryStatus));
    assert.equal(b.isFree, undefined);
    assert.equal(b.sources.length, 2);
    for (const [lon, lat] of b.curb.geometry.coordinates) {
      assert.ok(lon > -123.145 && lon < -123.12 && lat > 49.275 && lat < 49.295);
    }
  }
});

test('Bute west shows only the Haro-facing two-hour portion, not the Mobi docks', () => {
  const curb = blocks.find(b => b.id === 'wep-b7bd3d236123')?.curb;
  assert.ok(curb);
  assert.equal(curb.verification, 'historical-sign-match');
  assert.equal(curb.geometryStatus, 'approximate-sign-split');
  assert.deepEqual(curb.geometry.coordinates, [[-123.128696,49.284946],[-123.128873,49.284829]]);
  assert.equal(curbState(curb, 600, 1).label, 'Free · 2h');
    assert.equal(curbState(curb, 1260, 1).label, 'Free');
  assert.match(curb.splitBoundaryNote, /Mobi bike-share curb.*omitted/);
  assert.ok(!blocks.some(b => b.id === 'wep-b7bd3d236123-mobi'));
});

test('Bute east shows only the Pendrell-facing two-hour portion, not the Modo curb', () => {
  const curb = blocks.find(b => b.id === 'wep-c104b0d51182')?.curb;
  assert.ok(curb);
  assert.equal(curb.verification, 'historical-sign-match');
  assert.equal(curb.geometryStatus, 'approximate-sign-split');
  assert.deepEqual(curb.geometry.coordinates, [[-123.131456,49.282966],[-123.131636,49.282847]]);
  assert.equal(curbState(curb, 600, 1).label, 'Free · 2h');
  assert.equal(curbState(curb, 1260, 1).label, 'Free');
  assert.match(curb.splitBoundaryNote, /Modo-only no-stopping curb.*omitted/);
});

test('full-time permits are never public/free on any day or hour', () => {
  for (let day = 0; day < 7; day++) for (const mins of [0,539,540,1079,1080,1200,1439]) {
    const s = curbState(permit.curb, mins, day);
    assert.equal(s.free, false);
    assert.equal(s.rate, null);
    assert.equal(s.label, 'Permit only');
    assert.equal(curbVisible(permit.curb, mins, day, { free:true, paid:false, restrictions:false,unverified:false }), false);
  }
});

test('Barclay correction is scoped, historical and retains PDF omission', () => {
  assert.equal(barclay.curb.pdfSchedule.days, null);
  assert.deepEqual(barclay.curb.schedule.days, [1,2,3,4,5,6]);
  assert.equal(barclay.curb.spotChecks[0].imageryDate, '2024-08');
  assert.equal(barclay.curb.spotChecks[0].url, null);
  assert.match(curbSchedule(barclay.curb), /Mon–Sat/);
  assert.equal(haro.curb.pdfSchedule.days, null);
  assert.deepEqual(haro.curb.schedule.days, [0,1,2,3,4,5,6]);
  for (let day=0; day<7; day++) assert.equal(curbState(haro.curb,600,day).free,true);
  assert.equal(curbState(barclay.curb,539,1).label,'Free');
  assert.equal(curbState(barclay.curb,540,6).free,true);
  assert.equal(curbState(barclay.curb,1079,6).free,true);
  assert.equal(curbState(barclay.curb,1080,6).label,'Free');
  assert.equal(curbState(barclay.curb,600,0).label,'Free');
});

test('Bidwell historical check keeps the posted limit and free other times', () => {
  assert.equal(bidwell.curb.limitMinutes,120);
  assert.equal(bidwell.curb.spotChecks[0].status,'historical-sign-match');
  assert.equal(curbState(bidwell.curb,540,1).free,true);
  assert.equal(curbState(bidwell.curb,1199,6).free,true);
  assert.equal(curbState(bidwell.curb,1200,6).label,'Free');
  assert.equal(curbState(bidwell.curb,600,0).label,'Free');
  assert.equal(bidwell.curb.outsideSchedule,'unknown');
  assert.equal(curbVisible(bidwell.curb,600,1,{free:false,paid:true,restrictions:true,unverified:true}),false);
});

test('map rendering, filter, low-zoom and style recreation keep restricted curbs separate', () => {
  const sources = new Map(['meter-dots','blockface-lines','west-end-curbs'].map(k=>[k,{setData(d){this.data=d;}}]));
  let zoom=16, day=1;
  const handlers={};
  const map={getSource:k=>sources.get(k), getZoom:()=>zoom,
    getBounds:()=>({getSouth:()=>49.27,getNorth:()=>49.30,getWest:()=>-123.15,getEast:()=>-123.11}),
    getCenter:()=>({lat:49.285,lng:-123.13}), project:([lng,lat])=>({x:lng*1e6,y:lat*1e6}),
    on:(event,fn)=>handlers[event]=fn,off:()=>{}};
  globalThis.matchMedia=()=>({matches:true});
  globalThis.document={createElement:()=>({firstElementChild:{classList:{add(){},remove(){}},style:{},addEventListener(){}},style:{},addEventListener(){}})};
  globalThis.maplibregl={Marker:class {constructor({element}){this.el=element;}setLngLat(){return this;}addTo(){return this;}remove(){}getElement(){return this.el;}}};
  const legacy=buildSeattleFreeBlocks([{mid:[-123.13,49.285],line:[[-123.131,49.285],[-123.13,49.285]],cat:'tl',limit:180}]);
  const inferred=buildInferredBlocks([{lat:49.28,lon:-123.14,h:'Unverified candidate',n:1}]);
  const layer=createLabelLayer(map,[permit,barclay,haro,bidwell,...legacy,...inferred],{nowMins:()=>600,isWeekend:()=>false,dow:()=>day,onTap(){}});
  try {
    layer.refresh();
    assert.equal(sources.get('west-end-curbs').data.features.length,4);
    assert.equal(sources.get('blockface-lines').data.features.length,1);
    assert.equal(sources.get('meter-dots').data.features.length,1);
    assert.equal(sources.get('meter-dots').data.features[0].properties.color,'#a16207');
    layer.setFilter({free:true,paid:false,restrictions:false,unverified:false});
    assert.equal(sources.get('west-end-curbs').data.features.length,3);
    assert.equal(sources.get('meter-dots').data.features.length,0);
    day=0; layer.refresh();
    assert.equal(sources.get('west-end-curbs').data.features.length,3);
    layer.setFilter({free:false,paid:false,restrictions:true,unverified:true});
    assert.equal(sources.get('west-end-curbs').data.features.length,1);
    assert.equal(sources.get('blockface-lines').data.features.length,0);
    assert.equal(sources.get('meter-dots').data.features.length,1);
    sources.set('west-end-curbs',{setData(d){this.data=d;}}); layer.refresh();
    assert.equal(sources.get('west-end-curbs').data.features.length,1);
    zoom=14; layer.refresh();
    assert.equal(sources.get('west-end-curbs').data.features.length,0);
  } finally {layer.destroy();}
});


test('shared table preserves weekly limits and unknown periods', () => {
  const monday = curbTableSegments(bidwell.curb, 1);
  assert.equal(monday[0].days, 'Mon–Sat');
  assert.equal(monday[0].limit, 120);
  assert.equal(monday[0].rate, 0);
  assert.equal(monday[0].applies, true);
  assert.equal(monday[1].rate, 0);
  assert.deepEqual(monday[1].activeOutside, [540, 1200]);
  const sunday = curbTableSegments(bidwell.curb, 0);
  assert.equal(sunday[0].applies, false);
  assert.deepEqual(sunday[1].activeOutside, []);
  assert.equal(curbTableSegments(haro.curb, 1)[0].rate, 0);
  assert.equal(curbTableSegments(haro.curb, 0)[0].days, 'Every day');
  const permitRows = curbTableSegments(permit.curb, 1);
  assert.equal(permitRows.length, 1);
  assert.equal(permitRows[0].status, 'Permit required');
  assert.equal(permitRows[0].rate, null);
});

const additions = ['davie-beach', 'denman-west', 'robson-north'].map(name =>
  JSON.parse(fs.readFileSync(new URL(`../data/${name}.json`, import.meta.url))));

test('additional guides retain evidence, unique curb identities and unresolved omissions', () => {
  const added = additions.flatMap(buildWestEndBlocks);
  assert.equal(added.length, 194);
  assert.equal(new Set([...blocks, ...added].map(b => b.id)).size, 368);
  for (const b of added) {
    assert.equal(b.curb.geometry.type, 'LineString');
    if (b.curb.category === 'permit') {
      assert.equal(b.curb.verification, 'pdf-only');
      assert.deepEqual(b.curb.spotChecks, []);
    } else assert.ok(b.curb.spotChecks.length > 0);
    assert.ok(['approximate-schematic','approximate-sign-split','approximate-sign-slice'].includes(b.curb.geometryStatus));
    assert.ok(b.sources.every(s => s.url.startsWith('https://')));
    for (const [lon, lat] of b.curb.geometry.coordinates)
      assert.ok(lon > -123.151 && lon < -123.11 && lat > 49.269 && lat < 49.303);
    if (b.curb.category === 'permit') for (let day=0; day<7; day++)
      assert.equal(curbState(b.curb,600,day).free, false);
  }
  const unresolved = additions.flatMap(d => d.unmappedSections);
  assert.equal(unresolved.length,14);
  for (const s of unresolved) {
    assert.equal(s.geometry,null);
    assert.ok(s.unresolvedReason);
    assert.ok(s.schematicTrace);
  }
});

test('1835 Comox permit sign is limited to the Gilford-facing curb portion', () => {
  const sections = additions[1].sections;
  const permitSide = sections.find(s => s.id === 'denman-west-b672f507d5a2');
  const denmanSide = sections.find(s => s.id === 'denman-west-b672f507d5a2-denman-review');
  assert.ok(permitSide && denmanSide);
  assert.deepEqual(permitSide.geometry.coordinates.at(-1), denmanSide.geometry.coordinates[0]);
  assert.equal(curbState(permitSide, 600, 1).label, 'Permit only');
  assert.equal(curbState(permitSide, 600, 0).free, false);
  assert.equal(curbState(denmanSide, 600, 1).group, 'unverified');
  assert.equal(curbVisible(permitSide, 600, 1, {free:true,restrictions:false,unverified:false}), false);
});

test('1260 Bidwell shows only a short two-hour pocket between reserved uses', () => {
  const curb = additions[0].sections.find(s => s.id === 'davie-beach-99cd6fc2597d');
  assert.equal(curb.geometryStatus, 'approximate-sign-slice');
  assert.equal(curbState(curb, 600, 1).label, 'Free · 2h');
  assert.equal(curbState(curb, 1200, 1).label, 'Free');
  assert.ok(curb.geometry.coordinates.length >= 2);
  assert.match(curb.splitBoundaryNote, /Accessible-only curb.*bike docks/);
  assert.equal(curbTableSegments(curb, 1)[0].days, 'Mon–Sat');
});

test('1755 Haro sign shows one-hour parking daily and free other times', () => {
  assert.equal(haro.curb.id, 'wep-17d8d42a59a6');
  assert.equal(haro.curb.pdfSchedule.days, null);
  assert.equal(haro.curb.verification, 'historical-sign-match');
  assert.equal(curbState(haro.curb, 540, 0).label, 'Free · 1h');
  assert.equal(curbState(haro.curb, 1079, 6).free, true);
  assert.equal(curbState(haro.curb, 1080, 1).label, 'Free');
  assert.equal(curbTableSegments(haro.curb, 0)[0].days, 'Every day');
});

test('Pacific two-hour schedule keeps its separate no-stopping period', () => {
  const early = additions[0].sections.find(s => s.schedule.end === 900);
  assert.ok(early);
  assert.equal(curbState(early,539,1).label,'Free');
  assert.equal(curbState(early,540,1).free,true);
  assert.equal(curbState(early,899,6).free,true);
  assert.equal(curbState(early,900,6).label,'Free');
  assert.equal(curbState(early,900,1).label,'No stopping');
  assert.equal(curbVisible(early,900,1,{free:true,prohibited:true}),false);
  assert.equal(curbState(early,1080,1).label,'Free');
  assert.equal(curbState(early,600,0).label,'Free');
  assert.equal(early.pdfSchedule.end,900);
  assert.ok(curbTableSegments(early,1).some(row => row.rate === 0 && row.to === 900));
  assert.ok(early.spotChecks.at(-1).restrictions.some(r => r.kind === 'no-stopping' && r.start === 900 && r.end === 1080));
  assert.equal(early.spotChecks[0].status,'unresolved');
  assert.equal(early.spotChecks.at(-1).status,'historical-sign-match');
});

test('loaded curb guides supersede only named inferred free blocks', async () => {
  const { filterInferredFree } = await import('../west-end.js');
  const records = [{h:'1100 Burnaby St'},{h:'1300 Broughton St'},{h:'4300 Hudson St'}];
  assert.deepEqual(filterInferredFree(records, additions),[records[2]]);
  assert.deepEqual(filterInferredFree(records, [[],data]),records);
});


test('all timed curbs retain historical evidence and conflicting sections never advertise free', () => {
  const timed = [data, ...additions].flatMap(d => d.sections).filter(s => s.category === 'time-limited');
  assert.equal(timed.length, 43);
  assert.ok(timed.every(s => s.spotChecks.some(c => c.url?.startsWith('https://www.google.com/maps/'))));
  for (const section of timed) {
    const source = audit.find(row => row.id === (section.splitSourceId || section.id));
    const splitPart = source.mapSplit?.parts.find(part => part.id === section.id);
    assert.equal(section.verification, splitPart?.verification || source.mapSlice?.verification || source.mapVerification || reportReviews[section.id]?.verification || source.status);
    const latest = source.observations.at(-1);
    assert.ok(section.spotChecks.some(check => check.url === latest.url && check.finding === latest.text && check.status === latest.status));
    const evidence = curbTableSegments(section,1).find(row => row.url);
    assert.ok(evidence);
    assert.equal(evidence.applies,false);
    assert.equal(evidence.rate,null);
    assert.ok(section.spotChecks.some(check => check.url === evidence.url && check.imageryDate === evidence.status));
  }
  const conflicts = timed.filter(s => s.verification === 'historical-conflict');
  assert.equal(conflicts.length, audit.filter(r => r.status === 'historical-conflict').length);
  for (const section of conflicts) {
    assert.ok(section.pdfSchedule);
    assert.equal(section.geometryStatus, 'approximate-schematic');
    for (let day = 0; day < 7; day++) for (const mins of [0,540,600,900,1199,1439]) {
      assert.equal(curbState(section, mins, day).free, false);
      assert.equal(curbVisible(section, mins, day, {free:true, restrictions:false,unverified:false}), false);
      assert.ok(curbTableSegments(section, day).every(row => row.rate === null));
    }
  }
});


test('unconfirmed timed curbs are marked and filter independently of permits', () => {
  const timed = [data, ...additions].flatMap(d => d.sections).filter(s => s.category === 'time-limited');
  const unconfirmed = timed.filter(s => s.verification !== 'historical-sign-match' && !s.accessOverride);
  assert.ok(unconfirmed.length >= 1);
  for (const section of unconfirmed) {
    assert.equal(curbState(section,600,1).free,false);
    assert.equal(curbState(section,600,1).label,section.bestJudgment?.label || 'Check signs');
    assert.equal(curbVisible(section,600,1,{restrictions:false,unverified:true}),true);
    assert.equal(curbVisible(section,600,1,{restrictions:true,unverified:false}),false);
    assert.ok(curbTableSegments(section,1).every(s => s.rate === null));
  }
  const pend = timed.find(s => s.id === 'denman-west-8a345fd5d337');
  assert.match(pend.bestJudgment.summary,/Mon–Sat/);
  assert.deepEqual(pend.pdfSchedule.days,[1,2,3,4,5,6]);
  assert.equal(curbState(pend,600,1).label,'Free · 2h');
  assert.equal(curbState(pend,600,0).label,'Free');
  assert.ok(curbTableSegments(pend,1).some(row => row.status?.includes('Mon–Sat')));
  assert.equal(curbVisible(permit.curb,600,1,{restrictions:false,unverified:true}),false);
});


test('enforcement-derived Vancouver records are not classified as free', () => {
  const source = JSON.parse(fs.readFileSync(new URL('../data/free.json', import.meta.url)));
  const retired = JSON.parse(fs.readFileSync(new URL('../data/sources/kitsilano-retired-inferred.json', import.meta.url))).records;
  const candidates = buildInferredBlocks(source);
  assert.equal(candidates.length, source.length);
  assert.ok(candidates.length > 2000);
  assert.equal(retired.length, 259);
  assert.equal(source.length + retired.length, 2399);
  assert.equal(retired.filter(r => source.some(active => active.h === r.h)).length, 0);
  for (const block of candidates) {
    assert.equal(block.unverified,true);
    assert.equal(block.isFree,undefined);
  }
});

 test('user checked permit spot stays nonpublic without inventing its hours', () => {
 const s=data.sections.find(s=>s.id==='wep-e9554463e621');
 assert.equal(curbState(s,600,1).label,'Permit only');
 assert.equal(curbState(s,600,1).free,false);
 assert.equal(curbState(s,600,1).group,'restrictions');
 assert.ok(curbTableSegments(s,1).some(r=>r.label==='Hours not confirmed'));
 assert.equal(s.pdfSchedule.end,1200);
 });

test('user off-hours assumption stays explicit and does not invent Sunday daytime access', () => {
 const s=additions[0].sections.find(s=>s.id==='davie-beach-c2b83be3a9f7');
 assert.equal(curbState(s,539,1).label,'Free · assumed');
 assert.equal(curbState(s,540,1).label,'Free · 2h');
 assert.equal(curbState(s,1199,1).label,'Free · 2h');
 assert.equal(curbState(s,1200,1).label,'Free · assumed');
 assert.equal(curbState(s,600,0).free,false);
 assert.equal(s.accessOverride.daysConfirmed,false);
});

test('confirmed no-stopping record cannot appear in normal parking results', () => {
 const s=data.sections.find(s=>s.id==='wep-92bae635df9b');
 for(let day=0;day<7;day++) for(const mins of [0,600,1200,1439]) {
 assert.equal(curbState(s,mins,day).free,false);
 assert.equal(curbState(s,mins,day).label,'No parking');
 assert.equal(curbVisible(s,mins,day,{free:true,paid:true,restrictions:true,unverified:true}),false);
 }
 assert.ok(curbTableSegments(s,1).some(r=>r.status==='No parking'));
});

test('side-specific City meter data makes the Davie records paid', () => {
  const south = additions[0].sections.find(s => s.id === 'davie-beach-40086bd95ae3');
  const north = data.sections.find(s => s.id === 'wep-7767aa67d4a8');
  for (const section of [south, north]) {
    assert.equal(curbState(section, 600, 1).rate, 2);
    assert.equal(curbState(section, 600, 1).group, 'paid');
    assert.equal(curbState(section, 600, 1).cls, 'p1');
    assert.equal(curbState(section, 1140, 1).label, '$2 /hr · 4h');
    assert.equal(curbState(section, 480, 1).label, 'Free');
    assert.equal(curbState(section, 1380, 1).group, 'free');
    const rows = curbTableSegments(section, 1);
    assert.deepEqual(rows.slice(0, 3).map(row => row.status), ['Paid', 'Paid', 'Free']);
    assert.ok(rows.every(row => !/PayByPhone/.test(`${row.label || ''} ${row.status || ''}`)));
  }
  const meters = JSON.parse(fs.readFileSync(new URL('../data/meters.json', import.meta.url)));
  const remaining = filterMetersCoveredByCurbs(meters, [data, additions[0]]);
  assert.equal(remaining.length, meters.length - 2);
  assert.ok(!remaining.some(meter => ['161314', '161325'].includes(String(meter.meter_id))));
});
