#!/usr/bin/env python3
"""Install the accepted natural-layout settlement and enclosure revisions.

Raw ImageGen review files retain their fake checker preview for traceability.
This installer extracts true alpha into the full-resolution master pack, then
rebuilds the palette-normalized runtime PNGs used by Conquest gameplay.
"""

from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
SOURCE = (
    ROOT
    / "output"
    / "conquest-dongho-review"
    / "attempts"
    / "natural-village-scale-2026-08-31"
)
MASTER = (
    ROOT
    / "output"
    / "conquest-dongho-review"
    / "masters"
    / "front-centered-vertical30-v3"
)
NORMALIZER = ROOT / "scripts" / "conquest-art" / "normalize-front30.py"

ACCEPTED = {
    "building.bamboo-hedge": "building.bamboo-hedge-attempt1-accepted.png",
    "building.improvement-wall": "building.improvement-wall-attempt1-accepted.png",
    "settlement.hamlet": "settlement.hamlet-attempt2-accepted.png",
    "settlement.village": "settlement.village-attempt2-accepted.png",
    "settlement.market-town": "settlement.market-town-attempt1-accepted.png",
    "settlement.shrine-village": "settlement.shrine-village-attempt1-accepted.png",
    "settlement.farmstead": "settlement.farmstead-attempt2-accepted.png",
    "settlement.mine-camp": "settlement.mine-camp-attempt2-accepted.png",
}


def load_extractor():
    path = ROOT / "scripts" / "conquest-art" / "extract-checker-alpha.py"
    spec = importlib.util.spec_from_file_location("conquest_checker_alpha", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load alpha extractor: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.extract


def main() -> None:
    extract = load_extractor()
    MASTER.mkdir(parents=True, exist_ok=True)
    for asset_id, filename in ACCEPTED.items():
        source = SOURCE / filename
        if not source.is_file():
            raise FileNotFoundError(source)
        destination = MASTER / f"{asset_id}.png"
        extract(Image.open(source)).save(destination, optimize=True)
        subprocess.run(
            [sys.executable, str(NORMALIZER), asset_id, str(destination)],
            cwd=ROOT,
            check=True,
        )
        print(f"installed {asset_id} from {filename}")


if __name__ == "__main__":
    main()
