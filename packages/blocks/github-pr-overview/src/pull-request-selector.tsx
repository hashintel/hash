import * as React from "react";

import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import LinearProgress from "@mui/material/LinearProgress";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import CheckCircle from "@mui/icons-material/CheckCircle";

import { GithubPullRequest } from "./types";

export type PullRequestSelectorProps = {
  allPrs: Map<string, GithubPullRequest>;
  setSelectedPullRequestId: (x: any) => void;
};

export const PullRequestSelector: React.FunctionComponent<
  PullRequestSelectorProps
> = ({ allPrs, setSelectedPullRequestId }) => {
  const [selectedRepository, setSelectedRepository] = React.useState<string>();
  const [selectedPullRequest, setSelectedPullRequest] =
    React.useState<number>();

  const onClick = () => {
    setSelectedPullRequestId({
      repository: selectedRepository,
      number: selectedPullRequest,
    });
  };

  const reposToPrIds: Map<string, number[]> = React.useMemo(() => {
    const repoMap = new Map();

    Array.from(allPrs.keys()).forEach((prId) => {
      // e.g. [hashintel, hash, 490
      const parsed = prId.split("/");
      if (parsed.length !== 3) {
        throw Error(`PR Identifier was invalid: ${prId}`);
      }

      const repository = parsed.slice(0, 2).join("/"); // rejoin the org and repo
      const prNumber = parseInt(parsed[2]!, 10);

      if (!repoMap.has(repository)) {
        repoMap.set(repository, [prNumber]);
      } else {
        repoMap.get(repository).push(prNumber);
      }
    });

    return repoMap;
  }, [allPrs]);

  React.useEffect(() => {
    setSelectedPullRequest(undefined);
  }, [selectedRepository]);

  return reposToPrIds.size > 0 ? (
    <Grid container spacing={2} alignItems="center">
      <Grid item>
        <Autocomplete
          value={selectedRepository}
          onChange={(_, newValue) => {
            if (newValue !== null) {
              setSelectedRepository(newValue);
            }
          }}
          disablePortal
          id="repository-combo-selector"
          options={Array.from(reposToPrIds.keys())}
          sx={{ width: 300 }}
          renderInput={(params) => (
            <TextField {...params} label="Choose a Repository" />
          )}
        />
      </Grid>
      {selectedRepository != null ? (
        <Grid item>
          <Autocomplete
            value={selectedPullRequest}
            onChange={(_, newValue) => {
              if (newValue !== null) {
                setSelectedPullRequest(newValue);
              }
            }}
            disablePortal
            id="repository-combo-selector"
            options={reposToPrIds.get(selectedRepository)!.sort()}
            sx={{ width: 300 }}
            renderInput={(params) => (
              <TextField {...params} label="Choose a Pull Request" />
            )}
          />
        </Grid>
      ) : null}
      {selectedRepository != null && selectedPullRequest != null ? (
        <Grid item>
          <IconButton onClick={onClick} size="large">
            <CheckCircle />
          </IconButton>
        </Grid>
      ) : null}
    </Grid>
  ) : (
    <LinearProgress />
  );
};
