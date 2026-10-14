package com.nullchannel.android;
import android.app.*;
import android.content.*;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.Person;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import java.util.LinkedHashMap;
import java.util.Map;
final class NativeNotifications {
  static final String MESSAGES="nc_messages_v1",CALLS="nc_calls_v1",ONGOING="nc_ongoing_v1";
  static boolean foreground=false;
  static String activeRoom="";
  private static final LinkedHashMap<String,Long> seen=new LinkedHashMap<>();
  static void channels(Context context){if(Build.VERSION.SDK_INT<26)return;NotificationManager manager=context.getSystemService(NotificationManager.class);
    NotificationChannel messages=new NotificationChannel(MESSAGES,"Private messages",NotificationManager.IMPORTANCE_DEFAULT);
    messages.setDescription("Private message alerts without message contents");messages.enableVibration(true);messages.setSound(Uri.parse("android.resource://"+context.getPackageName()+"/"+R.raw.nc_message),new android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION).build());
    NotificationChannel calls=new NotificationChannel(CALLS,"Incoming voice calls",NotificationManager.IMPORTANCE_HIGH);calls.enableVibration(true);calls.setVibrationPattern(new long[]{0,350,200,350});calls.setSound(Uri.parse("android.resource://"+context.getPackageName()+"/"+R.raw.nc_incoming),new android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION_RINGTONE).build());
    NotificationChannel ongoing=new NotificationChannel(ONGOING,"Ongoing voice call",NotificationManager.IMPORTANCE_LOW);ongoing.setSound(null,null);
    manager.createNotificationChannels(java.util.Arrays.asList(messages,calls,ongoing));}
  static int id(String value){return value.hashCode()&0x7fffffff;}
  static PendingIntent launch(Context context,String room,String call,String action){String nonce="";try{nonce=NativeVault.mintAction(context,new org.json.JSONObject().put("roomCode",room).put("callId",call).put("action",action),action.equals("answer")?60000:86400000);}catch(Exception unavailable){/* Fail closed: the Activity will reject a notification action without a proof. */}Intent intent=new Intent(context,MainActivity.class).setAction("nc."+action).setData(Uri.parse("nullchannel://action/"+(call==null?room:call)+"/"+action)).putExtra("roomCode",room).putExtra("callId",call).putExtra("callAction",action).putExtra("notificationNonce",nonce).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);return PendingIntent.getActivity(context,id(intent.getDataString()),intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
  static PendingIntent action(Context context,String room,String call,String action){Intent intent=new Intent(context,CallActionReceiver.class).setAction(action).setData(Uri.parse("nullchannel://action/"+call+"/"+action)).putExtra("roomCode",room).putExtra("callId",call);return PendingIntent.getBroadcast(context,id(intent.getDataString()),intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
  static boolean permission(Context context){return Build.VERSION.SDK_INT<33||ContextCompat.checkSelfPermission(context,android.Manifest.permission.POST_NOTIFICATIONS)==android.content.pm.PackageManager.PERMISSION_GRANTED;}
  static synchronized void receive(Context context,Map<String,String> data,boolean trustedSocket){receive(context,data,trustedSocket,foreground);}
  static synchronized void receive(Context context,Map<String,String> data,boolean trustedSocket,boolean serviceEligible){
    channels(context);String kind=data.getOrDefault("kind",""),room=data.getOrDefault("roomCode",""),call=data.get("callId"),event=data.getOrDefault("eventId","");long expiry;
    try{expiry=Long.parseLong(data.getOrDefault("expiresAt","0"));}catch(NumberFormatException error){return;}
    if(!room.matches("[A-Z0-9]{8}")||event.isEmpty())return;
    if(kind.equals("call-ended")){if(call!=null){NotificationManagerCompat.from(context).cancel(id(call));IncomingRingingService.stop(context,call);if(call.equals(NativePeer.callId)){NativePeer.end(context);NativeRingtones.stop();}if(call.equals(context.getSharedPreferences("nc_notifications",0).getString("ringing",null)))NativeRingtones.stopFor(call);}return;}
    if(kind.equals("room-expired")){clearRoom(context,room);return;}
    boolean duplicate=seen.containsKey(event)||context.getSharedPreferences("nc_notifications",0).contains("seen."+event);
    if(!NotificationPolicy.eligible(expiry,System.currentTimeMillis(),false,duplicate))return;
    org.json.JSONObject verified=!trustedSocket?NativePushApi.verify(context,data.get("deviceId"),room,call,null):null;
    if(!trustedSocket&&verified==null)return;
    seen.entrySet().removeIf(row->row.getValue()<System.currentTimeMillis());if(seen.size()>256)seen.remove(seen.keySet().iterator().next());seen.put(event,expiry);
    android.content.SharedPreferences prefs=context.getSharedPreferences("nc_notifications",0);android.content.SharedPreferences.Editor edit=prefs.edit();for(Map.Entry<String,?> row:prefs.getAll().entrySet())if(row.getKey().startsWith("seen.")&&row.getValue() instanceof Long&&(Long)row.getValue()<System.currentTimeMillis())edit.remove(row.getKey());java.util.List<Map.Entry<String,?>> receipts=new java.util.ArrayList<>();for(Map.Entry<String,?> row:prefs.getAll().entrySet())if(row.getKey().startsWith("seen.")&&row.getValue() instanceof Long)receipts.add(row);receipts.sort(java.util.Comparator.comparingLong(row->(Long)row.getValue()));while(receipts.size()>=512)edit.remove(receipts.remove(0).getKey());edit.putLong("seen."+event,expiry).apply();
    if(kind.equals("message")&&foreground&&room.equals(activeRoom))return;
    if(!permission(context))return;
    if(kind.equals("incoming-call")&&android.os.Build.VERSION.SDK_INT>=26&&context.getSystemService(NotificationManager.class).getNotificationChannel(CALLS).getImportance()==NotificationManager.IMPORTANCE_NONE)return;
    NotificationCompat.Builder builder=new NotificationCompat.Builder(context,kind.equals("message")?MESSAGES:CALLS).setSmallIcon(R.drawable.ic_nc_notification).setColor(Color.CYAN).setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setPublicVersion(new NotificationCompat.Builder(context,kind.equals("message")?MESSAGES:CALLS).setSmallIcon(R.drawable.ic_nc_notification).setContentTitle("NullChannel").setContentText(kind.equals("message")?"New message on NullChannel":"Incoming voice call").build()).setOnlyAlertOnce(true).setTimeoutAfter(Math.max(1,expiry-System.currentTimeMillis())).setContentIntent(launch(context,room,call,"open"));
    if(kind.equals("incoming-call")&&call!=null){if(!NotificationPolicy.invitationMatches(NativePeer.callId,call))return;
      String name=data.getOrDefault("peerName","Anonymous caller");if(!trustedSocket)name=verified.optString("peerName","Anonymous caller");
      builder.setContentTitle("Incoming NullChannel call").setContentText(name).setCategory(NotificationCompat.CATEGORY_CALL).setPriority(NotificationCompat.PRIORITY_HIGH).setStyle(NotificationCompat.CallStyle.forIncomingCall(new Person.Builder().setName(name).build(),action(context,room,call,"decline"),launch(context,room,call,"answer"))).setOngoing(true);
      // Full-screen launching is deliberately not requested; heads-up/lock-screen
      // presentation remains subject to platform/user channel eligibility.
      Notification notification=builder.build();post(context,id(call),notification);if(!trustedSocket)java.util.concurrent.CompletableFuture.runAsync(()->NativePushApi.verify(context,data.get("deviceId"),room,call,"ringing"));IncomingRingingService.start(context,call,expiry,notification,serviceEligible);
      String scope=data.getOrDefault("scope","guest");if(!trustedSocket){for(String candidate:new String[]{"account","guest"})try{String raw=NativeVault.get(context,"device."+candidate);if(raw!=null&&new org.json.JSONObject(raw).optString("deviceId").equals(data.get("deviceId")))scope=candidate;}catch(org.json.JSONException ignored){}}
      prefs.edit().putString("ringing",call).putString("call.kind."+call,scope).apply();
      if(!trustedSocket)NativeCallEvents.emit("incoming",new JSObject().put("callId",call).put("roomCode",room).put("peerName",name).put("expiresAt",expiry));
    }else if(kind.equals("message")){builder.setContentTitle("NullChannel").setContentText("New message on NullChannel").setAutoCancel(true).setGroup("nc.messages");post(context,id(room),builder.build());post(context,9002,new NotificationCompat.Builder(context,MESSAGES).setSmallIcon(R.drawable.ic_nc_notification).setContentTitle("NullChannel").setContentText("New message on NullChannel").setGroup("nc.messages").setGroupSummary(true).setSilent(true).setTimeoutAfter(Math.max(1,expiry-System.currentTimeMillis())).build());}
  }
  static Notification ongoing(Context context,String room,String call){channels(context);return new NotificationCompat.Builder(context,ONGOING).setSmallIcon(R.drawable.ic_nc_notification).setContentTitle("NullChannel voice call").setContentText("Microphone active").setOngoing(true).setCategory(NotificationCompat.CATEGORY_CALL).setContentIntent(launch(context,room,call,"open")).addAction(0,"End call",action(context,room,call,"end")).build();}
  private static void post(Context context,int id,Notification notification){
    if(android.os.Build.VERSION.SDK_INT>=33&&androidx.core.content.ContextCompat.checkSelfPermission(context,android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED)return;
    try{NotificationManagerCompat.from(context).notify(id,notification);}catch(SecurityException denied){/* Permission can be revoked after the check. */}
  }
  static void clearRoom(Context context,String room){NotificationManagerCompat.from(context).cancel(id(room));boolean messages=false;for(android.service.notification.StatusBarNotification row:context.getSystemService(NotificationManager.class).getActiveNotifications())if(row.getId()!=9002&&row.getNotification().getGroup()!=null&&row.getNotification().getGroup().equals("nc.messages"))messages=true;if(!messages)NotificationManagerCompat.from(context).cancel(9002);}
  static void clearSession(Context context,String kind){android.content.SharedPreferences prefs=context.getSharedPreferences("nc_notifications",0);for(Map.Entry<String,?> row:prefs.getAll().entrySet())if(row.getKey().startsWith("call.kind.")&&kind.equals(row.getValue())){String call=row.getKey().substring(10);NotificationManagerCompat.from(context).cancel(id(call));IncomingRingingService.stop(context,call);NativeRingtones.stopFor(call);prefs.edit().remove(row.getKey()).apply();}for(android.service.notification.StatusBarNotification row:context.getSystemService(NotificationManager.class).getActiveNotifications())if("nc.messages".equals(row.getNotification().getGroup()))NotificationManagerCompat.from(context).cancel(row.getId());}
  static void clear(Context context){NotificationManagerCompat.from(context).cancelAll();context.getSharedPreferences("nc_notifications",0).edit().clear().apply();seen.clear();context.stopService(new Intent(context,IncomingRingingService.class));NativeRingtones.stop();}
}
