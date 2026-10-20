import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const appSource = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const drivingSource = fs.readFileSync(new URL('../driving.js', import.meta.url), 'utf8');

test('startup reuses a previous successful grant when Permissions API reports prompt', async () => {
  const start = appSource.indexOf('async function hasStartupLocationGrant()');
  const end = appSource.indexOf('\nfunction getPosition()', start);
  assert(start >= 0 && end > start);
  const context = {
    GEO_PERMISSION_KEY: 'pd_geo_permission',
    store: { get: () => 'granted' },
    navigator: { permissions: { query: async () => ({ state: 'prompt' }) } },
  };
  vm.createContext(context);
  vm.runInContext(appSource.slice(start, end), context);
  assert.equal(await context.hasStartupLocationGrant(), true);
  context.navigator.permissions.query = async () => ({ state: 'denied' });
  assert.equal(await context.hasStartupLocationGrant(), false);
});

test('a startup location fix draws the arrow before the watch reports a position', () => {
  let markerAdds = 0;
  class Marker {
    setLngLat() { return this; }
    setRotation() { return this; }
    addTo() { markerAdds++; return this; }
  }
  const context = {
    URLSearchParams, location: { search: '' },
    navigator: { geolocation: {
      getCurrentPosition() {}, watchPosition() { return 1; }, clearWatch() {},
    } },
    document: { createElement: () => ({ innerHTML: '', style: {} }), addEventListener() {} },
    window: { matchMedia: () => ({ matches: true }) },
    maplibregl: { Marker }, distMeters: () => 100,
  };
  vm.createContext(context);
  const source = drivingSource.replace(/^import .*\n/m, '').replace(/\bexport (const|function)\b/g, '$1');
  vm.runInContext(source, context);
  const map = { easeTo() {}, on() {}, off() {} };
  const driving = context.createDriving({ map, onFix() {}, onActiveChange() {}, onFollowChange() {} });
  driving.start({ passive: true });
  assert.equal(markerAdds, 0);
  driving.seedPosition({ lat: 49.28, lon: -123.12 });
  assert.equal(markerAdds, 1);
  assert.deepEqual({ ...driving.lastPos() }, { lat: 49.28, lon: -123.12, hdg: 0 });
});
