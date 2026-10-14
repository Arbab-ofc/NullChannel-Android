package com.nullchannel.android;
import android.content.Context;
import android.media.*;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
final class NativeAudioController {
  private final AudioManager manager;
  private final Context context;
  private int previousMode;
  private boolean active=false,previousSpeaker=false;
  private AudioDeviceInfo previousDevice;
  private AudioFocusRequest request;
  private Object communicationListener;
  private final AudioManager.OnAudioFocusChangeListener focus=change->{if(!active)return;
    boolean available=change==AudioManager.AUDIOFOCUS_GAIN;
    NativePeer.focus(available);NativeCallEvents.emit("focus",new JSObject().put("available",available).put("permanentLoss",change==AudioManager.AUDIOFOCUS_LOSS));
  };
  private final AudioDeviceCallback devices=new AudioDeviceCallback(){@Override public void onAudioDevicesAdded(AudioDeviceInfo[] rows){changed();}@Override public void onAudioDevicesRemoved(AudioDeviceInfo[] rows){changed();}};
  NativeAudioController(Context context){this.context=context.getApplicationContext();manager=(AudioManager)context.getSystemService(Context.AUDIO_SERVICE);}
  synchronized void begin(){if(active)return;previousMode=manager.getMode();if(previousMode==AudioManager.MODE_IN_CALL)throw new IllegalStateException("A system phone call owns the audio route");previousSpeaker=manager.isSpeakerphoneOn();if(Build.VERSION.SDK_INT>=31)previousDevice=manager.getCommunicationDevice();
    manager.setMode(AudioManager.MODE_IN_COMMUNICATION);
    AudioAttributes attributes=new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build();
    int result;if(Build.VERSION.SDK_INT>=26){request=new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(attributes).setOnAudioFocusChangeListener(focus,new Handler(Looper.getMainLooper())).build();result=manager.requestAudioFocus(request);}else result=manager.requestAudioFocus(focus,AudioManager.STREAM_VOICE_CALL,AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
    if(result!=AudioManager.AUDIOFOCUS_REQUEST_GRANTED){manager.setMode(previousMode);throw new IllegalStateException("Communication audio focus unavailable");}
    active=true;if(Build.VERSION.SDK_INT>=31){AudioManager.OnCommunicationDeviceChangedListener listener=device->changed();communicationListener=listener;manager.addOnCommunicationDeviceChangedListener(androidx.core.content.ContextCompat.getMainExecutor(context),listener);}manager.registerAudioDeviceCallback(devices,new Handler(Looper.getMainLooper()));selectDefault();changed();}
  private boolean bluetoothAllowed(){return Build.VERSION.SDK_INT<31||androidx.core.content.ContextCompat.checkSelfPermission(context,android.Manifest.permission.BLUETOOTH_CONNECT)==android.content.pm.PackageManager.PERMISSION_GRANTED;}
  private boolean bluetoothType(int type){return type==AudioDeviceInfo.TYPE_BLUETOOTH_SCO||Build.VERSION.SDK_INT>=31&&type==AudioDeviceInfo.TYPE_BLE_HEADSET;}
  private void selectDefault(){if(Build.VERSION.SDK_INT>=31){for(AudioDeviceInfo row:manager.getAvailableCommunicationDevices())if(row.getType()==AudioDeviceInfo.TYPE_WIRED_HEADSET||row.getType()==AudioDeviceInfo.TYPE_WIRED_HEADPHONES||row.getType()==AudioDeviceInfo.TYPE_USB_HEADSET||bluetoothAllowed()&&bluetoothType(row.getType())){manager.setCommunicationDevice(row);return;}for(AudioDeviceInfo row:manager.getAvailableCommunicationDevices())if(row.getType()==AudioDeviceInfo.TYPE_BUILTIN_EARPIECE){manager.setCommunicationDevice(row);return;}}else manager.setSpeakerphoneOn(false);}
  synchronized void route(String value){if(!active)return;
    if(Build.VERSION.SDK_INT>=31){for(AudioDeviceInfo row:manager.getAvailableCommunicationDevices())if(value.equals(String.valueOf(row.getId()))||value.equals("speaker")&&row.getType()==AudioDeviceInfo.TYPE_BUILTIN_SPEAKER||value.equals("earpiece")&&row.getType()==AudioDeviceInfo.TYPE_BUILTIN_EARPIECE){if(bluetoothType(row.getType())&&!bluetoothAllowed())throw new IllegalStateException("Bluetooth permission required");if(!manager.setCommunicationDevice(row))throw new IllegalStateException("Audio route unavailable");changed();return;}throw new IllegalStateException("Audio device disconnected");}
    if(value.equals("speaker")){manager.stopBluetoothSco();manager.setSpeakerphoneOn(true);}else if(value.equals("bluetooth")){manager.setSpeakerphoneOn(false);manager.startBluetoothSco();manager.setBluetoothScoOn(true);}else{manager.stopBluetoothSco();manager.setSpeakerphoneOn(false);}changed();}
  synchronized JSObject snapshot(){JSArray rows=new JSArray();String selected="earpiece";
    if(Build.VERSION.SDK_INT>=31){AudioDeviceInfo current=manager.getCommunicationDevice();if(current!=null)selected=String.valueOf(current.getId());for(AudioDeviceInfo row:manager.getAvailableCommunicationDevices())if(!bluetoothType(row.getType())||bluetoothAllowed())rows.put(new JSObject().put("id",String.valueOf(row.getId())).put("label",label(row.getType())));}
    else{selected=manager.isSpeakerphoneOn()?"speaker":manager.isBluetoothScoOn()?"bluetooth":"earpiece";rows.put(new JSObject().put("id","earpiece").put("label","Earpiece / wired headset"));rows.put(new JSObject().put("id","speaker").put("label","Speaker"));for(AudioDeviceInfo row:manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS))if(row.getType()==AudioDeviceInfo.TYPE_BLUETOOTH_SCO)rows.put(new JSObject().put("id","bluetooth").put("label","Bluetooth"));}
    return new JSObject().put("routes",rows).put("selected",selected);}
  private String label(int type){return switch(type){case AudioDeviceInfo.TYPE_BUILTIN_SPEAKER->"Speaker";case AudioDeviceInfo.TYPE_BUILTIN_EARPIECE->"Earpiece";case AudioDeviceInfo.TYPE_BLUETOOTH_SCO,AudioDeviceInfo.TYPE_BLE_HEADSET->"Bluetooth";case AudioDeviceInfo.TYPE_WIRED_HEADSET,AudioDeviceInfo.TYPE_WIRED_HEADPHONES->"Wired headset";default->"Communication device";};}
  private void changed(){if(active){if(Build.VERSION.SDK_INT>=31){AudioDeviceInfo current=manager.getCommunicationDevice();boolean available=false;if(current!=null)for(AudioDeviceInfo device:manager.getAvailableCommunicationDevices())if(device.getId()==current.getId()&&device.getType()==current.getType())available=true;if(!available)selectDefault();}NativeCallEvents.emit("routes",snapshot());}}
  synchronized void end(){
    if(!active)return;active=false;
    try {manager.unregisterAudioDeviceCallback(devices);
      if(Build.VERSION.SDK_INT>=31&&communicationListener!=null)manager.removeOnCommunicationDeviceChangedListener((AudioManager.OnCommunicationDeviceChangedListener)communicationListener);
    } finally {
      communicationListener=null;
      try {if(Build.VERSION.SDK_INT>=31){manager.clearCommunicationDevice();if(previousDevice!=null&&(!bluetoothType(previousDevice.getType())||bluetoothAllowed()))manager.setCommunicationDevice(previousDevice);}
        else{manager.stopBluetoothSco();manager.setBluetoothScoOn(false);manager.setSpeakerphoneOn(previousSpeaker);}
      } catch(SecurityException disconnectedPermission) { /* Route permission can be revoked during a call. */ }
      finally {try {if(manager.getMode()==AudioManager.MODE_IN_COMMUNICATION)manager.setMode(previousMode);}
        finally {if(Build.VERSION.SDK_INT>=26&&request!=null)manager.abandonAudioFocusRequest(request);else manager.abandonAudioFocus(focus);request=null;}
      }
    }
  }
}
