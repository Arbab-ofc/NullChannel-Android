import {useEffect,useState} from 'react';
import {FileText,LoaderCircle,X,Send} from 'lucide-react';
export type PendingAttachment={file:File;kind:'image'|'file';status:'ready'|'uploading'|'uploaded'|'failed';progress?:number;error?:string};
export function fileSize(bytes:number){return bytes<1024?`${bytes} B`:bytes<1024*1024?`${(bytes/1024).toFixed(1)} KB`:`${(bytes/(1024*1024)).toFixed(1)} MB`;}
export function attachmentError(file:File,kind:'image'|'file') {
  if(file.size>(kind==='image'?5:15)*1024*1024)return `Maximum ${kind==='image'?5:15} MB.`;
  if(kind==='image'&&!['image/jpeg','image/png','image/webp'].includes(file.type))return 'Choose a JPEG, PNG or WebP image.';
  if(kind==='file'&&!/\.(pdf|txt|csv|zip|docx?|xlsx?|pptx?)$/i.test(file.name))return 'This file type is not supported.';
  return '';
}
export function AttachmentPreview({attachment,remove,send,disabled}:{attachment:PendingAttachment;remove:()=>void;send:()=>void;disabled:boolean}) {
  const [url,setUrl]=useState('');
  useEffect(()=>{if(attachment.kind!=='image'||attachmentError(attachment.file,'image')){setUrl('');return;}const objectURL=URL.createObjectURL(attachment.file);setUrl(objectURL);return()=>URL.revokeObjectURL(objectURL);},[attachment.file,attachment.kind]);
  const uploading=attachment.status==='uploading';
  return <section className="attachment-preview" aria-label="Attachment preview">
    {attachment.kind==='image'&&url?<img src={url} alt="Selected attachment"/>:<FileText aria-hidden="true"/>}
    <div className="attachment-preview__details"><strong>{attachment.file.name}</strong><span>{fileSize(attachment.file.size)} · {attachment.file.type||'File'}</span>
      <span role="status">{uploading?'Uploading':attachment.status==='uploaded'?'Upload confirmed':attachment.status==='ready'?'Ready to send':''}</span>
      {uploading && (attachment.progress!==undefined?<progress aria-label="File transfer progress" max={100} value={attachment.progress}/>:<LoaderCircle className="loading-spin" aria-label="Uploading attachment"/>)}
      {attachment.error&&<p role="alert">{attachment.error}</p>}
    </div>
    <button type="button" onClick={remove} disabled={uploading} aria-label="Remove attachment"><X/></button>
    {attachment.status==='ready'&&<button type="button" onClick={send} disabled={disabled} aria-label="Send attachment"><Send/></button>}
  </section>;
}
