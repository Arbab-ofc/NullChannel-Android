package com.nullchannel.android;
import android.content.Context;
import android.net.*;
import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.JSObject;
final class NativeNetworkMonitor {
  private ConnectivityManager manager;
  private final Handler handler=new Handler(Looper.getMainLooper());
  private String previous="";
  private final Runnable publish=()->{Network network=manager.getActiveNetwork();NetworkCapabilities caps=network==null?null:manager.getNetworkCapabilities(network);boolean online=caps!=null&&caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);String transport=caps==null?"none":caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)?"vpn":caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)?"wifi":caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)?"mobile":"other";String fingerprint=(network==null?"none":network.toString())+transport+online;if(fingerprint.equals(previous))return;previous=fingerprint;NativeCallSignaling.network(online,fingerprint);NativeCallEvents.emit("network",new JSObject().put("online",online).put("transport",transport));};
  private final ConnectivityManager.NetworkCallback callback=new ConnectivityManager.NetworkCallback(){@Override public void onAvailable(Network network){schedule();}@Override public void onLost(Network network){schedule();}@Override public void onCapabilitiesChanged(Network network,NetworkCapabilities capabilities){schedule();}};
  NativeNetworkMonitor(Context context){manager=context.getSystemService(ConnectivityManager.class);}
  private void schedule(){handler.removeCallbacks(publish);handler.postDelayed(publish,750);}
  void start(){manager.registerDefaultNetworkCallback(callback);schedule();}
  void close(){manager.unregisterNetworkCallback(callback);handler.removeCallbacksAndMessages(null);}
}
