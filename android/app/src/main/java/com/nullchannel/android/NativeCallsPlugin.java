package com.nullchannel.android;
import android.Manifest;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import java.security.SecureRandom;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONObject;
@CapacitorPlugin(name="NativeCalls",permissions={@Permission(alias="microphone",strings={Manifest.permission.RECORD_AUDIO}),@Permission(alias="notifications",strings={Manifest.permission.POST_NOTIFICATIONS}),@Permission(alias="bluetooth",strings={Manifest.permission.BLUETOOTH_CONNECT})})
public final class NativeCallsPlugin extends Plugin {
  private NativeNetworkMonitor networks;
  private static volatile int credentialEpoch=0;
  private static final java.util.LinkedHashMap<String,Boolean> cancelledStarts=new java.util.LinkedHashMap<>();
  private static synchronized void cancelStart(String id){if(cancelledStarts.size()>=512)cancelledStarts.remove(cancelledStarts.keySet().iterator().next());cancelledStarts.put(id,true);}
  private static synchronized boolean cancelled(String id){return cancelledStarts.containsKey(id);}
  @Override public void load(){NativeCallEvents.bind(this);NativeNotifications.channels(getContext());networks=new NativeNetworkMonitor(getContext());networks.start();}
  void event(JSObject event){notifyListeners("event",event,true);}
  @PluginMethod public void initialize(PluginCall call){call.resolve(new JSObject().put("firebaseConfigured",!FirebaseApp.getApps(getContext()).isEmpty()).put("notificationsGranted",NativeNotifications.permission(getContext())).put("media",NativePeer.snapshot()));}
  @PluginMethod public void drain(PluginCall call){call.resolve(new JSObject().put("events",NativeCallEvents.drain()).put("action",launchAction()).put("media",NativePeer.snapshot()));}
  private JSObject launchAction(){try{String raw=NativeVault.get(getContext(),"launch.action");if(raw==null)return null;NativeVault.put(getContext(),"launch.action","{}");return new JSObject(raw);}catch(Exception error){return null;}}
  @PluginMethod public void notificationPermission(PluginCall call){if(Build.VERSION.SDK_INT>=33&&getPermissionState("notifications")!=PermissionState.GRANTED)requestPermissionForAlias("notifications",call,"notificationResult");else notificationResult(call);}
  @PermissionCallback private void notificationResult(PluginCall call){call.resolve(new JSObject().put("granted",NativeNotifications.permission(getContext())));}
  @PluginMethod public void bluetoothPermission(PluginCall call){if(Build.VERSION.SDK_INT>=31&&getPermissionState("bluetooth")!=PermissionState.GRANTED)requestPermissionForAlias("bluetooth",call,"bluetoothResult");else bluetoothResult(call);}
  @PermissionCallback private void bluetoothResult(PluginCall call){call.resolve(new JSObject().put("granted",Build.VERSION.SDK_INT<31||getPermissionState("bluetooth")==PermissionState.GRANTED));}
  @PluginMethod public void registration(PluginCall call){String kind=call.getString("kind"),base=call.getString("baseUrl");if(!"account".equals(kind)&&!"guest".equals(kind)){call.reject("Invalid session kind");return;}if(base==null||!base.matches("https://[a-zA-Z0-9.-]+(?::[0-9]+)?")){call.reject("HTTPS backend required");return;}
    if(FirebaseApp.getApps(getContext()).isEmpty()){call.resolve(new JSObject().put("configured",false));return;}
    int epoch=credentialEpoch;FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task->{if(epoch!=credentialEpoch){call.reject("Push registration cancelled");return;}if(!task.isSuccessful()){call.reject("Push registration unavailable");return;}try{String raw=NativeVault.get(getContext(),"device."+kind);JSONObject record=raw==null?new JSONObject():new JSONObject(raw);if(!record.has("deviceId")){byte[] bytes=new byte[32];new SecureRandom().nextBytes(bytes);StringBuilder secret=new StringBuilder();for(byte value:bytes)secret.append(String.format("%02x",value&255));record.put("deviceId",java.util.UUID.randomUUID().toString()).put("secret",secret.toString());}record.put("baseUrl",base);NativeVault.put(getContext(),"device."+kind,record.toString());NativeVault.put(getContext(),"fcm.token",task.getResult());call.resolve(new JSObject(record.toString()).put("token",task.getResult()).put("configured",true));}catch(Exception error){call.reject("Secure push storage unavailable");}});
  }
  @PluginMethod public void show(PluginCall call){Map<String,String> data=new HashMap<>();for(java.util.Iterator<String> keys=call.getData().keys();keys.hasNext();){String key=keys.next();data.put(key,String.valueOf(call.getData().opt(key)));}NativeNotifications.receive(getContext(),data,true);call.resolve();}
  @PluginMethod public void context(PluginCall call){NativeNotifications.activeRoom=call.getString("roomCode","");if(call.getBoolean("clear",false))NativeNotifications.clearRoom(getContext(),NativeNotifications.activeRoom);call.resolve();}
  @PluginMethod public void tone(PluginCall call){String tone=call.getString("tone","stop"),id=call.getString("callId","");if(tone.equals("stop")){NativeRingtones.stopFor(id);IncomingRingingService.stop(getContext(),id);}else NativeRingtones.play(getContext(),(tone.equals("ended")||tone.equals("connected"))?id+":"+tone:id,tone,System.currentTimeMillis()+call.getInt("durationMs",30000));if(call.getBoolean("cancelNotification",false)){IncomingRingingService.stop(getContext(),id);}if(call.getBoolean("cancelNotification",false))androidx.core.app.NotificationManagerCompat.from(getContext()).cancel(NativeNotifications.id(id));call.resolve();}
  @PluginMethod public void start(PluginCall call){if(getPermissionState("microphone")!=PermissionState.GRANTED){requestPermissionForAlias("microphone",call,"startGranted");return;}startGranted(call);}
  @PermissionCallback private void startGranted(PluginCall call){if(getPermissionState("microphone")!=PermissionState.GRANTED){call.reject("Microphone permission denied");return;}String id=call.getString("callId"),room=call.getString("roomCode");if(id==null||!id.matches("[a-fA-F0-9-]{36}")||room==null||!room.matches("[A-Z0-9]{8}")){call.reject("Invalid native call");return;}if(cancelled(id)){call.reject("Native call cancelled");return;}NativeRingtones.stop();IncomingRingingService.stop(getContext(),id);NativePeer.start(getContext(),id,room,call.getArray("iceServers",new JSArray()),call.getInt("connectMs",20000),call.getInt("disconnectMs",10000)).whenComplete((value,error)->{if(error!=null)call.reject("Native microphone/audio initialization failed");else call.resolve();});}
  @PluginMethod public void offer(PluginCall call){NativePeer.offer(call.getString("callId"),call.getInt("revision",1),call.getBoolean("restart",false)).whenComplete((sdp,error)->{if(error!=null)call.reject("Native offer failed");else call.resolve(new JSObject().put("sdp",sdp));});}
  @PluginMethod public void description(PluginCall call){NativePeer.description(call.getString("callId"),call.getString("kind"),call.getInt("revision",1),call.getString("sdp")).whenComplete((sdp,error)->{if(error!=null)call.reject("Native description failed");else call.resolve(new JSObject().put("sdp",sdp));});}
  @PluginMethod public void candidate(PluginCall call){NativePeer.candidate(call.getString("callId"),call.getObject("candidate")).whenComplete((value,error)->{if(error!=null)call.reject("Native candidate failed");else call.resolve();});}
  @PluginMethod public void configure(PluginCall call){NativePeer.configure(call.getString("callId"),call.getArray("iceServers",new JSArray())).whenComplete((value,error)->{if(error!=null)call.reject("Native ICE configuration failed");else call.resolve();});}
  @PluginMethod public void mute(PluginCall call){NativePeer.mute(call.getBoolean("muted",false));call.resolve();}
  @PluginMethod public void routes(PluginCall call){NativePeer.routes(call.getString("route")).whenComplete((value,error)->{if(error!=null)call.reject("Communication route unavailable");else call.resolve(value);});}
  @PluginMethod public void end(PluginCall call){cancelStart(call.getString("callId",""));if(call.getString("callId","").equals(NativePeer.callId))NativePeer.end(getContext());NativeRingtones.stop();call.resolve();}
  @PluginMethod public void clearSession(PluginCall call){String kind=call.getString("kind");if(!"guest".equals(kind)&&!"account".equals(kind)){call.reject("Invalid session kind");return;}credentialEpoch++;NativeVault.remove(getContext(),"device."+kind);NativeNotifications.clearSession(getContext(),kind);call.resolve();}
  @PluginMethod public void clear(PluginCall call){credentialEpoch++;androidx.work.WorkManager.getInstance(getContext()).cancelUniqueWork(PushTokenWorker.NAME);NativeNotifications.clear(getContext());NativePeer.end(getContext());NativeVault.clear(getContext());if(!FirebaseApp.getApps(getContext()).isEmpty())FirebaseMessaging.getInstance().deleteToken();call.resolve();}
  @Override protected void handleOnDestroy(){NativeCallEvents.unbind(this);if(networks!=null)networks.close();super.handleOnDestroy();}
}
