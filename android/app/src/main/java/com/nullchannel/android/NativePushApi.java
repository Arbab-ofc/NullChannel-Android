package com.nullchannel.android;
import android.content.Context;
import org.json.JSONObject;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import java.nio.charset.StandardCharsets;
final class NativePushApi {
  private static byte[] readBounded(java.io.InputStream in)throws java.io.IOException{java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();byte[] chunk=new byte[2048];int size;while((size=in.read(chunk))!=-1){if(out.size()+size>16384)throw new java.io.IOException("Response too large");out.write(chunk,0,size);}return out.toByteArray();}
  static boolean rotate(Context context,String token){boolean complete=true;
    for(String kind:new String[]{"account","guest"})try{
      String raw=NativeVault.get(context,"device."+kind);if(raw==null)continue;JSONObject record=new JSONObject(raw);URL url=new URL(new URL(record.getString("baseUrl")),"/api/mobile/push/devices/"+record.getString("deviceId")+"/token");if(!"https".equals(url.getProtocol()))continue;
      HttpsURLConnection connection=(HttpsURLConnection)url.openConnection();connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(3000);connection.setReadTimeout(3000);connection.setRequestMethod("POST");connection.setRequestProperty("Origin","https://localhost");connection.setRequestProperty("Content-Type","application/json");connection.setRequestProperty("X-NC-Device-Secret",record.getString("secret"));connection.setDoOutput(true);
      try(java.io.OutputStream out=connection.getOutputStream()){out.write(new JSONObject().put("token",token).toString().getBytes(StandardCharsets.UTF_8));}int status=connection.getResponseCode();if(status!=200&&status!=401)complete=false;connection.disconnect();
    }catch(Exception error){complete=false;}return complete;
  }
  static JSONObject verify(Context context,String deviceId,String roomCode,String callId,String action) {
    for(String kind:new String[]{"account","guest"}) {
      try {
        String raw=NativeVault.get(context,"device."+kind);if(raw==null)continue;JSONObject record=new JSONObject(raw);
        if(deviceId!=null&&!deviceId.equals(record.optString("deviceId")))continue;
        URL base=new URL(record.getString("baseUrl"));if(!"https".equals(base.getProtocol()))return null;
        URL url=new URL(base,"/api/mobile/push/devices/"+record.getString("deviceId")+"/verify");
        HttpsURLConnection connection=(HttpsURLConnection)url.openConnection();connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(3000);connection.setReadTimeout(3000);
        connection.setRequestMethod("POST");connection.setRequestProperty("Origin","https://localhost");connection.setRequestProperty("X-NC-Device-Secret",record.getString("secret"));connection.setRequestProperty("Content-Type","application/json");connection.setDoOutput(true);
        JSONObject body=new JSONObject().put("roomCode",roomCode);if(callId!=null)body.put("callId",callId);if(action!=null)body.put("action",action);
        try(java.io.OutputStream out=connection.getOutputStream()){out.write(body.toString().getBytes(StandardCharsets.UTF_8));}
        try {if(connection.getResponseCode()!=200)continue;try(java.io.InputStream in=connection.getInputStream()){return new JSONObject(new String(readBounded(in),StandardCharsets.UTF_8)).getJSONObject("data");}}finally{connection.disconnect();}
      }catch(Exception error){/* Provider/network errors and proofs are never logged. */}
    }return null;
  }
}
