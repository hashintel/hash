# HASH Standard Library
[HASH](https://hash.ai) is a platform for building and running simulations, and the [standard library](https://docs.hash.ai/core/libraries) contains helper functions for simulations.

Within the [HASH IDE](https://core.hash.ai) you can call a HASH standard library function with `hash_stdlib.[function name]`.

For instance, to get the distance between two agents, you can call `hash_stdlib.distanceBetween(agentA, agentB`.

## Developing

To contribute, please install [npm](https://www.npmjs.com/get-npm), and run `npm install` at the base directory of this repo to get set up.

Some useful commands:
```
# Build the standard library
npm run build

# Run the tests (you may need to install jest globally: npm install -g jest)
npm run test
```

We use ESLint to help find errors and enforce code style. Your editor or IDE likely
has an ESLint plugin which will show these errors and warnings automatically.
Alternatively, you can run ESLint from your terminal:
```
npm run lint
```

The repo is split between [JavaScript functions](https://github.com/hashintel/stdlib/tree/master/stdlib/ts) - written in typescript - and [Python functions](https://github.com/hashintel/stdlib/tree/master/stdlib/py).

## Discussion
Discuss the HASH and the standard library on our [forum](https://community.hash.ai/) or our [slack](http://hashpublic.slack.com/).
