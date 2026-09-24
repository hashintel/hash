import type { FrameSceneResult } from "../../SDCPN/canvas-renderer";

/** The one editor-level sequence shared by every built-in layout entrypoint. */
export const applyAutoLayoutAndFrame = async ({
  applyAutoLayout,
  frameSceneAfterRender,
}: {
  applyAutoLayout: () => Promise<{ commitCount: number }>;
  frameSceneAfterRender: () => Promise<FrameSceneResult>;
}): Promise<{ commitCount: number; frameStatus: FrameSceneResult }> => {
  const { commitCount } = await applyAutoLayout();
  const frameStatus = await frameSceneAfterRender();
  return { commitCount, frameStatus };
};
