import { expect } from 'chai';
import IUniswapV2Router02 from '@uniswap/v2-periphery/build/UniswapV2Router02.json';
import IUniswapV2Factory from '@uniswap/v2-core/build/UniswapV2Factory.json';
import IUniswapV3Factory from '@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json';
import IQuoterV2 from '@uniswap/v3-periphery/artifacts/contracts/lens/QuoterV2.sol/QuoterV2.json';
import * as dotenv from 'dotenv';
import {
  USDC,
  V2_FACTORY,
  V2_ROUTER,
  V3_FACTORY,
  V3_FEES,
  V3_QUOTERV2,
  WETH,
} from './utils/constants';
import { ethers } from 'hardhat';
import { ZeroAddress } from 'ethers';
dotenv.config();

type PoolResult = {
  type: string;
  amount: bigint;
};

describe('Uniswap Pool Analysis', () => {
  it('Find best pool for WETH/USDC swap', async () => {
    const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    const wallet = ethers.Wallet.createRandom();
    const signer = wallet.connect(provider);

    const allResults: PoolResult[] = [];

    let v2Pair;
    try {
      const v2Factory = new ethers.Contract(
        V2_FACTORY,
        IUniswapV2Factory.abi,
        signer,
      );
      v2Pair = await v2Factory.getPair(WETH, USDC);
    } catch (error) {
      console.error('Error fetching V2 pair:', error);
      v2Pair = ZeroAddress;
    }

    if (v2Pair !== ZeroAddress) {
      const v2Router = new ethers.Contract(
        V2_ROUTER,
        IUniswapV2Router02.abi,
        signer,
      );
      const amountsOut: bigint[] = await v2Router.getAmountsOut(
        ethers.parseEther('1'),
        [WETH, USDC],
      );

      if (amountsOut && amountsOut.length > 1) {
        allResults.push({
          type: 'V2',
          amount: amountsOut[1],
        });
      }
    }

    const v3Promises = V3_FEES.map(async (fee) => {
      const v3Factory = new ethers.Contract(
        V3_FACTORY,
        IUniswapV3Factory.abi,
        signer,
      );
      const poolAddress = await v3Factory.getPool(WETH, USDC, fee);

      if (poolAddress === ZeroAddress) return null;

      try {
        const v3Quoter = new ethers.Contract(
          V3_QUOTERV2,
          IQuoterV2.abi,
          signer,
        );
        const params = {
          tokenIn: WETH,
          tokenOut: USDC,
          amountIn: ethers.parseEther('1'),
          fee: BigInt(fee),
          sqrtPriceLimitX96: 0n,
        };
        const [amountOut]: [bigint] =
          await v3Quoter.quoteExactInputSingle.staticCall(params);
        allResults.push({
          type: `V3 ${Number(fee) / 100}%`,
          amount: amountOut,
        });
      } catch (error) {
        console.error(`Error quoting V3 fee ${fee}:`, error);
        return null;
      }
    });

    await Promise.all(v3Promises);

    if (allResults.length === 0) {
      throw new Error('No liquidity pools found');
    }

    const bestOffer = allResults.reduce(
      (max, curr) => (curr.amount > max.amount ? curr : max),
      { type: '', amount: 0n },
    );

    console.log('=== Pool Analysis Results ===');
    allResults.forEach(({ type, amount }) => {
      console.log(`${type}: ${ethers.formatUnits(amount, 6)} USDC`);
    });
    console.log(
      `\nBest pool: ${bestOffer.type} with ${ethers.formatUnits(
        bestOffer.amount,
        6,
      )} USDC`,
    );

    expect(Number(bestOffer.amount)).to.be.greaterThan(0);
  });
});
