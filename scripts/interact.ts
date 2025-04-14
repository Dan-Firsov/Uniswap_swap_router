import { parseUnits } from 'ethers';
import { ethers } from 'hardhat';
import { USDC, WETH } from '../test/utils/constants';
import ERC20_ABI from '@openzeppelin/contracts/build/contracts/ERC20.json';
import UniswapSwapRouterAbi from '../artifacts/contracts/UniswapSwapRouter.sol/UniswapSwapRouter.json';

const main = async () => {
  const AMOUNT_IN = parseUnits('1', 6);
  const SLIPPAGE = BigInt(100);
  const [signer] = await ethers.getSigners();

  const usdc = new ethers.Contract(USDC, ERC20_ABI.abi, signer);

  const decimals = await usdc.decimals();
  const amount = ethers.parseUnits(AMOUNT_IN.toString(), decimals);

  const balance = await usdc.balanceOf(signer.address);
  console.log(`Token balance: ${ethers.formatUnits(balance, decimals)}`);

  console.log(`Approving ${AMOUNT_IN} tokens...`);
  const approveTx = await usdc.approve(
    process.env.UNISWAP_SWAP_ROUTER_ADDRESS,
    AMOUNT_IN,
  );
  await approveTx.wait();
  console.log(`Approved. Tx hash: ${approveTx.hash}`);

  const allowance = await usdc.allowance(
    signer.address,
    process.env.UNISWAP_SWAP_ROUTER_ADDRESS,
  );
  console.log(`New allowance: ${ethers.formatUnits(allowance, decimals)}`);

  const UniswapSwapRouter = new ethers.Contract(
    process.env.UNISWAP_SWAP_ROUTER_ADDRESS!,
    UniswapSwapRouterAbi.abi,
    signer,
  );

  console.log('Executing swap...');

  const swapTx = await UniswapSwapRouter.swap(USDC, WETH, AMOUNT_IN, SLIPPAGE);

  const receipt = await swapTx.wait();
  console.log(`
    Swap executed successfully!
    Tx hash: ${receipt.hash}
    Gas used: ${receipt.gasUsed.toString()}
  `);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
