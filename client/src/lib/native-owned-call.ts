import type {Socket} from 'socket.io-client';
import {VoiceCall,callIsActive,type CallView,type Invitation,type CallPhase} from './voice-call';
import {nativeCalls,listenNativeEvents,nativeOperation} from './native-calls';
import {API_URL} from './constants';
import {acquireMicrophone,releaseMicrophone} from './call-ownership';
/** React observes Android state. No Android SDP, ICE, renewal or call Socket.IO here. */
export class NativeOwnedCall extends VoiceCall {
 private nativeView:CallView={phase:'idle',callId:null,peerName:'',roomName:'',muted:false,playbackBlocked:false,connectedAt:null,message:'',accepting:false};
 private observers=new Set<()=>void>();
 private remove:(()=>void)|null=null;
 private attached=false;
 private nativeOwner='';
 private sender={senderId:'',senderName:'Anonymous'};
 override snapshot=()=>this.nativeView;
 override subscribe=(listener:()=>void)=>{this.observers.add(listener);return()=>{this.observers.delete(listener);};};
 constructor(socket:Socket,code:string){super(socket,code);}
 adopt(data:Record<string,unknown>){if(data.roomCode!==this.roomCode)return;if(data.ownershipId)this.nativeOwner=String(data.ownershipId);const previous=this.nativeView.callId;if(previous)releaseMicrophone(`call:${previous}`);const phase=String(data.phase) as CallPhase;this.nativeView={...this.nativeView,phase,callId:String(data.callId||'')||null,peerName:String(data.peerName||'Anonymous caller'),roomName:String(data.roomName||'NullChannel'),muted:data.muted===true,accepting:data.accepting===true,connectedAt:Number(data.connectedAt)||null,message:String(data.message||'')};if(data.kind==='account'||data.kind==='guest')this.sessionKind=data.kind;if(this.nativeView.callId&&callIsActive(phase))acquireMicrophone(`call:${this.nativeView.callId}`);for(const listener of this.observers)listener();}
 override attach(){if(this.attached)return;this.attached=true;void listenNativeEvents(event=>{if(event.type==='native-call')this.adopt(event as unknown as Record<string,unknown>);}).then(listener=>{if(!this.attached)void listener.remove();else this.remove=()=>{void listener.remove();};});void nativeCalls.signalingSnapshot().then(data=>this.adopt(data));}
 override setJoinInfo(senderId:string,senderName:string,kind:'guest'|'account'='guest'){this.sessionKind=kind;this.sender={senderId,senderName};}
 override setVisible(visibleRoom:boolean){this.nativeView={...this.nativeView,visibleRoom};for(const listener of this.observers)listener();}
 override setRoom(eligible:boolean){if(!eligible&&callIsActive(this.nativeView.phase))this.end();}
 private async begin(callId?:string){if(!this.guard())return;try{const state=await nativeCalls.signalingStart({baseUrl:API_URL,roomCode:this.roomCode,kind:this.sessionKind,...this.sender,...(callId?{callId}:{})});this.adopt(state);}catch(error){if(!callIsActive(this.nativeView.phase)){this.nativeView={...this.nativeView,phase:'failed',message:error instanceof Error&&error.message.includes('permission')?'Microphone permission denied.':'Native call signaling is unavailable.'};for(const listener of this.observers)listener();}}}
 override async invite(){await this.begin();}
 override receiveInvitation(invitation:Invitation){if(invitation.expiresAt&&invitation.expiresAt<=Date.now())return;void this.begin(invitation.callId);}
 override async accept(){try{await nativeCalls.signalingCommand({action:'answer',callId:this.nativeOwner||this.nativeView.callId||''});}catch(error){this.nativeView={...this.nativeView,message:error instanceof Error&&error.message.includes('permission')?'Microphone permission denied.':'Unable to answer the call.',accepting:false};for(const listener of this.observers)listener();}}
 override async reject(){await nativeCalls.signalingCommand({action:'decline',callId:this.nativeOwner||this.nativeView.callId||''});}
 override end(){nativeOperation('native-hangup',nativeCalls.signalingCommand({action:'end',callId:this.nativeOwner||this.nativeView.callId||''}));}
 override mute(){nativeOperation('native-mute',nativeCalls.signalingCommand({action:'mute',callId:this.nativeOwner||this.nativeView.callId||''}));}
 override setAudioRoutes(audioRoutes:Array<{id:string;label:string}>,selectedRoute:string){this.nativeView={...this.nativeView,audioRoutes,selectedRoute};for(const listener of this.observers)listener();}
 override audioInterrupted(available:boolean){this.nativeView={...this.nativeView,audioInterrupted:!available};for(const listener of this.observers)listener();}
 override async route(route:string){try{const state=await nativeCalls.routes({route});this.setAudioRoutes(state.routes,state.selected);}catch{this.nativeView={...this.nativeView,message:'Audio output is unavailable.'};for(const listener of this.observers)listener();}}
 override async enableBluetooth(){const permission=await nativeCalls.bluetoothPermission();if(permission.granted){const routes=await nativeCalls.routes({});this.setAudioRoutes(routes.routes,routes.selected);}}
 override rejoin(){/* Native owner joins and reconciles its own authenticated transport. */}
 override networkChanged(){/* Native ConnectivityManager callback owns recovery. */}
 override async restoreNative(){this.adopt(await nativeCalls.signalingSnapshot());}
 override play(){/* Native WebRTC renders audio without browser autoplay. */}
 override dismiss(){if(callIsActive(this.nativeView.phase))return;this.nativeView={...this.nativeView,phase:'idle',callId:null,message:''};for(const listener of this.observers)listener();}
 override dispose(){this.attached=false;this.remove?.();this.remove=null;this.observers.clear();if(this.nativeView.callId&&!callIsActive(this.nativeView.phase))releaseMicrophone(`call:${this.nativeView.callId}`);}
}
