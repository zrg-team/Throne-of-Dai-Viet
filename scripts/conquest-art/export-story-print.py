"""Mechanical resize/encoding and provenance only; drawing is made by ImageGen."""
import json
import shutil
import sys
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[2]
card_id, source = sys.argv[1:3]
jobs = json.loads((root / 'docs/dong-ho-card-print-prompts.json').read_text(encoding='utf-8'))['jobs']
job = next(job for job in jobs if job['id'] == card_id)
master = root / 'output/dongho-card-prints/masters' / f'{card_id}.png'
master.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(source, master)
target = root / job['output']
with Image.open(master) as im:
    im = im.convert('RGB')
    # Contain the whole print, with matching paper if a generator varies its aspect ratio.
    im.thumbnail((576, 384), Image.Resampling.LANCZOS)
    canvas = Image.new('RGB', (576, 384), '#f3ecd8')
    canvas.paste(im, ((576-im.width)//2, (384-im.height)//2))
    canvas.save(target, 'WEBP', quality=88, method=6)
log_path = root / 'docs/dong-ho-card-print-generation-log.json'
log = json.loads(log_path.read_text(encoding='utf-8')) if log_path.exists() else {'mode':'built-in ImageGen', 'assets':[]}
log['assets'] = [a for a in log['assets'] if a['id'] != card_id]
log['assets'].append({'id':card_id, 'generatedSource':source, 'master':master.relative_to(root).as_posix(),
    'runtime':job['output'], 'width':576, 'height':384, 'bytes':target.stat().st_size,
    'prompt':'docs/dong-ho-card-print-prompts.json#'+card_id})
log_path.write_text(json.dumps(log, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(f'{len(log["assets"])}/50 saved: {target.relative_to(root)} ({target.stat().st_size} bytes)')
