package com.nullchannel.android;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(android.os.Bundle savedInstanceState) {
    registerPlugin(SecureCredentialStorePlugin.class);
    super.onCreate(savedInstanceState);
  }
}
