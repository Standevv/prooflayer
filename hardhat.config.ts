import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { config as loadEnv } from "dotenv";
import { configVariable, defineConfig } from "hardhat/config";

loadEnv({ quiet: true });

const DEFAULT_XLAYER_TESTNET_RPC_URL = "https://testrpc.xlayer.tech/terigon";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
    xlayerTestnet: {
      type: "http",
      chainType: "generic",
      chainId: 1952,
      url: process.env.XLAYER_TESTNET_RPC_URL || DEFAULT_XLAYER_TESTNET_RPC_URL,
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
  },
});
