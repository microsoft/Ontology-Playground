#!/bin/sh
set -e

echo "Configuring local git hooks path..."
git config core.hooksPath .githooks

echo "Checking for gitleaks..."
if command -v gitleaks >/dev/null 2>&1; then
  echo "Running initial secret scan..."
  gitleaks detect --source . --redact --config .gitleaks.toml
else
  echo "gitleaks is not installed."
  echo "Install with: brew install gitleaks"
  echo "Then run: npm run secrets:scan"
fi
