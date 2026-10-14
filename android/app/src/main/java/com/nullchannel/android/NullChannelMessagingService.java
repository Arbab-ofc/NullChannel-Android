package com.nullchannel.android;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import com.getcapacitor.JSObject;
public final class NullChannelMessagingService extends FirebaseMessagingService {
  @Override public void onNewToken(String token){try{NativeVault.put(this,"fcm.token",token);}catch(Exception error){return;}PushTokenWorker.schedule(this);NativeCallEvents.emit("token",new JSObject());}
  @Override public void onMessageReceived(RemoteMessage message){NativeNotifications.receive(this,message.getData(),false,message.getPriority()==RemoteMessage.PRIORITY_HIGH);}
}
