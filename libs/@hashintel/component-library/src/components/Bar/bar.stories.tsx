import { css } from "@hashintel/styled-system/css";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  ArrowUpRight,
  Box,
  ChevronDown,
  Edit3,
  Hand,
  MessageCircle,
  MousePointer2Icon,
  Square,
} from "lucide-react";
import { useState } from "react";

import { Bar } from "./bar";

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

// eslint-disable-next-line import/no-default-export
export default meta;

type Story = StoryObj<typeof meta>;

// Extended args type for stories that include child control properties
type ExtendedArgs = typeof meta.args & {
  childWidth: number;
  childHeight: number;
  childContent: string;
  width: number;
  height: number;
};

/**
 * The default Bar component with standard settings.
 * This demonstrates the basic glass-like appearance of the bar.
 */
export const Default: Story = {};

/**
 * Demonstrates advanced optical properties with customized bezel, glass thickness, and refractive index.
 * This story showcases how the new optical parameters affect the visual appearance of the component.
 */
export const OpticalProperties: Story = {
  args: {
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
 * Bar component with dynamically sized children that can be resized via controls.
 * This story demonstrates how the Bar adapts to its children's dimensions and tracks them with MotionValues.
 */
export const WithDynamicallySizedChildren = {
  args: {
    radius: 15,
    blur: 8,
    specularOpacity: 0.6,
    specularSaturation: 12,
    scaleRatio: 0.9,
    bezelWidth: 16,
    glassThickness: 80,
    refractiveIndex: 1.45,
    // These are minimum dimensions - actual size will be determined by children
    width: 200,
    height: 60,
    // Child control properties
    childWidth: 250,
    childHeight: 100,
    childContent:
      "Resizable Content\nUse Storybook controls to change my size!",
  },
  argTypes: {
    ...meta.argTypes,
    childWidth: {
      control: {
        name: "Child Width",
        type: "range",
        min: 100,
        max: 600,
        step: 10,
      },
      description: "Width of the child content in pixels",
      table: { category: "Child Content" },
    },
    childHeight: {
      control: {
        name: "Child Height",
        type: "range",
        min: 50,
        max: 300,
        step: 10,
      },
      description: "Height of the child content in pixels",
      table: { category: "Child Content" },
    },
    childContent: {
      control: "text",
      description:
        "Text content for the child element (use \\n for line breaks)",
      table: { category: "Child Content" },
    },
  },
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        story: `
This story demonstrates how the Bar component adapts to dynamically sized children.
The Bar will resize to fit its content, and the MotionValues will track these changes
in real-time. Use the Storybook controls panel to adjust the child element's 
dimensions and content to see how the Bar responds.

**Key Features Demonstrated:**
- **Dynamic Sizing**: Bar adapts to content size
- **MotionValue Tracking**: Real-time dimension tracking (check browser console)
- **Flexible Layout**: Content-driven dimensions
- **Storybook Controls**: Use the controls panel to resize child content
- **Background Integration**: Shows how the Bar interacts with background content

Open your browser's console to see the MotionValue dimension tracking in action
as you change the child element's size using the controls panel.
        `,
      },
    },
  },
  decorators: [
    (Story: React.ComponentType) => (
      <div
        style={{
          position: "relative",
          height: "100vh",
          width: "100vw",
          backgroundImage:
            "url(https://images.unsplash.com/photo-1563089145-599997674d42?q=80&w=3270&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
        }}
      >
        <Story />
      </div>
    ),
  ],
  render: (args: ExtendedArgs) => {
    const childWidth = args.childWidth;
    const childHeight = args.childHeight;
    const childContent = args.childContent;

    return (
      <Bar
        style={{
          minWidth: args.width,
          minHeight: args.height,
        }}
        className={css({
          shadow: "md",
          transition: "all",
          transitionDuration: "0.3s",
          transitionTimingFunction: "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
          backgroundColor: "whiteAlpha.10",
          _hover: {
            shadow: "2xl",
            transform: "scale(1.02)",
            backgroundColor: "grayAlpha.40",
          },
        })}
        radius={args.radius}
        blur={args.blur}
        specularOpacity={args.specularOpacity}
        specularSaturation={args.specularSaturation}
        scaleRatio={args.scaleRatio}
        bezelWidth={args.bezelWidth}
        glassThickness={args.glassThickness}
        refractiveIndex={args.refractiveIndex}
      >
        <div
          style={{
            width: childWidth,
            height: childHeight,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "8px",
            padding: "16px",
            fontSize: "14px",
            fontWeight: "500",
            textAlign: "center",
            whiteSpace: "pre-line",
            color: "#ffffff",
            textShadow: "0 1px 2px rgba(0, 0, 0, 0.5)",
            transition: "all 0.3s ease",
          }}
        >
          <div>
            <div>{childContent}</div>
            <div style={{ marginTop: "8px", fontSize: "12px", opacity: 0.8 }}>
              {childWidth} × {childHeight}px
            </div>
          </div>
        </div>
      </Bar>
    );
  },
};

/**
 * Bar component used as a toolbar with interactive buttons and Lucide icons.
 * The toolbar is positioned over scrollable content to demonstrate the refraction and blur effects.
 * Scroll the background content to see how the bar interacts with different content underneath.
 */
export const WithScrollableContent: Story = {
  args: {
    radius: 15,
    blur: 1.5,
    specularOpacity: 0.83,
    specularSaturation: 18,
    scaleRatio: 1.1,
    bezelWidth: 14,
    glassThickness: 85,
  },
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        story: `
This story demonstrates the Bar component used as an interactive toolbar with Lucide icons.
The toolbar contains buttons for common design tools (select, hand, 3D box, comment, edit, etc.)
and is positioned over scrollable content to showcase how the blur and refraction effects 
interact with dynamic background content. 

**Key Features:**
- **Selectable Buttons**: Click any button to select it (only one can be selected at a time)
- **Visual Feedback**: Selected buttons show a blue background with white icons
- **Interactive States**: Hover and active states provide responsive feedback
- **Lucide Icons**: Modern, consistent iconography
- **Glass Effect**: The toolbar maintains the signature glass-like appearance
- **Background Interaction**: Scroll to see how the optical effects work with varied content
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
            bottom: "0%",
            left: "50%",
            transform: "translate(-50%, -25px)",
            zIndex: 10,
          }}
        >
          <Story />
        </div>
      </div>
    ),
  ],
  render: (args: typeof meta.args) => {
    const [selectedButton, setSelectedButton] = useState<string>("select");

    const getButtonStyle = (isSelected: boolean) =>
      css({
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2",
        borderRadius: "lg",
        border: "none",
        cursor: "pointer",
        transition: "all",
        transitionDuration: "200ms",
        backgroundColor: isSelected ? "blue.60" : undefined,
        _hover: {
          transform: "scale(1.05)",
          backgroundColor: isSelected ? "blue.70" : "whiteAlpha.20",
        },
        _active: {
          transform: "scale(0.95)",
          backgroundColor: isSelected ? "blue.80" : "whiteAlpha.30",
        },
      });

    const getIconStyle = (isSelected: boolean) =>
      css({
        color: isSelected ? "neutral.white" : "neutral.black",
        textShadow: isSelected
          ? undefined
          : "[0 1px 4px 2px rgba(255, 255, 255, 1)]",
      });

    const buttons = [
      { icon: MousePointer2Icon, title: "Select Tool", id: "select" },
      { icon: Hand, title: "Hand Tool", id: "hand" },
      { icon: Box, title: "3D Box", id: "box" },
      { icon: MessageCircle, title: "Comment", id: "comment" },
      { icon: Edit3, title: "Edit Tool", id: "edit" },
      { icon: ArrowUpRight, title: "External Link", id: "link" },
      { icon: Square, title: "Rectangle", id: "rectangle" },
      { icon: ChevronDown, title: "More Options", id: "more" },
    ];

    return (
      <Bar
        className={css({
          padding: "2",
          display: "flex",
          alignItems: "center",
          gap: "1",
          shadow: "md",
          backgroundColor: "whiteAlpha.30",
          transition: "[all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)]",
          _hover: {
            transform: "scale(1.03)",
            shadow: "lg",
            backgroundColor: "whiteAlpha.50",
          },
        })}
        {...args}
      >
        {buttons.map(({ icon: Icon, title, id }) => {
          const isSelected = selectedButton === id;
          return (
            <button
              key={id}
              type="button"
              className={getButtonStyle(isSelected)}
              title={title}
              onClick={() => setSelectedButton(id)}
            >
              <Icon size={18} className={getIconStyle(isSelected)} />
            </button>
          );
        })}
      </Bar>
    );
  },
};
