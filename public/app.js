const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
let me = null, authMode = "login", activeView = "feed", currentQuery = "";
const colors = ["avatar-blue","avatar-purple","avatar-green","avatar-orange","avatar-pink"];
function initials(name="") { return name.trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase() || "?"; }
function escapeHtml(value="") { return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function niceDate(value) { const d = new Date(value.includes("Z") ? value : value.replace(" ","T")+"Z"); if (Number.isNaN(d.getTime())) return "just now"; const mins=Math.max(0,Math.floor((Date.now()-d.getTime())/60000)); if(mins<1)return "just now"; if(mins<60)return `${mins} min ago`; if(mins<1440)return `${Math.floor(mins/60)} hr ago`; return d.toLocaleDateString(undefined,{month:"short",day:"numeric"}); }
async function api(url, options={}) {
  const res = await fetch(url, {credentials:"same-origin", headers:{"Content-Type":"application/json",...(options.headers||{})}, ...options});
  const data = res.status===204 ? {} : await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.error || "Request failed. Please try again.");
  return data;
}
function toast(message) { const el=$("#toast"); el.textContent=message; el.classList.remove("hidden"); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.add("hidden"),2800); }
function showNotice(message) { const el=$("#notice"); el.textContent=message; el.classList.remove("hidden"); setTimeout(()=>el.classList.add("hidden"),3500); }
function setAvatar(el, name) { if(el) { el.textContent=initials(name); el.classList.add(colors[(name||"").length%colors.length]); } }
function updateIdentity() {
  const name=me?.name||"Welcome", email=me?.email||"Sign in to get started";
  $("#sidebar-name").textContent=name; $("#sidebar-email").textContent=email;
  ["#sidebar-avatar","#composer-avatar","#profile-avatar","#header-avatar"].forEach(s=>setAvatar($(s),me?.name||"?"));
  $("#profile-name").textContent=me?.name||"Your name"; $("#profile-email").textContent=me?.email||"Sign in to view your profile";
  $("#bio-input").value=me?.bio||"";
  $("#auth-open").classList.toggle("hidden",!!me); $("#signup-open").classList.toggle("hidden",!!me); $("#logout-btn").classList.toggle("hidden",!me);
  $("#landing").classList.toggle("hidden",!!me); $("#app-shell").classList.toggle("hidden",!me);
}
function openAuth(mode="login") { setAuthMode(mode); $("#auth-modal").classList.remove("hidden"); $("#auth-error").textContent=""; }
function closeAuth() { $("#auth-modal").classList.add("hidden"); }
function setAuthMode(mode) {
  authMode=mode;
  $$(".auth-tab").forEach(b=>b.classList.toggle("active",b.dataset.authMode===mode));
  $("#name-field").classList.toggle("hidden",mode!=="register");
  $("#auth-name").required=mode==="register";
  $("#modal-title").textContent=mode==="login"?"Welcome to your people.":"Make yourself at home.";
  $("#modal-subtitle").textContent=mode==="login"?"Sign in to join the conversation.":"Create an account and find your community.";
  $("#auth-submit").innerHTML=mode==="login"?'Sign in <span>→</span>':'Create account <span>→</span>';
  $("#auth-password").autocomplete=mode==="login"?"current-password":"new-password";
}
function switchView(view) {
  if(!me && view!=="feed") return openAuth("login");
  activeView=view;
  $("#feed-view").classList.toggle("hidden",view!=="feed");
  $("#discover-view").classList.toggle("hidden",view!=="discover");
  $("#profile-view").classList.toggle("hidden",view!=="profile");
  $$(".side-link[data-view]").forEach(b=>b.classList.toggle("selected",b.dataset.view===view));
  $$(".icon-btn[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  if(view==="feed") loadPosts(currentQuery);
  if(view==="discover") loadPeople();
  if(view==="profile") updateIdentity();
}
function postMarkup(p) {
  const comments=(p.comments||[]).map(c=>`<div class="comment"><strong>${escapeHtml(c.name)}</strong>${escapeHtml(c.body)}</div>`).join("");
  return `<article class="post card" data-post="${p.id}"><div class="post-author"><div class="avatar ${colors[(p.author.name||"").length%colors.length]}">${escapeHtml(initials(p.author.name))}</div><div><strong>${escapeHtml(p.author.name)}</strong><small>${escapeHtml(p.author.bio||"Community member")} · ${niceDate(p.created_at)}</small></div></div><div class="post-body">${escapeHtml(p.body)}</div><div class="post-stats"><span>${p.like_count} ${p.like_count===1?"like":"likes"}</span><span>${p.comment_count} ${p.comment_count===1?"comment":"comments"}</span></div><div class="post-actions"><button class="post-action ${p.liked?"liked":""}" data-action="like" data-id="${p.id}">${p.liked?"♥":"♡"} Like</button><button class="post-action" data-action="focus-comment" data-id="${p.id}">▢ Comment</button><button class="post-action" data-action="copy" data-id="${p.id}">↗ Share</button></div><div class="comment-list">${comments}</div><form class="comment-form" data-id="${p.id}"><input name="body" maxlength="500" placeholder="${me?"Write a thoughtful comment…":"Sign in to comment"}" ${me?"":"disabled"} required><button ${me?"":"disabled"}>Send</button></form></article>`;
}
async function loadPosts(q="") {
  currentQuery=q;
  const list=$("#feed-list"); list.innerHTML='<div class="loading">Loading community posts…</div>';
  try {
    const data=await api("/api/posts"+(q?"?q="+encodeURIComponent(q):""));
    list.innerHTML=data.posts.length?data.posts.map(postMarkup).join(""):`<div class="empty-state"><strong>${q?"No matches just yet.":"Your feed is a fresh page."}</strong>${q?"Try another search, or explore a different idea.":"Be the first to share something with the community."}</div>`;
  } catch(e) { list.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`; }
}
async function loadPeople() {
  const list=$("#people-list"); list.innerHTML='<div class="loading">Finding people…</div>';
  try {
    const {people}=await api("/api/people");
    list.innerHTML=people.length?people.map(p=>`<div class="person-card card"><div class="avatar ${colors[p.name.length%colors.length]}">${escapeHtml(initials(p.name))}</div><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.bio||"Here to share ideas and meet people.")}</p><button class="secondary-btn compact" data-action="friend" data-id="${p.id}">${p.is_friend?"✓ Connected":"+ Connect"}</button></div>`).join(""):'<div class="empty-state"><strong>You found your people!</strong>Invite others to join BlueBook and build your community.</div>';
  } catch(e) { list.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`; }
}
async function boot() {
  try { const data=await api("/api/me"); me=data.user; } catch {}
  updateIdentity();
  if(me) { await loadPosts(); }
}
$("#auth-open").addEventListener("click",()=>openAuth("login"));
$("#signup-open").addEventListener("click",()=>openAuth("register"));
$("#hero-join").addEventListener("click",()=>openAuth("register"));
$("#hero-explore").addEventListener("click",()=>{openAuth("register");});
$("#modal-close").addEventListener("click",closeAuth);
$("#auth-modal").addEventListener("click",e=>{if(e.target.id==="auth-modal")closeAuth();});
$$(".auth-tab").forEach(b=>b.addEventListener("click",()=>setAuthMode(b.dataset.authMode)));
$("#auth-form").addEventListener("submit",async e=>{
  e.preventDefault(); $("#auth-error").textContent="";
  const payload={email:$("#auth-email").value.trim(),password:$("#auth-password").value};
  if(authMode==="register")payload.name=$("#auth-name").value.trim();
  const submit=$("#auth-submit"); submit.disabled=true; submit.textContent="Please wait…";
  try {
    const data=await api("/api/"+(authMode==="login"?"login":"register"),{method:"POST",body:JSON.stringify(payload)});
    me=data.user; closeAuth(); updateIdentity(); await loadPosts(); toast(authMode==="login"?"Welcome back!":"Welcome to BlueBook!");
  } catch(err) { $("#auth-error").textContent=err.message; }
  finally {submit.disabled=false;submit.innerHTML=authMode==="login"?'Sign in <span>→</span>':'Create account <span>→</span>';}
});
$("#logout-btn").addEventListener("click",async()=>{try{await api("/api/logout",{method:"POST"});}catch{}me=null;updateIdentity();toast("You have signed out.");});
$("#post-submit").addEventListener("click",async()=>{
  if(!me)return openAuth("login");
  const body=$("#post-body").value.trim(); if(!body)return toast("Write something before publishing.");
  const btn=$("#post-submit");btn.disabled=true;
  try {await api("/api/posts",{method:"POST",body:JSON.stringify({body})});$("#post-body").value="";await loadPosts(currentQuery);toast("Your post is live.");}
  catch(e){toast(e.message);}finally{btn.disabled=false;}
});
$("#feed-list").addEventListener("click",async e=>{
  const b=e.target.closest("[data-action]");if(!b)return;
  const id=b.dataset.id,action=b.dataset.action;
  if(action==="focus-comment"){const input=$(`.comment-form[data-id="${id}"] input`);input?.focus();return;}
  if(action==="copy"){const text=location.origin+" — a post on BlueBook";try{await navigator.clipboard.writeText(text);toast("Link copied.");}catch{toast("Copy isn't available in this browser.");}return;}
  if(action==="like"){if(!me)return openAuth("login");try{await api(`/api/posts/${id}/like`,{method:"POST"});await loadPosts(currentQuery);}catch(err){toast(err.message);}}
});
$("#feed-list").addEventListener("submit",async e=>{
  const form=e.target.closest(".comment-form");if(!form)return;e.preventDefault();
  if(!me)return openAuth("login");const input=$('input[name="body"]',form),body=input.value.trim();if(!body)return;
  const button=$("button",form);button.disabled=true;
  try{await api(`/api/posts/${form.dataset.id}/comments`,{method:"POST",body:JSON.stringify({body})});await loadPosts(currentQuery);}
  catch(err){toast(err.message);}finally{button.disabled=false;}
});
$("#people-list").addEventListener("click",async e=>{
  const b=e.target.closest('[data-action="friend"]');if(!b)return;if(!me)return openAuth("login");
  try{await api(`/api/people/${b.dataset.id}/friend`,{method:"POST"});await loadPeople();}catch(err){toast(err.message);}
});
$("#save-bio").addEventListener("click",async()=>{
  try{const data=await api("/api/me",{method:"PATCH",body:JSON.stringify({bio:$("#bio-input").value})});me=data.user;updateIdentity();toast("Profile saved.");}
  catch(e){toast(e.message);}
});
$("#search-form").addEventListener("submit",e=>{e.preventDefault();if(!me)return openAuth("login");switchView("feed");loadPosts($("#search-input").value.trim());});
$$("[data-view]").forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.view)));
$$("[data-topic]").forEach(b=>b.addEventListener("click",()=>{switchView("feed");loadPosts(b.dataset.topic);}));
$$("[data-search]").forEach(b=>b.addEventListener("click",()=>{if(!me)return openAuth("login");$("#search-input").value=b.dataset.search;switchView("feed");loadPosts(b.dataset.search);}));
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeAuth();});
boot();
