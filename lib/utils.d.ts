import { isBytes, concatBytes } from 'micro-packed';
import { sha256 } from '@noble/hashes/sha256';
export type Bytes = Uint8Array;
export { sha256, isBytes, concatBytes };
export declare const hash160: (msg: Bytes) => Uint8Array;
export declare const sha256x2: (...msgs: Bytes[]) => Uint8Array;
export declare const randomPrivateKeyBytes: () => Uint8Array;
export declare const pubSchnorr: (priv: string | Uint8Array) => Uint8Array;
export declare const pubECDSA: (privateKey: import("@noble/curves/abstract/utils").PrivKey, isCompressed?: boolean | undefined) => Uint8Array;
export declare function signECDSA(hash: Bytes, privateKey: Bytes, lowR?: boolean): Bytes;
export declare const signSchnorr: (message: import("@noble/curves/abstract/utils").Hex, privateKey: import("@noble/curves/abstract/utils").PrivKey, auxRand?: import("@noble/curves/abstract/utils").Hex | undefined) => Uint8Array;
export declare const tagSchnorr: (tag: string, ...messages: Uint8Array[]) => Uint8Array;
export declare enum PubT {
    ecdsa = 0,
    schnorr = 1
}
export declare function validatePubkey(pub: Bytes, type: PubT): Bytes;
export declare function tapTweak(a: Bytes, b: Bytes): bigint;
export declare function taprootTweakPrivKey(privKey: Uint8Array, merkleRoot?: Uint8Array): Uint8Array;
export declare function taprootTweakPubkey(pubKey: Uint8Array, h: Uint8Array): [Uint8Array, number];
export declare const TAPROOT_UNSPENDABLE_KEY: Uint8Array;
export declare const NETWORK: {
    bech32: string;
    pubKeyHash: number;
    scriptHash: number;
    wif: number;
};
export declare const TEST_NETWORK: typeof NETWORK;
export declare function compareBytes(a: Bytes, b: Bytes): number;
//# sourceMappingURL=utils.d.ts.map