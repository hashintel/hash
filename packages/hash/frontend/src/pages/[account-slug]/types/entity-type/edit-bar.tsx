// // attempt 1
//
// import { faSmile } from "@fortawesome/free-regular-svg-icons";
// import { FontAwesomeIcon } from "@hashintel/hash-design-system";
// import { Box, Container, Stack, Typography, } from "@mui/material";
// import { GlobalStyles } from "@mui/system";
// import { ReactNode, useEffect, useRef, useState, } from "react";
// import { useFormState } from "react-hook-form";
// import { PencilSimpleLine } from "../../../../shared/icons/svg";
// import { Button, ButtonProps } from "../../../../shared/ui/button";
// import { EntityTypeEditorForm } from "./form-types";
//
// const useFrozenValue = <T extends any>(value: T): T => {
//   const { isDirty } = useFormState<EntityTypeEditorForm>();
//
//   const [frozen, setFrozen] = useState(value);
//
//   if (isDirty && frozen !== value) {
//     setFrozen(value);
//   }
//
//   return frozen;
// };
//
// // @todo disabled button styles
// const EditBarContents = ({
//                            icon,
//                            title,
//                            label,
//                            discardButtonProps,
//                            confirmButtonProps,
//                          }: {
//   icon: ReactNode;
//   title: ReactNode;
//   label: ReactNode;
//   discardButtonProps: ButtonProps;
//   confirmButtonProps: ButtonProps;
// }) => {
//   const { isSubmitting } = useFormState<EntityTypeEditorForm>();
//
//   const frozenSubmitting = useFrozenValue(isSubmitting);
//
//   return (
//     <Container
//       sx={{
//         display: "flex",
//         alignItems: "center",
//       }}
//     >
//       {icon}
//       <Typography variant="smallTextLabels" sx={{ ml: 1 }}>
//         <Box component="span" sx={{ fontWeight: "bold", mr: 1 }}>
//           {title}
//         </Box>{" "}
//         {label}
//       </Typography>
//       <Stack spacing={1.25} sx={{ marginLeft: "auto" }} direction="row">
//         <Button
//           variant="tertiary"
//           size="xs"
//           sx={(theme) => ({
//             borderColor: theme.palette.blue[50],
//             backgroundColor: "transparent",
//             color: "white",
//             "&:hover": {
//               backgroundColor: theme.palette.blue[80],
//               color: "white",
//             },
//           })}
//           disabled={frozenSubmitting}
//           {...discardButtonProps}
//         >
//           {discardButtonProps.children}
//         </Button>
//         <Button
//           variant="secondary"
//           size="xs"
//           type="submit"
//           loading={frozenSubmitting}
//           loadingWithoutText
//           disabled={frozenSubmitting}
//           {...confirmButtonProps}
//         >
//           {confirmButtonProps.children}
//         </Button>
//       </Stack>
//     </Container>
//   );
// };
//
// export const EditBar = ({
//                           currentVersion,
//                           discardButtonProps,
//                         }: {
//   currentVersion: number;
//   discardButtonProps: Partial<ButtonProps>;
// }) => {
//   const { isDirty } = useFormState<EntityTypeEditorForm>();
//   const frozenVersion = useFrozenValue(currentVersion);
//
//   const observerRef = useRef<ResizeObserver>(null);
//
//   const ref = useRef<HTMLDivElement>(null);
//
//   useEffect(() => {
//     const node = ref.current;
//     if (!node) {
//       return;
//     }
//
//     let beginningHeight = 0;
//     let scrollTop = 0;
//
//     observerRef.current?.disconnect();
//
//     const observer = new ResizeObserver(([size]) => {
//       const diff = size.contentRect.height - beginningHeight;
//       document.documentElement.scrollTop += 66;
//     });
//
//     observer.observe(ref);
//     observerRef.current = observer;
//
//     return () => {
//       observer.disconnect();
//     }
//   }, []);
//
//   const collapseIn = currentVersion === 0 || isDirty;
//
//   return (
//     <>
//       <GlobalStyles
//         styles={{
//           body: {
//             position: "relative",
//             minHeight: "calc(100vh +  66px) !important",
//           },
//         }}
//       />
//       <Box sx={{ height: 0, overflow: "hidden" }} ref={ref}>
//         <Box
//           sx={(theme) => ({
//             height: 66,
//             backgroundColor: theme.palette.blue[70],
//             color: theme.palette.white,
//             display: "flex",
//             alignItems: "center",
//           })}
//         >
//           {frozenVersion === 0 ? (
//             <EditBarContents
//               icon={<FontAwesomeIcon icon={faSmile} sx={{ fontSize: 14 }} />}
//               title="Currently editing"
//               label="- this type has not yet been created"
//               discardButtonProps={{
//                 children: "Discard this type",
//                 ...discardButtonProps,
//               }}
//               confirmButtonProps={{
//                 children: "Create",
//               }}
//             />
//           ) : (
//             <EditBarContents
//               icon={<PencilSimpleLine />}
//               title="Currently editing"
//               label={`Version ${frozenVersion} -> ${frozenVersion + 1}`}
//               discardButtonProps={{
//                 children: "Discard changes",
//                 ...discardButtonProps,
//               }}
//               confirmButtonProps={{
//                 children: "Publish update",
//               }}
//             />
//           )}
//         </Box>
//       </Box>
//     </>
//   );
// };
//
//
// // attempt 2
//
// import { faSmile } from "@fortawesome/free-regular-svg-icons";
// import { FontAwesomeIcon } from "@hashintel/hash-design-system";
// import {
//   Box,
//   Collapse,
//   Container,
//   Stack,
//   Typography,
//   useForkRef,
//   useTheme,
// } from "@mui/material";
// import { GlobalStyles, useThemeProps } from "@mui/system";
// import {
//   forwardRef,
//   ReactNode,
//   useEffect,
//   useLayoutEffect,
//   useRef,
//   useState,
// } from "react";
// import { useFormState } from "react-hook-form";
// import { Transition } from "react-transition-group";
// import { PencilSimpleLine } from "../../../../shared/icons/svg";
// import { Button, ButtonProps } from "../../../../shared/ui/button";
// import { EntityTypeEditorForm } from "./form-types";
//
// const useFrozenValue = <T extends any>(value: T): T => {
//   const { isDirty } = useFormState<EntityTypeEditorForm>();
//
//   const [frozen, setFrozen] = useState(value);
//
//   if (isDirty && frozen !== value) {
//     setFrozen(value);
//   }
//
//   return frozen;
// };
//
// // @todo disabled button styles
// const EditBarContents = ({
//                            icon,
//                            title,
//                            label,
//                            discardButtonProps,
//                            confirmButtonProps,
//                          }: {
//   icon: ReactNode;
//   title: ReactNode;
//   label: ReactNode;
//   discardButtonProps: ButtonProps;
//   confirmButtonProps: ButtonProps;
// }) => {
//   const { isSubmitting } = useFormState<EntityTypeEditorForm>();
//
//   const frozenSubmitting = useFrozenValue(isSubmitting);
//
//   return (
//     <Container
//       sx={{
//         display: "flex",
//         alignItems: "center",
//       }}
//     >
//       {icon}
//       <Typography variant="smallTextLabels" sx={{ ml: 1 }}>
//         <Box component="span" sx={{ fontWeight: "bold", mr: 1 }}>
//           {title}
//         </Box>{" "}
//         {label}
//       </Typography>
//       <Stack spacing={1.25} sx={{ marginLeft: "auto" }} direction="row">
//         <Button
//           variant="tertiary"
//           size="xs"
//           sx={(theme) => ({
//             borderColor: theme.palette.blue[50],
//             backgroundColor: "transparent",
//             color: "white",
//             "&:hover": {
//               backgroundColor: theme.palette.blue[80],
//               color: "white",
//             },
//           })}
//           disabled={frozenSubmitting}
//           {...discardButtonProps}
//         >
//           {discardButtonProps.children}
//         </Button>
//         <Button
//           variant="secondary"
//           size="xs"
//           type="submit"
//           loading={frozenSubmitting}
//           loadingWithoutText
//           disabled={frozenSubmitting}
//           {...confirmButtonProps}
//         >
//           {confirmButtonProps.children}
//         </Button>
//       </Stack>
//     </Container>
//   );
// };
//
// //
// // /**
// //  * The Collapse transition is used by the
// //  * [Vertical Stepper](/material-ui/react-stepper/#vertical-stepper) StepContent component.
// //  * It uses [react-transition-group](https://github.com/reactjs/react-transition-group) internally.
// //  */
// // const Collapse = forwardRef<
// //   HTMLDivElement,
// //   { in: boolean; children: ReactNode }
// // >((inProps, ref) => {
// //   const props = useThemeProps({ props: inProps, name: "MuiCollapse" });
// //   const timeout = 300;
// //   const { children, in: inProp } = props;
// //
// //   const collapsedSize = "0px";
// //   const theme = useTheme();
// //   const wrapperRef = useRef<HTMLDivElement>(null);
// //   const nodeRef = useRef<HTMLDivElement>(null);
// //   const handleRef = useForkRef(ref, nodeRef);
// //
// //   const normalizedTransitionCallback =
// //     (callback: (node: HTMLElement | null, isAppearing?: boolean) => void) =>
// //     (maybeIsAppearing?: boolean) => {
// //       if (callback) {
// //         const node = nodeRef.current;
// //
// //         // onEnterXxx and onExitXxx callbacks have a different arguments.length value.
// //         if (maybeIsAppearing === undefined) {
// //           callback(node);
// //         } else {
// //           callback(node, maybeIsAppearing);
// //         }
// //       }
// //     };
// //
// //   const getWrapperSize = () =>
// //     wrapperRef.current ? wrapperRef.current.clientHeight : 0;
// //
// //   const handleEnter = normalizedTransitionCallback((node) => {
// //     if (node) {
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.height = collapsedSize;
// //     }
// //   });
// //
// //   const easing = "cubic-bezier(0.4, 0, 0.2, 1)";
// //
// //   const handleEntering = normalizedTransitionCallback((node) => {
// //     if (node) {
// //       const wrapperSize = getWrapperSize();
// //
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.transitionDuration = `${timeout}ms`;
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.height = `${wrapperSize}px`;
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.transitionTimingFunction = easing;
// //     }
// //   });
// //
// //   const handleEntered = normalizedTransitionCallback((node) => {
// //     if (node) {
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.height = "auto";
// //     }
// //   });
// //
// //   const handleExit = normalizedTransitionCallback((node) => {
// //     if (node) {
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.height = `${getWrapperSize()}px`;
// //     }
// //   });
// //
// //   const handleExiting = normalizedTransitionCallback((node) => {
// //     if (node) {
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.transitionDuration = `${timeout}ms`;
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.height = collapsedSize;
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.transitionTimingFunction = easing;
// //     }
// //   });
// //
// //   return (
// //     <Transition
// //       in={inProp}
// //       onEnter={handleEnter}
// //       onEntered={handleEntered}
// //       onEntering={handleEntering}
// //       onExit={handleExit}
// //       onExiting={handleExiting}
// //       nodeRef={nodeRef}
// //       timeout={timeout}
// //     >
// //       {(state) => (
// //         <Box
// //           sx={{
// //             minHeight: collapsedSize,
// //             height: 0,
// //             overflow: "hidden",
// //             transition: theme.transitions.create("height"),
// //             ...(state === "entered" && {
// //               height: "auto",
// //               overflow: "visible",
// //             }),
// //             ...(state === "exited" &&
// //               !inProp && {
// //                 visibility: "hidden",
// //               }),
// //           }}
// //           ref={handleRef}
// //         >
// //           <Box
// //             sx={{
// //               // Hack to get children with a negative margin to not falsify the height computation.
// //               display: "flex",
// //               width: "100%",
// //             }}
// //             ref={wrapperRef}
// //           >
// //             <Box sx={{ width: "100%" }}>{children}</Box>
// //           </Box>
// //         </Box>
// //       )}
// //     </Transition>
// //   );
// // });
//
// class UnitBezier {
//   cx: number;
//   bx: number;
//   ax: number;
//   cy: number;
//   by: number;
//   ay: number;
//   static epsilon = 1e-6;
//   /**
//    * Solver for cubic Bézier curve with implicit control points at (0,0) and (1.0, 1.0)
//    */
//   constructor(p1x: number, p1y: number, p2x: number, p2y: number) {
//     // pre-calculate the polynomial coefficients
//     // First and last control points are implied to be (0,0) and (1.0, 1.0)
//     this.cx = 3.0 * p1x;
//     this.bx = 3.0 * (p2x - p1x) - this.cx;
//     this.ax = 1.0 - this.cx - this.bx;
//
//     this.cy = 3.0 * p1y;
//     this.by = 3.0 * (p2y - p1y) - this.cy;
//     this.ay = 1.0 - this.cy - this.by;
//   }
//
//   sampleCurveX(time: number) {
//     return ((this.ax * time + this.bx) * time + this.cx) * time;
//   }
//
//   sampleCurveY(time: number) {
//     return ((this.ay * time + this.by) * time + this.cy) * time;
//   }
//
//   sampleCurveDerivativeX(time: number) {
//     return (3.0 * this.ax * time + 2.0 * this.bx) * time + this.cx;
//   }
//
//   solveCurveX(x: number, epsilon: number) {
//     let t0;
//     let t1;
//     let t2;
//     let x2;
//     let d2;
//     let i;
//
//     // First try a few iterations of Newton's method -- normally very fast.
//     for (t2 = x, i = 0; i < 8; i++) {
//       x2 = this.sampleCurveX(t2) - x;
//       if (Math.abs(x2) < epsilon) {
//         return t2;
//       }
//       d2 = this.sampleCurveDerivativeX(t2);
//       if (Math.abs(d2) < epsilon) {
//         break;
//       }
//       t2 -= x2 / d2;
//     }
//
//     // No solution found - use bi-section
//     t0 = 0.0;
//     t1 = 1.0;
//     t2 = x;
//
//     if (t2 < t0) {
//       return t0;
//     }
//     if (t2 > t1) {
//       return t1;
//     }
//
//     while (t0 < t1) {
//       x2 = this.sampleCurveX(t2);
//       if (Math.abs(x2 - x) < epsilon) {
//         return t2;
//       }
//       if (x > x2) {
//         t0 = t2;
//       } else {
//         t1 = t2;
//       }
//
//       t2 = (t1 - t0) * 0.5 + t0;
//     }
//
//     // Give up
//     return t2;
//   }
//
//   solve(x: number, epsilon: number) {
//     return this.sampleCurveY(this.solveCurveX(x, epsilon));
//   }
// }
//
// const curve = new UnitBezier(0.4, 0, 0.2, 1);
//
// export const EditBar = ({
//                           currentVersion,
//                           discardButtonProps,
//                         }: {
//   currentVersion: number;
//   discardButtonProps: Partial<ButtonProps>;
// }) => {
//   const { isDirty } = useFormState<EntityTypeEditorForm>();
//   const frozenVersion = useFrozenValue(currentVersion);
//
//   const observerRef = useRef<ResizeObserver>(null);
//
//   const ref = useRef<HTMLDivElement>(null);
//
//   useEffect(() => {
//     const node = ref.current;
//     if (!node) {
//       return;
//     }
//
//     let beginningHeight = 0;
//     let scrollTop = 0;
//
//     observerRef.current?.disconnect();
//
//     let frame: number | null = null;
//
//     const handler = () => {
//       const height = node.getBoundingClientRect().height;
//
//       const diff = height - beginningHeight;
//
//       console.log(diff, scrollTop);
//
//       document.documentElement.scrollTop += 66;
//
//       frame = requestAnimationFrame(handler);
//     };
//
//     const start = () => {
//       if (frame) {
//         cancelAnimationFrame(frame);
//       }
//
//       beginningHeight = node.getBoundingClientRect().height;
//       scrollTop = document.documentElement.scrollTop;
//     };
//
//     node.addEventListener("transitionstart", start);
//     const end = () => {
//       if (frame) {
//         cancelAnimationFrame(frame);
//       }
//       handler();
//       if (frame) {
//         cancelAnimationFrame(frame);
//       }
//     };
//     node.addEventListener("transitionend", end);
//     node.addEventListener("transitioncancel", end);
//
//     return () => {
//       if (frame) {
//         cancelAnimationFrame(frame);
//       }
//       node.removeEventListener("transitionstart", start);
//       node.removeEventListener("transitionend", end);
//       node.removeEventListener("transitioncancel", end);
//     };
//
//     const observer = new ResizeObserver(([size]) => {
//
//     });
//
//     observer.observe(ref);
//     observerRef.current = observer;
//   }, []);
//
//   const collapseIn = currentVersion === 0 || isDirty;
//
//   const ref = useRef<HTMLDivElement>(null);
//
//   useLayoutEffect(() => {
//     const node = ref.current;
//     if (node && collapseIn) {
//       let frame: number | null = null;
//
//       const cancel = () => {
//         if (frame) {
//           cancelAnimationFrame(frame);
//         }
//       };
//
//       const end = () => {
//         cancel();
//         document.documentElement.scrollTo({ top: 66, behavior: "auto" });
//         document.body.style.setProperty("top", `0px`);
//       };
//
//       let startTime: number | null;
//       const startPos = 0;
//
//       const tick = () => {
//         if (!startTime) {
//           startTime = Date.now();
//         }
//         const diff = Date.now() - startTime;
//         const percentage = Math.min(1, diff / 300);
//         const t1 = curve.solve(percentage, UnitBezier.epsilon);
//         const distance = Math.round(66 * t1);
//         const scrollPos = startPos + distance;
//         // document.documentElement.scrollTo(0, scrollPos);
//         node.style.setProperty("height", `${distance}px`);
//         document.body.style.setProperty("top", `-${distance}px`);
//         if (percentage < 1) {
//           frame = requestAnimationFrame(tick);
//         } else {
//           end();
//         }
//       };
//
//       tick();
//
//       return cancel;
//     } else {
//       ref.current?.style.setProperty("height", `0px`);
//       document.body.style.setProperty("top", `0px`);
//     }
//   }, [collapseIn]);
//
//   return (
//     <>
//       <GlobalStyles
//         styles={{
//           body: {
//             position: "relative",
//             minHeight: "calc(100vh +  66px) !important",
//           },
//         }}
//       />
//       <Box sx={{ height: 0, overflow: "hidden" }} ref={ref}>
//         <Box
//           sx={(theme) => ({
//             height: 66,
//             backgroundColor: theme.palette.blue[70],
//             color: theme.palette.white,
//             display: "flex",
//             alignItems: "center",
//           })}
//         >
//           {frozenVersion === 0 ? (
//             <EditBarContents
//               icon={<FontAwesomeIcon icon={faSmile} sx={{ fontSize: 14 }} />}
//               title="Currently editing"
//               label="- this type has not yet been created"
//               discardButtonProps={{
//                 children: "Discard this type",
//                 ...discardButtonProps,
//               }}
//               confirmButtonProps={{
//                 children: "Create",
//               }}
//             />
//           ) : (
//             <EditBarContents
//               icon={<PencilSimpleLine />}
//               title="Currently editing"
//               label={`Version ${frozenVersion} -> ${frozenVersion + 1}`}
//               discardButtonProps={{
//                 children: "Discard changes",
//                 ...discardButtonProps,
//               }}
//               confirmButtonProps={{
//                 children: "Publish update",
//               }}
//             />
//           )}
//         </Box>
//       </Box>
//     </>
//   );
// };
//
//
// // attempt 3
//
// import { faSmile } from "@fortawesome/free-regular-svg-icons";
// import { FontAwesomeIcon } from "@hashintel/hash-design-system";
// import {
//   Box,
//   Collapse,
//   Container,
//   Stack,
//   Typography,
//   useForkRef,
//   useTheme,
// } from "@mui/material";
// import { GlobalStyles, useThemeProps } from "@mui/system";
// import {
//   forwardRef,
//   ReactNode,
//   useEffect,
//   useLayoutEffect,
//   useRef,
//   useState,
// } from "react";
// import { useFormState } from "react-hook-form";
// import { Transition } from "react-transition-group";
// import { PencilSimpleLine } from "../../../../shared/icons/svg";
// import { Button, ButtonProps } from "../../../../shared/ui/button";
// import { EntityTypeEditorForm } from "./form-types";
//
// const useFrozenValue = <T extends any>(value: T): T => {
//   const { isDirty } = useFormState<EntityTypeEditorForm>();
//
//   const [frozen, setFrozen] = useState(value);
//
//   if (isDirty && frozen !== value) {
//     setFrozen(value);
//   }
//
//   return frozen;
// };
//
// // @todo disabled button styles
// const EditBarContents = ({
//                            icon,
//                            title,
//                            label,
//                            discardButtonProps,
//                            confirmButtonProps,
//                          }: {
//   icon: ReactNode;
//   title: ReactNode;
//   label: ReactNode;
//   discardButtonProps: ButtonProps;
//   confirmButtonProps: ButtonProps;
// }) => {
//   const { isSubmitting } = useFormState<EntityTypeEditorForm>();
//
//   const frozenSubmitting = useFrozenValue(isSubmitting);
//
//   return (
//     <Container
//       sx={{
//         display: "flex",
//         alignItems: "center",
//       }}
//     >
//       {icon}
//       <Typography variant="smallTextLabels" sx={{ ml: 1 }}>
//         <Box component="span" sx={{ fontWeight: "bold", mr: 1 }}>
//           {title}
//         </Box>{" "}
//         {label}
//       </Typography>
//       <Stack spacing={1.25} sx={{ marginLeft: "auto" }} direction="row">
//         <Button
//           variant="tertiary"
//           size="xs"
//           sx={(theme) => ({
//             borderColor: theme.palette.blue[50],
//             backgroundColor: "transparent",
//             color: "white",
//             "&:hover": {
//               backgroundColor: theme.palette.blue[80],
//               color: "white",
//             },
//           })}
//           disabled={frozenSubmitting}
//           {...discardButtonProps}
//         >
//           {discardButtonProps.children}
//         </Button>
//         <Button
//           variant="secondary"
//           size="xs"
//           type="submit"
//           loading={frozenSubmitting}
//           loadingWithoutText
//           disabled={frozenSubmitting}
//           {...confirmButtonProps}
//         >
//           {confirmButtonProps.children}
//         </Button>
//       </Stack>
//     </Container>
//   );
// };
//
// //
// // /**
// //  * The Collapse transition is used by the
// //  * [Vertical Stepper](/material-ui/react-stepper/#vertical-stepper) StepContent component.
// //  * It uses [react-transition-group](https://github.com/reactjs/react-transition-group) internally.
// //  */
// // const Collapse = forwardRef<
// //   HTMLDivElement,
// //   { in: boolean; children: ReactNode }
// // >((inProps, ref) => {
// //   const props = useThemeProps({ props: inProps, name: "MuiCollapse" });
// //   const timeout = 300;
// //   const { children, in: inProp } = props;
// //
// //   const collapsedSize = "0px";
// //   const theme = useTheme();
// //   const wrapperRef = useRef<HTMLDivElement>(null);
// //   const nodeRef = useRef<HTMLDivElement>(null);
// //   const handleRef = useForkRef(ref, nodeRef);
// //
// //   const normalizedTransitionCallback =
// //     (callback: (node: HTMLElement | null, isAppearing?: boolean) => void) =>
// //     (maybeIsAppearing?: boolean) => {
// //       if (callback) {
// //         const node = nodeRef.current;
// //
// //         // onEnterXxx and onExitXxx callbacks have a different arguments.length value.
// //         if (maybeIsAppearing === undefined) {
// //           callback(node);
// //         } else {
// //           callback(node, maybeIsAppearing);
// //         }
// //       }
// //     };
// //
// //   const getWrapperSize = () =>
// //     wrapperRef.current ? wrapperRef.current.clientHeight : 0;
// //
// //   const handleEnter = normalizedTransitionCallback((node) => {
// //     if (node) {
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.height = collapsedSize;
// //     }
// //   });
// //
// //   const easing = "cubic-bezier(0.4, 0, 0.2, 1)";
// //
// //   const handleEntering = normalizedTransitionCallback((node) => {
// //     if (node) {
// //       const wrapperSize = getWrapperSize();
// //
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.transitionDuration = `${timeout}ms`;
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.height = `${wrapperSize}px`;
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.transitionTimingFunction = easing;
// //     }
// //   });
// //
// //   const handleEntered = normalizedTransitionCallback((node) => {
// //     if (node) {
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.height = "auto";
// //     }
// //   });
// //
// //   const handleExit = normalizedTransitionCallback((node) => {
// //     if (node) {
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.height = `${getWrapperSize()}px`;
// //     }
// //   });
// //
// //   const handleExiting = normalizedTransitionCallback((node) => {
// //     if (node) {
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.transitionDuration = `${timeout}ms`;
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.height = collapsedSize;
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.transitionTimingFunction = easing;
// //     }
// //   });
// //
// //   return (
// //     <Transition
// //       in={inProp}
// //       onEnter={handleEnter}
// //       onEntered={handleEntered}
// //       onEntering={handleEntering}
// //       onExit={handleExit}
// //       onExiting={handleExiting}
// //       nodeRef={nodeRef}
// //       timeout={timeout}
// //     >
// //       {(state) => (
// //         <Box
// //           sx={{
// //             minHeight: collapsedSize,
// //             height: 0,
// //             overflow: "hidden",
// //             transition: theme.transitions.create("height"),
// //             ...(state === "entered" && {
// //               height: "auto",
// //               overflow: "visible",
// //             }),
// //             ...(state === "exited" &&
// //               !inProp && {
// //                 visibility: "hidden",
// //               }),
// //           }}
// //           ref={handleRef}
// //         >
// //           <Box
// //             sx={{
// //               // Hack to get children with a negative margin to not falsify the height computation.
// //               display: "flex",
// //               width: "100%",
// //             }}
// //             ref={wrapperRef}
// //           >
// //             <Box sx={{ width: "100%" }}>{children}</Box>
// //           </Box>
// //         </Box>
// //       )}
// //     </Transition>
// //   );
// // });
//
// class UnitBezier {
//   cx: number;
//   bx: number;
//   ax: number;
//   cy: number;
//   by: number;
//   ay: number;
//   static epsilon = 1e-6;
//   /**
//    * Solver for cubic Bézier curve with implicit control points at (0,0) and (1.0, 1.0)
//    */
//   constructor(p1x: number, p1y: number, p2x: number, p2y: number) {
//     // pre-calculate the polynomial coefficients
//     // First and last control points are implied to be (0,0) and (1.0, 1.0)
//     this.cx = 3.0 * p1x;
//     this.bx = 3.0 * (p2x - p1x) - this.cx;
//     this.ax = 1.0 - this.cx - this.bx;
//
//     this.cy = 3.0 * p1y;
//     this.by = 3.0 * (p2y - p1y) - this.cy;
//     this.ay = 1.0 - this.cy - this.by;
//   }
//
//   sampleCurveX(time: number) {
//     return ((this.ax * time + this.bx) * time + this.cx) * time;
//   }
//
//   sampleCurveY(time: number) {
//     return ((this.ay * time + this.by) * time + this.cy) * time;
//   }
//
//   sampleCurveDerivativeX(time: number) {
//     return (3.0 * this.ax * time + 2.0 * this.bx) * time + this.cx;
//   }
//
//   solveCurveX(x: number, epsilon: number) {
//     let t0;
//     let t1;
//     let t2;
//     let x2;
//     let d2;
//     let i;
//
//     // First try a few iterations of Newton's method -- normally very fast.
//     for (t2 = x, i = 0; i < 8; i++) {
//       x2 = this.sampleCurveX(t2) - x;
//       if (Math.abs(x2) < epsilon) {
//         return t2;
//       }
//       d2 = this.sampleCurveDerivativeX(t2);
//       if (Math.abs(d2) < epsilon) {
//         break;
//       }
//       t2 -= x2 / d2;
//     }
//
//     // No solution found - use bi-section
//     t0 = 0.0;
//     t1 = 1.0;
//     t2 = x;
//
//     if (t2 < t0) {
//       return t0;
//     }
//     if (t2 > t1) {
//       return t1;
//     }
//
//     while (t0 < t1) {
//       x2 = this.sampleCurveX(t2);
//       if (Math.abs(x2 - x) < epsilon) {
//         return t2;
//       }
//       if (x > x2) {
//         t0 = t2;
//       } else {
//         t1 = t2;
//       }
//
//       t2 = (t1 - t0) * 0.5 + t0;
//     }
//
//     // Give up
//     return t2;
//   }
//
//   solve(x: number, epsilon: number) {
//     return this.sampleCurveY(this.solveCurveX(x, epsilon));
//   }
// }
//
// const curve = new UnitBezier(0.4, 0, 0.2, 1);
//
// export const EditBar = ({
//                           currentVersion,
//                           discardButtonProps,
//                         }: {
//   currentVersion: number;
//   discardButtonProps: Partial<ButtonProps>;
// }) => {
//   const { isDirty } = useFormState<EntityTypeEditorForm>();
//   const frozenVersion = useFrozenValue(currentVersion);
//
//   // const observerRef = useRef<ResizeObserver>(null);
//   //
//   // const ref = useRef<HTMLDivElement>(null);
//
//   // useEffect(() => {
//   //   const node = ref.current;
//   //   if (!node) {
//   //     return;
//   //   }
//   //
//   //   let beginningHeight = 0;
//   //   let scrollTop = 0;
//   //
//   //   // observerRef.current?.disconnect();
//   //
//   //   let frame: number | null = null;
//   //
//   //   const handler = () => {
//   //     const height = node.getBoundingClientRect().height;
//   //
//   //     const diff = height - beginningHeight;
//   //
//   //     console.log(diff, scrollTop);
//   //
//   //     document.documentElement.scrollTop += 66;
//   //
//   //     frame = requestAnimationFrame(handler);
//   //   };
//   //
//   //   const start = () => {
//   //     if (frame) {
//   //       cancelAnimationFrame(frame);
//   //     }
//   //
//   //     beginningHeight = node.getBoundingClientRect().height;
//   //     scrollTop = document.documentElement.scrollTop;
//   //
//   // {/*    handler();*/}
//   // {/*  };*/}
//   // {/*  node.addEventListener("transitionstart", start);*/}
//   //   const end = () => {
//   //     if (frame) {
//   //       cancelAnimationFrame(frame);
//   //     }
//   //     handler();
//   //     if (frame) {
//   //       cancelAnimationFrame(frame);
//   //     }
//   //   };
//   //   node.addEventListener("transitionend", end);
//   //   node.addEventListener("transitioncancel", end);
//   //
//   //   return () => {
//   //     if (frame) {
//   //       cancelAnimationFrame(frame);
//   //     }
//   //     node.removeEventListener("transitionstart", start);
//   //     node.removeEventListener("transitionend", end);
//   //     node.removeEventListener("transitioncancel", end);
//   //   };
//   //
//   //   // const observer = new ResizeObserver(([size]) => {
//   //
//   //   // });
//   //   //
//   //   // observer.observe(ref);
//   //   // observerRef.current = observer;
//   // }, []);
//
//   const collapseIn = currentVersion === 0 || isDirty;
//
//   const ref = useRef<HTMLDivElement>(null);
//
//   useLayoutEffect(() => {
//     const node = ref.current;
//     if (node && collapseIn) {
//       let frame: number | null = null;
//
//       const cancel = () => {
//         if (frame) {
//           cancelAnimationFrame(frame);
//         }
//       };
//
//       const end = () => {
//         cancel();
//         document.documentElement.scrollTo({ top: 66, behavior: "auto" });
//         document.body.style.setProperty("top", `0px`);
//       };
//
//       let startTime: number | null;
//       const startPos = 0;
//
//       const tick = () => {
//         if (!startTime) {
//           startTime = Date.now();
//         }
//         const diff = Date.now() - startTime;
//         const percentage = Math.min(1, diff / 300);
//         const t1 = curve.solve(percentage, UnitBezier.epsilon);
//         const distance = Math.round(66 * t1);
//         const scrollPos = startPos + distance;
//         // document.documentElement.scrollTo(0, scrollPos);
//         node.style.setProperty("height", `${distance}px`);
//         document.body.style.setProperty("top", `-${distance}px`);
//         if (percentage < 1) {
//           frame = requestAnimationFrame(tick);
//         } else {
//           end();
//         }
//       };
//
//       tick();
//
//       return cancel;
//     } else {
//       ref.current?.style.setProperty("height", `0px`);
//       document.body.style.setProperty("top", `0px`);
//     }
//   }, [collapseIn]);
//
//   return (
//     <>
//       <GlobalStyles
//         styles={{
//           body: {
//             position: "relative",
//             minHeight: "calc(100vh +  66px) !important",
//           },
//         }}
//       />
//       <Box sx={{ height: 0, overflow: "hidden" }} ref={ref}>
//         <Box
//           sx={(theme) => ({
//             height: 66,
//             backgroundColor: theme.palette.blue[70],
//             color: theme.palette.white,
//             display: "flex",
//             alignItems: "center",
//           })}
//         >
//           {frozenVersion === 0 ? (
//             <EditBarContents
//               icon={<FontAwesomeIcon icon={faSmile} sx={{ fontSize: 14 }} />}
//               title="Currently editing"
//               label="- this type has not yet been created"
//               discardButtonProps={{
//                 children: "Discard this type",
//                 ...discardButtonProps,
//               }}
//               confirmButtonProps={{
//                 children: "Create",
//               }}
//             />
//           ) : (
//             <EditBarContents
//               icon={<PencilSimpleLine />}
//               title="Currently editing"
//               label={`Version ${frozenVersion} -> ${frozenVersion + 1}`}
//               discardButtonProps={{
//                 children: "Discard changes",
//                 ...discardButtonProps,
//               }}
//               confirmButtonProps={{
//                 children: "Publish update",
//               }}
//             />
//           )}
//         </Box>
//       </Box>
//     </>
//   );
// };
//
//
// // attempt 4
//
// import { faSmile } from "@fortawesome/free-regular-svg-icons";
// import { FontAwesomeIcon } from "@hashintel/hash-design-system";
// import {
//   Box,
//   Collapse,
//   Container,
//   Stack,
//   Typography,
//   useForkRef,
//   useTheme,
// } from "@mui/material";
// import { GlobalStyles, useThemeProps } from "@mui/system";
// import {
//   forwardRef,
//   ReactNode,
//   useEffect,
//   useLayoutEffect,
//   useRef,
//   useState,
// } from "react";
// import { useFormState } from "react-hook-form";
// import { Transition } from "react-transition-group";
// import { PencilSimpleLine } from "../../../../shared/icons/svg";
// import { Button, ButtonProps } from "../../../../shared/ui/button";
// import { EntityTypeEditorForm } from "./form-types";
//
// const useFrozenValue = <T extends any>(value: T): T => {
//   const { isDirty } = useFormState<EntityTypeEditorForm>();
//
//   const [frozen, setFrozen] = useState(value);
//
//   if (isDirty && frozen !== value) {
//     setFrozen(value);
//   }
//
//   return frozen;
// };
//
// // @todo disabled button styles
// const EditBarContents = ({
//                            icon,
//                            title,
//                            label,
//                            discardButtonProps,
//                            confirmButtonProps,
//                          }: {
//   icon: ReactNode;
//   title: ReactNode;
//   label: ReactNode;
//   discardButtonProps: ButtonProps;
//   confirmButtonProps: ButtonProps;
// }) => {
//   const { isSubmitting } = useFormState<EntityTypeEditorForm>();
//
//   const frozenSubmitting = useFrozenValue(isSubmitting);
//
//   return (
//     <Container
//       sx={{
//         display: "flex",
//         alignItems: "center",
//       }}
//     >
//       {icon}
//       <Typography variant="smallTextLabels" sx={{ ml: 1 }}>
//         <Box component="span" sx={{ fontWeight: "bold", mr: 1 }}>
//           {title}
//         </Box>{" "}
//         {label}
//       </Typography>
//       <Stack spacing={1.25} sx={{ marginLeft: "auto" }} direction="row">
//         <Button
//           variant="tertiary"
//           size="xs"
//           sx={(theme) => ({
//             borderColor: theme.palette.blue[50],
//             backgroundColor: "transparent",
//             color: "white",
//             "&:hover": {
//               backgroundColor: theme.palette.blue[80],
//               color: "white",
//             },
//           })}
//           disabled={frozenSubmitting}
//           {...discardButtonProps}
//         >
//           {discardButtonProps.children}
//         </Button>
//         <Button
//           variant="secondary"
//           size="xs"
//           type="submit"
//           loading={frozenSubmitting}
//           loadingWithoutText
//           disabled={frozenSubmitting}
//           {...confirmButtonProps}
//         >
//           {confirmButtonProps.children}
//         </Button>
//       </Stack>
//     </Container>
//   );
// };
//
// //
// // /**
// //  * The Collapse transition is used by the
// //  * [Vertical Stepper](/material-ui/react-stepper/#vertical-stepper) StepContent component.
// //  * It uses [react-transition-group](https://github.com/reactjs/react-transition-group) internally.
// //  */
// // const Collapse = forwardRef<
// //   HTMLDivElement,
// //   { in: boolean; children: ReactNode }
// // >((inProps, ref) => {
// //   const props = useThemeProps({ props: inProps, name: "MuiCollapse" });
// //   const timeout = 300;
// //   const { children, in: inProp } = props;
// //
// //   const collapsedSize = "0px";
// //   const theme = useTheme();
// //   const wrapperRef = useRef<HTMLDivElement>(null);
// //   const nodeRef = useRef<HTMLDivElement>(null);
// //   const handleRef = useForkRef(ref, nodeRef);
// //
// //   const normalizedTransitionCallback =
// //     (callback: (node: HTMLElement | null, isAppearing?: boolean) => void) =>
// //     (maybeIsAppearing?: boolean) => {
// //       if (callback) {
// //         const node = nodeRef.current;
// //
// //         // onEnterXxx and onExitXxx callbacks have a different arguments.length value.
// //         if (maybeIsAppearing === undefined) {
// //           callback(node);
// //         } else {
// //           callback(node, maybeIsAppearing);
// //         }
// //       }
// //     };
// //
// //   const getWrapperSize = () =>
// //     wrapperRef.current ? wrapperRef.current.clientHeight : 0;
// //
// //   const handleEnter = normalizedTransitionCallback((node) => {
// //     if (node) {
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.height = collapsedSize;
// //     }
// //   });
// //
// //   const easing = "cubic-bezier(0.4, 0, 0.2, 1)";
// //
// //   const handleEntering = normalizedTransitionCallback((node) => {
// //     if (node) {
// //       const wrapperSize = getWrapperSize();
// //
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.transitionDuration = `${timeout}ms`;
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.height = `${wrapperSize}px`;
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.transitionTimingFunction = easing;
// //     }
// //   });
// //
// //   const handleEntered = normalizedTransitionCallback((node) => {
// //     if (node) {
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.height = "auto";
// //     }
// //   });
// //
// //   const handleExit = normalizedTransitionCallback((node) => {
// //     if (node) {
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.height = `${getWrapperSize()}px`;
// //     }
// //   });
// //
// //   const handleExiting = normalizedTransitionCallback((node) => {
// //     if (node) {
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.transitionDuration = `${timeout}ms`;
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.height = collapsedSize;
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.transitionTimingFunction = easing;
// //     }
// //   });
// //
// //   return (
// //     <Transition
// //       in={inProp}
// //       onEnter={handleEnter}
// //       onEntered={handleEntered}
// //       onEntering={handleEntering}
// //       onExit={handleExit}
// //       onExiting={handleExiting}
// //       nodeRef={nodeRef}
// //       timeout={timeout}
// //     >
// //       {(state) => (
// //         <Box
// //           sx={{
// //             minHeight: collapsedSize,
// //             height: 0,
// //             overflow: "hidden",
// //             transition: theme.transitions.create("height"),
// //             ...(state === "entered" && {
// //               height: "auto",
// //               overflow: "visible",
// //             }),
// //             ...(state === "exited" &&
// //               !inProp && {
// //                 visibility: "hidden",
// //               }),
// //           }}
// //           ref={handleRef}
// //         >
// //           <Box
// //             sx={{
// //               // Hack to get children with a negative margin to not falsify the height computation.
// //               display: "flex",
// //               width: "100%",
// //             }}
// //             ref={wrapperRef}
// //           >
// //             <Box sx={{ width: "100%" }}>{children}</Box>
// //           </Box>
// //         </Box>
// //       )}
// //     </Transition>
// //   );
// // });
//
// class UnitBezier {
//   cx: number;
//   bx: number;
//   ax: number;
//   cy: number;
//   by: number;
//   ay: number;
//   static epsilon = 1e-6;
//   /**
//    * Solver for cubic Bézier curve with implicit control points at (0,0) and (1.0, 1.0)
//    */
//   constructor(p1x: number, p1y: number, p2x: number, p2y: number) {
//     // pre-calculate the polynomial coefficients
//     // First and last control points are implied to be (0,0) and (1.0, 1.0)
//     this.cx = 3.0 * p1x;
//     this.bx = 3.0 * (p2x - p1x) - this.cx;
//     this.ax = 1.0 - this.cx - this.bx;
//
//     this.cy = 3.0 * p1y;
//     this.by = 3.0 * (p2y - p1y) - this.cy;
//     this.ay = 1.0 - this.cy - this.by;
//   }
//
//   sampleCurveX(time: number) {
//     return ((this.ax * time + this.bx) * time + this.cx) * time;
//   }
//
//   sampleCurveY(time: number) {
//     return ((this.ay * time + this.by) * time + this.cy) * time;
//   }
//
//   sampleCurveDerivativeX(time: number) {
//     return (3.0 * this.ax * time + 2.0 * this.bx) * time + this.cx;
//   }
//
//   solveCurveX(x: number, epsilon: number) {
//     let t0;
//     let t1;
//     let t2;
//     let x2;
//     let d2;
//     let i;
//
//     // First try a few iterations of Newton's method -- normally very fast.
//     for (t2 = x, i = 0; i < 8; i++) {
//       x2 = this.sampleCurveX(t2) - x;
//       if (Math.abs(x2) < epsilon) {
//         return t2;
//       }
//       d2 = this.sampleCurveDerivativeX(t2);
//       if (Math.abs(d2) < epsilon) {
//         break;
//       }
//       t2 -= x2 / d2;
//     }
//
//     // No solution found - use bi-section
//     t0 = 0.0;
//     t1 = 1.0;
//     t2 = x;
//
//     if (t2 < t0) {
//       return t0;
//     }
//     if (t2 > t1) {
//       return t1;
//     }
//
//     while (t0 < t1) {
//       x2 = this.sampleCurveX(t2);
//       if (Math.abs(x2 - x) < epsilon) {
//         return t2;
//       }
//       if (x > x2) {
//         t0 = t2;
//       } else {
//         t1 = t2;
//       }
//
//       t2 = (t1 - t0) * 0.5 + t0;
//     }
//
//     // Give up
//     return t2;
//   }
//
//   solve(x: number, epsilon: number) {
//     return this.sampleCurveY(this.solveCurveX(x, epsilon));
//   }
// }
//
// const curve = new UnitBezier(0.4, 0, 0.2, 1);
//
// export const EditBar = ({
//                           currentVersion,
//                           discardButtonProps,
//                         }: {
//   currentVersion: number;
//   discardButtonProps: Partial<ButtonProps>;
// }) => {
//   const { isDirty } = useFormState<EntityTypeEditorForm>();
//   const frozenVersion = useFrozenValue(currentVersion);
//
//   // const observerRef = useRef<ResizeObserver>(null);
//   //
//   // const ref = useRef<HTMLDivElement>(null);
//
//   // useEffect(() => {
//   //   const node = ref.current;
//   //   if (!node) {
//   //     return;
//   //   }
//   //
//   //   let beginningHeight = 0;
//   //   let scrollTop = 0;
//   //
//   //   // observerRef.current?.disconnect();
//   //
//   //   let frame: number | null = null;
//   //
//   //   const handler = () => {
//   //     const height = node.getBoundingClientRect().height;
//   //
//   //     const diff = height - beginningHeight;
//   //
//   //     console.log(diff, scrollTop);
//   //
//   //     document.documentElement.scrollTop += 66;
//   //
//   //     frame = requestAnimationFrame(handler);
//   //   };
//   //
//   //   const start = () => {
//   //     if (frame) {
//   //       cancelAnimationFrame(frame);
//   //     }
//   //
//   //     beginningHeight = node.getBoundingClientRect().height;
//   //     scrollTop = document.documentElement.scrollTop;
//   //
//   // {/*    handler();*/}
//   // {/*  };*/}
//   // {/*  node.addEventListener("transitionstart", start);*/}
//   //   const end = () => {
//   //     if (frame) {
//   //       cancelAnimationFrame(frame);
//   //     }
//   //     handler();
//   //     if (frame) {
//   //       cancelAnimationFrame(frame);
//   //     }
//   //   };
//   //   node.addEventListener("transitionend", end);
//   //   node.addEventListener("transitioncancel", end);
//   //
//   //   return () => {
//   //     if (frame) {
//   //       cancelAnimationFrame(frame);
//   //     }
//   //     node.removeEventListener("transitionstart", start);
//   //     node.removeEventListener("transitionend", end);
//   //     node.removeEventListener("transitioncancel", end);
//   //   };
//   //
//   //   // const observer = new ResizeObserver(([size]) => {
//   //
//   //   // });
//   //   //
//   //   // observer.observe(ref);
//   //   // observerRef.current = observer;
//   // }, []);
//
//   const collapseIn = currentVersion === 0 || isDirty;
//
//   const ref = useRef<HTMLDivElement>(null);
//
//   useLayoutEffect(() => {
//     if (collapseIn) {
//       let frame: number | null = null;
//
//       const end = () => {
//         if (frame) {
//           cancelAnimationFrame(frame);
//         }
//       };
//
//       let startTime: number | null;
//       const startPos = 0;
//
//       const tick = () => {
//         if (!startTime) {
//           startTime = Date.now();
//         }
//         const diff = Date.now() - startTime;
//         const percentage = Math.min(1, diff / 300);
//         const t1 = curve.solve(percentage, UnitBezier.epsilon);
//         const distance = Math.round(66 * t1);
//         const scrollPos = startPos + distance;
//         document.documentElement.scrollTop = scrollPos;
//         // node.style.setProperty("height", `${distance}px`);
//         if (percentage < 1) {
//           frame = requestAnimationFrame(tick);
//         }
//       };
//
//       tick();
//
//       return () => {
//         end();
//       };
//     }
//   }, [collapseIn]);
//
//   return (
//     <>
//       <GlobalStyles
//         styles={{
//           body: {
//             minHeight: "calc(100vh +  66px) !important",
//           },
//         }}
//       />
//       <Collapse in={collapseIn}>
//         <Box
//           sx={(theme) => ({
//             height: 66,
//             backgroundColor: theme.palette.blue[70],
//             color: theme.palette.white,
//             display: "flex",
//             alignItems: "center",
//           })}
//         >
//           {frozenVersion === 0 ? (
//             <EditBarContents
//               icon={<FontAwesomeIcon icon={faSmile} sx={{ fontSize: 14 }} />}
//               title="Currently editing"
//               label="- this type has not yet been created"
//               discardButtonProps={{
//                 children: "Discard this type",
//                 ...discardButtonProps,
//               }}
//               confirmButtonProps={{
//                 children: "Create",
//               }}
//             />
//           ) : (
//             <EditBarContents
//               icon={<PencilSimpleLine />}
//               title="Currently editing"
//               label={`Version ${frozenVersion} -> ${frozenVersion + 1}`}
//               discardButtonProps={{
//                 children: "Discard changes",
//                 ...discardButtonProps,
//               }}
//               confirmButtonProps={{
//                 children: "Publish update",
//               }}
//             />
//           )}
//         </Box>
//       </Collapse>
//     </>
//   );
// };
//
//
// // attempt 5
//
// import { faSmile } from "@fortawesome/free-regular-svg-icons";
// import { FontAwesomeIcon } from "@hashintel/hash-design-system";
// import {
//   Box,
//   Collapse,
//   Container,
//   Stack,
//   Typography,
//   useForkRef,
//   useTheme,
// } from "@mui/material";
// import { GlobalStyles, useThemeProps } from "@mui/system";
// import {
//   forwardRef,
//   ReactNode,
//   useEffect,
//   useLayoutEffect,
//   useRef,
//   useState,
// } from "react";
// import { useFormState } from "react-hook-form";
// import { Transition } from "react-transition-group";
// import { PencilSimpleLine } from "../../../../shared/icons/svg";
// import { Button, ButtonProps } from "../../../../shared/ui/button";
// import { EntityTypeEditorForm } from "./form-types";
//
// const useFrozenValue = <T extends any>(value: T): T => {
//   const { isDirty } = useFormState<EntityTypeEditorForm>();
//
//   const [frozen, setFrozen] = useState(value);
//
//   if (isDirty && frozen !== value) {
//     setFrozen(value);
//   }
//
//   return frozen;
// };
//
// // @todo disabled button styles
// const EditBarContents = ({
//                            icon,
//                            title,
//                            label,
//                            discardButtonProps,
//                            confirmButtonProps,
//                          }: {
//   icon: ReactNode;
//   title: ReactNode;
//   label: ReactNode;
//   discardButtonProps: ButtonProps;
//   confirmButtonProps: ButtonProps;
// }) => {
//   const { isSubmitting } = useFormState<EntityTypeEditorForm>();
//
//   const frozenSubmitting = useFrozenValue(isSubmitting);
//
//   return (
//     <Container
//       sx={{
//         display: "flex",
//         alignItems: "center",
//       }}
//     >
//       {icon}
//       <Typography variant="smallTextLabels" sx={{ ml: 1 }}>
//         <Box component="span" sx={{ fontWeight: "bold", mr: 1 }}>
//           {title}
//         </Box>{" "}
//         {label}
//       </Typography>
//       <Stack spacing={1.25} sx={{ marginLeft: "auto" }} direction="row">
//         <Button
//           variant="tertiary"
//           size="xs"
//           sx={(theme) => ({
//             borderColor: theme.palette.blue[50],
//             backgroundColor: "transparent",
//             color: "white",
//             "&:hover": {
//               backgroundColor: theme.palette.blue[80],
//               color: "white",
//             },
//           })}
//           disabled={frozenSubmitting}
//           {...discardButtonProps}
//         >
//           {discardButtonProps.children}
//         </Button>
//         <Button
//           variant="secondary"
//           size="xs"
//           type="submit"
//           loading={frozenSubmitting}
//           loadingWithoutText
//           disabled={frozenSubmitting}
//           {...confirmButtonProps}
//         >
//           {confirmButtonProps.children}
//         </Button>
//       </Stack>
//     </Container>
//   );
// };
//
// //
// // /**
// //  * The Collapse transition is used by the
// //  * [Vertical Stepper](/material-ui/react-stepper/#vertical-stepper) StepContent component.
// //  * It uses [react-transition-group](https://github.com/reactjs/react-transition-group) internally.
// //  */
// // const Collapse = forwardRef<
// //   HTMLDivElement,
// //   { in: boolean; children: ReactNode }
// // >((inProps, ref) => {
// //   const props = useThemeProps({ props: inProps, name: "MuiCollapse" });
// //   const timeout = 300;
// //   const { children, in: inProp } = props;
// //
// //   const collapsedSize = "0px";
// //   const theme = useTheme();
// //   const wrapperRef = useRef<HTMLDivElement>(null);
// //   const nodeRef = useRef<HTMLDivElement>(null);
// //   const handleRef = useForkRef(ref, nodeRef);
// //
// //   const normalizedTransitionCallback =
// //     (callback: (node: HTMLElement | null, isAppearing?: boolean) => void) =>
// //     (maybeIsAppearing?: boolean) => {
// //       if (callback) {
// //         const node = nodeRef.current;
// //
// //         // onEnterXxx and onExitXxx callbacks have a different arguments.length value.
// //         if (maybeIsAppearing === undefined) {
// //           callback(node);
// //         } else {
// //           callback(node, maybeIsAppearing);
// //         }
// //       }
// //     };
// //
// //   const getWrapperSize = () =>
// //     wrapperRef.current ? wrapperRef.current.clientHeight : 0;
// //
// //   const handleEnter = normalizedTransitionCallback((node) => {
// //     if (node) {
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.height = collapsedSize;
// //     }
// //   });
// //
// //   const easing = "cubic-bezier(0.4, 0, 0.2, 1)";
// //
// //   const handleEntering = normalizedTransitionCallback((node) => {
// //     if (node) {
// //       const wrapperSize = getWrapperSize();
// //
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.transitionDuration = `${timeout}ms`;
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.height = `${wrapperSize}px`;
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.transitionTimingFunction = easing;
// //     }
// //   });
// //
// //   const handleEntered = normalizedTransitionCallback((node) => {
// //     if (node) {
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.height = "auto";
// //     }
// //   });
// //
// //   const handleExit = normalizedTransitionCallback((node) => {
// //     if (node) {
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.height = `${getWrapperSize()}px`;
// //     }
// //   });
// //
// //   const handleExiting = normalizedTransitionCallback((node) => {
// //     if (node) {
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.transitionDuration = `${timeout}ms`;
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.height = collapsedSize;
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.transitionTimingFunction = easing;
// //     }
// //   });
// //
// //   return (
// //     <Transition
// //       in={inProp}
// //       onEnter={handleEnter}
// //       onEntered={handleEntered}
// //       onEntering={handleEntering}
// //       onExit={handleExit}
// //       onExiting={handleExiting}
// //       nodeRef={nodeRef}
// //       timeout={timeout}
// //     >
// //       {(state) => (
// //         <Box
// //           sx={{
// //             minHeight: collapsedSize,
// //             height: 0,
// //             overflow: "hidden",
// //             transition: theme.transitions.create("height"),
// //             ...(state === "entered" && {
// //               height: "auto",
// //               overflow: "visible",
// //             }),
// //             ...(state === "exited" &&
// //               !inProp && {
// //                 visibility: "hidden",
// //               }),
// //           }}
// //           ref={handleRef}
// //         >
// //           <Box
// //             sx={{
// //               // Hack to get children with a negative margin to not falsify the height computation.
// //               display: "flex",
// //               width: "100%",
// //             }}
// //             ref={wrapperRef}
// //           >
// //             <Box sx={{ width: "100%" }}>{children}</Box>
// //           </Box>
// //         </Box>
// //       )}
// //     </Transition>
// //   );
// // });
//
// class UnitBezier {
//   cx: number;
//   bx: number;
//   ax: number;
//   cy: number;
//   by: number;
//   ay: number;
//   static epsilon = 1e-6;
//   /**
//    * Solver for cubic Bézier curve with implicit control points at (0,0) and (1.0, 1.0)
//    */
//   constructor(p1x: number, p1y: number, p2x: number, p2y: number) {
//     // pre-calculate the polynomial coefficients
//     // First and last control points are implied to be (0,0) and (1.0, 1.0)
//     this.cx = 3.0 * p1x;
//     this.bx = 3.0 * (p2x - p1x) - this.cx;
//     this.ax = 1.0 - this.cx - this.bx;
//
//     this.cy = 3.0 * p1y;
//     this.by = 3.0 * (p2y - p1y) - this.cy;
//     this.ay = 1.0 - this.cy - this.by;
//   }
//
//   sampleCurveX(time: number) {
//     return ((this.ax * time + this.bx) * time + this.cx) * time;
//   }
//
//   sampleCurveY(time: number) {
//     return ((this.ay * time + this.by) * time + this.cy) * time;
//   }
//
//   sampleCurveDerivativeX(time: number) {
//     return (3.0 * this.ax * time + 2.0 * this.bx) * time + this.cx;
//   }
//
//   solveCurveX(x: number, epsilon: number) {
//     let t0;
//     let t1;
//     let t2;
//     let x2;
//     let d2;
//     let i;
//
//     // First try a few iterations of Newton's method -- normally very fast.
//     for (t2 = x, i = 0; i < 8; i++) {
//       x2 = this.sampleCurveX(t2) - x;
//       if (Math.abs(x2) < epsilon) {
//         return t2;
//       }
//       d2 = this.sampleCurveDerivativeX(t2);
//       if (Math.abs(d2) < epsilon) {
//         break;
//       }
//       t2 -= x2 / d2;
//     }
//
//     // No solution found - use bi-section
//     t0 = 0.0;
//     t1 = 1.0;
//     t2 = x;
//
//     if (t2 < t0) {
//       return t0;
//     }
//     if (t2 > t1) {
//       return t1;
//     }
//
//     while (t0 < t1) {
//       x2 = this.sampleCurveX(t2);
//       if (Math.abs(x2 - x) < epsilon) {
//         return t2;
//       }
//       if (x > x2) {
//         t0 = t2;
//       } else {
//         t1 = t2;
//       }
//
//       t2 = (t1 - t0) * 0.5 + t0;
//     }
//
//     // Give up
//     return t2;
//   }
//
//   solve(x: number, epsilon: number) {
//     return this.sampleCurveY(this.solveCurveX(x, epsilon));
//   }
// }
//
// const curve = new UnitBezier(0.4, 0, 0.2, 1);
//
// export const EditBar = ({
//                           currentVersion,
//                           discardButtonProps,
//                         }: {
//   currentVersion: number;
//   discardButtonProps: Partial<ButtonProps>;
// }) => {
//   const { isDirty } = useFormState<EntityTypeEditorForm>();
//   const frozenVersion = useFrozenValue(currentVersion);
//
//   // const observerRef = useRef<ResizeObserver>(null);
//   //
//   // const ref = useRef<HTMLDivElement>(null);
//
//   // useEffect(() => {
//   //   const node = ref.current;
//   //   if (!node) {
//   //     return;
//   //   }
//   //
//   //   let beginningHeight = 0;
//   //   let scrollTop = 0;
//   //
//   //   // observerRef.current?.disconnect();
//   //
//   //   let frame: number | null = null;
//   //
//   //   const handler = () => {
//   //     const height = node.getBoundingClientRect().height;
//   //
//   //     const diff = height - beginningHeight;
//   //
//   //     console.log(diff, scrollTop);
//   //
//   //     document.documentElement.scrollTop += 66;
//   //
//   //     frame = requestAnimationFrame(handler);
//   //   };
//   //
//   //   const start = () => {
//   //     if (frame) {
//   //       cancelAnimationFrame(frame);
//   //     }
//   //
//   //     beginningHeight = node.getBoundingClientRect().height;
//   //     scrollTop = document.documentElement.scrollTop;
//   //
//   // {/*    handler();*/}
//   // {/*  };*/}
//   // {/*  node.addEventListener("transitionstart", start);*/}
//   //   const end = () => {
//   //     if (frame) {
//   //       cancelAnimationFrame(frame);
//   //     }
//   //     handler();
//   //     if (frame) {
//   //       cancelAnimationFrame(frame);
//   //     }
//   //   };
//   //   node.addEventListener("transitionend", end);
//   //   node.addEventListener("transitioncancel", end);
//   //
//   //   return () => {
//   //     if (frame) {
//   //       cancelAnimationFrame(frame);
//   //     }
//   //     node.removeEventListener("transitionstart", start);
//   //     node.removeEventListener("transitionend", end);
//   //     node.removeEventListener("transitioncancel", end);
//   //   };
//   //
//   //   // const observer = new ResizeObserver(([size]) => {
//   //
//   //   // });
//   //   //
//   //   // observer.observe(ref);
//   //   // observerRef.current = observer;
//   // }, []);
//
//   const collapseIn = currentVersion === 0 || isDirty;
//
//   const ref = useRef<HTMLDivElement>(null);
//
//   useLayoutEffect(() => {
//     if (collapseIn) {
//       document.body.style.setProperty(
//         "height",
//         `${document.body.getBoundingClientRect().height + 66}px`,
//       );
//
//       const begin = document.documentElement.scrollTop;
//
//       document.body
//         .animate([{ top: "0px" }, { top: "-66px" }], {
//           duration: 300,
//           easing: "cubic-bezier(0.4, 0, 0.2, 1)",
//         })
//         .addEventListener("finish", () => {
//           document.documentElement.style.setProperty("scroll-behavior", "auto");
//           // document.body.style.setProperty("top", "0px");
//           // document.documentElement.scrollTo({
//           //   top: begin + 66,
//           //   behavior: "auto",
//           // });
//         });
//
//       ref.current
//         ?.animate([{ height: "0px" }, { height: "66px" }], {
//           duration: 300,
//           easing: "cubic-bezier(0.4, 0, 0.2, 1)",
//         })
//         .addEventListener("finish", () => {
//           ref.current?.style.setProperty("height", "66px");
//         });
//     } else {
//       ref.current?.style.setProperty("height", "0px");
//       document.body.style.setProperty("top", "0px");
//     }
//
//     // const node = ref.current;
//     // if (node && collapseIn) {
//     //   let frame: number | null = null;
//     //
//     //   const cancel = () => {
//     //     if (frame) {
//     //       cancelAnimationFrame(frame);
//     //     }
//     //   };
//     //
//     //   const end = () => {
//     //     cancel();
//     //     document.documentElement.scrollTo({ top: 66, behavior: "auto" });
//     //     document.body.style.setProperty("top", `0px`);
//     //   };
//     //
//     //   let startTime: number | null;
//     //   const startPos = 0;
//     //
//     //   const tick = () => {
//     //     if (!startTime) {
//     //       startTime = Date.now();
//     //     }
//     //     const diff = Date.now() - startTime;
//     //     const percentage = Math.min(1, diff / 300);
//     //     const t1 = curve.solve(percentage, UnitBezier.epsilon);
//     //     const distance = Math.round(66 * t1);
//     //     const scrollPos = startPos + distance;
//     //     // document.documentElement.scrollTo(0, scrollPos);
//     //     node.style.setProperty("height", `${distance}px`);
//     //     document.body.style.setProperty("top", `-${distance}px`);
//     //     if (percentage < 1) {
//     //       frame = requestAnimationFrame(tick);
//     //     } else {
//     //       end();
//     //     }
//     //   };
//     //
//     //   tick();
//     //
//     //   return cancel;
//     // } else {
//     //   ref.current?.style.setProperty("height", `0px`);
//     //   document.body.style.setProperty("top", `0px`);
//     // }
//   }, [collapseIn]);
//
//   return (
//     <>
//       <GlobalStyles
//         styles={{
//           body: {
//             position: "relative",
//           },
//         }}
//       />
//       <Box sx={{ height: 0, overflow: "hidden" }} ref={ref}>
//         <Box
//           sx={(theme) => ({
//             height: 66,
//             backgroundColor: theme.palette.blue[70],
//             color: theme.palette.white,
//             display: "flex",
//             alignItems: "center",
//           })}
//         >
//           {frozenVersion === 0 ? (
//             <EditBarContents
//               icon={<FontAwesomeIcon icon={faSmile} sx={{ fontSize: 14 }} />}
//               title="Currently editing"
//               label="- this type has not yet been created"
//               discardButtonProps={{
//                 children: "Discard this type",
//                 ...discardButtonProps,
//               }}
//               confirmButtonProps={{
//                 children: "Create",
//               }}
//             />
//           ) : (
//             <EditBarContents
//               icon={<PencilSimpleLine />}
//               title="Currently editing"
//               label={`Version ${frozenVersion} -> ${frozenVersion + 1}`}
//               discardButtonProps={{
//                 children: "Discard changes",
//                 ...discardButtonProps,
//               }}
//               confirmButtonProps={{
//                 children: "Publish update",
//               }}
//             />
//           )}
//         </Box>
//       </Box>
//     </>
//   );
// };
//
//
// // attempt 6
//
// import { faSmile } from "@fortawesome/free-regular-svg-icons";
// import { FontAwesomeIcon } from "@hashintel/hash-design-system";
// import {
//   Box,
//   Collapse,
//   Container,
//   Stack,
//   Typography,
//   useForkRef,
//   useTheme,
// } from "@mui/material";
// import { GlobalStyles, useThemeProps } from "@mui/system";
// import {
//   forwardRef,
//   ReactNode,
//   useEffect,
//   useLayoutEffect,
//   useRef,
//   useState,
// } from "react";
// import { useFormState } from "react-hook-form";
// import { Transition } from "react-transition-group";
// import { PencilSimpleLine } from "../../../../shared/icons/svg";
// import { Button, ButtonProps } from "../../../../shared/ui/button";
// import { EntityTypeEditorForm } from "./form-types";
//
// const useFrozenValue = <T extends any>(value: T): T => {
//   const { isDirty } = useFormState<EntityTypeEditorForm>();
//
//   const [frozen, setFrozen] = useState(value);
//
//   if (isDirty && frozen !== value) {
//     setFrozen(value);
//   }
//
//   return frozen;
// };
//
// // @todo disabled button styles
// const EditBarContents = ({
//                            icon,
//                            title,
//                            label,
//                            discardButtonProps,
//                            confirmButtonProps,
//                          }: {
//   icon: ReactNode;
//   title: ReactNode;
//   label: ReactNode;
//   discardButtonProps: ButtonProps;
//   confirmButtonProps: ButtonProps;
// }) => {
//   const { isSubmitting } = useFormState<EntityTypeEditorForm>();
//
//   const frozenSubmitting = useFrozenValue(isSubmitting);
//
//   return (
//     <Container
//       sx={{
//         display: "flex",
//         alignItems: "center",
//       }}
//     >
//       {icon}
//       <Typography variant="smallTextLabels" sx={{ ml: 1 }}>
//         <Box component="span" sx={{ fontWeight: "bold", mr: 1 }}>
//           {title}
//         </Box>{" "}
//         {label}
//       </Typography>
//       <Stack spacing={1.25} sx={{ marginLeft: "auto" }} direction="row">
//         <Button
//           variant="tertiary"
//           size="xs"
//           sx={(theme) => ({
//             borderColor: theme.palette.blue[50],
//             backgroundColor: "transparent",
//             color: "white",
//             "&:hover": {
//               backgroundColor: theme.palette.blue[80],
//               color: "white",
//             },
//           })}
//           disabled={frozenSubmitting}
//           {...discardButtonProps}
//         >
//           {discardButtonProps.children}
//         </Button>
//         <Button
//           variant="secondary"
//           size="xs"
//           type="submit"
//           loading={frozenSubmitting}
//           loadingWithoutText
//           disabled={frozenSubmitting}
//           {...confirmButtonProps}
//         >
//           {confirmButtonProps.children}
//         </Button>
//       </Stack>
//     </Container>
//   );
// };
//
// //
// // /**
// //  * The Collapse transition is used by the
// //  * [Vertical Stepper](/material-ui/react-stepper/#vertical-stepper) StepContent component.
// //  * It uses [react-transition-group](https://github.com/reactjs/react-transition-group) internally.
// //  */
// // const Collapse = forwardRef<
// //   HTMLDivElement,
// //   { in: boolean; children: ReactNode }
// // >((inProps, ref) => {
// //   const props = useThemeProps({ props: inProps, name: "MuiCollapse" });
// //   const timeout = 300;
// //   const { children, in: inProp } = props;
// //
// //   const collapsedSize = "0px";
// //   const theme = useTheme();
// //   const wrapperRef = useRef<HTMLDivElement>(null);
// //   const nodeRef = useRef<HTMLDivElement>(null);
// //   const handleRef = useForkRef(ref, nodeRef);
// //
// //   const normalizedTransitionCallback =
// //     (callback: (node: HTMLElement | null, isAppearing?: boolean) => void) =>
// //     (maybeIsAppearing?: boolean) => {
// //       if (callback) {
// //         const node = nodeRef.current;
// //
// //         // onEnterXxx and onExitXxx callbacks have a different arguments.length value.
// //         if (maybeIsAppearing === undefined) {
// //           callback(node);
// //         } else {
// //           callback(node, maybeIsAppearing);
// //         }
// //       }
// //     };
// //
// //   const getWrapperSize = () =>
// //     wrapperRef.current ? wrapperRef.current.clientHeight : 0;
// //
// //   const handleEnter = normalizedTransitionCallback((node) => {
// //     if (node) {
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.height = collapsedSize;
// //     }
// //   });
// //
// //   const easing = "cubic-bezier(0.4, 0, 0.2, 1)";
// //
// //   const handleEntering = normalizedTransitionCallback((node) => {
// //     if (node) {
// //       const wrapperSize = getWrapperSize();
// //
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.transitionDuration = `${timeout}ms`;
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.height = `${wrapperSize}px`;
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.transitionTimingFunction = easing;
// //     }
// //   });
// //
// //   const handleEntered = normalizedTransitionCallback((node) => {
// //     if (node) {
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.height = "auto";
// //     }
// //   });
// //
// //   const handleExit = normalizedTransitionCallback((node) => {
// //     if (node) {
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.height = `${getWrapperSize()}px`;
// //     }
// //   });
// //
// //   const handleExiting = normalizedTransitionCallback((node) => {
// //     if (node) {
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.transitionDuration = `${timeout}ms`;
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.height = collapsedSize;
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.transitionTimingFunction = easing;
// //     }
// //   });
// //
// //   return (
// //     <Transition
// //       in={inProp}
// //       onEnter={handleEnter}
// //       onEntered={handleEntered}
// //       onEntering={handleEntering}
// //       onExit={handleExit}
// //       onExiting={handleExiting}
// //       nodeRef={nodeRef}
// //       timeout={timeout}
// //     >
// //       {(state) => (
// //         <Box
// //           sx={{
// //             minHeight: collapsedSize,
// //             height: 0,
// //             overflow: "hidden",
// //             transition: theme.transitions.create("height"),
// //             ...(state === "entered" && {
// //               height: "auto",
// //               overflow: "visible",
// //             }),
// //             ...(state === "exited" &&
// //               !inProp && {
// //                 visibility: "hidden",
// //               }),
// //           }}
// //           ref={handleRef}
// //         >
// //           <Box
// //             sx={{
// //               // Hack to get children with a negative margin to not falsify the height computation.
// //               display: "flex",
// //               width: "100%",
// //             }}
// //             ref={wrapperRef}
// //           >
// //             <Box sx={{ width: "100%" }}>{children}</Box>
// //           </Box>
// //         </Box>
// //       )}
// //     </Transition>
// //   );
// // });
//
// class UnitBezier {
//   cx: number;
//   bx: number;
//   ax: number;
//   cy: number;
//   by: number;
//   ay: number;
//   static epsilon = 1e-6;
//   /**
//    * Solver for cubic Bézier curve with implicit control points at (0,0) and (1.0, 1.0)
//    */
//   constructor(p1x: number, p1y: number, p2x: number, p2y: number) {
//     // pre-calculate the polynomial coefficients
//     // First and last control points are implied to be (0,0) and (1.0, 1.0)
//     this.cx = 3.0 * p1x;
//     this.bx = 3.0 * (p2x - p1x) - this.cx;
//     this.ax = 1.0 - this.cx - this.bx;
//
//     this.cy = 3.0 * p1y;
//     this.by = 3.0 * (p2y - p1y) - this.cy;
//     this.ay = 1.0 - this.cy - this.by;
//   }
//
//   sampleCurveX(time: number) {
//     return ((this.ax * time + this.bx) * time + this.cx) * time;
//   }
//
//   sampleCurveY(time: number) {
//     return ((this.ay * time + this.by) * time + this.cy) * time;
//   }
//
//   sampleCurveDerivativeX(time: number) {
//     return (3.0 * this.ax * time + 2.0 * this.bx) * time + this.cx;
//   }
//
//   solveCurveX(x: number, epsilon: number) {
//     let t0;
//     let t1;
//     let t2;
//     let x2;
//     let d2;
//     let i;
//
//     // First try a few iterations of Newton's method -- normally very fast.
//     for (t2 = x, i = 0; i < 8; i++) {
//       x2 = this.sampleCurveX(t2) - x;
//       if (Math.abs(x2) < epsilon) {
//         return t2;
//       }
//       d2 = this.sampleCurveDerivativeX(t2);
//       if (Math.abs(d2) < epsilon) {
//         break;
//       }
//       t2 -= x2 / d2;
//     }
//
//     // No solution found - use bi-section
//     t0 = 0.0;
//     t1 = 1.0;
//     t2 = x;
//
//     if (t2 < t0) {
//       return t0;
//     }
//     if (t2 > t1) {
//       return t1;
//     }
//
//     while (t0 < t1) {
//       x2 = this.sampleCurveX(t2);
//       if (Math.abs(x2 - x) < epsilon) {
//         return t2;
//       }
//       if (x > x2) {
//         t0 = t2;
//       } else {
//         t1 = t2;
//       }
//
//       t2 = (t1 - t0) * 0.5 + t0;
//     }
//
//     // Give up
//     return t2;
//   }
//
//   solve(x: number, epsilon: number) {
//     return this.sampleCurveY(this.solveCurveX(x, epsilon));
//   }
// }
//
// const curve = new UnitBezier(0.4, 0, 0.2, 1);
//
// export const EditBar = ({
//                           currentVersion,
//                           discardButtonProps,
//                         }: {
//   currentVersion: number;
//   discardButtonProps: Partial<ButtonProps>;
// }) => {
//   const { isDirty } = useFormState<EntityTypeEditorForm>();
//   const frozenVersion = useFrozenValue(currentVersion);
//
//   // const observerRef = useRef<ResizeObserver>(null);
//   //
//   // const ref = useRef<HTMLDivElement>(null);
//
//   // useEffect(() => {
//   //   const node = ref.current;
//   //   if (!node) {
//   //     return;
//   //   }
//   //
//   //   let beginningHeight = 0;
//   //   let scrollTop = 0;
//   //
//   //   // observerRef.current?.disconnect();
//   //
//   //   let frame: number | null = null;
//   //
//   //   const handler = () => {
//   //     const height = node.getBoundingClientRect().height;
//   //
//   //     const diff = height - beginningHeight;
//   //
//   //     console.log(diff, scrollTop);
//   //
//   //     document.documentElement.scrollTop += 66;
//   //
//   //     frame = requestAnimationFrame(handler);
//   //   };
//   //
//   //   const start = () => {
//   //     if (frame) {
//   //       cancelAnimationFrame(frame);
//   //     }
//   //
//   //     beginningHeight = node.getBoundingClientRect().height;
//   //     scrollTop = document.documentElement.scrollTop;
//   //
//   // {/*    handler();*/}
//   // {/*  };*/}
//   // {/*  node.addEventListener("transitionstart", start);*/}
//   //   const end = () => {
//   //     if (frame) {
//   //       cancelAnimationFrame(frame);
//   //     }
//   //     handler();
//   //     if (frame) {
//   //       cancelAnimationFrame(frame);
//   //     }
//   //   };
//   //   node.addEventListener("transitionend", end);
//   //   node.addEventListener("transitioncancel", end);
//   //
//   //   return () => {
//   //     if (frame) {
//   //       cancelAnimationFrame(frame);
//   //     }
//   //     node.removeEventListener("transitionstart", start);
//   //     node.removeEventListener("transitionend", end);
//   //     node.removeEventListener("transitioncancel", end);
//   //   };
//   //
//   //   // const observer = new ResizeObserver(([size]) => {
//   //
//   //   // });
//   //   //
//   //   // observer.observe(ref);
//   //   // observerRef.current = observer;
//   // }, []);
//
//   const collapseIn = currentVersion === 0 || isDirty;
//
//   const ref = useRef<HTMLDivElement>(null);
//
//   useLayoutEffect(() => {
//     const node = ref.current;
//     if (node) {
//       if (collapseIn) {
//         document.body.style.setProperty(
//           "height",
//           `${document.body.getBoundingClientRect().height + 66}px`,
//         );
//
//         let frame: number | null = null;
//
//         const cancel = () => {
//           if (frame) {
//             cancelAnimationFrame(frame);
//           }
//         };
//
//         const end = () => {
//           cancel();
//           // document.documentElement.scrollTo({ top: 66, behavior: "auto" });
//           // document.body.style.setProperty("top", `0px`);
//         };
//
//         let startTime: number | null;
//         const startPos = document.documentElement.scrollTop;
//
//         const tick = () => {
//           if (!startTime) {
//             startTime = Date.now();
//           }
//           const diff = Date.now() - startTime;
//           const percentage = Math.min(1, diff / 300);
//           const t1 = curve.solve(percentage, UnitBezier.epsilon);
//           const distance = Math.round(66 * t1);
//           const scrollPos = startPos + distance;
//           document.documentElement.style.setProperty("scroll-behavior", "auto");
//           document.documentElement.scrollTo(0, scrollPos);
//           node.style.setProperty("height", `${distance}px`);
//           // document.body.style.setProperty("top", `-${distance}px`);
//           if (percentage < 1) {
//             frame = requestAnimationFrame(tick);
//           } else {
//             end();
//           }
//         };
//
//         tick();
//
//         return cancel;
//       } else {
//         let frame: number | null = null;
//
//         const cancel = () => {
//           if (frame) {
//             cancelAnimationFrame(frame);
//           }
//         };
//
//         const end = () => {
//           cancel();
//           // document.documentElement.scrollTo({ top: 66, behavior: "auto" });
//           // document.body.style.setProperty("top", `0px`);
//         };
//
//         let startTime: number | null;
//         const startPos = document.documentElement.scrollTop;
//
//         const tick = () => {
//           if (!startTime) {
//             startTime = Date.now();
//           }
//           const diff = Date.now() - startTime;
//           const percentage = Math.min(1, diff / 300);
//           const t1 = 1 - curve.solve(percentage, UnitBezier.epsilon);
//           const distance = Math.round(66 * t1);
//
//           // const scrollPos = startPos + distance;
//           document.documentElement.style.setProperty("scroll-behavior", "auto");
//           document.documentElement.scrollTo(0, startPos - (66 - distance));
//           node.style.setProperty("height", `${distance}px`);
//           // document.body.style.setProperty("top", `-${distance}px`);
//           if (percentage < 1) {
//             frame = requestAnimationFrame(tick);
//           } else {
//             end();
//           }
//         };
//
//         tick();
//
//         return cancel;
//
//         ref.current?.style.setProperty("height", `0px`);
//       }
//     }
//   }, [collapseIn]);
//
//   return (
//     <>
//       <GlobalStyles
//         styles={{
//           body: {
//             position: "relative",
//             // minHeight: "calc(100vh +  66px) !important",
//           },
//         }}
//       />
//       <Box sx={{ height: 0, overflow: "hidden" }} ref={ref}>
//         <Box
//           sx={(theme) => ({
//             height: 66,
//             backgroundColor: theme.palette.blue[70],
//             color: theme.palette.white,
//             display: "flex",
//             alignItems: "center",
//           })}
//         >
//           {frozenVersion === 0 ? (
//             <EditBarContents
//               icon={<FontAwesomeIcon icon={faSmile} sx={{ fontSize: 14 }} />}
//               title="Currently editing"
//               label="- this type has not yet been created"
//               discardButtonProps={{
//                 children: "Discard this type",
//                 ...discardButtonProps,
//               }}
//               confirmButtonProps={{
//                 children: "Create",
//               }}
//             />
//           ) : (
//             <EditBarContents
//               icon={<PencilSimpleLine />}
//               title="Currently editing"
//               label={`Version ${frozenVersion} -> ${frozenVersion + 1}`}
//               discardButtonProps={{
//                 children: "Discard changes",
//                 ...discardButtonProps,
//               }}
//               confirmButtonProps={{
//                 children: "Publish update",
//               }}
//             />
//           )}
//         </Box>
//       </Box>
//     </>
//   );
// };
//
//
// // attempt 7
//
// import { faSmile } from "@fortawesome/free-regular-svg-icons";
// import { FontAwesomeIcon } from "@hashintel/hash-design-system";
// import {
//   Box,
//   Collapse,
//   Container,
//   Stack,
//   Typography,
//   useForkRef,
//   useTheme,
// } from "@mui/material";
// import { GlobalStyles, useThemeProps } from "@mui/system";
// import {
//   forwardRef,
//   ReactNode,
//   useEffect,
//   useLayoutEffect,
//   useRef,
//   useState,
// } from "react";
// import { useFormState } from "react-hook-form";
// import { Transition } from "react-transition-group";
// import { PencilSimpleLine } from "../../../../shared/icons/svg";
// import { Button, ButtonProps } from "../../../../shared/ui/button";
// import { EntityTypeEditorForm } from "./form-types";
//
// const useFrozenValue = <T extends any>(value: T): T => {
//   const { isDirty } = useFormState<EntityTypeEditorForm>();
//
//   const [frozen, setFrozen] = useState(value);
//
//   if (isDirty && frozen !== value) {
//     setFrozen(value);
//   }
//
//   return frozen;
// };
//
// // @todo disabled button styles
// const EditBarContents = ({
//                            icon,
//                            title,
//                            label,
//                            discardButtonProps,
//                            confirmButtonProps,
//                          }: {
//   icon: ReactNode;
//   title: ReactNode;
//   label: ReactNode;
//   discardButtonProps: ButtonProps;
//   confirmButtonProps: ButtonProps;
// }) => {
//   const { isSubmitting } = useFormState<EntityTypeEditorForm>();
//
//   const frozenSubmitting = useFrozenValue(isSubmitting);
//
//   return (
//     <Container
//       sx={{
//         display: "flex",
//         alignItems: "center",
//       }}
//     >
//       {icon}
//       <Typography variant="smallTextLabels" sx={{ ml: 1 }}>
//         <Box component="span" sx={{ fontWeight: "bold", mr: 1 }}>
//           {title}
//         </Box>{" "}
//         {label}
//       </Typography>
//       <Stack spacing={1.25} sx={{ marginLeft: "auto" }} direction="row">
//         <Button
//           variant="tertiary"
//           size="xs"
//           sx={(theme) => ({
//             borderColor: theme.palette.blue[50],
//             backgroundColor: "transparent",
//             color: "white",
//             "&:hover": {
//               backgroundColor: theme.palette.blue[80],
//               color: "white",
//             },
//           })}
//           disabled={frozenSubmitting}
//           {...discardButtonProps}
//         >
//           {discardButtonProps.children}
//         </Button>
//         <Button
//           variant="secondary"
//           size="xs"
//           type="submit"
//           loading={frozenSubmitting}
//           loadingWithoutText
//           disabled={frozenSubmitting}
//           {...confirmButtonProps}
//         >
//           {confirmButtonProps.children}
//         </Button>
//       </Stack>
//     </Container>
//   );
// };
//
// //
// // /**
// //  * The Collapse transition is used by the
// //  * [Vertical Stepper](/material-ui/react-stepper/#vertical-stepper) StepContent component.
// //  * It uses [react-transition-group](https://github.com/reactjs/react-transition-group) internally.
// //  */
// // const Collapse = forwardRef<
// //   HTMLDivElement,
// //   { in: boolean; children: ReactNode }
// // >((inProps, ref) => {
// //   const props = useThemeProps({ props: inProps, name: "MuiCollapse" });
// //   const timeout = 300;
// //   const { children, in: inProp } = props;
// //
// //   const collapsedSize = "0px";
// //   const theme = useTheme();
// //   const wrapperRef = useRef<HTMLDivElement>(null);
// //   const nodeRef = useRef<HTMLDivElement>(null);
// //   const handleRef = useForkRef(ref, nodeRef);
// //
// //   const normalizedTransitionCallback =
// //     (callback: (node: HTMLElement | null, isAppearing?: boolean) => void) =>
// //     (maybeIsAppearing?: boolean) => {
// //       if (callback) {
// //         const node = nodeRef.current;
// //
// //         // onEnterXxx and onExitXxx callbacks have a different arguments.length value.
// //         if (maybeIsAppearing === undefined) {
// //           callback(node);
// //         } else {
// //           callback(node, maybeIsAppearing);
// //         }
// //       }
// //     };
// //
// //   const getWrapperSize = () =>
// //     wrapperRef.current ? wrapperRef.current.clientHeight : 0;
// //
// //   const handleEnter = normalizedTransitionCallback((node) => {
// //     if (node) {
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.height = collapsedSize;
// //     }
// //   });
// //
// //   const easing = "cubic-bezier(0.4, 0, 0.2, 1)";
// //
// //   const handleEntering = normalizedTransitionCallback((node) => {
// //     if (node) {
// //       const wrapperSize = getWrapperSize();
// //
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.transitionDuration = `${timeout}ms`;
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.height = `${wrapperSize}px`;
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.transitionTimingFunction = easing;
// //     }
// //   });
// //
// //   const handleEntered = normalizedTransitionCallback((node) => {
// //     if (node) {
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.height = "auto";
// //     }
// //   });
// //
// //   const handleExit = normalizedTransitionCallback((node) => {
// //     if (node) {
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.height = `${getWrapperSize()}px`;
// //     }
// //   });
// //
// //   const handleExiting = normalizedTransitionCallback((node) => {
// //     if (node) {
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.transitionDuration = `${timeout}ms`;
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.height = collapsedSize;
// //       // eslint-disable-next-line no-param-reassign
// //       node.style.transitionTimingFunction = easing;
// //     }
// //   });
// //
// //   return (
// //     <Transition
// //       in={inProp}
// //       onEnter={handleEnter}
// //       onEntered={handleEntered}
// //       onEntering={handleEntering}
// //       onExit={handleExit}
// //       onExiting={handleExiting}
// //       nodeRef={nodeRef}
// //       timeout={timeout}
// //     >
// //       {(state) => (
// //         <Box
// //           sx={{
// //             minHeight: collapsedSize,
// //             height: 0,
// //             overflow: "hidden",
// //             transition: theme.transitions.create("height"),
// //             ...(state === "entered" && {
// //               height: "auto",
// //               overflow: "visible",
// //             }),
// //             ...(state === "exited" &&
// //               !inProp && {
// //                 visibility: "hidden",
// //               }),
// //           }}
// //           ref={handleRef}
// //         >
// //           <Box
// //             sx={{
// //               // Hack to get children with a negative margin to not falsify the height computation.
// //               display: "flex",
// //               width: "100%",
// //             }}
// //             ref={wrapperRef}
// //           >
// //             <Box sx={{ width: "100%" }}>{children}</Box>
// //           </Box>
// //         </Box>
// //       )}
// //     </Transition>
// //   );
// // });
//
// class UnitBezier {
//   cx: number;
//   bx: number;
//   ax: number;
//   cy: number;
//   by: number;
//   ay: number;
//   static epsilon = 1e-6;
//   /**
//    * Solver for cubic Bézier curve with implicit control points at (0,0) and (1.0, 1.0)
//    */
//   constructor(p1x: number, p1y: number, p2x: number, p2y: number) {
//     // pre-calculate the polynomial coefficients
//     // First and last control points are implied to be (0,0) and (1.0, 1.0)
//     this.cx = 3.0 * p1x;
//     this.bx = 3.0 * (p2x - p1x) - this.cx;
//     this.ax = 1.0 - this.cx - this.bx;
//
//     this.cy = 3.0 * p1y;
//     this.by = 3.0 * (p2y - p1y) - this.cy;
//     this.ay = 1.0 - this.cy - this.by;
//   }
//
//   sampleCurveX(time: number) {
//     return ((this.ax * time + this.bx) * time + this.cx) * time;
//   }
//
//   sampleCurveY(time: number) {
//     return ((this.ay * time + this.by) * time + this.cy) * time;
//   }
//
//   sampleCurveDerivativeX(time: number) {
//     return (3.0 * this.ax * time + 2.0 * this.bx) * time + this.cx;
//   }
//
//   solveCurveX(x: number, epsilon: number) {
//     let t0;
//     let t1;
//     let t2;
//     let x2;
//     let d2;
//     let i;
//
//     // First try a few iterations of Newton's method -- normally very fast.
//     for (t2 = x, i = 0; i < 8; i++) {
//       x2 = this.sampleCurveX(t2) - x;
//       if (Math.abs(x2) < epsilon) {
//         return t2;
//       }
//       d2 = this.sampleCurveDerivativeX(t2);
//       if (Math.abs(d2) < epsilon) {
//         break;
//       }
//       t2 -= x2 / d2;
//     }
//
//     // No solution found - use bi-section
//     t0 = 0.0;
//     t1 = 1.0;
//     t2 = x;
//
//     if (t2 < t0) {
//       return t0;
//     }
//     if (t2 > t1) {
//       return t1;
//     }
//
//     while (t0 < t1) {
//       x2 = this.sampleCurveX(t2);
//       if (Math.abs(x2 - x) < epsilon) {
//         return t2;
//       }
//       if (x > x2) {
//         t0 = t2;
//       } else {
//         t1 = t2;
//       }
//
//       t2 = (t1 - t0) * 0.5 + t0;
//     }
//
//     // Give up
//     return t2;
//   }
//
//   solve(x: number, epsilon: number) {
//     return this.sampleCurveY(this.solveCurveX(x, epsilon));
//   }
// }
//
// const curve = new UnitBezier(0.4, 0, 0.2, 1);
//
// export const EditBar = ({
//                           currentVersion,
//                           discardButtonProps,
//                         }: {
//   currentVersion: number;
//   discardButtonProps: Partial<ButtonProps>;
// }) => {
//   const { isDirty } = useFormState<EntityTypeEditorForm>();
//   const frozenVersion = useFrozenValue(currentVersion);
//
//   // const observerRef = useRef<ResizeObserver>(null);
//   //
//   // const ref = useRef<HTMLDivElement>(null);
//
//   // useEffect(() => {
//   //   const node = ref.current;
//   //   if (!node) {
//   //     return;
//   //   }
//   //
//   //   let beginningHeight = 0;
//   //   let scrollTop = 0;
//   //
//   //   // observerRef.current?.disconnect();
//   //
//   //   let frame: number | null = null;
//   //
//   //   const handler = () => {
//   //     const height = node.getBoundingClientRect().height;
//   //
//   //     const diff = height - beginningHeight;
//   //
//   //     console.log(diff, scrollTop);
//   //
//   //     document.documentElement.scrollTop += 66;
//   //
//   //     frame = requestAnimationFrame(handler);
//   //   };
//   //
//   //   const start = () => {
//   //     if (frame) {
//   //       cancelAnimationFrame(frame);
//   //     }
//   //
//   //     beginningHeight = node.getBoundingClientRect().height;
//   //     scrollTop = document.documentElement.scrollTop;
//   //
//   // {/*    handler();*/}
//   // {/*  };*/}
//   // {/*  node.addEventListener("transitionstart", start);*/}
//   //   const end = () => {
//   //     if (frame) {
//   //       cancelAnimationFrame(frame);
//   //     }
//   //     handler();
//   //     if (frame) {
//   //       cancelAnimationFrame(frame);
//   //     }
//   //   };
//   //   node.addEventListener("transitionend", end);
//   //   node.addEventListener("transitioncancel", end);
//   //
//   //   return () => {
//   //     if (frame) {
//   //       cancelAnimationFrame(frame);
//   //     }
//   //     node.removeEventListener("transitionstart", start);
//   //     node.removeEventListener("transitionend", end);
//   //     node.removeEventListener("transitioncancel", end);
//   //   };
//   //
//   //   // const observer = new ResizeObserver(([size]) => {
//   //
//   //   // });
//   //   //
//   //   // observer.observe(ref);
//   //   // observerRef.current = observer;
//   // }, []);
//
//   const collapseIn = currentVersion === 0 || isDirty;
//
//   const ref = useRef<HTMLDivElement>(null);
//
//   useLayoutEffect(() => {
//     const node = ref.current;
//     if (node) {
//       if (collapseIn) {
//         document.body.style.setProperty(
//           "height",
//           `${document.body.getBoundingClientRect().height + 66}px`,
//         );
//
//         let frame: number | null = null;
//
//         const cancel = () => {
//           if (frame) {
//             cancelAnimationFrame(frame);
//           }
//         };
//
//         const end = () => {
//           cancel();
//           // document.documentElement.scrollTo({ top: 66, behavior: "auto" });
//           // document.body.style.setProperty("top", `0px`);
//         };
//
//         let startTime: number | null;
//         const startPos = document.documentElement.scrollTop;
//
//         const tick = () => {
//           if (!startTime) {
//             startTime = Date.now();
//           }
//           const diff = Date.now() - startTime;
//           const percentage = Math.min(1, diff / 300);
//           const t1 = curve.solve(percentage, UnitBezier.epsilon);
//           const distance = Math.round(66 * t1);
//           const scrollPos = startPos + distance;
//           document.documentElement.style.setProperty("scroll-behavior", "auto");
//           document.documentElement.scrollTo(0, scrollPos);
//           node.style.setProperty("height", `${distance}px`);
//           // document.body.style.setProperty("top", `-${distance}px`);
//           if (percentage < 1) {
//             frame = requestAnimationFrame(tick);
//           } else {
//             end();
//           }
//         };
//
//         tick();
//
//         return cancel;
//       } else {
//         let frame: number | null = null;
//
//         const cancel = () => {
//           if (frame) {
//             cancelAnimationFrame(frame);
//           }
//         };
//
//         const end = () => {
//           cancel();
//           // document.documentElement.scrollTo({ top: 66, behavior: "auto" });
//           // document.body.style.setProperty("top", `0px`);
//         };
//
//         let startTime: number | null;
//         const startPos = document.documentElement.scrollTop;
//
//         const tick = () => {
//           if (!startTime) {
//             startTime = Date.now();
//           }
//           const diff = Date.now() - startTime;
//           const percentage = Math.min(1, diff / 300);
//           const t1 = 1 - curve.solve(percentage, UnitBezier.epsilon);
//           const distance = Math.round(66 * t1);
//
//           // const scrollPos = startPos + distance;
//           document.documentElement.style.setProperty("scroll-behavior", "auto");
//           document.documentElement.scrollTo(0, startPos - (66 - distance));
//           node.style.setProperty("height", `${distance}px`);
//           // document.body.style.setProperty("top", `-${distance}px`);
//           if (percentage < 1) {
//             frame = requestAnimationFrame(tick);
//           } else {
//             end();
//           }
//         };
//
//         tick();
//
//         return cancel;
//
//         ref.current?.style.setProperty("height", `0px`);
//       }
//     }
//   }, [collapseIn]);
//
//   return (
//     <>
//       <GlobalStyles
//         styles={{
//           body: {
//             position: "relative",
//             // minHeight: "calc(100vh +  66px) !important",
//           },
//         }}
//       />
//       <Box sx={{ height: 0, overflow: "hidden" }} ref={ref}>
//         <Box
//           sx={(theme) => ({
//             height: 66,
//             backgroundColor: theme.palette.blue[70],
//             color: theme.palette.white,
//             display: "flex",
//             alignItems: "center",
//           })}
//         >
//           {frozenVersion === 0 ? (
//             <EditBarContents
//               icon={<FontAwesomeIcon icon={faSmile} sx={{ fontSize: 14 }} />}
//               title="Currently editing"
//               label="- this type has not yet been created"
//               discardButtonProps={{
//                 children: "Discard this type",
//                 ...discardButtonProps,
//               }}
//               confirmButtonProps={{
//                 children: "Create",
//               }}
//             />
//           ) : (
//             <EditBarContents
//               icon={<PencilSimpleLine />}
//               title="Currently editing"
//               label={`Version ${frozenVersion} -> ${frozenVersion + 1}`}
//               discardButtonProps={{
//                 children: "Discard changes",
//                 ...discardButtonProps,
//               }}
//               confirmButtonProps={{
//                 children: "Publish update",
//               }}
//             />
//           )}
//         </Box>
//       </Box>
//     </>
//   );
// };
//
//
// // attempt 8
//
import { faSmile } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@hashintel/hash-design-system";
import { Box, Collapse, Container, Stack, Typography, } from "@mui/material";
import { GlobalStyles } from "@mui/system";
import { ReactNode, useEffect, useRef, useState, } from "react";
import { useFormState } from "react-hook-form";
import { PencilSimpleLine } from "../../../../shared/icons/svg";
import { Button, ButtonProps } from "../../../../shared/ui/button";
import { EntityTypeEditorForm } from "./form-types";

const useFrozenValue = <T extends any>(value: T): T => {
  const { isDirty } = useFormState<EntityTypeEditorForm>();

  const [frozen, setFrozen] = useState(value);

  if (isDirty && frozen !== value) {
    setFrozen(value);
  }

  return frozen;
};

// @todo disabled button styles
const EditBarContents = ({
                           icon,
                           title,
                           label,
                           discardButtonProps,
                           confirmButtonProps,
                         }: {
  icon: ReactNode;
  title: ReactNode;
  label: ReactNode;
  discardButtonProps: ButtonProps;
  confirmButtonProps: ButtonProps;
}) => {
  const { isSubmitting } = useFormState<EntityTypeEditorForm>();

  const frozenSubmitting = useFrozenValue(isSubmitting);

  return (
    <Container
      sx={{
        display: "flex",
        alignItems: "center",
      }}
    >
      {icon}
      <Typography variant="smallTextLabels" sx={{ ml: 1 }}>
        <Box component="span" sx={{ fontWeight: "bold", mr: 1 }}>
          {title}
        </Box>{" "}
        {label}
      </Typography>
      <Stack spacing={1.25} sx={{ marginLeft: "auto" }} direction="row">
        <Button
          variant="tertiary"
          size="xs"
          sx={(theme) => ({
            borderColor: theme.palette.blue[50],
            backgroundColor: "transparent",
            color: "white",
            "&:hover": {
              backgroundColor: theme.palette.blue[80],
              color: "white",
            },
          })}
          disabled={frozenSubmitting}
          {...discardButtonProps}
        >
          {discardButtonProps.children}
        </Button>
        <Button
          variant="secondary"
          size="xs"
          type="submit"
          loading={frozenSubmitting}
          loadingWithoutText
          disabled={frozenSubmitting}
          {...confirmButtonProps}
        >
          {confirmButtonProps.children}
        </Button>
      </Stack>
    </Container>
  );
};

export const EditBar = ({
                          currentVersion,
                          discardButtonProps,
                        }: {
  currentVersion: number;
  discardButtonProps: Partial<ButtonProps>;
}) => {
  const { isDirty } = useFormState<EntityTypeEditorForm>();
  const frozenVersion = useFrozenValue(currentVersion);

  const observerRef = useRef<ResizeObserver>(null);

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    let beginningHeight = 0;
    let scrollTop = 0;

    observerRef.current?.disconnect();

    const observer = new ResizeObserver(([size]) => {
      const diff = size!.contentRect.height - beginningHeight;
      document.documentElement.setProperty("scroll-behavior", "auto");
      document.documentElement.scrollTop = diff;
    });

    observer.observe(node);
    observerRef.current = observer;

    return () => {
      observer.disconnect();
    }
  }, []);

  const collapseIn = currentVersion === 0 || isDirty;

  return (
    <>
      <GlobalStyles
        styles={{
          body: {
            position: "relative",
            minHeight: "calc(100vh +  66px) !important",
          },
        }}
      />
      <Collapse in={collapseIn} ref={ref}>
        <Box
          sx={(theme) => ({
            height: 66,
            backgroundColor: theme.palette.blue[70],
            color: theme.palette.white,
            display: "flex",
            alignItems: "center",
          })}
        >
          {frozenVersion === 0 ? (
            <EditBarContents
              icon={<FontAwesomeIcon icon={faSmile} sx={{ fontSize: 14 }} />}
              title="Currently editing"
              label="- this type has not yet been created"
              discardButtonProps={{
                children: "Discard this type",
                ...discardButtonProps,
              }}
              confirmButtonProps={{
                children: "Create",
              }}
            />
          ) : (
            <EditBarContents
              icon={<PencilSimpleLine />}
              title="Currently editing"
              label={`Version ${frozenVersion} -> ${frozenVersion + 1}`}
              discardButtonProps={{
                children: "Discard changes",
                ...discardButtonProps,
              }}
              confirmButtonProps={{
                children: "Publish update",
              }}
            />
          )}
        </Box>
      </Box>
    </>
  );
};