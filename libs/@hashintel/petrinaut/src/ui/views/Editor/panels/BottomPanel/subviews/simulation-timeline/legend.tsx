import { legendColorStyle, legendContainerStyle, legendItemStyle } from "./styles";

import type { TimelineSeriesMeta } from "./types";
import type { FC } from "react";

export const TimelineLegend: FC<{
  series: TimelineSeriesMeta[];
  hiddenSeries: Set<string>;
  onToggleVisibility: (seriesId: string) => void;
}> = ({ series, hiddenSeries, onToggleVisibility }) => (
  <div className={legendContainerStyle}>
    {series.map((item) => {
      const isHidden = hiddenSeries.has(item.seriesId);

      return (
        <div
          key={item.seriesId}
          role="button"
          tabIndex={0}
          className={legendItemStyle}
          onClick={() => onToggleVisibility(item.seriesId)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onToggleVisibility(item.seriesId);
            }
          }}
          style={{
            opacity: isHidden ? 0.4 : 1,
            textDecoration: isHidden ? "line-through" : "none",
          }}
        >
          <div
            className={legendColorStyle}
            style={{
              backgroundColor: item.color,
              opacity: isHidden ? 0.5 : 1,
            }}
          />
          <span>{item.seriesName}</span>
        </div>
      );
    })}
  </div>
);
