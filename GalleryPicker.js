import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  FlatList,
  Image,
  Dimensions,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { Text } from './fonts';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons, themedStyles, bgc } from './theme';

const COLS = 3;
const GAP = 2;
const MAX_SELECT = 10;

export default function GalleryPicker({ visible, onClose, onSend, maxSelect, sendLabel, originalOption }) {
  const LIMIT = maxSelect || MAX_SELECT;
  const SEND_LABEL = sendLabel || '전송';
  const [perm, setPerm] = useState('loading'); // loading | ok | denied
  const [albums, setAlbums] = useState([]);
  const [album, setAlbum] = useState(null); // null = 전체보기
  const [assets, setAssets] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState([]); // asset 객체 배열 (선택 순서)
  const [dropOpen, setDropOpen] = useState(false);
  const [original, setOriginal] = useState(false); // 원본으로 보내기
  const cursorRef = useRef(undefined);
  const busyRef = useRef(false);

  const size = (Dimensions.get('window').width - GAP * (COLS - 1)) / COLS;

  const loadAssets = useCallback(async (albumObj, reset) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    try {
      const opt = {
        first: 60,
        mediaType: [MediaLibrary.MediaType.photo],
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      };
      if (albumObj && albumObj.id) opt.album = albumObj.id;
      if (!reset && cursorRef.current) opt.after = cursorRef.current;
      const res = await MediaLibrary.getAssetsAsync(opt);
      cursorRef.current = res.endCursor;
      setHasNext(res.hasNextPage);
      setTotal(res.totalCount);
      setAssets((prev) => (reset ? res.assets : [...prev, ...res.assets]));
    } catch (e) {
      Alert.alert('사진 불러오기 오류', String(e && e.message ? e.message : e));
    }
    busyRef.current = false;
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    (async () => {
      setSelected([]);
      setDropOpen(false);
      setAlbum(null);
      setAssets([]);
      cursorRef.current = undefined;
      try {
        const p = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
        if (!alive) return;
        if (!p.granted) { setPerm('denied'); return; }
        setPerm('ok');
        const list = await MediaLibrary.getAlbumsAsync();
        if (!alive) return;
        setAlbums(
          (list || [])
            .filter((a) => a.assetCount > 0)
            .sort((a, b) => b.assetCount - a.assetCount)
        );
        await loadAssets(null, true);
      } catch (e) {
        if (alive) setPerm('denied');
      }
    })();
    return () => { alive = false; };
  }, [visible, loadAssets]);

  const pickAlbum = (a) => {
    setDropOpen(false);
    setAlbum(a);
    cursorRef.current = undefined;
    busyRef.current = false;
    loadAssets(a, true);
  };

  const toggle = (asset) => {
    setSelected((prev) => {
      const idx = prev.findIndex((x) => x.id === asset.id);
      if (idx >= 0) return prev.filter((x) => x.id !== asset.id);
      if (LIMIT === 1) return [asset];
      if (prev.length >= LIMIT) {
        Alert.alert('선택 제한', `사진은 한 번에 ${LIMIT}장까지 선택할 수 있어요.`);
        return prev;
      }
      return [...prev, asset];
    });
  };

  const renderItem = ({ item }) => {
    const idx = selected.findIndex((x) => x.id === item.id);
    const on = idx >= 0;
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => toggle(item)}
        style={{ width: size, height: size, marginRight: GAP, marginBottom: GAP }}
      >
        <Image source={{ uri: item.uri }} style={{ width: size, height: size, backgroundColor: bgc('#eee') }} />
        {on ? <View style={s.dim} /> : null}
        <View style={[s.circle, on && s.circleOn]}>
          {on ? <Text style={s.circleNum}>{idx + 1}</Text> : null}
        </View>
      </TouchableOpacity>
    );
  };

  const albumTitle = album ? album.title : '전체보기';
  const albumCount = album ? album.assetCount : total;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.wrap}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.hBtn}>
            <Ionicons name="close" size={26} color="#111" />
          </TouchableOpacity>
          <TouchableOpacity style={s.titleBtn} onPress={() => setDropOpen(!dropOpen)} disabled={perm !== 'ok'}>
            <Text style={s.title} numberOfLines={1}>{albumTitle} {albumCount}</Text>
            <Ionicons name={dropOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#111" style={{ marginLeft: 4 }} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.sendBtn, selected.length > 0 && s.sendBtnOn]}
            disabled={selected.length === 0}
            onPress={() => onSend(selected, { original })}
          >
            <Text style={[s.sendText, selected.length > 0 && { color: '#fff' }]}>
              {SEND_LABEL}{selected.length > 0 && LIMIT > 1 ? ` ${selected.length}` : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {perm === 'loading' ? (
          <ActivityIndicator style={{ marginTop: 60 }} />
        ) : perm === 'denied' ? (
          <View style={s.denied}>
            <Text style={s.deniedText}>사진 접근 권한이 필요해요.{'\n'}설정에서 사진 권한을 허용해 주세요.</Text>
            <TouchableOpacity style={s.deniedBtn} onPress={() => Linking.openSettings()}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>설정 열기</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={assets}
            keyExtractor={(a) => a.id}
            renderItem={renderItem}
            numColumns={COLS}
            extraData={selected}
            onEndReachedThreshold={0.6}
            onEndReached={() => { if (hasNext && !busyRef.current) loadAssets(album, false); }}
            ListFooterComponent={loading ? <ActivityIndicator style={{ margin: 16 }} /> : null}
            ListEmptyComponent={!loading ? <Text style={s.empty}>사진이 없어요.</Text> : null}
          />
        )}

        {originalOption && perm === 'ok' ? (
          <TouchableOpacity style={s.origBar} activeOpacity={0.8} onPress={() => setOriginal(!original)}>
            <View style={[s.origCheck, original && s.origCheckOn]}>
              {original ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : null}
            </View>
            <Text style={s.origText}>원본으로 보내기</Text>
            <Text style={s.origSub}>{original ? '화질 그대로 · 용량 큼' : '보통 화질 · 빠름'}</Text>
          </TouchableOpacity>
        ) : null}

        {dropOpen ? (
          <View style={s.dropWrap}>
            <TouchableOpacity style={s.dropBackdrop} activeOpacity={1} onPress={() => setDropOpen(false)} />
            <View style={s.drop}>
              <FlatList
                data={[{ id: '__all__', title: '전체보기', assetCount: null }, ...albums]}
                keyExtractor={(a) => a.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={s.dropItem}
                    onPress={() => pickAlbum(item.id === '__all__' ? null : item)}
                  >
                    <Text style={s.dropText} numberOfLines={1}>
                      {item.title}
                      {item.assetCount != null ? <Text style={s.dropCount}>  {item.assetCount}</Text> : null}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const s = themedStyles({
  wrap: { flex: 1, backgroundColor: '#fff', paddingTop: 36 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  hBtn: { width: 44, height: 40, justifyContent: 'center' },
  titleBtn: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, paddingHorizontal: 8 },
  title: { fontSize: 18, fontWeight: '800', color: '#111', flexShrink: 1 },
  sendBtn: {
    minWidth: 64, height: 36, borderRadius: 18, paddingHorizontal: 14,
    backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center',
  },
  sendBtnOn: { backgroundColor: '#2563eb' },
  sendText: { fontSize: 15, fontWeight: '700', color: '#9CA3AF' },
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.35)' },
  circle: {
    position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 13,
    borderWidth: 2, borderColor: '#FFFFFF', backgroundColor: 'rgba(0,0,0,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  circleOn: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  circleNum: { color: '#fff', fontSize: 13, fontWeight: '800' },
  empty: { textAlign: 'center', marginTop: 60, color: '#888' },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  deniedText: { textAlign: 'center', fontSize: 15, color: '#444', lineHeight: 22 },
  deniedBtn: { marginTop: 18, backgroundColor: '#2563eb', borderRadius: 20, paddingHorizontal: 22, paddingVertical: 11 },
  dropWrap: { position: 'absolute', top: 82, left: 0, right: 0, bottom: 0 },
  dropBackdrop: { ...StyleSheet.absoluteFillObject },
  drop: {
    position: 'absolute', top: 0, left: '15%', width: '70%', maxHeight: '75%',
    backgroundColor: '#fff', borderRadius: 16, paddingVertical: 6,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, elevation: 8,
  },
  dropItem: { paddingVertical: 14, paddingHorizontal: 18 },
  dropText: { fontSize: 17, color: '#111' },
  dropCount: { color: '#9CA3AF' },
  origBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 30,
    borderTopWidth: 1, borderColor: '#EEEEEE', backgroundColor: '#FFFFFF',
  },
  origCheck: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#A1A1AA',
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  origCheckOn: { backgroundColor: '#3F3F46', borderColor: '#3F3F46' },
  origText: { fontSize: 15, fontWeight: '700', color: '#111111' },
  origSub: { fontSize: 12, color: '#A1A1AA', marginLeft: 8 },
});
