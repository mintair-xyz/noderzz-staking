import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const StakingModule = buildModule("StakingModule", (m) => {
  const proxyAdminOwner = m.getAccount(0);

  const stakingTokenAddress = "0x0000000000000000000000000000000000000000";

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
