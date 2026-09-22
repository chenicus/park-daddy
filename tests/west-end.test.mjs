import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildWestEndBlocks, curbState, curbVisible, curbSchedule } from '../west-end.js';
import { createLabelLayer, buildSeattleFreeBlocks } from '../labels.js';
import { rptKey } from '../reports.js';

const data = JSON.parse(fs.readFileSync(new URL('../data/west-end-plateau.json', import.meta.url)));
const blocks = buildWestEndBlocks(data);
const permit = blocks.find(b => b.curb.category === 'permit');
const barclay = blocks.find(b => b.curb.street === 'Barclay' && b.curb.limitMinutes === 60);
const haro = blocks.find(b => b.curb.street === 'Haro' && b.curb.limitMinutes === 60);
const bidwell = blocks.find(b => b.curb.spotChecks.some(c => c.status === 'user-reported-tentative-match'));

test('individual lines retain evidence and never acquire residential-free defaults', () => {
  assert.equal(blocks.length, 174);
  assert.equal(new Set(blocks.map(b => b.id)).size, blocks.length);
  assert.equal(new Set(blocks.map(rptKey)).size, blocks.length);
  for (const b of blocks) {
    assert.equal(b.curb.geometry.type, 'LineString');
    assert.equal(b.curb.geometryStatus, 'approximate-schematic');
    assert.equal(b.isFree, undefined);
    assert.equal(b.sources.length, 2);
    for (const [lon, lat] of b.curb.geometry.coordinates) {
      assert.ok(lon > -123.145 && lon < -123.12 && lat > 49.275 && lat < 49.295);
    }
  }
});

test('full-time permits are never public/free on any day or hour', () => {
  for (let day = 0; day < 7; day++) for (const mins of [0,539,540,1079,1080,1200,1439]) {
    const s = curbState(permit.curb, mins, day);
    assert.equal(s.free, false);
    assert.equal(s.rate, null);
    assert.equal(s.label, 'Permit only');
    assert.equal(curbVisible(permit.curb, mins, day, { free:true, paid:false, restrictions:false }), false);
  }
});

test('Barclay correction is scoped, historical and retains PDF omission', () => {
  assert.equal(barclay.curb.pdfSchedule.days, null);
  assert.deepEqual(barclay.curb.schedule.days, [1,2,3,4,5,6]);
  assert.equal(barclay.curb.spotChecks[0].imageryDate, '2024-08');
  assert.equal(barclay.curb.spotChecks[0].url, null);
  assert.match(curbSchedule(barclay.curb), /Mon–Sat/);
  assert.equal(haro.curb.schedule.days, null);
  for (let day=0; day<7; day++) assert.equal(curbState(haro.curb,600,day).free,false);
  assert.equal(curbState(barclay.curb,539,1).free,false);
  assert.equal(curbState(barclay.curb,540,6).free,true);
  assert.equal(curbState(barclay.curb,1079,6).free,true);
  assert.equal(curbState(barclay.curb,1080,6).free,false);
  assert.equal(curbState(barclay.curb,600,0).free,false);
});

test('Bidwell tentative check and 2-hour boundaries preserve unknown off-hours', () => {
  assert.equal(bidwell.curb.limitMinutes,120);
  assert.equal(bidwell.curb.spotChecks[0].status,'user-reported-tentative-match');
  assert.equal(curbState(bidwell.curb,540,1).free,true);
  assert.equal(curbState(bidwell.curb,1199,6).free,true);
  assert.equal(curbState(bidwell.curb,1200,6).free,false);
  assert.equal(curbState(bidwell.curb,600,0).free,false);
  assert.equal(bidwell.curb.outsideSchedule,'unknown');
  assert.equal(curbVisible(bidwell.curb,600,1,{free:false,paid:true,restrictions:true}),false);
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
  const layer=createLabelLayer(map,[permit,barclay,haro,bidwell,...legacy],{nowMins:()=>600,isWeekend:()=>false,dow:()=>day,onTap(){}});
  try {
    layer.refresh();
    assert.equal(sources.get('west-end-curbs').data.features.length,4);
    assert.equal(sources.get('blockface-lines').data.features.length,1);
    layer.setFilter({free:true,paid:false,restrictions:false});
    assert.equal(sources.get('west-end-curbs').data.features.length,2);
    day=0; layer.refresh();
    assert.equal(sources.get('west-end-curbs').data.features.length,0);
    layer.setFilter({free:false,paid:false,restrictions:true});
    assert.equal(sources.get('west-end-curbs').data.features.length,4);
    assert.equal(sources.get('blockface-lines').data.features.length,0);
    sources.set('west-end-curbs',{setData(d){this.data=d;}}); layer.refresh();
    assert.equal(sources.get('west-end-curbs').data.features.length,4);
    zoom=14; layer.refresh();
    assert.equal(sources.get('west-end-curbs').data.features.length,0);
  } finally {layer.destroy();}
});
