/**
 * Custom Deck.gl layer: renders community "BubbleSets" as CRISP metaball
 * isocontours — one smooth, hard-edged organic hull per Louvain community.
 *
 * Each INSTANCE is one community: a screen-space quad covering the community's
 * world bbox (+ field-radius padding). The fragment shader sums a finite-support
 * metaball kernel over THAT community's node centres — read from a positions
 * texture via `texelFetch`, using the per-instance [offset, count] range — and
 * THRESHOLDS the field (`smoothstep` with `fwidth` AA). The result is a single
 * smooth contour that merges nearby nodes and has a hard antialiased edge (no
 * muddy gradient overlap), coloured by community. Because each quad sums only its
 * OWN community's nodes, communities stay distinct in one pass — no offscreen FBO.
 *
 * CONNECTIVITY (BubbleSets virtual edges): the field also sums thin CAPSULE
 * kernels over per-community corridor segments — texel PAIRS in the same
 * positions texture, addressed by the per-instance [segOffset, segCount]
 * range, each pair's first texel carrying the capsule radius in `.b`. The
 * corridors follow an MST over the community's members (planned CPU-side in
 * `render/bubble-corridors.ts`), so one community always renders as ONE
 * connected contour instead of an island per spatial clump.
 *
 * Drawn BEHIND the dots/edges (community-force only). Node positions come from the
 * flat SAB (gathered per community into the texture by the presentation layer);
 * everything is in `common`/world units, so the contour scales with zoom. Only
 * non-trivial communities are bubbled (the caller's size threshold), so the count
 * is small and the per-pixel node loop stays cheap.
 */
import { Layer, project32 } from "@deck.gl/core";
import { Geometry, Model } from "@luma.gl/engine";

import type { LayerProps, UpdateParameters } from "@deck.gl/core";
import type { Texture } from "@luma.gl/core";
import type { ShaderModule } from "@luma.gl/shadertools";

/**
 * Loop bound for the per-pixel node sum. Callers must not point an instance's
 * [offset, count] range at more nodes than this: the shader stops summing at
 * the bound, so the hull would silently ignore the excess. The presentation
 * layer downsamples larger communities to fit (see `render/community.ts`).
 */
export const MAX_NODES_PER_COMMUNITY = 256;

/**
 * Loop bound for the per-pixel corridor sum. An MST over ≤ 256 members has
 * ≤ 255 edges; each may split into 2 segments when rerouted around foreign
 * nodes, so 512 covers the worst case.
 */
export const MAX_SEGMENTS_PER_COMMUNITY = 512;

interface BubbleUniformProps {
  /** Metaball field radius per node, in `common` (world) units. */
  fieldRadius: number;
  /** Field value of the isocontour (where the hard edge sits). */
  isoThreshold: number;
  /** Width of the positions texture, for texelFetch index → (x, y). */
  texWidth: number;
}

const bubbleUniforms = {
  name: "bubble",
  vs: `\
layout(std140) uniform bubbleUniforms {
  float fieldRadius;
  float isoThreshold;
  highp int texWidth;
} bubble;
`,
  fs: `\
layout(std140) uniform bubbleUniforms {
  float fieldRadius;
  float isoThreshold;
  highp int texWidth;
} bubble;
`,
  uniformTypes: {
    fieldRadius: "f32",
    isoThreshold: "f32",
    texWidth: "i32",
  },
  defaultUniforms: {
    fieldRadius: 55,
    isoThreshold: 0.5,
    texWidth: 256,
  },
} satisfies ShaderModule<BubbleUniformProps>;

const vs = `\
#version 300 es
#define SHADER_NAME bubble-set-sdf-layer-vertex

in vec2 positions;

in vec4 instanceBounds;     // minX, minY, maxX, maxY (world)
in vec4 instanceColors;
in vec2 instanceNodeRange;  // offset, count into the positions texture
in vec2 instanceSegRange;   // first endpoint-pair texel, segment count

out vec2 vWorldPos;
out vec4 vColor;
flat out int vOffset;
flat out int vCount;
flat out int vSegOffset;
flat out int vSegCount;

void main(void) {
  vec2 uv = positions * 0.5 + 0.5;
  vec2 worldPos = mix(instanceBounds.xy, instanceBounds.zw, uv);

  vWorldPos = worldPos;
  vColor = instanceColors;
  vOffset = int(instanceNodeRange.x);
  vCount = int(instanceNodeRange.y);
  vSegOffset = int(instanceSegRange.x);
  vSegCount = int(instanceSegRange.y);

  vec3 projected = project_position(vec3(worldPos, 0.0));
  gl_Position = project_common_position_to_clipspace(vec4(projected, 1.0));
}
`;

const fs = `\
#version 300 es
#define SHADER_NAME bubble-set-sdf-layer-fragment
precision highp float;

uniform sampler2D positionsTex;

in vec2 vWorldPos;
in vec4 vColor;
flat in int vOffset;
flat in int vCount;
flat in int vSegOffset;
flat in int vSegCount;

out vec4 fragColor;

vec4 fetchTexel(int idx) {
  return texelFetch(positionsTex, ivec2(idx % bubble.texWidth, idx / bubble.texWidth), 0);
}

void main(void) {
  // Sum the finite-support metaball kernel over this community's node centres.
  float field = 0.0;
  for (int i = 0; i < ${MAX_NODES_PER_COMMUNITY}; i++) {
    if (i >= vCount) {
      break;
    }
    float d = distance(vWorldPos, fetchTexel(vOffset + i).rg) / bubble.fieldRadius;
    if (d < 1.0) {
      // Wyvill-style kernel: 1 at the centre, 0 at the rim, C1-continuous so
      // overlapping fields merge into one smooth contour.
      float base = 1.0 - d * d;
      field += base * base;
    }
  }

  // Add the corridor capsules (BubbleSets virtual edges): thin segment kernels
  // along the community's MST, guaranteeing the contour is CONNECTED. Each
  // segment is an endpoint-pair of texels; the first texel's .b carries the
  // capsule radius (world units).
  for (int s = 0; s < ${MAX_SEGMENTS_PER_COMMUNITY}; s++) {
    if (s >= vSegCount) {
      break;
    }
    vec4 endpointA = fetchTexel(vSegOffset + s * 2);
    vec2 endpointB = fetchTexel(vSegOffset + s * 2 + 1).rg;
    float radius = endpointA.b;
    if (radius <= 0.0) {
      continue;
    }
    vec2 pa = vWorldPos - endpointA.rg;
    vec2 ba = endpointB - endpointA.rg;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1.0e-6), 0.0, 1.0);
    float d = length(pa - ba * h) / radius;
    if (d < 1.0) {
      float base = 1.0 - d * d;
      field += base * base;
    }
  }

  // Crisp isocontour at isoThreshold, antialiased by the field's screen-space
  // gradient -- a hard edge at any zoom, not a soft gradient.
  float aa = max(fwidth(field), 1.0e-4);
  float alpha =
    smoothstep(bubble.isoThreshold - aa, bubble.isoThreshold + aa, field) * vColor.a;
  if (alpha <= 0.002) {
    discard;
  }
  fragColor = vec4(vColor.rgb, alpha);
}
`;

interface BinaryAttribute {
  readonly value: Float32Array | Uint8Array;
  readonly size: number;
  readonly stride?: number;
  readonly offset?: number;
  readonly normalized?: boolean;
}

interface BinaryData {
  readonly length: number;
  readonly attributes: Record<string, BinaryAttribute>;
}

interface BubbleSetSDFLayerProps extends LayerProps {
  readonly data: BinaryData;
  /** Node centres + corridor endpoint pairs (world), grouped by community:
   * `texWidth * texHeight` rgba32f texels (`.rg` position, `.b` capsule radius
   * on a segment pair's first texel, unused on point texels). */
  readonly positions: Float32Array;
  /** Bumped when positions are refilled in place; drives a texture re-upload without reallocation. */
  readonly positionsVersion?: number;
  readonly texWidth: number;
  readonly texHeight: number;
  /** Metaball field radius per node, in `common` (world) units. */
  readonly fieldRadius?: number;
  readonly isoThreshold?: number;
}

const defaultProps = {
  positions: { type: "object" as const, value: new Float32Array(0) },
  positionsVersion: { type: "number" as const, value: 0 },
  texWidth: { type: "number" as const, value: 256 },
  texHeight: { type: "number" as const, value: 1 },
  fieldRadius: { type: "number" as const, value: 55 },
  isoThreshold: { type: "number" as const, value: 0.5 },
};

interface BubbleLayerState {
  model?: Model;
  texture?: Texture;
}

export class BubbleSetSDFLayer extends Layer<BubbleSetSDFLayerProps> {
  static layerName = "BubbleSetSDFLayer";
  static defaultProps = defaultProps;

  getShaders() {
    return super.getShaders({
      vs,
      fs,
      modules: [project32, bubbleUniforms],
    });
  }

  initializeState() {
    this.getAttributeManager()!.addInstanced({
      instanceBounds: {
        size: 4,
        accessor: "getBounds",
        defaultValue: [0, 0, 0, 0],
      },
      instanceColors: {
        size: 4,
        accessor: "getColor",
        type: "unorm8",
        defaultValue: [255, 255, 255, 64],
      },
      instanceNodeRange: {
        size: 2,
        accessor: "getNodeRange",
        defaultValue: [0, 0],
      },
      instanceSegRange: {
        size: 2,
        accessor: "getSegRange",
        defaultValue: [0, 0],
      },
    });
    this.setState({ model: this._getModel() });
  }

  updateState(params: UpdateParameters<this>) {
    super.updateState(params);
    const { changeFlags, props, oldProps } = params;

    if (changeFlags.extensionsChanged) {
      (this.state as BubbleLayerState).model?.destroy();
      this.setState({ model: this._getModel() });
      this.getAttributeManager()?.invalidateAll();
    }

    const state = this.state as BubbleLayerState;
    const dimensionsChanged =
      props.texWidth !== oldProps.texWidth ||
      props.texHeight !== oldProps.texHeight;
    if (state.texture === undefined || dimensionsChanged) {
      // First build or dimensions changed: (re)allocate the texture.
      this._createTexture();
    } else if (
      props.positions !== oldProps.positions ||
      props.positionsVersion !== oldProps.positionsVersion
    ) {
      // Same dimensions, moved centres: re-upload in place.
      this._uploadTexture();
    }
  }

  draw() {
    const state = this.state as BubbleLayerState;
    const { model, texture } = state;
    if (!model || !texture) {
      return;
    }
    model.setBindings({ positionsTex: texture });
    model.shaderInputs.setProps({
      bubble: {
        fieldRadius: this.props.fieldRadius ?? 55,
        isoThreshold: this.props.isoThreshold ?? 0.5,
        texWidth: this.props.texWidth,
      },
    });
    model.draw(this.context.renderPass);
  }

  finalizeState(context: Parameters<Layer["finalizeState"]>[0]) {
    const state = this.state as BubbleLayerState;
    state.texture?.destroy();
    state.model?.destroy();
    super.finalizeState(context);
  }

  /** Allocate the rgba32float positions texture and upload the current node centres. */
  _createTexture() {
    const state = this.state as BubbleLayerState;
    state.texture?.destroy();
    state.texture = this.context.device.createTexture({
      format: "rgba32float",
      width: this.props.texWidth,
      height: this.props.texHeight,
      data: this.props.positions,
      sampler: { minFilter: "nearest", magFilter: "nearest" },
    });
  }

  /** Re-upload moved node centres into the existing texture. */
  _uploadTexture() {
    const state = this.state as BubbleLayerState;
    state.texture?.writeData(this.props.positions, {
      width: this.props.texWidth,
      height: this.props.texHeight,
    });
  }

  _getModel(): Model {
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
      // A community hull is a pure BACKDROP -- drawn first, behind everything, never occluding.
      // So it must NOT write depth: each instance fills its community's bounding QUAD and only the
      // metaball hull inside is opaque, so with depth-write on the whole (mostly transparent) quad
      // would stamp the depth buffer and the coplanar bezier edges drawn afterward would fail the
      // depth test across that rectangle and vanish. depthCompare "always" as nothing is behind it.
      parameters: {
        depthWriteEnabled: false,
        depthCompare: "always",
      },
    });
  }
}
