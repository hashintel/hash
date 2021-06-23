import React, {
  useLayoutEffect,
  useRef,
  VoidFunctionComponent,
  forwardRef,
} from "react";
import { render } from "react-dom";
// @todo what to do about providing this
import { defineBlock } from "./utils";
import { plugins, baseSchemaConfig, renderPM } from "./sandbox";
import { Schema } from "prosemirror-model";

type Block = {
  entityId: string;
  entity: Record<any, any>;
  componentId: string;
};

type AppProps = {
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

const Header = forwardRef<
  HTMLHeadingElement,
  {
    color?: string;
    level?: number;
    text: string;
  }
>(({ color, level = 1, text }, ref) => {
  // @todo set type here properly
  const Header = `h${level}` as any;

  return (
    <Header style={{ fontFamily: "Arial", color: color ?? "black" }} ref={ref}>
      {text}
    </Header>
  );
});

const createNodeView = (
  name: string,
  componentId: string
): NodeViewConstructor => {
  const nodeView = class implements NodeView {
    dom: HTMLDivElement = document.createElement("div");
    contentDOM: HTMLElement | undefined = undefined;

    // @todo type node
    constructor(node: any) {
      this.update(node);
    }

    update(node: any) {
      if (node) {
        if (node.type.name === name) {
          console.log(node);
          render(
            <Header
              ref={(node) => {
                this.contentDOM = node || undefined;
              }}
              text={node.content.content[0].text}
            />,
            // <RemoteBlock url={componentId} {...node.attrs.props} />,
            this.dom
          );

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
  };

  Object.defineProperty(nodeView, "name", { value: `${name}View` });

  return nodeView;
};

export const App: VoidFunctionComponent<AppProps> = ({ contents }) => {
  const root = useRef<HTMLDivElement>(null);

  // @todo needs to respond to changes to contents
  useLayoutEffect(() => {
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
