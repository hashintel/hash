# The local Petrinaut Optimizer service for a dev task that wants the real
# optimization provider. Source this file, then call
# `optimizer_service_parse "$@"`: when the arguments carry
# --with-optimizer-service it starts the service, exports the variables that
# point a dev server at it, and arranges for the container it started to stop
# when the task exits. The remaining arguments land in OPTIMIZER_FORWARDED.
#
# The service runs from the petrinaut-opt:local image, built from
# apps/petrinaut-opt/docker/Dockerfile, bound to loopback on port 4004. An
# optimizer already serving that port healthily, the compose stack's container
# or a bare uvicorn during Python work, is reused and left running.

OPTIMIZER_SERVICE_FLAG="--with-optimizer-service"
OPTIMIZER_SERVICE_ORIGIN="http://127.0.0.1:4004"
OPTIMIZER_FORWARDED=()

optimizer_repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
optimizer_image="petrinaut-opt:local"
# One fixed name: the container owns port 4004 exclusively anyway, and a fixed
# name lets a new launcher find what an earlier run left behind.
optimizer_container="petrinaut-opt-website-dev"
optimizer_started_container=""

optimizer_healthy() {
  curl --silent --fail --output /dev/null --max-time 2 "$OPTIMIZER_SERVICE_ORIGIN/status"
}

# Removes stopped containers earlier runs left behind. A hard-killed launcher
# never reaches its cleanup, and the leftover otherwise holds port 4004 while
# serving the code it was built from. The filter is anchored because Docker
# matches names by substring; the optional numeric suffix catches containers
# older launchers named by process id. Only stopped containers are swept, so a
# launcher already serving on the port keeps its container and is reused.
optimizer_remove_leftovers() {
  docker ps --all \
    --filter "name=^${optimizer_container}(-[0-9]+)?$" \
    --filter status=exited --filter status=created \
    --format '{{.Names}}' 2>/dev/null |
    while read -r name; do
      [ -n "$name" ] || continue
      echo "Removing leftover Petrinaut Opt dev container $name..."
      docker rm --force "$name" >/dev/null 2>&1 || true
    done
}

# Stops only the container this task started, by id, so two launchers never
# stop each other's.
optimizer_stop() {
  if [ -n "$optimizer_started_container" ]; then
    docker stop --timeout 5 "$optimizer_started_container" >/dev/null 2>&1 || true
    optimizer_started_container=""
  fi
}

start_optimizer_service() {
  if optimizer_healthy; then
    echo "Reusing the optimizer already serving on $OPTIMIZER_SERVICE_ORIGIN."
  else
    if ! docker info >/dev/null 2>&1; then
      echo "Docker is not running. Start Docker Desktop and run the command again." >&2
      exit 1
    fi
    # Only `docker run --name` below needs the name free, and `docker ps`
    # under `pipefail` would end the task before the guard above can report.
    optimizer_remove_leftovers
    echo "Building Petrinaut Opt..."
    docker build \
      --file "$optimizer_repository_root/apps/petrinaut-opt/docker/Dockerfile" \
      --tag "$optimizer_image" "$optimizer_repository_root"
    echo "Starting Petrinaut Opt on $OPTIMIZER_SERVICE_ORIGIN..."
    optimizer_started_container="$(docker run --detach --init --read-only --rm \
      --name "$optimizer_container" --publish 127.0.0.1:4004:4004 "$optimizer_image")"
    trap optimizer_stop EXIT
    for _ in $(seq 1 60); do
      if optimizer_healthy; then break; fi
      sleep 0.5
    done
    if ! optimizer_healthy; then
      echo "Petrinaut Opt did not become healthy within 30 seconds" >&2
      exit 1
    fi
  fi
  export PETRINAUT_OPT_ORIGIN="$OPTIMIZER_SERVICE_ORIGIN"
  export VITE_PETRINAUT_OPT_PROVIDER=service
}

# Splits the flag off the task's arguments and starts the service when present.
optimizer_service_parse() {
  local with_service=false argument
  OPTIMIZER_FORWARDED=()
  for argument in "$@"; do
    if [ "$argument" = "$OPTIMIZER_SERVICE_FLAG" ]; then
      with_service=true
    else
      OPTIMIZER_FORWARDED+=("$argument")
    fi
  done
  if [ "$with_service" = true ]; then
    start_optimizer_service
  fi
}

# Runs the dev server in the foreground, forwarding SIGINT and SIGTERM to it so
# the EXIT trap above still runs after the server has gone.
run_dev_server() {
  "$@" &
  local child=$! status=0
  trap 'kill -TERM "$child" 2>/dev/null' TERM
  trap 'kill -INT "$child" 2>/dev/null' INT
  while kill -0 "$child" 2>/dev/null; do
    wait "$child" && status=0 || status=$?
  done
  trap - TERM INT
  return "$status"
}
