# BP lite scratchpad

## Service

A package has two mutually exclusive points: `/ea` and `/block`.

### Service spec

- service id
- message (or RPC?) signatures + changelog
- (?) config schema + default config
  - EA can override default config

### EA side (provider)

- EA can create multiple copies of a service provider
- Each service provider can have multiple instances (one per block that depends on the service)
- Service provider can support a range of spec versions

```ts
import { createFooBarService } from "@blockprotocol-services/foo-bar/ea";
```

### Block side (consumer)

```ts
import { createFooBarServiceConsumer } from "@blockprotocol-services/foo-bar/block";
```

- service spec version
- service optionality
- (?) service config

```json
// block-metadata.json
{
  "services": {
    "foo-bar": {
      "specVersion": "1.2",
      "defaultConfig": {
        "hello": "world"
      }
    },
    "baz": {
      "specVersion": "0.1-alpha.42",
      "optional": true
    }
  }
}
```

Without service config

```json
{
  "serviceSpecs": {
    "foo-bar": "1.2"
  },
  "optionalServiceSpecs": {
    "baz": "0.1-alpha.42"
  }
}
```

## Communication channel

### Lowest level (websocket-like)

```ts
const serviceMessageBus =
  globalThis.createBlockProtocolServiceMessageBus("foo-bar");

serviceMessageBus.send(jsonPayload);
serviceMessageBus.addEventListener("message", (event) => {
  console.log("Message from service provider", event.data);
});
```

### More abstract level (RPC-like)

TODO

## Sandbox

### EA

- Init the block in a given element

### Block

- Define import maps (replaces package.json `externals`)
- Define `globalThis.createBlockProtocolServiceMessageBus` function.

## Random code examples

```ts
import { createIframeSandbox } from "@blockprotocol/iframe-sandbox/ea";
import { createColorSchemeServiceProvider } from "@blockprotocol-services/color-scheme/ea";

const colorSchemeServiceProvider = createColorSchemeServiceProvider();

const iframeSandbox = createIframeSandbox({
  availableServiceProviders: [colorSchemeServiceProvider],
});

const block = iframeSandbox.createBlock({
  container: document.getElementById("my-block"),
  blockUrl: "",
  size: {
    strategy: "fixed",
    width: 300,
    height: 400,
  },
  // size: {
  //   strategy: "containerDefined", // default
  // },
  // size: {
  //   strategy: "resizableVertically",
  //   minHeight: 100,
  //   maxHeight: 1000,
  // },
});

console.log(block.getContainer()); // div

block.destroy();

await colorSchemeServiceProvider.toggle("dark");
await colorSchemeServiceProvider.toggle("light");

block
  .getServiceInstance("color-scheme")
  .on("sendMessage", ({ blockInstance, serviceInstance, messagePayload }) => {
    console.log({ payload });
  });

block
  .getServiceInstance("color-scheme")
  .on(
    "receiveMessage",
    ({ blockInstance, serviceInstance, messagePayload }) => {
      console.log({ payload });
    },
  );

block.on(
  "receiveMessage",
  ({ blockInstance, serviceInstance, messagePayload }) => {
    console.log({ blockInstance, serviceInstance, messagePayload });
  },
);

colorSchemeService.on(
  "someEvent",
  ({ blockInstance, serviceInstance, messagePayload }) => {
    console.log(blockInstance, serviceInstance, messagePayload);
  },
);
```

### Simple HTML block that toggles light / dark color scheme

```html
<!-- option 1 (singleton) -->
<script>
  import { colorSchemeServiceConsumer } from "@blockprotocol-services/color-scheme/block";

  const blockContentDiv = document.getElementById("block-content");
  blockContentDiv.hidden = true;

  // custom API
  colorSchemeServiceConsumer.autoApply((scheme) => {
    blockContentDiv.classList.remove("light", "dark");
    blockContentDiv.classList.add(scheme);
  });
  // Common API
  colorSchemeServiceConsumer.onReady((config) => {
    blockContentDiv.hidden = false;
  });
</script>
<!-- option 1 (service consumer instance) -->
<script>
  import { createColorSchemeServiceConsumer } from "@blockprotocol-services/color-scheme/block";

  const blockContentDiv = document.getElementById("block-content");
  blockContentDiv.hidden = true

  const colorSchemeServiceConsumer = await createColorSchemeServiceConsumer()
  colorSchemeServiceConsumer.autoApply((scheme) => {
    blockContentDiv.classList.remove("light", "dark");
    blockContentDiv.classList.add(scheme);
  });

  blockContentDiv.hidden = false
</script>
<div id="block-content">
  <button>hello world</button>
</div>
```
