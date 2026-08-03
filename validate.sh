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

# 2b. Force the versions the skill actually declares.
#
# The upstream template pins its own versions (e.g. "@fhevm/solidity": "^0.11.1"),
# and a caret range on a 0.x version does NOT cross the minor — ^0.11.1 resolves
# to 0.11.x and can never install 0.13.1. Without this step the suite validates
# the TEMPLATE's pins, not the skill's, and a green run would say nothing about
# the versions AGENTS.md advertises.
#
# Keep these in sync with the pinned versions table in AGENTS.md.
FHEVM_SOLIDITY_VERSION="0.11.1"
OZ_CONFIDENTIAL_VERSION="0.5.1"

echo "==> Pinning skill-declared versions (@fhevm/solidity@${FHEVM_SOLIDITY_VERSION}, @openzeppelin/confidential-contracts@${OZ_CONFIDENTIAL_VERSION})..."
npm install --save-exact \
    "@fhevm/solidity@${FHEVM_SOLIDITY_VERSION}" \
    "@openzeppelin/confidential-contracts@${OZ_CONFIDENTIAL_VERSION}" \
    @openzeppelin/contracts \
    --prefer-offline --no-audit --no-fund

# Fail loudly if npm silently resolved something else (peer conflicts, overrides).
ACTUAL_SOLIDITY="$(node -p "require('./node_modules/@fhevm/solidity/package.json').version")"
ACTUAL_OZ="$(node -p "require('./node_modules/@openzeppelin/confidential-contracts/package.json').version")"
echo "==> Resolved @fhevm/solidity:                    $ACTUAL_SOLIDITY"
echo "==> Resolved @openzeppelin/confidential-contracts: $ACTUAL_OZ"

if [ "$ACTUAL_SOLIDITY" != "$FHEVM_SOLIDITY_VERSION" ] || [ "$ACTUAL_OZ" != "$OZ_CONFIDENTIAL_VERSION" ]; then
    echo "==> ❌ Installed versions do not match the skill's declared pins." >&2
    echo "    Expected @fhevm/solidity@${FHEVM_SOLIDITY_VERSION} and @openzeppelin/confidential-contracts@${OZ_CONFIDENTIAL_VERSION}." >&2
    echo "    Validation would not be testing what the skill claims. Aborting." >&2
    exit 1
fi

# 2c. Make the run hermetic.
#
# The template resolves accounts via `vars.get("MNEMONIC", "<valid default>")`.
# `vars.get` reads Hardhat's GLOBAL variable store (~/Library/Preferences/
# hardhat-nodejs on macOS), so a MNEMONIC saved for unrelated work overrides the
# template's working default and fails with "Invalid mnemonic" before any test
# runs. Pin the well-known test phrase for this process only — this neither reads
# nor modifies the developer's stored variables.
export HARDHAT_VAR_MNEMONIC="test test test test test test test test test test test junk"
export HARDHAT_VAR_INFURA_API_KEY="${HARDHAT_VAR_INFURA_API_KEY:-zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz}"

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
