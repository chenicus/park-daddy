import test from 'node:test';
import assert from 'node:assert/strict';
import {activeCommunityWindow,communityBlock,communityDisplay,normalizeCommunityRule} from '../community-rules.js';
import {createLabelLayer} from '../labels.js';

const row={id:'11111111-1111-4111-8111-111111111111',city:'seattle',lat:47.61,lon:-122.33,
  street:'Pine Street',side:'north',published_at:'2026-10-17T00:00:00Z',
  schedule:{windows:[{days:[1,2,3,4,5],from:540,to:1080,kind:'paid',rate:2.5,limitMin:120}]}};

test('reviewed sign becomes a community marker only inside its verified schedule',()=>{
  const rule=normalizeCommunityRule(row),block=communityBlock(row);
  assert.ok(rule&&block);
  assert.equal(block.id,`community-${row.id}`);
  assert.equal(block.operatorRate(600,1).label,'$2.50/hr');
  assert.equal(communityDisplay(activeCommunityWindow(rule,600,0)).hidden,true);
  assert.equal(communityDisplay(activeCommunityWindow(rule,1100,1)).hidden,true);
});

test('ambiguous, overlapping or unpublished rules never become map markers',()=>{
  assert.equal(communityBlock({...row,published_at:null}),null);
  assert.equal(communityBlock({...row,schedule:{windows:[...row.schedule.windows,
    {days:[1],from:1000,to:1200,kind:'free'}]}}),null);
  assert.equal(communityBlock({...row,schedule:{windows:[{days:[1],from:600,to:500,kind:'paid',rate:2.5}]}}),null);
});

test('free, permit and EV retain the web app marker classes',()=>{
  for(const [kind,cls] of [['free','p-free'],['permit','p-permit'],['ev','p-ev']]){
    const block=communityBlock({...row,schedule:{windows:[{days:[0],from:0,to:1440,kind}]}});
    assert.equal(block.operatorRate(600,0).cls,cls);
  }
});

test('community permit and EV dots keep their colors and follow their own filters',()=>{
  const previousMatchMedia=globalThis.matchMedia;
  globalThis.matchMedia=()=>({matches:true});
  try{
  for(const [kind,color] of [['permit','#7c3aed'],['ev','#0891b2']]){
    let dots=null;
    const source={setData(data){dots=data;}};
    const map={getZoom:()=>12,getCenter:()=>({lat:47.61,lng:-122.33}),
      getBounds:()=>({getSouth:()=>47.5,getNorth:()=>47.7,getWest:()=>-122.4,getEast:()=>-122.2}),
      getSource:name=>name==='meter-dots'?source:null,on(){},off(){},fire(){}};
    const block=communityBlock({...row,schedule:{windows:[{days:[1],from:0,to:1440,kind}]}});
    const layer=createLabelLayer(map,[block],{nowMins:()=>600,isWeekend:()=>false,dow:()=>1,onTap(){}});
    try{
      layer.setFilter({free:false,paid:false,restrictions:true,ev:true,unverified:false});
      assert.equal(dots.features[0].properties.color,color);
      layer.setFilter({free:true,paid:true,restrictions:kind!=='permit',ev:kind!=='ev',unverified:false});
      assert.equal(dots.features.length,0);
    }
    finally{layer.destroy();}
  }
  }finally{globalThis.matchMedia=previousMatchMedia;}
});
