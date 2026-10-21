import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildWestEndBlocks, curbState } from '../west-end.js';

const feed = JSON.parse(fs.readFileSync(new URL('../data/main-e5-national-user-photos.json', import.meta.url)));
const manifest = JSON.parse(fs.readFileSync(new URL('../data/registry.json', import.meta.url)));

test('Main Street photo feed is registered and contains no no-parking sections', () => {
  const entry = manifest.cities.vancouver.data.find(d => d.url.startsWith('data/main-e5-national-user-photos.json'));
  assert.equal(entry?.kind, 'west-end');
  assert.equal(feed.sections.length, 6);
  assert.equal(buildWestEndBlocks(feed).length, 6);
  assert.ok(feed.sections.every(section => section.category === 'time-limited'));
});

test('Main Street photo-backed schedules match the photographed plates', () => {
  const oneHour = feed.sections.filter(section => section.limitMinutes === 60);
  const twoHour = feed.sections.filter(section => section.limitMinutes === 120);
  assert.equal(oneHour.length, 2);
  assert.deepEqual(oneHour.map(section => [section.schedule.start, section.schedule.end]), [[570, 1080], [570, 1080]]);
  assert.equal(twoHour.length, 4);
  assert.ok(twoHour.every(section => section.schedule.start === 540 && section.schedule.end === 900));
  assert.equal(curbState(oneHour[0], 600, 1).label, 'Free · 1h');
  assert.equal(curbState(twoHour[0], 600, 1).label, 'Free · 2h');
});

test('Main Street lines stay on the east curb and stop before intersections', () => {
  const [e5e4, e4e3, national, nationalMilross, milrossPrior, priorUnion] = feed.sections;
  assert.ok(e5e4.geometry.coordinates.every(([lng, lat]) => lng > -123.1008 && lat > 49.2664 && lat < 49.26732));
  assert.ok(e4e3.geometry.coordinates.every(([lng, lat]) => lng > -123.1007 && lat > 49.26732 && lat < 49.26822));
  assert.ok(national.geometry.coordinates.every(([lng, lat]) => lng > -123.0999 && lat < 49.27490));
  assert.ok(nationalMilross.geometry.coordinates.every(([lng, lat]) => lng > -123.0999 && lat > 49.27502 && lat < 49.27600));
  assert.ok(milrossPrior.geometry.coordinates.every(([lng, lat]) => lng > -123.0999 && lat > 49.27610 && lat < 49.27670));
  assert.ok(priorUnion.geometry.coordinates.every(([lng, lat]) => lng > -123.0999 && lat > 49.27682 && lat < 49.27755));
  assert.ok(e5e4.geometry.coordinates.at(-1)[1] < e4e3.geometry.coordinates[0][1]);
  assert.ok(e4e3.geometry.coordinates.at(-1)[1] < national.geometry.coordinates[0][1]);
  assert.ok(national.geometry.coordinates.at(-1)[1] < nationalMilross.geometry.coordinates[0][1]);
  assert.ok(nationalMilross.geometry.coordinates.at(-1)[1] < milrossPrior.geometry.coordinates[0][1]);
  assert.ok(milrossPrior.geometry.coordinates.at(-1)[1] < priorUnion.geometry.coordinates[0][1]);
});

test('paid meter 67081 remains in the meter layer instead of becoming a photo-derived line', () => {
  const meters = JSON.parse(fs.readFileSync(new URL('../data/meters.json', import.meta.url)));
  const meter = meters.find(item => item.mobile_payment_number === 67081);
  assert.equal(meter?.rate_9am_6pm, '$2.00');
  assert.equal(meter?.time_limit_9am_6pm, '2 Hr');
  assert.equal(meter?.pm_rush_hours, '3:00pm to 6:00pm');
  assert.ok(!feed.sections.some(section => section.id.includes('67081') || section.category === 'paid'));
});

test('unconfirmed Main Street curb remains explicitly unmapped', () => {
  assert.ok(feed.excludeInferredBlocks.some(value => value.includes('East 3rd Avenue')));
  assert.ok(!feed.sections.some(section => section.category === 'no-parking'));
});
