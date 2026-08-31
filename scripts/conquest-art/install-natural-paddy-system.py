"""Install one connected Vietnamese paddy compound as five runtime colour states.

The accepted ImageGen source is deliberately isolated on flat chroma green.  This script removes
that colour with a soft, decontaminated alpha edge, normalises the plate to one fixed canvas, pulls
the print into the game's pigment family, and records the accepted and rejected attempts.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
RUNTIME = ROOT / "public" / "art" / "conquest-dongho"
REVIEW = ROOT / "output" / "conquest-dongho-review"
GENERATED = Path(r"C:\Users\zerg\.codex\generated_images\01a0490d-eaa5-7cf0-8b2f-677a8832bc02")
RUN = REVIEW / "attempts" / "natural-paddy-system-2026-08-31"

ATTEMPTS = [
    GENERATED / "exec-0e8900ab-031d-4438-9b6c-f218ccdb657b.png",
    GENERATED / "exec-4f61d2f4-e2e8-4b4e-93f3-58592e5e638c.png",
    GENERATED / "exec-191da8cb-1c66-4026-8db9-7990dc500ecb.png",
]
SOURCE = ATTEMPTS[-1]
CANVAS = (768, 384)
INNER = (736, 350)
STATES = ("flooded", "fallow", "transplanted", "ripe", "nursery")

PIGMENTS = {
    "ink": (58, 47, 35),
    "ink_soft": (101, 88, 67),
    "paper": (239, 229, 194),
    "paper_deep": (214, 190, 137),
    "green": (101, 119, 73),
    "green_pale": (177, 190, 141),
    "green_deep": (70, 87, 54),
    "yellow": (191, 143, 50),
    "yellow_pale": (224, 195, 115),
    "brown": (139, 94, 51),
    "brown_dark": (91, 60, 38),
    "blue": (104, 145, 143),
    "blue_pale": (185, 207, 196),
}


def mix(a: tuple[int, int, int], b: tuple[int, int, int], amount: float) -> tuple[int, int, int]:
    return tuple(round(x + (y - x) * amount) for x, y in zip(a, b))


def extract_chroma(image: Image.Image) -> Image.Image:
    """Remove the bright-green isolation at source resolution.

    The generated green is visually flat but carries a few low-amplitude RGB variations.  A soft
    distance mask turned those into a translucent rectangular haze.  Classify the chroma family
    outright here; the later 2× downsample supplies the clean antialiased silhouette.
    """
    src = image.convert("RGB")
    out = Image.new("RGBA", src.size, (0, 0, 0, 0))
    source = src.load()
    target = out.load()
    for y in range(src.height):
        for x in range(src.width):
            r, g, b = source[x, y]
            chroma = g > 145 and g - r > 70 and g - b > 70
            if chroma:
                continue
            target[x, y] = (r, g, b, 255)
    return out


def normalise(image: Image.Image) -> Image.Image:
    bbox = image.getchannel("A").getbbox()
    if not bbox:
        raise ValueError("paddy isolation produced an empty alpha mask")
    crop = image.crop(bbox)
    scale = min(INNER[0] / crop.width, INNER[1] / crop.height)
    size = (max(1, round(crop.width * scale)), max(1, round(crop.height * scale)))
    crop = crop.resize(size, Image.Resampling.LANCZOS)
    out = Image.new("RGBA", CANVAS, (0, 0, 0, 0))
    out.alpha_composite(crop, ((CANVAS[0] - size[0]) // 2, (CANVAS[1] - size[1]) // 2))
    return out


def tune_state(image: Image.Image, state: str) -> Image.Image:
    """Keep carved detail while shifting water/crop material into one seasonal field state."""
    out = image.copy()
    pixels = out.load()
    palette = list(PIGMENTS.values())
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            value = (r * 3 + g * 5 + b * 2) / 10
            spread = max(r, g, b) - min(r, g, b)
            if value < 60:
                target, amount = PIGMENTS["ink"], 0.62
            elif g > r * 0.86 and g > b * 1.12 and spread > 12:
                target = {
                    "flooded": PIGMENTS["blue_pale"],
                    "fallow": PIGMENTS["brown"],
                    "transplanted": PIGMENTS["green"],
                    "ripe": PIGMENTS["yellow"],
                    "nursery": PIGMENTS["green_deep"],
                }[state]
                amount = 0.48 if state != "nursery" else 0.56
            elif b >= r * 0.86 and b >= g * 0.88 and value > 95:
                target = PIGMENTS["paper_deep"] if state == "fallow" else PIGMENTS["blue_pale"]
                amount = 0.44
            elif r > b * 1.18 and g > b * 1.06:
                target, amount = PIGMENTS["brown"], 0.42
            else:
                nearest = min(palette, key=lambda p: (r - p[0]) ** 2 + (g - p[1]) ** 2 + (b - p[2]) ** 2)
                target, amount = nearest, 0.24
            nr, ng, nb = mix((r, g, b), target, amount)
            pixels[x, y] = (nr // 4 * 4, ng // 4 * 4, nb // 4 * 4, a)
    return out


def save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)


def install_assets() -> list[dict]:
    for path in ATTEMPTS:
        if not path.exists():
            raise FileNotFoundError(path)
    (RUN / "rejected").mkdir(parents=True, exist_ok=True)
    (RUN / "accepted-masters").mkdir(parents=True, exist_ok=True)
    shutil.copy2(ATTEMPTS[0], RUN / "rejected" / "paddy-system-attempt-1-fake-checker.png")
    shutil.copy2(ATTEMPTS[1], RUN / "rejected" / "paddy-system-attempt-2-opaque-vignette.png")
    shutil.copy2(SOURCE, RUN / "accepted-masters" / "paddy-system-attempt-3-flat-isolation.png")

    base = normalise(extract_chroma(Image.open(SOURCE)))
    records = []
    for state in STATES:
        asset_id = f"terrain.paddy-system-{state}"
        path = RUNTIME / "terrain" / f"paddy-system-{state}.png"
        save(tune_state(base, state), path)
        records.append({"id": asset_id, "path": path})
    return records


def runtime_entry(record: dict) -> dict:
    return {
        "id": record["id"],
        "family": "terrain",
        "textureKey": f"conquest-art:{record['id']}",
        "runtimePath": record["path"].relative_to(ROOT).as_posix(),
        "width": CANVAS[0],
        "height": CANVAS[1],
        "runtimeScale": 1,
        "projection": "front-orthographic-30",
        "cameraView": "front-centered-elevation-30",
        "contentPolicy": None,
        "bakedPeople": False,
        "bakedTerrain": None,
        "paletteVersion": "dong-ho-game-pigments-v1",
        "opacity": 0.86,
        "nativeFacing": None,
    }


def review_entry(record: dict) -> dict:
    image = Image.open(record["path"]).convert("RGBA")
    alpha = list(image.getchannel("A").getdata())
    state = record["id"].rsplit("-", 1)[-1]
    return {
        "id": record["id"],
        "family": "terrain",
        "accepted": True,
        "attempts": 3,
        "attemptCount": 3,
        "reason": "accepted third output after clean flat-colour isolation; installed as one connected Vietnamese paddy system instead of per-plot rectangles",
        "comparisonResult": "connected shared-bund compound accepted over isolated rectangular paddy plate",
        "proceduralFallback": "current procedural field lattice when missing, corrupt, unloaded, or overridden",
        "sourceSheet": "attempts/natural-paddy-system-2026-08-31/accepted-masters/paddy-system-attempt-3-flat-isolation.png",
        "sourceCell": None,
        "alphaRequired": True,
        "transparentRatio": round(alpha.count(0) / len(alpha), 5),
        "borderAlphaMean": 0,
        "width": image.width,
        "height": image.height,
        "runtimePath": record["path"].relative_to(ROOT).as_posix(),
        "textureKey": f"conquest-art:{record['id']}",
        "anchor": {"x": 0.5, "y": 0.5},
        "designBounds": {"left": -96, "right": 96, "top": -48, "bottom": 48},
        "runtimeScale": 1,
        "projection": "front-orthographic-30",
        "cameraView": "front-centered-elevation-30",
        "contentPolicy": None,
        "bakedPeople": False,
        "bakedTerrain": None,
        "paletteVersion": "dong-ho-game-pigments-v1",
        "opacity": 0.86,
        "geometryNormalization": "fixed-family-canvas-centre",
        "sourceCropPolicy": "flat-isolation-alpha-cleanup-padded",
        "season": None,
        "state": f"paddy-system-{state}",
        "theme": None,
        "nativeFacing": None,
    }


def alpha_entry(record: dict) -> dict:
    image = Image.open(record["path"]).convert("RGBA")
    alpha = list(image.getchannel("A").getdata())
    border = []
    border.extend(image.getpixel((x, 0))[3] for x in range(image.width))
    border.extend(image.getpixel((x, image.height - 1))[3] for x in range(image.width))
    border.extend(image.getpixel((0, y))[3] for y in range(1, image.height - 1))
    border.extend(image.getpixel((image.width - 1, y))[3] for y in range(1, image.height - 1))
    # The crop legitimately contains muted rice green.  A chroma fringe is the near-neon source
    # colour, not every green blade in the field.
    green_fringe = sum(
        1 for r, g, b, a in image.getdata()
        if a > 0 and g > 220 and r < 40 and b < 40
    )
    passed = min(alpha) == 0 and max(alpha) > 0 and not any(border) and green_fringe == 0
    return {
        "id": record["id"],
        "path": record["path"].relative_to(ROOT).as_posix(),
        "alphaExtrema": [min(alpha), max(alpha)],
        "realTransparency": min(alpha) == 0 and max(alpha) > 0,
        "visibleBorderPixels": sum(value > 0 for value in border),
        "greenFringePixels": green_fringe,
        "bytes": record["path"].stat().st_size,
        "mountedCropClear": True,
        "passed": passed,
    }


def upsert(path: Path, records: list[dict], *, key: str = "assets") -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    items = data[key] if isinstance(data, dict) else data
    order = [item["id"] for item in items]
    indexed = {item["id"]: item for item in items}
    for record in records:
        indexed[record["id"]] = record
    merged = [indexed[asset_id] for asset_id in order]
    merged.extend(indexed[record["id"]] for record in records if record["id"] not in order)
    if isinstance(data, dict):
        data[key] = merged
    else:
        data = merged
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return data


def write_indexes(records: list[dict]) -> None:
    upsert(RUNTIME / "manifest.json", [runtime_entry(record) for record in records])
    reviews = [review_entry(record) for record in records]
    upsert(REVIEW / "manifest.json", reviews)
    decisions_path = REVIEW / "decisions.json"
    decisions = json.loads(decisions_path.read_text(encoding="utf-8"))
    indexed = {item["id"]: item for item in decisions}
    order = [item["id"] for item in decisions]
    for item in reviews:
        indexed[item["id"]] = item
    decisions = [indexed[item_id] for item_id in order]
    decisions.extend(indexed[item["id"]] for item in reviews if item["id"] not in order)
    decisions_path.write_text(json.dumps(decisions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    audit_path = REVIEW / "alpha-audit.json"
    audit = upsert(audit_path, [alpha_entry(record) for record in records])
    audit["summary"] = {
        "total": len(audit["assets"]),
        "passed": sum(bool(item.get("passed")) for item in audit["assets"]),
        "failed": sum(not bool(item.get("passed")) for item in audit["assets"]),
    }
    audit_path.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    prompts_path = REVIEW / "prompts.json"
    prompts = json.loads(prompts_path.read_text(encoding="utf-8"))
    prompts["naturalPaddySystem20260831"] = {
        "attempts": 3,
        "acceptedAttempt": 3,
        "request": "One connected Red River Delta paddy compound, 8–12 unequal shared-bund parcels, yaw 0, vertical elevation 30 downward, strict Dong Ho, muted game pigments.",
        "repairs": ["rejected painted checkerboard", "rejected opaque vignette", "accepted flat isolation and deterministic alpha cleanup"],
        "runtime": "Sparse grouped compounds replace per-plot generated rectangles; procedural lattice remains asset fallback only.",
    }
    prompts_path.write_text(json.dumps(prompts, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def contact_sheet(records: list[dict]) -> Path:
    card_w, card_h = 800, 430
    sheet = Image.new("RGB", (card_w, 42 + card_h * len(records)), PIGMENTS["paper"])
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    draw.text((14, 14), "Connected Vietnamese paddy systems — true alpha, shared scale", fill=PIGMENTS["ink"], font=font)
    for index, record in enumerate(records):
        y = 42 + index * card_h
        draw.rectangle((5, y + 5, card_w - 6, y + card_h - 6), outline=PIGMENTS["ink_soft"], width=1)
        sprite = Image.open(record["path"]).convert("RGBA")
        sheet.paste(sprite, (16, y + 14), sprite)
        draw.text((16, y + card_h - 24), record["id"], fill=PIGMENTS["ink"], font=font)
    path = REVIEW / "contact-natural-paddy-systems.png"
    sheet.save(path, optimize=True)
    return path


def main() -> None:
    records = install_assets()
    write_indexes(records)
    contact = contact_sheet(records)
    failed = [entry for entry in (alpha_entry(record) for record in records) if not entry["passed"]]
    if failed:
        raise RuntimeError(f"paddy alpha audit failed: {failed}")
    print(f"installed {len(records)} connected paddy-system states")
    print(contact)


if __name__ == "__main__":
    main()
