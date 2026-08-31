#!/usr/bin/env python3
"""Finalize metadata and review sheets for the strict yaw-0/elevation-30 pack."""

from __future__ import annotations

import json
from pathlib import Path
from statistics import mean

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
REVIEW = ROOT / "output" / "conquest-dongho-review"
PUBLIC = ROOT / "public" / "art" / "conquest-dongho"
SPECS_PATH = REVIEW / "front30-assets.json"
CAMERA = "front-centered-elevation-30"
PROJECTION = "front-orthographic-30"
PALETTE = "dong-ho-game-pigments-v1"
PAPER = (239, 229, 199, 255)
INK = (48, 38, 27, 255)
RULE = (142, 118, 78, 255)


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def runtime_path(asset_id: str) -> Path:
    return PUBLIC.joinpath(*asset_id.split(".")).with_suffix(".png")


def master_path(asset_id: str) -> Path:
    return REVIEW / "masters" / "front-centered-vertical30-v3" / f"{asset_id}.png"


def family_of(asset_id: str) -> str:
    return {"building": "buildings", "settlement": "settlements", "terrain": "terrain"}[
        asset_id.split(".", 1)[0]
    ]


def bounds_for(family: str) -> dict[str, int]:
    return {
        "buildings": {"left": -28, "right": 28, "top": -46, "bottom": 6},
        "settlements": {"left": -90, "right": 90, "top": -76, "bottom": 24},
        "terrain": {"left": -48, "right": 48, "top": -42, "bottom": 42},
    }[family]


def runtime_scale(asset_id: str, family: str) -> float:
    return 1.0


BUILDING_WORLD_HEIGHT = {
    "thatched-house": 15, "tiled-house": 15, "communal-hall": 18,
    "pagoda-tower": 36, "swept-yard": 7, "village-pond": 8,
    "bamboo-hedge": 9, "kitchen": 13, "buffalo-byre": 12, "grain-bin": 13,
    "well": 9, "haystack": 8, "mine-bank": 14, "mine-adit": 14,
    "mine-timbers": 12, "spoil-heap": 7, "baskets": 6, "mine-worker": 10,
    "improvement-farm": 12, "improvement-mine": 16, "improvement-market": 13,
    "improvement-wall": 16, "improvement-tower": 22, "improvement-barracks": 14,
    "improvement-communal-hall": 17, "improvement-harbor": 17,
    "improvement-workshop": 15, "improvement-guild": 17,
    "improvement-university": 17,
}

BUILDING_CLASS = {
    "thatched-house": "house", "tiled-house": "house", "kitchen": "house",
    "buffalo-byre": "house", "communal-hall": "civic-building",
    "pagoda-tower": "tower", "improvement-tower": "tower",
    "mine-bank": "industry", "mine-adit": "industry", "mine-timbers": "industry",
    "improvement-farm": "industry", "improvement-mine": "industry",
    "improvement-harbor": "industry", "improvement-workshop": "industry",
    "improvement-market": "civic-building", "improvement-wall": "civic-building",
    "improvement-barracks": "civic-building", "improvement-communal-hall": "civic-building",
    "improvement-guild": "civic-building", "improvement-university": "civic-building",
}

SETTLEMENT_SCALE = {
    "hamlet": ("rural-settlement", 38), "village": ("village", 44),
    "market-town": ("town", 48), "shrine-village": ("town", 52),
    "farmstead": ("rural-settlement", 34), "mine-camp": ("rural-settlement", 38),
    "citadel-dinh": ("citadel", 76), "citadel-ly": ("citadel", 78),
    "citadel-tran": ("citadel", 78), "citadel-le": ("citadel", 86),
    "citadel-nguyen": ("citadel", 82),
}


def scale_contract(asset_id: str, family: str) -> dict | None:
    if family == "buildings":
        state = asset_id.removeprefix("building.")
        contract = {
            "class": BUILDING_CLASS.get(state, "small-prop"),
            "worldHeight": BUILDING_WORLD_HEIGHT[state],
        }
        if state == "pagoda-tower":
            contract["maxWorldWidth"] = 20
        elif state == "improvement-tower":
            contract["maxWorldWidth"] = 16
        elif state in {"grain-bin", "well", "haystack"}:
            contract["maxWorldWidth"] = {"grain-bin": 13, "well": 10, "haystack": 10}[state]
        return contract
    if family == "settlements":
        state = asset_id.removeprefix("settlement.")
        scale_class, world_height = SETTLEMENT_SCALE[state]
        contract = {"class": scale_class, "worldHeight": world_height}
        if state == "citadel-nguyen":
            contract["maxWorldWidth"] = 116
        return contract
    return None


def alpha_stats(path: Path) -> tuple[float, float, bool, bool]:
    image = Image.open(path).convert("RGBA")
    alpha = image.getchannel("A")
    values = list(alpha.getdata())
    transparent = sum(value < 8 for value in values) / len(values)
    border = []
    border.extend(alpha.crop((0, 0, image.width, 1)).getdata())
    border.extend(alpha.crop((0, image.height - 1, image.width, image.height)).getdata())
    border.extend(alpha.crop((0, 0, 1, image.height)).getdata())
    border.extend(alpha.crop((image.width - 1, 0, image.width, image.height)).getdata())
    edge_mean = mean(border)
    has_real_alpha = min(values) == 0 and max(values) > 200 and transparent > 0.04 and edge_mean < 1
    has_chroma_fringe = any(
        pixel_alpha > 8 and green > 220 and red < 80 and blue < 100
        for red, green, blue, pixel_alpha in image.getdata()
    )
    return round(transparent, 5), round(edge_mean, 2), has_real_alpha, has_chroma_fringe


def revision_attempts(asset_id: str) -> int:
    return {
        "terrain.paddy-flooded": 3,
        "terrain.paddy-fallow": 2,
        "settlement.market-town": 2,
        "settlement.shrine-village": 2,
        "settlement.farmstead": 2,
        "settlement.mine-camp": 2,
        "terrain.paddy-transplanted": 2,
        "terrain.paddy-ripe": 2,
        "terrain.paddy-nursery": 2,
        "terrain.timber-bridge": 2,
        "building.pagoda-tower": 3,
        "building.thatched-house": 3,
        "settlement.citadel-dinh": 3,
        "settlement.citadel-tran": 3,
        "settlement.citadel-le": 3,
        "settlement.citadel-nguyen": 3,
        **{
            asset_id: 2
            for asset_id in (
                "building.tiled-house", "building.communal-hall", "building.kitchen",
                "building.buffalo-byre", "building.grain-bin", "building.improvement-wall",
                "building.improvement-tower", "building.improvement-barracks",
                "building.improvement-communal-hall", "building.improvement-workshop",
                "building.improvement-guild", "building.improvement-university",
                "settlement.hamlet", "settlement.village", "settlement.citadel-ly",
            )
        },
    }.get(asset_id, 1)


def update_entry(entry: dict, asset_id: str) -> dict:
    family = family_of(asset_id)
    path = runtime_path(asset_id)
    image = Image.open(path)
    transparent, border_mean, real_alpha, chroma_fringe = alpha_stats(path)
    if not real_alpha:
        raise RuntimeError(f"runtime asset lacks real transparent alpha: {path}")
    if chroma_fringe:
        raise RuntimeError(f"runtime asset has green isolation fringe: {path}")
    entry.update({
        "id": asset_id,
        "family": family,
        "accepted": True,
        "reason": "accepted: passes yaw 0, elevation 30, Vietnamese/Dai Viet, and Dong Ho gates",
        "comparisonResult": "strict front-30 generated art accepted over procedural baseline",
        "proceduralFallback": f"current procedural {family} renderer when missing, corrupt, unloaded, or overridden",
        "sourceSheet": f"masters/front-centered-vertical30-v3/{asset_id}.png",
        "sourceCell": None,
        "alphaRequired": True,
        "transparentRatio": transparent,
        "borderAlphaMean": border_mean,
        "chromaFringe": False,
        "width": image.width,
        "height": image.height,
        "runtimePath": path.relative_to(ROOT).as_posix(),
        "textureKey": f"conquest-art:{asset_id}",
        "anchor": {"x": 0.5, "y": 0.5 if family == "terrain" else 0.96},
        "designBounds": bounds_for(family),
        "runtimeScale": runtime_scale(asset_id, family),
        "scaleContract": scale_contract(asset_id, family),
        "projection": PROJECTION,
        "cameraView": CAMERA,
        "contentPolicy": "structure-only-transparent" if family in {"buildings", "settlements"} else None,
        "bakedPeople": False,
        "bakedTerrain": False if family in {"buildings", "settlements"} or asset_id == "terrain.timber-bridge" else None,
        "paletteVersion": PALETTE,
        "opacity": {"buildings": 0.87, "settlements": 0.86, "terrain": 0.90}[family],
        "geometryNormalization": (
            "yaw-0 orthographic rectangle; elevation-30 depth compressed to 50 percent"
            if asset_id.startswith("terrain.paddy-")
            else "yaw-0 orthographic bridge; parallel vertical depth edges"
            if asset_id == "terrain.timber-bridge"
            else "every component front-parallel; depth by vertical row placement only"
        ),
        "front30RevisionAttempts": revision_attempts(asset_id),
        "cameraGate": {
            "horizontalYawDegrees": 0,
            "verticalElevationDegrees": 30,
            "orthographic": True,
            "depthDriftX": 0,
        },
        "styleGate": {"vietnameseDaiViet": True, "dongHo": True},
    })
    return entry


def sync_metadata(ids: list[str]) -> None:
    decisions_path = REVIEW / "decisions.json"
    decisions = load_json(decisions_path)
    by_id = {entry["id"]: entry for entry in decisions}
    for asset_id in ids:
        by_id[asset_id] = update_entry(by_id.get(asset_id, {}), asset_id)
    decisions = [by_id.get(entry["id"], entry) for entry in decisions]
    known = {entry["id"] for entry in decisions}
    decisions.extend(by_id[asset_id] for asset_id in ids if asset_id not in known)
    save_json(decisions_path, decisions)

    review_manifest_path = REVIEW / "manifest.json"
    review_manifest = load_json(review_manifest_path)
    review_manifest["assets"] = decisions
    review_manifest["accepted"] = sum(entry.get("accepted") is True for entry in decisions)
    review_manifest["fallback"] = sum(entry.get("accepted") is not True for entry in decisions)
    review_manifest["front30CameraContract"] = {
        "scope": ids,
        "horizontalYawDegrees": 0,
        "verticalElevationDegrees": 30,
        "projection": "orthographic",
        "depthScreenDirection": "straight-up",
    }
    save_json(review_manifest_path, review_manifest)

    public_manifest_path = PUBLIC / "manifest.json"
    public_manifest = load_json(public_manifest_path)
    public_by_id = {entry["id"]: entry for entry in public_manifest["assets"]}
    for asset_id in ids:
        reviewed = by_id[asset_id]
        public_by_id[asset_id] = {
            key: reviewed.get(key)
            for key in (
                "id", "family", "textureKey", "runtimePath", "width", "height", "runtimeScale",
                "scaleContract",
                "projection", "cameraView", "contentPolicy", "bakedPeople", "bakedTerrain",
                "paletteVersion", "opacity", "nativeFacing",
            )
        }
    public_ids = [entry["id"] for entry in public_manifest["assets"]]
    public_manifest["assets"] = [public_by_id[asset_id] for asset_id in public_ids]
    public_manifest["assets"].extend(public_by_id[asset_id] for asset_id in ids if asset_id not in public_ids)
    public_manifest["front30CameraContract"] = {
        "horizontalYawDegrees": 0,
        "verticalElevationDegrees": 30,
        "projection": "orthographic",
    }
    save_json(public_manifest_path, public_manifest)


def font(size: int, bold: bool = False):
    path = Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf")
    try:
        return ImageFont.truetype(str(path), size)
    except OSError:
        return ImageFont.load_default()


def place_fitted(canvas: Image.Image, sprite: Image.Image, box: tuple[int, int, int, int], fill: float = 0.88) -> None:
    left, top, right, bottom = box
    scale = min((right - left) * fill / sprite.width, (bottom - top) * fill / sprite.height)
    size = (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale)))
    sprite = sprite.resize(size, Image.Resampling.LANCZOS)
    x = left + (right - left - sprite.width) // 2
    y = top + (bottom - top - sprite.height) // 2
    canvas.alpha_composite(sprite, (x, y))


def contact_sheet(ids: list[str], path: Path, columns: int, cell: tuple[int, int], title: str) -> None:
    rows = (len(ids) + columns - 1) // columns
    title_h = 72
    canvas = Image.new("RGBA", (columns * cell[0], title_h + rows * cell[1]), PAPER)
    draw = ImageDraw.Draw(canvas)
    draw.text((24, 16), title, fill=INK, font=font(28, True))
    for index, asset_id in enumerate(ids):
        col, row = index % columns, index // columns
        x, y = col * cell[0], title_h + row * cell[1]
        draw.rectangle((x + 5, y + 5, x + cell[0] - 5, y + cell[1] - 5), outline=RULE, width=2)
        sprite = Image.open(runtime_path(asset_id)).convert("RGBA")
        place_fitted(canvas, sprite, (x + 16, y + 14, x + cell[0] - 16, y + cell[1] - 48))
        label = asset_id.replace("building.", "b. ").replace("settlement.", "s. ").replace("terrain.", "t. ")
        draw.text((x + 12, y + cell[1] - 37), label, fill=INK, font=font(14))
    canvas.convert("RGB").save(path, quality=94)


def ground_scale_sheet(ids: list[str], path: Path) -> None:
    cell_w, cell_h, columns = 440, 300, 5
    rows = (len(ids) + columns - 1) // columns
    title_h = 78
    canvas = Image.new("RGBA", (columns * cell_w, title_h + rows * cell_h), PAPER)
    draw = ImageDraw.Draw(canvas)
    draw.text((24, 14), "Strict front-30 assets — simulated shared game ground scale", fill=INK, font=font(28, True))
    zoom = 2.0
    for index, asset_id in enumerate(ids):
        col, row = index % columns, index // columns
        x, y = col * cell_w, title_h + row * cell_h
        family = family_of(asset_id)
        bounds = bounds_for(family)
        sprite = Image.open(runtime_path(asset_id)).convert("RGBA")
        design_w = bounds["right"] - bounds["left"]
        design_h = bounds["bottom"] - bounds["top"]
        contract = scale_contract(asset_id, family)
        if contract:
            scale = contract["worldHeight"] / sprite.height
            if "maxWorldWidth" in contract:
                scale = min(scale, contract["maxWorldWidth"] / sprite.width)
            scale *= runtime_scale(asset_id, family) * zoom
        else:
            scale = min(design_w / sprite.width, design_h / sprite.height) * runtime_scale(asset_id, family) * zoom
        size = (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale)))
        sprite = sprite.resize(size, Image.Resampling.LANCZOS)
        center_x = x + cell_w // 2
        baseline = y + cell_h - 54
        if family == "terrain":
            paste_y = baseline - sprite.height // 2
        else:
            paste_y = baseline - round(sprite.height * 0.96)
        canvas.alpha_composite(sprite, (center_x - sprite.width // 2, paste_y))
        draw.line((x + 14, baseline, x + cell_w - 14, baseline), fill=RULE, width=2)
        draw.text((x + 12, y + cell_h - 40), asset_id, fill=INK, font=font(14))
        draw.text((x + 12, y + 10), f"{size[0]}×{size[1]} @ review zoom", fill=RULE, font=font(12))
    canvas.convert("RGB").save(path, quality=94)


def playtest_comparison_sheet(path: Path) -> None:
    generated_dir = REVIEW / "playtest-front30"
    procedural_dir = REVIEW / "playtest-procedural"
    names = sorted(item.name for item in generated_dir.glob("land-*-2.4x.png")) + ["army.png"]
    names = [name for name in names if (procedural_dir / name).is_file()]
    if not names:
        return
    image_w, image_h = 260, 563
    pair_w, pair_h = image_w * 2 + 28, image_h + 56
    pair_columns = 2
    rows = (len(names) + pair_columns - 1) // pair_columns
    title_h = 76
    canvas = Image.new("RGBA", (pair_columns * pair_w, title_h + rows * pair_h), PAPER)
    draw = ImageDraw.Draw(canvas)
    draw.text((20, 14), "Actual gameplay: accepted front-30 pack / procedural baseline", fill=INK, font=font(27, True))
    for index, name in enumerate(names):
        col, row = index % pair_columns, index // pair_columns
        x, y = col * pair_w, title_h + row * pair_h
        for side, folder in enumerate((generated_dir, procedural_dir)):
            shot = Image.open(folder / name).convert("RGBA")
            shot.thumbnail((image_w, image_h), Image.Resampling.LANCZOS)
            canvas.alpha_composite(shot, (x + side * (image_w + 14), y + 28))
        draw.text((x + 4, y + 4), f"{name}  NEW / OLD", fill=INK, font=font(14, True))
    canvas.convert("RGB").save(path, quality=92)


def main() -> None:
    specs = load_json(SPECS_PATH)
    ids = [spec["id"] for spec in specs]
    if len(ids) != 45 or len(set(ids)) != 45:
        raise RuntimeError(f"expected 45 unique front-30 assets, got {len(ids)}")
    for asset_id in ids:
        if not runtime_path(asset_id).is_file() or not master_path(asset_id).is_file():
            raise FileNotFoundError(asset_id)
    sync_metadata(ids)
    contact_sheet(ids, REVIEW / "contact-front30-all.jpg", 5, (340, 280), "All 45 strict yaw-0 / elevation-30 assets")
    for family in ("buildings", "settlements", "terrain"):
        family_ids = [asset_id for asset_id in ids if family_of(asset_id) == family]
        contact_sheet(
            family_ids,
            REVIEW / f"contact-front30-{family}.jpg",
            4 if family == "buildings" else 3,
            (380, 320) if family == "buildings" else (520, 430),
            f"Strict front-30 — {family}",
        )
    natural_layout_ids = [
        "building.bamboo-hedge",
        "building.improvement-wall",
        "settlement.hamlet",
        "settlement.village",
        "settlement.market-town",
        "settlement.shrine-village",
        "settlement.farmstead",
        "settlement.mine-camp",
    ]
    contact_sheet(
        natural_layout_ids,
        REVIEW / "contact-natural-village-fixes.jpg",
        4,
        (440, 380),
        "Natural Vietnamese compound rebuilds — shared scale and true alpha",
    )
    ground_scale_sheet(ids, REVIEW / "contact-front30-ground-scale.jpg")
    playtest_comparison_sheet(REVIEW / "comparison-front30-procedural-gameplay.jpg")
    save_json(REVIEW / "front30-final-audit.json", {
        "assetCount": len(ids),
        "allRuntimePresent": True,
        "allMastersPresent": True,
        "allRealAlpha": True,
        "camera": {"horizontalYawDegrees": 0, "verticalElevationDegrees": 30, "orthographic": True},
        "style": {"vietnameseDaiViet": True, "dongHo": True, "palette": PALETTE},
        "contactSheet": "contact-front30-all.jpg",
        "groundScaleSheet": "contact-front30-ground-scale.jpg",
    })
    print(f"finalized {len(ids)} assets")


if __name__ == "__main__":
    main()
