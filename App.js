import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  FlatList, Image, ImageBackground, Alert, SafeAreaView,
  ActivityIndicator, ScrollView, Dimensions, KeyboardAvoidingView,
  Platform, BackHandler, ToastAndroid, Linking, PanResponder
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as ImageManipulator from 'expo-image-manipulator';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';

const LEFT_RAIL_WIDTH = 52;
const getWindowWidth = () => Dimensions.get('window').width;
const getWindowHeight = () => Dimensions.get('window').height;
const SCREEN_WIDTH = getWindowWidth();
const CONTENT_WIDTH = Math.max(240, SCREEN_WIDTH - LEFT_RAIL_WIDTH);
const COVER_HEIGHT = Math.round(CONTENT_WIDTH * (4 / 3));
const GRID_ITEM_SIZE = (CONTENT_WIDTH - 4) / 3;
const FEED_MEDIA_WIDTH = Math.max(220, CONTENT_WIDTH - 24);

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

// 핀치 줌 + 한 손가락 드래그 + 더블 탭 확대가 가능한 이미지 뷰어
const ZoomableImage = ({ uri, aspectRatio, containerWidth, maxHeight, onZoomStateChange }) => {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });

  const scaleRef = useRef(1);
  const baseScaleRef = useRef(1);
  const pinchStartDistRef = useRef(null);
  const translateRef = useRef({ x: 0, y: 0 });
  const panOriginRef = useRef({ x: 0, y: 0 });
  const lastTapRef = useRef(0);
  const onZoomChangeRef = useRef(onZoomStateChange);

  useEffect(() => {
    onZoomChangeRef.current = onZoomStateChange;
  }, [onZoomStateChange]);

  const notifyZoom = (nextScale) => {
    if (onZoomChangeRef.current) {
      onZoomChangeRef.current(nextScale > 1.03);
    }
  };

  useEffect(() => {
    scaleRef.current = 1;
    baseScaleRef.current = 1;
    pinchStartDistRef.current = null;
    translateRef.current = { x: 0, y: 0 };
    setScale(1);
    setTranslate({ x: 0, y: 0 });
    notifyZoom(1);
  }, [uri]);

  const resetZoom = () => {
    scaleRef.current = 1;
    baseScaleRef.current = 1;
    pinchStartDistRef.current = null;
    translateRef.current = { x: 0, y: 0 };
    setScale(1);
    setTranslate({ x: 0, y: 0 });
    notifyZoom(1);
  };

  const toggleDoubleTapZoom = () => {
    if (scaleRef.current > 1.05) {
      resetZoom();
    } else {
      scaleRef.current = 2.2;
      baseScaleRef.current = 2.2;
      setScale(2.2);
      notifyZoom(2.2);
    }
  };

  const getTouchDistance = (touches) => {
    if (!touches || touches.length < 2) return null;
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.hypot(dx, dy);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches;
        if (touches && touches.length >= 2) return true;
        return scaleRef.current > 1.03 || Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
      },
      onPanResponderTerminationRequest: () => scaleRef.current <= 1.03,
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches && touches.length >= 2) {
          pinchStartDistRef.current = getTouchDistance(touches);
          baseScaleRef.current = scaleRef.current;
        } else {
          pinchStartDistRef.current = null;
          panOriginRef.current = {
            x: translateRef.current.x,
            y: translateRef.current.y,
          };
        }
      },
      onPanResponderMove: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches;
        if (touches && touches.length >= 2) {
          const dist = getTouchDistance(touches);
          if (!pinchStartDistRef.current && dist) {
            pinchStartDistRef.current = dist;
            baseScaleRef.current = scaleRef.current;
          }
          if (pinchStartDistRef.current && dist) {
            const nextScale = Math.min(4, Math.max(1, baseScaleRef.current * (dist / pinchStartDistRef.current)));
            scaleRef.current = nextScale;
            setScale(nextScale);
            notifyZoom(nextScale);
            if (nextScale <= 1.02) {
              translateRef.current = { x: 0, y: 0 };
              setTranslate({ x: 0, y: 0 });
            }
          }
        } else if (scaleRef.current > 1.03) {
          const maxOffset = Math.max(80, (containerWidth || 360) * 0.75 * (scaleRef.current - 1));
          const rawX = panOriginRef.current.x + gestureState.dx;
          const rawY = panOriginRef.current.y + gestureState.dy;
          const nextX = Math.min(maxOffset, Math.max(-maxOffset, rawX));
          const nextY = Math.min(maxOffset * 1.4, Math.max(-maxOffset * 1.4, rawY));
          translateRef.current = { x: nextX, y: nextY };
          setTranslate({ x: nextX, y: nextY });
        }
      },
      onPanResponderRelease: (_evt, gestureState) => {
        pinchStartDistRef.current = null;
        if (scaleRef.current < 1.05) {
          resetZoom();
        }
        const moved = Math.hypot(gestureState.dx, gestureState.dy);
        if (moved < 8) {
          const now = Date.now();
          if (now - lastTapRef.current < 280) {
            lastTapRef.current = 0;
            toggleDoubleTapZoom();
          } else {
            lastTapRef.current = now;
          }
        }
      },
    })
  ).current;

  const width = containerWidth || getWindowWidth();
  const ratio = aspectRatio || 1;
  const computedHeight = Math.min(
    maxHeight || getWindowHeight() * 0.72,
    Math.round(width / ratio)
  );

  return (
    <View
      style={{
        width,
        height: computedHeight,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        backgroundColor: '#FFFFFF',
      }}
      {...panResponder.panHandlers}
    >
      <Image
        source={{ uri }}
        style={{
          width,
          height: computedHeight,
          backgroundColor: '#FFFFFF',
          transform: [
            { translateX: translate.x },
            { translateY: translate.y },
            { scale },
          ],
        }}
        resizeMode="contain"
      />
    </View>
  );
};

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
    <TouchableOpacity activeOpacity={0.95} onPress={onPress} style={{ width: '100%', alignItems: 'center' }}>
      <Image
        source={{ uri }}
        style={[styles.feedImage, { aspectRatio }]}
        resizeMode="contain"
      />
    </TouchableOpacity>
  );
};

const OriginalImagePopup = ({ imageInfo, onClose }) => {
  const [aspectRatio, setAspectRatio] = useState(1);
  const [loadingSize, setLoadingSize] = useState(true);
  const [isZoomed, setIsZoomed] = useState(false);
  const winWidth = getWindowWidth();
  const winHeight = getWindowHeight();

  useEffect(() => {
    if (!imageInfo?.uri) return;
    setLoadingSize(true);
    setIsZoomed(false);
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
    <View style={styles.whitePopupBackdrop}>
      <View style={styles.whitePopupTopBar}>
        <Text style={styles.whitePopupTitle} numberOfLines={1}>
          {imageInfo.title || '사진 원본 보기'}
        </Text>
        <TouchableOpacity style={styles.popupCloseIconBtn} onPress={onClose}>
          <Ionicons name="close" size={15} color="#3C1E1E" />
          <Text style={styles.popupCloseIconText}>닫기</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ width: '100%', flex: 1 }}
        scrollEnabled={!isZoomed}
        contentContainerStyle={styles.whitePopupScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loadingSize && (
          <ActivityIndicator size="large" color="#0288D1" style={{ marginVertical: 30 }} />
        )}

        <ZoomableImage
          uri={imageInfo.uri}
          aspectRatio={aspectRatio}
          containerWidth={winWidth}
          maxHeight={Math.round(winHeight * 0.72)}
          onZoomStateChange={setIsZoomed}
        />

        <Text style={styles.zoomHintText}>두 손가락으로 확대·축소, 한 손가락으로 이동, 두 번 탭으로 확대</Text>

        {(imageInfo.caption || imageInfo.date) && (
          <View style={styles.whitePopupCaptionBox}>
            {imageInfo.caption ? (
              <Text style={styles.whitePopupCaption}>{imageInfo.caption}</Text>
            ) : null}
            {imageInfo.date ? (
              <Text style={styles.whitePopupDate}>{imageInfo.date}</Text>
            ) : null}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const PostDetailPopup = ({
  post,
  currentUserId,
  defaultNickname,
  comments,
  onAddComment,
  onClose,
  onToggleReaction,
  onSaveEdit,
  onDeletePost,
  onOpenFullImage,
}) => {
  const [aspectRatio, setAspectRatio] = useState(1);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const winWidth = getWindowWidth();
  const winHeight = getWindowHeight();

  useEffect(() => {
    setIsEditing(false);
    setEditValue(post?.content || '');
    setCommentText('');
    setIsZoomed(false);
    const imgUri = post?.image_urls?.[0];
    if (!imgUri) return;
    Image.getSize(
      imgUri,
      (width, height) => {
        if (width && height) setAspectRatio(width / height);
      },
      () => setAspectRatio(1)
    );
  }, [post?.id]);

  if (!post) return null;

  const isMyPost = post.author_id === currentUserId;
  const imgUri = post.image_urls?.[0];

  const handleSubmitComment = async () => {
    const trimmed = commentText.trim();
    if (!trimmed || submittingComment) return;
    setSubmittingComment(true);
    setCommentText('');
    const ok = await onAddComment(post.id, trimmed);
    setSubmittingComment(false);
    if (!ok) {
      setCommentText(trimmed);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.whitePopupBackdrop}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.whitePopupTopBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          {post.profiles?.avatar_url ? (
            <Image source={{ uri: post.profiles.avatar_url }} style={styles.popupSmallAvatar} />
          ) : (
            <View style={[styles.popupSmallAvatar, styles.defaultSmallAvatar]}>
              <Ionicons name="person" size={16} color="#64748B" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.whitePopupTitle} numberOfLines={1}>
              {post.profiles?.nickname || defaultNickname || '내 스토리'}
            </Text>
            <Text style={{ color: '#777777', fontSize: 11 }}>
              {new Date(post.created_at).toLocaleString('ko-KR')}
            </Text>
          </View>
        </View>

        {isMyPost && !isEditing && (
          <View style={{ flexDirection: 'row', gap: 6, marginRight: 8 }}>
            <TouchableOpacity
              style={styles.whitePopupMiniBtn}
              onPress={() => {
                setEditValue(post.content || '');
                setIsEditing(true);
              }}
            >
              <Text style={styles.whitePopupMiniBtnText}>수정</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.whitePopupMiniBtn, { backgroundColor: '#FFE5E5' }]}
              onPress={() => onDeletePost(post.id)}
            >
              <Text style={[styles.whitePopupMiniBtnText, { color: '#C53030' }]}>삭제</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.popupCloseIconBtn} onPress={onClose}>
          <Ionicons name="close" size={15} color="#3C1E1E" />
          <Text style={styles.popupCloseIconText}>닫기</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ width: '100%', flex: 1 }}
        scrollEnabled={!isZoomed}
        contentContainerStyle={{ alignItems: 'center', paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {imgUri && (
          <View style={{ width: '100%', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
            <ZoomableImage
              uri={imgUri}
              aspectRatio={aspectRatio}
              containerWidth={winWidth}
              maxHeight={Math.round(winHeight * 0.56)}
              onZoomStateChange={setIsZoomed}
            />
            <View style={styles.imageToolbarRow}>
              <Text style={styles.zoomHintText}>핀치 줌 / 드래그 / 더블 탭 확대</Text>
              <TouchableOpacity
                style={styles.fullViewChipBtn}
                onPress={() =>
                  onOpenFullImage({
                    uri: imgUri,
                    title: post.profiles?.nickname || defaultNickname || '사진 원본 보기',
                    caption: post.content || '',
                    date: new Date(post.created_at).toLocaleString('ko-KR'),
                  })
                }
              >
                <Ionicons name="expand-outline" size={13} color="#222222" />
                <Text style={styles.fullViewChipText}>전체화면</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.whiteDetailBodyBox}>
          {isEditing ? (
            <View style={{ marginBottom: 12 }}>
              <TextInput
                style={styles.whiteDetailEditInput}
                value={editValue}
                onChangeText={setEditValue}
                multiline
                autoFocus
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <TouchableOpacity
                  style={styles.whitePopupMiniBtn}
                  onPress={() => setIsEditing(false)}
                >
                  <Text style={styles.whitePopupMiniBtnText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.whitePopupMiniBtn, { backgroundColor: '#0288D1' }]}
                  onPress={async () => {
                    await onSaveEdit(post.id, editValue);
                    setIsEditing(false);
                  }}
                >
                  <Text style={[styles.whitePopupMiniBtnText, { color: '#FFFFFF' }]}>저장</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            post.content ? <Text style={styles.whiteDetailContentText}>{post.content}</Text> : null
          )}

          <View style={styles.whiteDetailReactionRow}>
            {REACTIONS.map((r) => {
              const count = post.reactions?.filter((x) => x.type === r.type).length || 0;
              return (
                <TouchableOpacity
                  key={r.type}
                  style={styles.whiteDetailReactionBtn}
                  onPress={() => onToggleReaction(post.id, r.type)}
                >
                  <Ionicons name={r.icon} size={14} color={r.color} />
                  <Text style={styles.whiteDetailReactionText}>
                    {r.label} {count > 0 ? count : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.commentSectionBox}>
            <Text style={styles.commentSectionTitle}>댓글 {comments.length}</Text>

            {comments.length === 0 ? (
              <Text style={styles.commentEmptyText}>아직 댓글이 없습니다. 첫 댓글을 남겨 보세요!</Text>
            ) : (
              comments.map((c) => (
                <View key={String(c.id)} style={styles.commentItemRow}>
                  <Text style={styles.commentAuthorText}>{c.authorName || '회원'}</Text>
                  <Text style={styles.commentContentText}>{c.content}</Text>
                  <Text style={styles.commentTimeText}>
                    {new Date(c.created_at).toLocaleString('ko-KR', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              ))
            )}
          </View>
        </View>
      </ScrollView>

      <View style={styles.commentInputBar}>
        <TextInput
          style={styles.commentTextInput}
          placeholder="댓글을 입력하세요..."
          value={commentText}
          onChangeText={setCommentText}
          multiline
        />
        <TouchableOpacity
          style={[styles.commentSubmitBtn, (!commentText.trim() || submittingComment) && { opacity: 0.5 }]}
          onPress={handleSubmitComment}
          disabled={!commentText.trim() || submittingComment}
        >
          <Text style={styles.commentSubmitText}>등록</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const REACTIONS = [
  { type: 'like', label: '좋아요', icon: 'heart-outline', color: '#E11D48' },
  { type: 'cool', label: '멋져요', icon: 'thumbs-up-outline', color: '#0284C7' },
  { type: 'happy', label: '기뻐요', icon: 'happy-outline', color: '#D97706' },
  { type: 'sad', label: '슬퍼요', icon: 'sad-outline', color: '#4F46E5' },
  { type: 'cheer', label: '힘내요', icon: 'flame-outline', color: '#EA580C' },
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

  const [mainTab, setMainTab] = useState('home');
  const [brandMenuOpen, setBrandMenuOpen] = useState(false);
  const [onlyFavoritesFeed, setOnlyFavoritesFeed] = useState(false);

  const [profile, setProfile] = useState({
    nickname: '',
    bio: '나만의 스토리를 기록해 보세요 ✨',
    avatar_url: null,
    cover_url: null,
    today_visits: 1,
    total_visits: 1,
  });

  const [editProfileModal, setEditProfileModal] = useState(false);
  const [tempNickname, setTempNickname] = useState('');
  const [tempBio, setTempBio] = useState('');
  const [tempAvatarUri, setTempAvatarUri] = useState(null);
  const [tempCoverUri, setTempCoverUri] = useState(null);

  const [members, setMembers] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [favSectionOpen, setFavSectionOpen] = useState(true);
  const [friendsSectionOpen, setFriendsSectionOpen] = useState(true);
  const [selectedFriend, setSelectedFriend] = useState(null);

  const [posts, setPosts] = useState([]);
  const [writeModalVisible, setWriteModalVisible] = useState(false);
  const [content, setContent] = useState('');
  const [imageUri, setImageUri] = useState(null);
  const [loading, setLoading] = useState(false);

  const [commentsByPost, setCommentsByPost] = useState({});

  const [selectedPostId, setSelectedPostId] = useState(null);
  const [viewingImage, setViewingImage] = useState(null);

  const [chatPartner, setChatPartner] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [chatAttachMenuOpen, setChatAttachMenuOpen] = useState(false);
  const chatListRef = useRef(null);

  const lastBackPressRef = useRef(0);

  useEffect(() => {
    const onHardwareBackPress = () => {
      if (!session) {
        if (isSignUpScreen) {
          setIsSignUpScreen(false);
          return true;
        }
        return false;
      }

      if (viewingImage) {
        setViewingImage(null);
        return true;
      }

      if (selectedPostId) {
        setSelectedPostId(null);
        return true;
      }

      if (brandMenuOpen) {
        setBrandMenuOpen(false);
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

      if (searchQuery) {
        setSearchQuery('');
        return true;
      }

      if (mainTab !== 'home') {
        setMainTab('home');
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
    selectedPostId,
    brandMenuOpen,
    editProfileModal,
    writeModalVisible,
    selectedFriend,
    chatAttachMenuOpen,
    chatPartner,
    searchQuery,
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
      fetchAllComments();
    }
  }, [session]);

  useEffect(() => {
    if (selectedPostId && supabase && session) {
      fetchCommentsForPost(selectedPostId);
    }
  }, [selectedPostId]);

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

  const resolveAuthorName = (userId) => {
    if (userId === session?.user?.id) {
      return profile.nickname || '나';
    }
    const found = members.find((m) => m.id === userId);
    return found?.nickname || '회원';
  };

  const fetchAllComments = async () => {
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .order('created_at', { ascending: true });

      if (!error && Array.isArray(data)) {
        const grouped = {};
        data.forEach((row) => {
          const key = String(row.post_id);
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push({
            ...row,
            authorName: resolveAuthorName(row.user_id),
          });
        });
        setCommentsByPost(grouped);
      }
    } catch {
      // 무시
    }
  };

  const fetchCommentsForPost = async (postId) => {
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (!error && Array.isArray(data)) {
        const mapped = data.map((row) => ({
          ...row,
          authorName: resolveAuthorName(row.user_id),
        }));
        setCommentsByPost((prev) => ({
          ...prev,
          [String(postId)]: mapped,
        }));
      }
    } catch {
      // 무시
    }
  };

  const handleAddComment = async (postId, text) => {
    const myName = profile.nickname || (session.user.email ? session.user.email.split('@')[0] : '나');
    const localComment = {
      id: `local_${Date.now()}`,
      post_id: postId,
      user_id: session.user.id,
      authorName: myName,
      content: text,
      created_at: new Date().toISOString(),
    };

    try {
      const { data, error } = await supabase
        .from('comments')
        .insert({
          post_id: postId,
          user_id: session.user.id,
          content: text,
        })
        .select()
        .single();

      if (error) {
        setCommentsByPost((prev) => ({
          ...prev,
          [String(postId)]: [...(prev[String(postId)] || []), localComment],
        }));
        return true;
      }

      const savedRow = {
        ...data,
        authorName: myName,
      };
      setCommentsByPost((prev) => {
        const current = prev[String(postId)] || [];
        if (current.some((item) => item.id === savedRow.id)) return prev;
        return {
          ...prev,
          [String(postId)]: [...current, savedRow],
        };
      });
      return true;
    } catch {
      setCommentsByPost((prev) => ({
        ...prev,
        [String(postId)]: [...(prev[String(postId)] || []), localComment],
      }));
      return true;
    }
  };

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
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
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

  const saveEditPost = async (postId, newText) => {
    if (!newText.trim()) {
      showAlert('알림', '수정할 내용을 입력해 주세요.');
      return;
    }
    setLoading(true);
    const { error } = await supabase
      .from('posts')
      .update({ content: newText.trim() })
      .eq('id', postId);
    setLoading(false);

    if (error) {
      showAlert('수정 실패', getKoreanErrorMessage(error));
    } else {
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
          else {
            setSelectedPostId(null);
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
          <TextInput style={styles.input} placeholder="이메일" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <TextInput style={styles.input} placeholder="비밀번호 (6자 이상)" value={password} onChangeText={setPassword} secureTextEntry />
          <TextInput style={styles.input} placeholder="비밀번호 확인" value={passwordConfirm} onChangeText={setPasswordConfirm} secureTextEntry />
          <TouchableOpacity style={styles.btnPrimary} onPress={handleSignUp} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.btnText}>가입하기</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => switchAuthMode(false)} disabled={loading}>
            <Text style={styles.btnSecondaryText}>← 로그인 화면으로 돌아가기</Text>
          </TouchableOpacity>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.authContainer}>
        <Text style={styles.logo}>me</Text>
        <TextInput style={styles.input} placeholder="이메일" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <TextInput style={styles.input} placeholder="비밀번호 (6자 이상)" value={password} onChangeText={setPassword} secureTextEntry />
        <TouchableOpacity style={styles.btnPrimary} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.btnText}>로그인</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnSecondary} onPress={() => switchAuthMode(true)} disabled={loading}>
          <Text style={styles.btnSecondaryText}>이메일로 회원가입</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const otherMembers = members.filter((m) => m.id !== session.user.id);
  const feedPosts = onlyFavoritesFeed
    ? posts.filter((p) => p.author_id === session.user.id || favoriteIds.includes(p.author_id))
    : posts;

  const renderHomeFeedHeader = () => (
    <View style={styles.igHeaderContainer}>
      <View style={styles.igTopBar}>
        <View style={{ width: 24 }} />

        <TouchableOpacity
          style={styles.igCenterBrandBtn}
          activeOpacity={0.75}
          onPress={() => setBrandMenuOpen(!brandMenuOpen)}
        >
          <Text style={styles.igLogoText}>
            {onlyFavoritesFeed ? 'me ★' : 'me'}
          </Text>
          <Ionicons
            name={brandMenuOpen ? 'chevron-up' : 'chevron-down'}
            size={18}
            color="#333333"
            style={{ marginLeft: 6 }}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.igTopRightBtn}
          onPress={() => {
            setBrandMenuOpen(false);
            setMainTab('chats');
          }}
        >
          <Ionicons name="chatbubble-outline" size={21} color="#111111" />
        </TouchableOpacity>
      </View>

      {brandMenuOpen && (
        <View style={styles.igBrandDropdown}>
          <TouchableOpacity
            style={styles.igDropdownRow}
            onPress={() => {
              setBrandMenuOpen(false);
              setOnlyFavoritesFeed(false);
              fetchFriendsAndFavorites();
              setMainTab('friends');
            }}
          >
            <Ionicons name="person-add-outline" size={17} color="#111111" />
            <Text style={styles.igDropdownLabel}>친구하기</Text>
          </TouchableOpacity>

          <View style={styles.igDropdownDivider} />

          <TouchableOpacity
            style={styles.igDropdownRow}
            onPress={() => {
              setBrandMenuOpen(false);
              setOnlyFavoritesFeed(!onlyFavoritesFeed);
            }}
          >
            <Ionicons name={onlyFavoritesFeed ? 'star' : 'star-outline'} size={17} color="#111111" />
            <Text style={styles.igDropdownLabel}>
              {onlyFavoritesFeed ? '즐겨찾기 필터 끄기 (전체 보기)' : '즐겨찾기'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.igStoryBarContent}
      >
        <TouchableOpacity
          style={styles.igStoryItem}
          onPress={() => {
            setBrandMenuOpen(false);
            setImageUri(null);
            setContent('');
            setWriteModalVisible(true);
          }}
        >
          <View style={styles.igStoryAvatarWrap}>
            {profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.igStoryAvatar} />
            ) : (
              <View style={[styles.igStoryAvatar, styles.ktDefaultAvatar]}>
                <Ionicons name="person" size={22} color="#64748B" />
              </View>
            )}
            <View style={styles.igStoryPlusBadge}>
              <Ionicons name="add" size={13} color="#FFFFFF" />
            </View>
          </View>
          <Text style={styles.igStoryName} numberOfLines={1}>내 스토리</Text>
        </TouchableOpacity>

        {otherMembers.map((member) => (
          <TouchableOpacity
            key={member.id}
            style={styles.igStoryItem}
            onPress={() => {
              setBrandMenuOpen(false);
              setSelectedFriend(member);
            }}
          >
            <View style={styles.igStoryRing}>
              {member.avatar_url ? (
                <Image source={{ uri: member.avatar_url }} style={styles.igStoryAvatar} />
              ) : (
                <View style={[styles.igStoryAvatar, styles.ktDefaultAvatar]}>
                  <Ionicons name="person" size={22} color="#64748B" />
                </View>
              )}
            </View>
            <Text style={styles.igStoryName} numberOfLines={1}>
              {member.nickname || '친구'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const renderHomeFeedPostItem = ({ item }) => {
    const isMyPost = item.author_id === session.user.id;
    const isFriendFav = favoriteIds.includes(item.author_id);
    const totalReactions = item.reactions?.length || 0;
    const postComments = commentsByPost[String(item.id)] || [];

    return (
      <View style={styles.igPostCard}>
        <View style={styles.igPostHeader}>
          <TouchableOpacity
            style={styles.igPostAuthorRow}
            onPress={() => {
              if (isMyPost) {
                setMainTab('story');
              } else {
                const target = members.find((m) => m.id === item.author_id);
                if (target) setSelectedFriend(target);
              }
            }}
          >
            {item.profiles?.avatar_url ? (
              <Image source={{ uri: item.profiles.avatar_url }} style={styles.igPostAvatar} />
            ) : (
              <View style={[styles.igPostAvatar, styles.ktDefaultAvatar]}>
                <Ionicons name="person" size={16} color="#64748B" />
              </View>
            )}
            <View>
              <Text style={styles.igPostAuthorName}>
                {item.profiles?.nickname || profile.nickname || '친구'}
              </Text>
              <Text style={styles.igPostDate}>
                {new Date(item.created_at).toLocaleString('ko-KR')}
              </Text>
            </View>
          </TouchableOpacity>

          <View style={styles.igPostRightActions}>
            {!isMyPost && (
              <TouchableOpacity
                style={[
                  styles.igFollowPillBtn,
                  isFriendFav && styles.igFollowPillBtnActive,
                ]}
                onPress={() => toggleFavoriteFriend(item.author_id)}
              >
                <Text
                  style={[
                    styles.igFollowPillText,
                    isFriendFav && styles.igFollowPillTextActive,
                  ]}
                >
                  {isFriendFav ? '친구됨' : '친구하기'}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setSelectedPostId(item.id)} style={{ paddingHorizontal: 4, paddingVertical: 2 }}>
              <Ionicons name="ellipsis-horizontal" size={18} color="#333333" />
            </TouchableOpacity>
          </View>
        </View>

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

        <View style={styles.igPostFooter}>
          <View style={styles.igActionIconRow}>
            <TouchableOpacity onPress={() => toggleReaction(item.id, 'like')} style={styles.igQuickIconBtn}>
              <Ionicons name="heart-outline" size={21} color="#111111" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSelectedPostId(item.id)} style={styles.igQuickIconBtn}>
              <Ionicons name="chatbubble-outline" size={20} color="#111111" />
            </TouchableOpacity>
          </View>

          <View style={styles.igReactionBar}>
            {REACTIONS.map((r) => {
              const count = item.reactions?.filter((x) => x.type === r.type).length || 0;
              return (
                <TouchableOpacity
                  key={r.type}
                  style={styles.igReactionPill}
                  onPress={() => toggleReaction(item.id, r.type)}
                >
                  <Ionicons name={r.icon} size={13} color={r.color} />
                  <Text style={styles.igReactionText}>
                    {r.label} {count > 0 ? count : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {totalReactions > 0 && (
            <Text style={styles.igLikeSummary}>공감 {totalReactions}개</Text>
          )}

          {item.content ? (
            <Text style={styles.igPostCaption}>
              <Text style={{ fontWeight: 'bold' }}>
                {item.profiles?.nickname || profile.nickname || '친구'}{' '}
              </Text>
              {item.content}
            </Text>
          ) : null}

          <TouchableOpacity
            style={styles.feedCommentTriggerBtn}
            onPress={() => setSelectedPostId(item.id)}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={14} color="#0277BD" />
            <Text style={styles.feedCommentTriggerText}>
              댓글 {postComments.length}개 보기 / 작성하기
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

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
            <Ionicons name="person" size={20} color="#64748B" />
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
          <Ionicons
            name={isFav ? 'star' : 'star-outline'}
            size={20}
            color={isFav ? '#F59E0B' : '#CBD5E1'}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderFriendsTabScreen = () => (
    <View style={styles.ktContainer}>
      <View style={styles.ktHeader}>
        <Text style={styles.ktPageTitle}>친구하기</Text>
        <TouchableOpacity style={styles.ktIconBtn} onPress={openProfileEditor}>
          <Ionicons name="settings-outline" size={21} color="#111111" />
        </TouchableOpacity>
      </View>

      <View style={styles.ktSearchBox}>
        <View style={styles.ktSearchRow}>
          <Ionicons name="search-outline" size={17} color="#888888" />
          <TextInput
            style={styles.ktSearchInput}
            placeholder="이름 또는 상태메시지로 친구 검색..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

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
            <Ionicons name="chatbubble" size={16} color="#3C1E1E" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.ktSelfTitle}>나와의 채팅 (개인 메모장)</Text>
            <Text style={styles.ktSelfSub} numberOfLines={1}>
              {profile.bio || '나에게 보내는 메시지를 기록해 보세요'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#888888" />
        </TouchableOpacity>

        <View style={styles.ktSection}>
          <TouchableOpacity
            style={styles.ktSectionHeader}
            onPress={() => setFavSectionOpen(!favSectionOpen)}
          >
            <Text style={styles.ktSectionTitle}>즐겨찾는 친구 {favoriteFriends.length}</Text>
            <Ionicons name={favSectionOpen ? 'chevron-up' : 'chevron-down'} size={15} color="#999999" />
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
            <Text style={styles.ktSectionTitle}>전체 친구 {filteredMembers.length}</Text>
            <Ionicons name={friendsSectionOpen ? 'chevron-up' : 'chevron-down'} size={15} color="#999999" />
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

  const renderChatsTabScreen = () => (
    <View style={styles.ktContainer}>
      <View style={styles.ktHeader}>
        <Text style={styles.ktPageTitle}>메시지</Text>
        <TouchableOpacity style={styles.ktIconBtn} onPress={fetchFriendsAndFavorites}>
          <Ionicons name="refresh-outline" size={20} color="#333333" />
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
                  <Ionicons name="person" size={20} color="#64748B" />
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
              <Ionicons name="chatbubble-outline" size={18} color="#2B6CB0" />
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );

  const renderProfileHeader = () => (
    <ImageBackground
      source={profile.cover_url ? { uri: profile.cover_url } : undefined}
      style={styles.coverBackground}
      resizeMode="cover"
    >
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
          <TouchableOpacity style={styles.topCircleBtn} onPress={() => setMainTab('home')}>
            <Ionicons name="arrow-back" size={16} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.visitorBadge}>
            <Text style={styles.visitorText}>
              TODAY {profile.today_visits}  |  TOTAL {profile.total_visits}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity style={styles.topPillBtn} onPress={openProfileEditor}>
              <Text style={styles.topPillBtnText}>프로필 편집</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.topCircleBtn} onPress={() => supabase.auth.signOut()}>
              <Text style={[styles.topCircleBtnText, { fontSize: 11 }]}>로그아웃</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.profileBottomSection}>
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
                showAlert('알림', '등록된 프로필 사진이 없습니다.\n아래 [내 프로필 꾸미기] 버튼에서 사진을 등록해 보세요!');
              }
            }}
          >
            {profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.circularAvatar} />
            ) : (
              <View style={[styles.circularAvatar, styles.defaultAvatar]}>
                <Ionicons name="person" size={28} color="#FFFFFF" />
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.profileName}>-{profile.nickname || '내 스토리'}-</Text>
          <Text style={styles.profileBio}>{profile.bio}</Text>

          <View style={styles.glassActionBox}>
            <TouchableOpacity style={styles.glassTopBtn} onPress={openProfileEditor}>
              <Text style={styles.glassBtnText}>내 프로필 꾸미기</Text>
            </TouchableOpacity>
            <View style={styles.glassDividerHorizontal} />
            <View style={styles.glassBottomRow}>
              <TouchableOpacity
                style={styles.glassHalfBtn}
                onPress={() =>
                  setChatPartner({
                    id: session.user.id,
                    nickname: profile.nickname || '나',
                    avatar_url: profile.avatar_url,
                  })
                }
              >
                <Ionicons name="chatbubble-outline" size={14} color="#FFFFFF" />
                <Text style={styles.glassBtnText}>나와의 채팅</Text>
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
                <Ionicons name="add" size={16} color="#FFFFFF" />
                <Text style={styles.glassBtnText}>새 게시물</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </ImageBackground>
  );

  const renderGridItem = ({ item }) => {
    const hasImage = item.image_urls && item.image_urls.length > 0;
    const reactionCount = item.reactions?.length || 0;

    return (
      <TouchableOpacity
        style={styles.gridItem}
        activeOpacity={0.85}
        onPress={() => setSelectedPostId(item.id)}
      >
        {hasImage ? (
          <>
            <Image source={{ uri: item.image_urls[0] }} style={styles.gridImage} />
            {item.content ? (
              <View style={styles.gridCaptionOverlay}>
                <Text style={styles.gridCaptionText} numberOfLines={1}>
                  {item.content}
                </Text>
              </View>
            ) : null}
          </>
        ) : (
          <View style={styles.gridTextOnlyBox}>
            <Text style={styles.gridTextOnlyContent} numberOfLines={4}>
              {item.content}
            </Text>
            <Text style={styles.gridTextOnlyAuthor} numberOfLines={1}>
              {item.profiles?.nickname || profile.nickname || '스토리'}
            </Text>
          </View>
        )}

        {reactionCount > 0 && (
          <View style={styles.gridHeartBadge}>
            <Ionicons name="heart" size={10} color="#FFFFFF" />
            <Text style={styles.gridHeartText}>{reactionCount}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const selectedPostObj = posts.find((p) => p.id === selectedPostId) || null;
  const selectedPostComments = selectedPostId ? (commentsByPost[String(selectedPostId)] || []) : [];

  const isHomeActive = mainTab === 'home' && !onlyFavoritesFeed;
  const isFriendsActive = mainTab === 'friends';
  const isChatsActive = mainTab === 'chats';
  const isFavActive = mainTab === 'home' && onlyFavoritesFeed;
  const isStoryActive = mainTab === 'story';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.mainShellRow}>
        {/* 화면 왼쪽 세로 Ionicons 메뉴바 */}
        <View style={styles.leftVerticalMenuBar}>
          <TouchableOpacity
            style={styles.leftMenuBtn}
            onPress={() => {
              setBrandMenuOpen(false);
              setOnlyFavoritesFeed(false);
              fetchPosts();
              setMainTab('home');
            }}
          >
            <Ionicons
              name={isHomeActive ? 'home' : 'home-outline'}
              size={23}
              color="#111111"
              style={{ opacity: isHomeActive ? 1 : 0.45 }}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.leftMenuBtn}
            onPress={() => {
              setBrandMenuOpen(false);
              fetchFriendsAndFavorites();
              setMainTab('friends');
            }}
          >
            <Ionicons
              name="search"
              size={23}
              color="#111111"
              style={{ opacity: isFriendsActive ? 1 : 0.45 }}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.leftMenuBtn}
            onPress={() => {
              setBrandMenuOpen(false);
              fetchFriendsAndFavorites();
              setMainTab('chats');
            }}
          >
            <Ionicons
              name={isChatsActive ? 'chatbubble' : 'chatbubble-outline'}
              size={22}
              color="#111111"
              style={{ opacity: isChatsActive ? 1 : 0.45 }}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.leftMenuBtn}
            onPress={() => {
              setBrandMenuOpen(false);
              setOnlyFavoritesFeed(!onlyFavoritesFeed);
              setMainTab('home');
            }}
          >
            <Ionicons
              name={isFavActive ? 'heart' : 'heart-outline'}
              size={23}
              color="#111111"
              style={{ opacity: isFavActive ? 1 : 0.45 }}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.leftMenuBtn}
            onPress={() => {
              setBrandMenuOpen(false);
              setImageUri(null);
              setContent('');
              setWriteModalVisible(true);
            }}
          >
            <Ionicons name="add" size={26} color="#111111" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.leftMenuBtn}
            onPress={() => {
              setBrandMenuOpen(false);
              setMainTab('story');
            }}
          >
            <View style={[styles.leftMenuAvatarRing, isStoryActive && styles.leftMenuAvatarRingActive]}>
              {profile.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.leftMenuAvatarImg} />
              ) : (
                <View style={[styles.leftMenuAvatarImg, styles.ktDefaultAvatar]}>
                  <Ionicons name="person" size={14} color="#64748B" />
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>

        {/* 왼쪽 세로 메뉴바 옆 메인 콘텐츠 영역 */}
        <View style={styles.rightContentArea}>
          {mainTab === 'home' && (
            <FlatList
              style={{ flex: 1, backgroundColor: '#FFFFFF' }}
              contentContainerStyle={{ paddingBottom: 24 }}
              data={feedPosts}
              keyExtractor={(item) => String(item.id)}
              ListHeaderComponent={renderHomeFeedHeader}
              renderItem={renderHomeFeedPostItem}
              ListEmptyComponent={
                <View style={styles.emptyBox}>
                  <Text style={[styles.emptyText, { color: '#777' }]}>
                    {onlyFavoritesFeed
                      ? '즐겨찾기한 친구의 새 게시물이 없습니다.\n왼쪽 하트 아이콘 또는 상단 [me ∨]에서 전체 보기로 전환해 보세요!'
                      : '아직 올라온 스토리가 없습니다.\n왼쪽 [+] 버튼을 눌러 첫 사진을 올려 보세요!'}
                  </Text>
                </View>
              }
            />
          )}

          {mainTab === 'friends' && renderFriendsTabScreen()}
          {mainTab === 'chats' && renderChatsTabScreen()}
          {mainTab === 'story' && (
            <FlatList
              data={posts}
              numColumns={3}
              keyExtractor={(item) => String(item.id)}
              ListHeaderComponent={renderProfileHeader}
              renderItem={renderGridItem}
              ListEmptyComponent={
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>
                    아직 등록된 게시물이 없습니다.{'\n'}상단의 [+ 새 게시물]을 눌러 첫 스토리를 올려 보세요!
                  </Text>
                </View>
              }
            />
          )}
        </View>
      </View>

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
                  <Ionicons name="close" size={16} color="#FFFFFF" />
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
                    <Ionicons name="person" size={30} color="#FFFFFF" />
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
                  <Ionicons
                    name={favoriteIds.includes(selectedFriend.id) ? 'star' : 'star-outline'}
                    size={19}
                    color={favoriteIds.includes(selectedFriend.id) ? '#F59E0B' : '#333333'}
                  />
                  <Text style={styles.friendCardActionLabel}>
                    {favoriteIds.includes(selectedFriend.id) ? '친구됨' : '친구하기'}
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
                  <Ionicons name="chatbubble-outline" size={19} color="#3C1E1E" />
                  <Text style={[styles.friendCardActionLabel, { fontWeight: 'bold', color: '#3C1E1E' }]}>
                    1:1 채팅하기
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      )}

      {chatPartner && (
        <KeyboardAvoidingView
          style={styles.messengerFullScreen}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={{ flex: 1, backgroundColor: '#BACEE0' }}>
            <View style={styles.msgHeader}>
              <TouchableOpacity onPress={() => setChatPartner(null)} style={styles.msgBackBtn}>
                <Ionicons name="arrow-back" size={16} color="#3C1E1E" />
                <Text style={styles.msgBackText}>닫기</Text>
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
                            <Ionicons name="person" size={15} color="#64748B" />
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
                            <Ionicons name="attach" size={18} color="#333333" />
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
                <Ionicons name={chatAttachMenuOpen ? 'close' : 'add'} size={21} color="#444444" />
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
                    <Ionicons name="image-outline" size={24} color="#FFFFFF" />
                  </View>
                  <Text style={styles.attachDrawerLabel}>사진 올리기</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.attachDrawerItem} onPress={handleSendChatFile}>
                  <View style={[styles.attachDrawerIconBox, { backgroundColor: '#4299E1' }]}>
                    <Ionicons name="document-attach-outline" size={24} color="#FFFFFF" />
                  </View>
                  <Text style={styles.attachDrawerLabel}>파일 첨부</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      )}

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
                  <View style={{ alignItems: 'center', gap: 6 }}>
                    <Ionicons name="image-outline" size={26} color="#777777" />
                    <Text style={styles.pickerPlaceholder}>터치하여 세로 배경사진 선택</Text>
                  </View>
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
                    <Ionicons name="person" size={24} color="#FFFFFF" />
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
                {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.modalSaveText}>저장하기</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {writeModalVisible && (
        <View style={styles.overlayBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>새 게시물 올리기</Text>
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
                  <Ionicons name="close" size={14} color="#555555" />
                  <Text style={{ fontSize: 12, color: '#555' }}>사진 지우기</Text>
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
                <Ionicons name="image-outline" size={18} color="#333333" />
                <Text style={{ color: '#333', fontWeight: 'bold' }}>갤러리에서 사진 첨부</Text>
              </TouchableOpacity>
            )}

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setWriteModalVisible(false)} disabled={loading}>
                <Text style={styles.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={createPost} disabled={loading}>
                {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.modalSaveText}>올리기</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <PostDetailPopup
        post={selectedPostObj}
        currentUserId={session.user.id}
        defaultNickname={profile.nickname}
        comments={selectedPostComments}
        onAddComment={handleAddComment}
        onClose={() => setSelectedPostId(null)}
        onToggleReaction={toggleReaction}
        onSaveEdit={saveEditPost}
        onDeletePost={confirmDeletePost}
        onOpenFullImage={(info) => setViewingImage(info)}
      />

      <OriginalImagePopup
        imageInfo={viewingImage}
        onClose={() => setViewingImage(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  authContainer: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#E3F2FD' },
  logo: {
    fontSize: 56,
    fontWeight: '900',
    color: '#01579B',
    textAlign: 'center',
    marginBottom: 32,
    letterSpacing: -2.5,
    transform: [{ skewX: '-8deg' }],
  },
  input: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#BBDEFB', borderRadius: 8, padding: 14, marginBottom: 12 },
  btnPrimary: { backgroundColor: '#0288D1', padding: 15, borderRadius: 8, alignItems: 'center', marginBottom: 10 },
  btnText: { fontWeight: 'bold', color: '#FFFFFF', fontSize: 16 },
  btnSecondary: { padding: 14, alignItems: 'center' },
  btnSecondaryText: { color: '#0277BD', fontWeight: '600' },

  container: { flex: 1, backgroundColor: '#FFFFFF' },
  mainShellRow: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
  },

  leftVerticalMenuBar: {
    width: LEFT_RAIL_WIDTH,
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: '#EFEFEF',
    alignItems: 'center',
    paddingTop: 22,
    paddingBottom: 22,
    justifyContent: 'space-between',
  },
  leftMenuBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftMenuAvatarRing: {
    padding: 1.5,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  leftMenuAvatarRingActive: {
    borderColor: '#111111',
  },
  leftMenuAvatarImg: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },

  rightContentArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  igHeaderContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    paddingTop: 10,
    paddingBottom: 6,
  },
  igTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  igCenterBrandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
  igLogoText: {
    fontSize: 42,
    fontWeight: '900',
    color: '#111111',
    letterSpacing: -2.2,
    lineHeight: 48,
    transform: [{ skewX: '-8deg' }],
  },
  igTopRightBtn: {
    width: 24,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },

  igBrandDropdown: {
    alignSelf: 'center',
    width: 190,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    paddingVertical: 6,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  igDropdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 10,
  },
  igDropdownLabel: { fontSize: 14, fontWeight: '600', color: '#191919' },
  igDropdownDivider: { height: 1, backgroundColor: '#F2F2F2', marginHorizontal: 12 },

  igStoryBarContent: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 10,
  },
  igStoryItem: {
    alignItems: 'center',
    width: 58,
  },
  igStoryAvatarWrap: {
    position: 'relative',
    marginBottom: 5,
  },
  igStoryRing: {
    padding: 2,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#E1306C',
    marginBottom: 5,
  },
  igStoryAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  igStoryPlusBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#111111',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  igStoryName: {
    fontSize: 11,
    color: '#222222',
    textAlign: 'center',
  },

  igPostCard: {
    backgroundColor: '#FFFFFF',
    paddingTop: 12,
    paddingBottom: 16,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  igPostHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  igPostAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  igPostAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  igPostAuthorName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111111',
  },
  igPostDate: {
    fontSize: 11,
    color: '#8E8E8E',
    marginTop: 1,
  },
  igPostRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  igFollowPillBtn: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  igFollowPillBtnActive: {
    backgroundColor: '#F2F2F2',
  },
  igFollowPillText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0277BD',
  },
  igFollowPillTextActive: {
    color: '#555555',
  },

  feedImage: {
    width: FEED_MEDIA_WIDTH,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  igPostFooter: {
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  igActionIconRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  igQuickIconBtn: {
    padding: 4,
  },
  igReactionBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  igReactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 14,
  },
  igReactionText: {
    fontSize: 11,
    color: '#222222',
  },
  igLikeSummary: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#111111',
    marginBottom: 4,
  },
  igPostCaption: {
    fontSize: 14,
    color: '#222222',
    lineHeight: 20,
  },
  feedCommentTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    paddingVertical: 6,
  },
  feedCommentTriggerText: {
    fontSize: 12,
    color: '#0277BD',
    fontWeight: '600',
  },

  ktContainer: { flex: 1, backgroundColor: '#FFFFFF' },
  ktHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  ktPageTitle: { fontSize: 20, fontWeight: 'bold', color: '#191919' },
  ktDefaultAvatar: { backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
  ktIconBtn: { padding: 6 },

  ktSearchBox: { paddingHorizontal: 14, paddingBottom: 10 },
  ktSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F4F4',
    borderRadius: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  ktSearchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
  },

  ktSelfBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#F7F8FA',
    borderRadius: 12,
    gap: 10,
  },
  ktSelfBadge: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: '#FEE500',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ktSelfTitle: { fontSize: 13, fontWeight: 'bold', color: '#222' },
  ktSelfSub: { fontSize: 12, color: '#777', marginTop: 2 },

  ktSection: { paddingHorizontal: 14, paddingVertical: 6 },
  ktSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  ktSectionTitle: { fontSize: 12, fontWeight: '600', color: '#777777' },
  ktEmptySectionText: { fontSize: 12, color: '#AAA', paddingVertical: 10 },
  ktDivider: { height: 1, backgroundColor: '#F0F0F0', marginHorizontal: 14, marginVertical: 6 },

  ktFriendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    gap: 10,
  },
  ktFriendAvatar: { width: 44, height: 44, borderRadius: 16 },
  ktFriendName: { fontSize: 14, fontWeight: '600', color: '#191919' },
  ktFriendBio: { fontSize: 12, color: '#888888', marginTop: 2 },
  ktFavStarBtn: { padding: 6 },

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
    paddingTop: 12,
    paddingBottom: 14,
    paddingHorizontal: 12,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 4,
  },
  topCircleBtn: {
    backgroundColor: 'rgba(0, 0, 0, 0.36)',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 16,
  },
  topCircleBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: 'bold' },
  topPillBtn: {
    backgroundColor: 'rgba(0, 0, 0, 0.36)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  topPillBtnText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  visitorBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  visitorText: { color: '#FFFFFF', fontSize: 10, fontWeight: '600' },

  profileBottomSection: { alignItems: 'flex-start' },
  circularAvatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    marginBottom: 8,
  },
  defaultAvatar: {
    backgroundColor: '#718096',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileName: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  profileBio: {
    color: '#F5F5F5',
    fontSize: 12,
    marginTop: 3,
    marginBottom: 12,
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
  glassTopBtn: { paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  glassDividerHorizontal: { height: 1, backgroundColor: 'rgba(255, 255, 255, 0.35)' },
  glassBottomRow: { flexDirection: 'row', alignItems: 'center' },
  glassHalfBtn: { flex: 1, flexDirection: 'row', gap: 5, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  glassDividerVertical: { width: 1, height: '100%', backgroundColor: 'rgba(255, 255, 255, 0.35)' },
  glassBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },

  gridItem: { width: GRID_ITEM_SIZE, height: GRID_ITEM_SIZE, margin: 0.6, backgroundColor: '#2D2D2D' },
  gridImage: { width: '100%', height: '100%' },
  gridCaptionOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  gridCaptionText: { color: '#FFF', fontSize: 11 },
  gridTextOnlyBox: {
    flex: 1,
    padding: 8,
    backgroundColor: '#2B2D31',
    justifyContent: 'space-between',
  },
  gridTextOnlyContent: { color: '#F2F3F5', fontSize: 11, lineHeight: 15 },
  gridTextOnlyAuthor: { color: '#949BA4', fontSize: 10 },
  gridHeartBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  gridHeartText: { color: '#FFF', fontSize: 9, fontWeight: 'bold' },

  whitePopupBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    zIndex: 1100,
  },
  whitePopupTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EAEAEA',
  },
  whitePopupTitle: {
    color: '#191919',
    fontSize: 15,
    fontWeight: 'bold',
  },
  popupSmallAvatar: { width: 34, height: 34, borderRadius: 17 },
  defaultSmallAvatar: { backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
  whitePopupMiniBtn: {
    backgroundColor: '#F2F2F2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  whitePopupMiniBtnText: { color: '#333333', fontSize: 11, fontWeight: 'bold' },
  popupCloseIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEE500',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
  },
  popupCloseIconText: {
    color: '#3C1E1E',
    fontSize: 12,
    fontWeight: 'bold',
  },
  whitePopupScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
  },
  imageToolbarRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FAFAFA',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F0F0F0',
  },
  zoomHintText: {
    color: '#777777',
    fontSize: 11,
    marginVertical: 4,
  },
  fullViewChipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFEFEF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  fullViewChipText: {
    color: '#222222',
    fontSize: 11,
    fontWeight: '600',
  },
  whitePopupCaptionBox: {
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 14,
    alignItems: 'center',
  },
  whitePopupCaption: { color: '#222222', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  whitePopupDate: { color: '#888888', fontSize: 12, marginTop: 6 },
  whiteDetailBodyBox: {
    width: '100%',
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  whiteDetailContentText: {
    color: '#222222',
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 14,
  },
  whiteDetailEditInput: {
    backgroundColor: '#FAFAFA',
    color: '#222222',
    borderWidth: 1,
    borderColor: '#CCCCCC',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  whiteDetailReactionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: 12,
  },
  whiteDetailReactionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F6F6F6',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 16,
  },
  whiteDetailReactionText: { color: '#333333', fontSize: 12 },

  commentSectionBox: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#EAEAEA',
  },
  commentSectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#222222',
    marginBottom: 10,
  },
  commentEmptyText: {
    fontSize: 12,
    color: '#888888',
    paddingVertical: 8,
  },
  commentItemRow: {
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  commentAuthorText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#01579B',
  },
  commentContentText: {
    fontSize: 14,
    color: '#222222',
    marginTop: 3,
    lineHeight: 20,
  },
  commentTimeText: {
    fontSize: 10,
    color: '#999999',
    marginTop: 4,
  },
  commentInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    gap: 8,
  },
  commentTextInput: {
    flex: 1,
    backgroundColor: '#F4F4F4',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 80,
  },
  commentSubmitBtn: {
    backgroundColor: '#0288D1',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
  },
  commentSubmitText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },

  emptyBox: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#AAA', textAlign: 'center', lineHeight: 22, fontSize: 13 },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#FAFAFA',
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    gap: 10,
  },
  memberAvatar: { width: 44, height: 44, borderRadius: 16 },
  memberName: { fontSize: 14, fontWeight: 'bold', color: '#222' },
  memberBio: { fontSize: 12, color: '#777', marginTop: 2 },
  meBadge: { backgroundColor: '#3C1E1E', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  meBadgeText: { color: '#FEE500', fontSize: 10, fontWeight: 'bold' },

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
  msgBackBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 4 },
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
  pickerLinkText: { color: '#0288D1', fontWeight: 'bold', fontSize: 14 },
  modalInput: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 12, fontSize: 14, backgroundColor: '#FAFAFA' },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalCancelBtn: { flex: 1, padding: 13, borderRadius: 8, backgroundColor: '#EEE', alignItems: 'center' },
  modalCancelText: { color: '#555', fontWeight: 'bold' },
  modalSaveBtn: { flex: 1, padding: 13, borderRadius: 8, backgroundColor: '#0288D1', alignItems: 'center' },
  modalSaveText: { color: '#FFFFFF', fontWeight: 'bold' },

  writePreviewImg: { width: '100%', height: 220, borderRadius: 8, backgroundColor: '#F5F5F5' },
  removePhotoBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', marginTop: 6, padding: 6, backgroundColor: '#EEE', borderRadius: 4 },
  attachPhotoBtn: { flexDirection: 'row', gap: 6, padding: 14, borderRadius: 8, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DDD' },
});
