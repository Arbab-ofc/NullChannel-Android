import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { describe,it,expect } from 'vitest';
const exec=promisify(execFile);
const dsn=process.env.REGISTERED_TEST_DATABASE_URL;
/** Tests require the full migration chain in a separately prepared local fixture DB. */
describe.skipIf(!dsn)('registered real PostgreSQL ephemeral communication',()=>{
 for(const [file,label,timeout]of [['registered-match.sql','atomic matching, Ghost consent and persistent friendship',10000],['registered-rooms.sql','capacity and single-use friend invitations',10000],['registered-burn.sql','registered Burn compatibility',10000],['group-tools.sql','temporary polls, moderation and atomic invite tokens',10000],['match-realtime-timeout.sql','actual 60 second matchmaking timeout',75000],['identity-expiration.sql','privacy-aware identity and room-expiration notifications',10000]] as const){
  it(label,async()=>{const url=new URL(dsn!);if(!['localhost','127.0.0.1'].includes(url.hostname)||!url.pathname.startsWith('/nullchannel_test'))throw new Error('Requires isolated local nullchannel_test database');const result=await exec('psql',[dsn!,'-X','-v','ON_ERROR_STOP=1','-f',new URL('./sql/'+file,import.meta.url).pathname]);expect(result.stderr).toContain('PASS');},timeout);
 }
 it('serializes concurrent queue entry and cross-device proposal acceptance',async()=>{
  const url=new URL(dsn!);if(!['localhost','127.0.0.1'].includes(url.hostname)||!url.pathname.startsWith('/nullchannel_test'))throw new Error('Requires isolated local DB');
  const sql=async(query:string)=>(await exec('psql',[dsn!,'-X','-v','ON_ERROR_STOP=1','-At','-c',query])).stdout.trim();
  const ids=Array.from({length:4},()=>randomUUID());const list=ids.map(id=>"'"+id+"'").join(',');
  try{
   for(const id of ids)await sql(`insert into auth.users(id,raw_user_meta_data) values('${id}','{"username":"nc_test_${id.replaceAll('-','').slice(0,12)}"}');insert into nc_presence values('${id}',clock_timestamp()+interval '90 seconds');`);
   await Promise.all(ids.map(id=>sql(`select nc_match_start('${id}')`)));
   expect(await sql(`select count(*) from nc_match_reservations where account_id in (${list})`)).toBe('4');
   expect(await sql(`select count(distinct proposal_id) from nc_match_reservations where account_id in (${list})`)).toBe('2');
   const proposal=JSON.parse(await sql(`select row_to_json(p) from nc_match_proposals p where a='${ids[0]}' or b='${ids[0]}'`));
   await Promise.allSettled([sql(`select nc_match_respond('${proposal.a}','${proposal.id}',true,'${randomUUID().replaceAll('-','').slice(0,8)}')`),sql(`select nc_match_respond('${proposal.b}','${proposal.id}',true,'${randomUUID().replaceAll('-','').slice(0,8)}')`),sql(`select nc_match_respond('${proposal.a}','${proposal.id}',true,'${randomUUID().replaceAll('-','').slice(0,8)}')`)]);
   expect(await sql(`select count(distinct room_id) from nc_room_identities where account_id in ('${proposal.a}','${proposal.b}')`)).toBe('1');
  }finally{
   await sql(`delete from rooms where id in (select room_id from nc_room_identities where account_id in (${list}));delete from auth.users where id in (${list});`);
  }
 },15000);
});
