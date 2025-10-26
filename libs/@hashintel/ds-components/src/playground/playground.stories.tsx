import { css } from "@hashintel/ds-helpers/css";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  ArrowUpRightIcon,
  BoxIcon,
  ChevronDownIcon,
  Edit3Icon,
  HandIcon,
  MessageCircleIcon,
  MousePointer2Icon,
  SquareIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { Button } from "../components/Button/button";
import { RefractivePane } from "../components/RefractivePane/refractive-pane";
import { SegmentedControl } from "../components/SegmentedControl/segmented-control";
import { Slider } from "../components/Slider/slider";
import { Switch } from "../components/Switch/switch";
import { ExampleArticle } from "./example-article";

const PADDING = 6;
const RADIUS = 25;

const Playground = () => {
  const [switchChecked, setSwitchChecked] = useState(false);
  const [switchChecked2, setSwitchChecked2] = useState(false);
  const [sliderValue, setSliderValue] = useState(50);
  const [currentPage, setCurrentPage] = useState("design");
  const [selectedButton, setSelectedButton] = useState("select");

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
    { icon: HandIcon, title: "Hand Tool", id: "hand" },
    { icon: BoxIcon, title: "3D Box", id: "box" },
    { icon: MessageCircleIcon, title: "Comment", id: "comment" },
    { icon: Edit3Icon, title: "Edit Tool", id: "edit" },
    { icon: ArrowUpRightIcon, title: "External Link", id: "link" },
    { icon: SquareIcon, title: "Rectangle", id: "rectangle" },
    { icon: ChevronDownIcon, title: "More Options", id: "more" },
  ];

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
          padding: 20,
          alignItems: "end",
          pointerEvents: "none", // Allow scrolling through the overlay
          zIndex: 10,
        }}
      >
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
          <AnimatePresence mode="wait">
            {selectedButton === "box" && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8, y: 90 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 90 }}
                transition={{ duration: 0.16, ease: "easeInOut" }}
              >
                <RefractivePane
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
                    backgroundColor: "gray.20/40",
                    pointerEvents: "auto",
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
                      borderWidth: "thin",
                      borderColor: "neutral.black/10",
                      shadow: "md",
                      overflow: "hidden",
                    })}
                    style={{
                      borderRadius: RADIUS - PADDING,
                    }}
                  >
                    <h2
                      className={css({
                        fontSize: "2xl",
                        fontWeight: "medium",
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

                    <motion.div
                      layoutId="content-container"
                      layout
                      animate={{
                        width: "auto",
                        height: "auto",
                      }}
                      style={{
                        willChange: "width, height", // Optimize for animations
                      }}
                    >
                      <AnimatePresence mode="wait">
                        {currentPage === "design" ? (
                          <motion.div
                            key="design"
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{
                              duration: 0.2,
                              layout: {
                                duration: 0.3,
                                ease: [0.4, 0.0, 0.2, 1],
                              },
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                gap: "1rem",
                                width: "100%",
                              }}
                            >
                              <span
                                className={css({
                                  fontSize: "sm",
                                })}
                              >
                                Enable
                              </span>
                              <Switch
                                checked={switchChecked}
                                onCheckedChange={(checked) =>
                                  setSwitchChecked(checked)
                                }
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
                                onChange={setSliderValue}
                                style={{ width: 400 }}
                                label="Intensity Level"
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
                                transition:
                                  "background-color 0.2s, border-color 0.2s",
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
                          </motion.div>
                        ) : (
                          <motion.div
                            key="actions"
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{
                              duration: 0.2,
                              layout: {
                                duration: 0.3,
                                ease: [0.4, 0.0, 0.2, 1],
                              },
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                gap: "1rem",
                                width: "100%",
                              }}
                            >
                              <span className={css({ fontSize: "sm" })}>
                                Enable Feature A
                              </span>
                              <Switch
                                checked={switchChecked2}
                                onCheckedChange={setSwitchChecked2}
                              />
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: "1rem",
                                width: "100%",
                              }}
                            >
                              <span className={css({ fontSize: "sm" })}>
                                Enable Feature B
                              </span>
                              <Switch />
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: "1rem",
                                width: "100%",
                              }}
                            >
                              <span className={css({ fontSize: "sm" })}>
                                Enable Feature C
                              </span>
                              <Switch />
                            </div>

                            <motion.div
                              style={{ width: 450 }}
                              className={css({
                                rounded: "md",
                                backgroundColor: "gray.10/50",
                              })}
                              animate={{
                                height: switchChecked2 ? "auto" : 0,
                                opacity: switchChecked2 ? 1 : 0,
                              }}
                              initial={false}
                            >
                              <p style={{ paddingTop: 12, fontWeight: "bold" }}>
                                Extra content appearing when Feature A is
                                enabled.
                              </p>

                              <p>
                                Allows to demonstrate how the container smoothly
                                transitions its height based on the content
                                inside, and verify performance of refractive
                                glass effects during dynamic layout changes.
                              </p>
                            </motion.div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  </div>
                  <div
                    className={css({
                      padding: "2",
                      display: "flex",
                      gap: "1",
                      justifyContent: "end",
                      width: "[100%]",
                    })}
                  >
                    <Button>Cancel</Button>
                    <Button
                      className={css({
                        backgroundColor: "neutral.black/80",
                        color: "neutral.white",
                      })}
                      onClick={() => setSelectedButton("select")}
                    >
                      Confirm
                    </Button>
                  </div>
                </RefractivePane>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <RefractivePane
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
            pointerEvents: "auto",
          })}
          radius={22}
          bezelWidth={19}
          blur={2}
          specularOpacity={0.8}
          glassThickness={40}
          refractiveIndex={1.5}
          scaleRatio={1}
          style={{
            borderRadius: 22,
            padding: 8,
          }}
        >
          {buttons.map(({ icon: Icon, title, id }) => {
            const isSelected = selectedButton === id;
            return (
              <button
                key={id}
                type="button"
                className={getButtonStyle(isSelected)}
                style={{ borderRadius: 20 - 4 }}
                title={title}
                onClick={() => setSelectedButton(id)}
              >
                <Icon size={18} className={getIconStyle(isSelected)} />
              </button>
            );
          })}
        </RefractivePane>
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
