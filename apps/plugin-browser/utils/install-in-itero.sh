# Install dependencies in the Itero Plasmo build environment
# A separate script is provided to 'build' the plugin once dependencies are installed
curl https://sh.rustup.rs -sSf | sh -s -- -y
. "$HOME/.cargo/env"
yarn config set ignore-engines true
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
yarn
