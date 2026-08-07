(() => {
  "use strict";

  /*
   * Dappled is split into five layers:
   *
   *   config       what the scene should look like
   *   tree         a seeded, recursive branch generator
   *   shader       noise, shadows, dithering, and tone mapping
   *   renderer     WebGL buffers and uniforms
   *   controller   animation, input, resize, and the public API
   *
   * Start tuning in SCENE_PRESETS or through window.dappled.set().
   * For example:
   *
   *   dappled.set({ noise: { leafScale: 11 } });
   *   dappled.set({ tree: { forkProbability: 0.4 } });
   *   dappled.setScene("quiet");
   *   dappled.reseed();
   */

  const canvas = document.querySelector(".dappled-background");
  if (!canvas) return;

  // The segment texture layout and shader loop are compile-time constraints.
  const MAX_SEGMENTS = 320;
  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

  /**
   * Tunable values are grouped by the thing they control:
   *
   * render.pixelScale       Lower values mean larger, chunkier pixels.
   * palette                 The three colors used after dithering.
   * noise                   Leaf/canopy texture scale and contrast.
   * shadows                 Branch blur, leaf density, and depth behavior.
   * tone                    Mapping from physical-ish light to palette tones.
   * composition             Keeps the central title area intentionally quiet.
   * motion                  Wind and parallax response.
   * tree                    The grammar and geometry of the generated branches.
   */
  const DEFAULT_CONFIG = {
    scene: "canopy",
    render: {
      pixelScale: 2.5,
      widthScale: 0.08,
    },
    palette: {
      light: null,
      mid: null,
      shadow: null,
      background: null,
      branch: null,
    },
    noise: {
      leafScale: 10.5,
      leafDriftX: 0.018,
      leafDriftY: 0.006,
      leafSoftness: 0.05,
      leafDepthSoftness: 0.30,
      leafThresholdNear: 0.84,
      leafThresholdFar: 0.48,
      leafShadowStrength: 0.60,
      canopyScale: 0.42,
      canopyDrift: 0.004,
      canopyStrength: 1.0,
    },
    shadows: {
      penumbraBase: 0.006,
      penumbraDepth: 0.055,
      branchParallax: 0.035,
      branchWind: 0.012,
      branchInk: 0.38,
      leafParallax: 0.10,
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
      centerRadius: 0.05,
      centerFalloff: .25,
      centerShadow: 1.0,
      centerLeafVisibility: 0.0,
      centerBranchVisibility: 0.0,
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
  };

  // Presets are deliberately small. Unspecified values inherit from DEFAULT_CONFIG.
  const SCENE_PRESETS = {
    canopy: {
      tree: { rootEdges: ["left", "right", "top"] },
    },
    quiet: {
      render: { pixelScale: 2.5 },
      noise: { leafScale: 9.5, leafShadowStrength: 0.34, canopyStrength: 0.70 },
      tone: { range: 0.52 },
      tree: { count: 2, rootEdges: ["left", "right"], forkProbability: 0.58, rootWidth: 0.016 },
    },
    dense: {
      render: { pixelScale: 1.5 },
      noise: { leafScale: 6.0, leafShadowStrength: 0.58, leafSoftness: 0.08 },
      shadows: { penumbraDepth: 0.08 },
      tree: { count: 5, forkProbability: 0.84, secondSideProbability: 0.42, rootWidth: 0.028 },
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
    uniform vec3 uBranch;
    uniform vec3 uShadow;
    uniform vec3 uBackground;

    uniform float uLeafScale;
    uniform float uLeafDriftX;
    uniform float uLeafDriftY;
    uniform float uLeafSoftness;
    uniform float uLeafDepthSoftness;
    uniform float uLeafThresholdNear;
    uniform float uLeafThresholdFar;
    uniform float uLeafShadowStrength;
    uniform float uCanopyScale;
    uniform float uCanopyDrift;
    uniform float uCanopyStrength;

    uniform float uPenumbraBase;
    uniform float uPenumbraDepth;
    uniform float uBranchParallax;
    uniform float uBranchWind;
    uniform float uBranchInk;
    uniform float uLeafParallax;
    uniform float uCenterX;
    uniform float uCenterY;
    uniform float uCenterRadius;
    uniform float uCenterFalloff;
    uniform float uCenterShadow;
    uniform float uCenterLeafVisibility;
    uniform float uCenterBranchVisibility;
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

    vec2 branchField(vec2 position) {
      position.x += uParallax * uBranchParallax;
      position.x += sin(uTime * 0.65 + position.y * 4.5) * uBranchWind * uWind;

      float nearestDistance = 1000.0;
      float nearestDepth = 0.0;
      float rowScale = 1.0 / float(MAX_SEGMENTS);

      for (int i = 0; i < MAX_SEGMENTS; i++) {
        if (float(i) >= uSegmentCount) break;

        float row = (float(i) + 0.5) * rowScale;
        vec4 first = texture2D(uSegments, vec2(0.125, row));
        vec4 second = texture2D(uSegments, vec2(0.375, row));
        vec4 widths = texture2D(uSegments, vec2(0.625, row));
        vec4 depth = texture2D(uSegments, vec2(0.875, row));

        vec2 start = vec2(decode16(first.rg), decode16(first.ba)) * uPositionScale - 1.0;
        vec2 end = vec2(decode16(second.rg), decode16(second.ba)) * uPositionScale - 1.0;
        vec2 delta = end - start;
        vec2 relative = position - start;
        float along = clamp(dot(relative, delta) / max(dot(delta, delta), 0.000001), 0.0, 1.0);
        float radius = mix(decode16(widths.rg), decode16(widths.ba), along) * uWidthScale;
        float distanceToSegment = length(relative - delta * along) - radius;

        if (distanceToSegment < nearestDistance) {
          nearestDistance = distanceToSegment;
          nearestDepth = decode16(depth.rg);
        }
      }

      return vec2(nearestDistance, nearestDepth);
    }

    float branchShadow(float distanceToBranch, float depth) {
      float penumbra = uPenumbraBase + depth * uPenumbraDepth;
      return 1.0 - smoothstep(-penumbra, penumbra, distanceToBranch);
    }

    float leafShadow(vec2 position, float depth) {
      position.x += uParallax * (uLeafParallax + depth) * 0.1;
      vec2 drift = vec2(uTime * uLeafDriftX * uWind, uTime * uLeafDriftY * uWind);
      vec2 samplePoint = position * uLeafScale + drift + uSeed + vec2(13.0, 89.0);
      float softness = uLeafSoftness + depth * uLeafDepthSoftness;
      float threshold = mix(uLeafThresholdNear, uLeafThresholdFar, clamp(depth, 0.0, 1.0));
      return smoothstep(threshold + softness, threshold - softness, fbm(samplePoint));
    }

    void main() {
      vec2 uv = vUv;
      float aspect = uResolution.x / max(uResolution.y, 1.0);
      vec2 position = vec2(uv.x * aspect, uv.y);
      vec2 branches = branchField(position);

      float branchesInShadow = branchShadow(branches.x, branches.y);
      float leafDepth = clamp(branches.y + 0.16, 0.0, 1.0);
      float leavesInShadow = leafShadow(position, leafDepth);
      float centerWarp = (fbm(position * uCenterWarpScale + uSeed + vec2(211.0, 37.0)) - 0.5) * uCenterWarpAmount;
      vec2 centerDelta = uv - vec2(uCenterX, uCenterY);
      float centerDistance = length(vec2(centerDelta.x * aspect, centerDelta.y)) + centerWarp;
      float centerClear = smoothstep(uCenterRadius, uCenterFalloff, centerDistance);
      branchesInShadow *= mix(uCenterBranchVisibility, 1.0, centerClear);
      leavesInShadow *= mix(uCenterLeafVisibility, 1.0, centerClear);

      float canopyVariation = smoothstep(
        0.3,
        0.7,
        fbm(position * uCanopyScale + vec2(uTime * uCanopyDrift * uWind, 19.0) + uSeed + vec2(101.0, 57.0))
      );

      float shadow = max(branchesInShadow, leavesInShadow * uLeafShadowStrength);
      shadow = max(shadow, (1.0 - centerClear) * uCenterShadow);
      float tone = uToneBase + (1.0 - shadow) * uToneRange;
      tone += (canopyVariation - 0.5) * uToneVariation * uCanopyStrength;
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
      float branchInk = 1.0 - smoothstep(-0.005, 0.012, branches.x);
      color = mix(color, uBranch, branchInk * uBranchInk);
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

  /** Generate branch segments using a probabilistic, area-conserving grammar. */
  function growTree(seed, aspect, treeConfig) {
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

      segments.push([x, y, endX, endY, width, endWidth, clamp(depth, 0.02, 0.98)]);

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

    return { segments, positionScale: aspect + 2.0 };
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
      treeSeed: mulberrySeed(),
      noiseSeed: [Math.random() * 1000, Math.random() * 1000],
      tree: null,
      segmentCount: 0,
      wind: config.motion.windBase,
      parallax: 0,
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
        branch: cssColor(config.palette.branch, "--dappled-branch", "#000000"),
      };
    };

    const rebuild = () => {
      state.tree = growTree(state.treeSeed, state.width / state.height, config.tree);
      packedSegments.fill(0);
      state.tree.segments.forEach((segment, index) => {
        const offset = index * 16;
        const scale = state.tree.positionScale;
        encode((segment[0] + 1) / scale, offset);
        encode((segment[1] + 1) / scale, offset + 2);
        encode((segment[2] + 1) / scale, offset + 4);
        encode((segment[3] + 1) / scale, offset + 6);
        encode(segment[4] / config.render.widthScale, offset + 8);
        encode(segment[5] / config.render.widthScale, offset + 10);
        encode(segment[6], offset + 12);
      });
      state.segmentCount = state.tree.segments.length;
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
      const { noise, shadows, tone, composition } = config;
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, segmentTexture);
      gl.uniform1i(uniform("uSegments"), 0);
      gl.uniform2f(uniform("uResolution"), state.width, state.height);
      gl.uniform2f(uniform("uSeed"), state.noiseSeed[0], state.noiseSeed[1]);
      set1f("uSegmentCount", state.segmentCount);
      set1f("uPositionScale", state.tree.positionScale);
      set1f("uWidthScale", config.render.widthScale);
      set1f("uTime", time);
      set1f("uWind", state.wind);
      set1f("uParallax", state.parallax);
      gl.uniform3fv(uniform("uLight"), state.colors.light);
      gl.uniform3fv(uniform("uMid"), state.colors.mid);
      gl.uniform3fv(uniform("uShadow"), state.colors.shadow);
      gl.uniform3fv(uniform("uBackground"), state.colors.background);
      gl.uniform3fv(uniform("uBranch"), state.colors.branch);

      set1f("uLeafScale", noise.leafScale);
      set1f("uLeafDriftX", noise.leafDriftX);
      set1f("uLeafDriftY", noise.leafDriftY);
      set1f("uLeafSoftness", noise.leafSoftness);
      set1f("uLeafDepthSoftness", noise.leafDepthSoftness);
      set1f("uLeafThresholdNear", noise.leafThresholdNear);
      set1f("uLeafThresholdFar", noise.leafThresholdFar);
      set1f("uLeafShadowStrength", noise.leafShadowStrength);
      set1f("uCanopyScale", noise.canopyScale);
      set1f("uCanopyDrift", noise.canopyDrift);
      set1f("uCanopyStrength", noise.canopyStrength);

      set1f("uPenumbraBase", shadows.penumbraBase);
      set1f("uPenumbraDepth", shadows.penumbraDepth);
      set1f("uBranchParallax", shadows.branchParallax);
      set1f("uBranchWind", shadows.branchWind);
      set1f("uBranchInk", shadows.branchInk);
      set1f("uLeafParallax", shadows.leafParallax);

      set1f("uCenterX", composition.centerX);
      set1f("uCenterY", composition.centerY);
      set1f("uCenterRadius", composition.centerRadius);
      set1f("uCenterFalloff", composition.centerFalloff);
      set1f("uCenterShadow", composition.centerShadow);
      set1f("uCenterLeafVisibility", composition.centerLeafVisibility);
      set1f("uCenterBranchVisibility", composition.centerBranchVisibility);
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
    let animationFrame = 0;
    let currentTime = 0;
    let previousTime = 0;
    let resizeTimer = 0;
    let destroyed = false;

    const drawOnce = () => renderer.draw(0);
    const onPointerMove = (event) => {
      targetParallax = (event.clientX / Math.max(window.innerWidth, 1) - 0.5) * 2;
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
        apply(merge(DEFAULT_CONFIG, SCENE_PRESETS[sceneName], overrides), Boolean(partial.tree || partial.render));
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
        renderer.state.treeSeed = mulberrySeed();
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
        renderer.loseContext();
      },
    };

    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
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
  };
  window.dappled = createDappledBackground(canvas);
})();
