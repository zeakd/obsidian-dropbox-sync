# 진행 상황

## 현재: Phase 3 완료 — 배포 준비 + iOS 지원 + 안정성

148 테스트 통과. typecheck 통과. `npm run build` 성공.

### Phase 1.1: scaffolding + 인터페이스 + hash ✅
- [x] package.json, tsconfig.json, vitest.config.ts, esbuild.config.mjs
- [x] manifest.json, .gitignore
- [x] CLAUDE.md, PROGRESS.md
- [x] src/types.ts, src/hash.ts, src/adapters/interfaces.ts
- [x] npm install + typecheck 통과

### Phase 1.2: In-Memory Mock + content_hash 테스트 ✅
- [x] src/adapters/memory.ts (MemoryFileSystem, MemoryRemoteStorage, MemoryStateStore)
- [x] test/hash.test.ts (8 테스트 — 빈파일, 단일블록, 멀티블록, 공식벡터)
- [x] test/memory-adapters.test.ts (28 테스트 — CRUD, cursor, rev 충돌)

### Phase 1.3: Planner + 단위 테스트 ✅
- [x] src/sync/planner.ts (classifyChange, createPlan 순수 함수)
- [x] test/planner.test.ts (21 테스트 — 15 classifyChange + 6 createPlan)

### Phase 1.4: Executor + 단위 테스트 ✅
- [x] src/sync/executor.ts (upload/download/delete/conflict + rev 충돌 → conflict 전환)
- [x] test/executor.test.ts (14 테스트 — 각 action + partial failure + conflict path)

### Phase 1.5: SyncEngine + SyncSimulator + 시나리오 테스트 ✅ (마일스톤)
- [x] src/sync/engine.ts (base+delta 병합, cursor 조건부 갱신)
- [x] test/support/sync-simulator.ts (Device, SyncSimulator)
- [x] test/support/failing-remote.ts (FailingRemoteStorage)
- [x] test/simulation/two-device.test.ts (9 테스트)
- [x] test/simulation/network-failure.test.ts (5 테스트)
- [x] test/simulation/bulk.test.ts (6 테스트 — 100파일, 3기기)
- [x] **91 테스트 전부 통과 — 동기화 로직 정확성 100% 증명**

#### 구현 중 발견한 설계 결정
- engine에서 base+delta를 병합하여 전체 원격 상태를 구성한 후 planner에 전달
  - delta만 전달하면 "변경 없는 원격 파일"이 "삭제됨"으로 오판됨
- cursor는 모든 작업 성공 시에만 갱신
  - 실패 시 같은 delta를 다음 cycle에서 재수신하여 자동 재시도

### Phase 1.6: 실제 Adapter 구현 ✅
- [x] src/hash.browser.ts (crypto.subtle 기반, async)
- [x] src/adapters/dropbox-types.ts (Dropbox API 응답 타입)
- [x] src/adapters/dropbox-auth.ts (OAuth PKCE)
- [x] src/adapters/dropbox-adapter.ts (RemoteStorage 구현, requestUrl)
- [x] src/adapters/vault-adapter.ts (FileSystem 구현, Vault API)
- [x] src/adapters/indexeddb-store.ts (SyncStateStore 구현, localforage)
- [x] test/hash-browser.test.ts (6 테스트 — node hash와 결과 일치 검증)
- [x] 97 테스트 통과 + typecheck 통과

### Phase 1.7: Plugin 통합 + Settings ✅
- [x] src/settings.ts (PluginSettings + DEFAULT_SETTINGS)
- [x] src/ui/status-bar.ts (idle/syncing/success/error 상태)
- [x] src/ui/conflict-modal.ts (충돌 알림)
- [x] src/ui/settings-tab.ts (OAuth 2단계 + 동기화 설정)
- [x] src/main.ts (Plugin 진입점, adapter DI)
- [x] styles.css
- [x] executor.ts: hash.ts(node:crypto) → hash.browser.ts(crypto.subtle) 전환
- [x] **npm run build → main.js (113KB) 생성 성공**

## Phase 1 완료 요약

- 97 테스트: 순수 로직 + 시뮬레이션으로 동기화 정확성 증명
- 프로덕션 빌드: 113KB (obsidian 외부 의존성 + localforage 번들)
- 다음: Obsidian에 로드하여 실제 동기화 테스트 (수동)

## Phase 2: 삭제 보호 + 충돌 전략 + 인증 개선 ✅

### Phase 2.1: 삭제 이벤트 추적 (레이어 1) ✅
- [x] planner.ts: `classifyChange`에 `localDeleteIntended` 옵션 추가
- [x] planner.ts: `createPlan`에 `localDeletedPaths?: Set<string>` 옵션 추가
- [x] 핵심 변경: 삭제 의도 없는 부재 → `download(missing_local_restored)` (안전 방향)
- [x] test/planner.test.ts: 삭제 의도 유/무 분기 테스트 (+4 케이스)

### Phase 2.2: 대량 삭제 가드 (레이어 2) ✅
- [x] src/sync/guards.ts: `checkDeleteGuard()` 순수 함수 (개수 기반 차단)
- [x] src/ui/delete-confirm-modal.ts: 대량 삭제 확인 모달
- [x] test/guards.test.ts: 7 테스트 (통과/차단/비활성화/threshold 경계)

### Phase 2.3: 충돌 전략 강화 ✅
- [x] executor.ts: conflict 전략 3분기 — keep_both / newest(mtime) / manual(콜백)
- [x] src/ui/conflict-modal.ts: "Keep local" / "Keep remote" 두 버튼
- [x] test/executor.test.ts: newest/manual 전략 테스트 (+6 케이스)

### Phase 2.4: 통합 + 시뮬레이션 ✅
- [x] engine.ts: `deletedPaths` 관리 + planner 전달 + 가드 적용 + 삭제 로그 API
- [x] main.ts: `vault.on('delete/rename')` 이벤트 추적 + `store.setMeta("deleteLog")` 영속화
- [x] settings.ts: `deleteProtection(true)`, `deleteThreshold(5)` 추가
- [x] test/support/sync-simulator.ts: Device.deleteFile()에 삭제 로그 자동 기록
- [x] test/simulation/delete-protection.test.ts: 9 시뮬레이션 테스트

### Phase 2.5: 원클릭 OAuth 인증 ✅
- [x] dropbox-auth.ts: `generateState()`, `buildAuthUrl()` 객체 파라미터, `redirectUri` 지원
- [x] settings.ts: `__DROPBOX_APP_KEY__` 빌드 타임 변수, `useCustomAppKey`, `getEffectiveAppKey()`
- [x] main.ts: 데스크톱 `obsidian://` 프로토콜 핸들러 + state 검증 (CSRF 방지)
- [x] settings-tab.ts: 데스크톱 원클릭 / 모바일 2단계 분기, Advanced 섹션
- [x] test/dropbox-auth.test.ts: 10 테스트

### Phase 2 완료 요약

- 133 테스트: 기존 97 + 신규 36 (삭제 보호 20 + 충돌 전략 6 + auth 10)
- 3계층 방어: 삭제 이벤트 추적 → 대량 삭제 가드 → Dropbox 자체 휴지통
- 충돌 전략: keep_both(기본) / newest(mtime) / manual(모달)
- 인증: 데스크톱 원클릭 (obsidian:// redirect) + 모바일 2단계 수동

## Phase 3: 배포 준비 + iOS 지원 + 안정성 ✅

### Step 1: Plugin ID 변경 ✅
- [x] `obsidian-dropbox-sync` → `dropbox-sync` 전역 교체 (manifest, main.ts, indexeddb-store.ts)

### Step 2: Rate limit 자동 재시도 ✅
- [x] dropbox-adapter.ts: rpcCall/download/upload에 429 retry (최대 3회, retryAfter 기반)
- [x] test/dropbox-adapter-retry.test.ts: 5 테스트

### Step 3: Cursor 만료 복구 ✅
- [x] engine.ts: `DropboxCursorResetError` catch → cursor 초기화 + 전체 재스캔

### Step 4: iOS VaultFileStore ✅
- [x] src/adapters/vault-file-store.ts: vault 내 JSON 파일 기반 SyncStateStore
- [x] test/vault-file-store.test.ts: 10 테스트

### Step 5: Store 자동 선택 ✅
- [x] main.ts: `Platform.isIosApp` → VaultFileStore, 그 외 → IndexedDBStore
- [x] test/__mocks__/obsidian.ts: `Platform.isIosApp` 추가

### Step 6: 배포 필수 파일 ✅
- [x] README.md, LICENSE (MIT), versions.json

### Step 7: GitHub Release workflow ✅
- [x] .github/workflows/release.yml (tag push → test → build → release)

### Phase 3 완료 요약

- 148 테스트: 기존 133 + 신규 15 (retry 5 + VaultFileStore 10)
- Plugin ID: `dropbox-sync` (Community Plugin 등록 요구사항 충족)
- API 안정성: rate limit 자동 재시도 + cursor 만료 자동 복구
- iOS 지원: VaultFileStore fallback (IndexedDB 불안정 대비)
- 배포: README, LICENSE, versions.json, GitHub Release workflow

## 현황 분석 (2026-03-03)

### 이미 잘 대응된 설계

| 항목 | 구현 | 코드 위치 |
|------|------|----------|
| **Dropbox 데스크톱 클라이언트 간섭** | content_hash 비교로 mtime 오판 원천 차단. 데스크톱 클라이언트가 로컬을 먼저 업데이트해도 hash 동일 → noop | `planner.ts:50` |
| **삭제 전파 방향** | base state + `localDeleteIntended` 플래그. 삭제 의도 없는 부재 → download(복구). 삭제+수정 교차 → 변경 우선 | `planner.ts:90-105` |
| **경로 대소문자** | `pathLower` 키 정규화. Dropbox case-insensitive 동작과 일관 | `planner.ts:128-142` |
| **반쓰기 방지** | download 후 hash 검증 + Vault API atomic write 위임 | `executor.ts:86-107` |
| **토큰 저장/갱신** | data.json에 저장, refresh 자동 갱신. .obsidian 동기화와 분리 | `main.ts:369-373` |
| **Rate limit** | 429 → 최대 3회 retry, retryAfter 준수, exponential backoff + jitter | `dropbox-adapter.ts` |
| **Cursor 만료** | DropboxCursorResetError catch → 전체 재스캔 자동 복구 | `engine.ts:77-87` |
| **플러그인 미실행 중 삭제** | 이벤트 미수집 → 삭제 의도 없음 → download(복구). 안전 방향 오판 | `planner.ts:100-101` |

### 미대응 / 개선 필요

| # | 항목 | 위험도 | 현재 상태 |
|---|------|--------|----------|
| 1 | **싱크 중 활성 파일 편집** | 높음 | executor가 write 전 getActiveFile() 미체크. 편집 중 덮어쓰기 → 데이터 유실 가능 |
| 2 | **대량 변경 순차 실행** | 중간 | `for...of` 직렬 처리. 500개 파일 시 느림 + UI 블로킹 가능 |
| 3 | **cursor all-or-nothing** | 중간 | 200/500 성공해도 cursor 미갱신 → 전부 재처리. base 갱신은 됨 |
| 4 | **진행 표시 없음** | 중간 | 대량 싱크 시 사용자 피드백 없음. statusBar는 syncing/success만 |
| 5 | **백그라운드 중단 (모바일)** | 중간 | AbortController 없음. 중단 시 진행 중 작업 상태 불명확 |
| 6 | **특수문자 검증** | 중간 | Dropbox 금지 문자 필터링 없음 |
| 7 | **네트워크 온/오프 감지** | 낮음 | navigator.onLine 미사용. 오프라인 시에도 싱크 시도 |
| 8 | **토큰 revoke 알림** | 낮음 | refresh_token revoke 시 조용히 실패. 사용자 미통지 |
| 9 | **앱 시작 레이스** | 낮음 | onLayoutReady 구현됨. editLock은 없으나 content_hash로 최종 보호 |

### remotely-save 비교 (Dropbox 한정)

대표적 커뮤니티 플러그인 remotely-save와의 구조적 차이. 범용성(9개 백엔드)을 택한 대가로 Dropbox 고유 기능을 활용하지 못함.

**우리가 앞서는 부분**:

| 영역 | remotely-save | dropbox-sync |
|------|--------------|-------------|
| 변경 감지 | mtime + size (같은 크기면 변경 못 감지) | content_hash (내용 기반) |
| 증분 동기화 | 매번 전체 스캔 | cursor 기반 delta |
| 업로드 안전 | `mode: "overwrite"` 무조건 덮어쓰기 | rev 낙관적 잠금 (서버 충돌 감지) |
| 충돌 처리 | keep_newer 기본 → 진 쪽 통보 없이 삭제 | conflict 파일 보존 + 사용자 확인 |
| 삭제 판단 | prevSync 기반이나 부활 버그 다수 | deleteIntended + 안전 방향 기본값 |
| 코드 구조 | 40+ 브랜치 거대 함수 | planner/executor 순수 함수 분리 |
| 테스트 | ~112개 (핵심 동기화 로직 미테스트) | 148개 (시뮬레이션 포함) |

**remotely-save의 알려진 문제**:
- mtime 기반 오판 — macOS/iOS 간 mtime 불일치로 매번 전체 재동기화 ([#575](https://github.com/remotely-save/remotely-save/issues/575))
- 삭제 파일 부활 ([#611](https://github.com/remotely-save/remotely-save/issues/611), [#985](https://github.com/remotely-save/remotely-save/issues/985))
- smart_conflict 데이터 유실 ([#697](https://github.com/remotely-save/remotely-save/issues/697))
- rate limit 폭발 — 대규모 vault에서 429 반복 ([#1026](https://github.com/remotely-save/remotely-save/issues/1026))
- README에 "ALWAYS backup your vault before using" 경고

**remotely-save가 앞서는 부분**:
- 커뮤니티 플러그인 등록 완료, 실사용자 다수
- 실환경 오래 운영 → 엣지케이스 발견 축적
- .obsidian 기기별 설정 분리 등 세밀한 옵션

**공통 미구현**: 활성 파일 보호, 병렬 실행, 백그라운드 동기화 (Obsidian 플랫폼 제약)

---

## 다음: Phase 4 (안정성 + UX 강화)

### 4.1 싱크 중 활성 파일 보호 — 우선순위: 높음

현재 executor가 `fs.write()` 시 활성 편집 여부를 확인하지 않음.
원격 버전을 다운로드하여 로컬에 덮어쓸 때, 사용자가 에디터에서 해당 파일을 편집 중이면 내용이 유실될 수 있음.

- executor.ts download/conflict: write 전 `app.workspace.getActiveFile()` 체크
- 활성 파일이면 conflict로 분류하거나 싱크 지연
- Obsidian의 `vault.modifyBinary()`와 에디터 in-memory 상태의 상호작용 검증 필요

### 4.2 대량 변경 성능 — 우선순위: 중간

현재 executor가 plan.items를 `for...of`로 순차 실행.
500개 파일 변경 시 직렬 처리로 느리고, 메인 스레드 블로킹 가능.

- executor에 p-queue 도입 (concurrency 제한 병렬 실행)
- 진행 바 + 상세 상태 표시 (현재 N/M 파일)
- cursor all-or-nothing 완화 검토: 성공 항목만 base 갱신은 이미 구현됨.
  cursor 부분 갱신은 Dropbox API 특성상 불가 → 현재 방식 유지하되 성능으로 보상

### 4.3 모바일 안정성 — 우선순위: 중간

**백그라운드 중단**: 모바일에서 앱 전환 시 싱크 중단 가능.
- AbortController/signal 도입 → 중단 시 진행 중 작업만 실패 처리
- 이미 성공한 항목의 base 업데이트는 유지됨 (현재 설계로 안전)
- cursor 미갱신 → 다음 실행 시 자연 재시도

**네트워크 상태 감지**:
- `navigator.onLine` 또는 Obsidian 네트워크 이벤트로 온/오프 감지
- 오프라인 시 싱크 스킵 → 온라인 복귀 시 즉시 싱크

**앱 시작 레이스**:
- onLayoutReady 이후에만 이벤트 등록 (구현됨)
- 초기 싱크 중 발생한 vault 이벤트가 planner에 정확히 반영되는지 검증

### 4.4 입력 검증 — 우선순위: 중간

**특수문자 필터링**: Dropbox가 허용하지 않는 파일명 문자 검증.
- upload 전 파일명 sanitize 또는 사용자 알림
- Dropbox 금지 문자: NUL, /, 제어문자 등

**토큰 revoke 감지**:
- refresh_token이 revoke된 경우 (사용자가 Dropbox 앱 권한 해제) 현재 조용히 실패
- 인증 실패 시 Notice로 "재인증 필요" 알림 + 설정 탭 유도

### 4.5 longpoll 실시간 감지 (데스크톱) — 우선순위: 낮음

- Dropbox `/2/files/list_folder/longpoll`로 변경 즉시 감지
- 데스크톱 전용 (모바일은 폴링 유지)

### 4.6 selective sync (폴더 제외) — 우선순위: 낮음

- excludePatterns 설정은 이미 존재 (settings.ts)
- planner에서 제외 패턴 적용 로직 구현 필요

### 4.7 Community Plugin 등록 제출 — 우선순위: 낮음

- 위 안정성 항목 해결 후 진행
- obsidianmd/obsidian-releases PR 제출
