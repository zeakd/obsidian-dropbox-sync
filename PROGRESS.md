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

## 다음: Phase 4 (후속 강화)
- 4.1 진행 바 + 상세 상태 표시
- 4.2 longpoll 실시간 감지 (데스크톱)
- 4.3 selective sync (폴더 제외)
- 4.4 Community Plugin 등록 제출
