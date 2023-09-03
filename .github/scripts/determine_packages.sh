#!/usr/bin/env bash

set -eux -o pipefail

rm -rf out

turbo prune --scope="@local/hash-backend-utils"

cp .env out/.env
cp -r .github out/.github
cp yarn.lock out/yarn.lock
cp -r patches out/patches

cat package.json | sed 's/\("postinstall".*patch-package.*\)"/\1 || true"/g' > out/package.json

pushd out

HUSKY=0 yarn install --frozen-lockfile --prefer-offline

turbo run test --filter "@local/hash-backend-utils" -- --runInBand




exit 0

UNIT_PACKAGES=$(turbo run test \
    --filter '!@tests/*...[HEAD^]' \
    --dry-run=json \
  | jq '.tasks[] | select(.task == "test" and .command != "<NONEXISTENT>") | {package: .package}' \
  | jq -c --slurp '{ include: . }')

INTEGRATION_PACKAGES=$(turbo run test \
    --filter '@tests/*...[HEAD^]' \
    --dry-run=json \
  | jq '.tasks[] | select(.task == "test" and .command != "<NONEXISTENT>") | {package: .package}' \
  | jq -c --slurp '{ include: . }')

REQUIRES_GRAPH=$(turbo run build --filter '@apps/hash-graph...[HEAD^]' --dry-run=json | jq '.packages != []')
REQUIRES_AI_WORKER_TS=$(turbo run build --filter '@apps/hash-ai-worker-ts...[HEAD^]' --dry-run=json | jq '.packages != []')
REQUIRES_AI_WORKER_PY=$(turbo run build --filter '@apps/hash-ai-worker-py...[HEAD^]' --dry-run=json | jq '.packages != []')
REQUIRES_INTEGRATION_WORKER=$(turbo run build --filter '@apps/hash-integration-worker...[HEAD^]' --dry-run=json | jq '.packages != []')
if echo "$INTEGRATION_PACKAGES" | grep -q '@tests/hash-backend-integration'; then
    REQUIRES_GRAPH=true
fi
if echo "$INTEGRATION_PACKAGES" | grep -q '@tests/hash-playwright'; then
  REQUIRES_GRAPH=true
  REQUIRES_AI_WORKER_TS=true
  REQUIRES_AI_WORKER_PY=true
  REQUIRES_INTEGRATION_WORKER=true
fi

DOCKER_PACKAGES=[]

if [[ $REQUIRES_GRAPH == 'true' ]]; then
  DOCKER_PACKAGES=$(echo "$DOCKER_PACKAGES" | jq '. += ["@apps/hash-graph"]')
fi
if [[ $REQUIRES_AI_WORKER_TS == 'true' ]]; then
  DOCKER_PACKAGES=$(echo "$DOCKER_PACKAGES" | jq '. += ["@apps/hash-ai-worker-ts"]')
fi
if [[ $REQUIRES_AI_WORKER_PY == 'true' ]]; then
  DOCKER_PACKAGES=$(echo "$DOCKER_PACKAGES" | jq '. += ["@apps/hash-ai-worker-py"]')
fi
if [[ $REQUIRES_INTEGRATION_WORKER == 'true' ]]; then
  DOCKER_PACKAGES=$(echo "$DOCKER_PACKAGES" | jq '. += ["@apps/hash-integration-worker"]')
fi

DOCKER_PACKAGES=$(echo $DOCKER_PACKAGES | jq -c '{ include: [{ package: .[] }] }')

echo "units=$UNIT_PACKAGES"
echo "integrations=$INTEGRATION_PACKAGES"
echo "dockers=$DOCKER_PACKAGES"

exit 0

TEST_PACKAGES=$(turbo run test \
    --filter '...[e0e0f298229f1fba7642a8f6dab334ea9a276a4c]' \
    --dry-run=json \
  | jq -r '.tasks[] | select(.task == "test" and .command != "<NONEXISTENT>") | .package')

echo "$TEST_PACKAGES"

UNIT_TESTS=()
INTEGRATION_TESTS=()
REQUIRED_DOCKER_IMAGES=()

while read -r PACKAGE; do
  DOCKER_DEPENDENCIES=$(turbo build:docker \
    --dry-run=json --filter "$PACKAGE..." \
    | jq '.tasks[] | select(.task == "build:docker" and .command != "<NONEXISTENT>") | .package')
  if [[ -z "$DOCKER_DEPENDENCIES" ]]; then
    UNIT_TESTS=("${UNIT_TESTS[@]}" "$PACKAGE")
  else
    INTEGRATION_TESTS=("${INTEGRATION_TESTS[@]}" "$PACKAGE")
    REQUIRED_DOCKER_IMAGES=("${REQUIRED_DOCKER_IMAGES[@]}" "$DOCKER_DEPENDENCIES")
  fi
done <<< "$TEST_PACKAGES"


echo "Unit tests: ${UNIT_TESTS[@]}"
echo "Integration tests: ${INTEGRATION_TESTS[@]}"
echo "Required docker images: ${REQUIRED_DOCKER_IMAGES[@]}"


