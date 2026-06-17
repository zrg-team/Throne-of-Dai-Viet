import type {
  Hero,
  HeroType,
  LandBuildingType,
  LandType,
  PoliticsCard,
  PoliticsChoice,
  ResourceKey,
  Season,
} from '../state/types';

export type LanguageCode = 'en' | 'vi';

export const LANGUAGE_STORAGE_KEY = 'mandate:language:v1';

type TranslationParams = Record<string, string | number>;

const en = {
  'language.en': 'EN',
  'language.vi': 'VN',
  'menu.startCampaign': 'Start Campaign',
  'menu.continue': 'Continue',
  'menu.startNewQuestion': 'Start a new campaign?',
  'menu.savedSnapshotKept': 'The saved snapshot remains until you save again.',
  'menu.startNewCampaign': 'Start New Campaign',
  'menu.back': 'Back',
  'save.noSavedCampaign': 'No saved campaign',
  'save.savedCampaign': 'Saved campaign',
  'save.savedDate': 'Saved {date}',
  'resource.food': 'food',
  'resource.supplies': 'supplies',
  'resource.gold': 'gold',
  'resource.humans': 'humans',
  'resource.workers': 'workers',
  'season.Spring': 'Spring',
  'season.Summer': 'Summer',
  'season.Autumn': 'Autumn',
  'season.Winter': 'Winter',
  'time.yearSeason': 'Year {year} - {season}',
  'time.yearSeasonComma': 'Year {year}, {season}',
  'building.farm': 'Farm',
  'building.mine': 'Mine',
  'building.market': 'Market',
  'building.wall': 'Wall',
  'building.tower': 'Tower',
  'building.barracks': 'Barracks',
  'building.shrine': 'Shrine',
  'building.buildLabel': 'Build {building}',
  'building.none': 'none',
  'building.noneYet': 'none yet',
  'building.level': 'Level {level}',
  'building.max': 'Max',
  'landType.castle': 'castle',
  'landType.farm': 'farm',
  'landType.market': 'market',
  'landType.iron': 'iron',
  'landType.temple': 'temple',
  'landType.enemyCastle': 'enemy castle',
  'landType.wilderness': 'wilderness',
  'heroType.general': 'general',
  'heroType.governor': 'governor',
  'heroType.minister': 'minister',
  'heroType.agent': 'agent',
  'rarity.Common': 'Common',
  'rarity.Rare': 'Rare',
  'rarity.Epic': 'Epic',
  'rarity.Legendary': 'Legendary',
  'owner.yours': 'Yours',
  'owner.neutral': 'Neutral',
  'owner.rival': 'Rival',
  'owner.yourDistrict': 'Your district',
  'owner.neutralTerritory': 'Neutral territory',
  'owner.rivalTerritory': 'Rival territory',
  'action.build': 'Build',
  'action.heroes': 'Heroes',
  'action.court': 'Court',
  'action.army': 'Army',
  'action.map': 'Map',
  'action.menu': 'Menu',
  'action.details': 'Details ›',
  'action.pass': 'Pass',
  'action.recruit': 'Recruit',
  'action.positions': 'Positions',
  'action.governors': 'Governors',
  'action.remove': 'Remove',
  'action.assign': 'Assign',
  'action.locked': 'Locked',
  'action.change': 'Change',
  'action.select': 'Select',
  'action.cancel': 'Cancel',
  'action.createArmy': 'Create Army',
  'action.upgrade': 'Upgrade',
  'action.why': 'Why?',
  'action.destroy': 'Destroy',
  'action.disband': 'Disband',
  'action.retreat': 'Retreat',
  'action.choose': 'Choose',
  'action.saveSnapshot': 'Save Snapshot',
  'action.exitToMenu': 'Exit to Menu',
  'action.saveAndExit': 'Save and Exit',
  'action.exitWithoutSaving': 'Exit Without Saving',
  'action.attack': 'Attack',
  'action.conquer': 'Conquer',
  'action.settle': 'Settle',
  'action.marchIn': 'March In',
  'action.intimidate': 'Intimidate',
  'action.bribe': 'Bribe ({chance}%)',
  'action.assignHero': 'Assign Hero ({trust}/{threshold})',
  'action.needHero': 'Need Hero',
  'action.battle': 'Battle',
  'status.available': 'Available: {value}',
  'status.vacant': 'Vacant',
  'status.idle': 'idle',
  'status.lockedShrine': 'Locked - needs a Shrine',
  'status.assigned': 'Assigned: {assignment}',
  'status.governor': 'Governor: {name}',
  'status.noGovernor': 'No governor',
  'status.nextArrival': 'Next arrival: Favor {favor}/{threshold}',
  'status.currentRoster': 'Current Roster',
  'status.noHeroesWaiting': 'No heroes are waiting at court.',
  'status.noDistricts': 'No districts under your rule yet.',
  'status.chooseHero': 'Choose a hero',
  'status.allCommandersBusy': 'All commanders are leading armies.',
  'status.administration': 'Administration {value}',
  'status.capacity': 'Capacity: {used}/{max}',
  'status.terrain': 'Terrain',
  'status.labor': 'Labor',
  'status.laborValue': '{workers} workers, {efficiency}% efficiency',
  'status.maximumLevel': 'Maximum level reached.',
  'status.upgradeCost': 'Upgrade cost: {cost}',
  'status.cost': 'Cost: {cost}',
  'status.unavailable': 'Unavailable',
  'status.improvesDistrict': 'Improves this district over several economy ticks.',
  'status.noRefund': 'No refund. Lowers upkeep.',
  'status.moraleSupply': 'Morale {morale}   Supply {supply}',
  'status.disbandInfo': 'Disband: humans return, XP lost.',
  'status.soldiers': 'Soldiers',
  'status.foodToSend': 'Food to send',
  'status.suppliesToSend': 'Supplies to send',
  'status.availableHumans': 'Available humans: {value}',
  'status.availableFood': 'Available food: {value}',
  'status.availableSupplies': 'Available supplies: {value}',
  'status.currentCampaign': 'Current Campaign',
  'status.districtsUnderRule': '{count} districts under your rule.',
  'status.unsavedProgress': 'Unsaved progress may be lost',
  'status.exitMenuBody': 'Save a snapshot before returning to the main menu, or leave without changing the saved slot.',
  'modal.heroes.title': 'Heroes',
  'modal.heroes.subtitle': 'Recruit heroes for court, command, and provinces.',
  'modal.court.title': 'Court',
  'modal.court.subtitle': 'Assign heroes to offices or provinces.',
  'modal.diplomacy.title': 'Diplomatic Claim',
  'modal.diplomacy.subtitle': 'Assign a free hero to lead this mission.',
  'modal.army.title': 'Army',
  'modal.army.subtitle': 'Choose a leader and raise a field army.',
  'modal.build.title': 'Build',
  'modal.build.noSelection': 'Select a district first.',
  'modal.build.selectOwned': 'Select one of your districts before building.',
  'modal.request.title': 'Court Request',
  'modal.request.subtitle': 'Choose a response.',
  'modal.gameMenu.title': 'Game Menu',
  'modal.gameMenu.subtitle': 'Campaign controls.',
  'modal.exitMenu.title': 'Exit to Menu',
  'modal.exitMenu.subtitle': 'Choose how to leave this campaign.',
  'modal.victory.title': 'Victory',
  'modal.victory.body': 'All rival castles have fallen. The mandate belongs to Đại Việt.',
  'modal.victory.status': 'Mandate',
  'battle.preview.title': 'Battle Preview',
  'battle.preview.subtitle': '{army} attacks {land}',
  'battle.preview.army': 'Army',
  'battle.preview.target': 'target',
  'battle.yourPower': 'Your power',
  'battle.enemyPower': 'Enemy power',
  'battle.estimate': 'Estimate',
  'battle.advantage': 'Advantage',
  'battle.highRisk': 'High risk',
  'battle.victory': 'Victory!',
  'battle.defeat': 'Defeat',
  'battle.yourArmy': 'Your army',
  'battle.theDistrict': 'the district',
  'battle.victoryBody': '{army} broke the defenses of {land}.\n\nYour power: {attackerPower}\nEnemy power: {defenderPower}\n\nThe army now besieges the district. It will fall in {ticks} economy {tickLabel}.',
  'battle.defeatBody': '{army} was repelled at {land}.\n\nYour power: {attackerPower}\nEnemy power: {defenderPower}\n\nThe army falls back to recover.',
  'battle.prevailed': '{army} prevailed',
  'battle.repelled': '{army} was repelled',
  'tick.one': 'tick',
  'tick.many': 'ticks',
  'terrain.summary': 'grass {grass}, ore {ore}, water {water}, city {city}',
  'terrain.grass': 'grass',
  'terrain.ore': 'ore',
  'terrain.water': 'water',
  'terrain.city': 'city',
  'land.ownerType': 'Owner: {owner}   Type: {type}',
  'land.defenseSize': 'Defense: {defense}   Size: {used}/{max}',
  'land.terrain': 'Terrain: {terrain}',
  'land.output': 'Output: {outputs}',
  'land.buildings': 'Buildings: {buildings}',
  'land.populationSoldiers': 'Population: {population}   Soldiers: {soldiers}',
  'land.nobleTrust': 'Noble Power: {power}   Trust: {trust}/{threshold}',
  'land.wilderness': 'Wilderness - uninhabited, no garrison.',
  'land.underSiege': 'Under siege: {progress}/{required} ticks',
  'land.buildingStatus': '{kind} {building}: {progress}/{required}',
  'land.recruiting': 'Recruiting: {progress}/{required}',
  'land.siegeShort': 'Siege: {progress}/{required}',
  'land.bribeJoiningSoon': 'Bribe accepted - joining soon',
  'land.diplomatBuilding': 'Diplomat: trust building...',
  'land.pressure': 'Pressure: {progress}/100',
  'land.settlers': 'Settlers: {progress}/{required}',
  'land.movingIn': 'Moving in...',
  'land.acquiring': 'Acquiring: {progress}/{required}',
  'land.defPopPower': 'Def {defense} · Pop {population} · Power {power}',
  'land.defWilderness': 'Def {defense} · Wilderness · No garrison',
  'land.defSize': 'Def {defense} · Size {used}/{max}',
  'land.trustSoldiers': 'Trust {trust}/100 · Soldiers {soldiers}',
  'land.bribeNextSeason': 'Bribe: joining next season',
  'land.heroTrust': '{hero}: trust {trust}/{required}',
  'land.missingHeroTrust': 'Missing hero: trust {trust}/{required}',
  'land.armyPressure': 'Army pressure: {progress}/100',
  'land.settlersEnRoute': 'Settlers en route: {progress}/{required}',
  'order.building': 'Building',
  'order.upgrading': 'Upgrading',
  'court.officesFilled': '{filled}/{total} court offices filled',
  'court.moreAssigned': 'More assigned court members create more mandatory court cards.',
  'court.noRecruitedHeroes': 'No recruited heroes yet. Open Heroes first.',
  'court.diplomacyNeedsHero': 'Diplomatic claim requires a free hero. Recruit one or free an assigned hero first.',
  'politics.type.problem': 'problem',
  'politics.type.law': 'law',
  'politics.type.opportunity': 'opportunity',
  'politics.type.crisis': 'crisis',
  'courtPosition.marshal': 'Marshal',
  'courtPosition.quartermaster': 'Quartermaster',
  'courtPosition.treasurer': 'Treasurer',
  'courtPosition.steward': 'Steward',
  'courtPosition.chancellor': 'Chancellor',
  'courtPosition.spymaster': 'Spymaster',
  'courtPosition.censor': 'Censor',
  'courtPosition.masterOfHorse': 'Master of Horse',
  'msg.visitingHeroesLeave': 'The visiting heroes leave court.',
  'msg.chooseCommander': 'Choose a commander before creating an army.',
  'msg.selectDistrictBuild': 'Select one of your districts, then press Build.',
  'msg.mapMode': 'Map mode: drag the region, then tap a land or army order.',
  'msg.courtRequiresAnswer': 'The court requires an answer.',
  'msg.cannotUpgrade': 'That building cannot be upgraded right now.',
  'msg.structureUnavailable': 'That structure is not available here.',
  'msg.snapshotSaved': 'Campaign snapshot saved.',
  'msg.saveUnavailable': 'Save is unavailable in this browser.',
  'msg.armySelected': 'Army selected.',
  'msg.armySelectedNamed': '{army} selected. Tap a visible land to move.',
  'msg.selectAdjacentArmy': 'Select an army stationed in an adjacent district first.',
  'msg.selectArmyBeforeAttack': 'Select an army adjacent to this land before attacking.',
  'msg.initial': 'Expansion race begins. Buy nearby neutral land, build districts, then capture the rival capital.',
  'special.wilderness': 'Uninhabited wilderness. No village, no garrison.',
  'special.randomDistrict': 'Random {type} district with generated terrain and resources.',
  'special.playerCapital': 'Your randomized starting capital.',
  'special.rivalCapital': 'Randomized rival capital. Capture it to win the campaign.',
  'msg.economyTick': 'Economy tick: Year {year}, {season}. Expand, build, and prepare for the rival capital.',
  'msg.newHeroes': 'New heroes arrive at court. Choose one.',
  'msg.heroJoins': '{hero} joins the court.',
  'msg.foodEmpty': 'Food stores are empty. Humans decline and armies lose readiness.',
  'msg.suppliesEmpty': 'Supply stores are empty. Army logistics suffer.',
  'msg.victory': 'Victory! All rival castles have fallen to Đại Việt.',
  'msg.noRoute': 'No route to that land through your territory.',
  'msg.marches': '{army} marches toward {land} ({ticks} {tickLabel}).',
  'msg.arrives': '{army} arrives at {land}.',
  'msg.notEnoughHumansArmy': 'Not enough humans to raise that army.',
  'msg.needFoodArmy': 'Need {amount} food to send with that army.',
  'msg.needSuppliesArmy': 'Need {amount} supplies to equip and provision that army.',
  'msg.noOwnedCityArmy': 'No owned city can raise an army.',
  'msg.alreadyTraining': '{land} is already training a new army.',
  'msg.recruitingArmy': 'Recruiting {total} soldiers at {land}. Ready in {ticks} {tickLabel}.',
  'msg.finishedTraining': '{army} finished training at {land}.',
  'msg.starvedDisbanded': '{army} has starved and disbanded.',
  'msg.alreadyUnderSiege': '{land} is already under siege.',
  'msg.victoryAt': 'Victory at {land}. The army besieges the district ({ticks} {tickLabel} to fall).',
  'msg.defeatAt': 'Defeat at {land}. The army falls back.',
  'msg.disbands': '{army} disbands. {humans} humans return home; its XP is lost.',
  'msg.withdraws': '{army} withdraws from the siege of {land}.',
  'msg.landFalls': '{land} falls! The district is captured.',
  'msg.acquisitionProgress': '{land} already has an acquisition in progress.',
  'msg.neutralAdjacentOnly': 'You can only act on neutral land adjacent to your districts.',
  'msg.needGoldBribe': 'Need {cost} gold to attempt this bribe.',
  'msg.bribeRefused': 'The nobles of {land} took your gold and refused. Trust lost. Diplomacy will be harder here.',
  'msg.bribeAccepted': 'Bribe accepted! {land} will join Đại Việt next season.',
  'msg.assignHeroDiplomacy': 'Assign a free hero before starting a diplomatic claim.',
  'msg.heroUnavailableDiplomacy': 'That hero is not available to lead the diplomatic mission.',
  'msg.heroAlreadyAssigned': '{hero} is already assigned. Choose a free hero for diplomacy.',
  'msg.needSuppliesDiplomacy': 'Need {cost} supplies for diplomatic gifts and hospitality.',
  'msg.heroTravels': '{hero} travels to {land} to build trust. Need {threshold}, currently {current}.',
  'msg.armyAdjacentThreat': 'Your army must be stationed in an adjacent owned district to threaten {land}.',
  'msg.armyTooWeak': 'Your army (power {power}) is not strong enough to threaten {land} (garrison: {garrison}).',
  'msg.armyPressures': 'Your army pressures {land}. Keep them stationed nearby until the garrison breaks.',
  'msg.settleAdjacentOnly': 'You can only settle land adjacent to your districts.',
  'msg.needHumansSettlers': 'Need {cost} humans to send settlers into the wilderness.',
  'msg.settlersDepart': 'Settlers depart for {land}. They will establish a new community in {seasons} seasons.',
  'msg.armyEntersWilderness': '{army} enters {land} - uninhabited wilderness claimed.',
  'msg.diplomacyCancelledNoHero': 'Diplomatic claim at {land} cancelled - no assigned hero is leading it.',
  'msg.intimidationCancelledMoved': 'Intimidation of {land} cancelled - your army moved away.',
  'msg.landJoinsKingdom': '{land} joins {kingdom}.',
  'msg.acquiredBribe': 'The nobles of {land} accept your terms and surrender authority.{popMsg}{bonusMsg}',
  'msg.acquiredDiplomacy': 'The people of {land} choose to join Đại Việt.{popMsg}{bonusMsg}',
  'msg.acquiredIntimidation': '{land} surrenders under military pressure.{popMsg}{bonusMsg}',
  'msg.acquiredSettle': 'Settlers establish a new community at {land}.',
  'msg.acquiredOccupy': '{land} occupied - no resistance.',
  'msg.acquiredConquest': '{land} joins a rival kingdom.',
  'msg.populationBonus': ' +{population} humans.',
  'msg.resourceBonus': ' {bonus}.',
  'msg.botClaims': '{kingdom} begins claiming {land}.',
  'msg.botDevelops': '{kingdom} develops {land}.',
  'msg.botPressures': '{kingdom} pressures {land}.',
  'msg.courtAttention': 'Court requests attention: {title}',
  'msg.politicsChoice': '{label}: {description}',
  'msg.noFreeBuildingRoom': 'No district has room for a free {building}.',
  'msg.seatNotBuilt': 'The {seat} seat is not yet built.',
  'msg.heroTakesSeat': '{hero} takes the seat of {seat}.',
  'msg.heroGoverns': '{hero} governs {land}.',
  'msg.cannotBuildHere': 'That building cannot be built here.',
  'msg.startedConstruction': '{building} construction started in {land}. Ready in {ticks} economy ticks.',
  'msg.startedUpgrade': '{building} upgrade to level {level} started in {land}. Ready in {ticks} economy ticks.',
  'msg.finishBeforeDestroy': 'Finish current construction before destroying a building.',
  'msg.destroyedBuilding': '{building} destroyed in {land}. Maintenance cost reduced.',
  'msg.upgradedBuilding': '{building} upgraded to level {level} in {land}.',
  'msg.completedBuilding': '{building} completed in {land}.',
  'reason.noCapacity': 'No free district capacity.',
  'reason.marketLimit': 'Market limit reached for this district.',
  'reason.alreadyBuilt': '{building} already built here.',
  'reason.alreadyOrder': 'Already {kind} {building} ({progress}/{required}).',
  'reason.maxLevel': 'Already at maximum level.',
  'reason.needCost': 'Need {parts}.',
  'reason.needGrass': 'Needs more grass, field, or rice tiles.',
  'reason.needOre': 'Needs mountain or hill tiles.',
  'reason.needCity': 'Needs a city core or at least 3 road connections.',
  'desc.farm': 'Produces food from grass and field tiles.{waterBonus}',
  'desc.farmWater': ' Water boosts food.',
  'desc.mine': 'Produces supplies from mountain and hill tiles.',
  'desc.wall': "Raises this district's defense by 6.",
  'desc.tower': "Raises this district's defense by 10.",
  'desc.market': 'Produces gold and supplies from roads and city access.',
  'content.genericFallback': '{text}',
  'common.capital': 'Capital',
  // Heroes
  'heroes.king.description': 'The reigning king, leading the kingdom\'s armies from the front.',
  'heroes.king.trait_morale.effect': '+10% morale for all your armies.',
  'heroes.king.trait_power.effect': '+8% army power in battle.',
  'heroes.king.trait_rations.effect': '+5% max rations capacity for armies.',

  'heroes.vo-tuong-nui.description': 'A mountain general who attacks well in rough lands.',
  'heroes.vo-tuong-nui.effect': '+20% attack when fighting iron or mountain lands.',

  'heroes.tran-cung-thu.description': 'A practical commander who trusts archers.',
  'heroes.tran-cung-thu.effect': '+10% army power when archers are present.',

  'heroes.le-thiet-giap.description': 'A disciplined heavy infantry captain.',
  'heroes.le-thiet-giap.effect': '+18% assault power with heavy infantry.',

  'heroes.quan-doc-luong.description': 'A governor who protects rice stores.',
  'heroes.quan-doc-luong.effect': '+30% food from assigned farm.',

  'heroes.ba-quan-kho.description': 'A careful storehouse administrator.',
  'heroes.ba-quan-kho.effect': '+8 loyalty and +8 defense in assigned land.',

  'heroes.ong-do-dien.description': 'A reformer of irrigation and village labor.',
  'heroes.ong-do-dien.effect': 'Farm upgrades cost 20% less.',

  'heroes.quan-thue-hoi-an.description': 'A treasurer trained by port merchants.',
  'heroes.quan-thue-hoi-an.effect': '+15% gold from markets.',

  'heroes.su-gia.description': 'A scholar who strengthens legitimacy.',
  'heroes.su-gia.effect': '+5 influence per season.',

  'heroes.thai-su-minh.description': 'A court architect who turns order into power.',
  'heroes.thai-su-minh.effect': '+1 order every fourth season.',

  'heroes.su-gia-mem-mong.description': 'A patient negotiator with village lords.',
  'heroes.su-gia-mem-mong.effect': '+20% peaceful acquisition chance.',

  'heroes.mat-tham-bac.description': 'A quiet spy who finds weak forts.',
  'heroes.mat-tham-bac.effect': '-8 target defense before battle preview.',

  'heroes.hoang-yen.description': 'A famous agent who can turn rivals against each other.',
  'heroes.hoang-yen.effect': '+25 influence from successful political opportunities.',

  'heroes.do-doc-bach-dang.description': 'A river admiral who wins battles by reading tides and marshes.',
  'heroes.do-doc-bach-dang.effect': '+25% army power when fighting on river or marsh lands.',

  'heroes.tran-thuy-quan.description': 'A commander trained to move soldiers through rivers and coastal roads.',
  'heroes.tran-thuy-quan.effect': '+15% army power when fighting near ports, rivers, or coastal lands.',

  'heroes.nu-tuong-rung.description': 'A forest war leader who hides troops beneath thick leaves and fog.',
  'heroes.nu-tuong-rung.effect': '+20% defense and +10% attack when fighting in forest lands.',

  'heroes.ky-binh-bien-ai.description': 'A fast border cavalry captain used to sudden raids.',
  'heroes.ky-binh-bien-ai.effect': '+10% army power when attacking from road, gate, or border lands.',

  'heroes.tuong-voi-tay-son.description': 'A bold commander who breaks enemy lines with war elephants.',
  'heroes.tuong-voi-tay-son.effect': '+22% assault power when your army has elite or special units.',

  'heroes.quan-ha-de.description': 'A river official who repairs dikes before the flood season.',
  'heroes.quan-ha-de.effect': '+25% food from floodplain or river farms.',

  'heroes.ba-lang-nuoc.description': 'A respected village elder who keeps canals, wells, and granaries in order.',
  'heroes.ba-lang-nuoc.effect': '+10 loyalty and +10 defense in assigned river or farm land.',

  'heroes.ly-truong-lam-son.description': 'A local chief who knows how to organize forest villages.',
  'heroes.ly-truong-lam-son.effect': '+15 production from forest or hill lands.',

  'heroes.thuong-nhan-van-don.description': 'A wealthy trader who connects ports, markets, and inland roads.',
  'heroes.thuong-nhan-van-don.effect': '+20% gold from ports and trade roads.',

  'heroes.thien-su-truc-lam.description': 'A calm monk whose words soften anger across the kingdom.',
  'heroes.thien-su-truc-lam.effect': '-15% unrest from crisis cards.',

  'heroes.thai-uy-bien-cuong.description': 'A stern military minister who strengthens frontier discipline.',
  'heroes.thai-uy-bien-cuong.effect': 'Newly raised armies start with +8 morale.',

  'heroes.ke-mo-duong.description': 'A scout who marks hidden paths through passes and valleys.',
  'heroes.ke-mo-duong.effect': '+15% peaceful acquisition chance for adjacent lands.',

  'heroes.mat-tham-den.description': 'A dangerous spy who opens gates before the army arrives.',
  'heroes.mat-tham-den.effect': '-15 target defense before battle preview.',

  'heroes.cong-chua-hoa-than.description': 'A royal diplomat who turns old rivalries into useful alliances.',
  'heroes.cong-chua-hoa-than.effect': '+30% peaceful acquisition chance and +10 influence from successful diplomacy.',

  // Lands
  'lands.thang-long.name': 'Thăng Long Capital',
  'lands.thang-long.special': 'Player capital. Roads and markets turn expansion into gold and supplies.',

  'lands.cao-bang.name': 'Cao Bằng Rival Capital',
  'lands.cao-bang.special': 'Rival capital. Capture it to win the campaign.',

  'lands.thanh-hoa.name': 'Thanh Hóa Grassland',
  'lands.thanh-hoa.special': 'Open grassland suited to farms and early food growth.',

  'lands.red-river.name': 'Red River Floodplain',
  'lands.red-river.special': 'River-fed grass tiles make excellent farms.',

  'lands.bach-dang.name': 'Bạch Đằng Marsh Farms',
  'lands.bach-dang.special': 'Wet fields can feed a large population if developed.',

  'lands.nghe-an.name': 'Nghệ An Hills',
  'lands.nghe-an.special': 'Hill country unlocks mines and supply production.',

  'lands.lang-son.name': 'Lạng Sơn Mountains',
  'lands.lang-son.special': 'Mountain tiles are costly to fight over but good for supplies.',

  'lands.hoi-an.name': 'Hội An Market Town',
  'lands.hoi-an.special': 'A natural trade hub that benefits from road connections.',

  'lands.truc-lam.name': 'Trúc Lâm Shrine District',
  'lands.truc-lam.special': 'A peaceful district with a small city core and useful road access.',

  'lands.mountain-gate.name': 'Mountain Gate',
  'lands.mountain-gate.special': 'A defensive pass between the two expanding powers.',

  'lands.cloud-pass.name': 'Cloud Pass',
  'lands.cloud-pass.special': 'Hard terrain with strong mine potential.',

  'lands.song-ca.name': 'Sông Cả Valley',
  'lands.song-ca.special': 'Valley farms can stabilize food before major wars.',

  'lands.da-rang.name': 'Đà Rằng Lowlands',
  'lands.da-rang.special': 'Large fertile land with room for multiple farms.',

  'lands.van-don.name': 'Vân Đồn Port Road',
  'lands.van-don.special': 'A road-friendly market district for gold and supplies.',

  'lands.tam-dao.name': 'Tam Đảo Ridge',
  'lands.tam-dao.special': 'Ridge terrain favors mine building and defense.',

  'lands.lam-son.name': 'Lam Sơn Forest Farms',
  'lands.lam-son.special': 'Forested grassland can be cleared into farms.',

  'lands.west-road.name': 'Western Road Station',
  'lands.west-road.special': 'Road access makes this a useful logistics district.',

  'lands.east-road.name': 'Eastern Road Station',
  'lands.east-road.special': 'A trade station that becomes stronger with connected districts.',

  'lands.black-river.name': 'Black River Floodplain',
  'lands.black-river.special': 'Mixed river land with high farm potential.',

  'lands.silver-mine.name': 'Silver Mine Hills',
  'lands.silver-mine.special': 'A supply-rich district for advanced armies.',

  'lands.lotus-lake.name': 'Lotus Lake Village',
  'lands.lotus-lake.special': 'Lake-fed villages are valuable for food surplus.',

  'lands.ceramic-town.name': 'Ceramic Town',
  'lands.ceramic-town.special': 'A small city core that can become a gold hub.',

  'lands.frontier-fort.name': 'Frontier Fort',
  'lands.frontier-fort.special': 'A central road district likely to become contested.',

  'lands.pine-pass.name': 'Pine Pass',
  'lands.pine-pass.special': 'A rough pass that slows armies but feeds supply lines.',

  'lands.southern-rice.name': 'Southern Rice Fields',
  'lands.southern-rice.special': 'A soft but productive food district.',

  'lands.phu-xuan.name': 'Phú Xuân Court Town',
  'lands.phu-xuan.special': 'An old court town with strong market and administration potential.',

  'lands.yen-tu.name': 'Yên Tử Sacred Mountain',
  'lands.yen-tu.special': 'A holy mountain district that strengthens loyalty and influence.',

  'lands.dien-bien.name': 'Điện Biên Valley',
  'lands.dien-bien.special': 'A remote valley that can support armies before frontier campaigns.',

  'lands.cuu-long.name': 'Cửu Long Delta',
  'lands.cuu-long.special': 'A fertile river delta with excellent long-term food output.',

  'lands.sa-pa.name': 'Sa Pa High Pass',
  'lands.sa-pa.special': 'Cold highland terrain with strong defense and mine potential.',

  'lands.quy-nhon.name': 'Quy Nhơn Harbor',
  'lands.quy-nhon.special': 'A coastal market district that rewards trade expansion.',

  'lands.nha-trang.name': 'Nha Trang Bay',
  'lands.nha-trang.special': 'A sheltered bay that can become a rich trade stop.',

  'lands.tay-do.name': 'Tây Đô Market Ward',
  'lands.tay-do.special': 'A southern trade ward suited to markets and road links.',

  'lands.dong-son.name': 'Đông Sơn Craft Village',
  'lands.dong-son.special': 'A craft village with strong gold potential when connected to markets.',

  'lands.con-son.name': 'Côn Sơn Shrine',
  'lands.con-son.special': 'A quiet shrine district that helps stabilize nearby lands.',

  'lands.phong-nha.name': 'Phong Nha Caverns',
  'lands.phong-nha.special': 'Rocky caverns that favor mining and defensive warfare.',

  'lands.go-cong.name': 'Gò Công Rice Coast',
  'lands.go-cong.special': 'A coastal rice district that grows quickly once protected.',

  // Units
  'units.militia.name': 'Militia',
  'units.spearmen.name': 'Spearmen',
  'units.archers.name': 'Archers',
  'units.crossbowmen.name': 'Crossbowmen',
  'units.heavyInfantry.name': 'Heavy Infantry',
  'units.lightCavalry.name': 'Light Cavalry',
  'units.royalGuard.name': 'Royal Guard',
  'units.warElephants.name': 'War Elephants',
  'units.siegeEngine.name': 'Siege Engine',
  'units.riverMarines.name': 'River Marines',
} as const;

type TranslationKey = keyof typeof en;

const vi: Record<TranslationKey, string> = {
  'language.en': 'EN',
  'language.vi': 'VN',
  'menu.startCampaign': 'Bắt đầu chiến dịch',
  'menu.continue': 'Tiếp tục',
  'menu.startNewQuestion': 'Bắt đầu chiến dịch mới?',
  'menu.savedSnapshotKept': 'Bản lưu vẫn được giữ cho đến khi bạn lưu lại.',
  'menu.startNewCampaign': 'Chiến dịch mới',
  'menu.back': 'Quay lại',
  'save.noSavedCampaign': 'Chưa có chiến dịch đã lưu',
  'save.savedCampaign': 'Chiến dịch đã lưu',
  'save.savedDate': 'Đã lưu {date}',
  'resource.food': 'lương thực',
  'resource.supplies': 'vật tư',
  'resource.gold': 'vàng',
  'resource.humans': 'dân',
  'resource.workers': 'lao động',
  'season.Spring': 'Xuân',
  'season.Summer': 'Hạ',
  'season.Autumn': 'Thu',
  'season.Winter': 'Đông',
  'time.yearSeason': 'Năm {year} - {season}',
  'time.yearSeasonComma': 'Năm {year}, {season}',
  'building.farm': 'Nông trại',
  'building.mine': 'Mỏ',
  'building.market': 'Chợ',
  'building.wall': 'Tường thành',
  'building.tower': 'Tháp canh',
  'building.barracks': 'Trại lính',
  'building.shrine': 'Đền thờ',
  'building.buildLabel': 'Xây {building}',
  'building.none': 'không có',
  'building.noneYet': 'chưa có',
  'building.level': 'Cấp {level}',
  'building.max': 'Tối đa',
  'landType.castle': 'thành',
  'landType.farm': 'đất nông nghiệp',
  'landType.market': 'phố chợ',
  'landType.iron': 'mỏ sắt',
  'landType.temple': 'đền miếu',
  'landType.enemyCastle': 'thành địch',
  'landType.wilderness': 'hoang địa',
  'heroType.general': 'tướng quân',
  'heroType.governor': 'thái thú',
  'heroType.minister': 'đại thần',
  'heroType.agent': 'mật sứ',
  'rarity.Common': 'Thường',
  'rarity.Rare': 'Hiếm',
  'rarity.Epic': 'Sử thi',
  'rarity.Legendary': 'Huyền thoại',
  'owner.yours': 'Của bạn',
  'owner.neutral': 'Trung lập',
  'owner.rival': 'Đối thủ',
  'owner.yourDistrict': 'Quận của bạn',
  'owner.neutralTerritory': 'Lãnh thổ trung lập',
  'owner.rivalTerritory': 'Lãnh thổ đối thủ',
  'action.build': 'Xây',
  'action.heroes': 'Anh hùng',
  'action.court': 'Triều đình',
  'action.army': 'Quân đội',
  'action.map': 'Bản đồ',
  'action.menu': 'Menu',
  'action.details': 'Chi tiết ›',
  'action.pass': 'Bỏ qua',
  'action.recruit': 'Chiêu mộ',
  'action.positions': 'Chức vụ',
  'action.governors': 'Thái thú',
  'action.remove': 'Gỡ',
  'action.assign': 'Bổ nhiệm',
  'action.locked': 'Khóa',
  'action.change': 'Đổi',
  'action.select': 'Chọn',
  'action.cancel': 'Hủy',
  'action.createArmy': 'Lập quân',
  'action.upgrade': 'Nâng cấp',
  'action.why': 'Lý do?',
  'action.destroy': 'Phá hủy',
  'action.disband': 'Giải tán',
  'action.retreat': 'Rút lui',
  'action.choose': 'Chọn',
  'action.saveSnapshot': 'Lưu bản chụp',
  'action.exitToMenu': 'Về menu',
  'action.saveAndExit': 'Lưu và thoát',
  'action.exitWithoutSaving': 'Thoát không lưu',
  'action.attack': 'Tấn công',
  'action.conquer': 'Chinh phạt',
  'action.settle': 'Khai khẩn',
  'action.marchIn': 'Tiến vào',
  'action.intimidate': 'Uy hiếp',
  'action.bribe': 'Hối lộ ({chance}%)',
  'action.assignHero': 'Cử anh hùng ({trust}/{threshold})',
  'action.needHero': 'Cần anh hùng',
  'action.battle': 'Giao chiến',
  'status.available': 'Có sẵn: {value}',
  'status.vacant': 'Trống',
  'status.idle': 'rảnh',
  'status.lockedShrine': 'Khóa - cần Đền thờ',
  'status.assigned': 'Đang làm: {assignment}',
  'status.governor': 'Thái thú: {name}',
  'status.noGovernor': 'Chưa có thái thú',
  'status.nextArrival': 'Lần tới: Ân huệ {favor}/{threshold}',
  'status.currentRoster': 'Danh sách hiện tại',
  'status.noHeroesWaiting': 'Không có anh hùng nào đang chờ ở triều đình.',
  'status.noDistricts': 'Bạn chưa cai trị quận nào.',
  'status.chooseHero': 'Chọn anh hùng',
  'status.allCommandersBusy': 'Tất cả chỉ huy đang dẫn quân.',
  'status.administration': 'Quản trị {value}',
  'status.capacity': 'Sức chứa: {used}/{max}',
  'status.terrain': 'Địa hình',
  'status.labor': 'Lao động',
  'status.laborValue': '{workers} lao động, hiệu suất {efficiency}%',
  'status.maximumLevel': 'Đã đạt cấp tối đa.',
  'status.upgradeCost': 'Phí nâng cấp: {cost}',
  'status.cost': 'Giá: {cost}',
  'status.unavailable': 'Không khả dụng',
  'status.improvesDistrict': 'Cải thiện quận này qua vài nhịp kinh tế.',
  'status.noRefund': 'Không hoàn trả. Giảm bảo trì.',
  'status.moraleSupply': 'Tinh thần {morale}   Tiếp tế {supply}',
  'status.disbandInfo': 'Giải tán: dân trở về, mất XP.',
  'status.soldiers': 'Binh lính',
  'status.foodToSend': 'Lương mang theo',
  'status.suppliesToSend': 'Vật tư mang theo',
  'status.availableHumans': 'Dân có sẵn: {value}',
  'status.availableFood': 'Lương có sẵn: {value}',
  'status.availableSupplies': 'Vật tư có sẵn: {value}',
  'status.currentCampaign': 'Chiến dịch hiện tại',
  'status.districtsUnderRule': '{count} quận dưới quyền.',
  'status.unsavedProgress': 'Tiến trình chưa lưu có thể mất',
  'status.exitMenuBody': 'Lưu bản chụp trước khi về menu chính, hoặc rời đi mà không đổi ô lưu.',
  'modal.heroes.title': 'Anh hùng',
  'modal.heroes.subtitle': 'Chiêu mộ anh hùng cho triều đình, quân lệnh và các tỉnh.',
  'modal.court.title': 'Triều đình',
  'modal.court.subtitle': 'Bổ nhiệm anh hùng vào chức vụ hoặc cai quản tỉnh.',
  'modal.diplomacy.title': 'Yêu sách ngoại giao',
  'modal.diplomacy.subtitle': 'Cử một anh hùng rảnh để dẫn nhiệm vụ này.',
  'modal.army.title': 'Quân đội',
  'modal.army.subtitle': 'Chọn tướng lĩnh và lập một đạo quân dã chiến.',
  'modal.build.title': 'Xây dựng',
  'modal.build.noSelection': 'Hãy chọn một quận trước.',
  'modal.build.selectOwned': 'Chọn một quận của bạn trước khi xây.',
  'modal.request.title': 'Tấu trình triều đình',
  'modal.request.subtitle': 'Chọn cách hồi đáp.',
  'modal.gameMenu.title': 'Menu game',
  'modal.gameMenu.subtitle': 'Điều khiển chiến dịch.',
  'modal.exitMenu.title': 'Về menu',
  'modal.exitMenu.subtitle': 'Chọn cách rời chiến dịch này.',
  'modal.victory.title': 'Chiến thắng',
  'modal.victory.body': 'Tất cả thành của đối thủ đã sụp đổ. Thiên mệnh thuộc về Đại Việt.',
  'modal.victory.status': 'Thiên mệnh',
  'battle.preview.title': 'Dự báo trận đánh',
  'battle.preview.subtitle': '{army} tấn công {land}',
  'battle.preview.army': 'Quân',
  'battle.preview.target': 'mục tiêu',
  'battle.yourPower': 'Sức mạnh của bạn',
  'battle.enemyPower': 'Sức mạnh địch',
  'battle.estimate': 'Ước tính',
  'battle.advantage': 'Có lợi thế',
  'battle.highRisk': 'Rủi ro cao',
  'battle.victory': 'Chiến thắng!',
  'battle.defeat': 'Thất bại',
  'battle.yourArmy': 'Quân của bạn',
  'battle.theDistrict': 'quận này',
  'battle.victoryBody': '{army} phá vỡ phòng tuyến của {land}.\n\nSức mạnh bạn: {attackerPower}\nSức mạnh địch: {defenderPower}\n\nĐạo quân bắt đầu vây quận. Quận sẽ thất thủ sau {ticks} {tickLabel} kinh tế.',
  'battle.defeatBody': '{army} bị đẩy lùi tại {land}.\n\nSức mạnh bạn: {attackerPower}\nSức mạnh địch: {defenderPower}\n\nĐạo quân rút về để hồi phục.',
  'battle.prevailed': '{army} thắng thế',
  'battle.repelled': '{army} bị đẩy lùi',
  'tick.one': 'nhịp',
  'tick.many': 'nhịp',
  'terrain.summary': 'cỏ {grass}, quặng {ore}, nước {water}, đô thị {city}',
  'terrain.grass': 'cỏ',
  'terrain.ore': 'quặng',
  'terrain.water': 'nước',
  'terrain.city': 'đô thị',
  'land.ownerType': 'Chủ: {owner}   Loại: {type}',
  'land.defenseSize': 'Thủ: {defense}   Cỡ: {used}/{max}',
  'land.terrain': 'Địa hình: {terrain}',
  'land.output': 'Sản lượng: {outputs}',
  'land.buildings': 'Công trình: {buildings}',
  'land.populationSoldiers': 'Dân số: {population}   Binh: {soldiers}',
  'land.nobleTrust': 'Thế lực hào trưởng: {power}   Tín nhiệm: {trust}/{threshold}',
  'land.wilderness': 'Hoang địa - không dân cư, không đồn trú.',
  'land.underSiege': 'Đang bị vây: {progress}/{required} nhịp',
  'land.buildingStatus': '{kind} {building}: {progress}/{required}',
  'land.recruiting': 'Đang mộ quân: {progress}/{required}',
  'land.siegeShort': 'Vây hãm: {progress}/{required}',
  'land.bribeJoiningSoon': 'Đã nhận hối lộ - sắp gia nhập',
  'land.diplomatBuilding': 'Ngoại giao: đang xây tín nhiệm...',
  'land.pressure': 'Sức ép: {progress}/100',
  'land.settlers': 'Dân khai khẩn: {progress}/{required}',
  'land.movingIn': 'Đang tiến vào...',
  'land.acquiring': 'Đang giành: {progress}/{required}',
  'land.defPopPower': 'Thủ {defense} · Dân {population} · Thế {power}',
  'land.defWilderness': 'Thủ {defense} · Hoang địa · Không đồn trú',
  'land.defSize': 'Thủ {defense} · Cỡ {used}/{max}',
  'land.trustSoldiers': 'Tín nhiệm {trust}/100 · Binh {soldiers}',
  'land.bribeNextSeason': 'Hối lộ: gia nhập mùa sau',
  'land.heroTrust': '{hero}: tín nhiệm {trust}/{required}',
  'land.missingHeroTrust': 'Thiếu anh hùng: tín nhiệm {trust}/{required}',
  'land.armyPressure': 'Sức ép quân sự: {progress}/100',
  'land.settlersEnRoute': 'Dân khai khẩn đang đi: {progress}/{required}',
  'order.building': 'Đang xây',
  'order.upgrading': 'Đang nâng cấp',
  'court.officesFilled': '{filled}/{total} chức vụ đã có người',
  'court.moreAssigned': 'Nhiều triều thần hơn sẽ tạo thêm tấu trình bắt buộc.',
  'court.noRecruitedHeroes': 'Chưa chiêu mộ anh hùng. Hãy mở Anh hùng trước.',
  'court.diplomacyNeedsHero': 'Yêu sách ngoại giao cần một anh hùng rảnh. Hãy chiêu mộ hoặc giải nhiệm trước.',
  'politics.type.problem': 'vấn đề',
  'politics.type.law': 'luật lệnh',
  'politics.type.opportunity': 'cơ hội',
  'politics.type.crisis': 'khủng hoảng',
  'courtPosition.marshal': 'Nguyên soái',
  'courtPosition.quartermaster': 'Quan quân nhu',
  'courtPosition.treasurer': 'Thủ quỹ',
  'courtPosition.steward': 'Quản sự',
  'courtPosition.chancellor': 'Tể tướng',
  'courtPosition.spymaster': 'Mật thám trưởng',
  'courtPosition.censor': 'Ngự sử',
  'courtPosition.masterOfHorse': 'Mã chính',
  'msg.visitingHeroesLeave': 'Các anh hùng viếng thăm rời triều.',
  'msg.chooseCommander': 'Chọn chỉ huy trước khi lập quân.',
  'msg.selectDistrictBuild': 'Chọn một quận của bạn, rồi bấm Xây.',
  'msg.mapMode': 'Chế độ bản đồ: kéo vùng, rồi chạm đất hoặc lệnh quân.',
  'msg.courtRequiresAnswer': 'Triều đình cần một câu trả lời.',
  'msg.cannotUpgrade': 'Công trình này chưa thể nâng cấp.',
  'msg.structureUnavailable': 'Công trình đó không khả dụng ở đây.',
  'msg.snapshotSaved': 'Đã lưu bản chụp chiến dịch.',
  'msg.saveUnavailable': 'Trình duyệt này không thể lưu.',
  'msg.armySelected': 'Đã chọn quân.',
  'msg.armySelectedNamed': 'Đã chọn {army}. Chạm vùng đất thấy được để di chuyển.',
  'msg.selectAdjacentArmy': 'Trước tiên hãy chọn một đạo quân ở quận liền kề.',
  'msg.selectArmyBeforeAttack': 'Chọn một đạo quân liền kề vùng đất này trước khi tấn công.',
  'msg.initial': 'Cuộc đua mở cõi bắt đầu. Mua đất trung lập gần bên, xây quận, rồi chiếm kinh thành đối thủ.',
  'special.wilderness': 'Hoang địa không dân cư. Không làng, không đồn trú.',
  'special.randomDistrict': 'Quận {type} ngẫu nhiên với địa hình và tài nguyên được tạo.',
  'special.playerCapital': 'Kinh thành khởi đầu ngẫu nhiên của bạn.',
  'special.rivalCapital': 'Kinh thành đối thủ ngẫu nhiên. Chiếm nơi này để thắng chiến dịch.',
  'msg.economyTick': 'Nhịp kinh tế: Năm {year}, {season}. Mở rộng, xây dựng và chuẩn bị đánh kinh thành đối thủ.',
  'msg.newHeroes': 'Anh hùng mới đến triều. Hãy chọn một người.',
  'msg.heroJoins': '{hero} gia nhập triều đình.',
  'msg.foodEmpty': 'Kho lương cạn. Dân suy giảm và quân mất sẵn sàng.',
  'msg.suppliesEmpty': 'Kho vật tư cạn. Hậu cần quân đội suy yếu.',
  'msg.victory': 'Chiến thắng! Tất cả thành đối thủ đã thuộc về Đại Việt.',
  'msg.noRoute': 'Không có đường qua lãnh thổ của bạn đến vùng đất đó.',
  'msg.marches': '{army} hành quân tới {land} ({ticks} {tickLabel}).',
  'msg.arrives': '{army} đã tới {land}.',
  'msg.notEnoughHumansArmy': 'Không đủ dân để lập đạo quân đó.',
  'msg.needFoodArmy': 'Cần {amount} lương để gửi theo đạo quân đó.',
  'msg.needSuppliesArmy': 'Cần {amount} vật tư để trang bị và tiếp tế đạo quân đó.',
  'msg.noOwnedCityArmy': 'Không có đô thị thuộc quyền để lập quân.',
  'msg.alreadyTraining': '{land} đang huấn luyện quân mới.',
  'msg.recruitingArmy': 'Đang mộ {total} lính tại {land}. Sẵn sàng sau {ticks} {tickLabel}.',
  'msg.finishedTraining': '{army} hoàn tất huấn luyện tại {land}.',
  'msg.starvedDisbanded': '{army} chết đói và tan rã.',
  'msg.alreadyUnderSiege': '{land} đang bị vây.',
  'msg.victoryAt': 'Chiến thắng tại {land}. Quân đội vây quận ({ticks} {tickLabel} đến khi thất thủ).',
  'msg.defeatAt': 'Thất bại tại {land}. Quân đội rút lui.',
  'msg.disbands': '{army} giải tán. {humans} dân trở về; XP bị mất.',
  'msg.withdraws': '{army} rút khỏi vòng vây {land}.',
  'msg.landFalls': '{land} thất thủ! Quận đã bị chiếm.',
  'msg.acquisitionProgress': '{land} đã có tiến trình thâu nạp.',
  'msg.neutralAdjacentOnly': 'Bạn chỉ có thể tác động đất trung lập liền kề quận của mình.',
  'msg.needGoldBribe': 'Cần {cost} vàng để hối lộ.',
  'msg.bribeRefused': 'Hào trưởng ở {land} nhận vàng rồi từ chối. Mất tín nhiệm; ngoại giao ở đây sẽ khó hơn.',
  'msg.bribeAccepted': 'Hối lộ thành công! {land} sẽ gia nhập Đại Việt vào mùa sau.',
  'msg.assignHeroDiplomacy': 'Cử một anh hùng rảnh trước khi bắt đầu yêu sách ngoại giao.',
  'msg.heroUnavailableDiplomacy': 'Anh hùng đó không thể dẫn nhiệm vụ ngoại giao.',
  'msg.heroAlreadyAssigned': '{hero} đã được giao việc. Chọn anh hùng rảnh cho ngoại giao.',
  'msg.needSuppliesDiplomacy': 'Cần {cost} vật tư cho quà ngoại giao và tiếp đãi.',
  'msg.heroTravels': '{hero} tới {land} để xây tín nhiệm. Cần {threshold}, hiện có {current}.',
  'msg.armyAdjacentThreat': 'Quân của bạn phải đóng ở quận thuộc quyền liền kề để uy hiếp {land}.',
  'msg.armyTooWeak': 'Quân của bạn (sức {power}) chưa đủ mạnh để uy hiếp {land} (đồn trú: {garrison}).',
  'msg.armyPressures': 'Quân đội gây sức ép lên {land}. Giữ họ ở gần cho đến khi đồn trú tan vỡ.',
  'msg.settleAdjacentOnly': 'Bạn chỉ có thể khai khẩn đất liền kề quận của mình.',
  'msg.needHumansSettlers': 'Cần {cost} dân để đưa người khai khẩn vào hoang địa.',
  'msg.settlersDepart': 'Dân khai khẩn rời tới {land}. Họ sẽ lập cộng đồng mới trong {seasons} mùa.',
  'msg.armyEntersWilderness': '{army} tiến vào {land} - hoang địa không dân đã được tuyên chiếm.',
  'msg.diplomacyCancelledNoHero': 'Yêu sách ngoại giao tại {land} bị hủy - không có anh hùng dẫn nhiệm vụ.',
  'msg.intimidationCancelledMoved': 'Uy hiếp {land} bị hủy - quân của bạn đã rời đi.',
  'msg.landJoinsKingdom': '{land} gia nhập {kingdom}.',
  'msg.acquiredBribe': 'Hào trưởng ở {land} chấp nhận điều kiện và giao quyền.{popMsg}{bonusMsg}',
  'msg.acquiredDiplomacy': 'Dân chúng {land} chọn gia nhập Đại Việt.{popMsg}{bonusMsg}',
  'msg.acquiredIntimidation': '{land} khuất phục trước sức ép quân sự.{popMsg}{bonusMsg}',
  'msg.acquiredSettle': 'Dân khai khẩn lập cộng đồng mới tại {land}.',
  'msg.acquiredOccupy': '{land} bị chiếm đóng - không kháng cự.',
  'msg.acquiredConquest': '{land} gia nhập một vương quốc đối thủ.',
  'msg.populationBonus': ' +{population} dân.',
  'msg.resourceBonus': ' {bonus}.',
  'msg.botClaims': '{kingdom} bắt đầu tuyên chiếm {land}.',
  'msg.botDevelops': '{kingdom} phát triển {land}.',
  'msg.botPressures': '{kingdom} gây sức ép lên {land}.',
  'msg.courtAttention': 'Triều đình cần chú ý: {title}',
  'msg.politicsChoice': '{label}: {description}',
  'msg.noFreeBuildingRoom': 'Không quận nào còn chỗ cho {building} miễn phí.',
  'msg.seatNotBuilt': 'Chức {seat} chưa được mở.',
  'msg.heroTakesSeat': '{hero} nhận chức {seat}.',
  'msg.heroGoverns': '{hero} cai quản {land}.',
  'msg.cannotBuildHere': 'Không thể xây công trình đó ở đây.',
  'msg.startedConstruction': 'Bắt đầu xây {building} tại {land}. Hoàn tất sau {ticks} nhịp kinh tế.',
  'msg.startedUpgrade': 'Bắt đầu nâng {building} lên cấp {level} tại {land}. Hoàn tất sau {ticks} nhịp kinh tế.',
  'msg.finishBeforeDestroy': 'Hoàn tất xây dựng hiện tại trước khi phá hủy công trình.',
  'msg.destroyedBuilding': 'Đã phá {building} ở {land}. Chi phí bảo trì giảm.',
  'msg.upgradedBuilding': '{building} đã nâng lên cấp {level} tại {land}.',
  'msg.completedBuilding': '{building} đã hoàn tất tại {land}.',
  'reason.noCapacity': 'Không còn sức chứa trong quận.',
  'reason.marketLimit': 'Quận này đã đạt giới hạn chợ.',
  'reason.alreadyBuilt': '{building} đã được xây ở đây.',
  'reason.alreadyOrder': 'Đang {kind} {building} ({progress}/{required}).',
  'reason.maxLevel': 'Đã ở cấp tối đa.',
  'reason.needCost': 'Cần {parts}.',
  'reason.needGrass': 'Cần thêm ô cỏ, ruộng hoặc lúa nước.',
  'reason.needOre': 'Cần ô núi hoặc đồi.',
  'reason.needCity': 'Cần lõi đô thị hoặc ít nhất 3 kết nối đường.',
  'desc.farm': 'Tạo lương từ ô cỏ và ruộng.{waterBonus}',
  'desc.farmWater': ' Nước tăng sản lượng lương.',
  'desc.mine': 'Tạo vật tư từ ô núi và đồi.',
  'desc.wall': 'Tăng thủ quận này thêm 6.',
  'desc.tower': 'Tăng thủ quận này thêm 10.',
  'desc.market': 'Tạo vàng và vật tư từ đường sá và tiếp cận đô thị.',
  'content.genericFallback': '{text}',
  'common.capital': 'Kinh thành',
  // Heroes
  'heroes.king.description': 'Vị vua đang trị vì, trực tiếp dẫn quân nơi tiền tuyến.',
  'heroes.king.trait_morale.effect': '+10% sĩ khí cho tất cả quân đội của bạn.',
  'heroes.king.trait_power.effect': '+8% sức mạnh quân đội trong chiến đấu.',
  'heroes.king.trait_rations.effect': '+5% sức chứa quân lương tối đa cho quân đội.',

  'heroes.vo-tuong-nui.description': 'Một võ tướng miền núi, thiện chiến trên địa hình hiểm trở.',
  'heroes.vo-tuong-nui.effect': '+20% tấn công khi chiến đấu ở vùng mỏ sắt hoặc vùng núi.',

  'heroes.tran-cung-thu.description': 'Một chỉ huy thực tế, luôn tin vào sức mạnh của cung thủ.',
  'heroes.tran-cung-thu.effect': '+10% sức mạnh quân đội khi có cung thủ.',

  'heroes.le-thiet-giap.description': 'Một đội trưởng bộ binh giáp nặng đầy kỷ luật.',
  'heroes.le-thiet-giap.effect': '+18% sức công phá khi có bộ binh giáp nặng.',

  'heroes.quan-doc-luong.description': 'Một vị quan cai quản và bảo vệ kho lương.',
  'heroes.quan-doc-luong.effect': '+30% lương thực từ ruộng được bổ nhiệm.',

  'heroes.ba-quan-kho.description': 'Một người quản kho cẩn trọng và đáng tin.',
  'heroes.ba-quan-kho.effect': '+8 trung thành và +8 phòng thủ ở vùng đất được bổ nhiệm.',

  'heroes.ong-do-dien.description': 'Một nhà cải cách thủy lợi và lao dịch làng xã.',
  'heroes.ong-do-dien.effect': 'Nâng cấp ruộng tốn ít hơn 20%.',

  'heroes.quan-thue-hoi-an.description': 'Một quan coi ngân khố được rèn luyện bởi thương nhân cảng thị.',
  'heroes.quan-thue-hoi-an.effect': '+15% vàng từ chợ.',

  'heroes.su-gia.description': 'Một học giả giúp củng cố chính danh của triều đình.',
  'heroes.su-gia.effect': '+5 ảnh hưởng mỗi mùa.',

  'heroes.thai-su-minh.description': 'Một kiến trúc sư triều chính, biến trật tự thành quyền lực.',
  'heroes.thai-su-minh.effect': '+1 trật tự sau mỗi bốn mùa.',

  'heroes.su-gia-mem-mong.description': 'Một sứ giả kiên nhẫn, giỏi thương lượng với các hào trưởng địa phương.',
  'heroes.su-gia-mem-mong.effect': '+20% cơ hội thu phục hòa bình.',

  'heroes.mat-tham-bac.description': 'Một mật thám lặng lẽ, chuyên tìm điểm yếu của thành lũy.',
  'heroes.mat-tham-bac.effect': '-8 phòng thủ mục tiêu trước phần xem trước trận đánh.',

  'heroes.hoang-yen.description': 'Một đặc vụ nổi danh, có thể khiến các thế lực đối địch quay sang chống nhau.',
  'heroes.hoang-yen.effect': '+25 ảnh hưởng từ các cơ hội chính trị thành công.',

  'heroes.do-doc-bach-dang.description': 'Một đô đốc sông nước, chiến thắng nhờ đọc được thủy triều và đầm lầy.',
  'heroes.do-doc-bach-dang.effect': '+25% sức mạnh quân đội khi chiến đấu ở vùng sông hoặc đầm lầy.',

  'heroes.tran-thuy-quan.description': 'Một chỉ huy được huấn luyện để đưa quân qua sông ngòi và đường ven biển.',
  'heroes.tran-thuy-quan.effect': '+15% sức mạnh quân đội khi chiến đấu gần cảng, sông hoặc vùng ven biển.',

  'heroes.nu-tuong-rung.description': 'Một nữ tướng rừng sâu, giấu quân dưới tán lá dày và sương mù.',
  'heroes.nu-tuong-rung.effect': '+20% phòng thủ và +10% tấn công khi chiến đấu trong rừng.',

  'heroes.ky-binh-bien-ai.description': 'Một đội trưởng kỵ binh biên ải, quen với những cuộc tập kích bất ngờ.',
  'heroes.ky-binh-bien-ai.effect': '+10% sức mạnh quân đội khi tấn công từ đường lớn, cửa ải hoặc vùng biên.',

  'heroes.tuong-voi-tay-son.description': 'Một chỉ huy táo bạo, dùng tượng binh phá vỡ hàng ngũ địch.',
  'heroes.tuong-voi-tay-son.effect': '+22% sức công phá khi quân đội có đơn vị tinh nhuệ hoặc đặc biệt.',

  'heroes.quan-ha-de.description': 'Một quan coi đê điều, sửa đê trước mùa lũ.',
  'heroes.quan-ha-de.effect': '+25% lương thực từ ruộng vùng đồng bằng ngập lũ hoặc ven sông.',

  'heroes.ba-lang-nuoc.description': 'Một bậc trưởng lão được kính trọng, giữ gìn kênh mương, giếng nước và kho thóc.',
  'heroes.ba-lang-nuoc.effect': '+10 trung thành và +10 phòng thủ ở vùng sông hoặc ruộng được bổ nhiệm.',

  'heroes.ly-truong-lam-son.description': 'Một lý trưởng địa phương, giỏi tổ chức các làng rừng.',
  'heroes.ly-truong-lam-son.effect': '+15 sản lượng từ vùng rừng hoặc đồi.',

  'heroes.thuong-nhan-van-don.description': 'Một thương nhân giàu có, kết nối cảng biển, chợ và đường nội địa.',
  'heroes.thuong-nhan-van-don.effect': '+20% vàng từ cảng và đường thương mại.',

  'heroes.thien-su-truc-lam.description': 'Một thiền sư điềm tĩnh, lời nói có thể làm dịu cơn giận trong vương quốc.',
  'heroes.thien-su-truc-lam.effect': '-15% bất ổn từ thẻ khủng hoảng.',

  'heroes.thai-uy-bien-cuong.description': 'Một thái úy nghiêm khắc, củng cố kỷ luật nơi biên cương.',
  'heroes.thai-uy-bien-cuong.effect': 'Quân đội mới chiêu mộ bắt đầu với +8 sĩ khí.',

  'heroes.ke-mo-duong.description': 'Một trinh sát chuyên đánh dấu lối mòn qua đèo và thung lũng.',
  'heroes.ke-mo-duong.effect': '+15% cơ hội thu phục hòa bình cho vùng đất liền kề.',

  'heroes.mat-tham-den.description': 'Một mật thám nguy hiểm, mở cổng thành trước khi đại quân kéo đến.',
  'heroes.mat-tham-den.effect': '-15 phòng thủ mục tiêu trước phần xem trước trận đánh.',

  'heroes.cong-chua-hoa-than.description': 'Một công chúa ngoại giao, biến thù cũ thành liên minh có ích.',
  'heroes.cong-chua-hoa-than.effect': '+30% cơ hội thu phục hòa bình và +10 ảnh hưởng từ ngoại giao thành công.',

  // Lands
  'lands.thang-long.name': 'Kinh thành Thăng Long',
  'lands.thang-long.special': 'Kinh thành của người chơi. Đường sá và chợ biến việc mở rộng thành vàng và quân nhu.',

  'lands.cao-bang.name': 'Kinh Đô Cao Bằng',
  'lands.cao-bang.special': 'Kinh đô của đối thủ. Chiếm nơi này để chiến thắng chiến dịch.',

  'lands.thanh-hoa.name': 'Thảo Nguyên Thanh Hóa',
  'lands.thanh-hoa.special': 'Vùng thảo nguyên rộng mở, phù hợp để xây ruộng và tăng lương thực đầu game.',

  'lands.red-river.name': 'Đồng Bằng Sông Hồng',
  'lands.red-river.special': 'Những ô đất được sông bồi đắp rất thích hợp để phát triển ruộng.',

  'lands.bach-dang.name': 'Đồng Lầy Bạch Đằng',
  'lands.bach-dang.special': 'Ruộng nước có thể nuôi sống dân số lớn nếu được khai phá.',

  'lands.nghe-an.name': 'Vùng Đồi Nghệ An',
  'lands.nghe-an.special': 'Vùng đồi mở ra khả năng xây mỏ và sản xuất quân nhu.',

  'lands.lang-son.name': 'Núi Non Lạng Sơn',
  'lands.lang-son.special': 'Vùng núi khó đánh chiếm nhưng rất tốt cho sản xuất quân nhu.',

  'lands.hoi-an.name': 'Phố Chợ Hội An',
  'lands.hoi-an.special': 'Một trung tâm thương mại tự nhiên, hưởng lợi lớn từ kết nối đường sá.',

  'lands.truc-lam.name': 'Đền Trúc Lâm',
  'lands.truc-lam.special': 'Một khu vực yên bình với lõi đô thị nhỏ và đường đi hữu dụng.',

  'lands.mountain-gate.name': 'Sơn Ải',
  'lands.mountain-gate.special': 'Một cửa ải phòng thủ nằm giữa hai thế lực đang mở rộng.',

  'lands.cloud-pass.name': 'Vân Ải',
  'lands.cloud-pass.special': 'Địa hình hiểm trở nhưng có tiềm năng xây mỏ mạnh.',

  'lands.song-ca.name': 'Vùng Thung Lũng Sông Cả',
  'lands.song-ca.special': 'Ruộng trong thung lũng giúp ổn định lương thực trước các cuộc chiến lớn.',

  'lands.da-rang.name': 'Đồng Bằng Đà Rằng',
  'lands.da-rang.special': 'Vùng đất màu mỡ rộng lớn, có đủ không gian cho nhiều ruộng.',

  'lands.van-don.name': 'Vân Đồn - Cảng Lộ',
  'lands.van-don.special': 'Một khu chợ thuận lợi đường sá, hữu ích cho vàng và quân nhu.',

  'lands.tam-dao.name': 'Dãy Núi Tam Đảo',
  'lands.tam-dao.special': 'Địa hình sống núi phù hợp để xây mỏ và phòng thủ.',

  'lands.lam-son.name': 'Nông Lâm Lam Sơn',
  'lands.lam-son.special': 'Vùng thảo nguyên có rừng, có thể khai phá thành ruộng.',

  'lands.west-road.name': 'Tây Lộ - Trạm Dịch',
  'lands.west-road.special': 'Đường đi thuận lợi biến nơi này thành một khu hậu cần hữu ích.',

  'lands.east-road.name': 'Đông Lộ - Trạm Dịch',
  'lands.east-road.special': 'Một trạm thương mại trở nên mạnh hơn khi kết nối với nhiều vùng đất.',

  'lands.black-river.name': 'Đồng Bằng Sông Đen',
  'lands.black-river.special': 'Vùng đất sông ngòi pha trộn, có tiềm năng ruộng cao.',

  'lands.silver-mine.name': 'Đồi Mỏ Bạc',
  'lands.silver-mine.special': 'Một khu vực giàu quân nhu, phù hợp cho quân đội cấp cao.',

  'lands.lotus-lake.name': 'Làng Hồ Sen',
  'lands.lotus-lake.special': 'Làng ven hồ rất có giá trị để tạo thặng dư lương thực.',

  'lands.ceramic-town.name': 'Làng Gốm',
  'lands.ceramic-town.special': 'Một lõi đô thị nhỏ có thể phát triển thành trung tâm vàng.',

  'lands.frontier-fort.name': 'Pháo Đài Biên Giới',
  'lands.frontier-fort.special': 'Một khu đường trung tâm có khả năng trở thành điểm tranh chấp.',

  'lands.pine-pass.name': 'Đèo Thông',
  'lands.pine-pass.special': 'Một con đèo hiểm trở làm chậm quân đội nhưng nuôi dưỡng tuyến tiếp tế.',

  'lands.southern-rice.name': 'Vùng Lúa Miền Nam',
  'lands.southern-rice.special': 'Một khu lương thực mềm yếu nhưng rất năng suất.',

  'lands.phu-xuan.name': 'Thành Phú Xuân',
  'lands.phu-xuan.special': 'Một đô thị triều chính cũ với tiềm năng mạnh về chợ và cai trị.',

  'lands.yen-tu.name': 'Núi Thiêng Yên Tử',
  'lands.yen-tu.special': 'Một vùng núi linh thiêng giúp tăng lòng trung thành và ảnh hưởng.',

  'lands.dien-bien.name': 'Thung Lũng Điện Biên',
  'lands.dien-bien.special': 'Một thung lũng xa xôi có thể nuôi quân trước các chiến dịch biên cương.',

  'lands.cuu-long.name': 'Đồng Bằng Cửu Long',
  'lands.cuu-long.special': 'Một đồng bằng sông nước màu mỡ với sản lượng lương thực dài hạn rất cao.',

  'lands.sa-pa.name': 'Đèo Cao Sa Pa',
  'lands.sa-pa.special': 'Địa hình cao nguyên lạnh giá, mạnh về phòng thủ và tiềm năng khai mỏ.',

  'lands.quy-nhon.name': 'Cảng Quy Nhơn',
  'lands.quy-nhon.special': 'Một khu chợ ven biển hưởng lợi lớn từ mở rộng thương mại.',

  'lands.nha-trang.name': 'Vịnh Nha Trang',
  'lands.nha-trang.special': 'Một vịnh kín gió có thể trở thành điểm dừng thương mại giàu có.',

  'lands.tay-do.name': 'Phường Chợ Tây Đô',
  'lands.tay-do.special': 'Một khu thương mại phương Nam, phù hợp với chợ và kết nối đường sá.',

  'lands.dong-son.name': 'Làng Nghề Đông Sơn',
  'lands.dong-son.special': 'Một làng thủ công có tiềm năng vàng mạnh khi được nối với các chợ.',

  'lands.con-son.name': 'Đền Côn Sơn',
  'lands.con-son.special': 'Một khu đền yên tĩnh giúp ổn định các vùng đất lân cận.',

  'lands.phong-nha.name': 'Động Phong Nha',
  'lands.phong-nha.special': 'Hang động đá vôi phù hợp cho khai mỏ và chiến tranh phòng thủ.',

  'lands.go-cong.name': 'Vùng Lúa Gò Công',
  'lands.go-cong.special': 'Một vùng lúa ven biển phát triển nhanh khi được bảo vệ.',

  // Units

  'units.militia.name': 'Dân Binh',
  'units.spearmen.name': 'Lính Giáo',
  'units.archers.name': 'Cung Thủ',
  'units.crossbowmen.name': 'Nỏ Thủ',
  'units.heavyInfantry.name': 'Bộ Binh Nặng',
  'units.lightCavalry.name': 'Kỵ Binh Nhẹ',
  'units.royalGuard.name': 'Cấm Vệ Quân',
  'units.warElephants.name': 'Tượng Binh',
  'units.siegeEngine.name': 'Công Thành Khí',
  'units.riverMarines.name': 'Thủy Binh Sông',
};

const listeners = new Set<(language: LanguageCode) => void>();

export function getLanguage(): LanguageCode {
  if (typeof localStorage === 'undefined') {
    return 'en';
  }
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return stored === 'vi' || stored === 'en' ? stored : 'en';
}

export function setLanguage(language: LanguageCode): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }
  for (const listener of listeners) {
    listener(language);
  }
}

export function subscribeLanguageChange(listener: (language: LanguageCode) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function t(key: TranslationKey, params: TranslationParams = {}): string {
  const catalog = getLanguage() === 'vi' ? vi : en;
  return interpolate(catalog[key] ?? en[key], params);
}

export function interpolate(template: string, params: TranslationParams = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name) => {
    const value = params[name];
    return typeof value === 'undefined' ? match : String(value);
  });
}

export function seasonLabel(season: Season): string {
  return t(`season.${season}` as TranslationKey);
}

export function resourceLabel(resource: ResourceKey): string {
  return t(`resource.${resource}` as TranslationKey);
}

export function buildingLabel(building: LandBuildingType): string {
  return t(`building.${building}` as TranslationKey);
}

export function buildBuildingLabel(building: LandBuildingType): string {
  return t('building.buildLabel', { building: buildingLabel(building) });
}

export function landTypeLabel(type: LandType): string {
  return t(`landType.${type}` as TranslationKey);
}

export function heroTypeLabel(type: HeroType): string {
  return t(`heroType.${type}` as TranslationKey);
}

export function rarityLabel(rarity: Hero['rarity']): string {
  return t(`rarity.${rarity}` as TranslationKey);
}

export function politicsTypeLabel(type: PoliticsCard['type']): string {
  return t(`politics.type.${type}` as TranslationKey);
}

export function tickLabel(count: number): string {
  return t(count === 1 ? 'tick.one' : 'tick.many');
}

export function formatResourceList(values: Partial<Record<ResourceKey, number>>): string {
  return Object.entries(values)
    .map(([key, value]) => `${value} ${resourceLabel(key as ResourceKey)}`)
    .join(', ');
}

const heroVi: Record<string, { description?: string; effect?: string }> = {
  king: {
    description: 'Quốc vương đương triều, trực tiếp dẫn quân nơi tiền tuyến.',
  },
  'vo-tuong-nui': {
    description: 'Một sơn tướng giỏi tấn công trên địa hình hiểm trở.',
    effect: '+20% tấn công khi đánh ở đất sắt hoặc vùng núi.',
  },
  'tran-cung-thu': {
    description: 'Một chỉ huy thực tế, tin dùng cung thủ.',
    effect: '+10% sức mạnh quân khi có cung thủ.',
  },
  'le-thiet-giap': {
    description: 'Một đội trưởng bộ binh nặng kỷ luật.',
    effect: '+18% sức công phá với bộ binh nặng.',
  },
  'quan-doc-luong': {
    description: 'Một thái thú bảo vệ kho lúa.',
    effect: '+30% lương từ nông trại được giao.',
  },
  'ba-quan-kho': {
    description: 'Một quản kho cẩn trọng.',
    effect: '+8 trung thành và +8 phòng thủ ở vùng đất được giao.',
  },
  'ong-do-dien': {
    description: 'Một nhà cải cách thủy lợi và lao dịch làng xã.',
    effect: 'Nâng cấp nông trại rẻ hơn 20%.',
  },
  'quan-thue-hoi-an': {
    description: 'Một thủ quỹ được thương nhân cảng thị rèn luyện.',
    effect: '+15% vàng từ chợ.',
  },
  'su-gia': {
    description: 'Một học giả củng cố chính danh.',
    effect: '+5 ảnh hưởng mỗi mùa.',
  },
  'thai-su-minh': {
    description: 'Một kiến trúc sư triều chính biến trật tự thành quyền lực.',
    effect: '+1 lệnh mỗi bốn mùa.',
  },
  'su-gia-mem-mong': {
    description: 'Một nhà thương thuyết kiên nhẫn với hào trưởng làng.',
    effect: '+20% cơ hội thâu nạp hòa bình.',
  },
  'mat-tham-bac': {
    description: 'Một mật thám lặng lẽ tìm điểm yếu thành lũy.',
    effect: '-8 phòng thủ mục tiêu trước dự báo trận đánh.',
  },
  'hoang-yen': {
    description: 'Một mật sứ nổi tiếng có thể khiến đối thủ chống lẫn nhau.',
    effect: '+25 ảnh hưởng từ cơ hội chính trị thành công.',
  },
};

const kingTraitVi: Record<string, string> = {
  '+10% morale for all your armies.': '+10% tinh thần cho toàn quân.',
  '+8% army power in battle.': '+8% sức mạnh quân trong chiến trận.',
  '+5% max rations capacity for armies.': '+5% sức chứa khẩu phần tối đa cho quân đội.',
};

export function heroDescription(hero: Hero): string {
  return getLanguage() === 'vi' ? heroVi[hero.id]?.description ?? hero.description : hero.description;
}

export function heroEffect(hero: Hero): string {
  if (getLanguage() !== 'vi') {
    return hero.effect;
  }
  return heroVi[hero.id]?.effect ?? kingTraitVi[hero.effect] ?? hero.effect;
}

const politicsVi: Record<string, { title?: string; description?: string; choices?: Record<string, { label: string; description: string }> }> = {
  'granary-charter': {
    title: 'Điều lệ kho lương',
    description: 'Triều đình có thể củng cố kho lương hoặc cấp khẩu phần cho dân mở cõi.',
    choices: {
      'royal-granaries': { label: 'Kho lương hoàng gia', description: 'Thu nhập lương vĩnh viễn tăng.' },
      'settler-rations': { label: 'Khẩu phần khai khẩn', description: 'Tăng trưởng dân số vĩnh viễn tăng.' },
    },
  },
  'mint-policy': {
    title: 'Chính sách đúc tiền',
    description: 'Các xưởng đúc xin một chuẩn mới cho tiền tệ trong vương quốc.',
    choices: {
      'true-weight-coins': { label: 'Tiền đúng trọng lượng', description: 'Thu nhập vàng vĩnh viễn tăng.' },
      'merchant-ledgers': { label: 'Sổ thương nhân', description: 'Chợ tạo thêm vàng vĩnh viễn.' },
    },
  },
  'arsenal-charter': {
    title: 'Điều lệ quân khí',
    description: 'Các kho quân khí cần được tổ chức lại để phục vụ chiến dịch dài.',
    choices: {
      'royal-warehouses': { label: 'Kho hoàng gia', description: 'Thu nhập vật tư vĩnh viễn tăng.' },
      'cheap-armories': { label: 'Xưởng giáp tiết kiệm', description: 'Chi phí vật tư tuyển mộ giảm vĩnh viễn.' },
    },
  },
  'campaign-budget': {
    title: 'Ngân sách chiến dịch',
    description: 'Các quan xin quyết sách cho chi phí quân sự và mở cõi.',
    choices: {
      'lean-camps': { label: 'Doanh trại gọn nhẹ', description: 'Bảo trì vàng cho quân đội giảm vĩnh viễn.' },
      'settlement-brokers': { label: 'Môi giới định cư', description: 'Chi phí thâu nạp hòa bình giảm vĩnh viễn.' },
    },
  },
  'bad-harvest': {
    title: 'Mùa màng thất bát',
    description: 'Làng xã báo thiếu lương và xin triều đình can thiệp.',
    choices: {
      'tight-rations': { label: 'Siết khẩu phần', description: 'Thu nhập lương giảm trong 4 nhịp.' },
      'buy-relief-grain': { label: 'Mua lương cứu trợ', description: 'Dùng vàng để nhận lương ngay.' },
    },
  },
  'visiting-hero': {
    title: 'Anh hùng viếng thăm',
    description: 'Một nhân tài nổi danh xin yết kiến trong thời gian ngắn.',
    choices: {
      'open-court': { label: 'Mở triều tiếp đón', description: 'Lập tức chọn từ bất kỳ đề nghị anh hùng nào.' },
      'seek-general': { label: 'Tìm tướng quân', description: 'Lập tức chọn từ đề nghị thiên về tướng quân.' },
    },
  },
  'recruitment-drive': {
    title: 'Đợt tuyển quân',
    description: 'Các làng đồng ý hỗ trợ mộ quân nếu triều đình ra lệnh rõ ràng.',
    choices: {
      'short-drive': { label: 'Đợt ngắn', description: 'Tuyển quân nhanh hơn trong 4 nhịp.' },
      'long-drive': { label: 'Đợt dài', description: 'Tuyển quân nhanh hơn trong 8 nhịp.' },
    },
  },
  'battle-logistics': {
    title: 'Hậu cần chiến trận',
    description: 'Quan quân nhu đề xuất thay đổi cách cấp phát khi hành quân.',
    choices: {
      'frugal-battles': { label: 'Trận đánh tiết kiệm', description: 'Chi phí vật tư chiến trận giảm trong 8 nhịp.' },
      'discount-contracts': { label: 'Khế ước giảm giá', description: 'Các công trình kế tiếp rẻ hơn trong 6 nhịp.' },
    },
  },
};

export function politicsTitle(card: PoliticsCard): string {
  return getLanguage() === 'vi' ? politicsVi[card.id]?.title ?? card.title : card.title;
}

export function politicsDescription(card: PoliticsCard): string {
  return getLanguage() === 'vi' ? politicsVi[card.id]?.description ?? card.description : card.description;
}

export function politicsChoiceLabel(choice: PoliticsChoice): string {
  if (getLanguage() !== 'vi') {
    return choice.label;
  }
  return findPoliticsChoice(choice.id)?.label ?? choice.label;
}

export function politicsChoiceDescription(choice: PoliticsChoice): string {
  if (getLanguage() !== 'vi') {
    return choice.description;
  }
  return findPoliticsChoice(choice.id)?.description ?? choice.description;
}

function findPoliticsChoice(choiceId: string): { label: string; description: string } | undefined {
  for (const card of Object.values(politicsVi)) {
    const choice = card.choices?.[choiceId];
    if (choice) {
      return choice;
    }
  }
  return undefined;
}
