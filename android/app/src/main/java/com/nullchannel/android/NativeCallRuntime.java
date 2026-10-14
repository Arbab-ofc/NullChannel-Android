package com.nullchannel.android;
import android.content.Context;
import io.socket.client.IO;
import io.socket.client.Socket;
import org.json.*;
import java.util.concurrent.CompletableFuture;
/** Native dependencies are replaceable only from package-local framework tests. */
class NativeCallRuntime {
    boolean allowedBase(String base){return NativeCallAuth.validBase(base);}
    void startService(Context context,String id){if(androidx.core.content.ContextCompat.checkSelfPermission(context,android.Manifest.permission.RECORD_AUDIO)!=android.content.pm.PackageManager.PERMISSION_GRANTED)throw new IllegalStateException("Microphone permission denied");androidx.core.content.ContextCompat.startForegroundService(context,new android.content.Intent(context,CallForegroundService.class).putExtra("callId",id));}
    JSONObject credentials(Context context,String base,String kind,boolean force)throws Exception{return NativeCallAuth.credentials(context,base,kind,force);}
    JSONObject get(Context context,String base,String kind,String path)throws Exception{return NativeCallAuth.request(base,path,"GET",credentials(context,base,kind,false).getString("accessToken"),null).getJSONObject("data");}
    Socket socket(String base,IO.Options options)throws Exception{return IO.socket(base,options);}
    CompletableFuture<Void> start(Context context,String id,String room,JSONArray ice,int connect,int disconnect){return NativePeer.start(context,id,room,ice,connect,disconnect);}
    CompletableFuture<Void> configure(String id,JSONArray ice){return NativePeer.configure(id,ice);}
    CompletableFuture<String> offer(String id,int revision,boolean restart){return NativePeer.offer(id,revision,restart);}
    CompletableFuture<String> description(String id,String kind,int revision,String sdp){return NativePeer.description(id,kind,revision,sdp);}
    CompletableFuture<Void> candidate(String id,JSONObject value){return NativePeer.candidate(id,value);}
    void end(Context context){NativePeer.end(context);}
}
