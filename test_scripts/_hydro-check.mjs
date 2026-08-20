import { buildMap, summarise } from './_hydrology.mjs';
const seeds = [1337, 42, 7, 2024, 99];
for (const mode of ['current', 'proposed']) {
  console.log(`\n── ${mode.toUpperCase()} ─────────────────────────────`);
  for (const seed of seeds) {
    const map = buildMap(seed, mode);
    const s = summarise(map);
    console.log(
      `seed ${String(seed).padStart(5)} | water ${String(s.waterTiles).padStart(4)} (${s.waterShare}%)` +
      ` | bodies ${String(s.bodies).padStart(2)} lakes ${String(s.lakeBodies).padStart(2)} noOut ${String(s.noOutlet).padStart(2)}` +
      ` | kinds sea:${s.kinds.sea} riv:${s.kinds.river} str:${s.kinds.stream} lak:${s.kinds.lake}` +
      ` | prov w>0 ${String(s.withWater).padStart(2)}/${s.provinces} coast ${String(s.withCoast).padStart(2)}` +
      ` harbourable ${String(s.harbourable).padStart(2)}` +
      ` | unclaimed water ${s.unclaimedWater}` +
      (mode === 'proposed' ? ` | courses ${map.stats.courses} toSea ${map.stats.reachedSea} merged ${map.stats.merged}` : '')
    );
  }
}
