Original prompt: Please implement the proposed Mandate of Đại Việt documentation and Phaser 3 TypeScript mobile-vertical MVP plan.

## Progress
- Created a Vite + TypeScript + Phaser 3 scaffold.
- Added comprehensive game design and implementation docs under `docs/`.
- Added data-driven MVP game state, systems, scenes, and mobile UI helpers.
- Installed npm dependencies.
- `npm run build` passes with a Vite chunk-size warning from Phaser bundle size.
- Browser verification passed for visible portrait rendering, land selection, peaceful acquisition, hero recruitment, and army movement.
- Kept `Phaser.AUTO` and added `preserveDrawingBuffer` so Playwright screenshots render reliably.
- Improved UI/UX to a paper strategy style: province-area map, watercolor terrain, river/roads, settlement clusters, parchment bars, paper land panels, Tinder-style hero/politics cards, and large animated soldier formations.
- Browser verification passed for the new visual map, hero card stack, politics card, marching soldier animation, and polygon-area acquisition.
- Smoothed map readability by making roads/borders faint and adding clear terrain textures for rice fields, forest, mountains, open fields, cities, and river.
- Browser verification passed for the clearer texture map and province acquisition after the hit-area changes.
- Added a reusable procedural hero face renderer with deterministic random eyes, mouth, nose, beard, hair, hats, shirts, skin tones, hair colors, and outfit colors per hero id.
- Browser verification passed for the updated hero card portrait layout.
- Corrected the campaign model from turn-based to real-time: removed visible Orders/End controls, added automatic real-time progression, and deleted the stale TurnSystem.
- Enlarged the map world and added drag panning while keeping the UI vertical and fixed.
- Browser verification passed for enlarged map rendering, drag-panned map view, and automatic time/resource progression on localhost:5173.
- Replaced bottom-sheet hero/court/war interactions with paused full-screen gameplay screens: hero recruitment cards, court assignment, and army creation.
- Renamed the bottom `War` action to `Army`, added soldier allocation and led army creation from recruited heroes.
- Fixed dead/leaking UI taps by adding DOM-level canvas tap routing for bottom buttons, modal controls, and map province selection.
- Court events now appear as pending map requests instead of immediately opening/pause-stealing a card; opening the request pauses gameplay.
- Browser verification passed for Heroes tap, recruit flow, Court assignment screen, Army creation, and direct land selection on localhost:5173.
- Rebuilt `FaceRenderer` as a constrained layered portrait renderer: dark frame, centered face, fixed facial feature zones, restrained hats/body/props, and hero-type style pools to avoid unreadable overlaps.
- Adjusted `HeroDraftPanel` portrait scale/position so the older bottom-sheet card layout no longer lets the face overlap text.
- Browser verification passed for the new fullscreen hero recruitment portrait on localhost:5173.
- Simplified hero portraits further: removed portrait props, replaced angular split head with a centered oval face, moved the hat into a centered top-only zone, and reverified the fullscreen hero card screenshot.
- Fixed the remaining portrait anatomy issues: beard is now separate anchored left/right/chin pieces, shirt is a centered robe/collar layout, and generals always use the stable centered beard/hat silhouette.
- Locked hero portrait anatomy to one fixed centered template: one wrap hat, one goatee beard, one centered robe, no drifting face shading layer, and verified the full-screen hero card screenshot.
- Replaced the portrait renderer with a minimal symmetric template: fixed x=0 hat, face, goatee, and shirt; removed random geometry, side arms, robe split, and beard highlights that made placement read off-center.
- Reworked portrait coordinates to derive hat, beard, and shirt from `FACE_X`, `HEAD_TOP`, and `CHIN_Y`; replaced polygon point-cloud shirt with centered primitives and removed shoulder triangles after screenshot verification.
- Replaced the triangle hat/beard with a centered rounded cap, centered hat band, centered moustache, and centered goatee; verified the hero card screenshot on localhost.
- Adjusted the portrait again so the collar is a mirrored centered V, the cap/band sits closer to the head, and the rounded head is no longer cut flat by the hat.
- Added a hair layer under the hat with centered fringe and side hair, and moved collar rendering into a separate centered V layer drawn after the head so it is not hidden/skewed by shirt/head order.
- Added deterministic random face variants while preserving the fixed portrait anchors: head shape/size, eyes, nose, mouth, beard, collar, shirt, hat, skin, hair, beard, and outfit colors now vary per hero id.

## TODO
- Future work: broaden automated gameplay checks for multi-turn battle capture and victory flow.
- Future work: split Phaser into a separate manual chunk if the Vite bundle-size warning becomes a release concern.
- Future work: replace generated paper/settlement drawings with final custom art assets once an art direction is locked.
- Future work: expose the face recipe in hero detail/debug UI if designers want manual overrides per named hero.
