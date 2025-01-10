// SPDX-License-Identifier: MIT
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

    mapping(address => Stake) public stakes;

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);

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
        require(stakes[msg.sender].amount == 0, "Already staked");

        stakingToken.safeTransferFrom(msg.sender, address(this), _amount);

        stakes[msg.sender] = Stake({
            amount: _amount,
            timestamp: block.timestamp
        });

        emit Staked(msg.sender, _amount);
    }

    function withdraw() external nonReentrant {
        Stake storage userStake = stakes[msg.sender];
        require(userStake.amount > 0, "No stake found");
        require(
            block.timestamp >= userStake.timestamp + lockPeriod,
            "Lock period not ended"
        );

        uint256 amount = userStake.amount;
        delete stakes[msg.sender];

        stakingToken.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    function getStakeInfo(
        address _staker
    ) external view returns (uint256 amount, uint256 timestamp) {
        Stake memory stake = stakes[_staker];
        return (stake.amount, stake.timestamp);
    }

    function canWithdraw(address _staker) external view returns (bool) {
        Stake memory stake = stakes[_staker];
        return
            stake.amount > 0 && block.timestamp >= stake.timestamp + lockPeriod;
    }
}
