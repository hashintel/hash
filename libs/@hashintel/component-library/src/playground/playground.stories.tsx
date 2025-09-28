/* eslint-disable import/no-default-export */
import { css } from "@hashintel/styled-system/css";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { Bar } from "../components/Bar/bar";
import { Button } from "../components/Button/button";
import { SegmentedControl } from "../components/SegmentedControl/segmented-control";
import { Slider } from "../components/Slider/slider";
import { Switch } from "../components/Switch/switch";
import { ExampleArticle } from "./ExampleArticle";

const PADDING = 6;
const RADIUS = 20;

const Playground = () => {
  const [switchChecked, setSwitchChecked] = useState(false);
  const [sliderValue, setSliderValue] = useState(50);
  const [currentPage, setCurrentPage] = useState("design");

  return (
    <div style={{ position: "relative", minHeight: "100vh" }}>
      {/* Scrollable background content */}
      <div
        style={{
          minHeight: "200vh", // Make it taller to ensure scrolling
          overflow: "auto",
        }}
      >
        <ExampleArticle />
      </div>

      {/* Fixed UI overlay */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          pointerEvents: "none", // Allow scrolling through the overlay
          zIndex: 10,
        }}
      >
        <Bar
          radius={RADIUS}
          blur={2}
          specularOpacity={0.7}
          scaleRatio={1}
          bezelWidth={RADIUS - 1}
          glassThickness={70}
          refractiveIndex={1.5}
          className={css({
            shadow: "xl",
            display: "flex",
            flexDirection: "column",
            gap: "1",
            alignItems: "center",
            pointerEvents: "auto", // Re-enable pointer events for the Bar itself
            backgroundColor: "gray.20/40",
          })}
          style={{
            padding: PADDING,
          }}
        >
          <div
            className={css({
              padding: "6",
              flexDirection: "column",
              display: "flex",
              alignItems: "center",
              width: "[100%]",
              backgroundColor: "whiteAlpha.90",
              shadow: "md",
            })}
            style={{
              borderRadius: RADIUS - PADDING,
            }}
          >
            <h2
              className={css({
                fontSize: "1.5rem",
                fontWeight: "600",
                textAlign: "center",
                marginBottom: "5",
              })}
            >
              Interactive Playground
            </h2>

            <SegmentedControl
              radius={22}
              specularOpacity={0.8}
              glassThickness={20}
              bezelWidth={11}
              blur={1.7}
              options={[
                { name: "Design", value: "design" },
                { name: "Actions", value: "actions" },
              ]}
              value={currentPage}
              onValueChange={setCurrentPage}
              className={css({
                color: "neutral.black/80",
                backgroundColor: "gray.30",
                marginBottom: "5",
              })}
            />

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                width: "100%",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontSize: "1rem" }}>Enable Feature:</span>
              <Switch
                checked={switchChecked}
                onCheckedChange={(checked) => setSwitchChecked(checked)}
              />
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                width: "100%",
              }}
            >
              <Slider
                defaultValue={sliderValue}
                onChange={(value) => setSliderValue(value[0] ?? 0)}
                label="Intensity Level"
                showValueText
                min={0}
                max={100}
              />
            </div>

            <div
              style={{
                marginTop: "1rem",
                padding: "1rem",
                backgroundColor: switchChecked
                  ? "rgba(34, 197, 94, 0.2)"
                  : "rgba(239, 68, 68, 0.2)",
                borderRadius: "8px",
                border: switchChecked
                  ? "1px solid rgba(34, 197, 94, 0.4)"
                  : "1px solid rgba(239, 68, 68, 0.4)",
                width: "100%",
                textAlign: "center",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: "0.875rem",
                }}
              >
                Status: {switchChecked ? "Active" : "Inactive"}
              </p>
              <p
                style={{
                  margin: "0.25rem 0 0 0",
                  fontSize: "0.875rem",
                  opacity: 0.8,
                }}
              >
                Current intensity level: {sliderValue}%
              </p>
            </div>
          </div>
          <div
            className={css({
              padding: "2",
              display: "flex",
              gap: "1",
              justifyContent: "end",
              width: "100%",
            })}
          >
            <Button>Cancel</Button>
            <Button
              className={css({
                backgroundColor: "neutral.black/80",
                color: "neutral.white",
              })}
            >
              Confirm
            </Button>
          </div>
        </Bar>
      </div>
    </div>
  );
};

const meta: Meta<typeof Playground> = {
  title: "Playground",
  component: Playground,
  parameters: {
    layout: "fullscreen",
    backgrounds: {
      default: "dark",
      values: [
        { name: "dark", value: "#1a1a1a" },
        { name: "light", value: "#f5f5f5" },
      ],
    },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Interactive: Story = {};
