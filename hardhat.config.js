require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
require("hardhat-celo");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: "0.8.17",
    networks: {
        alfajores: {
            accounts: [process.env.PAYMASTER_SIGNER_KEY],
            url: "https://alfajores-forno.celo-testnet.org",
        },
    },
    etherscan: {
        apiKey: {
            alfajores: process.env.CELOSCAN_KEY,
        },
    },
};
