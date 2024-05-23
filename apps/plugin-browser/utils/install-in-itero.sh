# Install dependencies in the Itero Plasmo build environment
curl https://sh.rustup.rs -sSf | sh -s -- -y
. "$HOME/.cargo/env"
yarn global add "turbo@$(jq -r '.devDependencies.turbo' < package.json)"
yarn config set ignore-engines true
yarn
