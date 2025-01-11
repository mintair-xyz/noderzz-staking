import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const MockERC20Module = buildModule("MockERC20Module", (m) => {
  const mockToken = m.contract("MockERC20", ["Mock Token", "MTK"]);

  return { mockToken };
});

export default MockERC20Module;
