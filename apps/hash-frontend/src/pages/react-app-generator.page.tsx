import * as React from "react";
import { useEffect, useState } from "react";
import { useAgentRunner } from "../components/hooks/use-agent-runner";
import { getPlainLayout, NextPageWithLayout } from "../shared/layout";
import { DemoLiveEditor } from "./react-app-generator/demo-live-editor";
import { BlockPromptInput } from "@hashintel/design-system";
import { BouncingDotsLoader } from "./react-app-generator/bouncing-dots-loader";
import { Message } from "@apps/hash-agents/app/agents/react-app/io_types";
import axios from "axios";
import { Box, Container, Typography } from "@mui/material";

export const ReactAppGenerator: NextPageWithLayout = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState("");
  const [code, setCode] = useState("");
  const [output, setOutput] = useState("");
  const [containerId, setContainerId] = useState("");
  const [iframeKey, setIframeKey] = useState(0);
  const [loadingPreview, setLoadingPreview] = useState(true);

  const [callAgentRunner, { loading }] = useAgentRunner("react-app");

  useEffect(() => {
    axios.get("api/initialize-container").then((res) => {
      setContainerId(res.data);
      setLoadingPreview(false);
    });
  }, []);

  const updatePreview = (val: string) => {
    setLoadingPreview(true);
    axios.post("api/update-code", { containerId, code: val }).then((res) => {
      setLoadingPreview(false);
      setIframeKey(iframeKey + 1);
    });
  };

  const callAgent = (userPrompt: string) => {
    const newMessage: Message = {
      type: "HumanMessage",
      content: userPrompt,
    };
    const newMessages = [...messages, newMessage];

    void callAgentRunner({ messages: newMessages }).then((data) => {
      if (data) {
        const result =
          data.messages[data.messages.length - 1]?.content.toString();

        if (result) {
          const codeBlock = result.match("(?<=(```jsx\n))(.|\n)+?(?=(\n```))");
          const dependencies = result.match(
            "(?<=(Dependencies: [))(.|\n)+?(?=(]))",
          );

          if (codeBlock?.length) {
            setCode(codeBlock[0]);
            setOutput(codeBlock[0]);
            setMessages(data.messages);

            updatePreview(codeBlock[0]);
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
          disabled={loading || loadingPreview}
        />
      </Box>

      {output ? (
        <DemoLiveEditor
          code={code}
          noInline
          iframeKey={iframeKey}
          loading={loadingPreview}
          onChange={(value) => {
            setCode(value);
            updatePreview(value);
          }}
        />
      ) : null}
    </Container>
  );
};

ReactAppGenerator.getLayout = getPlainLayout;

export default ReactAppGenerator;
