import Phaser from 'phaser';
import { wantsPaperFX } from '../../game/graphicsQuality';

/**
 * The paper the whole game is printed on.
 *
 * A post-effect does what no amount of per-object drawing can: it ages the entire frame at once,
 * including the UI drawn over the map, so the chrome and the world share one sheet instead of
 * sitting in two different worlds. Four things, all cheap:
 *
 *  · laid-paper fibre, a fine directional noise
 *  · slow tea-staining that drifts, so a still screen is never quite still
 *  · a vignette, because paper darkens at the edge of the press
 *  · shell warmth in patches — the điệp coat catching the light
 *
 * One full-screen pass at 390×844. Gated off behind `?nofx=1`, alongside the existing `?nobake=1`,
 * so a device that cannot afford it — or a bug hunt that needs it out of the way — can drop it.
 *
 * Phaser 4 split what used to be one `PostFXPipeline` into two objects, and the split is the whole
 * of this file's shape: a **RenderNode** owns the shader and is registered once with the renderer,
 * and a **Controller** owns the state and is attached per camera. The GLSL below is unchanged from
 * the v3 pipeline — v4 filter shaders still take `uMainSampler` and `outTexCoord`.
 */

/** Registered with the renderer under this name; the controller asks for it by the same name. */
export const PAPER_FX_KEY = 'PaperFX';

const FRAGMENT = `
#pragma phaserTemplate(shaderName)

precision mediump float;

uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uTime;
uniform float uStrength;

varying vec2 outTexCoord;

// Cheap value noise. Good enough for grain, and far cheaper than anything gradient-based.
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

void main() {
  vec2 uv = outTexCoord;
  vec4 src = texture2D(uMainSampler, uv);

  // Laid fibre. Stretched along the sheet so it reads as paper rather than as television snow —
  // but only mildly, because a hard stretch turns the whole screen into corduroy.
  float fibre = valueNoise(uv * vec2(uResolution.x * 0.55, uResolution.y * 0.34));
  float speck = valueNoise(uv * uResolution.xy * 0.75);
  float grain = mix(0.985, 1.014, fibre * 0.65 + speck * 0.35);

  // Tea-staining, drifting slowly enough that nobody sees it move.
  float blot = valueNoise(uv * 3.2 + vec2(uTime * 0.006, uTime * 0.004));

  // The press darkens toward the edge of the sheet.
  vec2 centred = uv - 0.5;
  float vignette = 1.0 - 0.22 * pow(clamp(length(centred) * 1.38, 0.0, 1.0), 2.2);

  vec3 diep = vec3(0.949, 0.925, 0.855);
  vec3 aged = src.rgb * grain * vignette;
  aged = mix(aged, aged * diep, blot * 0.16);

  gl_FragColor = vec4(mix(src.rgb, aged, uStrength), src.a);
}
`;

/**
 * The state, one per camera wearing the paper.
 *
 * The clock lives here rather than on the node because the node is shared by every camera, and a
 * shared clock would tick once per camera per frame — the tea-stain would drift at two or three
 * times its intended speed the moment a second scene came up. Per-camera means each scene ages at
 * the same rate, which is what v3's single pipeline instance did by accident.
 */
export class PaperFXController extends Phaser.Filters.Controller {
  elapsed = 0;
  /** 0 disables the effect without removing the filter, so it can be toggled at runtime. */
  strength = 1;

  constructor(camera: Phaser.Cameras.Scene2D.Camera) {
    super(camera, PAPER_FX_KEY);
  }
}

/** The shader. Registered once with the renderer; every controller above points at it by name. */
export class PaperFXNode extends Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader {
  constructor(manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager) {
    super(PAPER_FX_KEY, manager, undefined, FRAGMENT);
  }

  setupUniforms(
    controller: PaperFXController,
    drawingContext: Phaser.Renderer.WebGL.DrawingContext,
  ): void {
    controller.elapsed += 1;
    const programManager = this.programManager;
    programManager.setUniform('uTime', controller.elapsed);
    programManager.setUniform('uStrength', controller.strength);
    // The drawing context, not the renderer: a filter's input is the framebuffer it was handed,
    // which for an external filter is the screen but need not be.
    programManager.setUniform('uResolution', [drawingContext.width, drawingContext.height]);
  }
}

/** True unless the run asked for the effect to be left off. */
export function paperFxEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return wantsPaperFX() && !/[?&]nofx=1\b/.test(window.location.search);
}

/**
 * Puts the paper on a scene's camera.
 *
 * Safe to call on a scene whose renderer is Canvas or whose context is gone — a post-effect that
 * throws during boot would take the whole game with it, and the game looks perfectly fine without
 * this pass. Under Canvas there is no `renderNodes` at all, which is the check below.
 *
 * `external` rather than `internal`: an external filter runs after the camera transform, over the
 * whole screen, which is the entire point — the map and the chrome drawn over it have to come off
 * the same sheet. An internal filter would age each camera's own region separately and the seam
 * between MapScene and UIScene would show.
 */
export function applyPaperFX(scene: Phaser.Scene): void {
  if (!paperFxEnabled()) {
    return;
  }
  try {
    const renderer = scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    const nodes = renderer?.renderNodes;
    if (!nodes) {
      return;
    }
    // Registration is per renderer, not per scene, so the first scene through does it and the
    // rest find it already there.
    if (!nodes.hasNode(PAPER_FX_KEY)) {
      nodes.addNodeConstructor(PAPER_FX_KEY, PaperFXNode);
    }
    const camera = scene.cameras.main;
    camera.filters.external.add(new PaperFXController(camera));
  } catch (error) {
    console.warn('PaperFX unavailable; drawing without it:', error);
  }
}
