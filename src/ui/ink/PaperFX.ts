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
 */

const FRAGMENT = `
#define SHADER_NAME PAPER_FX

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

export class PaperFX extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  private elapsed = 0;
  /** 0 disables the effect without removing the pipeline, so it can be toggled at runtime. */
  strength = 1;

  constructor(game: Phaser.Game) {
    super({ game, fragShader: FRAGMENT } as Phaser.Types.Renderer.WebGL.WebGLPipelineConfig);
  }

  onPreRender(): void {
    this.elapsed += 1;
    this.set1f('uTime', this.elapsed);
    this.set1f('uStrength', this.strength);
    this.set2f('uResolution', this.renderer.width, this.renderer.height);
  }
}

export const PAPER_FX_KEY = 'PaperFX';

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
 * this pass.
 */
export function applyPaperFX(scene: Phaser.Scene): void {
  if (!paperFxEnabled()) {
    return;
  }
  try {
    const renderer = scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    if (!renderer?.pipelines) {
      return;
    }
    // `addPostPipeline` is idempotent per key, and registering it in the game config already
    // covers the common path; this is the belt for a scene created before that ran.
    if (!renderer.pipelines.has(PAPER_FX_KEY)) {
      renderer.pipelines.addPostPipeline(PAPER_FX_KEY, PaperFX);
    }
    scene.cameras.main.setPostPipeline(PaperFX);
  } catch (error) {
    console.warn('PaperFX unavailable; drawing without it:', error);
  }
}
