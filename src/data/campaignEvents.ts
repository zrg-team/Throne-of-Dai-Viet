import type { CampaignEvent } from '../state/types';

export interface CampaignEventTemplate {
  id: string;
  type: CampaignEvent['type'];
  baseWeight: number;
  minTurn: number;
  messages: string[];
}

export const campaignEventTemplates: CampaignEventTemplate[] = [
  {
    id: 'bandit-raid-plains',
    type: 'bandit-raid',
    baseWeight: 3,
    minTurn: 2,
    messages: [
      'Bandits have raided villages in {land}, looting stores and terrorizing farmers.',
      'A band of outlaws struck {land} under cover of darkness — loyalty has fallen.',
      'Roving brigands pillaged {land}, the people cry out for justice.',
    ],
  },
  {
    id: 'spring-flood',
    type: 'flood',
    baseWeight: 2,
    minTurn: 1,
    messages: [
      'Spring rains have flooded the rice paddies — harvests will suffer this season.',
      'The rivers burst their banks, drowning crops across the realm.',
      'Floodwaters swept through the lowlands; food stores are running short.',
    ],
  },
  {
    id: 'summer-drought',
    type: 'drought',
    baseWeight: 2,
    minTurn: 3,
    messages: [
      'A dry summer parches the fields — farmers are restless and hungry.',
      'Drought strikes the heartland; wells run dry and granaries shrink.',
      'No rain for weeks. The peasants murmur of ill omens and hungry gods.',
    ],
  },
  {
    id: 'noble-defiance',
    type: 'noble-uprising',
    baseWeight: 2,
    minTurn: 4,
    messages: [
      'A noble house in {land} defies the crown, stirring unrest among local lords.',
      'Gentry in the provinces have refused the latest tax decree.',
      'A powerful lord challenges royal authority — the court is shaken.',
    ],
  },
  {
    id: 'merchant-caravan',
    type: 'merchant-bounty',
    baseWeight: 3,
    minTurn: 1,
    messages: [
      'A wealthy merchant caravan passes through, offering rare goods and coin.',
      'Trade winds blow fortune your way — merchants seek royal patronage.',
      'A prosperous trading guild pays tribute in exchange for safe passage.',
    ],
  },
  {
    id: 'pestilence',
    type: 'plague',
    baseWeight: 1,
    minTurn: 6,
    messages: [
      'A sickness spreads through the populace — villages thin, fields go untended.',
      'Plague visits the realm; the healers are overwhelmed.',
      'A fever sweeps the land. People flee the afflicted districts.',
    ],
  },
  {
    id: 'dynastic-invasion',
    type: 'dynasty-attack',
    baseWeight: 2,
    minTurn: 8,
    messages: [
      'The {kingdom} has mustered a great host and marches on your lands!',
      'War drums echo from {kingdom} — their armies are on the move.',
      'Scouts report a massive force from {kingdom} crossing the border.',
    ],
  },
];
