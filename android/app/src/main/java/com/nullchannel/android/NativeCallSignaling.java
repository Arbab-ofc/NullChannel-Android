package com.nullchannel.android;

import android.content.Context;
import com.getcapacitor.JSObject;
import io.socket.client.IO;
import io.socket.client.Socket;
import io.socket.client.Ack;
import org.json.*;
import java.util.*;
import java.util.concurrent.*;

/** One process-scoped Android signaling owner. No WebView timers or SDP callbacks. */
final class NativeCallSignaling {
    private static final ScheduledExecutorService owner=Executors.newSingleThreadScheduledExecutor();
    private static volatile NativeCallSignaling current;
    static volatile NativeCallRuntime dependencies=new NativeCallRuntime();
    private final NativeCallRuntime runtime=dependencies;
    private final String ownershipId=UUID.randomUUID().toString();
    private final Context context;
    private final String base,room,kind,senderId,senderName;
    private final NativeSignalPolicy policy=new NativeSignalPolicy();
    private final Map<String,Pending> pending=new LinkedHashMap<>();
    private final List<JSONObject> remoteIce=new ArrayList<>(),localIce=new ArrayList<>();
    private final List<ScheduledFuture<?>> timers=new ArrayList<>();
    private Socket socket;
    private NativeNetworkMonitor networks;
    private String id="",phase="idle",peerName="Anonymous caller",roomName="NullChannel",message="",network="";
    private boolean resumePending;
    private boolean accepting;
    private boolean caller,ended,ready,negotiating,negotiated,mediaConnected,muted,reported;
    private int revision,remoteRevision,acknowledged,restarts,connectAttempts,stateVersion;
    private long deadline,roomExpires,connectedAt,outageDeadline;
    private int connectMs=20000,disconnectMs=10000;
    private NativeIceCredentials iceCredentials;
    private ScheduledFuture<?> recovery,authJob,expiryJob;
    private CompletableFuture<JSONObject> started;
    private static final class Pending {String event;JSONObject data;int attempts;CompletableFuture<JSONObject> result=new CompletableFuture<>();ScheduledFuture<?> timeout;}
    private NativeCallSignaling(Context supplied,JSONObject options)throws Exception {
        context=supplied.getApplicationContext();base=options.getString("baseUrl");room=options.getString("roomCode");kind=options.optString("kind","guest");senderId=options.optString("senderId","");senderName=options.optString("senderName","Anonymous");
        if(!runtime.allowedBase(base)||!room.matches("[A-Z0-9]{8}"))throw new IllegalArgumentException("Invalid call destination");NativeCallAuth.key(kind);
        iceCredentials=new NativeIceCredentials(System::currentTimeMillis,()->runtime.iceServers(context,base,kind,room));
    }
    static boolean owns(String id){NativeCallSignaling call=current;return call!=null&&!call.ended&&(id==null||id.isEmpty()||id.equals(call.id)||id.equals(call.ownershipId));}
    static JSONObject snapshot(){NativeCallSignaling call=current;return call==null?new JSONObject():call.view();}
    static CompletableFuture<JSONObject> begin(Context context,JSONObject options){CompletableFuture<JSONObject> result=new CompletableFuture<>();owner.execute(()->{
        boolean allocated=false;try{if(NativeMicrophoneLease.recording())throw new IllegalStateException("The voice recorder is active");if(current!=null&&!current.ended){if(options.optString("callId").equals(current.id)){result.complete(current.view());return;}throw new IllegalStateException("Another native call owns signaling");}
            NativeCallSignaling call=new NativeCallSignaling(context,options);current=call;allocated=true;call.started=result;call.caller=options.optString("callId").isEmpty();call.id=options.optString("callId","");if(!call.id.isEmpty()&&!call.id.matches("[a-f0-9-]{36}"))throw new IllegalArgumentException("Invalid invitation id");call.phase=call.caller?"outgoing":"incoming";if(call.caller)call.runtime.startService(call.context,call.ownershipId);
            call.networks=new NativeNetworkMonitor(context);call.networks.start();call.authJob=owner.scheduleAtFixedRate(()->call.renew(),15,15,TimeUnit.SECONDS);
            if(!call.caller)call.validateInvitation();call.publish();call.connect();
        }catch(Exception error){if(allocated&&current!=null)current.finish("failed","Call initialization unavailable.",false);result.completeExceptionally(new IllegalStateException("Native call unavailable"));}
    });return result;}
    static void command(String action){NativeCallSignaling call=current;command(action,call==null?null:call.ownershipId);}
    static void command(String action,String expected){owner.execute(()->{NativeCallSignaling call=current;if(call==null||call.ended||expected==null||!expected.equals(call.id)&&!expected.equals(call.ownershipId))return;if(action.equals("answer"))call.answer();else if(action.equals("decline"))call.terminate("declined");else if(action.equals("end"))call.terminate("hangup");else if(action.equals("mute")){call.muted=!call.muted;NativePeer.mute(call.muted);call.publish();}});}
    static void refreshAuthentication(){owner.execute(()->{NativeCallSignaling call=current;if(call!=null&&!call.ended)call.renew();});}
    static void syncMute(boolean value){owner.execute(()->{NativeCallSignaling call=current;if(call!=null&&!call.ended){call.muted=value;NativePeer.mute(value);call.publish();}});}
    static void stopScope(String scope){owner.execute(()->{NativeCallSignaling call=current;if(call!=null&&(scope==null||scope.equals(call.kind)))call.terminate("session-ended");});}
    static void media(String type,JSObject event){NativeCallSignaling call=current;if(call==null||!call.id.equals(event.optString("callId")))return;owner.execute(()->{if(call.ended)return;
        if(type.equals("candidate")){JSONObject value=event.optJSONObject("candidate");if(value!=null){try{JSONObject item=new JSONObject().put("revision",event.optInt("revision")).put("candidate",value);if(call.localIce.size()>=256)call.finish("failed","Voice candidate limit exceeded.",true);else if(call.acknowledged==event.optInt("revision"))call.sendIce(item);else call.localIce.add(item);}catch(JSONException ignored){}}}
        if(type.equals("state")){if(event.optString("state").equals("connected")){call.mediaConnected=true;call.restarts=0;call.outageDeadline=0;call.phase="connected";if(call.connectedAt==0){call.connectedAt=System.currentTimeMillis();NativeRingtones.play(call.context,call.id+":connected","connected",System.currentTimeMillis()+300);}call.reportConnected();NativeTelecom.state(call.id,"connected");call.publish();}else if(event.optString("state").equals("reconnecting")){call.mediaConnected=false;call.recover();}}
        if(type.equals("ended"))call.finish("ended","Call ended.",true);
    });}
    static void network(boolean online,String fingerprint){owner.execute(()->{NativeCallSignaling call=current;if(call==null||call.ended||fingerprint.equals(call.network))return;boolean initial=call.network.isEmpty();call.network=fingerprint;if(!initial){if(!online)call.recover();else{call.ready=false;call.reported=false;call.phase="reconnecting";call.publish();call.connect();if(call.recovery!=null)call.recovery.cancel(false);call.recovery=owner.schedule(()->{if(!call.mediaConnected)call.recover();},2,TimeUnit.SECONDS);}}});}
    private JSONObject credentials(boolean force)throws Exception{return runtime.credentials(context,base,kind,force);}
    private JSONObject get(String path)throws Exception{return runtime.get(context,base,kind,path);}
    private void validateInvitation()throws Exception {JSONObject invitation=get("/api/rooms/"+room+"/calls/"+id+"/invitation");deadline=invitation.getLong("expiresAt");if(!NativeSignalPolicy.invitationValid(deadline,System.currentTimeMillis()))throw new Exception("Expired invitation");peerName=invitation.optString("peerName","Anonymous caller");roomName=invitation.optString("roomName","NullChannel");timeouts(invitation);scheduleExpiry();NativeIncomingCallActivity.persist(context,object("callId",id,"roomCode",room,"kind",kind,"baseUrl",base,"expiresAt",deadline));NativeNotifications.receive(context,new java.util.HashMap<String,String>(){{put("kind","incoming-call");put("callId",id);put("roomCode",room);put("scope",kind);put("eventId",id);put("expiresAt",String.valueOf(deadline));put("peerName",peerName);}},true);NativeTelecom.registerCall(context,id,room,false);}
    private void timeouts(JSONObject data){JSONObject values=data.optJSONObject("timeouts");if(values!=null){connectMs=values.optInt("connectMs",20000);disconnectMs=values.optInt("disconnectMs",10000);}}
    private void renew(){if(ended)return;try{credentials(false);if(negotiated&&!id.isEmpty())reconcile(get("/api/rooms/"+room+"/calls/"+id+"/state").optJSONObject("snapshot"));}catch(NativeCallAuth.Unavailable unavailable){if(unavailable.status==410||unavailable.status==403)finish("ended","Call authorization ended.",true);}catch(NativeCallAuth.Expired expired){finish("ended","Session expired.",true);}catch(Exception unavailable){/* Temporary HTTP loss does not end healthy media; access expiry and transport recovery remain bounded. */}}
    private void connect(){if(ended)return;if(connectAttempts++>=8){finish("failed","Voice signaling could not reconnect.",true);return;}
        try{JSONObject bundle=credentials(false);if(socket!=null){socket.off();socket.disconnect();socket.close();}
            IO.Options options=new IO.Options();options.transports=new String[]{"websocket"};options.reconnection=false;options.forceNew=true;options.timeout=6000;options.extraHeaders=Collections.singletonMap("Origin",Collections.singletonList("https://localhost"));options.auth=new HashMap<>();options.auth.put("roomCode",room);options.auth.put("callProtocol","2");options.auth.put(kind.equals("account")?"accountToken":"guestToken",bundle.getString("accessToken"));socket=runtime.socket(base,options);Socket transport=socket;
            socket.on(Socket.EVENT_CONNECT,args->owner.execute(()->{if(ended||socket!=transport)return;try{String identity=kind.equals("guest")?bundle.optString("identityId",senderId):senderId;socket.emit("join-room",new JSONObject().put("roomCode",room).put("senderId",identity).put("senderName",senderName));}catch(Exception invalid){finish("failed","Room join unavailable.",true);}}));
            socket.on("room-joined",args->owner.execute(()->{if(ended||socket!=transport)return;connectAttempts=0;joined();}));
            socket.on(Socket.EVENT_DISCONNECT,args->owner.execute(()->{if(!ended&&socket==transport){ready=false;reported=false;if(mediaConnected)phase="reconnecting";publish();scheduleReconnect();}}));
            socket.on(Socket.EVENT_CONNECT_ERROR,args->owner.execute(()->{if(!ended&&socket==transport)scheduleReconnect();}));
            for(String event:new String[]{"call:outgoing","call:accepted","call:ringing","call:offer","call:answer","call:ice-candidate","call:state","call:connected","call:reconnecting","call:ended","call:timeout","call:rejected"})socket.on(event,args->{if(args.length>0&&args[0] instanceof JSONObject)owner.execute(()->{if(!ended&&socket==transport)receive(event,(JSONObject)args[0]);});});
            socket.on("room-expired",args->owner.execute(()->finish("ended","Room expired.",true)));socket.on("membership-revoked",args->owner.execute(()->finish("ended","Room access ended.",true)));socket.connect();
        }catch(NativeCallAuth.Expired expired){finish("ended","Session expired.",true);}catch(Exception unavailable){scheduleReconnect();}
    }
    private void scheduleReconnect(){if(ended||recovery!=null&&!recovery.isDone())return;if(!id.isEmpty()&&outageDeadline==0)outageDeadline=System.currentTimeMillis()+disconnectMs;recovery=owner.schedule(()->{recovery=null;if(outageDeadline>0&&System.currentTimeMillis()>=outageDeadline)finish("failed","Voice reconnect timed out.",true);else connect();},Math.min(3000,500L*Math.max(1,connectAttempts)),TimeUnit.MILLISECONDS);}
    private void joined(){if(id.isEmpty()){request("call:invite",object("roomCode",room)).whenComplete((reply,error)->owner.execute(()->{if(error!=null){finish("failed","The call could not be placed.",false);return;}String invited=reply.optString("callId","");if(ended){if(!invited.isEmpty()&&socket!=null)socket.emit("call:end",object("callId",invited));return;}id=invited;NativeTelecom.registerCall(context,id,room,true);publish();if(started!=null&&!started.isDone())started.complete(view());}));}
        else{request("call:resume",object("callId",id,"takeover",true)).whenComplete((reply,error)->owner.execute(()->{if(ended)return;if(error!=null){finish("failed","Call resume failed.",true);return;}reconcile(reply.optJSONObject("snapshot"));JSONArray replay=reply.optJSONArray("replay");if(replay!=null)for(int i=0;i<replay.length();i++){JSONObject item=replay.optJSONObject(i);if(item!=null)receive(item.optString("event"),item.optJSONObject("data"));}for(Pending item:new ArrayList<>(pending.values()))transmit(item);if(phase.equals("incoming"))request("call:ringing",object("callId",id));if(started!=null&&!started.isDone())started.complete(view());if(mediaConnected)reportConnected();else if(negotiated&&ready)recover();}));}}
    private CompletableFuture<JSONObject> request(String event,JSONObject data){Pending value=new Pending();value.event=event;value.data=data;try{data.put("messageId",UUID.randomUUID().toString());}catch(JSONException impossible){}if(pending.size()>=512){value.result.completeExceptionally(new Exception("Signaling limit"));return value.result;}pending.put(data.optString("messageId"),value);transmit(value);return value.result;}
    private void transmit(Pending value){if(value.timeout!=null)value.timeout.cancel(false);if(ended||value.result.isDone()||socket==null||!socket.connected())return;if(value.attempts++>=3){pending.remove(value.data.optString("messageId"));value.result.completeExceptionally(new Exception("Signaling acknowledgment timeout"));return;}String origin=id;Socket transport=socket;socket.emit(value.event,value.data,(Ack)args->owner.execute(()->{if(value.result.isDone())return;if(ended||socket!=transport||!origin.equals(id)&&!value.event.equals("call:invite"))return;if(args.length==0||!(args[0] instanceof JSONObject))return;JSONObject reply=(JSONObject)args[0];if(reply.optBoolean("ok")){pending.remove(value.data.optString("messageId"));value.result.complete(reply);}else{String code=reply.optString("code");if(code.equals("DISCONNECTED")||code.equals("PEERS_NOT_READY")){value.attempts--;return;}if(code.equals("STALE_SIGNAL")&&value.event.equals("call:ice-candidate")){pending.remove(value.data.optString("messageId"));value.result.complete(reply);return;}pending.remove(value.data.optString("messageId"));value.result.completeExceptionally(new Exception("Signaling rejected"));}}));value.timeout=owner.schedule(()->transmit(value),1500,TimeUnit.MILLISECONDS);value.result.whenComplete((reply,error)->{if(value.timeout!=null)value.timeout.cancel(false);});}
    private void later(Runnable task,long ms){if(timers.size()>=512){finish("failed","Signaling queue exceeded.",true);return;}java.util.concurrent.atomic.AtomicReference<ScheduledFuture<?>> reference=new java.util.concurrent.atomic.AtomicReference<>();ScheduledFuture<?> timer=owner.schedule(()->{timers.remove(reference.get());if(!ended)task.run();},ms,TimeUnit.MILLISECONDS);reference.set(timer);timers.add(timer);}
    private void receive(String event,JSONObject data){if(data==null)return;if(event.equals("call:outgoing")){id=data.optString("callId");deadline=data.optLong("expiresAt");peerName=data.optString("peerName","Anonymous caller");roomName=data.optString("roomName","NullChannel");timeouts(data);scheduleExpiry();publish();return;}if(!id.equals(data.optString("callId")))return;
        if(event.equals("call:ended")||event.equals("call:timeout")||event.equals("call:rejected")){finish("ended",event.equals("call:timeout")?"No answer.":"Call ended.",false);return;}
        if(event.equals("call:ringing")){if(caller&&phase.equals("outgoing")){phase="ringing";NativeRingtones.play(context,id,"ringback",deadline);publish();}return;}
        if(event.equals("call:accepted")){if(mediaStart!=null)return;NativeRingtones.stopFor(id);IncomingRingingService.stop(context,id);phase="connecting";accepting=false;deadline=System.currentTimeMillis()+connectMs;reconcile(data.optJSONObject("snapshot"));startMedia();publish();return;}
        if(event.equals("call:state")||event.equals("call:connected")){reconcile(data);return;}
        if(event.equals("call:reconnecting")){recover();return;}
        String signal=data.optString("signalId",null);if(policy.seen(signal)){ackSignal(signal);return;}int rev=data.optInt("revision");if(rev<revision){ackSignal(signal);return;}
        if(event.equals("call:ice-candidate")){if(remoteIce.size()>=256){finish("failed","Voice candidate limit exceeded.",true);return;}if(remoteRevision!=rev||!NativePeer.callId.equals(id))remoteIce.add(data);else applyCandidate(data);policy.applied(signal);ackSignal(signal);return;}
        if(!event.equals("call:offer")&&!event.equals("call:answer"))return;if(negotiating){later(()->receive(event,data),100);return;}
        boolean offer=event.equals("call:offer");if(offer==caller||!NativeSignalPolicy.revisionAllowed(revision,rev,offer)){finish("failed","Invalid voice negotiation.",true);return;}negotiating=true;revision=rev;
        startMedia().thenComposeAsync(value->offer?configureIce():CompletableFuture.completedFuture(null),owner).thenComposeAsync(value->{ensureOwner();return runtime.description(id,offer?"offer":"answer",rev,data.optString("sdp"));},owner).whenComplete((sdp,error)->owner.execute(()->{if(ended)return;if(error!=null){finish("failed","Voice negotiation failed.",true);return;}remoteRevision=rev;negotiated=true;for(JSONObject candidate:new ArrayList<>(remoteIce))if(candidate.optInt("revision")==rev)applyCandidate(candidate);remoteIce.removeIf(candidate->candidate.optInt("revision")<=rev);policy.applied(signal);ackSignal(signal);
            if(offer)sendDescription("answer",rev,sdp);else{negotiating=false;reportConnected();}
        }));
    }
    private CompletableFuture<Void> mediaStart;
    private void ensureOwner(){if(ended||current!=this)throw new CancellationException("Call ended");}
    private CompletableFuture<Void> startMedia(){
        if(mediaStart!=null)return mediaStart;
        mediaStart=iceCredentials.fresh().thenComposeAsync(servers->{ensureOwner();return runtime.start(context,id,room,servers,connectMs,disconnectMs);},owner);
        mediaStart.whenComplete((value,error)->owner.execute(()->{if(ended||current!=this)return;if(error!=null)finish("failed","Secure voice or microphone settings unavailable.",true);else if(caller&&ready&&!negotiated)offer(false);}));
        return mediaStart;
    }
    private CompletableFuture<Void> configureIce(){
        ensureOwner();
        return iceCredentials.fresh().thenComposeAsync(servers->{ensureOwner();return runtime.configure(id,servers);},owner);
    }
    private void offer(boolean restart){
        if(ended||!caller||!ready||negotiating||revision!=remoteRevision||mediaStart==null)return;
        negotiating=true;int next=revision+1;
        configureIce().thenComposeAsync(value->{ensureOwner();return runtime.offer(id,next,restart);},owner).whenComplete((sdp,error)->owner.execute(()->{
            if(ended||current!=this)return;
            if(error!=null){negotiating=false;recover();return;}
            revision=next;acknowledged=0;if(restart)restarts++;sendDescription("offer",next,sdp);
        }));
    }
    private void sendDescription(String type,int rev,String sdp){request("call:"+type,object("callId",id,"revision",rev,"sdp",sdp)).whenComplete((reply,error)->owner.execute(()->{if(ended)return;if(error!=null){negotiating=false;recover();return;}acknowledged=rev;negotiating=false;for(JSONObject item:new ArrayList<>(localIce))if(item.optInt("revision")==rev)sendIce(item);localIce.removeIf(item->item.optInt("revision")<=rev);if(type.equals("answer")){negotiating=false;negotiated=true;reportConnected();}}));}
    private void sendIce(JSONObject item){request("call:ice-candidate",object("callId",id,"revision",item.optInt("revision"),"candidate",item.optJSONObject("candidate"))).whenComplete((value,error)->owner.execute(()->{if(error!=null&&!ended)recover();}));}
    private void applyCandidate(JSONObject data){runtime.candidate(id,data.optJSONObject("candidate")).whenComplete((value,error)->owner.execute(()->{if(error!=null&&!ended)recover();}));}
    private void ackSignal(String signal){if(signal!=null)request("call:received",object("callId",id,"signalId",signal));}
    private void reconcile(JSONObject snapshot){if(snapshot==null||!id.equals(snapshot.optString("callId"))||snapshot.optInt("stateVersion")<stateVersion)return;stateVersion=snapshot.optInt("stateVersion");ready=NativeSignalPolicy.bothReady(snapshot);JSONObject participants=snapshot.optJSONObject("ready");if(participants!=null&&(!participants.optBoolean(caller?"caller":"callee")||snapshot.optInt("revision")>remoteRevision&&!negotiating)&&socket!=null&&socket.connected()&&!resumePending){resumePending=true;request("call:resume",object("callId",id)).whenComplete((reply,error)->owner.execute(()->{resumePending=false;if(!ended&&error==null){reconcile(reply.optJSONObject("snapshot"));replay(reply);}}));}long remoteDeadline=snapshot.optLong("deadline");if(remoteDeadline>0)deadline=remoteDeadline;String expiry=snapshot.optString("roomExpiresAt","");if(!expiry.isEmpty())try{roomExpires=java.time.Instant.parse(expiry).toEpochMilli();}catch(Exception ignored){}scheduleExpiry();if(ready){if(mediaConnected){outageDeadline=0;restarts=0;phase="connected";reportConnected();}else if(caller&&mediaStart!=null&&!negotiated)offer(false);else if(negotiated)recover();}publish();}
    private void replay(JSONObject reply){JSONArray values=reply.optJSONArray("replay");if(values!=null)for(int i=0;i<values.length();i++){JSONObject signal=values.optJSONObject(i);if(signal!=null)receive(signal.optString("event"),signal.optJSONObject("data"));}}
    private void reportConnected(){if(!mediaConnected||!negotiated||!ready||reported||socket==null||!socket.connected())return;reported=true;request("call:connected",object("callId",id)).whenComplete((value,error)->owner.execute(()->{if(error!=null)reported=false;}));}
    private void recover(){if(ended||mediaStart==null)return;if(mediaConnected){reportConnected();return;}phase="reconnecting";reported=false;if(outageDeadline==0)outageDeadline=System.currentTimeMillis()+disconnectMs;publish();request("call:reconnecting",object("callId",id));if(recovery!=null&&!recovery.isDone())return;recovery=owner.schedule(()->{recovery=null;if(ended)return;if(mediaConnected){outageDeadline=0;return;}if(System.currentTimeMillis()>=outageDeadline||restarts>=3){finish("failed","Voice could not reconnect.",true);return;}if(socket==null||!socket.connected())connect();else if(caller&&ready){request("call:resume",object("callId",id)).whenComplete((reply,error)->owner.execute(()->{if(!ended&&error==null){reconcile(reply.optJSONObject("snapshot"));replay(reply);if(!negotiating)offer(true);}}));}recover();},1000,TimeUnit.MILLISECONDS);}
    private void answer(){if(ended||caller||accepting||!phase.equals("incoming"))return;if(androidx.core.content.ContextCompat.checkSelfPermission(context,android.Manifest.permission.RECORD_AUDIO)!=android.content.pm.PackageManager.PERMISSION_GRANTED){message="Microphone permission is required to answer.";publish();return;}accepting=true;publish();try{runtime.startService(context,id);validateInvitation();}catch(Exception expired){finish("ended","Invitation expired.",false);return;}NativeRingtones.stopFor(id);IncomingRingingService.stop(context,id);request("call:accept",object("callId",id)).whenComplete((reply,error)->owner.execute(()->{if(!ended&&error!=null)finish("failed","Call could not be answered.",true);}));}
    private void scheduleExpiry(){if(expiryJob!=null)expiryJob.cancel(false);long end=phase.equals("incoming")||phase.equals("outgoing")||phase.equals("ringing")?deadline:roomExpires; if(roomExpires>0)end=end>0?Math.min(end,roomExpires):roomExpires;if(end>0)expiryJob=owner.schedule(()->finish("ended","Call invitation or room expired.",true),Math.max(0,end-System.currentTimeMillis()),TimeUnit.MILLISECONDS);}
    private void terminate(String reason){String event=phase.equals("incoming")&&!accepting?"call:reject":"call:end";if(socket!=null&&socket.connected()&&!id.isEmpty())socket.emit(event,object("callId",id,"messageId",UUID.randomUUID().toString()));finish("ended",reason.equals("session-ended")?"Session expired.":"Call ended.",false);}
    private void finish(String terminal,String text,boolean remote){if(ended)return;ended=true;iceCredentials.close();phase=terminal;message=text;if(remote&&socket!=null&&socket.connected()&&!id.isEmpty())socket.emit("call:end",object("callId",id,"messageId",UUID.randomUUID().toString()));for(ScheduledFuture<?> timer:timers)timer.cancel(false);timers.clear();if(authJob!=null)authJob.cancel(false);if(recovery!=null)recovery.cancel(false);if(expiryJob!=null)expiryJob.cancel(false);if(networks!=null)networks.close();for(Pending item:pending.values()){if(item.timeout!=null)item.timeout.cancel(false);}for(Pending item:pending.values())item.result.completeExceptionally(new Exception("Call ended"));pending.clear();if(socket!=null){socket.off();socket.disconnect();socket.close();socket=null;}CallForegroundService.stop(context,id,ownershipId);if(id.equals(NativePeer.callId))runtime.end(context);IncomingRingingService.stop(context,id);NativeRingtones.stopFor(id);if(connectedAt>0)NativeRingtones.play(context,id+":ended","ended",System.currentTimeMillis()+500);NativeTelecom.end(id);androidx.core.app.NotificationManagerCompat.from(context).cancel(NativeNotifications.id(id));NativeVault.remove(context,"invitation."+id);publish();if(started!=null&&!started.isDone())started.completeExceptionally(new Exception(text));}
    private synchronized JSONObject view(){return object("callId",id,"roomCode",room,"phase",phase,"peerName",peerName,"roomName",roomName,"muted",muted,"accepting",accepting,"connectedAt",connectedAt,"message",message,"revision",revision,"kind",kind,"owner","native","ownershipId",ownershipId);}
    private void publish(){NativeCallEvents.emit("native-call",js(view()));NativeIncomingCallActivity.changed();NativeTelecom.state(id,phase);}
    static JSObject js(JSONObject value){JSObject row=new JSObject();for(java.util.Iterator<String> keys=value.keys();keys.hasNext();){String key=keys.next();row.put(key,value.opt(key));}return row;}
    static JSONObject object(Object... pairs){JSONObject row=new JSONObject();try{for(int i=0;i<pairs.length;i+=2)row.put(String.valueOf(pairs[i]),pairs[i+1]);}catch(JSONException invalid){throw new IllegalArgumentException("Invalid call data");}return row;}
}
