// 앱 전체 글꼴 (Gothic A1 - 네이버 앱과 비슷한 깔끔한 고딕체)
import React, { useContext } from 'react';
import { Text as RNText, TextInput as RNTextInput, StyleSheet } from 'react-native';
import { useFonts } from 'expo-font';
import * as F400 from '@expo-google-fonts/gothic-a1/400Regular';
import * as F700 from '@expo-google-fonts/gothic-a1/700Bold';
import * as F800 from '@expo-google-fonts/gothic-a1/800ExtraBold';

const pickSrc = (m, name) => (m && (m[name] || m.default)) || null;

const FONT_MAP = {
  GothicA1_400Regular: pickSrc(F400, 'GothicA1_400Regular'),
  GothicA1_700Bold: pickSrc(F700, 'GothicA1_700Bold'),
  GothicA1_800ExtraBold: pickSrc(F800, 'GothicA1_800ExtraBold'),
};

export const useAppFonts = () => {
  const [loaded, error] = useFonts(FONT_MAP);
  return loaded || !!error;
};

const REGULAR = 'GothicA1_400Regular';
const BOLD = 'GothicA1_700Bold';
const HEAVY = 'GothicA1_800ExtraBold';

const familyFor = (w) => {
  const n = w === 'bold' ? 700 : w === 'normal' ? 400 : parseInt(w, 10) || 400;
  if (n >= 800) return HEAVY;
  if (n >= 600) return BOLD;
  return REGULAR;
};

const FamilyCtx = React.createContext(null);

export const Text = React.forwardRef(function AppText({ style, ...rest }, ref) {
  const parent = useContext(FamilyCtx);
  const flat = StyleSheet.flatten(style) || {};
  if (flat.fontFamily) return <RNText ref={ref} style={style} {...rest} />;
  const fam = flat.fontWeight != null ? familyFor(flat.fontWeight) : (parent || REGULAR);
  return (
    <FamilyCtx.Provider value={fam}>
      <RNText ref={ref} {...rest} style={[style, { fontFamily: fam, fontWeight: 'normal' }]} />
    </FamilyCtx.Provider>
  );
});

export const TextInput = React.forwardRef(function AppTextInput({ style, ...rest }, ref) {
  const flat = StyleSheet.flatten(style) || {};
  if (flat.fontFamily) return <RNTextInput ref={ref} style={style} {...rest} />;
  return (
    <RNTextInput
      ref={ref}
      {...rest}
      style={[style, { fontFamily: familyFor(flat.fontWeight), fontWeight: 'normal' }]}
    />
  );
});
