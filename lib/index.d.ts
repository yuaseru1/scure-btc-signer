/*! scure-btc-signer - MIT License (c) 2022 Paul Miller (paulmillr.com) */
import { isBytes, concatBytes, compareBytes } from './utils.js';
export { p2pk, p2pkh, p2sh, p2ms, p2wsh, p2wpkh, p2tr, p2tr_ns, p2tr_ms, p2tr_pk, multisig } from './payment.js';
export { OP, RawTx, CompactSize, Script, ScriptNum, ScriptType, MAX_SCRIPT_BYTE_LENGTH, } from './script.js';
export { Transaction } from './transaction.js';
export { getInputType, selectUTXO } from './utxo.js';
export { NETWORK, TEST_NETWORK, TAPROOT_UNSPENDABLE_KEY } from './utils.js';
export declare const utils: {
    isBytes: typeof isBytes;
    concatBytes: typeof concatBytes;
    compareBytes: typeof compareBytes;
    pubSchnorr: (priv: string | Uint8Array) => Uint8Array;
    randomPrivateKeyBytes: () => Uint8Array;
};
export { Address, getAddress, WIF, OptScript, CustomScript, taprootListToTree, OutScript, _sortPubkeys, sortedMultisig, combinations } from './payment.js';
export { _DebugPSBT, TaprootControlBlock } from './psbt.js';
export { Decimal, bip32Path, SigHash, PSBTCombine, DEFAULT_SEQUENCE } from './transaction.js';
export { _cmpBig, _Estimator } from './utxo.js';
//# sourceMappingURL=index.d.ts.map