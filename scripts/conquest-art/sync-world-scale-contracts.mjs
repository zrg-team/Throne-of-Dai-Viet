#!/usr/bin/env node
/** Synchronise reviewed runtime metadata with the semantic world-size contracts used by the game. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const buildings = {
  'thatched-house': ['house', 15], 'tiled-house': ['house', 15],
  'communal-hall': ['civic-building', 18], 'pagoda-tower': ['tower', 36, 20],
  'swept-yard': ['small-prop', 7], 'village-pond': ['small-prop', 8],
  'bamboo-hedge': ['small-prop', 9], kitchen: ['house', 13],
  'buffalo-byre': ['house', 12], 'grain-bin': ['small-prop', 13, 13],
  well: ['small-prop', 9, 10], haystack: ['small-prop', 8, 10],
  'mine-bank': ['industry', 14], 'mine-adit': ['industry', 14],
  'mine-timbers': ['industry', 12], 'spoil-heap': ['small-prop', 7],
  baskets: ['small-prop', 6], 'mine-worker': ['small-prop', 10],
  'improvement-farm': ['industry', 12], 'improvement-mine': ['industry', 16],
  'improvement-market': ['civic-building', 13], 'improvement-wall': ['civic-building', 16],
  'improvement-tower': ['tower', 22, 16], 'improvement-barracks': ['civic-building', 14],
  'improvement-communal-hall': ['civic-building', 17],
  'improvement-harbor': ['industry', 17], 'improvement-workshop': ['industry', 15],
  'improvement-guild': ['civic-building', 17],
  'improvement-university': ['civic-building', 17],
};

const settlements = {
  hamlet: ['rural-settlement', 32, 56], village: ['village', 38, 60],
  'market-town': ['town', 40, 62], 'shrine-village': ['town', 44, 64],
  farmstead: ['rural-settlement', 28, 56], 'mine-camp': ['rural-settlement', 32, 56],
  'citadel-dinh': ['citadel', 50, 64], 'citadel-ly': ['citadel', 52, 64],
  'citadel-tran': ['citadel', 52, 64], 'citadel-le': ['citadel', 52, 64],
  'citadel-nguyen': ['citadel', 52, 64],
};

function contractFor(id) {
  const [family, state] = id.split('.', 2);
  const tuple = family === 'building' ? buildings[state]
    : family === 'settlement' ? settlements[state]
      : undefined;
  if (!tuple) return undefined;
  const [scaleClass, worldHeight, maxWorldWidth] = tuple;
  return {
    class: scaleClass,
    worldHeight,
    ...(maxWorldWidth === undefined ? {} : { maxWorldWidth }),
  };
}

function updateEntries(entries) {
  for (const entry of entries) {
    const contract = contractFor(entry.id);
    if (!contract) continue;
    entry.runtimeScale = 1;
    entry.scaleContract = contract;
  }
}

function update(relativePath, arrayKey) {
  const file = path.join(root, relativePath);
  const source = fs.readFileSync(file, 'utf8');
  const json = JSON.parse(source);
  const entries = arrayKey ? json[arrayKey] : json;
  updateEntries(entries);
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`.replaceAll('\n', newline));
}

update('public/art/conquest-dongho/manifest.json', 'assets');
// Review output is generated locally and is absent from a fresh checkout.
for (const [file, key] of [
  ['output/conquest-dongho-review/manifest.json', 'assets'],
  ['output/conquest-dongho-review/decisions.json', undefined],
]) {
  if (fs.existsSync(path.join(root, file))) update(file, key);
}
console.log('synchronised semantic scale contracts for buildings and settlements');
