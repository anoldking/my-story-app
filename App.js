import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  FlatList, Image, ImageBackground, Alert, SafeAreaView,
  ActivityIndicator, ScrollView, Dimensions, KeyboardAvoidingView, Modal,
  Platform, BackHandler, ToastAndroid, Linking, PanResponder
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import GroupChat, { ensureGroupChannel } from './GroupChat';
import * as ImageManipulator from 'expo-image-manipulator';
import * as DocumentPicker from 'expo-document-picker';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const LEFT_RAIL_WIDTH = 52;
const RIGHT_RAIL_WIDTH = 52;
const LAST_EMAIL_STORAGE_KEY = '@me_last_login_email';
const getWindowWidth = () => Dimensions.get('window').width;
const getWindowHeight = () => Dimensions.get('window').height;
const SCREEN_WIDTH = getWindowWidth();
const SCREEN_HEIGHT = getWindowHeight();
const CONTENT_WIDTH = Math.max(240, SCREEN_WIDTH - LEFT_RAIL_WIDTH);
const COVER_HEIGHT = Math.round(CONTENT_WIDTH * (4 / 3));
const GRID_ITEM_SIZE = (CONTENT_WIDTH - 4) / 3;
const FEED_MEDIA_WIDTH = Math.max(200, CONTENT_WIDTH - RIGHT_RAIL_WIDTH);
const FEED_MEDIA_MAX_HEIGHT = Math.round(SCREEN_HEIGHT * 0.44)
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

// 피드 화면용: 한 화면 안에 깔끔하게 들어오는 사이즈로 표시
const CompactFeedImage = ({ uri, onPress }) => {
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

  const targetHeight = Math.min(
    FEED_MEDIA_MAX_HEIGHT,
    Math.max(170, Math.round(FEED_MEDIA_WIDTH / (aspectRatio || 1)))
  );

  return (
    <TouchableOpacity activeOpacity={0.94} onPress={onPress} style={styles.compactImageWrap}>
      <Image
        source={{ uri }}
        style={[styles.compactFeedImage, { width: FEED_MEDIA_WIDTH, height: targetHeight }]}
        resizeMode="cover"
      />
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
  const winWidth = getWindowWidth();
  const winHeight = getWindowHeight();

  useEffect(() => {
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
              {!isReply && (
                <TouchableOpacity onPress={() => openReplyComposer(c)}>
                  <Text style={styles.commentActionLink}>답글</Text>
                </TouchableOpacity>
              )}
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
          <View style={{ flexDirection: 'row', gap: 6, marginRight: 8 }}>
            <TouchableOpacity
              style={styles.whitePopupMiniBtn}
              onPress={() => {
                setEditValue(post.content || '');
                setEditVisibility(post.visibility || 'public');
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
                const children = repliesByParent[String(c.id)] || [];
                return (
                  <View key={String(c.id)} style={{ marginBottom: 4 }}>
                    {renderCommentRow(c, false)}
                    {children.map((reply) => renderCommentRow(reply, true))}
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
  const [showGroupChat, setShowGroupChat] = useState(false);
  const [session, setSession] = useState(null);
  const [isSignUpScreen, setIsSignUpScreen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  const [mainTab, setMainTab] = useState('home');
  const [brandMenuOpen, setBrandMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
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
  const [friendRelationMap, setFriendRelationMap] = useState({});
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [friendsSectionOpen, setFriendsSectionOpen] = useState(true);
  const [selectedFriend, setSelectedFriend] = useState(null);

  const [posts, setPosts] = useState([]);
  const [writeModalVisible, setWriteModalVisible] = useState(false);
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [imageUri, setImageUri] = useState(null);
  const [loading, setLoading] = useState(false);

  const [commentsByPost, setCommentsByPost] = useState({});

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
  const inlineChatScrollRef = useRef(null);

  const lastBackPressRef = useRef(0);

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
      registerPushTokenForUser(session.user.id);
      ensureGroupChannel();
      fetchFriendsAndRequests();
      fetchUnreadCountsBySender(session.user.id);
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
    const { data: memberData } = await supabase
      .from('profiles')
      .select('id, nickname, bio, avatar_url, cover_url')
      .order('nickname', { ascending: true });

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

  const renderFriendStatusActionButton = (targetUserId, compact = false) => {
    const myId = session.user.id;
    if (!targetUserId || targetUserId === myId) return null;

    const rel = friendRelationMap[targetUserId];
    if (!rel) {
      return (
        <TouchableOpacity
          style={[styles.friendActionChip, compact && styles.friendActionChipCompact]}
          onPress={() => sendFriendRequest(targetUserId)}
        >
          <Text style={styles.friendActionChipText}>친구신청</Text>
        </TouchableOpacity>
      );
    }

    if (rel.status === 'accepted') {
      return (
        <TouchableOpacity
          style={[styles.friendActionChip, styles.friendActionChipAccepted, compact && styles.friendActionChipCompact]}
          onPress={() => cancelOrRemoveFriend(targetUserId)}
        >
          <Text style={styles.friendActionChipAcceptedText}>친구됨</Text>
        </TouchableOpacity>
      );
    }

    if (rel.addressee_id === myId) {
      return (
        <TouchableOpacity
          style={[styles.friendActionChip, styles.friendActionChipIncoming, compact && styles.friendActionChipCompact]}
          onPress={() => acceptFriendRequest(rel.id, targetUserId)}
        >
          <Text style={styles.friendActionChipIncomingText}>신청수락</Text>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        style={[styles.friendActionChip, styles.friendActionChipPending, compact && styles.friendActionChipCompact]}
        onPress={() => cancelOrRemoveFriend(targetUserId)}
      >
        <Text style={styles.friendActionChipPendingText}>신청중</Text>
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
        visibility: visibility || 'public',
      });

      setLoading(false);
      if (error) {
        showAlert('등록 실패', getKoreanErrorMessage(error));
      } else {
        setContent('');
        setImageUri(null);
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

  const visiblePosts = posts.filter(isPostVisibleToMe);
  const otherMembers = members.filter((m) => m.id !== session.user.id);
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
              {onlyFavoritesFeed ? '친구공개 필터 끄기 (전체 보기)' : '친구공개 모아보기'}
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
            setAccountMenuOpen(false);
            setImageUri(null);
            setContent('');
            setVisibility('public');
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
              setAccountMenuOpen(false);
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
    const isLikedByMe = Boolean(item.reactions?.some((x) => x.user_id === session.user.id));
    const totalReactions = item.reactions?.length || 0;
    const postComments = commentsByPost[String(item.id)] || [];
    const authorName = item.profiles?.nickname || profile.nickname || '친구';
    const authorAvatar = item.profiles?.avatar_url || null;
    const dateText = new Date(item.created_at).toLocaleString('ko-KR');

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

        {item.image_urls?.[0] && (
          <CompactFeedImage
            uri={item.image_urls[0]}
            onPress={() =>
              setViewingImage({
                uri: item.image_urls[0],
                postId: item.id,
                authorId: item.author_id,
                authorName,
                avatarUrl: authorAvatar,
                dateText,
                caption: item.content || '',
                likeCount: totalReactions,
                isLikedByMe,
              })
            }
          />
        )}

        <View style={styles.minimalPostFooter}>
          <View style={styles.minimalStatsRow}>
            <TouchableOpacity
              style={styles.minimalStatBtn}
              activeOpacity={0.75}
              onPress={() => toggleReaction(item.id, 'like')}
            >
              <Ionicons
                name={isLikedByMe ? 'heart' : 'heart-outline'}
                size={20}
                color={isLikedByMe ? '#E11D48' : '#18181B'}
              />
              <Text style={[styles.minimalStatCount, isLikedByMe && { color: '#E11D48', fontWeight: '700' }]}>
                {totalReactions}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.minimalStatBtn}
              activeOpacity={0.75}
              onPress={() => setSelectedPostId(item.id)}
            >
              <Ionicons name="chatbubble-outline" size={19} color="#18181B" />
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
        <View style={styles.ktSearc
