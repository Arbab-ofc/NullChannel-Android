package com.nullchannel.android;
import android.app.Notification;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import androidx.core.app.ServiceCompat;
/** Bounded ringtone service; never starts a microphone from an incoming push. */
public final class IncomingRingingService extends Service {
  private static volatile String current="";
  private String owner="";
  private android.os.Vibrator vibrator;
  private final Handler handler=new Handler(Looper.getMainLooper());
  static boolean start(Context context,String callId,long expires,Notification notification,boolean eligible){if(!eligible)return false;try{androidx.core.content.ContextCompat.startForegroundService(context,new Intent(context,IncomingRingingService.class).putExtra("callId",callId).putExtra("expiresAt",expires).putExtra("notification",notification));current=callId;return true;}catch(IllegalStateException|SecurityException restricted){return false;}}
  static void stop(Context context,String callId){if(callId!=null&&callId.equals(current)){current="";context.stopService(new Intent(context,IncomingRingingService.class));}}
  @Override public int onStartCommand(Intent intent,int flags,int startId){if(intent==null){stopSelf();return START_NOT_STICKY;}String id=intent.getStringExtra("callId");long expires=intent.getLongExtra("expiresAt",0);Notification notification=intent.getParcelableExtra("notification");if(id==null||notification==null||expires<=System.currentTimeMillis()){stopSelf();return START_NOT_STICKY;}owner=id;current=id;handler.removeCallbacksAndMessages(null);
    ServiceCompat.startForeground(this,NativeNotifications.id(id),notification,Build.VERSION.SDK_INT>=29?ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK:0);
    android.media.AudioManager audio=getSystemService(android.media.AudioManager.class);android.app.NotificationManager notifications=getSystemService(android.app.NotificationManager.class);
    boolean vibration=audio.getRingerMode()!=android.media.AudioManager.RINGER_MODE_SILENT&&notifications.getCurrentInterruptionFilter()==android.app.NotificationManager.INTERRUPTION_FILTER_ALL;
    if(Build.VERSION.SDK_INT>=26)vibration&=notifications.getNotificationChannel(NativeNotifications.CALLS).shouldVibrate();
    if(vibration){vibrator=Build.VERSION.SDK_INT>=31?getSystemService(android.os.VibratorManager.class).getDefaultVibrator():(android.os.Vibrator)getSystemService(VIBRATOR_SERVICE);long[] pattern=new long[]{0,300,300};if(vibrator.hasVibrator()){if(Build.VERSION.SDK_INT>=33)vibrator.vibrate(android.os.VibrationEffect.createWaveform(pattern,0),new android.os.VibrationAttributes.Builder().setUsage(android.os.VibrationAttributes.USAGE_RINGTONE).build());else if(Build.VERSION.SDK_INT>=26)vibrator.vibrate(android.os.VibrationEffect.createWaveform(pattern,0),new android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION_RINGTONE).build());else vibrator.vibrate(pattern,0);}}
    handler.postDelayed(()->{if(owner.equals(current))NativeRingtones.play(this,owner,"incoming",expires);},1400);
    handler.postDelayed(this::stopSelf,Math.min(60000,expires-System.currentTimeMillis()));return START_NOT_STICKY;}
  @Override public void onDestroy(){handler.removeCallbacksAndMessages(null);if(vibrator!=null&&(current.isEmpty()||owner.equals(current)))vibrator.cancel();NativeRingtones.stopFor(owner);if(owner.equals(current))current="";super.onDestroy();}
  @Override public IBinder onBind(Intent intent){return null;}
}
