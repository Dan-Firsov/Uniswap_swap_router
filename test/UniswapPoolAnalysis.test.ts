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
dotenv.config();

type PoolResult = {
  type: string;
  amount: bigint;
};

describe('Uniswap Pool Analysis', () => {
  it('Find best pool for WETH/USDC swap', async () => {
    const client = createPublicClient({
      chain: base,
      transport: http(process.env.BASE_RPC_URL),
    });

    const allResults: PoolResult[] = [];

    let v2Pair;
    try {
      v2Pair = await client.readContract({
        address: V2_FACTORY,
        abi: IUniswapV2Factory.abi,
        functionName: 'getPair',
        args: [WETH, USDC],
      });
    } catch (error) {
      console.error('Error fetching V2 pair:', error);
      v2Pair = '0x0000000000000000000000000000000000000000';
    }

    if (v2Pair !== '0x0000000000000000000000000000000000000000') {
      const amountsOut = (await client.readContract({
        address: V2_ROUTER,
        abi: IUniswapV2Router02.abi,
        functionName: 'getAmountsOut',
        args: [parseEther('1'), [WETH, USDC]],
      })) as bigint[];

      if (amountsOut && amountsOut.length > 1) {
        allResults.push({
          type: 'V2',
          amount: amountsOut[1],
        });
      }
    }

    const v3Promises = V3_FEES.map(async (fee) => {
      const poolAddress = await client.readContract({
        address: V3_FACTORY,
        abi: IUniswapV3Factory.abi,
        functionName: 'getPool',
        args: [WETH, USDC, fee],
      });

      if (poolAddress === '0x0000000000000000000000000000000000000000')
        return null;

      try {
        const params = {
          tokenIn: WETH,
          tokenOut: USDC,
          amountIn: parseEther('1'),
          fee: BigInt(fee),
          sqrtPriceLimitX96: 0n,
        };
        const [amountOut] = (await client.readContract({
          address: V3_QUOTERV2,
          abi: IQuoterV2.abi,
          functionName: 'quoteExactInputSingle',
          args: [params],
        })) as [bigint];
        return {
          type: `V3 ${Number(fee) / 100}%`,
          amount: amountOut,
        } as PoolResult;
      } catch (error) {
        console.error(`Error quoting V3 fee ${fee}:`, error);
        return null;
      }
    });
    const v3Results = (await Promise.all(v3Promises)).filter(
      Boolean,
    ) as PoolResult[];
    allResults.push(...v3Results);

    if (allResults.length === 0) {
      throw new Error('No liquidity pools found');
    }

    const bestOffer = allResults.reduce(
      (max, curr) => (curr.amount > max.amount ? curr : max),
      { type: '', amount: 0n },
    );

    console.log('=== Pool Analysis Results ===');
    allResults.forEach(({ type, amount }) => {
      console.log(`${type}: ${formatUnits(amount, 6)} USDC`);
    });
    console.log(
      `\nBest pool: ${bestOffer.type} with ${formatUnits(
        bestOffer.amount,
        6,
      )} USDC`,
    );

    expect(Number(bestOffer.amount)).to.be.greaterThan(0);
  });
});
