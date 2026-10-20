let pending;
export function getSearchChallenge(){
  if(pending)return pending;
  pending=new Promise((resolve,reject)=>{
    const dialog=document.createElement('dialog');
    dialog.setAttribute('aria-label','Verify to search');
    dialog.style.cssText='padding:20px;border:1px solid #888;border-radius:16px;max-width:360px;width:calc(100% - 48px)';
    const title=document.createElement('h2');title.textContent='Verify to search';
    const explanation=document.createElement('p');explanation.textContent='A quick check helps keep location search free for everyone.';
    const iframe=document.createElement('iframe'),nonce=crypto.randomUUID();
    iframe.title='Search verification';iframe.src=new URL('./search-verify.html#'+nonce,import.meta.url).href;
    iframe.style.cssText='border:0;width:100%;height:160px';
    const close=document.createElement('button');close.textContent='Cancel';close.type='button';
    let finished=false;
    const finish=(token,error)=>{if(finished)return;finished=true;clearTimeout(timer);window.removeEventListener('message',message);dialog.close();dialog.remove();error?reject(error):resolve(token);};
    const message=e=>{if(e.source!==iframe.contentWindow||e.origin!==location.origin||e.data?.nonce!==nonce)return;if(e.data.type==='park-search-token'&&typeof e.data.token==='string')finish(e.data.token);else if(e.data.type==='park-search-error')finish(null,new Error('Verification failed. Please try again.'));};
    const timer=setTimeout(()=>finish(null,new Error('Verification timed out. Please try again.')),90000);
    close.onclick=()=>finish(null,new Error('Search verification cancelled.'));
    dialog.addEventListener('cancel',e=>{e.preventDefault();close.click();});
    window.addEventListener('message',message);dialog.append(title,explanation,iframe,close);document.body.append(dialog);dialog.showModal();
  }).finally(()=>{pending=undefined;});
  return pending;
}
