import { Box, Dialog, Stack, Typography } from "@mui/material";
import { Schema } from "prosemirror-model";
import { Plugin, PluginKey, Transaction } from "prosemirror-state";
import { VFC } from "react";
import { Button } from "@hashintel/hash-design-system";
import { ensureMounted } from "../../lib/dom";
import { RenderPortal } from "./usePortals";

type ErrorProps = { errored: boolean };

const ErrorView: VFC<ErrorProps> = ({ errored }) => {
  return (
    <Dialog open={errored} maxWidth="md">
      <Box p={10} textAlign="center">
        <Typography variant="h1" mb={2}>
          Error with collaborative server
        </Typography>
        <Typography>
          The collaborative server has errored.{" "}
          <strong>Recent changes may not have been saved.</strong>
        </Typography>
        <Typography mb={4}>
          Please refresh to ensure no further work is lost.
        </Typography>
        <Stack direction="row" justifyContent="center">
          <Button size="large" onClick={() => window.location.reload()}>
            Refresh
          </Button>
        </Stack>
      </Box>
    </Dialog>
  );
};

const defaultErrorProps = { errored: false };

export const createErrorPlugin = (renderPortal: RenderPortal) => {
  const key = new PluginKey<ErrorProps, Schema>();
  return [
    new Plugin<ErrorProps, Schema>({
      key,
      state: {
        init() {
          return defaultErrorProps;
        },
        apply(tr: Transaction<Schema>, value: ErrorProps) {
          if (typeof tr.getMeta(key) === "boolean") {
            return { errored: true };
          }

          return value;
        },
      },
      props: {
        editable(state) {
          return !key.getState(state)?.errored;
        },
      },
      view(view) {
        const mountNode = document.createElement("div");

        return {
          update() {
            const props = key.getState(view.state) ?? defaultErrorProps;

            ensureMounted(mountNode, document.body);
            renderPortal(<ErrorView {...props} />, mountNode);
          },
          destroy() {
            renderPortal(null, mountNode);
            mountNode.remove();
          },
        };
      },
    }) as Plugin<unknown, Schema>,
    (tr: Transaction<Schema>) => {
      // @todo log
      return tr.setMeta(key, true);
    },
  ] as const;
};
