import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const install=app.slice(app.indexOf('function installLayers()'),app.indexOf('\nfunction refreshEvLayer'));
for(const theme of ['light','dark']) test(`${theme}: EV and parking dots share geometry and opacity`,()=>{
 const layers={};
 const c={map:{getSource:()=>null,addSource(){},getLayer:()=>null,addLayer:l=>layers[l.id]=l},EMPTY_FC:{},evChargerData:{},evVisible:true,document:{documentElement:{dataset:{theme}}},brightenDarkPaths(){}};
 vm.createContext(c);vm.runInContext(install+'\ninstallLayers()',c);
 const ev=layers['ev-chargers'].paint,parking=layers['meter-dots'].paint;
 assert.equal(JSON.stringify(ev['circle-radius']),JSON.stringify(parking['circle-radius']));
 assert.equal(JSON.stringify(ev['circle-opacity']),JSON.stringify(parking['circle-opacity']));
 assert.equal(ev['circle-stroke-width'],0);
 assert.equal(ev['circle-color'],theme==='dark'?'#67e8f9':'#0891b2');
});
