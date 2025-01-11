import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { StakingV1, MockERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("StakingV1", function () {
  let stakingContract: StakingV1;
  let tokenContract: MockERC20;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  const WEEK = 7 * 24 * 60 * 60;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    const MockToken = await ethers.getContractFactory("MockERC20");
    tokenContract = (await MockToken.deploy("Mock Token", "MTK")) as MockERC20;
    await tokenContract.waitForDeployment();

    const Staking = await ethers.getContractFactory("StakingV1");
    stakingContract = (await upgrades.deployProxy(Staking, [
      await tokenContract.getAddress(),
    ])) as StakingV1;
    await stakingContract.waitForDeployment();

    await tokenContract.mint(user1.address, ethers.parseEther("1000"));
    await tokenContract.mint(user2.address, ethers.parseEther("1000"));

    await tokenContract
      .connect(user1)
      .approve(await stakingContract.getAddress(), ethers.MaxUint256);
    await tokenContract
      .connect(user2)
      .approve(await stakingContract.getAddress(), ethers.MaxUint256);
  });

  describe("Initialization", function () {
    it("Should initialize with correct token and lock period", async function () {
      expect(await stakingContract.stakingToken()).to.equal(
        await tokenContract.getAddress()
      );
      expect(await stakingContract.lockPeriod()).to.equal(WEEK);
    });
  });

  describe("Staking", function () {
    it("Should allow multiple stakes from the same user", async function () {
      const amount1 = ethers.parseEther("100");
      const amount2 = ethers.parseEther("200");

      await stakingContract.connect(user1).stake(amount1);
      await stakingContract.connect(user1).stake(amount2);

      const stakes = await stakingContract.getAllStakes(user1.address);
      expect(stakes.length).to.equal(2);
      expect(stakes[0].amount).to.equal(amount1);
      expect(stakes[1].amount).to.equal(amount2);
    });

    it("Should emit Staked event with correct stake ID", async function () {
      const amount = ethers.parseEther("100");

      await expect(stakingContract.connect(user1).stake(amount))
        .to.emit(stakingContract, "Staked")
        .withArgs(user1.address, amount, 0);

      await expect(stakingContract.connect(user1).stake(amount))
        .to.emit(stakingContract, "Staked")
        .withArgs(user1.address, amount, 1);
    });

    it("Should reject zero amount stakes", async function () {
      await expect(stakingContract.connect(user1).stake(0)).to.be.revertedWith(
        "Cannot stake 0"
      );
    });
  });

  describe("Withdrawal", function () {
    beforeEach(async function () {
      await stakingContract.connect(user1).stake(ethers.parseEther("100"));
      await stakingContract.connect(user1).stake(ethers.parseEther("200"));
    });

    it("Should not allow withdrawal before lock period", async function () {
      await expect(
        stakingContract.connect(user1).withdraw(0)
      ).to.be.revertedWith("Lock period not ended");
    });

    it("Should allow withdrawal after lock period", async function () {
      await time.increase(WEEK);

      const initialBalance = await tokenContract.balanceOf(user1.address);
      await stakingContract.connect(user1).withdraw(0);
      const finalBalance = await tokenContract.balanceOf(user1.address);

      expect(finalBalance - initialBalance).to.equal(ethers.parseEther("100"));
    });

    it("Should not allow double withdrawal", async function () {
      await time.increase(WEEK);
      await stakingContract.connect(user1).withdraw(0);

      await expect(
        stakingContract.connect(user1).withdraw(0)
      ).to.be.revertedWith("Stake already withdrawn");
    });

    it("Should reject invalid stake ID", async function () {
      await expect(
        stakingContract.connect(user1).withdraw(99)
      ).to.be.revertedWith("Invalid stake ID");
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      await stakingContract.connect(user1).stake(ethers.parseEther("100"));
      await stakingContract.connect(user1).stake(ethers.parseEther("200"));
    });

    it("Should return correct stake info", async function () {
      const [amount, timestamp] = await stakingContract.getStakeInfo(
        user1.address,
        0
      );
      expect(amount).to.equal(ethers.parseEther("100"));
      expect(timestamp).to.be.gt(0);
    });

    it("Should return correct active stakes count", async function () {
      expect(
        await stakingContract.getActiveStakesCount(user1.address)
      ).to.equal(2);

      await time.increase(WEEK);
      await stakingContract.connect(user1).withdraw(0);

      expect(
        await stakingContract.getActiveStakesCount(user1.address)
      ).to.equal(1);
    });

    it("Should return all stakes", async function () {
      const stakes = await stakingContract.getAllStakes(user1.address);
      expect(stakes.length).to.equal(2);
      expect(stakes[0].amount).to.equal(ethers.parseEther("100"));
      expect(stakes[1].amount).to.equal(ethers.parseEther("200"));
    });

    it("Should correctly check if stake can be withdrawn", async function () {
      expect(await stakingContract.canWithdraw(user1.address, 0)).to.be.false;

      await time.increase(WEEK);
      expect(await stakingContract.canWithdraw(user1.address, 0)).to.be.true;

      await stakingContract.connect(user1).withdraw(0);
      expect(await stakingContract.canWithdraw(user1.address, 0)).to.be.false;
    });
  });
});
