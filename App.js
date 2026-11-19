import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  FlatList, Image, ImageBackground, Alert, SafeAreaView,
  ActivityIndicator, ScrollView, Dimensions
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

const SCREEN_WIDTH = Dimensions.get('window').width;
// 상단 프로필 배경 높이: 가로 너비 기준 세로 4:3 비율 (더 길게 3:2로 하려면 4 / 3 대신 3 / 2 입력)
const COVER_HEIGHT = Math.round(SCREEN_WIDTH * (4 / 3));
const GRID_ITEM_SIZE = (SCREEN_WIDTH - 4) / 3;

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

let supabase = null;
let initError = '';

try {
  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  } else {
    initError = `환경변수 누락 (URL: ${Boolean(supabaseUrl)}, KEY: ${Boolean(supabaseKey)})`;
  }
} catch (e) {
  initError = e?.message || String(e);
}

// 사진의 원본 가로·세로 비율을 자동으로 계산해 위아래 잘림 없이 전체를 보여주는 컴포넌트
const AutoHeightImage = ({ uri, onPress }) => {
  const [aspectRatio, setAspectRatio] = useState(1);

  useEffect(() => {
    if (!uri) return;
    Image.getSize(
      uri,
      (width, height) => {
        if (width && height) {
          setAspectRatio(width / height);
        }
      },
      () => setAspectRatio(1)
    );
  }, [uri]);

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress}>
      <Image
        source={{ uri }}
        style={[styles.postImage, { aspectRatio }]}
        resizeMode="contain"
      />
    </TouchableOpacity>
  );
};

const REACTIONS = [
  { type: 'like', label: '❤️ 좋아요' },
  { type: 'cool', label: '👍 멋져요' },
  { type: 'happy', label: '😄 기뻐요' },
  { type: 'sad', label: '😢 슬퍼요' },
  { type: 'cheer', label: '💪 힘내요' },
];

const getKoreanErrorMessage = (error) => {
  if (!error) return '알 수 없는 오류가 발생했습니다.';
  const code = (error.code || '').toLowerCase();
  const msg = (error.message || '').toLowerCase();

  if (msg.includes('invalid login credentials') || code === 'invalid_credentials') {
    return '이메일 또는 비밀번호가 올바르지 않습니다.';
  }
  if (msg.includes('missing email or phone')) {
    return '이메일을 입력해 주세요.';
  }
  if (msg.includes('user already registered') || code === 'user_already_exists') {
    return '이미 가입된 이메일 주소입니다.';
  }
  if (msg.includes('password should be at least') || code === 'weak_password') {
    return '비밀번호는 최소 6자 이상이어야 합니다.';
  }
  if (msg.includes('unable to validate email address') || msg.includes('invalid email')) {
    return '올바른 이메일 형식이 아닙니다.';
  }
  if (msg.includes('rate limit') || code === 'over_request_rate_limit') {
    return '요청 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  }
  if (msg.includes('network request failed') || msg.includes('fetch failed')) {
    return '인터넷 연결 상태를 확인해 주세요.';
  }
  if (msg.includes('row-level security') || code === '42501') {
    return '해당 작업에 대한 접근 권한이 없습니다.';
  }
  return `요청을 처리하지 못했습니다.\n(${error.message})`;
};

const showAlert = (title, message, onConfirm) => {
  Alert.alert(title, message, [{ text: '확인', onPress: onConfirm }]);
};

export default function App() {
  const [session, setSession] = useState(null);
  const [isSignUpScreen, setIsSignUpScreen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  // 프로필 및 방문자 상태
  const [profile, setProfile] = useState({
    nickname: '',
    bio: '나만의 스토리를 기록해 보세요 ✨',
    avatar_url: null,
    cover_url: null,
    today_visits: 1,
    total_visits: 1,
  });

  // 프로필 꾸미기 화면 표시 상태
  const [editProfileModal, setEditProfileModal] = useState(false);
  const [tempNickname, setTempNickname] = useState('');
  const [tempBio, setTempBio] = useState('');
  const [tempAvatarUri, setTempAvatarUri] = useState(null);
  const [tempCoverUri, setTempCoverUri] = useState(null);

  // 탭 전환 ('album': 3열 앨범 격자, 'posts': 게시글 목록)
  const [activeTab, setActiveTab] = useState('album');

  // 게시글 및 글쓰기 화면 표시 상태
  const [posts, setPosts] = useState([]);
  const [writeModalVisible, setWriteModalVisible] = useState(false);
  const [content, setContent] = useState('');
  const [imageUri, setImageUri] = useState(null);
  const [loading, setLoading] = useState(false);

  // 게시글 수정 상태
  const [editingPostId, setEditingPostId] = useState(null);
  const [editingContent, setEditingContent] = useState('');

  // 앨범 및 게시글 사진 크게 보기 상태
  const [selectedAlbumPost, setSelectedAlbumPost] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().
