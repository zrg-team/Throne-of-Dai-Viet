#!/usr/bin/env python3
"""Draw the exact yaw-0/elevation-30 orthographic camera guide used by ImageGen."""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "output" / "conquest-dongho-review" / "camera-guide-yaw0-elevation30.png"
SIN30 = 0.5
COS30 = math.sqrt(3) / 2


def project(point: tuple[float, float, float], origin: tuple[float, float]) -> tuple[int, int]:
    x, depth, height = point
    return round(origin[0] + x), round(origin[1] - depth * SIN30 - height * COS30)


def main() -> None:
    image = Image.new("RGB", (1200, 820), (243, 236, 216))
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=24)
    small = ImageFont.load_default(size=18)
    origin = (600, 690)
    width, depth, wall, roof = 640, 430, 260, 130
    left, right = -width / 2, width / 2
    front, back = 0, depth

    floor = [
        project((left, front, 0), origin), project((right, front, 0), origin),
        project((right, back, 0), origin), project((left, back, 0), origin),
    ]
    top = [
        project((left, front, wall), origin), project((right, front, wall), origin),
        project((right, back, wall), origin), project((left, back, wall), origin),
    ]
    ridge_front = project((0, front + depth / 2, wall + roof), origin)
    ridge_back = project((0, back, wall + roof), origin)

    draw.polygon(floor, fill=(216, 201, 164), outline=(42, 33, 24), width=5)
    draw.polygon([floor[0], floor[1], top[1], top[0]], fill=(201, 183, 140), outline=(42, 33, 24), width=5)
    draw.polygon([top[0], top[1], ridge_front], fill=(179, 58, 38), outline=(42, 33, 24), width=5)
    draw.polygon([top[3], top[2], ridge_back], fill=(138, 42, 27), outline=(42, 33, 24), width=5)
    draw.line([top[0], top[3]], fill=(42, 33, 24), width=5)
    draw.line([top[1], top[2]], fill=(42, 33, 24), width=5)
    draw.line([ridge_front, ridge_back], fill=(42, 33, 24), width=5)

    centre_front = project((0, front, 0), origin)
    centre_back = project((0, back, 0), origin)
    draw.line([centre_front, centre_back], fill=(95, 138, 130), width=5)
    draw.line([(600, 735), (600, 85)], fill=(95, 138, 130), width=2)

    draw.text((40, 30), "CAMERA CONTRACT", fill=(42, 33, 24), font=font)
    draw.text((40, 75), "Horizontal yaw = 0 degrees (exact centre)", fill=(42, 33, 24), font=small)
    draw.text((40, 110), "Vertical elevation = 30 degrees above ground, looking downward", fill=(42, 33, 24), font=small)
    draw.text((40, 145), "Orthographic: screen X = world X", fill=(42, 33, 24), font=small)
    draw.text((40, 180), "Ground depth projects upward at sin(30) = 0.500", fill=(42, 33, 24), font=small)
    draw.text((40, 215), "Height projects upward at cos(30) = 0.866", fill=(42, 33, 24), font=small)
    draw.text((40, 755), "Top planes must be visible; depth never drifts left or right.", fill=(42, 33, 24), font=small)
    draw.text((705, 665), "front centre", fill=(95, 138, 130), font=small)
    draw.text((705, 445), "depth straight upward", fill=(95, 138, 130), font=small)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT, optimize=True)
    print(OUTPUT)


if __name__ == "__main__":
    main()
