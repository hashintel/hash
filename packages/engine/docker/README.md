# Docker containers for hEngine

This directory contains the Docker images for hEngine. To build the image, run from the `packages/engine` directory:

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

It's possible to set the output as well. Eventually you need to rebuild the image to add a user with the correct id:

```sh
docker build -t h-engine -f docker/Dockerfile --build-arg USER_UID=$(id -u) --build-arg GROUP_UID=$(id -g) .

mkdir -p output

docker run -v "$(pwd)/tests/examples/air_defense_system:/air_defense_system:ro" -v "$(pwd)/output:/output" h-engine \
  --project /air_defense_system \
  --log-level info \
  --output /output \
  single-run \
  --num-steps 10
```
