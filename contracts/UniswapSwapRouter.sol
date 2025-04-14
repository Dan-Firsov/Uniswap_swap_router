// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@uniswap/v3-periphery/contracts/interfaces/IQuoterV2.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/swap-router-contracts/contracts/interfaces/IV3SwapRouter.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "hardhat/console.sol";

contract UniswapSwapRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address constant V2_FACTORY = 0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6;
    address constant V2_ROUTER = 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24;
    address constant V3_ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481;
    address constant V3_QUOTER = 0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a;

    uint24[4] private V3_FEES = [100, 500, 3000, 10000];
    uint16 private constant SLIPPAGE_100 = 10000;
    uint16 private constant DEADLINE_OFFSET = 5 minutes;
    enum PoolType {
        V2,
        V3
    }

    error InvalidToken();
    error InvalidAmountIn();
    error InvalidMinAmountOut();
    error IdenticalTokens();
    error SlippageTooHigh();
    error AllQuotesFailed();

    event V2QuoteError(
        address indexed tokenIn,
        address indexed tokenOut,
        string reason
    );
    event V3QuoteError(
        address indexed tokenIn,
        address indexed tokenOut,
        uint24 fee,
        string reason
    );
    event minAmountOutCalculated(
        uint256 minAmountOut,
        PoolType poolId,
        uint24 fee
    );
    event swapExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint24 fee
    );

    modifier validInput(uint256 amountIn, uint16 slippageBps) {
        if (amountIn == 0) {
            revert InvalidAmountIn();
        }
        if (slippageBps >= SLIPPAGE_100) {
            revert SlippageTooHigh();
        }
        _;
    }

    modifier validToken(address tokenIn, address tokenOut) {
        if (tokenIn == address(0) || tokenOut == address(0)) {
            revert InvalidToken();
        }
        if (tokenIn == tokenOut) {
            revert IdenticalTokens();
        }
        _;
    }

    function getMinAmountOut(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint16 slippageBps
    )
        public
        validToken(tokenIn, tokenOut)
        validInput(amountIn, slippageBps)
        returns (uint256 minAmountOut, PoolType poolId, uint24 fee)
    {
        uint256 amountOutV2 = _getV2Quote(tokenIn, tokenOut, amountIn);
        (uint256 amountOutV3, uint24 bestFeeV3) = _getV3Quote(
            tokenIn,
            tokenOut,
            amountIn
        );

        if (amountOutV2 == 0 && amountOutV3 == 0) {
            revert AllQuotesFailed();
        }

        if (amountOutV3 > amountOutV2) {
            poolId = PoolType.V3;
            fee = bestFeeV3;
            minAmountOut =
                (amountOutV3 * (SLIPPAGE_100 - slippageBps)) /
                SLIPPAGE_100;
        } else {
            poolId = PoolType.V2;
            fee = 0;
            minAmountOut =
                (amountOutV2 * (SLIPPAGE_100 - slippageBps)) /
                SLIPPAGE_100;
        }

        emit minAmountOutCalculated(minAmountOut, poolId, fee);
    }

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint16 slippageBps
    )
        external
        nonReentrant
        validToken(tokenIn, tokenOut)
        validInput(amountIn, slippageBps)
    {
        (uint256 minAmountOut, PoolType poolId, uint24 fee) = getMinAmountOut(
            tokenIn,
            tokenOut,
            amountIn,
            slippageBps
        );

        if (minAmountOut <= 0) {
            revert InvalidMinAmountOut();
        }

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        if (poolId == PoolType.V2) {
            _swapViaV2(tokenIn, tokenOut, amountIn, minAmountOut);
        } else {
            _swapViaV3(tokenIn, tokenOut, amountIn, minAmountOut, fee);
        }

        emit swapExecuted(tokenIn, tokenOut, amountIn, minAmountOut, fee);
    }

    function _getV2Quote(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) private returns (uint256 amountOutV2) {
        address pair = IUniswapV2Factory(V2_FACTORY).getPair(tokenIn, tokenOut);

        if (pair == address(0)) {
            emit V2QuoteError(tokenIn, tokenOut, "Not found v2 pool");
            return 0;
        }
        try
            IUniswapV2Router02(V2_ROUTER).getAmountsOut(
                amountIn,
                _createPath(tokenIn, tokenOut)
            )
        returns (uint[] memory amounts) {
            amountOutV2 = amounts[1];
            if (amountOutV2 == 0) {
                emit V2QuoteError(tokenIn, tokenOut, "Zero liquidity");
                return 0;
            }
        } catch Error(string memory reason) {
            emit V2QuoteError(tokenIn, tokenOut, reason);
            return (0);
        } catch {
            emit V2QuoteError(tokenIn, tokenOut, "Unknown error");
        }
    }

    function _getV3Quote(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) private returns (uint256 bestAmountOutV3, uint24 bestFeeV3) {
        for (uint i = 0; i < V3_FEES.length; i++) {
            try
                IQuoterV2(V3_QUOTER).quoteExactInputSingle(
                    IQuoterV2.QuoteExactInputSingleParams({
                        tokenIn: tokenIn,
                        tokenOut: tokenOut,
                        amountIn: amountIn,
                        fee: V3_FEES[i],
                        sqrtPriceLimitX96: 0
                    })
                )
            returns (uint amountOut, uint160, uint32, uint256) {
                if (amountOut == 0) {
                    emit V3QuoteError(
                        tokenIn,
                        tokenOut,
                        V3_FEES[i],
                        "Zero liquidity"
                    );
                    continue;
                }
                if (amountOut > bestAmountOutV3) {
                    bestAmountOutV3 = amountOut;
                    bestFeeV3 = V3_FEES[i];
                }
            } catch Error(string memory reason) {
                emit V3QuoteError(tokenIn, tokenOut, V3_FEES[i], reason);
                continue;
            } catch {
                emit V3QuoteError(
                    tokenIn,
                    tokenOut,
                    V3_FEES[i],
                    "Unknown error"
                );
                continue;
            }
        }
    }

    function _swapViaV2(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut
    ) internal {
        IERC20(tokenIn).safeIncreaseAllowance(V2_ROUTER, amountIn);
        IUniswapV2Router02(V2_ROUTER).swapExactTokensForTokens(
            amountIn,
            minAmountOut,
            _createPath(tokenIn, tokenOut),
            msg.sender,
            block.timestamp + DEADLINE_OFFSET
        );
    }

    function _swapViaV3(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint24 fee
    ) internal {
        IERC20(tokenIn).safeIncreaseAllowance(V3_ROUTER, amountIn);
        IV3SwapRouter.ExactInputSingleParams memory params = IV3SwapRouter
            .ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: msg.sender,
                amountIn: amountIn,
                amountOutMinimum: minAmountOut,
                sqrtPriceLimitX96: 0
            });

        try IV3SwapRouter(V3_ROUTER).exactInputSingle(params) {} catch Error(
            string memory reason
        ) {
            revert(reason);
        } catch {
            revert("Swap V3 failed with unknown error");
        }
    }

    function _createPath(
        address tokenA,
        address tokenB
    ) private pure returns (address[] memory) {
        address[] memory path = new address[](2);
        path[0] = tokenA;
        path[1] = tokenB;
        return path;
    }
}
