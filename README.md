# 오늘경제 (Today's Economy) 📈

매일경제 RSS 피드를 크롤링하여 오늘 가장 중요한 뉴스 1개를 선정하고, 어려운 경제 용어를 친절하게 설명하는 **인스타그램 카드 뉴스 이미지(세로형 1080x1920)**와 **게시글 본문 멘트**를 생성하여 슬랙으로 매일 전송해주는 자동화 시스템입니다.

- **텍스트 모델**: Groq API의 **openai/gpt-oss-120b** 모델을 사용하여 정밀한 뉴스 분석, 필터링 및 요약을 무료로 제공합니다.
- **이미지 모델**: **Pollinations.ai** API (`POLLINATIONS_API_KEY` 연동)를 사용하여 3D 클레이 스타일의 고품질 일러스트를 무료로 생성합니다.
- **이미지 렌더링**: **Playwright**를 활용하여 HTML/CSS로 디자인된 세련된 Glassmorphism 테마의 1080x1920 고화질 이미지를 렌더링합니다.
- **실행 환경**: **GitHub Actions Cron Job**을 사용하여 매일 자동 실행되며, 중복 뉴스 필터링을 위한 히스토리 정보를 Git에 자동으로 업데이트합니다. (운영비 월 **0원**)

---

## 🛠️ 기능 아키텍처

1. **뉴스 수집**: 매일경제 경제 뉴스 RSS 피드 파싱.
2. **뉴스 선정**: `history.json`에 저장된 최근 7일 내의 뉴스 주제와 겹치지 않고 파급력이 가장 큰 뉴스 1개를 openai/gpt-oss-120b 모델이 분석 및 선정.
3. **콘텐츠 생성**: 어려운 단어를 괄호로 쉽게 풀이한 카드 원고와 이미지 프롬프트(영문), 인스타그램 게시물용 멘트 생성.
4. **이미지 생성 & 렌더링**: Pollinations.ai API를 통해 AI 일러스트를 받고, HTML 템플릿에 로드하여 Playwright가 스크린샷 캡처 (`slide_1.png`, `slide_2.png`, `slide_3.png` 생성).
5. **슬랙 전송**: 슬랙 봇을 통해 카드 뉴스 3장과 인스타그램 멘트를 지정한 채널에 업로드.
6. **히스토리 저장**: 선정된 뉴스 제목을 `history.json`에 기록하고 7일이 지난 기록은 정리.

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
GROQ_API_KEY=gsk_...
HF_TOKEN=hf_...
SLACK_BOT_TOKEN=xoxb-...
SLACK_CHANNEL_ID=C0...
```

### 3. 스크립트 실행
```bash
npm start
```
실행이 완료되면 지정된 슬랙 채널로 카드 이미지 3장과 인스타그램 게시용 본문이 전송되며, `history.json` 파일이 업데이트됩니다.

---

## 🚀 GitHub Actions 자동화 배포 가이드

매일 아침 컴퓨터를 켜지 않아도 지정된 시간에 슬랙으로 카드 뉴스가 배달되도록 설정합니다.

1. **GitHub 리포지토리 생성**: 이 프로젝트의 모든 파일(package.json, src/, .github/ 등)을 본인의 GitHub public/private 저장소에 올립니다.
2. **Secrets 등록**: GitHub 저장소 페이지의 **Settings** ➡️ **Secrets and variables** ➡️ **Actions** ➡️ **New repository secret**을 클릭하여 아래 4개의 Secret을 각각 등록합니다:
   - `GROQ_API_KEY`: Groq API Key (`gsk_...`)
   - `HF_TOKEN`: Hugging Face Token (`hf_...`)
   - `SLACK_BOT_TOKEN`: Slack Bot Token (`xoxb-...`)
   - `SLACK_CHANNEL_ID`: 슬랙 채널 ID (`C0...`)
3. **동작 확인**:
   - GitHub 저장소의 **Actions** 탭으로 이동합니다.
   - 왼쪽 메뉴에서 **Daily Economic Card News Creator** 워크플로우를 선택합니다.
   - 우측의 **Run workflow** 버튼을 눌러 수동으로 실행 테스트를 진행할 수 있습니다.
   - 테스트 성공 시 슬랙으로 즉시 카드 뉴스가 도착하며, 깃허브 저장소의 `history.json` 파일이 자동으로 업데이트(Commit & Push)되는 것을 확인할 수 있습니다.
   - 이후에는 크론잡에 의해 **매일 한국 시간 오전 8시**에 자동으로 실행됩니다.
