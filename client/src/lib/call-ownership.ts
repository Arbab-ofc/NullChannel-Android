let microphoneOwner:string|null=null;
export const acquireMicrophone=(owner:string)=>{if(microphoneOwner&&microphoneOwner!==owner)return false;microphoneOwner=owner;return true;};
export const releaseMicrophone=(owner:string)=>{if(microphoneOwner===owner)microphoneOwner=null;};
export const microphoneAvailable=(owner?:string)=>!microphoneOwner||microphoneOwner===owner;
