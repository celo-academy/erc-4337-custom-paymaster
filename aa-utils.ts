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
    keccak256,
} from "ethers/lib/utils";
import { UserOperationStruct } from "@account-abstraction/contracts";
import { Wallet } from "ethers";

export type NotPromise<T> = {
    [P in keyof T]: Exclude<T[P], Promise<any>>;
};

export function packUserOp(
    op: NotPromise<UserOperationStruct>,
    forSignature = true
): string {
    if (forSignature) {
        return defaultAbiCoder.encode(
            [
                "address",
                "uint256",
                "bytes32",
                "bytes32",
                "uint256",
                "uint256",
                "uint256",
                "uint256",
                "uint256",
                "bytes32",
            ],
            [
                op.sender,
                op.nonce,
                keccak256(op.initCode),
                keccak256(op.callData),
                op.callGasLimit,
                op.verificationGasLimit,
                op.preVerificationGas,
                op.maxFeePerGas,
                op.maxPriorityFeePerGas,
                keccak256(op.paymasterAndData),
            ]
        );
    } else {
        // for the purpose of calculating gas cost encode also signature (and no keccak of bytes)
        return defaultAbiCoder.encode(
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
                op.paymasterAndData,
                op.signature,
            ]
        );
    }
}

export function getUserOpHash(
    op: NotPromise<UserOperationStruct>,
    entryPoint: string,
    chainId: number,
    senderNonce: number,
    validUntil: number,
    validAfter: number
): string {
    const userOpHash = keccak256(packUserOp(op, true));
    const enc = defaultAbiCoder.encode(
        ["bytes32", "address", "uint256", "uint256", "uint48", "uint48"],
        [userOpHash, entryPoint, chainId, senderNonce, validUntil, validAfter]
    );
    return keccak256(enc);
}

export function signUserOp(
    op: NotPromise<UserOperationStruct>,
    signer: Wallet,
    entryPoint: string,
    chainId: number,
    senderNonce: number,
    validUntil: number,
    validAfter: number
): UserOperationStruct {
    const message = getUserOpHash(
        op,
        entryPoint,
        chainId,
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
