"use client";

/* eslint-disable import/no-extraneous-dependencies, @typescript-eslint/no-shadow */

import { Portal } from "@ark-ui/react/portal";
import {
  createToaster,
  Toast,
  Toaster as ArkToaster,
  useToastContext,
} from "@ark-ui/react/toast";
import { createStyleContext, Stack, styled } from "@hashintel/ds-helpers/jsx";
import { toast } from "@hashintel/ds-helpers/recipes";
import { CheckCircleIcon, CircleAlertIcon, CircleXIcon } from "lucide-react";
import { forwardRef } from "react";

import { CloseButton } from "../close-button/close-button";
import { Icon, type IconProps } from "../icon/icon";
import { Spinner } from "../spinner/spinner";

const { withProvider, withContext } = createStyleContext(toast);

const Root = withProvider(Toast.Root, "root");
const Title = withContext(Toast.Title, "title");
const Description = withContext(Toast.Description, "description");
const ActionTrigger = withContext(Toast.ActionTrigger, "actionTrigger");
const CloseTrigger = withContext(Toast.CloseTrigger, "closeTrigger");
const StyledToaster = styled(ArkToaster);

const iconMap: Record<string, React.ElementType> = {
  warning: CircleAlertIcon,
  success: CheckCircleIcon,
  error: CircleXIcon,
};

const Indicator = forwardRef<SVGSVGElement, IconProps>((props, ref) => {
  const toast = useToastContext();

  const StatusIcon = iconMap[toast.type];
  if (!StatusIcon) {
    return null;
  }

  return (
    <Icon ref={ref} data-type={toast.type} {...props}>
      <StatusIcon />
    </Icon>
  );
});

export const toaster = createToaster({
  placement: "bottom-end",
  pauseOnPageIdle: true,
  overlap: true,
  max: 5,
});

export const Toaster = () => {
  return (
    <Portal>
      <StyledToaster
        toaster={toaster}
        // @ts-expect-error - "mdDown" is not in the breakpoint condition set
        insetInline={{ mdDown: "4" }}
      >
        {(toast) => (
          <Root>
            {toast.type === "loading" ? (
              // @ts-expect-error - "colorPalette.plain.fg" is not a valid color token
              <Spinner color="colorPalette.plain.fg" />
            ) : (
              <Indicator />
            )}

            <Stack gap="3" alignItems="start">
              <Stack gap="1">
                {toast.title && <Title>{toast.title}</Title>}
                {toast.description && (
                  <Description>{toast.description}</Description>
                )}
              </Stack>
              {toast.action && (
                <ActionTrigger>{toast.action.label}</ActionTrigger>
              )}
            </Stack>
            {toast.closable && (
              <CloseTrigger asChild>
                <CloseButton size="sm" />
              </CloseTrigger>
            )}
          </Root>
        )}
      </StyledToaster>
    </Portal>
  );
};
