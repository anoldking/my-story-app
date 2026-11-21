import React, { useState } from 'react';
import GroupRoom from './GroupRoom';
import GroupInvite from './GroupInvite';

// 단체방 화면(GroupRoom)에 "초대" 기능을 연결하는 화면
export default function GroupRoomPlus(props) {
  const { supabase, me, room } = props;
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <>
      <GroupRoom {...props} onInvite={() => setInviteOpen(true)} />
      <GroupInvite
        supabase={supabase}
        me={me}
        roomId={room && room.id}
        visible={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />
    </>
  );
}
