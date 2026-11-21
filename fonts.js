// 앱 전체 글꼴 (IBM Plex Sans KR - 단정하고 현대적인 고딕체)
import React, { useContext } from 'react';
import { Text as RNText, TextInput as RNTextInput, StyleSheet } from 'react-native';
import { useFonts } from 'expo-font';
import { isDark, mapTextColor } from './theme';
import * as F400 from '@expo-google-fonts/ibm-plex-sans-kr/400Regular';
import * as F600 from '@expo-google-fonts/ibm-plex-sans-kr/600SemiBold';
import * as F700 from '@expo-google-fonts/ibm-plex-sans-kr/700Bold';

const pickSrc = (m, name) => (m && (m[name] || m.default)) || null;

const FONT_MAP = {
  IBMPlexSansKR_400Regular: pickSrc(F400, 'IBMPlexSansKR_400Regular'),
  IBMPlexSansKR_600SemiBold: pickSrc(F600, 'IBMPlexSansKR_600SemiBold'),
  IBMPlexSansKR_700Bold: pickSrc(F700, 'IBMPlexSansKR_700Bold'),
};

export const useAppFonts = () => {
  const [loaded, error] = useFonts(FONT_MAP);
  return loaded || !!error;
};

const REGULAR = 'IBMPlexSansKR_400Regular';
const SEMI = 'IBMPlexSansKR_600SemiBold';
const BOLD = 'IBMPlexSansKR_700Bold';

const familyFor = (w) => {
  const n = w === 'bold' ? 700 : w === 'normal' ? 400 : parseInt(w, 10) || 400;
  if (n >= 700) return BOLD;
  if (n >= 600) return SEMI;
  return REGULAR;
};

const FamilyCtx = React.createContext(null);

export const Text = React.forwardRef(function AppText({ style, ...rest }, ref) {
  const parent = useContext(FamilyCtx);
  const flat = StyleSheet.flatten(style) || {};
  if (flat.fontFamily) return <RNText ref={ref} style={style} {...rest} />;
  const fam = flat.fontWeight != null ? familyFor(flat.fontWeight) : (parent || REGULAR);
  const extra = { fontFamily: fam, fontWeight: 'normal' };
  if (isDark() && typeof flat.color === 'string') extra.color = mapTextColor(flat.color);
  return (
    <FamilyCtx.Provider value={fam}>
      <RNText ref={ref} {...rest} style={[style, extra]} />
    </FamilyCtx.Provider>
  );
});

export const TextInput = React.forwardRef(function AppTextInput({ style, ...rest }, ref) {
  const flat = StyleSheet.flatten(style) || {};
  if (flat.fontFamily) return <RNTextInput ref={ref} style={style} {...rest} />;
  const extra = { fontFamily: familyFor(flat.fontWeight), fontWeight: 'normal' };
  if (isDark()) {
    extra.color = typeof flat.color === 'string' ? mapTextColor(flat.color) : '#F2F2F4';
  }
  return (
    <RNTextInput
      ref={ref}
      keyboardAppearance={isDark() ? 'dark' : 'light'}
      {...rest}
      style={[style, extra]}
    />
  );
});
