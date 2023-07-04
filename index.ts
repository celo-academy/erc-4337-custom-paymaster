import { config } from "dotenv";
import { ThirdwebSDK } from "@thirdweb-dev/sdk";
import { BytesLike, defaultAbiCoder, hexConcat } from "ethers/lib/utils";
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
import { NotPromise, signUserOp } from "./aa-utils";
import { ethers } from "ethers";
import AllowlistPaymasterABI from "./abi.json";

// Environment Variables
config();

// Address whose signature is required for the UserOperations to be sponsored by the specified Paymaster
const PAYMASTER_OWNER = "0xf672cd5Ee805B72804bEE9a40BA7b8dc8F573596";

// Address of the paymaster
const ALLOWLIST_PAYMASTER_ADDRESS =
    "0x34A00151460C7Bec401D3b24fE86E9C152EE8284";

// Only the following UserOperation senders will be allowed
const allowList = ["0xdA82D492a49d08cF732A47Acf34efb51BE351dd6"];

class AllowlistPaymaster extends PaymasterAPI {
    private allowlist: string[];

    constructor(allowlist: string[]) {
        super();
        this.allowlist = allowlist;
    }

    /**
     * Get the nonce for the UserOperation from Paymaster
     */
    async getSenderNonce(address: string) {
        let provider = new ethers.providers.JsonRpcProvider(
            CeloAlfajoresTestnet.rpc[1]
        );

        let AllowlistPaymaster = new ethers.Contract(
            ALLOWLIST_PAYMASTER_ADDRESS,
            AllowlistPaymasterABI,
            provider
        );

        let nonce = await AllowlistPaymaster.senderNonce(address);
        return nonce;
    }

    /**
     * This function should return the `paymasterAndData` component of the UserOperation which will be then validated by the on-chain paymaster contract
     *
     * Any arbitrary logic can be defined here ultimately the return value should be the value that will lead to successful validation on-chain by `validatePaymasterUserOp` function on the paymaster
     *
     * The standard (ERC-4337) structure of paymasterAndData is
     *
     * [PAYMASTER_ADDRESS (20 bytes)][VALID_UNTIL (uint48 but encoded so 32 bytes)][VALID_AFTER (uint48 but encoded so 32 bytes)][SIGNATURE (bytes)]
     */
    async getPaymasterAndData(
        userOp: NotPromise<UserOperationStruct>
    ): Promise<string> {
        // Check if the UserOperation sender is part of the allowList
        if (this.allowlist.indexOf(userOp.sender as string) != -1) {
            // The Paymaster Owner in the form of Wallet
            let wallet = new PrivateKeyWallet(
                process.env.PAYMASTER_SIGNER_KEY as string
            );

            // A timestamp in UNIX until which the paymaster sponsorship is valid
            let validUntil = Math.round(Date.now() / 1000) + 10 * 60;

            /**
             * UserOperation signed by Paymaster Owner
             *
             * The current state of UserOperation doesn't have paymasterAndData and a signature so we have Dummy values for those
             *
             */
            let { signature } = signUserOp(
                userOp as NotPromise<UserOperationStruct>,
                await wallet.getSigner(), // The paymaster owner in the form of Signer
                CeloAlfajoresTestnet.chainId,
                ALLOWLIST_PAYMASTER_ADDRESS,
                await this.getSenderNonce(userOp.sender), // senderNonce (this nonce is subjective to every paymaster and sender)
                validUntil,
                0 // validAfter - Timestamp after which the UserOperation sponsorship should be valid
            );

            /**
             * Concatenating all the paymasterAndData components
             */
            let paymasterAndData = hexConcat([
                ALLOWLIST_PAYMASTER_ADDRESS,
                defaultAbiCoder.encode(["uint48", "uint48"], [validUntil, 0]),
                signature as NotPromise<BytesLike>,
            ]);

            return paymasterAndData;
        }

        // If the sender is not part of the list return nothing
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

        // Local Signer for demo purposes
        let localWallet = new LocalWalletNode({
            chain,
        });

        await localWallet.loadOrCreate({
            strategy: "mnemonic",
            encryption: false,
        });

        const personalWalletAddress = await localWallet.getAddress();

        console.log("Local Signer Address:", personalWalletAddress);

        // Create the AA provider
        const config: SmartWalletConfig = {
            chain,
            gasless: true,
            factoryAddress,
            thirdwebApiKey,
            paymasterAPI: new AllowlistPaymaster(allowList), // The Custom Paymaster API
        };

        // Connect the smart wallet
        const smartWallet = new SmartWallet(config);
        await smartWallet.connect({
            personalWallet: localWallet,
        });

        const isWalletDeployed = await smartWallet.isDeployed();
        console.log(`Is smart wallet deployed?`, isWalletDeployed);

        // Now use the SDK normally
        const sdk = await ThirdwebSDK.fromWallet(smartWallet, chain);
        console.log("Smart Account Address:", await sdk.wallet.getAddress());
        console.log(
            "Native Token Balance:",
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
