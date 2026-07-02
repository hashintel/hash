/**
 * Custom Deck.gl layer: renders cubic Bezier curves using SDF
 * (Signed Distance Field) evaluation in the fragment shader.
 *
 * Each instance is a screen-space quad covering the Bezier control
 * point bounding box. The fragment shader computes exact distance
 * to the cubic Bezier via brute-force search + Newton refinement,
 * then applies smoothstep antialiasing.
 *
 * Result: pixel-perfect smooth curves at any zoom level, no
 * tessellation artifacts, no jagged joints. GPU-accelerated.
 *
 * Data format: each datum represents one cubic Bezier segment
 * with control points p0, p1, p2, p3 in world coordinates.
 */
import { Layer, picking, project32, UNIT } from "@deck.gl/core";
import { Geometry, Model } from "@luma.gl/engine";

import type { LayerProps, Unit, UpdateParameters } from "@deck.gl/core";
import type { ShaderModule } from "@luma.gl/shadertools";

export interface BezierSegmentDatum {
  readonly p0: readonly [number, number];
  readonly p1: readonly [number, number];
  readonly p2: readonly [number, number];
  readonly p3: readonly [number, number];
  readonly color: readonly [number, number, number, number];
  readonly width: number;
  /** Clip circles `(cx, cy, signedRadius)` per end; default no clip. */
  readonly clipA?: readonly [number, number, number];
  readonly clipB?: readonly [number, number, number];
}

interface BezierUniformProps {
  /** Halo (soft underlay band) colour, normalized 0..1 RGBA. */
  uHaloColor: [number, number, number, number];
  uViewportSize: [number, number];
  uBoundsPaddingPixels: number;
  /** Width unit + scale, same mechanism as the core LineLayer. */
  widthUnits: number;
  widthScale: number;
  /** Halo stroke width as a multiple of the core width; <= 1 disables the halo. */
  uHaloWidthFactor: number;
}

// Declaration order matches `uniformTypes` and packs std140 without holes
// (vec4, vec2, then scalars).
const bezierUniformsGlsl = `\
layout(std140) uniform bezierUniforms {
  vec4 uHaloColor;
  vec2 uViewportSize;
  float uBoundsPaddingPixels;
  float widthScale;
  float uHaloWidthFactor;
  highp int widthUnits;
} bezier;
`;

const bezierUniforms = {
  name: "bezier",
  vs: bezierUniformsGlsl,
  fs: bezierUniformsGlsl,
  uniformTypes: {
    uHaloColor: "vec4<f32>",
    uViewportSize: "vec2<f32>",
    uBoundsPaddingPixels: "f32",
    widthScale: "f32",
    uHaloWidthFactor: "f32",
    widthUnits: "i32",
  },
  defaultUniforms: {
    uHaloColor: [0, 0, 0, 0] as [number, number, number, number],
    uViewportSize: [1, 1] as [number, number],
    uBoundsPaddingPixels: 4,
    widthScale: 1,
    uHaloWidthFactor: 0,
    widthUnits: UNIT.pixels,
  },
} satisfies ShaderModule<BezierUniformProps>;

const vs = `\
#version 300 es
#define SHADER_NAME bezier-sdf-layer-vertex

in vec2 positions;

in vec2 instanceP0;
in vec2 instanceP1;
in vec2 instanceP2;
in vec2 instanceP3;
in float instanceWidths;
in vec4 instanceColors;
in vec3 instanceClipA;
in vec3 instanceClipB;
in vec3 instancePickingColors;

out vec2 vPixel;
out vec2 vP0;
out vec2 vP1;
out vec2 vP2;
out vec2 vP3;
out float vWidth;
out vec4 vColor;
out vec2 vClipACenter;
out float vClipARadiusPx;
out vec2 vClipBCenter;
out float vClipBRadiusPx;

vec2 graphToPixel(vec2 position) {
  // Control points are 2D (z = 0); lift to vec3 for projection.
  vec3 projected = project_position(vec3(position, 0.0));
  vec4 clip = project_common_position_to_clipspace(vec4(projected, 1.0));
  vec2 ndc = clip.xy / clip.w;
  return (ndc * 0.5 + 0.5) * bezier.uViewportSize;
}

void main(void) {
  vec2 p0 = graphToPixel(instanceP0);
  vec2 p1 = graphToPixel(instanceP1);
  vec2 p2 = graphToPixel(instanceP2);
  vec2 p3 = graphToPixel(instanceP3);

  vec2 minP = min(min(p0, p1), min(p2, p3));
  vec2 maxP = max(max(p0, p1), max(p2, p3));

  // Stroke width to pixels via Deck's unit conversion (pixels / common / meters). Readability is a
  // caller-owned design decision; this shader does not hide it behind min/max clamps.
  float widthPx = max(
    0.0,
    project_size_to_pixel(instanceWidths * bezier.widthScale, bezier.widthUnits)
  );

  // The quad must cover the widest band drawn: the halo when enabled.
  float pad = widthPx * 0.5 * max(1.0, bezier.uHaloWidthFactor)
    + bezier.uBoundsPaddingPixels;
  minP -= vec2(pad);
  maxP += vec2(pad);

  vec2 uv = positions * 0.5 + 0.5;
  vec2 pixel = mix(minP, maxP, uv);

  vPixel = pixel;
  vP0 = p0;
  vP1 = p1;
  vP2 = p2;
  vP3 = p3;
  vWidth = widthPx;
  vColor = instanceColors;

  // Each segment is one pickable instance; deck decodes this back to its index on hover.
  picking_setPickingColor(instancePickingColors);

  // Clip circles to pixel space. Project the centre, and a point one world-radius
  // away, so the pixel radius tracks the same projection the bubble uses. Keep
  // the radius SIGN (which side to erase); a zero radius means "no clip".
  vClipACenter = graphToPixel(instanceClipA.xy);
  vClipARadiusPx =
    distance(vClipACenter, graphToPixel(instanceClipA.xy + vec2(abs(instanceClipA.z), 0.0)))
    * sign(instanceClipA.z);
  vClipBCenter = graphToPixel(instanceClipB.xy);
  vClipBRadiusPx =
    distance(vClipBCenter, graphToPixel(instanceClipB.xy + vec2(abs(instanceClipB.z), 0.0)))
    * sign(instanceClipB.z);

  vec2 ndc = pixel / bezier.uViewportSize * 2.0 - 1.0;
  gl_Position = vec4(ndc, 0.0, 1.0);
}
`;

// SAMPLE_SIZE 12 / NEWTON_ITERATIONS 3: tuned for near-straight highway
// control nets; increase if tight S-curves show distance error.
const SAMPLE_SIZE = 12;
const NEWTON_ITERATIONS = 3;

const fs = `\
#version 300 es
#define SHADER_NAME bezier-sdf-layer-fragment
precision highp float;

in vec2 vPixel;
in vec2 vP0;
in vec2 vP1;
in vec2 vP2;
in vec2 vP3;
in float vWidth;
in vec4 vColor;
in vec2 vClipACenter;
in float vClipARadiusPx;
in vec2 vClipBCenter;
in float vClipBRadiusPx;

out vec4 fragColor;

vec2 cubicBezier(vec2 a, vec2 b, vec2 c, vec2 d, float t) {
  float u = 1.0 - t;
  return u * u * u * a
       + 3.0 * u * u * t * b
       + 3.0 * u * t * t * c
       + t * t * t * d;
}

vec2 cubicBezierDeriv(vec2 a, vec2 b, vec2 c, vec2 d, float t) {
  float u = 1.0 - t;
  return 3.0 * u * u * (b - a)
       + 6.0 * u * t * (c - b)
       + 3.0 * t * t * (d - c);
}

vec2 cubicBezierDeriv2(vec2 a, vec2 b, vec2 c, vec2 d, float t) {
  return 6.0 * (1.0 - t) * (c - 2.0 * b + a)
       + 6.0 * t * (d - 2.0 * c + b);
}

float distToCubicBezier(vec2 p, vec2 a, vec2 b, vec2 c, vec2 d) {
  // Coarse search: ${SAMPLE_SIZE} uniform samples. The edge control nets drawn here are
  // near-straight (highway lanes with a mild bow), so the distance-to-t
  // relation has no tight folds and a dozen seeds put Newton inside its
  // convergence basin; more samples double the per-fragment ALU for no
  // visible change in the stroke.
  float bestT = 0.0;
  float bestD2 = 1.0e30;

  for (int i = 0; i <= ${SAMPLE_SIZE}; i++) {
    float t = float(i) / ${SAMPLE_SIZE}.0;
    vec2 q = cubicBezier(a, b, c, d, t);
    float d2 = dot(q - p, q - p);
    if (d2 < bestD2) {
      bestD2 = d2;
      bestT = t;
    }
  }

  // Newton refinement: ${NEWTON_ITERATIONS} iterations.
  float t = bestT;
  for (int i = 0; i < ${NEWTON_ITERATIONS}; i++) {
    vec2 q = cubicBezier(a, b, c, d, t);
    vec2 d1 = cubicBezierDeriv(a, b, c, d, t);
    vec2 d2 = cubicBezierDeriv2(a, b, c, d, t);

    vec2 r = q - p;
    float num = dot(r, d1);
    float den = dot(d1, d1) + dot(r, d2);

    if (abs(den) > 1.0e-5) {
      t = clamp(t - num / den, 0.0, 1.0);
    }
  }

  vec2 q = cubicBezier(a, b, c, d, t);
  return length(q - p);
}

// Clip one side via a circle, which is positioned at the centre with the radius specified.
// A negative signedRadiusPx erases outside (keep inside); positive erases inside (keep outside);
// ~0 means no clip. Returns a 0..1 alpha multiplier.
float clipFactor(vec2 pixel, vec2 center, float signedRadiusPx) {
  float r = abs(signedRadiusPx);
  if (r < 0.001) {
    return 1.0;
  }
  float caa = 1.0;
  float coverage = smoothstep(r - caa, r + caa, distance(pixel, center));
  return signedRadiusPx > 0.0 ? coverage : 1.0 - coverage;
}

void main(void) {
  float dist = distToCubicBezier(vPixel, vP0, vP1, vP2, vP3);

  float radius = vWidth * 0.5;
  float aa = max(fwidth(dist), 0.75);

  float coreCoverage = 1.0 - smoothstep(radius - aa, radius + aa, dist);

  float clip = clipFactor(vPixel, vClipACenter, vClipARadiusPx)
    * clipFactor(vPixel, vClipBCenter, vClipBRadiusPx);

  // Picking hit-tests the core stroke only; the halo is a non-interactive
  // backdrop.
  if (bool(picking.isActive)) {
    float pickAlpha = vColor.a * coreCoverage * clip;
    if (pickAlpha <= 0.001) {
      discard;
    }
    fragColor = picking_filterPickingColor(vec4(vColor.rgb, pickAlpha));
    return;
  }

  // Optional halo: when uHaloWidthFactor > 1, composite a wider smoothstep
  // band under the core stroke in one evaluation.
  float coreAlpha = vColor.a * coreCoverage;
  float haloAlpha = 0.0;
  if (bezier.uHaloWidthFactor > 1.0) {
    float haloRadius = radius * bezier.uHaloWidthFactor;
    haloAlpha =
      bezier.uHaloColor.a * (1.0 - smoothstep(haloRadius - aa, haloRadius + aa, dist));
  }

  float blendedAlpha = coreAlpha + haloAlpha * (1.0 - coreAlpha);
  float outAlpha = blendedAlpha * clip;
  if (outAlpha <= 0.001) {
    discard;
  }

  // "Core over halo" resolved to one straight-alpha output: weight the core
  // colour by its share of the blended alpha.
  vec3 outColor =
    mix(bezier.uHaloColor.rgb, vColor.rgb, coreAlpha / max(blendedAlpha, 1.0e-6));

  fragColor = vec4(outColor, outAlpha);
}
`;

/**
 * A single binary instance attribute supplied via `data.attributes`. The
 * `value` typed array is uploaded directly to the GPU; `stride`/`offset`
 * (both in bytes) allow several attributes to share one interleaved buffer.
 */
interface BinaryAttribute {
  readonly value: Float32Array | Uint8Array;
  readonly size: number;
  readonly stride?: number;
  readonly offset?: number;
  readonly normalized?: boolean;
}

/**
 * Binary form of `data`: a row count plus pre-packed attributes keyed by
 * accessor name. This bypasses the per-datum accessor functions entirely.
 */
interface BinaryData {
  readonly length: number;
  readonly attributes: Record<string, BinaryAttribute>;
}

interface BezierSDFLayerProps<
  D extends BezierSegmentDatum = BezierSegmentDatum,
> extends LayerProps {
  readonly data: readonly D[] | BinaryData;
  readonly getP0?: (datum: D) => readonly [number, number];
  readonly getP1?: (datum: D) => readonly [number, number];
  readonly getP2?: (datum: D) => readonly [number, number];
  readonly getP3?: (datum: D) => readonly [number, number];
  readonly getWidth?: (datum: D) => number;
  readonly getColor?: (datum: D) => readonly [number, number, number, number];
  readonly getClipA?: (datum: D) => readonly [number, number, number];
  readonly getClipB?: (datum: D) => readonly [number, number, number];
  readonly boundsPaddingPixels?: number;
  /** Width unit: `"pixels"` (default), `"common"` (world, scales with zoom), `"meters"`. */
  readonly widthUnits?: Unit;
  readonly widthScale?: number;
  /**
   * Halo stroke width as a multiple of the core width.
   *
   * @defaultValue 0 (disabled). Values > 1 draw a soft wide band in the same
   * fragment pass, avoiding a second SDF solve over overlapping quads.
   */
  readonly haloWidthFactor?: number;
  /** Halo RGBA, 0-255 like other layer colours. Only drawn when {@link haloWidthFactor} > 1. */
  readonly haloColor?: readonly [number, number, number, number];
}

const DEFAULT_COLOR: readonly [number, number, number, number] = [
  255, 255, 255, 255,
];

const defaultProps = {
  getP0: {
    type: "accessor" as const,
    value: (datum: BezierSegmentDatum) => datum.p0,
  },
  getP1: {
    type: "accessor" as const,
    value: (datum: BezierSegmentDatum) => datum.p1,
  },
  getP2: {
    type: "accessor" as const,
    value: (datum: BezierSegmentDatum) => datum.p2,
  },
  getP3: {
    type: "accessor" as const,
    value: (datum: BezierSegmentDatum) => datum.p3,
  },
  getWidth: {
    type: "accessor" as const,
    value: (datum: BezierSegmentDatum) => datum.width,
  },
  getColor: {
    type: "accessor" as const,
    value: (datum: BezierSegmentDatum) => datum.color,
  },
  getClipA: {
    type: "accessor" as const,
    value: (datum: BezierSegmentDatum) => datum.clipA ?? [0, 0, 0],
  },
  getClipB: {
    type: "accessor" as const,
    value: (datum: BezierSegmentDatum) => datum.clipB ?? [0, 0, 0],
  },
  boundsPaddingPixels: 4,
  widthUnits: "pixels" as const,
  widthScale: 1,
  haloWidthFactor: 0,
  haloColor: [0, 0, 0, 0] as readonly [number, number, number, number],
};

export class BezierSDFLayer extends Layer<BezierSDFLayerProps> {
  static layerName = "BezierSDFLayer";
  static defaultProps = defaultProps;

  getShaders() {
    return super.getShaders({
      vs,
      fs,
      modules: [project32, picking, bezierUniforms],
    });
  }

  initializeState() {
    // initializeState runs after Layer constructs the attribute manager.
    const attributeManager = this.getAttributeManager()!;

    attributeManager.addInstanced({
      instanceP0: {
        size: 2,
        accessor: "getP0",
        defaultValue: [0, 0],
      },
      instanceP1: {
        size: 2,
        accessor: "getP1",
        defaultValue: [0, 0],
      },
      instanceP2: {
        size: 2,
        accessor: "getP2",
        defaultValue: [0, 0],
      },
      instanceP3: {
        size: 2,
        accessor: "getP3",
        defaultValue: [0, 0],
      },
      instanceWidths: {
        size: 1,
        accessor: "getWidth",
        defaultValue: 4,
      },
      instanceColors: {
        size: 4,
        accessor: "getColor",
        type: "unorm8",
        defaultValue: DEFAULT_COLOR,
      },
      instanceClipA: {
        size: 3,
        accessor: "getClipA",
        defaultValue: [0, 0, 0],
      },
      instanceClipB: {
        size: 3,
        accessor: "getClipB",
        defaultValue: [0, 0, 0],
      },
    });

    this.setState({ model: this._getModel() });
  }

  updateState(params: UpdateParameters<this>) {
    super.updateState(params);

    if (params.changeFlags.extensionsChanged) {
      // Layer.state is untyped; model is optional until initializeState completes.
      (this.state as { model?: Model }).model?.destroy();
      this.setState({ model: this._getModel() });
      this.getAttributeManager()?.invalidateAll();
    }
  }

  draw() {
    const model = (this.state as { model: Model }).model;
    const { viewport, renderPass } = this.context;
    const haloColor = this.props.haloColor ?? [0, 0, 0, 0];

    model.shaderInputs.setProps({
      bezier: {
        uHaloColor: [
          haloColor[0] / 255,
          haloColor[1] / 255,
          haloColor[2] / 255,
          haloColor[3] / 255,
        ] as [number, number, number, number],
        uViewportSize: [viewport.width, viewport.height] as [number, number],
        uBoundsPaddingPixels: this.props.boundsPaddingPixels ?? 4,
        widthUnits: UNIT[this.props.widthUnits ?? "pixels"],
        widthScale: this.props.widthScale ?? 1,
        uHaloWidthFactor: this.props.haloWidthFactor ?? 0,
      },
    });

    model.draw(renderPass);
  }

  finalizeState(context: Parameters<Layer["finalizeState"]>[0]) {
    (this.state as { model?: Model }).model?.destroy();
    super.finalizeState(context);
  }

  _getModel(): Model {
    // Two triangles forming a [-1,1] quad. Each Bezier segment
    // is instanced onto this quad, which the vertex shader scales
    // to the control point bounding box in screen space.
    const positions = new Float32Array([
      -1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1,
    ]);

    return new Model(this.context.device, {
      ...this.getShaders(),
      id: this.props.id,
      bufferLayout: this.getAttributeManager()!.getBufferLayouts(),
      geometry: new Geometry({
        topology: "triangle-list",
        attributes: {
          positions: { size: 2, value: positions },
        },
      }),
      isInstanced: true,
    });
  }
}
