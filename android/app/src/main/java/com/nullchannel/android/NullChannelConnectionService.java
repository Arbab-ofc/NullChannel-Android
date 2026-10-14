package com.nullchannel.android;
import android.telecom.*;
import android.os.Bundle;
/** Exported solely behind android.permission.BIND_TELECOM_CONNECTION_SERVICE. */
public final class NullChannelConnectionService extends ConnectionService {
    private Connection create(ConnectionRequest request,boolean incoming){if(android.os.Build.VERSION.SDK_INT<26)return Connection.createFailedConnection(new DisconnectCause(DisconnectCause.ERROR));Bundle extras=request.getExtras();String id=extras==null?null:extras.getString("nc.callId");if(id==null||!NativeCallSignaling.owns(id)&&!NativeIncomingCallActivity.validPending(this,id))return Connection.createFailedConnection(new DisconnectCause(DisconnectCause.CANCELED));NativeTelecom.NullChannelConnection connection=new NativeTelecom.NullChannelConnection(this,id);if(NativeTelecom.connections.putIfAbsent(id,connection)!=null)return Connection.createFailedConnection(new DisconnectCause(DisconnectCause.CANCELED));if(incoming)connection.setRinging();else connection.setDialing();return connection;}
    @Override public Connection onCreateIncomingConnection(PhoneAccountHandle account,ConnectionRequest request){return create(request,true);}
    @Override public Connection onCreateOutgoingConnection(PhoneAccountHandle account,ConnectionRequest request){return create(request,false);}
    @Override public void onCreateIncomingConnectionFailed(PhoneAccountHandle account,ConnectionRequest request){NativeTelecom.rejected(request.getExtras().getString("nc.callId",""));}
    @Override public void onCreateOutgoingConnectionFailed(PhoneAccountHandle account,ConnectionRequest request){NativeTelecom.rejected(request.getExtras().getString("nc.callId",""));}
}
