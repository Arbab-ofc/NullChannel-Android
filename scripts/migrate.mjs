import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import dotenv from 'dotenv';
dotenv.config({path:'server/.env',quiet:true});
const dsn=process.env.NULLCHANNEL_MIGRATION_DSN||process.env.DATABASE_URL;
if(!dsn){console.error('NULLCHANNEL_MIGRATION_DSN is absent. Supabase API credentials cannot execute SQL migrations. Provide an existing-project PostgreSQL DSN through the local environment.');process.exit(1);}
const connection=new URL(dsn);
if(!['postgres:','postgresql:'].includes(connection.protocol))throw Error('A PostgreSQL URI is required.');
const env={...process.env,PGHOST:connection.hostname,PGPORT:connection.port||'5432',PGUSER:decodeURIComponent(connection.username),PGPASSWORD:decodeURIComponent(connection.password),PGDATABASE:decodeURIComponent(connection.pathname.slice(1)),PGCONNECT_TIMEOUT:'15',PGSSLMODE:connection.searchParams.get('sslmode')||(connection.hostname==='localhost'?'prefer':'require')};
const sql=(text)=>{try{return execFileSync('psql',['-X','-v','ON_ERROR_STOP=1','-At'],{env,input:text,encoding:'utf8',maxBuffer:8*1024*1024});}catch{throw Error('SQL execution failed. The transaction rolled back; credentials and server errors are omitted. Inspect the database separately.');}};
const catalog=sql(`select json_build_object('database',current_database(),'base_rooms',to_regclass('public.rooms') is not null,'burn_rpc',to_regprocedure('public.mark_message_seen(uuid,uuid,text)') is not null,'cleanup_trigger',exists(select 1 from pg_trigger where tgrelid=to_regclass('public.messages') and tgname='queue_message_media' and tgenabled in ('O','A')),'history',to_regclass('public.nullchannel_schema_migrations') is not null);`);
const status=JSON.parse(catalog.trim());console.log(JSON.stringify(status));
if(!status.base_rooms||!status.burn_rpc||!status.cleanup_trigger)throw Error('Existing v12 prerequisites are missing. Inspect the configured schema; this script does not install, reset or backfill legacy schema.');
let applied=[];if(status.history)applied=JSON.parse(sql(`select coalesce(json_agg(json_build_object('version',version,'sha256',sha256)),'[]') from public.nullchannel_schema_migrations;`).trim());
const files=readdirSync('docs').filter(f=>/^supabase-migration-v\d+\.sql$/.test(f)&&Number(f.match(/\d+/)[0])>=13).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
for(const file of files){
 const version=Number(file.match(/\d+/)[0]);const source=readFileSync('docs/'+file,'utf8');const sha256=createHash('sha256').update(source).digest('hex');const previous=applied.find(x=>x.version===version);
 if(previous){if(previous.sha256!==sha256)throw Error(`Migration v${version} has changed since application. Do not overwrite history; create a new forward migration.`);console.log(`v${version}: already recorded`);continue;}
 console.log(`v${version}: ${process.argv.includes('--apply')?'applying':'pending'} (${file})`);
 if(!process.argv.includes('--apply'))continue;
 const record=`create table if not exists public.nullchannel_schema_migrations(version integer primary key,sha256 text not null,applied_at timestamptz not null default clock_timestamp());\nalter table public.nullchannel_schema_migrations enable row level security;\nrevoke all on public.nullchannel_schema_migrations from anon,authenticated;\ngrant all on public.nullchannel_schema_migrations to service_role;\ninsert into public.nullchannel_schema_migrations(version,sha256) values(${version},'${sha256}');\n`;
 if(!/^begin;/mi.test(source)||!/\bcommit;\s*$/i.test(source))throw Error(`${file} must contain one transaction.`);
 sql(source.replace(/\bcommit;\s*$/i,record+'commit;'));console.log(`v${version}: committed and recorded`);
}
if(!process.argv.includes('--apply'))console.log('Inspection only. Use --apply for the reviewed additive migration sequence.');
