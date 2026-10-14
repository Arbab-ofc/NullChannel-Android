package com.nullchannel.android;

import static org.junit.Assert.assertArrayEquals;

import org.junit.Test;

public class AndroidInsetsPolicyTest {
  @Test
  public void appliesReportedStatusBarAndCutoutInsetsWithoutFixedDimensions() {
    assertArrayEquals(
      new int[] { 0, 36, 0, 24 },
      AndroidInsetsPolicy.contentPadding(0, 0, 0, 0, 0, 36, 0, 24, false)
    );
  }

  @Test
  public void adjustResizeOwnsImeAndDoesNotReserveNavigationBarAboveKeyboard() {
    assertArrayEquals(
      new int[] { 0, 30, 0, 0 },
      AndroidInsetsPolicy.contentPadding(0, 0, 0, 0, 0, 30, 0, 24, true)
    );
  }

  @Test
  public void navigationBarInsetIsUsedWhenKeyboardIsHidden() {
    assertArrayEquals(
      new int[] { 0, 30, 0, 24 },
      AndroidInsetsPolicy.contentPadding(0, 0, 0, 0, 0, 30, 0, 24, false)
    );
  }

  @Test
  public void preservesOriginalPaddingAndDoesNotAccumulateInsets() {
    int[] first = AndroidInsetsPolicy.contentPadding(2, 3, 4, 5, 1, 28, 6, 20, false);
    int[] redispatched = AndroidInsetsPolicy.contentPadding(2, 3, 4, 5, 1, 28, 6, 20, false);

    assertArrayEquals(new int[] { 3, 31, 10, 25 }, first);
    assertArrayEquals(first, redispatched);
  }
}
