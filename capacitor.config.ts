import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nullchannel.android',
  appName: 'NullChannel',
  webDir: 'client/dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
