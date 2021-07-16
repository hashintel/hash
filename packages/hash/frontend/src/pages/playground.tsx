import { Validator } from "jsonschema";
import Prism from "prismjs";
import { useEffect, useState, VoidFunctionComponent } from "react";
import { BlockMetadata, BlockProps } from "../blocks";
import { RemoteBlock } from "../components/RemoteBlock/RemoteBlock";
import styles from "./playground.module.scss";

const validator = new Validator();

const PassOrFail: VoidFunctionComponent<{ pass: boolean }> = ({ pass }) => (
  <img src={pass ? "/green-check.png" : "/red-cross.png"} />
);

const BlockPlayground = () => {
  const [_error, setError] = useState("");
  const [inputData, setInputData] = useState(`{\n  "key": "value"\n}`);
  const [blockProps, setBlockProps] = useState<BlockProps>({});
  const [inputErrors, setInputErrors] = useState<{
    validJson: boolean;
    matchesSchema: boolean;
    schemaErrors: string[];
  }>({
    validJson: false,
    matchesSchema: false,
    schemaErrors: [],
  });
  const [metadata, setMetadata] = useState<BlockMetadata>({});
  const [schema, setSchema] =
    useState<Record<string, any> | undefined>(undefined);

  const fetchUrl = (folderUrl: string) => {
    setError("");
    fetch(`${folderUrl}/metadata.json`)
      .then((resp) => resp.json())
      .then((metadata) => {
        metadata.source = `${folderUrl}/${metadata.source}`;
        metadata.schema = `${folderUrl}/${metadata.schema}`;
        setMetadata(metadata);
        fetch(metadata.schema)
          .then((resp) => resp.json())
          .then(setSchema)
          .catch(() => {});
      })
      .catch((err) => {
        setError(
          err.message.includes("token < in JSON") ? undefined : err.message
        );
        setMetadata({});
        setSchema(undefined);
      });
  };

  useEffect(() => {
    fetchUrl("http://localhost:5000");
    setTimeout(Prism.highlightAll, 100);
  }, []);

  useEffect(() => Prism.highlightAll(), [inputData, metadata]);

  useEffect(() => {
    try {
      const parsedInput = JSON.parse(inputData);
      let errors: any[] = [];
      if (schema) {
        errors = validator.validate(parsedInput, schema).errors;
      }
      if (errors?.length) {
        setInputErrors({
          validJson: true,
          matchesSchema: false,
          schemaErrors: errors.map((err) => err.message),
        });
        return;
      }
      setInputErrors({
        validJson: true,
        matchesSchema: true,
        schemaErrors: [],
      });
      setBlockProps(parsedInput);
    } catch (err) {
      let matchesSchema = false;
      if (!schema || Object.keys(schema).length === 0) {
        matchesSchema = true;
      }
      setInputErrors({
        validJson: false,
        matchesSchema,
        schemaErrors: [],
      });
    }
  }, [inputData, schema]);

  return (
    <div className={styles.PlaygroundWrapper}>
      <div className={`${styles.PlaygroundSection} ${styles.UrlEntry}`}>
        <label>URL to block folder</label>
        <input
          type="text"
          onChange={(e) => fetchUrl(e.target.value)}
          defaultValue="http://localhost:5000"
        />
      </div>

      {/* <div className={`${styles.PlaygroundSection} ${styles.PlaygroundError}`}>
        {error ?? ""}
      </div> */}

      <div className={`${styles.BlockDisplay} ${styles.PlaygroundSection}`}>
        <div className={styles.BlockInterface}>
          <div className={styles.BlockDataInput}>
            <label>Data to send block</label>
            <textarea
              className="language-json"
              value={inputData}
              onChange={(e) => setInputData(e.target.value)}
            />
            <div className={styles.JsonValidation}>
              <div>
                JSON formatted <PassOrFail pass={inputErrors.validJson} />
              </div>
              <div>
                Complies with schema{" "}
                <PassOrFail pass={inputErrors.matchesSchema} />
              </div>
              <div className={styles.ValidationError}>
                {inputErrors.schemaErrors.map((err) => (
                  <div key={err}>{err}</div>
                ))}
              </div>
            </div>
          </div>

          <div className="language-json">
            <label>Block interface schema</label>
            <pre>
              <code>{JSON.stringify(schema, undefined, 2)}</code>
            </pre>
          </div>

          <div className="language-json">
            <label>Block variants</label>
            <pre>
              <code>{JSON.stringify(metadata.variants ?? [], undefined, 2)}</code>
            </pre>
          </div>
        </div>

        <div className={styles.RenderedBlock}>
          <label>Rendered block {metadata?.name && `- ${metadata.name}`}</label>
          <div>
            {!metadata.source ? (
              "No block source loaded"
            ) : !inputErrors.matchesSchema ? (
              "Input does not match schema"
            ) : (
              <RemoteBlock url={metadata.source ?? ""} {...blockProps} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlockPlayground;
