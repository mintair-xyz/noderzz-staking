import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import "@nomicfoundation/hardhat-ignition";

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    hardhat: {
      chainId: 1337,
    },
  },
};

export default config;
