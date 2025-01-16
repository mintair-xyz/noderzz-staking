pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract StakingV1 is
    Initializable,
    Ownable2StepUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    IERC20 public stakingToken;
    uint256 public lockPeriod;
    uint256 public REWARD_RATE;
    uint256 public constant REWARD_PRECISION = 1e12;

    struct Stake {
        uint256 amount;
        uint256 timestamp;
        uint256 rewardDebt;
    }

    mapping(address => Stake[]) public userStakes;
    mapping(address => uint256) public unclaimedRewards;

    event Staked(address indexed user, uint256 amount, uint256 stakeId);
    event Withdrawn(address indexed user, uint256 amount, uint256 stakeId);
    event RewardsClaimed(address indexed user, uint256 amount);
    event Paused(address account);
    event Unpaused(address account);

    bool public paused;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _stakingToken) public initializer {
        require(_stakingToken != address(0), "Invalid staking token address");
        __Ownable2Step_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        stakingToken = IERC20(_stakingToken);
        REWARD_RATE = 25;
        lockPeriod = 1 weeks;
        paused = false;
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    function pause() external onlyOwner {
        require(!paused, "Contract is already paused");
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        require(paused, "Contract is not paused");
        paused = false;
        emit Unpaused(msg.sender);
    }

    function stake(uint256 _amount) external nonReentrant whenNotPaused {
        require(_amount > 0, "Cannot stake 0");

        _updateRewards(msg.sender);

        stakingToken.safeTransferFrom(msg.sender, address(this), _amount);

        userStakes[msg.sender].push(
            Stake({amount: _amount, timestamp: block.timestamp, rewardDebt: 0})
        );

        emit Staked(msg.sender, _amount, userStakes[msg.sender].length - 1);
    }

    function _calculateRewards(
        uint256 _amount,
        uint256 _duration
    ) internal view returns (uint256) {
        uint256 preciseAmount = _amount * REWARD_PRECISION;
        uint256 annualRate = (REWARD_RATE * REWARD_PRECISION) / 100;
        uint256 rewards = (preciseAmount * annualRate * _duration) /
            (365 days * REWARD_PRECISION);
        return rewards / REWARD_PRECISION;
    }

    function _updateRewards(address _user) internal {
        Stake[] storage stakes = userStakes[_user];

        for (uint256 i = 0; i < stakes.length; i++) {
            Stake storage stake = stakes[i];
            if (stake.amount > 0 && block.timestamp > stake.timestamp) {
                uint256 timeElapsed = block.timestamp - stake.timestamp;
                uint256 rewards = _calculateRewards(stake.amount, timeElapsed);
                uint256 newRewards = rewards - stake.rewardDebt;
                if (newRewards > 0) {
                    unclaimedRewards[_user] += newRewards;
                    stake.rewardDebt = rewards;
                }
            }
        }
    }

    function claimRewards() external nonReentrant whenNotPaused {
        _updateRewards(msg.sender);
        uint256 rewards = unclaimedRewards[msg.sender];
        require(rewards / REWARD_PRECISION > 0, "No rewards to claim");

        unclaimedRewards[msg.sender] = 0;
        stakingToken.safeTransfer(msg.sender, rewards);

        emit RewardsClaimed(msg.sender, rewards);
    }

    function getUserAccruedRewards(
        address _user
    ) external view returns (uint256) {
        uint256 pendingRewards = unclaimedRewards[_user];
        Stake[] storage stakes = userStakes[_user];

        for (uint256 i = 0; i < stakes.length; i++) {
            Stake storage stake = stakes[i];
            if (stake.amount > 0) {
                uint256 timeElapsed = block.timestamp - stake.timestamp;
                uint256 rewards = _calculateRewards(stake.amount, timeElapsed);
                pendingRewards += (rewards - stake.rewardDebt);
            }
        }

        return pendingRewards;
    }

    function withdraw(
        uint256[] calldata _stakeIds,
        uint256 _totalAmount
    ) external nonReentrant whenNotPaused {
        require(_stakeIds.length <= 50, "Batch size too large");
        require(_stakeIds.length > 0, "No stake IDs provided");
        require(_totalAmount > 0, "Cannot withdraw 0");

        _updateRewards(msg.sender);

        uint256 remainingAmount = _totalAmount;
        bool[] memory processedIds = new bool[](_stakeIds.length);

        for (uint256 i = 0; i < _stakeIds.length && remainingAmount > 0; i++) {
            uint256 stakeId = _stakeIds[i];
            require(!processedIds[stakeId], "Duplicate stake ID");
            processedIds[stakeId] = true;

            require(
                stakeId < userStakes[msg.sender].length,
                "Invalid stake ID"
            );

            Stake storage userStake = userStakes[msg.sender][stakeId];
            require(userStake.amount > 0, "Stake already withdrawn");
            require(
                block.timestamp >= userStake.timestamp + lockPeriod,
                "Lock period not ended"
            );

            uint256 amountToWithdraw = remainingAmount > userStake.amount
                ? userStake.amount
                : remainingAmount;

            userStake.amount = userStake.amount - amountToWithdraw;
            remainingAmount -= amountToWithdraw;

            emit Withdrawn(msg.sender, amountToWithdraw, stakeId);
        }

        require(remainingAmount == 0, "Insufficient staked balance");

        stakingToken.safeTransfer(msg.sender, _totalAmount);
    }

    function getStakeInfo(
        address _staker,
        uint256 _stakeId
    ) external view returns (uint256 amount, uint256 timestamp) {
        require(_stakeId < userStakes[_staker].length, "Invalid stake ID");
        Stake memory stake = userStakes[_staker][_stakeId];
        return (stake.amount, stake.timestamp);
    }

    function getAllStakes(
        address _staker
    ) external view returns (Stake[] memory) {
        return userStakes[_staker];
    }

    function getActiveStakesCount(
        address _staker
    ) external view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < userStakes[_staker].length; i++) {
            if (userStakes[_staker][i].amount > 0) {
                count++;
            }
        }
        return count;
    }

    function canWithdraw(
        address _staker,
        uint256 _stakeId
    ) external view returns (bool) {
        if (_stakeId >= userStakes[_staker].length) return false;

        Stake memory stake = userStakes[_staker][_stakeId];
        return
            stake.amount > 0 && block.timestamp >= stake.timestamp + lockPeriod;
    }

    function updateLockPeriod(uint256 _newLockPeriod) external onlyOwner {
        lockPeriod = _newLockPeriod;
    }

    function updateRewardRate(uint256 _newRewardRate) external onlyOwner {
        require(_newRewardRate > 0, "Reward rate must be greater than 0");
        REWARD_RATE = _newRewardRate;
    }
}
