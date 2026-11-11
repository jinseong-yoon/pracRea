# DEVIATIONS.md — 원본과 다르게 구현한 부분

원본 = Docker Desktop 4.55.0 대시보드 분석 결과(ANALYSIS.md). 이 앱(BoxDesk)은 동작과 구조만 참고해 새로 작성했고 원본 코드·로고·아이콘은 쓰지 않았다.
"Docker 엔진 위임"으로 표시한 것은 dockerode가 엔진 API를 호출하는 부분이며, 앱 자체 로직이 아니다.

| 항목 | 원본 방식 | 내 방식 | 이유 |
|---|---|---|---|
| 설정 저장 | 메인이 별도 백엔드(`desktopBackendsClient.app.getGroupedSettings/updateSettings`)에 위임. 파일 위치는 확인 못 함 | 로컬 JSON 파일(`<userData>/settings.json`)에 직접 저장. 인터페이스(`getSettings()`/`updateSettings(부분 객체)`, 항목마다 `{value}`)는 동일 | 별도 백엔드를 만들 이유가 없음. 요청 사항 |
| 엔진 연동 | 렌더러는 `containers.dockerListContainers` 등 IPC만 호출. 엔진과 실제 통신 방식은 확인 못 함(stats만 docker CLI 실행으로 확인) | 메인이 **dockerode**로 엔진 API 호출(목록, 시작/중지/삭제, 이미지, 볼륨, 로그, exec, pull, 이벤트). **엔진 위임 부분** | 요청 사항. 원본 내부 통신은 못 봤으므로 같다고 주장하지 않음 |
| stats 계산 | 메인이 `docker stats --all --no-trunc --no-stream --format {{json .}}` 를 10초마다 실행(타임아웃 5초)하고 문자열 파싱 | 같은 방식(`--format json`). 차이: 주기를 설정(`statsIntervalSeconds`, 2~300초)으로 바꿀 수 있음. 정지 컨테이너(0B/0B, PIDs 0)는 샘플에서 제외. 합계는 CPU%, 메모리 사용/한도 | 원본 동작 재현. 주기 설정은 편의 |
| 필요 조건 | docker CLI 사용 | `docker` CLI가 PATH에 있어야 stats 동작. 없으면 `ERROR_STATS` → 목록에 "stats unavailable" 표시, 나머지는 정상 | 원본과 같은 제약 |
| IPC 구조 | preload가 `desktopIpcClient` 노출. 호출 종류 5가지(simpleFunction, ImmediateVoid, persistentStream, onDemandStream, 양방향 채널). 채널명 `<이름>__wrapped`/`__unwrapped`, rxjs 사용 | 같은 패턴을 manifest 한 곳에서 생성: `invoke("<이름>__wrapped")`→`{result,error}` 풀기, 에러면 throw. 스트림은 모두 MessageChannel 방식(on-demand). `__unwrapped`, persistentStream(ipcRenderer.on 구독, 3회 재시도), ImmediateVoid는 만들지 않음. rxjs 대신 `{subscribe(observer)}` 최소 인터페이스 | 필요한 것만 구현. contextBridge로 포트를 직접 못 넘기므로 구독 객체를 노출 |
| 이벤트 스트림 | `engine.dockerStreamEvents` | 같은 이름. 엔진 이벤트 중 container 이벤트만 받아 250ms 디바운스 후 목록 재조회 | 실시간 갱신 요구사항 |
| compose 그룹핑 | 라벨 `com.docker.compose.project`로 프로젝트 판정. 그룹핑 위치는 확인 못 함 | 렌더러(`lib/rows.ts`)에서 라벨로 묶고 자식 합산(CPU, 메모리, I/O, PIDs). 프로젝트 행 접기/펼치기 | 관찰 동작 재현 |
| compose 일괄 동작 | `composeBulkAction` IPC(내부 방식 확인 못 함) | 프로젝트 행의 시작/중지/재시작/삭제는 자식 컨테이너 각각에 엔진 호출(`containersBulkAction`). compose CLI는 쓰지 않음 | compose 파일 없이 라벨만으로 동작. 의존성 감소 |
| 로그 | `openEnhancedContainerLogsStream`(컨테이너 단위, compose 앱 단위 모두) | 컨테이너 단위만. 엔진 로그 follow(`timestamps`)를 줄 단위로 나눠 `{content, service, timestamp, stream}`. 서비스 색상은 이름 해시. 최근 N줄(`logTailLines`) 후 이어서 표시. "Clear"는 `showLogsSince`만 바꿈(원본과 동일) | 프로젝트 합쳐보기는 범위 밖 |
| Exec 터미널 | 터미널 IPC(`terminal.*`), xterm 사용. 메인 쪽 pty 구현은 확인 못 함 | xterm.js + 엔진 TTY exec(hijack 스트림), 입력과 크기 변경을 같은 MessageChannel로 전송. bash가 있으면 bash, 없으면 sh. 탭을 떠나면 `^C`+`exit` 후 연결 종료 | node-pty 불필요(엔진이 pty 제공). 호스트 셸, 외부 터미널, 디버그 샌드박스는 미구현 |
| 컨테이너 그리드 | MUI DataGrid, 그리드 상태/펼침 상태를 키로 저장(저장소 확인 못 함) | 자체 표. 컬럼 표시 토글, 헤더 클릭 정렬, Actions 열 sticky 고정. 컬럼/정렬/필터 상태는 저장하지 않음(redux, 앱 재시작 시 초기화). 기본 숨김: Memory %, Disk, Network, PIDS | 원본 정렬·필터 규칙은 확인 못 함 |
| Last started | 확인 못 함 | 목록 응답에 시작 시각이 없어서 컨테이너마다 inspect(병렬) | 엔진 API 한계. 컨테이너가 많으면 호출 수가 늘어남 |
| 컨테이너 실행 | 라우트 `/containers/create` 존재만 확인 | 이미지, 이름, 포트, 환경변수, 볼륨 폼. 로컬에 이미지가 없으면 자동 pull, 레이어별 진행률을 합산한 퍼센트 표시. 명령어 입력은 없음(이미지 기본 CMD) | 요청 사항 범위 |
| 이미지 | 목록, 삭제, 레이어, 취약점, prune 등 | 태그별 한 행(태그 없으면 `<none>`), 사용 중 표시(컨테이너가 그 이미지 ID를 참조), 삭제(해당 태그만), prune(기본: dangling만, 선택: 미사용 전체) | 레이어 보기/Scout 미구현 |
| 볼륨 | 백업/예약 백업/복제/내보내기/가져오기 등 | 목록(크기=엔진 df의 UsageData), 생성, 삭제, prune(엔진 기본값: 미사용 익명 볼륨만) | 나머지는 범위 밖 |
| 테마 | 확인 못 함 | system/light/dark 설정 → `nativeTheme.themeSource` | 설정 화면 예시용 |
| 미구현 화면 | Files, Debug, Kubernetes, Builds, Extensions, Docker Hub, Models, MCP, Cloud 등 | 없음 | 요청 범위 밖 |
| 이름/아이콘 | Docker 로고 | "BoxDesk", 직접 그린 아이콘(`scripts/make-icon.mjs`가 PNG 생성, 사이드바 SVG는 인라인) | 요청 사항 |
| Electron 설정 | 확인 못 함 | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`(preload가 ipcRenderer·MessageChannel 사용) | 템플릿 기본값 유지 |
