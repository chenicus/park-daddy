// Supabase Edge Function. Deploy with JWT verification disabled: this is public
// place search, protected by a server-side atomic budget, not a client secret.
const TYPES = new Set(['pois','addresses','streets','intersections','areas']);
const SESSION = /^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text = (value: unknown): string => typeof value === 'string' ? value : '';
const subtitles = (value: unknown): string => Array.isArray(value) ? value.filter(v=>typeof v==='string').join(', ') : '';
const coordinates = (value: unknown): value is number[] => Array.isArray(value) && value.length===2 && Number.isFinite(value[0]) && Math.abs(value[0])<=180 && Number.isFinite(value[1]) && Math.abs(value[1])<=90;

const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer),b=>b.toString(16).padStart(2,'0')).join('');
const digest = async (value:string) => hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
async function guardSearch(req:Request,input:any,backend:string,service:string):Promise<{status?:number;code?:string;pass?:string;expiresAt?:number}> {
  const secret=Deno.env.get('TURNSTILE_SECRET_KEY');
  const hosts=(Deno.env.get('TURNSTILE_HOSTNAMES')||'parkdaddy.app,www.parkdaddy.app').split(',').map(s=>s.trim());
  // Must be set only after checking that the managed gateway overwrites this
  // header. Never accept a caller-provided IP in the JSON body or query string.
  const ipHeader=Deno.env.get('SEARCH_TRUSTED_IP_HEADER');
  if(!secret||!ipHeader||!['cf-connecting-ip','x-forwarded-for'].includes(ipHeader))return {status:503,code:'verification_unavailable'};
  const ip=(req.headers.get(ipHeader)||'').split(',')[0].trim().toLowerCase();
  if(!ip||ip.length>64||!/^[0-9a-f:.]+$/.test(ip))return {status:403,code:'verification_required'};
  // A daily keyed digest avoids storing raw IP addresses or reusable IP hashes.
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(service),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const ipHash=hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`park-search-ip:${new Date().toISOString().slice(0,10)}:${ip}`)));
  const reserve=async(action:string,passHash='')=>{
    const response=await fetch(`${backend}/rest/v1/rpc/guard_place_search`,{method:'POST',headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'},body:JSON.stringify({action_name:action,ip_digest:ipHash,pass_digest:passHash}),signal:AbortSignal.timeout(3000)});
    if(!response.ok)throw Error('Search protection unavailable');
    return response.json();
  };
  const failure=(result:string)=>result==='rate'?{status:429,code:'rate_limited'}:result==='budget'?{status:429,code:'budget_exhausted'}:{status:403,code:'verification_required'};
  if(input.operation==='issue-pass'){
    if(typeof input.challenge!=='string'||!input.challenge||input.challenge.length>2048)return {status:403,code:'verification_required'};
    const limit=await reserve('issue');if(limit!=='ok')return failure(limit);
    const verified=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret,response:input.challenge,remoteip:ip}),signal:AbortSignal.timeout(8000)});
    if(!verified.ok)return {status:503,code:'verification_unavailable'};
    const result=await verified.json();
    if(result.success!==true||!hosts.includes(result.hostname)||result.action!=='park-search')return {status:403,code:'verification_required'};
    const pass=hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
    if(await reserve('create',await digest(pass))!=='ok')return {status:503,code:'verification_unavailable'};
    return {pass,expiresAt:Date.now()+10*60*1000};
  }
  if(typeof input.pass!=='string'||!/^[a-f0-9]{64}$/.test(input.pass))return {status:403,code:'verification_required'};
  const result=await reserve(input.operation,await digest(input.pass));
  return result==='ok'?{}:failure(result);
}

export async function handleSearch(req: Request): Promise<Response> {
  const origin = req.headers.get('origin');
  const allowed = (Deno.env.get('SEARCH_ALLOWED_ORIGINS') || 'https://parkdaddy.app,https://www.parkdaddy.app').split(',').map(v=>v.trim());
  const headers: Record<string,string> = {'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  if (origin && !allowed.includes(origin)) return new Response(null,{status:403});
  if (origin) headers['Access-Control-Allow-Origin']=origin;
  headers['Access-Control-Allow-Headers']='content-type,apikey';
  headers['Access-Control-Allow-Methods']='POST,OPTIONS';
  const reply = (status:number, data:unknown) => new Response(JSON.stringify(data),{status,headers});
  if (req.method==='OPTIONS') return new Response(null,{status:204,headers});
  if (req.method!=='POST') return reply(405,{error:'Method not allowed'});
  const key = Deno.env.get('TOMTOM_API_KEY');
  const backend = Deno.env.get('SUPABASE_URL');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key || !backend || !service) return reply(503,{error:'Search is not configured'});
  try {
    // Bound the body while reading, including chunked requests.
    const reader=req.body?.getReader();
    if (!reader) return reply(400,{error:'Missing request'});
    const chunks:Uint8Array[]=[];let size=0;
    while (true) {const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return reply(413,{error:'Request too large'});}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    let input;
    try {input=JSON.parse(new TextDecoder().decode(bytes));} catch {return reply(400,{error:'Invalid JSON'});}
    if (!input || !SESSION.test(text(input.session))) return reply(400,{error:'Invalid session'});
    const {operation}=input;
    if(operation==='issue-pass'){
      const result=await guardSearch(req,input,backend,service);
      return result.status?reply(result.status,{code:result.code}):reply(200,result);
    }
    let url='https://api.tomtom.com/maps/orbis/places/';
    let body:string|undefined;
    let attributes:string;
    if (operation==='suggest') {
      const query=text(input.query).trim();
      if (!query || query.length>200 || !coordinates(input.center)) return reply(400,{error:'Invalid search'});
      url+='suggest';
      body=JSON.stringify({query,maxResults:6,preferences:{geometry:{type:'point',coordinates:input.center}},filters:{types:['poi','address','street','intersection','area']}});
      attributes='results(id,type,title,subtitles,more)';
    } else if (operation==='details') {
      if (!TYPES.has(input.type) || !/^[a-zA-Z0-9_-]{1,512}$/.test(text(input.id))) return reply(400,{error:'Invalid place'});
      url+=`details/${input.type}/${encodeURIComponent(input.id)}`;
      attributes='id,type,title,subtitles,position,address(municipality,countrySubdivision,country)';
    } else return reply(400,{error:'Invalid operation'});

    const permission=await guardSearch(req,input,backend,service);
    if(permission.status)return reply(permission.status,{code:permission.code});
    const response=await fetch(url,{
      method:body?'POST':'GET',body,
      headers:{'TomTom-Api-Key':key,'TomTom-Api-Version':'3',Attributes:attributes,'Session-Id':input.session,'Accept-Language':'en','Content-Type':'application/json'},
      signal:AbortSignal.timeout(8000),
    });
    if (!response.ok) return reply(response.status===429?429:502,{error:'Search provider unavailable'});
    const data=await response.json();
    if (operation==='suggest') {
      const items=(Array.isArray(data.results)?data.results:[]).flatMap((hit:any)=>{
        if (hit.more?.operation!=='details' || !text(hit.title)) return [];
        const params=Array.isArray(hit.more.pathParameters)?hit.more.pathParameters:[];
        const type=params.find((p:any)=>p.parameter==='type')?.argument;
        const id=params.find((p:any)=>p.parameter==='id')?.argument;
        return TYPES.has(type)&&/^[a-zA-Z0-9_-]{1,512}$/.test(text(id))?[{id,type,label:hit.title,sub:subtitles(hit.subtitles)}]:[];
      });
      return reply(200,{items});
    }
    const point=data.position?.coordinates;
    if (!coordinates(point) || !text(data.title)) return reply(502,{error:'Place location unavailable'});
    return reply(200,{place:{label:data.title,sub:subtitles(data.subtitles),lon:point[0],lat:point[1],city:text(data.address?.municipality),state:text(data.address?.countrySubdivision),country:text(data.address?.country)}});
  } catch {return reply(503,{error:'Search temporarily unavailable'});}
}
Deno.serve(handleSearch);
