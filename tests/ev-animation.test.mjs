import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('EV filter staggers nearest first, caps delays, cleans up and skips motion on ordinary refresh',()=>{
 const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('function refreshEvMarkers('),source.indexOf('\nasync function loadVancouverEvChargers'));
 const elements=[];const timers=[];
 const map={getZoom:()=>14,getCenter:()=>({lat:0,lng:0}),getBounds:()=>({contains:()=>true}),project:([x,y])=>({x:x*100,y:y*100}),getContainer:()=>({getBoundingClientRect:()=>({left:0,top:0}),querySelectorAll:()=>[]})};
 const c={map,evVisible:true,evMarkers:[],activeEvMarker:null,evChargerData:{features:Array.from({length:20},(_,i)=>({geometry:{coordinates:[20-i,0]}}))},distMeters:(a,b,y,x)=>Math.hypot(x-b,y-a),setTimeout:(fn,ms)=>timers.push(ms),document:{createElement:()=>{const classes=new Set();const pill={style:{},classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},addEventListener:(event,fn)=>pill[event]=fn,classes};const el={firstElementChild:pill,addEventListener(){}};elements.push(el);return el;}},maplibregl:{Marker:class{constructor({element}){this.el=element;}setLngLat(x){this.coords=x;return this;}addTo(){return this;}getElement(){return this.el;}remove(){}}}};
 vm.createContext(c);vm.runInContext(fn,c);c.refreshEvMarkers({animate:true});
 assert.equal(c.evMarkers.length,20);
 assert.equal(c.evMarkers[0].coords[0],1);
 for(let i=0;i<20;i++) assert.equal(c.evMarkers[i].el.firstElementChild.style.animationDelay,`${Math.min(i,14)*25}ms`);
 const pill=c.evMarkers[0].el.firstElementChild;pill.animationend();assert(!pill.classes.has('in'));assert.equal(pill.style.animationDelay,'');
 c.evVisible=false;c.refreshEvMarkers({animate:true});assert(timers.every(ms=>ms===200));assert(elements.every(el=>el.firstElementChild.style.animationDelay===''));
 c.evVisible=true;c.refreshEvMarkers();assert(c.evMarkers.every(m=>!m.el.firstElementChild.classes.has('in')));
});
