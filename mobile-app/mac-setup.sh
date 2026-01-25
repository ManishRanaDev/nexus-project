#!/bin/bash

# Nexus Server - Mac Setup Script
# This script helps you set up everything needed to build the iOS app

set -e  # Exit on error

echo "🍎 Nexus Server - macOS Setup"
echo "================================"
echo ""

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo "❌ This script is for macOS only!"
    exit 1
fi

# Check for Homebrew
echo "📦 Checking for Homebrew..."
if ! command -v brew &> /dev/null; then
    echo "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

    # Add to PATH for Apple Silicon
    if [[ $(uname -m) == 'arm64' ]]; then
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
else
    echo "✅ Homebrew already installed"
fi

# Check for Node.js
echo ""
echo "📦 Checking for Node.js..."
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    brew install node
else
    echo "✅ Node.js already installed ($(node --version))"
fi

# Check for EAS CLI
echo ""
echo "📦 Checking for EAS CLI..."
if ! command -v eas &> /dev/null; then
    echo "Installing EAS CLI..."
    npm install -g eas-cli
else
    echo "✅ EAS CLI already installed ($(eas --version))"
fi

# Install dependencies
echo ""
echo "📦 Installing project dependencies..."
npm install

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Login to Expo: eas login"
echo "2. Build the app: eas build --platform ios --profile development"
echo ""
echo "For detailed instructions, see: MACOS-SETUP.md"
