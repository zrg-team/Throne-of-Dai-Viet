/**
 * Builds the visual cluster for a land's settlement: city/temple building groups with
 * an optional wall, or a themed farm/mine/generic village for lands without a
 * fortress/shrine hex. Delegates actual glyph drawing to the selected item renderer.
 */
import Phaser from 'phaser';
import { EDGE_DIRECTIONS, MAP_SCALE, axialToPixel, hexCorners, hexKey } from '../../map/hex';
import type { HexCoord } from '../../map/hex';
import type { GameState, Land, LandBuildingType } from '../../state/types';
import { LABEL_KEEP_OUT, type MapItemRenderer } from '../../ui/MapItemRenderer';
import { brushStroke } from '../../ui/inkTheme';
import { figureEraFor } from '../../ui/ink/devices';
import { setDrawnEra } from '../../ui/ink/settlements';
import type { MapThemePalette } from '../../ui/mapTheme';
import {
  conquestArtAsset,
  conquestArtDisplayMetrics,
  conquestArtStamp,
} from '../../ui/conquestMapArt';
import { placeStamp } from '../../ui/ink/stamp';
import { bakedBuffalo } from '../../ui/ink/sprites';
import { grazeInSmallArea, livingSprite, wanderInSmallArea } from '../../ui/ink/life';
import { GROUND_SCALE, unitScale } from '../../ui/ink/proportion';
import { conquestTravelerArtId } from '../../ui/conquestTravelerStyles';
import {
  footprintRect,
  planSettlementLane,
  planSettlementSatellites,
  type StructureFootprint,
  type StructureRect,
} from './settlementLayout';

function improvementAssetId(type: LandBuildingType): string {
  return `building.improvement-${type === 'communalHall' ? 'communal-hall' : type}`;
}

function expandRect(rect: StructureRect, amount: number): StructureRect {
  return {
    left: rect.left - amount,
    right: rect.right + amount,
    top: rect.top - amount,
    bottom: rect.bottom + amount,
  };
}

function unionRects(rects: ReadonlyArray<StructureRect>): StructureRect {
  return rects.reduce((result, rect) => ({
    left: Math.min(result.left, rect.left),
    right: Math.max(result.right, rect.right),
    top: Math.min(result.top, rect.top),
    bottom: Math.max(result.bottom, rect.bottom),
  }));
}

export class SettlementRenderer {
  /** Buildable seat per province. The hexes never move, so this is resolved once per map. */
  private readonly seatCache = new Map<string, { x: number; y: number }>();
  private seatCacheSeed?: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly mapItems: MapItemRenderer,
    private readonly palette: MapThemePalette,
  ) {}

  /** Average pixel position of a land's city/shrine hexes, or undefined if it has none. */
  getCityCenter(state: GameState, land: Land): { x: number; y: number } | undefined {
    const hexSize = state.mapConfig.hexSize;
    let sumX = 0;
    let sumY = 0;
    let count = 0;

    for (const tile of state.hexTiles) {
      if (tile.landId !== land.id || (tile.terrain !== 'fortress' && tile.terrain !== 'shrine')) {
        continue;
      }
      const pixel = axialToPixel(tile.coord, hexSize);
      sumX += pixel.x;
      sumY += pixel.y;
      count += 1;
    }

    return count > 0 ? { x: sumX / count, y: sumY / count } : undefined;
  }

  /**
   * Where a province's houses actually stand.
   *
   * A province with walled or holy ground stands on it. A province with neither used to fall back
   * to its **centroid** — and a centroid is an average, so the average of a province made mostly of
   * limestone is a point on the limestone. That is how villages came to be drawn halfway up a
   * cliff: not a depth fault, just a town built somewhere no town can be built.
   *
   * So the centroid is snapped to the nearest hex of the same province that a village could stand
   * on. Every part of the settlement reads from this — the houses, the name plate, the roads, the
   * carts — so they all move together and stay on the same ground.
   */
  getSeatCentre(state: GameState, land: Land): { x: number; y: number } {
    const city = this.getCityCenter(state, land);
    if (city) {
      return city;
    }
    if (this.seatCacheSeed !== state.mapConfig.seed) {
      this.seatCache.clear();
      this.seatCacheSeed = state.mapConfig.seed;
    }
    const cached = this.seatCache.get(land.id);
    if (cached) {
      return cached;
    }

    const hexSize = state.mapConfig.hexSize;
    // A seat on dry ground is not enough. The cluster drawn around it — houses, grove, name plate —
    // spreads well past its own hex, so a town seated right on the bank puts its roofs in the
    // river. Prefer a tile with no water neighbour at all, and only fall back to the waterline if
    // the province has nowhere else to stand.
    const wet = new Set<string>();
    const rough = new Set<string>();
    for (const tile of state.hexTiles) {
      if (tile.terrain === 'water') {
        wet.add(`${tile.coord.q},${tile.coord.r}`);
      } else if (tile.terrain === 'mountains') {
        rough.add(`${tile.coord.q},${tile.coord.r}`);
      }
    }
    const touches = (tile: (typeof state.hexTiles)[number], keys: ReadonlySet<string>): boolean => {
      const { q, r } = tile.coord;
      for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) {
        if (keys.has(`${q + dq},${r + dr}`)) {
          return true;
        }
      }
      return false;
    };

    let best: { x: number; y: number } | undefined;
    let bestDistance = Infinity;
    let dryFallback: { x: number; y: number } | undefined;
    let dryFallbackDistance = Infinity;
    let fallback: { x: number; y: number } | undefined;
    let fallbackDistance = Infinity;
    for (const tile of state.hexTiles) {
      if (tile.landId !== land.id || tile.terrain === 'mountains' || tile.terrain === 'water') {
        continue;
      }
      const pixel = axialToPixel(tile.coord, hexSize);
      const distance = (pixel.x - land.x) ** 2 + (pixel.y - land.y) ** 2;
      if (distance < fallbackDistance) {
        fallbackDistance = distance;
        fallback = pixel;
      }
      if (touches(tile, wet)) {
        continue;
      }
      if (distance < dryFallbackDistance) {
        dryFallbackDistance = distance;
        dryFallback = pixel;
      }
      // Prefer a genuine building site, not merely a non-mountain tile touching a cliff face.
      // This is especially important for mine camps: their machinery used to be planted through
      // the neighbouring massif because the province centroid happened to be closest there.
      if (touches(tile, rough)) continue;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = pixel;
      }
    }
    best = best ?? dryFallback ?? fallback;
    // A province that really is nothing but rock and water keeps its centroid; there is nowhere
    // better to put it, and pretending otherwise would move the town off its own ground.
    const seat = best ?? { x: land.x, y: land.y };
    this.seatCache.set(land.id, seat);
    return seat;
  }

  /** Authored settlement variant used by both drawing and the landscape keep-clear pass. */
  getSettlementAssetId(state: GameState, land: Land): string {
    if (land.type === 'castle' || land.type === 'enemyCastle') {
      return `settlement.citadel-${figureEraFor(state)}`;
    }
    let hasSeatTerrain = false;
    let hasShrine = false;
    for (const tile of state.hexTiles) {
      if (tile.landId !== land.id) continue;
      if (tile.terrain === 'fortress' || tile.terrain === 'shrine') hasSeatTerrain = true;
      if (tile.terrain === 'shrine') hasShrine = true;
    }
    if (hasSeatTerrain) {
      if (land.type === 'market') return 'settlement.market-town';
      if (hasShrine) return 'settlement.shrine-village';
      return 'settlement.village';
    }
    if (land.type === 'farm') return 'settlement.farmstead';
    if (land.type === 'iron') return 'settlement.mine-camp';
    return 'settlement.hamlet';
  }

  /** Radius reserved from terrain scatter/relief around the real displayed compound. */
  getVisualClearance(state: GameState, land: Land): number {
    const metrics = conquestArtDisplayMetrics(this.scene, this.getSettlementAssetId(state, land));
    if (!metrics) return state.mapConfig.hexSize * MAP_SCALE * 1.2;
    return Math.max(28, metrics.width * 0.56 + 18, metrics.height * 0.46 + 16);
  }

  /**
   * Stable road endpoint immediately outside the compound's front entrance.
   *
   * **`toward` fans the gates across the settlement's frontage.** Without it every road to the
   * place began at the identical pixel, so a province with seven neighbours drew seven roads
   * radiating from a single point — a star burst on the ground below the wall, which is the thing
   * that stops a village reading as a village. Real roads meet a settlement along its edge: the
   * one from the east arrives at the east end of the frontage, the one from the west at the west.
   *
   * The offset is the horizontal component of the direction to the other province, scaled to a bit
   * over half the compound's half-width — enough to separate the approaches, not so much that a
   * road ends up beside the buildings rather than in front of them. The vertical exit is unchanged,
   * so every road still leaves below the wall.
   */
  getRoadEntrance(state: GameState, land: Land, toward?: Land): { x: number; y: number } {
    const seat = this.getSeatCentre(state, land);
    const metrics = conquestArtDisplayMetrics(this.scene, this.getSettlementAssetId(state, land));
    // Returned in unscaled map coordinates; TrafficRenderer applies the shared world transform.
    const exit = Math.max(10, (metrics?.bottom ?? 4) + 7) / MAP_SCALE;
    if (!toward) {
      return { x: seat.x, y: seat.y + exit };
    }
    const dx = toward.x - land.x;
    const dy = toward.y - land.y;
    const length = Math.hypot(dx, dy) || 1;
    const halfWidth = ((metrics?.right ?? 30) - (metrics?.left ?? -30)) / 2 / MAP_SCALE;
    return { x: seat.x + (dx / length) * halfWidth * 0.6, y: seat.y + exit };
  }

  /**
   * Cities/temples render one building cluster per "fortress"/"shrine" hex tile they own.
   * Castles get a surrounding wall; markets/temples don't. Built improvements grow density.
   */
  createSettlementCluster(state: GameState, land: Land): Phaser.GameObjects.Container {
    // The seat is built in the century the run has reached. `DongHoMapItemRenderer` passed the
    // literal `'le'` to `citadel`, so the walls have been fifteenth-century in every mode since it
    // was written while the host standing outside them advanced through four dynasties. This is the
    // one place that holds both the state and the drawing, so this is where the era is set.
    const era = figureEraFor(state);
    setDrawnEra(era);

    const cluster = this.scene.add.container(0, 0);
    if (!land.hasVillage) {
      return cluster;
    }

    const hexSize = state.mapConfig.hexSize;
    const cityCoords: HexCoord[] = [];
    let isShrineCity = false;

    for (const tile of state.hexTiles) {
      if (tile.landId !== land.id || (tile.terrain !== 'fortress' && tile.terrain !== 'shrine')) {
        continue;
      }
      cityCoords.push(tile.coord);
      if (tile.terrain === 'shrine') {
        isShrineCity = true;
      }
    }

    if (cityCoords.length === 0) {
      // Offset onto ground a town can be built on — see `getSeatCentre`. The container is placed at
      // the province centroid, so everything drawn here is relative to it, and the seat is drawn at
      // the same point the name plate, the roads and the carts already use.
      const seat = this.getSeatCentre(state, land);
      const at = { x: (seat.x - land.x) * MAP_SCALE, y: (seat.y - land.y) * MAP_SCALE };
      // A land the game calls a castle has to look like one even when the generator gave it no
      // fortress terrain — which is how the player's own capital ended up rendering as a bare
      // handful of huts while every rival seat had walls.
      if (land.type === 'castle' || land.type === 'enemyCastle') {
        const settlementId = `settlement.citadel-${era}`;
        this.addBuildingDecorations(cluster, state, land, at, settlementId);
        if (this.addAuthoredSettlement(cluster, settlementId, at)) {
          return cluster;
        }
        this.mapItems.addCityCluster(cluster, [at], false, 'city');
        return cluster;
      }
      const authored = land.type === 'farm'
        ? 'settlement.farmstead'
        : land.type === 'iron'
          ? 'settlement.mine-camp'
          : 'settlement.hamlet';
      this.addBuildingDecorations(cluster, state, land, at, authored);
      if (!this.addAuthoredSettlement(cluster, authored, at)) {
        this.addResourceCluster(cluster, land, at);
      }
      return cluster;
    }

    const isFortified = land.type === 'castle' || land.type === 'enemyCastle';
    // Collect all hex centers in relative pixel space, sorted back-to-front.
    // addCityCluster renders them all in a single globally Y-sorted pass so
    // buildings from different hexes correctly interleave in depth.
    const centers = [...cityCoords]
      .sort((a, b) => axialToPixel(a, hexSize).y - axialToPixel(b, hexSize).y)
      .map(coord => {
        const pixel = axialToPixel(coord, hexSize);
        return { x: (pixel.x - land.x) * MAP_SCALE, y: (pixel.y - land.y) * MAP_SCALE };
      });

    const anchor = centers[Math.floor(centers.length / 2)];
    const authored = isFortified
      ? `settlement.citadel-${era}`
      : land.type === 'market'
        ? 'settlement.market-town'
        : isShrineCity
          ? 'settlement.shrine-village'
          : 'settlement.village';
    this.addBuildingDecorations(cluster, state, land, anchor, authored);
    if (this.addAuthoredSettlement(cluster, authored, anchor)) {
      return cluster;
    }

    // A composite already contains one coherent yard and entrance. The old city-hex mesh joined
    // every generated fortress cell centre and remained visible through its transparent gaps as
    // broad ghost bands crossing roofs and courtyards. It belongs only to the procedural fallback.
    this.addInterHexRoads(cluster, cityCoords, land, hexSize);

    if (isFortified) {
      this.addCityWall(cluster, cityCoords, land, hexSize);
    }

    this.mapItems.addCityCluster(cluster, centers, isShrineCity, land.type === 'market' ? 'market' : isShrineCity ? 'shrine' : 'city');

    return cluster;
  }

  /** One reviewed composite at the existing seat; tagged so MapScene can bake it like old town ink. */
  private addAuthoredSettlement(
    cluster: Phaser.GameObjects.Container,
    id: string,
    at: { x: number; y: number },
  ): boolean {
    const stamp = conquestArtStamp(this.scene, id, { left: -58, right: 58, top: -58, bottom: 18 });
    if (!stamp) return false;
    const authoredScale = conquestArtAsset(id)?.runtimeScale ?? 1;
    const image = placeStamp(this.scene, stamp, at.x, at.y).setData('conquestSettlementArt', true);
    cluster.add(image);
    this.addLivingPeople(cluster, id, at, authoredScale);
    // Composite art replaces roofs and yards, never the living herd. Keep livestock as independent
    // sprites so the old wandering animation, culling, mirroring, and ground ordering survive.
    const seed = Math.round(at.x * 13 + at.y * 7);
    void unitScale('buffalo', GROUND_SCALE * 0.96);
    const buffaloStamp = bakedBuffalo(this.scene, seed, false);
    const buffalo = livingSprite(
      this.scene,
      buffaloStamp,
      at.x - 34 * authoredScale,
      at.y + 29 * authoredScale,
      GROUND_SCALE * 0.96,
    );
    grazeInSmallArea(
      this.scene,
      buffalo,
      at.x - 34 * authoredScale,
      at.y + 29 * authoredScale,
      12 * authoredScale,
      seed,
      buffaloStamp.nativeFacing,
    );
    cluster.add(buffalo);
    return true;
  }

  /** Architecture stays bakeable; people remain independent live Images with bounded walks. */
  private addLivingPeople(
    cluster: Phaser.GameObjects.Container,
    settlementId: string,
    at: { x: number; y: number },
    authoredScale: number,
  ): void {
    const busy = settlementId.includes('citadel-')
      || settlementId === 'settlement.market-town'
      || settlementId === 'settlement.shrine-village'
      || settlementId === 'settlement.village';
    const roles = busy ? ['life.traveler', 'life.farmer'] : [
      settlementId === 'settlement.farmstead' ? 'life.farmer' : 'life.traveler',
    ];
    const seed = Math.round(at.x * 19 + at.y * 23 + settlementId.length * 101);

    roles.forEach((role, index) => {
      const artId = role === 'life.traveler' ? conquestTravelerArtId(seed, index) : role;
      const personStamp = conquestArtStamp(this.scene, artId) ?? conquestArtStamp(this.scene, role);
      if (!personStamp) return;
      void unitScale(role === 'life.farmer' ? 'farmer' : 'figure', GROUND_SCALE);
      const side = index === 0 ? 1 : -1;
      const homeX = at.x + side * (22 + index * 9) * authoredScale;
      const homeY = at.y + (21 + index * 7) * authoredScale;
      // `livingSprite` selects the matching authored four-frame farmer/traveller sheet. A
      // procedural fallback still resolves to the same single stamped image as before.
      const person = livingSprite(this.scene, personStamp, homeX, homeY, GROUND_SCALE)
        .setData('conquestLivingPerson', true);
      if (role === 'life.traveler') person.setData('conquestTravelerStyle', artId);
      wanderInSmallArea(
        this.scene,
        person,
        homeX,
        homeY,
        (busy ? 13 : 9) * authoredScale,
        seed + index * 137,
        // Both accepted people plates use the art pack's viewer-right convention.
        1,
      );
      cluster.add(person);
    });
  }

  /** Strokes the outer boundary of the city's contiguous hex cluster, following its actual shape. */
  private addCityWall(cluster: Phaser.GameObjects.Container, cityCoords: HexCoord[], land: Land, hexSize: number): void {
    const citySet = new Set(cityCoords.map(hexKey));
    const graphics = this.scene.add.graphics();
    const edges: Array<[number, number, number, number]> = [];

    for (const coord of cityCoords) {
      const pixel = axialToPixel(coord, hexSize);
      const center = { x: (pixel.x - land.x) * MAP_SCALE, y: (pixel.y - land.y) * MAP_SCALE };
      const corners = hexCorners(center, hexSize * MAP_SCALE * 1.18);

      for (let edge = 0; edge < 6; edge += 1) {
        const direction = EDGE_DIRECTIONS[edge];
        const neighborCoord = { q: coord.q + direction.q, r: coord.r + direction.r };
        if (citySet.has(hexKey(neighborCoord))) {
          continue;
        }

        const [x1, y1] = corners[edge];
        const [x2, y2] = corners[(edge + 1) % 6];
        edges.push([x1, y1, x2, y2]);
      }
    }

    this.mapItems.drawCityWall(graphics, edges);
    cluster.add(graphics);
  }

  /**
   * Places completed buildings inside one compact, irregular settlement plan.
   *
   * The seat is the only safe origin: a province centroid may lie in water or limestone. Additions
   * sort independently against the compound and surrounding relief at their own ground lines.
   * A wall is treated as an enclosure around an unwalled settlement.
   */
  private addBuildingDecorations(
    cluster: Phaser.GameObjects.Container,
    state: GameState,
    land: Land,
    at: { x: number; y: number },
    settlementId: string,
  ): void {
    const isCitadel = settlementId.includes('citadel-');
    const seed = [...land.id].reduce((sum, char) => sum + char.charCodeAt(0), state.mapConfig.seed);
    const mirror: 1 | -1 = seed % 2 === 0 ? 1 : -1;
    const coreMetrics = conquestArtDisplayMetrics(this.scene, settlementId)
      ?? { left: -38, right: 38, top: -54, bottom: 4, width: 76, height: 58, scale: 1 };
    const coreFootprint: StructureFootprint = coreMetrics;
    const coreRect = footprintRect(at.x, at.y, coreFootprint, 3);
    const hasEnclosure = !isCitadel && land.buildings.some((building) => building.type === 'wall');
    let layoutCore = hasEnclosure ? expandRect(coreRect, 9) : coreRect;
    const lanes = this.scene.add.graphics().setData('conquestGroundSurface', true);

    // A wall is one connected enclosure around the existing compound. It is not a detached gate
    // dropped into a courtyard, and a citadel never receives a second wall inside its own walls.
    let enclosureRect: StructureRect | undefined;
    if (hasEnclosure) {
      const desiredHeight = coreMetrics.height + 17;
      const desiredWidth = Math.max(coreMetrics.width + 20, desiredHeight * 1.92);
      const enclosureBox = {
        left: -desiredWidth / 2,
        right: desiredWidth / 2,
        top: -desiredHeight + 7,
        bottom: 7,
      };
      const enclosure = conquestArtStamp(
        this.scene,
        'building.improvement-wall',
        enclosureBox,
        { sizing: 'fit-bounds' },
      );
      if (enclosure) {
        const image = placeStamp(this.scene, enclosure, at.x, at.y + 3)
          .setData('conquestStructureRole', 'enclosure');
        cluster.add(image);
        const metrics = conquestArtDisplayMetrics(
          this.scene,
          'building.improvement-wall',
          enclosureBox,
          { sizing: 'fit-bounds' },
        );
        if (metrics) {
          enclosureRect = footprintRect(at.x, at.y + 3, metrics, 2);
          layoutCore = unionRects([layoutCore, enclosureRect]);
        }
      }
    }

    const satellites = land.buildings
      .filter((building) => building.type !== 'wall')
      .map((building) => {
        const id = improvementAssetId(building.type);
        const metrics = conquestArtDisplayMetrics(
          this.scene,
          id,
          { left: -19, right: 19, top: -28, bottom: 6 },
        ) ?? { left: -10, right: 10, top: -16, bottom: 2, width: 20, height: 18, scale: 1 };
        return { value: building.type, footprint: metrics as StructureFootprint };
      });
    const labelY = isCitadel ? 58 : LABEL_KEEP_OUT.y;
    const labelKeepOut: StructureRect = {
      left: at.x - LABEL_KEEP_OUT.rx,
      right: at.x + LABEL_KEEP_OUT.rx,
      top: at.y + labelY - LABEL_KEEP_OUT.ry,
      bottom: at.y + labelY + LABEL_KEEP_OUT.ry,
    };
    const placed = planSettlementSatellites(
      layoutCore,
      labelKeepOut,
      satellites,
      mirror,
      (x, y) => this.isBuildableSatellite(state, land, x, y),
    );

    placed.forEach((building, index) => {
      // The route, its mouth and its corners are all `planSettlementLane`'s — see there for why a
      // lane bends and why no two of them leave from the same brick.
      const path = planSettlementLane(
        layoutCore,
        { x: building.x, y: building.y },
        { frontY: layoutCore.bottom + 3 },
      );
      brushStroke(lanes, path, 2.0, this.palette.cityRoad.bed, 0.18, seed + index * 31);
      brushStroke(lanes, path, 0.72, this.palette.cityRoad.track, 0.20, seed + index * 31 + 7);
    });

    // MapScene lifts these into scene order: lanes under the terrain band, satellites at their
    // own foot lines. Container insertion order cannot sort a house against an outside mountain.
    cluster.add(lanes);
    for (const building of placed) {
      const glyphs = this.mapItems.createBuildingGlyph(building.value, building.x, building.y);
      for (const glyph of glyphs) {
        glyph.setData('conquestStructureRole', 'satellite')
          // Procedural glyphs draw at local coordinates inside a Graphics at (0, 0).
          // Images use their measured ink base instead when lifted into the scene.
          .setData('conquestGroundFootY', building.y);
      }
      cluster.add(glyphs);
    }

    const occupied = [coreRect, ...(enclosureRect ? [enclosureRect] : []), ...placed.map(({ rect }) => rect)];
    const bounds = unionRects(occupied);
    cluster.setData('conquestStructureBounds', bounds);
    cluster.setData('conquestStructureRects', occupied);
    cluster.setData('conquestCollisionCore', layoutCore);
    cluster.setData('conquestSatelliteRects', placed.map(({ rect }) => rect));
    cluster.setData('conquestLabelOffset', Math.max(labelY, bounds.bottom - at.y + 15));
  }

  /** True when a satellite anchor belongs to this province and is not water or bare limestone. */
  private isBuildableSatellite(state: GameState, land: Land, localX: number, localY: number): boolean {
    const worldX = land.x + localX / MAP_SCALE;
    const worldY = land.y + localY / MAP_SCALE;
    let nearest: (typeof state.hexTiles)[number] | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const tile of state.hexTiles) {
      const centre = axialToPixel(tile.coord, state.mapConfig.hexSize);
      const distance = (centre.x - worldX) ** 2 + (centre.y - worldY) ** 2;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = tile;
      }
    }
    return nearest?.landId === land.id && nearest.terrain !== 'water' && nearest.terrain !== 'mountains';
  }

  /**
   * Draws a dirt/stone road between every pair of adjacent city hexes in the cluster.
   * Added before building groups so roads appear beneath buildings.
   */
  private addInterHexRoads(
    cluster: Phaser.GameObjects.Container,
    cityCoords: HexCoord[],
    land: Land,
    hexSize: number,
  ): void {
    if (cityCoords.length < 2) return;

    const graphics = this.scene.add.graphics().setData('conquestGroundSurface', true);
    const maxAdjacentDist = hexSize * MAP_SCALE * 2.1;
    const { cityRoad } = this.palette;

    const segments: Array<[number, number, number, number]> = [];
    for (let i = 0; i < cityCoords.length; i += 1) {
      for (let j = i + 1; j < cityCoords.length; j += 1) {
        const pA = axialToPixel(cityCoords[i], hexSize);
        const pB = axialToPixel(cityCoords[j], hexSize);
        const ax = (pA.x - land.x) * MAP_SCALE;
        const ay = (pA.y - land.y) * MAP_SCALE;
        const bx = (pB.x - land.x) * MAP_SCALE;
        const by = (pB.y - land.y) * MAP_SCALE;
        if (Math.hypot(ax - bx, ay - by) > maxAdjacentDist) continue;
        segments.push([ax, ay, bx, by]);
      }
    }

    if (this.mapItems.drawCityRoad) {
      this.mapItems.drawCityRoad(graphics, segments);
    } else {
      for (const [ax, ay, bx, by] of segments) {
        const seed = Math.round(ax + ay * 3 + bx * 7 + by * 11);
        brushStroke(graphics, [{ x: ax, y: ay }, { x: bx, y: by }], 5, cityRoad.bed, 0.55, seed);
        brushStroke(graphics, [{ x: ax, y: ay }, { x: bx, y: by }], 2.5, cityRoad.track, 0.5, seed + 53);
      }
    }

    cluster.add(graphics);
  }

  /** Lands without a fortress/shrine hex cluster (farms, iron mines) get a small themed village instead. */
  private addResourceCluster(
    cluster: Phaser.GameObjects.Container,
    land: Land,
    at: { x: number; y: number },
  ): void {
    const developmentLevel = land.buildings.length;
    const scale = 1 + developmentLevel * 0.15;

    if (land.type === 'farm') {
      cluster.add(this.mapItems.createFarmCluster(scale, developmentLevel).setPosition(at.x, at.y));
    } else if (land.type === 'iron') {
      cluster.add(this.mapItems.createMineCluster(scale, developmentLevel).setPosition(at.x, at.y));
    } else {
      this.mapItems.addBuildingGroup(cluster, at.x, at.y, false, Math.min(6, 2 + developmentLevel));
    }
  }
}
