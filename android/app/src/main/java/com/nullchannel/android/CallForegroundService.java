package com.nullchannel.android;
import android.app.Service;
import android.content.*;
import android.os.*;
import android.content.pm.ServiceInfo;
import androidx.core.app.ServiceCompat;
/** User-started microphone service; pending calls acquire permission before backgrounding. */
public final class CallForegroundService extends Service {
  private static CallForegroundService active;
  private String owner="";
  static void stop(Context context,String callId,String ownershipId){new Handler(Looper.getMainLooper()).post(()->{CallForegroundService service=active;if(service!=null&&(service.owner.equals(callId)||service.owner.equals(ownershipId)))service.stopSelf();});}
  @Override public int onStartCommand(Intent intent,int flags,int startId){String id=intent==null?null:intent.getStringExtra("callId");if(id==null||!id.equals(NativePeer.callId)&&!NativeCallSignaling.owns(id)){stopSelf();return START_NOT_STICKY;}
    active=this;owner=id;String room=id.equals(NativePeer.callId)?NativePeer.roomCode:NativeCallSignaling.snapshot().optString("roomCode");
    ServiceCompat.startForeground(this,9001,NativeNotifications.ongoing(this,room,id,!id.equals(NativePeer.callId)),Build.VERSION.SDK_INT>=30?ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE:0);return START_NOT_STICKY;}
  @Override public void onDestroy(){if(active==this)active=null;if(!owner.isEmpty()){if(owner.equals(NativePeer.callId))NativePeer.end(this);else if(NativeCallSignaling.owns(owner))NativeCallSignaling.command("end",owner);}super.onDestroy();}
  @Override public IBinder onBind(Intent intent){return null;}
}
