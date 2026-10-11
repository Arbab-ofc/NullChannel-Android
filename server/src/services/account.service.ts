import { createClient, type Session } from '@supabase/supabase-js';
import type { Response } from 'express';
import { env, isProd } from '../config/env.js';
import { avatarUrl } from './avatar.service.js';
import { supabase } from '../config/supabase.js';

export const accountCookie = () => isProd ? '__Host-nc_account_access' : 'nc_account_access';
export const accountRefreshCookie = () => isProd ? '__Host-nc_account_refresh' : 'nc_account_refresh';
export const cookieValue = (header: string | undefined, name: string) => {
 const value = header?.split(';').map(v=>v.trim()).find(v=>v.startsWith(`${name}=`))?.slice(name.length+1);
 return value && value.length<8192 && /^[A-Za-z0-9._-]+$/.test(value) ? value : undefined;
};
// An isolated Auth client per request prevents session mutation on the shared service-role client.
export const accountAuthClient = () => createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
export const setAccountCookies = (res:Response, session:Session) => {
 const options={httpOnly:true,secure:isProd,sameSite:'strict' as const,path:'/'};
 res.cookie(accountCookie(),session.access_token,{...options,maxAge:session.expires_in*1000});
 res.cookie(accountRefreshCookie(),session.refresh_token,{...options,maxAge:30*86400000});
};
export const clearAccountCookies = (res:Response) => {
 for(const name of [accountCookie(),accountRefreshCookie()]) res.clearCookie(name,{httpOnly:true,secure:isProd,sameSite:'strict',path:'/'});
};
export const verifyAccountCookie = async (header:string|undefined,allowDeleting=false) => {
 const token=cookieValue(header,accountCookie()); if(!token) return null;
 const {data,error}=await supabase.auth.getUser(token);if(error||!data.user)return null;
 const profile=await supabase.from('profiles').select('deletion_pending').eq('id',data.user.id).maybeSingle();if(profile.error)throw profile.error;
 if(!profile.data||profile.data.deletion_pending&&!allowDeleting)return null;return data.user;
};
export const profileFor = async(id:string) => {
 const {data,error}=await supabase.from('profiles').select('username,display_name,bio,avatar_file_id,created_at,username_changed_at,deletion_pending').eq('id',id).single();
 if(error) throw error;
 const settings=await supabase.from('privacy_settings').select('*').eq('user_id',id).single(); if(settings.error) throw settings.error;
 const {avatar_file_id,...profile}=data;const {user_id: _owner,...privacy}=settings.data;void _owner;
 return {...profile,avatar_url:avatarUrl(data.username,avatar_file_id),privacy};
};
export const normalizedUsername = (value:string) => value.toLowerCase();
export const reservedUsernames = new Set(['admin','administrator','nullchannel','support','system','moderator','api','root']);
export const validUsername = (value:string) => /^[A-Za-z0-9_]{3,24}$/.test(value) && !reservedUsernames.has(normalizedUsername(value));
export const validPassword = (value:string) => value.length>=12 && value.length<=128;
