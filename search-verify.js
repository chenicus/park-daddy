import {TURNSTILE_SITE_KEY} from './search-config.js?v=2';
const nonce=location.hash.slice(1),status=document.getElementById('status');
function send(type,token){const message={type,token,nonce};if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(message));else if(parent!==window)parent.postMessage(message,location.origin);}
if(!TURNSTILE_SITE_KEY){status.textContent='Search verification is being set up. Please try again later.';send('park-search-error');}
else{
  const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
  script.onload=()=>window.turnstile.render('#challenge',{sitekey:TURNSTILE_SITE_KEY,action:'park-search',theme:'auto',callback:token=>{status.textContent='Verified. Returning to search…';send('park-search-token',token);},'error-callback':()=>{status.textContent='Verification failed. Please try again.';send('park-search-error');},'expired-callback':()=>{status.textContent='Verification expired. Please try again.';send('park-search-error');}});
  script.onerror=()=>{status.textContent='Could not load verification. Please check your connection.';send('park-search-error');};document.head.append(script);
}
