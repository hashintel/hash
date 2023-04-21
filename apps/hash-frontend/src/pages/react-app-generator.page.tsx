import * as React from "react";
import * as MUICore from "@mui/material";
import * as MUILab from "@mui/lab";
import * as MUIDatePickers from "@mui/x-date-pickers";
import * as MUIDataGrid from "@mui/x-data-grid";
import { useState } from "react";
import { useAgentRunner } from "../components/hooks/use-agent-runner";
import { getPlainLayout, NextPageWithLayout } from "../shared/layout";
import { DemoLiveEditor } from "./react-app-generator/demo-live-editor";
import { BlockPromptInput } from "@hashintel/design-system";
import { BouncingDotsLoader } from "./react-app-generator/bouncing-dots-loader";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";

export const ReactAppGenerator: NextPageWithLayout = () => {
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [callAgentRunner, { loading }] = useAgentRunner("react-app");

  const { Container, Typography, Box } = MUICore;

  const callAgent = (user_prompt: string) => {
    void callAgentRunner({ user_prompt }).then((data) => {
      if (data) {
        const result = data.result.toString();
        const codeBlock = result.match("(?<=(```jsx\n))(.|\n)+?(?=(```))");

        if (codeBlock?.length) {
          setOutput(codeBlock[0]);
        }
      }
    });
  };

  return (
    <Container
      sx={{
        display: "flex",
        flexDirection: "column",
        paddingY: 5,
        maxHeight: "100vh",
      }}
    >
      <Box mb={2}>
        <Typography variant="h3" mb={1}>
          Create a React Application!
        </Typography>

        <BlockPromptInput
          value={prompt}
          placeholder="Describe your application"
          onChange={(event) => setPrompt(event.target.value)}
          onSubmit={() => callAgent(prompt)}
          buttonLabel={
            loading ? (
              <>
                GENERATING <BouncingDotsLoader />
              </>
            ) : (
              <>Submit Prompt</>
            )
          }
          disabled={loading}
        />
      </Box>

      {!loading && output ? (
        <DemoLiveEditor
          code={output}
          scope={{
            React,
            MUI: {
              ...MUICore,
              ...MUILab,
              ...MUIDatePickers,
              ...MUIDataGrid,
              AdapterDateFns,
            },
          }}
          noInline
        />
      ) : null}
    </Container>
  );
};

ReactAppGenerator.getLayout = getPlainLayout;

export default ReactAppGenerator;
