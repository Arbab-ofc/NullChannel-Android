package com.nullchannel.android;

import android.os.Bundle;
import android.view.View;
import com.getcapacitor.BridgeActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(SecureCredentialStorePlugin.class);
    super.onCreate(savedInstanceState);

    // Android 15+ enforces edge-to-edge for this API 36 app. Keep the WebView
    // content inside system bars, cutouts, and the visible keyboard area.
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    View content = findViewById(android.R.id.content);
    ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
      Insets bars = windowInsets.getInsets(
        WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
      );
      Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
      view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
      return WindowInsetsCompat.CONSUMED;
    });
    ViewCompat.requestApplyInsets(content);
  }
}
