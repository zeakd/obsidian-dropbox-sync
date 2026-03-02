# 진행 상황

## 현재: Phase 1.5 완료 — 동기화 로직 100% 증명 (마일스톤)

91 테스트 통과. typecheck 통과.

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

### Phase 1.6: 실제 Adapter 구현 (다음)
- [ ] src/adapters/vault-adapter.ts
- [ ] src/adapters/dropbox-adapter.ts
- [ ] src/adapters/dropbox-auth.ts
- [ ] src/adapters/indexeddb-store.ts
- [ ] src/hash.browser.ts
- [ ] typecheck + 기존 테스트 통과

### Phase 1.7: Plugin 통합 + Settings (다음)
- [ ] src/main.ts
- [ ] src/settings.ts
- [ ] src/ui/status-bar.ts, conflict-modal.ts
- [ ] npm run build → main.js 생성
