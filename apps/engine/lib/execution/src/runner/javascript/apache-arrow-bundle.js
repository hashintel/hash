export var arrow;
/******/ (() => {
  // webpackBootstrap
  /******/ "use strict";
  /******/ var __webpack_modules__ = {
    /***/ 35: /***/ (
      __unused_webpack_module,
      __webpack_exports__,
      __webpack_require__,
    ) => {
      // ESM COMPAT FLAG
      __webpack_require__.r(__webpack_exports__);

      // EXPORTS
      __webpack_require__.d(__webpack_exports__, {
        TextDecoder: () => /* reexport */ TextDecoder,
        TextEncoder: () => /* reexport */ TextEncoder,
      }); // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/encoding/defaultEncoding.js

      /** @const */ const DEFAULT_ENCODING = "utf-8"; // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/encoding/encodings.js
      //# sourceMappingURL=defaultEncoding.js.map
      /**
       * @param {boolean} fatal If true, decoding errors raise an exception.
       * @param {number=} opt_code_point Override the standard fallback code point.
       * @return {number} The code point to insert on a decoding error.
       */
      function decoderError(fatal, opt_code_point = undefined) {
        if (fatal) throw TypeError("Decoder error");
        return opt_code_point || 0xfffd;
      }
      /**
       * @param {number} code_point The code point that could not be encoded.
       * @return {number} Always throws, no value is actually returned.
       */
      function encoderError(code_point) {
        throw TypeError(
          "The code point " + code_point + " could not be encoded.",
        );
      }
      // 5.2 Names and labels
      // TODO: Define @typedef for Encoding: {name:string,labels:Array.<string>}
      // https://github.com/google/closure-compiler/issues/247
      /**
       * @param {string} label The encoding label.
       * @return {?{name:string,labels:Array.<string>}}
       */
      function getEncoding(label) {
        // 1. Remove any leading and trailing ASCII whitespace from label.
        const keyLabel = String(label).trim().toLowerCase();
        // 2. If label is an ASCII case-insensitive match for any of the
        // labels listed in the table below, return the corresponding
        // encoding, and failure otherwise.
        if (keyLabel in label_to_encoding) {
          return label_to_encoding[keyLabel];
        }
        return null;
      }
      /**
       * Encodings table: https://encoding.spec.whatwg.org/encodings.json
       * @const
       * @type {!Array.<{
       *          heading: string,
       *          encodings: Array.<{name:string,labels:Array.<string>}>
       *        }>}
       */
      const encodings = [
        {
          encodings: [
            {
              labels: ["unicode-1-1-utf-8", "utf-8", "utf8"],
              name: "UTF-8",
            },
          ],
          heading: "The Encoding",
        },
        {
          encodings: [
            {
              labels: ["866", "cp866", "csibm866", "ibm866"],
              name: "IBM866",
            },
            {
              labels: [
                "csisolatin2",
                "iso-8859-2",
                "iso-ir-101",
                "iso8859-2",
                "iso88592",
                "iso_8859-2",
                "iso_8859-2:1987",
                "l2",
                "latin2",
              ],
              name: "ISO-8859-2",
            },
            {
              labels: [
                "csisolatin3",
                "iso-8859-3",
                "iso-ir-109",
                "iso8859-3",
                "iso88593",
                "iso_8859-3",
                "iso_8859-3:1988",
                "l3",
                "latin3",
              ],
              name: "ISO-8859-3",
            },
            {
              labels: [
                "csisolatin4",
                "iso-8859-4",
                "iso-ir-110",
                "iso8859-4",
                "iso88594",
                "iso_8859-4",
                "iso_8859-4:1988",
                "l4",
                "latin4",
              ],
              name: "ISO-8859-4",
            },
            {
              labels: [
                "csisolatincyrillic",
                "cyrillic",
                "iso-8859-5",
                "iso-ir-144",
                "iso8859-5",
                "iso88595",
                "iso_8859-5",
                "iso_8859-5:1988",
              ],
              name: "ISO-8859-5",
            },
            {
              labels: [
                "arabic",
                "asmo-708",
                "csiso88596e",
                "csiso88596i",
                "csisolatinarabic",
                "ecma-114",
                "iso-8859-6",
                "iso-8859-6-e",
                "iso-8859-6-i",
                "iso-ir-127",
                "iso8859-6",
                "iso88596",
                "iso_8859-6",
                "iso_8859-6:1987",
              ],
              name: "ISO-8859-6",
            },
            {
              labels: [
                "csisolatingreek",
                "ecma-118",
                "elot_928",
                "greek",
                "greek8",
                "iso-8859-7",
                "iso-ir-126",
                "iso8859-7",
                "iso88597",
                "iso_8859-7",
                "iso_8859-7:1987",
                "sun_eu_greek",
              ],
              name: "ISO-8859-7",
            },
            {
              labels: [
                "csiso88598e",
                "csisolatinhebrew",
                "hebrew",
                "iso-8859-8",
                "iso-8859-8-e",
                "iso-ir-138",
                "iso8859-8",
                "iso88598",
                "iso_8859-8",
                "iso_8859-8:1988",
                "visual",
              ],
              name: "ISO-8859-8",
            },
            {
              labels: ["csiso88598i", "iso-8859-8-i", "logical"],
              name: "ISO-8859-8-I",
            },
            {
              labels: [
                "csisolatin6",
                "iso-8859-10",
                "iso-ir-157",
                "iso8859-10",
                "iso885910",
                "l6",
                "latin6",
              ],
              name: "ISO-8859-10",
            },
            {
              labels: ["iso-8859-13", "iso8859-13", "iso885913"],
              name: "ISO-8859-13",
            },
            {
              labels: ["iso-8859-14", "iso8859-14", "iso885914"],
              name: "ISO-8859-14",
            },
            {
              labels: [
                "csisolatin9",
                "iso-8859-15",
                "iso8859-15",
                "iso885915",
                "iso_8859-15",
                "l9",
              ],
              name: "ISO-8859-15",
            },
            {
              labels: ["iso-8859-16"],
              name: "ISO-8859-16",
            },
            {
              labels: ["cskoi8r", "koi", "koi8", "koi8-r", "koi8_r"],
              name: "KOI8-R",
            },
            {
              labels: ["koi8-ru", "koi8-u"],
              name: "KOI8-U",
            },
            {
              labels: ["csmacintosh", "mac", "macintosh", "x-mac-roman"],
              name: "macintosh",
            },
            {
              labels: [
                "dos-874",
                "iso-8859-11",
                "iso8859-11",
                "iso885911",
                "tis-620",
                "windows-874",
              ],
              name: "windows-874",
            },
            {
              labels: ["cp1250", "windows-1250", "x-cp1250"],
              name: "windows-1250",
            },
            {
              labels: ["cp1251", "windows-1251", "x-cp1251"],
              name: "windows-1251",
            },
            {
              labels: [
                "ansi_x3.4-1968",
                "cp1252",
                "cp819",
                "ibm819",
                "iso-ir-100",
                "windows-1252",
                "x-cp1252",
              ],
              name: "windows-1252",
            },
            {
              labels: [
                "ascii",
                "us-ascii",
                "iso-8859-1",
                "iso8859-1",
                "iso88591",
                "iso_8859-1",
                "iso_8859-1:1987",
                "l1",
                "latin1",
                "csisolatin1",
              ],
              name: "iso-8859-1",
            },
            {
              labels: ["cp1253", "windows-1253", "x-cp1253"],
              name: "windows-1253",
            },
            {
              labels: [
                "cp1254",
                "csisolatin5",
                "iso-8859-9",
                "iso-ir-148",
                "iso8859-9",
                "iso88599",
                "iso_8859-9",
                "iso_8859-9:1989",
                "l5",
                "latin5",
                "windows-1254",
                "x-cp1254",
              ],
              name: "windows-1254",
            },
            {
              labels: ["cp1255", "windows-1255", "x-cp1255"],
              name: "windows-1255",
            },
            {
              labels: ["cp1256", "windows-1256", "x-cp1256"],
              name: "windows-1256",
            },
            {
              labels: ["cp1257", "windows-1257", "x-cp1257"],
              name: "windows-1257",
            },
            {
              labels: ["cp1258", "windows-1258", "x-cp1258"],
              name: "windows-1258",
            },
            {
              labels: ["x-mac-cyrillic", "x-mac-ukrainian"],
              name: "x-mac-cyrillic",
            },
          ],
          heading: "Legacy single-byte encodings",
        },
        {
          encodings: [
            {
              labels: [
                "chinese",
                "csgb2312",
                "csiso58gb231280",
                "gb2312",
                "gb_2312",
                "gb_2312-80",
                "gbk",
                "iso-ir-58",
                "x-gbk",
              ],
              name: "GBK",
            },
            {
              labels: ["gb18030"],
              name: "gb18030",
            },
          ],
          heading: "Legacy multi-byte Chinese (simplified) encodings",
        },
        {
          encodings: [
            {
              labels: ["big5", "big5-hkscs", "cn-big5", "csbig5", "x-x-big5"],
              name: "Big5",
            },
          ],
          heading: "Legacy multi-byte Chinese (traditional) encodings",
        },
        {
          encodings: [
            {
              labels: ["cseucpkdfmtjapanese", "euc-jp", "x-euc-jp"],
              name: "EUC-JP",
            },
            {
              labels: ["csiso2022jp", "iso-2022-jp"],
              name: "ISO-2022-JP",
            },
            {
              labels: [
                "csshiftjis",
                "ms932",
                "ms_kanji",
                "shift-jis",
                "shift_jis",
                "sjis",
                "windows-31j",
                "x-sjis",
              ],
              name: "Shift_JIS",
            },
          ],
          heading: "Legacy multi-byte Japanese encodings",
        },
        {
          encodings: [
            {
              labels: [
                "cseuckr",
                "csksc56011987",
                "euc-kr",
                "iso-ir-149",
                "korean",
                "ks_c_5601-1987",
                "ks_c_5601-1989",
                "ksc5601",
                "ksc_5601",
                "windows-949",
              ],
              name: "EUC-KR",
            },
          ],
          heading: "Legacy multi-byte Korean encodings",
        },
        {
          encodings: [
            {
              labels: [
                "csiso2022kr",
                "hz-gb-2312",
                "iso-2022-cn",
                "iso-2022-cn-ext",
                "iso-2022-kr",
              ],
              name: "replacement",
            },
            {
              labels: ["utf-16be"],
              name: "UTF-16BE",
            },
            {
              labels: ["utf-16", "utf-16le"],
              name: "UTF-16LE",
            },
            {
              labels: ["x-user-defined"],
              name: "x-user-defined",
            },
          ],
          heading: "Legacy miscellaneous encodings",
        },
      ];
      // Label to encoding registry.
      /** @type {Object.<string,{name:string,labels:Array.<string>}>} */
      const label_to_encoding = {};
      encodings.forEach((category) => {
        category.encodings.forEach((encoding) => {
          encoding.labels.forEach((label) => {
            label_to_encoding[label] = encoding;
          });
        });
      }); // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/encoding/finished.js

      //# sourceMappingURL=encodings.js.map
      // 5.1 Encoders and decoders
      /** @const */
      const finished = -1; // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/helper/getArrayVal.js
      //# sourceMappingURL=finished.js.map
      function getArrayVal(idxVal) {
        return Array.isArray(idxVal) ? idxVal : [idxVal];
      } // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/encoding/utilities.js
      //# sourceMappingURL=getArrayVal.js.map
      /**
       * @param {number} a The number to test.
       * @param {number} min The minimum value in the range, inclusive.
       * @param {number} max The maximum value in the range, inclusive.
       * @return {boolean} True if a >= min and a <= max.
       */
      function inRange(a, min, max) {
        return min <= a && a <= max;
      }
      /**
       * @param {!Array.<*>} array The array to check.
       * @param {*} item The item to look for in the array.
       * @return {boolean} True if the item appears in the array.
       */
      function includes(array, item) {
        return array.indexOf(item) !== -1;
      }
      /**
       * @param {*} o
       * @return {Object}
       */
      function ToDictionary(o) {
        if (o === undefined || o === null) return {};
        if (o === Object(o)) return o;
        throw TypeError("Could not convert argument to dictionary");
      }
      /**
       * @param {string} string Input string of UTF-16 code units.
       * @return {!Array.<number>} Code points.
       */
      function stringToCodePoints(string) {
        // https://heycam.github.io/webidl/#dfn-obtain-unicode
        // 1. Let S be the DOMString value.
        const s = String(string);
        // 2. Let n be the length of S.
        const n = s.length;
        // 3. Initialize i to 0.
        let i = 0;
        // 4. Initialize U to be an empty sequence of Unicode characters.
        const u = [];
        // 5. While i < n:
        while (i < n) {
          // 1. Let c be the code unit in S at index i.
          const c = s.charCodeAt(i);
          // 2. Depending on the value of c:
          // c < 0xD800 or c > 0xDFFF
          if (c < 0xd800 || c > 0xdfff) {
            // Append to U the Unicode character with code point c.
            u.push(c);
          }
          // 0xDC00 ≤ c ≤ 0xDFFF
          else if (0xdc00 <= c && c <= 0xdfff) {
            // Append to U a U+FFFD REPLACEMENT CHARACTER.
            u.push(0xfffd);
          }
          // 0xD800 ≤ c ≤ 0xDBFF
          else if (0xd800 <= c && c <= 0xdbff) {
            // 1. If i = n−1, then append to U a U+FFFD REPLACEMENT
            // CHARACTER.
            if (i === n - 1) {
              u.push(0xfffd);
            }
            // 2. Otherwise, i < n−1:
            else {
              // 1. Let d be the code unit in S at index i+1.
              const d = s.charCodeAt(i + 1);
              // 2. If 0xDC00 ≤ d ≤ 0xDFFF, then:
              if (0xdc00 <= d && d <= 0xdfff) {
                // 1. Let a be c & 0x3FF.
                const a = c & 0x3ff;
                // 2. Let b be d & 0x3FF.
                const b = d & 0x3ff;
                // 3. Append to U the Unicode character with code point
                // 2^16+2^10*a+b.
                u.push(0x10000 + (a << 10) + b);
                // 4. Set i to i+1.
                i += 1;
              }
              // 3. Otherwise, d < 0xDC00 or d > 0xDFFF. Append to U a
              // U+FFFD REPLACEMENT CHARACTER.
              else {
                u.push(0xfffd);
              }
            }
          }
          // 3. Set i to i+1.
          i += 1;
        }
        // 6. Return U.
        return u;
      }
      /**
       * @param {!Array.<number>} code_points Array of code points.
       * @return {string} string String of UTF-16 code units.
       */
      function codePointsToString(code_points) {
        let s = "";
        for (let i = 0; i < code_points.length; ++i) {
          let cp = code_points[i];
          if (cp <= 0xffff) {
            s += String.fromCharCode(cp);
          } else {
            cp -= 0x10000;
            s += String.fromCharCode(
              (cp >> 10) + 0xd800,
              (cp & 0x3ff) + 0xdc00,
            );
          }
        }
        return s;
      } // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/helper/getGlobalScope.js
      //# sourceMappingURL=utilities.js.map
      function getGlobalScope() {
        if (typeof __webpack_require__.g !== "undefined")
          return __webpack_require__.g;
        if (typeof window !== "undefined") return window;
        if (typeof self !== "undefined") return self;
        return;
      } // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/encoding/encoding-indexes-provider.js
      //# sourceMappingURL=getGlobalScope.js.map
      let _encodingIndexes;
      function checkForEncodingIndexes() {
        if (typeof TextEncodingIndexes !== "undefined")
          return TextEncodingIndexes.encodingIndexes;
        const glo = getGlobalScope();
        if (!glo) return null;
        if ("TextEncodingIndexes" in glo)
          return __webpack_require__.g["TextEncodingIndexes"][
            "encodingIndexes"
          ];
        if ("encoding-indexes" in glo)
          return __webpack_require__.g["encodingIndexes"];
        return null;
      }
      function getEncodingIndexes() {
        if (_encodingIndexes) {
          return _encodingIndexes;
        }
        const indexes = checkForEncodingIndexes();
        if (!indexes) {
          return null;
        }
        _encodingIndexes = indexes;
        return indexes;
      } // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/encoding/indexes.js
      //# sourceMappingURL=encoding-indexes-provider.js.map
      /**
       * @param {number} pointer The |pointer| to search for.
       * @param {(!Array.<?number>|undefined)} index The |index| to search within.
       * @return {?number} The code point corresponding to |pointer| in |index|,
       *     or null if |code point| is not in |index|.
       */
      function indexCodePointFor(pointer, index) {
        if (!index) return null;
        return index[pointer] || null;
      }
      /**
       * @param {number} code_point The |code point| to search for.
       * @param {!Array.<?number>} index The |index| to search within.
       * @return {?number} The first pointer corresponding to |code point| in
       *     |index|, or null if |code point| is not in |index|.
       */
      function indexPointerFor(code_point, index) {
        const pointer = index.indexOf(code_point);
        return pointer === -1 ? null : pointer;
      }
      /**
       * @param {string} name Name of the index.
       * @return {(!Array.<number>|!Array.<Array.<number>>)}
       *  */
      function index(name) {
        const encodingIndexes = getEncodingIndexes();
        if (!encodingIndexes) {
          throw Error(
            "Indexes missing." +
              " Did you forget to include encoding-indexes.js first?",
          );
        }
        return encodingIndexes[name];
      }
      /**
       * @param {number} pointer The |pointer| to search for in the gb18030 index.
       * @return {?number} The code point corresponding to |pointer| in |index|,
       *     or null if |code point| is not in the gb18030 index.
       */
      function indexGB18030RangesCodePointFor(pointer) {
        // 1. If pointer is greater than 39419 and less than 189000, or
        // pointer is greater than 1237575, return null.
        if ((pointer > 39419 && pointer < 189000) || pointer > 1237575)
          return null;
        // 2. If pointer is 7457, return code point U+E7C7.
        if (pointer === 7457) return 0xe7c7;
        // 3. Let offset be the last pointer in index gb18030 ranges that
        // is equal to or less than pointer and let code point offset be
        // its corresponding code point.
        let offset = 0;
        let code_point_offset = 0;
        const idx = index("gb18030-ranges");
        for (let i = 0; i < idx.length; ++i) {
          /** @type {!Array.<number>} */
          const entry = getArrayVal(idx[i]);
          if (entry[0] <= pointer) {
            offset = entry[0];
            code_point_offset = entry[1];
          } else {
            break;
          }
        }
        // 4. Return a code point whose value is code point offset +
        // pointer − offset.
        return code_point_offset + pointer - offset;
      }
      /**
       * @param {number} code_point The |code point| to locate in the gb18030 index.
       * @return {number} The first pointer corresponding to |code point| in the
       *     gb18030 index.
       */
      function indexGB18030RangesPointerFor(code_point) {
        // 1. If code point is U+E7C7, return pointer 7457.
        if (code_point === 0xe7c7) return 7457;
        // 2. Let offset be the last code point in index gb18030 ranges
        // that is equal to or less than code point and let pointer offset
        // be its corresponding pointer.
        let offset = 0;
        let pointer_offset = 0;
        const idx = index("gb18030-ranges");
        for (let i = 0; i < idx.length; ++i) {
          const idxVal = idx[i];
          /** @type {!Array.<number>} */
          const entry = getArrayVal(idxVal);
          if (entry[1] <= code_point) {
            offset = entry[1];
            pointer_offset = entry[0];
          } else {
            break;
          }
        }
        // 3. Return a pointer whose value is pointer offset + code point
        // − offset.
        return pointer_offset + code_point - offset;
      }
      /**
       * @param {number} code_point The |code_point| to search for in the Shift_JIS
       *     index.
       * @return {?number} The code point corresponding to |pointer| in |index|,
       *     or null if |code point| is not in the Shift_JIS index.
       */
      function indexShiftJISPointerFor(code_point) {
        // 1. Let index be index jis0208 excluding all entries whose
        // pointer is in the range 8272 to 8835, inclusive.
        shift_jis_index =
          shift_jis_index ||
          index("jis0208").map(function (code_point, pointer) {
            return inRange(pointer, 8272, 8835) ? null : code_point;
          });
        const index_ = shift_jis_index;
        // 2. Return the index pointer for code point in index.
        return index_.indexOf(code_point);
      }
      let shift_jis_index;
      /**
       * @param {number} code_point The |code_point| to search for in the big5
       *     index.
       * @return {?number} The code point corresponding to |pointer| in |index|,
       *     or null if |code point| is not in the big5 index.
       */
      function indexBig5PointerFor(code_point) {
        // 1. Let index be index Big5 excluding all entries whose pointer
        big5_index_no_hkscs =
          big5_index_no_hkscs ||
          index("big5").map((code_point, pointer) =>
            pointer < (0xa1 - 0x81) * 157 ? null : code_point,
          );
        const index_ = big5_index_no_hkscs;
        // 2. If code point is U+2550, U+255E, U+2561, U+256A, U+5341, or
        // U+5345, return the last pointer corresponding to code point in
        // index.
        if (
          code_point === 0x2550 ||
          code_point === 0x255e ||
          code_point === 0x2561 ||
          code_point === 0x256a ||
          code_point === 0x5341 ||
          code_point === 0x5345
        ) {
          return index_.lastIndexOf(code_point);
        }
        // 3. Return the index pointer for code point in index.
        return indexPointerFor(code_point, index_);
      }
      let big5_index_no_hkscs; // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/encoding/terminology.js
      //# sourceMappingURL=indexes.js.map
      //
      // Implementation of Encoding specification
      // https://encoding.spec.whatwg.org/
      //
      //
      // 4. Terminology
      //
      /**
       * An ASCII byte is a byte in the range 0x00 to 0x7F, inclusive.
       * @param {number} a The number to test.
       * @return {boolean} True if a is in the range 0x00 to 0x7F, inclusive.
       */
      function isASCIIByte(a) {
        return 0x00 <= a && a <= 0x7f;
      }
      /**
       * An ASCII code point is a code point in the range U+0000 to
       * U+007F, inclusive.
       */
      const isASCIICodePoint = isASCIIByte;
      /**
       * End-of-stream is a special token that signifies no more tokens
       * are in the stream.
       * @const
       */ const end_of_stream = -1; // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/coders/big5/Big5Decoder.js
      //# sourceMappingURL=terminology.js.map
      /**
       * @constructor
       * @implements {Decoder}
       * @param {{fatal: boolean}} options
       */
      class Big5Decoder {
        constructor(options) {
          this.fatal = options.fatal;
          // Big5's decoder has an associated Big5 lead (initially 0x00).
          /** @type {number} */ this.Big5_lead = 0x00;
        }
        /**
         * @param {Stream} stream The stream of bytes being decoded.
         * @param {number} bite The next byte read from the stream.
         * @return {?(number|!Array.<number>)} The next code point(s)
         *     decoded, or null if not enough data exists in the input
         *     stream to decode a complete code point.
         */
        handler(stream, bite) {
          // 1. If byte is end-of-stream and Big5 lead is not 0x00, set
          // Big5 lead to 0x00 and return error.
          if (bite === end_of_stream && this.Big5_lead !== 0x00) {
            this.Big5_lead = 0x00;
            return decoderError(this.fatal);
          }
          // 2. If byte is end-of-stream and Big5 lead is 0x00, return
          // finished.
          if (bite === end_of_stream && this.Big5_lead === 0x00)
            return finished;
          // 3. If Big5 lead is not 0x00, let lead be Big5 lead, let
          // pointer be null, set Big5 lead to 0x00, and then run these
          // substeps:
          if (this.Big5_lead !== 0x00) {
            const lead = this.Big5_lead;
            let pointer = null;
            this.Big5_lead = 0x00;
            // 1. Let offset be 0x40 if byte is less than 0x7F and 0x62
            // otherwise.
            const offset = bite < 0x7f ? 0x40 : 0x62;
            // 2. If byte is in the range 0x40 to 0x7E, inclusive, or 0xA1
            // to 0xFE, inclusive, set pointer to (lead − 0x81) × 157 +
            // (byte − offset).
            if (inRange(bite, 0x40, 0x7e) || inRange(bite, 0xa1, 0xfe))
              pointer = (lead - 0x81) * 157 + (bite - offset);
            // 3. If there is a row in the table below whose first column
            // is pointer, return the two code points listed in its second
            // column
            // Pointer | Code points
            // --------+--------------
            // 1133    | U+00CA U+0304
            // 1135    | U+00CA U+030C
            // 1164    | U+00EA U+0304
            // 1166    | U+00EA U+030C
            switch (pointer) {
              case 1133:
                return [0x00ca, 0x0304];
              case 1135:
                return [0x00ca, 0x030c];
              case 1164:
                return [0x00ea, 0x0304];
              case 1166:
                return [0x00ea, 0x030c];
            }
            // 4. Let code point be null if pointer is null and the index
            // code point for pointer in index Big5 otherwise.
            const code_point =
              pointer === null
                ? null
                : indexCodePointFor(pointer, index("big5"));
            // 5. If code point is null and byte is an ASCII byte, prepend
            // byte to stream.
            if (code_point === null && isASCIIByte(bite)) stream.prepend(bite);
            // 6. If code point is null, return error.
            if (code_point === null) return decoderError(this.fatal);
            // 7. Return a code point whose value is code point.
            return code_point;
          }
          // 4. If byte is an ASCII byte, return a code point whose value
          // is byte.
          if (isASCIIByte(bite)) return bite;
          // 5. If byte is in the range 0x81 to 0xFE, inclusive, set Big5
          // lead to byte and return continue.
          if (inRange(bite, 0x81, 0xfe)) {
            this.Big5_lead = bite;
            return null;
          }
          // 6. Return error.
          return decoderError(this.fatal);
        }
      } // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/coders/big5/Big5Encoder.js
      //# sourceMappingURL=Big5Decoder.js.map
      /**
       * @constructor
       * @implements {Encoder}
       * @param {{fatal: boolean}} options
       */
      class Big5Encoder {
        constructor(options) {
          this.fatal = options.fatal;
        }
        /**
         * @param {Stream} stream Input stream.
         * @param {number} code_point Next code point read from the stream.
         * @return {(number|!Array.<number>)} Byte(s) to emit.
         */
        handler(stream, code_point) {
          // 1. If code point is end-of-stream, return finished.
          if (code_point === end_of_stream) return finished;
          // 2. If code point is an ASCII code point, return a byte whose
          // value is code point.
          if (isASCIICodePoint(code_point)) return code_point;
          // 3. Let pointer be the index Big5 pointer for code point.
          const pointer = indexBig5PointerFor(code_point);
          // 4. If pointer is null, return error with code point.
          if (pointer === null) return encoderError(code_point);
          // 5. Let lead be Math.floor(pointer / 157) + 0x81.
          const lead = Math.floor(pointer / 157) + 0x81;
          // 6. If lead is less than 0xA1, return error with code point.
          if (lead < 0xa1) return encoderError(code_point);
          // 7. Let trail be pointer % 157.
          const trail = pointer % 157;
          // 8. Let offset be 0x40 if trail is less than 0x3F and 0x62
          // otherwise.
          const offset = trail < 0x3f ? 0x40 : 0x62;
          // Return two bytes whose values are lead and trail + offset.
          return [lead, trail + offset];
        }
      } // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/coders/big5/index.js // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/coders/euc-jp/EUCJPDecoder.js
      //# sourceMappingURL=Big5Encoder.js.map
      //# sourceMappingURL=index.js.map
      /**
       * @constructor
       * @implements {Decoder}
       * @param {{fatal: boolean}} options
       */
      class EUCJPDecoder {
        constructor(options) {
          this.fatal = options.fatal;
          // euc-jp's decoder has an associated euc-jp jis0212 flag
          // (initially unset) and euc-jp lead (initially 0x00).
          /** @type {boolean} */ (this.eucjp_jis0212_flag = false),
            /** @type {number} */ (this.eucjp_lead = 0x00);
        }
        /**
         * @param {Stream} stream The stream of bytes being decoded.
         * @param {number} bite The next byte read from the stream.
         * @return {?(number|!Array.<number>)} The next code point(s)
         *     decoded, or null if not enough data exists in the input
         *     stream to decode a complete code point.
         */
        handler(stream, bite) {
          // 1. If byte is end-of-stream and euc-jp lead is not 0x00, set
          // euc-jp lead to 0x00, and return error.
          if (bite === end_of_stream && this.eucjp_lead !== 0x00) {
            this.eucjp_lead = 0x00;
            return decoderError(this.fatal);
          }
          // 2. If byte is end-of-stream and euc-jp lead is 0x00, return
          // finished.
          if (bite === end_of_stream && this.eucjp_lead === 0x00)
            return finished;
          // 3. If euc-jp lead is 0x8E and byte is in the range 0xA1 to
          // 0xDF, inclusive, set euc-jp lead to 0x00 and return a code
          // point whose value is 0xFF61 − 0xA1 + byte.
          if (this.eucjp_lead === 0x8e && inRange(bite, 0xa1, 0xdf)) {
            this.eucjp_lead = 0x00;
            return 0xff61 - 0xa1 + bite;
          }
          // 4. If euc-jp lead is 0x8F and byte is in the range 0xA1 to
          // 0xFE, inclusive, set the euc-jp jis0212 flag, set euc-jp lead
          // to byte, and return continue.
          if (this.eucjp_lead === 0x8f && inRange(bite, 0xa1, 0xfe)) {
            this.eucjp_jis0212_flag = true;
            this.eucjp_lead = bite;
            return null;
          }
          // 5. If euc-jp lead is not 0x00, let lead be euc-jp lead, set
          // euc-jp lead to 0x00, and run these substeps:
          if (this.eucjp_lead !== 0x00) {
            const lead = this.eucjp_lead;
            this.eucjp_lead = 0x00;
            // 1. Let code point be null.
            let code_point = null;
            // 2. If lead and byte are both in the range 0xA1 to 0xFE,
            // inclusive, set code point to the index code point for (lead
            // − 0xA1) × 94 + byte − 0xA1 in index jis0208 if the euc-jp
            // jis0212 flag is unset and in index jis0212 otherwise.
            if (inRange(lead, 0xa1, 0xfe) && inRange(bite, 0xa1, 0xfe)) {
              code_point = indexCodePointFor(
                (lead - 0xa1) * 94 + (bite - 0xa1),
                index(!this.eucjp_jis0212_flag ? "jis0208" : "jis0212"),
              );
            }
            // 3. Unset the euc-jp jis0212 flag.
            this.eucjp_jis0212_flag = false;
            // 4. If byte is not in the range 0xA1 to 0xFE, inclusive,
            // prepend byte to stream.
            if (!inRange(bite, 0xa1, 0xfe)) stream.prepend(bite);
            // 5. If code point is null, return error.
            if (code_point === null) return decoderError(this.fatal);
            // 6. Return a code point whose value is code point.
            return code_point;
          }
          // 6. If byte is an ASCII byte, return a code point whose value
          // is byte.
          if (isASCIIByte(bite)) return bite;
          // 7. If byte is 0x8E, 0x8F, or in the range 0xA1 to 0xFE,
          // inclusive, set euc-jp lead to byte and return continue.
          if (bite === 0x8e || bite === 0x8f || inRange(bite, 0xa1, 0xfe)) {
            this.eucjp_lead = bite;
            return null;
          }
          // 8. Return error.
          return decoderError(this.fatal);
        }
      } // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/coders/euc-jp/EUCJPEncoder.js
      //# sourceMappingURL=EUCJPDecoder.js.map
      /**
       * @constructor
       * @implements {Encoder}
       * @param {{fatal: boolean}} options
       */
      class EUCJPEncoder {
        constructor(options) {
          this.fatal = options.fatal;
        }
        /**
         * @param {Stream} stream Input stream.
         * @param {number} code_point Next code point read from the stream.
         * @return {(number|!Array.<number>)} Byte(s) to emit.
         */
        handler(stream, code_point) {
          // 1. If code point is end-of-stream, return finished.
          if (code_point === end_of_stream) return finished;
          // 2. If code point is an ASCII code point, return a byte whose
          // value is code point.
          if (isASCIICodePoint(code_point)) return code_point;
          // 3. If code point is U+00A5, return byte 0x5C.
          if (code_point === 0x00a5) return 0x5c;
          // 4. If code point is U+203E, return byte 0x7E.
          if (code_point === 0x203e) return 0x7e;
          // 5. If code point is in the range U+FF61 to U+FF9F, inclusive,
          // return two bytes whose values are 0x8E and code point −
          // 0xFF61 + 0xA1.
          if (inRange(code_point, 0xff61, 0xff9f))
            return [0x8e, code_point - 0xff61 + 0xa1];
          // 6. If code point is U+2212, set it to U+FF0D.
          if (code_point === 0x2212) code_point = 0xff0d;
          // 7. Let pointer be the index pointer for code point in index
          // jis0208.
          const pointer = indexPointerFor(code_point, index("jis0208"));
          // 8. If pointer is null, return error with code point.
          if (pointer === null) return encoderError(code_point);
          // 9. Let lead be Math.floor(pointer / 94) + 0xA1.
          const lead = Math.floor(pointer / 94) + 0xa1;
          // 10. Let trail be pointer % 94 + 0xA1.
          const trail = (pointer % 94) + 0xa1;
          // 11. Return two bytes whose values are lead and trail.
          return [lead, trail];
        }
      } // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/coders/euc-jp/index.js // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/coders/euc-kr/EUCKRDecoder.js
      //# sourceMappingURL=EUCJPEncoder.js.map
      //# sourceMappingURL=index.js.map
      /**
       * @constructor
       * @implements {Decoder}
       * @param {{fatal: boolean}} options
       */
      class EUCKRDecoder {
        constructor(options) {
          this.fatal = options.fatal;
          // euc-kr's decoder has an associated euc-kr lead (initially 0x00).
          /** @type {number} */ this.euckr_lead = 0x00;
        }
        /**
         * @param {Stream} stream The stream of bytes being decoded.
         * @param {number} bite The next byte read from the stream.
         * @return {?(number|!Array.<number>)} The next code point(s)
         *     decoded, or null if not enough data exists in the input
         *     stream to decode a complete code point.
         */
        handler(stream, bite) {
          // 1. If byte is end-of-stream and euc-kr lead is not 0x00, set
          // euc-kr lead to 0x00 and return error.
          if (bite === end_of_stream && this.euckr_lead !== 0) {
            this.euckr_lead = 0x00;
            return decoderError(this.fatal);
          }
          // 2. If byte is end-of-stream and euc-kr lead is 0x00, return
          // finished.
          if (bite === end_of_stream && this.euckr_lead === 0) return finished;
          // 3. If euc-kr lead is not 0x00, let lead be euc-kr lead, let
          // pointer be null, set euc-kr lead to 0x00, and then run these
          // substeps:
          if (this.euckr_lead !== 0x00) {
            const lead = this.euckr_lead;
            let pointer = null;
            this.euckr_lead = 0x00;
            // 1. If byte is in the range 0x41 to 0xFE, inclusive, set
            // pointer to (lead − 0x81) × 190 + (byte − 0x41).
            if (inRange(bite, 0x41, 0xfe))
              pointer = (lead - 0x81) * 190 + (bite - 0x41);
            // 2. Let code point be null, if pointer is null, and the
            // index code point for pointer in index euc-kr otherwise.
            const code_point =
              pointer === null
                ? null
                : indexCodePointFor(pointer, index("euc-kr"));
            // 3. If code point is null and byte is an ASCII byte, prepend
            // byte to stream.
            if (pointer === null && isASCIIByte(bite)) stream.prepend(bite);
            // 4. If code point is null, return error.
            if (code_point === null) return decoderError(this.fatal);
            // 5. Return a code point whose value is code point.
            return code_point;
          }
          // 4. If byte is an ASCII byte, return a code point whose value
          // is byte.
          if (isASCIIByte(bite)) return bite;
          // 5. If byte is in the range 0x81 to 0xFE, inclusive, set
          // euc-kr lead to byte and return continue.
          if (inRange(bite, 0x81, 0xfe)) {
            this.euckr_lead = bite;
            return null;
          }
          // 6. Return error.
          return decoderError(this.fatal);
        }
      } // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/coders/euc-kr/EUCKREncoder.js
      //# sourceMappingURL=EUCKRDecoder.js.map
      /**
       * @constructor
       * @implements {Encoder}
       * @param {{fatal: boolean}} options
       */
      class EUCKREncoder {
        constructor(options) {
          this.fatal = options.fatal;
        }
        /**
         * @param {Stream} stream Input stream.
         * @param {number} code_point Next code point read from the stream.
         * @return {(number|!Array.<number>)} Byte(s) to emit.
         */
        handler(stream, code_point) {
          // 1. If code point is end-of-stream, return finished.
          if (code_point === end_of_stream) return finished;
          // 2. If code point is an ASCII code point, return a byte whose
          // value is code point.
          if (isASCIICodePoint(code_point)) return code_point;
          // 3. Let pointer be the index pointer for code point in index
          // euc-kr.
          const pointer = indexPointerFor(code_point, index("euc-kr"));
          // 4. If pointer is null, return error with code point.
          if (pointer === null) return encoderError(code_point);
          // 5. Let lead be Math.floor(pointer / 190) + 0x81.
          const lead = Math.floor(pointer / 190) + 0x81;
          // 6. Let trail be pointer % 190 + 0x41.
          const trail = (pointer % 190) + 0x41;
          // 7. Return two bytes whose values are lead and trail.
          return [lead, trail];
        }
      } // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/coders/euc-kr/index.js // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/coders/gb18030/GB18030Decoder.js
      //# sourceMappingURL=EUCKREncoder.js.map
      //# sourceMappingURL=index.js.map
      /**
       * @constructor
       * @implements {Decoder}
       * @param {{fatal: boolean}} options
       */
      class GB18030Decoder {
        constructor(options) {
          this.fatal = options.fatal;
          // gb18030's decoder has an associated gb18030 first, gb18030
          // second, and gb18030 third (all initially 0x00).
          /** @type {number} */ (this.gb18030_first = 0x00),
            /** @type {number} */ (this.gb18030_second = 0x00),
            /** @type {number} */ (this.gb18030_third = 0x00);
        }
        /**
         * @param {Stream} stream The stream of bytes being decoded.
         * @param {number} bite The next byte read from the stream.
         * @return {?(number|!Array.<number>)} The next code point(s)
         *     decoded, or null if not enough data exists in the input
         *     stream to decode a complete code point.
         */
        handler(stream, bite) {
          // 1. If byte is end-of-stream and gb18030 first, gb18030
          // second, and gb18030 third are 0x00, return finished.
          if (
            bite === end_of_stream &&
            this.gb18030_first === 0x00 &&
            this.gb18030_second === 0x00 &&
            this.gb18030_third === 0x00
          ) {
            return finished;
          }
          // 2. If byte is end-of-stream, and gb18030 first, gb18030
          // second, or gb18030 third is not 0x00, set gb18030 first,
          // gb18030 second, and gb18030 third to 0x00, and return error.
          if (
            bite === end_of_stream &&
            (this.gb18030_first !== 0x00 ||
              this.gb18030_second !== 0x00 ||
              this.gb18030_third !== 0x00)
          ) {
            this.gb18030_first = 0x00;
            this.gb18030_second = 0x00;
            this.gb18030_third = 0x00;
            decoderError(this.fatal);
          }
          let code_point;
          // 3. If gb18030 third is not 0x00, run these substeps:
          if (this.gb18030_third !== 0x00) {
            // 1. Let code point be null.
            code_point = null;
            // 2. If byte is in the range 0x30 to 0x39, inclusive, set
            // code point to the index gb18030 ranges code point for
            // (((gb18030 first − 0x81) × 10 + gb18030 second − 0x30) ×
            // 126 + gb18030 third − 0x81) × 10 + byte − 0x30.
            if (inRange(bite, 0x30, 0x39)) {
              code_point = indexGB18030RangesCodePointFor(
                (((this.gb18030_first - 0x81) * 10 +
                  this.gb18030_second -
                  0x30) *
                  126 +
                  this.gb18030_third -
                  0x81) *
                  10 +
                  bite -
                  0x30,
              );
            }
            // 3. Let buffer be a byte sequence consisting of gb18030
            // second, gb18030 third, and byte, in order.
            const buffer = [this.gb18030_second, this.gb18030_third, bite];
            // 4. Set gb18030 first, gb18030 second, and gb18030 third to
            // 0x00.
            this.gb18030_first = 0x00;
            this.gb18030_second = 0x00;
            this.gb18030_third = 0x00;
            // 5. If code point is null, prepend buffer to stream and
            // return error.
            if (code_point === null) {
              stream.prepend(buffer);
              return decoderError(this.fatal);
            }
            // 6. Return a code point whose value is code point.
            return code_point;
          }
          // 4. If gb18030 second is not 0x00, run these substeps:
          if (this.gb18030_second !== 0x00) {
            // 1. If byte is in the range 0x81 to 0xFE, inclusive, set
            // gb18030 third to byte and return continue.
            if (inRange(bite, 0x81, 0xfe)) {
              this.gb18030_third = bite;
              return null;
            }
            // 2. Prepend gb18030 second followed by byte to stream, set
            // gb18030 first and gb18030 second to 0x00, and return error.
            stream.prepend([this.gb18030_second, bite]);
            this.gb18030_first = 0x00;
            this.gb18030_second = 0x00;
            return decoderError(this.fatal);
          }
          // 5. If gb18030 first is not 0x00, run these substeps:
          if (this.gb18030_first !== 0x00) {
            // 1. If byte is in the range 0x30 to 0x39, inclusive, set
            // gb18030 second to byte and return continue.
            if (inRange(bite, 0x30, 0x39)) {
              this.gb18030_second = bite;
              return null;
            }
            // 2. Let lead be gb18030 first, let pointer be null, and set
            // gb18030 first to 0x00.
            const lead = this.gb18030_first;
            let pointer = null;
            this.gb18030_first = 0x00;
            // 3. Let offset be 0x40 if byte is less than 0x7F and 0x41
            // otherwise.
            const offset = bite < 0x7f ? 0x40 : 0x41;
            // 4. If byte is in the range 0x40 to 0x7E, inclusive, or 0x80
            // to 0xFE, inclusive, set pointer to (lead − 0x81) × 190 +
            // (byte − offset).
            if (inRange(bite, 0x40, 0x7e) || inRange(bite, 0x80, 0xfe))
              pointer = (lead - 0x81) * 190 + (bite - offset);
            // 5. Let code point be null if pointer is null and the index
            // code point for pointer in index gb18030 otherwise.
            code_point =
              pointer === null
                ? null
                : indexCodePointFor(pointer, index("gb18030"));
            // 6. If code point is null and byte is an ASCII byte, prepend
            // byte to stream.
            if (code_point === null && isASCIIByte(bite)) stream.prepend(bite);
            // 7. If code point is null, return error.
            if (code_point === null) return decoderError(this.fatal);
            // 8. Return a code point whose value is code point.
            return code_point;
          }
          // 6. If byte is an ASCII byte, return a code point whose value
          // is byte.
          if (isASCIIByte(bite)) return bite;
          // 7. If byte is 0x80, return code point U+20AC.
          if (bite === 0x80) return 0x20ac;
          // 8. If byte is in the range 0x81 to 0xFE, inclusive, set
          // gb18030 first to byte and return continue.
          if (inRange(bite, 0x81, 0xfe)) {
            this.gb18030_first = bite;
            return null;
          }
          // 9. Return error.
          return decoderError(this.fatal);
        }
      } // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/coders/gb18030/GB18030Encoder.js
      //# sourceMappingURL=GB18030Decoder.js.map
      /**
       * @constructor
       * @implements {Encoder}
       * @param {{fatal: boolean}} options
       * @param {boolean=} gbk_flag
       */
      class GB18030Encoder {
        constructor(options, gbk_flag = undefined) {
          this.gbk_flag = gbk_flag;
          this.fatal = options.fatal;
          // gb18030's decoder has an associated gbk flag (initially unset).
        }
        /**
         * @param {Stream} stream Input stream.
         * @param {number} code_point Next code point read from the stream.
         * @return {(number|!Array.<number>)} Byte(s) to emit.
         */
        handler(stream, code_point) {
          // 1. If code point is end-of-stream, return finished.
          if (code_point === end_of_stream) return finished;
          // 2. If code point is an ASCII code point, return a byte whose
          // value is code point.
          if (isASCIICodePoint(code_point)) return code_point;
          // 3. If code point is U+E5E5, return error with code point.
          if (code_point === 0xe5e5) return encoderError(code_point);
          // 4. If the gbk flag is set and code point is U+20AC, return
          // byte 0x80.
          if (this.gbk_flag && code_point === 0x20ac) return 0x80;
          // 5. Let pointer be the index pointer for code point in index
          // gb18030.
          let pointer = indexPointerFor(code_point, index("gb18030"));
          // 6. If pointer is not null, run these substeps:
          if (pointer !== null) {
            // 1. Let lead be Math.floor(pointer / 190) + 0x81.
            const lead = Math.floor(pointer / 190) + 0x81;
            // 2. Let trail be pointer % 190.
            const trail = pointer % 190;
            // 3. Let offset be 0x40 if trail is less than 0x3F and 0x41 otherwise.
            const offset = trail < 0x3f ? 0x40 : 0x41;
            // 4. Return two bytes whose values are lead and trail + offset.
            return [lead, trail + offset];
          }
          // 7. If gbk flag is set, return error with code point.
          if (this.gbk_flag) return encoderError(code_point);
          // 8. Set pointer to the index gb18030 ranges pointer for code
          // point.
          pointer = indexGB18030RangesPointerFor(code_point);
          // 9. Let byte1 be Math.floor(pointer / 10 / 126 / 10).
          const byte1 = Math.floor(pointer / 10 / 126 / 10);
          // 10. Set pointer to pointer − byte1 × 10 × 126 × 10.
          pointer = pointer - byte1 * 10 * 126 * 10;
          // 11. Let byte2 be Math.floor(pointer / 10 / 126).
          const byte2 = Math.floor(pointer / 10 / 126);
          // 12. Set pointer to pointer − byte2 × 10 × 126.
          pointer = pointer - byte2 * 10 * 126;
          // 13. Let byte3 be Math.floor(pointer / 10).
          const byte3 = Math.floor(pointer / 10);
          // 14. Let byte4 be pointer − byte3 × 10.
          const byte4 = pointer - byte3 * 10;
          // 15. Return four bytes whose values are byte1 + 0x81, byte2 +
          // 0x30, byte3 + 0x81, byte4 + 0x30.
          return [byte1 + 0x81, byte2 + 0x30, byte3 + 0x81, byte4 + 0x30];
        }
      } // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/coders/gb18030/index.js // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/coders/iso-2022-jp/ISO2022JPDecoder.js
      //# sourceMappingURL=GB18030Encoder.js.map
      //# sourceMappingURL=index.js.map
      var states;
      (function (states) {
        states[(states["ASCII"] = 0)] = "ASCII";
        states[(states["Roman"] = 1)] = "Roman";
        states[(states["Katakana"] = 2)] = "Katakana";
        states[(states["LeadByte"] = 3)] = "LeadByte";
        states[(states["TrailByte"] = 4)] = "TrailByte";
        states[(states["EscapeStart"] = 5)] = "EscapeStart";
        states[(states["Escape"] = 6)] = "Escape";
      })(states || (states = {}));
      class ISO2022JPDecoder {
        /**
         * @constructor
         * @implements {Decoder}
         * @param {{fatal: boolean}} options
         */
        constructor(options) {
          this.fatal = options.fatal;
          // iso-2022-jp's decoder has an associated iso-2022-jp decoder
          // state (initially ASCII), iso-2022-jp decoder output state
          // (initially ASCII), iso-2022-jp lead (initially 0x00), and
          // iso-2022-jp output flag (initially unset).
          /** @type {number} */ (this.iso2022jp_decoder_state = states.ASCII),
            /** @type {number} */ (
              this.iso2022jp_decoder_output_state = states.ASCII
            ),
            /** @type {number} */ (this.iso2022jp_lead = 0x00),
            /** @type {boolean} */ (this.iso2022jp_output_flag = false);
        }
        /**
         * @param {Stream} stream The stream of bytes being decoded.
         * @param {number} bite The next byte read from the stream.
         * @return {?(number|!Array.<number>)} The next code point(s)
         *     decoded, or null if not enough data exists in the input
         *     stream to decode a complete code point.
         */
        handler(stream, bite) {
          // switching on iso-2022-jp decoder state:
          switch (this.iso2022jp_decoder_state) {
            default:
            case states.ASCII:
              // ASCII
              // Based on byte:
              // 0x1B
              if (bite === 0x1b) {
                // Set iso-2022-jp decoder state to escape start and return
                // continue.
                this.iso2022jp_decoder_state = states.EscapeStart;
                return null;
              }
              // 0x00 to 0x7F, excluding 0x0E, 0x0F, and 0x1B
              if (
                inRange(bite, 0x00, 0x7f) &&
                bite !== 0x0e &&
                bite !== 0x0f &&
                bite !== 0x1b
              ) {
                // Unset the iso-2022-jp output flag and return a code point
                // whose value is byte.
                this.iso2022jp_output_flag = false;
                return bite;
              }
              // end-of-stream
              if (bite === end_of_stream) {
                // Return finished.
                return finished;
              }
              // Otherwise
              // Unset the iso-2022-jp output flag and return error.
              this.iso2022jp_output_flag = false;
              return decoderError(this.fatal);
            case states.Roman:
              // Roman
              // Based on byte:
              // 0x1B
              if (bite === 0x1b) {
                // Set iso-2022-jp decoder state to escape start and return
                // continue.
                this.iso2022jp_decoder_state = states.EscapeStart;
                return null;
              }
              // 0x5C
              if (bite === 0x5c) {
                // Unset the iso-2022-jp output flag and return code point
                // U+00A5.
                this.iso2022jp_output_flag = false;
                return 0x00a5;
              }
              // 0x7E
              if (bite === 0x7e) {
                // Unset the iso-2022-jp output flag and return code point
                // U+203E.
                this.iso2022jp_output_flag = false;
                return 0x203e;
              }
              // 0x00 to 0x7F, excluding 0x0E, 0x0F, 0x1B, 0x5C, and 0x7E
              if (
                inRange(bite, 0x00, 0x7f) &&
                bite !== 0x0e &&
                bite !== 0x0f &&
                bite !== 0x1b &&
                bite !== 0x5c &&
                bite !== 0x7e
              ) {
                // Unset the iso-2022-jp output flag and return a code point
                // whose value is byte.
                this.iso2022jp_output_flag = false;
                return bite;
              }
              // end-of-stream
              if (bite === end_of_stream) {
                // Return finished.
                return finished;
              }
              // Otherwise
              // Unset the iso-2022-jp output flag and return error.
              this.iso2022jp_output_flag = false;
              return decoderError(this.fatal);
            case states.Katakana:
              // Katakana
              // Based on byte:
              // 0x1B
              if (bite === 0x1b) {
                // Set iso-2022-jp decoder state to escape start and return
                // continue.
                this.iso2022jp_decoder_state = states.EscapeStart;
                return null;
              }
              // 0x21 to 0x5F
              if (inRange(bite, 0x21, 0x5f)) {
                // Unset the iso-2022-jp output flag and return a code point
                // whose value is 0xFF61 − 0x21 + byte.
                this.iso2022jp_output_flag = false;
                return 0xff61 - 0x21 + bite;
              }
              // end-of-stream
              if (bite === end_of_stream) {
                // Return finished.
                return finished;
              }
              // Otherwise
              // Unset the iso-2022-jp output flag and return error.
              this.iso2022jp_output_flag = false;
              return decoderError(this.fatal);
            case states.LeadByte:
              // Lead byte
              // Based on byte:
              // 0x1B
              if (bite === 0x1b) {
                // Set iso-2022-jp decoder state to escape start and return
                // continue.
                this.iso2022jp_decoder_state = states.EscapeStart;
                return null;
              }
              // 0x21 to 0x7E
              if (inRange(bite, 0x21, 0x7e)) {
                // Unset the iso-2022-jp output flag, set iso-2022-jp lead
                // to byte, iso-2022-jp decoder state to trail byte, and
                // return continue.
                this.iso2022jp_output_flag = false;
                this.iso2022jp_lead = bite;
                this.iso2022jp_decoder_state = states.TrailByte;
                return null;
              }
              // end-of-stream
              if (bite === end_of_stream) {
                // Return finished.
                return finished;
              }
              // Otherwise
              // Unset the iso-2022-jp output flag and return error.
              this.iso2022jp_output_flag = false;
              return decoderError(this.fatal);
            case states.TrailByte:
              // Trail byte
              // Based on byte:
              // 0x1B
              if (bite === 0x1b) {
                // Set iso-2022-jp decoder state to escape start and return
                // continue.
                this.iso2022jp_decoder_state = states.EscapeStart;
                return decoderError(this.fatal);
              }
              // 0x21 to 0x7E
              if (inRange(bite, 0x21, 0x7e)) {
                // 1. Set the iso-2022-jp decoder state to lead byte.
                this.iso2022jp_decoder_state = states.LeadByte;
                // 2. Let pointer be (iso-2022-jp lead − 0x21) × 94 + byte − 0x21.
                const pointer = (this.iso2022jp_lead - 0x21) * 94 + bite - 0x21;
                // 3. Let code point be the index code point for pointer in
                // index jis0208.
                const code_point = indexCodePointFor(pointer, index("jis0208"));
                // 4. If code point is null, return error.
                if (code_point === null) return decoderError(this.fatal);
                // 5. Return a code point whose value is code point.
                return code_point;
              }
              // end-of-stream
              if (bite === end_of_stream) {
                // Set the iso-2022-jp decoder state to lead byte, prepend
                // byte to stream, and return error.
                this.iso2022jp_decoder_state = states.LeadByte;
                stream.prepend(bite);
                return decoderError(this.fatal);
              }
              // Otherwise
              // Set iso-2022-jp decoder state to lead byte and return
              // error.
              this.iso2022jp_decoder_state = states.LeadByte;
              return decoderError(this.fatal);
            case states.EscapeStart:
              // Escape start
              // 1. If byte is either 0x24 or 0x28, set iso-2022-jp lead to
              // byte, iso-2022-jp decoder state to escape, and return
              // continue.
              if (bite === 0x24 || bite === 0x28) {
                this.iso2022jp_lead = bite;
                this.iso2022jp_decoder_state = states.Escape;
                return null;
              }
              // 2. Prepend byte to stream.
              stream.prepend(bite);
              // 3. Unset the iso-2022-jp output flag, set iso-2022-jp
              // decoder state to iso-2022-jp decoder output state, and
              // return error.
              this.iso2022jp_output_flag = false;
              this.iso2022jp_decoder_state =
                this.iso2022jp_decoder_output_state;
              return decoderError(this.fatal);
            case states.Escape:
              // Escape
              // 1. Let lead be iso-2022-jp lead and set iso-2022-jp lead to
              // 0x00.
              const lead = this.iso2022jp_lead;
              this.iso2022jp_lead = 0x00;
              // 2. Let state be null.
              let state = null;
              // 3. If lead is 0x28 and byte is 0x42, set state to ASCII.
              if (lead === 0x28 && bite === 0x42) state = states.ASCII;
              // 4. If lead is 0x28 and byte is 0x4A, set state to Roman.
              if (lead === 0x28 && bite === 0x4a) state = states.Roman;
              // 5. If lead is 0x28 and byte is 0x49, set state to Katakana.
              if (lead === 0x28 && bite === 0x49) state = states.Katakana;
              // 6. If lead is 0x24 and byte is either 0x40 or 0x42, set
              // state to lead byte.
              if (lead === 0x24 && (bite === 0x40 || bite === 0x42))
                state = states.LeadByte;
              // 7. If state is non-null, run these substeps:
              if (state !== null) {
                // 1. Set iso-2022-jp decoder state and iso-2022-jp decoder
                // output state to states.
                this.iso2022jp_decoder_state = this.iso2022jp_decoder_state =
                  state;
                // 2. Let output flag be the iso-2022-jp output flag.
                const output_flag = this.iso2022jp_output_flag;
                // 3. Set the iso-2022-jp output flag.
                this.iso2022jp_output_flag = true;
                // 4. Return continue, if output flag is unset, and error
                // otherwise.
                return !output_flag ? null : decoderError(this.fatal);
              }
              // 8. Prepend lead and byte to stream.
              stream.prepend([lead, bite]);
              // 9. Unset the iso-2022-jp output flag, set iso-2022-jp
              // decoder state to iso-2022-jp decoder output state and
              // return error.
              this.iso2022jp_output_flag = false;
              this.iso2022jp_decoder_state =
                this.iso2022jp_decoder_output_state;
              return decoderError(this.fatal);
          }
        }
      } // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/coders/iso-2022-jp/ISO2022JPEncoder.js
      //# sourceMappingURL=ISO2022JPDecoder.js.map
      var ISO2022JPEncoder_states;
      (function (states) {
        states[(states["ASCII"] = 0)] = "ASCII";
        states[(states["Roman"] = 1)] = "Roman";
        states[(states["jis0208"] = 2)] = "jis0208";
      })(ISO2022JPEncoder_states || (ISO2022JPEncoder_states = {}));
      /**
       * @constructor
       * @implements {Encoder}
       * @param {{fatal: boolean}} options
       */
      class ISO2022JPEncoder {
        constructor(options) {
          this.fatal = options.fatal;
          // iso-2022-jp's encoder has an associated iso-2022-jp encoder
          // state which is one of ASCII, Roman, and jis0208 (initially
          // ASCII).
          /** @type {number} */ this.iso2022jp_state =
            ISO2022JPEncoder_states.ASCII;
        }
        /**
         * @param {Stream} stream Input stream.
         * @param {number} code_point Next code point read from the stream.
         * @return {(number|!Array.<number>)} Byte(s) to emit.
         */
        handler(stream, code_point) {
          // 1. If code point is end-of-stream and iso-2022-jp encoder
          // state is not ASCII, prepend code point to stream, set
          // iso-2022-jp encoder state to ASCII, and return three bytes
          // 0x1B 0x28 0x42.
          if (
            code_point === end_of_stream &&
            this.iso2022jp_state !== ISO2022JPEncoder_states.ASCII
          ) {
            stream.prepend(code_point);
            this.iso2022jp_state = ISO2022JPEncoder_states.ASCII;
            return [0x1b, 0x28, 0x42];
          }
          // 2. If code point is end-of-stream and iso-2022-jp encoder
          // state is ASCII, return finished.
          if (
            code_point === end_of_stream &&
            this.iso2022jp_state === ISO2022JPEncoder_states.ASCII
          )
            return finished;
          // 3. If ISO-2022-JP encoder state is ASCII or Roman, and code
          // point is U+000E, U+000F, or U+001B, return error with U+FFFD.
          if (
            (this.iso2022jp_state === ISO2022JPEncoder_states.ASCII ||
              this.iso2022jp_state === ISO2022JPEncoder_states.Roman) &&
            (code_point === 0x000e ||
              code_point === 0x000f ||
              code_point === 0x001b)
          ) {
            return encoderError(0xfffd);
          }
          // 4. If iso-2022-jp encoder state is ASCII and code point is an
          // ASCII code point, return a byte whose value is code point.
          if (
            this.iso2022jp_state === ISO2022JPEncoder_states.ASCII &&
            isASCIICodePoint(code_point)
          )
            return code_point;
          // 5. If iso-2022-jp encoder state is Roman and code point is an
          // ASCII code point, excluding U+005C and U+007E, or is U+00A5
          // or U+203E, run these substeps:
          if (
            this.iso2022jp_state === ISO2022JPEncoder_states.Roman &&
            ((isASCIICodePoint(code_point) &&
              code_point !== 0x005c &&
              code_point !== 0x007e) ||
              code_point == 0x00a5 ||
              code_point == 0x203e)
          ) {
            // 1. If code point is an ASCII code point, return a byte
            // whose value is code point.
            if (isASCIICodePoint(code_point)) return code_point;
            // 2. If code point is U+00A5, return byte 0x5C.
            if (code_point === 0x00a5) return 0x5c;
            // 3. If code point is U+203E, return byte 0x7E.
            if (code_point === 0x203e) return 0x7e;
          }
          // 6. If code point is an ASCII code point, and iso-2022-jp
          // encoder state is not ASCII, prepend code point to stream, set
          // iso-2022-jp encoder state to ASCII, and return three bytes
          // 0x1B 0x28 0x42.
          if (
            isASCIICodePoint(code_point) &&
            this.iso2022jp_state !== ISO2022JPEncoder_states.ASCII
          ) {
            stream.prepend(code_point);
            this.iso2022jp_state = ISO2022JPEncoder_states.ASCII;
            return [0x1b, 0x28, 0x42];
          }
          // 7. If code point is either U+00A5 or U+203E, and iso-2022-jp
          // encoder state is not Roman, prepend code point to stream, set
          // iso-2022-jp encoder state to Roman, and return three bytes
          // 0x1B 0x28 0x4A.
          if (
            (code_point === 0x00a5 || code_point === 0x203e) &&
            this.iso2022jp_state !== ISO2022JPEncoder_states.Roman
          ) {
            stream.prepend(code_point);
            this.iso2022jp_state = ISO2022JPEncoder_states.Roman;
            return [0x1b, 0x28, 0x4a];
          }
          // 8. If code point is U+2212, set it to U+FF0D.
          if (code_point === 0x2212) code_point = 0xff0d;
          // 9. Let pointer be the index pointer for code point in index
          // jis0208.
          const pointer = indexPointerFor(code_point, index("jis0208"));
          // 10. If pointer is null, return error with code point.
          if (pointer === null) return encoderError(code_point);
          // 11. If iso-2022-jp encoder state is not jis0208, prepend code
          // point to stream, set iso-2022-jp encoder state to jis0208,
          // and return three bytes 0x1B 0x24 0x42.
          if (this.iso2022jp_state !== ISO2022JPEncoder_states.jis0208) {
            stream.prepend(code_point);
            this.iso2022jp_state = ISO2022JPEncoder_states.jis0208;
            return [0x1b, 0x24, 0x42];
          }
          // 12. Let lead be Math.floor(pointer / 94) + 0x21.
          const lead = Math.floor(pointer / 94) + 0x21;
          // 13. Let trail be pointer % 94 + 0x21.
          const trail = (pointer % 94) + 0x21;
          // 14. Return two bytes whose values are lead and trail.
          return [lead, trail];
        }
      } // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/coders/iso-2022-jp/index.js // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/coders/shift-jis/ShiftJISDecoder.js
      //# sourceMappingURL=ISO2022JPEncoder.js.map
      //# sourceMappingURL=index.js.map
      /**
       * @constructor
       * @implements {Decoder}
       * @param {{fatal: boolean}} options
       */
      class ShiftJISDecoder {
        constructor(options) {
          this.fatal = options.fatal;
          // Shift_JIS's decoder has an associated Shift_JIS lead (initially
          // 0x00).
          /** @type {number} */ this.Shift_JIS_lead = 0x00;
        }
        /**
         * @param {Stream} stream The stream of bytes being decoded.
         * @param {number} bite The next byte read from the stream.
         * @return {?(number|!Array.<number>)} The next code point(s)
         *     decoded, or null if not enough data exists in the input
         *     stream to decode a complete code point.
         */
        handler(stream, bite) {
          // 1. If byte is end-of-stream and Shift_JIS lead is not 0x00,
          // set Shift_JIS lead to 0x00 and return error.
          if (bite === end_of_stream && this.Shift_JIS_lead !== 0x00) {
            this.Shift_JIS_lead = 0x00;
            return decoderError(this.fatal);
          }
          // 2. If byte is end-of-stream and Shift_JIS lead is 0x00,
          // return finished.
          if (bite === end_of_stream && this.Shift_JIS_lead === 0x00)
            return finished;
          // 3. If Shift_JIS lead is not 0x00, let lead be Shift_JIS lead,
          // let pointer be null, set Shift_JIS lead to 0x00, and then run
          // these substeps:
          if (this.Shift_JIS_lead !== 0x00) {
            const lead = this.Shift_JIS_lead;
            let pointer = null;
            this.Shift_JIS_lead = 0x00;
            // 1. Let offset be 0x40, if byte is less than 0x7F, and 0x41
            // otherwise.
            const offset = bite < 0x7f ? 0x40 : 0x41;
            // 2. Let lead offset be 0x81, if lead is less than 0xA0, and
            // 0xC1 otherwise.
            const lead_offset = lead < 0xa0 ? 0x81 : 0xc1;
            // 3. If byte is in the range 0x40 to 0x7E, inclusive, or 0x80
            // to 0xFC, inclusive, set pointer to (lead − lead offset) ×
            // 188 + byte − offset.
            if (inRange(bite, 0x40, 0x7e) || inRange(bite, 0x80, 0xfc))
              pointer = (lead - lead_offset) * 188 + bite - offset;
            // 4. If pointer is in the range 8836 to 10715, inclusive,
            // return a code point whose value is 0xE000 − 8836 + pointer.
            if (inRange(pointer, 8836, 10715)) return 0xe000 - 8836 + pointer;
            // 5. Let code point be null, if pointer is null, and the
            // index code point for pointer in index jis0208 otherwise.
            const code_point =
              pointer === null
                ? null
                : indexCodePointFor(pointer, index("jis0208"));
            // 6. If code point is null and byte is an ASCII byte, prepend
            // byte to stream.
            if (code_point === null && isASCIIByte(bite)) stream.prepend(bite);
            // 7. If code point is null, return error.
            if (code_point === null) return decoderError(this.fatal);
            // 8. Return a code point whose value is code point.
            return code_point;
          }
          // 4. If byte is an ASCII byte or 0x80, return a code point
          // whose value is byte.
          if (isASCIIByte(bite) || bite === 0x80) return bite;
          // 5. If byte is in the range 0xA1 to 0xDF, inclusive, return a
          // code point whose value is 0xFF61 − 0xA1 + byte.
          if (inRange(bite, 0xa1, 0xdf)) return 0xff61 - 0xa1 + bite;
          // 6. If byte is in the range 0x81 to 0x9F, inclusive, or 0xE0
          // to 0xFC, inclusive, set Shift_JIS lead to byte and return
          // continue.
          if (inRange(bite, 0x81, 0x9f) || inRange(bite, 0xe0, 0xfc)) {
            this.Shift_JIS_lead = bite;
            return null;
          }
          // 7. Return error.
          return decoderError(this.fatal);
        }
      } // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/coders/shift-jis/ShiftJISEncoder.js
      //# sourceMappingURL=ShiftJISDecoder.js.map
      /**
       * @constructor
       * @implements {Encoder}
       * @param {{fatal: boolean}} options
       */
      class ShiftJISEncoder {
        constructor(options) {
          this.fatal = options.fatal;
        }
        /**
         * @param {Stream} stream Input stream.
         * @param {number} code_point Next code point read from the stream.
         * @return {(number|!Array.<number>)} Byte(s) to emit.
         */
        handler(stream, code_point) {
          // 1. If code point is end-of-stream, return finished.
          if (code_point === end_of_stream) return finished;
          // 2. If code point is an ASCII code point or U+0080, return a
          // byte whose value is code point.
          if (isASCIICodePoint(code_point) || code_point === 0x0080)
            return code_point;
          // 3. If code point is U+00A5, return byte 0x5C.
          if (code_point === 0x00a5) return 0x5c;
          // 4. If code point is U+203E, return byte 0x7E.
          if (code_point === 0x203e) return 0x7e;
          // 5. If code point is in the range U+FF61 to U+FF9F, inclusive,
          // return a byte whose value is code point − 0xFF61 + 0xA1.
          if (inRange(code_point, 0xff61, 0xff9f))
            return code_point - 0xff61 + 0xa1;
          // 6. If code point is U+2212, set it to U+FF0D.
          if (code_point === 0x2212) code_point = 0xff0d;
          // 7. Let pointer be the index Shift_JIS pointer for code point.
          const pointer = indexShiftJISPointerFor(code_point);
          // 8. If pointer is null, return error with code point.
          if (pointer === null) return encoderError(code_point);
          // 9. Let lead be Math.floor(pointer / 188).
          const lead = Math.floor(pointer / 188);
          // 10. Let lead offset be 0x81, if lead is less than 0x1F, and
          // 0xC1 otherwise.
          const lead_offset = lead < 0x1f ? 0x81 : 0xc1;
          // 11. Let trail be pointer % 188.
          const trail = pointer % 188;
          // 12. Let offset be 0x40, if trail is less than 0x3F, and 0x41
          // otherwise.
          const offset = trail < 0x3f ? 0x40 : 0x41;
          // 13. Return two bytes whose values are lead + lead offset and
          // trail + offset.
          return [lead + lead_offset, trail + offset];
        }
      } // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/coders/shift-jis/index.js // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/coders/single-byte/SingleByteDecoder.js
      //# sourceMappingURL=ShiftJISEncoder.js.map
      //# sourceMappingURL=index.js.map
      /**
       * @constructor
       * @implements {Decoder}
       * @param {!Array.<number>} index The encoding index.
       * @param {{fatal: boolean}} options
       */
      class SingleByteDecoder {
        constructor(index, options) {
          this.index = index;
          this.fatal = options.fatal;
        }
        /**
         * @param {Stream} stream The stream of bytes being decoded.
         * @param {number} bite The next byte read from the stream.
         * @return {?(number|!Array.<number>)} The next code point(s)
         *     decoded, or null if not enough data exists in the input
         *     stream to decode a complete code point.
         */
        handler(stream, bite) {
          // 1. If byte is end-of-stream, return finished.
          if (bite === end_of_stream) return finished;
          // 2. If byte is an ASCII byte, return a code point whose value
          // is byte.
          if (isASCIIByte(bite)) return bite;
          // 3. Let code point be the index code point for byte − 0x80 in
          // index single-byte.
          const code_point = this.index[bite - 0x80];
          // 4. If code point is null, return error.
          if (!code_point) return decoderError(this.fatal);
          // 5. Return a code point whose value is code point.
          return code_point;
        }
      } // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/coders/single-byte/SingleByteEncoder.js
      //# sourceMappingURL=SingleByteDecoder.js.map
      /**
       * @constructor
       * @implements {Encoder}
       * @param {!Array.<?number>} index The encoding index.
       * @param {{fatal: boolean}} options
       */
      class SingleByteEncoder {
        constructor(index, options) {
          this.index = index;
          this.fatal = options.fatal;
        }
        /**
         * @param {Stream} stream Input stream.
         * @param {number} code_point Next code point read from the stream.
         * @return {(number|!Array.<number>)} Byte(s) to emit.
         */
        handler(stream, code_point) {
          // 1. If code point is end-of-stream, return finished.
          if (code_point === end_of_stream) return finished;
          // 2. If code point is an ASCII code point, return a byte whose
          // value is code point.
          if (isASCIICodePoint(code_point)) return code_point;
          // 3. Let pointer be the index pointer for code point in index
          // single-byte.
          const pointer = indexPointerFor(code_point, this.index);
          // 4. If pointer is null, return error with code point.
          if (pointer === null) encoderError(code_point);
          // 5. Return a byte whose value is pointer + 0x80.
          return pointer + 0x80;
        }
      } // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/coders/single-byte/index.js // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/coders/utf-16/converCodeUnitToBytes.js
      //# sourceMappingURL=SingleByteEncoder.js.map
      //# sourceMappingURL=index.js.map
      /**
       * @param {number} code_unit
       * @param {boolean} utf16be
       * @return {!Array.<number>} bytes
       */
      function convertCodeUnitToBytes(code_unit, utf16be) {
        // 1. Let byte1 be code unit >> 8.
        const byte1 = code_unit >> 8;
        // 2. Let byte2 be code unit & 0x00FF.
        const byte2 = code_unit & 0x00ff;
        // 3. Then return the bytes in order:
        // utf-16be flag is set: byte1, then byte2.
        if (utf16be) return [byte1, byte2];
        // utf-16be flag is unset: byte2, then byte1.
        return [byte2, byte1];
      } // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/coders/utf-16/UTF16Decoder.js
      //# sourceMappingURL=converCodeUnitToBytes.js.map
      /**
       * @constructor
       * @implements {Decoder}
       * @param {boolean} utf16_be True if big-endian, false if little-endian.
       * @param {{fatal: boolean}} options
       */
      class UTF16Decoder {
        constructor(utf16_be, options) {
          this.utf16_be = utf16_be;
          this.fatal = options.fatal;
          /** @type {?number} */ this.utf16_lead_byte = null;
          /** @type {?number} */ this.utf16_lead_surrogate = null;
        }
        /**
         * @param {Stream} stream The stream of bytes being decoded.
         * @param {number} bite The next byte read from the stream.
         * @return {?(number|!Array.<number>)} The next code point(s)
         *     decoded, or null if not enough data exists in the input
         *     stream to decode a complete code point.
         */
        handler(stream, bite) {
          // 1. If byte is end-of-stream and either utf-16 lead byte or
          // utf-16 lead surrogate is not null, set utf-16 lead byte and
          // utf-16 lead surrogate to null, and return error.
          if (
            bite === end_of_stream &&
            (this.utf16_lead_byte !== null ||
              this.utf16_lead_surrogate !== null)
          ) {
            return decoderError(this.fatal);
          }
          // 2. If byte is end-of-stream and utf-16 lead byte and utf-16
          // lead surrogate are null, return finished.
          if (
            bite === end_of_stream &&
            this.utf16_lead_byte === null &&
            this.utf16_lead_surrogate === null
          ) {
            return finished;
          }
          // 3. If utf-16 lead byte is null, set utf-16 lead byte to byte
          // and return continue.
          if (this.utf16_lead_byte === null) {
            this.utf16_lead_byte = bite;
            return null;
          }
          // 4. Let code unit be the result of:
          let code_unit;
          if (this.utf16_be) {
            // utf-16be decoder flag is set
            //   (utf-16 lead byte << 8) + byte.
            code_unit = (this.utf16_lead_byte << 8) + bite;
          } else {
            // utf-16be decoder flag is unset
            //   (byte << 8) + utf-16 lead byte.
            code_unit = (bite << 8) + this.utf16_lead_byte;
          }
          // Then set utf-16 lead byte to null.
          this.utf16_lead_byte = null;
          // 5. If utf-16 lead surrogate is not null, let lead surrogate
          // be utf-16 lead surrogate, set utf-16 lead surrogate to null,
          // and then run these substeps:
          if (this.utf16_lead_surrogate !== null) {
            const lead_surrogate = this.utf16_lead_surrogate;
            this.utf16_lead_surrogate = null;
            // 1. If code unit is in the range U+DC00 to U+DFFF,
            // inclusive, return a code point whose value is 0x10000 +
            // ((lead surrogate − 0xD800) << 10) + (code unit − 0xDC00).
            if (inRange(code_unit, 0xdc00, 0xdfff)) {
              return (
                0x10000 +
                (lead_surrogate - 0xd800) * 0x400 +
                (code_unit - 0xdc00)
              );
            }
            // 2. Prepend the sequence resulting of converting code unit
            // to bytes using utf-16be decoder flag to stream and return
            // error.
            stream.prepend(convertCodeUnitToBytes(code_unit, this.utf16_be));
            return decoderError(this.fatal);
          }
          // 6. If code unit is in the range U+D800 to U+DBFF, inclusive,
          // set utf-16 lead surrogate to code unit and return continue.
          if (inRange(code_unit, 0xd800, 0xdbff)) {
            this.utf16_lead_surrogate = code_unit;
            return null;
          }
          // 7. If code unit is in the range U+DC00 to U+DFFF, inclusive,
          // return error.
          if (inRange(code_unit, 0xdc00, 0xdfff))
            return decoderError(this.fatal);
          // 8. Return code point code unit.
          return code_unit;
        }
      } // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/coders/utf-16/UTF16Encoder.js
      //# sourceMappingURL=UTF16Decoder.js.map
      /**
       * @constructor
       * @implements {Encoder}
       * @param {boolean} utf16_be True if big-endian, false if little-endian.
       * @param {{fatal: boolean}} options
       */
      class UTF16Encoder {
        constructor(utf16_be, options) {
          this.utf16_be = utf16_be;
          this.fatal = options.fatal;
        }
        /**
         * @param {Stream} stream Input stream.
         * @param {number} code_point Next code point read from the stream.
         * @return {(number|!Array.<number>)} Byte(s) to emit.
         */
        handler(stream, code_point) {
          // 1. If code point is end-of-stream, return finished.
          if (code_point === end_of_stream) return finished;
          // 2. If code point is in the range U+0000 to U+FFFF, inclusive,
          // return the sequence resulting of converting code point to
          // bytes using utf-16be encoder flag.
          if (inRange(code_point, 0x0000, 0xffff))
            return convertCodeUnitToBytes(code_point, this.utf16_be);
          // 3. Let lead be ((code point − 0x10000) >> 10) + 0xD800,
          // converted to bytes using utf-16be encoder flag.
          const lead = convertCodeUnitToBytes(
            ((code_point - 0x10000) >> 10) + 0xd800,
            this.utf16_be,
          );
          // 4. Let trail be ((code point − 0x10000) & 0x3FF) + 0xDC00,
          // converted to bytes using utf-16be encoder flag.
          const trail = convertCodeUnitToBytes(
            ((code_point - 0x10000) & 0x3ff) + 0xdc00,
            this.utf16_be,
          );
          // 5. Return a byte sequence of lead followed by trail.
          return lead.concat(trail);
        }
      } // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/coders/utf-16/index.js // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/coders/utf-8/UTF8Decoder.js
      //# sourceMappingURL=UTF16Encoder.js.map
      //# sourceMappingURL=index.js.map
      /**
       * @constructor
       * @implements {Decoder}
       * @param {{fatal: boolean}} options
       */
      class UTF8Decoder {
        constructor(options) {
          this.fatal = options.fatal;
          // utf-8's decoder's has an associated utf-8 code point, utf-8
          // bytes seen, and utf-8 bytes needed (all initially 0), a utf-8
          // lower boundary (initially 0x80), and a utf-8 upper boundary
          // (initially 0xBF).
          /** @type {number} */ (this.utf8_code_point = 0),
            /** @type {number} */ (this.utf8_bytes_seen = 0),
            /** @type {number} */ (this.utf8_bytes_needed = 0),
            /** @type {number} */ (this.utf8_lower_boundary = 0x80),
            /** @type {number} */ (this.utf8_upper_boundary = 0xbf);
        }
        /**
         * @param {Stream} stream The stream of bytes being decoded.
         * @param {number} bite The next byte read from the stream.
         * @return {?(number|!Array.<number>)} The next code point(s)
         *     decoded, or null if not enough data exists in the input
         *     stream to decode a complete code point.
         */
        handler(stream, bite) {
          // 1. If byte is end-of-stream and utf-8 bytes needed is not 0,
          // set utf-8 bytes needed to 0 and return error.
          if (bite === end_of_stream && this.utf8_bytes_needed !== 0) {
            this.utf8_bytes_needed = 0;
            return decoderError(this.fatal);
          }
          // 2. If byte is end-of-stream, return finished.
          if (bite === end_of_stream) return finished;
          // 3. If utf-8 bytes needed is 0, based on byte:
          if (this.utf8_bytes_needed === 0) {
            // 0x00 to 0x7F
            if (inRange(bite, 0x00, 0x7f)) {
              // Return a code point whose value is byte.
              return bite;
            }
            // 0xC2 to 0xDF
            else if (inRange(bite, 0xc2, 0xdf)) {
              // 1. Set utf-8 bytes needed to 1.
              this.utf8_bytes_needed = 1;
              // 2. Set UTF-8 code point to byte & 0x1F.
              this.utf8_code_point = bite & 0x1f;
            }
            // 0xE0 to 0xEF
            else if (inRange(bite, 0xe0, 0xef)) {
              // 1. If byte is 0xE0, set utf-8 lower boundary to 0xA0.
              if (bite === 0xe0) this.utf8_lower_boundary = 0xa0;
              // 2. If byte is 0xED, set utf-8 upper boundary to 0x9F.
              if (bite === 0xed) this.utf8_upper_boundary = 0x9f;
              // 3. Set utf-8 bytes needed to 2.
              this.utf8_bytes_needed = 2;
              // 4. Set UTF-8 code point to byte & 0xF.
              this.utf8_code_point = bite & 0xf;
            }
            // 0xF0 to 0xF4
            else if (inRange(bite, 0xf0, 0xf4)) {
              // 1. If byte is 0xF0, set utf-8 lower boundary to 0x90.
              if (bite === 0xf0) this.utf8_lower_boundary = 0x90;
              // 2. If byte is 0xF4, set utf-8 upper boundary to 0x8F.
              if (bite === 0xf4) this.utf8_upper_boundary = 0x8f;
              // 3. Set utf-8 bytes needed to 3.
              this.utf8_bytes_needed = 3;
              // 4. Set UTF-8 code point to byte & 0x7.
              this.utf8_code_point = bite & 0x7;
            }
            // Otherwise
            else {
              // Return error.
              return decoderError(this.fatal);
            }
            // Return continue.
            return null;
          }
          // 4. If byte is not in the range utf-8 lower boundary to utf-8
          // upper boundary, inclusive, run these substeps:
          if (
            !inRange(bite, this.utf8_lower_boundary, this.utf8_upper_boundary)
          ) {
            // 1. Set utf-8 code point, utf-8 bytes needed, and utf-8
            // bytes seen to 0, set utf-8 lower boundary to 0x80, and set
            // utf-8 upper boundary to 0xBF.
            this.utf8_code_point =
              this.utf8_bytes_needed =
              this.utf8_bytes_seen =
                0;
            this.utf8_lower_boundary = 0x80;
            this.utf8_upper_boundary = 0xbf;
            // 2. Prepend byte to stream.
            stream.prepend(bite);
            // 3. Return error.
            return decoderError(this.fatal);
          }
          // 5. Set utf-8 lower boundary to 0x80 and utf-8 upper boundary
          // to 0xBF.
          this.utf8_lower_boundary = 0x80;
          this.utf8_upper_boundary = 0xbf;
          // 6. Set UTF-8 code point to (UTF-8 code point << 6) | (byte &
          // 0x3F)
          this.utf8_code_point = (this.utf8_code_point << 6) | (bite & 0x3f);
          // 7. Increase utf-8 bytes seen by one.
          this.utf8_bytes_seen += 1;
          // 8. If utf-8 bytes seen is not equal to utf-8 bytes needed,
          // continue.
          if (this.utf8_bytes_seen !== this.utf8_bytes_needed) return null;
          // 9. Let code point be utf-8 code point.
          const code_point = this.utf8_code_point;
          // 10. Set utf-8 code point, utf-8 bytes needed, and utf-8 bytes
          // seen to 0.
          this.utf8_code_point =
            this.utf8_bytes_needed =
            this.utf8_bytes_seen =
              0;
          // 11. Return a code point whose value is code point.
          return code_point;
        }
      } // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/coders/utf-8/UTF8Encoder.js
      //# sourceMappingURL=UTF8Decoder.js.map
      /**
       * @constructor
       * @implements {Encoder}
       * @param {{fatal: boolean}} options
       */
      class UTF8Encoder {
        constructor(options) {
          this.fatal = options.fatal;
        }
        /**
         * @param {Stream} stream Input stream.
         * @param {number} code_point Next code point read from the stream.
         * @return {(number|!Array.<number>)} Byte(s) to emit.
         */
        handler(stream, code_point) {
          // 1. If code point is end-of-stream, return finished.
          if (code_point === end_of_stream) return finished;
          // 2. If code point is an ASCII code point, return a byte whose
          // value is code point.
          if (isASCIICodePoint(code_point)) return code_point;
          // 3. Set count and offset based on the range code point is in:
          let count, offset;
          // U+0080 to U+07FF, inclusive:
          if (inRange(code_point, 0x0080, 0x07ff)) {
            // 1 and 0xC0
            count = 1;
            offset = 0xc0;
          }
          // U+0800 to U+FFFF, inclusive:
          else if (inRange(code_point, 0x0800, 0xffff)) {
            // 2 and 0xE0
            count = 2;
            offset = 0xe0;
          }
          // U+10000 to U+10FFFF, inclusive:
          else if (inRange(code_point, 0x10000, 0x10ffff)) {
            // 3 and 0xF0
            count = 3;
            offset = 0xf0;
          }
          // 4. Let bytes be a byte sequence whose first byte is (code
          // point >> (6 × count)) + offset.
          const bytes = [(code_point >> (6 * count)) + offset];
          // 5. Run these substeps while count is greater than 0:
          while (count > 0) {
            // 1. Set temp to code point >> (6 × (count − 1)).
            const temp = code_point >> (6 * (count - 1));
            // 2. Append to bytes 0x80 | (temp & 0x3F).
            bytes.push(0x80 | (temp & 0x3f));
            // 3. Decrease count by one.
            count -= 1;
          }
          // 6. Return bytes bytes, in order.
          return bytes;
        }
      } // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/coders/utf-8/index.js // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/coders/x-user-defined/XUserDefinedDecoder.js
      //# sourceMappingURL=UTF8Encoder.js.map
      //# sourceMappingURL=index.js.map
      /**
       * @constructor
       * @implements {Decoder}
       * @param {{fatal: boolean}} options
       */
      class XUserDefinedDecoder {
        constructor(options) {
          this.fatal = options.fatal;
        }
        /**
         * @param {Stream} stream The stream of bytes being decoded.
         * @param {number} bite The next byte read from the stream.
         * @return {?(number|!Array.<number>)} The next code point(s)
         *     decoded, or null if not enough data exists in the input
         *     stream to decode a complete code point.
         */
        handler(stream, bite) {
          // 1. If byte is end-of-stream, return finished.
          if (bite === end_of_stream) return finished;
          // 2. If byte is an ASCII byte, return a code point whose value
          // is byte.
          if (isASCIIByte(bite)) return bite;
          // 3. Return a code point whose value is 0xF780 + byte − 0x80.
          return 0xf780 + bite - 0x80;
        }
      } // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/coders/x-user-defined/XUserDefinedEncoder.js
      //# sourceMappingURL=XUserDefinedDecoder.js.map
      /**
       * @constructor
       * @implements {Encoder}
       * @param {{fatal: boolean}} options
       */
      class XUserDefinedEncoder {
        constructor(options) {
          this.fatal = options.fatal;
        }
        /**
         * @param {Stream} stream Input stream.
         * @param {number} code_point Next code point read from the stream.
         * @return {(number|!Array.<number>)} Byte(s) to emit.
         */
        handler(stream, code_point) {
          // 1.If code point is end-of-stream, return finished.
          if (code_point === end_of_stream) return finished;
          // 2. If code point is an ASCII code point, return a byte whose
          // value is code point.
          if (isASCIICodePoint(code_point)) return code_point;
          // 3. If code point is in the range U+F780 to U+F7FF, inclusive,
          // return a byte whose value is code point − 0xF780 + 0x80.
          if (inRange(code_point, 0xf780, 0xf7ff))
            return code_point - 0xf780 + 0x80;
          // 4. Return error with code point.
          return encoderError(code_point);
        }
      } // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/coders/x-user-defined/index.js // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/encoding/encoding-factory.js
      //# sourceMappingURL=XUserDefinedEncoder.js.map
      //# sourceMappingURL=index.js.map
      // This is free and unencumbered software released into the public domain.
      // See LICENSE.md for more information.

      //
      // Utilities
      //
      // import './encoding/utilities';
      //
      // Implementation of Encoding specification
      // https://encoding.spec.whatwg.org/
      //
      //
      // 4. Terminology
      //
      // import './encoding/terminology';
      //
      // 5. Encodings
      //
      // import "./encoding/encodings";
      //
      // 6. Indexes
      //
      // import './encoding/indexes';
      const encodingIndexes = getEncodingIndexes();
      // Registry of of encoder/decoder factories, by encoding name.
      /** @type {Object.<string, function({fatal:boolean}): Encoder>} */
      // const encoders: Encoders = {};
      /** @type {Object.<string, function({fatal:boolean}): Decoder>} */
      // const decoders: Decoders = {};
      //
      // 10. Legacy single-byte encodings
      //
      // 10.1 single-byte decoder
      // 10.2 single-byte encoder
      const encoders = {
        // 9.1 utf-8
        // 9.1.1 utf-8 decoder
        // 9.1.2 utf-8 encoder
        /** @param {{fatal: boolean}} options */
        "UTF-8": (options) => new UTF8Encoder(options),
        //
        // 11. Legacy multi-byte Chinese (simplified) encodings
        //
        // 11.1 gbk
        // 11.1.1 gbk decoder
        // gbk's decoder is gb18030's decoder.
        // 11.1.2 gbk encoder
        // gbk's encoder is gb18030's encoder with its gbk flag set.
        /** @param {{fatal: boolean}} options */
        GBK: (options) => new GB18030Encoder(options, true),
        // 11.2 gb18030
        // 11.2.1 gb18030 decoder
        // 11.2.2 gb18030 encoder
        /** @param {{fatal: boolean}} options */
        gb18030: (options) => new GB18030Encoder(options),
        //
        // 12. Legacy multi-byte Chinese (traditional) encodings
        //
        // 12.1 Big5
        // 12.1.1 Big5 decoder
        // 12.1.2 Big5 encoder
        /** @param {{fatal: boolean}} options */
        Big5: (options) => new Big5Encoder(options),
        //
        // 13. Legacy multi-byte Japanese encodings
        //
        // 13.1 euc-jp
        // 13.1.1 euc-jp decoder
        // 13.1.2 euc-jp encoder
        /** @param {{fatal: boolean}} options */
        "EUC-JP": (options) => new EUCJPEncoder(options),
        // 13.2 iso-2022-jp
        // 13.2.1 iso-2022-jp decoder
        // 13.2.2 iso-2022-jp encoder
        /** @param {{fatal: boolean}} options */
        "ISO-2022-JP": (options) => new ISO2022JPEncoder(options),
        // 13.3 Shift_JIS
        // 13.3.1 Shift_JIS decoder
        // 13.3.2 Shift_JIS encoder
        /** @param {{fatal: boolean}} options */
        Shift_JIS: (options) => new ShiftJISEncoder(options),
        //
        // 14. Legacy multi-byte Korean encodings
        //
        // 14.1 euc-kr
        // 14.1.1 euc-kr decoder
        // 14.1.2 euc-kr encoder
        /** @param {{fatal: boolean}} options */
        "EUC-KR": (options) => new EUCKREncoder(options),
        //
        // 15. Legacy miscellaneous encodings
        //
        // 15.1 replacement
        // Not needed - API throws RangeError
        // 15.2 Common infrastructure for utf-16be and utf-16le
        // 15.2.1 shared utf-16 decoder
        // 15.2.2 shared utf-16 encoder
        // 15.3 utf-16be
        // 15.3.1 utf-16be decoder
        /** @param {{fatal: boolean}} options */
        "UTF-16BE": (options) => new UTF16Encoder(true, options),
        // 15.3.2 utf-16be encoder
        // 15.4 utf-16le
        // 15.4.1 utf-16le decoder
        /** @param {{fatal: boolean}} options */
        "UTF-16LE": (options) => new UTF16Encoder(false, options),
        // 15.4.2 utf-16le encoder
        // 15.5 x-user-defined
        // 15.5.1 x-user-defined decoder
        // 15.5.2 x-user-defined encoder
        /** @param {{fatal: boolean}} options */
        "x-user-defined": (options) => new XUserDefinedEncoder(options),
      };
      const decoders = {
        /** @param {{fatal: boolean}} options */
        "UTF-8": (options) => new UTF8Decoder(options),
        /** @param {{fatal: boolean}} options */
        GBK: (options) => new GB18030Decoder(options),
        /** @param {{fatal: boolean}} options */
        gb18030: (options) => new GB18030Decoder(options),
        /** @param {{fatal: boolean}} options */
        Big5: (options) => new Big5Decoder(options),
        /** @param {{fatal: boolean}} options */
        "EUC-JP": (options) => new EUCJPDecoder(options),
        /** @param {{fatal: boolean}} options */
        "ISO-2022-JP": (options) => new ISO2022JPDecoder(options),
        /** @param {{fatal: boolean}} options */
        Shift_JIS: (options) => new ShiftJISDecoder(options),
        /** @param {{fatal: boolean}} options */
        "EUC-KR": (options) => new EUCKRDecoder(options),
        /** @param {{fatal: boolean}} options */
        "UTF-16BE": (options) => new UTF16Decoder(true, options),
        /** @param {{fatal: boolean}} options */
        "UTF-16LE": (options) => new UTF16Decoder(false, options),
        /** @param {{fatal: boolean}} options */
        "x-user-defined": (options) => new XUserDefinedDecoder(options),
      };
      if (encodingIndexes) {
        encodings.forEach(function (category) {
          if (category.heading !== "Legacy single-byte encodings") return;
          category.encodings.forEach(function (encoding) {
            const name = encoding.name;
            const idx = index(name.toLowerCase());
            /** @param {{fatal: boolean}} options */
            decoders[name] = function (options) {
              return new SingleByteDecoder(idx, options);
            };
            /** @param {{fatal: boolean}} options */
            encoders[name] = function (options) {
              return new SingleByteEncoder(idx, options);
            };
          });
        });
      } // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/common/Stream.js
      //# sourceMappingURL=encoding-factory.js.map
      /**
       * A stream represents an ordered sequence of tokens.
       */
      class Stream {
        /**
         *
         * @constructor
         * @param {!(Array.<number>|Uint8Array)} tokens Array of tokens that provide
         * the stream.
         */
        constructor(tokens) {
          /** @type {!Array.<number>} */
          this.tokens = Array.from(tokens);
          // Reversed as push/pop is more efficient than shift/unshift.
          this.tokens.reverse();
        }
        /**
         * @return {boolean} True if end-of-stream has been hit.
         */
        endOfStream() {
          return !this.tokens.length;
        }
        /**
         * When a token is read from a stream, the first token in the
         * stream must be returned and subsequently removed, and
         * end-of-stream must be returned otherwise.
         *
         * @return {number} Get the next token from the stream, or
         * end_of_stream.
         */
        read() {
          if (!this.tokens.length) return end_of_stream;
          return this.tokens.pop();
        }
        /**
         * When one or more tokens are prepended to a stream, those tokens
         * must be inserted, in given order, before the first token in the
         * stream.
         *
         * @param {(number|!Array.<number>)} token The token(s) to prepend to the
         * stream.
         */
        prepend(token) {
          if (Array.isArray(token)) {
            const tokens = token;
            while (tokens.length) this.tokens.push(tokens.pop());
          } else {
            this.tokens.push(token);
          }
        }
        /**
         * When one or more tokens are pushed to a stream, those tokens
         * must be inserted, in given order, after the last token in the
         * stream.
         *
         * @param {(number|!Array.<number>)} token The tokens(s) to push to the
         * stream.
         */
        push(token) {
          if (Array.isArray(token)) {
            const tokens = token;
            while (tokens.length) this.tokens.unshift(tokens.shift());
          } else {
            this.tokens.unshift(token);
          }
        }
      } // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/common/TextDecoder.js
      //# sourceMappingURL=Stream.js.map
      /**
       * @constructor
       * @param {string=} label The label of the encoding;
       *     defaults to 'utf-8'.
       * @param {Object=} options
       */
      class TextDecoder {
        constructor(label, options) {
          label = label !== undefined ? String(label) : DEFAULT_ENCODING;
          const optionsMap = ToDictionary(options);
          // A TextDecoder object has an associated encoding, decoder,
          // stream, ignore BOM flag (initially unset), BOM seen flag
          // (initially unset), error mode (initially replacement), and do
          // not flush flag (initially unset).
          /** @private */
          this._encoding = null;
          /** @private @type {?Decoder} */
          this._decoder = null;
          /** @private @type {boolean} */
          this._ignoreBOM = false;
          /** @private @type {boolean} */
          this._BOMseen = false;
          /** @private @type {string} */
          this._error_mode = "replacement";
          /** @private @type {boolean} */
          this._do_not_flush = false;
          // 1. Let encoding be the result of getting an encoding from
          // label.
          const encoding = getEncoding(label);
          // 2. If encoding is failure or replacement, throw a RangeError.
          if (encoding === null || encoding.name === "replacement")
            throw RangeError("Unknown encoding: " + label);
          if (!decoders[encoding.name]) {
            throw Error(
              "Decoder not present." +
                " Did you forget to include encoding-indexes.js first?",
            );
          }
          // 3. Let dec be a new TextDecoder object.
          // const dec = this;
          // no need to do this as this is a proper class
          // now and TSC will handle transpilation to older platforms
          // 4. Set dec's encoding to encoding.
          this._encoding = encoding;
          // 5. If options's fatal member is true, set dec's error mode to
          // fatal.
          if (Boolean(optionsMap["fatal"])) this._error_mode = "fatal";
          // 6. If options's ignoreBOM member is true, set dec's ignore BOM
          // flag.
          if (Boolean(optionsMap["ignoreBOM"])) this._ignoreBOM = true;
          // For pre-ES5 runtimes:
          // if (!Object.defineProperty) {
          //   this.encoding = dec._encoding.name.toLowerCase();
          //   this.fatal = dec._error_mode === 'fatal';
          //   this.ignoreBOM = dec._ignoreBOM;
          // }
          // 7. Return dec.
          // return dec;
        }
        // if (Object.defineProperty) {
        // The encoding attribute's getter must return encoding's name.
        //   Object.defineProperty(TextDecoder.prototype, 'encoding', {
        //     /** @this {TextDecoder} */
        //     get: function () { return this._encoding.name.toLowerCase(); }
        //   });
        get encoding() {
          return this._encoding.name.toLowerCase();
        }
        // The fatal attribute's getter must return true if error mode
        // is fatal, and false otherwise.
        //   Object.defineProperty(TextDecoder.prototype, 'fatal', {
        //     /** @this {TextDecoder} */
        //     get: function () { return this._error_mode === 'fatal'; }
        //   });
        get fatal() {
          return this._error_mode === "fatal";
        }
        // The ignoreBOM attribute's getter must return true if ignore
        // BOM flag is set, and false otherwise.
        //   Object.defineProperty(TextDecoder.prototype, 'ignoreBOM', {
        //     /** @this {TextDecoder} */
        //     get: function () { return this._ignoreBOM; }
        //   });
        get ignoreBOM() {
          return this._ignoreBOM;
        }
        // }
        /**
         * @param {BufferSource=} input The buffer of bytes to decode.
         * @param {Object=} options
         * @return {string} The decoded string.
         */
        decode(input, options) {
          const bytes = getBytesFromInput(input);
          const optionsMap = ToDictionary(options);
          // 1. If the do not flush flag is unset, set decoder to a new
          // encoding's decoder, set stream to a new stream, and unset the
          // BOM seen flag.
          if (!this._do_not_flush) {
            this._decoder = decoders[this._encoding.name]({
              fatal: this._error_mode === "fatal",
            });
            this._BOMseen = false;
          }
          // 2. If options's stream is true, set the do not flush flag, and
          // unset the do not flush flag otherwise.
          this._do_not_flush = Boolean(optionsMap["stream"]);
          // 3. If input is given, push a copy of input to stream.
          // TODO: Align with spec algorithm - maintain stream on instance.
          const input_stream = new Stream(bytes);
          // 4. Let output be a new stream.
          const output = [];
          /** @type {?(number|!Array.<number>)} */
          let result;
          // 5. While true:
          while (true) {
            // 1. Let token be the result of reading from stream.
            const token = input_stream.read();
            // 2. If token is end-of-stream and the do not flush flag is
            // set, return output, serialized.
            // TODO: Align with spec algorithm.
            if (token === end_of_stream) break;
            // 3. Otherwise, run these subsubsteps:
            // 1. Let result be the result of processing token for decoder,
            // stream, output, and error mode.
            result = this._decoder.handler(input_stream, token);
            // 2. If result is finished, return output, serialized.
            if (result === finished) break;
            if (result !== null) {
              if (Array.isArray(result))
                output.push.apply(
                  output,
                  /**@type {!Array.<number>}*/ (result),
                );
              else output.push(result);
            }
            // 3. Otherwise, if result is error, throw a TypeError.
            // (Thrown in handler)
            // 4. Otherwise, do nothing.
          }
          // TODO: Align with spec algorithm.
          if (!this._do_not_flush) {
            do {
              result = this._decoder.handler(input_stream, input_stream.read());
              if (result === finished) break;
              if (!result) continue;
              if (Array.isArray(result))
                output.push.apply(
                  output,
                  /**@type {!Array.<number>}*/ (result),
                );
              else output.push(result);
            } while (!input_stream.endOfStream());
            this._decoder = null;
          }
          return this.serializeStream(output);
        }
        // A TextDecoder object also has an associated serialize stream
        // algorithm...
        /**
         * @param {!Array.<number>} stream
         * @return {string}
         * @this {TextDecoder}
         */
        serializeStream(stream) {
          // 1. Let token be the result of reading from stream.
          // (Done in-place on array, rather than as a stream)
          // 2. If encoding is UTF-8, UTF-16BE, or UTF-16LE, and ignore
          // BOM flag and BOM seen flag are unset, run these subsubsteps:
          if (
            includes(["UTF-8", "UTF-16LE", "UTF-16BE"], this._encoding.name) &&
            !this._ignoreBOM &&
            !this._BOMseen
          ) {
            if (stream.length > 0 && stream[0] === 0xfeff) {
              // 1. If token is U+FEFF, set BOM seen flag.
              this._BOMseen = true;
              stream.shift();
            } else if (stream.length > 0) {
              // 2. Otherwise, if token is not end-of-stream, set BOM seen
              // flag and append token to stream.
              this._BOMseen = true;
            } else {
              // 3. Otherwise, if token is not end-of-stream, append token
              // to output.
              // (no-op)
            }
          }
          // 4. Otherwise, return output.
          return codePointsToString(stream);
        }
      }
      function isBufferInstance(input) {
        try {
          return input instanceof ArrayBuffer;
        } catch (e) {
          console.error(e);
          return false;
        }
      }
      function getBytesFromInput(input) {
        if (typeof input !== "object") return new Uint8Array(0);
        if (isBufferInstance(input)) {
          return new Uint8Array(input);
        }
        if ("buffer" in input && isBufferInstance(input.buffer)) {
          return new Uint8Array(
            input.buffer,
            input.byteOffset,
            input.byteLength,
          );
        }
        return new Uint8Array(0);
      } // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/common/TextEncoder.js
      //# sourceMappingURL=TextDecoder.js.map
      /**
       * @constructor
       * @param {string=} label The label of the encoding. NONSTANDARD.
       * @param {Object=} options NONSTANDARD.
       */
      class TextEncoder {
        constructor(label, options) {
          const optionsMap = ToDictionary(options);
          // A TextEncoder object has an associated encoding and encoder.
          /** @private */
          this._encoding = null;
          /** @private @type {?Encoder} */
          this._encoder = null;
          // Non-standard
          /** @private @type {boolean} */
          this._do_not_flush = false;
          /** @private @type {string} */
          this._fatal = Boolean(optionsMap["fatal"]) ? "fatal" : "replacement";
          // 1. Let enc be a new TextEncoder object.
          // const enc = this;
          // no need to do this as this is a proper class
          // now and TSC will handle transpilation to older platforms
          // 2. Set enc's encoding to UTF-8's encoder.
          if (Boolean(optionsMap["NONSTANDARD_allowLegacyEncoding"])) {
            // NONSTANDARD behavior.
            label = !!label ? String(label) : DEFAULT_ENCODING;
            const encoding = getEncoding(label);
            if (encoding === null || encoding.name === "replacement")
              throw RangeError("Unknown encoding: " + label);
            if (!encoders[encoding.name]) {
              throw Error(
                "Encoder not present." +
                  " Did you forget to include encoding-indexes.js first?",
              );
            }
            this._encoding = encoding;
            // EXPERIMENTAL_CODE
            // } else if (["iso-8859-1", "ISO-8859-1", "latin-1", "latin1", "LATIN-1", "LATIN1"].indexOf(label) !== -1) {
            //   this._encoding = getEncoding('iso-8859-1');
          } else {
            // Standard behavior.
            this._encoding = getEncoding("utf-8");
            const glo = getGlobalScope() || {};
            if (label !== undefined && "console" in glo) {
              console.warn(
                "TextEncoder constructor called with encoding label, " +
                  "which is ignored.",
              );
            }
          }
          // For pre-ES5 runtimes:
          // if (!Object.defineProperty)
          // this.encoding = enc._encoding.name.toLowerCase();
          // 3. Return enc.
          // return enc;
        }
        // if(Object.defineProperty) {
        //  // The encoding attribute's getter must return encoding's name.
        //   Object.defineProperty(TextEncoder.prototype, 'encoding', {
        //     /** @this {TextEncoder} */
        //     get: function () { return this._encoding.name.toLowerCase(); }
        //   });
        // }
        get encoding() {
          return this._encoding.name.toLowerCase();
        }
        /**
         * @param {string=} opt_string The string to encode.
         * @param {Object=} options
         * @return {!Uint8Array} Encoded bytes, as a Uint8Array.
         */
        encode(opt_string, options) {
          opt_string = opt_string === undefined ? "" : String(opt_string);
          const optionsMap = ToDictionary(options);
          // NOTE: This option is nonstandard. None of the encodings
          // permitted for encoding (i.e. UTF-8, UTF-16) are stateful when
          // the input is a USVString so streaming is not necessary.
          if (!this._do_not_flush)
            this._encoder = encoders[this._encoding.name]({
              fatal: this._fatal === "fatal",
            });
          this._do_not_flush = Boolean(optionsMap["stream"]);
          // 1. Convert input to a stream.
          const input = new Stream(stringToCodePoints(opt_string));
          // 2. Let output be a new stream
          const output = [];
          /** @type {?(number|!Array.<number>)} */
          let result;
          // 3. While true, run these substeps:
          while (true) {
            // 1. Let token be the result of reading from input.
            const token = input.read();
            if (token === end_of_stream) break;
            // 2. Let result be the result of processing token for encoder,
            // input, output.
            result = this._encoder.handler(input, token);
            if (result === finished) break;
            if (Array.isArray(result))
              output.push.apply(output, /**@type {!Array.<number>}*/ (result));
            else output.push(result);
          }
          // TODO: Align with spec algorithm.
          if (!this._do_not_flush) {
            while (true) {
              result = this._encoder.handler(input, input.read());
              if (result === finished) break;
              if (Array.isArray(result))
                output.push.apply(
                  output,
                  /**@type {!Array.<number>}*/ (result),
                );
              else output.push(result);
            }
            this._encoder = null;
          }
          // 3. If result is finished, convert output into a byte sequence,
          // and then return a Uint8Array object wrapping an ArrayBuffer
          // containing output.
          return new Uint8Array(output);
        }
      } // CONCATENATED MODULE: ./node_modules/@zxing/text-encoding/es2015/encoding.js
      //# sourceMappingURL=TextEncoder.js.map
      // Polyfills browser
      if (typeof window !== "undefined") {
        const checkUndefined = (key) =>
          !(key in window) ||
          typeof window[key] === "undefined" ||
          window[key] === null;
        if (checkUndefined("TextDecoder")) window["TextDecoder"] = TextDecoder;
        if (checkUndefined("TextEncoder")) window["TextEncoder"] = TextEncoder;
      }

      //# sourceMappingURL=encoding.js.map

      /***/
    },

    /******/
  };
  /************************************************************************/
  /******/ // The module cache
  /******/ var __webpack_module_cache__ = {};
  /******/
  /******/ // The require function
  /******/ function __webpack_require__(moduleId) {
    /******/ // Check if module is in cache
    /******/ var cachedModule = __webpack_module_cache__[moduleId];
    /******/ if (cachedModule !== undefined) {
      /******/ return cachedModule.exports;
      /******/
    }
    /******/ // Create a new module (and put it into the cache)
    /******/ var module = (__webpack_module_cache__[moduleId] = {
      /******/ // no module.id needed
      /******/ // no module.loaded needed
      /******/ exports: {},
      /******/
    });
    /******/
    /******/ // Execute the module function
    /******/ __webpack_modules__[moduleId](
      module,
      module.exports,
      __webpack_require__,
    );
    /******/
    /******/ // Return the exports of the module
    /******/ return module.exports;
    /******/
  }
  /******/
  /************************************************************************/
  /******/ /* webpack/runtime/define property getters */
  /******/ (() => {
    /******/ // define getter functions for harmony exports
    /******/ __webpack_require__.d = (exports, definition) => {
      /******/ for (var key in definition) {
        /******/ if (
          __webpack_require__.o(definition, key) &&
          !__webpack_require__.o(exports, key)
        ) {
          /******/ Object.defineProperty(exports, key, {
            enumerable: true,
            get: definition[key],
          });
          /******/
        }
        /******/
      }
      /******/
    };
    /******/
  })();
  /******/
  /******/ /* webpack/runtime/global */
  /******/ (() => {
    /******/ __webpack_require__.g = (function () {
      /******/ if (typeof globalThis === "object") return globalThis;
      /******/ try {
        /******/ return this || new Function("return this")();
        /******/
      } catch (e) {
        /******/ if (typeof window === "object") return window;
        /******/
      }
      /******/
    })();
    /******/
  })();
  /******/
  /******/ /* webpack/runtime/hasOwnProperty shorthand */
  /******/ (() => {
    /******/ __webpack_require__.o = (obj, prop) =>
      Object.prototype.hasOwnProperty.call(obj, prop);
    /******/
  })();
  /******/
  /******/ /* webpack/runtime/make namespace object */
  /******/ (() => {
    /******/ // define __esModule on exports
    /******/ __webpack_require__.r = (exports) => {
      /******/ if (typeof Symbol !== "undefined" && Symbol.toStringTag) {
        /******/ Object.defineProperty(exports, Symbol.toStringTag, {
          value: "Module",
        });
        /******/
      }
      /******/ Object.defineProperty(exports, "__esModule", { value: true });
      /******/
    };
    /******/
  })();
  /******/
  /************************************************************************/
  var __webpack_exports__ = {};
  // This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
  (() => {
    // ESM COMPAT FLAG
    __webpack_require__.r(__webpack_exports__);

    // EXPORTS
    __webpack_require__.d(__webpack_exports__, {
      AsyncByteQueue: () => /* reexport */ AsyncByteQueue,
      AsyncByteStream: () => /* reexport */ AsyncByteStream,
      AsyncMessageReader: () => /* reexport */ AsyncMessageReader,
      AsyncRecordBatchFileReader: () =>
        /* reexport */ AsyncRecordBatchFileReader,
      AsyncRecordBatchStreamReader: () =>
        /* reexport */ AsyncRecordBatchStreamReader,
      Binary: () => /* reexport */ Binary,
      BinaryBuilder: () => /* reexport */ BinaryBuilder,
      Bool: () => /* reexport */ Bool,
      BoolBuilder: () => /* reexport */ BoolBuilder,
      BufferType: () => /* reexport */ BufferType,
      Builder: () => /* reexport */ Builder,
      ByteStream: () => /* reexport */ ByteStream,
      Data: () => /* reexport */ Data,
      DataType: () => /* reexport */ DataType,
      DateBuilder: () => /* reexport */ DateBuilder,
      DateDay: () => /* reexport */ DateDay,
      DateDayBuilder: () => /* reexport */ DateDayBuilder,
      DateMillisecond: () => /* reexport */ DateMillisecond,
      DateMillisecondBuilder: () => /* reexport */ DateMillisecondBuilder,
      DateUnit: () => /* reexport */ DateUnit,
      Date_: () => /* reexport */ Date_,
      Decimal: () => /* reexport */ Decimal,
      DecimalBuilder: () => /* reexport */ DecimalBuilder,
      DenseUnion: () => /* reexport */ DenseUnion,
      DenseUnionBuilder: () => /* reexport */ DenseUnionBuilder,
      Dictionary: () => /* reexport */ Dictionary,
      DictionaryBuilder: () => /* reexport */ DictionaryBuilder,
      Field: () => /* reexport */ schema_Field,
      FixedSizeBinary: () => /* reexport */ FixedSizeBinary,
      FixedSizeBinaryBuilder: () => /* reexport */ FixedSizeBinaryBuilder,
      FixedSizeList: () => /* reexport */ FixedSizeList,
      FixedSizeListBuilder: () => /* reexport */ FixedSizeListBuilder,
      Float: () => /* reexport */ Float,
      Float16: () => /* reexport */ Float16,
      Float16Builder: () => /* reexport */ Float16Builder,
      Float32: () => /* reexport */ Float32,
      Float32Builder: () => /* reexport */ Float32Builder,
      Float64: () => /* reexport */ Float64,
      Float64Builder: () => /* reexport */ Float64Builder,
      FloatBuilder: () => /* reexport */ FloatBuilder,
      Int: () => /* reexport */ Int_,
      Int16: () => /* reexport */ Int16,
      Int16Builder: () => /* reexport */ Int16Builder,
      Int32: () => /* reexport */ Int32,
      Int32Builder: () => /* reexport */ Int32Builder,
      Int64: () => /* reexport */ Int64,
      Int64Builder: () => /* reexport */ Int64Builder,
      Int8: () => /* reexport */ Int8,
      Int8Builder: () => /* reexport */ Int8Builder,
      IntBuilder: () => /* reexport */ IntBuilder,
      Interval: () => /* reexport */ Interval_,
      IntervalBuilder: () => /* reexport */ IntervalBuilder,
      IntervalDayTime: () => /* reexport */ IntervalDayTime,
      IntervalDayTimeBuilder: () => /* reexport */ IntervalDayTimeBuilder,
      IntervalUnit: () => /* reexport */ IntervalUnit,
      IntervalYearMonth: () => /* reexport */ IntervalYearMonth,
      IntervalYearMonthBuilder: () => /* reexport */ IntervalYearMonthBuilder,
      JSONMessageReader: () => /* reexport */ JSONMessageReader,
      List: () => /* reexport */ List,
      ListBuilder: () => /* reexport */ ListBuilder,
      MapBuilder: () => /* reexport */ MapBuilder,
      MapRow: () => /* reexport */ MapRow,
      Map_: () => /* reexport */ Map_,
      Message: () => /* reexport */ Message,
      MessageHeader: () => /* reexport */ message_header_MessageHeader,
      MessageReader: () => /* reexport */ MessageReader,
      MetadataVersion: () => /* reexport */ MetadataVersion,
      Null: () => /* reexport */ Null,
      NullBuilder: () => /* reexport */ NullBuilder,
      Precision: () => /* reexport */ Precision,
      RecordBatch: () => /* reexport */ RecordBatch,
      RecordBatchFileReader: () => /* reexport */ RecordBatchFileReader,
      RecordBatchFileWriter: () => /* reexport */ RecordBatchFileWriter,
      RecordBatchJSONWriter: () => /* reexport */ RecordBatchJSONWriter,
      RecordBatchReader: () => /* reexport */ RecordBatchReader,
      RecordBatchStreamReader: () => /* reexport */ RecordBatchStreamReader,
      RecordBatchStreamWriter: () => /* reexport */ RecordBatchStreamWriter,
      RecordBatchWriter: () => /* reexport */ RecordBatchWriter,
      Schema: () => /* reexport */ schema_Schema,
      SparseUnion: () => /* reexport */ SparseUnion,
      SparseUnionBuilder: () => /* reexport */ SparseUnionBuilder,
      Struct: () => /* reexport */ Struct,
      StructBuilder: () => /* reexport */ StructBuilder,
      StructRow: () => /* reexport */ StructRow,
      Table: () => /* reexport */ Table,
      Time: () => /* reexport */ Time_,
      TimeBuilder: () => /* reexport */ TimeBuilder,
      TimeMicrosecond: () => /* reexport */ TimeMicrosecond,
      TimeMicrosecondBuilder: () => /* reexport */ TimeMicrosecondBuilder,
      TimeMillisecond: () => /* reexport */ TimeMillisecond,
      TimeMillisecondBuilder: () => /* reexport */ TimeMillisecondBuilder,
      TimeNanosecond: () => /* reexport */ TimeNanosecond,
      TimeNanosecondBuilder: () => /* reexport */ TimeNanosecondBuilder,
      TimeSecond: () => /* reexport */ TimeSecond,
      TimeSecondBuilder: () => /* reexport */ TimeSecondBuilder,
      TimeUnit: () => /* reexport */ TimeUnit,
      Timestamp: () => /* reexport */ Timestamp_,
      TimestampBuilder: () => /* reexport */ TimestampBuilder,
      TimestampMicrosecond: () => /* reexport */ TimestampMicrosecond,
      TimestampMicrosecondBuilder: () =>
        /* reexport */ TimestampMicrosecondBuilder,
      TimestampMillisecond: () => /* reexport */ TimestampMillisecond,
      TimestampMillisecondBuilder: () =>
        /* reexport */ TimestampMillisecondBuilder,
      TimestampNanosecond: () => /* reexport */ TimestampNanosecond,
      TimestampNanosecondBuilder: () =>
        /* reexport */ TimestampNanosecondBuilder,
      TimestampSecond: () => /* reexport */ TimestampSecond,
      TimestampSecondBuilder: () => /* reexport */ TimestampSecondBuilder,
      Type: () => /* reexport */ Type,
      Uint16: () => /* reexport */ Uint16,
      Uint16Builder: () => /* reexport */ Uint16Builder,
      Uint32: () => /* reexport */ Uint32,
      Uint32Builder: () => /* reexport */ Uint32Builder,
      Uint64: () => /* reexport */ Uint64,
      Uint64Builder: () => /* reexport */ Uint64Builder,
      Uint8: () => /* reexport */ Uint8,
      Uint8Builder: () => /* reexport */ Uint8Builder,
      Union: () => /* reexport */ Union_,
      UnionBuilder: () => /* reexport */ UnionBuilder,
      UnionMode: () => /* reexport */ UnionMode,
      Utf8: () => /* reexport */ Utf8,
      Utf8Builder: () => /* reexport */ Utf8Builder,
      Vector: () => /* reexport */ Vector,
      Visitor: () => /* reexport */ Visitor,
      builderThroughAsyncIterable: () =>
        /* reexport */ builderThroughAsyncIterable,
      builderThroughIterable: () => /* reexport */ builderThroughIterable,
      makeBuilder: () => /* reexport */ makeBuilder,
      makeData: () => /* reexport */ makeData,
      makeTable: () => /* reexport */ makeTable,
      makeVector: () => /* reexport */ makeVector,
      tableFromArrays: () => /* reexport */ tableFromArrays,
      tableFromIPC: () => /* reexport */ tableFromIPC,
      tableFromJSON: () => /* reexport */ tableFromJSON,
      tableToIPC: () => /* reexport */ tableToIPC,
      util: () => /* reexport */ util,
      vectorFromArray: () => /* reexport */ vectorFromArray,
    });

    // NAMESPACE OBJECT: ./node_modules/apache-arrow/util/buffer.mjs
    var buffer_namespaceObject = {};
    __webpack_require__.r(buffer_namespaceObject);
    __webpack_require__.d(buffer_namespaceObject, {
      compareArrayLike: () => compareArrayLike,
      joinUint8Arrays: () => joinUint8Arrays,
      memcpy: () => memcpy,
      rebaseValueOffsets: () => rebaseValueOffsets,
      toArrayBufferView: () => toArrayBufferView,
      toArrayBufferViewAsyncIterator: () => toArrayBufferViewAsyncIterator,
      toArrayBufferViewIterator: () => toArrayBufferViewIterator,
      toBigInt64Array: () => toBigInt64Array,
      toBigUint64Array: () => toBigUint64Array,
      toFloat32Array: () => toFloat32Array,
      toFloat32ArrayAsyncIterator: () => toFloat32ArrayAsyncIterator,
      toFloat32ArrayIterator: () => toFloat32ArrayIterator,
      toFloat64Array: () => toFloat64Array,
      toFloat64ArrayAsyncIterator: () => toFloat64ArrayAsyncIterator,
      toFloat64ArrayIterator: () => toFloat64ArrayIterator,
      toInt16Array: () => toInt16Array,
      toInt16ArrayAsyncIterator: () => toInt16ArrayAsyncIterator,
      toInt16ArrayIterator: () => toInt16ArrayIterator,
      toInt32Array: () => toInt32Array,
      toInt32ArrayAsyncIterator: () => toInt32ArrayAsyncIterator,
      toInt32ArrayIterator: () => toInt32ArrayIterator,
      toInt8Array: () => toInt8Array,
      toInt8ArrayAsyncIterator: () => toInt8ArrayAsyncIterator,
      toInt8ArrayIterator: () => toInt8ArrayIterator,
      toUint16Array: () => toUint16Array,
      toUint16ArrayAsyncIterator: () => toUint16ArrayAsyncIterator,
      toUint16ArrayIterator: () => toUint16ArrayIterator,
      toUint32Array: () => toUint32Array,
      toUint32ArrayAsyncIterator: () => toUint32ArrayAsyncIterator,
      toUint32ArrayIterator: () => toUint32ArrayIterator,
      toUint8Array: () => toUint8Array,
      toUint8ArrayAsyncIterator: () => toUint8ArrayAsyncIterator,
      toUint8ArrayIterator: () => toUint8ArrayIterator,
      toUint8ClampedArray: () => toUint8ClampedArray,
      toUint8ClampedArrayAsyncIterator: () => toUint8ClampedArrayAsyncIterator,
      toUint8ClampedArrayIterator: () => toUint8ClampedArrayIterator,
    });

    // NAMESPACE OBJECT: ./node_modules/apache-arrow/util/bn.mjs
    var bn_namespaceObject = {};
    __webpack_require__.r(bn_namespaceObject);
    __webpack_require__.d(bn_namespaceObject, {
      BN: () => BN,
      bignumToBigInt: () => bignumToBigInt,
      bignumToString: () => bignumToString,
      isArrowBigNumSymbol: () => isArrowBigNumSymbol,
    });

    // NAMESPACE OBJECT: ./node_modules/apache-arrow/util/math.mjs
    var math_namespaceObject = {};
    __webpack_require__.r(math_namespaceObject);
    __webpack_require__.d(math_namespaceObject, {
      float64ToUint16: () => float64ToUint16,
      uint16ToFloat64: () => uint16ToFloat64,
    });

    // NAMESPACE OBJECT: ./node_modules/apache-arrow/util/vector.mjs
    var vector_namespaceObject = {};
    __webpack_require__.r(vector_namespaceObject);
    __webpack_require__.d(vector_namespaceObject, {
      clampIndex: () => clampIndex,
      clampRange: () => clampRange,
      createElementComparator: () => createElementComparator,
    });

    // NAMESPACE OBJECT: ./node_modules/apache-arrow/util/bit.mjs
    var bit_namespaceObject = {};
    __webpack_require__.r(bit_namespaceObject);
    __webpack_require__.d(bit_namespaceObject, {
      BitIterator: () => BitIterator,
      getBit: () => getBit,
      getBool: () => bit_getBool,
      packBools: () => packBools,
      popcnt_array: () => popcnt_array,
      popcnt_bit_range: () => popcnt_bit_range,
      popcnt_uint32: () => popcnt_uint32,
      setBool: () => bit_setBool,
      truncateBitmap: () => truncateBitmap,
    });

    // NAMESPACE OBJECT: ./node_modules/apache-arrow/util/int.mjs
    var util_int_namespaceObject = {};
    __webpack_require__.r(util_int_namespaceObject);
    __webpack_require__.d(util_int_namespaceObject, {
      BaseInt64: () => BaseInt64,
      Int128: () => Int128,
      Int64: () => int_Int64,
      Uint64: () => int_Uint64,
    }); // CONCATENATED MODULE: ./node_modules/tslib/tslib.es6.js

    /******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
    /* global Reflect, Promise */

    var extendStatics = function (d, b) {
      extendStatics =
        Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array &&
          function (d, b) {
            d.__proto__ = b;
          }) ||
        function (d, b) {
          for (var p in b)
            if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p];
        };
      return extendStatics(d, b);
    };

    function __extends(d, b) {
      if (typeof b !== "function" && b !== null)
        throw new TypeError(
          "Class extends value " + String(b) + " is not a constructor or null",
        );
      extendStatics(d, b);
      function __() {
        this.constructor = d;
      }
      d.prototype =
        b === null
          ? Object.create(b)
          : ((__.prototype = b.prototype), new __());
    }

    var __assign = function () {
      __assign =
        Object.assign ||
        function __assign(t) {
          for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s)
              if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
          }
          return t;
        };
      return __assign.apply(this, arguments);
    };

    function __rest(s, e) {
      var t = {};
      for (var p in s)
        if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
          t[p] = s[p];
      if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (
          var i = 0, p = Object.getOwnPropertySymbols(s);
          i < p.length;
          i++
        ) {
          if (
            e.indexOf(p[i]) < 0 &&
            Object.prototype.propertyIsEnumerable.call(s, p[i])
          )
            t[p[i]] = s[p[i]];
        }
      return t;
    }

    function __decorate(decorators, target, key, desc) {
      var c = arguments.length,
        r =
          c < 3
            ? target
            : desc === null
            ? (desc = Object.getOwnPropertyDescriptor(target, key))
            : desc,
        d;
      if (typeof Reflect === "object" && typeof Reflect.decorate === "function")
        r = Reflect.decorate(decorators, target, key, desc);
      else
        for (var i = decorators.length - 1; i >= 0; i--)
          if ((d = decorators[i]))
            r =
              (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
      return c > 3 && r && Object.defineProperty(target, key, r), r;
    }

    function __param(paramIndex, decorator) {
      return function (target, key) {
        decorator(target, key, paramIndex);
      };
    }

    function __metadata(metadataKey, metadataValue) {
      if (typeof Reflect === "object" && typeof Reflect.metadata === "function")
        return Reflect.metadata(metadataKey, metadataValue);
    }

    function __awaiter(thisArg, _arguments, P, generator) {
      function adopt(value) {
        return value instanceof P
          ? value
          : new P(function (resolve) {
              resolve(value);
            });
      }
      return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) {
          try {
            step(generator.next(value));
          } catch (e) {
            reject(e);
          }
        }
        function rejected(value) {
          try {
            step(generator["throw"](value));
          } catch (e) {
            reject(e);
          }
        }
        function step(result) {
          result.done
            ? resolve(result.value)
            : adopt(result.value).then(fulfilled, rejected);
        }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
      });
    }

    function __generator(thisArg, body) {
      var _ = {
          label: 0,
          sent: function () {
            if (t[0] & 1) throw t[1];
            return t[1];
          },
          trys: [],
          ops: [],
        },
        f,
        y,
        t,
        g;
      return (
        (g = { next: verb(0), throw: verb(1), return: verb(2) }),
        typeof Symbol === "function" &&
          (g[Symbol.iterator] = function () {
            return this;
          }),
        g
      );
      function verb(n) {
        return function (v) {
          return step([n, v]);
        };
      }
      function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while ((g && ((g = 0), op[0] && (_ = 0)), _))
          try {
            if (
              ((f = 1),
              y &&
                (t =
                  op[0] & 2
                    ? y["return"]
                    : op[0]
                    ? y["throw"] || ((t = y["return"]) && t.call(y), 0)
                    : y.next) &&
                !(t = t.call(y, op[1])).done)
            )
              return t;
            if (((y = 0), t)) op = [op[0] & 2, t.value];
            switch (op[0]) {
              case 0:
              case 1:
                t = op;
                break;
              case 4:
                _.label++;
                return { value: op[1], done: false };
              case 5:
                _.label++;
                y = op[1];
                op = [0];
                continue;
              case 7:
                op = _.ops.pop();
                _.trys.pop();
                continue;
              default:
                if (
                  !((t = _.trys), (t = t.length > 0 && t[t.length - 1])) &&
                  (op[0] === 6 || op[0] === 2)
                ) {
                  _ = 0;
                  continue;
                }
                if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
                  _.label = op[1];
                  break;
                }
                if (op[0] === 6 && _.label < t[1]) {
                  _.label = t[1];
                  t = op;
                  break;
                }
                if (t && _.label < t[2]) {
                  _.label = t[2];
                  _.ops.push(op);
                  break;
                }
                if (t[2]) _.ops.pop();
                _.trys.pop();
                continue;
            }
            op = body.call(thisArg, _);
          } catch (e) {
            op = [6, e];
            y = 0;
          } finally {
            f = t = 0;
          }
        if (op[0] & 5) throw op[1];
        return { value: op[0] ? op[1] : void 0, done: true };
      }
    }

    var __createBinding = Object.create
      ? function (o, m, k, k2) {
          if (k2 === undefined) k2 = k;
          var desc = Object.getOwnPropertyDescriptor(m, k);
          if (
            !desc ||
            ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)
          ) {
            desc = {
              enumerable: true,
              get: function () {
                return m[k];
              },
            };
          }
          Object.defineProperty(o, k2, desc);
        }
      : function (o, m, k, k2) {
          if (k2 === undefined) k2 = k;
          o[k2] = m[k];
        };

    function __exportStar(m, o) {
      for (var p in m)
        if (p !== "default" && !Object.prototype.hasOwnProperty.call(o, p))
          __createBinding(o, m, p);
    }

    function __values(o) {
      var s = typeof Symbol === "function" && Symbol.iterator,
        m = s && o[s],
        i = 0;
      if (m) return m.call(o);
      if (o && typeof o.length === "number")
        return {
          next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
          },
        };
      throw new TypeError(
        s ? "Object is not iterable." : "Symbol.iterator is not defined.",
      );
    }

    function __read(o, n) {
      var m = typeof Symbol === "function" && o[Symbol.iterator];
      if (!m) return o;
      var i = m.call(o),
        r,
        ar = [],
        e;
      try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done)
          ar.push(r.value);
      } catch (error) {
        e = { error: error };
      } finally {
        try {
          if (r && !r.done && (m = i["return"])) m.call(i);
        } finally {
          if (e) throw e.error;
        }
      }
      return ar;
    }

    /** @deprecated */
    function __spread() {
      for (var ar = [], i = 0; i < arguments.length; i++)
        ar = ar.concat(__read(arguments[i]));
      return ar;
    }

    /** @deprecated */
    function __spreadArrays() {
      for (var s = 0, i = 0, il = arguments.length; i < il; i++)
        s += arguments[i].length;
      for (var r = Array(s), k = 0, i = 0; i < il; i++)
        for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
          r[k] = a[j];
      return r;
    }

    function __spreadArray(to, from, pack) {
      if (pack || arguments.length === 2)
        for (var i = 0, l = from.length, ar; i < l; i++) {
          if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
          }
        }
      return to.concat(ar || Array.prototype.slice.call(from));
    }

    function __await(v) {
      return this instanceof __await ? ((this.v = v), this) : new __await(v);
    }

    function __asyncGenerator(thisArg, _arguments, generator) {
      if (!Symbol.asyncIterator)
        throw new TypeError("Symbol.asyncIterator is not defined.");
      var g = generator.apply(thisArg, _arguments || []),
        i,
        q = [];
      return (
        (i = {}),
        verb("next"),
        verb("throw"),
        verb("return"),
        (i[Symbol.asyncIterator] = function () {
          return this;
        }),
        i
      );
      function verb(n) {
        if (g[n])
          i[n] = function (v) {
            return new Promise(function (a, b) {
              q.push([n, v, a, b]) > 1 || resume(n, v);
            });
          };
      }
      function resume(n, v) {
        try {
          step(g[n](v));
        } catch (e) {
          settle(q[0][3], e);
        }
      }
      function step(r) {
        r.value instanceof __await
          ? Promise.resolve(r.value.v).then(fulfill, reject)
          : settle(q[0][2], r);
      }
      function fulfill(value) {
        resume("next", value);
      }
      function reject(value) {
        resume("throw", value);
      }
      function settle(f, v) {
        if ((f(v), q.shift(), q.length)) resume(q[0][0], q[0][1]);
      }
    }

    function __asyncDelegator(o) {
      var i, p;
      return (
        (i = {}),
        verb("next"),
        verb("throw", function (e) {
          throw e;
        }),
        verb("return"),
        (i[Symbol.iterator] = function () {
          return this;
        }),
        i
      );
      function verb(n, f) {
        i[n] = o[n]
          ? function (v) {
              return (p = !p)
                ? { value: __await(o[n](v)), done: n === "return" }
                : f
                ? f(v)
                : v;
            }
          : f;
      }
    }

    function __asyncValues(o) {
      if (!Symbol.asyncIterator)
        throw new TypeError("Symbol.asyncIterator is not defined.");
      var m = o[Symbol.asyncIterator],
        i;
      return m
        ? m.call(o)
        : ((o =
            typeof __values === "function"
              ? __values(o)
              : o[Symbol.iterator]()),
          (i = {}),
          verb("next"),
          verb("throw"),
          verb("return"),
          (i[Symbol.asyncIterator] = function () {
            return this;
          }),
          i);
      function verb(n) {
        i[n] =
          o[n] &&
          function (v) {
            return new Promise(function (resolve, reject) {
              (v = o[n](v)), settle(resolve, reject, v.done, v.value);
            });
          };
      }
      function settle(resolve, reject, d, v) {
        Promise.resolve(v).then(function (v) {
          resolve({ value: v, done: d });
        }, reject);
      }
    }

    function __makeTemplateObject(cooked, raw) {
      if (Object.defineProperty) {
        Object.defineProperty(cooked, "raw", { value: raw });
      } else {
        cooked.raw = raw;
      }
      return cooked;
    }

    var __setModuleDefault = Object.create
      ? function (o, v) {
          Object.defineProperty(o, "default", { enumerable: true, value: v });
        }
      : function (o, v) {
          o["default"] = v;
        };

    function __importStar(mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k in mod)
          if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
            __createBinding(result, mod, k);
      __setModuleDefault(result, mod);
      return result;
    }

    function __importDefault(mod) {
      return mod && mod.__esModule ? mod : { default: mod };
    }

    function __classPrivateFieldGet(receiver, state, kind, f) {
      if (kind === "a" && !f)
        throw new TypeError("Private accessor was defined without a getter");
      if (
        typeof state === "function"
          ? receiver !== state || !f
          : !state.has(receiver)
      )
        throw new TypeError(
          "Cannot read private member from an object whose class did not declare it",
        );
      return kind === "m"
        ? f
        : kind === "a"
        ? f.call(receiver)
        : f
        ? f.value
        : state.get(receiver);
    }

    function __classPrivateFieldSet(receiver, state, value, kind, f) {
      if (kind === "m") throw new TypeError("Private method is not writable");
      if (kind === "a" && !f)
        throw new TypeError("Private accessor was defined without a setter");
      if (
        typeof state === "function"
          ? receiver !== state || !f
          : !state.has(receiver)
      )
        throw new TypeError(
          "Cannot write private member to an object whose class did not declare it",
        );
      return (
        kind === "a"
          ? f.call(receiver, value)
          : f
          ? (f.value = value)
          : state.set(receiver, value),
        value
      );
    }

    function __classPrivateFieldIn(state, receiver) {
      if (
        receiver === null ||
        (typeof receiver !== "object" && typeof receiver !== "function")
      )
        throw new TypeError("Cannot use 'in' operator on non-object");
      return typeof state === "function"
        ? receiver === state
        : state.has(receiver);
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/util/utf8.mjs

    /* provided dependency */ var TextDecoder =
      __webpack_require__(35)["TextDecoder"];
    /* provided dependency */ var TextEncoder =
      __webpack_require__(35)["TextEncoder"];
    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.
    const decoder = new TextDecoder("utf-8");
    /** @ignore */
    const decodeUtf8 = (buffer) => decoder.decode(buffer);
    const encoder = new TextEncoder();
    /** @ignore */
    const encodeUtf8 = (value) => encoder.encode(value); // CONCATENATED MODULE: ./node_modules/apache-arrow/util/compat.mjs

    //# sourceMappingURL=utf8.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.
    /** @ignore */
    const [BigIntCtor, BigIntAvailable] = (() => {
      const BigIntUnavailableError = () => {
        throw new Error("BigInt is not available in this environment");
      };
      function BigIntUnavailable() {
        throw BigIntUnavailableError();
      }
      BigIntUnavailable.asIntN = () => {
        throw BigIntUnavailableError();
      };
      BigIntUnavailable.asUintN = () => {
        throw BigIntUnavailableError();
      };
      return typeof BigInt !== "undefined"
        ? [BigInt, true]
        : [BigIntUnavailable, false];
    })();
    /** @ignore */
    const [BigInt64ArrayCtor, BigInt64ArrayAvailable] = (() => {
      const BigInt64ArrayUnavailableError = () => {
        throw new Error("BigInt64Array is not available in this environment");
      };
      class BigInt64ArrayUnavailable {
        static get BYTES_PER_ELEMENT() {
          return 8;
        }
        static of() {
          throw BigInt64ArrayUnavailableError();
        }
        static from() {
          throw BigInt64ArrayUnavailableError();
        }
        constructor() {
          throw BigInt64ArrayUnavailableError();
        }
      }
      return typeof BigInt64Array !== "undefined"
        ? [BigInt64Array, true]
        : [BigInt64ArrayUnavailable, false];
    })();
    /** @ignore */
    const [BigUint64ArrayCtor, BigUint64ArrayAvailable] = (() => {
      const BigUint64ArrayUnavailableError = () => {
        throw new Error("BigUint64Array is not available in this environment");
      };
      class BigUint64ArrayUnavailable {
        static get BYTES_PER_ELEMENT() {
          return 8;
        }
        static of() {
          throw BigUint64ArrayUnavailableError();
        }
        static from() {
          throw BigUint64ArrayUnavailableError();
        }
        constructor() {
          throw BigUint64ArrayUnavailableError();
        }
      }
      return typeof BigUint64Array !== "undefined"
        ? [BigUint64Array, true]
        : [BigUint64ArrayUnavailable, false];
    })();

    /** @ignore */ const isNumber = (x) => typeof x === "number";
    /** @ignore */ const isBoolean = (x) => typeof x === "boolean";
    /** @ignore */ const isFunction = (x) => typeof x === "function";
    /** @ignore */
    // eslint-disable-next-line @typescript-eslint/ban-types
    const isObject = (x) => x != null && Object(x) === x;
    /** @ignore */
    const isPromise = (x) => {
      return isObject(x) && isFunction(x.then);
    };
    /** @ignore */
    const isObservable = (x) => {
      return isObject(x) && isFunction(x.subscribe);
    };
    /** @ignore */
    const isIterable = (x) => {
      return isObject(x) && isFunction(x[Symbol.iterator]);
    };
    /** @ignore */
    const isAsyncIterable = (x) => {
      return isObject(x) && isFunction(x[Symbol.asyncIterator]);
    };
    /** @ignore */
    const isArrowJSON = (x) => {
      return isObject(x) && isObject(x["schema"]);
    };
    /** @ignore */
    const isArrayLike = (x) => {
      return isObject(x) && isNumber(x["length"]);
    };
    /** @ignore */
    const isIteratorResult = (x) => {
      return isObject(x) && "done" in x && "value" in x;
    };
    /** @ignore */
    const isUnderlyingSink = (x) => {
      return (
        isObject(x) &&
        isFunction(x["abort"]) &&
        isFunction(x["close"]) &&
        isFunction(x["start"]) &&
        isFunction(x["write"])
      );
    };
    /** @ignore */
    const isFileHandle = (x) => {
      return isObject(x) && isFunction(x["stat"]) && isNumber(x["fd"]);
    };
    /** @ignore */
    const isFSReadStream = (x) => {
      return isReadableNodeStream(x) && isNumber(x["bytesRead"]);
    };
    /** @ignore */
    const isFetchResponse = (x) => {
      return isObject(x) && isReadableDOMStream(x["body"]);
    };
    const isReadableInterop = (x) =>
      "_getDOMStream" in x && "_getNodeStream" in x;
    /** @ignore */
    const isWritableDOMStream = (x) => {
      return (
        isObject(x) &&
        isFunction(x["abort"]) &&
        isFunction(x["getWriter"]) &&
        !isReadableInterop(x)
      );
    };
    /** @ignore */
    const isReadableDOMStream = (x) => {
      return (
        isObject(x) &&
        isFunction(x["cancel"]) &&
        isFunction(x["getReader"]) &&
        !isReadableInterop(x)
      );
    };
    /** @ignore */
    const isWritableNodeStream = (x) => {
      return (
        isObject(x) &&
        isFunction(x["end"]) &&
        isFunction(x["write"]) &&
        isBoolean(x["writable"]) &&
        !isReadableInterop(x)
      );
    };
    /** @ignore */
    const isReadableNodeStream = (x) => {
      return (
        isObject(x) &&
        isFunction(x["read"]) &&
        isFunction(x["pipe"]) &&
        isBoolean(x["readable"]) &&
        !isReadableInterop(x)
      );
    };
    /** @ignore */
    const isFlatbuffersByteBuffer = (x) => {
      return (
        isObject(x) &&
        isFunction(x["clear"]) &&
        isFunction(x["bytes"]) &&
        isFunction(x["position"]) &&
        isFunction(x["setPosition"]) &&
        isFunction(x["capacity"]) &&
        isFunction(x["getBufferIdentifier"]) &&
        isFunction(x["createLong"])
      );
    }; // CONCATENATED MODULE: ./node_modules/apache-arrow/util/buffer.mjs

    //# sourceMappingURL=compat.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    const SharedArrayBuf =
      typeof SharedArrayBuffer !== "undefined"
        ? SharedArrayBuffer
        : ArrayBuffer;
    /** @ignore */
    function collapseContiguousByteRanges(chunks) {
      const result = chunks[0] ? [chunks[0]] : [];
      let xOffset, yOffset, xLen, yLen;
      for (let x, y, i = 0, j = 0, n = chunks.length; ++i < n; ) {
        x = result[j];
        y = chunks[i];
        // continue if x and y don't share the same underlying ArrayBuffer, or if x isn't before y
        if (!x || !y || x.buffer !== y.buffer || y.byteOffset < x.byteOffset) {
          y && (result[++j] = y);
          continue;
        }
        ({ byteOffset: xOffset, byteLength: xLen } = x);
        ({ byteOffset: yOffset, byteLength: yLen } = y);
        // continue if the byte ranges of x and y aren't contiguous
        if (xOffset + xLen < yOffset || yOffset + yLen < xOffset) {
          y && (result[++j] = y);
          continue;
        }
        result[j] = new Uint8Array(x.buffer, xOffset, yOffset - xOffset + yLen);
      }
      return result;
    }
    /** @ignore */
    function memcpy(
      target,
      source,
      targetByteOffset = 0,
      sourceByteLength = source.byteLength,
    ) {
      const targetByteLength = target.byteLength;
      const dst = new Uint8Array(
        target.buffer,
        target.byteOffset,
        targetByteLength,
      );
      const src = new Uint8Array(
        source.buffer,
        source.byteOffset,
        Math.min(sourceByteLength, targetByteLength),
      );
      dst.set(src, targetByteOffset);
      return target;
    }
    /** @ignore */
    function joinUint8Arrays(chunks, size) {
      // collapse chunks that share the same underlying ArrayBuffer and whose byte ranges overlap,
      // to avoid unnecessarily copying the bytes to do this buffer join. This is a common case during
      // streaming, where we may be reading partial byte ranges out of the same underlying ArrayBuffer
      const result = collapseContiguousByteRanges(chunks);
      const byteLength = result.reduce((x, b) => x + b.byteLength, 0);
      let source, sliced, buffer;
      let offset = 0,
        index = -1;
      const length = Math.min(size || Number.POSITIVE_INFINITY, byteLength);
      for (const n = result.length; ++index < n; ) {
        source = result[index];
        sliced = source.subarray(0, Math.min(source.length, length - offset));
        if (length <= offset + sliced.length) {
          if (sliced.length < source.length) {
            result[index] = source.subarray(sliced.length);
          } else if (sliced.length === source.length) {
            index++;
          }
          buffer ? memcpy(buffer, sliced, offset) : (buffer = sliced);
          break;
        }
        memcpy(buffer || (buffer = new Uint8Array(length)), sliced, offset);
        offset += sliced.length;
      }
      return [
        buffer || new Uint8Array(0),
        result.slice(index),
        byteLength - (buffer ? buffer.byteLength : 0),
      ];
    }
    /** @ignore */
    function toArrayBufferView(ArrayBufferViewCtor, input) {
      let value = isIteratorResult(input) ? input.value : input;
      if (value instanceof ArrayBufferViewCtor) {
        if (ArrayBufferViewCtor === Uint8Array) {
          // Node's `Buffer` class passes the `instanceof Uint8Array` check, but we need
          // a real Uint8Array, since Buffer#slice isn't the same as Uint8Array#slice :/
          return new ArrayBufferViewCtor(
            value.buffer,
            value.byteOffset,
            value.byteLength,
          );
        }
        return value;
      }
      if (!value) {
        return new ArrayBufferViewCtor(0);
      }
      if (typeof value === "string") {
        value = encodeUtf8(value);
      }
      if (value instanceof ArrayBuffer) {
        return new ArrayBufferViewCtor(value);
      }
      if (value instanceof SharedArrayBuf) {
        return new ArrayBufferViewCtor(value);
      }
      if (isFlatbuffersByteBuffer(value)) {
        return toArrayBufferView(ArrayBufferViewCtor, value.bytes());
      }
      return !ArrayBuffer.isView(value)
        ? ArrayBufferViewCtor.from(value)
        : value.byteLength <= 0
        ? new ArrayBufferViewCtor(0)
        : new ArrayBufferViewCtor(
            value.buffer,
            value.byteOffset,
            value.byteLength / ArrayBufferViewCtor.BYTES_PER_ELEMENT,
          );
    }
    /** @ignore */ const toInt8Array = (input) =>
      toArrayBufferView(Int8Array, input);
    /** @ignore */ const toInt16Array = (input) =>
      toArrayBufferView(Int16Array, input);
    /** @ignore */ const toInt32Array = (input) =>
      toArrayBufferView(Int32Array, input);
    /** @ignore */ const toBigInt64Array = (input) =>
      toArrayBufferView(BigInt64ArrayCtor, input);
    /** @ignore */ const toUint8Array = (input) =>
      toArrayBufferView(Uint8Array, input);
    /** @ignore */ const toUint16Array = (input) =>
      toArrayBufferView(Uint16Array, input);
    /** @ignore */ const toUint32Array = (input) =>
      toArrayBufferView(Uint32Array, input);
    /** @ignore */ const toBigUint64Array = (input) =>
      toArrayBufferView(BigUint64ArrayCtor, input);
    /** @ignore */ const toFloat32Array = (input) =>
      toArrayBufferView(Float32Array, input);
    /** @ignore */ const toFloat64Array = (input) =>
      toArrayBufferView(Float64Array, input);
    /** @ignore */ const toUint8ClampedArray = (input) =>
      toArrayBufferView(Uint8ClampedArray, input);
    /** @ignore */
    const pump = (iterator) => {
      iterator.next();
      return iterator;
    };
    /** @ignore */
    function* toArrayBufferViewIterator(ArrayCtor, source) {
      const wrap = function* (x) {
        yield x;
      };
      const buffers =
        typeof source === "string"
          ? wrap(source)
          : ArrayBuffer.isView(source)
          ? wrap(source)
          : source instanceof ArrayBuffer
          ? wrap(source)
          : source instanceof SharedArrayBuf
          ? wrap(source)
          : !isIterable(source)
          ? wrap(source)
          : source;
      yield* pump(
        (function* (it) {
          let r = null;
          do {
            r = it.next(yield toArrayBufferView(ArrayCtor, r));
          } while (!r.done);
        })(buffers[Symbol.iterator]()),
      );
      return new ArrayCtor();
    }
    /** @ignore */ const toInt8ArrayIterator = (input) =>
      toArrayBufferViewIterator(Int8Array, input);
    /** @ignore */ const toInt16ArrayIterator = (input) =>
      toArrayBufferViewIterator(Int16Array, input);
    /** @ignore */ const toInt32ArrayIterator = (input) =>
      toArrayBufferViewIterator(Int32Array, input);
    /** @ignore */ const toUint8ArrayIterator = (input) =>
      toArrayBufferViewIterator(Uint8Array, input);
    /** @ignore */ const toUint16ArrayIterator = (input) =>
      toArrayBufferViewIterator(Uint16Array, input);
    /** @ignore */ const toUint32ArrayIterator = (input) =>
      toArrayBufferViewIterator(Uint32Array, input);
    /** @ignore */ const toFloat32ArrayIterator = (input) =>
      toArrayBufferViewIterator(Float32Array, input);
    /** @ignore */ const toFloat64ArrayIterator = (input) =>
      toArrayBufferViewIterator(Float64Array, input);
    /** @ignore */ const toUint8ClampedArrayIterator = (input) =>
      toArrayBufferViewIterator(Uint8ClampedArray, input);
    /** @ignore */
    function toArrayBufferViewAsyncIterator(ArrayCtor, source) {
      return __asyncGenerator(
        this,
        arguments,
        function* toArrayBufferViewAsyncIterator_1() {
          // if a Promise, unwrap the Promise and iterate the resolved value
          if (isPromise(source)) {
            return yield __await(
              yield __await(
                yield* __asyncDelegator(
                  __asyncValues(
                    toArrayBufferViewAsyncIterator(
                      ArrayCtor,
                      yield __await(source),
                    ),
                  ),
                ),
              ),
            );
          }
          const wrap = function (x) {
            return __asyncGenerator(this, arguments, function* () {
              yield yield __await(yield __await(x));
            });
          };
          const emit = function (source) {
            return __asyncGenerator(this, arguments, function* () {
              yield __await(
                yield* __asyncDelegator(
                  __asyncValues(
                    pump(
                      (function* (it) {
                        let r = null;
                        do {
                          r = it.next(
                            yield r === null || r === void 0 ? void 0 : r.value,
                          );
                        } while (!r.done);
                      })(source[Symbol.iterator]()),
                    ),
                  ),
                ),
              );
            });
          };
          const buffers =
            typeof source === "string"
              ? wrap(source) // if string, wrap in an AsyncIterableIterator
              : ArrayBuffer.isView(source)
              ? wrap(source) // if TypedArray, wrap in an AsyncIterableIterator
              : source instanceof ArrayBuffer
              ? wrap(source) // if ArrayBuffer, wrap in an AsyncIterableIterator
              : source instanceof SharedArrayBuf
              ? wrap(source) // if SharedArrayBuffer, wrap in an AsyncIterableIterator
              : isIterable(source)
              ? emit(source) // If Iterable, wrap in an AsyncIterableIterator and compose the `next` values
              : !isAsyncIterable(source)
              ? wrap(source) // If not an AsyncIterable, treat as a sentinel and wrap in an AsyncIterableIterator
              : source; // otherwise if AsyncIterable, use it
          yield __await(
            // otherwise if AsyncIterable, use it
            yield* __asyncDelegator(
              __asyncValues(
                pump(
                  (function (it) {
                    return __asyncGenerator(this, arguments, function* () {
                      let r = null;
                      do {
                        r = yield __await(
                          it.next(
                            yield yield __await(
                              toArrayBufferView(ArrayCtor, r),
                            ),
                          ),
                        );
                      } while (!r.done);
                    });
                  })(buffers[Symbol.asyncIterator]()),
                ),
              ),
            ),
          );
          return yield __await(new ArrayCtor());
        },
      );
    }
    /** @ignore */ const toInt8ArrayAsyncIterator = (input) =>
      toArrayBufferViewAsyncIterator(Int8Array, input);
    /** @ignore */ const toInt16ArrayAsyncIterator = (input) =>
      toArrayBufferViewAsyncIterator(Int16Array, input);
    /** @ignore */ const toInt32ArrayAsyncIterator = (input) =>
      toArrayBufferViewAsyncIterator(Int32Array, input);
    /** @ignore */ const toUint8ArrayAsyncIterator = (input) =>
      toArrayBufferViewAsyncIterator(Uint8Array, input);
    /** @ignore */ const toUint16ArrayAsyncIterator = (input) =>
      toArrayBufferViewAsyncIterator(Uint16Array, input);
    /** @ignore */ const toUint32ArrayAsyncIterator = (input) =>
      toArrayBufferViewAsyncIterator(Uint32Array, input);
    /** @ignore */ const toFloat32ArrayAsyncIterator = (input) =>
      toArrayBufferViewAsyncIterator(Float32Array, input);
    /** @ignore */ const toFloat64ArrayAsyncIterator = (input) =>
      toArrayBufferViewAsyncIterator(Float64Array, input);
    /** @ignore */ const toUint8ClampedArrayAsyncIterator = (input) =>
      toArrayBufferViewAsyncIterator(Uint8ClampedArray, input);
    /** @ignore */
    function rebaseValueOffsets(offset, length, valueOffsets) {
      // If we have a non-zero offset, create a new offsets array with the values
      // shifted by the start offset, such that the new start offset is 0
      if (offset !== 0) {
        valueOffsets = valueOffsets.slice(0, length + 1);
        for (let i = -1; ++i <= length; ) {
          valueOffsets[i] += offset;
        }
      }
      return valueOffsets;
    }
    /** @ignore */
    function compareArrayLike(a, b) {
      let i = 0;
      const n = a.length;
      if (n !== b.length) {
        return false;
      }
      if (n > 0) {
        do {
          if (a[i] !== b[i]) {
            return false;
          }
        } while (++i < n);
      }
      return true;
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/io/adapters.mjs

    //# sourceMappingURL=buffer.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    /* harmony default export */ const adapters = {
      fromIterable(source) {
        return adapters_pump(fromIterable(source));
      },
      fromAsyncIterable(source) {
        return adapters_pump(fromAsyncIterable(source));
      },
      fromDOMStream(source) {
        return adapters_pump(fromDOMStream(source));
      },
      fromNodeStream(stream) {
        return adapters_pump(fromNodeStream(stream));
      },
      // @ts-ignore
      toDOMStream(source, options) {
        throw new Error(`"toDOMStream" not available in this environment`);
      },
      // @ts-ignore
      toNodeStream(source, options) {
        throw new Error(`"toNodeStream" not available in this environment`);
      },
    };
    /** @ignore */
    const adapters_pump = (iterator) => {
      iterator.next();
      return iterator;
    };
    /** @ignore */
    function* fromIterable(source) {
      let done,
        threw = false;
      let buffers = [],
        buffer;
      let cmd,
        size,
        bufferLength = 0;
      function byteRange() {
        if (cmd === "peek") {
          return joinUint8Arrays(buffers, size)[0];
        }
        [buffer, buffers, bufferLength] = joinUint8Arrays(buffers, size);
        return buffer;
      }
      // Yield so the caller can inject the read command before creating the source Iterator
      ({ cmd, size } = yield null);
      // initialize the iterator
      const it = toUint8ArrayIterator(source)[Symbol.iterator]();
      try {
        do {
          // read the next value
          ({ done, value: buffer } = Number.isNaN(size - bufferLength)
            ? it.next()
            : it.next(size - bufferLength));
          // if chunk is not null or empty, push it onto the queue
          if (!done && buffer.byteLength > 0) {
            buffers.push(buffer);
            bufferLength += buffer.byteLength;
          }
          // If we have enough bytes in our buffer, yield chunks until we don't
          if (done || size <= bufferLength) {
            do {
              ({ cmd, size } = yield byteRange());
            } while (size < bufferLength);
          }
        } while (!done);
      } catch (e) {
        (threw = true) && typeof it.throw === "function" && it.throw(e);
      } finally {
        threw === false && typeof it.return === "function" && it.return(null);
      }
      return null;
    }
    /** @ignore */
    function fromAsyncIterable(source) {
      return __asyncGenerator(this, arguments, function* fromAsyncIterable_1() {
        let done,
          threw = false;
        let buffers = [],
          buffer;
        let cmd,
          size,
          bufferLength = 0;
        function byteRange() {
          if (cmd === "peek") {
            return joinUint8Arrays(buffers, size)[0];
          }
          [buffer, buffers, bufferLength] = joinUint8Arrays(buffers, size);
          return buffer;
        }
        // Yield so the caller can inject the read command before creating the source AsyncIterator
        ({ cmd, size } = yield yield __await(null));
        // initialize the iterator
        const it = toUint8ArrayAsyncIterator(source)[Symbol.asyncIterator]();
        try {
          do {
            // read the next value
            ({ done, value: buffer } = Number.isNaN(size - bufferLength)
              ? yield __await(it.next())
              : yield __await(it.next(size - bufferLength)));
            // if chunk is not null or empty, push it onto the queue
            if (!done && buffer.byteLength > 0) {
              buffers.push(buffer);
              bufferLength += buffer.byteLength;
            }
            // If we have enough bytes in our buffer, yield chunks until we don't
            if (done || size <= bufferLength) {
              do {
                ({ cmd, size } = yield yield __await(byteRange()));
              } while (size < bufferLength);
            }
          } while (!done);
        } catch (e) {
          (threw = true) &&
            typeof it.throw === "function" &&
            (yield __await(it.throw(e)));
        } finally {
          threw === false &&
            typeof it.return === "function" &&
            (yield __await(it.return(new Uint8Array(0))));
        }
        return yield __await(null);
      });
    }
    // All this manual Uint8Array chunk management can be avoided if/when engines
    // add support for ArrayBuffer.transfer() or ArrayBuffer.prototype.realloc():
    // https://github.com/domenic/proposal-arraybuffer-transfer
    /** @ignore */
    function fromDOMStream(source) {
      return __asyncGenerator(this, arguments, function* fromDOMStream_1() {
        let done = false,
          threw = false;
        let buffers = [],
          buffer;
        let cmd,
          size,
          bufferLength = 0;
        function byteRange() {
          if (cmd === "peek") {
            return joinUint8Arrays(buffers, size)[0];
          }
          [buffer, buffers, bufferLength] = joinUint8Arrays(buffers, size);
          return buffer;
        }
        // Yield so the caller can inject the read command before we establish the ReadableStream lock
        ({ cmd, size } = yield yield __await(null));
        // initialize the reader and lock the stream
        const it = new AdaptiveByteReader(source);
        try {
          do {
            // read the next value
            ({ done, value: buffer } = Number.isNaN(size - bufferLength)
              ? yield __await(it["read"]())
              : yield __await(it["read"](size - bufferLength)));
            // if chunk is not null or empty, push it onto the queue
            if (!done && buffer.byteLength > 0) {
              buffers.push(toUint8Array(buffer));
              bufferLength += buffer.byteLength;
            }
            // If we have enough bytes in our buffer, yield chunks until we don't
            if (done || size <= bufferLength) {
              do {
                ({ cmd, size } = yield yield __await(byteRange()));
              } while (size < bufferLength);
            }
          } while (!done);
        } catch (e) {
          (threw = true) && (yield __await(it["cancel"](e)));
        } finally {
          threw === false
            ? yield __await(it["cancel"]())
            : source["locked"] && it.releaseLock();
        }
        return yield __await(null);
      });
    }
    /** @ignore */
    class AdaptiveByteReader {
      constructor(source) {
        this.source = source;
        this.reader = null;
        this.reader = this.source["getReader"]();
        // We have to catch and swallow errors here to avoid uncaught promise rejection exceptions
        // that seem to be raised when we call `releaseLock()` on this reader. I'm still mystified
        // about why these errors are raised, but I'm sure there's some important spec reason that
        // I haven't considered. I hate to employ such an anti-pattern here, but it seems like the
        // only solution in this case :/
        this.reader["closed"].catch(() => {});
      }
      get closed() {
        return this.reader
          ? this.reader["closed"].catch(() => {})
          : Promise.resolve();
      }
      releaseLock() {
        if (this.reader) {
          this.reader.releaseLock();
        }
        this.reader = null;
      }
      cancel(reason) {
        return __awaiter(this, void 0, void 0, function* () {
          const { reader, source } = this;
          reader && (yield reader["cancel"](reason).catch(() => {}));
          source && source["locked"] && this.releaseLock();
        });
      }
      read(size) {
        return __awaiter(this, void 0, void 0, function* () {
          if (size === 0) {
            return { done: this.reader == null, value: new Uint8Array(0) };
          }
          const result = yield this.reader.read();
          !result.done && (result.value = toUint8Array(result));
          return result;
        });
      }
    }
    /** @ignore */
    const onEvent = (stream, event) => {
      const handler = (_) => resolve([event, _]);
      let resolve;
      return [
        event,
        handler,
        new Promise((r) => (resolve = r) && stream["once"](event, handler)),
      ];
    };
    /** @ignore */
    function fromNodeStream(stream) {
      return __asyncGenerator(this, arguments, function* fromNodeStream_1() {
        const events = [];
        let event = "error";
        let done = false,
          err = null;
        let cmd,
          size,
          bufferLength = 0;
        let buffers = [],
          buffer;
        function byteRange() {
          if (cmd === "peek") {
            return joinUint8Arrays(buffers, size)[0];
          }
          [buffer, buffers, bufferLength] = joinUint8Arrays(buffers, size);
          return buffer;
        }
        // Yield so the caller can inject the read command before we
        // add the listener for the source stream's 'readable' event.
        ({ cmd, size } = yield yield __await(null));
        // ignore stdin if it's a TTY
        if (stream["isTTY"]) {
          yield yield __await(new Uint8Array(0));
          return yield __await(null);
        }
        try {
          // initialize the stream event handlers
          events[0] = onEvent(stream, "end");
          events[1] = onEvent(stream, "error");
          do {
            events[2] = onEvent(stream, "readable");
            // wait on the first message event from the stream
            [event, err] = yield __await(Promise.race(events.map((x) => x[2])));
            // if the stream emitted an Error, rethrow it
            if (event === "error") {
              break;
            }
            if (!(done = event === "end")) {
              // If the size is NaN, request to read everything in the stream's internal buffer
              if (!Number.isFinite(size - bufferLength)) {
                buffer = toUint8Array(stream["read"]());
              } else {
                buffer = toUint8Array(stream["read"](size - bufferLength));
                // If the byteLength is 0, then the requested amount is more than the stream has
                // in its internal buffer. In this case the stream needs a "kick" to tell it to
                // continue emitting readable events, so request to read everything the stream
                // has in its internal buffer right now.
                if (buffer.byteLength < size - bufferLength) {
                  buffer = toUint8Array(stream["read"]());
                }
              }
              // if chunk is not null or empty, push it onto the queue
              if (buffer.byteLength > 0) {
                buffers.push(buffer);
                bufferLength += buffer.byteLength;
              }
            }
            // If we have enough bytes in our buffer, yield chunks until we don't
            if (done || size <= bufferLength) {
              do {
                ({ cmd, size } = yield yield __await(byteRange()));
              } while (size < bufferLength);
            }
          } while (!done);
        } finally {
          yield __await(cleanup(events, event === "error" ? err : null));
        }
        return yield __await(null);
        function cleanup(events, err) {
          buffer = buffers = null;
          return new Promise((resolve, reject) => {
            for (const [evt, fn] of events) {
              stream["off"](evt, fn);
            }
            try {
              // Some stream implementations don't call the destroy callback,
              // because it's really a node-internal API. Just calling `destroy`
              // here should be enough to conform to the ReadableStream contract
              const destroy = stream["destroy"];
              destroy && destroy.call(stream, err);
              err = undefined;
            } catch (e) {
              err = e || err;
            } finally {
              err != null ? reject(err) : resolve();
            }
          });
        }
      });
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/enum.mjs

    //# sourceMappingURL=adapters.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.
    ////
    //
    // A few enums copied from `fb/Schema.ts` and `fb/Message.ts` because Webpack
    // v4 doesn't seem to be able to tree-shake the rest of those exports.
    //
    // We will have to keep these enums in sync when we re-generate the flatbuffers
    // code from the shchemas. See js/DEVELOP.md for info on how to run flatbuffers
    // code generation.
    //
    ////
    /**
     * Logical types, vector layouts, and schemas
     *
     * @enum {number}
     */
    var MetadataVersion;
    (function (MetadataVersion) {
      /**
       * 0.1.0 (October 2016).
       */
      MetadataVersion[(MetadataVersion["V1"] = 0)] = "V1";
      /**
       * 0.2.0 (February 2017). Non-backwards compatible with V1.
       */
      MetadataVersion[(MetadataVersion["V2"] = 1)] = "V2";
      /**
       * 0.3.0 -> 0.7.1 (May - December 2017). Non-backwards compatible with V2.
       */
      MetadataVersion[(MetadataVersion["V3"] = 2)] = "V3";
      /**
       * >= 0.8.0 (December 2017). Non-backwards compatible with V3.
       */
      MetadataVersion[(MetadataVersion["V4"] = 3)] = "V4";
      /**
       * >= 1.0.0 (July 2020. Backwards compatible with V4 (V5 readers can read V4
       * metadata and IPC messages). Implementations are recommended to provide a
       * V4 compatibility mode with V5 format changes disabled.
       *
       * Incompatible changes between V4 and V5:
       * - Union buffer layout has changed. In V5, Unions don't have a validity
       *   bitmap buffer.
       */
      MetadataVersion[(MetadataVersion["V5"] = 4)] = "V5";
    })(MetadataVersion || (MetadataVersion = {}));
    /**
     * @enum {number}
     */
    var UnionMode;
    (function (UnionMode) {
      UnionMode[(UnionMode["Sparse"] = 0)] = "Sparse";
      UnionMode[(UnionMode["Dense"] = 1)] = "Dense";
    })(UnionMode || (UnionMode = {}));
    /**
     * @enum {number}
     */
    var Precision;
    (function (Precision) {
      Precision[(Precision["HALF"] = 0)] = "HALF";
      Precision[(Precision["SINGLE"] = 1)] = "SINGLE";
      Precision[(Precision["DOUBLE"] = 2)] = "DOUBLE";
    })(Precision || (Precision = {}));
    /**
     * @enum {number}
     */
    var DateUnit;
    (function (DateUnit) {
      DateUnit[(DateUnit["DAY"] = 0)] = "DAY";
      DateUnit[(DateUnit["MILLISECOND"] = 1)] = "MILLISECOND";
    })(DateUnit || (DateUnit = {}));
    /**
     * @enum {number}
     */
    var TimeUnit;
    (function (TimeUnit) {
      TimeUnit[(TimeUnit["SECOND"] = 0)] = "SECOND";
      TimeUnit[(TimeUnit["MILLISECOND"] = 1)] = "MILLISECOND";
      TimeUnit[(TimeUnit["MICROSECOND"] = 2)] = "MICROSECOND";
      TimeUnit[(TimeUnit["NANOSECOND"] = 3)] = "NANOSECOND";
    })(TimeUnit || (TimeUnit = {}));
    /**
     * @enum {number}
     */
    var IntervalUnit;
    (function (IntervalUnit) {
      IntervalUnit[(IntervalUnit["YEAR_MONTH"] = 0)] = "YEAR_MONTH";
      IntervalUnit[(IntervalUnit["DAY_TIME"] = 1)] = "DAY_TIME";
      IntervalUnit[(IntervalUnit["MONTH_DAY_NANO"] = 2)] = "MONTH_DAY_NANO";
    })(IntervalUnit || (IntervalUnit = {}));
    /**
     * ----------------------------------------------------------------------
     * The root Message type
     * This union enables us to easily send different message types without
     * redundant storage, and in the future we can easily add new message types.
     *
     * Arrow implementations do not need to implement all of the message types,
     * which may include experimental metadata types. For maximum compatibility,
     * it is best to send data using RecordBatch
     *
     * @enum {number}
     */
    var MessageHeader;
    (function (MessageHeader) {
      MessageHeader[(MessageHeader["NONE"] = 0)] = "NONE";
      MessageHeader[(MessageHeader["Schema"] = 1)] = "Schema";
      MessageHeader[(MessageHeader["DictionaryBatch"] = 2)] = "DictionaryBatch";
      MessageHeader[(MessageHeader["RecordBatch"] = 3)] = "RecordBatch";
      MessageHeader[(MessageHeader["Tensor"] = 4)] = "Tensor";
      MessageHeader[(MessageHeader["SparseTensor"] = 5)] = "SparseTensor";
    })(MessageHeader || (MessageHeader = {}));
    /**
     * Main data type enumeration.
     *
     * Data types in this library are all *logical*. They can be expressed as
     * either a primitive physical type (bytes or bits of some fixed size), a
     * nested type consisting of other data types, or another data type (e.g. a
     * timestamp encoded as an int64).
     *
     * **Note**: Only enum values 0-17 (NONE through Map) are written to an Arrow
     * IPC payload.
     *
     * The rest of the values are specified here so TypeScript can narrow the type
     * signatures further beyond the base Arrow Types. The Arrow DataTypes include
     * metadata like `bitWidth` that impact the type signatures of the values we
     * accept and return.
     *
     * For example, the `Int8Vector` reads 1-byte numbers from an `Int8Array`, an
     * `Int32Vector` reads a 4-byte number from an `Int32Array`, and an `Int64Vector`
     * reads a pair of 4-byte lo, hi 32-bit integers as a zero-copy slice from the
     * underlying `Int32Array`.
     *
     * Library consumers benefit by knowing the narrowest type, since we can ensure
     * the types across all public methods are propagated, and never bail to `any`.
     * These values are _never_ used at runtime, and they will _never_ be written
     * to the flatbuffers metadata of serialized Arrow IPC payloads.
     */
    var Type;
    (function (Type) {
      Type[(Type["NONE"] = 0)] = "NONE";
      Type[(Type["Null"] = 1)] = "Null";
      Type[(Type["Int"] = 2)] = "Int";
      Type[(Type["Float"] = 3)] = "Float";
      Type[(Type["Binary"] = 4)] = "Binary";
      Type[(Type["Utf8"] = 5)] = "Utf8";
      Type[(Type["Bool"] = 6)] = "Bool";
      Type[(Type["Decimal"] = 7)] = "Decimal";
      Type[(Type["Date"] = 8)] = "Date";
      Type[(Type["Time"] = 9)] = "Time";
      Type[(Type["Timestamp"] = 10)] = "Timestamp";
      Type[(Type["Interval"] = 11)] = "Interval";
      Type[(Type["List"] = 12)] = "List";
      Type[(Type["Struct"] = 13)] = "Struct";
      Type[(Type["Union"] = 14)] = "Union";
      Type[(Type["FixedSizeBinary"] = 15)] = "FixedSizeBinary";
      Type[(Type["FixedSizeList"] = 16)] = "FixedSizeList";
      Type[(Type["Map"] = 17)] = "Map";
      Type[(Type["Dictionary"] = -1)] = "Dictionary";
      Type[(Type["Int8"] = -2)] = "Int8";
      Type[(Type["Int16"] = -3)] = "Int16";
      Type[(Type["Int32"] = -4)] = "Int32";
      Type[(Type["Int64"] = -5)] = "Int64";
      Type[(Type["Uint8"] = -6)] = "Uint8";
      Type[(Type["Uint16"] = -7)] = "Uint16";
      Type[(Type["Uint32"] = -8)] = "Uint32";
      Type[(Type["Uint64"] = -9)] = "Uint64";
      Type[(Type["Float16"] = -10)] = "Float16";
      Type[(Type["Float32"] = -11)] = "Float32";
      Type[(Type["Float64"] = -12)] = "Float64";
      Type[(Type["DateDay"] = -13)] = "DateDay";
      Type[(Type["DateMillisecond"] = -14)] = "DateMillisecond";
      Type[(Type["TimestampSecond"] = -15)] = "TimestampSecond";
      Type[(Type["TimestampMillisecond"] = -16)] = "TimestampMillisecond";
      Type[(Type["TimestampMicrosecond"] = -17)] = "TimestampMicrosecond";
      Type[(Type["TimestampNanosecond"] = -18)] = "TimestampNanosecond";
      Type[(Type["TimeSecond"] = -19)] = "TimeSecond";
      Type[(Type["TimeMillisecond"] = -20)] = "TimeMillisecond";
      Type[(Type["TimeMicrosecond"] = -21)] = "TimeMicrosecond";
      Type[(Type["TimeNanosecond"] = -22)] = "TimeNanosecond";
      Type[(Type["DenseUnion"] = -23)] = "DenseUnion";
      Type[(Type["SparseUnion"] = -24)] = "SparseUnion";
      Type[(Type["IntervalDayTime"] = -25)] = "IntervalDayTime";
      Type[(Type["IntervalYearMonth"] = -26)] = "IntervalYearMonth";
    })(Type || (Type = {}));
    var BufferType;
    (function (BufferType) {
      /**
       * used in List type, Dense Union and variable length primitive types (String, Binary)
       */
      BufferType[(BufferType["OFFSET"] = 0)] = "OFFSET";
      /**
       * actual data, either wixed width primitive types in slots or variable width delimited by an OFFSET vector
       */
      BufferType[(BufferType["DATA"] = 1)] = "DATA";
      /**
       * Bit vector indicating if each value is null
       */
      BufferType[(BufferType["VALIDITY"] = 2)] = "VALIDITY";
      /**
       * Type vector used in Union type
       */
      BufferType[(BufferType["TYPE"] = 3)] = "TYPE";
    })(BufferType || (BufferType = {})); // CONCATENATED MODULE: ./node_modules/apache-arrow/util/pretty.mjs

    //# sourceMappingURL=enum.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.
    /** @ignore */ const undf = void 0;
    /** @ignore */
    function valueToString(x) {
      if (x === null) {
        return "null";
      }
      if (x === undf) {
        return "undefined";
      }
      switch (typeof x) {
        case "number":
          return `${x}`;
        case "bigint":
          return `${x}`;
        case "string":
          return `"${x}"`;
      }
      // If [Symbol.toPrimitive] is implemented (like in BN)
      // use it instead of JSON.stringify(). This ensures we
      // print BigInts, Decimals, and Binary in their native
      // representation
      if (typeof x[Symbol.toPrimitive] === "function") {
        return x[Symbol.toPrimitive]("string");
      }
      if (ArrayBuffer.isView(x)) {
        if (x instanceof BigInt64Array || x instanceof BigUint64Array) {
          return `[${[...x].map((x) => valueToString(x))}]`;
        }
        return `[${x}]`;
      }
      return ArrayBuffer.isView(x)
        ? `[${x}]`
        : JSON.stringify(x, (_, y) => (typeof y === "bigint" ? `${y}` : y));
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/util/bn.mjs

    //# sourceMappingURL=pretty.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    const isArrowBigNumSymbol = Symbol.for("isArrowBigNum");
    /** @ignore */
    function BigNum(x, ...xs) {
      if (xs.length === 0) {
        return Object.setPrototypeOf(
          toArrayBufferView(this["TypedArray"], x),
          this.constructor.prototype,
        );
      }
      return Object.setPrototypeOf(
        new this["TypedArray"](x, ...xs),
        this.constructor.prototype,
      );
    }
    BigNum.prototype[isArrowBigNumSymbol] = true;
    BigNum.prototype.toJSON = function () {
      return `"${bignumToString(this)}"`;
    };
    BigNum.prototype.valueOf = function () {
      return bignumToNumber(this);
    };
    BigNum.prototype.toString = function () {
      return bignumToString(this);
    };
    BigNum.prototype[Symbol.toPrimitive] = function (hint = "default") {
      switch (hint) {
        case "number":
          return bignumToNumber(this);
        case "string":
          return bignumToString(this);
        case "default":
          return bignumToBigInt(this);
      }
      // @ts-ignore
      return bignumToString(this);
    };
    /** @ignore */
    function SignedBigNum(...args) {
      return BigNum.apply(this, args);
    }
    /** @ignore */
    function UnsignedBigNum(...args) {
      return BigNum.apply(this, args);
    }
    /** @ignore */
    function DecimalBigNum(...args) {
      return BigNum.apply(this, args);
    }
    Object.setPrototypeOf(
      SignedBigNum.prototype,
      Object.create(Int32Array.prototype),
    );
    Object.setPrototypeOf(
      UnsignedBigNum.prototype,
      Object.create(Uint32Array.prototype),
    );
    Object.setPrototypeOf(
      DecimalBigNum.prototype,
      Object.create(Uint32Array.prototype),
    );
    Object.assign(SignedBigNum.prototype, BigNum.prototype, {
      constructor: SignedBigNum,
      signed: true,
      TypedArray: Int32Array,
      BigIntArray: BigInt64ArrayCtor,
    });
    Object.assign(UnsignedBigNum.prototype, BigNum.prototype, {
      constructor: UnsignedBigNum,
      signed: false,
      TypedArray: Uint32Array,
      BigIntArray: BigUint64ArrayCtor,
    });
    Object.assign(DecimalBigNum.prototype, BigNum.prototype, {
      constructor: DecimalBigNum,
      signed: true,
      TypedArray: Uint32Array,
      BigIntArray: BigUint64ArrayCtor,
    });
    /** @ignore */
    function bignumToNumber(bn) {
      const { buffer, byteOffset, length, signed: signed } = bn;
      const words = new BigUint64ArrayCtor(buffer, byteOffset, length);
      const negative =
        signed && words[words.length - 1] & (BigInt(1) << BigInt(63));
      let number = negative ? BigInt(1) : BigInt(0);
      let i = BigInt(0);
      if (!negative) {
        for (const word of words) {
          number += word * (BigInt(1) << (BigInt(32) * i++));
        }
      } else {
        for (const word of words) {
          number += ~word * (BigInt(1) << (BigInt(32) * i++));
        }
        number *= BigInt(-1);
      }
      return number;
    }
    /** @ignore */
    let bignumToString;
    /** @ignore */
    let bignumToBigInt;
    if (!BigIntAvailable) {
      bignumToString = decimalToString;
      bignumToBigInt = bignumToString;
    } else {
      bignumToBigInt = (a) =>
        a.byteLength === 8
          ? new a["BigIntArray"](a.buffer, a.byteOffset, 1)[0]
          : decimalToString(a);
      bignumToString = (a) =>
        a.byteLength === 8
          ? `${new a["BigIntArray"](a.buffer, a.byteOffset, 1)[0]}`
          : decimalToString(a);
    }
    /** @ignore */
    function decimalToString(a) {
      let digits = "";
      const base64 = new Uint32Array(2);
      let base32 = new Uint16Array(a.buffer, a.byteOffset, a.byteLength / 2);
      const checks = new Uint32Array(
        (base32 = new Uint16Array(base32).reverse()).buffer,
      );
      let i = -1;
      const n = base32.length - 1;
      do {
        for (base64[0] = base32[(i = 0)]; i < n; ) {
          base32[i++] = base64[1] = base64[0] / 10;
          base64[0] = ((base64[0] - base64[1] * 10) << 16) + base32[i];
        }
        base32[i] = base64[1] = base64[0] / 10;
        base64[0] = base64[0] - base64[1] * 10;
        digits = `${base64[0]}${digits}`;
      } while (checks[0] || checks[1] || checks[2] || checks[3]);
      return digits ? digits : `0`;
    }
    /** @ignore */
    class BN {
      /** @nocollapse */
      static new(num, isSigned) {
        switch (isSigned) {
          case true:
            return new SignedBigNum(num);
          case false:
            return new UnsignedBigNum(num);
        }
        switch (num.constructor) {
          case Int8Array:
          case Int16Array:
          case Int32Array:
          case BigInt64ArrayCtor:
            return new SignedBigNum(num);
        }
        if (num.byteLength === 16) {
          return new DecimalBigNum(num);
        }
        return new UnsignedBigNum(num);
      }
      /** @nocollapse */
      static signed(num) {
        return new SignedBigNum(num);
      }
      /** @nocollapse */
      static unsigned(num) {
        return new UnsignedBigNum(num);
      }
      /** @nocollapse */
      static decimal(num) {
        return new DecimalBigNum(num);
      }
      constructor(num, isSigned) {
        return BN.new(num, isSigned);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/type.mjs

    //# sourceMappingURL=bn.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.
    var _a,
      _b,
      _c,
      _d,
      _e,
      _f,
      _g,
      _h,
      _j,
      _k,
      _l,
      _m,
      _o,
      _p,
      _q,
      _r,
      _s,
      _t,
      _u;

    /**
     * An abstract base class for classes that encapsulate metadata about each of
     * the logical types that Arrow can represent.
     */
    class DataType {
      /** @nocollapse */ static isNull(x) {
        return (x === null || x === void 0 ? void 0 : x.typeId) === Type.Null;
      }
      /** @nocollapse */ static isInt(x) {
        return (x === null || x === void 0 ? void 0 : x.typeId) === Type.Int;
      }
      /** @nocollapse */ static isFloat(x) {
        return (x === null || x === void 0 ? void 0 : x.typeId) === Type.Float;
      }
      /** @nocollapse */ static isBinary(x) {
        return (x === null || x === void 0 ? void 0 : x.typeId) === Type.Binary;
      }
      /** @nocollapse */ static isUtf8(x) {
        return (x === null || x === void 0 ? void 0 : x.typeId) === Type.Utf8;
      }
      /** @nocollapse */ static isBool(x) {
        return (x === null || x === void 0 ? void 0 : x.typeId) === Type.Bool;
      }
      /** @nocollapse */ static isDecimal(x) {
        return (
          (x === null || x === void 0 ? void 0 : x.typeId) === Type.Decimal
        );
      }
      /** @nocollapse */ static isDate(x) {
        return (x === null || x === void 0 ? void 0 : x.typeId) === Type.Date;
      }
      /** @nocollapse */ static isTime(x) {
        return (x === null || x === void 0 ? void 0 : x.typeId) === Type.Time;
      }
      /** @nocollapse */ static isTimestamp(x) {
        return (
          (x === null || x === void 0 ? void 0 : x.typeId) === Type.Timestamp
        );
      }
      /** @nocollapse */ static isInterval(x) {
        return (
          (x === null || x === void 0 ? void 0 : x.typeId) === Type.Interval
        );
      }
      /** @nocollapse */ static isList(x) {
        return (x === null || x === void 0 ? void 0 : x.typeId) === Type.List;
      }
      /** @nocollapse */ static isStruct(x) {
        return (x === null || x === void 0 ? void 0 : x.typeId) === Type.Struct;
      }
      /** @nocollapse */ static isUnion(x) {
        return (x === null || x === void 0 ? void 0 : x.typeId) === Type.Union;
      }
      /** @nocollapse */ static isFixedSizeBinary(x) {
        return (
          (x === null || x === void 0 ? void 0 : x.typeId) ===
          Type.FixedSizeBinary
        );
      }
      /** @nocollapse */ static isFixedSizeList(x) {
        return (
          (x === null || x === void 0 ? void 0 : x.typeId) ===
          Type.FixedSizeList
        );
      }
      /** @nocollapse */ static isMap(x) {
        return (x === null || x === void 0 ? void 0 : x.typeId) === Type.Map;
      }
      /** @nocollapse */ static isDictionary(x) {
        return (
          (x === null || x === void 0 ? void 0 : x.typeId) === Type.Dictionary
        );
      }
      /** @nocollapse */ static isDenseUnion(x) {
        return DataType.isUnion(x) && x.mode === UnionMode.Dense;
      }
      /** @nocollapse */ static isSparseUnion(x) {
        return DataType.isUnion(x) && x.mode === UnionMode.Sparse;
      }
      get typeId() {
        return Type.NONE;
      }
    }
    _a = Symbol.toStringTag;
    DataType[_a] = ((proto) => {
      proto.children = null;
      proto.ArrayType = Array;
      return (proto[Symbol.toStringTag] = "DataType");
    })(DataType.prototype);
    /** @ignore */
    class Null extends DataType {
      toString() {
        return `Null`;
      }
      get typeId() {
        return Type.Null;
      }
    }
    _b = Symbol.toStringTag;
    Null[_b] = ((proto) => (proto[Symbol.toStringTag] = "Null"))(
      Null.prototype,
    );
    /** @ignore */
    class Int_ extends DataType {
      constructor(isSigned, bitWidth) {
        super();
        this.isSigned = isSigned;
        this.bitWidth = bitWidth;
      }
      get typeId() {
        return Type.Int;
      }
      get ArrayType() {
        switch (this.bitWidth) {
          case 8:
            return this.isSigned ? Int8Array : Uint8Array;
          case 16:
            return this.isSigned ? Int16Array : Uint16Array;
          case 32:
            return this.isSigned ? Int32Array : Uint32Array;
          case 64:
            return this.isSigned ? BigInt64Array : BigUint64Array;
        }
        throw new Error(`Unrecognized ${this[Symbol.toStringTag]} type`);
      }
      toString() {
        return `${this.isSigned ? `I` : `Ui`}nt${this.bitWidth}`;
      }
    }
    _c = Symbol.toStringTag;
    Int_[_c] = ((proto) => {
      proto.isSigned = null;
      proto.bitWidth = null;
      return (proto[Symbol.toStringTag] = "Int");
    })(Int_.prototype);

    /** @ignore */
    class Int8 extends Int_ {
      constructor() {
        super(true, 8);
      }
      get ArrayType() {
        return Int8Array;
      }
    }
    /** @ignore */
    class Int16 extends Int_ {
      constructor() {
        super(true, 16);
      }
      get ArrayType() {
        return Int16Array;
      }
    }
    /** @ignore */
    class Int32 extends Int_ {
      constructor() {
        super(true, 32);
      }
      get ArrayType() {
        return Int32Array;
      }
    }
    /** @ignore */
    class Int64 extends Int_ {
      constructor() {
        super(true, 64);
      }
      get ArrayType() {
        return BigInt64Array;
      }
    }
    /** @ignore */
    class Uint8 extends Int_ {
      constructor() {
        super(false, 8);
      }
      get ArrayType() {
        return Uint8Array;
      }
    }
    /** @ignore */
    class Uint16 extends Int_ {
      constructor() {
        super(false, 16);
      }
      get ArrayType() {
        return Uint16Array;
      }
    }
    /** @ignore */
    class Uint32 extends Int_ {
      constructor() {
        super(false, 32);
      }
      get ArrayType() {
        return Uint32Array;
      }
    }
    /** @ignore */
    class Uint64 extends Int_ {
      constructor() {
        super(false, 64);
      }
      get ArrayType() {
        return BigUint64Array;
      }
    }
    Object.defineProperty(Int8.prototype, "ArrayType", { value: Int8Array });
    Object.defineProperty(Int16.prototype, "ArrayType", { value: Int16Array });
    Object.defineProperty(Int32.prototype, "ArrayType", { value: Int32Array });
    Object.defineProperty(Int64.prototype, "ArrayType", {
      value: BigInt64Array,
    });
    Object.defineProperty(Uint8.prototype, "ArrayType", { value: Uint8Array });
    Object.defineProperty(Uint16.prototype, "ArrayType", {
      value: Uint16Array,
    });
    Object.defineProperty(Uint32.prototype, "ArrayType", {
      value: Uint32Array,
    });
    Object.defineProperty(Uint64.prototype, "ArrayType", {
      value: BigUint64Array,
    });
    /** @ignore */
    class Float extends DataType {
      constructor(precision) {
        super();
        this.precision = precision;
      }
      get typeId() {
        return Type.Float;
      }
      get ArrayType() {
        switch (this.precision) {
          case Precision.HALF:
            return Uint16Array;
          case Precision.SINGLE:
            return Float32Array;
          case Precision.DOUBLE:
            return Float64Array;
        }
        // @ts-ignore
        throw new Error(`Unrecognized ${this[Symbol.toStringTag]} type`);
      }
      toString() {
        return `Float${this.precision << 5 || 16}`;
      }
    }
    _d = Symbol.toStringTag;
    Float[_d] = ((proto) => {
      proto.precision = null;
      return (proto[Symbol.toStringTag] = "Float");
    })(Float.prototype);
    /** @ignore */
    class Float16 extends Float {
      constructor() {
        super(Precision.HALF);
      }
    }
    /** @ignore */
    class Float32 extends Float {
      constructor() {
        super(Precision.SINGLE);
      }
    }
    /** @ignore */
    class Float64 extends Float {
      constructor() {
        super(Precision.DOUBLE);
      }
    }
    Object.defineProperty(Float16.prototype, "ArrayType", {
      value: Uint16Array,
    });
    Object.defineProperty(Float32.prototype, "ArrayType", {
      value: Float32Array,
    });
    Object.defineProperty(Float64.prototype, "ArrayType", {
      value: Float64Array,
    });
    /** @ignore */
    class Binary extends DataType {
      constructor() {
        super();
      }
      get typeId() {
        return Type.Binary;
      }
      toString() {
        return `Binary`;
      }
    }
    _e = Symbol.toStringTag;
    Binary[_e] = ((proto) => {
      proto.ArrayType = Uint8Array;
      return (proto[Symbol.toStringTag] = "Binary");
    })(Binary.prototype);
    /** @ignore */
    class Utf8 extends DataType {
      constructor() {
        super();
      }
      get typeId() {
        return Type.Utf8;
      }
      toString() {
        return `Utf8`;
      }
    }
    _f = Symbol.toStringTag;
    Utf8[_f] = ((proto) => {
      proto.ArrayType = Uint8Array;
      return (proto[Symbol.toStringTag] = "Utf8");
    })(Utf8.prototype);
    /** @ignore */
    class Bool extends DataType {
      constructor() {
        super();
      }
      get typeId() {
        return Type.Bool;
      }
      toString() {
        return `Bool`;
      }
    }
    _g = Symbol.toStringTag;
    Bool[_g] = ((proto) => {
      proto.ArrayType = Uint8Array;
      return (proto[Symbol.toStringTag] = "Bool");
    })(Bool.prototype);
    /** @ignore */
    class Decimal extends DataType {
      constructor(scale, precision, bitWidth = 128) {
        super();
        this.scale = scale;
        this.precision = precision;
        this.bitWidth = bitWidth;
      }
      get typeId() {
        return Type.Decimal;
      }
      toString() {
        return `Decimal[${this.precision}e${this.scale > 0 ? `+` : ``}${
          this.scale
        }]`;
      }
    }
    _h = Symbol.toStringTag;
    Decimal[_h] = ((proto) => {
      proto.scale = null;
      proto.precision = null;
      proto.ArrayType = Uint32Array;
      return (proto[Symbol.toStringTag] = "Decimal");
    })(Decimal.prototype);
    /** @ignore */
    class Date_ extends DataType {
      constructor(unit) {
        super();
        this.unit = unit;
      }
      get typeId() {
        return Type.Date;
      }
      toString() {
        return `Date${(this.unit + 1) * 32}<${DateUnit[this.unit]}>`;
      }
    }
    _j = Symbol.toStringTag;
    Date_[_j] = ((proto) => {
      proto.unit = null;
      proto.ArrayType = Int32Array;
      return (proto[Symbol.toStringTag] = "Date");
    })(Date_.prototype);
    /** @ignore */
    class DateDay extends Date_ {
      constructor() {
        super(DateUnit.DAY);
      }
    }
    /** @ignore */
    class DateMillisecond extends Date_ {
      constructor() {
        super(DateUnit.MILLISECOND);
      }
    }
    /** @ignore */
    class Time_ extends DataType {
      constructor(unit, bitWidth) {
        super();
        this.unit = unit;
        this.bitWidth = bitWidth;
      }
      get typeId() {
        return Type.Time;
      }
      toString() {
        return `Time${this.bitWidth}<${TimeUnit[this.unit]}>`;
      }
      get ArrayType() {
        switch (this.bitWidth) {
          case 32:
            return Int32Array;
          case 64:
            return BigInt64Array;
        }
        // @ts-ignore
        throw new Error(`Unrecognized ${this[Symbol.toStringTag]} type`);
      }
    }
    _k = Symbol.toStringTag;
    Time_[_k] = ((proto) => {
      proto.unit = null;
      proto.bitWidth = null;
      return (proto[Symbol.toStringTag] = "Time");
    })(Time_.prototype);

    /** @ignore */
    class TimeSecond extends Time_ {
      constructor() {
        super(TimeUnit.SECOND, 32);
      }
    }
    /** @ignore */
    class TimeMillisecond extends Time_ {
      constructor() {
        super(TimeUnit.MILLISECOND, 32);
      }
    }
    /** @ignore */
    class TimeMicrosecond extends Time_ {
      constructor() {
        super(TimeUnit.MICROSECOND, 64);
      }
    }
    /** @ignore */
    class TimeNanosecond extends Time_ {
      constructor() {
        super(TimeUnit.NANOSECOND, 64);
      }
    }
    /** @ignore */
    class Timestamp_ extends DataType {
      constructor(unit, timezone) {
        super();
        this.unit = unit;
        this.timezone = timezone;
      }
      get typeId() {
        return Type.Timestamp;
      }
      toString() {
        return `Timestamp<${TimeUnit[this.unit]}${
          this.timezone ? `, ${this.timezone}` : ``
        }>`;
      }
    }
    _l = Symbol.toStringTag;
    Timestamp_[_l] = ((proto) => {
      proto.unit = null;
      proto.timezone = null;
      proto.ArrayType = Int32Array;
      return (proto[Symbol.toStringTag] = "Timestamp");
    })(Timestamp_.prototype);

    /** @ignore */
    class TimestampSecond extends Timestamp_ {
      constructor(timezone) {
        super(TimeUnit.SECOND, timezone);
      }
    }
    /** @ignore */
    class TimestampMillisecond extends Timestamp_ {
      constructor(timezone) {
        super(TimeUnit.MILLISECOND, timezone);
      }
    }
    /** @ignore */
    class TimestampMicrosecond extends Timestamp_ {
      constructor(timezone) {
        super(TimeUnit.MICROSECOND, timezone);
      }
    }
    /** @ignore */
    class TimestampNanosecond extends Timestamp_ {
      constructor(timezone) {
        super(TimeUnit.NANOSECOND, timezone);
      }
    }
    /** @ignore */
    class Interval_ extends DataType {
      constructor(unit) {
        super();
        this.unit = unit;
      }
      get typeId() {
        return Type.Interval;
      }
      toString() {
        return `Interval<${IntervalUnit[this.unit]}>`;
      }
    }
    _m = Symbol.toStringTag;
    Interval_[_m] = ((proto) => {
      proto.unit = null;
      proto.ArrayType = Int32Array;
      return (proto[Symbol.toStringTag] = "Interval");
    })(Interval_.prototype);

    /** @ignore */
    class IntervalDayTime extends Interval_ {
      constructor() {
        super(IntervalUnit.DAY_TIME);
      }
    }
    /** @ignore */
    class IntervalYearMonth extends Interval_ {
      constructor() {
        super(IntervalUnit.YEAR_MONTH);
      }
    }
    /** @ignore */
    class List extends DataType {
      constructor(child) {
        super();
        this.children = [child];
      }
      get typeId() {
        return Type.List;
      }
      toString() {
        return `List<${this.valueType}>`;
      }
      get valueType() {
        return this.children[0].type;
      }
      get valueField() {
        return this.children[0];
      }
      get ArrayType() {
        return this.valueType.ArrayType;
      }
    }
    _o = Symbol.toStringTag;
    List[_o] = ((proto) => {
      proto.children = null;
      return (proto[Symbol.toStringTag] = "List");
    })(List.prototype);
    /** @ignore */
    class Struct extends DataType {
      constructor(children) {
        super();
        this.children = children;
      }
      get typeId() {
        return Type.Struct;
      }
      toString() {
        return `Struct<{${this.children
          .map((f) => `${f.name}:${f.type}`)
          .join(`, `)}}>`;
      }
    }
    _p = Symbol.toStringTag;
    Struct[_p] = ((proto) => {
      proto.children = null;
      return (proto[Symbol.toStringTag] = "Struct");
    })(Struct.prototype);
    /** @ignore */
    class Union_ extends DataType {
      constructor(mode, typeIds, children) {
        super();
        this.mode = mode;
        this.children = children;
        this.typeIds = typeIds = Int32Array.from(typeIds);
        this.typeIdToChildIndex = typeIds.reduce(
          (typeIdToChildIndex, typeId, idx) =>
            ((typeIdToChildIndex[typeId] = idx) && typeIdToChildIndex) ||
            typeIdToChildIndex,
          Object.create(null),
        );
      }
      get typeId() {
        return Type.Union;
      }
      toString() {
        return `${this[Symbol.toStringTag]}<${this.children
          .map((x) => `${x.type}`)
          .join(` | `)}>`;
      }
    }
    _q = Symbol.toStringTag;
    Union_[_q] = ((proto) => {
      proto.mode = null;
      proto.typeIds = null;
      proto.children = null;
      proto.typeIdToChildIndex = null;
      proto.ArrayType = Int8Array;
      return (proto[Symbol.toStringTag] = "Union");
    })(Union_.prototype);

    /** @ignore */
    class DenseUnion extends Union_ {
      constructor(typeIds, children) {
        super(UnionMode.Dense, typeIds, children);
      }
    }
    /** @ignore */
    class SparseUnion extends Union_ {
      constructor(typeIds, children) {
        super(UnionMode.Sparse, typeIds, children);
      }
    }
    /** @ignore */
    class FixedSizeBinary extends DataType {
      constructor(byteWidth) {
        super();
        this.byteWidth = byteWidth;
      }
      get typeId() {
        return Type.FixedSizeBinary;
      }
      toString() {
        return `FixedSizeBinary[${this.byteWidth}]`;
      }
    }
    _r = Symbol.toStringTag;
    FixedSizeBinary[_r] = ((proto) => {
      proto.byteWidth = null;
      proto.ArrayType = Uint8Array;
      return (proto[Symbol.toStringTag] = "FixedSizeBinary");
    })(FixedSizeBinary.prototype);
    /** @ignore */
    class FixedSizeList extends DataType {
      constructor(listSize, child) {
        super();
        this.listSize = listSize;
        this.children = [child];
      }
      get typeId() {
        return Type.FixedSizeList;
      }
      get valueType() {
        return this.children[0].type;
      }
      get valueField() {
        return this.children[0];
      }
      get ArrayType() {
        return this.valueType.ArrayType;
      }
      toString() {
        return `FixedSizeList[${this.listSize}]<${this.valueType}>`;
      }
    }
    _s = Symbol.toStringTag;
    FixedSizeList[_s] = ((proto) => {
      proto.children = null;
      proto.listSize = null;
      return (proto[Symbol.toStringTag] = "FixedSizeList");
    })(FixedSizeList.prototype);
    /** @ignore */
    class Map_ extends DataType {
      constructor(child, keysSorted = false) {
        super();
        this.children = [child];
        this.keysSorted = keysSorted;
      }
      get typeId() {
        return Type.Map;
      }
      get keyType() {
        return this.children[0].type.children[0].type;
      }
      get valueType() {
        return this.children[0].type.children[1].type;
      }
      get childType() {
        return this.children[0].type;
      }
      toString() {
        return `Map<{${this.children[0].type.children
          .map((f) => `${f.name}:${f.type}`)
          .join(`, `)}}>`;
      }
    }
    _t = Symbol.toStringTag;
    Map_[_t] = ((proto) => {
      proto.children = null;
      proto.keysSorted = null;
      return (proto[Symbol.toStringTag] = "Map_");
    })(Map_.prototype);
    /** @ignore */
    const getId = (
      (atomicDictionaryId) => () =>
        ++atomicDictionaryId
    )(-1);
    /** @ignore */
    class Dictionary extends DataType {
      constructor(dictionary, indices, id, isOrdered) {
        super();
        this.indices = indices;
        this.dictionary = dictionary;
        this.isOrdered = isOrdered || false;
        this.id = id == null ? getId() : typeof id === "number" ? id : id.low;
      }
      get typeId() {
        return Type.Dictionary;
      }
      get children() {
        return this.dictionary.children;
      }
      get valueType() {
        return this.dictionary;
      }
      get ArrayType() {
        return this.dictionary.ArrayType;
      }
      toString() {
        return `Dictionary<${this.indices}, ${this.dictionary}>`;
      }
    }
    _u = Symbol.toStringTag;
    Dictionary[_u] = ((proto) => {
      proto.id = null;
      proto.indices = null;
      proto.isOrdered = null;
      proto.dictionary = null;
      return (proto[Symbol.toStringTag] = "Dictionary");
    })(Dictionary.prototype);
    /** @ignore */
    function strideForType(type) {
      const t = type;
      switch (type.typeId) {
        case Type.Decimal:
          return type.bitWidth / 32;
        case Type.Timestamp:
          return 2;
        case Type.Date:
          return 1 + t.unit;
        case Type.Interval:
          return 1 + t.unit;
        // case Type.Int: return 1 + +((t as Int_).bitWidth > 32);
        // case Type.Time: return 1 + +((t as Time_).bitWidth > 32);
        case Type.FixedSizeList:
          return t.listSize;
        case Type.FixedSizeBinary:
          return t.byteWidth;
        default:
          return 1;
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/visitor.mjs

    //# sourceMappingURL=type.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    class Visitor {
      visitMany(nodes, ...args) {
        return nodes.map((node, i) =>
          this.visit(node, ...args.map((x) => x[i])),
        );
      }
      visit(...args) {
        return this.getVisitFn(args[0], false).apply(this, args);
      }
      getVisitFn(node, throwIfNotFound = true) {
        return getVisitFn(this, node, throwIfNotFound);
      }
      getVisitFnByTypeId(typeId, throwIfNotFound = true) {
        return getVisitFnByTypeId(this, typeId, throwIfNotFound);
      }
      visitNull(_node, ..._args) {
        return null;
      }
      visitBool(_node, ..._args) {
        return null;
      }
      visitInt(_node, ..._args) {
        return null;
      }
      visitFloat(_node, ..._args) {
        return null;
      }
      visitUtf8(_node, ..._args) {
        return null;
      }
      visitBinary(_node, ..._args) {
        return null;
      }
      visitFixedSizeBinary(_node, ..._args) {
        return null;
      }
      visitDate(_node, ..._args) {
        return null;
      }
      visitTimestamp(_node, ..._args) {
        return null;
      }
      visitTime(_node, ..._args) {
        return null;
      }
      visitDecimal(_node, ..._args) {
        return null;
      }
      visitList(_node, ..._args) {
        return null;
      }
      visitStruct(_node, ..._args) {
        return null;
      }
      visitUnion(_node, ..._args) {
        return null;
      }
      visitDictionary(_node, ..._args) {
        return null;
      }
      visitInterval(_node, ..._args) {
        return null;
      }
      visitFixedSizeList(_node, ..._args) {
        return null;
      }
      visitMap(_node, ..._args) {
        return null;
      }
    }
    /** @ignore */
    function getVisitFn(visitor, node, throwIfNotFound = true) {
      if (typeof node === "number") {
        return getVisitFnByTypeId(visitor, node, throwIfNotFound);
      }
      if (typeof node === "string" && node in Type) {
        return getVisitFnByTypeId(visitor, Type[node], throwIfNotFound);
      }
      if (node && node instanceof DataType) {
        return getVisitFnByTypeId(visitor, inferDType(node), throwIfNotFound);
      }
      if (
        (node === null || node === void 0 ? void 0 : node.type) &&
        node.type instanceof DataType
      ) {
        return getVisitFnByTypeId(
          visitor,
          inferDType(node.type),
          throwIfNotFound,
        );
      }
      return getVisitFnByTypeId(visitor, Type.NONE, throwIfNotFound);
    }
    /** @ignore */
    function getVisitFnByTypeId(visitor, dtype, throwIfNotFound = true) {
      let fn = null;
      switch (dtype) {
        case Type.Null:
          fn = visitor.visitNull;
          break;
        case Type.Bool:
          fn = visitor.visitBool;
          break;
        case Type.Int:
          fn = visitor.visitInt;
          break;
        case Type.Int8:
          fn = visitor.visitInt8 || visitor.visitInt;
          break;
        case Type.Int16:
          fn = visitor.visitInt16 || visitor.visitInt;
          break;
        case Type.Int32:
          fn = visitor.visitInt32 || visitor.visitInt;
          break;
        case Type.Int64:
          fn = visitor.visitInt64 || visitor.visitInt;
          break;
        case Type.Uint8:
          fn = visitor.visitUint8 || visitor.visitInt;
          break;
        case Type.Uint16:
          fn = visitor.visitUint16 || visitor.visitInt;
          break;
        case Type.Uint32:
          fn = visitor.visitUint32 || visitor.visitInt;
          break;
        case Type.Uint64:
          fn = visitor.visitUint64 || visitor.visitInt;
          break;
        case Type.Float:
          fn = visitor.visitFloat;
          break;
        case Type.Float16:
          fn = visitor.visitFloat16 || visitor.visitFloat;
          break;
        case Type.Float32:
          fn = visitor.visitFloat32 || visitor.visitFloat;
          break;
        case Type.Float64:
          fn = visitor.visitFloat64 || visitor.visitFloat;
          break;
        case Type.Utf8:
          fn = visitor.visitUtf8;
          break;
        case Type.Binary:
          fn = visitor.visitBinary;
          break;
        case Type.FixedSizeBinary:
          fn = visitor.visitFixedSizeBinary;
          break;
        case Type.Date:
          fn = visitor.visitDate;
          break;
        case Type.DateDay:
          fn = visitor.visitDateDay || visitor.visitDate;
          break;
        case Type.DateMillisecond:
          fn = visitor.visitDateMillisecond || visitor.visitDate;
          break;
        case Type.Timestamp:
          fn = visitor.visitTimestamp;
          break;
        case Type.TimestampSecond:
          fn = visitor.visitTimestampSecond || visitor.visitTimestamp;
          break;
        case Type.TimestampMillisecond:
          fn = visitor.visitTimestampMillisecond || visitor.visitTimestamp;
          break;
        case Type.TimestampMicrosecond:
          fn = visitor.visitTimestampMicrosecond || visitor.visitTimestamp;
          break;
        case Type.TimestampNanosecond:
          fn = visitor.visitTimestampNanosecond || visitor.visitTimestamp;
          break;
        case Type.Time:
          fn = visitor.visitTime;
          break;
        case Type.TimeSecond:
          fn = visitor.visitTimeSecond || visitor.visitTime;
          break;
        case Type.TimeMillisecond:
          fn = visitor.visitTimeMillisecond || visitor.visitTime;
          break;
        case Type.TimeMicrosecond:
          fn = visitor.visitTimeMicrosecond || visitor.visitTime;
          break;
        case Type.TimeNanosecond:
          fn = visitor.visitTimeNanosecond || visitor.visitTime;
          break;
        case Type.Decimal:
          fn = visitor.visitDecimal;
          break;
        case Type.List:
          fn = visitor.visitList;
          break;
        case Type.Struct:
          fn = visitor.visitStruct;
          break;
        case Type.Union:
          fn = visitor.visitUnion;
          break;
        case Type.DenseUnion:
          fn = visitor.visitDenseUnion || visitor.visitUnion;
          break;
        case Type.SparseUnion:
          fn = visitor.visitSparseUnion || visitor.visitUnion;
          break;
        case Type.Dictionary:
          fn = visitor.visitDictionary;
          break;
        case Type.Interval:
          fn = visitor.visitInterval;
          break;
        case Type.IntervalDayTime:
          fn = visitor.visitIntervalDayTime || visitor.visitInterval;
          break;
        case Type.IntervalYearMonth:
          fn = visitor.visitIntervalYearMonth || visitor.visitInterval;
          break;
        case Type.FixedSizeList:
          fn = visitor.visitFixedSizeList;
          break;
        case Type.Map:
          fn = visitor.visitMap;
          break;
      }
      if (typeof fn === "function") return fn;
      if (!throwIfNotFound) return () => null;
      throw new Error(`Unrecognized type '${Type[dtype]}'`);
    }
    /** @ignore */
    function inferDType(type) {
      switch (type.typeId) {
        case Type.Null:
          return Type.Null;
        case Type.Int: {
          const { bitWidth, isSigned } = type;
          switch (bitWidth) {
            case 8:
              return isSigned ? Type.Int8 : Type.Uint8;
            case 16:
              return isSigned ? Type.Int16 : Type.Uint16;
            case 32:
              return isSigned ? Type.Int32 : Type.Uint32;
            case 64:
              return isSigned ? Type.Int64 : Type.Uint64;
          }
          // @ts-ignore
          return Type.Int;
        }
        case Type.Float:
          switch (type.precision) {
            case Precision.HALF:
              return Type.Float16;
            case Precision.SINGLE:
              return Type.Float32;
            case Precision.DOUBLE:
              return Type.Float64;
          }
          // @ts-ignore
          return Type.Float;
        case Type.Binary:
          return Type.Binary;
        case Type.Utf8:
          return Type.Utf8;
        case Type.Bool:
          return Type.Bool;
        case Type.Decimal:
          return Type.Decimal;
        case Type.Time:
          switch (type.unit) {
            case TimeUnit.SECOND:
              return Type.TimeSecond;
            case TimeUnit.MILLISECOND:
              return Type.TimeMillisecond;
            case TimeUnit.MICROSECOND:
              return Type.TimeMicrosecond;
            case TimeUnit.NANOSECOND:
              return Type.TimeNanosecond;
          }
          // @ts-ignore
          return Type.Time;
        case Type.Timestamp:
          switch (type.unit) {
            case TimeUnit.SECOND:
              return Type.TimestampSecond;
            case TimeUnit.MILLISECOND:
              return Type.TimestampMillisecond;
            case TimeUnit.MICROSECOND:
              return Type.TimestampMicrosecond;
            case TimeUnit.NANOSECOND:
              return Type.TimestampNanosecond;
          }
          // @ts-ignore
          return Type.Timestamp;
        case Type.Date:
          switch (type.unit) {
            case DateUnit.DAY:
              return Type.DateDay;
            case DateUnit.MILLISECOND:
              return Type.DateMillisecond;
          }
          // @ts-ignore
          return Type.Date;
        case Type.Interval:
          switch (type.unit) {
            case IntervalUnit.DAY_TIME:
              return Type.IntervalDayTime;
            case IntervalUnit.YEAR_MONTH:
              return Type.IntervalYearMonth;
          }
          // @ts-ignore
          return Type.Interval;
        case Type.Map:
          return Type.Map;
        case Type.List:
          return Type.List;
        case Type.Struct:
          return Type.Struct;
        case Type.Union:
          switch (type.mode) {
            case UnionMode.Dense:
              return Type.DenseUnion;
            case UnionMode.Sparse:
              return Type.SparseUnion;
          }
          // @ts-ignore
          return Type.Union;
        case Type.FixedSizeBinary:
          return Type.FixedSizeBinary;
        case Type.FixedSizeList:
          return Type.FixedSizeList;
        case Type.Dictionary:
          return Type.Dictionary;
      }
      throw new Error(`Unrecognized type '${Type[type.typeId]}'`);
    }
    // Add these here so they're picked up by the externs creator
    // in the build, and closure-compiler doesn't minify them away
    Visitor.prototype.visitInt8 = null;
    Visitor.prototype.visitInt16 = null;
    Visitor.prototype.visitInt32 = null;
    Visitor.prototype.visitInt64 = null;
    Visitor.prototype.visitUint8 = null;
    Visitor.prototype.visitUint16 = null;
    Visitor.prototype.visitUint32 = null;
    Visitor.prototype.visitUint64 = null;
    Visitor.prototype.visitFloat16 = null;
    Visitor.prototype.visitFloat32 = null;
    Visitor.prototype.visitFloat64 = null;
    Visitor.prototype.visitDateDay = null;
    Visitor.prototype.visitDateMillisecond = null;
    Visitor.prototype.visitTimestampSecond = null;
    Visitor.prototype.visitTimestampMillisecond = null;
    Visitor.prototype.visitTimestampMicrosecond = null;
    Visitor.prototype.visitTimestampNanosecond = null;
    Visitor.prototype.visitTimeSecond = null;
    Visitor.prototype.visitTimeMillisecond = null;
    Visitor.prototype.visitTimeMicrosecond = null;
    Visitor.prototype.visitTimeNanosecond = null;
    Visitor.prototype.visitDenseUnion = null;
    Visitor.prototype.visitSparseUnion = null;
    Visitor.prototype.visitIntervalDayTime = null;
    Visitor.prototype.visitIntervalYearMonth = null; // CONCATENATED MODULE: ./node_modules/apache-arrow/util/math.mjs

    //# sourceMappingURL=visitor.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.
    const f64 = new Float64Array(1);
    const u32 = new Uint32Array(f64.buffer);
    /**
     * Convert uint16 (logically a float16) to a JS float64. Inspired by numpy's `npy_half_to_double`:
     * https://github.com/numpy/numpy/blob/5a5987291dc95376bb098be8d8e5391e89e77a2c/numpy/core/src/npymath/halffloat.c#L29
     * @param h {number} the uint16 to convert
     * @private
     * @ignore
     */
    function uint16ToFloat64(h) {
      const expo = (h & 0x7c00) >> 10;
      const sigf = (h & 0x03ff) / 1024;
      const sign = Math.pow(-1, (h & 0x8000) >> 15);
      switch (expo) {
        case 0x1f:
          return sign * (sigf ? Number.NaN : 1 / 0);
        case 0x00:
          return sign * (sigf ? 6.103515625e-5 * sigf : 0);
      }
      return sign * Math.pow(2, expo - 15) * (1 + sigf);
    }
    /**
     * Convert a float64 to uint16 (assuming the float64 is logically a float16). Inspired by numpy's `npy_double_to_half`:
     * https://github.com/numpy/numpy/blob/5a5987291dc95376bb098be8d8e5391e89e77a2c/numpy/core/src/npymath/halffloat.c#L43
     * @param d {number} The float64 to convert
     * @private
     * @ignore
     */
    function float64ToUint16(d) {
      if (d !== d) {
        return 0x7e00;
      } // NaN
      f64[0] = d;
      // Magic numbers:
      // 0x80000000 = 10000000 00000000 00000000 00000000 -- masks the 32nd bit
      // 0x7ff00000 = 01111111 11110000 00000000 00000000 -- masks the 21st-31st bits
      // 0x000fffff = 00000000 00001111 11111111 11111111 -- masks the 1st-20th bit
      const sign = ((u32[1] & 0x80000000) >> 16) & 0xffff;
      let expo = u32[1] & 0x7ff00000,
        sigf = 0x0000;
      if (expo >= 0x40f00000) {
        //
        // If exponent overflowed, the float16 is either NaN or Infinity.
        // Rules to propagate the sign bit: mantissa > 0 ? NaN : +/-Infinity
        //
        // Magic numbers:
        // 0x40F00000 = 01000000 11110000 00000000 00000000 -- 6-bit exponent overflow
        // 0x7C000000 = 01111100 00000000 00000000 00000000 -- masks the 27th-31st bits
        //
        // returns:
        // qNaN, aka 32256 decimal, 0x7E00 hex, or 01111110 00000000 binary
        // sNaN, aka 32000 decimal, 0x7D00 hex, or 01111101 00000000 binary
        // +inf, aka 31744 decimal, 0x7C00 hex, or 01111100 00000000 binary
        // -inf, aka 64512 decimal, 0xFC00 hex, or 11111100 00000000 binary
        //
        // If mantissa is greater than 23 bits, set to +Infinity like numpy
        if (u32[0] > 0) {
          expo = 0x7c00;
        } else {
          expo = (expo & 0x7c000000) >> 16;
          sigf = (u32[1] & 0x000fffff) >> 10;
        }
      } else if (expo <= 0x3f000000) {
        //
        // If exponent underflowed, the float is either signed zero or subnormal.
        //
        // Magic numbers:
        // 0x3F000000 = 00111111 00000000 00000000 00000000 -- 6-bit exponent underflow
        //
        sigf = 0x100000 + (u32[1] & 0x000fffff);
        sigf = (0x100000 + (sigf << ((expo >> 20) - 998))) >> 21;
        expo = 0;
      } else {
        //
        // No overflow or underflow, rebase the exponent and round the mantissa
        // Magic numbers:
        // 0x200 = 00000010 00000000 -- masks off the 10th bit
        //
        // Ensure the first mantissa bit (the 10th one) is 1 and round
        expo = (expo - 0x3f000000) >> 10;
        sigf = ((u32[1] & 0x000fffff) + 0x200) >> 10;
      }
      return sign | expo | (sigf & 0xffff);
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/visitor/set.mjs

    //# sourceMappingURL=math.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    class SetVisitor extends Visitor {}
    /** @ignore */
    function wrapSet(fn) {
      return (data, _1, _2) => {
        if (data.setValid(_1, _2 != null)) {
          return fn(data, _1, _2);
        }
      };
    }
    /** @ignore */
    const setEpochMsToDays = (data, index, epochMs) => {
      data[index] = Math.trunc(epochMs / 86400000);
    };
    /** @ignore */
    const setEpochMsToMillisecondsLong = (data, index, epochMs) => {
      data[index] = Math.trunc(epochMs % 4294967296);
      data[index + 1] = Math.trunc(epochMs / 4294967296);
    };
    /** @ignore */
    const setEpochMsToMicrosecondsLong = (data, index, epochMs) => {
      data[index] = Math.trunc((epochMs * 1000) % 4294967296);
      data[index + 1] = Math.trunc((epochMs * 1000) / 4294967296);
    };
    /** @ignore */
    const setEpochMsToNanosecondsLong = (data, index, epochMs) => {
      data[index] = Math.trunc((epochMs * 1000000) % 4294967296);
      data[index + 1] = Math.trunc((epochMs * 1000000) / 4294967296);
    };
    /** @ignore */
    const setVariableWidthBytes = (values, valueOffsets, index, value) => {
      if (index + 1 < valueOffsets.length) {
        const { [index]: x, [index + 1]: y } = valueOffsets;
        values.set(value.subarray(0, y - x), x);
      }
    };
    /** @ignore */
    const setBool = ({ offset, values }, index, val) => {
      const idx = offset + index;
      val
        ? (values[idx >> 3] |= 1 << idx % 8) // true
        : (values[idx >> 3] &= ~(1 << idx % 8)); // false
    };
    /** @ignore */
    const setInt = ({ values }, index, value) => {
      values[index] = value;
    };
    /** @ignore */
    const setFloat = ({ values }, index, value) => {
      values[index] = value;
    };
    /** @ignore */
    const setFloat16 = ({ values }, index, value) => {
      values[index] = float64ToUint16(value);
    };
    /* istanbul ignore next */
    /** @ignore */
    const setAnyFloat = (data, index, value) => {
      switch (data.type.precision) {
        case Precision.HALF:
          return setFloat16(data, index, value);
        case Precision.SINGLE:
        case Precision.DOUBLE:
          return setFloat(data, index, value);
      }
    };
    /** @ignore */
    const setDateDay = ({ values }, index, value) => {
      setEpochMsToDays(values, index, value.valueOf());
    };
    /** @ignore */
    const setDateMillisecond = ({ values }, index, value) => {
      setEpochMsToMillisecondsLong(values, index * 2, value.valueOf());
    };
    /** @ignore */
    const setFixedSizeBinary = ({ stride, values }, index, value) => {
      values.set(value.subarray(0, stride), stride * index);
    };
    /** @ignore */
    const setBinary = ({ values, valueOffsets }, index, value) =>
      setVariableWidthBytes(values, valueOffsets, index, value);
    /** @ignore */
    const setUtf8 = ({ values, valueOffsets }, index, value) => {
      setVariableWidthBytes(values, valueOffsets, index, encodeUtf8(value));
    };
    /* istanbul ignore next */
    const setDate = (data, index, value) => {
      data.type.unit === DateUnit.DAY
        ? setDateDay(data, index, value)
        : setDateMillisecond(data, index, value);
    };
    /** @ignore */
    const setTimestampSecond = ({ values }, index, value) =>
      setEpochMsToMillisecondsLong(values, index * 2, value / 1000);
    /** @ignore */
    const setTimestampMillisecond = ({ values }, index, value) =>
      setEpochMsToMillisecondsLong(values, index * 2, value);
    /** @ignore */
    const setTimestampMicrosecond = ({ values }, index, value) =>
      setEpochMsToMicrosecondsLong(values, index * 2, value);
    /** @ignore */
    const setTimestampNanosecond = ({ values }, index, value) =>
      setEpochMsToNanosecondsLong(values, index * 2, value);
    /* istanbul ignore next */
    /** @ignore */
    const setTimestamp = (data, index, value) => {
      switch (data.type.unit) {
        case TimeUnit.SECOND:
          return setTimestampSecond(data, index, value);
        case TimeUnit.MILLISECOND:
          return setTimestampMillisecond(data, index, value);
        case TimeUnit.MICROSECOND:
          return setTimestampMicrosecond(data, index, value);
        case TimeUnit.NANOSECOND:
          return setTimestampNanosecond(data, index, value);
      }
    };
    /** @ignore */
    const setTimeSecond = ({ values }, index, value) => {
      values[index] = value;
    };
    /** @ignore */
    const setTimeMillisecond = ({ values }, index, value) => {
      values[index] = value;
    };
    /** @ignore */
    const setTimeMicrosecond = ({ values }, index, value) => {
      values[index] = value;
    };
    /** @ignore */
    const setTimeNanosecond = ({ values }, index, value) => {
      values[index] = value;
    };
    /* istanbul ignore next */
    /** @ignore */
    const setTime = (data, index, value) => {
      switch (data.type.unit) {
        case TimeUnit.SECOND:
          return setTimeSecond(data, index, value);
        case TimeUnit.MILLISECOND:
          return setTimeMillisecond(data, index, value);
        case TimeUnit.MICROSECOND:
          return setTimeMicrosecond(data, index, value);
        case TimeUnit.NANOSECOND:
          return setTimeNanosecond(data, index, value);
      }
    };
    /** @ignore */
    const setDecimal = ({ values, stride }, index, value) => {
      values.set(value.subarray(0, stride), stride * index);
    };
    /** @ignore */
    const setList = (data, index, value) => {
      const values = data.children[0];
      const valueOffsets = data.valueOffsets;
      const set = instance.getVisitFn(values);
      if (Array.isArray(value)) {
        for (
          let idx = -1,
            itr = valueOffsets[index],
            end = valueOffsets[index + 1];
          itr < end;

        ) {
          set(values, itr++, value[++idx]);
        }
      } else {
        for (
          let idx = -1,
            itr = valueOffsets[index],
            end = valueOffsets[index + 1];
          itr < end;

        ) {
          set(values, itr++, value.get(++idx));
        }
      }
    };
    /** @ignore */
    const setMap = (data, index, value) => {
      const values = data.children[0];
      const { valueOffsets } = data;
      const set = instance.getVisitFn(values);
      let { [index]: idx, [index + 1]: end } = valueOffsets;
      const entries =
        value instanceof Map ? value.entries() : Object.entries(value);
      for (const val of entries) {
        set(values, idx, val);
        if (++idx >= end) break;
      }
    };
    /** @ignore */ const _setStructArrayValue = (o, v) => (set, c, _, i) =>
      c && set(c, o, v[i]);
    /** @ignore */ const _setStructVectorValue = (o, v) => (set, c, _, i) =>
      c && set(c, o, v.get(i));
    /** @ignore */ const _setStructMapValue = (o, v) => (set, c, f, _) =>
      c && set(c, o, v.get(f.name));
    /** @ignore */ const _setStructObjectValue = (o, v) => (set, c, f, _) =>
      c && set(c, o, v[f.name]);
    /** @ignore */
    const setStruct = (data, index, value) => {
      const childSetters = data.type.children.map((f) =>
        instance.getVisitFn(f.type),
      );
      const set =
        value instanceof Map
          ? _setStructMapValue(index, value)
          : value instanceof Vector
          ? _setStructVectorValue(index, value)
          : Array.isArray(value)
          ? _setStructArrayValue(index, value)
          : _setStructObjectValue(index, value);
      // eslint-disable-next-line unicorn/no-array-for-each
      data.type.children.forEach((f, i) =>
        set(childSetters[i], data.children[i], f, i),
      );
    };
    /* istanbul ignore next */
    /** @ignore */
    const setUnion = (data, index, value) => {
      data.type.mode === UnionMode.Dense
        ? setDenseUnion(data, index, value)
        : setSparseUnion(data, index, value);
    };
    /** @ignore */
    const setDenseUnion = (data, index, value) => {
      const childIndex = data.type.typeIdToChildIndex[data.typeIds[index]];
      const child = data.children[childIndex];
      instance.visit(child, data.valueOffsets[index], value);
    };
    /** @ignore */
    const setSparseUnion = (data, index, value) => {
      const childIndex = data.type.typeIdToChildIndex[data.typeIds[index]];
      const child = data.children[childIndex];
      instance.visit(child, index, value);
    };
    /** @ignore */
    const setDictionary = (data, index, value) => {
      var _a;
      (_a = data.dictionary) === null || _a === void 0
        ? void 0
        : _a.set(data.values[index], value);
    };
    /* istanbul ignore next */
    /** @ignore */
    const setIntervalValue = (data, index, value) => {
      data.type.unit === IntervalUnit.DAY_TIME
        ? setIntervalDayTime(data, index, value)
        : setIntervalYearMonth(data, index, value);
    };
    /** @ignore */
    const setIntervalDayTime = ({ values }, index, value) => {
      values.set(value.subarray(0, 2), 2 * index);
    };
    /** @ignore */
    const setIntervalYearMonth = ({ values }, index, value) => {
      values[index] = value[0] * 12 + (value[1] % 12);
    };
    /** @ignore */
    const setFixedSizeList = (data, index, value) => {
      const { stride } = data;
      const child = data.children[0];
      const set = instance.getVisitFn(child);
      if (Array.isArray(value)) {
        for (let idx = -1, offset = index * stride; ++idx < stride; ) {
          set(child, offset + idx, value[idx]);
        }
      } else {
        for (let idx = -1, offset = index * stride; ++idx < stride; ) {
          set(child, offset + idx, value.get(idx));
        }
      }
    };
    SetVisitor.prototype.visitBool = wrapSet(setBool);
    SetVisitor.prototype.visitInt = wrapSet(setInt);
    SetVisitor.prototype.visitInt8 = wrapSet(setInt);
    SetVisitor.prototype.visitInt16 = wrapSet(setInt);
    SetVisitor.prototype.visitInt32 = wrapSet(setInt);
    SetVisitor.prototype.visitInt64 = wrapSet(setInt);
    SetVisitor.prototype.visitUint8 = wrapSet(setInt);
    SetVisitor.prototype.visitUint16 = wrapSet(setInt);
    SetVisitor.prototype.visitUint32 = wrapSet(setInt);
    SetVisitor.prototype.visitUint64 = wrapSet(setInt);
    SetVisitor.prototype.visitFloat = wrapSet(setAnyFloat);
    SetVisitor.prototype.visitFloat16 = wrapSet(setFloat16);
    SetVisitor.prototype.visitFloat32 = wrapSet(setFloat);
    SetVisitor.prototype.visitFloat64 = wrapSet(setFloat);
    SetVisitor.prototype.visitUtf8 = wrapSet(setUtf8);
    SetVisitor.prototype.visitBinary = wrapSet(setBinary);
    SetVisitor.prototype.visitFixedSizeBinary = wrapSet(setFixedSizeBinary);
    SetVisitor.prototype.visitDate = wrapSet(setDate);
    SetVisitor.prototype.visitDateDay = wrapSet(setDateDay);
    SetVisitor.prototype.visitDateMillisecond = wrapSet(setDateMillisecond);
    SetVisitor.prototype.visitTimestamp = wrapSet(setTimestamp);
    SetVisitor.prototype.visitTimestampSecond = wrapSet(setTimestampSecond);
    SetVisitor.prototype.visitTimestampMillisecond = wrapSet(
      setTimestampMillisecond,
    );
    SetVisitor.prototype.visitTimestampMicrosecond = wrapSet(
      setTimestampMicrosecond,
    );
    SetVisitor.prototype.visitTimestampNanosecond = wrapSet(
      setTimestampNanosecond,
    );
    SetVisitor.prototype.visitTime = wrapSet(setTime);
    SetVisitor.prototype.visitTimeSecond = wrapSet(setTimeSecond);
    SetVisitor.prototype.visitTimeMillisecond = wrapSet(setTimeMillisecond);
    SetVisitor.prototype.visitTimeMicrosecond = wrapSet(setTimeMicrosecond);
    SetVisitor.prototype.visitTimeNanosecond = wrapSet(setTimeNanosecond);
    SetVisitor.prototype.visitDecimal = wrapSet(setDecimal);
    SetVisitor.prototype.visitList = wrapSet(setList);
    SetVisitor.prototype.visitStruct = wrapSet(setStruct);
    SetVisitor.prototype.visitUnion = wrapSet(setUnion);
    SetVisitor.prototype.visitDenseUnion = wrapSet(setDenseUnion);
    SetVisitor.prototype.visitSparseUnion = wrapSet(setSparseUnion);
    SetVisitor.prototype.visitDictionary = wrapSet(setDictionary);
    SetVisitor.prototype.visitInterval = wrapSet(setIntervalValue);
    SetVisitor.prototype.visitIntervalDayTime = wrapSet(setIntervalDayTime);
    SetVisitor.prototype.visitIntervalYearMonth = wrapSet(setIntervalYearMonth);
    SetVisitor.prototype.visitFixedSizeList = wrapSet(setFixedSizeList);
    SetVisitor.prototype.visitMap = wrapSet(setMap);
    /** @ignore */
    const instance = new SetVisitor(); // CONCATENATED MODULE: ./node_modules/apache-arrow/row/struct.mjs

    //# sourceMappingURL=set.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */ const kParent = Symbol.for("parent");
    /** @ignore */ const kRowIndex = Symbol.for("rowIndex");
    class StructRow {
      constructor(parent, rowIndex) {
        this[kParent] = parent;
        this[kRowIndex] = rowIndex;
        return new Proxy(this, new StructRowProxyHandler());
      }
      toArray() {
        return Object.values(this.toJSON());
      }
      toJSON() {
        const i = this[kRowIndex];
        const parent = this[kParent];
        const keys = parent.type.children;
        const json = {};
        for (let j = -1, n = keys.length; ++j < n; ) {
          json[keys[j].name] = get_instance.visit(parent.children[j], i);
        }
        return json;
      }
      toString() {
        return `{${[...this]
          .map(([key, val]) => `${valueToString(key)}: ${valueToString(val)}`)
          .join(", ")}}`;
      }
      [Symbol.for("nodejs.util.inspect.custom")]() {
        return this.toString();
      }
      [Symbol.iterator]() {
        return new StructRowIterator(this[kParent], this[kRowIndex]);
      }
    }
    class StructRowIterator {
      constructor(data, rowIndex) {
        this.childIndex = 0;
        this.children = data.children;
        this.rowIndex = rowIndex;
        this.childFields = data.type.children;
        this.numChildren = this.childFields.length;
      }
      [Symbol.iterator]() {
        return this;
      }
      next() {
        const i = this.childIndex;
        if (i < this.numChildren) {
          this.childIndex = i + 1;
          return {
            done: false,
            value: [
              this.childFields[i].name,
              get_instance.visit(this.children[i], this.rowIndex),
            ],
          };
        }
        return { done: true, value: null };
      }
    }
    Object.defineProperties(StructRow.prototype, {
      [Symbol.toStringTag]: {
        enumerable: false,
        configurable: false,
        value: "Row",
      },
      [kParent]: {
        writable: true,
        enumerable: false,
        configurable: false,
        value: null,
      },
      [kRowIndex]: {
        writable: true,
        enumerable: false,
        configurable: false,
        value: -1,
      },
    });
    class StructRowProxyHandler {
      isExtensible() {
        return false;
      }
      deleteProperty() {
        return false;
      }
      preventExtensions() {
        return true;
      }
      ownKeys(row) {
        return row[kParent].type.children.map((f) => f.name);
      }
      has(row, key) {
        return (
          row[kParent].type.children.findIndex((f) => f.name === key) !== -1
        );
      }
      getOwnPropertyDescriptor(row, key) {
        if (
          row[kParent].type.children.findIndex((f) => f.name === key) !== -1
        ) {
          return { writable: true, enumerable: true, configurable: true };
        }
        return;
      }
      get(row, key) {
        // Look up key in row first
        if (Reflect.has(row, key)) {
          return row[key];
        }
        const idx = row[kParent].type.children.findIndex((f) => f.name === key);
        if (idx !== -1) {
          const val = get_instance.visit(
            row[kParent].children[idx],
            row[kRowIndex],
          );
          // Cache key/val lookups
          Reflect.set(row, key, val);
          return val;
        }
      }
      set(row, key, val) {
        const idx = row[kParent].type.children.findIndex((f) => f.name === key);
        if (idx !== -1) {
          instance.visit(row[kParent].children[idx], row[kRowIndex], val);
          // Cache key/val lookups
          return Reflect.set(row, key, val);
        } else if (Reflect.has(row, key) || typeof key === "symbol") {
          return Reflect.set(row, key, val);
        }
        return false;
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/visitor/get.mjs

    //# sourceMappingURL=struct.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    class GetVisitor extends Visitor {}
    /** @ignore */
    function wrapGet(fn) {
      return (data, _1) => (data.getValid(_1) ? fn(data, _1) : null);
    }
    /** @ignore */ const epochDaysToMs = (data, index) =>
      86400000 * data[index];
    /** @ignore */ const epochMillisecondsLongToMs = (data, index) =>
      4294967296 * data[index + 1] + (data[index] >>> 0);
    /** @ignore */ const epochMicrosecondsLongToMs = (data, index) =>
      4294967296 * (data[index + 1] / 1000) + (data[index] >>> 0) / 1000;
    /** @ignore */ const epochNanosecondsLongToMs = (data, index) =>
      4294967296 * (data[index + 1] / 1000000) + (data[index] >>> 0) / 1000000;
    /** @ignore */ const epochMillisecondsToDate = (epochMs) =>
      new Date(epochMs);
    /** @ignore */ const epochDaysToDate = (data, index) =>
      epochMillisecondsToDate(epochDaysToMs(data, index));
    /** @ignore */ const epochMillisecondsLongToDate = (data, index) =>
      epochMillisecondsToDate(epochMillisecondsLongToMs(data, index));
    /** @ignore */
    const getNull = (_data, _index) => null;
    /** @ignore */
    const getVariableWidthBytes = (values, valueOffsets, index) => {
      if (index + 1 >= valueOffsets.length) {
        return null;
      }
      const x = valueOffsets[index];
      const y = valueOffsets[index + 1];
      return values.subarray(x, y);
    };
    /** @ignore */
    const getBool = ({ offset, values }, index) => {
      const idx = offset + index;
      const byte = values[idx >> 3];
      return (byte & (1 << idx % 8)) !== 0;
    };
    /** @ignore */
    const getDateDay = ({ values }, index) => epochDaysToDate(values, index);
    /** @ignore */
    const getDateMillisecond = ({ values }, index) =>
      epochMillisecondsLongToDate(values, index * 2);
    /** @ignore */
    const getNumeric = ({ stride, values }, index) => values[stride * index];
    /** @ignore */
    const getFloat16 = ({ stride, values }, index) =>
      uint16ToFloat64(values[stride * index]);
    /** @ignore */
    const getBigInts = ({ values }, index) => values[index];
    /** @ignore */
    const getFixedSizeBinary = ({ stride, values }, index) =>
      values.subarray(stride * index, stride * (index + 1));
    /** @ignore */
    const getBinary = ({ values, valueOffsets }, index) =>
      getVariableWidthBytes(values, valueOffsets, index);
    /** @ignore */
    const getUtf8 = ({ values, valueOffsets }, index) => {
      const bytes = getVariableWidthBytes(values, valueOffsets, index);
      return bytes !== null ? decodeUtf8(bytes) : null;
    };
    /* istanbul ignore next */
    /** @ignore */
    const getInt = ({ values }, index) => values[index];
    /* istanbul ignore next */
    /** @ignore */
    const getFloat = ({ type, values }, index) =>
      type.precision !== Precision.HALF
        ? values[index]
        : uint16ToFloat64(values[index]);
    /* istanbul ignore next */
    /** @ignore */
    const getDate = (data, index) =>
      data.type.unit === DateUnit.DAY
        ? getDateDay(data, index)
        : getDateMillisecond(data, index);
    /** @ignore */
    const getTimestampSecond = ({ values }, index) =>
      1000 * epochMillisecondsLongToMs(values, index * 2);
    /** @ignore */
    const getTimestampMillisecond = ({ values }, index) =>
      epochMillisecondsLongToMs(values, index * 2);
    /** @ignore */
    const getTimestampMicrosecond = ({ values }, index) =>
      epochMicrosecondsLongToMs(values, index * 2);
    /** @ignore */
    const getTimestampNanosecond = ({ values }, index) =>
      epochNanosecondsLongToMs(values, index * 2);
    /* istanbul ignore next */
    /** @ignore */
    const getTimestamp = (data, index) => {
      switch (data.type.unit) {
        case TimeUnit.SECOND:
          return getTimestampSecond(data, index);
        case TimeUnit.MILLISECOND:
          return getTimestampMillisecond(data, index);
        case TimeUnit.MICROSECOND:
          return getTimestampMicrosecond(data, index);
        case TimeUnit.NANOSECOND:
          return getTimestampNanosecond(data, index);
      }
    };
    /** @ignore */
    const getTimeSecond = ({ values }, index) => values[index];
    /** @ignore */
    const getTimeMillisecond = ({ values }, index) => values[index];
    /** @ignore */
    const getTimeMicrosecond = ({ values }, index) => values[index];
    /** @ignore */
    const getTimeNanosecond = ({ values }, index) => values[index];
    /* istanbul ignore next */
    /** @ignore */
    const getTime = (data, index) => {
      switch (data.type.unit) {
        case TimeUnit.SECOND:
          return getTimeSecond(data, index);
        case TimeUnit.MILLISECOND:
          return getTimeMillisecond(data, index);
        case TimeUnit.MICROSECOND:
          return getTimeMicrosecond(data, index);
        case TimeUnit.NANOSECOND:
          return getTimeNanosecond(data, index);
      }
    };
    /** @ignore */
    const getDecimal = ({ values, stride }, index) =>
      BN.decimal(values.subarray(stride * index, stride * (index + 1)));
    /** @ignore */
    const getList = (data, index) => {
      const { valueOffsets, stride, children } = data;
      const { [index * stride]: begin, [index * stride + 1]: end } =
        valueOffsets;
      const child = children[0];
      const slice = child.slice(begin, end - begin);
      return new Vector([slice]);
    };
    /** @ignore */
    const getMap = (data, index) => {
      const { valueOffsets, children } = data;
      const { [index]: begin, [index + 1]: end } = valueOffsets;
      const child = children[0];
      return new MapRow(child.slice(begin, end - begin));
    };
    /** @ignore */
    const getStruct = (data, index) => {
      return new StructRow(data, index);
    };
    /* istanbul ignore next */
    /** @ignore */
    const getUnion = (data, index) => {
      return data.type.mode === UnionMode.Dense
        ? getDenseUnion(data, index)
        : getSparseUnion(data, index);
    };
    /** @ignore */
    const getDenseUnion = (data, index) => {
      const childIndex = data.type.typeIdToChildIndex[data.typeIds[index]];
      const child = data.children[childIndex];
      return get_instance.visit(child, data.valueOffsets[index]);
    };
    /** @ignore */
    const getSparseUnion = (data, index) => {
      const childIndex = data.type.typeIdToChildIndex[data.typeIds[index]];
      const child = data.children[childIndex];
      return get_instance.visit(child, index);
    };
    /** @ignore */
    const getDictionary = (data, index) => {
      var _a;
      return (_a = data.dictionary) === null || _a === void 0
        ? void 0
        : _a.get(data.values[index]);
    };
    /* istanbul ignore next */
    /** @ignore */
    const getInterval = (data, index) =>
      data.type.unit === IntervalUnit.DAY_TIME
        ? getIntervalDayTime(data, index)
        : getIntervalYearMonth(data, index);
    /** @ignore */
    const getIntervalDayTime = ({ values }, index) =>
      values.subarray(2 * index, 2 * (index + 1));
    /** @ignore */
    const getIntervalYearMonth = ({ values }, index) => {
      const interval = values[index];
      const int32s = new Int32Array(2);
      int32s[0] = Math.trunc(interval / 12); /* years */
      int32s[1] = Math.trunc(interval % 12); /* months */
      return int32s;
    };
    /** @ignore */
    const getFixedSizeList = (data, index) => {
      const { stride, children } = data;
      const child = children[0];
      const slice = child.slice(index * stride, stride);
      return new Vector([slice]);
    };
    GetVisitor.prototype.visitNull = wrapGet(getNull);
    GetVisitor.prototype.visitBool = wrapGet(getBool);
    GetVisitor.prototype.visitInt = wrapGet(getInt);
    GetVisitor.prototype.visitInt8 = wrapGet(getNumeric);
    GetVisitor.prototype.visitInt16 = wrapGet(getNumeric);
    GetVisitor.prototype.visitInt32 = wrapGet(getNumeric);
    GetVisitor.prototype.visitInt64 = wrapGet(getBigInts);
    GetVisitor.prototype.visitUint8 = wrapGet(getNumeric);
    GetVisitor.prototype.visitUint16 = wrapGet(getNumeric);
    GetVisitor.prototype.visitUint32 = wrapGet(getNumeric);
    GetVisitor.prototype.visitUint64 = wrapGet(getBigInts);
    GetVisitor.prototype.visitFloat = wrapGet(getFloat);
    GetVisitor.prototype.visitFloat16 = wrapGet(getFloat16);
    GetVisitor.prototype.visitFloat32 = wrapGet(getNumeric);
    GetVisitor.prototype.visitFloat64 = wrapGet(getNumeric);
    GetVisitor.prototype.visitUtf8 = wrapGet(getUtf8);
    GetVisitor.prototype.visitBinary = wrapGet(getBinary);
    GetVisitor.prototype.visitFixedSizeBinary = wrapGet(getFixedSizeBinary);
    GetVisitor.prototype.visitDate = wrapGet(getDate);
    GetVisitor.prototype.visitDateDay = wrapGet(getDateDay);
    GetVisitor.prototype.visitDateMillisecond = wrapGet(getDateMillisecond);
    GetVisitor.prototype.visitTimestamp = wrapGet(getTimestamp);
    GetVisitor.prototype.visitTimestampSecond = wrapGet(getTimestampSecond);
    GetVisitor.prototype.visitTimestampMillisecond = wrapGet(
      getTimestampMillisecond,
    );
    GetVisitor.prototype.visitTimestampMicrosecond = wrapGet(
      getTimestampMicrosecond,
    );
    GetVisitor.prototype.visitTimestampNanosecond = wrapGet(
      getTimestampNanosecond,
    );
    GetVisitor.prototype.visitTime = wrapGet(getTime);
    GetVisitor.prototype.visitTimeSecond = wrapGet(getTimeSecond);
    GetVisitor.prototype.visitTimeMillisecond = wrapGet(getTimeMillisecond);
    GetVisitor.prototype.visitTimeMicrosecond = wrapGet(getTimeMicrosecond);
    GetVisitor.prototype.visitTimeNanosecond = wrapGet(getTimeNanosecond);
    GetVisitor.prototype.visitDecimal = wrapGet(getDecimal);
    GetVisitor.prototype.visitList = wrapGet(getList);
    GetVisitor.prototype.visitStruct = wrapGet(getStruct);
    GetVisitor.prototype.visitUnion = wrapGet(getUnion);
    GetVisitor.prototype.visitDenseUnion = wrapGet(getDenseUnion);
    GetVisitor.prototype.visitSparseUnion = wrapGet(getSparseUnion);
    GetVisitor.prototype.visitDictionary = wrapGet(getDictionary);
    GetVisitor.prototype.visitInterval = wrapGet(getInterval);
    GetVisitor.prototype.visitIntervalDayTime = wrapGet(getIntervalDayTime);
    GetVisitor.prototype.visitIntervalYearMonth = wrapGet(getIntervalYearMonth);
    GetVisitor.prototype.visitFixedSizeList = wrapGet(getFixedSizeList);
    GetVisitor.prototype.visitMap = wrapGet(getMap);
    /** @ignore */
    const get_instance = new GetVisitor(); // CONCATENATED MODULE: ./node_modules/apache-arrow/row/map.mjs

    //# sourceMappingURL=get.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */ const kKeys = Symbol.for("keys");
    /** @ignore */ const kVals = Symbol.for("vals");
    class MapRow {
      constructor(slice) {
        this[kKeys] = new Vector([slice.children[0]]).memoize();
        this[kVals] = slice.children[1];
        return new Proxy(this, new MapRowProxyHandler());
      }
      [Symbol.iterator]() {
        return new MapRowIterator(this[kKeys], this[kVals]);
      }
      get size() {
        return this[kKeys].length;
      }
      toArray() {
        return Object.values(this.toJSON());
      }
      toJSON() {
        const keys = this[kKeys];
        const vals = this[kVals];
        const json = {};
        for (let i = -1, n = keys.length; ++i < n; ) {
          json[keys.get(i)] = get_instance.visit(vals, i);
        }
        return json;
      }
      toString() {
        return `{${[...this]
          .map(([key, val]) => `${valueToString(key)}: ${valueToString(val)}`)
          .join(", ")}}`;
      }
      [Symbol.for("nodejs.util.inspect.custom")]() {
        return this.toString();
      }
    }
    class MapRowIterator {
      constructor(keys, vals) {
        this.keys = keys;
        this.vals = vals;
        this.keyIndex = 0;
        this.numKeys = keys.length;
      }
      [Symbol.iterator]() {
        return this;
      }
      next() {
        const i = this.keyIndex;
        if (i === this.numKeys) {
          return { done: true, value: null };
        }
        this.keyIndex++;
        return {
          done: false,
          value: [this.keys.get(i), get_instance.visit(this.vals, i)],
        };
      }
    }
    /** @ignore */
    class MapRowProxyHandler {
      isExtensible() {
        return false;
      }
      deleteProperty() {
        return false;
      }
      preventExtensions() {
        return true;
      }
      ownKeys(row) {
        return row[kKeys].toArray().map(String);
      }
      has(row, key) {
        return row[kKeys].includes(key);
      }
      getOwnPropertyDescriptor(row, key) {
        const idx = row[kKeys].indexOf(key);
        if (idx !== -1) {
          return { writable: true, enumerable: true, configurable: true };
        }
        return;
      }
      get(row, key) {
        // Look up key in row first
        if (Reflect.has(row, key)) {
          return row[key];
        }
        const idx = row[kKeys].indexOf(key);
        if (idx !== -1) {
          const val = get_instance.visit(Reflect.get(row, kVals), idx);
          // Cache key/val lookups
          Reflect.set(row, key, val);
          return val;
        }
      }
      set(row, key, val) {
        const idx = row[kKeys].indexOf(key);
        if (idx !== -1) {
          instance.visit(Reflect.get(row, kVals), idx, val);
          // Cache key/val lookups
          return Reflect.set(row, key, val);
        } else if (Reflect.has(row, key)) {
          return Reflect.set(row, key, val);
        }
        return false;
      }
    }
    Object.defineProperties(MapRow.prototype, {
      [Symbol.toStringTag]: {
        enumerable: false,
        configurable: false,
        value: "Row",
      },
      [kKeys]: {
        writable: true,
        enumerable: false,
        configurable: false,
        value: null,
      },
      [kVals]: {
        writable: true,
        enumerable: false,
        configurable: false,
        value: null,
      },
    }); // CONCATENATED MODULE: ./node_modules/apache-arrow/util/vector.mjs

    //# sourceMappingURL=map.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    function clampIndex(source, index, then) {
      const length = source.length;
      const adjust = index > -1 ? index : length + (index % length);
      return then ? then(source, adjust) : adjust;
    }
    /** @ignore */
    let tmp;
    /** @ignore */
    function clampRange(source, begin, end, then) {
      // Adjust args similar to Array.prototype.slice. Normalize begin/end to
      // clamp between 0 and length, and wrap around on negative indices, e.g.
      // slice(-1, 5) or slice(5, -1)
      const { length: len = 0 } = source;
      let lhs = typeof begin !== "number" ? 0 : begin;
      let rhs = typeof end !== "number" ? len : end;
      // wrap around on negative start/end positions
      lhs < 0 && (lhs = ((lhs % len) + len) % len);
      rhs < 0 && (rhs = ((rhs % len) + len) % len);
      // ensure lhs <= rhs
      rhs < lhs && ((tmp = lhs), (lhs = rhs), (rhs = tmp));
      // ensure rhs <= length
      rhs > len && (rhs = len);
      return then ? then(source, lhs, rhs) : [lhs, rhs];
    }
    const isNaNFast = (value) => value !== value;
    /** @ignore */
    function createElementComparator(search) {
      const typeofSearch = typeof search;
      // Compare primitives
      if (typeofSearch !== "object" || search === null) {
        // Compare NaN
        if (isNaNFast(search)) {
          return isNaNFast;
        }
        return (value) => value === search;
      }
      // Compare Dates
      if (search instanceof Date) {
        const valueOfSearch = search.valueOf();
        return (value) =>
          value instanceof Date ? value.valueOf() === valueOfSearch : false;
      }
      // Compare TypedArrays
      if (ArrayBuffer.isView(search)) {
        return (value) => (value ? compareArrayLike(search, value) : false);
      }
      // Compare Maps and Rows
      if (search instanceof Map) {
        return createMapComparator(search);
      }
      // Compare Array-likes
      if (Array.isArray(search)) {
        return createArrayLikeComparator(search);
      }
      // Compare Vectors
      if (search instanceof Vector) {
        return createVectorComparator(search);
      }
      return createObjectComparator(search, true);
      // Compare non-empty Objects
      // return createObjectComparator(search, search instanceof Proxy);
    }
    /** @ignore */
    function createArrayLikeComparator(lhs) {
      const comparators = [];
      for (let i = -1, n = lhs.length; ++i < n; ) {
        comparators[i] = createElementComparator(lhs[i]);
      }
      return createSubElementsComparator(comparators);
    }
    /** @ignore */
    function createMapComparator(lhs) {
      let i = -1;
      const comparators = [];
      for (const v of lhs.values())
        comparators[++i] = createElementComparator(v);
      return createSubElementsComparator(comparators);
    }
    /** @ignore */
    function createVectorComparator(lhs) {
      const comparators = [];
      for (let i = -1, n = lhs.length; ++i < n; ) {
        comparators[i] = createElementComparator(lhs.get(i));
      }
      return createSubElementsComparator(comparators);
    }
    /** @ignore */
    function createObjectComparator(lhs, allowEmpty = false) {
      const keys = Object.keys(lhs);
      // Only compare non-empty Objects
      if (!allowEmpty && keys.length === 0) {
        return () => false;
      }
      const comparators = [];
      for (let i = -1, n = keys.length; ++i < n; ) {
        comparators[i] = createElementComparator(lhs[keys[i]]);
      }
      return createSubElementsComparator(comparators, keys);
    }
    function createSubElementsComparator(comparators, keys) {
      return (rhs) => {
        if (!rhs || typeof rhs !== "object") {
          return false;
        }
        switch (rhs.constructor) {
          case Array:
            return compareArray(comparators, rhs);
          case Map:
            return compareObject(comparators, rhs, rhs.keys());
          case MapRow:
          case StructRow:
          case Object:
          case undefined: // support `Object.create(null)` objects
            return compareObject(comparators, rhs, keys || Object.keys(rhs));
        }
        return rhs instanceof Vector ? compareVector(comparators, rhs) : false;
      };
    }
    function compareArray(comparators, arr) {
      const n = comparators.length;
      if (arr.length !== n) {
        return false;
      }
      for (let i = -1; ++i < n; ) {
        if (!comparators[i](arr[i])) {
          return false;
        }
      }
      return true;
    }
    function compareVector(comparators, vec) {
      const n = comparators.length;
      if (vec.length !== n) {
        return false;
      }
      for (let i = -1; ++i < n; ) {
        if (!comparators[i](vec.get(i))) {
          return false;
        }
      }
      return true;
    }
    function compareObject(comparators, obj, keys) {
      const lKeyItr = keys[Symbol.iterator]();
      const rKeyItr =
        obj instanceof Map ? obj.keys() : Object.keys(obj)[Symbol.iterator]();
      const rValItr =
        obj instanceof Map
          ? obj.values()
          : Object.values(obj)[Symbol.iterator]();
      let i = 0;
      const n = comparators.length;
      let rVal = rValItr.next();
      let lKey = lKeyItr.next();
      let rKey = rKeyItr.next();
      for (
        ;
        i < n && !lKey.done && !rKey.done && !rVal.done;
        ++i, lKey = lKeyItr.next(), rKey = rKeyItr.next(), rVal = rValItr.next()
      ) {
        if (lKey.value !== rKey.value || !comparators[i](rVal.value)) {
          break;
        }
      }
      if (i === n && lKey.done && rKey.done && rVal.done) {
        return true;
      }
      lKeyItr.return && lKeyItr.return();
      rKeyItr.return && rKeyItr.return();
      rValItr.return && rValItr.return();
      return false;
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/util/bit.mjs

    //# sourceMappingURL=vector.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.
    /** @ignore */
    function bit_getBool(_data, _index, byte, bit) {
      return (byte & (1 << bit)) !== 0;
    }
    /** @ignore */
    function getBit(_data, _index, byte, bit) {
      return (byte & (1 << bit)) >> bit;
    }
    /** @ignore */
    function bit_setBool(bytes, index, value) {
      return value
        ? !!(bytes[index >> 3] |= 1 << index % 8) || true
        : !(bytes[index >> 3] &= ~(1 << index % 8)) && false;
    }
    /** @ignore */
    function truncateBitmap(offset, length, bitmap) {
      const alignedSize = (bitmap.byteLength + 7) & ~7;
      if (offset > 0 || bitmap.byteLength < alignedSize) {
        const bytes = new Uint8Array(alignedSize);
        // If the offset is a multiple of 8 bits, it's safe to slice the bitmap
        bytes.set(
          offset % 8 === 0
            ? bitmap.subarray(offset >> 3)
            : // Otherwise iterate each bit from the offset and return a new one
              packBools(
                new BitIterator(bitmap, offset, length, null, bit_getBool),
              ).subarray(0, alignedSize),
        );
        return bytes;
      }
      return bitmap;
    }
    /** @ignore */
    function packBools(values) {
      const xs = [];
      let i = 0,
        bit = 0,
        byte = 0;
      for (const value of values) {
        value && (byte |= 1 << bit);
        if (++bit === 8) {
          xs[i++] = byte;
          byte = bit = 0;
        }
      }
      if (i === 0 || bit > 0) {
        xs[i++] = byte;
      }
      const b = new Uint8Array((xs.length + 7) & ~7);
      b.set(xs);
      return b;
    }
    /** @ignore */
    class BitIterator {
      constructor(bytes, begin, length, context, get) {
        this.bytes = bytes;
        this.length = length;
        this.context = context;
        this.get = get;
        this.bit = begin % 8;
        this.byteIndex = begin >> 3;
        this.byte = bytes[this.byteIndex++];
        this.index = 0;
      }
      next() {
        if (this.index < this.length) {
          if (this.bit === 8) {
            this.bit = 0;
            this.byte = this.bytes[this.byteIndex++];
          }
          return {
            value: this.get(this.context, this.index++, this.byte, this.bit++),
          };
        }
        return { done: true, value: null };
      }
      [Symbol.iterator]() {
        return this;
      }
    }
    /**
     * Compute the population count (the number of bits set to 1) for a range of bits in a Uint8Array.
     * @param vector The Uint8Array of bits for which to compute the population count.
     * @param lhs The range's left-hand side (or start) bit
     * @param rhs The range's right-hand side (or end) bit
     */
    /** @ignore */
    function popcnt_bit_range(data, lhs, rhs) {
      if (rhs - lhs <= 0) {
        return 0;
      }
      // If the bit range is less than one byte, sum the 1 bits in the bit range
      if (rhs - lhs < 8) {
        let sum = 0;
        for (const bit of new BitIterator(data, lhs, rhs - lhs, data, getBit)) {
          sum += bit;
        }
        return sum;
      }
      // Get the next lowest multiple of 8 from the right hand side
      const rhsInside = (rhs >> 3) << 3;
      // Get the next highest multiple of 8 from the left hand side
      const lhsInside = lhs + (lhs % 8 === 0 ? 0 : 8 - (lhs % 8));
      return (
        // Get the popcnt of bits between the left hand side, and the next highest multiple of 8
        popcnt_bit_range(data, lhs, lhsInside) +
        // Get the popcnt of bits between the right hand side, and the next lowest multiple of 8
        popcnt_bit_range(data, rhsInside, rhs) +
        // Get the popcnt of all bits between the left and right hand sides' multiples of 8
        popcnt_array(data, lhsInside >> 3, (rhsInside - lhsInside) >> 3)
      );
    }
    /** @ignore */
    function popcnt_array(arr, byteOffset, byteLength) {
      let cnt = 0,
        pos = Math.trunc(byteOffset);
      const view = new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
      const len = byteLength === void 0 ? arr.byteLength : pos + byteLength;
      while (len - pos >= 4) {
        cnt += popcnt_uint32(view.getUint32(pos));
        pos += 4;
      }
      while (len - pos >= 2) {
        cnt += popcnt_uint32(view.getUint16(pos));
        pos += 2;
      }
      while (len - pos >= 1) {
        cnt += popcnt_uint32(view.getUint8(pos));
        pos += 1;
      }
      return cnt;
    }
    /** @ignore */
    function popcnt_uint32(uint32) {
      let i = Math.trunc(uint32);
      i = i - ((i >>> 1) & 0x55555555);
      i = (i & 0x33333333) + ((i >>> 2) & 0x33333333);
      return (((i + (i >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/data.mjs

    //# sourceMappingURL=bit.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */ const kUnknownNullCount = -1;
    /**
     * Data structure underlying {@link Vector}s. Use the convenience method {@link makeData}.
     */
    class Data {
      constructor(
        type,
        offset,
        length,
        nullCount,
        buffers,
        children = [],
        dictionary,
      ) {
        this.type = type;
        this.children = children;
        this.dictionary = dictionary;
        this.offset = Math.floor(Math.max(offset || 0, 0));
        this.length = Math.floor(Math.max(length || 0, 0));
        this._nullCount = Math.floor(Math.max(nullCount || 0, -1));
        let buffer;
        if (buffers instanceof Data) {
          this.stride = buffers.stride;
          this.values = buffers.values;
          this.typeIds = buffers.typeIds;
          this.nullBitmap = buffers.nullBitmap;
          this.valueOffsets = buffers.valueOffsets;
        } else {
          this.stride = strideForType(type);
          if (buffers) {
            (buffer = buffers[0]) && (this.valueOffsets = buffer);
            (buffer = buffers[1]) && (this.values = buffer);
            (buffer = buffers[2]) && (this.nullBitmap = buffer);
            (buffer = buffers[3]) && (this.typeIds = buffer);
          }
        }
        this.nullable =
          this._nullCount !== 0 &&
          this.nullBitmap &&
          this.nullBitmap.byteLength > 0;
      }
      get typeId() {
        return this.type.typeId;
      }
      get ArrayType() {
        return this.type.ArrayType;
      }
      get buffers() {
        return [this.valueOffsets, this.values, this.nullBitmap, this.typeIds];
      }
      get byteLength() {
        let byteLength = 0;
        const { valueOffsets, values, nullBitmap, typeIds } = this;
        valueOffsets && (byteLength += valueOffsets.byteLength);
        values && (byteLength += values.byteLength);
        nullBitmap && (byteLength += nullBitmap.byteLength);
        typeIds && (byteLength += typeIds.byteLength);
        return this.children.reduce(
          (byteLength, child) => byteLength + child.byteLength,
          byteLength,
        );
      }
      get nullCount() {
        let nullCount = this._nullCount;
        let nullBitmap;
        if (nullCount <= kUnknownNullCount && (nullBitmap = this.nullBitmap)) {
          this._nullCount = nullCount =
            this.length -
            popcnt_bit_range(
              nullBitmap,
              this.offset,
              this.offset + this.length,
            );
        }
        return nullCount;
      }
      getValid(index) {
        if (this.nullable && this.nullCount > 0) {
          const pos = this.offset + index;
          const val = this.nullBitmap[pos >> 3];
          return (val & (1 << pos % 8)) !== 0;
        }
        return true;
      }
      setValid(index, value) {
        // Don't interact w/ nullBitmap if not nullable
        if (!this.nullable) {
          return value;
        }
        // If no null bitmap, initialize one on the fly
        if (!this.nullBitmap || this.nullBitmap.byteLength <= index >> 3) {
          const { nullBitmap } = this._changeLengthAndBackfillNullBitmap(
            this.length,
          );
          Object.assign(this, { nullBitmap, _nullCount: 0 });
        }
        const { nullBitmap, offset } = this;
        const pos = (offset + index) >> 3;
        const bit = (offset + index) % 8;
        const val = (nullBitmap[pos] >> bit) & 1;
        // If `val` is truthy and the current bit is 0, flip it to 1 and increment `_nullCount`.
        // If `val` is falsey and the current bit is 1, flip it to 0 and decrement `_nullCount`.
        value
          ? val === 0 &&
            ((nullBitmap[pos] |= 1 << bit),
            (this._nullCount = this.nullCount + 1))
          : val === 1 &&
            ((nullBitmap[pos] &= ~(1 << bit)),
            (this._nullCount = this.nullCount - 1));
        return value;
      }
      clone(
        type = this.type,
        offset = this.offset,
        length = this.length,
        nullCount = this._nullCount,
        buffers = this,
        children = this.children,
      ) {
        return new Data(
          type,
          offset,
          length,
          nullCount,
          buffers,
          children,
          this.dictionary,
        );
      }
      slice(offset, length) {
        const { stride, typeId, children } = this;
        // +true === 1, +false === 0, so this means
        // we keep nullCount at 0 if it's already 0,
        // otherwise set to the invalidated flag -1
        const nullCount = +(this._nullCount === 0) - 1;
        const childStride = typeId === 16 /* FixedSizeList */ ? stride : 1;
        const buffers = this._sliceBuffers(offset, length, stride, typeId);
        return this.clone(
          this.type,
          this.offset + offset,
          length,
          nullCount,
          buffers,
          // Don't slice children if we have value offsets (the variable-width types)
          children.length === 0 || this.valueOffsets
            ? children
            : this._sliceChildren(
                children,
                childStride * offset,
                childStride * length,
              ),
        );
      }
      _changeLengthAndBackfillNullBitmap(newLength) {
        if (this.typeId === Type.Null) {
          return this.clone(this.type, 0, newLength, 0);
        }
        const { length, nullCount } = this;
        // start initialized with 0s (nulls), then fill from 0 to length with 1s (not null)
        const bitmap = new Uint8Array(((newLength + 63) & ~63) >> 3).fill(
          255,
          0,
          length >> 3,
        );
        // set all the bits in the last byte (up to bit `length - length % 8`) to 1 (not null)
        bitmap[length >> 3] = (1 << (length - (length & ~7))) - 1;
        // if we have a nullBitmap, truncate + slice and set it over the pre-filled 1s
        if (nullCount > 0) {
          bitmap.set(truncateBitmap(this.offset, length, this.nullBitmap), 0);
        }
        const buffers = this.buffers;
        buffers[BufferType.VALIDITY] = bitmap;
        return this.clone(
          this.type,
          0,
          newLength,
          nullCount + (newLength - length),
          buffers,
        );
      }
      _sliceBuffers(offset, length, stride, typeId) {
        let arr;
        const { buffers } = this;
        // If typeIds exist, slice the typeIds buffer
        (arr = buffers[BufferType.TYPE]) &&
          (buffers[BufferType.TYPE] = arr.subarray(offset, offset + length));
        // If offsets exist, only slice the offsets buffer
        ((arr = buffers[BufferType.OFFSET]) &&
          (buffers[BufferType.OFFSET] = arr.subarray(
            offset,
            offset + length + 1,
          ))) ||
          // Otherwise if no offsets, slice the data buffer. Don't slice the data vector for Booleans, since the offset goes by bits not bytes
          ((arr = buffers[BufferType.DATA]) &&
            (buffers[BufferType.DATA] =
              typeId === 6
                ? arr
                : arr.subarray(stride * offset, stride * (offset + length))));
        return buffers;
      }
      _sliceChildren(children, offset, length) {
        return children.map((child) => child.slice(offset, length));
      }
    }
    Data.prototype.children = Object.freeze([]);

    class MakeDataVisitor extends Visitor {
      visit(props) {
        return this.getVisitFn(props["type"]).call(this, props);
      }
      visitNull(props) {
        const {
          ["type"]: type,
          ["offset"]: offset = 0,
          ["length"]: length = 0,
        } = props;
        return new Data(type, offset, length, 0);
      }
      visitBool(props) {
        const { ["type"]: type, ["offset"]: offset = 0 } = props;
        const nullBitmap = toUint8Array(props["nullBitmap"]);
        const data = toArrayBufferView(type.ArrayType, props["data"]);
        const {
          ["length"]: length = data.length >> 3,
          ["nullCount"]: nullCount = props["nullBitmap"] ? -1 : 0,
        } = props;
        return new Data(type, offset, length, nullCount, [
          undefined,
          data,
          nullBitmap,
        ]);
      }
      visitInt(props) {
        const { ["type"]: type, ["offset"]: offset = 0 } = props;
        const nullBitmap = toUint8Array(props["nullBitmap"]);
        const data = toArrayBufferView(type.ArrayType, props["data"]);
        const {
          ["length"]: length = data.length,
          ["nullCount"]: nullCount = props["nullBitmap"] ? -1 : 0,
        } = props;
        return new Data(type, offset, length, nullCount, [
          undefined,
          data,
          nullBitmap,
        ]);
      }
      visitFloat(props) {
        const { ["type"]: type, ["offset"]: offset = 0 } = props;
        const nullBitmap = toUint8Array(props["nullBitmap"]);
        const data = toArrayBufferView(type.ArrayType, props["data"]);
        const {
          ["length"]: length = data.length,
          ["nullCount"]: nullCount = props["nullBitmap"] ? -1 : 0,
        } = props;
        return new Data(type, offset, length, nullCount, [
          undefined,
          data,
          nullBitmap,
        ]);
      }
      visitUtf8(props) {
        const { ["type"]: type, ["offset"]: offset = 0 } = props;
        const data = toUint8Array(props["data"]);
        const nullBitmap = toUint8Array(props["nullBitmap"]);
        const valueOffsets = toInt32Array(props["valueOffsets"]);
        const {
          ["length"]: length = valueOffsets.length - 1,
          ["nullCount"]: nullCount = props["nullBitmap"] ? -1 : 0,
        } = props;
        return new Data(type, offset, length, nullCount, [
          valueOffsets,
          data,
          nullBitmap,
        ]);
      }
      visitBinary(props) {
        const { ["type"]: type, ["offset"]: offset = 0 } = props;
        const data = toUint8Array(props["data"]);
        const nullBitmap = toUint8Array(props["nullBitmap"]);
        const valueOffsets = toInt32Array(props["valueOffsets"]);
        const {
          ["length"]: length = valueOffsets.length - 1,
          ["nullCount"]: nullCount = props["nullBitmap"] ? -1 : 0,
        } = props;
        return new Data(type, offset, length, nullCount, [
          valueOffsets,
          data,
          nullBitmap,
        ]);
      }
      visitFixedSizeBinary(props) {
        const { ["type"]: type, ["offset"]: offset = 0 } = props;
        const nullBitmap = toUint8Array(props["nullBitmap"]);
        const data = toArrayBufferView(type.ArrayType, props["data"]);
        const {
          ["length"]: length = data.length / strideForType(type),
          ["nullCount"]: nullCount = props["nullBitmap"] ? -1 : 0,
        } = props;
        return new Data(type, offset, length, nullCount, [
          undefined,
          data,
          nullBitmap,
        ]);
      }
      visitDate(props) {
        const { ["type"]: type, ["offset"]: offset = 0 } = props;
        const nullBitmap = toUint8Array(props["nullBitmap"]);
        const data = toArrayBufferView(type.ArrayType, props["data"]);
        const {
          ["length"]: length = data.length / strideForType(type),
          ["nullCount"]: nullCount = props["nullBitmap"] ? -1 : 0,
        } = props;
        return new Data(type, offset, length, nullCount, [
          undefined,
          data,
          nullBitmap,
        ]);
      }
      visitTimestamp(props) {
        const { ["type"]: type, ["offset"]: offset = 0 } = props;
        const nullBitmap = toUint8Array(props["nullBitmap"]);
        const data = toArrayBufferView(type.ArrayType, props["data"]);
        const {
          ["length"]: length = data.length / strideForType(type),
          ["nullCount"]: nullCount = props["nullBitmap"] ? -1 : 0,
        } = props;
        return new Data(type, offset, length, nullCount, [
          undefined,
          data,
          nullBitmap,
        ]);
      }
      visitTime(props) {
        const { ["type"]: type, ["offset"]: offset = 0 } = props;
        const nullBitmap = toUint8Array(props["nullBitmap"]);
        const data = toArrayBufferView(type.ArrayType, props["data"]);
        const {
          ["length"]: length = data.length / strideForType(type),
          ["nullCount"]: nullCount = props["nullBitmap"] ? -1 : 0,
        } = props;
        return new Data(type, offset, length, nullCount, [
          undefined,
          data,
          nullBitmap,
        ]);
      }
      visitDecimal(props) {
        const { ["type"]: type, ["offset"]: offset = 0 } = props;
        const nullBitmap = toUint8Array(props["nullBitmap"]);
        const data = toArrayBufferView(type.ArrayType, props["data"]);
        const {
          ["length"]: length = data.length / strideForType(type),
          ["nullCount"]: nullCount = props["nullBitmap"] ? -1 : 0,
        } = props;
        return new Data(type, offset, length, nullCount, [
          undefined,
          data,
          nullBitmap,
        ]);
      }
      visitList(props) {
        const {
          ["type"]: type,
          ["offset"]: offset = 0,
          ["child"]: child,
        } = props;
        const nullBitmap = toUint8Array(props["nullBitmap"]);
        const valueOffsets = toInt32Array(props["valueOffsets"]);
        const {
          ["length"]: length = valueOffsets.length - 1,
          ["nullCount"]: nullCount = props["nullBitmap"] ? -1 : 0,
        } = props;
        return new Data(
          type,
          offset,
          length,
          nullCount,
          [valueOffsets, undefined, nullBitmap],
          [child],
        );
      }
      visitStruct(props) {
        const {
          ["type"]: type,
          ["offset"]: offset = 0,
          ["children"]: children = [],
        } = props;
        const nullBitmap = toUint8Array(props["nullBitmap"]);
        const {
          length = children.reduce(
            (len, { length }) => Math.max(len, length),
            0,
          ),
          nullCount = props["nullBitmap"] ? -1 : 0,
        } = props;
        return new Data(
          type,
          offset,
          length,
          nullCount,
          [undefined, undefined, nullBitmap],
          children,
        );
      }
      visitUnion(props) {
        const {
          ["type"]: type,
          ["offset"]: offset = 0,
          ["children"]: children = [],
        } = props;
        const nullBitmap = toUint8Array(props["nullBitmap"]);
        const typeIds = toArrayBufferView(type.ArrayType, props["typeIds"]);
        const {
          ["length"]: length = typeIds.length,
          ["nullCount"]: nullCount = props["nullBitmap"] ? -1 : 0,
        } = props;
        if (DataType.isSparseUnion(type)) {
          return new Data(
            type,
            offset,
            length,
            nullCount,
            [undefined, undefined, nullBitmap, typeIds],
            children,
          );
        }
        const valueOffsets = toInt32Array(props["valueOffsets"]);
        return new Data(
          type,
          offset,
          length,
          nullCount,
          [valueOffsets, undefined, nullBitmap, typeIds],
          children,
        );
      }
      visitDictionary(props) {
        const { ["type"]: type, ["offset"]: offset = 0 } = props;
        const nullBitmap = toUint8Array(props["nullBitmap"]);
        const data = toArrayBufferView(type.indices.ArrayType, props["data"]);
        const {
          ["dictionary"]: dictionary = new Vector([
            new MakeDataVisitor().visit({ type: type.dictionary }),
          ]),
        } = props;
        const {
          ["length"]: length = data.length,
          ["nullCount"]: nullCount = props["nullBitmap"] ? -1 : 0,
        } = props;
        return new Data(
          type,
          offset,
          length,
          nullCount,
          [undefined, data, nullBitmap],
          [],
          dictionary,
        );
      }
      visitInterval(props) {
        const { ["type"]: type, ["offset"]: offset = 0 } = props;
        const nullBitmap = toUint8Array(props["nullBitmap"]);
        const data = toArrayBufferView(type.ArrayType, props["data"]);
        const {
          ["length"]: length = data.length / strideForType(type),
          ["nullCount"]: nullCount = props["nullBitmap"] ? -1 : 0,
        } = props;
        return new Data(type, offset, length, nullCount, [
          undefined,
          data,
          nullBitmap,
        ]);
      }
      visitFixedSizeList(props) {
        const {
          ["type"]: type,
          ["offset"]: offset = 0,
          ["child"]: child = new MakeDataVisitor().visit({
            type: type.valueType,
          }),
        } = props;
        const nullBitmap = toUint8Array(props["nullBitmap"]);
        const {
          ["length"]: length = child.length / strideForType(type),
          ["nullCount"]: nullCount = props["nullBitmap"] ? -1 : 0,
        } = props;
        return new Data(
          type,
          offset,
          length,
          nullCount,
          [undefined, undefined, nullBitmap],
          [child],
        );
      }
      visitMap(props) {
        const {
          ["type"]: type,
          ["offset"]: offset = 0,
          ["child"]: child = new MakeDataVisitor().visit({
            type: type.childType,
          }),
        } = props;
        const nullBitmap = toUint8Array(props["nullBitmap"]);
        const valueOffsets = toInt32Array(props["valueOffsets"]);
        const {
          ["length"]: length = valueOffsets.length - 1,
          ["nullCount"]: nullCount = props["nullBitmap"] ? -1 : 0,
        } = props;
        return new Data(
          type,
          offset,
          length,
          nullCount,
          [valueOffsets, undefined, nullBitmap],
          [child],
        );
      }
    }
    function makeData(props) {
      return new MakeDataVisitor().visit(props);
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/util/chunk.mjs

    //# sourceMappingURL=data.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.
    /** @ignore */
    class ChunkedIterator {
      constructor(numChunks = 0, getChunkIterator) {
        this.numChunks = numChunks;
        this.getChunkIterator = getChunkIterator;
        this.chunkIndex = 0;
        this.chunkIterator = this.getChunkIterator(0);
      }
      next() {
        while (this.chunkIndex < this.numChunks) {
          const next = this.chunkIterator.next();
          if (!next.done) {
            return next;
          }
          if (++this.chunkIndex < this.numChunks) {
            this.chunkIterator = this.getChunkIterator(this.chunkIndex);
          }
        }
        return { done: true, value: null };
      }
      [Symbol.iterator]() {
        return this;
      }
    }
    /** @ignore */
    function computeChunkNullCounts(chunks) {
      return chunks.reduce(
        (nullCount, chunk) => nullCount + chunk.nullCount,
        0,
      );
    }
    /** @ignore */
    function computeChunkOffsets(chunks) {
      return chunks.reduce(
        (offsets, chunk, index) => {
          offsets[index + 1] = offsets[index] + chunk.length;
          return offsets;
        },
        new Uint32Array(chunks.length + 1),
      );
    }
    /** @ignore */
    function sliceChunks(chunks, offsets, begin, end) {
      const slices = [];
      for (let i = -1, n = chunks.length; ++i < n; ) {
        const chunk = chunks[i];
        const offset = offsets[i];
        const { length } = chunk;
        // Stop if the child is to the right of the slice boundary
        if (offset >= end) {
          break;
        }
        // Exclude children to the left of of the slice boundary
        if (begin >= offset + length) {
          continue;
        }
        // Include entire child if between both left and right boundaries
        if (offset >= begin && offset + length <= end) {
          slices.push(chunk);
          continue;
        }
        // Include the child slice that overlaps one of the slice boundaries
        const from = Math.max(0, begin - offset);
        const to = Math.min(end - offset, length);
        slices.push(chunk.slice(from, to - from));
      }
      if (slices.length === 0) {
        slices.push(chunks[0].slice(0, 0));
      }
      return slices;
    }
    /** @ignore */
    function binarySearch(chunks, offsets, idx, fn) {
      let lhs = 0,
        mid = 0,
        rhs = offsets.length - 1;
      do {
        if (lhs >= rhs - 1) {
          return idx < offsets[rhs]
            ? fn(chunks, lhs, idx - offsets[lhs])
            : null;
        }
        mid = lhs + Math.trunc((rhs - lhs) * 0.5);
        idx < offsets[mid] ? (rhs = mid) : (lhs = mid);
      } while (lhs < rhs);
    }
    /** @ignore */
    function isChunkedValid(data, index) {
      return data.getValid(index);
    }
    /** @ignore */
    function wrapChunkedCall1(fn) {
      function chunkedFn(chunks, i, j) {
        return fn(chunks[i], j);
      }
      return function (index) {
        const data = this.data;
        return binarySearch(data, this._offsets, index, chunkedFn);
      };
    }
    /** @ignore */
    function wrapChunkedCall2(fn) {
      let _2;
      function chunkedFn(chunks, i, j) {
        return fn(chunks[i], j, _2);
      }
      return function (index, value) {
        const data = this.data;
        _2 = value;
        const result = binarySearch(data, this._offsets, index, chunkedFn);
        _2 = undefined;
        return result;
      };
    }
    /** @ignore */
    function wrapChunkedIndexOf(indexOf) {
      let _1;
      function chunkedIndexOf(data, chunkIndex, fromIndex) {
        let begin = fromIndex,
          index = 0,
          total = 0;
        for (let i = chunkIndex - 1, n = data.length; ++i < n; ) {
          const chunk = data[i];
          if (~(index = indexOf(chunk, _1, begin))) {
            return total + index;
          }
          begin = 0;
          total += chunk.length;
        }
        return -1;
      }
      return function (element, offset) {
        _1 = element;
        const data = this.data;
        const result =
          typeof offset !== "number"
            ? chunkedIndexOf(data, 0, 0)
            : binarySearch(data, this._offsets, offset, chunkedIndexOf);
        _1 = undefined;
        return result;
      };
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/visitor/indexof.mjs

    //# sourceMappingURL=chunk.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    class IndexOfVisitor extends Visitor {}
    /** @ignore */
    function nullIndexOf(data, searchElement) {
      // if you're looking for nulls and the vector isn't empty, we've got 'em!
      return searchElement === null && data.length > 0 ? 0 : -1;
    }
    /** @ignore */
    function indexOfNull(data, fromIndex) {
      const { nullBitmap } = data;
      if (!nullBitmap || data.nullCount <= 0) {
        return -1;
      }
      let i = 0;
      for (const isValid of new BitIterator(
        nullBitmap,
        data.offset + (fromIndex || 0),
        data.length,
        nullBitmap,
        bit_getBool,
      )) {
        if (!isValid) {
          return i;
        }
        ++i;
      }
      return -1;
    }
    /** @ignore */
    function indexOfValue(data, searchElement, fromIndex) {
      if (searchElement === undefined) {
        return -1;
      }
      if (searchElement === null) {
        return indexOfNull(data, fromIndex);
      }
      const get = get_instance.getVisitFn(data);
      const compare = createElementComparator(searchElement);
      for (let i = (fromIndex || 0) - 1, n = data.length; ++i < n; ) {
        if (compare(get(data, i))) {
          return i;
        }
      }
      return -1;
    }
    /** @ignore */
    function indexOfUnion(data, searchElement, fromIndex) {
      // Unions are special -- they do have a nullBitmap, but so can their children.
      // If the searchElement is null, we don't know whether it came from the Union's
      // bitmap or one of its childrens'. So we don't interrogate the Union's bitmap,
      // since that will report the wrong index if a child has a null before the Union.
      const get = get_instance.getVisitFn(data);
      const compare = createElementComparator(searchElement);
      for (let i = (fromIndex || 0) - 1, n = data.length; ++i < n; ) {
        if (compare(get(data, i))) {
          return i;
        }
      }
      return -1;
    }
    IndexOfVisitor.prototype.visitNull = nullIndexOf;
    IndexOfVisitor.prototype.visitBool = indexOfValue;
    IndexOfVisitor.prototype.visitInt = indexOfValue;
    IndexOfVisitor.prototype.visitInt8 = indexOfValue;
    IndexOfVisitor.prototype.visitInt16 = indexOfValue;
    IndexOfVisitor.prototype.visitInt32 = indexOfValue;
    IndexOfVisitor.prototype.visitInt64 = indexOfValue;
    IndexOfVisitor.prototype.visitUint8 = indexOfValue;
    IndexOfVisitor.prototype.visitUint16 = indexOfValue;
    IndexOfVisitor.prototype.visitUint32 = indexOfValue;
    IndexOfVisitor.prototype.visitUint64 = indexOfValue;
    IndexOfVisitor.prototype.visitFloat = indexOfValue;
    IndexOfVisitor.prototype.visitFloat16 = indexOfValue;
    IndexOfVisitor.prototype.visitFloat32 = indexOfValue;
    IndexOfVisitor.prototype.visitFloat64 = indexOfValue;
    IndexOfVisitor.prototype.visitUtf8 = indexOfValue;
    IndexOfVisitor.prototype.visitBinary = indexOfValue;
    IndexOfVisitor.prototype.visitFixedSizeBinary = indexOfValue;
    IndexOfVisitor.prototype.visitDate = indexOfValue;
    IndexOfVisitor.prototype.visitDateDay = indexOfValue;
    IndexOfVisitor.prototype.visitDateMillisecond = indexOfValue;
    IndexOfVisitor.prototype.visitTimestamp = indexOfValue;
    IndexOfVisitor.prototype.visitTimestampSecond = indexOfValue;
    IndexOfVisitor.prototype.visitTimestampMillisecond = indexOfValue;
    IndexOfVisitor.prototype.visitTimestampMicrosecond = indexOfValue;
    IndexOfVisitor.prototype.visitTimestampNanosecond = indexOfValue;
    IndexOfVisitor.prototype.visitTime = indexOfValue;
    IndexOfVisitor.prototype.visitTimeSecond = indexOfValue;
    IndexOfVisitor.prototype.visitTimeMillisecond = indexOfValue;
    IndexOfVisitor.prototype.visitTimeMicrosecond = indexOfValue;
    IndexOfVisitor.prototype.visitTimeNanosecond = indexOfValue;
    IndexOfVisitor.prototype.visitDecimal = indexOfValue;
    IndexOfVisitor.prototype.visitList = indexOfValue;
    IndexOfVisitor.prototype.visitStruct = indexOfValue;
    IndexOfVisitor.prototype.visitUnion = indexOfValue;
    IndexOfVisitor.prototype.visitDenseUnion = indexOfUnion;
    IndexOfVisitor.prototype.visitSparseUnion = indexOfUnion;
    IndexOfVisitor.prototype.visitDictionary = indexOfValue;
    IndexOfVisitor.prototype.visitInterval = indexOfValue;
    IndexOfVisitor.prototype.visitIntervalDayTime = indexOfValue;
    IndexOfVisitor.prototype.visitIntervalYearMonth = indexOfValue;
    IndexOfVisitor.prototype.visitFixedSizeList = indexOfValue;
    IndexOfVisitor.prototype.visitMap = indexOfValue;
    /** @ignore */
    const indexof_instance = new IndexOfVisitor(); // CONCATENATED MODULE: ./node_modules/apache-arrow/visitor/iterator.mjs

    //# sourceMappingURL=indexof.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    class IteratorVisitor extends Visitor {}
    /** @ignore */
    function vectorIterator(vector) {
      const { type } = vector;
      // Fast case, defer to native iterators if possible
      if (
        vector.nullCount === 0 &&
        vector.stride === 1 &&
        (type.typeId === Type.Timestamp ||
          (type instanceof Int_ && type.bitWidth !== 64) ||
          (type instanceof Time_ && type.bitWidth !== 64) ||
          (type instanceof Float && type.precision !== Precision.HALF))
      ) {
        return new ChunkedIterator(vector.data.length, (chunkIndex) => {
          const data = vector.data[chunkIndex];
          return data.values.subarray(0, data.length)[Symbol.iterator]();
        });
      }
      // Otherwise, iterate manually
      let offset = 0;
      return new ChunkedIterator(vector.data.length, (chunkIndex) => {
        const data = vector.data[chunkIndex];
        const length = data.length;
        const inner = vector.slice(offset, offset + length);
        offset += length;
        return new VectorIterator(inner);
      });
    }
    /** @ignore */
    class VectorIterator {
      constructor(vector) {
        this.vector = vector;
        this.index = 0;
      }
      next() {
        if (this.index < this.vector.length) {
          return {
            value: this.vector.get(this.index++),
          };
        }
        return { done: true, value: null };
      }
      [Symbol.iterator]() {
        return this;
      }
    }
    IteratorVisitor.prototype.visitNull = vectorIterator;
    IteratorVisitor.prototype.visitBool = vectorIterator;
    IteratorVisitor.prototype.visitInt = vectorIterator;
    IteratorVisitor.prototype.visitInt8 = vectorIterator;
    IteratorVisitor.prototype.visitInt16 = vectorIterator;
    IteratorVisitor.prototype.visitInt32 = vectorIterator;
    IteratorVisitor.prototype.visitInt64 = vectorIterator;
    IteratorVisitor.prototype.visitUint8 = vectorIterator;
    IteratorVisitor.prototype.visitUint16 = vectorIterator;
    IteratorVisitor.prototype.visitUint32 = vectorIterator;
    IteratorVisitor.prototype.visitUint64 = vectorIterator;
    IteratorVisitor.prototype.visitFloat = vectorIterator;
    IteratorVisitor.prototype.visitFloat16 = vectorIterator;
    IteratorVisitor.prototype.visitFloat32 = vectorIterator;
    IteratorVisitor.prototype.visitFloat64 = vectorIterator;
    IteratorVisitor.prototype.visitUtf8 = vectorIterator;
    IteratorVisitor.prototype.visitBinary = vectorIterator;
    IteratorVisitor.prototype.visitFixedSizeBinary = vectorIterator;
    IteratorVisitor.prototype.visitDate = vectorIterator;
    IteratorVisitor.prototype.visitDateDay = vectorIterator;
    IteratorVisitor.prototype.visitDateMillisecond = vectorIterator;
    IteratorVisitor.prototype.visitTimestamp = vectorIterator;
    IteratorVisitor.prototype.visitTimestampSecond = vectorIterator;
    IteratorVisitor.prototype.visitTimestampMillisecond = vectorIterator;
    IteratorVisitor.prototype.visitTimestampMicrosecond = vectorIterator;
    IteratorVisitor.prototype.visitTimestampNanosecond = vectorIterator;
    IteratorVisitor.prototype.visitTime = vectorIterator;
    IteratorVisitor.prototype.visitTimeSecond = vectorIterator;
    IteratorVisitor.prototype.visitTimeMillisecond = vectorIterator;
    IteratorVisitor.prototype.visitTimeMicrosecond = vectorIterator;
    IteratorVisitor.prototype.visitTimeNanosecond = vectorIterator;
    IteratorVisitor.prototype.visitDecimal = vectorIterator;
    IteratorVisitor.prototype.visitList = vectorIterator;
    IteratorVisitor.prototype.visitStruct = vectorIterator;
    IteratorVisitor.prototype.visitUnion = vectorIterator;
    IteratorVisitor.prototype.visitDenseUnion = vectorIterator;
    IteratorVisitor.prototype.visitSparseUnion = vectorIterator;
    IteratorVisitor.prototype.visitDictionary = vectorIterator;
    IteratorVisitor.prototype.visitInterval = vectorIterator;
    IteratorVisitor.prototype.visitIntervalDayTime = vectorIterator;
    IteratorVisitor.prototype.visitIntervalYearMonth = vectorIterator;
    IteratorVisitor.prototype.visitFixedSizeList = vectorIterator;
    IteratorVisitor.prototype.visitMap = vectorIterator;
    /** @ignore */
    const iterator_instance = new IteratorVisitor(); // CONCATENATED MODULE: ./node_modules/apache-arrow/visitor/bytelength.mjs

    //# sourceMappingURL=iterator.mjs.map

    /* istanbul ignore file */

    /** @ignore */ const sum = (x, y) => x + y;
    /** @ignore */
    class GetByteLengthVisitor extends Visitor {
      visitNull(____, _) {
        return 0;
      }
      visitInt(data, _) {
        return data.type.bitWidth / 8;
      }
      visitFloat(data, _) {
        return data.type.ArrayType.BYTES_PER_ELEMENT;
      }
      visitBool(____, _) {
        return 1 / 8;
      }
      visitDecimal(data, _) {
        return data.type.bitWidth / 8;
      }
      visitDate(data, _) {
        return (data.type.unit + 1) * 4;
      }
      visitTime(data, _) {
        return data.type.bitWidth / 8;
      }
      visitTimestamp(data, _) {
        return data.type.unit === TimeUnit.SECOND ? 4 : 8;
      }
      visitInterval(data, _) {
        return (data.type.unit + 1) * 4;
      }
      visitStruct(data, i) {
        return data.children.reduce(
          (total, child) => total + bytelength_instance.visit(child, i),
          0,
        );
      }
      visitFixedSizeBinary(data, _) {
        return data.type.byteWidth;
      }
      visitMap(data, i) {
        // 4 + 4 for the indices
        return (
          8 +
          data.children.reduce(
            (total, child) => total + bytelength_instance.visit(child, i),
            0,
          )
        );
      }
      visitDictionary(data, i) {
        var _a;
        return (
          data.type.indices.bitWidth / 8 +
          (((_a = data.dictionary) === null || _a === void 0
            ? void 0
            : _a.getByteLength(data.values[i])) || 0)
        );
      }
    }
    /** @ignore */
    const getUtf8ByteLength = ({ valueOffsets }, index) => {
      // 4 + 4 for the indices, `end - start` for the data bytes
      return 8 + (valueOffsets[index + 1] - valueOffsets[index]);
    };
    /** @ignore */
    const getBinaryByteLength = ({ valueOffsets }, index) => {
      // 4 + 4 for the indices, `end - start` for the data bytes
      return 8 + (valueOffsets[index + 1] - valueOffsets[index]);
    };
    /** @ignore */
    const getListByteLength = ({ valueOffsets, stride, children }, index) => {
      const child = children[0];
      const { [index * stride]: start } = valueOffsets;
      const { [index * stride + 1]: end } = valueOffsets;
      const visit = bytelength_instance.getVisitFn(child.type);
      const slice = child.slice(start, end - start);
      let size = 8; // 4 + 4 for the indices
      for (let idx = -1, len = end - start; ++idx < len; ) {
        size += visit(slice, idx);
      }
      return size;
    };
    /** @ignore */
    const getFixedSizeListByteLength = ({ stride, children }, index) => {
      const child = children[0];
      const slice = child.slice(index * stride, stride);
      const visit = bytelength_instance.getVisitFn(child.type);
      let size = 0;
      for (let idx = -1, len = slice.length; ++idx < len; ) {
        size += visit(slice, idx);
      }
      return size;
    };
    /* istanbul ignore next */
    /** @ignore */
    const getUnionByteLength = (data, index) => {
      return data.type.mode === UnionMode.Dense
        ? getDenseUnionByteLength(data, index)
        : getSparseUnionByteLength(data, index);
    };
    /** @ignore */
    const getDenseUnionByteLength = (
      { type, children, typeIds, valueOffsets },
      index,
    ) => {
      const childIndex = type.typeIdToChildIndex[typeIds[index]];
      // 4 for the typeId, 4 for the valueOffsets, then the child at the offset
      return (
        8 + bytelength_instance.visit(children[childIndex], valueOffsets[index])
      );
    };
    /** @ignore */
    const getSparseUnionByteLength = ({ children }, index) => {
      // 4 for the typeId, then once each for the children at this index
      return (
        4 +
        bytelength_instance
          .visitMany(
            children,
            children.map(() => index),
          )
          .reduce(sum, 0)
      );
    };
    GetByteLengthVisitor.prototype.visitUtf8 = getUtf8ByteLength;
    GetByteLengthVisitor.prototype.visitBinary = getBinaryByteLength;
    GetByteLengthVisitor.prototype.visitList = getListByteLength;
    GetByteLengthVisitor.prototype.visitFixedSizeList =
      getFixedSizeListByteLength;
    GetByteLengthVisitor.prototype.visitUnion = getUnionByteLength;
    GetByteLengthVisitor.prototype.visitDenseUnion = getDenseUnionByteLength;
    GetByteLengthVisitor.prototype.visitSparseUnion = getSparseUnionByteLength;
    /** @ignore */
    const bytelength_instance = new GetByteLengthVisitor(); // CONCATENATED MODULE: ./node_modules/apache-arrow/vector.mjs

    //# sourceMappingURL=bytelength.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.
    var vector_a;

    const visitorsByTypeId = {};
    const vectorPrototypesByTypeId = {};
    /**
     * Array-like data structure. Use the convenience method {@link makeVector} and {@link vectorFromArray} to create vectors.
     */
    class Vector {
      constructor(input) {
        var _b, _c, _d;
        const data =
          input[0] instanceof Vector ? input.flatMap((x) => x.data) : input;
        if (data.some((x) => !(x instanceof Data))) {
          throw new TypeError(
            "Vector constructor expects an Array of Data instances.",
          );
        }
        const type =
          (_b = data[0]) === null || _b === void 0 ? void 0 : _b.type;
        switch (data.length) {
          case 0:
            this._offsets = [0];
            break;
          case 1: {
            // special case for unchunked vectors
            const { get, set, indexOf, byteLength } =
              visitorsByTypeId[type.typeId];
            const unchunkedData = data[0];
            this.isValid = (index) => isChunkedValid(unchunkedData, index);
            this.get = (index) => get(unchunkedData, index);
            this.set = (index, value) => set(unchunkedData, index, value);
            this.indexOf = (index) => indexOf(unchunkedData, index);
            this.getByteLength = (index) => byteLength(unchunkedData, index);
            this._offsets = [0, unchunkedData.length];
            break;
          }
          default:
            Object.setPrototypeOf(this, vectorPrototypesByTypeId[type.typeId]);
            this._offsets = computeChunkOffsets(data);
            break;
        }
        this.data = data;
        this.type = type;
        this.stride = strideForType(type);
        this.numChildren =
          (_d =
            (_c = type.children) === null || _c === void 0
              ? void 0
              : _c.length) !== null && _d !== void 0
            ? _d
            : 0;
        this.length = this._offsets[this._offsets.length - 1];
      }
      /**
       * The aggregate size (in bytes) of this Vector's buffers and/or child Vectors.
       */
      get byteLength() {
        if (this._byteLength === -1) {
          this._byteLength = this.data.reduce(
            (byteLength, data) => byteLength + data.byteLength,
            0,
          );
        }
        return this._byteLength;
      }
      /**
       * The number of null elements in this Vector.
       */
      get nullCount() {
        if (this._nullCount === -1) {
          this._nullCount = computeChunkNullCounts(this.data);
        }
        return this._nullCount;
      }
      /**
       * The Array or TypedAray constructor used for the JS representation
       *  of the element's values in {@link Vector.prototype.toArray `toArray()`}.
       */
      get ArrayType() {
        return this.type.ArrayType;
      }
      /**
       * The name that should be printed when the Vector is logged in a message.
       */
      get [Symbol.toStringTag]() {
        return `${this.VectorName}<${this.type[Symbol.toStringTag]}>`;
      }
      /**
       * The name of this Vector.
       */
      get VectorName() {
        return `${Type[this.type.typeId]}Vector`;
      }
      /**
       * Check whether an element is null.
       * @param index The index at which to read the validity bitmap.
       */
      // @ts-ignore
      isValid(index) {
        return false;
      }
      /**
       * Get an element value by position.
       * @param index The index of the element to read.
       */
      // @ts-ignore
      get(index) {
        return null;
      }
      /**
       * Set an element value by position.
       * @param index The index of the element to write.
       * @param value The value to set.
       */
      // @ts-ignore
      set(index, value) {
        return;
      }
      /**
       * Retrieve the index of the first occurrence of a value in an Vector.
       * @param element The value to locate in the Vector.
       * @param offset The index at which to begin the search. If offset is omitted, the search starts at index 0.
       */
      // @ts-ignore
      indexOf(element, offset) {
        return -1;
      }
      includes(element, offset) {
        return this.indexOf(element, offset) > 0;
      }
      /**
       * Get the size in bytes of an element by index.
       * @param index The index at which to get the byteLength.
       */
      // @ts-ignore
      getByteLength(index) {
        return 0;
      }
      /**
       * Iterator for the Vector's elements.
       */
      [Symbol.iterator]() {
        return iterator_instance.visit(this);
      }
      /**
       * Combines two or more Vectors of the same type.
       * @param others Additional Vectors to add to the end of this Vector.
       */
      concat(...others) {
        return new Vector(
          this.data.concat(
            others.flatMap((x) => x.data).flat(Number.POSITIVE_INFINITY),
          ),
        );
      }
      /**
       * Return a zero-copy sub-section of this Vector.
       * @param start The beginning of the specified portion of the Vector.
       * @param end The end of the specified portion of the Vector. This is exclusive of the element at the index 'end'.
       */
      slice(begin, end) {
        return new Vector(
          clampRange(this, begin, end, ({ data, _offsets }, begin, end) =>
            sliceChunks(data, _offsets, begin, end),
          ),
        );
      }
      toJSON() {
        return [...this];
      }
      /**
       * Return a JavaScript Array or TypedArray of the Vector's elements.
       *
       * @note If this Vector contains a single Data chunk and the Vector's type is a
       *  primitive numeric type corresponding to one of the JavaScript TypedArrays, this
       *  method returns a zero-copy slice of the underlying TypedArray values. If there's
       *  more than one chunk, the resulting TypedArray will be a copy of the data from each
       *  chunk's underlying TypedArray values.
       *
       * @returns An Array or TypedArray of the Vector's elements, based on the Vector's DataType.
       */
      toArray() {
        const { type, data, length, stride, ArrayType } = this;
        // Fast case, return subarray if possible
        switch (type.typeId) {
          case Type.Int:
          case Type.Float:
          case Type.Decimal:
          case Type.Time:
          case Type.Timestamp:
            switch (data.length) {
              case 0:
                return new ArrayType();
              case 1:
                return data[0].values.subarray(0, length * stride);
              default:
                return data.reduce(
                  (memo, { values }) => {
                    memo.array.set(values, memo.offset);
                    memo.offset += values.length;
                    return memo;
                  },
                  { array: new ArrayType(length * stride), offset: 0 },
                ).array;
            }
        }
        // Otherwise if not primitive, slow copy
        return [...this];
      }
      /**
       * Returns a string representation of the Vector.
       *
       * @returns A string representation of the Vector.
       */
      toString() {
        return `[${[...this].join(",")}]`;
      }
      /**
       * Returns a child Vector by name, or null if this Vector has no child with the given name.
       * @param name The name of the child to retrieve.
       */
      getChild(name) {
        var _b;
        return this.getChildAt(
          (_b = this.type.children) === null || _b === void 0
            ? void 0
            : _b.findIndex((f) => f.name === name),
        );
      }
      /**
       * Returns a child Vector by index, or null if this Vector has no child at the supplied index.
       * @param index The index of the child to retrieve.
       */
      getChildAt(index) {
        if (index > -1 && index < this.numChildren) {
          return new Vector(this.data.map(({ children }) => children[index]));
        }
        return null;
      }
      get isMemoized() {
        if (DataType.isDictionary(this.type)) {
          return this.data[0].dictionary.isMemoized;
        }
        return false;
      }
      /**
       * Adds memoization to the Vector's {@link get} method. For dictionary
       * vectors, this method return a vector that memoizes only the dictionary
       * values.
       *
       * Memoization is very useful when decoding a value is expensive such as
       * Uft8. The memoization creates a cache of the size of the Vector and
       * therfore increases memory usage.
       *
       * @returns A new vector that memoizes calls to {@link get}.
       */
      memoize() {
        if (DataType.isDictionary(this.type)) {
          const dictionary = new MemoizedVector(this.data[0].dictionary);
          const newData = this.data.map((data) => {
            const cloned = data.clone();
            cloned.dictionary = dictionary;
            return cloned;
          });
          return new Vector(newData);
        }
        return new MemoizedVector(this);
      }
      /**
       * Returns a vector without memoization of the {@link get} method. If this
       * vector is not memoized, this method returns this vector.
       *
       * @returns A a vector without memoization.
       */
      unmemoize() {
        if (DataType.isDictionary(this.type) && this.isMemoized) {
          const dictionary = this.data[0].dictionary.unmemoize();
          const newData = this.data.map((data) => {
            const newData = data.clone();
            newData.dictionary = dictionary;
            return newData;
          });
          return new Vector(newData);
        }
        return this;
      }
    }
    vector_a = Symbol.toStringTag;
    // Initialize this static property via an IIFE so bundlers don't tree-shake
    // out this logic, but also so we're still compliant with `"sideEffects": false`
    Vector[vector_a] = ((proto) => {
      proto.type = DataType.prototype;
      proto.data = [];
      proto.length = 0;
      proto.stride = 1;
      proto.numChildren = 0;
      proto._nullCount = -1;
      proto._byteLength = -1;
      proto._offsets = new Uint32Array([0]);
      proto[Symbol.isConcatSpreadable] = true;
      const typeIds = Object.keys(Type)
        .map((T) => Type[T])
        .filter((T) => typeof T === "number" && T !== Type.NONE);
      for (const typeId of typeIds) {
        const get = get_instance.getVisitFnByTypeId(typeId);
        const set = instance.getVisitFnByTypeId(typeId);
        const indexOf = indexof_instance.getVisitFnByTypeId(typeId);
        const byteLength = bytelength_instance.getVisitFnByTypeId(typeId);
        visitorsByTypeId[typeId] = { get, set, indexOf, byteLength };
        vectorPrototypesByTypeId[typeId] = Object.create(proto, {
          ["isValid"]: { value: wrapChunkedCall1(isChunkedValid) },
          ["get"]: {
            value: wrapChunkedCall1(get_instance.getVisitFnByTypeId(typeId)),
          },
          ["set"]: {
            value: wrapChunkedCall2(instance.getVisitFnByTypeId(typeId)),
          },
          ["indexOf"]: {
            value: wrapChunkedIndexOf(
              indexof_instance.getVisitFnByTypeId(typeId),
            ),
          },
          ["getByteLength"]: {
            value: wrapChunkedCall1(
              bytelength_instance.getVisitFnByTypeId(typeId),
            ),
          },
        });
      }
      return "Vector";
    })(Vector.prototype);
    class MemoizedVector extends Vector {
      constructor(vector) {
        super(vector.data);
        const get = this.get;
        const set = this.set;
        const slice = this.slice;
        const cache = new Array(this.length);
        Object.defineProperty(this, "get", {
          value(index) {
            const cachedValue = cache[index];
            if (cachedValue !== undefined) {
              return cachedValue;
            }
            const value = get.call(this, index);
            cache[index] = value;
            return value;
          },
        });
        Object.defineProperty(this, "set", {
          value(index, value) {
            set.call(this, index, value);
            cache[index] = value;
          },
        });
        Object.defineProperty(this, "slice", {
          value: (begin, end) =>
            new MemoizedVector(slice.call(this, begin, end)),
        });
        Object.defineProperty(this, "isMemoized", { value: true });
        Object.defineProperty(this, "unmemoize", {
          value: () => new Vector(this.data),
        });
        Object.defineProperty(this, "memoize", {
          value: () => this,
        });
      }
    }

    function makeVector(init) {
      if (init) {
        if (init instanceof Data) {
          return new Vector([init]);
        }
        if (init instanceof Vector) {
          return new Vector(init.data);
        }
        if (init.type instanceof DataType) {
          return new Vector([makeData(init)]);
        }
        if (Array.isArray(init)) {
          return new Vector(init.flatMap((v) => unwrapInputs(v)));
        }
        if (ArrayBuffer.isView(init)) {
          if (init instanceof DataView) {
            init = new Uint8Array(init.buffer);
          }
          const props = {
            offset: 0,
            length: init.length,
            nullCount: 0,
            data: init,
          };
          if (init instanceof Int8Array) {
            return new Vector([
              makeData(
                Object.assign(Object.assign({}, props), { type: new Int8() }),
              ),
            ]);
          }
          if (init instanceof Int16Array) {
            return new Vector([
              makeData(
                Object.assign(Object.assign({}, props), { type: new Int16() }),
              ),
            ]);
          }
          if (init instanceof Int32Array) {
            return new Vector([
              makeData(
                Object.assign(Object.assign({}, props), { type: new Int32() }),
              ),
            ]);
          }
          if (init instanceof BigInt64Array) {
            return new Vector([
              makeData(
                Object.assign(Object.assign({}, props), { type: new Int64() }),
              ),
            ]);
          }
          if (init instanceof Uint8Array || init instanceof Uint8ClampedArray) {
            return new Vector([
              makeData(
                Object.assign(Object.assign({}, props), { type: new Uint8() }),
              ),
            ]);
          }
          if (init instanceof Uint16Array) {
            return new Vector([
              makeData(
                Object.assign(Object.assign({}, props), { type: new Uint16() }),
              ),
            ]);
          }
          if (init instanceof Uint32Array) {
            return new Vector([
              makeData(
                Object.assign(Object.assign({}, props), { type: new Uint32() }),
              ),
            ]);
          }
          if (init instanceof BigUint64Array) {
            return new Vector([
              makeData(
                Object.assign(Object.assign({}, props), { type: new Uint64() }),
              ),
            ]);
          }
          if (init instanceof Float32Array) {
            return new Vector([
              makeData(
                Object.assign(Object.assign({}, props), {
                  type: new Float32(),
                }),
              ),
            ]);
          }
          if (init instanceof Float64Array) {
            return new Vector([
              makeData(
                Object.assign(Object.assign({}, props), {
                  type: new Float64(),
                }),
              ),
            ]);
          }
          throw new Error("Unrecognized input");
        }
      }
      throw new Error("Unrecognized input");
    }
    function unwrapInputs(x) {
      return x instanceof Data
        ? [x]
        : x instanceof Vector
        ? x.data
        : makeVector(x).data;
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/builder/valid.mjs

    //# sourceMappingURL=vector.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /**
     * Dynamically compile the null values into an `isValid()` function whose
     * implementation is a switch statement. Microbenchmarks in v8 indicate
     * this approach is 25% faster than using an ES6 Map.
     *
     * @example
     * console.log(createIsValidFunction([null, 'N/A', NaN]));
     * `function (x) {
     *     if (x !== x) return false;
     *     switch (x) {
     *         case null:
     *         case "N/A":
     *             return false;
     *     }
     *     return true;
     * }`
     *
     * @ignore
     * @param nullValues
     */
    function createIsValidFunction(nullValues) {
      if (!nullValues || nullValues.length <= 0) {
        // @ts-ignore
        return function isValid(value) {
          return true;
        };
      }
      let fnBody = "";
      const noNaNs = nullValues.filter((x) => x === x);
      if (noNaNs.length > 0) {
        fnBody = `
    switch (x) {${noNaNs
      .map(
        (x) => `
        case ${valueToCase(x)}:`,
      )
      .join("")}
            return false;
    }`;
      }
      // NaN doesn't equal anything including itself, so it doesn't work as a
      // switch case. Instead we must explicitly check for NaN before the switch.
      if (nullValues.length !== noNaNs.length) {
        fnBody = `if (x !== x) return false;\n${fnBody}`;
      }
      return new Function(`x`, `${fnBody}\nreturn true;`);
    }
    /** @ignore */
    function valueToCase(x) {
      if (typeof x !== "bigint") {
        return valueToString(x);
      } else if (BigIntAvailable) {
        return `${valueToString(x)}n`;
      }
      return `"${valueToString(x)}"`;
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/builder/buffer.mjs

    //# sourceMappingURL=valid.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    const roundLengthUpToNearest64Bytes = (len, BPE) =>
      ((len * BPE + 63) & ~63 || 64) / BPE;
    /** @ignore */
    const sliceOrExtendArray = (arr, len = 0) =>
      arr.length >= len
        ? arr.subarray(0, len)
        : memcpy(new arr.constructor(len), arr, 0);
    /** @ignore */
    class BufferBuilder {
      constructor(buffer, stride = 1) {
        this.buffer = buffer;
        this.stride = stride;
        this.BYTES_PER_ELEMENT = buffer.BYTES_PER_ELEMENT;
        this.ArrayType = buffer.constructor;
        this._resize((this.length = Math.trunc(buffer.length / stride)));
      }
      get byteLength() {
        return Math.trunc(this.length * this.stride * this.BYTES_PER_ELEMENT);
      }
      get reservedLength() {
        return this.buffer.length / this.stride;
      }
      get reservedByteLength() {
        return this.buffer.byteLength;
      }
      // @ts-ignore
      set(index, value) {
        return this;
      }
      append(value) {
        return this.set(this.length, value);
      }
      reserve(extra) {
        if (extra > 0) {
          this.length += extra;
          const stride = this.stride;
          const length = this.length * stride;
          const reserved = this.buffer.length;
          if (length >= reserved) {
            this._resize(
              reserved === 0
                ? roundLengthUpToNearest64Bytes(
                    length * 1,
                    this.BYTES_PER_ELEMENT,
                  )
                : roundLengthUpToNearest64Bytes(
                    length * 2,
                    this.BYTES_PER_ELEMENT,
                  ),
            );
          }
        }
        return this;
      }
      flush(length = this.length) {
        length = roundLengthUpToNearest64Bytes(
          length * this.stride,
          this.BYTES_PER_ELEMENT,
        );
        const array = sliceOrExtendArray(this.buffer, length);
        this.clear();
        return array;
      }
      clear() {
        this.length = 0;
        this._resize(0);
        return this;
      }
      _resize(newLength) {
        return (this.buffer = memcpy(
          new this.ArrayType(newLength),
          this.buffer,
        ));
      }
    }
    BufferBuilder.prototype.offset = 0;
    /** @ignore */
    class DataBufferBuilder extends BufferBuilder {
      last() {
        return this.get(this.length - 1);
      }
      get(index) {
        return this.buffer[index];
      }
      set(index, value) {
        this.reserve(index - this.length + 1);
        this.buffer[index * this.stride] = value;
        return this;
      }
    }
    /** @ignore */
    class BitmapBufferBuilder extends DataBufferBuilder {
      constructor(data = new Uint8Array(0)) {
        super(data, 1 / 8);
        this.numValid = 0;
      }
      get numInvalid() {
        return this.length - this.numValid;
      }
      get(idx) {
        return (this.buffer[idx >> 3] >> idx % 8) & 1;
      }
      set(idx, val) {
        const { buffer } = this.reserve(idx - this.length + 1);
        const byte = idx >> 3,
          bit = idx % 8,
          cur = (buffer[byte] >> bit) & 1;
        // If `val` is truthy and the current bit is 0, flip it to 1 and increment `numValid`.
        // If `val` is falsey and the current bit is 1, flip it to 0 and decrement `numValid`.
        val
          ? cur === 0 && ((buffer[byte] |= 1 << bit), ++this.numValid)
          : cur === 1 && ((buffer[byte] &= ~(1 << bit)), --this.numValid);
        return this;
      }
      clear() {
        this.numValid = 0;
        return super.clear();
      }
    }
    /** @ignore */
    class OffsetsBufferBuilder extends DataBufferBuilder {
      constructor(data = new Int32Array(1)) {
        super(data, 1);
      }
      append(value) {
        return this.set(this.length - 1, value);
      }
      set(index, value) {
        const offset = this.length - 1;
        const buffer = this.reserve(index - offset + 1).buffer;
        if (offset < index++) {
          buffer.fill(buffer[offset], offset, index);
        }
        buffer[index] = buffer[index - 1] + value;
        return this;
      }
      flush(length = this.length - 1) {
        if (length > this.length) {
          this.set(length - 1, 0);
        }
        return super.flush(length + 1);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/builder.mjs
    // /** @ignore */
    // export class WideBufferBuilder<T extends TypedArray, R extends BigIntArray> extends BufferBuilder<T, DataValue<T>> {
    //     public buffer64!: R;
    //     protected _ArrayType64!: BigIntArrayConstructor<R>;
    //     public get ArrayType64() {
    //         return this._ArrayType64 || (this._ArrayType64 = <BigIntArrayConstructor<R>> (this.buffer instanceof Int32Array ? BigInt64Array : BigUint64Array));
    //     }
    //     public set(index: number, value: DataValue<T>) {
    //         this.reserve(index - this.length + 1);
    //         switch (typeof value) {
    //             case 'bigint': this.buffer64[index] = value; break;
    //             case 'number': this.buffer[index * this.stride] = value; break;
    //             default: this.buffer.set(value as TypedArray, index * this.stride);
    //         }
    //         return this;
    //     }
    //     protected _resize(newLength: number) {
    //         const data = super._resize(newLength);
    //         const length = data.byteLength / (this.BYTES_PER_ELEMENT * this.stride);
    //         if (BigIntAvailable) {
    //             this.buffer64 = new this.ArrayType64(data.buffer, data.byteOffset, length);
    //         }
    //         return data;
    //     }
    // }

    //# sourceMappingURL=buffer.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /**
     * An abstract base class for types that construct Arrow Vectors from arbitrary JavaScript values.
     *
     * A `Builder` is responsible for writing arbitrary JavaScript values
     * to ArrayBuffers and/or child Builders according to the Arrow specification
     * for each DataType, creating or resizing the underlying ArrayBuffers as necessary.
     *
     * The `Builder` for each Arrow `DataType` handles converting and appending
     * values for a given `DataType`. The high-level {@link makeBuilder `makeBuilder()`} convenience
     * method creates the specific `Builder` subclass for the supplied `DataType`.
     *
     * Once created, `Builder` instances support both appending values to the end
     * of the `Builder`, and random-access writes to specific indices
     * (`Builder.prototype.append(value)` is a convenience method for
     * `builder.set(builder.length, value)`). Appending or setting values beyond the
     * Builder's current length may cause the builder to grow its underlying buffers
     * or child Builders (if applicable) to accommodate the new values.
     *
     * After enough values have been written to a `Builder`, `Builder.prototype.flush()`
     * will commit the values to the underlying ArrayBuffers (or child Builders). The
     * internal Builder state will be reset, and an instance of `Data<T>` is returned.
     * Alternatively, `Builder.prototype.toVector()` will flush the `Builder` and return
     * an instance of `Vector<T>` instead.
     *
     * When there are no more values to write, use `Builder.prototype.finish()` to
     * finalize the `Builder`. This does not reset the internal state, so it is
     * necessary to call `Builder.prototype.flush()` or `toVector()` one last time
     * if there are still values queued to be flushed.
     *
     * Note: calling `Builder.prototype.finish()` is required when using a `DictionaryBuilder`,
     * because this is when it flushes the values that have been enqueued in its internal
     * dictionary's `Builder`, and creates the `dictionaryVector` for the `Dictionary` `DataType`.
     *
     * @example
     * ```ts
     * import { Builder, Utf8 } from 'apache-arrow';
     *
     * const utf8Builder = makeBuilder({
     *     type: new Utf8(),
     *     nullValues: [null, 'n/a']
     * });
     *
     * utf8Builder
     *     .append('hello')
     *     .append('n/a')
     *     .append('world')
     *     .append(null);
     *
     * const utf8Vector = utf8Builder.finish().toVector();
     *
     * console.log(utf8Vector.toJSON());
     * // > ["hello", null, "world", null]
     * ```
     *
     * @typeparam T The `DataType` of this `Builder`.
     * @typeparam TNull The type(s) of values which will be considered null-value sentinels.
     */
    class Builder {
      /**
       * Construct a builder with the given Arrow DataType with optional null values,
       * which will be interpreted as "null" when set or appended to the `Builder`.
       * @param {{ type: T, nullValues?: any[] }} options A `BuilderOptions` object used to create this `Builder`.
       */
      constructor({ type: type, nullValues: nulls }) {
        /**
         * The number of values written to the `Builder` that haven't been flushed yet.
         * @readonly
         */
        this.length = 0;
        /**
         * A boolean indicating whether `Builder.prototype.finish()` has been called on this `Builder`.
         * @readonly
         */
        this.finished = false;
        this.type = type;
        this.children = [];
        this.nullValues = nulls;
        this.stride = strideForType(type);
        this._nulls = new BitmapBufferBuilder();
        if (nulls && nulls.length > 0) {
          this._isValid = createIsValidFunction(nulls);
        }
      }
      /** @nocollapse */
      // @ts-ignore
      static throughNode(options) {
        throw new Error(`"throughNode" not available in this environment`);
      }
      /** @nocollapse */
      // @ts-ignore
      static throughDOM(options) {
        throw new Error(`"throughDOM" not available in this environment`);
      }
      /**
       * Flush the `Builder` and return a `Vector<T>`.
       * @returns {Vector<T>} A `Vector<T>` of the flushed values.
       */
      toVector() {
        return new Vector([this.flush()]);
      }
      get ArrayType() {
        return this.type.ArrayType;
      }
      get nullCount() {
        return this._nulls.numInvalid;
      }
      get numChildren() {
        return this.children.length;
      }
      /**
       * @returns The aggregate length (in bytes) of the values that have been written.
       */
      get byteLength() {
        let size = 0;
        const { _offsets, _values, _nulls, _typeIds, children } = this;
        _offsets && (size += _offsets.byteLength);
        _values && (size += _values.byteLength);
        _nulls && (size += _nulls.byteLength);
        _typeIds && (size += _typeIds.byteLength);
        return children.reduce((size, child) => size + child.byteLength, size);
      }
      /**
       * @returns The aggregate number of rows that have been reserved to write new values.
       */
      get reservedLength() {
        return this._nulls.reservedLength;
      }
      /**
       * @returns The aggregate length (in bytes) that has been reserved to write new values.
       */
      get reservedByteLength() {
        let size = 0;
        this._offsets && (size += this._offsets.reservedByteLength);
        this._values && (size += this._values.reservedByteLength);
        this._nulls && (size += this._nulls.reservedByteLength);
        this._typeIds && (size += this._typeIds.reservedByteLength);
        return this.children.reduce(
          (size, child) => size + child.reservedByteLength,
          size,
        );
      }
      get valueOffsets() {
        return this._offsets ? this._offsets.buffer : null;
      }
      get values() {
        return this._values ? this._values.buffer : null;
      }
      get nullBitmap() {
        return this._nulls ? this._nulls.buffer : null;
      }
      get typeIds() {
        return this._typeIds ? this._typeIds.buffer : null;
      }
      /**
       * Appends a value (or null) to this `Builder`.
       * This is equivalent to `builder.set(builder.length, value)`.
       * @param {T['TValue'] | TNull } value The value to append.
       */
      append(value) {
        return this.set(this.length, value);
      }
      /**
       * Validates whether a value is valid (true), or null (false)
       * @param {T['TValue'] | TNull } value The value to compare against null the value representations
       */
      isValid(value) {
        return this._isValid(value);
      }
      /**
       * Write a value (or null-value sentinel) at the supplied index.
       * If the value matches one of the null-value representations, a 1-bit is
       * written to the null `BitmapBufferBuilder`. Otherwise, a 0 is written to
       * the null `BitmapBufferBuilder`, and the value is passed to
       * `Builder.prototype.setValue()`.
       * @param {number} index The index of the value to write.
       * @param {T['TValue'] | TNull } value The value to write at the supplied index.
       * @returns {this} The updated `Builder` instance.
       */
      set(index, value) {
        if (this.setValid(index, this.isValid(value))) {
          this.setValue(index, value);
        }
        return this;
      }
      /**
       * Write a value to the underlying buffers at the supplied index, bypassing
       * the null-value check. This is a low-level method that
       * @param {number} index
       * @param {T['TValue'] | TNull } value
       */
      setValue(index, value) {
        this._setValue(this, index, value);
      }
      setValid(index, valid) {
        this.length = this._nulls.set(index, +valid).length;
        return valid;
      }
      // @ts-ignore
      addChild(child, name = `${this.numChildren}`) {
        throw new Error(
          `Cannot append children to non-nested type "${this.type}"`,
        );
      }
      /**
       * Retrieve the child `Builder` at the supplied `index`, or null if no child
       * exists at that index.
       * @param {number} index The index of the child `Builder` to retrieve.
       * @returns {Builder | null} The child Builder at the supplied index or null.
       */
      getChildAt(index) {
        return this.children[index] || null;
      }
      /**
       * Commit all the values that have been written to their underlying
       * ArrayBuffers, including any child Builders if applicable, and reset
       * the internal `Builder` state.
       * @returns A `Data<T>` of the buffers and children representing the values written.
       */
      flush() {
        let data;
        let typeIds;
        let nullBitmap;
        let valueOffsets;
        const { type, length, nullCount, _typeIds, _offsets, _values, _nulls } =
          this;
        if (
          (typeIds =
            _typeIds === null || _typeIds === void 0
              ? void 0
              : _typeIds.flush(length))
        ) {
          // Unions
          // DenseUnions
          valueOffsets =
            _offsets === null || _offsets === void 0
              ? void 0
              : _offsets.flush(length);
        } else if (
          (valueOffsets =
            _offsets === null || _offsets === void 0
              ? void 0
              : _offsets.flush(length))
        ) {
          // Variable-width primitives (Binary, Utf8), and Lists
          // Binary, Utf8
          data =
            _values === null || _values === void 0
              ? void 0
              : _values.flush(_offsets.last());
        } else {
          // Fixed-width primitives (Int, Float, Decimal, Time, Timestamp, and Interval)
          data =
            _values === null || _values === void 0
              ? void 0
              : _values.flush(length);
        }
        if (nullCount > 0) {
          nullBitmap =
            _nulls === null || _nulls === void 0
              ? void 0
              : _nulls.flush(length);
        }
        const children = this.children.map((child) => child.flush());
        this.clear();
        return makeData({
          type,
          length,
          nullCount,
          children,
          child: children[0],
          data,
          typeIds,
          nullBitmap,
          valueOffsets,
        });
      }
      /**
       * Finalize this `Builder`, and child builders if applicable.
       * @returns {this} The finalized `Builder` instance.
       */
      finish() {
        this.finished = true;
        for (const child of this.children) child.finish();
        return this;
      }
      /**
       * Clear this Builder's internal state, including child Builders if applicable, and reset the length to 0.
       * @returns {this} The cleared `Builder` instance.
       */
      clear() {
        var _a, _b, _c, _d;
        this.length = 0;
        (_a = this._nulls) === null || _a === void 0 ? void 0 : _a.clear();
        (_b = this._values) === null || _b === void 0 ? void 0 : _b.clear();
        (_c = this._offsets) === null || _c === void 0 ? void 0 : _c.clear();
        (_d = this._typeIds) === null || _d === void 0 ? void 0 : _d.clear();
        for (const child of this.children) child.clear();
        return this;
      }
    }
    Builder.prototype.length = 1;
    Builder.prototype.stride = 1;
    Builder.prototype.children = null;
    Builder.prototype.finished = false;
    Builder.prototype.nullValues = null;
    Builder.prototype._isValid = () => true;
    /** @ignore */
    class FixedWidthBuilder extends Builder {
      constructor(opts) {
        super(opts);
        this._values = new DataBufferBuilder(
          new this.ArrayType(0),
          this.stride,
        );
      }
      setValue(index, value) {
        const values = this._values;
        values.reserve(index - values.length + 1);
        return super.setValue(index, value);
      }
    }
    /** @ignore */
    class VariableWidthBuilder extends Builder {
      constructor(opts) {
        super(opts);
        this._pendingLength = 0;
        this._offsets = new OffsetsBufferBuilder();
      }
      setValue(index, value) {
        const pending = this._pending || (this._pending = new Map());
        const current = pending.get(index);
        current && (this._pendingLength -= current.length);
        this._pendingLength +=
          value instanceof MapRow ? value[kKeys].length : value.length;
        pending.set(index, value);
      }
      setValid(index, isValid) {
        if (!super.setValid(index, isValid)) {
          (this._pending || (this._pending = new Map())).set(index, undefined);
          return false;
        }
        return true;
      }
      clear() {
        this._pendingLength = 0;
        this._pending = undefined;
        return super.clear();
      }
      flush() {
        this._flush();
        return super.flush();
      }
      finish() {
        this._flush();
        return super.finish();
      }
      _flush() {
        const pending = this._pending;
        const pendingLength = this._pendingLength;
        this._pendingLength = 0;
        this._pending = undefined;
        if (pending && pending.size > 0) {
          this._flushPending(pending, pendingLength);
        }
        return this;
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/block.mjs

    //# sourceMappingURL=builder.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify
    class Block {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      /**
       * Index to the start of the RecordBlock (note this is past the Message header)
       */
      offset() {
        return this.bb.readInt64(this.bb_pos);
      }
      /**
       * Length of the metadata
       */
      metaDataLength() {
        return this.bb.readInt32(this.bb_pos + 8);
      }
      /**
       * Length of the data (this is aligned so there can be a gap between this and
       * the metadata).
       */
      bodyLength() {
        return this.bb.readInt64(this.bb_pos + 16);
      }
      static sizeOf() {
        return 24;
      }
      static createBlock(builder, offset, metaDataLength, bodyLength) {
        builder.prep(8, 24);
        builder.writeInt64(bodyLength);
        builder.pad(4);
        builder.writeInt32(metaDataLength);
        builder.writeInt64(offset);
        return builder.offset();
      }
    } // CONCATENATED MODULE: ./node_modules/flatbuffers/mjs/constants.js

    //# sourceMappingURL=block.mjs.map

    const SIZEOF_SHORT = 2;
    const SIZEOF_INT = 4;
    const FILE_IDENTIFIER_LENGTH = 4;
    const SIZE_PREFIX_LENGTH = 4; // CONCATENATED MODULE: ./node_modules/flatbuffers/mjs/utils.js

    const int32 = new Int32Array(2);
    const float32 = new Float32Array(int32.buffer);
    const float64 = new Float64Array(int32.buffer);
    const isLittleEndian =
      new Uint16Array(new Uint8Array([1, 0]).buffer)[0] === 1; // CONCATENATED MODULE: ./node_modules/flatbuffers/mjs/long.js

    function createLong(low, high) {
      return Long.create(low, high);
    }
    class Long {
      constructor(low, high) {
        this.low = low | 0;
        this.high = high | 0;
      }
      static create(low, high) {
        // Special-case zero to avoid GC overhead for default values
        return low == 0 && high == 0 ? Long.ZERO : new Long(low, high);
      }
      toFloat64() {
        return (this.low >>> 0) + this.high * 0x100000000;
      }
      equals(other) {
        return this.low == other.low && this.high == other.high;
      }
    }
    Long.ZERO = new Long(0, 0); // CONCATENATED MODULE: ./node_modules/flatbuffers/mjs/encoding.js

    var Encoding;
    (function (Encoding) {
      Encoding[(Encoding["UTF8_BYTES"] = 1)] = "UTF8_BYTES";
      Encoding[(Encoding["UTF16_STRING"] = 2)] = "UTF16_STRING";
    })(Encoding || (Encoding = {})); // CONCATENATED MODULE: ./node_modules/flatbuffers/mjs/byte-buffer.js

    class ByteBuffer {
      /**
       * Create a new ByteBuffer with a given array of bytes (`Uint8Array`)
       */
      constructor(bytes_) {
        this.bytes_ = bytes_;
        this.position_ = 0;
      }
      /**
       * Create and allocate a new ByteBuffer with a given size.
       */
      static allocate(byte_size) {
        return new ByteBuffer(new Uint8Array(byte_size));
      }
      clear() {
        this.position_ = 0;
      }
      /**
       * Get the underlying `Uint8Array`.
       */
      bytes() {
        return this.bytes_;
      }
      /**
       * Get the buffer's position.
       */
      position() {
        return this.position_;
      }
      /**
       * Set the buffer's position.
       */
      setPosition(position) {
        this.position_ = position;
      }
      /**
       * Get the buffer's capacity.
       */
      capacity() {
        return this.bytes_.length;
      }
      readInt8(offset) {
        return (this.readUint8(offset) << 24) >> 24;
      }
      readUint8(offset) {
        return this.bytes_[offset];
      }
      readInt16(offset) {
        return (this.readUint16(offset) << 16) >> 16;
      }
      readUint16(offset) {
        return this.bytes_[offset] | (this.bytes_[offset + 1] << 8);
      }
      readInt32(offset) {
        return (
          this.bytes_[offset] |
          (this.bytes_[offset + 1] << 8) |
          (this.bytes_[offset + 2] << 16) |
          (this.bytes_[offset + 3] << 24)
        );
      }
      readUint32(offset) {
        return this.readInt32(offset) >>> 0;
      }
      readInt64(offset) {
        return new Long(this.readInt32(offset), this.readInt32(offset + 4));
      }
      readUint64(offset) {
        return new Long(this.readUint32(offset), this.readUint32(offset + 4));
      }
      readFloat32(offset) {
        int32[0] = this.readInt32(offset);
        return float32[0];
      }
      readFloat64(offset) {
        int32[isLittleEndian ? 0 : 1] = this.readInt32(offset);
        int32[isLittleEndian ? 1 : 0] = this.readInt32(offset + 4);
        return float64[0];
      }
      writeInt8(offset, value) {
        this.bytes_[offset] = value;
      }
      writeUint8(offset, value) {
        this.bytes_[offset] = value;
      }
      writeInt16(offset, value) {
        this.bytes_[offset] = value;
        this.bytes_[offset + 1] = value >> 8;
      }
      writeUint16(offset, value) {
        this.bytes_[offset] = value;
        this.bytes_[offset + 1] = value >> 8;
      }
      writeInt32(offset, value) {
        this.bytes_[offset] = value;
        this.bytes_[offset + 1] = value >> 8;
        this.bytes_[offset + 2] = value >> 16;
        this.bytes_[offset + 3] = value >> 24;
      }
      writeUint32(offset, value) {
        this.bytes_[offset] = value;
        this.bytes_[offset + 1] = value >> 8;
        this.bytes_[offset + 2] = value >> 16;
        this.bytes_[offset + 3] = value >> 24;
      }
      writeInt64(offset, value) {
        this.writeInt32(offset, value.low);
        this.writeInt32(offset + 4, value.high);
      }
      writeUint64(offset, value) {
        this.writeUint32(offset, value.low);
        this.writeUint32(offset + 4, value.high);
      }
      writeFloat32(offset, value) {
        float32[0] = value;
        this.writeInt32(offset, int32[0]);
      }
      writeFloat64(offset, value) {
        float64[0] = value;
        this.writeInt32(offset, int32[isLittleEndian ? 0 : 1]);
        this.writeInt32(offset + 4, int32[isLittleEndian ? 1 : 0]);
      }
      /**
       * Return the file identifier.   Behavior is undefined for FlatBuffers whose
       * schema does not include a file_identifier (likely points at padding or the
       * start of a the root vtable).
       */
      getBufferIdentifier() {
        if (
          this.bytes_.length <
          this.position_ + SIZEOF_INT + FILE_IDENTIFIER_LENGTH
        ) {
          throw new Error(
            "FlatBuffers: ByteBuffer is too short to contain an identifier.",
          );
        }
        let result = "";
        for (let i = 0; i < FILE_IDENTIFIER_LENGTH; i++) {
          result += String.fromCharCode(
            this.readInt8(this.position_ + SIZEOF_INT + i),
          );
        }
        return result;
      }
      /**
       * Look up a field in the vtable, return an offset into the object, or 0 if the
       * field is not present.
       */
      __offset(bb_pos, vtable_offset) {
        const vtable = bb_pos - this.readInt32(bb_pos);
        return vtable_offset < this.readInt16(vtable)
          ? this.readInt16(vtable + vtable_offset)
          : 0;
      }
      /**
       * Initialize any Table-derived type to point to the union at the given offset.
       */
      __union(t, offset) {
        t.bb_pos = offset + this.readInt32(offset);
        t.bb = this;
        return t;
      }
      /**
       * Create a JavaScript string from UTF-8 data stored inside the FlatBuffer.
       * This allocates a new string and converts to wide chars upon each access.
       *
       * To avoid the conversion to UTF-16, pass Encoding.UTF8_BYTES as
       * the "optionalEncoding" argument. This is useful for avoiding conversion to
       * and from UTF-16 when the data will just be packaged back up in another
       * FlatBuffer later on.
       *
       * @param offset
       * @param opt_encoding Defaults to UTF16_STRING
       */
      __string(offset, opt_encoding) {
        offset += this.readInt32(offset);
        const length = this.readInt32(offset);
        let result = "";
        let i = 0;
        offset += SIZEOF_INT;
        if (opt_encoding === Encoding.UTF8_BYTES) {
          return this.bytes_.subarray(offset, offset + length);
        }
        while (i < length) {
          let codePoint;
          // Decode UTF-8
          const a = this.readUint8(offset + i++);
          if (a < 0xc0) {
            codePoint = a;
          } else {
            const b = this.readUint8(offset + i++);
            if (a < 0xe0) {
              codePoint = ((a & 0x1f) << 6) | (b & 0x3f);
            } else {
              const c = this.readUint8(offset + i++);
              if (a < 0xf0) {
                codePoint = ((a & 0x0f) << 12) | ((b & 0x3f) << 6) | (c & 0x3f);
              } else {
                const d = this.readUint8(offset + i++);
                codePoint =
                  ((a & 0x07) << 18) |
                  ((b & 0x3f) << 12) |
                  ((c & 0x3f) << 6) |
                  (d & 0x3f);
              }
            }
          }
          // Encode UTF-16
          if (codePoint < 0x10000) {
            result += String.fromCharCode(codePoint);
          } else {
            codePoint -= 0x10000;
            result += String.fromCharCode(
              (codePoint >> 10) + 0xd800,
              (codePoint & ((1 << 10) - 1)) + 0xdc00,
            );
          }
        }
        return result;
      }
      /**
       * Handle unions that can contain string as its member, if a Table-derived type then initialize it,
       * if a string then return a new one
       *
       * WARNING: strings are immutable in JS so we can't change the string that the user gave us, this
       * makes the behaviour of __union_with_string different compared to __union
       */
      __union_with_string(o, offset) {
        if (typeof o === "string") {
          return this.__string(offset);
        }
        return this.__union(o, offset);
      }
      /**
       * Retrieve the relative offset stored at "offset"
       */
      __indirect(offset) {
        return offset + this.readInt32(offset);
      }
      /**
       * Get the start of data of a vector whose offset is stored at "offset" in this object.
       */
      __vector(offset) {
        return offset + this.readInt32(offset) + SIZEOF_INT; // data starts after the length
      }
      /**
       * Get the length of a vector whose offset is stored at "offset" in this object.
       */
      __vector_len(offset) {
        return this.readInt32(offset + this.readInt32(offset));
      }
      __has_identifier(ident) {
        if (ident.length != FILE_IDENTIFIER_LENGTH) {
          throw new Error(
            "FlatBuffers: file identifier must be length " +
              FILE_IDENTIFIER_LENGTH,
          );
        }
        for (let i = 0; i < FILE_IDENTIFIER_LENGTH; i++) {
          if (
            ident.charCodeAt(i) !=
            this.readInt8(this.position() + SIZEOF_INT + i)
          ) {
            return false;
          }
        }
        return true;
      }
      /**
       * A helper function to avoid generated code depending on this file directly.
       */
      createLong(low, high) {
        return Long.create(low, high);
      }
      /**
       * A helper function for generating list for obj api
       */
      createScalarList(listAccessor, listLength) {
        const ret = [];
        for (let i = 0; i < listLength; ++i) {
          if (listAccessor(i) !== null) {
            ret.push(listAccessor(i));
          }
        }
        return ret;
      }
      /**
       * A helper function for generating list for obj api
       * @param listAccessor function that accepts an index and return data at that index
       * @param listLength listLength
       * @param res result list
       */
      createObjList(listAccessor, listLength) {
        const ret = [];
        for (let i = 0; i < listLength; ++i) {
          const val = listAccessor(i);
          if (val !== null) {
            ret.push(val.unpack());
          }
        }
        return ret;
      }
    } // CONCATENATED MODULE: ./node_modules/flatbuffers/mjs/builder.js

    class builder_Builder {
      /**
       * Create a FlatBufferBuilder.
       */
      constructor(opt_initial_size) {
        /** Minimum alignment encountered so far. */
        this.minalign = 1;
        /** The vtable for the current table. */
        this.vtable = null;
        /** The amount of fields we're actually using. */
        this.vtable_in_use = 0;
        /** Whether we are currently serializing a table. */
        this.isNested = false;
        /** Starting offset of the current struct/table. */
        this.object_start = 0;
        /** List of offsets of all vtables. */
        this.vtables = [];
        /** For the current vector being built. */
        this.vector_num_elems = 0;
        /** False omits default values from the serialized data */
        this.force_defaults = false;
        this.string_maps = null;
        let initial_size;
        if (!opt_initial_size) {
          initial_size = 1024;
        } else {
          initial_size = opt_initial_size;
        }
        /**
         * @type {ByteBuffer}
         * @private
         */
        this.bb = ByteBuffer.allocate(initial_size);
        this.space = initial_size;
      }
      clear() {
        this.bb.clear();
        this.space = this.bb.capacity();
        this.minalign = 1;
        this.vtable = null;
        this.vtable_in_use = 0;
        this.isNested = false;
        this.object_start = 0;
        this.vtables = [];
        this.vector_num_elems = 0;
        this.force_defaults = false;
        this.string_maps = null;
      }
      /**
       * In order to save space, fields that are set to their default value
       * don't get serialized into the buffer. Forcing defaults provides a
       * way to manually disable this optimization.
       *
       * @param forceDefaults true always serializes default values
       */
      forceDefaults(forceDefaults) {
        this.force_defaults = forceDefaults;
      }
      /**
       * Get the ByteBuffer representing the FlatBuffer. Only call this after you've
       * called finish(). The actual data starts at the ByteBuffer's current position,
       * not necessarily at 0.
       */
      dataBuffer() {
        return this.bb;
      }
      /**
       * Get the bytes representing the FlatBuffer. Only call this after you've
       * called finish().
       */
      asUint8Array() {
        return this.bb
          .bytes()
          .subarray(this.bb.position(), this.bb.position() + this.offset());
      }
      /**
       * Prepare to write an element of `size` after `additional_bytes` have been
       * written, e.g. if you write a string, you need to align such the int length
       * field is aligned to 4 bytes, and the string data follows it directly. If all
       * you need to do is alignment, `additional_bytes` will be 0.
       *
       * @param size This is the of the new element to write
       * @param additional_bytes The padding size
       */
      prep(size, additional_bytes) {
        // Track the biggest thing we've ever aligned to.
        if (size > this.minalign) {
          this.minalign = size;
        }
        // Find the amount of alignment needed such that `size` is properly
        // aligned after `additional_bytes`
        const align_size =
          (~(this.bb.capacity() - this.space + additional_bytes) + 1) &
          (size - 1);
        // Reallocate the buffer if needed.
        while (this.space < align_size + size + additional_bytes) {
          const old_buf_size = this.bb.capacity();
          this.bb = builder_Builder.growByteBuffer(this.bb);
          this.space += this.bb.capacity() - old_buf_size;
        }
        this.pad(align_size);
      }
      pad(byte_size) {
        for (let i = 0; i < byte_size; i++) {
          this.bb.writeInt8(--this.space, 0);
        }
      }
      writeInt8(value) {
        this.bb.writeInt8((this.space -= 1), value);
      }
      writeInt16(value) {
        this.bb.writeInt16((this.space -= 2), value);
      }
      writeInt32(value) {
        this.bb.writeInt32((this.space -= 4), value);
      }
      writeInt64(value) {
        this.bb.writeInt64((this.space -= 8), value);
      }
      writeFloat32(value) {
        this.bb.writeFloat32((this.space -= 4), value);
      }
      writeFloat64(value) {
        this.bb.writeFloat64((this.space -= 8), value);
      }
      /**
       * Add an `int8` to the buffer, properly aligned, and grows the buffer (if necessary).
       * @param value The `int8` to add the the buffer.
       */
      addInt8(value) {
        this.prep(1, 0);
        this.writeInt8(value);
      }
      /**
       * Add an `int16` to the buffer, properly aligned, and grows the buffer (if necessary).
       * @param value The `int16` to add the the buffer.
       */
      addInt16(value) {
        this.prep(2, 0);
        this.writeInt16(value);
      }
      /**
       * Add an `int32` to the buffer, properly aligned, and grows the buffer (if necessary).
       * @param value The `int32` to add the the buffer.
       */
      addInt32(value) {
        this.prep(4, 0);
        this.writeInt32(value);
      }
      /**
       * Add an `int64` to the buffer, properly aligned, and grows the buffer (if necessary).
       * @param value The `int64` to add the the buffer.
       */
      addInt64(value) {
        this.prep(8, 0);
        this.writeInt64(value);
      }
      /**
       * Add a `float32` to the buffer, properly aligned, and grows the buffer (if necessary).
       * @param value The `float32` to add the the buffer.
       */
      addFloat32(value) {
        this.prep(4, 0);
        this.writeFloat32(value);
      }
      /**
       * Add a `float64` to the buffer, properly aligned, and grows the buffer (if necessary).
       * @param value The `float64` to add the the buffer.
       */
      addFloat64(value) {
        this.prep(8, 0);
        this.writeFloat64(value);
      }
      addFieldInt8(voffset, value, defaultValue) {
        if (this.force_defaults || value != defaultValue) {
          this.addInt8(value);
          this.slot(voffset);
        }
      }
      addFieldInt16(voffset, value, defaultValue) {
        if (this.force_defaults || value != defaultValue) {
          this.addInt16(value);
          this.slot(voffset);
        }
      }
      addFieldInt32(voffset, value, defaultValue) {
        if (this.force_defaults || value != defaultValue) {
          this.addInt32(value);
          this.slot(voffset);
        }
      }
      addFieldInt64(voffset, value, defaultValue) {
        if (this.force_defaults || !value.equals(defaultValue)) {
          this.addInt64(value);
          this.slot(voffset);
        }
      }
      addFieldFloat32(voffset, value, defaultValue) {
        if (this.force_defaults || value != defaultValue) {
          this.addFloat32(value);
          this.slot(voffset);
        }
      }
      addFieldFloat64(voffset, value, defaultValue) {
        if (this.force_defaults || value != defaultValue) {
          this.addFloat64(value);
          this.slot(voffset);
        }
      }
      addFieldOffset(voffset, value, defaultValue) {
        if (this.force_defaults || value != defaultValue) {
          this.addOffset(value);
          this.slot(voffset);
        }
      }
      /**
       * Structs are stored inline, so nothing additional is being added. `d` is always 0.
       */
      addFieldStruct(voffset, value, defaultValue) {
        if (value != defaultValue) {
          this.nested(value);
          this.slot(voffset);
        }
      }
      /**
       * Structures are always stored inline, they need to be created right
       * where they're used.  You'll get this assertion failure if you
       * created it elsewhere.
       */
      nested(obj) {
        if (obj != this.offset()) {
          throw new Error("FlatBuffers: struct must be serialized inline.");
        }
      }
      /**
       * Should not be creating any other object, string or vector
       * while an object is being constructed
       */
      notNested() {
        if (this.isNested) {
          throw new Error(
            "FlatBuffers: object serialization must not be nested.",
          );
        }
      }
      /**
       * Set the current vtable at `voffset` to the current location in the buffer.
       */
      slot(voffset) {
        if (this.vtable !== null) this.vtable[voffset] = this.offset();
      }
      /**
       * @returns Offset relative to the end of the buffer.
       */
      offset() {
        return this.bb.capacity() - this.space;
      }
      /**
       * Doubles the size of the backing ByteBuffer and copies the old data towards
       * the end of the new buffer (since we build the buffer backwards).
       *
       * @param bb The current buffer with the existing data
       * @returns A new byte buffer with the old data copied
       * to it. The data is located at the end of the buffer.
       *
       * uint8Array.set() formally takes {Array<number>|ArrayBufferView}, so to pass
       * it a uint8Array we need to suppress the type check:
       * @suppress {checkTypes}
       */
      static growByteBuffer(bb) {
        const old_buf_size = bb.capacity();
        // Ensure we don't grow beyond what fits in an int.
        if (old_buf_size & 0xc0000000) {
          throw new Error(
            "FlatBuffers: cannot grow buffer beyond 2 gigabytes.",
          );
        }
        const new_buf_size = old_buf_size << 1;
        const nbb = ByteBuffer.allocate(new_buf_size);
        nbb.setPosition(new_buf_size - old_buf_size);
        nbb.bytes().set(bb.bytes(), new_buf_size - old_buf_size);
        return nbb;
      }
      /**
       * Adds on offset, relative to where it will be written.
       *
       * @param offset The offset to add.
       */
      addOffset(offset) {
        this.prep(SIZEOF_INT, 0); // Ensure alignment is already done.
        this.writeInt32(this.offset() - offset + SIZEOF_INT);
      }
      /**
       * Start encoding a new object in the buffer.  Users will not usually need to
       * call this directly. The FlatBuffers compiler will generate helper methods
       * that call this method internally.
       */
      startObject(numfields) {
        this.notNested();
        if (this.vtable == null) {
          this.vtable = [];
        }
        this.vtable_in_use = numfields;
        for (let i = 0; i < numfields; i++) {
          this.vtable[i] = 0; // This will push additional elements as needed
        }
        this.isNested = true;
        this.object_start = this.offset();
      }
      /**
       * Finish off writing the object that is under construction.
       *
       * @returns The offset to the object inside `dataBuffer`
       */
      endObject() {
        if (this.vtable == null || !this.isNested) {
          throw new Error("FlatBuffers: endObject called without startObject");
        }
        this.addInt32(0);
        const vtableloc = this.offset();
        // Trim trailing zeroes.
        let i = this.vtable_in_use - 1;
        // eslint-disable-next-line no-empty
        for (; i >= 0 && this.vtable[i] == 0; i--) {}
        const trimmed_size = i + 1;
        // Write out the current vtable.
        for (; i >= 0; i--) {
          // Offset relative to the start of the table.
          this.addInt16(this.vtable[i] != 0 ? vtableloc - this.vtable[i] : 0);
        }
        const standard_fields = 2; // The fields below:
        this.addInt16(vtableloc - this.object_start);
        const len = (trimmed_size + standard_fields) * SIZEOF_SHORT;
        this.addInt16(len);
        // Search for an existing vtable that matches the current one.
        let existing_vtable = 0;
        const vt1 = this.space;
        outer_loop: for (i = 0; i < this.vtables.length; i++) {
          const vt2 = this.bb.capacity() - this.vtables[i];
          if (len == this.bb.readInt16(vt2)) {
            for (let j = SIZEOF_SHORT; j < len; j += SIZEOF_SHORT) {
              if (this.bb.readInt16(vt1 + j) != this.bb.readInt16(vt2 + j)) {
                continue outer_loop;
              }
            }
            existing_vtable = this.vtables[i];
            break;
          }
        }
        if (existing_vtable) {
          // Found a match:
          // Remove the current vtable.
          this.space = this.bb.capacity() - vtableloc;
          // Point table to existing vtable.
          this.bb.writeInt32(this.space, existing_vtable - vtableloc);
        } else {
          // No match:
          // Add the location of the current vtable to the list of vtables.
          this.vtables.push(this.offset());
          // Point table to current vtable.
          this.bb.writeInt32(
            this.bb.capacity() - vtableloc,
            this.offset() - vtableloc,
          );
        }
        this.isNested = false;
        return vtableloc;
      }
      /**
       * Finalize a buffer, poiting to the given `root_table`.
       */
      finish(root_table, opt_file_identifier, opt_size_prefix) {
        const size_prefix = opt_size_prefix ? SIZE_PREFIX_LENGTH : 0;
        if (opt_file_identifier) {
          const file_identifier = opt_file_identifier;
          this.prep(
            this.minalign,
            SIZEOF_INT + FILE_IDENTIFIER_LENGTH + size_prefix,
          );
          if (file_identifier.length != FILE_IDENTIFIER_LENGTH) {
            throw new Error(
              "FlatBuffers: file identifier must be length " +
                FILE_IDENTIFIER_LENGTH,
            );
          }
          for (let i = FILE_IDENTIFIER_LENGTH - 1; i >= 0; i--) {
            this.writeInt8(file_identifier.charCodeAt(i));
          }
        }
        this.prep(this.minalign, SIZEOF_INT + size_prefix);
        this.addOffset(root_table);
        if (size_prefix) {
          this.addInt32(this.bb.capacity() - this.space);
        }
        this.bb.setPosition(this.space);
      }
      /**
       * Finalize a size prefixed buffer, pointing to the given `root_table`.
       */
      finishSizePrefixed(root_table, opt_file_identifier) {
        this.finish(root_table, opt_file_identifier, true);
      }
      /**
       * This checks a required field has been set in a given table that has
       * just been constructed.
       */
      requiredField(table, field) {
        const table_start = this.bb.capacity() - table;
        const vtable_start = table_start - this.bb.readInt32(table_start);
        const ok = this.bb.readInt16(vtable_start + field) != 0;
        // If this fails, the caller will show what field needs to be set.
        if (!ok) {
          throw new Error("FlatBuffers: field " + field + " must be set");
        }
      }
      /**
       * Start a new array/vector of objects.  Users usually will not call
       * this directly. The FlatBuffers compiler will create a start/end
       * method for vector types in generated code.
       *
       * @param elem_size The size of each element in the array
       * @param num_elems The number of elements in the array
       * @param alignment The alignment of the array
       */
      startVector(elem_size, num_elems, alignment) {
        this.notNested();
        this.vector_num_elems = num_elems;
        this.prep(SIZEOF_INT, elem_size * num_elems);
        this.prep(alignment, elem_size * num_elems); // Just in case alignment > int.
      }
      /**
       * Finish off the creation of an array and all its elements. The array must be
       * created with `startVector`.
       *
       * @returns The offset at which the newly created array
       * starts.
       */
      endVector() {
        this.writeInt32(this.vector_num_elems);
        return this.offset();
      }
      /**
       * Encode the string `s` in the buffer using UTF-8. If the string passed has
       * already been seen, we return the offset of the already written string
       *
       * @param s The string to encode
       * @return The offset in the buffer where the encoded string starts
       */
      createSharedString(s) {
        if (!s) {
          return 0;
        }
        if (!this.string_maps) {
          this.string_maps = new Map();
        }
        if (this.string_maps.has(s)) {
          return this.string_maps.get(s);
        }
        const offset = this.createString(s);
        this.string_maps.set(s, offset);
        return offset;
      }
      /**
       * Encode the string `s` in the buffer using UTF-8. If a Uint8Array is passed
       * instead of a string, it is assumed to contain valid UTF-8 encoded data.
       *
       * @param s The string to encode
       * @return The offset in the buffer where the encoded string starts
       */
      createString(s) {
        if (!s) {
          return 0;
        }
        let utf8;
        if (s instanceof Uint8Array) {
          utf8 = s;
        } else {
          utf8 = [];
          let i = 0;
          while (i < s.length) {
            let codePoint;
            // Decode UTF-16
            const a = s.charCodeAt(i++);
            if (a < 0xd800 || a >= 0xdc00) {
              codePoint = a;
            } else {
              const b = s.charCodeAt(i++);
              codePoint = (a << 10) + b + (0x10000 - (0xd800 << 10) - 0xdc00);
            }
            // Encode UTF-8
            if (codePoint < 0x80) {
              utf8.push(codePoint);
            } else {
              if (codePoint < 0x800) {
                utf8.push(((codePoint >> 6) & 0x1f) | 0xc0);
              } else {
                if (codePoint < 0x10000) {
                  utf8.push(((codePoint >> 12) & 0x0f) | 0xe0);
                } else {
                  utf8.push(
                    ((codePoint >> 18) & 0x07) | 0xf0,
                    ((codePoint >> 12) & 0x3f) | 0x80,
                  );
                }
                utf8.push(((codePoint >> 6) & 0x3f) | 0x80);
              }
              utf8.push((codePoint & 0x3f) | 0x80);
            }
          }
        }
        this.addInt8(0);
        this.startVector(1, utf8.length, 1);
        this.bb.setPosition((this.space -= utf8.length));
        for (
          let i = 0, offset = this.space, bytes = this.bb.bytes();
          i < utf8.length;
          i++
        ) {
          bytes[offset++] = utf8[i];
        }
        return this.endVector();
      }
      /**
       * A helper function to avoid generated code depending on this file directly.
       */
      createLong(low, high) {
        return Long.create(low, high);
      }
      /**
       * A helper function to pack an object
       *
       * @returns offset of obj
       */
      createObjectOffset(obj) {
        if (obj === null) {
          return 0;
        }
        if (typeof obj === "string") {
          return this.createString(obj);
        } else {
          return obj.pack(this);
        }
      }
      /**
       * A helper function to pack a list of object
       *
       * @returns list of offsets of each non null object
       */
      createObjectOffsetList(list) {
        const ret = [];
        for (let i = 0; i < list.length; ++i) {
          const val = list[i];
          if (val !== null) {
            ret.push(this.createObjectOffset(val));
          } else {
            throw new Error(
              "FlatBuffers: Argument for createObjectOffsetList cannot contain null.",
            );
          }
        }
        return ret;
      }
      createStructOffsetList(list, startFunc) {
        startFunc(this, list.length);
        this.createObjectOffsetList(list);
        return this.endVector();
      }
    } // CONCATENATED MODULE: ./node_modules/flatbuffers/mjs/flatbuffers.js // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/key-value.mjs

    // automatically generated by the FlatBuffers compiler, do not modify

    /**
     * ----------------------------------------------------------------------
     * user defined key value pairs to add custom metadata to arrow
     * key namespacing is the responsibility of the user
     */
    class KeyValue {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsKeyValue(bb, obj) {
        return (obj || new KeyValue()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsKeyValue(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new KeyValue()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      key(optionalEncoding) {
        const offset = this.bb.__offset(this.bb_pos, 4);
        return offset
          ? this.bb.__string(this.bb_pos + offset, optionalEncoding)
          : null;
      }
      value(optionalEncoding) {
        const offset = this.bb.__offset(this.bb_pos, 6);
        return offset
          ? this.bb.__string(this.bb_pos + offset, optionalEncoding)
          : null;
      }
      static startKeyValue(builder) {
        builder.startObject(2);
      }
      static addKey(builder, keyOffset) {
        builder.addFieldOffset(0, keyOffset, 0);
      }
      static addValue(builder, valueOffset) {
        builder.addFieldOffset(1, valueOffset, 0);
      }
      static endKeyValue(builder) {
        const offset = builder.endObject();
        return offset;
      }
      static createKeyValue(builder, keyOffset, valueOffset) {
        KeyValue.startKeyValue(builder);
        KeyValue.addKey(builder, keyOffset);
        KeyValue.addValue(builder, valueOffset);
        return KeyValue.endKeyValue(builder);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/metadata-version.mjs

    //# sourceMappingURL=key-value.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify
    /**
     * Logical types, vector layouts, and schemas
     * Format Version History.
     * Version 1.0 - Forward and backwards compatibility guaranteed.
     * Version 1.1 - Add Decimal256 (No format release).
     * Version 1.2 (Pending)- Add Interval MONTH_DAY_NANO
     */
    var metadata_version_MetadataVersion;
    (function (MetadataVersion) {
      /**
       * 0.1.0 (October 2016).
       */
      MetadataVersion[(MetadataVersion["V1"] = 0)] = "V1";
      /**
       * 0.2.0 (February 2017). Non-backwards compatible with V1.
       */
      MetadataVersion[(MetadataVersion["V2"] = 1)] = "V2";
      /**
       * 0.3.0 -> 0.7.1 (May - December 2017). Non-backwards compatible with V2.
       */
      MetadataVersion[(MetadataVersion["V3"] = 2)] = "V3";
      /**
       * >= 0.8.0 (December 2017). Non-backwards compatible with V3.
       */
      MetadataVersion[(MetadataVersion["V4"] = 3)] = "V4";
      /**
       * >= 1.0.0 (July 2020. Backwards compatible with V4 (V5 readers can read V4
       * metadata and IPC messages). Implementations are recommended to provide a
       * V4 compatibility mode with V5 format changes disabled.
       *
       * Incompatible changes between V4 and V5:
       * - Union buffer layout has changed. In V5, Unions don't have a validity
       *   bitmap buffer.
       */
      MetadataVersion[(MetadataVersion["V5"] = 4)] = "V5";
    })(
      metadata_version_MetadataVersion ||
        (metadata_version_MetadataVersion = {}),
    ); // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/endianness.mjs

    //# sourceMappingURL=metadata-version.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify
    /**
     * ----------------------------------------------------------------------
     * Endianness of the platform producing the data
     */
    var Endianness;
    (function (Endianness) {
      Endianness[(Endianness["Little"] = 0)] = "Little";
      Endianness[(Endianness["Big"] = 1)] = "Big";
    })(Endianness || (Endianness = {})); // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/dictionary-kind.mjs

    //# sourceMappingURL=endianness.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify
    /**
     * ----------------------------------------------------------------------
     * Dictionary encoding metadata
     * Maintained for forwards compatibility, in the future
     * Dictionaries might be explicit maps between integers and values
     * allowing for non-contiguous index values
     */
    var DictionaryKind;
    (function (DictionaryKind) {
      DictionaryKind[(DictionaryKind["DenseArray"] = 0)] = "DenseArray";
    })(DictionaryKind || (DictionaryKind = {})); // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/int.mjs

    //# sourceMappingURL=dictionary-kind.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    class Int {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsInt(bb, obj) {
        return (obj || new Int()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsInt(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new Int()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      bitWidth() {
        const offset = this.bb.__offset(this.bb_pos, 4);
        return offset ? this.bb.readInt32(this.bb_pos + offset) : 0;
      }
      isSigned() {
        const offset = this.bb.__offset(this.bb_pos, 6);
        return offset ? !!this.bb.readInt8(this.bb_pos + offset) : false;
      }
      static startInt(builder) {
        builder.startObject(2);
      }
      static addBitWidth(builder, bitWidth) {
        builder.addFieldInt32(0, bitWidth, 0);
      }
      static addIsSigned(builder, isSigned) {
        builder.addFieldInt8(1, +isSigned, +false);
      }
      static endInt(builder) {
        const offset = builder.endObject();
        return offset;
      }
      static createInt(builder, bitWidth, isSigned) {
        Int.startInt(builder);
        Int.addBitWidth(builder, bitWidth);
        Int.addIsSigned(builder, isSigned);
        return Int.endInt(builder);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/dictionary-encoding.mjs

    //# sourceMappingURL=int.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    class DictionaryEncoding {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsDictionaryEncoding(bb, obj) {
        return (obj || new DictionaryEncoding()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsDictionaryEncoding(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new DictionaryEncoding()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      /**
       * The known dictionary id in the application where this data is used. In
       * the file or streaming formats, the dictionary ids are found in the
       * DictionaryBatch messages
       */
      id() {
        const offset = this.bb.__offset(this.bb_pos, 4);
        return offset
          ? this.bb.readInt64(this.bb_pos + offset)
          : this.bb.createLong(0, 0);
      }
      /**
       * The dictionary indices are constrained to be non-negative integers. If
       * this field is null, the indices must be signed int32. To maximize
       * cross-language compatibility and performance, implementations are
       * recommended to prefer signed integer types over unsigned integer types
       * and to avoid uint64 indices unless they are required by an application.
       */
      indexType(obj) {
        const offset = this.bb.__offset(this.bb_pos, 6);
        return offset
          ? (obj || new Int()).__init(
              this.bb.__indirect(this.bb_pos + offset),
              this.bb,
            )
          : null;
      }
      /**
       * By default, dictionaries are not ordered, or the order does not have
       * semantic meaning. In some statistical, applications, dictionary-encoding
       * is used to represent ordered categorical data, and we provide a way to
       * preserve that metadata here
       */
      isOrdered() {
        const offset = this.bb.__offset(this.bb_pos, 8);
        return offset ? !!this.bb.readInt8(this.bb_pos + offset) : false;
      }
      dictionaryKind() {
        const offset = this.bb.__offset(this.bb_pos, 10);
        return offset
          ? this.bb.readInt16(this.bb_pos + offset)
          : DictionaryKind.DenseArray;
      }
      static startDictionaryEncoding(builder) {
        builder.startObject(4);
      }
      static addId(builder, id) {
        builder.addFieldInt64(0, id, builder.createLong(0, 0));
      }
      static addIndexType(builder, indexTypeOffset) {
        builder.addFieldOffset(1, indexTypeOffset, 0);
      }
      static addIsOrdered(builder, isOrdered) {
        builder.addFieldInt8(2, +isOrdered, +false);
      }
      static addDictionaryKind(builder, dictionaryKind) {
        builder.addFieldInt16(3, dictionaryKind, DictionaryKind.DenseArray);
      }
      static endDictionaryEncoding(builder) {
        const offset = builder.endObject();
        return offset;
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/binary.mjs

    //# sourceMappingURL=dictionary-encoding.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    /**
     * Opaque binary data
     */
    class binary_Binary {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsBinary(bb, obj) {
        return (obj || new binary_Binary()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsBinary(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new binary_Binary()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static startBinary(builder) {
        builder.startObject(0);
      }
      static endBinary(builder) {
        const offset = builder.endObject();
        return offset;
      }
      static createBinary(builder) {
        binary_Binary.startBinary(builder);
        return binary_Binary.endBinary(builder);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/bool.mjs

    //# sourceMappingURL=binary.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    class bool_Bool {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsBool(bb, obj) {
        return (obj || new bool_Bool()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsBool(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new bool_Bool()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static startBool(builder) {
        builder.startObject(0);
      }
      static endBool(builder) {
        const offset = builder.endObject();
        return offset;
      }
      static createBool(builder) {
        bool_Bool.startBool(builder);
        return bool_Bool.endBool(builder);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/date-unit.mjs

    //# sourceMappingURL=bool.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify
    var date_unit_DateUnit;
    (function (DateUnit) {
      DateUnit[(DateUnit["DAY"] = 0)] = "DAY";
      DateUnit[(DateUnit["MILLISECOND"] = 1)] = "MILLISECOND";
    })(date_unit_DateUnit || (date_unit_DateUnit = {})); // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/date.mjs

    //# sourceMappingURL=date-unit.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    /**
     * Date is either a 32-bit or 64-bit signed integer type representing an
     * elapsed time since UNIX epoch (1970-01-01), stored in either of two units:
     *
     * * Milliseconds (64 bits) indicating UNIX time elapsed since the epoch (no
     *   leap seconds), where the values are evenly divisible by 86400000
     * * Days (32 bits) since the UNIX epoch
     */
    class date_Date {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsDate(bb, obj) {
        return (obj || new date_Date()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsDate(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new date_Date()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      unit() {
        const offset = this.bb.__offset(this.bb_pos, 4);
        return offset
          ? this.bb.readInt16(this.bb_pos + offset)
          : date_unit_DateUnit.MILLISECOND;
      }
      static startDate(builder) {
        builder.startObject(1);
      }
      static addUnit(builder, unit) {
        builder.addFieldInt16(0, unit, date_unit_DateUnit.MILLISECOND);
      }
      static endDate(builder) {
        const offset = builder.endObject();
        return offset;
      }
      static createDate(builder, unit) {
        date_Date.startDate(builder);
        date_Date.addUnit(builder, unit);
        return date_Date.endDate(builder);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/decimal.mjs

    //# sourceMappingURL=date.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    /**
     * Exact decimal value represented as an integer value in two's
     * complement. Currently only 128-bit (16-byte) and 256-bit (32-byte) integers
     * are used. The representation uses the endianness indicated
     * in the Schema.
     */
    class decimal_Decimal {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsDecimal(bb, obj) {
        return (obj || new decimal_Decimal()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsDecimal(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new decimal_Decimal()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      /**
       * Total number of decimal digits
       */
      precision() {
        const offset = this.bb.__offset(this.bb_pos, 4);
        return offset ? this.bb.readInt32(this.bb_pos + offset) : 0;
      }
      /**
       * Number of digits after the decimal point "."
       */
      scale() {
        const offset = this.bb.__offset(this.bb_pos, 6);
        return offset ? this.bb.readInt32(this.bb_pos + offset) : 0;
      }
      /**
       * Number of bits per value. The only accepted widths are 128 and 256.
       * We use bitWidth for consistency with Int::bitWidth.
       */
      bitWidth() {
        const offset = this.bb.__offset(this.bb_pos, 8);
        return offset ? this.bb.readInt32(this.bb_pos + offset) : 128;
      }
      static startDecimal(builder) {
        builder.startObject(3);
      }
      static addPrecision(builder, precision) {
        builder.addFieldInt32(0, precision, 0);
      }
      static addScale(builder, scale) {
        builder.addFieldInt32(1, scale, 0);
      }
      static addBitWidth(builder, bitWidth) {
        builder.addFieldInt32(2, bitWidth, 128);
      }
      static endDecimal(builder) {
        const offset = builder.endObject();
        return offset;
      }
      static createDecimal(builder, precision, scale, bitWidth) {
        decimal_Decimal.startDecimal(builder);
        decimal_Decimal.addPrecision(builder, precision);
        decimal_Decimal.addScale(builder, scale);
        decimal_Decimal.addBitWidth(builder, bitWidth);
        return decimal_Decimal.endDecimal(builder);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/time-unit.mjs

    //# sourceMappingURL=decimal.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify
    var time_unit_TimeUnit;
    (function (TimeUnit) {
      TimeUnit[(TimeUnit["SECOND"] = 0)] = "SECOND";
      TimeUnit[(TimeUnit["MILLISECOND"] = 1)] = "MILLISECOND";
      TimeUnit[(TimeUnit["MICROSECOND"] = 2)] = "MICROSECOND";
      TimeUnit[(TimeUnit["NANOSECOND"] = 3)] = "NANOSECOND";
    })(time_unit_TimeUnit || (time_unit_TimeUnit = {})); // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/duration.mjs

    //# sourceMappingURL=time-unit.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    class Duration {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsDuration(bb, obj) {
        return (obj || new Duration()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsDuration(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new Duration()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      unit() {
        const offset = this.bb.__offset(this.bb_pos, 4);
        return offset
          ? this.bb.readInt16(this.bb_pos + offset)
          : time_unit_TimeUnit.MILLISECOND;
      }
      static startDuration(builder) {
        builder.startObject(1);
      }
      static addUnit(builder, unit) {
        builder.addFieldInt16(0, unit, time_unit_TimeUnit.MILLISECOND);
      }
      static endDuration(builder) {
        const offset = builder.endObject();
        return offset;
      }
      static createDuration(builder, unit) {
        Duration.startDuration(builder);
        Duration.addUnit(builder, unit);
        return Duration.endDuration(builder);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/fixed-size-binary.mjs

    //# sourceMappingURL=duration.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    class fixed_size_binary_FixedSizeBinary {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsFixedSizeBinary(bb, obj) {
        return (obj || new fixed_size_binary_FixedSizeBinary()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsFixedSizeBinary(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new fixed_size_binary_FixedSizeBinary()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      /**
       * Number of bytes per value
       */
      byteWidth() {
        const offset = this.bb.__offset(this.bb_pos, 4);
        return offset ? this.bb.readInt32(this.bb_pos + offset) : 0;
      }
      static startFixedSizeBinary(builder) {
        builder.startObject(1);
      }
      static addByteWidth(builder, byteWidth) {
        builder.addFieldInt32(0, byteWidth, 0);
      }
      static endFixedSizeBinary(builder) {
        const offset = builder.endObject();
        return offset;
      }
      static createFixedSizeBinary(builder, byteWidth) {
        fixed_size_binary_FixedSizeBinary.startFixedSizeBinary(builder);
        fixed_size_binary_FixedSizeBinary.addByteWidth(builder, byteWidth);
        return fixed_size_binary_FixedSizeBinary.endFixedSizeBinary(builder);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/fixed-size-list.mjs

    //# sourceMappingURL=fixed-size-binary.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    class fixed_size_list_FixedSizeList {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsFixedSizeList(bb, obj) {
        return (obj || new fixed_size_list_FixedSizeList()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsFixedSizeList(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new fixed_size_list_FixedSizeList()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      /**
       * Number of list items per value
       */
      listSize() {
        const offset = this.bb.__offset(this.bb_pos, 4);
        return offset ? this.bb.readInt32(this.bb_pos + offset) : 0;
      }
      static startFixedSizeList(builder) {
        builder.startObject(1);
      }
      static addListSize(builder, listSize) {
        builder.addFieldInt32(0, listSize, 0);
      }
      static endFixedSizeList(builder) {
        const offset = builder.endObject();
        return offset;
      }
      static createFixedSizeList(builder, listSize) {
        fixed_size_list_FixedSizeList.startFixedSizeList(builder);
        fixed_size_list_FixedSizeList.addListSize(builder, listSize);
        return fixed_size_list_FixedSizeList.endFixedSizeList(builder);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/precision.mjs

    //# sourceMappingURL=fixed-size-list.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify
    var precision_Precision;
    (function (Precision) {
      Precision[(Precision["HALF"] = 0)] = "HALF";
      Precision[(Precision["SINGLE"] = 1)] = "SINGLE";
      Precision[(Precision["DOUBLE"] = 2)] = "DOUBLE";
    })(precision_Precision || (precision_Precision = {})); // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/floating-point.mjs

    //# sourceMappingURL=precision.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    class FloatingPoint {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsFloatingPoint(bb, obj) {
        return (obj || new FloatingPoint()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsFloatingPoint(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new FloatingPoint()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      precision() {
        const offset = this.bb.__offset(this.bb_pos, 4);
        return offset
          ? this.bb.readInt16(this.bb_pos + offset)
          : precision_Precision.HALF;
      }
      static startFloatingPoint(builder) {
        builder.startObject(1);
      }
      static addPrecision(builder, precision) {
        builder.addFieldInt16(0, precision, precision_Precision.HALF);
      }
      static endFloatingPoint(builder) {
        const offset = builder.endObject();
        return offset;
      }
      static createFloatingPoint(builder, precision) {
        FloatingPoint.startFloatingPoint(builder);
        FloatingPoint.addPrecision(builder, precision);
        return FloatingPoint.endFloatingPoint(builder);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/interval-unit.mjs

    //# sourceMappingURL=floating-point.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify
    var interval_unit_IntervalUnit;
    (function (IntervalUnit) {
      IntervalUnit[(IntervalUnit["YEAR_MONTH"] = 0)] = "YEAR_MONTH";
      IntervalUnit[(IntervalUnit["DAY_TIME"] = 1)] = "DAY_TIME";
      IntervalUnit[(IntervalUnit["MONTH_DAY_NANO"] = 2)] = "MONTH_DAY_NANO";
    })(interval_unit_IntervalUnit || (interval_unit_IntervalUnit = {})); // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/interval.mjs

    //# sourceMappingURL=interval-unit.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    class Interval {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsInterval(bb, obj) {
        return (obj || new Interval()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsInterval(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new Interval()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      unit() {
        const offset = this.bb.__offset(this.bb_pos, 4);
        return offset
          ? this.bb.readInt16(this.bb_pos + offset)
          : interval_unit_IntervalUnit.YEAR_MONTH;
      }
      static startInterval(builder) {
        builder.startObject(1);
      }
      static addUnit(builder, unit) {
        builder.addFieldInt16(0, unit, interval_unit_IntervalUnit.YEAR_MONTH);
      }
      static endInterval(builder) {
        const offset = builder.endObject();
        return offset;
      }
      static createInterval(builder, unit) {
        Interval.startInterval(builder);
        Interval.addUnit(builder, unit);
        return Interval.endInterval(builder);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/large-binary.mjs

    //# sourceMappingURL=interval.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    /**
     * Same as Binary, but with 64-bit offsets, allowing to represent
     * extremely large data values.
     */
    class LargeBinary {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsLargeBinary(bb, obj) {
        return (obj || new LargeBinary()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsLargeBinary(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new LargeBinary()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static startLargeBinary(builder) {
        builder.startObject(0);
      }
      static endLargeBinary(builder) {
        const offset = builder.endObject();
        return offset;
      }
      static createLargeBinary(builder) {
        LargeBinary.startLargeBinary(builder);
        return LargeBinary.endLargeBinary(builder);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/large-list.mjs

    //# sourceMappingURL=large-binary.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    /**
     * Same as List, but with 64-bit offsets, allowing to represent
     * extremely large data values.
     */
    class LargeList {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsLargeList(bb, obj) {
        return (obj || new LargeList()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsLargeList(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new LargeList()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static startLargeList(builder) {
        builder.startObject(0);
      }
      static endLargeList(builder) {
        const offset = builder.endObject();
        return offset;
      }
      static createLargeList(builder) {
        LargeList.startLargeList(builder);
        return LargeList.endLargeList(builder);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/large-utf8.mjs

    //# sourceMappingURL=large-list.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    /**
     * Same as Utf8, but with 64-bit offsets, allowing to represent
     * extremely large data values.
     */
    class LargeUtf8 {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsLargeUtf8(bb, obj) {
        return (obj || new LargeUtf8()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsLargeUtf8(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new LargeUtf8()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static startLargeUtf8(builder) {
        builder.startObject(0);
      }
      static endLargeUtf8(builder) {
        const offset = builder.endObject();
        return offset;
      }
      static createLargeUtf8(builder) {
        LargeUtf8.startLargeUtf8(builder);
        return LargeUtf8.endLargeUtf8(builder);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/list.mjs

    //# sourceMappingURL=large-utf8.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    class list_List {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsList(bb, obj) {
        return (obj || new list_List()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsList(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new list_List()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static startList(builder) {
        builder.startObject(0);
      }
      static endList(builder) {
        const offset = builder.endObject();
        return offset;
      }
      static createList(builder) {
        list_List.startList(builder);
        return list_List.endList(builder);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/map.mjs

    //# sourceMappingURL=list.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    /**
     * A Map is a logical nested type that is represented as
     *
     * List<entries: Struct<key: K, value: V>>
     *
     * In this layout, the keys and values are each respectively contiguous. We do
     * not constrain the key and value types, so the application is responsible
     * for ensuring that the keys are hashable and unique. Whether the keys are sorted
     * may be set in the metadata for this field.
     *
     * In a field with Map type, the field has a child Struct field, which then
     * has two children: key type and the second the value type. The names of the
     * child fields may be respectively "entries", "key", and "value", but this is
     * not enforced.
     *
     * Map
     * ```text
     *   - child[0] entries: Struct
     *     - child[0] key: K
     *     - child[1] value: V
     * ```
     * Neither the "entries" field nor the "key" field may be nullable.
     *
     * The metadata is structured so that Arrow systems without special handling
     * for Map can make Map an alias for List. The "layout" attribute for the Map
     * field must have the same contents as a List.
     */
    class map_Map {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsMap(bb, obj) {
        return (obj || new map_Map()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsMap(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new map_Map()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      /**
       * Set to true if the keys within each value are sorted
       */
      keysSorted() {
        const offset = this.bb.__offset(this.bb_pos, 4);
        return offset ? !!this.bb.readInt8(this.bb_pos + offset) : false;
      }
      static startMap(builder) {
        builder.startObject(1);
      }
      static addKeysSorted(builder, keysSorted) {
        builder.addFieldInt8(0, +keysSorted, +false);
      }
      static endMap(builder) {
        const offset = builder.endObject();
        return offset;
      }
      static createMap(builder, keysSorted) {
        map_Map.startMap(builder);
        map_Map.addKeysSorted(builder, keysSorted);
        return map_Map.endMap(builder);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/null.mjs

    //# sourceMappingURL=map.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    /**
     * These are stored in the flatbuffer in the Type union below
     */
    class null_Null {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsNull(bb, obj) {
        return (obj || new null_Null()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsNull(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new null_Null()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static startNull(builder) {
        builder.startObject(0);
      }
      static endNull(builder) {
        const offset = builder.endObject();
        return offset;
      }
      static createNull(builder) {
        null_Null.startNull(builder);
        return null_Null.endNull(builder);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/struct_.mjs

    //# sourceMappingURL=null.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    /**
     * A Struct_ in the flatbuffer metadata is the same as an Arrow Struct
     * (according to the physical memory layout). We used Struct_ here as
     * Struct is a reserved word in Flatbuffers
     */
    class Struct_ {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsStruct_(bb, obj) {
        return (obj || new Struct_()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsStruct_(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new Struct_()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static startStruct_(builder) {
        builder.startObject(0);
      }
      static endStruct_(builder) {
        const offset = builder.endObject();
        return offset;
      }
      static createStruct_(builder) {
        Struct_.startStruct_(builder);
        return Struct_.endStruct_(builder);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/time.mjs

    //# sourceMappingURL=struct_.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    /**
     * Time is either a 32-bit or 64-bit signed integer type representing an
     * elapsed time since midnight, stored in either of four units: seconds,
     * milliseconds, microseconds or nanoseconds.
     *
     * The integer `bitWidth` depends on the `unit` and must be one of the following:
     * * SECOND and MILLISECOND: 32 bits
     * * MICROSECOND and NANOSECOND: 64 bits
     *
     * The allowed values are between 0 (inclusive) and 86400 (=24*60*60) seconds
     * (exclusive), adjusted for the time unit (for example, up to 86400000
     * exclusive for the MILLISECOND unit).
     * This definition doesn't allow for leap seconds. Time values from
     * measurements with leap seconds will need to be corrected when ingesting
     * into Arrow (for example by replacing the value 86400 with 86399).
     */
    class Time {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsTime(bb, obj) {
        return (obj || new Time()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsTime(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new Time()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      unit() {
        const offset = this.bb.__offset(this.bb_pos, 4);
        return offset
          ? this.bb.readInt16(this.bb_pos + offset)
          : time_unit_TimeUnit.MILLISECOND;
      }
      bitWidth() {
        const offset = this.bb.__offset(this.bb_pos, 6);
        return offset ? this.bb.readInt32(this.bb_pos + offset) : 32;
      }
      static startTime(builder) {
        builder.startObject(2);
      }
      static addUnit(builder, unit) {
        builder.addFieldInt16(0, unit, time_unit_TimeUnit.MILLISECOND);
      }
      static addBitWidth(builder, bitWidth) {
        builder.addFieldInt32(1, bitWidth, 32);
      }
      static endTime(builder) {
        const offset = builder.endObject();
        return offset;
      }
      static createTime(builder, unit, bitWidth) {
        Time.startTime(builder);
        Time.addUnit(builder, unit);
        Time.addBitWidth(builder, bitWidth);
        return Time.endTime(builder);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/timestamp.mjs

    //# sourceMappingURL=time.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    /**
     * Timestamp is a 64-bit signed integer representing an elapsed time since a
     * fixed epoch, stored in either of four units: seconds, milliseconds,
     * microseconds or nanoseconds, and is optionally annotated with a timezone.
     *
     * Timestamp values do not include any leap seconds (in other words, all
     * days are considered 86400 seconds long).
     *
     * Timestamps with a non-empty timezone
     * ------------------------------------
     *
     * If a Timestamp column has a non-empty timezone value, its epoch is
     * 1970-01-01 00:00:00 (January 1st 1970, midnight) in the *UTC* timezone
     * (the Unix epoch), regardless of the Timestamp's own timezone.
     *
     * Therefore, timestamp values with a non-empty timezone correspond to
     * physical points in time together with some additional information about
     * how the data was obtained and/or how to display it (the timezone).
     *
     *   For example, the timestamp value 0 with the timezone string "Europe/Paris"
     *   corresponds to "January 1st 1970, 00h00" in the UTC timezone, but the
     *   application may prefer to display it as "January 1st 1970, 01h00" in
     *   the Europe/Paris timezone (which is the same physical point in time).
     *
     * One consequence is that timestamp values with a non-empty timezone
     * can be compared and ordered directly, since they all share the same
     * well-known point of reference (the Unix epoch).
     *
     * Timestamps with an unset / empty timezone
     * -----------------------------------------
     *
     * If a Timestamp column has no timezone value, its epoch is
     * 1970-01-01 00:00:00 (January 1st 1970, midnight) in an *unknown* timezone.
     *
     * Therefore, timestamp values without a timezone cannot be meaningfully
     * interpreted as physical points in time, but only as calendar / clock
     * indications ("wall clock time") in an unspecified timezone.
     *
     *   For example, the timestamp value 0 with an empty timezone string
     *   corresponds to "January 1st 1970, 00h00" in an unknown timezone: there
     *   is not enough information to interpret it as a well-defined physical
     *   point in time.
     *
     * One consequence is that timestamp values without a timezone cannot
     * be reliably compared or ordered, since they may have different points of
     * reference.  In particular, it is *not* possible to interpret an unset
     * or empty timezone as the same as "UTC".
     *
     * Conversion between timezones
     * ----------------------------
     *
     * If a Timestamp column has a non-empty timezone, changing the timezone
     * to a different non-empty value is a metadata-only operation:
     * the timestamp values need not change as their point of reference remains
     * the same (the Unix epoch).
     *
     * However, if a Timestamp column has no timezone value, changing it to a
     * non-empty value requires to think about the desired semantics.
     * One possibility is to assume that the original timestamp values are
     * relative to the epoch of the timezone being set; timestamp values should
     * then adjusted to the Unix epoch (for example, changing the timezone from
     * empty to "Europe/Paris" would require converting the timestamp values
     * from "Europe/Paris" to "UTC", which seems counter-intuitive but is
     * nevertheless correct).
     *
     * Guidelines for encoding data from external libraries
     * ----------------------------------------------------
     *
     * Date & time libraries often have multiple different data types for temporal
     * data. In order to ease interoperability between different implementations the
     * Arrow project has some recommendations for encoding these types into a Timestamp
     * column.
     *
     * An "instant" represents a physical point in time that has no relevant timezone
     * (for example, astronomical data). To encode an instant, use a Timestamp with
     * the timezone string set to "UTC", and make sure the Timestamp values
     * are relative to the UTC epoch (January 1st 1970, midnight).
     *
     * A "zoned date-time" represents a physical point in time annotated with an
     * informative timezone (for example, the timezone in which the data was
     * recorded).  To encode a zoned date-time, use a Timestamp with the timezone
     * string set to the name of the timezone, and make sure the Timestamp values
     * are relative to the UTC epoch (January 1st 1970, midnight).
     *
     *  (There is some ambiguity between an instant and a zoned date-time with the
     *   UTC timezone.  Both of these are stored the same in Arrow.  Typically,
     *   this distinction does not matter.  If it does, then an application should
     *   use custom metadata or an extension type to distinguish between the two cases.)
     *
     * An "offset date-time" represents a physical point in time combined with an
     * explicit offset from UTC.  To encode an offset date-time, use a Timestamp
     * with the timezone string set to the numeric timezone offset string
     * (e.g. "+03:00"), and make sure the Timestamp values are relative to
     * the UTC epoch (January 1st 1970, midnight).
     *
     * A "naive date-time" (also called "local date-time" in some libraries)
     * represents a wall clock time combined with a calendar date, but with
     * no indication of how to map this information to a physical point in time.
     * Naive date-times must be handled with care because of this missing
     * information, and also because daylight saving time (DST) may make
     * some values ambiguous or non-existent. A naive date-time may be
     * stored as a struct with Date and Time fields. However, it may also be
     * encoded into a Timestamp column with an empty timezone. The timestamp
     * values should be computed "as if" the timezone of the date-time values
     * was UTC; for example, the naive date-time "January 1st 1970, 00h00" would
     * be encoded as timestamp value 0.
     */
    class Timestamp {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsTimestamp(bb, obj) {
        return (obj || new Timestamp()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsTimestamp(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new Timestamp()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      unit() {
        const offset = this.bb.__offset(this.bb_pos, 4);
        return offset
          ? this.bb.readInt16(this.bb_pos + offset)
          : time_unit_TimeUnit.SECOND;
      }
      timezone(optionalEncoding) {
        const offset = this.bb.__offset(this.bb_pos, 6);
        return offset
          ? this.bb.__string(this.bb_pos + offset, optionalEncoding)
          : null;
      }
      static startTimestamp(builder) {
        builder.startObject(2);
      }
      static addUnit(builder, unit) {
        builder.addFieldInt16(0, unit, time_unit_TimeUnit.SECOND);
      }
      static addTimezone(builder, timezoneOffset) {
        builder.addFieldOffset(1, timezoneOffset, 0);
      }
      static endTimestamp(builder) {
        const offset = builder.endObject();
        return offset;
      }
      static createTimestamp(builder, unit, timezoneOffset) {
        Timestamp.startTimestamp(builder);
        Timestamp.addUnit(builder, unit);
        Timestamp.addTimezone(builder, timezoneOffset);
        return Timestamp.endTimestamp(builder);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/union-mode.mjs

    //# sourceMappingURL=timestamp.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify
    var union_mode_UnionMode;
    (function (UnionMode) {
      UnionMode[(UnionMode["Sparse"] = 0)] = "Sparse";
      UnionMode[(UnionMode["Dense"] = 1)] = "Dense";
    })(union_mode_UnionMode || (union_mode_UnionMode = {})); // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/union.mjs

    //# sourceMappingURL=union-mode.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    /**
     * A union is a complex type with children in Field
     * By default ids in the type vector refer to the offsets in the children
     * optionally typeIds provides an indirection between the child offset and the type id
     * for each child `typeIds[offset]` is the id used in the type vector
     */
    class Union {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsUnion(bb, obj) {
        return (obj || new Union()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsUnion(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new Union()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      mode() {
        const offset = this.bb.__offset(this.bb_pos, 4);
        return offset
          ? this.bb.readInt16(this.bb_pos + offset)
          : union_mode_UnionMode.Sparse;
      }
      typeIds(index) {
        const offset = this.bb.__offset(this.bb_pos, 6);
        return offset
          ? this.bb.readInt32(
              this.bb.__vector(this.bb_pos + offset) + index * 4,
            )
          : 0;
      }
      typeIdsLength() {
        const offset = this.bb.__offset(this.bb_pos, 6);
        return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
      }
      typeIdsArray() {
        const offset = this.bb.__offset(this.bb_pos, 6);
        return offset
          ? new Int32Array(
              this.bb.bytes().buffer,
              this.bb.bytes().byteOffset +
                this.bb.__vector(this.bb_pos + offset),
              this.bb.__vector_len(this.bb_pos + offset),
            )
          : null;
      }
      static startUnion(builder) {
        builder.startObject(2);
      }
      static addMode(builder, mode) {
        builder.addFieldInt16(0, mode, union_mode_UnionMode.Sparse);
      }
      static addTypeIds(builder, typeIdsOffset) {
        builder.addFieldOffset(1, typeIdsOffset, 0);
      }
      static createTypeIdsVector(builder, data) {
        builder.startVector(4, data.length, 4);
        for (let i = data.length - 1; i >= 0; i--) {
          builder.addInt32(data[i]);
        }
        return builder.endVector();
      }
      static startTypeIdsVector(builder, numElems) {
        builder.startVector(4, numElems, 4);
      }
      static endUnion(builder) {
        const offset = builder.endObject();
        return offset;
      }
      static createUnion(builder, mode, typeIdsOffset) {
        Union.startUnion(builder);
        Union.addMode(builder, mode);
        Union.addTypeIds(builder, typeIdsOffset);
        return Union.endUnion(builder);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/utf8.mjs

    //# sourceMappingURL=union.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    /**
     * Unicode with UTF-8 encoding
     */
    class utf8_Utf8 {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsUtf8(bb, obj) {
        return (obj || new utf8_Utf8()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsUtf8(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new utf8_Utf8()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static startUtf8(builder) {
        builder.startObject(0);
      }
      static endUtf8(builder) {
        const offset = builder.endObject();
        return offset;
      }
      static createUtf8(builder) {
        utf8_Utf8.startUtf8(builder);
        return utf8_Utf8.endUtf8(builder);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/type.mjs

    //# sourceMappingURL=utf8.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    /**
     * ----------------------------------------------------------------------
     * Top-level Type value, enabling extensible type-specific metadata. We can
     * add new logical types to Type without breaking backwards compatibility
     */
    var type_Type;
    (function (Type) {
      Type[(Type["NONE"] = 0)] = "NONE";
      Type[(Type["Null"] = 1)] = "Null";
      Type[(Type["Int"] = 2)] = "Int";
      Type[(Type["FloatingPoint"] = 3)] = "FloatingPoint";
      Type[(Type["Binary"] = 4)] = "Binary";
      Type[(Type["Utf8"] = 5)] = "Utf8";
      Type[(Type["Bool"] = 6)] = "Bool";
      Type[(Type["Decimal"] = 7)] = "Decimal";
      Type[(Type["Date"] = 8)] = "Date";
      Type[(Type["Time"] = 9)] = "Time";
      Type[(Type["Timestamp"] = 10)] = "Timestamp";
      Type[(Type["Interval"] = 11)] = "Interval";
      Type[(Type["List"] = 12)] = "List";
      Type[(Type["Struct_"] = 13)] = "Struct_";
      Type[(Type["Union"] = 14)] = "Union";
      Type[(Type["FixedSizeBinary"] = 15)] = "FixedSizeBinary";
      Type[(Type["FixedSizeList"] = 16)] = "FixedSizeList";
      Type[(Type["Map"] = 17)] = "Map";
      Type[(Type["Duration"] = 18)] = "Duration";
      Type[(Type["LargeBinary"] = 19)] = "LargeBinary";
      Type[(Type["LargeUtf8"] = 20)] = "LargeUtf8";
      Type[(Type["LargeList"] = 21)] = "LargeList";
    })(type_Type || (type_Type = {}));
    function unionToType(type, accessor) {
      switch (type_Type[type]) {
        case "NONE":
          return null;
        case "Null":
          return accessor(new null_Null());
        case "Int":
          return accessor(new Int());
        case "FloatingPoint":
          return accessor(new FloatingPoint());
        case "Binary":
          return accessor(new binary_Binary());
        case "Utf8":
          return accessor(new utf8_Utf8());
        case "Bool":
          return accessor(new bool_Bool());
        case "Decimal":
          return accessor(new decimal_Decimal());
        case "Date":
          return accessor(new date_Date());
        case "Time":
          return accessor(new Time());
        case "Timestamp":
          return accessor(new Timestamp());
        case "Interval":
          return accessor(new Interval());
        case "List":
          return accessor(new list_List());
        case "Struct_":
          return accessor(new Struct_());
        case "Union":
          return accessor(new Union());
        case "FixedSizeBinary":
          return accessor(new fixed_size_binary_FixedSizeBinary());
        case "FixedSizeList":
          return accessor(new fixed_size_list_FixedSizeList());
        case "Map":
          return accessor(new map_Map());
        case "Duration":
          return accessor(new Duration());
        case "LargeBinary":
          return accessor(new LargeBinary());
        case "LargeUtf8":
          return accessor(new LargeUtf8());
        case "LargeList":
          return accessor(new LargeList());
        default:
          return null;
      }
    }
    function unionListToType(type, accessor, index) {
      switch (type_Type[type]) {
        case "NONE":
          return null;
        case "Null":
          return accessor(index, new null_Null());
        case "Int":
          return accessor(index, new Int());
        case "FloatingPoint":
          return accessor(index, new FloatingPoint());
        case "Binary":
          return accessor(index, new binary_Binary());
        case "Utf8":
          return accessor(index, new utf8_Utf8());
        case "Bool":
          return accessor(index, new bool_Bool());
        case "Decimal":
          return accessor(index, new decimal_Decimal());
        case "Date":
          return accessor(index, new date_Date());
        case "Time":
          return accessor(index, new Time());
        case "Timestamp":
          return accessor(index, new Timestamp());
        case "Interval":
          return accessor(index, new Interval());
        case "List":
          return accessor(index, new list_List());
        case "Struct_":
          return accessor(index, new Struct_());
        case "Union":
          return accessor(index, new Union());
        case "FixedSizeBinary":
          return accessor(index, new fixed_size_binary_FixedSizeBinary());
        case "FixedSizeList":
          return accessor(index, new fixed_size_list_FixedSizeList());
        case "Map":
          return accessor(index, new map_Map());
        case "Duration":
          return accessor(index, new Duration());
        case "LargeBinary":
          return accessor(index, new LargeBinary());
        case "LargeUtf8":
          return accessor(index, new LargeUtf8());
        case "LargeList":
          return accessor(index, new LargeList());
        default:
          return null;
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/field.mjs

    //# sourceMappingURL=type.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    /**
     * ----------------------------------------------------------------------
     * A field represents a named column in a record / row batch or child of a
     * nested type.
     */
    class Field {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsField(bb, obj) {
        return (obj || new Field()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsField(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new Field()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      name(optionalEncoding) {
        const offset = this.bb.__offset(this.bb_pos, 4);
        return offset
          ? this.bb.__string(this.bb_pos + offset, optionalEncoding)
          : null;
      }
      /**
       * Whether or not this field can contain nulls. Should be true in general.
       */
      nullable() {
        const offset = this.bb.__offset(this.bb_pos, 6);
        return offset ? !!this.bb.readInt8(this.bb_pos + offset) : false;
      }
      typeType() {
        const offset = this.bb.__offset(this.bb_pos, 8);
        return offset
          ? this.bb.readUint8(this.bb_pos + offset)
          : type_Type.NONE;
      }
      /**
       * This is the type of the decoded value if the field is dictionary encoded.
       */
      // @ts-ignore
      type(obj) {
        const offset = this.bb.__offset(this.bb_pos, 10);
        return offset ? this.bb.__union(obj, this.bb_pos + offset) : null;
      }
      /**
       * Present only if the field is dictionary encoded.
       */
      dictionary(obj) {
        const offset = this.bb.__offset(this.bb_pos, 12);
        return offset
          ? (obj || new DictionaryEncoding()).__init(
              this.bb.__indirect(this.bb_pos + offset),
              this.bb,
            )
          : null;
      }
      /**
       * children apply only to nested data types like Struct, List and Union. For
       * primitive types children will have length 0.
       */
      children(index, obj) {
        const offset = this.bb.__offset(this.bb_pos, 14);
        return offset
          ? (obj || new Field()).__init(
              this.bb.__indirect(
                this.bb.__vector(this.bb_pos + offset) + index * 4,
              ),
              this.bb,
            )
          : null;
      }
      childrenLength() {
        const offset = this.bb.__offset(this.bb_pos, 14);
        return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
      }
      /**
       * User-defined metadata
       */
      customMetadata(index, obj) {
        const offset = this.bb.__offset(this.bb_pos, 16);
        return offset
          ? (obj || new KeyValue()).__init(
              this.bb.__indirect(
                this.bb.__vector(this.bb_pos + offset) + index * 4,
              ),
              this.bb,
            )
          : null;
      }
      customMetadataLength() {
        const offset = this.bb.__offset(this.bb_pos, 16);
        return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
      }
      static startField(builder) {
        builder.startObject(7);
      }
      static addName(builder, nameOffset) {
        builder.addFieldOffset(0, nameOffset, 0);
      }
      static addNullable(builder, nullable) {
        builder.addFieldInt8(1, +nullable, +false);
      }
      static addTypeType(builder, typeType) {
        builder.addFieldInt8(2, typeType, type_Type.NONE);
      }
      static addType(builder, typeOffset) {
        builder.addFieldOffset(3, typeOffset, 0);
      }
      static addDictionary(builder, dictionaryOffset) {
        builder.addFieldOffset(4, dictionaryOffset, 0);
      }
      static addChildren(builder, childrenOffset) {
        builder.addFieldOffset(5, childrenOffset, 0);
      }
      static createChildrenVector(builder, data) {
        builder.startVector(4, data.length, 4);
        for (let i = data.length - 1; i >= 0; i--) {
          builder.addOffset(data[i]);
        }
        return builder.endVector();
      }
      static startChildrenVector(builder, numElems) {
        builder.startVector(4, numElems, 4);
      }
      static addCustomMetadata(builder, customMetadataOffset) {
        builder.addFieldOffset(6, customMetadataOffset, 0);
      }
      static createCustomMetadataVector(builder, data) {
        builder.startVector(4, data.length, 4);
        for (let i = data.length - 1; i >= 0; i--) {
          builder.addOffset(data[i]);
        }
        return builder.endVector();
      }
      static startCustomMetadataVector(builder, numElems) {
        builder.startVector(4, numElems, 4);
      }
      static endField(builder) {
        const offset = builder.endObject();
        return offset;
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/schema.mjs

    //# sourceMappingURL=field.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    /**
     * ----------------------------------------------------------------------
     * A Schema describes the columns in a row batch
     */
    class Schema {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsSchema(bb, obj) {
        return (obj || new Schema()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsSchema(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new Schema()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      /**
       * endianness of the buffer
       * it is Little Endian by default
       * if endianness doesn't match the underlying system then the vectors need to be converted
       */
      endianness() {
        const offset = this.bb.__offset(this.bb_pos, 4);
        return offset
          ? this.bb.readInt16(this.bb_pos + offset)
          : Endianness.Little;
      }
      fields(index, obj) {
        const offset = this.bb.__offset(this.bb_pos, 6);
        return offset
          ? (obj || new Field()).__init(
              this.bb.__indirect(
                this.bb.__vector(this.bb_pos + offset) + index * 4,
              ),
              this.bb,
            )
          : null;
      }
      fieldsLength() {
        const offset = this.bb.__offset(this.bb_pos, 6);
        return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
      }
      customMetadata(index, obj) {
        const offset = this.bb.__offset(this.bb_pos, 8);
        return offset
          ? (obj || new KeyValue()).__init(
              this.bb.__indirect(
                this.bb.__vector(this.bb_pos + offset) + index * 4,
              ),
              this.bb,
            )
          : null;
      }
      customMetadataLength() {
        const offset = this.bb.__offset(this.bb_pos, 8);
        return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
      }
      /**
       * Features used in the stream/file.
       */
      features(index) {
        const offset = this.bb.__offset(this.bb_pos, 10);
        return offset
          ? this.bb.readInt64(
              this.bb.__vector(this.bb_pos + offset) + index * 8,
            )
          : this.bb.createLong(0, 0);
      }
      featuresLength() {
        const offset = this.bb.__offset(this.bb_pos, 10);
        return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
      }
      static startSchema(builder) {
        builder.startObject(4);
      }
      static addEndianness(builder, endianness) {
        builder.addFieldInt16(0, endianness, Endianness.Little);
      }
      static addFields(builder, fieldsOffset) {
        builder.addFieldOffset(1, fieldsOffset, 0);
      }
      static createFieldsVector(builder, data) {
        builder.startVector(4, data.length, 4);
        for (let i = data.length - 1; i >= 0; i--) {
          builder.addOffset(data[i]);
        }
        return builder.endVector();
      }
      static startFieldsVector(builder, numElems) {
        builder.startVector(4, numElems, 4);
      }
      static addCustomMetadata(builder, customMetadataOffset) {
        builder.addFieldOffset(2, customMetadataOffset, 0);
      }
      static createCustomMetadataVector(builder, data) {
        builder.startVector(4, data.length, 4);
        for (let i = data.length - 1; i >= 0; i--) {
          builder.addOffset(data[i]);
        }
        return builder.endVector();
      }
      static startCustomMetadataVector(builder, numElems) {
        builder.startVector(4, numElems, 4);
      }
      static addFeatures(builder, featuresOffset) {
        builder.addFieldOffset(3, featuresOffset, 0);
      }
      static createFeaturesVector(builder, data) {
        builder.startVector(8, data.length, 8);
        for (let i = data.length - 1; i >= 0; i--) {
          builder.addInt64(data[i]);
        }
        return builder.endVector();
      }
      static startFeaturesVector(builder, numElems) {
        builder.startVector(8, numElems, 8);
      }
      static endSchema(builder) {
        const offset = builder.endObject();
        return offset;
      }
      static finishSchemaBuffer(builder, offset) {
        builder.finish(offset);
      }
      static finishSizePrefixedSchemaBuffer(builder, offset) {
        builder.finish(offset, undefined, true);
      }
      static createSchema(
        builder,
        endianness,
        fieldsOffset,
        customMetadataOffset,
        featuresOffset,
      ) {
        Schema.startSchema(builder);
        Schema.addEndianness(builder, endianness);
        Schema.addFields(builder, fieldsOffset);
        Schema.addCustomMetadata(builder, customMetadataOffset);
        Schema.addFeatures(builder, featuresOffset);
        return Schema.endSchema(builder);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/footer.mjs

    //# sourceMappingURL=schema.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    /**
     * ----------------------------------------------------------------------
     * Arrow File metadata
     *
     */
    class Footer {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsFooter(bb, obj) {
        return (obj || new Footer()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsFooter(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new Footer()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      version() {
        const offset = this.bb.__offset(this.bb_pos, 4);
        return offset
          ? this.bb.readInt16(this.bb_pos + offset)
          : metadata_version_MetadataVersion.V1;
      }
      schema(obj) {
        const offset = this.bb.__offset(this.bb_pos, 6);
        return offset
          ? (obj || new Schema()).__init(
              this.bb.__indirect(this.bb_pos + offset),
              this.bb,
            )
          : null;
      }
      dictionaries(index, obj) {
        const offset = this.bb.__offset(this.bb_pos, 8);
        return offset
          ? (obj || new Block()).__init(
              this.bb.__vector(this.bb_pos + offset) + index * 24,
              this.bb,
            )
          : null;
      }
      dictionariesLength() {
        const offset = this.bb.__offset(this.bb_pos, 8);
        return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
      }
      recordBatches(index, obj) {
        const offset = this.bb.__offset(this.bb_pos, 10);
        return offset
          ? (obj || new Block()).__init(
              this.bb.__vector(this.bb_pos + offset) + index * 24,
              this.bb,
            )
          : null;
      }
      recordBatchesLength() {
        const offset = this.bb.__offset(this.bb_pos, 10);
        return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
      }
      /**
       * User-defined metadata
       */
      customMetadata(index, obj) {
        const offset = this.bb.__offset(this.bb_pos, 12);
        return offset
          ? (obj || new KeyValue()).__init(
              this.bb.__indirect(
                this.bb.__vector(this.bb_pos + offset) + index * 4,
              ),
              this.bb,
            )
          : null;
      }
      customMetadataLength() {
        const offset = this.bb.__offset(this.bb_pos, 12);
        return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
      }
      static startFooter(builder) {
        builder.startObject(5);
      }
      static addVersion(builder, version) {
        builder.addFieldInt16(0, version, metadata_version_MetadataVersion.V1);
      }
      static addSchema(builder, schemaOffset) {
        builder.addFieldOffset(1, schemaOffset, 0);
      }
      static addDictionaries(builder, dictionariesOffset) {
        builder.addFieldOffset(2, dictionariesOffset, 0);
      }
      static startDictionariesVector(builder, numElems) {
        builder.startVector(24, numElems, 8);
      }
      static addRecordBatches(builder, recordBatchesOffset) {
        builder.addFieldOffset(3, recordBatchesOffset, 0);
      }
      static startRecordBatchesVector(builder, numElems) {
        builder.startVector(24, numElems, 8);
      }
      static addCustomMetadata(builder, customMetadataOffset) {
        builder.addFieldOffset(4, customMetadataOffset, 0);
      }
      static createCustomMetadataVector(builder, data) {
        builder.startVector(4, data.length, 4);
        for (let i = data.length - 1; i >= 0; i--) {
          builder.addOffset(data[i]);
        }
        return builder.endVector();
      }
      static startCustomMetadataVector(builder, numElems) {
        builder.startVector(4, numElems, 4);
      }
      static endFooter(builder) {
        const offset = builder.endObject();
        return offset;
      }
      static finishFooterBuffer(builder, offset) {
        builder.finish(offset);
      }
      static finishSizePrefixedFooterBuffer(builder, offset) {
        builder.finish(offset, undefined, true);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/schema.mjs

    //# sourceMappingURL=footer.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    class schema_Schema {
      constructor(fields = [], metadata, dictionaries) {
        this.fields = fields || [];
        this.metadata = metadata || new Map();
        if (!dictionaries) {
          dictionaries = generateDictionaryMap(fields);
        }
        this.dictionaries = dictionaries;
      }
      get [Symbol.toStringTag]() {
        return "Schema";
      }
      get names() {
        return this.fields.map((f) => f.name);
      }
      toString() {
        return `Schema<{ ${this.fields
          .map((f, i) => `${i}: ${f}`)
          .join(", ")} }>`;
      }
      /**
       * Construct a new Schema containing only specified fields.
       *
       * @param fieldNames Names of fields to keep.
       * @returns A new Schema of fields matching the specified names.
       */
      select(fieldNames) {
        const names = new Set(fieldNames);
        const fields = this.fields.filter((f) => names.has(f.name));
        return new schema_Schema(fields, this.metadata);
      }
      /**
       * Construct a new Schema containing only fields at the specified indices.
       *
       * @param fieldIndices Indices of fields to keep.
       * @returns A new Schema of fields at the specified indices.
       */
      selectAt(fieldIndices) {
        const fields = fieldIndices.map((i) => this.fields[i]).filter(Boolean);
        return new schema_Schema(fields, this.metadata);
      }
      assign(...args) {
        const other =
          args[0] instanceof schema_Schema
            ? args[0]
            : Array.isArray(args[0])
            ? new schema_Schema(args[0])
            : new schema_Schema(args);
        const curFields = [...this.fields];
        const metadata = mergeMaps(
          mergeMaps(new Map(), this.metadata),
          other.metadata,
        );
        const newFields = other.fields.filter((f2) => {
          const i = curFields.findIndex((f) => f.name === f2.name);
          return ~i
            ? (curFields[i] = f2.clone({
                metadata: mergeMaps(
                  mergeMaps(new Map(), curFields[i].metadata),
                  f2.metadata,
                ),
              })) && false
            : true;
        });
        const newDictionaries = generateDictionaryMap(newFields, new Map());
        return new schema_Schema(
          [...curFields, ...newFields],
          metadata,
          new Map([...this.dictionaries, ...newDictionaries]),
        );
      }
    }
    // Add these here so they're picked up by the externs creator
    // in the build, and closure-compiler doesn't minify them away
    schema_Schema.prototype.fields = null;
    schema_Schema.prototype.metadata = null;
    schema_Schema.prototype.dictionaries = null;
    class schema_Field {
      constructor(name, type, nullable = false, metadata) {
        this.name = name;
        this.type = type;
        this.nullable = nullable;
        this.metadata = metadata || new Map();
      }
      /** @nocollapse */
      static new(...args) {
        let [name, type, nullable, metadata] = args;
        if (args[0] && typeof args[0] === "object") {
          ({ name } = args[0]);
          type === undefined && (type = args[0].type);
          nullable === undefined && (nullable = args[0].nullable);
          metadata === undefined && (metadata = args[0].metadata);
        }
        return new schema_Field(`${name}`, type, nullable, metadata);
      }
      get typeId() {
        return this.type.typeId;
      }
      get [Symbol.toStringTag]() {
        return "Field";
      }
      toString() {
        return `${this.name}: ${this.type}`;
      }
      clone(...args) {
        let [name, type, nullable, metadata] = args;
        !args[0] || typeof args[0] !== "object"
          ? ([
              name = this.name,
              type = this.type,
              nullable = this.nullable,
              metadata = this.metadata,
            ] = args)
          : ({
              name = this.name,
              type = this.type,
              nullable = this.nullable,
              metadata = this.metadata,
            } = args[0]);
        return schema_Field.new(name, type, nullable, metadata);
      }
    }
    // Add these here so they're picked up by the externs creator
    // in the build, and closure-compiler doesn't minify them away
    schema_Field.prototype.type = null;
    schema_Field.prototype.name = null;
    schema_Field.prototype.nullable = null;
    schema_Field.prototype.metadata = null;
    /** @ignore */
    function mergeMaps(m1, m2) {
      return new Map([...(m1 || new Map()), ...(m2 || new Map())]);
    }
    /** @ignore */
    function generateDictionaryMap(fields, dictionaries = new Map()) {
      for (let i = -1, n = fields.length; ++i < n; ) {
        const field = fields[i];
        const type = field.type;
        if (DataType.isDictionary(type)) {
          if (!dictionaries.has(type.id)) {
            dictionaries.set(type.id, type.dictionary);
          } else if (dictionaries.get(type.id) !== type.dictionary) {
            throw new Error(
              `Cannot create Schema containing two different dictionaries with the same Id`,
            );
          }
        }
        if (type.children && type.children.length > 0) {
          generateDictionaryMap(type.children, dictionaries);
        }
      }
      return dictionaries;
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/ipc/metadata/file.mjs

    //# sourceMappingURL=schema.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.
    /* eslint-disable @typescript-eslint/naming-convention */

    var file_Long = Long;
    var file_Builder = builder_Builder;
    var file_ByteBuffer = ByteBuffer;

    /** @ignore */
    class Footer_ {
      constructor(
        schema,
        version = MetadataVersion.V4,
        recordBatches,
        dictionaryBatches,
      ) {
        this.schema = schema;
        this.version = version;
        recordBatches && (this._recordBatches = recordBatches);
        dictionaryBatches && (this._dictionaryBatches = dictionaryBatches);
      }
      /** @nocollapse */
      static decode(buf) {
        buf = new file_ByteBuffer(toUint8Array(buf));
        const footer = Footer.getRootAsFooter(buf);
        const schema = schema_Schema.decode(footer.schema());
        return new OffHeapFooter(schema, footer);
      }
      /** @nocollapse */
      static encode(footer) {
        const b = new file_Builder();
        const schemaOffset = schema_Schema.encode(b, footer.schema);
        Footer.startRecordBatchesVector(b, footer.numRecordBatches);
        for (const rb of [...footer.recordBatches()].slice().reverse()) {
          FileBlock.encode(b, rb);
        }
        const recordBatchesOffset = b.endVector();
        Footer.startDictionariesVector(b, footer.numDictionaries);
        for (const db of [...footer.dictionaryBatches()].slice().reverse()) {
          FileBlock.encode(b, db);
        }
        const dictionaryBatchesOffset = b.endVector();
        Footer.startFooter(b);
        Footer.addSchema(b, schemaOffset);
        Footer.addVersion(b, MetadataVersion.V4);
        Footer.addRecordBatches(b, recordBatchesOffset);
        Footer.addDictionaries(b, dictionaryBatchesOffset);
        Footer.finishFooterBuffer(b, Footer.endFooter(b));
        return b.asUint8Array();
      }
      get numRecordBatches() {
        return this._recordBatches.length;
      }
      get numDictionaries() {
        return this._dictionaryBatches.length;
      }
      *recordBatches() {
        for (let block, i = -1, n = this.numRecordBatches; ++i < n; ) {
          if ((block = this.getRecordBatch(i))) {
            yield block;
          }
        }
      }
      *dictionaryBatches() {
        for (let block, i = -1, n = this.numDictionaries; ++i < n; ) {
          if ((block = this.getDictionaryBatch(i))) {
            yield block;
          }
        }
      }
      getRecordBatch(index) {
        return (
          (index >= 0 &&
            index < this.numRecordBatches &&
            this._recordBatches[index]) ||
          null
        );
      }
      getDictionaryBatch(index) {
        return (
          (index >= 0 &&
            index < this.numDictionaries &&
            this._dictionaryBatches[index]) ||
          null
        );
      }
    }

    /** @ignore */
    class OffHeapFooter extends Footer_ {
      constructor(schema, _footer) {
        super(schema, _footer.version());
        this._footer = _footer;
      }
      get numRecordBatches() {
        return this._footer.recordBatchesLength();
      }
      get numDictionaries() {
        return this._footer.dictionariesLength();
      }
      getRecordBatch(index) {
        if (index >= 0 && index < this.numRecordBatches) {
          const fileBlock = this._footer.recordBatches(index);
          if (fileBlock) {
            return FileBlock.decode(fileBlock);
          }
        }
        return null;
      }
      getDictionaryBatch(index) {
        if (index >= 0 && index < this.numDictionaries) {
          const fileBlock = this._footer.dictionaries(index);
          if (fileBlock) {
            return FileBlock.decode(fileBlock);
          }
        }
        return null;
      }
    }
    /** @ignore */
    class FileBlock {
      constructor(metaDataLength, bodyLength, offset) {
        this.metaDataLength = metaDataLength;
        this.offset = typeof offset === "number" ? offset : offset.low;
        this.bodyLength =
          typeof bodyLength === "number" ? bodyLength : bodyLength.low;
      }
      /** @nocollapse */
      static decode(block) {
        return new FileBlock(
          block.metaDataLength(),
          block.bodyLength(),
          block.offset(),
        );
      }
      /** @nocollapse */
      static encode(b, fileBlock) {
        const { metaDataLength } = fileBlock;
        const offset = new file_Long(fileBlock.offset, 0);
        const bodyLength = new file_Long(fileBlock.bodyLength, 0);
        return Block.createBlock(b, offset, metaDataLength, bodyLength);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/io/interfaces.mjs

    //# sourceMappingURL=file.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    const ITERATOR_DONE = Object.freeze({ done: true, value: void 0 });
    /** @ignore */
    class ArrowJSON {
      constructor(_json) {
        this._json = _json;
      }
      get schema() {
        return this._json["schema"];
      }
      get batches() {
        return this._json["batches"] || [];
      }
      get dictionaries() {
        return this._json["dictionaries"] || [];
      }
    }
    /** @ignore */
    class ReadableInterop {
      tee() {
        return this._getDOMStream().tee();
      }
      pipe(writable, options) {
        return this._getNodeStream().pipe(writable, options);
      }
      pipeTo(writable, options) {
        return this._getDOMStream().pipeTo(writable, options);
      }
      pipeThrough(duplex, options) {
        return this._getDOMStream().pipeThrough(duplex, options);
      }
      _getDOMStream() {
        return this._DOMStream || (this._DOMStream = this.toDOMStream());
      }
      _getNodeStream() {
        return this._nodeStream || (this._nodeStream = this.toNodeStream());
      }
    }
    /** @ignore */
    class AsyncQueue extends ReadableInterop {
      constructor() {
        super();
        this._values = [];
        this.resolvers = [];
        this._closedPromise = new Promise(
          (r) => (this._closedPromiseResolve = r),
        );
      }
      get closed() {
        return this._closedPromise;
      }
      cancel(reason) {
        return __awaiter(this, void 0, void 0, function* () {
          yield this.return(reason);
        });
      }
      write(value) {
        if (this._ensureOpen()) {
          this.resolvers.length <= 0
            ? this._values.push(value)
            : this.resolvers.shift().resolve({ done: false, value });
        }
      }
      abort(value) {
        if (this._closedPromiseResolve) {
          this.resolvers.length <= 0
            ? (this._error = { error: value })
            : this.resolvers.shift().reject({ done: true, value });
        }
      }
      close() {
        if (this._closedPromiseResolve) {
          const { resolvers } = this;
          while (resolvers.length > 0) {
            resolvers.shift().resolve(ITERATOR_DONE);
          }
          this._closedPromiseResolve();
          this._closedPromiseResolve = undefined;
        }
      }
      [Symbol.asyncIterator]() {
        return this;
      }
      toDOMStream(options) {
        return adapters.toDOMStream(
          this._closedPromiseResolve || this._error ? this : this._values,
          options,
        );
      }
      toNodeStream(options) {
        return adapters.toNodeStream(
          this._closedPromiseResolve || this._error ? this : this._values,
          options,
        );
      }
      throw(_) {
        return __awaiter(this, void 0, void 0, function* () {
          yield this.abort(_);
          return ITERATOR_DONE;
        });
      }
      return(_) {
        return __awaiter(this, void 0, void 0, function* () {
          yield this.close();
          return ITERATOR_DONE;
        });
      }
      read(size) {
        return __awaiter(this, void 0, void 0, function* () {
          return (yield this.next(size, "read")).value;
        });
      }
      peek(size) {
        return __awaiter(this, void 0, void 0, function* () {
          return (yield this.next(size, "peek")).value;
        });
      }
      next(..._args) {
        if (this._values.length > 0) {
          return Promise.resolve({ done: false, value: this._values.shift() });
        } else if (this._error) {
          return Promise.reject({ done: true, value: this._error.error });
        } else if (!this._closedPromiseResolve) {
          return Promise.resolve(ITERATOR_DONE);
        } else {
          return new Promise((resolve, reject) => {
            this.resolvers.push({ resolve, reject });
          });
        }
      }
      _ensureOpen() {
        if (this._closedPromiseResolve) {
          return true;
        }
        throw new Error(`AsyncQueue is closed`);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/io/stream.mjs

    //# sourceMappingURL=interfaces.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    class AsyncByteQueue extends AsyncQueue {
      write(value) {
        if ((value = toUint8Array(value)).byteLength > 0) {
          return super.write(value);
        }
      }
      toString(sync = false) {
        return sync
          ? decodeUtf8(this.toUint8Array(true))
          : this.toUint8Array(false).then(decodeUtf8);
      }
      toUint8Array(sync = false) {
        return sync
          ? joinUint8Arrays(this._values)[0]
          : (() =>
              __awaiter(this, void 0, void 0, function* () {
                var e_1, _a;
                const buffers = [];
                let byteLength = 0;
                try {
                  for (
                    var _b = __asyncValues(this), _c;
                    (_c = yield _b.next()), !_c.done;

                  ) {
                    const chunk = _c.value;
                    buffers.push(chunk);
                    byteLength += chunk.byteLength;
                  }
                } catch (e_1_1) {
                  e_1 = { error: e_1_1 };
                } finally {
                  try {
                    if (_c && !_c.done && (_a = _b.return)) yield _a.call(_b);
                  } finally {
                    if (e_1) throw e_1.error;
                  }
                }
                return joinUint8Arrays(buffers, byteLength)[0];
              }))();
      }
    }
    /** @ignore */
    class ByteStream {
      constructor(source) {
        if (source) {
          this.source = new ByteStreamSource(adapters.fromIterable(source));
        }
      }
      [Symbol.iterator]() {
        return this;
      }
      next(value) {
        return this.source.next(value);
      }
      throw(value) {
        return this.source.throw(value);
      }
      return(value) {
        return this.source.return(value);
      }
      peek(size) {
        return this.source.peek(size);
      }
      read(size) {
        return this.source.read(size);
      }
    }
    /** @ignore */
    class AsyncByteStream {
      constructor(source) {
        if (source instanceof AsyncByteStream) {
          this.source = source.source;
        } else if (source instanceof AsyncByteQueue) {
          this.source = new AsyncByteStreamSource(
            adapters.fromAsyncIterable(source),
          );
        } else if (isReadableNodeStream(source)) {
          this.source = new AsyncByteStreamSource(
            adapters.fromNodeStream(source),
          );
        } else if (isReadableDOMStream(source)) {
          this.source = new AsyncByteStreamSource(
            adapters.fromDOMStream(source),
          );
        } else if (isFetchResponse(source)) {
          this.source = new AsyncByteStreamSource(
            adapters.fromDOMStream(source.body),
          );
        } else if (isIterable(source)) {
          this.source = new AsyncByteStreamSource(
            adapters.fromIterable(source),
          );
        } else if (isPromise(source)) {
          this.source = new AsyncByteStreamSource(
            adapters.fromAsyncIterable(source),
          );
        } else if (isAsyncIterable(source)) {
          this.source = new AsyncByteStreamSource(
            adapters.fromAsyncIterable(source),
          );
        }
      }
      [Symbol.asyncIterator]() {
        return this;
      }
      next(value) {
        return this.source.next(value);
      }
      throw(value) {
        return this.source.throw(value);
      }
      return(value) {
        return this.source.return(value);
      }
      get closed() {
        return this.source.closed;
      }
      cancel(reason) {
        return this.source.cancel(reason);
      }
      peek(size) {
        return this.source.peek(size);
      }
      read(size) {
        return this.source.read(size);
      }
    }
    /** @ignore */
    class ByteStreamSource {
      constructor(source) {
        this.source = source;
      }
      cancel(reason) {
        this.return(reason);
      }
      peek(size) {
        return this.next(size, "peek").value;
      }
      read(size) {
        return this.next(size, "read").value;
      }
      next(size, cmd = "read") {
        return this.source.next({ cmd, size });
      }
      throw(value) {
        return Object.create(
          (this.source.throw && this.source.throw(value)) || ITERATOR_DONE,
        );
      }
      return(value) {
        return Object.create(
          (this.source.return && this.source.return(value)) || ITERATOR_DONE,
        );
      }
    }
    /** @ignore */
    class AsyncByteStreamSource {
      constructor(source) {
        this.source = source;
        this._closedPromise = new Promise(
          (r) => (this._closedPromiseResolve = r),
        );
      }
      cancel(reason) {
        return __awaiter(this, void 0, void 0, function* () {
          yield this.return(reason);
        });
      }
      get closed() {
        return this._closedPromise;
      }
      read(size) {
        return __awaiter(this, void 0, void 0, function* () {
          return (yield this.next(size, "read")).value;
        });
      }
      peek(size) {
        return __awaiter(this, void 0, void 0, function* () {
          return (yield this.next(size, "peek")).value;
        });
      }
      next(size, cmd = "read") {
        return __awaiter(this, void 0, void 0, function* () {
          return yield this.source.next({ cmd, size });
        });
      }
      throw(value) {
        return __awaiter(this, void 0, void 0, function* () {
          const result =
            (this.source.throw && (yield this.source.throw(value))) ||
            ITERATOR_DONE;
          this._closedPromiseResolve && this._closedPromiseResolve();
          this._closedPromiseResolve = undefined;
          return Object.create(result);
        });
      }
      return(value) {
        return __awaiter(this, void 0, void 0, function* () {
          const result =
            (this.source.return && (yield this.source.return(value))) ||
            ITERATOR_DONE;
          this._closedPromiseResolve && this._closedPromiseResolve();
          this._closedPromiseResolve = undefined;
          return Object.create(result);
        });
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/io/file.mjs

    //# sourceMappingURL=stream.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    class RandomAccessFile extends ByteStream {
      constructor(buffer, byteLength) {
        super();
        this.position = 0;
        this.buffer = toUint8Array(buffer);
        this.size =
          typeof byteLength === "undefined"
            ? this.buffer.byteLength
            : byteLength;
      }
      readInt32(position) {
        const { buffer, byteOffset } = this.readAt(position, 4);
        return new DataView(buffer, byteOffset).getInt32(0, true);
      }
      seek(position) {
        this.position = Math.min(position, this.size);
        return position < this.size;
      }
      read(nBytes) {
        const { buffer, size, position } = this;
        if (buffer && position < size) {
          if (typeof nBytes !== "number") {
            nBytes = Number.POSITIVE_INFINITY;
          }
          this.position = Math.min(
            size,
            position + Math.min(size - position, nBytes),
          );
          return buffer.subarray(position, this.position);
        }
        return null;
      }
      readAt(position, nBytes) {
        const buf = this.buffer;
        const end = Math.min(this.size, position + nBytes);
        return buf ? buf.subarray(position, end) : new Uint8Array(nBytes);
      }
      close() {
        this.buffer && (this.buffer = null);
      }
      throw(value) {
        this.close();
        return { done: true, value };
      }
      return(value) {
        this.close();
        return { done: true, value };
      }
    }
    /** @ignore */
    class AsyncRandomAccessFile extends AsyncByteStream {
      constructor(file, byteLength) {
        super();
        this.position = 0;
        this._handle = file;
        if (typeof byteLength === "number") {
          this.size = byteLength;
        } else {
          this._pending = (() =>
            __awaiter(this, void 0, void 0, function* () {
              this.size = (yield file.stat()).size;
              delete this._pending;
            }))();
        }
      }
      readInt32(position) {
        return __awaiter(this, void 0, void 0, function* () {
          const { buffer, byteOffset } = yield this.readAt(position, 4);
          return new DataView(buffer, byteOffset).getInt32(0, true);
        });
      }
      seek(position) {
        return __awaiter(this, void 0, void 0, function* () {
          this._pending && (yield this._pending);
          this.position = Math.min(position, this.size);
          return position < this.size;
        });
      }
      read(nBytes) {
        return __awaiter(this, void 0, void 0, function* () {
          this._pending && (yield this._pending);
          const { _handle: file, size, position } = this;
          if (file && position < size) {
            if (typeof nBytes !== "number") {
              nBytes = Number.POSITIVE_INFINITY;
            }
            let pos = position,
              offset = 0,
              bytesRead = 0;
            const end = Math.min(size, pos + Math.min(size - pos, nBytes));
            const buffer = new Uint8Array(
              Math.max(0, (this.position = end) - pos),
            );
            while (
              (pos += bytesRead) < end &&
              (offset += bytesRead) < buffer.byteLength
            ) {
              ({ bytesRead } = yield file.read(
                buffer,
                offset,
                buffer.byteLength - offset,
                pos,
              ));
            }
            return buffer;
          }
          return null;
        });
      }
      readAt(position, nBytes) {
        return __awaiter(this, void 0, void 0, function* () {
          this._pending && (yield this._pending);
          const { _handle: file, size } = this;
          if (file && position + nBytes < size) {
            const end = Math.min(size, position + nBytes);
            const buffer = new Uint8Array(end - position);
            return (yield file.read(buffer, 0, nBytes, position)).buffer;
          }
          return new Uint8Array(nBytes);
        });
      }
      close() {
        return __awaiter(this, void 0, void 0, function* () {
          const f = this._handle;
          this._handle = null;
          f && (yield f.close());
        });
      }
      throw(value) {
        return __awaiter(this, void 0, void 0, function* () {
          yield this.close();
          return { done: true, value };
        });
      }
      return(value) {
        return __awaiter(this, void 0, void 0, function* () {
          yield this.close();
          return { done: true, value };
        });
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/util/int.mjs

    //# sourceMappingURL=file.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.
    /** @ignore */
    const carryBit16 = 1 << 16;
    /** @ignore */
    function intAsHex(value) {
      if (value < 0) {
        value = 0xffffffff + value + 1;
      }
      return `0x${value.toString(16)}`;
    }
    /** @ignore */
    const kInt32DecimalDigits = 8;
    /** @ignore */
    const kPowersOfTen = [
      1, 10, 100, 1000, 10000, 100000, 1000000, 10000000, 100000000,
    ];
    /** @ignore */
    class BaseInt64 {
      constructor(buffer) {
        this.buffer = buffer;
      }
      high() {
        return this.buffer[1];
      }
      low() {
        return this.buffer[0];
      }
      _times(other) {
        // Break the left and right numbers into 16 bit chunks
        // so that we can multiply them without overflow.
        const L = new Uint32Array([
          this.buffer[1] >>> 16,
          this.buffer[1] & 0xffff,
          this.buffer[0] >>> 16,
          this.buffer[0] & 0xffff,
        ]);
        const R = new Uint32Array([
          other.buffer[1] >>> 16,
          other.buffer[1] & 0xffff,
          other.buffer[0] >>> 16,
          other.buffer[0] & 0xffff,
        ]);
        let product = L[3] * R[3];
        this.buffer[0] = product & 0xffff;
        let sum = product >>> 16;
        product = L[2] * R[3];
        sum += product;
        product = (L[3] * R[2]) >>> 0;
        sum += product;
        this.buffer[0] += sum << 16;
        this.buffer[1] = sum >>> 0 < product ? carryBit16 : 0;
        this.buffer[1] += sum >>> 16;
        this.buffer[1] += L[1] * R[3] + L[2] * R[2] + L[3] * R[1];
        this.buffer[1] +=
          (L[0] * R[3] + L[1] * R[2] + L[2] * R[1] + L[3] * R[0]) << 16;
        return this;
      }
      _plus(other) {
        const sum = (this.buffer[0] + other.buffer[0]) >>> 0;
        this.buffer[1] += other.buffer[1];
        if (sum < this.buffer[0] >>> 0) {
          ++this.buffer[1];
        }
        this.buffer[0] = sum;
      }
      lessThan(other) {
        return (
          this.buffer[1] < other.buffer[1] ||
          (this.buffer[1] === other.buffer[1] &&
            this.buffer[0] < other.buffer[0])
        );
      }
      equals(other) {
        return (
          this.buffer[1] === other.buffer[1] &&
          this.buffer[0] == other.buffer[0]
        );
      }
      greaterThan(other) {
        return other.lessThan(this);
      }
      hex() {
        return `${intAsHex(this.buffer[1])} ${intAsHex(this.buffer[0])}`;
      }
    }
    /** @ignore */
    class int_Uint64 extends BaseInt64 {
      times(other) {
        this._times(other);
        return this;
      }
      plus(other) {
        this._plus(other);
        return this;
      }
      /** @nocollapse */
      static from(val, out_buffer = new Uint32Array(2)) {
        return int_Uint64.fromString(
          typeof val === "string" ? val : val.toString(),
          out_buffer,
        );
      }
      /** @nocollapse */
      static fromNumber(num, out_buffer = new Uint32Array(2)) {
        // Always parse numbers as strings - pulling out high and low bits
        // directly seems to lose precision sometimes
        // For example:
        //     > -4613034156400212000 >>> 0
        //     721782784
        // The correct lower 32-bits are 721782752
        return int_Uint64.fromString(num.toString(), out_buffer);
      }
      /** @nocollapse */
      static fromString(str, out_buffer = new Uint32Array(2)) {
        const length = str.length;
        const out = new int_Uint64(out_buffer);
        for (let posn = 0; posn < length; ) {
          const group =
            kInt32DecimalDigits < length - posn
              ? kInt32DecimalDigits
              : length - posn;
          const chunk = new int_Uint64(
            new Uint32Array([
              Number.parseInt(str.slice(posn, posn + group), 10),
              0,
            ]),
          );
          const multiple = new int_Uint64(
            new Uint32Array([kPowersOfTen[group], 0]),
          );
          out.times(multiple);
          out.plus(chunk);
          posn += group;
        }
        return out;
      }
      /** @nocollapse */
      static convertArray(values) {
        const data = new Uint32Array(values.length * 2);
        for (let i = -1, n = values.length; ++i < n; ) {
          int_Uint64.from(
            values[i],
            new Uint32Array(data.buffer, data.byteOffset + 2 * i * 4, 2),
          );
        }
        return data;
      }
      /** @nocollapse */
      static multiply(left, right) {
        const rtrn = new int_Uint64(new Uint32Array(left.buffer));
        return rtrn.times(right);
      }
      /** @nocollapse */
      static add(left, right) {
        const rtrn = new int_Uint64(new Uint32Array(left.buffer));
        return rtrn.plus(right);
      }
    }
    /** @ignore */
    class int_Int64 extends BaseInt64 {
      negate() {
        this.buffer[0] = ~this.buffer[0] + 1;
        this.buffer[1] = ~this.buffer[1];
        if (this.buffer[0] == 0) {
          ++this.buffer[1];
        }
        return this;
      }
      times(other) {
        this._times(other);
        return this;
      }
      plus(other) {
        this._plus(other);
        return this;
      }
      lessThan(other) {
        // force high bytes to be signed
        // eslint-disable-next-line unicorn/prefer-math-trunc
        const this_high = this.buffer[1] << 0;
        // eslint-disable-next-line unicorn/prefer-math-trunc
        const other_high = other.buffer[1] << 0;
        return (
          this_high < other_high ||
          (this_high === other_high && this.buffer[0] < other.buffer[0])
        );
      }
      /** @nocollapse */
      static from(val, out_buffer = new Uint32Array(2)) {
        return int_Int64.fromString(
          typeof val === "string" ? val : val.toString(),
          out_buffer,
        );
      }
      /** @nocollapse */
      static fromNumber(num, out_buffer = new Uint32Array(2)) {
        // Always parse numbers as strings - pulling out high and low bits
        // directly seems to lose precision sometimes
        // For example:
        //     > -4613034156400212000 >>> 0
        //     721782784
        // The correct lower 32-bits are 721782752
        return int_Int64.fromString(num.toString(), out_buffer);
      }
      /** @nocollapse */
      static fromString(str, out_buffer = new Uint32Array(2)) {
        // TODO: Assert that out_buffer is 0 and length = 2
        const negate = str.startsWith("-");
        const length = str.length;
        const out = new int_Int64(out_buffer);
        for (let posn = negate ? 1 : 0; posn < length; ) {
          const group =
            kInt32DecimalDigits < length - posn
              ? kInt32DecimalDigits
              : length - posn;
          const chunk = new int_Int64(
            new Uint32Array([
              Number.parseInt(str.slice(posn, posn + group), 10),
              0,
            ]),
          );
          const multiple = new int_Int64(
            new Uint32Array([kPowersOfTen[group], 0]),
          );
          out.times(multiple);
          out.plus(chunk);
          posn += group;
        }
        return negate ? out.negate() : out;
      }
      /** @nocollapse */
      static convertArray(values) {
        const data = new Uint32Array(values.length * 2);
        for (let i = -1, n = values.length; ++i < n; ) {
          int_Int64.from(
            values[i],
            new Uint32Array(data.buffer, data.byteOffset + 2 * i * 4, 2),
          );
        }
        return data;
      }
      /** @nocollapse */
      static multiply(left, right) {
        const rtrn = new int_Int64(new Uint32Array(left.buffer));
        return rtrn.times(right);
      }
      /** @nocollapse */
      static add(left, right) {
        const rtrn = new int_Int64(new Uint32Array(left.buffer));
        return rtrn.plus(right);
      }
    }
    /** @ignore */
    class Int128 {
      constructor(buffer) {
        this.buffer = buffer;
        // buffer[3] MSB (high)
        // buffer[2]
        // buffer[1]
        // buffer[0] LSB (low)
      }
      high() {
        return new int_Int64(
          new Uint32Array(this.buffer.buffer, this.buffer.byteOffset + 8, 2),
        );
      }
      low() {
        return new int_Int64(
          new Uint32Array(this.buffer.buffer, this.buffer.byteOffset, 2),
        );
      }
      negate() {
        this.buffer[0] = ~this.buffer[0] + 1;
        this.buffer[1] = ~this.buffer[1];
        this.buffer[2] = ~this.buffer[2];
        this.buffer[3] = ~this.buffer[3];
        if (this.buffer[0] == 0) {
          ++this.buffer[1];
        }
        if (this.buffer[1] == 0) {
          ++this.buffer[2];
        }
        if (this.buffer[2] == 0) {
          ++this.buffer[3];
        }
        return this;
      }
      times(other) {
        // Break the left and right numbers into 32 bit chunks
        // so that we can multiply them without overflow.
        const L0 = new int_Uint64(new Uint32Array([this.buffer[3], 0]));
        const L1 = new int_Uint64(new Uint32Array([this.buffer[2], 0]));
        const L2 = new int_Uint64(new Uint32Array([this.buffer[1], 0]));
        const L3 = new int_Uint64(new Uint32Array([this.buffer[0], 0]));
        const R0 = new int_Uint64(new Uint32Array([other.buffer[3], 0]));
        const R1 = new int_Uint64(new Uint32Array([other.buffer[2], 0]));
        const R2 = new int_Uint64(new Uint32Array([other.buffer[1], 0]));
        const R3 = new int_Uint64(new Uint32Array([other.buffer[0], 0]));
        let product = int_Uint64.multiply(L3, R3);
        this.buffer[0] = product.low();
        const sum = new int_Uint64(new Uint32Array([product.high(), 0]));
        product = int_Uint64.multiply(L2, R3);
        sum.plus(product);
        product = int_Uint64.multiply(L3, R2);
        sum.plus(product);
        this.buffer[1] = sum.low();
        this.buffer[3] = sum.lessThan(product) ? 1 : 0;
        this.buffer[2] = sum.high();
        const high = new int_Uint64(
          new Uint32Array(this.buffer.buffer, this.buffer.byteOffset + 8, 2),
        );
        high
          .plus(int_Uint64.multiply(L1, R3))
          .plus(int_Uint64.multiply(L2, R2))
          .plus(int_Uint64.multiply(L3, R1));
        this.buffer[3] += int_Uint64
          .multiply(L0, R3)
          .plus(int_Uint64.multiply(L1, R2))
          .plus(int_Uint64.multiply(L2, R1))
          .plus(int_Uint64.multiply(L3, R0))
          .low();
        return this;
      }
      plus(other) {
        const sums = new Uint32Array(4);
        sums[3] = (this.buffer[3] + other.buffer[3]) >>> 0;
        sums[2] = (this.buffer[2] + other.buffer[2]) >>> 0;
        sums[1] = (this.buffer[1] + other.buffer[1]) >>> 0;
        sums[0] = (this.buffer[0] + other.buffer[0]) >>> 0;
        if (sums[0] < this.buffer[0] >>> 0) {
          ++sums[1];
        }
        if (sums[1] < this.buffer[1] >>> 0) {
          ++sums[2];
        }
        if (sums[2] < this.buffer[2] >>> 0) {
          ++sums[3];
        }
        this.buffer[3] = sums[3];
        this.buffer[2] = sums[2];
        this.buffer[1] = sums[1];
        this.buffer[0] = sums[0];
        return this;
      }
      hex() {
        return `${intAsHex(this.buffer[3])} ${intAsHex(
          this.buffer[2],
        )} ${intAsHex(this.buffer[1])} ${intAsHex(this.buffer[0])}`;
      }
      /** @nocollapse */
      static multiply(left, right) {
        const rtrn = new Int128(new Uint32Array(left.buffer));
        return rtrn.times(right);
      }
      /** @nocollapse */
      static add(left, right) {
        const rtrn = new Int128(new Uint32Array(left.buffer));
        return rtrn.plus(right);
      }
      /** @nocollapse */
      static from(val, out_buffer = new Uint32Array(4)) {
        return Int128.fromString(
          typeof val === "string" ? val : val.toString(),
          out_buffer,
        );
      }
      /** @nocollapse */
      static fromNumber(num, out_buffer = new Uint32Array(4)) {
        // Always parse numbers as strings - pulling out high and low bits
        // directly seems to lose precision sometimes
        // For example:
        //     > -4613034156400212000 >>> 0
        //     721782784
        // The correct lower 32-bits are 721782752
        return Int128.fromString(num.toString(), out_buffer);
      }
      /** @nocollapse */
      static fromString(str, out_buffer = new Uint32Array(4)) {
        // TODO: Assert that out_buffer is 0 and length = 4
        const negate = str.startsWith("-");
        const length = str.length;
        const out = new Int128(out_buffer);
        for (let posn = negate ? 1 : 0; posn < length; ) {
          const group =
            kInt32DecimalDigits < length - posn
              ? kInt32DecimalDigits
              : length - posn;
          const chunk = new Int128(
            new Uint32Array([
              Number.parseInt(str.slice(posn, posn + group), 10),
              0,
              0,
              0,
            ]),
          );
          const multiple = new Int128(
            new Uint32Array([kPowersOfTen[group], 0, 0, 0]),
          );
          out.times(multiple);
          out.plus(chunk);
          posn += group;
        }
        return negate ? out.negate() : out;
      }
      /** @nocollapse */
      static convertArray(values) {
        // TODO: Distinguish between string and number at compile-time
        const data = new Uint32Array(values.length * 4);
        for (let i = -1, n = values.length; ++i < n; ) {
          Int128.from(
            values[i],
            new Uint32Array(data.buffer, data.byteOffset + 4 * 4 * i, 4),
          );
        }
        return data;
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/visitor/vectorloader.mjs

    //# sourceMappingURL=int.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    class VectorLoader extends Visitor {
      constructor(bytes, nodes, buffers, dictionaries) {
        super();
        this.nodesIndex = -1;
        this.buffersIndex = -1;
        this.bytes = bytes;
        this.nodes = nodes;
        this.buffers = buffers;
        this.dictionaries = dictionaries;
      }
      visit(node) {
        return super.visit(node instanceof schema_Field ? node.type : node);
      }
      visitNull(type, { length } = this.nextFieldNode()) {
        return makeData({ type, length });
      }
      visitBool(type, { length, nullCount } = this.nextFieldNode()) {
        return makeData({
          type,
          length,
          nullCount,
          nullBitmap: this.readNullBitmap(type, nullCount),
          data: this.readData(type),
        });
      }
      visitInt(type, { length, nullCount } = this.nextFieldNode()) {
        return makeData({
          type,
          length,
          nullCount,
          nullBitmap: this.readNullBitmap(type, nullCount),
          data: this.readData(type),
        });
      }
      visitFloat(type, { length, nullCount } = this.nextFieldNode()) {
        return makeData({
          type,
          length,
          nullCount,
          nullBitmap: this.readNullBitmap(type, nullCount),
          data: this.readData(type),
        });
      }
      visitUtf8(type, { length, nullCount } = this.nextFieldNode()) {
        return makeData({
          type,
          length,
          nullCount,
          nullBitmap: this.readNullBitmap(type, nullCount),
          valueOffsets: this.readOffsets(type),
          data: this.readData(type),
        });
      }
      visitBinary(type, { length, nullCount } = this.nextFieldNode()) {
        return makeData({
          type,
          length,
          nullCount,
          nullBitmap: this.readNullBitmap(type, nullCount),
          valueOffsets: this.readOffsets(type),
          data: this.readData(type),
        });
      }
      visitFixedSizeBinary(type, { length, nullCount } = this.nextFieldNode()) {
        return makeData({
          type,
          length,
          nullCount,
          nullBitmap: this.readNullBitmap(type, nullCount),
          data: this.readData(type),
        });
      }
      visitDate(type, { length, nullCount } = this.nextFieldNode()) {
        return makeData({
          type,
          length,
          nullCount,
          nullBitmap: this.readNullBitmap(type, nullCount),
          data: this.readData(type),
        });
      }
      visitTimestamp(type, { length, nullCount } = this.nextFieldNode()) {
        return makeData({
          type,
          length,
          nullCount,
          nullBitmap: this.readNullBitmap(type, nullCount),
          data: this.readData(type),
        });
      }
      visitTime(type, { length, nullCount } = this.nextFieldNode()) {
        return makeData({
          type,
          length,
          nullCount,
          nullBitmap: this.readNullBitmap(type, nullCount),
          data: this.readData(type),
        });
      }
      visitDecimal(type, { length, nullCount } = this.nextFieldNode()) {
        return makeData({
          type,
          length,
          nullCount,
          nullBitmap: this.readNullBitmap(type, nullCount),
          data: this.readData(type),
        });
      }
      visitList(type, { length, nullCount } = this.nextFieldNode()) {
        return makeData({
          type,
          length,
          nullCount,
          nullBitmap: this.readNullBitmap(type, nullCount),
          valueOffsets: this.readOffsets(type),
          child: this.visit(type.children[0]),
        });
      }
      visitStruct(type, { length, nullCount } = this.nextFieldNode()) {
        return makeData({
          type,
          length,
          nullCount,
          nullBitmap: this.readNullBitmap(type, nullCount),
          children: this.visitMany(type.children),
        });
      }
      visitUnion(type) {
        return type.mode === UnionMode.Sparse
          ? this.visitSparseUnion(type)
          : this.visitDenseUnion(type);
      }
      visitDenseUnion(type, { length, nullCount } = this.nextFieldNode()) {
        return makeData({
          type,
          length,
          nullCount,
          nullBitmap: this.readNullBitmap(type, nullCount),
          typeIds: this.readTypeIds(type),
          valueOffsets: this.readOffsets(type),
          children: this.visitMany(type.children),
        });
      }
      visitSparseUnion(type, { length, nullCount } = this.nextFieldNode()) {
        return makeData({
          type,
          length,
          nullCount,
          nullBitmap: this.readNullBitmap(type, nullCount),
          typeIds: this.readTypeIds(type),
          children: this.visitMany(type.children),
        });
      }
      visitDictionary(type, { length, nullCount } = this.nextFieldNode()) {
        return makeData({
          type,
          length,
          nullCount,
          nullBitmap: this.readNullBitmap(type, nullCount),
          data: this.readData(type.indices),
          dictionary: this.readDictionary(type),
        });
      }
      visitInterval(type, { length, nullCount } = this.nextFieldNode()) {
        return makeData({
          type,
          length,
          nullCount,
          nullBitmap: this.readNullBitmap(type, nullCount),
          data: this.readData(type),
        });
      }
      visitFixedSizeList(type, { length, nullCount } = this.nextFieldNode()) {
        return makeData({
          type,
          length,
          nullCount,
          nullBitmap: this.readNullBitmap(type, nullCount),
          child: this.visit(type.children[0]),
        });
      }
      visitMap(type, { length, nullCount } = this.nextFieldNode()) {
        return makeData({
          type,
          length,
          nullCount,
          nullBitmap: this.readNullBitmap(type, nullCount),
          valueOffsets: this.readOffsets(type),
          child: this.visit(type.children[0]),
        });
      }
      nextFieldNode() {
        return this.nodes[++this.nodesIndex];
      }
      nextBufferRange() {
        return this.buffers[++this.buffersIndex];
      }
      readNullBitmap(type, nullCount, buffer = this.nextBufferRange()) {
        return (
          (nullCount > 0 && this.readData(type, buffer)) || new Uint8Array(0)
        );
      }
      readOffsets(type, buffer) {
        return this.readData(type, buffer);
      }
      readTypeIds(type, buffer) {
        return this.readData(type, buffer);
      }
      readData(_type, { length, offset } = this.nextBufferRange()) {
        return this.bytes.subarray(offset, offset + length);
      }
      readDictionary(type) {
        return this.dictionaries.get(type.id);
      }
    }
    /** @ignore */
    class JSONVectorLoader extends VectorLoader {
      constructor(sources, nodes, buffers, dictionaries) {
        super(new Uint8Array(0), nodes, buffers, dictionaries);
        this.sources = sources;
      }
      readNullBitmap(_type, nullCount, { offset } = this.nextBufferRange()) {
        return nullCount <= 0
          ? new Uint8Array(0)
          : packBools(this.sources[offset]);
      }
      readOffsets(_type, { offset } = this.nextBufferRange()) {
        return toArrayBufferView(
          Uint8Array,
          toArrayBufferView(Int32Array, this.sources[offset]),
        );
      }
      readTypeIds(type, { offset } = this.nextBufferRange()) {
        return toArrayBufferView(
          Uint8Array,
          toArrayBufferView(type.ArrayType, this.sources[offset]),
        );
      }
      readData(type, { offset } = this.nextBufferRange()) {
        const { sources } = this;
        if (DataType.isTimestamp(type)) {
          return toArrayBufferView(
            Uint8Array,
            int_Int64.convertArray(sources[offset]),
          );
        } else if (
          (DataType.isInt(type) || DataType.isTime(type)) &&
          type.bitWidth === 64
        ) {
          return toArrayBufferView(
            Uint8Array,
            int_Int64.convertArray(sources[offset]),
          );
        } else if (
          DataType.isDate(type) &&
          type.unit === DateUnit.MILLISECOND
        ) {
          return toArrayBufferView(
            Uint8Array,
            int_Int64.convertArray(sources[offset]),
          );
        } else if (DataType.isDecimal(type)) {
          return toArrayBufferView(
            Uint8Array,
            Int128.convertArray(sources[offset]),
          );
        } else if (
          DataType.isBinary(type) ||
          DataType.isFixedSizeBinary(type)
        ) {
          return binaryDataFromJSON(sources[offset]);
        } else if (DataType.isBool(type)) {
          return packBools(sources[offset]);
        } else if (DataType.isUtf8(type)) {
          return encodeUtf8(sources[offset].join(""));
        }
        return toArrayBufferView(
          Uint8Array,
          toArrayBufferView(
            type.ArrayType,
            sources[offset].map((x) => +x),
          ),
        );
      }
    }
    /** @ignore */
    function binaryDataFromJSON(values) {
      // "DATA": ["49BC7D5B6C47D2","3F5FB6D9322026"]
      // There are definitely more efficient ways to do this... but it gets the
      // job done.
      const joined = values.join("");
      const data = new Uint8Array(joined.length / 2);
      for (let i = 0; i < joined.length; i += 2) {
        data[i >> 1] = Number.parseInt(joined.slice(i, i + 2), 16);
      }
      return data;
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/builder/binary.mjs

    //# sourceMappingURL=vectorloader.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    class BinaryBuilder extends VariableWidthBuilder {
      constructor(opts) {
        super(opts);
        this._values = new BufferBuilder(new Uint8Array(0));
      }
      get byteLength() {
        let size = this._pendingLength + this.length * 4;
        this._offsets && (size += this._offsets.byteLength);
        this._values && (size += this._values.byteLength);
        this._nulls && (size += this._nulls.byteLength);
        return size;
      }
      setValue(index, value) {
        return super.setValue(index, toUint8Array(value));
      }
      _flushPending(pending, pendingLength) {
        const offsets = this._offsets;
        const data = this._values.reserve(pendingLength).buffer;
        let offset = 0;
        for (const [index, value] of pending) {
          if (value === undefined) {
            offsets.set(index, 0);
          } else {
            const length = value.length;
            data.set(value, offset);
            offsets.set(index, length);
            offset += length;
          }
        }
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/builder/bool.mjs

    //# sourceMappingURL=binary.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    class BoolBuilder extends Builder {
      constructor(options) {
        super(options);
        this._values = new BitmapBufferBuilder();
      }
      setValue(index, value) {
        this._values.set(index, +value);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/builder/date.mjs

    //# sourceMappingURL=bool.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    class DateBuilder extends FixedWidthBuilder {}
    DateBuilder.prototype._setValue = setDate;
    /** @ignore */
    class DateDayBuilder extends DateBuilder {}
    DateDayBuilder.prototype._setValue = setDateDay;
    /** @ignore */
    class DateMillisecondBuilder extends DateBuilder {}
    DateMillisecondBuilder.prototype._setValue = setDateMillisecond; // CONCATENATED MODULE: ./node_modules/apache-arrow/builder/decimal.mjs

    //# sourceMappingURL=date.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    class DecimalBuilder extends FixedWidthBuilder {}
    DecimalBuilder.prototype._setValue = setDecimal; // CONCATENATED MODULE: ./node_modules/apache-arrow/builder/dictionary.mjs

    //# sourceMappingURL=decimal.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    class DictionaryBuilder extends Builder {
      constructor({
        type: type,
        nullValues: nulls,
        dictionaryHashFunction: hashFn,
      }) {
        super({
          type: new Dictionary(
            type.dictionary,
            type.indices,
            type.id,
            type.isOrdered,
          ),
        });
        this._nulls = null;
        this._dictionaryOffset = 0;
        this._keysToIndices = Object.create(null);
        this.indices = makeBuilder({
          type: this.type.indices,
          nullValues: nulls,
        });
        this.dictionary = makeBuilder({
          type: this.type.dictionary,
          nullValues: null,
        });
        if (typeof hashFn === "function") {
          this.valueToKey = hashFn;
        }
      }
      get values() {
        return this.indices.values;
      }
      get nullCount() {
        return this.indices.nullCount;
      }
      get nullBitmap() {
        return this.indices.nullBitmap;
      }
      get byteLength() {
        return this.indices.byteLength + this.dictionary.byteLength;
      }
      get reservedLength() {
        return this.indices.reservedLength + this.dictionary.reservedLength;
      }
      get reservedByteLength() {
        return (
          this.indices.reservedByteLength + this.dictionary.reservedByteLength
        );
      }
      isValid(value) {
        return this.indices.isValid(value);
      }
      setValid(index, valid) {
        const indices = this.indices;
        valid = indices.setValid(index, valid);
        this.length = indices.length;
        return valid;
      }
      setValue(index, value) {
        const keysToIndices = this._keysToIndices;
        const key = this.valueToKey(value);
        let idx = keysToIndices[key];
        if (idx === undefined) {
          keysToIndices[key] = idx =
            this._dictionaryOffset + this.dictionary.append(value).length - 1;
        }
        return this.indices.setValue(index, idx);
      }
      flush() {
        const type = this.type;
        const prev = this._dictionary;
        const curr = this.dictionary.toVector();
        const data = this.indices.flush().clone(type);
        data.dictionary = prev ? prev.concat(curr) : curr;
        this.finished || (this._dictionaryOffset += curr.length);
        this._dictionary = data.dictionary;
        this.clear();
        return data;
      }
      finish() {
        this.indices.finish();
        this.dictionary.finish();
        this._dictionaryOffset = 0;
        this._keysToIndices = Object.create(null);
        return super.finish();
      }
      clear() {
        this.indices.clear();
        this.dictionary.clear();
        return super.clear();
      }
      valueToKey(val) {
        return typeof val === "string" ? val : `${val}`;
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/builder/fixedsizebinary.mjs

    //# sourceMappingURL=dictionary.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    class FixedSizeBinaryBuilder extends FixedWidthBuilder {}
    FixedSizeBinaryBuilder.prototype._setValue = setFixedSizeBinary; // CONCATENATED MODULE: ./node_modules/apache-arrow/builder/fixedsizelist.mjs

    //# sourceMappingURL=fixedsizebinary.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    class FixedSizeListBuilder extends Builder {
      setValue(index, value) {
        const [child] = this.children;
        const start = index * this.stride;
        for (let i = -1, n = value.length; ++i < n; ) {
          child.set(start + i, value[i]);
        }
      }
      addChild(child, name = "0") {
        if (this.numChildren > 0) {
          throw new Error("FixedSizeListBuilder can only have one child.");
        }
        const childIndex = this.children.push(child);
        this.type = new FixedSizeList(
          this.type.listSize,
          new schema_Field(name, child.type, true),
        );
        return childIndex;
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/builder/float.mjs

    //# sourceMappingURL=fixedsizelist.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    class FloatBuilder extends FixedWidthBuilder {
      setValue(index, value) {
        this._values.set(index, value);
      }
    }
    /** @ignore */
    class Float16Builder extends FloatBuilder {
      setValue(index, value) {
        // convert JS float64 to a uint16
        super.setValue(index, float64ToUint16(value));
      }
    }
    /** @ignore */
    class Float32Builder extends FloatBuilder {}
    /** @ignore */
    class Float64Builder extends FloatBuilder {} // CONCATENATED MODULE: ./node_modules/apache-arrow/builder/interval.mjs

    //# sourceMappingURL=float.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    class IntervalBuilder extends FixedWidthBuilder {}
    IntervalBuilder.prototype._setValue = setIntervalValue;
    /** @ignore */
    class IntervalDayTimeBuilder extends IntervalBuilder {}
    IntervalDayTimeBuilder.prototype._setValue = setIntervalDayTime;
    /** @ignore */
    class IntervalYearMonthBuilder extends IntervalBuilder {}
    IntervalYearMonthBuilder.prototype._setValue = setIntervalYearMonth; // CONCATENATED MODULE: ./node_modules/apache-arrow/builder/int.mjs

    //# sourceMappingURL=interval.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    class IntBuilder extends FixedWidthBuilder {
      setValue(index, value) {
        this._values.set(index, value);
      }
    }
    /** @ignore */
    class Int8Builder extends IntBuilder {}
    /** @ignore */
    class Int16Builder extends IntBuilder {}
    /** @ignore */
    class Int32Builder extends IntBuilder {}
    /** @ignore */
    class Int64Builder extends IntBuilder {}
    /** @ignore */
    class Uint8Builder extends IntBuilder {}
    /** @ignore */
    class Uint16Builder extends IntBuilder {}
    /** @ignore */
    class Uint32Builder extends IntBuilder {}
    /** @ignore */
    class Uint64Builder extends IntBuilder {} // CONCATENATED MODULE: ./node_modules/apache-arrow/builder/list.mjs

    //# sourceMappingURL=int.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    class ListBuilder extends VariableWidthBuilder {
      constructor(opts) {
        super(opts);
        this._offsets = new OffsetsBufferBuilder();
      }
      addChild(child, name = "0") {
        if (this.numChildren > 0) {
          throw new Error("ListBuilder can only have one child.");
        }
        this.children[this.numChildren] = child;
        this.type = new List(new schema_Field(name, child.type, true));
        return this.numChildren - 1;
      }
      _flushPending(pending) {
        const offsets = this._offsets;
        const [child] = this.children;
        for (const [index, value] of pending) {
          if (value === undefined) {
            offsets.set(index, 0);
          } else {
            const n = value.length;
            const start = offsets.set(index, n).buffer[index];
            for (let i = -1; ++i < n; ) {
              child.set(start + i, value[i]);
            }
          }
        }
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/builder/map.mjs

    //# sourceMappingURL=list.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    class MapBuilder extends VariableWidthBuilder {
      set(index, value) {
        return super.set(index, value);
      }
      setValue(index, value) {
        const row =
          value instanceof Map ? value : new Map(Object.entries(value));
        const pending = this._pending || (this._pending = new Map());
        const current = pending.get(index);
        current && (this._pendingLength -= current.size);
        this._pendingLength += row.size;
        pending.set(index, row);
      }
      addChild(child, name = `${this.numChildren}`) {
        if (this.numChildren > 0) {
          throw new Error("ListBuilder can only have one child.");
        }
        this.children[this.numChildren] = child;
        this.type = new Map_(
          new schema_Field(name, child.type, true),
          this.type.keysSorted,
        );
        return this.numChildren - 1;
      }
      _flushPending(pending) {
        const offsets = this._offsets;
        const [child] = this.children;
        for (const [index, value] of pending) {
          if (value === undefined) {
            offsets.set(index, 0);
          } else {
            let { [index]: idx, [index + 1]: end } = offsets.set(
              index,
              value.size,
            ).buffer;
            for (const val of value.entries()) {
              child.set(idx, val);
              if (++idx >= end) break;
            }
          }
        }
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/builder/null.mjs

    //# sourceMappingURL=map.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    class NullBuilder extends Builder {
      // @ts-ignore
      setValue(index, value) {}
      setValid(index, valid) {
        this.length = Math.max(index + 1, this.length);
        return valid;
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/builder/struct.mjs

    //# sourceMappingURL=null.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.
    /* eslint-disable unicorn/no-array-for-each */

    /** @ignore */
    class StructBuilder extends Builder {
      setValue(index, value) {
        const { children, type } = this;
        switch (Array.isArray(value) || value.constructor) {
          case true:
            return type.children.forEach((_, i) =>
              children[i].set(index, value[i]),
            );
          case Map:
            return type.children.forEach((f, i) =>
              children[i].set(index, value.get(f.name)),
            );
          default:
            return type.children.forEach((f, i) =>
              children[i].set(index, value[f.name]),
            );
        }
      }
      /** @inheritdoc */
      setValid(index, valid) {
        if (!super.setValid(index, valid)) {
          this.children.forEach((child) => child.setValid(index, valid));
        }
        return valid;
      }
      addChild(child, name = `${this.numChildren}`) {
        const childIndex = this.children.push(child);
        this.type = new Struct([
          ...this.type.children,
          new schema_Field(name, child.type, true),
        ]);
        return childIndex;
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/builder/timestamp.mjs

    //# sourceMappingURL=struct.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    class TimestampBuilder extends FixedWidthBuilder {}
    TimestampBuilder.prototype._setValue = setTimestamp;
    /** @ignore */
    class TimestampSecondBuilder extends TimestampBuilder {}
    TimestampSecondBuilder.prototype._setValue = setTimestampSecond;
    /** @ignore */
    class TimestampMillisecondBuilder extends TimestampBuilder {}
    TimestampMillisecondBuilder.prototype._setValue = setTimestampMillisecond;
    /** @ignore */
    class TimestampMicrosecondBuilder extends TimestampBuilder {}
    TimestampMicrosecondBuilder.prototype._setValue = setTimestampMicrosecond;
    /** @ignore */
    class TimestampNanosecondBuilder extends TimestampBuilder {}
    TimestampNanosecondBuilder.prototype._setValue = setTimestampNanosecond; // CONCATENATED MODULE: ./node_modules/apache-arrow/builder/time.mjs

    //# sourceMappingURL=timestamp.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    class TimeBuilder extends FixedWidthBuilder {}
    TimeBuilder.prototype._setValue = setTime;
    /** @ignore */
    class TimeSecondBuilder extends TimeBuilder {}
    TimeSecondBuilder.prototype._setValue = setTimeSecond;
    /** @ignore */
    class TimeMillisecondBuilder extends TimeBuilder {}
    TimeMillisecondBuilder.prototype._setValue = setTimeMillisecond;
    /** @ignore */
    class TimeMicrosecondBuilder extends TimeBuilder {}
    TimeMicrosecondBuilder.prototype._setValue = setTimeMicrosecond;
    /** @ignore */
    class TimeNanosecondBuilder extends TimeBuilder {}
    TimeNanosecondBuilder.prototype._setValue = setTimeNanosecond; // CONCATENATED MODULE: ./node_modules/apache-arrow/builder/union.mjs

    //# sourceMappingURL=time.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    class UnionBuilder extends Builder {
      constructor(options) {
        super(options);
        this._typeIds = new DataBufferBuilder(new Int8Array(0), 1);
        if (typeof options["valueToChildTypeId"] === "function") {
          this._valueToChildTypeId = options["valueToChildTypeId"];
        }
      }
      get typeIdToChildIndex() {
        return this.type.typeIdToChildIndex;
      }
      append(value, childTypeId) {
        return this.set(this.length, value, childTypeId);
      }
      set(index, value, childTypeId) {
        if (childTypeId === undefined) {
          childTypeId = this._valueToChildTypeId(this, value, index);
        }
        if (this.setValid(index, this.isValid(value))) {
          this.setValue(index, value, childTypeId);
        }
        return this;
      }
      setValue(index, value, childTypeId) {
        this._typeIds.set(index, childTypeId);
        const childIndex = this.type.typeIdToChildIndex[childTypeId];
        const child = this.children[childIndex];
        child === null || child === void 0 ? void 0 : child.set(index, value);
      }
      addChild(child, name = `${this.children.length}`) {
        const childTypeId = this.children.push(child);
        const {
          type: { children, mode, typeIds },
        } = this;
        const fields = [...children, new schema_Field(name, child.type)];
        this.type = new Union_(mode, [...typeIds, childTypeId], fields);
        return childTypeId;
      }
      /** @ignore */
      // @ts-ignore
      _valueToChildTypeId(builder, value, offset) {
        throw new Error(`Cannot map UnionBuilder value to child typeId. \
Pass the \`childTypeId\` as the second argument to unionBuilder.append(), \
or supply a \`valueToChildTypeId\` function as part of the UnionBuilder constructor options.`);
      }
    }
    /** @ignore */
    class SparseUnionBuilder extends UnionBuilder {}
    /** @ignore */
    class DenseUnionBuilder extends UnionBuilder {
      constructor(options) {
        super(options);
        this._offsets = new DataBufferBuilder(new Int32Array(0));
      }
      /** @ignore */
      setValue(index, value, childTypeId) {
        const id = this._typeIds.set(index, childTypeId).buffer[index];
        const child = this.getChildAt(this.type.typeIdToChildIndex[id]);
        const denseIndex = this._offsets.set(index, child.length).buffer[index];
        child === null || child === void 0
          ? void 0
          : child.set(denseIndex, value);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/builder/utf8.mjs

    //# sourceMappingURL=union.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    class Utf8Builder extends VariableWidthBuilder {
      constructor(opts) {
        super(opts);
        this._values = new BufferBuilder(new Uint8Array(0));
      }
      get byteLength() {
        let size = this._pendingLength + this.length * 4;
        this._offsets && (size += this._offsets.byteLength);
        this._values && (size += this._values.byteLength);
        this._nulls && (size += this._nulls.byteLength);
        return size;
      }
      setValue(index, value) {
        return super.setValue(index, encodeUtf8(value));
      }
      // @ts-ignore
      _flushPending(pending, pendingLength) {}
    }
    Utf8Builder.prototype._flushPending = BinaryBuilder.prototype._flushPending; // CONCATENATED MODULE: ./node_modules/apache-arrow/visitor/builderctor.mjs

    //# sourceMappingURL=utf8.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    class GetBuilderCtor extends Visitor {
      visitNull() {
        return NullBuilder;
      }
      visitBool() {
        return BoolBuilder;
      }
      visitInt() {
        return IntBuilder;
      }
      visitInt8() {
        return Int8Builder;
      }
      visitInt16() {
        return Int16Builder;
      }
      visitInt32() {
        return Int32Builder;
      }
      visitInt64() {
        return Int64Builder;
      }
      visitUint8() {
        return Uint8Builder;
      }
      visitUint16() {
        return Uint16Builder;
      }
      visitUint32() {
        return Uint32Builder;
      }
      visitUint64() {
        return Uint64Builder;
      }
      visitFloat() {
        return FloatBuilder;
      }
      visitFloat16() {
        return Float16Builder;
      }
      visitFloat32() {
        return Float32Builder;
      }
      visitFloat64() {
        return Float64Builder;
      }
      visitUtf8() {
        return Utf8Builder;
      }
      visitBinary() {
        return BinaryBuilder;
      }
      visitFixedSizeBinary() {
        return FixedSizeBinaryBuilder;
      }
      visitDate() {
        return DateBuilder;
      }
      visitDateDay() {
        return DateDayBuilder;
      }
      visitDateMillisecond() {
        return DateMillisecondBuilder;
      }
      visitTimestamp() {
        return TimestampBuilder;
      }
      visitTimestampSecond() {
        return TimestampSecondBuilder;
      }
      visitTimestampMillisecond() {
        return TimestampMillisecondBuilder;
      }
      visitTimestampMicrosecond() {
        return TimestampMicrosecondBuilder;
      }
      visitTimestampNanosecond() {
        return TimestampNanosecondBuilder;
      }
      visitTime() {
        return TimeBuilder;
      }
      visitTimeSecond() {
        return TimeSecondBuilder;
      }
      visitTimeMillisecond() {
        return TimeMillisecondBuilder;
      }
      visitTimeMicrosecond() {
        return TimeMicrosecondBuilder;
      }
      visitTimeNanosecond() {
        return TimeNanosecondBuilder;
      }
      visitDecimal() {
        return DecimalBuilder;
      }
      visitList() {
        return ListBuilder;
      }
      visitStruct() {
        return StructBuilder;
      }
      visitUnion() {
        return UnionBuilder;
      }
      visitDenseUnion() {
        return DenseUnionBuilder;
      }
      visitSparseUnion() {
        return SparseUnionBuilder;
      }
      visitDictionary() {
        return DictionaryBuilder;
      }
      visitInterval() {
        return IntervalBuilder;
      }
      visitIntervalDayTime() {
        return IntervalDayTimeBuilder;
      }
      visitIntervalYearMonth() {
        return IntervalYearMonthBuilder;
      }
      visitFixedSizeList() {
        return FixedSizeListBuilder;
      }
      visitMap() {
        return MapBuilder;
      }
    }
    /** @ignore */
    const builderctor_instance = new GetBuilderCtor(); // CONCATENATED MODULE: ./node_modules/apache-arrow/visitor/typecomparator.mjs

    //# sourceMappingURL=builderctor.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    class TypeComparator extends Visitor {
      compareSchemas(schema, other) {
        return (
          schema === other ||
          (other instanceof schema.constructor &&
            this.compareManyFields(schema.fields, other.fields))
        );
      }
      compareManyFields(fields, others) {
        return (
          fields === others ||
          (Array.isArray(fields) &&
            Array.isArray(others) &&
            fields.length === others.length &&
            fields.every((f, i) => this.compareFields(f, others[i])))
        );
      }
      compareFields(field, other) {
        return (
          field === other ||
          (other instanceof field.constructor &&
            field.name === other.name &&
            field.nullable === other.nullable &&
            this.visit(field.type, other.type))
        );
      }
    }
    function compareConstructor(type, other) {
      return other instanceof type.constructor;
    }
    function compareAny(type, other) {
      return type === other || compareConstructor(type, other);
    }
    function compareInt(type, other) {
      return (
        type === other ||
        (compareConstructor(type, other) &&
          type.bitWidth === other.bitWidth &&
          type.isSigned === other.isSigned)
      );
    }
    function compareFloat(type, other) {
      return (
        type === other ||
        (compareConstructor(type, other) && type.precision === other.precision)
      );
    }
    function compareFixedSizeBinary(type, other) {
      return (
        type === other ||
        (compareConstructor(type, other) && type.byteWidth === other.byteWidth)
      );
    }
    function compareDate(type, other) {
      return (
        type === other ||
        (compareConstructor(type, other) && type.unit === other.unit)
      );
    }
    function compareTimestamp(type, other) {
      return (
        type === other ||
        (compareConstructor(type, other) &&
          type.unit === other.unit &&
          type.timezone === other.timezone)
      );
    }
    function compareTime(type, other) {
      return (
        type === other ||
        (compareConstructor(type, other) &&
          type.unit === other.unit &&
          type.bitWidth === other.bitWidth)
      );
    }
    function compareList(type, other) {
      return (
        type === other ||
        (compareConstructor(type, other) &&
          type.children.length === other.children.length &&
          typecomparator_instance.compareManyFields(
            type.children,
            other.children,
          ))
      );
    }
    function compareStruct(type, other) {
      return (
        type === other ||
        (compareConstructor(type, other) &&
          type.children.length === other.children.length &&
          typecomparator_instance.compareManyFields(
            type.children,
            other.children,
          ))
      );
    }
    function compareUnion(type, other) {
      return (
        type === other ||
        (compareConstructor(type, other) &&
          type.mode === other.mode &&
          type.typeIds.every((x, i) => x === other.typeIds[i]) &&
          typecomparator_instance.compareManyFields(
            type.children,
            other.children,
          ))
      );
    }
    function compareDictionary(type, other) {
      return (
        type === other ||
        (compareConstructor(type, other) &&
          type.id === other.id &&
          type.isOrdered === other.isOrdered &&
          typecomparator_instance.visit(type.indices, other.indices) &&
          typecomparator_instance.visit(type.dictionary, other.dictionary))
      );
    }
    function compareInterval(type, other) {
      return (
        type === other ||
        (compareConstructor(type, other) && type.unit === other.unit)
      );
    }
    function compareFixedSizeList(type, other) {
      return (
        type === other ||
        (compareConstructor(type, other) &&
          type.listSize === other.listSize &&
          type.children.length === other.children.length &&
          typecomparator_instance.compareManyFields(
            type.children,
            other.children,
          ))
      );
    }
    function compareMap(type, other) {
      return (
        type === other ||
        (compareConstructor(type, other) &&
          type.keysSorted === other.keysSorted &&
          type.children.length === other.children.length &&
          typecomparator_instance.compareManyFields(
            type.children,
            other.children,
          ))
      );
    }
    TypeComparator.prototype.visitNull = compareAny;
    TypeComparator.prototype.visitBool = compareAny;
    TypeComparator.prototype.visitInt = compareInt;
    TypeComparator.prototype.visitInt8 = compareInt;
    TypeComparator.prototype.visitInt16 = compareInt;
    TypeComparator.prototype.visitInt32 = compareInt;
    TypeComparator.prototype.visitInt64 = compareInt;
    TypeComparator.prototype.visitUint8 = compareInt;
    TypeComparator.prototype.visitUint16 = compareInt;
    TypeComparator.prototype.visitUint32 = compareInt;
    TypeComparator.prototype.visitUint64 = compareInt;
    TypeComparator.prototype.visitFloat = compareFloat;
    TypeComparator.prototype.visitFloat16 = compareFloat;
    TypeComparator.prototype.visitFloat32 = compareFloat;
    TypeComparator.prototype.visitFloat64 = compareFloat;
    TypeComparator.prototype.visitUtf8 = compareAny;
    TypeComparator.prototype.visitBinary = compareAny;
    TypeComparator.prototype.visitFixedSizeBinary = compareFixedSizeBinary;
    TypeComparator.prototype.visitDate = compareDate;
    TypeComparator.prototype.visitDateDay = compareDate;
    TypeComparator.prototype.visitDateMillisecond = compareDate;
    TypeComparator.prototype.visitTimestamp = compareTimestamp;
    TypeComparator.prototype.visitTimestampSecond = compareTimestamp;
    TypeComparator.prototype.visitTimestampMillisecond = compareTimestamp;
    TypeComparator.prototype.visitTimestampMicrosecond = compareTimestamp;
    TypeComparator.prototype.visitTimestampNanosecond = compareTimestamp;
    TypeComparator.prototype.visitTime = compareTime;
    TypeComparator.prototype.visitTimeSecond = compareTime;
    TypeComparator.prototype.visitTimeMillisecond = compareTime;
    TypeComparator.prototype.visitTimeMicrosecond = compareTime;
    TypeComparator.prototype.visitTimeNanosecond = compareTime;
    TypeComparator.prototype.visitDecimal = compareAny;
    TypeComparator.prototype.visitList = compareList;
    TypeComparator.prototype.visitStruct = compareStruct;
    TypeComparator.prototype.visitUnion = compareUnion;
    TypeComparator.prototype.visitDenseUnion = compareUnion;
    TypeComparator.prototype.visitSparseUnion = compareUnion;
    TypeComparator.prototype.visitDictionary = compareDictionary;
    TypeComparator.prototype.visitInterval = compareInterval;
    TypeComparator.prototype.visitIntervalDayTime = compareInterval;
    TypeComparator.prototype.visitIntervalYearMonth = compareInterval;
    TypeComparator.prototype.visitFixedSizeList = compareFixedSizeList;
    TypeComparator.prototype.visitMap = compareMap;
    /** @ignore */
    const typecomparator_instance = new TypeComparator();
    function compareSchemas(schema, other) {
      return typecomparator_instance.compareSchemas(schema, other);
    }
    function compareFields(field, other) {
      return typecomparator_instance.compareFields(field, other);
    }
    function compareTypes(type, other) {
      return typecomparator_instance.visit(type, other);
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/factories.mjs

    //# sourceMappingURL=typecomparator.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    function makeBuilder(options) {
      const type = options.type;
      const builder = new (builderctor_instance.getVisitFn(type)())(options);
      if (type.children && type.children.length > 0) {
        const children = options["children"] || [];
        const defaultOptions = { nullValues: options["nullValues"] };
        const getChildOptions = Array.isArray(children)
          ? (_, i) => children[i] || defaultOptions
          : ({ name }) => children[name] || defaultOptions;
        for (const [index, field] of type.children.entries()) {
          const { type } = field;
          const opts = getChildOptions(field, index);
          builder.children.push(
            makeBuilder(Object.assign(Object.assign({}, opts), { type })),
          );
        }
      }
      return builder;
    }
    function vectorFromArray(init, type) {
      if (
        init instanceof Data ||
        init instanceof Vector ||
        init.type instanceof DataType ||
        ArrayBuffer.isView(init)
      ) {
        return makeVector(init);
      }
      const options = {
        type: type !== null && type !== void 0 ? type : inferType(init),
        nullValues: [null],
      };
      const chunks = [...builderThroughIterable(options)(init)];
      const vector =
        chunks.length === 1 ? chunks[0] : chunks.reduce((a, b) => a.concat(b));
      if (DataType.isDictionary(vector.type)) {
        return vector.memoize();
      }
      return vector;
    }
    /**
     * Creates a {@link Table} from an array of objects.
     *
     * @param array A table of objects.
     */
    function tableFromJSON(array) {
      const vector = vectorFromArray(array);
      const batch = new RecordBatch(
        new schema_Schema(vector.type.children),
        vector.data[0],
      );
      return new Table(batch);
    }
    function inferType(value) {
      if (value.length === 0) {
        return new Null();
      }
      let nullsCount = 0;
      let arraysCount = 0;
      let objectsCount = 0;
      let numbersCount = 0;
      let stringsCount = 0;
      let bigintsCount = 0;
      let booleansCount = 0;
      let datesCount = 0;
      for (const val of value) {
        if (val == null) {
          ++nullsCount;
          continue;
        }
        switch (typeof val) {
          case "bigint":
            ++bigintsCount;
            continue;
          case "boolean":
            ++booleansCount;
            continue;
          case "number":
            ++numbersCount;
            continue;
          case "string":
            ++stringsCount;
            continue;
          case "object":
            if (Array.isArray(val)) {
              ++arraysCount;
            } else if (
              Object.prototype.toString.call(val) === "[object Date]"
            ) {
              ++datesCount;
            } else {
              ++objectsCount;
            }
            continue;
        }
        throw new TypeError(
          "Unable to infer Vector type from input values, explicit type declaration expected",
        );
      }
      if (numbersCount + nullsCount === value.length) {
        return new Float64();
      } else if (stringsCount + nullsCount === value.length) {
        return new Dictionary(new Utf8(), new Int32());
      } else if (bigintsCount + nullsCount === value.length) {
        return new Int64();
      } else if (booleansCount + nullsCount === value.length) {
        return new Bool();
      } else if (datesCount + nullsCount === value.length) {
        return new DateMillisecond();
      } else if (arraysCount + nullsCount === value.length) {
        const array = value;
        const childType = inferType(
          array[array.findIndex((ary) => ary != null)],
        );
        if (
          array.every(
            (ary) => ary == null || compareTypes(childType, inferType(ary)),
          )
        ) {
          return new List(new schema_Field("", childType, true));
        }
      } else if (objectsCount + nullsCount === value.length) {
        const fields = new Map();
        for (const row of value) {
          for (const key of Object.keys(row)) {
            if (!fields.has(key) && row[key] != null) {
              // use the type inferred for the first instance of a found key
              fields.set(
                key,
                new schema_Field(key, inferType([row[key]]), true),
              );
            }
          }
        }
        return new Struct([...fields.values()]);
      }
      throw new TypeError(
        "Unable to infer Vector type from input values, explicit type declaration expected",
      );
    }
    /**
     * Transform a synchronous `Iterable` of arbitrary JavaScript values into a
     * sequence of Arrow Vector<T> following the chunking semantics defined in
     * the supplied `options` argument.
     *
     * This function returns a function that accepts an `Iterable` of values to
     * transform. When called, this function returns an Iterator of `Vector<T>`.
     *
     * The resulting `Iterator<Vector<T>>` yields Vectors based on the
     * `queueingStrategy` and `highWaterMark` specified in the `options` argument.
     *
     * * If `queueingStrategy` is `"count"` (or omitted), The `Iterator<Vector<T>>`
     *   will flush the underlying `Builder` (and yield a new `Vector<T>`) once the
     *   Builder's `length` reaches or exceeds the supplied `highWaterMark`.
     * * If `queueingStrategy` is `"bytes"`, the `Iterator<Vector<T>>` will flush
     *   the underlying `Builder` (and yield a new `Vector<T>`) once its `byteLength`
     *   reaches or exceeds the supplied `highWaterMark`.
     *
     * @param {IterableBuilderOptions<T, TNull>} options An object of properties which determine the `Builder` to create and the chunking semantics to use.
     * @returns A function which accepts a JavaScript `Iterable` of values to
     *          write, and returns an `Iterator` that yields Vectors according
     *          to the chunking semantics defined in the `options` argument.
     * @nocollapse
     */
    function builderThroughIterable(options) {
      const { ["queueingStrategy"]: queueingStrategy = "count" } = options;
      const {
        ["highWaterMark"]: highWaterMark = queueingStrategy !== "bytes"
          ? Number.POSITIVE_INFINITY
          : Math.pow(2, 14),
      } = options;
      const sizeProperty =
        queueingStrategy !== "bytes" ? "length" : "byteLength";
      return function* (source) {
        let numChunks = 0;
        const builder = makeBuilder(options);
        for (const value of source) {
          if (builder.append(value)[sizeProperty] >= highWaterMark) {
            ++numChunks && (yield builder.toVector());
          }
        }
        if (builder.finish().length > 0 || numChunks === 0) {
          yield builder.toVector();
        }
      };
    }
    /**
     * Transform an `AsyncIterable` of arbitrary JavaScript values into a
     * sequence of Arrow Vector<T> following the chunking semantics defined in
     * the supplied `options` argument.
     *
     * This function returns a function that accepts an `AsyncIterable` of values to
     * transform. When called, this function returns an AsyncIterator of `Vector<T>`.
     *
     * The resulting `AsyncIterator<Vector<T>>` yields Vectors based on the
     * `queueingStrategy` and `highWaterMark` specified in the `options` argument.
     *
     * * If `queueingStrategy` is `"count"` (or omitted), The `AsyncIterator<Vector<T>>`
     *   will flush the underlying `Builder` (and yield a new `Vector<T>`) once the
     *   Builder's `length` reaches or exceeds the supplied `highWaterMark`.
     * * If `queueingStrategy` is `"bytes"`, the `AsyncIterator<Vector<T>>` will flush
     *   the underlying `Builder` (and yield a new `Vector<T>`) once its `byteLength`
     *   reaches or exceeds the supplied `highWaterMark`.
     *
     * @param {IterableBuilderOptions<T, TNull>} options An object of properties which determine the `Builder` to create and the chunking semantics to use.
     * @returns A function which accepts a JavaScript `AsyncIterable` of values
     *          to write, and returns an `AsyncIterator` that yields Vectors
     *          according to the chunking semantics defined in the `options`
     *          argument.
     * @nocollapse
     */
    function builderThroughAsyncIterable(options) {
      const { ["queueingStrategy"]: queueingStrategy = "count" } = options;
      const {
        ["highWaterMark"]: highWaterMark = queueingStrategy !== "bytes"
          ? Number.POSITIVE_INFINITY
          : Math.pow(2, 14),
      } = options;
      const sizeProperty =
        queueingStrategy !== "bytes" ? "length" : "byteLength";
      return function (source) {
        return __asyncGenerator(this, arguments, function* () {
          var e_1, _a;
          let numChunks = 0;
          const builder = makeBuilder(options);
          try {
            for (
              var source_1 = __asyncValues(source), source_1_1;
              (source_1_1 = yield __await(source_1.next())), !source_1_1.done;

            ) {
              const value = source_1_1.value;
              if (builder.append(value)[sizeProperty] >= highWaterMark) {
                ++numChunks && (yield yield __await(builder.toVector()));
              }
            }
          } catch (e_1_1) {
            e_1 = { error: e_1_1 };
          } finally {
            try {
              if (source_1_1 && !source_1_1.done && (_a = source_1.return))
                yield __await(_a.call(source_1));
            } finally {
              if (e_1) throw e_1.error;
            }
          }
          if (builder.finish().length > 0 || numChunks === 0) {
            yield yield __await(builder.toVector());
          }
        });
      };
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/util/recordbatch.mjs

    //# sourceMappingURL=factories.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    function distributeVectorsIntoRecordBatches(schema, vecs) {
      return uniformlyDistributeChunksAcrossRecordBatches(
        schema,
        vecs.map((v) => v.data.concat()),
      );
    }
    /** @ignore */
    function uniformlyDistributeChunksAcrossRecordBatches(schema, cols) {
      const fields = [...schema.fields];
      const batches = [];
      const memo = {
        numBatches: cols.reduce((n, c) => Math.max(n, c.length), 0),
      };
      let numBatches = 0,
        batchLength = 0;
      let i = -1;
      const numColumns = cols.length;
      let child,
        children = [];
      while (memo.numBatches-- > 0) {
        for (
          batchLength = Number.POSITIVE_INFINITY, i = -1;
          ++i < numColumns;

        ) {
          children[i] = child = cols[i].shift();
          batchLength = Math.min(
            batchLength,
            child ? child.length : batchLength,
          );
        }
        if (Number.isFinite(batchLength)) {
          children = distributeChildren(
            fields,
            batchLength,
            children,
            cols,
            memo,
          );
          if (batchLength > 0) {
            batches[numBatches++] = makeData({
              type: new Struct(fields),
              length: batchLength,
              nullCount: 0,
              children: children.slice(),
            });
          }
        }
      }
      return [
        (schema = schema.assign(fields)),
        batches.map((data) => new RecordBatch(schema, data)),
      ];
    }
    /** @ignore */
    function distributeChildren(fields, batchLength, children, columns, memo) {
      var _a;
      const nullBitmapSize = ((batchLength + 63) & ~63) >> 3;
      for (let i = -1, n = columns.length; ++i < n; ) {
        const child = children[i];
        const length =
          child === null || child === void 0 ? void 0 : child.length;
        if (length >= batchLength) {
          if (length === batchLength) {
            children[i] = child;
          } else {
            children[i] = child.slice(0, batchLength);
            memo.numBatches = Math.max(
              memo.numBatches,
              columns[i].unshift(
                child.slice(batchLength, length - batchLength),
              ),
            );
          }
        } else {
          const field = fields[i];
          fields[i] = field.clone({ nullable: true });
          children[i] =
            (_a =
              child === null || child === void 0
                ? void 0
                : child._changeLengthAndBackfillNullBitmap(batchLength)) !==
              null && _a !== void 0
              ? _a
              : makeData({
                  type: field.type,
                  length: batchLength,
                  nullCount: batchLength,
                  nullBitmap: new Uint8Array(nullBitmapSize),
                });
        }
      }
      return children;
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/table.mjs

    //# sourceMappingURL=recordbatch.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.
    var table_a;

    /**
     * Tables are collections of {@link Vector}s and have a {@link Schema}. Use the convenience methods {@link makeTable}
     * or {@link tableFromArrays} to create a table in JavaScript. To create a table from the IPC format, use
     * {@link tableFromIPC}.
     */
    class Table {
      constructor(...args) {
        var _b, _c;
        if (args.length === 0) {
          this.batches = [];
          this.schema = new schema_Schema([]);
          this._offsets = [0];
          return this;
        }
        let schema;
        let offsets;
        if (args[0] instanceof schema_Schema) {
          schema = args.shift();
        }
        if (args[args.length - 1] instanceof Uint32Array) {
          offsets = args.pop();
        }
        const unwrap = (x) => {
          if (x) {
            if (x instanceof RecordBatch) {
              return [x];
            } else if (x instanceof Table) {
              return x.batches;
            } else if (x instanceof Data) {
              if (x.type instanceof Struct) {
                return [new RecordBatch(new schema_Schema(x.type.children), x)];
              }
            } else if (Array.isArray(x)) {
              return x.flatMap((v) => unwrap(v));
            } else if (typeof x[Symbol.iterator] === "function") {
              return [...x].flatMap((v) => unwrap(v));
            } else if (typeof x === "object") {
              const keys = Object.keys(x);
              const vecs = keys.map((k) => new Vector([x[k]]));
              const schema = new schema_Schema(
                keys.map((k, i) => new schema_Field(String(k), vecs[i].type)),
              );
              const [, batches] = distributeVectorsIntoRecordBatches(
                schema,
                vecs,
              );
              return batches.length === 0 ? [new RecordBatch(x)] : batches;
            }
          }
          return [];
        };
        const batches = args.flatMap((v) => unwrap(v));
        schema =
          (_c =
            schema !== null && schema !== void 0
              ? schema
              : (_b = batches[0]) === null || _b === void 0
              ? void 0
              : _b.schema) !== null && _c !== void 0
            ? _c
            : new schema_Schema([]);
        if (!(schema instanceof schema_Schema)) {
          throw new TypeError(
            "Table constructor expects a [Schema, RecordBatch[]] pair.",
          );
        }
        for (const batch of batches) {
          if (!(batch instanceof RecordBatch)) {
            throw new TypeError(
              "Table constructor expects a [Schema, RecordBatch[]] pair.",
            );
          }
          if (!compareSchemas(schema, batch.schema)) {
            throw new TypeError(
              "Table and inner RecordBatch schemas must be equivalent.",
            );
          }
        }
        this.schema = schema;
        this.batches = batches;
        this._offsets =
          offsets !== null && offsets !== void 0
            ? offsets
            : computeChunkOffsets(this.data);
      }
      /**
       * The contiguous {@link RecordBatch `RecordBatch`} chunks of the Table rows.
       */
      get data() {
        return this.batches.map(({ data }) => data);
      }
      /**
       * The number of columns in this Table.
       */
      get numCols() {
        return this.schema.fields.length;
      }
      /**
       * The number of rows in this Table.
       */
      get numRows() {
        return this.data.reduce((numRows, data) => numRows + data.length, 0);
      }
      /**
       * The number of null rows in this Table.
       */
      get nullCount() {
        if (this._nullCount === -1) {
          this._nullCount = computeChunkNullCounts(this.data);
        }
        return this._nullCount;
      }
      /**
       * Check whether an element is null.
       *
       * @param index The index at which to read the validity bitmap.
       */
      // @ts-ignore
      isValid(index) {
        return false;
      }
      /**
       * Get an element value by position.
       *
       * @param index The index of the element to read.
       */
      // @ts-ignore
      get(index) {
        return null;
      }
      /**
       * Set an element value by position.
       *
       * @param index The index of the element to write.
       * @param value The value to set.
       */
      // @ts-ignore
      set(index, value) {
        return;
      }
      /**
       * Retrieve the index of the first occurrence of a value in an Vector.
       *
       * @param element The value to locate in the Vector.
       * @param offset The index at which to begin the search. If offset is omitted, the search starts at index 0.
       */
      // @ts-ignore
      indexOf(element, offset) {
        return -1;
      }
      /**
       * Get the size in bytes of an element by index.
       * @param index The index at which to get the byteLength.
       */
      // @ts-ignore
      getByteLength(index) {
        return 0;
      }
      /**
       * Iterator for rows in this Table.
       */
      [Symbol.iterator]() {
        return iterator_instance.visit(new Vector(this.data));
      }
      /**
       * Return a JavaScript Array of the Table rows.
       *
       * @returns An Array of Table rows.
       */
      toArray() {
        return [...this];
      }
      /**
       * Returns a string representation of the Table rows.
       *
       * @returns A string representation of the Table rows.
       */
      toString() {
        return `[\n  ${this.toArray().join(",\n  ")}\n]`;
      }
      /**
       * Combines two or more Tables of the same schema.
       *
       * @param others Additional Tables to add to the end of this Tables.
       */
      concat(...others) {
        const schema = this.schema;
        const data = this.data.concat(others.flatMap(({ data }) => data));
        return new Table(
          schema,
          data.map((data) => new RecordBatch(schema, data)),
        );
      }
      /**
       * Return a zero-copy sub-section of this Table.
       *
       * @param begin The beginning of the specified portion of the Table.
       * @param end The end of the specified portion of the Table. This is exclusive of the element at the index 'end'.
       */
      slice(begin, end) {
        const schema = this.schema;
        [begin, end] = clampRange({ length: this.numRows }, begin, end);
        const data = sliceChunks(this.data, this._offsets, begin, end);
        return new Table(
          schema,
          data.map((chunk) => new RecordBatch(schema, chunk)),
        );
      }
      /**
       * Returns a child Vector by name, or null if this Vector has no child with the given name.
       *
       * @param name The name of the child to retrieve.
       */
      getChild(name) {
        return this.getChildAt(
          this.schema.fields.findIndex((f) => f.name === name),
        );
      }
      /**
       * Returns a child Vector by index, or null if this Vector has no child at the supplied index.
       *
       * @param index The index of the child to retrieve.
       */
      getChildAt(index) {
        if (index > -1 && index < this.schema.fields.length) {
          const data = this.data.map((data) => data.children[index]);
          if (data.length === 0) {
            const { type } = this.schema.fields[index];
            const empty = makeData({ type, length: 0, nullCount: 0 });
            data.push(empty._changeLengthAndBackfillNullBitmap(this.numRows));
          }
          return new Vector(data);
        }
        return null;
      }
      /**
       * Sets a child Vector by name.
       *
       * @param name The name of the child to overwrite.
       * @returns A new Table with the supplied child for the specified name.
       */
      setChild(name, child) {
        var _b;
        return this.setChildAt(
          (_b = this.schema.fields) === null || _b === void 0
            ? void 0
            : _b.findIndex((f) => f.name === name),
          child,
        );
      }
      setChildAt(index, child) {
        let schema = this.schema;
        let batches = [...this.batches];
        if (index > -1 && index < this.numCols) {
          if (!child) {
            child = new Vector([
              makeData({ type: new Null(), length: this.numRows }),
            ]);
          }
          const fields = schema.fields.slice();
          const field = fields[index].clone({ type: child.type });
          const children = this.schema.fields.map((_, i) => this.getChildAt(i));
          [fields[index], children[index]] = [field, child];
          [schema, batches] = distributeVectorsIntoRecordBatches(
            schema,
            children,
          );
        }
        return new Table(schema, batches);
      }
      /**
       * Construct a new Table containing only specified columns.
       *
       * @param columnNames Names of columns to keep.
       * @returns A new Table of columns matching the specified names.
       */
      select(columnNames) {
        const nameToIndex = this.schema.fields.reduce(
          (m, f, i) => m.set(f.name, i),
          new Map(),
        );
        return this.selectAt(
          columnNames
            .map((columnName) => nameToIndex.get(columnName))
            .filter((x) => x > -1),
        );
      }
      /**
       * Construct a new Table containing only columns at the specified indices.
       *
       * @param columnIndices Indices of columns to keep.
       * @returns A new Table of columns at the specified indices.
       */
      selectAt(columnIndices) {
        const schema = this.schema.selectAt(columnIndices);
        const data = this.batches.map((batch) => batch.selectAt(columnIndices));
        return new Table(schema, data);
      }
      assign(other) {
        const fields = this.schema.fields;
        const [indices, oldToNew] = other.schema.fields.reduce(
          (memo, f2, newIdx) => {
            const [indices, oldToNew] = memo;
            const i = fields.findIndex((f) => f.name === f2.name);
            ~i ? (oldToNew[i] = newIdx) : indices.push(newIdx);
            return memo;
          },
          [[], []],
        );
        const schema = this.schema.assign(other.schema);
        const columns = [
          ...fields
            .map((_, i) => [i, oldToNew[i]])
            .map(([i, j]) =>
              j === undefined ? this.getChildAt(i) : other.getChildAt(j),
            ),
          ...indices.map((i) => other.getChildAt(i)),
        ].filter(Boolean);
        return new Table(
          ...distributeVectorsIntoRecordBatches(schema, columns),
        );
      }
    }
    table_a = Symbol.toStringTag;
    // Initialize this static property via an IIFE so bundlers don't tree-shake
    // out this logic, but also so we're still compliant with `"sideEffects": false`
    Table[table_a] = ((proto) => {
      proto.schema = null;
      proto.batches = [];
      proto._offsets = new Uint32Array([0]);
      proto._nullCount = -1;
      proto[Symbol.isConcatSpreadable] = true;
      proto["isValid"] = wrapChunkedCall1(isChunkedValid);
      proto["get"] = wrapChunkedCall1(get_instance.getVisitFn(Type.Struct));
      proto["set"] = wrapChunkedCall2(instance.getVisitFn(Type.Struct));
      proto["indexOf"] = wrapChunkedIndexOf(
        indexof_instance.getVisitFn(Type.Struct),
      );
      proto["getByteLength"] = wrapChunkedCall1(
        bytelength_instance.getVisitFn(Type.Struct),
      );
      return "Table";
    })(Table.prototype);
    /**
     * Creates a new Table from an object of typed arrays.
     *
     *  @example
     * ```ts
     * const table = makeTable({
     *   a: new Int8Array([1, 2, 3]),
     * })
     * ```
     *
     * @param input Input an object of typed arrays.
     * @returns A new Table.
     */
    function makeTable(input) {
      const vecs = {};
      const inputs = Object.entries(input);
      for (const [key, col] of inputs) {
        vecs[key] = makeVector(col);
      }
      return new Table(vecs);
    }
    /**
     * Creates a new Table from an object of typed arrays or JavaScript arrays.
     *
     *  @example
     * ```ts
     * const table = tableFromArrays({
     *   a: [1, 2, 3],
     *   b: new Int8Array([1, 2, 3]),
     * })
     * ```
     *
     * @param input Input an object of typed arrays or JavaScript arrays.
     * @returns A new Table.
     */
    function tableFromArrays(input) {
      const vecs = {};
      const inputs = Object.entries(input);
      for (const [key, col] of inputs) {
        vecs[key] = vectorFromArray(col);
      }
      return new Table(vecs);
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/recordbatch.mjs

    //# sourceMappingURL=table.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.
    var recordbatch_a;

    /** @ignore */
    class RecordBatch {
      constructor(...args) {
        switch (args.length) {
          case 2: {
            [this.schema] = args;
            if (!(this.schema instanceof schema_Schema)) {
              throw new TypeError(
                "RecordBatch constructor expects a [Schema, Data] pair.",
              );
            }
            [
              ,
              this.data = makeData({
                nullCount: 0,
                type: new Struct(this.schema.fields),
                children: this.schema.fields.map((f) =>
                  makeData({ type: f.type, nullCount: 0 }),
                ),
              }),
            ] = args;
            if (!(this.data instanceof Data)) {
              throw new TypeError(
                "RecordBatch constructor expects a [Schema, Data] pair.",
              );
            }
            [this.schema, this.data] = ensureSameLengthData(
              this.schema,
              this.data.children,
            );
            break;
          }
          case 1: {
            const [obj] = args;
            const { fields, children, length } = Object.keys(obj).reduce(
              (memo, name, i) => {
                memo.children[i] = obj[name];
                memo.length = Math.max(memo.length, obj[name].length);
                memo.fields[i] = schema_Field["new"]({
                  name,
                  type: obj[name].type,
                  nullable: true,
                });
                return memo;
              },
              {
                length: 0,
                fields: new Array(),
                children: new Array(),
              },
            );
            const schema = new schema_Schema(fields);
            const data = makeData({
              type: new Struct(fields),
              length,
              children,
              nullCount: 0,
            });
            [this.schema, this.data] = ensureSameLengthData(
              schema,
              data.children,
              length,
            );
            break;
          }
          default:
            throw new TypeError(
              "RecordBatch constructor expects an Object mapping names to child Data, or a [Schema, Data] pair.",
            );
        }
      }
      get dictionaries() {
        return (
          this._dictionaries ||
          (this._dictionaries = collectDictionaries(
            this.schema.fields,
            this.data.children,
          ))
        );
      }
      /**
       * The number of columns in this RecordBatch.
       */
      get numCols() {
        return this.schema.fields.length;
      }
      /**
       * The number of rows in this RecordBatch.
       */
      get numRows() {
        return this.data.length;
      }
      /**
       * The number of null rows in this RecordBatch.
       */
      get nullCount() {
        return this.data.nullCount;
      }
      /**
       * Check whether an element is null.
       * @param index The index at which to read the validity bitmap.
       */
      isValid(index) {
        return this.data.getValid(index);
      }
      /**
       * Get a row by position.
       * @param index The index of the element to read.
       */
      get(index) {
        return get_instance.visit(this.data, index);
      }
      /**
       * Set a row by position.
       * @param index The index of the element to write.
       * @param value The value to set.
       */
      set(index, value) {
        return instance.visit(this.data, index, value);
      }
      /**
       * Retrieve the index of the first occurrence of a row in an RecordBatch.
       * @param element The row to locate in the RecordBatch.
       * @param offset The index at which to begin the search. If offset is omitted, the search starts at index 0.
       */
      indexOf(element, offset) {
        return indexof_instance.visit(this.data, element, offset);
      }
      /**
       * Get the size (in bytes) of a row by index.
       * @param index The row index for which to compute the byteLength.
       */
      getByteLength(index) {
        return bytelength_instance.visit(this.data, index);
      }
      /**
       * Iterator for rows in this RecordBatch.
       */
      [Symbol.iterator]() {
        return iterator_instance.visit(new Vector([this.data]));
      }
      /**
       * Return a JavaScript Array of the RecordBatch rows.
       * @returns An Array of RecordBatch rows.
       */
      toArray() {
        return [...this];
      }
      /**
       * Combines two or more RecordBatch of the same schema.
       * @param others Additional RecordBatch to add to the end of this RecordBatch.
       */
      concat(...others) {
        return new Table(this.schema, [this, ...others]);
      }
      /**
       * Return a zero-copy sub-section of this RecordBatch.
       * @param start The beginning of the specified portion of the RecordBatch.
       * @param end The end of the specified portion of the RecordBatch. This is exclusive of the element at the index 'end'.
       */
      slice(begin, end) {
        const [slice] = new Vector([this.data]).slice(begin, end).data;
        return new RecordBatch(this.schema, slice);
      }
      /**
       * Returns a child Vector by name, or null if this Vector has no child with the given name.
       * @param name The name of the child to retrieve.
       */
      getChild(name) {
        var _b;
        return this.getChildAt(
          (_b = this.schema.fields) === null || _b === void 0
            ? void 0
            : _b.findIndex((f) => f.name === name),
        );
      }
      /**
       * Returns a child Vector by index, or null if this Vector has no child at the supplied index.
       * @param index The index of the child to retrieve.
       */
      getChildAt(index) {
        if (index > -1 && index < this.schema.fields.length) {
          return new Vector([this.data.children[index]]);
        }
        return null;
      }
      /**
       * Sets a child Vector by name.
       * @param name The name of the child to overwrite.
       * @returns A new RecordBatch with the new child for the specified name.
       */
      setChild(name, child) {
        var _b;
        return this.setChildAt(
          (_b = this.schema.fields) === null || _b === void 0
            ? void 0
            : _b.findIndex((f) => f.name === name),
          child,
        );
      }
      setChildAt(index, child) {
        let schema = this.schema;
        let data = this.data;
        if (index > -1 && index < this.numCols) {
          if (!child) {
            child = new Vector([
              makeData({ type: new Null(), length: this.numRows }),
            ]);
          }
          const fields = schema.fields.slice();
          const children = data.children.slice();
          const field = fields[index].clone({ type: child.type });
          [fields[index], children[index]] = [field, child.data[0]];
          schema = new schema_Schema(fields, new Map(this.schema.metadata));
          data = makeData({ type: new Struct(fields), children });
        }
        return new RecordBatch(schema, data);
      }
      /**
       * Construct a new RecordBatch containing only specified columns.
       *
       * @param columnNames Names of columns to keep.
       * @returns A new RecordBatch of columns matching the specified names.
       */
      select(columnNames) {
        const schema = this.schema.select(columnNames);
        const type = new Struct(schema.fields);
        const children = [];
        for (const name of columnNames) {
          const index = this.schema.fields.findIndex((f) => f.name === name);
          if (~index) {
            children[index] = this.data.children[index];
          }
        }
        return new RecordBatch(
          schema,
          makeData({ type, length: this.numRows, children }),
        );
      }
      /**
       * Construct a new RecordBatch containing only columns at the specified indices.
       *
       * @param columnIndices Indices of columns to keep.
       * @returns A new RecordBatch of columns matching at the specified indices.
       */
      selectAt(columnIndices) {
        const schema = this.schema.selectAt(columnIndices);
        const children = columnIndices
          .map((i) => this.data.children[i])
          .filter(Boolean);
        const subset = makeData({
          type: new Struct(schema.fields),
          length: this.numRows,
          children,
        });
        return new RecordBatch(schema, subset);
      }
    }
    recordbatch_a = Symbol.toStringTag;
    // Initialize this static property via an IIFE so bundlers don't tree-shake
    // out this logic, but also so we're still compliant with `"sideEffects": false`
    RecordBatch[recordbatch_a] = ((proto) => {
      proto._nullCount = -1;
      proto[Symbol.isConcatSpreadable] = true;
      return "RecordBatch";
    })(RecordBatch.prototype);
    /** @ignore */
    function ensureSameLengthData(
      schema,
      chunks,
      maxLength = chunks.reduce((max, col) => Math.max(max, col.length), 0),
    ) {
      var _b;
      const fields = [...schema.fields];
      const children = [...chunks];
      const nullBitmapSize = ((maxLength + 63) & ~63) >> 3;
      for (const [idx, field] of schema.fields.entries()) {
        const chunk = chunks[idx];
        if (!chunk || chunk.length !== maxLength) {
          fields[idx] = field.clone({ nullable: true });
          children[idx] =
            (_b =
              chunk === null || chunk === void 0
                ? void 0
                : chunk._changeLengthAndBackfillNullBitmap(maxLength)) !==
              null && _b !== void 0
              ? _b
              : makeData({
                  type: field.type,
                  length: maxLength,
                  nullCount: maxLength,
                  nullBitmap: new Uint8Array(nullBitmapSize),
                });
        }
      }
      return [
        schema.assign(fields),
        makeData({ type: new Struct(fields), length: maxLength, children }),
      ];
    }
    /** @ignore */
    function collectDictionaries(fields, children, dictionaries = new Map()) {
      for (let i = -1, n = fields.length; ++i < n; ) {
        const field = fields[i];
        const type = field.type;
        const data = children[i];
        if (DataType.isDictionary(type)) {
          if (!dictionaries.has(type.id)) {
            if (data.dictionary) {
              dictionaries.set(type.id, data.dictionary);
            }
          } else if (dictionaries.get(type.id) !== data.dictionary) {
            throw new Error(
              `Cannot create Schema containing two different dictionaries with the same Id`,
            );
          }
        }
        if (type.children && type.children.length > 0) {
          collectDictionaries(type.children, data.children, dictionaries);
        }
      }
      return dictionaries;
    }
    /**
     * An internal class used by the `RecordBatchReader` and `RecordBatchWriter`
     * implementations to differentiate between a stream with valid zero-length
     * RecordBatches, and a stream with a Schema message, but no RecordBatches.
     * @see https://github.com/apache/arrow/pull/4373
     * @ignore
     * @private
     */
    class _InternalEmptyPlaceholderRecordBatch extends RecordBatch {
      constructor(schema) {
        const children = schema.fields.map((f) => makeData({ type: f.type }));
        const data = makeData({
          type: new Struct(schema.fields),
          nullCount: 0,
          children,
        });
        super(schema, data);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/body-compression-method.mjs

    //# sourceMappingURL=recordbatch.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify
    /**
     * Provided for forward compatibility in case we need to support different
     * strategies for compressing the IPC message body (like whole-body
     * compression rather than buffer-level) in the future
     */
    var BodyCompressionMethod;
    (function (BodyCompressionMethod) {
      /**
       * Each constituent buffer is first compressed with the indicated
       * compressor, and then written with the uncompressed length in the first 8
       * bytes as a 64-bit little-endian signed integer followed by the compressed
       * buffer bytes (and then padding as required by the protocol). The
       * uncompressed length may be set to -1 to indicate that the data that
       * follows is not compressed, which can be useful for cases where
       * compression does not yield appreciable savings.
       */
      BodyCompressionMethod[(BodyCompressionMethod["BUFFER"] = 0)] = "BUFFER";
    })(BodyCompressionMethod || (BodyCompressionMethod = {})); // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/compression-type.mjs

    //# sourceMappingURL=body-compression-method.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify
    var CompressionType;
    (function (CompressionType) {
      CompressionType[(CompressionType["LZ4_FRAME"] = 0)] = "LZ4_FRAME";
      CompressionType[(CompressionType["ZSTD"] = 1)] = "ZSTD";
    })(CompressionType || (CompressionType = {})); // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/body-compression.mjs

    //# sourceMappingURL=compression-type.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    /**
     * Optional compression for the memory buffers constituting IPC message
     * bodies. Intended for use with RecordBatch but could be used for other
     * message types
     */
    class BodyCompression {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsBodyCompression(bb, obj) {
        return (obj || new BodyCompression()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsBodyCompression(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new BodyCompression()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      /**
       * Compressor library.
       * For LZ4_FRAME, each compressed buffer must consist of a single frame.
       */
      codec() {
        const offset = this.bb.__offset(this.bb_pos, 4);
        return offset
          ? this.bb.readInt8(this.bb_pos + offset)
          : CompressionType.LZ4_FRAME;
      }
      /**
       * Indicates the way the record batch body was compressed
       */
      method() {
        const offset = this.bb.__offset(this.bb_pos, 6);
        return offset
          ? this.bb.readInt8(this.bb_pos + offset)
          : BodyCompressionMethod.BUFFER;
      }
      static startBodyCompression(builder) {
        builder.startObject(2);
      }
      static addCodec(builder, codec) {
        builder.addFieldInt8(0, codec, CompressionType.LZ4_FRAME);
      }
      static addMethod(builder, method) {
        builder.addFieldInt8(1, method, BodyCompressionMethod.BUFFER);
      }
      static endBodyCompression(builder) {
        const offset = builder.endObject();
        return offset;
      }
      static createBodyCompression(builder, codec, method) {
        BodyCompression.startBodyCompression(builder);
        BodyCompression.addCodec(builder, codec);
        BodyCompression.addMethod(builder, method);
        return BodyCompression.endBodyCompression(builder);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/buffer.mjs

    //# sourceMappingURL=body-compression.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify
    /**
     * ----------------------------------------------------------------------
     * A Buffer represents a single contiguous memory segment
     */
    class Buffer {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      /**
       * The relative offset into the shared memory page where the bytes for this
       * buffer starts
       */
      offset() {
        return this.bb.readInt64(this.bb_pos);
      }
      /**
       * The absolute length (in bytes) of the memory buffer. The memory is found
       * from offset (inclusive) to offset + length (non-inclusive). When building
       * messages using the encapsulated IPC message, padding bytes may be written
       * after a buffer, but such padding bytes do not need to be accounted for in
       * the size here.
       */
      length() {
        return this.bb.readInt64(this.bb_pos + 8);
      }
      static sizeOf() {
        return 16;
      }
      static createBuffer(builder, offset, length) {
        builder.prep(8, 16);
        builder.writeInt64(length);
        builder.writeInt64(offset);
        return builder.offset();
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/field-node.mjs

    //# sourceMappingURL=buffer.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify
    /**
     * ----------------------------------------------------------------------
     * Data structures for describing a table row batch (a collection of
     * equal-length Arrow arrays)
     * Metadata about a field at some level of a nested type tree (but not
     * its children).
     *
     * For example, a List<Int16> with values `[[1, 2, 3], null, [4], [5, 6], null]`
     * would have {length: 5, null_count: 2} for its List node, and {length: 6,
     * null_count: 0} for its Int16 node, as separate FieldNode structs
     */
    class FieldNode {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      /**
       * The number of value slots in the Arrow array at this level of a nested
       * tree
       */
      length() {
        return this.bb.readInt64(this.bb_pos);
      }
      /**
       * The number of observed nulls. Fields with null_count == 0 may choose not
       * to write their physical validity bitmap out as a materialized buffer,
       * instead setting the length of the bitmap buffer to 0.
       */
      nullCount() {
        return this.bb.readInt64(this.bb_pos + 8);
      }
      static sizeOf() {
        return 16;
      }
      static createFieldNode(builder, length, null_count) {
        builder.prep(8, 16);
        builder.writeInt64(null_count);
        builder.writeInt64(length);
        return builder.offset();
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/record-batch.mjs

    //# sourceMappingURL=field-node.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    /**
     * A data header describing the shared memory layout of a "record" or "row"
     * batch. Some systems call this a "row batch" internally and others a "record
     * batch".
     */
    class record_batch_RecordBatch {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsRecordBatch(bb, obj) {
        return (obj || new record_batch_RecordBatch()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsRecordBatch(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new record_batch_RecordBatch()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      /**
       * number of records / rows. The arrays in the batch should all have this
       * length
       */
      length() {
        const offset = this.bb.__offset(this.bb_pos, 4);
        return offset
          ? this.bb.readInt64(this.bb_pos + offset)
          : this.bb.createLong(0, 0);
      }
      /**
       * Nodes correspond to the pre-ordered flattened logical schema
       */
      nodes(index, obj) {
        const offset = this.bb.__offset(this.bb_pos, 6);
        return offset
          ? (obj || new FieldNode()).__init(
              this.bb.__vector(this.bb_pos + offset) + index * 16,
              this.bb,
            )
          : null;
      }
      nodesLength() {
        const offset = this.bb.__offset(this.bb_pos, 6);
        return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
      }
      /**
       * Buffers correspond to the pre-ordered flattened buffer tree
       *
       * The number of buffers appended to this list depends on the schema. For
       * example, most primitive arrays will have 2 buffers, 1 for the validity
       * bitmap and 1 for the values. For struct arrays, there will only be a
       * single buffer for the validity (nulls) bitmap
       */
      buffers(index, obj) {
        const offset = this.bb.__offset(this.bb_pos, 8);
        return offset
          ? (obj || new Buffer()).__init(
              this.bb.__vector(this.bb_pos + offset) + index * 16,
              this.bb,
            )
          : null;
      }
      buffersLength() {
        const offset = this.bb.__offset(this.bb_pos, 8);
        return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
      }
      /**
       * Optional compression of the message body
       */
      compression(obj) {
        const offset = this.bb.__offset(this.bb_pos, 10);
        return offset
          ? (obj || new BodyCompression()).__init(
              this.bb.__indirect(this.bb_pos + offset),
              this.bb,
            )
          : null;
      }
      static startRecordBatch(builder) {
        builder.startObject(4);
      }
      static addLength(builder, length) {
        builder.addFieldInt64(0, length, builder.createLong(0, 0));
      }
      static addNodes(builder, nodesOffset) {
        builder.addFieldOffset(1, nodesOffset, 0);
      }
      static startNodesVector(builder, numElems) {
        builder.startVector(16, numElems, 8);
      }
      static addBuffers(builder, buffersOffset) {
        builder.addFieldOffset(2, buffersOffset, 0);
      }
      static startBuffersVector(builder, numElems) {
        builder.startVector(16, numElems, 8);
      }
      static addCompression(builder, compressionOffset) {
        builder.addFieldOffset(3, compressionOffset, 0);
      }
      static endRecordBatch(builder) {
        const offset = builder.endObject();
        return offset;
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/dictionary-batch.mjs

    //# sourceMappingURL=record-batch.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    /**
     * For sending dictionary encoding information. Any Field can be
     * dictionary-encoded, but in this case none of its children may be
     * dictionary-encoded.
     * There is one vector / column per dictionary, but that vector / column
     * may be spread across multiple dictionary batches by using the isDelta
     * flag
     */
    class DictionaryBatch {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsDictionaryBatch(bb, obj) {
        return (obj || new DictionaryBatch()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsDictionaryBatch(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new DictionaryBatch()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      id() {
        const offset = this.bb.__offset(this.bb_pos, 4);
        return offset
          ? this.bb.readInt64(this.bb_pos + offset)
          : this.bb.createLong(0, 0);
      }
      data(obj) {
        const offset = this.bb.__offset(this.bb_pos, 6);
        return offset
          ? (obj || new record_batch_RecordBatch()).__init(
              this.bb.__indirect(this.bb_pos + offset),
              this.bb,
            )
          : null;
      }
      /**
       * If isDelta is true the values in the dictionary are to be appended to a
       * dictionary with the indicated id. If isDelta is false this dictionary
       * should replace the existing dictionary.
       */
      isDelta() {
        const offset = this.bb.__offset(this.bb_pos, 8);
        return offset ? !!this.bb.readInt8(this.bb_pos + offset) : false;
      }
      static startDictionaryBatch(builder) {
        builder.startObject(3);
      }
      static addId(builder, id) {
        builder.addFieldInt64(0, id, builder.createLong(0, 0));
      }
      static addData(builder, dataOffset) {
        builder.addFieldOffset(1, dataOffset, 0);
      }
      static addIsDelta(builder, isDelta) {
        builder.addFieldInt8(2, +isDelta, +false);
      }
      static endDictionaryBatch(builder) {
        const offset = builder.endObject();
        return offset;
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/sparse-matrix-compressed-axis.mjs

    //# sourceMappingURL=dictionary-batch.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify
    var SparseMatrixCompressedAxis;
    (function (SparseMatrixCompressedAxis) {
      SparseMatrixCompressedAxis[(SparseMatrixCompressedAxis["Row"] = 0)] =
        "Row";
      SparseMatrixCompressedAxis[(SparseMatrixCompressedAxis["Column"] = 1)] =
        "Column";
    })(SparseMatrixCompressedAxis || (SparseMatrixCompressedAxis = {})); // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/sparse-matrix-index-c-s-x.mjs

    //# sourceMappingURL=sparse-matrix-compressed-axis.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    /**
     * Compressed Sparse format, that is matrix-specific.
     */
    class SparseMatrixIndexCSX {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsSparseMatrixIndexCSX(bb, obj) {
        return (obj || new SparseMatrixIndexCSX()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsSparseMatrixIndexCSX(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new SparseMatrixIndexCSX()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      /**
       * Which axis, row or column, is compressed
       */
      compressedAxis() {
        const offset = this.bb.__offset(this.bb_pos, 4);
        return offset
          ? this.bb.readInt16(this.bb_pos + offset)
          : SparseMatrixCompressedAxis.Row;
      }
      /**
       * The type of values in indptrBuffer
       */
      indptrType(obj) {
        const offset = this.bb.__offset(this.bb_pos, 6);
        return offset
          ? (obj || new Int()).__init(
              this.bb.__indirect(this.bb_pos + offset),
              this.bb,
            )
          : null;
      }
      /**
       * indptrBuffer stores the location and size of indptr array that
       * represents the range of the rows.
       * The i-th row spans from `indptr[i]` to `indptr[i+1]` in the data.
       * The length of this array is 1 + (the number of rows), and the type
       * of index value is long.
       *
       * For example, let X be the following 6x4 matrix:
       * ```text
       *   X := [[0, 1, 2, 0],
       *         [0, 0, 3, 0],
       *         [0, 4, 0, 5],
       *         [0, 0, 0, 0],
       *         [6, 0, 7, 8],
       *         [0, 9, 0, 0]].
       * ```
       * The array of non-zero values in X is:
       * ```text
       *   values(X) = [1, 2, 3, 4, 5, 6, 7, 8, 9].
       * ```
       * And the indptr of X is:
       * ```text
       *   indptr(X) = [0, 2, 3, 5, 5, 8, 10].
       * ```
       */
      indptrBuffer(obj) {
        const offset = this.bb.__offset(this.bb_pos, 8);
        return offset
          ? (obj || new Buffer()).__init(this.bb_pos + offset, this.bb)
          : null;
      }
      /**
       * The type of values in indicesBuffer
       */
      indicesType(obj) {
        const offset = this.bb.__offset(this.bb_pos, 10);
        return offset
          ? (obj || new Int()).__init(
              this.bb.__indirect(this.bb_pos + offset),
              this.bb,
            )
          : null;
      }
      /**
       * indicesBuffer stores the location and size of the array that
       * contains the column indices of the corresponding non-zero values.
       * The type of index value is long.
       *
       * For example, the indices of the above X is:
       * ```text
       *   indices(X) = [1, 2, 2, 1, 3, 0, 2, 3, 1].
       * ```
       * Note that the indices are sorted in lexicographical order for each row.
       */
      indicesBuffer(obj) {
        const offset = this.bb.__offset(this.bb_pos, 12);
        return offset
          ? (obj || new Buffer()).__init(this.bb_pos + offset, this.bb)
          : null;
      }
      static startSparseMatrixIndexCSX(builder) {
        builder.startObject(5);
      }
      static addCompressedAxis(builder, compressedAxis) {
        builder.addFieldInt16(
          0,
          compressedAxis,
          SparseMatrixCompressedAxis.Row,
        );
      }
      static addIndptrType(builder, indptrTypeOffset) {
        builder.addFieldOffset(1, indptrTypeOffset, 0);
      }
      static addIndptrBuffer(builder, indptrBufferOffset) {
        builder.addFieldStruct(2, indptrBufferOffset, 0);
      }
      static addIndicesType(builder, indicesTypeOffset) {
        builder.addFieldOffset(3, indicesTypeOffset, 0);
      }
      static addIndicesBuffer(builder, indicesBufferOffset) {
        builder.addFieldStruct(4, indicesBufferOffset, 0);
      }
      static endSparseMatrixIndexCSX(builder) {
        const offset = builder.endObject();
        builder.requiredField(offset, 6); // indptrType
        builder.requiredField(offset, 8); // indptrBuffer
        builder.requiredField(offset, 10); // indicesType
        builder.requiredField(offset, 12); // indicesBuffer
        return offset;
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/sparse-tensor-index-c-o-o.mjs

    //# sourceMappingURL=sparse-matrix-index-c-s-x.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    /**
     * ----------------------------------------------------------------------
     * EXPERIMENTAL: Data structures for sparse tensors
     * Coordinate (COO) format of sparse tensor index.
     *
     * COO's index list are represented as a NxM matrix,
     * where N is the number of non-zero values,
     * and M is the number of dimensions of a sparse tensor.
     *
     * indicesBuffer stores the location and size of the data of this indices
     * matrix.  The value type and the stride of the indices matrix is
     * specified in indicesType and indicesStrides fields.
     *
     * For example, let X be a 2x3x4x5 tensor, and it has the following
     * 6 non-zero values:
     * ```text
     *   X[0, 1, 2, 0] := 1
     *   X[1, 1, 2, 3] := 2
     *   X[0, 2, 1, 0] := 3
     *   X[0, 1, 3, 0] := 4
     *   X[0, 1, 2, 1] := 5
     *   X[1, 2, 0, 4] := 6
     * ```
     * In COO format, the index matrix of X is the following 4x6 matrix:
     * ```text
     *   [[0, 0, 0, 0, 1, 1],
     *    [1, 1, 1, 2, 1, 2],
     *    [2, 2, 3, 1, 2, 0],
     *    [0, 1, 0, 0, 3, 4]]
     * ```
     * When isCanonical is true, the indices is sorted in lexicographical order
     * (row-major order), and it does not have duplicated entries.  Otherwise,
     * the indices may not be sorted, or may have duplicated entries.
     */
    class SparseTensorIndexCOO {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsSparseTensorIndexCOO(bb, obj) {
        return (obj || new SparseTensorIndexCOO()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsSparseTensorIndexCOO(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new SparseTensorIndexCOO()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      /**
       * The type of values in indicesBuffer
       */
      indicesType(obj) {
        const offset = this.bb.__offset(this.bb_pos, 4);
        return offset
          ? (obj || new Int()).__init(
              this.bb.__indirect(this.bb_pos + offset),
              this.bb,
            )
          : null;
      }
      /**
       * Non-negative byte offsets to advance one value cell along each dimension
       * If omitted, default to row-major order (C-like).
       */
      indicesStrides(index) {
        const offset = this.bb.__offset(this.bb_pos, 6);
        return offset
          ? this.bb.readInt64(
              this.bb.__vector(this.bb_pos + offset) + index * 8,
            )
          : this.bb.createLong(0, 0);
      }
      indicesStridesLength() {
        const offset = this.bb.__offset(this.bb_pos, 6);
        return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
      }
      /**
       * The location and size of the indices matrix's data
       */
      indicesBuffer(obj) {
        const offset = this.bb.__offset(this.bb_pos, 8);
        return offset
          ? (obj || new Buffer()).__init(this.bb_pos + offset, this.bb)
          : null;
      }
      /**
       * This flag is true if and only if the indices matrix is sorted in
       * row-major order, and does not have duplicated entries.
       * This sort order is the same as of Tensorflow's SparseTensor,
       * but it is inverse order of SciPy's canonical coo_matrix
       * (SciPy employs column-major order for its coo_matrix).
       */
      isCanonical() {
        const offset = this.bb.__offset(this.bb_pos, 10);
        return offset ? !!this.bb.readInt8(this.bb_pos + offset) : false;
      }
      static startSparseTensorIndexCOO(builder) {
        builder.startObject(4);
      }
      static addIndicesType(builder, indicesTypeOffset) {
        builder.addFieldOffset(0, indicesTypeOffset, 0);
      }
      static addIndicesStrides(builder, indicesStridesOffset) {
        builder.addFieldOffset(1, indicesStridesOffset, 0);
      }
      static createIndicesStridesVector(builder, data) {
        builder.startVector(8, data.length, 8);
        for (let i = data.length - 1; i >= 0; i--) {
          builder.addInt64(data[i]);
        }
        return builder.endVector();
      }
      static startIndicesStridesVector(builder, numElems) {
        builder.startVector(8, numElems, 8);
      }
      static addIndicesBuffer(builder, indicesBufferOffset) {
        builder.addFieldStruct(2, indicesBufferOffset, 0);
      }
      static addIsCanonical(builder, isCanonical) {
        builder.addFieldInt8(3, +isCanonical, +false);
      }
      static endSparseTensorIndexCOO(builder) {
        const offset = builder.endObject();
        builder.requiredField(offset, 4); // indicesType
        builder.requiredField(offset, 8); // indicesBuffer
        return offset;
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/sparse-tensor-index-c-s-f.mjs

    //# sourceMappingURL=sparse-tensor-index-c-o-o.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    /**
     * Compressed Sparse Fiber (CSF) sparse tensor index.
     */
    class SparseTensorIndexCSF {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsSparseTensorIndexCSF(bb, obj) {
        return (obj || new SparseTensorIndexCSF()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsSparseTensorIndexCSF(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new SparseTensorIndexCSF()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      /**
       * CSF is a generalization of compressed sparse row (CSR) index.
       * See [smith2017knl](http://shaden.io/pub-files/smith2017knl.pdf)
       *
       * CSF index recursively compresses each dimension of a tensor into a set
       * of prefix trees. Each path from a root to leaf forms one tensor
       * non-zero index. CSF is implemented with two arrays of buffers and one
       * arrays of integers.
       *
       * For example, let X be a 2x3x4x5 tensor and let it have the following
       * 8 non-zero values:
       * ```text
       *   X[0, 0, 0, 1] := 1
       *   X[0, 0, 0, 2] := 2
       *   X[0, 1, 0, 0] := 3
       *   X[0, 1, 0, 2] := 4
       *   X[0, 1, 1, 0] := 5
       *   X[1, 1, 1, 0] := 6
       *   X[1, 1, 1, 1] := 7
       *   X[1, 1, 1, 2] := 8
       * ```
       * As a prefix tree this would be represented as:
       * ```text
       *         0          1
       *        / \         |
       *       0   1        1
       *      /   / \       |
       *     0   0   1      1
       *    /|  /|   |    /| |
       *   1 2 0 2   0   0 1 2
       * ```
       * The type of values in indptrBuffers
       */
      indptrType(obj) {
        const offset = this.bb.__offset(this.bb_pos, 4);
        return offset
          ? (obj || new Int()).__init(
              this.bb.__indirect(this.bb_pos + offset),
              this.bb,
            )
          : null;
      }
      /**
       * indptrBuffers stores the sparsity structure.
       * Each two consecutive dimensions in a tensor correspond to a buffer in
       * indptrBuffers. A pair of consecutive values at `indptrBuffers[dim][i]`
       * and `indptrBuffers[dim][i + 1]` signify a range of nodes in
       * `indicesBuffers[dim + 1]` who are children of `indicesBuffers[dim][i]` node.
       *
       * For example, the indptrBuffers for the above X is:
       * ```text
       *   indptrBuffer(X) = [
       *                       [0, 2, 3],
       *                       [0, 1, 3, 4],
       *                       [0, 2, 4, 5, 8]
       *                     ].
       * ```
       */
      indptrBuffers(index, obj) {
        const offset = this.bb.__offset(this.bb_pos, 6);
        return offset
          ? (obj || new Buffer()).__init(
              this.bb.__vector(this.bb_pos + offset) + index * 16,
              this.bb,
            )
          : null;
      }
      indptrBuffersLength() {
        const offset = this.bb.__offset(this.bb_pos, 6);
        return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
      }
      /**
       * The type of values in indicesBuffers
       */
      indicesType(obj) {
        const offset = this.bb.__offset(this.bb_pos, 8);
        return offset
          ? (obj || new Int()).__init(
              this.bb.__indirect(this.bb_pos + offset),
              this.bb,
            )
          : null;
      }
      /**
       * indicesBuffers stores values of nodes.
       * Each tensor dimension corresponds to a buffer in indicesBuffers.
       * For example, the indicesBuffers for the above X is:
       * ```text
       *   indicesBuffer(X) = [
       *                        [0, 1],
       *                        [0, 1, 1],
       *                        [0, 0, 1, 1],
       *                        [1, 2, 0, 2, 0, 0, 1, 2]
       *                      ].
       * ```
       */
      indicesBuffers(index, obj) {
        const offset = this.bb.__offset(this.bb_pos, 10);
        return offset
          ? (obj || new Buffer()).__init(
              this.bb.__vector(this.bb_pos + offset) + index * 16,
              this.bb,
            )
          : null;
      }
      indicesBuffersLength() {
        const offset = this.bb.__offset(this.bb_pos, 10);
        return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
      }
      /**
       * axisOrder stores the sequence in which dimensions were traversed to
       * produce the prefix tree.
       * For example, the axisOrder for the above X is:
       * ```text
       *   axisOrder(X) = [0, 1, 2, 3].
       * ```
       */
      axisOrder(index) {
        const offset = this.bb.__offset(this.bb_pos, 12);
        return offset
          ? this.bb.readInt32(
              this.bb.__vector(this.bb_pos + offset) + index * 4,
            )
          : 0;
      }
      axisOrderLength() {
        const offset = this.bb.__offset(this.bb_pos, 12);
        return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
      }
      axisOrderArray() {
        const offset = this.bb.__offset(this.bb_pos, 12);
        return offset
          ? new Int32Array(
              this.bb.bytes().buffer,
              this.bb.bytes().byteOffset +
                this.bb.__vector(this.bb_pos + offset),
              this.bb.__vector_len(this.bb_pos + offset),
            )
          : null;
      }
      static startSparseTensorIndexCSF(builder) {
        builder.startObject(5);
      }
      static addIndptrType(builder, indptrTypeOffset) {
        builder.addFieldOffset(0, indptrTypeOffset, 0);
      }
      static addIndptrBuffers(builder, indptrBuffersOffset) {
        builder.addFieldOffset(1, indptrBuffersOffset, 0);
      }
      static startIndptrBuffersVector(builder, numElems) {
        builder.startVector(16, numElems, 8);
      }
      static addIndicesType(builder, indicesTypeOffset) {
        builder.addFieldOffset(2, indicesTypeOffset, 0);
      }
      static addIndicesBuffers(builder, indicesBuffersOffset) {
        builder.addFieldOffset(3, indicesBuffersOffset, 0);
      }
      static startIndicesBuffersVector(builder, numElems) {
        builder.startVector(16, numElems, 8);
      }
      static addAxisOrder(builder, axisOrderOffset) {
        builder.addFieldOffset(4, axisOrderOffset, 0);
      }
      static createAxisOrderVector(builder, data) {
        builder.startVector(4, data.length, 4);
        for (let i = data.length - 1; i >= 0; i--) {
          builder.addInt32(data[i]);
        }
        return builder.endVector();
      }
      static startAxisOrderVector(builder, numElems) {
        builder.startVector(4, numElems, 4);
      }
      static endSparseTensorIndexCSF(builder) {
        const offset = builder.endObject();
        builder.requiredField(offset, 4); // indptrType
        builder.requiredField(offset, 6); // indptrBuffers
        builder.requiredField(offset, 8); // indicesType
        builder.requiredField(offset, 10); // indicesBuffers
        builder.requiredField(offset, 12); // axisOrder
        return offset;
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/sparse-tensor-index.mjs

    //# sourceMappingURL=sparse-tensor-index-c-s-f.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    var SparseTensorIndex;
    (function (SparseTensorIndex) {
      SparseTensorIndex[(SparseTensorIndex["NONE"] = 0)] = "NONE";
      SparseTensorIndex[(SparseTensorIndex["SparseTensorIndexCOO"] = 1)] =
        "SparseTensorIndexCOO";
      SparseTensorIndex[(SparseTensorIndex["SparseMatrixIndexCSX"] = 2)] =
        "SparseMatrixIndexCSX";
      SparseTensorIndex[(SparseTensorIndex["SparseTensorIndexCSF"] = 3)] =
        "SparseTensorIndexCSF";
    })(SparseTensorIndex || (SparseTensorIndex = {}));
    function unionToSparseTensorIndex(type, accessor) {
      switch (SparseTensorIndex[type]) {
        case "NONE":
          return null;
        case "SparseTensorIndexCOO":
          return accessor(new SparseTensorIndexCOO());
        case "SparseMatrixIndexCSX":
          return accessor(new SparseMatrixIndexCSX());
        case "SparseTensorIndexCSF":
          return accessor(new SparseTensorIndexCSF());
        default:
          return null;
      }
    }
    function unionListToSparseTensorIndex(type, accessor, index) {
      switch (SparseTensorIndex[type]) {
        case "NONE":
          return null;
        case "SparseTensorIndexCOO":
          return accessor(index, new SparseTensorIndexCOO());
        case "SparseMatrixIndexCSX":
          return accessor(index, new SparseMatrixIndexCSX());
        case "SparseTensorIndexCSF":
          return accessor(index, new SparseTensorIndexCSF());
        default:
          return null;
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/tensor-dim.mjs

    //# sourceMappingURL=sparse-tensor-index.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    /**
     * ----------------------------------------------------------------------
     * Data structures for dense tensors
     * Shape data for a single axis in a tensor
     */
    class TensorDim {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsTensorDim(bb, obj) {
        return (obj || new TensorDim()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsTensorDim(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new TensorDim()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      /**
       * Length of dimension
       */
      size() {
        const offset = this.bb.__offset(this.bb_pos, 4);
        return offset
          ? this.bb.readInt64(this.bb_pos + offset)
          : this.bb.createLong(0, 0);
      }
      name(optionalEncoding) {
        const offset = this.bb.__offset(this.bb_pos, 6);
        return offset
          ? this.bb.__string(this.bb_pos + offset, optionalEncoding)
          : null;
      }
      static startTensorDim(builder) {
        builder.startObject(2);
      }
      static addSize(builder, size) {
        builder.addFieldInt64(0, size, builder.createLong(0, 0));
      }
      static addName(builder, nameOffset) {
        builder.addFieldOffset(1, nameOffset, 0);
      }
      static endTensorDim(builder) {
        const offset = builder.endObject();
        return offset;
      }
      static createTensorDim(builder, size, nameOffset) {
        TensorDim.startTensorDim(builder);
        TensorDim.addSize(builder, size);
        TensorDim.addName(builder, nameOffset);
        return TensorDim.endTensorDim(builder);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/sparse-tensor.mjs

    //# sourceMappingURL=tensor-dim.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    class SparseTensor {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsSparseTensor(bb, obj) {
        return (obj || new SparseTensor()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsSparseTensor(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new SparseTensor()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      typeType() {
        const offset = this.bb.__offset(this.bb_pos, 4);
        return offset
          ? this.bb.readUint8(this.bb_pos + offset)
          : type_Type.NONE;
      }
      /**
       * The type of data contained in a value cell.
       * Currently only fixed-width value types are supported,
       * no strings or nested types.
       */
      // @ts-ignore
      type(obj) {
        const offset = this.bb.__offset(this.bb_pos, 6);
        return offset ? this.bb.__union(obj, this.bb_pos + offset) : null;
      }
      /**
       * The dimensions of the tensor, optionally named.
       */
      shape(index, obj) {
        const offset = this.bb.__offset(this.bb_pos, 8);
        return offset
          ? (obj || new TensorDim()).__init(
              this.bb.__indirect(
                this.bb.__vector(this.bb_pos + offset) + index * 4,
              ),
              this.bb,
            )
          : null;
      }
      shapeLength() {
        const offset = this.bb.__offset(this.bb_pos, 8);
        return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
      }
      /**
       * The number of non-zero values in a sparse tensor.
       */
      nonZeroLength() {
        const offset = this.bb.__offset(this.bb_pos, 10);
        return offset
          ? this.bb.readInt64(this.bb_pos + offset)
          : this.bb.createLong(0, 0);
      }
      sparseIndexType() {
        const offset = this.bb.__offset(this.bb_pos, 12);
        return offset
          ? this.bb.readUint8(this.bb_pos + offset)
          : SparseTensorIndex.NONE;
      }
      /**
       * Sparse tensor index
       */
      // @ts-ignore
      sparseIndex(obj) {
        const offset = this.bb.__offset(this.bb_pos, 14);
        return offset ? this.bb.__union(obj, this.bb_pos + offset) : null;
      }
      /**
       * The location and size of the tensor's data
       */
      data(obj) {
        const offset = this.bb.__offset(this.bb_pos, 16);
        return offset
          ? (obj || new Buffer()).__init(this.bb_pos + offset, this.bb)
          : null;
      }
      static startSparseTensor(builder) {
        builder.startObject(7);
      }
      static addTypeType(builder, typeType) {
        builder.addFieldInt8(0, typeType, type_Type.NONE);
      }
      static addType(builder, typeOffset) {
        builder.addFieldOffset(1, typeOffset, 0);
      }
      static addShape(builder, shapeOffset) {
        builder.addFieldOffset(2, shapeOffset, 0);
      }
      static createShapeVector(builder, data) {
        builder.startVector(4, data.length, 4);
        for (let i = data.length - 1; i >= 0; i--) {
          builder.addOffset(data[i]);
        }
        return builder.endVector();
      }
      static startShapeVector(builder, numElems) {
        builder.startVector(4, numElems, 4);
      }
      static addNonZeroLength(builder, nonZeroLength) {
        builder.addFieldInt64(3, nonZeroLength, builder.createLong(0, 0));
      }
      static addSparseIndexType(builder, sparseIndexType) {
        builder.addFieldInt8(4, sparseIndexType, SparseTensorIndex.NONE);
      }
      static addSparseIndex(builder, sparseIndexOffset) {
        builder.addFieldOffset(5, sparseIndexOffset, 0);
      }
      static addData(builder, dataOffset) {
        builder.addFieldStruct(6, dataOffset, 0);
      }
      static endSparseTensor(builder) {
        const offset = builder.endObject();
        builder.requiredField(offset, 6); // type
        builder.requiredField(offset, 8); // shape
        builder.requiredField(offset, 14); // sparseIndex
        builder.requiredField(offset, 16); // data
        return offset;
      }
      static finishSparseTensorBuffer(builder, offset) {
        builder.finish(offset);
      }
      static finishSizePrefixedSparseTensorBuffer(builder, offset) {
        builder.finish(offset, undefined, true);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/tensor.mjs

    //# sourceMappingURL=sparse-tensor.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    class Tensor {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsTensor(bb, obj) {
        return (obj || new Tensor()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsTensor(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new Tensor()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      typeType() {
        const offset = this.bb.__offset(this.bb_pos, 4);
        return offset
          ? this.bb.readUint8(this.bb_pos + offset)
          : type_Type.NONE;
      }
      /**
       * The type of data contained in a value cell. Currently only fixed-width
       * value types are supported, no strings or nested types
       */
      // @ts-ignore
      type(obj) {
        const offset = this.bb.__offset(this.bb_pos, 6);
        return offset ? this.bb.__union(obj, this.bb_pos + offset) : null;
      }
      /**
       * The dimensions of the tensor, optionally named
       */
      shape(index, obj) {
        const offset = this.bb.__offset(this.bb_pos, 8);
        return offset
          ? (obj || new TensorDim()).__init(
              this.bb.__indirect(
                this.bb.__vector(this.bb_pos + offset) + index * 4,
              ),
              this.bb,
            )
          : null;
      }
      shapeLength() {
        const offset = this.bb.__offset(this.bb_pos, 8);
        return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
      }
      /**
       * Non-negative byte offsets to advance one value cell along each dimension
       * If omitted, default to row-major order (C-like).
       */
      strides(index) {
        const offset = this.bb.__offset(this.bb_pos, 10);
        return offset
          ? this.bb.readInt64(
              this.bb.__vector(this.bb_pos + offset) + index * 8,
            )
          : this.bb.createLong(0, 0);
      }
      stridesLength() {
        const offset = this.bb.__offset(this.bb_pos, 10);
        return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
      }
      /**
       * The location and size of the tensor's data
       */
      data(obj) {
        const offset = this.bb.__offset(this.bb_pos, 12);
        return offset
          ? (obj || new Buffer()).__init(this.bb_pos + offset, this.bb)
          : null;
      }
      static startTensor(builder) {
        builder.startObject(5);
      }
      static addTypeType(builder, typeType) {
        builder.addFieldInt8(0, typeType, type_Type.NONE);
      }
      static addType(builder, typeOffset) {
        builder.addFieldOffset(1, typeOffset, 0);
      }
      static addShape(builder, shapeOffset) {
        builder.addFieldOffset(2, shapeOffset, 0);
      }
      static createShapeVector(builder, data) {
        builder.startVector(4, data.length, 4);
        for (let i = data.length - 1; i >= 0; i--) {
          builder.addOffset(data[i]);
        }
        return builder.endVector();
      }
      static startShapeVector(builder, numElems) {
        builder.startVector(4, numElems, 4);
      }
      static addStrides(builder, stridesOffset) {
        builder.addFieldOffset(3, stridesOffset, 0);
      }
      static createStridesVector(builder, data) {
        builder.startVector(8, data.length, 8);
        for (let i = data.length - 1; i >= 0; i--) {
          builder.addInt64(data[i]);
        }
        return builder.endVector();
      }
      static startStridesVector(builder, numElems) {
        builder.startVector(8, numElems, 8);
      }
      static addData(builder, dataOffset) {
        builder.addFieldStruct(4, dataOffset, 0);
      }
      static endTensor(builder) {
        const offset = builder.endObject();
        builder.requiredField(offset, 6); // type
        builder.requiredField(offset, 8); // shape
        builder.requiredField(offset, 12); // data
        return offset;
      }
      static finishTensorBuffer(builder, offset) {
        builder.finish(offset);
      }
      static finishSizePrefixedTensorBuffer(builder, offset) {
        builder.finish(offset, undefined, true);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/message-header.mjs

    //# sourceMappingURL=tensor.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    /**
     * ----------------------------------------------------------------------
     * The root Message type
     * This union enables us to easily send different message types without
     * redundant storage, and in the future we can easily add new message types.
     *
     * Arrow implementations do not need to implement all of the message types,
     * which may include experimental metadata types. For maximum compatibility,
     * it is best to send data using RecordBatch
     */
    var message_header_MessageHeader;
    (function (MessageHeader) {
      MessageHeader[(MessageHeader["NONE"] = 0)] = "NONE";
      MessageHeader[(MessageHeader["Schema"] = 1)] = "Schema";
      MessageHeader[(MessageHeader["DictionaryBatch"] = 2)] = "DictionaryBatch";
      MessageHeader[(MessageHeader["RecordBatch"] = 3)] = "RecordBatch";
      MessageHeader[(MessageHeader["Tensor"] = 4)] = "Tensor";
      MessageHeader[(MessageHeader["SparseTensor"] = 5)] = "SparseTensor";
    })(message_header_MessageHeader || (message_header_MessageHeader = {}));
    function unionToMessageHeader(type, accessor) {
      switch (message_header_MessageHeader[type]) {
        case "NONE":
          return null;
        case "Schema":
          return accessor(new Schema());
        case "DictionaryBatch":
          return accessor(new DictionaryBatch());
        case "RecordBatch":
          return accessor(new record_batch_RecordBatch());
        case "Tensor":
          return accessor(new Tensor());
        case "SparseTensor":
          return accessor(new SparseTensor());
        default:
          return null;
      }
    }
    function unionListToMessageHeader(type, accessor, index) {
      switch (message_header_MessageHeader[type]) {
        case "NONE":
          return null;
        case "Schema":
          return accessor(index, new Schema());
        case "DictionaryBatch":
          return accessor(index, new DictionaryBatch());
        case "RecordBatch":
          return accessor(index, new record_batch_RecordBatch());
        case "Tensor":
          return accessor(index, new Tensor());
        case "SparseTensor":
          return accessor(index, new SparseTensor());
        default:
          return null;
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/fb/message.mjs

    //# sourceMappingURL=message-header.mjs.map

    // automatically generated by the FlatBuffers compiler, do not modify

    class message_Message {
      constructor() {
        this.bb = null;
        this.bb_pos = 0;
      }
      __init(i, bb) {
        this.bb_pos = i;
        this.bb = bb;
        return this;
      }
      static getRootAsMessage(bb, obj) {
        return (obj || new message_Message()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      static getSizePrefixedRootAsMessage(bb, obj) {
        bb.setPosition(bb.position() + SIZE_PREFIX_LENGTH);
        return (obj || new message_Message()).__init(
          bb.readInt32(bb.position()) + bb.position(),
          bb,
        );
      }
      version() {
        const offset = this.bb.__offset(this.bb_pos, 4);
        return offset
          ? this.bb.readInt16(this.bb_pos + offset)
          : metadata_version_MetadataVersion.V1;
      }
      headerType() {
        const offset = this.bb.__offset(this.bb_pos, 6);
        return offset
          ? this.bb.readUint8(this.bb_pos + offset)
          : message_header_MessageHeader.NONE;
      }
      // @ts-ignore
      header(obj) {
        const offset = this.bb.__offset(this.bb_pos, 8);
        return offset ? this.bb.__union(obj, this.bb_pos + offset) : null;
      }
      bodyLength() {
        const offset = this.bb.__offset(this.bb_pos, 10);
        return offset
          ? this.bb.readInt64(this.bb_pos + offset)
          : this.bb.createLong(0, 0);
      }
      customMetadata(index, obj) {
        const offset = this.bb.__offset(this.bb_pos, 12);
        return offset
          ? (obj || new KeyValue()).__init(
              this.bb.__indirect(
                this.bb.__vector(this.bb_pos + offset) + index * 4,
              ),
              this.bb,
            )
          : null;
      }
      customMetadataLength() {
        const offset = this.bb.__offset(this.bb_pos, 12);
        return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
      }
      static startMessage(builder) {
        builder.startObject(5);
      }
      static addVersion(builder, version) {
        builder.addFieldInt16(0, version, metadata_version_MetadataVersion.V1);
      }
      static addHeaderType(builder, headerType) {
        builder.addFieldInt8(1, headerType, message_header_MessageHeader.NONE);
      }
      static addHeader(builder, headerOffset) {
        builder.addFieldOffset(2, headerOffset, 0);
      }
      static addBodyLength(builder, bodyLength) {
        builder.addFieldInt64(3, bodyLength, builder.createLong(0, 0));
      }
      static addCustomMetadata(builder, customMetadataOffset) {
        builder.addFieldOffset(4, customMetadataOffset, 0);
      }
      static createCustomMetadataVector(builder, data) {
        builder.startVector(4, data.length, 4);
        for (let i = data.length - 1; i >= 0; i--) {
          builder.addOffset(data[i]);
        }
        return builder.endVector();
      }
      static startCustomMetadataVector(builder, numElems) {
        builder.startVector(4, numElems, 4);
      }
      static endMessage(builder) {
        const offset = builder.endObject();
        return offset;
      }
      static finishMessageBuffer(builder, offset) {
        builder.finish(offset);
      }
      static finishSizePrefixedMessageBuffer(builder, offset) {
        builder.finish(offset, undefined, true);
      }
      static createMessage(
        builder,
        version,
        headerType,
        headerOffset,
        bodyLength,
        customMetadataOffset,
      ) {
        message_Message.startMessage(builder);
        message_Message.addVersion(builder, version);
        message_Message.addHeaderType(builder, headerType);
        message_Message.addHeader(builder, headerOffset);
        message_Message.addBodyLength(builder, bodyLength);
        message_Message.addCustomMetadata(builder, customMetadataOffset);
        return message_Message.endMessage(builder);
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/visitor/typeassembler.mjs

    //# sourceMappingURL=message.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    var typeassembler_Long = Long;

    /** @ignore */
    class TypeAssembler extends Visitor {
      visit(node, builder) {
        return node == null || builder == null
          ? undefined
          : super.visit(node, builder);
      }
      visitNull(_node, b) {
        null_Null.startNull(b);
        return null_Null.endNull(b);
      }
      visitInt(node, b) {
        Int.startInt(b);
        Int.addBitWidth(b, node.bitWidth);
        Int.addIsSigned(b, node.isSigned);
        return Int.endInt(b);
      }
      visitFloat(node, b) {
        FloatingPoint.startFloatingPoint(b);
        FloatingPoint.addPrecision(b, node.precision);
        return FloatingPoint.endFloatingPoint(b);
      }
      visitBinary(_node, b) {
        binary_Binary.startBinary(b);
        return binary_Binary.endBinary(b);
      }
      visitBool(_node, b) {
        bool_Bool.startBool(b);
        return bool_Bool.endBool(b);
      }
      visitUtf8(_node, b) {
        utf8_Utf8.startUtf8(b);
        return utf8_Utf8.endUtf8(b);
      }
      visitDecimal(node, b) {
        decimal_Decimal.startDecimal(b);
        decimal_Decimal.addScale(b, node.scale);
        decimal_Decimal.addPrecision(b, node.precision);
        decimal_Decimal.addBitWidth(b, node.bitWidth);
        return decimal_Decimal.endDecimal(b);
      }
      visitDate(node, b) {
        date_Date.startDate(b);
        date_Date.addUnit(b, node.unit);
        return date_Date.endDate(b);
      }
      visitTime(node, b) {
        Time.startTime(b);
        Time.addUnit(b, node.unit);
        Time.addBitWidth(b, node.bitWidth);
        return Time.endTime(b);
      }
      visitTimestamp(node, b) {
        const timezone =
          (node.timezone && b.createString(node.timezone)) || undefined;
        Timestamp.startTimestamp(b);
        Timestamp.addUnit(b, node.unit);
        if (timezone !== undefined) {
          Timestamp.addTimezone(b, timezone);
        }
        return Timestamp.endTimestamp(b);
      }
      visitInterval(node, b) {
        Interval.startInterval(b);
        Interval.addUnit(b, node.unit);
        return Interval.endInterval(b);
      }
      visitList(_node, b) {
        list_List.startList(b);
        return list_List.endList(b);
      }
      visitStruct(_node, b) {
        Struct_.startStruct_(b);
        return Struct_.endStruct_(b);
      }
      visitUnion(node, b) {
        Union.startTypeIdsVector(b, node.typeIds.length);
        const typeIds = Union.createTypeIdsVector(b, node.typeIds);
        Union.startUnion(b);
        Union.addMode(b, node.mode);
        Union.addTypeIds(b, typeIds);
        return Union.endUnion(b);
      }
      visitDictionary(node, b) {
        const indexType = this.visit(node.indices, b);
        DictionaryEncoding.startDictionaryEncoding(b);
        DictionaryEncoding.addId(b, new typeassembler_Long(node.id, 0));
        DictionaryEncoding.addIsOrdered(b, node.isOrdered);
        if (indexType !== undefined) {
          DictionaryEncoding.addIndexType(b, indexType);
        }
        return DictionaryEncoding.endDictionaryEncoding(b);
      }
      visitFixedSizeBinary(node, b) {
        fixed_size_binary_FixedSizeBinary.startFixedSizeBinary(b);
        fixed_size_binary_FixedSizeBinary.addByteWidth(b, node.byteWidth);
        return fixed_size_binary_FixedSizeBinary.endFixedSizeBinary(b);
      }
      visitFixedSizeList(node, b) {
        fixed_size_list_FixedSizeList.startFixedSizeList(b);
        fixed_size_list_FixedSizeList.addListSize(b, node.listSize);
        return fixed_size_list_FixedSizeList.endFixedSizeList(b);
      }
      visitMap(node, b) {
        map_Map.startMap(b);
        map_Map.addKeysSorted(b, node.keysSorted);
        return map_Map.endMap(b);
      }
    }
    /** @ignore */
    const typeassembler_instance = new TypeAssembler(); // CONCATENATED MODULE: ./node_modules/apache-arrow/ipc/metadata/json.mjs

    //# sourceMappingURL=typeassembler.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.
    /* eslint-disable brace-style */

    /** @ignore */
    function schemaFromJSON(_schema, dictionaries = new Map()) {
      return new schema_Schema(
        schemaFieldsFromJSON(_schema, dictionaries),
        customMetadataFromJSON(_schema["customMetadata"]),
        dictionaries,
      );
    }
    /** @ignore */
    function recordBatchFromJSON(b) {
      return new message_RecordBatch(
        b["count"],
        fieldNodesFromJSON(b["columns"]),
        buffersFromJSON(b["columns"]),
      );
    }
    /** @ignore */
    function dictionaryBatchFromJSON(b) {
      return new message_DictionaryBatch(
        recordBatchFromJSON(b["data"]),
        b["id"],
        b["isDelta"],
      );
    }
    /** @ignore */
    function schemaFieldsFromJSON(_schema, dictionaries) {
      return (_schema["fields"] || [])
        .filter(Boolean)
        .map((f) => schema_Field.fromJSON(f, dictionaries));
    }
    /** @ignore */
    function fieldChildrenFromJSON(_field, dictionaries) {
      return (_field["children"] || [])
        .filter(Boolean)
        .map((f) => schema_Field.fromJSON(f, dictionaries));
    }
    /** @ignore */
    function fieldNodesFromJSON(xs) {
      return (xs || []).reduce(
        (fieldNodes, column) => [
          ...fieldNodes,
          new message_FieldNode(
            column["count"],
            nullCountFromJSON(column["VALIDITY"]),
          ),
          ...fieldNodesFromJSON(column["children"]),
        ],
        [],
      );
    }
    /** @ignore */
    function buffersFromJSON(xs, buffers = []) {
      for (let i = -1, n = (xs || []).length; ++i < n; ) {
        const column = xs[i];
        column["VALIDITY"] &&
          buffers.push(
            new BufferRegion(buffers.length, column["VALIDITY"].length),
          );
        column["TYPE"] &&
          buffers.push(new BufferRegion(buffers.length, column["TYPE"].length));
        column["OFFSET"] &&
          buffers.push(
            new BufferRegion(buffers.length, column["OFFSET"].length),
          );
        column["DATA"] &&
          buffers.push(new BufferRegion(buffers.length, column["DATA"].length));
        buffers = buffersFromJSON(column["children"], buffers);
      }
      return buffers;
    }
    /** @ignore */
    function nullCountFromJSON(validity) {
      return (validity || []).reduce((sum, val) => sum + +(val === 0), 0);
    }
    /** @ignore */
    function fieldFromJSON(_field, dictionaries) {
      let id;
      let keys;
      let field;
      let dictMeta;
      let type;
      let dictType;
      // If no dictionary encoding
      if (!dictionaries || !(dictMeta = _field["dictionary"])) {
        type = typeFromJSON(
          _field,
          fieldChildrenFromJSON(_field, dictionaries),
        );
        field = new schema_Field(
          _field["name"],
          type,
          _field["nullable"],
          customMetadataFromJSON(_field["customMetadata"]),
        );
      }
      // If dictionary encoded and the first time we've seen this dictionary id, decode
      // the data type and child fields, then wrap in a Dictionary type and insert the
      // data type into the dictionary types map.
      else if (!dictionaries.has((id = dictMeta["id"]))) {
        // a dictionary index defaults to signed 32 bit int if unspecified
        keys = (keys = dictMeta["indexType"])
          ? indexTypeFromJSON(keys)
          : new Int32();
        dictionaries.set(
          id,
          (type = typeFromJSON(
            _field,
            fieldChildrenFromJSON(_field, dictionaries),
          )),
        );
        dictType = new Dictionary(type, keys, id, dictMeta["isOrdered"]);
        field = new schema_Field(
          _field["name"],
          dictType,
          _field["nullable"],
          customMetadataFromJSON(_field["customMetadata"]),
        );
      }
      // If dictionary encoded, and have already seen this dictionary Id in the schema, then reuse the
      // data type and wrap in a new Dictionary type and field.
      else {
        // a dictionary index defaults to signed 32 bit int if unspecified
        keys = (keys = dictMeta["indexType"])
          ? indexTypeFromJSON(keys)
          : new Int32();
        dictType = new Dictionary(
          dictionaries.get(id),
          keys,
          id,
          dictMeta["isOrdered"],
        );
        field = new schema_Field(
          _field["name"],
          dictType,
          _field["nullable"],
          customMetadataFromJSON(_field["customMetadata"]),
        );
      }
      return field || null;
    }
    /** @ignore */
    function customMetadataFromJSON(_metadata) {
      return new Map(Object.entries(_metadata || {}));
    }
    /** @ignore */
    function indexTypeFromJSON(_type) {
      return new Int_(_type["isSigned"], _type["bitWidth"]);
    }
    /** @ignore */
    function typeFromJSON(f, children) {
      const typeId = f["type"]["name"];
      switch (typeId) {
        case "NONE":
          return new Null();
        case "null":
          return new Null();
        case "binary":
          return new Binary();
        case "utf8":
          return new Utf8();
        case "bool":
          return new Bool();
        case "list":
          return new List((children || [])[0]);
        case "struct":
          return new Struct(children || []);
        case "struct_":
          return new Struct(children || []);
      }
      switch (typeId) {
        case "int": {
          const t = f["type"];
          return new Int_(t["isSigned"], t["bitWidth"]);
        }
        case "floatingpoint": {
          const t = f["type"];
          return new Float(Precision[t["precision"]]);
        }
        case "decimal": {
          const t = f["type"];
          return new Decimal(t["scale"], t["precision"], t["bitWidth"]);
        }
        case "date": {
          const t = f["type"];
          return new Date_(DateUnit[t["unit"]]);
        }
        case "time": {
          const t = f["type"];
          return new Time_(TimeUnit[t["unit"]], t["bitWidth"]);
        }
        case "timestamp": {
          const t = f["type"];
          return new Timestamp_(TimeUnit[t["unit"]], t["timezone"]);
        }
        case "interval": {
          const t = f["type"];
          return new Interval_(IntervalUnit[t["unit"]]);
        }
        case "union": {
          const t = f["type"];
          return new Union_(
            UnionMode[t["mode"]],
            t["typeIds"] || [],
            children || [],
          );
        }
        case "fixedsizebinary": {
          const t = f["type"];
          return new FixedSizeBinary(t["byteWidth"]);
        }
        case "fixedsizelist": {
          const t = f["type"];
          return new FixedSizeList(t["listSize"], (children || [])[0]);
        }
        case "map": {
          const t = f["type"];
          return new Map_((children || [])[0], t["keysSorted"]);
        }
      }
      throw new Error(`Unrecognized type: "${typeId}"`);
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/ipc/metadata/message.mjs

    //# sourceMappingURL=json.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.
    /* eslint-disable brace-style */

    var message_Long = Long;
    var message_Builder = builder_Builder;
    var message_ByteBuffer = ByteBuffer;

    /**
     * @ignore
     * @private
     **/
    class Message {
      constructor(bodyLength, version, headerType, header) {
        this._version = version;
        this._headerType = headerType;
        this.body = new Uint8Array(0);
        header && (this._createHeader = () => header);
        this._bodyLength =
          typeof bodyLength === "number" ? bodyLength : bodyLength.low;
      }
      /** @nocollapse */
      static fromJSON(msg, headerType) {
        const message = new Message(0, MetadataVersion.V4, headerType);
        message._createHeader = messageHeaderFromJSON(msg, headerType);
        return message;
      }
      /** @nocollapse */
      static decode(buf) {
        buf = new message_ByteBuffer(toUint8Array(buf));
        const _message = message_Message.getRootAsMessage(buf);
        const bodyLength = _message.bodyLength();
        const version = _message.version();
        const headerType = _message.headerType();
        const message = new Message(bodyLength, version, headerType);
        message._createHeader = decodeMessageHeader(_message, headerType);
        return message;
      }
      /** @nocollapse */
      static encode(message) {
        const b = new message_Builder();
        let headerOffset = -1;
        if (message.isSchema()) {
          headerOffset = schema_Schema.encode(b, message.header());
        } else if (message.isRecordBatch()) {
          headerOffset = message_RecordBatch.encode(b, message.header());
        } else if (message.isDictionaryBatch()) {
          headerOffset = message_DictionaryBatch.encode(b, message.header());
        }
        message_Message.startMessage(b);
        message_Message.addVersion(b, MetadataVersion.V4);
        message_Message.addHeader(b, headerOffset);
        message_Message.addHeaderType(b, message.headerType);
        message_Message.addBodyLength(
          b,
          new message_Long(message.bodyLength, 0),
        );
        message_Message.finishMessageBuffer(b, message_Message.endMessage(b));
        return b.asUint8Array();
      }
      /** @nocollapse */
      static from(header, bodyLength = 0) {
        if (header instanceof schema_Schema) {
          return new Message(
            0,
            MetadataVersion.V4,
            MessageHeader.Schema,
            header,
          );
        }
        if (header instanceof message_RecordBatch) {
          return new Message(
            bodyLength,
            MetadataVersion.V4,
            MessageHeader.RecordBatch,
            header,
          );
        }
        if (header instanceof message_DictionaryBatch) {
          return new Message(
            bodyLength,
            MetadataVersion.V4,
            MessageHeader.DictionaryBatch,
            header,
          );
        }
        throw new Error(`Unrecognized Message header: ${header}`);
      }
      get type() {
        return this.headerType;
      }
      get version() {
        return this._version;
      }
      get headerType() {
        return this._headerType;
      }
      get bodyLength() {
        return this._bodyLength;
      }
      header() {
        return this._createHeader();
      }
      isSchema() {
        return this.headerType === MessageHeader.Schema;
      }
      isRecordBatch() {
        return this.headerType === MessageHeader.RecordBatch;
      }
      isDictionaryBatch() {
        return this.headerType === MessageHeader.DictionaryBatch;
      }
    }
    /**
     * @ignore
     * @private
     **/
    class message_RecordBatch {
      constructor(length, nodes, buffers) {
        this._nodes = nodes;
        this._buffers = buffers;
        this._length = typeof length === "number" ? length : length.low;
      }
      get nodes() {
        return this._nodes;
      }
      get length() {
        return this._length;
      }
      get buffers() {
        return this._buffers;
      }
    }
    /**
     * @ignore
     * @private
     **/
    class message_DictionaryBatch {
      constructor(data, id, isDelta = false) {
        this._data = data;
        this._isDelta = isDelta;
        this._id = typeof id === "number" ? id : id.low;
      }
      get id() {
        return this._id;
      }
      get data() {
        return this._data;
      }
      get isDelta() {
        return this._isDelta;
      }
      get length() {
        return this.data.length;
      }
      get nodes() {
        return this.data.nodes;
      }
      get buffers() {
        return this.data.buffers;
      }
    }
    /**
     * @ignore
     * @private
     **/
    class BufferRegion {
      constructor(offset, length) {
        this.offset = typeof offset === "number" ? offset : offset.low;
        this.length = typeof length === "number" ? length : length.low;
      }
    }
    /**
     * @ignore
     * @private
     **/
    class message_FieldNode {
      constructor(length, nullCount) {
        this.length = typeof length === "number" ? length : length.low;
        this.nullCount =
          typeof nullCount === "number" ? nullCount : nullCount.low;
      }
    }
    /** @ignore */
    function messageHeaderFromJSON(message, type) {
      return () => {
        switch (type) {
          case MessageHeader.Schema:
            return schema_Schema.fromJSON(message);
          case MessageHeader.RecordBatch:
            return message_RecordBatch.fromJSON(message);
          case MessageHeader.DictionaryBatch:
            return message_DictionaryBatch.fromJSON(message);
        }
        throw new Error(
          `Unrecognized Message type: { name: ${MessageHeader[type]}, type: ${type} }`,
        );
      };
    }
    /** @ignore */
    function decodeMessageHeader(message, type) {
      return () => {
        switch (type) {
          case MessageHeader.Schema:
            return schema_Schema.decode(message.header(new Schema()));
          case MessageHeader.RecordBatch:
            return message_RecordBatch.decode(
              message.header(new record_batch_RecordBatch()),
              message.version(),
            );
          case MessageHeader.DictionaryBatch:
            return message_DictionaryBatch.decode(
              message.header(new DictionaryBatch()),
              message.version(),
            );
        }
        throw new Error(
          `Unrecognized Message type: { name: ${MessageHeader[type]}, type: ${type} }`,
        );
      };
    }
    schema_Field.encode = encodeField;
    schema_Field.decode = decodeField;
    schema_Field.fromJSON = fieldFromJSON;
    schema_Schema.encode = encodeSchema;
    schema_Schema.decode = decodeSchema;
    schema_Schema.fromJSON = schemaFromJSON;
    message_RecordBatch["encode"] = encodeRecordBatch;
    message_RecordBatch["decode"] = decodeRecordBatch;
    message_RecordBatch["fromJSON"] = recordBatchFromJSON;
    message_DictionaryBatch["encode"] = encodeDictionaryBatch;
    message_DictionaryBatch["decode"] = decodeDictionaryBatch;
    message_DictionaryBatch["fromJSON"] = dictionaryBatchFromJSON;
    message_FieldNode["encode"] = encodeFieldNode;
    message_FieldNode["decode"] = decodeFieldNode;
    BufferRegion["encode"] = encodeBufferRegion;
    BufferRegion["decode"] = decodeBufferRegion;
    /** @ignore */
    function decodeSchema(_schema, dictionaries = new Map()) {
      const fields = decodeSchemaFields(_schema, dictionaries);
      return new schema_Schema(
        fields,
        decodeCustomMetadata(_schema),
        dictionaries,
      );
    }
    /** @ignore */
    function decodeRecordBatch(batch, version = MetadataVersion.V4) {
      if (batch.compression() !== null) {
        throw new Error("Record batch compression not implemented");
      }
      return new message_RecordBatch(
        batch.length(),
        decodeFieldNodes(batch),
        decodeBuffers(batch, version),
      );
    }
    /** @ignore */
    function decodeDictionaryBatch(batch, version = MetadataVersion.V4) {
      return new message_DictionaryBatch(
        message_RecordBatch.decode(batch.data(), version),
        batch.id(),
        batch.isDelta(),
      );
    }
    /** @ignore */
    function decodeBufferRegion(b) {
      return new BufferRegion(b.offset(), b.length());
    }
    /** @ignore */
    function decodeFieldNode(f) {
      return new message_FieldNode(f.length(), f.nullCount());
    }
    /** @ignore */
    function decodeFieldNodes(batch) {
      const nodes = [];
      for (let f, i = -1, j = -1, n = batch.nodesLength(); ++i < n; ) {
        if ((f = batch.nodes(i))) {
          nodes[++j] = message_FieldNode.decode(f);
        }
      }
      return nodes;
    }
    /** @ignore */
    function decodeBuffers(batch, version) {
      const bufferRegions = [];
      for (let b, i = -1, j = -1, n = batch.buffersLength(); ++i < n; ) {
        if ((b = batch.buffers(i))) {
          // If this Arrow buffer was written before version 4,
          // advance the buffer's bb_pos 8 bytes to skip past
          // the now-removed page_id field
          if (version < MetadataVersion.V4) {
            b.bb_pos += 8 * (i + 1);
          }
          bufferRegions[++j] = BufferRegion.decode(b);
        }
      }
      return bufferRegions;
    }
    /** @ignore */
    function decodeSchemaFields(schema, dictionaries) {
      const fields = [];
      for (let f, i = -1, j = -1, n = schema.fieldsLength(); ++i < n; ) {
        if ((f = schema.fields(i))) {
          fields[++j] = schema_Field.decode(f, dictionaries);
        }
      }
      return fields;
    }
    /** @ignore */
    function decodeFieldChildren(field, dictionaries) {
      const children = [];
      for (let f, i = -1, j = -1, n = field.childrenLength(); ++i < n; ) {
        if ((f = field.children(i))) {
          children[++j] = schema_Field.decode(f, dictionaries);
        }
      }
      return children;
    }
    /** @ignore */
    function decodeField(f, dictionaries) {
      let id;
      let field;
      let type;
      let keys;
      let dictType;
      let dictMeta;
      // If no dictionary encoding
      if (!dictionaries || !(dictMeta = f.dictionary())) {
        type = decodeFieldType(f, decodeFieldChildren(f, dictionaries));
        field = new schema_Field(
          f.name(),
          type,
          f.nullable(),
          decodeCustomMetadata(f),
        );
      }
      // If dictionary encoded and the first time we've seen this dictionary id, decode
      // the data type and child fields, then wrap in a Dictionary type and insert the
      // data type into the dictionary types map.
      else if (!dictionaries.has((id = dictMeta.id().low))) {
        // a dictionary index defaults to signed 32 bit int if unspecified
        keys = (keys = dictMeta.indexType())
          ? decodeIndexType(keys)
          : new Int32();
        dictionaries.set(
          id,
          (type = decodeFieldType(f, decodeFieldChildren(f, dictionaries))),
        );
        dictType = new Dictionary(type, keys, id, dictMeta.isOrdered());
        field = new schema_Field(
          f.name(),
          dictType,
          f.nullable(),
          decodeCustomMetadata(f),
        );
      }
      // If dictionary encoded, and have already seen this dictionary Id in the schema, then reuse the
      // data type and wrap in a new Dictionary type and field.
      else {
        // a dictionary index defaults to signed 32 bit int if unspecified
        keys = (keys = dictMeta.indexType())
          ? decodeIndexType(keys)
          : new Int32();
        dictType = new Dictionary(
          dictionaries.get(id),
          keys,
          id,
          dictMeta.isOrdered(),
        );
        field = new schema_Field(
          f.name(),
          dictType,
          f.nullable(),
          decodeCustomMetadata(f),
        );
      }
      return field || null;
    }
    /** @ignore */
    function decodeCustomMetadata(parent) {
      const data = new Map();
      if (parent) {
        for (
          let entry, key, i = -1, n = Math.trunc(parent.customMetadataLength());
          ++i < n;

        ) {
          if (
            (entry = parent.customMetadata(i)) &&
            (key = entry.key()) != null
          ) {
            data.set(key, entry.value());
          }
        }
      }
      return data;
    }
    /** @ignore */
    function decodeIndexType(_type) {
      return new Int_(_type.isSigned(), _type.bitWidth());
    }
    /** @ignore */
    function decodeFieldType(f, children) {
      const typeId = f.typeType();
      switch (typeId) {
        case type_Type.NONE:
          return new Null();
        case type_Type.Null:
          return new Null();
        case type_Type.Binary:
          return new Binary();
        case type_Type.Utf8:
          return new Utf8();
        case type_Type.Bool:
          return new Bool();
        case type_Type.List:
          return new List((children || [])[0]);
        case type_Type.Struct_:
          return new Struct(children || []);
      }
      switch (typeId) {
        case type_Type.Int: {
          const t = f.type(new Int());
          return new Int_(t.isSigned(), t.bitWidth());
        }
        case type_Type.FloatingPoint: {
          const t = f.type(new FloatingPoint());
          return new Float(t.precision());
        }
        case type_Type.Decimal: {
          const t = f.type(new decimal_Decimal());
          return new Decimal(t.scale(), t.precision(), t.bitWidth());
        }
        case type_Type.Date: {
          const t = f.type(new date_Date());
          return new Date_(t.unit());
        }
        case type_Type.Time: {
          const t = f.type(new Time());
          return new Time_(t.unit(), t.bitWidth());
        }
        case type_Type.Timestamp: {
          const t = f.type(new Timestamp());
          return new Timestamp_(t.unit(), t.timezone());
        }
        case type_Type.Interval: {
          const t = f.type(new Interval());
          return new Interval_(t.unit());
        }
        case type_Type.Union: {
          const t = f.type(new Union());
          return new Union_(t.mode(), t.typeIdsArray() || [], children || []);
        }
        case type_Type.FixedSizeBinary: {
          const t = f.type(new fixed_size_binary_FixedSizeBinary());
          return new FixedSizeBinary(t.byteWidth());
        }
        case type_Type.FixedSizeList: {
          const t = f.type(new fixed_size_list_FixedSizeList());
          return new FixedSizeList(t.listSize(), (children || [])[0]);
        }
        case type_Type.Map: {
          const t = f.type(new map_Map());
          return new Map_((children || [])[0], t.keysSorted());
        }
      }
      throw new Error(`Unrecognized type: "${type_Type[typeId]}" (${typeId})`);
    }
    /** @ignore */
    function encodeSchema(b, schema) {
      const fieldOffsets = schema.fields.map((f) => schema_Field.encode(b, f));
      Schema.startFieldsVector(b, fieldOffsets.length);
      const fieldsVectorOffset = Schema.createFieldsVector(b, fieldOffsets);
      const metadataOffset = !(schema.metadata && schema.metadata.size > 0)
        ? -1
        : Schema.createCustomMetadataVector(
            b,
            [...schema.metadata].map(([k, v]) => {
              const key = b.createString(`${k}`);
              const val = b.createString(`${v}`);
              KeyValue.startKeyValue(b);
              KeyValue.addKey(b, key);
              KeyValue.addValue(b, val);
              return KeyValue.endKeyValue(b);
            }),
          );
      Schema.startSchema(b);
      Schema.addFields(b, fieldsVectorOffset);
      Schema.addEndianness(
        b,
        platformIsLittleEndian ? Endianness.Little : Endianness.Big,
      );
      if (metadataOffset !== -1) {
        Schema.addCustomMetadata(b, metadataOffset);
      }
      return Schema.endSchema(b);
    }
    /** @ignore */
    function encodeField(b, field) {
      let nameOffset = -1;
      let typeOffset = -1;
      let dictionaryOffset = -1;
      const type = field.type;
      let typeId = field.typeId;
      if (!DataType.isDictionary(type)) {
        typeOffset = typeassembler_instance.visit(type, b);
      } else {
        typeId = type.dictionary.typeId;
        dictionaryOffset = typeassembler_instance.visit(type, b);
        typeOffset = typeassembler_instance.visit(type.dictionary, b);
      }
      const childOffsets = (type.children || []).map((f) =>
        schema_Field.encode(b, f),
      );
      const childrenVectorOffset = Field.createChildrenVector(b, childOffsets);
      const metadataOffset = !(field.metadata && field.metadata.size > 0)
        ? -1
        : Field.createCustomMetadataVector(
            b,
            [...field.metadata].map(([k, v]) => {
              const key = b.createString(`${k}`);
              const val = b.createString(`${v}`);
              KeyValue.startKeyValue(b);
              KeyValue.addKey(b, key);
              KeyValue.addValue(b, val);
              return KeyValue.endKeyValue(b);
            }),
          );
      if (field.name) {
        nameOffset = b.createString(field.name);
      }
      Field.startField(b);
      Field.addType(b, typeOffset);
      Field.addTypeType(b, typeId);
      Field.addChildren(b, childrenVectorOffset);
      Field.addNullable(b, !!field.nullable);
      if (nameOffset !== -1) {
        Field.addName(b, nameOffset);
      }
      if (dictionaryOffset !== -1) {
        Field.addDictionary(b, dictionaryOffset);
      }
      if (metadataOffset !== -1) {
        Field.addCustomMetadata(b, metadataOffset);
      }
      return Field.endField(b);
    }
    /** @ignore */
    function encodeRecordBatch(b, recordBatch) {
      const nodes = recordBatch.nodes || [];
      const buffers = recordBatch.buffers || [];
      record_batch_RecordBatch.startNodesVector(b, nodes.length);
      for (const n of nodes.slice().reverse()) message_FieldNode.encode(b, n);
      const nodesVectorOffset = b.endVector();
      record_batch_RecordBatch.startBuffersVector(b, buffers.length);
      for (const b_ of buffers.slice().reverse()) BufferRegion.encode(b, b_);
      const buffersVectorOffset = b.endVector();
      record_batch_RecordBatch.startRecordBatch(b);
      record_batch_RecordBatch.addLength(
        b,
        new message_Long(recordBatch.length, 0),
      );
      record_batch_RecordBatch.addNodes(b, nodesVectorOffset);
      record_batch_RecordBatch.addBuffers(b, buffersVectorOffset);
      return record_batch_RecordBatch.endRecordBatch(b);
    }
    /** @ignore */
    function encodeDictionaryBatch(b, dictionaryBatch) {
      const dataOffset = message_RecordBatch.encode(b, dictionaryBatch.data);
      DictionaryBatch.startDictionaryBatch(b);
      DictionaryBatch.addId(b, new message_Long(dictionaryBatch.id, 0));
      DictionaryBatch.addIsDelta(b, dictionaryBatch.isDelta);
      DictionaryBatch.addData(b, dataOffset);
      return DictionaryBatch.endDictionaryBatch(b);
    }
    /** @ignore */
    function encodeFieldNode(b, node) {
      return FieldNode.createFieldNode(
        b,
        new message_Long(node.length, 0),
        new message_Long(node.nullCount, 0),
      );
    }
    /** @ignore */
    function encodeBufferRegion(b, node) {
      return Buffer.createBuffer(
        b,
        new message_Long(node.offset, 0),
        new message_Long(node.length, 0),
      );
    }
    /** @ignore */
    const platformIsLittleEndian = (() => {
      const buffer = new ArrayBuffer(2);
      new DataView(buffer).setInt16(0, 256, true /* littleEndian */);
      // Int16Array uses the platform's endianness.
      return new Int16Array(buffer)[0] === 256;
    })(); // CONCATENATED MODULE: ./node_modules/apache-arrow/ipc/message.mjs

    //# sourceMappingURL=message.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */ const invalidMessageType = (type) =>
      `Expected ${MessageHeader[type]} Message in stream, but was null or length 0.`;
    /** @ignore */ const nullMessage = (type) =>
      `Header pointer of flatbuffer-encoded ${MessageHeader[type]} Message is null or length 0.`;
    /** @ignore */ const invalidMessageMetadata = (expected, actual) =>
      `Expected to read ${expected} metadata bytes, but only read ${actual}.`;
    /** @ignore */ const invalidMessageBodyLength = (expected, actual) =>
      `Expected to read ${expected} bytes for message body, but only read ${actual}.`;
    /** @ignore */
    class MessageReader {
      constructor(source) {
        this.source =
          source instanceof ByteStream ? source : new ByteStream(source);
        this.VectorLoader = VectorLoader;
      }
      [Symbol.iterator]() {
        return this;
      }
      next() {
        let r;
        if ((r = this.readMetadataLength()).done) {
          return ITERATOR_DONE;
        }
        // ARROW-6313: If the first 4 bytes are continuation indicator (-1), read
        // the next 4 for the 32-bit metadata length. Otherwise, assume this is a
        // pre-v0.15 message, where the first 4 bytes are the metadata length.
        if (r.value === -1 && (r = this.readMetadataLength()).done) {
          return ITERATOR_DONE;
        }
        if ((r = this.readMetadata(r.value)).done) {
          return ITERATOR_DONE;
        }
        return r;
      }
      throw(value) {
        return this.source.throw(value);
      }
      return(value) {
        return this.source.return(value);
      }
      readMessage(type) {
        let r;
        if ((r = this.next()).done) {
          return null;
        }
        if (type != null && r.value.headerType !== type) {
          throw new Error(invalidMessageType(type));
        }
        return r.value;
      }
      readMessageBody(bodyLength) {
        if (bodyLength <= 0) {
          return new Uint8Array(0);
        }
        const buf = toUint8Array(this.source.read(bodyLength));
        if (buf.byteLength < bodyLength) {
          throw new Error(invalidMessageBodyLength(bodyLength, buf.byteLength));
        }
        // 1. Work around bugs in fs.ReadStream's internal Buffer pooling, see: https://github.com/nodejs/node/issues/24817
        // 2. Work around https://github.com/whatwg/streams/blob/0ebe4b042e467d9876d80ae045de3843092ad797/reference-implementation/lib/helpers.js#L126
        return /* 1. */ buf.byteOffset % 8 === 0 &&
          /* 2. */ buf.byteOffset + buf.byteLength <= buf.buffer.byteLength
          ? buf
          : buf.slice();
      }
      readSchema(throwIfNull = false) {
        const type = MessageHeader.Schema;
        const message = this.readMessage(type);
        const schema =
          message === null || message === void 0 ? void 0 : message.header();
        if (throwIfNull && !schema) {
          throw new Error(nullMessage(type));
        }
        return schema;
      }
      readMetadataLength() {
        const buf = this.source.read(PADDING);
        const bb = buf && new ByteBuffer(buf);
        const len =
          (bb === null || bb === void 0 ? void 0 : bb.readInt32(0)) || 0;
        return { done: len === 0, value: len };
      }
      readMetadata(metadataLength) {
        const buf = this.source.read(metadataLength);
        if (!buf) {
          return ITERATOR_DONE;
        }
        if (buf.byteLength < metadataLength) {
          throw new Error(
            invalidMessageMetadata(metadataLength, buf.byteLength),
          );
        }
        return { done: false, value: Message.decode(buf) };
      }
    }
    /** @ignore */
    class AsyncMessageReader {
      constructor(source, byteLength) {
        this.source =
          source instanceof AsyncByteStream
            ? source
            : isFileHandle(source)
            ? new AsyncRandomAccessFile(source, byteLength)
            : new AsyncByteStream(source);
      }
      [Symbol.asyncIterator]() {
        return this;
      }
      next() {
        return __awaiter(this, void 0, void 0, function* () {
          let r;
          if ((r = yield this.readMetadataLength()).done) {
            return ITERATOR_DONE;
          }
          // ARROW-6313: If the first 4 bytes are continuation indicator (-1), read
          // the next 4 for the 32-bit metadata length. Otherwise, assume this is a
          // pre-v0.15 message, where the first 4 bytes are the metadata length.
          if (r.value === -1 && (r = yield this.readMetadataLength()).done) {
            return ITERATOR_DONE;
          }
          if ((r = yield this.readMetadata(r.value)).done) {
            return ITERATOR_DONE;
          }
          return r;
        });
      }
      throw(value) {
        return __awaiter(this, void 0, void 0, function* () {
          return yield this.source.throw(value);
        });
      }
      return(value) {
        return __awaiter(this, void 0, void 0, function* () {
          return yield this.source.return(value);
        });
      }
      readMessage(type) {
        return __awaiter(this, void 0, void 0, function* () {
          let r;
          if ((r = yield this.next()).done) {
            return null;
          }
          if (type != null && r.value.headerType !== type) {
            throw new Error(invalidMessageType(type));
          }
          return r.value;
        });
      }
      readMessageBody(bodyLength) {
        return __awaiter(this, void 0, void 0, function* () {
          if (bodyLength <= 0) {
            return new Uint8Array(0);
          }
          const buf = toUint8Array(yield this.source.read(bodyLength));
          if (buf.byteLength < bodyLength) {
            throw new Error(
              invalidMessageBodyLength(bodyLength, buf.byteLength),
            );
          }
          // 1. Work around bugs in fs.ReadStream's internal Buffer pooling, see: https://github.com/nodejs/node/issues/24817
          // 2. Work around https://github.com/whatwg/streams/blob/0ebe4b042e467d9876d80ae045de3843092ad797/reference-implementation/lib/helpers.js#L126
          return /* 1. */ buf.byteOffset % 8 === 0 &&
            /* 2. */ buf.byteOffset + buf.byteLength <= buf.buffer.byteLength
            ? buf
            : buf.slice();
        });
      }
      readSchema(throwIfNull = false) {
        return __awaiter(this, void 0, void 0, function* () {
          const type = MessageHeader.Schema;
          const message = yield this.readMessage(type);
          const schema =
            message === null || message === void 0 ? void 0 : message.header();
          if (throwIfNull && !schema) {
            throw new Error(nullMessage(type));
          }
          return schema;
        });
      }
      readMetadataLength() {
        return __awaiter(this, void 0, void 0, function* () {
          const buf = yield this.source.read(PADDING);
          const bb = buf && new ByteBuffer(buf);
          const len =
            (bb === null || bb === void 0 ? void 0 : bb.readInt32(0)) || 0;
          return { done: len === 0, value: len };
        });
      }
      readMetadata(metadataLength) {
        return __awaiter(this, void 0, void 0, function* () {
          const buf = yield this.source.read(metadataLength);
          if (!buf) {
            return ITERATOR_DONE;
          }
          if (buf.byteLength < metadataLength) {
            throw new Error(
              invalidMessageMetadata(metadataLength, buf.byteLength),
            );
          }
          return { done: false, value: Message.decode(buf) };
        });
      }
    }
    /** @ignore */
    class JSONMessageReader extends MessageReader {
      constructor(source) {
        super(new Uint8Array(0));
        this._schema = false;
        this._body = [];
        this._batchIndex = 0;
        this._dictionaryIndex = 0;
        this._json =
          source instanceof ArrowJSON ? source : new ArrowJSON(source);
      }
      next() {
        const { _json } = this;
        if (!this._schema) {
          this._schema = true;
          const message = Message.fromJSON(_json.schema, MessageHeader.Schema);
          return { done: false, value: message };
        }
        if (this._dictionaryIndex < _json.dictionaries.length) {
          const batch = _json.dictionaries[this._dictionaryIndex++];
          this._body = batch["data"]["columns"];
          const message = Message.fromJSON(
            batch,
            MessageHeader.DictionaryBatch,
          );
          return { done: false, value: message };
        }
        if (this._batchIndex < _json.batches.length) {
          const batch = _json.batches[this._batchIndex++];
          this._body = batch["columns"];
          const message = Message.fromJSON(batch, MessageHeader.RecordBatch);
          return { done: false, value: message };
        }
        this._body = [];
        return ITERATOR_DONE;
      }
      readMessageBody(_bodyLength) {
        return flattenDataSources(this._body);
        function flattenDataSources(xs) {
          return (xs || []).reduce(
            (buffers, column) => [
              ...buffers,
              ...((column["VALIDITY"] && [column["VALIDITY"]]) || []),
              ...((column["TYPE"] && [column["TYPE"]]) || []),
              ...((column["OFFSET"] && [column["OFFSET"]]) || []),
              ...((column["DATA"] && [column["DATA"]]) || []),
              ...flattenDataSources(column["children"]),
            ],
            [],
          );
        }
      }
      readMessage(type) {
        let r;
        if ((r = this.next()).done) {
          return null;
        }
        if (type != null && r.value.headerType !== type) {
          throw new Error(invalidMessageType(type));
        }
        return r.value;
      }
      readSchema() {
        const type = MessageHeader.Schema;
        const message = this.readMessage(type);
        const schema =
          message === null || message === void 0 ? void 0 : message.header();
        if (!message || !schema) {
          throw new Error(nullMessage(type));
        }
        return schema;
      }
    }
    /** @ignore */
    const PADDING = 4;
    /** @ignore */
    const MAGIC_STR = "ARROW1";
    /** @ignore */
    const MAGIC = new Uint8Array(MAGIC_STR.length);
    for (let i = 0; i < MAGIC_STR.length; i += 1) {
      MAGIC[i] = MAGIC_STR.codePointAt(i);
    }
    /** @ignore */
    function checkForMagicArrowString(buffer, index = 0) {
      for (let i = -1, n = MAGIC.length; ++i < n; ) {
        if (MAGIC[i] !== buffer[index + i]) {
          return false;
        }
      }
      return true;
    }
    /** @ignore */
    const magicLength = MAGIC.length;
    /** @ignore */
    const magicAndPadding = magicLength + PADDING;
    /** @ignore */
    const magicX2AndPadding = magicLength * 2 + PADDING; // CONCATENATED MODULE: ./node_modules/apache-arrow/ipc/reader.mjs

    //# sourceMappingURL=message.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    class RecordBatchReader extends ReadableInterop {
      constructor(impl) {
        super();
        this._impl = impl;
      }
      get closed() {
        return this._impl.closed;
      }
      get schema() {
        return this._impl.schema;
      }
      get autoDestroy() {
        return this._impl.autoDestroy;
      }
      get dictionaries() {
        return this._impl.dictionaries;
      }
      get numDictionaries() {
        return this._impl.numDictionaries;
      }
      get numRecordBatches() {
        return this._impl.numRecordBatches;
      }
      get footer() {
        return this._impl.isFile() ? this._impl.footer : null;
      }
      isSync() {
        return this._impl.isSync();
      }
      isAsync() {
        return this._impl.isAsync();
      }
      isFile() {
        return this._impl.isFile();
      }
      isStream() {
        return this._impl.isStream();
      }
      next() {
        return this._impl.next();
      }
      throw(value) {
        return this._impl.throw(value);
      }
      return(value) {
        return this._impl.return(value);
      }
      cancel() {
        return this._impl.cancel();
      }
      reset(schema) {
        this._impl.reset(schema);
        this._DOMStream = undefined;
        this._nodeStream = undefined;
        return this;
      }
      open(options) {
        const opening = this._impl.open(options);
        return isPromise(opening) ? opening.then(() => this) : this;
      }
      readRecordBatch(index) {
        return this._impl.isFile() ? this._impl.readRecordBatch(index) : null;
      }
      [Symbol.iterator]() {
        return this._impl[Symbol.iterator]();
      }
      [Symbol.asyncIterator]() {
        return this._impl[Symbol.asyncIterator]();
      }
      toDOMStream() {
        return adapters.toDOMStream(
          this.isSync()
            ? { [Symbol.iterator]: () => this }
            : { [Symbol.asyncIterator]: () => this },
        );
      }
      toNodeStream() {
        return adapters.toNodeStream(
          this.isSync()
            ? { [Symbol.iterator]: () => this }
            : { [Symbol.asyncIterator]: () => this },
          { objectMode: true },
        );
      }
      /** @nocollapse */
      // @ts-ignore
      static throughNode(options) {
        throw new Error(`"throughNode" not available in this environment`);
      }
      /** @nocollapse */
      static throughDOM(
        // @ts-ignore
        writableStrategy,
        // @ts-ignore
        readableStrategy,
      ) {
        throw new Error(`"throughDOM" not available in this environment`);
      }
      /** @nocollapse */
      static from(source) {
        if (source instanceof RecordBatchReader) {
          return source;
        } else if (isArrowJSON(source)) {
          return fromArrowJSON(source);
        } else if (isFileHandle(source)) {
          return fromFileHandle(source);
        } else if (isPromise(source)) {
          return (() =>
            __awaiter(this, void 0, void 0, function* () {
              return yield RecordBatchReader.from(yield source);
            }))();
        } else if (
          isFetchResponse(source) ||
          isReadableDOMStream(source) ||
          isReadableNodeStream(source) ||
          isAsyncIterable(source)
        ) {
          return fromAsyncByteStream(new AsyncByteStream(source));
        }
        return fromByteStream(new ByteStream(source));
      }
      /** @nocollapse */
      static readAll(source) {
        if (source instanceof RecordBatchReader) {
          return source.isSync() ? readAllSync(source) : readAllAsync(source);
        } else if (
          isArrowJSON(source) ||
          ArrayBuffer.isView(source) ||
          isIterable(source) ||
          isIteratorResult(source)
        ) {
          return readAllSync(source);
        }
        return readAllAsync(source);
      }
    }
    //
    // Since TS is a structural type system, we define the following subclass stubs
    // so that concrete types exist to associate with with the interfaces below.
    //
    // The implementation for each RecordBatchReader is hidden away in the set of
    // `RecordBatchReaderImpl` classes in the second half of this file. This allows
    // us to export a single RecordBatchReader class, and swap out the impl based
    // on the io primitives or underlying arrow (JSON, file, or stream) at runtime.
    //
    // Async/await makes our job a bit harder, since it forces everything to be
    // either fully sync or fully async. This is why the logic for the reader impls
    // has been duplicated into both sync and async variants. Since the RBR
    // delegates to its impl, an RBR with an AsyncRecordBatchFileReaderImpl for
    // example will return async/await-friendly Promises, but one with a (sync)
    // RecordBatchStreamReaderImpl will always return values. Nothing should be
    // different about their logic, aside from the async handling. This is also why
    // this code looks highly structured, as it should be nearly identical and easy
    // to follow.
    //
    /** @ignore */
    class RecordBatchStreamReader extends RecordBatchReader {
      constructor(_impl) {
        super(_impl);
        this._impl = _impl;
      }
      readAll() {
        return [...this];
      }
      [Symbol.iterator]() {
        return this._impl[Symbol.iterator]();
      }
      [Symbol.asyncIterator]() {
        return __asyncGenerator(this, arguments, function* _a() {
          yield __await(
            yield* __asyncDelegator(__asyncValues(this[Symbol.iterator]())),
          );
        });
      }
    }
    /** @ignore */
    class AsyncRecordBatchStreamReader extends RecordBatchReader {
      constructor(_impl) {
        super(_impl);
        this._impl = _impl;
      }
      readAll() {
        var e_1, _a;
        return __awaiter(this, void 0, void 0, function* () {
          const batches = new Array();
          try {
            for (
              var _b = __asyncValues(this), _c;
              (_c = yield _b.next()), !_c.done;

            ) {
              const batch = _c.value;
              batches.push(batch);
            }
          } catch (e_1_1) {
            e_1 = { error: e_1_1 };
          } finally {
            try {
              if (_c && !_c.done && (_a = _b.return)) yield _a.call(_b);
            } finally {
              if (e_1) throw e_1.error;
            }
          }
          return batches;
        });
      }
      [Symbol.iterator]() {
        throw new Error(`AsyncRecordBatchStreamReader is not Iterable`);
      }
      [Symbol.asyncIterator]() {
        return this._impl[Symbol.asyncIterator]();
      }
    }
    /** @ignore */
    class RecordBatchFileReader extends RecordBatchStreamReader {
      constructor(_impl) {
        super(_impl);
        this._impl = _impl;
      }
    }
    /** @ignore */
    class AsyncRecordBatchFileReader extends AsyncRecordBatchStreamReader {
      constructor(_impl) {
        super(_impl);
        this._impl = _impl;
      }
    }
    /** @ignore */
    class RecordBatchReaderImpl {
      constructor(dictionaries = new Map()) {
        this.closed = false;
        this.autoDestroy = true;
        this._dictionaryIndex = 0;
        this._recordBatchIndex = 0;
        this.dictionaries = dictionaries;
      }
      get numDictionaries() {
        return this._dictionaryIndex;
      }
      get numRecordBatches() {
        return this._recordBatchIndex;
      }
      isSync() {
        return false;
      }
      isAsync() {
        return false;
      }
      isFile() {
        return false;
      }
      isStream() {
        return false;
      }
      reset(schema) {
        this._dictionaryIndex = 0;
        this._recordBatchIndex = 0;
        this.schema = schema;
        this.dictionaries = new Map();
        return this;
      }
      _loadRecordBatch(header, body) {
        const children = this._loadVectors(header, body, this.schema.fields);
        const data = makeData({
          type: new Struct(this.schema.fields),
          length: header.length,
          children,
        });
        return new RecordBatch(this.schema, data);
      }
      _loadDictionaryBatch(header, body) {
        const { id, isDelta } = header;
        const { dictionaries, schema } = this;
        const dictionary = dictionaries.get(id);
        if (isDelta || !dictionary) {
          const type = schema.dictionaries.get(id);
          const data = this._loadVectors(header.data, body, [type]);
          return (
            dictionary && isDelta
              ? dictionary.concat(new Vector(data))
              : new Vector(data)
          ).memoize();
        }
        return dictionary.memoize();
      }
      _loadVectors(header, body, types) {
        return new VectorLoader(
          body,
          header.nodes,
          header.buffers,
          this.dictionaries,
        ).visitMany(types);
      }
    }
    /** @ignore */
    class RecordBatchStreamReaderImpl extends RecordBatchReaderImpl {
      constructor(source, dictionaries) {
        super(dictionaries);
        this._reader = !isArrowJSON(source)
          ? new MessageReader((this._handle = source))
          : new JSONMessageReader((this._handle = source));
      }
      isSync() {
        return true;
      }
      isStream() {
        return true;
      }
      [Symbol.iterator]() {
        return this;
      }
      cancel() {
        if (!this.closed && (this.closed = true)) {
          this.reset()._reader.return();
          this._reader = null;
          this.dictionaries = null;
        }
      }
      open(options) {
        if (!this.closed) {
          this.autoDestroy = shouldAutoDestroy(this, options);
          if (!(this.schema || (this.schema = this._reader.readSchema()))) {
            this.cancel();
          }
        }
        return this;
      }
      throw(value) {
        if (!this.closed && this.autoDestroy && (this.closed = true)) {
          return this.reset()._reader.throw(value);
        }
        return ITERATOR_DONE;
      }
      return(value) {
        if (!this.closed && this.autoDestroy && (this.closed = true)) {
          return this.reset()._reader.return(value);
        }
        return ITERATOR_DONE;
      }
      next() {
        if (this.closed) {
          return ITERATOR_DONE;
        }
        let message;
        const { _reader: reader } = this;
        while ((message = this._readNextMessageAndValidate())) {
          if (message.isSchema()) {
            this.reset(message.header());
          } else if (message.isRecordBatch()) {
            this._recordBatchIndex++;
            const header = message.header();
            const buffer = reader.readMessageBody(message.bodyLength);
            const recordBatch = this._loadRecordBatch(header, buffer);
            return { done: false, value: recordBatch };
          } else if (message.isDictionaryBatch()) {
            this._dictionaryIndex++;
            const header = message.header();
            const buffer = reader.readMessageBody(message.bodyLength);
            const vector = this._loadDictionaryBatch(header, buffer);
            this.dictionaries.set(header.id, vector);
          }
        }
        if (this.schema && this._recordBatchIndex === 0) {
          this._recordBatchIndex++;
          return {
            done: false,
            value: new _InternalEmptyPlaceholderRecordBatch(this.schema),
          };
        }
        return this.return();
      }
      _readNextMessageAndValidate(type) {
        return this._reader.readMessage(type);
      }
    }
    /** @ignore */
    class AsyncRecordBatchStreamReaderImpl extends RecordBatchReaderImpl {
      constructor(source, dictionaries) {
        super(dictionaries);
        this._reader = new AsyncMessageReader((this._handle = source));
      }
      isAsync() {
        return true;
      }
      isStream() {
        return true;
      }
      [Symbol.asyncIterator]() {
        return this;
      }
      cancel() {
        return __awaiter(this, void 0, void 0, function* () {
          if (!this.closed && (this.closed = true)) {
            yield this.reset()._reader.return();
            this._reader = null;
            this.dictionaries = null;
          }
        });
      }
      open(options) {
        return __awaiter(this, void 0, void 0, function* () {
          if (!this.closed) {
            this.autoDestroy = shouldAutoDestroy(this, options);
            if (
              !(this.schema || (this.schema = yield this._reader.readSchema()))
            ) {
              yield this.cancel();
            }
          }
          return this;
        });
      }
      throw(value) {
        return __awaiter(this, void 0, void 0, function* () {
          if (!this.closed && this.autoDestroy && (this.closed = true)) {
            return yield this.reset()._reader.throw(value);
          }
          return ITERATOR_DONE;
        });
      }
      return(value) {
        return __awaiter(this, void 0, void 0, function* () {
          if (!this.closed && this.autoDestroy && (this.closed = true)) {
            return yield this.reset()._reader.return(value);
          }
          return ITERATOR_DONE;
        });
      }
      next() {
        return __awaiter(this, void 0, void 0, function* () {
          if (this.closed) {
            return ITERATOR_DONE;
          }
          let message;
          const { _reader: reader } = this;
          while ((message = yield this._readNextMessageAndValidate())) {
            if (message.isSchema()) {
              yield this.reset(message.header());
            } else if (message.isRecordBatch()) {
              this._recordBatchIndex++;
              const header = message.header();
              const buffer = yield reader.readMessageBody(message.bodyLength);
              const recordBatch = this._loadRecordBatch(header, buffer);
              return { done: false, value: recordBatch };
            } else if (message.isDictionaryBatch()) {
              this._dictionaryIndex++;
              const header = message.header();
              const buffer = yield reader.readMessageBody(message.bodyLength);
              const vector = this._loadDictionaryBatch(header, buffer);
              this.dictionaries.set(header.id, vector);
            }
          }
          if (this.schema && this._recordBatchIndex === 0) {
            this._recordBatchIndex++;
            return {
              done: false,
              value: new _InternalEmptyPlaceholderRecordBatch(this.schema),
            };
          }
          return yield this.return();
        });
      }
      _readNextMessageAndValidate(type) {
        return __awaiter(this, void 0, void 0, function* () {
          return yield this._reader.readMessage(type);
        });
      }
    }
    /** @ignore */
    class RecordBatchFileReaderImpl extends RecordBatchStreamReaderImpl {
      constructor(source, dictionaries) {
        super(
          source instanceof RandomAccessFile
            ? source
            : new RandomAccessFile(source),
          dictionaries,
        );
      }
      get footer() {
        return this._footer;
      }
      get numDictionaries() {
        return this._footer ? this._footer.numDictionaries : 0;
      }
      get numRecordBatches() {
        return this._footer ? this._footer.numRecordBatches : 0;
      }
      isSync() {
        return true;
      }
      isFile() {
        return true;
      }
      open(options) {
        if (!this.closed && !this._footer) {
          this.schema = (this._footer = this._readFooter()).schema;
          for (const block of this._footer.dictionaryBatches()) {
            block && this._readDictionaryBatch(this._dictionaryIndex++);
          }
        }
        return super.open(options);
      }
      readRecordBatch(index) {
        var _a;
        if (this.closed) {
          return null;
        }
        if (!this._footer) {
          this.open();
        }
        const block =
          (_a = this._footer) === null || _a === void 0
            ? void 0
            : _a.getRecordBatch(index);
        if (block && this._handle.seek(block.offset)) {
          const message = this._reader.readMessage(MessageHeader.RecordBatch);
          if (
            message === null || message === void 0
              ? void 0
              : message.isRecordBatch()
          ) {
            const header = message.header();
            const buffer = this._reader.readMessageBody(message.bodyLength);
            const recordBatch = this._loadRecordBatch(header, buffer);
            return recordBatch;
          }
        }
        return null;
      }
      _readDictionaryBatch(index) {
        var _a;
        const block =
          (_a = this._footer) === null || _a === void 0
            ? void 0
            : _a.getDictionaryBatch(index);
        if (block && this._handle.seek(block.offset)) {
          const message = this._reader.readMessage(
            MessageHeader.DictionaryBatch,
          );
          if (
            message === null || message === void 0
              ? void 0
              : message.isDictionaryBatch()
          ) {
            const header = message.header();
            const buffer = this._reader.readMessageBody(message.bodyLength);
            const vector = this._loadDictionaryBatch(header, buffer);
            this.dictionaries.set(header.id, vector);
          }
        }
      }
      _readFooter() {
        const { _handle } = this;
        const offset = _handle.size - magicAndPadding;
        const length = _handle.readInt32(offset);
        const buffer = _handle.readAt(offset - length, length);
        return Footer_.decode(buffer);
      }
      _readNextMessageAndValidate(type) {
        var _a;
        if (!this._footer) {
          this.open();
        }
        if (this._footer && this._recordBatchIndex < this.numRecordBatches) {
          const block =
            (_a = this._footer) === null || _a === void 0
              ? void 0
              : _a.getRecordBatch(this._recordBatchIndex);
          if (block && this._handle.seek(block.offset)) {
            return this._reader.readMessage(type);
          }
        }
        return null;
      }
    }
    /** @ignore */
    class AsyncRecordBatchFileReaderImpl extends AsyncRecordBatchStreamReaderImpl {
      constructor(source, ...rest) {
        const byteLength =
          typeof rest[0] !== "number" ? rest.shift() : undefined;
        const dictionaries = rest[0] instanceof Map ? rest.shift() : undefined;
        super(
          source instanceof AsyncRandomAccessFile
            ? source
            : new AsyncRandomAccessFile(source, byteLength),
          dictionaries,
        );
      }
      get footer() {
        return this._footer;
      }
      get numDictionaries() {
        return this._footer ? this._footer.numDictionaries : 0;
      }
      get numRecordBatches() {
        return this._footer ? this._footer.numRecordBatches : 0;
      }
      isFile() {
        return true;
      }
      isAsync() {
        return true;
      }
      open(options) {
        const _super = Object.create(null, {
          open: { get: () => super.open },
        });
        return __awaiter(this, void 0, void 0, function* () {
          if (!this.closed && !this._footer) {
            this.schema = (this._footer = yield this._readFooter()).schema;
            for (const block of this._footer.dictionaryBatches()) {
              block &&
                (yield this._readDictionaryBatch(this._dictionaryIndex++));
            }
          }
          return yield _super.open.call(this, options);
        });
      }
      readRecordBatch(index) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
          if (this.closed) {
            return null;
          }
          if (!this._footer) {
            yield this.open();
          }
          const block =
            (_a = this._footer) === null || _a === void 0
              ? void 0
              : _a.getRecordBatch(index);
          if (block && (yield this._handle.seek(block.offset))) {
            const message = yield this._reader.readMessage(
              MessageHeader.RecordBatch,
            );
            if (
              message === null || message === void 0
                ? void 0
                : message.isRecordBatch()
            ) {
              const header = message.header();
              const buffer = yield this._reader.readMessageBody(
                message.bodyLength,
              );
              const recordBatch = this._loadRecordBatch(header, buffer);
              return recordBatch;
            }
          }
          return null;
        });
      }
      _readDictionaryBatch(index) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
          const block =
            (_a = this._footer) === null || _a === void 0
              ? void 0
              : _a.getDictionaryBatch(index);
          if (block && (yield this._handle.seek(block.offset))) {
            const message = yield this._reader.readMessage(
              MessageHeader.DictionaryBatch,
            );
            if (
              message === null || message === void 0
                ? void 0
                : message.isDictionaryBatch()
            ) {
              const header = message.header();
              const buffer = yield this._reader.readMessageBody(
                message.bodyLength,
              );
              const vector = this._loadDictionaryBatch(header, buffer);
              this.dictionaries.set(header.id, vector);
            }
          }
        });
      }
      _readFooter() {
        return __awaiter(this, void 0, void 0, function* () {
          const { _handle } = this;
          _handle._pending && (yield _handle._pending);
          const offset = _handle.size - magicAndPadding;
          const length = yield _handle.readInt32(offset);
          const buffer = yield _handle.readAt(offset - length, length);
          return Footer_.decode(buffer);
        });
      }
      _readNextMessageAndValidate(type) {
        return __awaiter(this, void 0, void 0, function* () {
          if (!this._footer) {
            yield this.open();
          }
          if (this._footer && this._recordBatchIndex < this.numRecordBatches) {
            const block = this._footer.getRecordBatch(this._recordBatchIndex);
            if (block && (yield this._handle.seek(block.offset))) {
              return yield this._reader.readMessage(type);
            }
          }
          return null;
        });
      }
    }
    /** @ignore */
    class RecordBatchJSONReaderImpl extends RecordBatchStreamReaderImpl {
      constructor(source, dictionaries) {
        super(source, dictionaries);
      }
      _loadVectors(header, body, types) {
        return new JSONVectorLoader(
          body,
          header.nodes,
          header.buffers,
          this.dictionaries,
        ).visitMany(types);
      }
    }
    //
    // Define some helper functions and static implementations down here. There's
    // a bit of branching in the static methods that can lead to the same routines
    // being executed, so we've broken those out here for readability.
    //
    /** @ignore */
    function shouldAutoDestroy(self, options) {
      return options && typeof options["autoDestroy"] === "boolean"
        ? options["autoDestroy"]
        : self["autoDestroy"];
    }
    /** @ignore */
    function* readAllSync(source) {
      const reader = RecordBatchReader.from(source);
      try {
        if (!reader.open({ autoDestroy: false }).closed) {
          do {
            yield reader;
          } while (!reader.reset().open().closed);
        }
      } finally {
        reader.cancel();
      }
    }
    /** @ignore */
    function readAllAsync(source) {
      return __asyncGenerator(this, arguments, function* readAllAsync_1() {
        const reader = yield __await(RecordBatchReader.from(source));
        try {
          if (!(yield __await(reader.open({ autoDestroy: false }))).closed) {
            do {
              yield yield __await(reader);
            } while (!(yield __await(reader.reset().open())).closed);
          }
        } finally {
          yield __await(reader.cancel());
        }
      });
    }
    /** @ignore */
    function fromArrowJSON(source) {
      return new RecordBatchStreamReader(new RecordBatchJSONReaderImpl(source));
    }
    /** @ignore */
    function fromByteStream(source) {
      const bytes = source.peek((magicLength + 7) & ~7);
      return bytes && bytes.byteLength >= 4
        ? !checkForMagicArrowString(bytes)
          ? new RecordBatchStreamReader(new RecordBatchStreamReaderImpl(source))
          : new RecordBatchFileReader(
              new RecordBatchFileReaderImpl(source.read()),
            )
        : new RecordBatchStreamReader(
            new RecordBatchStreamReaderImpl((function* () {})()),
          );
    }
    /** @ignore */
    function fromAsyncByteStream(source) {
      return __awaiter(this, void 0, void 0, function* () {
        const bytes = yield source.peek((magicLength + 7) & ~7);
        return bytes && bytes.byteLength >= 4
          ? !checkForMagicArrowString(bytes)
            ? new AsyncRecordBatchStreamReader(
                new AsyncRecordBatchStreamReaderImpl(source),
              )
            : new RecordBatchFileReader(
                new RecordBatchFileReaderImpl(yield source.read()),
              )
          : new AsyncRecordBatchStreamReader(
              new AsyncRecordBatchStreamReaderImpl(
                (function () {
                  return __asyncGenerator(this, arguments, function* () {});
                })(),
              ),
            );
      });
    }
    /** @ignore */
    function fromFileHandle(source) {
      return __awaiter(this, void 0, void 0, function* () {
        const { size } = yield source.stat();
        const file = new AsyncRandomAccessFile(source, size);
        if (
          size >= magicX2AndPadding &&
          checkForMagicArrowString(yield file.readAt(0, (magicLength + 7) & ~7))
        ) {
          return new AsyncRecordBatchFileReader(
            new AsyncRecordBatchFileReaderImpl(file),
          );
        }
        return new AsyncRecordBatchStreamReader(
          new AsyncRecordBatchStreamReaderImpl(file),
        );
      });
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/visitor/vectorassembler.mjs

    //# sourceMappingURL=reader.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    class VectorAssembler extends Visitor {
      constructor() {
        super();
        this._byteLength = 0;
        this._nodes = [];
        this._buffers = [];
        this._bufferRegions = [];
      }
      /** @nocollapse */
      static assemble(...args) {
        const unwrap = (nodes) =>
          nodes.flatMap((node) =>
            Array.isArray(node)
              ? unwrap(node)
              : node instanceof RecordBatch
              ? node.data.children
              : node.data,
          );
        const assembler = new VectorAssembler();
        assembler.visitMany(unwrap(args));
        return assembler;
      }
      visit(data) {
        if (data instanceof Vector) {
          this.visitMany(data.data);
          return this;
        }
        const { type } = data;
        if (!DataType.isDictionary(type)) {
          const { length, nullCount } = data;
          if (length > 2147483647) {
            /* istanbul ignore next */
            throw new RangeError(
              "Cannot write arrays larger than 2^31 - 1 in length",
            );
          }
          if (!DataType.isNull(type)) {
            addBuffer.call(
              this,
              nullCount <= 0
                ? new Uint8Array(0) // placeholder validity buffer
                : truncateBitmap(data.offset, length, data.nullBitmap),
            );
          }
          this.nodes.push(new message_FieldNode(length, nullCount));
        }
        return super.visit(data);
      }
      visitNull(_null) {
        return this;
      }
      visitDictionary(data) {
        // Assemble the indices here, Dictionary assembled separately.
        return this.visit(data.clone(data.type.indices));
      }
      get nodes() {
        return this._nodes;
      }
      get buffers() {
        return this._buffers;
      }
      get byteLength() {
        return this._byteLength;
      }
      get bufferRegions() {
        return this._bufferRegions;
      }
    }
    /** @ignore */
    function addBuffer(values) {
      const byteLength = (values.byteLength + 7) & ~7; // Round up to a multiple of 8
      this.buffers.push(values);
      this.bufferRegions.push(new BufferRegion(this._byteLength, byteLength));
      this._byteLength += byteLength;
      return this;
    }
    /** @ignore */
    function assembleUnion(data) {
      const { type, length, typeIds, valueOffsets } = data;
      // All Union Vectors have a typeIds buffer
      addBuffer.call(this, typeIds);
      // If this is a Sparse Union, treat it like all other Nested types
      if (type.mode === UnionMode.Sparse) {
        return assembleNestedVector.call(this, data);
      } else if (type.mode === UnionMode.Dense) {
        // If this is a Dense Union, add the valueOffsets buffer and potentially slice the children
        if (data.offset <= 0) {
          // If the Vector hasn't been sliced, write the existing valueOffsets
          addBuffer.call(this, valueOffsets);
          // We can treat this like all other Nested types
          return assembleNestedVector.call(this, data);
        } else {
          // A sliced Dense Union is an unpleasant case. Because the offsets are different for
          // each child vector, we need to "rebase" the valueOffsets for each child
          // Union typeIds are not necessary 0-indexed
          const maxChildTypeId = typeIds.reduce(
            (x, y) => Math.max(x, y),
            typeIds[0],
          );
          const childLengths = new Int32Array(maxChildTypeId + 1);
          // Set all to -1 to indicate that we haven't observed a first occurrence of a particular child yet
          const childOffsets = new Int32Array(maxChildTypeId + 1).fill(-1);
          const shiftedOffsets = new Int32Array(length);
          // If we have a non-zero offset, then the value offsets do not start at
          // zero. We must a) create a new offsets array with shifted offsets and
          // b) slice the values array accordingly
          const unshiftedOffsets = rebaseValueOffsets(
            -valueOffsets[0],
            length,
            valueOffsets,
          );
          for (let typeId, shift, index = -1; ++index < length; ) {
            if ((shift = childOffsets[(typeId = typeIds[index])]) === -1) {
              shift = childOffsets[typeId] = unshiftedOffsets[typeId];
            }
            shiftedOffsets[index] = unshiftedOffsets[index] - shift;
            ++childLengths[typeId];
          }
          addBuffer.call(this, shiftedOffsets);
          // Slice and visit children accordingly
          for (
            let child, childIndex = -1, numChildren = type.children.length;
            ++childIndex < numChildren;

          ) {
            if ((child = data.children[childIndex])) {
              const typeId = type.typeIds[childIndex];
              const childLength = Math.min(length, childLengths[typeId]);
              this.visit(child.slice(childOffsets[typeId], childLength));
            }
          }
        }
      }
      return this;
    }
    /** @ignore */
    function assembleBoolVector(data) {
      // Bool vector is a special case of FlatVector, as its data buffer needs to stay packed
      let values;
      if (data.nullCount >= data.length) {
        // If all values are null, just insert a placeholder empty data buffer (fastest path)
        return addBuffer.call(this, new Uint8Array(0));
      } else if ((values = data.values) instanceof Uint8Array) {
        // If values is already a Uint8Array, slice the bitmap (fast path)
        return addBuffer.call(
          this,
          truncateBitmap(data.offset, data.length, values),
        );
      }
      // Otherwise if the underlying data *isn't* a Uint8Array, enumerate the
      // values as bools and re-pack them into a Uint8Array. This code isn't
      // reachable unless you're trying to manipulate the Data internals,
      // we're only doing this for safety.
      /* istanbul ignore next */
      return addBuffer.call(this, packBools(data.values));
    }
    /** @ignore */
    function assembleFlatVector(data) {
      return addBuffer.call(
        this,
        data.values.subarray(0, data.length * data.stride),
      );
    }
    /** @ignore */
    function assembleFlatListVector(data) {
      const { length, values, valueOffsets } = data;
      const firstOffset = valueOffsets[0];
      const lastOffset = valueOffsets[length];
      const byteLength = Math.min(
        lastOffset - firstOffset,
        values.byteLength - firstOffset,
      );
      // Push in the order FlatList types read their buffers
      addBuffer.call(
        this,
        rebaseValueOffsets(-valueOffsets[0], length, valueOffsets),
      ); // valueOffsets buffer first
      addBuffer.call(
        this,
        values.subarray(firstOffset, firstOffset + byteLength),
      ); // sliced values buffer second
      return this;
    }
    /** @ignore */
    function assembleListVector(data) {
      const { length, valueOffsets } = data;
      // If we have valueOffsets (MapVector, ListVector), push that buffer first
      if (valueOffsets) {
        addBuffer.call(
          this,
          rebaseValueOffsets(valueOffsets[0], length, valueOffsets),
        );
      }
      // Then insert the List's values child
      return this.visit(data.children[0]);
    }
    /** @ignore */
    function assembleNestedVector(data) {
      return this.visitMany(
        data.type.children.map((_, i) => data.children[i]).filter(Boolean),
      )[0];
    }
    VectorAssembler.prototype.visitBool = assembleBoolVector;
    VectorAssembler.prototype.visitInt = assembleFlatVector;
    VectorAssembler.prototype.visitFloat = assembleFlatVector;
    VectorAssembler.prototype.visitUtf8 = assembleFlatListVector;
    VectorAssembler.prototype.visitBinary = assembleFlatListVector;
    VectorAssembler.prototype.visitFixedSizeBinary = assembleFlatVector;
    VectorAssembler.prototype.visitDate = assembleFlatVector;
    VectorAssembler.prototype.visitTimestamp = assembleFlatVector;
    VectorAssembler.prototype.visitTime = assembleFlatVector;
    VectorAssembler.prototype.visitDecimal = assembleFlatVector;
    VectorAssembler.prototype.visitList = assembleListVector;
    VectorAssembler.prototype.visitStruct = assembleNestedVector;
    VectorAssembler.prototype.visitUnion = assembleUnion;
    VectorAssembler.prototype.visitInterval = assembleFlatVector;
    VectorAssembler.prototype.visitFixedSizeList = assembleListVector;
    VectorAssembler.prototype.visitMap = assembleListVector; // CONCATENATED MODULE: ./node_modules/apache-arrow/visitor/jsontypeassembler.mjs

    //# sourceMappingURL=vectorassembler.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    class JSONTypeAssembler extends Visitor {
      visit(node) {
        return node == null ? undefined : super.visit(node);
      }
      visitNull({ typeId }) {
        return { name: type_Type[typeId].toLowerCase() };
      }
      visitInt({ typeId, bitWidth, isSigned }) {
        return {
          name: type_Type[typeId].toLowerCase(),
          bitWidth: bitWidth,
          isSigned: isSigned,
        };
      }
      visitFloat({ typeId, precision }) {
        return {
          name: type_Type[typeId].toLowerCase(),
          precision: Precision[precision],
        };
      }
      visitBinary({ typeId }) {
        return { name: type_Type[typeId].toLowerCase() };
      }
      visitBool({ typeId }) {
        return { name: type_Type[typeId].toLowerCase() };
      }
      visitUtf8({ typeId }) {
        return { name: type_Type[typeId].toLowerCase() };
      }
      visitDecimal({ typeId, scale, precision, bitWidth }) {
        return {
          name: type_Type[typeId].toLowerCase(),
          scale: scale,
          precision: precision,
          bitWidth: bitWidth,
        };
      }
      visitDate({ typeId, unit }) {
        return { name: type_Type[typeId].toLowerCase(), unit: DateUnit[unit] };
      }
      visitTime({ typeId, unit, bitWidth }) {
        return {
          name: type_Type[typeId].toLowerCase(),
          unit: TimeUnit[unit],
          bitWidth,
        };
      }
      visitTimestamp({ typeId, timezone, unit }) {
        return {
          name: type_Type[typeId].toLowerCase(),
          unit: TimeUnit[unit],
          timezone,
        };
      }
      visitInterval({ typeId, unit }) {
        return {
          name: type_Type[typeId].toLowerCase(),
          unit: IntervalUnit[unit],
        };
      }
      visitList({ typeId }) {
        return { name: type_Type[typeId].toLowerCase() };
      }
      visitStruct({ typeId }) {
        return { name: type_Type[typeId].toLowerCase() };
      }
      visitUnion({ typeId, mode, typeIds }) {
        return {
          name: type_Type[typeId].toLowerCase(),
          mode: UnionMode[mode],
          typeIds: [...typeIds],
        };
      }
      visitDictionary(node) {
        return this.visit(node.dictionary);
      }
      visitFixedSizeBinary({ typeId, byteWidth }) {
        return { name: type_Type[typeId].toLowerCase(), byteWidth: byteWidth };
      }
      visitFixedSizeList({ typeId, listSize }) {
        return { name: type_Type[typeId].toLowerCase(), listSize: listSize };
      }
      visitMap({ typeId, keysSorted }) {
        return {
          name: type_Type[typeId].toLowerCase(),
          keysSorted: keysSorted,
        };
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/visitor/jsonvectorassembler.mjs

    //# sourceMappingURL=jsontypeassembler.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    class JSONVectorAssembler extends Visitor {
      /** @nocollapse */
      static assemble(...batches) {
        const assemlber = new JSONVectorAssembler();
        return batches.map(({ schema, data }) => {
          return assemlber.visitMany(schema.fields, data.children);
        });
      }
      visit({ name }, data) {
        const { length } = data;
        const { offset, nullCount, nullBitmap } = data;
        const type = DataType.isDictionary(data.type)
          ? data.type.indices
          : data.type;
        const buffers = Object.assign([], data.buffers, {
          [BufferType.VALIDITY]: undefined,
        });
        return Object.assign(
          {
            name: name,
            count: length,
            VALIDITY: DataType.isNull(type)
              ? undefined
              : nullCount <= 0
              ? Array.from({ length }, () => 1)
              : [...new BitIterator(nullBitmap, offset, length, null, getBit)],
          },
          super.visit(data.clone(type, offset, length, 0, buffers)),
        );
      }
      visitNull() {
        return {};
      }
      visitBool({ values, offset, length }) {
        return {
          DATA: [...new BitIterator(values, offset, length, null, bit_getBool)],
        };
      }
      visitInt(data) {
        return {
          DATA:
            data.type.bitWidth < 64
              ? [...data.values]
              : [...bigNumsToStrings(data.values, 2)],
        };
      }
      visitFloat(data) {
        return { DATA: [...data.values] };
      }
      visitUtf8(data) {
        return {
          DATA: [...new Vector([data])],
          OFFSET: [...data.valueOffsets],
        };
      }
      visitBinary(data) {
        return {
          DATA: [...binaryToString(new Vector([data]))],
          OFFSET: [...data.valueOffsets],
        };
      }
      visitFixedSizeBinary(data) {
        return { DATA: [...binaryToString(new Vector([data]))] };
      }
      visitDate(data) {
        return {
          DATA:
            data.type.unit === DateUnit.DAY
              ? [...data.values]
              : [...bigNumsToStrings(data.values, 2)],
        };
      }
      visitTimestamp(data) {
        return { DATA: [...bigNumsToStrings(data.values, 2)] };
      }
      visitTime(data) {
        return {
          DATA:
            data.type.unit < TimeUnit.MICROSECOND
              ? [...data.values]
              : [...bigNumsToStrings(data.values, 2)],
        };
      }
      visitDecimal(data) {
        return { DATA: [...bigNumsToStrings(data.values, 4)] };
      }
      visitList(data) {
        return {
          OFFSET: [...data.valueOffsets],
          children: this.visitMany(data.type.children, data.children),
        };
      }
      visitStruct(data) {
        return {
          children: this.visitMany(data.type.children, data.children),
        };
      }
      visitUnion(data) {
        return {
          TYPE: [...data.typeIds],
          OFFSET:
            data.type.mode === UnionMode.Dense
              ? [...data.valueOffsets]
              : undefined,
          children: this.visitMany(data.type.children, data.children),
        };
      }
      visitInterval(data) {
        return { DATA: [...data.values] };
      }
      visitFixedSizeList(data) {
        return {
          children: this.visitMany(data.type.children, data.children),
        };
      }
      visitMap(data) {
        return {
          OFFSET: [...data.valueOffsets],
          children: this.visitMany(data.type.children, data.children),
        };
      }
    }
    /** @ignore */
    function* binaryToString(vector) {
      for (const octets of vector) {
        yield octets
          .reduce((str, byte) => {
            return `${str}${("0" + (byte & 0xff).toString(16)).slice(-2)}`;
          }, "")
          .toUpperCase();
      }
    }
    /** @ignore */
    function* bigNumsToStrings(values, stride) {
      const u32s = new Uint32Array(values.buffer);
      for (let i = -1, n = u32s.length / stride; ++i < n; ) {
        yield `${BN["new"](
          u32s.subarray((i + 0) * stride, (i + 1) * stride),
          false,
        )}`;
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/ipc/writer.mjs

    //# sourceMappingURL=jsonvectorassembler.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    class RecordBatchWriter extends ReadableInterop {
      constructor(options) {
        super();
        this._position = 0;
        this._started = false;
        // @ts-ignore
        this._sink = new AsyncByteQueue();
        this._schema = null;
        this._dictionaryBlocks = [];
        this._recordBatchBlocks = [];
        this._dictionaryDeltaOffsets = new Map();
        isObject(options) ||
          (options = { autoDestroy: true, writeLegacyIpcFormat: false });
        this._autoDestroy =
          typeof options.autoDestroy === "boolean" ? options.autoDestroy : true;
        this._writeLegacyIpcFormat =
          typeof options.writeLegacyIpcFormat === "boolean"
            ? options.writeLegacyIpcFormat
            : false;
      }
      /** @nocollapse */
      // @ts-ignore
      static throughNode(options) {
        throw new Error(`"throughNode" not available in this environment`);
      }
      /** @nocollapse */
      static throughDOM(
        // @ts-ignore
        writableStrategy,
        // @ts-ignore
        readableStrategy,
      ) {
        throw new Error(`"throughDOM" not available in this environment`);
      }
      toString(sync = false) {
        return this._sink.toString(sync);
      }
      toUint8Array(sync = false) {
        return this._sink.toUint8Array(sync);
      }
      writeAll(input) {
        if (isPromise(input)) {
          return input.then((x) => this.writeAll(x));
        } else if (isAsyncIterable(input)) {
          return writeAllAsync(this, input);
        }
        return writeAll(this, input);
      }
      get closed() {
        return this._sink.closed;
      }
      [Symbol.asyncIterator]() {
        return this._sink[Symbol.asyncIterator]();
      }
      toDOMStream(options) {
        return this._sink.toDOMStream(options);
      }
      toNodeStream(options) {
        return this._sink.toNodeStream(options);
      }
      close() {
        return this.reset()._sink.close();
      }
      abort(reason) {
        return this.reset()._sink.abort(reason);
      }
      finish() {
        this._autoDestroy ? this.close() : this.reset(this._sink, this._schema);
        return this;
      }
      reset(sink = this._sink, schema = null) {
        if (sink === this._sink || sink instanceof AsyncByteQueue) {
          this._sink = sink;
        } else {
          this._sink = new AsyncByteQueue();
          if (sink && isWritableDOMStream(sink)) {
            this.toDOMStream({ type: "bytes" }).pipeTo(sink);
          } else if (sink && isWritableNodeStream(sink)) {
            this.toNodeStream({ objectMode: false }).pipe(sink);
          }
        }
        if (this._started && this._schema) {
          this._writeFooter(this._schema);
        }
        this._started = false;
        this._dictionaryBlocks = [];
        this._recordBatchBlocks = [];
        this._dictionaryDeltaOffsets = new Map();
        if (!schema || !compareSchemas(schema, this._schema)) {
          if (schema == null) {
            this._position = 0;
            this._schema = null;
          } else {
            this._started = true;
            this._schema = schema;
            this._writeSchema(schema);
          }
        }
        return this;
      }
      write(payload) {
        let schema = null;
        if (!this._sink) {
          throw new Error(`RecordBatchWriter is closed`);
        } else if (payload == null) {
          return this.finish() && undefined;
        } else if (payload instanceof Table && !(schema = payload.schema)) {
          return this.finish() && undefined;
        } else if (
          payload instanceof RecordBatch &&
          !(schema = payload.schema)
        ) {
          return this.finish() && undefined;
        }
        if (schema && !compareSchemas(schema, this._schema)) {
          if (this._started && this._autoDestroy) {
            return this.close();
          }
          this.reset(this._sink, schema);
        }
        if (payload instanceof RecordBatch) {
          if (!(payload instanceof _InternalEmptyPlaceholderRecordBatch)) {
            this._writeRecordBatch(payload);
          }
        } else if (payload instanceof Table) {
          this.writeAll(payload.batches);
        } else if (isIterable(payload)) {
          this.writeAll(payload);
        }
      }
      _writeMessage(message, alignment = 8) {
        const a = alignment - 1;
        const buffer = Message.encode(message);
        const flatbufferSize = buffer.byteLength;
        const prefixSize = !this._writeLegacyIpcFormat ? 8 : 4;
        const alignedSize = (flatbufferSize + prefixSize + a) & ~a;
        const nPaddingBytes = alignedSize - flatbufferSize - prefixSize;
        if (message.headerType === MessageHeader.RecordBatch) {
          this._recordBatchBlocks.push(
            new FileBlock(alignedSize, message.bodyLength, this._position),
          );
        } else if (message.headerType === MessageHeader.DictionaryBatch) {
          this._dictionaryBlocks.push(
            new FileBlock(alignedSize, message.bodyLength, this._position),
          );
        }
        // If not in legacy pre-0.15.0 mode, write the stream continuation indicator
        if (!this._writeLegacyIpcFormat) {
          this._write(Int32Array.of(-1));
        }
        // Write the flatbuffer size prefix including padding
        this._write(Int32Array.of(alignedSize - prefixSize));
        // Write the flatbuffer
        if (flatbufferSize > 0) {
          this._write(buffer);
        }
        // Write any padding
        return this._writePadding(nPaddingBytes);
      }
      _write(chunk) {
        if (this._started) {
          const buffer = toUint8Array(chunk);
          if (buffer && buffer.byteLength > 0) {
            this._sink.write(buffer);
            this._position += buffer.byteLength;
          }
        }
        return this;
      }
      _writeSchema(schema) {
        return this._writeMessage(Message.from(schema));
      }
      // @ts-ignore
      _writeFooter(schema) {
        // eos bytes
        return this._writeLegacyIpcFormat
          ? this._write(Int32Array.of(0))
          : this._write(Int32Array.of(-1, 0));
      }
      _writeMagic() {
        return this._write(MAGIC);
      }
      _writePadding(nBytes) {
        return nBytes > 0 ? this._write(new Uint8Array(nBytes)) : this;
      }
      _writeRecordBatch(batch) {
        const { byteLength, nodes, bufferRegions, buffers } =
          VectorAssembler.assemble(batch);
        const recordBatch = new message_RecordBatch(
          batch.numRows,
          nodes,
          bufferRegions,
        );
        const message = Message.from(recordBatch, byteLength);
        return this._writeDictionaries(batch)
          ._writeMessage(message)
          ._writeBodyBuffers(buffers);
      }
      _writeDictionaryBatch(dictionary, id, isDelta = false) {
        this._dictionaryDeltaOffsets.set(
          id,
          dictionary.length + (this._dictionaryDeltaOffsets.get(id) || 0),
        );
        const { byteLength, nodes, bufferRegions, buffers } =
          VectorAssembler.assemble(new Vector([dictionary]));
        const recordBatch = new message_RecordBatch(
          dictionary.length,
          nodes,
          bufferRegions,
        );
        const dictionaryBatch = new message_DictionaryBatch(
          recordBatch,
          id,
          isDelta,
        );
        const message = Message.from(dictionaryBatch, byteLength);
        return this._writeMessage(message)._writeBodyBuffers(buffers);
      }
      _writeBodyBuffers(buffers) {
        let buffer;
        let size, padding;
        for (let i = -1, n = buffers.length; ++i < n; ) {
          if ((buffer = buffers[i]) && (size = buffer.byteLength) > 0) {
            this._write(buffer);
            if ((padding = ((size + 7) & ~7) - size) > 0) {
              this._writePadding(padding);
            }
          }
        }
        return this;
      }
      _writeDictionaries(batch) {
        for (let [id, dictionary] of batch.dictionaries) {
          let offset = this._dictionaryDeltaOffsets.get(id) || 0;
          if (
            offset === 0 ||
            (dictionary =
              dictionary === null || dictionary === void 0
                ? void 0
                : dictionary.slice(offset)).length > 0
          ) {
            for (const data of dictionary.data) {
              this._writeDictionaryBatch(data, id, offset > 0);
              offset += data.length;
            }
          }
        }
        return this;
      }
    }
    /** @ignore */
    class RecordBatchStreamWriter extends RecordBatchWriter {
      /** @nocollapse */
      static writeAll(input, options) {
        const writer = new RecordBatchStreamWriter(options);
        if (isPromise(input)) {
          return input.then((x) => writer.writeAll(x));
        } else if (isAsyncIterable(input)) {
          return writeAllAsync(writer, input);
        }
        return writeAll(writer, input);
      }
    }
    /** @ignore */
    class RecordBatchFileWriter extends RecordBatchWriter {
      /** @nocollapse */
      static writeAll(input) {
        const writer = new RecordBatchFileWriter();
        if (isPromise(input)) {
          return input.then((x) => writer.writeAll(x));
        } else if (isAsyncIterable(input)) {
          return writeAllAsync(writer, input);
        }
        return writeAll(writer, input);
      }
      constructor() {
        super();
        this._autoDestroy = true;
      }
      // @ts-ignore
      _writeSchema(schema) {
        return this._writeMagic()._writePadding(2);
      }
      _writeFooter(schema) {
        const buffer = Footer_.encode(
          new Footer_(
            schema,
            MetadataVersion.V4,
            this._recordBatchBlocks,
            this._dictionaryBlocks,
          ),
        );
        return super
          ._writeFooter(schema) // EOS bytes for sequential readers
          ._write(buffer) // Write the flatbuffer
          ._write(Int32Array.of(buffer.byteLength)) // then the footer size suffix
          ._writeMagic(); // then the magic suffix
      }
    }
    /** @ignore */
    class RecordBatchJSONWriter extends RecordBatchWriter {
      constructor() {
        super();
        this._autoDestroy = true;
        this._recordBatches = [];
        this._dictionaries = [];
      }
      /** @nocollapse */
      static writeAll(input) {
        return new RecordBatchJSONWriter().writeAll(input);
      }
      _writeMessage() {
        return this;
      }
      // @ts-ignore
      _writeFooter(schema) {
        return this;
      }
      _writeSchema(schema) {
        return this._write(
          `{\n  "schema": ${JSON.stringify(
            { fields: schema.fields.map((field) => fieldToJSON(field)) },
            null,
            2,
          )}`,
        );
      }
      _writeDictionaries(batch) {
        if (batch.dictionaries.size > 0) {
          this._dictionaries.push(batch);
        }
        return this;
      }
      _writeDictionaryBatch(dictionary, id, isDelta = false) {
        this._dictionaryDeltaOffsets.set(
          id,
          dictionary.length + (this._dictionaryDeltaOffsets.get(id) || 0),
        );
        this._write(this._dictionaryBlocks.length === 0 ? `    ` : `,\n    `);
        this._write(`${dictionaryBatchToJSON(dictionary, id, isDelta)}`);
        this._dictionaryBlocks.push(new FileBlock(0, 0, 0));
        return this;
      }
      _writeRecordBatch(batch) {
        this._writeDictionaries(batch);
        this._recordBatches.push(batch);
        return this;
      }
      close() {
        if (this._dictionaries.length > 0) {
          this._write(`,\n  "dictionaries": [\n`);
          for (const batch of this._dictionaries) {
            super._writeDictionaries(batch);
          }
          this._write(`\n  ]`);
        }
        if (this._recordBatches.length > 0) {
          for (let i = -1, n = this._recordBatches.length; ++i < n; ) {
            this._write(i === 0 ? `,\n  "batches": [\n    ` : `,\n    `);
            this._write(`${recordBatchToJSON(this._recordBatches[i])}`);
            this._recordBatchBlocks.push(new FileBlock(0, 0, 0));
          }
          this._write(`\n  ]`);
        }
        if (this._schema) {
          this._write(`\n}`);
        }
        this._dictionaries = [];
        this._recordBatches = [];
        return super.close();
      }
    }
    /** @ignore */
    function writeAll(writer, input) {
      let chunks = input;
      if (input instanceof Table) {
        chunks = input.batches;
        writer.reset(undefined, input.schema);
      }
      for (const batch of chunks) {
        writer.write(batch);
      }
      return writer.finish();
    }
    /** @ignore */
    function writeAllAsync(writer, batches) {
      var batches_1, batches_1_1;
      var e_1, _a;
      return __awaiter(this, void 0, void 0, function* () {
        try {
          for (
            batches_1 = __asyncValues(batches);
            (batches_1_1 = yield batches_1.next()), !batches_1_1.done;

          ) {
            const batch = batches_1_1.value;
            writer.write(batch);
          }
        } catch (e_1_1) {
          e_1 = { error: e_1_1 };
        } finally {
          try {
            if (batches_1_1 && !batches_1_1.done && (_a = batches_1.return))
              yield _a.call(batches_1);
          } finally {
            if (e_1) throw e_1.error;
          }
        }
        return writer.finish();
      });
    }
    /** @ignore */
    function fieldToJSON({ name, type, nullable }) {
      const assembler = new JSONTypeAssembler();
      return {
        name: name,
        nullable: nullable,
        type: assembler.visit(type),
        children: (type.children || []).map((field) => fieldToJSON(field)),
        dictionary: !DataType.isDictionary(type)
          ? undefined
          : {
              id: type.id,
              isOrdered: type.isOrdered,
              indexType: assembler.visit(type.indices),
            },
      };
    }
    /** @ignore */
    function dictionaryBatchToJSON(dictionary, id, isDelta = false) {
      const [columns] = JSONVectorAssembler.assemble(
        new RecordBatch({ [id]: dictionary }),
      );
      return JSON.stringify(
        {
          id: id,
          isDelta: isDelta,
          data: {
            count: dictionary.length,
            columns: columns,
          },
        },
        null,
        2,
      );
    }
    /** @ignore */
    function recordBatchToJSON(records) {
      const [columns] = JSONVectorAssembler.assemble(records);
      return JSON.stringify(
        {
          count: records.numRows,
          columns: columns,
        },
        null,
        2,
      );
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/io/whatwg/iterable.mjs

    //# sourceMappingURL=writer.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    function toDOMStream(source, options) {
      if (isAsyncIterable(source)) {
        return asyncIterableAsReadableDOMStream(source, options);
      }
      if (isIterable(source)) {
        return iterableAsReadableDOMStream(source, options);
      }
      /* istanbul ignore next */
      throw new Error(
        `toDOMStream() must be called with an Iterable or AsyncIterable`,
      );
    }
    /** @ignore */
    function iterableAsReadableDOMStream(source, options) {
      let it = null;
      const bm =
        (options === null || options === void 0 ? void 0 : options.type) ===
          "bytes" || false;
      const hwm =
        (options === null || options === void 0
          ? void 0
          : options.highWaterMark) || Math.pow(2, 24);
      return new ReadableStream(
        Object.assign(Object.assign({}, options), {
          start(controller) {
            next(controller, it || (it = source[Symbol.iterator]()));
          },
          pull(controller) {
            it ? next(controller, it) : controller.close();
          },
          cancel() {
            (((it === null || it === void 0 ? void 0 : it.return) &&
              it.return()) ||
              true) &&
              (it = null);
          },
        }),
        Object.assign({ highWaterMark: bm ? hwm : undefined }, options),
      );
      function next(controller, it) {
        let buf;
        let r = null;
        let size = controller.desiredSize || null;
        while (!(r = it.next(bm ? size : null)).done) {
          if (ArrayBuffer.isView(r.value) && (buf = toUint8Array(r.value))) {
            size != null && bm && (size = size - buf.byteLength + 1);
            r.value = buf;
          }
          controller.enqueue(r.value);
          if (size != null && --size <= 0) {
            return;
          }
        }
        controller.close();
      }
    }
    /** @ignore */
    function asyncIterableAsReadableDOMStream(source, options) {
      let it = null;
      const bm =
        (options === null || options === void 0 ? void 0 : options.type) ===
          "bytes" || false;
      const hwm =
        (options === null || options === void 0
          ? void 0
          : options.highWaterMark) || Math.pow(2, 24);
      return new ReadableStream(
        Object.assign(Object.assign({}, options), {
          start(controller) {
            return __awaiter(this, void 0, void 0, function* () {
              yield next(
                controller,
                it || (it = source[Symbol.asyncIterator]()),
              );
            });
          },
          pull(controller) {
            return __awaiter(this, void 0, void 0, function* () {
              it ? yield next(controller, it) : controller.close();
            });
          },
          cancel() {
            return __awaiter(this, void 0, void 0, function* () {
              (((it === null || it === void 0 ? void 0 : it.return) &&
                (yield it.return())) ||
                true) &&
                (it = null);
            });
          },
        }),
        Object.assign({ highWaterMark: bm ? hwm : undefined }, options),
      );
      function next(controller, it) {
        return __awaiter(this, void 0, void 0, function* () {
          let buf;
          let r = null;
          let size = controller.desiredSize || null;
          while (!(r = yield it.next(bm ? size : null)).done) {
            if (ArrayBuffer.isView(r.value) && (buf = toUint8Array(r.value))) {
              size != null && bm && (size = size - buf.byteLength + 1);
              r.value = buf;
            }
            controller.enqueue(r.value);
            if (size != null && --size <= 0) {
              return;
            }
          }
          controller.close();
        });
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/io/whatwg/builder.mjs

    //# sourceMappingURL=iterable.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    function builderThroughDOMStream(options) {
      return new BuilderTransform(options);
    }
    /** @ignore */
    class BuilderTransform {
      constructor(options) {
        // Access properties by string indexers to defeat closure compiler
        this._numChunks = 0;
        this._finished = false;
        this._bufferedSize = 0;
        const {
            ["readableStrategy"]: readableStrategy,
            ["writableStrategy"]: writableStrategy,
            ["queueingStrategy"]: queueingStrategy = "count",
          } = options,
          builderOptions = __rest(options, [
            "readableStrategy",
            "writableStrategy",
            "queueingStrategy",
          ]);
        this._controller = null;
        this._builder = makeBuilder(builderOptions);
        this._getSize =
          queueingStrategy !== "bytes" ? chunkLength : chunkByteLength;
        const {
          ["highWaterMark"]: readableHighWaterMark = queueingStrategy ===
          "bytes"
            ? Math.pow(2, 14)
            : 1000,
        } = Object.assign({}, readableStrategy);
        const {
          ["highWaterMark"]: writableHighWaterMark = queueingStrategy ===
          "bytes"
            ? Math.pow(2, 14)
            : 1000,
        } = Object.assign({}, writableStrategy);
        this["readable"] = new ReadableStream(
          {
            ["cancel"]: () => {
              this._builder.clear();
            },
            ["pull"]: (c) => {
              this._maybeFlush(this._builder, (this._controller = c));
            },
            ["start"]: (c) => {
              this._maybeFlush(this._builder, (this._controller = c));
            },
          },
          {
            highWaterMark: readableHighWaterMark,
            size: queueingStrategy !== "bytes" ? chunkLength : chunkByteLength,
          },
        );
        this["writable"] = new WritableStream(
          {
            ["abort"]: () => {
              this._builder.clear();
            },
            ["write"]: () => {
              this._maybeFlush(this._builder, this._controller);
            },
            ["close"]: () => {
              this._maybeFlush(this._builder.finish(), this._controller);
            },
          },
          {
            highWaterMark: writableHighWaterMark,
            size: (value) => this._writeValueAndReturnChunkSize(value),
          },
        );
      }
      _writeValueAndReturnChunkSize(value) {
        const bufferedSize = this._bufferedSize;
        this._bufferedSize = this._getSize(this._builder.append(value));
        return this._bufferedSize - bufferedSize;
      }
      _maybeFlush(builder, controller) {
        if (controller == null) {
          return;
        }
        if (this._bufferedSize >= controller.desiredSize) {
          ++this._numChunks && this._enqueue(controller, builder.toVector());
        }
        if (builder.finished) {
          if (builder.length > 0 || this._numChunks === 0) {
            ++this._numChunks && this._enqueue(controller, builder.toVector());
          }
          if (!this._finished && (this._finished = true)) {
            this._enqueue(controller, null);
          }
        }
      }
      _enqueue(controller, chunk) {
        this._bufferedSize = 0;
        this._controller = null;
        chunk == null ? controller.close() : controller.enqueue(chunk);
      }
    }
    /** @ignore */ const chunkLength = (chunk) => {
      var _a;
      return (_a =
        chunk === null || chunk === void 0 ? void 0 : chunk.length) !== null &&
        _a !== void 0
        ? _a
        : 0;
    };
    /** @ignore */ const chunkByteLength = (chunk) => {
      var _a;
      return (_a =
        chunk === null || chunk === void 0 ? void 0 : chunk.byteLength) !==
        null && _a !== void 0
        ? _a
        : 0;
    }; // CONCATENATED MODULE: ./node_modules/apache-arrow/io/whatwg/reader.mjs

    //# sourceMappingURL=builder.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    function recordBatchReaderThroughDOMStream(
      writableStrategy,
      readableStrategy,
    ) {
      const queue = new AsyncByteQueue();
      let reader = null;
      const readable = new ReadableStream({
        cancel() {
          return __awaiter(this, void 0, void 0, function* () {
            yield queue.close();
          });
        },
        start(controller) {
          return __awaiter(this, void 0, void 0, function* () {
            yield next(controller, reader || (reader = yield open()));
          });
        },
        pull(controller) {
          return __awaiter(this, void 0, void 0, function* () {
            reader ? yield next(controller, reader) : controller.close();
          });
        },
      });
      return {
        writable: new WritableStream(
          queue,
          Object.assign({ highWaterMark: Math.pow(2, 14) }, writableStrategy),
        ),
        readable,
      };
      function open() {
        return __awaiter(this, void 0, void 0, function* () {
          return yield (yield RecordBatchReader.from(queue)).open(
            readableStrategy,
          );
        });
      }
      function next(controller, reader) {
        return __awaiter(this, void 0, void 0, function* () {
          let size = controller.desiredSize;
          let r = null;
          while (!(r = yield reader.next()).done) {
            controller.enqueue(r.value);
            if (size != null && --size <= 0) {
              return;
            }
          }
          controller.close();
        });
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/io/whatwg/writer.mjs

    //# sourceMappingURL=reader.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    function recordBatchWriterThroughDOMStream(
      writableStrategy,
      readableStrategy,
    ) {
      const writer = new this(writableStrategy);
      const reader = new AsyncByteStream(writer);
      const readable = new ReadableStream(
        {
          // type: 'bytes',
          cancel() {
            return __awaiter(this, void 0, void 0, function* () {
              yield reader.cancel();
            });
          },
          pull(controller) {
            return __awaiter(this, void 0, void 0, function* () {
              yield next(controller);
            });
          },
          start(controller) {
            return __awaiter(this, void 0, void 0, function* () {
              yield next(controller);
            });
          },
        },
        Object.assign({ highWaterMark: Math.pow(2, 14) }, readableStrategy),
      );
      return {
        writable: new WritableStream(writer, writableStrategy),
        readable,
      };
      function next(controller) {
        return __awaiter(this, void 0, void 0, function* () {
          let buf = null;
          let size = controller.desiredSize;
          while ((buf = yield reader.read(size || null))) {
            controller.enqueue(buf);
            if (size != null && (size -= buf.byteLength) <= 0) {
              return;
            }
          }
          controller.close();
        });
      }
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/ipc/serialization.mjs

    //# sourceMappingURL=writer.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    function tableFromIPC(input) {
      const reader = RecordBatchReader.from(input);
      if (isPromise(reader)) {
        return (() =>
          __awaiter(this, void 0, void 0, function* () {
            return new Table(yield (yield reader).readAll());
          }))();
      }
      return new Table(reader.readAll());
    }
    /**
     * Serialize a {@link Table} to the IPC format. This function is a convenience
     * wrapper for {@link RecordBatchStreamWriter} and {@link RecordBatchFileWriter}.
     * Opposite of {@link tableFromIPC}.
     *
     * @param table The Table to serialize.
     * @param type Whether to serialize the Table as a file or a stream.
     */
    function tableToIPC(table, type = "stream") {
      return (
        type === "stream" ? RecordBatchStreamWriter : RecordBatchFileWriter
      )
        .writeAll(table)
        .toUint8Array(true);
    } // CONCATENATED MODULE: ./node_modules/apache-arrow/Arrow.mjs

    //# sourceMappingURL=serialization.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    /** @ignore */
    const util = Object.assign(
      Object.assign(
        Object.assign(
          Object.assign(
            Object.assign(
              Object.assign(
                Object.assign({}, bn_namespaceObject),
                util_int_namespaceObject,
              ),
              bit_namespaceObject,
            ),
            math_namespaceObject,
          ),
          buffer_namespaceObject,
        ),
        vector_namespaceObject,
      ),
      {
        compareSchemas: compareSchemas,
        compareFields: compareFields,
        compareTypes: compareTypes,
      },
    ); // CONCATENATED MODULE: ./node_modules/apache-arrow/Arrow.dom.mjs

    //# sourceMappingURL=Arrow.mjs.map

    // Licensed to the Apache Software Foundation (ASF) under one
    // or more contributor license agreements.  See the NOTICE file
    // distributed with this work for additional information
    // regarding copyright ownership.  The ASF licenses this file
    // to you under the Apache License, Version 2.0 (the
    // "License"); you may not use this file except in compliance
    // with the License.  You may obtain a copy of the License at
    //
    //   http://www.apache.org/licenses/LICENSE-2.0
    //
    // Unless required by applicable law or agreed to in writing,
    // software distributed under the License is distributed on an
    // "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    // KIND, either express or implied.  See the License for the
    // specific language governing permissions and limitations
    // under the License.

    adapters.toDOMStream = toDOMStream;
    Builder.throughDOM = builderThroughDOMStream;
    RecordBatchReader.throughDOM = recordBatchReaderThroughDOMStream;
    RecordBatchFileReader.throughDOM = recordBatchReaderThroughDOMStream;
    RecordBatchStreamReader.throughDOM = recordBatchReaderThroughDOMStream;
    RecordBatchWriter.throughDOM = recordBatchWriterThroughDOMStream;
    RecordBatchFileWriter.throughDOM = recordBatchWriterThroughDOMStream;
    RecordBatchStreamWriter.throughDOM = recordBatchWriterThroughDOMStream;

    //# sourceMappingURL=Arrow.dom.mjs.map // CONCATENATED MODULE: ./src/index.mjs
  })();

  arrow = __webpack_exports__;
  /******/
})();
