import React, { useEffect, useState } from "react";
import { BlockComponent } from "blockprotocol/react";

type AppProps = {
  start: Date;
  laps: number[];
};

const Button = ({ label, onClick }) => {
  return <button onClick={onClick}>{label}</button>;
};

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
      <Button label={isActive ? "lap" : "reset"} onClick={lap_reset} />
      <Button
        label={isActive ? "stop" : allLaps === 0 ? "start" : "continue"}
        onClick={start_stop}
      />
      <p>All: {allLaps + currentLap}</p>
      Laps:
      <ol>
        {laps_.slice(0, laps_.length - 1).map((lap, i) => (
          <li key={`lap-${i + 1}`}>{lap}</li>
        ))}
        <li key={`lap-${laps_.length}`}>
          {laps_[laps_.length - 1] + currentLap}
        </li>
      </ol>
    </>
  );
};
