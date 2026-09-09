/**
 * Whether the frame's transitions run: the frame reads the animations setting
 * and the OS's reduced-motion preference once and hands the answer down to
 * the header and the bands. Outside a frame the transitions run.
 */
import { createContext } from "react";

export const FrameAnimateContext = createContext(true);
