/**
 * This is the entry point for developing and debugging.
 * This file is not bundled with the block during the build process.
 */
import React from "react";
import ReactDOM from "react-dom";

import { MockBlockDock } from "mock-block-dock";

import Component from "./index";

const node = document.getElementById("app");

const doc = {
  id: "doc",
  name: "New Document",
  version: 15.3,
  pages: {
    page: {
      id: "page",
      name: "Page 1",
      childIndex: 1,
      shapes: {
        "33ca2d8b-2794-495b-39ab-48d162c48294": {
          id: "33ca2d8b-2794-495b-39ab-48d162c48294",
          type: "draw",
          name: "Draw",
          parentId: "page",
          childIndex: 1,
          point: [384.18, 169.25],
          rotation: 0,
          style: {
            color: "black",
            size: "small",
            isFilled: false,
            dash: "draw",
            scale: 1,
          },
          points: [
            [9.87, 115.05, 0.5],
            [9.87, 115.05, 0.5],
            [9.59, 115.33, 0.5],
            [9.59, 114.12, 0.5],
            [9.59, 111.3, 0.5],
            [13.26, 92.99, 0.5],
            [19.24, 73.86, 0.5],
            [30.41, 47.4, 0.5],
            [36.45, 33.35, 0.5],
            [43.78, 18.16, 0.5],
            [47.6, 11.29, 0.5],
            [50.74, 5.64, 0.5],
            [52.21, 2.37, 0.5],
            [52.53, 0.77, 0.5],
            [52.72, 0.17, 0.5],
            [52.72, 0, 0.5],
            [52.93, 0, 0.5],
            [53.18, 0, 0.5],
            [53.5, 0, 0.5],
            [54.14, 2.06, 0.5],
            [56.28, 7.5, 0.5],
            [64.19, 20.52, 0.5],
            [78.28, 39.11, 0.5],
            [91.36, 55.47, 0.5],
            [99.43, 66.57, 0.5],
            [105.84, 74.49, 0.5],
            [109.33, 78.97, 0.5],
            [111.27, 82.63, 0.5],
            [113.12, 87.04, 0.5],
            [114.76, 91.72, 0.5],
            [116.17, 95.13, 0.5],
            [116.91, 97.56, 0.5],
            [117.36, 98.72, 0.5],
            [117.36, 99.45, 0.5],
            [117.59, 100.89, 0.5],
            [117.96, 102.63, 0.5],
            [118.05, 104.07, 0.5],
            [118.34, 105.01, 0.5],
            [118.34, 105.65, 0.5],
            [118.34, 105.95, 0.5],
            [117.13, 106.16, 0.5],
            [111.92, 106.84, 0.5],
            [100.56, 108.11, 0.5],
            [88.86, 110.25, 0.5],
            [75.42, 112.06, 0.5],
            [63.17, 113.25, 0.5],
            [50.66, 113.84, 0.5],
            [39.06, 114.12, 0.5],
            [30.07, 114.12, 0.5],
            [22.26, 114.12, 0.5],
            [17.49, 114.12, 0.5],
            [14.89, 114.12, 0.5],
            [13.87, 114.36, 0.5],
            [13.53, 114.41, 0.5],
            [13.28, 114.66, 0.5],
            [13.26, 114.94, 0.5],
            [13.24, 115.23, 0.5],
            [12.93, 115.78, 0.5],
            [12.27, 116.07, 0.5],
            [10.33, 116.51, 0.5],
            [7.21, 116.79, 0.5],
            [4.24, 116.79, 0.5],
            [2.08, 116.79, 0.5],
            [0.72, 116.79, 0.5],
            [0.13, 116.79, 0.5],
            [0, 116.79, 0.5],
          ],
          isComplete: true,
        },
      },
      bindings: {},
    },
  },
  pageStates: {
    page: {
      id: "page",
      selectedIds: [],
      camera: {
        point: [0, 0],
        zoom: 1,
      },
      editingId: null,
    },
  },
  assets: {},
};

const App = () => (
  <MockBlockDock>
    <Component
      entityId="test-block-1"
      name="World"
      document={JSON.stringify(doc)}
    />
  </MockBlockDock>
);

ReactDOM.render(<App />, node);
