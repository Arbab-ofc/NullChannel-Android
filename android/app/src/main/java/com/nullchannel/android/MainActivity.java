package com.nullchannel.android;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import com.getcapacitor.BridgeActivity;
import androidx.core.graphics.Insets;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    SplashScreen.installSplashScreen(this);
    registerPlugin(SecureCredentialStorePlugin.class);
    super.onCreate(savedInstanceState);

    // Keep edge-to-edge enabled on every supported Android version and use the
    // actual system-reported insets to size the WebView's content viewport.
    WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
    getWindow().setStatusBarColor(Color.TRANSPARENT);
    getWindow().setNavigationBarColor(Color.TRANSPARENT);
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
      getWindow().setStatusBarContrastEnforced(false);
      getWindow().setNavigationBarContrastEnforced(false);
    }
    WindowInsetsControllerCompat barsController =
      WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
    barsController.setAppearanceLightStatusBars(false);
    barsController.setAppearanceLightNavigationBars(false);

    View content = findViewById(android.R.id.content);
    int baseLeft = content.getPaddingLeft();
    int baseTop = content.getPaddingTop();
    int baseRight = content.getPaddingRight();
    int baseBottom = content.getPaddingBottom();
    ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
      Insets bars = windowInsets.getInsets(
        WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
      );
      boolean imeVisible = windowInsets.isVisible(WindowInsetsCompat.Type.ime());
      int[] padding = AndroidInsetsPolicy.contentPadding(
        baseLeft, baseTop, baseRight, baseBottom,
        bars.left, bars.top, bars.right, bars.bottom, imeVisible
      );
      // Always derive from the original padding. Insets can be redispatched on
      // rotation, keyboard changes, or navigation, so never accumulate them.
      view.setPadding(padding[0], padding[1], padding[2], padding[3]);
      return WindowInsetsCompat.CONSUMED;
    });
    ViewCompat.requestApplyInsets(content);
  }
}
