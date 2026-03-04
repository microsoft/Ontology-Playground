#!/usr/bin/env bash
set -euo pipefail

# Unified gate for ontology-school submissions.
# Keep this focused on checks that can run reliably in CI.

echo "[qa:tutorial-content] Compile catalogue"
npm run catalogue:build

echo "[qa:tutorial-content] Compile learning content"
npm run learn:build

echo "[qa:tutorial-content] Validate RDF catalogue files"
npm run validate

echo "[qa:tutorial-content] Done"
