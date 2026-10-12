import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {beforeAll,describe,it,expect} from 'vitest';
const exec=promisify(execFile),dsn=process.env.REGISTERED_TEST_DATABASE_URL;
const sql=async(query:string)=>{const url=new URL(dsn!);if(!['localhost','127.0.0.1'].includes(url.hostname)||!url.pathname.startsWith('/nullchannel_test'))throw Error('Isolated local database required');return (await exec('psql',[dsn!,'-X','-At','-v','ON_ERROR_STOP=1','-c',query])).stdout.trim();};
describe.skipIf(!dsn)('direct invitation pair enforcement in real local PostgreSQL',()=>{
 beforeAll(()=>{const url=new URL(dsn!);if(!['localhost','127.0.0.1'].includes(url.hostname)||!url.pathname.startsWith('/nullchannel_test'))throw Error('Isolated local database required');});
 it('enforces transitions, reverse directions, expiry and unrelated-pair independence',async()=>{const result=await exec('psql',[dsn!,'-X','-v','ON_ERROR_STOP=1','-f',new URL('./sql/direct-pairs.sql',import.meta.url).pathname]);expect(result.stderr).toContain('PASS pair');});
 it('serializes simultaneous opposite-direction invitations and duplicate acceptance',async()=>{
  const [a,b]=[randomUUID(),randomUUID()],usernameA='pair_'+a.replaceAll('-','').slice(0,12),usernameB='pair_'+b.replaceAll('-','').slice(0,12);
  try{
   await sql(`insert into auth.users(id,raw_user_meta_data) values('${a}','{"username":"${usernameA}"}'),('${b}','{"username":"${usernameB}"}');insert into friendships(user_low,user_high) values(least('${a}'::uuid,'${b}'::uuid),greatest('${a}'::uuid,'${b}'::uuid));`);
   const results=await Promise.allSettled([sql(`select nc_invitation_create('${a}','${usernameB}')`),sql(`select nc_invitation_create('${b}','${usernameA}')`)]);
   expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
   const invitation=JSON.parse(await sql(`select row_to_json(i) from nc_invitations i where sender_id in ('${a}','${b}') and recipient_id in ('${a}','${b}')`));
   const accepted=await Promise.allSettled([sql(`select nc_invitation_respond('${invitation.recipient_id}','${invitation.id}',true,'PAIRCNC1')`),sql(`select nc_invitation_respond('${invitation.recipient_id}','${invitation.id}',true,'PAIRCNC2')`)]);
   expect(accepted.filter(r=>r.status==='fulfilled')).toHaveLength(1);
   expect(await sql(`select count(distinct room_id) from nc_room_identities where account_id in ('${a}','${b}')`)).toBe('1');
  }finally{await sql(`delete from rooms where id in(select room_id from nc_room_identities where account_id in('${a}','${b}'));delete from auth.users where id in('${a}','${b}');`);}
 });
});
