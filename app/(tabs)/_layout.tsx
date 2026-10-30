import { Tabs } from 'expo-router';
import { BarChart3, CarFront, History } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 10);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarActiveBackgroundColor: 'transparent',
        tabBarInactiveBackgroundColor: 'transparent',
        tabBarItemStyle: {
          backgroundColor: 'transparent',
        },
        tabBarButton: ({
          children,
          onPress,
          onLongPress,
          style,
          testID,
          'aria-label': ariaLabel,
          'aria-selected': ariaSelected,
          role,
        }) => (
          <Pressable
            accessibilityLabel={ariaLabel}
            accessibilityState={{ selected: Boolean(ariaSelected) }}
            onLongPress={onLongPress}
            onPress={(event) => {
              onPress?.(event);
            }}
            role={role}
            style={[style, { backgroundColor: 'transparent' }]}
            testID={testID}
          >
            {children}
          </Pressable>
        ),
        tabBarStyle: {
          backgroundColor: Colors.tabBar,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          paddingTop: 8,
          paddingBottom: bottomPadding,
          height: 56 + bottomPadding,
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
          marginTop: 2,
        },
        sceneStyle: {
          backgroundColor: Colors.background,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Garage',
          tabBarIcon: ({ color }) => <CarFront color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color }) => <History color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
          tabBarIcon: ({ color }) => <BarChart3 color={color} size={22} />,
        }}
      />
    </Tabs>
  );
}
