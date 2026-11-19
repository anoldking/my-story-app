import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  FlatList, Image, ImageBackground, Alert, SafeAreaView,
  ActivityIndicator, ScrollView, Dimensions, KeyboardAvoidingView,
  Platform, BackHandler, ToastAndroid, Linking
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as DocumentPicker from 'expo-document-picker';

const SCREEN_WIDTH = Dimensions.get('window').width;
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

// 피드(게시글)에서 사진의 원본 가로·세로 비율을 유지해 잘림 없이 보여주는 컴포넌트
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

// 터치 시 사진의 원본 비율 크기 그대로 화면에 띄워주는 전체 팝업 컴포넌트
const OriginalImagePopup = ({ imageInfo, onClose }) => {
  const [aspectRatio, setAspectRatio] = useState(1);
  const [loadingSize, setLoadingSize] = useState(true);

  useEffect(() => {
    if (!imageInfo?.uri) return;
    setLoadingSize(true);
    Image.getSize(
      imageInfo.uri,
      (width, height) => {
        if (width && height) {
          setAspectRatio(width / height);
        }
        setLoadingSize(false);
      },
      () => {
        setAspectRatio(1);
        setLoadingSize(false);
      }
    );
  }, [imageInfo?.uri]);

  if (!imageInfo) return null;

  return (
    <View style={styles.fullImageBackdrop}>
      {/* 상단 닫기 헤더 바 */}
      <View style={styles.popupTopBar}>
        <Text style={styles.popupTitleText} numberOfLines={1}>
          {imageInfo.title || '사진 원본 보기'}
        </Text>
        <TouchableOpacity style={styles.popupCloseIconBtn} onPress={onClose}>
          <Text style={styles.popupCloseIconText}>✕ 닫기</Text>
        </TouchableOpacity>
      </View>

      {/* 원본 비율 그대로 화면 너비에 맞춰 스크롤 가능한 영역 */}
      <ScrollView
        style={{ width: '100%' }}
        contentContainerStyle={styles.popupScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loadingSize && (
          <ActivityIndicator size="large" color="#FEE500" style={{ marginVertical: 40 }} />
        )}
        <Image
          source={{ uri: imageInfo.uri }}
          style={{
            width: SCREEN_WIDTH,
            aspectRatio,
            backgroundColor: '#000',
          }}
          resizeMode="contain"
        />

        {(imageInfo.caption || imageInfo.date) && (
          <View style={styles.popupCaptionBox}>
            {imageInfo.caption ? (
              <Text style={styles.fullImageCaption}>{imageInfo.caption}</Text>
            ) : null}
            {imageInfo.date ? (
              <Text style={styles.fullImageDate}>{imageInfo.date}</Text>
            ) : null}
          </View>
        )}
      </ScrollView>
    </View>
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

  // 하단 메인 내비게이션 탭 ('friends': 친구탭(홈), 'chats': 채팅탭, 'story': 내 스토리)
  const [mainTab, setMainTab] = useState('friends');

  // 프로필 및 방문자 상태
  const [profile, setProfile] = useState({
    nickname: '',
    bio: '나만의 스토리를 기록해 보세요 ✨',
    avatar_url: null,
    cover_url: null,
    today_visits: 1,
    total_visits: 1,
  });

  // 프로필 꾸미기(변경) 화면 표시 상태
  const [editProfileModal, setEditProfileModal] = useState(false);
  const [tempNickname, setTempNickname] = useState('');
  const [tempBio, setTempBio] = useState('');
  const [tempAvatarUri, setTempAvatarUri] = useState(null);
  const [tempCoverUri, setTempCoverUri] = useState(null);

  // 친구탭 상태
  const [members, setMembers] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [favSectionOpen, setFavSectionOpen] = useState(true);
  const [friendsSectionOpen, setFriendsSectionOpen] = useState(true);
  const [selectedFriend, setSelectedFriend] = useState(null);

  // 내 스토리 내부 탭 ('album' | 'posts')
  const [activeTab, setActiveTab] = useState('album');

  // 게시글 상태
  const [posts, setPosts] = useState([]);
  const [writeModalVisible, setWriteModalVisible] = useState(false);
  const [content, setContent] = useState('');
  const [imageUri, setImageUri] = useState(null);
  const [loading, setLoading] = useState(false);

  // 게시글 수정 상태
  const [editingPostId, setEditingPostId] = useState(null);
  const [editingContent, setEditingContent] = useState('');

  // 통합 사진 원본 팝업 상태 ({ uri, title, caption, date } 형태)
  const [viewingImage, setViewingImage] = useState(null);

  // 메신저(1:1 실시간 채팅방 & '+' 첨부 서랍) 상태
  const [chatPartner, setChatPartner] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [chatAttachMenuOpen, setChatAttachMenuOpen] = useState(false);
  const chatListRef = useRef(null);

  const lastBackPressRef = useRef(0);

  // --- 안드로이드 하드웨어/제스처 뒤로가기 버튼 제어 ---
  useEffect(() => {
    const onHardwareBackPress = () => {
      if (!session) {
        if (isSignUpScreen) {
          setIsSignUpScreen(false);
          return true;
        }
        return false;
      }

      // 1순위: 사진 원본 팝업이 열려 있으면 닫기
      if (viewingImage) {
        setViewingImage(null);
        return true;
      }

      if (editProfileModal) {
        setEditProfileModal(false);
        return true;
      }

      if (writeModalVisible) {
        setWriteModalVisible(false);
        return true;
      }

      if (selectedFriend) {
        setSelectedFriend(null);
        return true;
      }

      if (chatAttachMenuOpen) {
        setChatAttachMenuOpen(false);
        return true;
      }

      if (chatPartner) {
        setChatPartner(null);
        return true;
      }

      if (editingPostId) {
        setEditingPostId(null);
        setEditingContent('');
        return true;
      }

      if (searchVisible) {
        setSearchVisible(false);
        setSearchQuery('');
        return true;
      }

      if (mainTab !== 'friends') {
        setMainTab('friends');
        return true;
      }

      const now = Date.now();
      if (now - lastBackPressRef.current < 2000) {
        return false;
      }

      lastBackPressRef.current = now;
      if (Platform.OS === 'android') {
        ToastAndroid.show('뒤로 버튼을 한 번 더 누르면 종료됩니다.', ToastAndroid.SHORT);
      }
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onHardwareBackPress);
    return () => subscription.remove();
  }, [
    session,
    isSignUpScreen,
    viewingImage,
    editProfileModal,
    writeModalVisible,
    selectedFriend,
    chatAttachMenuOpen,
    chatPartner,
    editingPostId,
    searchVisible,
    mainTab,
  ]);

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
      fetchFriendsAndFavorites();
      fetchPosts();
    }
  }, [session]);

  useEffect(() => {
    if (!supabase || !session || !chatPartner) return;

    setChatAttachMenuOpen(false);
    const myId = session.user.id;
    const partnerId = chatPartner.id;

    const initChatRoom = async () => {
      await markMessagesAsRead(partnerId);
      await fetchChatMessages(partnerId);
    };
    initChatRoom();

    const channel = supabase
      .channel(`realtime_chat_${myId}_${partnerId}_${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            const newMsg = payload.new;
            const isRelevant =
              (newMsg.sender_id === myId && newMsg.receiver_id === partnerId) ||
              (newMsg.sender_id === partnerId && newMsg.receiver_id === myId);

            if (isRelevant) {
              if (newMsg.sender_id === partnerId && newMsg.receiver_id === myId && !newMsg.is_read) {
                newMsg.is_read = true;
                markMessagesAsRead(partnerId);
              }

              setChatMessages((prev) => {
                if (prev.some((m) => m.id === newMsg.id)) return prev;
                return [...prev, newMsg];
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedMsg = payload.new;
            setChatMessages((prev) =>
              prev.map((m) => (m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m))
            );
          }
        }
      )
      .subscribe();

    const syncTimer = setInterval(async () => {
      await markMessagesAsRead(partnerId);
      await fetchChatMessages(partnerId);
    }, 4000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(syncTimer);
    };
  }, [chatPartner, session]);

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

  const fetchFriendsAndFavorites = async () => {
    const { data: memberData } = await supabase
      .from('profiles')
      .select('id, nickname, bio, avatar_url, cover_url')
      .order('nickname', { ascending: true });

    if (memberData) setMembers(memberData);

    const { data: favData } = await supabase
      .from('friend_favorites')
      .select('friend_id')
      .eq('user_id', session.user.id);

    if (favData) {
      setFavoriteIds(favData.map((row) => row.friend_id));
    }
  };

  const toggleFavoriteFriend = async (friendId) => {
    const isAlreadyFav = favoriteIds.includes(friendId);
    if (isAlreadyFav) {
      setFavoriteIds((prev) => prev.filter((id) => id !== friendId));
      await supabase
        .from('friend_favorites')
        .delete()
        .eq('user_id', session.user.id)
        .eq('friend_id', friendId);
    } else {
      setFavoriteIds((prev) => [...prev, friendId]);
      await supabase
        .from('friend_favorites')
        .insert({ user_id: session.user.id, friend_id: friendId });
    }
  };

  const markMessagesAsRead = async (partnerId) => {
    const myId = session.user.id;
    await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('sender_id', partnerId)
      .eq('receiver_id', myId)
      .eq('is_read', false);
  };

  const fetchChatMessages = async (partnerId) => {
    const myId = session.user.id;
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${myId},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${myId})`)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setChatMessages(data);
    }
  };

  const sendChatMessage = async () => {
    const text = chatInput.trim();
    if (!text || !chatPartner || sendingMsg) return;

    setSendingMsg(true);
    setChatInput('');

    const isSelfChat = chatPartner.id === session.user.id;

    const { data, error } = await supabase
      .from('messages')
      .insert({
        sender_id: session.user.id,
        receiver_id: chatPartner.id,
        content: text,
        is_read: isSelfChat,
      })
      .select()
      .single();

    setSendingMsg(false);

    if (error) {
      showAlert('전송 실패', getKoreanErrorMessage(error));
      setChatInput(text);
    } else if (data) {
      setChatMessages((prev) => {
        if (prev.some((m) => m.id === data.id)) return prev;
        return [...prev, data];
      });
    }
  };

  const handleSendChatPhoto = async () => {
    if (!chatPartner || sendingMsg) return;
    setChatAttachMenuOpen(false);

    const uri = await selectFromGallery();
    if (!uri) return;

    setSendingMsg(true);
    try {
      const storagePath = `${session.user.id}/photo_${Date.now()}.jpg`;
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();

      const { error: uploadErr } = await supabase.storage
        .from('chat-files')
        .upload(storagePath, arrayBuffer, { contentType: 'image/jpeg', upsert: true });

      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from('chat-files').getPublicUrl(storagePath);
      const isSelfChat = chatPartner.id === session.user.id;

      const { data: msgData, error: msgErr } = await supabase
        .from('messages')
        .insert({
          sender_id: session.user.id,
          receiver_id: chatPartner.id,
          content: '',
          image_url: urlData.publicUrl,
          is_read: isSelfChat,
        })
        .select()
        .single();

      setSendingMsg(false);
      if (msgErr) {
        showAlert('사진 전송 실패', getKoreanErrorMessage(msgErr));
      } else if (msgData) {
        setChatMessages((prev) => {
          if (prev.some((m) => m.id === msgData.id)) return prev;
          return [...prev, msgData];
        });
      }
    } catch (e) {
      setSendingMsg(false);
      showAlert('사진 전송 오류', `채팅 사진을 올리지 못했습니다.\n(${e?.message || e})`);
    }
  };

  const handleSendChatFile = async () => {
    if (!chatPartner || sendingMsg) return;
    setChatAttachMenuOpen(false);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const picked = result.assets[0];
      const originalName = picked.name || '첨부파일';
      const mimeType = picked.mimeType || 'application/octet-stream';
      const extMatch = originalName.match(/\.([a-zA-Z0-9]+)$/);
      const safeExt = extMatch ? extMatch[1] : 'bin';
      const storagePath = `${session.user.id}/file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${safeExt}`;

      setSendingMsg(true);
      const response = await fetch(picked.uri);
      const arrayBuffer = await response.arrayBuffer();

      const { error: uploadErr } = await supabase.storage
        .from('chat-files')
        .upload(storagePath, arrayBuffer, { contentType: mimeType, upsert: true });

      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from('chat-files').getPublicUrl(storagePath);
      const isSelfChat = chatPartner.id === session.user.id;

      const { data: msgData, error: msgErr } = await supabase
        .from('messages')
        .insert({
          sender_id: session.user.id,
          receiver_id: chatPartner.id,
          content: '',
          file_url: urlData.publicUrl,
          file_name: originalName,
          is_read: isSelfChat,
        })
        .select()
        .single();

      setSendingMsg(false);
      if (msgErr) {
        showAlert('파일 전송 실패', getKoreanErrorMessage(msgErr));
      } else if (msgData) {
        setChatMessages((prev) => {
          if (prev.some((m) => m.id === msgData.id)) return prev;
          return [...prev, msgData];
        });
      }
    } catch (e) {
      setSendingMsg(false);
      showAlert('파일 첨부 오류', `파일을 첨부하지 못했습니다.\n(${e?.message || e})`);
    }
  };

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

  const openProfileEditor = () => {
    setTempNickname(profile.nickname || '');
    setTempBio(profile.bio || '');
    setTempAvatarUri(profile.avatar_url || null);
    setTempCoverUri(profile.cover_url || null);
    setEditProfileModal(true);
  };

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
      fetchFriendsAndFavorites();
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

  const otherMembers = members.filter((m) => m.id !== session.user.id);
  const filteredMembers = otherMembers.filter((m) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (m.nickname || '').toLowerCase().includes(q) ||
      (m.bio || '').toLowerCase().includes(q)
    );
  });
  const favoriteFriends = filteredMembers.filter((m) => favoriteIds.includes(m.id));

  const renderFriendRow = (friend) => {
    const isFav = favoriteIds.includes(friend.id);
    return (
      <TouchableOpacity
        key={friend.id}
        style={styles.ktFriendRow}
        activeOpacity={0.75}
        onPress={() => setSelectedFriend(friend)}
      >
        {friend.avatar_url ? (
          <Image source={{ uri: friend.avatar_url }} style={styles.ktFriendAvatar} />
        ) : (
          <View style={[styles.ktFriendAvatar, styles.ktDefaultAvatar]}>
            <Text style={{ fontSize: 20 }}>👤</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.ktFriendName}>{friend.nickname || '친구'}</Text>
          {friend.bio ? (
            <Text style={styles.ktFriendBio} numberOfLines={1}>
              {friend.bio}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          style={styles.ktFavStarBtn}
          onPress={() => toggleFavoriteFriend(friend.id)}
        >
          <Text style={{ fontSize: 18, color: isFav ? '#F6AD55' : '#CBD5E0' }}>
            {isFav ? '★' : '☆'}
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  // --- 화면 1: 카카오톡 스타일 친구탭 ('friends') ---
  const renderFriendsTabScreen = () => (
    <View style={styles.ktContainer}>
      <View style={styles.ktHeader}>
        <TouchableOpacity
          style={styles.ktMyMiniProfile}
          onPress={() => setMainTab('story')}
        >
          {profile.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.ktMyMiniAvatar} />
          ) : (
            <View style={[styles.ktMyMiniAvatar, styles.ktDefaultAvatar]}>
              <Text style={{ fontSize: 18 }}>👤</Text>
            </View>
          )}
          <Text style={styles.ktMyMiniName}>-{profile.nickname || '내 스토리'}-</Text>
        </TouchableOpacity>

        <View style={styles.ktHeaderIcons}>
          <TouchableOpacity
            style={styles.ktIconBtn}
            onPress={() => {
              setSearchVisible(!searchVisible);
              setSearchQuery('');
            }}
          >
            <Text style={{ fontSize: 19 }}>🔍</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ktIconBtn} onPress={openProfileEditor}>
            <Text style={{ fontSize: 19 }}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.ktPillBar}>
        <TouchableOpacity style={styles.ktPillActive}>
          <Text style={styles.ktPillActiveText}>친구</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.ktPillInactive}
          onPress={() => {
            setActiveTab('posts');
            setMainTab('story');
          }}
        >
          <Text style={styles.ktPillInactiveText}>소식</Text>
        </TouchableOpacity>
      </View>

      {searchVisible && (
        <View style={styles.ktSearchBox}>
          <TextInput
            style={styles.ktSearchInput}
            placeholder="이름 또는 상태메시지 검색..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
        <TouchableOpacity
          style={styles.ktSelfBanner}
          onPress={() =>
            setChatPartner({
              id: session.user.id,
              nickname: profile.nickname || '나',
              avatar_url: profile.avatar_url,
            })
          }
        >
          <View style={styles.ktSelfBadge}>
            <Text style={{ fontSize: 16 }}>💬</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.ktSelfTitle}>나와의 채팅 (개인 메모장)</Text>
            <Text style={styles.ktSelfSub} numberOfLines={1}>
              {profile.bio || '나에게 보내는 메시지를 기록해 보세요'}
            </Text>
          </View>
          <Text style={{ color: '#888', fontSize: 13 }}>열기 ›</Text>
        </TouchableOpacity>

        <View style={styles.ktSection}>
          <TouchableOpacity
            style={styles.ktSectionHeader}
            onPress={() => setFavSectionOpen(!favSectionOpen)}
          >
            <Text style={styles.ktSectionTitle}>즐겨찾는 친구 {favoriteFriends.length}</Text>
            <Text style={styles.ktSectionArrow}>{favSectionOpen ? '⌃' : '⌄'}</Text>
          </TouchableOpacity>

          {favSectionOpen && (
            favoriteFriends.length > 0 ? (
              favoriteFriends.map(renderFriendRow)
            ) : (
              <Text style={styles.ktEmptySectionText}>
                친구 오른쪽의 ☆ 별표를 누르면 즐겨찾기에 등록됩니다.
              </Text>
            )
          )}
        </View>

        <View style={styles.ktDivider} />

        <View style={styles.ktSection}>
          <TouchableOpacity
            style={styles.ktSectionHeader}
            onPress={() => setFriendsSectionOpen(!friendsSectionOpen)}
          >
            <Text style={styles.ktSectionTitle}>친구 {filteredMembers.length}</Text>
            <Text style={styles.ktSectionArrow}>{friendsSectionOpen ? '⌃' : '⌄'}</Text>
          </TouchableOpacity>

          {friendsSectionOpen && (
            filteredMembers.length > 0 ? (
              filteredMembers.map(renderFriendRow)
            ) : (
              <Text style={styles.ktEmptySectionText}>
                {searchQuery ? '검색된 친구가 없습니다.' : '아직 가입된 다른 회원이 없습니다.'}
              </Text>
            )
          )}
        </View>
      </ScrollView>
    </View>
  );

  // --- 화면 2: 채팅 목록 탭 ('chats') ---
  const renderChatsTabScreen = () => (
    <View style={styles.ktContainer}>
      <View style={styles.ktHeader}>
        <Text style={styles.ktPageTitle}>채팅</Text>
        <TouchableOpacity style={styles.ktIconBtn} onPress={fetchFriendsAndFavorites}>
          <Text style={{ fontSize: 16, color: '#333' }}>🔄 새로고침</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 14 }}
        renderItem={({ item }) => {
          const isMe = item.id === session.user.id;
          return (
            <TouchableOpacity
              style={styles.memberRow}
              onPress={() => setChatPartner(item)}
            >
              {item.avatar_url ? (
                <Image source={{ uri: item.avatar_url }} style={styles.memberAvatar} />
              ) : (
                <View style={[styles.memberAvatar, styles.ktDefaultAvatar]}>
                  <Text style={{ fontSize: 18 }}>👤</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.memberName}>{item.nickname || '이름 없음'}</Text>
                  {isMe && (
                    <View style={styles.meBadge}>
                      <Text style={styles.meBadgeText}>나와의 채팅</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.memberBio} numberOfLines={1}>
                  {item.bio || '터치하여 1:1 대화 시작하기'}
                </Text>
              </View>
              <Text style={styles.chatStartArrow}>대화 ›</Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );

  // --- 화면 3: 내 스토리 탭 ('story') ---
  const albumPosts = posts.filter((p) => p.image_urls && p.image_urls.length > 0);

  const renderProfileHeader = () => (
    <View>
      <ImageBackground
        source={profile.cover_url ? { uri: profile.cover_url } : undefined}
        style={styles.coverBackground}
        resizeMode="cover"
      >
        {/* 배경 빈 공간 터치 시 배경사진 원본 팝업 표시 */}
        <TouchableOpacity
          activeOpacity={1}
          style={styles.coverOverlay}
          onPress={() => {
            if (profile.cover_url) {
              setViewingImage({
                uri: profile.cover_url,
                title: `${profile.nickname || '내'}의 배경사진`,
                caption: profile.bio || '',
              });
            }
          }}
        >
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.topHomeBtn} onPress={() => setMainTab('friends')}>
              <Text style={styles.topHomeText}>← 친구</Text>
            </TouchableOpacity>
            <View style={styles.visitorBadge}>
              <Text style={styles.visitorText}>
                TODAY {profile.today_visits}  |  TOTAL {profile.total_visits}
              </Text>
            </View>
            <TouchableOpacity style={styles.topLogoutBtn} onPress={() => supabase.auth.signOut()}>
              <Text style={styles.topLogoutText}>로그아웃</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.profileBottomSection}>
            {/* 원형 프로필 사진 터치 시: 프로필 사진 원본 팝업으로 띄우기 (편집창 X) */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                if (profile.avatar_url) {
                  setViewingImage({
                    uri: profile.avatar_url,
                    title: `${profile.nickname || '내'}의 프로필 사진`,
                    caption: profile.bio || '',
                  });
                } else {
                  showAlert('알림', '등록된 프로필 사진이 없습니다.\n아래 [프로필 변경 / 꾸미기] 버튼에서 사진을 등록해 보세요!');
                }
              }}
            >
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

            {/* 아래쪽에 따로 뺀 프로필 변경 / 메신저 / 새 게시물 버튼 박스 */}
            <View style={styles.glassActionBox}>
              <TouchableOpacity style={styles.glassTopBtn} onPress={openProfileEditor}>
                <Text style={styles.glassBtnText}>✧ 프로필 변경 / 꾸미기</Text>
              </TouchableOpacity>
              <View style={styles.glassDividerHorizontal} />
              <View style={styles.glassBottomRow}>
                <TouchableOpacity style={styles.glassHalfBtn} onPress={() => setMainTab('chats')}>
                  <Text style={styles.glassBtnText}>💬 메신저 (채팅)</Text>
                </TouchableOpacity>
                <View style={styles.glassDividerVertical} />
                <TouchableOpacity
                  style={styles.glassHalfBtn}
                  onPress={() => {
                    setImageUri(null);
                    setContent('');
                    setWriteModalVisible(true);
                  }}
                >
                  <Text style={styles.glassBtnText}>⊞ 새 게시물 쓰기</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableOpacity>
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

  // 앨범 3열 사진 터치 시 원본 비율 팝업으로 열기
  const renderAlbumGridItem = ({ item }) => (
    <TouchableOpacity
      style={styles.gridItem}
      activeOpacity={0.85}
      onPress={() =>
        setViewingImage({
          uri: item.image_urls[0],
          title: item.profiles?.nickname || profile.nickname || '앨범 사진',
          caption: item.content || '',
          date: new Date(item.created_at).toLocaleString('ko-KR'),
        })
      }
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

  // 게시글 사진 터치 시 원본 비율 팝업으로 열기
  const renderPostCardItem = ({ item }) => {
    const isMyPost = item.author_id === session.user.id;
    const isEditing = editingPostId === item.id;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardAuthorRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                if (item.profiles?.avatar_url) {
                  setViewingImage({
                    uri: item.profiles.avatar_url,
                    title: `${item.profiles?.nickname || '친구'}의 프로필 사진`,
                  });
                }
              }}
            >
              {item.profiles?.avatar_url ? (
                <Image source={{ uri: item.profiles.avatar_url }} style={styles.smallAvatar} />
              ) : (
                <View style={[styles.smallAvatar, styles.defaultSmallAvatar]}>
                  <Text style={{ fontSize: 14 }}>👤</Text>
                </View>
              )}
            </TouchableOpacity>
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

        {item.image_urls?.[0] && (
          <AutoHeightImage
            uri={item.image_urls[0]}
            onPress={() =>
              setViewingImage({
                uri: item.image_urls[0],
                title: item.profiles?.nickname || profile.nickname || '게시글 사진',
                caption: item.content || '',
                date: new Date(item.created_at).toLocaleString('ko-KR'),
              })
            }
          />
        )}

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
      <View style={{ flex: 1 }}>
        {mainTab === 'friends' && renderFriendsTabScreen()}
        {mainTab === 'chats' && renderChatsTabScreen()}
        {mainTab === 'story' && (
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
                    ? '아직 앨범에 올린 사진이 없습니다.\n상단의 [새 게시물 쓰기]를 눌러 첫 사진을 등록해 보세요!'
                    : '아직 작성된 게시글이 없습니다.\n상단의 [새 게시물 쓰기]를 눌러 첫 글을 남겨 보세요!'}
                </Text>
              </View>
            }
          />
        )}
      </View>

      {/* 하단 탭 바 (친구 / 채팅 / 내 스토리) */}
      <View style={styles.bottomNav}>
        <TouchableOpacity
          style={styles.bottomNavItem}
          onPress={() => {
            fetchFriendsAndFavorites();
            setMainTab('friends');
          }}
        >
          <Text style={[styles.bottomNavIcon, mainTab === 'friends' && styles.bottomNavActive]}>👤</Text>
          <Text style={[styles.bottomNavLabel, mainTab === 'friends' && styles.bottomNavActive]}>친구</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bottomNavItem}
          onPress={() => {
            fetchFriendsAndFavorites();
            setMainTab('chats');
          }}
        >
          <Text style={[styles.bottomNavIcon, mainTab === 'chats' && styles.bottomNavActive]}>💬</Text>
          <Text style={[styles.bottomNavLabel, mainTab === 'chats' && styles.bottomNavActive]}>채팅</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.bottomNavItem}
          onPress={() => setMainTab('story')}
        >
          <Text style={[styles.bottomNavIcon, mainTab === 'story' && styles.bottomNavActive]}>🏡</Text>
          <Text style={[styles.bottomNavLabel, mainTab === 'story' && styles.bottomNavActive]}>내 스토리</Text>
        </TouchableOpacity>
      </View>

      {/* 오버레이 1: 친구 미니 프로필 팝업 (배경/프로필 사진 터치 시 원본 팝업 연결) */}
      {selectedFriend && (
        <View style={styles.overlayBackdrop}>
          <View style={styles.friendCardModal}>
            <ImageBackground
              source={selectedFriend.cover_url ? { uri: selectedFriend.cover_url } : undefined}
              style={styles.friendCardCover}
              resizeMode="cover"
            >
              <TouchableOpacity
                activeOpacity={1}
                style={styles.friendCardCoverOverlay}
                onPress={() => {
                  if (selectedFriend.cover_url) {
                    setViewingImage({
                      uri: selectedFriend.cover_url,
                      title: `${selectedFriend.nickname || '친구'}의 배경사진`,
                      caption: selectedFriend.bio || '',
                    });
                  }
                }}
              >
                <TouchableOpacity
                  style={styles.friendCardCloseBtn}
                  onPress={() => setSelectedFriend(null)}
                >
                  <Text style={{ color: '#FFF', fontWeight: 'bold' }}>✕</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </ImageBackground>

            <View style={styles.friendCardBody}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  if (selectedFriend.avatar_url) {
                    setViewingImage({
                      uri: selectedFriend.avatar_url,
                      title: `${selectedFriend.nickname || '친구'}의 프로필 사진`,
                      caption: selectedFriend.bio || '',
                    });
                  }
                }}
              >
                {selectedFriend.avatar_url ? (
                  <Image source={{ uri: selectedFriend.avatar_url }} style={styles.friendCardAvatar} />
                ) : (
                  <View style={[styles.friendCardAvatar, styles.defaultAvatar]}>
                    <Text style={{ fontSize: 30 }}>👤</Text>
                  </View>
                )}
              </TouchableOpacity>

              <Text style={styles.friendCardName}>-{selectedFriend.nickname || '친구'}-</Text>
              <Text style={styles.friendCardBio}>{selectedFriend.bio || '상태 메시지가 없습니다.'}</Text>

              <View style={styles.friendCardActions}>
                <TouchableOpacity
                  style={styles.friendCardActionBtn}
                  onPress={() => toggleFavoriteFriend(selectedFriend.id)}
                >
                  <Text style={{ fontSize: 20 }}>
                    {favoriteIds.includes(selectedFriend.id) ? '⭐' : '☆'}
                  </Text>
                  <Text style={styles.friendCardActionLabel}>
                    {favoriteIds.includes(selectedFriend.id) ? '즐겨찾기 됨' : '즐겨찾기'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.friendCardActionBtn, styles.friendCardChatBtn]}
                  onPress={() => {
                    const target = selectedFriend;
                    setSelectedFriend(null);
                    setChatPartner(target);
                  }}
                >
                  <Text style={{ fontSize: 20 }}>💬</Text>
                  <Text style={[styles.friendCardActionLabel, { fontWeight: 'bold', color: '#3C1E1E' }]}>
                    1:1 채팅하기
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* 오버레이 2: 1:1 실시간 채팅방 ('+' 사진 올리기 / 첨부파일 기능 포함) */}
      {chatPartner && (
        <KeyboardAvoidingView
          style={styles.messengerFullScreen}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={{ flex: 1, backgroundColor: '#BACEE0' }}>
            <View style={styles.msgHeader}>
              <TouchableOpacity onPress={() => setChatPartner(null)} style={styles.msgBackBtn}>
                <Text style={styles.msgBackText}>← 닫기</Text>
              </TouchableOpacity>
              <Text style={styles.msgHeaderTitle} numberOfLines={1}>
                {chatPartner.id === session.user.id
                  ? `${chatPartner.nickname || '나'} (나와의 채팅)`
                  : chatPartner.nickname || '대화방'}
              </Text>
              <View style={{ width: 52 }}>
                {sendingMsg && <ActivityIndicator size="small" color="#3C1E1E" />}
              </View>
            </View>

            <FlatList
              ref={chatListRef}
              data={chatMessages}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ padding: 14, paddingBottom: 20 }}
              onContentSizeChange={() => chatListRef.current?.scrollToEnd({ animated: true })}
              renderItem={({ item }) => {
                const isMine = item.sender_id === session.user.id;
                const timeStr = new Date(item.created_at).toLocaleTimeString('ko-KR', {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <View style={[styles.bubbleRow, isMine ? styles.bubbleRowMine : styles.bubbleRowOther]}>
                    {isMine && (
                      <View style={styles.mineMetaCol}>
                        {!item.is_read && <Text style={styles.unreadBadgeText}>1</Text>}
                        <Text style={styles.bubbleTime}>{timeStr}</Text>
                      </View>
                    )}

                    {!isMine && (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => {
                          if (chatPartner.avatar_url) {
                            setViewingImage({
                              uri: chatPartner.avatar_url,
                              title: `${chatPartner.nickname || '상대방'}의 프로필 사진`,
                            });
                          }
                        }}
                      >
                        {chatPartner.avatar_url ? (
                          <Image source={{ uri: chatPartner.avatar_url }} style={styles.chatAvatar} />
                        ) : (
                          <View style={[styles.chatAvatar, styles.defaultSmallAvatar]}>
                            <Text style={{ fontSize: 13 }}>👤</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    )}

                    <View style={{ maxWidth: '72%' }}>
                      {!isMine && (
                        <Text style={styles.chatSenderName}>{chatPartner.nickname || '상대방'}</Text>
                      )}

                      {item.image_url ? (
                        <TouchableOpacity
                          activeOpacity={0.9}
                          onPress={() =>
                            setViewingImage({
                              uri: item.image_url,
                              title: isMine ? '내가 보낸 사진' : `${chatPartner.nickname || '상대방'}이 보낸 사진`,
                              date: new Date(item.created_at).toLocaleString('ko-KR'),
                            })
                          }
                          style={styles.chatPhotoBubble}
                        >
                          <Image
                            source={{ uri: item.image_url }}
                            style={styles.chatBubbleImage}
                            resizeMode="cover"
                          />
                        </TouchableOpacity>
                      ) : item.file_url ? (
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => Linking.openURL(item.file_url)}
                          style={[styles.bubbleBox, isMine ? styles.bubbleMine : styles.bubbleOther, styles.fileBubbleBox]}
                        >
                          <View style={styles.fileIconCircle}>
                            <Text style={{ fontSize: 18 }}>📎</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.fileBubbleName} numberOfLines={2}>
                              {item.file_name || '첨부파일'}
                            </Text>
                            <Text style={styles.fileBubbleHint}>터치하여 파일 열기 / 저장</Text>
                          </View>
                        </TouchableOpacity>
                      ) : (
                        <View style={[styles.bubbleBox, isMine ? styles.bubbleMine : styles.bubbleOther]}>
                          <Text style={styles.bubbleText}>{item.content}</Text>
                        </View>
                      )}
                    </View>

                    {!isMine && <Text style={styles.bubbleTime}>{timeStr}</Text>}
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <Text style={{ color: '#4A5568', fontSize: 13 }}>
                    첫 메시지, 사진 또는 파일을 보내 대화를 시작해 보세요!
                  </Text>
                </View>
              }
            />

            <View style={styles.chatInputBar}>
              <TouchableOpacity
                style={[styles.chatPlusBtn, chatAttachMenuOpen && styles.chatPlusBtnActive]}
                onPress={() => setChatAttachMenuOpen(!chatAttachMenuOpen)}
                disabled={sendingMsg}
              >
                <Text style={styles.chatPlusText}>{chatAttachMenuOpen ? '✕' : '+'}</Text>
              </TouchableOpacity>

              <TextInput
                style={styles.chatTextInput}
                placeholder="메시지를 입력하세요..."
                value={chatInput}
                onChangeText={setChatInput}
                onFocus={() => setChatAttachMenuOpen(false)}
                multiline
              />

              <TouchableOpacity
                style={[styles.chatSendBtn, !chatInput.trim() && { opacity: 0.5 }]}
                onPress={sendChatMessage}
                disabled={!chatInput.trim() || sendingMsg}
              >
                <Text style={styles.chatSendText}>전송</Text>
              </TouchableOpacity>
            </View>

            {chatAttachMenuOpen && (
              <View style={styles.attachDrawer}>
                <TouchableOpacity style={styles.attachDrawerItem} onPress={handleSendChatPhoto}>
                  <View style={[styles.attachDrawerIconBox, { backgroundColor: '#48BB78' }]}>
                    <Text style={{ fontSize: 24 }}>🖼️</Text>
                  </View>
                  <Text style={styles.attachDrawerLabel}>사진 올리기</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.attachDrawerItem} onPress={handleSendChatFile}>
                  <View style={[styles.attachDrawerIconBox, { backgroundColor: '#4299E1' }]}>
                    <Text style={{ fontSize: 24 }}>📎</Text>
                  </View>
                  <Text style={styles.attachDrawerLabel}>파일 첨부</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      )}

      {/* 오버레이 3: 내 프로필 꾸미기(변경) 화면 */}
      {editProfileModal && (
        <View style={styles.overlayBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>프로필 변경 / 꾸미기</Text>
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

      {/* 오버레이 4: 새 게시물(스토리 + 사진) 작성 화면 */}
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
                <Image source={{ uri: imageUri }} style={styles.writePreviewImg} resizeMode="contain" />
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

      {/* 오버레이 5: 프로필 사진 / 배경사진 / 게시글 사진 원본 크기 비율 팝업 */}
      <OriginalImagePopup
        imageInfo={viewingImage}
        onClose={() => setViewingImage(null)}
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

  container: { flex: 1, backgroundColor: '#1E1E1E' },

  ktContainer: { flex: 1, backgroundColor: '#FFFFFF' },
  ktHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  ktPageTitle: { fontSize: 22, fontWeight: 'bold', color: '#191919' },
  ktMyMiniProfile: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ktMyMiniAvatar: { width: 42, height: 42, borderRadius: 16 },
  ktMyMiniName: { fontSize: 19, fontWeight: 'bold', color: '#191919' },
  ktDefaultAvatar: { backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
  ktHeaderIcons: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ktIconBtn: { padding: 6 },

  ktPillBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  ktPillActive: {
    backgroundColor: '#191919',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 18,
  },
  ktPillActiveText: { color: '#FFFFFF', fontSize: 13, fontWeight: 'bold' },
  ktPillInactive: {
    backgroundColor: '#F2F2F2',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 18,
  },
  ktPillInactiveText: { color: '#666666', fontSize: 13, fontWeight: '600' },

  ktSearchBox: { paddingHorizontal: 16, paddingBottom: 10 },
  ktSearchInput: {
    backgroundColor: '#F4F4F4',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 14,
  },

  ktSelfBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#F7F8FA',
    borderRadius: 12,
    gap: 12,
  },
  ktSelfBadge: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: '#FEE500',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ktSelfTitle: { fontSize: 14, fontWeight: 'bold', color: '#222' },
  ktSelfSub: { fontSize: 12, color: '#777', marginTop: 2 },

  ktSection: { paddingHorizontal: 16, paddingVertical: 6 },
  ktSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  ktSectionTitle: { fontSize: 12, fontWeight: '600', color: '#777777' },
  ktSectionArrow: { fontSize: 14, color: '#999999' },
  ktEmptySectionText: { fontSize: 12, color: '#AAA', paddingVertical: 10 },
  ktDivider: { height: 1, backgroundColor: '#F0F0F0', marginHorizontal: 16, marginVertical: 6 },

  ktFriendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    gap: 12,
  },
  ktFriendAvatar: { width: 46, height: 46, borderRadius: 18 },
  ktFriendName: { fontSize: 15, fontWeight: '600', color: '#191919' },
  ktFriendBio: { fontSize: 12, color: '#888888', marginTop: 2 },
  ktFavStarBtn: { padding: 6 },

  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#F9F9F9',
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    paddingVertical: 8,
  },
  bottomNavItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bottomNavIcon: { fontSize: 20, color: '#999999', marginBottom: 2 },
  bottomNavLabel: { fontSize: 11, color: '#888888', fontWeight: '600' },
  bottomNavActive: { color: '#191919', fontWeight: 'bold' },

  friendCardModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
  },
  friendCardCover: { width: '100%', height: 180, backgroundColor: '#4A5568' },
  friendCardCoverOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'flex-end',
    padding: 12,
  },
  friendCardCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  friendCardBody: { alignItems: 'center', padding: 20, paddingTop: 0 },
  friendCardAvatar: {
    width: 76,
    height: 76,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    marginTop: -38,
    marginBottom: 10,
  },
  friendCardName: { fontSize: 18, fontWeight: 'bold', color: '#222' },
  friendCardBio: { fontSize: 13, color: '#666', marginTop: 4, marginBottom: 18, textAlign: 'center' },
  friendCardActions: { flexDirection: 'row', gap: 10, width: '100%' },
  friendCardActionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F2F2F2',
    alignItems: 'center',
    gap: 4,
  },
  friendCardChatBtn: { backgroundColor: '#FEE500' },
  friendCardActionLabel: { fontSize: 13, color: '#333' },

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
  topHomeBtn: {
    backgroundColor: 'rgba(0, 0, 0, 0.38)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
  },
  topHomeText: { color: '#FFFFFF', fontSize: 11, fontWeight: 'bold' },
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
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2.5,
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
  glassTopBtn: { paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  glassDividerHorizontal: { height: 1, backgroundColor: 'rgba(255, 255, 255, 0.35)' },
  glassBottomRow: { flexDirection: 'row', alignItems: 'center' },
  glassHalfBtn: { flex: 1, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  glassDividerVertical: { width: 1, height: '100%', backgroundColor: 'rgba(255, 255, 255, 0.35)' },
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

  gridItem: { width: GRID_ITEM_SIZE, height: GRID_ITEM_SIZE, margin: 0.6, backgroundColor: '#2D2D2D' },
  gridImage: { width: '100%', height: '100%' },
  gridCaptionOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
  gridCaptionText: { color: '#FFF', fontSize: 10 },

  card: { backgroundColor: '#FFFFFF', padding: 16, marginBottom: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  smallAvatar: { width: 36, height: 36, borderRadius: 18 },
  defaultSmallAvatar: { backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
  author: { fontWeight: 'bold', fontSize: 15, color: '#222' },
  date: { fontSize: 11, color: '#999', marginTop: 1 },
  ownerActions: { flexDirection: 'row', gap: 6 },
  editBtn: { backgroundColor: '#F0F0F0', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 },
  editBtnText: { fontSize: 12, color: '#333' },
  deleteBtn: { backgroundColor: '#FFEBEE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 },
  deleteBtnText: { fontSize: 12, color: '#D32F2F' },
  editBox: { marginBottom: 10 },
  editInput: { borderWidth: 1, borderColor: '#CCC', borderRadius: 6, padding: 10, fontSize: 15, minHeight: 60, textAlignVertical: 'top' },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
  cancelEditBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#EEE', borderRadius: 4 },
  cancelEditText: { fontSize: 13, color: '#555' },
  saveEditBtn: { paddingHorizontal: 14, paddingVertical: 6, backgroundColor: '#3C1E1E', borderRadius: 4 },
  saveEditText: { fontSize: 13, color: '#fff', fontWeight: 'bold' },
  postText: { fontSize: 15, color: '#333', lineHeight: 22, marginBottom: 10 },
  postImage: { width: '100%', borderRadius: 8, marginBottom: 10, backgroundColor: '#F5F5F5' },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 10 },
  reactionBtn: { backgroundColor: '#F8F8F8', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 14 },
  reactionText: { fontSize: 12, color: '#444' },

  emptyBox: { padding: 48, alignItems: 'center' },
  emptyText: { color: '#AAA', textAlign: 'center', lineHeight: 22, fontSize: 14 },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#FAFAFA',
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    gap: 12,
  },
  memberAvatar: { width: 48, height: 48, borderRadius: 18 },
  memberName: { fontSize: 15, fontWeight: 'bold', color: '#222' },
  memberBio: { fontSize: 12, color: '#777', marginTop: 2 },
  meBadge: { backgroundColor: '#3C1E1E', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  meBadgeText: { color: '#FEE500', fontSize: 10, fontWeight: 'bold' },
  chatStartArrow: { fontSize: 13, color: '#2B6CB0', fontWeight: 'bold' },

  messengerFullScreen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    zIndex: 950,
  },
  msgHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEE500',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#E6CF00',
  },
  msgHeaderTitle: { fontSize: 16, fontWeight: 'bold', color: '#3C1E1E', flex: 1, textAlign: 'center' },
  msgBackBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  msgBackText: { fontSize: 14, fontWeight: 'bold', color: '#3C1E1E' },

  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12, gap: 6 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowOther: { justifyContent: 'flex-start' },
  chatAvatar: { width: 34, height: 34, borderRadius: 14, marginBottom: 2 },
  chatSenderName: { fontSize: 11, color: '#333', marginBottom: 3, marginLeft: 2 },
  bubbleBox: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 14 },
  bubbleMine: { backgroundColor: '#FEE500', borderBottomRightRadius: 2 },
  bubbleOther: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 2 },
  bubbleText: { fontSize: 14, color: '#222', lineHeight: 20 },

  chatPhotoBubble: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  chatBubbleImage: {
    width: 210,
    height: 210,
  },
  fileBubbleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 190,
  },
  fileIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileBubbleName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#222',
  },
  fileBubbleHint: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
  },

  mineMetaCol: { alignItems: 'flex-end', justifyContent: 'flex-end', marginBottom: 2 },
  unreadBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFE600',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    marginBottom: 1,
  },
  bubbleTime: { fontSize: 10, color: '#4A5568', marginBottom: 1 },

  chatInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#DDD',
    gap: 8,
  },
  chatPlusBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatPlusBtnActive: {
    backgroundColor: '#E2E8F0',
  },
  chatPlusText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#444',
    lineHeight: 22,
  },
  chatTextInput: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 90,
  },
  chatSendBtn: { backgroundColor: '#FEE500', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 18 },
  chatSendText: { color: '#3C1E1E', fontWeight: 'bold', fontSize: 14 },

  attachDrawer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
    gap: 28,
  },
  attachDrawerItem: {
    alignItems: 'center',
    gap: 8,
  },
  attachDrawerIconBox: {
    width: 54,
    height: 54,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachDrawerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },

  overlayBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    padding: 20,
    zIndex: 999,
  },
  modalCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 20, maxHeight: '90%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#222', marginBottom: 14, textAlign: 'center' },
  fieldLabel: { fontSize: 13, fontWeight: 'bold', color: '#555', marginBottom: 6, marginTop: 8 },
  coverPickerBox: {
    width: '65%',
    aspectRatio: 3 / 4,
    alignSelf: 'center',
    borderRadius: 10,
    backgroundColor: '#F2F2F2',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#DDD',
  },
  coverPreview: { width: '100%', height: '100%' },
  pickerPlaceholder: { color: '#777', fontSize: 13, textAlign: 'center', paddingHorizontal: 10 },
  avatarPickerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 4 },
  avatarPreview: { width: 64, height: 64, borderRadius: 32 },
  pickerLinkText: { color: '#2B6CB0', fontWeight: 'bold', fontSize: 14 },
  modalInput: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 12, fontSize: 14, backgroundColor: '#FAFAFA' },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalCancelBtn: { flex: 1, padding: 13, borderRadius: 8, backgroundColor: '#EEE', alignItems: 'center' },
  modalCancelText: { color: '#555', fontWeight: 'bold' },
  modalSaveBtn: { flex: 1, padding: 13, borderRadius: 8, backgroundColor: '#FEE500', alignItems: 'center' },
  modalSaveText: { color: '#3C1E1E', fontWeight: 'bold' },

  writePreviewImg: { width: '100%', height: 220, borderRadius: 8, backgroundColor: '#F5F5F5' },
  removePhotoBtn: { alignSelf: 'flex-end', marginTop: 6, padding: 6, backgroundColor: '#EEE', borderRadius: 4 },
  attachPhotoBtn: { padding: 14, borderRadius: 8, backgroundColor: '#F5F5F5', alignItems: 'center', borderWidth: 1, borderColor: '#DDD' },

  // 원본 크기 비율 사진 팝업 뷰어 스타일
  fullImageBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.96)',
    zIndex: 1100,
  },
  popupTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  popupTitleText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
    flex: 1,
    marginRight: 12,
  },
  popupCloseIconBtn: {
    backgroundColor: '#FEE500',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
  },
  popupCloseIconText: {
    color: '#3C1E1E',
    fontSize: 12,
    fontWeight: 'bold',
  },
  popupScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
  },
  popupCaptionBox: {
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 16,
    alignItems: 'center',
  },
  fullImageCaption: { color: '#FFF', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  fullImageDate: { color: '#AAA', fontSize: 12, marginTop: 6 },
});
