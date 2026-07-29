#!/usr/bin/env bash
set -euo pipefail

# Rust Toolchain Installation Script with Retry Logic
# Usage: ./install-rust.sh [toolchain-file]

TOOLCHAIN_FILE="${1:-rust-toolchain.toml}"

if [[ ! -f "$TOOLCHAIN_FILE" ]]; then
  echo "Error: Toolchain file '$TOOLCHAIN_FILE' not found"
  exit 1
fi

COMPONENTS="$(yq '.toolchain.components[]' "$TOOLCHAIN_FILE")"
TOOLCHAIN_CHANNEL="$(yq '.toolchain.channel' "$TOOLCHAIN_FILE")"

# GitHub Actions colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}🦀 Setting up Rust toolchain: ${TOOLCHAIN_CHANNEL}${NC}"

# Update rustup first to get latest network handling fixes
echo -e "${BLUE}📦 Updating rustup to latest version...${NC}"
rustup self update || echo -e "${YELLOW}⚠️  rustup self update failed, continuing with existing version${NC}"

MIRRORS=(
  "https://static.rust-lang.org"
)

echo -e "${PURPLE}🌐 Available mirrors: ${#MIRRORS[@]}${NC}"

# Function to try toolchain installation with different mirrors
install_toolchain() {
  local mirror=$1
  echo -e "${BLUE}🔧 Trying toolchain installation with: ${mirror}${NC}"
  export RUSTUP_DIST_SERVER="$mirror"
  rustup toolchain install "$TOOLCHAIN_CHANNEL" || return $?
  rustup target add --toolchain "$TOOLCHAIN_CHANNEL" aarch64-apple-darwin
}

# Function to try component installation with different mirrors
install_component() {
  local component=$1
  local mirror=$2
  echo -e "${BLUE}📦 Trying component ${YELLOW}${component}${BLUE} with: ${mirror}${NC}"
  export RUSTUP_DIST_SERVER="$mirror"
  rustup component add --toolchain "$TOOLCHAIN_CHANNEL" "$component"
}

# Try toolchain installation with different mirrors
echo -e "${CYAN}🚀 Installing toolchain...${NC}"
TOOLCHAIN_INSTALLED=false
for mirror in "${MIRRORS[@]}"; do
  if install_toolchain "$mirror"; then
    echo -e "${GREEN}✅ Toolchain installed successfully with: ${mirror}${NC}"
    TOOLCHAIN_INSTALLED=true
    break
  else
    echo -e "${RED}❌ Toolchain installation failed with: ${mirror}${NC}"
    # Add jitter to avoid thundering herd + rate limiting
    sleep_time=$((30 + RANDOM % 30))
    echo -e "${YELLOW}⏱️  Sleeping ${sleep_time}s to avoid rate limiting...${NC}"
    sleep $sleep_time
  fi
done

if [ "$TOOLCHAIN_INSTALLED" = false ]; then
  echo -e "${RED}💥 ERROR: Toolchain installation failed with all mirrors${NC}"
  exit 1
fi

# Install each component with mirror fallback
echo -e "${CYAN}🧩 Installing components...${NC}"
for component in $COMPONENTS; do
  echo -e "${PURPLE}🔧 Installing component: ${YELLOW}${component}${NC}"
  COMPONENT_INSTALLED=false

  for mirror in "${MIRRORS[@]}"; do
    if install_component "$component" "$mirror"; then
      # Verify component was installed
      if rustup component list --toolchain "$TOOLCHAIN_CHANNEL" --installed | grep -q "^$component"; then
        echo -e "${GREEN}✅ Component ${YELLOW}${component}${GREEN} installed successfully with: ${mirror}${NC}"
        COMPONENT_INSTALLED=true
        break
      else
        echo -e "${YELLOW}⚠️  Component ${component} reported success but not found in installed list${NC}"
      fi
    else
      echo -e "${RED}❌ Component ${component} installation failed with: ${mirror}${NC}"
      # Add jitter to avoid rate limiting
      sleep_time=$((10 + RANDOM % 20))
      echo -e "${YELLOW}⏱️  Sleeping ${sleep_time}s to avoid rate limiting...${NC}"
      sleep $sleep_time
    fi
  done

  if [ "$COMPONENT_INSTALLED" = false ]; then
    echo -e "${RED}💥 ERROR: Component ${component} failed to install with all mirrors${NC}"
    exit 1
  fi
done

echo "RUSTUP_TOOLCHAIN=$TOOLCHAIN_CHANNEL" >> "${GITHUB_ENV:-/dev/null}"
echo -e "${GREEN}🎉 Rust toolchain setup complete!${NC}"
