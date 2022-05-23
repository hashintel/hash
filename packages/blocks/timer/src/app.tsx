import "./app.scss";

import React, { useEffect, useState, useCallback } from "react";
import { BlockComponent } from "blockprotocol/react";
// import { parseIsoD } from "date-fns";

type AppProps = {
  /** https://schema.org/Duration */
  initialDuration: string;
  /** https://schema.org/Duration */
  pauseDuration?: string;
  /** https://schema.org/DateTime */
  targetDateTime?: string;
};

export const App: BlockComponent<AppProps> = ({
  updateEntities,
  entityId,
  accountId,
  // targetDateTime = "",
  // initialDuration,
  // pauseDuration,
}) => {
  // console.log(parseISO());
  const updateEntity = useCallback(
    (data: AppProps) => {
      void updateEntities?.([{ entityId, accountId, data }]);
    },
    [accountId, entityId, updateEntities],
  );

  // const;

  const handleReset = () => {
    updateEntity({ initialDuration: "42" });
  };

  const [paused, setPaused] = useState(true);
  const [completed, setCompleted] = useState(0);

  useEffect(() => {
    setTimeout(() => {
      setCompleted((completed + 0.001) % 1);
    }, 10);
  });

  const handleStartClick = () => {
    setPaused(false);
  };
  const handlePauseClick = () => {
    setPaused(true);
  };

  return (
    <div className="timer-block">
      <div className="dial">
        <div className="dial-ring">
          <div
            className="dial-ring-completion"
            style={{ animationDelay: `-${completed * 100}s` }}
          />
        </div>
        <input
          className="countdown"
          value={Math.round(completed * 20) % 2 ? "42:42" : "42\u200842"}
          disabled
        />
        {paused ? (
          <button
            type="button"
            aria-label="start"
            className="play-button"
            onClick={handleStartClick}
          >
            <span className="play-button-icon" />
          </button>
        ) : (
          <button
            type="button"
            aria-label="pause"
            className="pause-button"
            onClick={handlePauseClick}
          >
            <span className="pause-button-icon" />
          </button>
        )}
      </div>
      <div className="button-row">
        <button
          type="button"
          aria-label="Less time"
          className="less-time-button"
        />
        <button
          type="button"
          aria-label="Reset"
          className="reset-button"
          onClick={handleReset}
        />
        <button
          type="button"
          aria-label="More time"
          className="more-time-button"
        />
      </div>
    </div>
  );

  // const initialDurationInMilliseconds = Number.parseInt(initialDuration, 10);
  // const [localMillis, setLocalMillis] = useState(initialDurationInMilliseconds);
  // const [localTarget, setLocalTarget] = useState(
  //   targetDateTime === null ? null : new Date(targetDateTime),
  // );

  // useEffect(() => {
  //   setLocalTarget(new Date(targetDateTime));
  //   setLocalMillis(initialDurationInMilliseconds);
  // }, [targetDateTime, initialDurationInMilliseconds]);

  // const isActive = useCallback(() => {
  //   return localTarget !== null;
  // }, [localTarget]);

  // const update = useCallback(
  //   (target_data, millis_data) => {
  //     setLocalMillis(millis_data);
  //     setLocalTarget(target_data);
  //     if (updateEntities) {
  //       void updateEntities([
  //         {
  //           entityId,
  //           accountId,
  //           data: {
  //             millis: millis_data,
  //             target: target_data,
  //           },
  //         },
  //       ]);
  //     }
  //   },
  //   [entityId, accountId, updateEntities],
  // );

  // useEffect(() => {
  //   let interval: any = null;
  //   if (localTarget !== null) {
  //     interval = setInterval(() => {
  //       if (+localTarget <= +new Date()) {
  //         setLocalMillis(0);
  //         setLocalTarget(null);
  //       } else {
  //         setLocalMillis(+localTarget - +new Date());
  //       }
  //     }, 1000 / 10);
  //   } else {
  //     clearInterval(interval);
  //   }
  //   return () => clearInterval(interval);
  // }, [localTarget]);

  // const start_stop = () => {
  //   if (localTarget !== null) {
  //     update(null, +localTarget - +new Date());
  //   } else {
  //     update(+new Date() + localMillis, localMillis);
  //   }
  // };

  // return (
  //   <>
  //     <LocalizationProvider dateAdapter={AdapterDateFns}>
  //       <TimePicker
  //         ampm={false}
  //         openTo="hours"
  //         views={["hours", "minutes", "seconds"]}
  //         inputFormat="HH:mm:ss"
  //         mask="__:__:__"
  //         label="timer"
  //         value={localMillis + new Date(0).getTimezoneOffset() * 60000}
  //         onChange={(date: Date | null) => {
  //           if (date !== null) {
  //             update(null, +date - new Date(0).getTimezoneOffset() * 60000);
  //           } else {
  //             update(null, new Date(0).getTimezoneOffset() * 60000);
  //           }
  //         }}
  //         renderInput={(params) => <TextField {...params} />}
  //         disabled={isActive()}
  //       />
  //     </LocalizationProvider>
  //     <Button onClick={start_stop}>{isActive() ? "Stop" : "Start"}</Button>
  //   </>
  // );
};
