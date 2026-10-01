# Nexus Chromium Fork

This directory is the source-owned layer for Nexus Browser. Generated Chromium
and DevTools checkouts live in `.chromium-source/` and are intentionally not
committed.

## Current milestone

The first milestone owns the DevTools frontend at source level:

- upstream DevTools is pinned in `fork-manifest.json`;
- `overlays/devtools/front_end/panels/nexus/` implements a permanent Nexus
  panel using DevTools' `TargetManager`, `DOMModel`, and host APIs;
- the overlay script registers the panel in `devtools_app`, GN dependencies,
  and the DevTools resource bundle;
- the panel reports the active target, captures live DOM metadata, copies a
  structured context payload, and checks the local Nexus backend.

This is different from a Chrome extension. The panel compiles into the same
frontend bundle as Elements, Network, Sources, and Console.

## Full Chromium milestone

`scripts/chromium/bootstrap.ps1 -Target Chromium` creates the full source
checkout in `.chromium-source/chromium-checkout/src`. Browser-level work then
lives in patches or overlays for:

- `chrome/browser/ui` for commands, tabs, and browser services;
- `chrome/browser/ui/views/side_panel` for the native Nexus chat/build panel;
- `content/browser/devtools/protocol` for a narrowly scoped trusted agent
  protocol surface;
- `third_party/devtools-frontend/src` for the bundled Nexus panel.

Do not copy generated build output into this directory. Keep Nexus-owned source
small, reviewable, and re-applicable to a newly pinned Chromium revision.

## Supported desktop platforms

The fork tooling supports Windows, macOS, and Linux from the same Node-based
entry point. Chromium must be compiled on each target operating system; build
artifacts are not portable between platforms.

- Windows builds require Visual Studio 2026, Desktop development with C++,
  ATL/MFC, Windows SDK 10.0.28000.x, and the SDK debugging tools.
- macOS builds require a current Xcode installation and macOS SDK. Intel and
  Apple silicon hosts are supported by Chromium.
- Linux builds target x86-64 and require Python 3.9+ plus the packages installed
  by Chromium's `build/install-build-deps.sh` script. Bootstrap runs that script
  unless `--skip-system-deps` is passed.

The source checkout path must not contain spaces on any platform.

## Commands

```sh
npm run chromium:doctor
npm run chromium:bootstrap:devtools
npm run chromium:apply
npm run chromium:devtools
```

After the full compiler toolchain is installed:

```sh
npm run chromium:bootstrap
npm run chromium:build
npm run chromium:run
```

`chromium:apply` is idempotent. Run it again after syncing a compatible
upstream revision.

The Electron compatibility runtime can also be packaged natively:

```sh
npm run package:win
npm run package:mac
npm run package:linux
```

Run a package command on its matching operating system. macOS signing and
notarization and Windows code signing remain release-environment concerns.
