# ANALYSIS.md — Docker Desktop 4.55.0 대시보드 (UI 번들) 동작 분석

범위: `extracted\build\desktop-ui-build` (렌더러 번들)만 검색. 원본 코드는 복사하지 않고 요약했다.
표기: **[확인]** 번들 문자열로 직접 관찰, **[추측]** 관찰에서 추론, **[확인 못 함]** 증거 없음.
증거 약어: M=main.rend.js, 숫자=해당 `N.bundle.rend.js`.

## 1. 화면/라우트 목록
근거: `/dashboard/...` 문자열을 전체 번들에서 Grep. [확인] 문자열 존재 / [추측] 실제 도달 가능 여부.

| 영역 | 경로 |
|---|---|
| 개요 | `/dashboard/overview` |
| 컨테이너 | `/dashboard/containers`, `/dashboard/containers/create`, `/dashboard/containers/<id>/...` |
| 컨테이너 상세 탭 | logs, inspect, stats, files, exec, terminal, debug (탭 키 문자열 존재: logs 6, inspect 4, stats 2, files 2, exec 15, terminal 7, debug 25회). "bind-mounts" 탭은 검색에 안 잡힘 |
| Compose 앱 | `/dashboard/docker-compose/`, `/dashboard/apps/` (앱 상세, 앱 단위 로그) |
| 이미지 | `/dashboard/images`, `/images/local`, `/images/local/details`, `/images/hub`, `/images/:tab` |
| 볼륨 | `/dashboard/volumes`, `/dashboard/volumes/<name>` |
| 네트워크 | `/dashboard/networks`, `/networks/create`, `/networks/<id>` |
| 빌드 | `/dashboard/build`, `/build/:tab`, `/build/buildHistory`, `/build/<id>` |
| 확장 | `/dashboard/extensions/`, `/dashboard/marketplace` (browse, manage, `:tab`) |
| Kubernetes | `/dashboard/kubernetes` |
| 설정 | general, resources(file-sharing, network, proxies, wsl-integration, advanced/wsl, advanced/non-wsl, `:tab`), kubernetes, builders, extensions, features, notifications, update, install, daemon, cloud, ai |
| 기타 | docker-hub(search, profile, image, stack), docker-scout, models(local/hub), mcp(servers, catalog, profiles, clients, oauth), agents, docker-ai, docker-dev-cloud, global-search, login, support, troubleshoot, welcome-survey, experimental |

## 2. 화면별 UI 구성과 사용자 동작
(확인된 범위만. 나머지는 [확인 못 함].)
- **컨테이너 목록 (M, `headerName` Grep)** [확인]: 컬럼 Name, Image, Port(s), CPU (%), Memory usage/limit, Memory (%), Disk read/write, Network I/O, PIDS, Last started, Actions. 기본 숨김: memoryUsageBytes, memoryPercentage, diskReadWrite, networkIO, pids. Actions 열은 오른쪽 고정. 그리드 상태와 펼친 행은 `container-grid-redesign-state`, `container-grid-expanded-rows` 키로 저장(저장 매체는 확인 못 함).
- **행 구조** [확인]: compose 프로젝트 행(자식 컨테이너를 펼침)과 단독 컨테이너 행이 섞인 트리형 그리드. 프로젝트 행의 CPU·메모리는 자식 합산.
- **일괄 동작** [확인]: `containersBulkAction`, `composeBulkAction` IPC 존재 → 체크박스 선택 후 시작/중지/삭제 등. 정확한 동작 목록은 [확인 못 함].
- **컨테이너 상세** [확인]: Logs(스트림 뷰어, "clear"는 `setShowLogsSince`로 그 시각 이후만 표시), Inspect, Stats(CPU·메모리·디스크·네트워크 라인 차트), Files(`containerFiles`, `containerFilesDelete`, 복사 `containerCopyToHost`/`FromHost`), Exec/Terminal(내장 터미널, 외부 터미널 열기), Debug(샌드박스).
- **이미지**: 컬럼 Name/Tag, Image ID, Created, Size, Actions 등 [확인 일부]. 동작: 삭제, 인스펙트, 레이어 보기, prune.
- **볼륨**: 목록(용량 포함 `listWithSizes`), 생성, 삭제, 비우기, 복제, 백업/예약 백업, 내보내기·가져오기(파일/이미지/레지스트리), prune [확인: IPC 이름].
- **네트워크**: 목록, 생성, 삭제, 컨테이너 연결/해제. 컬럼에 Network name, MAC Address, IPv6 subnet/gateway [확인].
- **필터/정렬/검색 UI 세부(컨테이너·이미지)**: [확인 못 함]. 검색어(`searchQuery`) 상태는 Docker Hub 쪽만 확인.

## 3. 기능 분류
### A. Docker Engine(또는 백엔드)에 위임 — 렌더러가 `desktopIpcClient.*` 로 호출 [확인]
| 영역 | IPC 호출 이름 |
|---|---|
| containers | dockerListContainers, dockerInspectContainer, dockerRunContainer, dockerStart/Stop/Restart/Pause/Unpause/RemoveContainer, dockerPruneContainers, dockerDiffContainer, dockerGet/Put/InfoArchiveContainer, containerExec, containerFiles(Delete), containerCopy*, containerCopyProcesses, containerDebug*, openContainerLogsStream, openEnhancedContainerLogsStream, generateDockerRun |
| images | dockerListImages, dockerInspectImage, dockerRemoveImage, dockerGetImageLayers, dockerPruneImages, imageFiles, indexImage |
| volumes | list, listWithSizes, inspect, create, remove, prune, empty, clone, contents, backup/export/import 계열 |
| networks | createNetwork, removeNetwork, connectContainer, disconnectContainer |
| 기타 | engine.dockerStreamEvents, systemResources.dockerDf, systemResources.openStatsStream, contexts.dockerSetContext, build.buildBackend* (빌더 조회·삭제), compose.readComposeFile 등 |

주의: 이름이 `docker*`인 것은 엔진 API 호출을 감싼 것으로 [추측]. 실제 HTTP 경로(`/containers/json` 등)는 UI 번들에 거의 없음(위 경로 Grep 결과 청크당 1건 수준이며 대부분 무관한 문자열). 엔진과의 실제 통신은 메인/백엔드 쪽 [확인 못 함].

### B. 대시보드 자체 로직
1. **stats 퍼센트 계산**: **UI에서는 계산하지 않음** [확인]. `cpu_stats`, `precpu_stats`, `memory_stats` 0건이고 `system_cpu_usage`·`online_cpus`도 0건. UI는 `openStatsStream()` 구독으로 `INITIAL_STATS`(컨테이너별 초기값 + 합계), `CHUNK_STATS`(증분), `ERROR_STATS`를 받고, 각 항목에 이미 `cpuPercentage`, `memoryPercentage`, `memoryUsageBytes`, `memoryLimitBytes`, `blockIO*`, `networkIO*`, `pids`가 들어 있음. **계산 위치 [확인, build\entry-cli.main.js]: 메인 프로세스가 약 10초 간격으로 `docker stats --all --no-trunc --no-stream --format json` CLI를 실행(타임아웃 5초)하고, 출력의 `CPUPerc`·`MemPerc` 문자열(예: "1.5%")을 숫자로 파싱할 뿐이다. 즉 앱은 cpu_delta/system_delta를 직접 계산하지 않고 Docker CLI의 결과를 쓴다.** `MemUsage`, `BlockIO`, `NetIO`는 "a / b" 문자열을 분리해 바이트로 변환, `PIDs`는 콤마 분리. 메인은 컨테이너별 시계열(보관 기본 1시간)과 전체 합계를 유지하며 `INITIAL_STATS`(최초), `CHUNK_STATS`(10초마다), `ERROR_STATS` 메시지로 렌더러에 푼다. 합계는 CPU%, 메모리 사용·한도 합. 단위 변환 세부 규칙은 확인 못 함. UI가 하는 일: 프로젝트 행 합산(소수 처리 함수 포함), 시계열 누적 후 차트 표시, CPU가 `80% × CPU 수` 초과 시 경고색 [확인] (M, 2416 등).
2. **compose 그룹핑**: 컨테이너의 `com.docker.compose.project`, `.service`, `.working_dir`, `.config_files`, `.environment_file` 라벨과 `io.kubernetes.pod.name`, `com.docker.stack.namespace` 라벨로 origin(compose/kubernetes)·project·service 판정 [확인] (M:184). 프로젝트 행 CPU/메모리는 자식 합산 [확인]. WSL 배포판은 `desktop.docker.io/wsl-distro` 라벨 [확인]. 그룹핑 자체를 UI가 하는지 백엔드가 `app` 객체로 주는지: 렌더러에 `app.labels`/`app.containers`가 있으므로 앱 객체 조립이 어디서 일어나는지는 **확인 못 함** [추측: 렌더러 쪽일 가능성].
3. **로그 처리**: 컨테이너/앱 로그는 `openEnhancedContainerLogsStream`(컨테이너는 `{containerId}`, 앱은 `{appId, workingDir}`)의 스트림이며, 각 이벤트는 `line`, `service`, `timestamp`를 가짐. 렌더러는 이를 `{content, service, timestamp, type:"run"}`로 변환 [확인] (1, 9955 인접 청크). 서비스별 색상 팔레트, 서비스명 숨김(컨테이너 1개일 때), 복사 오류 알림, "Clear"는 서버 삭제가 아닌 `showLogsSince` 상태 [확인]. 타임스탬프/스트림(stdout/stderr) 디먹싱은 [확인 못 함].
4. **목록 필터/정렬**: 컨테이너·이미지 [확인 못 함]. 그리드 컬럼 정렬 가능 여부는 컬럼마다 `sortable` 플래그 (액션 열은 false) [확인].
5. **설정 저장 방식**: 렌더러는 `desktopIpcClient.getSettings()`로 읽고 `updateSettings(부분 객체)`로 저장, 반환된 전체 설정으로 redux 상태 갱신 [확인]. 설정 구조는 `{desktop:{<키>:{value}}}`, `vm.resources.diskSizeMiB.value`, `extensions.showSystemContainers` 형태(항목마다 `value` 래퍼). 디스크 크기 축소 검증 등 일부 검증이 UI에 있음 [확인]. **저장 위치 [확인, entry-cli.main.js]: 메인 프로세스는 설정을 직접 저장하지 않고 별도 백엔드 클라이언트(`desktopBackendsClient.app.getGroupedSettings()` / `updateSettings(...)` / `doSettingsChangesNeedRestart(...)`)에 위임한다. `getSettings`는 백엔드의 묶음 설정을 받아 redux에 반영 후 반환하고, `updateSettings`도 백엔드가 돌려준 전체 설정을 반환한다.** 백엔드 프로세스와 통신 방식, 실제 설정 파일 경로·형식은 확인 못 함. electron-store 라이브러리 코드는 entry-cli에 번들돼 있고(기본 이름 `config`) 쓰임은 확인 못 함 — 설정 저장용이라는 증거 없음.
6. **IPC 구조**: 렌더러는 전역 `desktopIpcClient.<네임스페이스>.<메서드>`를 호출 [확인]. 요청-응답 외에 구독형(`.subscribe`/`.pipe`) 스트림 API(stats, logs, events, notifications, build 스트림)가 있음 [확인]. 네임스페이스: containers, images, volumes, networks, build, engine, systemResources, terminal, extensions, compose, fileSystem, dialogs, navigation, window, notifications, auth, analytics 등 약 40개. **preload 구조 [확인, build\desktop-ui-preload.js]**: `contextBridge.exposeInMainWorld`로 전역 `desktopIpcClient`(와 `webUtils.getPathForFile`)를 노출한다. 개별 API는 이름 문자열 `네임스페이스.메서드`로 만들어지고 종류가 5가지다. (a) simpleFunction(약 267개): `ipcRenderer.invoke("<이름>__wrapped", ...)`, 결과는 `{result, error}`로 풀어 에러면 throw, `.unwrapped`는 `__unwrapped` 채널. (b) simpleFunctionImmediateVoid(18): 응답을 기다리지 않는 호출. (c) persistentStream(13): 채널 이름으로 `ipcRenderer.on` 구독, 실패 시 500ms 간격 3회 재시도. (d) onDemandStream(34): `MessageChannel`을 만들어 한쪽 포트를 메인에 `postMessage`로 넘기고 반대쪽을 스트림으로 읽음(stats, logs 등이 여기). (e) 양방향 채널(터미널 등 추정). 채널명은 고정 문자열 목록이 아니라 API 이름에서 규칙적으로 만들어진다. 메인의 API 맵은 entry-cli.main.js에 있고 이름→종류 표(`"systemResources.openStatsStream":"onDemandStream"` 형식)가 존재. 메인 쪽 `ipcMain.handle` 등록은 minify되어 리터럴로 안 잡힘 → 등록 방식은 확인 못 함(`ipcMain.on("child-pid")` 같은 개별 채널만 확인).
7. **터미널**: xterm.js가 M에 번들됨 [확인]. `terminal.spawnHost/spawnContainerDebug/connect/getHostShells/getTerminals/exit/setTitle` IPC [확인]. node-pty/conpty는 UI에 없고 메인/워커 쪽 [추측] (`conpty_console_list_agent.js` 파일이 build 최상위에 존재함은 디렉터리 목록으로만 확인).
8. **상태 관리**: redux (`reduxStore`, `subscribeToUpstreamActions`) [확인]. 일부 UI 상태는 영속 저장 키 사용 (저장소 종류 확인 못 함).

## 4. 근거 요약 (키워드 → 파일)
| 결론 | 키워드 | 파일 |
|---|---|---|
| IPC 호출 목록 | `desktopIpcClient.` | 전체 (Grep 집계, 호출 약 330종) |
| stats는 계산이 아닌 수신 | `openStatsStream`, `cpuPercentage` | M, 2416, 246, 7709, 839 |
| compose 라벨 판정 | `com.docker.compose.project` | M(184행), 1, 9521, 9955, 2416 |
| 로그 스트림 | `openEnhancedContainerLogsStream` | 1(앱 로그), 컨테이너 로그 청크 |
| 설정 | `getSettings`, `updateSettings` | M |
| 컬럼 | `headerName:` | M 외 |
| 라우트 | `/dashboard/` | 전체 |
| xterm | `xterm` | M(75행), 5598 |
| REA 요약 | 3개 청크, Electron 항목 0 | evidence\rea-calls.md |

## 5. Unknowns (확인 못 함)
- (해소) 퍼센트: 메인이 docker CLI 출력을 파싱. 남은 것: CLI 문자열의 단위 변환 규칙.
- 메인의 ipcMain 등록 코드, 백엔드 프로세스와의 통신 방식, 설정 파일 경로·형식, 엔진 접속 방식(npipe 등).
- 컨테이너·이미지 목록의 필터/정렬 규칙, 일괄 동작 종류, 이미지·네트워크 컬럼 전체.
- 로그의 stdout/stderr 구분, 타임스탬프 파싱, 버퍼 한도.
- Kubernetes·확장 화면 상세. 확장은 별도 `extension-preload.js`가 있어 보임 [추측].
- 번들 361개 중 3개만 REA 분석, main.rend.js는 REA 분석 실패(타임아웃)로 의미 그래프 없음.
- 클론 구현 시 참고(설계 제안, 원본 관찰 아님): 원본이 `docker stats` CLI를 폴링하므로 같은 방식이면 퍼센트 계산을 따로 구현할 필요가 없다. Engine API를 직접 쓰려면 Docker CLI 방식으로 새로 계산해야 한다.
