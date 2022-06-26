import * as React from "react";

import { Box, Typography, Autocomplete, TextField } from "@mui/material";
import { GithubPullRequest } from "./types";
import { InfoUI } from "./info-ui";
import { GithubIcon } from "./icons";

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

  const onClick = (pullRequest: number) => {
    setSelectedPullRequestId({
      repository: selectedRepository,
      number: pullRequest,
    });
  };

  const reposToPrIds: Map<string, number[]> = React.useMemo(() => {
    const repoMap = new Map();

    Array.from(allPrs?.keys()).forEach((prId) => {
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

  return (
    <Box
      sx={({ palette }) => ({
        maxWidth: 560,
        mx: "auto",
        border: `2px dashed ${palette.gray[40]}`,
        background: palette.white,
        pt: 5,
        pb: 6,
        px: 10,
        display: "flex",
        justifyContent: "center",
        borderRadius: "6px",
      })}
    >
      <Box
        sx={{
          maxWidth: 400,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <GithubIcon
          sx={({ palette }) => ({
            height: 56,
            width: 56,
            mb: 2,
            color: palette.gray[80],
          })}
        />
        <Typography variant="h2" sx={{ textAlign: "center", mb: 3 }}>
          Select a Github pull request to create a timeline
        </Typography>

        <Box sx={{ width: 320 }}>
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
            fullWidth
            sx={{ mb: 3 }}
            renderInput={(params) => (
              <TextField {...params} label="Choose a Repository" />
            )}
          />
          <Autocomplete
            value={selectedPullRequest}
            onChange={(_, newValue) => {
              if (newValue !== null) {
                setSelectedPullRequest(newValue);
                onClick(newValue);
              }
            }}
            disabled={!selectedRepository}
            disablePortal
            id="repository-combo-selector"
            options={reposToPrIds.get(selectedRepository!)?.sort() ?? []}
            fullWidth
            renderInput={(params) => (
              <TextField {...params} label="Choose a Pull Request" />
            )}
          />
        </Box>
      </Box>
      {/*  */}
    </Box>
  );
};
