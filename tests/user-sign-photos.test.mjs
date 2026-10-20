import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildWestEndBlocks, curbState, curbVisible, curbTableSegments, filterInferredFree } from '../west-end.js';

const feedPath = new URL('../data/october-17-user-sign-photos.json', import.meta.url);
const feed = JSON.parse(fs.readFileSync(feedPath));
const manifest = JSON.parse(fs.readFileSync(new URL('../data/registry.json', import.meta.url)));

test('new photo feed is reachable through the shared Vancouver registry', () => {
  const entry = manifest.cities.vancouver.data.find(d => d.url.startsWith('data/october-17-user-sign-photos.json'));
  assert.equal(entry?.kind, 'west-end');
  assert.equal(new Set(feed.sections.map(s => s.id)).size, 19);
  assert.equal(buildWestEndBlocks(feed).length, 19);
  for (const section of feed.sections) {
    assert.ok(section.sourceIds.every(id => feed.sources[id]), section.id);
    assert.equal(section.geometry.type, 'LineString');
    assert.ok(section.geometry.coordinates.length >= 2);
  }
});

test('photo-backed time-limited signs use their recorded limits during posted hours', () => {
  for (const section of feed.sections.filter(s => s.street === 'National Avenue' && s.category === 'time-limited')) {
    const state = curbState(section, 600, 1);
    assert.equal(state.group, 'free');
    assert.equal(state.free, true);
    assert.equal(state.label, `Free · ${section.limitMinutes / 60}h`);
    assert.equal(curbVisible(section, 600, 1, {free:true,paid:true,restrictions:false,unverified:false}), true);
    const outsideHours = curbState(section, 1200, 1);
    assert.equal(outsideHours.label, 'Free');
    assert.ok(curbTableSegments(section, 1).some(row => row.limit === section.limitMinutes && row.status === 'Free'));
    assert.ok(!curbTableSegments(section, 1).some(row => row.status === 'Check signs'));
  }
});

test('National Avenue bus and Modo exceptions remain no parking for general vehicles', () => {
  for (const id of ['national-north-bus-zone-no-parking', 'national-north-modo-zone-no-parking']) {
    const section = feed.sections.find(s => s.id === id);
    assert.ok(section);
    assert.equal(section.category, 'no-parking');
    assert.equal(curbState(section, 600, 1).group, 'prohibited');
    assert.equal(curbState(section, 600, 1).label, 'No parking');
    assert.equal(curbVisible(section, 600, 1, {free:true,paid:true,restrictions:false,unverified:false}), false);
    assert.equal(curbVisible(section, 600, 1, {free:true,paid:true,restrictions:true,unverified:false}), false);
    assert.ok(section.sourceIds.every(sourceId => feed.sources[sourceId]));
  }
});

test('opposing permit arrows map only the interval between signs', () => {
  const section = feed.sections.find(s => s.id === 'arbutus-east-user-photo-permit');
  assert.equal(curbState(section, 600, 1).group, 'restrictions');
  assert.equal(curbState(section, 120, 0).group, 'restrictions');
  assert.equal(curbVisible(section, 600, 1, {free:true,paid:true,restrictions:false,unverified:false}), false);
  assert.equal(section.geometry.coordinates.length, 2);
});

test('W 1st meter conflict remains an observation, not a free section', () => {
  const observation = feed.observationsNeedingReview.find(s => s.id === 'w-first-burrard-user-photo-meter-conflict');
  assert.match(observation?.finding, /B117SPB/);
  assert.ok(!feed.sections.some(s => s.street === 'W 1st Avenue'));
});

test('Station Street user-confirmed blockface is free 2h Mon–Sat during posted hours', () => {
  const section = feed.sections.find(s => s.id === 'station-east-user-confirmed-free-2h');
  assert.ok(section);
  assert.ok(section.sourceIds.every(id => feed.sources[id]));
  assert.equal(curbState(section, 600, 1).label, 'Free · 2h');
  assert.equal(curbState(section, 600, 6).label, 'Free · 2h');
  assert.equal(curbState(section, 600, 0).label, 'Free');
  assert.equal(section.schedule.label, 'Mon–Sat');
  assert.ok(curbTableSegments(section, 1).some(row => row.limit === section.limitMinutes && row.status === 'Free'));
  assert.equal(curbVisible(section, 600, 1, {free:true,paid:true,restrictions:false,unverified:false}), true);
  assert.equal(section.geometry.coordinates.length, 2);
  assert.ok(section.geometry.coordinates[1][1] - section.geometry.coordinates[0][1] > 0.001);
});

test('Southern–Industrial Station Street is a separate free block with no invented two-hour limit', () => {
  const section = feed.sections.find(s => s.id === 'station-east-southern-industrial-user-free');
  assert.ok(section);
  assert.deepEqual(section.between, ['Southern Street', 'Industrial Avenue']);
  assert.equal(section.side, 'east');
  assert.equal(section.limitMinutes, null);
  assert.equal(curbState(section, 600, 1).label, 'Free');
  assert.equal(curbState(section, 600, 0).label, 'Free');
  assert.equal(curbVisible(section, 600, 1, {free:true,paid:true,restrictions:false,unverified:false}), true);
  assert.ok(curbTableSegments(section, 1).some(row => row.status === 'Free'));
  assert.ok(!curbTableSegments(section, 1).some(row => row.limit === 120));
  assert.ok(section.sourceIds.every(id => feed.sources[id]));
  assert.deepEqual(filterInferredFree([{h:'1600 Station St'}, {h:'Elsewhere'}], [feed]).map(r => r.h), ['Elsewhere']);
});

test('Northern–Southern Station Street is free on each side of Central Street without covering the junction', () => {
  const northern = feed.sections.find(s => s.id === 'station-east-northern-central-user-free');
  const southern = feed.sections.find(s => s.id === 'station-east-central-southern-user-free');
  for (const section of [northern, southern]) {
    assert.ok(section);
    assert.equal(section.side, 'east');
    assert.equal(section.limitMinutes, null);
    assert.equal(curbState(section, 600, 1).label, 'Free');
    assert.equal(curbVisible(section, 600, 1, {free:true,paid:true,restrictions:false,unverified:false}), true);
    assert.ok(section.sourceIds.every(id => feed.sources[id]));
  }
  assert.ok(northern.geometry.coordinates.at(-1)[1] > southern.geometry.coordinates[0][1]);
  assert.ok(southern.geometry.coordinates.at(-1)[1] > feed.sections.find(s => s.id === 'station-east-southern-industrial-user-free').geometry.coordinates[0][1]);
});

test('Northern Street maps only the arrowed one-hour direction toward Station', () => {
  const section = feed.sections.find(s => s.id === 'northern-south-station-facing-user-one-hour');
  assert.ok(section);
  assert.equal(section.street, 'Northern Street');
  assert.equal(section.side, 'south');
  assert.equal(section.limitMinutes, 60);
  assert.equal(section.schedule.start, 540);
  assert.equal(section.schedule.end, 1080);
  assert.equal(section.schedule.days, null);
  assert.equal(curbState(section, 600, 1).label, 'Free · 1h');
  assert.equal(curbVisible(section, 600, 1, {free:true,paid:true,restrictions:false,unverified:false}), true);
  assert.ok(curbTableSegments(section, 1).some(row => row.limit === 60 && row.status === 'Free'));
  assert.ok(section.geometry.coordinates[0][0] < section.geometry.coordinates[1][0]);
  assert.ok(!feed.sections.some(s => s.street === 'Northern Street' && s.category === 'no-parking'));
});

test('E 1st Avenue includes the reviewed unsigned and signed curb sections', () => {
  const north = feed.sections.find(s => s.id === 'east-first-200-300-north-no-sign');
  const signed = feed.sections.find(s => s.id === 'east-first-239-270-south-2h');
  assert.equal(north.category, 'free');
  assert.equal(north.limitMinutes, null);
  assert.equal(curbState(north, 600, 1).label, 'Free');
  assert.equal(north.verification, 'street-view-parked-cars');
  assert.equal(signed.category, 'time-limited');
  assert.equal(signed.limitMinutes, 120);
  assert.equal(curbState(signed, 600, 1).label, 'Free · 2h');
  assert.equal(signed.schedule.days, null);
});

test('Quebec Street lines stay on the reviewed east curb and omit the rejected west curb', () => {
  const prior = feed.sections.find(s => s.id === 'quebec-east-national-prior-2h');
  const national = feed.sections.find(s => s.id === 'quebec-east-terminal-national-2h');
  const shortStay = feed.sections.find(s => s.id === 'quebec-east-1288-15min');
  const south = feed.sections.find(s => s.id === 'quebec-south-east-no-sign-seen');
  assert.deepEqual(prior.geometry.coordinates.map(p => p[0]), [-123.1019, -123.10181]);
  assert.deepEqual(national.geometry.coordinates.map(p => p[0]), [-123.10175, -123.10167]);
  assert.deepEqual(shortStay.geometry.coordinates.map(p => p[0]), [-123.10167, -123.10167]);
  assert.deepEqual(south.geometry.coordinates.map(p => p[0]), [-123.101652, -123.10167, -123.101685, -123.101716, -123.101746, -123.101813]);
  assert.equal(shortStay.limitMinutes, 15);
  assert.ok(!feed.sections.some(s => s.id === 'quebec-south-west-no-sign-seen'));
});
