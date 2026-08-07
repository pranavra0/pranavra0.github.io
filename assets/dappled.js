(() => {
  "use strict";

  /*
   * Dappled is split into five layers:
   *
   *   config       what the scene should look like
   *   tree         a seeded, recursive branch generator
   *   landscape    a seeded horizon generator
   *   shader       semantic materials, noise, dithering, and tone mapping
   *   renderer     WebGL buffers and uniforms
   *   controller   animation, input, resize, and the public API
   *
   * Start tuning in SCENE_PRESETS or through window.dappled.set().
   * For example:
   *
   *   dappled.set({ detailField: { scale: 11 } });
   *   dappled.set({ tree: { forkProbability: 0.4 } });
   *   dappled.set({ structure: { layers: [{ type: "rings", preset: "giantPlanet" }] } });
   *   dappled.setScene("alienValley");
   *   dappled.reseed();
   */

  const canvas = document.querySelector(".dappled-background");
  if (!canvas) return;

  // The segment texture and shader loop are compile-time constraints.
  // Each row packs start, end, widths, then depth/material as 16-bit pairs.
  const MAX_SEGMENTS = 320;
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  const SEGMENT_MATERIALS = Object.freeze({
    structure: 0,
    ink: 1,
    glow: 2,
    atmosphere: 3,
  });

  /**
   * Tunable values are grouped by the thing they control:
   *
   * render.pixelScale       Lower values mean larger, chunkier pixels.
   * palette                 Colors assigned to the segment materials.
   * detailField             Fine procedural detail and its contrast.
   * macroField              Large-scale procedural tone variation.
   * shadows                 Structure blur, detail density, and depth behavior.
   * tone                    Mapping from physical-ish light to palette tones.
   * composition             Keeps the central title area intentionally quiet.
   * motion                  Wind and parallax response.
   * structure                A composable list of seeded geometry layers.
   * tree / landscape        Generator-specific geometry settings.
   */
  const DEFAULT_CONFIG = {
    scene: "canopy",
    structure: {
      layers: [
        { type: "tree", preset: "canopy" },
      ],
    },
    render: {
      pixelScale: 2.5,
      widthScale: 0.08,
    },
    palette: {
      light: null,
      mid: null,
      shadow: null,
      background: null,
      structure: null,
      ink: null,
      glow: null,
      atmosphere: null,
    },
    detailField: {
      scale: 10.5,
      driftX: 0.018,
      driftY: 0.006,
      softness: 0.05,
      depthSoftness: 0.30,
      thresholdNear: 0.84,
      thresholdFar: 0.48,
      shadowStrength: 0.60,
    },
    macroField: {
      scale: 0.42,
      drift: 0.004,
      strength: 1.0,
    },
    caustics: {
      scale: 4.6,
      warpScale: 1.15,
      warpAmount: 0.72,
      speed: 0.18,
      contrast: 1.35,
      intensity: 1.0,
      rippleScale: 4.2,
      rippleSpeed: 2.8,
      rippleDecay: 0.90,
    },
    windowLight: {
      beamWidth: 0.17,
      beamLength: 1.18,
      slant: 0.18,
      sway: 0.022,
      parallax: 0.085,
      softness: 0.018,
      intensity: 1.0,
    },
    shadows: {
      penumbraBase: 0.006,
      penumbraDepth: 0.055,
      structureParallax: 0.035,
      structureWind: 0.012,
      structureInk: 0.38,
      detailParallax: 0.10,
    },
    tone: {
      base: 0.05,
      range: 0.46,
      lightStart: 0.20,
      lightEnd: 0.72,
      fringeStart: 0.23,
      fringePeak: 0.36,
      fringeEnd: 0.54,
      fringeReturn: 0.40,
      centerDip: 0.12,
      variation: 0.08,
    },
    composition: {
      centerX: 0.50,
      centerY: 0.50,
      centerAspect: 1.0,
      centerRadius: 0.05,
      centerFalloff: .25,
      centerShadow: 1.0,
      centerDetailVisibility: 0.0,
      centerStructureVisibility: 0.0,
      centerVisibility: 0.0,
      centerWarpScale: 1.10,
      centerWarpAmount: 0.0,
    },
    motion: {
      windBase: .75,
      windPulse: .20,
      windPulseSpeed: .27,
      windFlutter: .08,
      windFlutterSpeed: 0.13,
      parallaxSmoothing: 0.06,
    },
    tree: {
      count: 5,
      rootEdges: ["left", "right", "bottom"],
      rootEdgeYMinimum: -1.62,
      rootEdgeYMaximum: 0.86,
      minimumWidth: 0.0025,
      maximumDepth: 11,
      lengthScale: 10.8,
      maximumLength: 0.17,
      lengthMinimum: 0.84,
      lengthVariation: 0.32,
      widthDecayMinimum: 0.84,
      widthDecayVariation: 0.035,
      areaConservation: 0.94,
      forkProbability: 0.76,
      forkAfterDepth: 1,
      secondSideProbability: .1,
      leaderAreaMinimum: 0.57,
      leaderAreaVariation: 0.10,
      angleJitter: 0.08,
      curl: .56,
      sideAngle: 1.38,
      sideAngleThinness: .50,
      sideAngleJitter: 0.14,
      leaderDepthJitter: 0.06,
      sideDepthJitter: 0.22,
      rootXMinimum: 0.18,
      rootXMaximum: 0.82,
      rootXJitter: 0.12,
      rootY: 1.08,
      rootYJitter: 0.05,
      rootAngleJitter: 0.32,
      rootWidth: 0.014,
      rootWidthVariation: 0.24,
      rootDepth: 0.08,
      rootDepthVariation: 1.25,
    },
    landscape: {
      layerCount: 4,
      segmentsPerLayer: 48,
      horizon: 0.22,
      layerSpacing: 0.15,
      amplitude: 0.12,
      frequency: 1.35,
      roughness: 0.58,
      width: 0.018,
      widthVariation: 0.42,
      depthMinimum: 0.26,
      depthStep: 0.22,
    },
    rings: {
      ringCount: 3,
      ringSegments: 64,
      ringRadius: 1.18,
      ringRadiusStep: 0.085,
      ringCenterY: -0.46,
      ringJitter: 0.018,
      ringWidth: 0.014,
    },
  };

  const TREE_PRESETS = {
    canopy: {
      rootEdges: ["left", "right", "top"],
    },
    foregroundRoots: {
      count: 2,
      rootEdges: ["left", "right"],
    },
  };
  const LANDSCAPE_PRESETS = {
    distantMountains: {
      layerCount: 4,
      depthMinimum: 0.42,
      amplitude: 0.15,
    },
  };
  const RING_PRESETS = {
    giantPlanet: {
      ringCount: 3,
      ringRadius: 1.18,
      ringCenterY: -0.46,
    },
  };

  const STRUCTURE_PRESETS = {
    tree: TREE_PRESETS,
    landscape: LANDSCAPE_PRESETS,
    rings: RING_PRESETS,
  };

  // Scenes compose reusable generator presets. Unspecified values inherit from defaults.
  const SCENE_PRESETS = {
    canopy: {
      render: {
        pixelScale: 2.0,
        widthScale: 0.10,
      },
      detailField: {
        scale: 11.0,
        thresholdNear: 0.80,
        thresholdFar: 0.40,
        shadowStrength: 0.48,
      },
      shadows: {
        penumbraBase: 0.006,
        penumbraDepth: 0.060,
        structureParallax: 0.040,
        structureWind: 0.010,
        structureInk: 0.18,
        detailParallax: 0.10,
      },
      tone: {
        base: 0.025,
        range: 0.58,
        lightStart: 0.24,
        lightEnd: 0.76,
        fringeStart: 0.30,
        fringePeak: 0.42,
        fringeEnd: 0.58,
        fringeReturn: 0.44,
        centerDip: 0.0,
        variation: 0.06,
      },
      composition: {
        centerAspect: 1.5,
      },
      motion: {
        windBase: 0.35,
        windPulse: 0.12,
        windFlutter: 0.06,
      },
      tree: {
        count: 5,
        rootEdges: ["top", "left"],
        rootEdgeYMinimum: 0.30,
        rootEdgeYMaximum: 0.80,
        minimumWidth: 0.0010,
        maximumDepth: 12,
        lengthScale: 16.0,
        maximumLength: 0.32,
        lengthMinimum: 0.85,
        lengthVariation: 0.30,
        widthDecayMinimum: 0.97,
        widthDecayVariation: 0.0,
        areaConservation: 0.95,
        forkProbability: 0.70,
        forkAfterDepth: 0,
        secondSideProbability: 0.30,
        leaderAreaMinimum: 0.57,
        leaderAreaVariation: 0.10,
        angleJitter: 0.05,
        curl: 0.30,
        sideAngle: 0.35,
        sideAngleThinness: 0.55,
        sideAngleJitter: 0.15,
        leaderDepthJitter: 0.10,
        sideDepthJitter: 0.40,
        rootXMinimum: 0.08,
        rootXMaximum: 0.42,
        rootXJitter: 0.15,
        rootAngleJitter: 0.60,
        rootWidth: 0.032,
        rootWidthVariation: 0.20,
        rootDepth: 0.04,
        rootDepthVariation: 0.40,
      },
    },
    caustics: {
      scene: "caustics",
      structure: {
        layers: [],
      },
      render: {
        pixelScale: 2.25,
        widthScale: 0.10,
      },
      palette: {
        light: "#bcefe7",
        mid: "#367f83",
        shadow: "#102f39",
        background: "#061419",
        structure: "#061419",
        ink: "#061419",
        glow: "#83d8d1",
        atmosphere: "#2d6570",
      },
      detailField: {
        scale: 8.0,
        driftX: 0.01,
        driftY: 0.004,
      },
      macroField: {
        scale: 0.25,
        drift: 0.01,
        strength: 0.24,
      },
      caustics: {
        scale: 4.8,
        warpScale: 1.2,
        warpAmount: 0.86,
        speed: 0.20,
        contrast: 1.48,
        intensity: 1.25,
        rippleScale: 4.0,
        rippleSpeed: 3.0,
        rippleDecay: 0.86,
      },
      tone: {
        base: 0.035,
        range: 0.86,
        lightStart: 0.28,
        lightEnd: 0.70,
        fringeStart: 0.20,
        fringePeak: 0.33,
        fringeEnd: 0.55,
        fringeReturn: 0.39,
        centerDip: 0.0,
        variation: 0.03,
      },
      composition: {
        centerRadius: 0.12,
        centerFalloff: 0.38,
        centerShadow: 0.08,
        centerDetailVisibility: 0.30,
        centerVisibility: 0.08,
      },
      motion: {
        windBase: 0.9,
        windPulse: 0.16,
        windPulseSpeed: 0.20,
        windFlutter: 0.06,
        windFlutterSpeed: 0.10,
      },
    },
    windowLight: {
      scene: "windowLight",
      structure: {
        layers: [],
      },
      render: {
        pixelScale: 2.25,
        widthScale: 0.10,
      },
      palette: {
        light: "#f4d8a3",
        mid: "#9a6849",
        shadow: "#272333",
        background: "#0b0d16",
        structure: "#0b0d16",
        ink: "#0b0d16",
        glow: "#e7a85e",
        atmosphere: "#77536a",
      },
      detailField: {
        scale: 7.0,
        driftX: 0.004,
        driftY: 0.002,
      },
      macroField: {
        scale: 0.28,
        drift: 0.004,
        strength: 0.28,
      },
      windowLight: {
        beamWidth: 0.135,
        beamLength: 0.72,
        slant: 0.30,
        sway: 0.026,
        parallax: 0.14,
        softness: 0.026,
        intensity: 1.0,
      },
      tone: {
        base: 0.055,
        range: 0.66,
        lightStart: 0.27,
        lightEnd: 0.68,
        fringeStart: 0.20,
        fringePeak: 0.34,
        fringeEnd: 0.56,
        fringeReturn: 0.41,
        centerDip: 0.0,
        variation: 0.035,
      },
      composition: {
        centerRadius: 0.10,
        centerFalloff: 0.32,
        centerShadow: 0.05,
        centerDetailVisibility: 0.18,
        centerVisibility: 0.10,
      },
      motion: {
        windBase: 0.22,
        windPulse: 0.04,
        windPulseSpeed: 0.12,
        windFlutter: 0.02,
        windFlutterSpeed: 0.08,
      },
    },
    alienValley: {
      structure: {
        layers: [
          { type: "landscape", preset: "distantMountains", material: "atmosphere" },
          { type: "rings", preset: "giantPlanet", material: "glow" },
          { type: "tree", preset: "foregroundRoots", material: "structure" },
        ],
      },
    },
  };


  const vertexSource = `
    attribute vec2 position;
    varying vec2 vUv;

    void main() {
      vUv = position * 0.5 + 0.5;
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `;

  const fragmentSource = `
    precision highp float;

    #define MAX_SEGMENTS ${MAX_SEGMENTS}

    uniform sampler2D uSegments;
    uniform vec2 uResolution;
    uniform vec2 uSeed;
    uniform float uSegmentCount;
    uniform float uPositionScale;
    uniform float uWidthScale;
    uniform float uTime;
    uniform float uWind;
    uniform float uParallax;
    uniform vec3 uLight;
    uniform vec3 uMid;
    uniform vec3 uStructure;
    uniform vec3 uInk;
    uniform vec3 uGlow;
    uniform vec3 uAtmosphere;
    uniform vec3 uShadow;
    uniform vec3 uBackground;

    uniform float uDetailScale;
    uniform float uDetailDriftX;
    uniform float uDetailDriftY;
    uniform float uDetailSoftness;
    uniform float uDetailDepthSoftness;
    uniform float uDetailThresholdNear;
    uniform float uDetailThresholdFar;
    uniform float uDetailShadowStrength;
    uniform float uMacroScale;
    uniform float uMacroDrift;
    uniform float uMacroStrength;
    uniform float uSceneType;
    uniform float uCausticScale;
    uniform float uCausticWarpScale;
    uniform float uCausticWarpAmount;
    uniform float uCausticSpeed;
    uniform float uCausticContrast;
    uniform float uCausticIntensity;
    uniform float uRippleX;
    uniform float uRippleY;
    uniform float uRippleAge;
    uniform float uRippleScale;
    uniform float uRippleSpeed;
    uniform float uRippleDecay;
    uniform float uPointerX;
    uniform float uPointerY;
    uniform float uPointerVelocityX;
    uniform float uPointerVelocityY;
    uniform float uWindowBeamWidth;
    uniform float uWindowBeamLength;
    uniform float uWindowSlant;
    uniform float uWindowSway;
    uniform float uWindowParallax;
    uniform float uWindowSoftness;
    uniform float uWindowIntensity;
    uniform float uWindowSunPhase;

    uniform float uPenumbraBase;
    uniform float uPenumbraDepth;
    uniform float uStructureParallax;
    uniform float uStructureWind;
    uniform float uStructureInk;
    uniform float uDetailParallax;
    uniform float uCenterX;
    uniform float uCenterY;
    uniform float uCenterAspect;
    uniform float uCenterRadius;
    uniform float uCenterFalloff;
    uniform float uCenterShadow;
    uniform float uCenterDetailVisibility;
    uniform float uCenterStructureVisibility;
    uniform float uCenterVisibility;
    uniform float uCenterWarpScale;
    uniform float uCenterWarpAmount;

    uniform float uToneBase;
    uniform float uToneRange;
    uniform float uLightStart;
    uniform float uLightEnd;
    uniform float uFringeStart;
    uniform float uFringePeak;
    uniform float uFringeEnd;
    uniform float uFringeReturn;
    uniform float uCenterDip;
    uniform float uToneVariation;

    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }

    float fbm(vec2 p) {
      float value = 0.0;
      float amplitude = 0.55;
      for (int i = 0; i < 4; i++) {
        value += amplitude * noise(p);
        p = p * 2.02 + 7.0;
        amplitude *= 0.5;
      }
      return value;
    }

    vec2 worley(vec2 point) {
      vec2 cell = floor(point);
      vec2 fraction = fract(point);
      float first = 8.0;
      float second = 8.0;

      for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
          vec2 offset = vec2(float(x), float(y));
          vec2 jitter = vec2(
            hash(cell + offset + vec2(19.1, 7.7)),
            hash(cell + offset + vec2(43.3, 11.9))
          );
          float distanceToCell = length(offset + jitter - fraction);
          if (distanceToCell < first) {
            second = first;
            first = distanceToCell;
          } else if (distanceToCell < second) {
            second = distanceToCell;
          }
        }
      }

      return vec2(first, second);
    }

    float causticField(vec2 uv, float aspect) {
      vec2 point = uv * vec2(aspect, 1.0) * uCausticScale;
      point += vec2(uTime * uCausticSpeed, -uTime * uCausticSpeed * 0.67);

      vec2 warp = vec2(
        fbm(point * uCausticWarpScale + vec2(17.0, 3.0)),
        fbm(point * uCausticWarpScale + vec2(41.0, 29.0))
      ) - 0.5;
      point += warp * uCausticWarpAmount;

      vec2 rippleCenter = vec2(uRippleX, uRippleY);
      vec2 rippleDelta = (uv - rippleCenter) * vec2(aspect, 1.0);
      float rippleDistance = length(rippleDelta);
      float rippleFade = exp(-uRippleAge * uRippleDecay) * exp(-rippleDistance * 2.4);
      float rippleWave = sin(
        rippleDistance * uRippleScale * 14.0 - uRippleAge * uRippleSpeed * 8.0
      ) * rippleFade;
      point += normalize(rippleDelta + vec2(0.0001)) * rippleWave * 0.20;

      vec2 pointer = vec2(uPointerX, uPointerY);
      vec2 pointerDelta = (uv - pointer) * vec2(aspect, 1.0);
      vec2 pointerVelocity = vec2(uPointerVelocityX * aspect, uPointerVelocityY);
      float pointerSpeed = clamp(length(pointerVelocity) * 0.10, 0.0, 1.0);
      vec2 direction = normalize(pointerVelocity + vec2(0.0001));
      float behind = dot(pointerDelta, -direction);
      float lateral = abs(dot(pointerDelta, vec2(-direction.y, direction.x)));
      float streamLength = 0.10 + pointerSpeed * 0.45;
      float stream = smoothstep(0.0, 0.04, behind)
        * smoothstep(streamLength, 0.0, behind)
        * exp(-lateral * 34.0)
        * pointerSpeed;
      point += direction * stream * 0.16;

      vec2 broad = worley(point);
      vec2 fine = worley(point * 1.83 + vec2(9.0, 4.0));
      float broadNetwork = 1.0 - smoothstep(0.025, 0.16, broad.y - broad.x);
      float fineNetwork = 1.0 - smoothstep(0.018, 0.11, fine.y - fine.x);
      float intersections = broadNetwork * fineNetwork;
      float field = broadNetwork * 0.42 + fineNetwork * 0.32 + intersections * 1.25;
      field += stream * 0.32;
      return pow(clamp(field * uCausticIntensity, 0.0, 1.0), 1.0 / uCausticContrast);
    }

    float windowLightField(vec2 uv, float aspect) {
      vec2 wall = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
      float sunAngle = sin(uWindowSunPhase * 6.2831853);
      float slant = uWindowSlant + sunAngle * 0.10 + uParallax * 0.04;
      wall.x += wall.y * slant + uParallax * uWindowParallax;

      float field = 0.0;
      for (int index = 0; index < 5; index++) {
        float bandIndex = float(index);
        float sway = sin(uTime * 0.12 + bandIndex * 2.7) * uWindowSway;
        float centerX = -0.94 + bandIndex * 0.46 + sway;
        float centerY = 0.04 + sin(bandIndex * 2.1 + uTime * 0.08) * uWindowSway * 0.7;
        float width = uWindowBeamWidth * (0.84 + hash(vec2(bandIndex, 8.2)) * 0.24);
        float horizontal = 1.0 - smoothstep(
          width - uWindowSoftness,
          width + uWindowSoftness,
          abs(wall.x - centerX)
        );
        float vertical = 1.0 - smoothstep(
          uWindowBeamLength - uWindowSoftness,
          uWindowBeamLength + uWindowSoftness,
          abs(wall.y - centerY)
        );
        float beam = horizontal * vertical;
        beam *= 0.88 + 0.12 * sin(uTime * 0.09 + bandIndex * 1.8 + sunAngle);
        field = max(field, beam);
      }

      float broadGlow = 1.0 - smoothstep(0.38, 0.95, abs(wall.x + wall.y * slant + 0.20));
      return clamp((field + broadGlow * 0.08) * uWindowIntensity, 0.0, 1.0);
    }

    float bayer4(vec2 coordinate) {
      int x = int(mod(coordinate.x, 4.0));
      int y = int(mod(coordinate.y, 4.0));
      int index = x + y * 4;
      float value = 5.0;
      if (index == 0) value = 0.0;
      else if (index == 1) value = 8.0;
      else if (index == 2) value = 2.0;
      else if (index == 3) value = 10.0;
      else if (index == 4) value = 12.0;
      else if (index == 5) value = 4.0;
      else if (index == 6) value = 14.0;
      else if (index == 7) value = 6.0;
      else if (index == 8) value = 3.0;
      else if (index == 9) value = 11.0;
      else if (index == 10) value = 1.0;
      else if (index == 11) value = 9.0;
      else if (index == 12) value = 15.0;
      else if (index == 13) value = 7.0;
      else if (index == 14) value = 13.0;
      return (value + 0.5) / 16.0;
    }

    float decode16(vec2 bytes) {
      return (bytes.x * 255.0 * 256.0 + bytes.y * 255.0) / 65535.0;
    }

    // Returns distance, depth, and the semantic material id.
    vec3 structureField(vec2 position) {
      position.x += uParallax * uStructureParallax;
      position.x += sin(uTime * 0.65 + position.y * 4.5) * uStructureWind * uWind;

      float nearestDistance = 1000.0;
      float nearestDepth = 0.0;
      float nearestMaterial = 0.0;
      float rowScale = 1.0 / float(MAX_SEGMENTS);

      for (int i = 0; i < MAX_SEGMENTS; i++) {
        if (float(i) >= uSegmentCount) break;

        float row = (float(i) + 0.5) * rowScale;
        vec4 first = texture2D(uSegments, vec2(0.125, row));
        vec4 second = texture2D(uSegments, vec2(0.375, row));
        vec4 widths = texture2D(uSegments, vec2(0.625, row));
        vec4 metadata = texture2D(uSegments, vec2(0.875, row));

        vec2 start = vec2(decode16(first.rg), decode16(first.ba)) * uPositionScale - 1.0;
        vec2 end = vec2(decode16(second.rg), decode16(second.ba)) * uPositionScale - 1.0;
        vec2 delta = end - start;
        vec2 relative = position - start;
        float along = clamp(dot(relative, delta) / max(dot(delta, delta), 0.000001), 0.0, 1.0);
        float radius = mix(decode16(widths.rg), decode16(widths.ba), along) * uWidthScale;
        float distanceToSegment = length(relative - delta * along) - radius;

        if (distanceToSegment < nearestDistance) {
          nearestDistance = distanceToSegment;
          nearestDepth = decode16(metadata.rg);
          nearestMaterial = floor(decode16(metadata.ba) * 3.0 + 0.5);
        }
      }

      return vec3(nearestDistance, nearestDepth, nearestMaterial);
    }

    float structureShadow(float distanceToStructure, float depth) {
      float penumbra = uPenumbraBase + depth * uPenumbraDepth;
      return 1.0 - smoothstep(-penumbra, penumbra, distanceToStructure);
    }

    float detailShadow(vec2 position, float depth) {
      position.x += uParallax * (uDetailParallax + depth) * 0.1;
      vec2 drift = vec2(uTime * uDetailDriftX * uWind, uTime * uDetailDriftY * uWind);
      vec2 samplePoint = position * uDetailScale + drift + uSeed + vec2(13.0, 89.0);
      float softness = uDetailSoftness + depth * uDetailDepthSoftness;
      float threshold = mix(uDetailThresholdNear, uDetailThresholdFar, clamp(depth, 0.0, 1.0));
      return smoothstep(threshold + softness, threshold - softness, fbm(samplePoint));
    }

    void main() {
      vec2 uv = vUv;
      float aspect = uResolution.x / max(uResolution.y, 1.0);
      vec2 position = vec2(uv.x * aspect, uv.y);
      vec3 structure = structureField(position);
      float isStructure = 1.0 - step(0.5, abs(structure.z - 0.0));
      float isInk = 1.0 - step(0.5, abs(structure.z - 1.0));
      float isGlow = 1.0 - step(0.5, abs(structure.z - 2.0));
      float isAtmosphere = 1.0 - step(0.5, abs(structure.z - 3.0));
      float structureInShadow = structureShadow(structure.x, structure.y) * isStructure;

      float detailDepth = clamp(structure.y + 0.16, 0.0, 1.0);
      float detailsInShadow = detailShadow(position, detailDepth) * isStructure;
      float centerWarp = (fbm(position * uCenterWarpScale + uSeed + vec2(211.0, 37.0)) - 0.5) * uCenterWarpAmount;
      vec2 centerDelta = uv - vec2(uCenterX, uCenterY);
      float centerDistance = length(vec2(centerDelta.x * aspect / max(uCenterAspect, 0.001), centerDelta.y)) + centerWarp;
      float centerClear = smoothstep(uCenterRadius, uCenterFalloff, centerDistance);
      structureInShadow *= mix(uCenterStructureVisibility, 1.0, centerClear);
      detailsInShadow *= mix(uCenterDetailVisibility, 1.0, centerClear);

      float macroVariation = smoothstep(
        0.3,
        0.7,
        fbm(position * uMacroScale + vec2(uTime * uMacroDrift * uWind, 19.0) + uSeed + vec2(101.0, 57.0))
      );

      float shadow = max(structureInShadow, detailsInShadow * uDetailShadowStrength);
      shadow = max(shadow, (1.0 - centerClear) * uCenterShadow);
      float tone = uToneBase + (1.0 - shadow) * uToneRange;
      if (uSceneType > 1.5) {
        float windowLight = windowLightField(uv, aspect);
        windowLight *= mix(0.20, 1.0, centerClear);
        tone = uToneBase + windowLight * uToneRange;
      } else if (uSceneType > 0.5) {
        float caustic = causticField(uv, aspect);
        caustic *= mix(0.18, 1.0, centerClear);
        tone = uToneBase + caustic * uToneRange;
      }
      float structurePresence = 1.0 - smoothstep(-0.005, 0.018, structure.x);
      float glowLight = structurePresence * isGlow * (1.0 - smoothstep(0.05, 0.42, structure.y));
      tone = mix(tone, uToneBase + shadow * uToneRange, glowLight);
      tone += (macroVariation - 0.5) * uToneVariation * uMacroStrength;
      tone -= (1.0 - centerClear) * uCenterDip;
      tone = clamp(tone, 0.0, 1.0);

      float light = smoothstep(uLightStart, uLightEnd, tone);
      float dither = bayer4(gl_FragCoord.xy);
      float shiftedDither = bayer4(gl_FragCoord.xy + vec2(2.0, 1.0));
      float lit = step(dither, light);

      float fringe = smoothstep(uFringeStart, uFringePeak, tone)
        * smoothstep(uFringeEnd, uFringeReturn, tone);
      vec3 dark = step(shiftedDither, fringe) > 0.5 ? uMid : uShadow;
      vec3 color = lit > 0.5 ? uLight : dark;
      float ink = structurePresence * (isStructure + isInk)
        * (1.0 - smoothstep(-0.005, 0.012, structure.x));
      color = mix(color, isInk > 0.5 ? uInk : uStructure, ink * uStructureInk);
      float glow = isGlow * (1.0 - smoothstep(-0.005, 0.025, structure.x));
      color = mix(color, uGlow, glow);
      float atmosphere = isAtmosphere * (1.0 - smoothstep(-0.005, 0.035, structure.x));
      color = mix(color, uAtmosphere, atmosphere * 0.55);
      float sceneVisibility = mix(uCenterVisibility, 1.0, centerClear);
      color = mix(uBackground, color, sceneVisibility);

      gl_FragColor = vec4(color, 1.0);
    }
  `;

  const randomGenerator = (seed) => () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);

  const merge = (base, ...sources) => {
    const result = isObject(base) ? { ...base } : base;
    for (const source of sources) {
      if (!isObject(source)) continue;
      for (const [key, value] of Object.entries(source)) {
        result[key] = isObject(value) ? merge(isObject(result[key]) ? result[key] : {}, value) : value;
      }
    }
    return result;
  };

  const clone = (value) => (isObject(value) ? merge({}, value) : Array.isArray(value) ? value.slice() : value);

  const mulberrySeed = () => Math.floor(Math.random() * 0x7fffffff);

  function growTree(seed, aspect, treeConfig, material = SEGMENT_MATERIALS.structure) {
    const random = randomGenerator(seed);
    const segments = [];
    const tree = treeConfig;

    const grow = (x, y, angle, width, depth, iteration, phase) => {
      if (iteration > tree.maximumDepth || width < tree.minimumWidth || segments.length >= MAX_SEGMENTS) return;

      const length = Math.min(width * tree.lengthScale, tree.maximumLength)
        * (tree.lengthMinimum + random() * tree.lengthVariation);
      const bend = tree.curl * Math.sin(phase + iteration * 0.85);
      const nextAngle = angle + bend + (random() - 0.5) * tree.angleJitter;
      const endX = x + Math.cos(nextAngle) * length;
      const endY = y + Math.sin(nextAngle) * length;
      const endWidth = width * (tree.widthDecayMinimum + random() * tree.widthDecayVariation);

      segments.push([x, y, endX, endY, width, endWidth, clamp(depth, 0.02, 0.98), material]);

      const availableArea = endWidth * endWidth * tree.areaConservation;
      const shouldFork = random() < tree.forkProbability && iteration > tree.forkAfterDepth;
      if (!shouldFork) {
        grow(
          endX,
          endY,
          nextAngle,
          Math.sqrt(availableArea),
          depth + (random() - 0.5) * tree.leaderDepthJitter,
          iteration + 1,
          phase + GOLDEN_ANGLE,
        );
        return;
      }

      const leaderArea = availableArea * (tree.leaderAreaMinimum + random() * tree.leaderAreaVariation);
      grow(
        endX,
        endY,
        nextAngle,
        Math.sqrt(leaderArea),
        depth + (random() - 0.5) * tree.leaderDepthJitter,
        iteration + 1,
        phase + GOLDEN_ANGLE,
      );

      let remainingArea = Math.max(0, availableArea - leaderArea);
      const sideCount = random() < tree.secondSideProbability ? 2 : 1;
      for (let sideIndex = 0; sideIndex < sideCount; sideIndex += 1) {
        const sideArea = sideIndex === sideCount - 1 ? remainingArea : remainingArea * (0.42 + random() * 0.22);
        remainingArea -= sideArea;
        const sideWidth = Math.sqrt(sideArea);
        const side = Math.cos(phase + (sideIndex + 1) * GOLDEN_ANGLE) >= 0 ? 1 : -1;
        const thinness = 1 - Math.min(1, sideWidth / Math.max(endWidth, 0.000001));
        const sideAngle = nextAngle
          + side * (tree.sideAngle + thinness * tree.sideAngleThinness)
          + (random() - 0.5) * tree.sideAngleJitter;
        grow(
          endX,
          endY,
          sideAngle,
          sideWidth,
          depth + (random() - 0.5) * tree.sideDepthJitter,
          iteration + 1,
          phase + (sideIndex + 1) * GOLDEN_ANGLE,
        );
      }
    };

    const count = Math.max(1, Math.round(tree.count));
    const edges = tree.rootEdges || ["top"];
    for (let index = 0; index < count; index += 1) {
      const progress = index / Math.max(count - 1, 1);
      const fraction = tree.rootXMinimum
        + progress * (tree.rootXMaximum - tree.rootXMinimum)
        + (random() - 0.5) * tree.rootXJitter;
      const edge = edges[index % edges.length];
      let rootX;
      let rootY;
      let rootAngle;

      if (edge === "left") {
        rootX = -0.06;
        rootY = tree.rootEdgeYMinimum
          + random() * (tree.rootEdgeYMaximum - tree.rootEdgeYMinimum);
        rootAngle = (random() - 0.5) * tree.rootAngleJitter;
      } else if (edge === "right") {
        rootX = aspect + 0.06;
        rootY = tree.rootEdgeYMinimum
          + random() * (tree.rootEdgeYMaximum - tree.rootEdgeYMinimum);
        rootAngle = Math.PI + (random() - 0.5) * tree.rootAngleJitter;
      } else if (edge === "bottom") {
        rootX = aspect * clamp(fraction, 0.05, 0.95);
        rootY = -0.06;
        rootAngle = Math.PI / 2 + (random() - 0.5) * tree.rootAngleJitter;
      } else {
        rootX = aspect * clamp(fraction, 0.05, 0.95);
        rootY = 1.06;
        rootAngle = -Math.PI / 2 + (random() - 0.5) * tree.rootAngleJitter;
      }

      const rootWidth = tree.rootWidth * (0.88 + random() * tree.rootWidthVariation);
      const rootDepth = tree.rootDepth + random() * tree.rootDepthVariation;
      grow(rootX, rootY, rootAngle, rootWidth, rootDepth, 0, random() * Math.PI * 2);
    }

    return { segments };
  }
  /**
   * Generate a layered horizon and optional ringworld arcs.
   * Both are packed as depth-aware segments, making landscapes composable
   * with the same shader and runtime controls as tree canopies.
   */
  function growLandscape(seed, aspect, landscapeConfig, material = SEGMENT_MATERIALS.structure) {
    const random = randomGenerator(seed);
    const segments = [];
    const landscape = landscapeConfig;
    const points = Math.max(8, Math.round(landscape.segmentsPerLayer));
    const addPolyline = (pointsForLine, width, depth, lineMaterial = material) => {
      for (let index = 1; index < pointsForLine.length; index += 1) {
        const previous = pointsForLine[index - 1];
        const current = pointsForLine[index];
        const previousWidth = width * (0.78 + random() * landscape.widthVariation);
        const currentWidth = width * (0.78 + random() * landscape.widthVariation);
        segments.push([
          previous[0],
          previous[1],
          current[0],
          current[1],
          previousWidth,
          currentWidth,
          clamp(depth + (random() - 0.5) * 0.10, 0.02, 0.98),
          lineMaterial,
        ]);
      }
    };

    for (let layerIndex = 0; layerIndex < landscape.layerCount; layerIndex += 1) {
      const depth = landscape.depthMinimum + layerIndex * landscape.depthStep;
      const baseY = landscape.horizon - layerIndex * landscape.layerSpacing;
      const phase = random() * Math.PI * 2;
      const pointsForLayer = [];

      for (let pointIndex = 0; pointIndex <= points; pointIndex += 1) {
        const progress = pointIndex / points;
        const x = -0.08 + progress * (aspect + 0.16);
        const wave = Math.sin(progress * Math.PI * 2 * landscape.frequency + phase) * landscape.amplitude;
        const detail = Math.sin(progress * Math.PI * 5.3 + phase * 1.7) * landscape.amplitude * 0.32;
        const roughness = (random() - 0.5) * landscape.amplitude * landscape.roughness;
        pointsForLayer.push([x, baseY + wave + detail + roughness]);
      }
      addPolyline(pointsForLayer, landscape.width, depth);
    }

    if (landscape.ringEnabled) {
      const centerX = aspect * 0.5;
      const ringCount = Math.max(1, Math.round(landscape.ringCount));
      const ringPoints = Math.max(12, Math.round(landscape.ringSegments));
      for (let ringIndex = 0; ringIndex < ringCount; ringIndex += 1) {
        const radius = landscape.ringRadius + ringIndex * landscape.ringRadiusStep;
        const arc = [];
        for (let pointIndex = 0; pointIndex <= ringPoints; pointIndex += 1) {
          const progress = pointIndex / ringPoints;
          const angle = Math.PI - progress * Math.PI;
          const jitter = (random() - 0.5) * landscape.ringJitter;
          arc.push([
            centerX + Math.cos(angle) * radius * aspect,
            landscape.ringCenterY + Math.sin(angle) * radius + jitter,
          ]);
        }
        addPolyline(arc, landscape.ringWidth, 0.12 + ringIndex * 0.08, material);
      }
    }

    return { segments: segments.slice(0, MAX_SEGMENTS) };
  }
 
  const materialId = (value) => {
    if (typeof value === "number") return clamp(Math.round(value), 0, 3);
    return SEGMENT_MATERIALS[value] ?? SEGMENT_MATERIALS.structure;
  };

  const structureLayerConfig = (config, layer) => {
    const type = layer.type === "rings" ? "rings" : layer.type;
    const preset = STRUCTURE_PRESETS[type]?.[layer.preset] || {};
    const base = type === "rings"
      ? merge(config.landscape, config.rings, { ringEnabled: true, layerCount: 0 })
      : config[type];
    return {
      type,
      material: materialId(layer.material),
      config: merge(base || {}, preset, layer.config || {}),
    };
  };

  /** Compose independent generator outputs into one renderer-ready segment stream. */
  function growStructure(seed, aspect, config) {
    const configuredLayers = config.structure?.layers;
    const layers = Array.isArray(configuredLayers)
      ? configuredLayers
      : [{ type: config.structure?.type || "tree" }];
    const segments = [];

    layers.forEach((layer, index) => {
      if (!layer || segments.length >= MAX_SEGMENTS) return;
      const resolved = structureLayerConfig(config, layer);
      const layerSeed = seed + index * 1009;
      const output = resolved.type === "landscape" || resolved.type === "rings"
        ? growLandscape(layerSeed, aspect, resolved.config, resolved.material)
        : resolved.type === "tree"
          ? growTree(layerSeed, aspect, resolved.config, resolved.material)
          : { segments: [] };
      for (const segment of output.segments) {
        if (segments.length >= MAX_SEGMENTS) break;
        segments.push(segment);
      }
    });

    return { segments };
  }


  const hexToRgb = (value, fallback) => {
    let hex = String(value || "").trim().replace(/^#/, "");
    if (hex.length === 3) hex = hex.split("").map((part) => part + part).join("");
    if (!/^[0-9a-f]{6}$/i.test(hex)) hex = fallback.replace(/^#/, "");
    const number = parseInt(hex, 16);
    return [((number >> 16) & 255) / 255, ((number >> 8) & 255) / 255, (number & 255) / 255];
  };

  const cssColor = (configValue, cssName, fallback) => {
    const value = configValue || getComputedStyle(document.documentElement).getPropertyValue(cssName);
    return hexToRgb(value, fallback);
  };

  function createRenderer(targetCanvas, config) {
    const gl = targetCanvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      powerPreference: "low-power",
    });
    if (!gl) return null;

    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("[dappled] shader compile error:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertexShader = compile(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertexShader || !fragmentShader) return null;

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("[dappled] program link error:", gl.getProgramInfoLog(program));
      return null;
    }

    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const uniforms = {};
    const uniform = (name) => {
      if (!(name in uniforms)) uniforms[name] = gl.getUniformLocation(program, name);
      return uniforms[name];
    };
    const set1f = (name, value) => gl.uniform1f(uniform(name), value);

    const segmentTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, segmentTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const packedSegments = new Uint8Array(MAX_SEGMENTS * 16);
    const state = {
      config,
      width: 1,
      height: 1,
      positionScale: 3,
      sceneSeed: mulberrySeed(),
      noiseSeed: [Math.random() * 1000, Math.random() * 1000],
      structure: null,
      segmentCount: 0,
      wind: config.motion.windBase,
      parallax: 0,
      rippleX: 0.5,
      rippleY: 0.5,
      rippleAge: 100.0,
      pointerX: 0.5,
      pointerY: 0.5,
      pointerVelocityX: 0,
      pointerVelocityY: 0,
      colors: null,
    };

    const encode = (value, offset) => {
      const clamped = Math.round(clamp(value, 0, 1) * 65535);
      packedSegments[offset] = (clamped >> 8) & 255;
      packedSegments[offset + 1] = clamped & 255;
    };

    const updateColors = () => {
      state.colors = {
        light: cssColor(config.palette.light, "--dappled-light", "#f5f0e5"),
        mid: cssColor(config.palette.mid, "--dappled-mid", "#c78945"),
        shadow: cssColor(config.palette.shadow, "--dappled-shadow", "#101a2b"),
        background: cssColor(config.palette.background, "--background", "#05070b"),
        structure: cssColor(config.palette.structure, "--dappled-structure", "#000000"),
        ink: cssColor(config.palette.ink, "--dappled-ink", "#000000"),
        glow: cssColor(config.palette.glow, "--dappled-glow", "#c78945"),
        atmosphere: cssColor(config.palette.atmosphere, "--dappled-atmosphere", "#704040"),
      };
    };

    const rebuild = () => {
      const aspect = state.width / state.height;
      state.positionScale = aspect + 2.0;
      state.structure = growStructure(state.sceneSeed, aspect, config);
      packedSegments.fill(0);
      state.structure.segments.forEach((segment, index) => {
        const offset = index * 16;
        encode((segment[0] + 1) / state.positionScale, offset);
        encode((segment[1] + 1) / state.positionScale, offset + 2);
        encode((segment[2] + 1) / state.positionScale, offset + 4);
        encode((segment[3] + 1) / state.positionScale, offset + 6);
        encode(segment[4] / config.render.widthScale, offset + 8);
        encode(segment[5] / config.render.widthScale, offset + 10);
        encode(segment[6], offset + 12);
        encode(segment[7] / 3, offset + 14);
      });
      state.segmentCount = state.structure.segments.length;
      gl.bindTexture(gl.TEXTURE_2D, segmentTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, MAX_SEGMENTS, 0, gl.RGBA, gl.UNSIGNED_BYTE, packedSegments);
    };

    const resize = () => {
      const scale = Math.max(1, config.render.pixelScale);
      state.width = Math.max(1, Math.floor(window.innerWidth / scale));
      state.height = Math.max(1, Math.floor(window.innerHeight / scale));
      targetCanvas.width = state.width;
      targetCanvas.height = state.height;
      gl.viewport(0, 0, state.width, state.height);
      rebuild();
    };

    const updateConfig = (nextConfig, rebuildTree = true) => {
      state.config = config = nextConfig;
      updateColors();
      if (rebuildTree) rebuild();
      if (targetCanvas.width !== Math.floor(window.innerWidth / config.render.pixelScale)) resize();
    };

    const draw = (time) => {
      const { detailField, macroField, shadows, tone, composition, caustics, windowLight } = config;
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, segmentTexture);
      gl.uniform1i(uniform("uSegments"), 0);
      gl.uniform2f(uniform("uResolution"), state.width, state.height);
      gl.uniform2f(uniform("uSeed"), state.noiseSeed[0], state.noiseSeed[1]);
      set1f("uSegmentCount", state.segmentCount);
      set1f("uPositionScale", state.positionScale);
      set1f("uWidthScale", config.render.widthScale);
      set1f("uTime", time);
      set1f("uWind", state.wind);
      set1f("uParallax", state.parallax);
      set1f("uSceneType", config.scene === "windowLight" ? 2 : config.scene === "caustics" ? 1 : 0);
      set1f("uRippleX", state.rippleX);
      set1f("uRippleY", state.rippleY);
      set1f("uRippleAge", state.rippleAge);
      set1f("uCausticScale", caustics.scale);
      set1f("uCausticWarpScale", caustics.warpScale);
      set1f("uCausticWarpAmount", caustics.warpAmount);
      set1f("uCausticSpeed", caustics.speed);
      set1f("uCausticContrast", caustics.contrast);
      set1f("uCausticIntensity", caustics.intensity);
      set1f("uRippleScale", caustics.rippleScale);
      set1f("uRippleSpeed", caustics.rippleSpeed);
      set1f("uRippleDecay", caustics.rippleDecay);
      set1f("uPointerX", state.pointerX);
      set1f("uPointerY", state.pointerY);
      set1f("uPointerVelocityX", state.pointerVelocityX);
      set1f("uPointerVelocityY", state.pointerVelocityY);
      set1f("uWindowBeamWidth", windowLight.beamWidth);
      set1f("uWindowBeamLength", windowLight.beamLength);
      set1f("uWindowSlant", windowLight.slant);
      set1f("uWindowSway", windowLight.sway);
      set1f("uWindowParallax", windowLight.parallax);
      set1f("uWindowSoftness", windowLight.softness);
      set1f("uWindowIntensity", windowLight.intensity);
      set1f("uWindowSunPhase", (Date.now() % 86400000) / 86400000);
      gl.uniform3fv(uniform("uLight"), state.colors.light);
      gl.uniform3fv(uniform("uMid"), state.colors.mid);
      gl.uniform3fv(uniform("uShadow"), state.colors.shadow);
      gl.uniform3fv(uniform("uBackground"), state.colors.background);
      gl.uniform3fv(uniform("uStructure"), state.colors.structure);
      gl.uniform3fv(uniform("uInk"), state.colors.ink);
      gl.uniform3fv(uniform("uGlow"), state.colors.glow);
      gl.uniform3fv(uniform("uAtmosphere"), state.colors.atmosphere);

      set1f("uDetailScale", detailField.scale);
      set1f("uDetailDriftX", detailField.driftX);
      set1f("uDetailDriftY", detailField.driftY);
      set1f("uDetailSoftness", detailField.softness);
      set1f("uDetailDepthSoftness", detailField.depthSoftness);
      set1f("uDetailThresholdNear", detailField.thresholdNear);
      set1f("uDetailThresholdFar", detailField.thresholdFar);
      set1f("uDetailShadowStrength", detailField.shadowStrength);
      set1f("uMacroScale", macroField.scale);
      set1f("uMacroDrift", macroField.drift);
      set1f("uMacroStrength", macroField.strength);

      set1f("uPenumbraBase", shadows.penumbraBase);
      set1f("uPenumbraDepth", shadows.penumbraDepth);
      set1f("uStructureParallax", shadows.structureParallax);
      set1f("uStructureWind", shadows.structureWind);
      set1f("uStructureInk", shadows.structureInk);
      set1f("uDetailParallax", shadows.detailParallax);

      set1f("uCenterX", composition.centerX);
      set1f("uCenterY", composition.centerY);
      set1f("uCenterAspect", composition.centerAspect);
      set1f("uCenterRadius", composition.centerRadius);
      set1f("uCenterFalloff", composition.centerFalloff);
      set1f("uCenterShadow", composition.centerShadow);
      set1f("uCenterDetailVisibility", composition.centerDetailVisibility);
      set1f("uCenterStructureVisibility", composition.centerStructureVisibility);
      set1f("uCenterVisibility", composition.centerVisibility);
      set1f("uCenterWarpScale", composition.centerWarpScale);
      set1f("uCenterWarpAmount", composition.centerWarpAmount);

      set1f("uToneBase", tone.base);
      set1f("uToneRange", tone.range);
      set1f("uLightStart", tone.lightStart);
      set1f("uLightEnd", tone.lightEnd);
      set1f("uFringeStart", tone.fringeStart);
      set1f("uFringePeak", tone.fringePeak);
      set1f("uFringeEnd", tone.fringeEnd);
      set1f("uFringeReturn", tone.fringeReturn);
      set1f("uCenterDip", tone.centerDip);
      set1f("uToneVariation", tone.variation);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    updateColors();
    resize();
    return {
      state,
      resize,
      rebuild,
      draw,
      updateConfig,
      loseContext: () => gl.getExtension("WEBGL_lose_context")?.loseContext(),
    };
  }

  function createDappledBackground(targetCanvas, options = {}) {
    const requestedScene = options.scene || targetCanvas.dataset.dappledScene || DEFAULT_CONFIG.scene;
    let sceneName = SCENE_PRESETS[requestedScene] ? requestedScene : DEFAULT_CONFIG.scene;
    let overrides = clone(options);
    delete overrides.scene;
    let config = merge(DEFAULT_CONFIG, SCENE_PRESETS[sceneName], overrides);

    const renderer = createRenderer(targetCanvas, config);
    if (!renderer) {
      targetCanvas.classList.add("is-fallback");
      return null;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let targetParallax = 0;
    let targetPointerX = 0.5;
    let targetPointerY = 0.5;
    let animationFrame = 0;
    let currentTime = 0;
    let previousTime = 0;
    let resizeTimer = 0;
    let destroyed = false;

    const drawOnce = () => renderer.draw(0);
    const onPointerMove = (event) => {
      targetParallax = (event.clientX / Math.max(window.innerWidth, 1) - 0.5) * 2;
      targetPointerX = event.clientX / Math.max(window.innerWidth, 1);
      targetPointerY = 1 - event.clientY / Math.max(window.innerHeight, 1);
    };
    const onClick = (event) => {
      renderer.state.rippleX = event.clientX / Math.max(window.innerWidth, 1);
      renderer.state.rippleY = 1 - event.clientY / Math.max(window.innerHeight, 1);
      renderer.state.rippleAge = 0;
      if (reducedMotion.matches) drawOnce();
    };
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => renderer.resize(), 120);
    };
    const loop = (timestamp) => {
      if (destroyed) return;
      const elapsed = previousTime ? Math.min(0.05, (timestamp - previousTime) / 1000) : 0.016;
      previousTime = timestamp;
      currentTime += elapsed;
      const pointerSmoothing = 1 - Math.exp(-elapsed * 8.0);
      const previousPointerX = renderer.state.pointerX;
      const previousPointerY = renderer.state.pointerY;
      renderer.state.pointerX += (targetPointerX - renderer.state.pointerX) * pointerSmoothing;
      renderer.state.pointerY += (targetPointerY - renderer.state.pointerY) * pointerSmoothing;
      renderer.state.pointerVelocityX = (renderer.state.pointerX - previousPointerX) / Math.max(elapsed, 0.001);
      renderer.state.pointerVelocityY = (renderer.state.pointerY - previousPointerY) / Math.max(elapsed, 0.001);
      renderer.state.rippleAge = Math.min(100.0, renderer.state.rippleAge + elapsed);
      renderer.state.parallax += (targetParallax - renderer.state.parallax) * config.motion.parallaxSmoothing;
      renderer.state.wind = config.motion.windBase
        + config.motion.windPulse * Math.sin(currentTime * config.motion.windPulseSpeed)
        + config.motion.windFlutter * Math.sin(currentTime * config.motion.windFlutterSpeed + 2.0);
      renderer.draw(currentTime);
      animationFrame = window.requestAnimationFrame(loop);
    };

    const apply = (nextConfig, rebuildTree = true) => {
      config = nextConfig;
      renderer.updateConfig(config, rebuildTree);
      if (reducedMotion.matches) drawOnce();
    };

    const api = {
      get config() {
        return clone(config);
      },
      getConfig: () => clone(config),
      set(partial) {
        overrides = merge(overrides, partial);
        apply(
          merge(DEFAULT_CONFIG, SCENE_PRESETS[sceneName], overrides),
          Boolean(partial.tree || partial.landscape || partial.rings || partial.structure || partial.render),
        );
        return api;
      },
      setScene(name) {
        if (!SCENE_PRESETS[name]) throw new Error(`Unknown dappled scene: ${name}`);
        sceneName = name;
        overrides = {};
        const nextConfig = merge(DEFAULT_CONFIG, SCENE_PRESETS[sceneName]);
        nextConfig.scene = sceneName;
        apply(nextConfig, true);
        return api;
      },
      reseed() {
        renderer.state.sceneSeed = mulberrySeed();
        renderer.state.noiseSeed = [Math.random() * 1000, Math.random() * 1000];
        renderer.rebuild();
        if (reducedMotion.matches) drawOnce();
        return api;
      },
      resize() {
        renderer.resize();
        return api;
      },
      destroy() {
        destroyed = true;
        window.cancelAnimationFrame(animationFrame);
        clearTimeout(resizeTimer);
        window.removeEventListener("resize", onResize);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("click", onClick);
        renderer.loseContext();
      },
    };

    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("click", onClick, { passive: true });
    reducedMotion.addEventListener?.("change", () => {
      if (reducedMotion.matches) {
        window.cancelAnimationFrame(animationFrame);
        drawOnce();
      } else {
        previousTime = 0;
        animationFrame = window.requestAnimationFrame(loop);
      }
    });

    if (reducedMotion.matches) drawOnce();
    else animationFrame = window.requestAnimationFrame(loop);

    return api;
  }

  window.DappledBackground = {
    create: createDappledBackground,
    defaults: clone(DEFAULT_CONFIG),
    presets: clone(SCENE_PRESETS),
    structurePresets: clone(STRUCTURE_PRESETS),
  };
  window.dappled = createDappledBackground(canvas);
})();
