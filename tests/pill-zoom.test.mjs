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
    keep: () => true, curbVisible: () => restrictions, limitFor: () => null,
    distMeters: (a,b,c,d) => Math.hypot(c-a,d-b), project: (lat,lon) => ({ x: lon*100000, y: lat*100000 }),
    fmtRate: r => `$${r}`, fmtLimit: String, bucket: () => 'p1', LABEL_CAP: 150,
  };
  vm.createContext(context);
  vm.runInContext(selectSource, context);
  return z => context.pillDesired(Math.round(z), 600, false, 2);
}
const permit = (id, lat=0, lon=0) => ({ id, lat, lon, curb: {}, r: { free:false, rate:null, label:'Permit', cls:'p-permit' } });
const paid = (id, lat=0, lon=0) => ({ id, lat, lon, r: {free:false,rate:3} });

test('permit and paid pills share fractional zoom boundaries in both directions', () => {
  for (const make of [permit, paid]) {
    const select = fixture([make('one')]);
    for (const z of [12,12.49,12.5,13,14,14.49,14.5,15,16,17,16,15,14.5,14.49,13,12.5,12.49]) {
      const result = select(z);
      assert.equal(result.length, Math.round(z) < 13 ? 0 : 1, `zoom ${z}`);
      if (result.length) assert.equal(!!result[0].cluster, Math.round(z) <= 14, `summary at ${z}`);
    }
  }
});
test('permit summaries respect their filter without suppressing paid summaries', () => {
  const select=fixture([permit('permit'),paid('paid',0.02,0.02)],false);
  for(const z of [13,14,15,16]) {
    assert.equal(select(z).length,1);
    assert.notEqual(select(z)[0].text,'Permit');
  }
});
test('permit summaries use the same area grouping, collision handling and cap', () => {
  for(const make of [permit,paid]) {
    assert.equal(fixture([make('a'),make('b',0.00001,0.00001)])(14).length,1);
    const blocks=Array.from({length:30},(_,i)=>make(String(i),i*0.02,i*0.02));
    assert.equal(fixture(blocks)(14).length,12);
    assert.equal(fixture(blocks)(16).length,30);
  }
});
test('permit summaries remain distinct from public parking prices', () => {
  const result=fixture([permit('p'),paid('m',0.002,0.002)])(14);
  assert.equal(result.length,2);
  assert(result.some(p=>p.text==='Permit' && p.cls==='p-permit'));
  assert(result.some(p=>p.text==='$3'));
});
