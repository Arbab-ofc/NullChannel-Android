package com.nullchannel.android;

import android.content.Context;
import org.json.JSONObject;
import javax.net.ssl.HttpsURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Shared native renewal lock; React also renews through this owner on Android. */
final class NativeCallAuth {
    static final class Unavailable extends java.io.IOException {final int status;Unavailable(int status){super("Call request unavailable");this.status=status;}}
    static final class Expired extends Exception {}
    static String key(String kind){if(!"guest".equals(kind)&&!"account".equals(kind))throw new IllegalArgumentException("Invalid session scope");return "mobile."+kind+".bundle";}
    static boolean validBase(String base){return base!=null&&base.equals(BuildConfig.CALL_API_ORIGIN);}
    interface BundleStore {String read()throws Exception;void write(String value)throws Exception;void remove();}
    interface Renewal {JSONObject exchange(String refresh)throws Exception;}
    static synchronized JSONObject rotate(BundleStore store,Renewal renewal,boolean force,long now)throws Exception {
        String raw=store.read();if(raw==null)throw new Expired();JSONObject old=new JSONObject(raw);
        if(!force&&java.time.Instant.parse(old.getString("accessExpiresAt")).toEpochMilli()>now+120000)return old;
        if(java.time.Instant.parse(old.getString("refreshExpiresAt")).toEpochMilli()<=now){store.remove();throw new Expired();}
        JSONObject next;try{next=renewal.exchange(old.getString("refreshToken"));}catch(Expired ended){store.remove();throw ended;}
        String current=store.read();if(current==null||!new JSONObject(current).optString("refreshToken").equals(old.getString("refreshToken")))throw new Expired();
        if(!next.optString("accessToken").matches("[a-f0-9]{64}")||!next.optString("refreshToken").matches("[a-f0-9]{64}"))throw new Exception("Invalid renewal response");
        if(next.isNull("identityId")&&!old.isNull("identityId"))next.put("identityId",old.opt("identityId"));store.write(next.toString());return next;
    }
    static synchronized JSONObject credentials(Context context,String base,String kind,boolean force)throws Exception {
        if(!validBase(base))throw new IllegalArgumentException("Unapproved backend origin");String name=key(kind);BundleStore store=new BundleStore(){public String read()throws Exception{return SecureCredentialStorePlugin.read(context,name);}public void write(String value)throws Exception{SecureCredentialStorePlugin.write(context,name,value);}public void remove(){context.getSharedPreferences("nullchannel_secure_credentials",0).edit().remove(name).commit();}};
        try{JSONObject value=rotate(store,refresh->request(base,"/api/mobile/auth/refresh","POST",refresh,null).getJSONObject("data"),force,System.currentTimeMillis());NativeCallEvents.emit("credentials-renewed",new com.getcapacitor.JSObject().put("kind",kind));return value;}
        catch(Expired expired){NativeCallEvents.emit("session-ended",new com.getcapacitor.JSObject().put("kind",kind));throw expired;}
    }
    static JSONObject request(String base,String path,String method,String token,JSONObject body)throws Exception {
        if(!validBase(base)||!path.startsWith("/api/"))throw new IllegalArgumentException("HTTPS backend required");
        HttpsURLConnection connection=(HttpsURLConnection)new URL(base+path).openConnection();connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(4000);connection.setReadTimeout(4000);connection.setRequestMethod(method);connection.setRequestProperty("Origin","https://localhost");connection.setRequestProperty("Authorization","Bearer "+token);connection.setRequestProperty("Content-Type","application/json");
        try{if(body!=null){connection.setDoOutput(true);try(java.io.OutputStream out=connection.getOutputStream()){out.write(body.toString().getBytes(StandardCharsets.UTF_8));}}
            int status=connection.getResponseCode();if(status==401)throw new Expired();if(status!=200)throw new Unavailable(status);
            try(java.io.InputStream in=connection.getInputStream();java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream()){byte[] bytes=new byte[4096];int count;while((count=in.read(bytes))!=-1){if(out.size()+count>98304)throw new java.io.IOException("Response limit");out.write(bytes,0,count);}return new JSONObject(out.toString("UTF-8"));}
        }finally{connection.disconnect();}
    }
}
