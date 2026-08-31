#!/usr/bin/env python3
"""Remove a pale neutral checkerboard connected to the canvas border.

ImageGen occasionally paints a transparency-preview checkerboard instead of
emitting alpha.  Structural sprites have a continuous dark woodblock outline,
so a border-connected flood fill can remove the matte without erasing pale
paper pigment enclosed by that outline.
"""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image


def is_background(red: int, green: int, blue: int) -> bool:
    return min(red, green, blue) >= 150 and max(red, green, blue) - min(red, green, blue) <= 26


def is_painted_checker(red: int, green: int, blue: int) -> bool:
    """Match ImageGen's near-white checker cells, including enclosed holes.

    Border flood-fill is intentionally broad so it can remove different pale
    mattes.  The global test is deliberately narrow: accepted structures use
    warm tan/red pigments, while the fake transparency preview is essentially
    neutral 245-255 grey.  This removes enclosed courtyards without punching
    holes in light stone or straw details.
    """
    return min(red, green, blue) >= 220 and max(red, green, blue) - min(red, green, blue) <= 12


def extract(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    outside = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def enqueue(x: int, y: int) -> None:
        index = y * width + x
        if outside[index]:
            return
        red, green, blue, _ = pixels[x, y]
        if not is_background(red, green, blue):
            return
        outside[index] = 1
        queue.append((x, y))

    for x in range(width):
        enqueue(x, 0)
        enqueue(x, height - 1)
    for y in range(height):
        enqueue(0, y)
        enqueue(width - 1, y)

    # Enclosed courtyards cannot be reached from the canvas border. Seed the
    # same flood from every unmistakable near-white checker cell, then let the
    # existing broader neutral-matte test consume only its anti-aliased fringe.
    for y in range(height):
        for x in range(width):
            red, green, blue, _ = pixels[x, y]
            if is_painted_checker(red, green, blue):
                enqueue(x, y)

    while queue:
        x, y = queue.popleft()
        if x:
            enqueue(x - 1, y)
        if x + 1 < width:
            enqueue(x + 1, y)
        if y:
            enqueue(x, y - 1)
        if y + 1 < height:
            enqueue(x, y + 1)

    output = Image.new("RGBA", rgba.size)
    output_pixels = output.load()
    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            if outside[y * width + x]:
                output_pixels[x, y] = (0, 0, 0, 0)
            else:
                output_pixels[x, y] = (red, green, blue, alpha)
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()

    result = extract(Image.open(args.source))
    args.destination.parent.mkdir(parents=True, exist_ok=True)
    result.save(args.destination, optimize=True)
    print(f"{args.destination}: {result.size[0]}x{result.size[1]}")


if __name__ == "__main__":
    main()
