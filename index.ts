// @ts-nocheck
import { config } from "dotenv";
import { ThirdwebSDK } from "@thirdweb-dev/sdk";
import { defaultAbiCoder } from "ethers/lib/utils";
import {
    SmartWallet,
    SmartWalletConfig,
    PrivateKeyWallet,
} from "@thirdweb-dev/wallets";
import { PaymasterAPI } from "@account-abstraction/sdk";
import { UserOperationStruct } from "@account-abstraction/contracts";
import { LocalWalletNode } from "@thirdweb-dev/wallets/evm/wallets/local-wallet-node";
import { CeloAlfajoresTestnet } from "@thirdweb-dev/chains";
import { claimCeloToken } from "./sdk-calls";
import { signUserOp } from "./aa-utils";

config();

const ENTRYPOINT = "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789";

const ALLOWLIST_PAYMASTER_ADDRESS =
    "0x34A00151460C7Bec401D3b24fE86E9C152EE8284";

// Only the following UserOperation sender will be allowed
const allowList = ["0xdA82D492a49d08cF732A47Acf34efb51BE351dd6"];

class AllowlistPaymaster extends PaymasterAPI {
    private allowlist: string[];

    constructor(allowlist: string[]) {
        super();
        this.allowlist = allowlist;
    }

    async getPaymasterAndData(
        userOp: Partial<UserOperationStruct>
    ): Promise<string> {
        // Ask the paymaster to sign the transaction and return a valid paymasterAndData value.
        if (allowList.indexOf(userOp.sender as string) != -1) {
            let signer = new PrivateKeyWallet(process.env.SIGNER_KEY as string);
            let validUntil = Date.now() / 1000 + 10 * 60;
            let signature = signUserOp(
                userOp,
                signer,
                ENTRYPOINT,
                44787,
                0,
                validUntil,
                0
            );

            let paymasterAndData = defaultAbiCoder.encode(
                ["address", "uint48", "uint48", "bytes"],
                [ALLOWLIST_PAYMASTER_ADDRESS, validUntil, 0, signature]
            );
            return paymasterAndData;
        }

        return "";
    }
}
// Put your chain here
const chain = CeloAlfajoresTestnet;
// Put your thirdweb API key here (or in .env)
const thirdwebApiKey = process.env.THIRDWEB_API_KEY as string;

// Factory addresses for each chain
const factories = {
    [CeloAlfajoresTestnet.chainId]:
        "0xE646849d679602F2588CA8eEDf0b261B1aB085AF",
};

const main = async () => {
    try {
        const factoryAddress = factories[chain.chainId];
        console.log("Running on", chain.slug, "with factory", factoryAddress);
        // Local signer
        let localWallet = new LocalWalletNode({
            chain,
        });
        await localWallet.loadOrCreate({
            strategy: "mnemonic",
            encryption: false,
        });
        const personalWalletAddress = await localWallet.getAddress();
        console.log("Local signer addr:", personalWalletAddress);

        // Create the AA provider
        const config: SmartWalletConfig = {
            chain,
            gasless: true,
            factoryAddress,
            thirdwebApiKey,
            paymasterAPI: new AllowlistPaymaster(allowList),
        };

        // connect the smart wallet
        const smartWallet = new SmartWallet(config);
        await smartWallet.connect({
            personalWallet: localWallet,
        });

        const isWalletDeployed = await smartWallet.isDeployed();
        console.log(`Is smart wallet deployed?`, isWalletDeployed);

        // now use the SDK normally
        const sdk = await ThirdwebSDK.fromWallet(smartWallet, chain);
        console.log("Smart Account addr:", await sdk.wallet.getAddress());
        console.log(
            "native balance:",
            (await sdk.wallet.balance()).displayValue
        );

        console.log("Executing contract call via SDK...");
        switch (chain.chainId as number) {
            case CeloAlfajoresTestnet.chainId:
                await claimCeloToken(sdk);
                break;
        }
    } catch (e) {
        console.error("Something went wrong: ", await e);
    }
};

main();
