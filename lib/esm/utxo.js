import { hex } from '@scure/base';
import * as P from 'micro-packed';
import { Address, OutScript, checkScript } from './payment.js';
import * as psbt from './psbt.js';
import { CompactSizeLen, RawTx, RawWitness, Script, VarBytes } from './script.js';
import { DEFAULT_SEQUENCE, inputBeforeSign, SignatureHash, Transaction, } from './transaction.js'; // circular
import { NETWORK, compareBytes, isBytes, TAPROOT_UNSPENDABLE_KEY, sha256 } from './utils.js';
// Normalizes input
export function getPrevOut(input) {
    if (input.nonWitnessUtxo) {
        if (input.index === undefined)
            throw new Error('Unknown input index');
        return input.nonWitnessUtxo.outputs[input.index];
    }
    else if (input.witnessUtxo)
        return input.witnessUtxo;
    else
        throw new Error('Cannot find previous output info');
}
export function normalizeInput(i, cur, allowedFields, disableScriptCheck = false) {
    let { nonWitnessUtxo, txid } = i;
    // String support for common fields. We usually prefer Uint8Array to avoid errors
    // like hex looking string accidentally passed, however, in case of nonWitnessUtxo
    // it is better to expect string, since constructing this complex object will be
    // difficult for user
    if (typeof nonWitnessUtxo === 'string')
        nonWitnessUtxo = hex.decode(nonWitnessUtxo);
    if (isBytes(nonWitnessUtxo))
        nonWitnessUtxo = RawTx.decode(nonWitnessUtxo);
    if (!('nonWitnessUtxo' in i) && nonWitnessUtxo === undefined)
        nonWitnessUtxo = cur?.nonWitnessUtxo;
    if (typeof txid === 'string')
        txid = hex.decode(txid);
    // TODO: if we have nonWitnessUtxo, we can extract txId from here
    if (txid === undefined)
        txid = cur?.txid;
    let res = { ...cur, ...i, nonWitnessUtxo, txid };
    if (!('nonWitnessUtxo' in i) && res.nonWitnessUtxo === undefined)
        delete res.nonWitnessUtxo;
    if (res.sequence === undefined)
        res.sequence = DEFAULT_SEQUENCE;
    if (res.tapMerkleRoot === null)
        delete res.tapMerkleRoot;
    res = psbt.mergeKeyMap(psbt.PSBTInput, res, cur, allowedFields);
    psbt.PSBTInputCoder.encode(res); // Validates that everything is correct at this point
    let prevOut;
    if (res.nonWitnessUtxo && res.index !== undefined)
        prevOut = res.nonWitnessUtxo.outputs[res.index];
    else if (res.witnessUtxo)
        prevOut = res.witnessUtxo;
    if (prevOut && !disableScriptCheck)
        checkScript(prevOut && prevOut.script, res.redeemScript, res.witnessScript);
    return res;
}
export function getInputType(input, allowLegacyWitnessUtxo = false) {
    let txType = 'legacy';
    let defaultSighash = SignatureHash.ALL;
    const prevOut = getPrevOut(input);
    const first = OutScript.decode(prevOut.script);
    let type = first.type;
    let cur = first;
    const stack = [first];
    if (first.type === 'tr') {
        defaultSighash = SignatureHash.DEFAULT;
        return {
            txType: 'taproot',
            type: 'tr',
            last: first,
            lastScript: prevOut.script,
            defaultSighash,
            sighash: input.sighashType || defaultSighash,
        };
    }
    else {
        if (first.type === 'wpkh' || first.type === 'wsh')
            txType = 'segwit';
        if (first.type === 'sh') {
            if (!input.redeemScript)
                throw new Error('inputType: sh without redeemScript');
            let child = OutScript.decode(input.redeemScript);
            if (child.type === 'wpkh' || child.type === 'wsh')
                txType = 'segwit';
            stack.push(child);
            cur = child;
            type += `-${child.type}`;
        }
        // wsh can be inside sh
        if (cur.type === 'wsh') {
            if (!input.witnessScript)
                throw new Error('inputType: wsh without witnessScript');
            let child = OutScript.decode(input.witnessScript);
            if (child.type === 'wsh')
                txType = 'segwit';
            stack.push(child);
            cur = child;
            type += `-${child.type}`;
        }
        const last = stack[stack.length - 1];
        if (last.type === 'sh' || last.type === 'wsh')
            throw new Error('inputType: sh/wsh cannot be terminal type');
        const lastScript = OutScript.encode(last);
        const res = {
            type,
            txType,
            last,
            lastScript,
            defaultSighash,
            sighash: input.sighashType || defaultSighash,
        };
        if (txType === 'legacy' && !allowLegacyWitnessUtxo && !input.nonWitnessUtxo) {
            throw new Error(`Transaction/sign: legacy input without nonWitnessUtxo, can result in attack that forces paying higher fees. Pass allowLegacyWitnessUtxo=true, if you sure`);
        }
        return res;
    }
}
export const toVsize = (weight) => Math.ceil(weight / 4);
function estimateInput(inputType, input, opts) {
    let script = P.EMPTY, witness;
    // schnorr sig is always 64 bytes. except for cases when sighash is not default!
    if (inputType.txType === 'taproot') {
        const SCHNORR_SIG_SIZE = inputType.sighash !== SignatureHash.DEFAULT ? 65 : 64;
        if (input.tapInternalKey && !P.equalBytes(input.tapInternalKey, TAPROOT_UNSPENDABLE_KEY)) {
            witness = [new Uint8Array(SCHNORR_SIG_SIZE)];
        }
        else if (input.tapLeafScript) {
            // If user want to select specific leaf (which can signed, it is possible to remove all other leafs manually);
            // Sort leafs by control block length.
            const leafs = input.tapLeafScript.sort((a, b) => psbt.TaprootControlBlock.encode(a[0]).length -
                psbt.TaprootControlBlock.encode(b[0]).length);
            for (const [cb, _script] of leafs) {
                // Last byte is version
                const script = _script.slice(0, -1);
                const outScript = OutScript.decode(script);
                let signatures = [];
                if (outScript.type === 'tr_ms') {
                    const m = outScript.m;
                    for (let i = 0; i < m; i++)
                        signatures.push(new Uint8Array(SCHNORR_SIG_SIZE));
                    const n = outScript.pubkeys.length - m;
                    for (let i = 0; i < n; i++)
                        signatures.push(P.EMPTY);
                }
                else if (outScript.type === 'tr_ns') {
                    for (const _pub of outScript.pubkeys)
                        signatures.push(new Uint8Array(SCHNORR_SIG_SIZE));
                }
                else if (_script[0] == 32 &&
                    _script[33] == 172 &&
                    _script[34] == 0 &&
                    _script[35] == 99) {
                    signatures.push(new Uint8Array(SCHNORR_SIG_SIZE));
                }
                else {
                    throw new Error('Finalize: Unknown tapLeafScript');
                }
                // Witness is stack, so last element will be used first
                witness = signatures.reverse().concat([script, psbt.TaprootControlBlock.encode(cb)]);
                break;
            }
        }
        else
            throw new Error('estimateInput/taproot: unknown input');
    }
    else {
        // It is possible to grind signatures until it has minimal size (but changing fee value +N satoshi),
        // which will make estimations exact. But will be very hard for multi sig (need to make sure all signatures has small size).
        const SIG_SIZE = 72; // Maximum size of signatures
        const PUB_KEY_SIZE = 33;
        let inputScript = P.EMPTY;
        let inputWitness = [];
        if (inputType.last.type === 'ms') {
            const m = inputType.last.m;
            const sig = [0];
            for (let i = 0; i < m; i++)
                sig.push(new Uint8Array(SIG_SIZE));
            inputScript = Script.encode(sig);
        }
        else if (inputType.last.type === 'pk') {
            // 71 sig + 1 sighash
            inputScript = Script.encode([new Uint8Array(SIG_SIZE)]);
        }
        else if (inputType.last.type === 'pkh') {
            inputScript = Script.encode([new Uint8Array(SIG_SIZE), new Uint8Array(PUB_KEY_SIZE)]);
        }
        else if (inputType.last.type === 'wpkh') {
            inputScript = P.EMPTY;
            inputWitness = [new Uint8Array(SIG_SIZE), new Uint8Array(PUB_KEY_SIZE)];
        }
        else if (inputType.last.type === 'unknown' && !opts.allowUnknownInputs)
            throw new Error('Unknown inputs not allowed');
        if (inputType.type.includes('wsh-')) {
            // P2WSH
            if (inputScript.length && inputType.lastScript.length) {
                inputWitness = Script.decode(inputScript).map((i) => {
                    if (i === 0)
                        return P.EMPTY;
                    if (isBytes(i))
                        return i;
                    throw new Error(`Wrong witness op=${i}`);
                });
            }
            inputWitness = inputWitness.concat(inputType.lastScript);
        }
        if (inputType.txType === 'segwit')
            witness = inputWitness;
        if (inputType.type.startsWith('sh-wsh-')) {
            script = Script.encode([Script.encode([0, new Uint8Array(sha256.outputLen)])]);
        }
        else if (inputType.type.startsWith('sh-')) {
            script = Script.encode([...Script.decode(inputScript), inputType.lastScript]);
        }
        else if (inputType.type.startsWith('wsh-')) {
        }
        else if (inputType.txType !== 'segwit')
            script = inputScript;
    }
    let weight = 160 + 4 * VarBytes.encode(script).length;
    let hasWitnesses = false;
    if (witness) {
        weight += RawWitness.encode(witness).length;
        hasWitnesses = true;
    }
    return { weight, hasWitnesses };
}
// Exported for tests, internal method
export const _cmpBig = (a, b) => {
    const n = a - b;
    if (n < 0n)
        return -1;
    else if (n > 0n)
        return 1;
    return 0;
};
function getScript(o, opts = {}, network = NETWORK) {
    let script;
    if ('script' in o && o.script instanceof Uint8Array) {
        script = o.script;
    }
    if ('address' in o) {
        if (typeof o.address !== 'string')
            throw new Error(`Estimator: wrong output address=${o.address}`);
        script = OutScript.encode(Address(network).decode(o.address));
    }
    if (!script)
        throw new Error('Estimator: wrong output script');
    if (typeof o.amount !== 'bigint')
        throw new Error(`Estimator: wrong output amount=${o.amount}`);
    if (script && !opts.allowUnknownOutputs && OutScript.decode(script).type === 'unknown') {
        throw new Error('Estimator: unknown output script type, there is a chance that input is unspendable. Pass allowUnknownOutputs=true, if you sure');
    }
    if (!opts.disableScriptCheck)
        checkScript(script);
    return script;
}
// class, because we need to re-use normalized inputs, instead of parsing each time
// internal stuff, exported for tests only
export class _Estimator {
    constructor(inputs, outputs, opts) {
        this.inputs = inputs;
        this.outputs = outputs;
        this.opts = opts;
        // https://github.com/bitcoin/bitcoin/blob/f90603ac6d24f5263649675d51233f1fce8b2ecd/src/policy/policy.cpp#L44
        // 32 + 4 + 1 + 107 + 4
        // Dust used in accumExact + change address algo
        // - change address: can be smaller for segwit
        // - accumExact: ???
        this.dust = 148n; // compat with coinselect
        if (typeof opts.feePerByte !== 'bigint')
            throw new Error(`Estimator: wrong feePerByte=${opts.feePerByte}`);
        if (opts.dust) {
            if (typeof opts.dust !== 'bigint')
                throw new Error(`Estimator: wrong dust=${opts.dust}`);
            this.dust = opts.dust;
        }
        const network = opts.network || NETWORK;
        let amount = 0n;
        // Base weight: tx with outputs, no inputs
        let baseWeight = 32;
        for (const o of outputs) {
            const script = getScript(o, opts, opts.network);
            baseWeight += 32 + 4 * VarBytes.encode(script).length;
            amount += o.amount;
        }
        if (typeof opts.changeAddress !== 'string')
            throw new Error(`Estimator: wrong change address=${opts.changeAddress}`);
        let changeWeight = baseWeight +
            32 +
            4 * VarBytes.encode(OutScript.encode(Address(network).decode(opts.changeAddress))).length;
        baseWeight += 4 * CompactSizeLen.encode(outputs.length).length;
        // If there a lot of outputs change can change fee
        changeWeight += 4 * CompactSizeLen.encode(outputs.length + 1).length;
        this.baseWeight = baseWeight;
        this.changeWeight = changeWeight;
        this.amount = amount;
        this.normalizedInputs = this.inputs.map((i) => {
            const normalized = normalizeInput(i, undefined, undefined, opts.disableScriptCheck);
            inputBeforeSign(normalized); // check fields
            const inputType = getInputType(normalized, opts.allowLegacyWitnessUtxo);
            const prev = getPrevOut(normalized);
            const estimate = estimateInput(inputType, normalized, this.opts);
            const value = prev.amount - opts.feePerByte * BigInt(toVsize(estimate.weight)); // value = amount-fee
            return { inputType, normalized, amount: prev.amount, value, estimate };
        });
    }
    checkInputIdx(idx) {
        if (!Number.isSafeInteger(idx) || 0 > idx || idx >= this.inputs.length)
            throw new Error(`Wrong input index=${idx}`);
        return idx;
    }
    sortIndices(indices) {
        return indices.slice().sort((a, b) => {
            const ai = this.normalizedInputs[this.checkInputIdx(a)];
            const bi = this.normalizedInputs[this.checkInputIdx(b)];
            const out = compareBytes(ai.normalized.txid, bi.normalized.txid);
            if (out !== 0)
                return out;
            return ai.normalized.index - bi.normalized.index;
        });
    }
    sortOutputs(outputs) {
        const scripts = outputs.map((o) => getScript(o, this.opts, this.opts.network));
        const indices = outputs.map((_, j) => j);
        return indices.sort((a, b) => {
            const aa = outputs[a].amount;
            const ba = outputs[b].amount;
            const out = _cmpBig(aa, ba);
            if (out !== 0)
                return out;
            return compareBytes(scripts[a], scripts[b]);
        });
    }
    getSatoshi(weigth) {
        return this.opts.feePerByte * BigInt(toVsize(weigth));
    }
    // Sort by value instead of amount
    get biggest() {
        return this.inputs
            .map((_i, j) => j)
            .sort((a, b) => _cmpBig(this.normalizedInputs[b].value, this.normalizedInputs[a].value));
    }
    get smallest() {
        return this.biggest.reverse();
    }
    // These assume that UTXO array has historical order.
    // Otherwise, we have no way to know which tx is oldest
    // Explorers usually give UTXO in this order.
    get oldest() {
        return this.inputs.map((_i, j) => j);
    }
    get newest() {
        return this.oldest.reverse();
    }
    // exact - like blackjack from coinselect.
    // exact(biggest) will select one big utxo which is closer to targetValue+dust, if possible.
    // If not, it will accumulate largest utxo until value is close to targetValue+dust.
    accumulate(indices, exact = false, skipNegative = true, all = false) {
        const { feePerByte } = this.opts;
        // TODO: how to handle change addresses?
        // - cost of input
        // - cost of change output (if input requires change)
        // - cost of output spending
        // Dust threshold should be significantly bigger, no point in
        // creating an output, which cannot be spent.
        // coinselect doesn't consider cost of output address for dust.
        // Changing that can actually reduce privacy
        let weight = this.opts.alwaysChange ? this.changeWeight : this.baseWeight;
        let hasWitnesses = false;
        let num = 0;
        let inputsAmount = 0n;
        const targetAmount = this.amount;
        const res = [];
        let fee;
        for (const idx of indices) {
            this.checkInputIdx(idx);
            const { estimate, amount, value } = this.normalizedInputs[idx];
            let newWeight = weight + estimate.weight;
            if (!hasWitnesses && estimate.hasWitnesses)
                newWeight += 2; // enable witness if needed
            const totalWeight = newWeight + 4 * CompactSizeLen.encode(num).length; // number of outputs can change weight
            fee = this.getSatoshi(totalWeight);
            // Best case scenario exact(biggest) -> we find biggest output, less than target+threshold
            if (exact) {
                const dust = this.dust * feePerByte;
                // skip if added value is bigger than dust
                if (amount + inputsAmount > targetAmount + fee + dust)
                    continue;
            }
            // Negative: cost of using input is more than value provided (negative)
            // By default 'blackjack' mode in coinselect doesn't use that, which means
            // it will use negative output if sorted by 'smallest'
            if (skipNegative && value <= 0n)
                continue;
            weight = newWeight;
            if (estimate.hasWitnesses)
                hasWitnesses = true;
            num++;
            inputsAmount += amount;
            res.push(idx);
            // inputsAmount is enough to cover cost of tx
            if (!all && targetAmount + fee < inputsAmount)
                return { indices: res, fee, weight: totalWeight, total: inputsAmount };
        }
        if (all) {
            const newWeight = weight + 4 * CompactSizeLen.encode(num).length;
            return { indices: res, fee, weight: newWeight, total: inputsAmount };
        }
        return undefined;
    }
    // Works like coinselect default method
    default() {
        const { biggest } = this;
        const exact = this.accumulate(biggest, true, false);
        if (exact)
            return exact;
        return this.accumulate(biggest);
    }
    select(strategy) {
        if (strategy === 'all') {
            return this.accumulate(this.inputs.map((_, j) => j), false, true, true);
        }
        if (strategy === 'default')
            return this.default();
        const data = {
            Oldest: () => this.oldest,
            Newest: () => this.newest,
            Smallest: () => this.smallest,
            Biggest: () => this.biggest,
        };
        if (strategy.startsWith('exact')) {
            const [exactData, left] = strategy.slice(5).split('/');
            if (!data[exactData])
                throw new Error(`Estimator.select: wrong strategy=${strategy}`);
            strategy = left;
            const exact = this.accumulate(data[exactData](), true, true);
            if (exact)
                return exact;
        }
        if (strategy.startsWith('accum')) {
            const accumData = strategy.slice(5);
            if (!data[accumData])
                throw new Error(`Estimator.select: wrong strategy=${strategy}`);
            return this.accumulate(data[accumData]());
        }
        throw new Error(`Estimator.select: wrong strategy=${strategy}`);
    }
    result(strategy) {
        const s = this.select(strategy);
        if (!s)
            return;
        const { indices, weight, total } = s;
        let needChange = this.opts.alwaysChange;
        const changeWeight = this.opts.alwaysChange
            ? weight
            : weight + (this.changeWeight - this.baseWeight);
        const changeFee = this.getSatoshi(changeWeight);
        let fee = s.fee;
        const change = total - this.amount - changeFee;
        if (change > this.dust)
            needChange = true;
        let inputs = indices;
        let outputs = Array.from(this.outputs);
        if (needChange) {
            fee = changeFee;
            // this shouldn't happen!
            if (change < 0n)
                throw new Error(`Estimator.result: negative change=${change}`);
            outputs.push({ address: this.opts.changeAddress, amount: change });
        }
        if (this.opts.bip69) {
            inputs = this.sortIndices(inputs);
            outputs = this.sortOutputs(outputs).map((i) => outputs[i]);
        }
        const res = {
            inputs: inputs.map((i) => this.inputs[i]),
            outputs,
            fee,
            weight: this.opts.alwaysChange ? s.weight : changeWeight,
            change: !!needChange,
        };
        let tx;
        if (this.opts.createTx) {
            const { inputs, outputs } = res;
            tx = new Transaction(this.opts);
            for (const i of inputs)
                tx.addInput(i);
            for (const o of outputs)
                tx.addOutput({ ...o, script: getScript(o, this.opts, this.opts.network) });
        }
        return { ...res, tx };
    }
}
export function selectUTXO(inputs, outputs, strategy, opts) {
    // Defaults: do we want bip69 by default?
    const _opts = { createTx: true, bip69: true, ...opts };
    const est = new _Estimator(inputs, outputs, _opts);
    return est.result(strategy);
}
//# sourceMappingURL=utxo.js.map