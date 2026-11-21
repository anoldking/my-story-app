import React, { useEffect, useState } from 'react';
import {
  View,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Text } from './fonts';
import { themedStyles } from './theme';

export const STICKER_PREFIX = '[sticker]';
export const isSticker = (content) => typeof content === 'string' && content.startsWith(STICKER_PREFIX);
export const stickerUrlOf = (content) => (isSticker(content) ? content.slice(STICKER_PREFIX.length).trim() : '');
// 새 방식: sticker_url 칸에 주소 저장 (content는 알림용 "(이모티콘)")
export const STICKER_LABEL = '(이모티콘)';
// 메시지 한 건에서 이모티콘 주소 꺼내기 (옛 방식 [sticker]주소 도 지원)
export const getSticker = (msg) => (msg && (msg.sticker_url || stickerUrlOf(msg.content))) || '';

const BUCKET = 'stickers';
const IMG_RE = /\.(png|webp|gif|jpg|jpeg)$/i;
const FALLBACK = [
  's01_smile', 's02_laugh', 's03_love', 's04_cry', 's05_angry', 's06_wow', 's07_sleepy', 's08_wink',
  's09_thumb', 's10_heart', 's11_thanks', 's12_ok', 's13_kk', 's14_hi', 's15_ing', 's16_goodnight',
].map((n) => `${n}.png`);

let cache = null; // 한 번 불러온 목록은 앱 실행 중 재사용

export default function StickerPanel({ supabase, onPick, onClose }) {
  const [items, setItems] = useState(cache || []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) return;
    let alive = true;
    (async () => {
      let names = [];
      try {
        const { data, error } = await supabase.storage
          .from(BUCKET)
          .list('', { limit: 200, sortBy: { column: 'name', order: 'asc' } });
        if (!error && data) names = data.map((f) => f.name).filter((n) => IMG_RE.test(n));
      } catch (e) { /* 아래 기본 목록 사용 */ }
      if (!names.length) names = FALLBACK;
      const list = names.map((n) => ({
        name: n,
        url: supabase.storage.from(BUCKET).getPublicUrl(n).data.publicUrl,
      }));
      cache = list;
      if (alive) { setItems(list); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [supabase]);

  // 이모티콘 칸 크기: 한 칸 약 68, 화면 너비에 맞춰 한 줄 개수를 자동 계산
  const CELL = 68;
  const cols = Math.max(4, Math.floor((Dimensions.get('window').width - 16) / CELL));
  const cell = Math.floor((Dimensions.get('window').width - 16) / cols);

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Text style={s.title}>이모티콘</Text>
        <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
          <Text style={s.close}>닫기</Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.name}
          numColumns={cols}
          key={`cols${cols}`}
          contentContainerStyle={{ paddingHorizontal: 8 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={{ width: cell, height: cell, padding: 6 }} onPress={() => onPick(item.url)}>
              <Image source={{ uri: item.url }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

export function StickerBubbleImage({ url }) {
  return <Image source={{ uri: url }} style={s.bubbleImg} resizeMode="contain" />;
}

const s = themedStyles({
  wrap: { height: 230, backgroundColor: '#F9FAFB', borderTopWidth: 1, borderColor: '#eee' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  title: { fontSize: 14, fontWeight: '700', color: '#333' },
  close: { fontSize: 13, color: '#666' },
  bubbleImg: { width: 130, height: 130 },
});
