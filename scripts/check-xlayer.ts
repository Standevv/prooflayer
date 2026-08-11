import { network } from "hardhat";

const XLAYER_TESTNET_CHAIN_ID = 1952n;
const { ethers } = await network.create();

const connectedNetwork = await ethers.provider.getNetwork();
if (connectedNetwork.chainId !== XLAYER_TESTNET_CHAIN_ID) {
  throw new Error(
    `Wrong network: expected X Layer Testnet chain ID ${XLAYER_TESTNET_CHAIN_ID}, received ${connectedNetwork.chainId}`,
  );
}

const [deployer] = await ethers.getSigners();
const latestBlock = await ethers.provider.getBlockNumber();
const balance = await ethers.provider.getBalance(deployer.address);

console.log("X Layer Testnet connectivity check passed");
console.log(`Chain ID: ${connectedNetwork.chainId}`);
console.log(`Latest block: ${latestBlock}`);
console.log(`Deployer: ${deployer.address}`);
console.log(`Deployer balance: ${ethers.formatEther(balance)} OKB`);
