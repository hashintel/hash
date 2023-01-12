# Apache-Arrow bundler

## Usage

### Building

Move to the package folder and run:

```sh
npm install
npm run bundle
```

The bundle should appear as `./dist/apache-arrow-bundle.js`

### Modifying for use in the Engine

- Manually modify the bundle, adding `export` to `var arrow;` at the very top of the file [1]
- Manually modify `class MessageReader` to re-export the `VectorLoader` as follows [2]:

  ```javascript
  class MessageReader {
      constructor(source) {
        this.source =
          source instanceof ByteStream ? source : new ByteStream(source);
        this.VectorLoader = VectorLoader;
      }
      ...
  ```

- From the `./apps/engine` folder run:
  `cp apache-arrow-js-bundle/dist/apache-arrow-bundle.js lib/execution/src/runner/javascript/apache-arrow-bundle.js`

> [1] Unfortunately at this time we haven't figured out how to generate the exact format we need for the way we load modules into V8.
> This is why we require the bundle to be manually modified.
>
> If anyone has ideas on how to resolve this, suggestions are welcome.
>
> [2] To be able to load Vectors individually from memory without needing to duplicate the Schema and storing it alongside the batch, we currently have decided to use some internal functions.
> We've opened a [StackOverflow question](https://stackoverflow.com/questions/71145338/is-there-a-way-to-read-a-recordbatch-from-bytes-and-pass-in-the-schema-directly) (and are open to opening a JIRA ticket, and or PR to the main repo), in the hopes that we can remove the need to do this.
