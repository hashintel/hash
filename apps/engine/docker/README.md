# Docker containers for HASH Engine

This directory contains the Docker images for HASH Engine (hEngine). To build the image, run from the `apps/engine` directory:

```sh
docker build -t h-engine -f docker/Dockerfile .
```

To run it, a project has to be passed as volume mount:

```sh
docker run -v "$(pwd)/tests/examples/air_defense_system:/air_defense_system:ro" h-engine \
  --project /air_defense_system \
  --log-level info \
  single-run \
  --num-steps 10
```

It's possible to set the output as well:

```sh
mkdir -p output

docker run -v "$(pwd)/tests/examples/air_defense_system:/air_defense_system:ro" -v "$(pwd)/output:/output" h-engine \
  --project /air_defense_system \
  --log-level info \
  --output /output \
  single-run \
  --num-steps 10
```

The Docker image uses 1000:1000 as the user by default. Because of this you may encounter a permission denied error when attempting to write to the output folder. It's possible to fix this by changing the user inside of the docker image by rebuilding it with another id:

```sh
docker build -t h-engine -f docker/Dockerfile --build-arg USER_UID=$(id -u) --build-arg GROUP_UID=$(id -g) .
```
