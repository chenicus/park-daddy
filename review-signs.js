import {SUPABASE_URL,SUPABASE_ANON_KEY} from './config.js';
import {normalizeCommunityRule} from './community-rules.js';
const $=id=>document.getElementById(id);
let token=null,photoUrls=[];
const auth=()=>({apikey:SUPABASE_ANON_KEY,Authorization:`Bearer ${token||SUPABASE_ANON_KEY}`});
async function request(path,options={}){
  const response=await fetch(`${SUPABASE_URL}${path}`,{...options,headers:{...auth(),...(options.headers||{})}});
  if(!response.ok){const body=await response.json().catch(()=>({}));throw Error(body.message||body.error_description||body.error||`Request failed (${response.status})`);}
  return response.status===204?null:response.json();
}
const status=(message,error=false)=>{const el=$('status');el.textContent=message;el.className=error?'error':'success';};
function field(label,input){const wrapper=document.createElement('label');wrapper.textContent=label;wrapper.append(input);return wrapper;}
function textInput(value=''){const el=document.createElement('input');el.value=value;return el;}
function button(label,style=''){const el=document.createElement('button');el.type='button';el.textContent=label;el.className=style;return el;}
async function loadPhoto(row,img){
  try{const path=row.photo_path.split('/').map(encodeURIComponent).join('/');
    const response=await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/sign-evidence/${path}`,{headers:auth()});
    if(!response.ok)throw Error('Private image unavailable');
    const url=URL.createObjectURL(await response.blob());photoUrls.push(url);img.src=url;
  }catch{img.alt='Private image unavailable';}
}
function render(row){
  const card=document.createElement('article');card.className='card';
  const heading=document.createElement('h3');heading.textContent=`${row.city} · ${new Date(row.captured_at).toLocaleString()}`;card.append(heading);
  const position=document.createElement('p');position.className='meta';position.textContent=`Original GPS ${row.lat.toFixed(5)}, ${row.lon.toFixed(5)} · ${row.accuracy_m==null?'accuracy unknown':`±${Math.round(row.accuracy_m)} m`} · ${row.inferred_street||'Street unknown'} · ${row.inferred_side||'Side unknown'} (estimate)`;card.append(position);
  const mapLink=document.createElement('a');mapLink.href=`https://www.openstreetmap.org/?mlat=${row.lat}&mlon=${row.lon}#map=19/${row.lat}/${row.lon}`;mapLink.target='_blank';mapLink.rel='noopener noreferrer';mapLink.textContent='Inspect original GPS on map ↗';card.append(mapLink);
  const img=document.createElement('img');img.alt='Original private parking sign submission';card.append(img);void loadPhoto(row,img);
  const ocr=document.createElement('p');ocr.textContent=`Read on device: ${row.ocr_text||'No text recognized'}`;card.append(ocr);
  const grid=document.createElement('div');grid.className='grid';
  const lat=textInput(String(row.inferred_lat??row.lat)),lon=textInput(String(row.inferred_lon??row.lon));
  lat.type='number';lon.type='number';lat.step=lon.step='any';grid.append(field('Final pin latitude',lat),field('Final pin longitude',lon));
  const street=textInput(row.inferred_street||'');grid.append(field('Verified street',street));
  const side=document.createElement('select');for(const [value,label] of [['','Choose verified side'],['north','North'],['south','South'],['east','East'],['west','West']]){const option=document.createElement('option');option.value=value;option.textContent=label;side.append(option);}side.value=row.inferred_side||'';grid.append(field('Verified curb side',side));card.append(grid);
  const schedule=document.createElement('textarea');schedule.placeholder='{"windows":[{"days":[1,2,3,4,5],"from":540,"to":1080,"kind":"paid","rate":2.5,"limitMin":120}]}';
  if(Array.isArray(row.suggested_rules?.windows)&&row.suggested_rules.windows.length)
    schedule.value=JSON.stringify({windows:row.suggested_rules.windows},null,2);
  card.append(field('Verified weekly schedule (OCR proposal; check every field against the sign. Minutes after midnight, Sunday = 0)',schedule));
  const evidence=document.createElement('input');evidence.type='file';evidence.accept='image/jpeg,image/png,image/webp';card.append(field('Redacted evidence image (remove faces and plates first)',evidence));
  const note=textInput();note.maxLength=1000;card.append(field('Internal review note',note));
  const actions=document.createElement('div');actions.className='row';
  const approve=button('Approve and publish'),reject=button('Reject','secondary'),needs=button('Needs review','secondary');actions.append(approve,needs,reject);card.append(actions);
  const message=document.createElement('p');message.setAttribute('role','status');card.append(message);
  const run=async(decision)=>{
    actions.querySelectorAll('button').forEach(el=>el.disabled=true);message.textContent='Saving…';message.className='meta';
    try{
      let payload={p_submission_id:row.id,p_decision:decision,p_note:note.value};
      if(decision==='approved'){
        if(!street.value.trim()||!side.value||!evidence.files?.[0])throw Error('Verify the street and side, then choose a redacted evidence image.');
        const parsed=JSON.parse(schedule.value);
        if(!normalizeCommunityRule({id:row.id,published_at:new Date().toISOString(),lat:Number(lat.value),lon:Number(lon.value),street:street.value,side:side.value,schedule:parsed}))
          throw Error('Check the schedule: each window needs explicit days, start, end and one valid rule, with no overlaps.');
        const file=evidence.files[0];if(file.size>5*1024*1024)throw Error('Evidence image must be under 5 MB.');
        const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':file.type==='image/jpeg'?'jpg':null;
        if(!ext)throw Error('Use a JPEG, PNG or WebP image.');
        const path=`${row.city}/${row.id}.${ext}`;
        const uploaded=await fetch(`${SUPABASE_URL}/storage/v1/object/sign-reviewed/${path}`,{method:'POST',headers:{...auth(),'Content-Type':file.type},body:file});
        if(!uploaded.ok&&uploaded.status!==409)throw Error('Could not upload reviewed evidence.');
        payload={...payload,p_lat:Number(lat.value),p_lon:Number(lon.value),p_street:street.value.trim(),p_side:side.value,p_schedule:parsed,
          p_evidence_url:`${SUPABASE_URL}/storage/v1/object/public/sign-reviewed/${path}`};
      }
      await request('/rest/v1/rpc/review_sign_submission',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      card.remove();await refresh();
    }catch(error){message.textContent=error.message;message.className='error';actions.querySelectorAll('button').forEach(el=>el.disabled=false);}
  };
  approve.onclick=()=>void run('approved');reject.onclick=()=>void run('rejected');needs.onclick=()=>void run('needs_review');
  return card;
}
async function refresh(){
  status('Loading…');photoUrls.forEach(URL.revokeObjectURL);photoUrls=[];$('items').replaceChildren();
  try{const rows=await request('/rest/v1/sign_submissions?select=id,city,captured_at,lat,lon,accuracy_m,inferred_lat,inferred_lon,inferred_street,inferred_side,ocr_text,suggested_rules,photo_path,status&status=in.(pending,needs_review)&order=created_at.asc&limit=100');
    if(!rows.length){status('No scans waiting for review.');return;}
    status(`${rows.length} scan${rows.length===1?'':'s'} waiting for review.`);$('items').append(...rows.map(render));
  }catch(error){status(error.message,true);}
}
$('loginForm').addEventListener('submit',async event=>{event.preventDefault();
  try{const session=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey:SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({email:$('email').value,password:$('password').value})});
    const data=await session.json();if(!session.ok||!data.access_token)throw Error(data.msg||data.error_description||'Sign-in failed');
    token=data.access_token;$('password').value='';$('login').hidden=true;$('queue').hidden=false;await refresh();
  }catch(error){const errorNode=document.createElement('p');errorNode.className='error';errorNode.textContent=error.message;$('loginForm').append(errorNode);}
});
$('refresh').onclick=()=>void refresh();
$('logout').onclick=()=>{token=null;photoUrls.forEach(URL.revokeObjectURL);photoUrls=[];$('items').replaceChildren();$('queue').hidden=true;$('login').hidden=false;};
