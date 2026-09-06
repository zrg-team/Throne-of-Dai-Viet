# Approved river app identity

The user selected `dongho-river-v7.png` on 6 September 2026. It is retained byte-for-byte from their supplied image. The boat, ochre sail, stakes and curling waves are the shared app identity.

`dongho-river-foreground-v7.png` and `dongho-river-monochrome-v7.png` are ImageGen derivatives with real alpha for the menu, loading, store artwork, Android layers and iOS tint source. They preserve the approved subject/style but are not pixel-identical extractions. Older v5/v6 files are design history, not active sources.

Run `node scripts/build-icon.mjs` for web/menu assets and `node scripts/build-icon.mjs --mobile apps/mobile/assets` for native icons and splash. Normal mobile sync calls the same exporter. Run `node scripts/build-store-kit.mjs` and `node scripts/build-share.mjs` to refresh store/social materials.

See the [platform pack, standards and checks](../../../docs/design/game-icon-v7/README.md). Android and PWA use their respective safe-area crops. A native rebuild updates installed mobile icons; deployment/upload publishes web and store changes.
