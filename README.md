# pracRea
# BoxDesk: Docker Desktop 클론 (REA 과제)

한국공학대학교 과제용 프로젝트입니다. [REA(Reverse Engineer Anything)](https://github.com/morluto/rea)로 Docker Desktop 4.55.0의 UI 번들을 분석하고, 그 결과를 바탕으로 직접 구현한 클론 앱 **BoxDesk**입니다.

> 원본 번들(`app.asar`)과 추출 파일은 저장소에 포함하지 않았습니다. 분석 결과만 문서로 남겼고, 코드는 모두 직접 작성했습니다.

## 구성

| 경로 | 내용 |
|---|---|
| `app/` | BoxDesk 소스 (Electron + React + TypeScript) |
| `ANALYSIS.md` | 원본 분석 결과. 확인 / 추측 / 확인 못 함으로 구분 |
| `DEVIATIONS.md` | 원본과 다르게 구현한 부분, 미구현 범위 |
| `REA_NOTES.md` | REA 사용 방법과 겪은 한계 |
| `evidence/` | REA 호출 기록 |

## 원본 대비 구현 범위

구현:
- 컨테이너 목록 (Compose 프로젝트별 그룹), 시작 / 중지 / 삭제
- CPU, 메모리 등 실시간 stats (`docker stats` 폴링 방식)
- 로그, Inspect, Exec 터미널
- 컨테이너 실행 폼 (이미지 pull 진행률 포함)
- 이미지, 볼륨 목록 (일부 기능)
- 설정, 테마

미구현: Files, Debug, Kubernetes, Builds, Extensions, Docker Hub, Models, MCP, Cloud 화면.
자세한 차이는 `DEVIATIONS.md`를 참고하세요.

## 실행

요구 사항: Node.js, 실행 중인 Docker 엔진, PATH에 있는 `docker` CLI

```bash
cd app
npm install
npm run dev        # 개발 실행
npm run build      # 빌드
npm run test:lib   # 단위 테스트
npm run test:e2e   # e2e (bxt-* 임시 컨테이너 사용)
```

## 개발 환경

- OS: Windows
- 원본: Docker Desktop 4.55.0
- 분석 도구: REA 6.8.0
- AI: Claude Code, sonnet 5.5
- Node.js: v26.13.0

## 데모 영상

[ 영상 링크 ]

## 참고

- Electron `contextIsolation: true`, `nodeIntegration: false`
- 앱 이름과 아이콘은 원본과 구분하기 위해 직접 만든 것입니다.
