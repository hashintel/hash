import { BuilderView } from "./app-view/builder-view.tsx";
import { MergeView } from "./app-view/merge-view.tsx";
import { ProgressView } from "./app-view/progress-view.tsx";
import {
  AccessView,
  FatalView,
  HomeView,
  ResumeView,
} from "./app-view/public-views.tsx";
import { ResolveView } from "./app-view/resolve-view.tsx";
import { SwipeView } from "./app-view/swipe-view.tsx";

import type { AppController } from "./app-controller.ts";

export const AppView = ({ controller }: { controller: AppController }) => {
  const { state } = controller;
  if (state.fatalError) {
    return <FatalView controller={controller} />;
  }
  if (state.mode === "home") {
    return <HomeView controller={controller} />;
  }
  if (state.mode === "access") {
    return <AccessView controller={controller} />;
  }
  if (state.mode === "resume") {
    return <ResumeView controller={controller} />;
  }
  if (state.mode === "builder") {
    return <BuilderView controller={controller} />;
  }
  if (state.mode === "merge") {
    return <MergeView controller={controller} />;
  }
  if (state.mode === "resolve") {
    return <ResolveView controller={controller} />;
  }
  if (state.activeTab === "adjudicate") {
    return <SwipeView controller={controller} />;
  }
  if (state.activeTab === "progress") {
    return <ProgressView controller={controller} />;
  }
  if (state.activeTab === "merge") {
    return <MergeView controller={controller} />;
  }
  return <ResolveView controller={controller} />;
};
