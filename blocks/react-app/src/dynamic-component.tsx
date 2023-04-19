import React, { useState, useEffect } from "react";
import { Box } from "@mui/material";
import * as Babel from "@babel/standalone";

const code = `import React, { useState } from "react";
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
};`;

const input = 'const getMessage = () => "Hello World";';

export const DynamicComponent = () => {
  const [Component, setComponent] = useState(null);

  useEffect(() => {
    // Transpile the code using Babel
    const transpiledCode = Babel.transform(input, {
      presets: ["@babel/preset-env", "@babel/preset-react"],
    }).code;

    // Evaluate the transpiled code
    const evalCode = `(function (module, exports) { ${transpiledCode} })(module, exports)`;
    const { exports: componentExports } = eval(evalCode);

    // Get the default export (assumes that the component uses `module.exports`)
    const Component = componentExports.default;

    setComponent(Component);
  }, [code]);

  return Component ? <Component /> : <Box>Loading...</Box>;
};
