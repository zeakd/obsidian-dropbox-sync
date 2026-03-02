# Settings UX 원칙 — Dropbox Sync 대화에서 도출

## 배경

Obsidian 플러그인 설정 화면을 반복 개선하면서 발견한 원칙들.
초기 구현은 "일단 다 보여주자"였고, 대화를 통해 아래 원칙들이 하나씩 드러났다.

---

## 1. 상태 기반 점진적 공개 (State-driven Progressive Disclosure)

**원칙**: 모든 단계를 항상 보여주되, 미완료 단계는 disabled로 표시한다. 사용자가 다음 스텝을 예측할 수 있어야 한다.

**3단계 구조**:

| 단계 | 섹션 | 활성 조건 |
|------|------|-----------|
| 1 | **Connection** — Connect + App Key | 항상 |
| 2 | **Sync** — Vault ID + Start/Stop | Connected |
| 3 | Sync options (interval, conflict, delete) | Start Sync |

- 미연결 → Connect + App Key 활성. Vault ID·Start Sync는 disabled로 보임.
- 연결됨 + Vault ID 미설정 → Vault ID 입력 활성. Start Sync는 disabled.
- 연결됨 + Vault ID 설정 + Stop → Start Sync 활성. Sync options는 disabled.
- Start Sync → 모든 옵션 활성.
- Advanced (Disconnect, Change Vault ID)는 하단 분리.

**그룹핑 규칙**: 함께 동작하는 것은 붙어다닌다.
- Connection + App Key = 한 그룹
- Vault ID + Start/Stop = 한 그룹

**핵심 질문**: "이 상태에서 사용자가 다음에 뭘 해야 하는지 보이는가?"

---

## 2. 숨기기보다 비활성화 + 이유 (Disabled with Reason > Hidden)

**원칙**: 기능이 존재하지만 조건 미충족이면, 숨기지 말고 비활성화 상태로 보여주되 이유를 설명한다.

**적용 사례**:
- Sync now 버튼: 미연결 시 disabled + "Connect to Dropbox first."
- Vault ID 미설정 시 disabled + "Set a Vault ID first."
- App Key: 연결 중 disabled + "Disconnect first to change App Key."

**위반 사례 (초기 구현)**:
- `syncName && refreshToken` 조건에 Sync 섹션 통째로 숨김 → 사용자가 기능의 존재 자체를 모름.

**핵심 질문**: "사용자가 '왜 안 되지?'라고 느낄 수 있는 지점인가?"

---

## 3. 위험도에 비례하는 마찰 (Friction Proportional to Risk)

**원칙**: 안전한 행동은 즉시 반영. 위험한 행동은 확인 단계를 추가. 마찰의 양은 돌이킬 수 없는 정도에 비례한다.

```
위험도 낮음                               위험도 높음
─────────────────────────────────────────────────────
즉시 저장         버튼 클릭 필요        확인 모달 + 경고
(interval 슬라이더) (Vault ID 최초 설정)  (Vault ID 변경, Disconnect)
```

**적용 사례**:
- Interval, conflict strategy, delete protection → 슬라이더/드롭다운 변경 즉시 저장. 되돌리기 쉬움.
- Vault ID 최초 설정 → Set 버튼. 원격 폴더가 이미 있으면 확인 모달.
- Vault ID 변경 → Change 버튼 + 확인 모달 + 경고 텍스트. 기존 동기화가 끊어지므로.
- App Key 변경 → 연결 중에는 아예 변경 불가 (disabled). 인증 무효화 방지.

**핵심 질문**: "이 행동을 실수로 했을 때, 사용자가 얼마나 곤란해지는가?"

---

## 4. 버튼은 행동 가능할 때만 활성화 (Actionable Button States)

**원칙**: 버튼이 눌릴 수 있으면 반드시 무언가 일어나야 한다. 아무 일도 안 일어나는 활성 버튼은 버그다.

**적용 사례**:
- Change 버튼: 값이 현재와 같으면 disabled. 다르면 활성 + 색상 강조(mod-cta).
- Set 버튼: 유효하지 않은 입력이면 disabled.

**세부 규칙**:
- 초기 상태는 disabled (변경 없음 = 행동 불필요).
- 값이 변경되면 활성화 + 시각 강조 (색상).
- 행동 완료 후 다시 disabled로 복귀 (display 재렌더).

---

## 5. 입력 거부 > 자동 교정 (Reject Invalid Input > Silent Sanitize)

**원칙**: 잘못된 입력을 조용히 고치지 않는다. 왜 안 되는지 알려주고 사용자가 고치게 한다.

**적용 사례**:
- `sanitizeSyncName()` (자동 교정) → `isValidSyncName()` (유효성 검사)로 전환.
- 잘못된 입력 시 desc에 실시간 안내: `Invalid name. Use only a-z, 0-9, -, _`
- 버튼도 함께 disabled로 전환.

**위반 사례 (초기 구현)**:
- `sanitizeSyncName`이 특수문자를 조용히 제거 → 사용자가 "my.vault"를 입력하면 "myvault"가 됨. 의도와 다를 수 있음.

**핵심 질문**: "사용자가 자기 입력이 바뀐 걸 알아챌 수 있는가?"

---

## 6. 구현 디테일을 사용자에게 노출하지 않는다 (Hide Implementation Details)

**원칙**: 내부 구현(경로, 키, ID)은 사용자 언어로 번역한다.

**적용 사례**:
- `syncName` (내부 변수) → "Vault ID" (사용자 라벨).
- `/${syncName}` (Dropbox 경로) → 모달에서 경로 제거, 이름만 표시.
- `"sync-tester" → "new-name"` (사용자 관점), ~~`"/sync-tester" → "/new-name"`~~ (구현 관점).

**핵심 질문**: "사용자가 Dropbox API를 모른다면 이 텍스트를 이해할 수 있는가?"

---

## 7. 행동의 결과를 미리 보여준다 (Preview Consequences Before Action)

**원칙**: 파괴적 행동 전에 "무엇이 일어나는지"와 "무엇이 일어나지 않는지"를 모두 알려준다.

**적용 사례**:
- Vault ID 변경 시 원격 폴더 존재 여부를 API로 확인한 뒤:
  - **폴더 있음**: "이미 N개 파일이 있음. 병합 시 충돌 가능."
  - **폴더 없음**: "새 폴더 생성. 기존 폴더의 파일은 그대로 유지."
- 최초 설정 시 기존 폴더 감지: "이 폴더에 이미 파일이 있습니다. 동기화하면 덮어쓸 수 있습니다."

**핵심 질문**: "Confirm을 누른 뒤 '이럴 줄 몰랐는데'라고 할 상황이 있는가?"

---

## 8. 레이아웃은 사용 빈도 순서를 따른다 (Layout Follows Usage Frequency)

**원칙**: 자주 쓰는 것은 위로, 한 번 설정하고 거의 안 건드리는 것은 아래로.

**현재 레이아웃**:
```
── Connection ──
  Connect / Connected + App Key  ← 최초 1회
── Sync ──
  Vault ID + Start/Stop          ← 자주 사용
  interval / conflict / delete   ← Sync 중 조정
── Advanced ──
  Disconnect                     ← 드물게
  Change Vault ID                ← 거의 안 함
```

**위반 사례 (초기 구현)**:
- Connect 버튼이 syncName 아래 → 첫 사용 시 가장 먼저 해야 할 행동이 묻힘.

---

## 9. 같은 설정이라도 맥락에 따라 다른 UI를 제공한다 (Context-Dependent UI)

**원칙**: 같은 데이터(Vault ID)라도 상황에 따라 적절한 상호작용이 다르다.

| 상태 | UI | 이유 |
|------|-----|------|
| 미연결 + 미설정 | 입력 + Set 버튼 | 위험 없음, 빠른 설정 유도 |
| 미연결 + 설정됨 | 입력 + Set 버튼 | 아직 연결 안 됐으므로 자유롭게 변경 |
| 연결됨 | 읽기 전용 (상단) + Change (Connection 섹션) | 변경이 위험하므로 의도적 행동 요구 |

---

## 체크리스트

설정 항목을 추가할 때 아래를 확인한다:

### UX
- [ ] 이 상태에서 사용자에게 보여줄 필요가 있는가?
- [ ] 비활성화 시 이유를 설명하고 있는가?
- [ ] 위험도에 맞는 마찰이 있는가? (즉시 저장 / 버튼 / 모달)
- [ ] 버튼은 행동 가능할 때만 활성화되는가?
- [ ] 잘못된 입력을 조용히 고치지 않고 거부하는가?
- [ ] 구현 디테일 없이 사용자 언어로 설명하는가?
- [ ] 파괴적 행동의 결과를 미리 보여주는가?
- [ ] 사용 빈도 순서에 맞게 배치했는가?

### 텍스트 입력
- [ ] 텍스트 입력에 명시적 저장 버튼이 있는가?
- [ ] 버튼은 값이 변경됐을 때만 활성화되는가?
- [ ] 유효하지 않은 입력 시 desc에 에러 메시지가 나오는가?
- [ ] 입력이 비활성화됐을 때 이유를 desc로 설명하는가?
- [ ] 저장 완료 후 UI가 초기 상태로 복귀하는가?

### 구현
- [ ] onClick을 setDisabled보다 먼저 등록했는가?
- [ ] 동적 제어가 필요한 요소의 DOM 참조를 캡처했는가?
- [ ] display() 재호출 전에 설정을 저장했는가?
- [ ] onChange 안에서 display()를 호출하고 있지 않은가?
