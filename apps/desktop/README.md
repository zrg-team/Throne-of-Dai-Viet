# Vạn Thắng — desktop

**Stub.** Nothing here runs yet. This file is what makes "later" a short job instead of a research
project.

Tauri 2, targeting Windows, macOS and Linux from one source tree.

## What Tauri has to do

Exactly two things, both from [`../README.md`](../README.md).

### 1 — Serve `dist-shell/`, not `file://`

Tauri's asset protocol serves the frontend from a real origin
(`tauri://localhost`, or `http://tauri.localhost` on Windows), which is what the contract asks for
and what keeps `localStorage` — and therefore every save — working.

```jsonc
// src-tauri/tauri.conf.json
{
  "build": {
    // Built in the repository root by `yarn build:shell`. Relative asset URLs, no service worker.
    "frontendDist": "../../../dist-shell"
  },
  "app": {
    "windows": [{
      "title": "Vạn Thắng",
      // The design surface is 390 wide and clamps its height; anything wider is letterboxed by
      // Phaser's Scale.FIT. A portrait window is the shape the game was drawn for.
      "width": 480,
      "height": 900,
      "resizable": true
    }]
  }
}
```

The one thing to verify on the first run: the game asks for `./assets/…` and `./faces/…` relative
to the document. If Tauri serves the index from anywhere but the root of that folder, all 267
portrait parts 404 at once.

### 2 — Declare itself before the bundle loads

`src/main.ts` reads `usesServiceWorker()` at module scope, so the descriptor has to exist before
the first line of the bundle. In Tauri that is an init script, not a `DOMContentLoaded` handler:

```rust
// src-tauri/src/lib.rs
const DESCRIPTOR: &str = r#"
  window.__shell = {
    kind: 'desktop',
    os: '__OS__',
    version: '__VERSION__',
    ready: function () { /* no splash to lift yet — see below */ }
  };
"#;

tauri::Builder::default()
    .setup(|app| {
        let script = DESCRIPTOR
            .replace("__OS__", std::env::consts::OS)   // "windows" | "macos" | "linux"
            .replace("__VERSION__", app.package_info().version.to_string().as_str());
        WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
            .initialization_script(&script)
            .build()?;
        Ok(())
    })
```

`std::env::consts::OS` already yields `windows` / `macos` / `linux`, which are three of the five
values `ShellOS` accepts.

## What desktop does *not* need

- **No unpacking, no embedded server.** Tauri's asset protocol reads the bundled frontend directly.
  The archive-and-loopback machinery in `../mobile` exists because Android cannot read files inside
  its own APK — a problem Tauri does not have.
- **No donation gate.** `allowsDonationLinks()` returns true off an `os` of `windows`/`macos`/
  `linux`, which is correct: a self-distributed desktop build answers to no store. If it is ever
  submitted to the Mac App Store, revisit that — the same App Store rules apply there.
- **No splash handshake, initially.** Tauri can simply show the window once the frontend is ready.
  If a native splash is added later, `ready` is where it comes down.

## Rough order of work

1. `cargo install create-tauri-app` and scaffold `src-tauri/` in this folder
2. Point `frontendDist` at `../../../dist-shell`; run `yarn build:shell` first
3. Add the init script above; confirm the menu hides nothing and the console is clean
4. Check saves survive a restart — that is the real test that the origin is stable
5. Icons: reuse `public/icon-512.png`, as `../mobile/scripts/sync-web.mjs` does
