import {SUPABASE_URL,SUPABASE_ANON_KEY} from './config.js';

const KINDS=new Set(['free','paid','permit','ev']);
const CLASS={free:'p-free',paid:null,permit:'p-permit',ev:'p-ev'};
function tier(rate){return rate<=2?'p1':rate<=4?'p2':rate<=6?'p3':'p4';}
export function normalizeCommunityRule(row){
  if(!row||typeof row.id!=='string'||!row.published_at||!Number.isFinite(row.lat)||!Number.isFinite(row.lon)||
    Math.abs(row.lat)>90||Math.abs(row.lon)>180||typeof row.street!=='string'||!row.street.trim()||row.street.length>160)return null;
  const raw=row.schedule?.windows;
  if(!Array.isArray(raw)||raw.length<1||raw.length>42)return null;
  const windows=[];
  for(const item of raw){
    if(!item||!KINDS.has(item.kind)||!Array.isArray(item.days)||!item.days.length||
      !item.days.every(day=>Number.isInteger(day)&&day>=0&&day<=6)||
      !Number.isInteger(item.from)||!Number.isInteger(item.to)||item.from<0||item.to>1440||item.from>=item.to)return null;
    if(item.kind==='paid'&&(!Number.isFinite(item.rate)||item.rate<=0||item.rate>100))return null;
    if(item.kind!=='paid'&&item.rate!=null)return null;
    if(item.limitMin!=null&&(!Number.isInteger(item.limitMin)||item.limitMin<=0||item.limitMin>1440))return null;
    windows.push({days:[...new Set(item.days)],from:item.from,to:item.to,kind:item.kind,rate:item.kind==='paid'?item.rate:null,limitMin:item.limitMin??null});
  }
  for(let day=0;day<7;day++){
    const dayWindows=windows.filter(win=>win.days.includes(day)).sort((a,b)=>a.from-b.from);
    for(let i=1;i<dayWindows.length;i++)if(dayWindows[i].from<dayWindows[i-1].to)return null;
  }
  return {...row,street:row.street.trim(),side:['north','south','east','west'].includes(row.side)?row.side:null,
    schedule:{windows}};
}
export function activeCommunityWindow(rule,mins,dow){
  return rule.schedule.windows.find(win=>win.days.includes(dow)&&mins>=win.from&&mins<win.to)||null;
}
export function communityDisplay(win){
  if(!win)return {hidden:true,free:false,rate:null};
  if(win.kind==='free')return {free:true,rate:0,label:'Free',cls:CLASS.free};
  if(win.kind==='permit')return {free:false,rate:0,label:'Permit',cls:CLASS.permit};
  if(win.kind==='ev')return {free:false,rate:0,label:'EV',cls:CLASS.ev};
  return {free:false,rate:win.rate,label:`$${Number.isInteger(win.rate)?win.rate:win.rate.toFixed(2)}/hr`,cls:tier(win.rate)};
}
export function communityBlock(row){
  const rule=normalizeCommunityRule(row);
  if(!rule)return null;
  return {id:`community-${rule.id}`,lat:rule.lat,lon:rule.lon,pts:[],rushes:[],prohibitions:[],card:false,
    hblock:rule.street,community:rule,operatorRate:(mins,dow)=>communityDisplay(activeCommunityWindow(rule,mins,dow))};
}
export async function fetchCommunityBlocks(city,signal){
  const url=`${SUPABASE_URL}/rest/v1/community_parking_rules?select=id,city,lat,lon,street,side,schedule,evidence_url,last_checked_at,published_at&city=eq.${encodeURIComponent(city)}&published_at=not.is.null&limit=500`;
  const controller=new AbortController(),abort=()=>controller.abort();
  if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,8000);
  let response;
  try{response=await fetch(url,{signal:controller.signal,headers:{apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${SUPABASE_ANON_KEY}`}});}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  if(!response.ok)throw Error('Community parking data unavailable');
  const rows=await response.json();
  return Array.isArray(rows)?rows.map(communityBlock).filter(Boolean):[];
}
