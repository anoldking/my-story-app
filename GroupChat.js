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
} from 'react-native';
import { Text, TextInput } from './fonts';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
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

function GroupChatInner({ supabase, me, onClose, onOpenRoom }) {
  const [mode, setMode] = useState('list');
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [picked, setPicked] = useState({});
  const [roomName, setRoomName] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeRoom, setActiveRoom] = useState(null);
  const [roomInfo, setRoomInfo] = useState({}); // roomId -> { count, rep }

  // 각 방의 참여 인원 수와 대표 멤버(나를 뺀 첫 번째 사람) 불러오기
  const loadRoomInfo = async (list) => {
    try {
      if (!list.length) { setRoomInfo({}); return; }
      const mem = await supabase
        .from('chat_room_members')
        .select('room_id, user_id')
        .in('room_id', list.map((r) => r.id));
      if (mem.error || !mem.data) return;
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

  const loadRooms = useCallback(async () => {
      setLoading(true);
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
      .select('id, nickname')
      .neq('id', me);
      if (error) Alert.alert('사용자 오류', error.message);
      else setUsers(data || []);
    }, [supabase, me]);

  useEffect(() => { loadRooms(); }, [loadRooms]);

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

  if (activeRoom) {
    return (
      <GroupRoom
      supabase={supabase}
      me={me}
      room={activeRoom}
      onBack={() => { setActiveRoom(null); loadRooms(); }}
      onLeft={() => { setActiveRoom(null); loadRooms(); }}
      />
    );
  }
  if (mode === 'create') {
    return (
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
            <Text style={s.rowText}>{item.nickname || '이름없음'}</Text>
            </View>
            </TouchableOpacity>
          );
      }}
      />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.wrap}>
    <View style={s.header}>
    <TouchableOpacity onPress={onClose}>
    <Text style={s.link}>닫기</Text>
    </TouchableOpacity>
    <Text style={s.title}>단체방</Text>
    <TouchableOpacity onPress={startCreate}>
    <Text style={s.link}>＋새 방</Text>
    </TouchableOpacity>
    </View>
    {loading ? (
        <ActivityIndicator style={{ marginTop: 30 }} />
      ) : (
        <FlatList
        data={rooms}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={<TouchableOpacity style={{ padding: 14 }} onPress={openGroupSound}><Text style={s.link}>🔔 단체방 알림음 변경</Text></TouchableOpacity>}
        ListEmptyComponent={<Text style={s.empty}>아직 단체방이 없어요.{'\n'}오른쪽 위 ＋새 방을 눌러 보세요.</Text>}
        renderItem={({ item }) => {
            const info = roomInfo[item.id];
            const count = info ? info.count : 0;
            const rep = info ? info.rep : null;
            return (
              <TouchableOpacity style={[s.row, s.roomRow]} onPress={() => setActiveRoom(item)}>
                {rep && rep.avatar_url ? (
                  <Image source={{ uri: rep.avatar_url }} style={s.roomAvatar} />
                ) : (
                  <View style={[s.roomAvatar, s.roomAvatarDefault]}>
                    <Ionicons name="people" size={22} color="#94A3B8" />
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={s.rowText} numberOfLines={1}>{item.name}</Text>
                </View>
                {count > 0 ? (
                  <View style={s.countBadge}>
                    <Ionicons name="person" size={11} color="#64748B" />
                    <Text style={s.countText}>{count}명</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
        }}
        />
    )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
    wrap: { flex: 1, backgroundColor: '#fff', paddingTop: 30 },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#eee',
    },
    title: { fontSize: 18, fontWeight: '700' },
    link: { fontSize: 16, color: '#2563eb' },
    input: { margin: 16, padding: 12, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, fontSize: 16 },
    sub: { marginHorizontal: 16, marginBottom: 6, color: '#666' },
    row: { paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: '#f0f0f0' },
    rowOn: { backgroundColor: '#F5F6F8' },
    rowText: { fontSize: 16 },
    rowInner: { flexDirection: 'row', alignItems: 'center' },
    circle: {
      width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: '#C4C8CF',
      backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginRight: 12,
    },
    circleDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#8A8F98' },
    empty: { textAlign: 'center', marginTop: 60, color: '#888', lineHeight: 24 },
    roomRow: { flexDirection: 'row', alignItems: 'center' },
    roomAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#E5E7EB' },
    roomAvatarDefault: { alignItems: 'center', justifyContent: 'center' },
    roomSub: { fontSize: 13, color: '#6B7280', marginTop: 3 },
    countBadge: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9',
      borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4, marginLeft: 8,
    },
    countText: { fontSize: 12, color: '#475569', fontWeight: '700', marginLeft: 3 },
});
export default function GroupChat(props) {
  return (
    <Modal visible animationType="slide" onRequestClose={props.onClose}>
    <GroupChatInner {...props} />
    </Modal>
  );
}
