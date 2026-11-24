// 채팅에서 받은 사진·파일을 폰에 저장하는 도구 (1:1 채팅, 단체방 공통)
// - 사진: 폰 갤러리(사진첩)에 저장
// - 파일: 처음 한 번 저장할 폴더(예: Download)를 고르면, 다음부터는 그 폴더에 바로 저장
import { Alert, Platform, Linking } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DIR_KEY = 'download_dir_uri_v1';

const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic',
  mp4: 'video/mp4', mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav',
  pdf: 'application/pdf', txt: 'text/plain', zip: 'application/zip',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  hwp: 'application/x-hwp', apk: 'application/vnd.android.package-archive',
};

// 주소나 파일 이름에서 확장자(jpg, pdf 등) 알아내기
const extOf = (url, name) => {
  const pick = (s) => {
    if (!s) return '';
    const clean = String(s).split('?')[0].split('#')[0];
    const m = clean.match(/\.([a-zA-Z0-9]{1,5})$/);
    return m ? m[1].toLowerCase() : '';
  };
  return pick(name) || pick(url);
};

// 파일 이름에 쓸 수 없는 글자 정리
const safeName = (name) => String(name || '').replace(/[\\/:*?"<>|]/g, '_').trim();

// 인터넷 주소의 파일을 앱 임시 폴더에 내려받기
const downloadToCache = async (url, ext) => {
  const local = FileSystem.cacheDirectory + 'dl_' + Date.now() + (ext ? '.' + ext : '');
  const res = await FileSystem.downloadAsync(url, local);
  if (!res || (res.status && res.status >= 400)) throw new Error('다운로드 실패 (' + (res && res.status) + ')');
  return res.uri;
};

// 사진을 폰 갤러리에 저장
export const saveImageToPhone = async (url) => {
  if (!url) return;
  try {
    const perm = await MediaLibrary.requestPermissionsAsync(true);
    if (!perm.granted) {
      Alert.alert('권한 필요', '사진을 저장하려면 사진 접근 권한을 허용해 주세요.', [
        { text: '취소', style: 'cancel' },
        { text: '설정 열기', onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    const ext = extOf(url) || 'jpg';
    const local = await downloadToCache(url, ext);
    await MediaLibrary.saveToLibraryAsync(local);
    FileSystem.deleteAsync(local, { idempotent: true }).catch(() => {});
    Alert.alert('저장 완료', '사진을 갤러리에 저장했어요.');
  } catch (e) {
    Alert.alert('저장 실패', '사진을 저장하지 못했어요.\n(' + (e && e.message ? e.message : e) + ')');
  }
};

// 파일을 폰 폴더(예: Download)에 저장
export const saveFileToPhone = async (url, fileName) => {
  if (!url) return;
  const ext = extOf(url, fileName);
  // 사진 파일이면 갤러리에 저장하는 편이 찾기 쉬움
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext)) {
    await saveImageToPhone(url);
    return;
  }
  if (Platform.OS !== 'android') {
    // 아이폰은 브라우저로 열어서 저장
    Linking.openURL(url).catch(() => Alert.alert('열기 실패', '파일을 열 수 없어요.'));
    return;
  }
  const SAF = FileSystem.StorageAccessFramework;
  let local = null;
  try {
    local = await downloadToCache(url, ext);
    const b64 = await FileSystem.readAsStringAsync(local, { encoding: FileSystem.EncodingType.Base64 });
    const mime = MIME[ext] || 'application/octet-stream';
    const base = safeName(fileName) || ('file_' + Date.now() + (ext ? '.' + ext : ''));

    const pickDir = async () => {
      let initial;
      try { initial = SAF.getUriForDirectoryInRoot('Download'); } catch (e) { initial = undefined; }
      const p = await SAF.requestDirectoryPermissionsAsync(initial);
      if (!p.granted) return null;
      await AsyncStorage.setItem(DIR_KEY, p.directoryUri);
      return p.directoryUri;
    };

    let dir = await AsyncStorage.getItem(DIR_KEY);
    let firstTime = false;
    if (!dir) {
      const ok = await new Promise((resolve) => {
        Alert.alert(
          '저장할 폴더 고르기',
          '다음 화면에서 저장할 폴더(예: Download)를 고르고 "이 폴더 사용"을 눌러 주세요.\n한 번만 고르면 다음부터는 바로 저장돼요.',
          [
            { text: '취소', style: 'cancel', onPress: () => resolve(false) },
            { text: '폴더 고르기', onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) }
        );
      });
      if (!ok) return;
      dir = await pickDir();
      firstTime = true;
      if (!dir) return;
    }

    const writeTo = async (d) => {
      const dest = await SAF.createFileAsync(d, base, mime);
      await FileSystem.writeAsStringAsync(dest, b64, { encoding: FileSystem.EncodingType.Base64 });
    };

    try {
      await writeTo(dir);
    } catch (e) {
      // 예전에 고른 폴더 권한이 사라졌으면 한 번 더 고르기
      if (firstTime) throw e;
      await AsyncStorage.removeItem(DIR_KEY);
      dir = await pickDir();
      if (!dir) return;
      await writeTo(dir);
    }
    Alert.alert('저장 완료', '"' + base + '" 파일을 저장했어요.\n파일 앱(내 파일)에서 확인할 수 있어요.');
  } catch (e) {
    Alert.alert('저장 실패', '파일을 저장하지 못했어요.\n(' + (e && e.message ? e.message : e) + ')');
  } finally {
    if (local) FileSystem.deleteAsync(local, { idempotent: true }).catch(() => {});
  }
};

// 저장할 폴더를 다시 고르고 싶을 때 (설정 등에서 사용 가능)
export const resetDownloadFolder = () => AsyncStorage.removeItem(DIR_KEY);
