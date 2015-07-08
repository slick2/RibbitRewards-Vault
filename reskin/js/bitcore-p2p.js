require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

},{}],2:[function(require,module,exports){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')
var isArray = require('is-array')

exports.Buffer = Buffer
exports.SlowBuffer = SlowBuffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192 // not used by this implementation

var kMaxLength = 0x3fffffff
var rootParent = {}

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * Note:
 *
 * - Implementation must support adding new properties to `Uint8Array` instances.
 *   Firefox 4-29 lacked support, fixed in Firefox 30+.
 *   See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438.
 *
 *  - Chrome 9-10 is missing the `TypedArray.prototype.subarray` function.
 *
 *  - IE10 has a broken `TypedArray.prototype.subarray` function which returns arrays of
 *    incorrect length in some situations.
 *
 * We detect these buggy browsers and set `Buffer.TYPED_ARRAY_SUPPORT` to `false` so they will
 * get the Object implementation, which is slower but will work correctly.
 */
Buffer.TYPED_ARRAY_SUPPORT = (function () {
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return arr.foo() === 42 && // typed array instances can be augmented
        typeof arr.subarray === 'function' && // chrome 9-10 lack `subarray`
        new Uint8Array(1).subarray(1, 1).byteLength === 0 // ie10 has broken `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (arg) {
  if (!(this instanceof Buffer)) {
    // Avoid going through an ArgumentsAdaptorTrampoline in the common case.
    if (arguments.length > 1) return new Buffer(arg, arguments[1])
    return new Buffer(arg)
  }

  this.length = 0
  this.parent = undefined

  // Common case.
  if (typeof arg === 'number') {
    return fromNumber(this, arg)
  }

  // Slightly less common case.
  if (typeof arg === 'string') {
    return fromString(this, arg, arguments.length > 1 ? arguments[1] : 'utf8')
  }

  // Unusual.
  return fromObject(this, arg)
}

function fromNumber (that, length) {
  that = allocate(that, length < 0 ? 0 : checked(length) | 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < length; i++) {
      that[i] = 0
    }
  }
  return that
}

function fromString (that, string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') encoding = 'utf8'

  // Assumption: byteLength() return value is always < kMaxLength.
  var length = byteLength(string, encoding) | 0
  that = allocate(that, length)

  that.write(string, encoding)
  return that
}

function fromObject (that, object) {
  if (Buffer.isBuffer(object)) return fromBuffer(that, object)

  if (isArray(object)) return fromArray(that, object)

  if (object == null) {
    throw new TypeError('must start with number, buffer, array or string')
  }

  if (typeof ArrayBuffer !== 'undefined' && object.buffer instanceof ArrayBuffer) {
    return fromTypedArray(that, object)
  }

  if (object.length) return fromArrayLike(that, object)

  return fromJsonObject(that, object)
}

function fromBuffer (that, buffer) {
  var length = checked(buffer.length) | 0
  that = allocate(that, length)
  buffer.copy(that, 0, 0, length)
  return that
}

function fromArray (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

// Duplicate of fromArray() to keep fromArray() monomorphic.
function fromTypedArray (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  // Truncating the elements is probably not what people expect from typed
  // arrays with BYTES_PER_ELEMENT > 1 but it's compatible with the behavior
  // of the old Buffer constructor.
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

function fromArrayLike (that, array) {
  var length = checked(array.length) | 0
  that = allocate(that, length)
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

// Deserialize { type: 'Buffer', data: [1,2,3,...] } into a Buffer object.
// Returns a zero-length buffer for inputs that don't conform to the spec.
function fromJsonObject (that, object) {
  var array
  var length = 0

  if (object.type === 'Buffer' && isArray(object.data)) {
    array = object.data
    length = checked(array.length) | 0
  }
  that = allocate(that, length)

  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255
  }
  return that
}

function allocate (that, length) {
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    // Return an augmented `Uint8Array` instance, for best performance
    that = Buffer._augment(new Uint8Array(length))
  } else {
    // Fallback: Return an object instance of the Buffer class
    that.length = length
    that._isBuffer = true
  }

  var fromPool = length !== 0 && length <= Buffer.poolSize >>> 1
  if (fromPool) that.parent = rootParent

  return that
}

function checked (length) {
  // Note: cannot use `length < kMaxLength` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= kMaxLength) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' +
                         'size: 0x' + kMaxLength.toString(16) + ' bytes')
  }
  return length | 0
}

function SlowBuffer (subject, encoding) {
  if (!(this instanceof SlowBuffer)) return new SlowBuffer(subject, encoding)

  var buf = new Buffer(subject, encoding)
  delete buf.parent
  return buf
}

Buffer.isBuffer = function isBuffer (b) {
  return !!(b != null && b._isBuffer)
}

Buffer.compare = function compare (a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError('Arguments must be Buffers')
  }

  if (a === b) return 0

  var x = a.length
  var y = b.length

  var i = 0
  var len = Math.min(x, y)
  while (i < len) {
    if (a[i] !== b[i]) break

    ++i
  }

  if (i !== len) {
    x = a[i]
    y = b[i]
  }

  if (x < y) return -1
  if (y < x) return 1
  return 0
}

Buffer.isEncoding = function isEncoding (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.concat = function concat (list, length) {
  if (!isArray(list)) throw new TypeError('list argument must be an Array of Buffers.')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (length === undefined) {
    length = 0
    for (i = 0; i < list.length; i++) {
      length += list[i].length
    }
  }

  var buf = new Buffer(length)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

function byteLength (string, encoding) {
  if (typeof string !== 'string') string = String(string)

  if (string.length === 0) return 0

  switch (encoding || 'utf8') {
    case 'ascii':
    case 'binary':
    case 'raw':
      return string.length
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return string.length * 2
    case 'hex':
      return string.length >>> 1
    case 'utf8':
    case 'utf-8':
      return utf8ToBytes(string).length
    case 'base64':
      return base64ToBytes(string).length
    default:
      return string.length
  }
}
Buffer.byteLength = byteLength

// pre-set for values that may exist in the future
Buffer.prototype.length = undefined
Buffer.prototype.parent = undefined

// toString(encoding, start=0, end=buffer.length)
Buffer.prototype.toString = function toString (encoding, start, end) {
  var loweredCase = false

  start = start | 0
  end = end === undefined || end === Infinity ? this.length : end | 0

  if (!encoding) encoding = 'utf8'
  if (start < 0) start = 0
  if (end > this.length) end = this.length
  if (end <= start) return ''

  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end)

      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end)

      case 'ascii':
        return asciiSlice(this, start, end)

      case 'binary':
        return binarySlice(this, start, end)

      case 'base64':
        return base64Slice(this, start, end)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = (encoding + '').toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.equals = function equals (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return true
  return Buffer.compare(this, b) === 0
}

Buffer.prototype.inspect = function inspect () {
  var str = ''
  var max = exports.INSPECT_MAX_BYTES
  if (this.length > 0) {
    str = this.toString('hex', 0, max).match(/.{2}/g).join(' ')
    if (this.length > max) str += ' ... '
  }
  return '<Buffer ' + str + '>'
}

Buffer.prototype.compare = function compare (b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer')
  if (this === b) return 0
  return Buffer.compare(this, b)
}

Buffer.prototype.indexOf = function indexOf (val, byteOffset) {
  if (byteOffset > 0x7fffffff) byteOffset = 0x7fffffff
  else if (byteOffset < -0x80000000) byteOffset = -0x80000000
  byteOffset >>= 0

  if (this.length === 0) return -1
  if (byteOffset >= this.length) return -1

  // Negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = Math.max(this.length + byteOffset, 0)

  if (typeof val === 'string') {
    if (val.length === 0) return -1 // special case: looking for empty string always fails
    return String.prototype.indexOf.call(this, val, byteOffset)
  }
  if (Buffer.isBuffer(val)) {
    return arrayIndexOf(this, val, byteOffset)
  }
  if (typeof val === 'number') {
    if (Buffer.TYPED_ARRAY_SUPPORT && Uint8Array.prototype.indexOf === 'function') {
      return Uint8Array.prototype.indexOf.call(this, val, byteOffset)
    }
    return arrayIndexOf(this, [ val ], byteOffset)
  }

  function arrayIndexOf (arr, val, byteOffset) {
    var foundIndex = -1
    for (var i = 0; byteOffset + i < arr.length; i++) {
      if (arr[byteOffset + i] === val[foundIndex === -1 ? 0 : i - foundIndex]) {
        if (foundIndex === -1) foundIndex = i
        if (i - foundIndex + 1 === val.length) return byteOffset + foundIndex
      } else {
        foundIndex = -1
      }
    }
    return -1
  }

  throw new TypeError('val must be string, number or Buffer')
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function get (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function set (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

function hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  if (strLen % 2 !== 0) throw new Error('Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var parsed = parseInt(string.substr(i * 2, 2), 16)
    if (isNaN(parsed)) throw new Error('Invalid hex string')
    buf[offset + i] = parsed
  }
  return i
}

function utf8Write (buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length)
}

function asciiWrite (buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length)
}

function binaryWrite (buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length)
}

function base64Write (buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length)
}

function ucs2Write (buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length)
}

Buffer.prototype.write = function write (string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8'
    length = this.length
    offset = 0
  // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset
    length = this.length
    offset = 0
  // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset | 0
    if (isFinite(length)) {
      length = length | 0
      if (encoding === undefined) encoding = 'utf8'
    } else {
      encoding = length
      length = undefined
    }
  // legacy write(string, encoding, offset, length) - remove in v0.13
  } else {
    var swap = encoding
    encoding = offset
    offset = length | 0
    length = swap
  }

  var remaining = this.length - offset
  if (length === undefined || length > remaining) length = remaining

  if ((string.length > 0 && (length < 0 || offset < 0)) || offset > this.length) {
    throw new RangeError('attempt to write outside buffer bounds')
  }

  if (!encoding) encoding = 'utf8'

  var loweredCase = false
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length)

      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length)

      case 'ascii':
        return asciiWrite(this, string, offset, length)

      case 'binary':
        return binaryWrite(this, string, offset, length)

      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length)

      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length)

      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding)
        encoding = ('' + encoding).toLowerCase()
        loweredCase = true
    }
  }
}

Buffer.prototype.toJSON = function toJSON () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

function base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i] & 0x7F)
  }
  return ret
}

function binarySlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    ret += String.fromCharCode(buf[i])
  }
  return ret
}

function hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256)
  }
  return res
}

Buffer.prototype.slice = function slice (start, end) {
  var len = this.length
  start = ~~start
  end = end === undefined ? len : ~~end

  if (start < 0) {
    start += len
    if (start < 0) start = 0
  } else if (start > len) {
    start = len
  }

  if (end < 0) {
    end += len
    if (end < 0) end = 0
  } else if (end > len) {
    end = len
  }

  if (end < start) end = start

  var newBuf
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    newBuf = Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    newBuf = new Buffer(sliceLen, undefined)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
  }

  if (newBuf.length) newBuf.parent = this.parent || this

  return newBuf
}

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset (offset, ext, length) {
  if ((offset % 1) !== 0 || offset < 0) throw new RangeError('offset is not uint')
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length')
}

Buffer.prototype.readUIntLE = function readUIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }

  return val
}

Buffer.prototype.readUIntBE = function readUIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length)
  }

  var val = this[offset + --byteLength]
  var mul = 1
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul
  }

  return val
}

Buffer.prototype.readUInt8 = function readUInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  return this[offset]
}

Buffer.prototype.readUInt16LE = function readUInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return this[offset] | (this[offset + 1] << 8)
}

Buffer.prototype.readUInt16BE = function readUInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  return (this[offset] << 8) | this[offset + 1]
}

Buffer.prototype.readUInt32LE = function readUInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return ((this[offset]) |
      (this[offset + 1] << 8) |
      (this[offset + 2] << 16)) +
      (this[offset + 3] * 0x1000000)
}

Buffer.prototype.readUInt32BE = function readUInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] * 0x1000000) +
    ((this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    this[offset + 3])
}

Buffer.prototype.readIntLE = function readIntLE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var val = this[offset]
  var mul = 1
  var i = 0
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readIntBE = function readIntBE (offset, byteLength, noAssert) {
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkOffset(offset, byteLength, this.length)

  var i = byteLength
  var mul = 1
  var val = this[offset + --i]
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul
  }
  mul *= 0x80

  if (val >= mul) val -= Math.pow(2, 8 * byteLength)

  return val
}

Buffer.prototype.readInt8 = function readInt8 (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 1, this.length)
  if (!(this[offset] & 0x80)) return (this[offset])
  return ((0xff - this[offset] + 1) * -1)
}

Buffer.prototype.readInt16LE = function readInt16LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset] | (this[offset + 1] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt16BE = function readInt16BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 2, this.length)
  var val = this[offset + 1] | (this[offset] << 8)
  return (val & 0x8000) ? val | 0xFFFF0000 : val
}

Buffer.prototype.readInt32LE = function readInt32LE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset]) |
    (this[offset + 1] << 8) |
    (this[offset + 2] << 16) |
    (this[offset + 3] << 24)
}

Buffer.prototype.readInt32BE = function readInt32BE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)

  return (this[offset] << 24) |
    (this[offset + 1] << 16) |
    (this[offset + 2] << 8) |
    (this[offset + 3])
}

Buffer.prototype.readFloatLE = function readFloatLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, true, 23, 4)
}

Buffer.prototype.readFloatBE = function readFloatBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 4, this.length)
  return ieee754.read(this, offset, false, 23, 4)
}

Buffer.prototype.readDoubleLE = function readDoubleLE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, true, 52, 8)
}

Buffer.prototype.readDoubleBE = function readDoubleBE (offset, noAssert) {
  if (!noAssert) checkOffset(offset, 8, this.length)
  return ieee754.read(this, offset, false, 52, 8)
}

function checkInt (buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('buffer must be a Buffer instance')
  if (value > max || value < min) throw new RangeError('value is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('index out of range')
}

Buffer.prototype.writeUIntLE = function writeUIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var mul = 1
  var i = 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUIntBE = function writeUIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  byteLength = byteLength | 0
  if (!noAssert) checkInt(this, value, offset, byteLength, Math.pow(2, 8 * byteLength), 0)

  var i = byteLength - 1
  var mul = 1
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = (value / mul) & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeUInt8 = function writeUInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  this[offset] = value
  return offset + 1
}

function objectWriteUInt16 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; i++) {
    buf[offset + i] = (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
      (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function writeUInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeUInt16BE = function writeUInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = value
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

function objectWriteUInt32 (buf, value, offset, littleEndian) {
  if (value < 0) value = 0xffffffff + value + 1
  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; i++) {
    buf[offset + i] = (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function writeUInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset + 3] = (value >>> 24)
    this[offset + 2] = (value >>> 16)
    this[offset + 1] = (value >>> 8)
    this[offset] = value
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeUInt32BE = function writeUInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = value
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

Buffer.prototype.writeIntLE = function writeIntLE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = 0
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset] = value & 0xFF
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeIntBE = function writeIntBE (value, offset, byteLength, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1)

    checkInt(this, value, offset, byteLength, limit - 1, -limit)
  }

  var i = byteLength - 1
  var mul = 1
  var sub = value < 0 ? 1 : 0
  this[offset + i] = value & 0xFF
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = ((value / mul) >> 0) - sub & 0xFF
  }

  return offset + byteLength
}

Buffer.prototype.writeInt8 = function writeInt8 (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80)
  if (!Buffer.TYPED_ARRAY_SUPPORT) value = Math.floor(value)
  if (value < 0) value = 0xff + value + 1
  this[offset] = value
  return offset + 1
}

Buffer.prototype.writeInt16LE = function writeInt16LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
  } else {
    objectWriteUInt16(this, value, offset, true)
  }
  return offset + 2
}

Buffer.prototype.writeInt16BE = function writeInt16BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 8)
    this[offset + 1] = value
  } else {
    objectWriteUInt16(this, value, offset, false)
  }
  return offset + 2
}

Buffer.prototype.writeInt32LE = function writeInt32LE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = value
    this[offset + 1] = (value >>> 8)
    this[offset + 2] = (value >>> 16)
    this[offset + 3] = (value >>> 24)
  } else {
    objectWriteUInt32(this, value, offset, true)
  }
  return offset + 4
}

Buffer.prototype.writeInt32BE = function writeInt32BE (value, offset, noAssert) {
  value = +value
  offset = offset | 0
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000)
  if (value < 0) value = 0xffffffff + value + 1
  if (Buffer.TYPED_ARRAY_SUPPORT) {
    this[offset] = (value >>> 24)
    this[offset + 1] = (value >>> 16)
    this[offset + 2] = (value >>> 8)
    this[offset + 3] = value
  } else {
    objectWriteUInt32(this, value, offset, false)
  }
  return offset + 4
}

function checkIEEE754 (buf, value, offset, ext, max, min) {
  if (value > max || value < min) throw new RangeError('value is out of bounds')
  if (offset + ext > buf.length) throw new RangeError('index out of range')
  if (offset < 0) throw new RangeError('index out of range')
}

function writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4)
  return offset + 4
}

Buffer.prototype.writeFloatLE = function writeFloatLE (value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function writeFloatBE (value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert)
}

function writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8)
  return offset + 8
}

Buffer.prototype.writeDoubleLE = function writeDoubleLE (value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function writeDoubleBE (value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert)
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy (target, targetStart, start, end) {
  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (targetStart >= target.length) targetStart = target.length
  if (!targetStart) targetStart = 0
  if (end > 0 && end < start) end = start

  // Copy 0 bytes; we're done
  if (end === start) return 0
  if (target.length === 0 || this.length === 0) return 0

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds')
  }
  if (start < 0 || start >= this.length) throw new RangeError('sourceStart out of bounds')
  if (end < 0) throw new RangeError('sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length) end = this.length
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start
  }

  var len = end - start

  if (len < 1000 || !Buffer.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < len; i++) {
      target[i + targetStart] = this[i + start]
    }
  } else {
    target._set(this.subarray(start, start + len), targetStart)
  }

  return len
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function fill (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (end < start) throw new RangeError('end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  if (start < 0 || start >= this.length) throw new RangeError('start out of bounds')
  if (end < 0 || end > this.length) throw new RangeError('end out of bounds')

  var i
  if (typeof value === 'number') {
    for (i = start; i < end; i++) {
      this[i] = value
    }
  } else {
    var bytes = utf8ToBytes(value.toString())
    var len = bytes.length
    for (i = start; i < end; i++) {
      this[i] = bytes[i % len]
    }
  }

  return this
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function toArrayBuffer () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer.TYPED_ARRAY_SUPPORT) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1) {
        buf[i] = this[i]
      }
      return buf.buffer
    }
  } else {
    throw new TypeError('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function _augment (arr) {
  arr.constructor = Buffer
  arr._isBuffer = true

  // save reference to original Uint8Array set method before overwriting
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.equals = BP.equals
  arr.compare = BP.compare
  arr.indexOf = BP.indexOf
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUIntLE = BP.readUIntLE
  arr.readUIntBE = BP.readUIntBE
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readIntLE = BP.readIntLE
  arr.readIntBE = BP.readIntBE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUIntLE = BP.writeUIntLE
  arr.writeUIntBE = BP.writeUIntBE
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeIntLE = BP.writeIntLE
  arr.writeIntBE = BP.writeIntBE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

var INVALID_BASE64_RE = /[^+\/0-9A-z\-]/g

function base64clean (str) {
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = stringtrim(str).replace(INVALID_BASE64_RE, '')
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return ''
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '='
  }
  return str
}

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (string, units) {
  units = units || Infinity
  var codePoint
  var length = string.length
  var leadSurrogate = null
  var bytes = []
  var i = 0

  for (; i < length; i++) {
    codePoint = string.charCodeAt(i)

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (leadSurrogate) {
        // 2 leads in a row
        if (codePoint < 0xDC00) {
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          leadSurrogate = codePoint
          continue
        } else {
          // valid surrogate pair
          codePoint = leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00 | 0x10000
          leadSurrogate = null
        }
      } else {
        // no lead yet

        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
          continue
        } else {
          // valid lead
          leadSurrogate = codePoint
          continue
        }
      }
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD)
      leadSurrogate = null
    }

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break
      bytes.push(codePoint)
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break
      bytes.push(
        codePoint >> 0x6 | 0xC0,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break
      bytes.push(
        codePoint >> 0xC | 0xE0,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else if (codePoint < 0x200000) {
      if ((units -= 4) < 0) break
      bytes.push(
        codePoint >> 0x12 | 0xF0,
        codePoint >> 0xC & 0x3F | 0x80,
        codePoint >> 0x6 & 0x3F | 0x80,
        codePoint & 0x3F | 0x80
      )
    } else {
      throw new Error('Invalid code point')
    }
  }

  return bytes
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str, units) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    if ((units -= 2) < 0) break

    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(base64clean(str))
}

function blitBuffer (src, dst, offset, length) {
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length)) break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

},{"base64-js":3,"ieee754":4,"is-array":5}],3:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)
	var PLUS_URL_SAFE = '-'.charCodeAt(0)
	var SLASH_URL_SAFE = '_'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS ||
		    code === PLUS_URL_SAFE)
			return 62 // '+'
		if (code === SLASH ||
		    code === SLASH_URL_SAFE)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

},{}],4:[function(require,module,exports){
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var nBits = -7
  var i = isLE ? (nBytes - 1) : 0
  var d = isLE ? -1 : 1
  var s = buffer[offset + i]

  i += d

  e = s & ((1 << (-nBits)) - 1)
  s >>= (-nBits)
  nBits += eLen
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  m = e & ((1 << (-nBits)) - 1)
  e >>= (-nBits)
  nBits += mLen
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}

  if (e === 0) {
    e = 1 - eBias
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity)
  } else {
    m = m + Math.pow(2, mLen)
    e = e - eBias
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen)
}

exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c
  var eLen = nBytes * 8 - mLen - 1
  var eMax = (1 << eLen) - 1
  var eBias = eMax >> 1
  var rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0)
  var i = isLE ? 0 : (nBytes - 1)
  var d = isLE ? 1 : -1
  var s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0

  value = Math.abs(value)

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0
    e = eMax
  } else {
    e = Math.floor(Math.log(value) / Math.LN2)
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--
      c *= 2
    }
    if (e + eBias >= 1) {
      value += rt / c
    } else {
      value += rt * Math.pow(2, 1 - eBias)
    }
    if (value * c >= 2) {
      e++
      c /= 2
    }

    if (e + eBias >= eMax) {
      m = 0
      e = eMax
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen)
      e = e + eBias
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen)
      e = 0
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}

  e = (e << mLen) | m
  eLen += mLen
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}

  buffer[offset + i - d] |= s * 128
}

},{}],5:[function(require,module,exports){

/**
 * isArray
 */

var isArray = Array.isArray;

/**
 * toString
 */

var str = Object.prototype.toString;

/**
 * Whether or not the given `val`
 * is an array.
 *
 * example:
 *
 *        isArray([]);
 *        // > true
 *        isArray(arguments);
 *        // > false
 *        isArray('');
 *        // > false
 *
 * @param {mixed} val
 * @return {bool}
 */

module.exports = isArray || function (val) {
  return !! val && '[object Array]' == str.call(val);
};

},{}],6:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      }
      throw TypeError('Uncaught, unspecified "error" event.');
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],7:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],8:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = setTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            currentQueue[queueIndex].run();
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    clearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        setTimeout(drainQueue, 0);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],9:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],10:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":9,"_process":8,"inherits":7}],11:[function(require,module,exports){
'use strict';

var bitcore = require('bitcore');
var BloomFilter = require('bloom-filter');
var BufferReader = bitcore.encoding.BufferReader;
var BufferWriter = bitcore.encoding.BufferWriter;

/**
 * A constructor for Bloom Filters
 * @see https://github.com/bitpay/bloom-filter
 * @param {Buffer} - payload
 */
BloomFilter.fromBuffer = function fromBuffer(payload) {
  var obj = {};
  var parser = new BufferReader(payload);
  var length = parser.readUInt8();
  obj.vData = [];
  for(var i = 0; i < length; i++) {
    obj.vData.push(parser.readUInt8());
  }
  obj.nHashFuncs = parser.readUInt32LE();
  obj.nTweak = parser.readUInt32LE();
  obj.nFlags = parser.readUInt8();
  return new BloomFilter(obj);
};

/**
 * @returns {Buffer}
 */
BloomFilter.prototype.toBuffer = function toBuffer() {
  var bw = new BufferWriter();
  bw.writeVarintNum(this.vData.length);
  for(var i = 0; i < this.vData.length; i++) {
    bw.writeUInt8(this.vData[i]);
  }
  bw.writeUInt32LE(this.nHashFuncs);
  bw.writeUInt32LE(this.nTweak);
  bw.writeUInt8(this.nFlags);
  return bw.concat();
};

module.exports = BloomFilter;

},{"bitcore":"bitcore","bloom-filter":43}],12:[function(require,module,exports){
(function (Buffer){
'use strict';

var Buffers = require('buffers');

Buffers.prototype.skip = function(i) {
  if (i === 0) {
    return;
  }

  if (i >= this.length) {
    this.buffers = [];
    this.length = 0;
    return;
  }

  var pos = this.pos(i);
  this.buffers = this.buffers.slice(pos.buf);
  this.buffers[0] = new Buffer(this.buffers[0].slice(pos.offset));
  this.length -= i;
};

module.exports = Buffers;


}).call(this,require("buffer").Buffer)
},{"buffer":2,"buffers":45}],13:[function(require,module,exports){
/**
 * @namespace P2P
 */

module.exports = {
  Inventory: require('./inventory'),
  BloomFilter: require('./bloomfilter'),
  Messages: require('./messages'),
  Peer: require('./peer'),
  Pool: require('./pool')
};

},{"./bloomfilter":11,"./inventory":14,"./messages":37,"./peer":40,"./pool":41}],14:[function(require,module,exports){
(function (Buffer){
'use strict';

var bitcore = require('bitcore');
var $ = bitcore.util.preconditions;
var BufferUtil = bitcore.util.buffer;
var BufferReader = bitcore.encoding.BufferReader;
var BufferWriter = bitcore.encoding.BufferWriter;
var _ = bitcore.deps._;

/**
 * A constructor for inventory related Bitcoin messages such as
 * "getdata", "inv" and "notfound".
 * @param {Object} obj
 * @param {Number} obj.type - Inventory.TYPE
 * @param {Buffer} obj.hash - The hash for the inventory
 * @constructor
 */
function Inventory(obj) {
  this.type = obj.type;
  if (!BufferUtil.isBuffer(obj.hash)) {
    throw new TypeError('Unexpected hash, expected to be a buffer');
  }
  this.hash = obj.hash;
}

/**
 * A convenience constructor for Inventory.
 * @param {Number} type - Inventory.TYPE
 * @param {Buffer|String} hash - The hash for the inventory
 * @returns {Inventory} - A new instance of Inventory
 */
Inventory.forItem = function(type, hash) {
  $.checkArgument(hash);
  if (_.isString(hash)) {
    hash = new Buffer(hash, 'hex');
    hash = BufferUtil.reverse(hash);
  }
  return new Inventory({type: type, hash: hash});
};

/**
 * A convenience constructor for Inventory for block inventory types.
 * @param {Buffer|String} hash - The hash for the block inventory
 * @returns {Inventory} - A new instance of Inventory
 */
Inventory.forBlock = function(hash) {
  return Inventory.forItem(Inventory.TYPE.BLOCK, hash);
};

/**
 * A convenience constructor for Inventory for filtered/merkle block inventory types.
 * @param {Buffer|String} hash - The hash for the filtered block inventory
 * @returns {Inventory} - A new instance of Inventory
 */
Inventory.forFilteredBlock = function(hash) {
  return Inventory.forItem(Inventory.TYPE.FILTERED_BLOCK, hash);
};

/**
 * A convenience constructor for Inventory for transaction inventory types.
 * @param {Buffer|String} hash - The hash for the transaction inventory
 * @returns {Inventory} - A new instance of Inventory
 */
Inventory.forTransaction = function(hash) {
  return Inventory.forItem(Inventory.TYPE.TX, hash);
};

/**
 * @returns {Buffer} - Serialized inventory
 */
Inventory.prototype.toBuffer = function() {
  var bw = new BufferWriter();
  bw.writeUInt32LE(this.type);
  bw.write(this.hash);
  return bw.concat();
};

/**
 * @param {BufferWriter} bw - An instance of BufferWriter
 */
Inventory.prototype.toBufferWriter = function(bw) {
  bw.writeUInt32LE(this.type);
  bw.write(this.hash);
  return bw;
};

/**
 * @param {Buffer} payload - Serialized buffer of the inventory
 */
Inventory.fromBuffer = function(payload) {
  var parser = new BufferReader(payload);
  var obj = {};
  obj.type = parser.readUInt32LE();
  obj.hash = parser.read(32);
  return new Inventory(obj);
};

/**
 * @param {BufferWriter} br - An instance of BufferWriter
 */
Inventory.fromBufferReader = function(br) {
  var obj = {};
  obj.type = br.readUInt32LE();
  obj.hash = br.read(32);
  return new Inventory(obj);
};

// https://en.bitcoin.it/wiki/Protocol_specification#Inventory_Vectors
Inventory.TYPE = {};
Inventory.TYPE.ERROR = 0;
Inventory.TYPE.TX = 1;
Inventory.TYPE.BLOCK = 2;
Inventory.TYPE.FILTERED_BLOCK = 3;
Inventory.TYPE_NAME = [
  'ERROR',
  'TX',
  'BLOCK',
  'FILTERED_BLOCK'
];

module.exports = Inventory;

}).call(this,require("buffer").Buffer)
},{"bitcore":"bitcore","buffer":2}],15:[function(require,module,exports){
'use strict';

var bitcore = require('bitcore');
var Inventory = require('../inventory');

function builder(options) {
  /* jshint maxstatements: 20 */
  /* jshint maxcomplexity: 10 */

  if (!options) {
    options = {};
  }

  if (!options.network) {
    options.network = bitcore.Networks.defaultNetwork;
  }

  options.Block = options.Block || bitcore.Block;
  options.BlockHeader = options.BlockHeader || bitcore.BlockHeader;
  options.Transaction = options.Transaction || bitcore.Transaction;
  options.MerkleBlock = options.MerkleBlock || bitcore.MerkleBlock;
  options.protocolVersion = options.protocolVersion || 70000;

  var exported = {
    constructors: {
      Block: options.Block,
      BlockHeader: options.BlockHeader,
      Transaction: options.Transaction,
      MerkleBlock: options.MerkleBlock
    },
    defaults: {
      protocolVersion: options.protocolVersion,
      network: options.network
    },
    inventoryCommands: [
      'getdata',
      'inv',
      'notfound'
    ],
    commandsMap: {
      version: require('./commands/version'),
      verack: require('./commands/verack'),
      ping: require('./commands/ping'),
      pong: require('./commands/pong'),
      block: require('./commands/block'),
      tx: require('./commands/tx'),
      getdata: require('./commands/getdata'),
      headers: require('./commands/headers'),
      notfound: require('./commands/notfound'),
      inv: require('./commands/inv'),
      addr: require('./commands/addr'),
      alert: require('./commands/alert'),
      reject: require('./commands/reject'),
      merkleblock: require('./commands/merkleblock'),
      filterload: require('./commands/filterload'),
      filteradd: require('./commands/filteradd'),
      filterclear: require('./commands/filterclear'),
      getblocks: require('./commands/getblocks'),
      getheaders: require('./commands/getheaders'),
      mempool: require('./commands/mempool'),
      getaddr: require('./commands/getaddr')
    },
    commands: {}
  };

  Object.keys(exported.commandsMap).forEach(function(key) {
    var Command = exported.commandsMap[key];
    exported.commands[key] = function(obj) {
      return new Command(obj, options);
    };

    exported.commands[key]._constructor = Command;

    exported.commands[key].fromBuffer = function(buffer) {
      var message = exported.commands[key]();
      message.setPayload(buffer);
      return message;
    };

  });

  exported.inventoryCommands.forEach(function(command) {

    // add forTransaction methods
    exported.commands[command].forTransaction = function forTransaction(hash) {
      return new exported.commands[command]([Inventory.forTransaction(hash)]);
    };

    // add forBlock methods
    exported.commands[command].forBlock = function forBlock(hash) {
      return new exported.commands[command]([Inventory.forBlock(hash)]);
    };

    // add forFilteredBlock methods
    exported.commands[command].forFilteredBlock = function forFilteredBlock(hash) {
      return new exported.commands[command]([Inventory.forFilteredBlock(hash)]);
    };

  });

  return exported;

}

module.exports = builder;

},{"../inventory":14,"./commands/addr":16,"./commands/alert":17,"./commands/block":18,"./commands/filteradd":19,"./commands/filterclear":20,"./commands/filterload":21,"./commands/getaddr":22,"./commands/getblocks":23,"./commands/getdata":24,"./commands/getheaders":25,"./commands/headers":26,"./commands/inv":27,"./commands/mempool":28,"./commands/merkleblock":29,"./commands/notfound":30,"./commands/ping":31,"./commands/pong":32,"./commands/reject":33,"./commands/tx":34,"./commands/verack":35,"./commands/version":36,"bitcore":"bitcore"}],16:[function(require,module,exports){
'use strict';

var Message = require('../message');
var inherits = require('util').inherits;
var bitcore = require('bitcore');
var utils = require('../utils');
var $ = bitcore.util.preconditions;
var _ = bitcore.deps._;
var BufferReader = bitcore.encoding.BufferReader;
var BufferWriter = bitcore.encoding.BufferWriter;

/**
 * @param {Array=} arg - An array of addrs
 * @param {Object=} options
 * @extends Message
 * @constructor
 */
function AddrMessage(arg, options) {
  Message.call(this, options);
  this.command = 'addr';
  $.checkArgument(
    _.isUndefined(arg) ||
      (Array.isArray(arg) &&
       !_.isUndefined(arg[0].services) &&
       !_.isUndefined(arg[0].ip) &&
       !_.isUndefined(arg[0].port)),
    'First argument is expected to be an array of addrs'
  );
  this.addresses = arg;
}
inherits(AddrMessage, Message);

AddrMessage._name = 'Addresses';

AddrMessage.prototype.setPayload = function(payload) {
  var parser = new BufferReader(payload);

  var addrCount = parser.readVarintNum();

  this.addresses = [];
  for (var i = 0; i < addrCount; i++) {
    // todo: time only available on versions >=31402
    var time = new Date(parser.readUInt32LE() * 1000);

    var addr = utils.parseAddr(parser);
    addr.time = time;
    this.addresses.push(addr);
  }

  utils.checkFinished(parser);
};

AddrMessage.prototype.getPayload = function() {
  var bw = new BufferWriter();
  bw.writeVarintNum(this.addresses.length);

  for (var i = 0; i < this.addresses.length; i++) {
    var addr = this.addresses[i];
    bw.writeUInt32LE(addr.time.getTime() / 1000);
    utils.writeAddr(addr, bw);
  }

  return bw.concat();
};

module.exports = AddrMessage;

},{"../message":38,"../utils":39,"bitcore":"bitcore","util":10}],17:[function(require,module,exports){
(function (Buffer){
'use strict';

var Message = require('../message');
var inherits = require('util').inherits;
var bitcore = require('bitcore');
var utils = require('../utils');
var BufferReader = bitcore.encoding.BufferReader;
var BufferWriter = bitcore.encoding.BufferWriter;

/**
 * @param {Object=} arg
 * @param {Buffer=} arg.payload
 * @param {Buffer=} arg.signature
 * @param {Object} options
 * @extends Message
 * @constructor
 */
function AlertMessage(arg, options) {
  Message.call(this, options);
  this.command = 'alert';
  if (!arg) {
    arg = {};
  }
  this.payload = arg.payload || new Buffer(32);
  this.signature = arg.signature || new Buffer(32);
}
inherits(AlertMessage, Message);

AlertMessage._name = 'Alert';

AlertMessage.prototype.setPayload = function(payload) {
  var parser = new BufferReader(payload);
  this.payload = parser.readVarLengthBuffer();
  this.signature = parser.readVarLengthBuffer();
  utils.checkFinished(parser);
};

AlertMessage.prototype.getPayload = function() {
  var bw = new BufferWriter();
  bw.writeVarintNum(this.payload.length);
  bw.write(this.payload);

  bw.writeVarintNum(this.signature.length);
  bw.write(this.signature);

  return bw.concat();
};

module.exports = AlertMessage;

}).call(this,require("buffer").Buffer)
},{"../message":38,"../utils":39,"bitcore":"bitcore","buffer":2,"util":10}],18:[function(require,module,exports){
'use strict';

var Message = require('../message');
var inherits = require('util').inherits;
var bitcore = require('bitcore');
var $ = bitcore.util.preconditions;
var _ = bitcore.deps._;

/**
 * @param {Block=} arg - An instance of a Block
 * @param {Object} options
 * @param {Function} options.Block - A block constructor
 * @extends Message
 * @constructor
 */
function BlockMessage(arg, options) {
  Message.call(this, options);
  this.Block = options.Block;
  this.command = 'block';
  $.checkArgument(
    _.isUndefined(arg) || arg instanceof this.Block,
    'An instance of Block or undefined is expected'
  );
  this.block = arg;
}
inherits(BlockMessage, Message);

BlockMessage._name = 'Block';

BlockMessage.prototype.setPayload = function(payload) {
  this.block = this.Block.fromBuffer(payload);
};

BlockMessage.prototype.getPayload = function() {
  return this.block.toBuffer();
};

module.exports = BlockMessage;

},{"../message":38,"bitcore":"bitcore","util":10}],19:[function(require,module,exports){
'use strict';

var Message = require('../message');
var inherits = require('util').inherits;
var bitcore = require('bitcore');
var utils = require('../utils');
var BufferUtil = bitcore.util.buffer;
var BufferWriter = bitcore.encoding.BufferWriter;
var BufferReader = bitcore.encoding.BufferReader;
var $ = bitcore.util.preconditions;
var _ = bitcore.deps._;

/**
 * Request peer to add data to a bloom filter already set by 'filterload'
 * @param {Buffer=} data - Array of bytes representing bloom filter data
 * @param {Object=} options
 * @extends Message
 * @constructor
 */
function FilteraddMessage(arg, options) {
  Message.call(this, options);
  this.command = 'filteradd';
  $.checkArgument(
    _.isUndefined(arg) || BufferUtil.isBuffer(arg),
    'First argument is expected to be a Buffer or undefined'
  );
  this.data = arg || BufferUtil.EMPTY_BUFFER;
}
inherits(FilteraddMessage, Message);

FilteraddMessage._name = 'FilterAdd';

FilteraddMessage.prototype.setPayload = function(payload) {
  $.checkArgument(payload);
  var parser = new BufferReader(payload);
  this.data = parser.readVarLengthBuffer();
  utils.checkFinished(parser);
};

FilteraddMessage.prototype.getPayload = function() {
  var bw = new BufferWriter();
  bw.writeVarintNum(this.data.length);
  bw.write(this.data);
  return bw.concat();
};

module.exports = FilteraddMessage;

},{"../message":38,"../utils":39,"bitcore":"bitcore","util":10}],20:[function(require,module,exports){
'use strict';

var Message = require('../message');
var inherits = require('util').inherits;
var bitcore = require('bitcore');
var BufferUtil = bitcore.util.buffer;

/**
 * Request peer to clear data for a bloom filter
 * @extends Message
 * @constructor
 */
function FilterclearMessage(arg, options) {
  Message.call(this, options);
  this.command = 'filterclear';
}
inherits(FilterclearMessage, Message);

FilterclearMessage._name = 'FilterClear';

FilterclearMessage.prototype.setPayload = function() {};

FilterclearMessage.prototype.getPayload = function() {
  return BufferUtil.EMPTY_BUFFER;
};

module.exports = FilterclearMessage;

},{"../message":38,"bitcore":"bitcore","util":10}],21:[function(require,module,exports){
'use strict';

var Message = require('../message');
var inherits = require('util').inherits;
var bitcore = require('bitcore');
var BufferUtil = bitcore.util.buffer;
var BloomFilter = require('../../bloomfilter');
var $ = bitcore.util.preconditions;
var _ = bitcore.deps._;

/**
 * Request peer to send inv messages based on a bloom filter
 * @param {BloomFilter=} arg - An instance of BloomFilter
 * @param {Object} options
 * @extends Message
 * @constructor
 */
function FilterloadMessage(arg, options) {
  Message.call(this, options);
  this.command = 'filterload';
  $.checkArgument(
    _.isUndefined(arg) || arg instanceof BloomFilter,
    'An instance of BloomFilter or undefined is expected'
  );
  this.filter = arg;
}
inherits(FilterloadMessage, Message);

FilterloadMessage._name = 'FilterLoad';

FilterloadMessage.prototype.setPayload = function(payload) {
  this.filter = BloomFilter.fromBuffer(payload);
};

FilterloadMessage.prototype.getPayload = function() {
  if(this.filter) {
    return this.filter.toBuffer();
  } else {
    return BufferUtil.EMPTY_BUFFER;
  }
};

module.exports = FilterloadMessage;

},{"../../bloomfilter":11,"../message":38,"bitcore":"bitcore","util":10}],22:[function(require,module,exports){
'use strict';

var Message = require('../message');
var inherits = require('util').inherits;
var bitcore = require('bitcore');
var BufferUtil = bitcore.util.buffer;

/**
 * Request information about active peers
 * @extends Message
 * @param {Object} options
 * @constructor
 */
function GetaddrMessage(arg, options) {
  Message.call(this, options);
  this.command = 'getaddr';
}
inherits(GetaddrMessage, Message);

GetaddrMessage._name = 'GetAddr';

GetaddrMessage.prototype.setPayload = function() {};

GetaddrMessage.prototype.getPayload = function() {
  return BufferUtil.EMPTY_BUFFER;
};

module.exports = GetaddrMessage;

},{"../message":38,"bitcore":"bitcore","util":10}],23:[function(require,module,exports){
'use strict';

var Message = require('../message');
var inherits = require('util').inherits;
var bitcore = require('bitcore');
var utils = require('../utils');
var BufferReader = bitcore.encoding.BufferReader;
var BufferWriter = bitcore.encoding.BufferWriter;
var $ = bitcore.util.preconditions;

/**
 * Query another peer about blocks. It can query for multiple block hashes,
 * and the response will contain all the chains of blocks starting from those
 * hashes.
 * @param {Object=} arg
 * @param {Array=} arg.starts - Array of buffers or strings with the starting block hashes
 * @param {Buffer=} arg.stop - Hash of the last block
 * @param {Object} options
 * @extends Message
 * @constructor
 */
function GetblocksMessage(arg, options) {
  Message.call(this, options);
  this.command = 'getblocks';
  this.version = options.protocolVersion;
  if (!arg) {
    arg = {};
  }
  arg = utils.sanitizeStartStop(arg);
  this.starts = arg.starts;
  this.stop = arg.stop;
}
inherits(GetblocksMessage, Message);

GetblocksMessage._name = 'GetBlocks';

GetblocksMessage.prototype.setPayload = function(payload) {
  var parser = new BufferReader(payload);
  $.checkArgument(!parser.finished(), 'No data received in payload');

  this.version = parser.readUInt32LE();
  var startCount = parser.readVarintNum();

  this.starts = [];
  for (var i = 0; i < startCount; i++) {
    this.starts.push(parser.read(32));
  }
  this.stop = parser.read(32);
  utils.checkFinished(parser);
};

GetblocksMessage.prototype.getPayload = function() {
  var bw = new BufferWriter();
  bw.writeUInt32LE(this.version);
  bw.writeVarintNum(this.starts.length);
  for (var i = 0; i < this.starts.length; i++) {
    bw.write(this.starts[i]);
  }
  if (this.stop.length !== 32) {
    throw new Error('Invalid hash length: ' + this.stop.length);
  }
  bw.write(this.stop);
  return bw.concat();
};

module.exports = GetblocksMessage;

},{"../message":38,"../utils":39,"bitcore":"bitcore","util":10}],24:[function(require,module,exports){
'use strict';

var Message = require('../message');
var inherits = require('util').inherits;
var bitcore = require('bitcore');
var utils = require('../utils');
var BufferReader = bitcore.encoding.BufferReader;
var BufferWriter = bitcore.encoding.BufferWriter;
var _ = bitcore.deps._;

/**
 * @param {Object|Array=} - options - If options is an array will use as "inventory"
 * @param {Array=} options.inventory - An array of inventory items
 * @extends Message
 * @constructor
 */
function GetdataMessage(arg, options) {
  Message.call(this, options);
  this.command = 'getdata';
  utils.checkInventory(arg);
  this.inventory = arg;
}
inherits(GetdataMessage, Message);

GetdataMessage._name = 'GetData';

GetdataMessage.prototype.setPayload = function(payload) {
  this.inventory = [];

  var parser = new BufferReader(payload);
  var count = parser.readVarintNum();
  for (var i = 0; i < count; i++) {
    var type = parser.readUInt32LE();
    var hash = parser.read(32);
    this.inventory.push({type: type, hash: hash});
  }

  utils.checkFinished(parser);
};

GetdataMessage.prototype.getPayload = function() {
  var bw = new BufferWriter();
  utils.writeInventory(this.inventory, bw);
  return bw.concat();
};

module.exports = GetdataMessage;

},{"../message":38,"../utils":39,"bitcore":"bitcore","util":10}],25:[function(require,module,exports){
'use strict';

var Message = require('../message');
var inherits = require('util').inherits;
var bitcore = require('bitcore');
var utils = require('../utils');
var BufferReader = bitcore.encoding.BufferReader;
var BufferWriter = bitcore.encoding.BufferWriter;
var $ = bitcore.util.preconditions;

/**
 * Query another peer about block headers. It can query for multiple block hashes,
 * and the response will contain all the chains of blocks starting from those
 * hashes.
 * @param {Object=} options
 * @param {Array=} options.starts - Array of buffers or strings with the starting block hashes
 * @param {Buffer=} options.stop - Hash of the last block
 * @extends Message
 * @constructor
 */
function GetheadersMessage(arg, options) {
  Message.call(this, options);
  this.command = 'getheaders';
  this.version = options.protocolVersion;
  if (!arg) {
    arg = {};
  }
  arg = utils.sanitizeStartStop(arg);
  this.starts = arg.starts;
  this.stop = arg.stop;
}
inherits(GetheadersMessage, Message);

GetheadersMessage._name = 'GetHeaders';

GetheadersMessage.prototype.setPayload = function(payload) {
  var parser = new BufferReader(payload);
  $.checkArgument(!parser.finished(), 'No data received in payload');

  this.version = parser.readUInt32LE();
  var startCount = Math.min(parser.readVarintNum(), 500);

  this.starts = [];
  for (var i = 0; i < startCount; i++) {
    this.starts.push(parser.read(32));
  }
  this.stop = parser.read(32);
  utils.checkFinished(parser);
};

GetheadersMessage.prototype.getPayload = function() {
  var bw = new BufferWriter();
  bw.writeUInt32LE(this.version);
  bw.writeVarintNum(this.starts.length);
  for (var i = 0; i < this.starts.length; i++) {
    bw.write(this.starts[i]);
  }
  if (this.stop.length !== 32) {
    throw new Error('Invalid hash length: ' + this.stop.length);
  }
  bw.write(this.stop);
  return bw.concat();
};

module.exports = GetheadersMessage;

},{"../message":38,"../utils":39,"bitcore":"bitcore","util":10}],26:[function(require,module,exports){
'use strict';

var Message = require('../message');
var inherits = require('util').inherits;
var bitcore = require('bitcore');
var utils = require('../utils');
var BufferReader = bitcore.encoding.BufferReader;
var BufferWriter = bitcore.encoding.BufferWriter;
var _ = bitcore.deps._;
var $ = bitcore.util.preconditions;

/**
 * Sent in response to a `getheaders` message. It contains information about
 * block headers.
 * @param {Array} arg - An array of BlockHeader instances
 * @param {Object=} options
 * @param {Array=} options.headers - array of block headers
 * @param {Function} options.BlockHeader - a BlockHeader constructor
 * @extends Message
 * @constructor
 */
function HeadersMessage(arg, options) {
  Message.call(this, options);
  this.BlockHeader = options.BlockHeader;
  this.command = 'headers';
  $.checkArgument(
    _.isUndefined(arg) || (Array.isArray(arg) && arg[0] instanceof this.BlockHeader),
    'First argument is expected to be an array of BlockHeader instances'
  );
  this.headers = arg;
}
inherits(HeadersMessage, Message);

HeadersMessage._name = 'Headers';

HeadersMessage.prototype.setPayload = function(payload) {
  $.checkArgument(payload && payload.length > 0, 'No data found to create Headers message');
  var parser = new BufferReader(payload);
  var count = parser.readVarintNum();

  this.headers = [];
  for (var i = 0; i < count; i++) {
    var header = this.BlockHeader.fromBufferReader(parser);
    this.headers.push(header);
    var txn_count = parser.readUInt8();
    $.checkState(txn_count === 0, 'txn_count should always be 0');
  }
  utils.checkFinished(parser);
};

HeadersMessage.prototype.getPayload = function() {
  var bw = new BufferWriter();
  bw.writeVarintNum(this.headers.length);
  for (var i = 0; i < this.headers.length; i++) {
    var buffer = this.headers[i].toBuffer();
    bw.write(buffer);
    bw.writeUInt8(0);
  }
  return bw.concat();
};

module.exports = HeadersMessage;

},{"../message":38,"../utils":39,"bitcore":"bitcore","util":10}],27:[function(require,module,exports){
'use strict';

var Message = require('../message');
var inherits = require('util').inherits;
var bitcore = require('bitcore');
var utils = require('../utils');
var BufferReader = bitcore.encoding.BufferReader;
var BufferWriter = bitcore.encoding.BufferWriter;
var _ = bitcore.deps._;

/**
 * @param {Array=} arg - An array of inventory
 * @param {Object} options
 * @param {Array=} options.inventory - An array of inventory items
 * @extends Message
 * @constructor
 */
function InvMessage(arg, options) {
  Message.call(this, options);
  this.command = 'inv';
  utils.checkInventory(arg);
  this.inventory = arg;
}
inherits(InvMessage, Message);

InvMessage._name = 'Inventory';

InvMessage.prototype.setPayload = function(payload) {
  this.inventory = [];

  var parser = new BufferReader(payload);
  var count = parser.readVarintNum();
  for (var i = 0; i < count; i++) {
    var type = parser.readUInt32LE();
    var hash = parser.read(32);
    this.inventory.push({type: type, hash: hash});
  }

  utils.checkFinished(parser);
};

InvMessage.prototype.getPayload = function() {
  var bw = new BufferWriter();
  utils.writeInventory(this.inventory, bw);
  return bw.concat();
};

module.exports = InvMessage;

},{"../message":38,"../utils":39,"bitcore":"bitcore","util":10}],28:[function(require,module,exports){
'use strict';

var Message = require('../message');
var inherits = require('util').inherits;
var bitcore = require('bitcore');
var BufferUtil = bitcore.util.buffer;

/**
 * The mempool message sends a request to a node asking for information about
 * transactions it has verified but which have not yet confirmed.
 * @see https://en.bitcoin.it/wiki/Protocol_documentation#mempool
 * @param {Object} options
 * @extends Message
 * @constructor
 */
function MempoolMessage(arg, options) {
  Message.call(this, options);
  this.command = 'mempool';
}
inherits(MempoolMessage, Message);

MempoolMessage._name = 'MemPool';

MempoolMessage.prototype.setPayload = function() {};

MempoolMessage.prototype.getPayload = function() {
  return BufferUtil.EMPTY_BUFFER;
};

module.exports = MempoolMessage;

},{"../message":38,"bitcore":"bitcore","util":10}],29:[function(require,module,exports){
'use strict';

var Message = require('../message');
var inherits = require('util').inherits;
var bitcore = require('bitcore');
var BufferUtil = bitcore.util.buffer;
var $ = bitcore.util.preconditions;
var _ = bitcore.deps._;

/**
 * Contains information about a MerkleBlock
 * @see https://en.bitcoin.it/wiki/Protocol_documentation
 * @param {MerkleBlock} arg - An instance of MerkleBlock
 * @param {Object=} options
 * @param {Function} options.MerkleBlock - a MerkleBlock constructor
 * @extends Message
 * @constructor
 */
function MerkleblockMessage(arg, options) {
  Message.call(this, options);
  this.MerkleBlock = options.MerkleBlock; // constructor
  this.command = 'merkleblock';
  $.checkArgument(
    _.isUndefined(arg) || arg instanceof this.MerkleBlock,
    'An instance of MerkleBlock or undefined is expected'
  );
  this.merkleBlock = arg;
}
inherits(MerkleblockMessage, Message);

MerkleblockMessage._name = 'MerkleBlock';

MerkleblockMessage.prototype.setPayload = function(payload) {
  $.checkArgument(BufferUtil.isBuffer(payload));
  this.merkleBlock = this.MerkleBlock.fromBuffer(payload);
};

MerkleblockMessage.prototype.getPayload = function() {
  return this.merkleBlock ? this.merkleBlock.toBuffer() : BufferUtil.EMPTY_BUFFER;
};

module.exports = MerkleblockMessage;

},{"../message":38,"bitcore":"bitcore","util":10}],30:[function(require,module,exports){
'use strict';

var Message = require('../message');
var inherits = require('util').inherits;
var bitcore = require('bitcore');
var utils = require('../utils');
var BufferReader = bitcore.encoding.BufferReader;
var BufferWriter = bitcore.encoding.BufferWriter;
var _ = bitcore.deps._;

/**
 * @param {Array} arg - An array of inventory
 * @param {Object} options
 * @param {Array=} options.inventory - An array of inventory items
 * @extends Message
 * @constructor
 */
function NotfoundMessage(arg, options) {
  Message.call(this, options);
  this.command = 'notfound';
  utils.checkInventory(arg);
  this.inventory = arg;
}
inherits(NotfoundMessage, Message);

NotfoundMessage._name = 'NotFound';

NotfoundMessage.prototype.setPayload = function(payload) {
  this.inventory = [];

  var parser = new BufferReader(payload);
  var count = parser.readVarintNum();
  for (var i = 0; i < count; i++) {
    var type = parser.readUInt32LE();
    var hash = parser.read(32);
    this.inventory.push({type: type, hash: hash});
  }

  utils.checkFinished(parser);
};

NotfoundMessage.prototype.getPayload = function() {
  var bw = new BufferWriter();
  utils.writeInventory(this.inventory, bw);
  return bw.concat();
};

module.exports = NotfoundMessage;

},{"../message":38,"../utils":39,"bitcore":"bitcore","util":10}],31:[function(require,module,exports){
'use strict';

var Message = require('../message');
var inherits = require('util').inherits;
var bitcore = require('bitcore');
var utils = require('../utils');
var $ = bitcore.util.preconditions;
var _ = bitcore.deps._;
var BufferUtil = bitcore.util.buffer;
var BufferReader = bitcore.encoding.BufferReader;

/**
 * A message to confirm that a connection is still valid.
 * @param {Number} arg - A nonce for the Ping message
 * @param {Object=} options
 * @extends Message
 * @constructor
 */
function PingMessage(arg, options) {
  Message.call(this, options);
  this.command = 'ping';
  $.checkArgument(
    _.isUndefined(arg) || (BufferUtil.isBuffer(arg) && arg.length === 8),
    'First argument is expected to be an 8 byte buffer'
  );
  this.nonce = arg || utils.getNonce();
}
inherits(PingMessage, Message);

PingMessage._name = 'Ping';

PingMessage.prototype.setPayload = function(payload) {
  var parser = new BufferReader(payload);
  this.nonce = parser.read(8);

  utils.checkFinished(parser);
};

PingMessage.prototype.getPayload = function() {
  return this.nonce;
};

module.exports = PingMessage;

},{"../message":38,"../utils":39,"bitcore":"bitcore","util":10}],32:[function(require,module,exports){
'use strict';

var Message = require('../message');
var inherits = require('util').inherits;
var bitcore = require('bitcore');
var utils = require('../utils');
var $ = bitcore.util.preconditions;
var _ = bitcore.deps._;
var BufferUtil = bitcore.util.buffer;
var BufferReader = bitcore.encoding.BufferReader;

/**
 * A message in response to a ping message.
 * @param {Number} arg - A nonce for the Pong message
 * @param {Object=} options
 * @extends Message
 * @constructor
 */
function PongMessage(arg, options) {
  Message.call(this, options);
  this.command = 'pong';
  $.checkArgument(
    _.isUndefined(arg) || (BufferUtil.isBuffer(arg) && arg.length === 8),
    'First argument is expected to be an 8 byte buffer'
  );
  this.nonce = arg || utils.getNonce();
}
inherits(PongMessage, Message);

PongMessage._name = 'Pong';

PongMessage.prototype.setPayload = function(payload) {
  var parser = new BufferReader(payload);
  this.nonce = parser.read(8);

  utils.checkFinished(parser);
};

PongMessage.prototype.getPayload = function() {
  return this.nonce;
};

module.exports = PongMessage;

},{"../message":38,"../utils":39,"bitcore":"bitcore","util":10}],33:[function(require,module,exports){
'use strict';

var Message = require('../message');
var inherits = require('util').inherits;
var bitcore = require('bitcore');
var BufferUtil = bitcore.util.buffer;

// todo: add payload: https://en.bitcoin.it/wiki/Protocol_documentation#reject
function RejectMessage(arg, options) {
  Message.call(this, options);
  this.command = 'reject';
}
inherits(RejectMessage, Message);

RejectMessage._name = 'Reject';

RejectMessage.prototype.setPayload = function() {};

RejectMessage.prototype.getPayload = function() {
  return BufferUtil.EMPTY_BUFFER;
};

module.exports = RejectMessage;

},{"../message":38,"bitcore":"bitcore","util":10}],34:[function(require,module,exports){
'use strict';

var Message = require('../message');
var inherits = require('util').inherits;
var bitcore = require('bitcore');
var $ = bitcore.util.preconditions;
var _ = bitcore.deps._;

/**
 * @param {Transaction=} arg - An instance of Transaction
 * @param {Object} options
 * @extends Message
 * @constructor
 */
function TransactionMessage(arg, options) {
  Message.call(this, options);
  this.command = 'tx';
  this.Transaction = options.Transaction;
  $.checkArgument(
    _.isUndefined(arg) || arg instanceof this.Transaction,
    'An instance of Transaction or undefined is expected'
  );
  this.transaction = arg;
  if (!this.transaction) {
    this.transaction = new this.Transaction();
  }
}
inherits(TransactionMessage, Message);

TransactionMessage._name = 'Transaction';

TransactionMessage.prototype.setPayload = function(payload) {
  if (this.Transaction.prototype.fromBuffer) {
    this.transaction = new this.Transaction().fromBuffer(payload);
  } else {
    this.transaction = this.Transaction.fromBuffer(payload);
  }
};

TransactionMessage.prototype.getPayload = function() {
  return this.transaction.toBuffer();
};

module.exports = TransactionMessage;

},{"../message":38,"bitcore":"bitcore","util":10}],35:[function(require,module,exports){
'use strict';

var Message = require('../message');
var inherits = require('util').inherits;
var bitcore = require('bitcore');
var BufferUtil = bitcore.util.buffer;

/**
 * A message in response to a version message.
 * @extends Message
 * @constructor
 */
function VerackMessage(arg, options) {
  Message.call(this, options);
  this.command = 'verack';
}
inherits(VerackMessage, Message);

VerackMessage._name = 'VerAck';

VerackMessage.prototype.setPayload = function() {};

VerackMessage.prototype.getPayload = function() {
  return BufferUtil.EMPTY_BUFFER;
};

module.exports = VerackMessage;

},{"../message":38,"bitcore":"bitcore","util":10}],36:[function(require,module,exports){
(function (Buffer){
'use strict';

var Message = require('../message');
var inherits = require('util').inherits;
var bitcore = require('bitcore');
var BufferWriter = bitcore.encoding.BufferWriter;
var BufferReader = bitcore.encoding.BufferReader;
var BN = bitcore.crypto.BN;

var utils = require('../utils');
var packageInfo = require('../../../package.json');

/**
 * The version message is used on connection creation to advertise
 * the type of node. The remote node will respond with its version, and no
 * communication is possible until both peers have exchanged their versions.
 *
 * @see https://en.bitcoin.it/wiki/Protocol_documentation#version
 * @param {Object=} arg - properties for the version message
 * @param {Buffer=} arg.nonce - a random 8 byte buffer
 * @param {String=} arg.subversion - version of the client
 * @param {BN=} arg.services
 * @param {Date=} arg.timestamp
 * @param {Number=} arg.startHeight
 * @param {Object} options
 * @extends Message
 * @constructor
 */
function VersionMessage(arg, options) {
  /* jshint maxcomplexity: 10 */
  if (!arg) {
    arg = {};
  }
  Message.call(this, options);
  this.command = 'version';
  this.version = arg.version || options.protocolVersion;
  this.nonce = arg.nonce || utils.getNonce();
  this.services = arg.services || new BN(1, 10);
  this.timestamp = arg.timestamp || new Date();
  this.subversion = arg.subversion || '/bitcore:' + packageInfo.version + '/';
  this.startHeight = arg.startHeight || 0;
  this.relay = arg.relay === false ? false : true;
}
inherits(VersionMessage, Message);

VersionMessage._name = 'Version';

VersionMessage.prototype.setPayload = function(payload) {
  var parser = new BufferReader(payload);
  this.version = parser.readUInt32LE();
  this.services = parser.readUInt64LEBN();
  this.timestamp = new Date(parser.readUInt64LEBN().toNumber() * 1000);

  this.addrMe = {
    services: parser.readUInt64LEBN(),
    ip: utils.parseIP(parser),
    port: parser.readUInt16BE()
  };
  this.addrYou = {
    services: parser.readUInt64LEBN(),
    ip: utils.parseIP(parser),
    port: parser.readUInt16BE()
  };
  this.nonce = parser.read(8);
  this.subversion = parser.readVarLengthBuffer().toString();
  this.startHeight = parser.readUInt32LE();

  if(parser.finished()) {
    this.relay = true;
  } else {
    this.relay = !!parser.readUInt8();
  }
  utils.checkFinished(parser);
};

VersionMessage.prototype.getPayload = function() {
  var bw = new BufferWriter();
  bw.writeUInt32LE(this.version);
  bw.writeUInt64LEBN(this.services);

  var timestampBuffer = new Buffer(Array(8));
  timestampBuffer.writeUInt32LE(Math.round(this.timestamp.getTime() / 1000), 0);
  bw.write(timestampBuffer);

  utils.writeAddr(this.addrMe, bw);
  utils.writeAddr(this.addrYou, bw);
  bw.write(this.nonce);
  bw.writeVarintNum(this.subversion.length);
  bw.write(new Buffer(this.subversion, 'ascii'));
  bw.writeUInt32LE(this.startHeight);
  bw.writeUInt8(this.relay);

  return bw.concat();
};

module.exports = VersionMessage;

}).call(this,require("buffer").Buffer)
},{"../../../package.json":52,"../message":38,"../utils":39,"bitcore":"bitcore","buffer":2,"util":10}],37:[function(require,module,exports){
 'use strict';

var bitcore = require('bitcore');
var BufferUtil = bitcore.util.buffer;
var Hash = bitcore.crypto.Hash;
var $ = bitcore.util.preconditions;

/**
 * A factory to build Bitcoin protocol messages.
 * @param {Object=} options
 * @param {Network=} options.network
 * @param {Function=} options.Block - A block constructor
 * @param {Function=} options.BlockHeader - A block header constructor
 * @param {Function=} options.MerkleBlock - A merkle block constructor
 * @param {Function=} options.Transaction - A transaction constructor
 * @constructor
 */
function Messages(options) {
  this.builder = Messages.builder(options);

  // map message constructors by name
  for(var key in this.builder.commandsMap) {
    var name = this.builder.commandsMap[key]._name;
    this[name] = this.builder.commands[key];
  }

  if (!options) {
    options = {};
  }
  this.network = options.network || bitcore.Networks.defaultNetwork;
}

Messages.MINIMUM_LENGTH = 20;
Messages.PAYLOAD_START = 16;
Messages.Message = require('./message');
Messages.builder = require('./builder');

/**
 * @param {Buffers} dataBuffer
 */
Messages.prototype.parseBuffer = function(dataBuffer) {
  /* jshint maxstatements: 18 */
  if (dataBuffer.length < Messages.MINIMUM_LENGTH) {
    return;
  }

  // Search the next magic number
  if (!this._discardUntilNextMessage(dataBuffer)) {
    return;
  }

  var payloadLen = (dataBuffer.get(Messages.PAYLOAD_START)) +
    (dataBuffer.get(Messages.PAYLOAD_START + 1) << 8) +
    (dataBuffer.get(Messages.PAYLOAD_START + 2) << 16) +
    (dataBuffer.get(Messages.PAYLOAD_START + 3) << 24);

  var messageLength = 24 + payloadLen;
  if (dataBuffer.length < messageLength) {
    return;
  }

  var command = dataBuffer.slice(4, 16).toString('ascii').replace(/\0+$/, '');
  var payload = dataBuffer.slice(24, messageLength);
  var checksum = dataBuffer.slice(20, 24);

  var checksumConfirm = Hash.sha256sha256(payload).slice(0, 4);
  if (!BufferUtil.equals(checksumConfirm, checksum)) {
    dataBuffer.skip(messageLength);
    return;
  }

  dataBuffer.skip(messageLength);

  return this._buildFromBuffer(command, payload);
};

Messages.prototype._discardUntilNextMessage = function(dataBuffer) {
  $.checkArgument(dataBuffer);
  $.checkState(this.network, 'network must be set');
  var i = 0;
  for (;;) {
    // check if it's the beginning of a new message
    var packageNumber = dataBuffer.slice(0, 4).toString('hex');
    if (packageNumber === this.network.networkMagic.toString('hex')) {
      dataBuffer.skip(i);
      return true;
    }

    // did we reach the end of the buffer?
    if (i > (dataBuffer.length - 4)) {
      dataBuffer.skip(i);
      return false;
    }

    i++; // continue scanning
  }
};

Messages.prototype._buildFromBuffer = function(command, payload) {
  if (!this.builder.commands[command]) {
    throw new Error('Unsupported message command: ' + command);
  }
  return this.builder.commands[command].fromBuffer(payload);
};

module.exports = Messages;

},{"./builder":15,"./message":38,"bitcore":"bitcore"}],38:[function(require,module,exports){
(function (Buffer){
'use strict';

var bitcore = require('bitcore');
var $ = bitcore.util.preconditions;
var BufferWriter = bitcore.encoding.BufferWriter;
var Hash = bitcore.crypto.Hash;

/**
 * Base message that can be inherited to add an additional
 * `getPayload` method to modify the message payload.
 * @param {Object=} options
 * @param {String=} options.command
 * @param {Network=} options.network
 * @constructor
 */
function Message(options) {
  this.command = options.command;
  this.network = options.network;
}

/**
 * @returns {Buffer} - Serialized message
 * @constructor
 */
Message.prototype.toBuffer = Message.prototype.serialize = function() {
  $.checkState(this.network, 'Need to have a defined network to serialize message');
  var commandBuf = new Buffer(Array(12));
  commandBuf.write(this.command, 'ascii');

  var payload = this.getPayload();
  var checksum = Hash.sha256sha256(payload).slice(0, 4);

  var bw = new BufferWriter();
  bw.write(this.network.networkMagic);
  bw.write(commandBuf);
  bw.writeUInt32LE(payload.length);
  bw.write(checksum);
  bw.write(payload);

  return bw.concat();
};

module.exports = Message;

}).call(this,require("buffer").Buffer)
},{"bitcore":"bitcore","buffer":2}],39:[function(require,module,exports){
(function (Buffer){
'use strict';

var bitcore = require('bitcore');
var BufferUtil = bitcore.util.buffer;
var $ = bitcore.util.preconditions;
var _ = bitcore.deps._;
var utils;

module.exports = utils = {
  checkInventory: function(arg) {
    $.checkArgument(
      _.isUndefined(arg) ||
        (Array.isArray(arg) && arg.length === 0) ||
        (Array.isArray(arg) && !_.isUndefined(arg[0].type) && !_.isUndefined(arg[0].hash)),
      'Argument is expected to be an array of inventory objects'
    );
  },
  checkFinished: function checkFinished(parser) {
    if(!parser.finished()) {
      throw new Error('Data still available after parsing');
    }
  },
  getNonce: function getNonce() {
    return bitcore.crypto.Random.getRandomBuffer(8);
  },
  writeIP: function writeIP(ip, bw) {
    var words = ip.v6.split(':').map(function(s) {
      return new Buffer(s, 'hex');
    });
    for (var i = 0; i < words.length; i++) {
      var word = words[i];
      bw.write(word);
    }
  },
  writeAddr: function writeAddr(addr, bw) {
    if (_.isUndefined(addr)) {
      var pad = new Buffer(Array(26));
      bw.write(pad);
      return;
    }

    bw.writeUInt64LEBN(addr.services);
    utils.writeIP(addr.ip, bw);
    bw.writeUInt16BE(addr.port);
  },
  writeInventory: function writeInventory(inventory, bw) {
    bw.writeVarintNum(inventory.length);
    inventory.forEach(function(value) {
      bw.writeUInt32LE(value.type);
      bw.write(value.hash);
    });
  },
  parseIP: function parseIP(parser) {
    var ipv6 = [];
    var ipv4 = [];
    for (var a = 0; a < 8; a++) {
      var word = parser.read(2);
      ipv6.push(word.toString('hex'));
      if (a >= 6) {
        ipv4.push(word[0]);
        ipv4.push(word[1]);
      }
    }
    ipv6 = ipv6.join(':');
    ipv4 = ipv4.join('.');
    return {
      v6: ipv6,
      v4: ipv4
    };
  },
  parseAddr: function parseAddr(parser) {
    var services = parser.readUInt64LEBN();
    var ip = utils.parseIP(parser);
    var port = parser.readUInt16BE();
    return {
      services: services,
      ip: ip,
      port: port
    };
  },
  sanitizeStartStop: function sanitizeStartStop(obj) {
    /* jshint maxcomplexity: 10 */
    /* jshint maxstatements: 20 */
    $.checkArgument(_.isUndefined(obj.starts) || _.isArray(obj.starts));
    var starts = obj.starts;
    var stop = obj.stop;
    if (starts) {
      starts = starts.map(function(hash) {
        if (_.isString(hash)) {
          return BufferUtil.reverse(new Buffer(hash, 'hex'));
        } else {
          return hash;
        }
      });
    } else {
      starts = [];
    }

    for (var i = 0; i < starts.length; i++) {
      if (starts[i].length !== 32) {
        throw new Error('Invalid hash ' + i + ' length: ' + starts[i].length);
      }
    }

    stop = obj.stop;
    if (_.isString(stop)) {
      stop = BufferUtil.reverse(new Buffer(stop, 'hex'));
    }
    if (!stop) {
      stop = BufferUtil.NULL_HASH;
    }
    obj.starts = starts;
    obj.stop = stop;

    return obj;
  }
};

}).call(this,require("buffer").Buffer)
},{"bitcore":"bitcore","buffer":2}],40:[function(require,module,exports){
'use strict';

var Buffers = require('./buffers');
var EventEmitter = require('events').EventEmitter;
var Net = require('net');
var Socks5Client = require('socks5-client');
var bitcore = require('bitcore');
var Networks = bitcore.Networks;
var Messages = require('./messages');
var $ = bitcore.util.preconditions;
var util = require('util');

/**
 * The Peer constructor will create an instance of Peer to send and receive messages
 * using the standard Bitcoin protocol. A Peer instance represents one connection
 * on the Bitcoin network. To create a new peer connection provide the host and port
 * options and then invoke the connect method. Additionally, a newly connected socket
 * can be provided instead of host and port.
 *
 * @example
 * ```javascript
 *
 * var peer = new Peer({host: '127.0.0.1'}).setProxy('127.0.0.1', 9050);
 * peer.on('tx', function(tx) {
 *  console.log('New transaction: ', tx.id);
 * });
 * peer.connect();
 * ```
 *
 * @param {Object} options
 * @param {String} options.host - IP address of the remote host
 * @param {Number} options.port - Port number of the remote host
 * @param {Network} options.network - The network configuration
 * @param {Boolean=} options.relay - An option to disable automatic inventory relaying from the remote peer
 * @param {Socket=} options.socket - An existing connected socket

 * @returns {Peer} A new instance of Peer.
 * @constructor
 */
function Peer(options) {
  /* jshint maxstatements: 26 */
  /* jshint maxcomplexity: 8 */

  if (!(this instanceof Peer)) {
    return new Peer(options);
  }

  if (options.socket) {
    this.socket = options.socket;
    this.host = this.socket.remoteAddress;
    this.port = this.socket.remotePort;
    this.status = Peer.STATUS.CONNECTED;
    this._addSocketEventHandlers();
  } else {
    this.host = options.host || 'localhost';
    this.status = Peer.STATUS.DISCONNECTED;
    this.port = options.port;
  }

  this.network = Networks.get(options.network) || Networks.defaultNetwork;

  if (!this.port) {
    this.port = this.network.port;
  }

  this.messages = options.messages || new Messages({
    network: this.network,
    Block: bitcore.Block,
    Transaction: bitcore.Transaction
  });

  this.dataBuffer = new Buffers();

  this.version = 0;
  this.bestHeight = 0;
  this.subversion = null;
  this.relay = options.relay === false ? false : true;

  this.versionSent = false;

  // set message handlers
  var self = this;
  this.on('verack', function() {
    self.status = Peer.STATUS.READY;
    self.emit('ready');
  });

  this.on('version', function(message) {
    self.version = message.version;
    self.subversion = message.subversion;
    self.bestHeight = message.startHeight;

    var verackResponse = self.messages.VerAck();
    self.sendMessage(verackResponse);

    if(!self.versionSent) {
      self._sendVersion();
    }
  });

  this.on('ping', function(message) {
    self._sendPong(message.nonce);
  });

  return this;

}
util.inherits(Peer, EventEmitter);

Peer.MAX_RECEIVE_BUFFER = 10000000;
Peer.STATUS = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  READY: 'ready'
};

/**
 * Set a socks5 proxy for the connection. Enables the use of the TOR network.
 * @param {String} host - IP address of the proxy
 * @param {Number} port - Port number of the proxy
 * @returns {Peer} The same Peer instance.
 */
Peer.prototype.setProxy = function(host, port) {
  $.checkState(this.status === Peer.STATUS.DISCONNECTED);

  this.proxy = {
    host: host,
    port: port
  };
  return this;
};

/**
 * Init the connection with the remote peer.
 * @returns {Peer} The same peer instance.
 */
Peer.prototype.connect = function() {
  this.socket = this._getSocket();
  this.status = Peer.STATUS.CONNECTING;

  var self = this;
  this.socket.on('connect', function(ev) {
    self.status = Peer.STATUS.CONNECTED;
    self.emit('connect');
    self._sendVersion();
  });

  this._addSocketEventHandlers();
  this.socket.connect(this.port, this.host);
  return this;
};

Peer.prototype._addSocketEventHandlers = function() {
  var self = this;

  this.socket.on('error', self._onError.bind(this));
  this.socket.on('end', self.disconnect.bind(this));

  this.socket.on('data', function(data) {
    self.dataBuffer.push(data);

    if (self.dataBuffer.length > Peer.MAX_RECEIVE_BUFFER) {
      // TODO: handle this case better
      return self.disconnect();
    }
    self._readMessage();
  });
};

Peer.prototype._onError = function(e) {
  this.emit('error', e);
  if (this.status !== Peer.STATUS.DISCONNECTED) {
    this.disconnect();
  }
};

/**
 * Disconnects the remote connection.
 * @returns {Peer} The same peer instance.
 */
Peer.prototype.disconnect = function() {
  this.status = Peer.STATUS.DISCONNECTED;
  this.socket.destroy();
  this.emit('disconnect');
  return this;
};

/**
 * Send a Message to the remote peer.
 * @param {Message} message - A message instance
 */
Peer.prototype.sendMessage = function(message) {
  this.socket.write(message.toBuffer());
};

/**
 * Internal function that sends VERSION message to the remote peer.
 */
Peer.prototype._sendVersion = function() {
  // todo: include sending local ip address
  var message = this.messages.Version({relay: this.relay});
  this.versionSent = true;
  this.sendMessage(message);
};

/**
 * Send a PONG message to the remote peer.
 */
Peer.prototype._sendPong = function(nonce) {
  var message = this.messages.Pong(nonce);
  this.sendMessage(message);
};

/**
 * Internal function that tries to read a message from the data buffer
 */
Peer.prototype._readMessage = function() {
  var message = this.messages.parseBuffer(this.dataBuffer);
  if (message) {
    this.emit(message.command, message);
    this._readMessage();
  }
};

/**
 * Internal function that creates a socket using a proxy if necessary.
 * @returns {Socket} A Socket instance not yet connected.
 */
Peer.prototype._getSocket = function() {
  if (this.proxy) {
    return new Socks5Client(this.proxy.host, this.proxy.port);
  }

  return new Net.Socket();
};

module.exports = Peer;

},{"./buffers":12,"./messages":37,"bitcore":"bitcore","events":6,"net":1,"socks5-client":46,"util":10}],41:[function(require,module,exports){
(function (Buffer){
'use strict';

var dns = require('dns');
var EventEmitter = require('events').EventEmitter;
var bitcore = require('bitcore');
var sha256 = bitcore.crypto.Hash.sha256;
var Peer = require('./peer');
var Networks = bitcore.Networks;
var util = require('util');
var net = require('net');

function now() {
  return Math.floor(new Date().getTime() / 1000);
}

/**
 * A pool is a collection of Peers. A pool will discover peers from DNS seeds, and
 * collect information about new peers in the network. When a peer disconnects the pool
 * will connect to others that are available to maintain a max number of
 * ongoing peer connections. Peer events are relayed to the pool.
 *
 * @example
 * ```javascript
 *
 * var pool = new Pool({network: Networks.livenet});
 * pool.on('peerinv', function(peer, message) {
 *   // do something with the inventory announcement
 * });
 * pool.connect();
 * ```
 *
 * @param {Object=} options
 * @param {Network=} options.network - The network configuration
 * @param {Boolean=} options.listenAddr - Prevent new peers being added from addr messages
 * @param {Boolean=} options.dnsSeed - Prevent seeding with DNS discovered known peers
 * @param {Boolean=} options.relay - Prevent inventory announcements until a filter is loaded
 * @param {Number=} options.maxSize - The max number of peers
 * @returns {Pool}
 * @constructor
 */
function Pool(options) {
  /* jshint maxcomplexity: 10 */
  /* jshint maxstatements: 20 */

  var self = this;

  options = options || {};
  this.keepalive = false;

  this._connectedPeers = {};
  this._addrs = [];

  this.listenAddr = options.listenAddr !== false;
  this.dnsSeed = options.dnsSeed !== false;
  this.maxSize = options.maxSize || Pool.MaxConnectedPeers;
  this.messages = options.messages;
  this.network = Networks.get(options.network) || Networks.defaultNetwork;
  this.relay = options.relay === false ? false : true;

  if (options.addrs) {
    for(var i = 0; i < options.addrs.length; i++) {
      this._addAddr(options.addrs[i]);
    }
  }

  if (this.listenAddr) {
    this.on('peeraddr', function peerAddrEvent(peer, message) {
      var addrs = message.addresses;
      var length = addrs.length;
      for (var i = 0; i < length; i++) {
        var addr = addrs[i];
        var future = new Date().getTime() + (10 * 60 * 1000);
        if (addr.time.getTime() <= 100000000000 || addr.time.getTime() > future) {
          // In case of an invalid time, assume "5 days ago"
          var past = new Date(new Date().getTime() - 5 * 24 * 60 * 60 * 1000);
          addr.time = past;
        }
        this._addAddr(addr);
      }
    });
  }

  this.on('seed', function seedEvent(ips) {
    ips.forEach(function(ip) {
      self._addAddr({
        ip: {
          v4: ip
        }
      });
    });
    if (self.keepalive) {
      self._fillConnections();
    }
  });

  this.on('peerdisconnect', function peerDisconnectEvent(peer, addr) {
    self._deprioritizeAddr(addr);
    self._removeConnectedPeer(addr);
    if (self.keepalive) {
      self._fillConnections();
    }
  });

  return this;

}

util.inherits(Pool, EventEmitter);

Pool.MaxConnectedPeers = 8;
Pool.RetrySeconds = 30;
Pool.PeerEvents = ['version', 'inv', 'getdata', 'ping', 'pong', 'addr',
  'getaddr', 'verack', 'reject', 'alert', 'headers', 'block', 'merkleblock',
  'tx', 'getblocks', 'getheaders', 'error', 'filterload', 'filteradd',
  'filterclear'
];

/**
 * Will initiatiate connection to peers, if available peers have been added to
 * the pool, it will connect to those, otherwise will use DNS seeds to find
 * peers to connect. When a peer disconnects it will add another.
 */
Pool.prototype.connect = function connect() {
  this.keepalive = true;
  var self = this;
  if (this.dnsSeed) {
    self._addAddrsFromSeeds();
  } else {
    self._fillConnections();
  }
  return this;
};

/**
 * Will disconnect all peers that are connected.
 */
Pool.prototype.disconnect = function disconnect() {
  this.keepalive = false;
  for (var i in this._connectedPeers) {
    this._connectedPeers[i].disconnect();
  }
  return this;
};

/**
 * @returns {Number} The number of peers currently connected.
 */
Pool.prototype.numberConnected = function numberConnected() {
  return Object.keys(this._connectedPeers).length;
};

/**
 * Will fill the conneted peers to the maximum amount.
 */
Pool.prototype._fillConnections = function _fillConnections() {
  var length = this._addrs.length;
  for (var i = 0; i < length; i++) {
    if (this.numberConnected() >= this.maxSize) {
      break;
    }
    var addr = this._addrs[i];
    if (!addr.retryTime || now() > addr.retryTime) {
      this._connectPeer(addr);
    }
  }
  return this;
};

/**
 * Will remove a peer from the list of connected peers.
 * @param {Object} addr - An addr from the list of addrs
 */
Pool.prototype._removeConnectedPeer = function _removeConnectedPeer(addr) {
  if (this._connectedPeers[addr.hash].status !== Peer.STATUS.DISCONNECTED) {
    this._connectedPeers[addr.hash].disconnect();
  } else {
    delete this._connectedPeers[addr.hash];
  }
  return this;
};

/**
 * Will connect a peer and add to the list of connected peers.
 * @param {Object} addr - An addr from the list of addrs
 */
Pool.prototype._connectPeer = function _connectPeer(addr) {
  var self = this;

  if (!this._connectedPeers[addr.hash]) {
    var port = addr.port || self.network.port;
    var ip = addr.ip.v4 || addr.ip.v6;
    var peer = new Peer({
      host: ip,
      port: port,
      messages: self.messages,
      network: this.network,
      relay: self.relay
    });

    peer.on('connect', function peerConnect() {
      self.emit('peerconnect', peer, addr);
    });

    self._addPeerEventHandlers(peer, addr);
    peer.connect();
    self._connectedPeers[addr.hash] = peer;
  }

  return this;
};

/**
 * Adds a peer with a connected socket to the _connectedPeers object, and
 * intializes the associated event handlers.
 * @param {Socket} - socket - A new connected socket
 * @param {Object} - addr - The associated addr object for the peer
 */
Pool.prototype._addConnectedPeer = function _addConnectedPeer(socket, addr) {
  var self = this;

  if (!this._connectedPeers[addr.hash]) {
    var peer = new Peer({
      socket: socket,
      network: this.network,
      messages: self.messages
    });

    self._addPeerEventHandlers(peer, addr);
    self._connectedPeers[addr.hash] = peer;
    self.emit('peerconnect', peer, addr);
  }

  return this;
};

/**
 * Will add disconnect and ready events for a peer and intialize
 * handlers for relay peer message events.
 */
Pool.prototype._addPeerEventHandlers = function(peer, addr) {
  var self = this;

  peer.on('disconnect', function peerDisconnect() {
    self.emit('peerdisconnect', peer, addr);
  });
  peer.on('ready', function peerReady() {
    self.emit('peerready', peer, addr);
  });
  Pool.PeerEvents.forEach(function addPeerEvents(event) {
    peer.on(event, function peerEvent(message) {
      self.emit('peer' + event, peer, message);
    });
  });
};

/**
 * Will deprioritize an addr in the list of addrs by moving it to the end
 * of the array, and setting a retryTime
 * @param {Object} addr - An addr from the list of addrs
 */
Pool.prototype._deprioritizeAddr = function _deprioritizeAddr(addr) {
  for (var i = 0; i < this._addrs.length; i++) {
    if (this._addrs[i].hash === addr.hash) {
      var middle = this._addrs[i];
      middle.retryTime = now() + Pool.RetrySeconds;
      var beginning = this._addrs.splice(0, i);
      var end = this._addrs.splice(i + 1, this._addrs.length);
      var combined = beginning.concat(end);
      this._addrs = combined.concat([middle]);
    }
  }
  return this;
};

/**
 * Will add an addr to the beginning of the addrs array
 * @param {Object}
 */
Pool.prototype._addAddr = function _addAddr(addr) {
  // Use default port if not specified
  addr.port = addr.port || this.network.port;

  // make a unique key
  addr.hash = sha256(new Buffer(addr.ip.v6 + addr.ip.v4 + addr.port)).toString('hex');

  var length = this._addrs.length;
  var exists = false;
  for (var i = 0; i < length; i++) {
    if (this._addrs[i].hash === addr.hash) {
      exists = true;
    }
  }
  if (!exists) {
    this._addrs.unshift(addr);
  }
  return addr;
};

/**
 * Will add addrs to the list of addrs from a DNS seed
 * @param {String} seed - A domain name to resolve known peers
 * @param {Function} done
 */
Pool.prototype._addAddrsFromSeed = function _addAddrsFromSeed(seed) {
  var self = this;
  dns.resolve(seed, function(err, ips) {
    if (err) {
      self.emit('seederror', err);
      return;
    }
    if (!ips || !ips.length) {
      self.emit('seederror', new Error('No IPs found from seed lookup.'));
      return;
    }
    // announce to pool
    self.emit('seed', ips);
  });
  return this;
};

/**
 * Will add addrs to the list of addrs from network DNS seeds
 * @param {Function} done
 */
Pool.prototype._addAddrsFromSeeds = function _addAddrsFromSeeds() {
  var self = this;
  var seeds = this.network.dnsSeeds;
  seeds.forEach(function(seed) {
    self._addAddrsFromSeed(seed);
  });
  return this;
};

/**
 * @returns {String} A string formatted for the console
 */
Pool.prototype.inspect = function inspect() {
  return '<Pool network: ' +
    this.network + ', connected: ' +
    this.numberConnected() + ', available: ' +
    this._addrs.length + '>';
};

/**
 * Will send a message to all of the peers in the pool.
 * @param {Message} message - An instance of the message to send
 */
Pool.prototype.sendMessage = function(message) {
  // broadcast to peers
  for(var key in this._connectedPeers) {
    var peer = this._connectedPeers[key];
    peer.sendMessage(message);
  }
};

/**
 * Will enable a listener for peer connections, when a peer connects
 * it will be added to the pool.
 */
Pool.prototype.listen = function() {
  var self = this;

  // Create server
  this.server = net.createServer(function(socket) {
    var addr = {
      ip: {}
    };
    if(net.isIPv6(socket.remoteAddress)) {
      addr.ip.v6 = socket.remoteAddress;
    } else {
      addr.ip.v4 = socket.remoteAddress;
    }
    addr.port = socket.remotePort;

    addr = self._addAddr(addr);
    self._addConnectedPeer(socket, addr);
  });
  this.server.listen(this.network.port);
};

module.exports = Pool;

}).call(this,require("buffer").Buffer)
},{"./peer":40,"bitcore":"bitcore","buffer":2,"dns":1,"events":6,"net":1,"util":10}],42:[function(require,module,exports){
'use strict';

var MurmurHash3 = require('./murmurhash3');

/**
 * A Bloom Filter implemented as for use in Bitcoin Connection Bloom Filtering (BIP37) that
 * uses version 3 of the 32-bit Murmur hash function.
 *
 * @see https://github.com/bitcoin/bips/blob/master/bip-0037.mediawiki
 * @see https://github.com/bitcoin/bitcoin/blob/master/src/bloom.cpp
 *
 * @param {Object} data - The data object used to initialize the filter.
 * @param {Array} data.vData - The data of the bloom filter.
 * @param {Number} data.nHashFuncs - The number of hash functions.
 * @param {Number} data.nTweak - A random value to seed the hash functions.
 * @param {Number} data.nFlag - A flag to determine how matched items are added to the filter.
 * @constructor
 */
function Filter(arg) {
  /* jshint maxcomplexity: 10 */
  if (typeof(arg) === 'object') {
    if (!arg.vData) {
      throw new TypeError('Data object should include filter data "vData"');
    }
    if (arg.vData.length > Filter.MAX_BLOOM_FILTER_SIZE * 8) {
      throw new TypeError('"vData" exceeded max size "' + Filter.MAX_BLOOM_FILTER_SIZE + '"');
    }
    this.vData = arg.vData;
    if (!arg.nHashFuncs) {
      throw new TypeError('Data object should include number of hash functions "nHashFuncs"');
    }
    if (arg.nHashFuncs > Filter.MAX_HASH_FUNCS) {
      throw new TypeError('"nHashFuncs" exceeded max size "' + Filter.MAX_HASH_FUNCS + '"');
    }
    this.nHashFuncs = arg.nHashFuncs;
    this.nTweak = arg.nTweak || 0;
    this.nFlags = arg.nFlags || Filter.BLOOM_UPDATE_NONE;
  } else {
    throw new TypeError('Unrecognized argument');
  }
}

Filter.prototype.toObject = function toObject() {
  return {
    vData: this.vData,
    nHashFuncs: this.nHashFuncs,
    nTweak: this.nTweak,
    nFlags: this.nFlags
  };
};

Filter.create = function create(elements, falsePositiveRate, nTweak, nFlags) {
  /* jshint maxstatements: 18 */

  var info = {};

  // The ideal size for a bloom filter with a given number of elements and false positive rate is:
  // * - nElements * log(fp rate) / ln(2)^2
  // See: https://github.com/bitcoin/bitcoin/blob/master/src/bloom.cpp
  var size = -1.0 / Filter.LN2SQUARED * elements * Math.log(falsePositiveRate);
  var filterSize = Math.floor(size / 8);
  var max = Filter.MAX_BLOOM_FILTER_SIZE * 8;
  if (filterSize > max) {
    filterSize = max;
  }
  info.vData = [];
  for (var i = 0; i < filterSize; i++) {
    info.vData.push(0);
  }

  // The ideal number of hash functions is:
  // filter size * ln(2) / number of elements
  // See: https://github.com/bitcoin/bitcoin/blob/master/src/bloom.cpp
  var nHashFuncs = Math.floor(info.vData.length * 8 / elements * Filter.LN2);
  if (nHashFuncs > Filter.MAX_HASH_FUNCS) {
    nHashFuncs = Filter.MAX_HASH_FUNCS;
  }
  if (nHashFuncs < Filter.MIN_HASH_FUNCS) {
    nHashFuncs = Filter.MIN_HASH_FUNCS;
  }

  info.nHashFuncs = nHashFuncs;
  info.nTweak = nTweak;
  info.nFlags = nFlags;

  return new Filter(info);

};

Filter.prototype.hash = function hash(nHashNum, vDataToHash) {
  var h = MurmurHash3(((nHashNum * 0xFBA4C795) + this.nTweak) & 0xFFFFFFFF, vDataToHash);
  return h % (this.vData.length * 8);
};

Filter.prototype.insert = function insert(data) {
  for (var i = 0; i < this.nHashFuncs; i++) {
    var index = this.hash(i, data);
    var position = (1 << (7 & index));
    this.vData[index >> 3] |= position;
  }
  return this;
};

/**
 * @param {Buffer} Data to check if exists in the filter
 * @returns {Boolean} If the data matches
 */
Filter.prototype.contains = function contains(data) {
  if (!this.vData.length) {
    return false;
  }
  for (var i = 0; i < this.nHashFuncs; i++) {
    var index = this.hash(i, data);
    if (!(this.vData[index >> 3] & (1 << (7 & index)))) {
      return false;
    }
  }
  return true;
};

Filter.prototype.clear = function clear() {
  this.vData = [];
};

Filter.prototype.inspect = function inspect() {
  return '<BloomFilter:' +
    this.vData + ' nHashFuncs:' +
    this.nHashFuncs + ' nTweak:' +
    this.nTweak + ' nFlags:' +
    this.nFlags + '>';
};

Filter.BLOOM_UPDATE_NONE = 0;
Filter.BLOOM_UPDATE_ALL = 1;
Filter.BLOOM_UPDATE_P2PUBKEY_ONLY = 2;
Filter.MAX_BLOOM_FILTER_SIZE = 36000; // bytes
Filter.MAX_HASH_FUNCS = 50;
Filter.MIN_HASH_FUNCS = 1;
Filter.LN2SQUARED = Math.pow(Math.log(2), 2); // 0.4804530139182014246671025263266649717305529515945455
Filter.LN2 = Math.log(2); // 0.6931471805599453094172321214581765680755001343602552

module.exports = Filter;

},{"./murmurhash3":44}],43:[function(require,module,exports){
'use strict';

module.exports = {};
module.exports = require('./filter');
module.exports.MurmurHash3 = require('./murmurhash3');

},{"./filter":42,"./murmurhash3":44}],44:[function(require,module,exports){
'use strict';

/**
 * MurmurHash is a non-cryptographic hash function suitable for general hash-based lookup
 *
 * @see https://en.wikipedia.org/wiki/MurmurHash
 * @see https://github.com/petertodd/python-bitcoinlib/blob/master/bitcoin/bloom.py
 * @see https://github.com/bitcoinj/bitcoinj/blob/master/core/src/main/java/org/bitcoinj/core/BloomFilter.java#L170
 * @see https://github.com/bitcoin/bitcoin/blob/master/src/hash.cpp
 * @see https://github.com/indutny/bcoin/blob/master/lib/bcoin/bloom.js
 * @see https://github.com/garycourt/murmurhash-js
 *
 * @param {Buffer} data to be hashed
 * @param {Number} seed Positive integer only
 * @return {Number} a 32-bit positive integer hash
*/
function MurmurHash3(seed, data) {
  /* jshint maxstatements: 32, maxcomplexity: 10 */

  var c1 = 0xcc9e2d51;
  var c2 = 0x1b873593;
  var r1 = 15;
  var r2 = 13;
  var m = 5;
  var n = 0x6b64e654;

  var hash = seed;

  function mul32(a, b) {
    return (a & 0xffff) * b + (((a >>> 16) * b & 0xffff) << 16) & 0xffffffff;
  }

  function sum32(a, b) {
    return (a & 0xffff) + (b >>> 16) + (((a >>> 16) + b & 0xffff) << 16) & 0xffffffff;
  }

  function rotl32(a, b) {
    return (a << b) | (a >>> (32 - b));
  }

  var k1;

  for (var i = 0; i + 4 <= data.length; i += 4) {
    k1 = data[i] |
      (data[i + 1] << 8) |
      (data[i + 2] << 16) |
      (data[i + 3] << 24);

    k1 = mul32(k1, c1);
    k1 = rotl32(k1, r1);
    k1 = mul32(k1, c2);

    hash ^= k1;
    hash = rotl32(hash, r2);
    hash = mul32(hash, m);
    hash = sum32(hash, n);
  }

  k1 = 0;

  switch(data.length & 3) {
    case 3:
      k1 ^= data[i + 2] << 16;
      /* falls through */
    case 2:
      k1 ^= data[i + 1] << 8;
      /* falls through */
    case 1:
      k1 ^= data[i];
      k1 = mul32(k1, c1);
      k1 = rotl32(k1, r1);
      k1 = mul32(k1, c2);
      hash ^= k1;
  }

  hash ^= data.length;
  hash ^= hash >>> 16;
  hash = mul32(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = mul32(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;

  return hash >>> 0;
}

module.exports = MurmurHash3;

},{}],45:[function(require,module,exports){
(function (Buffer){
module.exports = Buffers;

function Buffers (bufs) {
    if (!(this instanceof Buffers)) return new Buffers(bufs);
    this.buffers = bufs || [];
    this.length = this.buffers.reduce(function (size, buf) {
        return size + buf.length
    }, 0);
}

Buffers.prototype.push = function () {
    for (var i = 0; i < arguments.length; i++) {
        if (!Buffer.isBuffer(arguments[i])) {
            throw new TypeError('Tried to push a non-buffer');
        }
    }
    
    for (var i = 0; i < arguments.length; i++) {
        var buf = arguments[i];
        this.buffers.push(buf);
        this.length += buf.length;
    }
    return this.length;
};

Buffers.prototype.unshift = function () {
    for (var i = 0; i < arguments.length; i++) {
        if (!Buffer.isBuffer(arguments[i])) {
            throw new TypeError('Tried to unshift a non-buffer');
        }
    }
    
    for (var i = 0; i < arguments.length; i++) {
        var buf = arguments[i];
        this.buffers.unshift(buf);
        this.length += buf.length;
    }
    return this.length;
};

Buffers.prototype.copy = function (dst, dStart, start, end) {
    return this.slice(start, end).copy(dst, dStart, 0, end - start);
};

Buffers.prototype.splice = function (i, howMany) {
    var buffers = this.buffers;
    var index = i >= 0 ? i : this.length - i;
    var reps = [].slice.call(arguments, 2);
    
    if (howMany === undefined) {
        howMany = this.length - index;
    }
    else if (howMany > this.length - index) {
        howMany = this.length - index;
    }
    
    for (var i = 0; i < reps.length; i++) {
        this.length += reps[i].length;
    }
    
    var removed = new Buffers();
    var bytes = 0;
    
    var startBytes = 0;
    for (
        var ii = 0;
        ii < buffers.length && startBytes + buffers[ii].length < index;
        ii ++
    ) { startBytes += buffers[ii].length }
    
    if (index - startBytes > 0) {
        var start = index - startBytes;
        
        if (start + howMany < buffers[ii].length) {
            removed.push(buffers[ii].slice(start, start + howMany));
            
            var orig = buffers[ii];
            //var buf = new Buffer(orig.length - howMany);
            var buf0 = new Buffer(start);
            for (var i = 0; i < start; i++) {
                buf0[i] = orig[i];
            }
            
            var buf1 = new Buffer(orig.length - start - howMany);
            for (var i = start + howMany; i < orig.length; i++) {
                buf1[ i - howMany - start ] = orig[i]
            }
            
            if (reps.length > 0) {
                var reps_ = reps.slice();
                reps_.unshift(buf0);
                reps_.push(buf1);
                buffers.splice.apply(buffers, [ ii, 1 ].concat(reps_));
                ii += reps_.length;
                reps = [];
            }
            else {
                buffers.splice(ii, 1, buf0, buf1);
                //buffers[ii] = buf;
                ii += 2;
            }
        }
        else {
            removed.push(buffers[ii].slice(start));
            buffers[ii] = buffers[ii].slice(0, start);
            ii ++;
        }
    }
    
    if (reps.length > 0) {
        buffers.splice.apply(buffers, [ ii, 0 ].concat(reps));
        ii += reps.length;
    }
    
    while (removed.length < howMany) {
        var buf = buffers[ii];
        var len = buf.length;
        var take = Math.min(len, howMany - removed.length);
        
        if (take === len) {
            removed.push(buf);
            buffers.splice(ii, 1);
        }
        else {
            removed.push(buf.slice(0, take));
            buffers[ii] = buffers[ii].slice(take);
        }
    }
    
    this.length -= removed.length;
    
    return removed;
};
 
Buffers.prototype.slice = function (i, j) {
    var buffers = this.buffers;
    if (j === undefined) j = this.length;
    if (i === undefined) i = 0;
    
    if (j > this.length) j = this.length;
    
    var startBytes = 0;
    for (
        var si = 0;
        si < buffers.length && startBytes + buffers[si].length <= i;
        si ++
    ) { startBytes += buffers[si].length }
    
    var target = new Buffer(j - i);
    
    var ti = 0;
    for (var ii = si; ti < j - i && ii < buffers.length; ii++) {
        var len = buffers[ii].length;
        
        var start = ti === 0 ? i - startBytes : 0;
        var end = ti + len >= j - i
            ? Math.min(start + (j - i) - ti, len)
            : len
        ;
        
        buffers[ii].copy(target, ti, start, end);
        ti += end - start;
    }
    
    return target;
};

Buffers.prototype.pos = function (i) {
    if (i < 0 || i >= this.length) throw new Error('oob');
    var l = i, bi = 0, bu = null;
    for (;;) {
        bu = this.buffers[bi];
        if (l < bu.length) {
            return {buf: bi, offset: l};
        } else {
            l -= bu.length;
        }
        bi++;
    }
};

Buffers.prototype.get = function get (i) {
    var pos = this.pos(i);

    return this.buffers[pos.buf].get(pos.offset);
};

Buffers.prototype.set = function set (i, b) {
    var pos = this.pos(i);

    return this.buffers[pos.buf].set(pos.offset, b);
};

Buffers.prototype.indexOf = function (needle, offset) {
    if ("string" === typeof needle) {
        needle = new Buffer(needle);
    } else if (needle instanceof Buffer) {
        // already a buffer
    } else {
        throw new Error('Invalid type for a search string');
    }

    if (!needle.length) {
        return 0;
    }

    if (!this.length) {
        return -1;
    }

    var i = 0, j = 0, match = 0, mstart, pos = 0;

    // start search from a particular point in the virtual buffer
    if (offset) {
        var p = this.pos(offset);
        i = p.buf;
        j = p.offset;
        pos = offset;
    }

    // for each character in virtual buffer
    for (;;) {
        while (j >= this.buffers[i].length) {
            j = 0;
            i++;

            if (i >= this.buffers.length) {
                // search string not found
                return -1;
            }
        }

        var char = this.buffers[i][j];

        if (char == needle[match]) {
            // keep track where match started
            if (match == 0) {
                mstart = {
                    i: i,
                    j: j,
                    pos: pos
                };
            }
            match++;
            if (match == needle.length) {
                // full match
                return mstart.pos;
            }
        } else if (match != 0) {
            // a partial match ended, go back to match starting position
            // this will continue the search at the next character
            i = mstart.i;
            j = mstart.j;
            pos = mstart.pos;
            match = 0;
        }

        j++;
        pos++;
    }
};

Buffers.prototype.toBuffer = function() {
    return this.slice();
}

Buffers.prototype.toString = function(encoding, start, end) {
    return this.slice(start, end).toString(encoding);
}

}).call(this,require("buffer").Buffer)
},{"buffer":2}],46:[function(require,module,exports){
(function (Buffer){
/**
 * @author Matthew Caruana Galizia <m@m.cg>
 * @license MIT
 * @copyright Copyright (c) 2013, Matthew Caruana Galizia
 * @preserve
 *
 * Portions of this code are copyright (c) 2011 Valentin Háloiu, redistributed and modified under the following license (MIT).
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 */

'use strict';

/*jshint node:true*/

var net = require('net');
var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;

var htons = require('network-byte-order').htons;
var ipv6 = require('ipv6').v6;

module.exports = exports = Socks5ClientSocket;

exports.createConnection = function(options) {
	var socksSocket, socksHost, socksPort;

	socksHost = options.socksHost || 'localhost';
	socksPort = options.socksPort || 1080;
	socksSocket = new Socks5ClientSocket(socksHost, socksPort);

	return socksSocket.connect(options.port, options.host);
};

function Socks5ClientSocket(socksHost, socksPort) {
	var self = this;

	EventEmitter.call(self);

	self.socket = new net.Socket();
	self.socksHost = socksHost;
	self.socksPort = socksPort;

	self.socket.on('error', function(err) {
		self.emit('error', err);
	});

	self.on('error', function(err) {
		if (!self.socket.destroyed) {
			self.socket.destroy();
		}
	});
}

inherits(Socks5ClientSocket, EventEmitter);

Socks5ClientSocket.prototype.setTimeout = function(msecs, callback) {
	return this.socket.setTimeout(msecs, callback);
};

Socks5ClientSocket.prototype.setNoDelay = function() {
	return this.socket.setNoDelay();
};

Socks5ClientSocket.prototype.setKeepAlive = function(setting, msecs) {
	return this.socket.setKeepAlive(setting, msecs);
};

Socks5ClientSocket.prototype.address = function() {
	return this.socket.address();
};

Socks5ClientSocket.prototype.pause = function() {
	return this.socket.pause();
};

Socks5ClientSocket.prototype.resume = function() {
	return this.socket.resume();
};

Socks5ClientSocket.prototype.end = function(data, encoding) {
	return this.socket.end(data, encoding);
};

Socks5ClientSocket.prototype.destroy = function(exception) {
	return this.socket.destroy(exception);
};

Socks5ClientSocket.prototype.destroySoon = function() {
	var ret = this.socket.destroySoon();

	this.writable = false; // node's http library asserts writable to be false after destroySoon

	return ret;
};

Socks5ClientSocket.prototype.setEncoding = function(encoding) {
	return this.socket.setEncoding(encoding);
};

Socks5ClientSocket.prototype.write = function(data, arg1, arg2) {
	return this.socket.write(data, arg1, arg2);
};

Socks5ClientSocket.prototype.connect = function(port, host) {
	var self = this;

	self.socket.connect(self.socksPort, self.socksHost, function() {
		self.establishSocksConnection(host, port);
	});

	return self;
};

Socks5ClientSocket.prototype.handleSocksConnectToHost = function() {
	var self = this;

	self.socket.on('close', function(hadError) {
		self.emit('close', hadError);
	});

	self.socket.on('end', function() {
		self.emit('end');
	});

	self.socket.on('data', function(data) {
		self.emit('data', data);
	});

	self.socket._httpMessage = self._httpMessage;
	self.socket.parser = self.parser;
	self.socket.ondata = self.ondata;
	self.writable = true;
	self.readable = true;
	self.emit('connect');
};

Socks5ClientSocket.prototype.establishSocksConnection = function(host, port) {
	var self = this;

	self.authenticateWithSocks(function() {
		self.connectSocksToHost(host, port, function() {
			self.handleSocksConnectToHost();
		});
	});
};

Socks5ClientSocket.prototype.authenticateWithSocks = function(cb) {
	var request, self = this;

	self.socket.ondata = function(d, start, end) {
		var error;

		if (end - start !== 2) {
			error = new Error('SOCKS authentication failed. Unexpected number of bytes received.');
		} else if (d[start] !== 0x05) {
			error = new Error('SOCKS authentication failed. Unexpected SOCKS version number: ' + d[start] + '.');
		} else if (d[start + 1] !== 0x00) {
			error = new Error('SOCKS authentication failed. Unexpected SOCKS authentication method: ' + d[start+1] + '.');
		}

		if (error) {
			self.emit('error', error);
			return;
		}

		if (cb) {
			cb();
		}
	};

	request = new Buffer(3);
	request[0] = 0x05;  // SOCKS version
	request[1] = 0x01;  // number of authentication methods
	request[2] = 0x00;  // no authentication
	self.socket.write(request);
};

Socks5ClientSocket.prototype.connectSocksToHost = function(host, port, cb) {
	var buffer, request, self = this;

	this.socket.ondata = function(d, start, end) {
		var i, address, addressLength, error;

		if (d[start] !== 0x05) {
			error = new Error('SOCKS connection failed. Unexpected SOCKS version number: ' + d[start] + '.');
		} else if (d[start + 1] !== 0x00) {
			error = new Error('SOCKS connection failed. ' + getErrorMessage(d[start + 1]) + '.');
		} else if (d[start + 2] !== 0x00) {
			error = new Error('SOCKS connection failed. The reserved byte must be 0x00.');
		}

		if (error) {
			self.emit('error', error);
			return;
		}

		address = '';
		addressLength = 0;

		switch (d[start + 3]) {
			case 1:
				address = d[start + 4] + '.' + d[start + 5] + '.' + d[start + 6] + '.' + d[start + 7];
				addressLength = 4;
				break;
			case 3:
				addressLength = d[start + 4] + 1;
				for (i = start + 5; i < start + addressLength; i++) {
					address += String.fromCharCode(d[i]);
				}
				break;
			case 4:
				addressLength = 16;
				break;
			default:
				self.emit('error', new Error('SOCKS connection failed. Unknown addres type: ' + d[start + 3] + '.'));
				return;
		}

		if (cb) {
			cb();
		}
	};

	buffer = [];
	buffer.push(0x05); // SOCKS version
	buffer.push(0x01); // Command code: establish a TCP/IP stream connection
	buffer.push(0x00); // Reserved - myst be 0x00

	switch (net.isIP(host)) {
		case 0:
			buffer.push(0x03);
			parseDomainName(host, buffer);
			break;
		case 4:
			buffer.push(0x01);
			parseIPv4(host, buffer);
			break;
		case 6:
			buffer.push(0x04);
			if (parseIPv6(host, buffer) === false) {
				self.emit('error', new Error('IPv6 host parsing failed. Invalid address.'));
				return;
			}
			break;
	}

	parsePort(port, buffer);

	request = new Buffer(buffer);
	this.socket.write(request);
};

function parseIPv4(host, buffer) {
	var i, ip, groups = host.split('.');

	for (i = 0; i < groups.length; i++) {
		ip = parseInt(groups[i], 10);
		buffer.push(ip);
	}
}

function parseIPv6(host, buffer) {
	var i, b1, b2, part1, part2, address, groups;

	address = new ipv6.Address(host).canonicalForm();
	if (!address) {
		return false;
	}

	groups = address.split(':');

	for (i = 0; i < groups.length; i++) {
		part1 = groups[i].substr(0,2);
		part2 = groups[i].substr(2,2);

		b1 = parseInt(part1, 16);
		b2 = parseInt(part2, 16);

		buffer.push(b1);
		buffer.push(b2);
	}

	return true;
}

function parseDomainName(host, buffer) {
	var i, c;

	buffer.push(host.length);
	for (i = 0; i < host.length; i++) {
		c = host.charCodeAt(i);
		buffer.push(c);
	}
}

function parsePort(port, buffer) {
	htons(buffer, buffer.length, port);
}

function getErrorMessage(code) {
	switch (code) {
		case 1:
			return 'General SOCKS server failure';
		case 2:
			return 'Connection not allowed by ruleset';
		case 3:
			return 'Network unreachable';
		case 4:
			return 'Host unreachable';
		case 5:
			return 'Connection refused';
		case 6:
			return 'TTL expired';
		case 7:
			return 'Command not supported';
		case 8:
			return 'Address type not supported';
		default:
			return 'Unknown status code ' + code;
	}
}

}).call(this,require("buffer").Buffer)
},{"buffer":2,"events":6,"ipv6":47,"net":1,"network-byte-order":51,"util":10}],47:[function(require,module,exports){
exports = module.exports = require('./ipv6.js');
},{"./ipv6.js":48}],48:[function(require,module,exports){
if (typeof exports !== 'undefined') {
  var sprintf = require('sprintf').sprintf;
  var BigInteger = require('./lib/node/bigint').BigInteger;
}

var v4 = this.v4 = {};
var v6 = this.v6 = {};

v4.GROUPS = 4;
v6.GROUPS = 8;

v4.BITS = 32;
v6.BITS = 128;

v6.SCOPES = {
  0: 'Reserved',
  1: 'Interface local',
  2: 'Link local',
  4: 'Admin local',
  5: 'Site local',
  8: 'Organization local',
  15: 'Global',
  16: 'Reserved'
};

v4.RE_ADDRESS = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/g;
v4.RE_SUBNET_STRING = /\/\d{1,2}$/;

v6.RE_BAD_CHARACTERS = /([^0-9a-f:\/%])/ig;
v6.RE_BAD_ADDRESS = /([0-9a-f]{5,}|:{3,}|[^:]:$|^:[^:]|\/$)/ig;

v6.RE_SUBNET_STRING = /\/\d{1,3}(?=%|$)/;
v6.RE_ZONE_STRING = /%.*$/;

v6.RE_URL = new RegExp(/([0-9a-f:]+)/);
v6.RE_URL_WITH_PORT = new RegExp(/\[([0-9a-f:]+)\]:([0-9]{1,5})/);

// Convenience functions
function map(array, fn) {
  var results = [];
  var i;

  for (i = 0; i < array.length; i++) {
    results.push(fn(array[i], i));
  }

  return results;
}

function repeatString(s, n) {
  var result = '';
  var i;

  for (i = 0; i < n; i++) {
    result += s;
  }

  return result;
}

function addCommas(number) {
  var r = /(\d+)(\d{3})/;

  while (r.test(number)) {
    number = number.replace(r, '$1,$2');
  }

  return number;
}

function spanLeadingZeroesSimple(group) {
  return group.replace(/^(0+)/, '<span class="zero">$1</span>');
}

function spanLeadingZeroes4(n) {
  n = n.replace(/^(0{1,})([1-9]+)$/, '<span class="parse-error">$1</span>$2');
  n = n.replace(/^(0{1,})(0)$/, '<span class="parse-error">$1</span>$2');

  return n;
}

function simpleRegularExpression(addressArray) {
  var output = [];
  var i;

  for (i = 0; i < addressArray.length; i++) {
    var segment = addressArray[i];

    if (segment.length < 4) {
      output.push(sprintf('0{0,%d}%s', 4 - segment.length, segment));
    } else {
      output.push(segment);
    }
  }

  return output.join(':');
}

function zeroPad(s, n) {
  return String(repeatString(0, n) + s).slice(n * -1);
}

function isInSubnet(address) {
  // XXX: This is a hunch
  if (this.subnetMask < address.subnetMask) {
    return false;
  }

  if (this.mask(address.subnetMask) === address.mask()) {
    return true;
  }

  return false;
}

/*
 * Instantiates an IPv4 address
 */
v4.Address = function (address) {
  this.valid = false;
  this.address = address;
  this.groups = v4.GROUPS;

  this.v4 = true;

  this.subnet = '/32';
  this.subnetMask = 32;

  var subnet = v4.RE_SUBNET_STRING.exec(address);

  if (subnet) {
    this.parsedSubnet = subnet[0].replace('/', '');
    this.subnetMask = parseInt(this.parsedSubnet, 10);
    this.subnet = '/' + this.subnetMask;

    if (this.subnetMask < 0 || this.subnetMask > v4.BITS) {
      this.valid = false;
      this.error = "Invalid subnet mask.";

      return;
    }

    address = address.replace(v4.RE_SUBNET_STRING, '');
  }

  this.addressMinusSuffix = address;

  this.parsedAddress = this.parse(address);
};

/*
 * Parses a v4 address
 */
v4.Address.prototype.parse = function (address) {
  var groups = address.split('.');

  if (address.match(v4.RE_ADDRESS)) {
    this.valid = true;
  } else {
    this.error = 'Invalid IPv4 address.';
  }

  return groups;
};

/*
 * Returns true if the address is valid
 */
v4.Address.prototype.isValid = function () {
  return this.valid;
};

/*
 * Returns the correct form of an address
 */
v4.Address.prototype.correctForm = function () {
  return this.parsedAddress.map(function (part) {
    return parseInt(part, 10);
  }).join('.');
};

/*
 * Returns true if the address is correct, false otherwise
 */
v4.Address.prototype.isCorrect = function () {
  return this.addressMinusSuffix === this.correctForm() &&
    (this.subnetMask === 32 ||
      this.parsedSubnet === String(this.subnet.replace('/')));
};

/*
 * Converts a hex string to an IPv4 address object
 */
v4.Address.fromHex = function (hex) {
  var padded = zeroPad(hex.replace(/:/g, ''), 8);
  var groups = [];
  var i;

  for (i = 0; i < 8; i += 2) {
    var h = padded.slice(i, i + 2);

    groups.push(parseInt(h, 16));
  }

  return new v4.Address(groups.join('.'));
};

/*
 * Converts an integer into a IPv4 address object
 */
v4.Address.fromInteger = function (integer) {
  return v4.Address.fromHex(integer.toString(16));
};

/*
 * Converts an IPv4 address object to a hex string
 */
v4.Address.prototype.toHex = function () {
  return this.parsedAddress.map(function (part) {
    return sprintf('%02x', parseInt(part, 10));
  }).join(':');
};

/*
 * Converts an IPv4 address object to an array of bytes
 */
v4.Address.prototype.toArray = function () {
  return this.parsedAddress.map(function (part) {
    return parseInt(part, 10);
  });
};

/*
 * Converts an IPv4 address object to an IPv6 address group
 */
v4.Address.prototype.toV6Group = function () {
  var output = [];
  var i;

  for (i = 0; i < v4.GROUPS; i += 2) {
    var hex = sprintf('%02x%02x',
      parseInt(this.parsedAddress[i], 10),
      parseInt(this.parsedAddress[i + 1], 10));

    output.push(sprintf('%x', parseInt(hex, 16)));
  }

  return output.join(':');
};

/*
 * Returns the address as a BigInteger
 */
v4.Address.prototype.bigInteger = function () {
  if (!this.valid) {
    return;
  }

  return new BigInteger(map(this.parsedAddress, function (n) {
    return sprintf("%02x", parseInt(n, 10));
  }).join(''), 16);
};

/*
 * The first address in the range given by this address' subnet.
 * Often referred to as the Network Address.
 */
v4.Address.prototype.startAddress = function () {
  var startAddress = new BigInteger(this.mask() + repeatString(0,
    v4.BITS - this.subnetMask), 2);

  return v4.Address.fromBigInteger(startAddress);
};

/*
 * The last address in the range given by this address' subnet
 * Often referred to as the Broadcast
 */
v4.Address.prototype.endAddress = function () {
  var endAddress = new BigInteger(this.mask() + repeatString(1,
    v4.BITS - this.subnetMask), 2);

  return v4.Address.fromBigInteger(endAddress);
};

/*
 * Converts a BigInteger to a v4 address object
 */
v4.Address.fromBigInteger = function (bigInteger) {
  return v4.Address.fromInteger(parseInt(bigInteger.toString(), 10));
};

/*
 * Returns the first n bits of the address, defaulting to the
 * subnet mask
 */
v4.Address.prototype.mask = function (opt_mask) {
  if (opt_mask === undefined) {
    opt_mask = this.subnetMask;
  }

  return this.getBitsBase2(0, opt_mask);
};

/*
 * Returns the bits in the given range as a base-2 string
 */
v4.Address.prototype.getBitsBase2 = function (start, end) {
  return this.binaryZeroPad().slice(start, end);
};

/*
 * Returns true if the given address is in the subnet of the current address
 */
v4.Address.prototype.isInSubnet = isInSubnet;

/*
 * Returns a zero-padded base-2 string representation of the address
 */
v4.Address.prototype.binaryZeroPad = function () {
  return zeroPad(this.bigInteger().toString(2), v4.BITS);
};

/*
 * Instantiates an IPv6 address
 */
v6.Address = function (address, opt_groups) {
  if (opt_groups === undefined) {
    this.groups = v6.GROUPS;
  } else {
    this.groups = opt_groups;
  }

  this.v4 = false;

  this.subnet = '/128';
  this.subnetMask = 128;

  this.zone = '';

  this.address = address;

  var subnet = v6.RE_SUBNET_STRING.exec(address);

  if (subnet) {
    this.parsedSubnet = subnet[0].replace('/', '');
    this.subnetMask = parseInt(this.parsedSubnet, 10);
    this.subnet = '/' + this.subnetMask;

    if (isNaN(this.subnetMask) ||
      this.subnetMask < 0 ||
      this.subnetMask > v6.BITS) {
      this.valid = false;
      this.error = "Invalid subnet mask.";

      return;
    }

    address = address.replace(v6.RE_SUBNET_STRING, '');
  } else if (/\//.test(address)) {
    this.valid = false;
    this.error = "Invalid subnet mask.";

    return;
  }

  var zone = v6.RE_ZONE_STRING.exec(address);

  if (zone) {
    this.zone = zone[0];

    address = address.replace(v6.RE_ZONE_STRING, '');
  }

  this.addressMinusSuffix = address;

  this.parsedAddress = this.parse(this.addressMinusSuffix);
};

/*
 * Converts a BigInteger to a v6 address object
 */
v6.Address.fromBigInteger = function (bigInteger) {
  var hex = zeroPad(bigInteger.toString(16), 32);
  var groups = [];
  var i;

  for (i = 0; i < 8; i++) {
    groups.push(hex.slice(i * 4, (i + 1) * 4));
  }

  return new v6.Address(groups.join(':'));
};

/*
 * Converts a URL (optional port number) to an address object
 */
v6.Address.fromURL = function (url) {
  var host;
  var port;
  var result;

  // If we have brackets parse them and find a port
  if (url.indexOf('[') !== -1 && url.indexOf(']') !== -1) {
    result = v6.RE_URL_WITH_PORT.exec(url);

    if (result === null) {
      return {
        error: 'failed to parse address with port',
        address: null,
        port: null
      };
    }

    host = result[1];
    port = result[2];
  // If there's a URL extract the address
  } else if (url.indexOf('/') !== -1) {
    // Remove the protocol prefix
    url = url.replace(/^[a-z0-9]+:\/\//, '');

    // Parse the address
    result = v6.RE_URL.exec(url);

    if (result === null) {
      return {
        error: 'failed to parse address from URL',
        address: null,
        port: null
      };
    }

    host = result[1];
  // Otherwise just assign the URL to the host and let the library parse it
  } else {
    host = url;
  }

  // If there's a port convert it to an integer
  if (port) {
    port = parseInt(port, 10);

    //squelch out of range ports
    if (port < 0 || port > 65536) {
      port = null;
    }
  } else {
    // Standardize `undefined` to `null`
    port = null;
  }

  return {
    address: new v6.Address(host),
    port: port
  };
};

/*
 * A helper function to compact an array
 */
v6.Address.compact = function (address, slice) {
  var s1 = [];
  var s2 = [];
  var i;

  for (i = 0; i < address.length; i++) {
    if (i < slice[0]) {
      s1.push(address[i]);
    } else if (i > slice[1]) {
      s2.push(address[i]);
    }
  }

  return s1.concat(['compact']).concat(s2);
};

/*
 * Returns true if the address is valid, false otherwise
 */
v6.Address.prototype.isValid = function () {
  return this.valid;
};

/*
 * Returns true if the address is correct, false otherwise
 */
v6.Address.prototype.isCorrect = function () {
  return this.addressMinusSuffix === this.correctForm() &&
    (this.subnetMask === 128 ||
      this.parsedSubnet === String(this.subnet.replace('/')));
};

/*
 * Returns true if the address is a link local address, false otherwise
 */
v6.Address.prototype.isLinkLocal = function () {
  // Zeroes are required, i.e. we can't check isInSubnet with 'fe80::/10'
  if (this.getBitsBase2(0, 64) ===
    "1111111010000000000000000000000000000000000000000000000000000000") {
    return true;
  }

  return false;
};

/*
 * Returns true if the address is in the canonical form, false otherwise
 */
v6.Address.prototype.isCanonical = function () {
  return this.addressMinusSuffix === this.canonicalForm();
};

/*
 * Returns true if the address is a multicast address, false otherwise
 */
v6.Address.prototype.isMulticast = function () {
  return this.getType() === 'Multicast';
};

/*
 * Returns true if the address is a v4-in-v6 address, false otherwise
 */
v6.Address.prototype.is4 = function () {
  return this.v4;
};

/*
 * Returns true if the address is a Teredo address, false otherwise
 */
v6.Address.prototype.isTeredo = function () {
  if (this.isInSubnet(new v6.Address('2001::/32'))) {
    return true;
  }

  return false;
};

/*
 * Returns true if the address is a 6to4 address, false otherwise
 */
v6.Address.prototype.is6to4 = function () {
  if (this.isInSubnet(new v6.Address('2002::/16'))) {
    return true;
  }

  return false;
};

/*
 * Returns true if the address is a loopback address, false otherwise
 */
v6.Address.prototype.isLoopback = function () {
  return this.getType() === 'Loopback';
};

/*
 * Returns the Microsoft UNC transcription of the address
 */
v6.Address.prototype.microsoftTranscription = function () {
  return sprintf('%s.ipv6-literal.net',
    this.correctForm().replace(/:/g, '-'));
};

/*
 * Returns the address in link form with a default port of 80
 */
v6.Address.prototype.href = function (opt_port) {
  if (opt_port === undefined) {
    opt_port = '';
  } else {
    opt_port = sprintf(':%s', opt_port);
  }

  return sprintf('http://[%s]%s/', this.correctForm(), opt_port);
};

/*
 * Returns the first n bits of the address, defaulting to the
 * subnet mask
 */
v6.Address.prototype.mask = function (opt_mask) {
  if (opt_mask === undefined) {
    opt_mask = this.subnetMask;
  }

  return this.getBitsBase2(0, opt_mask);
};

/*
 * Returns a link suitable for conveying the address via a URL hash
 */
v6.Address.prototype.link = function (options) {
  if (!options) {
    options = {};
  }

  if (options.className === undefined) {
    options.className = '';
  }

  if (options.prefix === undefined) {
    options.prefix = '/#address=';
  }

  if (options.v4 === undefined) {
    options.v4 = false;
  }

  var formFunction = this.correctForm;

  if (options.v4) {
    formFunction = this.v4inv6;
  }

  if (options.className) {
    return sprintf('<a href="%1$s%2$s" class="%3$s">%2$s</a>',
      options.prefix, formFunction.call(this), options.className);
  }

  return sprintf('<a href="%1$s%2$s">%2$s</a>', options.prefix,
    formFunction.call(this));
};

/*
 * Returns the number of possible subnets of a given size in the address
 */
v6.Address.prototype.possibleAddresses = function (opt_subnetSize) {
  if (opt_subnetSize === undefined) {
    opt_subnetSize = 0;
  }

  return addCommas(new BigInteger('2', 10).pow((v6.BITS - this.subnetMask) -
    (v6.BITS - opt_subnetSize)).toString(10));
};

/*
 * Returns true if the given address is in the subnet of the current address
 */
v6.Address.prototype.isInSubnet = isInSubnet;

/*
 * Create an IPv6-mapped address given an IPv4 address
 */
v6.Address.fromAddress4 = function (address4) {
  return new v6.Address('::ffff:' + address4);
};

/*
 * The first address in the range given by this address' subnet
 */
v6.Address.prototype.startAddress = function () {
  var startAddress = new BigInteger(this.mask() + repeatString(0,
    v6.BITS - this.subnetMask), 2);

  return v6.Address.fromBigInteger(startAddress);
};

/*
 * The last address in the range given by this address' subnet
 */
v6.Address.prototype.endAddress = function () {
  var endAddress = new BigInteger(this.mask() + repeatString(1,
    v6.BITS - this.subnetMask), 2);

  return v6.Address.fromBigInteger(endAddress);
};

/*
 * Returns the scope of the address
 */
v6.Address.prototype.getScope = function () {
  var scope = v6.SCOPES[this.getBits(12, 16)];

  if (this.getType() === "Global unicast") {
    if (scope !== "Link local") {
      scope = "Global";
    }
  }

  return scope;
};

/*
 * Returns the type of the address
 */
v6.Address.prototype.getType = function () {
  // TODO: Refactor this
  // TODO: Add ff0x::fb, etc. for multicast DNS
  var TYPES = {
    'ff01::1/128': 'Multicast (All nodes on this interface)',
    'ff01::2/128': 'Multicast (All routers on this interface)',
    'ff02::1/128': 'Multicast (All nodes on this link)',
    'ff02::2/128': 'Multicast (All routers on this link)',
    'ff05::2/128': 'Multicast (All routers in this site)',
    'ff02::5/128': 'Multicast (OSPFv3 AllSPF routers)',
    'ff02::6/128': 'Multicast (OSPFv3 AllDR routers)',
    'ff02::9/128': 'Multicast (RIP routers)',
    'ff02::a/128': 'Multicast (EIGRP routers)',
    'ff02::d/128': 'Multicast (PIM routers)',
    'ff02::16/128': 'Multicast (MLDv2 reports)',
    'ff01::fb/128': 'Multicast (mDNSv6)',
    'ff02::fb/128': 'Multicast (mDNSv6)',
    'ff05::fb/128': 'Multicast (mDNSv6)',
    'ff02::1:2/128': 'Multicast (All DHCP servers and relay agents on this link)',
    'ff05::1:2/128': 'Multicast (All DHCP servers and relay agents in this site)',
    'ff02::1:3/128': 'Multicast (All DHCP servers on this link)',
    'ff05::1:3/128': 'Multicast (All DHCP servers in this site)',
    '::/128': 'Unspecified',
    '::1/128': 'Loopback',
    'ff00::/8': 'Multicast',
    'fe80::/10': 'Link-local unicast'
  };

  var type = 'Global unicast';
  var p;

  for (p in TYPES) {
    if (TYPES.hasOwnProperty(p)) {
      if (this.isInSubnet(new v6.Address(p))) {
        type = TYPES[p];

        break;
      }
    }
  }

  return type;
};

/*
 * Returns the bits in the given range as a BigInteger
 */
v6.Address.prototype.getBits = function (start, end) {
  return new BigInteger(this.getBitsBase2(start, end), 2);
};

/*
 * Returns the bits in the given range as a base-2 string
 */
v6.Address.prototype.getBitsBase2 = function (start, end) {
  return this.binaryZeroPad().slice(start, end);
};

/*
 * Returns the bits in the given range as a base-16 string
 */
v6.Address.prototype.getBitsBase16 = function (start, end) {
  var length = end - start;

  if (length % 4 !== 0) {
    return;
  }

  return zeroPad(this.getBits(start, end).toString(16), length / 4);
};

/*
 * Returns the bits that are set past the subnet mask length
 */
v6.Address.prototype.getBitsPastSubnet = function () {
  return this.getBitsBase2(this.subnetMask, v6.BITS);
};

/*
 * Returns the string with each character contained in a <span>
 */
v6.Address.spanAll = function (s, opt_offset) {
  if (opt_offset === undefined) {
    opt_offset = 0;
  }

  var letters = s.split('');

  return map(letters, function (n, i) {
    return sprintf('<span class="digit value-%s position-%d">%s</span>', n,
      i + opt_offset,
      v6.Address.spanAllZeroes(n)); // XXX Use #base-2 .value-0 instead?
  }).join('');
};

/*
 * Returns the string with all zeroes contained in a <span>
 */
v6.Address.spanAllZeroes = function (s) {
  return s.replace(/(0+)/g, '<span class="zero">$1</span>');
};

/*
 * Returns the string with leading zeroes contained in a <span>
 */
v6.Address.spanLeadingZeroes = function (address) {
  var groups = address.split(':');

  groups = map(groups, function (g) {
    return spanLeadingZeroesSimple(g);
  });

  return groups.join(':');
};

/*
 * Groups an address
 */
v6.Address.simpleGroup = function (addressString, offset) {
  var groups = addressString.split(':');

  if (!offset) {
    offset = 0;
  }

  groups = map(groups, function (g, i) {
    if (/group-v4/.test(g)) {
      return g;
    }

    return sprintf('<span class="hover-group group-%d">%s</span>',
      i + offset,
      spanLeadingZeroesSimple(g));
  });

  return groups.join(':');
};

/*
 * Groups an address
 */
v6.Address.group = function (addressString) {
  var address6 = new v6.Address(addressString);
  var address4 = address6.address.match(v4.RE_ADDRESS);
  var i;

  if (address4) {
    // The IPv4 case
    var segments = address4[0].split('.');

    address6.address = address6.address.replace(v4.RE_ADDRESS,
      sprintf('<span class="hover-group group-v4 group-6">%s</span>' +
        '.' +
        '<span class="hover-group group-v4 group-7">%s</span>',
        segments.slice(0, 2).join('.'),
        segments.slice(2, 4).join('.')));
  }

  if (address6.elidedGroups === 0) {
    // The simple case
    return v6.Address.simpleGroup(address6.address);
  }

  // The elided case
  var output = [];

  var halves = address6.address.split('::');

  if (halves[0].length) {
    output.push(v6.Address.simpleGroup(halves[0]));
  } else {
    output.push('');
  }

  var classes = ['hover-group'];

  for (i = address6.elisionBegin; i < address6.elisionBegin +
    address6.elidedGroups; i++) {
    classes.push(sprintf('group-%d', i));
  }

  output.push(sprintf('<span class="%s"></span>', classes.join(' ')));

  if (halves[1].length) {
    output.push(v6.Address.simpleGroup(halves[1], address6.elisionEnd));
  } else {
    output.push('');
  }

  return output.join(':');
};

/*
 * Returns the reversed ip6.arpa form of the address
 */
v6.Address.prototype.reverseForm = function () {
  var characters = Math.floor(this.subnetMask / 4);

  var reversed = this.canonicalForm()
    .replace(/:/g, '')
    .split('')
    .slice(0, characters)
    .reverse()
    .join('.');

  if (characters > 0) {
    return sprintf("%s.ip6.arpa.", reversed);
  }

  return 'ip6.arpa.';
};

/*
 * Returns the correct form of the address
 */
v6.Address.prototype.correctForm = function () {
  if (!this.parsedAddress) {
    return;
  }

  var i;
  var groups = [];

  var zeroCounter = 0;
  var zeroes = [];

  for (i = 0; i < this.parsedAddress.length; i++) {
    var value = parseInt(this.parsedAddress[i], 16);

    if (value === 0) {
      zeroCounter++;
    }

    if (value !== 0 && zeroCounter > 0) {
      if (zeroCounter > 1) {
        zeroes.push([i - zeroCounter, i - 1]);
      }

      zeroCounter = 0;
    }
  }

  // Do we end with a string of zeroes?
  if (zeroCounter > 1) {
    zeroes.push([this.parsedAddress.length - zeroCounter,
      this.parsedAddress.length - 1]);
  }

  var zeroLengths = map(zeroes, function (n) {
    return (n[1] - n[0]) + 1;
  });

  if (zeroes.length > 0) {
    var max = Math.max.apply(Math, zeroLengths);
    var index = zeroLengths.indexOf(max);

    groups = v6.Address.compact(this.parsedAddress, zeroes[index]);
  } else {
    groups = this.parsedAddress;
  }

  for (i = 0; i < groups.length; i++) {
    if (groups[i] !== 'compact') {
      groups[i] = parseInt(groups[i], 16).toString(16);
    }
  }

  var correct = groups.join(':');

  correct = correct.replace(/^compact$/, '::');
  correct = correct.replace(/^compact|compact$/, ':');
  correct = correct.replace(/compact/, '');

  return correct;
};

/*
 * Returns a zero-padded base-2 string representation of the address
 */
v6.Address.prototype.binaryZeroPad = function () {
  return zeroPad(this.bigInteger().toString(2), v6.BITS);
};

// TODO: Improve the semantics of this helper function
v6.Address.prototype.parse4in6 = function (address) {
  var groups = address.split(':');
  var lastGroup = groups.slice(-1)[0];

  var address4 = lastGroup.match(v4.RE_ADDRESS);

  if (address4) {
    var temp4 = new v4.Address(address4[0]);

    for (var i = 0; i < temp4.groups; i++) {
      if (/^0[0-9]+/.test(temp4.parsedAddress[i])) {
        this.valid = false;
        this.error = 'IPv4 addresses can not have leading zeroes.';

        this.parseError = address.replace(v4.RE_ADDRESS,
          map(temp4.parsedAddress, spanLeadingZeroes4).join('.'));

        return;
      }
    }

    this.v4 = true;

    groups[groups.length - 1] = temp4.toV6Group();

    address = groups.join(':');
  }

  return address;
};

// TODO: Make private?
v6.Address.prototype.parse = function (address) {
  address = this.parse4in6(address);

  if (this.error) {
    return;
  }

  var badCharacters = address.match(v6.RE_BAD_CHARACTERS);

  if (badCharacters) {
    this.valid = false;
    this.error = sprintf("Bad character%s detected in address: %s",
      badCharacters.length > 1 ? 's' : '', badCharacters.join(''));

    this.parseError = address.replace(v6.RE_BAD_CHARACTERS,
      '<span class="parse-error">$1</span>');

    return;
  }

  var badAddress = address.match(v6.RE_BAD_ADDRESS);

  if (badAddress) {
    this.valid = false;
    this.error = sprintf("Address failed regex: %s", badAddress.join(''));

    this.parseError = address.replace(v6.RE_BAD_ADDRESS,
      '<span class="parse-error">$1</span>');

    return;
  }

  var groups = [];

  var halves = address.split('::');

  if (halves.length === 2) {
    var first = halves[0].split(':');
    var last = halves[1].split(':');

    if (first.length === 1 &&
      first[0] === '') {
      first = [];
    }

    if (last.length === 1 &&
      last[0] === '') {
      last = [];
    }

    var remaining = this.groups - (first.length + last.length);

    if (!remaining) {
      this.valid = false;
      this.error = "Error parsing groups";

      return;
    }

    this.elidedGroups = remaining;

    this.elisionBegin = first.length;
    this.elisionEnd = first.length + this.elidedGroups;

    first.forEach(function (group) {
      groups.push(group);
    });

    for (var i = 0; i < remaining; i++) {
      groups.push(0);
    }

    last.forEach(function (group) {
      groups.push(group);
    });
  } else if (halves.length === 1) {
    groups = address.split(':');

    this.elidedGroups = 0;
  } else {
    this.valid = false;
    this.error = "Too many :: groups found";

    return;
  }

  groups = map(groups, function (g) {
    return sprintf('%x', parseInt(g, 16));
  });

  if (groups.length !== this.groups) {
    this.valid = false;
    this.error = "Incorrect number of groups found";

    return;
  }

  groups.forEach(function (group, i) {
    if (groups.length > 4 && !this.v4) {
      this.valid = false;
      this.error = sprintf("Group %d is too long", i + 1);

      return;
    }
  });

  this.valid = true;

  return groups;
};

/*
 * Generate a regular expression string that can be used to find or validate all
 * variations of this address.
 */
v6.Address.prototype.regularExpressionString = function (opt_subString) {
  if (opt_subString === undefined) {
    opt_subString = false;
  }

  var i;
  var output = [];

  var address6 = new v6.Address(this.correctForm());

  if (address6.elidedGroups === 0) {
    // The simple case
    output = simpleRegularExpression(address6.parsedAddress);
  } else if (address6.elidedGroups === 8) {
    output.push('::|');

    // TODO: Validate this
    for (i = 0; i < address6.elidedGroups; i++) {
      var pipe = '|';

      if (i === address6.elidedGroups - 1) {
        pipe = '';
      }

      output.push(sprintf('(0{1,4}:){%d}:%s', address6.elidedGroups, pipe));
    }
  } else {
    // The elided case

    // TODO: Allow sloppy elision
    // TODO: Compute all possible elisions
    var halves = address6.address.split('::');

    if (halves[0].length) {
      output = output.concat(simpleRegularExpression(halves[0].split(':')));
      output.push(':');
    }

    output.push(sprintf('((0{1,4}:){%d}|:)', address6.elidedGroups));

    if (halves[1].length) {
      output = output.concat(simpleRegularExpression(halves[1].split(':')));
    }
  }

  if (!opt_subString) {
    output = [].concat('\\b', output, '\\b');
  }

  return output.join('');
};

/*
 * Generate a regular expression that can be used to find or validate all
 * variations of this address.
 */
v6.Address.prototype.regularExpression = function () {
  return new RegExp(this.regularExpressionString(), 'i');
};

/*
 * Returns the canonical form of the address
 */
v6.Address.prototype.canonicalForm = function () {
  if (!this.valid) {
    return;
  }

  return map(this.parsedAddress, function (n) {
    return sprintf("%04x", parseInt(n, 16));
  }).join(':');
};

/*
 * Returns the decimal form of the address
 */
v6.Address.prototype.decimal = function () {
  if (!this.valid) {
    return;
  }

  return map(this.parsedAddress, function (n) {
    return sprintf("%05d", parseInt(n, 16));
  }).join(':');
};

/*
 * Returns the address as a BigInteger
 */
v6.Address.prototype.bigInteger = function () {
  if (!this.valid) {
    return;
  }

  return new BigInteger(map(this.parsedAddress, function (n) {
    return sprintf("%04x", parseInt(n, 16));
  }).join(''), 16);
};

/*
 * Returns the v4-in-v6 form of the address
 */
v6.Address.prototype.v4inv6 = function () {
  var binary = this.binaryZeroPad().split('');

  var address4 = v4.Address.fromHex(new BigInteger(binary.slice(96, 128)
    .join(''), 2).toString(16));
  var address6 = new v6.Address(this.parsedAddress.slice(0, 6).join(':'), 6);

  var correct = address6.correctForm();

  var infix = '';

  if (!/:$/.test(correct)) {
    infix = ':';
  }

  return address6.correctForm() + infix + address4.address;
};

/*
 * Returns an object containing the Teredo properties of the address
 */
v6.Address.prototype.teredo = function () {
  /*
  - Bits 0 to 31 are set to the Teredo prefix (normally 2001:0000::/32).
  - Bits 32 to 63 embed the primary IPv4 address of the Teredo server that
  is used.
  - Bits 64 to 79 can be used to define some flags. Currently only the
  higher order bit is used; it is set to 1 if the Teredo client is
  located behind a cone NAT, 0 otherwise. For Microsoft's Windows Vista
  and Windows Server 2008 implementations, more bits are used. In those
  implementations, the format for these 16 bits is "CRAAAAUG AAAAAAAA",
  where "C" remains the "Cone" flag. The "R" bit is reserved for future
  use. The "U" bit is for the Universal/Local flag (set to 0). The "G" bit
  is Individual/Group flag (set to 0). The A bits are set to a 12-bit
  randomly generated number chosen by the Teredo client to introduce
  additional protection for the Teredo node against IPv6-based scanning
  attacks.
  - Bits 80 to 95 contains the obfuscated UDP port number. This is the
  port number that is mapped by the NAT to the Teredo client with all
  bits inverted.
  - Bits 96 to 127 contains the obfuscated IPv4 address. This is the
  public IPv4 address of the NAT with all bits inverted.
  */

  var prefix = this.getBitsBase16(0, 32);

  var udpPort = this.getBits(80, 96).xor(new BigInteger('ffff', 16)).toString();

  var server4 = v4.Address.fromHex(this.getBitsBase16(32, 64));
  var client4 = v4.Address.fromHex(this.getBits(96, 128)
    .xor(new BigInteger('ffffffff', 16)).toString(16));

  var flags = this.getBits(64, 80);
  var flagsBase2 = this.getBitsBase2(64, 80);

  var coneNat = flags.testBit(15);
  var reserved = flags.testBit(14);
  var groupIndividual = flags.testBit(8);
  var universalLocal = flags.testBit(9);
  var nonce = new BigInteger(flagsBase2.slice(2, 6) +
    flagsBase2.slice(8, 16), 2).toString(10);

  return {
    prefix: sprintf('%s:%s', prefix.slice(0, 4), prefix.slice(4, 8)),
    server4: server4.address,
    client4: client4.address,
    flags: flagsBase2,
    coneNat: coneNat,
    microsoft: {
      reserved: reserved,
      universalLocal: universalLocal,
      groupIndividual: groupIndividual,
      nonce: nonce
    },
    udpPort: udpPort
  };
};

/*
 * Returns an object containing the 6to4 properties of the address
 */
v6.Address.prototype.six2four = function () {
  /*
  - Bits 0 to 15 are set to the 6to4 prefix (2002::/16).
  - Bits 16 to 48 embed the IPv4 address of the 6to4 gateway that is used.
  */

  var prefix = this.getBitsBase16(0, 16);

  var gateway = v4.Address.fromHex(this.getBitsBase16(16, 48));

  return {
    prefix: sprintf('%s', prefix.slice(0, 4)),
    gateway: gateway.address
  };
};

},{"./lib/node/bigint":49,"sprintf":50}],49:[function(require,module,exports){
/**
 * copped from https://github.com/joyent/node/blob/master/deps/v8/benchmarks/crypto.js (under same license).
 * 
 * Copyright (c) 2003-2005  Tom Wu
 * All Rights Reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS-IS" AND WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS, IMPLIED OR OTHERWISE, INCLUDING WITHOUT LIMITATION, ANY
 * WARRANTY OF MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE.
 *
 * IN NO EVENT SHALL TOM WU BE LIABLE FOR ANY SPECIAL, INCIDENTAL,
 * INDIRECT OR CONSEQUENTIAL DAMAGES OF ANY KIND, OR ANY DAMAGES WHATSOEVER
 * RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER OR NOT ADVISED OF
 * THE POSSIBILITY OF DAMAGE, AND ON ANY THEORY OF LIABILITY, ARISING OUT
 * OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * In addition, the following condition applies:
 *
 * All redistributions must retain an intact copy of this copyright notice
 * and disclaimer.
 */

// V8 optimized constants.
var dbits = 26
var BI_DB = dbits;
var BI_DM = ((1<<dbits)-1);
var BI_DV = (1<<dbits);

var BI_FP = 52;
var BI_FV = Math.pow(2,BI_FP);
var BI_F1 = BI_FP-dbits;
var BI_F2 = 2*dbits-BI_FP;

BigInteger = module.exports.BigInteger = function(a,b,c) {
  this.array = new Array();
  if(a != null)
    if("number" == typeof a) this.fromNumber(a,b,c);
    else if(b == null && "string" != typeof a) this.fromString(a,256);
    else this.fromString(a,b);
}

// return new, unset BigInteger
function nbi() { return new BigInteger(null); }

// am: Compute w_j += (x*this_i), propagate carries,
// c is initial carry, returns final carry.
// c < 3*dvalue, x < 2*dvalue, this_i < dvalue
// We need to select the fastest one that works in this environment.

// This is tailored to VMs with 2-bit tagging. It makes sure
// that all the computations stay within the 29 bits available.
function am4(i,x,w,j,c,n) {
  var this_array = this.array;
  var w_array    = w.array;

  var xl = x&0x1fff, xh = x>>13;
  while(--n >= 0) {
    var l = this_array[i]&0x1fff;
    var h = this_array[i++]>>13;
    var m = xh*l+h*xl;
    l = xl*l+((m&0x1fff)<<13)+w_array[j]+c;
    c = (l>>26)+(m>>13)+xh*h;
    w_array[j++] = l&0x3ffffff;
  }
  return c;
}

// Digit conversions
var BI_RM = "0123456789abcdefghijklmnopqrstuvwxyz";
var BI_RC = new Array();
var rr,vv;
rr = "0".charCodeAt(0);
for(vv = 0; vv <= 9; ++vv) BI_RC[rr++] = vv;
rr = "a".charCodeAt(0);
for(vv = 10; vv < 36; ++vv) BI_RC[rr++] = vv;
rr = "A".charCodeAt(0);
for(vv = 10; vv < 36; ++vv) BI_RC[rr++] = vv;

function int2char(n) { return BI_RM.charAt(n); }
function intAt(s,i) {
  var c = BI_RC[s.charCodeAt(i)];
  return (c==null)?-1:c;
}

// (protected) copy this to r
function bnpCopyTo(r) {
  var this_array = this.array;
  var r_array    = r.array;

  for(var i = this.t-1; i >= 0; --i) r_array[i] = this_array[i];
  r.t = this.t;
  r.s = this.s;
}

// (protected) set from integer value x, -DV <= x < DV
function bnpFromInt(x) {
  var this_array = this.array;
  this.t = 1;
  this.s = (x<0)?-1:0;
  if(x > 0) this_array[0] = x;
  else if(x < -1) this_array[0] = x+DV; // WTH is DV?  BI_DV maybe?
  else this.t = 0;
}

// return bigint initialized to value
function nbv(i) { var r = nbi(); r.fromInt(i); return r; }

// (protected) set from string and radix
function bnpFromString(s,b) {
  var this_array = this.array;
  var k;
  if(b == 16) k = 4;
  else if(b == 8) k = 3;
  else if(b == 256) k = 8; // byte array
  else if(b == 2) k = 1;
  else if(b == 32) k = 5;
  else if(b == 4) k = 2;
  else { this.fromRadix(s,b); return; }
  this.t = 0;
  this.s = 0;
  var i = s.length, mi = false, sh = 0;
  while(--i >= 0) {
    var x = (k==8)?s[i]&0xff:intAt(s,i);
    if(x < 0) {
      if(s.charAt(i) == "-") mi = true;
      continue;
    }
    mi = false;
    if(sh == 0)
      this_array[this.t++] = x;
    else if(sh+k > BI_DB) {
      this_array[this.t-1] |= (x&((1<<(BI_DB-sh))-1))<<sh;
      this_array[this.t++] = (x>>(BI_DB-sh));
    }
    else
      this_array[this.t-1] |= x<<sh;
    sh += k;
    if(sh >= BI_DB) sh -= BI_DB;
  }
  if(k == 8 && (s[0]&0x80) != 0) {
    this.s = -1;
    if(sh > 0) this_array[this.t-1] |= ((1<<(BI_DB-sh))-1)<<sh;
  }
  this.clamp();
  if(mi) BigInteger.ZERO.subTo(this,this);
}

// (protected) clamp off excess high words
function bnpClamp() {
  var this_array = this.array;
  var c = this.s&BI_DM;
  while(this.t > 0 && this_array[this.t-1] == c) --this.t;
}

// (public) return string representation in given radix
function bnToString(b) {
  var this_array = this.array;
  if(this.s < 0) return "-"+this.negate().toString(b);
  var k;
  if(b == 16) k = 4;
  else if(b == 8) k = 3;
  else if(b == 2) k = 1;
  else if(b == 32) k = 5;
  else if(b == 4) k = 2;
  else return this.toRadix(b);
  var km = (1<<k)-1, d, m = false, r = "", i = this.t;
  var p = BI_DB-(i*BI_DB)%k;
  if(i-- > 0) {
    if(p < BI_DB && (d = this_array[i]>>p) > 0) { m = true; r = int2char(d); }
    while(i >= 0) {
      if(p < k) {
        d = (this_array[i]&((1<<p)-1))<<(k-p);
        d |= this_array[--i]>>(p+=BI_DB-k);
      }
      else {
        d = (this_array[i]>>(p-=k))&km;
        if(p <= 0) { p += BI_DB; --i; }
      }
      if(d > 0) m = true;
      if(m) r += int2char(d);
    }
  }
  return m?r:"0";
}

// (public) -this
function bnNegate() { var r = nbi(); BigInteger.ZERO.subTo(this,r); return r; }

// (public) |this|
function bnAbs() { return (this.s<0)?this.negate():this; }

// (public) return + if this > a, - if this < a, 0 if equal
function bnCompareTo(a) {
  var this_array = this.array;
  var a_array = a.array;

  var r = this.s-a.s;
  if(r != 0) return r;
  var i = this.t;
  r = i-a.t;
  if(r != 0) return r;
  while(--i >= 0) if((r=this_array[i]-a_array[i]) != 0) return r;
  return 0;
}

// returns bit length of the integer x
function nbits(x) {
  var r = 1, t;
  if((t=x>>>16) != 0) { x = t; r += 16; }
  if((t=x>>8) != 0) { x = t; r += 8; }
  if((t=x>>4) != 0) { x = t; r += 4; }
  if((t=x>>2) != 0) { x = t; r += 2; }
  if((t=x>>1) != 0) { x = t; r += 1; }
  return r;
}

// (public) return the number of bits in "this"
function bnBitLength() {
  var this_array = this.array;
  if(this.t <= 0) return 0;
  return BI_DB*(this.t-1)+nbits(this_array[this.t-1]^(this.s&BI_DM));
}

// (protected) r = this << n*DB
function bnpDLShiftTo(n,r) {
  var this_array = this.array;
  var r_array = r.array;
  var i;
  for(i = this.t-1; i >= 0; --i) r_array[i+n] = this_array[i];
  for(i = n-1; i >= 0; --i) r_array[i] = 0;
  r.t = this.t+n;
  r.s = this.s;
}

// (protected) r = this >> n*DB
function bnpDRShiftTo(n,r) {
  var this_array = this.array;
  var r_array = r.array;
  for(var i = n; i < this.t; ++i) r_array[i-n] = this_array[i];
  r.t = Math.max(this.t-n,0);
  r.s = this.s;
}

// (protected) r = this << n
function bnpLShiftTo(n,r) {
  var this_array = this.array;
  var r_array = r.array;
  var bs = n%BI_DB;
  var cbs = BI_DB-bs;
  var bm = (1<<cbs)-1;
  var ds = Math.floor(n/BI_DB), c = (this.s<<bs)&BI_DM, i;
  for(i = this.t-1; i >= 0; --i) {
    r_array[i+ds+1] = (this_array[i]>>cbs)|c;
    c = (this_array[i]&bm)<<bs;
  }
  for(i = ds-1; i >= 0; --i) r_array[i] = 0;
  r_array[ds] = c;
  r.t = this.t+ds+1;
  r.s = this.s;
  r.clamp();
}

// (protected) r = this >> n
function bnpRShiftTo(n,r) {
  var this_array = this.array;
  var r_array = r.array;
  r.s = this.s;
  var ds = Math.floor(n/BI_DB);
  if(ds >= this.t) { r.t = 0; return; }
  var bs = n%BI_DB;
  var cbs = BI_DB-bs;
  var bm = (1<<bs)-1;
  r_array[0] = this_array[ds]>>bs;
  for(var i = ds+1; i < this.t; ++i) {
    r_array[i-ds-1] |= (this_array[i]&bm)<<cbs;
    r_array[i-ds] = this_array[i]>>bs;
  }
  if(bs > 0) r_array[this.t-ds-1] |= (this.s&bm)<<cbs;
  r.t = this.t-ds;
  r.clamp();
}

// (protected) r = this - a
function bnpSubTo(a,r) {
  var this_array = this.array;
  var r_array = r.array;
  var a_array = a.array;
  var i = 0, c = 0, m = Math.min(a.t,this.t);
  while(i < m) {
    c += this_array[i]-a_array[i];
    r_array[i++] = c&BI_DM;
    c >>= BI_DB;
  }
  if(a.t < this.t) {
    c -= a.s;
    while(i < this.t) {
      c += this_array[i];
      r_array[i++] = c&BI_DM;
      c >>= BI_DB;
    }
    c += this.s;
  }
  else {
    c += this.s;
    while(i < a.t) {
      c -= a_array[i];
      r_array[i++] = c&BI_DM;
      c >>= BI_DB;
    }
    c -= a.s;
  }
  r.s = (c<0)?-1:0;
  if(c < -1) r_array[i++] = BI_DV+c;
  else if(c > 0) r_array[i++] = c;
  r.t = i;
  r.clamp();
}

// (protected) r = this * a, r != this,a (HAC 14.12)
// "this" should be the larger one if appropriate.
function bnpMultiplyTo(a,r) {
  var this_array = this.array; // Unused local var?
  var r_array = r.array;
  var x = this.abs(), y = a.abs();
  var y_array = y.array;

  var i = x.t;
  r.t = i+y.t;
  while(--i >= 0) r_array[i] = 0;
  for(i = 0; i < y.t; ++i) r_array[i+x.t] = x.am(0,y_array[i],r,i,0,x.t);
  r.s = 0;
  r.clamp();
  if(this.s != a.s) BigInteger.ZERO.subTo(r,r);
}

// (protected) r = this^2, r != this (HAC 14.16)
function bnpSquareTo(r) {
  var x = this.abs();
  var x_array = x.array;
  var r_array = r.array;

  var i = r.t = 2*x.t;
  while(--i >= 0) r_array[i] = 0;
  for(i = 0; i < x.t-1; ++i) {
    var c = x.am(i,x_array[i],r,2*i,0,1);
    if((r_array[i+x.t]+=x.am(i+1,2*x_array[i],r,2*i+1,c,x.t-i-1)) >= BI_DV) {
      r_array[i+x.t] -= BI_DV;
      r_array[i+x.t+1] = 1;
    }
  }
  if(r.t > 0) r_array[r.t-1] += x.am(i,x_array[i],r,2*i,0,1);
  r.s = 0;
  r.clamp();
}

// (protected) divide this by m, quotient and remainder to q, r (HAC 14.20)
// r != q, this != m.  q or r may be null.
function bnpDivRemTo(m,q,r) {
  var pm = m.abs();
  if(pm.t <= 0) return;
  var pt = this.abs();
  if(pt.t < pm.t) {
    if(q != null) q.fromInt(0);
    if(r != null) this.copyTo(r);
    return;
  }
  if(r == null) r = nbi();
  var y = nbi(), ts = this.s, ms = m.s;
  var pm_array = pm.array;
  var nsh = BI_DB-nbits(pm_array[pm.t-1]);	// normalize modulus
  if(nsh > 0) { pm.lShiftTo(nsh,y); pt.lShiftTo(nsh,r); }
  else { pm.copyTo(y); pt.copyTo(r); }
  var ys = y.t;

  var y_array = y.array;
  var y0 = y_array[ys-1];
  if(y0 == 0) return;
  var yt = y0*(1<<BI_F1)+((ys>1)?y_array[ys-2]>>BI_F2:0);
  var d1 = BI_FV/yt, d2 = (1<<BI_F1)/yt, e = 1<<BI_F2;
  var i = r.t, j = i-ys, t = (q==null)?nbi():q;
  y.dlShiftTo(j,t);

  var r_array = r.array;
  if(r.compareTo(t) >= 0) {
    r_array[r.t++] = 1;
    r.subTo(t,r);
  }
  BigInteger.ONE.dlShiftTo(ys,t);
  t.subTo(y,y);	// "negative" y so we can replace sub with am later
  while(y.t < ys) y_array[y.t++] = 0;
  while(--j >= 0) {
    // Estimate quotient digit
    var qd = (r_array[--i]==y0)?BI_DM:Math.floor(r_array[i]*d1+(r_array[i-1]+e)*d2);
    if((r_array[i]+=y.am(0,qd,r,j,0,ys)) < qd) {	// Try it out
      y.dlShiftTo(j,t);
      r.subTo(t,r);
      while(r_array[i] < --qd) r.subTo(t,r);
    }
  }
  if(q != null) {
    r.drShiftTo(ys,q);
    if(ts != ms) BigInteger.ZERO.subTo(q,q);
  }
  r.t = ys;
  r.clamp();
  if(nsh > 0) r.rShiftTo(nsh,r);	// Denormalize remainder
  if(ts < 0) BigInteger.ZERO.subTo(r,r);
}

// (public) this mod a
function bnMod(a) {
  var r = nbi();
  this.abs().divRemTo(a,null,r);
  if(this.s < 0 && r.compareTo(BigInteger.ZERO) > 0) a.subTo(r,r);
  return r;
}

// Modular reduction using "classic" algorithm
function Classic(m) { this.m = m; }
function cConvert(x) {
  if(x.s < 0 || x.compareTo(this.m) >= 0) return x.mod(this.m);
  else return x;
}
function cRevert(x) { return x; }
function cReduce(x) { x.divRemTo(this.m,null,x); }
function cMulTo(x,y,r) { x.multiplyTo(y,r); this.reduce(r); }
function cSqrTo(x,r) { x.squareTo(r); this.reduce(r); }

Classic.prototype.convert = cConvert;
Classic.prototype.revert = cRevert;
Classic.prototype.reduce = cReduce;
Classic.prototype.mulTo = cMulTo;
Classic.prototype.sqrTo = cSqrTo;

// (protected) return "-1/this % 2^DB"; useful for Mont. reduction
// justification:
//         xy == 1 (mod m)
//         xy =  1+km
//   xy(2-xy) = (1+km)(1-km)
// x[y(2-xy)] = 1-k^2m^2
// x[y(2-xy)] == 1 (mod m^2)
// if y is 1/x mod m, then y(2-xy) is 1/x mod m^2
// should reduce x and y(2-xy) by m^2 at each step to keep size bounded.
// JS multiply "overflows" differently from C/C++, so care is needed here.
function bnpInvDigit() {
  var this_array = this.array;
  if(this.t < 1) return 0;
  var x = this_array[0];
  if((x&1) == 0) return 0;
  var y = x&3;		// y == 1/x mod 2^2
  y = (y*(2-(x&0xf)*y))&0xf;	// y == 1/x mod 2^4
  y = (y*(2-(x&0xff)*y))&0xff;	// y == 1/x mod 2^8
  y = (y*(2-(((x&0xffff)*y)&0xffff)))&0xffff;	// y == 1/x mod 2^16
  // last step - calculate inverse mod DV directly;
  // assumes 16 < DB <= 32 and assumes ability to handle 48-bit ints
  y = (y*(2-x*y%BI_DV))%BI_DV;		// y == 1/x mod 2^dbits
  // we really want the negative inverse, and -DV < y < DV
  return (y>0)?BI_DV-y:-y;
}

// Montgomery reduction
function Montgomery(m) {
  this.m = m;
  this.mp = m.invDigit();
  this.mpl = this.mp&0x7fff;
  this.mph = this.mp>>15;
  this.um = (1<<(BI_DB-15))-1;
  this.mt2 = 2*m.t;
}

// xR mod m
function montConvert(x) {
  var r = nbi();
  x.abs().dlShiftTo(this.m.t,r);
  r.divRemTo(this.m,null,r);
  if(x.s < 0 && r.compareTo(BigInteger.ZERO) > 0) this.m.subTo(r,r);
  return r;
}

// x/R mod m
function montRevert(x) {
  var r = nbi();
  x.copyTo(r);
  this.reduce(r);
  return r;
}

// x = x/R mod m (HAC 14.32)
function montReduce(x) {
  var x_array = x.array;
  while(x.t <= this.mt2)	// pad x so am has enough room later
    x_array[x.t++] = 0;
  for(var i = 0; i < this.m.t; ++i) {
    // faster way of calculating u0 = x[i]*mp mod DV
    var j = x_array[i]&0x7fff;
    var u0 = (j*this.mpl+(((j*this.mph+(x_array[i]>>15)*this.mpl)&this.um)<<15))&BI_DM;
    // use am to combine the multiply-shift-add into one call
    j = i+this.m.t;
    x_array[j] += this.m.am(0,u0,x,i,0,this.m.t);
    // propagate carry
    while(x_array[j] >= BI_DV) { x_array[j] -= BI_DV; x_array[++j]++; }
  }
  x.clamp();
  x.drShiftTo(this.m.t,x);
  if(x.compareTo(this.m) >= 0) x.subTo(this.m,x);
}

// r = "x^2/R mod m"; x != r
function montSqrTo(x,r) { x.squareTo(r); this.reduce(r); }

// r = "xy/R mod m"; x,y != r
function montMulTo(x,y,r) { x.multiplyTo(y,r); this.reduce(r); }

Montgomery.prototype.convert = montConvert;
Montgomery.prototype.revert = montRevert;
Montgomery.prototype.reduce = montReduce;
Montgomery.prototype.mulTo = montMulTo;
Montgomery.prototype.sqrTo = montSqrTo;

// (protected) true iff this is even
function bnpIsEven() {
  var this_array = this.array;
  return ((this.t>0)?(this_array[0]&1):this.s) == 0;
}

// (protected) this^e, e < 2^32, doing sqr and mul with "r" (HAC 14.79)
function bnpExp(e,z) {
  if(e > 0xffffffff || e < 1) return BigInteger.ONE;
  var r = nbi(), r2 = nbi(), g = z.convert(this), i = nbits(e)-1;
  g.copyTo(r);
  while(--i >= 0) {
    z.sqrTo(r,r2);
    if((e&(1<<i)) > 0) z.mulTo(r2,g,r);
    else { var t = r; r = r2; r2 = t; }
  }
  return z.revert(r);
}

// (public) this^e % m, 0 <= e < 2^32
function bnModPowInt(e,m) {
  var z;
  if(e < 256 || m.isEven()) z = new Classic(m); else z = new Montgomery(m);
  return this.exp(e,z);
}

// protected
BigInteger.prototype.copyTo = bnpCopyTo;
BigInteger.prototype.fromInt = bnpFromInt;
BigInteger.prototype.fromString = bnpFromString;
BigInteger.prototype.clamp = bnpClamp;
BigInteger.prototype.dlShiftTo = bnpDLShiftTo;
BigInteger.prototype.drShiftTo = bnpDRShiftTo;
BigInteger.prototype.lShiftTo = bnpLShiftTo;
BigInteger.prototype.rShiftTo = bnpRShiftTo;
BigInteger.prototype.subTo = bnpSubTo;
BigInteger.prototype.multiplyTo = bnpMultiplyTo;
BigInteger.prototype.squareTo = bnpSquareTo;
BigInteger.prototype.divRemTo = bnpDivRemTo;
BigInteger.prototype.invDigit = bnpInvDigit;
BigInteger.prototype.isEven = bnpIsEven;
BigInteger.prototype.exp = bnpExp;

// public
BigInteger.prototype.toString = bnToString;
BigInteger.prototype.negate = bnNegate;
BigInteger.prototype.abs = bnAbs;
BigInteger.prototype.compareTo = bnCompareTo;
BigInteger.prototype.bitLength = bnBitLength;
BigInteger.prototype.mod = bnMod;
BigInteger.prototype.modPowInt = bnModPowInt;

// "constants"
BigInteger.ZERO = nbv(0);
BigInteger.ONE = nbv(1);
// Copyright (c) 2005  Tom Wu
// All Rights Reserved.
// See "LICENSE" for details.

// Extended JavaScript BN functions, required for RSA private ops.

// (public)
function bnClone() { var r = nbi(); this.copyTo(r); return r; }

// (public) return value as integer
function bnIntValue() {
  var this_array = this.array;
  if(this.s < 0) {
    if(this.t == 1) return this_array[0]-BI_DV;
    else if(this.t == 0) return -1;
  }
  else if(this.t == 1) return this_array[0];
  else if(this.t == 0) return 0;
  // assumes 16 < DB < 32
  return ((this_array[1]&((1<<(32-BI_DB))-1))<<BI_DB)|this_array[0];
}

// (public) return value as byte
function bnByteValue() {
  var this_array = this.array;
  return (this.t==0)?this.s:(this_array[0]<<24)>>24;
}

// (public) return value as short (assumes DB>=16)
function bnShortValue() {
  var this_array = this.array;
  return (this.t==0)?this.s:(this_array[0]<<16)>>16;
}

// (protected) return x s.t. r^x < DV
function bnpChunkSize(r) { return Math.floor(Math.LN2*BI_DB/Math.log(r)); }

// (public) 0 if this == 0, 1 if this > 0
function bnSigNum() {
  var this_array = this.array;
  if(this.s < 0) return -1;
  else if(this.t <= 0 || (this.t == 1 && this_array[0] <= 0)) return 0;
  else return 1;
}

// (protected) convert to radix string
function bnpToRadix(b) {
  if(b == null) b = 10;
  if(this.signum() == 0 || b < 2 || b > 36) return "0";
  var cs = this.chunkSize(b);
  var a = Math.pow(b,cs);
  var d = nbv(a), y = nbi(), z = nbi(), r = "";
  this.divRemTo(d,y,z);
  while(y.signum() > 0) {
    r = (a+z.intValue()).toString(b).substr(1) + r;
    y.divRemTo(d,y,z);
  }
  return z.intValue().toString(b) + r;
}

// (protected) convert from radix string
function bnpFromRadix(s,b) {
  this.fromInt(0);
  if(b == null) b = 10;
  var cs = this.chunkSize(b);
  var d = Math.pow(b,cs), mi = false, j = 0, w = 0;
  for(var i = 0; i < s.length; ++i) {
    var x = intAt(s,i);
    if(x < 0) {
      if(s.charAt(i) == "-" && this.signum() == 0) mi = true;
      continue;
    }
    w = b*w+x;
    if(++j >= cs) {
      this.dMultiply(d);
      this.dAddOffset(w,0);
      j = 0;
      w = 0;
    }
  }
  if(j > 0) {
    this.dMultiply(Math.pow(b,j));
    this.dAddOffset(w,0);
  }
  if(mi) BigInteger.ZERO.subTo(this,this);
}

// (protected) alternate constructor
function bnpFromNumber(a,b,c) {
  if("number" == typeof b) {
    // new BigInteger(int,int,RNG)
    if(a < 2) this.fromInt(1);
    else {
      this.fromNumber(a,c);
      if(!this.testBit(a-1))	// force MSB set
        this.bitwiseTo(BigInteger.ONE.shiftLeft(a-1),op_or,this);
      if(this.isEven()) this.dAddOffset(1,0); // force odd
      while(!this.isProbablePrime(b)) {
        this.dAddOffset(2,0);
        if(this.bitLength() > a) this.subTo(BigInteger.ONE.shiftLeft(a-1),this);
      }
    }
  }
  else {
    // todo: we don't need this.
    // new BigInteger(int,RNG)
    var x = new Array(), t = a&7;
    x.length = (a>>3)+1;
    b.nextBytes(x);
    if(t > 0) x[0] &= ((1<<t)-1); else x[0] = 0;
    this.fromString(x,256);
  }
}

// (public) convert to bigendian byte array
function bnToByteArray() {
  var this_array = this.array;
  var i = this.t, r = new Array();
  r[0] = this.s;
  var p = BI_DB-(i*BI_DB)%8, d, k = 0;
  if(i-- > 0) {
    if(p < BI_DB && (d = this_array[i]>>p) != (this.s&BI_DM)>>p)
      r[k++] = d|(this.s<<(BI_DB-p));
    while(i >= 0) {
      if(p < 8) {
        d = (this_array[i]&((1<<p)-1))<<(8-p);
        d |= this_array[--i]>>(p+=BI_DB-8);
      }
      else {
        d = (this_array[i]>>(p-=8))&0xff;
        if(p <= 0) { p += BI_DB; --i; }
      }
      if((d&0x80) != 0) d |= -256;
      if(k == 0 && (this.s&0x80) != (d&0x80)) ++k;
      if(k > 0 || d != this.s) r[k++] = d;
    }
  }
  return r;
}

function bnEquals(a) { return(this.compareTo(a)==0); }
function bnMin(a) { return(this.compareTo(a)<0)?this:a; }
function bnMax(a) { return(this.compareTo(a)>0)?this:a; }

// (protected) r = this op a (bitwise)
function bnpBitwiseTo(a,op,r) {
  var this_array = this.array;
  var a_array    = a.array;
  var r_array    = r.array;
  var i, f, m = Math.min(a.t,this.t);
  for(i = 0; i < m; ++i) r_array[i] = op(this_array[i],a_array[i]);
  if(a.t < this.t) {
    f = a.s&BI_DM;
    for(i = m; i < this.t; ++i) r_array[i] = op(this_array[i],f);
    r.t = this.t;
  }
  else {
    f = this.s&BI_DM;
    for(i = m; i < a.t; ++i) r_array[i] = op(f,a_array[i]);
    r.t = a.t;
  }
  r.s = op(this.s,a.s);
  r.clamp();
}

// (public) this & a
function op_and(x,y) { return x&y; }
function bnAnd(a) { var r = nbi(); this.bitwiseTo(a,op_and,r); return r; }

// (public) this | a
function op_or(x,y) { return x|y; }
function bnOr(a) { var r = nbi(); this.bitwiseTo(a,op_or,r); return r; }

// (public) this ^ a
function op_xor(x,y) { return x^y; }
function bnXor(a) { var r = nbi(); this.bitwiseTo(a,op_xor,r); return r; }

// (public) this & ~a
function op_andnot(x,y) { return x&~y; }
function bnAndNot(a) { var r = nbi(); this.bitwiseTo(a,op_andnot,r); return r; }

// (public) ~this
function bnNot() {
  var this_array = this.array;
  var r = nbi();
  var r_array = r.array;

  for(var i = 0; i < this.t; ++i) r_array[i] = BI_DM&~this_array[i];
  r.t = this.t;
  r.s = ~this.s;
  return r;
}

// (public) this << n
function bnShiftLeft(n) {
  var r = nbi();
  if(n < 0) this.rShiftTo(-n,r); else this.lShiftTo(n,r);
  return r;
}

// (public) this >> n
function bnShiftRight(n) {
  var r = nbi();
  if(n < 0) this.lShiftTo(-n,r); else this.rShiftTo(n,r);
  return r;
}

// return index of lowest 1-bit in x, x < 2^31
function lbit(x) {
  if(x == 0) return -1;
  var r = 0;
  if((x&0xffff) == 0) { x >>= 16; r += 16; }
  if((x&0xff) == 0) { x >>= 8; r += 8; }
  if((x&0xf) == 0) { x >>= 4; r += 4; }
  if((x&3) == 0) { x >>= 2; r += 2; }
  if((x&1) == 0) ++r;
  return r;
}

// (public) returns index of lowest 1-bit (or -1 if none)
function bnGetLowestSetBit() {
  var this_array = this.array;
  for(var i = 0; i < this.t; ++i)
    if(this_array[i] != 0) return i*BI_DB+lbit(this_array[i]);
  if(this.s < 0) return this.t*BI_DB;
  return -1;
}

// return number of 1 bits in x
function cbit(x) {
  var r = 0;
  while(x != 0) { x &= x-1; ++r; }
  return r;
}

// (public) return number of set bits
function bnBitCount() {
  var this_array = this.array;
  var r = 0, x = this.s&BI_DM;
  for(var i = 0; i < this.t; ++i) r += cbit(this_array[i]^x);
  return r;
}

// (public) true iff nth bit is set
function bnTestBit(n) {
  var this_array = this.array;
  var j = Math.floor(n/BI_DB);
  if(j >= this.t) return(this.s!=0);
  return((this_array[j]&(1<<(n%BI_DB)))!=0);
}

// (protected) this op (1<<n)
function bnpChangeBit(n,op) {
  var r = BigInteger.ONE.shiftLeft(n);
  this.bitwiseTo(r,op,r);
  return r;
}

// (public) this | (1<<n)
function bnSetBit(n) { return this.changeBit(n,op_or); }

// (public) this & ~(1<<n)
function bnClearBit(n) { return this.changeBit(n,op_andnot); }

// (public) this ^ (1<<n)
function bnFlipBit(n) { return this.changeBit(n,op_xor); }

// (protected) r = this + a
function bnpAddTo(a,r) {
  var this_array = this.array;
  var a_array = a.array;
  var r_array = r.array;
  var i = 0, c = 0, m = Math.min(a.t,this.t);
  while(i < m) {
    c += this_array[i]+a_array[i];
    r_array[i++] = c&BI_DM;
    c >>= BI_DB;
  }
  if(a.t < this.t) {
    c += a.s;
    while(i < this.t) {
      c += this_array[i];
      r_array[i++] = c&BI_DM;
      c >>= BI_DB;
    }
    c += this.s;
  }
  else {
    c += this.s;
    while(i < a.t) {
      c += a_array[i];
      r_array[i++] = c&BI_DM;
      c >>= BI_DB;
    }
    c += a.s;
  }
  r.s = (c<0)?-1:0;
  if(c > 0) r_array[i++] = c;
  else if(c < -1) r_array[i++] = BI_DV+c;
  r.t = i;
  r.clamp();
}

// (public) this + a
function bnAdd(a) { var r = nbi(); this.addTo(a,r); return r; }

// (public) this - a
function bnSubtract(a) { var r = nbi(); this.subTo(a,r); return r; }

// (public) this * a
function bnMultiply(a) { var r = nbi(); this.multiplyTo(a,r); return r; }

// (public) this / a
function bnDivide(a) { var r = nbi(); this.divRemTo(a,r,null); return r; }

// (public) this % a
function bnRemainder(a) { var r = nbi(); this.divRemTo(a,null,r); return r; }

// (public) [this/a,this%a]
function bnDivideAndRemainder(a) {
  var q = nbi(), r = nbi();
  this.divRemTo(a,q,r);
  return new Array(q,r);
}

// (protected) this *= n, this >= 0, 1 < n < DV
function bnpDMultiply(n) {
  var this_array = this.array;
  this_array[this.t] = this.am(0,n-1,this,0,0,this.t);
  ++this.t;
  this.clamp();
}

// (protected) this += n << w words, this >= 0
function bnpDAddOffset(n,w) {
  var this_array = this.array;
  while(this.t <= w) this_array[this.t++] = 0;
  this_array[w] += n;
  while(this_array[w] >= BI_DV) {
    this_array[w] -= BI_DV;
    if(++w >= this.t) this_array[this.t++] = 0;
    ++this_array[w];
  }
}

// A "null" reducer
function NullExp() {}
function nNop(x) { return x; }
function nMulTo(x,y,r) { x.multiplyTo(y,r); }
function nSqrTo(x,r) { x.squareTo(r); }

NullExp.prototype.convert = nNop;
NullExp.prototype.revert = nNop;
NullExp.prototype.mulTo = nMulTo;
NullExp.prototype.sqrTo = nSqrTo;

// (public) this^e
function bnPow(e) { return this.exp(e,new NullExp()); }

// (protected) r = lower n words of "this * a", a.t <= n
// "this" should be the larger one if appropriate.
function bnpMultiplyLowerTo(a,n,r) {
  var r_array = r.array;
  var a_array = a.array;
  var i = Math.min(this.t+a.t,n);
  r.s = 0; // assumes a,this >= 0
  r.t = i;
  while(i > 0) r_array[--i] = 0;
  var j;
  for(j = r.t-this.t; i < j; ++i) r_array[i+this.t] = this.am(0,a_array[i],r,i,0,this.t);
  for(j = Math.min(a.t,n); i < j; ++i) this.am(0,a_array[i],r,i,0,n-i);
  r.clamp();
}

// (protected) r = "this * a" without lower n words, n > 0
// "this" should be the larger one if appropriate.
function bnpMultiplyUpperTo(a,n,r) {
  var r_array = r.array;
  var a_array = a.array;
  --n;
  var i = r.t = this.t+a.t-n;
  r.s = 0; // assumes a,this >= 0
  while(--i >= 0) r_array[i] = 0;
  for(i = Math.max(n-this.t,0); i < a.t; ++i)
    r_array[this.t+i-n] = this.am(n-i,a_array[i],r,0,0,this.t+i-n);
  r.clamp();
  r.drShiftTo(1,r);
}

// Barrett modular reduction
function Barrett(m) {
  // setup Barrett
  this.r2 = nbi();
  this.q3 = nbi();
  BigInteger.ONE.dlShiftTo(2*m.t,this.r2);
  this.mu = this.r2.divide(m);
  this.m = m;
}

function barrettConvert(x) {
  if(x.s < 0 || x.t > 2*this.m.t) return x.mod(this.m);
  else if(x.compareTo(this.m) < 0) return x;
  else { var r = nbi(); x.copyTo(r); this.reduce(r); return r; }
}

function barrettRevert(x) { return x; }

// x = x mod m (HAC 14.42)
function barrettReduce(x) {
  x.drShiftTo(this.m.t-1,this.r2);
  if(x.t > this.m.t+1) { x.t = this.m.t+1; x.clamp(); }
  this.mu.multiplyUpperTo(this.r2,this.m.t+1,this.q3);
  this.m.multiplyLowerTo(this.q3,this.m.t+1,this.r2);
  while(x.compareTo(this.r2) < 0) x.dAddOffset(1,this.m.t+1);
  x.subTo(this.r2,x);
  while(x.compareTo(this.m) >= 0) x.subTo(this.m,x);
}

// r = x^2 mod m; x != r
function barrettSqrTo(x,r) { x.squareTo(r); this.reduce(r); }

// r = x*y mod m; x,y != r
function barrettMulTo(x,y,r) { x.multiplyTo(y,r); this.reduce(r); }

Barrett.prototype.convert = barrettConvert;
Barrett.prototype.revert = barrettRevert;
Barrett.prototype.reduce = barrettReduce;
Barrett.prototype.mulTo = barrettMulTo;
Barrett.prototype.sqrTo = barrettSqrTo;

// (public) this^e % m (HAC 14.85)
function bnModPow(e,m) {
  var e_array = e.array;
  var i = e.bitLength(), k, r = nbv(1), z;
  if(i <= 0) return r;
  else if(i < 18) k = 1;
  else if(i < 48) k = 3;
  else if(i < 144) k = 4;
  else if(i < 768) k = 5;
  else k = 6;
  if(i < 8)
    z = new Classic(m);
  else if(m.isEven())
    z = new Barrett(m);
  else
    z = new Montgomery(m);

  // precomputation
  var g = new Array(), n = 3, k1 = k-1, km = (1<<k)-1;
  g[1] = z.convert(this);
  if(k > 1) {
    var g2 = nbi();
    z.sqrTo(g[1],g2);
    while(n <= km) {
      g[n] = nbi();
      z.mulTo(g2,g[n-2],g[n]);
      n += 2;
    }
  }

  var j = e.t-1, w, is1 = true, r2 = nbi(), t;
  i = nbits(e_array[j])-1;
  while(j >= 0) {
    if(i >= k1) w = (e_array[j]>>(i-k1))&km;
    else {
      w = (e_array[j]&((1<<(i+1))-1))<<(k1-i);
      if(j > 0) w |= e_array[j-1]>>(BI_DB+i-k1);
    }

    n = k;
    while((w&1) == 0) { w >>= 1; --n; }
    if((i -= n) < 0) { i += BI_DB; --j; }
    if(is1) {	// ret == 1, don't bother squaring or multiplying it
      g[w].copyTo(r);
      is1 = false;
    }
    else {
      while(n > 1) { z.sqrTo(r,r2); z.sqrTo(r2,r); n -= 2; }
      if(n > 0) z.sqrTo(r,r2); else { t = r; r = r2; r2 = t; }
      z.mulTo(r2,g[w],r);
    }

    while(j >= 0 && (e_array[j]&(1<<i)) == 0) {
      z.sqrTo(r,r2); t = r; r = r2; r2 = t;
      if(--i < 0) { i = BI_DB-1; --j; }
    }
  }
  return z.revert(r);
}

// (public) gcd(this,a) (HAC 14.54)
function bnGCD(a) {
  var x = (this.s<0)?this.negate():this.clone();
  var y = (a.s<0)?a.negate():a.clone();
  if(x.compareTo(y) < 0) { var t = x; x = y; y = t; }
  var i = x.getLowestSetBit(), g = y.getLowestSetBit();
  if(g < 0) return x;
  if(i < g) g = i;
  if(g > 0) {
    x.rShiftTo(g,x);
    y.rShiftTo(g,y);
  }
  while(x.signum() > 0) {
    if((i = x.getLowestSetBit()) > 0) x.rShiftTo(i,x);
    if((i = y.getLowestSetBit()) > 0) y.rShiftTo(i,y);
    if(x.compareTo(y) >= 0) {
      x.subTo(y,x);
      x.rShiftTo(1,x);
    }
    else {
      y.subTo(x,y);
      y.rShiftTo(1,y);
    }
  }
  if(g > 0) y.lShiftTo(g,y);
  return y;
}

// (protected) this % n, n < 2^26
function bnpModInt(n) {
  var this_array = this.array;
  if(n <= 0) return 0;
  var d = BI_DV%n, r = (this.s<0)?n-1:0;
  if(this.t > 0)
    if(d == 0) r = this_array[0]%n;
    else for(var i = this.t-1; i >= 0; --i) r = (d*r+this_array[i])%n;
  return r;
}

// (public) 1/this % m (HAC 14.61)
function bnModInverse(m) {
  var ac = m.isEven();
  if((this.isEven() && ac) || m.signum() == 0) return BigInteger.ZERO;
  var u = m.clone(), v = this.clone();
  var a = nbv(1), b = nbv(0), c = nbv(0), d = nbv(1);
  while(u.signum() != 0) {
    while(u.isEven()) {
      u.rShiftTo(1,u);
      if(ac) {
        if(!a.isEven() || !b.isEven()) { a.addTo(this,a); b.subTo(m,b); }
        a.rShiftTo(1,a);
      }
      else if(!b.isEven()) b.subTo(m,b);
      b.rShiftTo(1,b);
    }
    while(v.isEven()) {
      v.rShiftTo(1,v);
      if(ac) {
        if(!c.isEven() || !d.isEven()) { c.addTo(this,c); d.subTo(m,d); }
        c.rShiftTo(1,c);
      }
      else if(!d.isEven()) d.subTo(m,d);
      d.rShiftTo(1,d);
    }
    if(u.compareTo(v) >= 0) {
      u.subTo(v,u);
      if(ac) a.subTo(c,a);
      b.subTo(d,b);
    }
    else {
      v.subTo(u,v);
      if(ac) c.subTo(a,c);
      d.subTo(b,d);
    }
  }
  if(v.compareTo(BigInteger.ONE) != 0) return BigInteger.ZERO;
  if(d.compareTo(m) >= 0) return d.subtract(m);
  if(d.signum() < 0) d.addTo(m,d); else return d;
  if(d.signum() < 0) return d.add(m); else return d;
}

var lowprimes = [2,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,83,89,97,101,103,107,109,113,127,131,137,139,149,151,157,163,167,173,179,181,191,193,197,199,211,223,227,229,233,239,241,251,257,263,269,271,277,281,283,293,307,311,313,317,331,337,347,349,353,359,367,373,379,383,389,397,401,409,419,421,431,433,439,443,449,457,461,463,467,479,487,491,499,503,509];
var lplim = (1<<26)/lowprimes[lowprimes.length-1];

// (public) test primality with certainty >= 1-.5^t
function bnIsProbablePrime(t) {
  var i, x = this.abs();
  var x_array = x.array;
  if(x.t == 1 && x_array[0] <= lowprimes[lowprimes.length-1]) {
    for(i = 0; i < lowprimes.length; ++i)
      if(x_array[0] == lowprimes[i]) return true;
    return false;
  }
  if(x.isEven()) return false;
  i = 1;
  while(i < lowprimes.length) {
    var m = lowprimes[i], j = i+1;
    while(j < lowprimes.length && m < lplim) m *= lowprimes[j++];
    m = x.modInt(m);
    while(i < j) if(m%lowprimes[i++] == 0) return false;
  }
  return x.millerRabin(t);
}

// (protected) true if probably prime (HAC 4.24, Miller-Rabin)
function bnpMillerRabin(t) {
  var n1 = this.subtract(BigInteger.ONE);
  var k = n1.getLowestSetBit();
  if(k <= 0) return false;
  var r = n1.shiftRight(k);
  t = (t+1)>>1;
  if(t > lowprimes.length) t = lowprimes.length;
  var a = nbi();
  for(var i = 0; i < t; ++i) {
    a.fromInt(lowprimes[i]);
    var y = a.modPow(r,this);
    if(y.compareTo(BigInteger.ONE) != 0 && y.compareTo(n1) != 0) {
      var j = 1;
      while(j++ < k && y.compareTo(n1) != 0) {
        y = y.modPowInt(2,this);
        if(y.compareTo(BigInteger.ONE) == 0) return false;
      }
      if(y.compareTo(n1) != 0) return false;
    }
  }
  return true;
};

// protected
BigInteger.prototype.chunkSize = bnpChunkSize;
BigInteger.prototype.toRadix = bnpToRadix;
BigInteger.prototype.fromRadix = bnpFromRadix;
BigInteger.prototype.fromNumber = bnpFromNumber;
BigInteger.prototype.bitwiseTo = bnpBitwiseTo;
BigInteger.prototype.changeBit = bnpChangeBit;
BigInteger.prototype.addTo = bnpAddTo;
BigInteger.prototype.dMultiply = bnpDMultiply;
BigInteger.prototype.dAddOffset = bnpDAddOffset;
BigInteger.prototype.multiplyLowerTo = bnpMultiplyLowerTo;
BigInteger.prototype.multiplyUpperTo = bnpMultiplyUpperTo;
BigInteger.prototype.modInt = bnpModInt;
BigInteger.prototype.millerRabin = bnpMillerRabin;

// public
BigInteger.prototype.clone = bnClone;
BigInteger.prototype.intValue = bnIntValue;
BigInteger.prototype.byteValue = bnByteValue;
BigInteger.prototype.shortValue = bnShortValue;
BigInteger.prototype.signum = bnSigNum;
BigInteger.prototype.toByteArray = bnToByteArray;
BigInteger.prototype.equals = bnEquals;
BigInteger.prototype.min = bnMin;
BigInteger.prototype.max = bnMax;
BigInteger.prototype.and = bnAnd;
BigInteger.prototype.or = bnOr;
BigInteger.prototype.xor = bnXor;
BigInteger.prototype.andNot = bnAndNot;
BigInteger.prototype.not = bnNot;
BigInteger.prototype.shiftLeft = bnShiftLeft;
BigInteger.prototype.shiftRight = bnShiftRight;
BigInteger.prototype.getLowestSetBit = bnGetLowestSetBit;
BigInteger.prototype.bitCount = bnBitCount;
BigInteger.prototype.testBit = bnTestBit;
BigInteger.prototype.setBit = bnSetBit;
BigInteger.prototype.clearBit = bnClearBit;
BigInteger.prototype.flipBit = bnFlipBit;
BigInteger.prototype.add = bnAdd;
BigInteger.prototype.subtract = bnSubtract;
BigInteger.prototype.multiply = bnMultiply;
BigInteger.prototype.divide = bnDivide;
BigInteger.prototype.remainder = bnRemainder;
BigInteger.prototype.divideAndRemainder = bnDivideAndRemainder;
BigInteger.prototype.modPow = bnModPow;
BigInteger.prototype.modInverse = bnModInverse;
BigInteger.prototype.pow = bnPow;
BigInteger.prototype.gcd = bnGCD;
BigInteger.prototype.isProbablePrime = bnIsProbablePrime;
BigInteger.prototype.am = am4;

// end of stuff copied from github.
},{}],50:[function(require,module,exports){
/**
sprintf() for JavaScript 0.7-beta1
http://www.diveintojavascript.com/projects/javascript-sprintf

Copyright (c) Alexandru Marasteanu <alexaholic [at) gmail (dot] com>
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:
    * Redistributions of source code must retain the above copyright
      notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above copyright
      notice, this list of conditions and the following disclaimer in the
      documentation and/or other materials provided with the distribution.
    * Neither the name of sprintf() for JavaScript nor the
      names of its contributors may be used to endorse or promote products
      derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL Alexandru Marasteanu BE LIABLE FOR ANY
DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.


Changelog:
2010.11.07 - 0.7-beta1-node
  - converted it to a node.js compatible module

2010.09.06 - 0.7-beta1
  - features: vsprintf, support for named placeholders
  - enhancements: format cache, reduced global namespace pollution

2010.05.22 - 0.6:
 - reverted to 0.4 and fixed the bug regarding the sign of the number 0
 Note:
 Thanks to Raphael Pigulla <raph (at] n3rd [dot) org> (http://www.n3rd.org/)
 who warned me about a bug in 0.5, I discovered that the last update was
 a regress. I appologize for that.

2010.05.09 - 0.5:
 - bug fix: 0 is now preceeded with a + sign
 - bug fix: the sign was not at the right position on padded results (Kamal Abdali)
 - switched from GPL to BSD license

2007.10.21 - 0.4:
 - unit test and patch (David Baird)

2007.09.17 - 0.3:
 - bug fix: no longer throws exception on empty paramenters (Hans Pufal)

2007.09.11 - 0.2:
 - feature: added argument swapping

2007.04.03 - 0.1:
 - initial release
**/

var sprintf = (function() {
	function get_type(variable) {
		return Object.prototype.toString.call(variable).slice(8, -1).toLowerCase();
	}
	function str_repeat(input, multiplier) {
		for (var output = []; multiplier > 0; output[--multiplier] = input) {/* do nothing */}
		return output.join('');
	}

	var str_format = function() {
		if (!str_format.cache.hasOwnProperty(arguments[0])) {
			str_format.cache[arguments[0]] = str_format.parse(arguments[0]);
		}
		return str_format.format.call(null, str_format.cache[arguments[0]], arguments);
	};

	// convert object to simple one line string without indentation or
	// newlines. Note that this implementation does not print array
	// values to their actual place for sparse arrays. 
	//
	// For example sparse array like this
	//    l = []
	//    l[4] = 1
	// Would be printed as "[1]" instead of "[, , , , 1]"
	// 
	// If argument 'seen' is not null and array the function will check for 
	// circular object references from argument.
	str_format.object_stringify = function(obj, depth, maxdepth, seen) {
		var str = '';
		if (obj != null) {
			switch( typeof(obj) ) {
			case 'function': 
				return '[Function' + (obj.name ? ': '+obj.name : '') + ']';
			    break;
			case 'object':
				if ( obj instanceof Error) { return '[' + obj.toString() + ']' };
				if (depth >= maxdepth) return '[Object]'
				if (seen) {
					// add object to seen list
					seen = seen.slice(0)
					seen.push(obj);
				}
				if (obj.length != null) { //array
					str += '[';
					var arr = []
					for (var i in obj) {
						if (seen && seen.indexOf(obj[i]) >= 0) arr.push('[Circular]');
						else arr.push(str_format.object_stringify(obj[i], depth+1, maxdepth, seen));
					}
					str += arr.join(', ') + ']';
				} else if ('getMonth' in obj) { // date
					return 'Date(' + obj + ')';
				} else { // object
					str += '{';
					var arr = []
					for (var k in obj) { 
						if(obj.hasOwnProperty(k)) {
							if (seen && seen.indexOf(obj[k]) >= 0) arr.push(k + ': [Circular]');
							else arr.push(k +': ' +str_format.object_stringify(obj[k], depth+1, maxdepth, seen)); 
						}
					}
					str += arr.join(', ') + '}';
				}
				return str;
				break;
			case 'string':				
				return '"' + obj + '"';
				break
			}
		}
		return '' + obj;
	}

	str_format.format = function(parse_tree, argv) {
		var cursor = 1, tree_length = parse_tree.length, node_type = '', arg, output = [], i, k, match, pad, pad_character, pad_length;
		for (i = 0; i < tree_length; i++) {
			node_type = get_type(parse_tree[i]);
			if (node_type === 'string') {
				output.push(parse_tree[i]);
			}
			else if (node_type === 'array') {
				match = parse_tree[i]; // convenience purposes only
				if (match[2]) { // keyword argument
					arg = argv[cursor];
					for (k = 0; k < match[2].length; k++) {
						if (!arg.hasOwnProperty(match[2][k])) {
							throw new Error(sprintf('[sprintf] property "%s" does not exist', match[2][k]));
						}
						arg = arg[match[2][k]];
					}
				}
				else if (match[1]) { // positional argument (explicit)
					arg = argv[match[1]];
				}
				else { // positional argument (implicit)
					arg = argv[cursor++];
				}

				if (/[^sO]/.test(match[8]) && (get_type(arg) != 'number')) {
					throw new Error(sprintf('[sprintf] expecting number but found %s "' + arg + '"', get_type(arg)));
				}
				switch (match[8]) {
					case 'b': arg = arg.toString(2); break;
					case 'c': arg = String.fromCharCode(arg); break;
					case 'd': arg = parseInt(arg, 10); break;
					case 'e': arg = match[7] ? arg.toExponential(match[7]) : arg.toExponential(); break;
					case 'f': arg = match[7] ? parseFloat(arg).toFixed(match[7]) : parseFloat(arg); break;
				    case 'O': arg = str_format.object_stringify(arg, 0, parseInt(match[7]) || 5); break;
					case 'o': arg = arg.toString(8); break;
					case 's': arg = ((arg = String(arg)) && match[7] ? arg.substring(0, match[7]) : arg); break;
					case 'u': arg = Math.abs(arg); break;
					case 'x': arg = arg.toString(16); break;
					case 'X': arg = arg.toString(16).toUpperCase(); break;
				}
				arg = (/[def]/.test(match[8]) && match[3] && arg >= 0 ? '+'+ arg : arg);
				pad_character = match[4] ? match[4] == '0' ? '0' : match[4].charAt(1) : ' ';
				pad_length = match[6] - String(arg).length;
				pad = match[6] ? str_repeat(pad_character, pad_length) : '';
				output.push(match[5] ? arg + pad : pad + arg);
			}
		}
		return output.join('');
	};

	str_format.cache = {};

	str_format.parse = function(fmt) {
		var _fmt = fmt, match = [], parse_tree = [], arg_names = 0;
		while (_fmt) {
			if ((match = /^[^\x25]+/.exec(_fmt)) !== null) {
				parse_tree.push(match[0]);
			}
			else if ((match = /^\x25{2}/.exec(_fmt)) !== null) {
				parse_tree.push('%');
			}
			else if ((match = /^\x25(?:([1-9]\d*)\$|\(([^\)]+)\))?(\+)?(0|'[^$])?(-)?(\d+)?(?:\.(\d+))?([b-fosOuxX])/.exec(_fmt)) !== null) {
				if (match[2]) {
					arg_names |= 1;
					var field_list = [], replacement_field = match[2], field_match = [];
					if ((field_match = /^([a-z_][a-z_\d]*)/i.exec(replacement_field)) !== null) {
						field_list.push(field_match[1]);
						while ((replacement_field = replacement_field.substring(field_match[0].length)) !== '') {
							if ((field_match = /^\.([a-z_][a-z_\d]*)/i.exec(replacement_field)) !== null) {
								field_list.push(field_match[1]);
							}
							else if ((field_match = /^\[(\d+)\]/.exec(replacement_field)) !== null) {
								field_list.push(field_match[1]);
							}
							else {
								throw new Error('[sprintf] ' + replacement_field);
							}
						}
					}
					else {
                        throw new Error('[sprintf] ' + replacement_field);
					}
					match[2] = field_list;
				}
				else {
					arg_names |= 2;
				}
				if (arg_names === 3) {
					throw new Error('[sprintf] mixing positional and named placeholders is not (yet) supported');
				}
				parse_tree.push(match);
			}
			else {
				throw new Error('[sprintf] ' + _fmt);
			}
			_fmt = _fmt.substring(match[0].length);
		}
		return parse_tree;
	};

	return str_format;
})();

var vsprintf = function(fmt, argv) {
	var argvClone = argv.slice();
	argvClone.unshift(fmt);
	return sprintf.apply(null, argvClone);
};

module.exports = sprintf;
sprintf.sprintf = sprintf;
sprintf.vsprintf = vsprintf;

},{}],51:[function(require,module,exports){
/* Copyright 2010 Membase, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

/*jshint node:true*/


/**
 * Convert a 16-bit quantity (short integer) from host byte order to network byte order (Little-Endian to Big-Endian).
 *
 * @param {Array|Buffer} b Array of octets or a nodejs Buffer
 * @param {number} i Zero-based index at which to write into b
 * @param {number} v Value to convert
 */
exports.htons = function(b, i, v) {
	b[i] = (0xff & (v >> 8));
	b[i + 1] = (0xff & (v));
};


/**
 * Convert a 16-bit quantity (short integer) from network byte order to host byte order (Big-Endian to Little-Endian).
 *
 * @param {Array|Buffer} b Array of octets or a nodejs Buffer to read value from
 * @param {number} i Zero-based index at which to read from b
 * @returns {number}
 */
exports.ntohs = function(b, i) {
	return ((0xff & b[i]) << 8) | 
	       ((0xff & b[i + 1]));
};


/**
 * Convert a 16-bit quantity (short integer) from network byte order to host byte order (Big-Endian to Little-Endian).
 *
 * @param {string} s String to read value from
 * @param {number} i Zero-based index at which to read from s
 * @returns {number}
 */
exports.ntohsStr = function(s, i) {
	return ((0xff & s.charCodeAt(i)) << 8) |
	       ((0xff & s.charCodeAt(i + 1)));
};


/**
 * Convert a 32-bit quantity (long integer) from host byte order to network byte order (Little-Endian to Big-Endian).
 *
 * @param {Array|Buffer} b Array of octets or a nodejs Buffer
 * @param {number} i Zero-based index at which to write into b
 * @param {number} v Value to convert
 */
exports.htonl = function(b, i, v) {
	b[i] = (0xff & (v >> 24));
	b[i + 1] = (0xff & (v >> 16));
	b[i + 2] = (0xff & (v >> 8));
	b[i + 3] = (0xff & (v));
};


/**
 * Convert a 32-bit quantity (long integer) from network byte order to host byte order (Big-Endian to Little-Endian).
 *
 * @param {Array|Buffer} b Array of octets or a nodejs Buffer to read value from
 * @param {number} i Zero-based index at which to read from b
 * @returns {number}
 */
exports.ntohl = function(b, i) {
	return ((0xff & b[i]) << 24) |
	       ((0xff & b[i + 1]) << 16) |
	       ((0xff & b[i + 2]) << 8) |
	       ((0xff & b[i + 3]));
};


/**
 * Convert a 32-bit quantity (long integer) from network byte order to host byte order (Big-Endian to Little-Endian).
 *
 * @param {string} s String to read value from
 * @param {number} i Zero-based index at which to read from s
 * @returns {number}
 */
exports.ntohlStr = function(s, i) {
	return ((0xff & s.charCodeAt(i)) << 24) |
	       ((0xff & s.charCodeAt(i + 1)) << 16) |
	       ((0xff & s.charCodeAt(i + 2)) << 8) |
	       ((0xff & s.charCodeAt(i + 3)));
};

},{}],52:[function(require,module,exports){
module.exports={
  "name": "bitcore-p2p-browserify",
  "version": "0.14.0",
  "description": "A fork of bitpay/bitcore-p2p, with Browserify support",
  "author": {
    "name": "BitPay",
    "email": "dev@bitpay.com"
  },
  "main": "index.js",
  "scripts": {
    "lint": "gulp lint",
    "test": "gulp test",
    "coverage": "gulp coverage",
    "build": "gulp"
  },
  "contributors": [
    {
      "name": "Yemel Jardi",
      "email": "yemel@bitpay.com"
    },
    {
      "name": "Braydon Fuller",
      "email": "braydon@bitpay.com"
    },
    {
      "name": "Ryan X. Charles",
      "email": "ryan@bitpay.com"
    },
    {
      "name": "Eric Martindale",
      "email": "eric@bitpay.com"
    },
    {
      "name": "Philip Hutchins",
      "email": "philip@bitpay.com"
    },
    {
      "name": "Manuel Araoz",
      "email": "maraoz@bitpay.com"
    },
    {
      "name": "Esteban Ordano",
      "email": "eordano@gmail.com"
    },
    {
      "name": "Elichai Turkel"
    }
  ],
  "keywords": [
    "bitcoin",
    "bitcore"
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/bitpay/bitcore-p2p.git"
  },
  "dependencies": {
    "bitcore": "^0.12.0",
    "bloom-filter": "^0.2.0",
    "buffers": "^0.1.1",
    "socks5-client": "^0.3.6"
  },
  "devDependencies": {
    "bitcore-build": "git://github.com/bitpay/bitcore-build.git",
    "brfs": "^1.2.0",
    "chai": "~1.10.0",
    "gulp": "^3.8.10",
    "sinon": "^1.12.2"
  },
  "license": "MIT",
  "gitHead": "5d31001b77f70ed8db894ca15a847ebb8caa6e25",
  "bugs": {
    "url": "https://github.com/bitpay/bitcore-p2p/issues"
  },
  "homepage": "https://github.com/bitpay/bitcore-p2p",
  "_id": "bitcore-p2p-browserify@0.14.0",
  "_shasum": "0c41895fbd30dd62722cbb560e2cf0c1d2521ee4",
  "_from": "bitcore-p2p-browserify@",
  "_npmVersion": "2.7.4",
  "_nodeVersion": "0.12.2",
  "_npmUser": {
    "name": "mappum",
    "email": "mappum@gmail.com"
  },
  "maintainers": [
    {
      "name": "mappum",
      "email": "mappum@gmail.com"
    }
  ],
  "dist": {
    "shasum": "0c41895fbd30dd62722cbb560e2cf0c1d2521ee4",
    "tarball": "http://registry.npmjs.org/bitcore-p2p-browserify/-/bitcore-p2p-browserify-0.14.0.tgz"
  },
  "directories": {},
  "_resolved": "https://registry.npmjs.org/bitcore-p2p-browserify/-/bitcore-p2p-browserify-0.14.0.tgz"
}

},{}],"bitcore-p2p":[function(require,module,exports){
var bitcore = require('bitcore');
bitcore.P2P = require('./lib');

module.exports = bitcore.P2P;

},{"./lib":13,"bitcore":"bitcore"}]},{},[]);
