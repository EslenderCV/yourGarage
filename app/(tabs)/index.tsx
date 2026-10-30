import { StyleSheet, Text, View } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';

export default function GarageScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Garage</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#181B22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: Colors.textPrimary,
    fontFamily: Fonts.sans,
    fontSize: 20,
    fontWeight: '600',
  },
});
