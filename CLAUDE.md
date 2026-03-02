# obsidian-dropbox-sync

Obsidian vault를 Dropbox로 동기화하는 플러그인.

@PROGRESS.md

## 빌드 & 테스트

```bash
npm run typecheck   # 타입 검사
npm test            # vitest 실행
npm run build       # esbuild → main.js
```

## 아키텍처 요약

```
UI Layer → SyncEngine(Planner → Executor) → Adapters(FileSystem, RemoteStorage, SyncStateStore)
```

- **Planner**: 순수 함수. (local, remote, base) → SyncPlan
- **Executor**: SyncPlan을 adapter로 실행
- **Adapters**: 인터페이스 기반 DI. 테스트 시 Memory mock 주입

### 핵심 설계 결정

1. **content_hash 우선**: mtime은 보조. Dropbox content_hash(4MB 블록 SHA-256)로 변경 판단
2. **rev 기반 낙관적 잠금**: upload(mode: update(rev))로 서버 측 충돌 감지
3. **원본 보존 보장**: 충돌/실패 시 양쪽 원본 반드시 유지
4. **path_lower 키**: Dropbox는 case-insensitive. path_lower를 비교 키로 일관 사용

## 디렉토리 구조

```
src/
  types.ts              ← 공유 타입
  hash.ts               ← Dropbox content_hash (node:crypto)
  adapters/
    interfaces.ts       ← FileSystem, RemoteStorage, SyncStateStore
    memory.ts           ← 테스트용 in-memory mock
  sync/
    planner.ts          ← classifyChange, createPlan (순수 함수)
    executor.ts         ← SyncPlan 실행
    engine.ts           ← SyncEngine.runCycle()
test/
  hash.test.ts
  memory-adapters.test.ts
  planner.test.ts
  executor.test.ts
  simulation/           ← 다기기/실패 시나리오
  support/              ← SyncSimulator, FailingRemoteStorage
```

## 참조 (vault)

- 아키텍처 결정서: `agents/brill/decisions/dropbox-sync-architecture`
- 문제 공간 분석: `agents/brill/research/dropbox-sync-risks`
