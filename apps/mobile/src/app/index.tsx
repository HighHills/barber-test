import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function MobileHomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Barbershop Operating System</Text>
      <Text style={styles.subtitle}>Mobile Staff & Barber Client</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
});
