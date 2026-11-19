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

  // 앨범 사진 크게 보기 상태
  const [selectedAlbumPost, setSelectedAlbumPost] = useState(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    if (session && supabase) {
      loadAndCountProfile(session.user);
      fetchPosts();
    }
  }, [session]);

  if (!supabase) {
    return (
      <SafeAreaView style={styles.authContainer}>
        <Text style={styles.logo}>실행 오류 원인</Text>
        <Text style={{ textAlign: 'center', color: '#D32F2F', fontSize: 15, lineHeight: 22 }}>
          {initError || '알 수 없는 초기화 오류'}
        </Text>
      </SafeAreaView>
    );
  }

  // 프로필 불러오기 + 방문자 수 자동 증가
  const loadAndCountProfile = async (user) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const defaultNick = user.email ? user.email.split('@')[0] : '내 스토리';

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (!error && data) {
      const isSameDay = data.last_visit_date === todayStr;
      const nextToday = isSameDay ? (data.today_visits || 0) + 1 : 1;
      const nextTotal = (data.total_visits || 0) + 1;

      const updated = {
        ...data,
        nickname: data.nickname || defaultNick,
        bio: data.bio || '나만의 스토리를 기록해 보세요 ✨',
        today_visits: nextToday,
        total_visits: nextTotal,
        last_visit_date: todayStr,
      };
      setProfile(updated);

      await supabase.from('profiles').update({
        today_visits: nextToday,
        total_visits: nextTotal,
        last_visit_date: todayStr,
      }).eq('id', user.id);
    } else {
      const initialProfile = {
        id: user.id,
        nickname: defaultNick,
        bio: '나만의 스토리를 기록해 보세요 ✨',
        avatar_url: null,
        cover_url: null,
        today_visits: 1,
        total_visits: 1,
        last_visit_date: todayStr,
      };
      setProfile(initialProfile);
      await supabase.from('profiles').upsert(initialProfile);
    }
  };

  // 갤러리 사진 선택 함수 (원본 비율 유지)
  const selectFromGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showAlert('권한 필요', '사진을 선택하려면 스마트폰 설정에서 사진 접근 권한을 허용해 주세요.');
        return null;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions ? ImagePicker.MediaTypeOptions.Images : ['images'],
        allowsEditing: false,
        quality: 0.85,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        // 가로 1080px 기준으로 세로 비율은 원본 그대로 유지하여 압축
        const manipulated = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 1080 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
        );
        return manipulated.uri;
      }
      return null;
    } catch (e) {
      showAlert('사진 선택 오류', `사진을 불러오지 못했습니다.\n(${e?.message || e})`);
      return null;
    }
  };

  // Supabase 스토리지 업로드 공통 함수
  const uploadImageFile = async (uri, prefix) => {
    if (!uri) return null;
    if (uri.startsWith('http')) return uri;

    const fileName = `${session.user.id}/${prefix}_${Date.now()}.jpg`;
    const response = await fetch(uri);
    const arrayBuffer = await response.arrayBuffer();

    const { error } = await supabase.storage
      .from('post-images')
      .upload(fileName, arrayBuffer, { contentType: 'image/jpeg', upsert: true });

    if (error) throw error;
    const { data } = supabase.storage.from('post-images').getPublicUrl(fileName);
    return data.publicUrl;
  };

  // 프로필 꾸미기 열기
  const openProfileEditor = () => {
    setTempNickname(profile.nickname || '');
    setTempBio(profile.bio || '');
    setTempAvatarUri(profile.avatar_url || null);
    setTempCoverUri(profile.cover_url || null);
    setEditProfileModal(true);
  };

  // 프로필 꾸미기 저장
  const saveProfileSettings = async () => {
    if (!tempNickname.trim()) {
      showAlert('알림', '이름(닉네임)을 입력해 주세요.');
      return;
    }

    setLoading(true);
    try {
      const finalAvatarUrl = await uploadImageFile(tempAvatarUri, 'avatar');
      const finalCoverUrl = await uploadImageFile(tempCoverUri, 'cover');

      const updates = {
        id: session.user.id,
        nickname: tempNickname.trim(),
        bio: tempBio.trim(),
        avatar_url: finalAvatarUrl,
        cover_url: finalCoverUrl,
      };

      const { error } = await supabase.from('profiles').upsert(updates);
      setLoading(false);

      if (error) {
        showAlert('저장 실패', getKoreanErrorMessage(error));
        return;
      }

      setProfile((prev) => ({ ...prev, ...updates }));
      setEditProfileModal(false);
      fetchPosts();
      showAlert('완료', '프로필이 저장되었습니다!');
    } catch (e) {
      setLoading(false);
      showAlert('오류', `프로필 저장 중 문제가 발생했습니다.\n(${e?.message || e})`);
    }
  };

  const switchAuthMode = (toSignUp) => {
    setEmail('');
    setPassword('');
    setPasswordConfirm('');
    setIsSignUpScreen(toSignUp);
  };

  const handleLogin = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      showAlert('알림', '이메일과 비밀번호를 모두 입력해 주세요.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
    setLoading(false);
    if (error) showAlert('로그인 실패', getKoreanErrorMessage(error));
  };

  const handleSignUp = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return showAlert('알림', '이메일을 입력해 주세요.');
    if (password.length < 6) return showAlert('알림', '비밀번호는 6자 이상 입력해 주세요.');
    if (password !== passwordConfirm) return showAlert('알림', '비밀번호가 일치하지 않습니다.');

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email: trimmedEmail, password });
    setLoading(false);

    if (error) return showAlert('회원가입 실패', getKoreanErrorMessage(error));
    if (data?.session) {
      showAlert('가입 완료', '환영합니다!');
    } else {
      showAlert('가입 완료', '로그인 화면에서 로그인해 주세요!', () => switchAuthMode(false));
    }
  };

  const fetchPosts = async () => {
    const { data, error } = await supabase
      .from('posts')
      .select('*, profiles(nickname, avatar_url), reactions(type, user_id)')
      .order('created_at', { ascending: false });
    if (!error && data) setPosts(data);
  };

  const createPost = async () => {
    if (!content.trim() && !imageUri) {
      showAlert('알림', '내용을 입력하거나 사진을 첨부해 주세요.');
      return;
    }

    setLoading(true);
    try {
      let uploadedUrls = [];
      if (imageUri) {
        const publicUrl = await uploadImageFile(imageUri, 'post');
        if (publicUrl) uploadedUrls.push(publicUrl);
      }

      const { error } = await supabase.from('posts').insert({
        author_id: session.user.id,
        content: content.trim(),
        image_urls: uploadedUrls,
        visibility: 'public',
      });

      setLoading(false);
      if (error) {
        showAlert('등록 실패', getKoreanErrorMessage(error));
      } else {
        setContent('');
        setImageUri(null);
        setWriteModalVisible(false);
        fetchPosts();
      }
    } catch (e) {
      setLoading(false);
      showAlert('오류', `게시글 등록 중 오류가 발생했습니다.\n(${e?.message || e})`);
    }
  };

  const saveEditPost = async (postId) => {
    if (!editingContent.trim()) {
      showAlert('알림', '수정할 내용을 입력해 주세요.');
      return;
    }
    setLoading(true);
    const { error } = await supabase
      .from('posts')
      .update({ content: editingContent.trim() })
      .eq('id', postId);
    setLoading(false);

    if (error) {
      showAlert('수정 실패', getKoreanErrorMessage(error));
    } else {
      setEditingPostId(null);
      setEditingContent('');
      fetchPosts();
    }
  };

  const confirmDeletePost = (postId) => {
    Alert.alert('글 삭제', '정말 이 글을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          const { error } = await supabase.from('posts').delete().eq('id', postId);
          setLoading(false);
          if (error) showAlert('삭제 실패', getKoreanErrorMessage(error));
          else fetchPosts();
        },
      },
    ]);
  };

  const toggleReaction = async (postId, type) => {
    await supabase.from('reactions').upsert(
      { post_id: postId, user_id: session.user.id, type },
      { onConflict: 'post_id,user_id' }
    );
    fetchPosts();
  };

  if (!session) {
    if (isSignUpScreen) {
      return (
        <SafeAreaView style={styles.authContainer}>
          <Text style={styles.logo}>회원가입</Text>
          <TextInput style={styles.input} placeholder="이메일" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <TextInput style={styles.input} placeholder="비밀번호 (6자 이상)" value={password} onChangeText={setPassword} secureTextEntry />
          <TextInput style={styles.input} placeholder="비밀번호 확인" value={passwordConfirm} onChangeText={setPasswordConfirm} secureTextEntry />
          <TouchableOpacity style={styles.btnPrimary} onPress={handleSignUp} disabled={loading}>
            {loading ? <ActivityIndicator color="#3C1E1E" /> : <Text style={styles.btnText}>가입하기</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => switchAuthMode(false)} disabled={loading}>
            <Text style={styles.btnSecondaryText}>← 로그인 화면으로 돌아가기</Text>
          </TouchableOpacity>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.authContainer}>
        <Text style={styles.logo}>내 스토리</Text>
        <TextInput style={styles.input} placeholder="이메일" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <TextInput style={styles.input} placeholder="비밀번호 (6자 이상)" value={password} onChangeText={setPassword} secureTextEntry />
        <TouchableOpacity style={styles.btnPrimary} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#3C1E1E" /> : <Text style={styles.btnText}>로그인</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnSecondary} onPress={() => switchAuthMode(true)} disabled={loading}>
          <Text style={styles.btnSecondaryText}>이메일로 회원가입</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const albumPosts = posts.filter((p) => p.image_urls && p.image_urls.length > 0);

  const renderProfileHeader = () => (
    <View>
      <ImageBackground
        source={profile.cover_url ? { uri: profile.cover_url } : undefined}
        style={styles.coverBackground}
        resizeMode="cover"
      >
        <View style={styles.coverOverlay}>
          {/* 맨 위 방문자 카운터 & 우측 상단 프로필 편집/로그아웃 버튼 */}
          <View style={styles.topBar}>
            <View style={{ width: 65 }} />
            <View style={styles.visitorBadge}>
              <Text style={styles.visitorText}>
                TODAY {profile.today_visits}  |  TOTAL {profile.total_visits}
              </Text>
            </View>
            <TouchableOpacity style={styles.topLogoutBtn} onPress={() => supabase.auth.signOut()}>
              <Text style={styles.topLogoutText}>로그아웃</Text>
            </TouchableOpacity>
          </View>

          {/* 하단 프로필 배치: 좌측 원형 프로필 사진 + 이름 + 소개글 + 반투명 버튼 박스 */}
          <View style={styles.profileBottomSection}>
            <TouchableOpacity onPress={openProfileEditor} activeOpacity={0.85}>
              {profile.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.circularAvatar} />
              ) : (
                <View style={[styles.circularAvatar, styles.defaultAvatar]}>
                  <Text style={styles.defaultAvatarText}>👤</Text>
                </View>
              )}
            </TouchableOpacity>

            <Text style={styles.profileName}>-{profile.nickname || '내 스토리'}-</Text>
            <Text style={styles.profileBio}>{profile.bio}</Text>

            <View style={styles.glassActionBox}>
              <TouchableOpacity style={styles.glassTopBtn} onPress={openProfileEditor}>
                <Text style={styles.glassBtnText}>✧ 내 프로필 꾸미기</Text>
              </TouchableOpacity>
              <View style={styles.glassDividerHorizontal} />
              <View style={styles.glassBottomRow}>
                <TouchableOpacity
                  style={styles.glassHalfBtn}
                  onPress={() => {
                    setImageUri(null);
                    setContent('');
                    setWriteModalVisible(true);
                  }}
                >
                  <Text style={styles.glassBtnText}>💬 스토리 쓰기</Text>
                </TouchableOpacity>
                <View style={styles.glassDividerVertical} />
                <TouchableOpacity
                  style={styles.glassHalfBtn}
                  onPress={async () => {
                    const uri = await selectFromGallery();
                    if (uri) {
                      setImageUri(uri);
                      setContent('');
                      setWriteModalVisible(true);
                    }
                  }}
                >
                  <Text style={styles.glassBtnText}>⊞ 새 게시물(사진)</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </ImageBackground>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'album' && styles.tabItemActive]}
          onPress={() => setActiveTab('album')}
        >
          <Text style={[styles.tabText, activeTab === 'album' && styles.tabTextActive]}>
            🖼️ 앨범 ({albumPosts.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'posts' && styles.tabItemActive]}
          onPress={() => setActiveTab('posts')}
        >
          <Text style={[styles.tabText, activeTab === 'posts' && styles.tabTextActive]}>
            📄 게시글 ({posts.length})
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderAlbumGridItem = ({ item }) => (
    <TouchableOpacity
      style={styles.gridItem}
      activeOpacity={0.85}
      onPress={() => setSelectedAlbumPost(item)}
    >
      <Image source={{ uri: item.image_urls[0] }} style={styles.gridImage} />
      {item.content ? (
        <View style={styles.gridCaptionOverlay}>
          <Text style={styles.gridCaptionText} numberOfLines={1}>
            {item.content}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );

  const renderPostCardItem = ({ item }) => {
    const isMyPost = item.author_id === session.user.id;
    const isEditing = editingPostId === item.id;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardAuthorRow}>
            {item.profiles?.avatar_url ? (
              <Image source={{ uri: item.profiles.avatar_url }} style={styles.smallAvatar} />
            ) : (
              <View style={[styles.smallAvatar, styles.defaultSmallAvatar]}>
                <Text style={{ fontSize: 14 }}>👤</Text>
              </View>
            )}
            <View>
              <Text style={styles.author}>{item.profiles?.nickname || profile.nickname || '친구'}</Text>
              <Text style={styles.date}>{new Date(item.created_at).toLocaleString('ko-KR')}</Text>
            </View>
          </View>

          {isMyPost && !isEditing && (
            <View style={styles.ownerActions}>
              <TouchableOpacity
                onPress={() => {
                  setEditingPostId(item.id);
                  setEditingContent(item.content || '');
                }}
                style={styles.editBtn}
              >
                <Text style={styles.editBtnText}>수정</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => confirmDeletePost(item.id)} style={styles.deleteBtn}>
                <Text style={styles.deleteBtnText}>삭제</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {isEditing ? (
          <View style={styles.editBox}>
            <TextInput
              style={styles.editInput}
              value={editingContent}
              onChangeText={setEditingContent}
              multiline
              autoFocus
            />
            <View style={styles.editActions}>
              <TouchableOpacity onPress={() => setEditingPostId(null)} style={styles.cancelEditBtn}>
                <Text style={styles.cancelEditText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => saveEditPost(item.id)} style={styles.saveEditBtn}>
                <Text style={styles.saveEditText}>저장</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          item.content ? <Text style={styles.postText}>{item.content}</Text> : null
        )}

        {item.image_urls?.[0] && <Image source={{ uri: item.image_urls[0] }} style={styles.postImage} />}

        <View style={styles.reactionRow}>
          {REACTIONS.map((r) => {
            const count = item.reactions?.filter((x) => x.type === r.type).length || 0;
            return (
              <TouchableOpacity key={r.type} style={styles.reactionBtn} onPress={() => toggleReaction(item.id, r.type)}>
                <Text style={styles.reactionText}>{r.label} {count > 0 ? count : ''}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        key={activeTab}
        data={activeTab === 'album' ? albumPosts : posts}
        numColumns={activeTab === 'album' ? 3 : 1}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={renderProfileHeader}
        renderItem={activeTab === 'album' ? renderAlbumGridItem : renderPostCardItem}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              {activeTab === 'album'
                ? '아직 앨범에 올린 사진이 없습니다.\n상단의 [새 게시물(사진)]을 눌러 첫 사진을 등록해 보세요!'
                : '아직 작성된 게시글이 없습니다.\n상단의 [스토리 쓰기]를 눌러 첫 글을 남겨 보세요!'}
            </Text>
          </View>
        }
      />

      {/* 오버레이 1: 내 프로필 꾸미기 (세로 4:3 비율 미리보기 지원) */}
      {editProfileModal && (
        <View style={styles.overlayBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>내 프로필 꾸미기</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>상단 프로필 배경사진 (세로 4:3 비율)</Text>
              <TouchableOpacity
                style={styles.coverPickerBox}
                onPress={async () => {
                  const uri = await selectFromGallery();
                  if (uri) setTempCoverUri(uri);
                }}
              >
                {tempCoverUri ? (
                  <Image source={{ uri: tempCoverUri }} style={styles.coverPreview} resizeMode="cover" />
                ) : (
                  <Text style={styles.pickerPlaceholder}>🖼️ 터치하여 세로 배경사진 선택</Text>
                )}
              </TouchableOpacity>

              <Text style={styles.fieldLabel}>좌측 원형 메인 프로필 사진</Text>
              <TouchableOpacity
                style={styles.avatarPickerRow}
                onPress={async () => {
                  const uri = await selectFromGallery();
                  if (uri) setTempAvatarUri(uri);
                }}
              >
                {tempAvatarUri ? (
                  <Image source={{ uri: tempAvatarUri }} style={styles.avatarPreview} resizeMode="cover" />
                ) : (
                  <View style={[styles.avatarPreview, styles.defaultAvatar]}>
                    <Text style={{ fontSize: 22 }}>👤</Text>
                  </View>
                )}
                <Text style={styles.pickerLinkText}>원형 프로필 사진 변경하기</Text>
              </TouchableOpacity>

              <Text style={styles.fieldLabel}>이름 (닉네임)</Text>
              <TextInput
                style={styles.modalInput}
                value={tempNickname}
                onChangeText={setTempNickname}
                placeholder="표시할 이름을 입력하세요"
              />

              <Text style={styles.fieldLabel}>프로필 소개글</Text>
              <TextInput
                style={[styles.modalInput, { height: 70, textAlignVertical: 'top' }]}
                value={tempBio}
                onChangeText={setTempBio}
                placeholder="소개글이나 상태 메시지를 입력하세요"
                multiline
              />
            </ScrollView>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEditProfileModal(false)} disabled={loading}>
                <Text style={styles.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveProfileSettings} disabled={loading}>
                {loading ? <ActivityIndicator color="#3C1E1E" /> : <Text style={styles.modalSaveText}>저장하기</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* 오버레이 2: 스토리(게시글) 작성 화면 */}
      {writeModalVisible && (
        <View style={styles.overlayBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>새 스토리 올리기</Text>
            <TextInput
              style={[styles.modalInput, { height: 110, textAlignVertical: 'top' }]}
              placeholder="오늘 어떤 일이 있었나요?"
              value={content}
              onChangeText={setContent}
              multiline
            />

            {imageUri ? (
              <View style={{ marginBottom: 12 }}>
                <Image source={{ uri: imageUri }} style={styles.writePreviewImg} resizeMode="cover" />
                <TouchableOpacity style={styles.removePhotoBtn} onPress={() => setImageUri(null)}>
                  <Text style={{ fontSize: 12, color: '#555' }}>✕ 사진 지우기</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.attachPhotoBtn}
                onPress={async () => {
                  const uri = await selectFromGallery();
                  if (uri) setImageUri(uri);
                }}
              >
                <Text style={{ color: '#333', fontWeight: 'bold' }}>📷 갤러리에서 사진 첨부</Text>
              </TouchableOpacity>
            )}

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setWriteModalVisible(false)} disabled={loading}>
                <Text style={styles.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={createPost} disabled={loading}>
                {loading ? <ActivityIndicator color="#3C1E1E" /> : <Text style={styles.modalSaveText}>올리기</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* 오버레이 3: 앨범 사진 크게 보기 */}
      {Boolean(selectedAlbumPost) && selectedAlbumPost && (
        <View style={styles.fullImageBackdrop}>
          <View style={styles.fullImageContainer}>
            <Image
              source={{ uri: selectedAlbumPost.image_urls[0] }}
              style={styles.fullImage}
              resizeMode="contain"
            />
            {selectedAlbumPost.content ? (
              <Text style={styles.fullImageCaption}>{selectedAlbumPost.content}</Text>
            ) : null}
            <Text style={styles.fullImageDate}>
              {new Date(selectedAlbumPost.created_at).toLocaleString('ko-KR')}
            </Text>
            <TouchableOpacity style={styles.closeFullBtn} onPress={() => setSelectedAlbumPost(null)}>
              <Text style={styles.closeFullText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  authContainer: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#FFFDF5' },
  logo: { fontSize: 32, fontWeight: 'bold', color: '#3C1E1E', textAlign: 'center', marginBottom: 32 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 14, marginBottom: 12 },
  btnPrimary: { backgroundColor: '#FEE500', padding: 15, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
  btnText: { fontWeight: 'bold', color: '#3C1E1E', fontSize: 16 },
  btnSecondary: { padding: 14, alignItems: 'center' },
  btnSecondaryText: { color: '#666' },

  container: { flex: 1, backgroundColor: '#1E1E1E' },

  // 세로 4:3 비율로 길게 확장된 상단 프로필 배경 영역
  coverBackground: { width: '100%', height: COVER_HEIGHT, backgroundColor: '#4A5568' },
  coverOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    justifyContent: 'space-between',
    paddingTop: 14,
    paddingBottom: 18,
    paddingHorizontal: 16,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  visitorBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  visitorText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600', letterSpacing: 0.4 },
  topLogoutBtn: {
    backgroundColor: 'rgba(0, 0, 0, 0.38)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
  },
  topLogoutText: { color: '#F5F5F5', fontSize: 11, fontWeight: '600' },

  profileBottomSection: { alignItems: 'flex-start' },
  circularAvatar: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    marginBottom: 8,
  },
  defaultAvatar: {
    backgroundColor: '#718096',
    justifyContent: 'center',
    alignItems: 'center',
  },
  defaultAvatarText: { fontSize: 28 },
  profileName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  profileBio: {
    color: '#F5F5F5',
    fontSize: 13,
    marginTop: 3,
    marginBottom: 14,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  glassActionBox: {
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.45)',
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
    overflow: 'hidden',
  },
  glassTopBtn: {
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassDividerHorizontal: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  glassBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  glassHalfBtn: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassDividerVertical: {
    width: 1,
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  glassBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#252525',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  tabItem: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: { borderBottomColor: '#FEE500' },
  tabText: { color: '#999', fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: '#FEE500', fontWeight: 'bold' },

  gridItem: {
    width: GRID_ITEM_SIZE,
    height: GRID_ITEM_SIZE,
    margin: 0.6,
    backgroundColor: '#2D2D2D',
  },
  gridImage: { width: '100%', height: '100%' },
  gridCaptionOverlay: {
    position: 'absolute',
    bottom: 0,
