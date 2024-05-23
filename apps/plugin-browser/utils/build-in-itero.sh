# Build in the Itero environment
. "$HOME/.cargo/env"
yarn config set ignore-engines true
npx turbo build --filter @apps/plugin-browser
