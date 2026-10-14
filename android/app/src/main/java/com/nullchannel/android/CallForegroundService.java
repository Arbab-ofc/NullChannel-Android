package com.nullchannel.android;
import android.app.Service;
import android.content.Intent;
import android.os.IBinder;
import android.os.Build;
import android.content.pm.ServiceInfo;
import androidx.core.app.ServiceCompat;
public final class CallForegroundService extends Service {
  private String owner="";
  @Override public int onStartCommand(Intent intent,int flags,int startId){String id=intent==null?null:intent.getStringExtra("callId");if(id==null||!id.equals(NativePeer.callId)){stopSelf();return START_NOT_STICKY;}
    owner=id;ServiceCompat.startForeground(this,9001,NativeNotifications.ongoing(this,NativePeer.roomCode,id),Build.VERSION.SDK_INT>=30?ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE:0);return START_NOT_STICKY;}
  @Override public void onDestroy(){super.onDestroy();if(!owner.isEmpty()&&owner.equals(NativePeer.callId))NativePeer.end(this);}
  @Override public IBinder onBind(Intent intent){return null;}
}
