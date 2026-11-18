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

export default function App() {
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [posts, setPosts] = useState([]);
  const [content, setContent] = useState('');
  const [imageUri, setImageUri] = useState(null);
  const [loading, setLoading] = useState(false);

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

  const handleAuth = async (isSignUp) => {
    setLoading(true);
    const { error } = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) Alert.alert('알림', error.message);
    else if (isSignUp) Alert.alert('가입 완료', '이제 로그인해 주세요!');
  };

  const fetchPosts = async () => {
    const { data, error } = await supabase
      .from('posts')
      .select('*, profiles(nickname), reactions(type, user_id)')
      .order('created_at', { ascending: false });
    if (!error && data) setPosts(data);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled) {
      const manipulated = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 1080 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );
      setImageUri(manipulated.uri);
    }
  };

  const createPost = async () => {
    if (!content.trim() && !imageUri) return;
    setLoading(true);
    let uploadedUrls = [];

    if (imageUri) {
      const fileName = `${session.user.id}/${Date.now()}.jpg`;
      const response = await fetch(imageUri);
      const blob = await response.blob();
      const arrayBuffer = await new Response(blob).arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from('post-images')
        .upload(fileName, arrayBuffer, { contentType: 'image/jpeg' });

      if (!uploadError) {
        const { data } = supabase.storage.from('post-images').getPublicUrl(fileName);
        uploadedUrls.push(data.publicUrl);
      }
    }

    const { error } = await supabase.from('posts').insert({
      author_id: session.user.id,
      content,
      image_urls: uploadedUrls,
      visibility: 'public',
    });

    setLoading(false);
    if (error) Alert.alert('오류', error.message);
    else {
      setContent('');
      setImageUri(null);
      fetchPosts();
    }
  };

  const toggleReaction = async (postId, type) => {
    await supabase.from('reactions').upsert(
      { post_id: postId, user_id: session.user.id, type },
      { onConflict: 'post_id,user_id' }
    );
    fetchPosts();
  };

  if (!session) {
    return (
      <SafeAreaView style={styles.authContainer}>
        <Text style={styles.logo}>내 스토리</Text>
        <TextInput style={styles.input} placeholder="이메일" value={email} onChangeText={setEmail} autoCapitalize="none" />
        <TextInput style={styles.input} placeholder="비밀번호 (6자 이상)" value={password} onChangeText={setPassword} secureTextEntry />
        <TouchableOpacity style={styles.btnPrimary} onPress={() => handleAuth(false)} disabled={loading}>
          <Text style={styles.btnText}>로그인</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnSecondary} onPress={() => handleAuth(true)} disabled={loading}>
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
        {imageUri && <Image source={{ uri: imageUri }} style={styles.previewImage} />}
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
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.author}>{item.profiles?.nickname || '친구'}</Text>
            <Text style={styles.date}>{new Date(item.created_at).toLocaleString('ko-KR')}</Text>
            {item.content ? <Text style={styles.postText}>{item.content}</Text> : null}
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
        )}
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
  previewImage: { width: '100%', height: 180, borderRadius: 8, marginVertical: 8 },
  writeActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  photoBtn: { padding: 8, backgroundColor: '#F0F0F0', borderRadius: 6 },
  photoBtnText: { fontSize: 13, color: '#333' },
  postBtn: { backgroundColor: '#3C1E1E', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 6 },
  postBtnText: { color: '#fff', fontWeight: 'bold' },
  card: { backgroundColor: '#fff', padding: 16, marginBottom: 8 },
  author: { fontWeight: 'bold', fontSize: 16, color: '#222' },
  date: { fontSize: 11, color: '#999', marginBottom: 8 },
  postText: { fontSize: 15, color: '#333', lineHeight: 22, marginBottom: 10 },
  postImage: { width: '100%', height: 260, borderRadius: 8, marginBottom: 10 },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 10 },
  reactionBtn: { backgroundColor: '#F8F8F8', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 14 },
  reactionText: { fontSize: 12, color: '#444' },
});
