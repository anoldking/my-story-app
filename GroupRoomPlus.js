import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import GroupRoom from './GroupRoom';
import GroupInvite from './GroupInvite';

// 초대 버튼의 위치 (맞지 않으면 이 두 숫자만 바꾸세요)
const INVITE_TOP = 8;
const INVITE_RIGHT = 84;

// 기존 단체방 화면(GroupRoom) 위에 "초대" 버튼을 얹는 화면
export default function GroupRoomPlus(props) {
  const { supabase, me, room } = props;
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <View style={{ flex: 1 }}>
      <GroupRoom {...props} />
      <TouchableOpacity
        onPress={() => setInviteOpen(true)}
        style={{
          position: 'absolute',
          top: INVITE_TOP,
          right: INVITE_RIGHT,
          paddingHorizontal: 12,
          height: 32,
          borderRadius: 16,
          backgroundColor: '#2B6CB0',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>+ 초대</Text>
      </TouchableOpacity>
      <GroupInvite
        supabase={supabase}
        me={me}
        roomId={room && room.id}
        visible={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />
    </View>
  );
}
