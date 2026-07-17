# 오늘경제 (Today's Economy) 📈

`@today.econ`은 “오늘 가장 중요한 경제 뉴스 하나를, 내 돈에 미치는 영향과 지금 확인할 것까지 1분 안에 설명한다”는 약속으로 운영되는 자동 경제 미디어입니다. 매일경제 RSS에서 기사를 고르고, 근거가 확인된 4장 카드와 저장 가능한 캡션을 만든 뒤 Slack 전달과 Instagram 게시까지 GitHub Actions에서 수행합니다.

- **편집**: 대출·주거·소득·세금·투자 영향, 실행 가능성, 시의성, 저장 가치를 기준으로 15개 후보를 평가하고 최근 7일 중복을 피합니다.
- **콘텐츠**: 오늘의 돈 신호 고정 포맷으로 표지 훅 → 제도 변화와 숫자 → 실제 독자 상황별 영향 → 정책 제한·3단계 확인 순서로 이어지는 4장 구조입니다.
- **품질 게이트와 복구**: 문장 길이, 카드 내 중복, 하이라이트, 낙인·과장 표현, stats/policy 숫자의 기사 근거, 편집자 해석, 저장 가능한 캡션을 검사합니다. LLM 수정 2회 뒤에도 구조적 오류가 남으면 기사 본문 기반 안전 원고로 복구하고, 그래도 실패한 이유는 `data/pipeline-state.json`에 남깁니다.
- **디자인**: Instagram 피드 캐러셀 권장 비율인 4:5(1080×1350), Pretendard, 주제별 골드·블루·퍼플 에디토리얼 색상과 카드 진행 번호를 사용합니다. 민감한 경제 기사에는 관련 없는 인물 AI 이미지 대신 대출·주거·투자 메커니즘을 보여주는 결정론적 배경을 사용합니다.
- **자동화**: 같은 Actions 실행 안에서 1회 실패하면 저장된 실패 힌트를 반영해 자동 재시도합니다. 임시 GitHub prerelease에 이미지를 올려 Instagram이 읽은 뒤 72시간 후 삭제합니다. 이미지 바이너리는 저장소 커밋에 남기지 않습니다.
- **성장 측정**: 게시 후 24시간·72시간·7일에 도달, 조회, 좋아요, 댓글, 저장, 공유, 참여율을 수집하고 Slack 주간 리포트로 다음 실험을 제안합니다.
- **대원칙**: 중요한 경제 소식을 놓치지 않게 하고, 읽는 즉시 이해되게 합니다. 세부 편집 규칙은 [`docs/today-econ-editorial-principles.md`](docs/today-econ-editorial-principles.md)에 고정해 두었습니다.

---

## 🛠️ 기능 아키텍처

1. **뉴스 수집**: 매일경제 경제 RSS를 최대 15개 후보로 정제합니다.
2. **뉴스 선정**: Groq의 `llama-3.3-70b-versatile`을 사용하고 실패 시 `llama-3.1-8b-instant`로 재시도합니다.
3. **원고 생성**: NFC 정규화와 JSON 모드로 카드 원고·짧은 훅형 캡션·성과 분류 메타데이터를 만듭니다.
4. **렌더링**: 주제별 결정론적 금융 배경과 Playwright로 `slide_1.png`~`slide_4.png`를 생성합니다.
5. **게시**: 카드 4장을 오디오가 포함된 9:16 릴스로 합성해 GitHub prerelease URL에서 Instagram Reels 컨테이너로 게시합니다. 이어 같은 영상을 독립 Instagram Story로 게시하며, 스토리는 24시간 뒤 자동 삭제됩니다. 릴스 장애 시에는 캐러셀을 자동 대체합니다.
6. **알림·기록**: Slack에 카드·캡션·원문·릴스·스토리 상태를 보내고 `history.json`, `data/posts.json`에 내구성 있는 메타데이터만 저장합니다.
7. **측정·정리**: 별도 Actions가 성과 창을 수집하고 72시간이 지난 임시 release를 삭제합니다.

---

## 🔑 API 키 및 슬랙 토큰 발급 가이드

### 1. Groq API Key 발급 (무료)
1. [Groq Console](https://console.groq.com/)에 접속하여 가입합니다.
2. 왼쪽 메뉴에서 **API Keys**를 클릭합니다.
3. **Create API Key** 버튼을 눌러 키를 생성하고 복사합니다 (이름 예: `today-economy-key`).
4. 발급된 키(`gsk_...`)를 안전한 곳에 저장합니다.

### 2. Hugging Face Access Token 발급 (무료)
1. [Hugging Face](https://huggingface.co/)에 가입 및 로그인합니다.
2. 우측 상단 프로필 이미지 클릭 ➡️ **Settings** ➡️ **Access Tokens** 메뉴로 이동합니다.
3. **New token** 버튼을 누릅니다.
4. Token Name을 입력하고, Type을 **Read**로 설정한 후 **Generate a token**을 클릭합니다.
5. 생성된 토큰(`hf_...`)을 복사하여 저장합니다.

### 3. Slack Bot 토큰 및 채널 설정 (무료)
1. [Slack API - Your Apps](https://api.slack.com/apps)에 접속합니다.
2. **Create New App** ➡️ **From scratch**를 선택합니다.
   - App Name: `오늘경제봇` (원하는 이름)
   - Development Slack Workspace: 사용할 워크스페이스 선택
3. 왼쪽 메뉴에서 **OAuth & Permissions**로 이동합니다.
4. 하단의 **Scopes** -> **Bot Token Scopes**에 다음 두 가지 권한을 추가합니다:
   - `chat:write` (메시지 전송 권한)
   - `files:write` (파일/이미지 업로드 권한)
5. 페이지 상단으로 돌아와 **Install to Workspace** 버튼을 클릭하고 허용합니다.
6. 설치 완료 후 생성된 **Bot User OAuth Token** (`xoxb-...`로 시작)을 복사합니다.
7. **슬랙 채널 연동**:
   - 카드 뉴스를 전송받을 슬랙 채널을 새로 생성하거나 기존 채널(예: `#오늘경제`)에 들어갑니다.
   - 채널 대화창에 `@오늘경제봇`을 입력해 **봇을 채널에 초대**합니다 (`이 채널에 초대하기` 클릭).
   - 채널 우클릭 ➡️ **채널 세부정보 보기** ➡️ 맨 하단의 **채널 ID**(`C0...`로 시작)를 복사합니다.

---

## 💻 로컬 실행 방법

### 1. 의존성 설치
```bash
npm install
npx playwright install chromium
```

### 2. 환경 변수 설정
프로젝트 루트 폴더에 `.env` 파일을 생성하고 발급받은 값을 입력합니다:
```env
POLLINATIONS_API_KEY=sk_...
GROQ_API_KEY=gsk_...
HF_TOKEN=hf_...
SLACK_BOT_TOKEN=xoxb-...
SLACK_CHANNEL_ID=C0...
```

### 3. 스크립트 실행
```bash
npm start
```
기본 실행은 Slack 전달만 수행합니다. Instagram 게시까지 로컬에서 시험하려면 `PUBLISH_INSTAGRAM=true`, `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID`, `GITHUB_TOKEN`, `GITHUB_REPOSITORY`를 설정하세요. 실행이 완료되면 Slack에 카드·캡션·원문 링크가 도착합니다.

```bash
npm test
npm run check:instagram
npm run insights
```

---

## 🚀 GitHub Actions 자동화 배포 가이드

매일 아침 컴퓨터를 켜지 않아도 지정된 시간에 슬랙으로 카드 뉴스가 배달되도록 설정합니다.

1. **GitHub 리포지토리 생성**: 이 프로젝트의 모든 파일(package.json, src/, .github/ 등)을 본인의 GitHub public/private 저장소에 올립니다.
2. **Secrets/Variables 등록**: GitHub 저장소의 **Settings → Secrets and variables → Actions**에 다음 값을 등록합니다.
   - `GROQ_API_KEY`: Groq API Key (`gsk_...`)
   - `POLLINATIONS_API_KEY`: 선택값
   - `HF_TOKEN`: Hugging Face Token (`hf_...`)
   - `SLACK_BOT_TOKEN`: Slack Bot Token (`xoxb-...`)
   - `SLACK_CHANNEL_ID`: 슬랙 채널 ID (`C0...`)
   - `INSTAGRAM_ACCESS_TOKEN`: Meta Instagram API setup에서 발급한 토큰
   - `INSTAGRAM_TOKEN_ENCRYPTION_KEY`: 32바이트 base64 키(토큰 회전용)
   - `INSTAGRAM_USER_ID`: Instagram API setup에 표시된 사용자 ID (Actions **Secret** 또는 Variable)
3. **동작 확인**:
   - GitHub 저장소의 **Actions** 탭으로 이동합니다.
   - 왼쪽 메뉴에서 **Daily Economic Card News Creator** 워크플로우를 선택합니다.
   - `Instagram Connection Check`를 먼저 실행해 `@today.econ` 토큰을 게시 없이 확인합니다.
   - `Daily Economic Card News Creator`의 수동 실행은 기본적으로 Slack만 사용합니다. `publish_instagram=true`를 선택하면 실제 게시합니다.
   - 예약 실행은 한국 시간 07:45와 19:45에 생성·게시합니다.
   - `Instagram Growth Measurement`는 6시간마다 24시간·72시간·7일 창을 수집합니다.
   - `Instagram Token Rotation`은 장기 토큰을 갱신해 저장소에는 AES-256-GCM 암호문만 커밋합니다.

## 🔐 보안 원칙

- Instagram 아이디·비밀번호는 코드나 GitHub에 저장하지 않습니다. OAuth 액세스 토큰만 사용합니다.
- 토큰은 로그·Slack·커밋에 출력하지 않습니다.
- GitHub 공개 저장소에는 임시 이미지와 암호화된 토큰 ciphertext만 남고, 복호화 키는 Actions Secret에만 둡니다.
- Meta 앱이 개발 모드인 동안에는 앱 역할에 등록하고 Instagram 테스터 초대를 수락한 `today.econ`만 연결할 수 있습니다.
