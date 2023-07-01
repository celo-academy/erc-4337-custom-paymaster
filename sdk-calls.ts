import { ThirdwebSDK } from "@thirdweb-dev/sdk";

export const claimCeloToken = async (sdk: ThirdwebSDK) => {
    const contract = await sdk.getContract(
        "0xf72Ab3666c7302F5713FAEd4479b78a44fEAB89B" // celo alfajores
    );
    const tx = await contract.erc20.mintTo(
        "0xdA82D492a49d08cF732A47Acf34efb51BE351dd6",
        "10"
    );
    console.log("claimed", tx.receipt.transactionHash);
    const tokenBalance = await contract.erc20.balance();
    console.log("token balance:", tokenBalance.displayValue);
};
