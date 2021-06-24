import React, {
  RefCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  VoidFunctionComponent,
} from "react";
import { render } from "react-dom";
// @todo what to do about providing this
import { defineBlock } from "./utils";
import { baseSchemaConfig, renderPM } from "./sandbox";
import { Schema } from "prosemirror-model";
import { RemoteBlock } from "../../components/RemoteBlock/RemoteBlock";

type Block = {
  entityId: string;
  entity: Record<any, any>;
  componentId: string;
};

type PageBlockProps = {
  contents: Block[];
};

const componentIdToName = (componentId: string) => {
  const stripped = componentId.replace(/[^a-zA-Z0-9]/g, "");
  return stripped.slice(0, 1).toUpperCase() + stripped.slice(1);
};

interface NodeView {
  update(node: any): void;
}

interface NodeViewConstructor {
  new (node: any, view: any, getPos: any): NodeView;
}

const Header: VoidFunctionComponent<{
  color?: string;
  level?: number;
  editableRef?: RefCallback<HTMLElement>;
  text: string;
  onChange: (nextText: string) => void;
}> = ({ color, level = 1, editableRef, text, onChange }) => {
  // @todo set type here properly
  const Header = `h${level}` as any;

  return (
    <div>
      <Header
        style={{ fontFamily: "Arial", color: color ?? "black" }}
        ref={editableRef}
      >
        {text}
      </Header>
      <input
        type="text"
        value={text}
        onChange={(evt) => onChange(evt.target.value)}
      />
    </div>
  );
};

const createNodeView = (
  name: string,
  componentId: string
): NodeViewConstructor => {
  const nodeView = class implements NodeView {
    dom: HTMLDivElement = document.createElement("div");
    contentDOM: HTMLElement | undefined = undefined;

    // @todo type node
    constructor(node: any, public view: any, public getPos: () => number) {
      this.update(node);
    }

    update(node: any) {
      if (node) {
        if (node.type.name === name) {
          console.log(node);

          render(
            <RemoteBlock
              url={componentId}
              {...node.attrs.props}
              editableRef={(node: HTMLElement) => {
                console.log(node);
                this.contentDOM = node || undefined;
                this.view.dispatch(this.view.state.tr);
              }}
            />,
            this.dom
          );

          // render(
          //   <Header
          //     editableRef={(node) => {
          //       this.contentDOM = node || undefined;
          //     }}
          //     text={node.content.content?.[0]?.text ?? ""}
          //     onChange={(nextText) => {
          //       const tr = this.view.state.tr;
          //       tr.replaceWith(
          //         this.getPos() + 1,
          //         node.nodeSize,
          //         nextText ? this.view.state.schema.text(nextText) : []
          //       );
          //       this.view.dispatch(tr);
          //     }}
          //   />,
          //   // <RemoteBlock url={componentId} {...node.attrs.props} />,
          //   this.dom
          // );

          return true;
        }
      }

      return false;
    }

    destroy() {
      this.dom.remove();
    }

    // @todo type this
    stopEvent(evt: any) {
      if (evt.type === "dragstart") {
        evt.preventDefault();
      }

      return true;
    }

    ignoreMutation(evt: any) {
      if (
        !evt.target ||
        evt.target === this.contentDOM ||
        this.contentDOM?.contains(evt.target)
      ) {
        return false;
      }
      return true;
    }
  };

  Object.defineProperty(nodeView, "name", { value: `${name}View` });

  return nodeView;
};

export const PageBlock: VoidFunctionComponent<PageBlockProps> = ({
  contents,
}) => {
  const root = useRef<HTMLDivElement>(null);

  // @todo needs to respond to changes to contents
  useEffect(() => {
    const nodeViews = contents.reduce<
      Record<string, (node: any, view: any, getPos: any) => NodeView>
    >((nodeViews, block) => {
      const name = componentIdToName(block.componentId);

      if (!nodeViews[name]) {
        const NodeViewClass = createNodeView(name, block.componentId);
        nodeViews[name] = (node, view, getPos) =>
          new NodeViewClass(node, view, getPos);
      }

      return nodeViews;
    }, {});

    // @todo type this
    const blocks = contents.reduce<Record<string, any>>((blocks, block) => {
      const name = componentIdToName(block.componentId);

      if (!blocks[name]) {
        blocks[name] = defineBlock({
          attrs: { props: { default: {} } },
          // @todo infer this somehow
          content: "text*",
          marks: "",
        });
      }

      return blocks;
    }, {});

    const schema = new Schema({
      ...baseSchemaConfig,
      nodes: {
        ...baseSchemaConfig.nodes,
        ...blocks,
      },
    });

    const mappedContents = contents.map((block) => {
      const { children, ...props } = block.entity;

      return schema.node("block", {}, [
        schema.node(
          componentIdToName(block.componentId),
          { props },
          children.map((child: any) => {
            if (child.type === "text") {
              return schema.text(child.text);
            }

            // @todo recursive nodes
            throw new Error("unrecognised child");
          })
        ),
      ]);
    });

    const doc = schema.node("doc", null, mappedContents);

    const node = root.current;
    if (node) {
      renderPM(node, doc, { nodeViews });

      return () => {
        node.innerHTML = "";
      };
    }
  }, []);

  return <div id="root" ref={root} />;
};
