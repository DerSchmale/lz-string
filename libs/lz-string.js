// Copyright (c) 2013 Pieroxy <pieroxy@pieroxy.net>
// This work is free. You can redistribute it and/or modify it
// under the terms of the WTFPL, Version 2
// For more information see LICENSE.txt or http://www.wtfpl.net/
//
// For more information, the home page:
// http://pieroxy.net/blog/pages/lz-string/testing.html
//
// LZ-based compression algorithm, version 1.4.4

// private property
const f = String.fromCharCode;
const keyStrBase64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
const keyStrUriSafe = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$";
const baseReverseDic = {};

function getBaseValue(alphabet, character)
{
    if (!baseReverseDic[alphabet]) {
        baseReverseDic[alphabet] = {};
        for (let i = 0; i < alphabet.length; i++) {
            baseReverseDic[alphabet][alphabet.charAt(i)] = i;
        }
    }
    return baseReverseDic[alphabet][character];
}

export function compressToBase64(input)
{
    if (input === null) return "";
    const res = _compress(input, 6, a => keyStrBase64.charAt(a));
    switch (res.length % 4) { // To produce valid Base64
        default: // When could this happen ?
        case 0 :
            return res;
        case 1 :
            return res + "===";
        case 2 :
            return res + "==";
        case 3 :
            return res + "=";
    }
}

export function decompressFromBase64(input)
{
    if (input === null) return "";
    if (input === "") return null;
    return _decompress(input.length, 32, index => getBaseValue(keyStrBase64, input.charAt(index)));
}

export function compressToUTF16(input)
{
    if (input === null) return "";
    return _compress(input, 15, a => f(a + 32)) + " ";
}

export function decompressFromUTF16(compressed)
{
    if (compressed === null) return "";
    if (compressed === "") return null;
    return _decompress(compressed.length, 16384, index => compressed.charCodeAt(index) - 32);
}

//compress into uint8array (UCS-2 big endian format)
export function compressToUint8Array(uncompressed)
{
    const compressed = compress(uncompressed);
    const buf = new Uint8Array(compressed.length * 2); // 2 bytes per character

    for (let i = 0, TotalLen = compressed.length; i < TotalLen; i++) {
        const current_value = compressed.charCodeAt(i);
        buf[i * 2] = current_value >>> 8;
        buf[i * 2 + 1] = current_value % 256;
    }
    return buf;
}

//decompress from uint8array (UCS-2 big endian format)
export function decompressFromUint8Array(compressed)
{
    if (compressed === null || compressed === undefined) {
        return decompress(compressed);
    } else {
        const buf = new Array(compressed.length / 2); // 2 bytes per character
        for (let i = 0, TotalLen = buf.length; i < TotalLen; i++) {
            buf[i] = compressed[i * 2] * 256 + compressed[i * 2 + 1];
        }

        const result = [];
        buf.forEach(c => result.push(f(c)));
        return decompress(result.join(''));
    }
}


//compress into a string that is already URI encoded
export function compressToEncodedURIComponent(input)
{
    if (input === null) return "";
    return _compress(input, 6, a => keyStrUriSafe.charAt(a));
}

//decompress from an output of compressToEncodedURIComponent
export function decompressFromEncodedURIComponent(input)
{
    if (input === null) return "";
    if (input === "") return null;
    input = input.replace(/ /g, "+");
    return _decompress(input.length, 32, index => getBaseValue(keyStrUriSafe, input.charAt(index)));
}

export function compress(uncompressed)
{
    return _compress(uncompressed, 16, a => f(a));
}

function _compress(uncompressed, bitsPerChar, getCharFromInt)
{
    if (uncompressed === null) return "";
    let value,
        context_dictionary = {},
        context_dictionaryToCreate = {},
        context_c = "",
        context_wc = "",
        context_w = "",
        context_enlargeIn = 2, // Compensate for the first entry which should not count
        context_dictSize = 3,
        context_numBits = 2,
        context_data = [],
        context_data_val = 0,
        context_data_position = 0;

    // these are extracted to reduce code duplication
    function _adv(count, initValue)
    {
        value = initValue;
        for (let i = 0; i < count; i++) {
            context_data_val = (context_data_val << 1) | (value & 1);
            if (context_data_position === bitsPerChar - 1) {
                context_data_position = 0;
                context_data.push(getCharFromInt(context_data_val));
                context_data_val = 0;
            } else {
                context_data_position++;
            }
            value = value >> 1;
        }
    }

    function _comp()
    {
        if (Object.prototype.hasOwnProperty.call(context_dictionaryToCreate, context_w)) {
            if (context_w.charCodeAt(0) < 256) {
                for (let i = 0; i < context_numBits; i++) {
                    context_data_val = (context_data_val << 1);
                    if (context_data_position === bitsPerChar - 1) {
                        context_data_position = 0;
                        context_data.push(getCharFromInt(context_data_val));
                        context_data_val = 0;
                    } else {
                        context_data_position++;
                    }
                }

                _adv(8, context_w.charCodeAt(0));
            } else {
                value = 1;
                for (let i = 0; i < context_numBits; i++) {
                    context_data_val = (context_data_val << 1) | value;
                    if (context_data_position === bitsPerChar - 1) {
                        context_data_position = 0;
                        context_data.push(getCharFromInt(context_data_val));
                        context_data_val = 0;
                    } else {
                        context_data_position++;
                    }
                    value = 0;
                }
                _adv(16, context_w.charCodeAt(0));
            }
            context_enlargeIn--;
            if (context_enlargeIn === 0) {
                context_enlargeIn = Math.pow(2, context_numBits);
                context_numBits++;
            }
            delete context_dictionaryToCreate[context_w];
        } else {
            _adv(context_numBits, context_dictionary[context_w]);
        }

        context_enlargeIn--;
        if (--context_enlargeIn === 0) {
            context_enlargeIn = Math.pow(2, context_numBits);
            context_numBits++;
        }
    }

    for (let ii = 0; ii < uncompressed.length; ++ii) {
        context_c = uncompressed.charAt(ii);
        if (!Object.prototype.hasOwnProperty.call(context_dictionary, context_c)) {
            context_dictionary[context_c] = context_dictSize++;
            context_dictionaryToCreate[context_c] = true;
        }

        context_wc = context_w + context_c;
        if (Object.prototype.hasOwnProperty.call(context_dictionary, context_wc)) {
            context_w = context_wc;
        } else {
            _comp();

            // Add wc to the dictionary.
            context_dictionary[context_wc] = context_dictSize++;
            context_w = String(context_c);
        }
    }

    // Output the code for w.
    if (context_w !== "") {
        _comp();
    }

    // Mark the end of the stream
    _adv(context_numBits, 2);

    // Flush the last char
    while (true) {
        context_data_val = (context_data_val << 1);
        if (context_data_position === bitsPerChar - 1) {
            context_data.push(getCharFromInt(context_data_val));
            break;
        } else context_data_position++;
    }
    return context_data.join('');
}


export function decompress(compressed)
{
    if (compressed === null) return "";
    if (compressed === "") return null;
    return _decompress(compressed.length, 32768, function (index) {
        return compressed.charCodeAt(index);
    });
}

function _decompress(length, resetValue, getNextValue)
{
    let dictionary = [],
        next,
        enlargeIn = 4,
        dictSize = 4,
        numBits = 3,
        entry = "",
        result = [],
        i,
        w,
        bits,
        c,
        data = {val: getNextValue(0), position: resetValue, index: 1};

    for (i = 0; i < 3; ++i) {
        dictionary[i] = i;
    }

    function _getBits(data, numBits)
    {
        const maxpower = Math.pow(2, numBits);
        bits = 0;
        let power = 1;
        while (power !== maxpower) {
            const resb = data.val & data.position;
            data.position >>= 1;
            if (data.position === 0) {
                data.position = resetValue;
                data.val = getNextValue(data.index++);
            }
            bits |= (resb > 0 ? 1 : 0) * power;
            power <<= 1;
        }
        return bits;
    }

    _getBits(data, 2);

    switch (next = bits) {
        case 0:
            _getBits(data, 8);
            c = f(bits);
            break;
        case 1:
            _getBits(data, 16);
            c = f(bits);
            break;
        case 2:
            return "";
    }
    dictionary[3] = c;
    w = c;
    result.push(c);
    while (true) {
        if (data.index > length) {
            return "";
        }

        _getBits(numBits);

        switch (c = bits) {
            case 0:
                _getBits(8);

                dictionary[dictSize++] = f(bits);
                c = dictSize - 1;
                enlargeIn--;
                break;
            case 1:
                _getBits(16);
                dictionary[dictSize++] = f(bits);
                c = dictSize - 1;
                enlargeIn--;
                break;
            case 2:
                return result.join('');
        }

        if (enlargeIn === 0) {
            enlargeIn = Math.pow(2, numBits);
            numBits++;
        }

        if (dictionary[c]) {
            entry = dictionary[c];
        } else {
            if (c === dictSize) {
                entry = w + w.charAt(0);
            } else {
                return null;
            }
        }
        result.push(entry);

        // Add w+entry[0] to the dictionary.
        dictionary[dictSize++] = w + entry.charAt(0);
        enlargeIn--;

        w = entry;

        if (enlargeIn === 0) {
            enlargeIn = Math.pow(2, numBits);
            numBits++;
        }

    }
}