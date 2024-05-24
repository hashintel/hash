# Build in the Itero Plasmo environment
# This seems to be a separate VM or layer to where the install script is run, as it needs Cargo installing again
apt update
apt install default-jre -y
curl https://sh.rustup.rs -sSf | sh -s -- -y
. "$HOME/.cargo/env"
yarn config set ignore-engines true
npx turbo build --filter @apps/plugin-browser
