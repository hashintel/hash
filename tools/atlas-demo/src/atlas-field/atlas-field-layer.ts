/** Fullscreen terrain composite for the field texture produced before screen rendering. */

import { Layer, type LayerProps } from "@deck.gl/core";
import { Geometry, Model } from "@luma.gl/engine";

import type { AtlasFieldRenderState } from "./atlas-field-effect";
import type { RenderPass } from "@luma.gl/core";
import type { ShaderModule } from "@luma.gl/shadertools";

interface CompositeUniformProps {
  fieldSize: [number, number];
  floor: number;
  opacity: number;
  reliefNorm: number;
}

const compositeUniforms = {
  name: "atlasComposite",
  fs: `\
layout(std140) uniform atlasCompositeUniforms {
  vec2 fieldSize;
  float floor;
  float reliefNorm;
  float opacity;
} atlasComposite;
`,
  uniformTypes: {
    fieldSize: "vec2<f32>",
    floor: "f32",
    reliefNorm: "f32",
    opacity: "f32",
  },
  defaultUniforms: {
    fieldSize: [1, 1],
    floor: 0.001,
    reliefNorm: 1,
    opacity: 1,
  },
} satisfies ShaderModule<CompositeUniformProps>;

const vertexShader = `\
#version 300 es
#define SHADER_NAME atlas-field-composite-vertex

in vec2 positions;

void main(void) {
  gl_Position = vec4(positions, 0.0, 1.0);
}
`;

const fragmentShader = `\
#version 300 es
#define SHADER_NAME atlas-field-composite-fragment
precision highp float;

uniform sampler2D fieldTexture;
out vec4 fragColor;

void main(void) {
  vec2 uv = gl_FragCoord.xy / atlasComposite.fieldSize;
  float total = texture(fieldTexture, uv).r;

  float land = smoothstep(
    atlasComposite.floor * 0.8,
    atlasComposite.floor * 1.2,
    total
  );
  float relief =
    land *
    max(log(max(total, atlasComposite.floor) / atlasComposite.floor), 0.0) /
    max(atlasComposite.reliefNorm, 1.0e-4);

  vec3 voidColor = vec3(0.025, 0.047, 0.055);
  vec3 lowTerrainColor = vec3(0.10, 0.17, 0.19);
  vec3 highTerrainColor = vec3(0.58, 0.66, 0.68);
  float reliefTone = smoothstep(0.0, 1.0, clamp(relief, 0.0, 1.0));
  vec3 terrainColor = mix(lowTerrainColor, highTerrainColor, reliefTone);
  vec3 color = mix(voidColor, terrainColor, land);

  float coastline = clamp(fwidth(land) * 1.2, 0.0, 0.55);
  color = mix(color, vec3(0.40, 0.59, 0.65), coastline);

  vec2 gradient = vec2(dFdx(relief), dFdy(relief)) * 1.8;
  vec3 normal = normalize(vec3(-gradient, 1.0));
  vec3 lightDirection = normalize(vec3(-0.45, 0.7, 0.8));
  float shade = 0.68 + 0.45 * clamp(dot(normal, lightDirection), 0.0, 1.0);
  color *= mix(1.0, shade, land);

  float elevation = relief / 0.28;
  float lineDistance =
    abs(fract(elevation - 0.5) - 0.5) / max(fwidth(elevation), 1.0e-4);
  float contour = 1.0 - smoothstep(0.55, 1.15, lineDistance);
  float indexWeight = mix(0.24, 0.4, step(2.0, mod(floor(elevation), 3.0)));
  color = mix(color, vec3(0.17, 0.30, 0.33), contour * indexWeight * land);

  fragColor = vec4(color, atlasComposite.opacity);
}
`;

interface AtlasFieldLayerProps extends LayerProps {
  readonly opacity?: number;
  readonly renderState: AtlasFieldRenderState;
}

interface AtlasFieldLayerState {
  model?: Model;
}

const defaultProps = {
  opacity: { type: "number" as const, value: 1, min: 0, max: 1 },
};

/** Draws sea level, hillshade, coastline, and isolines from live field mass. */
export class AtlasFieldLayer extends Layer<AtlasFieldLayerProps> {
  static layerName = "AtlasFieldLayer";
  static defaultProps = defaultProps;

  getShaders() {
    return super.getShaders({
      vs: vertexShader,
      fs: fragmentShader,
      modules: [compositeUniforms],
    });
  }

  initializeState(): void {
    this.setState({
      model: new Model(this.context.device, {
        ...this.getShaders(),
        id: this.id,
        geometry: new Geometry({
          topology: "triangle-list",
          attributes: {
            positions: {
              size: 2,
              value: new Float32Array([-1, -1, 3, -1, -1, 3]),
            },
          },
        }),
        parameters: {
          blend: false,
          depthCompare: "always",
          depthWriteEnabled: false,
        },
      }),
    });
  }

  draw({ renderPass }: { renderPass: RenderPass }): void {
    // Deck's base Layer state is intentionally untyped. This cast narrows the
    // model created exclusively by initializeState above.
    const model = (this.state as AtlasFieldLayerState).model;
    const { renderState } = this.props;
    if (
      model === undefined ||
      renderState.texture === null ||
      renderState.width <= 0 ||
      renderState.height <= 0
    ) {
      return;
    }

    model.setBindings({ fieldTexture: renderState.texture });
    model.shaderInputs.setProps({
      atlasComposite: {
        fieldSize: [renderState.width, renderState.height],
        floor: renderState.normalization.floor,
        opacity: this.props.opacity ?? 1,
        reliefNorm: renderState.normalization.reliefNorm,
      },
    });
    model.draw(renderPass);
  }

  finalizeState(context: Parameters<Layer["finalizeState"]>[0]): void {
    // See draw(): the state object contains only resources created here.
    (this.state as AtlasFieldLayerState).model?.destroy();
    super.finalizeState(context);
  }
}
