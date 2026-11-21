// 다크 모드: 색을 자동으로 어둡게 바꿔주는 도구 + 화면 모드 저장 + 진동(햅틱)
import React from 'react';
import { StyleSheet, Appearance, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons as RawIonicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

// ---------- 색 계산 ----------
const NAMED = { white: '#ffffff', black: '#000000' };

const parseColor = (c) => {
  if (typeof c !== 'string') return null;
  let v = c.trim().toLowerCase();
  if (NAMED[v]) v = NAMED[v];
  let m = v.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('');
    if (h.length === 6 || h.length === 8) {
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
      };
    }
    return null;
  }
  m = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] != null ? +m[4] : 1 };
  return null;
};

const lightness = (p) => (0.299 * p.r + 0.587 * p.g + 0.114 * p.b) / 255;
const chroma = (p) => (Math.max(p.r, p.g, p.b) - Math.min(p.r, p.g, p.b)) / 255;
const withAlpha = (hex, a) => {
  if (a >= 0.999) return hex;
  const p = parseColor(hex);
  return `rgba(${p.r},${p.g},${p.b},${a})`;
};

export const isAccent = (c) => {
  const p = parseColor(c);
  return !!p && p.a > 0.3 && chroma(p) > 0.25;
};

// 배경색: 밝은 색 -> 어두운 색
export const mapBgColor = (c) => {
  const p = parseColor(c);
  if (!p || p.a < 0.05 || chroma(p) > 0.25) return c;
  const l = lightness(p);
  let out;
  if (l >= 0.995) out = '#121214';
  else if (l >= 0.975) out = '#17171A';
  else if (l >= 0.9) out = '#1F1F23';
  else if (l >= 0.7) out = '#2C2C32';
  else return c;
  // 흰색 계열 반투명 덮개는 검은 덮개로
  return withAlpha(out, p.a);
};

// 글자색: 어두운 색 -> 밝은 색
export const mapTextColor = (c) => {
  const p = parseColor(c);
  if (!p || p.a < 0.05 || chroma(p) > 0.25) return c;
  const l = lightness(p);
  let out;
  if (l < 0.15) out = '#F2F2F4';
  else if (l < 0.3) out = '#D9D9DE';
  else if (l < 0.42) out = '#BDBDC4';
  else if (l < 0.52) out = '#A3A3AB';
  else return c;
  return withAlpha(out, p.a);
};

// 선(테두리)색
export const mapBorderColor = (c) => {
  const p = parseColor(c);
  if (!p || p.a < 0.05 || chroma(p) > 0.25) return c;
  const l = lightness(p);
  if (l >= 0.9) return withAlpha('#2A2A30', p.a);
  if (l >= 0.7) return withAlpha('#34343A', p.a);
  return c;
};

const BORDER_KEYS = ['borderColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor'];

const mapOneStyle = (name, st, base) => {
  if (!st || typeof st !== 'object') return st;
  const out = { ...st };
  const hasAccentBg = typeof st.backgroundColor === 'string' && isAccent(st.backgroundColor);
  if (typeof st.backgroundColor === 'string') out.backgroundColor = mapBgColor(st.backgroundColor);
  BORDER_KEYS.forEach((k) => {
    if (typeof st[k] === 'string') out[k] = mapBorderColor(st[k]);
  });
  if (typeof st.color === 'string') {
    // 알록달록한 버튼 위의 글자는 그대로 둠
    let skip = hasAccentBg;
    const m = name.match(/^(.*?)(Text|Label|Txt)$/);
    if (!skip && m) {
      ['', 'Btn', 'Button', 'Chip', 'Pill', 'Box', 'Badge'].forEach((suf) => {
        const sib = base[m[1] + suf];
        if (sib && typeof sib.backgroundColor === 'string' && isAccent(sib.backgroundColor)) skip = true;
      });
    }
    if (!skip) out.color = mapTextColor(st.color);
  }
  return out;
};

const mapStyles = (base) => {
  const out = {};
  Object.keys(base).forEach((k) => {
    out[k] = mapOneStyle(k, base[k], base);
  });
  return out;
};

// ---------- 화면 모드 저장소 ----------
const MODE_KEY = 'theme_mode_v1';
let mode = 'light'; // 'light' | 'dark' | 'system'
let dark = false;
const listeners = new Set();
const registry = [];

const compute = () => {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  try {
    return Appearance.getColorScheme() === 'dark';
  } catch (e) {
    return false;
  }
};

const rebuildAll = () => {
  registry.forEach((e) => {
    Object.assign(e.out, StyleSheet.create(dark ? mapStyles(e.base) : e.base));
  });
};

const apply = () => {
  const next = compute();
  const changed = next !== dark;
  dark = next;
  if (changed) rebuildAll();
  listeners.forEach((l) => l());
};

export const themedStyles = (base) => {
  const entry = { base, out: {} };
  registry.push(entry);
  Object.assign(entry.out, StyleSheet.create(dark ? mapStyles(base) : base));
  return entry.out;
};

export const isDark = () => dark;
export const getMode = () => mode;
export const bgc = (c) => (dark ? mapBgColor(c) : c);
export const txc = (c) => (dark ? mapTextColor(c) : c);

export const setThemeMode = (next) => {
  mode = next;
  AsyncStorage.setItem(MODE_KEY, next).catch(() => {});
  apply();
};

export const cycleThemeMode = () => {
  const order = ['light', 'dark', 'system'];
  setThemeMode(order[(order.indexOf(mode) + 1) % order.length]);
};

export const modeLabel = (m) => (m === 'dark' ? '다크' : m === 'system' ? '시스템' : '라이트');

// 앱 시작 때 저장된 모드를 불러옴
let loaded = false;
export const loadThemeMode = async () => {
  if (loaded) return;
  loaded = true;
  try {
    const saved = await AsyncStorage.getItem(MODE_KEY);
    if (saved === 'dark' || saved === 'light' || saved === 'system') mode = saved;
  } catch (e) { /* 무시 */ }
  apply();
};

try {
  Appearance.addChangeListener(() => {
    if (mode === 'system') apply();
  });
} catch (e) { /* 무시 */ }

// 화면이 모드 변화에 맞춰 다시 그려지게 하는 훅
export const useTheme = () => {
  const [, setTick] = React.useState(0);
  useColorScheme();
  React.useEffect(() => {
    const l = () => setTick((x) => x + 1);
    listeners.add(l);
    loadThemeMode();
    return () => listeners.delete(l);
  }, []);
  return { dark, mode };
};

// 아이콘 색도 자동 변환
export const Ionicons = (props) => {
  const { color, ...rest } = props;
  return <RawIonicons {...rest} color={dark && typeof color === 'string' ? mapTextColor(color) : color} />;
};
Ionicons.glyphMap = RawIonicons.glyphMap;

// ---------- 진동(햅틱) ----------
export const hapticTap = () => {
  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); } catch (e) { /* 무시 */ }
};
export const hapticSelect = () => {
  try { Haptics.selectionAsync().catch(() => {}); } catch (e) { /* 무시 */ }
};
export const hapticSuccess = () => {
  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); } catch (e) { /* 무시 */ }
};
