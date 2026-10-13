package com.nullchannel.android;

/** Resolves the single native padding owner for the Capacitor content root. */
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
    int imeBottom
  ) {
    return new int[] {
      baseLeft + insetLeft,
      baseTop + insetTop,
      baseRight + insetRight,
      baseBottom + Math.max(systemBottom, imeBottom)
    };
  }
}
