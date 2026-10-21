import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildWestEndBlocks, curbState, curbVisible } from '../west-end.js';

const feed = JSON.parse(fs.readFileSync(new URL('../data/kingsway-e11-e12-user-photos.json', import.meta.url)));
const manifest = JSON.parse(fs.readFileSync(new URL('../data/registry.json', import.meta.url)));

test('Kingsway photo feed is registered and contains only public parking sections', () => {
  const entry = manifest.cities.vancouver.data.find(d => d.url.startsWith('data/kingsway-e11-e12-user-photos.json'));
  assert.equal(entry?.kind, 'west-end');
  assert.equal(feed.sections.length, 6);
  assert.equal(buildWestEndBlocks(feed).length, 6);
  assert.ok(feed.sections.every(section => section.category === 'time-limited'));
  assert.ok(!feed.sections.some(section => section.category === 'no-parking'));
});

test('photo-backed sections expose their recorded Mon-Sat limits', () => {
  for (const section of feed.sections) {
    assert.ok([60, 120].includes(section.limitMinutes));
    assert.deepEqual(section.schedule.days, [1, 2, 3, 4, 5, 6]);
    assert.equal(section.schedule.start, 570);
    assert.equal(section.schedule.end, 1080);
    assert.equal(curbState(section, 600, 1).label, `Free · ${section.limitMinutes / 60}h`);
    assert.equal(curbState(section, 600, 0).label, 'Free');
    assert.equal(curbVisible(section, 600, 1, {free:true, paid:true, restrictions:false, unverified:false}), true);
    assert.ok(section.sourceIds.every(id => feed.sources[id]));
  }
});

test('East 12th line stays horizontal, north of the centerline and clear of intersections', () => {
  const section = feed.sections.find(s => s.street === 'East 12th Avenue');
  assert.ok(section.geometry.coordinates.every(([lng, lat]) => lng < -123.0950 && lng > -123.0964 && lat > 49.25980));
  assert.ok(Math.max(...section.geometry.coordinates.map(([, lat]) => lat)) - Math.min(...section.geometry.coordinates.map(([, lat]) => lat)) < 0.0001);
});

test('Kingsway slices follow the northeast curb and leave the reserved middle gap unmapped', () => {
  const slices = [
    feed.sections.find(s => s.id === 'kingsway-northeast-e12-south-slice-user-2h'),
    feed.sections.find(s => s.id === 'kingsway-northeast-north-slice-e11-user-2h')
  ];
  assert.ok(slices.every(Boolean));
  for (const section of slices) {
    const coordinates = section.geometry.coordinates;
    for (let index = 1; index < coordinates.length; index += 1) {
      assert.ok(coordinates[index][0] < coordinates[index - 1][0], section.id);
      assert.ok(coordinates[index][1] > coordinates[index - 1][1], section.id);
    }
  }
  assert.ok(slices[0].geometry.coordinates.at(-1)[1] < slices[1].geometry.coordinates[0][1]);
  assert.ok(slices[0].geometry.coordinates.at(-1)[0] > slices[1].geometry.coordinates[0][0]);
  assert.ok(slices[0].geometry.coordinates[0][1] > 49.25990);
  assert.ok(slices[1].geometry.coordinates.at(-1)[1] < 49.26090);
});

test('new Kingsway continuation stops at cross streets and changes to one hour before Broadway', () => {
  const e11e10 = feed.sections.find(s => s.id === 'kingsway-northeast-e11-e10-user-2h');
  const e10north = feed.sections.find(s => s.id === 'kingsway-northeast-e10-broadway-user-2h');
  const broadway = feed.sections.find(s => s.id === 'kingsway-northeast-broadway-user-1h');
  assert.equal(e11e10.limitMinutes, 120);
  assert.equal(e10north.limitMinutes, 120);
  assert.equal(broadway.limitMinutes, 60);
  assert.ok(e11e10.geometry.coordinates.at(-1)[1] < 49.2620);
  assert.ok(e10north.geometry.coordinates[0][1] > 49.2620);
  assert.ok(e10north.geometry.coordinates.at(-1)[1] < broadway.geometry.coordinates[0][1]);
  assert.ok(broadway.geometry.coordinates.at(-1)[1] < 49.26286);
  assert.ok(!feed.sections.some(s => s.category === 'no-parking'));
});
