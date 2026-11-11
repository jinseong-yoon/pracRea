# REA 호출 기록 (이번 세션)

| 도구 | 대상 | 옵션 | 결과 |
|---|---|---|---|
| analyze_javascript_application | desktop-ui-build (source_paths: 7264, 233, 2416 .bundle.rend.js) | detail=summary, integrity_policy=record-and-continue, max_heap_mb=1024, timeout 120s | 성공. parent evidence ev_7286ec52...9e24, 요약 evidence ev_ce331641...0092 |

요약: 3개 파일 파싱 완료(AST 노드 16,293), 모듈 30개, 297개 파일은 범위 밖(unknown).
Electron 관련 카운트는 모두 0 (preload/contextBridge/IPC 핸들러 0건). 렌더러 청크만 넣었으므로 정상이며,
"IPC가 없다"가 아니라 "이 입력에는 main/preload가 없다"는 뜻.
main.rend.js는 이번 세션에서 REA에 넣지 않음 (이전 4096MiB/15분 타임아웃 기록 존재).
