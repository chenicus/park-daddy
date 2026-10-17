import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the production selection function without a GPU or DOM renderer.
const source = fs.readFileSync(new URL('../labels.js', import.meta.url), 'utf8');
const start = source.indexOf('  function pillDesired(');
const end = source.indexOf('\n  // Dots (meters)', start);
const selectSource = source.slice(start, end);
function fixture(blocks, restrictions = true) {
  const context = {
    visibleActive: () => blocks, focus: null, map: { getCenter: () => ({ lat: 0, lng: 0 }) },
    rateFor: b => b.r, flags: () => ({}), filter: { free: true, paid: true, restrictions },
    keep: () => true, curbVisible: () => restrictions, limitFor: b => b.limit ?? null,
    distMeters: (a,b,c,d) => Math.hypot(c-a,d-b), project: (lat,lon) => ({ x: lon*100000, y: lat*100000 }),
    fmtRate: r => `$${r}`, fmtLimit: mins => `${mins / 60}h`, bucket: () => 'p1', LABEL_CAP: 150,
  };
  vm.createContext(context);
  vm.runInContext(selectSource, context);
  return z => context.pillDesired(z, 600, false, 2);
}
const permit = (id, lat=0, lon=0) => ({ id, lat, lon, curb: {}, r: { free:false, rate:null, label:'Permit', cls:'p-permit' } });
const paid = (id, lat=0, lon=0) => ({ id, lat, lon, r: {free:false,rate:3} });

test('permit and paid pills share fractional zoom boundaries in both directions', () => {
  for (const make of [permit, paid, (id) => ({id,lat:0,lon:0,r:{free:true,rate:0}})]) {
    const select = fixture([make('one')]);
    for (const z of [12,12.49,12.5,12.99,13,13.01,14,14.49,14.5,15,16,17,16,15,14.5,14.49,13,12.5,12.49]) {
      const result = select(z);
      assert.equal(result.length, z < 13 ? 0 : 1, `zoom ${z}`);
      if (result.length) assert.equal(!!result[0].cluster, false, `summary at ${z}`);
    }
  }
});
test('permit pills respect their filter without suppressing paid summaries', () => {
  const select=fixture([permit('permit'),paid('paid',0.02,0.02)],false);
  for(const z of [13,14,15,16]) {
    assert.equal(select(z).length,1);
    assert.notEqual(select(z)[0].text,'Permit');
  }
});
test('permit pills use the same collision handling at every visible zoom', () => {
  for(const make of [permit,paid]) {
    assert.equal(fixture([make('a'),make('b',0.00001,0.00001)])(14).length,1);
    const blocks=Array.from({length:30},(_,i)=>make(String(i),i*0.02,i*0.02));
    assert.equal(fixture(blocks)(14).length,30);
    assert.equal(fixture(blocks)(16).length,30);
  }
});
test('permit pills remain distinct from public parking prices', () => {
  const result=fixture([permit('p'),paid('m',0.002,0.002)])(14);
  assert.equal(result.length,2);
  assert(result.some(p=>p.text==='Permit' && p.cls==='p-permit'));
  assert(result.some(p=>p.text==='$3/hr'));
});

test('known free and paid durations keep identical suffixes while zooming in and out', () => {
  const cases = [
    {...paid('paid'), limit:120},
    {id:'free',lat:0,lon:0,r:{free:true,rate:0},limit:120},
    {id:'curb',lat:0,lon:0,curb:{},r:{free:true,rate:0,label:'Free · 2h',cls:'p-free'}},
    permit('permit'),
  ];
  for (const block of cases) {
    const select=fixture([block]);
    for (const zoom of [13,14,15,15.99,16,17,16,15,14,13]) {
      const pill=select(zoom)[0];
      if(block.id==='permit') assert(!pill.text.includes(' · '));
      else {assert(pill.text.endsWith(' · 2h'));assert(pill.suffix.endsWith(' · 2h'));}
    }
  }
});
