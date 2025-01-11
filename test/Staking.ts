const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("StakingV1", function () {
    let StakingV1;
    let stakingContract;
    let tokenContract;
    let owner;
    let user1;
    let user2;
    const WEEK = 7 * 24 * 60 * 60; // 1 week in seconds

    beforeEach(async function () {
        // Deploy mock ERC20 token
        const MockToken = await ethers.getContractFactory("MockERC20");
        tokenContract = await MockToken.deploy("Mock Token", "MTK");
        await tokenContract.deployed();

        // Deploy staking contract
        StakingV1 = await ethers.getContractFactory("StakingV1");
        stakingContract = await upgrades.deployProxy(StakingV1, [tokenContract.address]);
        await stakingContract.deployed();

        [owner, user1, user2] = await ethers.getSigners();

        // Mint tokens to users
        await tokenContract.mint(user1.address, ethers.utils.parseEther("1000"));
        await tokenContract.mint(user2.address, ethers.utils.parseEther("1000"));

        // Approve staking contract
        await tokenContract.connect(user1).approve(stakingContract.address, ethers.constants.MaxUint256);
        await tokenContract.connect(user2).approve(stakingContract.address, ethers.constants.MaxUint256);
    });

    describe("Initialization", function () {
        it("Should initialize with correct token and lock period", async function () {
            expect(await stakingContract.stakingToken()).to.equal(tokenContract.address);
            expect(await stakingContract.lockPeriod()).to.equal(WEEK);
        });
    });

    describe("Staking", function () {
        it("Should allow multiple stakes from the same user", async function () {
            const amount1 = ethers.utils.parseEther("100");
            const amount2 = ethers.utils.parseEther("200");

            await stakingContract.connect(user1).stake(amount1);
            await stakingContract.connect(user1).stake(amount2);

            const stakes = await stakingContract.getAllStakes(user1.address);
            expect(stakes.length).to.equal(2);
            expect(stakes[0].amount).to.equal(amount1);
            expect(stakes[1].amount).to.equal(amount2);
        });

        it("Should emit Staked event with correct stake ID", async function () {
            const amount = ethers.utils.parseEther("100");

            await expect(stakingContract.connect(user1).stake(amount))
                .to.emit(stakingContract, "Staked")
                .withArgs(user1.address, amount, 0);

            await expect(stakingContract.connect(user1).stake(amount))
                .to.emit(stakingContract, "Staked")
                .withArgs(user1.address, amount, 1);
        });

        it("Should reject zero amount stakes", async function () {
            await expect(stakingContract.connect(user1).stake(0))
                .to.be.revertedWith("Cannot stake 0");
        });
    });

    describe("Withdrawal", function () {
        beforeEach(async function () {
            await stakingContract.connect(user1).stake(ethers.utils.parseEther("100"));
            await stakingContract.connect(user1).stake(ethers.utils.parseEther("200"));
        });

        it("Should not allow withdrawal before lock period", async function () {
            await expect(stakingContract.connect(user1).withdraw(0))
                .to.be.revertedWith("Lock period not ended");
        });

        it("Should allow withdrawal after lock period", async function () {
            await time.increase(WEEK);

            const initialBalance = await tokenContract.balanceOf(user1.address);
            await stakingContract.connect(user1).withdraw(0);
            const finalBalance = await tokenContract.balanceOf(user1.address);

            expect(finalBalance.sub(initialBalance)).to.equal(ethers.utils.parseEther("100"));
        });

        it("Should not allow double withdrawal", async function () {
            await time.increase(WEEK);
            await stakingContract.connect(user1).withdraw(0);

            await expect(stakingContract.connect(user1).withdraw(0))
                .to.be.revertedWith("Stake already withdrawn");
        });

        it("Should reject invalid stake ID", async function () {
            await expect(stakingContract.connect(user1).withdraw(99))
                .to.be.revertedWith("Invalid stake ID");
        });
    });

    describe("View Functions", function () {
        beforeEach(async function () {
            await stakingContract.connect(user1).stake(ethers.utils.parseEther("100"));
            await stakingContract.connect(user1).stake(ethers.utils.parseEther("200"));
        });

        it("Should return correct stake info", async function () {
            const [amount, timestamp] = await stakingContract.getStakeInfo(user1.address, 0);
            expect(amount).to.equal(ethers.utils.parseEther("100"));
        });

        it("Should return correct active stakes count", async function () {
            expect(await stakingContract.getActiveStakesCount(user1.address)).to.equal(2);

            await time.increase(WEEK);
            await stakingContract.connect(user1).withdraw(0);

            expect(await stakingContract.getActiveStakesCount(user1.address)).to.equal(1);
        });

        it("Should return all stakes", async function () {
            const stakes = await stakingContract.getAllStakes(user1.address);
            expect(stakes.length).to.equal(2);
            expect(stakes[0].amount).to.equal(ethers.utils.parseEther("100"));
            expect(stakes[1].amount).to.equal(ethers.utils.parseEther("200"));
        });

        it("Should correctly check if stake can be withdrawn", async function () {
            expect(await stakingContract.canWithdraw(user1.address, 0)).to.be.false;

            await time.increase(WEEK);
            expect(await stakingContract.canWithdraw(user1.address, 0)).to.be.true;

            await stakingContract.connect(user1).withdraw(0);
            expect(await stakingContract.canWithdraw(user1.address, 0)).to.be.false;
        });
    });

    describe("Edge Cases", function () {
        it("Should handle multiple users with multiple stakes", async function () {
            await stakingContract.connect(user1).stake(ethers.utils.parseEther("100"));
            await stakingContract.connect(user2).stake(ethers.utils.parseEther("200"));
            await stakingContract.connect(user1).stake(ethers.utils.parseEther("300"));

            const user1Stakes = await stakingContract.getAllStakes(user1.address);
            const user2Stakes = await stakingContract.getAllStakes(user2.address);

            expect(user1Stakes.length).to.equal(2);
            expect(user2Stakes.length).to.equal(1);
        });

        it("Should maintain correct state after multiple operations", async function () {
            await stakingContract.connect(user1).stake(ethers.utils.parseEther("100"));
            await stakingContract.connect(user1).stake(ethers.utils.parseEther("200"));
            
            await time.increase(WEEK);
            await stakingContract.connect(user1).withdraw(0);
            
            await stakingContract.connect(user1).stake(ethers.utils.parseEther("300"));
            
            const stakes = await stakingContract.getAllStakes(user1.address);
            expect(stakes.length).to.equal(3);
            expect(stakes[0].amount).to.equal(0); // Withdrawn
            expect(stakes[1].amount).to.equal(ethers.utils.parseEther("200"));
            expect(stakes[2].amount).to.equal(ethers.utils.parseEther("300"));
        });
    });
});