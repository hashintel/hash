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
  float exposed = totalDensity * atlasComposite.densityScale;

  // Reinhard tone mapping keeps decades of density separated: the exposure
  // percentile lands near 0.5 and hot cores approach 1 asymptotically,
  // instead of every dense region saturating to one flat value.
  float luma = exposed / (1.0 + exposed);

  // Density-to-color ramp: faint wisps in dark slate, the structural body in
  // steel blue, and the densest cores in pale near-white. Luminance stays
  // monotone in density, so the ramp encodes the measurement.
  vec3 backgroundColor = vec3(0.008, 0.013, 0.022);
  vec3 wispColor = vec3(0.075, 0.114, 0.184);
  vec3 bodyColor = vec3(0.263, 0.373, 0.475);
  vec3 coreColor = vec3(0.910, 0.945, 0.975);

  vec3 ramp = mix(wispColor, bodyColor, smoothstep(0.10, 0.55, luma));
  ramp = mix(ramp, coreColor, smoothstep(0.55, 0.92, luma));

  // Gate the sensor floor so empty space stays true black instead of
  // lifting readback noise into a gray haze.
  float presence = smoothstep(0.005, 0.09, luma);
  vec3 color = backgroundColor + ramp * presence;

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

/** Draws the tone-mapped density field beneath the crisp mark pass. */
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
