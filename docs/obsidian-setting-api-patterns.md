# Obsidian Setting API 구현 패턴

Obsidian의 Setting API는 raw한 빌딩 블록만 제공한다.
[Settings UX 원칙](settings-ux-principles.md)을 구현하려면 아래 패턴들을 조합해야 한다.

---

## API 계층 구조

```
Setting (컨테이너)
├── settingEl / infoEl / controlEl  ← DOM 직접 접근 가능
├── setName() / setDesc()           ← 정적 텍스트... 이지만 동적으로도 쓸 수 있음
├── setDisabled()                   ← Setting 전체 비활성화
└── add*() 메서드들
    ├── addButton()  → ButtonComponent  { buttonEl, setCta(), setWarning(), setDisabled() }
    ├── addText()    → TextComponent    { inputEl, setValue(), setPlaceholder(), setDisabled() }
    ├── addToggle()  → ToggleComponent  { toggleEl, setValue(), setDisabled() }
    ├── addSlider()  → SliderComponent  { sliderEl, setLimits(), setDynamicTooltip() }
    └── addDropdown()→ DropdownComponent{ selectEl, addOption(), setValue() }
```

모든 컴포넌트는 `*El` 프로퍼티로 DOM 요소에 직접 접근 가능.
API가 부족할 때 DOM을 직접 조작하는 것이 핵심 패턴이다.

---

## 입력 유형별 저장 전략

Obsidian Setting에서 값이 변경되는 방식은 두 가지다:

| 유형 | 컴포넌트 | 저장 방식 | 이유 |
|------|----------|-----------|------|
| **선택형** | Toggle, Slider, Dropdown | 즉시 저장 (onChange) | 상태가 명확하고 실수해도 즉시 되돌림 가능 |
| **입력형** | Text, TextArea | 버튼으로 명시적 저장 | 타이핑 중간 상태가 존재. "완료" 시점을 사용자가 결정해야 함 |

**텍스트 입력은 반드시 버튼과 함께 제공한다.**

이유:
1. 타이핑 중 onChange가 매 키 입력마다 발생 → 중간 상태가 저장되면 안 됨
2. 사용자가 "입력 완료"를 인지할 수 없음 (저장됐나? 안 됐나?)
3. 실수로 빈 값이 저장되면 복구가 어려울 수 있음

---

## 패턴 0: Text + Button 기본 구조

모든 텍스트 입력의 기본 형태. 이후 패턴들은 이 위에 쌓인다.

```typescript
let pendingValue = currentValue;
let btnEl: HTMLButtonElement | null = null;

const setting = new Setting(containerEl)
  .setName("Label")
  .setDesc("Helper message")
  .addText((text) =>
    text.setValue(currentValue).onChange((value) => {
      pendingValue = value.trim();
      const changed = pendingValue !== currentValue;
      // → 패턴 1: 버튼 상태 제어
      // → 패턴 2: 유효성 피드백
    }),
  )
  .addButton((btn) => {
    btn.setButtonText("Save").onClick(async () => {
      // → 패턴 3: 확인 모달 (위험한 경우)
      await save(pendingValue);
      this.display(); // 리렌더
    });
    btnEl = btn.buttonEl;
    btnEl.disabled = true; // 초기: 변경 없으므로 비활성
  });
```

**Helper message (setDesc) 상태 전이**:

```
[기본 안내]  →  입력 중  →  [유효성 에러] 또는 [기본 안내]
     ↑                              │
     └──── display() 리렌더 ────────┘
```

| 상태 | desc 내용 | 버튼 |
|------|-----------|------|
| 초기 (변경 없음) | 기본 안내 또는 현재 값 표시 | disabled |
| 입력 중 (유효) | 기본 안내 유지 | **enabled + mod-cta** |
| 입력 중 (무효) | 에러 메시지 | disabled |
| 입력이 원래 값과 동일 | 기본 안내 | disabled |
| 저장 완료 | display() 리렌더로 초기 상태 복귀 | disabled |

**비활성화된 텍스트 입력**:

입력을 허용하지 않을 때는 반드시 이유를 설명한다.

```typescript
.addText((text) =>
  text
    .setValue(this.plugin.settings.appKey)
    .setDisabled(isConnected)  // 입력 잠금
)
// desc로 이유 설명
.setDesc(isConnected ? "Disconnect first to change." : "기본 안내")
```

---

## 패턴 1: 동적 버튼 상태 제어

**문제**: 버튼을 입력 변화에 따라 활성/비활성 전환하고 싶다.
**API 한계**: `ButtonComponent.setDisabled()`는 있지만, onChange 콜백에서 참조할 방법이 없다.

```typescript
let btnEl: HTMLButtonElement | null = null;

new Setting(containerEl)
  .addText((text) =>
    text.onChange((value) => {
      if (btnEl) {
        btnEl.disabled = !isValid(value);              // disabled 토글
        btnEl.toggleClass("mod-cta", isValid(value));  // 색상 강조
      }
    }),
  )
  .addButton((btn) => {
    btn.setButtonText("Save").onClick(() => { /* ... */ });
    btnEl = btn.buttonEl;   // ← 캡처
    btnEl.disabled = true;  // ← 초기 상태 (onClick 등록 후!)
  });
```

**주의: 등록 순서**
- `onClick()`을 먼저, `disabled`를 나중에. 역순이면 onClick이 등록되지 않을 수 있다.
- `setDisabled(true)` 대신 `btnEl.disabled = true`로 직접 설정하면 순서 문제 회피.

---

## 패턴 2: 실시간 유효성 피드백 (setDesc 활용)

**문제**: 입력값이 잘못됐을 때 즉시 알려주고 싶다.
**API 한계**: `setDesc()`는 정적 텍스트용이지만, 참조를 캡처하면 동적으로 사용 가능.

```typescript
const setting = new Setting(containerEl)  // ← 참조 캡처
  .setName("Vault ID")
  .setDesc("Letters, numbers, hyphens only.")
  .addText((text) =>
    text.onChange((value) => {
      const valid = isValidSyncName(value);
      setting.setDesc(              // ← 동적 갱신
        valid ? "Letters, numbers, hyphens only."
              : `Invalid: "${value}". Use only a-z, 0-9, -, _`,
      );
    }),
  );
```

**패턴 조합**: 유효성 피드백 + 버튼 상태를 함께 제어하면 원칙 4(Actionable Button) + 원칙 5(Reject Invalid Input)를 동시에 구현.

---

## 패턴 3: Modal을 async/await로 사용

**문제**: 사용자 확인을 받은 뒤 후속 로직을 실행하고 싶다.
**API 한계**: Modal은 `onOpen()/onClose()` 콜백 기반. Promise 지원 없음.

```typescript
class ConfirmModal extends Modal {
  private confirmed = false;
  private resolve: ((v: boolean) => void) | null = null;

  onOpen(): void {
    // UI 구성 (제목, 메시지, 경고, 버튼)
    new Setting(this.contentEl)
      .addButton((btn) =>
        btn.setCta().setButtonText("Confirm").onClick(() => {
          this.confirmed = true;
          this.close();
        }),
      )
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => this.close()),
      );
  }

  onClose(): void {
    this.contentEl.empty();
    this.resolve?.(this.confirmed);  // ← Promise 해결
  }

  waitForConfirmation(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }
}

// 사용:
const ok = await new ConfirmModal(app, "제목", "메시지", "경고").waitForConfirmation();
if (!ok) return;
```

이 패턴으로 원칙 3(위험도 비례 마찰)과 원칙 7(결과 미리 보기)을 구현.

---

## 패턴 4: 조건부 렌더링 (display 재호출)

**문제**: 상태 변경 후 UI를 전체 갱신하고 싶다.
**방법**: `this.display()`를 재호출하면 `containerEl.empty()` 후 전체 재구성.

```typescript
display(): void {
  const { containerEl } = this;
  containerEl.empty();

  const isConnected = !!this.plugin.settings.refreshToken;

  if (!isConnected) {
    this.renderAuth(containerEl);
    return;  // ← 조기 반환으로 불필요한 렌더링 방지
  }

  this.renderSyncSettings(containerEl);
}
```

**주의**:
- `display()` 호출 전에 변경된 설정을 `saveSettings()`로 저장해야 한다.
- 입력 중 `display()` 호출 → 포커스 손실 + 깜박임. onChange마다 호출하지 않는다.
- `display()` 이후 모든 로컬 변수(`pendingName` 등)가 초기화된다.

**외부 이벤트로 갱신**: 콜백 등록으로 외부 상태 변경 시 자동 갱신.
```typescript
this.plugin.onAuthChange = () => this.display();
```

---

## 패턴 5: 연결 상태에 따른 입력 잠금

**문제**: 연결 중에는 변경하면 안 되는 설정이 있다.

```typescript
const isConnected = !!this.plugin.settings.refreshToken;

new Setting(containerEl)
  .setName("App Key")
  .setDesc(
    isConnected
      ? "Disconnect first to change App Key."   // 이유 설명
      : "Create an app at dropbox.com/developers/apps",
  )
  .addText((text) =>
    text
      .setValue(this.plugin.settings.appKey)
      .setDisabled(isConnected)     // ← 연결 중 비활성화
      .onChange(async (value) => {
        this.plugin.settings.appKey = value.trim();
        await this.plugin.saveSettings();
      }),
  );
```

원칙 2(Disabled with Reason)의 직접 구현.

---

## 추가 활용 가능한 UI 요소

Setting API와 Obsidian 전반에서 설정 화면에 활용 가능한 요소들.

### setDesc에 리치 텍스트 (DocumentFragment)

desc는 문자열뿐 아니라 `DocumentFragment`를 받는다. 링크, 볼드, 아이콘을 넣을 수 있다.

```typescript
new Setting(containerEl)
  .setName("App Key")
  .setDesc(createFragment((frag) => {
    frag.appendText("Create an app at ");
    frag.createEl("a", {
      text: "dropbox.com/developers",
      attr: { href: "https://www.dropbox.com/developers/apps" },
    });
  }));
```

### setHeading() — 섹션 제목

`containerEl.createEl("h3")` 대신 Setting API 네이티브 방식:

```typescript
new Setting(containerEl).setName("Sync").setHeading();
```

장점: Obsidian 테마와 자동으로 일관된 스타일. `h3` 직접 생성보다 권장.

### ExtraButtonComponent — 아이콘 보조 버튼

Setting 우측에 작은 아이콘 버튼 추가. 리셋, 도움말 등 보조 행동에 적합.

```typescript
new Setting(containerEl)
  .setName("Sync interval")
  .addSlider((slider) => { /* ... */ })
  .addExtraButton((btn) =>
    btn.setIcon("reset").setTooltip("Reset to default").onClick(() => {
      // 기본값 복원
    }),
  );
```

### ProgressBarComponent — 진행 표시

동기화 진행 상태를 설정 화면에서 보여줄 때 활용 가능.

```typescript
new Setting(containerEl)
  .setName("Sync progress")
  .addProgressBar((bar) => bar.setValue(65));  // 0-100
```

### SuggestModal — 검색 가능한 선택 모달

목록에서 검색해서 선택. Vault ID 선택 시 기존 Dropbox 폴더 목록을 보여주는 데 활용 가능.

```typescript
class FolderSuggestModal extends FuzzySuggestModal<string> {
  getItems(): string[] { return ["vault-1", "vault-2", "my-notes"]; }
  getItemText(item: string): string { return item; }
  onChooseItem(item: string): void { /* 선택 처리 */ }
}
```

### Notice — 지속 알림 (duration: 0)

저장/동기화 중 상태를 표시하고 완료 후 업데이트:

```typescript
const notice = new Notice("Checking remote folder...", 0);  // 0 = 수동 해제
try {
  const count = await checkFolder(name);
  notice.setMessage(`Found ${count} files.`);
  setTimeout(() => notice.hide(), 3000);
} catch {
  notice.setMessage("Check failed.");
  setTimeout(() => notice.hide(), 3000);
}
```

### Menu — 컨텍스트 메뉴

버튼 클릭 시 옵션 목록 표시. Conflict strategy를 드롭다운 대신 메뉴로 표현 가능.

```typescript
btn.onClick((evt) => {
  const menu = new Menu();
  menu.addItem((item) =>
    item.setTitle("Keep both").setChecked(current === "keep_both").onClick(() => { /* ... */ }),
  );
  menu.addItem((item) =>
    item.setTitle("Keep newest").onClick(() => { /* ... */ }),
  );
  menu.showAtMouseEvent(evt);
});
```

### Setting.then() — 후처리 체이닝

Setting 생성 후 DOM에 직접 접근해야 할 때:

```typescript
new Setting(containerEl)
  .setName("Vault ID")
  .setDesc("...")
  .then((setting) => {
    setting.settingEl.addClass("vault-id-setting");
    // DOM 요소에 커스텀 스타일, 이벤트 등 추가 가능
  });
```
