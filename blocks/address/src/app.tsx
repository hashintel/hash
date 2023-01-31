import {
  type BlockComponent,
  useGraphBlockService,
} from "@blockprotocol/graph/react";
import { useRef } from "react";

/**
 * The file referenced here provides some base styling for your block.
 * You can delete it and write your own, but we encourage you to keep the styling scoped, e.g.
 * - use CSS modules (this approach), e.g. overwrite the contents of .block in base.module.scss
 * - use a CSS-in-JS solution
 * - use a shadow DOM
 * any of these ensure that your styling does not affect anything outside your block.
 */
import styles from "./base.module.scss";

/**
 * This defines the properties of the entity your block expects to be sent.
 * This entity is available to your block on props.graph.blockEntity.
 * To change the structure of the entity your block expects, change this type.
 */
type BlockEntityProperties = {
  name: string;
};

/**
 * This function is to help illustrate a property being changed when the button is pressed.
 */
const supplyRandomName = () => {
  const names = ["Alice", "Bob", "Carol", "Dave", "Erin", "Frank"];
  return names[Math.floor(Math.random() * names.length)];
};

/**
 * This is the entry point for your block – the function that embedding applications will call to create it.
 * It is a function that takes a property object (known as "props" in React) and returns an element.
 * You should update this comment to describe what your block does, or remove the comment.
 */
export const App: BlockComponent<BlockEntityProperties> = ({
  graph: {
    /**
     * The properties sent to the block represent the messages sent automatically from the application to the block.
     * All block <> application messages are split into services, and so is this property object.
     * Here, we're extracting the 'graph' service messages from the property object.
     * – and then taking a single message from it, 'blockEntity'
     * @see https://blockprotocol.org/docs/spec/graph-service#message-definitions for other such messages
     */
    blockEntity: { entityId, properties },
  },
}) => {
  /**
   * These two lines establish communication with the embedding application.
   * You don't need to change or understand them, but if you are curious:
   * 1. we create a 'ref' which will store a reference to an element – we need an element to communicate to the app via
   *   - the ref stores 'null' at first, but will be attached to the root element in our block when it exists
   * 2. we then feed the reference to a 'hook' (a function that uses React features), which sets up the graph service:
   *   - this takes care of the lower-level details of communicating with the embedding application
   *   - it returns a 'graphService' which has various methods on it, corresponding to messages your block can send
   *   - see an example below for sending an 'updateEntity' message, and a link to the other available messages
   */
  const blockRootRef = useRef<HTMLDivElement>(null);
  const { graphService } = useGraphBlockService(blockRootRef);

  /** Here we extract the 'name' property from the blockEntity's properties */
  const { name } = properties;

  return (
    /**
     * This is the outermost element of the block. We do two things with this <div>:
     * 1. give it a class from our CSS module
     *   - the 'styles' object has properties corresponding to classes defined in base.module.scss
     * 2. attach the ref we created earlier, so that we have a reference to this element
     *   - our service helper will dispatch messages to the app from this element, and listen for responses on it
     */
    <div className={styles.block} ref={blockRootRef}>
      <h1>Hello, {name}!</h1>
      <p>
        The entityId of this block is {entityId}. Use it to update its data,
        e.g. by calling <code>updateEntity</code>.
      </p>
      <button
        onClick={() =>
          /**
           * This is an example of using the graph service to send a message to the embedding application
           * – this particular message asks the application update an entity's properties.
           * The specific entity to update is identified by 'entityId'
           * – we are passing the 'entityId' of the entity loaded into the block ('blockEntity').
           *
           * Many other messages are available for your block to read and update entities, and links between entities
           * @see https://blockprotocol.org/docs/spec/graph-service#message-definitions
           */
          graphService?.updateEntity({
            data: {
              entityId,
              properties: { name: supplyRandomName() },
            },
          })
        }
        type="button"
      >
        Update Name
      </button>
    </div>
  );
};
