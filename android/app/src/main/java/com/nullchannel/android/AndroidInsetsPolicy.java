package com.nullchannel.android;

/** Resolves system-bar padding for the Capacitor root. Android owns IME resizing. */
final class AndroidInsetsPolicy {
  private AndroidInsetsPolicy() {}

  static int[] contentPadding(
    int baseLeft,
    int baseTop,
    int baseRight,
    int baseBottom,
    int insetLeft,
    int insetTop,
    int insetRight,
    int systemBottom,
    boolean imeVisible
  ) {
    return new int[] {
      baseLeft + insetLeft,
      baseTop + insetTop,
      baseRight + insetRight,
      // With adjustResize the window/WebView viewport already excludes the IME.
      // Adding imeBottom here reserves that space twice and creates a black gap.
      baseBottom + (imeVisible ? 0 : systemBottom)
    };
  }
}
