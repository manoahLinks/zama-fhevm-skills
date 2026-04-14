#!/usr/bin/env bash
# Re-validate the FHEVM skill examples against the latest upstream
# fhevm-hardhat-template. Run this after editing any reference, template, or
# example to confirm the skill still produces working code.
#
# Usage: ./validate.sh

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SANDBOX="$SKILL_DIR/fhevm-validation-test"
TEMPLATE_REPO="https://github.com/zama-ai/fhevm-hardhat-template.git"

echo "==> Skill directory:   $SKILL_DIR"
echo "==> Sandbox directory: $SANDBOX"

# 1. Refresh the sandbox (clone if missing, otherwise pull)
if [ ! -d "$SANDBOX/.git" ]; then
    echo "==> Cloning fhevm-hardhat-template..."
    git clone "$TEMPLATE_REPO" "$SANDBOX"
else
    echo "==> Updating existing sandbox..."
    git -C "$SANDBOX" fetch --quiet
    git -C "$SANDBOX" reset --hard origin/main --quiet
fi

# 2. Install dependencies (skill examples use OpenZeppelin Confidential Contracts on top of the template)
cd "$SANDBOX"
echo "==> Installing template dependencies..."
npm install --prefer-offline --no-audit --no-fund

if [ ! -d "node_modules/@openzeppelin/confidential-contracts" ]; then
    echo "==> Installing OpenZeppelin Confidential Contracts..."
    npm install --save @openzeppelin/confidential-contracts@^0.4.0 @openzeppelin/contracts \
        --prefer-offline --no-audit --no-fund
fi

# 3. Copy the skill's example contracts and tests into the sandbox
echo "==> Copying example contracts and tests..."
cp "$SKILL_DIR/examples/voting/"*.sol               contracts/
cp "$SKILL_DIR/examples/voting/"*.test.ts           test/
cp "$SKILL_DIR/examples/sealed-bid-auction/"*.sol   contracts/
cp "$SKILL_DIR/examples/sealed-bid-auction/"*.test.ts test/
cp "$SKILL_DIR/examples/erc7984-token/"*.sol        contracts/
cp "$SKILL_DIR/examples/erc7984-token/"*.test.ts    test/

# 4. Run the test suite
echo "==> Running test suite..."
./node_modules/.bin/hardhat test \
    test/Voting.test.ts \
    test/SealedBidAuction.test.ts \
    test/ConfidentialToken.test.ts

echo ""
echo "==> ✅ Skill validation passed."
