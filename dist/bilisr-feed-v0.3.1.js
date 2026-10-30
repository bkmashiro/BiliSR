/* BiliSR
MIT License

Copyright (c) 2026 bkmashiro

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/
/* BiliSR homepage feed filter. Response-only JSON, no requests or telemetry.
 * Field references: Biliverse/ADBlock v0.7.5 src/process/Response.mjs.
 * Independent small implementation. Ordinary/unknown recommendations are preserved.
 */
(function () {
  'use strict';
  function object(v) { return v && typeof v==='object' && !Array.isArray(v); }
  var result={};
  try {
    var match=String($request.url||'').match(/^https:\/\/app\.(?:bilibili\.com|biliapi\.net|biliapi\.com)(\/x\/v2\/feed\/index)(?:\?[^#]*)?$/);
    if(!match) { $done({}); return; }
    var path=match[1],raw=$response.body;
    // Engineering caps: 4,194,304 JS string code units here; 4 MiB input bytes in the module.
    if(typeof raw!=='string' || raw.length>4194304) {
      $done({});return;
    }
    var doc=JSON.parse(raw);
    if(!object(doc) || doc.code!==0 || !object(doc.data)) { $done({}); return; }
    var data=doc.data,ads=0,banners=0;
    if(path==='/x/v2/feed/index' && Array.isArray(data.items)) {
      var before=data.items;
      var items=[];
      before.forEach(function(item){
        if(!object(item)){items.push(item);return;}
        var type=item.card_type,goto=item.card_goto;
        if((type==='cm_v1'||type==='cm_v2'||type==='cm_double_v9') && typeof goto==='string' && /^ad(?:_|$)/.test(goto)) {ads++;return;}
        if((type==='banner_v8'||type==='banner_ipad_v8') && goto==='banner' && Array.isArray(item.banner_item)) {
          var old=item.banner_item;
          var keep=old.filter(function(slide){
            if(object(slide) && (slide.type==='ad'||slide.type==='ad_inline')){banners++;return false;}
            return true;
          });
          if(keep.length!==old.length) {
            if(keep.length===0)return;
            item.banner_item=keep;
          }
        }
        items.push(item);
      });
      if(ads||banners)data.items=items;
    }
    if(ads||banners) {
      var headers={};
      Object.keys($response.headers||{}).forEach(function(key){
        if(!/^(content-length|content-encoding|etag|content-md5)$/i.test(key)) headers[key]=$response.headers[key];
      });
      result={body:JSON.stringify(doc),headers:headers};
    }
  } catch(error) { /* Preserve the original response on invalid input. */ }
  $done(result);
})();
