import {nativeAndroid,nativeCalls,nativeOperation} from './native-calls';
let microphoneOwner:string|null=null;
export const acquireMicrophone=(owner:string)=>{if(microphoneOwner&&microphoneOwner!==owner)return false;microphoneOwner=owner;return true;};
export const releaseMicrophone=(owner:string)=>{if(microphoneOwner===owner)microphoneOwner=null;if(owner.startsWith('record:')&&nativeAndroid())nativeOperation('release-recording-lease',nativeCalls.microphoneLease({owner,acquire:false}));};
export const microphoneAvailable=(owner?:string)=>!microphoneOwner||microphoneOwner===owner;
