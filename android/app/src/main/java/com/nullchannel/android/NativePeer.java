package com.nullchannel.android;
import android.content.Context;
import android.content.Intent;
import com.getcapacitor.JSObject;
import org.json.JSONArray;
import org.json.JSONObject;
import org.webrtc.*;
import org.webrtc.audio.JavaAudioDeviceModule;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Process-scoped native media. Activity/WebView destruction does not own it. */
final class NativePeer {
  static volatile String callId="",roomCode="";
  private static final ExecutorService executor=Executors.newSingleThreadExecutor();
  private static PeerConnectionFactory factory;
  private static JavaAudioDeviceModule module;
  private static PeerConnection peer;
  private static AudioSource source;
  private static AudioTrack track;
  private static AudioTrack remoteTrack;
  private static final java.util.concurrent.ScheduledExecutorService statsExecutor=Executors.newSingleThreadScheduledExecutor();
  private static java.util.concurrent.ScheduledFuture<?> statsJob;
  private static java.util.concurrent.ScheduledFuture<?> deadlineJob;
  private static int outageMs=10000;
  private static boolean muted=false,focus=true;
  private static NativeAudioController audio;
  private static Context context;
  private static volatile int revision=0;
  private static volatile String state="idle";
  static CompletableFuture<Void> start(Context supplied,String id,String room,JSONArray servers,int connectMs,int disconnectMs){return task(()->{
    if(!callId.isEmpty()){if(callId.equals(id))return;throw new IllegalStateException("Another call owns the microphone");}
    if(!NativeMicrophoneLease.claim("call:"+id))throw new IllegalStateException("The recorder owns the microphone");context=supplied.getApplicationContext();callId=id;roomCode=room;outageMs=Math.max(1000,Math.min(30000,disconnectMs));
    try {
      androidx.core.content.ContextCompat.startForegroundService(context,new Intent(context,CallForegroundService.class).putExtra("callId",id));
      audio=new NativeAudioController(context);audio.begin();
      PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(context).setEnableInternalTracer(false).createInitializationOptions());
      Logging.enableLogToDebugOutput(Logging.Severity.LS_NONE);
      module=JavaAudioDeviceModule.builder(context).setUseHardwareAcousticEchoCanceler(true).setUseHardwareNoiseSuppressor(true).createAudioDeviceModule();
      factory=PeerConnectionFactory.builder().setAudioDeviceModule(module).createPeerConnectionFactory();
      peer=factory.createPeerConnection(configuration(servers),new Observer());if(peer==null)throw new IllegalStateException("Native WebRTC unavailable");
      source=factory.createAudioSource(new MediaConstraints());track=factory.createAudioTrack("nc-audio",source);track.setEnabled(!muted&&focus);peer.addTrack(track,java.util.Collections.singletonList("nc-voice"));state="connecting";
      deadline(id,Math.max(1000,Math.min(60000,connectMs)));
      statsJob=statsExecutor.scheduleAtFixedRate(()->executor.execute(NativePeer::diagnostics),15,15,java.util.concurrent.TimeUnit.SECONDS);
    }catch(Exception error){release();throw error;}
  });}
  private static PeerConnection.RTCConfiguration configuration(JSONArray rows)throws Exception{List<PeerConnection.IceServer> servers=new ArrayList<>();for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);Object urls=row.get("urls");List<String> values=new ArrayList<>();if(urls instanceof JSONArray){for(int j=0;j<((JSONArray)urls).length();j++)values.add(((JSONArray)urls).getString(j));}else values.add(String.valueOf(urls));PeerConnection.IceServer.Builder builder=PeerConnection.IceServer.builder(values);if(row.has("username"))builder.setUsername(row.getString("username"));if(row.has("credential"))builder.setPassword(row.getString("credential"));servers.add(builder.createIceServer());}PeerConnection.RTCConfiguration config=new PeerConnection.RTCConfiguration(servers);config.sdpSemantics=PeerConnection.SdpSemantics.UNIFIED_PLAN;config.bundlePolicy=PeerConnection.BundlePolicy.MAXBUNDLE;return config;}
  static CompletableFuture<Void> configure(String id,JSONArray servers){return task(()->{require(id);if(!peer.setConfiguration(configuration(servers)))throw new IllegalStateException("ICE configuration failed");});}
  static CompletableFuture<String> offer(String id,int rev,boolean restart){CompletableFuture<String> result=new CompletableFuture<>();executor.execute(()->{try{require(id);revision=rev;MediaConstraints constraints=new MediaConstraints();if(restart)constraints.mandatory.add(new MediaConstraints.KeyValuePair("IceRestart","true"));peer.createOffer(new Sdp(result,true),constraints);}catch(Exception error){result.completeExceptionally(error);}});return result;}
  static CompletableFuture<String> description(String id,String kind,int rev,String sdp){CompletableFuture<String> result=new CompletableFuture<>();executor.execute(()->{try{require(id);revision=rev;peer.setRemoteDescription(new SdpObserver(){public void onSetSuccess(){executor.execute(()->{if(!id.equals(callId)||peer==null){result.completeExceptionally(new IllegalStateException("Native call ended"));return;}if(kind.equals("offer"))peer.createAnswer(new Sdp(result,true),new MediaConstraints());else result.complete("");});}public void onSetFailure(String error){result.completeExceptionally(new IllegalStateException("Remote description rejected"));}public void onCreateSuccess(SessionDescription description){}public void onCreateFailure(String error){}},new SessionDescription(kind.equals("offer")?SessionDescription.Type.OFFER:SessionDescription.Type.ANSWER,sdp));}catch(Exception error){result.completeExceptionally(error);}});return result;}
  static CompletableFuture<Void> candidate(String id,JSONObject data){return task(()->{require(id);if(!peer.addIceCandidate(new IceCandidate(data.optString("sdpMid","0"),data.optInt("sdpMLineIndex",0),data.getString("candidate"))))throw new IllegalStateException("ICE candidate rejected");});}
  static void mute(boolean value){executor.execute(()->{muted=value;if(track!=null)track.setEnabled(!muted&&focus);});}
  static void focus(boolean value){executor.execute(()->{focus=value;if(track!=null)track.setEnabled(!muted&&focus);if(remoteTrack!=null)remoteTrack.setEnabled(focus);});}
  static CompletableFuture<JSObject> routes(String value){CompletableFuture<JSObject> result=new CompletableFuture<>();executor.execute(()->{try{if(audio==null)throw new IllegalStateException("Call audio inactive");if(value!=null)audio.route(value);result.complete(audio.snapshot());}catch(Exception error){result.completeExceptionally(error);}});return result;}
  static JSObject snapshot(){return new JSObject().put("callId",callId).put("roomCode",roomCode).put("state",state).put("revision",revision);}
  static void end(Context supplied){String ended=callId;executor.execute(()->{if(!ended.equals(callId))return;release();if(!ended.isEmpty())NativeCallEvents.emit("ended",new JSObject().put("callId",ended));});CallForegroundService.stop(supplied,ended,null);}
  static void release(){String ended=callId;NativeMicrophoneLease.release("call:"+ended);callId="";roomCode="";state="idle";revision=0;muted=false;focus=true;
    if(deadlineJob!=null){deadlineJob.cancel(false);deadlineJob=null;}
    if(statsJob!=null){statsJob.cancel(false);statsJob=null;}remoteTrack=null;
    if(peer!=null){peer.close();peer.dispose();peer=null;}if(track!=null){track.dispose();track=null;}if(source!=null){source.dispose();source=null;}if(factory!=null){factory.dispose();factory=null;}if(module!=null){module.release();module=null;}if(audio!=null){audio.end();audio=null;}
    if(context!=null&&!ended.isEmpty()){androidx.core.app.NotificationManagerCompat.from(context).cancel(NativeNotifications.id(ended));CallForegroundService.stop(context,ended,null);}NativeRingtones.stopFor(ended);}
  private static synchronized void deadline(String id,int ms){if(deadlineJob!=null)deadlineJob.cancel(false);deadlineJob=statsExecutor.schedule(()->executor.execute(()->{if(id.equals(callId)&&!state.equals("connected")){String ended=callId;release();NativeCallEvents.emit("ended",new JSObject().put("callId",ended));}}),ms,java.util.concurrent.TimeUnit.MILLISECONDS);}
  private static synchronized void mediaState(String owner,String next){if(!owner.equals(callId))return;if(next.equals("connected")){if(deadlineJob!=null)deadlineJob.cancel(false);deadlineJob=null;}else if(next.equals("reconnecting")&&deadlineJob==null)deadline(owner,outageMs);state=next;NativeCallEvents.emit("state",new JSObject().put("callId",owner).put("state",next));}
  private static void diagnostics(){if(peer==null||callId.isEmpty())return;String id=callId;
    peer.getStats(report->{JSObject data=new JSObject().put("callId",id);for(RTCStats row:report.getStatsMap().values()){
      java.util.Map<String,Object> values=row.getMembers();
      if(row.getType().equals("candidate-pair")&&"succeeded".equals(values.get("state"))&&Boolean.TRUE.equals(values.get("nominated"))){RTCStats local=report.getStatsMap().get(String.valueOf(values.get("localCandidateId")));if(local!=null){data.put("relay","relay".equals(local.getMembers().get("candidateType")));data.put("protocol",String.valueOf(local.getMembers().get("protocol")));}}
      if(row.getType().equals("inbound-rtp")&&"audio".equals(values.get("kind"))){data.put("packetsLost",values.get("packetsLost"));data.put("packetsReceived",values.get("packetsReceived"));}
    }NativeCallEvents.emit("diagnostic",data);});
  }
  private static void require(String id){if(!id.equals(callId)||peer==null)throw new IllegalStateException("Native call ended");}
  private interface Work{void run()throws Exception;}
  private static CompletableFuture<Void> task(Work work){CompletableFuture<Void> result=new CompletableFuture<>();executor.execute(()->{try{work.run();result.complete(null);}catch(Exception error){result.completeExceptionally(error);}});return result;}
  private static class Sdp implements SdpObserver{
    final String owner=callId;final CompletableFuture<String> result;final boolean local;Sdp(CompletableFuture<String> result,boolean local){this.result=result;this.local=local;}
    public void onCreateSuccess(SessionDescription sdp){executor.execute(()->{if(!owner.equals(callId)||peer==null){result.completeExceptionally(new IllegalStateException("Native call ended"));return;}peer.setLocalDescription(new SdpObserver(){public void onSetSuccess(){if(owner.equals(callId))result.complete(sdp.description);else result.completeExceptionally(new IllegalStateException("Native call ended"));}public void onSetFailure(String error){result.completeExceptionally(new IllegalStateException("Local description rejected"));}public void onCreateSuccess(SessionDescription ignored){}public void onCreateFailure(String error){}},sdp);});}
    public void onCreateFailure(String error){result.completeExceptionally(new IllegalStateException("Native SDP failed"));}public void onSetSuccess(){}public void onSetFailure(String error){}
  }
  private static class Observer implements PeerConnection.Observer {
    private final String owner=callId;
    private boolean live(){return !owner.isEmpty()&&owner.equals(callId);}
    public void onSignalingChange(PeerConnection.SignalingState value){}
    public void onIceConnectionChange(PeerConnection.IceConnectionState value){if(!live())return;if(value==PeerConnection.IceConnectionState.FAILED||value==PeerConnection.IceConnectionState.DISCONNECTED)mediaState(owner,"reconnecting");}
    public void onConnectionChange(PeerConnection.PeerConnectionState value){if(!live())return;String next=value==PeerConnection.PeerConnectionState.CONNECTED?"connected":value==PeerConnection.PeerConnectionState.FAILED||value==PeerConnection.PeerConnectionState.DISCONNECTED?"reconnecting":"connecting";mediaState(owner,next);}
    public void onIceConnectionReceivingChange(boolean value){}public void onIceGatheringChange(PeerConnection.IceGatheringState value){}
    public void onIceCandidate(IceCandidate value){if(!live())return;NativeCallEvents.emit("candidate",new JSObject().put("callId",owner).put("revision",revision).put("candidate",new JSObject().put("candidate",value.sdp).put("sdpMid",value.sdpMid).put("sdpMLineIndex",value.sdpMLineIndex)));}
    public void onIceCandidateError(IceCandidateErrorEvent event){if(!live())return;NativeCallEvents.emit("diagnostic",new JSObject().put("callId",owner).put("iceErrorCode",event.errorCode));}
    public void onIceCandidatesRemoved(IceCandidate[] values){}public void onAddStream(MediaStream stream){}public void onRemoveStream(MediaStream stream){}public void onDataChannel(DataChannel channel){}public void onRenegotiationNeeded(){}public void onAddTrack(RtpReceiver receiver,MediaStream[] streams){if(!live())return;if(receiver.track() instanceof AudioTrack){AudioTrack incoming=(AudioTrack)receiver.track();executor.execute(()->{if(live()){remoteTrack=incoming;remoteTrack.setEnabled(focus);}});}}
  }
}
