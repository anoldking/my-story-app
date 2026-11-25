import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  FlatList,
  Image,
  Linking,
  Platform,
  Modal,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StyleSheet,
  AppState,
} from 'react-native';
import { Text, TextInput } from './fonts';
import * as Notifications from 'expo-notifications';
import { Ionicons, themedStyles } from './theme';
import GroupRoom from './GroupRoomPlus';

export async function ensureGroupChannel() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('messages_group', {
        name: '단체방 새 메시지 알림 (전용음)',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'mimi_up.wav',
        vibrationPattern: [0, 250, 250, 250],
    });
  } catch (e) {}
}

async function openGroupSound() {
  if (Platform.OS !== 'android') { Linking.openSettings(); return; }
  try {
    await ensureGroupChannel();
    await Linking.sendIntent('android.settings.CHANNEL_NOTIFICATION_SETTINGS', [
        { key: 'android.provider.extra.APP_PACKAGE', value: 'com.anoldking.mystoryapp' },
        { key: 'android.provider.extra.CHANNEL_ID', value: 'messages_group' },
    ]);
  } catch (e) { Linking.openSettings(); }
}
function makeId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function GroupChatInner({ supabase, me, onClose, onOpenRoom, embedded, onRoomClosed }) {
  const [mode, setMode] = useState('list');
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [picked, setPicked] = useState({});
  const [roomName, setRoomName] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeRoom, setActiveRoom] = useState(null);
  const [roomInfo, setRoomInfo] = useState({}); // roomId -> { count, rep }
  // 체크해서 여러 방 한꺼번에 나가기 (1:1 메시지 목록과 같은 방식)
  const [leaveSelectMode, setLeaveSelectMode] = useState(false);
  const [leaveSelected, setLeaveSelected] = useState({}); // { roomId: true }
  const [unreadByRoom, setUnreadByRoom] = useState({}); // { roomId: 안 읽은 메시지 수 }

  // 방마다 '내가 마지막으로 읽은 시간' 이후에 다른 사람이 보낸 메시지 수 세기
  const loadUnread = async (list, myReads) => {
    try {
      const out = {};
      await Promise.all(list.map(async (r) => {
        let q = supabase
          .from('group_messages')
          .select('id', { count: 'exact', head: true })
          .eq('room_id', r.id)
          .neq('sender_id', me);
        const lr = myReads[r.id];
        if (lr) q = q.gt('created_at', lr);
        const { count, error } = await q;
        if (!error) out[r.id] = count || 0;
      }));
      setUnreadByRoom(out);
    } catch (e) { /* 숫자만 못 보일 뿐, 목록은 정상 */ }
  };

  // 각 방의 참여 인원 수와 대표 멤버(나를 뺀 첫 번째 사람) 불러오기
  const loadRoomInfo = async (list) => {
    try {
      if (!list.length) { setRoomInfo({}); return; }
      const mem = await supabase
        .from('chat_room_members')
        .select('room_id, user_id, last_read_at')
        .in('room_id', list.map((r) => r.id));
      if (mem.error || !mem.data) return;
      const myReads = {};
      mem.data.forEach((m) => { if (m.user_id === me) myReads[m.room_id] = m.last_read_at; });
      loadUnread(list, myReads);
      const uids = [...new Set(mem.data.map((m) => m.user_id))];
      const pr = await supabase.from('profiles').select('id, nickname, avatar_url').in('id', uids);
      const pmap = {};
      (pr.data || []).forEach((p) => { pmap[p.id] = p; });
      const info = {};
      mem.data.forEach((m) => {
        const o = info[m.room_id] || (info[m.room_id] = { count: 0, rep: null });
        o.count += 1;
        if (m.user_id !== me && !o.rep) o.rep = pmap[m.user_id] || { nickname: '멤버' };
      });
      setRoomInfo(info);
    } catch (e) { /* 표시만 못 할 뿐, 목록은 정상 */ }
  };

  const loadRooms = useCallback(async (quiet) => {
      if (quiet !== true) setLoading(true);
      const { data, error } = await supabase
      .from('chat_room_members')
      .select('room_id, chat_rooms(id, name, created_at)')
      .eq('user_id', me);
      if (error) {
        Alert.alert('목록 오류', error.message);
      } else {
        const list = (data || [])
        .map((r) => r.chat_rooms)
        .filter(Boolean)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        setRooms(list);
        loadRoomInfo(list);
      }
      setLoading(false);
    }, [supabase, me]);

  const loadUsers = useCallback(async () => {
      const { data, error } = await supabase
      .from('profiles')
      .select('id, nickname, avatar_url')
      .neq('id', me);
      if (error) Alert.alert('사용자 오류', error.message);
      else setUsers(data || []);
    }, [supabase, me]);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  // 앱을 다시 열거나, 앱을 보는 중 푸시가 오면 단체방 목록(안 읽은 숫자 등)을 바로 새로 불러옴
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') loadRooms(true); });
    const recv = Notifications.addNotificationReceivedListener(() => loadRooms(true));
    // 목록을 보고 있는 동안 새 단체 메시지가 오면 안 읽은 숫자를 바로 다시 셈
    let timer = null;
    const ch = supabase
      .channel('group-list-unread-' + me)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages' }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => loadRooms(true), 600);
      })
      .subscribe();
    return () => { sub.remove(); recv?.remove(); if (timer) clearTimeout(timer); supabase.removeChannel(ch); };
  }, [loadRooms]);

  const leaveSelectedIds = Object.keys(leaveSelected).filter((k) => leaveSelected[k]);
  const toggleLeaveSelect = (id) => setLeaveSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  const exitLeaveSelect = () => { setLeaveSelectMode(false); setLeaveSelected({}); };
  const leaveSelectedRooms = () => {
    const ids = [...leaveSelectedIds];
    if (ids.length === 0) return;
    Alert.alert('단체방 나가기', `선택한 ${ids.length}개 방에서 나갈까요?\n나가면 대화 내용을 다시 볼 수 없어요.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '나가기',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('chat_room_members')
            .delete()
            .in('room_id', ids)
            .eq('user_id', me);
          if (error) Alert.alert('나가기 실패', error.message);
          exitLeaveSelect();
          loadRooms();
        },
      },
    ]);
  };

  const startCreate = () => {
    setPicked({});
    setRoomName('');
    setMode('create');
    loadUsers();
  };

  const createRoom = async () => {
    const ids = Object.keys(picked).filter((k) => picked[k]);
    if (ids.length < 1) {
      Alert.alert('멤버 선택', '초대할 사람을 한 명 이상 골라 주세요.');
      return;
    }
    setSaving(true);
    const roomId = makeId();
    const name = roomName.trim() || '단체방';
    const r1 = await supabase
    .from('chat_rooms')
    .insert({ id: roomId, name, created_by: me });
    if (r1.error) {
      setSaving(false);
      Alert.alert('방 만들기 실패', r1.error.message);
      return;
    }
    const rows = [me, ...ids].map((uid) => ({ room_id: roomId, user_id: uid }));
    const r2 = await supabase.from('chat_room_members').insert(rows);
    setSaving(false);
    if (r2.error) {
      Alert.alert('멤버 추가 실패', r2.error.message);
      return;
    }
    setMode('list');
    loadRooms();
  };

  // 방 안쪽 화면 (방에 들어갔을 때)
  const closeRoom = (quiet) => { setActiveRoom(null); loadRooms(quiet); if (onRoomClosed) onRoomClosed(); };
  const roomView = activeRoom ? (
      <GroupRoom
      supabase={supabase}
      me={me}
      room={activeRoom}
      onBack={() => closeRoom(true)}
      onLeft={() => closeRoom(false)}
      />
  ) : null;
  // 새 단체방 만들기 화면
  const createView = mode === 'create' ? (
      <SafeAreaView style={s.wrap}>
      <View style={s.header}>
      <TouchableOpacity onPress={() => setMode('list')}>
      <Text style={s.link}>취소</Text>
      </TouchableOpacity>
      <Text style={s.title}>새 단체방</Text>
      <TouchableOpacity onPress={createRoom} disabled={saving}>
      <Text style={s.link}>{saving ? '...' : '만들기'}</Text>
      </TouchableOpacity>
      </View>
      <TextInput
      style={s.input}
      placeholder="방 이름 (비우면 '단체방')"
      value={roomName}
      onChangeText={setRoomName}
      />
      <Text style={s.sub}>초대할 사람 선택</Text>
      <FlatList
      data={users}
      keyExtractor={(u) => u.id}
      renderItem={({ item }) => {
          const on = !!picked[item.id];
          return (
            <TouchableOpacity
            style={[s.row, on && s.rowOn]}
            onPress={() => setPicked({ ...picked, [item.id]: !on })}
            >
            <View style={s.rowInner}>
            <View style={s.circle}>
            {on ? <View style={s.circleDot} /> : null}
            </View>
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={s.pickAvatar} />
            ) : (
              <View style={[s.pickAvatar, s.roomAvatarDefault]}>
                <Ionicons name="person" size={18} color="#A1A1AA" />
              </View>
            )}
            <Text style={s.rowText} numberOfLines={1}>{item.nickname || '이름없음'}</Text>
            </View>
            </TouchableOpacity>
          );
      }}
      />
      </SafeAreaView>
  ) : null;

  // 예전 방식(전체 화면 창)일 때는 방/만들기 화면을 그대로 보여줌
  if (!embedded) {
    if (roomView) return roomView;
    if (createView) return createView;
  }

  const listView = (
    <SafeAreaView style={embedded ? s.wrapEmbedded : s.wrap}>
    {/* 1:1 화면과 같은 모양의 머리줄: [단체방][채팅방 나가기] ........ [＋][✕] */}
    <View style={[s.ktHeader, embedded && s.ktHeaderEmbedded]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={s.ktPageTitle}>단체방</Text>
        {rooms.length > 0 ? (
          <TouchableOpacity
            style={[s.leaveModeBtn, leaveSelectMode && s.leaveModeBtnOn]}
            onPress={() => (leaveSelectMode ? exitLeaveSelect() : setLeaveSelectMode(true))}
          >
            <Text style={[s.leaveModeText, leaveSelectMode && { color: '#FFFFFF' }]}>
              {leaveSelectMode ? '취소' : '채팅방 나가기'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {leaveSelectMode ? (
        <TouchableOpacity
          style={[s.leaveDoBtn, leaveSelectedIds.length === 0 && { opacity: 0.4 }]}
          onPress={leaveSelectedRooms}
          disabled={leaveSelectedIds.length === 0}
        >
          <Text style={s.leaveDoText}>나가기 {leaveSelectedIds.length > 0 ? `(${leaveSelectedIds.length})` : ''}</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <TouchableOpacity style={s.ktIconBtn} onPress={startCreate} hitSlop={6}>
            <Ionicons name="add-outline" size={24} color="#333333" />
          </TouchableOpacity>
          {embedded ? (
            <TouchableOpacity style={s.ktIconBtn} onPress={() => loadRooms(true)} hitSlop={6}>
              <Ionicons name="refresh-outline" size={22} color="#333333" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.ktIconBtn} onPress={onClose} hitSlop={6}>
              <Ionicons name="close-outline" size={24} color="#333333" />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
    {loading ? (
        <ActivityIndicator style={{ marginTop: 30 }} />
      ) : (
        <FlatList
        data={rooms}
        keyExtractor={(r) => r.id}
        extraData={{ leaveSelectMode, leaveSelected, roomInfo, unreadByRoom }}
        contentContainerStyle={{ paddingHorizontal: embedded ? 0 : 14, paddingTop: 6, paddingBottom: 40 }}
        ListEmptyComponent={<Text style={s.empty}>아직 단체방이 없어요.{'\n'}오른쪽 위 ＋를 눌러 보세요.</Text>}
        renderItem={({ item }) => {
            const info = roomInfo[item.id];
            const count = info ? info.count : 0;
            const rep = info ? info.rep : null;
            const checked = !!leaveSelected[item.id];
            return (
              <TouchableOpacity
                style={s.card}
                activeOpacity={0.75}
                onPress={() => (leaveSelectMode ? toggleLeaveSelect(item.id) : setActiveRoom(item))}
              >
                {leaveSelectMode ? (
                  <View style={[s.leaveCheck, checked && s.leaveCheckOn]}>
                    {checked ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : null}
                  </View>
                ) : null}
                {rep && rep.avatar_url ? (
                  <Image source={{ uri: rep.avatar_url }} style={s.roomAvatar} />
                ) : (
                  <View style={[s.roomAvatar, s.roomAvatarDefault]}>
                    <Ionicons name="people" size={17} color="#A1A1AA" />
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={s.cardName} numberOfLines={1}>{item.name}</Text>
                  <Text style={s.cardSub} numberOfLines={1}>
                    {rep ? `${rep.nickname || '멤버'}${count > 2 ? ` 외 ${count - 2}명` : ''}` : '터치하여 대화하기'}
                  </Text>
                </View>
                {unreadByRoom[item.id] > 0 ? (
                  <View style={s.unreadBadge}>
                    <Text style={s.unreadBadgeText}>{unreadByRoom[item.id] >= 100 ? '많음' : unreadByRoom[item.id]}</Text>
                  </View>
                ) : null}
                {count > 0 ? (
                  <View style={s.countBadge}>
                    <Ionicons name="person" size={10} color="#71717A" />
                    <Text style={s.countText}>{count}명</Text>
                  </View>
                ) : null}
                {!leaveSelectMode ? (
                  <Ionicons name="chatbubble-outline" size={16} color="#2B6CB0" style={{ marginLeft: 8 }} />
                ) : null}
              </TouchableOpacity>
            );
        }}
        />
    )}
    </SafeAreaView>
  );

  if (!embedded) return listView;

  // 기본 틀 안에 들어가는 방식: 목록은 그대로, 방/만들기는 위로 올라오는 창
  return (
    <View style={{ flex: 1 }}>
      {listView}
      <Modal visible={!!activeRoom} animationType="slide" onRequestClose={() => closeRoom(true)}>
        {roomView}
      </Modal>
      <Modal visible={mode === 'create'} animationType="slide" onRequestClose={() => setMode('list')}>
        {createView}
      </Modal>
    </View>
  );
}

const s = themedStyles({
    wrap: { flex: 1, backgroundColor: '#fff', paddingTop: 30 },
    wrapEmbedded: { flex: 1, backgroundColor: '#fff' },
    ktHeaderEmbedded: { paddingHorizontal: 0, paddingTop: 8 },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#eee',
    },
    title: { fontSize: 18, fontWeight: '700', color: '#111111' },
    link: { fontSize: 16, color: '#3F3F46' },
    input: { margin: 16, padding: 12, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, fontSize: 16 },
    sub: { marginHorizontal: 16, marginBottom: 6, color: '#71717A' },
    row: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: '#f0f0f0' },
    rowOn: { backgroundColor: '#F5F6F8' },
    rowText: { fontSize: 16, color: '#111111' },
    rowInner: { flexDirection: 'row', alignItems: 'center' },
    circle: {
      width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: '#C4C8CF',
      backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginRight: 12,
    },
    circleDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#8A8F98' },
    empty: { textAlign: 'center', marginTop: 60, color: '#A1A1AA', lineHeight: 24 },
    roomRow: { flexDirection: 'row', alignItems: 'center' },
    roomAvatar: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#E5E7EB' },
    card: {
      flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 10,
      marginBottom: 6, backgroundColor: '#FAFAFA', borderRadius: 12, borderWidth: 1, borderColor: '#EEEEEE', gap: 0,
    },
    cardName: { fontSize: 13.5, fontWeight: '700', color: '#222222' },
    cardSub: { fontSize: 11.5, color: '#777777', marginTop: 1 },
    ktHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10, backgroundColor: '#FFFFFF',
    },
    ktPageTitle: { fontSize: 20, fontWeight: 'bold', color: '#191919' },
    ktIconBtn: { padding: 6 },
    toolRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, paddingTop: 10 },
    leaveModeBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(63,63,70,0.1)' },
    leaveModeBtnOn: { backgroundColor: '#52525B' },
    leaveModeText: { fontSize: 12, fontWeight: '700', color: '#52525B' },
    leaveDoBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: '#3F3F46' },
    leaveDoText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
    leaveCheck: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: '#A1A1AA', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
    leaveCheckOn: { backgroundColor: '#3F3F46', borderColor: '#3F3F46' },
    pickAvatar: { width: 40, height: 40, borderRadius: 11, backgroundColor: '#E5E7EB', marginRight: 12 },
    roomAvatarDefault: { alignItems: 'center', justifyContent: 'center' },
    roomSub: { fontSize: 13, color: '#6B7280', marginTop: 3 },
    unreadBadge: {
      minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: '#EF4444',
      alignItems: 'center', justifyContent: 'center', marginLeft: 8,
    },
    unreadBadgeText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: 'bold' },
    countBadge: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: '#F4F4F5',
      borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4, marginLeft: 8,
    },
    countText: { fontSize: 12, color: '#52525B', fontWeight: '700', marginLeft: 3 },
});
export default function GroupChat(props) {
  // embedded: 앱 기본 틀(왼쪽 메뉴 · 로고 · BGM) 안에 들어가는 방식
  if (props.embedded) return <GroupChatInner {...props} />;
  return (
    <Modal visible animationType="slide" onRequestClose={props.onClose}>
    <GroupChatInner {...props} />
    </Modal>
  );
}
