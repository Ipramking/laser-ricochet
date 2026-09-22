// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// Canonical Chain.wtf casino game interface.
// Verbatim from the Chain Casino SDK (simulator/contracts/ICasinoGameV2.sol).
// Phases, context, and step results are fixed by the platform — do not modify.

enum SessionPhase {
  NONE,
  WAITING_RANDOMNESS,
  WAITING_PLAYER_ACTION,
  SETTLED,
  FORFEITED,
  CANCELLED
}

struct SessionContext {
  uint256 sessionId;
  address player;
  address vault;
  uint256 wagerBase;
  uint256 escrowedStake;
  uint256 reservedProfit;
  uint32 step;
  bytes gameData;
  bytes gameState;
}

struct StepResult {
  bytes newGameState;
  int256 escrowDelta;
  int256 reservedProfitDelta;
  SessionPhase nextPhase;
  bool requestRandomnessNow;
  uint256 payout;
}

interface ICasinoGameV2 {
  function quoteCaps(
    uint256 wager,
    bytes calldata gameData
  ) external view returns (uint256 maxEscrowStake, uint256 maxReservedProfit);

  /// @notice Risk parameters for portfolio VaR. `probabilityWad` is the top-tier win probability in WAD (1e18 = 100%).
  ///         `bodyVarianceScaled` is the variance of this bet's payout with the top tier removed, per bet, in the
  ///         reserve's scaled units (token^2 * 1e18, i.e. wei^2 * 1e18).
  function quoteRiskParams(
    uint256 wager,
    bytes calldata gameData
  )
    external
    view
    returns (
      uint256 maxPayout,
      uint256 probabilityWad,
      uint256 expectedPayout,
      uint256 bodyVarianceScaled
    );

  function onSessionStart(
    SessionContext calldata ctx
  ) external view returns (StepResult memory);

  function onPlayerAction(
    SessionContext calldata ctx,
    bytes calldata actionData
  ) external view returns (StepResult memory);

  function onRandomness(
    SessionContext calldata ctx,
    bytes32 randomness
  ) external view returns (StepResult memory);

  /// @notice Current cash-out value of an in-progress session; return 0 when nothing is cashable mid-round.
  function quoteForfeitPayout(SessionContext calldata ctx) external view returns (uint256 cashoutValue);
}
