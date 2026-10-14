package com.nullchannel.android;
/** Pure policy shared by push and foreground socket delivery. */
final class NotificationPolicy {
  static boolean eligible(long expiresAt,long now,boolean activeChat,boolean duplicate){return expiresAt>now&&!activeChat&&!duplicate;}
  static boolean invitationMatches(String active,String incoming){return active==null||active.isEmpty()||active.equals(incoming);}
}
