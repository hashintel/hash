# Docker configuration

This directory contains production Docker configuration files.

Production Dockerfiles may need to be revised further.

Images make use of [`--transpile-only`](https://github.com/TypeStrong/ts-node#transpilers) option of `ts-node` such that we skip typechecking to speed up execution time.
See [this thread](https://github.com/TypeStrong/ts-node/issues/104) for more context.

## Build locally

If you wish to build the Docker images for deployment, these are the steps to take:

1.  Be in the `hashintel/hash` Git repo root
1.  For `api` Docker image run

    ```shell
    docker build -t hash-api-prod . -f ./infra/docker/api/prod/Dockerfile
    ```

1.  For `realtime` Docker image run

    ```shell
    docker build -t hash-realtime-prod . -f ./infra/docker/realtime/prod/Dockerfile
    ```

1.  For `search-loader` Docker image run

    ```shell
    docker build -t hash-search-loader-prod . -f ./infra/docker/search-loader/prod/Dockerfile
    ```
