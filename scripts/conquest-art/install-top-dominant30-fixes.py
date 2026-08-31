#!/usr/bin/env python3
"""Install the reviewed top-dominant yaw-0/elevation-30 structure repairs."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
REVIEW = ROOT / "output" / "conquest-dongho-review"
MASTERS = REVIEW / "masters" / "front-centered-vertical30-v3"
ATTEMPTS = REVIEW / "attempts" / "top-dominant30-fix-2026-08-30"
GENERATED = Path(
    "C:/Users/zerg/.codex/generated_images/"
    "01a0490d-eaa5-7cf0-8b2f-677a8832bc02"
)


ACCEPTED = {
    "building.thatched-house": "exec-8897f55d-aa47-48b1-9639-9a7070dee338.png",
    "building.tiled-house": "exec-7e908bd7-8ff7-408b-9624-ded7ccfa044b.png",
    "building.communal-hall": "exec-ddd18636-c4b4-4541-b117-919846a8ab65.png",
    "building.pagoda-tower": "exec-b2e2d47b-7239-4a4a-94e8-d25574dc3bb0.png",
    "building.kitchen": "exec-7abefc79-890a-4956-923a-66e564e1c92f.png",
    "building.buffalo-byre": "exec-5d15c6f4-228b-4717-906c-e4f63b311d19.png",
    "building.grain-bin": "exec-96d2cfd7-addc-4827-8433-61ee32c32402.png",
    "building.improvement-farm": "exec-bc013c67-ae07-490b-bf89-c01f23b3d978.png",
    "building.improvement-mine": "exec-88b1471a-6001-4fcc-82d7-e5435641b327.png",
    "building.improvement-market": "exec-4b6b476a-5785-4aef-83fb-acb1613de1b4.png",
    "building.improvement-wall": "exec-14d513ba-9a5c-4fed-aa34-dfd64b1dd77b.png",
    "building.improvement-tower": "exec-bfa4c03c-6022-45d3-a3ca-932aec374219.png",
    "building.improvement-barracks": "exec-f04e968a-9ed9-467c-ad2a-5f76569136e8.png",
    "building.improvement-communal-hall": "exec-6f83624f-7c44-400d-82fc-85c63449d8eb.png",
    "building.improvement-workshop": "exec-a002ff5d-bf91-4438-867f-680111a82111.png",
    "building.improvement-guild": "exec-a590e367-f822-41cc-a9f5-4784fe663d7a.png",
    "building.improvement-university": "exec-2dd161a4-a51f-475b-8bb6-4f3ddebab37b.png",
    "settlement.hamlet": "exec-da08e238-4dd7-4129-aeb0-0a4757464dca.png",
    "settlement.village": "exec-285c680f-14eb-46b0-969e-c9895d91b706.png",
    "settlement.market-town": "exec-9960ec7b-9eee-4ac3-8223-1f8cd8fd06f6.png",
    "settlement.shrine-village": "exec-e65e9692-948b-4b97-8bcb-08976543d684.png",
    "settlement.farmstead": "exec-4208f089-dc2a-467a-ac50-a8438082625e.png",
    "settlement.citadel-dinh": "exec-b2bec004-6fbc-4b4b-b6fe-602a01129f4f.png",
    "settlement.citadel-ly": "exec-0419539a-43d8-47f9-a09e-9a56bc8e4484.png",
    "settlement.citadel-tran": "exec-c4feacf3-8f13-4435-ba47-68a2fcdd6f4a.png",
    "settlement.citadel-le": "exec-ed4fa93f-c056-4619-92bc-7e750323d358.png",
    "settlement.citadel-nguyen": "exec-7f3c7ffb-f663-4831-bcdf-d15720a2347e.png",
}


REJECTED = {
    "building.improvement-farm": [
        ("exec-591a1cb8-58f0-43e7-af81-fcd427f196af.png", "baked continuous courtyard/platform slab"),
    ],
    "building.improvement-wall": [
        ("exec-399d0ade-9897-4bbc-8ab5-ddfa61790f64.png", "baked interior courtyard slab"),
    ],
    "settlement.farmstead": [
        ("exec-63b3822b-a3ca-48b3-8dfc-3ae12e6a9ccd.png", "unrequested perimeter fence and gate"),
    ],
    "settlement.citadel-dinh": [
        ("exec-aee9189f-be18-47ba-b37d-aad0162941a2.png", "perspective side-wall convergence"),
    ],
}


def run_tool(script: Path, *args: str) -> None:
    subprocess.run([sys.executable, str(script), *args], check=True)


def main() -> None:
    extractor = ROOT / "scripts" / "conquest-art" / "extract-checker-alpha.py"
    normalizer = ROOT / "scripts" / "conquest-art" / "normalize-front30.py"
    ATTEMPTS.mkdir(parents=True, exist_ok=True)

    audit = {
        "cameraContract": {
            "horizontalYawDegrees": 0,
            "verticalElevationDegrees": 30,
            "projection": "front-centered-orthographic",
            "visualAcceptance": [
                "roof/deck upper plane dominates over frontal elevation",
                "facades are strongly foreshortened",
                "stair-tread and platform tops are visible",
                "bilateral symmetry with no left/right yaw",
                "compound gaps remain transparent",
            ],
        },
        "styleContract": [
            "Vietnamese/Dai Viet historical forms",
            "Dong Ho woodblock outlines and flat pigments",
            "conquest game palette",
            "no baked terrain, people, or animals",
        ],
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
        run_tool(extractor, str(source), str(master))
        run_tool(normalizer, asset_id, str(master))
        audit["accepted"].append({
            "id": asset_id,
            "source": filename,
            "retainedPath": retained.relative_to(ROOT).as_posix(),
            "masterPath": master.relative_to(ROOT).as_posix(),
        })

    for asset_id, variants in REJECTED.items():
        attempt_dir = ATTEMPTS / asset_id
        attempt_dir.mkdir(parents=True, exist_ok=True)
        for index, (filename, reason) in enumerate(variants, start=1):
            source = GENERATED / filename
            retained = None
            if source.is_file():
                retained = attempt_dir / f"rejected-{index}.png"
                shutil.copy2(source, retained)
            audit["rejected"].append({
                "id": asset_id,
                "source": filename,
                "retainedPath": retained.relative_to(ROOT).as_posix() if retained else None,
                "reason": reason,
            })

    (ATTEMPTS / "audit.json").write_text(
        json.dumps(audit, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"installed {len(ACCEPTED)} top-dominant elevation-30 replacements")


if __name__ == "__main__":
    main()
