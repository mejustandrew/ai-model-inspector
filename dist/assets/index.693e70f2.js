const $=function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))r(n);new MutationObserver(n=>{for(const s of n)if(s.type==="childList")for(const o of s.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&r(o)}).observe(document,{childList:!0,subtree:!0});function a(n){const s={};return n.integrity&&(s.integrity=n.integrity),n.referrerpolicy&&(s.referrerPolicy=n.referrerpolicy),n.crossorigin==="use-credentials"?s.credentials="include":n.crossorigin==="anonymous"?s.credentials="omit":s.credentials="same-origin",s}function r(n){if(n.ep)return;n.ep=!0;const s=a(n);fetch(n.href,s)}};$();const h={0:"uint8",1:"int8",2:"uint16",3:"int16",4:"uint32",5:"int32",6:"float32",7:"bool",8:"string",9:"array",10:"uint64",11:"int64",12:"float64"},C=new TextDecoder("utf-8",{fatal:!0});function y(t){return t.toString()}function m(t,e){if(t>BigInt(Number.MAX_SAFE_INTEGER))throw new Error(`${e} is too large for browser parsing: ${t.toString()}`);return Number(t)}class q{constructor(e){this.buffer=e,this.view=new DataView(e),this.offset=0}ensureAvailable(e){if(this.offset+e>this.view.byteLength)throw new Error("Unexpected end of file while reading GGUF data")}readUint8(){this.ensureAvailable(1);const e=this.view.getUint8(this.offset);return this.offset+=1,e}readInt8(){this.ensureAvailable(1);const e=this.view.getInt8(this.offset);return this.offset+=1,e}readUint16(){this.ensureAvailable(2);const e=this.view.getUint16(this.offset,!0);return this.offset+=2,e}readInt16(){this.ensureAvailable(2);const e=this.view.getInt16(this.offset,!0);return this.offset+=2,e}readUint32(){this.ensureAvailable(4);const e=this.view.getUint32(this.offset,!0);return this.offset+=4,e}readInt32(){this.ensureAvailable(4);const e=this.view.getInt32(this.offset,!0);return this.offset+=4,e}readFloat32(){this.ensureAvailable(4);const e=this.view.getFloat32(this.offset,!0);return this.offset+=4,e}readUint64(){this.ensureAvailable(8);const e=this.view.getBigUint64(this.offset,!0);return this.offset+=8,e}readInt64(){this.ensureAvailable(8);const e=this.view.getBigInt64(this.offset,!0);return this.offset+=8,e}readFloat64(){this.ensureAvailable(8);const e=this.view.getFloat64(this.offset,!0);return this.offset+=8,e}readBool(){const e=this.readUint8();if(e!==0&&e!==1)throw new Error(`Invalid boolean value ${e} in GGUF metadata`);return e===1}readBytes(e){this.ensureAvailable(e);const a=new Uint8Array(this.buffer,this.offset,e);return this.offset+=e,a}readString(){const e=m(this.readUint64(),"String length"),a=this.readBytes(e);return C.decode(a)}}function N(t){return typeof t=="bigint"?y(t):Array.isArray(t)?t.map(e=>N(e)):t}function M(t,e){switch(e){case 0:return t.readUint8();case 1:return t.readInt8();case 2:return t.readUint16();case 3:return t.readInt16();case 4:return t.readUint32();case 5:return t.readInt32();case 6:return t.readFloat32();case 7:return t.readBool();case 8:return t.readString();case 10:return t.readUint64();case 11:return t.readInt64();case 12:return t.readFloat64();default:throw new Error(`Unsupported GGUF value type: ${e}`)}}function T(t,e){if(e===9){const a=t.readUint32(),r=m(t.readUint64(),"Array length"),n=[];for(let s=0;s<r;s+=1)n.push(T(t,a));return{type:"array",elementType:a,elementTypeName:h[a]||`type_${a}`,value:n}}return{type:h[e]||`type_${e}`,value:M(t,e)}}function O(t){const e=t.readString(),a=t.readUint32(),r=[];for(let n=0;n<a;n+=1)r.push(y(t.readUint64()));return{name:e,dimensions:r,ggmlType:t.readUint32(),offset:y(t.readUint64())}}function k(t){const e=new q(t),a=C.decode(e.readBytes(4));if(a!=="GGUF")throw new Error(`Invalid file signature "${a}". Expected GGUF.`);const r=e.readUint32();if(r<2||r>3)throw new Error(`Unsupported GGUF version ${r}. This viewer supports versions 2 and 3.`);const n=m(e.readUint64(),"Tensor count"),s=m(e.readUint64(),"Metadata count"),o=[],i={};for(let c=0;c<s;c+=1){const v=e.readString(),f=e.readUint32(),g=T(e,f),b=N(g.value);o.push({key:v,valueType:f,valueTypeName:h[f]||`type_${f}`,arrayElementTypeName:g.elementTypeName||null,value:b}),i[v]=b}const l=[];for(let c=0;c<n;c+=1)l.push(O(e));return{header:{magic:a,version:r,tensorCount:n,metadataCount:s,bytesRead:e.offset,fileSize:t.byteLength},metadata:i,metadataEntries:o,tensors:l}}const z=document.querySelector("#app");z.innerHTML=`
  <main class="shell">
    <section class="hero">
      <p class="eyebrow">Static GGUF Inspector</p>
      <h1>Parse GGUF metadata directly in your browser.</h1>
      <p class="lede">
        Drop a <code>.gguf</code> file to extract its header, key-value metadata, and tensor index
        without uploading anything to a server.
      </p>
    </section>

    <section class="panel upload-panel">
      <label class="dropzone" for="file-input" id="dropzone">
        <input id="file-input" type="file" accept=".gguf,application/octet-stream" />
        <span class="dropzone-title">Choose a GGUF file</span>
        <span class="dropzone-copy">or drag and drop it here</span>
      </label>
      <div class="status" id="status">Waiting for a GGUF file.</div>
    </section>

    <section class="panel hidden" id="summary-panel">
      <div class="summary-grid" id="summary-grid"></div>
    </section>

    <section class="panel hidden" id="metadata-panel">
      <div class="panel-head">
        <div>
          <h2>Metadata</h2>
          <p>Search extracted key-value pairs.</p>
        </div>
        <div class="panel-actions">
          <input id="metadata-filter" type="search" placeholder="Filter by key or value" />
          <button id="download-json" type="button">Download JSON</button>
        </div>
      </div>
      <div class="metadata-table-wrap">
        <table class="metadata-table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Type</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody id="metadata-body"></tbody>
        </table>
      </div>
    </section>

    <section class="panel hidden" id="tensor-panel">
      <div class="panel-head">
        <div>
          <h2>Tensor Index</h2>
          <p>First 25 tensor descriptors from the file.</p>
        </div>
      </div>
      <div class="metadata-table-wrap">
        <table class="metadata-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Dimensions</th>
              <th>GGML Type</th>
              <th>Offset</th>
            </tr>
          </thead>
          <tbody id="tensor-body"></tbody>
        </table>
      </div>
    </section>
  </main>
`;const R=document.querySelector("#file-input"),u=document.querySelector("#dropzone"),w=document.querySelector("#status"),F=document.querySelector("#summary-panel"),E=document.querySelector("#summary-grid"),G=document.querySelector("#metadata-panel"),U=document.querySelector("#metadata-body"),x=document.querySelector("#metadata-filter"),A=document.querySelector("#tensor-panel"),S=document.querySelector("#tensor-body"),D=document.querySelector("#download-json");let d=null;function L(t){return Array.isArray(t)||typeof t=="object"&&t!==null?JSON.stringify(t):String(t)}function P(t,e){const a=document.createElement("article");a.className="summary-card";const r=document.createElement("p");r.className="summary-label",r.textContent=t;const n=document.createElement("p");return n.className="summary-value",n.textContent=e,a.append(r,n),a}function j(t,e){E.innerHTML="",[["File",e.name],["Version",String(t.header.version)],["Metadata entries",String(t.header.metadataCount)],["Tensor count",String(t.header.tensorCount)],["Parsed bytes",t.header.bytesRead.toLocaleString()],["File size",e.size.toLocaleString()]].forEach(([r,n])=>{E.append(P(r,n))}),F.classList.remove("hidden")}function I(t){const e=x.value.trim().toLowerCase();U.innerHTML="";const a=t.filter(r=>{if(!e)return!0;const n=L(r.value).toLowerCase();return r.key.toLowerCase().includes(e)||n.includes(e)});for(const r of a){const n=document.createElement("tr"),s=document.createElement("td");s.className="mono",s.textContent=r.key;const o=document.createElement("td");o.textContent=r.arrayElementTypeName?`${r.valueTypeName}<${r.arrayElementTypeName}>`:r.valueTypeName;const i=document.createElement("td"),l=document.createElement("pre");l.textContent=L(r.value),i.append(l),n.append(s,o,i),U.append(n)}G.classList.remove("hidden")}function V(t){S.innerHTML="";const e=t.slice(0,25);for(const a of e){const r=document.createElement("tr"),n=document.createElement("td");n.className="mono",n.textContent=a.name;const s=document.createElement("td");s.textContent=a.dimensions.join(" x ")||"scalar";const o=document.createElement("td");o.textContent=String(a.ggmlType);const i=document.createElement("td");i.className="mono",i.textContent=a.offset,r.append(n,s,o,i),S.append(r)}A.classList.remove("hidden")}function p(t,e=!1){w.textContent=t,w.dataset.state=e?"error":"normal"}async function B(t){if(!!t){p(`Reading ${t.name}...`);try{const e=await t.arrayBuffer(),a=k(e);d=a,j(a,t),I(a.metadataEntries),V(a.tensors),p(`Parsed ${a.header.metadataCount} metadata entries from ${t.name}.`)}catch(e){d=null,F.classList.add("hidden"),G.classList.add("hidden"),A.classList.add("hidden"),p(e instanceof Error?e.message:"Failed to parse file.",!0)}}}R.addEventListener("change",t=>{const[e]=t.target.files;B(e)});x.addEventListener("input",()=>{d&&I(d.metadataEntries)});D.addEventListener("click",()=>{if(!d)return;const t=new Blob([JSON.stringify(d,null,2)],{type:"application/json"}),e=URL.createObjectURL(t),a=document.createElement("a");a.href=e,a.download="gguf-metadata.json",a.click(),URL.revokeObjectURL(e)});["dragenter","dragover"].forEach(t=>{u.addEventListener(t,e=>{e.preventDefault(),u.classList.add("dragging")})});["dragleave","drop"].forEach(t=>{u.addEventListener(t,e=>{e.preventDefault(),u.classList.remove("dragging")})});u.addEventListener("drop",t=>{const[e]=t.dataTransfer.files;B(e)});
