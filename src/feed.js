/* BiliSR homepage feed filter. Response-only JSON, no requests or telemetry.
 * Field references: Biliverse/ADBlock v0.7.5 src/process/Response.mjs.
 * Independent small implementation. Ordinary/unknown recommendations are preserved.
 */
(function () {
  'use strict';
  var PREFIX='[BiliSR.Feed] ';
  function log(s) { try { console.log(PREFIX+s); } catch (_) {} }
  function object(v) { return v && typeof v==='object' && !Array.isArray(v); }
  var result={};
  try {
    var match=String($request.url||'').match(/^https:\/\/app\.(?:bilibili\.com|biliapi\.net|biliapi\.com)(\/x\/v2\/feed\/index)(?:\?[^#]*)?$/);
    if(!match) { $done({}); return; }
    var path=match[1],raw=$response.body;
    // Engineering caps: 4,194,304 JS string code units here; 4 MiB input bytes in the module.
    if(typeof raw!=='string' || raw.length>4194304) {
      var alt=$response.bodyBytes;
      var info=['bodyType='+Object.prototype.toString.call(raw),
        'bodyLength='+(raw==null?'missing':(raw.byteLength==null?raw.length:raw.byteLength)),
        'bodyBytesType='+Object.prototype.toString.call(alt),
        'bodyBytesLength='+(alt==null?'missing':(alt.byteLength==null?alt.length:alt.byteLength)),
        'status='+String($response.status||$response.statusCode||'unknown')];
      Object.keys($response.headers||{}).forEach(function(key){
        if(/^(content-type|content-encoding|content-length)$/i.test(key))info.push(key+'='+$response.headers[key]);
      });
      log('skip '+path+': '+(typeof raw==='string'?'text over 4194304-character limit':'non-text body')+' | '+info.join(' | '));
      $done({});return;
    }
    var doc=JSON.parse(raw);
    if(!object(doc) || doc.code!==0 || !object(doc.data)) {log('pass '+path+': unknown/error schema');$done({});return;}
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
      log('filtered '+path+' ads='+ads+' bannerAds='+banners);
    } else log('pass '+path+': no known ads');
  } catch(error) {log('safe pass-through: '+String(error&&error.message||error));}
  $done(result);
})();
