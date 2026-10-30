/**
 * BiliSR video-page Protobuf wire editor with bounded gzip support.
 * Scope: Bilibili video-page gRPC methods View, AIRelateAsync, RelatesFeed, ViewProgress.
 * No user-data exfiltration, network, cookies, telemetry, subscription/unlock changes.
 * Fails OPEN for invalid/oversized gzip, unknown framing, or malformed protobuf.
 * Bundled fflate 0.8.2 (MIT) provides streaming decompression; see vendor license.
 *
 * Derived field numbers from public Bilibili protobuf schemas and independent
 * public test-fixture research. NOT a bundled/modified Biliverse script.
 * Compatible intent: Shadowrocket http-response, binary-body-mode=1.
 * Device runtime behavior has not been verified.
 */
(function () {
  'use strict';

  var MAX_BYTES = 262144;
  var MAX_FIELDS = 10000;
  var MAX_DEPTH = 10;

  function bytesOf(value) {
    if (value instanceof Uint8Array) return value;
    if (typeof ArrayBuffer !== 'undefined') {
      if (value instanceof ArrayBuffer) return new Uint8Array(value);
      if (ArrayBuffer.isView && ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      }
    }
    return null;
  }

  function varint(b, start, end) {
    // Used only for tags and lengths, not uint64 message content.
    var x = 0, mul = 1, pos = start;
    while (pos < end && pos - start < 5) {
      var c = b[pos++];
      x += (c & 0x7f) * mul;
      if (!(c & 0x80)) {
        if (!Number.isSafeInteger(x)) throw new Error('unsafe varint');
        return {value: x, next: pos};
      }
      mul *= 128;
    }
    throw new Error('invalid/oversized tag or length');
  }
  function skipVarint(b, pos, end) {
    for (var i = 0; i < 10 && pos < end; i++) {
      if (!(b[pos++] & 0x80)) return pos;
    }
    throw new Error('invalid varint payload');
  }
  function fields(b, depth) {
    if (depth > MAX_DEPTH) throw new Error('nesting too deep');
    var out = [], p = 0;
    while (p < b.length) {
      if (out.length >= MAX_FIELDS) throw new Error('too many fields');
      var start = p;
      var tag = varint(b, p, b.length); p = tag.next;
      var no = Math.floor(tag.value / 8), wire = tag.value & 7;
      if (no < 1 || no > 536870911) throw new Error('invalid field number');
      var valueStart = p, valueEnd;
      switch (wire) {
        case 0: p = skipVarint(b, p, b.length); valueEnd = p; break;
        case 1: p += 8; valueEnd = p; break;
        case 2:
          var l = varint(b, p, b.length); p = l.next;
          valueStart = p;
          if (l.value > b.length - p) throw new Error('length beyond message');
          p += l.value; valueEnd = p; break;
        case 5: p += 4; valueEnd = p; break;
        default: throw new Error('unsupported wire type ' + wire);
      }
      if (p > b.length) throw new Error('field beyond message');
      out.push({no:no, wire:wire, start:start, end:p, valueStart:valueStart, valueEnd:valueEnd});
    }
    return out;
  }
  function readInt(b, field) {
    if (field.wire !== 0) return null;
    try { return varint(b, field.valueStart, field.valueEnd).value; }
    catch (_) { return null; }
  }
  function encodeVarint(value) {
    var a = [];
    do {
      var v = value % 128;
      value = Math.floor(value / 128);
      a.push(value ? v | 0x80 : v);
    } while (value);
    return new Uint8Array(a);
  }
  function concat(parts) {
    var len = 0;
    for (var i = 0; i < parts.length; i++) len += parts[i].length;
    if (len > MAX_BYTES) throw new Error('output too large');
    var out = new Uint8Array(len), p = 0;
    for (var j = 0; j < parts.length; j++) {out.set(parts[j], p);p += parts[j].length;}
    return out;
  }
  function encodeField(no, payload) {
    return concat([encodeVarint(no*8 + 2), encodeVarint(payload.length), payload]);
  }
  function rewrite(b, fn, depth) {
    var fs = fields(b, depth), pieces = [], changes = 0;
    for (var i = 0; i < fs.length; i++) {
      var f = fs[i], orig = b.subarray(f.start, f.end);
      var replacement = fn(f, b, depth);
      if (replacement === null) { changes++; continue; }
      if (replacement instanceof Uint8Array) {
        if (replacement !== orig) changes++;
        pieces.push(replacement);
      } else {
        pieces.push(orig);
      }
    }
    if (changes === 0) return b;
    return concat(pieces);
  }
  function nested(parent, f, parentDepth, transform) {
    if (f.wire !== 2) return undefined;
    var before = parent.subarray(f.valueStart, f.valueEnd);
    var after = transform(before, parentDepth + 1);
    return after === before ? undefined : encodeField(f.no, after);
  }
  function anyNonEmptyField(b, number, wire) {
    return fields(b, 5).some(function(f) {
      return f.no === number && (wire === undefined || f.wire === wire) &&
        (f.wire !== 2 || f.valueEnd > f.valueStart);
    });
  }

  // RelateCard: enum type=1; CMStock=11; BasicInfo=12 / uniqueId=6.
  function isAdCard(card) {
    var fs = fields(card, 5), type = null, cm = false, basic = false;
    for (var i=0;i<fs.length;i++) {
      var f=fs[i];
      if (f.no===1) type=readInt(card,f);
      if (f.no===11 && f.wire===2) cm=true;
      if (f.no===12 && f.wire===2) {
        basic = anyNonEmptyField(card.subarray(f.valueStart,f.valueEnd), 6, 2);
      }
    }
    return type === 4 || type === 5 || type === 11 || cm || basic;
  }
  function filterCards(message, depth) {
    return rewrite(message, function(f, b) {
      if (f.no !== 1 || f.wire !== 2) return undefined;
      var card = b.subarray(f.valueStart, f.valueEnd);
      return isAdCard(card) ? null : undefined;
    }, depth);
  }
  function relatesModule(data, depth) {
    var fs = fields(data, depth), type = null, active = null;
    for (var i=0;i<fs.length;i++) {
      var f=fs[i];
      if (f.no === 1) type = readInt(data,f);
      // Conservative: last oneof-field encountered among known module variants.
      if (f.no >= 22 && f.no <= 70 && f.wire === 2) active = f.no;
    }
    if (type !== 28 || active !== 22) return data;
    return rewrite(data,function(f,b,d) {
      return f.no===22 ? nested(b,f,d,filterCards) : undefined;
    },depth);
  }
  function tabModules(data, depth) {
    return rewrite(data,function(f,b,d){
      return f.no===1 ? nested(b,f,d,relatesModule) : undefined;
    },depth);
  }
  // AIRelateReply.tab.modules: field 2 -> repeated modules field 1
  function aiRelate(data, depth) {
    return rewrite(data,function(f,b,d){
      if (f.no===1 && f.wire===2) return null; // CM advertisement
      if (f.no===2) return nested(b,f,d,tabModules);
    },depth);
  }
  // ViewReply.tab (5) -> Tab.tab_module (1) -> TabModule.introduction (2)
  // -> IntroductionTab.modules (2) -> Module.type(1), relates(22).
  function introduction(data, depth) {
    return rewrite(data,function(f,b,d){
      if (f.no !== 2 || f.wire !== 2) return undefined;
      var module = b.subarray(f.valueStart,f.valueEnd);
      var typeField = fields(module,d+1).filter(function(x){return x.no===1 && x.wire===0;});
      var type = typeField.length ? readInt(module,typeField[typeField.length-1]):null;
      if (type===18 || type===29 || type===55) return null;
      return nested(b,f,d,relatesModule);
    },depth);
  }
  function tabModule(data, depth) {
    return rewrite(data,function(f,b,d){
      return f.no===2 ? nested(b,f,d,introduction) : undefined;
    },depth);
  }
  function viewTab(data, depth) {
    return rewrite(data,function(f,b,d){
      return f.no===1 ? nested(b,f,d,tabModule) : undefined;
    },depth);
  }
  function view(data, depth) {
    return rewrite(data,function(f,b,d){
      if (f.no===7 && f.wire===2) return null; // top-level CM
      return f.no===5 ? nested(b,f,d,viewTab) : undefined;
    },depth);
  }
  function relateFeed(data, depth) {return filterCards(data,depth);}
  function videoGuide(data, depth) {
    // Only remove 'material' repeated field; keep contract card and video points.
    return rewrite(data,function(f){return f.no===1 && f.wire===2?null:undefined;},depth);
  }
  function progress(data, depth) {
    return rewrite(data,function(f,b,d){return f.no===1?nested(b,f,d,videoGuide):undefined;},depth);
  }
  function little32(b, p) {
    return (b[p] + b[p+1]*256 + b[p+2]*65536 + b[p+3]*16777216) >>> 0;
  }
  function gunzipBounded(z) {
    var limit = MAX_BYTES - 5;
    if (z.length < 18 || z[0] !== 31 || z[1] !== 139 || z[2] !== 8) throw new Error('invalid gzip header');
    // Reserved flags and header-CRC variants are not supported; preserve those responses.
    if (z[3] & 226) throw new Error('unsupported gzip header flags');
    var expected = little32(z, z.length-4);
    if (expected > limit) throw new Error('gzip decoded size limit');
    var parts = [], total = 0, crc = 0xffffffff, ended = false;
    var table = new Uint32Array(256);
    for (var i=0; i<256; i++) {
      var c=i;
      for(var j=0;j<8;j++) c=(c>>>1)^((c&1)?0xedb88320:0);
      table[i]=c>>>0;
    }
    var decoder = new fflate.Gunzip(function(chunk, final) {
      total += chunk.length;
      if (total > limit) throw new Error('gzip decoded size limit');
      for(var k=0;k<chunk.length;k++) crc=(crc>>>8)^table[(crc^chunk[k])&255];
      parts.push(chunk);
      if(final) ended=true;
    });
    decoder.onmember=function(){throw new Error('multiple gzip members unsupported');};
    // Small input slices bound intermediate expansion before each output-limit check.
    for(var p=0;p<z.length;p+=128) decoder.push(z.subarray(p,Math.min(p+128,z.length)),false);
    decoder.push(new Uint8Array(0),true);
    if(!ended || total!==expected || ((crc^0xffffffff)>>>0)!==little32(z,z.length-8)) throw new Error('gzip checksum/size mismatch');
    return concat(parts);
  }
  function processFrame(original, method, encoding) {
    if (original.length < 5 || original.length > MAX_BYTES) return null;
    if (original[0] !== 0 && original[0] !== 1) return null;
    var length = (original[1] * 16777216 + (original[2]<<16) + (original[3]<<8) + original[4]) >>> 0;
    if (length !== original.length - 5) return null;
    var body = original.subarray(5), result;
    if (original[0] === 1) {
      if (String(encoding).toLowerCase() !== 'gzip') { return null; }
      body = gunzipBounded(body);
    }
    switch (method) {
      case 'View': result = view(body,0); break;
      case 'AIRelateAsync': result = aiRelate(body,0); break;
      case 'RelatesFeed': result = relateFeed(body,0); break;
      case 'ViewProgress': result = progress(body,0); break;
      default: return null;
    }
    if (result === body) return null;
    var out = new Uint8Array(result.length + 5), n=result.length;
    out[0]=0;out[1]=(n>>>24)&255;out[2]=(n>>>16)&255;out[3]=(n>>>8)&255;out[4]=n&255;
    out.set(result,5);
    return out;
  }
  function getHeader(headers, name) {
    if (!headers) return '';
    for (var k in headers) {
      if (Object.prototype.hasOwnProperty.call(headers,k) && k.toLowerCase()===name.toLowerCase()) return String(headers[k]);
    }
    return '';
  }
  function statusHeaders(requestHeaders, responseHeaders, outputLength) {
    var h=Object.assign({},responseHeaders || {});
    var ua = getHeader(requestHeaders,'user-agent');
    var moss=getHeader(requestHeaders,'x-bili-moss-engine-type');
    var hasStatus = getHeader(h,'grpc-status') !== '';
    if (!hasStatus && (/bili-blue\//i.test(ua) || (moss==='1' && /bili-(universal|hd2|overseas)\//i.test(ua)))) {
      h['grpc-status']='0';
    }
    if (/bili-inter\//i.test(ua)) {
      for (var key in h) if (key.toLowerCase()==='grpc-status' && h[key]==='0') delete h[key];
    }
    for (var key2 in h) {
      if (key2.toLowerCase()==='content-length') h[key2]=String(outputLength);
      if (key2.toLowerCase()==='grpc-encoding') delete h[key2];
    }
    return h;
  }

  try {
    var url=($request && $request.url) || '';
    var match=url.match(/^https:\/\/(?:grpc\.biliapi\.net|app\.biliapi\.net|app\.bilibili\.com|app\.biliapi\.com)\/bilibili\.app\.viewunite\.v1\.View\/(View|AIRelateAsync|RelatesFeed|ViewProgress)(?:\?.*)?$/);
    if (!match) { $done({}); return; }
    var contentType = getHeader($response && $response.headers,'content-type');
    if (contentType && !/^application\/grpc(?:\+proto)?(?:;|$)/i.test(contentType)) {
      $done({}); return;
    }
    var raw=bytesOf($response && $response.body);
    if (!raw) raw=bytesOf($response && $response.bodyBytes);
    if (!raw) { $done({}); return; }
    var changed=processFrame(raw,match[1],getHeader($response.headers,'grpc-encoding'));
    if (changed) {
      // Shadowrocket/Surge binary-body-mode=1 expects Uint8Array in body.
      $done({body:changed,headers:statusHeaders($request.headers,$response.headers,changed.length)});
    } else {
      $done({});
    }
  } catch (e) {
    $done({});
  }
})();
