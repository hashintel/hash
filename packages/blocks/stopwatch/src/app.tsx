import React, { useEffect, useState } from "react";
import { BlockComponent } from "blockprotocol/react";

type AppProps = {
  start: Date;
  laps: number[];
};

const Button = ({ label, onClick }) => {
  return <button onClick={onClick}>{label}</button>;
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

  if (duration >= DAYS)
    return `${days}:${hours}:${minutes}:${seconds}.${millis}`;
  else if (duration >= HOURS) return `${hours}:${minutes}:${seconds}.${millis}`;
  else return `${minutes}:${seconds}.${millis}`;
}

export const App: BlockComponent<AppProps> = ({
  entityId,
  accountId,
  updateEntities,
  start = null,
  laps = [0],
}) => {
  const [isActive, setIsActive] = useState(start !== null);
  const [start_, setStart] = useState(isActive ? new Date(start) : null);
  const [laps_, setLaps] = useState(laps);
  const [currentLap, setCurrentLap] = useState(
    isActive ? +new Date() - +start_ : 0,
  );
  const [allLaps, setAllLaps] = useState(laps.reduce((a, b) => a + b, 0));

  useEffect(() => {
    updateEntities([
      {
        entityId,
        accountId,
        data: {
          laps: laps_,
          start: start_,
        },
      },
    ]);
  }, [laps_, start_]);

  useEffect(() => {
    let interval = null;
    if (isActive) {
      interval = setInterval(() => {
        setCurrentLap(+new Date() - +start_);
      }, 1000 / 60);
    } else {
      clearInterval(interval);
      setCurrentLap(0);
    }
    return () => clearInterval(interval);
  }, [isActive, start_]);

  const start_stop = () => {
    if (!isActive) {
      setStart(new Date());
      setIsActive(true);
    } else {
      const current = +new Date() - +start_;
      setLaps((laps) => [
        ...laps.slice(0, laps.length - 1),
        laps[laps.length - 1] + current,
      ]);
      setAllLaps((allLaps) => allLaps + current);
      setStart(null);
      setIsActive(false);
    }
  };

  const lap_reset = () => {
    if (isActive) {
      const current = +new Date() - +start_;
      setStart(new Date());
      setLaps((laps) => [
        ...laps.slice(0, laps.length - 1),
        laps[laps.length - 1] + current,
        0,
      ]);
      setAllLaps((allLaps) => allLaps + current);
      setCurrentLap(0);
    } else {
      setLaps([0]);
      setAllLaps(0);
    }
  };

  return (
    <>
      <Button
        label={isActive ? "stop" : allLaps === 0 ? "start" : "continue"}
        onClick={start_stop}
      />
      <Button label={isActive ? "lap" : "reset"} onClick={lap_reset} />
      <p>{formatDuration(allLaps + currentLap)}</p>
      {laps_.length > 1 && (
        <>
          <ol>
            {laps_.slice(0, laps_.length - 1).map((lap, i) => (
              <li key={`lap-${i + 1}`}>{formatDuration(lap)}</li>
            ))}
            <li key={`lap-${laps_.length}`}>
              {formatDuration(laps_[laps_.length - 1] + currentLap)}
            </li>
          </ol>
        </>
      )}
    </>
  );
};
