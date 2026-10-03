
/* ============================================================
   demo 逻辑（没有取色引擎，颜色全在 CSS 里写死）
   ============================================================ */
const ICON_USER = '<svg viewBox="0 0 16 16"><path d="M11 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"/><path fill-rule="evenodd" d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm8-7a7 7 0 0 0-5.468 11.37C3.242 11.226 4.805 10 8 10s4.757 1.225 5.468 2.37A7 7 0 0 0 8 1z"/></svg>';

/* 兜底头像色相族，跟主色同族（#0B57D0 的 HSL 色相 = 217°） */
const AV_HUE = 217;

function genAvatar(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  const a = (AV_HUE + (h % 40) - 20 + 360) % 360, b = (a + 34) % 360;
  const initial = (seed.trim()[0] || "?").toUpperCase();
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="hsl(' + a + ',72%,58%)"/>' +
    '<stop offset="1" stop-color="hsl(' + b + ',66%,44%)"/></linearGradient></defs>' +
    '<rect width="88" height="88" rx="44" fill="url(#g)"/>' +
    '<text x="44" y="57" font-family="system-ui,sans-serif" font-size="38" font-weight="700" ' +
    'fill="rgba(255,255,255,.94)" text-anchor="middle">' + initial + '</text></svg>';
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

/* ============================================================
   Token Login — 扩展 popup
   设计/动效来自 design/demo-material.html（已过三轮审查 + 像素级验证）
   ============================================================ */
document.body.classList.remove("preload");

/* ---------- 状态（持久化在 chrome.storage.local） ---------- */
let groups = [];
let selectedgroup = null;

function save() {
	chrome.storage.local.set({ Group: groups, Selected: selectedgroup });
}

/* 点账号卡片 = 把该 token 送进当前 Discord 标签页登录 */
function messageContent(token, accountindex) {
	chrome.tabs.query(
		{ active: true, currentWindow: true, url: ["*://discord.com/*"] },
		function (tabs) {
			if (tabs[0] == null) return toast("Login Error", true);
			chrome.tabs.sendMessage(tabs[0].id, { message: "login", token: token }, () => {
				/* 两种 lastError 要分开：
				   "Receiving end does not exist" = 内容脚本不在（扩展刚重载、标签页没刷新）→ 真失败
				   "message port closed before a response was received" = 脚本收到了但没调 sendResponse → 其实成功了 */
				const err = chrome.runtime.lastError;
				if (err && /Receiving end does not exist/i.test(err.message || "")) return toast("Reload Discord Tab", true);
				const g = groups.find((x) => x.name === selectedgroup);
				if (g && g.accounts[accountindex]) {
					g.accounts[accountindex].lastlogin = Date.now();
					save();
				}
			});
		},
	);
}


const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function renderGroups() {
  const box = $("#groups");
  box.innerHTML = "";
  groups.forEach(g => {
    const b = document.createElement("button");
    b.className = "rail-group" + (g.name === selectedgroup ? " active" : "");
    b.dataset.group = g.name;
    b.dataset.tip = g.name + " · " + g.accounts.length;
    b.draggable = true;
    b.innerHTML =
      '<span class="indicator"></span><span class="bg"></span>' +
      '<span class="label">' + g.name.slice(0, 1).toUpperCase() + "</span>";
    box.appendChild(b);
  });
}

/* 头像：非空字符串 → <img>；缺失或坏链 → .avatar.fallback + ICON_USER */
function avatarFallback() {
  const s = document.createElement("span");
  s.className = "avatar fallback";
  s.innerHTML = ICON_USER;
  return s;
}
function avatarImg(src) {
  const im = document.createElement("img");
  im.className = "avatar";
  im.alt = "";
  im.draggable = false; /* 否则拖到的是图片，不是卡片 */
  im.addEventListener("error", () => im.replaceWith(avatarFallback()));
  im.src = src;
  return im;
}
function avatarEl(image) {
  return typeof image === "string" && image !== "" ? avatarImg(image) : avatarFallback();
}

function renderAccounts(noAnim) {
  const box = $("#accounts");
  box.classList.toggle("no-anim", !!noAnim);
  box.innerHTML = "";
  const g = groups.find(x => x.name === selectedgroup);
  if (!g || !g.accounts.length) {
    box.innerHTML = '<div class="empty">' + ICON_USER + "<span>No accounts yet</span></div>";
    return;
  }
  g.accounts.forEach((a, i) => {
    const el = document.createElement("div");
    el.className = "account";
    el.dataset.index = i;
    el.draggable = true;
    el.style.animationDelay = (i * 45) + "ms";
    el.innerHTML =
      '<span class="bg"></span>' +
      '<div class="meta"><span class="name"></span></div>';
    el.querySelector(".name").textContent = a.name;
    /* 头像节点用 DOM 属性赋值，不把 URL 拼进 innerHTML 字符串 */
    el.insertBefore(avatarEl(a.image), el.querySelector(".meta"));
    box.appendChild(el);
  });
  /* 落点指示线放在 #accounts 里面，才会跟着列表一起滚动 */
  const line = document.createElement("div");
  line.className = "drop-line";
  line.id = "dropLine";
  box.appendChild(line);
}

function render(noAnim) { renderGroups(); renderAccounts(noAnim); }

const overlay = $("#overlay");
/* 关闭清理统一走这里：清空输入 + 重新 inert（隐藏弹窗不可聚焦）+ 复位编辑索引 */
function resetModal(m) {
  m.querySelectorAll("input").forEach(i => { i.value = ""; });
  m.setAttribute("inert", "");
  accEditIndex = null;
  accEditGroup = null;
}
/* 弹窗打开时隔离背景：.topbar / .layout 是弹窗与 overlay 的兄弟节点，
   里面装着 rail 与 content，加 inert 后背景不可聚焦、不可点击 */
function setBackdropInert(on) {
  [".topbar", ".layout"].forEach(sel => {
    const el = $(sel);
    if (!el) return;
    if (on) el.setAttribute("inert", ""); else el.removeAttribute("inert");
  });
}
function openModal(m) {
  $$(".modal").forEach(x => { x.classList.remove("active"); if (x !== m) x.setAttribute("inert", ""); });
  setBackdropInert(true);
  m.removeAttribute("inert");
  m.classList.add("active");
  overlay.classList.add("active");
  setTimeout(() => { const i = m.querySelector("input"); if (i) i.focus(); }, 120);
}
function closeModal(m) {
  if (!m) return;
  m.classList.remove("active");
  resetModal(m);
  if (!$(".modal.active")) { overlay.classList.remove("active"); setBackdropInert(false); }
}
function closeAll() {
  $$(".modal").forEach(m => { m.classList.remove("active"); resetModal(m); });
  if (!$(".modal.active")) setBackdropInert(false);
}

$("#openGroupModal").onclick = () => openModal($("#groupModal"));
/* 账号弹窗：新增 / 编辑共用一套表单 */
let accEditIndex = null;
let accEditGroup = null;
function fillAccountForm(a) {
  const isEdit = a !== null;
  $("#accModalTitle").innerHTML = (isEdit ? "EDIT" : "ADD") + " <em>ACCOUNT</em>";
  $("#confirmAccount").textContent = isEdit ? "Save Changes" : "Add Account";
  $("#accName").value = isEdit ? a.name : "";
  /* image 可能缺失或非字符串，先归一化再判断，避免 startsWith 抛 TypeError */
  const img = isEdit && typeof a.image === "string" ? a.image : "";
  $("#accImage").value = img && !img.startsWith("data:") ? img : "";
  $("#accToken").value = isEdit ? (a.token || "") : "";
  updatePreview();
}
$("#openAccountModal").onclick = () => { accEditIndex = null; accEditGroup = null; fillAccountForm(null); openModal($("#accountModal")); };
$$("[data-close]").forEach(b => b.addEventListener("click", () => closeModal(b.closest(".modal"))));
overlay.addEventListener("click", () => { closeAll(); overlay.classList.remove("active"); });
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { closeAll(); closeCtx(); overlay.classList.remove("active"); }
});

function toast(text, err) {
  const t = document.createElement("div");
  t.className = "toast" + (err ? " err" : "");
  t.textContent = text;
  $("#toasts").appendChild(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 240); }, 1800);
}

/* 建组：原版这里漏了 closeModal */
$("#confirmGroup").onclick = () => {
  const name = $("#groupName").value.trim();
  if (!name) return toast("Enter Group Name", true);
  if (groups.some(g => g.name === name)) return toast("Group Already Exist", true);
  groups.push({ name, accounts: [] });
  selectedgroup = name;
  save();
  render();
  closeModal($("#groupModal"));
  toast("Group Created");
  const btn = $('.rail-group[data-group="' + CSS.escape(name) + '"]');
  if (btn) btn.classList.add("pop");
};

/* 真·Discord 头像读取 */
async function fetchDiscordAvatar(token) {
  const res = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: token, "Content-Type": "application/json" },
  });
  if (res.status === 401) throw new Error("Invalid token");
  if (!res.ok) throw new Error("HTTP " + res.status);
  const u = await res.json();
  const animated = typeof u.avatar === "string" && u.avatar.startsWith("a_");
  const url = u.avatar
    ? "https://cdn.discordapp.com/avatars/" + u.id + "/" + u.avatar + (animated ? ".gif" : ".png") + "?size=128"
    : "https://cdn.discordapp.com/embed/avatars/" + (Number(BigInt(u.id) >> 22n) % 6) + ".png";
  return { name: u.global_name || u.username, url };
}

$("#fetchAvatar").addEventListener("click", async () => {
  const token = $("#accToken").value.trim();
  if (!token) return toast("Enter the token first", true);
  const btn = $("#fetchAvatar");
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = "Fetching…";
  try {
    const { name, url } = await fetchDiscordAvatar(token);
    if (!$("#accName").value.trim()) $("#accName").value = name;
    $("#accImage").value = url;
    updatePreview();
    toast("Loaded: " + name);
  } catch (e) {
    toast("Failed: " + e.message, true);
  } finally {
    btn.disabled = false; btn.textContent = label;
  }
});

/* 从当前 Discord 标签页读出已登录账号的 token */
$("#fetchToken").addEventListener("click", () => {
  const btn = $("#fetchToken");
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = "Reading…";
  chrome.tabs.query({ active: true, currentWindow: true, url: ["*://discord.com/*"] }, tabs => {
    if (!tabs[0]) { btn.disabled = false; btn.textContent = label; return toast("Login Error", true); }
    chrome.tabs.sendMessage(tabs[0].id, { message: "readtoken" }, res => {
      btn.disabled = false; btn.textContent = label;
      const err = chrome.runtime.lastError;
      if (err || !res || !res.token) return toast("No Token Found", true);
      $("#accToken").value = res.token;
      $("#fetchAvatar").click(); /* token 到手了，顺手把名字和头像也拉回来 */
    });
  });
});

function updatePreview() {
  const name = $("#accName").value.trim();
  const url  = $("#accImage").value.trim();
  const p = $("#avatarPreview");
  const src = url || (name ? genAvatar(name) : "");
  p.innerHTML = "";
  if (src) { p.classList.add("has"); p.appendChild(avatarImg(src)); }
  else { p.classList.remove("has"); p.appendChild(avatarFallback()); }
}
$("#accName").addEventListener("input", updatePreview);
$("#accImage").addEventListener("input", updatePreview);

$("#confirmAccount").onclick = () => {
  const name = $("#accName").value.trim();
  const image = $("#accImage").value.trim();
  const token = $("#accToken").value.trim();
  if (!name || !token) return toast("Please Fill The Required Areas", true);
  const isEdit = accEditIndex !== null;
  /* 编辑写回“打开弹窗时那一组”（accEditGroup），而不是当前选中组 */
  const g = groups.find(x => x.name === (isEdit ? accEditGroup : selectedgroup));
  if (!g) return toast("Select a group first", true);
  /* 同一个 token 不能在同一个组里出现两次（编辑时跳过自己） */
  if (g.accounts.some((a, i) => i !== accEditIndex && a.token === token)) return toast("Account Already Exist", true);
  if (isEdit) {
    const a = g.accounts[accEditIndex];
    /* 账号取不到（如编辑期间被删）：报错并保持弹窗开着，不抛异常、不静默成功 */
    if (!a) return toast("Account Not Found", true);
    a.name = name;
    a.token = token;
    a.image = image || genAvatar(name);
  } else {
    g.accounts.push({ name, image: image || genAvatar(name), token, lastlogin: Date.now() });
  }
  accEditIndex = null;
  accEditGroup = null;
  save();
  render();
  closeModal($("#accountModal"));
  toast(isEdit ? "Account Updated" : "Account Added");
};

$("#groups").addEventListener("click", e => {
  const b = e.target.closest(".rail-group");
  if (!b || b.dataset.group === selectedgroup) return;
  selectedgroup = b.dataset.group;
  save();
  render();
});

/* ---------- 右键菜单：账号 Update/Delete，组 Import/Export/Delete（跟原版一致） ---------- */
const ctxAcc = $("#accCtx"), ctxGrp = $("#grpCtx");
let ctxTarget = null;

function closeCtx() {
  ctxAcc.classList.remove("show");
  ctxGrp.classList.remove("show");
  ctxTarget = null;
}
function openCtx(menu, x, y, target) {
  closeCtx();
  ctxTarget = target;
  menu.classList.add("show");
  const p = $("#popup").getBoundingClientRect(), pad = 10;
  menu.style.left = Math.max(pad, Math.min(x, p.width - menu.offsetWidth - pad)) + "px";
  menu.style.top  = Math.max(pad, Math.min(y, p.height - menu.offsetHeight - pad)) + "px";
}

$("#accounts").addEventListener("contextmenu", e => {
  const card = e.target.closest(".account");
  if (!card) return;
  e.preventDefault();
  const p = $("#popup").getBoundingClientRect();
  openCtx(ctxAcc, e.clientX - p.left, e.clientY - p.top, { index: +card.dataset.index });
});

$("#groups").addEventListener("contextmenu", e => {
  const b = e.target.closest(".rail-group");
  if (!b) return;
  e.preventDefault();
  const p = $("#popup").getBoundingClientRect();
  openCtx(ctxGrp, e.clientX - p.left, e.clientY - p.top, { name: b.dataset.group });
});

/* 组 Import：只收数组；逐项归一化；坏输入返回 null，调用方不得改动原数据 */
function normalizeAccounts(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue; /* 过滤非对象项 */
    const name = typeof raw.name === "string" && raw.name !== "" ? raw.name : "Unnamed";
    const token = typeof raw.token === "string" ? raw.token : "";
    const image = typeof raw.image === "string" && raw.image !== "" ? raw.image : genAvatar(name);
    const lastlogin = typeof raw.lastlogin === "number" ? raw.lastlogin : null;
    out.push({ name, image, token, lastlogin });
  }
  /* 非空数组里一项都没留下 → 视为失败，别把整组静默清空 */
  if (list.length && !out.length) return null;
  return out;
}

ctxAcc.addEventListener("click", e => {
  const act = e.target.dataset.act;
  if (!act || !ctxTarget) return;
  const g = groups.find(x => x.name === selectedgroup);
  const i = ctxTarget.index;
  closeCtx();
  if (!g || !g.accounts[i]) return toast("Account Not Found", true);
  if (act === "update") {
    accEditIndex = i;
    accEditGroup = selectedgroup;
    fillAccountForm(g.accounts[i]);
    openModal($("#accountModal"));
  } else if (act === "delete") {
    g.accounts.splice(i, 1);
    save();
    render();
    toast("Account Deleted");
  }
});

ctxGrp.addEventListener("click", e => {
  const act = e.target.dataset.act;
  if (!act || !ctxTarget) return;
  const g = groups.find(x => x.name === ctxTarget.name);
  closeCtx();
  if (!g) return toast("Group Not Found", true);
  if (act === "delete") {
    if (g.name === selectedgroup) return toast("You can't delete active group.", true);
    groups = groups.filter(x => x !== g);
    save();
    render();
    toast("Group Deleted");
  } else if (act === "export") {
    const blob = new Blob([JSON.stringify(g.accounts, null, 2)], { type: "application/json" });
    chrome.downloads.download({ url: URL.createObjectURL(blob), filename: g.name + ".json" });
    toast("Group Exported");
  } else if (act === "import") {
    fileInput.value = "";
    fileInput.onchange = () => {
      const f = fileInput.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        let parsed;
        try { parsed = JSON.parse(rd.result); }
        catch (err) { return toast("Invalid JSON", true); }
        const accounts = normalizeAccounts(parsed);
        if (!accounts) return toast("Invalid JSON", true);
        /* 闭包里的 g 可能在读文件期间已被删除，按组名重新查一次再写 */
        const target = groups.find(x => x.name === g.name);
        if (!target) return toast("Group Not Found", true);
        target.accounts = accounts;
        save();
        render();
        toast("Group Imported");
      };
      rd.readAsText(f);
    };
    fileInput.click();
  }
});

document.addEventListener("click", e => { if (!(e.target instanceof Element) || !e.target.closest(".ctxmenu")) closeCtx(); });
document.addEventListener("contextmenu", e => { if (!(e.target instanceof Element) || !e.target.closest(".account,.rail-group")) closeCtx(); });
$("#accounts").addEventListener("scroll", closeCtx);
window.addEventListener("blur", closeCtx);

/* ---------- 点账号卡片 → 用该 token 登录 ---------- */
$("#accounts").addEventListener("click", e => {
  /* 拖拽结束后浏览器可能补一次 click，吞掉，否则会误登录 */
  if (dragGuard) { dragGuard = false; return; }
  const card = e.target.closest(".account");
  if (!card) return;
  const g = groups.find(x => x.name === selectedgroup);
  const i = +card.dataset.index;
  const a = g && g.accounts[i];
  if (!a || !a.token) return toast("No token for this account", true);
  messageContent(a.token, i);
});

/* ============================================================
   拖拽排序
   - 账号在列表内拖  → 改顺序
   - 账号拖到左侧组  → 换组（套用同一套去重规则）
   - 组在左侧内拖    → 改组顺序
   ============================================================ */
let drag = null;       /* { kind:"account"|"group", group, index } */
let dragGuard = false; /* 拖拽刚结束 → 吞掉紧随其后的那次 click */

function endDrag() {
  drag = null;
  const line = $("#dropLine");
  if (line) line.classList.remove("show");
  $$(".dragging").forEach(el => el.classList.remove("dragging"));
  $$(".drop-target").forEach(el => el.classList.remove("drop-target"));
  $(".rail").classList.remove("acc-dragging");
}

/* 落点下标 = “插到第几个之前”：拿鼠标 Y 跟每个元素的中线比 */
function dropIndexAt(container, sel, clientY) {
  const els = $$(sel, container);
  for (let i = 0; i < els.length; i++) {
    const r = els[i].getBoundingClientRect();
    if (clientY < r.top + r.height / 2) return i;
  }
  return els.length;
}
function nearestGroup(clientY) {
  const els = $$(".rail-group", $("#groups"));
  if (!els.length) return null;
  let best = els[0], bd = Infinity;
  els.forEach(el => {
    const r = el.getBoundingClientRect();
    const d = Math.abs(clientY - (r.top + r.height / 2));
    if (d < bd) { bd = d; best = el; }
  });
  return best;
}
function showDropLine(index) {
  const line = $("#dropLine");
  if (!line) return;
  const cards = $$(".account", $("#accounts"));
  let y = 12;
  if (cards.length) {
    if (index < cards.length) y = cards[index].offsetTop - 5;
    else { const last = cards[cards.length - 1]; y = last.offsetTop + last.offsetHeight + 5; }
  }
  line.style.top = y + "px";
  line.classList.add("show");
}
function markTarget(el) {
  $$(".drop-target").forEach(x => x.classList.remove("drop-target"));
  if (el) el.classList.add("drop-target");
}

/* ---------- 账号 ---------- */
$("#accounts").addEventListener("dragstart", e => {
  const card = e.target.closest(".account");
  if (!card || !groups.some(x => x.name === selectedgroup)) return;
  drag = { kind: "account", group: selectedgroup, index: +card.dataset.index };
  card.classList.add("dragging");
  $(".rail").classList.add("acc-dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", selectedgroup); /* Chrome 必须 setData 才肯拖 */
});
$("#accounts").addEventListener("dragover", e => {
  if (!drag || drag.kind !== "account") return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  showDropLine(dropIndexAt($("#accounts"), ".account", e.clientY));
});
$("#accounts").addEventListener("drop", e => {
  if (!drag || drag.kind !== "account") return;
  e.preventDefault();
  armDragGuard();
  const to = dropIndexAt($("#accounts"), ".account", e.clientY);
  const d = drag; endDrag();
  moveAccount(d.group, d.index, d.group, to);
});

/* ---------- 左侧：账号换组 + 组排序 ---------- */
$("#groups").addEventListener("dragstart", e => {
  const el = e.target.closest(".rail-group");
  if (!el) return;
  drag = { kind: "group", index: groups.findIndex(x => x.name === el.dataset.group) };
  el.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", el.dataset.group);
});
$("#groups").addEventListener("dragover", e => {
  if (!drag) return;
  if (drag.kind === "account") {
    const el = nearestGroup(e.clientY);
    if (!el || el.dataset.group === drag.group) { markTarget(null); return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    markTarget(el);
  } else {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    markTarget(nearestGroup(e.clientY));
  }
});
$("#groups").addEventListener("drop", e => {
  if (!drag) return;
  e.preventDefault();
  armDragGuard();
  const d = drag;
  if (d.kind === "account") {
    const el = nearestGroup(e.clientY);
    endDrag();
    if (el) moveAccount(d.group, d.index, el.dataset.group, Infinity);
  } else {
    const to = dropIndexAt($("#groups"), ".rail-group", e.clientY);
    endDrag();
    moveGroup(d.index, to);
  }
});

/* 拖拽收尾。
   坑：drop 后 render() 会把被拖的元素从 DOM 里摘掉，而 dragend 是在那个
   已脱壳的元素上派发的 —— 冒泡不到 document。所以 drop 分支里必须自己上锁，
   不能只靠下面这个监听器。 */
let dragGuardTimer = 0;
function armDragGuard() {
  dragGuard = true;
  clearTimeout(dragGuardTimer);
  dragGuardTimer = setTimeout(() => { dragGuard = false; }, 80);
}
document.addEventListener("dragend", () => { armDragGuard(); endDrag(); });

/* ---------- 数据搬运 ---------- */
function moveAccount(fromName, fromIdx, toName, toIdx) {
  const src = groups.find(x => x.name === fromName);
  const dst = groups.find(x => x.name === toName);
  if (!src || !dst) return;
  const item = src.accounts[fromIdx];
  if (!item) return;
  /* 兜底：同组内“移到末尾”没意义，可能是落点误算，直接不动 */
  if (src === dst && toIdx === Infinity) return;
  /* 跨组时套用和“添加账号”完全一样的去重规则 */
  if (src !== dst && dst.accounts.some(a => a.token === item.token)) return toast("Account Already Exist", true);
  src.accounts.splice(fromIdx, 1);
  let at;
  if (src === dst) {
    at = toIdx > fromIdx ? toIdx - 1 : toIdx;
    if (at === fromIdx) { src.accounts.splice(fromIdx, 0, item); return; } /* 原地没动：不重排、不重渲染 */
  } else {
    at = dst.accounts.length;
  }
  dst.accounts.splice(at, 0, item);
  save();
  render(true);
  if (src !== dst) toast("Moved to " + dst.name);
}
function moveGroup(from, to) {
  if (from < 0 || to < 0 || from === to) return;
  const [g] = groups.splice(from, 1);
  groups.splice(to > from ? to - 1 : to, 0, g);
  save();
  render(true);
}

/* tooltip：挂在 .popup 层，不跟 .groups 的滚动裁剪打架 */
const tipEl = $("#tip");
const popupEl = $("#popup");
function showTip(el) {
  const text = el.dataset.tip;
  if (!text) return;
  const pr = popupEl.getBoundingClientRect(), r = el.getBoundingClientRect();
  tipEl.textContent = text;
  tipEl.style.top = (r.top - pr.top + r.height / 2) + "px";
  tipEl.classList.add("show");
}
$(".rail").addEventListener("mouseover", e => {
  const el = e.target.closest("[data-tip]");
  if (el) showTip(el);
});
$(".rail").addEventListener("mouseout", e => {
  if (e.target.closest("[data-tip]")) tipEl.classList.remove("show");
});

/* ---------- 启动：从 chrome.storage 读回，再渲染 ---------- */
chrome.storage.local.get(null, a => {
  groups = Array.isArray(a.Group) ? a.Group : [];
  selectedgroup = a.Selected || (groups[0] && groups[0].name) || null;
  /* 首次运行一个组都没有：建一个 Default，否则连账号都没法加。
     这段以前在 background 里，右键菜单删掉后挪过来的。 */
  if (!groups.length) {
    groups = [{ name: "Default", accounts: [] }];
    selectedgroup = "Default";
    save();
  }
  render();
});
