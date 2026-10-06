/* この画面は2つの場所で動く。
   ・GitHub Pages … ふつうのページ。Apps Script へは fetch で問い合わせる
   ・Apps Script のURL … Google の枠(iframe)の中。Apps Script へは google.script.run で問い合わせる
   どちらで動いているかは、Google が入れてくれる google.script があるかで見分ける */
const IN_GAS = typeof google !== 'undefined' && !!(google.script && google.script.run);
// プログラムの版。サーバー(Code.gs)の CODE_VERSION と同じにしておく
const CODE_VERSION = '2026-10-06c';

/* ---------- 読み込み中の画面で止まったままにしない ----------
   思わぬエラーや、サーバーの返事が来ないときに、アイコンが回り続けるだけにならないよう、
   エラーの中身を画面に出し、「再読み込み」「原因を調べる」を出す(20秒待っても始まらないときも) */
let booted = false;   // ログイン画面かいつもの画面を、一度でも出せたら true
function bootFail(msg){
  if (booted) return;
  booted = true;
  const sp = document.getElementById('splash');
  if (sp) sp.remove();
  const tabs = document.getElementById('tabs');
  if (tabs) tabs.hidden = true;
  const view = document.getElementById('view');
  if (!view) return;
  const esc2 = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  view.innerHTML = '<div class="fatal"><p style="font-weight:700">うまく読み込めませんでした</p>' +
    '<p class="small muted" style="word-break:break-all">' + esc2(msg) + '</p>' +
    '<div class="row" style="justify-content:center"><button class="btn" data-act="pageReload">再読み込み</button>' +
    '<button class="btn primary" data-act="diagnose">原因を調べる</button></div><div id="diag"></div>' +
    '<p class="small muted" style="margin-top:12px">直らないときは、この画面のスクショを管理者に送ってください。</p></div>';
}
window.addEventListener('error', e => bootFail('エラー: ' + (e.message || e)));
window.addEventListener('unhandledrejection', e => bootFail('エラー: ' + ((e.reason && e.reason.message) || e.reason)));
setTimeout(() => bootFail('読み込みに時間がかかっています(20秒)。電波を確認して「再読み込み」を押してください。'), 20000);

/* ほかのサイトの枠(iframe)の中に埋め込まれていたら、何も表示しない。
   見えない枠に重ねて押させる「なりすまし操作(クリックジャッキング)」を防ぐため。
   Apps Script の画面は、Google 自身の枠の中で動くのが正しい姿なので対象外 */
if (!IN_GAS && window.top !== window.self) {
  document.documentElement.innerHTML = '';
  throw new Error('このページは埋め込んで使えません');
}

const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY = {'出席':0,'遅刻':1,'早退':2,'学校欠席・早退':3,'サークル欠席':4};
const SYMBOL = {'出席':'○','遅刻':'遅','早退':'早','学校欠席・早退':'学','サークル欠席':'欠'};
const PRESENT = ['出席','遅刻','早退'];
const ABSENT = ['学校欠席・早退','サークル欠席'];
/** ボタンの中で折り返す位置(「サークル|欠席」「学校欠席・|早退」) */
const btnLabel = s => s.replace('サークル', 'サークル<wbr>').replace('・', '・<wbr>');
const WD = ['日','月','火','水','木','金','土'];
const MAX_IMAGES = 4;

/* 線画アイコン。絵文字は端末ごとに絵柄が変わってしまうので使わない */
const ICON = {
  att:'<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="m8 12.3 2.8 2.8L16.2 9.5"/>',
  sum:'<rect x="3.5" y="4.5" width="17" height="15" rx="3.5"/><path d="M3.5 9.5h17M9.5 9.5v10"/>',
  memo:'<path d="M6 3.5h8.5l4 4v11.5a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V5A1.5 1.5 0 0 1 6 3.5z"/><path d="M8.5 11.5h7M8.5 15.5h4.5"/>',
  set:'<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  sub:'<path d="M4 13.5h4.5l1.5 2.5h4l1.5-2.5H20"/><path d="M6.8 4.5h10.4L20 13.5V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18v-4.5z"/>',
  kan:'<rect x="3.5" y="9.5" width="17" height="10" rx="2.5"/><path d="m3.8 9.3 15.4-4.1-.8-2.9L3 6.4z"/><path d="m8.2 5.2 2.6 2.9M13.3 3.8l2.6 2.9"/>',
  reload:'<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
  left:'<path d="m14.5 6-6 6 6 6"/>',
  right:'<path d="m9.5 6 6 6-6 6"/>',
  edit:'<path d="M4.5 19.5h4l10-10-4-4-10 10v4z"/><path d="m13 7 4 4"/>',
  pin:'<path d="M9 3.5h6M10 3.5v5L7 12v1.5h10V12l-3-3.5v-5M12 13.5v7"/>',
  cam:'<rect x="3.5" y="6.5" width="17" height="13" rx="3"/><circle cx="12" cy="13" r="3.5"/><path d="M9 6.5 10.5 4h3L15 6.5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  close:'<path d="M6 6l12 12M18 6 6 18"/>',
  lock:'<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  chat:'<path d="M4.5 6a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4 3.5V16h0a1.5 1.5 0 0 1-1.5-1.5z"/>',
  bell:'<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  smile:'<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14a4 4 0 0 0 7 0"/><path d="M9.5 9.5h0M14.5 9.5h0" stroke-width="2.4"/>',
  send:'<path d="M4.5 12 19.5 5l-4 14-3.5-5.5z"/><path d="m12 13.5 7.5-8.5"/>',
};
const icon = (n, cls) => `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;

let S = null;            // サーバーから取ってきたデータ
let tab = 'att';
let curDate = null;
const chkCur = {};       // 提出チェックで開いている回(感想=締切日の水曜 / 提出物=活動日)
let memoKind = '共有';   // 共有 / フィードバック / 個人
const forms = {};        // メモ入力欄の中身(種類ごと)
let memoFilter = {tag:'', target:'', fb:''};
let accDraft = null;     // アカウント編集用の下書き
let issued = null;       // さっき発行したログインキー(この画面にいるあいだだけ見せる)
let pending = {};        // 未送信の出欠と、提出チェックの印(kind:'kan' / 'sub')
let saveTimer = null, saving = false;
let sheet = null;        // 開いている編集シート
const openThreads = {};  // 返信を広げているメモ
let pickerFor = null;    // リアクションを選んでいるメモ
const replyDrafts = {};  // 書きかけの返信(描き直しても消えないように)
const imgCache = {};     // 画像ID → data URL
const imgLoading = {};

/* ---------- ログインキーのキー ----------
   管理者が発行した「…/exec?key=○○」を開くと、その○○をこの端末に覚えておく。
   以後はふつうのURLで開いても、覚えたキーでだれかが分かる。キーは鍵と同じなので、画面には出さない */
let TOKEN = '';
try { TOKEN = localStorage.getItem('loginKey') || ''; } catch (e) {}
function setToken(t){
  TOKEN = t || '';
  try { if (TOKEN) localStorage.setItem('loginKey', TOKEN); else localStorage.removeItem('loginKey'); } catch (e) {}
}
/**
 * 入力やリンクから、ログインキーだけを取り出す。
 * キーは8文字(見間違えやすい 0/O・1/I/L を抜いた数字と英大文字)。区切りの「-」や空白、小文字でもOK。
 * 前の形(16進数40文字以上)も受け付ける
 */
const KEY_RE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/;
function pickKey(s){
  s = String(s || '').trim();
  const m = s.match(/[?&]key=([^&#\s]+)/);
  if (m) { try { s = decodeURIComponent(m[1]); } catch (e) { s = m[1]; } }
  if (/^[0-9a-f]{40,}$/i.test(s)) return s.toLowerCase();
  const k = s.toUpperCase().replace(/[\s\-‐ー−]/g, '');
  return KEY_RE.test(k) ? k : '';
}
/** 開いたURLの ?key= を読む(前の方式のリンク用。Apps Script の中では、外側のURLを Google 経由で読む) */
function readUrlParams(){
  if (IN_GAS) {
    return new Promise(res => {
      try { google.script.url.getLocation(loc => res(loc.parameter || {})); } catch (e) { res({}); }
    });
  }
  try { return Promise.resolve(Object.fromEntries(new URLSearchParams(location.search))); } catch (e) { return Promise.resolve({}); }
}
/** URLからキーを消す(履歴・スクショ・共有に残さない) */
function clearUrlParams(p){
  if (!p.key) return;
  try {
    if (IN_GAS) google.script.history.replace(null, {}, '');
    else history.replaceState(null, '', location.pathname + location.hash);
  } catch (e) {}
}

async function takeKeyFromUrl(){
  try {
    const q = await readUrlParams();
    const k = pickKey(q.key);
    if (k) {
      if (k !== TOKEN) clearSnap();
      setToken(k);
    }
    clearUrlParams(q);
  } catch (e) {}
}

/* ---------- サーバー呼び出し ----------
   Apps Script の呼び出し口(doPost)に {fn, key, args} を送る。
   ・Content-Type を text/plain にするのは、ブラウザの事前確認(プリフライト)を起こさないため
   ・credentials:'omit' で、Googleのログイン情報(クッキー)は一切送らない。本人かどうかはキーだけで決まる
   ・60秒で打ち切る(電波が悪いときに、いつまでも「保存中」にしない) */
function call(fn, ...args){
  // Apps Script の画面の中なら、Google の仕組みでそのまま呼ぶ(キーを先頭に付ける)
  if (IN_GAS) {
    return new Promise((res, rej) => {
      // 返事が来ないまま待ち続けないよう、60秒で打ち切る
      const t = setTimeout(() => rej(new Error('時間がかかりすぎたので打ち切りました。電波を確認してください')), 60000);
      google.script.run
        .withSuccessHandler(v => { clearTimeout(t); res(v); })
        .withFailureHandler(e => { clearTimeout(t); rej(e); })
        .api(fn, TOKEN, args);
    });
  }
  const url = (window.CONFIG || {}).API_URL;
  if (!url) return Promise.reject(new Error('config.js の API_URL が空です。管理者に設定してもらってください。'));
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), 60000) : null;
  return fetch(url, {
    method: 'POST', body: JSON.stringify({fn, key: TOKEN, args}),
    headers: {'Content-Type': 'text/plain;charset=utf-8'},
    credentials: 'omit', redirect: 'follow', cache: 'no-store', referrerPolicy: 'no-referrer',
    signal: ctl ? ctl.signal : undefined,
  }).then(r => {
    if (!r.ok) throw new Error('サーバーに届きませんでした(' + r.status + ')');
    return r.json();
  }, e => {
    throw new Error(e && e.name === 'AbortError' ? '時間がかかりすぎたので打ち切りました。電波を確認してください' : '電波が悪いか、サーバーに届きませんでした');
  }).then(res => {
    if (!res || !res.ok) throw new Error((res && res.error) || 'エラーが起きました');
    return res.data;
  }).finally(() => { if (timer) clearTimeout(timer); });
}
const errMsg = e => (e && e.message ? e.message : String(e)).replace(/^(Exception|Error):\s*/, '');

function toast(msg, err){
  const t = $('#toast');
  t.textContent = msg; t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.className = '', Math.max(err ? 4500 : 2000, String(msg).length * 70));   // 長い知らせは長めに出す
}

function ingest(d){
  S = d;
  S.att = {};
  d.attendance.forEach(a => { (S.att[a.date] = S.att[a.date] || {})[a.id] = a; });
  // 未送信の変更は画面上に残す
  S.chk = {};
  Object.keys(CHK).forEach(k => {
    S.chk[k] = {};
    (CHK[k].data() || []).forEach(r => { (S.chk[k][r.key] = S.chk[k][r.key] || {})[r.id] = r; });
  });
  Object.values(pending).forEach(c => c.kind ? applyChk(c.kind, c.key, c.id, c.status) : applyRec(c.date, c.id, c));
  S.byId = {};
  d.roster.forEach(m => S.byId[m.id] = m);
  S.dayBy = {};
  d.days.forEach(x => S.dayBy[x.date] = x);
  S.repliesBy = {}; S.reactsBy = {};
  d.replies.forEach(r => (S.repliesBy[r.memoId] = S.repliesBy[r.memoId] || []).push(r));
  d.reactions.forEach(r => (S.reactsBy[r.memoId] = S.reactsBy[r.memoId] || []).push(r));
  if (!S.dayBy[curDate]) curDate = defaultDate();
  Object.keys(CHK).forEach(k => {
    if (CHK[k].cfg() && (!chkCur[k] || CHK[k].keys().indexOf(chkCur[k]) < 0)) chkCur[k] = CHK[k].def();
  });
}

async function load(fresh){
  try {
    const d = await call('getAll', !!fresh);
    ingest(d);
    saveSnap(d);
    $('#tabs').hidden = false;
    render();
  } catch (e) {
    const msg = errMsg(e);
    // キーが無い・使えない。使えないキーは覚えておいても仕方ないので捨てる
    if (/^\[LOGIN\]/.test(msg)) { setToken(''); clearSnap(); S = null; showLogin(msg.replace(/^\[LOGIN\]\s*/, '')); hideSplash(); return; }
    // 使う資格がない(初期設定前など)ときだけ画面を閉じる。
    // 電波が悪いだけなら、前回の画面は残したまま知らせる(オフラインで真っ白にしない)
    const denied = /開けません|初期設定/.test(msg);
    if (S && !denied) {
      toast('最新の状態を取れませんでした(前回の内容を表示中)。電波を確認して ↻ を押してください', true);
    } else {
      clearSnap();
      S = null;
      $('#tabs').hidden = true;
      $('#view').innerHTML = `<div class="fatal"><div style="display:flex;justify-content:center;color:var(--ink-dim)">${icon('lock')}</div><p>${esc(msg)}</p>
        <div class="row" style="justify-content:center"><button class="btn" data-act="pageReload">再読み込み</button>
        <button class="btn primary" data-act="diagnose">原因を調べる</button></div><div id="diag"></div></div>`;
    }
  }
  hideSplash();
}

/* ---------- 開けないときの原因調べ ----------
   サーバー側の段階チェック(diagnose)と、ブラウザの種類をまとめて ✓/✕ で出す。
   「この画面のスクショを管理者に送ってください」で、人ごとに違う症状を1枚で伝えられるようにする */
function browserName(){
  const u = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1);
  if (/CriOS/.test(u)) return {name:'Chrome(iPhone/iPad)', risky:false};
  if (/FxiOS/.test(u)) return {name:'Firefox(iPhone/iPad)', risky:false};
  if (/EdgiOS|EdgA|Edg\//.test(u)) return {name:'Edge', risky:false};
  if (/Line\//.test(u)) return {name:'LINEの中のブラウザ', risky:true};
  if (/Instagram|FBAN|FBAV/.test(u)) return {name:'SNSアプリの中のブラウザ', risky:true};
  // Safari は使える。ただし初回の「許可」の小窓をブロックしがちなので、そのときだけの注意として出す
  if (ios) return {name:'Safari(iPhone/iPad)', risky:false};
  if (/Chrome\//.test(u)) return {name:'Chrome', risky:false};
  if (/Safari\//.test(u)) return {name:'Safari(Mac)', risky:false};
  return {name:'不明', risky:false};
}
async function runDiagnose(){
  const box = $('#diag') || (() => { $('#view').insertAdjacentHTML('beforeend', '<div id="diag"></div>'); return $('#diag'); })();
  box.innerHTML = '<p class="muted small" style="margin-top:16px">調べています…</p>';
  const br = browserName();
  const rows = [{name:'ブラウザ: ' + br.name, ok:!br.risky, detail: br.note || '',
    fix: br.risky ? 'アプリの中のブラウザでは、ログインがそのアプリの中にしか残りません。右上のメニューから「ブラウザで開く」を選んで、SafariかChromeで開いてください。' : ''}];
  let result = null;
  // ログイン画面の欄にキーが入っていれば、そのキーで調べる(拒否されたキーの理由を知るため)
  const typed = $('#keyIn') ? pickKey($('#keyIn').value) : '';
  const saved = TOKEN;
  if (typed) TOKEN = typed;
  try { result = await call('diagnose'); rows.push(...result.steps); }
  catch (e) { rows.push({name:'ツールのサーバーに届く', ok:false, detail:errMsg(e), fix:'電波を確認してください。電波が問題ないのにここで止まる場合は、ブラウザをChromeに変えてください。'}); }
  finally { TOKEN = saved; }
  // 画面とサーバーの版がそろっているか(そろっていなければ、どちらかの貼り替え・デプロイが済んでいない)
  const sv = result && result.version;
  rows.splice(1, 0, {name:'画面のプログラムの版', ok:!sv || sv === CODE_VERSION,
    detail: CODE_VERSION + (IN_GAS ? '(Apps Scriptの画面)' : '(GitHubの画面)'),
    fix: 'サーバーの版(' + (sv || '不明') + ')とそろっていません。' + (IN_GAS
      ? 'Apps Scriptで コード.gs と index の両方を最新に貼り替え、「デプロイを管理 → ✎ → 新バージョン」でデプロイし直してください。'
      : 'GitHubの web フォルダと、Apps Scriptの コード.gs の両方を最新にして、Apps Scriptを新バージョンでデプロイし直してください。')});
  const bad = rows.find(r => !r.ok);
  box.innerHTML = `<div class="card" style="text-align:left;margin-top:16px">
    ${rows.map(r => `<div style="display:flex;gap:8px;padding:6px 0;border-top:1px solid var(--line)">
      <b style="color:${r.ok ? 'var(--s0)' : 'var(--alert)'};width:1.2em;flex:none">${r.ok ? '✓' : '✕'}</b>
      <div><div style="font-weight:700;font-size:14px">${esc(r.name)}</div>
      ${r.detail ? `<div class="muted small">${esc(r.detail)}</div>` : ''}
      ${!r.ok && r.fix ? `<div class="small" style="color:var(--alert);margin-top:2px">${esc(r.fix)}</div>` : ''}</div></div>`).join('')}
    <p class="small" style="margin:10px 0 0">${bad ? '<b>いちばん上の ✕ から直してください。</b>' : 'すべて ✓ です。「再読み込み」を押してください。'}
      わからなければ、<b>この画面のスクショを管理者に送ってください</b>。</p>
    <p class="muted small" style="margin:4px 0 0">${esc(result ? result.at : new Date().toLocaleString())}</p></div>`;
}

/* ---------- 前回の中身を端末に覚えておく ----------
   次に開いたとき、サーバーの返事(数秒)を待たずにまず前回の画面を出し、
   裏で最新を取ってきて差し替える。個人メモは入れない。
   端末に保存できない環境(プライベートブラウズなど)では、ふつうに待つだけ。 */
// 形が変わったら番号を上げる(古い形の記憶は読まない)
const SNAP_KEY = 'snap:v2';
const SNAP_DAYS = 14;   // これより古い記憶は使わない(しばらく開いていない端末に昔の中身を出さない)
function saveSnap(d){
  try { localStorage.setItem(SNAP_KEY, JSON.stringify(Object.assign({}, d, {myNotes:[], savedAt:Date.now()}))); } catch (e) {}
}
function readSnap(){
  try {
    localStorage.removeItem('snap:v1');
    const s = JSON.parse(localStorage.getItem(SNAP_KEY));
    return s && s.me && Date.now() - s.savedAt < SNAP_DAYS * 86400000 ? s : null;
  } catch (e) { return null; }
}
function clearSnap(){ try { localStorage.removeItem(SNAP_KEY); } catch (e) {} }

let splashAt = Date.now();
function hideSplash(){
  booted = true;   // 画面を出せたので、「止まったまま」用の見張りはもう要らない
  const sp = $('#splash');
  if (!sp || sp.classList.contains('done')) return;
  // 一瞬で消えるとちらついて見えるので、最低0.6秒は見せる
  setTimeout(() => { sp.classList.add('done'); setTimeout(() => sp.remove(), 400); }, Math.max(0, 600 - (Date.now() - splashAt)));
}

/** ログイン画面。キーを入れて入る。なくした人は、登録したメールに新しいキーを送ってもらえる */
function showLogin(msg){
  $('#tabs').hidden = true;
  $('#view').innerHTML = `<div class="fatal" style="text-align:left">
    <div style="display:flex;justify-content:center;color:var(--ink-dim)">${icon('lock')}</div>
    <h2 style="text-align:center;margin:10px 0 4px;font-size:17px">ログインしてください</h2>
    <p class="small muted" style="text-align:center;margin:0 0 14px">${esc(msg || 'このツールは、メールで届いた「ログインキー」で入ります。')}</p>
    <div class="card">
      <p class="small" style="margin:0 0 8px">メール(または管理者)から届いたログインキー(8文字)を入れてください。</p>
      <input type="text" id="keyIn" placeholder="例:ABCD-EFGH" style="width:100%;font:600 20px/1.2 ui-monospace,Consolas,monospace;letter-spacing:2px;text-align:center;text-transform:uppercase" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" maxlength="200">
      <button class="btn primary wide" style="margin-top:8px" data-act="loginPaste">ログイン</button>
    </div>
    <div class="card" style="margin-top:10px">
      <p class="small" style="margin:0 0 8px"><b>キーをなくした・分からない</b>:登録したメールアドレスを入れると、新しいログインキーがメールで届きます(使うまでは前のキーも使えます)。</p>
      <input type="email" id="recoverMail" placeholder="登録したメールアドレス" style="width:100%" autocomplete="email" autocapitalize="off" spellcheck="false">
      <button class="btn wide" style="margin-top:8px" data-act="recoverSend">キーをメールで受け取る</button>
    </div>
    <p class="small muted" style="margin:12px 0 0">別の端末(スマホとPCなど)では、同じキーを入れればそのまま使えます。</p>
    <div class="row" style="justify-content:center;margin-top:12px"><button class="btn" data-act="diagnose">原因を調べる</button></div>
    <div id="diag"></div></div>`;
}

async function boot(){
  await takeKeyFromUrl();
  if (!TOKEN) { showLogin(); hideSplash(); return; }
  const snap = readSnap();
  if (snap) {
    ingest(snap);
    S.myNotes = [];
    $('#tabs').hidden = false;
    render();
    hideSplash();
  }
  await load(false);
}

/* ---------- リアルタイム更新 ----------
   Apps Script はサーバーから押し出す通信ができないので、画面を開いているあいだ10秒ごとに
   「前に見たときから何か変わった?」(poll)だけを聞き、変わっていたときだけ中身を取り直す。
   ・画面が裏に回っているあいだは聞かない(電池と通信を使わない)。前に戻ってきたらすぐ聞く
   ・自分の保存の途中や、未送信の出欠があるあいだは聞かない(取り直しで上書きしないように) */
let busy = 0;              // 保存など、サーバーとやり取り中の数
let renderLater = false;   // 入力中だったので、描き直しを待たせている
const POLL_MS = 10000;
function typing(){
  const a = document.activeElement;
  return !!(a && a.closest && a.closest('#view') && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox');
}
/** 描き直し。ただし入力中なら、入力欄から離れるまで待つ(書きかけの文字や指の位置を奪わない) */
function safeRender(){
  if (typing()) { renderLater = true; return; }
  renderLater = false;
  render();
}
function flushRenderLater(){ if (renderLater && !typing()) { renderLater = false; render(); } }
document.addEventListener('focusout', () => { if (renderLater) setTimeout(flushRenderLater, 60); });
// 端末によっては入力欄から離れた合図(focusout)が来ないことがあるので、1秒ごとにも確かめる
setInterval(flushRenderLater, 1000);
async function pollOnce(){
  if (!S || !TOKEN || document.hidden || busy || saving || Object.keys(pending).length) return;
  try {
    const r = await call('poll', S.ver);
    if (r.v === S.ver || busy || saving || Object.keys(pending).length) return;
    const d = await call('getAll');
    if (busy || saving || Object.keys(pending).length) return;   // 取り直すあいだに自分が保存を始めたら、その結果を優先
    ingest(d); saveSnap(d); safeRender();
  } catch (e) { /* 電波が悪いだけなら次の回にまた聞く */ }
}
setInterval(pollOnce, POLL_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) pollOnce(); });

/** 保存して、成功したら最新データで描き直す */
async function act(fn, ...args){
  await flush();
  let ok = true;
  busy++;
  try {
    const d = await call(fn, ...args);
    ingest(d);
    saveSnap(d);
    toast(d.message || '保存しました');
  } catch (e) {
    ok = false;
    toast(errMsg(e), true);
  } finally {
    busy--;
  }
  render();
  return ok;
}

/* ---------- 出欠・報告の保存(まとめて送る) ---------- */
function applyRec(date, id, c){
  const day = S.att[date] = S.att[date] || {};
  if (c.status || c.report) day[id] = Object.assign({}, day[id], {date, id, status:c.status, report:c.report, by:S.me.name, at:''});
  else delete day[id];
}
function setRec(date, id, status, report){
  const c = {date, id, status, report};
  applyRec(date, id, c);
  pending[date + '|' + id] = c;
  setSave('未保存…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 700);
}
function mark(date, id, status){
  const r = (S.att[date] || {})[id] || {};
  setRec(date, id, r.status === status ? '' : status, !!r.report);   // 同じボタンをもう一度押すと取り消し
}
function toggleReport(date, id){
  const r = (S.att[date] || {})[id] || {};
  setRec(date, id, r.status || '', !r.report);
}

/* ---------- 提出チェック(提出物・映画の感想) ----------
   回ごとに、出した人に「提出」「遅れ」を付ける。空欄は未提出。部員ID「*」に「なし」で、その回は出さなくていい
   提出物 … 活動日の前日17:00締め切り。回=活動日
   感想   … 毎週水曜17:00締め切り(Teamsに投稿)。回=締切日 */
const CHK = {
  sub: {
    fn: 'saveSubmit', en: 'Submissions', ja: '提出物', what: '提出物', unit: '回',
    cfg: () => S.submitCfg, data: () => S.submit,
    keys: () => subDays(), def: () => { const ks = subDays(); return ks.find(x => x >= S.today) || ks[ks.length - 1] || null; },
    deadline: d => Date.parse(`${addDays(d, -S.submitCfg.daysBefore)}T${S.submitCfg.time}:00+09:00`),
    opt: d => `${fmtDate(d)} ${S.dayBy[d] ? noLabel(S.dayBy[d]) : ''} ・締切 ${fmtDate(addDays(d, -S.submitCfg.daysBefore))} ${S.submitCfg.time}`,
    lead: () => `活動日の${S.submitCfg.daysBefore === 1 ? '前日' : S.submitCfg.daysBefore + '日前'} ${S.submitCfg.time} 締め切り。出した人に印を付けます。`,
  },
  kan: {
    fn: 'saveKanso', en: 'Reviews', ja: '映画の感想', what: '感想', unit: '週',
    cfg: () => S.kansoCfg, data: () => S.kanso,
    keys: () => kanWeeks(), def: () => kanDefaultWeek(),
    deadline: w => Date.parse(`${w}T${S.kansoCfg.time}:00+09:00`),
    opt: w => `${fmtDate(w)} ${S.kansoCfg.time} 締切`,
    lead: () => `毎週水曜 ${S.kansoCfg.time} 締め切り。Teamsの投稿を見て、出した人に印を付けます。`,
  },
};
function applyChk(kind, key, id, status){
  const w = S.chk[kind][key] = S.chk[kind][key] || {};
  if (status) w[id] = {key, id, status, by:S.me.name, at:''};
  else delete w[id];
}
function setChk(kind, key, id, status){
  applyChk(kind, key, id, status);
  pending[kind + '|' + key + '|' + id] = {kind, key, id, status};
  setSave('未保存…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 700);
}
function cmark(kind, key, id, status){
  const r = (S.chk[kind][key] || {})[id] || {};
  setChk(kind, key, id, r.status === status ? '' : status);   // 同じボタンをもう一度押すと取り消し
}
const ymd = s => s.split('-').map(Number);
const addDays = (s, n) => { const [y,m,d] = ymd(s); return new Date(Date.UTC(y, m-1, d + n)).toISOString().slice(0, 10); };
const chkClosed = (kind, key) => Date.now() >= CHK[kind].deadline(key);
const chkOff = (kind, key) => !!(S.chk[kind][key] && S.chk[kind][key]['*']);
/** 次の締切日(今日が水曜なら今日) */
function kanDefaultWeek(){
  const c = S.kansoCfg;
  const w = S.today > c.from ? S.today : c.from;
  const [y,m,d] = ymd(w);
  return addDays(w, (c.weekday - new Date(Date.UTC(y, m-1, d)).getUTCDay() + 7) % 7);
}
/** 感想の選べる締切日(最初の週から、次の締切日まで) */
function kanWeeks(){
  if (!S || !S.kansoCfg) return [];
  const last = kanDefaultWeek(), out = [];
  const [y,m,d] = ymd(S.kansoCfg.from);
  let w = addDays(S.kansoCfg.from, (S.kansoCfg.weekday - new Date(Date.UTC(y, m-1, d)).getUTCDay() + 7) % 7);
  for (; w <= last && out.length < 60; w = addDays(w, 7)) out.push(w);
  return out;
}
/** 提出物の選べる活動日(出欠をとる日のうち、最初の日から次の活動日まで) */
function subDays(){
  if (!S || !S.submitCfg) return [];
  const all = S.days.filter(d => takesAtt(d) && d.date >= S.submitCfg.from).map(d => d.date);
  const next = all.find(x => x >= S.today);
  return next ? all.filter(x => x <= next) : all;
}

async function flush(){
  clearTimeout(saveTimer);
  if (saving) { await new Promise(r => setTimeout(r, 300)); return flush(); }
  const sent = pending;
  const changes = Object.values(sent);
  if (!changes.length) return;
  pending = {};
  saving = true;
  setSave('保存中…');
  try {
    const att = changes.filter(c => !c.kind);
    let r = null;
    if (att.length) {
      r = await call('saveAttendance', att);
      att.forEach(c => { const a = S.att[c.date] && S.att[c.date][c.id]; if (a && !a.at) a.at = r.at; });
      att.forEach(c => { delete sent[c.date + '|' + c.id]; });   // ほかの保存で失敗しても、送れた分は送り直さない
    }
    for (const k of Object.keys(CHK)) {
      const list = changes.filter(c => c.kind === k);
      if (!list.length) continue;
      r = await call(CHK[k].fn, list.map(c => ({key:c.key, id:c.id, status:c.status})));
      list.forEach(c => { delete sent[k + '|' + c.key + '|' + c.id]; });
    }
    setSave('保存しました(' + r.at.slice(11) + ')');
  } catch (e) {
    Object.keys(sent).forEach(k => { if (!pending[k]) pending[k] = sent[k]; });
    setSave('保存できませんでした: ' + errMsg(e) + ' — 5秒後に再試行します', true);
    saveTimer = setTimeout(flush, 5000);
  } finally {
    saving = false;
  }
}
function setSave(t, err){
  setSave.text = t; setSave.err = !!err;
  const el = $('#savebar'); if (el) { el.textContent = t; el.className = err ? 'err' : ''; }
}
window.addEventListener('beforeunload', e => {
  if (Object.keys(pending).length) { e.preventDefault(); e.returnValue = ''; }
});

/* ---------- 共通 ---------- */
const canEdit = () => S.me.role !== '閲覧';
const isAdmin = () => S.me.role === '管理';
const isOff = d => d.type === 'サークル休み' || d.type === '学校休み';
const takesAtt = d => !isOff(d) && !d.noAtt;     // 出欠をつける日か
function fmtDate(s){
  const [y,m,d] = s.split('-').map(Number);
  return `${m}/${d}(${WD[new Date(Date.UTC(y,m-1,d)).getUTCDay()]})`;
}
const fmtTime = t => t ? t.replace('-', '–') : '';
const noLabel = d => d.no ? `第${d.no}回` : (d.type === 'イベント' ? 'イベント' : '');
const wkBadge = w => w ? `<span class="wk ${w}">${w}週</span>` : '';
const grpChip = g => g ? `<span class="grp ${g}" title="${g}班">${g}</span>` : '';
const planBadge = d => d.confirmed ? '' : '<span class="badge plan">予定</span>';
function activeMembers(){
  return S.roster.filter(m => m.active)
    .sort((a,b) => (a.grade + a.id) < (b.grade + b.id) ? -1 : 1);
}
function defaultDate(){
  const act = S.days.filter(takesAtt);
  const past = act.filter(d => d.date <= S.today);
  if (past.length) return past[past.length-1].date;
  return (act[0] || S.days[0] || {}).date || null;
}
/** 大きな英字見出し+日本語の言い直し */
function sec(en, ja, sub){
  return `<div class="sec"><span class="en">${en}</span><h2>${ja}</h2>${sub ? `<p>${sub}</p>` : ''}</div>`;
}
function byGrade(list){
  const g = {};
  list.forEach(m => (g[m.grade] = g[m.grade] || []).push(m));
  return Object.keys(g).sort().map(k => [k, g[k]]);
}
function scrollTop(){ $('#main').scrollTo(0, 0); }

/* 明暗の切り替え。保存は端末ごと(保存できない環境でもその場では効く) */
function currentTheme(){ return document.documentElement.dataset.theme || 'auto'; }
function setTheme(t){
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  try { if (t === 'auto') localStorage.removeItem('theme'); else localStorage.setItem('theme', t); } catch (e) {}
}

/* ---------- 画像 ---------- */
/** 送る前に長辺1600pxのJPEGへ縮める(スマホの写真は1枚5MB近くあり、そのままでは重い) */
function shrink(file){
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);   // 透過PNGの背景が黒くならないように
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('この画像は読み込めませんでした')); };
    img.src = url;
  });
}
/** 描いたあとに、まだ中身のない <img data-img> を順に読み込む */
function hydrateImages(){
  document.querySelectorAll('img[data-img]').forEach(el => {
    const id = el.dataset.img;
    if (imgCache[id]) { el.src = imgCache[id]; el.parentElement.classList.remove('loading'); return; }
    if (imgLoading[id]) return;
    imgLoading[id] = true;
    call('getImage', id).then(src => {
      imgCache[id] = src;
      document.querySelectorAll(`img[data-img="${id}"]`).forEach(x => { x.src = src; x.parentElement.classList.remove('loading'); });
    }).catch(() => {
      document.querySelectorAll(`img[data-img="${id}"]`).forEach(x => { x.alt = '表示できません'; x.parentElement.classList.remove('loading'); });
    }).finally(() => { delete imgLoading[id]; });
  });
}
function picHtml(id){
  return `<button class="pic ${imgCache[id] ? '' : 'loading'}" data-act="viewImg" data-id="${esc(id)}"><img data-img="${esc(id)}" alt=""${imgCache[id] ? ` src="${imgCache[id]}"` : ''}></button>`;
}

/* ---------- 描画 ---------- */
function render(){
  $('#who').textContent = `${S.me.name}(${S.me.role})`;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('#view').innerHTML = ({att:viewAtt, sub:() => viewChk('sub'), kan:() => viewChk('kan'), sum:viewSum, memo:viewMemo, set:viewSet})[tab]();
  renderBell();
  if (tab === 'att' || CHK[tab]) setSave(setSave.text || '', setSave.err);
  hydrateImages();
}

function viewAtt(){
  const i = S.days.findIndex(d => d.date === curDate);
  const d = S.days[i];
  let h = sec('Attendance', '出席をつける');
  if (!d) return h + '<p class="empty">日程がありません。「設定」から追加してください。</p>';
  const rec = S.att[d.date] || {};
  const members = activeMembers();
  const done = members.filter(m => rec[m.id] && rec[m.id].status).length;
  const ed = canEdit();

  h += `<div class="daybar">
    <button class="iconbtn" data-act="prevDay" ${i <= 0 ? 'disabled' : ''} aria-label="前の日">${icon('left')}</button>
    <select data-change="pickDay">${S.days.map(x =>
      `<option value="${x.date}" ${x.date === d.date ? 'selected' : ''}>${fmtDate(x.date)} ${noLabel(x)}${x.wk ? ' ' + x.wk + '週' : ''}${x.title ? ' ' + esc(x.title) : ''}${isOff(x) ? '(' + x.type + ')' : ''}${!x.confirmed ? '(予定)' : ''}${x.date === S.today ? ' ・今日' : ''}</option>`).join('')}</select>
    <button class="iconbtn" data-act="nextDay" ${i >= S.days.length - 1 ? 'disabled' : ''} aria-label="次の日">${icon('right')}</button>
  </div>
  <div class="dayinfo">`;
  if (noLabel(d)) h += `<span class="no">${noLabel(d)}</span>`;
  h += wkBadge(d.wk) + planBadge(d);
  if (isOff(d)) h += `<span class="badge off">${esc(d.type)}</span>`;
  if (d.time) h += `<span class="time">${esc(fmtTime(d.time))}</span>`;
  if (d.title) h += `<b>${esc(d.title)}</b>`;
  if (ed) h += `<button class="btn sm" style="margin-left:auto" data-act="editDay" data-date="${d.date}">${icon('edit', 'sm')}編集</button>`;
  h += `</div>`;
  if (d.note) h += `<div class="muted small">${esc(d.note)}</div>`;
  if (!d.confirmed && ed) {
    h += `<div class="planbar"><span style="flex:1">この日はまだ<b>予定</b>です。日時・回数が決まったら確定してください。</span>
      <button class="btn sm primary" data-act="confirmDay" data-date="${d.date}">確定する</button></div>`;
  }
  if (!takesAtt(d)) {
    return h + `<div class="notice">${isOff(d) ? `この日は「${esc(d.type)}」なので` : 'この日は'}出欠をとらない設定です。${ed ? '変える場合は「編集」から。' : ''}</div>`;
  }
  if (d.wk) {
    const grp = members.filter(m => m.group === d.wk);
    const rep = grp.filter(m => rec[m.id] && rec[m.id].report).length;
    h += `<div class="reportbar">${wkBadge(d.wk)}<span>${d.wk}班の進捗報告</span><span class="count"><b>${rep}</b> / ${grp.length}人 済</span></div>`;
  }
  h += `<div class="legend">${S.statuses.map(s => `<span><i style="background:var(--s${KEY[s]})"></i>${s}</span>`).join('')}
      <span class="count"><b>${done}</b> / ${members.length}人 記録済み</span></div>
    <div class="muted small">学校欠席・早退=学校を休んだ・学校を早退した / サークル欠席=学校には来たがサークルだけ休んだ。もう一度押すと取り消し。</div>
    <div id="savebar"></div>`;
  byGrade(members).forEach(([g, list]) => {
    h += `<h3 class="grade">${esc(g)}年<small>${list.length}人</small></h3><div class="persons">`;
    list.forEach(m => {
      const r = rec[m.id] || {};
      const showRep = (d.wk && m.group === d.wk) || r.report;
      h += `<div class="person"><div class="pname"><b>${esc(m.name)} ${grpChip(m.group)}</b>${r.by ? `<span class="stamp">記録: ${esc(r.by)}</span>` : ''}
          <span class="pacts">
          ${showRep && ed ? `<button class="rep" data-act="fbFor" data-id="${esc(m.id)}" title="この人へのフィードバックを書く">FB</button>` : ''}
          ${showRep ? `<button class="rep ${r.report ? 'on' : ''}" data-act="report" data-id="${esc(m.id)}" ${ed ? '' : 'disabled'}>${r.report ? '✓ 報告済' : '進捗報告'}</button>` : ''}
          </span></div>
        ${m.note ? `<div class="pnote" style="margin:-4px 0 8px">${esc(m.note)}</div>` : ''}
        <div class="seg">${S.statuses.map(s =>
          `<button class="s${KEY[s]} ${r.status === s ? 'on' : ''}" data-act="mark" data-id="${esc(m.id)}" data-s="${s}" ${ed ? '' : 'disabled'}>${btnLabel(s)}</button>`).join('')}</div></div>`;
    });
    h += `</div>`;
  });
  if (!members.length) h += '<p class="empty">在籍中の部員がいません。「設定」→「部員」から追加してください。</p>';
  return h;
}

function viewChk(kind){
  const C = CHK[kind];
  if (!C.cfg()) return sec(C.en, C.ja) + '<p class="empty">サーバー(Apps Script)のコードを最新にすると使えます。</p>';
  const keys = C.keys();
  const k = chkCur[kind];
  const i = keys.indexOf(k);
  let h = sec(C.en, C.ja, esc(C.lead()));
  if (!k) return h + `<p class="empty">まだ${kind === 'sub' ? '活動日' : '週'}がありません。</p>`;
  const ed = canEdit();
  const members = activeMembers();
  const rec = S.chk[kind][k] || {};
  const closed = chkClosed(kind, k);
  h += `<div class="daybar">
    <button class="iconbtn" data-act="chkPrev" data-k="${kind}" ${i <= 0 ? 'disabled' : ''} aria-label="前">${icon('left')}</button>
    <select data-change="pickChk" data-k="${kind}">${keys.slice().reverse().map(x =>
      `<option value="${x}" ${x === k ? 'selected' : ''}>${esc(C.opt(x))}${chkOff(kind, x) ? '(なし)' : ''}</option>`).join('')}</select>
    <button class="iconbtn" data-act="chkNext" data-k="${kind}" ${i >= keys.length - 1 ? 'disabled' : ''} aria-label="次">${icon('right')}</button>
  </div>`;
  if (chkOff(kind, k)) {
    return h + `<div class="notice">この${C.unit}は${C.what}を出さなくていい${C.unit}にしてあります。${ed ? `<div class="row" style="margin-top:8px"><button class="btn sm" data-act="chkOff" data-k="${kind}">${C.what}ありに戻す</button></div>` : ''}</div>`;
  }
  const on = members.filter(m => rec[m.id] && rec[m.id].status === '提出').length;
  const late = members.filter(m => rec[m.id] && rec[m.id].status === '遅れ').length;
  const left = members.filter(m => !rec[m.id]);
  const hrs = Math.ceil((C.deadline(k) - Date.now()) / 3600000);
  h += `<div class="dayinfo"><span class="badge ${closed ? 'off' : 'plan'}">${closed ? '締め切り済み' : hrs <= 48 ? `締め切りまで あと${hrs}時間` : '受付中'}</span>
    <span class="count" style="margin-left:auto"><b>${on + late}</b> / ${members.length}人 提出${late ? `(うち遅れ ${late})` : ''}</span></div>`;
  if (left.length && closed) h += `<div class="alert">未提出: ${left.map(m => esc(m.name)).join('、')}</div>`;
  else if (left.length) h += `<div class="muted small">まだ: ${left.map(m => esc(m.name)).join('、')}</div>`;
  h += `<div class="muted small" style="margin-top:6px">提出=締め切りまでに出した / 遅れ=締め切りのあとに出した。もう一度押すと取り消し。</div><div id="savebar"></div>`;
  byGrade(members).forEach(([g, list]) => {
    h += `<h3 class="grade">${esc(g)}年<small>${list.length}人</small></h3><div class="persons">`;
    list.forEach(m => {
      const r = rec[m.id] || {};
      h += `<div class="person"><div class="pname"><b>${esc(m.name)} ${grpChip(m.group)}</b>${r.by ? `<span class="stamp">記録: ${esc(r.by)}</span>` : ''}</div>
        <div class="seg seg2">${['提出', '遅れ'].map((s, n) =>
          `<button class="s${n ? 1 : 0} ${r.status === s ? 'on' : ''}" data-act="cmark" data-k="${kind}" data-id="${esc(m.id)}" data-s="${s}" ${ed ? '' : 'disabled'}>${s}</button>`).join('')}</div></div>`;
    });
    h += `</div>`;
  });
  if (!members.length) h += '<p class="empty">在籍中の部員がいません。</p>';
  if (ed) h += `<div class="row" style="margin-top:14px"><button class="btn sm" data-act="chkOff" data-k="${kind}">この${C.unit}は${C.what}なしにする</button></div>`;
  return h;
}

/** 部員ごとの提出数(締め切りが過ぎた回だけ数える) */
function chkStats(kind){
  const keys = CHK[kind].cfg() ? CHK[kind].keys().filter(k => chkClosed(kind, k) && !chkOff(kind, k)) : [];
  const out = {};
  activeMembers().forEach(m => {
    let on = 0, late = 0;
    keys.forEach(k => { const r = (S.chk[kind][k] || {})[m.id]; if (r && r.status === '提出') on++; else if (r && r.status === '遅れ') late++; });
    // 提出率は、遅れて出した分も「出した」に数える(遅れは別に表示する)
    out[m.id] = {on, late, due: keys.length, rate: keys.length ? Math.round((on + late) / keys.length * 100) : null};
  });
  return out;
}
const chkCell = x => x && x.due
  ? `<span class="rate ${x.rate < 60 ? 'low' : ''}">${x.rate}%</span><div class="small muted">${x.on + x.late}/${x.due}${x.late ? `・遅れ${x.late}` : ''}</div>` : '-';
/** 全員の平均提出率(まだ締め切りが来ていなければ null) */
function chkAvg(stats){
  const list = Object.values(stats).filter(x => x.rate != null);
  return list.length ? Math.round(list.reduce((n, x) => n + x.rate, 0) / list.length) : null;
}

function computeStats(){
  const days = S.days.filter(takesAtt);   // イベントも出欠は数える(回数には入らない)
  return activeMembers().map(m => {
    const c = {}; S.statuses.forEach(s => c[s] = 0);
    const seq = [];
    let reported = 0, due = 0;
    days.forEach(d => {
      const r = S.att[d.date] && S.att[d.date][m.id];
      if (r && r.status) { c[r.status]++; seq.push(r.status); }
      if (r && r.report) reported++;
      if (m.group && d.wk === m.group && d.date <= S.today) due++;
    });
    const recorded = seq.length;
    const present = PRESENT.reduce((n, s) => n + c[s], 0);
    // 学校欠席・早退は「そもそも学校に来られなかった」ので、サークルの出席率の計算から外す(公欠のような扱い)
    const counted = recorded - c['学校欠席・早退'];
    // 続けて欠席の警告は、サークル欠席だけを数える。学校欠席の回は飛ばす(数えないし、途切れさせもしない)
    let streak = 0;
    for (let k = seq.length - 1; k >= 0; k--) {
      if (seq[k] === '学校欠席・早退') continue;
      if (seq[k] !== 'サークル欠席') break;
      streak++;
    }
    return {m, c, recorded, rate: counted ? Math.round(present / counted * 100) : null, streak, reported, due};
  });
}

function viewSum(){
  const st = computeStats();
  const ss = chkStats('sub'), ks = chkStats('kan');
  const warn = st.filter(x => x.streak >= 2);
  const rated = st.filter(x => x.rate != null);
  const avg = rated.length ? Math.round(rated.reduce((n, x) => n + x.rate, 0) / rated.length) : null;
  const held = S.days.filter(d => d.no && S.att[d.date] && Object.values(S.att[d.date]).some(r => r.status));
  const events = S.days.filter(d => d.type === 'イベント' && d.date <= S.today).length;
  let h = sec('Summary', '出席の一覧', '出席率は (出席+遅刻+早退) ÷ (記録のある回数 − 学校欠席・早退)。学校を休んだ回は出席率を下げません。休みの日も数えません。');
  if (warn.length) {
    h += `<div class="alert">サークルを続けて欠席中: ${warn.map(x => `${esc(x.m.name)}(${x.streak}回)`).join('、')}</div>`;
  }
  h += `<div class="stats">
    <div class="stat"><b>${avg == null ? '-' : avg}<small>${avg == null ? '' : '%'}</small></b><span>平均出席率</span><em>RATE</em></div>
    <div class="stat"><b>${held.length ? held[held.length-1].no : 0}<small>回目</small></b><span>最後に記録した回${events ? `<br><span class="muted" style="font-weight:500">ほかにイベント${events}回</span>` : ''}</span><em>SESSIONS</em></div>
    <div class="stat ${warn.length ? 'warn' : ''}"><b>${warn.length}<small>人</small></b><span>サークル欠席が2回以上続いている</span><em>STREAK</em></div>
    <div class="stat"><b>${S.memos.filter(x => x.kind === '共有').length}<small>件</small></b><span>共有メモ</span><em>NOTES</em></div>
    ${[['sub', '提出物の平均提出率', 'SUBMISSIONS'], ['kan', '感想の平均提出率', 'REVIEWS']].map(([k, label, en]) => {
      const v = chkAvg(k === 'sub' ? ss : ks);
      return `<div class="stat"><b>${v == null ? '-' : v}<small>${v == null ? '' : '%'}</small></b><span>${label}</span><em>${en}</em></div>`;
    }).join('')}
  </div>`;
  h += `<h2 class="sub">部員ごとの集計</h2><div class="tablewrap"><table>
    <tr><th class="name">名前</th><th>出席率</th><th>報告</th><th>提出物<br><small>提出率</small></th><th>感想<br><small>提出率</small></th>${S.statuses.map(s => `<th title="${s}"><span class="k${KEY[s]}" style="display:inline-block;width:22px;height:22px;line-height:22px;border-radius:50%">${SYMBOL[s]}</span></th>`).join('')}<th>記録</th></tr>`;
  st.forEach(x => {
    h += `<tr><td class="name">${esc(x.m.name)} ${grpChip(x.m.group)}${x.m.note ? `<div class="pnote">${esc(x.m.note)}</div>` : ''}</td>
      <td class="rate ${x.rate != null && x.rate < 60 ? 'low' : ''}">${x.rate == null ? '-' : x.rate + '%'}</td>
      <td>${x.m.group ? `${x.reported}/${x.due}` : (x.reported || '')}</td>
      <td>${chkCell(ss[x.m.id])}</td><td>${chkCell(ks[x.m.id])}</td>
      ${S.statuses.map(s => `<td>${x.c[s] || ''}</td>`).join('')}<td class="muted">${x.recorded}</td></tr>`;
  });
  h += `</table></div>
    <p class="muted small">○出席 遅=遅刻 早=早退 学=学校を欠席・早退 欠=サークルだけ欠席 / 報告=済み÷自分の班の週の回数(今日まで) / 提出物・感想の提出率=出した数(遅れも含む)÷締め切りが過ぎた回の数</p>`;

  const members = activeMembers();
  const days = S.days.filter(d => takesAtt(d) && (d.date <= S.today || members.some(m => S.att[d.date] && S.att[d.date][m.id])));
  h += `<h2 class="sub">出席表</h2>`;
  if (!days.length) return h + '<p class="empty">まだ記録がありません。</p>';
  h += `<div class="tablewrap"><table><tr><th class="name">名前</th>${days.map(d =>
      `<th title="${esc(d.title)}">${Number(d.date.slice(5,7))}/${Number(d.date.slice(8))}<br><span class="no" style="font-size:11px">${d.no ? d.no + '回' : '行事'}</span>${d.wk ? ' ' + grpChip(d.wk) : ''}</th>`).join('')}</tr>`;
  members.forEach(m => {
    h += `<tr><td class="name">${esc(m.name)}</td>${days.map(d => {
      const r = S.att[d.date] && S.att[d.date][m.id];
      return `<td class="c">${r && r.status ? `<span class="k${KEY[r.status]}" title="${esc(r.status)}">${SYMBOL[r.status]}</span>` : ''}${r && r.report ? '<div class="small" title="進捗報告済み">✓</div>' : ''}</td>`;
    }).join('')}</tr>`;
  });
  h += `</table></div><p class="muted small">✓=進捗報告済み。スプレッドシートの「出席表(一覧)」タブは、開いたときと1時間ごとに自動で最新になります。</p>`;
  return h;
}

/* ---------- メモ ---------- */
function defaultForm(kind){
  if (kind === '個人') return {id:null, body:''};
  if (kind === 'フィードバック') {
    const first = activeMembers().find(m => m.group) || activeMembers()[0] || {};
    // 出欠をとらない日(休みなど)を開いていたら、選べる日のうち直近の日にする
    const date = S.dayBy[curDate] && takesAtt(S.dayBy[curDate]) ? curDate : defaultDate();
    return {kind, id:null, targetId:first.id || '', date, body:'', images:[]};
  }
  return {kind:'共有', id:null, targetId:'全体', tag:'連絡事項', importance:'普通', body:'', images:[]};
}
const curForm = () => forms[memoKind] || (forms[memoKind] = defaultForm(memoKind));

function imagePicker(f){
  return `${f.images.length ? `<div class="pics">${f.images.map((im, i) =>
      `<div class="pic"><img src="${im.data || imgCache[im.id] || ''}" ${im.data || imgCache[im.id] ? '' : `data-img="${esc(im.id)}"`} alt=""><button class="x" data-act="memoImgDel" data-i="${i}" title="外す">✕</button></div>`).join('')}</div>` : ''}
    ${f.images.length < MAX_IMAGES ? `<label class="btn filebtn">${icon('cam', 'sm')}画像<input type="file" accept="image/*" multiple data-change="pickImages"></label>` : `<span class="muted small">画像は${MAX_IMAGES}枚まで</span>`}`;
}

function viewMemo(){
  const shared = S.memos.filter(x => x.kind === '共有'), fb = S.memos.filter(x => x.kind === 'フィードバック');
  let h = sec('Notes', 'メモ') + `<div class="segtabs">
    ${[['共有', shared.length], ['フィードバック', fb.length], ['個人', S.myNotes.length]].map(([k, n]) =>
      `<button data-act="memoKind" data-k="${k}" class="${memoKind === k ? 'on' : ''}">${k === '個人' ? '個人メモ' : k === '共有' ? '共有メモ' : k}<small>${n}</small></button>`).join('')}</div>`;
  if (memoKind === '個人') return h + viewMyNotes();
  const f = curForm();
  const members = activeMembers();
  const ed = canEdit();

  if (memoKind === '共有') {
    if (ed) h += `<div class="card">
      <div class="row" style="margin-bottom:8px">
        <select data-f="targetId" class="grow"><option value="全体">全体</option>${members.map(m =>
          `<option value="${esc(m.id)}" ${f.targetId === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select>
        <select data-f="tag">${S.tags.map(t => `<option ${t === f.tag ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <select data-f="importance">${S.importance.map(t => `<option ${t === f.importance ? 'selected' : ''}>${t}</option>`).join('')}</select>
      </div>
      <textarea data-f="body" placeholder="全員で共有したいことを書く">${esc(f.body)}</textarea>
      <div class="row" style="margin-top:8px">${imagePicker(f)}<span class="grow"></span>
        ${f.id ? '<button class="btn" data-act="memoCancel">やめる</button>' : ''}
        <button class="btn primary" data-act="memoSave" id="memoSaveBtn">${f.id ? '更新する' : '投稿する'}</button></div></div>`;
    const targets = [...new Set(shared.map(x => x.targetId))];
    h += `<div class="filters">
      <select data-change="memoFilterTag"><option value="">すべてのタグ</option>${S.tags.map(t => `<option ${memoFilter.tag === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <select data-change="memoFilterTarget"><option value="">すべての対象</option>${targets.map(id =>
        `<option value="${esc(id)}" ${memoFilter.target === id ? 'selected' : ''}>${esc(memberName(id, shared))}</option>`).join('')}</select></div>`;
    // ピン留めを先頭に、その中では新しい順
    const list = shared.filter(x => (!memoFilter.tag || x.tag === memoFilter.tag) && (!memoFilter.target || x.targetId === memoFilter.target))
      .sort((a, b) => (b.pinned - a.pinned) || (a.createdAt < b.createdAt ? 1 : -1));
    if (!list.length) return h + '<p class="empty">共有メモはまだありません。</p>';
    list.forEach(x => h += memoCard(x));
    return h;
  }

  // フィードバック
  const days = S.days.filter(takesAtt);
  // 選んでいた日が消えた・休みになったときは、画面の表示と中身がずれないよう直近の日にそろえる
  if (!days.some(d => d.date === f.date)) f.date = defaultDate();
  if (ed) h += `<div class="card">
    <div class="row" style="margin-bottom:8px">
      <select data-f="targetId" class="grow">${members.map(m =>
        `<option value="${esc(m.id)}" ${f.targetId === m.id ? 'selected' : ''}>${esc(m.name)}${m.group ? '(' + m.group + '班)' : ''}</option>`).join('')}</select>
      <select data-f="date" class="grow">${days.map(d =>
        `<option value="${d.date}" ${f.date === d.date ? 'selected' : ''}>${fmtDate(d.date)} ${noLabel(d)}${d.wk ? ' ' + d.wk + '週' : ''}</option>`).join('')}</select>
    </div>
    <textarea data-f="body" placeholder="進捗報告へのフィードバックを書く">${esc(f.body)}</textarea>
    <div class="row" style="margin-top:8px">${imagePicker(f)}<span class="grow"></span>
      ${f.id ? '<button class="btn" data-act="memoCancel">やめる</button>' : ''}
      <button class="btn primary" data-act="memoSave" id="memoSaveBtn">${f.id ? '更新する' : '送る'}</button></div></div>`;
  const targets = [...new Set(fb.map(x => x.targetId))];
  h += `<div class="filters"><select data-change="memoFilterFb"><option value="">全員分</option>${targets.map(id =>
      `<option value="${esc(id)}" ${memoFilter.fb === id ? 'selected' : ''}>${esc(memberName(id, fb))}</option>`).join('')}</select></div>`;
  const list = fb.filter(x => !memoFilter.fb || x.targetId === memoFilter.fb)
    .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : (a.date < b.date ? 1 : -1)));
  if (!list.length) return h + '<p class="empty">フィードバックはまだありません。出席画面の「FB」からも書けます。</p>';
  list.forEach(x => h += memoCard(x));
  return h;
}

function memberName(id, list){
  if (id === '全体') return '全体';
  if (S.byId[id]) return S.byId[id].name;
  const x = list.find(m => m.targetId === id);
  return x ? x.targetName : id;
}

function memoCard(x){
  const mine = x.authorEmail === S.me.email;
  const ed = canEdit();
  const target = memberName(x.targetId, [x]);
  const d = x.date && S.dayBy[x.date];
  const meta = x.kind === 'フィードバック'
    ? `<b style="color:var(--ink)">${esc(target)}へ</b>${x.date ? `<span>${fmtDate(x.date)} ${d ? noLabel(d) : ''}</span>${d ? wkBadge(d.wk) : ''}` : ''}`
    : `${x.pinned ? `<span class="pin">${icon('pin', 'sm')}ピン留め</span>` : ''}
       ${x.importance !== '普通' ? `<span class="imp i${S.importance.indexOf(x.importance)}">${esc(x.importance)}</span>` : ''}
       <span class="tag t${S.tags.indexOf(x.tag)}">${esc(x.tag)}</span><span>対象: ${esc(target)}</span>`;
  const replies = S.repliesBy[x.id] || [];
  const open = openThreads[x.id];
  return `<div class="memo ${x.pinned ? 'pinned' : ''}" id="memo-${esc(x.id)}">
    <div class="meta">${meta}</div>
    ${x.body ? `<div class="body">${esc(x.body)}</div>` : ''}
    ${x.images.length ? `<div class="pics">${x.images.map(picHtml).join('')}</div>` : ''}
    <div class="foot"><span><span class="who">${esc(x.authorName)}</span> ・ ${esc(x.createdAt)}${x.updatedAt ? '(編集済み)' : ''}</span><span class="sp"></span>
      ${x.kind === '共有' && ed ? `<button class="linkbtn" data-act="memoPin" data-id="${esc(x.id)}">${icon('pin', 'sm')}${x.pinned ? '外す' : 'ピン留め'}</button>` : ''}
      ${mine && ed ? `<button class="linkbtn" data-act="memoEdit" data-id="${esc(x.id)}">編集</button>` : ''}
      ${(mine && ed) || isAdmin() ? `<button class="linkbtn danger" data-act="memoDelete" data-id="${esc(x.id)}">削除</button>` : ''}
    </div>
    ${reactsHtml(x)}
    ${open ? threadHtml(x, replies) : ''}
  </div>`;
}

/** リアクションの札と、返信を開くボタン */
function reactsHtml(x){
  const ed = canEdit();
  const list = S.reactsBy[x.id] || [];
  const n = (S.repliesBy[x.id] || []).length;
  // 付いている絵文字を、決まった順に並べる
  const chips = S.reactionSet.map(e => {
    const who = list.filter(r => r.emoji === e);
    if (!who.length) return '';
    const mine = who.some(r => r.email === S.me.email);
    return `<button class="rc ${mine ? 'mine' : ''}" data-act="react" data-id="${esc(x.id)}" data-e="${e}" title="${esc(who.map(r => r.name).join('、'))}" ${ed ? '' : 'disabled'}>${e}<b>${who.length}</b></button>`;
  }).join('');
  return `<div class="reacts">${chips}
    ${ed ? (pickerFor === x.id
      ? `<span class="picker">${S.reactionSet.map(e => `<button data-act="react" data-id="${esc(x.id)}" data-e="${e}">${e}</button>`).join('')}</span>`
      : `<button class="rc add" data-act="picker" data-id="${esc(x.id)}" title="リアクションする">${icon('smile', 'sm')}</button>`) : ''}
    <span style="flex:1"></span>
    <button class="linkbtn" data-act="thread" data-id="${esc(x.id)}">${icon('chat', 'sm')}${n ? `返信 ${n}件` : '返信する'}${openThreads[x.id] ? ' ▴' : ''}</button>
  </div>`;
}

function threadHtml(x, replies){
  const ed = canEdit();
  return `<div class="thread">
    ${replies.map(r => `<div class="reply"><div class="rh"><b>${esc(r.authorName)}</b><span>${esc(r.createdAt)}</span>
        ${(r.authorEmail === S.me.email && ed) || isAdmin() ? `<button class="linkbtn danger" style="margin-left:auto" data-act="replyDelete" data-id="${esc(r.id)}">削除</button>` : ''}</div>
      <div class="rb">${esc(r.body)}</div></div>`).join('')}
    ${!replies.length ? '<div class="muted small">まだ返信はありません。</div>' : ''}
    ${ed ? `<div class="replybox"><textarea data-reply="${esc(x.id)}" placeholder="返信を書く">${esc(replyDrafts[x.id] || '')}</textarea>
      <button class="btn primary sm" data-act="replySend" data-id="${esc(x.id)}" style="height:42px">${icon('send', 'sm')}送信</button></div>` : ''}
  </div>`;
}

/* ---------- 通知 ---------- */
function renderBell(){
  const b = $('#bell');
  b.hidden = false;
  const n = S.notifs.filter(x => !x.read).length;
  b.innerHTML = icon('bell') + (n ? `<span class="dot">${n > 99 ? '99+' : n}</span>` : '');
  const t = $('#tabs [data-tab="set"]');
  if (t) { const d = t.querySelector('.dot'); if (n && !d) t.insertAdjacentHTML('beforeend', '<span class="dot"></span>'); if (!n && d) d.remove(); }
  const sb = $('#setBell');
  if (sb) sb.innerHTML = `${icon('bell', 'sm')}通知${n ? `<span class="imp i2" style="margin-left:2px">${n}</span>` : ''}`;
}
function notifText(x){
  const m = S.memos.find(y => y.id === x.memoId);
  const memo = m ? String(m.body || '(画像)').replace(/\s+/g, ' ').slice(0, 24) : '(削除されたメモ)';
  return x.type === '返信'
    ? `<b>${esc(x.fromName)}</b>さんが返信「${esc(x.text)}」<small>「${esc(memo)}」・${esc(x.at)}</small>`
    : `<b>${esc(x.fromName)}</b>さんが ${esc(x.text)} しました<small>「${esc(memo)}」・${esc(x.at)}</small>`;
}
function openNotifs(){
  sheet = {kind:'notifs'};
  const list = S.notifs;
  $('#sheet').innerHTML = `<div class="panel" role="dialog" aria-modal="true">
    <div class="head"><h3>通知</h3><button class="iconbtn" data-act="closeSheet" aria-label="閉じる">${icon('close')}</button></div>
    <div class="body">${list.length ? list.map(x => `<div class="nf ${x.read ? 'read' : ''}"><span class="mark"></span>
        <button class="go" data-act="notifGo" data-id="${esc(x.id)}">${notifText(x)}</button>
        <button class="iconbtn" style="width:32px;height:32px" data-act="notifDel" data-id="${esc(x.id)}" title="この通知を消す">${icon('close', 'sm')}</button></div>`).join('')
      : '<p class="empty">通知はありません。</p>'}
      <p class="muted small">自分のメモへの返信・リアクションと、自分が返信したメモへの返信が届きます。メールで受け取るかは「設定 → 通知」で変えられます。</p></div>
    <div class="foot">${list.length ? `<button class="btn danger" data-act="notifDelAll">すべて消す</button><span style="flex:1"></span>
      <button class="btn" data-act="notifReadAll">すべて既読にする</button>` : '<span style="flex:1"></span><button class="btn" data-act="closeSheet">閉じる</button>'}</div></div>`;
  $('#sheet').classList.add('show');
}
async function markNotifs(ids, action){
  // 先に画面を変えて、あとからサーバーに伝える(押した感触を速くするため)
  S.notifs = action === 'delete'
    ? S.notifs.filter(x => !(ids === 'all' || ids.includes(x.id)))
    : S.notifs.map(x => (ids === 'all' || ids.includes(x.id)) ? {...x, read:true} : x);
  renderBell();
  if (sheet && sheet.kind === 'notifs') openNotifs();
  try { S.notifs = await call('markNotifs', ids, action); renderBell(); }
  catch (e) { toast(errMsg(e), true); }
}
function goToMemo(id){
  const m = S.memos.find(y => y.id === id);
  closeSheet();
  if (!m) return toast('そのメモは削除されています', true);
  tab = 'memo'; memoKind = m.kind; openThreads[id] = true;
  memoFilter = {tag:'', target:'', fb:''};
  render();
  const el = document.getElementById('memo-' + id);
  if (el) { el.scrollIntoView({block:'center'}); el.classList.add('flash'); }
}

/** リアクション・返信は、画面を先に変えてから保存する(1〜2秒待たせないため) */
async function quiet(fn, ...args){
  try { ingest(await call(fn, ...args)); }
  catch (e) { toast(errMsg(e), true); try { ingest(await call('getAll')); } catch (_) {} }
  render();
}
function toggleReactLocal(id, e){
  const list = S.reactsBy[id] = S.reactsBy[id] || [];
  const i = list.findIndex(r => r.emoji === e && r.email === S.me.email);
  if (i >= 0) list.splice(i, 1); else list.push({memoId:id, emoji:e, email:S.me.email, name:S.me.name});
  pickerFor = null;
  render();
  quiet('toggleReaction', id, e);
}

function viewMyNotes(){
  const f = curForm();
  let h = `<div class="privacy">${icon('lock', 'sm')}<span>個人メモは<b>自分にだけ</b>見えます。スプレッドシートには入らず、管理者やオーナーからも見えません(文字のみ・1件2500字まで)。</span></div>
    <div class="card"><textarea data-f="body" placeholder="自分用のメモ">${esc(f.body)}</textarea>
    <div class="row" style="margin-top:8px;justify-content:flex-end">
      ${f.id ? '<button class="btn" data-act="memoCancel">やめる</button>' : ''}
      <button class="btn primary" data-act="noteSave" id="memoSaveBtn">${f.id ? '更新する' : '保存する'}</button></div></div>`;
  if (!S.myNotes.length) return h + '<p class="empty">個人メモはまだありません。</p>';
  h += '<div style="margin-top:14px">';
  S.myNotes.forEach(n => {
    h += `<div class="memo"><div class="body" style="margin-top:0">${esc(n.body)}</div>
      <div class="foot"><span>${esc(n.createdAt)}${n.updatedAt ? '(編集済み)' : ''}</span><span class="sp"></span>
      <button class="linkbtn" data-act="noteEdit" data-id="${esc(n.id)}">編集</button>
      <button class="linkbtn danger" data-act="noteDelete" data-id="${esc(n.id)}">削除</button></div></div>`;
  });
  return h + '</div>';
}

async function saveMemoForm(){
  const f = curForm();
  if (!f.body.trim() && !f.images.length) return toast('本文か画像を入れてください', true);
  if (f.kind === 'フィードバック' && !f.targetId) return toast('相手の部員を選んでください', true);
  const btn = $('#memoSaveBtn');
  if (btn) { btn.disabled = true; btn.textContent = f.images.some(im => !im.id) ? '画像を送信中…' : '送信中…'; }
  try {
    for (const im of f.images) {            // 1枚ずつ送る(失敗しても送れた分は2回送らない)
      if (!im.id) { im.id = await call('uploadImage', im.data); imgCache[im.id] = im.data; }
    }
  } catch (e) {
    toast(errMsg(e), true);
    render();
    return;
  }
  const ok = await act('saveMemo', {id:f.id, kind:f.kind, targetId:f.targetId, tag:f.tag, importance:f.importance,
    date:f.date, body:f.body, images:f.images.map(im => im.id)});
  if (ok) { forms[memoKind] = null; render(); }
}

async function saveNoteForm(){
  const f = curForm();
  if (!f.body.trim()) return toast('本文を入力してください', true);
  const btn = $('#memoSaveBtn');
  if (btn) { if (btn.disabled) return; btn.disabled = true; btn.textContent = '保存中…'; }   // 連打で二重に保存しない
  try {
    S.myNotes = await call('saveMyNote', {id:f.id, body:f.body});
    forms['個人'] = null;
    toast('保存しました');
  } catch (e) { toast(errMsg(e), true); }
  render();
}

/* ---------- 設定 ---------- */
function viewSet(){
  const ed = canEdit();
  const theme = currentTheme();
  let h = sec('Settings', '設定') + `<div class="card" style="margin-bottom:10px">
    <div class="row"><div class="grow"><b>${esc(S.me.name)}</b> <span class="badge">${esc(S.me.role)}</span>
      <div class="muted small">${esc(S.me.email)}</div></div></div>
    <div class="row" style="margin-top:12px">
      <button class="btn" id="setBell" data-act="openNotifs"></button>
      <button class="btn" data-act="reload">${icon('reload', 'sm')}最新の状態にする</button>
      <button class="btn" data-act="logout">この端末からログアウト</button></div>
    <div class="row" style="margin-top:12px"><span class="small">画面の明るさ</span><span class="grow"></span>
      <div class="theme-switch">${[['auto','自動'],['light','明'],['dark','暗']].map(([k, l]) =>
        `<button data-act="theme" data-theme-val="${k}" class="${theme === k ? 'on' : ''}">${l}</button>`).join('')}</div></div></div>`;

  // 通知
  h += `<details data-remember="openNotif" ${viewSet.openNotif ? 'open' : ''}><summary>通知</summary><div class="inner">
    <p class="muted small" style="margin-top:0">自分のメモへの返信・リアクションと、自分が返信したメモへの返信は、この画面の「通知」に届きます(未読があると下の「設定」タブに赤い点が付きます)。
    メールでも受け取るかを選べます(数分おきにまとめて1通。${esc(S.me.email)} あて)。</p>
    <label class="toggle"><span class="tx">返信をメールで知らせる</span><input type="checkbox" class="sw" id="pReply" data-change="mailPref" ${S.me.mail.reply ? 'checked' : ''} ${ed ? '' : 'disabled'}></label>
    <label class="toggle"><span class="tx">リアクションをメールで知らせる</span><input type="checkbox" class="sw" id="pReact" data-change="mailPref" ${S.me.mail.react ? 'checked' : ''} ${ed ? '' : 'disabled'}></label>
  </div></details>`;

  // 日程
  const last = S.days.length ? S.days[S.days.length - 1].date : S.today;
  const plans = S.days.filter(d => !d.confirmed).length;
  h += `<details ${sheet || viewSet.openDays ? 'open' : ''} data-remember="openDays"><summary>日程(${S.days.length}日・うち予定${plans}日)</summary><div class="inner">
    <p class="muted small" style="margin-top:0">
      ・日付を押すと、日時・回数・週・確定・出欠をとるかを編集できます。日付を変えると、その日の出欠もいっしょに移ります(振替)。<br>
      ・「予定」はまだ決まっていない日です。決まったら確定してください。<br>
      ・「通常」の日だけを数えて第◯回を付けます(イベント・休みは数えない)。手で回数を決めると、次からはその続きになります。<br>
      ・A週/B週は「通常」の日がある週(月〜日)ごとに自動で交互です。手で A/B を決めると、そこから交互をやり直します。</p>`;
  if (ed) {
    h += `<div class="row" style="margin-bottom:10px"><button class="btn primary" data-act="newDay">${icon('plus', 'sm')}1日追加</button></div>
    <div class="card" style="margin-bottom:10px;background:var(--ground)"><div class="small" style="margin-bottom:6px;font-weight:700">まとめて追加(曜日ごと・「予定」として入ります)</div>
      <div class="row"><input type="date" id="bStart" value="${S.today}"><span class="small">〜</span><input type="date" id="bEnd" value="${last}"></div>
      <div class="row" style="margin-top:6px">
        <select id="bWd">${WD.map((w, i) => `<option value="${i}" ${i === 3 ? 'selected' : ''}>毎週${w}曜</option>`).join('')}</select>
        <select id="bType">${S.dayTypes.map(t => `<option>${t}</option>`).join('')}</select>
        <span class="grow"></span><button class="btn" data-act="addDays">まとめて追加</button></div>
      <p class="muted small" style="margin:6px 0 0">すでにある日は飛ばします。</p></div>`;
  }
  let month = '';
  S.days.forEach(d => {
    const mo = d.date.slice(0, 7);
    if (mo !== month) { month = mo; h += `<div class="month">${Number(mo.slice(0,4))}年${Number(mo.slice(5))}月</div>`; }
    h += `<button class="day-item ${isOff(d) ? 'inactive' : ''}" data-act="editDay" data-date="${d.date}" ${ed ? '' : 'disabled'}>
      <span class="d">${fmtDate(d.date)}</span>
      <span class="t">${esc([fmtTime(d.time), d.title, isOff(d) ? d.type : '', d.noAtt && !isOff(d) ? '出欠なし' : ''].filter(Boolean).join(' ・ '))}</span>
      <span class="m">${noLabel(d) ? `<span class="no">${noLabel(d)}</span>` : ''}${wkBadge(d.wk)}${planBadge(d)}</span></button>`;
  });
  h += `</div></details>`;

  // 部員
  const roster = [...S.roster].sort((a,b) => (Number(!a.active) + a.grade + a.id) < (Number(!b.active) + b.grade + b.id) ? -1 : 1);
  const cntA = S.roster.filter(m => m.active && m.group === 'A').length, cntB = S.roster.filter(m => m.active && m.group === 'B').length;
  h += `<details data-remember="openMembers" ${viewSet.openMembers ? 'open' : ''}><summary>部員(在籍 ${S.roster.filter(m => m.active).length}人)</summary><div class="inner">
    <p class="muted small" style="margin-top:0">班(A/B)は進捗報告の組み分けです。いまは A班 ${cntA}人・B班 ${cntB}人。備考(志望など)は出席画面と一覧に小さく出ます。<br>
    退部・引退した人は「在籍」を外すと、出席画面から消えます(記録は残ります)。</p>`;
  roster.forEach(m => {
    const dis = ed ? '' : 'disabled';
    h += `<div class="member-row ${m.active ? '' : 'inactive'}">
      <input type="text" value="${esc(m.name)}" data-change="mName" data-id="${esc(m.id)}" ${dis}>
      <label class="small" style="white-space:nowrap;display:flex;align-items:center;gap:4px"><input type="checkbox" data-change="mActive" data-id="${esc(m.id)}" ${m.active ? 'checked' : ''} ${dis}> 在籍</label>
      <div class="sub">
        <select data-change="mGrade" data-id="${esc(m.id)}" ${dis}>${[1,2,3,4].map(g => `<option value="${g}" ${String(g) === String(m.grade) ? 'selected' : ''}>${g}年</option>`).join('')}</select>
        <select data-change="mGroup" data-id="${esc(m.id)}" ${dis}>${[['', '班なし'], ['A', 'A班'], ['B', 'B班']].map(([v, l]) => `<option value="${v}" ${m.group === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input type="text" value="${esc(m.note)}" placeholder="備考(志望など)" data-change="mNote" data-id="${esc(m.id)}" ${dis}>
      </div></div>`;
  });
  if (ed) {
    h += `<div class="row" style="margin-top:10px;border-top:1px solid var(--line);padding-top:10px">
      <input type="text" id="nName" class="grow" placeholder="新しい部員の名前">
      <select id="nGrade">${[1,2,3,4].map(g => `<option value="${g}">${g}年</option>`).join('')}</select>
      <select id="nGroup"><option value="">班なし</option><option>A</option><option>B</option></select>
      <button class="btn primary" data-act="addMember">追加</button></div>`;
  }
  h += `</div></details>`;

  // アカウント(管理者のみ)
  if (isAdmin()) {
    if (!accDraft) accDraft = S.accounts.map(a => ({...a}));
    h += `<details ${accDraft._dirty || issued || viewSet.openAcc ? 'open' : ''} data-remember="openAcc"><summary>アカウント(ツールを使える人)</summary><div class="inner">
      <p class="muted small" style="margin-top:0">管理=すべて(アカウントとキーの管理、ほかの人のメモの削除も) / 入力=出欠・報告・メモ・日程・部員 / 閲覧=見るだけ(個人メモと通知の設定は使える)。<br>
      <b>使ってもらうには</b>:① 行を追加して「保存」 → ② その人の「キーを発行」。キーは本人のメールに自動で届きます。<br>
      キーは鍵と同じです。本人以外に渡さないでください。漏れたときは「作り直す」、やめた人は「無効にする」。なくした人は、ログイン画面から自分でメールで受け取れます。<br>
      メールアドレスは、返信・リアクションの通知メールの宛先と、本人を区別するために使います。</p>`;
    accDraft.forEach((a, i) => {
      const saved = S.accounts.find(x => x.email === a.email);
      const self = a.email === S.me.email;
      h += `<div class="acc-row">
        <input type="email" class="email" value="${esc(a.email)}" placeholder="メールアドレス" data-input="accEmail" data-i="${i}">
        <input type="text" value="${esc(a.name)}" placeholder="表示名" data-input="accName" data-i="${i}">
        <select data-input="accRole" data-i="${i}">${S.roles.map(r => `<option ${r === a.role ? 'selected' : ''}>${r}</option>`).join('')}</select>
        <button class="linkbtn danger" data-act="accDel" data-i="${i}" title="削除">${icon('close', 'sm')}</button>
        <div class="acc-key">${!saved ? '<span class="muted">保存するとキーを発行できます</span>'
          : `<span class="${saved.hasKey ? '' : 'muted'}">${saved.hasKey ? `キー発行済み(${esc(saved.keyAt.slice(0, 10))})${saved.seenAt ? ` ・最終アクセス ${esc(saved.seenAt)}` : ' ・まだ使われていない'}` : 'キー未発行(まだ入れません)'}</span>
             <button class="linkbtn" data-act="keyIssue" data-email="${esc(a.email)}">${saved.hasKey ? '作り直す' : 'キーを発行'}</button>
             ${saved.hasKey && !self ? `<button class="linkbtn danger" data-act="keyRevoke" data-email="${esc(a.email)}">無効にする</button>` : ''}`}</div>
        ${issued && issued.email === a.email ? `<div class="acc-link">
          <div class="small" style="font-weight:700;margin-bottom:4px">${esc(a.name)}さんのログインキー(この画面を閉じると二度と表示されません)</div>
          <div style="font:700 26px/1.2 ui-monospace,Consolas,monospace;letter-spacing:3px;text-align:center;margin:6px 0 8px">${esc(issued.key || '')}</div>
          <div class="small muted" style="margin-bottom:4px">${issued.mailed ? `${esc(issued.email)} にメールで送りました。届かないときは、このキーを直接伝えてください。` : 'メールは送れませんでした。このキーを本人に直接伝えてください。'}</div>
          <div class="row" style="margin-top:6px"><button class="btn sm primary" data-act="keyCopy">キーをコピー</button>
            <a class="btn sm" href="https://line.me/R/msg/text/?${encodeURIComponent('サークル管理ツールのログインキーです(ほかの人には送らないでね)\nキー: ' + (issued.key || ''))}" target="_blank" rel="noopener">LINEで送る</a></div></div>` : ''}
      </div>`;
    });
    h += `<div class="row" style="margin-top:10px"><button class="btn" data-act="accAdd">${icon('plus', 'sm')}行を追加</button><span class="grow"></span>
      ${accDraft._dirty ? '<button class="btn" data-act="accReset">元に戻す</button>' : ''}
      <button class="btn primary" data-act="accSave">保存</button></div></div></details>`;
  }

  // データ
  h += `<details><summary>データ・使い方</summary><div class="inner help">
    <p>データはすべてGoogleスプレッドシートに、画像は同じ場所の「画像」フォルダに保存されています。PCで表として見たいとき・印刷したいときは「出席表(一覧)」タブを使ってください。<b>スプレッドシートを開いたときと1時間ごとに自動で最新になります</b>。すぐ反映したいときは下のボタンで。</p>
    <div class="row" style="margin:10px 0">
      <a class="btn" href="${esc(S.ssUrl)}" target="_blank" rel="noopener">スプレッドシートを開く</a>
      ${ed ? '<button class="btn" data-act="exportTable">今すぐ最新にする</button>' : ''}
      <button class="btn" data-act="diagnose">接続を診断する</button>
    </div>
    <div id="diag"></div>
    <p class="muted small">スマホではこのページを「ホーム画面に追加」するとアプリのように使えます。<br>
    年度の切り替えは、スプレッドシートのメニュー「サークル管理ツール → 新年度に切り替え」から行います(今年度の記録は別ファイルに自動保存)。</p>
  </div></details>`;
  return h;
}

/* ---------- 日程の編集シート ---------- */
function openDayEditor(date){
  const isNew = !date;
  const d = isNew ? {date:'', type:'通常', title:'', note:'', week:'', time:'', noManual:null, confirmed:false, noAtt:false} : S.dayBy[date];
  // 手で決めていないときに自動で付く回数(表示用)
  const auto = isNew ? '' : (d.noManual ? '' : (d.no || ''));
  const [ts, te] = String(d.time || '').split('-');
  sheet = {isNew, from:d.date};
  $('#sheet').innerHTML = `<div class="panel" role="dialog" aria-modal="true">
    <div class="head"><h3>${isNew ? '日程を追加' : fmtDate(d.date)}</h3>${!isNew ? `${noLabel(d) ? `<span class="no">${noLabel(d)}</span>` : ''}${wkBadge(d.wk)}` : ''}
      <button class="iconbtn" data-act="closeSheet" aria-label="閉じる">${icon('close')}</button></div>
    <div class="body">
      <label class="field"><span>日付${!isNew ? '<small>変えると出欠記録もいっしょに移ります</small>' : ''}</span><input type="date" id="eDate" value="${d.date}"></label>
      <div class="two">
        <label class="field"><span>開始</span><input type="time" id="eStart" value="${esc(ts || '')}"></label>
        <label class="field"><span>終了</span><input type="time" id="eEnd" value="${esc(te || '')}"></label>
      </div>
      <div class="two">
        <label class="field"><span>種別</span><select id="eType">${S.dayTypes.map(t => `<option ${t === d.type ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="field"><span>A週/B週</span><select id="eWeek">${[['', '自動'], ['A', 'A週'], ['B', 'B週'], ['なし', '週なし']].map(([v, l]) => `<option value="${v}" ${d.week === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <div class="two no">
        <label class="field" title="数字を入れると、この日をその回にして次から続きで数えます(「通常」の日だけ)"><span>回数<small>空欄=自動</small></span><input type="number" id="eNo" min="1" max="999" inputmode="numeric" value="${d.noManual || ''}" placeholder="${auto ? `${auto}` : '自動'}"></label>
        <label class="field"><span>タイトル</span><input type="text" id="eTitle" value="${esc(d.title)}" placeholder="例: 映画鑑賞"></label>
      </div>
      <label class="field"><span>メモ<small>この日の連絡など</small></span><input type="text" id="eNote" value="${esc(d.note)}" placeholder="例: 部室集合"></label>
      <div class="toggles">
        <label class="toggle"><span class="tx">確定<small>オフ=予定</small></span><input type="checkbox" class="sw" id="eConf" ${d.confirmed ? 'checked' : ''}></label>
        <label class="toggle"><span class="tx">出欠をとる<small>オフ=数えない</small></span><input type="checkbox" class="sw" id="eAtt" ${d.noAtt ? '' : 'checked'}></label>
      </div>
    </div>
    <div class="foot">
      ${!isNew ? '<button class="btn danger" data-act="sheetDelete">削除</button>' : ''}
      <span style="flex:1"></span>
      <button class="btn" data-act="closeSheet">キャンセル</button>
      <button class="btn primary" data-act="sheetSave">保存</button>
    </div></div>`;
  $('#sheet').classList.add('show');
}
function closeSheet(){ sheet = null; $('#sheet').classList.remove('show'); $('#sheet').innerHTML = ''; }
async function saveSheet(){
  const date = $('#eDate').value;
  if (!date) return toast('日付を選んでください', true);
  const s = $('#eStart').value, e = $('#eEnd').value;
  const day = {
    date, type:$('#eType').value, week:$('#eWeek').value,
    time: s || e ? `${s}-${e}`.replace(/-$/, '') : '',
    noManual: $('#eNo').value, title:$('#eTitle').value, note:$('#eNote').value,
    confirmed: $('#eConf').checked, noAtt: !$('#eAtt').checked,
  };
  const {isNew, from} = sheet;
  if (!isNew && from !== date && !confirm(`${fmtDate(from)} を ${fmtDate(date)} に移します。出欠記録もいっしょに移ります。よろしいですか?`)) return;
  if (await act('saveDay', day, {isNew, from})) {
    closeSheet();
    if (from === curDate || isNew) { curDate = date; render(); }
  }
}

/* ---------- 操作 ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-tab]');
  if (t) { tab = t.dataset.tab; issued = null; render(); scrollTop(); return; }
  if (e.target.id === 'sheet') { closeSheet(); return; }     // 板の外側を押したら閉じる
  const b = e.target.closest('[data-act]');
  // リアクションの選択は、ほかの所を押したら閉じる
  if (pickerFor && !(b && ['react', 'picker'].includes(b.dataset.act))) { pickerFor = null; render(); }
  if (!b || b.disabled) return;
  const a = b.dataset.act;
  const i = S ? S.days.findIndex(d => d.date === curDate) : -1;
  if (a === 'diagnose') { runDiagnose(); return; }   // 開けないときにも使うので、読み込み前でも動かす
  if (a === 'pageReload') { location.reload(); return; }
  if (a === 'recoverSend') {
    const mail = $('#recoverMail').value.trim();
    if (!mail) return toast('メールアドレスを入れてください', true);
    b.disabled = true; b.textContent = '送っています…';
    call('requestKeyByEmail', mail)
      .then(r => { toast(r.message); b.textContent = '送りました(届かなければ5分後にもう一度)'; })
      .catch(e => { toast(errMsg(e), true); b.disabled = false; b.textContent = 'メールを送る'; });
    return;
  }
  if (a === 'loginPaste') {
    const k = pickKey($('#keyIn').value);
    if (!k) return toast('ログインキーの形が違います。8文字(例:ABCD-EFGH)で入れてください', true);
    clearSnap(); setToken(k);
    $('#view').innerHTML = '<p class="empty">ログインしています…</p>';
    load(false);
    return;
  }
  if (!S && a !== 'closeViewer') return;   // まだ読み込めていないあいだは何もしない
  if (a === 'closeViewer') { $('#viewer').classList.remove('show'); }
  else if (a === 'openNotifs') openNotifs();
  else if (a === 'logout') {
    if (!confirm('この端末からログアウトしますか?もう一度入るには、ログインキーが必要です。')) return;
    setToken(''); clearSnap(); S = null; showLogin('ログアウトしました。');
  }
  else if (a === 'keyIssue') {
    const email = b.dataset.email;
    const had = (S.accounts.find(x => x.email === email) || {}).hasKey;
    if (had && !confirm('キーを作り直しますか?前のキーは使えなくなります。新しいキーは本人のメールに届きます。')) return;
    act('issueKey', email).then(() => { if (S.issued) { issued = S.issued; accDraft = null; render(); } });
  }
  else if (a === 'keyRevoke') {
    if (confirm('このキーを無効にしますか?その人はツールに入れなくなります。')) act('revokeKey', b.dataset.email);
  }
  else if (a === 'keyCopy') {
    (navigator.clipboard ? navigator.clipboard.writeText(issued.key || '') : Promise.reject())
      .then(() => toast('コピーしました'), () => toast('キーを長押ししてコピーしてください', true));
  }
  else if (a === 'reload') doReload();
  else if (a === 'notifGo') { markNotifs([b.dataset.id], 'read'); goToMemo(S.notifs.find(x => x.id === b.dataset.id).memoId); }
  else if (a === 'notifDel') markNotifs([b.dataset.id], 'delete');
  else if (a === 'notifDelAll') { if (confirm('通知をすべて消しますか?')) markNotifs('all', 'delete'); }
  else if (a === 'notifReadAll') markNotifs('all', 'read');
  else if (a === 'picker') { pickerFor = pickerFor === b.dataset.id ? null : b.dataset.id; render(); }
  else if (a === 'react') toggleReactLocal(b.dataset.id, b.dataset.e);
  else if (a === 'thread') { openThreads[b.dataset.id] = !openThreads[b.dataset.id]; render(); }
  else if (a === 'replySend') {
    const id = b.dataset.id, body = (replyDrafts[id] || '').trim();
    if (!body) return toast('返信を入力してください', true);
    b.disabled = true;
    act('addReply', id, body).then(ok => { if (ok) { delete replyDrafts[id]; render(); } });
  }
  else if (a === 'replyDelete') { if (confirm('この返信を削除しますか?')) act('deleteReply', b.dataset.id); }
  else if (a === 'viewImg') { const src = imgCache[b.dataset.id]; if (src) { $('#viewer img').src = src; $('#viewer').classList.add('show'); } }
  else if (a === 'prevDay' && i > 0) { curDate = S.days[i-1].date; render(); }
  else if (a === 'nextDay' && i < S.days.length - 1) { curDate = S.days[i+1].date; render(); }
  else if (a === 'mark') { mark(curDate, b.dataset.id, b.dataset.s); render(); }
  else if (a === 'cmark') { const k = b.dataset.k; cmark(k, chkCur[k], b.dataset.id, b.dataset.s); render(); }
  else if (a === 'chkOff') {
    const k = b.dataset.k, C = CHK[k], off = chkOff(k, chkCur[k]);
    if (!off && !confirm(`${C.opt(chkCur[k])} を「${C.what}なし」にしますか?(付けた印は残ります)`)) return;
    setChk(k, chkCur[k], '*', off ? '' : 'なし'); render();
  }
  else if (a === 'chkPrev' || a === 'chkNext') {
    const k = b.dataset.k, ks = CHK[k].keys(), n = ks.indexOf(chkCur[k]) + (a === 'chkPrev' ? -1 : 1);
    if (ks[n]) { chkCur[k] = ks[n]; render(); }
  }
  else if (a === 'report') { toggleReport(curDate, b.dataset.id); render(); }
  else if (a === 'fbFor') {
    memoKind = 'フィードバック';
    forms['フィードバック'] = Object.assign(defaultForm('フィードバック'), {targetId:b.dataset.id, date:curDate});
    tab = 'memo'; render(); scrollTop();
  }
  else if (a === 'theme') { setTheme(b.dataset.themeVal); render(); }
  else if (a === 'editDay') openDayEditor(b.dataset.date);
  else if (a === 'newDay') openDayEditor(null);
  else if (a === 'closeSheet') closeSheet();
  else if (a === 'sheetSave') saveSheet();
  else if (a === 'sheetDelete') {
    const date = sheet.from;
    const n = Object.keys(S.att[date] || {}).length;
    if (confirm(`${fmtDate(date)} を日程から削除しますか?` + (n ? `\nこの日の出欠記録 ${n}件も消えます。` : '')))
      act('deleteDay', date).then(ok => ok && closeSheet());
  }
  else if (a === 'confirmDay') { const d = S.dayBy[b.dataset.date]; act('saveDay', {...d, confirmed:true}, {from:d.date}); }
  else if (a === 'memoKind') { memoKind = b.dataset.k; render(); }
  else if (a === 'memoSave') saveMemoForm();
  else if (a === 'noteSave') saveNoteForm();
  else if (a === 'memoImgDel') { curForm().images.splice(Number(b.dataset.i), 1); render(); }
  else if (a === 'memoEdit') {
    const x = S.memos.find(m => m.id === b.dataset.id);
    forms[memoKind] = {kind:x.kind, id:x.id, targetId:x.targetId, tag:x.tag, importance:x.importance, date:x.date, body:x.body, images:x.images.map(id => ({id}))};
    render(); scrollTop();
  }
  else if (a === 'noteEdit') { const n = S.myNotes.find(x => x.id === b.dataset.id); forms['個人'] = {id:n.id, body:n.body}; render(); scrollTop(); }
  else if (a === 'noteDelete') {
    if (confirm('この個人メモを削除しますか?'))
      call('deleteMyNote', b.dataset.id).then(list => { S.myNotes = list; toast('削除しました'); render(); }).catch(err => toast(errMsg(err), true));
  }
  else if (a === 'memoCancel') { forms[memoKind] = null; render(); }
  else if (a === 'memoPin') act('togglePin', b.dataset.id);
  else if (a === 'memoDelete') { if (confirm('このメモを削除しますか?(付いている画像も消えます)')) act('deleteMemo', b.dataset.id); }
  else if (a === 'addDays') {
    act('addDays', {start:$('#bStart').value, end:$('#bEnd').value, weekday:$('#bWd').value, type:$('#bType').value});
  }
  else if (a === 'addMember') {
    const name = $('#nName').value.trim();
    if (!name) return toast('名前を入力してください', true);
    act('saveMember', {name, grade:$('#nGrade').value, group:$('#nGroup').value, active:true});
  }
  else if (a === 'accAdd') { accDraft.push({email:'', name:'', role:'入力'}); accDraft._dirty = true; render(); }
  else if (a === 'accDel') { accDraft.splice(Number(b.dataset.i), 1); accDraft._dirty = true; render(); }
  else if (a === 'accReset') { accDraft = null; render(); }
  else if (a === 'accSave') {
    const list = accDraft.slice(); accDraft = null;
    act('saveAccounts', list).then(ok => { if (!ok) { accDraft = list; accDraft._dirty = true; render(); } });
  }
  else if (a === 'exportTable') act('exportTable');
});

// 設定の折りたたみの開け閉めを覚えておく(保存のたびに描き直しても閉じないように)
document.addEventListener('toggle', e => {
  const k = e.target.dataset && e.target.dataset.remember;
  if (k) viewSet[k] = e.target.open;
}, true);

document.addEventListener('change', async e => {
  const el = e.target;
  if (el.dataset.input === 'accRole' && accDraft) { accDraft[Number(el.dataset.i)].role = el.value; accDraft._dirty = true; render(); return; }
  if (el.dataset.f) { curForm()[el.dataset.f] = el.value; return; }
  const c = el.dataset.change;
  if (!c) return;
  const mem = el.dataset.id && S.byId[el.dataset.id];
  if (c === 'pickDay') { curDate = el.value; render(); }
  if (c === 'pickChk') { chkCur[el.dataset.k] = el.value; render(); }
  else if (c === 'mailPref') act('setMyPrefs', {reply:$('#pReply').checked, react:$('#pReact').checked});
  else if (c === 'mName') { if (el.value.trim()) act('saveMember', {...mem, name:el.value}); else render(); }
  else if (c === 'mGrade') act('saveMember', {...mem, grade:el.value});
  else if (c === 'mGroup') act('saveMember', {...mem, group:el.value});
  else if (c === 'mNote') act('saveMember', {...mem, note:el.value});
  else if (c === 'mActive') act('saveMember', {...mem, active:el.checked});
  else if (c === 'memoFilterTag') { memoFilter.tag = el.value; render(); }
  else if (c === 'memoFilterTarget') { memoFilter.target = el.value; render(); }
  else if (c === 'memoFilterFb') { memoFilter.fb = el.value; render(); }
  else if (c === 'pickImages') {
    const f = curForm();
    const files = [...el.files].slice(0, MAX_IMAGES - f.images.length);
    if (el.files.length > files.length) toast(`画像は${MAX_IMAGES}枚までです`, true);
    for (const file of files) {
      try { f.images.push({data: await shrink(file)}); } catch (err) { toast(errMsg(err), true); }
    }
    render();
  }
});

// 発行したリンクの欄は、押したら全部選ぶ(コピーしやすく)
document.addEventListener('focusin', e => { if (e.target.dataset && e.target.dataset.selectall) e.target.select(); });

document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.f) { curForm()[el.dataset.f] = el.value; return; }
  if (el.dataset.reply) { replyDrafts[el.dataset.reply] = el.value; return; }
  const k = el.dataset.input;
  if (!k || !accDraft) return;
  const a = accDraft[Number(el.dataset.i)];
  if (k === 'accEmail') a.email = el.value;
  if (k === 'accName') a.name = el.value;
  if (k === 'accRole') a.role = el.value;
  if (!accDraft._dirty) { accDraft._dirty = true; const s = document.querySelector('[data-act="accSave"]'); if (s) s.disabled = false; }
});

/* ---------- はじめに ---------- */
$('#tabs').innerHTML = [['att', '出席'], ['sub', '提出物'], ['kan', '感想'], ['sum', '一覧'], ['memo', 'メモ'], ['set', '設定']]
  .map(([k, l]) => `<button data-tab="${k}">${icon(k)}${l}</button>`).join('');
$('#reload').innerHTML = icon('reload');
async function doReload(){
  await flush();
  accDraft = null;
  $('#reload').disabled = true;
  toast('読み込み中…');
  await load(true);
  $('#reload').disabled = false;
  toast('最新の状態にしました');
}
$('#reload').addEventListener('click', doReload);

/* 端で引っぱっても外側のページが動かないようにする。
   指を置いた瞬間に中身がいちばん上(下)にいたら、1pxだけ内側にずらしておく。
   そうすると iPhone はその指の動きを「中身のスクロール」として扱い、外に渡さない */
function keepInside(el){
  el.addEventListener('touchstart', () => {
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 0) return;
    if (el.scrollTop <= 0) el.scrollTop = 1;
    else if (el.scrollTop >= max) el.scrollTop = max - 1;
  }, {passive:true});
}
keepInside($('#main'));
document.addEventListener('touchstart', e => {   // 編集シートの中身も同じ扱いにする
  const b = e.target.closest && e.target.closest('#sheet .body');
  if (b && !b.dataset.kept) { b.dataset.kept = '1'; keepInside(b); }
}, {passive:true, capture:true});

boot();
