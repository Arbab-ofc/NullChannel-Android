package com.nullchannel.android;
import static org.junit.Assert.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import okhttp3.*;
import okhttp3.mockwebserver.*;
import org.json.*;
import java.util.*;
import java.util.concurrent.*;
import io.socket.client.IO;
import io.socket.client.Socket;
/** Real Java Socket.IO over a loopback protocol fixture; media/credentials are synthetic. */
@RunWith(RobolectricTestRunner.class) @Config(sdk=28)
public class NativeSignalingIntegrationTest {
    MockWebServer server;WebSocket remote;String id="11111111-1111-4111-8111-111111111111";volatile int offers,captures,iceRequests,descriptions,connections;volatile boolean accept=true;volatile boolean expire=false;volatile boolean authenticated=false;
    @Before public void setup()throws Exception{server=new MockWebServer();WebSocketListener listener=new WebSocketListener(){
        @Override public void onOpen(WebSocket socket,Response response){remote=socket;connections++;socket.send("0{\"sid\":\"fixture\",\"upgrades\":[],\"pingInterval\":25000,\"pingTimeout\":20000}");}
        @Override public void onClosing(WebSocket socket,int code,String reason){socket.close(code,reason);}
        @Override public void onMessage(WebSocket socket,String text){try{if(text.startsWith("40")){JSONObject auth=new JSONObject(text.substring(2));authenticated=auth.getString("guestToken").equals("a".repeat(64))&&auth.getString("roomCode").equals("TEST1234");socket.send("40{\"sid\":\"fixture-socket\"}");return;}if(!text.startsWith("42"))return;int start=text.indexOf('[');String ack=text.substring(2,start);JSONArray packet=new JSONArray(text.substring(start));String event=packet.getString(0);JSONObject data=packet.getJSONObject(1);
            if(event.equals("join-room")){socket.send("42[\"room-joined\",{\"code\":\"TEST1234\"}]");return;}
            JSONObject response=NativeCallSignaling.object("ok",true,"callId",id);
            if(event.equals("call:invite")){socket.send("42[\"call:outgoing\","+NativeCallSignaling.object("callId",id,"roomCode","TEST1234","expiresAt",System.currentTimeMillis()+30000)+"]");socket.send("43"+ack+"["+response+"]");if(accept)socket.send("42[\"call:accepted\","+NativeCallSignaling.object("callId",id,"snapshot",snapshot())+"]");return;}
            if(event.equals("call:resume")){response.put("snapshot",snapshot()).put("replay",new JSONArray());}
            socket.send("43"+ack+"["+response+"]");
            if(event.equals("call:offer")){offers++;socket.send("42[\"call:answer\","+NativeCallSignaling.object("callId",id,"signalId",UUID.randomUUID().toString(),"revision",data.getInt("revision"),"sdp","fixture-answer")+"]");}
        }catch(Exception invalid){socket.close(1008,"Fixture rejected");}}
    };server.enqueue(new MockResponse().withWebSocketUpgrade(listener));server.enqueue(new MockResponse().withWebSocketUpgrade(listener));server.start();NativeCallSignaling.dependencies=new NativeCallRuntime(){
        @Override void startService(android.content.Context context,String id){/* Framework policy is tested separately; this fixture supplies no hardware media. */}
        @Override boolean allowedBase(String base){return base.equals("https://fixture.invalid");}
        @Override JSONObject credentials(android.content.Context context,String base,String kind,boolean force)throws Exception{if(expire)throw new NativeCallAuth.Expired();return NativeCallSignaling.object("accessToken","a".repeat(64),"identityId","22222222-2222-4222-8222-222222222222");}
        @Override JSONObject get(android.content.Context context,String base,String kind,String path)throws Exception{credentials(context,base,kind,false);if(path.endsWith("ice-servers"))iceRequests++;return path.endsWith("ice-servers")?NativeCallSignaling.object("iceServers",new JSONArray(),"expiresAt",System.currentTimeMillis()/1000+1):NativeCallSignaling.object("snapshot",snapshot());}
        @Override Socket socket(String base,IO.Options options)throws Exception{return IO.socket(server.url("/").toString(),options);}
        @Override CompletableFuture<Void> start(android.content.Context context,String call,String room,JSONArray ice,int connect,int disconnect){captures++;NativePeer.callId=call;return CompletableFuture.completedFuture(null);}
        @Override CompletableFuture<Void> configure(String call,JSONArray ice){return CompletableFuture.completedFuture(null);}
        @Override CompletableFuture<String> offer(String call,int revision,boolean restart){return CompletableFuture.completedFuture("fixture-offer");}
        @Override CompletableFuture<String> description(String call,String kind,int revision,String sdp){descriptions++;NativeCallSignaling.media("state",NativeCallSignaling.js(NativeCallSignaling.object("callId",call,"state","connected")));return CompletableFuture.completedFuture("");}
        @Override void end(android.content.Context context){NativePeer.callId="";}
    };}
    JSONObject snapshot(){return NativeCallSignaling.object("callId",id,"stateVersion",1,"revision",1,"ready",NativeCallSignaling.object("caller",true,"callee",true),"deadline",System.currentTimeMillis()+20000,"roomExpiresAt",java.time.Instant.now().plusSeconds(3600).toString());}
    void waitFor(java.util.function.BooleanSupplier condition)throws Exception{long until=System.currentTimeMillis()+5000;while(!condition.getAsBoolean()&&System.currentTimeMillis()<until)Thread.sleep(20);assertTrue("phase="+NativeCallSignaling.snapshot().optString("phase")+", message="+NativeCallSignaling.snapshot().optString("message")+", connections="+connections+", offers="+offers,condition.getAsBoolean());}
    @After public void cleanup()throws Exception{NativeCallSignaling.command("end");waitFor(()->!NativeCallSignaling.owns(id));NativeCallSignaling.dependencies=new NativeCallRuntime();NativePeer.callId="";server.shutdown();}
    @Test public void authenticatesNegotiatesAndEndsWithoutAnyWebviewOwner()throws Exception{NativeCallSignaling.begin(RuntimeEnvironment.getApplication(),NativeCallSignaling.object("baseUrl","https://fixture.invalid","roomCode","TEST1234","kind","guest")).get(5,TimeUnit.SECONDS);waitFor(()->NativeCallSignaling.snapshot().optString("phase").equals("connected"));assertTrue(authenticated);assertEquals(1,captures);assertEquals(1,offers);NativeCallSignaling.command("end");waitFor(()->!NativeCallSignaling.owns(id)&&NativePeer.callId.isEmpty());assertEquals("",NativePeer.callId);}
    @Test public void remoteHangupReleasesNativeOwnerAndTransport()throws Exception{NativeCallSignaling.begin(RuntimeEnvironment.getApplication(),NativeCallSignaling.object("baseUrl","https://fixture.invalid","roomCode","TEST1234","kind","guest")).get(5,TimeUnit.SECONDS);waitFor(()->NativeCallSignaling.snapshot().optString("phase").equals("connected"));remote.send("42[\"call:ended\",{\"callId\":\""+id+"\"}]");waitFor(()->!NativeCallSignaling.owns(id)&&NativePeer.callId.isEmpty());assertEquals("",NativePeer.callId);}
    @Test public void reconnectsNativeTransportWithoutRecapturingHealthyMedia()throws Exception{NativeCallSignaling.begin(RuntimeEnvironment.getApplication(),NativeCallSignaling.object("baseUrl","https://fixture.invalid","roomCode","TEST1234","kind","guest")).get(5,TimeUnit.SECONDS);waitFor(()->NativeCallSignaling.snapshot().optString("phase").equals("connected"));NativeCallSignaling.network(true,"fixture-wifi");NativeCallSignaling.network(true,"fixture-mobile");waitFor(()->connections==2&&NativeCallSignaling.snapshot().optString("phase").equals("connected"));assertEquals(1,captures);assertEquals(1,offers);}
    @Test public void restartsIceAndRefreshesExpiredTurnLeaseInNativeOwner()throws Exception{NativeCallSignaling.begin(RuntimeEnvironment.getApplication(),NativeCallSignaling.object("baseUrl","https://fixture.invalid","roomCode","TEST1234","kind","guest")).get(5,TimeUnit.SECONDS);waitFor(()->NativeCallSignaling.snapshot().optString("phase").equals("connected"));NativeCallSignaling.media("state",NativeCallSignaling.js(NativeCallSignaling.object("callId",id,"state","reconnecting")));waitFor(()->offers==2&&NativeCallSignaling.snapshot().optString("phase").equals("connected"));assertEquals(1,captures);assertTrue(iceRequests>=2);}
    @Test public void sessionExpirationEndsMediaAndSignalingWithoutJavascript()throws Exception{NativeCallSignaling.begin(RuntimeEnvironment.getApplication(),NativeCallSignaling.object("baseUrl","https://fixture.invalid","roomCode","TEST1234","kind","guest")).get(5,TimeUnit.SECONDS);waitFor(()->NativeCallSignaling.snapshot().optString("phase").equals("connected"));expire=true;NativeCallSignaling.refreshAuthentication();waitFor(()->!NativeCallSignaling.owns(id)&&NativePeer.callId.isEmpty());}
    @Test public void cancellationBeforeAnswerDoesNotCaptureMicrophone()throws Exception{accept=false;NativeCallSignaling.begin(RuntimeEnvironment.getApplication(),NativeCallSignaling.object("baseUrl","https://fixture.invalid","roomCode","TEST1234","kind","guest")).get(5,TimeUnit.SECONDS);NativeCallSignaling.command("end");waitFor(()->!NativeCallSignaling.owns(id));assertEquals(0,captures);}
    @Test public void activityRecreationObservesHealthyOwnerWithoutNewMediaOrSignaling()throws Exception{NativeCallSignaling.begin(RuntimeEnvironment.getApplication(),NativeCallSignaling.object("baseUrl","https://fixture.invalid","roomCode","TEST1234","kind","guest")).get(5,TimeUnit.SECONDS);waitFor(()->NativeCallSignaling.snapshot().optString("phase").equals("connected"));android.os.Bundle saved=new android.os.Bundle();saved.putString("callId",id);org.robolectric.android.controller.ActivityController<NativeIncomingCallActivity> activity=Robolectric.buildActivity(NativeIncomingCallActivity.class).create(saved);assertFalse(activity.get().isFinishing());assertEquals(1,captures);assertEquals(1,connections);activity.destroy();assertTrue(NativeCallSignaling.owns(id));}

}
