# Docker configuration

This directory contains production Docker configuration files.
It also contained setup files for local dev until https://github.com/hashintel/dev/pull/439.

Production docker files may need to be revised further.

## Build locally

If you wish to build the Docker images for deployment, these are the steps to take:

1.  be in the `hashintel/hash` Git repo root
2.  For `api` Docker image run

```shell
docker build -t hash-api-prod . -f ./packages/hash/docker/api/prod/Dockerfile
```

3.  For `realtime` Docker image run

```shell
docker build -t hash-realtime-prod . -f ./packages/hash/docker/realtime/prod/Dockerfile
```

4.  For `search-loader` Docker image run

```shell
docker build -t hash-search-loader-prod . -f ./packages/hash/docker/search-loader/prod/Dockerfile
```
