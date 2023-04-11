import { JsonRpcProvider } from "@ethersproject/providers";

import { EntryPoint__factory } from "@account-abstraction/contracts";
import { Signer } from "@ethersproject/abstract-signer";
import {
  DeterministicDeployer,
  HttpRpcClient,
  PaymasterAPI,
} from "@account-abstraction/sdk";
import { ChainOrRpcUrl, getChainProvider } from "@thirdweb-dev/sdk";
import { AccountAPI } from "./account";
import { ContractInterface, ethers } from "ethers";

import TWAccountFactory from "../artifacts/TWAccountFactory.json";
import TWAccount from "../artifacts/TWAccount.json";
import { ERC4337EthersProvider } from "./erc4337-provider";
export interface ProviderConfig {
  /**
   * the chain to use
   */
  chain: ChainOrRpcUrl;
  /**
   * the signer that will sign transactions locally
   */
  localSigner: Signer;
  /**
   * The stable account id which is used to derive the account address
   */
  accountId: string;
  /**
   * the entry point to use
   */
  entryPointAddress: string;
  /**
   * url to the bundler
   */
  bundlerUrl: string;

  /**
   * The address of the factory contract to use for deploying new accounts.
   */
  factoryAddress: string;
  /**
   * The ABI of the factory contract to use for deploying new accounts (defaults to fetching from ipfs)
   */
  factoryAbi?: ContractInterface;
  /**
   * The ABI of the account contract (defaults to fetching from ipfs)
   */
  accountAbi?: ContractInterface;
  /**
   * if set, use this pre-deployed wallet.
   * (if not set, use getSigner().getAddress() to query the "counterfactual" address of wallet.
   *  you may need to fund this address so the wallet can pay for its own creation)
   */
  walletAddres?: string;
  /**
   * if set, call just before signing.
   */
  paymasterAPI?: PaymasterAPI;
}

/**
 * wrap an existing provider to tunnel requests through Account Abstraction.
 * @param originalProvider the normal provider
 * @param config see ClientConfig for more info
 * @param originalSigner use this signer as the owner. of this wallet. By default, use the provider's signer
 */
export async function create4337Provider(
  config: ProviderConfig
): Promise<ERC4337EthersProvider> {
  const rpcProvider = getChainProvider(config.chain, {}) as JsonRpcProvider;
  const entryPoint = EntryPoint__factory.connect(
    config.entryPointAddress,
    rpcProvider
  );

  const accountApi = new AccountAPI({
    chain: config.chain,
    localSigner: config.localSigner,
    accountId: config.accountId,
    entryPointAddress: config.entryPointAddress,
    factoryAddress: config.factoryAddress,
    paymasterAPI: config.paymasterAPI,
    accountAbi: TWAccount.abi,
    factoryAbi: TWAccountFactory.abi,
  });

  const chainId = await accountApi.getChainId();
  const httpRpcClient = new HttpRpcClient(
    config.bundlerUrl,
    config.entryPointAddress,
    chainId
  );
  return await new ERC4337EthersProvider(
    chainId,
    config,
    config.localSigner,
    rpcProvider,
    httpRpcClient,
    entryPoint,
    accountApi
  ).init();
}

// NOTE: this function errors out.
export async function deployAccountFactory(
  chain: ChainOrRpcUrl,
  entryPointAddress: string
) {
  const provider = getChainProvider(chain, {}) as JsonRpcProvider;
  const entryPoint = EntryPoint__factory.connect(entryPointAddress, provider);
  const detDeployer = new DeterministicDeployer(provider);
  return await detDeployer.deterministicDeploy(
    new ethers.ContractFactory(TWAccountFactory.abi, TWAccountFactory.bytecode),
    0,
    [entryPoint.address]
  );
}
