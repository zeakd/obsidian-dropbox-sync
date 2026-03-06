# 직접 만든 Dropbox App Key 사용하기

기본적으로 이 플러그인은 내장된 App Key로 Dropbox에 연결합니다. 대부분의 사용자에게는 별도 설정 없이 바로 작동합니다.

다음과 같은 경우에 직접 만든 Dropbox App Key를 사용할 수 있습니다:

- 내장 키가 사용자 수 제한에 도달한 경우
- Dropbox 앱 권한을 직접 관리하고 싶은 경우
- 엄격한 보안 정책이 적용되는 조직에서 사용하는 경우

## 설정 방법

### 1. Dropbox 앱 만들기

[dropbox.com/developers/apps](https://www.dropbox.com/developers/apps)에 접속하여 **Create app**을 클릭합니다.

다음 설정을 선택합니다:

| 항목 | 값 |
|------|-----|
| **API** | Scoped access |
| **Access type** | App folder |
| **Name** | 원하는 이름 (예: "My Obsidian Sync") |

> **왜 App folder인가요?** App folder로 설정하면 플러그인이 자체 폴더(`Apps/앱이름/`) 안에서만 파일을 읽고 쓸 수 있습니다. Dropbox의 다른 파일에는 접근할 수 없어 가장 안전합니다.

### 2. 권한 설정

앱을 만든 후 **Permissions** 탭에서 다음 권한을 활성화합니다:

- `files.metadata.read`
- `files.metadata.write`
- `files.content.read`
- `files.content.write`

**Submit**을 클릭하여 저장합니다.

### 3. Redirect URI 추가 (데스크톱 전용)

앱의 **Settings** 탭에서 **OAuth 2 > Redirect URIs** 아래에 다음 redirect URI를 추가합니다:

```
obsidian://dropbox-sync
```

이 설정이 있어야 데스크톱에서 원클릭 로그인이 작동합니다. 모바일은 코드 기반 인증을 사용하므로 이 설정이 필요하지 않습니다.

### 4. App Key 복사

같은 **Settings** 탭에서 **App key** (App secret이 아님)를 찾아 복사합니다.

### 5. 플러그인에 키 입력

Obsidian에서 **Settings > Dropbox Sync > Connection**으로 이동합니다:

1. 이미 연결되어 있다면 먼저 **Disconnect**를 클릭합니다
2. **Use custom App Key**를 켭니다
3. App Key를 붙여넣습니다
4. **Connect to Dropbox**를 클릭합니다

## FAQ

**내장 키로 다시 돌아갈 수 있나요?**
네. Disconnect 후 "Use custom App Key"를 끄고 다시 연결하면 됩니다.

**동기화된 파일에 영향이 있나요?**
없습니다. App Key를 변경하면 플러그인이 Dropbox에 인증하는 방식만 바뀝니다. 파일과 동기화 상태는 그대로 유지됩니다.

**모든 기기에서 설정해야 하나요?**
네. 각 기기에서 같은 App Key로 연결해야 합니다. Vault ID와 파일은 동일하게 유지됩니다.
