import { NavigationBar } from 'expo-navigation-bar';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { db } from '@/db';
import { initializeDatabase } from '@/db/migrations';

void SystemUI.setBackgroundColorAsync(Colors.background);

const AppDarkTheme = {
  ...DarkTheme,
  colors: {
    primary: Colors.primary,
    background: Colors.background,
    card: Colors.tabBar,
    text: Colors.textPrimary,
    border: Colors.border,
    notification: Colors.alertAccent,
  },
};

export default function RootLayout() {
  useState(() => {
    initializeDatabase(db);
    return true;
  });

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(Colors.background);
    if (Platform.OS === 'android') {
      NavigationBar.setStyle('light');
    }
  }, []);

  return (
    <SafeAreaProvider style={styles.root}>
      <View style={styles.root}>
        <ThemeProvider value={AppDarkTheme}>
          <StatusBar style="light" />
          {Platform.OS === 'android' ? <NavigationBar style="light" /> : null}
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: Colors.background },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="service/[id]"
              options={{ headerShown: false }}
            />
          </Stack>
        </ThemeProvider>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
