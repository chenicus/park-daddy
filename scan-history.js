// This overlay records evidence, not parking eligibility. A sign check never
// implies that the entire schematic curb was traversed.
export function scanFeatures(blocks, explicit = []) {
  const features = explicit.map(row => ({type:'Feature', geometry:row.geometry, properties:{...row, geometry:undefined}}));
  for (const block of blocks) {
    const section = block.curb;
    if (!section) continue;
    const checks = (section.spotChecks || []).filter(check => check.url && check.imageryDate);
    if (checks.length) {
      const check = checks.at(-1);
      const viewpoint = check.url.match(/viewpoint=([-\d.]+),([-\d.]+)/);
      const coordinates = viewpoint ? [Number(viewpoint[2]),Number(viewpoint[1])] : [block.lon,block.lat];
      const resolved = ['historical-sign-match','historical-prohibited','historical-reserved','city-meter-confirmed'].includes(check.status);
      features.push({type:'Feature',geometry:{type:'Point',coordinates},properties:{status:resolved?'checked':'unclear',title:block.hblock,detail:`${check.finding || check.summary || check.status} Only a sign observation is recorded; this does not establish full-block scan coverage.${viewpoint?'':' Marker is at the approximate guide section, not the camera position.'}`,url:check.url,imageryDate:check.imageryDate,checkedOn:check.checkedOn || ''}});
    }
    const scans = explicit.filter(row => row.geometry.type === 'LineString' && row.status !== 'gap' && row.sectionIds?.includes(section.id));
    const coords = section.geometry.coordinates;
    for (let i=1;i<coords.length;i++) {
      const a=coords[i-1], b=coords[i], dx=b[0]-a[0], dy=b[1]-a[1], length=dx*dx+dy*dy;
      if (!length) continue;
      const intervals = scans.map(row => {
        const t=row.geometry.coordinates.map(p => ((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length);
        return [Math.max(0,Math.min(...t)),Math.min(1,Math.max(...t))];
      }).filter(([lo,hi]) => hi>lo).sort((x,y)=>x[0]-y[0]);
      let cursor=0;
      const gap = (lo,hi) => {
        if (hi-lo<0.001) return;
        const at=t=>[a[0]+dx*t,a[1]+dy*t];
        features.push({type:'Feature',geometry:{type:'LineString',coordinates:[at(lo),at(hi)]},properties:{status:'gap',title:block.hblock,detail:'No continuous Street View scan recorded for this guide portion. A nearby dot records an individual sign check only. Parking may already be mapped from other sources.',url:section.streetViewUrl || ''}});
      };
      for (const [lo,hi] of intervals) {gap(cursor,lo);cursor=Math.max(cursor,hi);}
      gap(cursor,1);
    }
  }
  return {type:'FeatureCollection',features};
}

export function initScanHistory(map, blocks, toggle, panel) {
  let enabled = new URLSearchParams(location.search).get('scans') === '1';
  let explicit = [];
  const color = ['match',['get','status'],'checked','#15803d','no-parking','#64748b','unclear','#d97706','#dc2626'];
  const render = () => {
    const data = enabled ? scanFeatures(blocks, explicit) : {type:'FeatureCollection',features:[]};
    if (!map.getSource('scan-history')) map.addSource('scan-history',{type:'geojson',data});
    else map.getSource('scan-history').setData(data);
    if (!map.getLayer('scan-history-lines')) map.addLayer({id:'scan-history-lines',type:'line',source:'scan-history',filter:['==',['geometry-type'],'LineString'],layout:{'line-cap':'round'},paint:{'line-color':color,'line-width':6,'line-opacity':0.7,'line-dasharray':[1,1]}});
    if (!map.getLayer('scan-history-points')) map.addLayer({id:'scan-history-points',type:'circle',source:'scan-history',filter:['==',['geometry-type'],'Point'],paint:{'circle-color':color,'circle-radius':7,'circle-stroke-color':'#fff','circle-stroke-width':2}});
    toggle.setAttribute('aria-pressed',String(enabled));
    panel.hidden = !enabled;
  };
  const show = event => {
    if (!enabled || !event.features?.length) return;
    const p = event.features[0].properties;
    const box = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = p.title;
    const detail = document.createElement('p'); detail.textContent = p.detail;
    box.append(title,detail);
    if (p.imageryDate) { const date = document.createElement('p'); date.textContent = `Imagery: ${p.imageryDate}${p.checkedOn?' · Checked: '+p.checkedOn:''}`; box.append(date); }
    if (p.url) { const link = document.createElement('a'); link.textContent='Open Street View ↗'; link.href=p.url; link.target='_blank'; link.rel='noopener'; box.append(link); }
    new maplibregl.Popup({maxWidth:'300px'}).setLngLat(event.lngLat).setDOMContent(box).addTo(map);
  };
  map.on('click','scan-history-lines',show); map.on('click','scan-history-points',show);
  map.on('style.load',render);
  toggle.addEventListener('click',() => { enabled=!enabled; render(); document.getElementById('menupanel').classList.remove('open'); });
  document.getElementById('scanHistoryClose').addEventListener('click',() => {enabled=false;render();});
  fetch('data/street-view-scan-history.json?v=1').then(r => {if (!r.ok) throw Error('Unavailable');return r.json();}).then(data => {explicit=data.sections || [];render();}).catch(() => render());
  render();
  return {refresh:render};
}
