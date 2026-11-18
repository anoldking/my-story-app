import React, { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  FlatList, Image, Alert, SafeAreaView, ActivityIndicator
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

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
  if (msg.includes('anonymous sign-ins are disabled')) {
    return '이메일과 비밀번호를 입력해 주세요.';
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
  if (msg.includes('email not confirmed') || code === 'email_not_confirmed') {
    return '이메일 인증이 완료되지 않았습니다. 메일함을 확인해 주세요.';
  }
  if (msg.includes('rate limit') || code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') {
    return '요청 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  }
  if (msg.includes('network request failed') || msg.includes('fetch failed')) {
    return '인터넷 연결 상태를 확인해 주세요.';
  }
  if (msg.includes('row-level security') || code === '42501') {
    return '해당 작업에 대한 접근 권한이 없습니다.';
  }
  if (msg.includes('bucket not found')) {
    return '사진 저장소(post-images)가 설정되지 않았습니다.';
  }
  if (msg.includes('payload too large') || msg.includes('maximum allowed size')) {
    return '첨부한 사진 용량이 너무 큽니다.';
  }

  return `요청을 처리하지 못했습니다.\n(${error.message})`;
};

const showAlert = (title, message, onConfirm) => {
  Alert.alert(title, message, [
    { text: '확인', onPress: onConfirm },
  ]);
};

export default function App() {
  const [session, setSession] = useState(null);
  const [isSignUpScreen, setIsSignUpScreen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [posts, setPosts] = useState([]);
  const [content, setContent] = useState('');
  const [imageUri, setImageUri] = useState(null);
  const [loading, setLoading] = useState(false);

  // 글 수정용 상태
  const [editingPostId, setEditingPostId] = useState(null);
  const [editingContent, setEditingContent] = useState('');

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    if (session && supabase) fetchPosts();
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

  const switchAuthMode = (toSignUp) => {
    setEmail('');
    setPassword('');
    setPasswordConfirm('');
    setIsSignUpScreen(toSignUp);
  };

  const handleLogin = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      showAlert('알림', '이메일을 입력해 주세요.');
      return;
    }
    if (!password) {
      showAlert('알림', '비밀번호를 입력해 주세요.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });
    setLoading(false);

    if (error) {
      showAlert('로그인 실패', getKoreanErrorMessage(error));
    }
  };

  const handleSignUp = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      showAlert('알림', '이메일을 입력해 주세요.');
      return;
    }
    if (password.length < 6) {
      showAlert('알림', '비밀번호는 6자 이상 입력해 주세요.');
      return;
    }
    if (password !== passwordConfirm) {
      showAlert('알림', '비밀번호가 일치하지 않습니다.');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
    });
    setLoading(false);

    if (error) {
      showAlert('회원가입 실패', getKoreanErrorMessage(error));
      return;
    }

    if (data?.session) {
      showAlert('가입 완료', '환영합니다!');
    } else {
      showAlert('가입 완료', '이메일 인증 후 로그인해 주세요!', () => {
        switchAuthMode(false);
      });
    }
  };

  const fetchPosts = async () => {
    const { data, error } = await supabase
      .from('posts')
      .select('*, profiles(nickname), reactions(type, user_id)')
      .order('created_at', { ascending: false });
    if (!error && data) setPosts(data);
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showAlert('권한 필요', '사진을 첨부하려면 스마트폰 설정에서 사진/미디어 접근 권한을 허용해 주세요.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions ? ImagePicker.MediaTypeOptions.Images : ['images'],
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        const manipulated = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 1080 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
        );
        setImageUri(manipulated.uri);
      }
    } catch (e) {
      showAlert('사진 선택 오류', `사진을 불러오지 못했습니다.\n(${e?.message || e})`);
    }
  };

  const createPost = async () => {
    if (!content.trim() && !imageUri) {
      showAlert('알림', '내용을 입력하거나 사진을 첨부해 주세요.');
      return;
    }

    setLoading(true);
    let uploadedUrls = [];

    try {
      if (imageUri) {
        const fileName = `${session.user.id}/${Date.now()}.jpg`;
        const response = await fetch(imageUri);
        const arrayBuffer = await response.arrayBuffer();

        const { error: uploadError } = await supabase.storage
          .from('post-images')
          .upload(fileName, arrayBuffer, {
            contentType: 'image/jpeg',
            upsert: false,
          });

        if (uploadError) {
          setLoading(false);
          showAlert('사진 업로드 실패', getKoreanErrorMessage(uploadError));
          return;
        }

        const { data } = supabase.storage.from('post-images').getPublicUrl(fileName);
        uploadedUrls.push(data.publicUrl);
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
        fetchPosts();
      }
    } catch (e) {
      setLoading(false);
      showAlert('오류', `게시글 등록 중 오류가 발생했습니다.\n(${e?.message || e})`);
    }
  };

  // 글 수정 시작
  const startEditPost = (post) => {
    setEditingPostId(post.id);
    setEditingContent(post.content || '');
  };

  // 글 수정 저장
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

  // 글 삭제 확인 및 실행
  const confirmDeletePost = (postId) => {
    Alert.alert('글 삭제', '정말 이 글을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          const { error } = await supabase
            .from('posts')
            .delete()
            .eq('id', postId);
          setLoading(false);

          if (error) {
            showAlert('삭제 실패', getKoreanErrorMessage(error));
          } else {
            if (editingPostId === postId) {
              setEditingPostId(null);
              setEditingContent('');
            }
            fetchPosts();
          }
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
          <TextInput
            style={styles.input}
            placeholder="이메일"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            placeholder="비밀번호 (6자 이상)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <TextInput
            style={styles.input}
            placeholder="비밀번호 확인"
            value={passwordConfirm}
            onChangeText={setPasswordConfirm}
            secureTextEntry
          />
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
        <TextInput
          style={styles.input}
          placeholder="이메일"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={styles.input}
          placeholder="비밀번호 (6자 이상)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        <TouchableOpacity style={styles.btnPrimary} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#3C1E1E" /> : <Text style={styles.btnText}>로그인</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnSecondary} onPress={() => switchAuthMode(true)} disabled={loading}>
          <Text style={styles.btnSecondaryText}>이메일로 회원가입</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>내 스토리</Text>
        <TouchableOpacity onPress={() => supabase.auth.signOut()}>
          <Text style={styles.logoutText}>로그아웃</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.writeBox}>
        <TextInput
          style={styles.writeInput}
          placeholder="오늘 어떤 일이 있었나요?"
          value={content}
          onChangeText={setContent}
          multiline
        />
        {imageUri && (
          <View style={styles.previewWrapper}>
            <Image source={{ uri: imageUri }} style={styles.previewImage} />
            <TouchableOpacity style={styles.removePreviewBtn} onPress={() => setImageUri(null)}>
              <Text style={styles.removePreviewText}>✕ 사진 취소</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.writeActions}>
          <TouchableOpacity onPress={pickImage} style={styles.photoBtn}>
            <Text style={styles.photoBtnText}>📷 사진 첨부</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={createPost} style={styles.postBtn} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.postBtnText}>올리기</Text>}
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={posts}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => {
          const isMyPost = item.author_id === session.user.id;
          const isEditing = editingPostId === item.id;

          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.author}>{item.profiles?.nickname || '친구'}</Text>
                  <Text style={styles.date}>{new Date(item.created_at).toLocaleString('ko-KR')}</Text>
                </View>

                {isMyPost && !isEditing && (
                  <View style={styles.ownerActions}>
                    <TouchableOpacity onPress={() => startEditPost(item)} style={styles.editBtn}>
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
                    <TouchableOpacity
                      onPress={() => {
                        setEditingPostId(null);
                        setEditingContent('');
                      }}
                      style={styles.cancelEditBtn}
                    >
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
        }}
      />
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
  container: { flex: 1, backgroundColor: '#F4F4F4' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#FEE500' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#3C1E1E' },
  logoutText: { color: '#3C1E1E', fontSize: 13 },
  writeBox: { backgroundColor: '#fff', padding: 14, marginBottom: 8 },
  writeInput: { minHeight: 60, fontSize: 15, textAlignVertical: 'top' },
  previewWrapper: { marginVertical: 8 },
  previewImage: { width: '100%', height: 180, borderRadius: 8 },
  removePreviewBtn: { alignSelf: 'flex-end', marginTop: 6, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#EEE', borderRadius: 4 },
  removePreviewText: { fontSize: 12, color: '#555' },
  writeActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  photoBtn: { padding: 8, backgroundColor: '#F0F0F0', borderRadius: 6 },
  photoBtnText: { fontSize: 13, color: '#333' },
  postBtn: { backgroundColor: '#3C1E1E', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 6 },
  postBtnText: { color: '#fff', fontWeight: 'bold' },
  card: { backgroundColor: '#fff', padding: 16, marginBottom: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  author: { fontWeight: 'bold', fontSize: 16, color: '#222' },
  date: { fontSize: 11, color: '#999', marginTop: 2 },
  ownerActions: { flexDirection: 'row', gap: 6 },
  editBtn: { backgroundColor: '#F0F0F0', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 },
  editBtnText: { fontSize: 12, color: '#333' },
  deleteBtn: { backgroundColor: '#FFEBEE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 },
  deleteBtnText: { fontSize: 12, color: '#D32F2F' },
  editBox: { marginBottom: 10 },
  editInput: { borderWidth: 1, borderColor: '#CCC', borderRadius: 6, padding: 10, fontSize: 15, minHeight: 60, textAlignVertical: 'top', backgroundColor: '#FAFAFA' },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
  cancelEditBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#EEE', borderRadius: 4 },
  cancelEditText: { fontSize: 13, color: '#555' },
  saveEditBtn: { paddingHorizontal: 14, paddingVertical: 6, backgroundColor: '#3C1E1E', borderRadius: 4 },
  saveEditText: { fontSize: 13, color: '#fff', fontWeight: 'bold' },
  postText: { fontSize: 15, color: '#333', lineHeight: 22, marginBottom: 10 },
  postImage: { width: '100%', height: 260, borderRadius: 8, marginBottom: 10 },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 10 },
  reactionBtn: { backgroundColor: '#F8F8F8', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 14 },
  reactionText: { fontSize: 12, color: '#444' },
});
