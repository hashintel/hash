import React, { useEffect, useState, useCallback } from "react";
import { BlockComponent } from "blockprotocol/react";

type AppProps = {
  start: Date;
  laps: number[];
  isActive: boolean;
};

const Button = ({ label, onClick }) => {
  return (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  );
};

function formatDuration(duration: number) {
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
  } else if (duration >= HOURS)
    return `${hours}:${minutes}:${seconds}.${millis}`;
  else return `${minutes}:${seconds}.${millis}`;
}

export const App: BlockComponent<AppProps> = ({
  entityId,
  accountId,
  updateEntities,
  isActive = false,
  start = null,
  laps = [0],
}) => {
  const [isActive_, setIsActive] = useState(isActive);
  const [start_, setStart] = useState(isActive_ ? new Date(start) : null);
  const [laps_, setLaps] = useState(laps);
  const [currentLap, setCurrentLap] = useState(
    isActive_ ? +new Date() - +start_ : 0,
  );
  const [allLaps, setAllLaps] = useState(laps.reduce((a, b) => a + b, 0));

  useEffect(() => {
    setLaps(laps);
    setStart(new Date(start));
    setIsActive(isActive);
    setAllLaps(laps.reduce((a, b) => a + b, 0));
    console.log(
      `loaded: laps: ${JSON.stringify(
        laps,
      )}, start: ${start}, active: ${isActive}`,
    );
  }, [laps, start, isActive]);

  const update = useCallback(
    (laps_data, start_data, isActive_data) => {
      setLaps(laps_data);
      setStart(start_data);
      setIsActive(isActive_data);
      void updateEntities([
        {
          entityId,
          accountId,
          data: {
            laps: laps_data,
            start: start_data,
            isActive: isActive_data,
          },
        },
      ]);
      console.log(
        `written: laps: ${laps_data}, start: ${start_data}, active: ${isActive_data}`,
      );
    },
    [entityId, accountId, updateEntities],
  );

  useEffect(() => {
    let interval = null;
    if (isActive_) {
      interval = setInterval(() => {
        setCurrentLap(+new Date() - +start_);
      }, 1000 / 60);
    } else {
      clearInterval(interval);
      setCurrentLap(0);
    }
    return () => clearInterval(interval);
  }, [isActive_, start_]);

  const start_stop = () => {
    if (!isActive_) {
      update(laps_, new Date(), true);
    } else {
      const current = +new Date() - +start_;
      setAllLaps((allLaps_new) => allLaps_new + current);
      update(
        [
          ...laps_.slice(0, laps_.length - 1),
          laps_[laps_.length - 1] + current,
        ],
        null,
        false,
      );
    }
  };

  const lap_reset = () => {
    if (isActive_) {
      const current = +new Date() - +start_;
      setAllLaps((allLaps_new) => allLaps_new + current);
      setCurrentLap(0);
      update(
        [
          ...laps_.slice(0, laps_.length - 1),
          laps_[laps_.length - 1] + current,
          0,
        ],
        new Date(),
        true,
      );
    } else {
      setAllLaps(0);
      update([0], null, false);
    }
  };

  return (
    <>
      <Button
        label={isActive_ ? "stop" : allLaps === 0 ? "start" : "continue"}
        onClick={start_stop}
      />
      <Button label={isActive_ ? "lap" : "reset"} onClick={lap_reset} />
      <p>{formatDuration(allLaps + currentLap)}</p>
      {laps_.length > 1 && (
        <ol>
          {laps_.slice(0, laps_.length - 1).map((lap, i) => (
            <li key={`lap-${i + 1}`}>{formatDuration(lap)}</li>
          ))}
          <li key={`lap-${laps_.length}`}>
            {formatDuration(laps_[laps_.length - 1] + currentLap)}
          </li>
        </ol>
      )}
    </>
  );
};
