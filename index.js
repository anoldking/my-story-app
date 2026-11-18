import React from 'react';
import { SafeAreaView, ScrollView, Text } from 'react-native';
import { registerRootComponent } from 'expo';

let LoadedApp = null;
let bootError = '';

try {
  require('react-native-url-polyfill/auto');
  LoadedApp = require('./App').default;
} catch (e) {
  bootError = (e && e.stack) ? e.stack : String(e);
}

function Root() {
  if (bootError || !LoadedApp) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFDF5', padding: 20, justifyContent: 'center' }}>
        <ScrollView>
          <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#D32F2F', marginBottom: 12 }}>
            시작 단계 오류 발견
          </Text>
          <Text style={{ fontSize: 13, color: '#222', lineHeight: 20 }}>
            {bootError || 'App 컴포넌트를 불러오지 못했습니다.'}
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }
  return <LoadedApp />;
}

registerRootComponent(Root);
