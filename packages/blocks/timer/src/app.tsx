import React, { useEffect, useState, useCallback } from "react";
import { BlockComponent } from "blockprotocol/react";

// eslint-disable-next-line no-restricted-imports
import { TextField, Button } from "@mui/material";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";

type AppProps = {
  millis: number;
  target: Date;
};

export const App: BlockComponent<AppProps> = ({
  updateEntities,
  entityId,
  accountId,
  target = null,
  millis = 0,
}) => {
  const [millis_, setMillis] = useState(millis);
  const [target_, setTarget] = useState(
    target === null ? null : new Date(target),
  );

  useEffect(() => {
    setTarget(target);
    setMillis(millis);
  }, [target, millis]);

  const isActive = useCallback(() => {
    return target_ !== null;
  }, [target_]);

  const update = useCallback(
    (target_data, millis_data) => {
      setMillis(millis_data);
      setTarget(target_data);
      void updateEntities([
        {
          entityId,
          accountId,
          data: {
            millis: millis_data,
            target: target_data,
          },
        },
      ]);
    },
    [entityId, accountId, updateEntities],
  );

  useEffect(() => {
    let interval = null;
    if (isActive()) {
      interval = setInterval(() => {
        if (+target_ <= +new Date()) {
          setMillis(0);
          setTarget(null);
        } else {
          setMillis(+target_ - +new Date());
        }
      }, 1000 / 10);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [target_, isActive]);

  const start_stop = () => {
    if (isActive()) {
      update(null, +target_ - +new Date());
    } else {
      update(+new Date() + millis_, millis_);
    }
  };

  return (
    <>
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <TimePicker
          ampm={false}
          openTo="hours"
          views={["hours", "minutes", "seconds"]}
          inputFormat="HH:mm:ss"
          mask="__:__:__"
          label="timer"
          value={millis_ + new Date(0).getTimezoneOffset() * 60000}
          onChange={(date: Date) => {
            update(null, +date - new Date(0).getTimezoneOffset() * 60000);
          }}
          renderInput={(params) => <TextField {...params} />}
          disabled={isActive()}
        />
      </LocalizationProvider>
      <Button onClick={start_stop}>{isActive() ? "Stop" : "Start"}</Button>
    </>
  );
};
