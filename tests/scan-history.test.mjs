import test from 'node:test';
import assert from 'node:assert/strict';
import {scanFeatures} from '../scan-history.js';
const block = {id:'guide',lon:-123.15,lat:49.27,hblock:'Maple west',curb:{id:'guide',geometry:{type:'LineString',coordinates:[[-123.15,49.27],[-123.15,49.271]]}}};
test('a single sign observation never becomes a full scanned curb', () => {
  const checked = {...block,curb:{...block.curb,spotChecks:[{status:'historical-sign-match',url:'https://www.google.com/maps/@?viewpoint=49.2703,-123.1501',imageryDate:'2024-08',finding:'Permit sign'}]}};
  const [feature] = scanFeatures([checked]).features;
  assert.equal(feature.geometry.type,'Point');
  assert.deepEqual(feature.geometry.coordinates,[-123.1501,49.2703]);
  assert.equal(feature.properties.status,'checked');
  assert.match(feature.properties.detail,/does not establish full-block/);
  const [gap] = scanFeatures([block]).features;
  assert.equal(gap.properties.status,'gap');
  assert.equal(gap.geometry.type,'LineString');
});
test('explicit scan extents replace only the guide sections named by the audit', () => {
  const row={status:'unclear',sectionIds:['guide'],geometry:{type:'LineString',coordinates:[[-123.15,49.2702],[-123.15,49.2704]]}};
  const features=scanFeatures([block], [row]).features;
  assert.equal(features.length,3);
  assert.equal(features.filter(f => f.properties.status === 'gap').length,2);
  assert.deepEqual(features[0].geometry,row.geometry);
  assert.equal(features[0].properties.status,'unclear');
});
