#!/usr/bin/env python3
"""Normalize one approved front-centred, 30-degree conquest-map master.

ImageGen masters are retained at full resolution under the review folder.  This
tool creates the tightly cropped, palette-normalized runtime PNG while keeping
the existing bottom-centre anchor contract used by the map renderers.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
RUNTIME_ROOT = ROOT / "public" / "art" / "conquest-dongho"

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

FAMILY_MAX_SIZE = {
    "building": 288,
    "settlement": 480,
    "terrain": 384,
}

FAMILY_OPACITY = {
    "building": 0.87,
    "settlement": 0.86,
    "terrain": 0.90,
}


def runtime_path(asset_id: str) -> Path:
    parts = asset_id.split(".")
    if len(parts) < 2 or parts[0] not in FAMILY_MAX_SIZE:
        raise ValueError(f"unsupported structural asset id: {asset_id}")
    return RUNTIME_ROOT.joinpath(*parts).with_suffix(".png")


def tight_pad(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > 12 else 0).getbbox()
    if bbox is None:
        raise ValueError("master has no visible pixels")
    content = image.crop(bbox)
    pad = max(8, round(max(content.size) * 0.055))
    padded = Image.new("RGBA", (content.width + pad * 2, content.height + pad * 2))
    padded.alpha_composite(content, (pad, pad))
    return padded


def normalize_palette(image: Image.Image, family: str) -> Image.Image:
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


def resize(image: Image.Image, max_size: int) -> Image.Image:
    scale = min(1.0, max_size / max(image.size))
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    return image.resize(size, Image.Resampling.LANCZOS)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("asset_id")
    parser.add_argument("alpha_master", type=Path)
    args = parser.parse_args()

    family = args.asset_id.split(".", 1)[0]
    image = Image.open(args.alpha_master).convert("RGBA")
    image = resize(normalize_palette(tight_pad(image), family), FAMILY_MAX_SIZE[family])
    destination = runtime_path(args.asset_id)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, optimize=True)
    print(f"{args.asset_id}: {image.width}x{image.height} -> {destination}")


if __name__ == "__main__":
    main()
