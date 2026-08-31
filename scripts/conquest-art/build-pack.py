#!/usr/bin/env python3
"""Extract, normalize, audit, and catalogue the generated conquest-map art pack.

The ImageGen masters are deliberately retained in output/conquest-dongho-review/masters.
This script turns their fixed grids into small runtime PNGs, rejects any sprite that does
not have real alpha, and writes the review/decision manifests and contact sheets used for
the final visual pass.
"""

from __future__ import annotations

import json
import math
import sys
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
REVIEW = ROOT / "output" / "conquest-dongho-review"
MASTERS = REVIEW / "masters"
RUNTIME = ROOT / "public" / "art" / "conquest-dongho"


@dataclass(frozen=True)
class Cell:
    asset_id: str
    family: str
    alpha_required: bool = True
    max_size: int = 128
    attempts: int = 1
    aliases: tuple[str, ...] = ()


@dataclass(frozen=True)
class Sheet:
    file: str
    cols: int
    rows: int
    cells: tuple[Cell | None, ...]
    # ImageGen sometimes honours the visual grid but lets a tall sprite enter the nominal gutter.
    # Explicit edges cut through the real transparent valleys instead of through that sprite.
    col_edges: tuple[int, ...] | None = None
    row_edges: tuple[int, ...] | None = None


def c(
    asset_id: str,
    family: str,
    *,
    alpha: bool = True,
    size: int = 128,
    attempts: int = 1,
    aliases: tuple[str, ...] = (),
) -> Cell:
    return Cell(asset_id, family, alpha, size, attempts, aliases)


SEASONS = ("spring", "summer", "autumn", "winter")
FLORA = ("tree", "grass", "bamboo", "banana", "areca", "banyan")
SETTLEMENTS = (
    "hamlet", "village", "market-town", "shrine-village",
    "farmstead", "mine-camp", "citadel-dinh", "citadel-ly",
    "citadel-tran", "citadel-le", "citadel-nguyen",
)
BUILDINGS = (
    "thatched-house", "tiled-house", "communal-hall", "pagoda-tower", "swept-yard", "village-pond",
    "bamboo-hedge", "kitchen", "buffalo-byre", "grain-bin", "well", "haystack",
    "mine-bank", "mine-adit", "mine-timbers", "spoil-heap", "baskets", "mine-worker",
    "improvement-farm", "improvement-mine", "improvement-market", "improvement-wall", "improvement-tower", "improvement-barracks",
    "improvement-communal-hall", "improvement-harbor", "improvement-workshop", "improvement-guild", "improvement-university",
)
TERRAIN = (
    "diep-paper", "plains", "dry-fields", "forest-floor", "fortress-ground", "shrine-ground",
    "paddy-flooded", "paddy-fallow", "paddy-transplanted", "paddy-ripe", "paddy-nursery", "water-surface",
    "shoreline-brush", "water-flow", "karst-range", "soft-ridge", "road-brush", "town-lane",
    "timber-bridge", "fog-cloud", "distant-haze", "winter-mist", "spring-blossom",
)
LIFE = (
    "farmer", "traveler", "buffalo", "buffalo-rider",
    "calf", "ox-cart", "egret-up", "egret-down",
    "spring-petal", "autumn-leaf", "winter-snow",
)
MARKERS = (
    "flag-yellow-seal", "flag-red-moon", "flag-layered-square", "flag-red-fringe-yellow", "flag-yellow-medallion", "flag-ngu-sac",
    "rival-flag-yellow-seal", "rival-flag-red-moon", "rival-flag-layered-square", "rival-flag-red-fringe-yellow", "rival-flag-yellow-medallion", "rival-flag-ngu-sac",
    "capital-standard", "destination-standard", "selection-seal", "capital-highlight", "acquisition", "build",
    "recruit", "siege", "battle", "march-dust", "route-brush",
)
THEMES = (
    # Clothing-v3 uses one clothing correction plus one isolation correction. These attempts
    # are tracked independently from the superseded v2 masters retained for comparison.
    ("dinh", 2), ("ly", 2), ("tran", 2), ("le", 2),
    ("trinh", 2), ("nguyenLord", 2), ("tayson", 2), ("nguyen", 2),
    ("song", 1), ("yuan", 1), ("ming", 1), ("qing", 1), ("champa", 1),
)
TIERS = ("levy", "trained", "royal")

# These plates are attractive in isolation but either expose rectangular repetition at runtime or
# have no safe clip into the existing procedural geometry.  Old art wins those comparisons.
RUNTIME_REJECT_IDS = {
    f"terrain.{name}" for name in (
        "diep-paper", "plains", "dry-fields", "forest-floor", "fortress-ground", "shrine-ground",
        "water-surface", "shoreline-brush", "water-flow", "road-brush", "town-lane",
        "fog-cloud", "distant-haze", "winter-mist", "spring-blossom",
    )
} | {
    # A worker is a living-map figure, never part of a building sprite. The old generated cell is
    # deliberately retired; SettlementRenderer now places independent walking people instead.
    "building.mine-worker",
}

ARMY_FILES = {
    # The eight Vietnamese wardrobes use the clothing-only historical correction. The five
    # foreign wardrobes keep their previously accepted v2 masters and are outside this audit.
    "dinh": "alpha-army-v3-clothing-dinh.png",
    "ly": "alpha-army-v3-clothing-ly.png",
    "tran": "alpha-army-v3-clothing-tran.png",
    "le": "alpha-army-v3-clothing-le.png",
    "trinh": "alpha-army-v3-clothing-trinh.png",
    "nguyenLord": "alpha-army-v3-clothing-nguyen-lord.png",
    "tayson": "alpha-army-v3-clothing-tayson.png",
    "nguyen": "alpha-army-v3-clothing-nguyen.png",
    "song": "alpha-army-v2-song.png",
    "yuan": "alpha-army-v2-yuan.png",
    "ming": "alpha-army-v2-ming.png",
    "qing": "alpha-army-v2-qing.png",
    "champa": "alpha-army-v2-champa.png",
}

VIETNAMESE_CLOTHING_V3 = {
    "dinh": {
        "period": "968-980",
        "basis": "flat four-sided leather tu-phuong-binh-dinh cap recorded for Dinh soldiers",
    },
    "ly": {
        "period": "1010-1225",
        "basis": "knee-length narrow-sleeved tunic with restrained early protective layers",
    },
    "tran": {
        "period": "1225-1400",
        "basis": "dark padded underlayers and restrained lacquered protection; armor remains reconstructive",
    },
    "le": {
        "period": "1428-1527",
        "basis": "early-Le tunic and compact lacquered protection, distinct from later Le-Trinh clothing",
    },
    "trinh": {
        "period": "late 16th-18th century",
        "basis": "structured woven-cloth Dinh-Tu and Thanh-Cat caps; no fur-cylinder headwear",
    },
    "nguyenLord": {
        "period": "1744-1777",
        "basis": "post-1744 Dang-Trong front-fastened standing-collar long coat and trousers",
    },
    "tayson": {
        "period": "1778-1802",
        "basis": "wrapped khan, practical southern tunic and broad trousers; armor kept secondary",
    },
    "nguyen": {
        "period": "19th century",
        "basis": "buttoned ao-song-khai, low service hat, rank trim and predominantly bare feet",
    },
}


def flora_cells() -> tuple[Cell, ...]:
    out: list[Cell] = []
    for season in SEASONS:
        for plant in FLORA:
            size = 144 if plant in {"tree", "banyan"} else 112
            out.append(c(f"flora.{plant}.{season}", "flora", size=size))
    return tuple(out)


def army_v2_cells(theme: str, attempts: int) -> tuple[Cell, ...]:
    """The authored four-column contract is spear, sword+shield, ranged, horseman.

    Gameplay still distinguishes skirmish and bow composition slots. Both resolve to the same
    reviewed ranged figure so the runtime matrix remains backwards-compatible without inventing
    a fifth visual pose that the user did not request.
    """
    out: list[Cell] = []
    for tier in TIERS:
        prefix = f"figure.{theme}.{tier}"
        out.extend((
            c(f"{prefix}.spear", "figures", size=144, attempts=attempts),
            c(f"{prefix}.sword", "figures", size=144, attempts=attempts),
            c(
                f"{prefix}.skirmish", "figures", size=144, attempts=attempts,
                aliases=(f"{prefix}.bow",),
            ),
            c(f"{prefix}.mounted", "figures", size=144, attempts=attempts),
        ))
    return tuple(out)


SHEETS: tuple[Sheet, ...] = (
    Sheet("alpha-flora-seasons.png", 6, 4, tuple(Cell(x.asset_id, x.family, x.alpha_required, x.max_size, 2) for x in flora_cells())),
    # The v5 correction separates architecture from terrain and living figures. Open yards and
    # compounds remain transparent so the procedural tile/road/field system shows through.
    Sheet("alpha-settlements-isometric-v5-structure-only.png", 4, 3, tuple(c(f"settlement.{x}", "settlements", size=240, attempts=5) for x in SETTLEMENTS) + (None,)),
    Sheet("alpha-buildings-isometric-v5-structure-only.png", 6, 5, tuple(c(f"building.{x}", "buildings", size=144, attempts=5) for x in BUILDINGS) + (None,)),
    Sheet(
        "alpha-terrain.png", 6, 4,
        tuple(
            None if 6 <= index <= 10
            else c(f"terrain.{x}", "terrain", alpha=True, size=192 if index < 12 else 160, attempts=2)
            for index, x in enumerate(TERRAIN)
        ) + (None,),
    ),
    Sheet(
        "alpha-rice-fields-isometric-v3.png", 5, 1,
        tuple(c(f"terrain.paddy-{state}", "terrain", alpha=True, size=192, attempts=3)
              for state in ("flooded", "fallow", "transplanted", "ripe", "nursery")),
    ),
    Sheet(
        "alpha-life-weather.png", 4, 3,
        tuple(c(f"life.{x}", "life", size=72 if x in {"spring-petal", "autumn-leaf", "winter-snow"} else 144, attempts=2) for x in LIFE) + (None,),
    ),
    Sheet(
        "alpha-markers-flags.png", 6, 4,
        tuple(c(f"marker.{x}", "markers", size=112, attempts=2) for x in MARKERS) + (None,),
        # The nominal 256px rows cut every flagpole base and four round seals. These coordinates
        # are zero-alpha gutters measured from the retained 1536x1024 master. The final column cut
        # also moves left of the ngũ-sắc tassel instead of slicing through it.
        col_edges=(0, 256, 512, 768, 1024, 1235, 1536),
        row_edges=(0, 300, 582, 800, 1024),
    ),
) + tuple(
    Sheet(
        ARMY_FILES[theme],
        4, 3, army_v2_cells(theme, attempts),
    )
    for theme, attempts in THEMES
)


def alpha_ratio(image: Image.Image, threshold: int = 250) -> float:
    alpha = image.getchannel("A")
    hist = alpha.histogram()
    return sum(hist[:threshold]) / (image.width * image.height)


def border_alpha(image: Image.Image) -> float:
    alpha = image.getchannel("A")
    pixels: list[int] = []
    pixels.extend(alpha.crop((0, 0, image.width, 2)).tobytes())
    pixels.extend(alpha.crop((0, image.height - 2, image.width, image.height)).tobytes())
    pixels.extend(alpha.crop((0, 0, 2, image.height)).tobytes())
    pixels.extend(alpha.crop((image.width - 2, 0, image.width, image.height)).tobytes())
    return sum(pixels) / max(1, len(pixels))


def cell_box(sheet: Sheet, image: Image.Image, index: int) -> tuple[int, int, int, int]:
    row, col = divmod(index, sheet.cols)
    col_edges = sheet.col_edges or tuple(round(index * image.width / sheet.cols) for index in range(sheet.cols + 1))
    row_edges = sheet.row_edges or tuple(round(index * image.height / sheet.rows) for index in range(sheet.rows + 1))
    # Custom edges are stored in the master sheet's own coordinate space. Scale them if a future
    # isolation pass preserves the grid but exports a different resolution.
    x_scale = image.width / col_edges[-1]
    y_scale = image.height / row_edges[-1]
    return (
        round(col_edges[col] * x_scale),
        round(row_edges[row] * y_scale),
        round(col_edges[col + 1] * x_scale),
        round(row_edges[row + 1] * y_scale),
    )


def extracted_cell(sheet: Sheet, image: Image.Image, index: int, spec: Cell) -> Image.Image:
    """Extract one authored cell, including the mounted figure's deliberate grid overflow.

    The four-column army masters keep one person scale across foot and mounted figures. A pony is
    wider and taller than a footman, so ImageGen placed every fourth-column horse across the
    nominal left divider and, in the trained/royal rows, above the nominal row divider. Cropping
    the mathematical cell therefore removed the horse's rear and sometimes the rider's head.

    The expanded window below is still separated from the ranged figure by a transparent valley.
    `remove_border_fragments` discards any tiny weapon tip entering through that outer edge, after
    which `normalize_mounted_figure_cell` places the complete silhouette on the shared canvas.
    """
    if spec.family != "figures" or not spec.asset_id.endswith(".mounted"):
        return remove_border_fragments(image.crop(cell_box(sheet, image, index)))

    row = index // sheet.cols
    # Measured on the accepted 1536x1024 masters and scaled for lossless re-exports.
    x0 = round(image.width * 1060 / 1536)
    x1 = round(image.width * 1510 / 1536)
    row_windows = ((0, 337), (333, 662), (648, 1024))
    y0_ref, y1_ref = row_windows[row]
    y0 = round(image.height * y0_ref / 1024)
    y1 = round(image.height * y1_ref / 1024)
    return remove_border_fragments(image.crop((x0, y0, x1, y1)))


def remove_border_fragments(image: Image.Image) -> Image.Image:
    """Drop small connected alpha islands cut in from a neighbouring grid cell.

    ImageGen does not obey grid dividers to the pixel.  The target is normally the largest
    component in its cell; accidental roof tips, leaves, standards, and legs enter through an
    outer edge.  Interior detached details are deliberately kept.
    """
    alpha = image.getchannel("A")
    width, height = image.size
    solid = bytearray(1 if value > 12 else 0 for value in alpha.tobytes())
    visited = bytearray(width * height)
    components: list[tuple[list[int], bool]] = []
    for start, value in enumerate(solid):
        if not value or visited[start]:
            continue
        queue = deque([start])
        visited[start] = 1
        pixels: list[int] = []
        touches = False
        while queue:
            point = queue.popleft()
            pixels.append(point)
            x = point % width
            y = point // width
            touches = touches or x <= 1 or y <= 1 or x >= width - 2 or y >= height - 2
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if nx < 0 or ny < 0 or nx >= width or ny >= height:
                    continue
                neighbour = ny * width + nx
                if solid[neighbour] and not visited[neighbour]:
                    visited[neighbour] = 1
                    queue.append(neighbour)
        components.append((pixels, touches))
    if not components:
        return image
    largest = max(len(pixels) for pixels, _ in components)
    rejected = [pixels for pixels, touches in components if touches and len(pixels) < largest * 0.45]
    if not rejected:
        return image
    cleaned = image.copy()
    cleaned_alpha = bytearray(alpha.tobytes())
    for pixels in rejected:
        for point in pixels:
            cleaned_alpha[point] = 0
    cleaned.putalpha(Image.frombytes("L", image.size, bytes(cleaned_alpha)))
    return cleaned


def trim_and_resize(
    image: Image.Image,
    max_size: int,
    alpha_required: bool,
    guarantee_padding: bool = False,
) -> Image.Image:
    if alpha_required:
        alpha = image.getchannel("A")
        mask = alpha.point(lambda value: 255 if value > 12 else 0)
        bbox = mask.getbbox()
        if bbox is None:
            return Image.new("RGBA", (max_size, max_size), (0, 0, 0, 0))
        left, top, right, bottom = bbox
        pad = max(3, round(max(right - left, bottom - top) * 0.055))
        if guarantee_padding:
            # Long marker poles deliberately reach into the source gutter, so clamping a padded
            # crop back to the cell can silently remove the lower margin again. Rebuild the margin
            # on a transparent canvas after extracting the complete ink bounds.
            content = image.crop((left, top, right, bottom))
            padded = Image.new(
                "RGBA",
                (content.width + pad * 2, content.height + pad * 2),
                (0, 0, 0, 0),
            )
            padded.alpha_composite(content, (pad, pad))
            image = padded
        else:
            box = (
                max(0, left - pad), max(0, top - pad),
                min(image.width, right + pad), min(image.height, bottom + pad),
            )
            image = image.crop(box)
    else:
        inset_x = max(2, round(image.width * 0.025))
        inset_y = max(2, round(image.height * 0.025))
        image = image.crop((inset_x, inset_y, image.width - inset_x, image.height - inset_y))
    scale = min(1.0, max_size / max(image.width, image.height))
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    return image.resize(size, Image.Resampling.LANCZOS)


def normalize_mounted_figure_cell(image: Image.Image) -> Image.Image:
    """Place a complete horseman on the fixed canvas and shared figure baseline.

    The 432x384 board is the nominal 384x341 army cell expanded by 1.125. Resizing it to
    144x128 is uniform in both axes. Runtime applies the reciprocal compensation, so rider height
    is unchanged while the pony finally has room for its full silhouette. Ink ends at source
    y=369, which maps to the shared runtime foot line y=123.
    """
    alpha = image.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > 12 else 0).getbbox()
    if bbox is None:
        return Image.new("RGBA", (144, 128), (0, 0, 0, 0))
    content = image.crop(bbox)
    board = Image.new("RGBA", (432, 384), (0, 0, 0, 0))
    if content.width > 420 or content.height > 360:
        raise ValueError(
            f"mounted silhouette exceeds normalization board: {content.width}x{content.height}"
        )
    x = (board.width - content.width) // 2
    y = 369 - content.height
    board.alpha_composite(content, (x, y))
    return board.resize((144, 128), Image.Resampling.LANCZOS)


def normalize_figure_cell(image: Image.Image, mounted: bool = False) -> Image.Image:
    """Keep one authored pixel scale across every weapon and wardrobe.

    Tight-cropping each figure independently makes a long spear shrink its soldier while a short
    sword fills the same runtime box. The v2 masters were authored on identical 4x3 cells with a
    common baseline, so retain that full transparent cell and resize every one to the same canvas.
    """
    if mounted:
        return normalize_mounted_figure_cell(image)
    return image.resize((144, 128), Image.Resampling.LANCZOS)


# The generated masters deliberately keep their hand-printed colour variation. Runtime exports
# are pulled toward the exact pigments already used by the procedural renderer so a generated
# sprite cannot become a darker, more saturated sticker when placed on the điệp-paper map.
DONG_HO_GAME_PALETTE: tuple[tuple[int, int, int], ...] = (
    (0xE9, 0xDF, 0xC2), (0xF3, 0xEC, 0xD8), (0xD8, 0xC9, 0xA4), (0xC9, 0xB7, 0x8C),
    (0x2A, 0x21, 0x18), (0x5A, 0x4C, 0x39), (0x8C, 0x7E, 0x67),
    (0xB3, 0x3A, 0x26), (0x8A, 0x2A, 0x1B), (0xD9, 0x8A, 0x72),
    (0x42, 0x59, 0x6B), (0x8F, 0xA5, 0xB2), (0xAF, 0xC0, 0xC7),
    (0x7D, 0x91, 0x60), (0xA7, 0xB9, 0x8D), (0x5B, 0x6D, 0x45),
    (0x5F, 0x8A, 0x82), (0x94, 0xB2, 0xAB),
    (0xC0, 0x8A, 0x2E), (0xDC, 0xBE, 0x7E),
    (0x7A, 0x56, 0x36), (0x5C, 0x3F, 0x26),
    (0x3E, 0x32, 0x26), (0x58, 0x48, 0x33), (0xDC, 0xCF, 0xAE),
)
PALETTE_VERSION = "dong-ho-game-pigments-v1"
FAMILY_OPACITY = {
    "flora": 0.90,
    "settlements": 0.86,
    "buildings": 0.87,
    "terrain": 0.90,
    "life": 0.89,
    "markers": 0.94,
    "figures": 0.89,
}


def normalize_dong_ho(image: Image.Image, family: str) -> Image.Image:
    """Soft-quantize into the game palette while preserving carved-edge texture."""
    opacity = FAMILY_OPACITY[family]
    output = Image.new("RGBA", image.size)
    normalized: list[tuple[int, int, int, int]] = []
    for red, green, blue, alpha in image.getdata():
        if alpha <= 3:
            normalized.append((0, 0, 0, 0))
            continue
        target = min(
            DONG_HO_GAME_PALETTE,
            key=lambda colour: (
                2 * (red - colour[0]) ** 2
                + 3 * (green - colour[1]) ** 2
                + (blue - colour[2]) ** 2
            ),
        )
        # Dark carved outlines need a firmer palette lock; broad printed fills retain more of
        # their natural registration and paper grain. This avoids both neon colour and flat
        # computer-clean posterisation.
        luminance = (red * 3 + green * 6 + blue) / 10
        mix = 0.72 if luminance < 82 else 0.62
        normalized.append((
            round(red * (1 - mix) + target[0] * mix),
            round(green * (1 - mix) + target[1] * mix),
            round(blue * (1 - mix) + target[2] * mix),
            max(0, min(255, round(alpha * opacity))),
        ))
    output.putdata(normalized)
    return output


def normalize_projection(image: Image.Image, spec: Cell) -> Image.Image:
    """Enforce the shared 2:1 paddy plane without spending a fourth generated attempt."""
    if not spec.asset_id.startswith("terrain.paddy-"):
        return image
    return image.resize((image.width, max(1, round(image.width / 2))), Image.Resampling.LANCZOS)


def runtime_scale(spec: Cell) -> float:
    state = spec.asset_id.split(".", 1)[1]
    if spec.family == "flora":
        plant = state.split(".", 1)[0]
        return {"tree": 0.86, "grass": 0.72, "bamboo": 0.90, "banana": 0.85,
                "areca": 0.92, "banyan": 0.94}[plant]
    if spec.family == "settlements":
        return 0.76 if state.startswith("citadel-") else 0.72
    if spec.family == "buildings":
        return 0.56
    if spec.family == "life":
        return {
            "farmer": 0.82, "traveler": 0.42, "buffalo": 0.90, "buffalo-rider": 0.88,
            "calf": 0.72, "ox-cart": 0.70, "egret-up": 0.62, "egret-down": 0.62,
            "spring-petal": 0.55, "autumn-leaf": 0.55, "winter-snow": 0.55,
        }[state]
    if spec.family == "markers":
        if state in {"selection-seal", "capital-highlight"}:
            return 0.85
        if state in {"acquisition", "build", "recruit", "siege", "battle", "march-dust", "route-brush"}:
            return 0.68
        return 0.72
    if spec.family == "figures":
        # Mounted cells share the exact authored person scale of the foot cells. The game's
        # larger mounted design box would enlarge the rider unless compensated here. The family
        # multiplier restores the fixed full-cell sprites to the map's 8–9px standing band.
        # Mounted extraction now uses a 432-unit board instead of the nominal 384-unit grid cell.
        # 1.33 is the reciprocal 1.125 compensation over 1.18: rider height stays unchanged while
        # the complete pony remains visible.
        return 1.33 if state.endswith(".mounted") else 1.51
    return 1.0


def projection(spec: Cell) -> str:
    if spec.family in {"settlements", "buildings"} or spec.asset_id.startswith("terrain.paddy-") \
            or spec.asset_id == "terrain.timber-bridge":
        return "front-orthographic-30"
    if spec.family in {"flora", "terrain"}:
        return "isometric-30"
    if spec.family == "markers" or spec.asset_id in {
        "life.spring-petal", "life.autumn-leaf", "life.winter-snow",
    }:
        return "flat-overlay"
    return "character-facing"


def review_metadata(spec: Cell) -> dict:
    parts = spec.asset_id.split(".")
    anchor = {"x": 0.5, "y": 0.5 if spec.family == "terrain" else 0.96}
    bounds_by_family = {
        "flora": {"left": -28, "right": 28, "top": -45, "bottom": 5},
        "settlements": {"left": -90, "right": 90, "top": -76, "bottom": 24},
        "buildings": {"left": -28, "right": 28, "top": -46, "bottom": 6},
        "terrain": {"left": -48, "right": 48, "top": -42, "bottom": 42},
        "life": {"left": -29, "right": 29, "top": -34, "bottom": 6},
        "markers": {"left": -18, "right": 18, "top": -42, "bottom": 5},
        "figures": {"left": -24, "right": 26, "top": -54, "bottom": 5},
    }
    season = parts[-1] if spec.family == "flora" else None
    theme = parts[1] if spec.family == "figures" else None
    state = ".".join(parts[2:]) if spec.family == "figures" else ".".join(parts[1:])
    if spec.family == "figures" and state.endswith(".mounted"):
        bounds_by_family["figures"] = {"left": -28, "right": 34, "top": -79, "bottom": 5}
    if spec.family == "settlements" and state.startswith("citadel-"):
        theme = state.removeprefix("citadel-")
    return {
        "anchor": anchor,
        "designBounds": bounds_by_family[spec.family],
        "runtimeScale": runtime_scale(spec),
        "projection": projection(spec),
        "cameraView": (
            "front-centered-elevation-30"
            if projection(spec) == "front-orthographic-30"
            else "southwest-dimetric-30"
            if projection(spec) == "isometric-30"
            else None
        ),
        "contentPolicy": "structure-only-transparent" if spec.family in {"settlements", "buildings"} else None,
        "bakedPeople": False if spec.family in {"settlements", "buildings"} else None,
        "bakedTerrain": False if spec.family in {"settlements", "buildings"} else None,
        "paletteVersion": PALETTE_VERSION,
        "opacity": FAMILY_OPACITY[spec.family],
        "geometryNormalization": (
            "yaw-0 orthographic rectangle; elevation-30 depth compressed to 50 percent"
            if spec.asset_id.startswith("terrain.paddy-")
            else "yaw-0 orthographic bridge; parallel vertical depth edges"
            if spec.asset_id == "terrain.timber-bridge"
            else None
        ),
        "sourceCropPolicy": "expanded-complete-mounted-silhouette"
        if spec.family == "figures" and state.endswith(".mounted") else None,
        "season": season,
        "state": state,
        "theme": theme,
        "nativeFacing": 1 if spec.family == "figures" else None,
    }


def clothing_metadata(spec: Cell) -> dict:
    if spec.family != "figures":
        return {}
    theme = spec.asset_id.split(".")[1]
    review = VIETNAMESE_CLOTHING_V3.get(theme)
    if review is None:
        return {"clothingRevision": "v2-unchanged-foreign-wardrobe"}
    return {
        "clothingRevision": "v3-historical-audit",
        "clothingPeriod": review["period"],
        "clothingEvidenceBasis": review["basis"],
        "clothingOnlyEdit": True,
    }


def checkerboard(size: tuple[int, int], cell: int = 12) -> Image.Image:
    result = Image.new("RGBA", size, (239, 235, 222, 255))
    draw = ImageDraw.Draw(result)
    alt = (219, 213, 196, 255)
    for y in range(0, size[1], cell):
        for x in range(0, size[0], cell):
            if (x // cell + y // cell) % 2:
                draw.rectangle((x, y, min(size[0], x + cell - 1), min(size[1], y + cell - 1)), fill=alt)
    return result


def contact_sheet(entries: Iterable[dict], output: Path, title: str) -> None:
    rows = list(entries)
    show_isometric_guide = bool(rows) and rows[0]["family"] in {"settlements", "buildings"}
    cols = 8
    card_w, card_h = 190, 178
    header = 54
    sheet_h = header + math.ceil(len(rows) / cols) * card_h
    canvas = checkerboard((cols * card_w, sheet_h), 14)
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    draw.rectangle((0, 0, canvas.width, header), fill=(245, 239, 221, 255))
    draw.text((14, 17), title, fill=(42, 35, 27, 255), font=font)
    for index, entry in enumerate(rows):
        x = (index % cols) * card_w
        y = header + (index // cols) * card_h
        draw.rectangle((x, y, x + card_w - 1, y + card_h - 1), outline=(111, 96, 73, 170), width=1)
        label = entry["id"]
        if not entry["accepted"]:
            draw.rectangle((x + 4, y + 4, x + card_w - 5, y + card_h - 5), fill=(112, 35, 27, 75))
            draw.text((x + 8, y + 8), f"FALLBACK: {label}", fill=(101, 27, 20, 255), font=font)
            continue
        if show_isometric_guide:
            # A faint 2:1 ground diamond makes mixed camera directions visible during review.
            # It is review chrome only and never enters a runtime sprite.
            cx = x + card_w // 2
            cy = y + card_h - 47
            guide = (110, 119, 105, 92)
            draw.line((cx - 72, cy, cx, cy - 36, cx + 72, cy, cx, cy + 36, cx - 72, cy),
                      fill=guide, width=1)
            draw.line((cx - 72, cy, cx + 72, cy), fill=(142, 93, 76, 70), width=1)
        sprite = Image.open(ROOT / entry["runtimePath"]).convert("RGBA")
        available = (card_w - 20, card_h - 42)
        scale = min(1.0, available[0] / sprite.width, available[1] / sprite.height)
        sprite = sprite.resize((max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale))), Image.Resampling.LANCZOS)
        px = x + (card_w - sprite.width) // 2
        py = y + 6 + (available[1] - sprite.height) // 2
        canvas.alpha_composite(sprite, (px, py))
        draw.rectangle((x, y + card_h - 28, x + card_w - 1, y + card_h - 1), fill=(247, 242, 226, 235))
        draw.text((x + 6, y + card_h - 20), label[:31], fill=(42, 35, 27, 255), font=font)
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(output, quality=92)


def audit_runtime_alpha(entries: Iterable[dict]) -> dict:
    """Verify every accepted PNG has usable transparency and no chroma-key residue."""
    files: list[dict] = []
    for entry in entries:
        path = ROOT / entry["runtimePath"]
        image = Image.open(path).convert("RGBA")
        alpha = image.getchannel("A")
        extrema = alpha.getextrema()
        border: list[int] = []
        border.extend(alpha.crop((0, 0, image.width, 1)).tobytes())
        border.extend(alpha.crop((0, image.height - 1, image.width, image.height)).tobytes())
        border.extend(alpha.crop((0, 0, 1, image.height)).tobytes())
        border.extend(alpha.crop((image.width - 1, 0, image.width, image.height)).tobytes())
        # Only the isolation colour itself is forbidden here. Natural Đông Hồ foliage greens are
        # valid pigment and must not be mistaken for a chroma fringe.
        green_fringe = sum(
            1 for red, green, blue, opacity in image.getdata()
            if opacity > 8 and red < 18 and green > 238 and blue < 18
        )
        record = {
            "id": entry["id"],
            "path": entry["runtimePath"],
            "alphaExtrema": list(extrema),
            "realTransparency": extrema[0] == 0 and extrema[1] > 0,
            "visibleBorderPixels": sum(1 for value in border if value > 8),
            "greenFringePixels": green_fringe,
            "bytes": path.stat().st_size,
        }
        mounted = entry["id"].endswith(".mounted")
        record["mountedCropClear"] = not mounted or record["visibleBorderPixels"] == 0
        record["passed"] = record["realTransparency"] and green_fringe == 0 \
            and record["mountedCropClear"]
        files.append(record)
    summary = {
        "files": len(files),
        "passed": sum(1 for item in files if item["passed"]),
        "failed": sum(1 for item in files if not item["passed"]),
        "runtimeBytes": sum(item["bytes"] for item in files),
        "allHaveRealTransparency": all(item["realTransparency"] for item in files),
        "allFreeOfChromaFringe": all(item["greenFringePixels"] == 0 for item in files),
        "mountedFiles": sum(1 for item in files if item["id"].endswith(".mounted")),
        "allMountedClearOfCropEdges": all(
            item["mountedCropClear"] for item in files if item["id"].endswith(".mounted")
        ),
    }
    report = {"summary": summary, "assets": files}
    (REVIEW / "alpha-audit.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8",
    )
    return summary


def comparison_sheet(output: Path) -> bool:
    """Put representative fixed-seed old/new runtime captures side by side."""
    old = REVIEW / "comparisons" / "old"
    new = REVIEW / "comparisons" / "new"
    names = (
        "land-castle-1.4x.png", "land-farm-1.4x.png", "land-iron-1.4x.png",
        "land-market-1.4x.png", "land-temple-1.4x.png", "land-wilderness-1.4x.png",
        "army.png",
    )
    if any(not (old / name).exists() or not (new / name).exists() for name in names):
        return False
    card_w, card_h = 520, 670
    header, label_h = 66, 28
    canvas = checkerboard((card_w * 2, header + len(names) * card_h), 16)
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    draw.rectangle((0, 0, canvas.width, header), fill=(245, 239, 221, 255))
    draw.text((16, 18), "Fixed-seed conquest comparison — procedural baseline / accepted Đông Hồ pack",
              fill=(42, 35, 27, 255), font=font)
    draw.text((card_w // 2 - 40, 43), "OLD PROCEDURAL", fill=(95, 39, 29, 255), font=font)
    draw.text((card_w + card_w // 2 - 36, 43), "NEW REVIEWED", fill=(44, 88, 44, 255), font=font)
    for row, name in enumerate(names):
        y = header + row * card_h
        for col, folder in enumerate((old, new)):
            shot = Image.open(folder / name).convert("RGBA")
            available = (card_w - 12, card_h - label_h - 12)
            scale = min(available[0] / shot.width, available[1] / shot.height)
            shot = shot.resize(
                (max(1, round(shot.width * scale)), max(1, round(shot.height * scale))),
                Image.Resampling.LANCZOS,
            )
            x = col * card_w + (card_w - shot.width) // 2
            py = y + label_h + (available[1] - shot.height) // 2
            canvas.alpha_composite(shot, (x, py))
            draw.rectangle((col * card_w, y, (col + 1) * card_w - 1, y + label_h),
                           fill=(247, 242, 226, 240))
            draw.text((col * card_w + 8, y + 8), name.removesuffix(".png"),
                      fill=(42, 35, 27, 255), font=font)
            draw.rectangle((col * card_w, y, (col + 1) * card_w - 1, y + card_h - 1),
                           outline=(111, 96, 73, 170), width=1)
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(output, quality=91)
    return True


def citadel_comparison_sheet(output: Path) -> None:
    """Compare the superseded generic citadels with the v4 Đại Việt silhouettes."""
    old = Image.open(MASTERS / "alpha-settlements-isometric-v3.png").convert("RGBA")
    new = Image.open(MASTERS / "alpha-settlements-isometric-v5-structure-only.png").convert("RGBA")
    eras = ("Đinh", "Lý", "Trần", "Lê", "Nguyễn")
    card_w, card_h = 520, 250
    header = 70
    canvas = checkerboard((card_w * 2, header + card_h * len(eras)), 14)
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default()
    draw.rectangle((0, 0, canvas.width, header), fill=(245, 239, 221, 255))
    draw.text((14, 14), "Citadel review — generic terrain-backed v3 / structure-only Đại Việt v5",
              fill=(42, 35, 27, 255), font=font)
    draw.text((card_w // 2 - 34, 44), "OLD V3", fill=(112, 35, 27, 255), font=font)
    draw.text((card_w + card_w // 2 - 64, 44), "ACCEPTED V5", fill=(44, 88, 44, 255), font=font)

    for row, era in enumerate(eras):
        source_index = 6 + row
        y = header + row * card_h
        for col, source in enumerate((old, new)):
            sprite = remove_border_fragments(source.crop((
                round((source_index % 4) * source.width / 4),
                round((source_index // 4) * source.height / 3),
                round(((source_index % 4) + 1) * source.width / 4),
                round(((source_index // 4) + 1) * source.height / 3),
            )))
            sprite = trim_and_resize(sprite, 330, True)
            scale = min(1.0, (card_w - 40) / sprite.width, (card_h - 38) / sprite.height)
            sprite = sprite.resize((round(sprite.width * scale), round(sprite.height * scale)),
                                   Image.Resampling.LANCZOS)
            x0 = col * card_w
            cx = x0 + card_w // 2
            cy = y + card_h - 32
            draw.line((cx - 120, cy, cx, cy - 60, cx + 120, cy, cx, cy + 60, cx - 120, cy),
                      fill=(110, 119, 105, 82), width=1)
            canvas.alpha_composite(sprite, (x0 + (card_w - sprite.width) // 2,
                                            y + 10 + (card_h - 30 - sprite.height) // 2))
            draw.rectangle((x0, y, x0 + card_w - 1, y + card_h - 1),
                           outline=(111, 96, 73, 170), width=1)
            draw.rectangle((x0 + 8, y + 8, x0 + 78, y + 28), fill=(247, 242, 226, 235))
            draw.text((x0 + 14, y + 14), era, fill=(42, 35, 27, 255), font=font)
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(output, quality=92)


def main() -> int:
    RUNTIME.mkdir(parents=True, exist_ok=True)
    REVIEW.mkdir(parents=True, exist_ok=True)
    decisions: list[dict] = []
    sheet_audit: list[dict] = []

    for sheet in SHEETS:
        source_path = MASTERS / sheet.file
        if not source_path.exists():
            print(f"missing master: {source_path}", file=sys.stderr)
            return 2
        source = Image.open(source_path).convert("RGBA")
        source_ratio = alpha_ratio(source)
        sheet_audit.append({
            "file": sheet.file,
            "width": source.width,
            "height": source.height,
            "transparentRatio": round(source_ratio, 5),
            "alphaExtrema": list(source.getchannel("A").getextrema()),
        })
        for index, spec in enumerate(sheet.cells):
            if spec is None:
                continue
            crop = extracted_cell(sheet, source, index, spec)
            transparent = alpha_ratio(crop)
            edge = border_alpha(crop)
            # Cell-filling texture plates and wide buildings legitimately touch a
            # grid boundary.  The decisive rejection signal is an opaque sheet:
            # chroma-isolated sources retain ample transparent area, while the two
            # exhausted checkerboard army sheets have none at all.
            alpha_ok = not spec.alpha_required or transparent >= 0.08
            accepted = alpha_ok and spec.asset_id not in RUNTIME_REJECT_IDS
            reason = "accepted: generated art is clearer and style-consistent"
            runtime_path = RUNTIME / Path(*spec.asset_id.split(".")).with_suffix(".png")
            if accepted:
                runtime_path.parent.mkdir(parents=True, exist_ok=True)
                result = normalize_figure_cell(
                    crop, spec.asset_id.endswith(".mounted"),
                ) if spec.family == "figures" else trim_and_resize(
                    crop, spec.max_size, spec.alpha_required,
                    guarantee_padding=spec.family == "markers",
                )
                result = normalize_projection(result, spec)
                result = normalize_dong_ho(result, spec.family)
                result.save(runtime_path, optimize=True)
                width, height = result.size
            else:
                if spec.asset_id == "building.mine-worker":
                    reason = "rejected: people are independent living-map sprites, never building art"
                else:
                    reason = "rejected: no reliable transparent separation; procedural fallback retained" if not alpha_ok \
                        else "rejected: procedural runtime art is clearer or avoids visible plate repetition"
                runtime_path.unlink(missing_ok=True)
                width = height = 0
            decision = {
                "id": spec.asset_id,
                "family": spec.family,
                "accepted": accepted,
                "attempts": spec.attempts,
                "attemptCount": spec.attempts,
                "reason": reason,
                "comparisonResult": "generated art accepted over procedural baseline" if accepted
                    else ("living-map person retained outside the building family" if spec.asset_id == "building.mine-worker"
                          else ("procedural baseline retained after generated output failed transparency review" if not alpha_ok
                                else "procedural baseline retained after in-game comparison")),
                "proceduralFallback": f"current procedural {spec.family} renderer",
                "sourceSheet": f"masters/{sheet.file}",
                "sourceCell": index,
                "alphaRequired": spec.alpha_required,
                "transparentRatio": round(transparent, 5),
                "borderAlphaMean": round(edge, 2),
                "width": width,
                "height": height,
                "runtimePath": runtime_path.relative_to(ROOT).as_posix() if accepted else None,
                "textureKey": f"conquest-art:{spec.asset_id}" if accepted else None,
                **review_metadata(spec),
                **clothing_metadata(spec),
            }
            decisions.append(decision)
            for alias_id in spec.aliases:
                alias_spec = Cell(
                    alias_id, spec.family, spec.alpha_required, spec.max_size, spec.attempts,
                )
                alias_path = RUNTIME / Path(*alias_id.split(".")).with_suffix(".png")
                if accepted:
                    alias_path.parent.mkdir(parents=True, exist_ok=True)
                    result.save(alias_path, optimize=True)
                else:
                    alias_path.unlink(missing_ok=True)
                decisions.append({
                    **decision,
                    "id": alias_id,
                    "runtimePath": alias_path.relative_to(ROOT).as_posix() if accepted else None,
                    "textureKey": f"conquest-art:{alias_id}" if accepted else None,
                    "derivedFrom": spec.asset_id,
                    **review_metadata(alias_spec),
                })

    accepted = [entry for entry in decisions if entry["accepted"]]
    rejected = [entry for entry in decisions if not entry["accepted"]]
    alpha_audit = audit_runtime_alpha(accepted)
    manifest = {
        "version": 1,
        "style": "Strict Dong Ho woodblock",
        "accepted": len(accepted),
        "fallback": len(rejected),
        "assets": decisions,
        "sheets": sheet_audit,
        "alphaAudit": alpha_audit,
    }
    (REVIEW / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (REVIEW / "decisions.json").write_text(json.dumps(decisions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    family_prompts = {
        "flora": "Six Vietnamese plant silhouettes across four seasons; identical foot anchors and related seasonal silhouettes.",
        "settlements": "Structure-only Vietnamese hamlets, market, shrine village, farmstead, mine and five historically differentiated citadels; no baked people, animals, vegetation, terrain, yards, fields, water, or shadows.",
        "buildings": "Structure-only Vietnamese village, mine and constructed-building sprites; true-alpha negative space, no baked people/animals/terrain, and one south-west dimetric camera.",
        "terrain": "Diep-paper texture plates, paddy states, water/coast/road brush stamps, karst, ridges, mist and blossom.",
        "life": "Farmer, traveller, buffalo family, ox cart, egrets and seasonal motes as isolated map sprites.",
        "markers": "Dynastic standards, muted rivals, capital and destination marks, seals, progress, battle, dust and route stamps.",
        "figures": "Four ordered ready poses (spear, sword and shield, bow or gun, horseman) by three tiers for each historical wardrobe, aligned to one foot baseline and authored facing viewer-right. The reviewed ranged cell supplies both internal ranged gameplay slots.",
    }
    prompts = {
        "tool": "built-in image_gen",
        "style": "Strict Dong Ho woodblock: softened carved umber outlines, flat muted diep-paper pigments, fixed south-west 30-degree dimetric world view",
        "sharedConstraints": [
            "historically Vietnamese forms", "small-map silhouette readability", "no text or watermark",
            "maximum three model outputs per variant", "flat #00FF00 isolation converted with scripts/chroma-to-alpha.mjs",
            "all physical world assets use one 30-degree oblique isometric camera and 2:1 ground plane",
            "world X/Y axes render at plus/minus 30 degrees from one south-west camera; vertical posts remain vertical",
            "settlement and building art contains structures only; living figures and tile surfaces remain independent runtime layers",
            f"all accepted runtime exports are softly normalized to {PALETTE_VERSION}",
            "all characters use one fixed 144 by 128 transparent runtime canvas so weapon reach cannot change body scale",
            "all figure masters use flat side-on 2D viewer-right as native facing; the battlefield mirrors the opposing host at runtime",
            "all figures stand planted in a ready stance; no attack impact, running, firing smoke, or isometric camera",
        ],
        "families": [
            {"sheet": sheet.file, "family": next(cell.family for cell in sheet.cells if cell),
             "promptBrief": family_prompts[next(cell.family for cell in sheet.cells if cell)]}
            for sheet in SHEETS
        ],
        "isolationRepair": "Keep the accepted artwork unchanged and place every sprite on perfectly flat #00FF00 for deterministic alpha conversion.",
        "referenceCorrections": {
            "reference": "dated chronicles, museum and archival visual evidence; docs/resources/army/timeline-of-vietnamese-military-v0.webp is secondary reconstruction only",
            "figure.dinh": "flat four-sided leather tu-phuong-binh-dinh cap at every level; no later domed helmet or chest mirror",
            "figure.ly": "knee-length narrow-sleeved tunic with restrained early protective layers; full armor remains explicitly reconstructive",
            "figure.tran": "dark padded underlayers and compact lacquered protection distinct from Ly; no dominant silver chest mirror",
            "figure.le": "early-Le compact lacquered protection kept distinct from later Le-Trinh cloth-cap clothing",
            "figure.trinh": "structured woven Dinh-Tu and Thanh-Cat caps replace the unsupported fuzzy cylinder cap",
            "figure.nguyenLord": "wardrobe fixed to post-1744: front-fastened standing-collar long coat and trousers, with armor remaining secondary",
            "figure.tayson": "wrapped khan, practical southern tunic and broad trousers; armor remains secondary and no helmet",
            "figure.nguyen": "buttoned ao-song-khai, low service hats, rank-specific trim and predominantly bare feet; no full lamellar tier",
            "figure.ranged": "Đinh/Lý/Trần/Song/Yuan/Champa use right-pointing bows; Later Lê/Trịnh/Nguyễn Lords/Tây Sơn/Nguyễn/Ming/Qing use right-pointing matchlocks",
        },
    }
    (REVIEW / "prompts.json").write_text(json.dumps(prompts, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    runtime_manifest = {
        "version": 1,
        "assets": [
            {key: entry[key] for key in (
                "id", "family", "textureKey", "runtimePath", "width", "height",
                "runtimeScale", "projection", "cameraView", "contentPolicy", "bakedPeople",
                "bakedTerrain", "paletteVersion", "opacity", "nativeFacing",
            )}
            for entry in accepted
        ],
    }
    (RUNTIME / "manifest.json").write_text(json.dumps(runtime_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    by_family: dict[str, list[dict]] = {}
    for entry in decisions:
        by_family.setdefault(entry["family"], []).append(entry)
    contact_sheet(decisions, REVIEW / "contact-all.jpg", f"Conquest Dong Ho art — {len(accepted)} accepted / {len(rejected)} procedural fallbacks")
    for family, entries in by_family.items():
        contact_sheet(entries, REVIEW / f"contact-{family}.jpg", f"Conquest Dong Ho — {family}")
    contact_sheet(
        [entry for entry in decisions if entry["family"] == "figures" and "derivedFrom" not in entry],
        REVIEW / "contact-armies-v2.jpg",
        "Conquest Đông Hồ armies — Vietnamese clothing v3 / unchanged foreign wardrobes v2",
    )
    contact_sheet(
        [entry for entry in decisions
         if entry["family"] == "figures"
         and entry.get("clothingRevision") == "v3-historical-audit"
         and "derivedFrom" not in entry],
        REVIEW / "contact-vietnamese-clothing-v3.jpg",
        "Vietnamese army clothing v3 — 8 wardrobes × 3 levels × 4 fixed poses",
    )
    contact_sheet(
        [entry for entry in decisions if entry["id"].startswith("settlement.citadel-")],
        REVIEW / "contact-citadels.jpg",
        "Conquest Đông Hồ — five Đại Việt / Vietnamese citadel eras",
    )
    citadel_comparison_sheet(REVIEW / "comparison-citadels-v3-v5.jpg")
    comparison_sheet(REVIEW / "comparison-old-new.jpg")

    print(json.dumps({
        "accepted": len(accepted), "fallback": len(rejected),
        "alphaAudit": alpha_audit, "sheets": sheet_audit,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
