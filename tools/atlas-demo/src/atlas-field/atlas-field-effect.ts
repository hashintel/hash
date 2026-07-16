/**
 * Public deck.gl effect that renders the active frontier into a floating-point
 * field before the normal screen layer pass begins.
 *
 * The effect owns every offscreen resource. Its companion screen layer only
 * borrows the current texture through {@link AtlasFieldRenderState}.
 */

import {
  COORDINATE_SYSTEM,
  project32,
  type Deck,
  type Effect,
  type EffectContext,
  type PreRenderOptions,
  type Viewport,
} from "@deck.gl/core";
import {
  Buffer,
  Texture,
  type Buffer as LumaBuffer,
  type Device,
  type Framebuffer,
  type Texture as LumaTexture,
  type TextureFormatColor,
} from "@luma.gl/core";
import { Geometry, Model } from "@luma.gl/engine";

import {
  deriveAtlasFieldNormalization,
  packAtlasField,
  type AtlasFieldNormalization,
} from "./atlas-field-data";

import type { WeightedAtlasTile } from "../atlas-frontier";
import type { ShaderModule } from "@luma.gl/shadertools";

const normalizerSize = 128;
const normalizationIntervalMilliseconds = 1_000;
const baseSplatRadius = 7;
const deliveryBandOffset = 7;
const maximumFieldLevel = 13;

interface FieldUniformProps {
  baseRadius: number;
  deliveryBandOffset: number;
  maximumFieldLevel: number;
}

const fieldUniforms = {
  name: "atlasField",
  vs: `\
layout(std140) uniform atlasFieldUniforms {
  float baseRadius;
  float deliveryBandOffset;
  float maximumFieldLevel;
} atlasField;
`,
  uniformTypes: {
    baseRadius: "f32",
    deliveryBandOffset: "f32",
    maximumFieldLevel: "f32",
  },
  defaultUniforms: {
    baseRadius: baseSplatRadius,
    deliveryBandOffset,
    maximumFieldLevel,
  },
} satisfies ShaderModule<FieldUniformProps>;

const splatVertexShader = `\
#version 300 es
#define SHADER_NAME atlas-field-splat-vertex

in vec2 positions;
in vec2 instancePositions;
in float instanceMasses;
in float instanceTileZooms;

out vec2 vCorner;
out float vMass;

void main(void) {
  vec3 commonPosition = project_position(vec3(instancePositions, 0.0));
  vec4 clipPosition =
    project_common_position_to_clipspace(vec4(commonPosition, 1.0));
  float tileBand =
    instanceTileZooms + atlasField.deliveryBandOffset;
  float radius = clamp(
    atlasField.baseRadius *
      exp2((atlasField.maximumFieldLevel - tileBand) * 0.5),
    2.0,
    48.0
  );
  vec2 clipOffset = project_pixel_size_to_clipspace(positions * radius);
  clipPosition.xy += clipOffset * clipPosition.w;

  gl_Position = clipPosition;
  vCorner = positions;
  vMass = instanceMasses;
}
`;

const splatFragmentShader = `\
#version 300 es
#define SHADER_NAME atlas-field-splat-fragment
precision highp float;

in vec2 vCorner;
in float vMass;

out vec4 fragColor;

void main(void) {
  float distanceSquared = dot(vCorner, vCorner);
  if (distanceSquared > 1.0) {
    discard;
  }
  float kernel = exp(-distanceSquared * 3.0);
  fragColor = vec4(vMass * kernel, 0.0, 0.0, 0.0);
}
`;

interface DownsampleUniformProps {
  outputSize: [number, number];
}

const downsampleUniforms = {
  name: "atlasDownsample",
  fs: `\
layout(std140) uniform atlasDownsampleUniforms {
  vec2 outputSize;
} atlasDownsample;
`,
  uniformTypes: {
    outputSize: "vec2<f32>",
  },
  defaultUniforms: {
    outputSize: [normalizerSize, normalizerSize],
  },
} satisfies ShaderModule<DownsampleUniformProps>;

const fullscreenVertexShader = `\
#version 300 es
#define SHADER_NAME atlas-fullscreen-vertex

in vec2 positions;
out vec2 vUv;

void main(void) {
  gl_Position = vec4(positions, 0.0, 1.0);
  vUv = positions * 0.5 + 0.5;
}
`;

const downsampleFragmentShader = `\
#version 300 es
#define SHADER_NAME atlas-field-downsample-fragment
precision highp float;

uniform sampler2D fieldTexture;
in vec2 vUv;
out vec4 fragColor;

void main(void) {
  vec2 footprint = 1.0 / atlasDownsample.outputSize;
  vec2 startUv = vUv - footprint * 0.5;
  float total = 0.0;
  for (int y = 0; y < 4; y++) {
    for (int x = 0; x < 4; x++) {
      vec2 offset = (vec2(float(x), float(y)) + 0.5) / 4.0;
      total += texture(fieldTexture, startUv + offset * footprint).r;
    }
  }
  fragColor = vec4(total / 16.0, 0.0, 0.0, 1.0);
}
`;

const fullscreenGeometry = (): Geometry =>
  new Geometry({
    topology: "triangle-list",
    attributes: {
      positions: {
        size: 2,
        value: new Float32Array([-1, -1, 3, -1, -1, 3]),
      },
    },
  });

/** Mutable texture publication shared with the screen composite layer. */
export interface AtlasFieldRenderState {
  error?: string;
  fieldRevision: number;
  format?: TextureFormatColor;
  height: number;
  normalization: AtlasFieldNormalization;
  texture: LumaTexture | null;
  width: number;
}

/** Creates the stable state object shared by one effect and screen layer. */
export const createAtlasFieldRenderState = (): AtlasFieldRenderState => ({
  fieldRevision: 0,
  height: 0,
  normalization: { floor: 0.001, reliefNorm: 1 },
  texture: null,
  width: 0,
});

export interface AtlasFieldEffectProps {
  readonly activeTiles: readonly WeightedAtlasTile[];
  readonly onError: (message: string) => void;
  readonly renderState: AtlasFieldRenderState;
}

/** Additive total-density pass for the active Atlas frontier. */
export class AtlasFieldEffect implements Effect {
  readonly id = "atlas-field-effect";
  readonly useInPicking = false;
  props: AtlasFieldEffectProps;

  #deck?: Deck;
  #device?: Device;
  #downsampleFramebuffer?: Framebuffer;
  #downsampleModel?: Model;
  #downsampleTexture?: LumaTexture;
  #fieldFormat?: TextureFormatColor;
  #fieldFramebuffer?: Framebuffer;
  #fieldModel?: Model;
  #fieldTexture?: LumaTexture;
  #lastDataKey = "";
  #lastNormalizationKey = "";
  #lastNormalizationTime = Number.NEGATIVE_INFINITY;
  #massBuffer?: LumaBuffer;
  #positionBuffer?: LumaBuffer;
  #tileZoomBuffer?: LumaBuffer;

  constructor(props: AtlasFieldEffectProps) {
    this.props = props;
  }

  setup({ deck, device }: EffectContext): void {
    this.#deck = deck;
    this.#device = device;
    if (device.type !== "webgl") {
      this.#fail("Atlas field rendering requires a WebGL2 device");
      return;
    }

    const fieldFormat = this.#selectFieldFormat(device);
    if (fieldFormat === undefined) {
      this.#fail(
        "This GPU has no blendable 16-bit floating-point render target",
      );
      return;
    }
    this.#fieldFormat = fieldFormat;
    this.props.renderState.format = fieldFormat;
    this.#fieldModel = this.#createFieldModel(device, fieldFormat);

    const downsampleFormat = this.#selectDownsampleFormat(device);
    if (downsampleFormat !== undefined) {
      this.#createDownsampleResources(device, downsampleFormat);
    }
    this.#uploadFieldData();
  }

  setProps(props: AtlasFieldEffectProps): void {
    this.props = props;
    this.#uploadFieldData();
    this.#deck?.redraw("Atlas field data changed");
  }

  preRender(options: PreRenderOptions): void {
    if (
      options.isPicking ||
      this.#device === undefined ||
      this.#fieldModel === undefined ||
      this.#fieldFormat === undefined
    ) {
      return;
    }
    const viewport = options.viewports[0];
    if (viewport === undefined) {
      return;
    }

    const canvasContext = this.#device.getDefaultCanvasContext();
    const [width, height] = canvasContext.getDrawingBufferSize();
    if (width <= 0 || height <= 0) {
      return;
    }
    this.#ensureFieldTarget(width, height);
    if (
      this.#fieldFramebuffer === undefined ||
      this.#fieldTexture === undefined
    ) {
      return;
    }

    this.#fieldModel.shaderInputs.setProps({
      atlasField: {
        baseRadius: baseSplatRadius,
        deliveryBandOffset,
        maximumFieldLevel,
      },
      project: {
        autoWrapLongitude: false,
        coordinateOrigin: [0, 0, 0],
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        devicePixelRatio: canvasContext.getDevicePixelRatio(),
        viewport,
      },
    });

    const renderPass = this.#device.beginRenderPass({
      clearColor: [0, 0, 0, 0],
      framebuffer: this.#fieldFramebuffer,
      parameters: { viewport: [0, 0, width, height] },
    });
    try {
      this.#fieldModel.draw(renderPass);
    } finally {
      renderPass.end();
    }

    const renderState = this.props.renderState;
    renderState.texture = this.#fieldTexture;
    renderState.width = width;
    renderState.height = height;
    renderState.fieldRevision += 1;
    this.#updateNormalization(viewport);
  }

  cleanup(): void {
    this.#destroyBuffers();
    this.#fieldModel?.destroy();
    this.#downsampleModel?.destroy();
    this.#destroyFieldTarget();
    this.#downsampleFramebuffer?.destroy();
    this.#downsampleTexture?.destroy();
    this.#fieldModel = undefined;
    this.#downsampleModel = undefined;
    this.#downsampleFramebuffer = undefined;
    this.#downsampleTexture = undefined;
    this.#device = undefined;
    this.#deck = undefined;
  }

  #selectFieldFormat(device: Device): TextureFormatColor | undefined {
    const candidates: readonly TextureFormatColor[] = [
      "rg16float",
      "rgba16float",
    ];
    return candidates.find((format) => {
      const capabilities = device.getTextureFormatCapabilities(format);
      return capabilities.create && capabilities.render && capabilities.blend;
    });
  }

  #selectDownsampleFormat(device: Device): TextureFormatColor | undefined {
    const candidates: readonly TextureFormatColor[] = [
      "rgba32float",
      "rgba16float",
    ];
    return candidates.find((format) => {
      const capabilities = device.getTextureFormatCapabilities(format);
      return capabilities.create && capabilities.render;
    });
  }

  #createFieldModel(device: Device, format: TextureFormatColor): Model {
    return new Model(device, {
      id: "atlas-field-splat-model",
      vs: splatVertexShader,
      fs: splatFragmentShader,
      modules: [project32, fieldUniforms],
      geometry: new Geometry({
        topology: "triangle-list",
        attributes: {
          positions: {
            size: 2,
            value: new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]),
          },
        },
      }),
      bufferLayout: [
        {
          format: "float32x2",
          name: "instancePositions",
          stepMode: "instance",
        },
        {
          format: "float32",
          name: "instanceMasses",
          stepMode: "instance",
        },
        {
          format: "float32",
          name: "instanceTileZooms",
          stepMode: "instance",
        },
      ],
      colorAttachmentFormats: [format],
      instanceCount: 0,
      isInstanced: true,
      parameters: {
        blend: true,
        blendAlphaDstFactor: "one",
        blendAlphaOperation: "add",
        blendAlphaSrcFactor: "one",
        blendColorDstFactor: "one",
        blendColorOperation: "add",
        blendColorSrcFactor: "one",
        depthCompare: "always",
        depthWriteEnabled: false,
      },
    });
  }

  #createDownsampleResources(device: Device, format: TextureFormatColor): void {
    this.#downsampleTexture = device.createTexture({
      id: "atlas-field-normalizer-texture",
      format,
      width: normalizerSize,
      height: normalizerSize,
      usage: Texture.RENDER | Texture.SAMPLE | Texture.COPY_SRC,
      sampler: { magFilter: "nearest", minFilter: "nearest" },
    });
    this.#downsampleFramebuffer = device.createFramebuffer({
      id: "atlas-field-normalizer-framebuffer",
      colorAttachments: [this.#downsampleTexture],
      width: normalizerSize,
      height: normalizerSize,
    });
    this.#downsampleModel = new Model(device, {
      id: "atlas-field-normalizer-model",
      vs: fullscreenVertexShader,
      fs: downsampleFragmentShader,
      modules: [downsampleUniforms],
      geometry: fullscreenGeometry(),
      colorAttachmentFormats: [format],
      parameters: {
        blend: false,
        depthCompare: "always",
        depthWriteEnabled: false,
      },
    });
  }

  #ensureFieldTarget(width: number, height: number): void {
    if (
      this.#device === undefined ||
      this.#fieldFormat === undefined ||
      (this.#fieldTexture?.width === width &&
        this.#fieldTexture.height === height)
    ) {
      return;
    }

    this.#destroyFieldTarget();
    this.#fieldTexture = this.#device.createTexture({
      id: "atlas-field-texture",
      format: this.#fieldFormat,
      width,
      height,
      usage: Texture.RENDER | Texture.SAMPLE | Texture.COPY_SRC,
      sampler: { magFilter: "nearest", minFilter: "nearest" },
    });
    this.#fieldFramebuffer = this.#device.createFramebuffer({
      id: "atlas-field-framebuffer",
      colorAttachments: [this.#fieldTexture],
      width,
      height,
    });
  }

  #destroyFieldTarget(): void {
    this.#fieldFramebuffer?.destroy();
    this.#fieldTexture?.destroy();
    this.#fieldFramebuffer = undefined;
    this.#fieldTexture = undefined;
    this.props.renderState.texture = null;
  }

  #dataKey(): string {
    return this.props.activeTiles
      .map(
        ({ massPerPoint, tile }) =>
          `${tile.coordinate.z}/${tile.coordinate.x}/${tile.coordinate.y}:${tile.deliveredCount}:${massPerPoint}`,
      )
      .join("|");
  }

  #uploadFieldData(): void {
    if (this.#device === undefined || this.#fieldModel === undefined) {
      return;
    }
    const dataKey = this.#dataKey();
    if (dataKey === this.#lastDataKey) {
      return;
    }

    try {
      const packed = packAtlasField(this.props.activeTiles);
      this.#destroyBuffers();
      if (packed.instanceCount === 0) {
        this.#fieldModel.setInstanceCount(0);
        this.#lastDataKey = dataKey;
        return;
      }
      this.#positionBuffer = this.#device.createBuffer({
        data: packed.positions,
        usage: Buffer.VERTEX,
      });
      this.#massBuffer = this.#device.createBuffer({
        data: packed.masses,
        usage: Buffer.VERTEX,
      });
      this.#tileZoomBuffer = this.#device.createBuffer({
        data: packed.tileZooms,
        usage: Buffer.VERTEX,
      });
      this.#fieldModel.setAttributes({
        instanceMasses: this.#massBuffer,
        instancePositions: this.#positionBuffer,
        instanceTileZooms: this.#tileZoomBuffer,
      });
      this.#fieldModel.setInstanceCount(packed.instanceCount);
      this.#lastDataKey = dataKey;
    } catch (error) {
      this.#fail(
        error instanceof Error
          ? error.message
          : "Atlas field buffers could not be prepared",
      );
    }
  }

  #destroyBuffers(): void {
    this.#positionBuffer?.destroy();
    this.#massBuffer?.destroy();
    this.#tileZoomBuffer?.destroy();
    this.#positionBuffer = undefined;
    this.#massBuffer = undefined;
    this.#tileZoomBuffer = undefined;
  }

  #updateNormalization(viewport: Viewport): void {
    if (
      this.#device === undefined ||
      this.#fieldTexture === undefined ||
      this.#downsampleFramebuffer === undefined ||
      this.#downsampleModel === undefined
    ) {
      return;
    }

    const normalizationKey = `${this.#lastDataKey}:${viewport.zoom}:${viewport.center.join(",")}:${this.props.renderState.width}x${this.props.renderState.height}`;
    const currentTime = performance.now();
    if (
      normalizationKey === this.#lastNormalizationKey ||
      currentTime - this.#lastNormalizationTime <
        normalizationIntervalMilliseconds
    ) {
      return;
    }

    this.#downsampleModel.setBindings({
      fieldTexture: this.#fieldTexture,
    });
    this.#downsampleModel.shaderInputs.setProps({
      atlasDownsample: {
        outputSize: [normalizerSize, normalizerSize],
      },
    });
    const renderPass = this.#device.beginRenderPass({
      clearColor: [0, 0, 0, 1],
      framebuffer: this.#downsampleFramebuffer,
      parameters: {
        viewport: [0, 0, normalizerSize, normalizerSize],
      },
    });
    try {
      this.#downsampleModel.draw(renderPass);
    } finally {
      renderPass.end();
    }

    const handle = this.#device.handle;
    if (!(handle instanceof WebGL2RenderingContext)) {
      return;
    }
    const target = new Float32Array(normalizerSize * normalizerSize * 4);
    try {
      const samples = this.#device.readPixelsToArrayWebGL(
        this.#downsampleFramebuffer,
        {
          sourceFormat: handle.RGBA,
          sourceHeight: normalizerSize,
          sourceType: handle.FLOAT,
          sourceWidth: normalizerSize,
          target,
        },
      );
      if (samples instanceof Float32Array) {
        this.props.renderState.normalization =
          deriveAtlasFieldNormalization(samples);
      }
      this.#lastNormalizationKey = normalizationKey;
      this.#lastNormalizationTime = currentTime;
    } catch {
      // The field remains usable with conservative defaults when synchronous
      // float readback is unavailable on an otherwise renderable device.
      this.#lastNormalizationKey = normalizationKey;
      this.#lastNormalizationTime = currentTime;
    }
  }

  #fail(message: string): void {
    if (this.props.renderState.error === message) {
      return;
    }
    this.props.renderState.error = message;
    this.props.onError(message);
  }
}
