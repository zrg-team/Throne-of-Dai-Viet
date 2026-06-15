import type { PoliticsCard } from '../state/types';

export const politicsCardTemplates: PoliticsCard[] = [
  {
    id: 'flood-river',
    title: 'Flood in River Village',
    type: 'problem',
    description: 'Heavy rain has damaged rice fields near the Red River.',
    choices: [
      {
        id: 'relief',
        label: 'Send Relief',
        description: 'Spend gold to protect stability.',
        effects: { gold: -35, stability: 8, food: 8 },
      },
      {
        id: 'ignore',
        label: 'Ignore',
        description: 'Save gold but lose public trust.',
        effects: { food: -24, stability: -8 },
      },
    ],
  },
  {
    id: 'noble-autonomy',
    title: 'Noble Estate Demands Autonomy',
    type: 'problem',
    description: 'Local nobles want lower taxes in newly acquired lands.',
    choices: [
      {
        id: 'accept',
        label: 'Accept',
        description: 'Calm the nobles at economic cost.',
        effects: { stability: 7, gold: -18 },
      },
      {
        id: 'reject',
        label: 'Reject',
        description: 'Keep tax authority but risk anger.',
        effects: { gold: 20, stability: -9 },
      },
    ],
  },
  {
    id: 'bandit-prisoners',
    title: 'Bandit Prisoners Captured',
    type: 'opportunity',
    description: 'Captured bandits can be punished or absorbed.',
    choices: [
      {
        id: 'execute',
        label: 'Execute',
        description: 'Public order rises, influence suffers.',
        effects: { stability: 8, influence: -8 },
      },
      {
        id: 'recruit',
        label: 'Recruit Them',
        description: 'Gain manpower, lower trust.',
        effects: { manpower: 70, stability: -7 },
      },
    ],
  },
  {
    id: 'foreign-trader',
    title: 'Foreign Trader Arrives',
    type: 'opportunity',
    description: 'A merchant offers weapons and luxury goods.',
    choices: [
      {
        id: 'tax',
        label: 'Tax Trade',
        description: 'Take gold immediately.',
        effects: { gold: 45, influence: -4 },
      },
      {
        id: 'welcome',
        label: 'Welcome',
        description: 'Use diplomacy to build influence.',
        effects: { influence: 18, gold: -10 },
      },
    ],
  },
  {
    id: 'scholar-reform',
    title: 'Scholar Offers Reform',
    type: 'law',
    description: 'A scholar proposes a more disciplined bureaucracy.',
    choices: [
      {
        id: 'adopt',
        label: 'Adopt',
        description: 'Gain influence but pay reform costs.',
        effects: { influence: 20, gold: -28 },
      },
      {
        id: 'decline',
        label: 'Decline',
        description: 'Avoid disruption.',
        effects: { stability: 4 },
      },
    ],
  },
  {
    id: 'famine-warning',
    title: 'Famine Warning',
    type: 'crisis',
    description: 'Village elders warn that stores are too low.',
    choices: [
      {
        id: 'ration',
        label: 'Ration',
        description: 'Protect food and anger the army.',
        effects: { food: 25, stability: -5 },
      },
      {
        id: 'buy-grain',
        label: 'Buy Grain',
        description: 'Spend gold to avoid unrest.',
        effects: { gold: -45, food: 45, stability: 3 },
      },
    ],
  },
  {
    id: 'army-desertion',
    title: 'Army Desertion',
    type: 'problem',
    description: 'Unpaid soldiers are leaving their banners.',
    choices: [
      {
        id: 'pay',
        label: 'Pay Bonus',
        description: 'Spend gold to restore morale.',
        effects: { gold: -35, stability: 4 },
      },
      {
        id: 'threaten',
        label: 'Threaten',
        description: 'Keep gold but weaken stability.',
        effects: { stability: -10, manpower: -40 },
      },
    ],
  },
  {
    id: 'temple-donation',
    title: 'Temple Requests Donation',
    type: 'opportunity',
    description: 'Monks ask the court to sponsor repairs.',
    choices: [
      {
        id: 'donate',
        label: 'Donate',
        description: 'Buy legitimacy.',
        effects: { gold: -25, influence: 15, stability: 4 },
      },
      {
        id: 'refuse',
        label: 'Refuse',
        description: 'Keep treasury full.',
        effects: { gold: 10, influence: -6 },
      },
    ],
  },
  {
    id: 'market-corruption',
    title: 'Market Corruption',
    type: 'problem',
    description: 'Tax collectors are skimming gold.',
    choices: [
      {
        id: 'investigate',
        label: 'Investigate',
        description: 'Spend influence to recover gold.',
        effects: { influence: -10, gold: 35, stability: 2 },
      },
      {
        id: 'ignore',
        label: 'Ignore',
        description: 'Avoid conflict but lose order.',
        effects: { gold: -15, stability: -5 },
      },
    ],
  },
  {
    id: 'border-refugees',
    title: 'Border Refugees',
    type: 'opportunity',
    description: 'Families flee a rival kingdom and ask for land.',
    choices: [
      {
        id: 'settle',
        label: 'Settle Them',
        description: 'Gain manpower, spend food.',
        effects: { manpower: 80, food: -25 },
      },
      {
        id: 'turn-away',
        label: 'Turn Away',
        description: 'Avoid pressure but lose influence.',
        effects: { stability: 3, influence: -8 },
      },
    ],
  },
  {
    id: 'military-court',
    title: 'Military Court Law',
    type: 'law',
    description: 'Generals ask for more authority in court.',
    choices: [
      {
        id: 'grant',
        label: 'Grant Power',
        description: 'Gain manpower, lose stability.',
        effects: { manpower: 120, stability: -8 },
      },
      {
        id: 'balance',
        label: 'Balance Court',
        description: 'Protect stability.',
        effects: { influence: 8, stability: 4 },
      },
    ],
  },
  {
    id: 'trade-policy',
    title: 'Trade Policy Debate',
    type: 'law',
    description: 'Merchants want lower tariffs on port goods.',
    choices: [
      {
        id: 'lower',
        label: 'Lower Tariffs',
        description: 'Improve influence with traders.',
        effects: { influence: 12, gold: -15 },
      },
      {
        id: 'raise',
        label: 'Raise Tariffs',
        description: 'Immediate gold, less goodwill.',
        effects: { gold: 30, stability: -4 },
      },
    ],
  },
  {
    id: 'famous-general',
    title: 'Famous General Seeks Service',
    type: 'opportunity',
    description: 'A veteran commander asks for a stipend.',
    choices: [
      {
        id: 'hire',
        label: 'Hire Scouts',
        description: 'Pay gold for manpower and morale.',
        effects: { gold: -40, manpower: 90, stability: 3 },
      },
      {
        id: 'decline',
        label: 'Decline',
        description: 'Keep treasury stable.',
        effects: { gold: 8 },
      },
    ],
  },
  {
    id: 'local-lord',
    title: 'Neutral Lord Wants Protection',
    type: 'opportunity',
    description: 'A minor lord asks for recognition.',
    choices: [
      {
        id: 'recognize',
        label: 'Recognize',
        description: 'Spend influence to gain stability.',
        effects: { influence: -14, stability: 10 },
      },
      {
        id: 'demand',
        label: 'Demand Tribute',
        description: 'Gain gold and lose influence.',
        effects: { gold: 25, influence: -10 },
      },
    ],
  },
  {
    id: 'forge-shortage',
    title: 'Forge Shortage',
    type: 'problem',
    description: 'Iron tools and weapons are scarce.',
    choices: [
      {
        id: 'subsidize',
        label: 'Subsidize',
        description: 'Spend gold for manpower readiness.',
        effects: { gold: -30, manpower: 70 },
      },
      {
        id: 'delay',
        label: 'Delay',
        description: 'Save gold, lower army confidence.',
        effects: { stability: -5 },
      },
    ],
  },
  {
    id: 'harvest-feast',
    title: 'Harvest Feast',
    type: 'opportunity',
    description: 'Villagers celebrate a good harvest.',
    choices: [
      {
        id: 'sponsor',
        label: 'Sponsor',
        description: 'Spend food for legitimacy.',
        effects: { food: -20, stability: 8, influence: 5 },
      },
      {
        id: 'tax',
        label: 'Tax Surplus',
        description: 'Gain gold, annoy villages.',
        effects: { gold: 24, stability: -4 },
      },
    ],
  },
  {
    id: 'spy-report',
    title: 'Spy Report',
    type: 'opportunity',
    description: 'Agents locate weak gates in a rival fort.',
    choices: [
      {
        id: 'use',
        label: 'Use Report',
        description: 'Spend influence to prepare war.',
        effects: { influence: -8, manpower: 55 },
      },
      {
        id: 'sell',
        label: 'Sell Rumor',
        description: 'Turn secrets into gold.',
        effects: { gold: 20, influence: -4 },
      },
    ],
  },
  {
    id: 'succession-rumor',
    title: 'Succession Rumor',
    type: 'crisis',
    description: 'A false claimant spreads rumors in court.',
    choices: [
      {
        id: 'debunk',
        label: 'Debunk',
        description: 'Spend influence to preserve stability.',
        effects: { influence: -16, stability: 10 },
      },
      {
        id: 'crush',
        label: 'Crush Rumor',
        description: 'Use force and lose trust.',
        effects: { manpower: -45, stability: -6 },
      },
    ],
  },
  {
    id: 'road-repair',
    title: 'Road Repair Demand',
    type: 'problem',
    description: 'Merchants complain that roads are unsafe.',
    choices: [
      {
        id: 'repair',
        label: 'Repair',
        description: 'Spend gold, improve order.',
        effects: { gold: -28, stability: 6, influence: 4 },
      },
      {
        id: 'postpone',
        label: 'Postpone',
        description: 'Keep money, lose commerce trust.',
        effects: { gold: 8, stability: -5 },
      },
    ],
  },
  {
    id: 'winter-stores',
    title: 'Winter Stores',
    type: 'problem',
    description: 'The court must prepare for hard weather.',
    choices: [
      {
        id: 'stockpile',
        label: 'Stockpile',
        description: 'Spend gold to protect food.',
        effects: { gold: -25, food: 35 },
      },
      {
        id: 'risk',
        label: 'Risk It',
        description: 'Avoid spending, stability falls.',
        effects: { stability: -6 },
      },
    ],
  },
  {
    id: 'border-rebellion',
    title: 'Border Rebellion',
    type: 'crisis',
    description: 'A frontier district rises against your tax collectors.',
    choices: [
      {
        id: 'suppress',
        label: 'Suppress',
        description: 'Send troops to restore order.',
        effects: { stability: 6, gold: -30, humans: -40 },
      },
      {
        id: 'negotiate',
        label: 'Negotiate',
        description: 'Lower taxes to calm the district.',
        effects: { stability: 10, gold: -15, influence: -5 },
      },
    ],
  },
  {
    id: 'plague-outbreak',
    title: 'Plague Outbreak',
    type: 'crisis',
    description: 'Disease spreads through crowded districts.',
    choices: [
      {
        id: 'quarantine',
        label: 'Quarantine',
        description: 'Contain the plague at economic cost.',
        effects: { humans: -30, gold: -20, stability: 4 },
      },
      {
        id: 'pray',
        label: 'Pray for Mercy',
        description: 'Let it run its course.',
        effects: { humans: -70, stability: -6 },
      },
    ],
  },
  {
    id: 'tax-revolt',
    title: 'Tax Revolt',
    type: 'problem',
    description: 'Merchants refuse to pay the new levies.',
    choices: [
      {
        id: 'enforce',
        label: 'Enforce',
        description: 'Collect the gold but anger the people.',
        effects: { gold: 35, stability: -8 },
      },
      {
        id: 'repeal',
        label: 'Repeal Levy',
        description: 'Abandon the tax to restore calm.',
        effects: { gold: -20, stability: 7 },
      },
    ],
  },
  {
    id: 'wandering-hero',
    title: 'A Wandering Hero Arrives',
    type: 'opportunity',
    description: 'A skilled traveler offers their service to the court.',
    choices: [
      {
        id: 'welcome',
        label: 'Welcome Them',
        description: 'Spend influence and gold to host them.',
        effects: { influence: -12, gold: -10 },
      },
      {
        id: 'send-away',
        label: 'Send Them Away',
        description: 'Keep your resources, lose the chance.',
        effects: { influence: 4 },
      },
    ],
  },
  {
    id: 'royal-festival',
    title: 'Royal Festival',
    type: 'opportunity',
    description: 'The court proposes a festival to celebrate the season.',
    choices: [
      {
        id: 'host',
        label: 'Host Festival',
        description: 'Spend gold and food to boost morale and order.',
        effects: { gold: -30, food: -15, stability: 9, influence: 5 },
      },
      {
        id: 'skip',
        label: 'Skip It',
        description: 'Save resources, miss the goodwill.',
        effects: { stability: -3 },
      },
    ],
  },
  {
    id: 'spy-network-windfall',
    title: 'Spy Network Windfall',
    type: 'opportunity',
    description: 'Your spies uncover a rival treasury convoy ripe for plunder.',
    choices: [
      {
        id: 'raid',
        label: 'Raid the Convoy',
        description: 'Seize a fortune, but the act risks your standing.',
        effects: { gold: 90, stability: -12, influence: -8 },
      },
      {
        id: 'let-pass',
        label: 'Let It Pass',
        description: 'Avoid the risk and the reward.',
        effects: { influence: 3 },
      },
    ],
  },
];
