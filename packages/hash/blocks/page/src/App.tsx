import React, { useLayoutEffect, useRef, VoidFunctionComponent } from "react";
import { render } from "react-dom";
// @todo what to do about providing this
import { defineBlock } from "./utils";

type Block = {
  entityId: string;
  entity: object;
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
  new (node: any): NodeView;
}

const createNodeView = (
  name: string,
  componentId: string
): NodeViewConstructor => {
  const nodeView = class implements NodeView {
    dom: HTMLDivElement = document.createElement("div");

    // @todo type node
    constructor(node: any) {
      this.update(node);
    }

    update(node: any) {
      if (node) {
        if (node.type.name === node) {
          render(
            <pre>
              {JSON.stringify({ componentId, node: node.toJSON() }, null, "\t")}
            </pre>,
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
    const nodeViews = contents.reduce<Record<string, NodeViewConstructor>>(
      (nodeViews, block) => {
        const name = componentIdToName(block.componentId);

        if (!nodeViews[name]) {
          nodeViews[name] = createNodeView(name, block.componentId);
        }

        return nodeViews;
      },
      {}
    );

    // @todo type this
    const blocks = contents.reduce<Record<string, any>>((blocks, block) => {
      const name = componentIdToName(block.componentId);

      if (!blocks[name]) {
        blocks[name] = defineBlock({
          attrs: { props: { default: {} } },
        });
      }

      return blocks;
    }, {});

    console.log(nodeViews, blocks);

    // const node = root.current;
    // if (node) {
    //   renderPM(node);
    //
    //   return () => {
    //     node.innerHTML = "";
    //   };
    // }
  }, []);

  return <div id="root" ref={root} />;
};
