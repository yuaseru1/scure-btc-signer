import { Coder } from '@scure/base';
import * as P from 'micro-packed';
import { TransactionInput } from './psbt.js';
import { ScriptType } from './script.js';
import { Bytes } from './utils.js';
export type P2Ret = {
    type: string;
    script: Bytes;
    address?: string;
    redeemScript?: Bytes;
    witnessScript?: Bytes;
};
type OutPKType = {
    type: 'pk';
    pubkey: Bytes;
};
export type OptScript = ScriptType | undefined;
type OutPKHType = {
    type: 'pkh';
    hash: Bytes;
};
type OutSHType = {
    type: 'sh';
    hash: Bytes;
};
type OutWSHType = {
    type: 'wsh';
    hash: Bytes;
};
type OutWPKHType = {
    type: 'wpkh';
    hash: Bytes;
};
type OutMSType = {
    type: 'ms';
    pubkeys: Bytes[];
    m: number;
};
type OutTRType = {
    type: 'tr';
    pubkey: Bytes;
};
type OutTRNSType = {
    type: 'tr_ns';
    pubkeys: Bytes[];
};
type OutTRMSType = {
    type: 'tr_ms';
    pubkeys: Bytes[];
    m: number;
};
type OutUnknownType = {
    type: 'unknown';
    script: Bytes;
};
type FinalizeSignature = [{
    pubKey: Bytes;
    leafHash: Bytes;
}, Bytes];
type CustomScriptOut = {
    type: string;
} & Record<string, any>;
export type CustomScript = Coder<OptScript, CustomScriptOut | undefined> & {
    finalizeTaproot?: (script: Bytes, parsed: CustomScriptOut, signatures: FinalizeSignature[]) => Bytes[] | undefined;
};
export declare const OutScript: P.CoderType<NonNullable<OutPKType | OutPKHType | OutSHType | OutWSHType | OutWPKHType | OutMSType | OutTRType | OutTRNSType | OutTRMSType | OutUnknownType | undefined>>;
export type OutScriptType = typeof OutScript;
export declare function checkScript(script?: Bytes, redeemScript?: Bytes, witnessScript?: Bytes): void;
export declare const p2pk: (pubkey: Bytes, network?: {
    bech32: string;
    pubKeyHash: number;
    scriptHash: number;
    wif: number;
}) => P2Ret;
export declare const p2pkh: (publicKey: Bytes, network?: {
    bech32: string;
    pubKeyHash: number;
    scriptHash: number;
    wif: number;
}) => P2Ret;
export declare const p2sh: (child: P2Ret, network?: {
    bech32: string;
    pubKeyHash: number;
    scriptHash: number;
    wif: number;
}) => P2Ret;
export declare const p2wsh: (child: P2Ret, network?: {
    bech32: string;
    pubKeyHash: number;
    scriptHash: number;
    wif: number;
}) => P2Ret;
export declare const p2wpkh: (publicKey: Bytes, network?: {
    bech32: string;
    pubKeyHash: number;
    scriptHash: number;
    wif: number;
}) => P2Ret;
export declare const p2ms: (m: number, pubkeys: Bytes[], allowSamePubkeys?: boolean) => P2Ret;
export type P2TROut = P2Ret & {
    tweakedPubkey: Uint8Array;
    tapInternalKey: Uint8Array;
    tapMerkleRoot?: Uint8Array;
    tapLeafScript?: TransactionInput['tapLeafScript'];
    leaves?: TaprootLeaf[];
};
export type TaprootNode = {
    script: Bytes | string;
    leafVersion?: number;
    weight?: number;
} & Partial<P2TROut>;
export type TaprootScriptTree = TaprootNode | TaprootScriptTree[];
export type TaprootScriptList = TaprootNode[];
export declare function taprootListToTree(taprootList: TaprootScriptList): TaprootScriptTree;
type TaprootLeaf = {
    type: 'leaf';
    version?: number;
    script: Bytes;
    hash: Bytes;
    path: Bytes[];
};
export declare const TAP_LEAF_VERSION = 192;
export declare const tapLeafHash: (script: Bytes, version?: number) => Uint8Array;
export declare function p2tr(internalPubKey?: Bytes | string, tree?: TaprootScriptTree, network?: {
    bech32: string;
    pubKeyHash: number;
    scriptHash: number;
    wif: number;
}, allowUnknownOutputs?: boolean, customScripts?: CustomScript[]): P2TROut;
export declare function combinations<T>(m: number, list: T[]): T[][];
/**
 * M-of-N multi-leaf wallet via p2tr_ns. If m == n, single script is emitted.
 * Takes O(n^2) if m != n. 99-of-100 is ok, 5-of-100 is not.
 * `2-of-[A,B,C] => [A,B] | [A,C] | [B,C]`
 */
export declare const p2tr_ns: (m: number, pubkeys: Bytes[], allowSamePubkeys?: boolean) => P2Ret[];
export declare const p2tr_pk: (pubkey: Bytes) => P2Ret;
export declare function p2tr_ms(m: number, pubkeys: Bytes[], allowSamePubkeys?: boolean): {
    type: string;
    script: Uint8Array;
};
export declare function getAddress(type: 'pkh' | 'wpkh' | 'tr', privKey: Bytes, network?: {
    bech32: string;
    pubKeyHash: number;
    scriptHash: number;
    wif: number;
}): string | undefined;
export declare const _sortPubkeys: (pubkeys: Bytes[]) => Uint8Array[];
export declare function multisig(m: number, pubkeys: Bytes[], sorted?: boolean, witness?: boolean): P2Ret;
export declare function sortedMultisig(m: number, pubkeys: Bytes[], witness?: boolean): P2Ret;
export declare function WIF(network?: {
    bech32: string;
    pubKeyHash: number;
    scriptHash: number;
    wif: number;
}): Coder<Bytes, string>;
export declare function Address(network?: {
    bech32: string;
    pubKeyHash: number;
    scriptHash: number;
    wif: number;
}): {
    encode(from: P.UnwrapCoder<OutScriptType>): string;
    decode(address: string): P.UnwrapCoder<OutScriptType>;
};
export {};
//# sourceMappingURL=payment.d.ts.map