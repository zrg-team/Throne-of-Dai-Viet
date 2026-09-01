# Deprecated gameplay screens

The game is being narrowed to **Dragon Ascent (conquest) and the battle screen**. Everything in
this folder belongs to the three modes that are no longer the focus:

| Mode | Menu name | What it used |
|---|---|---|
| `rival` | the original two-realm game | `MapScene` + `UIScene` |
| `campaign` | the scripted campaign | `CampaignScene` → `MapScene` + `UIScene` |
| `empire` | Throne of Empires | `MapScene` + `UIScene` |

## What is in here

- **`CampaignScene.ts`** — the setup screen those three modes start from.
- **`UIScene.ts`** — their HUD: the header strip, the action bar, the land panel, every lane and
  panel the classic modes open. Dragon Ascent has its own (`ConquestUIScene`) and shares none of it.

## What is *not* in here, and why

These look like they belong to the old modes and do not:

- **`../MapScene.ts`** — `ConquestScene extends MapScene`. It is the conquest world screen's own
  base class: the hex map, the bake, view culling, the army and settlement renderers. Moving it
  would move conquest with it.
- **`../BattleArenaScene.ts`** — The Field, the battle setup screen. That is the half of the game
  being kept.
- **`../../systems/empire/`** — Ascent builds from `createEmpireGameState`; the invasion director,
  the mandate and the Great Powers all run inside a conquest run. The folder is named for where
  the code came from, not for a mode that is going away.

## Status

Still registered in `game/config.ts`, still reachable from the menu, still exercised by the
`smoke` gate — nothing has been switched off. This folder records the decision and keeps the
retired screens out of the way of the ones being worked on. Deleting them, or dropping their
modes from the menu, is a separate step: `__startBenchGame`, `MapScene.uiSceneKey()` and every
`verify-*` that boots `rival`, `campaign` or `empire` all still expect them to be there.
