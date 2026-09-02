import { useEffect, useState } from "react";

import {
  ContourSurface,
  contourSurfaceKey,
  type ContourSurfaceMarker,
  type ContourSurfaceValues,
} from "./contour-surface";

import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Components / ContourSurface",
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const GRID = 11;

/** Corners and centre first, then the rest row-major: a coarse-to-fine feel for the streaming demos. */
const demoOrder = (size: number): { x: number; y: number }[] => {
  const cells = Array.from({ length: size * size }, (_, index) => ({
    x: index % size,
    y: Math.floor(index / size),
  }));
  const last = size - 1;
  const mid = Math.floor(size / 2);
  const isSeed = (cell: { x: number; y: number }) =>
    (cell.x === 0 || cell.x === last || cell.x === mid) &&
    (cell.y === 0 || cell.y === last || cell.y === mid);
  return [...cells.filter(isSeed), ...cells.filter((cell) => !isSeed(cell))];
};

/** The synthetic field every story samples: a bump with a diagonal drift. */
function fieldValue(x: number, y: number): number {
  const fx = x / (GRID - 1);
  const fy = y / (GRID - 1);
  return (
    100 * Math.exp(-((fx - 0.6) ** 2) * 9 - (fy - 0.45) ** 2 * 7) +
    18 * fx +
    9 * fy
  );
}

function fieldValues(keep?: (index: number) => boolean): ContourSurfaceValues {
  const values = new Map<string, number>();
  let index = 0;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (!keep || keep(index)) {
        values.set(contourSurfaceKey(x, y), fieldValue(x, y));
      }
      index++;
    }
  }
  return values;
}

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div style={{ width: 560 }}>{children}</div>
);

export const Empty: Story = {
  name: "Empty",
  render: () => (
    <Frame>
      <ContourSurface
        nx={GRID}
        ny={GRID}
        values={new Map()}
        aria-label="Empty surface"
      />
    </Frame>
  ),
};

export const FirstPoints: Story = {
  name: "First points",
  render: () => (
    <Frame>
      <ContourSurface
        nx={GRID}
        ny={GRID}
        values={fieldValues((index) => index % 29 === 0)}
        aria-label="Sparse surface"
      />
    </Frame>
  ),
};

export const Dense: Story = {
  name: "Dense",
  render: () => (
    <Frame>
      <ContourSurface
        nx={GRID}
        ny={GRID}
        values={fieldValues()}
        aria-label="Dense surface"
      />
    </Frame>
  ),
};

const denseMarkers: ContourSurfaceMarker[] = [
  { x: 2.4, y: 7.1 },
  { x: 5.5, y: 3.2 },
  { x: 6.6, y: 4.8, emphasis: true },
  { x: 8.9, y: 1.4 },
  { x: 4.1, y: 9.3 },
];

export const WithMarkers: Story = {
  name: "With markers",
  render: () => (
    <Frame>
      <ContourSurface
        nx={GRID}
        ny={GRID}
        values={fieldValues()}
        markers={denseMarkers}
        aria-label="Surface with trial markers"
      />
    </Frame>
  ),
};

/** Adds one sampled point per tick, in quad-tree order, the way a walk streams. */
const StreamingSurface = () => {
  const [values, setValues] = useState<ContourSurfaceValues>(new Map());

  useEffect(() => {
    const order = demoOrder(GRID);
    let index = 0;
    const timer = setInterval(() => {
      if (index >= order.length) {
        clearInterval(timer);
        return;
      }
      const cell = order[index]!;
      index++;
      setValues((previous) => {
        const next = new Map(previous);
        next.set(contourSurfaceKey(cell.x, cell.y), fieldValue(cell.x, cell.y));
        return next;
      });
    }, 120);
    return () => clearInterval(timer);
  }, []);

  return (
    <Frame>
      <ContourSurface
        nx={GRID}
        ny={GRID}
        values={values}
        aria-label="Streaming surface"
      />
      <p style={{ fontSize: 12, color: "#888", marginTop: 8 }}>
        {values.size} of {GRID * GRID} points sampled
      </p>
    </Frame>
  );
};

export const Streaming: Story = {
  name: "Streaming",
  render: () => <StreamingSurface />,
};

/** Reports clicks as fractions and drops an emphasized ring at the click. */
const ClickableSurface = () => {
  const [clicked, setClicked] = useState<[number, number] | null>(null);

  return (
    <Frame>
      <ContourSurface
        nx={GRID}
        ny={GRID}
        values={fieldValues()}
        markers={
          clicked
            ? [
                {
                  x: clicked[0] * (GRID - 1),
                  y: clicked[1] * (GRID - 1),
                  emphasis: true,
                },
              ]
            : []
        }
        onPickFraction={(fraction) => setClicked([fraction.x, fraction.y])}
        aria-label="Clickable surface"
      />
      <p style={{ fontSize: 12, color: "#888", marginTop: 8 }}>
        {clicked
          ? `Clicked at x=${clicked[0].toFixed(3)}, y=${clicked[1].toFixed(3)}`
          : "Click the plot to report fractions"}
      </p>
    </Frame>
  );
};

/**
 * A walk restart: the surface fills, the caller clears every value (a new
 * slice), and the plot keeps the previous picture dimmed — with the new
 * walk's first dots on top — instead of flashing blank, until enough new
 * samples arrive to interpolate.
 */
const RestartingDemo = () => {
  const [values, setValues] = useState<ContourSurfaceValues>(fieldValues());
  useEffect(() => {
    const order = demoOrder(GRID);
    let step = 0;
    const timer = setInterval(() => {
      step += 1;
      const phase = step % 40;
      if (phase === 0) {
        setValues(fieldValues());
      } else if (phase === 20) {
        // The restart: a new slice begins with nothing sampled.
        setValues(new Map());
      } else if (phase > 20) {
        // One cell on the first ticks — the ghost with the new walk's first
        // dots — then batches, mirroring a real refill.
        const refill = order.slice(
          0,
          Math.max(phase - 22, 0) * 4 + (phase - 20),
        );
        setValues(() => {
          const next = new Map<string, number>();
          for (const cell of refill) {
            next.set(
              contourSurfaceKey(cell.x, cell.y),
              fieldValue(cell.x, cell.y) * 0.7,
            );
          }
          return next;
        });
      }
    }, 150);
    return () => clearInterval(timer);
  }, []);
  return (
    <Frame>
      <ContourSurface nx={GRID} ny={GRID} values={values} />
    </Frame>
  );
};

export const Restarting: Story = {
  render: () => <RestartingDemo />,
};

export const ClickToNavigate: Story = {
  name: "Click to navigate",
  render: () => <ClickableSurface />,
};
