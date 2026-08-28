# MeiDay SiYuan Plugin

[中文说明](./README.zh-CN.md)

A SiYuan plugin that embeds the [MeiDay](https://task.congsec.cn) task manager into your note-taking workflow. A MeiDay icon sits in the **right sidebar**; click it to open the **MeiDay window (popup dialog)**, which talks to your remote FastAPI backend at `https://task.congsec.cn`.

> This plugin is the SiYuan packaging of the MeiDay frontend (Vue 3 + Vite). The backend is not bundled — it connects to the public backend at `https://task.congsec.cn`.

## Features

- Right-sidebar icon; click to open the MeiDay popup window (dialog, no sidebar space used)
- The frontend is bundled into the plugin (single-file build), rendered in an isolated iframe
- Login state is kept in the iframe's localStorage (same origin as SiYuan), so you stay logged in between sessions
- Marketplace-ready structure: `plugin.json`, `icon.png`, `preview.png`, README and `package.zip`

## Adjusting the dialog size

Edit the two constants at the top of `src/index.ts`, then rebuild and restart SiYuan:

- `DIALOG_WIDTH`: dialog width, a CSS length such as `"940px"` / `"80vw"`
- `DIALOG_HEIGHT`: dialog height, a CSS length such as `"72vh"` / `"600px"`

Note: SiYuan caps dialogs at 88% of the viewport width (`max-width: 88vw`), so extra-wide values get shrunk on narrow screens — that is normal.

## Requirements

- SiYuan desktop v3.0.0+ (a running SiYuan with the marketplace available)
- The backend must be reachable at `https://task.congsec.cn`
- (Development only) Node.js 24+

## Install

1. Download the `package.zip` from the latest [release](../../releases).
2. In SiYuan, go to **Settings → Marketplace**, click the **Plugins** tab, then choose **Import / 导入** and select the downloaded `package.zip`, or copy the extracted plugin folder into `{workspace}/data/plugins/siyuan-plugin-meiday`.
3. Restart SiYuan, then enable **MeiDay** in the plugin list.
4. Click the MeiDay icon in the **right sidebar** to open the MeiDay window.

## Backend CORS (required)

The bundled frontend runs on SiYuan's page origin, but calls the backend at `https://task.congsec.cn`. The browser blocks the request unless the backend allows the SiYuan origin via CORS.

On the backend server, add the SiYuan origin to the `FRONTEND_ORIGINS` environment variable (comma separated) and restart:

```
FRONTEND_ORIGINS=http://localhost,https://localhost,http://127.0.0.1:6806
```

`http://127.0.0.1:6806` is SiYuan's default kernel origin. If your SiYuan uses another port (check **Settings → About → 内核 HTTP 端口**), use that instead.

## Build from source

```powershell
# 1. Build the MeiDay frontend as a single self-contained HTML file (from the EasyTask frontend folder)
$env:VITE_API_BASE_URL="https://task.congsec.cn"
npm run build:plugin            # produces frontend/dist-plugin/index.html

# 2. Copy that file into this repo
Copy-Item ../EasyTask/frontend/dist-plugin/index.html src/assets/app.html

# 3. Install deps and build the plugin (this repo)
npm install
npm run build                   # produces dist/ and package.zip
```

## Publish to the community bazaar

1. Push this repo to `https://github.com/CongSec/siyuan-plugin-meiday`.
2. Create a GitHub **release** with tag `v0.1.0` and attach the `package.zip`.
3. Open a PR to [siyuan-note/bazaar](https://github.com/siyuan-note/bazaar) adding one line to `plugins.txt`:
   ```
   CongSec/siyuan-plugin-meiday
   ```
4. Wait for the PR checks to pass and merge; the bazaar index updates automatically.

## License

MIT