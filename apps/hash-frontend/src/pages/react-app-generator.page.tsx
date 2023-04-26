import * as React from "react";
import * as MUICore from "@mui/material";
import * as MUILab from "@mui/lab";
import * as MUIDatePickers from "@mui/x-date-pickers";
import * as MUIDataGrid from "@mui/x-data-grid";
import { useEffect, useRef, useState } from "react";
import { useAgentRunner } from "../components/hooks/use-agent-runner";
import { getPlainLayout, NextPageWithLayout } from "../shared/layout";
import { DemoLiveEditor } from "./react-app-generator/demo-live-editor";
import { BlockPromptInput } from "@hashintel/design-system";
import { BouncingDotsLoader } from "./react-app-generator/bouncing-dots-loader";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { Message } from "@apps/hash-agents/app/agents/react-app/io_types";
import axios from "axios";

export const ReactAppGenerator: NextPageWithLayout = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [containerId, setContainerId] = useState("");
  const [callAgentRunner, { loading }] = useAgentRunner("react-app");

  const iframeRef = useRef<HTMLIFrameElement | null>();
  const [iframeKey, setIframeKey] = useState(0);

  const { Container, Typography, Box } = MUICore;

  useEffect(() => {
    axios.get("api/initialize-container").then((res) => {
      setContainerId(res.data);

      setTimeout(() => {
        setIframeKey(iframeKey + 1);
      }, 2000);
    });
  }, []);

  const callAgent = (userPrompt: string) => {
    const newMessage: Message = {
      type: "HumanMessage",
      content: userPrompt,
    };
    const newMessages = [...messages, newMessage];

    console.log({ messages: newMessages });

    void callAgentRunner({ messages: newMessages }).then((data) => {
      if (data) {
        const result =
          data.messages[data.messages.length - 1]?.content.toString();

        if (result) {
          const codeBlock = result.match("(?<=(```jsx\n))(.|\n)+?(?=(\n```))");
          const dependencies = result.match(
            "(?<=(Dependencies: [))(.|\n)+?(?=(]))",
          );

          console.log(dependencies);

          if (codeBlock?.length) {
            setOutput(codeBlock[0]);
            setMessages(data.messages);

            axios
              .post("api/update-code", { containerId, code: codeBlock[0] })
              .then((res) => {
                console.log(
                  "_------------------------------------- reoslver ----------",
                );

                setIframeKey(iframeKey + 1);

                setTimeout(() => {
                  setIframeKey(iframeKey + 1);
                }, 2000);
              });
          }
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

      <iframe key={iframeKey} src="http://localhost:3001" />

      <button onClick={() => setIframeKey(iframeKey + 1)}>asd</button>
    </Container>
  );
};

ReactAppGenerator.getLayout = getPlainLayout;

export default ReactAppGenerator;
