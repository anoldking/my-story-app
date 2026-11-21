// 하트 애니메이션: 톡 튀는 효과 + 사진을 두 번 탭하면 큰 하트
import React, { useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import { Ionicons } from './theme';

// 값이 바뀔 때(예: 좋아요 눌림) 작게 커졌다 돌아오는 효과
export const BounceView = ({ trigger, children, style }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    scale.setValue(0.7);
    Animated.spring(scale, { toValue: 1, friction: 3, tension: 160, useNativeDriver: true }).start();
  }, [trigger]);
  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
};

// 사진 위에 크게 나타났다 사라지는 하트 (count가 바뀔 때마다 재생)
export const HeartPop = ({ count }) => {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    scale.setValue(0.3);
    opacity.setValue(1);
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.15, friction: 4, tension: 180, useNativeDriver: true }),
      Animated.delay(250),
      Animated.timing(opacity, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [count]);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ opacity, transform: [{ scale }] }}>
        <Ionicons name="heart" size={96} color="#FFFFFF" style={{ textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 12 }} />
      </Animated.View>
    </View>
  );
};

// 한 번 탭 / 두 번 탭 구분 (두 번 탭하면 onDouble, 한 번이면 잠시 뒤 onSingle)
export const useDoubleTap = (onSingle, onDouble, delay = 280) => {
  const last = useRef(0);
  const timer = useRef(null);
  useEffect(() => () => timer.current && clearTimeout(timer.current), []);
  return (arg) => {
    const now = Date.now();
    if (now - last.current < delay) {
      last.current = 0;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      onDouble && onDouble(arg);
    } else {
      last.current = now;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        last.current = 0;
        onSingle && onSingle(arg);
      }, delay);
    }
  };
};
