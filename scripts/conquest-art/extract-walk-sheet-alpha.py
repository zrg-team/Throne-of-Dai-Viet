#!/usr/bin/env python3
"""Remove ImageGen's pale checker matte from a character walk sheet.

Unlike ``extract-checker-alpha.py``, this variant does not seed every nearly
white pixel. Character sheets contain pale skin and cloth highlights that must
remain opaque. It removes neutral regions only when they reach the canvas edge
or form a large, overwhelmingly checker-coloured enclosed component.
"""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

from PIL import Image


def is_neutral_matte(red: int, green: int, blue: int) -> bool:
    return min(red, green, blue) >= 150 and max(red, green, blue) - min(red, green, blue) <= 26


def is_checker_core(red: int, green: int, blue: int) -> bool:
    return min(red, green, blue) >= 220 and max(red, green, blue) - min(red, green, blue) <= 12


def extract(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    visited = bytearray(width * height)
    remove = bytearray(width * height)

    for start_y in range(height):
        for start_x in range(width):
            start_index = start_y * width + start_x
            if visited[start_index]:
                continue
            red, green, blue, _ = pixels[start_x, start_y]
            if not is_neutral_matte(red, green, blue):
                visited[start_index] = 1
                continue

            queue: deque[tuple[int, int]] = deque([(start_x, start_y)])
            visited[start_index] = 1
            component: list[int] = []
            checker_pixels = 0
            touches_edge = False

            while queue:
                x, y = queue.popleft()
                index = y * width + x
                component.append(index)
                red, green, blue, _ = pixels[x, y]
                checker_pixels += int(is_checker_core(red, green, blue))
                touches_edge = touches_edge or x == 0 or y == 0 or x == width - 1 or y == height - 1

                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    next_index = ny * width + nx
                    if visited[next_index]:
                        continue
                    nr, ng, nb, _ = pixels[nx, ny]
                    if not is_neutral_matte(nr, ng, nb):
                        continue
                    visited[next_index] = 1
                    queue.append((nx, ny))

            checker_ratio = checker_pixels / len(component)
            if touches_edge or (len(component) >= 400 and checker_ratio >= 0.8):
                for index in component:
                    remove[index] = 1

    output = Image.new("RGBA", rgba.size)
    output_pixels = output.load()
    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            output_pixels[x, y] = (0, 0, 0, 0) if remove[y * width + x] else (red, green, blue, alpha)
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
