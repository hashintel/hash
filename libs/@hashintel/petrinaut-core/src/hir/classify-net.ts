import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  getTransitionLogicAvailability,
  sanitizeSDCPNForExtensions,
  type PetrinautExtensionSettings,
} from "../extensions";
import {
  hasTimedTransition,
  netColoringOf,
  netTimeOf,
  type NetChance,
  type NetClass,
} from "../net-class";
import { analyzeHir } from "./analyze";
import { lowerAndCheck } from "./compile";
import {
  buildDynamicsContext,
  buildKernelContext,
  buildLambdaContext,
} from "./surface-context";

import type { SDCPN } from "../types/sdcpn";
import type { HirFunctionSurfaceKind } from "./hir";
import type { HirFunctionContext } from "./surface-context";

/** Whether the code draws at random. `null` when it does not compile. */
const draws = (
  code: string,
  surface: HirFunctionSurfaceKind,
  context: HirFunctionContext | null,
): boolean | null => {
  const item = lowerAndCheck(code, surface, context);
  return item.ok ? !analyzeHir(item.fn).dependencies.isDeterministic : null;
};

/**
 * Whether two runs of the net from one state can differ.
 *
 * A rate settles it without reading any code. With no rate, the net is
 * stochastic when its code draws: a kernel that samples a distribution or
 * mints a UUID, or a call to `Math.random()` in a lambda, a kernel or a
 * differential equation. The code read is the code the compiler compiles.
 */
const chanceOf = (
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
): NetChance | null => {
  if (hasTimedTransition(sdcpn, extensions)) {
    return "stochastic";
  }
  const sanitized = sanitizeSDCPNForExtensions(sdcpn, extensions);
  const nets = [sanitized, ...(sanitized.subnets ?? [])];
  const types = nets.flatMap((net) => net.types);

  const drawn = nets.flatMap((net) => [
    ...net.differentialEquations
      // An equation moves the `real` attributes of its type, or nothing.
      .filter((equation) =>
        types
          .find(({ id }) => id === equation.colorId)
          ?.elements.some((element) => element.type === "real"),
      )
      .map((equation) =>
        draws(
          equation.code,
          "dynamics",
          buildDynamicsContext(sanitized, equation, extensions, net),
        ),
      ),
    ...net.transitions.flatMap((transition) => {
      const { lambda, transitionKernel } = getTransitionLogicAvailability(
        transition,
        sanitized,
        extensions,
        net,
      );
      return [
        lambda && transition.lambdaCode.trim() !== ""
          ? draws(
              transition.lambdaCode,
              "lambda",
              buildLambdaContext(sanitized, transition, extensions, net),
            )
          : false,
        transitionKernel
          ? draws(
              transition.transitionKernelCode,
              "kernel",
              buildKernelContext(sanitized, transition, extensions, net),
            )
          : false,
      ];
    }),
  ]);

  if (drawn.includes(true)) {
    return "stochastic";
  }
  return drawn.includes(null) ? null : "deterministic";
};

/**
 * The class of the net. This lowers the net's code, so it runs where the
 * TypeScript frontend is loaded: the language server, which publishes the
 * class with every check.
 */
export const classifyNet = (
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings = DEFAULT_PETRINAUT_EXTENSIONS,
): NetClass => ({
  time: netTimeOf(sdcpn, extensions),
  coloring: netColoringOf(sdcpn, extensions),
  chance: chanceOf(sdcpn, extensions),
});
