import * as React from "react";
import * as MUI from "@mui/material";
import { useState } from "react";
import { useAgentRunner } from "../components/hooks/use-agent-runner";
import { getPlainLayout, NextPageWithLayout } from "../shared/layout";
import { DEFAULT_OUTPUT, DEFAULT_PROMPT } from "./react-app-generator/defaults";
import { DemoLiveEditor } from "./react-app-generator/demo-live-editor";

export const ReactAppGenerator: NextPageWithLayout = () => {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [output, setOutput] = useState(DEFAULT_OUTPUT);
  const [callAgentRunner, { loading }] = useAgentRunner("react-app");

  const { Container, Typography, Button } = MUI;

  const callAgent = (user_prompt: string) => {
    void callAgentRunner({ user_prompt }).then((data) => {
      console.log(data);
      if (data) {
        setOutput(data.result.toString());
      }
    });
  };

  return (
    <Container sx={{ paddingTop: 5 }}>
      <Typography variant="h3">Create a React Application!</Typography>

      <input
        type="text"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
      />

      <Button onClick={() => callAgent(prompt)}>Create</Button>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <DemoLiveEditor
          code={output}
          scope={{
            React,
            MUI,
          }}
          noInline
        />
      )}
    </Container>
  );
};

ReactAppGenerator.getLayout = getPlainLayout;

export default ReactAppGenerator;
