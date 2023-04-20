import { Button, Container, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useAgentRunner } from "../components/hooks/use-agent-runner";
import { getPlainLayout, NextPageWithLayout } from "../shared/layout";

export const Page: NextPageWithLayout = () => {
  const [prompt, setPrompt] = useState("What is 23 times 2?");
  const [expression, setExpression] = useState(prompt);
  const [output, setOutput] = useState("");
  const [callAgentRunner, { loading }] = useAgentRunner("react-app");

  useEffect(() => {
    void callAgentRunner({ user_prompt: expression }).then((data) => {
      console.log(data);
      if (data) {
        setOutput(data.result.toString());
      }
    });
  }, [callAgentRunner, expression]);

  return (
    <Container sx={{ paddingTop: 5 }}>
      <Typography variant="h3">Test the math agent!</Typography>

      <input
        type="text"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
      />

      <Button
        onClick={() => {
          setExpression(prompt);
        }}
      >
        Create
      </Button>

      {loading ? <p>Loading...</p> : <p>{output}</p>}
    </Container>
  );
};

Page.getLayout = getPlainLayout;

export default Page;
