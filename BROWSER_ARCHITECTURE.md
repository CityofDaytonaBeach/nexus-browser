# Nexus Browser Architecture

Nexus is a browser product, not a dashboard embedded in a browser tab.

## Runtime shape

- `src/ui/electron.ts` owns the desktop window and native browser lifecycle.
- Every tab is an independent Chromium `BrowserView` with its own live `webContents` navigation history.
- The Nexus chat, agent, build, preview, and QA surface is a separate `BrowserView` attached beside the active page.
- `public/browser-shell.html` is the modifiable browser chrome: tabs, address/search, navigation, window controls, and the agent toggle.
- `src/ui/browser-preload.ts` is the isolated IPC boundary between browser chrome and the Electron main process.
- `src/ui/agent-preload.ts` exposes a narrow active-tab action API only to trusted Nexus chat surfaces.
- The Node.js backend remains out of the renderer process and supplies agent, automation, memory, build, and QA services.

## Agent and automation control

- The active Chromium tab continuously sends rendered page evidence to Nexus Chat.
- Nexus Chat registers as the native browser controller over the authenticated backend WebSocket.
- Server-side agents and saved or scheduled automation steps dispatch navigation, click, type, select, keyboard, scroll, screenshot, PDF, wait, and inspection actions through that controller.
- Electron validates the trusted sender and applies each action to the exact active `BrowserView`, then returns a structured result and refreshed page state.
- When the desktop controller is unavailable, ordinary Nexus sessions continue to use the Playwright browser engine.

## Chromium boundary

The current desktop uses the Chromium build embedded by Electron. This gives Nexus complete ownership of its browser chrome and page surfaces without modifying Google Chromium source files.

A source-level Chromium fork is a separate distribution project. It requires a pinned Chromium checkout, depot_tools, platform build workers, signed installers, an update channel, security-patch rebases, and patches under `src/chrome/browser` for the Nexus side panel and services. That work should begin only when the embedded shell behavior is stable enough to become the fork specification.

## Launch

```powershell
npm run desktop
```

On restricted Windows hosts where Chromium's sandbox or GPU helper cannot launch:

```powershell
npm run desktop:compat
```

Compatibility mode is intended for local development only. Packaged releases should retain Chromium sandboxing and hardware acceleration.
