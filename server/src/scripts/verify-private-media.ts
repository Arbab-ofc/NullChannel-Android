/** Creates and deletes only its own tiny provider fixture. Never logs URLs or credentials. */
import {randomUUID} from 'node:crypto';
import {env} from '../config/env.js';
import {imagekit} from '../config/imagekit.js';
// A real 1x1 PNG exercises ImageKit's image delivery path; a plain text upload
// is not a valid proxy for supported chat attachments.
const fixture=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pXcAAAAASUVORK5CYII=','base64');
let fileId:string|undefined;
try{
 const uploaded=await imagekit.upload({file:fixture,fileName:`verify-${randomUUID()}.png`,folder:'/nullchannel/development-verification',isPrivateFile:true,isPublished:true,useUniqueFileName:false});fileId=uploaded.fileId;
 const details=await imagekit.getFileDetails(fileId);
 const publicResponse=await fetch(uploaded.url,{signal:AbortSignal.timeout(15000)});
 const pathSigned=imagekit.url({path:uploaded.filePath,signed:true,expireSeconds:60});
 const sourceSigned=imagekit.url({src:uploaded.url,signed:true,expireSeconds:60});
 const noExpirySigned=imagekit.url({path:uploaded.filePath,signed:true});
 const providerUrl=typeof details.url==='string'?details.url:'';
 const request=async(url:string)=>{const response=await fetch(url,{signal:AbortSignal.timeout(15000)});const body=(await response.text()).replace(/https?:\/\/\S+/g,'[URL]').replace(/[A-Za-z0-9_-]{32,}/g,'[TOKEN]').slice(0,180);return {status:response.status,statusText:response.statusText,ikError:response.headers.get('ik-error'),contentType:response.headers.get('content-type'),via:response.headers.get('via'),requestId:response.headers.get('x-request-id')??response.headers.get('x-ik-request-id'),body};};
 const [pathResult,sourceResult,noExpiryResult,providerUrlResult]=await Promise.all([request(pathSigned),request(sourceSigned),request(noExpirySigned),providerUrl?request(providerUrl):Promise.resolve({status:0,statusText:'no provider URL',server:null,contentType:null,via:null,requestId:null,body:''})]);
 const endpoint=new URL(env.IMAGEKIT_URL_ENDPOINT),returned=new URL(uploaded.url),pathUrl=new URL(pathSigned),sourceUrl=new URL(sourceSigned);
 const privateFile=details.isPrivateFile===true;
 const published=(details as unknown as {isPublished?:boolean}).isPublished===true;
 const delivered=pathResult.status>=200&&pathResult.status<300;
 if(publicResponse.ok||!privateFile||!delivered)process.exitCode=1;
 console.log(JSON.stringify({provider:'ImageKit',configuredEndpointMatchesUpload:uploaded.url.startsWith(env.IMAGEKIT_URL_ENDPOINT+'/'),providerReturnedUrlMatchesConfiguredEndpoint:providerUrl.startsWith(env.IMAGEKIT_URL_ENDPOINT+'/'),endpointPathDepth:endpoint.pathname.split('/').filter(Boolean).length,endpointHostMatchesUploadHost:endpoint.host===returned.host,fileMetadataExists:true,privateFileConfirmed:privateFile,published,providerPathMatchesReturnedUrl:returned.pathname.endsWith(uploaded.filePath),signedPathMatchesSourcePath:pathUrl.pathname===sourceUrl.pathname,publicStatus:publicResponse.status,pathSigned:pathResult,sourceSigned:sourceResult,noExpirySigned:noExpiryResult,providerReturnedUrl:providerUrlResult,privateAccessVerified:!publicResponse.ok&&delivered}));
}catch{console.log(JSON.stringify({provider:'ImageKit',verification:'failed',detail:'Upload or provider delivery unavailable; inspect credentials/connectivity without logging secrets.'}));process.exitCode=1;}
finally{if(fileId){try{await imagekit.deleteFile(fileId);let absent=false;try{await imagekit.getFileDetails(fileId);}catch(error){absent=((error as {statusCode?:number;$ResponseMetadata?:{statusCode?:number}}).statusCode??(error as {$ResponseMetadata?:{statusCode?:number}}).$ResponseMetadata?.statusCode)===404;}console.log(JSON.stringify({fixtureDeletionRequested:true,fixtureDeletionVerified:absent}));if(!absent)process.exitCode=1;}catch{console.log(JSON.stringify({fixtureDeletionVerified:false}));process.exitCode=1;}}}
