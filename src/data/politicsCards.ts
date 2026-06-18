import type { PoliticsCard } from '../state/types';

export const politicsCardTemplates: PoliticsCard[] = [
  {
    id: 'granary-charter',
    title: 'Granary Charter',
    type: 'law',
    description: 'The court debates how to secure harvest stores for the realm.',
    choices: [
      { id: 'royal-granaries', label: 'Royal Granaries', description: 'Permanent food income rises.', effects: { resourceRateModifier: { food: 2 }, permanent: true } },
      { id: 'settler-rations', label: 'Settler Rations', description: 'Permanent human growth rises.', effects: { resourceRateModifier: { humans: 1 }, permanent: true } },
    ],
  },
  {
    id: 'mint-policy',
    title: 'Mint Policy',
    type: 'law',
    description: 'Treasurers propose new standards for coinage and trade dues.',
    choices: [
      { id: 'true-weight-coins', label: 'True Weight Coins', description: 'Permanent gold income rises.', effects: { resourceRateModifier: { gold: 2 }, permanent: true } },
      { id: 'merchant-ledgers', label: 'Merchant Ledgers', description: 'Markets permanently produce more gold.', effects: { marketGoldOutputModifier: 0.18, permanent: true } },
    ],
  },
  {
    id: 'arsenal-charter',
    title: 'Arsenal Charter',
    type: 'law',
    description: 'Smiths ask the throne to standardize stockpiles and tools.',
    choices: [
      { id: 'royal-warehouses', label: 'Royal Warehouses', description: 'Permanent supplies income rises.', effects: { resourceRateModifier: { supplies: 2 }, permanent: true } },
      { id: 'cheap-armories', label: 'Cheap Armories', description: 'Recruitment supply cost falls permanently.', effects: { recruitmentSupplyCostModifier: -0.18, permanent: true } },
    ],
  },
  {
    id: 'maintenance-edict',
    title: 'Maintenance Edict',
    type: 'law',
    description: 'Officials look for ways to reduce recurring costs.',
    choices: [
      { id: 'building-audits', label: 'Building Audits', description: 'Building gold upkeep falls permanently.', effects: { buildingGoldUpkeepModifier: -0.15, permanent: true } },
      { id: 'supply-audits', label: 'Supply Audits', description: 'Building supply upkeep falls permanently.', effects: { buildingSuppliesUpkeepModifier: -0.15, permanent: true } },
    ],
  },
  {
    id: 'campaign-budget',
    title: 'Campaign Budget',
    type: 'law',
    description: 'Generals and clerks argue over army expenses.',
    choices: [
      { id: 'lean-camps', label: 'Lean Camps', description: 'Army gold upkeep falls permanently.', effects: { armyGoldUpkeepModifier: -0.12, permanent: true } },
      { id: 'settlement-brokers', label: 'Settlement Brokers', description: 'Peaceful acquisition cost falls permanently.', effects: { acquisitionCostModifier: -0.15, permanent: true } },
    ],
  },
  {
    id: 'spring-harvest',
    title: 'Spring Harvest',
    type: 'opportunity',
    seasons: ['Spring'],
    description: 'A mild season gives villages room to produce a surplus.',
    choices: [
      { id: 'store-rice', label: 'Store Rice', description: 'Food income surges for 6 ticks.', effects: { resourceRateModifier: { food: 7 }, durationTicks: 6 } },
      { id: 'invite-settlers', label: 'Invite Settlers', description: 'Human growth surges for 6 ticks.', effects: { resourceRateModifier: { humans: 4 }, durationTicks: 6 } },
    ],
  },
  {
    id: 'river-tolls',
    title: 'River Tolls',
    type: 'opportunity',
    description: 'Busy waterways can fill the treasury or the warehouses.',
    choices: [
      { id: 'collect-tolls', label: 'Collect Tolls', description: 'Gold income surges for 6 ticks.', effects: { resourceRateModifier: { gold: 8 }, durationTicks: 6 } },
      { id: 'stock-boats', label: 'Stock Boats', description: 'Supplies income surges for 6 ticks.', effects: { resourceRateModifier: { supplies: 7 }, durationTicks: 6 } },
    ],
  },
  {
    id: 'trade-caravan',
    title: 'Trade Caravan',
    type: 'opportunity',
    description: 'A caravan offers an unusual burst of commerce.',
    choices: [
      { id: 'escort-caravan', label: 'Escort Caravan', description: 'Gold and supplies rise for 5 ticks.', effects: { resourceRateModifier: { gold: 5, supplies: 4 }, durationTicks: 5 } },
      { id: 'sell-grain', label: 'Sell Grain', description: 'Gain gold immediately.', effects: { resourceDelta: { gold: 80 } } },
    ],
  },
  {
    id: 'bad-harvest',
    title: 'Bad Harvest',
    type: 'crisis',
    seasons: ['Autumn', 'Winter'],
    description: 'The court must decide how to absorb a poor harvest.',
    choices: [
      { id: 'tight-rations', label: 'Tight Rations', description: 'Food income falls for 4 ticks.', effects: { resourceRateModifier: { food: -5 }, durationTicks: 4 } },
      { id: 'buy-relief-grain', label: 'Buy Relief Grain', description: 'Spend gold for immediate food.', effects: { resourceDelta: { gold: -45, food: 75 } } },
    ],
  },
  {
    id: 'leaking-treasury',
    title: 'Leaking Treasury',
    type: 'problem',
    description: 'Coin disappears from provincial accounts.',
    choices: [
      { id: 'accept-losses', label: 'Accept Losses', description: 'Gold income falls for 4 ticks.', effects: { resourceRateModifier: { gold: -5 }, durationTicks: 4 } },
      { id: 'seize-ledgers', label: 'Seize Ledgers', description: 'Recover supplies and gold immediately.', effects: { resourceDelta: { gold: 35, supplies: 20 } } },
    ],
  },
  {
    id: 'spoiled-stores',
    title: 'Spoiled Stores',
    type: 'problem',
    description: 'Warehouse stores are damp and unreliable.',
    choices: [
      { id: 'patch-warehouses', label: 'Patch Warehouses', description: 'Supplies income falls for 4 ticks.', effects: { resourceRateModifier: { supplies: -5 }, durationTicks: 4 } },
      { id: 'emergency-purchase', label: 'Emergency Purchase', description: 'Spend gold for immediate supplies.', effects: { resourceDelta: { gold: -35, supplies: 70 } } },
    ],
  },
  {
    id: 'labor-unrest',
    title: 'Labor Unrest',
    type: 'problem',
    description: 'Workers resist conscription and building duties.',
    choices: [
      { id: 'concede-wages', label: 'Concede Wages', description: 'Human growth falls for 4 ticks.', effects: { resourceRateModifier: { humans: -3 }, durationTicks: 4 } },
      { id: 'pay-bonuses', label: 'Pay Bonuses', description: 'Spend gold to gain humans immediately.', effects: { resourceDelta: { gold: -30, humans: 90 } } },
    ],
  },
  {
    id: 'market-slowdown',
    title: 'Market Slowdown',
    type: 'problem',
    description: 'Merchants hold goods until the court chooses a policy.',
    choices: [
      { id: 'lower-fees', label: 'Lower Fees', description: 'Market gold output falls briefly, then trade recovers.', effects: { marketGoldOutputModifier: -0.2, durationTicks: 4 } },
      { id: 'forced-sales', label: 'Forced Sales', description: 'Gain food and supplies now.', effects: { resourceDelta: { food: 35, supplies: 30 } } },
    ],
  },
  {
    id: 'good-harvest',
    title: 'Good Harvest',
    type: 'opportunity',
    seasons: ['Autumn'],
    description: 'Granaries fill faster than expected, but the court must choose where the surplus goes.',
    choices: [
      { id: 'store-harvest', label: 'Store Harvest', description: 'Food income rises briefly.', effects: { resourceRateModifier: { food: 6 }, durationTicks: 4 } },
      { id: 'sell-surplus', label: 'Sell Surplus', description: 'Spend food for immediate gold.', effects: { resourceDelta: { food: -35, gold: 45 } } },
    ],
  },
  {
    id: 'flooded-fields',
    title: 'Flooded Fields',
    type: 'crisis',
    seasons: ['Summer', 'Autumn'],
    description: 'Heavy water ruins low fields and forces emergency work on canals.',
    choices: [
      { id: 'accept-flood-losses', label: 'Accept Losses', description: 'Food income falls for several ticks.', effects: { resourceRateModifier: { food: -4 }, durationTicks: 4 } },
      { id: 'repair-dikes', label: 'Repair Dikes', description: 'Spend supplies and gold to soften the damage.', effects: { resourceDelta: { supplies: -18, gold: -20 }, resourceRateModifier: { food: -1 }, durationTicks: 2 } },
    ],
  },
  {
    id: 'harsh-winter',
    title: 'Harsh Winter',
    type: 'crisis',
    seasons: ['Winter'],
    description: 'Cold weather strains stores, roads, and household food reserves.',
    choices: [
      { id: 'ration-through-winter', label: 'Ration Stores', description: 'Food and human growth fall briefly.', effects: { resourceRateModifier: { food: -4, humans: -2 }, durationTicks: 4 } },
      { id: 'winter-relief', label: 'Winter Relief', description: 'Spend food and gold to protect stability.', effects: { resourceDelta: { food: -45, gold: -25 }, stabilityDelta: 5, favorDelta: 4 } },
    ],
  },
  {
    id: 'granary-spoilage',
    title: 'Granary Spoilage',
    type: 'problem',
    seasons: ['Spring', 'Summer'],
    description: 'Damp stores and pests threaten the reserve before the next harvest.',
    choices: [
      { id: 'dump-spoiled-grain', label: 'Dump Grain', description: 'Food income falls while stores are cleaned.', effects: { resourceRateModifier: { food: -3 }, durationTicks: 4 } },
      { id: 'fumigate-stores', label: 'Fumigate Stores', description: 'Spend gold and supplies to save part of the reserve.', effects: { resourceDelta: { gold: -22, supplies: -10, food: -15 } } },
    ],
  },
  {
    id: 'tax-shortfall',
    title: 'Tax Shortfall',
    type: 'problem',
    seasons: ['Winter'],
    description: 'Trade slows and collectors report less coin than planned.',
    choices: [
      { id: 'delay-projects', label: 'Delay Projects', description: 'Gold income falls for several ticks.', effects: { resourceRateModifier: { gold: -4 }, durationTicks: 4 } },
      { id: 'audit-collectors', label: 'Audit Collectors', description: 'Spend supplies to recover some gold.', effects: { resourceDelta: { supplies: -18, gold: 24 }, courtCardSpeedModifier: 0.15, durationTicks: 3 } },
    ],
  },
  {
    id: 'market-corruption',
    title: 'Market Corruption',
    type: 'problem',
    description: 'Merchants and clerks hide revenue inside the market network.',
    choices: [
      { id: 'tolerate-leakage', label: 'Tolerate Leakage', description: 'Market gold output falls briefly.', effects: { marketGoldOutputModifier: -0.22, durationTicks: 4 } },
      { id: 'clean-ledgers', label: 'Clean Ledgers', description: 'Spend gold for stability and influence.', effects: { resourceDelta: { gold: -28 }, stabilityDelta: 4, influenceDelta: 3 } },
    ],
  },
  {
    id: 'mine-accident',
    title: 'Mine Accident',
    type: 'crisis',
    description: 'A shaft collapse threatens production and public order.',
    choices: [
      { id: 'close-shafts', label: 'Close Shafts', description: 'Supplies income falls while the mine is secured.', effects: { resourceRateModifier: { supplies: -4 }, durationTicks: 4 } },
      { id: 'rescue-crews', label: 'Rescue Crews', description: 'Spend food and gold to protect workers.', effects: { resourceDelta: { food: -20, gold: -18 }, stabilityDelta: 3, favorDelta: 3 } },
    ],
  },
  {
    id: 'army-wage-arrears',
    title: 'Army Wage Arrears',
    type: 'crisis',
    description: 'Captains warn that delayed pay will spread through the camps.',
    choices: [
      { id: 'promise-backpay', label: 'Promise Backpay', description: 'Army gold upkeep rises briefly.', effects: { armyGoldUpkeepModifier: 0.25, durationTicks: 3 } },
      { id: 'pay-arrears', label: 'Pay Arrears', description: 'Spend gold to restore army readiness.', effects: { resourceDelta: { gold: -35 }, restoreArmyReadiness: true } },
    ],
  },
  {
    id: 'public-festival',
    title: 'Public Festival',
    type: 'opportunity',
    seasons: ['Spring', 'Autumn'],
    description: 'Communal Halls can host a public feast if the stores can support it.',
    choices: [
      { id: 'hold-festival', label: 'Hold Festival', description: 'Spend food for stability, favor, and growth.', effects: { resourceDelta: { food: -35 }, stabilityDelta: 5, favorDelta: 5, resourceRateModifier: { humans: 2 }, durationTicks: 3 } },
      { id: 'modest-gathering', label: 'Modest Gathering', description: 'Gain a small favor boost without spending stores.', effects: { favorDelta: 2 } },
    ],
  },
  {
    id: 'farm-petition',
    title: 'Farm Petition',
    type: 'opportunity',
    description: 'Village elders request help opening new fields.',
    choices: [
      { id: 'grant-farm', label: 'Grant Farm', description: 'Add a free Farm to a suitable district.', effects: { freeBuilding: 'farm' } },
      { id: 'improve-farm', label: 'Improve Farm', description: 'Upgrade an existing Farm for free.', effects: { freeUpgrade: 'farm' } },
    ],
  },
  {
    id: 'mine-charter',
    title: 'Mine Charter',
    type: 'opportunity',
    description: 'Prospectors find useful ore in the hills.',
    choices: [
      { id: 'grant-mine', label: 'Grant Mine', description: 'Add a free Mine to a suitable district.', effects: { freeBuilding: 'mine' } },
      { id: 'deepen-mine', label: 'Deepen Mine', description: 'Upgrade an existing Mine for free.', effects: { freeUpgrade: 'mine' } },
    ],
  },
  {
    id: 'merchant-quarter',
    title: 'Merchant Quarter',
    type: 'opportunity',
    description: 'Guilds offer to organize a new commercial quarter.',
    choices: [
      { id: 'grant-market', label: 'Grant Market', description: 'Add a free Market to a suitable district.', effects: { freeBuilding: 'market' } },
      { id: 'expand-market', label: 'Expand Market', description: 'Upgrade an existing Market for free.', effects: { freeUpgrade: 'market' } },
    ],
  },
  {
    id: 'drill-ground',
    title: 'Drill Ground',
    type: 'law',
    description: 'Veterans ask for a formal training ground.',
    choices: [
      { id: 'grant-barracks', label: 'Grant Barracks', description: 'Add a free Barracks to a suitable district.', effects: { freeBuilding: 'barracks' } },
      { id: 'expand-barracks', label: 'Expand Barracks', description: 'Upgrade an existing Barracks for free.', effects: { freeUpgrade: 'barracks' } },
    ],
  },
  {
    id: 'communal-hall-patronage',
    title: 'Communal Hall Patronage',
    type: 'law',
    description: 'Village elders ask for a public hall where disputes, festivals, and court orders can be managed.',
    choices: [
      { id: 'grant-communal-hall', label: 'Grant Hall', description: 'Add a free Communal Hall to a suitable district.', effects: { freeBuilding: 'communalHall' } },
      { id: 'expand-communal-hall', label: 'Expand Hall', description: 'Upgrade an existing Communal Hall for free.', effects: { freeUpgrade: 'communalHall' } },
    ],
  },
  {
    id: 'frontier-defenses',
    title: 'Frontier Defenses',
    type: 'crisis',
    description: 'Scouts warn that a border district needs stronger defenses.',
    choices: [
      { id: 'raise-wall', label: 'Raise Wall', description: 'Add a free Wall to a suitable district.', effects: { freeBuilding: 'wall' } },
      { id: 'raise-tower', label: 'Raise Tower', description: 'Add a free Tower to a suitable district.', effects: { freeBuilding: 'tower' } },
    ],
  },
  {
    id: 'border-repair',
    title: 'Border Repair',
    type: 'problem',
    description: 'A frontier post needs fast work before the next raid.',
    choices: [
      { id: 'reinforce-post', label: 'Reinforce Post', description: 'Add defense to a player district.', effects: { defenseBoost: 8 } },
      { id: 'stock-garrison', label: 'Stock Garrison', description: 'Gain supplies for border troops.', effects: { resourceDelta: { supplies: 55 } } },
    ],
  },
  {
    id: 'visiting-hero',
    title: 'Visiting Hero',
    type: 'opportunity',
    description: 'Travelers bring word of capable people seeking a patron.',
    choices: [
      { id: 'open-court', label: 'Open Court', description: 'Immediately draft from any hero offer.', effects: { freeHeroDraft: true } },
      { id: 'seek-general', label: 'Seek General', description: 'Immediately draft from a general-heavy offer.', effects: { freeHeroDraft: 'general' } },
    ],
  },
  {
    id: 'civil-service',
    title: 'Civil Service',
    type: 'opportunity',
    description: 'The court can sponsor candidates for provincial duties.',
    choices: [
      { id: 'seek-governor', label: 'Seek Governor', description: 'Immediately draft from a governor-heavy offer.', effects: { freeHeroDraft: 'governor' } },
      { id: 'seek-minister', label: 'Seek Minister', description: 'Immediately draft from a minister-heavy offer.', effects: { freeHeroDraft: 'minister' } },
    ],
  },
  {
    id: 'spy-candidate',
    title: 'Spy Candidate',
    type: 'opportunity',
    description: 'A discreet agent offers useful intelligence.',
    choices: [
      { id: 'seek-agent', label: 'Seek Agent', description: 'Immediately draft from an agent-heavy offer.', effects: { freeHeroDraft: 'agent' } },
      { id: 'sell-intel', label: 'Sell Intel', description: 'Turn secrets into gold now.', effects: { resourceDelta: { gold: 55 } } },
    ],
  },
  {
    id: 'recruitment-drive',
    title: 'Recruitment Drive',
    type: 'law',
    description: 'Recruiters ask permission to gather soldiers faster.',
    choices: [
      { id: 'short-drive', label: 'Short Drive', description: 'Recruitment is faster for 4 ticks.', effects: { recruitSpeedModifier: 0.45, durationTicks: 4 } },
      { id: 'long-drive', label: 'Long Drive', description: 'Recruitment is faster for 8 ticks.', effects: { recruitSpeedModifier: 0.28, durationTicks: 8 } },
    ],
  },
  {
    id: 'unit-specialists',
    title: 'Unit Specialists',
    type: 'law',
    description: 'Captains can shape the next army before it musters.',
    choices: [
      { id: 'archer-cadres', label: 'Archer Cadres', description: 'The next recruited army has more archers.', effects: { nextArmyArchersBonus: 0.12, permanent: true } },
      { id: 'heavy-cadres', label: 'Heavy Cadres', description: 'The next recruited army has more heavy infantry.', effects: { nextArmyHeavyBonus: 0.08, permanent: true } },
    ],
  },
  {
    id: 'court-calendar',
    title: 'Court Calendar',
    type: 'law',
    description: 'Secretaries propose a busier rhythm for royal decisions.',
    choices: [
      { id: 'urgent-session', label: 'Urgent Session', description: 'The next court card comes sooner.', effects: { nextCourtCardSoon: true } },
      { id: 'six-day-docket', label: 'Six Day Docket', description: 'Court cards come faster for 6 ticks.', effects: { courtCardSpeedModifier: 0.45, durationTicks: 6 } },
    ],
  },
  {
    id: 'court-procedure',
    title: 'Court Procedure',
    type: 'law',
    description: 'The court can become a lasting engine of decisions.',
    choices: [
      { id: 'standing-council', label: 'Standing Council', description: 'Court cards come faster permanently.', effects: { courtCardSpeedModifier: 0.15, permanent: true } },
      { id: 'second-docket', label: 'Second Docket', description: 'Another court card follows immediately.', effects: { extraCourtDraw: true } },
    ],
  },
  {
    id: 'building-guilds',
    title: 'Building Guilds',
    type: 'opportunity',
    description: 'Artisans offer ways to speed construction.',
    choices: [
      { id: 'fast-builders', label: 'Fast Builders', description: 'New buildings finish faster for 4 ticks.', effects: { buildSpeedBonus: 1, durationTicks: 4 } },
      { id: 'fast-upgraders', label: 'Fast Upgraders', description: 'Upgrades finish faster for 4 ticks.', effects: { upgradeSpeedBonus: 1, durationTicks: 4 } },
    ],
  },
  {
    id: 'royal-inspectors',
    title: 'Royal Inspectors',
    type: 'opportunity',
    description: 'Inspectors can finish current works with direct pressure.',
    choices: [
      { id: 'finish-building', label: 'Finish Building', description: 'Complete one active build order.', effects: { completeBuildOrder: true } },
      { id: 'finish-upgrade', label: 'Finish Upgrade', description: 'Complete one active upgrade order.', effects: { completeUpgradeOrder: true } },
    ],
  },
  {
    id: 'military-lessons',
    title: 'Military Lessons',
    type: 'opportunity',
    description: 'Veterans summarize hard-won field lessons.',
    choices: [
      { id: 'field-school', label: 'Field School', description: 'Armies gain more XP for 6 ticks.', effects: { armyXpModifier: 0.5, durationTicks: 6 } },
      { id: 'seasoned-recruits', label: 'Seasoned Recruits', description: 'The next recruited army starts one level higher.', effects: { nextArmyLevelBonus: 1, permanent: true } },
    ],
  },
  {
    id: 'elite-command',
    title: 'Elite Command',
    type: 'law',
    description: 'Commanders ask the court to invest in professional leadership.',
    choices: [
      { id: 'higher-caps', label: 'Higher Caps', description: 'Army level cap rises for 8 ticks.', effects: { armyLevelCapBonus: 1, durationTicks: 8 } },
      { id: 'restore-readiness', label: 'Restore Readiness', description: 'Restore morale and supply for player armies.', effects: { restoreArmyReadiness: true } },
    ],
  },
  {
    id: 'battle-logistics',
    title: 'Battle Logistics',
    type: 'law',
    description: 'Quartermasters propose lighter campaign support.',
    choices: [
      { id: 'frugal-battles', label: 'Frugal Battles', description: 'Battle supply cost falls for 8 ticks.', effects: { battleSupplyCostModifier: -0.35, durationTicks: 8 } },
      { id: 'discount-contracts', label: 'Discount Contracts', description: 'Next buildings are cheaper for 6 ticks.', effects: { buildingCostModifier: -0.2, durationTicks: 6 } },
    ],
  },
];
