import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useAgentRunner } from "../components/hooks/use-agent-runner";
import { getPlainLayout, NextPageWithLayout } from "../shared/layout";
import { DemoLiveEditor } from "./block-generator/demo-live-editor";
import { BlockPromptInput, LoadingSpinner } from "@hashintel/design-system";
import { BouncingDotsLoader } from "./block-generator/bouncing-dots-loader";
import { Message } from "@apps/hash-agents/app/agents/react-app/io_types";
import axios from "axios";
import { Box, Button, Container, Typography } from "@mui/material";

export const ReactAppGenerator: NextPageWithLayout = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState("");
  const [code, setCode] = useState("");
  const [output, setOutput] = useState("");
  const [dependencies, setDependencies] = useState<string[]>([]);
  const [installedDependencies, setInstalledDependencies] = useState<string[]>(
    [],
  );
  const [containerId, setContainerId] = useState("");
  const [iframeKey, setIframeKey] = useState(0);
  const [loadingPreview, setLoadingPreview] = useState(true);

  const [callAgentRunner, { loading }] = useAgentRunner("react-app");

  const initContainer = (dependencies?: string[]) => {
    axios
      .post("api/block-generator/initialize-container", { dependencies })
      .then((res) => {
        setContainerId(res.data);
        setLoadingPreview(false);

        if (dependencies) {
          setInstalledDependencies(dependencies);
        }

        setTimeout(() => {
          setIframeKey(iframeKey + 1);
        }, 5000);
      });
  };

  useEffect(() => {
    initContainer();
  }, []);

  const updateDependencies = () => {
    setLoadingPreview(true);
    initContainer(dependencies);
  };

  const updatePreview = (val: string) => {
    setLoadingPreview(true);
    axios
      .post("api/block-generator/update-code", { containerId, code: val })
      .then(() => {
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
      console.log(data);
      if (data.output) {
        const result =
          data.output.messages[
            data.output.messages.length - 1
          ]?.content.toString();

        if (result) {
          const responseDependencies = result.match(
            "(?<=(Dependencies: \\[))(.|\n)+?(?=(]))",
          );
          const codeBlock = result.match("(?<=(```jsx\n))(.|\n)+?(?=(\n```))");

          if (codeBlock?.length) {
            setCode(codeBlock[0]);
            setOutput(codeBlock[0]);
            setMessages(data.output.messages);

            if (responseDependencies?.[0]) {
              setDependencies(
                responseDependencies[0]
                  .split(" ")
                  .map((dependency) => dependency.replaceAll("'", ""))
                  .filter(
                    (dependency) =>
                      dependency !== "react" && dependency !== "@mui/material",
                  ),
              );
            }

            updatePreview(codeBlock[0]);
          }
        }
      }
    });
  };

  const missingDependencies = useMemo(
    () =>
      dependencies.filter(
        (dependency) => !installedDependencies.includes(dependency),
      ),
    [dependencies, installedDependencies],
  );

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
          Create a Block!
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
          refreshIframe={() => setIframeKey(iframeKey + 1)}
        />
      ) : null}

      {missingDependencies.length ? (
        <Box mt={3}>
          <Typography variant="h5" mb={1}>
            Missing Dependencies: {missingDependencies.join(" ")}
          </Typography>
          <Button
            onClick={() => updateDependencies()}
            disabled={loadingPreview}
          >
            {loadingPreview ? <LoadingSpinner /> : "Install Dependencies"}
          </Button>
        </Box>
      ) : null}
    </Container>
  );
};

ReactAppGenerator.getLayout = getPlainLayout;

export default ReactAppGenerator;
