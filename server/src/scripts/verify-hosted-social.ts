import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
dotenv.config({path:new URL('../../.env',import.meta.url),quiet:true});
const url=process.env.SUPABASE_URL!,key=process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const origin=process.env.CLIENT_URL??'http://localhost:5173',base=process.env.NULLCHANNEL_LOCAL_API??'http://localhost:5050/api';
const suffix=randomUUID().replaceAll('-','').slice(0,10),password=`NcqA-${randomUUID()}!7`;
type Fixture={id:string;email:string;username:string;cookie:string};
const fixtures:Fixture[]=[];const result:Record<string,string>={};
async function request(f:Fixture,path:string,method='GET',body?:unknown){const r=await fetch(base+path,{method,headers:{Origin:origin,Cookie:f.cookie,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await r.json() as any;if(!r.ok||data.success===false)throw Error(`Hosted workflow ${method} ${path} failed (${r.status}, ${data.error?.code??'unknown'}).`);return data.data;}
async function fixture(letter:'a'|'b'){
 const username=`ncqa${letter}${suffix}`.slice(0,24),email=`${username}@example.invalid`;
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{username}});if(created.error||!created.data.user)throw Error('Could not create isolated confirmed test account');
 const user=created.data.user;const login=await fetch(base+'/account/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email,password})});const payload=await login.json() as any;if(!login.ok||!payload.success)throw Error(`Hosted login failed (${login.status}).`);
 const cookies=login.headers.getSetCookie().map(value=>value.split(';')[0]).filter(value=>value.startsWith('nc_account_')).join('; ');if(!cookies)throw Error('Account cookie was not issued');
 const f={id:user.id,email,username,cookie:cookies};fixtures.push(f);return f;
}
try{
 const a=await fixture('a'),b=await fixture('b');
 const profile=await request(a,'/account/me');if(profile.profile?.username!==a.username)throw Error('Profile initializer did not persist the test username');result.profile='passed';
 await request(a,'/account/privacy','PUT',{ghost_mode:false,presence_visibility:'friends'});const settings=await request(a,'/account/me');if(settings.profile.privacy.ghost_mode!==false)throw Error('Privacy preference did not persist');result.privacy='passed';
 await request(a,'/social/requests','POST',{username:b.username});const incoming=await request(b,'/social/requests');const row=incoming.find((item:any)=>item.direction==='incoming'&&item.profile?.username===a.username);if(!row)throw Error('Friend request was not delivered');await request(b,`/social/requests/${row.id}/accept`,'POST',{});const friends=await request(a,'/social/friends');if(!friends.some((friend:any)=>friend.username===b.username))throw Error('Friendship did not persist');result.friendship='passed';
 await request(a,'/registered/invitations','POST',{username:b.username});const invitations=await request(b,'/registered/invitations');const direct= invitations.find((item:any)=>item.expires_at);if(!direct)throw Error('Offline friend invitation was not persisted');const accepted=await request(b,`/registered/invitations/${direct.id}/accept`,'POST',{});if(!accepted.code)throw Error('Accepted invitation did not create a temporary room');const activeB=await request(b,'/registered/rooms');if(!activeB.some((room:any)=>room.rooms?.code===accepted.code))throw Error('Direct room membership was not persisted');await request(a,`/registered/rooms/${accepted.code}/terminate`,'POST',{});result.direct='passed';
 const group=await request(a,'/registered/rooms','POST',{kind:'group',name:`QA ${suffix}`,description:'Scoped live verification',minutes:15});const code=group.code;if(!code)throw Error('Private group creation failed');const invite=await request(a,`/registered/rooms/${code}/invite-links`,'POST',{minutes:5,uses:1});await request(b,'/registered/invite-links/consume','POST',{token:invite.token});const poll=await request(a,`/registered/rooms/${code}/polls`,'POST',{question:'Fixture poll?',options:['yes','no'],minutes:5});await request(b,`/registered/rooms/${code}/polls/${poll.id}/vote`,'POST',{choice:0});const voted=await request(b,`/registered/rooms/${code}/polls`);if(!voted.some((item:any)=>item.id===poll.id&&item.myChoice===0))throw Error('Group poll vote did not persist');await request(a,`/registered/rooms/${code}/terminate`,'POST',{});result.group='passed';
 const publicRoom=await request(a,'/registered/rooms','POST',{kind:'public',name:`Public QA ${suffix}`,minutes:15});const directory=await request(b,'/registered/explore?search='+encodeURIComponent(suffix));if(!directory.rooms?.some((room:any)=>room.room_name===`Public QA ${suffix}`))throw Error('Public room not discoverable');await request(b,`/registered/rooms/${publicRoom.code}/join`,'POST',{});await request(a,`/registered/rooms/${publicRoom.code}/terminate`,'POST',{});result.discovery='passed';
 const ended=await request(a,'/registered/sessions/end','POST',{});if(!ended.accessRevoked)throw Error('Session termination did not report access revocation');result.sessionCleanup='passed';
 console.log(JSON.stringify(result));
}catch(error){console.log(JSON.stringify({verified:result,blocked:error instanceof Error?error.message:'Hosted fixture failed'}));process.exitCode=1;}
finally{
 for(const f of fixtures){const owned=await admin.from('nc_room_identities').select('room_id').eq('account_id',f.id);if(owned.error)continue;const ids=[...new Set((owned.data??[]).map(row=>row.room_id))];if(ids.length)await admin.from('rooms').delete().in('id',ids);}
 for(const f of fixtures){await admin.auth.admin.deleteUser(f.id);}
}
