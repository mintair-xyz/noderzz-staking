import { Etherscan } from './node_modules/@nomicfoundation/hardhat-verify/src/internal/etherscan';
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import "@nomicfoundation/hardhat-ignition";
import "dotenv/config";

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    baseSepolia: {
      url: "https://base-sepolia.gateway.tenderly.co",
      accounts: [process.env.PRIVATE_KEY!],
    },
  },
  etherscan: {
    apiKey: {
      baseSepolia: process.env.BASESCAN_API_KEY!,
    },
  },
  sourcify: {
    enabled: false,
  },
};

export default config;
