# Build in the Itero environment
curl https://sh.rustup.rs -sSf | sh -s -- -y
. "$HOME/.cargo/env"
yarn config set ignore-engines true
npx turbo build --filter @apps/plugin-browser
