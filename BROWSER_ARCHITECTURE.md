# Nexus Browser Architecture

Nexus has two runtime tracks with deliberately different purposes.

## Source fork

The product target is a Chromium source fork. Nexus-owned changes are kept in
`chromium-fork/` and are applied to pinned upstream checkouts under the ignored
`.chromium-source/` directory.

- `chromium-fork/fork-manifest.json` pins upstream revisions and records the
  source integration points Nexus owns.
- `chromium-fork/overlays/devtools/` contains the first-party Nexus DevTools
  panel. It uses DevTools SDK target and DOM models directly.
- `scripts/chromium/apply-overlays.ps1` installs the owned files and registers
  the panel in the DevTools application and resource bundle.
- `scripts/chromium/build-devtools.ps1` builds the customized frontend.
- `scripts/chromium/build.ps1` builds `chrome.exe` from the Chromium checkout.
- `scripts/chromium/run.ps1` starts the built browser with the customized
  DevTools frontend and a dedicated Nexus profile.

The public workflow is implemented by `scripts/chromium/cli.mjs`, which selects
the correct GN, Ninja, executable, and profile paths on Windows, macOS, and
Linux. The PowerShell files remain Windows-specific implementation references;
package scripts no longer depend on PowerShell.

The next browser-level patches belong under Chromium's `chrome/browser/ui`,
`chrome/browser/ui/views/side_panel`, and `content/browser/devtools/protocol`.
Those patches will move the Nexus side panel and trusted agent bridge into the
browser process instead of treating the browser as an external automation
target.

## Compatibility runtime

The existing Electron application remains a fast compatibility runtime while
the source fork is built and rebased.

- `src/ui/electron.ts` owns the current desktop window and BrowserViews.
- `public/browser-shell.html` and `public/browser-shell.js` implement its tabs,
  navigation, window controls, and agent surface.
- `src/ui/browser-preload.ts` and `src/ui/agent-preload.ts` provide isolated IPC
  boundaries.
- The backend supplies chat, builds, agents, memory, automation, preview, and
  QA services to both runtime tracks.

Electron embeds Chromium, but it is not the source fork. It is retained so the
working chat and browser-agent flow stays available during the longer Chromium
toolchain and security-update work.

## Source workflow

```sh
npm run chromium:doctor
npm run chromium:bootstrap:devtools
npm run chromium:apply
npm run chromium:devtools
npm run chromium:bootstrap
npm run chromium:build
npm run chromium:run
```

The full browser build requires the Windows compiler and SDK versions reported
by `chromium:doctor`, Xcode and the macOS SDK on macOS, or Chromium's native
Linux dependency set. The DevTools source track can be developed first and then
bundled into `third_party/devtools-frontend/src` in the full checkout.

## Compatibility launch

```sh
npm run desktop
```

On restricted Windows hosts where Chromium's sandbox or GPU helper cannot
launch, `npm run desktop:compat` is available for local development only.
