import axios from 'axios';
import { API_URL, IS_NATIVE_APP } from './constants';
import { mobileAccessToken } from './mobile-auth';
import { ensureSession } from './session';
export const api = axios.create({ baseURL: `${API_URL}/api`, withCredentials: true, timeout: 120000 });
api.interceptors.request.use(async config=>{
  if(IS_NATIVE_APP){
    config.withCredentials=false;
    const [guest,account]=await Promise.all([mobileAccessToken('guest'),mobileAccessToken('account')]);
    if(guest)config.headers.set('Authorization',`Bearer ${guest}`);
    if(account)config.headers.set('X-NC-Account-Token',account);
  }
  return config;
});
api.interceptors.response.use(response => response, async error => {
  const config = error.config;
  if(IS_NATIVE_APP&&error.response?.status===401&&config&&!config.mobileRetried){
    config.mobileRetried=true;
    let guest=await mobileAccessToken('guest',true);
    const account=await mobileAccessToken('account',true);
    if(!guest){
      try{await ensureSession();guest=await mobileAccessToken('guest');}catch{/* Keep the original API failure if mobile sessions are unavailable. */}
    }
    if(guest){config.headers.set('Authorization',`Bearer ${guest}`);if(account)config.headers.set('X-NC-Account-Token',account);return api.request(config);}
  }
  if (!IS_NATIVE_APP&&error.response?.status === 401 && config && !config.sessionRetried) {
    config.sessionRetried = true;
    await ensureSession();
    return api.request(config);
  }
  return Promise.reject(error);
});
