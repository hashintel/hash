import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Schema, DOMParser } from "prosemirror-model";
import { schema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";
import { exampleSetup } from "prosemirror-example-setup";
import { useEffect } from "react";
import applyDevTools from "prosemirror-dev-tools";

// Mix the nodes from prosemirror-schema-list into the basic schema to
// create a schema with list support.

const Page = () => {
  useEffect(() => {
    const mySchema = new Schema({
      nodes: addListNodes(schema.spec.nodes, "paragraph block*", "block"),
      marks: schema.spec.marks,
    });

    const view = new EditorView<Schema>(document.querySelector("#editor")!, {
      state: EditorState.create({
        doc: DOMParser.fromSchema(mySchema).parse(
          document.querySelector("#content")!,
        ),
        plugins: exampleSetup({ schema: mySchema }),
      }),
    });

    applyDevTools(view);
  }, []);
  return (
    <>
      <link rel="stylesheet" href="https://prosemirror.net/css/editor.css" />
      <div id="content" style={{ display: "none" }}>
        <h1>hello</h1>
        <p>world</p>
      </div>
      <div id="editor" style={{ width: 500, height: 400 }} />
    </>
  );
};

export default Page;
