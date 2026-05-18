/**
 * LightingSystem
 * Encapsulates all scene lighting with a physically-based day/night cycle.
 *
 * Visual impact:
 *  - HemisphereLight (sky #87CEEB / ground #8B7355) — realistic sky/bounce colour
 *  - DirectionalLight as sun with 2048 shadow maps — crisp terrain shadows
 *  - Moon DirectionalLight — cool blue night fill
 *  - Atmospheric PointLight at twilight — warm sunset glow on ground
 *  - Dynamic colour temperature shift (warm noon → cool night)
 */

import * as THREE from 'three';

// ── Named constants ──────────────────────────────────────────────────────────

const SUN_SHADOW_MAP_SIZE = 2048;
const SUN_SHADOW_CAMERA   = 220;
const SUN_SHADOW_BIAS     = -0.001;

const DAY_SKY_COLOR      = new THREE.Color(0x87ceeb);
const DAY_GROUND_COLOR   = new THREE.Color(0x8b7355);
const NIGHT_SKY_COLOR    = new THREE.Color(0x080c1a);
const NIGHT_GROUND_COLOR = new THREE.Color(0x141008);

const SUN_DAY_COLOR      = new THREE.Color(0xfff5e0);
const SUN_SUNSET_COLOR   = new THREE.Color(0xff8833);
const MOON_COLOR         = new THREE.Color(0x8899cc);
const TWILIGHT_GLOW_COLOR= new THREE.Color(0xff5500);

// ────────────────────────────────────────────────────────────────────────────

export interface LightingState {
  dayT:     number;   // 0 = night, 1 = full day
  twilight: number;   // 0-1 transition band around sunrise/sunset
  nightT:   number;   // 0 = day, 1 = full night
  sunDir:   THREE.Vector3;
}

export class LightingSystem {
  readonly hemi:    THREE.HemisphereLight;
  readonly sun:     THREE.DirectionalLight;
  readonly moon:    THREE.DirectionalLight;
  readonly sunGlow: THREE.PointLight;

  constructor(scene: THREE.Scene) {
    // Sky / bounce hemisphere — biggest ambient contribution
    this.hemi = new THREE.HemisphereLight(DAY_SKY_COLOR, DAY_GROUND_COLOR, 0.55);
    scene.add(this.hemi);

    // Sun — primary directional light, casts shadows
    this.sun = new THREE.DirectionalLight(SUN_DAY_COLOR, 1.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SUN_SHADOW_MAP_SIZE, SUN_SHADOW_MAP_SIZE);
    this.sun.shadow.camera.near   = 1;
    this.sun.shadow.camera.far    = 700;
    this.sun.shadow.camera.left   = -SUN_SHADOW_CAMERA;
    this.sun.shadow.camera.right  =  SUN_SHADOW_CAMERA;
    this.sun.shadow.camera.top    =  SUN_SHADOW_CAMERA;
    this.sun.shadow.camera.bottom = -SUN_SHADOW_CAMERA;
    this.sun.shadow.bias          = SUN_SHADOW_BIAS;
    scene.add(this.sun);

    // Moon — cool blue night fill light
    this.moon = new THREE.DirectionalLight(MOON_COLOR, 0.0);
    scene.add(this.moon);

    // Atmospheric sunset/sunrise glow on the ground
    this.sunGlow = new THREE.PointLight(TWILIGHT_GLOW_COLOR, 0, 600);
    this.sunGlow.position.set(0, 25, 0);
    scene.add(this.sunGlow);
  }

  /**
   * Called every frame by World.update().
   * Updates all light positions, intensities, and colours based on time of day.
   */
  update(state: LightingState) {
    const { dayT, twilight, nightT, sunDir } = state;

    // ── Sun position ────────────────────────────────────────────────────────
    this.sun.position.copy(sunDir.clone().multiplyScalar(320));
    this.moon.position.copy(sunDir.clone().multiplyScalar(-320));

    // ── Sun intensity + colour temperature ──────────────────────────────────
    this.sun.intensity = 0.08 + dayT * 1.42;
    // Warm yellow noon → burnt orange at sunset
    const sunColour = new THREE.Color().lerpColors(SUN_SUNSET_COLOR, SUN_DAY_COLOR, dayT);
    this.sun.color.copy(sunColour);

    // ── Moon intensity ───────────────────────────────────────────────────────
    this.moon.intensity = Math.max(0, -sunDir.y * 0.5) * nightT;

    // ── Twilight ground glow ─────────────────────────────────────────────────
    const twilightStrength = Math.max(0, 1 - twilight / 0.8) * (1 - dayT * 2 + 0.1);
    this.sunGlow.intensity = twilightStrength * 0.7;
    this.sunGlow.position.set(sunDir.x * 55, 20, sunDir.z * 55);

    // ── Hemisphere – sky and ground blend ───────────────────────────────────
    this.hemi.color.lerpColors(NIGHT_SKY_COLOR, DAY_SKY_COLOR, dayT);
    this.hemi.groundColor.lerpColors(NIGHT_GROUND_COLOR, DAY_GROUND_COLOR, dayT);
    this.hemi.intensity = 0.18 + dayT * 0.55;
  }
}
