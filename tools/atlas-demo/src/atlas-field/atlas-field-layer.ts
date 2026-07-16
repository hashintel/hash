/** Fullscreen neutral glow for the scalar field produced before screen rendering. */

import { Layer, type LayerProps } from "@deck.gl/core";
import { Geometry, Model } from "@luma.gl/engine";

import type { AtlasFieldRenderState } from "./atlas-field-effect";
import type { RenderPass } from "@luma.gl/core";
import type { ShaderModule } from "@luma.gl/shadertools";

interface CompositeUniformProps {
  fieldSize: [number, number];
  densityScale: number;
  opacity: number;
}

const compositeUniforms = {
  name: "atlasComposite",
  fs: `\
layout(std140) uniform atlasCompositeUniforms {
  vec2 fieldSize;
  float densityScale;
  float opacity;
} atlasComposite;
`,
  uniformTypes: {
    fieldSize: "vec2<f32>",
    densityScale: "f32",
    opacity: "f32",
  },
  defaultUniforms: {
    fieldSize: [1, 1],
    densityScale: 1,
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
  float totalDensity = max(texture(fieldTexture, uv).r, 0.0);
  float exposedDensity = log(
    1.0 + totalDensity * atlasComposite.densityScale
  );
  float glow = 1.0 - exp(-exposedDensity * 0.65);
  float veil = pow(glow, 0.85);
  float core = glow * glow;

  vec3 backgroundColor = vec3(0.012, 0.022, 0.029);
  vec3 neutralGlowColor = vec3(0.34, 0.36, 0.37);
  vec3 color =
    backgroundColor +
    neutralGlowColor * (veil * 0.28 + core * 0.12);

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

/** Draws a subtle log-exposed density glow beneath the crisp mark pass. */
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
        densityScale: renderState.exposure.densityScale,
        fieldSize: [renderState.width, renderState.height],
        opacity: this.props.opacity ?? 1,
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
