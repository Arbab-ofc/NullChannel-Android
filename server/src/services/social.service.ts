import { avatarUrl } from './avatar.service.js';
import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
export const safeProfileFields='username,display_name,bio,avatar_url';
export const friendIds=async(id:string)=>{
 const {data,error}=await supabase.from('friendships').select('user_low,user_high').or(`user_low.eq.${id},user_high.eq.${id}`);if(error)throw error;
 return (data??[]).map(row=>row.user_low===id?row.user_high:row.user_low);
};
export const blockedIds=async(id:string)=>{
 const {data,error}=await supabase.from('user_blocks').select('blocker_id,blocked_id').or(`blocker_id.eq.${id},blocked_id.eq.${id}`);if(error)throw error;
 return(data??[]).map(row=>row.blocker_id===id?row.blocked_id:row.blocker_id);
};
export const eligibleProfile=async(viewer:string,target:string,search=false)=>{
 if((await blockedIds(viewer)).includes(target))return null;
 const friends=await friendIds(viewer);const {data,error}=await supabase.from('privacy_settings').select('profile_visibility,discoverability,presence_visibility').eq('user_id',target).single();if(error)throw error;
 if(search&&(data.discoverability==='nobody'||data.discoverability==='friends'&&!friends.includes(target)))return null;
 const privateProfile=data.profile_visibility==='private'||data.profile_visibility==='friends'&&!friends.includes(target);
 const profile=await supabase.from('profiles').select('username,display_name,bio,avatar_file_id').eq('id',target).single();if(profile.error)throw profile.error;const {avatar_file_id,...visible}=profile.data;return privateProfile?{username:visible.username}:{...visible,avatar_url:avatarUrl(visible.username,avatar_file_id)};
};
export const targetByUsername=async(username:string)=>{const {data,error}=await supabase.from('profiles').select('id,username').eq('normalized_username',username.toLowerCase()).maybeSingle();if(error)throw error;return data;};
export const socialAction=async(actor:string,target:string,action:string,request?:string)=>{
 const {data,error}=await supabase.rpc('social_action',{p_actor:actor,p_target:target,p_action:action,p_request:request??null,p_ttl_days:env.FRIEND_REQUEST_TTL_DAYS});
 if(error)return {error:true,data:null};return{error:false,data};
};
