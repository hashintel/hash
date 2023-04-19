import {
  type BlockComponent,
  useEntitySubgraph,
  useGraphBlockModule,
} from "@blockprotocol/graph/react";
import Box from "@mui/material/Box";
import { useRef } from "react";
import { DynamicComponent } from "./dynamic-component";
import Calculator from "./example";
import * as Babel from "@babel/standalone";

const calculator = `import React, { useState } from "react";
import {
  Container,
  Box,
  Button,
  TextField,
  Typography,
} from "@mui/material";

const Calculator = () => {
  const [input, setInput] = useState("");
  const [result, setResult] = useState("");

  const handleClick = (event) => {
    const value = event.currentTarget.textContent;
    if (value === "=") {
      try {
        const evalResult = eval(input);
        setResult(evalResult.toString());
      } catch (error) {
        setResult("Error");
      }
    } else if (value === "C") {
      setInput("");
      setResult("");
    } else {
      setInput(input + value);
    }
  };

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <Typography variant="h4" sx={{ mb: 2 }}>
          Calculator
        </Typography>
        <TextField
          id="standard-basic"
          label="Input"
          variant="outlined"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          sx={{ mb: 2 }}
        />
        <TextField
          id="standard-basic"
          label="Result"
          variant="outlined"
          value={result}
          disabled
          sx={{ mb: 2 }}
        />
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
          {["7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "0", ".", "C", "+"].map(
            (value) => (
              <Button key={value} variant="contained" onClick={handleClick}>
                {value}
              </Button>
            )
          )}
          <Button variant="contained" onClick={handleClick} sx={{ gridColumn: "span 2" }}>
            =
          </Button>
        </Box>
      </Box>
    </Container>
  );
};

export default Calculator;`;

Babel.registerPreset("@babel/preset-env", require("@babel/preset-env"));

export const App: BlockComponent<any> = ({
  graph: { blockEntitySubgraph, readonly },
}) => {
  // const blockRootRef = useRef<HTMLDivElement>(null);
  // const { graphModule } = useGraphBlockModule(blockRootRef);
  // const { rootEntity: blockEntity, linkedEntities } =
  //   useEntitySubgraph(blockEntitySubgraph);

  // const {
  //   metadata: {
  //     recordId: { entityId },
  //     entityTypeId,
  //   },
  //   properties,
  // } = blockEntity;

  const code = `(function() {${calculator}})()`;

  return (
    <Box>
      {/* <Calculator /> */}
      <DynamicComponent />
    </Box>
  );
};
