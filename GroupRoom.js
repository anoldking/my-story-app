import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, TextInput, SafeAreaView,
  KeyboardAvoidingView, Alert, StyleSheet, Image, Modal, Linking, ActivityIndicator,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';

function hhmm(iso) {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export default function GroupRoom({ supabase, me, room, onBack, onLeft, onInvite }) {
  const [messages, setMessages] = useState([]);
  const [names, setNames] = useState({});
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewingImage, setViewingImage] = useState(null);
  const listRef = useRef(null);

  const markRead = useCallback(() => {
    supabase
      .from('chat_room_members')
      .update({ last_read_at: new Date().toISOString() })
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
        .from('chat_room_members').select('user_id').eq('room_id', room.id);
      const ids = (mem.data || []).map((r) => r.user_id);
      if (ids.length) {
        const pr = await supabase.from('profiles').select('id, nickname').in('id', ids);
        if (alive && pr.data) {
          const map = {};
          pr.data.forEach((p) => { map[p.id] = p.nickname; });
          setNames(map);
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
      .subscribe();

    return () => { alive = false; supabase.removeChannel(ch); };
  }, [supabase, room.id, addMessage, markRead]);

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
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    const { error } = await postMessage({ content: t });
    setSending(false);
    if (error) { Alert.alert('전송 실패', error.message); return; }
    setText('');
  };

  const sendPhoto = async () => {
    if (sending) return;
    setMenuOpen(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
      if (result.canceled || !result.assets || !result.assets[0] || !result.assets[0].uri) return;
      setSending(true);
      const manipulated = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 1080 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      const path = `${me}/group_photo_${Date.now()}.jpg`;
      const response = await fetch(manipulated.uri);
      const buf = await response.arrayBuffer();
      const up = await supabase.storage
        .from('chat-files')
        .upload(path, buf, { contentType: 'image/jpeg', upsert: true });
      if (up.error) throw up.error;
      const { data: urlData } = supabase.storage.from('chat-files').getPublicUrl(path);
      const { error } = await postMessage({ image_url: urlData.publicUrl });
      setSending(false);
      if (error) Alert.alert('사진 전송 실패', error.message);
    } catch (e) {
      setSending(false);
      Alert.alert('사진 전송 오류', '사진을 올리지 못했습니다.\n(' + (e && e.message ? e.message : e) + ')');
    }
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
      const { error } = await postMessage({ file_url: urlData.publicUrl, file_name: originalName });
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
          <Ionicons name="attach" size={18} color={mine ? '#fff' : '#333'} />
          <View style={{ flexShrink: 1, marginLeft: 6 }}>
            <Text style={mine ? s.textMine : s.textOther} numberOfLines={2}>{item.file_name || '첨부파일'}</Text>
            <Text style={[s.fileHint, mine && { color: '#dbe7ff' }]}>터치하여 열기 / 저장</Text>
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
    return (
      <View style={[s.msgRow, mine ? s.rowMine : s.rowOther]}>
        {!mine && <Text style={s.name}>{names[item.sender_id] || '알 수 없음'}</Text>}
        <View style={[s.bubbleLine, mine && { flexDirection: 'row-reverse' }]}>
          {renderBody(item, mine)}
          <Text style={s.time}>{hhmm(item.created_at)}</Text>
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
          {onInvite ? (
            <TouchableOpacity onPress={onInvite} style={s.inviteBtn}>
              <Text style={s.inviteText}>+ 초대</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={leaveRoom}>
            <Text style={{ color: '#dc2626', fontSize: 15 }}>나가기</Text>
          </TouchableOpacity>
        </View>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12 }}
          onContentSizeChange={() => listRef.current && listRef.current.scrollToEnd({ animated: false })}
          ListEmptyComponent={<Text style={s.empty}>첫 메시지를 보내 보세요.</Text>}
        />
        <View style={s.inputBar}>
          <TouchableOpacity
            style={[s.plusBtn, menuOpen && s.plusBtnOn]}
            onPress={() => setMenuOpen(!menuOpen)}
            disabled={sending}
          >
            <Ionicons name={menuOpen ? 'close' : 'add'} size={22} color="#444" />
          </TouchableOpacity>
          <TextInput
            style={s.input}
            value={text}
            onChangeText={setText}
            onFocus={() => setMenuOpen(false)}
            placeholder="메시지 입력"
            multiline
          />
          <TouchableOpacity style={s.sendBtn} onPress={send} disabled={sending}>
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.sendText}>보내기</Text>}
          </TouchableOpacity>
        </View>
        {menuOpen ? (
          <View style={s.menu}>
            <TouchableOpacity style={s.menuItem} onPress={sendPhoto}>
              <View style={[s.menuIcon, { backgroundColor: '#48BB78' }]}>
                <Ionicons name="image-outline" size={22} color="#fff" />
              </View>
              <Text style={s.menuLabel}>사진 올리기</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.menuItem} onPress={sendFile}>
              <View style={[s.menuIcon, { backgroundColor: '#4299E1' }]}>
                <Ionicons name="document-attach-outline" size={22} color="#fff" />
              </View>
              <Text style={s.menuLabel}>파일 첨부</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </KeyboardAvoidingView>

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

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#fff', paddingTop: 30 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#eee',
  },
  title: { fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },
  link: { fontSize: 16, color: '#2563eb', width: 110 },
  headerRight: { width: 110, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  inviteBtn: { backgroundColor: '#2B6CB0', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, marginRight: 12 },
  inviteText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  empty: { textAlign: 'center', marginTop: 60, color: '#888' },
  msgRow: { marginBottom: 10, maxWidth: '85%' },
  rowMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  rowOther: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  name: { fontSize: 12, color: '#666', marginBottom: 2, marginLeft: 4 },
  bubbleLine: { flexDirection: 'row', alignItems: 'flex-end' },
  bubble: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14, maxWidth: '100%', flexShrink: 1 },
  bubbleMine: { backgroundColor: '#2563eb' },
  bubbleOther: { backgroundColor: '#eee' },
  textMine: { color: '#fff', fontSize: 16 },
  textOther: { color: '#111', fontSize: 16 },
  time: { fontSize: 11, color: '#999', marginHorizontal: 6 },
  photo: { width: 200, height: 200, borderRadius: 14, backgroundColor: '#eee' },
  fileBubble: { flexDirection: 'row', alignItems: 'center' },
  fileHint: { fontSize: 11, color: '#777', marginTop: 2 },
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
    borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, fontSize: 16,
  },
  sendBtn: { marginLeft: 8, backgroundColor: '#2563eb', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10, minWidth: 64, alignItems: 'center' },
  sendText: { color: '#fff', fontWeight: '700' },
  menu: {
    flexDirection: 'row', paddingHorizontal: 24, paddingVertical: 18, paddingBottom: 30,
    backgroundColor: '#F9FAFB', borderTopWidth: 1, borderColor: '#eee',
  },
  menuItem: { alignItems: 'center', marginRight: 32 },
  menuIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { marginTop: 6, fontSize: 12, color: '#444' },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  viewerImg: { width: '100%', height: '80%' },
  viewerClose: { position: 'absolute', top: 44, right: 20, zIndex: 2, padding: 6 },
});
