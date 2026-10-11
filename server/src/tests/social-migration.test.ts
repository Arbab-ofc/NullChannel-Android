import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
const sql=readFileSync(new URL('../../../docs/supabase-migration-v13.sql',import.meta.url),'utf8');
describe('registered social migration security contracts',()=>{
 it('makes relationship mutation atomic with a canonical pair lock',()=>{expect(sql).toContain('pg_advisory_xact_lock');expect(sql).toContain('check(user_low<user_high)');expect(sql).toContain('friend_requests_pair');});
 it('enforces expiry on action using database time',()=>expect(sql).toContain('req.expires_at<=clock_timestamp()'));
 it('creates profile/default settings inside the Auth transaction',()=>{expect(sql).toContain('after insert on auth.users');expect(sql).toContain('insert into public.privacy_settings(user_id) values(new.id)');});
 it('denies browser roles RPC/table privileges',()=>{expect(sql).toContain('revoke all on public.%I from anon,authenticated');expect(sql).toContain('revoke all on function public.social_action(uuid,uuid,text,uuid),public.initialize_account_profile() from public,anon,authenticated');});
 it('serializes username cooldown at the database',()=>{expect(sql).toContain('before update on public.profiles');expect(sql).toContain("old.username_changed_at>clock_timestamp()-interval '30 days'");});
});
