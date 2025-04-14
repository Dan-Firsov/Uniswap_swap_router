import hre, { ethers } from 'hardhat';
import { USDC, WHALE } from './constants';
import UniswapSwapRouterAbi from '../../artifacts/contracts/UniswapSwapRouter.sol/UniswapSwapRouter.json';
import { parseUnits } from 'ethers';
import ERC20_ABI from '@openzeppelin/contracts/build/contracts/ERC20.json';

export const deployContractFixture = async () => {
  await hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [WHALE],
  });
  await hre.network.provider.request({
    method: 'hardhat_setBalance',
    params: [WHALE, '0x8ac7230489e800000'],
  });
  const [deployer, user] = await ethers.getSigners();
  const whale = await ethers.getSigner(WHALE);

  const UniswapSwapRouterFactory = await ethers.getContractFactory(
    'UniswapSwapRouter',
    deployer,
  );

  const deployedContract = await UniswapSwapRouterFactory.deploy();
  await deployedContract.waitForDeployment();

  const usdc = new ethers.Contract(USDC, ERC20_ABI.abi, whale);

  const amount = parseUnits('1000', 6);

  const tx = await usdc.transfer(await user.getAddress(), amount);
  await tx.wait();

  const swapRouterContract = new ethers.Contract(
    deployedContract.target,
    UniswapSwapRouterAbi.abi,
    user,
  );

  return {
    swapRouterContract,
    deployer,
    user,
  };
};
