import React, { useEffect, useState, useCallback } from "react";
import { BlockComponent } from "blockprotocol/react";

// eslint-disable-next-line no-restricted-imports -- false-positive frontend-specific rule
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
  const [localMillis, setLocalMillis] = useState(millis);
  const [localTarget, setLocalTarget] = useState(
    target === null ? null : new Date(target),
  );

  useEffect(() => {
    setLocalTarget(target);
    setLocalMillis(millis);
  }, [target, millis]);

  const isActive = useCallback(() => {
    return localTarget !== null;
  }, [localTarget]);

  const update = useCallback(
    (target_data, millis_data) => {
      setLocalMillis(millis_data);
      setLocalTarget(target_data);
      if (updateEntities) {
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
      }
    },
    [entityId, accountId, updateEntities],
  );

  useEffect(() => {
    let interval: any = null;
    if (localTarget !== null) {
      interval = setInterval(() => {
        if (+localTarget <= +new Date()) {
          setLocalMillis(0);
          setLocalTarget(null);
        } else {
          setLocalMillis(+localTarget - +new Date());
        }
      }, 1000 / 10);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [localTarget]);

  const start_stop = () => {
    if (localTarget !== null) {
      update(null, +localTarget - +new Date());
    } else {
      update(+new Date() + localMillis, localMillis);
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
          value={localMillis + new Date(0).getTimezoneOffset() * 60000}
          onChange={(date: Date | null) => {
            if (date !== null) {
              update(null, +date - new Date(0).getTimezoneOffset() * 60000);
            } else {
              update(null, new Date(0).getTimezoneOffset() * 60000);
            }
          }}
          renderInput={(params) => <TextField {...params} />}
          disabled={isActive()}
        />
      </LocalizationProvider>
      <Button onClick={start_stop}>{isActive() ? "Stop" : "Start"}</Button>
    </>
  );
};
