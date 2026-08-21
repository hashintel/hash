import { GlobeRegularIcon } from "../../../../shared/icons/globe-regular-icon";
import { LockRegularIcon } from "../../../../shared/icons/lock-regular-icon";
import { PersonBoothRegularIcon } from "../../../../shared/icons/person-booth-regular-icon";

export const entityAuthorizationStatusIcons = {
  public: <GlobeRegularIcon />,
  "shared-with-others": <PersonBoothRegularIcon />,
  private: <LockRegularIcon />,
} as const;
