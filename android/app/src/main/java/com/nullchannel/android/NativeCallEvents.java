package com.nullchannel.android;
import com.getcapacitor.JSObject;
import java.lang.ref.WeakReference;
import java.util.ArrayDeque;
final class NativeCallEvents {
  private static WeakReference<NativeCallsPlugin> plugin=new WeakReference<>(null);
  private static final ArrayDeque<JSObject> pending=new ArrayDeque<>();
  static synchronized void bind(NativeCallsPlugin value){plugin=new WeakReference<>(value);}
  static synchronized void unbind(NativeCallsPlugin value){if(plugin.get()==value)plugin.clear();}
  static synchronized void emit(String type,JSObject data){NativeCallSignaling.media(type,data);if(type.equals("candidate")&&NativeCallSignaling.owns(data.optString("callId")))return;data.put("type",type);NativeCallsPlugin target=plugin.get();if(target!=null)target.event(data);else{if(pending.size()>=256)pending.removeFirst();pending.add(data);}}
  static synchronized com.getcapacitor.JSArray drain(){com.getcapacitor.JSArray rows=new com.getcapacitor.JSArray();while(!pending.isEmpty())rows.put(pending.removeFirst());return rows;}
}
