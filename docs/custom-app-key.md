# Using Your Own Dropbox App Key

By default, this plugin uses a built-in App Key to connect to Dropbox. This works out of the box for most users.

However, you may want to use your own Dropbox App Key if:

- The built-in key has reached its user limit
- You want full control over the Dropbox app permissions
- You're using this plugin in an organization with strict security policies

## How to set up your own App Key

### 1. Create a Dropbox app

Go to [dropbox.com/developers/apps](https://www.dropbox.com/developers/apps) and click **Create app**.

<!-- TODO: 스크린샷 — Dropbox Developer Console의 Create App 화면 -->
<!-- 파일: docs/images/dropbox-create-app.png -->

Choose the following settings:

| Option | Value |
|--------|-------|
| **API** | Scoped access |
| **Access type** | Full Dropbox (or App folder, if you prefer) |
| **Name** | Anything you like (e.g., "My Obsidian Sync") |

### 2. Set permissions

After creating the app, go to the **Permissions** tab and enable:

- `files.metadata.read`
- `files.metadata.write`
- `files.content.read`
- `files.content.write`

Click **Submit** to save.

### 3. Add the redirect URI (desktop only)

Go to the **Settings** tab of your app and add this redirect URI under **OAuth 2 > Redirect URIs**:

```
obsidian://dropbox-sync
```

This allows the desktop one-click login to work. Mobile uses a code-based flow and doesn't need this.

### 4. Copy your App Key

On the same **Settings** tab, find your **App key** (not the App secret) and copy it.

<!-- TODO: 스크린샷 — Dropbox App Settings에서 App Key 위치 -->
<!-- 파일: docs/images/dropbox-app-key.png -->

### 5. Enter the key in the plugin

In Obsidian, go to **Settings > Dropbox Sync > Connection**:

1. If you're already connected, click **Disconnect** first
2. Toggle **Use custom App Key** on
3. Paste your App Key
4. Click **Connect to Dropbox**

<!-- TODO: 스크린샷 — Custom App Key 토글 + 입력 필드 -->
<!-- 파일: docs/images/custom-app-key-settings.png -->

## FAQ

**Can I switch back to the built-in key?**
Yes. Disconnect, toggle off "Use custom App Key", and reconnect.

**Does this affect my synced files?**
No. Changing the App Key only changes how the plugin authenticates with Dropbox. Your files and sync state are preserved.

**Do I need to do this on every device?**
Yes. Each device needs to connect using the same App Key. The Vault ID and files stay the same.
