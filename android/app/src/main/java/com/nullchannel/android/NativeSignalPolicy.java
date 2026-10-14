package com.nullchannel.android;
import java.util.LinkedHashSet;
/** Pure protocol invariants used by the native owner and framework unit tests. */
final class NativeSignalPolicy {
    private final LinkedHashSet<String> received=new LinkedHashSet<>();
    static boolean revisionAllowed(int current,int incoming,boolean offer){return incoming>0&&(offer?incoming==current+1:incoming==current);}
    static boolean invitationValid(long deadline,long now){return deadline>now&&deadline-now<=60000;}
    static boolean bothReady(org.json.JSONObject snapshot){org.json.JSONObject ready=snapshot.optJSONObject("ready");return ready!=null&&ready.optBoolean("caller")&&ready.optBoolean("callee");}
    boolean seen(String id){return id!=null&&received.contains(id);}
    void applied(String id){if(id==null||id.isEmpty())return;if(received.size()>=512)received.remove(received.iterator().next());received.add(id);}
    void clear(){received.clear();}
}
