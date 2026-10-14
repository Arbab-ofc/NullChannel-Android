package com.nullchannel.android;
import static org.junit.Assert.*;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioManager;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import java.util.Map;
@RunWith(RobolectricTestRunner.class)
@Config(sdk=28)
public class NativeCallingTest {
  Context context;
  @Before public void setup(){context=RuntimeEnvironment.getApplication();NativeNotifications.clear(context);NativeNotifications.foreground=false;NativeNotifications.activeRoom="";}
  @After public void cleanup(){NativeNotifications.clear(context);}
  @Test public void expiresAndDeduplicatesBeforeDisplaying(){long now=System.currentTimeMillis();assertFalse(NotificationPolicy.eligible(now-1,now,false,false));assertFalse(NotificationPolicy.eligible(now+100,now,true,false));assertFalse(NotificationPolicy.eligible(now+100,now,false,true));assertTrue(NotificationPolicy.eligible(now+100,now,false,false));}
  @Test public void createsSeparateChannelsAndNeverIncludesMessageContent(){NativeNotifications.channels(context);NotificationManager manager=context.getSystemService(NotificationManager.class);assertNotNull(manager.getNotificationChannel(NativeNotifications.CALLS));assertEquals(NotificationManager.IMPORTANCE_HIGH,manager.getNotificationChannel(NativeNotifications.CALLS).getImportance());
    Map<String,String> data=Map.of("kind","message","eventId","one","roomCode","TEST1234","expiresAt",String.valueOf(System.currentTimeMillis()+60000),"content","PRIVATE TEXT MUST NOT APPEAR");NativeNotifications.receive(context,data,true);
    boolean found=false;for(android.service.notification.StatusBarNotification row:manager.getActiveNotifications()){assertFalse(row.getNotification().extras.toString().contains("PRIVATE TEXT"));if(row.getId()==NativeNotifications.id("TEST1234"))found=true;}assertTrue(found);
    NativeNotifications.clearRoom(context,"TEST1234");for(android.service.notification.StatusBarNotification row:manager.getActiveNotifications())assertNotEquals(NativeNotifications.id("TEST1234"),row.getId());}
  @Test public void suppressesForegroundActiveChatAndDuplicatePush(){NativeNotifications.foreground=true;NativeNotifications.activeRoom="TEST1234";Map<String,String> data=Map.of("kind","message","eventId","one","roomCode","TEST1234","expiresAt",String.valueOf(System.currentTimeMillis()+60000));NativeNotifications.receive(context,data,true);assertEquals(0,context.getSystemService(NotificationManager.class).getActiveNotifications().length);NativeNotifications.foreground=false;NativeNotifications.receive(context,data,true);assertEquals(0,context.getSystemService(NotificationManager.class).getActiveNotifications().length);data=Map.of("kind","message","eventId","two","roomCode","TEST1234","expiresAt",String.valueOf(System.currentTimeMillis()+60000));NativeNotifications.receive(context,data,true);int count=context.getSystemService(NotificationManager.class).getActiveNotifications().length;NativeNotifications.receive(context,data,true);assertEquals(count,context.getSystemService(NotificationManager.class).getActiveNotifications().length);}
  @Test public void restoresAudioModeAndSpeakerAfterCall(){AudioManager manager=context.getSystemService(AudioManager.class);manager.setMode(AudioManager.MODE_NORMAL);manager.setSpeakerphoneOn(false);NativeAudioController controller=new NativeAudioController(context);controller.begin();assertEquals(AudioManager.MODE_IN_COMMUNICATION,manager.getMode());controller.route("speaker");assertTrue(manager.isSpeakerphoneOn());controller.route("earpiece");assertFalse(manager.isSpeakerphoneOn());controller.end();controller.end();assertEquals(AudioManager.MODE_NORMAL,manager.getMode());assertFalse(manager.isSpeakerphoneOn());}
  @Test public void deniedAudioFocusRestoresModeWithoutStartingACommunicationSession(){AudioManager manager=context.getSystemService(AudioManager.class);manager.setMode(AudioManager.MODE_NORMAL);org.robolectric.Shadows.shadowOf(manager).setNextFocusRequestResponse(AudioManager.AUDIOFOCUS_REQUEST_FAILED);try{new NativeAudioController(context).begin();fail("Expected audio focus denial");}catch(IllegalStateException expected){assertEquals(AudioManager.MODE_NORMAL,manager.getMode());}}
  @Test @Config(sdk=32) public void bluetoothRemovalFallsBackToEarpieceAndReleasesFocus(){
    org.robolectric.Shadows.shadowOf(RuntimeEnvironment.getApplication()).grantPermissions(android.Manifest.permission.BLUETOOTH_CONNECT);
    AudioManager manager=context.getSystemService(AudioManager.class);org.robolectric.shadows.ShadowAudioManager shadow=org.robolectric.Shadows.shadowOf(manager);
    android.media.AudioDeviceInfo bluetooth=org.robolectric.shadows.AudioDeviceInfoBuilder.newBuilder().setType(android.media.AudioDeviceInfo.TYPE_BLUETOOTH_SCO).build();android.media.AudioDeviceInfo earpiece=org.robolectric.shadows.AudioDeviceInfoBuilder.newBuilder().setType(android.media.AudioDeviceInfo.TYPE_BUILTIN_EARPIECE).build();shadow.setAvailableCommunicationDevices(java.util.Arrays.asList(bluetooth,earpiece));
    NativeAudioController controller=new NativeAudioController(context);controller.begin();assertSame(bluetooth,manager.getCommunicationDevice());shadow.removeAvailableCommunicationDevice(bluetooth,true);org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idle();assertSame(earpiece,manager.getCommunicationDevice());controller.end();assertNotNull(shadow.getLastAbandonedAudioFocusRequest());
  }
  @Test @Config(sdk=33) public void notificationsRequireRuntimePermission(){org.robolectric.Shadows.shadowOf(RuntimeEnvironment.getApplication()).denyPermissions(android.Manifest.permission.POST_NOTIFICATIONS);assertFalse(NativeNotifications.permission(context));org.robolectric.Shadows.shadowOf(RuntimeEnvironment.getApplication()).grantPermissions(android.Manifest.permission.POST_NOTIFICATIONS);assertTrue(NativeNotifications.permission(context));}
  @Test public void silentModeAndDndNeverStartRinging()throws Exception{AudioManager audio=context.getSystemService(AudioManager.class);audio.setRingerMode(AudioManager.RINGER_MODE_SILENT);NativeRingtones.play(context,"incoming","incoming",System.currentTimeMillis()+30000);java.lang.reflect.Field player=NativeRingtones.class.getDeclaredField("player");player.setAccessible(true);assertNull(player.get(null));NativeRingtones.stop();assertNull(player.get(null));audio.setRingerMode(AudioManager.RINGER_MODE_NORMAL);context.getSystemService(NotificationManager.class).setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_NONE);NativeRingtones.play(context,"dnd","incoming",System.currentTimeMillis()+30000);assertNull(player.get(null));}
  @Test public void ringingLoopsReplacesItsOwnerAndStopsOnTimeout()throws Exception{
    org.robolectric.shadows.ShadowMediaPlayer.setMediaInfoProvider(data->new org.robolectric.shadows.ShadowMediaPlayer.MediaInfo(10000,0));
    context.getSystemService(AudioManager.class).setRingerMode(AudioManager.RINGER_MODE_NORMAL);context.getSystemService(NotificationManager.class).setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_ALL);
    java.lang.reflect.Field field=NativeRingtones.class.getDeclaredField("player");field.setAccessible(true);
    NativeRingtones.play(context,"first","incoming",System.currentTimeMillis()+1000);android.media.MediaPlayer first=(android.media.MediaPlayer)field.get(null);assertNotNull(first);assertTrue(first.isLooping());
    NativeRingtones.play(context,"second","incoming",System.currentTimeMillis()+5000);android.media.MediaPlayer second=(android.media.MediaPlayer)field.get(null);assertNotNull(second);assertNotSame(first,second);
    NativeRingtones.stopFor("first");assertSame(second,field.get(null));org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idleFor(java.time.Duration.ofSeconds(2));assertSame(second,field.get(null));
    org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idleFor(java.time.Duration.ofSeconds(4));assertNull(field.get(null));
  }
  @Test public void incomingNotificationUsesExplicitPrivateAnswerAndDeclineActions(){
    String id="98f091a1-0b23-45b2-abcd-17381d5158f9";NativeNotifications.receive(context,Map.of("kind","incoming-call","eventId",id,"callId",id,"roomCode","TEST1234","peerName","Ghost","expiresAt",String.valueOf(System.currentTimeMillis()+30000)),true,false);
    android.app.Notification notification=null;for(android.service.notification.StatusBarNotification row:context.getSystemService(NotificationManager.class).getActiveNotifications())if(row.getId()==NativeNotifications.id(id))notification=row.getNotification();
    assertNotNull(notification);assertEquals(android.app.Notification.VISIBILITY_PRIVATE,notification.visibility);assertEquals(2,notification.actions.length);
    android.content.Intent decline=org.robolectric.Shadows.shadowOf(notification.actions[0].actionIntent).getSavedIntent();android.content.Intent answer=org.robolectric.Shadows.shadowOf(notification.actions[1].actionIntent).getSavedIntent();
    assertEquals(CallActionReceiver.class.getName(),decline.getComponent().getClassName());assertEquals(MainActivity.class.getName(),answer.getComponent().getClassName());assertEquals("answer",answer.getStringExtra("callAction"));
  }
  @Test public void foregroundServiceDoesNotRestartWithoutAValidMediaOwner(){CallForegroundService service=org.robolectric.Robolectric.buildService(CallForegroundService.class).create().get();assertEquals(android.app.Service.START_NOT_STICKY,service.onStartCommand(null,0,1));service.onDestroy();}
  @Test public void forgedAndReplayedLaunchProofsAreRejected(){assertNull(NativeVault.consumeAction(context,null));assertNull(NativeVault.consumeAction(context,"forged"));String nonce="98f091a1-0b23-45b2-abcd-17381d5158f9";context.getSharedPreferences("nc_native_vault",0).edit().putString("action."+nonce+"."+(System.currentTimeMillis()+60000),"not-an-encrypted-proof").commit();assertNull(NativeVault.consumeAction(context,nonce));assertNull(NativeVault.consumeAction(context,nonce));}
  @Test public void nativeAppPluginIsActuallyRegistered()throws Exception{try(java.io.InputStream in=context.getAssets().open("capacitor.plugins.json")){String plugins=new String(in.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);assertTrue(plugins.contains("com.capacitorjs.plugins.app.AppPlugin"));}}
}
