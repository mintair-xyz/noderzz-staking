pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract StakingV1 is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;

    IERC20 public stakingToken;
    uint256 public lockPeriod;

    struct Stake {
        uint256 amount;
        uint256 timestamp;
    }

    mapping(address => Stake[]) public userStakes;

    event Staked(address indexed user, uint256 amount, uint256 stakeId);
    event Withdrawn(address indexed user, uint256 amount, uint256 stakeId);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _stakingToken) public initializer {
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        stakingToken = IERC20(_stakingToken);
        lockPeriod = 1 weeks;
    }

    function stake(uint256 _amount) external nonReentrant {
        require(_amount > 0, "Cannot stake 0");

        stakingToken.safeTransferFrom(msg.sender, address(this), _amount);

        userStakes[msg.sender].push(
            Stake({amount: _amount, timestamp: block.timestamp})
        );

        emit Staked(msg.sender, _amount, userStakes[msg.sender].length - 1);
    }

    function withdraw(
        uint256[] calldata _stakeIds,
        uint256 _totalAmount
    ) external nonReentrant {
        require(_stakeIds.length > 0, "No stake IDs provided");
        require(_totalAmount > 0, "Cannot withdraw 0");

        uint256 remainingAmount = _totalAmount;

        for (uint256 i = 0; i < _stakeIds.length && remainingAmount > 0; i++) {
            uint256 stakeId = _stakeIds[i];
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
}
