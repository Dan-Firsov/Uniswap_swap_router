import { ethers, run } from 'hardhat';
import path from 'path';
import fs from 'fs';

const main = async () => {
  const [deployer] = await ethers.getSigners();

  console.log('🟡 Deploying contracts with the account:', deployer.address);

  const balance = await deployer.provider.getBalance(deployer.address);
  console.log('💰 Account balance:', ethers.formatEther(balance), 'ETH');

  const ContractFactory = await ethers.getContractFactory('UniswapSwapRouter');

  const contract = await ContractFactory.deploy();

  const deploymentTransaction = await contract.waitForDeployment();

  console.log('⏳ Waiting for transaction confirmations...');
  await deploymentTransaction.deploymentTransaction()?.wait(5);

  const address = await contract.getAddress();
  console.log('✅ Contract deployed at:', address);

  const deploymentPath = path.join(__dirname, '..', 'deployments', 'base.json');
  fs.writeFileSync(deploymentPath, JSON.stringify({ address }, null, 2));
  console.log(`💾 Address saved to ${deploymentPath}`);

  console.log('🔍 Verifying contract...');
  await run('verify:verify', {
    address: address,
    constructorArguments: [],
  });
};

main().catch((error) => {
  console.error('❌ Deployment failed:', error);
  process.exitCode = 1;
});
