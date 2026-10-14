package com.nullchannel.android;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.app.NotificationManager;
import android.os.Handler;
import android.os.Looper;
final class NativeRingtones {
  private static MediaPlayer player;
  private static String owner="";
  private static final Handler handler=new Handler(Looper.getMainLooper());
  static synchronized void stop(){handler.removeCallbacksAndMessages(null);if(player!=null){player.stop();player.release();player=null;}owner="";}
  static synchronized void stopFor(String id){if(owner.equals(id))stop();}
  static synchronized void play(Context context,String id,String tone,long until) {
    if(id.equals(owner)&&player!=null)return;stop();if(until<=System.currentTimeMillis())return;
    AudioManager audio=(AudioManager)context.getSystemService(Context.AUDIO_SERVICE);
    NotificationManager notifications=context.getSystemService(NotificationManager.class);
    if(audio.getRingerMode()!=AudioManager.RINGER_MODE_NORMAL||notifications.getCurrentInterruptionFilter()!=NotificationManager.INTERRUPTION_FILTER_ALL)return;
    if(tone.equals("incoming")&&android.os.Build.VERSION.SDK_INT>=26){android.app.NotificationChannel channel=notifications.getNotificationChannel(NativeNotifications.CALLS);if(channel!=null&&(channel.getImportance()==NotificationManager.IMPORTANCE_NONE||channel.getSound()==null))return;}
    int resource=switch(tone){case "incoming"->R.raw.nc_incoming;case "ringback"->R.raw.nc_ringback;case "connected"->R.raw.nc_connected;default->R.raw.nc_ended;};
    try {android.content.res.AssetFileDescriptor source=context.getResources().openRawResourceFd(resource);
      MediaPlayer next=new MediaPlayer();next.setAudioAttributes(new AudioAttributes.Builder().setUsage(tone.equals("incoming")?AudioAttributes.USAGE_NOTIFICATION_RINGTONE:AudioAttributes.USAGE_VOICE_COMMUNICATION_SIGNALLING).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
      next.setDataSource(source.getFileDescriptor(),source.getStartOffset(),source.getLength());source.close();next.setLooping(tone.equals("incoming")||tone.equals("ringback"));next.prepare();next.setOnCompletionListener(done->{synchronized(NativeRingtones.class){if(player==done)stop();}});player=next;owner=id;next.start();handler.postDelayed(()->{synchronized(NativeRingtones.class){if(player==next)stop();}},Math.min(60000,until-System.currentTimeMillis()));
    }catch(Exception error){stop();}
  }
}
