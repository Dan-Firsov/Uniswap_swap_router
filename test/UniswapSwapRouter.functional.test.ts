import { expect, use } from 'chai';
import { deployContractFixture } from './utils/deployContractFixture';
import '@nomicfoundation/hardhat-chai-matchers';
import '@nomicfoundation/hardhat-network-helpers';
import ERC20_ABI from '@openzeppelin/contracts/build/contracts/ERC20.json';
import { USDC, WETH } from './utils/constants';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { getBestUniswapQuote } from './utils/getBestUniswapQuote';
import { parseUnits } from 'ethers';
import { ethers } from 'hardhat';

describe('UniswapSwapRouter - Functional Tests', function () {
  const SLIPPAGE = BigInt(500);
  const AMOUNT_IN = parseUnits('1000', 6);
  const tokenIn = USDC;
  const tokenOut = WETH;
  let swapRouterContract: any, user: any;

  beforeEach(async function () {
    const fixture = await loadFixture(deployContractFixture);
    swapRouterContract = fixture.swapRouterContract;
    user = fixture.user;
  });

  describe('getMinAmountOut function', () => {
    it('Should get best minimal amount out', async () => {
      const minAmountOut = await getBestUniswapQuote(
        tokenIn,
        tokenOut,
        AMOUNT_IN,
        SLIPPAGE,
      );

      const tx = await swapRouterContract.getMinAmountOut(
        tokenIn,
        tokenOut,
        AMOUNT_IN,
        SLIPPAGE,
      );
      const receipt = await tx.wait();

      const parsedLog = receipt.logs
        .map((log: any) => {
          try {
            return swapRouterContract.interface.parseLog(log);
          } catch (error) {
            return null;
          }
        })
        .find((log: any) => log?.name === 'minAmountOutCalculated');
      if (parsedLog) {
        const emittedMinAmountOut = parsedLog.args[0];
        console.log('\nContract amount:', emittedMinAmountOut.toString());
        console.log(
          'Function amount:',
          minAmountOut.amountWithSlippage.toString(),
        );
        await expect(emittedMinAmountOut).to.equal(
          minAmountOut.amountWithSlippage,
        );
      }
    });

    describe('swap function', () => {
      it('Should swap USDC to WETH correctly', async () => {
        const usdc = new ethers.Contract(USDC, ERC20_ABI.abi, user);
        const weth = new ethers.Contract(WETH, ERC20_ABI.abi, user);

        const initialBalanceIn = await usdc.balanceOf(user.address);
        const initialBalanceOut = await weth.balanceOf(user.address);

        await usdc.approve(swapRouterContract.target, AMOUNT_IN);

        await expect(
          usdc.approve(swapRouterContract.target, AMOUNT_IN),
        ).to.emit(usdc, 'Approval');

        const allowance = await usdc.allowance(
          user.address,
          swapRouterContract.target,
        );

        expect(allowance).to.equal(AMOUNT_IN);

        const tx = await swapRouterContract.swap(
          tokenIn,
          tokenOut,
          AMOUNT_IN,
          SLIPPAGE,
        );
        const receipt = await tx.wait();

        const parsedLog = receipt.logs
          .map((log: any) => {
            try {
              return swapRouterContract.interface.parseLog(log);
            } catch (error) {
              return null;
            }
          })
          .find((log: any) => log?.name === 'swapExecuted');

        expect(parsedLog).to.not.be.undefined;
        expect(parsedLog.args.tokenIn).to.equal(tokenIn);
        expect(parsedLog.args.tokenOut).to.equal(tokenOut);

        const finalBalanceIn = await usdc.balanceOf(user.address);
        const finalBalanceOut = await weth.balanceOf(user.address);

        expect(finalBalanceIn).to.equal(initialBalanceIn - AMOUNT_IN);
        expect(finalBalanceOut).to.be.gt(initialBalanceOut);

        const minExpected = parsedLog.args.minAmountOut;
        expect(finalBalanceOut - initialBalanceOut).to.be.at.least(minExpected);
        console.log(
          `Amount USDC before: ${initialBalanceIn}, after: ${finalBalanceIn}`,
        );
        console.log(
          `Amount WETH before: ${initialBalanceOut}, after: ${finalBalanceOut}`,
        );

        console.log(`\nMin amount out: ${minExpected}`);
      });
    });
  });
});
