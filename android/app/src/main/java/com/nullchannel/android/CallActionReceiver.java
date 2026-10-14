package com.nullchannel.android;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
public final class CallActionReceiver extends BroadcastReceiver {
  @Override public void onReceive(Context context,Intent intent){String call=intent.getStringExtra("callId"),room=intent.getStringExtra("roomCode"),action=intent.getAction();if(call==null||room==null||!call.matches("[a-fA-F0-9-]{36}")||!room.matches("[A-Z0-9]{8}"))return;
    if(!"decline".equals(action)&&!"end".equals(action))return;
    NativeRingtones.stopFor(call);IncomingRingingService.stop(context,call);androidx.core.app.NotificationManagerCompat.from(context).cancel(NativeNotifications.id(call));
    if("end".equals(action)&&call.equals(NativePeer.callId))NativePeer.end(context);
    PendingResult result=goAsync();java.util.concurrent.CompletableFuture.runAsync(()->{try{NativePushApi.verify(context,null,room,call,action);}finally{result.finish();}});
  }
}
