{
  "expo": {
    "name": "내 스토리",
    "slug": "my-story-app",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./icon.png",
    "newArchEnabled": false,
    "android": {
      "package": "com.anoldking.mystory",
      "adaptiveIcon": {
        "foregroundImage": "./icon.png",
        "backgroundColor": "#283663"
      }
    },
    "plugins": [
      [
        "expo-image-picker",
        {
          "photosPermission": "스토리에 사진을 올리기 위해 갤러리 접근 권한이 필요합니다."
        }
      ]
    ]
  }
}
