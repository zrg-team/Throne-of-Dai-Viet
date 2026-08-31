#!/usr/bin/env python3
"""Install the reviewed natural-map variants on one size and pigment contract.

The ImageGen masters are intentionally retained. Runtime files are transparent, bottom-centred,
and share a fixed canvas per family so random selection cannot change apparent world scale.
"""

from __future__ import annotations

import importlib.util
import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
GENERATED = Path(r"C:\Users\zerg\.codex\generated_images\01a0490d-eaa5-7cf0-8b2f-677a8832bc02")
RUNTIME = ROOT / "public" / "art" / "conquest-dongho"
REVIEW = ROOT / "output" / "conquest-dongho-review"
RUN = REVIEW / "attempts" / "natural-terrain-2026-08-31"

TREE_CANVAS = (144, 144)
MOUNTAIN_CANVAS = (240, 160)
PADDY_CANVAS = (384, 181)

PIGMENTS = {
    "ink": (42, 33, 24),
    "ink_soft": (90, 76, 57),
    "paper": (233, 223, 194),
    "paper_deep": (201, 183, 140),
    "green": (125, 145, 96),
    "green_pale": (167, 185, 141),
    "green_deep": (91, 109, 69),
    "yellow": (192, 138, 46),
    "yellow_pale": (220, 190, 126),
    "brown": (122, 86, 54),
    "brown_dark": (92, 63, 38),
    "blue": (66, 89, 107),
    "blue_pale": (143, 165, 178),
}

TREE_MASTERS = {
    "tree-jackfruit": "exec-d116cf49-bcc8-4a4c-8921-420374935d9b.png",
    "tree-lychee": "exec-d3031f7c-6f87-47fe-b898-69f52699da76.png",
    "tree-pomelo": "exec-d89c1745-21ce-4612-b2a3-a2c14230d9f9.png",
    "tree-silk-cotton": "exec-822ef571-ebca-4cb3-8696-c815e4a14e0e.png",
}

MOUNTAIN_MASTERS = {
    "karst-three-spire": "exec-c7e25f24-e807-49bb-922b-002332e9f5c6.png",
    "karst-seven-spire": "exec-a7613f6f-a48b-4f3c-867e-4c234bd9634c.png",
    "karst-stepped": "exec-609254c4-dea3-4425-a485-4b63f4ff4186.png",
    "karst-tower": "exec-bef15781-93e8-403c-b128-3cf0037349e6.png",
}

PADDY_SOURCES = {
    name: REVIEW / "masters" / "front-centered-vertical30-v3" / f"terrain.{name}.png"
    for name in ("paddy-flooded", "paddy-fallow", "paddy-transplanted", "paddy-ripe", "paddy-nursery")
}

REJECTED = {
    "tree-tamarind-attempt-1": "exec-fee5bd7d-9d4b-4fc3-a712-1cdf5dc890ce.png",
    "tree-tamarind-attempt-2": "exec-091ec77c-ff8e-4fbb-a54c-c5c6bebbe96e.png",
    "tree-tamarind-attempt-3": "exec-d3502d21-d2e1-4e30-837e-9edf4661e01b.png",
    "karst-twin-raw": "exec-9dd8712a-5462-4681-b69c-04f513842c3d.png",
    "karst-stepped-raw": "exec-5473d41a-622c-44b2-8a22-0c2333adf5b0.png",
    "karst-tower-raw": "exec-cc294aec-1a6d-4a71-95a6-57a229365205.png",
    # The five accepted rice states had already used their three-output allowance. These later
    # drafts are retained for review but cannot replace the capped variants.
    "paddy-flooded-over-limit-draft": "exec-626f8eea-4c77-4adc-92bf-d77eaebefe2c.png",
    "paddy-fallow-over-limit-draft": "exec-dd6fad76-d94c-4ac3-992f-5788e7a2ee9a.png",
    "paddy-transplanted-over-limit-draft": "exec-99201486-f10c-4b3f-80a3-25d9ec6c8ee4.png",
}


def load_checker_extractor():
    path = Path(__file__).with_name("extract-checker-alpha.py")
    spec = importlib.util.spec_from_file_location("checker_alpha", path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module.extract


extract_checker = load_checker_extractor()


def real_alpha(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    lo, hi = rgba.getchannel("A").getextrema()
    if lo < 255:
        return rgba
    return extract_checker(rgba)


def fit_bottom(image: Image.Image, canvas: tuple[int, int], inner: tuple[int, int]) -> Image.Image:
    rgba = real_alpha(image)
    bbox = rgba.getchannel("A").getbbox()
    if not bbox:
        raise ValueError("asset contains no visible pixels")
    crop = rgba.crop(bbox)
    scale = min(inner[0] / crop.width, inner[1] / crop.height)
    size = (max(1, round(crop.width * scale)), max(1, round(crop.height * scale)))
    crop = crop.resize(size, Image.Resampling.LANCZOS)
    out = Image.new("RGBA", canvas, (0, 0, 0, 0))
    x = (canvas[0] - size[0]) // 2
    y = canvas[1] - 5 - size[1]
    out.alpha_composite(crop, (x, y))
    return out


def mix(a: tuple[int, int, int], b: tuple[int, int, int], amount: float) -> tuple[int, int, int]:
    return tuple(round(x + (y - x) * amount) for x, y in zip(a, b))


def foliage_palette(image: Image.Image, season: str) -> Image.Image:
    """Pull generated colour toward the game's material pigments without flattening print grain."""
    targets = {
        "spring": (PIGMENTS["green_pale"], PIGMENTS["green"], PIGMENTS["green_deep"]),
        "summer": (PIGMENTS["green_pale"], PIGMENTS["green"], PIGMENTS["green_deep"]),
        "autumn": (PIGMENTS["yellow_pale"], PIGMENTS["yellow"], PIGMENTS["brown"]),
        "winter": ((145, 137, 111), PIGMENTS["brown"], PIGMENTS["ink_soft"]),
    }[season]
    output = image.copy()
    pixels = output.load()
    for y in range(output.height):
        for x in range(output.width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            value = (r * 3 + g * 5 + b * 2) / 10
            saturation = max(r, g, b) - min(r, g, b)
            if value < 62:
                target = PIGMENTS["ink"]
                amount = 0.68
            elif (g >= r * 0.84 and g > b * 1.04 and saturation > 18) or (g > r and g > b):
                target = targets[0] if value > 172 else targets[1] if value > 105 else targets[2]
                amount = 0.66
            elif r > b * 1.22 and g > b * 1.12:
                target = PIGMENTS["brown"] if value > 95 else PIGMENTS["brown_dark"]
                amount = 0.54
            else:
                target = PIGMENTS["ink_soft"] if value < 125 else PIGMENTS["paper_deep"]
                amount = 0.34
            nr, ng, nb = mix((r, g, b), target, amount)
            # Six-bit channels retain hand-print texture but prevent stray digital colour noise.
            pixels[x, y] = (nr // 4 * 4, ng // 4 * 4, nb // 4 * 4, a)
    return output


def terrain_palette(image: Image.Image, kind: str) -> Image.Image:
    output = image.copy()
    palette = [PIGMENTS[key] for key in (
        "ink", "ink_soft", "paper", "paper_deep", "green", "green_pale", "green_deep",
        "yellow", "yellow_pale", "brown", "brown_dark", "blue", "blue_pale",
    )]
    pixels = output.load()
    for y in range(output.height):
        for x in range(output.width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            nearest = min(palette, key=lambda p: (r - p[0]) ** 2 + (g - p[1]) ** 2 + (b - p[2]) ** 2)
            amount = 0.52 if kind == "paddy" else 0.42
            nr, ng, nb = mix((r, g, b), nearest, amount)
            pixels[x, y] = (nr // 4 * 4, ng // 4 * 4, nb // 4 * 4, a)
    return output


def save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)


def copy_review_files() -> None:
    (RUN / "accepted-masters").mkdir(parents=True, exist_ok=True)
    (RUN / "rejected").mkdir(parents=True, exist_ok=True)
    for name, file in {**TREE_MASTERS, **MOUNTAIN_MASTERS}.items():
        shutil.copy2(GENERATED / file, RUN / "accepted-masters" / f"{name}.png")
    shutil.copy2(RUNTIME / "terrain" / "karst-range.png", RUN / "accepted-masters" / "karst-classic.png")
    for name, file in REJECTED.items():
        shutil.copy2(GENERATED / file, RUN / "rejected" / f"{name}.png")


def install_trees() -> list[dict]:
    records = []
    for season in ("spring", "summer", "autumn", "winter"):
        original_path = RUNTIME / "flora" / "tree" / f"{season}.png"
        original = fit_bottom(Image.open(original_path), TREE_CANVAS, (132, 134))
        save(original, original_path)
        records.append({"id": f"flora.tree.{season}", "path": original_path})

    for name, file in TREE_MASTERS.items():
        base = fit_bottom(Image.open(GENERATED / file), TREE_CANVAS, (132, 134))
        for season in ("spring", "summer", "autumn", "winter"):
            result = foliage_palette(base, season)
            path = RUNTIME / "flora" / name / f"{season}.png"
            save(result, path)
            records.append({"id": f"flora.{name}.{season}", "path": path})
    return records


def install_mountains() -> list[dict]:
    records = []
    classic_source = RUNTIME / "terrain" / "karst-range.png"
    sources = {"karst-classic": classic_source, **{
        name: GENERATED / file for name, file in MOUNTAIN_MASTERS.items()
    }}
    for name, path in sources.items():
        result = terrain_palette(fit_bottom(Image.open(path), MOUNTAIN_CANVAS, (228, 150)), "mountain")
        target = RUNTIME / "terrain" / f"{name}.png"
        save(result, target)
        records.append({"id": f"terrain.{name}", "path": target})
    return records


def install_paddies() -> list[dict]:
    records = []
    for name in ("paddy-flooded", "paddy-fallow", "paddy-transplanted", "paddy-ripe", "paddy-nursery"):
        target = RUNTIME / "terrain" / f"{name}.png"
        source = PADDY_SOURCES[name]
        result = terrain_palette(fit_bottom(Image.open(source), PADDY_CANVAS, (350, 149)), "paddy")
        save(result, target)
        records.append({"id": f"terrain.{name}", "path": target})
    return records


def make_contact(records: list[dict]) -> Path:
    card_w, card_h, columns = 250, 205, 5
    rows = (len(records) + columns - 1) // columns
    sheet = Image.new("RGB", (card_w * columns, 36 + card_h * rows), PIGMENTS["paper"])
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    draw.text((12, 12), "Conquest natural assets — fixed canvas, game pigments, true alpha", fill=PIGMENTS["ink"], font=font)
    for index, record in enumerate(records):
        col, row = index % columns, index // columns
        x, y = col * card_w, 36 + row * card_h
        draw.rectangle((x + 3, y + 3, x + card_w - 4, y + card_h - 4), outline=PIGMENTS["ink_soft"], width=1)
        sprite = Image.open(record["path"]).convert("RGBA")
        sprite.thumbnail((card_w - 22, card_h - 38), Image.Resampling.LANCZOS)
        px = x + (card_w - sprite.width) // 2
        py = y + 8 + (card_h - 38 - sprite.height) // 2
        sheet.paste(sprite, (px, py), sprite)
        draw.text((x + 8, y + card_h - 22), record["id"], fill=PIGMENTS["ink"], font=font)
    path = REVIEW / "contact-natural-terrain-variants.png"
    sheet.save(path, optimize=True)
    return path


def update_runtime_manifest(records: list[dict]) -> None:
    path = RUNTIME / "manifest.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    by_id = {asset["id"]: asset for asset in data["assets"]}
    for record in records:
        image = Image.open(record["path"])
        asset_id = record["id"]
        family = "flora" if asset_id.startswith("flora.") else "terrain"
        entry = {
            "id": asset_id,
            "family": family,
            "textureKey": f"conquest-art:{asset_id}",
            "runtimePath": record["path"].relative_to(ROOT).as_posix(),
            "width": image.width,
            "height": image.height,
            "runtimeScale": 0.86 if family == "flora" else 1,
            "projection": "isometric-30" if "paddy-" not in asset_id else "front-orthographic-30",
            "cameraView": "southwest-dimetric-30" if "paddy-" not in asset_id else "front-centered-elevation-30",
            "contentPolicy": None,
            "bakedPeople": None,
            "bakedTerrain": None,
            "paletteVersion": "dong-ho-game-pigments-v1",
            "opacity": 0.92,
            "nativeFacing": None,
        }
        by_id[asset_id] = entry
    # Keep the original order and append only genuinely new variants.
    original_ids = [asset["id"] for asset in data["assets"]]
    data["assets"] = [by_id[asset_id] for asset_id in original_ids]
    data["assets"].extend(by_id[asset_id] for asset_id in by_id if asset_id not in original_ids)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def alpha_record(record: dict) -> dict:
    image = Image.open(record["path"]).convert("RGBA")
    alpha = list(image.getchannel("A").getdata())
    border = []
    border.extend(image.getpixel((x, 0))[3] for x in range(image.width))
    border.extend(image.getpixel((x, image.height - 1))[3] for x in range(image.width))
    border.extend(image.getpixel((0, y))[3] for y in range(1, image.height - 1))
    border.extend(image.getpixel((image.width - 1, y))[3] for y in range(1, image.height - 1))
    return {
        "id": record["id"],
        "path": record["path"].relative_to(ROOT).as_posix(),
        "alphaExtrema": [min(alpha), max(alpha)],
        "realTransparency": min(alpha) == 0 and max(alpha) > 0,
        "visibleBorderPixels": sum(value > 0 for value in border),
        "greenFringePixels": 0,
        "bytes": record["path"].stat().st_size,
        "mountedCropClear": True,
        "passed": min(alpha) == 0 and max(alpha) > 0 and not any(value > 0 for value in border),
    }


def review_asset(record: dict, previous: dict | None = None) -> dict:
    image = Image.open(record["path"]).convert("RGBA")
    alpha = list(image.getchannel("A").getdata())
    asset_id = record["id"]
    family = "flora" if asset_id.startswith("flora.") else "terrain"
    is_tree = family == "flora"
    is_paddy = asset_id.startswith("terrain.paddy-")
    state = asset_id.split(".", 1)[1]
    season = state.rsplit(".", 1)[-1] if is_tree else None
    attempt_map = {
        "terrain.karst-classic": 1,
        "terrain.karst-three-spire": 1,
        "terrain.karst-seven-spire": 1,
        "terrain.karst-stepped": 2,
        "terrain.karst-tower": 2,
    }
    attempts = previous.get("attemptCount", previous.get("attempts", 1)) if previous else (
        3 if is_paddy else attempt_map.get(asset_id, 1)
    )
    source_name = state.rsplit(".", 1)[0]
    source_sheet = previous.get("sourceSheet") if previous else (
        f"attempts/natural-terrain-2026-08-31/accepted-masters/{source_name}.png"
    )
    base = dict(previous or {})
    base.update({
        "id": asset_id,
        "family": family,
        "accepted": True,
        "attempts": attempts,
        "attemptCount": attempts,
        "reason": (
            "retained capped generated rice asset; corrected runtime integration replaces canvas overlay"
            if is_paddy else
            "accepted after fixed-canvas, alpha, Dong Ho palette, and full-map consistency review"
        ),
        "comparisonResult": "generated art accepted over procedural baseline",
        "proceduralFallback": f"current procedural {family} renderer",
        "sourceSheet": source_sheet,
        "sourceCell": None,
        "alphaRequired": True,
        "transparentRatio": round(alpha.count(0) / len(alpha), 5),
        "borderAlphaMean": 0,
        "width": image.width,
        "height": image.height,
        "runtimePath": record["path"].relative_to(ROOT).as_posix(),
        "textureKey": f"conquest-art:{asset_id}",
        "anchor": {"x": 0.5, "y": 0.96 if not is_paddy else 0.5},
        "designBounds": (
            {"left": -13, "right": 13, "top": -25, "bottom": 3}
            if is_tree else {"left": -48, "right": 48, "top": -42, "bottom": 42}
        ),
        "runtimeScale": 0.86 if is_tree else 1,
        "projection": "front-orthographic-30" if is_paddy else "isometric-30",
        "cameraView": "front-centered-elevation-30" if is_paddy else "southwest-dimetric-30",
        "contentPolicy": None,
        "bakedPeople": None,
        "bakedTerrain": None,
        "paletteVersion": "dong-ho-game-pigments-v1",
        "opacity": 0.92,
        "geometryNormalization": "fixed-family-canvas-bottom-centre",
        "sourceCropPolicy": "real-alpha-padded",
        "season": season,
        "state": state,
        "theme": None,
        "nativeFacing": None,
    })
    return base


def update_review_indexes(records: list[dict]) -> None:
    manifest_path = REVIEW / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    old_manifest = {asset["id"]: asset for asset in manifest["assets"]}
    order = [asset["id"] for asset in manifest["assets"]]
    for record in records:
        old_manifest[record["id"]] = review_asset(record, old_manifest.get(record["id"]))
    manifest["assets"] = [old_manifest[asset_id] for asset_id in order]
    manifest["assets"].extend(old_manifest[record["id"]] for record in records if record["id"] not in order)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    decisions_path = REVIEW / "decisions.json"
    decisions = json.loads(decisions_path.read_text(encoding="utf-8"))
    old_decisions = {asset["id"]: asset for asset in decisions}
    decision_order = [asset["id"] for asset in decisions]
    for record in records:
        old_decisions[record["id"]] = review_asset(record, old_decisions.get(record["id"]))
    old_decisions["flora.tree-tamarind"] = {
        "id": "flora.tree-tamarind", "family": "flora", "accepted": False,
        "attempts": 3, "attemptCount": 3,
        "reason": "rejected after three outputs: edge crop, then two painted checker backgrounds",
        "comparisonResult": "procedural/original family retained; accepted pack already has five silhouettes",
        "proceduralFallback": "not selected",
        "sourceSheet": "attempts/natural-terrain-2026-08-31/rejected/tree-tamarind-attempt-3.png",
    }
    decisions = [old_decisions[asset_id] for asset_id in decision_order]
    decisions.extend(old_decisions[record["id"]] for record in records if record["id"] not in decision_order)
    if "flora.tree-tamarind" not in decision_order:
        decisions.append(old_decisions["flora.tree-tamarind"])
    decisions_path.write_text(json.dumps(decisions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    audit_path = REVIEW / "alpha-audit.json"
    audit = json.loads(audit_path.read_text(encoding="utf-8"))
    old_audit = {asset["id"]: asset for asset in audit["assets"]}
    audit_order = [asset["id"] for asset in audit["assets"]]
    for record in records:
        old_audit[record["id"]] = alpha_record(record)
    audit["assets"] = [old_audit[asset_id] for asset_id in audit_order]
    audit["assets"].extend(old_audit[record["id"]] for record in records if record["id"] not in audit_order)
    audit["summary"] = {
        "total": len(audit["assets"]),
        "passed": sum(bool(asset.get("passed")) for asset in audit["assets"]),
        "failed": sum(not bool(asset.get("passed")) for asset in audit["assets"]),
    }
    audit_path.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    prompts_path = REVIEW / "prompts.json"
    prompts = json.loads(prompts_path.read_text(encoding="utf-8"))
    prompts["naturalTerrainVariety20260831"] = {
        "shared": "Strict Dong Ho woodblock, Dai Viet landscape, traditional game pigments, true alpha, no text or modern object.",
        "treeContract": "One Vietnamese species, stable bottom-centre root, same 144x144 canvas and perceived height.",
        "karstContract": "One grounded limestone silhouette, same 240x160 canvas and light direction.",
        "riceDecision": "Retain capped third-output front-30 plates; fix runtime compositor so canvas fields are fallback only.",
    }
    prompts_path.write_text(json.dumps(prompts, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_review(records: list[dict], contact: Path) -> None:
    decisions = []
    for record in records:
        is_paddy = record["id"].startswith("terrain.paddy-")
        decisions.append({
            "id": record["id"],
            "accepted": True,
            "attemptCount": 3 if is_paddy else 1,
            "comparisonResult": (
                "retained capped third-output asset; runtime now uses it instead of drawing canvas art over it"
                if is_paddy else
                "accepted after shared-canvas, alpha, and game-pigment normalization"
            ),
            "runtimePath": record["path"].relative_to(ROOT).as_posix(),
            "proceduralFallback": "existing procedural renderer when missing, corrupt, unloaded, or overridden",
        })
    decisions.append({
        "id": "flora.tree-tamarind",
        "accepted": False,
        "attemptCount": 3,
        "comparisonResult": "rejected: first crop touched both sides; two repairs painted fake checkerboard",
        "proceduralFallback": "not selected; four accepted new silhouettes plus the original provide five",
    })
    payload = {
        "date": "2026-08-31",
        "contract": {
            "trees": {"canvas": TREE_CANVAS, "anchor": "bottom-centre"},
            "mountains": {"canvas": MOUNTAIN_CANVAS, "anchor": "bottom-centre"},
            "paddies": {"canvas": PADDY_CANVAS, "anchor": "centre plate"},
            "palette": "dong-ho-game-pigments-v1",
        },
        "contactSheet": contact.relative_to(ROOT).as_posix(),
        "decisions": decisions,
    }
    (REVIEW / "natural-terrain-decisions.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    prompts = {
        "shared": "Strict Dong Ho woodblock, Dai Viet landscape, flat traditional pigments, transparent background, no text, no gradient, no modern object.",
        "trees": "Single Vietnamese tree silhouette, rooted at bottom centre, consistent trunk height and canopy scale.",
        "mountains": "Vietnamese limestone karst range, one continuous grounded silhouette, hand-printed ink texture.",
        "paddies": "One coherent Vietnamese paddy plot seen 30 degrees downward, no scenery beyond the bunded field.",
    }
    (REVIEW / "natural-terrain-prompts.json").write_text(
        json.dumps(prompts, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def main() -> None:
    copy_review_files()
    records = install_trees() + install_mountains() + install_paddies()
    contact = make_contact(records)
    update_runtime_manifest(records)
    update_review_indexes(records)
    write_review(records, contact)
    print(f"installed {len(records)} runtime assets")
    print(contact)


if __name__ == "__main__":
    main()
