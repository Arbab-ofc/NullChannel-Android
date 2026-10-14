package com.nullchannel.android;
/** Shared arbitration for native calls and the WebView voice-message recorder. */
final class NativeMicrophoneLease {
    private static String owner="";
    static synchronized boolean claim(String value){if(!owner.isEmpty()&&!owner.equals(value))return false;if(value.startsWith("record:")&&NativeCallSignaling.owns(null))return false;owner=value;return true;}
    static synchronized void release(String value){if(owner.equals(value))owner="";}
    static synchronized void clearRecording(){if(owner.startsWith("record:"))owner="";}
    static synchronized boolean recording(){return owner.startsWith("record:");}
}
