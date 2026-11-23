import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  FlatList,
  Image,
  ImageBackground,
  Alert,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  BackHandler,
  ToastAndroid,
  Linking,
  PanResponder,
  Pressable,
  AppState,
  Animated,
  Easing,
} from 'react-native';
import { Text, TextInput, useAppFonts } from './fonts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import GroupChat, { ensureGroupChannel } from './GroupChat';
import GalleryPicker from './GalleryPicker';
import * as MediaLibrary from 'expo-media-library';
import StickerPanel, { getSticker, STICKER_LABEL, StickerBubbleImage } from './StickerPanel';
import * as ImageManipulator from 'expo-image-manipulator';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Ionicons, themedStyles, useTheme, bgc, cycleThemeMode, getMode, modeLabel, hapticTap, hapticSelect } from './theme';
import { BounceView, HeartPop, useDoubleTap } from './anim';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const LEFT_RAIL_WIDTH = 0; // 메뉴바를 화면 아래로 옮겨서 왼쪽 세로 메뉴 폭은 없음
const RIGHT_RAIL_WIDTH = 44;
const SIDE_MARGIN = 15; // 화면 좌우 여백 (각 15)
const RIGHT_MARGIN = SIDE_MARGIN * 2; // 좌우 여백 합계 (사진·글자 폭 계산용)
const LAST_EMAIL_STORAGE_KEY = '@me_last_login_email';
const HOME_VIEW_STORAGE_KEY = '@me_home_view_mode';
const getWindowWidth = () => Dimensions.get('window').width;
const getWindowHeight = () => Dimensions.get('window').height;
const SCREEN_WIDTH = getWindowWidth();
const SCREEN_HEIGHT = getWindowHeight();
const CONTENT_WIDTH = Math.max(240, SCREEN_WIDTH - LEFT_RAIL_WIDTH);
const COVER_HEIGHT = Math.round(CONTENT_WIDTH * (4 / 3));
const GRID_ITEM_SIZE = (CONTENT_WIDTH - RIGHT_MARGIN - 4) / 3;
const FEED_MEDIA_WIDTH = Math.max(200, CONTENT_WIDTH - RIGHT_MARGIN);
const MAX_POST_PHOTOS = 10;
// 홈 멤버 프로필 줄: 한 화면에 딱 5개가 보이도록 크기 계산
const STORY_PER_ROW = 5;
const STORY_GAP = 8;
const STORY_ITEM_W = Math.floor((CONTENT_WIDTH - RIGHT_MARGIN - 4 - STORY_GAP * (STORY_PER_ROW - 1)) / STORY_PER_ROW);
const STORY_AVATAR = STORY_ITEM_W - 8; // 테두리(2+1.5)*2 를 뺀 사진 크기
const STORY_RADIUS = Math.round(STORY_AVATAR * 0.26);
const FEED_MEDIA_MAX_HEIGHT = Math.round(SCREEN_HEIGHT * 0.72)
const EXPANDED_CHAT_HEIGHT = Math.max(200, Math.round(SCREEN_HEIGHT * 0.32));

const VISIBILITY_OPTIONS = [
  { key: 'public', label: '전체공개', icon: 'globe-outline' },
  { key: 'friends', label: '친구공개', icon: 'people-outline' },
  { key: 'private', label: '혼자보기', icon: 'lock-closed-outline' },
];

const getVisibilityLabel = (visibility) => {
  if (visibility === 'friends') return '친구공개';
  if (visibility === 'private') return '혼자보기';
  return '전체공개';
};

// --- 링크 추출 및 미리보기 유틸리티 ---
const URL_REGEX = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/i;
const linkPreviewCache = {};

const extractFirstUrl = (text) => {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(URL_REGEX);
  if (!match?.[1]) return null;
  return match[1].replace(/[.,!?;:)'"]+$/, '');
};

const getDomainFromUrl = (rawUrl) => {
  try {
    const clean = rawUrl.replace(/^https?:\/\//i, '');
    return clean.split('/')[0] || rawUrl;
  } catch {
    return rawUrl;
  }
};

const decodeHtmlEntities = (str) => {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
};

const resolveRelativeUrl = (maybeRelative, baseUrl) => {
  if (!maybeRelative) return null;
  const trimmed = maybeRelative.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) {
    const scheme = /^https:/i.test(baseUrl) ? 'https:' : 'http:';
    return `${scheme}${trimmed}`;
  }
  try {
    const baseMatch = baseUrl.match(/^(https?:\/\/[^/]+)/i);
    if (!baseMatch) return null;
    const origin = baseMatch[1];
    if (trimmed.startsWith('/')) return `${origin}${trimmed}`;
    return `${origin}/${trimmed}`;
  } catch {
    return null;
  }
};

const parseMetaFromHtml = (html, pageUrl) => {
  const getMeta = (attrName, attrValue) => {
    const re1 = new RegExp(
      `<meta[^>]+${attrName}=["']${attrValue}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      'i'
    );
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+${attrName}=["']${attrValue}["'][^>]*>`,
      'i'
    );
    const m = html.match(re1) || html.match(re2);
    return m?.[1] ? decodeHtmlEntities(m[1]) : '';
  };

  const ogTitle = getMeta('property', 'og:title') || getMeta('name', 'twitter:title');
  const ogDesc =
    getMeta('property', 'og:description') ||
    getMeta('name', 'description') ||
    getMeta('name', 'twitter:description');
  const ogImageRaw = getMeta('property', 'og:image') || getMeta('name', 'twitter:image');

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const htmlTitle = titleMatch?.[1] ? decodeHtmlEntities(titleMatch[1].replace(/\s+/g, ' ')) : '';

  return {
    title: ogTitle || htmlTitle || getDomainFromUrl(pageUrl),
    description: ogDesc || '',
    image: resolveRelativeUrl(ogImageRaw, pageUrl),
    domain: getDomainFromUrl(pageUrl),
    url: pageUrl,
  };
};

const fetchLinkPreviewData = async (url) => {
  if (linkPreviewCache[url]) return linkPreviewCache[url];

  const fallback = {
    title: getDomainFromUrl(url),
    description: '',
    image: null,
    domain: getDomainFromUrl(url),
    url,
  };

  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 4500) : null;

    const response = await fetch(url, {
      signal: controller?.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      },
    });

    if (timeoutId) clearTimeout(timeoutId);

    if (!response.ok) {
      linkPreviewCache[url] = fallback;
      return fallback;
    }

    const rawText = await response.text();
    const parsed = parseMetaFromHtml(rawText.slice(0, 120000), url);
    linkPreviewCache[url] = parsed;
    return parsed;
  } catch {
    linkPreviewCache[url] = fallback;
    return fallback;
  }
};

const LinkPreviewCard = ({ url, onPress, onLongPress }) => {
  const [preview, setPreview] = useState(() => linkPreviewCache[url] || {
    title: getDomainFromUrl(url),
    description: '',
    image: null,
    domain: getDomainFromUrl(url),
    url,
  });
  const [loadingPreview, setLoadingPreview] = useState(() => !linkPreviewCache[url]);

  useEffect(() => {
    let active = true;
    if (linkPreviewCache[url]) {
      setPreview(linkPreviewCache[url]);
      setLoadingPreview(false);
      return;
    }
    setLoadingPreview(true);
    fetchLinkPreviewData(url).then((data) => {
      if (active) {
        setPreview(data);
        setLoadingPreview(false);
      }
    });
    return () => {
      active = false;
    };
  }, [url]);

  return (
    <TouchableOpacity
      style={styles.linkPreviewCard}
      activeOpacity={0.85}
      onPress={() => onPress(url)}
      onLongPress={onLongPress}
      delayLongPress={400}
    >
      {preview.image ? (
        <Image
          source={{ uri: preview.image }}
          style={styles.linkPreviewThumb}
          resizeMode="cover"
        />
      ) : null}
      <View style={styles.linkPreviewBody}>
        <View style={styles.linkPreviewDomainRow}>
          <Ionicons name="link-outline" size={12} color="#0288D1" />
          <Text style={styles.linkPreviewDomain} numberOfLines={1}>
            {preview.domain}
          </Text>
          {loadingPreview && <ActivityIndicator size="small" color="#0288D1" style={{ marginLeft: 'auto' }} />}
        </View>
        <Text style={styles.linkPreviewTitle} numberOfLines={2}>
          {preview.title || preview.domain}
        </Text>
        {preview.description ? (
          <Text style={styles.linkPreviewDesc} numberOfLines={2}>
            {preview.description}
          </Text>
        ) : (
          <Text style={styles.linkPreviewTapHint} numberOfLines={1}>
            탭하여 사이트로 이동
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

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
const ZoomableImage = ({ uri, aspectRatio, containerWidth, maxHeight, fillHeight = false, onZoomStateChange }) => {
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
  const computedHeight = fillHeight
    ? (maxHeight || getWindowHeight())
    : Math.min(maxHeight || getWindowHeight() * 0.72, Math.round(width / ratio));

  return (
    <View
      style={{
        width,
        height: computedHeight,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        backgroundColor: fillHeight ? '#000000' : '#FFFFFF',
      }}
      {...panResponder.panHandlers}
    >
      <Image
        source={{ uri }}
        style={{
          width,
          height: computedHeight,
          backgroundColor: fillHeight ? '#000000' : '#FFFFFF',
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

// 여러 장 사진: 옆으로 넘기며 보기 + 아래 점 표시 (첫 사진 비율 기준)
const FeedImageCarousel = ({ uris, width: widthProp, onPressIndex, onDoubleLike }) => {
  const W = widthProp || FEED_MEDIA_WIDTH;
  const [ratio, setRatio] = useState(1);
  const [idx, setIdx] = useState(0);
  const [pops, setPops] = useState(0);
  const handleTap = useDoubleTap(
    (i) => onPressIndex && onPressIndex(i),
    () => { setPops((p) => p + 1); onDoubleLike && onDoubleLike(); }
  );

  useEffect(() => {
    if (!uris || !uris[0]) return;
    Image.getSize(
      uris[0],
      (w, h) => { if (w && h) setRatio(w / h); },
      () => setRatio(1)
    );
  }, [uris && uris[0]]);

  const natural = Math.round(W / (ratio || 1));
  const H = Math.min(Math.round(W * 1.03), Math.max(80, natural));

  const onEnd = (e) => {
    const x = e.nativeEvent.contentOffset.x;
    setIdx(Math.max(0, Math.min(uris.length - 1, Math.round(x / W))));
  };

  // 점 크기: 현재 점은 크게, 멀어질수록 작게
  const dotSize = (i) => {
    const d = Math.abs(i - idx);
    if (d === 0) return 7;
    if (d === 1) return 6;
    if (d === 2) return 5;
    return 4;
  };

  return (
    <View style={{ width: W }}>
      <View style={{ width: W, height: H }}>
      <ScrollView
        horizontal
        pagingEnabled
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onEnd}
        scrollEventThrottle={16}
        style={{ width: W, height: H }}
      >
        {uris.map((u, i) => (
          <TouchableOpacity
            key={u + i}
            activeOpacity={0.94}
            onPress={() => handleTap(i)}
            style={{ width: W, height: H }}
          >
            <Image source={{ uri: u }} style={{ width: W, height: H, backgroundColor: bgc('#FAFAFA') }} resizeMode="cover" />
          </TouchableOpacity>
        ))}
      </ScrollView>
      <HeartPop count={pops} />
      </View>
      <View style={styles.feedDotsRow}>
        {uris.map((u, i) => (
          <View
            key={'d' + i}
            style={[
              styles.feedDot,
              { width: dotSize(i), height: dotSize(i), backgroundColor: i === idx ? '#18181B' : '#CBD5E1' },
            ]}
          />
        ))}
      </View>
    </View>
  );
};

// 피드 화면용: 한 화면 안에 깔끔하게 들어오는 사이즈로 표시
const CompactFeedImage = ({ uri, onPress, onDoubleLike, width: widthProp }) => {
  const FEED_W = (widthProp || FEED_MEDIA_WIDTH);
  const [aspectRatio, setAspectRatio] = useState(1);
  const [pops, setPops] = useState(0);
  const handleTap = useDoubleTap(
    () => onPress && onPress(),
    () => { setPops((p) => p + 1); onDoubleLike && onDoubleLike(); }
  );

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

  // 사진 원래 비율 그대로 보여줌 (얼굴 등이 잘리지 않게). 너무 길거나 넓을 때만 contain
  const naturalHeight = Math.round(FEED_W / (aspectRatio || 1));
  // 폭은 항상 꽉 채우고, 높이는 사진 비율대로 하되 정사각형 정도(폭의 1.03배)까지만 (더 긴 사진은 가운데 기준으로 잘림)
  const targetHeight = Math.min(Math.round(FEED_W * 1.03), Math.max(80, naturalHeight));
  const photoResizeMode = 'cover';

  return (
    <TouchableOpacity activeOpacity={0.94} onPress={() => handleTap()} style={styles.compactImageWrap}>
      <Image
        source={{ uri }}
        style={[styles.compactFeedImage, { width: FEED_W, height: targetHeight }]}
        resizeMode={photoResizeMode}
      />
      <HeartPop count={pops} />
    </TouchableOpacity>
  );
};

// 전체화면 원본 사진 팝업
const FullscreenPhotoPopup = ({
  photoInfo,
  currentUserId,
  onClose,
  onToggleReaction,
  onOpenCommentOrDetail,
  onOpenAuthorChat,
}) => {
  const [aspectRatio, setAspectRatio] = useState(1);
  const [isZoomed, setIsZoomed] = useState(false);
  const winWidth = getWindowWidth();
  const winHeight = getWindowHeight();

  useEffect(() => {
    if (!photoInfo?.uri) return;
    setIsZoomed(false);
    Image.getSize(
      photoInfo.uri,
      (width, height) => {
        if (width && height) {
          setAspectRatio(width / height);
        }
      },
      () => setAspectRatio(1)
    );
  }, [photoInfo?.uri]);

  if (!photoInfo) return null;

  const isLikedByMe = Boolean(photoInfo.isLikedByMe);
  const likeCount = photoInfo.likeCount ?? 0;

  return (
    <View style={styles.fullscreenViewerRoot}>
      <ZoomableImage
        uri={photoInfo.uri}
        aspectRatio={aspectRatio}
        containerWidth={winWidth}
        maxHeight={winHeight}
        fillHeight
        onZoomStateChange={setIsZoomed}
      />

      <TouchableOpacity style={styles.fullscreenBackBtn} onPress={onClose} activeOpacity={0.8}>
        <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      <View style={styles.fullscreenBottomOverlay} pointerEvents="box-none">
        <View style={styles.fullscreenAuthorMeta}>
          <View style={styles.fullscreenAuthorHeader}>
            {photoInfo.avatarUrl ? (
              <Image source={{ uri: photoInfo.avatarUrl }} style={styles.fullscreenAuthorAvatar} />
            ) : (
              <View style={[styles.fullscreenAuthorAvatar, styles.fullscreenDefaultAvatar]}>
                <Ionicons name="person" size={16} color="#FFFFFF" />
              </View>
            )}
            <Text style={styles.fullscreenAuthorName} numberOfLines={1}>
              {photoInfo.authorName || '내 스토리'}
            </Text>
          </View>

          {photoInfo.dateText ? (
            <Text style={styles.fullscreenSubMeta} numberOfLines={1}>
              {photoInfo.dateText}
            </Text>
          ) : null}

          {photoInfo.caption ? (
            <Text style={styles.fullscreenCaptionText} numberOfLines={2}>
              {photoInfo.caption}
            </Text>
          ) : null}
        </View>

        <View style={styles.fullscreenRightActions}>
          {photoInfo.postId && onToggleReaction && (
            <TouchableOpacity
              style={styles.fullscreenActionBtn}
              onPress={() => onToggleReaction(photoInfo.postId, 'like')}
              activeOpacity={0.8}
            >
              <Ionicons
                name={isLikedByMe ? 'heart' : 'heart-outline'}
                size={26}
                color={isLikedByMe ? '#FF4D6D' : '#FFFFFF'}
              />
              <Text style={styles.fullscreenActionCount}>{likeCount}</Text>
            </TouchableOpacity>
          )}

          {photoInfo.authorId && onOpenAuthorChat && (
            <TouchableOpacity
              style={styles.fullscreenActionBtn}
              onPress={() =>
                onOpenAuthorChat({
                  id: photoInfo.authorId,
                  nickname: photoInfo.authorName || (photoInfo.authorId === currentUserId ? '나' : '친구'),
                  avatar_url: photoInfo.avatarUrl || null,
                })
              }
              activeOpacity={0.8}
            >
              <Ionicons name="chatbubble-outline" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          )}

          {photoInfo.postId && onOpenCommentOrDetail && (
            <TouchableOpacity
              style={styles.fullscreenActionBtn}
              onPress={() => onOpenCommentOrDetail(photoInfo.postId)}
              activeOpacity={0.8}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

// 홈 BGM 안내 글자: 오른쪽에서 왼쪽으로 계속 흘러감
const BgmMarquee = ({ text, color, style }) => {
  const [boxW, setBoxW] = useState(0);
  const [textW, setTextW] = useState(0);
  const x = useRef(new Animated.Value(0)).current;

  const tw = textW || String(text || '').length * 11;
  useEffect(() => {
    if (!boxW) return;
    // 오른쪽 끝에서 시작해서 왼쪽으로 흘러감
    x.setValue(boxW);
    const anim = Animated.loop(
      Animated.timing(x, {
        toValue: -tw,
        duration: Math.max(4000, (boxW + tw) * 28),
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [boxW, tw]);

  return (
    <View style={[styles.musicMarqueeBox, style]} onLayout={(e) => setBoxW(e.nativeEvent.layout.width)}>
      <Animated.View style={{ position: 'absolute', left: 0, width: 2000, flexDirection: 'row', transform: [{ translateX: x }] }}>
        <Text
          style={[styles.musicMarqueeText, color ? { color } : null]}
          numberOfLines={1}
          onLayout={(e) => setTextW(e.nativeEvent.layout.width)}
        >
          {text}
        </Text>
      </Animated.View>
    </View>
  );
};

// 홈 위쪽 배경음악 바
const MusicBar = ({ track, playing, muted, onToggle, onNext, onToggleMute, hasNext, label }) => (
  <View style={styles.musicBar}>
    <Ionicons name="musical-notes" size={17} color={playing ? '#3F3F46' : '#A1A1AA'} />
    <View style={{ flex: 1, marginLeft: 10, marginRight: 6 }}>
      <Text style={styles.musicTitle} numberOfLines={1}>{track.title || '제목 없음'}</Text>
      {/* 둘째 줄: 재생 중이면 안내 글자가 가로로 흘러감, 멈추면 누구 노래인지 표시 */}
      {playing ? (
        <BgmMarquee text={`${label || '홈 BGM이 재생되고 있습니다.'}  ·  ${track.ownerLabel || ''}`} color="#71717A" style={{ flex: 0, alignSelf: 'stretch', marginHorizontal: 0, marginTop: 2, height: 20 }} />
      ) : (
        <Text style={styles.musicOwner} numberOfLines={1}>{track.ownerLabel}</Text>
      )}
    </View>
    <TouchableOpacity onPress={onToggleMute} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.musicMuteBtn}>
      <Ionicons name={muted ? 'volume-mute-outline' : 'volume-medium-outline'} size={16} color="#FFFFFF" />
    </TouchableOpacity>
    <TouchableOpacity onPress={onToggle} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.musicBtn}>
      <Ionicons name={playing ? 'pause' : 'play'} size={20} color="#3F3F46" />
    </TouchableOpacity>
    {hasNext ? (
      <TouchableOpacity onPress={onNext} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.musicBtn}>
        <Ionicons name="play-skip-forward" size={18} color="#3F3F46" />
      </TouchableOpacity>
    ) : null}
  </View>
);

// 친구 프로필 배경사진 위 투명 음악 재생기 (홈 재생기와 같은 구성, 검정/회색 톤만 사용)
const ProfileMusicBar = ({ track, playing, muted, onToggle, onToggleMute }) => (
  <View style={styles.pMusicBar}>
    <Ionicons name="musical-notes" size={17} color="#D4D4D8" />
    <View style={{ flex: 1, marginLeft: 10, marginRight: 6 }}>
      <Text style={styles.pMusicTitle} numberOfLines={1}>{track.title || '제목 없음'}</Text>
      {playing ? (
        <BgmMarquee text={`프로필 BGM이 재생되고 있습니다.  ·  ${track.ownerLabel || ''}`} color="#D4D4D8" style={{ flex: 0, alignSelf: 'stretch', marginHorizontal: 0, marginTop: 2, height: 20 }} />
      ) : (
        <Text style={styles.pMusicOwner} numberOfLines={1}>{track.ownerLabel}</Text>
      )}
    </View>
    <TouchableOpacity onPress={onToggleMute} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.pMusicMuteBtn}>
      <Ionicons name={muted ? 'volume-mute-outline' : 'volume-medium-outline'} size={16} color="#E4E4E7" />
    </TouchableOpacity>
    <TouchableOpacity onPress={onToggle} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.musicBtn}>
      <Ionicons name={playing ? 'pause' : 'play'} size={20} color="#E4E4E7" />
    </TouchableOpacity>
  </View>
);

// 글자만 있는 간단한 버튼: 누르는 동안 색이 바뀜
const TextBtn = ({ label, onPress, color = '#374151', pressedColor = '#2563EB' }) => (
  <Pressable onPress={onPress} hitSlop={8} style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
    {({ pressed }) => (
      <Text style={{ fontSize: 14, fontWeight: '700', color: pressed ? pressedColor : color }}>{label}</Text>
    )}
  </Pressable>
);

// 게시물 사진 보기 (검은 배경): 여러 장 넘겨보기 + 반응(따봉) 선택 + 댓글 작성
const PostPhotoViewer = ({
  post,
  startIndex,
  currentUserId,
  defaultNickname,
  comments,
  onClose,
  onToggleReaction,
  onAddComment,
  onOpenMore,
  onOpenAuthorChat,
}) => {
  const winWidth = getWindowWidth();
  const winHeight = getWindowHeight();
  const uris = post.image_urls || [];
  const scrollRef = useRef(null);
  const [idx, setIdx] = useState(Math.min(startIndex || 0, Math.max(0, uris.length - 1)));
  const [reactOpen, setReactOpen] = useState(false);
  const [cmtOpen, setCmtOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [singleRatio, setSingleRatio] = useState(1);
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomIdx, setZoomIdx] = useState(null);
  const [zoomRatio, setZoomRatio] = useState(1);

  const openZoom = (i) => {
    setReactOpen(false);
    Image.getSize(
      uris[i],
      (w, h) => { setZoomRatio(w && h ? w / h : 1); setZoomIdx(i); },
      () => { setZoomRatio(1); setZoomIdx(i); }
    );
  };

  useEffect(() => {
    if (uris.length > 1 && idx > 0) {
      const t = setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTo({ x: idx * winWidth, y: 0, animated: false });
      }, 30);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    if (uris.length === 1) {
      Image.getSize(
        uris[0],
        (w, h) => { if (w && h) setSingleRatio(w / h); },
        () => setSingleRatio(1)
      );
    }
  }, [uris[0]]);

  const myReaction = (post.reactions || []).find((x) => x.user_id === currentUserId);
  const myDef = myReaction ? REACTIONS.find((r) => r.type === myReaction.type) : null;
  const reactionCount = (post.reactions || []).length;
  const authorName = post.profiles?.nickname || defaultNickname || '회원';
  const avatarUrl = post.profiles?.avatar_url || null;
  const dateText = new Date(post.created_at).toLocaleString('ko-KR');
  const tops = (comments || []).filter((c) => !c.parent_id);

  const submit = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    const ok = await onAddComment(post.id, t, null);
    setSending(false);
    if (ok !== false) setText('');
  };

  const onPageEnd = (e) => {
    const x = e.nativeEvent.contentOffset.x;
    setIdx(Math.max(0, Math.min(uris.length - 1, Math.round(x / winWidth))));
  };

  return (
    <View style={styles.fullscreenViewerRoot}>
      {uris.length > 1 ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onPageEnd}
          style={{ width: winWidth, height: winHeight }}
        >
          {uris.map((u, i) => (
            <TouchableOpacity
              key={u + i}
              activeOpacity={1}
              onPress={() => openZoom(i)}
              style={{ width: winWidth, height: winHeight }}
            >
              <Image source={{ uri: u }} style={{ width: winWidth, height: winHeight }} resizeMode="contain" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : uris[0] ? (
        <ZoomableImage
          uri={uris[0]}
          aspectRatio={singleRatio}
          containerWidth={winWidth}
          maxHeight={winHeight}
          fillHeight
          onZoomStateChange={setIsZoomed}
        />
      ) : null}

      <TouchableOpacity style={styles.fullscreenBackBtn} onPress={onClose} activeOpacity={0.8}>
        <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {zoomIdx !== null && (
        <View style={styles.viewerZoomLayer}>
          <ZoomableImage
            uri={uris[zoomIdx]}
            aspectRatio={zoomRatio}
            containerWidth={winWidth}
            maxHeight={winHeight}
            fillHeight
            onZoomStateChange={setIsZoomed}
          />
          <TouchableOpacity style={[styles.fullscreenBackBtn, { zIndex: 1260 }]} onPress={() => setZoomIdx(null)} activeOpacity={0.8}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.viewerZoomHint}>
            <Text style={styles.viewerCounterText}>두 손가락으로 확대 · 두 번 탭 · 드래그</Text>
          </View>
        </View>
      )}

      {uris.length > 1 ? (
        <View style={styles.viewerCounter}>
          <Text style={styles.viewerCounterText}>{idx + 1} / {uris.length}</Text>
        </View>
      ) : null}

      {!cmtOpen && (
        <View style={styles.fullscreenBottomOverlay} pointerEvents="box-none">
          <View style={styles.fullscreenAuthorMeta}>
            {uris.length > 1 ? (
              <View style={styles.viewerDotsRow}>
                {uris.map((u, i) => (
                  <View
                    key={'vd' + i}
                    style={[styles.viewerDot, i === idx && styles.viewerDotOn]}
                  />
                ))}
              </View>
            ) : null}
            <TouchableOpacity
              style={styles.fullscreenAuthorHeader}
              activeOpacity={0.8}
              disabled={!onOpenAuthorChat || post.author_id === currentUserId}
              onPress={() =>
                onOpenAuthorChat({ id: post.author_id, nickname: authorName, avatar_url: avatarUrl })
              }
            >
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.fullscreenAuthorAvatar} />
              ) : (
                <View style={[styles.fullscreenAuthorAvatar, styles.fullscreenDefaultAvatar]}>
                  <Ionicons name="person" size={16} color="#FFFFFF" />
                </View>
              )}
              <Text style={styles.fullscreenAuthorName} numberOfLines={1}>{authorName}</Text>
            </TouchableOpacity>
            <Text style={styles.fullscreenSubMeta} numberOfLines={1}>{dateText}</Text>
            {post.content ? (
              <Text style={styles.fullscreenCaptionText} numberOfLines={2}>{post.content}</Text>
            ) : null}
          </View>

          <View style={styles.fullscreenRightActions}>
            {/* 따봉 버튼: 누르면 반응이 옆으로 펼쳐짐 */}
            <View style={{ alignItems: 'center' }}>
              {reactOpen && (
                <View style={styles.reactPickRow}>
                  {REACTIONS.map((r) => {
                    const on = myReaction && myReaction.type === r.type;
                    return (
                      <TouchableOpacity
                        key={r.type}
                        style={[styles.reactPickItem, on && styles.reactPickItemOn]}
                        activeOpacity={0.8}
                        onPress={() => {
                          onToggleReaction(post.id, r.type);
                          setReactOpen(false);
                        }}
                      >
                        <Ionicons name={r.icon.replace('-outline', '')} size={24} color={r.color} />
                        <Text style={styles.reactPickLabel}>{r.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              <TouchableOpacity
                style={styles.fullscreenActionBtn}
                activeOpacity={0.8}
                onPress={() => { hapticSelect(); setReactOpen((v) => !v); }}
              >
                <BounceView trigger={myReaction ? myReaction.type : 'none'}>
                  <Ionicons
                    name={myDef ? myDef.icon.replace('-outline', '') : 'thumbs-up-outline'}
                    size={27}
                    color={myDef ? myDef.color : '#FFFFFF'}
                  />
                </BounceView>
                <Text style={styles.fullscreenActionCount}>{reactionCount}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.fullscreenActionBtn}
              activeOpacity={0.8}
              onPress={() => { setReactOpen(false); setCmtOpen(true); }}
            >
              <Ionicons name="chatbubble-outline" size={25} color="#FFFFFF" />
              <Text style={styles.fullscreenActionCount}>{tops.length}</Text>
            </TouchableOpacity>

          </View>
        </View>
      )}

      {cmtOpen && (
        <KeyboardAvoidingView
          style={[styles.viewerCmtWrap, { height: Math.round(winHeight * 0.5) }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* 사진 아래쪽 50%에 음영이 생기고, 그 안에 댓글과 입력창이 보임 */}
          <View style={styles.viewerCmtShade}>
            <View style={styles.viewerCmtHeader}>
              <Text style={styles.viewerCmtTitle}>댓글 {tops.length}</Text>
              <TouchableOpacity onPress={() => setCmtOpen(false)} hitSlop={8} style={{ padding: 4 }}>
                <Ionicons name="chevron-down" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
              {tops.length === 0 ? (
                <Text style={styles.viewerCmtEmpty}>첫 댓글을 남겨 보세요.</Text>
              ) : (
                tops.map((c) => (
                  <Text key={String(c.id)} style={styles.viewerCmtItem}>
                    <Text style={{ fontWeight: '700' }}>{c.authorName || '회원'} </Text>
                    {c.content}
                  </Text>
                ))
              )}
            </ScrollView>
            {/* 키보드가 열려 있어도 보내기 버튼을 한 번만 누르면 바로 전송되도록 감싸줌 */}
            <ScrollView
              scrollEnabled={false}
              keyboardShouldPersistTaps="always"
              style={{ flexGrow: 0 }}
              contentContainerStyle={styles.viewerCmtInputRow}
            >
              <TextInput
                style={styles.viewerCmtInput}
                value={text}
                onChangeText={setText}
                placeholder="댓글 달기..."
                placeholderTextColor="#A1A1AA"
                onSubmitEditing={submit}
                returnKeyType="send"
                blurOnSubmit={false}
              />
              <TouchableOpacity
                onPress={submit}
                disabled={!text.trim() || sending}
                activeOpacity={0.7}
                style={[styles.viewerCmtSend, (!text.trim() || sending) && { opacity: 0.45 }]}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#111111" />
                ) : (
                  <Text style={styles.viewerCmtSendText}>보내기</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
};

// 게시물 상세 팝업 (댓글/대댓글 작성·수정·삭제, 등록 후 입력창만 닫힘)
const PostDetailPopup = ({
  post,
  currentUserId,
  defaultNickname,
  comments,
  onAddComment,
  onEditComment,
  onDeleteComment,
  onClose,
  onToggleReaction,
  onSaveEdit,
  onDeletePost,
  onOpenFullImage,
  onReportPost,
  onBlockUser,
}) => {
  const [aspectRatio, setAspectRatio] = useState(1);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [editVisibility, setEditVisibility] = useState('public');

  const [composerOpen, setComposerOpen] = useState(false);
  const [replyTargetComment, setReplyTargetComment] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentText, setEditingCommentText] = useState('');

  const [isZoomed, setIsZoomed] = useState(false);
  const [popIdx, setPopIdx] = useState(0);
  const winWidth = getWindowWidth();
  const winHeight = getWindowHeight();

  useEffect(() => {
    setPopIdx(0);
    setIsEditing(false);
    setEditValue(post?.content || '');
    setEditVisibility(post?.visibility || 'public');
    setComposerOpen(false);
    setReplyTargetComment(null);
    setCommentText('');
    setEditingCommentId(null);
    setEditingCommentText('');
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
  const popUris = post.image_urls || [];
  const popH = Math.min(Math.round(winHeight * 0.56), Math.max(120, Math.round(winWidth / (aspectRatio || 1))));

  const openNewCommentComposer = () => {
    setReplyTargetComment(null);
    setComposerOpen(true);
  };

  const openReplyComposer = (targetComment) => {
    setReplyTargetComment(targetComment);
    setComposerOpen(true);
  };

  const closeComposerOnly = () => {
    setComposerOpen(false);
    setReplyTargetComment(null);
    setCommentText('');
  };

  const handleSubmitComment = async () => {
    const trimmed = commentText.trim();
    if (!trimmed || submittingComment) return;
    setSubmittingComment(true);
    const parentId = replyTargetComment ? replyTargetComment.id : null;
    const ok = await onAddComment(post.id, trimmed, parentId);
    setSubmittingComment(false);
    if (ok) {
      closeComposerOnly();
    }
  };

  const handleSaveCommentEdit = async (commentId) => {
    const trimmed = editingCommentText.trim();
    if (!trimmed) return;
    const ok = await onEditComment(post.id, commentId, trimmed);
    if (ok) {
      setEditingCommentId(null);
      setEditingCommentText('');
    }
  };

  const topLevelComments = comments.filter((c) => !c.parent_id);
  const repliesByParent = {};
  comments.forEach((c) => {
    if (c.parent_id) {
      const pKey = String(c.parent_id);
      if (!repliesByParent[pKey]) repliesByParent[pKey] = [];
      repliesByParent[pKey].push(c);
    }
  });

  const renderCommentRow = (c, isReply = false) => {
    const isMine = c.user_id === currentUserId;
    const isEditingThis = String(editingCommentId) === String(c.id);

    return (
      <View
        key={String(c.id)}
        style={[styles.commentItemRow, isReply && styles.replyItemRow]}
      >
        <View style={styles.commentTopMetaRow}>
          <Text style={styles.commentAuthorText}>
            {isReply ? `↳ ${c.authorName || '회원'}` : (c.authorName || '회원')}
          </Text>
          <Text style={styles.commentTimeText}>
            {new Date(c.created_at).toLocaleString('ko-KR', {
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>

        {isEditingThis ? (
          <View style={{ marginTop: 6 }}>
            <TextInput
              style={styles.commentEditInput}
              value={editingCommentText}
              onChangeText={setEditingCommentText}
              multiline
              autoFocus
            />
            <View style={styles.commentActionLinksRow}>
              <TouchableOpacity
                onPress={() => {
                  setEditingCommentId(null);
                  setEditingCommentText('');
                }}
              >
                <Text style={styles.commentActionLink}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleSaveCommentEdit(c.id)}>
                <Text style={[styles.commentActionLink, { color: '#0288D1', fontWeight: '700' }]}>저장</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.commentContentText}>{c.content}</Text>
            <View style={styles.commentActionLinksRow}>
              {isMine && (
                <>
                  <TouchableOpacity
                    onPress={() => {
                      setEditingCommentId(c.id);
                      setEditingCommentText(c.content || '');
                    }}
                  >
                    <Text style={styles.commentActionLink}>수정</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => onDeleteComment(post.id, c.id)}>
                    <Text style={[styles.commentActionLink, { color: '#DC2626' }]}>삭제</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </>
        )}
      </View>
    );
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.whitePopupTitle} numberOfLines={1}>
                {post.profiles?.nickname || defaultNickname || '내 스토리'}
              </Text>
              <View style={styles.visibilityPill}>
                <Text style={styles.visibilityPillText}>{getVisibilityLabel(post.visibility)}</Text>
              </View>
            </View>
            <Text style={{ color: '#777777', fontSize: 11 }}>
              {new Date(post.created_at).toLocaleString('ko-KR')}
            </Text>
          </View>
        </View>

        {isMyPost && !isEditing && (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TextBtn
              label="수정"
              onPress={() => {
                setEditValue(post.content || '');
                setEditVisibility(post.visibility || 'public');
                setIsEditing(true);
              }}
            />
            <TextBtn label="삭제" pressedColor="#DC2626" onPress={() => onDeletePost(post.id)} />
          </View>
        )}

        {!isMyPost && (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TextBtn label="신고" pressedColor="#DC2626" onPress={() => onReportPost && onReportPost(post)} />
          </View>
        )}

        <TextBtn label="닫기" onPress={onClose} />
      </View>

      <ScrollView
        style={{ width: '100%', flex: 1 }}
        scrollEnabled={!isZoomed}
        contentContainerStyle={{ alignItems: 'center', paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {imgUri && (
          <View style={{ width: '100%', alignItems: 'center', backgroundColor: bgc('#FFFFFF') }}>
            {popUris.length > 1 ? (
              <>
                <ScrollView
                  horizontal
                  pagingEnabled
                  nestedScrollEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={(e) =>
                    setPopIdx(Math.max(0, Math.min(popUris.length - 1, Math.round(e.nativeEvent.contentOffset.x / winWidth))))
                  }
                  style={{ width: winWidth, height: popH }}
                >
                  {popUris.map((u, i) => (
                    <Image
                      key={u + i}
                      source={{ uri: u }}
                      style={{ width: winWidth, height: popH, backgroundColor: bgc('#FAFAFA') }}
                      resizeMode="contain"
                    />
                  ))}
                </ScrollView>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 20 }}>
                  {popUris.map((u, i) => (
                    <View
                      key={'pd' + i}
                      style={{
                        width: i === popIdx ? 7 : 5,
                        height: i === popIdx ? 7 : 5,
                        borderRadius: 4,
                        marginHorizontal: 2.5,
                        backgroundColor: i === popIdx ? '#18181B' : '#CBD5E1',
                      }}
                    />
                  ))}
                </View>
              </>
            ) : (
              <ZoomableImage
                uri={imgUri}
                aspectRatio={aspectRatio}
                containerWidth={winWidth}
                maxHeight={Math.round(winHeight * 0.56)}
                onZoomStateChange={setIsZoomed}
              />
            )}
            <View style={styles.imageToolbarRow}>
              <Text style={styles.zoomHintText}>
                {popUris.length > 1 ? `옆으로 넘기기 · ${popIdx + 1}/${popUris.length}` : '핀치 줌 / 드래그 / 더블 탭 확대'}
              </Text>
              <TouchableOpacity
                style={styles.fullViewChipBtn}
                onPress={() =>
                  onOpenFullImage({
                    uri: popUris[popIdx] || imgUri,
                    index: popIdx,
                    postId: post.id,
                    authorId: post.author_id,
                    authorName: post.profiles?.nickname || defaultNickname || '내 스토리',
                    avatarUrl: post.profiles?.avatar_url || null,
                    dateText: new Date(post.created_at).toLocaleString('ko-KR'),
                    caption: post.content || '',
                    likeCount: post.reactions?.length || 0,
                    isLikedByMe: Boolean(post.reactions?.some((x) => x.user_id === currentUserId)),
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
              <View style={styles.visibilitySelectorRow}>
                {VISIBILITY_OPTIONS.map((opt) => {
                  const active = editVisibility === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[styles.visibilitySelectChip, active && styles.visibilitySelectChipActive]}
                      onPress={() => setEditVisibility(opt.key)}
                    >
                      <Ionicons
                        name={opt.icon}
                        size={13}
                        color={active ? '#FFFFFF' : '#475569'}
                      />
                      <Text style={[styles.visibilitySelectText, active && styles.visibilitySelectTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
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
                    await onSaveEdit(post.id, editValue, editVisibility);
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
            <View style={styles.commentSectionHeader}>
              <Text style={styles.commentSectionTitle}>댓글 {comments.length}</Text>
              {!composerOpen && (
                <TouchableOpacity style={styles.openCommentComposerBtn} onPress={openNewCommentComposer}>
                  <Ionicons name="create-outline" size={14} color="#0288D1" />
                  <Text style={styles.openCommentComposerText}>댓글 작성</Text>
                </TouchableOpacity>
              )}
            </View>

            {topLevelComments.length === 0 ? (
              <Text style={styles.commentEmptyText}>아직 댓글이 없습니다. 첫 댓글을 남겨 보세요!</Text>
            ) : (
              topLevelComments.map((c) => {
                return (
                  <View key={String(c.id)} style={{ marginBottom: 4 }}>
                    {renderCommentRow(c, false)}
                  </View>
                );
              })
            )}
          </View>
        </View>
      </ScrollView>

      {composerOpen && (
        <View style={styles.commentComposerPanel}>
          <View style={styles.composerBannerRow}>
            <Text style={styles.composerBannerText} numberOfLines={1}>
              {replyTargetComment
                ? `@${replyTargetComment.authorName || '회원'} 님에게 대댓글 작성 중`
                : '새 댓글 작성 중'}
            </Text>
            <TouchableOpacity onPress={closeComposerOnly} style={styles.composerCloseBtn}>
              <Ionicons name="close" size={15} color="#52525B" />
              <Text style={styles.composerCloseText}>닫기</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.commentInputBar}>
            <TextInput
              style={styles.commentTextInput}
              placeholder={replyTargetComment ? '대댓글을 입력하세요...' : '댓글을 입력하세요...'}
              value={commentText}
              onChangeText={setCommentText}
              multiline
              autoFocus
            />
            <TouchableOpacity
              style={[styles.commentSubmitBtn, (!commentText.trim() || submittingComment) && { opacity: 0.5 }]}
              onPress={handleSubmitComment}
              disabled={!commentText.trim() || submittingComment}
            >
              <Text style={styles.commentSubmitText}>등록</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
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
  const fontsReady = useAppFonts();
  useTheme();

  // ---- 배경음악 ----
  const soundRef = useRef(null);
  const bgmPlayingRef = useRef(false);
  const bgmListRef = useRef([]);
  const [bgmTrack, setBgmTrack] = useState(null);
  const [bgmPlaying, setBgmPlayingState] = useState(false);
  const [tempBgmUri, setTempBgmUri] = useState(null);
  const [tempBgmName, setTempBgmName] = useState('');
  const [tempBgmTitle, setTempBgmTitle] = useState('');
  const [tempBgmMime, setTempBgmMime] = useState('audio/mpeg');
  const [bgmChanged, setBgmChanged] = useState(false);
  // 처음 접속하면 음소거 상태로 자동재생 (스피커 버튼을 누르면 소리가 나옴)
  const [bgmMuted, setBgmMutedState] = useState(true);
  const bgmMutedRef = useRef(true);
  const bgmToggleMute = async () => {
    const next = !bgmMutedRef.current;
    bgmMutedRef.current = next;
    setBgmMutedState(next);
    if (soundRef.current) {
      try { await soundRef.current.setIsMutedAsync(next); } catch (e) { /* 무시 */ }
    }
  };

  const setBgmPlaying = (v) => {
    bgmPlayingRef.current = v;
    setBgmPlayingState(v);
  };

  const bgmUnload = async () => {
    const snd = soundRef.current;
    soundRef.current = null;
    if (snd) {
      try { snd.setOnPlaybackStatusUpdate(null); await snd.unloadAsync(); } catch (e) { /* 무시 */ }
    }
  };

  const bgmNext = async (current) => {
    const list = bgmListRef.current || [];
    if (!list.length) return;
    const i = list.findIndex((m) => m.bgm_url === (current && current.url));
    const nextM = list[(i + 1) % list.length];
    if (nextM) await bgmPlay(bgmToTrack(nextM));
  };

  const bgmPlay = async (track) => {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
      await bgmUnload();
      setBgmTrack(track);
      const { sound } = await Audio.Sound.createAsync({ uri: track.url }, { shouldPlay: true, isMuted: bgmMutedRef.current });
      soundRef.current = sound;
      setBgmPlaying(true);
      sound.setOnPlaybackStatusUpdate((st) => {
        if (st && st.didJustFinish) bgmNext(track);
      });
    } catch (e) {
      setBgmPlaying(false);
      showAlert('음악 재생 오류', `음악을 재생하지 못했습니다.\n(${e?.message || e})`);
    }
  };

  const bgmToggle = async (fallbackTrack) => {
    const snd = soundRef.current;
    if (!snd) {
      const t = bgmTrack || fallbackTrack;
      if (t) await bgmPlay(t);
      return;
    }
    try {
      const st = await snd.getStatusAsync();
      if (st && st.isLoaded && st.isPlaying) {
        await snd.pauseAsync();
        setBgmPlaying(false);
      } else {
        await snd.playAsync();
        setBgmPlaying(true);
      }
    } catch (e) {
      setBgmPlaying(false);
    }
  };

  const bgmToTrack = (m) => ({
    url: m.bgm_url,
    title: m.bgm_title,
    ownerId: m.id,
    ownerLabel: m.id === session?.user?.id ? '내 노래' : `${m.nickname || '회원'}님의 노래`,
  });

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active' && soundRef.current && bgmPlayingRef.current) {
        soundRef.current.pauseAsync().catch(() => {});
        setBgmPlaying(false);
      }
    });
    return () => {
      sub.remove();
      bgmUnload();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      bgmUnload();
      setBgmPlaying(false);
      setBgmTrack(null);
    }
  }, [session]);
  const [showGroupChat, setShowGroupChat] = useState(false);
  const [session, setSession] = useState(null);
  const [isSignUpScreen, setIsSignUpScreen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  const [mainTab, setMainTab] = useState('home');
  const [brandMenuOpen, setBrandMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);

  // 접속시 음악 자동재생 켬/끔 (기본: 켬 — 처음 홈화면에 들어오면 바로 재생)
  const BGM_AUTOSTART_KEY = 'bgm_autostart_v1';
  const [bgmAutoStart, setBgmAutoStart] = useState(true);
  const [bgmAutoLoaded, setBgmAutoLoaded] = useState(false);
  const bgmAutoDoneRef = useRef(false);
  useEffect(() => {
    AsyncStorage.getItem(BGM_AUTOSTART_KEY)
      .then((v) => setBgmAutoStart(v !== '0'))
      .catch(() => {})
      .then(() => setBgmAutoLoaded(true));
  }, []);
  const toggleBgmAutoStart = () => {
    const next = !bgmAutoStart;
    setBgmAutoStart(next);
    AsyncStorage.setItem(BGM_AUTOSTART_KEY, next ? '1' : '0').catch(() => {});
  };
  const [incomingListExpanded, setIncomingListExpanded] = useState(true);
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

  useEffect(() => {
    if (!bgmAutoLoaded || !bgmAutoStart || bgmAutoDoneRef.current) return;
    if (!session || !session.user) return;
    if (mainTab !== 'home') return;
    const list = bgmListRef.current || [];
    if (list.length === 0) return;
    bgmAutoDoneRef.current = true;
    bgmPlay(bgmToTrack(list[0]));
  }, [bgmAutoLoaded, bgmAutoStart, session && session.user && session.user.id, members, mainTab]);
  const [friendRelationMap, setFriendRelationMap] = useState({});
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [friendsSectionOpen, setFriendsSectionOpen] = useState(true);
  const [selectedFriend, setSelectedFriend] = useState(null);

  // 친구 프로필을 열면 그 친구의 노래가 자동으로 재생되고, 프로필을 닫거나 게시물을 봐도 계속 유지됨
  // (다른 친구 프로필을 열면 그 친구 노래로 바뀌고, 위쪽 음악 바에서 멈출 수 있음)
  useEffect(() => {
    const f = selectedFriend;
    if (!f || !f.bgm_url) return;
    if (bgmTrack && bgmTrack.url === f.bgm_url && bgmPlayingRef.current) return;
    bgmPlay(bgmToTrack(f));
  }, [selectedFriend && selectedFriend.id]);

  const [posts, setPosts] = useState([]);
  const [writeModalVisible, setWriteModalVisible] = useState(false);
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [imageUri, setImageUri] = useState(null);
  const [postImages, setPostImages] = useState([]); // 새 게시물 사진 (최대 10장)
  const [postPhotoBusy, setPostPhotoBusy] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');

  // AI 문구 추천: 첫 번째 사진을 작게 줄여서 Edge Function(suggest-caption)에 보내고 문구 3개를 받음
  const suggestCaptionWithAI = async () => {
    if (aiBusy || postImages.length === 0) return;
    setAiBusy(true);
    setAiError('');
    setAiSuggestions([]);
    try {
      const small = await ImageManipulator.manipulateAsync(
        postImages[0],
        [{ resize: { width: 640 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      const { data, error } = await supabase.functions.invoke('suggest-caption', {
        body: { image: small.base64, hint: content.trim() },
      });
      if (error) throw error;
      const list = data && Array.isArray(data.suggestions) ? data.suggestions : [];
      if (list.length === 0) throw new Error('empty');
      setAiSuggestions(list.slice(0, 3));
    } catch (e) {
      setAiError('추천을 불러오지 못했어요. 잠시 후 다시 눌러 주세요.');
    } finally {
      setAiBusy(false);
    }
  };
  const [loading, setLoading] = useState(false);

  const [commentsByPostRaw, setCommentsByPost] = useState({});
  const [blockedIds, setBlockedIds] = useState([]);
  const [blockListOpen, setBlockListOpen] = useState(false);
  // 차단한 사람의 댓글은 보이지 않게 걸러냄
  const commentsByPost = blockedIds.length
    ? Object.fromEntries(
        Object.entries(commentsByPostRaw).map(([k, v]) => [
          k,
          (v || []).filter((c) => !blockedIds.includes(c.user_id)),
        ])
      )
    : commentsByPostRaw;

  const [selectedPostId, setSelectedPostId] = useState(null);
  const [viewingImage, setViewingImage] = useState(null);

  const [unreadCountBySender, setUnreadCountBySender] = useState({});
  const [incomingMsgBanner, setIncomingMsgBanner] = useState(null);
  const bannerTimerRef = useRef(null);

  const [chatPartner, setChatPartner] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [chatAttachMenuOpen, setChatAttachMenuOpen] = useState(false);
  const [chatStickerOpen, setChatStickerOpen] = useState(false);
  const [chatGalleryOpen, setChatGalleryOpen] = useState(false);
  const [postGalleryOpen, setPostGalleryOpen] = useState(false);
  const [homeListWidth, setHomeListWidth] = useState(0);
  const inlineChatScrollRef = useRef(null);

  const lastBackPressRef = useRef(0);

  const [homeGrid, setHomeGrid] = useState(false);
  const [memberFilterFriends, setMemberFilterFriends] = useState(false); // 홈 멤버 줄: true=친구만, false=모두
  const [memberPostsUser, setMemberPostsUser] = useState(null); // 프로필에서 '게시물'을 누른 멤버
  const [memberPostsGrid, setMemberPostsGrid] = useState(true); // 격자 보기 / 크게 보기
  const [commentPanelPostId, setCommentPanelPostId] = useState(null);
  const [panelCommentText, setPanelCommentText] = useState('');
  const [panelReplyTarget, setPanelReplyTarget] = useState(null);
  const [commentSheetPost, setCommentSheetPost] = useState(null); // 아래에서 올라오는 댓글 팝업의 게시물
  const [sheetSending, setSheetSending] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(HOME_VIEW_STORAGE_KEY)
      .then((v) => { if (v === 'grid') setHomeGrid(true); })
      .catch(() => {});
  }, []);
  const changeHomeView = (grid) => {
    setHomeGrid(grid);
    AsyncStorage.setItem(HOME_VIEW_STORAGE_KEY, grid ? 'grid' : 'feed').catch(() => {});
  };

  useEffect(() => {
    AsyncStorage.getItem(LAST_EMAIL_STORAGE_KEY).then((savedEmail) => {
      if (savedEmail) {
        setEmail((prev) => prev || savedEmail);
      }
    });
  }, []);

  // 폰 상단 푸시 알림 탭 시 해당 보낸 사람 대화방으로 이동
  useEffect(() => {
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const senderId = response?.notification?.request?.content?.data?.senderId;
      if (!senderId || !session?.user?.id || senderId === session.user.id) return;
      const targetMember = members.find((m) => m.id === senderId) || {
        id: senderId,
        nickname: response?.notification?.request?.content?.title || '친구',
        avatar_url: null,
      };
      openInlineChatInMessagesTab(targetMember);
    });

    return () => {
      responseSub?.remove();
    };
  }, [session?.user?.id, members]);

  useEffect(() => {
    return () => {
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    };
  }, []);

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

      if (memberPostsUser) {
        setSelectedFriend(memberPostsUser);
        setMemberPostsUser(null);
        return true;
      }

      if (blockListOpen) {
        setBlockListOpen(false);
        return true;
      }

      if (accountMenuOpen) {
        setAccountMenuOpen(false);
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
    accountMenuOpen,
    blockListOpen,
    brandMenuOpen,
    editProfileModal,
    writeModalVisible,
    selectedFriend,
    memberPostsUser,
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
      registerPushTokenForUser(session.user.id);
      ensureGroupChannel();
      fetchFriendsAndRequests();
      fetchUnreadCountsBySender(session.user.id);
      AsyncStorage.getItem(`posts_cache_v1_${session.user.id}`)
        .then((raw) => {
          if (!raw) return;
          try {
            const cached = JSON.parse(raw);
            if (Array.isArray(cached)) setPosts((prev) => (prev.length ? prev : cached));
          } catch (e) { /* 무시 */ }
        })
        .catch(() => {});
      fetchBlocks();
      fetchPosts();
      fetchAllComments();
    }
  }, [session]);

  useEffect(() => {
    if (!supabase || !session) return;
    const reqChannel = supabase
      .channel(`realtime_friend_requests_${session.user.id}_${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests' },
        () => {
          fetchFriendsAndRequests();
        }
      )
      .subscribe();

    const unreadChannel = supabase
      .channel(`realtime_unread_badge_${session.user.id}_${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        (payload) => {
          fetchUnreadCountsBySender(session.user.id);
          if (payload.eventType === 'INSERT' && payload.new?.receiver_id === session.user.id) {
            triggerIncomingMessageBanner(payload.new);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(reqChannel);
      supabase.removeChannel(unreadChannel);
    };
  }, [session, members, chatPartner?.id, mainTab]);

  useEffect(() => {
    if (selectedPostId && supabase && session) {
      fetchCommentsForPost(selectedPostId);
    }
  }, [selectedPostId]);

  useEffect(() => {
    if (!viewingImage?.postId) return;
    const targetPost = posts.find((p) => p.id === viewingImage.postId);
    if (!targetPost) return;
    setViewingImage((prev) =>
      prev
        ? {
            ...prev,
            likeCount: targetPost.reactions?.length || 0,
            isLikedByMe: Boolean(targetPost.reactions?.some((x) => x.user_id === session?.user?.id)),
          }
        : null
    );
  }, [posts, viewingImage?.postId, session?.user?.id]);

  useEffect(() => {
    if (!supabase || !session || !chatPartner) {
      setChatMessages([]);
      setChatAttachMenuOpen(false);
      return;
    }

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
                await markMessagesAsRead(partnerId);
              } else if (newMsg.receiver_id === myId && !newMsg.is_read) {
                await fetchUnreadCountsBySender(myId);
              }

              setChatMessages((prev) => {
                if (prev.some((m) => m.id === newMsg.id)) return prev;
                return [...prev, newMsg];
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedMsg = payload.new;
            if (updatedMsg.receiver_id === myId) {
              await fetchUnreadCountsBySender(myId);
            }
            setChatMessages((prev) =>
              prev.map((m) => (m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m))
            );
          } else if (payload.eventType === 'DELETE') {
            const deletedId = payload.old?.id;
            if (deletedId) {
              setChatMessages((prev) => prev.filter((m) => m.id !== deletedId));
            }
            await fetchUnreadCountsBySender(myId);
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
  }, [chatPartner?.id, session]);

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

  // 푸시 토큰 발급 및 profiles.push_token 저장
  const registerPushTokenForUser = async (userId) => {
    if (!userId) return;
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('messages', {
          name: '새 메시지 알림',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          sound: 'default',
        });
                await Notifications.setNotificationChannelAsync('messages_custom', {
                            name: '새 메시지 알림 (전용음)',
                                      importance: Notifications.AndroidImportance.MAX,
                                                vibrationPattern: [0, 250, 250, 250],
                                                          sound: 'mimi_clear.wav',
                                                                  });
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') return;

      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ||
        Constants?.easConfig?.projectId ||
        undefined;

      const tokenResult = projectId
        ? await Notifications.getExpoPushTokenAsync({ projectId })
        : await Notifications.getExpoPushTokenAsync();

      const expoToken = tokenResult?.data;

      if (expoToken) {
        const { error: updateErr } = await supabase
          .from('profiles')
          .update({ push_token: expoToken })
          .eq('id', userId);
        if (updateErr) {
          showAlert('토큰 DB 저장 실패', updateErr.message);
        }
      }
    } catch (e) {
      showAlert('푸시 토큰 등록 실패', e?.message || String(e));
    }
  };

  // 앱 사용 중 새 메시지 알림 배너 표시
  const triggerIncomingMessageBanner = (msgRow) => {
    if (!msgRow || msgRow.sender_id === session?.user?.id) return;
    if (chatPartner?.id === msgRow.sender_id && mainTab === 'chats') return;

    const senderProfile = members.find((m) => m.id === msgRow.sender_id);
    const previewText = msgRow.image_url
      ? '사진을 보냈습니다.'
      : msgRow.file_url
        ? `파일을 보냈습니다: ${msgRow.file_name || '첨부파일'}`
        : (msgRow.content || '새 메시지를 보냈습니다.');

    setIncomingMsgBanner({
      senderId: msgRow.sender_id,
      senderName: senderProfile?.nickname || '친구',
      avatarUrl: senderProfile?.avatar_url || null,
      text: previewText,
    });

    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = setTimeout(() => {
      setIncomingMsgBanner(null);
    }, 4000);
  };

  const handleOpenExternalLink = async (rawUrl) => {
    if (!rawUrl) return;
    try {
      const supported = await Linking.canOpenURL(rawUrl);
      if (supported) {
        await Linking.openURL(rawUrl);
      } else {
        await Linking.openURL(rawUrl);
      }
    } catch {
      showAlert('링크 열기 오류', `해당 링크를 열 수 없습니다.\n${rawUrl}`);
    }
  };

  const handleLeaveChat = (partner) => {
    if (!partner || !partner.id || !session || !session.user) return;
    const me = session.user.id;
    const other = partner.id;
    const doLeave = async () => {
      const { error } = await supabase
        .from('messages')
        .delete()
        .or('and(sender_id.eq.' + me + ',receiver_id.eq.' + other + '),and(sender_id.eq.' + other + ',receiver_id.eq.' + me + ')');
      if (error) {
        showAlert('나가기 실패', getKoreanErrorMessage(error));
        return;
      }
      setChatMessages([]);
      setChatPartner(null);
      fetchUnreadCountsBySender(me);
    };
    Alert.alert('대화 나가기', '대화가 완전히 종료되고 모든 내용이 삭제됩니다. 상대방 화면에서도 사라지며 복구할 수 없습니다.', [
      { text: '취소', style: 'cancel' },
      { text: '나가기', style: 'destructive', onPress: doLeave },
    ]);
  };

  const handleDeleteSentMessage = (msgItem) => {
    if (!msgItem || msgItem.sender_id !== session?.user?.id) return;

    Alert.alert('메시지 삭제', '보낸 메시지를 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          const targetId = msgItem.id;
          setChatMessages((prev) => prev.filter((m) => m.id !== targetId));

          const { error } = await supabase
            .from('messages')
            .delete()
            .eq('id', targetId)
            .eq('sender_id', session.user.id);

          if (error) {
            showAlert('삭제 실패', getKoreanErrorMessage(error));
            if (chatPartner?.id) {
              await fetchChatMessages(chatPartner.id);
            }
          }
        },
      },
    ]);
  };

  const fetchUnreadCountsBySender = async (myId) => {
    if (!myId) return;
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('sender_id')
        .eq('receiver_id', myId)
        .eq('is_read', false);

      if (!error && Array.isArray(data)) {
        const counts = {};
        data.forEach((row) => {
          if (!row?.sender_id || row.sender_id === myId) return;
          counts[row.sender_id] = (counts[row.sender_id] || 0) + 1;
        });
        setUnreadCountBySender(counts);
      }
    } catch {
      // 무시
    }
  };

  const acceptedFriendIds = Object.entries(friendRelationMap)
    .filter(([, rel]) => rel?.status === 'accepted')
    .map(([otherId]) => otherId);

  const isPostVisibleToMe = (post) => {
    const uid = session?.user?.id;
    if (!uid) return false;
    if (post.author_id === uid) return true;
    const vis = post.visibility || 'public';
    if (vis === 'public') return true;
    if (vis === 'friends') return acceptedFriendIds.includes(post.author_id);
    if (vis === 'private') return false;
    return true;
  };
  const openNotificationSoundSettings = async () => {
        if (Platform.OS !== 'android') {
              Linking.openSettings();
                    return;
                        }
                            try {
                                  await Linking.sendIntent('android.settings.CHANNEL_NOTIFICATION_SETTINGS', [
                                          { key: 'android.provider.extra.APP_PACKAGE', value: 'com.anoldking.mystoryapp' },
                                                  { key: 'android.provider.extra.CHANNEL_ID', value: 'messages_custom' },
                                                        ]);
                                                            } catch (e) {
                                                                  Linking.openSettings();
                                                                      }
                                                                        };
  const handleLogout = async () => {
    setAccountMenuOpen(false);
    setLoading(true);
    await supabase.auth.signOut();
    setLoading(false);
  };

  const handleWithdrawAccount = () => {
    setAccountMenuOpen(false);
    Alert.alert(
      '회원 탈퇴',
      '정말 탈퇴하시겠습니까?\n계정과 모든 데이터가 서버에서 영구 삭제됩니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '탈퇴하기',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const { error: rpcError } = await supabase.rpc('delete_own_account');
              if (rpcError) {
                throw rpcError;
              }
              await supabase.auth.signOut();
              setLoading(false);
              showAlert('탈퇴 완료', '계정이 서버에서 완전히 삭제되었습니다.');
            } catch (e) {
              setLoading(false);
              showAlert('탈퇴 처리 오류', `계정 삭제 중 문제가 발생했습니다.\n(${e?.message || e})`);
            }
          },
        },
      ]
    );
  };

  const toggleInlineChat = (member) => {
    setChatPartner((prev) => (prev?.id === member.id ? null : member));
  };

  const openInlineChatInMessagesTab = (member) => {
    setChatPartner(member);
    setMainTab('chats');
  };

  const resolveAuthorName = (userId) => {
    if (userId === session?.user?.id) {
      return profile.nickname || '나';
    }
    const found = members.find((m) => m.id === userId);
    return found?.nickname || '회원';
  };

  const mapCommentRow = (row) => ({
    ...row,
    parent_id: row.parent_id || null,
    authorName: resolveAuthorName(row.user_id),
  });

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
          grouped[key].push(mapCommentRow(row));
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
        const key = String(postId);
        const dbRows = data.map(mapCommentRow);
        setCommentsByPost((prev) => {
          const existing = prev[key] || [];
          const dbIds = new Set(dbRows.map((r) => String(r.id)));
          const merged = [
            ...dbRows,
            ...existing.filter((item) => !dbIds.has(String(item.id))),
          ];
          return {
            ...prev,
            [key]: merged,
          };
        });
      }
    } catch {
      // 무시
    }
  };

  const handleAddComment = async (postId, text, parentId = null) => {
    const myName = profile.nickname || (session.user.email ? session.user.email.split('@')[0] : '나');
    const key = String(postId);
    const localComment = {
      id: `local_${Date.now()}`,
      post_id: postId,
      user_id: session.user.id,
      parent_id: parentId || null,
      authorName: myName,
      content: text,
      created_at: new Date().toISOString(),
    };

    try {
      const insertPayload = {
        post_id: postId,
        user_id: session.user.id,
        content: text,
      };
      if (parentId) insertPayload.parent_id = String(parentId);

      const { data, error } = await supabase
        .from('comments')
        .insert(insertPayload)
        .select()
        .single();

      if (error) {
        setCommentsByPost((prev) => ({
          ...prev,
          [key]: [...(prev[key] || []), localComment],
        }));
        return true;
      }

      const savedRow = {
        ...data,
        parent_id: data.parent_id || (parentId ? String(parentId) : null),
        authorName: myName,
      };
      setCommentsByPost((prev) => {
        const current = prev[key] || [];
        if (current.some((item) => String(item.id) === String(savedRow.id))) return prev;
        return {
          ...prev,
          [key]: [...current, savedRow],
        };
      });
      return true;
    } catch {
      setCommentsByPost((prev) => ({
        ...prev,
        [key]: [...(prev[key] || []), localComment],
      }));
      return true;
    }
  };

  const handleEditComment = async (postId, commentId, newContent) => {
    const key = String(postId);
    setCommentsByPost((prev) => ({
      ...prev,
      [key]: (prev[key] || []).map((c) =>
        String(c.id) === String(commentId) ? { ...c, content: newContent } : c
      ),
    }));

    if (!String(commentId).startsWith('local_')) {
      const { error } = await supabase
        .from('comments')
        .update({ content: newContent })
        .eq('id', commentId);

      if (error) {
        showAlert('댓글 수정 실패', getKoreanErrorMessage(error));
        return false;
      }
    }
    return true;
  };

  const handleDeleteComment = (postId, commentId) => {
    Alert.alert('댓글 삭제', '이 댓글을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          const key = String(postId);
          setCommentsByPost((prev) => ({
            ...prev,
            [key]: (prev[key] || []).filter(
              (c) => String(c.id) !== String(commentId) && String(c.parent_id) !== String(commentId)
            ),
          }));

          if (!String(commentId).startsWith('local_')) {
            await supabase.from('comments').delete().eq('parent_id', String(commentId));
            const { error } = await supabase.from('comments').delete().eq('id', commentId);
            if (error) {
              showAlert('댓글 삭제 실패', getKoreanErrorMessage(error));
            }
          }
        },
      },
    ]);
  };

  const fetchFriendsAndRequests = async () => {
    const myId = session.user.id;
    let { data: memberData, error: memberErr } = await supabase
      .from('profiles')
      .select('id, nickname, bio, avatar_url, cover_url, bgm_url, bgm_title')
      .order('nickname', { ascending: true });
    if (memberErr) {
      const retry = await supabase
        .from('profiles')
        .select('id, nickname, bio, avatar_url, cover_url')
        .order('nickname', { ascending: true });
      memberData = retry.data;
    }

    const list = memberData || [];
    setMembers(list);

    const { data: reqData, error: reqError } = await supabase
      .from('friend_requests')
      .select('*')
      .or(`requester_id.eq.${myId},addressee_id.eq.${myId}`)
      .order('created_at', { ascending: false });

    if (reqError || !Array.isArray(reqData)) {
      setFriendRelationMap({});
      setIncomingRequests([]);
      return;
    }

    const relMap = {};
    const pendingToMe = [];

    for (const row of reqData) {
      if (row.requester_id === myId) {
        relMap[row.addressee_id] = row;
      } else if (row.addressee_id === myId) {
        relMap[row.requester_id] = row;
        if (row.status === 'pending') {
          const requesterProfile = list.find((m) => m.id === row.requester_id);
          pendingToMe.push({
            ...row,
            requesterProfile: requesterProfile || {
              id: row.requester_id,
              nickname: '회원',
              bio: '',
              avatar_url: null,
            },
          });
        }
      }
    }

    setFriendRelationMap(relMap);
    setIncomingRequests(pendingToMe);
  };

  const sendFriendRequest = async (targetUserId) => {
    const myId = session.user.id;
    if (!targetUserId || targetUserId === myId) return;

    const existing = friendRelationMap[targetUserId];
    if (existing?.status === 'pending' && existing.addressee_id === myId) {
      await acceptFriendRequest(existing.id, targetUserId);
      return;
    }

    const optimisticRow = {
      id: existing?.id || `temp_${Date.now()}`,
      requester_id: myId,
      addressee_id: targetUserId,
      status: 'pending',
    };
    setFriendRelationMap((prev) => ({ ...prev, [targetUserId]: optimisticRow }));

    const { data, error } = await supabase
      .from('friend_requests')
      .upsert(
        {
          requester_id: myId,
          addressee_id: targetUserId,
          status: 'pending',
        },
        { onConflict: 'requester_id,addressee_id' }
      )
      .select()
      .single();

    if (error) {
      showAlert('친구 신청 실패', getKoreanErrorMessage(error));
      fetchFriendsAndRequests();
      return;
    }

    if (data) {
      setFriendRelationMap((prev) => ({ ...prev, [targetUserId]: data }));
    }
    showAlert('친구 신청 완료', '상대방이 수락하면 친구가 되어 서로의 친구공개 글이 공유됩니다.');
  };

  const cancelOrRemoveFriend = async (targetUserId) => {
    const existing = friendRelationMap[targetUserId];
    if (!existing) return;

    Alert.alert(
      existing.status === 'accepted' ? '친구 해제' : '친구 신청 취소',
      existing.status === 'accepted'
        ? '친구 관계를 해제하시겠습니까? 친구공개 글 공유가 중단됩니다.'
        : '보낸 친구 신청을 취소하시겠습니까?',
      [
        { text: '닫기', style: 'cancel' },
        {
          text: '확인',
          style: 'destructive',
          onPress: async () => {
            setFriendRelationMap((prev) => {
              const next = { ...prev };
              delete next[targetUserId];
              return next;
            });

            if (existing.id && !String(existing.id).startsWith('temp_')) {
              await supabase.from('friend_requests').delete().eq('id', existing.id);
            } else {
              await supabase
                .from('friend_requests')
                .delete()
                .eq('requester_id', existing.requester_id)
                .eq('addressee_id', existing.addressee_id);
            }
            fetchFriendsAndRequests();
          },
        },
      ]
    );
  };

  const acceptFriendRequest = async (requestId, requesterId) => {
    setIncomingRequests((prev) => prev.filter((r) => r.id !== requestId));
    setFriendRelationMap((prev) => ({
      ...prev,
      [requesterId]: {
        ...(prev[requesterId] || {}),
        id: requestId,
        requester_id: requesterId,
        addressee_id: session.user.id,
        status: 'accepted',
      },
    }));

    const { error } = await supabase
      .from('friend_requests')
      .update({ status: 'accepted' })
      .eq('id', requestId);

    if (error) {
      showAlert('수락 실패', getKoreanErrorMessage(error));
    } else {
      showAlert('친구 수락 완료', '친구가 되었습니다! 이제 서로의 친구공개 게시글이 함께 보입니다.');
    }
    fetchFriendsAndRequests();
  };

  const rejectFriendRequest = async (requestId, requesterId) => {
    setIncomingRequests((prev) => prev.filter((r) => r.id !== requestId));
    setFriendRelationMap((prev) => {
      const next = { ...prev };
      delete next[requesterId];
      return next;
    });

    const { error } = await supabase
      .from('friend_requests')
      .delete()
      .eq('id', requestId);

    if (error) {
      showAlert('거절 실패', getKoreanErrorMessage(error));
    }
    fetchFriendsAndRequests();
  };

  const renderFriendStatusActionButton = (targetUserId, compact = false, dark = false) => {
    const dk = dark ? { backgroundColor: '#2A2A2A' } : null;
    const dkText = dark ? { color: '#FFFFFF' } : null;
    const myId = session.user.id;
    if (!targetUserId || targetUserId === myId) return null;

    const rel = friendRelationMap[targetUserId];
    if (!rel) {
      return (
        <TouchableOpacity
          style={[styles.friendActionChip, compact && styles.friendActionChipCompact, dk]}
          onPress={() => sendFriendRequest(targetUserId)}
        >
          <Text style={[styles.friendActionChipText, dkText]}>친구신청</Text>
        </TouchableOpacity>
      );
    }

    if (rel.status === 'accepted') {
      return (
        <TouchableOpacity
          style={[styles.friendActionChip, styles.friendActionChipAccepted, compact && styles.friendActionChipCompact, dk]}
          onPress={() => cancelOrRemoveFriend(targetUserId)}
        >
          <Text style={[styles.friendActionChipAcceptedText, dkText]}>친구됨</Text>
        </TouchableOpacity>
      );
    }

    if (rel.addressee_id === myId) {
      return (
        <TouchableOpacity
          style={[styles.friendActionChip, styles.friendActionChipIncoming, compact && styles.friendActionChipCompact, dk]}
          onPress={() => acceptFriendRequest(rel.id, targetUserId)}
        >
          <Text style={[styles.friendActionChipIncomingText, dkText]}>신청수락</Text>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        style={[styles.friendActionChip, styles.friendActionChipPending, compact && styles.friendActionChipCompact, dk]}
        onPress={() => cancelOrRemoveFriend(targetUserId)}
      >
        <Text style={[styles.friendActionChipPendingText, dkText]}>신청중</Text>
      </TouchableOpacity>
    );
  };

  const markMessagesAsRead = async (partnerId) => {
    const myId = session.user.id;
    setUnreadCountBySender((prev) => {
      if (!prev[partnerId]) return prev;
      const next = { ...prev };
      delete next[partnerId];
      return next;
    });

    await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('sender_id', partnerId)
      .eq('receiver_id', myId)
      .eq('is_read', false);

    await fetchUnreadCountsBySender(myId);
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
    hapticTap();

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

  const sendChatSticker = async (url) => {
    if (!chatPartner || sendingMsg) return;
    const isSelfChat = chatPartner.id === session.user.id;
    const { data, error } = await supabase
      .from('messages')
      .insert({
        sender_id: session.user.id,
        receiver_id: chatPartner.id,
        content: STICKER_LABEL,
        sticker_url: url,
        is_read: isSelfChat,
      })
      .select()
      .single();
    if (error) {
      showAlert('이모티콘 전송 실패', getKoreanErrorMessage(error));
    } else if (data) {
      setChatMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
    }
  };

  // "사진 올리기" → 갤러리 선택 화면 열기 (단체방과 같은 방식)
  const handleSendChatPhoto = () => {
    if (!chatPartner || sendingMsg) return;
    setChatAttachMenuOpen(false);
    setChatStickerOpen(false);
    setChatGalleryOpen(true);
  };

  // 갤러리에서 고른 사진들을 한 장씩 전송
  const sendChatPhotos = async (assets, opts) => {
    const sendOriginal = !!(opts && opts.original);
    setChatGalleryOpen(false);
    if (!chatPartner || !assets || !assets.length) return;
    const partnerId = chatPartner.id;
    const isSelfChat = partnerId === session.user.id;
    setSendingMsg(true);
    let fail = 0;
    let lastMsg = '';
    for (const a of assets) {
      try {
        let src = a.uri;
        try {
          const info = await MediaLibrary.getAssetInfoAsync(a);
          if (info && info.localUri) src = info.localUri;
        } catch (e) { /* 원래 uri 사용 */ }
        // 원본으로 보내기: 크기 그대로 + 최고 품질 / 아니면 가로 1080px, 품질 0.8
        const manipulated = await ImageManipulator.manipulateAsync(
          src,
          sendOriginal ? [] : [{ resize: { width: 1080 } }],
          { compress: sendOriginal ? 1 : 0.8, format: ImageManipulator.SaveFormat.JPEG }
        );
        const storagePath = `${session.user.id}/photo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`;
        const response = await fetch(manipulated.uri);
        const arrayBuffer = await response.arrayBuffer();
        const { error: uploadErr } = await supabase.storage
          .from('chat-files')
          .upload(storagePath, arrayBuffer, { contentType: 'image/jpeg', upsert: true });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from('chat-files').getPublicUrl(storagePath);
        const { data: msgData, error: msgErr } = await supabase
          .from('messages')
          .insert({
            sender_id: session.user.id,
            receiver_id: partnerId,
            content: '',
            image_url: urlData.publicUrl,
            is_read: isSelfChat,
          })
          .select()
          .single();
        if (msgErr) throw msgErr;
        if (msgData) {
          setChatMessages((prev) => (prev.some((m) => m.id === msgData.id) ? prev : [...prev, msgData]));
        }
      } catch (e) {
        fail += 1;
        lastMsg = e?.message || String(e);
      }
    }
    setSendingMsg(false);
    if (fail > 0) showAlert('사진 전송 오류', `${fail}장을 보내지 못했습니다.\n(${lastMsg})`);
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

  // 새 게시물: 갤러리에서 고른 사진들을 미리보기에 추가 (최대 10장)
  const pickPostPhoto = async (assets) => {
    setPostGalleryOpen(false);
    if (!assets || !assets.length) return;
    setPostPhotoBusy(true);
    const added = [];
    try {
      for (const a of assets) {
        try {
          let src = a.uri;
          try {
            const info = await MediaLibrary.getAssetInfoAsync(a);
            if (info && info.localUri) src = info.localUri;
          } catch (e) { /* 원래 uri 사용 */ }
          // 게시물 사진 화질: 가로 최대 1600px, 압축 0.9 (원본이 더 작으면 원본 크기 그대로)
          const POST_MAX_W = 1600;
          const actions = a.width && a.width > 0 && a.width <= POST_MAX_W ? [] : [{ resize: { width: POST_MAX_W } }];
          const manipulated = await ImageManipulator.manipulateAsync(
            src,
            actions,
            { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
          );
          added.push(manipulated.uri);
        } catch (e) {
          showAlert('사진 선택 오류', `사진 한 장을 불러오지 못했습니다.\n(${e?.message || e})`);
        }
      }
      setPostImages((prev) => [...prev, ...added].slice(0, MAX_POST_PHOTOS));
    } finally {
      setPostPhotoBusy(false);
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
    setTempBgmUri(null);
    setTempBgmName('');
    setTempBgmTitle(profile.bgm_title || '');
    setBgmChanged(false);
    setEditProfileModal(true);
  };

  const pickBgmFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
      if (result.canceled || !result.assets || !result.assets[0]) return;
      const a = result.assets[0];
      if (a.size && a.size > 15 * 1024 * 1024) {
        showAlert('파일이 너무 커요', '15MB 이하의 음악 파일을 골라 주세요.');
        return;
      }
      setTempBgmUri(a.uri);
      setTempBgmName(a.name || 'song.mp3');
      setTempBgmTitle((a.name || '내 노래').replace(/\.[^.]+$/, ''));
      setTempBgmMime(a.mimeType || 'audio/mpeg');
      setBgmChanged(true);
    } catch (e) {
      showAlert('음악 선택 오류', `파일을 불러오지 못했습니다.\n(${e?.message || e})`);
    }
  };

  // 새 게시물 창의 'BGM 변경' 버튼: 음악 파일을 골라 바로 내 프로필 BGM으로 바꿈
  const [bgmQuickBusy, setBgmQuickBusy] = useState(false);
  const quickChangeBgm = async () => {
    if (bgmQuickBusy) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
      if (result.canceled || !result.assets || !result.assets[0]) return;
      const a = result.assets[0];
      if (a.size && a.size > 15 * 1024 * 1024) {
        showAlert('파일이 너무 커요', '15MB 이하의 음악 파일을 골라 주세요.');
        return;
      }
      setBgmQuickBusy(true);
      const name = a.name || 'song.mp3';
      const ext = ((name.match(/\.([a-zA-Z0-9]+)$/) || [])[1] || 'mp3').toLowerCase();
      const fileName = `bgm_${Date.now()}.${ext}`;
      const path = `${session.user.id}/${fileName}`;
      const resp = await fetch(a.uri);
      const buf = await resp.arrayBuffer();
      const up = await supabase.storage.from('bgm').upload(path, buf, { contentType: a.mimeType || 'audio/mpeg', upsert: true });
      if (up.error) throw up.error;
      const url = supabase.storage.from('bgm').getPublicUrl(path).data.publicUrl;
      const title = name.replace(/\.[^.]+$/, '') || '내 노래';
      const { error } = await supabase.from('profiles').update({ bgm_url: url, bgm_title: title }).eq('id', session.user.id);
      if (error) throw error;
      cleanupOldBgmFiles(fileName);
      setProfile((prev) => ({ ...prev, bgm_url: url, bgm_title: title }));
      fetchFriendsAndRequests();
      bgmPlay(bgmToTrack({ id: session.user.id, nickname: profile.nickname, bgm_url: url, bgm_title: title }));
      setBgmQuickBusy(false);
      showAlert('BGM 변경 완료', `"${title}"(으)로 바뀌었어요.`);
    } catch (e) {
      setBgmQuickBusy(false);
      showAlert('BGM 변경 실패', `음악을 올리지 못했습니다.\n(${e?.message || e})`);
    }
  };

  // 내 폴더(bgm/내아이디/)에서 keepName 을 뺀 나머지 음악 파일을 모두 삭제
  const cleanupOldBgmFiles = async (keepName) => {
    try {
      const folder = session.user.id;
      const { data, error } = await supabase.storage.from('bgm').list(folder, { limit: 100 });
      if (error || !Array.isArray(data)) return;
      const oldPaths = data
        .filter((f) => f && f.name && f.name !== keepName && f.name !== '.emptyFolderPlaceholder')
        .map((f) => `${folder}/${f.name}`);
      if (oldPaths.length > 0) {
        await supabase.storage.from('bgm').remove(oldPaths);
      }
    } catch (e) { /* 정리 실패해도 앱 사용에는 문제 없음 */ }
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

      let newBgmFileName = null; // 새로 올린 곡 파일 이름 (옛 파일 정리할 때 이것만 남김)
      if (bgmChanged) {
        if (tempBgmUri) {
          const ext = ((tempBgmName.match(/\.([a-zA-Z0-9]+)$/) || [])[1] || 'mp3').toLowerCase();
          newBgmFileName = `bgm_${Date.now()}.${ext}`;
          const path = `${session.user.id}/${newBgmFileName}`;
          const resp = await fetch(tempBgmUri);
          const buf = await resp.arrayBuffer();
          const up = await supabase.storage.from('bgm').upload(path, buf, { contentType: tempBgmMime || 'audio/mpeg', upsert: true });
          if (up.error) throw up.error;
          updates.bgm_url = supabase.storage.from('bgm').getPublicUrl(path).data.publicUrl;
          updates.bgm_title = tempBgmTitle.trim() || '내 노래';
        } else {
          updates.bgm_url = null;
          updates.bgm_title = null;
        }
      }

      const { error } = await supabase.from('profiles').upsert(updates);
      setLoading(false);

      // 곡을 바꾸거나 지웠으면: 서버에 남아 있는 예전 곡 파일을 삭제 (멤버당 1곡만 보관)
      if (!error && bgmChanged) {
        cleanupOldBgmFiles(newBgmFileName);
      }

      if (error) {
        showAlert('저장 실패', getKoreanErrorMessage(error));
        return;
      }

      setProfile((prev) => ({ ...prev, ...updates }));
      setEditProfileModal(false);
      fetchFriendsAndRequests();
      fetchPosts();
      showAlert('완료', '프로필이 저장되었습니다!');
    } catch (e) {
      setLoading(false);
      showAlert('오류', `프로필 저장 중 문제가 발생했습니다.\n(${e?.message || e})`);
    }
  };

  const switchAuthMode = (toSignUp) => {
    setPassword('');
    setPasswordConfirm('');
    setIsSignUpScreen(toSignUp);
  };

  const handleLogin = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      showAlert('알림', '이메일 아이디와 비밀번호를 모두 입력해 주세요.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
    setLoading(false);
    if (error) {
      showAlert('로그인 실패', getKoreanErrorMessage(error));
    } else {
      AsyncStorage.setItem(LAST_EMAIL_STORAGE_KEY, trimmedEmail).catch(() => {});
    }
  };

  const checkIsRegisteredEmail = async (targetEmail) => {
    const normalized = targetEmail.trim().toLowerCase();
    if (!normalized) return false;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, nickname')
        .ilike('email', normalized)
        .limit(1);

      if (!error && Array.isArray(data) && data.length > 0) {
        return true;
      }
    } catch {
      // profiles에 email 컬럼이 없는 경우 폴백으로 진행
    }

    const { error: probeError } = await supabase.auth.signInWithPassword({
      email: normalized,
      password: '__NON_EXISTENT_CHECK_PASSWORD_999!@#',
    });

    if (!probeError) {
      await supabase.auth.signOut();
      return true;
    }

    const msg = (probeError.message || '').toLowerCase();
    if (msg.includes('invalid login credentials') || (probeError.code || '').toLowerCase() === 'invalid_credentials') {
      return true;
    }
    return false;
  };

  const handleFindId = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      showAlert('아이디 찾기', '가입된 이메일 아이디를 입력해 주세요.');
      return;
    }

    setLoading(true);
    const isRegistered = await checkIsRegisteredEmail(trimmedEmail);
    setLoading(false);

    if (!isRegistered) {
      showAlert('아이디 찾기', '가입되지 않은 사용자입니다.');
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail);
    if (error) {
      showAlert('전송 실패', getKoreanErrorMessage(error));
      return;
    }

    showAlert(
      '아이디 찾기',
      `가입된 아이디(${trimmedEmail})가 확인되었습니다.\n보안상 기존 비밀번호는 발송되지 않으며, 가입된 메일로 비밀번호 재설정 안내를 보냈습니다.`
    );
  };

  const handleResetPassword = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      showAlert('비밀번호 재설정', '이메일 아이디를 먼저 입력해 주세요.');
      return;
    }

    setLoading(true);
    const isRegistered = await checkIsRegisteredEmail(trimmedEmail);
    if (!isRegistered) {
      setLoading(false);
      showAlert('비밀번호 재설정', '가입되지 않은 사용자입니다.');
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail);
    setLoading(false);

    if (error) {
      showAlert('재설정 실패', getKoreanErrorMessage(error));
    } else {
      showAlert('비밀번호 재설정', `${trimmedEmail} 주소로 비밀번호 재설정 안내 메일을 보냈습니다.`);
    }
  };

  const handleSignUp = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return showAlert('알림', '이메일 아이디를 입력해 주세요.');
    if (password.length < 6) return showAlert('알림', '비밀번호는 6자 이상 입력해 주세요.');
    if (password !== passwordConfirm) return showAlert('알림', '비밀번호가 일치하지 않습니다.');

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email: trimmedEmail, password });
    setLoading(false);

    if (error) return showAlert('회원가입 실패', getKoreanErrorMessage(error));
    AsyncStorage.setItem(LAST_EMAIL_STORAGE_KEY, trimmedEmail).catch(() => {});
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
    if (!error && data) {
      setPosts(data);
      if (session?.user?.id) {
        AsyncStorage.setItem(`posts_cache_v1_${session.user.id}`, JSON.stringify(data.slice(0, 40))).catch(() => {});
      }
    }
  };

  // ---- 차단 / 신고 ----
  const fetchBlocks = async () => {
    try {
      const { data, error } = await supabase
        .from('user_blocks')
        .select('blocked_id')
        .eq('blocker_id', session.user.id);
      if (!error && Array.isArray(data)) setBlockedIds(data.map((r) => r.blocked_id));
    } catch (e) { /* 무시 */ }
  };

  const blockUser = (userId, name, onDone) => {
    Alert.alert(
      '차단',
      `${name || '이 사람'}님을 차단할까요?\n이 사람의 글과 댓글이 보이지 않아요. (차단 관리에서 해제할 수 있어요)`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '차단',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('user_blocks')
              .insert({ blocker_id: session.user.id, blocked_id: userId });
            if (error && error.code !== '23505') {
              showAlert('차단 실패', getKoreanErrorMessage(error));
              return;
            }
            setBlockedIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
            setSelectedPostId(null);
            if (onDone) onDone();
            showAlert('차단했어요', '더 이상 이 사람의 글과 댓글이 보이지 않아요.');
          },
        },
      ]
    );
  };

  const unblockUser = async (userId) => {
    const { error } = await supabase
      .from('user_blocks')
      .delete()
      .eq('blocker_id', session.user.id)
      .eq('blocked_id', userId);
    if (error) {
      showAlert('해제 실패', getKoreanErrorMessage(error));
      return false;
    }
    setBlockedIds((prev) => prev.filter((id) => id !== userId));
    return true;
  };

  const reportPost = (post) => {
    const send = async (reason) => {
      const { error } = await supabase.from('reports').insert({
        reporter_id: session.user.id,
        target_type: 'post',
        target_id: String(post.id),
        target_user_id: post.author_id,
        reason,
      });
      if (error) showAlert('신고 실패', getKoreanErrorMessage(error));
      else showAlert('신고했어요', '확인 후 조치할게요. 불편하시면 차단도 할 수 있어요.');
    };
    Alert.alert('신고 사유', '이 글을 신고하는 이유를 골라 주세요.', [
      { text: '스팸·광고', onPress: () => send('스팸·광고') },
      { text: '욕설·불쾌한 내용', onPress: () => send('욕설·불쾌한 내용') },
      { text: '취소', style: 'cancel' },
    ]);
  };

  const createPost = async () => {
    if (!content.trim() && postImages.length === 0) {
      showAlert('알림', '내용을 입력하거나 사진을 첨부해 주세요.');
      return;
    }

    setLoading(true);
    try {
      let uploadedUrls = [];
      for (let i = 0; i < postImages.length; i++) {
        const publicUrl = await uploadImageFile(postImages[i], `post${i}`);
        if (publicUrl) uploadedUrls.push(publicUrl);
      }

      const { error } = await supabase.from('posts').insert({
        author_id: session.user.id,
        content: content.trim(),
        image_urls: uploadedUrls,
        visibility: visibility || 'public',
      });

      setLoading(false);
      if (error) {
        showAlert('등록 실패', getKoreanErrorMessage(error));
      } else {
        setContent('');
        setImageUri(null); setPostImages([]);
        setVisibility('public');
        setWriteModalVisible(false);
        fetchPosts();
      }
    } catch (e) {
      setLoading(false);
      showAlert('오류', `게시글 등록 중 오류가 발생했습니다.\n(${e?.message || e})`);
    }
  };

  const saveEditPost = async (postId, newText, nextVisibility) => {
    if (!newText.trim()) {
      showAlert('알림', '수정할 내용을 입력해 주세요.');
      return;
    }
    setLoading(true);
    const payload = { content: newText.trim() };
    if (nextVisibility) payload.visibility = nextVisibility;

    const { error } = await supabase
      .from('posts')
      .update(payload)
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
    hapticTap();
    const target = posts.find((p) => String(p.id) === String(postId));
    const mine = target && (target.reactions || []).find((x) => x.user_id === session.user.id);
    if (mine && mine.type === type) {
      await supabase.from('reactions').delete().eq('post_id', postId).eq('user_id', session.user.id);
      fetchPosts();
      return;
    }
    await supabase.from('reactions').upsert(
      { post_id: postId, user_id: session.user.id, type },
      { onConflict: 'post_id,user_id' }
    );
    fetchPosts();
  };

  if (!fontsReady) return null;

  if (!session) {
    if (isSignUpScreen) {
      return (
        <SafeAreaView style={styles.authContainer}>
          <View style={styles.authInnerBox}>
            <Text style={styles.logo}>me</Text>
            <Text style={styles.authSubTitle}>회원가입</Text>
            <TextInput
              style={styles.input}
              placeholder="이메일 아이디"
              placeholderTextColor="#78909C"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={styles.input}
              placeholder="비밀번호 (6자 이상)"
              placeholderTextColor="#78909C"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <TextInput
              style={styles.input}
              placeholder="비밀번호 확인"
              placeholderTextColor="#78909C"
              value={passwordConfirm}
              onChangeText={setPasswordConfirm}
              secureTextEntry
            />
            <TouchableOpacity style={styles.btnPrimary} onPress={handleSignUp} disabled={loading}>
              {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.btnText}>회원가입</Text>}
            </TouchableOpacity>
            <View style={styles.authLinksRow}>
              <TouchableOpacity onPress={() => switchAuthMode(false)} disabled={loading}>
                <Text style={styles.authLinkText}>로그인 화면으로 돌아가기</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.authContainer}>
        <View style={styles.authInnerBox}>
          <Text style={styles.logo}>me</Text>

          <TextInput
            style={styles.input}
            placeholder="이메일 아이디"
            placeholderTextColor="#78909C"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            placeholder="비밀번호"
            placeholderTextColor="#78909C"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity style={styles.btnPrimary} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.btnText}>로그인</Text>}
          </TouchableOpacity>

          <View style={styles.authLinksRow}>
            <TouchableOpacity onPress={handleFindId} disabled={loading}>
              <Text style={styles.authLinkText}>아이디 찾기</Text>
            </TouchableOpacity>
            <Text style={styles.authLinkDot}>·</Text>
            <TouchableOpacity onPress={handleResetPassword} disabled={loading}>
              <Text style={styles.authLinkText}>비밀번호 재설정</Text>
            </TouchableOpacity>
            <Text style={styles.authLinkDot}>·</Text>
            <TouchableOpacity onPress={() => switchAuthMode(true)} disabled={loading}>
              <Text style={styles.authLinkText}>회원가입</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const bgmList = members
    .filter((m) => m.bgm_url)
    .sort((a, b) => (a.id === session.user.id ? -1 : 0) - (b.id === session.user.id ? -1 : 0));
  bgmListRef.current = bgmList;
  const shownBgmTrack = bgmTrack || (bgmList[0] ? bgmToTrack(bgmList[0]) : null);

  const visiblePosts = posts.filter(isPostVisibleToMe).filter((p) => !blockedIds.includes(p.author_id));
  const otherMembers = members
    .filter((m) => m.id !== session.user.id)
    .sort((x, y) => {
      const ux = (unreadCountBySender[x.id] || 0) > 0 ? 0 : 1;
      const uy = (unreadCountBySender[y.id] || 0) > 0 ? 0 : 1;
      if (ux !== uy) return ux - uy;
      const fx = acceptedFriendIds.includes(x.id) ? 0 : 1;
      const fy = acceptedFriendIds.includes(y.id) ? 0 : 1;
      return fx - fy;
    });
  const feedPosts = onlyFavoritesFeed
    ? visiblePosts.filter((p) => p.author_id === session.user.id || acceptedFriendIds.includes(p.author_id))
    : visiblePosts;

  const myStoryPosts = visiblePosts.filter((p) => p.author_id === session.user.id);
  const incomingCount = incomingRequests.length;
  const totalUnreadMessages = Object.values(unreadCountBySender).reduce((sum, n) => sum + (n || 0), 0);

  const unreadSendersSorted = Object.entries(unreadCountBySender)
    .filter(([senderId, count]) => senderId !== session.user.id && (count || 0) > 0)
    .sort((a, b) => (b[1] || 0) - (a[1] || 0))
    .map(([senderId, count]) => {
      const found = members.find((m) => m.id === senderId);
      return {
        id: senderId,
        nickname: found?.nickname || '회원',
        bio: found?.bio || '',
        avatar_url: found?.avatar_url || null,
        unreadCount: count,
      };
    });

  const sortedChatMembers = (() => {
    const myId = session.user.id;
    const meItem = members.find((m) => m.id === myId) || {
      id: myId,
      nickname: profile.nickname || '나',
      bio: profile.bio || '',
      avatar_url: profile.avatar_url || null,
    };
    const others = members
      .filter((m) => m.id !== myId)
      .sort((a, b) => {
        const diff = (unreadCountBySender[b.id] || 0) - (unreadCountBySender[a.id] || 0);
        if (diff !== 0) return diff;
        return (a.nickname || '').localeCompare(b.nickname || '', 'ko');
      });
    return [meItem, ...others];
  })();

  const currentAccountEmail = session.user?.email || '';
  const currentAccountName = profile.nickname || (currentAccountEmail ? currentAccountEmail.split('@')[0] : '내 계정');

  const renderHomeFeedHeader = () => (
    <View style={styles.igHeaderContainer}>
      <View style={styles.igTopBar}>
        <View style={{ width: 32 }} />

        <TouchableOpacity
          style={styles.igCenterBrandBtn}
          activeOpacity={0.75}
          onPress={() => {
            setAccountMenuOpen(false);
            setBrandMenuOpen(!brandMenuOpen);
          }}
        >
          <Text style={styles.igLogoText}>
            me
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
          activeOpacity={0.75}
          onPress={() => {
            setBrandMenuOpen(false);
            setAccountMenuOpen(!accountMenuOpen);
          }}
        >
          <Ionicons name="menu" size={23} color="#111111" />
          {incomingCount > 0 && (
            <>
              <View style={styles.menuAlertDot} />
              <View style={styles.menuApplicantBadge}>
                <Text style={styles.menuApplicantBadgeText}>{incomingCount}</Text>
              </View>
            </>
          )}
        </TouchableOpacity>
      </View>

      {accountMenuOpen && (
        <View style={styles.accountPopoverMenu}>
          <View style={styles.accountPopoverHeader}>
            <Ionicons name="person-circle-outline" size={18} color="#18181B" />
            <View style={{ flex: 1 }}>
              <Text style={styles.accountPopoverName} numberOfLines={1}>
                {currentAccountName}
              </Text>
              {currentAccountEmail ? (
                <Text style={styles.accountPopoverEmail} numberOfLines={1}>
                  {currentAccountEmail}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.igDropdownDivider} />

          <TouchableOpacity
            style={styles.accountPopoverActionRow}
            onPress={() => setIncomingListExpanded(!incomingListExpanded)}
          >
            <Ionicons name="notifications-outline" size={16} color="#0288D1" />
            <Text style={styles.accountPopoverActionText}>친구 신청</Text>
            <View style={styles.applicantCountPill}>
              <Text style={styles.applicantCountPillText}>{incomingCount}명</Text>
            </View>
          </TouchableOpacity>

          {incomingListExpanded && incomingCount > 0 && (
            <View style={styles.incomingRequestBox}>
              {incomingRequests.map((req) => (
                <View key={req.id} style={styles.incomingRequestRow}>
                  <Text style={styles.incomingRequesterName} numberOfLines={1}>
                    {req.requesterProfile?.nickname || '회원'}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 5 }}>
                    <TouchableOpacity
                      style={styles.acceptMiniBtn}
                      onPress={() => acceptFriendRequest(req.id, req.requester_id)}
                    >
                      <Text style={styles.acceptMiniBtnText}>수락</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rejectMiniBtn}
                      onPress={() => rejectFriendRequest(req.id, req.requester_id)}
                    >
                      <Text style={styles.rejectMiniBtnText}>거절</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={styles.igDropdownDivider} />

          <TouchableOpacity
            style={styles.accountPopoverActionRow}
            onPress={handleLogout}
            disabled={loading}
          >
            <Ionicons name="log-out-outline" size={16} color="#18181B" />
            <Text style={styles.accountPopoverActionText}>로그아웃</Text>
          </TouchableOpacity>
          <View style={styles.igDropdownDivider} />

          <TouchableOpacity
            style={styles.accountPopoverActionRow}
            onPress={() => setSettingsMenuOpen(!settingsMenuOpen)}
          >
            <Ionicons name="settings-outline" size={16} color="#18181B" />
            <Text style={styles.accountPopoverActionText}>설정</Text>
            <Ionicons name={settingsMenuOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#71717A" />
          </TouchableOpacity>

          {settingsMenuOpen && (
            <View style={{ paddingLeft: 14 }}>
              <View style={styles.igDropdownDivider} />
              <TouchableOpacity
                style={styles.accountPopoverActionRow}
                onPress={() => { hapticSelect(); toggleBgmAutoStart(); }}
              >
                <Ionicons name="musical-note-outline" size={16} color="#18181B" />
                <Text style={styles.accountPopoverActionText}>접속시 음악재생</Text>
                <View style={styles.applicantCountPill}>
                  <Text style={styles.applicantCountPillText}>{bgmAutoStart ? '켬' : '끔'}</Text>
                </View>
              </TouchableOpacity>
              <View style={styles.igDropdownDivider} />
              <TouchableOpacity
                style={styles.accountPopoverActionRow}
                onPress={() => { hapticSelect(); cycleThemeMode(); }}
              >
                <Ionicons name="moon-outline" size={16} color="#18181B" />
                <Text style={styles.accountPopoverActionText}>화면 모드</Text>
                <View style={styles.applicantCountPill}>
                  <Text style={styles.applicantCountPillText}>{modeLabel(getMode())}</Text>
                </View>
              </TouchableOpacity>
              <View style={styles.igDropdownDivider} />

              <TouchableOpacity
                style={styles.accountPopoverActionRow}
                onPress={() => {
                  setAccountMenuOpen(false);
                  setBlockListOpen(true);
                }}
              >
                <Ionicons name="ban-outline" size={16} color="#18181B" />
                <Text style={styles.accountPopoverActionText}>차단 관리</Text>
                <View style={styles.applicantCountPill}>
                  <Text style={styles.applicantCountPillText}>{blockedIds.length}명</Text>
                </View>
              </TouchableOpacity>
              <View style={styles.igDropdownDivider} />

              <TouchableOpacity
                style={styles.accountPopoverActionRow}
                onPress={() => {
                  setAccountMenuOpen(false);
                  openNotificationSoundSettings();
                }}
              >
                <Ionicons name="musical-notes-outline" size={16} color="#18181B" />
                <Text style={styles.accountPopoverActionText}>알림음 변경</Text>
              </TouchableOpacity>
              <View style={styles.igDropdownDivider} />

              <TouchableOpacity
                style={styles.accountPopoverActionRow}
                onPress={handleWithdrawAccount}
                disabled={loading}
              >
                <Ionicons name="trash-outline" size={16} color="#DC2626" />
                <Text style={[styles.accountPopoverActionText, { color: '#DC2626' }]}>탈퇴</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {brandMenuOpen && (
        <View style={styles.igBrandDropdown}>
          <TouchableOpacity
            style={styles.igDropdownRow}
            onPress={() => {
              setBrandMenuOpen(false);
              setOnlyFavoritesFeed(false);
              fetchFriendsAndRequests();
              setMainTab('friends');
            }}
          >
            <Ionicons name="person-add-outline" size={17} color="#111111" />
            <Text style={styles.igDropdownLabel}>친구하기</Text>
          </TouchableOpacity>
        </View>
      )}

      {shownBgmTrack ? (
        <MusicBar
          track={shownBgmTrack}
          playing={bgmPlaying}
          muted={bgmMuted}
          onToggleMute={bgmToggleMute}
          hasNext={bgmList.length > 1}
          onToggle={() => bgmToggle(shownBgmTrack)}
          onNext={() => bgmNext(shownBgmTrack)}
        />
      ) : null}

      {/* 멤버 줄 위: 친구만 / 모두 선택 (작은 글자 + 음영) */}
      <View style={styles.memberFilterRow}>
        {[
          { key: false, label: '모두' },
          { key: true, label: '친구만' },
        ].map((opt) => {
          const on = memberFilterFriends === opt.key;
          return (
            <TouchableOpacity
              key={opt.label}
              style={[styles.memberFilterBtn, on && styles.memberFilterBtnOn]}
              activeOpacity={0.7}
              onPress={() => setMemberFilterFriends(opt.key)}
            >
              <Text style={[styles.memberFilterText, on && styles.memberFilterTextOn]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.igStoryBarContent}
      >
        <TouchableOpacity
          style={styles.igStoryItem}
          onPress={() => {
            setBrandMenuOpen(false);
            setAccountMenuOpen(false);
            setImageUri(null); setPostImages([]);
            setContent('');
            setVisibility('public');
            setWriteModalVisible(true);
          }}
        >
          <View style={styles.igStoryAvatarWrap}>
            <View style={[styles.igStoryRing, { marginBottom: 0, borderColor: 'transparent' }]}>
              {profile.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.igStoryAvatar} />
              ) : (
                <View style={[styles.igStoryAvatar, styles.ktDefaultAvatar]}>
                  <Ionicons name="person" size={18} color="#64748B" />
                </View>
              )}
            </View>
            <View style={styles.igStoryPlusBadge}>
              <Ionicons name="add" size={11} color="#FFFFFF" />
            </View>
          </View>
          <Text style={styles.igStoryName} numberOfLines={1}>내 스토리</Text>
        </TouchableOpacity>

        {(memberFilterFriends ? otherMembers.filter((m) => acceptedFriendIds.includes(m.id)) : otherMembers).map((member) => {
          const isFriendMember = acceptedFriendIds.includes(member.id);
          const unreadN = unreadCountBySender[member.id] || 0;
          return (
          <TouchableOpacity
            key={member.id}
            style={styles.igStoryItem}
            onPress={() => {
              setBrandMenuOpen(false);
              setAccountMenuOpen(false);
              if (unreadN > 0) {
                openInlineChatInMessagesTab(member);
              } else {
                setSelectedFriend(member);
              }
            }}
          >
            <View style={styles.igStoryAvatarWrap}>
              <View style={[styles.igStoryRing, { marginBottom: 0 }, !isFriendMember && styles.igStoryRingOff]}>
                {member.avatar_url ? (
                  <Image source={{ uri: member.avatar_url }} style={[styles.igStoryAvatar, !isFriendMember && { opacity: 0.75 }]} />
                ) : (
                  <View style={[styles.igStoryAvatar, styles.ktDefaultAvatar]}>
                    <Ionicons name="person" size={18} color="#64748B" />
                  </View>
                )}
              </View>
              {isFriendMember && (
                <View style={styles.igStoryFriendBadge}>
                  <Ionicons name="checkmark" size={9} color="#FFFFFF" />
                </View>
              )}
              {unreadN > 0 && (
                <View style={styles.igStoryUnreadBadge}>
                  <Text style={styles.igStoryUnreadText}>{unreadN > 99 ? '…' : unreadN}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.igStoryName, !isFriendMember && { color: '#A1A1AA' }]} numberOfLines={1}>
              {member.nickname || '친구'}
            </Text>
          </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#EEEEEE', marginTop: 8 }}>
        <TouchableOpacity
          style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: homeGrid ? 2 : 0, borderBottomColor: '#111111' }}
          onPress={() => changeHomeView(true)}
        >
          <Ionicons name="grid" size={22} color={homeGrid ? '#111111' : '#B0B3B8'} />
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: homeGrid ? 0 : 2, borderBottomColor: '#111111' }}
          onPress={() => changeHomeView(false)}
        >
          <Ionicons name="albums" size={22} color={homeGrid ? '#B0B3B8' : '#111111'} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderFeedCommentPanel = (item, overlay) => {
    const list = commentsByPost[String(item.id)] || [];
    const tops = list.filter((c) => !c.parent_id);
    const target = null; // 답글 기능 없음 (새 댓글만)
    const mainColor = overlay ? '#FFFFFF' : '#18181B';
    const subColor = overlay ? '#D4D4D8' : '#52525B';

    const submit = async () => {
      const txt = panelCommentText.trim();
      if (!txt) return;
      setPanelCommentText('');
      setPanelReplyTarget(null);
      await handleAddComment(item.id, txt, target ? target.id : null);
    };

    return (
      <View style={overlay ? styles.feedCommentOverlay : styles.feedCommentInline}>
        <View style={styles.feedCommentHeader}>
          <Text style={[styles.feedCommentTitle, { color: mainColor }]}>댓글 {tops.length}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => openPostView(item, 0)} style={{ paddingHorizontal: 6 }}>
              <Text style={{ color: subColor, fontSize: 12 }}>댓글상세</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setPanelReplyTarget(null); setCommentPanelPostId(null); }} style={{ paddingHorizontal: 4 }}>
              <Ionicons name="close" size={20} color={mainColor} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          nestedScrollEnabled
          style={overlay ? { flex: 1 } : { maxHeight: 220 }}
          showsVerticalScrollIndicator={false}
        >
          {tops.length === 0 ? (
            <Text style={{ color: subColor, fontSize: 13, marginTop: 6 }}>첫 댓글을 남겨 보세요.</Text>
          ) : (
            tops.map((c) => (
              <View key={String(c.id)} style={{ marginBottom: 9 }}>
                <Text style={{ color: mainColor, fontSize: 13, lineHeight: 18 }}>
                  <Text style={{ fontWeight: '700' }}>{c.authorName || '회원'} </Text>
                  {c.content}
                </Text>
              </View>
            ))
          )}
        </ScrollView>

        <View style={styles.feedCommentInputRow}>
          <TextInput
            style={styles.feedCommentInput}
            value={panelCommentText}
            onChangeText={setPanelCommentText}
            placeholder="댓글 달기..."
            placeholderTextColor="#9CA3AF"
          />
          <TouchableOpacity onPress={submit} style={styles.feedCommentSendBtn}>
            <Text style={styles.feedCommentSendText}>등록</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderHomeFeedPostItem = ({ item }) => {
    const isMyPost = item.author_id === session.user.id;
    const isLikedByMe = Boolean(item.reactions?.some((x) => x.user_id === session.user.id));
    const totalReactions = item.reactions?.length || 0;
    const postComments = commentsByPost[String(item.id)] || [];
    const authorName = item.profiles?.nickname || profile.nickname || '친구';
    const authorAvatar = item.profiles?.avatar_url || null;
    const dateText = new Date(item.created_at).toLocaleString('ko-KR');
    const isPanelOpen = commentPanelPostId === item.id;
    const hasImage = Boolean(item.image_urls?.[0]);

    return (
      <View style={styles.minimalPostCard}>
        <View style={styles.minimalPostHeader}>
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
            {authorAvatar ? (
              <Image source={{ uri: authorAvatar }} style={styles.igPostAvatar} />
            ) : (
              <View style={[styles.igPostAvatar, styles.ktDefaultAvatar]}>
                <Ionicons name="person" size={16} color="#64748B" />
              </View>
            )}
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.igPostAuthorName}>{authorName}</Text>
                <View style={styles.visibilityPill}>
                  <Text style={styles.visibilityPillText}>{getVisibilityLabel(item.visibility)}</Text>
                </View>
              </View>
              <Text style={styles.igPostDate}>{dateText}</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.igPostRightActions}>
            {!isMyPost && renderFriendStatusActionButton(item.author_id, true)}
            <TouchableOpacity onPress={() => setSelectedPostId(item.id)} style={{ paddingHorizontal: 4, paddingVertical: 2 }}>
              <Ionicons name="ellipsis-horizontal" size={18} color="#444444" />
            </TouchableOpacity>
          </View>
        </View>

        {hasImage && (
          <View style={{ position: 'relative' }}>
            {(() => {
              const openViewer = (i) => openPostView(item, i);
              return item.image_urls.length > 1 ? (
                <FeedImageCarousel
                  width={homeListWidth > 0 ? homeListWidth : undefined}
                  uris={item.image_urls}
                  onPressIndex={openViewer}
                  onDoubleLike={() => { if (!isLikedByMe) toggleReaction(item.id, 'like'); }}
                />
              ) : (
                <CompactFeedImage
                  width={homeListWidth > 0 ? homeListWidth : undefined}
                  uri={item.image_urls[0]}
                  onPress={() => openViewer(0)}
                  onDoubleLike={() => { if (!isLikedByMe) toggleReaction(item.id, 'like'); }}
                />
              );
            })()}
          </View>
        )}


        <View style={styles.minimalPostFooter}>
          <View style={styles.minimalStatsRow}>
            <TouchableOpacity
              style={styles.minimalStatBtn}
              activeOpacity={0.75}
              onPress={() => toggleReaction(item.id, 'like')}
            >
              <BounceView trigger={isLikedByMe}>
                <Ionicons
                  name={isLikedByMe ? 'heart' : 'heart-outline'}
                  size={20}
                  color={isLikedByMe ? '#E11D48' : '#18181B'}
                />
              </BounceView>
              <Text style={[styles.minimalStatCount, isLikedByMe && { color: '#E11D48', fontWeight: '700' }]}>
                {totalReactions}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.minimalStatBtn}
              activeOpacity={0.75}
              onPress={() => {
                // 아래에서 댓글 팝업이 올라옴 (게시물 상세로 이동하지 않음)
                setPanelCommentText('');
                setCommentPanelPostId(item.id);
                setCommentSheetPost(item);
                fetchCommentsForPost(item.id);
              }}
            >
              <Ionicons name={isPanelOpen ? 'chatbubble' : 'chatbubble-outline'} size={19} color="#18181B" />
              <Text style={styles.minimalStatCount}>{postComments.length}</Text>
            </TouchableOpacity>
          </View>

          {item.content ? (
            <TouchableOpacity activeOpacity={0.85} onPress={() => setSelectedPostId(item.id)}>
              <Text style={styles.minimalPostCaption}>
                <Text style={styles.minimalCaptionAuthor}>{authorName} </Text>
                {item.content}
              </Text>
            </TouchableOpacity>
          ) : null}
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

  const renderFriendRow = (friend) => {
    return (
      <View key={friend.id} style={styles.ktFriendRow}>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
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
        </TouchableOpacity>

        {renderFriendStatusActionButton(friend.id, true)}
      </View>
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
        {incomingCount > 0 && (
          <View style={styles.ktSection}>
            <Text style={styles.ktSectionTitle}>받은 친구 신청 {incomingCount}명</Text>
            {incomingRequests.map((req) => (
              <View key={req.id} style={styles.ktFriendRow}>
                {req.requesterProfile?.avatar_url ? (
                  <Image source={{ uri: req.requesterProfile.avatar_url }} style={styles.ktFriendAvatar} />
                ) : (
                  <View style={[styles.ktFriendAvatar, styles.ktDefaultAvatar]}>
                    <Ionicons name="person" size={20} color="#64748B" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.ktFriendName}>{req.requesterProfile?.nickname || '회원'}</Text>
                  <Text style={styles.ktFriendBio}>친구 신청을 보냈습니다</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity
                    style={styles.acceptMiniBtn}
                    onPress={() => acceptFriendRequest(req.id, req.requester_id)}
                  >
                    <Text style={styles.acceptMiniBtnText}>수락</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rejectMiniBtn}
                    onPress={() => rejectFriendRequest(req.id, req.requester_id)}
                  >
                    <Text style={styles.rejectMiniBtnText}>거절</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            <View style={styles.ktDivider} />
          </View>
        )}

        <TouchableOpacity
          style={styles.ktSelfBanner}
          onPress={() =>
            openInlineChatInMessagesTab({
              id: session.user.id,
              nickname: profile.nickname || '나',
              avatar_url: profile.avatar_url,
            })
          }
        >
          <View style={styles.ktSelfBadge}>
            <Ionicons name="chatbubble" size={16} color="#0369A1" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.ktSelfTitle}>me · 나와의 채팅 (개인 메모장)</Text>
            <Text style={styles.ktSelfSub} numberOfLines={1}>
              {profile.bio || '나에게 보내는 메시지를 기록해 보세요'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#888888" />
        </TouchableOpacity>

        <View style={styles.ktSection}>
          <TouchableOpacity
            style={styles.ktSectionHeader}
            onPress={() => setFriendsSectionOpen(!friendsSectionOpen)}
          >
            <Text style={styles.ktSectionTitle}>
              회원 목록 {filteredMembers.length} (수락된 친구 {acceptedFriendIds.length}명)
            </Text>
            <Ionicons name={friendsSectionOpen ? 'chevron-up' : 'chevron-down'} size={15} color="#999999" />
          </TouchableOpacity>

          {friendsSectionOpen && (
            filteredMembers.length > 0 ? (
              filteredMembers.map(renderFriendRow)
            ) : (
              <Text style={styles.ktEmptySectionText}>
                {searchQuery ? '검색된 회원이 없습니다.' : '아직 가입된 다른 회원이 없습니다.'}
              </Text>
            )
          )}
        </View>
      </ScrollView>
    </View>
  );

  const renderInlineChatDrawer = (partner) => {
    const isSelfChat = partner.id === session.user.id;

    return (
      <View style={[styles.inlineChatDrawer, { flex: 1 }]}>
        <View style={styles.inlineChatDrawerTop}>
          <Text style={styles.inlineChatDrawerLabel} numberOfLines={1}>
            {isSelfChat
              ? `me (나와의 채팅 · 길게 눌러 삭제)`
              : `${partner.nickname || '대화방'} 대화 (보낸 메시지 길게 눌러 삭제)`}
          </Text>
          <TouchableOpacity onPress={() => setChatPartner(null)} style={styles.inlineChatCollapseBtn}>
            <Text style={styles.inlineChatCollapseText}>접기</Text>
            <Ionicons name="chevron-up" size={14} color="#52525B" />
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={inlineChatScrollRef}
          style={[styles.inlineChatHistoryScroll, { flex: 1 }]}
          contentContainerStyle={{ padding: 12, paddingBottom: 16 }}
          nestedScrollEnabled
          showsVerticalScrollIndicator={true}
          onContentSizeChange={() => inlineChatScrollRef.current?.scrollToEnd({ animated: false })}
          onLayout={() => inlineChatScrollRef.current?.scrollToEnd({ animated: false })}
        >
          {chatMessages.length === 0 ? (
            <View style={styles.inlineChatEmpty}>
              <Text style={styles.inlineChatEmptyText}>
                아직 메시지가 없습니다. 아래 입력창에서 바로 대화를 시작해 보세요.
              </Text>
            </View>
          ) : (
            chatMessages.map((item) => {
              const isMine = item.sender_id === session.user.id;
              const timeStr = new Date(item.created_at).toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit',
              });
              const detectedUrl = !item.image_url && !item.file_url ? extractFirstUrl(item.content) : null;

              return (
                <View key={String(item.id)} style={[styles.bubbleRow, isMine ? styles.bubbleRowMine : styles.bubbleRowOther]}>
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
                        if (partner.avatar_url) {
                          setViewingImage({
                            uri: partner.avatar_url,
                            authorId: partner.id,
                            authorName: partner.nickname || '상대방',
                            avatarUrl: partner.avatar_url,
                            dateText: '프로필 사진',
                            likeCount: 0,
                            isLikedByMe: false,
                          });
                        }
                      }}
                    >
                      {partner.avatar_url ? (
                        <Image source={{ uri: partner.avatar_url }} style={styles.inlineChatAvatar} />
                      ) : (
                        <View style={[styles.inlineChatAvatar, styles.defaultSmallAvatar]}>
                          <Ionicons name="person" size={13} color="#64748B" />
                        </View>
                      )}
                    </TouchableOpacity>
                  )}

                  <View style={{ maxWidth: '76%' }}>
                    {!isMine && (
                      <Text style={styles.chatSenderName}>{partner.nickname || '상대방'}</Text>
                    )}

                    {getSticker(item) ? (
                      <TouchableOpacity
                        activeOpacity={0.9}
                        onLongPress={isMine ? () => handleDeleteSentMessage(item) : undefined}
                        delayLongPress={400}
                      >
                        <StickerBubbleImage url={getSticker(item)} />
                      </TouchableOpacity>
                    ) : item.image_url ? (
                      <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={() =>
                          setViewingImage({
                            uri: item.image_url,
                            authorId: item.sender_id,
                            authorName: isMine ? (profile.nickname || '나') : (partner.nickname || '상대방'),
                            avatarUrl: isMine ? profile.avatar_url : partner.avatar_url,
                            dateText: new Date(item.created_at).toLocaleString('ko-KR'),
                            likeCount: 0,
                            isLikedByMe: false,
                          })
                        }
                        onLongPress={isMine ? () => handleDeleteSentMessage(item) : undefined}
                        delayLongPress={400}
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
                        onPress={() => handleOpenExternalLink(item.file_url)}
                        onLongPress={isMine ? () => handleDeleteSentMessage(item) : undefined}
                        delayLongPress={400}
                        style={[styles.bubbleBox, isMine ? styles.bubbleMine : styles.bubbleOther, isMine && isSelfChat && styles.bubbleSelf, styles.fileBubbleBox]}
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
                      <TouchableOpacity
                        activeOpacity={isMine ? 0.85 : 1}
                        onPress={detectedUrl ? () => handleOpenExternalLink(detectedUrl) : undefined}
                        onLongPress={isMine ? () => handleDeleteSentMessage(item) : undefined}
                        delayLongPress={400}
                        style={[styles.bubbleBox, isMine ? styles.bubbleMine : styles.bubbleOther, isMine && isSelfChat && styles.bubbleSelf]}
                      >
                        <Text
                          style={[styles.bubbleText, detectedUrl && styles.linkBubbleText]}
                          onPress={detectedUrl ? () => handleOpenExternalLink(detectedUrl) : undefined}
                        >
                          {item.content}
                        </Text>
                        {detectedUrl && (
                          <LinkPreviewCard
                            url={detectedUrl}
                            onPress={handleOpenExternalLink}
                            onLongPress={isMine ? () => handleDeleteSentMessage(item) : undefined}
                          />
                        )}
                      </TouchableOpacity>
                    )}
                  </View>

                  {!isMine && <Text style={styles.bubbleTime}>{timeStr}</Text>}
                </View>
              );
            })
          )}
        </ScrollView>

        <View style={styles.inlineChatInputBar}>
          <TouchableOpacity
            style={[styles.chatPlusBtn, chatAttachMenuOpen && styles.chatPlusBtnActive]}
            onPress={() => setChatAttachMenuOpen(!chatAttachMenuOpen)}
            disabled={sendingMsg}
          >
            <Ionicons name={chatAttachMenuOpen ? 'close' : 'add'} size={20} color="#444444" />
          </TouchableOpacity>

          <TextInput
            style={styles.inlineChatTextInput}
            placeholder="메시지나 링크 주소를 입력하세요..."
            value={chatInput}
            onChangeText={setChatInput}
            onFocus={() => { setChatAttachMenuOpen(false); setChatStickerOpen(false); }}
            multiline
          />

          <TouchableOpacity
            style={[styles.inlineChatSendBtn, (!chatInput.trim() || sendingMsg) && { opacity: 0.5 }]}
            onPress={sendChatMessage}
            disabled={!chatInput.trim() || sendingMsg}
          >
            {sendingMsg ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.inlineChatSendText}>전송</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={{ marginLeft: 6, paddingHorizontal: 10, height: 36, borderRadius: 18, backgroundColor: '#E53E3E', alignItems: 'center', justifyContent: 'center' }}
            onPress={() => handleLeaveChat(partner)}
            disabled={sendingMsg}
          >
            <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>나가기</Text>
          </TouchableOpacity>
        </View>

        {chatAttachMenuOpen && (
          <View style={styles.inlineAttachDrawer}>
            <TouchableOpacity style={styles.attachDrawerItem} onPress={handleSendChatPhoto}>
              <View style={[styles.attachDrawerIconBox, { backgroundColor: '#48BB78' }]}>
                <Ionicons name="image-outline" size={22} color="#FFFFFF" />
              </View>
              <Text style={styles.attachDrawerLabel}>사진 올리기</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.attachDrawerItem}
              onPress={() => { setChatAttachMenuOpen(false); setChatStickerOpen(true); }}
            >
              <View style={[styles.attachDrawerIconBox, { backgroundColor: '#F6AD55' }]}>
                <Ionicons name="happy-outline" size={22} color="#FFFFFF" />
              </View>
              <Text style={styles.attachDrawerLabel}>이모티콘</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.attachDrawerItem} onPress={handleSendChatFile}>
              <View style={[styles.attachDrawerIconBox, { backgroundColor: '#4299E1' }]}>
                <Ionicons name="document-attach-outline" size={22} color="#FFFFFF" />
              </View>
              <Text style={styles.attachDrawerLabel}>파일 첨부</Text>
            </TouchableOpacity>
          </View>
        )}

        <GalleryPicker
          visible={chatGalleryOpen}
          onClose={() => setChatGalleryOpen(false)}
          onSend={sendChatPhotos}
          originalOption
        />

        {chatStickerOpen && (
          <StickerPanel
            supabase={supabase}
            onPick={sendChatSticker}
            onClose={() => setChatStickerOpen(false)}
          />
        )}
      </View>
    );
  };

  const renderChatsTabScreen = () => (
    <KeyboardAvoidingView
      style={styles.ktContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.ktHeader}>
        <Text style={styles.ktPageTitle}>메시지</Text>
        <TouchableOpacity
          style={styles.ktIconBtn}
          onPress={() => {
            fetchFriendsAndRequests();
            fetchUnreadCountsBySender(session.user.id);
          }}
        >
          <Ionicons name="refresh-outline" size={20} color="#333333" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={sortedChatMembers}
        keyExtractor={(item) => item.id}
        extraData={{
          activeChatId: chatPartner?.id,
          chatMessages,
          chatInput,
          sendingMsg,
          chatAttachMenuOpen,
          chatStickerOpen,
          unreadCountBySender,
        }}
        contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 6, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const isMe = item.id === session.user.id;
          const isExpanded = chatPartner?.id === item.id;
          const unreadForSender = isMe ? 0 : (unreadCountBySender[item.id] || 0);

          return (
            <View
              style={[
                styles.memberCardGroup,
                isMe && styles.pinnedSelfCardGroup,
                isExpanded && styles.memberCardGroupExpanded,
              ]}
            >
              <TouchableOpacity
                style={[styles.memberRow, isExpanded && styles.memberRowActive]}
                activeOpacity={0.75}
                onPress={() => toggleInlineChat(item)}
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
                    {isMe ? (
                      // 나와의 채팅: '나와의 채팅' 글자 대신 하늘색 'me' 표시 (다른 이름들과 같은 줄 높이)
                      <View style={styles.meBadge}>
                        <Text style={[styles.memberName, styles.meBadgeText]}>me</Text>
                      </View>
                    ) : (
                      <Text style={styles.memberName}>{item.nickname || '이름 없음'}</Text>
                    )}
                  </View>
                  <Text style={styles.memberBio} numberOfLines={1}>
                    {item.bio || '터치하여 아래에서 대화하기'}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {unreadForSender > 0 && (
                    <View style={styles.unreadCounterBadge}>
                      <Text style={styles.unreadCounterBadgeText}>{unreadForSender}</Text>
                    </View>
                  )}
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chatbubble-outline'}
                    size={18}
                    color={isExpanded ? '#18181B' : '#2B6CB0'}
                  />
                </View>
              </TouchableOpacity>

            {isExpanded && (
              <Modal visible animationType="slide" onRequestClose={() => setChatPartner(null)}>
                <View style={{ flex: 1, backgroundColor: bgc('#fff'), paddingTop: 36 }}>
                  <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                    {renderInlineChatDrawer(item)}
                  </KeyboardAvoidingView>
                </View>
              </Modal>
            )}
            </View>
          );
        }}
      />
    </KeyboardAvoidingView>
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
              authorId: session.user.id,
              authorName: profile.nickname || '내 스토리',
              avatarUrl: profile.avatar_url || null,
              dateText: '프로필 배경사진',
              caption: profile.bio || '',
              likeCount: 0,
              isLikedByMe: false,
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
            <TouchableOpacity style={styles.topCircleBtn} onPress={handleLogout}>
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
                  authorId: session.user.id,
                  authorName: profile.nickname || '내 스토리',
                  avatarUrl: profile.avatar_url,
                  dateText: '프로필 사진',
                  caption: profile.bio || '',
                  likeCount: 0,
                  isLikedByMe: false,
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
                  openInlineChatInMessagesTab({
                    id: session.user.id,
                    nickname: profile.nickname || '나',
                    avatar_url: profile.avatar_url,
                  })
                }
              >
                <Ionicons name="chatbubble-outline" size={14} color="#FFFFFF" />
                <Text style={styles.glassBtnText}>me</Text>
              </TouchableOpacity>
              <View style={styles.glassDividerVertical} />
              <TouchableOpacity
                style={styles.glassHalfBtn}
                onPress={() => {
                  setImageUri(null); setPostImages([]);
                  setContent('');
                  setVisibility('public');
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

  // 격자 한 칸 크기: 실제 목록 너비를 재서 3칸으로 나눔 (기기마다 잘리지 않게)
  const gridCell = homeListWidth > 0
    ? Math.floor(((homeListWidth - 4) / 3) * 100) / 100
    : (CONTENT_WIDTH - RIGHT_MARGIN - 4) / 3;

  const renderGridItem = ({ item }) => {
    const hasImage = item.image_urls && item.image_urls.length > 0;
    const reactionCount = item.reactions?.length || 0;
    // 누구 게시물인지: 작은 프로필 사진 + 이름
    const gAuthorName = item.profiles?.nickname || (item.author_id === session.user.id ? profile.nickname : '') || '회원';
    const gAuthorAvatar = item.profiles?.avatar_url || (item.author_id === session.user.id ? profile.avatar_url : null);
    const authorChip = (
      <View style={styles.gridAuthorChip}>
        {gAuthorAvatar ? (
          <Image source={{ uri: gAuthorAvatar }} style={styles.gridAuthorAvatar} />
        ) : (
          <View style={[styles.gridAuthorAvatar, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#71717A' }]}>
            <Ionicons name="person" size={9} color="#FFFFFF" />
          </View>
        )}
        <Text style={styles.gridAuthorName} numberOfLines={1}>{gAuthorName}</Text>
      </View>
    );

    return (
      <TouchableOpacity
        style={[styles.gridItem, { width: gridCell, height: gridCell }]}
        activeOpacity={0.85}
        onPress={() => openPostView(item, 0)}
      >
        {hasImage ? (
          <>
            <Image source={{ uri: item.image_urls[0] }} style={styles.gridImage} />
            {item.image_urls.length > 1 ? (
              <View style={{ position: 'absolute', top: 5, right: 5 }}>
                <Ionicons name="albums" size={16} color="#FFFFFF" />
              </View>
            ) : null}
            {authorChip}
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
            {authorChip}
            <Text style={[styles.gridTextOnlyContent, { marginTop: 18 }]} numberOfLines={4}>
              {item.content}
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

  const selectedPostObj = visiblePosts.find((p) => p.id === selectedPostId) || null;
  const viewingPost = viewingImage && viewingImage.postId
    ? (posts.find((p) => String(p.id) === String(viewingImage.postId)) || null)
    : null;

  // 게시물 열기: 사진이 있으면 검은 화면 사진보기, 글만 있으면 상세 팝업
  const openPostView = (post, index = 0) => {
    if (post && post.image_urls && post.image_urls.length > 0) {
      setViewingImage({ postId: post.id, index });
    } else if (post) {
      setSelectedPostId(post.id);
    }
  };
  const selectedPostComments = selectedPostId ? (commentsByPost[String(selectedPostId)] || []) : [];

  const isHomeActive = mainTab === 'home' && !onlyFavoritesFeed;
  const isFriendsActive = mainTab === 'friends';
  const isChatsActive = mainTab === 'chats';
  const isFavActive = mainTab === 'home' && onlyFavoritesFeed;
  const isStoryActive = mainTab === 'story';

  return (
    <SafeAreaView style={styles.container}>
      {incomingMsgBanner && (
        <TouchableOpacity
          style={styles.topMsgToastBanner}
          activeOpacity={0.9}
          onPress={() => {
            const targetId = incomingMsgBanner.senderId;
            const targetMember = members.find((m) => m.id === targetId) || {
              id: targetId,
              nickname: incomingMsgBanner.senderName,
              avatar_url: incomingMsgBanner.avatarUrl,
            };
            setIncomingMsgBanner(null);
            openInlineChatInMessagesTab(targetMember);
          }}
        >
          {incomingMsgBanner.avatarUrl ? (
            <Image source={{ uri: incomingMsgBanner.avatarUrl }} style={styles.toastAvatar} />
          ) : (
            <View style={[styles.toastAvatar, styles.ktDefaultAvatar]}>
              <Ionicons name="chatbubble" size={15} color="#0288D1" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.toastSenderText} numberOfLines={1}>
              {incomingMsgBanner.senderName}
            </Text>
            <Text style={styles.toastBodyText} numberOfLines={1}>
              {incomingMsgBanner.text}
            </Text>
          </View>
          <Text style={styles.toastOpenHint}>보기</Text>
        </TouchableOpacity>
      )}

      <View style={styles.mainShellRow}>
        {/* 화면 맨 아래 가로 메뉴바 */}
        <View style={styles.leftVerticalMenuBar}>
          <TouchableOpacity
            style={styles.leftMenuBtn}
            onPress={() => {
              setBrandMenuOpen(false);
              setMemberPostsUser(null);
              setAccountMenuOpen(false);
              setOnlyFavoritesFeed(false);
              fetchPosts();
              setMainTab('home');
            }}
          >
            <Ionicons
              name={isHomeActive ? 'home' : 'home-outline'}
              size={22}
              color="#111111"
              style={{ opacity: isHomeActive ? 1 : 0.45 }}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.leftMenuBtn}
            onPress={() => {
              setBrandMenuOpen(false);
              setMemberPostsUser(null);
              setAccountMenuOpen(false);
              fetchFriendsAndRequests();
              setMainTab('friends');
            }}
          >
            <Ionicons
              name="search"
              size={22}
              color="#111111"
              style={{ opacity: isFriendsActive ? 1 : 0.45 }}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.leftMenuBtn}
            onPress={() => {
              setBrandMenuOpen(false);
              setMemberPostsUser(null);
              setAccountMenuOpen(false);
              fetchFriendsAndRequests();
              fetchUnreadCountsBySender(session.user.id);
              setMainTab('chats');
            }}
          >
            <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons
                name={isChatsActive ? 'chatbubble' : 'chatbubble-outline'}
                size={21}
                color="#111111"
                style={{ opacity: isChatsActive ? 1 : 0.45 }}
              />
              {totalUnreadMessages > 0 && (
                <View style={styles.leftRailUnreadBadge}>
                  <Text style={styles.leftRailUnreadText}>
                    {totalUnreadMessages > 99 ? '…' : totalUnreadMessages}
                  </Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.leftMenuBtn}
            onPress={() => {
              setBrandMenuOpen(false);
              setMemberPostsUser(null);
              setAccountMenuOpen(false);
              setShowGroupChat(true);
            }}
          >
            <View style={{ width: 28, height: 26 }}>
              <Ionicons name="chatbubble" size={17} color="#111111" style={{ position: 'absolute', right: 0, top: 0, opacity: 0.28 }} />
              <Ionicons name="chatbubble" size={19} color="#FFFFFF" style={{ position: 'absolute', left: 0, bottom: 0 }} />
              <Ionicons name="chatbubble-outline" size={19} color="#111111" style={{ position: 'absolute', left: 0, bottom: 0, opacity: showGroupChat ? 1 : 0.7 }} />
            </View>
          </TouchableOpacity>
          {showGroupChat && session ? (
            <GroupChat supabase={supabase} me={session.user.id} onClose={() => setShowGroupChat(false)} />
          ) : null}


          <TouchableOpacity
            style={styles.leftMenuBtn}
            onPress={() => {
              setBrandMenuOpen(false);
              setMemberPostsUser(null);
              setAccountMenuOpen(false);
              setImageUri(null); setPostImages([]);
              setContent('');
              setVisibility('public');
              setWriteModalVisible(true);
            }}
          >
            <Ionicons name="add" size={25} color="#111111" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.leftMenuBtn}
            onPress={() => {
              setBrandMenuOpen(false);
              setMemberPostsUser(null);
              setAccountMenuOpen(false);
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

        {/* 중앙 메인 콘텐츠 영역 */}
        <View style={styles.centerContentArea}>
          {/* 멤버 게시물 화면 (프로필 → 게시물): 홈 화면과 같은 모양, 아래 메뉴바 유지 */}
          {memberPostsUser && (() => {
            const mu = memberPostsUser;
            const list = visiblePosts.filter((p) => p.author_id === mu.id);
            const hasBio = !!(mu.bio && mu.bio.trim());
            const header = (
              <View>
                <View style={styles.memberPostsHeader}>
                  <TouchableOpacity
                    onPress={() => { setSelectedFriend(mu); setMemberPostsUser(null); }}
                    hitSlop={10}
                    style={{ width: 34 }}
                  >
                    <Ionicons name="arrow-back" size={24} color="#111111" />
                  </TouchableOpacity>
                  {mu.avatar_url ? (
                    <Image source={{ uri: mu.avatar_url }} style={styles.memberPostsAvatar} />
                  ) : (
                    <View style={[styles.memberPostsAvatar, { alignItems: 'center', justifyContent: 'center' }]}>
                      <Ionicons name="person" size={22} color="#A1A1AA" />
                    </View>
                  )}
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.memberPostsName} numberOfLines={1}>
                      {mu.nickname || '회원'} <Text style={styles.memberPostsCount}>게시물 {list.length}</Text>
                    </Text>
                    <Text
                      style={[styles.memberPostsBio, !hasBio && { color: '#A1A1AA' }]}
                      numberOfLines={2}
                      ellipsizeMode="tail"
                    >
                      {hasBio ? mu.bio.trim() : '소개글이 등록되지 않았습니다.'}
                    </Text>
                  </View>
                </View>
                {mu.bgm_url ? (
                  <MusicBar
                    track={bgmToTrack(mu)}
                    playing={!!(bgmPlaying && bgmTrack && bgmTrack.url === mu.bgm_url)}
                    muted={bgmMuted}
                    onToggleMute={bgmToggleMute}
                    hasNext={false}
                    label="프로필 BGM이 재생되고 있습니다."
                    onToggle={() => {
                      if (bgmTrack && bgmTrack.url === mu.bgm_url && soundRef.current) bgmToggle();
                      else bgmPlay(bgmToTrack(mu));
                    }}
                  />
                ) : null}
                <View style={{ flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#EEEEEE', marginTop: 10 }}>
                  <TouchableOpacity
                    style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: memberPostsGrid ? 2 : 0, borderBottomColor: '#111111' }}
                    onPress={() => setMemberPostsGrid(true)}
                  >
                    <Ionicons name="grid" size={22} color={memberPostsGrid ? '#111111' : '#B0B3B8'} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: memberPostsGrid ? 0 : 2, borderBottomColor: '#111111' }}
                    onPress={() => setMemberPostsGrid(false)}
                  >
                    <Ionicons name="albums" size={22} color={memberPostsGrid ? '#B0B3B8' : '#111111'} />
                  </TouchableOpacity>
                </View>
              </View>
            );
            return (
              <View style={styles.memberPostsRoot}>
                <FlatList
                  key={memberPostsGrid ? 'member-grid' : 'member-feed'}
                  style={{ flex: 1, backgroundColor: bgc('#FFFFFF') }}
                  contentContainerStyle={{ paddingBottom: 28 }}
                  data={list}
                  numColumns={memberPostsGrid ? 3 : 1}
                  extraData={homeListWidth}
                  keyExtractor={(item) => 'm' + String(item.id)}
                  ListHeaderComponent={header}
                  renderItem={memberPostsGrid ? renderGridItem : renderHomeFeedPostItem}
                  ListEmptyComponent={
                    <View style={styles.emptyBox}>
                      <Text style={[styles.emptyText, { color: '#A1A1AA' }]}>아직 볼 수 있는 게시물이 없어요.</Text>
                    </View>
                  }
                />
              </View>
            );
          })()}

          {mainTab === 'home' && (
            <FlatList
              key={homeGrid ? 'home-grid' : 'home-feed'}
              style={{ flex: 1, backgroundColor: bgc('#FFFFFF') }}
              onLayout={(e) => {
                const w = Math.floor(e.nativeEvent.layout.width);
                if (w > 0 && w !== homeListWidth) setHomeListWidth(w);
              }}
              contentContainerStyle={{ paddingBottom: 28 }}
              data={feedPosts}
              numColumns={homeGrid ? 3 : 1}
              extraData={homeListWidth}
              keyExtractor={(item) => String(item.id)}
              ListHeaderComponent={renderHomeFeedHeader}
              renderItem={homeGrid ? renderGridItem : renderHomeFeedPostItem}
              ListEmptyComponent={
                <View style={styles.emptyBox}>
                  <Text style={[styles.emptyText, { color: '#777' }]}>
                    {onlyFavoritesFeed
                      ? '친구공개로 공유된 게시물이 없습니다.\n친구 신청을 수락하거나 전체 보기로 전환해 보세요!'
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
              data={myStoryPosts}
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
        <View style={styles.friendFullBackdrop}>
          <View style={styles.friendCardModal}>
            <ImageBackground
              source={selectedFriend.cover_url ? { uri: selectedFriend.cover_url } : undefined}
              style={[styles.friendCardCover, { height: Math.round(getWindowHeight() * 0.7) }]}
              resizeMode="cover"
            >
              <TouchableOpacity
                activeOpacity={1}
                style={styles.friendCardCoverOverlay}
                onPress={() => {
                  if (selectedFriend.cover_url) {
                    setViewingImage({
                      uri: selectedFriend.cover_url,
                      authorId: selectedFriend.id,
                      authorName: selectedFriend.nickname || '친구',
                      avatarUrl: selectedFriend.avatar_url || null,
                      dateText: '프로필 배경사진',
                      caption: selectedFriend.bio || '',
                      likeCount: 0,
                      isLikedByMe: false,
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

              {/* 음악 재생기: 배경사진 위쪽, 투명 (홈 재생기와 같은 구성) */}
              {selectedFriend.bgm_url ? (
                <View style={styles.friendBgmFloatWrap} pointerEvents="box-none">
                  <ProfileMusicBar
                    track={bgmToTrack(selectedFriend)}
                    playing={!!(bgmPlaying && bgmTrack && bgmTrack.url === selectedFriend.bgm_url)}
                    muted={bgmMuted}
                    onToggleMute={bgmToggleMute}
                    onToggle={() => {
                      if (bgmTrack && bgmTrack.url === selectedFriend.bgm_url && soundRef.current) bgmToggle();
                      else bgmPlay(bgmToTrack(selectedFriend));
                    }}
                  />
                </View>
              ) : null}
            </ImageBackground>

            <View style={styles.friendCardBody}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  if (selectedFriend.avatar_url) {
                    setViewingImage({
                      uri: selectedFriend.avatar_url,
                      authorId: selectedFriend.id,
                      authorName: selectedFriend.nickname || '친구',
                      avatarUrl: selectedFriend.avatar_url,
                      dateText: '프로필 사진',
                      caption: selectedFriend.bio || '',
                      likeCount: 0,
                      isLikedByMe: false,
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


              {/* 프로필 하단 버튼 3개: 친구 / 1:1 채팅 / 차단 */}
              {(() => {
                const fid = selectedFriend.id;
                const isMe = fid === session?.user?.id;
                const rel = friendRelationMap[fid];
                const isBlocked = blockedIds.includes(fid);

                // 친구 버튼 상태
                let friendIcon = 'person-add-outline';
                let friendLabel = '친구신청';
                let friendColor = '#FFFFFF';
                let onFriendPress = () => sendFriendRequest(fid);
                if (rel && rel.status === 'accepted') {
                  friendIcon = 'person-remove-outline';
                  friendLabel = '친구끊기';
                  onFriendPress = () => cancelOrRemoveFriend(fid);
                } else if (rel && rel.addressee_id === session?.user?.id) {
                  friendIcon = 'person-add';
                  friendLabel = '신청수락';
                  friendColor = '#60A5FA';
                  onFriendPress = () => acceptFriendRequest(rel.id, fid);
                } else if (rel) {
                  friendIcon = 'time-outline';
                  friendLabel = '신청중';
                  friendColor = '#9CA3AF';
                  onFriendPress = () => cancelOrRemoveFriend(fid);
                }

                return (
                  <View style={styles.friendCardActions}>
                    <TouchableOpacity
                      style={styles.friendCardActionBtn}
                      activeOpacity={0.7}
                      onPress={() => { setMemberPostsGrid(true); setMemberPostsUser(selectedFriend); setSelectedFriend(null); }}
                    >
                      <Ionicons name="grid-outline" size={17} color="#FFFFFF" />
                      <Text style={styles.friendCardActionLabel}>게시물</Text>
                    </TouchableOpacity>

                    {!isMe && (
                      <TouchableOpacity style={styles.friendCardActionBtn} activeOpacity={0.7} onPress={onFriendPress}>
                        <Ionicons name={friendIcon} size={17} color={friendColor} />
                        <Text style={[styles.friendCardActionLabel, { color: friendColor }]}>{friendLabel}</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={styles.friendCardActionBtn}
                      activeOpacity={0.7}
                      onPress={() => {
                        const target = selectedFriend;
                        setSelectedFriend(null);
                        openInlineChatInMessagesTab(target);
                      }}
                    >
                      <Ionicons name="chatbubble-outline" size={17} color="#FFFFFF" />
                      <Text style={styles.friendCardActionLabel}>1:1 채팅하기</Text>
                    </TouchableOpacity>

                    {!isMe && (
                      isBlocked ? (
                        <TouchableOpacity
                          style={styles.friendCardActionBtn}
                          activeOpacity={0.7}
                          onPress={async () => {
                            const ok = await unblockUser(fid);
                            if (ok) showAlert('차단 해제', `${selectedFriend.nickname || '이 사람'}님의 차단을 해제했어요.`);
                          }}
                        >
                          <Ionicons name="lock-open-outline" size={17} color="#9CA3AF" />
                          <Text style={[styles.friendCardActionLabel, { color: '#9CA3AF' }]}>차단해제</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={styles.friendCardActionBtn}
                          activeOpacity={0.7}
                          onPress={() => blockUser(fid, selectedFriend.nickname, () => setSelectedFriend(null))}
                        >
                          <Ionicons name="ban-outline" size={17} color="#F87171" />
                          <Text style={[styles.friendCardActionLabel, { color: '#F87171' }]}>차단하기</Text>
                        </TouchableOpacity>
                      )
                    )}
                  </View>
                );
              })()}
            </View>
          </View>
        </View>
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

              <Text style={styles.fieldLabel}>원형 메인 프로필 사진</Text>
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

              <Text style={styles.fieldLabel}>배경음악 (내 프로필을 열면 나오는 노래)</Text>
              <View style={styles.bgmPickRow}>
                <Text style={styles.bgmPickTitle} numberOfLines={1}>
                  {bgmChanged && !tempBgmUri
                    ? '선택 안 함'
                    : (tempBgmUri ? tempBgmTitle : (profile.bgm_url ? (profile.bgm_title || '설정됨') : '선택 안 함'))}
                </Text>
                <TextBtn label="곡 고르기" onPress={pickBgmFile} />
                {(tempBgmUri || profile.bgm_url) && !(bgmChanged && !tempBgmUri) ? (
                  <TextBtn
                    label="지우기"
                    pressedColor="#DC2626"
                    onPress={() => { setTempBgmUri(null); setTempBgmName(''); setTempBgmTitle(''); setBgmChanged(true); }}
                  />
                ) : null}
              </View>
              {tempBgmUri ? (
                <TextInput
                  style={styles.modalInput}
                  value={tempBgmTitle}
                  onChangeText={setTempBgmTitle}
                  placeholder="곡 제목"
                />
              ) : null}
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

            <Text style={styles.fieldLabel}>공개 범위 설정</Text>
            <View style={styles.visibilitySelectorRow}>
              {VISIBILITY_OPTIONS.map((opt) => {
                const active = visibility === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.visibilitySelectChip, active && styles.visibilitySelectChipActive]}
                    onPress={() => setVisibility(opt.key)}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={14}
                      color={active ? '#FFFFFF' : '#475569'}
                    />
                    <Text style={[styles.visibilitySelectText, active && styles.visibilitySelectTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              style={[styles.modalInput, { height: 110, textAlignVertical: 'top' }]}
              placeholder="오늘 어떤 일이 있었나요?"
              value={content}
              onChangeText={setContent}
              multiline
            />

            {postImages.length > 0 ? (
              <View style={{ marginBottom: 10 }}>
                <TouchableOpacity
                  style={styles.aiSuggestBtn}
                  onPress={suggestCaptionWithAI}
                  disabled={aiBusy}
                >
                  {aiBusy ? (
                    <ActivityIndicator color="#6D28D9" />
                  ) : (
                    <Text style={styles.aiSuggestBtnText}>✨ AI 문구 추천받기</Text>
                  )}
                </TouchableOpacity>
                {aiError ? <Text style={styles.aiErrorText}>{aiError}</Text> : null}
                {aiSuggestions.map((t, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.aiSuggestItem}
                    onPress={() => { setContent(t); hapticSelect(); }}
                  >
                    <Text style={styles.aiSuggestItemText}>{t}</Text>
                  </TouchableOpacity>
                ))}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
                  {postImages.map((u, idx) => (
                    <View key={u + idx} style={styles.postThumbWrap}>
                      <Image source={{ uri: u }} style={styles.postThumb} />
                      <View style={styles.postThumbNum}>
                        <Text style={styles.postThumbNumText}>{idx + 1}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.postThumbDel}
                        onPress={() => setPostImages((prev) => prev.filter((_, k) => k !== idx))}
                      >
                        <Ionicons name="close" size={14} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {postImages.length < MAX_POST_PHOTOS ? (
              <TouchableOpacity
                style={styles.attachPhotoBtn}
                onPress={() => setPostGalleryOpen(true)}
                disabled={postPhotoBusy}
              >
                {postPhotoBusy ? (
                  <ActivityIndicator color="#333333" />
                ) : (
                  <>
                    <Ionicons name="image-outline" size={18} color="#333333" />
                    <Text style={{ color: '#333', fontWeight: 'bold' }}>
                      갤러리에서 사진 첨부 ({postImages.length}/{MAX_POST_PHOTOS})
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <Text style={{ textAlign: 'center', color: '#64748B', fontSize: 13 }}>
                사진은 최대 {MAX_POST_PHOTOS}장까지 올릴 수 있어요
              </Text>
            )}

            {/* BGM 변경: 내 프로필 배경음악을 바로 바꿈 */}
            <TouchableOpacity
              style={[styles.attachPhotoBtn, { marginTop: 8 }]}
              onPress={quickChangeBgm}
              disabled={bgmQuickBusy || loading}
            >
              {bgmQuickBusy ? (
                <ActivityIndicator color="#333333" />
              ) : (
                <>
                  <Ionicons name="musical-notes-outline" size={18} color="#333333" />
                  <Text style={{ color: '#333', fontWeight: 'bold' }}>BGM 변경</Text>
                  <Text style={{ color: '#A1A1AA', fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
                    {profile.bgm_title ? `(지금: ${profile.bgm_title})` : '(설정 안 됨)'}
                  </Text>
                </>
              )}
            </TouchableOpacity>

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

      {/* 댓글 팝업: 화면 아래에서 올라옴 */}
      <Modal
        visible={!!commentSheetPost}
        transparent
        animationType="slide"
        onRequestClose={() => { setCommentSheetPost(null); setCommentPanelPostId(null); }}
      >
        {commentSheetPost ? (() => {
          const sp = commentSheetPost;
          const list = (commentsByPost[String(sp.id)] || []).filter((c) => !c.parent_id);
          const avatarFor = (uid) => {
            if (uid === session.user.id) return profile.avatar_url || null;
            const m = members.find((x) => x.id === uid);
            return (m && m.avatar_url) || null;
          };
          const closeSheet = () => { setCommentSheetPost(null); setCommentPanelPostId(null); };
          const sendSheet = async () => {
            const txt = panelCommentText.trim();
            if (!txt || sheetSending) return;
            setSheetSending(true);
            setPanelCommentText('');
            await handleAddComment(sp.id, txt, null);
            setSheetSending(false);
          };
          return (
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <TouchableOpacity style={styles.cmtSheetBackdrop} activeOpacity={1} onPress={closeSheet} />
              <View style={styles.cmtSheet}>
                <View style={styles.cmtSheetHandle} />
                <View style={styles.cmtSheetHeader}>
                  <Text style={styles.cmtSheetTitle}>댓글 {list.length}</Text>
                  <TouchableOpacity onPress={closeSheet} hitSlop={10}>
                    <Ionicons name="close" size={24} color="#3F3F46" />
                  </TouchableOpacity>
                </View>
                <ScrollView
                  style={{ flex: 1 }}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingBottom: 12 }}
                >
                  {list.length === 0 ? (
                    <Text style={styles.cmtSheetEmpty}>아직 댓글이 없어요.{'\n'}첫 댓글을 남겨 보세요.</Text>
                  ) : (
                    list.map((c) => {
                      const av = avatarFor(c.user_id);
                      return (
                        <View key={String(c.id)} style={styles.cmtSheetRow}>
                          {av ? (
                            <Image source={{ uri: av }} style={styles.cmtSheetAvatar} />
                          ) : (
                            <View style={[styles.cmtSheetAvatar, { alignItems: 'center', justifyContent: 'center' }]}>
                              <Ionicons name="person" size={16} color="#A1A1AA" />
                            </View>
                          )}
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={styles.cmtSheetName}>
                              {c.authorName || '회원'}
                              <Text style={styles.cmtSheetDate}>  {c.created_at ? new Date(c.created_at).toLocaleDateString('ko-KR') : ''}</Text>
                            </Text>
                            <Text style={styles.cmtSheetText}>{c.content}</Text>
                          </View>
                        </View>
                      );
                    })
                  )}
                </ScrollView>
                <View style={styles.cmtSheetInputRow}>
                  <TextInput
                    style={styles.cmtSheetInput}
                    value={panelCommentText}
                    onChangeText={setPanelCommentText}
                    placeholder="댓글 달기..."
                    placeholderTextColor="#A1A1AA"
                    onSubmitEditing={sendSheet}
                    returnKeyType="send"
                    blurOnSubmit={false}
                  />
                  <TouchableOpacity
                    onPress={sendSheet}
                    disabled={!panelCommentText.trim() || sheetSending}
                    style={[styles.cmtSheetSend, (!panelCommentText.trim() || sheetSending) && { opacity: 0.4 }]}
                  >
                    {sheetSending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.cmtSheetSendText}>보내기</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          );
        })() : null}
      </Modal>

      <GalleryPicker
        visible={postGalleryOpen}
        onClose={() => setPostGalleryOpen(false)}
        onSend={pickPostPhoto}
        maxSelect={Math.max(1, MAX_POST_PHOTOS - postImages.length)}
        sendLabel="선택"
      />

      {blockListOpen && (
        <View style={styles.overlayBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>차단 관리</Text>
            {blockedIds.length === 0 ? (
              <Text style={{ textAlign: 'center', color: '#64748B', marginVertical: 18 }}>
                차단한 사람이 없어요.
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 320 }}>
                {blockedIds.map((id) => (
                  <View
                    key={id}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }}
                  >
                    <Text style={{ fontSize: 15, color: '#18181B', flex: 1 }} numberOfLines={1}>
                      {resolveAuthorName(id)}
                    </Text>
                    <TextBtn label="차단 해제" onPress={() => unblockUser(id)} />
                  </View>
                ))}
              </ScrollView>
            )}
            <View style={{ alignItems: 'center', marginTop: 8 }}>
              <TextBtn label="닫기" onPress={() => setBlockListOpen(false)} />
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
        onEditComment={handleEditComment}
        onDeleteComment={handleDeleteComment}
        onClose={() => setSelectedPostId(null)}
        onToggleReaction={toggleReaction}
        onSaveEdit={saveEditPost}
        onDeletePost={confirmDeletePost}
        onReportPost={reportPost}
        onBlockUser={blockUser}
        onOpenFullImage={(info) => {
          setSelectedPostId(null);
          setViewingImage(info);
        }}
      />

      {viewingPost ? (
        <PostPhotoViewer
          key={String(viewingPost.id)}
          post={viewingPost}
          startIndex={viewingImage?.index || 0}
          currentUserId={session.user.id}
          defaultNickname={profile.nickname}
          comments={commentsByPost[String(viewingPost.id)] || []}
          onClose={() => setViewingImage(null)}
          onToggleReaction={toggleReaction}
          onAddComment={handleAddComment}
          onOpenMore={(postId) => {
            setViewingImage(null);
            setSelectedPostId(postId);
          }}
          onOpenAuthorChat={(partner) => {
            setViewingImage(null);
            openInlineChatInMessagesTab(partner);
          }}
        />
      ) : null}

      <FullscreenPhotoPopup
        photoInfo={viewingPost ? null : viewingImage}
        currentUserId={session.user.id}
        onClose={() => setViewingImage(null)}
        onToggleReaction={toggleReaction}
        onOpenCommentOrDetail={(postId) => {
          setViewingImage(null);
          setSelectedPostId(postId);
        }}
        onOpenAuthorChat={(partner) => {
          setViewingImage(null);
          openInlineChatInMessagesTab(partner);
        }}
      />
    </SafeAreaView>
  );
}

const styles = themedStyles({
  authContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#E3F2FD',
  },
  authInnerBox: {
    width: '100%',
  },
  logo: {
    fontSize: 56,
    fontWeight: '900',
    color: '#01579B',
    textAlign: 'center',
    marginBottom: 32,
    letterSpacing: -2.5,
    transform: [{ skewX: '-8deg' }],
  },
  authSubTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#01579B',
    textAlign: 'center',
    marginBottom: 14,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#BBDEFB',
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 14,
    fontSize: 15,
    color: '#18181B',
    marginBottom: 10,
  },
  btnPrimary: {
    backgroundColor: '#0288D1',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  btnText: {
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontSize: 16,
  },
  authLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  authLinkText: {
    color: '#0277BD',
    fontSize: 13,
    fontWeight: '600',
  },
  authLinkDot: {
    color: '#64B5F6',
    fontSize: 13,
    fontWeight: 'bold',
  },

  container: { flex: 1, backgroundColor: '#FFFFFF' },
  topMsgToastBanner: {
    position: 'absolute',
    top: 12,
    left: 14,
    right: 14,
    zIndex: 1300,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#18181B',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  toastAvatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
  },
  toastSenderText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  toastBodyText: {
    color: '#E4E4E7',
    fontSize: 12,
    marginTop: 1,
  },
  toastOpenHint: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },

  mainShellRow: {
    flex: 1,
    // 메뉴바(첫 번째 칸)를 화면 맨 아래로 보내기 위해 아래→위 순서로 쌓음
    flexDirection: 'column-reverse',
    backgroundColor: '#FFFFFF',
  },

  // 화면 맨 아래 가로 메뉴바
  leftVerticalMenuBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 6,
    paddingTop: 4,
    paddingBottom: 8,
  },
  leftMenuBtn: {
    width: 44,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftRailUnreadBadge: {
    position: 'absolute',
    top: -7,
    right: -4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3.5,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftRailUnreadText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: 'bold',
  },
  leftMenuAvatarRing: {
    padding: 1.5,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  leftMenuAvatarRingActive: {
    borderColor: '#111111',
  },
  leftMenuAvatarImg: {
    width: 26,
    height: 26,
    borderRadius: 7,
  },

  centerContentArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: SIDE_MARGIN,
  },

  rightUnreadRailBar: {
    width: RIGHT_RAIL_WIDTH,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    paddingTop: 18,
    paddingBottom: 18,
  },
  rightUnreadRailScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  rightUnreadItem: {
    alignItems: 'center',
    width: RIGHT_RAIL_WIDTH - 4,
  },
  rightUnreadAvatarWrap: {
    position: 'relative',
    padding: 1.5,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#EF4444',
  },
  rightUnreadAvatarWrapActive: {
    borderColor: '#0288D1',
  },
  rightUnreadAvatar: {
    width: 32,
    height: 32,
    borderRadius: 9,
  },
  rightUnreadCountPill: {
    position: 'absolute',
    top: -5,
    right: -6,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 3.5,
    borderRadius: 8.5,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightUnreadCountText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: 'bold',
  },
  rightUnreadName: {
    fontSize: 9.5,
    color: '#3F3F46',
    marginTop: 3,
    textAlign: 'center',
    width: RIGHT_RAIL_WIDTH - 6,
  },

  igHeaderContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
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
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  menuAlertDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  menuApplicantBadge: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#0288D1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuApplicantBadgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: 'bold',
  },

  accountPopoverMenu: {
    alignSelf: 'flex-end',
    marginRight: 14,
    marginBottom: 8,
    width: 224,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  accountPopoverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  accountPopoverName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#18181B',
  },
  accountPopoverEmail: {
    fontSize: 11,
    color: '#71717A',
    marginTop: 1,
  },
  accountPopoverActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  accountPopoverActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#18181B',
    flex: 1,
  },
  applicantCountPill: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  applicantCountPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0288D1',
  },
  incomingRequestBox: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  incomingRequestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  incomingRequesterName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
  },
  acceptMiniBtn: {
    backgroundColor: '#0288D1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  acceptMiniBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  rejectMiniBtn: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  rejectMiniBtnText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600',
  },

  igBrandDropdown: {
    alignSelf: 'center',
    width: 210,
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
  igDropdownDivider: { height: 1, backgroundColor: '#F2F2F2', marginHorizontal: 10 },

  memberFilterRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 2, paddingTop: 2, paddingBottom: 2 },
  memberFilterBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  memberFilterBtnOn: { backgroundColor: '#E4E4E7' },
  memberFilterText: { fontSize: 12, color: '#A1A1AA' },
  memberFilterTextOn: { color: '#27272A', fontWeight: '700' },
  igStoryBarContent: {
    paddingHorizontal: 2,
    paddingTop: 6,
    paddingBottom: 10,
    gap: STORY_GAP,
  },
  igStoryItem: {
    alignItems: 'center',
    width: STORY_ITEM_W,
  },
  igStoryAvatarWrap: {
    position: 'relative',
    marginBottom: 5,
  },
  igStoryRing: {
    padding: 2,
    borderRadius: STORY_RADIUS + 4,
    borderWidth: 1.5,
    borderColor: '#18181B',
    marginBottom: 5,
  },
  igStoryUnreadBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  igStoryUnreadText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '800' },
  igStoryRingOff: {
    borderColor: '#D4D4D8',
  },
  igStoryFriendBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  igStoryAvatar: {
    width: STORY_AVATAR,
    height: STORY_AVATAR,
    borderRadius: STORY_RADIUS,
  },
  igStoryPlusBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#18181B',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  igStoryName: {
    fontSize: 11,
    color: '#3F3F46',
    textAlign: 'center',
  },

  minimalPostCard: {
    backgroundColor: '#FFFFFF',
    paddingTop: 16,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  minimalPostHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
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
    borderRadius: 10,
  },
  igPostAuthorName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#18181B',
  },
  visibilityPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  visibilityPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  igPostDate: {
    fontSize: 11,
    color: '#A1A1AA',
    marginTop: 1,
  },
  igPostRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  friendActionChip: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendActionChipCompact: {
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  friendActionChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0288D1',
  },
  friendActionChipPending: {
    backgroundColor: '#FEF3C7',
  },
  friendActionChipPendingText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#B45309',
  },
  friendActionChipIncoming: {
    backgroundColor: '#0288D1',
  },
  friendActionChipIncomingText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  friendActionChipAccepted: {
    backgroundColor: '#F1F5F9',
  },
  friendActionChipAcceptedText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },

  visibilitySelectorRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  visibilitySelectChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  visibilitySelectChipActive: {
    backgroundColor: '#0288D1',
    borderColor: '#0288D1',
  },
  visibilitySelectText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  visibilitySelectTextActive: {
    color: '#FFFFFF',
  },

  compactImageWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactFeedImage: {
    borderRadius: 0,
    backgroundColor: '#FAFAFA',
  },
  minimalPostFooter: {
    paddingHorizontal: 8,
    paddingTop: 10,
  },
  minimalStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 6,
  },
  minimalStatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 2,
  },
  minimalStatCount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#18181B',
  },
  minimalPostCaption: {
    fontSize: 14,
    color: '#27272A',
    lineHeight: 20,
  },
  minimalCaptionAuthor: {
    fontWeight: '700',
    color: '#18181B',
  },

  viewerZoomLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000000', zIndex: 1250 },
  viewerZoomHint: { position: 'absolute', bottom: 40, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1260 },
  musicBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 8, marginTop: 6, marginBottom: 2, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: 'rgba(113,113,122,0.12)', borderWidth: 1, borderColor: 'rgba(113,113,122,0.25)' },
  musicTitle: { fontSize: 13, fontWeight: '700', color: '#27272A' },
  musicOwner: { fontSize: 11, color: '#71717A', marginTop: 1 },
  musicBtn: { padding: 6, marginLeft: 2 },
  musicMuteBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#3F3F46', alignItems: 'center', justifyContent: 'center', marginLeft: 4, marginRight: 2 },
  musicMarqueeBox: { flex: 1, height: 20, overflow: 'hidden', justifyContent: 'center', marginHorizontal: 4 },
  musicMarqueeText: { fontSize: 12, color: '#71717A', fontWeight: '600' },
  friendBgmFloatWrap: { position: 'absolute', top: 80, left: 0, right: 0, paddingHorizontal: 12 },
  pMusicBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1, borderColor: 'rgba(161,161,170,0.35)' },
  pMusicTitle: { fontSize: 13, fontWeight: '700', color: '#E4E4E7' },
  pMusicOwner: { fontSize: 11, color: '#A1A1AA', marginTop: 1 },
  pMusicMuteBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(63,63,70,0.6)', alignItems: 'center', justifyContent: 'center', marginLeft: 4, marginRight: 2 },
  friendBgmRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', maxWidth: '80%' },
  friendBgmText: { fontSize: 13, color: '#FFFFFF', marginLeft: 6, flexShrink: 1, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  bgmPickRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  bgmPickTitle: { flex: 1, fontSize: 14, color: '#3F3F46', marginRight: 8 },
  viewerCounter: { position: 'absolute', top: 24, right: 16, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 1220 },
  viewerCounterText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  viewerDotsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  viewerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)', marginRight: 5 },
  viewerDotOn: { backgroundColor: '#FFFFFF' },
  reactPickRow: { position: 'absolute', right: 52, bottom: 0, flexDirection: 'row', backgroundColor: 'rgba(30,30,34,0.96)', borderRadius: 30, paddingHorizontal: 6, paddingVertical: 6, width: 296 },
  reactPickItem: { width: 56, alignItems: 'center', paddingVertical: 4, borderRadius: 24 },
  reactPickItemOn: { backgroundColor: 'rgba(255,255,255,0.18)' },
  reactPickLabel: { color: '#FFFFFF', fontSize: 10, marginTop: 2 },
  viewerCmtWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 1230 },
  viewerCmtSheet: { backgroundColor: 'rgba(20,20,24,0.97)', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20 },
  viewerCmtShade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20 },
  viewerCmtHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  viewerCmtTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  viewerCmtEmpty: { color: '#A1A1AA', fontSize: 13, paddingVertical: 8 },
  viewerCmtItem: { color: '#FFFFFF', fontSize: 13.5, lineHeight: 19, marginBottom: 8 },
  viewerCmtInputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  viewerCmtInput: { flex: 1, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', paddingHorizontal: 16, paddingTop: 0, paddingBottom: 0, fontSize: 15, color: '#FFFFFF', textAlignVertical: 'center', includeFontPadding: false },
  viewerCmtSend: { marginLeft: 8, height: 44, minWidth: 68, paddingHorizontal: 14, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  viewerCmtSendText: { color: '#111111', fontSize: 15, fontWeight: '800' },
  fullscreenViewerRoot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    zIndex: 1200,
  },
  fullscreenBackBtn: {
    position: 'absolute',
    top: 18,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1220,
  },
  fullscreenBottomOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 48,
    paddingBottom: 28,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
    zIndex: 1210,
  },
  fullscreenAuthorMeta: {
    flex: 1,
    paddingRight: 16,
  },
  fullscreenAuthorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  fullscreenAuthorAvatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  fullscreenDefaultAvatar: {
    backgroundColor: '#3F3F46',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenAuthorName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  fullscreenSubMeta: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  fullscreenCaptionText: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 18,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  fullscreenRightActions: {
    alignItems: 'center',
    gap: 18,
  },
  fullscreenActionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 40,
    paddingVertical: 4,
  },
  fullscreenActionCount: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
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
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 12,
    gap: 10,
  },
  ktSelfBadge: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: '#BAE6FD',
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
  ktFriendAvatar: { width: 44, height: 44, borderRadius: 12 },
  ktFriendName: { fontSize: 14, fontWeight: '600', color: '#191919' },
  ktFriendBio: { fontSize: 12, color: '#888888', marginTop: 2 },

  memberPostsRoot: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#FFFFFF', zIndex: 50, paddingHorizontal: SIDE_MARGIN,
  },
  memberPostsHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 14, paddingBottom: 12,
  },
  memberPostsName: { fontSize: 16, fontWeight: '800', color: '#111111' },
  memberPostsCount: { fontSize: 12, fontWeight: '400', color: '#A1A1AA' },
  memberPostsAvatar: { width: 52, height: 52, borderRadius: 15, backgroundColor: '#F4F4F5' },
  memberPostsBio: { fontSize: 13, lineHeight: 19, color: '#3F3F46', marginTop: 2 },
  friendFullBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    zIndex: 999,
  },
  friendCardModal: {
    flex: 1,
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  friendCardCover: { width: '100%', backgroundColor: '#4A5568' },
  friendCardCoverOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'flex-end',
    padding: 12,
    paddingTop: 40,
  },
  friendCardCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  friendCardBody: { flex: 1, alignItems: 'center', padding: 20, paddingTop: 0, paddingBottom: 20 },
  friendCardAvatar: {
    width: 76,
    height: 76,
    borderRadius: 21,
    borderWidth: 3,
    borderColor: '#000000',
    marginTop: -38,
    marginBottom: 10,
  },
  friendCardName: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF' },
  friendCardBio: { fontSize: 13, color: '#BBBBBB', marginTop: 4, marginBottom: 18, textAlign: 'center' },
  friendCardActions: { flexDirection: 'row', gap: 6, width: '100%', marginTop: 'auto' },
  friendCardActionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  friendCardChatBtn: { backgroundColor: '#FEE500' },
  friendCardActionLabel: { fontSize: 11, color: '#EEEEEE' },
  friendCardBlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  friendCardBlockText: { fontSize: 13, color: '#F87171' },

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
    borderRadius: 17,
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

  cmtSheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  cmtSheet: { height: '40%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingBottom: 24 },
  cmtSheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#D4D4D8', marginTop: 8, marginBottom: 6 },
  cmtSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#F4F4F5', marginBottom: 10 },
  cmtSheetTitle: { fontSize: 17, fontWeight: '800', color: '#111111' },
  cmtSheetEmpty: { textAlign: 'center', color: '#A1A1AA', fontSize: 14, lineHeight: 22, marginTop: 16 },
  cmtSheetRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  cmtSheetAvatar: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F4F4F5' },
  cmtSheetName: { fontSize: 13, fontWeight: '700', color: '#111111' },
  cmtSheetDate: { fontSize: 11, fontWeight: '400', color: '#A1A1AA' },
  cmtSheetText: { fontSize: 15, color: '#27272A', lineHeight: 21, marginTop: 2 },
  cmtSheetInputRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 10, borderTopWidth: 1, borderColor: '#F4F4F5' },
  cmtSheetInput: { flex: 1, height: 46, borderRadius: 23, borderWidth: 1, borderColor: '#E4E4E7', backgroundColor: '#FAFAFA', paddingHorizontal: 16, paddingTop: 0, paddingBottom: 0, fontSize: 15, color: '#111111', textAlignVertical: 'center', includeFontPadding: false },
  cmtSheetSend: { marginLeft: 8, height: 46, minWidth: 72, paddingHorizontal: 14, borderRadius: 23, backgroundColor: '#3F3F46', alignItems: 'center', justifyContent: 'center' },
  cmtSheetSendText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  feedCommentOverlay: {
    position: 'absolute', right: 0, top: 0, bottom: 0, width: '52%',
    backgroundColor: 'rgba(0,0,0,0.62)', paddingHorizontal: 10, paddingTop: 8, paddingBottom: 8,
  },
  feedCommentInline: {
    marginHorizontal: 12, marginTop: 8, padding: 10, borderRadius: 10, backgroundColor: '#F3F4F6',
  },
  feedCommentHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6,
  },
  feedCommentTitle: { fontSize: 14, fontWeight: '700' },
  feedCommentInputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  feedCommentInput: {
    flex: 1, height: 46, borderRadius: 23, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 14,
    textAlignVertical: 'center',
    backgroundColor: '#FFFFFF', color: '#111111',
  },
  feedCommentSendBtn: { marginLeft: 6, paddingHorizontal: 10, height: 46, justifyContent: 'center' },
  feedCommentSendText: { color: '#60A5FA', fontWeight: '700', fontSize: 13 },
  gridItem: { width: GRID_ITEM_SIZE, height: GRID_ITEM_SIZE, margin: 0.6, backgroundColor: '#2D2D2D' },
  gridImage: { width: '100%', height: '100%' },
  gridAuthorChip: {
    position: 'absolute',
    top: 4,
    left: 4,
    maxWidth: '90%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingLeft: 2,
    paddingRight: 6,
    paddingVertical: 2,
    borderRadius: 7,
    zIndex: 2,
  },
  gridAuthorAvatar: { width: 16, height: 16, borderRadius: 5 },
  gridAuthorName: { color: '#FFFFFF', fontSize: 10, fontWeight: '700', flexShrink: 1 },
  gridVisBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  gridVisBadgeText: {
    color: '#FFFFFF',
    fontSize: 8.5,
    fontWeight: '600',
  },
  gridVisBadgeInline: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.14)',
    color: '#E2E8F0',
    fontSize: 9,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
    marginBottom: 3,
  },
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
  popupSmallAvatar: { width: 34, height: 34, borderRadius: 10 },
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
  commentSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  commentSectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#222222',
  },
  openCommentComposerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#F0F9FF',
  },
  openCommentComposerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0288D1',
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
    marginBottom: 6,
  },
  replyItemRow: {
    marginLeft: 18,
    backgroundColor: '#F1F5F9',
    borderLeftWidth: 2,
    borderLeftColor: '#CBD5E1',
  },
  commentTopMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  commentAuthorText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#01579B',
  },
  commentContentText: {
    fontSize: 14,
    color: '#222222',
    marginTop: 4,
    lineHeight: 20,
  },
  commentTimeText: {
    fontSize: 10,
    color: '#999999',
  },
  commentActionLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  commentActionLink: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  commentEditInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13.5,
    color: '#18181B',
  },

  commentComposerPanel: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  composerBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 7,
    paddingBottom: 4,
    backgroundColor: '#F8FAFC',
  },
  composerBannerText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#334155',
    flex: 1,
  },
  composerCloseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  composerCloseText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#52525B',
  },
  commentInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
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

  memberCardGroup: {
    marginBottom: 10,
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    overflow: 'hidden',
  },
  pinnedSelfCardGroup: {
    borderColor: '#7DD3FC',
    backgroundColor: '#F0F9FF',
  },
  memberCardGroupExpanded: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
  },
  memberRowActive: {
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  memberAvatar: { width: 44, height: 44, borderRadius: 12 },
  memberName: { fontSize: 14, fontWeight: 'bold', color: '#222' },
  memberBio: { fontSize: 12, color: '#777', marginTop: 2 },
  meBadge: { backgroundColor: '#BAE6FD', paddingHorizontal: 8, paddingVertical: 0, borderRadius: 6, marginLeft: -8 }, // 글자 시작이 다른 이름들과 같은 위치에 오도록
  meBadgeText: { color: '#075985' },
  unreadCounterBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadCounterBadgeText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: 'bold',
  },

  inlineChatDrawer: {
    backgroundColor: '#EAF2F8',
  },
  inlineChatDrawerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#E1ECF4',
    borderBottomWidth: 1,
    borderBottomColor: '#D4E2ED',
  },
  inlineChatDrawerLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
    flex: 1,
  },
  inlineChatCollapseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  inlineChatCollapseText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#52525B',
  },
  inlineChatHistoryScroll: {
    width: '100%',
  },
  inlineChatEmpty: {
    paddingVertical: 40,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  inlineChatEmptyText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
  inlineChatAvatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    marginBottom: 2,
  },

  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10, gap: 6 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowOther: { justifyContent: 'flex-start' },
  chatSenderName: { fontSize: 11, color: '#333', marginBottom: 3, marginLeft: 2 },
  bubbleBox: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  bubbleMine: { backgroundColor: '#FEE500', borderBottomRightRadius: 2 },
  bubbleSelf: { backgroundColor: '#BAE6FD' }, // 나와의 채팅(me) 말풍선: 하늘색
  bubbleOther: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 2 },
  bubbleText: { fontSize: 13.5, color: '#222', lineHeight: 19 },
  linkBubbleText: {
    color: '#0277BD',
    textDecorationLine: 'underline',
  },

  linkPreviewCard: {
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  linkPreviewThumb: {
    width: '100%',
    height: 110,
    backgroundColor: '#E2E8F0',
  },
  linkPreviewBody: {
    padding: 9,
  },
  linkPreviewDomainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 3,
  },
  linkPreviewDomain: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#0288D1',
    flex: 1,
  },
  linkPreviewTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 17,
  },
  linkPreviewDesc: {
    fontSize: 11,
    color: '#475569',
    marginTop: 3,
    lineHeight: 15,
  },
  linkPreviewTapHint: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 3,
  },

  chatPhotoBubble: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  chatBubbleImage: {
    width: 190,
    height: 190,
  },
  fileBubbleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 175,
  },
  fileIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileBubbleName: {
    fontSize: 12.5,
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
    fontSize: 10.5,
    fontWeight: 'bold',
    color: '#B45309',
    marginBottom: 1,
  },
  bubbleTime: { fontSize: 10, color: '#4A5568', marginBottom: 1 },

  inlineChatInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: '#CBD5E1',
    gap: 6,
  },
  chatPlusBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatPlusBtnActive: {
    backgroundColor: '#E2E8F0',
  },
  inlineChatTextInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
    fontSize: 13.5,
    maxHeight: 80,
  },
  inlineChatSendBtn: {
    backgroundColor: '#0288D1',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
  },
  inlineChatSendText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },

  inlineAttachDrawer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 24,
  },
  attachDrawerItem: {
    alignItems: 'center',
    gap: 6,
  },
  attachDrawerIconBox: {
    width: 48,
    height: 48,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachDrawerLabel: {
    fontSize: 11.5,
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
  avatarPreview: { width: 64, height: 64, borderRadius: 18 },
  pickerLinkText: { color: '#0288D1', fontWeight: 'bold', fontSize: 14 },
  modalInput: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 12, fontSize: 14, backgroundColor: '#FAFAFA' },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalCancelBtn: { flex: 1, padding: 13, borderRadius: 8, backgroundColor: '#EEE', alignItems: 'center' },
  modalCancelText: { color: '#555', fontWeight: 'bold' },
  modalSaveBtn: { flex: 1, padding: 13, borderRadius: 8, backgroundColor: '#0288D1', alignItems: 'center' },
  modalSaveText: { color: '#FFFFFF', fontWeight: 'bold' },

  postThumbWrap: { width: 78, height: 78, marginRight: 8 },
  postThumb: { width: 78, height: 78, borderRadius: 8, backgroundColor: '#EEE' },
  postThumbNum: { position: 'absolute', left: 4, bottom: 4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  postThumbNumText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  postThumbDel: { position: 'absolute', top: 3, right: 3, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  feedDotsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 20 },
  feedDot: { borderRadius: 5, marginHorizontal: 2.5 },
  writePreviewImg: { width: '100%', height: 220, borderRadius: 8, backgroundColor: '#F5F5F5' },
  removePhotoBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', marginTop: 6, padding: 6, backgroundColor: '#EEE', borderRadius: 4 },
  aiSuggestBtn: { padding: 11, borderRadius: 8, backgroundColor: '#F3E8FF', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  aiSuggestBtnText: { color: '#6D28D9', fontWeight: 'bold', fontSize: 14 },
  aiErrorText: { color: '#B91C1C', fontSize: 12, marginBottom: 8, textAlign: 'center' },
  aiSuggestItem: { padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#DDD6FE', backgroundColor: '#FAF5FF', marginBottom: 6 },
  aiSuggestItemText: { color: '#3B0764', fontSize: 13, lineHeight: 19 },
  attachPhotoBtn: { flexDirection: 'row', gap: 6, padding: 14, borderRadius: 8, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DDD' },
});