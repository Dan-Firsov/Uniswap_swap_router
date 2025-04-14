import { expect } from 'chai';
import { deployContractFixture } from './utils/deployContractFixture';
import '@nomicfoundation/hardhat-chai-matchers';
import '@nomicfoundation/hardhat-network-helpers';
import { USDC, WETH, ZERO_ADDRESS } from './utils/constants';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { parseUnits } from 'ethers';

describe('UniswapSwapRouter - Input Validation', function () {
  const SLIPPAGE = 500;
  const AMOUNT_IN = parseUnits('1000', 6);

  let swapRouterContract: any, deployer: any, user: any;

  beforeEach(async function () {
    const fixture = await loadFixture(deployContractFixture);
    swapRouterContract = fixture.swapRouterContract;
    deployer = fixture.deployer;
    user = fixture.user;
  });

  describe('getMinAmountOut function', function () {
    it('Should revert if tokenIn is the zero address', async function () {
      await expect(
        swapRouterContract.getMinAmountOut(
          ZERO_ADDRESS,
          USDC,
          AMOUNT_IN,
          SLIPPAGE,
        ),
      ).to.be.revertedWithCustomError(swapRouterContract, 'InvalidToken');
    });

    it('Should revert if tokenOut is the zero address', async function () {
      await expect(
        swapRouterContract.getMinAmountOut(
          USDC,
          ZERO_ADDRESS,
          AMOUNT_IN,
          SLIPPAGE,
        ),
      ).to.be.revertedWithCustomError(swapRouterContract, 'InvalidToken');
    });

    it('Should revert if tokenIn is equal to tokenOut', async function () {
      await expect(
        swapRouterContract.getMinAmountOut(USDC, USDC, AMOUNT_IN, SLIPPAGE),
      ).to.be.revertedWithCustomError(swapRouterContract, 'IdenticalTokens');
    });

    it('Should revert if amountIn is zero', async function () {
      await expect(
        swapRouterContract.getMinAmountOut(USDC, WETH, 0, SLIPPAGE),
      ).to.be.revertedWithCustomError(swapRouterContract, 'InvalidAmountIn');
    });

    it('Should revert if slippage is too high (>= 10000)', async function () {
      await expect(
        swapRouterContract.getMinAmountOut(USDC, WETH, AMOUNT_IN, 10000),
      ).to.be.revertedWithCustomError(swapRouterContract, 'SlippageTooHigh');
    });
  });

  describe('swap function', function () {
    it('Should revert if tokenIn is the zero address', async function () {
      await expect(
        swapRouterContract.swap(ZERO_ADDRESS, USDC, AMOUNT_IN, SLIPPAGE),
      ).to.be.revertedWithCustomError(swapRouterContract, 'InvalidToken');
    });

    it('Should revert if tokenOut is the zero address', async function () {
      await expect(
        swapRouterContract.swap(USDC, ZERO_ADDRESS, AMOUNT_IN, SLIPPAGE),
      ).to.be.revertedWithCustomError(swapRouterContract, 'InvalidToken');
    });

    it('Should revert if tokenIn is equal to tokenOut', async function () {
      await expect(
        swapRouterContract.swap(USDC, USDC, AMOUNT_IN, SLIPPAGE),
      ).to.be.revertedWithCustomError(swapRouterContract, 'IdenticalTokens');
    });

    it('Should revert if amountIn is zero', async function () {
      await expect(
        swapRouterContract.swap(USDC, WETH, 0, SLIPPAGE),
      ).to.be.revertedWithCustomError(swapRouterContract, 'InvalidAmountIn');
    });

    it('Should revert if slippage is too high', async function () {
      await expect(
        swapRouterContract.swap(USDC, WETH, AMOUNT_IN, 10000),
      ).to.be.revertedWithCustomError(swapRouterContract, 'SlippageTooHigh');
    });
  });
});
