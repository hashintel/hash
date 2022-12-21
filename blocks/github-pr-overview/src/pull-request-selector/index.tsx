/* eslint-disable canonical/filename-no-index -- @todo rename file */

import { Box, Typography } from "@mui/material";
import { FunctionComponent, useMemo, useState } from "react";

import { GithubIcon } from "../icons";
import { GithubPullRequestEntityType } from "../types";
import { CustomAutocomplete } from "./custom-autocomplete";

export type PullRequestSelectorProps = {
  allPrs: Map<string, GithubPullRequestEntityType> | undefined;
  setSelectedPullRequestId: (x: any) => void;
};

export const PullRequestSelector: FunctionComponent<
  PullRequestSelectorProps
> = ({ allPrs, setSelectedPullRequestId }) => {
  const [selectedRepository, setSelectedRepository] = useState<string | null>(
    null,
  );
  const [selectedPullRequestNumber, setSelectedPullRequestNumber] = useState<
    number | null
  >(null);

  const onClick = (pullRequest: number) => {
    setSelectedPullRequestId({
      repository: selectedRepository,
      number: pullRequest,
    });
  };

  const reposToPrIds: { [k: string]: number[] } = useMemo(() => {
    const repoMap = {} as { [k: string]: number[] };

    for (const prId of Array.from(allPrs?.keys() ?? [])) {
      // e.g. [hashintel, hash, 490
      const parsed = prId.split("/");
      if (parsed.length !== 3) {
        throw Error(`PR Identifier was invalid: ${prId}`);
      }

      const repository = parsed.slice(0, 2).join("/"); // rejoin the org and repo
      const prNumber = parseInt(parsed[2]!, 10);

      if (!repoMap[repository]) {
        repoMap[repository] = [prNumber];
      } else {
        repoMap[repository]?.push(prNumber);
      }
    }

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
        maxWidth={400}
        display="flex"
        flexDirection="column"
        alignItems="center"
      >
        <GithubIcon
          sx={({ palette }) => ({
            height: 56,
            width: 56,
            mb: 2,
            color: palette.gray[80],
          })}
        />
        <Typography variant="h2" textAlign="center" mb={3}>
          Select a GitHub pull request to show its overview
        </Typography>

        <Box sx={{ width: 320 }}>
          <CustomAutocomplete
            value={selectedRepository}
            onChange={(_, newValue) => {
              setSelectedRepository(newValue);
            }}
            sx={{ mb: 3 }}
            options={Object.keys(reposToPrIds)}
            label="Repository name"
            placeholder="Search for repository"
          />

          <CustomAutocomplete
            value={selectedPullRequestNumber}
            onChange={(_, newValue) => {
              setSelectedPullRequestNumber(newValue);

              if (newValue !== null) {
                onClick(newValue);
              }
            }}
            getOptionLabel={(option) =>
              `#${option} ${
                allPrs?.get(
                  selectedRepository ? `${selectedRepository}/${option}` : "",
                )?.properties.title ?? ""
              }`
            }
            disabled={!selectedRepository}
            disablePortal
            options={reposToPrIds[selectedRepository ?? ""]?.sort() ?? []}
            label="Pull Request number or name"
            placeholder="Search for pull request"
          />
        </Box>
      </Box>
      {/*  */}
    </Box>
  );
};
