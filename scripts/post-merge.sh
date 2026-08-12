#!/bin/bash
set -e

# Post-merge setup script — runs automatically after every task merge.
# Must be idempotent, non-interactive, and fast.

echo "==> Installing / updating npm dependencies..."
npm install --prefer-offline --no-audit --no-fund

echo "==> Post-merge setup complete."
