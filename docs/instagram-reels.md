# Instagram 릴스 발행 모드

기본 발행 형식은 `INSTAGRAM_FORMAT=reel`입니다.

- 카드 4장을 3초씩 이어 붙여 12초짜리 1080×1920 MP4를 만듭니다.
- 4:5 카드 이미지는 중앙에 선명하게 놓고, 주변은 같은 이미지의 흐린 배경으로 채워 가독성을 유지합니다.
- `INSTAGRAM_AUDIO_FILE`이 지정되면 해당 오디오를 사용합니다. 파일이 없으면 파이프라인이 자체 생성한 저작권 문제 없는 저음량 오디오 베드를 넣습니다.
- 영상과 카드 이미지는 GitHub의 72시간짜리 prerelease에 업로드한 뒤 Instagram이 가져갑니다. 만료된 release는 다음 실행 때 삭제합니다.
- 릴스 생성 또는 발행이 실패하면 `INSTAGRAM_ALLOW_CAROUSEL_FALLBACK=true`일 때 같은 실행의 카드 이미지로 캐러셀을 시도합니다. 이 경우 Slack과 `data/posts.json`에 실제 발행 형식을 기록합니다.

## Actions 환경 변수

```text
INSTAGRAM_FORMAT=reel
INSTAGRAM_ALLOW_CAROUSEL_FALLBACK=true
REEL_DURATION_PER_SLIDE=3
# 선택: 저장소에 존재하는 오디오 파일 경로
INSTAGRAM_AUDIO_FILE=assets/audio/today-econ-bed.m4a
```

Instagram Graph API는 공개 `video_url`을 이용해 릴스 컨테이너를 만들고, 컨테이너가 준비되면 `media_publish`를 호출합니다. Instagram 음악 라이브러리의 특정 곡을 API에서 검색·지정하는 기능은 이 발행 경로에 포함하지 않았으므로, 현재는 원본 오디오 베드 또는 사용자가 제공한 오디오 파일을 영상에 미리 합성합니다.
