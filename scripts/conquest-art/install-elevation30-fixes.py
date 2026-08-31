#!/usr/bin/env python3
"""Install the reviewed strict elevation-30 structural replacements.

Accepted and rejected ImageGen outputs are retained in the review folder. The
accepted source is converted from the pale checker matte to real alpha, stored
as the full-resolution master, and normalized into the runtime pack.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
REVIEW = ROOT / "output" / "conquest-dongho-review"
MASTERS = REVIEW / "masters" / "front-centered-vertical30-v3"
ATTEMPTS = REVIEW / "attempts" / "elevation30-fix-2026-08-30"
GENERATED = Path(
    "C:/Users/zerg/.codex/generated_images/"
    "01a0490d-eaa5-7cf0-8b2f-677a8832bc02"
)


ACCEPTED = {
    "terrain.paddy-flooded": "exec-2537a376-1d2f-46d1-b6ba-554535c60b08.png",
    "terrain.paddy-fallow": "exec-4afcdcfa-2681-415f-b3d1-470bb59690b8.png",
    "terrain.paddy-transplanted": "exec-d8895588-af1f-457d-8e93-765519f09134.png",
    "terrain.paddy-ripe": "exec-8f1c96cb-0758-44b9-b72a-e0db59f155f1.png",
    "terrain.paddy-nursery": "exec-04961896-f242-451d-b9eb-2bf3cc51a198.png",
    "terrain.timber-bridge": "exec-dbe67166-1773-432a-97e1-c8b20d68c698.png",
    "building.pagoda-tower": "exec-1e686047-f8c6-4c47-8ff5-e462ace061f9.png",
    "building.thatched-house": "exec-f057909f-f9ed-4588-a767-2a4428670d46.png",
    "building.tiled-house": "exec-53719c23-01ae-4122-9dde-3229c14235e9.png",
    "building.communal-hall": "exec-788cb7e2-bf2d-49ec-b167-676a25e7056c.png",
    "building.kitchen": "exec-ab4e5783-4600-411e-af00-196de68233bd.png",
    "building.buffalo-byre": "exec-84f4477f-dd7a-4a5c-b2ae-52cb9afd939a.png",
    "building.grain-bin": "exec-1cd3a2d4-c396-47b2-8e7e-fdcef7a5f92e.png",
    "building.improvement-wall": "exec-3a0562fc-60fc-4ffb-99c2-9f9c32b1005e.png",
    "building.improvement-tower": "exec-3e00b6e7-e997-4dbf-9173-a6b611101ea2.png",
    "building.improvement-barracks": "exec-6a9fbcee-542c-402f-adb6-a76a061393db.png",
    "building.improvement-communal-hall": "exec-42117e1f-7f7b-45e3-a5a1-4e071f3013f2.png",
    "building.improvement-workshop": "exec-556064c9-6f05-46fe-930c-eb8c0efd957b.png",
    "building.improvement-guild": "exec-d3729f25-c5ee-4ee5-b155-41b4557db6cd.png",
    "building.improvement-university": "exec-0386c9bc-8527-49b0-ad68-77f11e80616e.png",
    "settlement.citadel-dinh": "exec-b97d11b3-d848-47e6-a4f8-7865a0e98eae.png",
    "settlement.citadel-ly": "exec-b4f763ed-b3ca-411a-bd61-7ec4c5b55d50.png",
    "settlement.citadel-tran": "exec-ff31e6fa-5ae1-4427-bb8e-b96ebf6e530f.png",
    "settlement.citadel-le": "exec-e1b0862d-7e49-436f-8cf7-db8c599231fc.png",
    "settlement.citadel-nguyen": "exec-92c89338-21a9-483a-8e12-ebbc63ff2b4a.png",
    "settlement.hamlet": "exec-ba6711b0-71e2-4520-b3a5-2e7558a82fd0.png",
    "settlement.village": "exec-4ff629d9-c7d9-4e4b-97f2-93934d545c11.png",
    "settlement.market-town": "exec-e8e0ce22-6b13-4e3c-8b32-01a4532e152c.png",
    "settlement.shrine-village": "exec-c85e92a8-a696-47ba-819d-ad97eb2b7ed9.png",
    "settlement.farmstead": "exec-b9b0089f-dc94-4b31-869f-3f54108368a6.png",
    "settlement.mine-camp": "exec-26c71d46-53ce-4a54-8d63-85681fc9e86f.png",
}


REJECTED = {
    "terrain.paddy-flooded": [
        ("exec-637da4", "perspective trapezoid instead of yaw-0 orthographic footprint"),
    ],
    "building.thatched-house": [
        ("exec-2f963fd6-c225-4796-a7b5-39e68d58c012.png", "dark baked backdrop"),
    ],
    "building.pagoda-tower": [
        ("exec-0a6a74d4-c107-4d81-93c3-d58e68818471.png", "camera passed but massing read as a generic ziggurat instead of a slender Vietnamese brick pagoda"),
    ],
    "settlement.citadel-dinh": [
        ("exec-4464cfe5-0d56-438f-9fe5-31f765e6cef4.png", "baked dark background and courtyard"),
    ],
    "settlement.citadel-tran": [
        ("exec-579faab7-209a-45d1-996c-cd10cd0726a8.png", "baked wooden courtyard deck"),
    ],
    "settlement.citadel-le": [
        ("exec-1f3db83f-aa24-4e62-b29c-ac4e59e279b8.png", "baked paved courtyard"),
    ],
    "settlement.citadel-nguyen": [
        ("exec-76750a4b-4778-4912-a733-9fb09190fed1.png", "baked paved courtyard"),
    ],
}


def resolve_partial(name: str) -> Path | None:
    direct = GENERATED / name
    if direct.is_file():
        return direct
    matches = list(GENERATED.glob(f"{name}*.png"))
    return matches[0] if len(matches) == 1 else None


def main() -> None:
    extractor = ROOT / "scripts" / "conquest-art" / "extract-checker-alpha.py"
    normalizer = ROOT / "scripts" / "conquest-art" / "normalize-front30.py"
    ATTEMPTS.mkdir(parents=True, exist_ok=True)
    audit = {
        "cameraContract": {
            "horizontalYawDegrees": 0,
            "verticalElevationDegrees": 30,
            "projection": "orthographic-front-centered",
            "proof": [
                "deep roof upper plane",
                "platform and floor top plane",
                "stair-tread top planes",
                "wall-walk or parapet top plane when applicable",
                "zero horizontal depth drift",
            ],
        },
        "styleContract": ["Vietnamese/Dai Viet", "Dong Ho woodblock", "game palette"],
        "accepted": [],
        "rejected": [],
    }

    for asset_id, filename in ACCEPTED.items():
        source = GENERATED / filename
        if not source.is_file():
            raise FileNotFoundError(source)
        attempt_dir = ATTEMPTS / asset_id
        attempt_dir.mkdir(parents=True, exist_ok=True)
        retained = attempt_dir / "accepted.png"
        shutil.copy2(source, retained)
        master = MASTERS / f"{asset_id}.png"
        subprocess.run([sys.executable, str(extractor), str(source), str(master)], check=True)
        subprocess.run([sys.executable, str(normalizer), asset_id, str(master)], check=True)
        audit["accepted"].append({
            "id": asset_id,
            "generatedSource": filename,
            "retainedPath": retained.relative_to(ROOT).as_posix(),
            "masterPath": master.relative_to(ROOT).as_posix(),
        })

    for asset_id, attempts in REJECTED.items():
        attempt_dir = ATTEMPTS / asset_id
        attempt_dir.mkdir(parents=True, exist_ok=True)
        for index, (filename, reason) in enumerate(attempts, start=1):
            source = resolve_partial(filename)
            retained = None
            if source is not None:
                retained = attempt_dir / f"rejected-{index}.png"
                shutil.copy2(source, retained)
            audit["rejected"].append({
                "id": asset_id,
                "generatedSource": filename,
                "retainedPath": retained.relative_to(ROOT).as_posix() if retained else None,
                "reason": reason,
            })

    (ATTEMPTS / "audit.json").write_text(
        json.dumps(audit, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"installed {len(ACCEPTED)} strict elevation-30 replacements")


if __name__ == "__main__":
    main()
