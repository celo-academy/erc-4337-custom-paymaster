// @ts-nocheck
import {
    ecsign,
    toRpcSig,
    keccak256 as keccak256_buffer,
} from "ethereumjs-util";
import {
    arrayify,
    defaultAbiCoder,
    hexDataSlice,
    hexlify,
    keccak256,
} from "ethers/lib/utils";
import { UserOperationStruct } from "@account-abstraction/contracts";
import { Signer } from "ethers";

export type NotPromise<T> = {
    [P in keyof T]: Exclude<T[P], Promise<any>>;
};

// DUMMY value for paymasterAndData
export const DUMMY_PND =
    "0x0101010101010101010101010101010101010101000000000000000000000000000000000000000000000000000001010101010100000000000000000000000000000000000000000000000000000000000000000101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101";

// DUMMY value for signature field
export const DUMMY_SIGNATURE =
    "0x0101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101";

/**
 * Pack the UserOperation
 *
 * During packing we add the dummy paymasterAndData and signature to the UserOperation to get the offset values
 *
 * After we know the offsets the dummy values are stripped off
 */
export function packUserOp(op: NotPromise<UserOperationStruct>): string {
    let packedUserOpWithDummyPNDAndSignature = defaultAbiCoder.encode(
        [
            "address",
            "uint256",
            "bytes",
            "bytes",
            "uint256",
            "uint256",
            "uint256",
            "uint256",
            "uint256",
            "bytes",
            "bytes",
        ],
        [
            op.sender,
            op.nonce,
            op.initCode,
            op.callData,
            op.callGasLimit,
            op.verificationGasLimit,
            op.preVerificationGas,
            op.maxFeePerGas,
            op.maxPriorityFeePerGas,
            DUMMY_PND,
            DUMMY_SIGNATURE,
        ]
    );

    // Remove paymasterAndData and signature but keep their offset as is (even though they are wrong)
    // https://github.com/pimlicolabs/account-abstraction/blob/939eea6ea43e8ec0427fe6eab41b2aff6831283b/contracts/samples/VerifyingPaymaster.sol#L78
    let packedUserOp = hexDataSlice(
        hexlify(packedUserOpWithDummyPNDAndSignature),
        0,
        packedUserOpWithDummyPNDAndSignature.length / 2 - 321 // 321 - is the number of bytes paymasterAndData and signature combined
    );

    return packedUserOp;
}

/**
 * Generate the UserOperation Hash
 */
export function getUserOpHash(
    op: NotPromise<UserOperationStruct>,
    chainId: number,
    paymasterAddress: string,
    senderNonce: number,
    validUntil: number,
    validAfter: number
): string {
    const packedUserOp = packUserOp(op);
    const enc = defaultAbiCoder.encode(
        ["bytes", "uint256", "address", "uint256", "uint48", "uint48"],
        [
            packedUserOp,
            chainId,
            paymasterAddress,
            senderNonce,
            validUntil,
            validAfter,
        ]
    );
    return keccak256(enc);
}

/**
 * Sign the UserOperation Hash with the paymaster owner Signer
 */
export function signUserOp(
    op: NotPromise<UserOperationStruct>,
    signer: Signer,
    chainId: number,
    paymasterAddress: string,
    senderNonce: number,
    validUntil: number,
    validAfter: number
): UserOperationStruct {
    const message = getUserOpHash(
        op,
        chainId,
        paymasterAddress,
        senderNonce,
        validUntil,
        validAfter
    );

    const msg1 = Buffer.concat([
        Buffer.from("\x19Ethereum Signed Message:\n32", "ascii"),
        Buffer.from(arrayify(message)),
    ]);

    const sig = ecsign(
        keccak256_buffer(msg1),
        Buffer.from(arrayify(signer.privateKey))
    );

    // that's equivalent of:  await signer.signMessage(message);
    // (but without "async"
    const signedMessage1 = toRpcSig(sig.v, sig.r, sig.s);
    return {
        ...op,
        signature: signedMessage1,
    };
}
