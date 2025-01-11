import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const StakingModule = buildModule("StakingModule", (m) => {
  const proxyAdminOwner = m.getAccount(0);

  const stakingTokenAddress = "0xc8712476329B8117d2B4A7B19BdBf2e2Ca4CD500";

  const stakingImplementation = m.contract("StakingV1", []);

  const stakingProxy = m.contract("TransparentUpgradeableProxy", [
    stakingImplementation,
    proxyAdminOwner,
    "0x",
  ]);

  const staking = m.contractAt("StakingV1", stakingProxy, {
    id: "StakingProxy",
  });

  m.call(staking, "initialize", [stakingTokenAddress]);

  return { staking, stakingProxy };
});

export default StakingModule;
