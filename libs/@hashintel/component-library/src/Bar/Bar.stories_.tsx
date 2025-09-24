import type { Meta, StoryObj } from "@storybook/react-vite";

import { Bar } from "./Bar_";

const meta = {
  title: "Component Library/Bar",
  component: Bar,
  tags: ["docsPage"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: `
A sophisticated bar component with advanced visual effects including blur, 
specular highlights, and refraction. This component serves as a building block 
for creating glass-like UI elements with customizable dimensions and visual properties.

## Features
- 🎨 Advanced visual effects (blur, specular highlights, refraction)
- 📏 Customizable dimensions (width, height, radius)
- ⚙️ Configurable visual parameters
- 🌟 Glass-like appearance with realistic lighting
- 🔧 Flexible scale ratio for dynamic effects
- 🖼️ Adjustable bezel width for frame customization
- 🔍 Variable glass thickness for refraction depth control
- ⚗️ Configurable refractive index for different material simulation

## Usage
The Bar component accepts props to control its dimensions and visual appearance.
Use the Storybook controls panel to experiment with different settings and see
how each parameter affects the final appearance.
        `,
      },
    },
  },
  argTypes: {
    width: {
      control: {
        type: "range",
        min: 50,
        max: 500,
        step: 10,
      },
      description: "Width of the bar element in pixels",
    },
    height: {
      control: {
        type: "range",
        min: 20,
        max: 200,
        step: 5,
      },
      description: "Height of the bar element in pixels",
    },
    radius: {
      control: {
        type: "range",
        min: 0,
        max: 50,
        step: 1,
      },
      description: "Border radius for rounded corners",
    },
    blur: {
      control: {
        type: "range",
        min: 0,
        max: 40,
        step: 0.1,
      },
      description: "Blur intensity for the backdrop filter effect",
    },
    specularOpacity: {
      control: {
        type: "range",
        min: 0,
        max: 1,
        step: 0.01,
      },
      description: "Controls the intensity of specular highlights",
    },
    specularSaturation: {
      control: {
        type: "range",
        min: 0,
        max: 50,
        step: 1,
      },
      description: "Adjusts the color saturation of highlights",
    },
    scaleRatio: {
      control: {
        type: "range",
        min: 0,
        max: 2,
        step: 0.1,
      },
      description: "Scale ratio for the refraction effect",
    },
    bezelWidth: {
      control: {
        type: "range",
        min: 1,
        max: 50,
        step: 1,
      },
      description: "Width of the bezel frame around the glass element",
    },
    glassThickness: {
      control: {
        type: "range",
        min: 20,
        max: 200,
        step: 5,
      },
      description: "Thickness of the glass material affecting refraction depth",
    },
    refractiveIndex: {
      control: {
        type: "range",
        min: 1.0,
        max: 2.5,
        step: 0.01,
      },
      description:
        "Refractive index of the glass material (1.0 = air, 1.5 = typical glass)",
    },
  },
  args: {
    width: 200,
    height: 60,
    radius: 15,
    blur: 5,
    specularOpacity: 0.5,
    specularSaturation: 10,
    scaleRatio: 0.8,
    bezelWidth: 16,
    glassThickness: 80,
    refractiveIndex: 1.45,
  },
} satisfies Meta<typeof Bar>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The default Bar component with standard settings.
 * This demonstrates the basic glass-like appearance of the bar.
 */
export const Default: Story = {};

/**
 * A wider bar demonstrating how the component scales horizontally.
 */
export const Wide: Story = {
  args: {
    width: 400,
    height: 60,
    radius: 20,
  },
  parameters: {
    docs: {
      description: {
        story:
          "A wider variant showing how the Bar component adapts to different widths while maintaining its visual quality.",
      },
    },
  },
};

/**
 * A tall bar demonstrating vertical scaling capabilities.
 */
export const Tall: Story = {
  args: {
    width: 150,
    height: 120,
    radius: 25,
  },
  parameters: {
    docs: {
      description: {
        story:
          "A taller variant demonstrating how the component works with different height proportions.",
      },
    },
  },
};

/**
 * Sharp rectangular bar with minimal rounded corners.
 */
export const Rectangular: Story = {
  args: {
    width: 300,
    height: 40,
    radius: 2,
  },
  parameters: {
    docs: {
      description: {
        story:
          "A more rectangular appearance with minimal border radius for modern, sharp designs.",
      },
    },
  },
};

/**
 * Highly rounded bar approaching a pill shape.
 */
export const Pill: Story = {
  args: {
    width: 250,
    height: 50,
    radius: 25,
  },
  parameters: {
    docs: {
      description: {
        story:
          "A pill-shaped variant with high border radius for a softer, more organic appearance.",
      },
    },
  },
};

/**
 * Enhanced visual effects with higher blur and specular settings.
 */
export const Enhanced: Story = {
  args: {
    width: 250,
    height: 80,
    radius: 20,
    blur: 15,
    specularOpacity: 0.8,
    specularSaturation: 25,
    scaleRatio: 1.2,
  },
  parameters: {
    docs: {
      description: {
        story: `
Enhanced visual effects demonstrating:
- **Higher Blur**: More prominent backdrop filtering
- **Increased Specular Opacity**: More intense highlights
- **Higher Saturation**: More vivid color effects
- **Larger Scale Ratio**: More pronounced refraction effect
        `,
      },
    },
  },
};

/**
 * Minimal visual effects for a subtle, clean appearance.
 */
export const Minimal: Story = {
  args: {
    width: 200,
    height: 60,
    radius: 10,
    blur: 0,
    specularOpacity: 0.2,
    specularSaturation: 2,
    scaleRatio: 0.3,
  },
  parameters: {
    docs: {
      description: {
        story:
          "A subtle version with minimal visual effects for more conservative or minimalist designs.",
      },
    },
  },
};

/**
 * Small compact bar for tight layouts or accent elements.
 */
export const Small: Story = {
  args: {
    width: 100,
    height: 30,
    radius: 8,
    blur: 3,
    specularOpacity: 0.4,
    specularSaturation: 8,
    scaleRatio: 0.6,
  },
  parameters: {
    docs: {
      description: {
        story:
          "A compact version suitable for smaller UI elements, buttons, or accent pieces.",
      },
    },
  },
};

/**
 * Large prominent bar for hero sections or main elements.
 */
export const Large: Story = {
  args: {
    width: 400,
    height: 100,
    radius: 30,
    blur: 8,
    specularOpacity: 0.6,
    specularSaturation: 15,
    scaleRatio: 1.0,
  },
  parameters: {
    docs: {
      description: {
        story:
          "A large, prominent variant suitable for hero sections, main call-to-action elements, or feature highlights.",
      },
    },
  },
};

/**
 * Demonstrates advanced optical properties with customized bezel, glass thickness, and refractive index.
 * This story showcases how the new optical parameters affect the visual appearance of the component.
 */
export const OpticalProperties: Story = {
  args: {
    width: 250,
    height: 80,
    radius: 20,
    blur: 10,
    specularOpacity: 0.8,
    specularSaturation: 20,
    scaleRatio: 1.3,
    bezelWidth: 25,
    glassThickness: 120,
    refractiveIndex: 1.8,
  },
  parameters: {
    docs: {
      description: {
        story: `
This variant demonstrates the new optical properties:
- **Bezel Width**: Wider bezel frame (25px) for more pronounced edge effects
- **Glass Thickness**: Increased thickness (120px) creates deeper refraction
- **Refractive Index**: Higher index (1.8) simulates dense optical glass or crystal
        
These parameters allow fine-tuning of the optical behavior to simulate different 
materials from standard window glass to high-index optical crystals.
        `,
      },
    },
  },
};

/**
 * Bar component with scrollable content behind it demonstrating the refraction and blur effects.
 * Scroll the background content to see how the bar interacts with different content underneath.
 */
export const WithScrollableContent: Story = {
  args: {
    width: 300,
    height: 80,
    radius: 20,
    blur: 12,
    specularOpacity: 0.7,
    specularSaturation: 18,
    scaleRatio: 1.1,
  },
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        story: `
This story demonstrates the Bar component positioned over scrollable content, 
showcasing how the blur and refraction effects interact with background content. 
The article content provides varied colors and textures that help visualize 
the component's optical effects.
        `,
      },
    },
  },
  decorators: [
    (Story) => (
      <div style={{ position: "relative", height: "100vh", overflow: "auto" }}>
        {/* Background content */}
        <div
          style={{
            padding: "2rem",
            maxWidth: "800px",
            margin: "0 auto",
            lineHeight: "1.6",
            fontSize: "16px",
            color: "#333",
          }}
        >
          <h1
            style={{
              fontSize: "2.5rem",
              marginBottom: "2rem",
              color: "#1a365d",
            }}
          >
            Understanding Optics and Refraction
          </h1>

          <p>
            Optics, the branch of physics concerned with the behavior and
            properties of light, has fascinated scientists and philosophers for
            millennia. From the ancient Greeks' understanding of vision to
            modern quantum optics, this field continues to reveal the
            fundamental nature of electromagnetic radiation and its interaction
            with matter. The study of optics encompasses not only the visible
            spectrum but extends to infrared, ultraviolet, and other forms of
            electromagnetic radiation.
          </p>

          <p>
            The phenomenon of refraction stands as one of the most fundamental
            concepts in optics. When light travels from one medium to another
            with a different optical density, it bends at the interface between
            the two materials. This bending occurs because light travels at
            different speeds in different materials, a property quantified by
            the refractive index of each medium.
          </p>

          <h2
            style={{
              fontSize: "1.8rem",
              marginTop: "2rem",
              marginBottom: "1rem",
              color: "#2d3748",
            }}
          >
            The Physics of Light Propagation
          </h2>

          <p>
            Light, as an electromagnetic wave, exhibits both wave and particle
            characteristics. When considering refraction, we primarily focus on
            its wave nature. The speed of light in a vacuum is approximately
            299,792,458 meters per second, but this speed decreases when light
            enters a denser medium. The ratio of the speed of light in a vacuum
            to its speed in a given material defines that material's refractive
            index.
          </p>

          <img
            src="https://images.unsplash.com/photo-1497178398528-7ff4a4bad7ab?q=80&w=2670&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
            alt="Scientific equipment demonstrating optical phenomena"
            style={{
              width: "100%",
              height: "400px",
              objectFit: "cover",
              borderRadius: "8px",
              margin: "2rem 0",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            }}
          />

          <p>
            Snell's Law, formulated by Willebrord Snellius in 1621,
            mathematically describes the relationship between the angles of
            incidence and refraction. The law states that the ratio of the sines
            of the angles of incidence and refraction is equivalent to the ratio
            of phase velocities in the two media, or equivalently, to the
            opposite ratio of the indices of refraction.
          </p>

          <h2
            style={{
              fontSize: "1.8rem",
              marginTop: "2rem",
              marginBottom: "1rem",
              color: "#2d3748",
            }}
          >
            Applications in Modern Technology
          </h2>

          <p>
            The principles of refraction find extensive applications in modern
            technology. Optical lenses, the foundation of cameras, microscopes,
            and telescopes, rely entirely on controlled refraction to focus
            light. The careful shaping of glass or other transparent materials
            allows engineers to manipulate light paths with extraordinary
            precision, enabling everything from corrective eyewear to
            sophisticated scientific instruments.
          </p>

          <p>
            Fiber optic communications represent perhaps the most revolutionary
            application of optical principles in recent decades. By utilizing
            total internal reflection, a phenomenon closely related to
            refraction, optical fibers can transmit light signals across vast
            distances with minimal loss. This technology forms the backbone of
            modern internet infrastructure and high-speed data transmission.
          </p>

          <h2
            style={{
              fontSize: "1.8rem",
              marginTop: "2rem",
              marginBottom: "1rem",
              color: "#2d3748",
            }}
          >
            Dispersion and Chromatic Effects
          </h2>

          <p>
            One of the most visually striking aspects of refraction is
            dispersion, the separation of white light into its component colors.
            This phenomenon occurs because different wavelengths of light have
            slightly different refractive indices in the same medium. The
            familiar rainbow created by a prism demonstrates this principle, as
            shorter wavelengths (blue and violet) are bent more than longer
            wavelengths (red and orange).
          </p>

          <p>
            Atmospheric refraction creates numerous optical phenomena that we
            observe in daily life. Mirages, the apparent bending of the horizon,
            and the flattened appearance of the sun at sunset all result from
            light bending as it passes through air layers of varying density and
            temperature. These effects remind us that our atmosphere itself acts
            as a complex optical medium.
          </p>

          <h2
            style={{
              fontSize: "1.8rem",
              marginTop: "2rem",
              marginBottom: "1rem",
              color: "#2d3748",
            }}
          >
            Quantum Optics and Modern Research
          </h2>

          <p>
            Modern optics extends far beyond classical wave theory into the
            realm of quantum mechanics. Quantum optics studies the quantum
            mechanical properties of light and its interaction with matter at
            the most fundamental level. This field has led to revolutionary
            technologies such as lasers, which produce coherent light through
            stimulated emission of radiation.
          </p>

          <p>
            Research in metamaterials has opened entirely new possibilities for
            manipulating light. These artificially structured materials can
            exhibit refractive indices not found in nature, including negative
            refraction. Such materials could potentially enable cloaking devices
            and perfect lenses that surpass the diffraction limit of
            conventional optics.
          </p>

          <h2
            style={{
              fontSize: "1.8rem",
              marginTop: "2rem",
              marginBottom: "1rem",
              color: "#2d3748",
            }}
          >
            Biological Optics
          </h2>

          <p>
            Nature has evolved sophisticated optical systems that often surpass
            human engineering in their elegance and efficiency. The compound
            eyes of insects, the reflective tapetum in nocturnal animals, and
            the focusing mechanisms of vertebrate eyes all demonstrate
            remarkable applications of optical principles. These biological
            systems continue to inspire biomimetic approaches to optical design.
          </p>

          <p>
            The study of how living organisms interact with light extends to
            phenomena such as bioluminescence, structural coloration in
            butterflies and birds, and the photosynthetic machinery of plants.
            These systems often exploit quantum effects and molecular-scale
            optics in ways that push the boundaries of our understanding of
            light-matter interactions.
          </p>

          <p style={{ marginBottom: "4rem" }}>
            As we continue to push the frontiers of optical science, from
            quantum computing applications to advanced imaging systems, the
            fundamental principles of refraction and light propagation remain as
            relevant as ever. The interplay between theoretical understanding
            and practical application continues to drive innovations that shape
            our technological landscape and deepen our comprehension of the
            physical world.
          </p>
        </div>

        {/* Fixed Bar component overlay */}
        <div
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 10,
          }}
        >
          <Story />
        </div>
      </div>
    ),
  ],
};
