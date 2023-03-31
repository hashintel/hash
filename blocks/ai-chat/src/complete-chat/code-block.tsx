import { Button, CheckIcon, CopyIcon } from "@hashintel/design-system";
import {
  Box,
  buttonClasses,
  Fade,
  MenuItem,
  outlinedInputClasses,
  Select,
  selectClasses,
  styled,
  SxProps,
  Theme,
} from "@mui/material";
import { lowlight } from "lowlight";
import {
  FormEvent,
  forwardRef,
  FunctionComponent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import SyntaxHighlighter from "react-syntax-highlighter";
import { a11yDark } from "react-syntax-highlighter/dist/esm/styles/hljs";

import { CodegenIcon } from "../icons/codegen";

const supportedLanguages = lowlight.listLanguages();

const codeLanguageRegex = /^\s*([\w-]+)/;

const codeBlockBorderRadius = 6;

const CodeBlockSelect = styled(Select)(({ theme }) =>
  theme.unstable_sx({
    minWidth: "unset",
    [`& .${selectClasses.icon}.${selectClasses.iconOutlined}`]: {
      color: theme.palette.gray[70],
    },
    [`& .${selectClasses.select}.${selectClasses.outlined}`]: {
      fontWeight: 500,
      background: theme.palette.gray[90],
      transition: theme.transitions.create("background"),
      color: theme.palette.common.white,
      paddingX: 1.5,
      paddingY: 0.5,
      ":hover": {
        color: theme.palette.common.white,
        background: theme.palette.gray[100],
        [`&~.${outlinedInputClasses.notchedOutline}`]: {
          "border-color": theme.palette.gray[70],
        },
      },
      [`&~.${outlinedInputClasses.notchedOutline}`]: {
        "border-color": theme.palette.gray[70],
      },
    },
  }),
);

const CodeBlockButton = styled(Button)(({ theme }) =>
  theme.unstable_sx({
    minHeight: "unset",
    minWidth: 100,
    paddingX: 1,
    paddingY: 0.5,
    backgroundColor: ({ palette }) => palette.gray[90],
    color: ({ palette }) => palette.common.white,
    borderColor: ({ palette }) => palette.gray[70],
    [`& .${buttonClasses.endIcon}`]: {
      color: ({ palette }) => palette.gray[70],
    },
    ":hover": {
      color: ({ palette }) => palette.common.white,
      backgroundColor: ({ palette }) => palette.gray[100],
      [`& .${buttonClasses.endIcon}`]: {
        color: ({ palette }) => palette.gray[70],
      },
    },
  }),
);

const EditInCodePenButton = forwardRef<
  HTMLButtonElement,
  {
    html?: string;
    css?: string;
    js?: string;
  }
>(({ html, css, js }, ref) => {
  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();

      const data = {
        title: "My Custom Pen",
        html: html ?? "",
        css: css ?? "",
        js: js ?? "",
        // This determines which editors are open: 1st bit for HTML, 2nd for CSS, 3rd for JS
        editors: "111",
      };

      const form = document.createElement("form");
      form.method = "POST";
      form.action = "https://codepen.io/pen/define";
      form.target = "_blank";

      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "data";
      input.value = JSON.stringify(data);

      form.appendChild(input);
      document.body.appendChild(form);

      form.submit();
      document.body.removeChild(form);
    },
    [html, css, js],
  );

  return (
    <CodeBlockButton
      onClick={handleSubmit}
      variant="tertiary"
      endIcon={<CodegenIcon />}
      ref={ref}
    >
      Edit in CodePen
    </CodeBlockButton>
  );
});

/**
 * Convert the `a11yDark` highlight.js styling into the MUI `sx` format,
 * where the root element is the `pre` tag component.
 */
const a11yDarkSxStyles: SxProps<Theme> = {
  ...a11yDark.hljs,
  ...Object.entries(a11yDark)
    .filter(([className]) => className !== "hljs")
    .reduce(
      (prev, [className, styles]) => ({
        ...prev,
        [`.${className}`]: styles,
      }),
      {},
    ),
};

export const CodeBlock: FunctionComponent<{ code: string }> = ({ code }) => {
  // Attempt to parse the language from the code block.
  const detectedLanguage = useMemo(() => {
    const match = code.match(codeLanguageRegex);

    return match && match[0] && supportedLanguages.includes(match[0])
      ? match[0]
      : undefined;
  }, [code]);

  // Strip the language from the code block if it has been parsed successfully.
  const sanitizedCode = useMemo(
    () =>
      detectedLanguage ? code.replace(codeLanguageRegex, "").trim() : code,
    [detectedLanguage, code],
  );

  const [language, setLanguage] = useState<string>(
    detectedLanguage ?? "plaintext",
  );

  useEffect(() => {
    setLanguage(detectedLanguage ?? "plaintext");
  }, [detectedLanguage]);

  const [copied, setCopied] = useState<boolean>(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(sanitizedCode);

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [sanitizedCode]);

  return (
    <Box
      sx={{
        marginTop: 2,
        marginBottom: 4,
        "> pre": {
          ...a11yDarkSxStyles,
          fontSize: 14,
          background: ({ palette }) => palette.gray[100],
          marginTop: 0,
          borderBottomRightRadius: codeBlockBorderRadius,
          borderBottomLeftRadius: codeBlockBorderRadius,
        },
      }}
    >
      <Box
        display="flex"
        justifyContent="space-between"
        sx={{
          borderTopLeftRadius: codeBlockBorderRadius,
          borderTopRightRadius: codeBlockBorderRadius,
          background: ({ palette }) => palette.gray[90],
          padding: 1,
        }}
      >
        <CodeBlockSelect
          value={language}
          onChange={({ target }) => setLanguage(target.value as string)}
        >
          {supportedLanguages.map((supportedLanguage) => (
            <MenuItem key={supportedLanguage} value={supportedLanguage}>
              {supportedLanguage}
            </MenuItem>
          ))}
        </CodeBlockSelect>
        <Box display="flex" columnGap={1}>
          <Fade in={["javascript", "css"].includes(language)} mountOnEnter>
            <EditInCodePenButton
              html={language === "html" ? sanitizedCode : undefined}
              css={language === "css" ? sanitizedCode : undefined}
              js={language === "javascript" ? sanitizedCode : undefined}
            />
          </Fade>
          <CodeBlockButton
            onClick={handleCopy}
            variant="tertiary"
            endIcon={copied ? <CheckIcon /> : <CopyIcon />}
          >
            {copied ? "Copied" : "Copy"}
          </CodeBlockButton>
        </Box>
      </Box>
      <SyntaxHighlighter
        language={language}
        showLineNumbers
        useInlineStyles={false}
      >
        {sanitizedCode}
      </SyntaxHighlighter>
    </Box>
  );
};
