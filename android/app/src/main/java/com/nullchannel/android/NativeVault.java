package com.nullchannel.android;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;

/** Android Keystore storage for notification-device proofs and FCM tokens. */
final class NativeVault {
  private static final String ALIAS="nullchannel.native.push.v1";
  private static SecretKey key() throws Exception {
    KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);
    if(ks.getKey(ALIAS,null) instanceof SecretKey)return (SecretKey)ks.getKey(ALIAS,null);
    KeyGenerator generator=KeyGenerator.getInstance("AES","AndroidKeyStore");
    generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());return generator.generateKey();
  }
  static synchronized void put(Context context,String name,String value) throws Exception {
    Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key());byte[] data=c.doFinal(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
    byte[] packed=Arrays.copyOf(c.getIV(),12+data.length);System.arraycopy(data,0,packed,12,data.length);
    if(!context.getSharedPreferences("nc_native_vault",0).edit().putString(name,Base64.encodeToString(packed,Base64.NO_WRAP)).commit())throw new Exception("Secure storage unavailable");
  }
  static synchronized String get(Context context,String name) {
    try {String value=context.getSharedPreferences("nc_native_vault",0).getString(name,null);if(value==null)return null;
      byte[] data=Base64.decode(value,Base64.NO_WRAP);Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key(),new javax.crypto.spec.GCMParameterSpec(128,Arrays.copyOf(data,12)));return new String(c.doFinal(data,12,data.length-12),java.nio.charset.StandardCharsets.UTF_8);
    }catch(Exception error){return null;}
  }
  static synchronized String mintAction(Context context,org.json.JSONObject value,long lifetime)throws Exception{
    android.content.SharedPreferences prefs=context.getSharedPreferences("nc_native_vault",0);java.util.List<String> keys=new java.util.ArrayList<>();android.content.SharedPreferences.Editor edit=prefs.edit();long now=System.currentTimeMillis();
    for(String name:prefs.getAll().keySet())if(name.startsWith("action.")){try{long expiry=Long.parseLong(name.substring(name.lastIndexOf('.')+1));if(expiry<=now)edit.remove(name);else keys.add(name);}catch(NumberFormatException invalid){edit.remove(name);}}
    keys.sort(java.util.Comparator.comparingLong(name->Long.parseLong(name.substring(name.lastIndexOf('.')+1))));while(keys.size()>=256)edit.remove(keys.remove(0));edit.apply();
    String nonce=java.util.UUID.randomUUID().toString();put(context,"action."+nonce+"."+(now+lifetime),value.toString());return nonce;
  }
  static synchronized org.json.JSONObject consumeAction(Context context,String nonce){
    if(nonce==null||!nonce.matches("[a-f0-9-]{36}"))return null;android.content.SharedPreferences prefs=context.getSharedPreferences("nc_native_vault",0);
    for(String name:prefs.getAll().keySet())if(name.startsWith("action."+nonce+".")){try{long expires=Long.parseLong(name.substring(name.lastIndexOf('.')+1));String raw=get(context,name);remove(context,name);if(expires<=System.currentTimeMillis()||raw==null)return null;return new org.json.JSONObject(raw);}catch(Exception invalid){return null;}}
    return null;
  }
  static synchronized void remove(Context context,String name){context.getSharedPreferences("nc_native_vault",0).edit().remove(name).apply();}
  static synchronized void clear(Context context){context.getSharedPreferences("nc_native_vault",0).edit().clear().apply();}
}
