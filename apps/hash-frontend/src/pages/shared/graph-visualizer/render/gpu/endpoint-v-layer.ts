/**
 * Instanced endpoint V caps for directed edges.
 *
 * Each instance supplies position, angle, size, chord, and color; one static
 * two-arm mesh is instanced in the vertex shader, keeping CPU buffers to one
 * record per arrow. Chord-based screen-space fade runs in the shader via the
 * project module's world→pixel conversion (`project_size_to_pixel`, which
 * tracks the live viewport), so the flat tier can feed tens of thousands of
 * arrows as binary attributes
 * ({@link "../../frames".RenderEndpointArrowBuffers}) without any per-arrow
 * CPU work on zoom or on frame.
 */
import { Layer, project32 } from "@deck.gl/core";
import { Geometry, Model } from "@luma.gl/engine";

import type { Color } from "../../frames";
import type { Position } from "../../geometry";
import type { LayerProps, UpdateParameters } from "@deck.gl/core";

interface EndpointVDatum extends Position {
  readonly angle: number;
  readonly size: number;
  readonly chord: number;
  readonly color: Color;
}

// Declaration order matches `uniformTypes` (all scalars; std140-safe).
const arrowFadeUniformsGlsl = `\
layout(std140) uniform arrowFadeUniforms {
  float uMinScreenChord;
  float uFadePx;
  float uAlphaBoost;
} arrowFade;
`;

const arrowFadeUniforms = {
  name: "arrowFade",
  vs: arrowFadeUniformsGlsl,
  uniformTypes: {
    uMinScreenChord: "f32" as const,
    uFadePx: "f32" as const,
    uAlphaBoost: "f32" as const,
  },
  defaultUniforms: {
    uMinScreenChord: 36,
    uFadePx: 14,
    uAlphaBoost: 1.28,
  },
};

const vs = `\
#version 300 es
#define SHADER_NAME endpoint-v-layer-vertex

in vec2 positions;

in vec2 instancePositions;
in float instanceAngles;
in float instanceSizes;
in float instanceChords;
in vec4 instanceColors;

out vec4 vColor;

void main(void) {
  float c = cos(instanceAngles);
  float s = sin(instanceAngles);
  vec2 local = positions * instanceSizes;
  vec2 worldOffset = vec2(
    local.x * c - local.y * s,
    local.x * s + local.y * c
  );
  vec2 worldPosition = instancePositions + worldOffset;

  vec3 projected = project_position(vec3(worldPosition, 0.0));
  gl_Position = project_common_position_to_clipspace(vec4(projected, 1.0));

  // Screen-space chord fade: arrows on lanes shorter than uMinScreenChord
  // on screen fade to nothing over uFadePx. Chords are world units (= common
  // under the orthographic view), converted by the project module against
  // the live viewport.
  float screenChord = project_size_to_pixel(instanceChords, UNIT_COMMON);
  float fade = clamp(
    (screenChord - arrowFade.uMinScreenChord + arrowFade.uFadePx) /
      arrowFade.uFadePx,
    0.0,
    1.0
  );
  float boosted = min(1.0, instanceColors.a * arrowFade.uAlphaBoost);
  vColor = vec4(instanceColors.rgb, boosted * fade);
}
`;

const fs = `\
#version 300 es
#define SHADER_NAME endpoint-v-layer-fragment
precision highp float;

in vec4 vColor;

out vec4 fragColor;

void main(void) {
  if (vColor.a <= 0.001) {
    discard;
  }
  fragColor = vColor;
}
`;

interface EndpointVLayerProps extends LayerProps {
  /** Object datums, or a deck binary attribute table (flat tier). */
  readonly data: LayerProps["data"];
  readonly getPosition?: (datum: EndpointVDatum) => readonly [number, number];
  readonly getAngle?: (datum: EndpointVDatum) => number;
  readonly getSize?: (datum: EndpointVDatum) => number;
  readonly getChord?: (datum: EndpointVDatum) => number;
  readonly getColor?: (datum: EndpointVDatum) => Color;
}

const DEFAULT_COLOR: Color = [255, 255, 255, 255];

const defaultProps = {
  getPosition: {
    type: "accessor" as const,
    value: (datum: EndpointVDatum) => [datum.x, datum.y] as const,
  },
  getAngle: {
    type: "accessor" as const,
    value: (datum: EndpointVDatum) => datum.angle,
  },
  getSize: {
    type: "accessor" as const,
    value: (datum: EndpointVDatum) => datum.size,
  },
  getChord: {
    type: "accessor" as const,
    value: (datum: EndpointVDatum) => datum.chord,
  },
  getColor: {
    type: "accessor" as const,
    value: (datum: EndpointVDatum) => datum.color,
  },
};

function endpointVGeometry(): Float32Array {
  const length = 1.95;
  const halfWidth = 0.96;
  const stroke = 0.16;
  const innerIncidenceX = -0.38;
  const armLength = Math.hypot(length, halfWidth);
  const halfStroke = stroke / 2;

  const upperUx = -length / armLength;
  const upperUy = halfWidth / armLength;
  const upperInnerNx = -upperUy * halfStroke;
  const upperInnerNy = upperUx * halfStroke;
  const upperBaseX = -length;
  const upperBaseY = halfWidth;
  const upperInnerBaseX = upperBaseX + upperInnerNx;
  const upperInnerBaseY = upperBaseY + upperInnerNy;
  const upperOuterBaseX = upperBaseX - upperInnerNx;
  const upperOuterBaseY = upperBaseY - upperInnerNy;

  const lowerUx = -length / armLength;
  const lowerUy = -halfWidth / armLength;
  const lowerNormalX = -lowerUy * halfStroke;
  const lowerNormalY = lowerUx * halfStroke;
  const lowerBaseX = -length;
  const lowerBaseY = -halfWidth;
  const lowerInnerBaseX = lowerBaseX - lowerNormalX;
  const lowerInnerBaseY = lowerBaseY - lowerNormalY;
  const lowerOuterBaseX = lowerBaseX + lowerNormalX;
  const lowerOuterBaseY = lowerBaseY + lowerNormalY;

  return new Float32Array([
    0,
    0,
    upperOuterBaseX,
    upperOuterBaseY,
    upperInnerBaseX,
    upperInnerBaseY,
    0,
    0,
    upperInnerBaseX,
    upperInnerBaseY,
    innerIncidenceX,
    0,
    0,
    0,
    innerIncidenceX,
    0,
    lowerInnerBaseX,
    lowerInnerBaseY,
    0,
    0,
    lowerInnerBaseX,
    lowerInnerBaseY,
    lowerOuterBaseX,
    lowerOuterBaseY,
  ]);
}

export class EndpointVLayer extends Layer<EndpointVLayerProps> {
  static layerName = "EndpointVLayer";
  static defaultProps = defaultProps;

  getShaders() {
    return super.getShaders({
      vs,
      fs,
      modules: [project32, arrowFadeUniforms],
    });
  }

  initializeState() {
    const attributeManager = this.getAttributeManager()!;

    attributeManager.addInstanced({
      instancePositions: {
        size: 2,
        accessor: "getPosition",
        defaultValue: [0, 0],
      },
      instanceAngles: {
        size: 1,
        accessor: "getAngle",
        defaultValue: 0,
      },
      instanceSizes: {
        size: 1,
        accessor: "getSize",
        defaultValue: 1,
      },
      instanceChords: {
        size: 1,
        accessor: "getChord",
        defaultValue: 0,
      },
      instanceColors: {
        size: 4,
        accessor: "getColor",
        type: "unorm8",
        defaultValue: DEFAULT_COLOR,
      },
    });

    this.setState({ model: this._getModel() });
  }

  updateState(params: UpdateParameters<this>) {
    super.updateState(params);

    if (params.changeFlags.extensionsChanged) {
      (this.state as { model?: Model }).model?.destroy();
      this.setState({ model: this._getModel() });
      this.getAttributeManager()?.invalidateAll();
    }
  }

  draw() {
    const model = (this.state as { model: Model }).model;
    const { renderPass } = this.context;

    model.shaderInputs.setProps({
      arrowFade: {
        uMinScreenChord: 36,
        uFadePx: 14,
        uAlphaBoost: 1.28,
      },
    });
    model.draw(renderPass);
  }

  finalizeState(context: Parameters<Layer["finalizeState"]>[0]) {
    (this.state as { model?: Model }).model?.destroy();
    super.finalizeState(context);
  }

  _getModel(): Model {
    return new Model(this.context.device, {
      ...this.getShaders(),
      id: this.props.id,
      bufferLayout: this.getAttributeManager()!.getBufferLayouts(),
      geometry: new Geometry({
        topology: "triangle-list",
        attributes: {
          positions: { size: 2, value: endpointVGeometry() },
        },
      }),
      isInstanced: true,
    });
  }
}
