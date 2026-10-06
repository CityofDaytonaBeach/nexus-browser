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

## Browser-owned product loop

The backend owns implementation, independent compilation, rendered acceptance,
and up to two evidence-driven repairs. Closing or switching the UI does not stop
verification. A zero executor exit means implementation ended; `completed`
requires Nexus's own build and desktop/mobile workflow checks to pass.

- `src/builder/browser-verification.ts` validates `.nexus/product-contract.json`
  and executes accessible click/fill/select/check/reload/assertion steps. Each
  workflow must exercise an interaction and assert an outcome. Verification
  captures screenshots, DOM, runtime failures, HTTP errors, and overflow.
- Browser repair passes keep their acceptance contract fixed. Existing accepted
  workflows are retained across updates. Contracts remain executor-authored;
  passing verifies the declared outcomes, not exhaustive product correctness.
- Before an update, Nexus inspects the current project's rendered preview and
  supplies desktop/mobile screenshots, element bounds/styles, console, and
  network evidence to the executor. Reference requests inspect the real browser
  tab. Clone requests additionally compare captured reference layouts/images;
  these similarity measurements are heuristics, not a visual originality score.
- The native Electron session records bounded console/network history. Network
  evidence omits URL query strings and request/response credentials. Captured
  page material is source data, not agent instructions.
- Chats persist their project association. A client-global build ID cannot
  change a chat's workspace. Jobs and verification evidence persist under each
  workspace's `.nexus`; interrupted jobs are reported after restart.
- Checkpoints persist actual source contents, including dotfiles and acceptance
  contracts. Restore backs up the current version, removes files introduced by
  the selected job, and refuses to overwrite later edits. Restoring verifies
  without automatically changing the restored version through repair.

Remote executors must return JSON `{ id, status }`, support `GET /runs/:id` for
queued/running jobs, and finish with `status: "completed", workspaceSynced: true`.
Files must be synchronized to the workspace before local browser verification.
An HTTP acknowledgement alone cannot complete a build.

Run `npm test -- --runInBand` and `npm run build` to verify the implementation.
The browser tests use a local fixture and Chromium; they do not call paid models.

Chat now executes plain-language searches, navigation, page/API inspection,
research captures, and visible-link discovery directly. Search-and-copy requests
open an observed search result, capture its DOM and screenshot, and pass that
reference to implementation. Suggested buttons are optional follow-ups, not a
substitute for executing the current request. Model-generated browser tasks are
validated and limited to eight supported actions; page evidence is untrusted data.

Without a separate cloud chat key, OpenCode can supply semantic routing through
a tool-denied router. Unambiguous build requests launch immediately. Each job
uses isolated OpenCode data, copying existing auth when available. On Windows,
Nexus invokes the installed native executor directly when possible, and watchdog
timeouts settle jobs even when descendant pipes remain open. Implementation and
repair agents do not own long-running preview servers: Nexus starts previews
after implementation exits, then independently verifies desktop/mobile outcomes.
