import type { ComponentType } from "react";

export type IntegrationIconArtwork = {
  markLight: ComponentType<{ id: string }>;
  markDark: ComponentType<{ id: string }>;
  markMono?: ComponentType<{ id: string }>;
  logoLight?: ComponentType<{ id: string }>;
  logoDark?: ComponentType<{ id: string }>;
  wordmarkLight?: ComponentType<{ id: string }>;
  wordmarkDark?: ComponentType<{ id: string }>;
  markViewBox: string;
  monoAlphaMatrix: string;
  monoInkScale: number;
  appViewBox?: string;
  logoViewBox: string | null;
  wordmarkViewBox: string | null;
  wordmarkDarkViewBox: string | null;
  ratio: number;
  alignment: string;
};
