import Constants from 'expo-constants';

function inferApiBaseUrl() {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configuredUrl) {
    return configuredUrl;
  }

  const hostUri =
    Constants.expoConfig?.hostUri ??
    Constants.expoGoConfig?.hostUri ??
    null;

  if (hostUri) {
    const host = hostUri.replace(/^[^:]+:\/\//, '').split(':')[0];
    if (host) {
      return `http://${host}:4000`;
    }
  }

  if (process.env.EXPO_OS === 'android') {
    return 'http://10.0.2.2:4000';
  }

  if (process.env.EXPO_OS === 'web') {
    return 'http://localhost:4000';
  }

  return 'http://localhost:4000';
}

export const API_BASE_URL = inferApiBaseUrl();
