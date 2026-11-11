# REA_NOTES.md

## 사용한 REA 도구와 호출 대상
- `analyze_javascript_application` — 대상: `extracted\build\desktop-ui-build`, `source_paths`로 `7264`, `233`, `2416` 청크 3개만 선택(합계 약 93KB), `detail: summary`, `integrity_policy: record-and-continue`. 1회 호출, 성공.
- 호출 기록 파일: `C:\dd-clone\evidence\rea-calls.md`
- 이전 실행(근거로만 언급, 이번에 읽지 않음): `evidence\main-summary.json` — main.rend.js를 힙 4096MiB, 15분 한도로 분석하다 `provider_timeout`.

## 한계와 실패, 우회, 영향
| 한계/실패 | 우회 | 분석 결과에 준 영향 |
|---|---|---|
| 네이티브 모듈(conpty.node 등) 무결성 불일치 | `integrity_policy: record-and-continue`로 관측 바이트를 untrusted로 기록하고 진행 | 그래프 coverage가 partial로 표시됨. 해당 모듈 내용은 신뢰 불가로 취급. 이번 호출에서는 불일치가 새로 보고되지 않았음 |
| main.rend.js 힙 1024MiB 초과 → 4096MiB로 올렸으나 15분 타임아웃 | 이번 세션은 main.rend.js를 REA에 다시 넣지 않고 Grep으로 키워드 주변만 읽음 | main의 의미 그래프(라우트·관계)는 없음. 라우트/IPC 호출은 문자열 검색으로만 확인 → 정적 문자열 증거 수준 |
| 다른 번들은 결과 용량 제한으로 의미 분석 미시작 | 작은 청크 3개 + `detail: summary`로 한정하여 성공 | 3/300 파일만 분석(297개는 범위 밖). 전체 모듈 관계는 unknown |
| 라우트/관계 커버리지가 비어 있음 | 라우트는 Grep(`/dashboard/...` 문자열)으로 대체 | 라우트 목록은 "문자열이 번들에 존재"만 증명하며 도달 가능성은 미증명 |
| `--view` 오류 | **도구 한계가 아니라 내 인자 오사용.** `--view`는 JSON 객체를 받아야 하는데 이름(문자열)을 넣었음. 올바른 형식은 `{"kind":"summary"}` 같은 JSON | 분석 결과에 영향 없음. 도구 결함으로 보고하지 않음 |

## 2차 조사 (REA 미사용)
- preload(`desktop-ui-preload.js`)와 `entry-cli.main.js`는 REA가 아니라 Grep 키워드 주변 읽기로만 확인했다(통째로 읽지 않음). 정적 문자열 증거 수준이며 실행 관찰은 아님.

## 관찰
- 렌더러 청크만 분석했으므로 Electron 항목(preload, contextBridge, IPC handler)이 0건. 이는 렌더러에 없다는 뜻이고 앱에 없다는 뜻이 아님.
- IPC 계약은 렌더러의 `desktopIpcClient.<네임스페이스>.<메서드>` 호출로 복원했음(ANALYSIS.md 참조). 정의 쪽(preload/main)은 확인 못 함.
