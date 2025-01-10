import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { StakingV1, MockERC20 } from "../typechain-types";
import { Signer } from "ethers";

describe("StakingV1", function () {
  let staking: StakingV1;
  let mockToken: MockERC20;
  let owner: Signer;
  let staker1: Signer;
  let staker2: Signer;

  async function deployStakingFixture() {
    const [owner, staker1, staker2] = await ethers.getSigners();

    const MockToken = await ethers.getContractFactory("MockERC20");
    const mockToken = await MockToken.deploy("Mock Token", "MTK");
    await mockToken.waitForDeployment();

    const Staking = await ethers.getContractFactory("StakingV1");
    const staking = await upgrades.deployProxy(Staking as any, [
      mockToken.target,
    ]);
    await staking.waitForDeployment();

    const mintAmount = ethers.parseEther("1000");
    await mockToken.mint(staker1.address, mintAmount);
    await mockToken.mint(staker2.address, mintAmount);

    await mockToken.connect(staker1).approve(staking.target, mintAmount);
    await mockToken.connect(staker2).approve(staking.target, mintAmount);

    return { staking, mockToken, owner, staker1, staker2, mintAmount };
  }

  describe("Deployment", function () {
    it("Should deploy with correct initial state", async function () {
      const { staking, mockToken } = await loadFixture(deployStakingFixture);

      expect(await staking.stakingToken()).to.equal(mockToken.target);
      expect(await staking.lockPeriod()).to.equal(7 * 24 * 60 * 60);
    });
  });

  describe("Staking Operations", function () {
    it("Should allow staking tokens and emit event", async function () {
      const { staking, staker1, mintAmount } = await loadFixture(
        deployStakingFixture
      );
      const stakeAmount = ethers.parseEther("100");

      await expect(staking.connect(staker1).stake(stakeAmount))
        .to.emit(staking, "Staked")
        .withArgs(staker1.address, stakeAmount);

      const stakeInfo = await staking.getStakeInfo(staker1.address);
      expect(stakeInfo[0]).to.equal(stakeAmount);
    });

    it("Should track stake timestamp correctly", async function () {
      const { staking, staker1 } = await loadFixture(deployStakingFixture);
      const stakeAmount = ethers.parseEther("100");

      const txn = await staking.connect(staker1).stake(stakeAmount);
      const receipt = await txn.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);

      const stakeInfo = await staking.getStakeInfo(staker1.address);
      expect(stakeInfo[1]).to.equal(block!.timestamp);
    });

    it("Should prevent staking zero amount", async function () {
      const { staking, staker1 } = await loadFixture(deployStakingFixture);
      await expect(staking.connect(staker1).stake(0)).to.be.revertedWith(
        "Cannot stake 0"
      );
    });

    it("Should prevent multiple stakes from same address", async function () {
      const { staking, staker1 } = await loadFixture(deployStakingFixture);
      const stakeAmount = ethers.parseEther("100");

      await staking.connect(staker1).stake(stakeAmount);
      await expect(
        staking.connect(staker1).stake(stakeAmount)
      ).to.be.revertedWith("Already staked");
    });
  });

  describe("Withdrawal Operations", function () {
    it("Should prevent early withdrawal", async function () {
      const { staking, staker1 } = await loadFixture(deployStakingFixture);
      const stakeAmount = ethers.parseEther("100");

      await staking.connect(staker1).stake(stakeAmount);
      await expect(staking.connect(staker1).withdraw()).to.be.revertedWith(
        "Lock period not ended"
      );
    });

    it("Should allow withdrawal after lock period", async function () {
      const { staking, staker1, mockToken } = await loadFixture(
        deployStakingFixture
      );
      const stakeAmount = ethers.parseEther("100");

      await staking.connect(staker1).stake(stakeAmount);
      await time.increase(7 * 24 * 60 * 60 + 1); // 1 week + 1 second

      const initialBalance = await mockToken.balanceOf(staker1.address);

      await expect(staking.connect(staker1).withdraw())
        .to.emit(staking, "Withdrawn")
        .withArgs(staker1.address, stakeAmount);

      const finalBalance = await mockToken.balanceOf(staker1.address);
      expect(finalBalance - initialBalance).to.equal(stakeAmount);
    });

    it("Should prevent withdrawal with no stake", async function () {
      const { staking, staker1 } = await loadFixture(deployStakingFixture);
      await expect(staking.connect(staker1).withdraw()).to.be.revertedWith(
        "No stake found"
      );
    });
  });

  describe("View Functions", function () {
    it("Should correctly report canWithdraw status", async function () {
      const { staking, staker1 } = await loadFixture(deployStakingFixture);
      const stakeAmount = ethers.parseEther("100");

      await staking.connect(staker1).stake(stakeAmount);
      expect(await staking.canWithdraw(staker1.address)).to.be.false;

      await time.increase(7 * 24 * 60 * 60 + 1);
      expect(await staking.canWithdraw(staker1.address)).to.be.true;
    });

    it("Should return correct stake info", async function () {
      const { staking, staker1 } = await loadFixture(deployStakingFixture);
      const stakeAmount = ethers.parseEther("100");

      await staking.connect(staker1).stake(stakeAmount);
      const [amount, timestamp] = await staking.getStakeInfo(staker1.address);

      expect(amount).to.equal(stakeAmount);
      expect(timestamp).to.be.gt(0);
    });
  });
});
