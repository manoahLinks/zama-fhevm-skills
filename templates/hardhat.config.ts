// Copy to your project root as hardhat.config.ts.
// Mirrors the structure of the official fhevm-hardhat-template.

import "@fhevm/hardhat-plugin";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-network-helpers";
import "@nomicfoundation/hardhat-verify";
import "@typechain/hardhat";
import "hardhat-deploy";
import "hardhat-gas-reporter";
import "solidity-coverage";

import type { HardhatUserConfig } from "hardhat/config";
import { vars } from "hardhat/config";

const MNEMONIC: string = vars.get(
    "MNEMONIC",
    "test test test test test test test test test test test junk"
);
const INFURA_API_KEY: string = vars.get("INFURA_API_KEY", "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz");
const ETHERSCAN_API_KEY: string = vars.get("ETHERSCAN_API_KEY", "");

const config: HardhatUserConfig = {
    defaultNetwork: "hardhat",
    namedAccounts: {
        deployer: 0
    },
    etherscan: {
        apiKey: {
            sepolia: ETHERSCAN_API_KEY
        }
    },
    networks: {
        hardhat: {
            accounts: { mnemonic: MNEMONIC },
            chainId: 31337
        },
        sepolia: {
            accounts: {
                mnemonic: MNEMONIC,
                path: "m/44'/60'/0'/0/",
                count: 10
            },
            chainId: 11155111,
            url: `https://sepolia.infura.io/v3/${INFURA_API_KEY}`
        }
    },
    paths: {
        sources: "./contracts",
        tests: "./test",
        artifacts: "./artifacts",
        cache: "./cache"
    },
    solidity: {
        version: "0.8.27",
        settings: {
            metadata: { bytecodeHash: "none" },
            optimizer: { enabled: true, runs: 800 },
            evmVersion: "cancun"
        }
    },
    typechain: {
        outDir: "types",
        target: "ethers-v6"
    },
    mocha: {
        timeout: 120_000
    }
};

export default config;
