import type { Story } from "@ladle/react";
import { css } from "../../styled-system/css";
import { token } from "../../styled-system/tokens";
import { VStack, HStack, Box, Grid } from "../../styled-system/jsx";
import type { Token } from "../../styled-system/tokens/tokens";

/**
 * Background color tokens for UI surfaces and interactive elements.
 *
 * Structure:
 * - accent.{subtle,bold}.{default,hover,active,pressed}
 * - neutral.{subtle,bold}.{default,hover,active,pressed}
 * - status.{info,success,caution,warning,critical}.subtle.{default,hover,active}
 * - status.critical.strong.{default,hover,active}
 */

type StateKey = "default" | "hover" | "active" | "pressed";

const BgSwatch = ({
  label,
  tokenPath,
  textColor = "gray.90",
}: {
  label: string;
  tokenPath: string;
  textColor?: string;
}) => (
  <Box
    px="4"
    py="3"
    borderRadius="md.3"
    minWidth="[120px]"
    boxShadow="[inset_0_0_0_1px_rgba(0,0,0,0.06)]"
    style={{ backgroundColor: token(`colors.${tokenPath}` as Token) }}
  >
    <span
      className={css({ fontSize: "sm", fontWeight: "medium" })}
      style={{ color: token(`colors.${textColor}` as Token) }}
    >
      {label}
    </span>
    <span
      className={css({
        fontSize: "[10px]",
        display: "block",
        mt: "1",
        opacity: "[0.7]",
      })}
      style={{ color: token(`colors.${textColor}` as Token) }}
    >
      {tokenPath}
    </span>
  </Box>
);

const StateRow = ({
  category,
  intensity,
  states,
  textColor = "gray.90",
}: {
  category: string;
  intensity: string;
  states: StateKey[];
  textColor?: string;
}) => (
  <VStack gap="2" alignItems="flex-start">
    <span
      className={css({
        fontSize: "sm",
        fontWeight: "semibold",
        color: "text.secondary",
        textTransform: "capitalize",
      })}
    >
      {category}.{intensity}
    </span>
    <HStack gap="2" flexWrap="wrap">
      {states.map((state) => (
        <BgSwatch
          key={state}
          label={state}
          tokenPath={`bg.${category}.${intensity}.${state}`}
          textColor={textColor}
        />
      ))}
    </HStack>
  </VStack>
);

const StatusRow = ({
  status,
  intensity,
  states,
  textColor = "gray.90",
}: {
  status: string;
  intensity: string;
  states: StateKey[];
  textColor?: string;
}) => (
  <VStack gap="2" alignItems="flex-start">
    <span
      className={css({
        fontSize: "sm",
        fontWeight: "semibold",
        color: "text.secondary",
        textTransform: "capitalize",
      })}
    >
      status.{status}.{intensity}
    </span>
    <HStack gap="2" flexWrap="wrap">
      {states.map((state) => (
        <BgSwatch
          key={state}
          label={state}
          tokenPath={`bg.status.${status}.${intensity}.${state}`}
          textColor={textColor}
        />
      ))}
    </HStack>
  </VStack>
);

export const SemanticBg: Story = () => (
  <VStack gap="10" alignItems="flex-start" p="6">
    <h1 className={css({ fontSize: "2xl", fontWeight: "semibold" })}>
      Background Color Tokens
    </h1>

    {/* Accent */}
    <VStack gap="4" alignItems="flex-start">
      <h2
        className={css({
          fontSize: "lg",
          fontWeight: "semibold",
          color: "text.secondary",
        })}
      >
        Accent
      </h2>
      <p className={css({ fontSize: "sm", color: "text.tertiary" })}>
        Primary brand/action backgrounds
      </p>
      <Grid gap="4" columns={1}>
        <StateRow
          category="accent"
          intensity="subtle"
          states={["default", "hover", "active"]}
        />
        <StateRow
          category="accent"
          intensity="bold"
          states={["default", "hover", "pressed", "active"]}
          textColor="neutral.white"
        />
      </Grid>
    </VStack>

    {/* Neutral */}
    <VStack gap="4" alignItems="flex-start">
      <h2
        className={css({
          fontSize: "lg",
          fontWeight: "semibold",
          color: "text.secondary",
        })}
      >
        Neutral
      </h2>
      <p className={css({ fontSize: "sm", color: "text.tertiary" })}>
        Default UI surfaces and secondary actions
      </p>
      <Grid gap="4" columns={1}>
        <StateRow
          category="neutral"
          intensity="subtle"
          states={["default", "hover", "active", "pressed"]}
        />
        <StateRow
          category="neutral"
          intensity="bold"
          states={["default", "hover", "active", "pressed"]}
          textColor="neutral.white"
        />
      </Grid>
    </VStack>

    {/* Status */}
    <VStack gap="4" alignItems="flex-start">
      <h2
        className={css({
          fontSize: "lg",
          fontWeight: "semibold",
          color: "text.secondary",
        })}
      >
        Status
      </h2>
      <p className={css({ fontSize: "sm", color: "text.tertiary" })}>
        Semantic backgrounds for alerts, badges, and notifications
      </p>
      <Grid gap="4" columns={1}>
        {(["info", "success", "caution", "warning"] as const).map((status) => (
          <StatusRow
            key={status}
            status={status}
            intensity="subtle"
            states={["default", "hover", "active"]}
          />
        ))}
        <StatusRow
          status="critical"
          intensity="subtle"
          states={["default", "hover", "active"]}
        />
        <StatusRow
          status="critical"
          intensity="strong"
          states={["default", "hover", "active"]}
          textColor="neutral.white"
        />
      </Grid>
    </VStack>
  </VStack>
);

SemanticBg.storyName = "Semantic: Background";
