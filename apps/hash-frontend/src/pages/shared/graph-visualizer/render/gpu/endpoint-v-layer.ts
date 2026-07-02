/**
 * Instanced endpoint V caps for flat-tier directed edges.
 *
 * Each instance supplies position, angle, size, and color; one static
 * two-arm mesh is instanced in the vertex shader, keeping CPU buffers to one
 * record per arrow.
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

const vs = `\
#version 300 es
#define SHADER_NAME endpoint-v-layer-vertex

in vec2 positions;

in vec2 instancePositions;
in float instanceAngles;
in float instanceSizes;
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
  vColor = instanceColors;
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

interface EndpointVLayerProps<
  D extends EndpointVDatum = EndpointVDatum,
> extends LayerProps {
  readonly data: readonly D[];
  readonly getPosition?: (datum: D) => readonly [number, number];
  readonly getAngle?: (datum: D) => number;
  readonly getSize?: (datum: D) => number;
  readonly getColor?: (datum: D) => Color;
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
      modules: [project32],
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
