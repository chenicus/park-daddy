// Shared with mobile/place-search.js. This module never receives the TomTom key.
export function createPlaceSearch({endpoint, publicKey, newSession = () => crypto.randomUUID()}) {
  let session;
  async function send(body, signal) {
    const response=await fetch(endpoint,{method:'POST',signal,headers:{'Content-Type':'application/json',apikey:publicKey},body:JSON.stringify({...body,session:session||=newSession()})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      const messages={rate_limited:'Too many searches. Please wait before trying again.',budget_exhausted:'Search has reached its free usage limit. Please try again later.',verification_required:'Please verify to continue searching.',verification_unavailable:'Search verification is unavailable. Please try again.'};
      const error=new Error(messages[data.code]||'Search is unavailable. Please try again.');
      error.code=data.code;error.busy=response.status===429||response.status===503;throw error;
    }
    return data;
  }
  async function request(body,signal){
    if(signal?.aborted)throw new DOMException('Search cancelled','AbortError');
    return send(body,signal);
  }
  async function suggest(query, center, signal) {
    const data = await request({operation:'suggest', query:query.trim(), center}, signal);
    const seen = new Set();
    return (Array.isArray(data.items) ? data.items : []).filter(p => {
      if (!p || typeof p.label !== 'string' || !p.label.trim() || typeof p.id !== 'string' || typeof p.type !== 'string') return false;
      const key = p.id + '|' + p.type;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }).map(p => ({...p, provider:'tomtom'}));
  }
  async function resolve(item, signal) {
    if (item.provider !== 'tomtom') return item;
    const data = await request({operation:'details', id:item.id, type:item.type}, signal);
    const p = data.place;
    if (!p || typeof p.label !== 'string' || !p.label.trim() || !Number.isFinite(p.lat) || Math.abs(p.lat)>90 || !Number.isFinite(p.lon) || Math.abs(p.lon)>180) throw new Error('This place has no usable map location.');
    session = undefined;
    return {...p, provider:'tomtom'};
  }
  async function search(query, center, signal) {
    const items = await suggest(query, center, signal);
    return items.length ? resolve(items[0], signal) : null;
  }
  return {suggest, resolve, search, reset:()=>{session=undefined;}};
}
