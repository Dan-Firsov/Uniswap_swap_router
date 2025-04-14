import IUniswapV2Router02 from '@uniswap/v2-periphery/build/UniswapV2Router02.json';
import IUniswapV2Factory from '@uniswap/v2-core/build/UniswapV2Factory.json';
import IUniswapV3Factory from '@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json';
import IQuoterV2 from '@uniswap/v3-periphery/artifacts/contracts/lens/QuoterV2.sol/QuoterV2.json';
import * as dotenv from 'dotenv';
import { ethers, formatUnits, ZeroAddress } from 'ethers';
import hre from 'hardhat';
import {
  V2_FACTORY,
  V2_ROUTER,
  V3_FACTORY,
  V3_FEES,
  V3_QUOTERV2,
} from './constants';
dotenv.config();

export type PoolResult = {
  type: string;
  amount: bigint;
};

export async function getBestUniswapQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  slippageBps: bigint,
) {
  if (!process.env.BASE_RPC_URL) {
    throw new Error('BASE_RPC_URL is not defined in environment variables');
  }
  const provider = hre.ethers.provider;

  const wallet = ethers.Wallet.createRandom();

  await hre.network.provider.request({
    method: 'hardhat_setBalance',
    params: [wallet.address, '0x8ac7230489e8000000'],
  });
  const signer = wallet.connect(provider);

  const v2Factory = new ethers.Contract(
    V2_FACTORY,
    IUniswapV2Factory.abi,
    provider,
  );
  const v2Router = new ethers.Contract(
    V2_ROUTER,
    IUniswapV2Router02.abi,
    provider,
  );
  const v3Factory = new ethers.Contract(
    V3_FACTORY,
    IUniswapV3Factory.abi,
    signer,
  );
  const quoter = new ethers.Contract(V3_QUOTERV2, IQuoterV2.abi, signer);

  const allResults: PoolResult[] = [];

  try {
    const v2Pair = await v2Factory.getPair(tokenIn, tokenOut);
    if (v2Pair !== ZeroAddress) {
      const amountsOut = await v2Router.getAmountsOut(amountIn, [
        tokenIn,
        tokenOut,
      ]);
      if (amountsOut?.[1]) {
        allResults.push({
          type: 'V2',
          amount: amountsOut[1],
        });
      }
    } else {
      console.log('Pair zero address');
    }
  } catch (error) {
    console.error('V2 Error:', error);
  }

  for (const fee of V3_FEES) {
    try {
      const poolAddress = await v3Factory.getPool(tokenIn, tokenOut, fee);
      if (poolAddress === ZeroAddress) continue;

      const params = {
        tokenIn,
        tokenOut,
        amountIn,
        fee,
        sqrtPriceLimitX96: 0,
      };

      const quoteResult = await quoter.quoteExactInputSingle.staticCall(params);

      allResults.push({
        type: `V3 ${fee / 100}%`,
        amount: quoteResult.amountOut,
      });
    } catch (error) {
      console.error(`V3 Fee ${fee} Error:`, error);
    }
  }

  if (allResults.length === 0) {
    throw new Error('No liquidity pools found');
  }

  const bestOffer = allResults.reduce(
    (best, current) => (current.amount > best.amount ? current : best),
    { type: 'None', amount: 0n },
  );

  const amountWithSlippage =
    (bestOffer.amount * (10000n - slippageBps)) / 10000n;

  console.log('=== Pool Analysis Results ===');
  allResults.forEach(({ type, amount }) => {
    console.log(`${type}: ${amount.toString()}`);
  });
  console.log(
    `\nBest pool: ${bestOffer.type}, ${bestOffer.amount.toString()} `,
  );

  console.log(
    `\nBest pool: ${bestOffer.type}, with slippageBps ${slippageBps.toString()}: ${amountWithSlippage.toString()}`,
  );

  return { bestOffer, amountWithSlippage };
}
