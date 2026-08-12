import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'de.kuehlschrank.app',
  appName: 'Kühlschrank Scan AI',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0f172a',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      androidSpinnerStyle: 'large',
      spinnerColor: '#6366f1'
    },
    StatusBar: {
      overlaysWebView: false,
      style: 'DARK',
      backgroundColor: '#0f172a'
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config',
      iconColor: '#4F46E5',
      sound: 'beep.wav'
    }
  },
  ios: {
    contentInset: 'always',
    preferredContentMode: 'mobile',
    scheme: 'CapacitorPWA'
  },
  android: {
    captureInput: true,
    webContentsDebuggingEnabled: false
  }
};

export default config;
