#!/bin/bash
set -e

cd "$(dirname "$0")"

pnpm install
pnpm build
(cd apps/cli && npm install -g .)

echo ""
echo "Done. Run 'cyrus' to use the updated version."
