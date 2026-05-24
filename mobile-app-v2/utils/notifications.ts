import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { registerPushToken } from './api';

// Expo Go with SDK 53+ removed Android push notification support.
// The auto-registration side-effect in expo-notifications crashes on load in Expo Go,
// so we must NOT import it at the top level — use a conditional require() instead.
const IS_EXPO_GO = Constants.executionEnvironment === 'storeClient';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Notifications: any = null;

if (!IS_EXPO_GO) {
  // Dynamic require prevents DevicePushTokenAutoRegistration.fx.js from running in Expo Go
  Notifications = require('expo-notifications');

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function registerForPushNotifications(): Promise<string | null> {
  try {
    if (IS_EXPO_GO || !Notifications) {
      console.log('[Push] Skipping registration in Expo Go');
      return null;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#2563EB',
        sound: 'default',
      });
      await Notifications.setNotificationChannelAsync('tasks', {
        name: 'Task Assignments',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: '#7C3AED',
        sound: 'default',
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId: '9e054c0f-0868-4787-8424-3ea4a6344bd8',
    });

    await registerPushToken(token, Platform.OS);
    return token;
  } catch (err) {
    console.error('[Push] Registration failed:', err);
    return null;
  }
}
