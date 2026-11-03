/* Bounded public GitHub reader. A report is pinned to one commit. */
(function (root) {
  'use strict';
  var MAX_FILES=160,MAX_BYTES=150000;
  function parseUrl(value) {
    var s=String(value||'').trim(),m;
    if(!s||s.length>2048)return null;
    if(/^[\w.-]+\/[\w.-]+$/.test(s))m=s.split('/');
    else {
      try {var u=new URL(/^https?:\/\//i.test(s)?s:'https://'+s);if(!['http:','https:'].includes(u.protocol)||!['github.com','www.github.com'].includes(u.hostname.toLowerCase())||u.username||u.password||u.port)return null;
        var parts=u.pathname.replace(/\/+$/,'').slice(1).split('/');if(parts.length!==2 && !(parts.length>=4&&parts[2]==='tree'))return null;
        m=[parts[0],parts[1],parts.length>=4?decodeURIComponent(parts.slice(3).join('/')):null];
      }catch(e){return null;}
    }
    m[1]=m[1].replace(/\.git$/,'');
    if(!/^[\w.-]+$/.test(m[0])||!/^[\w.-]+$/.test(m[1])||['.','..'].includes(m[0])||['.','..'].includes(m[1])||(m[2]&&/[\x00-\x20?#]/.test(m[2])))return null;
    return {owner:m[0],repo:m[1],ref:m[2]||null};
  }
  async function request(url,signal,max,json) {
    if(signal&&signal.aborted)throw new DOMException('Review cancelled','AbortError');
    var controller=new AbortController(),timedOut=false;
    var abort=function(){controller.abort();};if(signal)signal.addEventListener('abort',abort,{once:true});
    var timer=setTimeout(function(){timedOut=true;controller.abort();},20000);
    try {
      var r=await fetch(url,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer',headers:json?{Accept:'application/vnd.github+json'}:{}});
      if(r.status===403||r.status===429){var reset=Number(r.headers.get('x-ratelimit-reset'));var e=new Error('GitHub denied this request or the shared network rate limit was reached.'+(Number.isFinite(reset)&&reset>0?' Reset around '+new Date(reset*1000).toLocaleTimeString()+'.':''));e.code='rate';throw e;}
      if(r.status===404)throw new Error('Repository, revision or file not found. Only public repositories are supported.');
      if(!r.ok)throw new Error('GitHub returned '+r.status);
      if(Number(r.headers.get('content-length'))>max)throw new Error('Response exceeds the review size limit');
      var text;
      if(r.body&&r.body.getReader){var reader=r.body.getReader(),chunks=[],n=0;while(true){var part=await reader.read();if(part.done)break;n+=part.value.byteLength;if(n>max){await reader.cancel();throw new Error('Response exceeds the review size limit');}chunks.push(part.value);}var bytes=new Uint8Array(n),at=0;chunks.forEach(function(c){bytes.set(c,at);at+=c.length;});text=new TextDecoder().decode(bytes);}
      else {text=await r.text();if(new TextEncoder().encode(text).length>max)throw new Error('Response exceeds the review size limit');}
      return json?JSON.parse(text):text;
    }catch(e){if(timedOut)throw new Error('GitHub request timed out after 20 seconds. Try again.');throw e;}
    finally {clearTimeout(timer);if(signal)signal.removeEventListener('abort',abort);}
  }
  async function load(spec,onProgress,signal) {
    if(!spec||!parseUrl(spec.owner+'/'+spec.repo))throw new Error('Invalid repository');
    onProgress=onProgress||function(){};
    var api='https://api.github.com/repos/'+spec.owner+'/'+spec.repo;
    var info=await request(api,signal,2000000,true),branch=spec.ref||info.default_branch;
    var commit=await request(api+'/commits/'+encodeURIComponent(branch),signal,3000000,true);
    if(!/^[a-f0-9]{40}$/.test(commit.sha)||!commit.commit||!commit.commit.tree)throw new Error('GitHub returned an invalid revision');
    var ref=commit.sha;onProgress('tree',{ref:branch+' @ '+ref.slice(0,7),info:info});
    var t=await request(api+'/git/trees/'+encodeURIComponent(commit.commit.tree.sha)+'?recursive=1',signal,20000000,true);
    if(!Array.isArray(t.tree))throw new Error('GitHub returned an invalid file list');
    var tree=t.tree.filter(function(x){return x.type==='blob'&&typeof x.path==='string'&&x.path.length<=2000;}).map(function(x){return {path:x.path,size:x.size||0};});
    var A=root.RepoDoctor||(typeof require!=='undefined'?require('./analyzers.js'):null);
    var want=tree.filter(function(x){return A.TEXT.test(x.path)&&!A.isVendored(x.path)&&x.size>0&&x.size<=MAX_BYTES;});
    var rank=function(p){return /^(package\.json|requirements\.txt)$/.test(p)?0:A.CODE.test(p)?1:2;};
    want.sort(function(a,b){return rank(a.path)-rank(b.path)||a.path.length-b.path.length;});
    var truncatedList=want.length>MAX_FILES;want=want.slice(0,MAX_FILES);
    var files=Object.create(null),failures=[],done=0,idx=0;
    async function worker(){while(idx<want.length){var f=want[idx++];if(signal&&signal.aborted)throw new DOMException('Review cancelled','AbortError');try{files[f.path]=await request('https://raw.githubusercontent.com/'+spec.owner+'/'+spec.repo+'/'+ref+'/'+f.path.split('/').map(encodeURIComponent).join('/'),signal,MAX_BYTES,false);}catch(e){if(signal&&signal.aborted)throw e;failures.push({path:f.path,reason:e.message});}done++;onProgress('files',{done:done,total:want.length,path:f.path});}}
    await Promise.all([worker(),worker(),worker(),worker(),worker(),worker()]);
    if(signal&&signal.aborted)throw new DOMException('Review cancelled','AbortError');
    if(want.length&&!Object.keys(files).length)throw new Error('No candidate files could be read. Retry when GitHub is reachable.');
    return {info:info,branch:branch,ref:ref,tree:tree,files:files,failures:failures,truncatedTree:!!t.truncated,truncatedList:truncatedList,totalCandidate:tree.length,fetched:Object.keys(files).length};
  }
  var api={parseUrl:parseUrl,load:load};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.RepoGitHub=api;
})(typeof self!=='undefined'?self:this);
