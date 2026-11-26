import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  FlatList,
  Image,
  ImageBackground,
  Alert,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
  Dimensions,
  KeyboardAvoidingView,
  Keyboard,
  useWindowDimensions,
  Modal,
  Platform,
  BackHandler,
  ToastAndroid,
  Linking,
  PanResponder,
  Pressable,
  AppState,
  Animated,
  Easing,
  Share,
} from 'react-native';
import { Text, TextInput, useAppFonts } from './fonts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import GroupChat, { ensureGroupChannel } from './GroupChat';
import GalleryPicker from './GalleryPicker';
import { saveImageToPhone, saveFileToPhone } from './download';
import * as MediaLibrary from 'expo-media-library';
import StickerPanel, { getSticker, STICKER_LABEL, StickerBubbleImage } from './StickerPanel';
import * as ImageManipulator from 'expo-image-manipulator';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { Ionicons, themedStyles, useTheme, bgc, cycleThemeMode, getMode, modeLabel, hapticTap, hapticSelect } from './theme';
import { BounceView, HeartPop, useDoubleTap } from './anim';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// 홈 '추천 여행지' (국내 5곳 · 해외 10곳). 매일 2곳 무작위, 가기 좋은 달(months)이면 더 자주 뽑힘
const TRAVEL_SIGN = '아놀드킹의 추천';
const TRAVEL_DOMESTIC = [
  { region: '제주도', city: '제주', iata: 'CJU', flight: '김포 약 1시간 10분', months: [4, 5, 6, 9, 10],
    title: '바다 보고 싶을 때 제일 먼저 떠오르는 곳',
    body: '렌터카 하나 빌려서 해안 도로 따라 천천히 달려 보세요. 창문만 열어도 여행 온 기분이 나요. 아침 일찍 성산일출봉에 올라 해 뜨는 걸 보고, 오후엔 함덕이나 협재 바다에서 발 한번 담가 보세요. 비 오는 날도 걱정 없어요. 실내 박물관이랑 카페가 많아서 아이들도 지루해하지 않아요. 봄가을 주말엔 렌터카가 금방 동나니까 미리 잡아 두세요!' },
  { region: '경상도', city: '부산', months: [5, 6, 7, 8, 9, 10],
    title: '바다, 야경, 먹거리. 셋 다 챙기고 싶다면',
    body: '광안대교 불 켜지는 시간에 광안리 해변에 앉아 있으면 그냥 좋아요. 낮에는 감천문화마을 골목을 걸어 보고, 자갈치시장이랑 국제시장에서 어묵이랑 씨앗호떡 꼭 드셔 보세요. 해운대 해변열차는 아이들이 정말 좋아할 거예요. 대중교통이 잘 돼 있어서 차 없이 다니기도 편해요.' },
  { region: '강원도', city: '강릉', months: [1, 6, 7, 8, 9],
    title: '훌쩍 떠나는 동해 바다 여행',
    body: '마음먹으면 바로 다녀올 수 있는 바다예요. 안목해변 커피 거리에서 바다 보면서 커피 한잔하면 그걸로 충분해요. 경포호 한 바퀴 산책하고, 시간 되면 정동진에서 해돋이도 보세요. 여름 성수기엔 해변 근처 주차가 정말 힘드니 참고하세요.' },
  { region: '경상도', city: '경주', months: [3, 4, 10, 11],
    title: '아이와 함께 걷는 살아있는 역사책',
    body: '도시 전체가 박물관이라 걷기만 해도 공부가 돼요. 불국사랑 석굴암은 꼭 들르고, 밤에는 동궁과 월지 야경 보러 가세요. 물에 비친 모습이 정말 예뻐요. 자전거 빌려서 대릉원이랑 첨성대 쪽 돌면 아이들도 신나 해요. 봄 벚꽃, 가을 단풍 때가 제일 예뻐요.' },
  { region: '전라도', city: '여수', months: [4, 5, 9, 10],
    title: '밤바다 노래가 왜 나왔는지 알게 되는 곳',
    body: '해상 케이블카 타고 바다 위를 건너 보세요. 해 질 무렵 타면 더 좋아요. 밤에는 돌산공원에서 내려다보는 밤바다가 진짜예요. 게장 백반이랑 갓김치는 빼먹지 마시고요. 하루 더 시간 내서 순천만 국가정원까지 묶으면 알찬 1박 2일이 돼요.' },
];
const TRAVEL_OVERSEAS = [
  { region: '일본', city: '오사카', iata: 'KIX', flight: '약 1시간 45분', months: [3, 4, 5, 10, 11],
    title: '먹으러 가는 여행, 여기면 실패 없어요',
    body: '도톤보리 골목에서 타코야키, 오코노미야키 하나씩 사 먹으면서 걷는 게 오사카 여행의 반이에요. 아이들 있으면 유니버설 스튜디오는 하루 통째로 잡으세요. 교토는 전철로 한 시간이라 하루쯤 다녀오기 좋아요. 간사이 교통 패스 하나 사 두면 이동이 정말 편해요.' },
  { region: '일본', city: '후쿠오카', iata: 'FUK', flight: '약 1시간 20분', months: [3, 4, 5, 10, 11],
    title: '비행기 한 시간 반, 주말에 다녀오는 일본',
    body: '공항에서 시내까지 지하철로 10분이라 도착하자마자 바로 여행 시작이에요. 저녁엔 나카스 포장마차에서 라멘 한 그릇, 다음 날은 유후인 온천 마을로 가 보세요. 짧은 일정이라도 온천 료칸 하루는 꼭 넣으셨으면 해요. 피로가 싹 풀려요.' },
  { region: '일본', city: '삿포로', iata: 'CTS', flight: '약 2시간 50분', months: [12, 1, 2, 7, 8],
    title: '겨울에 가야 진짜 삿포로',
    body: '눈이 펑펑 내리는 거리를 걷다 보면 동화 속에 들어온 것 같아요. 2월 초쯤 눈축제 때 오도리 공원 눈 조각은 정말 볼 만해요. 오타루 운하는 저녁에 가야 예쁘고요. 추운 날엔 수프카레랑 징기스칸으로 몸 녹이세요. 미끄럼 방지 신발은 필수예요!' },
  { region: '일본', city: '오키나와', iata: 'OKA', flight: '약 2시간 20분', months: [4, 5, 6, 10, 11, 12],
    title: '일본에서 만나는 에메랄드빛 바다',
    body: '렌터카 빌려서 해안 도로 달리는 게 오키나와 여행의 맛이에요. 고우리 대교 건널 때 바다 색 보면 감탄이 나와요. 츄라우미 수족관 고래상어는 아이들이 넋 놓고 봐요. 8~9월은 태풍이 잦으니 피하시고, 운전하실 분은 국제운전면허증 챙기세요.' },
  { region: '대만', city: '타이베이', iata: 'TPE', flight: '약 2시간 30분', months: [3, 4, 10, 11, 12],
    title: '야시장 좋아하면 무조건 여기',
    body: '저녁이 되면 야시장 가는 게 하루 일과가 돼요. 스린 야시장에서 이것저것 맛보고, 지우펀 골목은 해 질 무렵 가야 등불 켜진 모습이 예뻐요. 이지카드 하나면 지하철, 버스, 편의점까지 다 돼서 정말 편해요. 가깝고 물가도 부담 없어서 가족 여행으로 딱이에요.' },
  { region: '베트남', city: '다낭', iata: 'DAD', flight: '약 4시간 30분', months: [2, 3, 4, 5, 6, 7, 8],
    title: '아무것도 안 해도 좋은 휴양 여행',
    body: '리조트 수영장이랑 바다만 왔다 갔다 해도 행복한 곳이에요. 미케 해변은 넓고 깨끗해서 아이들 놀기 좋고, 저녁엔 호이안 옛 마을에 가서 등불 거리를 걸어 보세요. 바나힐 케이블카도 한번 타 볼 만해요. 10~12월은 비가 많으니 이때는 피하시는 게 좋아요.' },
  { region: '베트남', city: '나트랑', iata: 'CXR', flight: '약 5시간', months: [1, 2, 3, 4, 5, 6, 7, 8],
    title: '다낭보다 조용한 바다를 원한다면',
    body: '사람이 덜 붐벼서 여유 있게 쉬기 좋아요. 섬에 있는 빈원더스 놀이공원은 아이들이 정말 좋아하고, 머드 온천은 어른들이 더 좋아해요. 해변 식당에서 먹는 해산물도 싸고 맛있어요. 공항에서 시내까지 40분쯤 걸리니 이동 계획은 미리 세워 두세요.' },
  { region: '태국', city: '방콕', iata: 'BKK', flight: '약 5시간 50분', months: [11, 12, 1, 2],
    title: '볼거리, 먹거리, 쇼핑까지 다 되는 도시',
    body: '왕궁이랑 왓아룬은 사진으로 보는 것보다 훨씬 화려해요. 주말이면 짜뚜짝 시장 구경 꼭 해 보세요. 저녁엔 강 위 크루즈 타면서 야경 보는 것도 추천해요. 더운 낮엔 시원한 쇼핑몰로 피신하면 돼요. 사원 갈 땐 어깨랑 무릎 가리는 옷 입는 거 잊지 마세요.' },
  { region: '필리핀', city: '세부', iata: 'CEB', flight: '약 4시간 40분', months: [12, 1, 2, 3, 4, 5],
    title: '바닷속이 궁금하다면 여기',
    body: '호핑 투어 나가서 스노클링 하면 바로 눈앞에 물고기 떼가 지나가요. 아이들한테 평생 기억에 남을 경험이에요. 막탄 섬 리조트에 묵으면 수영장이랑 바다를 오가며 하루가 금방 가요. 래시가드랑 아쿠아슈즈는 꼭 챙겨 가세요.' },
  { region: '싱가포르', city: '싱가포르', iata: 'SIN', flight: '약 6시간 20분', months: [2, 3, 4, 7, 8],
    title: '아이 데리고 편하게 다니기 좋은 도시',
    body: '깨끗하고 안전해서 마음 놓고 다닐 수 있어요. 밤에 가든스 바이 더 베이 나무 조명 쇼는 꼭 보세요. 센토사 섬에서 하루 놀고, 저녁은 호커센터에서 여러 가지 시켜서 나눠 먹으면 재밌어요. 길에서 껌 씹거나 쓰레기 버리면 벌금이 있으니 조심하세요.' },
];
// 추천 여행지 상세 글 (전체 화면 에세이). 도시 이름이 TRAVEL_DOMESTIC / TRAVEL_OVERSEAS 와 같아야 함
const TRAVEL_ESSAYS = {
  '제주': {
    days: '2박 3일',
    intro: '제주는 몇 번을 가도 또 가고 싶은 곳이에요. 공항 문을 나서는 순간 불어오는 바람부터가 달라요. 짠 내음 섞인 그 바람을 맞으면 "아, 여행 왔구나" 싶어요.',
    sections: [
      { h: '해 뜨는 성산, 해 지는 협재', p: '첫날 아침은 조금 부지런을 떨어서 성산일출봉에 올라 보세요. 숨이 조금 차오를 때쯤 정상에 서면, 바다 위로 해가 쑥 올라오는 걸 볼 수 있어요. 저녁엔 반대편 협재나 금능 바다로 가세요. 물빛이 투명해서 발만 담가도 기분이 맑아져요.' },
      { h: '비 오는 날의 제주도 괜찮아요', p: '제주 날씨는 정말 변덕스러워요. 그래도 걱정 마세요. 아쿠아플라넷이나 박물관, 바다 보이는 카페가 곳곳에 있어서 비 오는 날은 그 나름대로 운치가 있어요. 창밖으로 비 오는 바다 보면서 귤 하나 까 먹는 시간, 저는 그게 제일 좋았어요.' },
    ],
    tips: ['렌터카는 봄가을 주말이면 금방 동나요. 미리 잡아 두세요', '동쪽·서쪽을 하루씩 나눠 돌면 덜 피곤해요', '흑돼지는 저녁 시간 피해서 조금 일찍 가세요'],
    outro: '돌아오는 비행기에서 벌써 다음 제주를 생각하게 될 거예요.',
  },
  '부산': {
    days: '1박 2일',
    intro: '부산은 바다도 있고, 야경도 있고, 먹을 것도 있는 욕심 많은 도시예요. 어디를 골라도 반은 성공이에요.',
    sections: [
      { h: '광안리의 밤', p: '해가 지면 광안리 해변에 그냥 앉아 보세요. 광안대교에 불이 하나둘 켜지면 파도 소리랑 같이 하루가 천천히 정리돼요. 주말 밤엔 드론 쇼를 하는 날도 있으니 운 좋으면 덤으로 구경할 수 있어요.' },
      { h: '골목과 시장 사이', p: '낮에는 감천문화마을의 알록달록한 골목을 걸어 보세요. 사진 찍을 곳이 정말 많아요. 그다음엔 자갈치시장이랑 국제시장으로 가서 어묵, 씨앗호떡, 비빔당면을 하나씩 맛보면 배가 금방 불러요. 해운대 블루라인 해변열차는 아이들이 정말 좋아해요.' },
    ],
    tips: ['지하철이 잘 돼 있어서 차 없이도 충분해요', '해변열차는 주말이면 미리 예매하는 게 좋아요', '밀면이랑 돼지국밥은 꼭 한 번씩'],
    outro: '부산 사투리 섞인 "또 온나" 한마디가 귀에 오래 남는 곳이에요.',
  },
  '강릉': {
    days: '1박 2일',
    intro: '갑자기 바다가 보고 싶은 날이 있잖아요. 그럴 때 마음먹고 바로 떠날 수 있는 곳이 강릉이에요.',
    sections: [
      { h: '커피 한잔과 바다', p: '안목해변 커피 거리에 가면 바다를 바라보는 카페가 줄지어 있어요. 창가 자리에 앉아 커피 한잔 마시면서 파도 보는 것, 그거면 충분해요. 강릉 여행은 바쁘게 다니지 않는 게 포인트예요.' },
      { h: '경포호 산책, 그리고 해돋이', p: '오후엔 경포호를 한 바퀴 천천히 걸어 보세요. 바람이 선선해서 산책하기 딱 좋아요. 다음 날 조금 일찍 일어날 수 있다면 정동진에서 해돋이를 보세요. 기차역 바로 앞이 바다인 풍경이 꽤 낭만적이에요.' },
    ],
    tips: ['여름 성수기엔 해변 근처 주차가 정말 힘들어요', '초당순두부는 아침으로 먹으면 속이 편해요', '중앙시장 닭강정은 포장해서 숙소에서'],
    outro: '짧게 다녀와도 마음이 한참 넉넉해지는 바다예요.',
  },
  '경주': {
    days: '1박 2일',
    intro: '경주는 도시 전체가 박물관이에요. 그냥 걷기만 해도 천 년 전 이야기가 발밑에 깔려 있어요. 아이들이랑 가면 살아 있는 역사책이 돼요.',
    sections: [
      { h: '자전거 타고 천 년 산책', p: '대릉원 근처에서 자전거를 빌려 첨성대, 계림 쪽으로 천천히 달려 보세요. 큰 고분들 사이를 지나가면 아이들이 "이게 다 무덤이야?" 하고 눈이 동그래져요. 황리단길 골목에서 간식 하나 사 먹고 쉬어 가는 것도 좋아요.' },
      { h: '물에 비친 동궁과 월지', p: '경주 여행의 하이라이트는 밤이에요. 해가 지면 동궁과 월지에 불이 들어오는데, 연못에 비친 모습이 정말 그림 같아요. 낮에는 불국사랑 석굴암을 꼭 들르세요. 교과서에서만 보던 걸 직접 보면 느낌이 완전히 달라요.' },
    ],
    tips: ['봄 벚꽃, 가을 단풍 때가 제일 예뻐요', '동궁과 월지는 해 질 무렵 들어가면 낮과 밤을 다 볼 수 있어요', '편한 운동화는 필수예요'],
    outro: '아이 손 잡고 걷다 보면 어른도 같이 배우게 되는 여행이에요.',
  },
  '여수': {
    days: '1박 2일',
    intro: '해가 지고 나서야 여수가 진짜 얼굴을 보여줘요. 돌산대교에 불이 하나둘 켜지면, 바다 위로 조명이 번지는 게 꼭 누가 일부러 그려 놓은 그림 같아요.',
    sections: [
      { h: '바다 위를 건너는 케이블카', p: '해상 케이블카는 꼭 타 보세요. 바닥이 투명한 칸을 타면 발밑으로 바다가 지나가서 아이들이 소리를 질러요. 해 질 무렵에 타면 노을까지 덤으로 볼 수 있어요.' },
      { h: '낮에는 오동도, 밤에는 낭만포차', p: '오전엔 오동도 동백숲길을 천천히 걸어 보세요. 바닷바람이 시원해서 걷기 좋아요. 저녁엔 낭만포차 거리에서 해물삼합 한 접시면 하루가 완성돼요. 게장 백반이랑 갓김치도 빼먹지 마시고요.' },
    ],
    tips: ['케이블카는 해 질 녘 30분 전 탑승이 제일 예뻐요', '낭만포차는 주말 저녁 7시 전에 가야 자리 있어요', '하루 더 있으면 순천만 국가정원까지 묶어 보세요'],
    outro: '다음엔 꼭 가족들 다 같이 밤바다 보러 가요.',
  },
  '오사카': {
    days: '3박 4일',
    intro: '오사카는 먹으러 가는 여행이에요. "먹다가 망한다"는 말이 있을 정도니까요. 배를 조금 비우고 가세요.',
    sections: [
      { h: '도톤보리 먹방 산책', p: '글리코 간판 앞에서 사진 한 장 찍고, 골목마다 타코야키, 오코노미야키, 쿠시카츠를 하나씩 사 먹으면서 걸어 보세요. 그게 오사카 여행의 반이에요. 밤이 되면 네온사인이 강물에 비쳐서 더 화려해져요.' },
      { h: '하루는 아이들을 위해', p: '아이들이 있다면 유니버설 스튜디오는 하루를 통째로 잡으세요. 놀이기구 줄이 길어서 반나절로는 부족해요. 어른들끼리라면 전철로 한 시간 거리인 교토에 다녀와 보세요. 오사카랑은 전혀 다른 조용한 일본을 만날 수 있어요.' },
    ],
    tips: ['간사이 교통 패스 하나면 이동이 정말 편해요', '유니버설 스튜디오는 익스프레스 패스를 미리 생각해 두세요', '구로몬 시장은 오전에 가야 신선해요'],
    outro: '돌아와서도 한동안 타코야키 생각이 날 거예요.',
  },
  '후쿠오카': {
    days: '2박 3일',
    intro: '비행기 타고 한 시간 반이면 도착하는 일본이에요. 공항에서 시내까지도 지하철로 금방이라 도착하자마자 바로 여행이 시작돼요.',
    sections: [
      { h: '포장마차의 밤', p: '저녁엔 나카스 강가 포장마차에 가 보세요. 좁은 자리에 옆 사람과 어깨를 붙이고 앉아 먹는 돈코츠 라멘 한 그릇이 이상하게 더 맛있어요. 하카타 모츠나베도 꼭 한 번 드셔 보세요.' },
      { h: '유후인에서의 하루', p: '짧은 일정이어도 온천 마을 유후인은 꼭 넣으셨으면 해요. 긴린코 호수 주변을 아침 일찍 걸으면 물안개가 피어올라서 정말 예뻐요. 료칸에서 온천하고 하룻밤 자면 쌓였던 피로가 싹 풀려요.' },
    ],
    tips: ['유후인은 버스 예약을 미리 해 두세요', '캐널시티는 비 오는 날 가기 좋아요', '명란은 선물용으로 인기 많아요'],
    outro: '주말 하루 연차만 내도 다녀올 수 있는, 가까워서 더 좋은 곳이에요.',
  },
  '삿포로': {
    days: '3박 4일',
    intro: '삿포로는 겨울에 가야 진짜예요. 하얀 눈이 펑펑 내리는 거리를 걷다 보면 동화 속에 들어온 것 같아요.',
    sections: [
      { h: '눈의 도시', p: '2월 초 눈축제 때는 오도리 공원에 거대한 눈 조각들이 늘어서요. 밤에 조명이 켜지면 더 멋있어요. 축제 기간이 아니어도 하얗게 덮인 시내 풍경만으로 충분히 설레요.' },
      { h: '오타루의 저녁', p: '기차 타고 오타루로 가서 운하를 걸어 보세요. 해가 지고 가스등이 켜지면 정말 영화 같아요. 오르골당에서 작은 오르골 하나 사 오는 것도 좋은 추억이 돼요. 추운 날엔 수프카레랑 징기스칸으로 몸을 녹이세요.' },
    ],
    tips: ['미끄럼 방지 신발은 필수예요', '여름엔 라벤더 밭 보러 가는 것도 추천해요', '눈축제 기간엔 숙소를 아주 일찍 잡아야 해요'],
    outro: '눈 위를 뽀드득 걷는 소리가 한참 귀에 남는 여행이에요.',
  },
  '오키나와': {
    days: '3박 4일',
    intro: '일본인데 바다 색은 동남아 같은 곳이에요. 처음 바다를 보면 "이게 진짜 일본이야?" 소리가 절로 나와요.',
    sections: [
      { h: '해안 도로 드라이브', p: '오키나와는 렌터카로 다니는 게 제일이에요. 고우리 대교를 건널 때 양옆으로 펼쳐지는 에메랄드빛 바다는 정말 감탄이 나와요. 마음에 드는 해변이 보이면 그냥 차 세우고 쉬어 가세요.' },
      { h: '고래상어를 만나는 날', p: '츄라우미 수족관의 커다란 수조 앞에 서면 고래상어가 머리 위로 천천히 지나가요. 아이들은 넋을 놓고 봐요. 수족관 옆 에메랄드 비치도 같이 들르면 하루 코스로 딱이에요.' },
    ],
    tips: ['운전하실 분은 국제운전면허증을 꼭 챙기세요', '8~9월은 태풍이 잦으니 피하는 게 좋아요', '국제거리에서 기념품 쇼핑하기 좋아요'],
    outro: '가까운 곳에서 휴양다운 휴양을 하고 싶을 때 딱이에요.',
  },
  '타이베이': {
    days: '2박 3일',
    intro: '야시장을 좋아한다면 무조건 여기예요. 해가 지면 야시장 가는 게 하루 일과가 돼요.',
    sections: [
      { h: '야시장에서 저녁 먹기', p: '스린 야시장에 가면 지파이, 굴전, 버블티까지 먹을 게 끝이 없어요. 조금씩 나눠 사서 가족끼리 이것저것 맛보는 재미가 있어요. 사람이 많으니 아이들 손은 꼭 잡고 다니세요.' },
      { h: '등불 켜지는 지우펀', p: '지우펀은 해 질 무렵에 가야 해요. 산비탈 골목에 홍등이 하나둘 켜지면 정말 영화 속 한 장면 같아요. 찻집에 앉아 따뜻한 차 한잔하면서 내려다보는 풍경이 오래 기억에 남아요.' },
    ],
    tips: ['이지카드 하나면 지하철·버스·편의점까지 다 돼요', '지우펀은 주말을 피하면 훨씬 여유로워요', '딘타이펑 본점은 대기표 먼저 받아 두세요'],
    outro: '가깝고 물가도 부담 없어서 가족 여행으로 딱 좋은 곳이에요.',
  },
  '다낭': {
    days: '3박 5일',
    intro: '다낭은 아무것도 안 해도 좋은 곳이에요. 리조트 수영장이랑 바다만 왔다 갔다 해도 하루가 행복하게 지나가요.',
    sections: [
      { h: '미케 해변의 아침', p: '아침에 일찍 일어나 미케 해변을 걸어 보세요. 모래사장이 넓고 깨끗해서 아이들 놀기 정말 좋아요. 낮에는 수영장에서 쉬고, 저녁엔 해변 식당에서 해산물 한 상 차려 먹으면 그만이에요.' },
      { h: '등불의 마을 호이안', p: '저녁엔 호이안 옛 마을에 꼭 가 보세요. 거리마다 알록달록한 등불이 켜지고, 강 위로 소원 등을 띄우는 풍경이 정말 예뻐요. 하루 시간이 더 있다면 바나힐 케이블카도 타 볼 만해요.' },
    ],
    tips: ['10~12월은 비가 많으니 피하세요', '그랩 앱 하나면 택시 걱정 없어요', '호이안은 해 질 무렵 도착하게 출발하세요'],
    outro: '쉬러 갔다가 진짜로 푹 쉬고 오는, 드문 여행지예요.',
  },
  '나트랑': {
    days: '3박 5일',
    intro: '다낭보다 조금 더 조용한 바다를 원한다면 나트랑이에요. 사람이 덜 붐벼서 여유 있게 쉬기 좋아요.',
    sections: [
      { h: '섬 하나가 통째로 놀이공원', p: '빈원더스는 섬 전체가 놀이공원이에요. 케이블카 타고 바다를 건너가는 것부터가 아이들한테는 모험이에요. 워터파크도 같이 있어서 하루가 금방 가요.' },
      { h: '머드 온천에서 쉬는 하루', p: '어른들은 머드 온천을 더 좋아해요. 따뜻한 진흙 욕조에 몸을 담그고 있으면 피로가 스르르 녹아요. 저녁엔 해변 식당에서 랍스터나 새우를 저렴하게 즐길 수 있어요.' },
    ],
    tips: ['공항에서 시내까지 시간이 좀 걸리니 픽업을 미리 알아보세요', '선크림은 넉넉히 챙기세요', '반미는 길거리 가게가 더 맛있어요'],
    outro: '조용한 바다와 느린 시간이 필요할 때 생각나는 곳이에요.',
  },
  '방콕': {
    days: '3박 5일',
    intro: '방콕은 볼거리, 먹거리, 쇼핑까지 다 되는 도시예요. 며칠을 있어도 지루할 틈이 없어요.',
    sections: [
      { h: '황금빛 사원들', p: '왕궁이랑 왓아룬은 사진보다 훨씬 화려해요. 햇빛을 받아 반짝이는 장식들을 보면 입이 벌어져요. 왓아룬은 강 건너편에서 해 질 녘에 바라볼 때가 제일 예뻐요.' },
      { h: '시장과 강 위의 밤', p: '주말이면 짜뚜짝 시장 구경을 꼭 해 보세요. 없는 게 없어요. 저녁엔 짜오프라야 강 디너 크루즈를 타면서 야경을 보는 것도 추천해요. 더운 낮엔 시원한 쇼핑몰로 피신하면 돼요.' },
    ],
    tips: ['사원에 갈 땐 어깨와 무릎을 가리는 옷을 입으세요', '팟타이랑 망고밥은 꼭 드셔 보세요', '마사지는 하루 한 번 꼭 받으세요'],
    outro: '정신없이 즐겁고, 돌아오면 또 그리워지는 도시예요.',
  },
  '세부': {
    days: '3박 5일',
    intro: '바닷속이 궁금하다면 세부예요. 물에 얼굴만 넣어도 바로 눈앞으로 물고기 떼가 지나가요.',
    sections: [
      { h: '호핑 투어 하는 날', p: '배를 타고 섬 사이를 돌아다니며 스노클링을 하는 호핑 투어는 꼭 해 보세요. 아이들한테는 평생 기억에 남을 경험이 돼요. 바다 위에서 먹는 점심도 꿀맛이에요.' },
      { h: '리조트에서의 느린 하루', p: '막탄 섬 리조트에 묵으면 수영장이랑 바다를 오가며 하루가 금방 가요. 해 질 녘 바닷가에 앉아 노을 보는 시간이 이 여행에서 제일 좋은 순간이에요.' },
    ],
    tips: ['래시가드랑 아쿠아슈즈는 꼭 챙기세요', '망고는 실컷 드세요. 정말 달아요', '호핑 투어는 아침 일찍 출발하는 걸로 고르세요'],
    outro: '파란 바다를 실컷 보고 싶을 때, 생각나는 곳이에요.',
  },
  '싱가포르': {
    days: '3박 4일',
    intro: '싱가포르는 아이 데리고 편하게 다니기 좋은 도시예요. 깨끗하고 안전해서 마음을 놓고 다닐 수 있어요.',
    sections: [
      { h: '빛나는 나무들의 밤', p: '밤에 가든스 바이 더 베이에 가면 슈퍼트리에 조명이 켜지고 음악에 맞춰 쇼가 시작돼요. 바닥에 누워서 올려다보면 정말 다른 행성에 온 것 같아요. 마리나 베이 야경도 같이 즐겨 보세요.' },
      { h: '센토사와 호커센터', p: '하루는 센토사 섬에서 놀이공원과 해변을 즐겨 보세요. 저녁은 호커센터에서 치킨라이스, 사테, 락사를 여러 개 시켜 나눠 먹으면 재밌어요. 저렴하고 맛있어서 매일 가게 돼요.' },
    ],
    tips: ['길에서 껌 씹거나 쓰레기 버리면 벌금이 있어요', '실내는 에어컨이 세서 얇은 겉옷이 필요해요', '지하철이 잘 돼 있어서 이동이 편해요'],
    outro: '처음 해외여행 가는 아이들에게도 자신 있게 추천하는 곳이에요.',
  },
};
// 가기 좋은 달을 '4~6월 · 9~10월'처럼
const monthsText = (ms) => {
  const a = [...(ms || [])].sort((x, y) => x - y);
  const out = [];
  let i = 0;
  while (i < a.length) {
    let j = i;
    while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++;
    out.push(i === j ? `${a[i]}월` : `${a[i]}~${a[j]}월`);
    i = j + 1;
  }
  return out.join(' · ');
};
// 항공사 코드 → 한글 이름 (목록에 없으면 코드만 보여줌)
const AIRLINE_KO = {
  KE: '대한항공', OZ: '아시아나항공', '7C': '제주항공', LJ: '진에어', TW: '티웨이항공', BX: '에어부산',
  RS: '에어서울', ZE: '이스타항공', YP: '에어프레미아', RF: '에어로케이', JL: '일본항공', NH: 'ANA 전일본공수',
  MM: '피치항공', GK: '젯스타재팬', BC: '스카이마크', CI: '중화항공', BR: '에바항공', IT: '타이거에어 타이완',
  JX: '스타럭스항공', VJ: '비엣젯항공', VN: '베트남항공', QH: '뱀부항공', TG: '타이항공', FD: '타이에어아시아',
  XJ: '타이에어아시아X', PR: '필리핀항공', Z2: '필리핀에어아시아', '5J': '세부퍼시픽', SQ: '싱가포르항공',
  TR: '스쿠트', CX: '캐세이퍼시픽', UO: '홍콩익스프레스', HX: '홍콩항공', MU: '중국동방항공', CA: '중국국제항공',
  CZ: '중국남방항공', '9C': '춘추항공', MH: '말레이시아항공', AK: '에어아시아', D7: '에어아시아X', OD: '바틱에어',
};
// ---- 앱 업데이트 알림 ----
const STORE_PKG = 'com.anoldking.mystoryapp';
const UPDATE_SKIP_KEY = 'update_prompt_skip_v1'; // '나중에' 누른 버전
const UPDATE_BANNER_KEY = 'update_banner_hide_v1'; // 홈 띠 ✕ 누른 버전
// 지금 폰에 깔린 버전 번호 (플레이스토어 빌드에만 있음, APK 빌드는 null)
const currentVersionCode = () => {
  const v = Constants?.expoConfig?.android?.versionCode;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const openStorePage = () => {
  Linking.openURL(`market://details?id=${STORE_PKG}`).catch(() => {
    Linking.openURL(`https://play.google.com/store/apps/details?id=${STORE_PKG}`).catch(() => {});
  });
};
// 국내 항공권: 제주행 (김포, 인천, 김해 출발)
const JEJU_ORIGINS = ['GMP', 'ICN', 'PUS'];
const ORIGIN_KO = { GMP: '김포', ICN: '인천', PUS: '김해' };
const JEJU_DEST = TRAVEL_DOMESTIC.find((d) => d.iata === 'CJU');
// ---- 캐시 삭제 ----
// 앱 임시 폴더(사진·동영상·노래 임시 파일) 크기 계산
const cacheDirSize = async (uri, depth = 0) => {
  if (!uri || depth > 6) return 0;
  let total = 0;
  try {
    const names = await FileSystem.readDirectoryAsync(uri);
    for (const n of names) {
      const child = uri.endsWith('/') ? uri + n : `${uri}/${n}`;
      try {
        const info = await FileSystem.getInfoAsync(child, { size: true });
        if (!info.exists) continue;
        if (info.isDirectory) total += await cacheDirSize(child, depth + 1);
        else total += info.size || 0;
      } catch {}
    }
  } catch {}
  return total;
};
const clearCacheDir = async () => {
  const root = FileSystem.cacheDirectory;
  if (!root) return;
  let names = [];
  try { names = await FileSystem.readDirectoryAsync(root); } catch { return; }
  for (const n of names) {
    try { await FileSystem.deleteAsync(root + n, { idempotent: true }); } catch {}
  }
};
const fmtBytes = (b) => {
  if (!b || b < 1024 * 1024) return `${Math.max(0, Math.round((b || 0) / 1024))}KB`;
  return `${(b / (1024 * 1024)).toFixed(b >= 100 * 1024 * 1024 ? 0 : 1)}MB`;
};
// 폰 설정 > 앱 > Google Play 스토어 화면 열기
const openPlayStoreSettings = async () => {
  try {
    await IntentLauncher.startActivityAsync('android.settings.APPLICATION_DETAILS_SETTINGS', { data: 'package:com.android.vending' });
  } catch {
    Alert.alert('설정 열기 실패', '설정 → 애플리케이션 → Google Play 스토어 → 저장공간 → 캐시 삭제 순서로 직접 들어가 주세요.');
  }
};
// 항공권 검색 사이트 (네이버 / 스카이스캐너)
const FLIGHT_NAVER_KEY = 'flight_open_naver_v1';
const KR_AIRPORTS = ['ICN', 'GMP', 'PUS', 'CJU', 'CJJ', 'TAE', 'KWJ', 'RSU', 'USN', 'MWX'];
const ymd8 = (d) => ymd(d).replace(/-/g, '');
// 날짜가 없으면 일주일 뒤 출발, 3박
const flightDates = (dep, ret) => {
  if (dep && ret) return [dep, ret];
  const a = new Date(); a.setDate(a.getDate() + 7);
  const b = new Date(a); b.setDate(b.getDate() + 3);
  return [a, b];
};
const naverFlightUrl = (from, to, dep, ret) => {
  const [a, b] = flightDates(dep, ret);
  const domestic = KR_AIRPORTS.includes(from) && KR_AIRPORTS.includes(to);
  const kind = domestic ? 'domestic' : 'international';
  const fare = domestic ? 'YC' : 'Y';
  return `https://flight.naver.com/flights/${kind}/${from}-${to}-${ymd8(a)}/${to}-${from}-${ymd8(b)}?adult=1&fareType=${fare}`;
};
const skyscannerUrl = (from, to, dep, ret) => {
  const yymmdd = (d) => ymd(d).slice(2).replace(/-/g, '');
  const dates = dep && ret ? `${yymmdd(dep)}/${yymmdd(ret)}/` : '';
  return `https://www.skyscanner.co.kr/transport/flights/${from.toLowerCase()}/${to.toLowerCase()}/${dates}`;
};
const openUrlSafe = (url) => Linking.openURL(url).catch(() => Alert.alert('열기 실패', '항공권 검색 화면을 열 수 없어요.'));
const airlineName = (code) => (code ? AIRLINE_KO[code] || code : '');
// 날짜 → 'YYYY-MM-DD'
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// 'YYYY-MM-DD' → Date
const fromYmd = (t) => {
  if (!t) return null;
  const [a, b, c] = String(t).slice(0, 10).split('-').map(Number);
  return a ? new Date(a, b - 1, c) : null;
};
// 이번 달이 가기 좋은 곳인지
const isTravelSeason = (d) => (d.months || []).includes(new Date().getMonth() + 1);
// 날마다 바뀌는 무작위 뽑기 (가기 좋은 달이면 2배 더 잘 뽑힘)
const weightedDailyPick = (arr, count, seed) => {
  const frac = (x) => x - Math.floor(x);
  return arr
    .map((x, i) => ({ x, k: frac(Math.abs(Math.sin(seed * 9301 + i * 49297)) * 1000) * (isTravelSeason(x) ? 2 : 1) }))
    .sort((p, q) => q.k - p.k)
    .slice(0, count)
    .map((o) => o.x);
};
// 날짜(YYYYMMDD)로 매일 바뀌는 순서 만들기
const dayKeyNum = () => {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
};
const seededPick = (arr, count, seed) => {
  const a = arr.map((x, i) => ({ x, k: Math.sin(seed * 9301 + i * 49297) * 233280 }));
  a.sort((p, q) => (p.k % 1) - (q.k % 1));
  return a.slice(0, count).map((o) => o.x);
};
const WEEK_KO = ['일', '월', '화', '수', '목', '금', '토'];
// 일정 시간 버튼
const SCHED_TIMES = [['종일', null], ['아침 9:00', '09:00'], ['점심 12:00', '12:00'], ['오후 3:00', '15:00'], ['저녁 6:00', '18:00'], ['직접 입력', 'custom']];
const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayNum = (d) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
const mdw = (d) => `${d.getMonth() + 1}/${d.getDate()}(${WEEK_KO[d.getDay()]})`;
// 일정 날짜 글자: 하루면 '12/7(토) 18:00', 여러 날이면 '12/30(수) ~ 1/2(토) · 3박4일'
const schedWhenText = (s) => {
  const a = new Date(s.starts_at);
  const b = s.ends_at ? new Date(s.ends_at) : null;
  const time = s.all_day ? '' : ` ${pad2(a.getHours())}:${pad2(a.getMinutes())}`;
  if (b && dayNum(b) > dayNum(a)) {
    const n = Math.round((dayStart(b) - dayStart(a)) / 86400000);
    return `${mdw(a)} ~ ${mdw(b)} · ${n}박${n + 1}일`;
  }
  return `${mdw(a)}${time}`;
};
const pad2 = (n) => String(n).padStart(2, '0');

const LEFT_RAIL_WIDTH = 44; // 왼쪽 세로 색인 메뉴 폭(42) + 내용 칸 테두리(2)
const RIGHT_RAIL_WIDTH = 44;
const SIDE_MARGIN = 15; // 화면 좌우 여백 (각 15)
const RIGHT_MARGIN = SIDE_MARGIN * 2; // 좌우 여백 합계 (사진·글자 폭 계산용)
const LAST_EMAIL_STORAGE_KEY = '@me_last_login_email';
const HOME_VIEW_STORAGE_KEY = '@me_home_view_mode';
const getWindowWidth = () => Dimensions.get('window').width;
const getWindowHeight = () => Dimensions.get('window').height;
const SCREEN_WIDTH = getWindowWidth();
const SCREEN_HEIGHT = getWindowHeight();
const CONTENT_WIDTH = Math.max(240, SCREEN_WIDTH - LEFT_RAIL_WIDTH);
const COVER_HEIGHT = Math.round(CONTENT_WIDTH * (4 / 3));
const GRID_ITEM_SIZE = (CONTENT_WIDTH - RIGHT_MARGIN - 4) / 3;
const FEED_MEDIA_WIDTH = Math.max(200, CONTENT_WIDTH - RIGHT_MARGIN);
const MAX_POST_PHOTOS = 10;
// 홈 멤버 프로필 줄: 한 화면에 딱 5개가 보이도록 크기 계산
const STORY_PER_ROW = 5;
const STORY_GAP = 8;
const STORY_ITEM_W = Math.floor((CONTENT_WIDTH - RIGHT_MARGIN - 4 - STORY_GAP * (STORY_PER_ROW - 1)) / STORY_PER_ROW);
const STORY_AVATAR = STORY_ITEM_W - 8; // 테두리(2+1.5)*2 를 뺀 사진 크기
const STORY_RADIUS = Math.round(STORY_AVATAR * 0.26);
const FEED_MEDIA_MAX_HEIGHT = Math.round(SCREEN_HEIGHT * 0.72)
const EXPANDED_CHAT_HEIGHT = Math.max(200, Math.round(SCREEN_HEIGHT * 0.32));

const VISIBILITY_OPTIONS = [
  { key: 'public', label: '전체공개', icon: 'globe-outline' },
  { key: 'friends', label: '친구공개', icon: 'people-outline' },
  { key: 'private', label: '혼자보기', icon: 'lock-closed-outline' },
];

const getVisibilityLabel = (visibility) => {
  if (visibility === 'friends') return '친구공개';
  if (visibility === 'private') return '혼자보기';
  return '전체공개';
};

// --- 링크 추출 및 미리보기 유틸리티 ---
const URL_REGEX = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/i;
const linkPreviewCache = {};

const extractFirstUrl = (text) => {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(URL_REGEX);
  if (!match?.[1]) return null;
  return match[1].replace(/[.,!?;:)'"]+$/, '');
};

const getDomainFromUrl = (rawUrl) => {
  try {
    const clean = rawUrl.replace(/^https?:\/\//i, '');
    return clean.split('/')[0] || rawUrl;
  } catch {
    return rawUrl;
  }
};

const decodeHtmlEntities = (str) => {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
};

const resolveRelativeUrl = (maybeRelative, baseUrl) => {
  if (!maybeRelative) return null;
  const trimmed = maybeRelative.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) {
    const scheme = /^https:/i.test(baseUrl) ? 'https:' : 'http:';
    return `${scheme}${trimmed}`;
  }
  try {
    const baseMatch = baseUrl.match(/^(https?:\/\/[^/]+)/i);
    if (!baseMatch) return null;
    const origin = baseMatch[1];
    if (trimmed.startsWith('/')) return `${origin}${trimmed}`;
    return `${origin}/${trimmed}`;
  } catch {
    return null;
  }
};

const parseMetaFromHtml = (html, pageUrl) => {
  const getMeta = (attrName, attrValue) => {
    const re1 = new RegExp(
      `<meta[^>]+${attrName}=["']${attrValue}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      'i'
    );
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+${attrName}=["']${attrValue}["'][^>]*>`,
      'i'
    );
    const m = html.match(re1) || html.match(re2);
    return m?.[1] ? decodeHtmlEntities(m[1]) : '';
  };

  const ogTitle = getMeta('property', 'og:title') || getMeta('name', 'twitter:title');
  const ogDesc =
    getMeta('property', 'og:description') ||
    getMeta('name', 'description') ||
    getMeta('name', 'twitter:description');
  const ogImageRaw = getMeta('property', 'og:image') || getMeta('name', 'twitter:image');

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const htmlTitle = titleMatch?.[1] ? decodeHtmlEntities(titleMatch[1].replace(/\s+/g, ' ')) : '';

  return {
    title: ogTitle || htmlTitle || getDomainFromUrl(pageUrl),
    description: ogDesc || '',
    image: resolveRelativeUrl(ogImageRaw, pageUrl),
    domain: getDomainFromUrl(pageUrl),
    url: pageUrl,
  };
};

const fetchLinkPreviewData = async (url) => {
  if (linkPreviewCache[url]) return linkPreviewCache[url];

  const fallback = {
    title: getDomainFromUrl(url),
    description: '',
    image: null,
    domain: getDomainFromUrl(url),
    url,
  };

  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 4500) : null;

    const response = await fetch(url, {
      signal: controller?.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      },
    });

    if (timeoutId) clearTimeout(timeoutId);

    if (!response.ok) {
      linkPreviewCache[url] = fallback;
      return fallback;
    }

    const rawText = await response.text();
    const parsed = parseMetaFromHtml(rawText.slice(0, 120000), url);
    linkPreviewCache[url] = parsed;
    return parsed;
  } catch {
    linkPreviewCache[url] = fallback;
    return fallback;
  }
};

const LinkPreviewCard = ({ url, onPress, onLongPress }) => {
  const [preview, setPreview] = useState(() => linkPreviewCache[url] || {
    title: getDomainFromUrl(url),
    description: '',
    image: null,
    domain: getDomainFromUrl(url),
    url,
  });
  const [loadingPreview, setLoadingPreview] = useState(() => !linkPreviewCache[url]);

  useEffect(() => {
    let active = true;
    if (linkPreviewCache[url]) {
      setPreview(linkPreviewCache[url]);
      setLoadingPreview(false);
      return;
    }
    setLoadingPreview(true);
    fetchLinkPreviewData(url).then((data) => {
      if (active) {
        setPreview(data);
        setLoadingPreview(false);
      }
    });
    return () => {
      active = false;
    };
  }, [url]);

  return (
    <TouchableOpacity
      style={styles.linkPreviewCard}
      activeOpacity={0.85}
      onPress={() => onPress(url)}
      onLongPress={onLongPress}
      delayLongPress={400}
    >
      {preview.image ? (
        <Image
          source={{ uri: preview.image }}
          style={styles.linkPreviewThumb}
          resizeMode="cover"
        />
      ) : null}
      <View style={styles.linkPreviewBody}>
        <View style={styles.linkPreviewDomainRow}>
          <Ionicons name="link-outline" size={12} color="#0288D1" />
          <Text style={styles.linkPreviewDomain} numberOfLines={1}>
            {preview.domain}
          </Text>
          {loadingPreview && <ActivityIndicator size="small" color="#0288D1" style={{ marginLeft: 'auto' }} />}
        </View>
        <Text style={styles.linkPreviewTitle} numberOfLines={2}>
          {preview.title || preview.domain}
        </Text>
        {preview.description ? (
          <Text style={styles.linkPreviewDesc} numberOfLines={2}>
            {preview.description}
          </Text>
        ) : (
          <Text style={styles.linkPreviewTapHint} numberOfLines={1}>
            탭하여 사이트로 이동
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';

let supabase = null;
let initError = '';

try {
  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  } else {
    initError = `환경변수 누락 (URL: ${Boolean(supabaseUrl)}, KEY: ${Boolean(supabaseKey)})`;
  }
} catch (e) {
  initError = e?.message || String(e);
}

// 핀치 줌 + 한 손가락 드래그 + 더블 탭 확대가 가능한 이미지 뷰어
const ZoomableImage = ({ uri, aspectRatio, containerWidth, maxHeight, fillHeight = false, onZoomStateChange }) => {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });

  const scaleRef = useRef(1);
  const baseScaleRef = useRef(1);
  const pinchStartDistRef = useRef(null);
  const translateRef = useRef({ x: 0, y: 0 });
  const panOriginRef = useRef({ x: 0, y: 0 });
  const lastTapRef = useRef(0);
  const onZoomChangeRef = useRef(onZoomStateChange);

  useEffect(() => {
    onZoomChangeRef.current = onZoomStateChange;
  }, [onZoomStateChange]);

  const notifyZoom = (nextScale) => {
    if (onZoomChangeRef.current) {
      onZoomChangeRef.current(nextScale > 1.03);
    }
  };

  useEffect(() => {
    scaleRef.current = 1;
    baseScaleRef.current = 1;
    pinchStartDistRef.current = null;
    translateRef.current = { x: 0, y: 0 };
    setScale(1);
    setTranslate({ x: 0, y: 0 });
    notifyZoom(1);
  }, [uri]);

  const resetZoom = () => {
    scaleRef.current = 1;
    baseScaleRef.current = 1;
    pinchStartDistRef.current = null;
    translateRef.current = { x: 0, y: 0 };
    setScale(1);
    setTranslate({ x: 0, y: 0 });
    notifyZoom(1);
  };

  const toggleDoubleTapZoom = () => {
    if (scaleRef.current > 1.05) {
      resetZoom();
    } else {
      scaleRef.current = 2.2;
      baseScaleRef.current = 2.2;
      setScale(2.2);
      notifyZoom(2.2);
    }
  };

  const getTouchDistance = (touches) => {
    if (!touches || touches.length < 2) return null;
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.hypot(dx, dy);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches;
        if (touches && touches.length >= 2) return true;
        return scaleRef.current > 1.03 || Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
      },
      onPanResponderTerminationRequest: () => scaleRef.current <= 1.03,
      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches && touches.length >= 2) {
          pinchStartDistRef.current = getTouchDistance(touches);
          baseScaleRef.current = scaleRef.current;
        } else {
          pinchStartDistRef.current = null;
          panOriginRef.current = {
            x: translateRef.current.x,
            y: translateRef.current.y,
          };
        }
      },
      onPanResponderMove: (evt, gestureState) => {
        const touches = evt.nativeEvent.touches;
        if (touches && touches.length >= 2) {
          const dist = getTouchDistance(touches);
          if (!pinchStartDistRef.current && dist) {
            pinchStartDistRef.current = dist;
            baseScaleRef.current = scaleRef.current;
          }
          if (pinchStartDistRef.current && dist) {
            const nextScale = Math.min(4, Math.max(1, baseScaleRef.current * (dist / pinchStartDistRef.current)));
            scaleRef.current = nextScale;
            setScale(nextScale);
            notifyZoom(nextScale);
            if (nextScale <= 1.02) {
              translateRef.current = { x: 0, y: 0 };
              setTranslate({ x: 0, y: 0 });
            }
          }
        } else if (scaleRef.current > 1.03) {
          const maxOffset = Math.max(80, (containerWidth || 360) * 0.75 * (scaleRef.current - 1));
          const rawX = panOriginRef.current.x + gestureState.dx;
          const rawY = panOriginRef.current.y + gestureState.dy;
          const nextX = Math.min(maxOffset, Math.max(-maxOffset, rawX));
          const nextY = Math.min(maxOffset * 1.4, Math.max(-maxOffset * 1.4, rawY));
          translateRef.current = { x: nextX, y: nextY };
          setTranslate({ x: nextX, y: nextY });
        }
      },
      onPanResponderRelease: (_evt, gestureState) => {
        pinchStartDistRef.current = null;
        if (scaleRef.current < 1.05) {
          resetZoom();
        }
        const moved = Math.hypot(gestureState.dx, gestureState.dy);
        if (moved < 8) {
          const now = Date.now();
          if (now - lastTapRef.current < 280) {
            lastTapRef.current = 0;
            toggleDoubleTapZoom();
          } else {
            lastTapRef.current = now;
          }
        }
      },
    })
  ).current;

  const width = containerWidth || getWindowWidth();
  const ratio = aspectRatio || 1;
  const computedHeight = fillHeight
    ? (maxHeight || getWindowHeight())
    : Math.min(maxHeight || getWindowHeight() * 0.72, Math.round(width / ratio));

  return (
    <View
      style={{
        width,
        height: computedHeight,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        backgroundColor: fillHeight ? '#000000' : '#FFFFFF',
      }}
      {...panResponder.panHandlers}
    >
      <Image
        source={{ uri }}
        style={{
          width,
          height: computedHeight,
          backgroundColor: fillHeight ? '#000000' : '#FFFFFF',
          transform: [
            { translateX: translate.x },
            { translateY: translate.y },
            { scale },
          ],
        }}
        resizeMode="contain"
      />
    </View>
  );
};

// 여러 장 사진: 옆으로 넘기며 보기 + 아래 점 표시 (첫 사진 비율 기준)
const FeedImageCarousel = ({ uris, width: widthProp, onPressIndex, onDoubleLike }) => {
  const W = widthProp || FEED_MEDIA_WIDTH;
  const [ratio, setRatio] = useState(1);
  const [idx, setIdx] = useState(0);
  const [pops, setPops] = useState(0);
  const handleTap = useDoubleTap(
    (i) => onPressIndex && onPressIndex(i),
    () => { setPops((p) => p + 1); onDoubleLike && onDoubleLike(); }
  );

  useEffect(() => {
    if (!uris || !uris[0]) return;
    Image.getSize(
      uris[0],
      (w, h) => { if (w && h) setRatio(w / h); },
      () => setRatio(1)
    );
  }, [uris && uris[0]]);

  const natural = Math.round(W / (ratio || 1));
  const H = Math.min(Math.round(W * 1.03), Math.max(80, natural));

  const onEnd = (e) => {
    const x = e.nativeEvent.contentOffset.x;
    setIdx(Math.max(0, Math.min(uris.length - 1, Math.round(x / W))));
  };

  // 점 크기: 현재 점은 크게, 멀어질수록 작게
  const dotSize = (i) => {
    const d = Math.abs(i - idx);
    if (d === 0) return 7;
    if (d === 1) return 6;
    if (d === 2) return 5;
    return 4;
  };

  return (
    <View style={{ width: W }}>
      <View style={{ width: W, height: H }}>
      <ScrollView
        horizontal
        pagingEnabled
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onEnd}
        scrollEventThrottle={16}
        style={{ width: W, height: H }}
      >
        {uris.map((u, i) => (
          <TouchableOpacity
            key={u + i}
            activeOpacity={0.94}
            onPress={() => handleTap(i)}
            style={{ width: W, height: H }}
          >
            <Image source={{ uri: u }} style={{ width: W, height: H, backgroundColor: bgc('#FAFAFA') }} resizeMode="cover" />
          </TouchableOpacity>
        ))}
      </ScrollView>
      <HeartPop count={pops} />
      </View>
      <View style={styles.feedDotsRow}>
        {uris.map((u, i) => (
          <View
            key={'d' + i}
            style={[
              styles.feedDot,
              { width: dotSize(i), height: dotSize(i), backgroundColor: i === idx ? '#18181B' : '#CBD5E1' },
            ]}
          />
        ))}
      </View>
    </View>
  );
};

// 피드 화면용: 한 화면 안에 깔끔하게 들어오는 사이즈로 표시
const CompactFeedImage = ({ uri, onPress, onDoubleLike, width: widthProp }) => {
  const FEED_W = (widthProp || FEED_MEDIA_WIDTH);
  const [aspectRatio, setAspectRatio] = useState(1);
  const [pops, setPops] = useState(0);
  const handleTap = useDoubleTap(
    () => onPress && onPress(),
    () => { setPops((p) => p + 1); onDoubleLike && onDoubleLike(); }
  );

  useEffect(() => {
    if (!uri) return;
    Image.getSize(
      uri,
      (width, height) => {
        if (width && height) {
          setAspectRatio(width / height);
        }
      },
      () => setAspectRatio(1)
    );
  }, [uri]);

  // 사진 원래 비율 그대로 보여줌 (얼굴 등이 잘리지 않게). 너무 길거나 넓을 때만 contain
  const naturalHeight = Math.round(FEED_W / (aspectRatio || 1));
  // 폭은 항상 꽉 채우고, 높이는 사진 비율대로 하되 정사각형 정도(폭의 1.03배)까지만 (더 긴 사진은 가운데 기준으로 잘림)
  const targetHeight = Math.min(Math.round(FEED_W * 1.03), Math.max(80, naturalHeight));
  const photoResizeMode = 'cover';

  return (
    <TouchableOpacity activeOpacity={0.94} onPress={() => handleTap()} style={styles.compactImageWrap}>
      <Image
        source={{ uri }}
        style={[styles.compactFeedImage, { width: FEED_W, height: targetHeight }]}
        resizeMode={photoResizeMode}
      />
      <HeartPop count={pops} />
    </TouchableOpacity>
  );
};

// 전체화면 원본 사진 팝업
// 1:1 목록 오른쪽에 보이는 마지막 대화 시간 (카카오톡처럼)
const formatChatListTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, now)) {
    const h = d.getHours();
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${mm}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return '어제';
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
};

// 1:1 목록 이름 아래에 보이는 마지막 메시지 내용
const chatPreviewText = (m) => {
  if (!m) return '';
  if (m.sticker_url || m.content === STICKER_LABEL) return '이모티콘을 보냈습니다.';
  if (m.image_url) return '사진을 보냈습니다.';
  if (m.file_url) return '파일을 보냈습니다.';
  return String(m.content || '').replace(/\s+/g, ' ').trim();
};

const FullscreenPhotoPopup = ({
  photoInfo,
  currentUserId,
  onClose,
  onToggleReaction,
  onOpenCommentOrDetail,
  onOpenAuthorChat,
}) => {
  const [aspectRatio, setAspectRatio] = useState(1);
  const [isZoomed, setIsZoomed] = useState(false);
  const winWidth = getWindowWidth();
  const winHeight = getWindowHeight();

  useEffect(() => {
    if (!photoInfo?.uri) return;
    setIsZoomed(false);
    Image.getSize(
      photoInfo.uri,
      (width, height) => {
        if (width && height) {
          setAspectRatio(width / height);
        }
      },
      () => setAspectRatio(1)
    );
  }, [photoInfo?.uri]);

  if (!photoInfo) return null;

  const isLikedByMe = Boolean(photoInfo.isLikedByMe);
  const likeCount = photoInfo.likeCount ?? 0;

  return (
    <View style={styles.fullscreenViewerRoot}>
      <ZoomableImage
        uri={photoInfo.uri}
        aspectRatio={aspectRatio}
        containerWidth={winWidth}
        maxHeight={winHeight}
        fillHeight
        onZoomStateChange={setIsZoomed}
      />

      <TouchableOpacity style={styles.fullscreenBackBtn} onPress={onClose} activeOpacity={0.8}>
        <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {/* 사진 저장(다운로드) 버튼 */}
      <TouchableOpacity style={styles.fullscreenSaveBtn} onPress={() => saveImageToPhone(photoInfo.uri)} activeOpacity={0.8}>
        <Ionicons name="download-outline" size={22} color="#FFFFFF" />
      </TouchableOpacity>

      <View style={styles.fullscreenBottomOverlay} pointerEvents="box-none">
        <View style={styles.fullscreenAuthorMeta}>
          <View style={styles.fullscreenAuthorHeader}>
            {photoInfo.avatarUrl ? (
              <Image source={{ uri: photoInfo.avatarUrl }} style={styles.fullscreenAuthorAvatar} />
            ) : (
              <View style={[styles.fullscreenAuthorAvatar, styles.fullscreenDefaultAvatar]}>
                <Ionicons name="person" size={16} color="#FFFFFF" />
              </View>
            )}
            <Text style={styles.fullscreenAuthorName} numberOfLines={1}>
              {photoInfo.authorName || '내 스토리'}
            </Text>
          </View>

          {photoInfo.dateText ? (
            <Text style={styles.fullscreenSubMeta} numberOfLines={1}>
              {photoInfo.dateText}
            </Text>
          ) : null}

          {photoInfo.caption ? (
            <Text style={styles.fullscreenCaptionText} numberOfLines={2}>
              {photoInfo.caption}
            </Text>
          ) : null}
        </View>

        <View style={styles.fullscreenRightActions}>
          {photoInfo.postId && onToggleReaction && (
            <TouchableOpacity
              style={styles.fullscreenActionBtn}
              onPress={() => onToggleReaction(photoInfo.postId, 'like')}
              activeOpacity={0.8}
            >
              <Ionicons
                name={isLikedByMe ? 'heart' : 'heart-outline'}
                size={26}
                color={isLikedByMe ? '#FF4D6D' : '#FFFFFF'}
              />
              <Text style={styles.fullscreenActionCount}>{likeCount}</Text>
            </TouchableOpacity>
          )}

          {photoInfo.authorId && onOpenAuthorChat && (
            <TouchableOpacity
              style={styles.fullscreenActionBtn}
              onPress={() =>
                onOpenAuthorChat({
                  id: photoInfo.authorId,
                  nickname: photoInfo.authorName || (photoInfo.authorId === currentUserId ? '나' : '친구'),
                  avatar_url: photoInfo.avatarUrl || null,
                })
              }
              activeOpacity={0.8}
            >
              <Ionicons name="chatbubble-outline" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          )}

          {photoInfo.postId && onOpenCommentOrDetail && (
            <TouchableOpacity
              style={styles.fullscreenActionBtn}
              onPress={() => onOpenCommentOrDetail(photoInfo.postId)}
              activeOpacity={0.8}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

// 홈 BGM 안내 글자: 오른쪽에서 왼쪽으로 계속 흘러감
const BgmMarquee = ({ text, color, style }) => {
  const [boxW, setBoxW] = useState(0);
  const [textW, setTextW] = useState(0);
  const x = useRef(new Animated.Value(0)).current;

  const tw = textW || String(text || '').length * 11;
  useEffect(() => {
    if (!boxW) return;
    // 오른쪽 끝에서 시작해서 왼쪽으로 흘러감
    x.setValue(boxW);
    const anim = Animated.loop(
      Animated.timing(x, {
        toValue: -tw,
        duration: Math.max(4000, (boxW + tw) * 28),
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [boxW, tw]);

  return (
    <View style={[styles.musicMarqueeBox, style]} onLayout={(e) => setBoxW(e.nativeEvent.layout.width)}>
      <Animated.View style={{ position: 'absolute', left: 0, width: 2000, flexDirection: 'row', transform: [{ translateX: x }] }}>
        <Text
          style={[styles.musicMarqueeText, color ? { color } : null]}
          numberOfLines={1}
          onLayout={(e) => setTextW(e.nativeEvent.layout.width)}
        >
          {text}
        </Text>
      </Animated.View>
    </View>
  );
};

// 홈 위쪽 배경음악 바
const MusicBar = ({ track, playing, muted, onToggle, onNext, onToggleMute, hasNext, label, onChangeBgm }) => (
  <View style={[styles.musicBar, onChangeBgm && { marginTop: 14 }]}>
    {/* 재생기 오른쪽 위: BGM 변경 (홈에서만 보임) */}
    {onChangeBgm ? (
      <TouchableOpacity style={styles.musicChangeChip} onPress={onChangeBgm} activeOpacity={0.7} hitSlop={6}>
        <Ionicons name="swap-horizontal" size={11} color="#52525B" />
        <Text style={styles.musicChangeText}>BGM 변경</Text>
      </TouchableOpacity>
    ) : null}
    <Ionicons name="musical-notes" size={17} color={playing ? '#3F3F46' : '#A1A1AA'} />
    <View style={{ flex: 1, marginLeft: 10, marginRight: 6 }}>
      <Text style={styles.musicTitle} numberOfLines={1}>{track.title || '제목 없음'}</Text>
      {/* 둘째 줄: 재생 중이면 안내 글자가 가로로 흘러감, 멈추면 누구 노래인지 표시 */}
      {playing ? (
        <BgmMarquee text={`${label || '홈 BGM이 재생되고 있습니다.'}  ·  ${track.ownerLabel || ''}`} color="#71717A" style={{ flex: 0, alignSelf: 'stretch', marginHorizontal: 0, marginTop: 2, height: 20 }} />
      ) : (
        <Text style={styles.musicOwner} numberOfLines={1}>{track.ownerLabel}</Text>
      )}
    </View>
    <TouchableOpacity onPress={onToggleMute} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.musicMuteBtn}>
      <Ionicons name={muted ? 'volume-mute-outline' : 'volume-medium-outline'} size={16} color="#FFFFFF" />
    </TouchableOpacity>
    <TouchableOpacity onPress={onToggle} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.musicBtn}>
      <Ionicons name={playing ? 'pause' : 'play'} size={20} color="#3F3F46" />
    </TouchableOpacity>
    {hasNext ? (
      <TouchableOpacity onPress={onNext} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.musicBtn}>
        <Ionicons name="play-skip-forward" size={18} color="#3F3F46" />
      </TouchableOpacity>
    ) : null}
  </View>
);

// 친구 프로필 배경사진 위 투명 음악 재생기 (홈 재생기와 같은 구성, 검정/회색 톤만 사용)
const ProfileMusicBar = ({ track, playing, muted, onToggle, onToggleMute }) => (
  <View style={styles.pMusicBar}>
    <Ionicons name="musical-notes" size={17} color="#D4D4D8" />
    <View style={{ flex: 1, marginLeft: 10, marginRight: 6 }}>
      <Text style={styles.pMusicTitle} numberOfLines={1}>{track.title || '제목 없음'}</Text>
      {playing ? (
        <BgmMarquee text={`프로필 BGM이 재생되고 있습니다.  ·  ${track.ownerLabel || ''}`} color="#D4D4D8" style={{ flex: 0, alignSelf: 'stretch', marginHorizontal: 0, marginTop: 2, height: 20 }} />
      ) : (
        <Text style={styles.pMusicOwner} numberOfLines={1}>{track.ownerLabel}</Text>
      )}
    </View>
    <TouchableOpacity onPress={onToggleMute} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.pMusicMuteBtn}>
      <Ionicons name={muted ? 'volume-mute-outline' : 'volume-medium-outline'} size={16} color="#E4E4E7" />
    </TouchableOpacity>
    <TouchableOpacity onPress={onToggle} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.musicBtn}>
      <Ionicons name={playing ? 'pause' : 'play'} size={20} color="#E4E4E7" />
    </TouchableOpacity>
  </View>
);

// 글자만 있는 간단한 버튼: 누르는 동안 색이 바뀜
const TextBtn = ({ label, onPress, color = '#374151', pressedColor = '#2563EB' }) => (
  <Pressable onPress={onPress} hitSlop={8} style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
    {({ pressed }) => (
      <Text style={{ fontSize: 14, fontWeight: '700', color: pressed ? pressedColor : color }}>{label}</Text>
    )}
  </Pressable>
);

// 게시물 사진 보기 (검은 배경): 여러 장 넘겨보기 + 반응(따봉) 선택 + 댓글 작성
// 사진 보기 화면 안의 '확대 화면'을 폰 뒤로가기로 먼저 닫기 위한 연결 고리
const viewerBackHook = { handler: null };

const PostPhotoViewer = ({
  post,
  startIndex,
  currentUserId,
  defaultNickname,
  comments,
  onClose,
  onToggleReaction,
  onAddComment,
  onOpenMore,
  onOpenAuthorChat,
}) => {
  const winWidth = getWindowWidth();
  const winHeight = getWindowHeight();
  const uris = post.image_urls || [];
  const scrollRef = useRef(null);
  const [idx, setIdx] = useState(Math.min(startIndex || 0, Math.max(0, uris.length - 1)));
  const [reactOpen, setReactOpen] = useState(false);
  const [cmtOpen, setCmtOpen] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [singleRatio, setSingleRatio] = useState(1);
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomIdx, setZoomIdx] = useState(null);
  const [zoomRatio, setZoomRatio] = useState(1);

  // 폰 뒤로가기: 확대 화면이 열려 있으면 X 와 똑같이 확대 화면만 닫음
  useEffect(() => {
    viewerBackHook.handler = () => {
      if (zoomIdx !== null) {
        setZoomIdx(null);
        setIsZoomed(false);
        return true;
      }
      return false;
    };
    return () => { viewerBackHook.handler = null; };
  }, [zoomIdx]);

  const openZoom = (i) => {
    setReactOpen(false);
    Image.getSize(
      uris[i],
      (w, h) => { setZoomRatio(w && h ? w / h : 1); setZoomIdx(i); },
      () => { setZoomRatio(1); setZoomIdx(i); }
    );
  };

  useEffect(() => {
    if (uris.length > 1 && idx > 0) {
      const t = setTimeout(() => {
        if (scrollRef.current) scrollRef.current.scrollTo({ x: idx * winWidth, y: 0, animated: false });
      }, 30);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    if (uris.length === 1) {
      Image.getSize(
        uris[0],
        (w, h) => { if (w && h) setSingleRatio(w / h); },
        () => setSingleRatio(1)
      );
    }
  }, [uris[0]]);

  const myReaction = (post.reactions || []).find((x) => x.user_id === currentUserId);
  const myDef = myReaction ? REACTIONS.find((r) => r.type === myReaction.type) : null;
  const reactionCount = (post.reactions || []).length;
  const authorName = post.profiles?.nickname || defaultNickname || '회원';
  const avatarUrl = post.profiles?.avatar_url || null;
  const dateText = new Date(post.created_at).toLocaleString('ko-KR');
  const tops = (comments || []).filter((c) => !c.parent_id);

  const submit = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    const ok = await onAddComment(post.id, t, null);
    setSending(false);
    if (ok !== false) setText('');
  };

  const onPageEnd = (e) => {
    const x = e.nativeEvent.contentOffset.x;
    setIdx(Math.max(0, Math.min(uris.length - 1, Math.round(x / winWidth))));
  };

  return (
    <View style={styles.fullscreenViewerRoot}>
      {uris.length > 1 ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onPageEnd}
          style={{ width: winWidth, height: winHeight }}
        >
          {uris.map((u, i) => (
            <TouchableOpacity
              key={u + i}
              activeOpacity={1}
              onPress={() => openZoom(i)}
              style={{ width: winWidth, height: winHeight }}
            >
              <Image source={{ uri: u }} style={{ width: winWidth, height: winHeight }} resizeMode="contain" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : uris[0] ? (
        <ZoomableImage
          uri={uris[0]}
          aspectRatio={singleRatio}
          containerWidth={winWidth}
          maxHeight={winHeight}
          fillHeight
          onZoomStateChange={setIsZoomed}
        />
      ) : null}

      <TouchableOpacity style={styles.fullscreenBackBtn} onPress={onClose} activeOpacity={0.8}>
        <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {zoomIdx !== null && (
        <View style={styles.viewerZoomLayer}>
          <ZoomableImage
            uri={uris[zoomIdx]}
            aspectRatio={zoomRatio}
            containerWidth={winWidth}
            maxHeight={winHeight}
            fillHeight
            onZoomStateChange={setIsZoomed}
          />
          <TouchableOpacity style={[styles.fullscreenBackBtn, { zIndex: 1260 }]} onPress={() => { setZoomIdx(null); setIsZoomed(false); }} activeOpacity={0.8}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.viewerZoomHint}>
            <Text style={styles.viewerCounterText}>두 손가락으로 확대 · 두 번 탭 · 드래그</Text>
          </View>
        </View>
      )}

      {uris.length > 1 ? (
        <View style={styles.viewerCounter}>
          <Text style={styles.viewerCounterText}>{idx + 1} / {uris.length}</Text>
        </View>
      ) : null}

      {!cmtOpen && (
        <View style={styles.fullscreenBottomOverlay} pointerEvents="box-none">
          <View style={styles.fullscreenAuthorMeta}>
            {uris.length > 1 ? (
              <View style={styles.viewerDotsRow}>
                {uris.map((u, i) => (
                  <View
                    key={'vd' + i}
                    style={[styles.viewerDot, i === idx && styles.viewerDotOn]}
                  />
                ))}
              </View>
            ) : null}
            <TouchableOpacity
              style={styles.fullscreenAuthorHeader}
              activeOpacity={0.8}
              disabled={!onOpenAuthorChat || post.author_id === currentUserId}
              onPress={() =>
                onOpenAuthorChat({ id: post.author_id, nickname: authorName, avatar_url: avatarUrl })
              }
            >
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.fullscreenAuthorAvatar} />
              ) : (
                <View style={[styles.fullscreenAuthorAvatar, styles.fullscreenDefaultAvatar]}>
                  <Ionicons name="person" size={16} color="#FFFFFF" />
                </View>
              )}
              <Text style={styles.fullscreenAuthorName} numberOfLines={1}>{authorName}</Text>
            </TouchableOpacity>
            <Text style={styles.fullscreenSubMeta} numberOfLines={1}>{dateText}</Text>
            {post.content ? (
              <Text style={styles.fullscreenCaptionText} numberOfLines={2}>{post.content}</Text>
            ) : null}
          </View>

          <View style={styles.fullscreenRightActions}>
            {/* 따봉 버튼: 누르면 반응이 옆으로 펼쳐짐 */}
            <View style={{ alignItems: 'center' }}>
              {reactOpen && (
                <View style={styles.reactPickRow}>
                  {REACTIONS.map((r) => {
                    const on = myReaction && myReaction.type === r.type;
                    return (
                      <TouchableOpacity
                        key={r.type}
                        style={[styles.reactPickItem, on && styles.reactPickItemOn]}
                        activeOpacity={0.8}
                        onPress={() => {
                          onToggleReaction(post.id, r.type);
                          setReactOpen(false);
                        }}
                      >
                        <Ionicons name={r.icon.replace('-outline', '')} size={24} color={r.color} />
                        <Text style={styles.reactPickLabel}>{r.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              <TouchableOpacity
                style={styles.fullscreenActionBtn}
                activeOpacity={0.8}
                onPress={() => { hapticSelect(); setReactOpen((v) => !v); }}
              >
                <BounceView trigger={myReaction ? myReaction.type : 'none'}>
                  <Ionicons
                    name={myDef ? myDef.icon.replace('-outline', '') : 'thumbs-up-outline'}
                    size={27}
                    color={myDef ? myDef.color : '#FFFFFF'}
                  />
                </BounceView>
                <Text style={styles.fullscreenActionCount}>{reactionCount}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.fullscreenActionBtn}
              activeOpacity={0.8}
              onPress={() => { setReactOpen(false); setCmtOpen(true); }}
            >
              <Ionicons name="chatbubble-outline" size={25} color="#FFFFFF" />
              <Text style={styles.fullscreenActionCount}>{tops.length}</Text>
            </TouchableOpacity>

            {/* 조회수 (게시물을 열었을 때만 보임) */}
            <View style={styles.fullscreenActionBtn}>
              <Ionicons name="eye-outline" size={24} color="#FFFFFF" />
              <Text style={styles.fullscreenActionCount}>{post.view_count || 0}</Text>
            </View>

          </View>
        </View>
      )}

      {cmtOpen && (
        <KeyboardAvoidingView
          style={[styles.viewerCmtWrap, { height: Math.round(winHeight * 0.5) }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* 사진 아래쪽 50%에 음영이 생기고, 그 안에 댓글과 입력창이 보임 */}
          <View style={styles.viewerCmtShade}>
            <View style={styles.viewerCmtHeader}>
              <Text style={styles.viewerCmtTitle}>댓글 {tops.length}</Text>
              <TouchableOpacity onPress={() => setCmtOpen(false)} hitSlop={8} style={{ padding: 4 }}>
                <Ionicons name="chevron-down" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
              {tops.length === 0 ? (
                <Text style={styles.viewerCmtEmpty}>첫 댓글을 남겨 보세요.</Text>
              ) : (
                tops.map((c) => (
                  <Text key={String(c.id)} style={styles.viewerCmtItem}>
                    <Text style={{ fontWeight: '700' }}>{c.authorName || '회원'} </Text>
                    {c.content}
                  </Text>
                ))
              )}
            </ScrollView>
            {/* 키보드가 열려 있어도 보내기 버튼을 한 번만 누르면 바로 전송되도록 감싸줌 */}
            <ScrollView
              scrollEnabled={false}
              keyboardShouldPersistTaps="always"
              style={{ flexGrow: 0 }}
              contentContainerStyle={styles.viewerCmtInputRow}
            >
              <TextInput
                style={styles.viewerCmtInput}
                value={text}
                onChangeText={setText}
                placeholder="댓글 달기..."
                placeholderTextColor="#A1A1AA"
                onSubmitEditing={submit}
                returnKeyType="send"
                blurOnSubmit={false}
              />
              <TouchableOpacity
                onPress={submit}
                disabled={!text.trim() || sending}
                activeOpacity={0.7}
                style={[styles.viewerCmtSend, (!text.trim() || sending) && { opacity: 0.45 }]}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#111111" />
                ) : (
                  <Text style={styles.viewerCmtSendText}>보내기</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
};

// 게시물 상세 팝업 (댓글/대댓글 작성·수정·삭제, 등록 후 입력창만 닫힘)
const PostDetailPopup = ({
  post,
  currentUserId,
  defaultNickname,
  comments,
  onAddComment,
  onEditComment,
  onDeleteComment,
  onClose,
  onToggleReaction,
  onSaveEdit,
  onDeletePost,
  onOpenFullImage,
  onReportPost,
  onBlockUser,
}) => {
  const [aspectRatio, setAspectRatio] = useState(1);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [editVisibility, setEditVisibility] = useState('public');

  const [composerOpen, setComposerOpen] = useState(false);
  const [replyTargetComment, setReplyTargetComment] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentText, setEditingCommentText] = useState('');

  const [isZoomed, setIsZoomed] = useState(false);
  const [popIdx, setPopIdx] = useState(0);
  const winWidth = getWindowWidth();
  const winHeight = getWindowHeight();

  useEffect(() => {
    setPopIdx(0);
    setIsEditing(false);
    setEditValue(post?.content || '');
    setEditVisibility(post?.visibility || 'public');
    setComposerOpen(false);
    setReplyTargetComment(null);
    setCommentText('');
    setEditingCommentId(null);
    setEditingCommentText('');
    setIsZoomed(false);
    const imgUri = post?.image_urls?.[0];
    if (!imgUri) return;
    Image.getSize(
      imgUri,
      (width, height) => {
        if (width && height) setAspectRatio(width / height);
      },
      () => setAspectRatio(1)
    );
  }, [post?.id]);

  if (!post) return null;

  const isMyPost = post.author_id === currentUserId;
  const imgUri = post.image_urls?.[0];
  const popUris = post.image_urls || [];
  const popH = Math.min(Math.round(winHeight * 0.56), Math.max(120, Math.round(winWidth / (aspectRatio || 1))));

  const openNewCommentComposer = () => {
    setReplyTargetComment(null);
    setComposerOpen(true);
  };

  const openReplyComposer = (targetComment) => {
    setReplyTargetComment(targetComment);
    setComposerOpen(true);
  };

  const closeComposerOnly = () => {
    setComposerOpen(false);
    setReplyTargetComment(null);
    setCommentText('');
  };

  const handleSubmitComment = async () => {
    const trimmed = commentText.trim();
    if (!trimmed || submittingComment) return;
    setSubmittingComment(true);
    const parentId = replyTargetComment ? replyTargetComment.id : null;
    const ok = await onAddComment(post.id, trimmed, parentId);
    setSubmittingComment(false);
    if (ok) {
      closeComposerOnly();
    }
  };

  const handleSaveCommentEdit = async (commentId) => {
    const trimmed = editingCommentText.trim();
    if (!trimmed) return;
    const ok = await onEditComment(post.id, commentId, trimmed);
    if (ok) {
      setEditingCommentId(null);
      setEditingCommentText('');
    }
  };

  const topLevelComments = comments.filter((c) => !c.parent_id);
  const repliesByParent = {};
  comments.forEach((c) => {
    if (c.parent_id) {
      const pKey = String(c.parent_id);
      if (!repliesByParent[pKey]) repliesByParent[pKey] = [];
      repliesByParent[pKey].push(c);
    }
  });

  const renderCommentRow = (c, isReply = false) => {
    const isMine = c.user_id === currentUserId;
    const isEditingThis = String(editingCommentId) === String(c.id);

    return (
      <View
        key={String(c.id)}
        style={[styles.commentItemRow, isReply && styles.replyItemRow]}
      >
        <View style={styles.commentTopMetaRow}>
          <Text style={styles.commentAuthorText}>
            {isReply ? `↳ ${c.authorName || '회원'}` : (c.authorName || '회원')}
          </Text>
          <Text style={styles.commentTimeText}>
            {new Date(c.created_at).toLocaleString('ko-KR', {
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>

        {isEditingThis ? (
          <View style={{ marginTop: 6 }}>
            <TextInput
              style={styles.commentEditInput}
              value={editingCommentText}
              onChangeText={setEditingCommentText}
              multiline
              autoFocus
            />
            <View style={styles.commentActionLinksRow}>
              <TouchableOpacity
                onPress={() => {
                  setEditingCommentId(null);
                  setEditingCommentText('');
                }}
              >
                <Text style={styles.commentActionLink}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleSaveCommentEdit(c.id)}>
                <Text style={[styles.commentActionLink, { color: '#0288D1', fontWeight: '700' }]}>저장</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <Text style={styles.commentContentText}>{c.content}</Text>
            <View style={styles.commentActionLinksRow}>
              {isMine && (
                <>
                  <TouchableOpacity
                    onPress={() => {
                      setEditingCommentId(c.id);
                      setEditingCommentText(c.content || '');
                    }}
                  >
                    <Text style={styles.commentActionLink}>수정</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => onDeleteComment(post.id, c.id)}>
                    <Text style={[styles.commentActionLink, { color: '#DC2626' }]}>삭제</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.whitePopupBackdrop}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.whitePopupTopBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          {post.profiles?.avatar_url ? (
            <Image source={{ uri: post.profiles.avatar_url }} style={styles.popupSmallAvatar} />
          ) : (
            <View style={[styles.popupSmallAvatar, styles.defaultSmallAvatar]}>
              <Ionicons name="person" size={16} color="#64748B" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.whitePopupTitle} numberOfLines={1}>
                {post.profiles?.nickname || defaultNickname || '내 스토리'}
              </Text>
              <View style={styles.visibilityPill}>
                <Text style={styles.visibilityPillText}>{getVisibilityLabel(post.visibility)}</Text>
              </View>
            </View>
            <Text style={{ color: '#777777', fontSize: 11 }}>
              {new Date(post.created_at).toLocaleString('ko-KR')}  ·  조회 {post.view_count || 0}
            </Text>
          </View>
        </View>

        {isMyPost && !isEditing && (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TextBtn
              label="수정"
              onPress={() => {
                setEditValue(post.content || '');
                setEditVisibility(post.visibility || 'public');
                setIsEditing(true);
              }}
            />
            <TextBtn label="삭제" pressedColor="#DC2626" onPress={() => onDeletePost(post.id)} />
          </View>
        )}

        {!isMyPost && (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TextBtn label="신고" pressedColor="#DC2626" onPress={() => onReportPost && onReportPost(post)} />
          </View>
        )}

        <TextBtn label="닫기" onPress={onClose} />
      </View>

      <ScrollView
        style={{ width: '100%', flex: 1 }}
        scrollEnabled={!isZoomed}
        contentContainerStyle={{ alignItems: 'center', paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        {imgUri && (
          <View style={{ width: '100%', alignItems: 'center', backgroundColor: bgc('#FFFFFF') }}>
            {popUris.length > 1 ? (
              <>
                <ScrollView
                  horizontal
                  pagingEnabled
                  nestedScrollEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={(e) =>
                    setPopIdx(Math.max(0, Math.min(popUris.length - 1, Math.round(e.nativeEvent.contentOffset.x / winWidth))))
                  }
                  style={{ width: winWidth, height: popH }}
                >
                  {popUris.map((u, i) => (
                    <Image
                      key={u + i}
                      source={{ uri: u }}
                      style={{ width: winWidth, height: popH, backgroundColor: bgc('#FAFAFA') }}
                      resizeMode="contain"
                    />
                  ))}
                </ScrollView>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 20 }}>
                  {popUris.map((u, i) => (
                    <View
                      key={'pd' + i}
                      style={{
                        width: i === popIdx ? 7 : 5,
                        height: i === popIdx ? 7 : 5,
                        borderRadius: 4,
                        marginHorizontal: 2.5,
                        backgroundColor: i === popIdx ? '#18181B' : '#CBD5E1',
                      }}
                    />
                  ))}
                </View>
              </>
            ) : (
              <ZoomableImage
                uri={imgUri}
                aspectRatio={aspectRatio}
                containerWidth={winWidth}
                maxHeight={Math.round(winHeight * 0.56)}
                onZoomStateChange={setIsZoomed}
              />
            )}
            <View style={styles.imageToolbarRow}>
              <Text style={styles.zoomHintText}>
                {popUris.length > 1 ? `옆으로 넘기기 · ${popIdx + 1}/${popUris.length}` : '핀치 줌 / 드래그 / 더블 탭 확대'}
              </Text>
              <TouchableOpacity
                style={styles.fullViewChipBtn}
                onPress={() =>
                  onOpenFullImage({
                    uri: popUris[popIdx] || imgUri,
                    index: popIdx,
                    postId: post.id,
                    authorId: post.author_id,
                    authorName: post.profiles?.nickname || defaultNickname || '내 스토리',
                    avatarUrl: post.profiles?.avatar_url || null,
                    dateText: new Date(post.created_at).toLocaleString('ko-KR'),
                    caption: post.content || '',
                    likeCount: post.reactions?.length || 0,
                    isLikedByMe: Boolean(post.reactions?.some((x) => x.user_id === currentUserId)),
                  })
                }
              >
                <Ionicons name="expand-outline" size={13} color="#222222" />
                <Text style={styles.fullViewChipText}>전체화면</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.whiteDetailBodyBox}>
          {isEditing ? (
            <View style={{ marginBottom: 12 }}>
              <View style={styles.visibilitySelectorRow}>
                {VISIBILITY_OPTIONS.map((opt) => {
                  const active = editVisibility === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[styles.visibilitySelectChip, active && styles.visibilitySelectChipActive]}
                      onPress={() => setEditVisibility(opt.key)}
                    >
                      <Ionicons
                        name={opt.icon}
                        size={13}
                        color={active ? '#FFFFFF' : '#475569'}
                      />
                      <Text style={[styles.visibilitySelectText, active && styles.visibilitySelectTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TextInput
                style={styles.whiteDetailEditInput}
                value={editValue}
                onChangeText={setEditValue}
                multiline
                autoFocus
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <TouchableOpacity
                  style={styles.whitePopupMiniBtn}
                  onPress={() => setIsEditing(false)}
                >
                  <Text style={styles.whitePopupMiniBtnText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.whitePopupMiniBtn, { backgroundColor: '#0288D1' }]}
                  onPress={async () => {
                    await onSaveEdit(post.id, editValue, editVisibility);
                    setIsEditing(false);
                  }}
                >
                  <Text style={[styles.whitePopupMiniBtnText, { color: '#FFFFFF' }]}>저장</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            post.content ? <Text style={styles.whiteDetailContentText}>{post.content}</Text> : null
          )}

          <View style={styles.whiteDetailReactionRow}>
            {REACTIONS.map((r) => {
              const count = post.reactions?.filter((x) => x.type === r.type).length || 0;
              return (
                <TouchableOpacity
                  key={r.type}
                  style={styles.whiteDetailReactionBtn}
                  onPress={() => onToggleReaction(post.id, r.type)}
                >
                  <Ionicons name={r.icon} size={14} color={r.color} />
                  <Text style={styles.whiteDetailReactionText}>
                    {r.label} {count > 0 ? count : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.commentSectionBox}>
            <View style={styles.commentSectionHeader}>
              <Text style={styles.commentSectionTitle}>댓글 {comments.length}</Text>
              {!composerOpen && (
                <TouchableOpacity style={styles.openCommentComposerBtn} onPress={openNewCommentComposer}>
                  <Ionicons name="create-outline" size={14} color="#0288D1" />
                  <Text style={styles.openCommentComposerText}>댓글 작성</Text>
                </TouchableOpacity>
              )}
            </View>

            {topLevelComments.length === 0 ? (
              <Text style={styles.commentEmptyText}>아직 댓글이 없습니다. 첫 댓글을 남겨 보세요!</Text>
            ) : (
              topLevelComments.map((c) => {
                return (
                  <View key={String(c.id)} style={{ marginBottom: 4 }}>
                    {renderCommentRow(c, false)}
                  </View>
                );
              })
            )}
          </View>
        </View>
      </ScrollView>

      {composerOpen && (
        <View style={styles.commentComposerPanel}>
          <View style={styles.composerBannerRow}>
            <Text style={styles.composerBannerText} numberOfLines={1}>
              {replyTargetComment
                ? `@${replyTargetComment.authorName || '회원'} 님에게 대댓글 작성 중`
                : '새 댓글 작성 중'}
            </Text>
            <TouchableOpacity onPress={closeComposerOnly} style={styles.composerCloseBtn}>
              <Ionicons name="close" size={15} color="#52525B" />
              <Text style={styles.composerCloseText}>닫기</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.commentInputBar}>
            <TextInput
              style={styles.commentTextInput}
              placeholder={replyTargetComment ? '대댓글을 입력하세요...' : '댓글을 입력하세요...'}
              value={commentText}
              onChangeText={setCommentText}
              multiline
              autoFocus
            />
            <TouchableOpacity
              style={[styles.commentSubmitBtn, (!commentText.trim() || submittingComment) && { opacity: 0.5 }]}
              onPress={handleSubmitComment}
              disabled={!commentText.trim() || submittingComment}
            >
              <Text style={styles.commentSubmitText}>등록</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
};

const REACTIONS = [
  { type: 'like', label: '좋아요', icon: 'heart-outline', color: '#E11D48' },
  { type: 'cool', label: '멋져요', icon: 'thumbs-up-outline', color: '#0284C7' },
  { type: 'happy', label: '기뻐요', icon: 'happy-outline', color: '#D97706' },
  { type: 'sad', label: '슬퍼요', icon: 'sad-outline', color: '#4F46E5' },
  { type: 'cheer', label: '힘내요', icon: 'flame-outline', color: '#EA580C' },
];

const getKoreanErrorMessage = (error) => {
  if (!error) return '알 수 없는 오류가 발생했습니다.';
  const code = (error.code || '').toLowerCase();
  const msg = (error.message || '').toLowerCase();

  if (msg.includes('invalid login credentials') || code === 'invalid_credentials') {
    return '이메일 또는 비밀번호가 올바르지 않습니다.';
  }
  if (msg.includes('missing email or phone')) {
    return '이메일을 입력해 주세요.';
  }
  if (msg.includes('user already registered') || code === 'user_already_exists') {
    return '이미 가입된 이메일 주소입니다.';
  }
  if (msg.includes('password should be at least') || code === 'weak_password') {
    return '비밀번호는 최소 6자 이상이어야 합니다.';
  }
  if (msg.includes('unable to validate email address') || msg.includes('invalid email')) {
    return '올바른 이메일 형식이 아닙니다.';
  }
  if (msg.includes('rate limit') || code === 'over_request_rate_limit') {
    return '요청 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  }
  if (msg.includes('network request failed') || msg.includes('fetch failed')) {
    return '인터넷 연결 상태를 확인해 주세요.';
  }
  if (msg.includes('row-level security') || code === '42501') {
    return '해당 작업에 대한 접근 권한이 없습니다.';
  }
  return `요청을 처리하지 못했습니다.\n(${error.message})`;
};

const showAlert = (title, message, onConfirm) => {
  Alert.alert(title, message, [{ text: '확인', onPress: onConfirm }]);
};


// Android 16: 화면이 상태바·내비게이션바 밑까지 그려지므로 그 높이만큼 비워 줌
export default function App() {
  return (
    <SafeAreaProvider>
      <AppMain />
    </SafeAreaProvider>
  );
}

function AppMain() {
  const fontsReady = useAppFonts();
  useTheme();
  const insets = useSafeAreaInsets();

  // ---- 배경음악 ----
  const soundRef = useRef(null);
  const bgmPlayingRef = useRef(false);
  // 음악 저장소: 연속 재생 목록과 반복 설정
  const musicQueueRef = useRef([]);
  const musicRepeatRef = useRef(true);
  const bgmListRef = useRef([]);
  const [bgmTrack, setBgmTrack] = useState(null);
  const [bgmPlaying, setBgmPlayingState] = useState(false);
  const [tempBgmUri, setTempBgmUri] = useState(null);
  const [tempBgmName, setTempBgmName] = useState('');
  const [tempBgmTitle, setTempBgmTitle] = useState('');
  const [tempBgmMime, setTempBgmMime] = useState('audio/mpeg');
  const [bgmChanged, setBgmChanged] = useState(false);
  // 처음 접속하면 음소거 상태로 자동재생 (스피커 버튼을 누르면 소리가 나옴)
  const [bgmMuted, setBgmMutedState] = useState(true);
  const bgmMutedRef = useRef(true);
  const bgmToggleMute = async () => {
    const next = !bgmMutedRef.current;
    bgmMutedRef.current = next;
    setBgmMutedState(next);
    if (soundRef.current) {
      try { await soundRef.current.setIsMutedAsync(next); } catch (e) { /* 무시 */ }
    }
  };

  // 사용자가 직접 곡을 고르거나 미리 들을 때는 음소거를 풀어서 소리가 나오게 함
  const bgmUnmute = () => {
    bgmMutedRef.current = false;
    setBgmMutedState(false);
  };

  const setBgmPlaying = (v) => {
    bgmPlayingRef.current = v;
    setBgmPlayingState(v);
  };

  const bgmUnload = async () => {
    const snd = soundRef.current;
    soundRef.current = null;
    if (snd) {
      try { snd.setOnPlaybackStatusUpdate(null); await snd.unloadAsync(); } catch (e) { /* 무시 */ }
    }
  };

  const bgmNext = async (current) => {
    // 음악 저장소에서 듣는 중이면 그 목록의 다음 곡
    const q = musicQueueRef.current || [];
    const qi = current ? q.findIndex((x) => x.url === current.url) : -1;
    if (qi >= 0) {
      let ni = qi + 1;
      if (ni >= q.length) {
        if (!musicRepeatRef.current) { setBgmPlaying(false); return; }
        ni = 0;
      }
      await bgmPlay(q[ni]);
      return;
    }
    const list = bgmListRef.current || [];
    if (!list.length) return;
    const i = list.findIndex((m) => m.bgm_url === (current && current.url));
    const nextM = list[(i + 1) % list.length];
    if (nextM) await bgmPlay(bgmToTrack(nextM));
  };

  // bgm 폴더는 비공개: 저장된 주소에서 파일 위치를 꺼내 로그인한 사람만 쓸 수 있는 임시 주소(6시간)로 바꿈
  const resolveBgmUri = async (url) => {
    try {
      const m = url && url.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/bgm\/([^?]+)/);
      if (!m) return url;
      const path = decodeURIComponent(m[1]);
      const { data, error } = await supabase.storage.from('bgm').createSignedUrl(path, 60 * 60 * 6);
      if (error || !data || !data.signedUrl) return url;
      return data.signedUrl;
    } catch (e) {
      return url;
    }
  };

  const bgmPlay = async (track) => {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
      await bgmUnload();
      setBgmTrack(track);
      const playUri = await resolveBgmUri(track.url);
      const { sound } = await Audio.Sound.createAsync({ uri: playUri }, { shouldPlay: true, isMuted: bgmMutedRef.current });
      soundRef.current = sound;
      setBgmPlaying(true);
      sound.setOnPlaybackStatusUpdate((st) => {
        if (st && st.didJustFinish) bgmNext(track);
      });
    } catch (e) {
      setBgmPlaying(false);
      showAlert('음악 재생 오류', `음악을 재생하지 못했습니다.\n(${e?.message || e})`);
    }
  };

  const bgmToggle = async (fallbackTrack) => {
    const snd = soundRef.current;
    if (!snd) {
      const t = bgmTrack || fallbackTrack;
      if (t) await bgmPlay(t);
      return;
    }
    try {
      const st = await snd.getStatusAsync();
      if (st && st.isLoaded && st.isPlaying) {
        await snd.pauseAsync();
        setBgmPlaying(false);
      } else {
        await snd.playAsync();
        setBgmPlaying(true);
      }
    } catch (e) {
      setBgmPlaying(false);
    }
  };

  const bgmToTrack = (m) => ({
    url: m.bgm_url,
    title: m.bgm_title,
    ownerId: m.id,
    ownerLabel: m.id === session?.user?.id ? '내 노래' : `${m.nickname || '회원'}님의 노래`,
  });

  // 앱을 열거나 다시 볼 때 앱 아이콘의 빨간 숫자(배지)와 알림창의 알림을 지움
  useEffect(() => {
    const clearBadge = () => {
      Notifications.setBadgeCountAsync(0).catch(() => {});
      Notifications.dismissAllNotificationsAsync().catch(() => {});
    };
    clearBadge();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') clearBadge(); });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active' && soundRef.current && bgmPlayingRef.current) {
        soundRef.current.pauseAsync().catch(() => {});
        setBgmPlaying(false);
      }
    });
    return () => {
      sub.remove();
      bgmUnload();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      bgmUnload();
      setBgmPlaying(false);
      setBgmTrack(null);
    }
  }, [session]);
  const [showGroupChat, setShowGroupChat] = useState(false);
  const [session, setSession] = useState(null);
  const [isSignUpScreen, setIsSignUpScreen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  // 마지막 접속 시간 기록: 앱을 열 때 + 다른 앱에서 돌아올 때 profiles.last_seen_at 에 저장 (2분에 한 번까지만)
  const lastSeenSentRef = useRef(0);
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    const markSeen = async () => {
      const now = Date.now();
      if (now - lastSeenSentRef.current < 2 * 60 * 1000) return;
      lastSeenSentRef.current = now;
      try {
        await supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', uid);
      } catch (e) { /* 기록 실패해도 앱 사용에는 문제 없음 */ }
    };
    markSeen();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') markSeen();
    });
    return () => sub.remove();
  }, [session?.user?.id]);

  const [mainTab, setMainTab] = useState('home');
  const [postsMemberId, setPostsMemberId] = useState(null); // 게시글 탭에서 고른 회원
  const [brandMenuOpen, setBrandMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [topBarBottom, setTopBarBottom] = useState(56);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);

  // 접속시 음악 자동재생 켬/끔 (기본: 켬 — 처음 홈화면에 들어오면 바로 재생)
  const BGM_AUTOSTART_KEY = 'bgm_autostart_v1';
  const [bgmAutoStart, setBgmAutoStart] = useState(true);
  const [bgmAutoLoaded, setBgmAutoLoaded] = useState(false);
  const bgmAutoDoneRef = useRef(false);
  useEffect(() => {
    AsyncStorage.getItem(BGM_AUTOSTART_KEY)
      .then((v) => setBgmAutoStart(v !== '0'))
      .catch(() => {})
      .then(() => setBgmAutoLoaded(true));
  }, []);
  const toggleBgmAutoStart = () => {
    const next = !bgmAutoStart;
    setBgmAutoStart(next);
    AsyncStorage.setItem(BGM_AUTOSTART_KEY, next ? '1' : '0').catch(() => {});
  };
  const [incomingListExpanded, setIncomingListExpanded] = useState(true);
  const [onlyFavoritesFeed, setOnlyFavoritesFeed] = useState(false);

  const [profile, setProfile] = useState({
    nickname: '',
    bio: '나만의 스토리를 기록해 보세요 ✨',
    avatar_url: null,
    cover_url: null,
    today_visits: 0,
    total_visits: 0,
  });

  const [editProfileModal, setEditProfileModal] = useState(false);
  const [tempNickname, setTempNickname] = useState('');
  const [tempBio, setTempBio] = useState('');
  const [tempAvatarUri, setTempAvatarUri] = useState(null);
  const [tempCoverUri, setTempCoverUri] = useState(null);

  const [members, setMembers] = useState([]);

  useEffect(() => {
    if (!bgmAutoLoaded || !bgmAutoStart || bgmAutoDoneRef.current) return;
    if (!session || !session.user) return;
    if (mainTab !== 'home') return;
    const list = bgmListRef.current || [];
    if (list.length === 0) return;
    bgmAutoDoneRef.current = true;
    bgmPlay(bgmToTrack(list[0]));
  }, [bgmAutoLoaded, bgmAutoStart, session && session.user && session.user.id, members, mainTab]);
  const [friendRelationMap, setFriendRelationMap] = useState({});
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [friendsSectionOpen, setFriendsSectionOpen] = useState(true);
  const [selectedFriend, setSelectedFriend] = useState(null);

  // 친구 프로필을 열면 그 친구의 노래가 자동으로 재생되고, 프로필을 닫거나 게시물을 봐도 계속 유지됨
  // (다른 친구 프로필을 열면 그 친구 노래로 바뀌고, 위쪽 음악 바에서 멈출 수 있음)
  useEffect(() => {
    const f = selectedFriend;
    if (!f || !f.bgm_url) return;
    if (bgmTrack && bgmTrack.url === f.bgm_url && bgmPlayingRef.current) return;
    bgmPlay(bgmToTrack(f));
  }, [selectedFriend && selectedFriend.id]);

  const [posts, setPosts] = useState([]);
  const [writeModalVisible, setWriteModalVisible] = useState(false);
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [imageUri, setImageUri] = useState(null);
  const [postImages, setPostImages] = useState([]); // 새 게시물 사진 (최대 10장)
  const [postPhotoBusy, setPostPhotoBusy] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');

  // AI 문구 추천: 첫 번째 사진을 작게 줄여서 Edge Function(suggest-caption)에 보내고 문구 3개를 받음
  const suggestCaptionWithAI = async () => {
    if (aiBusy || postImages.length === 0) return;
    setAiBusy(true);
    setAiError('');
    setAiSuggestions([]);
    try {
      const small = await ImageManipulator.manipulateAsync(
        postImages[0],
        [{ resize: { width: 640 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      const { data, error } = await supabase.functions.invoke('suggest-caption', {
        body: { image: small.base64, hint: content.trim() },
      });
      if (error) throw error;
      const list = data && Array.isArray(data.suggestions) ? data.suggestions : [];
      if (list.length === 0) throw new Error('empty');
      setAiSuggestions(list.slice(0, 3));
    } catch (e) {
      setAiError('추천을 불러오지 못했어요. 잠시 후 다시 눌러 주세요.');
    } finally {
      setAiBusy(false);
    }
  };
  const [loading, setLoading] = useState(false);

  const [commentsByPostRaw, setCommentsByPost] = useState({});
  const [blockedIds, setBlockedIds] = useState([]);
  const [blockListOpen, setBlockListOpen] = useState(false);
  // 차단한 사람의 댓글은 보이지 않게 걸러냄
  const commentsByPost = blockedIds.length
    ? Object.fromEntries(
        Object.entries(commentsByPostRaw).map(([k, v]) => [
          k,
          (v || []).filter((c) => !blockedIds.includes(c.user_id)),
        ])
      )
    : commentsByPostRaw;

  const [selectedPostId, setSelectedPostId] = useState(null);
  const [viewingImage, setViewingImage] = useState(null);
  // 게시물 조회수: 다른 사람이 게시물을 열면 1명당 1번만 올라감 (서버 함수 record_post_view)
  const viewedPostIdsRef = useRef(new Set());
  const recordPostView = async (postId) => {
    if (!postId || !session) return;
    const key = String(postId);
    if (viewedPostIdsRef.current.has(key)) return;
    viewedPostIdsRef.current.add(key);
    try {
      const { data, error } = await supabase.rpc('record_post_view', { p_post_id: postId });
      if (!error && typeof data === 'number') {
        setPosts((prev) => prev.map((p) => (String(p.id) === key ? { ...p, view_count: data } : p)));
      }
    } catch (e) { /* 실패해도 앱 사용에는 문제 없음 */ }
  };

  const [unreadCountBySender, setUnreadCountBySender] = useState({});
  const [incomingMsgBanner, setIncomingMsgBanner] = useState(null);
  const bannerTimerRef = useRef(null);

  const [chatPartner, setChatPartner] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [chatAttachMenuOpen, setChatAttachMenuOpen] = useState(false);
  const [chatStickerOpen, setChatStickerOpen] = useState(false);
  const [chatGalleryOpen, setChatGalleryOpen] = useState(false);
  const [postGalleryOpen, setPostGalleryOpen] = useState(false);
  const [homeListWidth, setHomeListWidth] = useState(0);
  const inlineChatScrollRef = useRef(null);
  // 폴드를 펼친 화면·태블릿처럼 넓은 화면이면 1:1 목록 옆에 대화창을 나란히 보여줌
  const { width: windowWidth } = useWindowDimensions();
  const isWideScreen = windowWidth >= 600;

  // 1:1 대화창: 키보드가 다 올라온 뒤 맨 아래(마지막 메시지)로 다시 내림
  useEffect(() => {
    if (!chatPartner) return undefined;
    const toEnd = () => {
      setTimeout(() => inlineChatScrollRef.current?.scrollToEnd({ animated: true }), 120);
      setTimeout(() => inlineChatScrollRef.current?.scrollToEnd({ animated: true }), 350);
    };
    const s1 = Keyboard.addListener('keyboardDidShow', toEnd);
    const s2 = Keyboard.addListener('keyboardDidHide', toEnd);
    return () => { s1.remove(); s2.remove(); };
  }, [chatPartner]);

  const lastBackPressRef = useRef(0);

  const [homeGrid, setHomeGrid] = useState(false);
  const [memberFilterFriends, setMemberFilterFriends] = useState(false); // 홈 멤버 줄: true=친구만, false=모두
  const [lastMsgByPartner, setLastMsgByPartner] = useState({}); // 상대별 마지막 메시지 (1:1 목록용)
  const [memberSearch, setMemberSearch] = useState(''); // 회원 탭 검색어
  const [memberSearchOpen, setMemberSearchOpen] = useState(false);
  const memberPostsFromListRef = useRef(false); // 회원 탭에서 게시물을 열었으면 뒤로 누를 때 회원 탭으로
  const [memberPostsUser, setMemberPostsUser] = useState(null); // 프로필에서 '게시물'을 누른 멤버
  const [memberPostsGrid, setMemberPostsGrid] = useState(true); // 격자 보기 / 크게 보기
  const [memberMenuOpen, setMemberMenuOpen] = useState(false); // 회원 페이지 ··· 메뉴
  const [commentPanelPostId, setCommentPanelPostId] = useState(null);
  const [panelCommentText, setPanelCommentText] = useState('');
  const [panelReplyTarget, setPanelReplyTarget] = useState(null);
  const [commentSheetPost, setCommentSheetPost] = useState(null); // 아래에서 올라오는 댓글 팝업의 게시물
  const [sheetSending, setSheetSending] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(HOME_VIEW_STORAGE_KEY)
      .then((v) => { if (v === 'grid') setHomeGrid(true); })
      .catch(() => {});
  }, []);
  const changeHomeView = (grid) => {
    setHomeGrid(grid);
    AsyncStorage.setItem(HOME_VIEW_STORAGE_KEY, grid ? 'grid' : 'feed').catch(() => {});
  };

  useEffect(() => {
    AsyncStorage.getItem(LAST_EMAIL_STORAGE_KEY).then((savedEmail) => {
      if (savedEmail) {
        setEmail((prev) => prev || savedEmail);
      }
    });
  }, []);

  // 폰 상단 푸시 알림 탭 시 해당 보낸 사람 대화방으로 이동
  useEffect(() => {
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const senderId = response?.notification?.request?.content?.data?.senderId;
      if (!senderId || !session?.user?.id || senderId === session.user.id) return;
      const targetMember = members.find((m) => m.id === senderId) || {
        id: senderId,
        nickname: response?.notification?.request?.content?.title || '친구',
        avatar_url: null,
      };
      openInlineChatInMessagesTab(targetMember);
    });

    return () => {
      responseSub?.remove();
    };
  }, [session?.user?.id, members]);

  useEffect(() => {
    return () => {
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const onHardwareBackPress = () => {
      if (!session) {
        if (isSignUpScreen) {
          setIsSignUpScreen(false);
          return true;
        }
        return false;
      }

      // 1번째 뒤로: 확대 화면 닫기 → 2번째 뒤로: 사진 보기 닫고 홈 화면으로
      if (viewerBackHook.handler && viewerBackHook.handler()) {
        return true;
      }

      if (viewingImage) {
        setViewingImage(null);
        return true;
      }

      if (selectedPostId) {
        setSelectedPostId(null);
        return true;
      }

      if (memberMenuOpen) {
        setMemberMenuOpen(false);
        return true;
      }

      if (memberPostsUser) {
        memberPostsFromListRef.current = false;
        setMemberPostsUser(null);
        return true;
      }

      if (blockListOpen) {
        setBlockListOpen(false);
        return true;
      }

      if (accountMenuOpen) {
        setAccountMenuOpen(false);
        return true;
      }

      if (brandMenuOpen) {
        setBrandMenuOpen(false);
        return true;
      }

      if (editProfileModal) {
        setEditProfileModal(false);
        return true;
      }

      if (writeModalVisible) {
        setWriteModalVisible(false);
        return true;
      }

      if (selectedFriend) {
        setSelectedFriend(null);
        return true;
      }

      if (chatAttachMenuOpen) {
        setChatAttachMenuOpen(false);
        return true;
      }

      if (chatPartner) {
        setChatPartner(null);
        return true;
      }

      if (searchQuery) {
        setSearchQuery('');
        return true;
      }

      if (mainTab === 'posts' && postsMemberId) {
        setPostsMemberId(null);
        return true;
      }

      if (mainTab !== 'home') {
        setMainTab('home');
        return true;
      }

      const now = Date.now();
      if (now - lastBackPressRef.current < 2000) {
        return false;
      }

      lastBackPressRef.current = now;
      if (Platform.OS === 'android') {
        ToastAndroid.show('뒤로 버튼을 한 번 더 누르면 종료됩니다.', ToastAndroid.SHORT);
      }
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onHardwareBackPress);
    return () => subscription.remove();
  }, [
    session,
    isSignUpScreen,
    viewingImage,
    selectedPostId,
    accountMenuOpen,
    blockListOpen,
    brandMenuOpen,
    editProfileModal,
    writeModalVisible,
    selectedFriend,
    memberPostsUser,
    memberMenuOpen,
    chatAttachMenuOpen,
    chatPartner,
    searchQuery,
    mainTab,
    postsMemberId,
  ]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    if (session && supabase) {
      loadAndCountProfile(session.user);
      registerPushTokenForUser(session.user.id);
      ensureGroupChannel();
      fetchFriendsAndRequests();
      fetchUnreadCountsBySender(session.user.id);
      AsyncStorage.getItem(`posts_cache_v1_${session.user.id}`)
        .then((raw) => {
          if (!raw) return;
          try {
            const cached = JSON.parse(raw);
            if (Array.isArray(cached)) setPosts((prev) => (prev.length ? prev : cached));
          } catch (e) { /* 무시 */ }
        })
        .catch(() => {});
      fetchBlocks();
      fetchPosts();
      fetchAllComments();
    }
  }, [session]);

  // 앱을 껐다가(뒤로가기·홈버튼) 다시 열었을 때도 새 멤버·새 글·안 읽은 메시지를 다시 불러옴
  // (최근 앱 목록에서 지우지 않아도 최신 상태로 보이게)
  const lastRefreshRef = useRef(0);
  const chatPartnerRef = useRef(null); // 지금 열려 있는 1:1 대화 상대 (알림 반영용)
  useEffect(() => { chatPartnerRef.current = chatPartner; }, [chatPartner]);
  // 메시지 관련(안 읽은 숫자, 열려 있는 대화)은 앱이 켜질 때마다 '항상' 바로 새로 불러옴
  const refreshMessagesNow = () => {
    if (!session) return;
    fetchUnreadCountsBySender(session.user.id);
    if (chatPartnerRef.current?.id) fetchChatMessages(chatPartnerRef.current.id);
  };
  useEffect(() => {
    if (!session || !supabase) return;
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      refreshMessagesNow();
      const now = Date.now();
      if (now - lastRefreshRef.current < 15 * 1000) return; // 게시물·멤버는 15초 안에 여러 번은 생략
      lastRefreshRef.current = now;
      fetchFriendsAndRequests();
      fetchBlocks();
      fetchPosts();
      fetchAllComments();
    });
    // 앱을 보고 있는 중에 푸시 알림이 오면 숫자와 대화를 바로 반영
    const recvSub = Notifications.addNotificationReceivedListener(() => {
      refreshMessagesNow();
    });
    return () => { sub.remove(); recvSub?.remove(); };
  }, [session]);

  useEffect(() => {
    if (!supabase || !session) return;
    const reqChannel = supabase
      .channel(`realtime_friend_requests_${session.user.id}_${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests' },
        () => {
          fetchFriendsAndRequests();
        }
      )
      .subscribe();

    const unreadChannel = supabase
      .channel(`realtime_unread_badge_${session.user.id}_${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        (payload) => {
          fetchUnreadCountsBySender(session.user.id);
          fetchLastMessages(session.user.id);
          if (payload.eventType === 'INSERT' && payload.new?.receiver_id === session.user.id) {
            triggerIncomingMessageBanner(payload.new);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(reqChannel);
      supabase.removeChannel(unreadChannel);
    };
  }, [session, members, chatPartner?.id, mainTab]);

  useEffect(() => {
    if (selectedPostId && supabase && session) {
      fetchCommentsForPost(selectedPostId);
    }
  }, [selectedPostId]);

  useEffect(() => {
    if (!viewingImage?.postId) return;
    const targetPost = posts.find((p) => p.id === viewingImage.postId);
    if (!targetPost) return;
    setViewingImage((prev) =>
      prev
        ? {
            ...prev,
            likeCount: targetPost.reactions?.length || 0,
            isLikedByMe: Boolean(targetPost.reactions?.some((x) => x.user_id === session?.user?.id)),
          }
        : null
    );
  }, [posts, viewingImage?.postId, session?.user?.id]);

  useEffect(() => {
    if (!supabase || !session || !chatPartner) {
      setChatMessages([]);
      setChatAttachMenuOpen(false);
      return;
    }

    setChatAttachMenuOpen(false);
    const myId = session.user.id;
    const partnerId = chatPartner.id;

    const initChatRoom = async () => {
      await markMessagesAsRead(partnerId);
      await fetchChatMessages(partnerId);
    };
    initChatRoom();

    const channel = supabase
      .channel(`realtime_chat_${myId}_${partnerId}_${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            const newMsg = payload.new;
            const isRelevant =
              (newMsg.sender_id === myId && newMsg.receiver_id === partnerId) ||
              (newMsg.sender_id === partnerId && newMsg.receiver_id === myId);

            if (isRelevant) {
              if (newMsg.sender_id === partnerId && newMsg.receiver_id === myId && !newMsg.is_read) {
                newMsg.is_read = true;
                await markMessagesAsRead(partnerId);
              } else if (newMsg.receiver_id === myId && !newMsg.is_read) {
                await fetchUnreadCountsBySender(myId);
              }

              setChatMessages((prev) => {
                if (prev.some((m) => m.id === newMsg.id)) return prev;
                return [...prev, newMsg];
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedMsg = payload.new;
            if (updatedMsg.receiver_id === myId) {
              await fetchUnreadCountsBySender(myId);
            }
            setChatMessages((prev) =>
              prev.map((m) => (m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m))
            );
          } else if (payload.eventType === 'DELETE') {
            const deletedId = payload.old?.id;
            if (deletedId) {
              setChatMessages((prev) => prev.filter((m) => m.id !== deletedId));
            }
            await fetchUnreadCountsBySender(myId);
          }
        }
      )
      .subscribe();

    const syncTimer = setInterval(async () => {
      await markMessagesAsRead(partnerId);
      await fetchChatMessages(partnerId);
    }, 4000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(syncTimer);
    };
  }, [chatPartner?.id, session]);

  if (!supabase) {
    return (
      <SafeAreaView style={[styles.authContainer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Text style={styles.logo}>실행 오류 원인</Text>
        <Text style={{ textAlign: 'center', color: '#D32F2F', fontSize: 15, lineHeight: 22 }}>
          {initError || '알 수 없는 초기화 오류'}
        </Text>
      </SafeAreaView>
    );
  }

  // 푸시 토큰 발급 및 profiles.push_token 저장
  const registerPushTokenForUser = async (userId) => {
    if (!userId) return;
    try {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('messages', {
          name: '새 메시지 알림',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          sound: 'default',
        });
                await Notifications.setNotificationChannelAsync('messages_custom', {
                            name: '새 메시지 알림 (전용음)',
                                      importance: Notifications.AndroidImportance.MAX,
                                                vibrationPattern: [0, 250, 250, 250],
                                                          sound: 'mimi_clear.wav',
                                                                  });
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') return;

      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ||
        Constants?.easConfig?.projectId ||
        undefined;

      const tokenResult = projectId
        ? await Notifications.getExpoPushTokenAsync({ projectId })
        : await Notifications.getExpoPushTokenAsync();

      const expoToken = tokenResult?.data;

      if (expoToken) {
        const { error: updateErr } = await supabase
          .from('profiles')
          .update({ push_token: expoToken })
          .eq('id', userId);
        if (updateErr) {
          showAlert('토큰 DB 저장 실패', updateErr.message);
        }
      }
    } catch (e) {
      showAlert('푸시 토큰 등록 실패', e?.message || String(e));
    }
  };

  // 앱 사용 중 새 메시지 알림 배너 표시
  const triggerIncomingMessageBanner = (msgRow) => {
    if (!msgRow || msgRow.sender_id === session?.user?.id) return;
    if (chatPartner?.id === msgRow.sender_id && mainTab === 'chats') return;

    const senderProfile = members.find((m) => m.id === msgRow.sender_id);
    const previewText = msgRow.image_url
      ? '사진을 보냈습니다.'
      : msgRow.file_url
        ? `파일을 보냈습니다: ${msgRow.file_name || '첨부파일'}`
        : (msgRow.content || '새 메시지를 보냈습니다.');

    setIncomingMsgBanner({
      senderId: msgRow.sender_id,
      senderName: senderProfile?.nickname || '친구',
      avatarUrl: senderProfile?.avatar_url || null,
      text: previewText,
    });

    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = setTimeout(() => {
      setIncomingMsgBanner(null);
    }, 4000);
  };

  // 1:1 채팅 파일 말풍선을 눌렀을 때: 열기 / 폰에 저장
  const chatFileActions = (msg) => {
    Alert.alert(msg.file_name || '첨부파일', '이 파일을 어떻게 할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '열기', onPress: () => handleOpenExternalLink(msg.file_url) },
      { text: '폰에 저장', onPress: () => saveFileToPhone(msg.file_url, msg.file_name) },
    ]);
  };

  // 1:1 채팅 사진·파일을 길게 눌렀을 때: 저장 (내 메시지면 삭제도)
  const chatMediaActions = (msg, mine) => {
    const save = msg.image_url
      ? { text: '사진 저장', onPress: () => saveImageToPhone(msg.image_url) }
      : { text: '폰에 저장', onPress: () => saveFileToPhone(msg.file_url, msg.file_name) };
    const buttons = [{ text: '취소', style: 'cancel' }];
    if (mine) buttons.push({ text: '삭제', style: 'destructive', onPress: () => handleDeleteSentMessage(msg) });
    buttons.push(save);
    Alert.alert(msg.image_url ? '사진' : (msg.file_name || '첨부파일'), '', buttons);
  };

  const handleOpenExternalLink = async (rawUrl) => {
    if (!rawUrl) return;
    try {
      const supported = await Linking.canOpenURL(rawUrl);
      if (supported) {
        await Linking.openURL(rawUrl);
      } else {
        await Linking.openURL(rawUrl);
      }
    } catch {
      showAlert('링크 열기 오류', `해당 링크를 열 수 없습니다.\n${rawUrl}`);
    }
  };

  // 메시지 목록에서 체크한 대화방을 한꺼번에 나가기
  const [leaveSelectMode, setLeaveSelectMode] = useState(false);
  const [leaveSelected, setLeaveSelected] = useState({}); // { 상대id: true }
  const leaveSelectedIds = Object.keys(leaveSelected).filter((k) => leaveSelected[k]);
  const toggleLeaveSelect = (id) => setLeaveSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  const exitLeaveSelect = () => { setLeaveSelectMode(false); setLeaveSelected({}); };
  const leaveSelectedChats = () => {
    if (!session || leaveSelectedIds.length === 0) return;
    const me = session.user.id;
    const ids = [...leaveSelectedIds];
    const doLeave = async () => {
      let failed = 0;
      for (const other of ids) {
        const { error } = await supabase
          .from('messages')
          .delete()
          .or('and(sender_id.eq.' + me + ',receiver_id.eq.' + other + '),and(sender_id.eq.' + other + ',receiver_id.eq.' + me + ')');
        if (error) failed += 1;
      }
      if (chatPartner && ids.includes(chatPartner.id)) { setChatMessages([]); setChatPartner(null); }
      fetchUnreadCountsBySender(me);
      exitLeaveSelect();
      if (failed > 0) showAlert('일부 실패', `${failed}개 대화방은 나가지 못했어요. 다시 시도해 주세요.`);
    };
    Alert.alert(
      `대화방 ${ids.length}개 나가기`,
      '선택한 대화의 모든 내용이 삭제됩니다. 상대방 화면에서도 사라지며 복구할 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        { text: '나가기', style: 'destructive', onPress: doLeave },
      ]
    );
  };

  const handleLeaveChat = (partner) => {
    if (!partner || !partner.id || !session || !session.user) return;
    const me = session.user.id;
    const other = partner.id;
    const doLeave = async () => {
      const { error } = await supabase
        .from('messages')
        .delete()
        .or('and(sender_id.eq.' + me + ',receiver_id.eq.' + other + '),and(sender_id.eq.' + other + ',receiver_id.eq.' + me + ')');
      if (error) {
        showAlert('나가기 실패', getKoreanErrorMessage(error));
        return;
      }
      setChatMessages([]);
      setChatPartner(null);
      fetchUnreadCountsBySender(me);
    };
    Alert.alert('대화 나가기', '대화가 완전히 종료되고 모든 내용이 삭제됩니다. 상대방 화면에서도 사라지며 복구할 수 없습니다.', [
      { text: '취소', style: 'cancel' },
      { text: '나가기', style: 'destructive', onPress: doLeave },
    ]);
  };

  const handleDeleteSentMessage = (msgItem) => {
    if (!msgItem || msgItem.sender_id !== session?.user?.id) return;

    Alert.alert('메시지 삭제', '보낸 메시지를 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          const targetId = msgItem.id;
          setChatMessages((prev) => prev.filter((m) => m.id !== targetId));

          const { error } = await supabase
            .from('messages')
            .delete()
            .eq('id', targetId)
            .eq('sender_id', session.user.id);

          if (error) {
            showAlert('삭제 실패', getKoreanErrorMessage(error));
            if (chatPartner?.id) {
              await fetchChatMessages(chatPartner.id);
            }
          }
        },
      },
    ]);
  };

  // 1:1 목록: 상대마다 마지막 메시지 1개씩 (시간·내용 표시, 최근 대화 순 정렬용)
  const fetchLastMessages = async (myId) => {
    if (!myId || !supabase) return;
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('sender_id, receiver_id, content, created_at, image_url, file_url, sticker_url')
        .or(`sender_id.eq.${myId},receiver_id.eq.${myId}`)
        .order('created_at', { ascending: false })
        .limit(3000);
      if (error || !Array.isArray(data)) return;
      const map = {};
      data.forEach((m) => {
        const other = m.sender_id === myId ? m.receiver_id : m.sender_id;
        if (!other || map[other]) return;
        map[other] = m;
      });
      setLastMsgByPartner(map);
    } catch {
      // 무시
    }
  };

  useEffect(() => {
    if (session?.user?.id) fetchLastMessages(session.user.id);
  }, [session?.user?.id, mainTab, chatPartner?.id]);

  const fetchUnreadCountsBySender = async (myId) => {
    if (!myId) return;
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('sender_id')
        .eq('receiver_id', myId)
        .eq('is_read', false);

      if (!error && Array.isArray(data)) {
        const counts = {};
        data.forEach((row) => {
          if (!row?.sender_id || row.sender_id === myId) return;
          counts[row.sender_id] = (counts[row.sender_id] || 0) + 1;
        });
        setUnreadCountBySender(counts);
      }
    } catch {
      // 무시
    }
  };

  // ---- 새 홈 화면 / 게시글 탭 ----
  const [homeNotices, setHomeNotices] = useState([]); // 지금까지 올린 공지 (최신 순)
  const homeNotice = homeNotices[0] || null;          // 홈 띠에 보이는 최신 공지
  const [noticeBoardOpen, setNoticeBoardOpen] = useState(false);
  const [openNoticeId, setOpenNoticeId] = useState(null); // 게시판에서 펼친 공지
  const [editingNotice, setEditingNotice] = useState(null); // 수정 중인 공지 (새 글이면 null)
  const [isAdmin, setIsAdmin] = useState(false);
  const [noticeEditOpen, setNoticeEditOpen] = useState(false);
  const [noticeDraft, setNoticeDraft] = useState('');
  const [schedules, setSchedules] = useState([]);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  // 일정 추가: 달력으로 시작일~끝나는 날 고르기, 시간은 버튼으로
  const [schedDraft, setSchedDraft] = useState({ title: '', start: null, end: null, timeSel: '종일', customTime: '', place: '', isMain: false });
  const [schedCalOpen, setSchedCalOpen] = useState(true);
  const [schedCalMonth, setSchedCalMonth] = useState({ y: new Date().getFullYear(), m: new Date().getMonth() });
  const [wishes, setWishes] = useState([]);
  const [wishLikes, setWishLikes] = useState([]);
  const [wishModalOpen, setWishModalOpen] = useState(false);
  const [wishDraft, setWishDraft] = useState({ place: '', memo: '' });
  const [flightPrices, setFlightPrices] = useState([]);
  const [travelPhotos, setTravelPhotos] = useState({}); // { 도시: { image_url, photographer, ... } }
  const [flightFrom, setFlightFrom] = useState('ICN');
  const [travelShuffle, setTravelShuffle] = useState(0);
  const [travelGroup, setTravelGroup] = useState('dom'); // 'dom' 국내 / 'ovs' 해외
  const [travelOpenCity, setTravelOpenCity] = useState(null); // 눌러서 펼친 여행지
  const [travelDetail, setTravelDetail] = useState(null); // 전체 화면으로 연 여행지
  const [destLikes, setDestLikes] = useState([]); // [{ city, user_id }] '가고 싶어요'
  // 캐시 삭제 창
  const [cacheOpen, setCacheOpen] = useState(false);
  const [cacheSize, setCacheSize] = useState(null); // null = 계산 중
  const [cacheBusy, setCacheBusy] = useState(false);
  // 항공권 검색 사이트 고르기 창
  const [flightPick, setFlightPick] = useState(null); // { from, to, dep, ret }
  const [flightNaverAlways, setFlightNaverAlways] = useState(false);
  const [flightNaverCheck, setFlightNaverCheck] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(FLIGHT_NAVER_KEY).then((v) => { if (v === '1') setFlightNaverAlways(true); }).catch(() => {});
  }, []);
  // 앱 업데이트 알림
  const [updateInfo, setUpdateInfo] = useState(null); // { latest, force, notes }
  const [updatePromptOpen, setUpdatePromptOpen] = useState(false);
  const [updateBannerOn, setUpdateBannerOn] = useState(false);
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const cur = currentVersionCode();
      if (!cur || !supabase) return;
      try {
        const { data, error } = await supabase.from('app_version').select('latest_code, force, notes').eq('id', 1).maybeSingle();
        if (!alive || error || !data) return;
        const latest = Number(data.latest_code) || 0;
        if (latest <= cur) {
          setUpdateInfo(null);
          setUpdatePromptOpen(false);
          setUpdateBannerOn(false);
          return;
        }
        const info = { current: cur, latest, force: !!data.force, notes: data.notes || '' };
        setUpdateInfo(info);
        const skipped = await AsyncStorage.getItem(UPDATE_SKIP_KEY);
        const bannerHidden = await AsyncStorage.getItem(UPDATE_BANNER_KEY);
        if (!alive) return;
        if (info.force || String(skipped) !== String(latest)) setUpdatePromptOpen(true);
        setUpdateBannerOn(String(bannerHidden) !== String(latest));
      } catch {}
    };
    check();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') check(); });
    return () => { alive = false; sub.remove(); };
  }, []);
  // 항공권 날짜 변경
  const [flightRange, setFlightRange] = useState({ start: null, end: null }); // 적용된 날짜 (없으면 '가장 싼 날')
  const [flightDraft, setFlightDraft] = useState({ start: null, end: null }); // 달력에서 고르는 중
  const [flightCalWhere, setFlightCalWhere] = useState(null); // 'home' | 'detail' | null(닫힘)
  const [flightCalMonth, setFlightCalMonth] = useState({ y: new Date().getFullYear(), m: new Date().getMonth() });
  const [flightLive, setFlightLive] = useState({}); // { 'ICN-KIX-2026-12-24-2026-12-27': { price, airline, transfers } | { none: true } }
  const [flightLiveErr, setFlightLiveErr] = useState('');
  // 날짜를 고르면 그 날짜 가격을 서버에 물어보기 (홈 2곳 + 상세 화면)
  useEffect(() => {
    const st = flightRange.start;
    const en = flightRange.end;
    if (!st || !en || !session?.user?.id || !supabase) return;
    const a = ymd(st);
    const b = ymd(en);
    const want = [];
    if (travelGroup === 'ovs') {
      weightedDailyPick(TRAVEL_OVERSEAS, 2, dayKeyNum() + travelShuffle * 13 + 7).forEach((d) => want.push([flightFrom, d.iata]));
    }
    if (travelGroup === 'dom') {
      JEJU_ORIGINS.forEach((o) => want.push([o, 'CJU']));
    }
    if (travelDetail && travelDetail.iata && TRAVEL_OVERSEAS.includes(travelDetail)) {
      want.push(['ICN', travelDetail.iata], ['PUS', travelDetail.iata]);
    }
    if (travelDetail && travelDetail.iata === 'CJU') {
      JEJU_ORIGINS.forEach((o) => want.push([o, 'CJU']));
    }
    const need = want.filter(([o, d], i) => !flightLive[`${o}-${d}-${a}-${b}`] && want.findIndex((x) => x[0] === o && x[1] === d) === i);
    if (!need.length) return;
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('flight-price-search', {
          body: { depart: a, ret: b, routes: need.map(([o, d]) => ({ origin: o, destination: d })) },
        });
        if (!alive) return;
        if (error || !data || !Array.isArray(data.results)) {
          setFlightLiveErr('가격을 불러오지 못했어요. 잠시 후 다시 해 보세요.');
          return;
        }
        setFlightLiveErr('');
        setFlightLive((prev) => {
          const next = { ...prev };
          need.forEach(([o, d]) => {
            const r = data.results.find((x) => x.origin === o && x.destination === d);
            next[`${o}-${d}-${a}-${b}`] = r && r.price ? r : { none: true };
          });
          return next;
        });
      } catch {
        if (alive) setFlightLiveErr('가격을 불러오지 못했어요. 잠시 후 다시 해 보세요.');
      }
    })();
    return () => { alive = false; };
  }, [flightRange.start, flightRange.end, flightFrom, travelGroup, travelShuffle, travelDetail, session?.user?.id]);
  const [memberOfDayShuffle, setMemberOfDayShuffle] = useState(0);
  const [homeSaving, setHomeSaving] = useState(false);

  // 홈 화면 자료(공지·스케줄·희망 여행지·항공권 가격) 불러오기
  // 서버에 표가 아직 없으면 조용히 넘어감 (그 칸만 비어 보임)
  const fetchHomeData = async () => {
    const uid = session?.user?.id;
    if (!uid) return;
    try {
      const since = new Date(Date.now() - 8 * 86400000).toISOString();
      const [n, sc, w, wl, fp, me, tp, dl] = await Promise.all([
        supabase.from('home_notices').select('*').order('created_at', { ascending: false }).limit(300),
        supabase.from('family_schedules').select('*').gte('starts_at', since).order('starts_at', { ascending: true }).limit(200),
        supabase.from('travel_wishes').select('*').order('created_at', { ascending: false }).limit(300),
        supabase.from('travel_wish_likes').select('wish_id, user_id'),
        supabase.from('flight_prices').select('*'),
        supabase.from('profiles').select('is_admin').eq('id', uid).maybeSingle(),
        supabase.from('travel_photos').select('*'),
        supabase.from('travel_dest_likes').select('city, user_id'),
      ]);
      if (!n.error) setHomeNotices(n.data || []);
      if (!sc.error) setSchedules(sc.data || []);
      if (!w.error) setWishes(w.data || []);
      if (!wl.error) setWishLikes(wl.data || []);
      if (!fp.error) setFlightPrices(fp.data || []);
      if (!me.error && me.data) setIsAdmin(!!me.data.is_admin);
      if (tp && !tp.error && Array.isArray(tp.data)) {
        const map = {};
        tp.data.forEach((r) => { if (r && r.city) map[r.city] = r; });
        setTravelPhotos(map);
      }
      if (dl && !dl.error) setDestLikes(dl.data || []);
    } catch {
      // 무시
    }
  };
  useEffect(() => {
    if (!session?.user?.id) return;
    fetchHomeData();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') fetchHomeData(); });
    return () => sub.remove();
  }, [session?.user?.id]);

  // 단체방 전체에서 아직 안 읽은 메시지 수 (아래 메뉴 단체방 아이콘에 표시)
  const [groupUnreadTotal, setGroupUnreadTotal] = useState(0);
  const fetchGroupUnreadTotal = async (myId) => {
    if (!myId) return;
    try {
      const { data: mem, error } = await supabase
        .from('chat_room_members')
        .select('room_id, last_read_at')
        .eq('user_id', myId);
      if (error || !Array.isArray(mem)) return;
      let total = 0;
      await Promise.all(mem.map(async (m) => {
        let q = supabase
          .from('group_messages')
          .select('id', { count: 'exact', head: true })
          .eq('room_id', m.room_id)
          .neq('sender_id', myId);
        if (m.last_read_at) q = q.gt('created_at', m.last_read_at);
        const { count } = await q;
        total += count || 0;
      }));
      setGroupUnreadTotal(total);
    } catch {
      // 숫자만 못 보일 뿐, 앱 사용에는 문제 없음
    }
  };
  useEffect(() => {
    const myId = session?.user?.id;
    if (!myId) return;
    fetchGroupUnreadTotal(myId);
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') fetchGroupUnreadTotal(myId); });
    const recv = Notifications.addNotificationReceivedListener(() => fetchGroupUnreadTotal(myId));
    let timer = null;
    const ch = supabase
      .channel('group-unread-total-' + myId + '-' + Date.now())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages' }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fetchGroupUnreadTotal(myId), 800);
      })
      .subscribe();
    const iv = setInterval(() => fetchGroupUnreadTotal(myId), 30000);
    return () => {
      sub.remove();
      recv?.remove();
      if (timer) clearTimeout(timer);
      clearInterval(iv);
      supabase.removeChannel(ch);
    };
  }, [session?.user?.id]);

  const acceptedFriendIds = Object.entries(friendRelationMap)
    .filter(([, rel]) => rel?.status === 'accepted')
    .map(([otherId]) => otherId);

  const isPostVisibleToMe = (post) => {
    const uid = session?.user?.id;
    if (!uid) return false;
    if (post.author_id === uid) return true;
    const vis = post.visibility || 'public';
    if (vis === 'public') return true;
    if (vis === 'friends') return acceptedFriendIds.includes(post.author_id);
    if (vis === 'private') return false;
    return true;
  };
  const openNotificationSoundSettings = async () => {
        if (Platform.OS !== 'android') {
              Linking.openSettings();
                    return;
                        }
                            try {
                                  await Linking.sendIntent('android.settings.CHANNEL_NOTIFICATION_SETTINGS', [
                                          { key: 'android.provider.extra.APP_PACKAGE', value: 'com.anoldking.mystoryapp' },
                                                  { key: 'android.provider.extra.CHANNEL_ID', value: 'messages_custom' },
                                                        ]);
                                                            } catch (e) {
                                                                  Linking.openSettings();
                                                                      }
                                                                        };
  const handleLogout = async () => {
    setAccountMenuOpen(false);
    setLoading(true);
    await supabase.auth.signOut();
    setLoading(false);
  };

  const handleWithdrawAccount = () => {
    setAccountMenuOpen(false);
    Alert.alert(
      '회원 탈퇴',
      '정말 탈퇴하시겠습니까?\n계정과 모든 데이터가 서버에서 영구 삭제됩니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '탈퇴하기',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const { error: rpcError } = await supabase.rpc('delete_own_account');
              if (rpcError) {
                throw rpcError;
              }
              await supabase.auth.signOut();
              setLoading(false);
              showAlert('탈퇴 완료', '계정이 서버에서 완전히 삭제되었습니다.');
            } catch (e) {
              setLoading(false);
              showAlert('탈퇴 처리 오류', `계정 삭제 중 문제가 발생했습니다.\n(${e?.message || e})`);
            }
          },
        },
      ]
    );
  };

  const toggleInlineChat = (member) => {
    setChatPartner((prev) => (prev?.id === member.id ? null : member));
  };

  const openInlineChatInMessagesTab = (member) => {
    setChatPartner(member);
    setMainTab('chats');
  };

  const resolveAuthorName = (userId) => {
    if (userId === session?.user?.id) {
      return profile.nickname || '나';
    }
    const found = members.find((m) => m.id === userId);
    return found?.nickname || '회원';
  };

  const mapCommentRow = (row) => ({
    ...row,
    parent_id: row.parent_id || null,
    authorName: resolveAuthorName(row.user_id),
  });

  const fetchAllComments = async () => {
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .order('created_at', { ascending: true });

      if (!error && Array.isArray(data)) {
        const grouped = {};
        data.forEach((row) => {
          const key = String(row.post_id);
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(mapCommentRow(row));
        });
        setCommentsByPost(grouped);
      }
    } catch {
      // 무시
    }
  };

  const fetchCommentsForPost = async (postId) => {
    try {
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (!error && Array.isArray(data)) {
        const key = String(postId);
        const dbRows = data.map(mapCommentRow);
        setCommentsByPost((prev) => {
          const existing = prev[key] || [];
          const dbIds = new Set(dbRows.map((r) => String(r.id)));
          const merged = [
            ...dbRows,
            ...existing.filter((item) => !dbIds.has(String(item.id))),
          ];
          return {
            ...prev,
            [key]: merged,
          };
        });
      }
    } catch {
      // 무시
    }
  };

  const handleAddComment = async (postId, text, parentId = null) => {
    const myName = profile.nickname || (session.user.email ? session.user.email.split('@')[0] : '나');
    const key = String(postId);
    const localComment = {
      id: `local_${Date.now()}`,
      post_id: postId,
      user_id: session.user.id,
      parent_id: parentId || null,
      authorName: myName,
      content: text,
      created_at: new Date().toISOString(),
    };

    try {
      const insertPayload = {
        post_id: postId,
        user_id: session.user.id,
        content: text,
      };
      if (parentId) insertPayload.parent_id = String(parentId);

      const { data, error } = await supabase
        .from('comments')
        .insert(insertPayload)
        .select()
        .single();

      if (error) {
        setCommentsByPost((prev) => ({
          ...prev,
          [key]: [...(prev[key] || []), localComment],
        }));
        return true;
      }

      const savedRow = {
        ...data,
        parent_id: data.parent_id || (parentId ? String(parentId) : null),
        authorName: myName,
      };
      setCommentsByPost((prev) => {
        const current = prev[key] || [];
        if (current.some((item) => String(item.id) === String(savedRow.id))) return prev;
        return {
          ...prev,
          [key]: [...current, savedRow],
        };
      });
      return true;
    } catch {
      setCommentsByPost((prev) => ({
        ...prev,
        [key]: [...(prev[key] || []), localComment],
      }));
      return true;
    }
  };

  const handleEditComment = async (postId, commentId, newContent) => {
    const key = String(postId);
    setCommentsByPost((prev) => ({
      ...prev,
      [key]: (prev[key] || []).map((c) =>
        String(c.id) === String(commentId) ? { ...c, content: newContent } : c
      ),
    }));

    if (!String(commentId).startsWith('local_')) {
      const { error } = await supabase
        .from('comments')
        .update({ content: newContent })
        .eq('id', commentId);

      if (error) {
        showAlert('댓글 수정 실패', getKoreanErrorMessage(error));
        return false;
      }
    }
    return true;
  };

  const handleDeleteComment = (postId, commentId) => {
    Alert.alert('댓글 삭제', '이 댓글을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          const key = String(postId);
          setCommentsByPost((prev) => ({
            ...prev,
            [key]: (prev[key] || []).filter(
              (c) => String(c.id) !== String(commentId) && String(c.parent_id) !== String(commentId)
            ),
          }));

          if (!String(commentId).startsWith('local_')) {
            await supabase.from('comments').delete().eq('parent_id', String(commentId));
            const { error } = await supabase.from('comments').delete().eq('id', commentId);
            if (error) {
              showAlert('댓글 삭제 실패', getKoreanErrorMessage(error));
            }
          }
        },
      },
    ]);
  };

  const fetchFriendsAndRequests = async () => {
    const myId = session.user.id;
    let { data: memberData, error: memberErr } = await supabase
      .from('profiles')
      .select('id, nickname, bio, avatar_url, cover_url, bgm_url, bgm_title, today_visits, total_visits, last_visit_date')
      .order('nickname', { ascending: true });
    if (memberErr) {
      const retry = await supabase
        .from('profiles')
        .select('id, nickname, bio, avatar_url, cover_url')
        .order('nickname', { ascending: true });
      memberData = retry.data;
    }

    const list = memberData || [];
    setMembers(list);

    const { data: reqData, error: reqError } = await supabase
      .from('friend_requests')
      .select('*')
      .or(`requester_id.eq.${myId},addressee_id.eq.${myId}`)
      .order('created_at', { ascending: false });

    if (reqError || !Array.isArray(reqData)) {
      setFriendRelationMap({});
      setIncomingRequests([]);
      return;
    }

    const relMap = {};
    const pendingToMe = [];

    for (const row of reqData) {
      if (row.requester_id === myId) {
        relMap[row.addressee_id] = row;
      } else if (row.addressee_id === myId) {
        relMap[row.requester_id] = row;
        if (row.status === 'pending') {
          const requesterProfile = list.find((m) => m.id === row.requester_id);
          pendingToMe.push({
            ...row,
            requesterProfile: requesterProfile || {
              id: row.requester_id,
              nickname: '회원',
              bio: '',
              avatar_url: null,
            },
          });
        }
      }
    }

    setFriendRelationMap(relMap);
    setIncomingRequests(pendingToMe);
  };

  const sendFriendRequest = async (targetUserId) => {
    const myId = session.user.id;
    if (!targetUserId || targetUserId === myId) return;

    const existing = friendRelationMap[targetUserId];
    if (existing?.status === 'pending' && existing.addressee_id === myId) {
      await acceptFriendRequest(existing.id, targetUserId);
      return;
    }

    const optimisticRow = {
      id: existing?.id || `temp_${Date.now()}`,
      requester_id: myId,
      addressee_id: targetUserId,
      status: 'pending',
    };
    setFriendRelationMap((prev) => ({ ...prev, [targetUserId]: optimisticRow }));

    const { data, error } = await supabase
      .from('friend_requests')
      .upsert(
        {
          requester_id: myId,
          addressee_id: targetUserId,
          status: 'pending',
        },
        { onConflict: 'requester_id,addressee_id' }
      )
      .select()
      .single();

    if (error) {
      showAlert('친구 신청 실패', getKoreanErrorMessage(error));
      fetchFriendsAndRequests();
      return;
    }

    if (data) {
      setFriendRelationMap((prev) => ({ ...prev, [targetUserId]: data }));
    }
    showAlert('친구 신청 완료', '상대방이 수락하면 친구가 되어 서로의 친구공개 글이 공유됩니다.');
  };

  const cancelOrRemoveFriend = async (targetUserId) => {
    const existing = friendRelationMap[targetUserId];
    if (!existing) return;

    Alert.alert(
      existing.status === 'accepted' ? '친구 해제' : '친구 신청 취소',
      existing.status === 'accepted'
        ? '친구 관계를 해제하시겠습니까? 친구공개 글 공유가 중단됩니다.'
        : '보낸 친구 신청을 취소하시겠습니까?',
      [
        { text: '닫기', style: 'cancel' },
        {
          text: '확인',
          style: 'destructive',
          onPress: async () => {
            setFriendRelationMap((prev) => {
              const next = { ...prev };
              delete next[targetUserId];
              return next;
            });

            if (existing.id && !String(existing.id).startsWith('temp_')) {
              await supabase.from('friend_requests').delete().eq('id', existing.id);
            } else {
              await supabase
                .from('friend_requests')
                .delete()
                .eq('requester_id', existing.requester_id)
                .eq('addressee_id', existing.addressee_id);
            }
            fetchFriendsAndRequests();
          },
        },
      ]
    );
  };

  const acceptFriendRequest = async (requestId, requesterId) => {
    setIncomingRequests((prev) => prev.filter((r) => r.id !== requestId));
    setFriendRelationMap((prev) => ({
      ...prev,
      [requesterId]: {
        ...(prev[requesterId] || {}),
        id: requestId,
        requester_id: requesterId,
        addressee_id: session.user.id,
        status: 'accepted',
      },
    }));

    const { error } = await supabase
      .from('friend_requests')
      .update({ status: 'accepted' })
      .eq('id', requestId);

    if (error) {
      showAlert('수락 실패', getKoreanErrorMessage(error));
    } else {
      showAlert('친구 수락 완료', '친구가 되었습니다! 이제 서로의 친구공개 게시글이 함께 보입니다.');
    }
    fetchFriendsAndRequests();
  };

  const rejectFriendRequest = async (requestId, requesterId) => {
    setIncomingRequests((prev) => prev.filter((r) => r.id !== requestId));
    setFriendRelationMap((prev) => {
      const next = { ...prev };
      delete next[requesterId];
      return next;
    });

    const { error } = await supabase
      .from('friend_requests')
      .delete()
      .eq('id', requestId);

    if (error) {
      showAlert('거절 실패', getKoreanErrorMessage(error));
    }
    fetchFriendsAndRequests();
  };

  const renderFriendStatusActionButton = (targetUserId, compact = false, dark = false) => {
    const dk = dark ? { backgroundColor: '#2A2A2A' } : null;
    const dkText = dark ? { color: '#FFFFFF' } : null;
    const myId = session.user.id;
    if (!targetUserId || targetUserId === myId) return null;

    const rel = friendRelationMap[targetUserId];
    if (!rel) {
      return (
        <TouchableOpacity
          style={[styles.friendActionChip, compact && styles.friendActionChipCompact, dk]}
          onPress={() => sendFriendRequest(targetUserId)}
        >
          <Text style={[styles.friendActionChipText, dkText]}>친구신청</Text>
        </TouchableOpacity>
      );
    }

    if (rel.status === 'accepted') {
      return (
        <TouchableOpacity
          style={[styles.friendActionChip, styles.friendActionChipAccepted, compact && styles.friendActionChipCompact, dk]}
          onPress={() => cancelOrRemoveFriend(targetUserId)}
        >
          <Text style={[styles.friendActionChipAcceptedText, dkText]}>친구됨</Text>
        </TouchableOpacity>
      );
    }

    if (rel.addressee_id === myId) {
      return (
        <TouchableOpacity
          style={[styles.friendActionChip, styles.friendActionChipIncoming, compact && styles.friendActionChipCompact, dk]}
          onPress={() => acceptFriendRequest(rel.id, targetUserId)}
        >
          <Text style={[styles.friendActionChipIncomingText, dkText]}>신청수락</Text>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        style={[styles.friendActionChip, styles.friendActionChipPending, compact && styles.friendActionChipCompact, dk]}
        onPress={() => cancelOrRemoveFriend(targetUserId)}
      >
        <Text style={[styles.friendActionChipPendingText, dkText]}>신청중</Text>
      </TouchableOpacity>
    );
  };

  const markMessagesAsRead = async (partnerId) => {
    const myId = session.user.id;
    setUnreadCountBySender((prev) => {
      if (!prev[partnerId]) return prev;
      const next = { ...prev };
      delete next[partnerId];
      return next;
    });

    await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('sender_id', partnerId)
      .eq('receiver_id', myId)
      .eq('is_read', false);

    await fetchUnreadCountsBySender(myId);
  };

  const fetchChatMessages = async (partnerId) => {
    const myId = session.user.id;
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${myId},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${myId})`)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setChatMessages(data);
    }
  };

  const sendChatMessage = async () => {
    const text = chatInput.trim();
    if (!text || !chatPartner || sendingMsg) return;
    hapticTap();

    setSendingMsg(true);
    setChatInput('');

    const isSelfChat = chatPartner.id === session.user.id;

    const { data, error } = await supabase
      .from('messages')
      .insert({
        sender_id: session.user.id,
        receiver_id: chatPartner.id,
        content: text,
        is_read: isSelfChat,
      })
      .select()
      .single();

    setSendingMsg(false);

    if (error) {
      showAlert('전송 실패', getKoreanErrorMessage(error));
      setChatInput(text);
    } else if (data) {
      setChatMessages((prev) => {
        if (prev.some((m) => m.id === data.id)) return prev;
        return [...prev, data];
      });
    }
  };

  const sendChatSticker = async (url) => {
    if (!chatPartner || sendingMsg) return;
    const isSelfChat = chatPartner.id === session.user.id;
    const { data, error } = await supabase
      .from('messages')
      .insert({
        sender_id: session.user.id,
        receiver_id: chatPartner.id,
        content: STICKER_LABEL,
        sticker_url: url,
        is_read: isSelfChat,
      })
      .select()
      .single();
    if (error) {
      showAlert('이모티콘 전송 실패', getKoreanErrorMessage(error));
    } else if (data) {
      setChatMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
    }
  };

  // "사진 올리기" → 갤러리 선택 화면 열기 (단체방과 같은 방식)
  const handleSendChatPhoto = () => {
    if (!chatPartner || sendingMsg) return;
    setChatAttachMenuOpen(false);
    setChatStickerOpen(false);
    setChatGalleryOpen(true);
  };

  // 갤러리에서 고른 사진들을 한 장씩 전송
  const sendChatPhotos = async (assets, opts) => {
    const sendOriginal = !!(opts && opts.original);
    setChatGalleryOpen(false);
    if (!chatPartner || !assets || !assets.length) return;
    const partnerId = chatPartner.id;
    const isSelfChat = partnerId === session.user.id;
    setSendingMsg(true);
    let fail = 0;
    let lastMsg = '';
    for (const a of assets) {
      try {
        let src = a.uri;
        try {
          const info = await MediaLibrary.getAssetInfoAsync(a);
          if (info && info.localUri) src = info.localUri;
        } catch (e) { /* 원래 uri 사용 */ }
        // 원본으로 보내기: 크기 그대로 + 최고 품질 / 아니면 가로 1080px, 품질 0.8
        const manipulated = await ImageManipulator.manipulateAsync(
          src,
          sendOriginal ? [] : [{ resize: { width: 1080 } }],
          { compress: sendOriginal ? 1 : 0.8, format: ImageManipulator.SaveFormat.JPEG }
        );
        const storagePath = `${session.user.id}/photo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`;
        const response = await fetch(manipulated.uri);
        const arrayBuffer = await response.arrayBuffer();
        const { error: uploadErr } = await supabase.storage
          .from('chat-files')
          .upload(storagePath, arrayBuffer, { contentType: 'image/jpeg', upsert: true });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from('chat-files').getPublicUrl(storagePath);
        const { data: msgData, error: msgErr } = await supabase
          .from('messages')
          .insert({
            sender_id: session.user.id,
            receiver_id: partnerId,
            content: '',
            image_url: urlData.publicUrl,
            is_read: isSelfChat,
          })
          .select()
          .single();
        if (msgErr) throw msgErr;
        if (msgData) {
          setChatMessages((prev) => (prev.some((m) => m.id === msgData.id) ? prev : [...prev, msgData]));
        }
      } catch (e) {
        fail += 1;
        lastMsg = e?.message || String(e);
      }
    }
    setSendingMsg(false);
    if (fail > 0) showAlert('사진 전송 오류', `${fail}장을 보내지 못했습니다.\n(${lastMsg})`);
  };

  const handleSendChatFile = async () => {
    if (!chatPartner || sendingMsg) return;
    setChatAttachMenuOpen(false);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const picked = result.assets[0];
      const originalName = picked.name || '첨부파일';
      const mimeType = picked.mimeType || 'application/octet-stream';
      const extMatch = originalName.match(/\.([a-zA-Z0-9]+)$/);
      const safeExt = extMatch ? extMatch[1] : 'bin';
      const storagePath = `${session.user.id}/file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${safeExt}`;

      setSendingMsg(true);
      const response = await fetch(picked.uri);
      const arrayBuffer = await response.arrayBuffer();

      const { error: uploadErr } = await supabase.storage
        .from('chat-files')
        .upload(storagePath, arrayBuffer, { contentType: mimeType, upsert: true });

      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from('chat-files').getPublicUrl(storagePath);
      const isSelfChat = chatPartner.id === session.user.id;

      const { data: msgData, error: msgErr } = await supabase
        .from('messages')
        .insert({
          sender_id: session.user.id,
          receiver_id: chatPartner.id,
          content: '',
          file_url: urlData.publicUrl,
          file_name: originalName,
          is_read: isSelfChat,
        })
        .select()
        .single();

      setSendingMsg(false);
      if (msgErr) {
        showAlert('파일 전송 실패', getKoreanErrorMessage(msgErr));
      } else if (msgData) {
        setChatMessages((prev) => {
          if (prev.some((m) => m.id === msgData.id)) return prev;
          return [...prev, msgData];
        });
      }
    } catch (e) {
      setSendingMsg(false);
      showAlert('파일 첨부 오류', `파일을 첨부하지 못했습니다.\n(${e?.message || e})`);
    }
  };

  // 오늘 날짜(한국 시간) 'YYYY-MM-DD'
  const todayKST = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().split('T')[0];
  // 화면에 보일 TODAY 숫자: 마지막 방문 날짜가 오늘이 아니면 0
  const todayVisitsOf = (p) => (p && p.last_visit_date === todayKST() ? p.today_visits || 0 : 0);
  // 다른 사람 프로필을 열었을 때 그 사람의 방문수 +1 (같은 사람은 앱을 켜 둔 동안 1번만)
  const [visitCounts, setVisitCounts] = useState({}); // { 프로필id: { today, total } }
  const visitedProfilesRef = useRef(new Set());
  const recordProfileVisit = async (profileId) => {
    if (!profileId || !session || profileId === session.user.id) return;
    if (visitedProfilesRef.current.has(profileId)) return;
    visitedProfilesRef.current.add(profileId);
    try {
      const { data, error } = await supabase.rpc('record_profile_visit', { p_profile_id: profileId });
      if (!error && data) setVisitCounts((prev) => ({ ...prev, [profileId]: { today: data.today || 0, total: data.total || 0 } }));
    } catch (e) { /* 무시 */ }
  };
  const visitLabelOf = (m) => {
    const v = visitCounts[m?.id];
    const t = v ? v.today : todayVisitsOf(m);
    const tot = v ? v.total : (m?.total_visits || 0);
    return `TODAY ${t}  |  TOTAL ${tot}`;
  };

  const loadAndCountProfile = async (user) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const defaultNick = user.email ? user.email.split('@')[0] : '내 스토리';

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (!error && data) {
      // TODAY / TOTAL 은 '다른 사람이 내 프로필을 연 횟수' (서버 함수 record_profile_visit 이 올림)
      const updated = {
        ...data,
        nickname: data.nickname || defaultNick,
        bio: data.bio || '나만의 스토리를 기록해 보세요 ✨',
      };
      setProfile(updated);
    } else {
      const initialProfile = {
        id: user.id,
        nickname: defaultNick,
        bio: '나만의 스토리를 기록해 보세요 ✨',
        avatar_url: null,
        cover_url: null,
        today_visits: 0,
        total_visits: 0,
        last_visit_date: todayStr,
      };
      setProfile(initialProfile);
      await supabase.from('profiles').upsert(initialProfile);
    }
  };

  const selectFromGallery = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        const manipulated = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 1080 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
        );
        return manipulated.uri;
      }
      return null;
    } catch (e) {
      showAlert('사진 선택 오류', `사진을 불러오지 못했습니다.\n(${e?.message || e})`);
      return null;
    }
  };

  // 새 게시물: 갤러리에서 고른 사진들을 미리보기에 추가 (최대 10장)
  const pickPostPhoto = async (assets) => {
    setPostGalleryOpen(false);
    if (!assets || !assets.length) return;
    setPostPhotoBusy(true);
    const added = [];
    try {
      for (const a of assets) {
        try {
          let src = a.uri;
          try {
            const info = await MediaLibrary.getAssetInfoAsync(a);
            if (info && info.localUri) src = info.localUri;
          } catch (e) { /* 원래 uri 사용 */ }
          // 게시물 사진 화질: 가로 최대 1600px, 압축 0.9 (원본이 더 작으면 원본 크기 그대로)
          const POST_MAX_W = 1600;
          const actions = a.width && a.width > 0 && a.width <= POST_MAX_W ? [] : [{ resize: { width: POST_MAX_W } }];
          const manipulated = await ImageManipulator.manipulateAsync(
            src,
            actions,
            { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
          );
          added.push(manipulated.uri);
        } catch (e) {
          showAlert('사진 선택 오류', `사진 한 장을 불러오지 못했습니다.\n(${e?.message || e})`);
        }
      }
      setPostImages((prev) => [...prev, ...added].slice(0, MAX_POST_PHOTOS));
    } finally {
      setPostPhotoBusy(false);
    }
  };

  const uploadImageFile = async (uri, prefix) => {
    if (!uri) return null;
    if (uri.startsWith('http')) return uri;

    const fileName = `${session.user.id}/${prefix}_${Date.now()}.jpg`;
    const response = await fetch(uri);
    const arrayBuffer = await response.arrayBuffer();

    const { error } = await supabase.storage
      .from('post-images')
      .upload(fileName, arrayBuffer, { contentType: 'image/jpeg', upsert: true });

    if (error) throw error;
    const { data } = supabase.storage.from('post-images').getPublicUrl(fileName);
    return data.publicUrl;
  };

  // 회원 프로필 → 회원 페이지 (게시물 + 버튼 모음)
  const openMemberPage = (u) => {
    if (!u) return;
    setSelectedFriend(null);
    setMemberMenuOpen(false);
    setMemberPostsGrid(true);
    setMemberPostsUser(u);
  };
  const openProfileEditor = () => {
    setTempNickname(profile.nickname || '');
    setTempBio(profile.bio || '');
    setTempAvatarUri(profile.avatar_url || null);
    setTempCoverUri(profile.cover_url || null);
    setTempBgmUri(null);
    setTempBgmName('');
    setTempBgmTitle(profile.bgm_title || '');
    setBgmChanged(false);
    setEditProfileModal(true);
  };

  const pickBgmFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
      if (result.canceled || !result.assets || !result.assets[0]) return;
      const a = result.assets[0];
      if (a.size && a.size > 15 * 1024 * 1024) {
        showAlert('파일이 너무 커요', '15MB 이하의 음악 파일을 골라 주세요.');
        return;
      }
      setTempBgmUri(a.uri);
      setTempBgmName(a.name || 'song.mp3');
      setTempBgmTitle((a.name || '내 노래').replace(/\.[^.]+$/, ''));
      setTempBgmMime(a.mimeType || 'audio/mpeg');
      setBgmChanged(true);
    } catch (e) {
      showAlert('음악 선택 오류', `파일을 불러오지 못했습니다.\n(${e?.message || e})`);
    }
  };

  // 새 게시물 창의 'BGM 변경' 버튼: 음악 파일을 골라 바로 내 프로필 BGM으로 바꿈
  const [bgmQuickBusy, setBgmQuickBusy] = useState(false);
  const quickChangeBgm = async () => {
    if (bgmQuickBusy) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
      if (result.canceled || !result.assets || !result.assets[0]) return;
      const a = result.assets[0];
      if (a.size && a.size > 15 * 1024 * 1024) {
        showAlert('파일이 너무 커요', '15MB 이하의 음악 파일을 골라 주세요.');
        return;
      }
      setBgmQuickBusy(true);
      const name = a.name || 'song.mp3';
      const ext = ((name.match(/\.([a-zA-Z0-9]+)$/) || [])[1] || 'mp3').toLowerCase();
      const fileName = `bgm_${Date.now()}.${ext}`;
      const path = `${session.user.id}/${fileName}`;
      const resp = await fetch(a.uri);
      const buf = await resp.arrayBuffer();
      const up = await supabase.storage.from('bgm').upload(path, buf, { contentType: a.mimeType || 'audio/mpeg', upsert: true });
      if (up.error) throw up.error;
      const url = supabase.storage.from('bgm').getPublicUrl(path).data.publicUrl;
      const title = name.replace(/\.[^.]+$/, '') || '내 노래';
      const { error } = await supabase.from('profiles').update({ bgm_url: url, bgm_title: title }).eq('id', session.user.id);
      if (error) throw error;
      cleanupOldBgmFiles(fileName);
      setProfile((prev) => ({ ...prev, bgm_url: url, bgm_title: title }));
      fetchFriendsAndRequests();
      bgmUnmute();
      bgmPlay(bgmToTrack({ id: session.user.id, nickname: profile.nickname, bgm_url: url, bgm_title: title }));
      setBgmQuickBusy(false);
      showAlert('BGM 변경 완료', `"${title}"(으)로 바뀌었어요.`);
    } catch (e) {
      setBgmQuickBusy(false);
      showAlert('BGM 변경 실패', `음악을 올리지 못했습니다.\n(${e?.message || e})`);
    }
  };

  // ---- 가족 BGM 모음 (서버의 bgm-library 폴더에 관리자가 올려둔 저작권 걱정 없는 곡들) ----
  const [bgmLibOpen, setBgmLibOpen] = useState(false);
  const [bgmLibItems, setBgmLibItems] = useState([]);
  const [bgmLibLoading, setBgmLibLoading] = useState(false);

  // ---- 음악 저장소 (노래 듣기) ----
  const [musicQuery, setMusicQuery] = useState('');
  const [musicSel, setMusicSel] = useState({}); // { url: true }
  const [musicRecShuffle, setMusicRecShuffle] = useState(0);
  const [musicRepeat, setMusicRepeatState] = useState(true);
  const [musicLoading, setMusicLoading] = useState(false);
  const setMusicRepeat = (v) => { musicRepeatRef.current = v; setMusicRepeatState(v); };
  // 음악 올리기 / 고치기 창
  const [musicUp, setMusicUp] = useState(null); // { mode: 'new'|'edit', file?, item?, title, artist, agree }
  const [musicUpBusy, setMusicUpBusy] = useState(false);
  // 저장소 파일 목록 + 한글 제목표(music_tracks)를 합쳐서 곡 목록 만들기
  const loadMusicItems = async () => {
    const [st, mt] = await Promise.all([
      supabase.storage.from('bgm-library').list('', { limit: 1000, sortBy: { column: 'name', order: 'asc' } }),
      supabase.from('music_tracks').select('file_name, title, artist, uploader_id'),
    ]);
    if (st.error) throw st.error;
    const meta = {};
    if (!mt.error && Array.isArray(mt.data)) mt.data.forEach((r) => { meta[r.file_name] = r; });
    return (st.data || [])
      .filter((f) => f && f.name && /\.(mp3|m4a|wav|aac|ogg)$/i.test(f.name))
      .map((f) => {
        const m = meta[f.name];
        return {
          name: f.name,
          title: (m && m.title) || f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim(),
          artist: (m && m.artist) || '',
          uploaderId: (m && m.uploader_id) || null,
          hasMeta: !!m,
          url: supabase.storage.from('bgm-library').getPublicUrl(f.name).data.publicUrl,
        };
      });
  };
  const fetchMusicLibrary = async () => {
    setMusicLoading(true);
    try {
      const items = await loadMusicItems();
      setBgmLibItems(items);
    } catch (e) {
      // 목록을 못 불러오면 빈 목록
    }
    setMusicLoading(false);
  };

  const openBgmLibrary = async () => {
    setBgmLibOpen(true);
    setBgmLibLoading(true);
    try {
      const items = await loadMusicItems();
      setBgmLibItems(items);
    } catch (e) {
      setBgmLibItems([]);
      showAlert('BGM 모음 오류', `곡 목록을 불러오지 못했습니다.\n(${e?.message || e})`);
    }
    setBgmLibLoading(false);
  };

  const previewLibraryBgm = (it) => {
    bgmUnmute();
    bgmPlay({ url: it.url, title: it.title, ownerId: null, ownerLabel: '미리듣기' });
  };

  const chooseLibraryBgm = async (it) => {
    if (bgmQuickBusy) return;
    setBgmQuickBusy(true);
    try {
      const { error } = await supabase.from('profiles').update({ bgm_url: it.url, bgm_title: it.title }).eq('id', session.user.id);
      if (error) throw error;
      cleanupOldBgmFiles(null); // 예전에 내가 직접 올린 곡 파일은 정리
      setProfile((prev) => ({ ...prev, bgm_url: it.url, bgm_title: it.title }));
      fetchFriendsAndRequests();
      bgmUnmute();
      bgmPlay(bgmToTrack({ id: session.user.id, nickname: profile.nickname, bgm_url: it.url, bgm_title: it.title }));
      setBgmLibOpen(false);
      showAlert('BGM 변경 완료', `"${it.title}"(으)로 바뀌었어요.`);
    } catch (e) {
      showAlert('BGM 변경 실패', `${e?.message || e}`);
    }
    setBgmQuickBusy(false);
  };

  // 내 폴더(bgm/내아이디/)에서 keepName 을 뺀 나머지 음악 파일을 모두 삭제
  const cleanupOldBgmFiles = async (keepName) => {
    try {
      const folder = session.user.id;
      const { data, error } = await supabase.storage.from('bgm').list(folder, { limit: 100 });
      if (error || !Array.isArray(data)) return;
      const oldPaths = data
        .filter((f) => f && f.name && f.name !== keepName && f.name !== '.emptyFolderPlaceholder')
        .map((f) => `${folder}/${f.name}`);
      if (oldPaths.length > 0) {
        await supabase.storage.from('bgm').remove(oldPaths);
      }
    } catch (e) { /* 정리 실패해도 앱 사용에는 문제 없음 */ }
  };

  const saveProfileSettings = async () => {
    if (!tempNickname.trim()) {
      showAlert('알림', '이름(닉네임)을 입력해 주세요.');
      return;
    }

    setLoading(true);
    try {
      const finalAvatarUrl = await uploadImageFile(tempAvatarUri, 'avatar');
      const finalCoverUrl = await uploadImageFile(tempCoverUri, 'cover');

      const updates = {
        id: session.user.id,
        nickname: tempNickname.trim(),
        bio: tempBio.trim(),
        avatar_url: finalAvatarUrl,
        cover_url: finalCoverUrl,
      };

      let newBgmFileName = null; // 새로 올린 곡 파일 이름 (옛 파일 정리할 때 이것만 남김)
      if (bgmChanged) {
        if (tempBgmUri) {
          const ext = ((tempBgmName.match(/\.([a-zA-Z0-9]+)$/) || [])[1] || 'mp3').toLowerCase();
          newBgmFileName = `bgm_${Date.now()}.${ext}`;
          const path = `${session.user.id}/${newBgmFileName}`;
          const resp = await fetch(tempBgmUri);
          const buf = await resp.arrayBuffer();
          const up = await supabase.storage.from('bgm').upload(path, buf, { contentType: tempBgmMime || 'audio/mpeg', upsert: true });
          if (up.error) throw up.error;
          updates.bgm_url = supabase.storage.from('bgm').getPublicUrl(path).data.publicUrl;
          updates.bgm_title = tempBgmTitle.trim() || '내 노래';
        } else {
          updates.bgm_url = null;
          updates.bgm_title = null;
        }
      }

      const { error } = await supabase.from('profiles').upsert(updates);
      setLoading(false);

      // 곡을 바꾸거나 지웠으면: 서버에 남아 있는 예전 곡 파일을 삭제 (멤버당 1곡만 보관)
      if (!error && bgmChanged) {
        cleanupOldBgmFiles(newBgmFileName);
      }

      if (error) {
        showAlert('저장 실패', getKoreanErrorMessage(error));
        return;
      }

      setProfile((prev) => ({ ...prev, ...updates }));
      setEditProfileModal(false);
      fetchFriendsAndRequests();
      fetchPosts();
      showAlert('완료', '프로필이 저장되었습니다!');
    } catch (e) {
      setLoading(false);
      showAlert('오류', `프로필 저장 중 문제가 발생했습니다.\n(${e?.message || e})`);
    }
  };

  const switchAuthMode = (toSignUp) => {
    setPassword('');
    setPasswordConfirm('');
    setIsSignUpScreen(toSignUp);
  };

  const handleLogin = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      showAlert('알림', '이메일 아이디와 비밀번호를 모두 입력해 주세요.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
    setLoading(false);
    if (error) {
      showAlert('로그인 실패', getKoreanErrorMessage(error));
    } else {
      AsyncStorage.setItem(LAST_EMAIL_STORAGE_KEY, trimmedEmail).catch(() => {});
    }
  };

  const checkIsRegisteredEmail = async (targetEmail) => {
    const normalized = targetEmail.trim().toLowerCase();
    if (!normalized) return false;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, nickname')
        .ilike('email', normalized)
        .limit(1);

      if (!error && Array.isArray(data) && data.length > 0) {
        return true;
      }
    } catch {
      // profiles에 email 컬럼이 없는 경우 폴백으로 진행
    }

    const { error: probeError } = await supabase.auth.signInWithPassword({
      email: normalized,
      password: '__NON_EXISTENT_CHECK_PASSWORD_999!@#',
    });

    if (!probeError) {
      await supabase.auth.signOut();
      return true;
    }

    const msg = (probeError.message || '').toLowerCase();
    if (msg.includes('invalid login credentials') || (probeError.code || '').toLowerCase() === 'invalid_credentials') {
      return true;
    }
    return false;
  };

  const handleFindId = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      showAlert('아이디 찾기', '가입된 이메일 아이디를 입력해 주세요.');
      return;
    }

    setLoading(true);
    const isRegistered = await checkIsRegisteredEmail(trimmedEmail);
    setLoading(false);

    if (!isRegistered) {
      showAlert('아이디 찾기', '가입되지 않은 사용자입니다.');
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail);
    if (error) {
      showAlert('전송 실패', getKoreanErrorMessage(error));
      return;
    }

    showAlert(
      '아이디 찾기',
      `가입된 아이디(${trimmedEmail})가 확인되었습니다.\n보안상 기존 비밀번호는 발송되지 않으며, 가입된 메일로 비밀번호 재설정 안내를 보냈습니다.`
    );
  };

  const handleResetPassword = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      showAlert('비밀번호 재설정', '이메일 아이디를 먼저 입력해 주세요.');
      return;
    }

    setLoading(true);
    const isRegistered = await checkIsRegisteredEmail(trimmedEmail);
    if (!isRegistered) {
      setLoading(false);
      showAlert('비밀번호 재설정', '가입되지 않은 사용자입니다.');
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail);
    setLoading(false);

    if (error) {
      showAlert('재설정 실패', getKoreanErrorMessage(error));
    } else {
      showAlert('비밀번호 재설정', `${trimmedEmail} 주소로 비밀번호 재설정 안내 메일을 보냈습니다.`);
    }
  };

  const handleSignUp = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return showAlert('알림', '이메일 아이디를 입력해 주세요.');
    if (password.length < 6) return showAlert('알림', '비밀번호는 6자 이상 입력해 주세요.');
    if (password !== passwordConfirm) return showAlert('알림', '비밀번호가 일치하지 않습니다.');

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email: trimmedEmail, password });
    setLoading(false);

    if (error) return showAlert('회원가입 실패', getKoreanErrorMessage(error));
    AsyncStorage.setItem(LAST_EMAIL_STORAGE_KEY, trimmedEmail).catch(() => {});
    if (data?.session) {
      showAlert('가입 완료', '환영합니다!');
    } else {
      showAlert('가입 완료', '로그인 화면에서 로그인해 주세요!', () => switchAuthMode(false));
    }
  };

  const fetchPosts = async () => {
    const { data, error } = await supabase
      .from('posts')
      .select('*, profiles(nickname, avatar_url), reactions(type, user_id)')
      .order('created_at', { ascending: false });
    if (!error && data) {
      setPosts(data);
      if (session?.user?.id) {
        AsyncStorage.setItem(`posts_cache_v1_${session.user.id}`, JSON.stringify(data.slice(0, 40))).catch(() => {});
      }
    }
  };

  // ---- 차단 / 신고 ----
  const fetchBlocks = async () => {
    try {
      const { data, error } = await supabase
        .from('user_blocks')
        .select('blocked_id')
        .eq('blocker_id', session.user.id);
      if (!error && Array.isArray(data)) setBlockedIds(data.map((r) => r.blocked_id));
    } catch (e) { /* 무시 */ }
  };

  const blockUser = (userId, name, onDone) => {
    Alert.alert(
      '차단',
      `${name || '이 사람'}님을 차단할까요?\n이 사람의 글과 댓글이 보이지 않아요. (차단 관리에서 해제할 수 있어요)`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '차단',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('user_blocks')
              .insert({ blocker_id: session.user.id, blocked_id: userId });
            if (error && error.code !== '23505') {
              showAlert('차단 실패', getKoreanErrorMessage(error));
              return;
            }
            setBlockedIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
            setSelectedPostId(null);
            if (onDone) onDone();
            showAlert('차단했어요', '더 이상 이 사람의 글과 댓글이 보이지 않아요.');
          },
        },
      ]
    );
  };

  const unblockUser = async (userId) => {
    const { error } = await supabase
      .from('user_blocks')
      .delete()
      .eq('blocker_id', session.user.id)
      .eq('blocked_id', userId);
    if (error) {
      showAlert('해제 실패', getKoreanErrorMessage(error));
      return false;
    }
    setBlockedIds((prev) => prev.filter((id) => id !== userId));
    return true;
  };

  const reportPost = (post) => {
    const send = async (reason) => {
      const { error } = await supabase.from('reports').insert({
        reporter_id: session.user.id,
        target_type: 'post',
        target_id: String(post.id),
        target_user_id: post.author_id,
        reason,
      });
      if (error) showAlert('신고 실패', getKoreanErrorMessage(error));
      else showAlert('신고했어요', '확인 후 조치할게요. 불편하시면 차단도 할 수 있어요.');
    };
    Alert.alert('신고 사유', '이 글을 신고하는 이유를 골라 주세요.', [
      { text: '스팸·광고', onPress: () => send('스팸·광고') },
      { text: '욕설·불쾌한 내용', onPress: () => send('욕설·불쾌한 내용') },
      { text: '취소', style: 'cancel' },
    ]);
  };

  const createPost = async () => {
    if (!content.trim() && postImages.length === 0) {
      showAlert('알림', '내용을 입력하거나 사진을 첨부해 주세요.');
      return;
    }

    setLoading(true);
    try {
      let uploadedUrls = [];
      for (let i = 0; i < postImages.length; i++) {
        const publicUrl = await uploadImageFile(postImages[i], `post${i}`);
        if (publicUrl) uploadedUrls.push(publicUrl);
      }

      const { error } = await supabase.from('posts').insert({
        author_id: session.user.id,
        content: content.trim(),
        image_urls: uploadedUrls,
        visibility: visibility || 'public',
      });

      setLoading(false);
      if (error) {
        showAlert('등록 실패', getKoreanErrorMessage(error));
      } else {
        setContent('');
        setImageUri(null); setPostImages([]);
        setVisibility('public');
        setWriteModalVisible(false);
        fetchPosts();
      }
    } catch (e) {
      setLoading(false);
      showAlert('오류', `게시글 등록 중 오류가 발생했습니다.\n(${e?.message || e})`);
    }
  };

  const saveEditPost = async (postId, newText, nextVisibility) => {
    if (!newText.trim()) {
      showAlert('알림', '수정할 내용을 입력해 주세요.');
      return;
    }
    setLoading(true);
    const payload = { content: newText.trim() };
    if (nextVisibility) payload.visibility = nextVisibility;

    const { error } = await supabase
      .from('posts')
      .update(payload)
      .eq('id', postId);
    setLoading(false);

    if (error) {
      showAlert('수정 실패', getKoreanErrorMessage(error));
    } else {
      fetchPosts();
    }
  };

  const confirmDeletePost = (postId) => {
    Alert.alert('글 삭제', '정말 이 글을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          const { error } = await supabase.from('posts').delete().eq('id', postId);
          setLoading(false);
          if (error) showAlert('삭제 실패', getKoreanErrorMessage(error));
          else {
            setSelectedPostId(null);
            fetchPosts();
          }
        },
      },
    ]);
  };

  const toggleReaction = async (postId, type) => {
    hapticTap();
    const target = posts.find((p) => String(p.id) === String(postId));
    const mine = target && (target.reactions || []).find((x) => x.user_id === session.user.id);
    if (mine && mine.type === type) {
      await supabase.from('reactions').delete().eq('post_id', postId).eq('user_id', session.user.id);
      fetchPosts();
      return;
    }
    await supabase.from('reactions').upsert(
      { post_id: postId, user_id: session.user.id, type },
      { onConflict: 'post_id,user_id' }
    );
    fetchPosts();
  };

  // 조회수/방문 기록 (훅은 반드시 아래 'return' 보다 위에 있어야 함)
  useEffect(() => { if (selectedPostId) recordPostView(selectedPostId); }, [selectedPostId]);
  useEffect(() => { if (selectedFriend?.id) recordProfileVisit(selectedFriend.id); }, [selectedFriend?.id]);
  useEffect(() => { if (memberPostsUser?.id) recordProfileVisit(memberPostsUser.id); }, [memberPostsUser?.id]);

  useEffect(() => { if (viewingImage?.postId) recordPostView(viewingImage.postId); }, [viewingImage?.postId]);
  useEffect(() => { if (commentSheetPost?.id) recordPostView(commentSheetPost.id); }, [commentSheetPost?.id]);

  if (!fontsReady) return null;

  if (!session) {
    if (isSignUpScreen) {
      return (
        <SafeAreaView style={[styles.authContainer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.authInnerBox}>
            <Text style={styles.logo}>me</Text>
            <Text style={styles.authSubTitle}>회원가입</Text>
            <TextInput
              style={styles.input}
              placeholder="이메일 아이디"
              placeholderTextColor="#78909C"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              style={styles.input}
              placeholder="비밀번호 (6자 이상)"
              placeholderTextColor="#78909C"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            <TextInput
              style={styles.input}
              placeholder="비밀번호 확인"
              placeholderTextColor="#78909C"
              value={passwordConfirm}
              onChangeText={setPasswordConfirm}
              secureTextEntry
            />
            <TouchableOpacity style={styles.btnPrimary} onPress={handleSignUp} disabled={loading}>
              {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.btnText}>회원가입</Text>}
            </TouchableOpacity>
            <View style={styles.authLinksRow}>
              <TouchableOpacity onPress={() => switchAuthMode(false)} disabled={loading}>
                <Text style={styles.authLinkText}>로그인 화면으로 돌아가기</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={[styles.authContainer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.authInnerBox}>
          <Text style={styles.logo}>me</Text>

          <TextInput
            style={styles.input}
            placeholder="이메일 아이디"
            placeholderTextColor="#78909C"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            placeholder="비밀번호"
            placeholderTextColor="#78909C"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity style={styles.btnPrimary} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.btnText}>로그인</Text>}
          </TouchableOpacity>

          <View style={styles.authLinksRow}>
            <TouchableOpacity onPress={handleFindId} disabled={loading}>
              <Text style={styles.authLinkText}>아이디 찾기</Text>
            </TouchableOpacity>
            <Text style={styles.authLinkDot}>·</Text>
            <TouchableOpacity onPress={handleResetPassword} disabled={loading}>
              <Text style={styles.authLinkText}>비밀번호 재설정</Text>
            </TouchableOpacity>
            <Text style={styles.authLinkDot}>·</Text>
            <TouchableOpacity onPress={() => switchAuthMode(true)} disabled={loading}>
              <Text style={styles.authLinkText}>회원가입</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const bgmList = members
    .filter((m) => m.bgm_url)
    .sort((a, b) => (a.id === session.user.id ? -1 : 0) - (b.id === session.user.id ? -1 : 0));
  bgmListRef.current = bgmList;
  const shownBgmTrack = bgmTrack || (bgmList[0] ? bgmToTrack(bgmList[0]) : null);

  const visiblePosts = posts.filter(isPostVisibleToMe).filter((p) => !blockedIds.includes(p.author_id));
  const otherMembers = members
    .filter((m) => m.id !== session.user.id)
    .sort((x, y) => {
      const ux = (unreadCountBySender[x.id] || 0) > 0 ? 0 : 1;
      const uy = (unreadCountBySender[y.id] || 0) > 0 ? 0 : 1;
      if (ux !== uy) return ux - uy;
      const fx = acceptedFriendIds.includes(x.id) ? 0 : 1;
      const fy = acceptedFriendIds.includes(y.id) ? 0 : 1;
      return fx - fy;
    });
  const feedPosts = onlyFavoritesFeed
    ? visiblePosts.filter((p) => p.author_id === session.user.id || acceptedFriendIds.includes(p.author_id))
    : visiblePosts;

  const myStoryPosts = visiblePosts.filter((p) => p.author_id === session.user.id);

  // 게시글 탭: 고른 회원 / 보여줄 게시글
  const postsSelMember = postsMemberId
    ? (members.find((m) => m.id === postsMemberId)
      || (postsMemberId === session.user.id ? { id: session.user.id, nickname: profile.nickname, avatar_url: profile.avatar_url, bio: profile.bio } : null))
    : null;
  const postsList = postsMemberId
    ? visiblePosts.filter((p) => p.author_id === postsMemberId)
    : (memberFilterFriends
      ? visiblePosts.filter((p) => p.author_id === session.user.id || acceptedFriendIds.includes(p.author_id))
      : visiblePosts);
  const incomingCount = incomingRequests.length;
  const totalUnreadMessages = Object.values(unreadCountBySender).reduce((sum, n) => sum + (n || 0), 0);

  const unreadSendersSorted = Object.entries(unreadCountBySender)
    .filter(([senderId, count]) => senderId !== session.user.id && (count || 0) > 0)
    .sort((a, b) => (b[1] || 0) - (a[1] || 0))
    .map(([senderId, count]) => {
      const found = members.find((m) => m.id === senderId);
      return {
        id: senderId,
        nickname: found?.nickname || '회원',
        bio: found?.bio || '',
        avatar_url: found?.avatar_url || null,
        unreadCount: count,
      };
    });

  // 1:1 목록: 대화한 적 있는 사람만, 최근 대화 순 (카카오톡처럼)
  const sortedChatMembers = (() => {
    const myId = session.user.id;
    const meItem = members.find((m) => m.id === myId) || {
      id: myId,
      nickname: profile.nickname || '나',
      bio: profile.bio || '',
      avatar_url: profile.avatar_url || null,
    };
    const all = [meItem, ...members.filter((m) => m.id !== myId)];
    if (chatPartner && !all.some((m) => m.id === chatPartner.id)) all.push(chatPartner);
    return all
      .filter((m) => lastMsgByPartner[m.id] || (unreadCountBySender[m.id] || 0) > 0 || chatPartner?.id === m.id)
      .sort((a, b) => {
        const ta = lastMsgByPartner[a.id]?.created_at || '9999';
        const tb = lastMsgByPartner[b.id]?.created_at || '9999';
        return ta < tb ? 1 : ta > tb ? -1 : 0;
      });
  })();

  const currentAccountEmail = session.user?.email || '';
  const currentAccountName = profile.nickname || (currentAccountEmail ? currentAccountEmail.split('@')[0] : '내 계정');

  // 모든 메뉴 맨 위에 고정: 로고 줄 + 메뉴 팝업 + BGM 재생기
  const bgmTabLabel = (() => {
    if (mainTab === 'home') return '홈 BGM이 재생되고 있습니다.';
    if (mainTab === 'music') return '음악 저장소에서 재생되고 있습니다.';
    if (mainTab === 'group') return '단체방 화면에서도 BGM이 재생되고 있습니다.';
    const name = { posts: '게시글', chats: '1:1', friends: '회원검색', story: '내 프로필' }[mainTab] || '이';
    return `${name} 화면에서도 BGM이 재생되고 있습니다.`;
  })();

  // 햄버거 메뉴 / 로고 메뉴: 화면 위에 떠서 열림 (아래 화면을 밀어내지 않음)
  const renderTopMenus = () => {
    if (!accountMenuOpen && !brandMenuOpen) return null;
    return (
      <View style={styles.topMenuOverlay} pointerEvents="box-none">
        {/* 메뉴 바깥을 누르면 닫힘 */}
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => { setAccountMenuOpen(false); setBrandMenuOpen(false); }}
        />
        <View style={{ position: 'absolute', top: topBarBottom, left: 0, right: 0, paddingHorizontal: SIDE_MARGIN }} pointerEvents="box-none">
          {accountMenuOpen && (
            <View style={styles.accountPopoverMenu}>
              {/* 이름 줄을 누르면 내 프로필 화면 (아래 메뉴바의 프로필 버튼 대신) */}
              <TouchableOpacity
                style={styles.accountPopoverHeader}
                activeOpacity={0.7}
                onPress={() => {
                  setAccountMenuOpen(false);
                  setMemberPostsUser(null);
                  setMainTab('story');
                }}
              >
                <Ionicons name="person-circle-outline" size={18} color="#18181B" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.accountPopoverName} numberOfLines={1}>
                    {currentAccountName}
                  </Text>
                  <Text style={styles.accountPopoverEmail} numberOfLines={1}>
                    {currentAccountEmail ? `${currentAccountEmail} · ` : ''}내 프로필 보기 ›
                  </Text>
                </View>
              </TouchableOpacity>

              <View style={styles.igDropdownDivider} />

              <TouchableOpacity
                style={styles.accountPopoverActionRow}
                onPress={() => setIncomingListExpanded(!incomingListExpanded)}
              >
                <Ionicons name="notifications-outline" size={16} color="#0288D1" />
                <Text style={styles.accountPopoverActionText}>친구 신청</Text>
                <View style={styles.applicantCountPill}>
                  <Text style={styles.applicantCountPillText}>{incomingCount}명</Text>
                </View>
              </TouchableOpacity>

              {incomingListExpanded && incomingCount > 0 && (
                <View style={styles.incomingRequestBox}>
                  {incomingRequests.map((req) => (
                    <View key={req.id} style={styles.incomingRequestRow}>
                      <Text style={styles.incomingRequesterName} numberOfLines={1}>
                        {req.requesterProfile?.nickname || '회원'}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 5 }}>
                        <TouchableOpacity
                          style={styles.acceptMiniBtn}
                          onPress={() => acceptFriendRequest(req.id, req.requester_id)}
                        >
                          <Text style={styles.acceptMiniBtnText}>수락</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.rejectMiniBtn}
                          onPress={() => rejectFriendRequest(req.id, req.requester_id)}
                        >
                          <Text style={styles.rejectMiniBtnText}>거절</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.igDropdownDivider} />

              <TouchableOpacity style={styles.accountPopoverActionRow} onPress={openCacheClear}>
                <Ionicons name="trash-outline" size={16} color="#18181B" />
                <Text style={styles.accountPopoverActionText}>캐시 삭제</Text>
              </TouchableOpacity>
              <View style={styles.igDropdownDivider} />

              <TouchableOpacity
                style={styles.accountPopoverActionRow}
                onPress={handleLogout}
                disabled={loading}
              >
                <Ionicons name="log-out-outline" size={16} color="#18181B" />
                <Text style={styles.accountPopoverActionText}>로그아웃</Text>
              </TouchableOpacity>
              <View style={styles.igDropdownDivider} />

              <TouchableOpacity
                style={styles.accountPopoverActionRow}
                onPress={() => setSettingsMenuOpen(!settingsMenuOpen)}
              >
                <Ionicons name="settings-outline" size={16} color="#18181B" />
                <Text style={styles.accountPopoverActionText}>설정</Text>
                <Ionicons name={settingsMenuOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#71717A" />
              </TouchableOpacity>

              {settingsMenuOpen && (
                <View style={{ paddingLeft: 14 }}>
                  <View style={styles.igDropdownDivider} />
                  <TouchableOpacity
                    style={styles.accountPopoverActionRow}
                    onPress={() => { hapticSelect(); toggleBgmAutoStart(); }}
                  >
                    <Ionicons name="musical-note-outline" size={16} color="#18181B" />
                    <Text style={styles.accountPopoverActionText}>접속시 음악재생</Text>
                    <View style={styles.applicantCountPill}>
                      <Text style={styles.applicantCountPillText}>{bgmAutoStart ? '켬' : '끔'}</Text>
                    </View>
                  </TouchableOpacity>
                  <View style={styles.igDropdownDivider} />
                  <TouchableOpacity
                    style={styles.accountPopoverActionRow}
                    onPress={() => { hapticSelect(); cycleThemeMode(); }}
                  >
                    <Ionicons name="moon-outline" size={16} color="#18181B" />
                    <Text style={styles.accountPopoverActionText}>화면 모드</Text>
                    <View style={styles.applicantCountPill}>
                      <Text style={styles.applicantCountPillText}>{modeLabel(getMode())}</Text>
                    </View>
                  </TouchableOpacity>
                  <View style={styles.igDropdownDivider} />

                  <TouchableOpacity
                    style={styles.accountPopoverActionRow}
                    onPress={() => {
                      setAccountMenuOpen(false);
                      setBlockListOpen(true);
                    }}
                  >
                    <Ionicons name="ban-outline" size={16} color="#18181B" />
                    <Text style={styles.accountPopoverActionText}>차단 관리</Text>
                    <View style={styles.applicantCountPill}>
                      <Text style={styles.applicantCountPillText}>{blockedIds.length}명</Text>
                    </View>
                  </TouchableOpacity>
                  <View style={styles.igDropdownDivider} />

                  <TouchableOpacity
                    style={styles.accountPopoverActionRow}
                    onPress={() => {
                      setAccountMenuOpen(false);
                      openNotificationSoundSettings();
                    }}
                  >
                    <Ionicons name="musical-notes-outline" size={16} color="#18181B" />
                    <Text style={styles.accountPopoverActionText}>알림음 변경</Text>
                  </TouchableOpacity>
                  <View style={styles.igDropdownDivider} />

                  <TouchableOpacity
                    style={styles.accountPopoverActionRow}
                    onPress={handleWithdrawAccount}
                    disabled={loading}
                  >
                    <Ionicons name="trash-outline" size={16} color="#DC2626" />
                    <Text style={[styles.accountPopoverActionText, { color: '#DC2626' }]}>탈퇴</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {brandMenuOpen && (
            <View style={styles.igBrandDropdown}>
              <TouchableOpacity
                style={styles.igDropdownRow}
                onPress={() => {
                  setBrandMenuOpen(false);
                  setOnlyFavoritesFeed(false);
                  fetchFriendsAndRequests();
                  setMainTab('friends');
                }}
              >
                <Ionicons name="person-add-outline" size={17} color="#111111" />
                <Text style={styles.igDropdownLabel}>친구하기</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderTopHeader = () => (
    <View style={styles.igHeaderContainer}>
      <View
        style={styles.igTopBar}
        onLayout={(e) => {
          const { y, height } = e.nativeEvent.layout;
          setTopBarBottom(y + height);
        }}
      >
        <View style={{ width: 24 }} />

        <TouchableOpacity
          style={styles.igCenterBrandBtn}
          activeOpacity={0.75}
          onPress={() => {
            setAccountMenuOpen(false);
            setBrandMenuOpen(!brandMenuOpen);
          }}
        >
          <Text style={styles.igLogoText}>
            me
          </Text>
          <Ionicons
            name={brandMenuOpen ? 'chevron-up' : 'chevron-down'}
            size={18}
            color="#333333"
            style={{ marginLeft: 6 }}
          />
          {/* 로고 옆 문구 */}
          <Text style={styles.igTagline} numberOfLines={1}>healing life는 me에서..</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.igTopRightBtn}
          activeOpacity={0.75}
          onPress={() => {
            setBrandMenuOpen(false);
            setAccountMenuOpen(!accountMenuOpen);
          }}
        >
          <Ionicons name="menu" size={23} color="#111111" />
          {incomingCount > 0 && (
            <>
              <View style={styles.menuAlertDot} />
              <View style={styles.menuApplicantBadge}>
                <Text style={styles.menuApplicantBadgeText}>{incomingCount}</Text>
              </View>
            </>
          )}
        </TouchableOpacity>
      </View>

      {shownBgmTrack ? (
        <MusicBar
          track={shownBgmTrack}
          playing={bgmPlaying}
          muted={bgmMuted}
          onToggleMute={bgmToggleMute}
          hasNext={bgmList.length > 1}
          onToggle={() => bgmToggle(shownBgmTrack)}
          onNext={() => bgmNext(shownBgmTrack)}
          onChangeBgm={openBgmLibrary}
          label={bgmTabLabel}
        />
      ) : null}

      {/* 새 버전 알림 띠 */}
      {updateInfo && updateBannerOn ? (
        <View style={styles.updBanner}>
          <Ionicons name="download-outline" size={16} color="#3F3F46" />
          <Text style={styles.updBannerText} numberOfLines={1}>새 버전 {updateInfo.latest}이(가) 있어요</Text>
          <TouchableOpacity style={styles.updBannerBtn} onPress={openStorePage}>
            <Text style={styles.updBannerBtnText}>업데이트</Text>
          </TouchableOpacity>
          {!updateInfo.force ? (
            <TouchableOpacity
              hitSlop={10}
              onPress={() => {
                setUpdateBannerOn(false);
                AsyncStorage.setItem(UPDATE_BANNER_KEY, String(updateInfo.latest)).catch(() => {});
              }}
            >
              <Ionicons name="close" size={16} color="#A1A1AA" />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {/* 캐시 삭제 확인 창 */}
      <Modal visible={cacheOpen} transparent animationType="fade" onRequestClose={() => { if (!cacheBusy) setCacheOpen(false); }}>
        <View style={styles.updDim}>
          <View style={[styles.updCard, { alignItems: 'stretch', paddingBottom: 18 }]}>
            <Text style={styles.ccTitle}>캐시 삭제</Text>
            <Text style={styles.ccSub}>me 앱과 플레이스토어의 임시 파일을 비워요</Text>
            <View style={styles.ccStep}>
              <View style={[styles.ccNum, { backgroundColor: '#3F3F46' }]}><Text style={[styles.ccNumText, { color: '#FFFFFF' }]}>1</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.ccStepTitle}>
                  me 앱 캐시 <Text style={{ fontWeight: '400', color: '#71717A' }}>{cacheSize == null ? '계산 중…' : fmtBytes(cacheSize)}</Text>
                </Text>
                <Text style={styles.ccStepSub}>사진·동영상·노래 임시 파일 · 자동으로 지워져요</Text>
              </View>
            </View>
            {Platform.OS === 'android' ? (
              <View style={styles.ccStep}>
                <View style={styles.ccNum}><Text style={styles.ccNumText}>2</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ccStepTitle}>플레이스토어 캐시</Text>
                  <Text style={styles.ccStepSub}>설정 화면이 열려요{'\n'}저장공간 → 캐시 삭제 를 눌러 주세요</Text>
                </View>
              </View>
            ) : null}
            <Text style={styles.ccNote}>✓ 로그인, 글, 대화, me 폴더 사진은 그대로예요</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[styles.ccBtn, { backgroundColor: 'rgba(24,24,27,0.06)' }]} disabled={cacheBusy} onPress={() => setCacheOpen(false)}>
                <Text style={[styles.ccBtnText, { color: '#52525B' }]}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.ccBtn, { flex: 1.4, backgroundColor: '#3F3F46' }]} disabled={cacheBusy} onPress={runCacheClear}>
                {cacheBusy ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
                  <Text style={[styles.ccBtnText, { color: '#FFFFFF' }]}>{Platform.OS === 'android' ? '둘 다 비우기' : '비우기'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 항공권 검색 사이트 고르기 */}
      <Modal visible={!!flightPick} transparent animationType="slide" onRequestClose={() => setFlightPick(null)}>
        <TouchableOpacity style={styles.fsDim} activeOpacity={1} onPress={() => setFlightPick(null)}>
          {flightPick ? (
            <TouchableOpacity activeOpacity={1} style={styles.fsSheet} onPress={() => {}}>
              <View style={styles.fsHandle} />
              <Text style={styles.fsTitle}>{airportName(flightPick.from)} → {airportName(flightPick.to)} 왕복</Text>
              <Text style={styles.fsSub}>
                {(() => { const [a, b] = flightDates(flightPick.dep, flightPick.ret); return `${mdw(a)} ~ ${mdw(b)} · 성인 1명`; })()}
              </Text>
              <TouchableOpacity style={[styles.fsOpt, { backgroundColor: '#3F3F46' }]} activeOpacity={0.85} onPress={() => pickFlightSite('naver')}>
                <View style={[styles.fsOptIcon, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>N</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fsOptTitle, { color: '#FFFFFF' }]}>네이버 항공권</Text>
                  <Text style={[styles.fsOptSub, { color: '#D4D4D8' }]}>국내선 · 국내 항공사 가격 비교</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.fsOpt} activeOpacity={0.85} onPress={() => pickFlightSite('sky')}>
                <View style={styles.fsOptIcon}>
                  <Ionicons name="airplane-outline" size={15} color="#3F3F46" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fsOptTitle}>스카이스캐너</Text>
                  <Text style={styles.fsOptSub}>해외 항공사까지 넓게 비교</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#A1A1AA" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.fsCheckRow} activeOpacity={0.7} onPress={() => setFlightNaverCheck((v) => !v)}>
                <Ionicons name={flightNaverCheck ? 'checkbox' : 'square-outline'} size={18} color="#52525B" />
                <Text style={styles.fsCheckText}>다음부터 묻지 않고 네이버로 열기</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ) : null}
        </TouchableOpacity>
      </Modal>

      {/* 새 버전 알림 창 */}
      <Modal
        visible={!!updateInfo && updatePromptOpen}
        transparent
        animationType="fade"
        onRequestClose={() => { if (updateInfo && !updateInfo.force) setUpdatePromptOpen(false); }}
      >
        <View style={styles.updDim}>
          {updateInfo ? (
            <View style={styles.updCard}>
              <View style={styles.updIcon}>
                <Ionicons name="refresh" size={24} color="#3F3F46" />
              </View>
              <Text style={styles.updTitle}>새 버전이 나왔어요</Text>
              <Text style={styles.updSub}>지금 버전 {updateInfo.current} → 새 버전 {updateInfo.latest}</Text>
              {updateInfo.notes ? (
                <View style={styles.updNotes}>
                  {String(updateInfo.notes).split(/\n|,/).map((t) => t.trim()).filter(Boolean).map((t, i) => (
                    <Text key={i} style={styles.updNoteText}>· {t}</Text>
                  ))}
                </View>
              ) : null}
              <TouchableOpacity style={styles.updMainBtn} onPress={openStorePage}>
                <Text style={styles.updMainBtnText}>지금 업데이트</Text>
              </TouchableOpacity>
              {!updateInfo.force ? (
                <TouchableOpacity
                  style={{ paddingVertical: 10, alignItems: 'center' }}
                  onPress={() => {
                    setUpdatePromptOpen(false);
                    AsyncStorage.setItem(UPDATE_SKIP_KEY, String(updateInfo.latest)).catch(() => {});
                  }}
                >
                  <Text style={styles.updLater}>나중에</Text>
                </TouchableOpacity>
              ) : (
                <Text style={[styles.updLater, { marginTop: 10 }]}>이번 업데이트는 꼭 필요해요</Text>
              )}
            </View>
          ) : null}
        </View>
      </Modal>

    </View>
  );

  // ================= 새 홈 화면 =================
  const memberById = (id) => members.find((m) => m.id === id)
    || (id === session.user.id ? { id, nickname: profile.nickname, avatar_url: profile.avatar_url } : null);

  // ---- 공지 게시판 ----
  const openNoticeWrite = (notice) => {
    setEditingNotice(notice || null);
    setNoticeDraft(notice ? (notice.content || '') : '');
    setNoticeEditOpen(true);
  };
  const saveNotice = async () => {
    const content = (noticeDraft || '').trim();
    if (!content) { Alert.alert('확인', '공지 내용을 적어 주세요.'); return; }
    setHomeSaving(true);
    try {
      if (editingNotice) {
        const { error } = await supabase.from('home_notices')
          .update({ content, updated_at: new Date().toISOString() }).eq('id', editingNotice.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('home_notices').insert({ content, author_id: session.user.id });
        if (error) throw error;
      }
      setNoticeEditOpen(false);
      setEditingNotice(null);
      fetchHomeData();
    } catch (e) {
      Alert.alert('공지 저장 실패', e?.message || '잠시 후 다시 시도해 주세요.');
    } finally {
      setHomeSaving(false);
    }
  };
  const noticeActions = (n) => {
    if (n.author_id !== session.user.id && !isAdmin) return;
    Alert.alert('공지', '이 공지를 어떻게 할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => Alert.alert('공지 삭제', '이 공지를 지울까요? 되돌릴 수 없어요.', [
          { text: '취소', style: 'cancel' },
          {
            text: '삭제',
            style: 'destructive',
            onPress: async () => {
              const { error } = await supabase.from('home_notices').delete().eq('id', n.id);
              if (error) Alert.alert('삭제 실패', error.message);
              else fetchHomeData();
            },
          },
        ]),
      },
      { text: '수정', onPress: () => openNoticeWrite(n) },
    ]);
  };
  const noticeDateText = (iso) => {
    const d = new Date(iso);
    return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}. ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };

  // ---- 스케줄 ----
  const openScheduleAdd = () => {
    const d = new Date();
    setSchedDraft({ title: '', start: dayStart(d), end: null, timeSel: '종일', customTime: '', place: '', isMain: false });
    setSchedCalMonth({ y: d.getFullYear(), m: d.getMonth() });
    setSchedCalOpen(true);
    setScheduleModalOpen(true);
  };
  // 달력에서 날짜 누르기: 첫 번째 = 시작일, 두 번째 = 끝나는 날
  const pickSchedDay = (d) => {
    setSchedDraft((prev) => {
      if (!prev.start || prev.end) return { ...prev, start: d, end: null };
      if (dayNum(d) < dayNum(prev.start)) return { ...prev, start: d, end: null };
      if (dayNum(d) === dayNum(prev.start)) return { ...prev, end: null };
      return { ...prev, end: d };
    });
  };
  const schedDraftDateText = () => {
    const a = schedDraft.start;
    const b = schedDraft.end;
    if (!a) return '날짜 고르기';
    if (b && dayNum(b) > dayNum(a)) {
      const n = Math.round((b - a) / 86400000);
      return `${mdw(a)} ~ ${mdw(b)} · ${n}박${n + 1}일`;
    }
    return `${a.getFullYear()}. ${mdw(a)}`;
  };
  const saveSchedule = async () => {
    const title = schedDraft.title.trim();
    if (!title) { Alert.alert('확인', '일정 이름을 적어 주세요.'); return; }
    if (!schedDraft.start) { Alert.alert('확인', '달력에서 날짜를 골라 주세요.'); return; }
    let hh = 0;
    let mm = 0;
    const sel = SCHED_TIMES.find((x) => x[0] === schedDraft.timeSel);
    const allDay = !sel || sel[1] === null;
    if (!allDay) {
      const raw = sel[1] === 'custom' ? schedDraft.customTime.trim() : sel[1];
      const tm = String(raw || '').match(/^(\d{1,2}):(\d{2})$/);
      if (!tm || +tm[1] > 23 || +tm[2] > 59) { Alert.alert('확인', '시간을 18:30 처럼 적어 주세요.'); return; }
      hh = +tm[1];
      mm = +tm[2];
    }
    const a = schedDraft.start;
    const when = new Date(a.getFullYear(), a.getMonth(), a.getDate(), hh, mm);
    const b = schedDraft.end && dayNum(schedDraft.end) > dayNum(a) ? schedDraft.end : null;
    const endsAt = b ? new Date(b.getFullYear(), b.getMonth(), b.getDate(), 23, 59) : null;
    setHomeSaving(true);
    const { error } = await supabase.from('family_schedules').insert({
      title,
      place: schedDraft.place.trim() || null,
      starts_at: when.toISOString(),
      ends_at: endsAt ? endsAt.toISOString() : null,
      all_day: allDay,
      is_main: !!schedDraft.isMain,
      author_id: session.user.id,
    });
    setHomeSaving(false);
    if (error) { Alert.alert('일정 저장 실패', error.message); return; }
    setScheduleModalOpen(false);
    fetchHomeData();
  };
  const scheduleActions = (s) => {
    const who = memberById(s.author_id)?.nickname || '회원';
    const lines = `${schedWhenText(s)}${s.place ? `\n장소: ${s.place}` : ''}\n등록: ${who}`;
    if (s.author_id !== session.user.id && !isAdmin) {
      Alert.alert(s.title, lines);
      return;
    }
    Alert.alert(s.title, lines, [
      { text: '닫기', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('family_schedules').delete().eq('id', s.id);
          if (error) Alert.alert('삭제 실패', error.message);
          else fetchHomeData();
        },
      },
    ]);
  };

  // ---- 희망 여행지 ----
  const saveWish = async () => {
    const place = wishDraft.place.trim();
    if (!place) { Alert.alert('확인', '가고 싶은 곳을 적어 주세요.'); return; }
    setHomeSaving(true);
    const { error } = await supabase.from('travel_wishes').insert({
      place,
      memo: wishDraft.memo.trim() || null,
      user_id: session.user.id,
    });
    setHomeSaving(false);
    if (error) { Alert.alert('저장 실패', error.message); return; }
    setWishModalOpen(false);
    setWishDraft({ place: '', memo: '' });
    fetchHomeData();
  };
  const toggleWishLike = async (wish) => {
    const mine = wishLikes.some((l) => l.wish_id === wish.id && l.user_id === session.user.id);
    if (mine) {
      setWishLikes((prev) => prev.filter((l) => !(l.wish_id === wish.id && l.user_id === session.user.id)));
      await supabase.from('travel_wish_likes').delete().eq('wish_id', wish.id).eq('user_id', session.user.id);
    } else {
      setWishLikes((prev) => [...prev, { wish_id: wish.id, user_id: session.user.id }]);
      await supabase.from('travel_wish_likes').insert({ wish_id: wish.id, user_id: session.user.id });
    }
  };
  // ---- 추천 여행지 '가고 싶어요' / 희망 여행지로 담기 ----
  const toggleDestLike = async (city) => {
    const uid = session.user.id;
    const mine = destLikes.some((l) => l.city === city && l.user_id === uid);
    if (mine) {
      setDestLikes((prev) => prev.filter((l) => !(l.city === city && l.user_id === uid)));
      const { error } = await supabase.from('travel_dest_likes').delete().eq('city', city).eq('user_id', uid);
      if (error) fetchHomeData();
    } else {
      setDestLikes((prev) => [...prev, { city, user_id: uid }]);
      const { error } = await supabase.from('travel_dest_likes').insert({ city, user_id: uid });
      if (error) { Alert.alert('저장 실패', error.message); fetchHomeData(); }
    }
  };
  const addDestToWish = async (d) => {
    const uid = session.user.id;
    if (wishes.some((w) => w.user_id === uid && w.place === d.city)) {
      Alert.alert('희망 여행지', `${d.city}은(는) 이미 내 희망 여행지에 있어요.`);
      return;
    }
    const { error } = await supabase.from('travel_wishes').insert({ place: d.city, memo: d.title, user_id: uid });
    if (error) { Alert.alert('저장 실패', error.message); return; }
    Alert.alert('희망 여행지', `${d.city}을(를) 희망 여행지에 담았어요.`);
    fetchHomeData();
  };
  const shareDest = (d) => {
    const e = TRAVEL_ESSAYS[d.city];
    Share.share({ message: `[${d.city}] ${d.title}\n\n${e ? e.intro : d.body}\n\n— ${TRAVEL_SIGN} (me 앱)` }).catch(() => {});
  };
  // 사진 목록 (서버가 3장 넣어 줌. 예전 형식이면 1장)
  const destImages = (city) => {
    const r = travelPhotos[city];
    if (!r) return [];
    if (Array.isArray(r.images) && r.images.length) return r.images.filter((x) => x && x.url);
    return r.image_url ? [{ url: r.image_url, photographer: r.photographer, photographer_url: r.photographer_url, photo_page: r.photo_page }] : [];
  };
  const renderTravelDetail = () => {
    const d = travelDetail;
    if (!d) return null;
    const e = TRAVEL_ESSAYS[d.city] || { days: '', intro: d.body, sections: [], tips: [], outro: '' };
    const imgs = destImages(d.city);
    const W = getWindowWidth();
    const likeN = destLikes.filter((l) => l.city === d.city).length;
    const iLike = destLikes.some((l) => l.city === d.city && l.user_id === session.user.id);
    const credit = (img) => (img && img.photographer ? (
      <Text
        style={styles.tdCredit}
        onPress={() => { const u = img.photographer_url || img.photo_page; if (u) Linking.openURL(u).catch(() => {}); }}
      >
        사진: {img.photographer} / Unsplash
      </Text>
    ) : null);
    const photo = (img, h, extra) => (img ? (
      <Image source={{ uri: img.url }} style={[{ width: '100%', height: h, borderRadius: 12, backgroundColor: 'rgba(24,24,27,0.08)' }, extra]} resizeMode="cover" />
    ) : null);
    const sec = e.sections || [];
    return (
      <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
          {/* 맨 위 큰 사진 */}
          <View style={{ width: W, height: Math.round(W * 0.72), backgroundColor: 'rgba(24,24,27,0.12)', alignItems: 'center', justifyContent: 'center' }}>
            {imgs[0] ? (
              <Image source={{ uri: imgs[0].url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <Ionicons name="image-outline" size={34} color="#8E8E93" />
            )}
            <View style={styles.tdHeroShade}>
              <Text style={styles.tdHeroRegion}>{d.region} · {d.iata && TRAVEL_OVERSEAS.includes(d) ? '해외' : '국내'}</Text>
              <Text style={styles.tdHeroCity}>{d.city}</Text>
              <Text style={styles.tdHeroTitle}>{d.title}</Text>
            </View>
            <TouchableOpacity style={[styles.tdRoundBtn, { left: 12 }]} onPress={() => setTravelDetail(null)} hitSlop={8}>
              <Ionicons name="arrow-back" size={20} color="#18181B" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tdRoundBtn, { right: 12 }]} onPress={() => shareDest(d)} hitSlop={8}>
              <Ionicons name="share-social-outline" size={19} color="#18181B" />
            </TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: 16, alignItems: 'flex-end' }}>{credit(imgs[0])}</View>

          <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              {d.months && d.months.length ? (
                <View style={styles.tdChip}><Text style={styles.tdChipText}>추천 시기 {monthsText(d.months)}</Text></View>
              ) : null}
              {e.days ? <View style={styles.tdChip}><Text style={styles.tdChipText}>{e.days}</Text></View> : null}
              {d.flight ? <View style={styles.tdChip}><Text style={styles.tdChipText}>비행 {d.flight}</Text></View> : null}
              {isTravelSeason(d) ? <View style={[styles.tdChip, { backgroundColor: '#3F3F46' }]}><Text style={[styles.tdChipText, { color: '#FFFFFF' }]}>지금 딱</Text></View> : null}
            </View>

            <Text style={styles.tdBody}>{e.intro}</Text>

            {imgs[1] ? (
              <View style={{ marginBottom: 16 }}>
                {photo(imgs[1], Math.round((W - 40) * 0.62))}
                {credit(imgs[1])}
              </View>
            ) : null}

            {sec[0] ? (
              <>
                <Text style={styles.tdH}>{sec[0].h}</Text>
                <Text style={styles.tdBody}>{sec[0].p}</Text>
              </>
            ) : null}

            {imgs[2] ? (
              <View style={{ marginBottom: 16 }}>
                {photo(imgs[2], Math.round((W - 40) * 0.62))}
                {credit(imgs[2])}
              </View>
            ) : null}

            {sec.slice(1).map((x, i) => (
              <View key={i}>
                <Text style={styles.tdH}>{x.h}</Text>
                <Text style={styles.tdBody}>{x.p}</Text>
              </View>
            ))}

            {e.tips && e.tips.length ? (
              <View style={styles.tdTipBox}>
                <Text style={styles.tdTipTitle}><Ionicons name="bulb-outline" size={14} color="#18181B" /> 아놀드킹 팁</Text>
                {e.tips.map((t, i) => (
                  <Text key={i} style={styles.tdTipText}>· {t}</Text>
                ))}
              </View>
            ) : null}

            {/* 해외면 오늘 항공권 최저가 */}
            {d.iata && TRAVEL_OVERSEAS.includes(d) ? (
              <View style={styles.tdTipBox}>
                <Text style={styles.tdTipTitle}><Ionicons name="airplane-outline" size={14} color="#18181B" /> 항공권 최저가</Text>
                {renderFlightDateBar('detail')}
                {renderFlightRow('ICN', d, false)}
                {renderFlightRow('PUS', d, true)}
                <Text style={[styles.hMuted, { marginTop: 4 }]}>왕복 · 1인 · 참고용 가격 · 눌러서 확인</Text>
              </View>
            ) : null}

            {/* 제주면 김포·인천·김해 출발 최저가 */}
            {d.iata === 'CJU' ? (
              <View style={styles.tdTipBox}>
                <Text style={styles.tdTipTitle}><Ionicons name="airplane-outline" size={14} color="#18181B" /> 제주 항공권 최저가</Text>
                {renderFlightDateBar('detail')}
                {JEJU_ORIGINS.map((o, i) => renderFlightRow(o, d, i === JEJU_ORIGINS.length - 1))}
                <Text style={[styles.hMuted, { marginTop: 4 }]}>왕복 · 1인 · 참고용 가격 · 눌러서 확인</Text>
              </View>
            ) : null}

            {e.outro ? <Text style={styles.tdBody}>{e.outro}</Text> : null}
            <Text style={styles.tdSign}>— {TRAVEL_SIGN}</Text>
          </View>
        </ScrollView>

        <View style={styles.tdBottomBar}>
          <TouchableOpacity style={[styles.tdBottomBtn, iLike && { backgroundColor: 'rgba(24,24,27,0.16)' }]} onPress={() => toggleDestLike(d.city)}>
            <Ionicons name={iLike ? 'heart' : 'heart-outline'} size={16} color="#3F3F46" />
            <Text style={styles.tdBottomText}> 가고 싶어요 {likeN}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tdBottomBtn, { backgroundColor: '#3F3F46' }]} onPress={() => addDestToWish(d)}>
            <Ionicons name="location-outline" size={16} color="#FFFFFF" />
            <Text style={[styles.tdBottomText, { color: '#FFFFFF' }]}> 희망 여행지로 담기</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };
  const wishActions = (wish) => {
    if (wish.user_id !== session.user.id) return;
    Alert.alert(wish.place, '내가 남긴 희망 여행지를 지울까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('travel_wishes').delete().eq('id', wish.id);
          if (error) Alert.alert('삭제 실패', error.message);
          else fetchHomeData();
        },
      },
    ]);
  };

  const openFlightSearch = (from, iata, dep, ret) => {
    if (flightNaverAlways) { openUrlSafe(naverFlightUrl(from, iata, dep, ret)); return; }
    setFlightNaverCheck(false);
    setFlightPick({ from, to: iata, dep: dep || null, ret: ret || null });
  };
  const openCacheClear = async () => {
    setAccountMenuOpen(false);
    setCacheSize(null);
    setCacheOpen(true);
    const size = await cacheDirSize(FileSystem.cacheDirectory);
    setCacheSize(size);
  };
  const runCacheClear = async () => {
    if (cacheBusy) return;
    setCacheBusy(true);
    const before = cacheSize != null ? cacheSize : await cacheDirSize(FileSystem.cacheDirectory);
    await clearCacheDir();
    setCacheBusy(false);
    setCacheOpen(false);
    if (Platform.OS !== 'android') {
      Alert.alert('캐시 삭제', `me 캐시 ${fmtBytes(before)}를 비웠어요.`);
      return;
    }
    Alert.alert(
      'me 캐시를 비웠어요',
      `${fmtBytes(before)}를 지웠어요.\n\n이제 플레이스토어 차례예요.\n열리는 화면에서 '저장공간' → '캐시 삭제'를 눌러 주세요.\n('데이터 삭제'는 누르지 마세요)`,
      [
        { text: '나중에', style: 'cancel' },
        { text: '플레이스토어 열기', onPress: openPlayStoreSettings },
      ],
    );
  };
  const pickFlightSite = (site) => {
    const f = flightPick;
    if (!f) return;
    setFlightPick(null);
    if (site === 'naver') {
      if (flightNaverCheck) {
        setFlightNaverAlways(true);
        AsyncStorage.setItem(FLIGHT_NAVER_KEY, '1').catch(() => {});
      }
      openUrlSafe(naverFlightUrl(f.from, f.to, f.dep, f.ret));
    } else {
      openUrlSafe(skyscannerUrl(f.from, f.to, f.dep, f.ret));
    }
  };
  const airportName = (code) => {
    if (ORIGIN_KO[code]) return ORIGIN_KO[code];
    const t = [...TRAVEL_DOMESTIC, ...TRAVEL_OVERSEAS].find((d) => d.iata === code);
    return t ? t.city : code;
  };

  // ---- 항공권: 날짜 바 · 달력 · 가격 줄 ----
  const flightRangeText = (r) => {
    if (!r.start) return '날짜 고르기';
    if (!r.end) return `${mdw(r.start)} ~ 귀국일 고르기`;
    const n = Math.round((dayStart(r.end) - dayStart(r.start)) / 86400000);
    return `${mdw(r.start)} ~ ${mdw(r.end)} · ${n}박${n + 1}일`;
  };
  const openFlightCal = (where) => {
    if (flightCalWhere === where) { setFlightCalWhere(null); return; }
    const base = flightRange.start || new Date();
    setFlightDraft({ start: flightRange.start, end: flightRange.end });
    setFlightCalMonth({ y: base.getFullYear(), m: base.getMonth() });
    setFlightCalWhere(where);
  };
  const pickFlightDay = (d) => {
    setFlightDraft((prev) => {
      if (!prev.start || prev.end) return { start: d, end: null };
      if (dayNum(d) <= dayNum(prev.start)) return { start: d, end: null };
      return { start: prev.start, end: d };
    });
  };
  const applyFlightDates = () => {
    if (!flightDraft.start || !flightDraft.end) {
      Alert.alert('날짜', '출발일과 귀국일을 차례로 눌러 주세요.');
      return;
    }
    setFlightLiveErr('');
    setFlightRange({ start: flightDraft.start, end: flightDraft.end });
    setFlightCalWhere(null);
  };
  const resetFlightDates = () => {
    setFlightRange({ start: null, end: null });
    setFlightDraft({ start: null, end: null });
    setFlightLiveErr('');
    setFlightCalWhere(null);
  };
  const renderFlightDateBar = (where) => (
    <>
      <TouchableOpacity style={styles.fDateBar} activeOpacity={0.8} onPress={() => openFlightCal(where)}>
        <Ionicons name="calendar-outline" size={16} color="#3F3F46" />
        <Text style={styles.fDateText} numberOfLines={1}>
          {flightRange.start && flightRange.end ? flightRangeText(flightRange) : '가장 싼 날 (이번 달~다음 달)'}
        </Text>
        <Text style={styles.hMuted}>날짜 변경 ›</Text>
      </TouchableOpacity>
      {flightCalWhere === where ? renderFlightCalendar() : null}
      {flightLiveErr && flightRange.start ? <Text style={[styles.hMuted, { marginBottom: 6 }]}>{flightLiveErr}</Text> : null}
    </>
  );
  const renderFlightCalendar = () => {
    const { y, m } = flightCalMonth;
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const todayN = dayNum(new Date());
    const st = flightDraft.start ? dayNum(flightDraft.start) : null;
    const en = flightDraft.end ? dayNum(flightDraft.end) : null;
    const cells = [];
    for (let i = 0; i < first; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push(new Date(y, m, d));
    while (cells.length % 7) cells.push(null);
    const move = (k) => {
      let nm = m + k;
      let ny = y;
      if (nm < 0) { nm = 11; ny -= 1; }
      if (nm > 11) { nm = 0; ny += 1; }
      setFlightCalMonth({ y: ny, m: nm });
    };
    return (
      <View style={styles.hCal}>
        <View style={styles.hCalHead}>
          <TouchableOpacity onPress={() => move(-1)} hitSlop={10}><Ionicons name="chevron-back" size={18} color="#3F3F46" /></TouchableOpacity>
          <Text style={styles.hCalTitle}>{y}년 {m + 1}월</Text>
          <TouchableOpacity onPress={() => move(1)} hitSlop={10}><Ionicons name="chevron-forward" size={18} color="#3F3F46" /></TouchableOpacity>
        </View>
        <View style={styles.hCalRow}>
          {WEEK_KO.map((w) => <Text key={w} style={styles.hCalDow}>{w}</Text>)}
        </View>
        {Array.from({ length: cells.length / 7 }, (_, r) => (
          <View key={r} style={styles.hCalRow}>
            {cells.slice(r * 7, r * 7 + 7).map((d, i) => {
              if (!d) return <View key={i} style={styles.hCalCell} />;
              const k = dayNum(d);
              const past = k < todayN;
              const isEdge = k === st || k === en;
              const isIn = st && en && k > st && k < en;
              return (
                <TouchableOpacity
                  key={i}
                  disabled={past}
                  style={[styles.hCalCell, isIn && styles.hCalIn, isEdge && styles.hCalEdge, k === todayN && !isEdge && styles.hCalToday]}
                  onPress={() => pickFlightDay(d)}
                >
                  <Text style={[styles.hCalDay, past && { color: '#D4D4D8' }, isEdge && { color: '#FFFFFF', fontWeight: '700' }]}>{d.getDate()}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
        <Text style={[styles.hMuted, { marginTop: 6 }]}>
          {!flightDraft.start ? '출발일을 눌러요' : !flightDraft.end ? '귀국일을 눌러요' : flightRangeText(flightDraft)}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
          <TouchableOpacity style={[styles.fCalBtn, { backgroundColor: 'rgba(24,24,27,0.06)' }]} onPress={resetFlightDates}>
            <Text style={[styles.fCalBtnText, { color: '#52525B' }]}>가장 싼 날로</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.fCalBtn, { backgroundColor: 'rgba(24,24,27,0.78)' }]} onPress={applyFlightDates}>
            <Text style={[styles.fCalBtnText, { color: '#FFFFFF' }]}>이 날짜로 조회</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };
  // 가격 한 줄: 항공사 · 직항/경유 · 날짜 · 가격
  const renderFlightRow = (origin, d, last) => {
    const hasRange = !!(flightRange.start && flightRange.end);
    let info = null; // { price, airline, transfers, dep, ret }
    let state = 'ok'; // 'ok' | 'loading' | 'none'
    if (hasRange) {
      const live = flightLive[`${origin}-${d.iata}-${ymd(flightRange.start)}-${ymd(flightRange.end)}`];
      if (!live) state = flightLiveErr ? 'none' : 'loading';
      else if (live.none) state = 'none';
      else info = { price: live.price, airline: live.airline, transfers: live.transfers, dep: flightRange.start, ret: flightRange.end };
    } else {
      const fp = flightPrices.find((f) => f.origin === origin && f.destination === d.iata);
      if (fp && fp.price) info = { price: fp.price, airline: fp.airline, transfers: fp.transfers, dep: fromYmd(fp.depart_date), ret: fromYmd(fp.return_date) };
      else state = 'none';
    }
    const dep = info ? info.dep : hasRange ? flightRange.start : null;
    const ret = info ? info.ret : hasRange ? flightRange.end : null;
    const route = `${ORIGIN_KO[origin] ? ORIGIN_KO[origin] + ' ' : ''}${origin} → ${d.city} ${d.iata}`;
    const tr = info && typeof info.transfers === 'number' ? info.transfers : null;
    return (
      <TouchableOpacity
        key={`${origin}-${d.iata}`}
        style={[styles.fRow, last && { borderBottomWidth: 0 }]}
        activeOpacity={0.7}
        onPress={() => openFlightSearch(origin, d.iata, dep, ret)}
      >
        <View style={styles.fCodeBox}>
          {info && info.airline ? (
            <Text style={styles.fCodeText}>{info.airline}</Text>
          ) : state === 'loading' ? (
            <ActivityIndicator size="small" color="#A1A1AA" />
          ) : (
            <Ionicons name={info ? 'airplane-outline' : 'search'} size={15} color="#A1A1AA" />
          )}
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          {info ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.fAirline} numberOfLines={1}>{info.airline ? airlineName(info.airline) : '항공권'}</Text>
              {tr !== null ? (
                <View style={[styles.fTag, tr === 0 && { backgroundColor: '#52525B' }]}>
                  <Text style={[styles.fTagText, tr === 0 && { color: '#FFFFFF' }]}>{tr === 0 ? '직항' : `경유 ${tr}회`}</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <Text style={[styles.fAirline, { color: '#71717A' }]}>
              {state === 'loading' ? '가격 찾는 중…' : hasRange ? '이 날짜 가격 정보 없음' : '가격 정보 없음'}
            </Text>
          )}
          <Text style={styles.fSub} numberOfLines={1}>
            {route}{!hasRange && dep && ret ? ` · ${mdw(dep)}~${mdw(ret)}` : ''}
          </Text>
        </View>
        {info ? (
          <View style={styles.hPricePill}>
            <Text style={styles.hPriceText}>{Number(info.price).toLocaleString('ko-KR')}원~</Text>
          </View>
        ) : state === 'none' ? (
          <View style={styles.fSearchBtn}><Text style={styles.fSearchText}>네이버에서 보기 ›</Text></View>
        ) : null}
      </TouchableOpacity>
    );
  };

  // 일정 추가 창의 작은 달력
  const renderSchedCalendar = () => {
    const { y, m } = schedCalMonth;
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const todayN = dayNum(new Date());
    const st = schedDraft.start ? dayNum(schedDraft.start) : null;
    const en = schedDraft.end ? dayNum(schedDraft.end) : null;
    const cells = [];
    for (let i = 0; i < first; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push(new Date(y, m, d));
    while (cells.length % 7) cells.push(null);
    const move = (k) => {
      let nm = m + k;
      let ny = y;
      if (nm < 0) { nm = 11; ny -= 1; }
      if (nm > 11) { nm = 0; ny += 1; }
      setSchedCalMonth({ y: ny, m: nm });
    };
    return (
      <View style={styles.hCal}>
        <View style={styles.hCalHead}>
          <TouchableOpacity onPress={() => move(-1)} hitSlop={10}><Ionicons name="chevron-back" size={18} color="#3F3F46" /></TouchableOpacity>
          <Text style={styles.hCalTitle}>{y}년 {m + 1}월</Text>
          <TouchableOpacity onPress={() => move(1)} hitSlop={10}><Ionicons name="chevron-forward" size={18} color="#3F3F46" /></TouchableOpacity>
        </View>
        <View style={styles.hCalRow}>
          {WEEK_KO.map((w) => <Text key={w} style={styles.hCalDow}>{w}</Text>)}
        </View>
        {Array.from({ length: cells.length / 7 }, (_, r) => (
          <View key={r} style={styles.hCalRow}>
            {cells.slice(r * 7, r * 7 + 7).map((d, i) => {
              if (!d) return <View key={i} style={styles.hCalCell} />;
              const k = dayNum(d);
              const isEdge = k === st || k === en;
              const isIn = st && en && k > st && k < en;
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.hCalCell, isIn && styles.hCalIn, isEdge && styles.hCalEdge, k === todayN && !isEdge && styles.hCalToday]}
                  onPress={() => pickSchedDay(d)}
                >
                  <Text style={[styles.hCalDay, isEdge && { color: '#FFFFFF', fontWeight: '700' }]}>{d.getDate()}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
        <View style={styles.hCalFoot}>
          <Text style={styles.hMuted}>
            {!schedDraft.start ? '시작하는 날을 눌러요' : !schedDraft.end ? '끝나는 날을 눌러요 (하루면 확인)' : '다시 누르면 새로 골라요'}
          </Text>
          <TouchableOpacity style={styles.hCalOk} onPress={() => setSchedCalOpen(false)}>
            <Text style={styles.hCalOkText}>확인</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderHomeDashboard = () => {
    const today = new Date();
    const dayKey = dayKeyNum();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();

    // 오늘의 주인공: 사진 있는 게시물 중 날마다 하나 (날짜가 바뀌면 자동으로 바뀜)
    const motdPool = visiblePosts.filter((p) => p.image_urls && p.image_urls.length > 0);
    const motd = motdPool.length ? seededPick(motdPool, 1, dayKey + memberOfDayShuffle * 7)[0] : null;
    const motdAuthor = motd ? (motd.profiles?.nickname || memberById(motd.author_id)?.nickname || '회원') : '';
    const motdAvatar = motd ? (motd.profiles?.avatar_url || memberById(motd.author_id)?.avatar_url || null) : null;
    // 회원 최근 글 3개 (최신 순)
    const recentPosts = [...visiblePosts]
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, 3);
    const agoText = (t) => {
      const diff = Math.max(0, Date.now() - Date.parse(t));
      const min = Math.floor(diff / 60000);
      if (min < 1) return '방금';
      if (min < 60) return `${min}분 전`;
      const hr = Math.floor(min / 60);
      if (hr < 24) return `${hr}시간 전`;
      const day = Math.floor(hr / 24);
      if (day === 1) return '어제';
      if (day < 7) return `${day}일 전`;
      const d = new Date(t);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    };

    // 스케줄: 메인(별표 우선, 없으면 가장 가까운 일정) + 서브 3개 + 이번 주
    // 아직 안 끝난 일정 (여러 날 일정은 끝나는 날까지)
    const upcoming = schedules.filter((s) => Date.parse(s.ends_at || s.starts_at) >= startOfToday);
    const mainSch = upcoming.find((s) => s.is_main) || upcoming[0] || null;
    const subSch = upcoming.filter((s) => !mainSch || s.id !== mainSch.id).slice(0, 3);
    const dDayOf = (s) => {
      const d = new Date(s.starts_at);
      const diff = Math.round((dayStart(d).getTime() - startOfToday) / 86400000);
      if (diff < 0) return '진행 중';
      return diff === 0 ? 'D-DAY' : `D-${diff}`;
    };
    const monOffset = (today.getDay() + 6) % 7;
    const weekDays = Array.from({ length: 7 }, (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - monOffset + i));
    const hasSchOn = (d) => schedules.some((s) => {
      const a = dayNum(new Date(s.starts_at));
      const b = s.ends_at ? dayNum(new Date(s.ends_at)) : a;
      const k = dayNum(d);
      return k >= a && k <= b;
    });

    // 추천 여행지 2곳 (매일 바뀜) + 같은 곳 항공권
    const travelList = travelGroup === 'dom' ? TRAVEL_DOMESTIC : TRAVEL_OVERSEAS;
    const dests = weightedDailyPick(travelList, 2, dayKey + travelShuffle * 13 + (travelGroup === 'dom' ? 0 : 7));

    // 희망 여행지: 하루 안에 새로 등록된 게 있으면 그것, 아니면 날마다 하나
    const likeCount = (id) => wishLikes.filter((l) => l.wish_id === id).length;
    const newest = wishes[0];
    const isNewWish = !!(newest && Date.now() - Date.parse(newest.created_at) < 86400000);
    const wish = isNewWish ? newest : (wishes.length ? seededPick(wishes, 1, dayKey + 3)[0] : null);
    const wishOwner = wish ? (memberById(wish.user_id)?.nickname || '회원') : '';
    const wishOwnerAvatar = wish ? memberById(wish.user_id)?.avatar_url : null;
    const iLikeWish = wish ? wishLikes.some((l) => l.wish_id === wish.id && l.user_id === session.user.id) : false;

    return (
      <>
        <ScrollView
          style={{ flex: 1, backgroundColor: bgc('#FFFFFF') }}
          contentContainerStyle={{ paddingTop: 10, paddingBottom: 30 }}
          showsVerticalScrollIndicator={false}
        >
          {/* 공지 (78%) */}
          {/* 공지: 누르면 지금까지 올린 공지 게시판 */}
          {homeNotice ? (
            <TouchableOpacity
              style={styles.hNotice}
              activeOpacity={0.85}
              onPress={() => { setOpenNoticeId(homeNotice.id); setNoticeBoardOpen(true); }}
            >
              <Ionicons name="megaphone-outline" size={16} color="#FFFFFF" />
              <Text style={styles.hNoticeText} numberOfLines={1}>{homeNotice.content}</Text>
              <Ionicons name="chevron-forward" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.hNoticeEmpty} onPress={() => openNoticeWrite(null)}>
              <Ionicons name="megaphone-outline" size={15} color="#71717A" />
              <Text style={styles.hNoticeEmptyText}>공지 등록하기</Text>
            </TouchableOpacity>
          )}

          {/* 오늘의 주인공 (왼쪽) + 회원 최근 글 (오른쪽) */}
          <View style={[styles.hSec, { backgroundColor: 'rgba(24,24,27,0.03)', borderWidth: 1, borderColor: 'rgba(24,24,27,0.06)', flexDirection: 'row' }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.hSecTitle, { marginBottom: 8 }]}><Ionicons name="trophy-outline" size={14} color="#3F3F46" /> 오늘의 주인공</Text>
              {motd ? (
                <TouchableOpacity activeOpacity={0.8} onPress={() => openPostView(motd, 0)}>
                  <Image source={{ uri: motd.image_urls[0] }} style={styles.hMotdBig} resizeMode="cover" />
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                    {motdAvatar ? (
                      <Image source={{ uri: motdAvatar }} style={styles.hMiniAvatar} />
                    ) : (
                      <View style={[styles.hMiniAvatar, { alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="person" size={11} color="#A1A1AA" />
                      </View>
                    )}
                    <Text style={styles.hMotdName} numberOfLines={1}>{motdAuthor}</Text>
                  </View>
                  <Text style={styles.hRecentText} numberOfLines={1}>{motd.content || '사진 게시물'}</Text>
                  <Text style={styles.hRecentTime}>
                    {new Date(motd.created_at).toLocaleDateString('ko-KR')} · 하트 {(motd.reactions || []).length}
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.hMuted}>아직 사진 게시물이 없어요.</Text>
              )}
            </View>

            <View style={styles.hRecentCol}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text style={styles.hSecTitle}><Ionicons name="time-outline" size={14} color="#3F3F46" /> 최근 글</Text>
                <TouchableOpacity onPress={() => { setPostsMemberId(null); fetchPosts(); setMainTab('posts'); }} hitSlop={8}>
                  <Text style={styles.hSecAction}>더보기 ›</Text>
                </TouchableOpacity>
              </View>
              {recentPosts.length ? recentPosts.map((rp, i) => {
                const who = rp.profiles?.nickname || memberById(rp.author_id)?.nickname || '회원';
                const av = rp.profiles?.avatar_url || memberById(rp.author_id)?.avatar_url || null;
                const thumb = rp.image_urls && rp.image_urls.length ? rp.image_urls[0] : null;
                return (
                  <TouchableOpacity
                    key={rp.id}
                    style={[styles.hRecentRow, i === recentPosts.length - 1 && { borderBottomWidth: 0 }]}
                    activeOpacity={0.7}
                    onPress={() => openPostView(rp, 0)}
                  >
                    {av ? (
                      <Image source={{ uri: av }} style={styles.hRecentAvatar} />
                    ) : (
                      <View style={[styles.hRecentAvatar, { alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="person" size={11} color="#A1A1AA" />
                      </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0, marginLeft: 6 }}>
                      <Text style={styles.hRecentWho} numberOfLines={1}>
                        {who} <Text style={styles.hRecentTime}>· {agoText(rp.created_at)}</Text>
                      </Text>
                      <Text style={styles.hRecentText} numberOfLines={1}>{rp.content || '사진 게시물'}</Text>
                    </View>
                    {thumb ? <Image source={{ uri: thumb }} style={styles.hRecentThumb} /> : null}
                  </TouchableOpacity>
                );
              }) : (
                <Text style={styles.hMuted}>아직 올라온 글이 없어요.</Text>
              )}
            </View>
          </View>

          {/* 예정된 스케줄 (5%) */}
          <View style={[styles.hSec, { backgroundColor: 'rgba(24,24,27,0.05)' }]}>
            <View style={styles.hSecHead}>
              <Text style={styles.hSecTitle}>예정된 스케줄</Text>
              <TouchableOpacity onPress={openScheduleAdd} hitSlop={8}>
                <Text style={styles.hSecAction}>+ 일정 추가</Text>
              </TouchableOpacity>
            </View>
            {mainSch ? (
              <TouchableOpacity style={styles.hMainSch} activeOpacity={0.85} onPress={() => scheduleActions(mainSch)}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={styles.hMainTag}>
                    <Text style={styles.hMainTagText}>메인 · {dDayOf(mainSch)}</Text>
                  </View>
                  <Text style={styles.hMainWhen}>{schedWhenText(mainSch)}</Text>
                </View>
                <Text style={styles.hMainTitle} numberOfLines={1}>
                  {mainSch.title}{mainSch.place ? ` · ${mainSch.place}` : ''}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={[styles.hMuted, { marginBottom: 6 }]}>예정된 일정이 없어요. + 일정 추가를 눌러 보세요.</Text>
            )}
            {subSch.map((s) => (
              <TouchableOpacity key={s.id} style={styles.hSubSch} activeOpacity={0.8} onPress={() => scheduleActions(s)}>
                <Text style={styles.hSubText} numberOfLines={1}>서브 · {s.title}</Text>
                <Text style={styles.hSubWhen}>{schedWhenText(s)}</Text>
              </TouchableOpacity>
            ))}
            <View style={styles.hWeekRow}>
              {weekDays.map((d) => {
                const isToday = d.getTime() === startOfToday;
                return (
                  <View key={d.getTime()} style={[styles.hWeekCell, isToday && styles.hWeekCellOn]}>
                    <Text style={[styles.hWeekDow, isToday && { color: '#FFFFFF' }]}>{WEEK_KO[d.getDay()]}</Text>
                    <Text style={[styles.hWeekDate, isToday && { color: '#FFFFFF' }]}>{d.getDate()}</Text>
                    <Text style={[styles.hWeekDot, isToday && { color: '#FFFFFF' }]}>{hasSchOn(d) ? '●' : ' '}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* 추천 여행지 (4%): 국내/해외 탭 + 매일 2곳 */}
          <View style={[styles.hSec, { backgroundColor: 'rgba(24,24,27,0.04)' }]}>
            <View style={styles.hSecHead}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.hSecTitle}>추천 여행지</Text>
                <View style={styles.hSegWrap}>
                  {[['dom', '국내'], ['ovs', '해외']].map(([key, label]) => (
                    <TouchableOpacity
                      key={key}
                      style={[styles.hSeg, travelGroup === key && styles.hSegOn]}
                      onPress={() => { setTravelGroup(key); setTravelOpenCity(null); }}
                    >
                      <Text style={[styles.hSegText, travelGroup === key && { color: '#FFFFFF' }]}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <TouchableOpacity onPress={() => { setTravelShuffle(travelShuffle + 1); setTravelOpenCity(null); }} hitSlop={8}>
                <Text style={styles.hSecAction}><Ionicons name="refresh" size={11} color="#A1A1AA" /> 다른 곳</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {dests.map((d) => (
                <TouchableOpacity
                  key={d.city}
                  style={{ flex: 1 }}
                  activeOpacity={0.8}
                  onPress={() => setTravelDetail(d)}
                >
                  <View style={styles.hDestBox}>
                    {travelPhotos[d.city] && travelPhotos[d.city].image_url ? (
                      <Image source={{ uri: travelPhotos[d.city].image_url }} style={styles.hDestImg} resizeMode="cover" />
                    ) : (
                      <Ionicons name="image-outline" size={20} color="#71717A" />
                    )}
                    <View style={styles.hDestRegion}><Text style={styles.hDestRegionText}>{d.region}</Text></View>
                    {isTravelSeason(d) ? (
                      <View style={styles.hDestBest}><Text style={styles.hDestBestText}>지금 딱</Text></View>
                    ) : null}
                  </View>
                  <Text style={styles.hDestCity}>{d.city}</Text>
                  <Text style={styles.hDestTitle} numberOfLines={1}>{d.title}</Text>
                  {travelPhotos[d.city] && travelPhotos[d.city].photographer ? (
                    <Text
                      style={styles.hPhotoCredit}
                      numberOfLines={1}
                      onPress={() => {
                        const u = travelPhotos[d.city].photographer_url || travelPhotos[d.city].photo_page;
                        if (u) Linking.openURL(u).catch(() => {});
                      }}
                    >
                      사진: {travelPhotos[d.city].photographer} / Unsplash
                    </Text>
                  ) : null}
                  {d.flight ? (
                    <Text style={styles.hMuted} numberOfLines={1}><Ionicons name="airplane-outline" size={10} color="#A1A1AA" /> {d.flight}</Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 추천 여행지 항공권 최저가 (5%): 해외 탭 */}
          {travelGroup === 'ovs' ? (
            <View style={[styles.hSec, { backgroundColor: 'rgba(24,24,27,0.05)' }]}>
              <View style={styles.hSecHead}>
                <Text style={styles.hSecTitle}>추천 여행지 항공권 최저가</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
                {[['ICN', '인천 ICN'], ['PUS', '김해 PUS']].map(([code, label]) => (
                  <TouchableOpacity
                    key={code}
                    style={[styles.hChip, flightFrom === code && styles.hChipOn]}
                    onPress={() => setFlightFrom(code)}
                  >
                    <Text style={[styles.hChipText, flightFrom === code && { color: '#FFFFFF' }]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {renderFlightDateBar('home')}
              {dests.map((d, i) => renderFlightRow(flightFrom, d, i === dests.length - 1))}
              <Text style={[styles.hMuted, { marginTop: 6 }]}>
                왕복 · 1인 · 참고용 가격 · 정확한 가격은 눌러서 확인
              </Text>
            </View>
          ) : null}

          {/* 국내 탭: 제주 항공권 최저가 (김포 · 인천 · 김해 출발) */}
          {travelGroup === 'dom' && JEJU_DEST ? (
            <View style={[styles.hSec, { backgroundColor: 'rgba(24,24,27,0.05)' }]}>
              <View style={styles.hSecHead}>
                <Text style={styles.hSecTitle}>제주 항공권 최저가</Text>
              </View>
              <Text style={[styles.hMuted, { marginBottom: 6 }]}>국내 탭에서는 제주행만 보여줘요</Text>
              {renderFlightDateBar('home')}
              {JEJU_ORIGINS.map((o, i) => renderFlightRow(o, JEJU_DEST, i === JEJU_ORIGINS.length - 1))}
              <Text style={[styles.hMuted, { marginTop: 6 }]}>
                왕복 · 1인 · 참고용 가격 · 정확한 가격은 눌러서 확인
              </Text>
            </View>
          ) : null}

          {/* 회원 희망 여행지 (6%) */}
          <View style={[styles.hSec, { backgroundColor: 'rgba(24,24,27,0.06)' }]}>
            <View style={styles.hSecHead}>
              <Text style={styles.hSecTitle}>회원 희망 여행지</Text>
              {wish ? (
                isNewWish ? (
                  <View style={styles.hNewTag}><Text style={styles.hNewTagText}>NEW</Text></View>
                ) : (
                  <Text style={styles.hSecAction}>오늘의 추천 · 매일 바뀜</Text>
                )
              ) : null}
            </View>
            {wish ? (
              <>
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center' }} activeOpacity={0.9} onLongPress={() => wishActions(wish)}>
                  {wishOwnerAvatar ? (
                    <Image source={{ uri: wishOwnerAvatar }} style={styles.hWishAvatar} />
                  ) : (
                    <View style={[styles.hWishAvatar, { alignItems: 'center', justifyContent: 'center' }]}>
                      <Ionicons name="person" size={18} color="#A1A1AA" />
                    </View>
                  )}
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.hWishWho} numberOfLines={1}>
                      {wishOwner}님이 {isNewWish ? '방금 등록했어요' : '가고 싶은 곳'}
                    </Text>
                    <Text style={styles.hWishPlace} numberOfLines={1}>
                      <Ionicons name="location-outline" size={15} color="#18181B" /> {wish.place}
                    </Text>
                    {wish.memo ? <Text style={styles.hMotdText} numberOfLines={2}>"{wish.memo}"</Text> : null}
                  </View>
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
                  <TouchableOpacity style={[styles.hWishBtn, iLikeWish && { backgroundColor: 'rgba(24,24,27,0.18)' }]} onPress={() => toggleWishLike(wish)}>
                    <Text style={styles.hWishBtnText}>나도 가고 싶어요 {likeCount(wish.id)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.hWishBtn, styles.hWishBtnDark]} onPress={() => setWishModalOpen(true)}>
                    <Text style={[styles.hWishBtnText, { color: '#FFFFFF' }]}>내 희망 여행지 등록</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                <Ionicons name="airplane-outline" size={26} color="#A1A1AA" />
                <Text style={styles.hWishAsk}>{profile.nickname || '회원'}님, 어디를 가고 싶나요?</Text>
                <Text style={styles.hMuted}>가고 싶은 곳을 남기면 가족 홈에 소개돼요</Text>
                <TouchableOpacity style={[styles.hWishBtn, styles.hWishBtnDark, { marginTop: 10, flex: 0, paddingHorizontal: 16 }]} onPress={() => setWishModalOpen(true)}>
                  <Text style={[styles.hWishBtnText, { color: '#FFFFFF' }]}>+ 희망 여행지 남기기</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* 맨 아래: 저작권 · 앱 버전 · 출처 */}
          <View style={styles.appFooter}>
            <Text style={styles.appFooterLogo}>me</Text>
            <Text style={styles.appFooterText}>© 2026 anoldking. All rights reserved.</Text>
            {currentVersionCode() ? (
              updateInfo ? (
                <Text style={styles.appFooterText}>
                  버전 {currentVersionCode()} ({Constants?.expoConfig?.version || '1.0.0'}) ·{' '}
                  <Text style={styles.appFooterLink} onPress={openStorePage}>새 버전 {updateInfo.latest} 업데이트 ›</Text>
                </Text>
              ) : (
                <Text style={styles.appFooterText}>
                  버전 {currentVersionCode()} ({Constants?.expoConfig?.version || '1.0.0'}) · 최신 버전이에요
                </Text>
              )
            ) : (
              <Text style={styles.appFooterText}>버전 {Constants?.expoConfig?.version || '1.0.0'} (테스트)</Text>
            )}
            <Text style={styles.appFooterCredit}>사진 Unsplash · 항공권 정보 Travelpayouts</Text>
          </View>
        </ScrollView>

        {/* 추천 여행지 전체 화면 글 */}
        <Modal visible={!!travelDetail} animationType="slide" onRequestClose={() => setTravelDetail(null)}>
          {renderTravelDetail()}
        </Modal>

        {/* 공지 게시판: 지금까지 올린 공지 (최신 순) */}
        <Modal visible={noticeBoardOpen} animationType="slide" onRequestClose={() => setNoticeBoardOpen(false)}>
          <View style={[styles.hBoardWrap, { backgroundColor: bgc('#FFFFFF') }]}>
            <View style={styles.hBoardHead}>
              <TouchableOpacity onPress={() => setNoticeBoardOpen(false)} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="arrow-back" size={22} color="#18181B" />
                <Text style={styles.hBoardTitle}>공지</Text>
                <Text style={styles.hBoardCount}>{homeNotices.length}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.hBoardWrite} onPress={() => openNoticeWrite(null)}>
                <Ionicons name="create-outline" size={15} color="#3F3F46" />
                <Text style={styles.hBoardWriteText}>쓰기</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={homeNotices}
              keyExtractor={(n) => String(n.id)}
              contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
              ListEmptyComponent={
                <Text style={[styles.hMuted, { textAlign: 'center', marginTop: 40 }]}>아직 올린 공지가 없어요. 오른쪽 위 쓰기를 눌러 보세요.</Text>
              }
              renderItem={({ item, index }) => {
                const opened = openNoticeId === item.id;
                const who = memberById(item.author_id)?.nickname || '회원';
                const edited = item.updated_at && Date.parse(item.updated_at) - Date.parse(item.created_at) > 60000;
                return (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={[styles.hBoardRow, index === 0 && styles.hBoardRowNew]}
                    onPress={() => setOpenNoticeId(opened ? null : item.id)}
                    onLongPress={() => noticeActions(item)}
                    delayLongPress={400}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                      {index === 0 ? (
                        <View style={styles.hNewTag}><Text style={styles.hNewTagText}>최신</Text></View>
                      ) : null}
                      <Text style={[styles.hMuted, index === 0 && { marginLeft: 6 }]}>
                        {who} · {noticeDateText(item.created_at)}{edited ? ' · 수정됨' : ''}
                      </Text>
                    </View>
                    <Text style={styles.hBoardText} numberOfLines={opened ? 0 : 1}>{item.content}</Text>
                  </TouchableOpacity>
                );
              }}
            />
            <Text style={[styles.hMuted, { textAlign: 'center', paddingBottom: 16 }]}>누르면 펼쳐져요 · 내가 쓴 공지는 길게 눌러 수정/삭제</Text>
          </View>
        </Modal>

        {/* 공지 쓰기/수정 (회원 누구나) */}
        <Modal visible={noticeEditOpen} transparent animationType="fade" onRequestClose={() => setNoticeEditOpen(false)}>
          <KeyboardAvoidingView style={styles.hModalBackdrop} behavior="padding">
            <View style={styles.hModalCard}>
              <Text style={styles.hModalTitle}>{editingNotice ? '공지 수정' : '새 공지'}</Text>
              <TextInput
                style={[styles.hInput, { minHeight: 110, textAlignVertical: 'top' }]}
                value={noticeDraft}
                onChangeText={setNoticeDraft}
                placeholder="가족에게 알릴 내용을 적어 주세요"
                placeholderTextColor="#A1A1AA"
                multiline
              />
              <View style={styles.hModalBtns}>
                <TouchableOpacity style={styles.hBtnLight} onPress={() => { setNoticeEditOpen(false); setEditingNotice(null); }}>
                  <Text style={styles.hBtnLightText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.hBtnDark} onPress={saveNotice} disabled={homeSaving}>
                  <Text style={styles.hBtnDarkText}>{editingNotice ? '수정' : '올리기'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* 일정 추가 */}
        <Modal visible={scheduleModalOpen} transparent animationType="fade" onRequestClose={() => setScheduleModalOpen(false)}>
          <KeyboardAvoidingView style={styles.hModalBackdrop} behavior="padding">
            <View style={[styles.hModalCard, { maxHeight: '92%' }]}>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.hModalTitle}>일정 추가</Text>
              <TextInput style={styles.hInput} value={schedDraft.title} onChangeText={(v) => setSchedDraft({ ...schedDraft, title: v })} placeholder="일정 이름 (예: 가족 모임)" placeholderTextColor="#A1A1AA" />
              {/* 날짜: 누르면 작은 달력이 펼쳐짐 */}
              <TouchableOpacity style={styles.hDateBtn} onPress={() => setSchedCalOpen(!schedCalOpen)} activeOpacity={0.8}>
                <Ionicons name="calendar-outline" size={17} color="#52525B" />
                <Text style={[styles.hDateBtnText, !schedDraft.start && { color: '#A1A1AA' }]}>{schedDraftDateText()}</Text>
                <Ionicons name={schedCalOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#A1A1AA" />
              </TouchableOpacity>
              {schedCalOpen ? renderSchedCalendar() : null}
              {/* 시간: 버튼으로 고르기 */}
              <Text style={styles.hFieldLabel}>시간 (선택)</Text>
              <View style={styles.hTimeRow}>
                {SCHED_TIMES.map(([label]) => (
                  <TouchableOpacity
                    key={label}
                    style={[styles.hTimeChip, schedDraft.timeSel === label && styles.hTimeChipOn]}
                    onPress={() => setSchedDraft({ ...schedDraft, timeSel: label })}
                  >
                    <Text style={[styles.hTimeChipText, schedDraft.timeSel === label && { color: '#FFFFFF' }]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {schedDraft.timeSel === '직접 입력' ? (
                <TextInput
                  style={styles.hInput}
                  value={schedDraft.customTime}
                  onChangeText={(v) => setSchedDraft({ ...schedDraft, customTime: v })}
                  placeholder="18:30"
                  placeholderTextColor="#A1A1AA"
                  keyboardType="numbers-and-punctuation"
                />
              ) : null}
              <TextInput style={styles.hInput} value={schedDraft.place} onChangeText={(v) => setSchedDraft({ ...schedDraft, place: v })} placeholder="장소 (선택)" placeholderTextColor="#A1A1AA" />
              <TouchableOpacity style={styles.hMainToggle} onPress={() => setSchedDraft({ ...schedDraft, isMain: !schedDraft.isMain })}>
                <Ionicons name={schedDraft.isMain ? 'star' : 'star-outline'} size={18} color="#3F3F46" />
                <Text style={styles.hBtnLightText}>메인 일정으로 크게 보이기</Text>
              </TouchableOpacity>
              <View style={styles.hModalBtns}>
                <TouchableOpacity style={styles.hBtnLight} onPress={() => setScheduleModalOpen(false)}>
                  <Text style={styles.hBtnLightText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.hBtnDark} onPress={saveSchedule} disabled={homeSaving}>
                  <Text style={styles.hBtnDarkText}>저장</Text>
                </TouchableOpacity>
              </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* 희망 여행지 등록 */}
        <Modal visible={wishModalOpen} transparent animationType="fade" onRequestClose={() => setWishModalOpen(false)}>
          <KeyboardAvoidingView style={styles.hModalBackdrop} behavior="padding">
            <View style={styles.hModalCard}>
              <Text style={styles.hModalTitle}>희망 여행지 남기기</Text>
              <TextInput style={styles.hInput} value={wishDraft.place} onChangeText={(v) => setWishDraft({ ...wishDraft, place: v })} placeholder="가고 싶은 곳 (예: 스위스 인터라켄)" placeholderTextColor="#A1A1AA" />
              <TextInput style={styles.hInput} value={wishDraft.memo} onChangeText={(v) => setWishDraft({ ...wishDraft, memo: v })} placeholder="한마디 (선택)" placeholderTextColor="#A1A1AA" />
              <View style={styles.hModalBtns}>
                <TouchableOpacity style={styles.hBtnLight} onPress={() => setWishModalOpen(false)}>
                  <Text style={styles.hBtnLightText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.hBtnDark} onPress={saveWish} disabled={homeSaving}>
                  <Text style={styles.hBtnDarkText}>남기기</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </>
    );
  };

  // ================= 음악 저장소 · 노래 듣기 =================
  const isKoTitle = (s) => /^[가-힣ㄱ-ㅎ]/.test(String(s || '').trim());
  // 가나다순 (한글 제목 먼저, 그다음 영어·숫자 제목 ABC순)
  const musicSorted = [...bgmLibItems].sort((a, b) => {
    const ka = isKoTitle(a.title);
    const kb = isKoTitle(b.title);
    if (ka !== kb) return ka ? -1 : 1;
    return String(a.title).localeCompare(String(b.title), 'ko');
  });
  const musicTrackOf = (it) => ({ url: it.url, title: it.artist ? `${it.artist} - ${it.title}` : it.title, ownerId: null, ownerLabel: '음악 저장소' });
  const musicPlayList = (items, startIdx = 0) => {
    if (!items || !items.length) return;
    musicQueueRef.current = items.map(musicTrackOf);
    bgmUnmute();
    bgmPlay(musicQueueRef.current[Math.max(0, Math.min(startIdx, items.length - 1))]);
  };
  const musicStep = (dir) => {
    const q = musicQueueRef.current && musicQueueRef.current.length ? musicQueueRef.current : musicSorted.map(musicTrackOf);
    if (!q.length) return;
    if (!musicQueueRef.current.length) musicQueueRef.current = q;
    const i = bgmTrack ? q.findIndex((x) => x.url === bgmTrack.url) : -1;
    const ni = i < 0 ? 0 : (i + dir + q.length) % q.length;
    bgmUnmute();
    bgmPlay(q[ni]);
  };

  // ---- 음악 올리기 ----
  const MUSIC_MAX = 50 * 1024 * 1024;
  const pickMusicToUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
      if (result.canceled || !result.assets || !result.assets[0]) return;
      const a = result.assets[0];
      const name = a.name || 'song.mp3';
      const ext = ((name.match(/\.([a-zA-Z0-9]+)$/) || [])[1] || 'mp3').toLowerCase();
      if (!['mp3', 'm4a', 'wav', 'aac', 'ogg'].includes(ext)) {
        showAlert('올릴 수 없는 파일', 'mp3, m4a, wav, aac, ogg 파일만 올릴 수 있어요.');
        return;
      }
      if (a.size && a.size > MUSIC_MAX) {
        showAlert('파일이 너무 커요', '50MB 이하의 음악 파일을 골라 주세요.');
        return;
      }
      // 파일 이름 '가수 - 제목' 이면 나눠서 미리 채움
      const base = name.replace(/\.[^.]+$/, '').trim();
      const parts = base.split(/\s+-\s+/);
      const guessArtist = parts.length > 1 ? parts[0].trim() : '';
      const guessTitle = parts.length > 1 ? parts.slice(1).join(' - ').trim() : base;
      setMusicUp((prev) => ({
        mode: 'new',
        file: { uri: a.uri, name, size: a.size || 0, mime: a.mimeType || 'audio/mpeg', ext },
        title: guessTitle,
        artist: guessArtist,
        agree: prev ? !!prev.agree : false,
      }));
    } catch (e) {
      showAlert('음악 선택 오류', `파일을 불러오지 못했습니다.\n(${e?.message || e})`);
    }
  };
  const openMusicUpload = () => {
    setMusicUp({ mode: 'new', file: null, title: '', artist: '', agree: false });
    pickMusicToUpload();
  };
  const submitMusicUpload = async () => {
    const u = musicUp;
    if (!u || musicUpBusy) return;
    const title = (u.title || '').trim();
    const artist = (u.artist || '').trim();
    if (!title) { showAlert('제목', '노래 제목을 적어 주세요.'); return; }
    if (u.mode === 'edit') {
      setMusicUpBusy(true);
      const { error } = await supabase
        .from('music_tracks')
        .upsert({ file_name: u.item.name, title, artist: artist || null, uploader_id: u.item.uploaderId || session.user.id }, { onConflict: 'file_name' });
      setMusicUpBusy(false);
      if (error) { showAlert('고치기 실패', error.message); return; }
      setMusicUp(null);
      fetchMusicLibrary();
      return;
    }
    if (!u.file) { showAlert('파일', '올릴 음악 파일을 골라 주세요.'); return; }
    if (!u.agree) { showAlert('확인', '저작권 확인에 체크해 주세요.'); return; }
    setMusicUpBusy(true);
    const fileName = `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${u.file.ext}`;
    try {
      const resp = await fetch(u.file.uri);
      const buf = await resp.arrayBuffer();
      const up = await supabase.storage.from('bgm-library').upload(fileName, buf, { contentType: u.file.mime, upsert: false });
      if (up.error) throw up.error;
      const ins = await supabase.from('music_tracks').insert({ file_name: fileName, title, artist: artist || null, uploader_id: session.user.id });
      if (ins.error) {
        await supabase.storage.from('bgm-library').remove([fileName]).catch(() => {});
        throw ins.error;
      }
      setMusicUpBusy(false);
      setMusicUp(null);
      fetchMusicLibrary();
      showAlert('올리기 완료', `"${title}"을(를) 음악 저장소에 올렸어요.`);
    } catch (e) {
      setMusicUpBusy(false);
      showAlert('올리기 실패', `음악을 올리지 못했습니다.\n(${e?.message || e})`);
    }
  };
  const musicItemActions = (item) => {
    const mine = item.uploaderId && item.uploaderId === session.user.id;
    if (!mine && !isAdmin) return;
    Alert.alert(item.title, item.artist || '음악 저장소', [
      {
        text: '제목·가수 고치기',
        onPress: () => setMusicUp({ mode: 'edit', item, title: item.title, artist: item.artist || '', agree: true }),
      },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => Alert.alert('노래 삭제', `"${item.title}"을(를) 지울까요?\n가족 모두의 목록에서 사라져요.`, [
          { text: '취소', style: 'cancel' },
          {
            text: '삭제',
            style: 'destructive',
            onPress: async () => {
              const rm = await supabase.storage.from('bgm-library').remove([item.name]);
              if (rm.error) { showAlert('삭제 실패', rm.error.message); return; }
              await supabase.from('music_tracks').delete().eq('file_name', item.name);
              setMusicSel((prev) => { const n = { ...prev }; delete n[item.url]; return n; });
              fetchMusicLibrary();
            },
          },
        ]),
      },
      { text: '닫기', style: 'cancel' },
    ]);
  };
  const renderMusicUploadModal = () => {
    const u = musicUp;
    return (
      <Modal visible={!!u} transparent animationType="slide" onRequestClose={() => { if (!musicUpBusy) setMusicUp(null); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <TouchableOpacity style={styles.fsDim} activeOpacity={1} onPress={() => { if (!musicUpBusy) setMusicUp(null); }}>
            {u ? (
              <TouchableOpacity activeOpacity={1} style={[styles.fsSheet, { paddingBottom: 24 + insets.bottom }]} onPress={() => {}}>
                <View style={styles.fsHandle} />
                <Text style={[styles.fsTitle, { marginBottom: 12 }]}>{u.mode === 'edit' ? '제목·가수 고치기' : '음악 올리기'}</Text>
                {u.mode === 'new' ? (
                  <TouchableOpacity style={styles.muFile} activeOpacity={0.8} onPress={pickMusicToUpload} disabled={musicUpBusy}>
                    <View style={styles.muFileIcon}><Ionicons name="musical-notes" size={17} color="#FFFFFF" /></View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.muFileName} numberOfLines={1}>{u.file ? u.file.name : '음악 파일 고르기'}</Text>
                      <Text style={styles.hMuted}>{u.file ? (u.file.size ? fmtBytes(u.file.size) : '') : 'mp3 · m4a · wav · aac · ogg / 50MB까지'}</Text>
                    </View>
                    <Text style={styles.muFileChange}>{u.file ? '다른 파일' : '고르기'}</Text>
                  </TouchableOpacity>
                ) : null}
                <Text style={styles.muLabel}>제목</Text>
                <TextInput
                  style={styles.muInput}
                  value={u.title}
                  onChangeText={(t) => setMusicUp((prev) => (prev ? { ...prev, title: t } : prev))}
                  placeholder="노래 제목"
                  placeholderTextColor="#A1A1AA"
                  editable={!musicUpBusy}
                />
                <Text style={styles.muLabel}>가수</Text>
                <TextInput
                  style={styles.muInput}
                  value={u.artist}
                  onChangeText={(t) => setMusicUp((prev) => (prev ? { ...prev, artist: t } : prev))}
                  placeholder="가수 (모르면 비워 두세요)"
                  placeholderTextColor="#A1A1AA"
                  editable={!musicUpBusy}
                />
                {u.mode === 'new' ? (
                  <TouchableOpacity
                    style={styles.muAgree}
                    activeOpacity={0.7}
                    onPress={() => setMusicUp((prev) => (prev ? { ...prev, agree: !prev.agree } : prev))}
                    disabled={musicUpBusy}
                  >
                    <Ionicons name={u.agree ? 'checkbox' : 'square-outline'} size={18} color="#3F3F46" />
                    <Text style={styles.muAgreeText}>가족끼리 듣는 용도로 올려요. 저작권 문제가 있는 음악은 올리지 않을게요.</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity style={[styles.muSubmit, musicUpBusy && { opacity: 0.7 }]} onPress={submitMusicUpload} disabled={musicUpBusy}>
                  {musicUpBusy ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <ActivityIndicator size="small" color="#FFFFFF" />
                      <Text style={styles.muSubmitText}>{u.mode === 'edit' ? '저장하는 중…' : '올리는 중… 잠시만요'}</Text>
                    </View>
                  ) : (
                    <Text style={styles.muSubmitText}>{u.mode === 'edit' ? '저장' : '올리기'}</Text>
                  )}
                </TouchableOpacity>
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    );
  };

  const renderMusicScreen = () => {
    const q = musicQuery.trim().toLowerCase();
    const shown = q ? musicSorted.filter((it) => `${it.title} ${it.artist || ''}`.toLowerCase().includes(q)) : musicSorted;
    const selUrls = Object.keys(musicSel).filter((k) => musicSel[k]);
    const allSelected = musicSorted.length > 0 && selUrls.length === musicSorted.length;
    const rec = musicSorted.length ? seededPick(musicSorted, 1, dayKeyNum() + musicRecShuffle * 5)[0] : null;
    const nowUrl = bgmTrack ? bgmTrack.url : null;

    const header = (
      <View>
        <View style={styles.mHead}>
          <Text style={styles.mTitle}>음악 저장소</Text>
          <Text style={styles.hMuted}>노래 듣기</Text>
        </View>

        {/* 금일의 추천곡 */}
        <View style={[styles.hSec, { backgroundColor: 'rgba(24,24,27,0.06)' }]}>
          <View style={styles.hSecHead}>
            <Text style={styles.hSecTitle}>금일의 추천곡</Text>
            {musicSorted.length > 1 ? (
              <TouchableOpacity onPress={() => setMusicRecShuffle(musicRecShuffle + 1)} hitSlop={8}>
                <Text style={styles.hSecAction}><Ionicons name="refresh" size={11} color="#A1A1AA" /> 다른 곡</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {rec ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={styles.mRecCover}><Ionicons name="disc-outline" size={24} color="#71717A" /></View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.mRecTitle} numberOfLines={1}>{rec.title}</Text>
                <Text style={styles.hMuted} numberOfLines={1}>{rec.artist ? `${rec.artist} · ` : ''}오늘의 추천</Text>
              </View>
              <TouchableOpacity
                style={styles.mRecPlay}
                onPress={() => musicPlayList(musicSorted, musicSorted.findIndex((x) => x.url === rec.url))}
              >
                <Ionicons name={nowUrl === rec.url && bgmPlaying ? 'pause' : 'play'} size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.hMuted}>{musicLoading ? '노래를 불러오는 중이에요…' : '아직 저장된 노래가 없어요.'}</Text>
          )}
        </View>

        {/* 노래 검색 + 음악 올리기 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={[styles.mSearch, { flex: 1 }]}>
          <Ionicons name="search" size={16} color="#A1A1AA" />
          <TextInput
            style={styles.mSearchInput}
            value={musicQuery}
            onChangeText={setMusicQuery}
            placeholder="노래 제목 · 가수 검색"
            placeholderTextColor="#A1A1AA"
            returnKeyType="search"
          />
          {musicQuery ? (
            <TouchableOpacity onPress={() => setMusicQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color="#A1A1AA" />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity style={styles.muUpBtn} onPress={openMusicUpload} activeOpacity={0.85}>
          <Ionicons name="add" size={16} color="#FFFFFF" />
          <Text style={styles.muUpBtnText}>음악 올리기</Text>
        </TouchableOpacity>
        </View>

        {/* 전체 선택 · 곡 수 · 전체 듣기 */}
        <View style={styles.mListHead}>
          <TouchableOpacity
            style={[styles.mCheck, allSelected && styles.mCheckOn]}
            onPress={() => {
              if (allSelected) setMusicSel({});
              else {
                const all = {};
                musicSorted.forEach((it) => { all[it.url] = true; });
                setMusicSel(all);
              }
            }}
            hitSlop={8}
          >
            {allSelected ? <Ionicons name="checkmark" size={13} color="#FFFFFF" /> : null}
          </TouchableOpacity>
          <Text style={styles.mListHeadText}>
            저장된 노래 <Text style={{ color: '#71717A', fontWeight: '400' }}>{musicSorted.length}곡</Text>
            <Text style={styles.hMuted}>  · 가나다순</Text>
          </Text>
          <TouchableOpacity style={styles.mPlayAll} onPress={() => musicPlayList(musicSorted, 0)}>
            <Ionicons name="play" size={12} color="#FFFFFF" />
            <Text style={styles.mPlayAllText}>전체 듣기</Text>
          </TouchableOpacity>
        </View>
      </View>
    );

    return (
      <View style={{ flex: 1 }}>
        <FlatList
          style={{ flex: 1, backgroundColor: bgc('#FFFFFF') }}
          contentContainerStyle={{ paddingTop: 6, paddingBottom: 16 }}
          data={shown}
          keyExtractor={(it) => it.url}
          extraData={[musicSel, nowUrl, bgmPlaying]}
          ListHeaderComponent={header}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={[styles.hMuted, { textAlign: 'center', marginTop: 24 }]}>
              {musicLoading ? '노래를 불러오는 중이에요…' : q ? '찾는 노래가 없어요.' : '아직 저장된 노래가 없어요.'}
            </Text>
          }
          renderItem={({ item }) => {
            const on = !!musicSel[item.url];
            const isNow = nowUrl === item.url;
            return (
              <TouchableOpacity
                style={styles.mRow}
                activeOpacity={0.7}
                onPress={() => musicPlayList(musicSorted, musicSorted.findIndex((x) => x.url === item.url))}
                onLongPress={() => musicItemActions(item)}
                delayLongPress={350}
              >
                <TouchableOpacity
                  style={[styles.mCheck, on && styles.mCheckOn]}
                  onPress={() => setMusicSel((prev) => ({ ...prev, [item.url]: !prev[item.url] }))}
                  hitSlop={10}
                >
                  {on ? <Ionicons name="checkmark" size={13} color="#FFFFFF" /> : null}
                </TouchableOpacity>
                <View style={[styles.mCover, isNow && { backgroundColor: 'rgba(24,24,27,0.22)' }]}>
                  <Ionicons name={isNow && bgmPlaying ? 'stats-chart' : 'musical-note'} size={17} color={isNow ? '#3F3F46' : '#A1A1AA'} />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[styles.mRowTitle, isNow && { fontWeight: '700' }]} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.hMuted} numberOfLines={1}>
                    {isNow
                      ? (bgmPlaying ? '재생 중' : '일시정지')
                      : [item.artist, item.uploaderId ? `${(item.uploaderId === session.user.id ? (profile.nickname || '나') : (memberById(item.uploaderId)?.nickname || '회원'))} 올림` : '음악 저장소'].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Ionicons name="reorder-three-outline" size={22} color="#C4C4C9" />
              </TouchableOpacity>
            );
          }}
        />

        {renderMusicUploadModal()}

        {/* 선택한 곡이 있으면: 선택 듣기 / 취소 */}
        {selUrls.length > 0 ? (
          <View style={styles.mSelBar}>
            <Text style={styles.mSelText}>{selUrls.length}곡 선택됨</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <TouchableOpacity
                onPress={() => {
                  musicPlayList(musicSorted.filter((it) => musicSel[it.url]), 0);
                  setMusicSel({});
                }}
              >
                <Text style={[styles.mSelText, { fontWeight: '700' }]}>▶ 선택 듣기</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setMusicSel({})}>
                <Text style={[styles.mSelText, { opacity: 0.75 }]}>취소</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* 맨 아래 재생 바 (맨 위 BGM과 같은 플레이어) */}
        <View style={styles.mPlayer}>
          <TouchableOpacity onPress={() => setMusicRepeat(!musicRepeat)} hitSlop={8}>
            <Ionicons name="repeat" size={20} color={musicRepeat ? '#18181B' : '#C4C4C9'} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => musicStep(-1)} hitSlop={8}>
            <Ionicons name="play-skip-back" size={22} color="#18181B" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              if (!bgmTrack && musicSorted.length) musicPlayList(musicSorted, 0);
              else { bgmUnmute(); if (soundRef.current) soundRef.current.setIsMutedAsync(false).catch(() => {}); bgmToggle(); }
            }}
            hitSlop={8}
          >
            <Ionicons name={bgmPlaying ? 'pause' : 'play'} size={30} color="#18181B" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => musicStep(1)} hitSlop={8}>
            <Ionicons name="play-skip-forward" size={22} color="#18181B" />
          </TouchableOpacity>
          <View style={styles.mPlayerCover}>
            <Ionicons name="musical-notes" size={14} color="#71717A" />
          </View>
        </View>
      </View>
    );
  };

  // 게시글 탭 위쪽: 모두/친구만 + 회원 줄 + (고른 회원 소개) + 격자/목록 전환
  const renderPostsHeader = () => (
    <View style={{ paddingTop: 4 }}>
      {/* 멤버 줄 위: 친구만 / 모두 선택 (작은 글자 + 음영) + 오른쪽 끝 회원 검색 */}
      <View style={styles.memberFilterRow}>
        <TouchableOpacity
          style={styles.memberSearchBtn}
          onPress={() => { fetchFriendsAndRequests(); setMainTab('friends'); }}
          hitSlop={8}
        >
          <Ionicons name="search" size={15} color="#52525B" />
          <Text style={styles.memberSearchText}>회원 찾기</Text>
        </TouchableOpacity>
        {[
          { key: false, label: '모두' },
          { key: true, label: '친구만' },
        ].map((opt) => {
          const on = memberFilterFriends === opt.key;
          return (
            <TouchableOpacity
              key={opt.label}
              style={[styles.memberFilterBtn, on && styles.memberFilterBtnOn]}
              activeOpacity={0.7}
              onPress={() => setMemberFilterFriends(opt.key)}
            >
              <Text style={[styles.memberFilterText, on && styles.memberFilterTextOn]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.igStoryBarContent}
      >
        <TouchableOpacity
          style={styles.igStoryItem}
          onPress={() => {
            // '나': 내 게시글만 보기 (한 번 더 누르면 전체)
            setBrandMenuOpen(false);
            setAccountMenuOpen(false);
            setPostsMemberId(postsMemberId === session.user.id ? null : session.user.id);
          }}
        >
          <View style={styles.igStoryAvatarWrap}>
            <View style={[styles.igStoryRing, { marginBottom: 0, borderColor: 'transparent' }, postsMemberId === session.user.id && styles.igStoryRingSel]}>
              {profile.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.igStoryAvatar} />
              ) : (
                <View style={[styles.igStoryAvatar, styles.ktDefaultAvatar]}>
                  <Ionicons name="person" size={18} color="#64748B" />
                </View>
              )}
            </View>
          </View>
          <Text style={styles.igStoryName} numberOfLines={1}>나</Text>
        </TouchableOpacity>

        {(memberFilterFriends ? otherMembers.filter((m) => acceptedFriendIds.includes(m.id)) : otherMembers).map((member) => {
          const isFriendMember = acceptedFriendIds.includes(member.id);
          const unreadN = unreadCountBySender[member.id] || 0;
          return (
          <TouchableOpacity
            key={member.id}
            style={styles.igStoryItem}
            onPress={() => {
              // 회원을 고르면 아래 게시글이 그 회원 게시글로 바뀜 (한 번 더 누르면 전체)
              setBrandMenuOpen(false);
              setAccountMenuOpen(false);
              setPostsMemberId(postsMemberId === member.id ? null : member.id);
            }}
          >
            <View style={styles.igStoryAvatarWrap}>
              <View style={[styles.igStoryRing, { marginBottom: 0 }, !isFriendMember && styles.igStoryRingOff, postsMemberId === member.id && styles.igStoryRingSel]}>
                {member.avatar_url ? (
                  <Image source={{ uri: member.avatar_url }} style={[styles.igStoryAvatar, !isFriendMember && { opacity: 0.75 }]} />
                ) : (
                  <View style={[styles.igStoryAvatar, styles.ktDefaultAvatar]}>
                    <Ionicons name="person" size={18} color="#64748B" />
                  </View>
                )}
              </View>
              {isFriendMember && (
                <View style={styles.igStoryFriendBadge}>
                  <Ionicons name="checkmark" size={9} color="#FFFFFF" />
                </View>
              )}
              {unreadN > 0 && (
                <View style={styles.igStoryUnreadBadge}>
                  <Text style={styles.igStoryUnreadText}>{unreadN > 99 ? '…' : unreadN}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.igStoryName, !isFriendMember && { color: '#A1A1AA' }]} numberOfLines={1}>
              {member.nickname || '친구'}
            </Text>
          </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* 고른 회원 소개: 이름을 누르면 프로필 카드 (나는 프로필 편집) */}
      {postsSelMember ? (
        <View style={styles.postsMemberHead}>
          {postsSelMember.avatar_url ? (
            <Image source={{ uri: postsSelMember.avatar_url }} style={styles.postsMemberAvatar} />
          ) : (
            <View style={[styles.postsMemberAvatar, { alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="person" size={20} color="#A1A1AA" />
            </View>
          )}
          <View style={{ flex: 1, marginLeft: 10 }}>
            <TouchableOpacity
              activeOpacity={0.6}
              onPress={() => {
                if (postsSelMember.id === session.user.id) openProfileEditor();
                else openMemberPage(postsSelMember);
              }}
            >
              <Text style={styles.postsMemberName} numberOfLines={1}>
                {postsSelMember.nickname || '회원'} <Ionicons name="chevron-forward" size={13} color="#A1A1AA" />
                <Text style={styles.postsMemberCount}>  게시물 {postsList.length}</Text>
              </Text>
            </TouchableOpacity>
            <Text
              style={[styles.postsMemberBio, !(postsSelMember.bio && postsSelMember.bio.trim()) && { color: '#A1A1AA' }]}
              numberOfLines={1}
            >
              {postsSelMember.bio && postsSelMember.bio.trim() ? postsSelMember.bio.trim() : '소개글이 등록되지 않았습니다.'}
            </Text>
            <Text style={styles.postsMemberVisit}>{visitLabelOf(postsSelMember)}</Text>
          </View>
          <TouchableOpacity onPress={() => setPostsMemberId(null)} hitSlop={10} style={{ padding: 4 }}>
            <Ionicons name="close" size={18} color="#71717A" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.postsAllHead}>
          <Text style={styles.postsTabTitle}>{memberFilterFriends ? '친구 게시글' : '모든 게시글'}</Text>
          <Text style={styles.postsTabCount}>{postsList.length}개</Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#EEEEEE', marginTop: 8 }}>
        <TouchableOpacity
          style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: homeGrid ? 2 : 0, borderBottomColor: '#111111' }}
          onPress={() => changeHomeView(true)}
        >
          <Ionicons name="grid" size={22} color={homeGrid ? '#111111' : '#B0B3B8'} />
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: homeGrid ? 0 : 2, borderBottomColor: '#111111' }}
          onPress={() => changeHomeView(false)}
        >
          <Ionicons name="albums" size={22} color={homeGrid ? '#B0B3B8' : '#111111'} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderFeedCommentPanel = (item, overlay) => {
    const list = commentsByPost[String(item.id)] || [];
    const tops = list.filter((c) => !c.parent_id);
    const target = null; // 답글 기능 없음 (새 댓글만)
    const mainColor = overlay ? '#FFFFFF' : '#18181B';
    const subColor = overlay ? '#D4D4D8' : '#52525B';

    const submit = async () => {
      const txt = panelCommentText.trim();
      if (!txt) return;
      setPanelCommentText('');
      setPanelReplyTarget(null);
      await handleAddComment(item.id, txt, target ? target.id : null);
    };

    return (
      <View style={overlay ? styles.feedCommentOverlay : styles.feedCommentInline}>
        <View style={styles.feedCommentHeader}>
          <Text style={[styles.feedCommentTitle, { color: mainColor }]}>댓글 {tops.length}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => openPostView(item, 0)} style={{ paddingHorizontal: 6 }}>
              <Text style={{ color: subColor, fontSize: 12 }}>댓글상세</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setPanelReplyTarget(null); setCommentPanelPostId(null); }} style={{ paddingHorizontal: 4 }}>
              <Ionicons name="close" size={20} color={mainColor} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          nestedScrollEnabled
          style={overlay ? { flex: 1 } : { maxHeight: 220 }}
          showsVerticalScrollIndicator={false}
        >
          {tops.length === 0 ? (
            <Text style={{ color: subColor, fontSize: 13, marginTop: 6 }}>첫 댓글을 남겨 보세요.</Text>
          ) : (
            tops.map((c) => (
              <View key={String(c.id)} style={{ marginBottom: 9 }}>
                <Text style={{ color: mainColor, fontSize: 13, lineHeight: 18 }}>
                  <Text style={{ fontWeight: '700' }}>{c.authorName || '회원'} </Text>
                  {c.content}
                </Text>
              </View>
            ))
          )}
        </ScrollView>

        <View style={styles.feedCommentInputRow}>
          <TextInput
            style={styles.feedCommentInput}
            value={panelCommentText}
            onChangeText={setPanelCommentText}
            placeholder="댓글 달기..."
            placeholderTextColor="#9CA3AF"
          />
          <TouchableOpacity onPress={submit} style={styles.feedCommentSendBtn}>
            <Text style={styles.feedCommentSendText}>등록</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderHomeFeedPostItem = ({ item }) => {
    const isMyPost = item.author_id === session.user.id;
    const isLikedByMe = Boolean(item.reactions?.some((x) => x.user_id === session.user.id));
    const totalReactions = item.reactions?.length || 0;
    const postComments = commentsByPost[String(item.id)] || [];
    const authorName = item.profiles?.nickname || profile.nickname || '친구';
    const authorAvatar = item.profiles?.avatar_url || null;
    const dateText = new Date(item.created_at).toLocaleString('ko-KR');
    const isPanelOpen = commentPanelPostId === item.id;
    const hasImage = Boolean(item.image_urls?.[0]);

    return (
      <View style={styles.minimalPostCard}>
        <View style={styles.minimalPostHeader}>
          <TouchableOpacity
            style={styles.igPostAuthorRow}
            onPress={() => {
              if (isMyPost) {
                setMainTab('story');
              } else {
                const target = members.find((m) => m.id === item.author_id);
                if (target) openMemberPage(target);
              }
            }}
          >
            {authorAvatar ? (
              <Image source={{ uri: authorAvatar }} style={styles.igPostAvatar} />
            ) : (
              <View style={[styles.igPostAvatar, styles.ktDefaultAvatar]}>
                <Ionicons name="person" size={16} color="#64748B" />
              </View>
            )}
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.igPostAuthorName}>{authorName}</Text>
                <View style={styles.visibilityPill}>
                  <Text style={styles.visibilityPillText}>{getVisibilityLabel(item.visibility)}</Text>
                </View>
              </View>
              <Text style={styles.igPostDate}>{dateText}</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.igPostRightActions}>
            {!isMyPost && renderFriendStatusActionButton(item.author_id, true)}
            <TouchableOpacity onPress={() => setSelectedPostId(item.id)} style={{ paddingHorizontal: 4, paddingVertical: 2 }}>
              <Ionicons name="ellipsis-horizontal" size={18} color="#444444" />
            </TouchableOpacity>
          </View>
        </View>

        {hasImage && (
          <View style={{ position: 'relative' }}>
            {(() => {
              const openViewer = (i) => openPostView(item, i);
              return item.image_urls.length > 1 ? (
                <FeedImageCarousel
                  width={homeListWidth > 0 ? homeListWidth : undefined}
                  uris={item.image_urls}
                  onPressIndex={openViewer}
                  onDoubleLike={() => { if (!isLikedByMe) toggleReaction(item.id, 'like'); }}
                />
              ) : (
                <CompactFeedImage
                  width={homeListWidth > 0 ? homeListWidth : undefined}
                  uri={item.image_urls[0]}
                  onPress={() => openViewer(0)}
                  onDoubleLike={() => { if (!isLikedByMe) toggleReaction(item.id, 'like'); }}
                />
              );
            })()}
          </View>
        )}


        <View style={styles.minimalPostFooter}>
          <View style={styles.minimalStatsRow}>
            <TouchableOpacity
              style={styles.minimalStatBtn}
              activeOpacity={0.75}
              onPress={() => toggleReaction(item.id, 'like')}
            >
              <BounceView trigger={isLikedByMe}>
                <Ionicons
                  name={isLikedByMe ? 'heart' : 'heart-outline'}
                  size={20}
                  color={isLikedByMe ? '#E11D48' : '#18181B'}
                />
              </BounceView>
              <Text style={[styles.minimalStatCount, isLikedByMe && { color: '#E11D48', fontWeight: '700' }]}>
                {totalReactions}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.minimalStatBtn}
              activeOpacity={0.75}
              onPress={() => {
                // 아래에서 댓글 팝업이 올라옴 (게시물 상세로 이동하지 않음)
                setPanelCommentText('');
                setCommentPanelPostId(item.id);
                setCommentSheetPost(item);
                fetchCommentsForPost(item.id);
              }}
            >
              <Ionicons name={isPanelOpen ? 'chatbubble' : 'chatbubble-outline'} size={19} color="#18181B" />
              <Text style={styles.minimalStatCount}>{postComments.length}</Text>
            </TouchableOpacity>

          </View>

          {item.content ? (
            <TouchableOpacity activeOpacity={0.85} onPress={() => setSelectedPostId(item.id)}>
              <Text style={styles.minimalPostCaption}>
                <Text style={styles.minimalCaptionAuthor}>{authorName} </Text>
                {item.content}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  const filteredMembers = otherMembers.filter((m) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (m.nickname || '').toLowerCase().includes(q) ||
      (m.bio || '').toLowerCase().includes(q)
    );
  });

  const renderFriendRow = (friend) => {
    return (
      <View key={friend.id} style={styles.ktFriendRow}>
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
          activeOpacity={0.75}
          onPress={() => openMemberPage(friend)}
        >
          {friend.avatar_url ? (
            <Image source={{ uri: friend.avatar_url }} style={styles.ktFriendAvatar} />
          ) : (
            <View style={[styles.ktFriendAvatar, styles.ktDefaultAvatar]}>
              <Ionicons name="person" size={20} color="#64748B" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.ktFriendName}>{friend.nickname || '친구'}</Text>
            {friend.bio ? (
              <Text style={styles.ktFriendBio} numberOfLines={1}>
                {friend.bio}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>

        {renderFriendStatusActionButton(friend.id, true)}
      </View>
    );
  };

  const renderFriendsTabScreen = () => (
    <View style={styles.ktContainer}>
      <View style={styles.ktHeader}>
        <Text style={styles.ktPageTitle}>친구하기</Text>
        <TouchableOpacity style={styles.ktIconBtn} onPress={openProfileEditor}>
          <Ionicons name="settings-outline" size={21} color="#111111" />
        </TouchableOpacity>
      </View>

      <View style={styles.ktSearchBox}>
        <View style={styles.ktSearchRow}>
          <Ionicons name="search-outline" size={17} color="#888888" />
          <TextInput
            style={styles.ktSearchInput}
            placeholder="이름 또는 상태메시지로 친구 검색..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
        {incomingCount > 0 && (
          <View style={styles.ktSection}>
            <Text style={styles.ktSectionTitle}>받은 친구 신청 {incomingCount}명</Text>
            {incomingRequests.map((req) => (
              <View key={req.id} style={styles.ktFriendRow}>
                {req.requesterProfile?.avatar_url ? (
                  <Image source={{ uri: req.requesterProfile.avatar_url }} style={styles.ktFriendAvatar} />
                ) : (
                  <View style={[styles.ktFriendAvatar, styles.ktDefaultAvatar]}>
                    <Ionicons name="person" size={20} color="#64748B" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.ktFriendName}>{req.requesterProfile?.nickname || '회원'}</Text>
                  <Text style={styles.ktFriendBio}>친구 신청을 보냈습니다</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity
                    style={styles.acceptMiniBtn}
                    onPress={() => acceptFriendRequest(req.id, req.requester_id)}
                  >
                    <Text style={styles.acceptMiniBtnText}>수락</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rejectMiniBtn}
                    onPress={() => rejectFriendRequest(req.id, req.requester_id)}
                  >
                    <Text style={styles.rejectMiniBtnText}>거절</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            <View style={styles.ktDivider} />
          </View>
        )}

        <TouchableOpacity
          style={styles.ktSelfBanner}
          onPress={() =>
            openInlineChatInMessagesTab({
              id: session.user.id,
              nickname: profile.nickname || '나',
              avatar_url: profile.avatar_url,
            })
          }
        >
          <View style={styles.ktSelfBadge}>
            <Ionicons name="chatbubble" size={16} color="#0369A1" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.ktSelfTitle}>me · 나와의 채팅 (개인 메모장)</Text>
            <Text style={styles.ktSelfSub} numberOfLines={1}>
              {profile.bio || '나에게 보내는 메시지를 기록해 보세요'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#888888" />
        </TouchableOpacity>

        <View style={styles.ktSection}>
          <TouchableOpacity
            style={styles.ktSectionHeader}
            onPress={() => setFriendsSectionOpen(!friendsSectionOpen)}
          >
            <Text style={styles.ktSectionTitle}>
              회원 목록 {filteredMembers.length} (수락된 친구 {acceptedFriendIds.length}명)
            </Text>
            <Ionicons name={friendsSectionOpen ? 'chevron-up' : 'chevron-down'} size={15} color="#999999" />
          </TouchableOpacity>

          {friendsSectionOpen && (
            filteredMembers.length > 0 ? (
              filteredMembers.map(renderFriendRow)
            ) : (
              <Text style={styles.ktEmptySectionText}>
                {searchQuery ? '검색된 회원이 없습니다.' : '아직 가입된 다른 회원이 없습니다.'}
              </Text>
            )
          )}
        </View>
      </ScrollView>
    </View>
  );

  const renderInlineChatDrawer = (partner) => {
    const isSelfChat = partner.id === session.user.id;

    return (
      <View style={[styles.inlineChatDrawer, { flex: 1 }]}>
        <View style={styles.inlineChatDrawerTop}>
          <Text style={styles.inlineChatDrawerLabel} numberOfLines={1}>
            {isSelfChat
              ? `me (나와의 채팅 · 길게 눌러 삭제)`
              : `${partner.nickname || '대화방'} 대화 (보낸 메시지 길게 눌러 삭제)`}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity onPress={() => setChatPartner(null)} style={styles.inlineChatCollapseBtn}>
              <Text style={styles.inlineChatCollapseText}>{isWideScreen ? '닫기' : '접기'}</Text>
              <Ionicons name={isWideScreen ? 'close' : 'chevron-up'} size={14} color="#52525B" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          ref={inlineChatScrollRef}
          style={[styles.inlineChatHistoryScroll, { flex: 1 }]}
          contentContainerStyle={{ padding: 12, paddingBottom: 16 }}
          nestedScrollEnabled
          showsVerticalScrollIndicator={true}
          onContentSizeChange={() => inlineChatScrollRef.current?.scrollToEnd({ animated: false })}
          onLayout={() => {
            inlineChatScrollRef.current?.scrollToEnd({ animated: false });
            // 키보드가 올라오며 화면 크기가 바뀌는 중에도 마지막 메시지가 보이게 한 번 더 내림
            setTimeout(() => inlineChatScrollRef.current?.scrollToEnd({ animated: false }), 150);
          }}
        >
          {chatMessages.length === 0 ? (
            <View style={styles.inlineChatEmpty}>
              <Text style={styles.inlineChatEmptyText}>
                아직 메시지가 없습니다. 아래 입력창에서 바로 대화를 시작해 보세요.
              </Text>
            </View>
          ) : (
            chatMessages.map((item) => {
              const isMine = item.sender_id === session.user.id;
              const timeStr = new Date(item.created_at).toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit',
              });
              const detectedUrl = !item.image_url && !item.file_url ? extractFirstUrl(item.content) : null;

              return (
                <View key={String(item.id)} style={[styles.bubbleRow, isMine ? styles.bubbleRowMine : styles.bubbleRowOther]}>
                  {isMine && (
                    <View style={styles.mineMetaCol}>
                      {!isSelfChat && (
                        // 상대가 확인하면 '읽음', 그 전에는 '확인 전'
                        <Text style={item.is_read ? styles.readStateDone : styles.readStatePending}>
                          {item.is_read ? '읽음' : '확인 전'}
                        </Text>
                      )}
                      <Text style={styles.bubbleTime}>{timeStr}</Text>
                    </View>
                  )}

                  {!isMine && (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => {
                        if (partner.avatar_url) {
                          setViewingImage({
                            uri: partner.avatar_url,
                            authorId: partner.id,
                            authorName: partner.nickname || '상대방',
                            avatarUrl: partner.avatar_url,
                            dateText: '프로필 사진',
                            likeCount: 0,
                            isLikedByMe: false,
                          });
                        }
                      }}
                    >
                      {partner.avatar_url ? (
                        <Image source={{ uri: partner.avatar_url }} style={styles.inlineChatAvatar} />
                      ) : (
                        <View style={[styles.inlineChatAvatar, styles.defaultSmallAvatar]}>
                          <Ionicons name="person" size={13} color="#64748B" />
                        </View>
                      )}
                    </TouchableOpacity>
                  )}

                  <View style={{ maxWidth: '76%' }}>
                    {!isMine && (
                      <Text style={styles.chatSenderName}>{partner.nickname || '상대방'}</Text>
                    )}

                    {getSticker(item) ? (
                      <TouchableOpacity
                        activeOpacity={0.9}
                        onLongPress={isMine ? () => handleDeleteSentMessage(item) : undefined}
                        delayLongPress={400}
                      >
                        <StickerBubbleImage url={getSticker(item)} />
                      </TouchableOpacity>
                    ) : item.image_url ? (
                      <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={() =>
                          setViewingImage({
                            uri: item.image_url,
                            authorId: item.sender_id,
                            authorName: isMine ? (profile.nickname || '나') : (partner.nickname || '상대방'),
                            avatarUrl: isMine ? profile.avatar_url : partner.avatar_url,
                            dateText: new Date(item.created_at).toLocaleString('ko-KR'),
                            likeCount: 0,
                            isLikedByMe: false,
                          })
                        }
                        onLongPress={() => chatMediaActions(item, isMine)}
                        delayLongPress={400}
                        style={styles.chatPhotoBubble}
                      >
                        <Image
                          source={{ uri: item.image_url }}
                          style={styles.chatBubbleImage}
                          resizeMode="cover"
                        />
                      </TouchableOpacity>
                    ) : item.file_url ? (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => chatFileActions(item)}
                        onLongPress={() => chatMediaActions(item, isMine)}
                        delayLongPress={400}
                        style={[styles.bubbleBox, isMine ? styles.bubbleMine : styles.bubbleOther, isMine && isSelfChat && styles.bubbleSelf, styles.fileBubbleBox]}
                      >
                        <View style={styles.fileIconCircle}>
                          <Ionicons name="attach" size={18} color="#333333" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.fileBubbleName} numberOfLines={2}>
                            {item.file_name || '첨부파일'}
                          </Text>
                          <Text style={styles.fileBubbleHint}>터치하여 열기 / 폰에 저장</Text>
                        </View>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        activeOpacity={isMine ? 0.85 : 1}
                        onPress={detectedUrl ? () => handleOpenExternalLink(detectedUrl) : undefined}
                        onLongPress={isMine ? () => handleDeleteSentMessage(item) : undefined}
                        delayLongPress={400}
                        style={[styles.bubbleBox, isMine ? styles.bubbleMine : styles.bubbleOther, isMine && isSelfChat && styles.bubbleSelf]}
                      >
                        <Text
                          style={[styles.bubbleText, detectedUrl && styles.linkBubbleText]}
                          onPress={detectedUrl ? () => handleOpenExternalLink(detectedUrl) : undefined}
                        >
                          {item.content}
                        </Text>
                        {detectedUrl && (
                          <LinkPreviewCard
                            url={detectedUrl}
                            onPress={handleOpenExternalLink}
                            onLongPress={isMine ? () => handleDeleteSentMessage(item) : undefined}
                          />
                        )}
                      </TouchableOpacity>
                    )}
                  </View>

                  {!isMine && <Text style={styles.bubbleTime}>{timeStr}</Text>}
                </View>
              );
            })
          )}
        </ScrollView>

        <View style={styles.inlineChatInputBar}>
          <TouchableOpacity
            style={[styles.chatPlusBtn, chatAttachMenuOpen && styles.chatPlusBtnActive]}
            onPress={() => setChatAttachMenuOpen(!chatAttachMenuOpen)}
            disabled={sendingMsg}
          >
            <Ionicons name={chatAttachMenuOpen ? 'close' : 'add'} size={20} color="#444444" />
          </TouchableOpacity>

          <TextInput
            style={styles.inlineChatTextInput}
            placeholder="메시지나 링크 주소를 입력하세요..."
            value={chatInput}
            onChangeText={setChatInput}
            onFocus={() => { setChatAttachMenuOpen(false); setChatStickerOpen(false); }}
            multiline
          />

          <TouchableOpacity
            style={[styles.inlineChatSendBtn, (!chatInput.trim() || sendingMsg) && { opacity: 0.5 }]}
            onPress={sendChatMessage}
            disabled={!chatInput.trim() || sendingMsg}
          >
            {sendingMsg ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.inlineChatSendText}>보내기</Text>
            )}
          </TouchableOpacity>
        </View>

        {chatAttachMenuOpen && (
          <View style={styles.inlineAttachDrawer}>
            <TouchableOpacity style={styles.attachDrawerItem} onPress={handleSendChatPhoto}>
              <View style={[styles.attachDrawerIconBox, { backgroundColor: '#48BB78' }]}>
                <Ionicons name="image-outline" size={22} color="#FFFFFF" />
              </View>
              <Text style={styles.attachDrawerLabel}>사진 올리기</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.attachDrawerItem}
              onPress={() => { setChatAttachMenuOpen(false); setChatStickerOpen(true); }}
            >
              <View style={[styles.attachDrawerIconBox, { backgroundColor: '#F6AD55' }]}>
                <Ionicons name="happy-outline" size={22} color="#FFFFFF" />
              </View>
              <Text style={styles.attachDrawerLabel}>이모티콘</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.attachDrawerItem} onPress={handleSendChatFile}>
              <View style={[styles.attachDrawerIconBox, { backgroundColor: '#4299E1' }]}>
                <Ionicons name="document-attach-outline" size={22} color="#FFFFFF" />
              </View>
              <Text style={styles.attachDrawerLabel}>파일 첨부</Text>
            </TouchableOpacity>
          </View>
        )}

        <GalleryPicker
          visible={chatGalleryOpen}
          onClose={() => setChatGalleryOpen(false)}
          onSend={sendChatPhotos}
          originalOption
        />

        {chatStickerOpen && (
          <StickerPanel
            supabase={supabase}
            onPick={sendChatSticker}
            onClose={() => setChatStickerOpen(false)}
          />
        )}
      </View>
    );
  };

  // ---- 회원 탭 (카카오톡 친구 탭 스타일) ----
  // 사진을 누르면 프로필, 이름 줄을 누르면 그 회원 게시물만 모아 보기
  const renderMembersTabScreen = () => {
    const myId = session.user.id;
    const q = memberSearch.trim().toLowerCase();
    const match = (m) =>
      !q || (m.nickname || '').toLowerCase().includes(q) || (m.bio || '').toLowerCase().includes(q);
    const byName = (a, b) => (a.nickname || '').localeCompare(b.nickname || '', 'ko');
    const others = members.filter((m) => m.id !== myId && !blockedIds.includes(m.id));
    const friends = others.filter((m) => friendRelationMap[m.id]?.status === 'accepted' && match(m)).sort(byName);
    const rest = others.filter((m) => friendRelationMap[m.id]?.status !== 'accepted' && match(m)).sort(byName);
    const meItem = {
      ...(members.find((m) => m.id === myId) || {}),
      id: myId,
      nickname: profile.nickname || '나',
      bio: profile.bio || '',
      avatar_url: profile.avatar_url || null,
    };

    const openProfile = (m) => {
      memberPostsFromListRef.current = true;
      openMemberPage(m);
    };
    const openPosts = (m) => {
      memberPostsFromListRef.current = true;
      setMemberPostsGrid(true);
      setMemberPostsUser(m);
    };

    const row = (m, big) => (
      <View key={m.id} style={[styles.mbRow, big && styles.mbRowBig]}>
        <TouchableOpacity onPress={() => openProfile(m)} activeOpacity={0.7} hitSlop={6}>
          {m.avatar_url ? (
            <Image source={{ uri: m.avatar_url }} style={[styles.mbAvatar, big && styles.mbAvatarBig]} />
          ) : (
            <View style={[styles.mbAvatar, big && styles.mbAvatarBig, styles.ktDefaultAvatar]}>
              <Ionicons name="person" size={big ? 24 : 18} color="#64748B" />
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.mbMain} onPress={() => openPosts(m)} activeOpacity={0.6}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.mbName, big && styles.mbNameBig]} numberOfLines={1}>
              {m.nickname || '이름 없음'}
            </Text>
            {big && m.bio ? <Text style={styles.mbBioUnder} numberOfLines={1}>{m.bio}</Text> : null}
          </View>
          {!big && m.bio ? (
            <View style={styles.mbBioPill}>
              <Text style={styles.mbBioPillText} numberOfLines={1}>{m.bio}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>
    );

    return (
      <View style={styles.ktContainer}>
        <View style={styles.ktHeader}>
          <Text style={styles.ktPageTitle}>회원</Text>
          <TouchableOpacity
            style={styles.ktIconBtn}
            onPress={() => {
              if (memberSearchOpen) setMemberSearch('');
              setMemberSearchOpen(!memberSearchOpen);
            }}
          >
            <Ionicons name={memberSearchOpen ? 'close' : 'search-outline'} size={20} color="#333333" />
          </TouchableOpacity>
        </View>

        {memberSearchOpen ? (
          <View style={styles.mbSearchBox}>
            <Ionicons name="search-outline" size={16} color="#888888" />
            <TextInput
              style={styles.mbSearchInput}
              placeholder="이름 또는 상태메시지로 찾기"
              value={memberSearch}
              onChangeText={setMemberSearch}
              autoFocus
            />
          </View>
        ) : null}

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {!q ? row(meItem, true) : null}
          {!q ? <View style={styles.mbDivider} /> : null}

          {!q && incomingRequests.length > 0 ? (
            <>
              <Text style={styles.mbSection}>받은 친구 신청 {incomingRequests.length}</Text>
              {incomingRequests.map((req) => (
                <View key={req.id} style={styles.mbRow}>
                  {req.requesterProfile?.avatar_url ? (
                    <Image source={{ uri: req.requesterProfile.avatar_url }} style={styles.mbAvatar} />
                  ) : (
                    <View style={[styles.mbAvatar, styles.ktDefaultAvatar]}>
                      <Ionicons name="person" size={18} color="#64748B" />
                    </View>
                  )}
                  <Text style={[styles.mbName, { flex: 1, marginLeft: 12 }]} numberOfLines={1}>
                    {req.requesterProfile?.nickname || '회원'}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 5 }}>
                    <TouchableOpacity style={styles.acceptMiniBtn} onPress={() => acceptFriendRequest(req.id, req.requester_id)}>
                      <Text style={styles.acceptMiniBtnText}>수락</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.rejectMiniBtn} onPress={() => rejectFriendRequest(req.id, req.requester_id)}>
                      <Text style={styles.rejectMiniBtnText}>거절</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              <View style={styles.mbDivider} />
            </>
          ) : null}

          <Text style={styles.mbSection}>친구 {friends.length}</Text>
          {friends.length === 0 ? (
            <Text style={styles.mbEmpty}>{q ? '찾는 친구가 없어요' : '아직 친구가 없어요'}</Text>
          ) : friends.map((m) => row(m, false))}

          <View style={styles.mbDivider} />
          <Text style={styles.mbSection}>다른 회원 {rest.length}</Text>
          {rest.length === 0 ? (
            <Text style={styles.mbEmpty}>{q ? '찾는 회원이 없어요' : '다른 회원이 없어요'}</Text>
          ) : rest.map((m) => row(m, false))}
        </ScrollView>
      </View>
    );
  };

  const renderChatsTabScreen = () => {
    // 일반 폰: 지금처럼 목록만 보이고, 누르면 대화창이 화면 전체로 열림
    if (!isWideScreen) {
      return (
        <KeyboardAvoidingView
          style={styles.ktContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {renderChatsListContent()}
          {/* 1:1 대화창 (목록 밖에서 한 번만 띄움: 목록이 다시 그려져도 입력창이 풀리지 않게) */}
          {chatPartner ? (
            <Modal
              visible
              animationType="slide"
              onRequestClose={() => (viewingImage && !viewingImage.postId ? setViewingImage(null) : setChatPartner(null))}
            >
              <View style={{ flex: 1, backgroundColor: bgc('#fff'), paddingTop: 36 }}>
                {/* 키보드가 올라오면 가려지는 만큼 아래 여백을 줘서 입력창·메시지가 키보드 위로 올라오게 함 */}
                <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
                  {renderInlineChatDrawer(chatPartner)}
                </KeyboardAvoidingView>
              </View>
              {/* 채팅 사진 크게 보기 (채팅창 위에 보이도록 이 안에서 띄움) */}
              {viewingImage && !viewingImage.postId ? (
                <FullscreenPhotoPopup
                  photoInfo={viewingImage}
                  currentUserId={session.user.id}
                  onClose={() => setViewingImage(null)}
                />
              ) : null}
            </Modal>
          ) : null}
        </KeyboardAvoidingView>
      );
    }

    // 넓은 화면(폴드 펼침·태블릿): 왼쪽 목록 + 오른쪽 대화창 (카카오톡처럼)
    const listWidth = Math.max(250, Math.min(360, Math.round(windowWidth * 0.38)));
    return (
      <View style={styles.wideChatRow}>
        <View style={[styles.ktContainer, styles.wideChatListPane, { width: listWidth }]}>
          {renderChatsListContent()}
        </View>
        <KeyboardAvoidingView style={styles.wideChatRoomPane} behavior="padding">
          {chatPartner ? (
            renderInlineChatDrawer(chatPartner)
          ) : (
            <View style={styles.wideChatEmpty}>
              <Ionicons name="chatbubbles-outline" size={40} color="#A0AEC0" />
              <Text style={styles.wideChatEmptyText}>왼쪽 목록에서 대화할 사람을 골라 주세요</Text>
            </View>
          )}
        </KeyboardAvoidingView>
      </View>
    );
  };

  const renderChatsListContent = () => (
    <>
      <View style={styles.ktHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={styles.ktPageTitle}>1:1</Text>
          <TouchableOpacity
            style={[styles.leaveModeBtn, leaveSelectMode && styles.leaveModeBtnOn]}
            onPress={() => {
              if (leaveSelectMode) exitLeaveSelect();
              else { setChatPartner(null); setLeaveSelectMode(true); }
            }}
          >
            <Text style={[styles.leaveModeText, leaveSelectMode && { color: '#FFFFFF' }]}>
              {leaveSelectMode ? '취소' : '채팅방 나가기'}
            </Text>
          </TouchableOpacity>
        </View>
        {leaveSelectMode ? (
          <TouchableOpacity
            style={[styles.leaveDoBtn, leaveSelectedIds.length === 0 && { opacity: 0.4 }]}
            disabled={leaveSelectedIds.length === 0}
            onPress={leaveSelectedChats}
          >
            <Text style={styles.leaveDoText}>나가기 {leaveSelectedIds.length > 0 ? `(${leaveSelectedIds.length})` : ''}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.ktIconBtn}
            onPress={() => {
              fetchFriendsAndRequests();
              fetchUnreadCountsBySender(session.user.id);
              fetchLastMessages(session.user.id);
            }}
          >
            <Ionicons name="refresh-outline" size={20} color="#333333" />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={sortedChatMembers}
        keyExtractor={(item) => item.id}
        extraData={{
          activeChatId: chatPartner?.id,
          unreadCountBySender,
          leaveSelectMode,
          leaveSelected,
        }}
        contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 6, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={[styles.emptyText, { color: '#A1A1AA' }]}>
              아직 대화가 없어요.{'\n'}왼쪽 회원 탭에서 대화할 사람의 사진을 눌러{'\n'}1:1 채팅하기를 시작해 보세요.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isMe = item.id === session.user.id;
          const isExpanded = chatPartner?.id === item.id;
          const unreadForSender = isMe ? 0 : (unreadCountBySender[item.id] || 0);

          return (
            <View
              style={[
                styles.memberCardGroup,
                isMe && styles.pinnedSelfCardGroup,
                isExpanded && styles.memberCardGroupExpanded,
              ]}
            >
              <TouchableOpacity
                style={[styles.memberRow, isExpanded && styles.memberRowActive]}
                activeOpacity={0.75}
                onPress={() => (leaveSelectMode ? toggleLeaveSelect(item.id) : toggleInlineChat(item))}
              >
                {leaveSelectMode ? (
                  <View style={[styles.leaveCheck, leaveSelected[item.id] && styles.leaveCheckOn]}>
                    {leaveSelected[item.id] ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : null}
                  </View>
                ) : null}
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={styles.memberAvatar} />
                ) : (
                  <View style={[styles.memberAvatar, styles.ktDefaultAvatar]}>
                    <Ionicons name="person" size={17} color="#64748B" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {isMe ? (
                      // 나와의 채팅: '나와의 채팅' 글자 대신 하늘색 'me' 표시 (다른 이름들과 같은 줄 높이)
                      <View style={styles.meBadge}>
                        <Text style={[styles.memberName, styles.meBadgeText]}>me</Text>
                      </View>
                    ) : (
                      <Text style={styles.memberName}>{item.nickname || '이름 없음'}</Text>
                    )}
                  </View>
                  <Text style={styles.memberBio} numberOfLines={1}>
                    {chatPreviewText(lastMsgByPartner[item.id]) || '대화를 시작해 보세요'}
                  </Text>
                </View>

                {/* 오른쪽: 마지막 대화 시간 + 안 읽은 숫자 */}
                <View style={styles.chatListRight}>
                  <Text style={styles.chatListTime} numberOfLines={1}>
                    {formatChatListTime(lastMsgByPartner[item.id]?.created_at)}
                  </Text>
                  {unreadForSender > 0 ? (
                    <View style={styles.unreadCounterBadge}>
                      <Text style={styles.unreadCounterBadgeText}>{unreadForSender}</Text>
                    </View>
                  ) : (
                    <View style={{ height: 18 }} />
                  )}
                </View>
              </TouchableOpacity>

            </View>
          );
        }}
      />
    </>
  );

  const renderProfileHeader = () => (
    <ImageBackground
      source={profile.cover_url ? { uri: profile.cover_url } : undefined}
      style={styles.coverBackground}
      resizeMode="cover"
    >
      <TouchableOpacity
        activeOpacity={1}
        style={styles.coverOverlay}
        onPress={() => {
          if (profile.cover_url) {
            setViewingImage({
              uri: profile.cover_url,
              authorId: session.user.id,
              authorName: profile.nickname || '내 스토리',
              avatarUrl: profile.avatar_url || null,
              dateText: '프로필 배경사진',
              caption: profile.bio || '',
              likeCount: 0,
              isLikedByMe: false,
            });
          }
        }}
      >
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.topCircleBtn} onPress={() => setMainTab('home')}>
            <Ionicons name="arrow-back" size={16} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.visitorBadge}>
            <Text style={styles.visitorText}>
              TODAY {todayVisitsOf(profile)}  |  TOTAL {profile.total_visits || 0}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity style={styles.topPillBtn} onPress={openProfileEditor}>
              <Text style={styles.topPillBtnText}>프로필 편집</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.topCircleBtn} onPress={handleLogout}>
              <Text style={[styles.topCircleBtnText, { fontSize: 11 }]}>로그아웃</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.profileBottomSection}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              if (profile.avatar_url) {
                setViewingImage({
                  uri: profile.avatar_url,
                  authorId: session.user.id,
                  authorName: profile.nickname || '내 스토리',
                  avatarUrl: profile.avatar_url,
                  dateText: '프로필 사진',
                  caption: profile.bio || '',
                  likeCount: 0,
                  isLikedByMe: false,
                });
              } else {
                showAlert('알림', '등록된 프로필 사진이 없습니다.\n아래 [내 프로필 꾸미기] 버튼에서 사진을 등록해 보세요!');
              }
            }}
          >
            {profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.circularAvatar} />
            ) : (
              <View style={[styles.circularAvatar, styles.defaultAvatar]}>
                <Ionicons name="person" size={28} color="#FFFFFF" />
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.profileName}>-{profile.nickname || '내 스토리'}-</Text>
          <Text style={styles.profileBio}>{profile.bio}</Text>

          <View style={styles.glassActionBox}>
            <TouchableOpacity style={styles.glassTopBtn} onPress={openProfileEditor}>
              <Text style={styles.glassBtnText}>내 프로필 꾸미기</Text>
            </TouchableOpacity>
            <View style={styles.glassDividerHorizontal} />
            <View style={styles.glassBottomRow}>
              <TouchableOpacity
                style={styles.glassHalfBtn}
                onPress={() =>
                  openInlineChatInMessagesTab({
                    id: session.user.id,
                    nickname: profile.nickname || '나',
                    avatar_url: profile.avatar_url,
                  })
                }
              >
                <Ionicons name="chatbubble-outline" size={14} color="#FFFFFF" />
                <Text style={styles.glassBtnText}>me</Text>
              </TouchableOpacity>
              <View style={styles.glassDividerVertical} />
              <TouchableOpacity
                style={styles.glassHalfBtn}
                onPress={() => {
                  setImageUri(null); setPostImages([]);
                  setContent('');
                  setVisibility('public');
                  setWriteModalVisible(true);
                }}
              >
                <Ionicons name="add" size={16} color="#FFFFFF" />
                <Text style={styles.glassBtnText}>새 게시물</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </ImageBackground>
  );

  // 격자 한 칸 크기: 실제 목록 너비를 재서 3칸으로 나눔 (기기마다 잘리지 않게)
  const gridCell = homeListWidth > 0
    ? Math.floor(((homeListWidth - 4) / 3) * 100) / 100
    : (CONTENT_WIDTH - RIGHT_MARGIN - 4) / 3;

  const renderGridItem = ({ item }) => {
    const hasImage = item.image_urls && item.image_urls.length > 0;
    const reactionCount = item.reactions?.length || 0;
    // 누구 게시물인지: 작은 프로필 사진 + 이름
    const gAuthorName = item.profiles?.nickname || (item.author_id === session.user.id ? profile.nickname : '') || '회원';
    const gAuthorAvatar = item.profiles?.avatar_url || (item.author_id === session.user.id ? profile.avatar_url : null);
    const authorChip = (
      <View style={styles.gridAuthorChip}>
        {gAuthorAvatar ? (
          <Image source={{ uri: gAuthorAvatar }} style={styles.gridAuthorAvatar} />
        ) : (
          <View style={[styles.gridAuthorAvatar, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#71717A' }]}>
            <Ionicons name="person" size={9} color="#FFFFFF" />
          </View>
        )}
        <Text style={styles.gridAuthorName} numberOfLines={1}>{gAuthorName}</Text>
      </View>
    );

    return (
      <TouchableOpacity
        style={[styles.gridItem, { width: gridCell, height: gridCell }]}
        activeOpacity={0.85}
        onPress={() => openPostView(item, 0)}
      >
        {hasImage ? (
          <>
            <Image source={{ uri: item.image_urls[0] }} style={styles.gridImage} />
            {item.image_urls.length > 1 ? (
              <View style={{ position: 'absolute', top: 5, right: 5 }}>
                <Ionicons name="albums" size={16} color="#FFFFFF" />
              </View>
            ) : null}
            {authorChip}
            {item.content ? (
              <View style={styles.gridCaptionOverlay}>
                <Text style={styles.gridCaptionText} numberOfLines={1}>
                  {item.content}
                </Text>
              </View>
            ) : null}
          </>
        ) : (
          <View style={styles.gridTextOnlyBox}>
            {authorChip}
            <Text style={[styles.gridTextOnlyContent, { marginTop: 18 }]} numberOfLines={4}>
              {item.content}
            </Text>
          </View>
        )}

        {reactionCount > 0 && (
          <View style={styles.gridHeartBadge}>
            <Ionicons name="heart" size={10} color="#FFFFFF" />
            <Text style={styles.gridHeartText}>{reactionCount}</Text>
          </View>
        )}

      </TouchableOpacity>
    );
  };

  const selectedPostObj = visiblePosts.find((p) => p.id === selectedPostId) || null;
  const viewingPost = viewingImage && viewingImage.postId
    ? (posts.find((p) => String(p.id) === String(viewingImage.postId)) || null)
    : null;

  // 게시물 열기: 사진이 있으면 검은 화면 사진보기, 글만 있으면 상세 팝업
  const openPostView = (post, index = 0) => {
    if (post) recordPostView(post.id);
    if (post && post.image_urls && post.image_urls.length > 0) {
      setViewingImage({ postId: post.id, index });
    } else if (post) {
      setSelectedPostId(post.id);
    }
  };
  const selectedPostComments = selectedPostId ? (commentsByPost[String(selectedPostId)] || []) : [];

  const isHomeActive = mainTab === 'home' && !onlyFavoritesFeed;
  const isFriendsActive = mainTab === 'friends';
  const isChatsActive = mainTab === 'chats';
  const isFavActive = mainTab === 'home' && onlyFavoritesFeed;
  const isStoryActive = mainTab === 'story';

  return (
    <SafeAreaView style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {incomingMsgBanner && (
        <TouchableOpacity
          style={styles.topMsgToastBanner}
          activeOpacity={0.9}
          onPress={() => {
            const targetId = incomingMsgBanner.senderId;
            const targetMember = members.find((m) => m.id === targetId) || {
              id: targetId,
              nickname: incomingMsgBanner.senderName,
              avatar_url: incomingMsgBanner.avatarUrl,
            };
            setIncomingMsgBanner(null);
            openInlineChatInMessagesTab(targetMember);
          }}
        >
          {incomingMsgBanner.avatarUrl ? (
            <Image source={{ uri: incomingMsgBanner.avatarUrl }} style={styles.toastAvatar} />
          ) : (
            <View style={[styles.toastAvatar, styles.ktDefaultAvatar]}>
              <Ionicons name="chatbubble" size={15} color="#0288D1" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.toastSenderText} numberOfLines={1}>
              {incomingMsgBanner.senderName}
            </Text>
            <Text style={styles.toastBodyText} numberOfLines={1}>
              {incomingMsgBanner.text}
            </Text>
          </View>
          <Text style={styles.toastOpenHint}>보기</Text>
        </TouchableOpacity>
      )}

      <View style={styles.mainShellRow}>
        {/* 왼쪽 세로 색인 메뉴: 오른쪽 내용 칸에 붙어 왼쪽으로 튀어나온 탭 */}
        <View style={styles.leftVerticalMenuBar}>
          {(() => {
            const goTab = (fn) => () => {
              setBrandMenuOpen(false);
              setMemberPostsUser(null);
              setAccountMenuOpen(false);
              fn();
            };
            // 버튼을 함수로 그려서, 화면이 새로 그려져도 누르던 버튼이 끊기지 않게 함
            const Tab = ({ on, icon, onPress, badge, custom }) => (
              <TouchableOpacity
                style={[styles.indexTab, on && styles.indexTabOn]}
                onPress={onPress}
                activeOpacity={0.8}
              >
                {custom ? custom(on) : <Ionicons name={icon} size={19} color={on ? '#FFFFFF' : '#71717A'} />}
                {badge > 0 ? (
                  <View style={styles.indexTabBadge}>
                    <Text style={styles.leftRailUnreadText}>{badge > 99 ? '…' : badge}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
            return (
              <>
                {/* 홈 */}
                {Tab({
                  on: mainTab === 'home' && !showGroupChat,
                  icon: mainTab === 'home' && !showGroupChat ? 'home' : 'home-outline',
                  onPress: goTab(() => { setOnlyFavoritesFeed(false); fetchPosts(); setMainTab('home'); }),
                })}
                {/* 회원 목록 (카카오톡 친구 탭처럼) */}
                {Tab({
                  on: mainTab === 'members' && !showGroupChat,
                  icon: mainTab === 'members' && !showGroupChat ? 'person' : 'person-outline',
                  badge: incomingCount,
                  onPress: goTab(() => { fetchFriendsAndRequests(); setMainTab('members'); }),
                })}
                {/* 게시글 (모든 게시물 격자 보기) */}
                {Tab({
                  on: mainTab === 'posts' && !showGroupChat,
                  icon: mainTab === 'posts' && !showGroupChat ? 'grid' : 'grid-outline',
                  onPress: goTab(() => { fetchPosts(); setMainTab('posts'); }),
                })}
                {/* 1:1 채팅 (말풍선 하나) */}
                {Tab({
                  on: mainTab === 'chats' && !showGroupChat,
                  icon: mainTab === 'chats' && !showGroupChat ? 'chatbubble' : 'chatbubble-outline',
                  badge: totalUnreadMessages,
                  onPress: goTab(() => {
                    fetchFriendsAndRequests();
                    fetchUnreadCountsBySender(session.user.id);
                    setMainTab('chats');
                  }),
                })}
                {/* 단체방 (겹친 말풍선) */}
                {Tab({
                  on: mainTab === 'group' && !showGroupChat,
                  // 단체방: 말풍선 하나 + 뒤에 옅은 음영 말풍선
                  custom: (on) => (
                    <View style={{ width: 23, height: 21 }}>
                      <Ionicons name="chatbubble" size={17} color={on ? '#FFFFFF' : '#71717A'} style={{ position: 'absolute', left: 5, top: 4, opacity: 0.35 }} />
                      <Ionicons name={on ? 'chatbubble' : 'chatbubble-outline'} size={17} color={on ? '#FFFFFF' : '#71717A'} style={{ position: 'absolute', left: 0, top: 0 }} />
                    </View>
                  ),
                  badge: groupUnreadTotal,
                  onPress: goTab(() => { fetchGroupUnreadTotal(session.user.id); setMainTab('group'); }),
                })}
                {/* 음악 저장소 · 노래 듣기 (음표) */}
                {Tab({
                  on: mainTab === 'music' && !showGroupChat,
                  icon: mainTab === 'music' && !showGroupChat ? 'musical-notes' : 'musical-notes-outline',
                  onPress: goTab(() => { fetchMusicLibrary(); setMainTab('music'); }),
                })}
                {/* 새 게시물 쓰기 */}
                {Tab({
                  on: false,
                  icon: "add",
                  onPress: goTab(() => {
                    setImageUri(null); setPostImages([]);
                    setContent('');
                    setVisibility('public');
                    setWriteModalVisible(true);
                  }),
                })}
              </>
            );
          })()}
          {showGroupChat && session ? (
            <GroupChat
              supabase={supabase}
              me={session.user.id}
              onClose={() => { setShowGroupChat(false); fetchGroupUnreadTotal(session.user.id); }}
            />
          ) : null}
        </View>

        {/* 중앙 메인 콘텐츠 영역 */}
        <View style={styles.centerContentArea}>
          {/* 모든 메뉴 공통: 로고 + BGM (맨 위 고정) */}
          {renderTopHeader()}
          <View style={{ flex: 1 }}>
          {/* 멤버 게시물 화면 (프로필 → 게시물): 홈 화면과 같은 모양, 아래 메뉴바 유지 */}
          {memberPostsUser && (() => {
            const mu = memberPostsUser;
            const list = visiblePosts.filter((p) => p.author_id === mu.id);
            const hasBio = !!(mu.bio && mu.bio.trim());
            const isMeMu = mu.id === session.user.id;
            const relMu = friendRelationMap[mu.id];
            const blockedMu = blockedIds.includes(mu.id);
            const muPlaying = !!(bgmPlaying && bgmTrack && bgmTrack.url === mu.bgm_url);
            // 친구 버튼 상태
            let fLabel = '친구 신청';
            let fIcon = 'person-add-outline';
            let fPress = () => sendFriendRequest(mu.id);
            if (relMu && relMu.status === 'accepted') {
              fLabel = '친구';
              fIcon = 'checkmark';
              fPress = () => setMemberMenuOpen(true);
            } else if (relMu && relMu.addressee_id === session.user.id) {
              fLabel = '신청 수락';
              fIcon = 'person-add';
              fPress = () => acceptFriendRequest(relMu.id, mu.id);
            } else if (relMu) {
              fLabel = '신청중';
              fIcon = 'time-outline';
              fPress = () => cancelOrRemoveFriend(mu.id);
            }
            const viewCover = () => {
              if (!mu.cover_url) return;
              setViewingImage({
                uri: mu.cover_url,
                authorId: mu.id,
                authorName: mu.nickname || '회원',
                avatarUrl: mu.avatar_url || null,
                dateText: '프로필 배경사진',
                caption: mu.bio || '',
                likeCount: 0,
                isLikedByMe: false,
              });
            };
            const header = (
              <View>
                {/* 배경사진 띠 */}
                <TouchableOpacity activeOpacity={mu.cover_url ? 0.85 : 1} onPress={viewCover} style={styles.mpCover}>
                  {mu.cover_url ? <Image source={{ uri: mu.cover_url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
                  <TouchableOpacity style={[styles.mpRoundBtn, { left: 10 }]} onPress={() => { setMemberMenuOpen(false); setMemberPostsUser(null); }} hitSlop={8}>
                    <Ionicons name="arrow-back" size={18} color="#18181B" />
                  </TouchableOpacity>
                  <View style={styles.mpTopRight}>
                    {mu.bgm_url ? (
                      <TouchableOpacity
                        style={styles.mpMusicPill}
                        onPress={() => {
                          if (bgmTrack && bgmTrack.url === mu.bgm_url && soundRef.current) bgmToggle();
                          else bgmPlay(bgmToTrack(mu));
                        }}
                      >
                        <Ionicons name={muPlaying ? 'pause' : 'play'} size={13} color="#18181B" />
                        <Text style={styles.mpMusicText}>프로필 음악</Text>
                      </TouchableOpacity>
                    ) : null}
                    {!isMeMu ? (
                      <TouchableOpacity style={styles.mpRoundBtnStatic} onPress={() => setMemberMenuOpen(true)} hitSlop={8}>
                        <Ionicons name="ellipsis-horizontal" size={17} color="#18181B" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  {mu.cover_url ? (
                    <View style={styles.mpCoverHint}><Text style={styles.mpCoverHintText}>배경사진 · 눌러서 크게</Text></View>
                  ) : null}
                </TouchableOpacity>

                <View style={styles.mpInfoRow}>
                  <TouchableOpacity
                    activeOpacity={mu.avatar_url ? 0.85 : 1}
                    onPress={() => {
                      if (!mu.avatar_url) return;
                      setViewingImage({
                        uri: mu.avatar_url,
                        authorId: mu.id,
                        authorName: mu.nickname || '회원',
                        avatarUrl: mu.avatar_url,
                        dateText: '프로필 사진',
                        caption: mu.bio || '',
                        likeCount: 0,
                        isLikedByMe: false,
                      });
                    }}
                  >
                    {mu.avatar_url ? (
                      <Image source={{ uri: mu.avatar_url }} style={styles.mpAvatar} />
                    ) : (
                      <View style={[styles.mpAvatar, { alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="person" size={24} color="#A1A1AA" />
                      </View>
                    )}
                  </TouchableOpacity>
                  <Text style={[styles.memberPostsName, { flex: 1, marginLeft: 10, marginBottom: 4 }]} numberOfLines={1}>
                    {mu.nickname || '회원'} <Text style={styles.memberPostsCount}>게시물 {list.length}</Text>
                  </Text>
                </View>
                <Text style={[styles.memberPostsBio, !hasBio && { color: '#A1A1AA' }]} numberOfLines={2} ellipsizeMode="tail">
                  {hasBio ? mu.bio.trim() : '소개글이 등록되지 않았습니다.'}
                </Text>
                <Text style={styles.memberPostsVisit}>{visitLabelOf(mu)}</Text>

                {/* 버튼 */}
                {isMeMu ? (
                  <View style={styles.mpBtnRow}>
                    <TouchableOpacity style={[styles.mpBtn, styles.mpBtnDark]} onPress={() => { setMemberPostsUser(null); openProfileEditor(); }}>
                      <Ionicons name="create-outline" size={15} color="#FFFFFF" />
                      <Text style={[styles.mpBtnText, { color: '#FFFFFF' }]}>프로필 편집</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.mpBtn} onPress={() => { setMemberPostsUser(null); openInlineChatInMessagesTab(mu); }}>
                      <Ionicons name="chatbubble-outline" size={15} color="#18181B" />
                      <Text style={styles.mpBtnText}>나와의 채팅</Text>
                    </TouchableOpacity>
                  </View>
                ) : blockedMu ? (
                  <View style={styles.mpBtnRow}>
                    <TouchableOpacity
                      style={styles.mpBtn}
                      onPress={async () => {
                        const ok = await unblockUser(mu.id);
                        if (ok) showAlert('차단 해제', `${mu.nickname || '이 사람'}님의 차단을 해제했어요.`);
                      }}
                    >
                      <Ionicons name="lock-open-outline" size={15} color="#18181B" />
                      <Text style={styles.mpBtnText}>차단 해제</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.mpBtnRow}>
                    <TouchableOpacity style={[styles.mpBtn, styles.mpBtnDark]} onPress={() => { setMemberPostsUser(null); openInlineChatInMessagesTab(mu); }}>
                      <Ionicons name="chatbubble-outline" size={15} color="#FFFFFF" />
                      <Text style={[styles.mpBtnText, { color: '#FFFFFF' }]}>1:1 채팅</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.mpBtn} onPress={fPress}>
                      <Ionicons name={fIcon} size={15} color="#18181B" />
                      <Text style={styles.mpBtnText}>{fLabel}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* ··· 메뉴 */}
                <Modal visible={memberMenuOpen} transparent animationType="fade" onRequestClose={() => setMemberMenuOpen(false)}>
                  <TouchableOpacity style={styles.mpMenuDim} activeOpacity={1} onPress={() => setMemberMenuOpen(false)}>
                    <View style={[styles.mpMenuBox, { top: insets.top + 56 }]}>
                      {mu.cover_url ? (
                        <TouchableOpacity style={styles.mpMenuRow} onPress={() => { setMemberMenuOpen(false); viewCover(); }}>
                          <Ionicons name="image-outline" size={16} color="#52525B" />
                          <Text style={styles.mpMenuText}>배경사진 크게 보기</Text>
                        </TouchableOpacity>
                      ) : null}
                      {relMu && relMu.status === 'accepted' ? (
                        <TouchableOpacity style={styles.mpMenuRow} onPress={() => { setMemberMenuOpen(false); cancelOrRemoveFriend(mu.id); }}>
                          <Ionicons name="person-remove-outline" size={16} color="#52525B" />
                          <Text style={styles.mpMenuText}>친구 끊기</Text>
                        </TouchableOpacity>
                      ) : null}
                      <View style={styles.mpMenuDivider} />
                      {blockedMu ? (
                        <TouchableOpacity
                          style={styles.mpMenuRow}
                          onPress={async () => {
                            setMemberMenuOpen(false);
                            const ok = await unblockUser(mu.id);
                            if (ok) showAlert('차단 해제', `${mu.nickname || '이 사람'}님의 차단을 해제했어요.`);
                          }}
                        >
                          <Ionicons name="lock-open-outline" size={16} color="#52525B" />
                          <Text style={styles.mpMenuText}>차단 해제</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={styles.mpMenuRow}
                          onPress={() => { setMemberMenuOpen(false); blockUser(mu.id, mu.nickname, () => setMemberPostsUser(null)); }}
                        >
                          <Ionicons name="ban-outline" size={16} color="#B91C1C" />
                          <Text style={[styles.mpMenuText, { color: '#B91C1C' }]}>차단하기</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </TouchableOpacity>
                </Modal>
                <View style={{ flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#EEEEEE', marginTop: 10 }}>
                  <TouchableOpacity
                    style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: memberPostsGrid ? 2 : 0, borderBottomColor: '#111111' }}
                    onPress={() => setMemberPostsGrid(true)}
                  >
                    <Ionicons name="grid" size={22} color={memberPostsGrid ? '#111111' : '#B0B3B8'} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: memberPostsGrid ? 0 : 2, borderBottomColor: '#111111' }}
                    onPress={() => setMemberPostsGrid(false)}
                  >
                    <Ionicons name="albums" size={22} color={memberPostsGrid ? '#B0B3B8' : '#111111'} />
                  </TouchableOpacity>
                </View>
              </View>
            );
            return (
              <View style={styles.memberPostsRoot}>
                <FlatList
                  key={memberPostsGrid ? 'member-grid' : 'member-feed'}
                  style={{ flex: 1, backgroundColor: bgc('#FFFFFF') }}
                  contentContainerStyle={{ paddingBottom: 28 }}
                  data={list}
                  numColumns={memberPostsGrid ? 3 : 1}
                  extraData={homeListWidth}
                  keyExtractor={(item) => 'm' + String(item.id)}
                  ListHeaderComponent={header}
                  renderItem={memberPostsGrid ? renderGridItem : renderHomeFeedPostItem}
                  ListEmptyComponent={
                    <View style={styles.emptyBox}>
                      <Text style={[styles.emptyText, { color: '#A1A1AA' }]}>아직 볼 수 있는 게시물이 없어요.</Text>
                    </View>
                  }
                />
              </View>
            );
          })()}

          {mainTab === 'home' && renderHomeDashboard()}

          {mainTab === 'posts' && (
            <FlatList
              key={homeGrid ? 'posts-grid' : 'posts-feed'}
              style={{ flex: 1, backgroundColor: bgc('#FFFFFF') }}
              onLayout={(e) => {
                const w = Math.floor(e.nativeEvent.layout.width);
                if (w > 0 && w !== homeListWidth) setHomeListWidth(w);
              }}
              contentContainerStyle={{ paddingBottom: 28 }}
              data={postsList}
              numColumns={homeGrid ? 3 : 1}
              extraData={[homeListWidth, postsMemberId]}
              keyExtractor={(item) => 'p' + String(item.id)}
              ListHeaderComponent={renderPostsHeader}
              renderItem={homeGrid ? renderGridItem : renderHomeFeedPostItem}
              ListEmptyComponent={
                <View style={styles.emptyBox}>
                  <Text style={[styles.emptyText, { color: '#A1A1AA' }]}>
                    {postsMemberId ? '아직 볼 수 있는 게시물이 없어요.' : '아직 올라온 게시물이 없어요.\n왼쪽 [＋] 탭을 눌러 첫 사진을 올려 보세요!'}
                  </Text>
                </View>
              }
            />
          )}

          {mainTab === 'friends' && renderFriendsTabScreen()}
          {mainTab === 'members' && renderMembersTabScreen()}
          {mainTab === 'music' && renderMusicScreen()}
          {/* 단체방: 1:1처럼 기본 틀 안에 목록, 방에 들어가면 위로 올라오는 창 */}
          {mainTab === 'group' && session ? (
            <GroupChat
              embedded
              supabase={supabase}
              me={session.user.id}
              onClose={() => setMainTab('home')}
              onRoomClosed={() => fetchGroupUnreadTotal(session.user.id)}
            />
          ) : null}
          {mainTab === 'chats' && renderChatsTabScreen()}
          {mainTab === 'story' && (
            <FlatList
              data={myStoryPosts}
              numColumns={3}
              keyExtractor={(item) => String(item.id)}
              ListHeaderComponent={renderProfileHeader}
              renderItem={renderGridItem}
              ListEmptyComponent={
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>
                    아직 등록된 게시물이 없습니다.{'\n'}상단의 [+ 새 게시물]을 눌러 첫 스토리를 올려 보세요!
                  </Text>
                </View>
              }
            />
          )}
          </View>
          {/* 맨 위 메뉴 팝업 (화면 위에 겹쳐서 열림) */}
          {renderTopMenus()}
        </View>

      </View>

      {selectedFriend && (
        <View style={styles.friendFullBackdrop}>
          <View style={[styles.friendCardModal, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            <ImageBackground
              source={selectedFriend.cover_url ? { uri: selectedFriend.cover_url } : undefined}
              style={[styles.friendCardCover, { height: Math.round((getWindowHeight() - insets.top - insets.bottom) * 0.62) }]}
              resizeMode="cover"
            >
              <TouchableOpacity
                activeOpacity={1}
                style={styles.friendCardCoverOverlay}
                onPress={() => {
                  if (selectedFriend.cover_url) {
                    setViewingImage({
                      uri: selectedFriend.cover_url,
                      authorId: selectedFriend.id,
                      authorName: selectedFriend.nickname || '친구',
                      avatarUrl: selectedFriend.avatar_url || null,
                      dateText: '프로필 배경사진',
                      caption: selectedFriend.bio || '',
                      likeCount: 0,
                      isLikedByMe: false,
                    });
                  }
                }}
              >
                <TouchableOpacity
                  style={styles.friendCardCloseBtn}
                  onPress={() => setSelectedFriend(null)}
                >
                  <Ionicons name="close" size={16} color="#FFFFFF" />
                </TouchableOpacity>
              </TouchableOpacity>

              {/* 음악 재생기: 배경사진 위쪽, 투명 (홈 재생기와 같은 구성) */}
              {selectedFriend.bgm_url ? (
                <View style={styles.friendBgmFloatWrap} pointerEvents="box-none">
                  <ProfileMusicBar
                    track={bgmToTrack(selectedFriend)}
                    playing={!!(bgmPlaying && bgmTrack && bgmTrack.url === selectedFriend.bgm_url)}
                    muted={bgmMuted}
                    onToggleMute={bgmToggleMute}
                    onToggle={() => {
                      if (bgmTrack && bgmTrack.url === selectedFriend.bgm_url && soundRef.current) bgmToggle();
                      else bgmPlay(bgmToTrack(selectedFriend));
                    }}
                  />
                </View>
              ) : null}
            </ImageBackground>

            <View style={styles.friendCardBody}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  if (selectedFriend.avatar_url) {
                    setViewingImage({
                      uri: selectedFriend.avatar_url,
                      authorId: selectedFriend.id,
                      authorName: selectedFriend.nickname || '친구',
                      avatarUrl: selectedFriend.avatar_url,
                      dateText: '프로필 사진',
                      caption: selectedFriend.bio || '',
                      likeCount: 0,
                      isLikedByMe: false,
                    });
                  }
                }}
              >
                {selectedFriend.avatar_url ? (
                  <Image source={{ uri: selectedFriend.avatar_url }} style={styles.friendCardAvatar} />
                ) : (
                  <View style={[styles.friendCardAvatar, styles.defaultAvatar]}>
                    <Ionicons name="person" size={30} color="#FFFFFF" />
                  </View>
                )}
              </TouchableOpacity>

              <Text style={styles.friendCardName}>-{selectedFriend.nickname || '친구'}-</Text>
              <Text style={styles.friendCardBio}>{selectedFriend.bio || '상태 메시지가 없습니다.'}</Text>
              <View style={styles.visitPill}>
                <Text style={styles.visitPillText}>{visitLabelOf(selectedFriend)}</Text>
              </View>


              {/* 프로필 하단 버튼 3개: 친구 / 1:1 채팅 / 차단 */}
              {(() => {
                const fid = selectedFriend.id;
                const isMe = fid === session?.user?.id;
                const rel = friendRelationMap[fid];
                const isBlocked = blockedIds.includes(fid);

                // 친구 버튼 상태
                let friendIcon = 'person-add-outline';
                let friendLabel = '친구신청';
                let friendColor = '#FFFFFF';
                let onFriendPress = () => sendFriendRequest(fid);
                if (rel && rel.status === 'accepted') {
                  friendIcon = 'person-remove-outline';
                  friendLabel = '친구끊기';
                  onFriendPress = () => cancelOrRemoveFriend(fid);
                } else if (rel && rel.addressee_id === session?.user?.id) {
                  friendIcon = 'person-add';
                  friendLabel = '신청수락';
                  friendColor = '#60A5FA';
                  onFriendPress = () => acceptFriendRequest(rel.id, fid);
                } else if (rel) {
                  friendIcon = 'time-outline';
                  friendLabel = '신청중';
                  friendColor = '#9CA3AF';
                  onFriendPress = () => cancelOrRemoveFriend(fid);
                }

                return (
                  <View style={styles.friendCardActions}>
                    <TouchableOpacity
                      style={styles.friendCardActionBtn}
                      activeOpacity={0.7}
                      onPress={() => { memberPostsFromListRef.current = false; setMemberPostsGrid(true); setMemberPostsUser(selectedFriend); setSelectedFriend(null); }}
                    >
                      <Ionicons name="grid-outline" size={17} color="#FFFFFF" />
                      <Text style={styles.friendCardActionLabel}>게시물</Text>
                    </TouchableOpacity>

                    {!isMe && (
                      <TouchableOpacity style={styles.friendCardActionBtn} activeOpacity={0.7} onPress={onFriendPress}>
                        <Ionicons name={friendIcon} size={17} color={friendColor} />
                        <Text style={[styles.friendCardActionLabel, { color: friendColor }]}>{friendLabel}</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={styles.friendCardActionBtn}
                      activeOpacity={0.7}
                      onPress={() => {
                        const target = selectedFriend;
                        setSelectedFriend(null);
                        openInlineChatInMessagesTab(target);
                      }}
                    >
                      <Ionicons name="chatbubble-outline" size={17} color="#FFFFFF" />
                      <Text style={styles.friendCardActionLabel}>1:1 채팅하기</Text>
                    </TouchableOpacity>

                    {!isMe && (
                      isBlocked ? (
                        <TouchableOpacity
                          style={styles.friendCardActionBtn}
                          activeOpacity={0.7}
                          onPress={async () => {
                            const ok = await unblockUser(fid);
                            if (ok) showAlert('차단 해제', `${selectedFriend.nickname || '이 사람'}님의 차단을 해제했어요.`);
                          }}
                        >
                          <Ionicons name="lock-open-outline" size={17} color="#9CA3AF" />
                          <Text style={[styles.friendCardActionLabel, { color: '#9CA3AF' }]}>차단해제</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={styles.friendCardActionBtn}
                          activeOpacity={0.7}
                          onPress={() => blockUser(fid, selectedFriend.nickname, () => setSelectedFriend(null))}
                        >
                          <Ionicons name="ban-outline" size={17} color="#F87171" />
                          <Text style={[styles.friendCardActionLabel, { color: '#F87171' }]}>차단하기</Text>
                        </TouchableOpacity>
                      )
                    )}
                  </View>
                );
              })()}
            </View>
          </View>
        </View>
      )}

      {editProfileModal && (
        <View style={styles.overlayBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>프로필 변경 / 꾸미기</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>상단 프로필 배경사진 (세로 4:3 비율)</Text>
              <TouchableOpacity
                style={styles.coverPickerBox}
                onPress={async () => {
                  const uri = await selectFromGallery();
                  if (uri) setTempCoverUri(uri);
                }}
              >
                {tempCoverUri ? (
                  <Image source={{ uri: tempCoverUri }} style={styles.coverPreview} resizeMode="cover" />
                ) : (
                  <View style={{ alignItems: 'center', gap: 6 }}>
                    <Ionicons name="image-outline" size={26} color="#777777" />
                    <Text style={styles.pickerPlaceholder}>터치하여 세로 배경사진 선택</Text>
                  </View>
                )}
              </TouchableOpacity>

              <Text style={styles.fieldLabel}>원형 메인 프로필 사진</Text>
              <TouchableOpacity
                style={styles.avatarPickerRow}
                onPress={async () => {
                  const uri = await selectFromGallery();
                  if (uri) setTempAvatarUri(uri);
                }}
              >
                {tempAvatarUri ? (
                  <Image source={{ uri: tempAvatarUri }} style={styles.avatarPreview} resizeMode="cover" />
                ) : (
                  <View style={[styles.avatarPreview, styles.defaultAvatar]}>
                    <Ionicons name="person" size={24} color="#FFFFFF" />
                  </View>
                )}
                <Text style={styles.pickerLinkText}>원형 프로필 사진 변경하기</Text>
              </TouchableOpacity>

              <Text style={styles.fieldLabel}>이름 (닉네임)</Text>
              <TextInput
                style={styles.modalInput}
                value={tempNickname}
                onChangeText={setTempNickname}
                placeholder="표시할 이름을 입력하세요"
              />

              <Text style={styles.fieldLabel}>프로필 소개글</Text>
              <TextInput
                style={[styles.modalInput, { height: 70, textAlignVertical: 'top' }]}
                value={tempBio}
                onChangeText={setTempBio}
                placeholder="소개글이나 상태 메시지를 입력하세요"
                multiline
              />

              <Text style={styles.fieldLabel}>배경음악 (내 프로필을 열면 나오는 노래)</Text>
              <View style={styles.bgmPickRow}>
                <Text style={styles.bgmPickTitle} numberOfLines={1}>
                  {bgmChanged && !tempBgmUri
                    ? '선택 안 함'
                    : (tempBgmUri ? tempBgmTitle : (profile.bgm_url ? (profile.bgm_title || '설정됨') : '선택 안 함'))}
                </Text>
                <TextBtn label="곡 고르기" onPress={pickBgmFile} />
                {(tempBgmUri || profile.bgm_url) && !(bgmChanged && !tempBgmUri) ? (
                  <TextBtn
                    label="지우기"
                    pressedColor="#DC2626"
                    onPress={() => { setTempBgmUri(null); setTempBgmName(''); setTempBgmTitle(''); setBgmChanged(true); }}
                  />
                ) : null}
              </View>
              {tempBgmUri ? (
                <TextInput
                  style={styles.modalInput}
                  value={tempBgmTitle}
                  onChangeText={setTempBgmTitle}
                  placeholder="곡 제목"
                />
              ) : null}
            </ScrollView>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEditProfileModal(false)} disabled={loading}>
                <Text style={styles.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={saveProfileSettings} disabled={loading}>
                {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.modalSaveText}>저장하기</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {writeModalVisible && (
        <View style={styles.overlayBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>새 게시물 올리기</Text>

            <Text style={styles.fieldLabel}>공개 범위 설정</Text>
            <View style={styles.visibilitySelectorRow}>
              {VISIBILITY_OPTIONS.map((opt) => {
                const active = visibility === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.visibilitySelectChip, active && styles.visibilitySelectChipActive]}
                    onPress={() => setVisibility(opt.key)}
                  >
                    <Ionicons
                      name={opt.icon}
                      size={14}
                      color={active ? '#FFFFFF' : '#475569'}
                    />
                    <Text style={[styles.visibilitySelectText, active && styles.visibilitySelectTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              style={[styles.modalInput, { height: 110, textAlignVertical: 'top' }]}
              placeholder="오늘 어떤 일이 있었나요?"
              value={content}
              onChangeText={setContent}
              multiline
            />

            {postImages.length > 0 ? (
              <View style={{ marginBottom: 10 }}>
                <TouchableOpacity
                  style={styles.aiSuggestBtn}
                  onPress={suggestCaptionWithAI}
                  disabled={aiBusy}
                >
                  {aiBusy ? (
                    <ActivityIndicator color="#6D28D9" />
                  ) : (
                    <Text style={styles.aiSuggestBtnText}>✨ AI 문구 추천받기</Text>
                  )}
                </TouchableOpacity>
                {aiError ? <Text style={styles.aiErrorText}>{aiError}</Text> : null}
                {aiSuggestions.map((t, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.aiSuggestItem}
                    onPress={() => { setContent(t); hapticSelect(); }}
                  >
                    <Text style={styles.aiSuggestItemText}>{t}</Text>
                  </TouchableOpacity>
                ))}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
                  {postImages.map((u, idx) => (
                    <View key={u + idx} style={styles.postThumbWrap}>
                      <Image source={{ uri: u }} style={styles.postThumb} />
                      <View style={styles.postThumbNum}>
                        <Text style={styles.postThumbNumText}>{idx + 1}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.postThumbDel}
                        onPress={() => setPostImages((prev) => prev.filter((_, k) => k !== idx))}
                      >
                        <Ionicons name="close" size={14} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {postImages.length < MAX_POST_PHOTOS ? (
              <TouchableOpacity
                style={styles.attachPhotoBtn}
                onPress={() => setPostGalleryOpen(true)}
                disabled={postPhotoBusy}
              >
                {postPhotoBusy ? (
                  <ActivityIndicator color="#333333" />
                ) : (
                  <>
                    <Ionicons name="image-outline" size={18} color="#333333" />
                    <Text style={{ color: '#333', fontWeight: 'bold' }}>
                      갤러리에서 사진 첨부 ({postImages.length}/{MAX_POST_PHOTOS})
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <Text style={{ textAlign: 'center', color: '#64748B', fontSize: 13 }}>
                사진은 최대 {MAX_POST_PHOTOS}장까지 올릴 수 있어요
              </Text>
            )}

            {/* BGM 변경: 내 프로필 배경음악을 바로 바꿈 */}
            <TouchableOpacity
              style={[styles.attachPhotoBtn, { marginTop: 8 }]}
              onPress={openBgmLibrary}
              disabled={bgmQuickBusy || loading}
            >
              {bgmQuickBusy ? (
                <ActivityIndicator color="#333333" />
              ) : (
                <>
                  <Ionicons name="musical-notes-outline" size={18} color="#333333" />
                  <Text style={{ color: '#333', fontWeight: 'bold' }}>BGM 변경</Text>
                  <Text style={{ color: '#A1A1AA', fontSize: 12, flexShrink: 1 }} numberOfLines={1}>
                    {profile.bgm_title ? `(지금: ${profile.bgm_title})` : '(설정 안 됨)'}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setWriteModalVisible(false)} disabled={loading}>
                <Text style={styles.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={createPost} disabled={loading}>
                {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.modalSaveText}>올리기</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* 가족 BGM 모음: 곡을 미리 듣고 골라서 내 BGM으로 설정 */}
      <Modal visible={bgmLibOpen} transparent animationType="slide" onRequestClose={() => setBgmLibOpen(false)}>
        <TouchableOpacity style={styles.cmtSheetBackdrop} activeOpacity={1} onPress={() => setBgmLibOpen(false)} />
        <View style={[styles.cmtSheet, { height: '60%' }]}>
          <View style={styles.cmtSheetHandle} />
          <View style={styles.cmtSheetHeader}>
            <Text style={styles.cmtSheetTitle}>BGM 고르기 <Text style={styles.bgmLibNote}>(앱내부 곡은 저작권없음)</Text></Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              {/* 미리듣기용 음소거 버튼 (홈 음악바와 같은 상태) */}
              <TouchableOpacity onPress={bgmToggleMute} hitSlop={10} style={styles.bgmLibMuteBtn}>
                <Ionicons name={bgmMuted ? 'volume-mute-outline' : 'volume-medium-outline'} size={16} color="#FFFFFF" />
                <Text style={styles.bgmLibMuteText}>{bgmMuted ? '음소거' : '소리 켬'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setBgmLibOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={24} color="#3F3F46" />
              </TouchableOpacity>
            </View>
          </View>
          {bgmLibLoading ? (
            <ActivityIndicator style={{ marginTop: 30 }} color="#3F3F46" />
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 10 }}>
              {bgmLibItems.length === 0 ? (
                <Text style={styles.cmtSheetEmpty}>아직 등록된 곡이 없어요.</Text>
              ) : (
                bgmLibItems.map((it) => {
                  const isPlayingThis = bgmPlaying && bgmTrack && bgmTrack.url === it.url;
                  const isMine = profile.bgm_url === it.url;
                  return (
                    <View key={it.name} style={styles.bgmLibRow}>
                      <TouchableOpacity
                        onPress={() => (isPlayingThis ? bgmToggle() : previewLibraryBgm(it))}
                        hitSlop={8}
                        style={styles.bgmLibPlayBtn}
                      >
                        <Ionicons name={isPlayingThis ? 'pause' : 'play'} size={16} color="#FFFFFF" />
                      </TouchableOpacity>
                      <Text style={styles.bgmLibTitle} numberOfLines={1}>{it.title}</Text>
                      {isMine ? (
                        <Text style={styles.bgmLibMine}>사용 중</Text>
                      ) : (
                        <TouchableOpacity
                          style={styles.bgmLibPickBtn}
                          onPress={() => chooseLibraryBgm(it)}
                          disabled={bgmQuickBusy}
                        >
                          <Text style={styles.bgmLibPickText}>선택</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          )}
          <TouchableOpacity
            style={styles.bgmLibOwnBtn}
            onPress={() => { setBgmLibOpen(false); quickChangeBgm(); }}
            disabled={bgmQuickBusy}
          >
            <Ionicons name="folder-open-outline" size={16} color="#3F3F46" />
            <Text style={styles.bgmLibOwnText}>내 폰에서 직접 고르기 <Text style={styles.bgmLibNote}>(저작권 주의)</Text></Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* 댓글 팝업: 화면 아래에서 올라옴 */}
      <Modal
        visible={!!commentSheetPost}
        transparent
        animationType="slide"
        onRequestClose={() => { setCommentSheetPost(null); setCommentPanelPostId(null); }}
      >
        {commentSheetPost ? (() => {
          const sp = commentSheetPost;
          const list = (commentsByPost[String(sp.id)] || []).filter((c) => !c.parent_id);
          const avatarFor = (uid) => {
            if (uid === session.user.id) return profile.avatar_url || null;
            const m = members.find((x) => x.id === uid);
            return (m && m.avatar_url) || null;
          };
          const closeSheet = () => { setCommentSheetPost(null); setCommentPanelPostId(null); };
          const sendSheet = async () => {
            const txt = panelCommentText.trim();
            if (!txt || sheetSending) return;
            setSheetSending(true);
            setPanelCommentText('');
            await handleAddComment(sp.id, txt, null);
            setSheetSending(false);
          };
          return (
            <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
              <TouchableOpacity style={styles.cmtSheetBackdrop} activeOpacity={1} onPress={closeSheet} />
              <View style={styles.cmtSheet}>
                <View style={styles.cmtSheetHandle} />
                <View style={styles.cmtSheetHeader}>
                  <Text style={styles.cmtSheetTitle}>댓글 {list.length}</Text>
                  <TouchableOpacity onPress={closeSheet} hitSlop={10}>
                    <Ionicons name="close" size={24} color="#3F3F46" />
                  </TouchableOpacity>
                </View>
                <ScrollView
                  style={{ flex: 1 }}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={{ paddingBottom: 12 }}
                >
                  {list.length === 0 ? (
                    <Text style={styles.cmtSheetEmpty}>아직 댓글이 없어요.{'\n'}첫 댓글을 남겨 보세요.</Text>
                  ) : (
                    list.map((c) => {
                      const av = avatarFor(c.user_id);
                      return (
                        <View key={String(c.id)} style={styles.cmtSheetRow}>
                          {av ? (
                            <Image source={{ uri: av }} style={styles.cmtSheetAvatar} />
                          ) : (
                            <View style={[styles.cmtSheetAvatar, { alignItems: 'center', justifyContent: 'center' }]}>
                              <Ionicons name="person" size={16} color="#A1A1AA" />
                            </View>
                          )}
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={styles.cmtSheetName}>
                              {c.authorName || '회원'}
                              <Text style={styles.cmtSheetDate}>  {c.created_at ? new Date(c.created_at).toLocaleDateString('ko-KR') : ''}</Text>
                            </Text>
                            <Text style={styles.cmtSheetText}>{c.content}</Text>
                          </View>
                        </View>
                      );
                    })
                  )}
                </ScrollView>
                <View style={styles.cmtSheetInputRow}>
                  <TextInput
                    style={styles.cmtSheetInput}
                    value={panelCommentText}
                    onChangeText={setPanelCommentText}
                    placeholder="댓글 달기..."
                    placeholderTextColor="#A1A1AA"
                    onSubmitEditing={sendSheet}
                    returnKeyType="send"
                    blurOnSubmit={false}
                  />
                  <TouchableOpacity
                    onPress={sendSheet}
                    disabled={!panelCommentText.trim() || sheetSending}
                    style={[styles.cmtSheetSend, (!panelCommentText.trim() || sheetSending) && { opacity: 0.4 }]}
                  >
                    {sheetSending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.cmtSheetSendText}>보내기</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          );
        })() : null}
      </Modal>

      <GalleryPicker
        visible={postGalleryOpen}
        onClose={() => setPostGalleryOpen(false)}
        onSend={pickPostPhoto}
        maxSelect={Math.max(1, MAX_POST_PHOTOS - postImages.length)}
        sendLabel="선택"
      />

      {blockListOpen && (
        <View style={styles.overlayBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>차단 관리</Text>
            {blockedIds.length === 0 ? (
              <Text style={{ textAlign: 'center', color: '#64748B', marginVertical: 18 }}>
                차단한 사람이 없어요.
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 320 }}>
                {blockedIds.map((id) => (
                  <View
                    key={id}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }}
                  >
                    <Text style={{ fontSize: 15, color: '#18181B', flex: 1 }} numberOfLines={1}>
                      {resolveAuthorName(id)}
                    </Text>
                    <TextBtn label="차단 해제" onPress={() => unblockUser(id)} />
                  </View>
                ))}
              </ScrollView>
            )}
            <View style={{ alignItems: 'center', marginTop: 8 }}>
              <TextBtn label="닫기" onPress={() => setBlockListOpen(false)} />
            </View>
          </View>
        </View>
      )}


      <PostDetailPopup
        post={selectedPostObj}
        currentUserId={session.user.id}
        defaultNickname={profile.nickname}
        comments={selectedPostComments}
        onAddComment={handleAddComment}
        onEditComment={handleEditComment}
        onDeleteComment={handleDeleteComment}
        onClose={() => setSelectedPostId(null)}
        onToggleReaction={toggleReaction}
        onSaveEdit={saveEditPost}
        onDeletePost={confirmDeletePost}
        onReportPost={reportPost}
        onBlockUser={blockUser}
        onOpenFullImage={(info) => {
          setSelectedPostId(null);
          setViewingImage(info);
        }}
      />

      {viewingPost ? (
        <PostPhotoViewer
          key={String(viewingPost.id)}
          post={viewingPost}
          startIndex={viewingImage?.index || 0}
          currentUserId={session.user.id}
          defaultNickname={profile.nickname}
          comments={commentsByPost[String(viewingPost.id)] || []}
          onClose={() => setViewingImage(null)}
          onToggleReaction={toggleReaction}
          onAddComment={handleAddComment}
          onOpenMore={(postId) => {
            setViewingImage(null);
            setSelectedPostId(postId);
          }}
          onOpenAuthorChat={(partner) => {
            setViewingImage(null);
            openInlineChatInMessagesTab(partner);
          }}
        />
      ) : null}

      <FullscreenPhotoPopup
        photoInfo={viewingPost || (chatPartner && mainTab === 'chats' && !isWideScreen) ? null : viewingImage}
        currentUserId={session.user.id}
        onClose={() => setViewingImage(null)}
        onToggleReaction={toggleReaction}
        onOpenCommentOrDetail={(postId) => {
          setViewingImage(null);
          setSelectedPostId(postId);
        }}
        onOpenAuthorChat={(partner) => {
          setViewingImage(null);
          openInlineChatInMessagesTab(partner);
        }}
      />
    </SafeAreaView>
  );
}

const styles = themedStyles({
  authContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#E3F2FD',
  },
  authInnerBox: {
    width: '100%',
  },
  logo: {
    fontSize: 56,
    fontWeight: '900',
    color: '#01579B',
    textAlign: 'center',
    marginBottom: 32,
    letterSpacing: -2.5,
    transform: [{ skewX: '-8deg' }],
  },
  authSubTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#01579B',
    textAlign: 'center',
    marginBottom: 14,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#BBDEFB',
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 14,
    fontSize: 15,
    color: '#18181B',
    marginBottom: 10,
  },
  btnPrimary: {
    backgroundColor: '#0288D1',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  btnText: {
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontSize: 16,
  },
  authLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  authLinkText: {
    color: '#0277BD',
    fontSize: 13,
    fontWeight: '600',
  },
  authLinkDot: {
    color: '#64B5F6',
    fontSize: 13,
    fontWeight: 'bold',
  },

  container: { flex: 1, backgroundColor: '#FFFFFF' },
  topMsgToastBanner: {
    position: 'absolute',
    top: 12,
    left: 14,
    right: 14,
    zIndex: 1300,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#18181B',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  toastAvatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
  },
  toastSenderText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  toastBodyText: {
    color: '#E4E4E7',
    fontSize: 12,
    marginTop: 1,
  },
  toastOpenHint: {
    color: '#38BDF8',
    fontSize: 12,
    fontWeight: '700',
  },

  mainShellRow: {
    flex: 1,
    // 왼쪽 색인 메뉴 | 오른쪽 내용 칸
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
  },

  // 왼쪽 세로 색인 메뉴 (탭이 오른쪽 내용 칸에 붙어 있음)
  leftVerticalMenuBar: {
    width: LEFT_RAIL_WIDTH - 2,
    backgroundColor: '#FFFFFF',
    alignItems: 'flex-end',
    justifyContent: 'center', // 탭을 화면 세로 가운데로
    gap: 6,
  },
  indexTab: {
    width: 32,
    height: 46,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    backgroundColor: 'rgba(24,24,27,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexTabOn: {
    width: 40,
    backgroundColor: 'rgba(24,24,27,0.78)',
  },
  indexTabBadge: {
    position: 'absolute',
    top: -6,
    left: -6,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3.5,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  postsTabHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    paddingTop: 12,
    paddingBottom: 10,
  },
  postsTabTitle: { fontSize: 20, fontWeight: 'bold', color: '#191919' },
  postsTabCount: { fontSize: 13, color: '#A1A1AA' },
  leftMenuBtn: {
    width: 44,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftRailUnreadBadge: {
    position: 'absolute',
    top: -7,
    right: -4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3.5,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftRailUnreadText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: 'bold',
  },
  leftMenuAvatarRing: {
    padding: 1.5,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  leftMenuAvatarRingActive: {
    borderColor: '#111111',
  },
  leftMenuAvatarImg: {
    width: 26,
    height: 26,
    borderRadius: 7,
  },

  centerContentArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: SIDE_MARGIN,
    // 색인 탭이 붙는 왼쪽 테두리
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(24,24,27,0.78)',
  },

  rightUnreadRailBar: {
    width: RIGHT_RAIL_WIDTH,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    paddingTop: 18,
    paddingBottom: 18,
  },
  rightUnreadRailScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  rightUnreadItem: {
    alignItems: 'center',
    width: RIGHT_RAIL_WIDTH - 4,
  },
  rightUnreadAvatarWrap: {
    position: 'relative',
    padding: 1.5,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#EF4444',
  },
  rightUnreadAvatarWrapActive: {
    borderColor: '#0288D1',
  },
  rightUnreadAvatar: {
    width: 32,
    height: 32,
    borderRadius: 9,
  },
  rightUnreadCountPill: {
    position: 'absolute',
    top: -5,
    right: -6,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 3.5,
    borderRadius: 8.5,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightUnreadCountText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: 'bold',
  },
  rightUnreadName: {
    fontSize: 9.5,
    color: '#3F3F46',
    marginTop: 3,
    textAlign: 'center',
    width: RIGHT_RAIL_WIDTH - 6,
  },

  igHeaderContainer: {
    backgroundColor: '#FFFFFF',
    paddingTop: 8,
    paddingBottom: 4,
  },
  igTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
    paddingVertical: 6,
  },
  igCenterBrandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
  igLogoText: {
    fontSize: 38,
    fontWeight: '900',
    color: '#111111',
    letterSpacing: -2,
    lineHeight: 46,
    transform: [{ skewX: '-8deg' }],
    // 글꼴의 가장 굵은 두께보다 더 두껍게 보이도록 같은 색 그림자를 살짝 겹침
    textShadowColor: '#111111',
    textShadowOffset: { width: 1, height: 0 },
    textShadowRadius: 1,
  },
  igTopRightBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  menuAlertDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  menuApplicantBadge: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#0288D1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuApplicantBadgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: 'bold',
  },

  topMenuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    elevation: 1000,
  },
  accountPopoverMenu: {
    alignSelf: 'flex-end',
    marginRight: 14,
    marginBottom: 8,
    width: 224,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  accountPopoverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  accountPopoverName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#18181B',
  },
  accountPopoverEmail: {
    fontSize: 11,
    color: '#71717A',
    marginTop: 1,
  },
  accountPopoverActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  accountPopoverActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#18181B',
    flex: 1,
  },
  applicantCountPill: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  applicantCountPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0288D1',
  },
  incomingRequestBox: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  incomingRequestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  incomingRequesterName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
  },
  acceptMiniBtn: {
    backgroundColor: '#0288D1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  acceptMiniBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  rejectMiniBtn: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  rejectMiniBtnText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '600',
  },

  igBrandDropdown: {
    alignSelf: 'center',
    width: 210,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EAEAEA',
    paddingVertical: 6,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  igDropdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 10,
  },
  igDropdownLabel: { fontSize: 14, fontWeight: '600', color: '#191919' },
  igDropdownDivider: { height: 1, backgroundColor: '#F2F2F2', marginHorizontal: 10 },

  memberFilterRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 2, paddingTop: 2, paddingBottom: 2 },
  memberSearchBtn: {
    position: 'absolute', right: 2, top: 1, flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(24,24,27,0.06)',
  },
  memberSearchText: { fontSize: 11.5, color: '#52525B', fontWeight: '700' },
  // ---- 음악 저장소 ----
  mHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 },
  mTitle: { fontSize: 19, fontWeight: '700', color: '#18181B' },
  mRecCover: { width: 54, height: 54, borderRadius: 9, backgroundColor: 'rgba(24,24,27,0.14)', alignItems: 'center', justifyContent: 'center' },
  mRecTitle: { fontSize: 14.5, fontWeight: '700', color: '#18181B', marginBottom: 2 },
  mRecPlay: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(24,24,27,0.78)', alignItems: 'center', justifyContent: 'center' },
  mSearch: {
    flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(24,24,27,0.05)',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 6,
  },
  mSearchInput: { flex: 1, fontSize: 13.5, color: '#18181B', paddingVertical: 6 },
  mListHead: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: 'rgba(24,24,27,0.06)',
  },
  mListHeadText: { flex: 1, marginLeft: 10, fontSize: 13, fontWeight: '700', color: '#18181B' },
  mPlayAll: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 9, backgroundColor: 'rgba(24,24,27,0.78)',
  },
  mPlayAllText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  mCheck: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: '#C4C4C9',
    alignItems: 'center', justifyContent: 'center',
  },
  mCheckOn: { backgroundColor: 'rgba(24,24,27,0.78)', borderColor: 'rgba(24,24,27,0.78)' },
  mRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  mCover: {
    width: 46, height: 46, borderRadius: 8, marginLeft: 10, backgroundColor: 'rgba(24,24,27,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  mRowTitle: { fontSize: 14, color: '#18181B', marginBottom: 2 },
  mSelBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(24,24,27,0.78)', borderRadius: 11, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 6,
  },
  mSelText: { fontSize: 13, color: '#FFFFFF' },
  mPlayer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 9, marginBottom: 6, borderRadius: 14,
    backgroundColor: 'rgba(24,24,27,0.04)', borderWidth: 1, borderColor: 'rgba(24,24,27,0.06)',
  },
  mPlayerCover: { width: 30, height: 30, borderRadius: 7, backgroundColor: 'rgba(24,24,27,0.14)', alignItems: 'center', justifyContent: 'center' },
  memberFilterBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  memberFilterBtnOn: { backgroundColor: '#E4E4E7' },
  memberFilterText: { fontSize: 12, color: '#A1A1AA' },
  memberFilterTextOn: { color: '#27272A', fontWeight: '700' },
  igStoryBarContent: {
    paddingHorizontal: 2,
    paddingTop: 6,
    paddingBottom: 10,
    gap: STORY_GAP,
  },
  igStoryItem: {
    alignItems: 'center',
    width: STORY_ITEM_W,
  },
  igStoryAvatarWrap: {
    position: 'relative',
    marginBottom: 5,
  },
  igStoryRing: {
    padding: 2,
    borderRadius: STORY_RADIUS + 4,
    borderWidth: 1.5,
    borderColor: '#18181B',
    marginBottom: 5,
  },
  igStoryUnreadBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  igStoryUnreadText: { color: '#FFFFFF', fontSize: 10.5, fontWeight: '800' },
  igStoryRingOff: {
    borderColor: '#D4D4D8',
  },
  igStoryRingSel: {
    borderColor: 'rgba(24,24,27,0.78)',
    borderWidth: 3,
    backgroundColor: 'rgba(24,24,27,0.10)',
  },
  postsAllAvatar: { backgroundColor: 'rgba(24,24,27,0.06)', alignItems: 'center', justifyContent: 'center' },
  postsMemberHead: {
    flexDirection: 'row', alignItems: 'center', marginTop: 8, padding: 10,
    borderRadius: 12, backgroundColor: 'rgba(24,24,27,0.04)',
  },
  postsMemberAvatar: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(24,24,27,0.10)' },
  postsMemberName: { fontSize: 15, fontWeight: '700', color: '#18181B' },
  postsMemberCount: { fontSize: 12, fontWeight: '400', color: '#A1A1AA' },
  postsMemberBio: { fontSize: 12, color: '#52525B', marginTop: 2 },
  postsMemberVisit: { fontSize: 10.5, color: '#A1A1AA', marginTop: 2 },
  postsAllHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 8 },

  // ---- 새 홈 화면 (회색 농도: 공지 78% · 메인 65% · 가격 14% · 서브 10% · 희망 6% · 스케줄/항공 5% · 여행지 4% · 오늘의 회원 3%) ----
  hNotice: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12, backgroundColor: 'rgba(24,24,27,0.78)', marginBottom: 10,
  },
  hNoticeText: { flex: 1, color: '#FFFFFF', fontSize: 13, lineHeight: 19 },
  hNoticeEmpty: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(24,24,27,0.2)', marginBottom: 10,
  },
  hNoticeEmptyText: { fontSize: 12, color: '#71717A' },
  hBoardWrap: { flex: 1, paddingTop: 36 },
  hBoardHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(24,24,27,0.06)',
  },
  hBoardTitle: { fontSize: 18, fontWeight: '700', color: '#18181B', marginLeft: 8 },
  hBoardCount: { fontSize: 13, color: '#A1A1AA', marginLeft: 6 },
  hBoardWrite: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11, paddingVertical: 6,
    borderRadius: 10, backgroundColor: 'rgba(24,24,27,0.06)',
  },
  hBoardWriteText: { fontSize: 13, fontWeight: '700', color: '#3F3F46' },
  hBoardRow: { borderRadius: 11, padding: 12, marginBottom: 7, backgroundColor: 'rgba(24,24,27,0.03)' },
  hBoardRowNew: { backgroundColor: 'rgba(24,24,27,0.10)' },
  hBoardText: { fontSize: 14, color: '#27272A', lineHeight: 20 },
  hSec: { borderRadius: 14, padding: 12, marginBottom: 10 },
  hSecHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
  hSecTitle: { fontSize: 14, fontWeight: '700', color: '#18181B' },
  hSecAction: { fontSize: 11.5, color: '#A1A1AA' },
  hMuted: { fontSize: 11, color: '#A1A1AA' },
  hMotdImg: { width: 68, height: 68, borderRadius: 10, backgroundColor: 'rgba(24,24,27,0.12)' },
  hMotdBig: { width: '100%', aspectRatio: 1.25, borderRadius: 10, backgroundColor: 'rgba(24,24,27,0.12)' },
  hRecentCol: { flex: 1.15, minWidth: 0, marginLeft: 10, paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: 'rgba(24,24,27,0.08)' },
  hRecentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(24,24,27,0.06)' },
  hRecentAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(24,24,27,0.12)' },
  hRecentWho: { fontSize: 12, fontWeight: '700', color: '#18181B' },
  hRecentTime: { fontSize: 10, fontWeight: '400', color: '#A1A1AA' },
  hRecentText: { fontSize: 11, color: '#52525B', marginTop: 1 },
  hRecentThumb: { width: 32, height: 32, borderRadius: 6, marginLeft: 6, backgroundColor: 'rgba(24,24,27,0.1)' },
  hMiniAvatar: { width: 20, height: 20, borderRadius: 6, backgroundColor: 'rgba(24,24,27,0.12)', marginRight: 6 },
  hMotdName: { fontSize: 13, fontWeight: '700', color: '#18181B', flexShrink: 1 },
  hMotdText: { fontSize: 12, color: '#52525B', marginTop: 4, lineHeight: 17 },
  hMainSch: { borderRadius: 11, backgroundColor: 'rgba(24,24,27,0.65)', padding: 11, marginBottom: 6 },
  hMainTag: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  hMainTagText: { fontSize: 10.5, color: '#FFFFFF', fontWeight: '700' },
  hMainWhen: { fontSize: 11, color: 'rgba(255,255,255,0.8)' },
  hMainTitle: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', marginTop: 6 },
  hSubSch: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 9, backgroundColor: 'rgba(24,24,27,0.10)', paddingHorizontal: 10, paddingVertical: 7, marginBottom: 4,
  },
  hSubText: { flex: 1, fontSize: 12, color: '#27272A', marginRight: 8 },
  hSubWhen: { fontSize: 11, color: '#71717A' },
  hWeekRow: { flexDirection: 'row', gap: 3, marginTop: 8 },
  hWeekCell: { flex: 1, alignItems: 'center', paddingVertical: 4, borderRadius: 7 },
  hWeekCellOn: { backgroundColor: 'rgba(24,24,27,0.78)' },
  hWeekDow: { fontSize: 10, color: '#71717A' },
  hWeekDate: { fontSize: 12, fontWeight: '700', color: '#18181B' },
  hWeekDot: { fontSize: 7, color: '#3F3F46', height: 10 },
  hDestBox: {
    height: 84, borderRadius: 9, backgroundColor: 'rgba(24,24,27,0.10)',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  hDestRegion: { position: 'absolute', left: 5, bottom: 5, backgroundColor: 'rgba(255,255,255,0.88)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  hDestRegionText: { fontSize: 10, color: '#52525B' },
  hDestCity: { fontSize: 13, fontWeight: '700', color: '#18181B', marginTop: 5 },
  hDestTitle: { fontSize: 11, color: '#71717A', marginTop: 1 },
  hDestImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 9 },
  hPhotoCredit: { fontSize: 9.5, color: '#A1A1AA', marginTop: 1 },
  hDestBest: { position: 'absolute', right: 5, top: 5, backgroundColor: 'rgba(24,24,27,0.78)', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  hDestBestText: { fontSize: 9.5, color: '#FFFFFF', fontWeight: '700' },
  hDestDetail: { marginTop: 10, borderRadius: 10, backgroundColor: 'rgba(24,24,27,0.06)', padding: 11 },
  hDestDetailCity: { fontSize: 15, fontWeight: '700', color: '#18181B' },
  hDestDetailBody: { fontSize: 12.5, color: '#3F3F46', lineHeight: 20, marginTop: 5 },
  hDestSign: { fontSize: 11, color: '#A1A1AA', textAlign: 'right', marginTop: 6 },
  tdHeroShade: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 18, paddingVertical: 14, backgroundColor: 'rgba(0,0,0,0.35)' },
  tdHeroRegion: { fontSize: 11, color: '#EEEEEE', marginBottom: 2 },
  tdHeroCity: { fontSize: 26, fontWeight: '800', color: '#FFFFFF' },
  tdHeroTitle: { fontSize: 13, color: '#EEEEEE', marginTop: 2 },
  tdRoundBtn: { position: 'absolute', top: 14, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.88)', alignItems: 'center', justifyContent: 'center' },
  tdCredit: { fontSize: 10, color: '#A1A1AA', marginTop: 4 },
  tdChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(24,24,27,0.07)' },
  tdChipText: { fontSize: 11, color: '#52525B' },
  tdH: { fontSize: 17, fontWeight: '700', color: '#18181B', marginBottom: 6, marginTop: 2 },
  tdBody: { fontSize: 15, lineHeight: 27, color: '#27272A', marginBottom: 16 },
  tdTipBox: { backgroundColor: 'rgba(24,24,27,0.05)', borderRadius: 12, padding: 14, marginBottom: 16 },
  tdTipTitle: { fontSize: 13, fontWeight: '700', color: '#18181B', marginBottom: 6 },
  tdTipText: { fontSize: 13, lineHeight: 22, color: '#52525B' },
  tdFlightRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  tdFlightPrice: { fontSize: 13, fontWeight: '700', color: '#18181B' },
  tdSign: { fontSize: 13, color: '#71717A', textAlign: 'right', marginBottom: 8 },
  tdBottomBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(24,24,27,0.08)', backgroundColor: '#FFFFFF' },
  tdBottomBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 10, backgroundColor: 'rgba(24,24,27,0.06)' },
  tdBottomText: { fontSize: 13, fontWeight: '600', color: '#3F3F46' },
  hSegWrap: { flexDirection: 'row', marginLeft: 8, padding: 2, borderRadius: 8, backgroundColor: 'rgba(24,24,27,0.06)' },
  hSeg: { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 7 },
  hSegOn: { backgroundColor: 'rgba(24,24,27,0.78)' },
  hSegText: { fontSize: 11, color: '#71717A', fontWeight: '700' },
  hChip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(24,24,27,0.06)' },
  hChipOn: { backgroundColor: 'rgba(24,24,27,0.78)' },
  hChipText: { fontSize: 11.5, color: '#52525B' },
  hFlightRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'rgba(24,24,27,0.06)',
  },
  hFlightRoute: { flex: 1, fontSize: 13, color: '#18181B', marginRight: 8 },
  hPricePill: { backgroundColor: 'rgba(24,24,27,0.14)', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
  hPriceText: { fontSize: 12, fontWeight: '700', color: '#18181B' },
  hNewTag: { backgroundColor: 'rgba(24,24,27,0.78)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 1 },
  hNewTagText: { fontSize: 10, color: '#FFFFFF', fontWeight: '700' },
  hWishAvatar: { width: 46, height: 46, borderRadius: 13, backgroundColor: 'rgba(24,24,27,0.14)' },
  hWishWho: { fontSize: 12, color: '#3F3F46' },
  hWishPlace: { fontSize: 16, fontWeight: '700', color: '#18181B', marginTop: 2 },
  hWishBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9, backgroundColor: 'rgba(24,24,27,0.10)' },
  hWishBtnDark: { backgroundColor: 'rgba(24,24,27,0.78)' },
  hWishBtnText: { fontSize: 12, fontWeight: '700', color: '#27272A' },
  hWishAsk: { fontSize: 15, fontWeight: '700', color: '#18181B', marginTop: 6, marginBottom: 3 },
  hModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 22 },
  hModalCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18 },
  hModalTitle: { fontSize: 17, fontWeight: '700', color: '#18181B', marginBottom: 12 },
  hInput: {
    borderWidth: 1, borderColor: '#E4E4E7', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#18181B', marginBottom: 8,
  },
  hDateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#E4E4E7',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 8,
  },
  hDateBtnText: { flex: 1, fontSize: 14, color: '#18181B' },
  hCal: { borderWidth: 1, borderColor: '#E4E4E7', borderRadius: 14, padding: 10, marginBottom: 10 },
  hCalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, paddingHorizontal: 4 },
  hCalTitle: { fontSize: 14, fontWeight: '700', color: '#18181B' },
  hCalRow: { flexDirection: 'row' },
  hCalDow: { flex: 1, textAlign: 'center', fontSize: 11, color: '#A1A1AA', paddingVertical: 3 },
  hCalCell: { flex: 1, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  hCalIn: { backgroundColor: 'rgba(24,24,27,0.10)', borderRadius: 0 },
  hCalEdge: { backgroundColor: 'rgba(24,24,27,0.78)' },
  hCalToday: { borderWidth: 1, borderColor: 'rgba(24,24,27,0.35)' },
  hCalDay: { fontSize: 13, color: '#18181B' },
  hCalFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  hCalOk: { backgroundColor: 'rgba(24,24,27,0.78)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  hCalOkText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  muUpBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 40, paddingHorizontal: 11, borderRadius: 10, backgroundColor: '#3F3F46', marginBottom: 8 },
  muUpBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  muFile: { flexDirection: 'row', alignItems: 'center', padding: 11, borderRadius: 12, backgroundColor: 'rgba(24,24,27,0.05)', marginBottom: 10 },
  muFileIcon: { width: 34, height: 34, borderRadius: 9, backgroundColor: '#3F3F46', alignItems: 'center', justifyContent: 'center' },
  muFileName: { fontSize: 13, fontWeight: '700', color: '#18181B' },
  muFileChange: { fontSize: 11, color: '#52525B', textDecorationLine: 'underline', marginLeft: 8 },
  muLabel: { fontSize: 11, color: '#71717A', marginBottom: 4, marginTop: 2 },
  muInput: { borderWidth: 1, borderColor: 'rgba(24,24,27,0.18)', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, fontSize: 14, color: '#18181B', marginBottom: 8 },
  muAgree: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 2, marginBottom: 12 },
  muAgreeText: { flex: 1, fontSize: 11, color: '#52525B', lineHeight: 17 },
  muSubmit: { alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 11, backgroundColor: '#3F3F46' },
  muSubmitText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  ccTitle: { fontSize: 16, fontWeight: '700', color: '#18181B', marginBottom: 4 },
  ccSub: { fontSize: 12, color: '#71717A', marginBottom: 12 },
  ccStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 11, borderRadius: 10, backgroundColor: 'rgba(24,24,27,0.05)', marginBottom: 6 },
  ccNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(24,24,27,0.15)', alignItems: 'center', justifyContent: 'center' },
  ccNumText: { fontSize: 11, fontWeight: '700', color: '#3F3F46' },
  ccStepTitle: { fontSize: 13, fontWeight: '700', color: '#18181B' },
  ccStepSub: { fontSize: 11, color: '#71717A', marginTop: 2, lineHeight: 17 },
  ccNote: { fontSize: 11, color: '#71717A', marginTop: 6, marginBottom: 14 },
  ccBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 10 },
  ccBtnText: { fontSize: 13, fontWeight: '700' },
  fsDim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  fsSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 24 },
  fsHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(24,24,27,0.15)', marginBottom: 12 },
  fsTitle: { fontSize: 15, fontWeight: '700', color: '#18181B' },
  fsSub: { fontSize: 12, color: '#71717A', marginTop: 2, marginBottom: 12 },
  fsOpt: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, backgroundColor: 'rgba(24,24,27,0.06)', marginBottom: 8 },
  fsOptIcon: { width: 30, height: 30, borderRadius: 8, backgroundColor: 'rgba(24,24,27,0.08)', alignItems: 'center', justifyContent: 'center' },
  fsOptTitle: { fontSize: 13, fontWeight: '700', color: '#18181B' },
  fsOptSub: { fontSize: 11, color: '#71717A', marginTop: 1 },
  fsCheckRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 2 },
  fsCheckText: { fontSize: 12, color: '#52525B' },
  appFooter: { alignItems: 'center', marginTop: 14, paddingTop: 14, paddingBottom: 18, borderTopWidth: 1, borderTopColor: 'rgba(24,24,27,0.08)' },
  appFooterLogo: { fontSize: 13, fontWeight: '800', color: '#A1A1AA', letterSpacing: -0.5, marginBottom: 4 },
  appFooterText: { fontSize: 11, color: '#A1A1AA', lineHeight: 18, textAlign: 'center' },
  appFooterLink: { fontSize: 11, color: '#3F3F46', fontWeight: '700', textDecorationLine: 'underline' },
  appFooterCredit: { fontSize: 10, color: '#C4C4C8', lineHeight: 17, marginTop: 2, textAlign: 'center' },
  updBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 6, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(24,24,27,0.07)' },
  updBannerText: { flex: 1, fontSize: 12, color: '#18181B' },
  updBannerBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#3F3F46' },
  updBannerBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  updDim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  updCard: { width: '100%', maxWidth: 320, backgroundColor: '#FFFFFF', borderRadius: 18, paddingTop: 20, paddingHorizontal: 18, paddingBottom: 8, alignItems: 'center' },
  updIcon: { width: 52, height: 52, borderRadius: 14, backgroundColor: 'rgba(24,24,27,0.07)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  updTitle: { fontSize: 17, fontWeight: '700', color: '#18181B', marginBottom: 6 },
  updSub: { fontSize: 13, color: '#52525B', marginBottom: 10 },
  updNotes: { alignSelf: 'stretch', backgroundColor: 'rgba(24,24,27,0.05)', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 11, marginBottom: 14 },
  updNoteText: { fontSize: 12, color: '#52525B', lineHeight: 20 },
  updMainBtn: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 12, borderRadius: 11, backgroundColor: '#3F3F46' },
  updMainBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  updLater: { fontSize: 13, color: '#71717A', textAlign: 'center', paddingBottom: 6 },
  fDateBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: 'rgba(24,24,27,0.06)', marginBottom: 8 },
  fDateText: { flex: 1, fontSize: 13, color: '#18181B' },
  fCalBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8 },
  fCalBtnText: { fontSize: 12, fontWeight: '700' },
  fRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(24,24,27,0.07)' },
  fCodeBox: { width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(24,24,27,0.07)', alignItems: 'center', justifyContent: 'center' },
  fCodeText: { fontSize: 12, fontWeight: '700', color: '#3F3F46' },
  fAirline: { fontSize: 14, fontWeight: '700', color: '#18181B', flexShrink: 1 },
  fTag: { marginLeft: 5, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, backgroundColor: 'rgba(24,24,27,0.08)' },
  fTagText: { fontSize: 10, color: '#52525B' },
  fSub: { fontSize: 12, color: '#71717A', marginTop: 1 },
  fSearchBtn: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(24,24,27,0.15)' },
  fSearchText: { fontSize: 12, color: '#3F3F46' },
  hFieldLabel: { fontSize: 12, color: '#71717A', marginBottom: 5 },
  hTimeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  hTimeChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(24,24,27,0.06)' },
  hTimeChipOn: { backgroundColor: 'rgba(24,24,27,0.78)' },
  hTimeChipText: { fontSize: 12, color: '#52525B', fontWeight: '700' },
  hMainToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, marginBottom: 4 },
  hModalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
  hBtnLight: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: 'rgba(24,24,27,0.06)' },
  hBtnLightText: { fontSize: 13, fontWeight: '700', color: '#3F3F46' },
  hBtnDark: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, backgroundColor: 'rgba(24,24,27,0.78)' },
  hBtnDarkText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  igStoryFriendBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  igStoryAvatar: {
    width: STORY_AVATAR,
    height: STORY_AVATAR,
    borderRadius: STORY_RADIUS,
  },
  igStoryPlusBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#18181B',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  igStoryName: {
    fontSize: 11,
    color: '#3F3F46',
    textAlign: 'center',
  },

  minimalPostCard: {
    backgroundColor: '#FFFFFF',
    paddingTop: 16,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  minimalPostHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 10,
  },
  igPostAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  igPostAvatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
  },
  igPostAuthorName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#18181B',
  },
  visibilityPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  visibilityPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  igPostDate: {
    fontSize: 11,
    color: '#A1A1AA',
    marginTop: 1,
  },
  igPostRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  friendActionChip: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendActionChipCompact: {
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  friendActionChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0288D1',
  },
  friendActionChipPending: {
    backgroundColor: '#FEF3C7',
  },
  friendActionChipPendingText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#B45309',
  },
  friendActionChipIncoming: {
    backgroundColor: '#0288D1',
  },
  friendActionChipIncomingText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  friendActionChipAccepted: {
    backgroundColor: '#F1F5F9',
  },
  friendActionChipAcceptedText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },

  visibilitySelectorRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  visibilitySelectChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  visibilitySelectChipActive: {
    backgroundColor: '#0288D1',
    borderColor: '#0288D1',
  },
  visibilitySelectText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  visibilitySelectTextActive: {
    color: '#FFFFFF',
  },

  compactImageWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactFeedImage: {
    borderRadius: 0,
    backgroundColor: '#FAFAFA',
  },
  minimalPostFooter: {
    paddingHorizontal: 8,
    paddingTop: 10,
  },
  minimalStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 6,
  },
  minimalStatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 2,
  },
  minimalStatCount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#18181B',
  },
  minimalPostCaption: {
    fontSize: 14,
    color: '#27272A',
    lineHeight: 20,
  },
  minimalCaptionAuthor: {
    fontWeight: '700',
    color: '#18181B',
  },

  viewerZoomLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000000', zIndex: 1250 },
  viewerZoomHint: { position: 'absolute', bottom: 40, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1260 },
  musicBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 8, marginTop: 6, marginBottom: 2, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: 'rgba(24,24,27,0.08)', borderWidth: 0 },
  musicTitle: { fontSize: 13, fontWeight: '700', color: '#27272A' },
  musicOwner: { fontSize: 11, color: '#71717A', marginTop: 1 },
  musicBtn: { padding: 6, marginLeft: 2 },
  musicChangeChip: {
    position: 'absolute', top: -10, right: 12, zIndex: 2,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D4D4D8',
  },
  musicChangeText: { fontSize: 11, fontWeight: '700', color: '#52525B' },
  musicMuteBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#3F3F46', alignItems: 'center', justifyContent: 'center', marginLeft: 4, marginRight: 2 },
  musicMarqueeBox: { flex: 1, height: 20, overflow: 'hidden', justifyContent: 'center', marginHorizontal: 4 },
  musicMarqueeText: { fontSize: 12, color: '#71717A', fontWeight: '600' },
  friendBgmFloatWrap: { position: 'absolute', top: 80, left: 0, right: 0, paddingHorizontal: 12 },
  pMusicBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1, borderColor: 'rgba(161,161,170,0.35)' },
  pMusicTitle: { fontSize: 13, fontWeight: '700', color: '#E4E4E7' },
  pMusicOwner: { fontSize: 11, color: '#A1A1AA', marginTop: 1 },
  pMusicMuteBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(63,63,70,0.6)', alignItems: 'center', justifyContent: 'center', marginLeft: 4, marginRight: 2 },
  friendBgmRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', maxWidth: '80%' },
  friendBgmText: { fontSize: 13, color: '#FFFFFF', marginLeft: 6, flexShrink: 1, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  bgmPickRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  bgmPickTitle: { flex: 1, fontSize: 14, color: '#3F3F46', marginRight: 8 },
  viewerCounter: { position: 'absolute', top: 24, right: 16, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 1220 },
  viewerCounterText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  viewerDotsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  viewerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)', marginRight: 5 },
  viewerDotOn: { backgroundColor: '#FFFFFF' },
  reactPickRow: { position: 'absolute', right: 52, bottom: 0, flexDirection: 'row', backgroundColor: 'rgba(30,30,34,0.96)', borderRadius: 30, paddingHorizontal: 6, paddingVertical: 6, width: 296 },
  reactPickItem: { width: 56, alignItems: 'center', paddingVertical: 4, borderRadius: 24 },
  reactPickItemOn: { backgroundColor: 'rgba(255,255,255,0.18)' },
  reactPickLabel: { color: '#FFFFFF', fontSize: 10, marginTop: 2 },
  viewerCmtWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 1230 },
  viewerCmtSheet: { backgroundColor: 'rgba(20,20,24,0.97)', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20 },
  viewerCmtShade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20 },
  viewerCmtHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  viewerCmtTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  viewerCmtEmpty: { color: '#A1A1AA', fontSize: 13, paddingVertical: 8 },
  viewerCmtItem: { color: '#FFFFFF', fontSize: 13.5, lineHeight: 19, marginBottom: 8 },
  viewerCmtInputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  viewerCmtInput: { flex: 1, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', paddingHorizontal: 16, paddingTop: 0, paddingBottom: 0, fontSize: 15, color: '#FFFFFF', textAlignVertical: 'center', includeFontPadding: false },
  viewerCmtSend: { marginLeft: 8, height: 44, minWidth: 68, paddingHorizontal: 14, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  viewerCmtSendText: { color: '#111111', fontSize: 15, fontWeight: '800' },
  fullscreenSaveBtn: {
    position: 'absolute',
    top: 18,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1220,
  },
  fullscreenViewerRoot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    zIndex: 1200,
  },
  fullscreenBackBtn: {
    position: 'absolute',
    top: 18,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1220,
  },
  fullscreenBottomOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 48,
    paddingBottom: 28,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
    zIndex: 1210,
  },
  fullscreenAuthorMeta: {
    flex: 1,
    paddingRight: 16,
  },
  fullscreenAuthorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  fullscreenAuthorAvatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  fullscreenDefaultAvatar: {
    backgroundColor: '#3F3F46',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreenAuthorName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  fullscreenSubMeta: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  fullscreenCaptionText: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 18,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  fullscreenRightActions: {
    alignItems: 'center',
    gap: 18,
  },
  fullscreenActionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 40,
    paddingVertical: 4,
  },
  fullscreenActionCount: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  ktContainer: { flex: 1, backgroundColor: '#FFFFFF' },
  // 1:1 목록 오른쪽 시간·숫자
  chatListRight: { alignItems: 'flex-end', justifyContent: 'center', gap: 4, minWidth: 56, marginLeft: 6 },
  chatListTime: { fontSize: 11.5, color: '#A1A1AA' },
  // 회원 탭 (카카오톡 친구 탭 스타일)
  mbRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 7 },
  mbRowBig: { paddingVertical: 12 },
  mbAvatar: { width: 44, height: 44, borderRadius: 16, backgroundColor: '#E2E8F0' },
  mbAvatarBig: { width: 58, height: 58, borderRadius: 21 },
  mbMain: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 12, minHeight: 44, gap: 8 },
  mbName: { fontSize: 15, color: '#18181B' },
  mbNameBig: { fontSize: 17, fontWeight: '700' },
  mbBioUnder: { fontSize: 13, color: '#71717A', marginTop: 3 },
  mbBioPill: { maxWidth: '50%', borderWidth: 1, borderColor: '#E4E4E7', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3 },
  mbBioPillText: { fontSize: 12, color: '#52525B' },
  mbSection: { fontSize: 12.5, color: '#71717A', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  mbDivider: { height: 1, backgroundColor: '#F0F0F2', marginHorizontal: 16, marginVertical: 4 },
  mbEmpty: { fontSize: 13, color: '#A1A1AA', paddingHorizontal: 16, paddingVertical: 10 },
  mbSearchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 14, marginBottom: 6,
    paddingHorizontal: 12, borderRadius: 18, backgroundColor: '#F4F4F5',
  },
  mbSearchInput: { flex: 1, paddingVertical: 8, fontSize: 14 },
  // 넓은 화면용 1:1 나란히 보기
  wideChatRow: { flex: 1, flexDirection: 'row' },
  wideChatListPane: { flex: 0, borderRightWidth: 1, borderRightColor: '#E4E4E7' },
  wideChatRoomPane: { flex: 1, backgroundColor: '#EAF2F8' },
  wideChatEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20 },
  wideChatEmptyText: { fontSize: 14, color: '#718096', textAlign: 'center' },
  ktHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  ktPageTitle: { fontSize: 20, fontWeight: 'bold', color: '#191919' },
  ktDefaultAvatar: { backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
  ktIconBtn: { padding: 6 },

  ktSearchBox: { paddingHorizontal: 14, paddingBottom: 10 },
  ktSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F4F4',
    borderRadius: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  ktSearchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
  },

  ktSelfBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 12,
    gap: 10,
  },
  ktSelfBadge: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: '#BAE6FD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ktSelfTitle: { fontSize: 13, fontWeight: 'bold', color: '#222' },
  ktSelfSub: { fontSize: 12, color: '#777', marginTop: 2 },

  ktSection: { paddingHorizontal: 14, paddingVertical: 6 },
  ktSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  ktSectionTitle: { fontSize: 12, fontWeight: '600', color: '#777777' },
  ktEmptySectionText: { fontSize: 12, color: '#AAA', paddingVertical: 10 },
  ktDivider: { height: 1, backgroundColor: '#F0F0F0', marginHorizontal: 14, marginVertical: 6 },

  ktFriendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    gap: 10,
  },
  ktFriendAvatar: { width: 44, height: 44, borderRadius: 12 },
  ktFriendName: { fontSize: 14, fontWeight: '600', color: '#191919' },
  ktFriendBio: { fontSize: 12, color: '#888888', marginTop: 2 },

  mpCover: { height: 92, marginTop: 8, borderRadius: 12, backgroundColor: 'rgba(24,24,27,0.12)', overflow: 'hidden' },
  mpRoundBtn: { position: 'absolute', top: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.88)', alignItems: 'center', justifyContent: 'center' },
  mpRoundBtnStatic: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.88)', alignItems: 'center', justifyContent: 'center' },
  mpTopRight: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  mpMusicPill: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingHorizontal: 11, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.88)' },
  mpMusicText: { fontSize: 11, fontWeight: '700', color: '#18181B' },
  mpCoverHint: { position: 'absolute', right: 10, bottom: 8, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.3)' },
  mpCoverHintText: { fontSize: 10, color: '#FFFFFF' },
  mpInfoRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: -28, marginBottom: 6, paddingLeft: 10 },
  mpAvatar: { width: 62, height: 62, borderRadius: 17, borderWidth: 3, borderColor: '#FFFFFF', backgroundColor: '#F4F4F5' },
  mpBtnRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
  mpBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(24,24,27,0.07)' },
  mpBtnDark: { backgroundColor: '#3F3F46' },
  mpBtnText: { fontSize: 13, fontWeight: '700', color: '#18181B' },
  mpMenuDim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.15)' },
  mpMenuBox: { position: 'absolute', right: 14, minWidth: 190, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 6, borderWidth: 1, borderColor: 'rgba(24,24,27,0.08)' },
  mpMenuRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 10 },
  mpMenuText: { fontSize: 13, color: '#18181B' },
  mpMenuDivider: { height: 1, backgroundColor: 'rgba(24,24,27,0.08)', marginHorizontal: 8, marginVertical: 3 },
  memberPostsRoot: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#FFFFFF', zIndex: 50, paddingHorizontal: SIDE_MARGIN,
  },
  memberPostsHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 14, paddingBottom: 12,
  },
  memberPostsName: { fontSize: 16, fontWeight: '800', color: '#111111' },
  memberPostsCount: { fontSize: 12, fontWeight: '400', color: '#A1A1AA' },
  memberPostsAvatar: { width: 52, height: 52, borderRadius: 15, backgroundColor: '#F4F4F5' },
  visitPill: { alignSelf: 'center', marginTop: 8, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.1)' },
  visitPillText: { color: '#D4D4D8', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  memberPostsVisit: { fontSize: 11, color: '#A1A1AA', fontWeight: '700', marginTop: 3, letterSpacing: 0.3 },
  memberPostsBio: { fontSize: 13, lineHeight: 19, color: '#3F3F46', marginTop: 2 },
  friendFullBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    zIndex: 999,
  },
  friendCardModal: {
    flex: 1,
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  friendCardCover: { width: '100%', backgroundColor: '#4A5568' },
  friendCardCoverOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'flex-end',
    padding: 12,
    paddingTop: 40,
  },
  friendCardCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  friendCardBody: { flex: 1, alignItems: 'center', padding: 20, paddingTop: 0, paddingBottom: 20 },
  friendCardAvatar: {
    width: 76,
    height: 76,
    borderRadius: 21,
    borderWidth: 3,
    borderColor: '#000000',
    marginTop: -38,
    marginBottom: 10,
  },
  friendCardName: { fontSize: 18, fontWeight: 'bold', color: '#FFFFFF' },
  friendCardBio: { fontSize: 13, color: '#BBBBBB', marginTop: 4, marginBottom: 18, textAlign: 'center' },
  friendCardActions: { flexDirection: 'row', gap: 6, width: '100%', marginTop: 'auto' },
  friendCardActionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  friendCardChatBtn: { backgroundColor: '#FEE500' },
  friendCardActionLabel: { fontSize: 11, color: '#EEEEEE' },
  friendCardBlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  friendCardBlockText: { fontSize: 13, color: '#F87171' },

  coverBackground: { width: '100%', height: COVER_HEIGHT, backgroundColor: '#4A5568' },
  coverOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingBottom: 14,
    paddingHorizontal: 12,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 4,
  },
  topCircleBtn: {
    backgroundColor: 'rgba(0, 0, 0, 0.36)',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 16,
  },
  topCircleBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: 'bold' },
  topPillBtn: {
    backgroundColor: 'rgba(0, 0, 0, 0.36)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  topPillBtnText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  visitorBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  visitorText: { color: '#FFFFFF', fontSize: 10, fontWeight: '600' },

  profileBottomSection: { alignItems: 'flex-start' },
  circularAvatar: {
    width: 62,
    height: 62,
    borderRadius: 17,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    marginBottom: 8,
  },
  defaultAvatar: {
    backgroundColor: '#718096',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileName: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  profileBio: {
    color: '#F5F5F5',
    fontSize: 12,
    marginTop: 3,
    marginBottom: 12,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  glassActionBox: {
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.45)',
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
    overflow: 'hidden',
  },
  glassTopBtn: { paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  glassDividerHorizontal: { height: 1, backgroundColor: 'rgba(255, 255, 255, 0.35)' },
  glassBottomRow: { flexDirection: 'row', alignItems: 'center' },
  glassHalfBtn: { flex: 1, flexDirection: 'row', gap: 5, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  glassDividerVertical: { width: 1, height: '100%', backgroundColor: 'rgba(255, 255, 255, 0.35)' },
  igTagline: {
    marginLeft: 8,
    fontSize: 12,
    color: '#8A8F98',
    fontStyle: 'italic',
    letterSpacing: 0.2,
  },
  glassBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },

  cmtSheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  bgmLibRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#F4F4F5' },
  bgmLibMuteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: '#3F3F46' },
  bgmLibMuteText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  bgmLibPlayBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#3F3F46', alignItems: 'center', justifyContent: 'center' },
  bgmLibTitle: { flex: 1, marginLeft: 12, fontSize: 15, color: '#111111' },
  bgmLibMine: { fontSize: 12, color: '#A1A1AA', marginLeft: 8 },
  bgmLibPickBtn: { marginLeft: 8, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14, backgroundColor: '#F4F4F5' },
  bgmLibPickText: { fontSize: 13, fontWeight: '700', color: '#3F3F46' },
  bgmLibOwnBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E4E4E7' },
  bgmLibNote: { fontSize: 12, color: '#8A8F98', fontWeight: '400' },
  bgmLibOwnText: { fontSize: 14, color: '#3F3F46', fontWeight: '600' },
  cmtSheet: { height: '40%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingBottom: 24 },
  cmtSheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#D4D4D8', marginTop: 8, marginBottom: 6 },
  cmtSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#F4F4F5', marginBottom: 10 },
  cmtSheetTitle: { fontSize: 17, fontWeight: '800', color: '#111111' },
  cmtSheetEmpty: { textAlign: 'center', color: '#A1A1AA', fontSize: 14, lineHeight: 22, marginTop: 16 },
  cmtSheetRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  cmtSheetAvatar: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#F4F4F5' },
  cmtSheetName: { fontSize: 13, fontWeight: '700', color: '#111111' },
  cmtSheetDate: { fontSize: 11, fontWeight: '400', color: '#A1A1AA' },
  cmtSheetText: { fontSize: 15, color: '#27272A', lineHeight: 21, marginTop: 2 },
  cmtSheetInputRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 10, borderTopWidth: 1, borderColor: '#F4F4F5' },
  cmtSheetInput: { flex: 1, height: 46, borderRadius: 23, borderWidth: 1, borderColor: '#E4E4E7', backgroundColor: '#FAFAFA', paddingHorizontal: 16, paddingTop: 0, paddingBottom: 0, fontSize: 15, color: '#111111', textAlignVertical: 'center', includeFontPadding: false },
  cmtSheetSend: { marginLeft: 8, height: 46, minWidth: 72, paddingHorizontal: 14, borderRadius: 23, backgroundColor: '#3F3F46', alignItems: 'center', justifyContent: 'center' },
  cmtSheetSendText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  feedCommentOverlay: {
    position: 'absolute', right: 0, top: 0, bottom: 0, width: '52%',
    backgroundColor: 'rgba(0,0,0,0.62)', paddingHorizontal: 10, paddingTop: 8, paddingBottom: 8,
  },
  feedCommentInline: {
    marginHorizontal: 12, marginTop: 8, padding: 10, borderRadius: 10, backgroundColor: '#F3F4F6',
  },
  feedCommentHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6,
  },
  feedCommentTitle: { fontSize: 14, fontWeight: '700' },
  feedCommentInputRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  feedCommentInput: {
    flex: 1, height: 46, borderRadius: 23, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 14,
    textAlignVertical: 'center',
    backgroundColor: '#FFFFFF', color: '#111111',
  },
  feedCommentSendBtn: { marginLeft: 6, paddingHorizontal: 10, height: 46, justifyContent: 'center' },
  feedCommentSendText: { color: '#60A5FA', fontWeight: '700', fontSize: 13 },
  gridItem: { width: GRID_ITEM_SIZE, height: GRID_ITEM_SIZE, margin: 0.6, backgroundColor: '#2D2D2D' },
  gridImage: { width: '100%', height: '100%' },
  gridAuthorChip: {
    position: 'absolute',
    top: 4,
    left: 4,
    maxWidth: '90%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingLeft: 2,
    paddingRight: 6,
    paddingVertical: 2,
    borderRadius: 7,
    zIndex: 2,
  },
  gridAuthorAvatar: { width: 16, height: 16, borderRadius: 5 },
  gridAuthorName: { color: '#FFFFFF', fontSize: 10, fontWeight: '700', flexShrink: 1 },
  gridVisBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  gridVisBadgeText: {
    color: '#FFFFFF',
    fontSize: 8.5,
    fontWeight: '600',
  },
  gridVisBadgeInline: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.14)',
    color: '#E2E8F0',
    fontSize: 9,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 6,
    marginBottom: 3,
  },
  gridCaptionOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  gridCaptionText: { color: '#FFF', fontSize: 11 },
  gridTextOnlyBox: {
    flex: 1,
    padding: 8,
    backgroundColor: '#2B2D31',
    justifyContent: 'space-between',
  },
  gridTextOnlyContent: { color: '#F2F3F5', fontSize: 11, lineHeight: 15 },
  gridTextOnlyAuthor: { color: '#949BA4', fontSize: 10 },
  gridHeartBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  gridHeartText: { color: '#FFF', fontSize: 9, fontWeight: 'bold' },

  whitePopupBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    zIndex: 1100,
  },
  whitePopupTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EAEAEA',
  },
  whitePopupTitle: {
    color: '#191919',
    fontSize: 15,
    fontWeight: 'bold',
  },
  popupSmallAvatar: { width: 34, height: 34, borderRadius: 10 },
  defaultSmallAvatar: { backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
  whitePopupMiniBtn: {
    backgroundColor: '#F2F2F2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  whitePopupMiniBtnText: { color: '#333333', fontSize: 11, fontWeight: 'bold' },
  popupCloseIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEE500',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
  },
  popupCloseIconText: {
    color: '#3C1E1E',
    fontSize: 12,
    fontWeight: 'bold',
  },
  imageToolbarRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FAFAFA',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F0F0F0',
  },
  zoomHintText: {
    color: '#777777',
    fontSize: 11,
    marginVertical: 4,
  },
  fullViewChipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFEFEF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  fullViewChipText: {
    color: '#222222',
    fontSize: 11,
    fontWeight: '600',
  },
  whitePopupCaptionBox: {
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 14,
    alignItems: 'center',
  },
  whitePopupCaption: { color: '#222222', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  whitePopupDate: { color: '#888888', fontSize: 12, marginTop: 6 },
  whiteDetailBodyBox: {
    width: '100%',
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  whiteDetailContentText: {
    color: '#222222',
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 14,
  },
  whiteDetailEditInput: {
    backgroundColor: '#FAFAFA',
    color: '#222222',
    borderWidth: 1,
    borderColor: '#CCCCCC',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  whiteDetailReactionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: 12,
  },
  whiteDetailReactionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F6F6F6',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 16,
  },
  whiteDetailReactionText: { color: '#333333', fontSize: 12 },

  commentSectionBox: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#EAEAEA',
  },
  commentSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  commentSectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#222222',
  },
  openCommentComposerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#F0F9FF',
  },
  openCommentComposerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0288D1',
  },
  commentEmptyText: {
    fontSize: 12,
    color: '#888888',
    paddingVertical: 8,
  },
  commentItemRow: {
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
  },
  replyItemRow: {
    marginLeft: 18,
    backgroundColor: '#F1F5F9',
    borderLeftWidth: 2,
    borderLeftColor: '#CBD5E1',
  },
  commentTopMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  commentAuthorText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#01579B',
  },
  commentContentText: {
    fontSize: 14,
    color: '#222222',
    marginTop: 4,
    lineHeight: 20,
  },
  commentTimeText: {
    fontSize: 10,
    color: '#999999',
  },
  commentActionLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  commentActionLink: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  commentEditInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13.5,
    color: '#18181B',
  },

  commentComposerPanel: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  composerBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 7,
    paddingBottom: 4,
    backgroundColor: '#F8FAFC',
  },
  composerBannerText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#334155',
    flex: 1,
  },
  composerCloseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  composerCloseText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#52525B',
  },
  commentInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  commentTextInput: {
    flex: 1,
    backgroundColor: '#F4F4F4',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 80,
  },
  commentSubmitBtn: {
    backgroundColor: '#0288D1',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
  },
  commentSubmitText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },

  emptyBox: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#AAA', textAlign: 'center', lineHeight: 22, fontSize: 13 },

  memberCardGroup: {
    marginBottom: 6,
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    overflow: 'hidden',
  },
  pinnedSelfCardGroup: {
    borderColor: '#7DD3FC',
    backgroundColor: '#F0F9FF',
  },
  memberCardGroupExpanded: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 10,
    gap: 10,
  },
  memberRowActive: {
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  memberAvatar: { width: 36, height: 36, borderRadius: 10 },
  memberName: { fontSize: 13.5, fontWeight: 'bold', color: '#222' },
  memberBio: { fontSize: 11.5, color: '#777', marginTop: 1 },
  meBadge: { backgroundColor: '#BAE6FD', paddingHorizontal: 8, paddingVertical: 0, borderRadius: 6, marginLeft: -8 }, // 글자 시작이 다른 이름들과 같은 위치에 오도록
  meBadgeText: { color: '#075985' },
  unreadCounterBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadCounterBadgeText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: 'bold',
  },

  inlineChatDrawer: {
    backgroundColor: '#EAF2F8',
  },
  inlineChatDrawerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#E1ECF4',
    borderBottomWidth: 1,
    borderBottomColor: '#D4E2ED',
  },
  inlineChatDrawerLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
    flex: 1,
  },
  inlineChatCollapseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  inlineChatCollapseText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#52525B',
  },
  inlineChatHistoryScroll: {
    width: '100%',
  },
  inlineChatEmpty: {
    paddingVertical: 40,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  inlineChatEmptyText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
  inlineChatAvatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    marginBottom: 2,
  },

  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10, gap: 6 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowOther: { justifyContent: 'flex-start' },
  chatSenderName: { fontSize: 11, color: '#333', marginBottom: 3, marginLeft: 2 },
  bubbleBox: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  bubbleMine: { backgroundColor: '#D6EEFB', borderBottomRightRadius: 2 }, // 내 말풍선: 연한 하늘색
  bubbleSelf: { backgroundColor: '#BAE6FD' }, // 나와의 채팅(me) 말풍선: 하늘색
  bubbleOther: { backgroundColor: '#FFFFFF', borderBottomLeftRadius: 2 },
  bubbleText: { fontSize: 13.5, color: '#222', lineHeight: 19 },
  linkBubbleText: {
    color: '#0277BD',
    textDecorationLine: 'underline',
  },

  linkPreviewCard: {
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  linkPreviewThumb: {
    width: '100%',
    height: 110,
    backgroundColor: '#E2E8F0',
  },
  linkPreviewBody: {
    padding: 9,
  },
  linkPreviewDomainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 3,
  },
  linkPreviewDomain: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#0288D1',
    flex: 1,
  },
  linkPreviewTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 17,
  },
  linkPreviewDesc: {
    fontSize: 11,
    color: '#475569',
    marginTop: 3,
    lineHeight: 15,
  },
  linkPreviewTapHint: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 3,
  },

  chatPhotoBubble: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  chatBubbleImage: {
    width: 190,
    height: 190,
  },
  fileBubbleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 175,
  },
  fileIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileBubbleName: {
    fontSize: 12.5,
    fontWeight: 'bold',
    color: '#222',
  },
  fileBubbleHint: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
  },

  mineMetaCol: { alignItems: 'flex-end', justifyContent: 'flex-end', marginBottom: 2 },
  leaveModeBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(63,63,70,0.1)' },
  leaveModeBtnOn: { backgroundColor: '#52525B' },
  leaveModeText: { fontSize: 12, fontWeight: '700', color: '#52525B' },
  leaveDoBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: '#3F3F46' },
  leaveDoText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  leaveCheck: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: '#A1A1AA', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  leaveCheckOn: { backgroundColor: '#3F3F46', borderColor: '#3F3F46' },
  inlineChatLeaveBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: 'rgba(63,63,70,0.12)' },
  inlineChatLeaveText: { fontSize: 12, fontWeight: '700', color: '#52525B' },
  readStatePending: { fontSize: 10, fontWeight: '800', color: '#3F3F46', marginBottom: 1 },
  readStateDone: { fontSize: 10, color: '#A1A1AA', marginBottom: 1 },
  unreadBadgeText: {
    fontSize: 10.5,
    fontWeight: 'bold',
    color: '#B45309',
    marginBottom: 1,
  },
  bubbleTime: { fontSize: 10, color: '#4A5568', marginBottom: 1 },

  inlineChatInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: '#CBD5E1',
    gap: 6,
  },
  chatPlusBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatPlusBtnActive: {
    backgroundColor: '#E2E8F0',
  },
  inlineChatTextInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
    fontSize: 13.5,
    maxHeight: 80,
  },
  inlineChatSendBtn: {
    backgroundColor: '#0288D1',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
  },
  inlineChatSendText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },

  inlineAttachDrawer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 24,
  },
  attachDrawerItem: {
    alignItems: 'center',
    gap: 6,
  },
  attachDrawerIconBox: {
    width: 48,
    height: 48,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachDrawerLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#333',
  },

  overlayBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    padding: 20,
    zIndex: 999,
  },
  modalCard: { backgroundColor: '#FFF', borderRadius: 12, padding: 20, maxHeight: '90%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#222', marginBottom: 14, textAlign: 'center' },
  fieldLabel: { fontSize: 13, fontWeight: 'bold', color: '#555', marginBottom: 6, marginTop: 8 },
  coverPickerBox: {
    width: '65%',
    aspectRatio: 3 / 4,
    alignSelf: 'center',
    borderRadius: 10,
    backgroundColor: '#F2F2F2',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#DDD',
  },
  coverPreview: { width: '100%', height: '100%' },
  pickerPlaceholder: { color: '#777', fontSize: 13, textAlign: 'center', paddingHorizontal: 10 },
  avatarPickerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 4 },
  avatarPreview: { width: 64, height: 64, borderRadius: 18 },
  pickerLinkText: { color: '#0288D1', fontWeight: 'bold', fontSize: 14 },
  modalInput: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 12, fontSize: 14, backgroundColor: '#FAFAFA' },
  modalBtnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalCancelBtn: { flex: 1, padding: 13, borderRadius: 8, backgroundColor: '#EEE', alignItems: 'center' },
  modalCancelText: { color: '#555', fontWeight: 'bold' },
  modalSaveBtn: { flex: 1, padding: 13, borderRadius: 8, backgroundColor: '#0288D1', alignItems: 'center' },
  modalSaveText: { color: '#FFFFFF', fontWeight: 'bold' },

  postThumbWrap: { width: 78, height: 78, marginRight: 8 },
  postThumb: { width: 78, height: 78, borderRadius: 8, backgroundColor: '#EEE' },
  postThumbNum: { position: 'absolute', left: 4, bottom: 4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  postThumbNumText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  postThumbDel: { position: 'absolute', top: 3, right: 3, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  feedDotsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 20 },
  feedDot: { borderRadius: 5, marginHorizontal: 2.5 },
  writePreviewImg: { width: '100%', height: 220, borderRadius: 8, backgroundColor: '#F5F5F5' },
  removePhotoBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', marginTop: 6, padding: 6, backgroundColor: '#EEE', borderRadius: 4 },
  aiSuggestBtn: { padding: 11, borderRadius: 8, backgroundColor: '#F3E8FF', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  aiSuggestBtnText: { color: '#6D28D9', fontWeight: 'bold', fontSize: 14 },
  aiErrorText: { color: '#B91C1C', fontSize: 12, marginBottom: 8, textAlign: 'center' },
  aiSuggestItem: { padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#DDD6FE', backgroundColor: '#FAF5FF', marginBottom: 6 },
  aiSuggestItemText: { color: '#3B0764', fontSize: 13, lineHeight: 19 },
  attachPhotoBtn: { flexDirection: 'row', gap: 6, padding: 14, borderRadius: 8, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DDD' },
});