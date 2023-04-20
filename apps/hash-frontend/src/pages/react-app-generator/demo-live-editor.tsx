import React from "react";
import { LiveProvider, LiveEditor, LiveError, LivePreview } from "react-live";

type Props = {
  noInline?: boolean;
  scope?: any;
  code: string;
};

export const DemoLiveEditor = ({ noInline = false, code, scope }: Props) => {
  return (
    <LiveProvider code={code} noInline={noInline} scope={scope}>
      <div className="grid lg:grid-cols-2 gap-4">
        <LiveEditor className="font-mono" />
        <LivePreview />
      </div>
      <LiveError className="text-red-800 bg-red-100 mt-2" />
    </LiveProvider>
  );
};
