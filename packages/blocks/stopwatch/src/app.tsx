import React, { useEffect, useState, useCallback } from "react";
import { BlockComponent } from "blockprotocol/react";

type AppProps = {
  start: Date;
  laps: number[];
};

const formatDuration = (duration: number) => {
  const MILLISECONDS = 1;
  const SECONDS = 1000 * MILLISECONDS;
  const MINUTES = 60 * SECONDS;
  const HOURS = 60 * MINUTES;
  const DAYS = 24 * HOURS;

  const millis = Math.floor((duration % SECONDS) / 10)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor((duration % MINUTES) / SECONDS)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((duration % HOURS) / MINUTES)
    .toString()
    .padStart(2, "0");
  const hours = Math.floor((duration % DAYS) / HOURS);
  const days = Math.floor(duration / DAYS);

  if (duration >= DAYS) {
    return `${days}:${hours}:${minutes}:${seconds}.${millis}`;
  } else if (duration >= HOURS) {
    return `${hours}:${minutes}:${seconds}.${millis}`;
  } else {
    return `${minutes}:${seconds}.${millis}`;
  }
};

const getLastLap = (laps: number[]): number => {
  const last = laps.slice(-1)[0];
  return last === undefined ? 0 : last;
};

export const App: BlockComponent<AppProps> = ({
  entityId,
  accountId,
  updateEntities,
  start = null,
  laps = [0],
}) => {
  const [localStart, setLocalStart] = useState(
    start !== null ? new Date(start) : null,
  );
  const [localLaps, setLocalLaps] = useState(laps.length < 1 ? [0] : laps);
  const [currentLap, setCurrentLap] = useState(
    localStart !== null ? +new Date() - +localStart : 0,
  );
  const [allLaps, setAllLaps] = useState(laps.reduce((a, b) => a + b, 0));

  useEffect(() => {
    setLocalLaps(laps.length < 1 ? [0] : laps);
    setLocalStart(start !== null ? new Date(start) : null);
    setAllLaps(laps.reduce((a, b) => a + b, 0));
  }, [laps, start]);

  const update = useCallback(
    (laps_data, start_data) => {
      setLocalLaps(laps_data);
      setLocalStart(start_data);
      if (updateEntities) {
        void updateEntities([
          {
            entityId,
            accountId,
            data: {
              laps: laps_data,
              start: start_data,
            },
          },
        ]);
      }
    },
    [entityId, accountId, updateEntities],
  );

  useEffect(() => {
    let interval: any = null;
    if (localStart !== null) {
      interval = setInterval(() => {
        setCurrentLap(+new Date() - +localStart);
      }, 1000 / 60);
    } else {
      clearInterval(interval);
      setCurrentLap(0);
    }
    return () => clearInterval(interval);
  }, [localStart]);

  const start_stop = () => {
    if (localStart !== null) {
      const current = +new Date() - +localStart;
      setAllLaps((allLaps_new) => allLaps_new + current);
      update(
        [
          ...localLaps.slice(0, localLaps.length - 1),
          getLastLap(localLaps) + current,
        ],
        null,
      );
    } else {
      update(localLaps, new Date());
    }
  };

  const lap_reset = () => {
    if (localStart !== null) {
      const current = +new Date() - +localStart;
      setAllLaps((allLaps_new) => allLaps_new + current);
      setCurrentLap(0);
      update(
        [
          ...localLaps.slice(0, localLaps.length - 1),
          getLastLap(localLaps) + current,
          0,
        ],
        new Date(),
      );
    } else {
      setAllLaps(0);
      update([0], null);
    }
  };

  return (
    <>
      <button type="button" onClick={start_stop}>
        {localStart !== null ? "stop" : allLaps === 0 ? "start" : "continue"}
      </button>
      <button type="button" onClick={lap_reset}>
        {localStart !== null ? "lap" : "reset"}
      </button>
      <p>{formatDuration(allLaps + currentLap)}</p>
      {localLaps.length > 1 && (
        <ol>
          {localLaps.slice(0, localLaps.length - 1).map((lap, i) => (
            <li key={`lap-${i + 1}`}>{formatDuration(lap)}</li>
          ))}
          <li key={`lap-${localLaps.length}`}>
            {formatDuration(getLastLap(localLaps) + currentLap)}
          </li>
        </ol>
      )}
    </>
  );
};
