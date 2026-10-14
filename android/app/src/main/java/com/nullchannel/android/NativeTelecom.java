package com.nullchannel.android;

import android.content.*;
import android.os.*;
import android.telecom.*;
import android.net.Uri;
import java.util.concurrent.ConcurrentHashMap;

/** Optional self-managed Telecom bridge; API 24/25 retain the app UI fallback. */
final class NativeTelecom {
    static final java.util.Map<String,NullChannelConnection> connections=new ConcurrentHashMap<>();
    private static final java.util.Set<String> registered=ConcurrentHashMap.newKeySet();
    static PhoneAccountHandle handle(Context context){return new PhoneAccountHandle(new ComponentName(context,NullChannelConnectionService.class),"nullchannel-voice");}
    static boolean register(Context context){if(Build.VERSION.SDK_INT<26)return false;try{TelecomManager manager=context.getSystemService(TelecomManager.class);if(manager==null)return false;PhoneAccount account=PhoneAccount.builder(handle(context),"NullChannel").setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED).setSupportedUriSchemes(java.util.Collections.singletonList("nullchannel")).build();manager.registerPhoneAccount(account);return manager.getPhoneAccount(handle(context))!=null;}catch(SecurityException|UnsupportedOperationException unavailable){return false;}}
    static void registerCall(Context context,String id,String room,boolean outgoing){if(id.isEmpty()||Build.VERSION.SDK_INT<26||!registered.add(id))return;if(!register(context)){registered.remove(id);return;}try{TelecomManager manager=context.getSystemService(TelecomManager.class);Bundle extras=new Bundle();extras.putString("nc.callId",id);extras.putString("nc.roomCode",room);if(outgoing){extras.putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE,handle(context));Bundle nested=new Bundle(extras);extras.putBundle(TelecomManager.EXTRA_OUTGOING_CALL_EXTRAS,nested);manager.placeCall(Uri.parse("nullchannel:anonymous"),extras);}else manager.addNewIncomingCall(handle(context),extras);}catch(SecurityException|IllegalArgumentException unavailable){registered.remove(id);}}
    static void state(String id,String phase){NullChannelConnection value=connections.get(id);if(value==null)return;new Handler(Looper.getMainLooper()).post(()->{if(phase.equals("connected"))value.setActive();else if(phase.equals("incoming"))value.setRinging();else if(phase.equals("outgoing")||phase.equals("ringing"))value.setDialing();});}
    static void end(String id){registered.remove(id);NullChannelConnection value=connections.remove(id);if(value!=null)new Handler(Looper.getMainLooper()).post(()->{value.setDisconnected(new DisconnectCause(DisconnectCause.LOCAL));value.destroy();});}
    static void rejected(String id){registered.remove(id);NativeCallEvents.emit("telecom-unavailable",new com.getcapacitor.JSObject());}
    static final class NullChannelConnection extends Connection {
        final String id;final Context context;
        NullChannelConnection(Context context,String id){this.context=context.getApplicationContext();this.id=id;if(Build.VERSION.SDK_INT>=26)setConnectionProperties(Connection.PROPERTY_SELF_MANAGED);setConnectionCapabilities(Connection.CAPABILITY_MUTE);setAudioModeIsVoip(true);setCallerDisplayName("NullChannel caller",TelecomManager.PRESENTATION_ALLOWED);}
        @Override public void onAnswer(){if(NativeCallSignaling.owns(id))NativeCallSignaling.command("answer",id);else try{String raw=NativeVault.get(context,"invitation."+id);if(raw!=null)NativeCallSignaling.begin(context,new org.json.JSONObject(raw)).whenComplete((value,error)->{if(error==null)NativeCallSignaling.command("answer",id);});}catch(Exception expired){}}
        @Override public void onReject(){if(NativeCallSignaling.owns(id))NativeCallSignaling.command("decline",id);else java.util.concurrent.CompletableFuture.runAsync(()->{try{String raw=NativeVault.get(context,"invitation."+id);if(raw!=null)NativePushApi.verify(context,null,new org.json.JSONObject(raw).optString("roomCode"),id,"decline");}catch(Exception expired){}});NativeRingtones.stopFor(id);IncomingRingingService.stop(context,id);androidx.core.app.NotificationManagerCompat.from(context).cancel(NativeNotifications.id(id));NativeVault.remove(context,"invitation."+id);end(id);}
        @Override public void onDisconnect(){if(NativeCallSignaling.owns(id))NativeCallSignaling.command("end",id);end(id);}
        @Override public void onAbort(){if(NativeCallSignaling.owns(id))NativeCallSignaling.command("end",id);end(id);}
        @Override public void onShowIncomingCallUi(){/* CallStyle notification owns permitted UI presentation. */}
        @Override public void onCallAudioStateChanged(CallAudioState state){if(NativeCallSignaling.owns(id))NativeCallSignaling.syncMute(state.isMuted());NativeCallEvents.emit("telecom-audio",new com.getcapacitor.JSObject().put("muted",state.isMuted()));}
        @Override public void onCallEvent(String event,Bundle extras){super.onCallEvent(event,extras);}
    }
}
