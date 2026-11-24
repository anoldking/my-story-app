import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  KeyboardAvoidingView,
  Alert,
  StyleSheet,
  Image,
  Modal,
  Linking,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { Text, TextInput } from './fonts';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons, themedStyles, hapticTap } from './theme';
import GalleryPicker from './GalleryPicker';
import StickerPanel, { getSticker, STICKER_LABEL, StickerBubbleImage } from './StickerPanel';

// 단체방 알림음 설정 화면 열기 (안드로이드 알림 채널 설정)
async function openGroupSound() {
  if (Platform.OS !== 'android') { Linking.openSettings(); return; }
  try {
    await Notifications.setNotificationChannelAsync('messages_group', {
      name: '단체방 새 메시지 알림 (전용음)',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'mimi_up.wav',
      vibrationPattern: [0, 250, 250, 250],
    });
    await Linking.sendIntent('android.settings.CHANNEL_NOTIFICATION_SETTINGS', [
      { key: 'android.provider.extra.APP_PACKAGE', value: 'com.anoldking.mystoryapp' },
      { key: 'android.provider.extra.CHANNEL_ID', value: 'messages_group' },
    ]);
  } catch (e) { Linking.openSettings(); }
}

function hhmm(iso) {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export default function GroupRoom({ supabase, me, room, onBack, onLeft, onInvite }) {
  const [messages, setMessages] = useState([]);
  const [reads, setReads] = useState({}); // 멤버별 마지막으로 읽은 시간 { user_id: last_read_at }
  const [names, setNames] = useState({});
  const [avatars, setAvatars] = useState({});
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewingImage, setViewingImage] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeDraft, setNoticeDraft] = useState('');
  const [noticeSaving, setNoticeSaving] = useState(false);
  const [noticeExpanded, setNoticeExpanded] = useState(false);
  const listRef = useRef(null);

  // 공지 불러오기
  const loadNotice = useCallback(async () => {
    const { data } = await supabase.from('chat_rooms').select('notice').eq('id', room.id).maybeSingle();
    setNotice((data && data.notice) || '');
  }, [supabase, room.id]);

  useEffect(() => { loadNotice(); }, [loadNotice]);

  const openNoticeEditor = () => {
    setSettingsOpen(false);
    setNoticeDraft(notice);
    setNoticeOpen(true);
  };

  const saveNotice = async (value) => {
    setNoticeSaving(true);
    const v = (value || '').trim();
    const { error } = await supabase.from('chat_rooms').update({ notice: v || null }).eq('id', room.id);
    setNoticeSaving(false);
    if (error) { Alert.alert('공지 저장 실패', error.message); return; }
    setNotice(v);
    setNoticeOpen(false);
  };

  // 멤버들의 '마지막으로 읽은 시간' 불러오기 (안 읽은 사람 수 계산용)
  const loadReads = useCallback(async () => {
    const r = await supabase.from('chat_room_members').select('user_id, last_read_at').eq('room_id', room.id);
    if (r.data) {
      const map = {};
      r.data.forEach((m) => { map[m.user_id] = m.last_read_at; });
      setReads(map);
    }
  }, [supabase, room.id]);

  const markRead = useCallback(() => {
    const nowIso = new Date().toISOString();
    setReads((prev) => ({ ...prev, [me]: nowIso }));
    supabase
      .from('chat_room_members')
      .update({ last_read_at: nowIso })
      .eq('room_id', room.id)
      .eq('user_id', me)
      .then(() => {});
  }, [supabase, room.id, me]);

  const addMessage = useCallback((m) => {
    setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const mem = await supabase
        .from('chat_room_members').select('user_id, last_read_at').eq('room_id', room.id);
      const ids = (mem.data || []).map((r) => r.user_id);
      if (alive && mem.data) {
        const rmap = {};
        mem.data.forEach((m) => { rmap[m.user_id] = m.last_read_at; });
        setReads(rmap);
      }
      if (ids.length) {
        const pr = await supabase.from('profiles').select('id, nickname, avatar_url').in('id', ids);
        if (alive && pr.data) {
          const map = {};
          const amap = {};
          pr.data.forEach((p) => { map[p.id] = p.nickname; amap[p.id] = p.avatar_url; });
          setNames(map);
          setAvatars(amap);
        }
      }
      const res = await supabase
        .from('group_messages').select('*')
        .eq('room_id', room.id)
        .order('created_at', { ascending: true })
        .limit(300);
      if (res.error) Alert.alert('메시지 오류', res.error.message);
      else if (alive) setMessages(res.data || []);
      markRead();
    })();

    const ch = supabase
      .channel(`gm_${room.id}_${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `room_id=eq.${room.id}` },
        (payload) => { addMessage(payload.new); markRead(); }
      )
      // 다른 멤버가 읽으면 숫자가 바로 줄어들게
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_room_members', filter: `room_id=eq.${room.id}` },
        (payload) => {
          const n = payload.new;
          if (n && n.user_id) setReads((prev) => ({ ...prev, [n.user_id]: n.last_read_at }));
        }
      )
      .subscribe();

    // 실시간 연결이 안 될 때를 대비해 15초마다 한 번 다시 확인
    const timer = setInterval(() => { if (alive) loadReads(); }, 15000);

    return () => { alive = false; clearInterval(timer); supabase.removeChannel(ch); };
  }, [supabase, room.id, addMessage, markRead, loadReads]);

  // 이 메시지를 아직 안 읽은 멤버 수 (보낸 사람 제외)
  const unreadCountOf = (item) => {
    const t = Date.parse(item.created_at);
    let n = 0;
    Object.keys(reads).forEach((uid) => {
      if (uid === item.sender_id) return;
      const r = reads[uid] ? Date.parse(reads[uid]) : 0;
      if (!r || r < t) n += 1;
    });
    return n;
  };

  // 메시지 한 건 저장 + 푸시 요청 (글, 사진, 파일 공통)
  const postMessage = async (fields) => {
    const { data, error } = await supabase
      .from('group_messages')
      .insert({ room_id: room.id, sender_id: me, content: '', ...fields })
      .select()
      .single();
    if (error) return { error };
    addMessage(data);
    supabase.functions.invoke('send-group-push', { body: { messageId: data.id } }).then(() => {});
    return { data };
  };

  const send = async () => {
    hapticTap();
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    const { error } = await postMessage({ content: t });
    setSending(false);
    if (error) { Alert.alert('전송 실패', error.message); return; }
    setText('');
  };

  // 사진 1장 업로드 + 메시지 저장
  const uploadPhotoUri = async (uri, original) => {
    // 원본으로 보내기: 크기 그대로 + 최고 품질 / 아니면 가로 1080px, 품질 0.8
    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      original ? [] : [{ resize: { width: 1080 } }],
      { compress: original ? 1 : 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );
    const path = `${me}/group_photo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`;
    const response = await fetch(manipulated.uri);
    const buf = await response.arrayBuffer();
    const up = await supabase.storage
      .from('chat-files')
      .upload(path, buf, { contentType: 'image/jpeg', upsert: true });
    if (up.error) throw up.error;
    const { data: urlData } = supabase.storage.from('chat-files').getPublicUrl(path);
    const { error } = await postMessage({ content: '(사진)', image_url: urlData.publicUrl });
    if (error) throw error;
  };

  // "사진 올리기" → 갤러리 선택 화면 열기
  const sendPhoto = () => {
    if (sending) return;
    setMenuOpen(false);
    setGalleryOpen(true);
  };

  // 갤러리에서 고른 사진들 전송
  const sendPhotos = async (assets, opts) => {
    const sendOriginal = !!(opts && opts.original);
    setGalleryOpen(false);
    if (!assets || !assets.length) return;
    setSending(true);
    let fail = 0;
    let lastMsg = '';
    for (const a of assets) {
      try {
        let uri = a.uri;
        try {
          const info = await MediaLibrary.getAssetInfoAsync(a);
          if (info && info.localUri) uri = info.localUri;
        } catch (e) { /* 원래 uri 사용 */ }
        await uploadPhotoUri(uri, sendOriginal);
      } catch (e) {
        fail += 1;
        lastMsg = e && e.message ? e.message : String(e);
      }
    }
    setSending(false);
    if (fail > 0) Alert.alert('사진 전송 오류', `${fail}장을 보내지 못했습니다.\n(${lastMsg})`);
  };

  const sendSticker = async (url) => {
    if (sending) return;
    const { error } = await postMessage({ content: STICKER_LABEL, sticker_url: url });
    if (error) Alert.alert('이모티콘 전송 실패', error.message);
  };

  const sendFile = async () => {
    if (sending) return;
    setMenuOpen(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled || !result.assets || !result.assets[0]) return;
      const picked = result.assets[0];
      const originalName = picked.name || '첨부파일';
      const mimeType = picked.mimeType || 'application/octet-stream';
      const extMatch = originalName.match(/\.([a-zA-Z0-9]+)$/);
      const ext = extMatch ? extMatch[1] : 'bin';
      const path = `${me}/group_file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
      setSending(true);
      const response = await fetch(picked.uri);
      const buf = await response.arrayBuffer();
      const up = await supabase.storage
        .from('chat-files')
        .upload(path, buf, { contentType: mimeType, upsert: true });
      if (up.error) throw up.error;
      const { data: urlData } = supabase.storage.from('chat-files').getPublicUrl(path);
      const { error } = await postMessage({ content: '(파일) ' + originalName, file_url: urlData.publicUrl, file_name: originalName });
      setSending(false);
      if (error) Alert.alert('파일 전송 실패', error.message);
    } catch (e) {
      setSending(false);
      Alert.alert('파일 첨부 오류', '파일을 첨부하지 못했습니다.\n(' + (e && e.message ? e.message : e) + ')');
    }
  };

  const openUrl = (url) => {
    if (!url) return;
    Linking.openURL(url).catch(() => Alert.alert('열기 실패', '파일을 열 수 없습니다.'));
  };

  const leaveRoom = () => {
    Alert.alert('방 나가기', `"${room.name}" 방에서 나갈까요?\n나가면 대화 내용을 다시 볼 수 없어요.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '나가기',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('chat_room_members')
            .delete()
            .eq('room_id', room.id)
            .eq('user_id', me);
          if (error) { Alert.alert('나가기 실패', error.message); return; }
          if (onLeft) onLeft(); else onBack();
        },
      },
    ]);
  };

  const renderBody = (item, mine) => {
    if (getSticker(item)) {
      return <StickerBubbleImage url={getSticker(item)} />;
    }
    if (item.image_url) {
      return (
        <TouchableOpacity activeOpacity={0.85} onPress={() => setViewingImage(item.image_url)}>
          <Image source={{ uri: item.image_url }} style={s.photo} resizeMode="cover" />
        </TouchableOpacity>
      );
    }
    if (item.file_url) {
      return (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => openUrl(item.file_url)}
          style={[s.bubble, mine ? s.bubbleMine : s.bubbleOther, s.fileBubble]}
        >
          <Ionicons name="attach" size={18} color={mine ? '#FFFFFF' : '#3F3F46'} />
          <View style={{ flexShrink: 1, marginLeft: 6 }}>
            <Text style={mine ? s.textMine : s.textOther} numberOfLines={2}>{item.file_name || '첨부파일'}</Text>
            <Text style={[s.fileHint, mine && { color: '#E4E4E7' }]}>터치하여 열기 / 저장</Text>
          </View>
        </TouchableOpacity>
      );
    }
    return (
      <View style={[s.bubble, mine ? s.bubbleMine : s.bubbleOther]}>
        <Text style={mine ? s.textMine : s.textOther}>{item.content}</Text>
      </View>
    );
  };

  const renderItem = ({ item }) => {
    const mine = item.sender_id === me;
    if (mine) {
      return (
        <View style={[s.msgRow, s.rowMine]}>
          <View style={[s.bubbleLine, { flexDirection: 'row-reverse' }]}>
            {renderBody(item, true)}
            <View style={{ alignItems: 'flex-end' }}>
              {unreadCountOf(item) > 0 ? <Text style={s.unreadNum}>{unreadCountOf(item)}</Text> : null}
              <Text style={s.time}>{hhmm(item.created_at)}</Text>
            </View>
          </View>
        </View>
      );
    }
    const av = avatars[item.sender_id];
    return (
      <View style={s.otherRow}>
        {av ? (
          <Image source={{ uri: av }} style={s.avatar} />
        ) : (
          <View style={[s.avatar, s.avatarDefault]}>
            <Ionicons name="person" size={16} color="#A1A1AA" />
          </View>
        )}
        <View style={[s.msgRow, s.rowOther, { marginBottom: 0, marginLeft: 8, flexShrink: 1 }]}>
          <Text style={s.name}>{names[item.sender_id] || '알 수 없음'}</Text>
          <View style={s.bubbleLine}>
            {renderBody(item, false)}
            <View style={{ alignItems: 'flex-start' }}>
              {unreadCountOf(item) > 0 ? <Text style={s.unreadNum}>{unreadCountOf(item)}</Text> : null}
              <Text style={s.time}>{hhmm(item.created_at)}</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.wrap}>
      <View style={s.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={s.link}>〈 뒤로</Text>
        </TouchableOpacity>
        <Text style={s.title} numberOfLines={1}>{room.name}</Text>
        <View style={s.headerRight}>
          <TouchableOpacity onPress={() => setSettingsOpen(true)} hitSlop={8} style={{ marginRight: 14 }}>
            <Ionicons name="settings-outline" size={21} color="#3F3F46" />
          </TouchableOpacity>
          <TouchableOpacity onPress={leaveRoom}>
            <Text style={s.leaveText}>나가기</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 공지: 단체방 맨 위 고정 */}
      {notice ? (
        <TouchableOpacity activeOpacity={0.85} style={s.noticeBar} onPress={() => setNoticeExpanded(!noticeExpanded)}>
          <Ionicons name="megaphone-outline" size={16} color="#FFFFFF" />
          <Text style={s.noticeText} numberOfLines={noticeExpanded ? 0 : 1}>{notice}</Text>
          <Ionicons name={noticeExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#FFFFFF" />
        </TouchableOpacity>
      ) : null}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <FlatList
          ref={listRef}
          data={[...messages].reverse()}
          extraData={reads}
          inverted
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12 }}
        />
        {/* 메시지가 없을 때 안내: 뒤집힌 목록 밖에 따로 띄워서 글자가 거꾸로 보이지 않게 함 */}
        {messages.length === 0 ? (
          <View pointerEvents="none" style={s.emptyWrap}>
            <Text style={s.emptyText}>첫 메시지를 보내 보세요.</Text>
          </View>
        ) : null}
        <View style={s.inputBar}>
          <TouchableOpacity
            style={[s.plusBtn, menuOpen && s.plusBtnOn]}
            onPress={() => setMenuOpen(!menuOpen)}
            disabled={sending}
          >
            <Ionicons name={menuOpen ? 'close' : 'add'} size={22} color="#3F3F46" />
          </TouchableOpacity>
          <TextInput
            style={s.input}
            value={text}
            onChangeText={setText}
            onFocus={() => { setMenuOpen(false); setStickerOpen(false); }}
            placeholder="메시지 입력"
            placeholderTextColor="#A1A1AA"
            multiline
          />
          <TouchableOpacity style={s.sendBtn} onPress={send} disabled={sending}>
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.sendText}>보내기</Text>}
          </TouchableOpacity>
        </View>
        {menuOpen ? (
          <View style={s.menu}>
            <TouchableOpacity style={s.menuItem} onPress={sendPhoto}>
              <View style={s.menuIcon}>
                <Ionicons name="image-outline" size={22} color="#fff" />
              </View>
              <Text style={s.menuLabel}>사진 올리기</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.menuItem} onPress={() => { setMenuOpen(false); setStickerOpen(true); }}>
              <View style={s.menuIcon}>
                <Ionicons name="happy-outline" size={22} color="#fff" />
              </View>
              <Text style={s.menuLabel}>이모티콘</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.menuItem} onPress={sendFile}>
              <View style={s.menuIcon}>
                <Ionicons name="document-attach-outline" size={22} color="#fff" />
              </View>
              <Text style={s.menuLabel}>파일 첨부</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {stickerOpen ? (
          <StickerPanel supabase={supabase} onPick={sendSticker} onClose={() => setStickerOpen(false)} />
        ) : null}
      </KeyboardAvoidingView>

      {/* 방 설정: 초대 / 공지 / 알림음 */}
      <Modal visible={settingsOpen} transparent animationType="fade" onRequestClose={() => setSettingsOpen(false)}>
        <TouchableOpacity style={s.sheetBackdrop} activeOpacity={1} onPress={() => setSettingsOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={s.sheet}>
            <Text style={s.sheetTitle}>방 설정</Text>
            <TouchableOpacity
              style={s.sheetRow}
              onPress={() => { setSettingsOpen(false); if (onInvite) onInvite(); }}
            >
              <Ionicons name="person-add-outline" size={20} color="#3F3F46" />
              <Text style={s.sheetRowText}>초대</Text>
              <Ionicons name="chevron-forward" size={18} color="#A1A1AA" />
            </TouchableOpacity>
            <TouchableOpacity style={s.sheetRow} onPress={openNoticeEditor}>
              <Ionicons name="megaphone-outline" size={20} color="#3F3F46" />
              <Text style={s.sheetRowText}>공지</Text>
              <Text style={s.sheetRowSub} numberOfLines={1}>{notice ? '등록됨' : '없음'}</Text>
              <Ionicons name="chevron-forward" size={18} color="#A1A1AA" />
            </TouchableOpacity>
            <TouchableOpacity style={s.sheetRow} onPress={() => { setSettingsOpen(false); openGroupSound(); }}>
              <Ionicons name="notifications-outline" size={20} color="#3F3F46" />
              <Text style={s.sheetRowText}>알림음</Text>
              <Ionicons name="chevron-forward" size={18} color="#A1A1AA" />
            </TouchableOpacity>
            <TouchableOpacity style={s.sheetClose} onPress={() => setSettingsOpen(false)}>
              <Text style={s.sheetCloseText}>닫기</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={noticeOpen} transparent animationType="fade" onRequestClose={() => setNoticeOpen(false)}>
        <KeyboardAvoidingView style={s.sheetBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>공지</Text>
            <TextInput
              style={s.noticeInput}
              value={noticeDraft}
              onChangeText={setNoticeDraft}
              placeholder="방 맨 위에 고정할 공지를 입력하세요"
              placeholderTextColor="#A1A1AA"
              multiline
            />
            <View style={s.noticeBtnRow}>
              {notice ? (
                <TouchableOpacity style={[s.grayBtn, s.grayBtnLight]} onPress={() => saveNotice('')} disabled={noticeSaving}>
                  <Text style={s.grayBtnLightText}>공지 내리기</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={[s.grayBtn, s.grayBtnLight]} onPress={() => setNoticeOpen(false)} disabled={noticeSaving}>
                <Text style={s.grayBtnLightText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.grayBtn} onPress={() => saveNotice(noticeDraft)} disabled={noticeSaving}>
                {noticeSaving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={s.grayBtnText}>저장</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <GalleryPicker visible={galleryOpen} onClose={() => setGalleryOpen(false)} onSend={sendPhotos} originalOption />

      <Modal visible={!!viewingImage} transparent animationType="fade" onRequestClose={() => setViewingImage(null)}>
        <View style={s.viewer}>
          <TouchableOpacity style={s.viewerClose} onPress={() => setViewingImage(null)}>
            <Ionicons name="close" size={30} color="#fff" />
          </TouchableOpacity>
          {viewingImage ? <Image source={{ uri: viewingImage }} style={s.viewerImg} resizeMode="contain" /> : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = themedStyles({
  wrap: { flex: 1, backgroundColor: '#fff', paddingTop: 30 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#eee',
  },
  title: { fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center', color: '#111111' },
  link: { fontSize: 16, color: '#3F3F46', width: 110 },
  leaveText: { color: '#3F3F46', fontSize: 15, fontWeight: '600' },
  headerRight: { width: 110, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  empty: { textAlign: 'center', marginTop: 60, color: '#A1A1AA' },
  emptyWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 70, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#A1A1AA', fontSize: 14 },
  msgRow: { marginBottom: 10, maxWidth: '85%' },
  rowMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  rowOther: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  name: { fontSize: 12, color: '#71717A', marginBottom: 2, marginLeft: 2 },
  otherRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, maxWidth: '92%', alignSelf: 'flex-start' },
  avatar: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#E5E7EB' },
  avatarDefault: { alignItems: 'center', justifyContent: 'center' },
  bubbleLine: { flexDirection: 'row', alignItems: 'flex-end' },
  bubble: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14, maxWidth: '100%', flexShrink: 1 },
  bubbleMine: { backgroundColor: '#52525B' },
  bubbleOther: { backgroundColor: '#EEEEEE' },
  textMine: { color: '#FFFFFF', fontSize: 16 },
  textOther: { color: '#111111', fontSize: 16 },
  time: { fontSize: 11, color: '#A1A1AA', marginHorizontal: 6 },
  unreadNum: { fontSize: 11, fontWeight: '800', color: '#3F3F46', marginHorizontal: 6, marginBottom: 1 }, // 안 읽은 사람 수
  photo: { width: 200, height: 200, borderRadius: 14, backgroundColor: '#eee' },
  fileBubble: { flexDirection: 'row', alignItems: 'center' },
  fileHint: { fontSize: 11, color: '#71717A', marginTop: 2 },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', padding: 8, paddingBottom: 28,
    borderTopWidth: 1, borderColor: '#eee', backgroundColor: '#fff',
  },
  plusBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center', marginRight: 8,
  },
  plusBtnOn: { backgroundColor: '#E5E7EB' },
  input: {
    flex: 1, maxHeight: 120, borderWidth: 1, borderColor: '#ddd',
    borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, fontSize: 16, color: '#111111',
  },
  sendBtn: { marginLeft: 8, backgroundColor: '#3F3F46', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10, minWidth: 64, alignItems: 'center' },
  sendText: { color: '#FFFFFF', fontWeight: '700' },
  menu: {
    flexDirection: 'row', paddingHorizontal: 24, paddingVertical: 18, paddingBottom: 30,
    backgroundColor: '#F9FAFB', borderTopWidth: 1, borderColor: '#eee',
  },
  menuItem: { alignItems: 'center', marginRight: 32 },
  menuIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: '#52525B' },
  menuLabel: { marginTop: 6, fontSize: 12, color: '#3F3F46' },
  noticeBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 10, marginTop: 8, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12, backgroundColor: '#52525B',
  },
  noticeText: { flex: 1, color: '#FFFFFF', fontSize: 14, lineHeight: 20 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 30 },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: '#111111', marginBottom: 8 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderColor: '#F4F4F5' },
  sheetRowText: { flex: 1, fontSize: 16, color: '#111111', marginLeft: 12 },
  sheetRowSub: { fontSize: 13, color: '#A1A1AA', marginRight: 6 },
  sheetClose: { marginTop: 14, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: '#F4F4F5' },
  sheetCloseText: { fontSize: 15, color: '#3F3F46', fontWeight: '700' },
  noticeInput: {
    minHeight: 100, maxHeight: 200, borderWidth: 1, borderColor: '#E4E4E7', borderRadius: 12,
    padding: 12, fontSize: 15, color: '#111111', textAlignVertical: 'top',
  },
  noticeBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
  grayBtn: { backgroundColor: '#3F3F46', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, minWidth: 64, alignItems: 'center' },
  grayBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  grayBtnLight: { backgroundColor: '#F4F4F5' },
  grayBtnLightText: { color: '#3F3F46', fontWeight: '700', fontSize: 14 },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  viewerImg: { width: '100%', height: '80%' },
  viewerClose: { position: 'absolute', top: 44, right: 20, zIndex: 2, padding: 6 },
});
