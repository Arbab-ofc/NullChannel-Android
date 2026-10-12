import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
const routes=[];
for(const file of readdirSync('server/src/routes').filter(f=>f.endsWith('.ts'))){
 const source=readFileSync(`server/src/routes/${file}`,'utf8');
 for(const match of source.matchAll(/router\.(get|post|put|patch|delete)\('([^']+)'/g)) routes.push({method:match[1],route:'/api'+match[2],source:file});
 for(const match of source.matchAll(/\['(get|post|put|patch|delete)','([^']+)'/g)) routes.push({method:match[1],route:'/api'+match[2],source:file});
}
const fields={
 '/account/signup':{username:{type:'string',pattern:'^[A-Za-z0-9_]{3,24}$'},email:{type:'string',format:'email'},password:{type:'string',minLength:12,maxLength:128}},
 '/account/login':{email:{type:'string',format:'email'},password:{type:'string'}},
 '/account/forgot-password':{email:{type:'string',format:'email'}},
 '/account/reset-password':{password:{type:'string',minLength:12},accessToken:{type:'string'},refreshToken:{type:'string'}},
 '/account/profile':{display_name:{type:'string',maxLength:60},bio:{type:'string',maxLength:240},username:{type:'string',minLength:3,maxLength:24}},
 '/account/password':{current_password:{type:'string'},password:{type:'string',minLength:12}},
 '/account/delete':{password:{type:'string'}},
 '/social/requests':{username:{type:'string'}},
 '/account/privacy':{profile_visibility:{enum:['registered','friends','private']},discoverability:{enum:['registered','friends','nobody']},friend_requests:{enum:['registered','nobody']},presence_visibility:{enum:['registered','friends','nobody']},invitations:{enum:['registered','friends','nobody']},matchmaking:{type:'boolean'},ghost_mode:{type:'boolean'},notify_friend_requests:{type:'boolean'},notify_invitations:{type:'boolean'},notify_matches:{type:'boolean'},notify_expiration:{type:'boolean'}},
 '/registered/rooms/:code/polls':{question:{type:'string',minLength:1,maxLength:160},options:{type:'array',minItems:2,maxItems:8,items:{type:'string',minLength:1,maxLength:80}},minutes:{type:'integer',minimum:1,maximum:1440}},
 '/registered/rooms/:code/polls/:id/vote':{choice:{type:'integer',minimum:0,maximum:7}},
 '/registered/rooms/:code/moderation':{senderId:{type:'string'},action:{enum:['mute','unmute','kick','ban','moderator','member']},minutes:{type:'integer',minimum:1,maximum:1440}},
 '/registered/rooms/:code/invite-links':{minutes:{type:'integer',minimum:1,maximum:1440},uses:{type:'integer',minimum:1,maximum:50}},
 '/registered/invite-links/consume':{token:{type:'string',pattern:'^[0-9a-f]{64}$'}},
 '/registered/rooms/:code/report':{senderId:{type:'string',format:'uuid'},reason:{enum:['spam','harassment','unsafe_content','other']}},
 '/notifications':{id:{type:'string',format:'uuid'},all:{type:'boolean'}},

 '/rooms':{senderName:{type:'string',minLength:2,maxLength:24},roomName:{type:'string',minLength:2,maxLength:40},roomType:{enum:['private','group']},expiresInMinutes:{enum:[15,60,360,1440]}},
 '/registered/rooms':{kind:{enum:['public','group']},name:{type:'string',minLength:1,maxLength:80},description:{type:'string',maxLength:500},category:{enum:['General','Technology','Gaming','Music','Study','Entertainment','Anonymous Discussions','Other']},tags:{type:'array',items:{type:'string',maxLength:24},maxItems:5},capacity:{type:'integer',minimum:2,maximum:50},minutes:{enum:[15,60,360,1440]}},
 '/registered/invitations':{username:{type:'string'},code:{type:'string',minLength:8,maxLength:8}},
 '/match/rooms/:code/consent':{purpose:{enum:['reveal','connect']},accept:{type:'boolean'}},
 '/rooms/:code/extend':{extendByMinutes:{type:'integer',minimum:5,maximum:1440}},
 '/rooms/:code/pin':{messageId:{type:['string','null'],format:'uuid'}},
 '/rooms/:code/messages/:messageId':{content:{type:'string',maxLength:4000}},
 '/rooms/:code/messages/:messageId/reactions':{senderName:{type:'string'},emoji:{enum:['👍','😂','🔥','❤️','👀']}},
};
const example=(schema)=>schema.enum?.[0]??(schema.type==='boolean'?true:schema.type==='integer'?schema.minimum??20:schema.type==='array'?[]:schema.format==='email'?'fixture@example.invalid':schema.format==='uuid'?'00000000-0000-4000-8000-000000000000':schema.minLength>=12?'Example passphrase 42':'example');
const paths={};
for(const r of routes){
 const path=r.route.replace(/:([A-Za-z]+)/g,'{$1}'); const suffix=r.route.slice(4);
 const publicRoute=['/health','/health/db','/session','/account/signup','/account/login','/account/forgot-password','/account/reset-password','/account/refresh','/account/logout'].includes(suffix);
 const registered=/^\/(account|social|notifications|registered|match)(\/|$)/.test(suffix);
 const group=registered?(suffix.split('/')[1]):suffix.startsWith('/media')?'media':suffix.startsWith('/rooms')?'rooms':'operations';
 const parameters=[...r.route.matchAll(/:([A-Za-z]+)/g)].map(m=>({name:m[1],in:'path',required:true,schema:{type:'string'},description:m[1]==='action'?'Allowed action is constrained by this route; consult the request example.':m[1]==='senderId'?'Compatibility field. The server ignores supplied identity and uses the cookie session.':'Resource identifier.'}));
 if(r.method==='get'&&['/registered/explore','/social/search'].includes(suffix))parameters.push(...(suffix.includes('explore')?['search','category','sort','page']:['q']).map(name=>({name,in:'query',schema:{type:'string'}})));
 const response={type:'object',required:['success','data','error'],properties:{success:{type:'boolean'},data:{},error:{type:['object','null'],properties:{code:{type:'string'},message:{type:'string'}}}}};
 const op={operationId:r.method+'_'+suffix.replace(/[^A-Za-z0-9]/g,'_'),tags:[group],summary:r.method.toUpperCase()+' '+suffix,description:`Implemented in server/src/routes/${r.source}. ${publicRoute?'No signed-in account required.':registered?'Requires a verified registered-account cookie.':'Requires a verified guest or authorized registered room session.'} Mutations require the configured Origin header. Room resources are temporary; expired access is rejected.`,security:publicRoute?[]:[{[registered?'accountCookie':'guestCookie']:[]}],parameters,responses:{'200':{description:'Successful operation (JSON envelope).',content:{'application/json':{schema:response}}},'400':{description:'Invalid request.'},'401':{description:'Missing or expired authentication.'},'403':{description:'Permission denied or Origin rejected.'},'404':{description:'Resource missing or expired.'},'409':{description:'State conflict.'},'429':{description:'Rate limit exceeded; retry later.'},'500':{description:'Sanitized internal error.'},'503':{description:'Account verification temporarily unavailable; credentials are retained.'}}};
 if(r.method==='post'&&['/rooms','/account/signup','/social/requests','/registered/rooms','/registered/invitations'].includes(suffix)){op.responses['201']=op.responses['200'];delete op.responses['200'];}
 if(['post','patch','put','delete'].includes(r.method)&&fields[suffix]){
 const properties=fields[suffix];op.requestBody={required:true,content:{'application/json':{schema:{type:'object',properties},example:Object.fromEntries(Object.entries(properties).map(([key,value])=>[key,example(value)]))}}};
 }
 if(suffix==='/media/upload')op.requestBody={required:true,content:{'multipart/form-data':{schema:{type:'object',required:['roomCode','type','file'],properties:{roomCode:{type:'string',minLength:8,maxLength:8},type:{enum:['image','voice','file']},file:{type:'string',format:'binary'}}}}}};
 if(suffix==='/account/avatar'&&r.method==='post')op.requestBody={required:true,content:{'multipart/form-data':{schema:{type:'object',required:['file'],properties:{file:{type:'string',format:'binary',description:'PNG/JPEG/GIF/WebP image; maximum 2 MiB, content signature validated.'}}}}}};
 if(suffix==='/media/files/:fileId'){op.parameters.push({name:'open',in:'query',schema:{enum:['1']},description:'Required for explicit recipient opening of view-once media. Consumption is atomic.'});op.responses['200']={description:'Authorized bounded binary media, Cache-Control: no-store.',content:{'application/octet-stream':{schema:{type:'string',format:'binary'}}}};}
 if(suffix==='/cleanup'){op.security=[{cleanupSecret:[]}];}
 paths[path]??={};paths[path][r.method]=op;r.auth=publicRoute?'Public':registered?'Registered':'Guest or registered room';r.tag=group;r.operationId=op.operationId;r.description=op.description;r.parameters=op.parameters;r.requestBody=op.requestBody;r.responses=op.responses;r.example=op.requestBody?.content?.['application/json']?.example??{};
}
const spec={openapi:'3.1.0',info:{title:'NullChannel API',version:'1.0.0',description:'Temporary conversations, persistent relationships. Generated route inventory; live migration verification status is documented separately.'},servers:[{url:'/'}],components:{securitySchemes:{cleanupSecret:{type:'apiKey',in:'header',name:'x-cleanup-secret'},guestCookie:{type:'apiKey',in:'cookie',name:'nc_access',description:'Production cookie name __Host-nc_access.'},accountCookie:{type:'apiKey',in:'cookie',name:'nc_account_access',description:'Production cookie name __Host-nc_account_access.'}}},paths};
const outputs={'docs/openapi.yaml':JSON.stringify(spec,null,2)+'\n','client/public/openapi.yaml':JSON.stringify(spec,null,2)+'\n','client/public/endpoint-reference.json':JSON.stringify(routes,null,2)+'\n'};
for(const [file,content]of Object.entries(outputs)){if(process.argv.includes('--check')){if(readFileSync(file,'utf8')!==content)throw Error(`${file} differs from actual routes. Run npm run docs:generate.`);}else writeFileSync(file,content);}
console.log(`${routes.length} actual HTTP operations documented; ${process.argv.includes('--check')?'consistency verified':'generated'}.`);
