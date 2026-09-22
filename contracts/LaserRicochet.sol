// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "./ICasinoGameV2.sol";

/**
 * @title LaserRicochet
 * @notice Chain.wtf casino game: fire a laser into an optical matrix; the VRF word
 *         deterministically settles a payout multiplier. Instant (single-step) game:
 *         onSessionStart requests randomness, onRandomness settles.
 *
 * @dev Stateless / pure. The CasinoGameFacet stores sessions and calls these view
 *      handlers via staticcall. All money math routes through `_payout` / the shared
 *      per-mode constants so quoteCaps, quoteRiskParams, onSessionStart and onRandomness
 *      agree to the wei (see CONTRACT_CONSTRAINTS.md § Payout cap).
 *
 *      The payout distribution below is the measured multiplier distribution of the
 *      calibrated optics engine (src/engine/optics.js, tools/calibrate.js). Each mode's
 *      table evaluates to EXACTLY 9600 bps (96.00% RTP), so on-chain settlement, the
 *      standalone demo paytable, and the declared RTP all agree.
 *
 *      This is a heavy-tail game (top multiplier > 100x at < 0.1% probability), so
 *      quoteRiskParams returns a nonzero `bodyVarianceScaled` as the facet requires.
 */
contract LaserRicochet is ICasinoGameV2 {
    error LaserRicochet__InvalidChannel();
    error LaserRicochet__InvalidMode();
    error LaserRicochet__NoPlayerAction();

    uint256 private constant BPS = 10_000;

    // --- Per-mode worst-case multiplier (top bucket of the payout table), in bps ---
    uint256 private constant MAX_MULT_BPS_STANDARD = 1_831_097;   // 183.1097x
    uint256 private constant MAX_MULT_BPS_OVERCHARGE = 1_960_373; // 196.0373x

    // --- Top-tier (jackpot) win probability, in WAD (1e18 = 100%) ---
    uint256 private constant TOP_PROB_WAD_STANDARD = 200_000_000_000_000;   // 0.02%
    uint256 private constant TOP_PROB_WAD_OVERCHARGE = 400_000_000_000_000; // 0.04%

    // --- Body variance (top tier removed) in multiplier^2, scaled by 1e6 ---
    uint256 private constant VAR_BODY_E6_STANDARD = 6_099_448;   // 6.099448 mult^2
    uint256 private constant VAR_BODY_E6_OVERCHARGE = 5_109_765; // 5.109765 mult^2

    uint256 private constant TARGET_RTP_BPS = 9_600; // 96.00%

    // ------------------------------------------------------------------
    // Risk quoting
    // ------------------------------------------------------------------

    function quoteCaps(
        uint256 wager,
        bytes calldata gameData
    ) external pure override returns (uint256 maxEscrowStake, uint256 maxReservedProfit) {
        (, uint8 mode) = _decodeBet(gameData);
        uint256 maxPay = (wager * _maxMultBps(mode)) / BPS;
        maxEscrowStake = wager; // no mid-session escrow increases
        maxReservedProfit = maxPay > wager ? maxPay - wager : 0;
    }

    function quoteRiskParams(
        uint256 wager,
        bytes calldata gameData
    )
        external
        pure
        override
        returns (
            uint256 maxPayout,
            uint256 probabilityWad,
            uint256 expectedPayout,
            uint256 bodyVarianceScaled
        )
    {
        (, uint8 mode) = _decodeBet(gameData);
        maxPayout = (wager * _maxMultBps(mode)) / BPS;
        probabilityWad = mode == 0 ? TOP_PROB_WAD_STANDARD : TOP_PROB_WAD_OVERCHARGE;
        expectedPayout = (wager * TARGET_RTP_BPS) / BPS;
        // bodyVar_wei^2 = (VAR_BODY_E6 / 1e6) * wager^2 ; scaled to wei^2 * 1e18:
        //   bodyVarianceScaled = VAR_BODY_E6 * wager^2 * 1e12
        uint256 varE6 = mode == 0 ? VAR_BODY_E6_STANDARD : VAR_BODY_E6_OVERCHARGE;
        bodyVarianceScaled = varE6 * wager * wager * 1e12;
    }

    // ------------------------------------------------------------------
    // Step handlers (instant game)
    // ------------------------------------------------------------------

    function onSessionStart(
        SessionContext calldata ctx
    ) external pure override returns (StepResult memory stepResult) {
        (uint8 channel, uint8 mode) = _decodeBet(ctx.gameData);
        uint256 maxPay = (ctx.wagerBase * _maxMultBps(mode)) / BPS;
        uint256 maxReservedProfit = maxPay > ctx.wagerBase ? maxPay - ctx.wagerBase : 0;

        // Opaque state: channel, mode, randomness-not-yet-delivered.
        stepResult.newGameState = abi.encode(channel, mode, bytes32(0), uint256(0));
        stepResult.escrowDelta = 0;
        stepResult.reservedProfitDelta = int256(maxReservedProfit);
        stepResult.nextPhase = SessionPhase.WAITING_RANDOMNESS;
        stepResult.requestRandomnessNow = true;
        stepResult.payout = 0;
    }

    function onPlayerAction(
        SessionContext calldata,
        bytes calldata
    ) external pure override returns (StepResult memory) {
        revert LaserRicochet__NoPlayerAction();
    }

    function onRandomness(
        SessionContext calldata ctx,
        bytes32 randomness
    ) external pure override returns (StepResult memory stepResult) {
        (uint8 channel, uint8 mode) = _decodeBet(ctx.gameData);
        uint256 payoutBps = _payoutBps(mode, randomness, channel);
        uint256 payout = (ctx.wagerBase * payoutBps) / BPS;

        // Encode full outcome so the guest can reproduce the result from committed state.
        stepResult.newGameState = abi.encode(channel, mode, randomness, payoutBps);
        stepResult.escrowDelta = 0;
        stepResult.reservedProfitDelta = 0; // facet releases the reserve at settlement
        stepResult.nextPhase = SessionPhase.SETTLED;
        stepResult.requestRandomnessNow = false;
        stepResult.payout = payout;
    }

    function quoteForfeitPayout(
        SessionContext calldata
    ) external pure override returns (uint256) {
        // No anytime cash-out: the round is a single VRF settlement. Returning a
        // nonzero quote while randomness is unresolved is an adverse-selection exploit.
        return 0;
    }

    // ------------------------------------------------------------------
    // Shared payout math (single source of truth)
    // ------------------------------------------------------------------

    /// @dev Deterministic payout multiplier (bps) from the VRF word. Calibrated so each
    ///      mode's distribution evaluates to exactly 9600 bps (96.00% RTP).
    function _payoutBps(
        uint8 mode,
        bytes32 randomness,
        uint8 channel
    ) internal pure returns (uint256) {
        uint256 roll = uint256(keccak256(abi.encodePacked(randomness, channel, mode))) % BPS;

        if (mode == 0) {
            // Standard Mode (EV = 9600 bps = 96.00% RTP)
            if (roll < 6778) return 0;          // 67.78% 0x
            if (roll < 7138) return 6029;       // 3.60%  ~0.60x
            if (roll < 9794) return 24260;      // 26.56% ~2.43x
            if (roll < 9968) return 83714;      // 1.74%  ~8.37x
            if (roll < 9998) return 372219;     // 0.30%  ~37.2x
            return 1831097;                     // 0.02%  ~183x
        } else {
            // Overcharge Mode (EV = 9600 bps = 96.00% RTP)
            if (roll < 6537) return 0;          // 65.37% 0x
            if (roll < 7218) return 6017;       // 6.81%  ~0.60x
            if (roll < 9819) return 24019;      // 26.01% ~2.40x
            if (roll < 9971) return 81882;      // 1.52%  ~8.19x
            if (roll < 9996) return 365658;     // 0.25%  ~36.6x
            return 1960373;                     // 0.04%  ~196x
        }
    }

    function _maxMultBps(uint8 mode) internal pure returns (uint256) {
        return mode == 0 ? MAX_MULT_BPS_STANDARD : MAX_MULT_BPS_OVERCHARGE;
    }

    function _decodeBet(bytes calldata gameData) internal pure returns (uint8 channel, uint8 mode) {
        (channel, mode) = abi.decode(gameData, (uint8, uint8));
        if (channel > 7) revert LaserRicochet__InvalidChannel();
        if (mode > 1) revert LaserRicochet__InvalidMode();
    }
}
