import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, FlatList,
  Image, ActivityIndicator, Alert, StyleSheet,
} from 'react-native';

// 단체방 멤버 초대 화면 (팝업)
export default function GroupInvite({ supabase, me, roomId, visible, onClose, onInvited }) {
  const [users, setUsers] = useState([]);
  const [memberIds, setMemberIds] = useState([]);
  const [picked, setPicked] = useState({});
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setPicked({});
      setQuery('');
      const p = await supabase
        .from('profiles')
        .select('id, nickname, avatar_url')
        .order('nickname', { ascending: true });
      const m = await supabase
        .from('chat_room_members')
        .select('user_id')
        .eq('room_id', roomId);
      if (!alive) return;
      if (p.error || m.error) {
        Alert.alert('불러오기 실패', (p.error || m.error).message || '목록을 불러오지 못했어요.');
      }
      setUsers(Array.isArray(p.data) ? p.data : []);
      setMemberIds(Array.isArray(m.data) ? m.data.map((r) => r.user_id) : []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [visible, roomId]);

  const toggle = (id) => {
    setPicked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const pickedIds = Object.keys(picked).filter((k) => picked[k]);

  const invite = async () => {
    if (pickedIds.length === 0 || saving) return;
    setSaving(true);
    const rows = pickedIds.map((id) => ({ room_id: roomId, user_id: id }));
    const { error } = await supabase.from('chat_room_members').insert(rows);
    setSaving(false);
    if (error) {
      const msg = String(error.message || '');
      if (msg.toLowerCase().includes('row-level') || error.code === '42501') {
        Alert.alert('초대 권한이 없어요', 'Supabase에서 초대 권한 규칙(SQL)을 먼저 추가해 주세요.');
      } else {
        Alert.alert('초대 실패', msg || '다시 시도해 주세요.');
      }
      return;
    }
    Alert.alert('초대 완료', pickedIds.length + '명을 초대했어요.');
    if (onInvited) onInvited(pickedIds);
    onClose();
  };

  const shown = users.filter((u) => {
    if (!query.trim()) return true;
    return String(u.nickname || '').toLowerCase().includes(query.trim().toLowerCase());
  });

  const renderItem = ({ item }) => {
    const already = memberIds.includes(item.id) || item.id === me;
    const on = !!picked[item.id];
    return (
      <TouchableOpacity
        style={styles.row}
        disabled={already}
        onPress={() => toggle(item.id)}
        activeOpacity={0.7}
      >
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarEmpty]}>
            <Text style={{ color: '#9CA3AF', fontSize: 16 }}>👤</Text>
          </View>
        )}
        <Text style={[styles.name, already && { color: '#9CA3AF' }]} numberOfLines={1}>
          {item.nickname || '이름 없음'}
        </Text>
        {already ? (
          <Text style={styles.joined}>참여 중</Text>
        ) : (
          <View style={styles.check}>
            {on ? <View style={styles.checkDot} /> : null}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={!!visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>닫기</Text>
          </TouchableOpacity>
          <Text style={styles.title}>멤버 초대</Text>
          <View style={styles.headerBtn} />
        </View>

        <TextInput
          style={styles.search}
          placeholder="이름으로 검색"
          value={query}
          onChangeText={setQuery}
        />

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={shown}
            keyExtractor={(u) => String(u.id)}
            renderItem={renderItem}
            ListEmptyComponent={<Text style={styles.empty}>초대할 사람이 없어요.</Text>}
            contentContainerStyle={{ paddingBottom: 16 }}
          />
        )}

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.inviteBtn, (pickedIds.length === 0 || saving) && { opacity: 0.4 }]}
            disabled={pickedIds.length === 0 || saving}
            onPress={invite}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.inviteText}>
                {pickedIds.length > 0 ? pickedIds.length + '명 초대하기' : '초대할 사람을 선택하세요'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF', paddingTop: 36 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#EEEEEE',
  },
  headerBtn: { minWidth: 56, paddingVertical: 6 },
  headerBtnText: { fontSize: 15, color: '#111111' },
  title: { fontSize: 17, fontWeight: '700', color: '#111111' },
  search: {
    margin: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    backgroundColor: '#F3F4F6', fontSize: 15,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  avatar: { width: 42, height: 42, borderRadius: 21, marginRight: 12 },
  avatarEmpty: { backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, fontSize: 16, color: '#111111' },
  joined: { fontSize: 13, color: '#9CA3AF' },
  check: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: '#C4C8CF',
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
  checkDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#8A8F98' },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 40 },
  footer: { padding: 12, paddingBottom: 28, borderTopWidth: 1, borderTopColor: '#EEEEEE' },
  inviteBtn: { backgroundColor: '#3F3F46', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  inviteText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
