import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, TextInput, SafeAreaView,
  KeyboardAvoidingView, Alert, StyleSheet,
} from 'react-native';

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

  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    const { data, error } = await supabase
    .from('group_messages')
    .insert({ room_id: room.id, sender_id: me, content: t })
    .select()
    .single();
    setSending(false);
    if (error) { Alert.alert('전송 실패', error.message); return; }
    setText('');
    addMessage(data);
    supabase.functions.invoke('send-group-push', { body: { messageId: data.id } }).then(() => {});
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

  const renderItem = ({ item }) => {
    const mine = item.sender_id === me;
    return (
      <View style={[s.msgRow, mine ? s.rowMine : s.rowOther]}>
      {!mine && <Text style={s.name}>{names[item.sender_id] || '알 수 없음'}</Text>}
      <View style={[s.bubbleLine, mine && { flexDirection: 'row-reverse' }]}>
      <View style={[s.bubble, mine ? s.bubbleMine : s.bubbleOther]}>
      <Text style={mine ? s.textMine : s.textOther}>{item.content}</Text>
      </View>
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
    <TextInput
    style={s.input}
    value={text}
    onChangeText={setText}
    placeholder="메시지 입력"
    multiline
    />
    <TouchableOpacity style={s.sendBtn} onPress={send} disabled={sending}>
    <Text style={s.sendText}>{sending ? '...' : '보내기'}</Text>
    </TouchableOpacity>
    </View>
    </KeyboardAvoidingView>
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
    inputBar: {
      flexDirection: 'row', alignItems: 'flex-end', padding: 8, paddingBottom: 28,
      borderTopWidth: 1, borderColor: '#eee', backgroundColor: '#fff',
    },
    input: {
      flex: 1, maxHeight: 120, borderWidth: 1, borderColor: '#ddd',
      borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8, fontSize: 16,
    },
    sendBtn: { marginLeft: 8, backgroundColor: '#2563eb', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10 },
    sendText: { color: '#fff', fontWeight: '700' },
});