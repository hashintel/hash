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

import { ExampleArticle } from "../../playground/ExampleArticle";
import { RefractiveSurface } from "./refractive-surface";

const meta = {
  title: "Component Library/RefractiveSurface",
  component: RefractiveSurface,
  tags: ["docsPage"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: `
A sophisticated refractive surface component with advanced visual effects including blur, 
specular highlights, and refraction. This component serves as a building block 
for creating glass-like UI elements with customizable dimensions and visual properties.
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
    padding: {
      control: {
        type: "range",
        min: 0,
        max: 20,
        step: 1,
      },
      description: "Padding inside the refractive surface component",
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
    padding: 2,
    blur: 5,
    specularOpacity: 0.5,
    scaleRatio: 0.8,
    bezelWidth: 16,
    glassThickness: 80,
    refractiveIndex: 1.45,
  },
} satisfies Meta<typeof RefractiveSurface>;

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

export const Default: Story = {};

export const OpticalProperties: Story = {
  args: {
    radius: 20,
    blur: 10,
    specularOpacity: 0.8,
    scaleRatio: 1.3,
    bezelWidth: 25,
    glassThickness: 120,
    refractiveIndex: 1.8,
  },
  parameters: {},
};

export const WithDynamicallySizedChildren = {
  args: {
    radius: 15,
    blur: 1.8,
    specularOpacity: 0.6,
    scaleRatio: 0.9,
    bezelWidth: 14,
    glassThickness: 80,
    refractiveIndex: 1.45,
    // These are minimum dimensions - actual size will be determined by children
    width: 200,
    height: 60,
    // Child control properties
    childWidth: 460,
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
      <RefractiveSurface
        style={{
          minWidth: args.width,
          minHeight: args.height,
          scale: 1,
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
      </RefractiveSurface>
    );
  },
};

/**
 * RefractiveSurface component used as a toolbar with interactive buttons and Lucide icons.
 * The toolbar is positioned over scrollable content to demonstrate the refraction and blur effects.
 * Scroll the background content to see how the refractive surface interacts with different content underneath.
 */
export const WithScrollableContent: Story = {
  args: {
    radius: 22,
    blur: 2.4,
    specularOpacity: 0.31,
    scaleRatio: 1.2,
    bezelWidth: 19,
    glassThickness: 100,
    padding: 8,
  },
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div style={{ position: "relative", height: "100vh", overflow: "auto" }}>
        {/* Background content */}
        <ExampleArticle />

        {/* Fixed RefractiveSurface component overlay */}
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
      <RefractiveSurface
        className={css({
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
        style={{
          padding: args.padding,
        }}
      >
        {buttons.map(({ icon: Icon, title, id }) => {
          const isSelected = selectedButton === id;
          return (
            <button
              key={id}
              type="button"
              className={getButtonStyle(isSelected)}
              style={{ borderRadius: args.radius - args.padding }}
              title={title}
              onClick={() => setSelectedButton(id)}
            >
              <Icon size={18} className={getIconStyle(isSelected)} />
            </button>
          );
        })}
      </RefractiveSurface>
    );
  },
};
