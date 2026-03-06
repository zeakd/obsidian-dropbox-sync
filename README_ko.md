> English version: [README.md](README.md)

# Dropbox Sync for Obsidian

Obsidian vault를 Dropbox로 동기화합니다 — 데스크톱과 모바일 모두, 자동으로.

<!-- TODO: 스크린샷 — 설정 탭 전체 모습 (연결 완료 + 싱크 켜진 상태) -->
<!-- 파일: docs/images/settings-overview.png, 권장 크기: 800px 너비 -->

## 기능

- **Vault를 동기화합니다** — 모든 기기에서 Dropbox를 통해 파일을 최신 상태로 유지합니다
- **변경을 즉시 감지합니다** — 편집, 삭제, 이름 변경이 수초 내에 동기화됩니다
- **충돌을 안전하게 처리합니다** — 같은 파일이 두 기기에서 편집되면 어떤 버전을 유지할지 직접 선택할 수 있습니다
- **실수로 인한 삭제를 방지합니다** — 세 가지 안전 장치가 데이터 손실을 막습니다

## 시작하기

### 1. 플러그인 설치

Obsidian을 열고 **Settings > Community plugins**에서 **"Dropbox Sync"**을 검색한 후 **Install**, **Enable**을 클릭합니다.

<details>
<summary>수동 설치 (고급)</summary>

[최신 릴리스](https://github.com/zeakd/obsidian-dropbox-sync/releases/latest)에서 `main.js`, `manifest.json`, `styles.css`를 다운로드합니다. vault의 `.obsidian/plugins/dropbox-sync/` 폴더에 넣고 Obsidian을 재시작합니다.

</details>

### 2. Dropbox 연결

**Settings > Dropbox Sync**에서 **Connect to Dropbox**를 클릭합니다.

- **데스크톱**: 브라우저가 자동으로 열립니다. 권한을 승인하면 완료됩니다.
- **모바일**: "Open Dropbox"를 탭하고, 권한을 승인한 후, 코드를 복사해서 Obsidian에 붙여넣습니다.

<!-- TODO: 스크린샷 — Connect 버튼 (미연결 상태) -->
<!-- 파일: docs/images/connect.png -->

### 3. Vault ID 설정

Dropbox 폴더 이름을 지정합니다 (예: `my-notes`). vault 파일이 Dropbox에 저장될 위치입니다.

<!-- TODO: 스크린샷 — Vault ID 입력 화면 -->
<!-- 파일: docs/images/vault-id.png -->

### 4. 동기화 켜기

**Enable sync**를 켭니다. vault가 즉시 동기화를 시작합니다.

이후부터 파일을 편집, 생성, 삭제하면 자동으로 Dropbox에 동기화됩니다. 다른 기기의 변경사항도 실시간으로 반영됩니다.

## 일상적인 사용

### 동기화

| 동작 | 결과 |
|------|------|
| **파일 편집** | 5초 후 Dropbox에 동기화 |
| **파일 삭제 또는 이름 변경** | 5초 후 Dropbox에 동기화 |
| **싱크 아이콘 클릭** (왼쪽 사이드바) | 즉시 동기화 |
| **다른 기기에서 편집** | 수초 내에 변경사항 반영 |

하단 상태바에 현재 상태가 표시됩니다: 동기화 중, 동기화 완료, 또는 오류.

<!-- TODO: 스크린샷 — 상태바 3가지 상태 (idle / syncing / synced) -->
<!-- 파일: docs/images/status-bar.png -->

### 충돌이 발생하면

같은 파일이 동기화 전에 두 기기에서 편집되면, 어떤 버전을 유지할지 결정해야 합니다. Settings에서 원하는 전략을 선택할 수 있습니다:

| 전략 | 동작 |
|------|------|
| **Keep both** (기본값) | 두 버전 모두 저장됩니다. 다른 기기의 버전은 `.conflict` 접미사가 붙습니다. |
| **Keep newest** | 가장 최근에 편집된 버전이 자동으로 선택됩니다. |
| **Ask me** | 나란히 비교 화면이 열려서 직접 선택할 수 있습니다. |

자세히 보기: [충돌 해결 방법](docs/ko/conflict-resolution.md)

### 파일 제외하기

PDF, 이미지, 특정 폴더를 동기화에서 제외하고 싶다면 **Settings > Exclude patterns**에서 패턴을 추가합니다:

```
*.pdf
attachments/
.obsidian/workspace*
```

설정 패널에 현재 제외된 파일 수가 표시됩니다.

## 설정 목록

| 설정 | 기본값 | 설명 |
|------|--------|------|
| **Vault ID** | — | Dropbox 폴더 이름. 동기화를 시작하려면 필수입니다. |
| **Enable sync** | Off | 자동 동기화를 켜거나 끕니다. |
| **Conflict strategy** | Keep both | 여러 기기에서 편집된 파일의 처리 방식. [상세](docs/ko/conflict-resolution.md) |
| **Exclude patterns** | `.obsidian/workspace*` | 이 패턴에 해당하는 파일은 동기화되지 않습니다. |
| **Sync on file create** | Off | 새 파일 생성 시에도 동기화 (편집과 삭제는 항상 동기화됩니다). |
| **Sync interval** | 60초 | 변경 확인 주기 (폴백용). 보통 실시간 감지가 작동하므로 필요하지 않습니다. |
| **Delete protection** | On | 다수의 파일을 한꺼번에 삭제하기 전에 확인을 요청합니다. [상세](docs/ko/sync-safety.md) |
| **Delete threshold** | 5 | 확인 창이 뜨는 삭제 파일 수. |
| **Custom App Key** | Off | 내장 키 대신 직접 만든 Dropbox 앱을 사용합니다. [설정 가이드](docs/ko/custom-app-key.md) |

## 안전 장치

세 가지 독립적인 보호 계층으로 데이터를 보호합니다. 하나가 실패해도 나머지가 방어합니다.

| 계층 | 보호 내용 |
|------|-----------|
| **삭제 추적** | 명시적으로 삭제한 파일만 Dropbox에서 제거됩니다. 누락된 파일이 자동 삭제되지 않습니다. |
| **대량 삭제 방지** | 한 번에 5개 이상의 파일을 삭제하려 하면 확인 창이 먼저 나타납니다. |
| **Dropbox 휴지통** | 삭제된 파일은 Dropbox 휴지통에 30~180일간 보관되며 언제든 복원할 수 있습니다. |

자세히 보기: [동기화 안전 장치](docs/ko/sync-safety.md)

## 도움이 필요하신가요?

일반적인 문제는 [문제 해결 가이드](docs/ko/troubleshooting.md)를 참고하거나, 로그를 확인해 보세요:

- **Command palette** > "Dropbox Sync: View sync logs"
- **Settings** > Dropbox Sync > Troubleshooting > **View Logs**

---

<details>
<summary>개발자용</summary>

```bash
bun install
bun run build      # 프로덕션 빌드
bun run dev        # 워치 모드
bun run typecheck  # TypeScript 검사
bun test           # 테스트 실행
```

내부 문서: Obsidian vault로 이동됨 (`inbox/dropbox-sync/`)

</details>

## 라이선스

[MIT](LICENSE)
