/**
 * PostProcessingPipeline
 * Full screen-space effects pipeline using the `postprocessing` library.
 * Order: RenderPass → NormalPass → SSAO → Bloom + DoF + Vignette + SMAA
 *
 * Visual impact summary:
 *  - SSAO     : contact shadows in terrain crevices, under mobs — adds huge depth
 *  - Bloom    : loot gems / fire / sun disc glow naturally — AAA feel
 *  - DoF      : subtle focus falloff past ~20 units — cinematic
 *  - Vignette : darkens edges — focuses attention on centre
 *  - SMAA     : high-quality AA without TAA blur — sharp + smooth
 */

import * as THREE from 'three';
import {
  BlendFunction,
  BloomEffect,
  DepthOfFieldEffect,
  EffectComposer,
  EffectPass,
  KernelSize,
  NormalPass,
  RenderPass,
  SMAAEffect,
  SSAOEffect,
  VignetteEffect,
} from 'postprocessing';

// ── Tuning constants ────────────────────────────────────────────────────────

const BLOOM_INTENSITY          = 1.5;
const BLOOM_LUMINANCE_THRESHOLD = 0.58;
const BLOOM_LUMINANCE_SMOOTHING = 0.03;

const SSAO_SAMPLES    = 11;
const SSAO_RINGS      = 4;
const SSAO_RADIUS     = 18;
const SSAO_BIAS       = 0.55;
const SSAO_INTENSITY  = 1.3;

const DOF_FOCAL_LENGTH = 0.048;
const DOF_BOKEH_SCALE  = 2.2;

const VIGNETTE_OFFSET   = 0.38;
const VIGNETTE_DARKNESS = 0.45;

// ────────────────────────────────────────────────────────────────────────────

export class PostProcessingPipeline {
  private composer: EffectComposer;
  readonly dofEffect: DepthOfFieldEffect;
  readonly bloomEffect: BloomEffect;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ) {
    // HDR framebuffer so bloom doesn't clip at 1.0
    this.composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType,
    });

    // ── Pass 1: Render scene ────────────────────────────────────────────────
    this.composer.addPass(new RenderPass(scene, camera));

    // ── Pass 2: Surface normals (needed by SSAO) ────────────────────────────
    const normalPass = new NormalPass(scene, camera);
    this.composer.addPass(normalPass);

    // ── Pass 3: SSAO ────────────────────────────────────────────────────────
    // Darkens contact areas between objects and terrain — ground truth depth
    const ssaoEffect = new SSAOEffect(camera, normalPass.texture, {
      blendFunction: BlendFunction.MULTIPLY,
      samples:       SSAO_SAMPLES,
      rings:         SSAO_RINGS,
      radius:        SSAO_RADIUS,
      bias:          SSAO_BIAS,
      intensity:     SSAO_INTENSITY,
      luminanceInfluence: 0.7,
      resolutionScale: 0.5,       // half-res for performance
      color: new THREE.Color(0x000000),
    });
    this.composer.addPass(new EffectPass(camera, ssaoEffect));

    // ── Pass 4: Bloom + DoF + Vignette + SMAA ──────────────────────────────

    // Bloom: loot gems, sun disc, fire all emit light realistically
    this.bloomEffect = new BloomEffect({
      blendFunction:      BlendFunction.ADD,
      mipmapBlur:         true,
      intensity:          BLOOM_INTENSITY,
      luminanceThreshold: BLOOM_LUMINANCE_THRESHOLD,
      luminanceSmoothing: BLOOM_LUMINANCE_SMOOTHING,
      kernelSize:         KernelSize.MEDIUM,
    });

    // Depth of Field: subtle bokeh blur beyond focal distance
    this.dofEffect = new DepthOfFieldEffect(camera, {
      focusDistance: 0.0,
      focalLength:   DOF_FOCAL_LENGTH,
      bokehScale:    DOF_BOKEH_SCALE,
      height:        480,
    });

    // Vignette: cinematic frame darkening
    const vignetteEffect = new VignetteEffect({
      offset:    VIGNETTE_OFFSET,
      darkness:  VIGNETTE_DARKNESS,
    });

    // SMAA: sub-pixel morphological AA — must be last to sharpen everything
    const smaaEffect = new SMAAEffect();

    this.composer.addPass(
      new EffectPass(camera, this.bloomEffect, this.dofEffect, vignetteEffect, smaaEffect),
    );
  }

  /** Call each frame instead of renderer.render() */
  render(delta: number) {
    this.composer.render(delta);
  }

  /** Call on window resize */
  setSize(width: number, height: number) {
    this.composer.setSize(width, height);
  }
}
