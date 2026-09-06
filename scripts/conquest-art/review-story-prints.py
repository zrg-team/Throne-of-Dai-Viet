"""Create labelled contact sheets from existing art; no generated drawing or recolouring."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[2]
assets = json.loads((root / 'src/ui/storyPrintAssets.json').read_text())
out = root / 'docs/dong-ho-card-prints'
out.mkdir(parents=True, exist_ok=True)
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 18)
entries = list(assets.items())
for start in range(0, len(entries), 10):
    board = Image.new('RGB', (640, 5 * 226), '#f3ecd8')
    draw = ImageDraw.Draw(board)
    for i, (key, filename) in enumerate(entries[start:start+10]):
        x, y = (i % 2) * 320, (i // 2) * 226
        path = root / 'public/art/story-prints' / filename
        if not path.exists():
            continue
        with Image.open(path) as im:
            im.thumbnail((288, 192), Image.Resampling.LANCZOS)
            board.paste(im, (x+(320-im.width)//2, y))
        draw.text((x+16, y+199), f'{start+i+1:02d}  {key}', fill='#2a2118', font=font)
    board.save(out / f'prints-{start+1:02d}-{min(start+10,len(entries)):02d}.jpg', quality=92)
print(out)
