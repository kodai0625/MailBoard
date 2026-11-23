/* ============================================================
 *  Mail Board — 画面
 *
 *  1行＝1通の索引を端末に持ち、その上で
 *    アドレスの箱 → カテゴリー → 一覧 → 本文
 *  と降りていきます。本文だけ、開いたときに取りに行きます。
 * ============================================================ */

const S = {
  rows: [],           // 索引（新しい順）
  cat: new Map(),     // メールのid → カテゴリーid（計算した結果を覚えておきます）
  folder: '',         // '' は全受信
  catId: '',          // '' はすべて
  q: '',
  unreadOnly: false,
  starOnly: false,
  toMe: '',           // '' 全部 / 'direct' 自分あて / 'via' まわってきた
  star: new Set(),    // フラグを付けたメール（受け口の印つきの見出し）
  picking: false,     // 選ぶモード
  sel: new Set(),
  shown: APP.pageSize,
  openKey: null,      // いま開いているメール（受け口の印つきの見出し）
  demo: false,
  myAddrs: [],        // 自分のアドレス
  addrNames: {},      // アドレス → 短い呼び名
  hosts: {},          // 受け口の id → その受け口が読んでいるアドレス
  indexed: {},        // 受け口の id → 索引に入っている通数
  inbox: {},          // 受け口の id → 受信トレイの実数
  query: {},          // 受け口の id → 読み込む範囲
  ver: {},            // 受け口の id → 受け口のコードの版の印
  /* 送信済み。★索引（S.rows）には入れません。開いたときだけ取りに行きます。
   *   混ぜると、受信トレイの通数・未読・カテゴリーが全部おかしくなります */
  sent: {
    addr: '',         // どの箱の送信ぶんを見ているか（'' は全部）
    rows: [],         // 取ってきたぶん（新しい順）
    by: new Map(),    // 見出し → 行（rowByKey から引くため）
    next: {},         // 受け口の id → 続きの印（'' なら終わり）
    loading: false,
    err: '',
  },
  seBy: 'domain',     // 差出人の一覧の見かた（domain / addr）
  seFind: '',
  seShow: {},         // 組ごとに、いくつまで出しているか
  ok: {},             // 受け口の id → 返事があったか
  err: {},            // 受け口の id → 返事が無いときの理由
  done: {},           // 受け口の id → 古いぶんまで読み終えたか
  main: '',           // 決まりごととテンプレを置いてある受け口
  tpl: [],
  aliases: [],        // Gmail に登録ずみの送信者
  aliasSrc: {},       // その送信者は、どの受け口のものか
  seenH: {},          // 受け口 → 前に見た「動いた印」（historyId）
  watching: 0,        // 見張りの番号
  watchAt: 0,         // 前に聞いた時刻
  watchBusy: 0,       // いま聞いている最中か
  fullAt: 0,          // 前に「ぜんぶそろえた」時刻（未読・フラグ・合計）
  gapStuck: {},       // 受け口 → 取り戻しても増えなかったときの通数
  trans: new Map(),   // 見出し → 訳した文（★端末の中だけ。どこにも残しません）
  showTrans: false,   // いま訳したほうを出しているか
  lastSync: {},       // 受け口 → 前の取り込みで何が返ってきたか（⚙ に出します）
  /* 起動にかかった時間（★遅いときに、どこで待っているかを見るため。
   *   推測で直そうとして何度も外したので、数字を出すようにしました） */
  bootMs: {},
  /* 受け口 → **索引を何行目まで読んだか。**
   * ★手元の通数ではありません。重なったメールは1つにまとめて消すので、
   *   手元の通数は索引より少なくなります（会社は172通少なくなっていました）。
   *   その数で「何行目から」を頼むと、**毎回同じ172通を取り寄せては捨てる**
   *   ことになります（2026-11-22、ko-dai さんの画面で判明）。 */
  consumed: {},
  recounting: 0,      // いま合計を数え直している最中か
  syncing: 0,         // 上の帯の「更新」を押している最中か
  saving: 0,          // 索引を裏で書いている最中か
  saveWant: false,    // 書き直しの頼みが来ているか
  fill: null,         // テンプレの穴うめで、いま開いているもの
  pingMs: 0,          // 受け口に1回聞くのにかかった時間（ミリ秒）
  replied: new Set(),  // 返信ずみのやり取り（受け口id:やり取りの番号）
  bodies: new Map(),  // 本文の控え。開いているあいだだけ、30通まで
  group: true,        // 同じやり取りを1行にまとめるか
  swiped: 0,          // 最後に横へなぞり終わった時刻
  images: false,      // 本文の画像を出すかどうか
  busy: '',
  scanning: false,
};

/* ============================================================
 *  細かい道具
 * ========================================================== */

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function icon(name, cls) {
  return '<svg class="ico ' + (cls || '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
}

function toast(msg, bad) {
  const t = $('#toast');
  const text = String(msg || '');
  t.textContent = text;
  // ★長い知らせは丸い帯ではなく四角にして、左そろえにします。
  //   丸のままだと、長い文が細長くつぶれて読めません。
  //   読む時間も、長さに応じて延ばします
  const long = text.length > 34;
  t.className = 'toast is-on' + (bad ? ' is-bad' : '') + (long ? ' is-long' : '');
  clearTimeout(toast._t);
  const ms = Math.min(14000, (bad ? 5000 : 2200) + text.length * 70);
  toast._t = setTimeout(() => { t.className = 'toast'; }, ms);
}

/** 日付の見せかた。今日なら時刻、今年なら月日、それ以外は年から */
function fmtDate(ms) {
  const d = new Date(Number(ms) || 0);
  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  if (d.toDateString() === now.toDateString()) return p(d.getHours()) + ':' + p(d.getMinutes());
  if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + '/' + d.getDate();
  return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
}

function fmtFull(ms) {
  const d = new Date(Number(ms) || 0);
  const w = '日月火水木金土'[d.getDay()];
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日（' + w + '）'
       + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

/* ============================================================
 *  箱（アドレス）の決めかた
 *
 *  索引には宛先がぜんぶ入っています。そのうち「自分のアドレス」
 *  として登録したものを箱とみなします。
 *
 *  ★ただの先頭一致では足りません。iCloud から転送してくると、
 *    宛先はこうなります。
 *
 *      Delivered-To: あなた@gmail.com     ← 集めた先
 *      To:           あなた@icloud.com    ← 本当の宛先
 *
 *    先に見つかったほうを採ると、集めた先（Gmail）が先に当たり、
 *    **転送したメールが全部 Gmail のフォルダへ吸い込まれます。**
 *    そこで「集めた先ではないアドレス」を優先します。
 *    直接 Gmail に届いたメールは、集めた先しか出てこないので
 *    そのまま Gmail のフォルダに入ります。
 * ========================================================== */
/**
 * 差出人・件名の目印で箱を決める上書き。当たらなければ空です。
 *
 * ★登録していない呼び名の目印は、当たっても無視します。
 *   自分のアドレスとして登録していない箱は作れないためです。
 */
function hintBox(row) {
  // ★空白は取り払ってから見比べます。差出人の名前や件名の
  //   「炭焼ハンバーグ バグる」は、全角の空白で書かれていることも
  //   半角のこともあり、そのままだと当たったり当たらなかったりします
  const flat = (t) => String(t || '').toLowerCase().replace(/[\s\u3000]+/g, '');
  const hay = flat(String(row[F.FROM] || '') + String(row[F.NAME] || '')
                 + String(row[F.SUBJ] || ''));
  if (!hay) return '';
  const names = Object.keys(BOX_HINTS);
  for (let i = 0; i < names.length; i++) {
    const marks = BOX_HINTS[names[i]] || [];
    for (let j = 0; j < marks.length; j++) {
      const m = flat(marks[j]);
      if (!m || hay.indexOf(m) < 0) continue;
      const addr = S.myAddrs.find((a) => folderName(a) === names[i]);
      if (addr) return addr;
    }
  }
  return '';
}

/**
 * その1通が「どの箱に届いたか」。**宛先だけ**で決めます。
 *
 * ★上書き（hintBox）を混ぜません。二重を消すときの採点に使うので、
 *   ここが動くと「元のほうを残す」という判断が狂います。
 */
function deliveredBox(row) {
  // 集めた先は受け口ごとに違います。会社の受け口から読んだメールの
  // 集めた先は会社のアドレスです
  const me = S.hosts[String(row[F.SRC] || '')] || '';
  if (S.myAddrs.length) {
    const list = String(row[F.TO] || '').split(',');
    let host = '';
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a || S.myAddrs.indexOf(a) < 0) continue;
      if (a !== me) return a;   // 集めた先ではない＝本当の宛先
      host = a;
    }
    if (host) return host;

    // ★自分のアドレスが1つも見当たらないとき。
    //   ここで「メールに書いてある宛先」をフォルダにしていました。
    //   これは間違いでした。Bcc で届いたものや、古くて配送記録の
    //   無いメールでは、そこに**他人のアドレス**が入っています。
    //   実際、大学のころのやり取りの相手のアドレスが2つ、
    //   フォルダとして並んでしまいました。
    //   その受け口が読んでいるのは1つのアカウントだけなので、
    //   分からないものは**そのアカウントに届いた**とみなします。
    if (me) return me;
  }
  return String(row[F.ADDR] || '(不明)');
}

/** 画面に出す箱。目印の上書きがあればそちらが勝ちます */
function folderOf(row) {
  return hintBox(row) || deliveredBox(row);
}

/**
 * 受け口の呼び名。
 *
 * ★config.js に書いた名前より、**つないだ先のアドレスから決めた名前**を
 *   優先します。URL を貼る枠を取り違えても、つないだ時点で正しい名前に
 *   直るようにするためです。名前は見出しでしかないので、
 *   人の記憶より、機械が確かめられる事実のほうを信じます。
 */
function srcName(id) {
  const host = S.hosts[id] || '';
  if (host && S.addrNames[host]) return S.addrNames[host];
  const src = SOURCES.find((x) => x.id === id);
  return src ? src.name : id;
}

/** フォルダに出す短い呼び名。無ければアドレスをそのまま */
function folderName(addr) {
  if (!addr) return '';
  if (addr === '(不明)') return '宛先不明';
  return S.addrNames[addr] || addr;
}

/* ============================================================
 *  仕分けをやり直す
 *
 *  決まりごとを直したときと、索引を読み直したときに呼びます。
 *  2万通ぶんでも一瞬で終わるので、通信は要りません。
 * ========================================================== */
/**
 * 自分のアドレスを読み込みます。
 * 設定の画面で直したものがあればそちら、無ければ config.js の分。
 */
function loadAddrs() {
  let list = null;
  try {
    // localStorage が使えない置きかたもあるので、失敗しても止めません
    list = JSON.parse(localStorage.getItem(APP.storageKey + ':addrs') || 'null');
  } catch (e) { list = null; }
  if (!Array.isArray(list) || !list.length) {
    list = MY_ADDRS.map((x) => [x.addr, x.name]);
  }
  S.myAddrs = [];
  S.addrNames = {};
  list.forEach((x) => {
    const addr = String(Array.isArray(x) ? x[0] : x).trim().toLowerCase();
    if (!addr) return;
    S.myAddrs.push(addr);
    const nm = Array.isArray(x) ? String(x[1] || '').trim() : '';
    if (nm) S.addrNames[addr] = nm;
  });
}

function saveAddrs(text) {
  const list = text.split('\n').map((line) => {
    const i = line.indexOf(',');
    return i < 0 ? [line.trim(), ''] : [line.slice(0, i).trim(), line.slice(i + 1).trim()];
  }).filter((x) => x[0]);
  localStorage.setItem(APP.storageKey + ':addrs', JSON.stringify(list));
  loadAddrs();
}

/**
 * 端末に残っている古い形の行を、いまの形に直します。
 *
 * ★索引に列を足したとき、**すでに端末にある行がずれます。**
 *   rcpt を11番目に入れたので、それまで11番目だった「どの受け口の
 *   ものか」が12番目に移りました。古い行は11番目のままなので、
 *   受け口が分からなくなり、フォルダの判定が狂いました
 *   （他人のアドレスがフォルダとして並ぶ、あの壊れかたです）。
 *
 *   列を足すたびに起きるので、形に版をつけて、合わなければ直します。
 */
function fixRows(rows) {
  const ids = SOURCES.map((x) => x.id);
  let n = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    // 12個しかなく、その最後が受け口の印なら、古い形です
    if (r.length === 12 && ids.indexOf(String(r[11])) >= 0) {
      r[12] = r[11];
      r[11] = '';       // rcpt は分かりません（作り直せば入ります）
      n++;
    }
  }
  return n;
}

/**
 * そのメールが「自分あてに直接来た」のか「まわってきた」のか。
 *
 *   direct  … To か Cc に自分のアドレスが書いてある
 *   via     … 書いていない。転送・別名・グループ・Bcc で届いたもの
 *   ''      … 分からない（この仕組みを入れる前に作った索引）
 *
 * ★分からないものを勝手に「まわってきた」に入れません。
 *   古い索引が全部そちらに寄って、嘘の数になるためです。
 */
function toMeOf(row) {
  const rc = String(row[F.RCPT] || '');
  if (!rc) return '';
  if (!S.myAddrs.length) return '';
  const list = rc.split(',');
  for (let i = 0; i < list.length; i++) {
    if (S.myAddrs.indexOf(list[i]) >= 0) return 'direct';
  }
  return 'via';
}

/* ============================================================
 *  同じ1通を二度出さない
 *
 *  会社あてのメールを個人へ転送しつつ、会社の受け口でも直接読むと、
 *  同じメールが2通に見えます。id は箱ごとの番号なので見分けられませんが、
 *  Message-ID は転送しても書き換わりません。
 *
 *  ★どちらを残すかは「届いた箱（Delivered-To）が、そのメールを
 *    入れるフォルダと同じかどうか」で決めます。会社の受け口で読んだ
 *    ほうは会社あてに届いており一致します。転送されたほうは個人あてに
 *    届いているので一致しません。つまり**元のほうが残ります。**
 *    元のほうを残すと、返信も元のアドレスから素直に出せます。
 * ========================================================== */
function dedupe(rows) {
  const best = new Map();
  const noId = [];
  // ★上書きではなく**本当の届け先**で採点します。元のほうを残すための点です
  const score = (r) => (String(r[F.ADDR] || '') === deliveredBox(r) ? 1 : 0);

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const mid = String(r[F.MSGID] || '');
    if (!mid) { noId.push(r); continue; }   // 番号が無いものは消しません
    const cur = best.get(mid);
    if (!cur || score(r) > score(cur)) best.set(mid, r);
  }
  const out = noId.concat(Array.from(best.values()));
  out.sort((a, b) => b[F.DATE] - a[F.DATE]);
  return out;
}

/** 受け取ったぶんを足して、重複を消して、並べ直します */
function mergeRows(rows, src) {
  const seen = new Set(S.rows.map((r) => Rules.keyOf(r)));
  let added = 0;
  (rows || []).forEach((r) => {
    if (src) r[F.SRC] = src;
    if (seen.has(Rules.keyOf(r))) return;
    seen.add(Rules.keyOf(r));
    S.rows.push(r);
    added++;
  });
  S.rows = dedupe(S.rows);
  recategorize();
  return added;
}

function recategorize() {
  S.cat = new Map();
  for (let i = 0; i < S.rows.length; i++) {
    S.cat.set(Rules.keyOf(S.rows[i]), Rules.of(S.rows[i]).cat);
  }
}

/** 見出し（受け口の印つき）から1行を引きます */
function rowByKey(key) {
  for (let i = 0; i < S.rows.length; i++) {
    if (Rules.keyOf(S.rows[i]) === key) return S.rows[i];
  }
  /* ★送信済みは索引に入れていません（見るときだけ取りに行きます）。
   *   ここで拾えるようにしておくと、本文・やり取り・返信が
   *   受信のメールとまったく同じ道で動きます（2026-11-21）。 */
  return S.sent.by.get(key) || null;
}

/* ============================================================
 *  絞り込み
 * ========================================================== */

function matchQ(row, q) {
  if (!q) return true;
  return (String(row[F.SUBJ]) + ' ' + String(row[F.NAME]) + ' '
        + String(row[F.FROM]) + ' ' + String(row[F.SNIP])).toLowerCase().indexOf(q) >= 0;
}

function filtered() {
  const q = S.q.trim().toLowerCase();
  const out = [];
  for (let i = 0; i < S.rows.length; i++) {
    const r = S.rows[i];
    if (S.folder && folderOf(r) !== S.folder) continue;
    if (S.catId && S.cat.get(Rules.keyOf(r)) !== S.catId) continue;
    if (S.unreadOnly && !r[F.UNREAD]) continue;
    if (S.starOnly && !S.star.has(Rules.keyOf(r))) continue;
    if (S.toMe && toMeOf(r) !== S.toMe) continue;
    if (!matchQ(r, q)) continue;
    out.push(r);
  }
  return out;
}

/**
 * 同じやり取り（スレッド）を1行にまとめます。
 *
 *  ★番号（tid）は索引にずっと入っていたのに、画面では一度も
 *    使っていませんでした。予約サイトは「受付」「確定」「変更」
 *    「キャンセル」を別々に送ってくるので、1件の予約が3〜4行を
 *    占めていました。
 *
 *  ★まとめるのは**見た目だけ**です。既読やフラグは1通ずつのまま
 *    動かします。だから「まとめた行を既読にする」は、その中の
 *    ぜんぶを既読にします。
 *
 *  ★同じ番号でも受け口が違えば別のやり取りです（番号は
 *    Google アカウントごとのものなので）。受け口の印を頭に付けます。
 */
function threadKey(r) {
  const tid = String(r[F.TID] || '');
  return tid ? String(r[F.SRC] || '') + ':' + tid : '';
}

function groupRows(rows) {
  const out = [];
  const at = new Map();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const key = Rules.keyOf(r);
    const tk = threadKey(r);
    if (!tk) {                       // 番号が無いものは、まとめません
      out.push({ r, n: 1, keys: [key], unread: !!r[F.UNREAD], flag: S.star.has(key),
                 rep: false });        // やり取りの番号が無いと、返信ずみか分かりません
      continue;
    }
    let g = at.get(tk);
    if (!g) {
      // 並びは新しい順なので、はじめに出てきたものがいちばん新しい
      g = { r, n: 0, keys: [], unread: false, flag: false, rep: S.replied.has(tk) };
      at.set(tk, g);
      out.push(g);
    }
    g.n++;
    g.keys.push(key);
    if (r[F.UNREAD]) g.unread = true;      // 1通でも未読なら、その行は未読
    if (S.star.has(key)) g.flag = true;
  }
  return out;
}

/** 箱ごとの通数と未読数 */
function folderCounts() {
  const m = new Map();
  for (let i = 0; i < S.rows.length; i++) {
    const r = S.rows[i];
    const k = folderOf(r);
    let v = m.get(k);
    if (!v) { v = { n: 0, u: 0 }; m.set(k, v); }
    v.n++; if (r[F.UNREAD]) v.u++;
  }
  return m;
}

/** いま見ている箱の中の、カテゴリーごとの通数と未読数 */
function catCounts() {
  const m = new Map();
  let all = { n: 0, u: 0 };
  for (let i = 0; i < S.rows.length; i++) {
    const r = S.rows[i];
    if (S.folder && folderOf(r) !== S.folder) continue;
    const k = S.cat.get(Rules.keyOf(r)) || 'other';
    let v = m.get(k);
    if (!v) { v = { n: 0, u: 0 }; m.set(k, v); }
    v.n++; all.n++;
    if (r[F.UNREAD]) { v.u++; all.u++; }
  }
  m.set('', all);
  return m;
}

/* ============================================================
 *  描く
 * ========================================================== */

function render() {
  const gb = $('#groupBtn');
  if (gb) gb.classList.toggle('is-on', S.group);
  renderFolders();
  renderCats();
  renderList();
  renderBulk();
  renderReadAll();
  renderScanNote();
  $('#app').dataset.busy = S.busy ? '1' : '';
  $('#busy').textContent = S.busy;
}

/* ============================================================
 *  アイコンの数字（バッジ）
 *
 *  ★ホーム画面（iPhone）や Dock（Mac）に追加したときだけ出ます。
 *    ふつうのタブでは出ません（ブラウザが受け付けません）。
 *  ★iPhone は**通知を許していること**が要ります。
 *  ★アプリを閉じているあいだは、通知の世話係（sw.js）が付け替えます。
 *    開いているあいだは、ここが受け持ちます。
 * ========================================================== */

let BADGE_AT = -1;          // 前に付けた数（同じなら触りません）

function paintBadge(n) {
  const v = Math.max(0, Number(n) || 0);
  if (v === BADGE_AT) return;        // ★毎回呼ばれるので、変わったときだけ
  BADGE_AT = v;
  try {
    if (!navigator.setAppBadge) return;
    if (v > 0) navigator.setAppBadge(v).catch(() => {});
    else if (navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {});
  } catch (e) { /* 付けられない置きかたもあります */ }
}

function renderFolders() {
  const c = folderCounts();
  // ★並びは「自分のアドレスとして登録した順」を先に置きます。
  //   通数の多い順にすると、広告の多い個人アドレスが常に先頭になり、
  //   毎日見る場所が日によって動いてしまいます。
  const known = S.myAddrs.filter((a) => c.has(a));
  const rest = Array.from(c.keys()).filter((a) => S.myAddrs.indexOf(a) < 0)
    .sort((a, b) => c.get(b).n - c.get(a).n);
  const addrs = known.concat(rest);
  const total = S.rows.length;
  const unread = S.rows.reduce((n, r) => n + (r[F.UNREAD] ? 1 : 0), 0);
  // ★アイコンの数字も、ここでそろえます（画面の「全受信」の未読と同じ数）
  if (!S.demo) paintBadge(unread);

  let h = chip('', '全受信', total, unread, S.folder === '');
  addrs.forEach((a) => {
    h += chip(a, folderName(a), c.get(a).n, c.get(a).u, S.folder === a);
  });
  // 登録したのにまだ1通も来ていないアドレスも、灰色で出しておきます。
  // ★出しておかないと「転送の設定ができているのか」が分かりません
  S.myAddrs.forEach((a) => {
    if (!c.has(a)) h += chip(a, folderName(a), 0, 0, S.folder === a);
  });
  $('#folders').innerHTML = h;

  function chip(id, label, n, u, on) {
    return '<button class="chip' + (on ? ' is-active' : '') + '" data-folder="' + esc(id) + '">'
      + '<span class="chip__t">' + esc(label) + '</span>'
      + (u ? '<span class="chip__u">' + u + '</span>' : '<span class="chip__n">' + n + '</span>')
      + '</button>';
  }
}

function renderCats() {
  const c = catCounts();
  const all = c.get('') || { n: 0, u: 0 };
  let h = row('', 'すべて', 'inbox', all.n, all.u, '');

  // ★箱ごとに使うカテゴリーが違います。会社の箱は8つだけ、
  //   個人と iCloud は今までどおりです（config.js の BOX_CATS）。
  //   全受信のときは、どの箱のぶんも混ざっているので全部を候補にします
  const fixed = S.folder ? !!BOX_CATS[boxKey(S.folder)] : false;
  const ids = S.folder ? catsOf(S.folder) : CATS.map((k) => k.id);

  ids.forEach((id) => {
    const k = CAT_BY_ID[id];
    if (!k) return;
    const v = c.get(id) || { n: 0, u: 0 };
    // ★決めた8つの箱は、0通でも出します。「発注 0」と見えることが
    //   「決まりごとを足さないといけない」という合図になるからです。
    //   それ以外の箱は、今までどおり0通なら出しません
    if (!v.n && !fixed && k.id !== 'other') return;
    h += row(k.id, k.name, k.icon, v.n, v.u, k.hint);
  });
  $('#cats').innerHTML = h;

  function row(id, name, ic, n, u, hint) {
    return '<button class="cat' + (S.catId === id ? ' is-active' : '') + '"'
      + ' data-cat="' + esc(id) + '" title="' + esc(hint) + '">'
      + icon(ic) + '<span class="cat__n">' + esc(name) + '</span>'
      + (u ? '<span class="cat__u">' + u + '</span>' : '')
      + '<span class="cat__c">' + n + '</span></button>';
  }
}

function renderList() {
  const rows = filtered();
  const items = S.group
    ? groupRows(rows)
    : rows.map((r) => {
        const k = Rules.keyOf(r);
        return { r, n: 1, keys: [k], unread: !!r[F.UNREAD], flag: S.star.has(k),
                 rep: S.replied.has(threadKey(r)) };
      });
  const show = items.slice(0, S.shown);
  const ul = $('#list');

  if (!items.length) {
    ul.innerHTML = '<li class="empty">' + (S.rows.length
      ? 'ここには何もありません'
      : (S.demo ? '見本を読み込んでいます'
               : 'まだ索引がありません<br><br>'
                 + '<button class="pill pill--go" id="emptyGo">設定をひらいて読み込む</button>'))
      + '</li>';
    const go = $('#emptyGo');
    if (go) go.addEventListener('click', openSettings);
  } else {
    ul.innerHTML = show.map(item).join('');
  }

  // ★まとめたときは「何件に見えているか」と「本当は何通か」を並べます。
  //   片方だけ出すと、既読にした数と合わなくて驚きます
  $('#count').textContent = !rows.length ? ''
    : (items.length === rows.length)
      ? rows.length.toLocaleString() + '通'
      : items.length.toLocaleString() + '件（' + rows.length.toLocaleString() + '通）';

  // ★「宛先」で絞っているとき、判別できない古いぶんがどれだけ
  //   あるかを出します。出さないと、絞った数を全部だと思ってしまいます
  const note = $('#toMeNote');
  if (note) {
    let unknown = 0;
    if (S.toMe) {
      for (let i = 0; i < S.rows.length; i++) {
        const r = S.rows[i];
        if (S.folder && folderOf(r) !== S.folder) continue;
        if (!toMeOf(r)) unknown++;
      }
    }
    note.hidden = !unknown;
    note.textContent = unknown
      ? unknown.toLocaleString() + '通は、直接来たのかまわってきたのか分かりません。'
        + '設定の「作り直す」→「続きを読み込む」で分かるようになります。'
      : '';
  }
  $('#more').hidden = items.length <= S.shown;
  $('#more').textContent = 'あと ' + (items.length - S.shown).toLocaleString() + '件を出す';

  function item(g) {
    const r = g.r;
    const id = Rules.keyOf(r);
    const k = CAT_BY_ID[S.cat.get(id)] || CAT_BY_ID.other;
    const fl = g.flag;
    // まとめた行は、中のぜんぶが選ばれていてはじめて「選んだ」印にします
    const sel = g.keys.every((x) => S.sel.has(x));
    return '<li class="mail' + (g.unread ? ' is-unread' : '') + (sel ? ' is-sel' : '') + '"'
      + ' data-id="' + esc(id) + '" data-keys="' + esc(g.keys.join(' ')) + '">'
      + (S.picking
          ? '<span class="mail__box">' + (sel ? icon('check') : '') + '</span>'
          : '<span class="mail__dot"></span>')
      + '<div class="mail__b">'
      +   '<div class="mail__top">'
      +     '<span class="mail__from">' + esc(r[F.NAME] || r[F.FROM]) + '</span>'
      +     (g.n > 1 ? '<span class="mail__n">' + g.n + '通</span>' : '')
      +     (g.rep ? '<span class="mail__rep" title="このやり取りには返信しています">'
                     + icon('reply') + '</span>' : '')
      +     (fl ? '<span class="mail__flag">' + icon('flag') + '</span>' : '')
      +     '<span class="mail__date">' + fmtDate(r[F.DATE]) + '</span>'
      +   '</div>'
      +   '<div class="mail__subj">' + esc(r[F.SUBJ] || '（件名なし）') + '</div>'
      +   '<div class="mail__snip">' + esc(r[F.SNIP]) + '</div>'
      +   '<div class="mail__tags"><span class="tag tag--' + k.id + '">' + esc(k.name) + '</span></div>'
      + '</div></li>';
  }
}

/**
 * 「未読◯通を既読に」。
 *
 * ★「選ぶ」を押して、全部を選んで、既読にする——の3手を1手にします。
 *   読まずに片づけたいメールのほうが多いので、そこがいちばん太い道です。
 *
 * ★いま絞り込んでいるぶんだけが対象です。だから
 *   「iCloud の未読を全部」も「この差出人のぶんだけ」も、
 *   先に絞ってからこのボタンを押せば済みます。
 */
function renderReadAll() {
  const b = $('#readAllBtn');
  if (!b) return;
  let n = 0;
  filtered().forEach((r) => { if (r[F.UNREAD]) n++; });
  b.hidden = !n || S.picking;
  if (n) b.textContent = '未読' + n.toLocaleString() + '通を既読に';
}

function renderBulk() {
  const bar = $('#bulk');
  bar.hidden = !S.picking;
  if (!S.picking) return;
  $('#selN').textContent = S.sel.size ? S.sel.size.toLocaleString() + '通を選んでいます' : '選んでください';
  $('#doRead').disabled = !S.sel.size;
  $('#doUnread').disabled = !S.sel.size;
  $('#doFlag').disabled = !S.sel.size;
  $('#unFlag').disabled = !S.sel.size;
}

/* ============================================================
 *  一括で既読にする
 *
 *  ★ここは「読まずに既読を付ける」ための道具です。だから
 *    確認を1回だけ挟みます。押し間違いで500通が既読になると、
 *    どれが未読だったのかは二度と分かりません。
 *    （やり直せるよう「未読に戻す」も並べています）
 * ========================================================== */
async function markSelected(read) {
  const keys = Array.from(S.sel);
  if (!keys.length) return;
  const verb = read ? '既読' : '未読';
  if (keys.length > 20 && !confirm(keys.length.toLocaleString() + '通を' + verb + 'にします。よろしいですか？')) return;

  if (S.demo) {
    applyRead(keys, read);
    S.sel.clear(); render();
    toast('見本なので、画面の上だけ変えました');
    return;
  }
  // 受け口ごとに分けて頼みます。会社のメールを個人の受け口に
  // 頼んでも、向こうは知らない番号として断ってくるためです
  const bySrc = {};
  keys.forEach((k) => {
    const i = k.indexOf(':');
    const src = k.slice(0, i), id = k.slice(i + 1);
    (bySrc[src] = bySrc[src] || []).push(id);
  });
  /* ★先に画面を変えて、受け口へは**裏で**頼みます。
   *
   *   前は「受け口の返事」と「索引の書き戻し（5万3千行）」の両方を待ってから
   *   画面を変えていたので、**31通でも何秒もかかって**いました
   *   （2026-11-19、ko-dai さんの「一括で既読にする時間も長すぎる」）。
   *
   *   失敗したら、そのときに知らせて画面も戻します。
   *   黙って食い違わせることはしません。
   */
  applyRead(keys, read);
  S.sel.clear();
  render();
  saveSoon();
  toast(keys.length.toLocaleString() + '通を' + verb + 'にしました');

  // 受け口ごとに同時に頼みます（別々の Google アカウントなのでぶつかりません）
  const srcs = Object.keys(bySrc);
  const res = await Promise.all(srcs.map((src) =>
    Api.read(src, bySrc[src], read).then(() => null).catch((e) => ({ src, e }))));
  const ng = res.filter(Boolean);
  if (ng.length) {
    // ★戻します。画面だけ既読になって Gmail は未読のまま、では困ります
    const back = [];
    ng.forEach(({ src }) => bySrc[src].forEach((id) => back.push(src + ':' + id)));
    applyRead(back, !read);
    render();
    saveSoon();
    toast(ng.map((x) => srcName(x.src)).join('・') + ' は'
          + verb + 'にできませんでした：' + String(ng[0].e.message || ng[0].e), true);
  }
}

/**
 * フラグを付ける／外す。
 *
 * ★Gmail のスターそのものを動かします。だから iPhone や Mac の
 *   「メール」アプリの旗にもそのまま出ます。
 */
async function markStar(keys, on) {
  if (!keys.length) return;
  keys.forEach((k) => { if (on) S.star.add(k); else S.star.delete(k); });
  render();
  if (S.demo) { toast('見本なので、画面の上だけ変えました'); return; }

  const bySrc = {};
  keys.forEach((k) => {
    const i = k.indexOf(':');
    (bySrc[k.slice(0, i)] = bySrc[k.slice(0, i)] || []).push(k.slice(i + 1));
  });
  try {
    await Promise.all(Object.keys(bySrc).map((src) => Api.star(src, bySrc[src], on)));
    await Store.set('star', Array.from(S.star));
    toast(on ? 'フラグを付けました' : 'フラグを外しました');
  } catch (e) {
    // つけ外しに失敗したら、画面の印も戻します。
    // 残しておくと、Gmail と食い違ったままになります
    keys.forEach((k) => { if (on) S.star.delete(k); else S.star.add(k); });
    render();
    toast(String(e.message || e), true);
  }
}

function applyRead(keys, read) {
  const want = new Set(keys);
  for (let i = 0; i < S.rows.length; i++) {
    if (want.has(Rules.keyOf(S.rows[i]))) S.rows[i][F.UNREAD] = read ? 0 : 1;
  }
}

/* ============================================================
 *  本文を開く
 * ========================================================== */

/* ============================================================
 *  本文の控え（開いているあいだだけ）
 *
 *  ★受け口への1往復に1〜3秒かかります。Apps Script はそういうもので、
 *    こちらからは短くできません。だから**取りに行く回数を減らします。**
 *
 *  ★ためておくのは**画面を開いているあいだだけ**です。端末にも
 *    表計算にも書きません。閉じれば消えます。
 *    「本文はどこにも複製しない」という作りはそのままです。
 *
 *  ★30通ぶんで打ち止めにして、古いものから捨てます。広告メールは
 *    1通で数百KBあるので、際限なくためると端末が重くなります。
 * ========================================================== */
const BODY_KEEP = 30;

function bodyGet(key) {
  const d = S.bodies.get(key);
  if (d) {                      // 使ったものを新しいほうへ回します
    S.bodies.delete(key);
    S.bodies.set(key, d);
  }
  return d;
}

function bodyPut(key, d) {
  S.bodies.set(key, d);
  while (S.bodies.size > BODY_KEEP) S.bodies.delete(S.bodies.keys().next().value);
}

/**
 * 次に読みそうな1通を、先に取っておきます。
 *
 * ★一覧を上から読んでいくとき、次の1通は待たずに出ます。
 *   読んでいる数秒のあいだに裏で取ってくるので、体感では消えます。
 *
 * ★既読にはしません。取ってくるだけです。
 */
function prefetchNext(key) {
  if (S.demo) return;
  const rows = filtered();
  const i = rows.findIndex((r) => Rules.keyOf(r) === key);
  const next = i >= 0 ? rows[i + 1] : null;
  if (!next) return;
  const nk = Rules.keyOf(next);
  if (S.bodies.has(nk)) return;
  Api.body(String(next[F.SRC] || ''), String(next[F.ID]))
    .then((d) => bodyPut(nk, d))
    .catch(() => {});           // 先取りの失敗は黙って捨てます
}

async function openMail(key) {
  const row = rowByKey(key);
  if (!row) return;
  S.openKey = key;
  S.images = false;
  S.showTrans = false;              // 開くたびに、まず原文から
  const src = String(row[F.SRC] || '');
  const id = String(row[F.ID]);

  const k = CAT_BY_ID[S.cat.get(key)] || CAT_BY_ID.other;
  const why = Rules.of(row).why;

  /* ★送信済みから開いたときは、**宛先**を出します。
   *   差出人はいつも自分なので、出しても何も分かりません（2026-11-21）。 */
  const isSent = S.sent.by.has(key);
  $('#dSubj').textContent = row[F.SUBJ] || '（件名なし）';
  $('#dFrom').textContent = isSent
    ? ('宛先： ' + (String(row[F.TO] || '').trim() || '（宛先なし）'))
    : ((row[F.NAME] || '') + ' <' + row[F.FROM] + '>');
  $('#dDate').textContent = fmtFull(row[F.DATE]);
  $('#dCat').innerHTML = '<span class="tag tag--' + k.id + '">' + esc(k.name) + '</span>'
    + '<span class="why">' + esc(why) + '</span>';
  paintStarBtn();
  paintThread(row);
  // ★配信停止のボタンは、機械が送ってきたものにだけ出します。
  //   人からのメールに「配信を止める」が並んでいると落ち着きません
  const ub = $('#unsubBtn');
  if (ub) ub.hidden = S.demo || !Rules.isMachine(row[F.FROM]);
  const un = $('#dUnsub');
  if (un) { un.hidden = true; un.innerHTML = ''; }

  // ★先に面を出してから本文を入れます。順番を逆にすると、
  //   display:none のあいだに入れることになり、iframe が
  //   読み込まないまま真っ白で残ります（実際そうなっていました）。
  $('#detail').hidden = false;
  $('#imgBtn').hidden = false;
  document.body.classList.add('is-modal');

  if (S.demo) {
    $('#dBody').srcdoc = wrapBody('<p>' + esc(row[F.SNIP]) + '</p>'
      + '<p style="color:#888">（見本です。受け口をつなぐと本物の本文が出ます）</p>', false);
    return;
  }
  // ★一度読んだものは、取りに行かずにそのまま出します
  const had = bodyGet(key);
  if (had) {
    S._body = had;
    if (S.trans.has(key)) S.showTrans = true;     // 前に訳してあれば、そのまま出します
    paintBody();
    autoTrans(key, had);
  } else {
    $('#dBody').srcdoc = wrapBody('<p style="color:#888">読み込んでいます…</p>', false);
  }
  try {
    if (!had) {
      const d = await Api.body(src, id);
      bodyPut(key, d);
      /* ★取りに行っているあいだに**別のメールを開いている**ことがあります。
       *   前は確かめずに出していたので、先に開いたメールの本文が、
       *   あとから開いたメールの件名の下に出ました。AI にもその本文が渡ります
       *   （会社の本文が個人の返信の材料になる）。2026-11-22 の指摘。 */
      if (S.openKey !== key) return;
      S._body = d;
      paintBody();
      autoTrans(key, d);
    }
    prefetchNext(key);
    if (row[F.UNREAD]) {
      // 開いたら既読。Gmail 側と食い違わないよう索引も直します
      applyRead([key], true);
      Api.read(src, [id], true).catch(() => {});
      /* ★前はここで索引を**まるごと**書き直していました（5万3千行）。
       *   1通読むたびに走るので、開くたびに引っかかります。
       *   変わったのは1行だけなので、その行が入っている束だけ書きます
       *   （2026-11-22 の指摘）。 */
      Store.savePart(S.rows, S.rows.findIndex((r) => Rules.keyOf(r) === key))
        .catch(() => {});
      render();
    }
  } catch (e) {
    if (S.openKey !== key) return;        // ★もう別のメールを開いています
    $('#dBody').srcdoc = wrapBody('<p style="color:#b00">' + esc(String(e.message || e)) + '</p>', false);
  }
}

/**
 * 同じやり取りの、ほかのメールを並べます。
 *
 * ★まとめた行から開くと、見えるのはいちばん新しい1通だけです。
 *   「確定の前に何と言ってきたか」を見たいことがあるので、
 *   そこから行き来できるようにします。1通しかなければ出しません。
 */
function paintThread(row) {
  const box = $('#dThread');
  if (!box) return;
  const tk = threadKey(row);
  const here = Rules.keyOf(row);
  const mates = tk ? S.rows.filter((r) => threadKey(r) === tk) : [];
  if (mates.length < 2) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = '<div class="dthread__t">このやり取り ' + mates.length + '通</div>'
    + mates.map((r) => {
        const k = Rules.keyOf(r);
        return '<button class="dthread__i' + (k === here ? ' is-now' : '')
          + (r[F.UNREAD] ? ' is-unread' : '') + '" data-mate="' + esc(k) + '">'
          + '<span class="dthread__d">' + esc(fmtDate(r[F.DATE])) + '</span>'
          + '<span class="dthread__f">' + esc(r[F.NAME] || r[F.FROM]) + '</span>'
          + '<span class="dthread__s">' + esc(r[F.SUBJ] || '（件名なし）') + '</span>'
          + '</button>';
      }).join('');
}

/**
 * 配信を止めます（ワンクリック購読解除）。
 *
 * ★押すと**外に出ていきます。**取り消すには、また自分で登録し直す
 *   ことになるので、押す前に必ず一度確かめます。
 *
 * ★こちらから止められるのは、決められた形（https へ POST）の
 *   ものだけです。ページを開く形・メールを送る形は、住所を出すだけで
 *   **勝手には進めません。**とくにメールを出すのは人が決めることです。
 */
async function unsubscribe() {
  const key = S.openKey; if (!key) return;
  const row = rowByKey(key); if (!row) return;
  const who = row[F.NAME] ? (row[F.NAME] + '（' + row[F.FROM] + '）') : row[F.FROM];
  if (!confirm(who + '\n\nからの配信を止めます。\n'
             + 'また受け取りたくなったときは、自分で登録し直すことになります。\n\nよろしいですか？')) return;

  const box = $('#dUnsub');
  const show = (html) => { if (box) { box.hidden = false; box.innerHTML = html; } };
  try {
    S.busy = '止めています…'; render();
    const d = await Api.unsub(String(row[F.SRC] || ''), String(row[F.ID]));
    if (d.mode === 'done') {
      show('<b>止めました。</b>これから届かなくなります（送り元の処理に少し時間がかかることがあります）');
      toast('配信を止めました');
    } else if (d.mode === 'open') {
      show('こちらからは止められない形でした。'
         + '<a href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer">止めるページを開く</a>'
         + (d.code ? '<br><span class="muted">送り元の返事： ' + esc(String(d.code)) + '</span>' : ''));
    } else if (d.mode === 'mail') {
      show('メールを送って止める形でした。<b>こちらからは送りません。</b><br>'
         + '宛先： <code>' + esc(d.to) + '</code> に空のメールを送ると止まります');
    } else {
      show('このメールには、止めるための口が入っていませんでした。'
         + '本文の下のほうにある「配信停止」のリンクから止めてください');
    }
  } catch (e) {
    toast(String(e.message || e), true);
  } finally {
    S.busy = ''; render();
  }
}

function paintStarBtn() {
  const on = S.star.has(S.openKey);
  const b = $('#starBtn');
  if (!b) return;
  b.classList.toggle('is-on', on);
  b.textContent = on ? 'フラグを外す' : 'フラグを付ける';
}

function paintBody() {
  const d = S._body;
  if (!d) return;
  const tr = S.showTrans ? S.trans.get(S.openKey) : null;
  if (tr) {
    /* ★訳した文は**文字だけ**で出します。HTML ごと訳すと飾りが崩れるので、
     *   受け口でも文字のほうを訳しています。画像も出ません（そのぶん安全です）。 */
    $('#dBody').srcdoc = wrapBody(
      '<p style="color:#888;font-size:13px">日本語にしました'
      + (tr.cut ? '（長いので途中までです）' : '') + '</p>'
      + '<pre>' + esc(tr.text || '') + '</pre>', false);
  } else {
    $('#dBody').srcdoc = wrapBody(d.html || ('<pre>' + esc(d.text || '') + '</pre>'), S.images);
  }
  $('#imgBtn').hidden = S.images || !!tr;
  paintTransBtn();
}

/* ============================================================
 *  日本語にする
 *
 *  ★受け口の中で Google 翻訳を使います。**鍵も契約も要りません。**
 *    渡すのは Gmail（Google）にあるメールなので、新しい相手には渡りません。
 *  ★訳した文は**この端末の中だけ**に置きます。どこにも残しません
 *    （本文を複製しない、という決まりと同じ考えです）。
 * ========================================================== */

/**
 * 外国語のメールなら、自動で日本語にします。
 *
 * ★日本語のメールまで訳すと、むだに受け口を呼ぶだけです。
 *   日本語の字がほとんど無いときだけにします。
 * ★失敗しても何も言いません（押せば手で訳せます）。
 */
function autoTrans(key, d) {
  if (S.demo || !autoTransOn()) return;
  if (S.trans.has(key)) return;
  const text = String((d && d.text) || '').trim()
    || stripTags(String((d && d.html) || ''));
  if (!looksForeign(text)) return;
  doTrans(key, true);
}

/**
 * 外国語らしいか。
 *
 * ★見るのは**かな**です。漢字で見ると、中国語を日本語と取り違えます。
 *   日本語の文には、どんなに硬くても「は・を・の」などのかなが必ず混じります。
 * ★字を数えるのに `\W` を使ってはいけません。**タイ語やアラビア語が
 *   「字ではない」ことになって**、外国語と気づけませんでした（2026-11-22）。
 */
function looksForeign(text) {
  const s = String(text || '').slice(0, 3000);
  let letters = 0;
  try { letters = (s.match(/\p{L}/gu) || []).length; }
  catch (e) { letters = s.replace(/[\s\d\W_]/g, '').length; }   // 古い置きかた用
  if (letters < 20) return false;                     // 短すぎて決められません
  const kana = (s.match(/[\u3040-\u30ff]/g) || []).length;
  return kana / letters < 0.03;
}

/** 自動で日本語にするか（⚙ で切り替え） */
function autoTransOn() {
  try { return localStorage.getItem(APP.storageKey + ':autoTrans') !== '0'; }
  catch (e) { return true; }
}
function setAutoTrans(on) {
  try { localStorage.setItem(APP.storageKey + ':autoTrans', on ? '1' : '0'); } catch (e) { /* 使えない置きかたも */ }
}

function paintTransBtn() {
  const b = $('#transBtn');
  if (!b) return;
  const d = S._body;
  b.hidden = S.demo || !d;
  b.textContent = S.showTrans ? '原文に戻す' : '日本語にする';
  b.classList.toggle('is-on', S.showTrans);
}

/** 押したとき。訳してあれば行き来するだけです */
async function toggleTrans() {
  const key = S.openKey;
  if (!key) return;
  if (S.showTrans) { S.showTrans = false; paintBody(); return; }
  if (S.trans.has(key)) { S.showTrans = true; paintBody(); return; }
  await doTrans(key, false);
}

/**
 * 受け口に訳してもらいます。
 * quiet … 自動のときは、失敗しても何も言いません
 */
async function doTrans(key, quiet) {
  const row = rowByKey(key);
  if (!row) return;
  const b = $('#transBtn');
  const was = b ? b.textContent : '';
  if (b) { b.disabled = true; b.textContent = '日本語にしています…'; }
  try {
    const d = await Api.translate(String(row[F.SRC] || ''), String(row[F.ID]));
    // ★取りに行っているあいだに別のメールを開いていたら、捨てます
    if (S.openKey !== key) return;
    S.trans.set(key, d);
    while (S.trans.size > 30) S.trans.delete(S.trans.keys().next().value);
    S.showTrans = true;
    paintBody();
  } catch (e) {
    if (!quiet) toast(String(e.message || e), true);
  } finally {
    if (b) { b.disabled = false; if (b.textContent !== was) paintTransBtn(); }
  }
}

/**
 * 本文の入れもの。
 *
 * ★本文は他人が書いた HTML です。そのまま画面に混ぜません。
 *   閉じた枠（iframe）に入れ、script も外への通信も止めます。
 *
 * ★画像も、はじめは出しません。広告メールの画像には
 *   「いつ誰が開いたか」を送り返すためだけのものが混じっています。
 *   見たいときだけ「画像を表示」を押します。Mail.app と同じ考えです。
 */
/**
 * 差出人に選べるアドレスの一覧。
 *
 * ★**空になることがありません。**受け口の返事（aliases）が揃わない回でも、
 *   集めた先のアドレス、それも無ければ登録してある自分のアドレスを出します。
 *   ここが空だと選択らんごと消えて、**どのアドレスから出るのか分からなくなります。**
 */
function fromList() {
  const pick = (src) => {
    const out = [];
    (src || []).forEach((a) => {
      const v = String(a || '').trim();
      if (v && out.indexOf(v) < 0) out.push(v);
    });
    return out;
  };
  // ★受け口が答えた「送れるアドレス」が本物です。
  //   ここに無いアドレスから送ろうとすると、Gmail が断ります。
  //   だから**足しません。**答えが返らなかったときだけ、下へ落とします
  const real = pick(S.aliases);
  if (real.length) return real;
  const hosts = pick(Object.keys(S.hosts || {}).map((k) => S.hosts[k]));
  if (hosts.length) return hosts;
  return pick((MY_ADDRS || []).map((m) => m.addr));
}

function wrapBody(html, images) {
  const csp = images
    ? "default-src 'none'; style-src 'unsafe-inline'; img-src https: data: cid:;"
    : "default-src 'none'; style-src 'unsafe-inline'; img-src data:;";
  return '<!doctype html><html><head><meta charset="utf-8">'
    + '<meta http-equiv="Content-Security-Policy" content="' + csp + '">'
    // ★枠の中にも「幅は画面と同じ」と教えます。
    //   これが無いと、中身は 980px の画面として描かれ、字が小さくなり、
    //   **触るたびに iOS が拡大します**（2026-11-19、ko-dai さんの
    //   「本文を選択したときも拡大される」）。
    + '<meta name="viewport" content="width=device-width, initial-scale=1, '
    + 'maximum-scale=1, user-scalable=no">'
    // ★リンクは新しいタブへ。指定しないと、この枠の中で
    //   広告のページが開いてしまい、メールに戻れなくなります
    + '<base target="_blank">'
    + '<style>'
    // ★ダブルタップの拡大も止めます。文字の自動拡大（iOS が勝手に大きくする）も
    + 'html{-webkit-text-size-adjust:100%;touch-action:manipulation;}'
    + 'html,body{margin:0;padding:14px;font:15px/1.7 -apple-system,BlinkMacSystemFont,'
    + '"Hiragino Sans","Yu Gothic",sans-serif;color:#1a1d1a;background:#fff;'
    + 'word-break:break-word;overflow-wrap:anywhere;touch-action:manipulation;}'
    + 'img{max-width:100%;height:auto;}table{max-width:100%;}'
    + 'pre{white-space:pre-wrap;font:inherit;}'
    + '@media (prefers-color-scheme:dark){html,body{background:#fff;color:#1a1d1a;}}'
    + '</style></head><body>' + html + '</body></html>';
}

/**
 * 左端から右へなぞると、一覧へ戻ります。
 *
 * ★本文は iframe の中です。iframe の中の指の動きは親の画面まで
 *   届かないので、本文の上でなぞっても拾えません。そこで左端に
 *   見えない帯（#dEdge）を重ねて、そこだけで受けています。
 *
 * ★横に動いたとはっきりするまで、指の動きを横取りしません。
 *   先に横取りすると、端のあたりで縦に読もうとしたときに
 *   スクロールできなくなります。
 *
 * ★指につれて画面も動かします。動かないと「効いていない」と思って
 *   何度もなぞることになるためです。
 */
function bindEdgeBack() {
  const sheet = $('#detail');
  const edge = $('#dEdge');
  if (!sheet || !edge) return;

  let x0 = 0, y0 = 0, dx = 0, live = false, sideways = false;

  const reset = () => {
    live = false; sideways = false;
    sheet.classList.remove('is-dragging');
    sheet.style.transform = '';
    sheet.style.opacity = '';
  };

  edge.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    x0 = t.clientX; y0 = t.clientY; dx = 0;
    live = true; sideways = false;
  }, { passive: true });

  edge.addEventListener('touchmove', (e) => {
    if (!live) return;
    const t = e.touches[0];
    dx = t.clientX - x0;
    const dy = t.clientY - y0;
    if (!sideways) {
      if (Math.abs(dy) > Math.abs(dx)) { live = false; return; }   // 縦に読んでいる
      if (dx < 8) return;                                          // まだ分からない
      sideways = true;
      sheet.classList.add('is-dragging');
    }
    e.preventDefault();
    const d = Math.max(0, dx);
    sheet.style.transform = 'translateX(' + d + 'px)';
    sheet.style.opacity = String(Math.max(0.35, 1 - d / 520));
  }, { passive: false });

  edge.addEventListener('touchend', () => {
    if (!live) { reset(); return; }
    const far = sideways && dx > Math.min(70, window.innerWidth * 0.2);
    reset();
    if (far) closeDetail();
  });

  edge.addEventListener('touchcancel', reset);
}

/**
 * 一覧の行を横になぞる。
 *
 *   右へ → 既読／未読の切り替え
 *   左へ → フラグの付け外し
 *
 * ★まとめた行は、その中のぜんぶに効きます。
 * ★「選ぶ」の最中は効かせません。印を付けにいく指と喧嘩します。
 * ★横と分かるまで指の動きを横取りしないので、縦のスクロールは残ります。
 * ★なぞり終わったあとの一瞬は、押したことにしません。
 *   そうしないと、なぞるたびに本文が開いてしまいます。
 */
function bindSwipe() {
  const list = $('#list');
  if (!list) return;

  const hint = document.createElement('div');
  hint.className = 'swipehint';
  hint.hidden = true;
  document.body.appendChild(hint);

  let li = null, x0 = 0, y0 = 0, dx = 0, live = false, sideways = false;

  const clear = () => {
    if (li) { li.style.transform = ''; li.classList.remove('is-swiping'); }
    hint.hidden = true;
    li = null; live = false; sideways = false;
  };

  const keysOf = (el) => String(el.dataset.keys || el.dataset.id || '').split(' ').filter(Boolean);
  const allRead = (keys) => keys.every((k) => { const r = rowByKey(k); return r && !r[F.UNREAD]; });
  const allFlag = (keys) => keys.every((k) => S.star.has(k));

  list.addEventListener('touchstart', (e) => {
    if (S.picking || e.touches.length !== 1) return;
    const t = e.touches[0];
    const el = t.target.closest ? t.target.closest('.mail') : null;
    if (!el) return;
    li = el; x0 = t.clientX; y0 = t.clientY; dx = 0; live = true; sideways = false;
  }, { passive: true });

  list.addEventListener('touchmove', (e) => {
    if (!live || !li) return;
    // ★なぞっている途中で一覧が描き直されると、掴んでいた行は
    //   画面から外れます。そのまま続けると、うしろの帯だけが
    //   取り残されて消えなくなります
    if (!li.isConnected) { clear(); return; }
    const t = e.touches[0];
    dx = t.clientX - x0;
    const dy = t.clientY - y0;
    if (!sideways) {
      if (Math.abs(dy) > Math.abs(dx)) { live = false; return; }   // 縦に読んでいる
      if (Math.abs(dx) < 10) return;                               // まだ分からない
      sideways = true;
      li.classList.add('is-swiping');
      const r = li.getBoundingClientRect();
      hint.style.left = r.left + 'px';
      hint.style.top = r.top + 'px';
      hint.style.width = r.width + 'px';
      hint.style.height = r.height + 'px';
      hint.hidden = false;
    }
    e.preventDefault();
    const d = Math.max(-150, Math.min(150, dx));
    li.style.transform = 'translateX(' + d + 'px)';
    const keys = keysOf(li);
    const right = d > 0;
    hint.classList.toggle('is-read', right);
    hint.classList.toggle('is-flag', !right);
    hint.style.justifyContent = right ? 'flex-start' : 'flex-end';
    hint.textContent = right
      ? (allRead(keys) ? '未読に戻す' : '既読にする')
      : (allFlag(keys) ? 'フラグを外す' : 'フラグを付ける');
  }, { passive: false });

  list.addEventListener('touchend', () => {
    if (!live || !li || !li.isConnected) { clear(); return; }
    const far = sideways && Math.abs(dx) > 70;
    const right = dx > 0;
    const keys = keysOf(li);
    clear();
    if (!far || !keys.length) return;
    S.swiped = Date.now();              // この直後の「押した」は無かったことに
    if (right) { S.sel = new Set(keys); markSelected(!allRead(keys)); }
    else markStar(keys, !allFlag(keys));
  });

  list.addEventListener('touchcancel', clear);
}

function closeDetail() {
  $('#detail').hidden = true;
  $('#reply').hidden = true;
  document.body.classList.remove('is-modal');
  S.openKey = null;
  S._body = null;
}

/* ============================================================
 *  返信
 * ========================================================== */

function openReply() {
  const row = rowByKey(S.openKey);
  if (!row) return;
  const name = row[F.NAME] || String(row[F.FROM]).split('@')[0];
  $('#rTo').textContent = (row[F.NAME] || '') + ' <' + row[F.FROM] + '>';

  // 差出人。届いた箱と同じアドレスがあれば、それを初期値にします。
  // ★仕事あてに来たメールに個人のアドレスで返すのを防ぐためです
  const box = folderOf(row);
  const from = $('#rFrom');
  // ★**必ず出します。**前は「2つ以上あるとき」だけ出していたので、
  //   受け口の返事が揃わなかった回には消えていました
  //   （2026-11-19、ko-dai さんの「出る時と出ない時がある」）。
  //   どのアドレスから出るのかは、毎回見えていないと困ります
  const list = fromList();
  from.innerHTML = list.map((a) => '<option value="' + esc(a) + '"'
    + (a === box ? ' selected' : '') + '>' + esc(a) + '</option>').join('');
  $('#rFromWrap').hidden = false;
  $('#rText').value = '';
  renderAiRow('reply');
  $('#rTpl').innerHTML = S.tpl.length
    ? S.tpl.map((t, i) => '<button class="tplchip" data-tpl="' + i + '">' + esc(t[1]) + '</button>').join('')
    : '<span class="muted">テンプレはまだありません。設定から足せます</span>';
  $('#rTpl').dataset.name = name;
  $('#reply').hidden = false;
  $('#rText').focus();
}

// ★【　】があれば、穴うめの画面をひらきます（js/fill.js）。
//   無ければ今までどおり、そのまま差し込みます
function useTemplate(i) { openFill(i, 'reply'); }

/* ============================================================
 *  新しく書く（返信ではないメール）
 *
 *  ★ホテルへの予約確認のように、**こちらから出す**ものがあります。
 *    返信しかできないと、予約サイトへ返すことになって届きません。
 * ========================================================== */

function openCompose() {
  if (S.demo) { toast('見本なので送れません'); return; }
  if (!S.main) { toast('先に受け口をつないでください', true); return; }
  $('#cTo').value = '';
  $('#cCc').value = '';
  $('#cSubj').value = '';
  $('#cText').value = '';

  const from = $('#cFrom');
  from.innerHTML = fromList()
    .map((a) => '<option value="' + esc(a) + '">' + esc(a) + '</option>').join('');
  $('#cFromWrap').hidden = false;      // ★必ず出します（上の説明と同じ）

  renderAiRow('new');
  $('#cTpl').innerHTML = S.tpl.length
    ? S.tpl.map((t, i) => '<button class="tplchip" data-ctpl="' + i + '">' + esc(t[1]) + '</button>').join('')
    : '<span class="muted">テンプレはまだありません。設定から足せます</span>';

  $('#compose').hidden = false;
  document.body.classList.add('is-modal');
  // ★ふつうに focus すると、そのらんを見せようとして中身が少し
  //   下にずれ、「宛先」の見出しが隠れます
  $('#cTo').focus({ preventScroll: true });
  const body = $('#compose .sheet__body');
  if (body) body.scrollTop = 0;
}

function closeCompose() {
  $('#compose').hidden = true;
  if ($('#detail').hidden && $('#settings').hidden && $('#senders').hidden) {
    document.body.classList.remove('is-modal');
  }
}

/**
 * ★{name} はここでは置き換えません。返信とちがって相手の名前が
 *   分からないので、空にすると「 様」だけが残ります。
 *   そのまま出しておけば、埋め忘れに気づけます。
 */
function useTemplateCompose(i) { openFill(i, 'new'); }

async function sendNew(asDraft) {
  const to = $('#cTo').value.trim();
  const text = $('#cText').value.trim();
  if (!to) { toast('宛先が空です', true); return; }
  if (!/^[^\s@,]+@[^\s@,]+\.[^\s@,]+/.test(to)) { toast('宛先のかたちが違うようです', true); return; }
  if (!text) { toast('本文が空です', true); return; }

  const from = $('#cFromWrap').hidden ? '' : $('#cFrom').value;
  // ★その差出人を持っている受け口に頼みます
  const src = (from && S.aliasSrc[from]) || S.main;
  const subj = $('#cSubj').value.trim();

  // ★新しく書くときだけ、送る前に一度確かめます。返信とちがって
  //   宛先を自分で打つので、打ち間違えると知らない人に届きます
  if (!asDraft && !confirm(to + '\n\nに送ります。'
      + (from ? '\n差出人： ' + from : '')
      + '\n件名： ' + (subj || '（なし）')
      + '\n\nよろしいですか？')) return;

  try {
    S.busy = asDraft ? '下書きにしています…' : '送っています…'; render();
    await Api.send(src, {
      to: to, cc: $('#cCc').value.trim(), subject: subj, text: text,
      from: from, draft: !!asDraft,
    });
    closeCompose();
    if (!asDraft) {
      AI.learn({ box: composeBox(), subject: subj, text: text });
    }
    toast(asDraft ? '下書きに入れました' : '送りました');
  } catch (e) {
    toast(String(e.message || e), true);
  } finally {
    S.busy = ''; render();
  }
}

/* ============================================================
 *  AI に書いてもらう
 *
 *  ★書くのは Mac の Hub Board の中の Claude です（js/ai.js）。
 *    こちらからは、メールの中身と「どう返すか」を渡すだけです。
 *
 *  ★返ってきた文は**足します。上書きしません。**
 *    自分で打った文が消えるほうが困るためです。
 * ========================================================== */
/**
 * AI のらんを出します。
 *
 * ★つないでいないとき、前は**らんごと消して**いました。
 *   そうすると「この画面には AI が無い」と見えます
 *   （2026-11-20、ko-dai さんの「新規作成から AI を使えるように」）。
 *   **出したうえで、つなぎ方へ案内します。**
 */
/** 設定の「AI に書いてもらう」のところまで送ります */
function aiJump() {
  const el = $('#aiUrl') || $('#aiProfile');
  if (el) setTimeout(() => el.scrollIntoView({ block: 'center' }), 60);
}

function renderAiRow(where) {
  const isNew = where === 'new';
  const row = $(isNew ? '#cAiRow' : '#rAiRow');
  if (!row) return;
  const note = $(isNew ? '#cAiNote' : '#rAiNote');
  const go = $(isNew ? '#cAiGo' : '#rAiGo');
  const set = $(isNew ? '#cAiSet' : '#rAiSet');
  const hand = $(isNew ? '#cAiHand' : '#rAiHand');
  const ready = AI.ready() && !S.demo;
  /* ★「Claude アプリに渡す」は、**つないでいなくても使えます**。
   *   Mac が切れている・寝ているときのための道だからです（2026-11-21）。
   *   見本のときだけ出しません。 */
  const canHand = !S.demo;
  row.hidden = false;
  note.value = '';
  note.disabled = !ready && !canHand;
  note.placeholder = (ready || canHand)
    ? (isNew ? '何を書くか、ひとことで（例：ホテルに予約の確認。感謝も）'
             : 'どう返すか、ひとことで（例：お礼と、到着は20時ごろ）')
    : '見本なので使えません';
  go.hidden = !ready;
  if (hand) hand.hidden = !canHand;
  if (set) set.hidden = ready || S.demo;
}

/**
 * AI に渡す中身を作ります（「書いてもらう」と「Claude アプリに渡す」で同じもの）。
 * ★2つの場所に同じ組み立てを書くと、片方だけ直して食い違います。
 */
function aiMessage(where) {
  const isNew = (where === 'new');
  const noteEl = $(isNew ? '#cAiNote' : '#rAiNote');
  const note = noteEl ? noteEl.value.trim() : '';
  if (isNew) {
    return {
      mode: 'new', box: composeBox(),
      to: $('#cTo').value.trim(), subject: $('#cSubj').value.trim(), note,
    };
  }
  const row = rowByKey(S.openKey);
  if (!row) return null;
  const d = S._body || {};
  return {
    mode: 'reply', box: folderName(folderOf(row)) || '',
    from: String(row[F.FROM] || ''), fromName: String(row[F.NAME] || ''),
    subject: String(row[F.SUBJ] || ''),
    // 本文がまだ来ていなければ、索引にある冒頭だけで書いてもらいます
    body: String(d.text || '').trim() || stripTags(String(d.html || '')) || String(row[F.SNIP] || ''),
    snippet: String(row[F.SNIP] || ''),
    note,
  };
}

async function aiWrite(where) {
  const isNew = (where === 'new');
  const noteEl = $(isNew ? '#cAiNote' : '#rAiNote');
  const textEl = $(isNew ? '#cText' : '#rText');
  const btn = $(isNew ? '#cAiGo' : '#rAiGo');
  if (!noteEl || !textEl || !btn) return;

  const m = aiMessage(where);
  if (!m) return;

  const was = btn.textContent;
  btn.disabled = true;
  try {
    btn.textContent = '書いています…';
    const text = await AI.write(m, (sec) => { btn.textContent = '書いています… ' + sec + '秒'; });
    const cur = textEl.value;
    textEl.value = cur ? cur + '\n\n' + text : text;
    textEl.focus();
    noteEl.value = '';
    toast('書けました。読んでから送ってください');
  } catch (e) {
    toast(String(e.message || e), true);
  } finally {
    btn.disabled = false;
    btn.textContent = was;
  }
}

/**
 * Claude アプリに渡します（Mac が切れているとき）。
 *
 * ★文面を書くのは Mac の中の Claude なので、Mac が寝ていると使えません。
 *   そこで**頼み文だけを組み立ててコピー**し、iPhone の Claude アプリに
 *   貼ってもらいます。ko-dai さんのふだんのプランで動くので、
 *   別の請求は立ちません（2026-11-21 ko-dai さんの選択）。
 *
 * ★手本（過去に返した文）は Mac の中にしかないので入りません。
 *   「自分のこと」は端末に写してあるので入ります。
 */
async function aiHandoff(where) {
  const btn = $(where === 'new' ? '#cAiHand' : '#rAiHand');
  if (!btn) return;
  const m = aiMessage(where);
  if (!m) return;
  const was = btn.textContent;
  const ok = await AI.copy(AI.prompt(m));
  if (!ok) { toast('コピーできませんでした', true); return; }
  btn.textContent = 'コピーしました';
  setTimeout(() => { btn.textContent = was; }, 2000);
  toast('Claude アプリをひらいて貼り付け、返ってきた文をここに貼ってください');
}

/**
 * 新しく書くときの「箱」。
 * ★全受信を見ているときは箱が決まらないので、差出人に選んだ
 *   アドレスから決めます。箱が決まらないと、手本も覚え書きも効きません。
 */
function composeBox() {
  if (S.folder) return folderName(S.folder) || '';
  const w = $('#cFromWrap');
  const from = (w && !w.hidden) ? $('#cFrom').value : (S.hosts[S.main] || '');
  return from ? (folderName(from) || '') : '';
}

/** 本文の HTML から、ざっくり文字だけ取り出します（AI に渡すため） */
function stripTags(html) {
  if (!html) return '';
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function sendReply(asDraft) {
  const text = $('#rText').value.trim();
  if (!text) { toast('本文が空です', true); return; }
  if (S.demo) { toast('見本なので送りません'); return; }
  const row = rowByKey(S.openKey);
  if (!row) return;
  const src = String(row[F.SRC] || '');
  const id = String(row[F.ID]);
  const all = $('#rAll').checked;
  const from = $('#rFromWrap').hidden ? '' : $('#rFrom').value;
  if (!asDraft && !confirm((from ? from + ' から送ります。\n\n' : '')
      + 'この内容で送ります。よろしいですか？')) return;
  try {
    S.busy = asDraft ? '下書きにしています…' : '送っています…'; render();
    if (asDraft) await Api.draft(src, id, text, all, from);
    else await Api.reply(src, id, text, all, from);
    $('#reply').hidden = true;
    // ★送ったら、その場で「返信ずみ」の印をつけます。
    //   受け口に聞き直すのを待つと、送った直後の一覧に印が出ません
    if (!asDraft) {
      const tk = threadKey(row);
      if (tk) {
        S.replied.add(tk);
        await Store.set('replied', Array.from(S.replied));
      }
    }
    // ★送った文を手本として覚えてもらいます（使うほど自分の言い回しに近づく）
    if (!asDraft) {
      AI.learn({ box: folderName(folderOf(row)) || '', subject: String(row[F.SUBJ] || ''), text });
    }
    toast(asDraft ? '下書きに入れました' : '送りました');
  } catch (e) {
    toast(String(e.message || e), true);
  } finally {
    S.busy = ''; render();
  }
}

/* ============================================================
 *  索引を取りに行く
 * ========================================================== */

async function pullAll(src, onProgress) {
  let offset = 0, total = 0;
  const rows = [];
  for (;;) {
    const d = await Api.pull(src, offset, APP.pullChunk);
    total = d.total;
    if (!d.rows.length) break;
    d.rows.forEach((r) => { r[F.SRC] = src; rows.push(r); });
    offset += d.rows.length;
    if (onProgress) onProgress(offset, total);
    if (offset >= total) break;
  }
  return rows;
}

/**
 * 「古いメールがまだそろっていません」の知らせを出すか決めます。
 *
 * ★前は起動のときに1回しか決めていなかったので、読み込み終わっても
 *   出たままでした。索引の数が動いたら、そのつど見直します。
 */
function renderScanNote() {
  const n = $('#scanNote');
  if (!n) return;
  const live = Api.live();
  n.hidden = S.demo || !live.length || S.scanning || live.every((src) => S.done[src]);
}

/** 続きを読み込む。1回では終わらないので、終わるまで繰り返します */
async function scanLoop(src) {
  if (S.scanning) return;
  S.scanning = true;
  renderSources();
  const nm = srcName(src);
  try {
    for (let i = 0; i < 40; i++) {
      S.busy = nm + 'の古いメールを読み込んでいます… ' + (i + 1) + '回目'; render();
      const d = await Api.scan(src);
      S.indexed[src] = Number(d.indexed || 0);
      if (d.inbox) S.inbox[src] = Number(d.inbox);
      S.done[src] = !!d.done;
      renderSources();
      if (d.done) { toast(nm + 'はぜんぶ読み込みました'); break; }
      if (!d.added) { toast(nm + 'はこれ以上増えませんでした'); break; }
    }
    S.busy = '索引を受け取っています…'; render();
    // ★取り直したぶんで、その受け口のぶんを丸ごと置き換えます。
    //   足すだけだと、Gmail 側で消したメールがいつまでも残ります
    S.rows = S.rows.filter((r) => String(r[F.SRC]) !== src);
    const rows = await pullAll(src, (n, t) => {
      S.busy = '索引を受け取っています… ' + n.toLocaleString() + ' / ' + t.toLocaleString();
      $('#busy').textContent = S.busy;
    });
    mergeRows(rows, src);
    await Store.saveAll(S.rows);
  } catch (e) {
    toast(String(e.message || e), true);
  } finally {
    S.scanning = false;
    S.busy = ''; render(); renderSources();
  }
  // ★受け取り直したあとは、未読の印をそろえ直します。
  //   受け口の表計算は未読を持たなくなったので（既読にするのを速くするため）、
  //   そろえるのは Gmail から来る取り込みの役目です
  await syncNew(true);
}

/** 新着を取り込む。ふだんはこちら */
/* ============================================================
 *  新着の見張り
 *
 *  ★いままでは「開いたとき」と「ほかのタブから戻ったとき」しか
 *    見ていませんでした。開いたまま眺めていると、新着は出ません。
 *
 *  ★毎回まるごと聞きに行くと重いので、**まず軽く「変わった？」**
 *    だけを聞きます（peek）。変わったときだけ、ちゃんと取りに行きます。
 *
 *  ★画面を見ていないあいだは何もしません。iPhone を伏せているのに
 *    聞き続けると、電池も Google の持ち時間も無駄になります。
 * ========================================================== */
/* ★見る間隔。この窓を見ているときだけ短くします。
 *   Google の受け口には**1日ぶんの持ち時間**（90分）しかありません。
 *   ずっと短い間隔で聞き続けると、それだけで使い切ってしまいます。 */
/* ★2026-11-18、30秒 → 10秒にしました。
 *
 *   はじめ「Apps Script は1日90分しか動けないから30秒より短くできない」と
 *   書きましたが、**その90分は『トリガー（時間で動く仕掛け）の合計』**で、
 *   こちらの聞きかた（ウェブアプリへの POST）とは別の枠でした。
 *   かりに同じ枠だとしても、10秒 × 8時間 ＝ 2,880回 × 約0.5秒 ＝ 約24分で、
 *   90分には届きません。
 *
 *   ★それでも1秒や2秒にはしません。1回の問い合わせ自体に1〜2秒かかるので、
 *     短くしても前の問い合わせが終わらないうちに次が来るだけです。
 *     **実際にかかっている時間は ⚙ の受け口らんに出しています。**
 */
const WATCH_FOCUS_SEC = 10;   // この窓を見ている
const WATCH_BACK_SEC = 180;   // 開いてはいるが、ほかの窓が前にある

function startWatch() {
  if (S.watching) return;            // ★二重に仕掛けません
  // 2秒ごとに「そろそろ聞く時間か」だけを見ます。
  // ★こうしておくと、窓を見はじめた瞬間から短い間隔に切り替わります
  S.watching = setInterval(watchTick, 2000);
  // 窓を前に出した（ほかのアプリから戻った）ときは、待たずに聞きます。
  // ★同じタブのままなので visibilitychange は鳴りません
  addEventListener('focus', () => { S.watchAt = 0; watchTick(); });
}

function watchTick() {
  if (document.hidden || S.demo || S.scanning || S.busy || S.watchBusy) return;
  const wait = (document.hasFocus() ? WATCH_FOCUS_SEC : WATCH_BACK_SEC) * 1000;
  if (Date.now() - (S.watchAt || 0) < wait) return;
  S.watchAt = Date.now();
  watchOnce();
}

async function watchOnce() {
  const live = Api.live();
  if (!live.length) return;
  S.watchBusy = 1;
  try {
    // ★受け口は**まとめて同時に**聞きます。1つずつ待つと、受け口の数だけ
    //   1〜2秒が足し算になり、10秒おきにした意味が薄れます
    const t0 = Date.now();
    const got = await Promise.all(live.map((src) =>
      Api.peek(src).then((r) => ({ src, h: String(r.h || '') }))
        .catch(() => ({ src, h: '' }))));
    // ★かかった時間を覚えておきます。⚙ に出して、間あいを決める手がかりにします
    S.pingMs = Date.now() - t0;

    let moved = false;
    for (const { src, h } of got) {
      if (!h) continue;              // 印が取れない受け口は、見張りの対象外
      const before = S.seenH[src];
      S.seenH[src] = h;
      if (before === undefined) continue;   // 1回目は、ものさしを置くだけ
      if (before !== h) moved = true;
    }
    if (moved) await syncNew(true);
  } finally {
    S.watchBusy = 0;
    S.watchAt = Date.now();          // 聞き終わった時刻から数え直します
  }
}

/**
 * 返信ずみのやり取りを覚えます。
 *
 * ★**足すだけ**です。消しません。返信は取り消せないので、
 *   一度ついた印が消えることはありません。足すだけにしておけば、
 *   ふだんの `sync` は近い30日ぶんだけ聞いて済みます。
 */
async function addReplied(src, tids) {
  if (!tids || !tids.length) return 0;
  let n = 0;
  for (const t of tids) {
    const k = String(src) + ':' + String(t);
    if (!S.replied.has(k)) { S.replied.add(k); n++; }
  }
  if (n) await Store.set('replied', Array.from(S.replied));
  return n;
}

/**
 * 索引を端末に書き戻します。**待ちません。**
 *
 * ★`Store.saveAll` は索引を**まるごと**書き直します（5万3千行なら2千行ずつ27回）。
 *   待っていると、メールはもう画面に出ているのに**ボタンが回り続けます**
 *   （2026-11-19、ko-dai さんの「更新ボタンがしばらく回っている」）。
 *
 * ★書けなくても困りません。次に取り込んだとき、手元と受け口の数を
 *   見比べて足りないぶんを取り戻すので、そこで入り直します。
 *
 * ★同時に走らせません。重ねると、同じものを何度も書くだけ遅くなります。
 */
function saveSoon() {
  S.saveWant = true;
  if (S.saving) return;
  S.saving = true;
  (async () => {
    try {
      while (S.saveWant) {
        S.saveWant = false;
        await Store.saveAll(S.rows);
      }
    } catch (e) {
      // 書けなかったことは画面に出しません（次の取り込みで取り戻せます）
    } finally {
      S.saving = false;
    }
  })();
}

/**
 * 新着を取り込みます。
 *
 * ★`pre` に「先に頼んでおいた返事」を渡せます。起動のときは、受け口に
 *   聞くのと同時に取り込みも頼むので、**往復が1回で済みます**
 *   （前は「聞く」→「取り込む」の2往復で、受け口が眠っていると
 *     そのぶん待ち時間が倍になりました。2026-11-20）。
 */
/* ★「ぜんぶそろえる」のを、どれくらいの間あいで入れるか。
 *   未読・フラグ・返信ずみ・合計は、新着を出すのには要りません。
 *   毎回そろえていたので、1通届くだけで Gmail に7往復していました
 *   （2026-11-22、ko-dai さんの「受信に時間がかかる」）。 */
const FULL_SYNC_SEC = 300;    // 5分に1回は、そろえ直します

async function syncNew(quiet, pre) {
  const live = Api.live();
  if (!live.length) return;
  // ★索引を読み込んでいる最中は割り込みません。同じ受け口に
  //   同時に頼むと、向こうが同じ行に二重書きしてしまいます。
  //   （読み込みは十数分かかるので、その間にタブを切り替えると
  //     ふつうに起きます）
  if (S.scanning) return;
  let added = 0;
  try {
    if (!quiet) { S.busy = '新着を見ています…'; render(); }
    // ★受け口は**まとめて同時に**聞きます。1つずつ待つと、受け口の数だけ
    //   1〜3秒が足し算になります（受け口は別々の Google アカウントなので、
    //   同時に頼んでもぶつかりません）
    /* ★見張りが呼んだとき（quiet）は**軽いほう**を頼みます。
     *   ただし、しばらく軽いのが続いたら1回そろえ直します
     *   （Gmail や「メール」アプリで既読にしたぶんを合わせるため）。 */
    const light = !!quiet && (Date.now() - (S.fullAt || 0) < FULL_SYNC_SEC * 1000);
    if (!light) S.fullAt = Date.now();
    /* ★いま持っている通数を一緒に渡します。
     *   受け口は「今回あたらしく入れたぶん」しか返さないので、
     *   Mac に先を越されたスマホは**何も受け取れず**、
     *   そのあと「取り戻し」でもう1往復していました（2026-11-22）。 */
    const have0 = {};
    live.forEach((src) => { have0[src] = 0; });
    for (let i = 0; i < S.rows.length; i++) {
      const sc = String(S.rows[i][F.SRC]);
      if (have0[sc] !== undefined) have0[sc]++;
    }
    // ★「どこまで読んだか」を覚えていれば、そちらを使います（上の説明）
    live.forEach((src) => {
      const c = Number(S.consumed[src] || 0);
      if (c > have0[src]) have0[src] = c;
    });
    const t0 = Date.now();
    const got = pre || await Promise.all(live.map((src) =>
      Api.sync(src, light, have0[src]).then((d) => ({ src, d })).catch((e) => ({ src, e }))));
    /* ★起動のときは**先に頼んである**ので、ここでは測れません。
     *   起動のほうで測った時間を使います。0 にしていたせいで、
     *   いちばん見たい場面で秒数が出ていませんでした（2026-11-23）。 */
    const askMs = pre ? Number((S.bootMs && S.bootMs.sync) || 0) : (Date.now() - t0);

    // ★取り込んだ中身をさわるのは**ここから1つずつ**です。
    //   S.rows は1本しかないので、同時に書き換えると取りこぼします
    const failed = [];
    let dirty = false;                 // 索引を書き直す必要があるか
    for (const { src, d, e } of got) {
      if (e || !d) {
        // ★転んだ受け口は、名前を控えて必ず知らせます。
        //   まとめて同時に聞くようにしたとき（2026-11-18）、
        //   **片方が転んでも黙って「新着はありません」と出す**ようになって
        //   いました。届いていないのか、聞けていないのかが分かりません
        S.ok[src] = false;
        S.err[src] = String((e && e.message) || e || '返事がありません');
        failed.push(srcName(src) + '：' + S.err[src]);
        continue;
      }
      S.ok[src] = true;
      S.err[src] = '';
      S.indexed[src] = Number(d.indexed || 0);
      if (d.inbox) S.inbox[src] = Number(d.inbox);
      /* ★何が返ってきたかを覚えます。⚙ に出して、届かないときに
       *   **どこで止まっているか**を見られるようにするためです（2026-11-22）。 */
      S.lastSync[src] = {
        at: Date.now(), light: !!d.light, ms: askMs,
        have: have0[src], added: (d.added || []).length,
        catchUp: (d.catchUp || []).length, indexed: Number(d.indexed || 0),
      };
      // ★足りないぶんも同じ返事に入っています（往復が1回ぶん減ります）
      const n1 = mergeRows((d.added || []).concat(d.catchUp || []), src);
      S.lastSync[src].got = n1;          // 実際に増えた数
      /* ★受け口が「足りないぶん」を最後まで返してくれたなら、
       *   そこまで読んだことになります。覚えておけば、次からは
       *   同じところを取り寄せ直しません。
       *   1000通ちょうどなら、まだ先がある（途中）ということです。 */
      if (d.catchUp && d.catchUp.length < 1000 && d.indexed) {
        S.consumed[src] = Number(d.indexed);
      }
      added += n1;
      if (n1) dirty = true;
      if (d.replied) await addReplied(src, d.replied);
      // ★見張りのものさしは、取り込みの返事に入っています。
      //   前はこのあと peek をもう1回ずつ聞いていました（往復の無駄）。
      //   古い受け口は返さないので、そのときだけ今までどおり聞きます
      if (d.h) S.seenH[src] = String(d.h);
      // 未読の一覧を受け取って、こちらの印を合わせます。
      // 既読かどうかは Gmail 側でも変わるので、毎回そろえます。
      // ★合わせるのは、その受け口から来た行だけです。全部に当てると、
      //   もう片方の受け口のメールが軒並み既読になってしまいます
      /* ★軽いほう（light）では未読の一覧が来ません。
       *   来ていないのに合わせようとすると、**全部を既読にして**しまいます。
       *   来たときだけ合わせます（2026-11-22）。 */
      if (d.unread) {
        const un = new Set(d.unread.map(String));
        /* ★受け口は2500通で一覧を打ち切ります。打ち切られたときに
         *   「この一覧に無い＝既読」と決めると、**残りを全部既読にして**
         *   しまいます。そのときは「未読を付ける」だけにします
         *   （2026-11-22 の指摘。そのとおりでした）。 */
        const cut = !!d.unreadCut;
        for (let i = 0; i < S.rows.length; i++) {
          if (String(S.rows[i][F.SRC]) !== src) continue;
          const has = un.has(String(S.rows[i][F.ID]));
          if (!has && cut) continue;            // 打ち切られているので、既読にはしません
          const now = has ? 1 : 0;
          // ★変わったときだけ印を付けます。下の「書き直すかどうか」に使います
          if (S.rows[i][F.UNREAD] !== now) { S.rows[i][F.UNREAD] = now; dirty = true; }
        }
      }
      // フラグも同じようにそろえます。Gmail や「メール」アプリで
      // 付け外ししたものが、こちらにも出るようにするためです
      if (d.starred) {
        // ★中身が変わったときだけ書きます（毎回書くと、そのぶん遅くなります）
        const was = Array.from(S.star).filter((k) => k.indexOf(src + ':') === 0).sort().join(',');
        // ★未読と同じく、打ち切られていたら**外しません**（足すだけ）
        if (!d.starredCut) {
          Array.from(S.star).forEach((k) => {
            if (k.indexOf(src + ':') === 0) S.star.delete(k);
          });
        }
        d.starred.forEach((id) => S.star.add(src + ':' + String(id)));
        const now = d.starred.map((id) => src + ':' + String(id)).sort().join(',');
        if (was !== now) await Store.set('star', Array.from(S.star));
      }
    }

    // ★受け口の索引のほうが多いときは、その差を取り戻します。
    //
    //   受け口の sync は「今回あたらしく入れたぶん」しか返しません。
    //   ほかの誰か（1分おきの見張りなど）が先に取り込んでしまうと、
    //   **その通はアプリに永久に来ません。**2026-11-19 に実際そうなりました。
    //
    //   ★はじめ「3,000通を超えたら見送る」にしていましたが、**間違いでした。**
    //     実際の差は約3,500通で、会社のぶんがまるごと見送られ、
    //     「新着はありません」と出続けました（同日、ko-dai さんの画面で判明）。
    //     上限で切らず、**少しずつ、無くなるまで**取り戻します。
    for (const { src, d } of got) {
      if (!d) continue;
      const total = Number(d.indexed || 0);
      const nm = srcName(src);
      /* ★前に取り戻して**1通も増えなかった**ときの数を覚えておきます。
       *   覚えていなかったので、差が埋まらない受け口では
       *   **新着を見るたびに1000行を取り寄せては捨てて**いました
       *   （索引に二重の行があると、こちらは Message-ID でまとめるので
       *     差がずっと残ります）。2026-11-22。 */
      if (S.gapStuck[src] === total) continue;
      for (let round = 0; round < 40; round++) {       // 最大 4万通ぶん
        const have = Math.max(
          S.rows.filter((r) => String(r[F.SRC]) === src).length,
          Number(S.consumed[src] || 0));
        const gap = total - have;
        /* ★こちらの通数のほうが多いことがあります（点検で索引が減ったあとなど）。
         *   前はここで止めていたので、**そのあと何をしても新着が入りません**でした。
         *   いまは受け口が「うしろ100行」を返してくれるので、ここは止めて大丈夫です
         *   （2026-11-22）。 */
        if (gap <= 0) break;
        if (!quiet || gap > 200) {
          S.busy = nm + 'の取りこぼしを入れています… あと ' + gap.toLocaleString() + '通';
          render();
        }
        try {
          // 手元にあるのは索引の先頭から have 行ぶん。足りないのはその続きです
          const take = Math.min(gap, 1000);
          const r2 = await Api.pull(src, have, take);
          const n2 = mergeRows(r2.rows || [], src);
          added += n2;
          if (n2) dirty = true;
          if (!n2) {                                   // 進まないなら、やめます
            S.gapStuck[src] = total;                   // ★次からは、数が変わるまで聞きません
            break;
          }
        } catch (e) {
          break;                                       // 取り戻せなくても、次の回に
        }
      }
    }
    S.busy = '';

    // ★変わったときだけ書き直します。
    //
    //   ここは索引を**まるごと**書き直します（5万3千行なら、2千行ずつ27回）。
    //   前は取り込みのたびに毎回やっていたので、**新着が無くても数秒かかって
    //   いました**（2026-11-19、ko-dai さんの「読み込みに非常に長い時間がかかる」）。
    //   ふだんは何も変わらないので、ほとんどの回はここを通りません。
    if (dirty) saveSoon();          // ★待ちません（上の説明）
    // ★「索引を何行目まで読んだか」も残します（次に開いたときに使います）
    await Store.set('consumed', S.consumed);
    await Store.set('fmt', Store.FMT);
    await Store.set('lastSync', Date.now());
    // 古い受け口のぶんだけ、ものさしを聞き直します
    const older = got.filter((x) => x.d && !x.d.h).map((x) => x.src);
    if (older.length) {
      await Promise.all(older.map((src) =>
        Api.peek(src).then((r) => { S.seenH[src] = String(r.h || S.seenH[src] || ''); })
          .catch(() => {})));
    }
    // ★転んだ受け口があれば、取り込めたぶんの話より先に知らせます
    if (failed.length) {
      toast(failed.join('\n'), true);
    } else if (!quiet) {
      // ★「新着はありません」だけだと、**届いていないのか、聞けていないのか、
      //   もう入っているのか**が分かりません。数を並べて出します。
      //   範囲のほうが多ければ、索引に入りきっていないということです
      const line = live.map((src) => {
        const n = Number(S.indexed[src] || 0);
        const t = Number(S.inbox[src] || 0);
        return srcName(src) + ' ' + n.toLocaleString() + '通'
             + (t && t > n ? '（範囲は ' + t.toLocaleString() + '通）' : '');
      }).join('／');
      toast(added ? added.toLocaleString() + '通が届いていました' : '新着はありません\n' + line);
    }
    render(); renderSources();
    recountSometimes();          // ★たまに合計を数え直します（下の説明）
  } catch (e) {
    if (!quiet) toast(String(e.message || e), true);
  } finally {
    S.busy = ''; render();
  }
}

/* ============================================================
 *  プッシュ通知
 *
 *  ★見張りをするのは**受け口（Google のサーバー）**です。
 *    Mac の Hub Board にやらせると、**Mac が寝ているあいだ誰も気づけません。**
 *    ko-dai さんの条件は「常にスマホに通知が来ること」なので、
 *    受け口に1分おきの見張りを置いています。
 *
 *  ★通知に**中身は入れていません。**届くのは合図だけで、件名と差出人は
 *    サービスワーカーが受け口に聞きに行きます（`sw.js`）。
 *    そのために、受け口の住所と合言葉を IndexedDB にも写します
 *    （サービスワーカーからは localStorage が読めないため）。
 * ========================================================== */

function pushReady() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** base64url の鍵を、subscribe が受け取れる形に直します */
function keyBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * いまの登録を返します。
 *
 * ★`navigator.serviceWorker.ready` は、**世話係がまだ入っていないと
 *   いつまでも返りません。**そこで止まると設定の画面が固まるので、
 *   `getRegistration()` で「あるか」を先に見ます。
 */
async function pushReg() {
  if (!pushReady()) return null;
  try { return (await navigator.serviceWorker.getRegistration()) || null; }
  catch (e) { return null; }
}

async function pushSub() {
  const reg = await pushReg();
  if (!reg || !reg.pushManager) return null;
  try { return await reg.pushManager.getSubscription(); } catch (e) { return null; }
}

async function renderPush() {
  const note = $('#pushNote');
  const on = $('#pushOn');
  const off = $('#pushOff');
  if (!note || !on || !off) return;

  if (!pushReady()) {
    note.textContent = 'この端末（この browser）は通知に対応していません。';
    on.hidden = true; off.hidden = true;
    return;
  }
  // ★iPhone は「ホーム画面に追加」したものでないと通知を受け取れません。
  //   Safari のタブのままだと、押しても必ず断られます
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (ios && !window.navigator.standalone) {
    note.innerHTML = '<b>先にホーム画面に追加してください。</b>'
      + 'iPhone は、ホーム画面から開いたときだけ通知を受け取れます'
      + '（共有 → ホーム画面に追加）。';
    on.hidden = true; off.hidden = true;
    return;
  }
  const reg = await pushReg();
  if (!reg) {
    note.textContent = 'この画面ではまだ用意ができていません。'
      + 'いちど開き直してから、もう一度ひらいてください。';
    on.hidden = true; off.hidden = true;
    return;
  }
  const sub = await pushSub();
  const yes = !!sub && Notification.permission === 'granted';
  on.hidden = yes; off.hidden = !yes;
  /* ★受け取っている最中でも「入れ直す」を出します。
   *   受け口どうしの**鍵をそろえる**のは「通知を受け取る」を押したときだけで、
   *   そのボタンが隠れていると**直す道がありませんでした**（2026-11-22）。 */
  const again = $('#pushAgain');
  if (again) again.hidden = !yes;
  if (!yes) {
    note.textContent = Notification.permission === 'denied'
      ? '通知が断られています。端末の設定から Mail Board の通知を許可してください。'
      : 'まだ受け取っていません。';
    return;
  }
  // ★ここまでは「端末の中」の話です。**受け口が知っているか**は別なので、聞きます。
  //   前は端末の中だけを見て「受け取ります」と出していたので、
  //   受け口に登録できていなくても気づけませんでした（2026-11-19）。
  note.textContent = 'この端末は受け取ります。受け口を確かめています…';
  const live = Api.live();
  const ng = [];
  for (const src of live) {
    try {
      const d = await Api.pushHas(src, sub.endpoint);
      if (d.has) continue;
      // 知らなければ、その場で登録し直します（押し直さずに済むように）
      await Api.pushAdd(src, sub.endpoint, navigator.userAgent);
      const again = await Api.pushHas(src, sub.endpoint);
      if (!again.has) ng.push(srcName(src));
    } catch (e) {
      ng.push(srcName(src) + '（' + String(e.message || e).slice(0, 40) + '）');
    }
  }
  note.textContent = ng.length
    ? '★' + ng.join('・') + ' の受け口に登録できていません。'
    : 'この端末は受け取ります（受け口' + live.length + 'つとも登録ずみ）。';
}

/**
 * 通知が届いたかどうかの記録を出します。
 *
 * ★届かないときに**何も分からない**のがいちばん困ります。受け口は
 *   送るたびに結果を残しているので、それをそのまま見せます（2026-11-22）。
 *   403 … 鍵がちがう（受け口どうしで鍵がそろっていない）
 *   410 / 404 … 送り先がもう無い（通知を入れ直してください）
 *   201 / 200 … 受け口からは送れている（端末側の設定を見ます）
 */
async function showPushLog() {
  const box = $('#pushLogBox');
  if (!box) return;
  box.hidden = false;
  box.textContent = '聞いています…';
  const live = Api.live();
  const out = [];
  for (const src of live) {
    try {
      const d = await Api.pushLog(src);
      out.push('── ' + srcName(src) + '（送り先 ' + Number(d.n || 0) + '件）\n'
        + (String(d.log || '').trim() || '（まだ1回も送っていません）'));
    } catch (e) {
      out.push('── ' + srcName(src) + '\n✗ ' + String(e.message || e));
    }
  }
  box.textContent = out.join('\n\n');
}

async function pushTurnOn() {
  if (!pushReady()) { toast('この端末は通知に対応していません', true); return; }
  const live = Api.live();
  if (!live.length) { toast('先に受け口をつないでください', true); return; }
  try {
    S.busy = '通知の用意をしています…'; render();
    // ★許可を聞くのは、押したその場でなければいけません（決まりです）
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('通知が許可されませんでした', true); return; }

    /* ★受け口どうしで**通知の鍵をそろえます。**
     *
     *   端末の「受け取り口（購読）」は**1つの鍵にだけ**結びつきます。
     *   受け口ごとに別の鍵だと、2つ目の受け口が送った通知は
     *   送り先にはねられ、**会社のメールの通知が届きません**
     *   （2026-11-22 の指摘。そのとおりでした）。
     *   1つ目の受け口の鍵を、ほかの受け口に配ります。 */
    let key = (await Api.pushKey(live[0])).key;
    if (!key) throw new Error('受け口から通知の鍵が返りませんでした');
    let aligned = 0;
    if (live.length > 1) {
      S.busy = '通知の鍵をそろえています…'; render();
      const d = (await Api.vapidGet(live[0])).d;
      for (const src of live.slice(1)) {
        const r2 = await Api.vapidSet(src, d);
        if (r2 && r2.key && r2.key !== key) {
          throw new Error(srcName(src) + ' の鍵をそろえられませんでした');
        }
        aligned++;
      }
    }
    const reg = await pushReg();
    if (!reg || !reg.pushManager) {
      throw new Error('この画面では通知を使えません。いちど開き直してください');
    }
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(key),
      });
    }
    const ep = sub.endpoint;
    // ★受け口ぜんぶに登録します。どちらに来たメールでも知らせるためです
    const ng = [];
    for (const src of live) {
      try { await Api.pushAdd(src, ep, navigator.userAgent); }
      catch (e) { ng.push(srcName(src)); }
    }
    // ★サービスワーカーが受け口に聞けるように、住所と合言葉を写します
    await Store.set('pushSrc', live.map((src) => ({
      url: Api.url(src), pin: Api.pin(src), name: srcName(src),
    })));
    toast(ng.length
      ? ng.join('・') + ' には登録できませんでした'
      : '通知を受け取ります' + (aligned ? '（受け口' + (aligned + 1) + 'つの鍵をそろえました）' : ''),
      !!ng.length);
  } catch (e) {
    toast(String(e.message || e), true);
  } finally {
    S.busy = ''; render(); renderPush();
  }
}

async function pushTurnOff() {
  try {
    S.busy = '通知をやめています…'; render();
    const sub = await pushSub();
    if (sub) {
      for (const src of Api.live()) {
        try { await Api.pushDel(src, sub.endpoint); } catch (e) { /* 消せなくても進みます */ }
      }
      await sub.unsubscribe();
    }
    await Store.set('pushSrc', []);
    toast('通知をやめました');
  } catch (e) {
    toast(String(e.message || e), true);
  } finally {
    S.busy = ''; render(); renderPush();
  }
}

/* ============================================================
 *  合計をたまに数え直す
 *
 *  ★受け口の「読み込む範囲の合計」は、**点検したときにしか
 *    数え直していませんでした。**だから、消した・片づけた
 *    メールのぶん、合計は少しずつ実際とずれます。
 *    ずれると「◯通 足りません／多いです」が出続けます。
 *
 *  ★「点検して直す」は索引（2万8千行）を読み書きするので重く、
 *    勝手に動かすと操作の最中に固まります。
 *    **数えるだけ**の軽いほう（recount）を、半日に1回だけ動かします。
 * ========================================================== */
const RECOUNT_HOURS = 12;

async function recountSometimes() {
  if (S.demo || S.scanning || S.recounting) return;
  const live = Api.live();
  if (!live.length) return;
  let at = 0;
  try { at = Number(await Store.get('recountAt')) || 0; } catch (e) { /* はじめては0 */ }
  // ★「返信ずみ」をまだ1つも知らないときは、半日を待たずに1回だけ走ります。
  //   ふだんの新着は近い30日ぶんしか見ていないので、待たせると
  //   古いやり取りに印が出ないままになります
  if (S.replied.size && Date.now() - at < RECOUNT_HOURS * 3600 * 1000) return;
  S.recounting = 1;
  try {
    // ★先に時刻を置きます。途中で転んでも、半日は繰り返しません
    await Store.set('recountAt', Date.now());
    for (const src of live) {
      try {
        const d = await Api.recount(src);
        await addReplied(src, d.replied);     // ★古いぶんまでそろえます
        if (d.counted) S.inbox[src] = Number(d.inbox || 0);
        S.indexed[src] = Number(d.indexed || S.indexed[src] || 0);
      } catch (e) { /* つながらないときは、次の回に */ }
    }
    renderSources();
  } finally {
    S.recounting = 0;
  }
}

/* ============================================================
 *  差出人の一覧
 *
 *  ★索引には差出人が全部入っているので、**通信なしで数えられます。**
 *    どこから何通来ているかが分かると、「よく来るところだけ
 *    決まりごとを作る」という詰めかたができます。2万通を1通ずつ
 *    見るのは無理でも、送り元は数百しかありません。
 *
 *  ★ここから直接カテゴリーを割り当てられます。設定の決まりごとを
 *    手で足すより速く、間違いも少ないためです。
 * ========================================================== */

/** いま見ている箱の中で、差出人ごとに数えます */
function tallySenders() {
  const by = new Map();
  for (let i = 0; i < S.rows.length; i++) {
    const r = S.rows[i];
    if (S.folder && folderOf(r) !== S.folder) continue;
    const addr = String(r[F.FROM] || '').toLowerCase();
    if (!addr) continue;
    const key = S.seBy === 'addr' ? addr : (addr.split('@')[1] || addr);
    let v = by.get(key);
    if (!v) { v = { key, n: 0, direct: 0, via: 0, name: '', cats: new Map() }; by.set(key, v); }
    v.n++;
    const t = toMeOf(r);
    if (t === 'direct') v.direct = (v.direct || 0) + 1;
    else if (t === 'via') v.via = (v.via || 0) + 1;
    if (!v.name) v.name = String(r[F.NAME] || '');
    const c = S.cat.get(Rules.keyOf(r)) || 'other';
    v.cats.set(c, (v.cats.get(c) || 0) + 1);
  }
  const out = Array.from(by.values());
  out.forEach((v) => {
    // いちばん多いカテゴリーを、その差出人の色として出します
    let top = 'other', max = 0;
    v.cats.forEach((n, c) => { if (n > max) { max = n; top = c; } });
    v.cat = top;
    v.mixed = v.cats.size > 1;
  });
  out.sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
  return out;
}

/* ============================================================
 *  送信済み（純正アプリの「送信済み」と同じもの）
 *
 *  ★**索引（端末の中の一覧）には入れていません。**開いたときだけ
 *    受け口に聞きに行きます。送ったメールは新着の知らせも仕分けも
 *    要らず、索引に混ぜると受信トレイの通数・未読・カテゴリーが
 *    全部おかしくなるためです（2026-11-21）。
 *
 *  ★本文はいつもどおり、開いたときだけ取りに行きます。
 *    どこにも複製しません。
 * ========================================================== */

function openSent() {
  if (S.demo) { toast('見本なので使えません'); return; }
  if (!Api.live().length) { toast('先に受け口をつないでください', true); return; }
  $('#sent').hidden = false;
  document.body.classList.add('is-modal');
  // ★いま見ている箱のぶんから出します（受信と行き来しても迷いません）
  sentLoad(S.folder || '', true);
}

function closeSent() {
  $('#sent').hidden = true;
  if ($('#detail').hidden) document.body.classList.remove('is-modal');
}

/**
 * 取りに行きます。
 *   addr … 箱（自分のアドレス）。'' なら全部
 *   fresh … 始めから取り直すか
 */
async function sentLoad(addr, fresh) {
  const st = S.sent;
  if (st.loading) return;
  if (fresh) {
    st.addr = addr;
    st.rows = [];
    st.by = new Map();
    st.next = {};
    st.err = '';
    Api.live().forEach((src) => { st.next[src] = ''; });   // '' ＝ まだ1回も聞いていない
  }
  st.loading = true;
  renderSent();
  try {
    const live = Api.live().filter((src) => st.next[src] !== null);  // null ＝ もう終わり
    const got = await Promise.all(live.map(async (src) => {
      try {
        const d = await Api.sent(src, st.addr, st.next[src] || '', 30);
        st.next[src] = d.next || null;
        return (d.rows || []).map((r) => { const x = r.slice(); x[F.SRC] = src; return x; });
      } catch (e) {
        st.err = String(e.message || e);
        st.next[src] = null;
        return [];
      }
    }));
    got.forEach((rows) => rows.forEach((r) => {
      const k = Rules.keyOf(r);
      if (st.by.has(k)) return;              // 二重に出さない
      st.by.set(k, r);
      st.rows.push(r);
    }));
    st.rows.sort((a, b) => Number(b[F.DATE]) - Number(a[F.DATE]));
  } finally {
    st.loading = false;
    renderSent();
  }
}

function renderSent() {
  const st = S.sent;
  const boxes = $('#stBoxes');
  if (boxes) {
    const chip = (a, label, on) => '<button class="chip' + (on ? ' is-on' : '') + '"'
      + ' data-sbox="' + esc(a) + '">' + esc(label) + '</button>';
    boxes.innerHTML = chip('', '全部', !st.addr)
      + S.myAddrs.map((a) => chip(a, folderName(a), st.addr === a)).join('');
  }
  const note = $('#stNote');
  if (note) {
    note.textContent = st.err ? st.err
      : st.loading ? '読み込んでいます…'
      : st.rows.length ? st.rows.length.toLocaleString() + '通'
      : '送ったメールはありません';
    note.classList.toggle('bad', !!st.err);
  }
  const ul = $('#stList');
  if (ul) {
    ul.innerHTML = st.rows.length
      ? st.rows.map((r) => {
          const k = Rules.keyOf(r);
          // ★送った相手を出します。差出人はいつも自分なので、出しても分かりません
          const to = String(r[F.TO] || '').trim() || '（宛先なし）';
          return '<li class="mail" data-sent="' + esc(k) + '">'
            + '<span class="mail__dot"></span>'
            + '<div class="mail__b">'
            +   '<div class="mail__top">'
            +     '<span class="mail__from">' + esc(to) + '</span>'
            +     '<span class="mail__date">' + fmtDate(r[F.DATE]) + '</span>'
            +   '</div>'
            +   '<div class="mail__subj">' + esc(r[F.SUBJ] || '（件名なし）') + '</div>'
            +   '<div class="mail__snip">' + esc(r[F.SNIP]) + '</div>'
            + '</div></li>';
        }).join('')
      : (st.loading ? '' : '<li class="empty">ここには何もありません</li>');
  }
  const more = $('#stMore');
  if (more) {
    const left = Api.live().some((src) => st.next[src] !== null);
    more.hidden = !left || !st.rows.length;
    more.textContent = st.loading ? '読み込んでいます…' : 'もっと見る';
    more.disabled = st.loading;
  }
}

function openSenders() {
  S.seFind = '';
  S.seShow = {};
  $('#seFind').value = '';
  $('#senders').hidden = false;
  document.body.classList.add('is-modal');
  renderSenders();
}

function renderSenders() {
  const all = tallySenders();
  const q = S.seFind.trim().toLowerCase();
  const rows = q ? all.filter((v) => v.key.indexOf(q) >= 0
                                  || String(v.name).toLowerCase().indexOf(q) >= 0) : all;

  const total = rows.reduce((n, v) => n + v.n, 0);
  $('#seWhere').textContent =
    (S.folder ? folderName(S.folder) : '全受信') + ' の '
    + total.toLocaleString() + '通を、'
    + (S.seBy === 'addr' ? 'アドレス' : '送り元（ドメイン）') + 'ごとに数えました。'
    + '全部で ' + rows.length.toLocaleString() + '種類です。';

  // ★「よく来る」「ときどき」「1回だけ」に分けます。数の多い順に
  //   ずらっと並べるだけだと、どこまで手を入れれば十分なのかが
  //   分かりません。上の組を片づければ大半が済む、と見えるようにします。
  const groups = [
    { id: 'a', name: 'よく来る（10通以上）', hint: 'ここに決まりごとを作ると、いちばん効きます',
      list: rows.filter((v) => v.n >= 10) },
    { id: 'b', name: 'ときどき（2〜9通）', hint: '',
      list: rows.filter((v) => v.n >= 2 && v.n < 10) },
    { id: 'c', name: '1回だけ', hint: '一度きりの相手です。ふつうは触らなくて構いません',
      list: rows.filter((v) => v.n === 1) },
  ];

  $('#seBox').innerHTML = groups.map((g) => {
    if (!g.list.length) return '';
    const cap = S.seShow[g.id] || 50;
    const show = g.list.slice(0, cap);
    const sum = g.list.reduce((n, v) => n + v.n, 0);
    return '<div class="segrp">'
      + '<h3>' + esc(g.name) + '</h3>'
      + '<p class="segrp__n">' + g.list.length.toLocaleString() + '種類 / '
      +   sum.toLocaleString() + '通' + (g.hint ? '　' + esc(g.hint) : '') + '</p>'
      + '<div class="setbl">' + show.map(row).join('')
      + (g.list.length > cap
          ? '<button class="semore" data-more="' + g.id + '">'
            + 'あと ' + (g.list.length - cap).toLocaleString() + '種類を出す</button>'
          : '')
      + '</div></div>';
  }).join('') || '<p class="muted">ここには何もありません</p>';

  function row(v) {
    const k = CAT_BY_ID[v.cat] || CAT_BY_ID.other;
    return '<div class="serow">'
      + '<div class="serow__b">'
      +   '<div class="serow__n">' + esc(v.name || v.key) + '</div>'
      +   '<div class="serow__a">' + esc(v.key) + '</div>'
      + '</div>'
      + '<span class="serow__c">' + v.n.toLocaleString() + '通'
      +   (v.via ? '<br><span class="serow__v">まわってきた ' + v.via.toLocaleString() + '</span>' : '')
      + '</span>'
      + '<span class="tag tag--' + k.id + '">' + esc(k.name) + (v.mixed ? ' ほか' : '') + '</span>'
      + '<button class="pill" data-se="' + esc(v.key) + '">分類を決める</button>'
      + '</div>';
  }
}

/**
 * その差出人を、まとめて1つのカテゴリーに決めます。
 *
 * ★決まりごとの順番は15番にします。認証コード（10番）より後、
 *   ほかの決まりごとより先です。**自分で決めたことは、
 *   こちらが用意した決まりごとより強い**べきだからです。
 */
async function assignSender(key) {
  // ★箱を選んで見ているときは、その箱にだけ効かせます。同じ相手でも
  //   会社と個人で入れたい先が違うことがあるためです
  const box = S.folder || '';
  // その箱で使えるカテゴリーだけを出します
  const cats = box ? catsOf(box).map((id) => CAT_BY_ID[id]).filter(Boolean) : CATS;
  const names = cats.map((c, i) => (i + 1) + '. ' + c.name).join('\n');
  const ans = prompt('「' + key + '」から届くメールを、どのカテゴリーに入れますか？\n\n'
                   + names + '\n\n番号を入れてください', '');
  const i = Number(ans) - 1;
  if (!(i >= 0 && i < cats.length)) return;

  const pat = String(key).toLowerCase();
  Rules.list = Rules.list.filter(
    (r) => !(r.kind === 'from' && r.pattern === pat && r.ord === 15 && (r.box || '') === box));
  Rules.list.push({ id: 'u' + Date.now(), cat: cats[i].id, kind: 'from',
                    pattern: pat, ord: 15, box });
  Rules.list.sort((a, b) => a.ord - b.ord);
  Rules.bump();
  recategorize();
  renderSenders();
  render();

  if (S.demo || !S.main) { toast('見本なので保存しません'); return; }
  try {
    await Api.setRules(S.main, Rules.rows());
    await Store.set('rules', Rules.rows());
    toast('「' + key + '」を「' + cats[i].name + '」にしました'
      + (box ? '（' + folderName(box) + 'に届いたぶんだけ）' : ''));
  } catch (e) { toast(String(e.message || e), true); }
}

/* ============================================================
 *  設定
 * ========================================================== */

/** いま読んでいるアプリの版を出します（「今すぐ最新に」が効いたか見るため） */
function paintAppVer() {
  const el = $('#appVer');
  if (!el) return;
  const m = document.querySelector('meta[name="app-version"]');
  const v = m ? m.content.trim() : '';
  const src = (document.querySelector('script[src*="js/app.js"]') || {}).getAttribute
    ? document.querySelector('script[src*="js/app.js"]').getAttribute('src') : '';
  el.textContent = 'アプリ ' + (v || '（版の印なし）')
    + (src ? '（' + src + '）' : '');
}

function openSettings() {
  $('#settings').hidden = false;
  document.body.classList.add('is-modal');
  paintAppVer();
  const at = $('#autoTrans');
  if (at) at.checked = autoTransOn();
  renderSources();
  renderPush();
  // ★呼び名で棚が変わります。ここを黙っていると、iPhone で
  //   「会社」を別の呼び名で入れたときに、会社の棚（発注・UPSIDER…）が
  //   出ずに、原因も分からない、ということが起きます
  const note = $('#addrNote');
  if (note) {
    const names = Object.keys(BOX_CATS);
    note.innerHTML = names.length
      ? '<b>呼び名で棚が変わります。</b>呼び名を '
        + names.map((k) => '「' + esc(k) + '」').join('・')
        + ' にしたアドレスだけ、'
        + names.map((k) => catsOf(k).map((c) => (CAT_BY_ID[c] || {}).name || c).join('・')).join(' / ')
        + ' の棚になります。ほかの呼び名にすると、ふつうの棚に戻ります。'
      : '';
  }
  $('#addrIn').value = S.myAddrs
    .map((a) => (S.addrNames[a] ? a + ', ' + S.addrNames[a] : a)).join('\n');
  renderRules();
  renderTpl();
}

/**
 * 受け口のコードが最新かどうかを見せます。
 *
 * ★貼り替えたつもりで**デプロイを忘れる**ことがあります。そうすると
 *   古いものが動き続け、直したはずの不具合が直りません。実際、
 *   どの受け口がどの版なのか分からなくなりました。
 *   アプリが受け口に印を聞いて、違えばここで知らせます。
 */
function verMark(id) {
  // ★返事が無いときは、版のことは言いません。前に聞いたときの
  //   古い印が残っているだけで、いまの受け口の版は分からないためです。
  //   「返事がありません」のほうが先に立つ知らせです。
  if (S.ok[id] !== true) return '';
  const want = String(APP.gasVersion || '');
  if (!want) return '';
  const got = String(S.ver[id] || '');
  if (want === got) return '<span class="src__ver">コードは最新です</span>';
  // ★印を返してこないときも食い違いです。印を返す仕組みが入る前の
  //   コードだからです。はじめ、ここで何も出さないようにしていました。
  //   **いちばん知らせるべき場面で黙る**という、いちばんまずい作りでした。
  //
  // ★「受け口が古い」とは言いきりません。印はただの文字列で、
  //   どちらが新しいかは分かりません。実際、iPhone の公開版だけ
  //   更新し忘れていて、**古いのはアプリのほうだった**ことがあります
  //   （2026年11月3日）。両方の直しかたを出します。
  /* ★どの印どうしが違うのかを出します。出さないと、貼り替えたつもりなのに
   *   直らないとき、**どちらが古いのかも分かりません**（2026-11-23）。
   *   受け口が何も返さないときは「（印なし）」と出します。 */
  return '<span class="src__ver is-old">アプリと受け口の版が違います'
       + '（アプリ ' + esc(want) + '／受け口 ' + esc(got || '（印なし）') + '）。'
       + 'コードを貼り替えてデプロイするか、アプリを公開し直してください</span>';
}

/**
 * 索引が足りているかを、数で見せます。
 *
 * ★「読み込みました」だけでは、足りているのか分かりません。実際、
 *   2,000通足りないことにも、逆に500通多い（二重に入っていた）ことにも、
 *   Gmail を自分で数えるまで気づけませんでした。**並べて出せば一目で分かります。**
 */
function countLine(id, n) {
  const inbox = Number(S.inbox[id] || 0);
  // ★数えているのは「読み込む範囲」に当たる通数です。範囲を広げたのに
  //   「受信トレイ」と出していると、合わない理由を探せません
  const q = String(S.query[id] || 'in:inbox').trim();
  const nm = (q === 'in:inbox') ? '受信トレイ' : '読み込む範囲';
  let note = '';
  let cls = '';
  const head = '／ ' + nm + ' ' + inbox.toLocaleString() + '通　';
  if (!inbox) {
    note = S.done[id] ? '（古いぶんまで入っています）' : '（まだ途中です）';
  } else if (n < inbox) {
    // ★足りないのは困ります。探しているメールが出てこないので
    note = head + '<b>あと ' + (inbox - n).toLocaleString() + '通 足りません。'
         + '「続きを読み込む」をもう一度</b>';
    cls = ' is-warn';
  } else if (n > inbox) {
    // ★多いのは困りません。**消した・片づけたメールが索引に残っている**だけで、
    //   探すのに邪魔にはなりません。だから急かしません。
    //   以前は少しのずれでも赤字で「押してください」と出していて、
    //   ko-dai さんから「ほぼ毎回出る」と言われました（2026-11-08）。
    const over = n - inbox;
    note = head + '消した・片づけたメールが ' + over.toLocaleString() + '通 残っています'
         + '（ひまなときに「点検して直す」で消えます）';
    if (over > 100) cls = ' is-warn';
  } else {
    note = head + 'そろっています';
  }
  return '<p class="muted small' + cls + '">索引 <b>' + n.toLocaleString() + '通</b> ' + note + '</p>';
}

/**
 * 受け口の一覧。
 *
 * ★受け口ごとに合言葉も索引も別なので、まとめて1つの画面に
 *   すると「どちらの話か」が分からなくなります。箱に分けて出します。
 */
/**
 * 前の取り込みで、何が返ってきたか。
 *
 * ★届かないときに**どこで止まっているか**を見るためのものです。
 *   「手元 ◯通／受け口 ◯通／新しく ◯通／足りないぶん ◯通／増えた ◯通」。
 *   増えた数が 0 のまま新着が出ないなら、受け口が返していません。
 */
function syncLine(src) {
  const d = S.lastSync[src];
  if (!d) return '';
  const t = new Date(d.at);
  const hh = String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0')
           + ':' + String(t.getSeconds()).padStart(2, '0');
  return '<p class="muted small">前の取り込み ' + hh + (d.light ? '（軽い）' : '（ぜんぶ）')
    + '／手元 ' + Number(d.have || 0).toLocaleString() + '通'
    + '／受け口 ' + Number(d.indexed || 0).toLocaleString() + '通'
    + '／新しく ' + d.added + '通'
    + '／足りないぶん ' + d.catchUp + '通'
    + '／<b>増えた ' + (d.got === undefined ? '—' : d.got) + '通</b>'
    + (d.ms ? '／かかった <b>' + (d.ms / 1000).toFixed(1) + '秒</b>' : '')
    + '</p>';
}

/**
 * 起動にどれだけかかったか。
 *
 * ★「スマホだと遅い」を、推測ではなく数字で見るためのものです。
 *   どこで待っているかが分かれば、直す場所が決まります。
 */
function bootLine() {
  const b = S.bootMs;
  if (!b || !b.done) return '';
  const sec = (n) => (n === undefined ? '—' : (n / 1000).toFixed(1) + '秒');
  return '<p class="muted small">前の起動：'
    + '索引の読み込み <b>' + sec(b.load) + '</b>'
    + '（' + Number(b.rows || 0).toLocaleString() + '通）'
    + '／受け口の取り込み <b>' + sec(b.sync) + '</b>'
    + '／状態の確認 ' + sec(b.probe)
    + '／<b>新着が出るまで ' + sec(b.done) + '</b></p>';
}

function renderSources() {
  renderScanNote();
  const box = $('#srcBox');
  if (!box) return;
  const bl = $('#bootLine');
  if (bl) bl.innerHTML = bootLine();
  box.innerHTML = SOURCES.map((src) => {
    const id = src.id;
    // ★「つながっています」は、URL と合言葉が入っているだけでは
    //   名乗れません。**返事があったかどうか**で決めます。
    //   入っているだけで名乗らせていたので、受け口が壊れていても
    //   気づけませんでした。
    const has = Api.enabled(id);
    const set = Api.ready(id);
    const on = set && S.ok[id] === true;
    const dead = set && S.ok[id] === false;
    const n = Number(S.indexed[id] || 0);
    // ★つながっていないうちは、どのアカウントかを名乗りません。
    //   config.js の1行目を当て推量で出すと、会社の URL を貼ったときに
    //   「個人 / 個人のアドレス」と嘘を表示してしまいます
    const host = on ? (S.hosts[id] || '') : '';
    return '<div class="src" data-src="' + esc(id) + '">'
      + '<div class="src__hd"><b>' + esc(on ? srcName(id) : (SOURCES.find((x) => x.id === id) || {}).name) + '</b>'
      +   '<span class="src__st ' + (on ? 'is-on' : dead ? 'is-dead' : '') + '">'
      +     (on ? 'つながっています'
             : dead ? '返事がありません'
             : has ? '合言葉がまだ' : 'URL がまだ') + '</span>'
      // ★1回聞くのに何秒かかっているかを出します。
      //   「もっと短い間あいにできないか」は、ここの数字を見ないと決められません。
      //   受け口は全部まとめて同時に聞いているので、数字は共通です
      +   (on && S.pingMs
            ? '<span class="src__ping">応答 ' + (S.pingMs / 1000).toFixed(1) + '秒</span>'
            : '')
      +   verMark(id) + '</div>'
      + (dead ? '<p class="muted small is-warn">' + esc(S.err[id] || '')
          + '<br>Apps Script で「デプロイを管理 → 鉛筆 → 新バージョン → デプロイ」'
          + 'を試してください</p>' : '')
      + (host ? '<p class="muted small">' + esc(host) + '</p>' : '')
      + '<div class="row"><input class="src__url" autocomplete="off"'
      +   ' placeholder="ウェブアプリの URL（.../exec）" value="' + esc(Api.url(id)) + '">'
      +   '<button class="pill" data-act="url">覚える</button></div>'
      // ★合言葉らんを出すのは「まだ入れていない」ときだけ。
      //   返事が無いだけのときに出すと、合言葉が消えたように見えて、
      //   入れ直せば直るのだと思わせてしまいます（直りません）
      + (has && !set
          ? '<div class="row"><input type="password" class="src__pin" autocomplete="off"'
            + ' placeholder="合言葉（16文字以上）">'
            + '<button class="pill pill--go" data-act="pin">つなぐ</button></div>'
          : '')
      // ★合言葉を思い出せるようにします。ほかの端末（iPhone）で
      //   入れるときに要りますが、覚えているものではありません。
      //   受け口を作り直さないと分からない、では困るためです。
      //   出てくるのは、この端末に入れてあるものだけです
      + (set
          ? '<p class="muted small src__pinline">合言葉 '
            + '<code class="src__pinv" hidden>' + esc(Api.pin(id)) + '</code>'
            + '<button class="link" data-act="showpin">見る</button></p>'
          : '')
      + (on ? countLine(id, n) : '')
      + (on ? syncLine(id) : '')     // ★前の取り込みで何が返ってきたか（届かないとき用）
      + (on
          ? '<label class="lbl">読み込む範囲</label>'
            + '<div class="row"><input class="src__q" autocomplete="off"'
            +   ' value="' + esc(S.query[id] || 'in:inbox') + '">'
            +   '<button class="pill" data-act="query">覚える</button></div>'
            + '<p class="muted small">'
            +   'ふつうは <b>in:inbox</b>（受信トレイ）のままで結構です。'
            +   '転送で届くぶん（受信トレイに残らないこともあります）や、'
            +   'iCloud から写したぶんも読むなら、こうします。'
            +   (cloudReady()
                  ? '<br><b class="q">' + esc(cloudQuery(id)) + '</b>'
                    + '<button class="link" data-act="qcloud">これを入れる</button>'
                  : '<br><b class="is-warn">つながっていない受け口があるので、'
                    + '見本はまだ出せません。</b>'
                    + 'ぜんぶつないでからにしてください。'
                    + '（つながっていないアドレスを「受け口の無いアドレス」と'
                    + '取り違えて、別の受け口のぶんまで読みにいってしまうためです）')
            + '</p>'
          : '')
      + (on
          ? '<div class="row row--wrap">'
            + '<button class="pill" data-act="sync">新着を取り込む</button>'
            + '<button class="pill pill--go" data-act="scan"' + (S.scanning ? ' disabled' : '')
            + '>続きを読み込む</button>'
            + '<button class="pill" data-act="repair">点検して直す</button>'
            + '<button class="pill btn--danger" data-act="rebuild">作り直す</button>'
            + '</div>'
          : '')
      + '</div>';
  }).join('');
}

/**
 * 「受信トレイのほかに、どこを見るか」の文を組み立てます。
 *
 *  ★受信トレイ（in:inbox）だけでは足りないことがあります。
 *    転送で届いたメールに Gmail の振り分けが効いていると、
 *    **受信トレイを通らずに片づけられている**ことがあり、
 *    そうなると受け口からは見えません。実際、iCloud から転送した
 *    ぶんが1通も出ませんでした（2026年8月21日）。
 *
 *  ★足すのは「自分のアドレスなのに、受け口を置いていないもの」だけです。
 *    個人と会社はそれぞれ受け口があるので、そちらから直接読んでいます。
 *    ここに足すと同じメールを二度読みにいくことになります。
 */
/**
 * 「読み込む範囲」の見本を出してよいか。
 *
 * ★受け口を置いてあるアドレスなのに、いまつながっていないと、
 *   cloudQuery がそれを「受け口の無いアドレス」と取り違えます。
 *   その見本を入れると、たとえば個人の受け口が会社ぶんまで
 *   読みにいきます。つながっていないものがあるうちは出しません。
 */
function cloudReady() {
  return SOURCES.every((s) => Api.enabled(s.id) && S.ok[s.id] === true);
}

function cloudQuery(src) {
  const hosted = Object.keys(S.hosts).map((k) => S.hosts[k]).filter(Boolean);
  const extra = S.myAddrs.filter((a) => hosted.indexOf(a) < 0);
  let q = 'in:inbox';
  // -in:sent … 自分がそのアドレスへ送ったぶんまで拾わないように
  extra.forEach((a) => { q += ' OR (to:' + a + ' -in:sent)'; });
  return q + ' OR label:icloud-old';
}

function closeSettings() {
  $('#settings').hidden = true;
  document.body.classList.remove('is-modal');
}

function renderRules() {
  const box = $('#rulesBox');
  box.innerHTML = Rules.list.map((r, i) =>
    '<div class="rule" data-i="' + i + '">'
    + '<span class="tag tag--' + esc(r.cat) + '">' + esc((CAT_BY_ID[r.cat] || {}).name || r.cat) + '</span>'
    + '<span class="rule__k">' + esc(kindName(r.kind)) + '</span>'
    + '<span class="rule__p">' + esc(r.pattern || '（すべて）')
    +   (r.box ? '<span class="rule__b">' + esc(folderName(r.box)) + 'だけ</span>' : '')
    // ★その箱に無いカテゴリーを指していたら教えます。黙って
    //   効かないままだと「入れたのに動かない」と悩むことになります
    +   (r.box && !catInBox(r.cat, r.box)
          ? '<span class="rule__b rule__b--no">この箱では効きません</span>' : '')
    + '</span>'
    + '<span class="rule__o">' + r.ord + '</span>'
    + '<button class="x" data-del="' + i + '" title="消す">×</button>'
    + '</div>').join('') || '<p class="muted">まだありません</p>';
  const boxes = '<option value="">どの箱でも</option>'
    + S.myAddrs.map((a) => '<option value="' + esc(a) + '">' + esc(folderName(a)) + 'だけ</option>').join('');
  $('#ruleBox').innerHTML = boxes;
  renderAi();
  fillRuleCats();
  renderBuiltIn();
}

/** 決まりごとの「見かた」の呼び名 */
function kindName(kind) {
  return kind === 'from' ? '差出人'
       : kind === 'subj' ? '件名'
       : kind === 'text' ? '件名・本文'
       : '人から';
}

/**
 * 「どのカテゴリーに入れるか」の選びかたを、選んだ箱に合わせます。
 *
 * ★会社の箱を選んでいるのに「カード・決済」が選べてしまうと、
 *   入れたのに動かない決まりごとができます。選べないようにします。
 */
function fillRuleCats() {
  const box = $('#ruleBox') ? $('#ruleBox').value : '';
  const list = box ? catsOf(box).map((id) => CAT_BY_ID[id]).filter(Boolean) : CATS;
  const keep = $('#ruleCat') ? $('#ruleCat').value : '';
  $('#ruleCat').innerHTML = list
    .map((c) => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('');
  if (keep && list.some((c) => c.id === keep)) $('#ruleCat').value = keep;
}

/**
 * あらかじめ入っている決まりごとの案内。
 *
 * ★中身を全部並べると100行を超えて、自分で足したものが埋もれます。
 *   「入っている」ことと「自分で足したほうが先に効く」ことだけ伝えます。
 */
function renderBuiltIn() {
  const el = $('#builtIn');
  if (!el) return;
  // BOX_RULES の見出しは呼び名なので、登録ずみのアドレスから引き直します
  const boxes = S.myAddrs.filter((a) => BOX_RULES[folderName(a)]);
  if (!boxes.length) { el.innerHTML = ''; return; }
  el.innerHTML = boxes.map((b) => {
    const cats = catsOf(b).filter((c) => c !== 'other')
      .map((c) => (CAT_BY_ID[c] || {}).name || c).join('・');
    return '<p class="muted">' + esc(folderName(b)) + ' の箱には、'
      + BOX_RULES[folderName(b)].length + '件の決まりごとがはじめから入っています（'
      + esc(cats) + '）。ここには並べていません。<br>'
      + '仕入先や取引先は会社ごとに違うので、一覧の「差出人」から足してください。'
      + '<b>自分で足したもののほうが先に効きます。</b></p>';
  }).join('');
}

/** AI の設定の、いまの様子 */
function renderAi() {
  const u = $('#aiUrl'), st = $('#aiState');
  if (!u || !st) return;
  u.value = AI.url() ? AI.url() + '/?t=' + AI.token() : '';
  st.innerHTML = AI.ready()
    ? '<b>つながる先が入っています。</b>返信と「新しく書く」に「AIに書いてもらう」が出ます。'
      + 'Mac の Hub Board が動いているときだけ使えます。'
    : 'まだ入っていません。入れると、返信の画面に「AIに書いてもらう」が出ます。';
}

function renderTpl() {
  // ★欄の高さは中身に合わせます。4行で固定していたので、長いテンプレだと
  //   **下のほう（署名など）が隠れて**、直すのに中でスクロールが要りました
  const rowsOf = (body) => Math.min(24, Math.max(4, String(body || '').split('\n').length + 1));
  $('#tplBox').innerHTML = S.tpl.map((t, i) =>
    '<div class="tplrow"><input class="tplname" data-i="' + i + '" value="' + esc(t[1]) + '">'
    + '<textarea class="tplbody" data-i="' + i + '" rows="' + rowsOf(t[2]) + '">'
    + esc(t[2]) + '</textarea>'
    + '<button class="x" data-tdel="' + i + '" title="消す">×</button></div>').join('')
    || '<p class="muted">まだありません</p>';
}

async function saveRules() {
  if (S.demo || !S.main) { toast('見本なので保存しません'); return; }
  try {
    await Api.setRules(S.main, Rules.rows());
    recategorize(); render();
    toast('決まりごとを保存しました');
  } catch (e) { toast(String(e.message || e), true); }
}

async function saveTpl() {
  $$('.tplname').forEach((el) => { S.tpl[Number(el.dataset.i)][1] = el.value; });
  $$('.tplbody').forEach((el) => { S.tpl[Number(el.dataset.i)][2] = el.value; });
  if (S.demo || !S.main) { toast('見本なので保存しません'); return; }
  try {
    await Api.setTpl(S.main, S.tpl);
    toast('テンプレを保存しました');
  } catch (e) { toast(String(e.message || e), true); }
}

/* ============================================================
 *  はじまり
 * ========================================================== */

async function boot() {
  try {
    const g = localStorage.getItem(APP.storageKey + ':group');
    if (g !== null) S.group = (g === '1');
  } catch (e) { /* 使えない置きかたもあります */ }
  bindEvents();
  bindEdgeBack();
  bindSwipe();
  startWatch();
  // ★通知を押して戻ってきたときは、待たずに取り込みます（sw.js から合図が来ます）
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'push-open') syncNew(true);
    });
  }
  Updater.start();
  loadAddrs();
  /* ★つながっているうちに「自分のこと」を**端末に写して**おきます。
   *   Mac が切れているときの「Claude アプリに渡す」で使うためです。
   *   取れなくても何もしません（2026-11-21）。 */
  if (AI.ready() && !S.demo) AI.profile().catch(() => {});

  const live = Api.live();
  if (!live.length) {
    // つなげる受け口がない → 見本で動かします
    S.demo = true;
    S.rows = DEMO.slice();
    Rules.set(DEMO_RULES);
    S.tpl = [
      ['t1', '受け取りました', '{name} 様\n\nご連絡ありがとうございます。内容を確認いたしました。', 1],
      ['t2', '折り返します', '{name} 様\n\n只今立て込んでおり、改めてご連絡いたします。', 2],
    ];
    S.hosts = { me: MY_ADDRS[0].addr };
    recategorize();
    $('#demoBar').hidden = false;
    render();
    return;
  }

  // 決まりごととテンプレは1か所にまとめて置きます。
  // ★受け口ごとに別々にすると、会社で足したルールが個人に効かず、
  //   同じものを二度直すことになります
  S.main = live[0];

  /* ★**受け口に聞くのを、いちばん先に始めます。**
   *
   *   前は「端末の索引を全部読む → それから通信」の順でした。
   *   5万3千通ぶんを読むのに時間がかかるので、**通知から開いたとき**に
   *   新着が出るまで待たされていました（2026-11-22、ko-dai さんの
   *   「通知は来たのに、一覧になかなか出てこない」）。
   *   通信と読み込みは関わりがないので、同時に走らせます。
   * ★「いま何通持っているか」は、別に覚えてある数をそのまま使います
   *   （索引を読み終わるのを待たなくてよいように）。 */
  const haveSaved = {};
  try {
    const c = await Store.get('count');
    if (c && typeof c === 'object') Object.assign(haveSaved, c);
    // ★「索引を何行目まで読んだか」のほうが確かです（手元の通数は重複を消したぶん少ない）
    const cs = await Store.get('consumed');
    if (cs && typeof cs === 'object') {
      S.consumed = cs;
      Object.keys(cs).forEach((k) => {
        if (Number(cs[k] || 0) > Number(haveSaved[k] || 0)) haveSaved[k] = Number(cs[k]);
      });
    }
  } catch (e) { /* はじめてなら、ありません */ }
  const bootT0 = Date.now();
  S.bootMs = { at: bootT0 };
  const syncEarly = Promise.all(live.map((src) =>
    Api.sync(src, false, haveSaved[src]).then((d) => ({ src, d })).catch((e) => ({ src, e }))))
    .then((r) => { S.bootMs.sync = Date.now() - bootT0; return r; });
  // 受け口の状態も、同じく先に聞いておきます（索引の読み込みと同時に進みます）
  const probeEarly = Promise.all(live.map((src) =>
    Api.probe(src, undefined, src === S.main)
      .then((p) => ({ src, p }))
      .catch((e) => ({ src, e }))))
    .then((r) => { S.bootMs.probe = Date.now() - bootT0; return r; });

  // 端末にためてあるぶんを先に出します。通信を待たせないためです
  S.busy = '読み込んでいます…'; render();
  try {
    S.rows = await Store.loadAll();
    S.bootMs.load = Date.now() - bootT0;
    S.bootMs.rows = S.rows.length;
    const fmt = await Store.get('fmt');
    if (fmt !== Store.FMT) {
      const n = fixRows(S.rows);
      if (n) await Store.saveAll(S.rows);
      await Store.set('fmt', Store.FMT);
      if (n) console.info('Mail Board: 古い形の行を ' + n + '件 直しました');
    }
    const r = await Store.get('rules');
    const o = await Store.get('over');
    const t = await Store.get('tpl');
    const h = await Store.get('hosts');
    const st = await Store.get('star');
    const rp = await Store.get('replied');
    if (h) S.hosts = h;
    if (Array.isArray(st)) S.star = new Set(st);
    if (Array.isArray(rp)) S.replied = new Set(rp);
    if (r) Rules.set(r);
    if (o) Rules.setOver(o);
    if (t) S.tpl = t;
    recategorize();
    render();
  } catch (e) { /* はじめてなら空です */ }

  /* そのあとで、受け口に聞きに行きます。
   *
   * ★**まとめて同時に聞きます。**前は1つずつ順番に待っていたので、
   *   起動のたびに受け口との往復が**9回も直列**に並んでいました
   *   （probe×2 → 決まりごと → 上書き → テンプレ → sync×2 → peek×2）。
   *   1往復が1〜3秒かかるので、「つないでいます…」が15秒以上出たままでした
   *   （2026-11-18、ko-dai さんの「出ている時間が長い」）。
   *   いまは 3回 まで減っています。
   */
  try {
    S.busy = 'つないでいます…'; render();
    const aliases = [];
    // ★**取り込みも、同じタイミングで頼んでおきます。**
    //   受け口に聞き終わってから頼むと、往復が2回ぶん並びます。
    //   Apps Script は眠っていると返事に数秒かかるので、そこが効きます
    // ★いちばんの受け口だけ full で聞きます。決まりごと・上書き・テンプレが
    //   一緒に返ってくるので、そのぶんの3往復が消えます
    // ★状態も**いちばん先に**聞いてあります（上の probeEarly）。
    //   索引の読み込みと同時に進むので、通知から開いたときが速くなります
    const probes = await probeEarly;

    let main = null;
    for (const { src, p, e } of probes) {
      if (e || !p) {
        S.ok[src] = false;
        S.err[src] = String((e && e.message) || e || '返事がありません');
        continue;
      }
      if (src === S.main) main = p;
      // ★集めた先は思い込みで決めず、受け口に聞きます。
      //   ここを取り違えると転送ぶんの振り分けが狂います
      if (p.me) S.hosts[src] = String(p.me).toLowerCase();
      S.indexed[src] = Number(p.indexed || 0);
      S.inbox[src] = Number(p.inbox || 0);
      S.query[src] = String(p.query || 'in:inbox');
      S.ver[src] = String(p.version || '');
      S.done[src] = !!p.backfillDone;
      S.ok[src] = true;
      S.err[src] = '';
      (p.aliases || []).forEach((a) => {
        if (!a) return;
        if (aliases.indexOf(a) < 0) aliases.push(a);
        // ★どの受け口のものかを覚えます。会社のアドレスから送るのに
        //   個人の受け口へ頼んでも、向こうは知らない差出人として断ります
        if (!S.aliasSrc[a]) S.aliasSrc[a] = src;
      });
    }
    if (live.every((src) => !S.ok[src])) {
      throw new Error(S.err[live[0]] || 'どの受け口からも返事がありません');
    }
    S.aliases = aliases;
    await Store.set('hosts', S.hosts);

    // ★古い受け口は full を知らないので、そのときだけ今までどおり別に聞きます
    let rr = main && main.rules, oo = main && main.over, tt = main && main.tpl;
    if (!rr || !oo || !tt) {
      const [a, b, c] = await Promise.all([
        Api.rules(S.main), Api.over(S.main), Api.tpl(S.main)]);
      rr = a.rows; oo = b.rows; tt = c.rows;
    }
    Rules.set(rr); Rules.setOver(oo); S.tpl = tt;
    await Store.set('rules', rr);
    await Store.set('over', oo);
    await Store.set('tpl', tt);
    recategorize();
    render();

    // まだ手元に無い受け口があれば、まとめて受け取ります
    for (const src of live) {
      const have = S.rows.some((x) => String(x[F.SRC]) === src);
      if (have || !S.indexed[src]) continue;
      S.busy = srcName(src) + 'の索引を受け取っています…'; render();
      const rows = await pullAll(src, (n, t2) => {
        S.busy = srcName(src) + 'の索引を受け取っています… '
               + n.toLocaleString() + ' / ' + t2.toLocaleString();
        $('#busy').textContent = S.busy;
      });
      mergeRows(rows, src);
      await Store.saveAll(S.rows);
      render();
    }

  } catch (e) {
    toast(String(e.message || e), true);
  }

  /* ★**新着の取り込みは、上で何があっても必ず行います。**
   *
   *   前はこれを上の try の**いちばん最後**に置いていました。そのため
   *   受け口の状態確認・決まりごとの読み込み・索引の受け取りが
   *   **1回でも転ぶと、先に頼んであった新着が丸ごと捨てられて**いました。
   *   受け口が眠っていると、同時に出した頼みの片方だけ転ぶことがあります
   *   （2026-11-22、ko-dai さんの「起動時に新着が読み込まれるように」）。
   *
   *   取り込みは**いちばん先に頼んであります**（syncEarly）。返事はもう
   *   手元にあるので、ほかが転んでも渡せます。 */
  try {
    await syncNew(true, await syncEarly);
  } catch (e) {
    toast(String(e.message || e), true);
  }
  S.bootMs.done = Date.now() - bootT0;     // ★新着が画面に出るまで
  renderScanNote();
  S.busy = ''; render();
}

/* ============================================================
 *  押したときの動き
 * ========================================================== */

/**
 * 押したときの動きを結びます。
 *
 * ★直接 addEventListener を呼ばず、ここを通します。画面に1つでも
 *   足りない部品があると、そこで止まって**それ以降が全部結ばれず、
 *   アプリが丸ごと動かなくなる**ためです（実際、ボタンを1つ
 *   入れ忘れただけで真っ白になりました）。
 *   足りないときは記録に残して、ほかは動かします。
 */
function on(sel, ev, fn) {
  const el = $(sel);
  if (!el) { console.warn('Mail Board: 画面に ' + sel + ' がありません'); return; }
  el.addEventListener(ev, fn);
}

function bindEvents() {
  on('#folders', 'click', (e) => {
    const b = e.target.closest('[data-folder]'); if (!b) return;
    S.folder = b.dataset.folder; S.shown = APP.pageSize; S.sel.clear();
    // ★箱によってカテゴリーが違います。会社の箱に「カード・決済」は
    //   無いので、選んだまま移ると空っぽの画面になります。戻します
    if (S.catId && S.folder && !catInBox(S.catId, S.folder)) S.catId = '';
    render();
  });

  on('#cats', 'click', (e) => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    S.catId = b.dataset.cat; S.shown = APP.pageSize; S.sel.clear(); render();
    $('#main').classList.remove('show-cats');
  });

  on('#list', 'click', (e) => {
    const li = e.target.closest('.mail'); if (!li) return;
    // なぞり終わりの余韻で本文が開かないように
    if (Date.now() - (S.swiped || 0) < 500) return;
    const id = li.dataset.id;
    if (S.picking) {
      // ★まとめた行を選んだら、その中のぜんぶを選びます。いちばん新しい
      //   1通だけ既読にしても、行は未読のままで「押したのに消えない」
      //   ように見えるためです
      const keys = String(li.dataset.keys || id).split(' ').filter(Boolean);
      const on = keys.every((k) => S.sel.has(k));
      keys.forEach((k) => { if (on) S.sel.delete(k); else S.sel.add(k); });
      render();
    } else {
      openMail(id);
    }
  });

  on('#more', 'click', () => { S.shown += APP.pageSize * 4; render(); });

  on('#q', 'input', (e) => {
    S.q = e.target.value; S.shown = APP.pageSize; render();
  });

  on('#unreadBtn', 'click', () => {
    S.unreadOnly = !S.unreadOnly;
    $('#unreadBtn').classList.toggle('is-on', S.unreadOnly);
    S.shown = APP.pageSize; render();
  });

  on('#pickBtn', 'click', () => {
    S.picking = !S.picking;
    if (!S.picking) S.sel.clear();
    $('#pickBtn').classList.toggle('is-on', S.picking);
    render();
  });

  on('#groupBtn', 'click', () => {
    S.group = !S.group;
    try { localStorage.setItem(APP.storageKey + ':group', S.group ? '1' : '0'); } catch (e) { /* 使えない置きかたもあります */ }
    S.shown = APP.pageSize; S.sel.clear(); render();
  });

  on('#readAllBtn', 'click', () => {
    S.sel.clear();
    filtered().forEach((r) => { if (r[F.UNREAD]) S.sel.add(Rules.keyOf(r)); });
    // markSelected が20通を超えるときだけ確かめます
    markSelected(true);
  });

  on('#selAll', 'click', () => {
    const rows = filtered();
    if (S.sel.size >= rows.length) S.sel.clear();
    else rows.forEach((r) => S.sel.add(Rules.keyOf(r)));
    render();
  });
  on('#selUnread', 'click', () => {
    S.sel.clear();
    filtered().forEach((r) => { if (r[F.UNREAD]) S.sel.add(Rules.keyOf(r)); });
    render();
  });
  on('#doRead', 'click', () => markSelected(true));
  on('#doUnread', 'click', () => markSelected(false));
  on('#pickDone', 'click', () => {
    S.picking = false; S.sel.clear();
    $('#pickBtn').classList.remove('is-on'); render();
  });

  on('#catsBtn', 'click', () => $('#main').classList.toggle('show-cats'));

  on('#sentBtn', 'click', openSent);
  on('#stClose', 'click', closeSent);
  on('#stReload', 'click', () => sentLoad(S.sent.addr, true));
  on('#stBoxes', 'click', (e) => {
    const b = e.target.closest('[data-sbox]');
    if (b) sentLoad(b.dataset.sbox, true);
  });
  on('#stMore', 'click', () => sentLoad(S.sent.addr, false));
  on('#stList', 'click', (e) => {
    const li = e.target.closest('[data-sent]');
    if (li) openMail(li.dataset.sent);
  });

  on('#sendersBtn', 'click', openSenders);
  on('#seClose', 'click', () => {
    $('#senders').hidden = true;
    document.body.classList.remove('is-modal');
  });
  on('#seFind', 'input', (e) => { S.seFind = e.target.value; S.seShow = {}; renderSenders(); });
  on('#seDomain', 'click', () => {
    S.seBy = 'domain'; S.seShow = {};
    $('#seDomain').classList.add('is-on'); $('#seAddr').classList.remove('is-on');
    renderSenders();
  });
  on('#seAddr', 'click', () => {
    S.seBy = 'addr'; S.seShow = {};
    $('#seAddr').classList.add('is-on'); $('#seDomain').classList.remove('is-on');
    renderSenders();
  });
  on('#seBox', 'click', (e) => {
    const more = e.target.closest('[data-more]');
    if (more) { S.seShow[more.dataset.more] = (S.seShow[more.dataset.more] || 50) + 200;
                renderSenders(); return; }
    const b = e.target.closest('[data-se]');
    if (b) assignSender(b.dataset.se);
  });

  /* --- 本文 --- */
  on('#dThread', 'click', (e) => {
    const b = e.target.closest('[data-mate]'); if (!b) return;
    if (b.dataset.mate !== S.openKey) openMail(b.dataset.mate);
  });

  on('#unsubBtn', 'click', unsubscribe);

  on('#aiSave', 'click', () => {
    const r = AI.remember($('#aiUrl').value);
    if (!r.ok) { toast(r.why, true); return; }
    renderAi();
    toast(r.empty ? '消しました' : '覚えました');
  });

  on('#aiProfLoad', 'click', async () => {
    if (!AI.ready()) { toast('先に上の欄を入れてください', true); return; }
    try { $('#aiProfile').value = await AI.profile(); toast('読み込みました'); }
    catch (e) { toast(String(e.message || e), true); }
  });

  on('#aiProfSave', 'click', async () => {
    if (!AI.ready()) { toast('先に上の欄を入れてください', true); return; }
    try { await AI.saveProfile($('#aiProfile').value); toast('保存しました'); }
    catch (e) { toast(String(e.message || e), true); }
  });

  // つないでいないときは、設定へ案内します
  on('#rAiHand', 'click', () => aiHandoff('reply'));
  on('#cAiHand', 'click', () => aiHandoff('new'));
  on('#rAiSet', 'click', () => { $('#reply').hidden = true; openSettings(); aiJump(); });
  on('#cAiSet', 'click', () => { $('#compose').hidden = true; openSettings(); aiJump(); });
  on('#rAiGo', 'click', () => aiWrite('reply'));
  on('#cAiGo', 'click', () => aiWrite('new'));

  on('#newBtn', 'click', openCompose);
  on('#cClose', 'click', closeCompose);
  on('#cSend', 'click', () => sendNew(false));
  on('#cDraft', 'click', () => sendNew(true));
  on('#cTpl', 'click', (e) => {
    const b = e.target.closest('[data-ctpl]'); if (!b) return;
    useTemplateCompose(Number(b.dataset.ctpl));
  });

  on('#dClose', 'click', closeDetail);
  on('#imgBtn', 'click', () => { S.images = true; paintBody(); });
  on('#replyBtn', 'click', openReply);
  on('#dUnread', 'click', async () => {
    const key = S.openKey; closeDetail();
    S.sel = new Set([key]); await markSelected(false); S.sel.clear(); render();
  });
  on('#moveBtn', 'click', moveCategory);
  on('#starBtn', 'click', async () => {
    const key = S.openKey; if (!key) return;
    await markStar([key], !S.star.has(key));
    paintStarBtn();
  });

  on('#toMeBtn', 'click', () => {
    // ★ボタンを2つ足すと iPhone の幅に入りません。1つで回します。
    //   いまどれなのかは、ボタンの文字そのものに出します
    S.toMe = S.toMe === '' ? 'direct' : S.toMe === 'direct' ? 'via' : '';
    const b = $('#toMeBtn');
    b.textContent = S.toMe === 'direct' ? '自分あて'
                  : S.toMe === 'via' ? 'まわってきた' : '宛先';
    b.classList.toggle('is-on', !!S.toMe);
    S.shown = APP.pageSize; render();
  });

  on('#flagBtn', 'click', () => {
    S.starOnly = !S.starOnly;
    $('#flagBtn').classList.toggle('is-on', S.starOnly);
    S.shown = APP.pageSize; render();
  });

  on('#doFlag', 'click', () => markStar(Array.from(S.sel), true));
  on('#unFlag', 'click', () => markStar(Array.from(S.sel), false));

  /* --- 返信 --- */
  on('#rTpl', 'click', (e) => {
    const b = e.target.closest('[data-tpl]'); if (!b) return;
    useTemplate(Number(b.dataset.tpl));
  });
  on('#rSend', 'click', () => sendReply(false));
  on('#rDraft', 'click', () => sendReply(true));
  on('#rClose', 'click', () => { $('#reply').hidden = true; });

  /* --- 設定 --- */
  on('#gear', 'click', openSettings);
  on('#sClose', 'click', closeSettings);
  on('#demoSet', 'click', openSettings);

  // 受け口の箱の中のボタンは、まとめて受けます。
  // 受け口は増えたり減ったりするので、1つずつ結ばないほうが安全です
  on('#srcBox', 'click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const box = b.closest('.src'); if (!box) return;
    const src = box.dataset.src;

    if (b.dataset.act === 'url') {
      const v = $('.src__url', box).value.trim();
      if (v && !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(v)) {
        toast('Apps Script の .../exec で終わる URL を入れてください', true);
        return;
      }
      Api.setUrl(src, v);
      renderSources();
      toast(v ? 'URL を覚えました' : 'URL を消しました');
      return;
    }
    if (b.dataset.act === 'pin') {
      const pin = $('.src__pin', box).value.trim();
      if (pin.length < 16) { toast('合言葉は16文字以上にしてください', true); return; }
      try {
        S.busy = '確かめています…'; render();
        await Api.probe(src, pin);
        Api.setPin(src, pin);
        toast('つながりました。読み込み直します');
        setTimeout(() => location.reload(), 700);
      } catch (err) { toast(String(err.message || err), true); }
      finally { S.busy = ''; render(); }
      return;
    }
    if (b.dataset.act === 'showpin') {
      const v = $('.src__pinv', box);
      if (!v) return;
      v.hidden = !v.hidden;
      b.textContent = v.hidden ? '見る' : '隠す';
      return;
    }
    if (b.dataset.act === 'sync') { syncNew(false); return; }
    if (b.dataset.act === 'scan') { scanLoop(src); return; }
    if (b.dataset.act === 'qcloud') {
      $('.src__q', box).value = cloudQuery(src);
      return;
    }
    if (b.dataset.act === 'query') {
      const q = $('.src__q', box).value.trim();
      if (!q) { toast('からにはできません', true); return; }
      if (q === (S.query[src] || '')) { toast('もう同じです'); return; }
      if (!confirm('読み込む範囲を変えます。\n\n' + q + '\n\n'
                 + 'このあと「続きを読み込む」を押すと、増えたぶんが入ります。'
                 + 'すでに入っているものはそのままです。')) return;
      try {
        S.busy = '変えています…'; render();
        const d = await Api.setQuery(src, q);
        S.query[src] = d.query;
        S.done[src] = false;
        S.inbox[src] = 0;
        renderSources();
        toast('変えました。「続きを読み込む」を押してください');
      } catch (err) { toast(String(err.message || err), true); }
      finally { S.busy = ''; render(); }
      return;
    }
    if (b.dataset.act === 'repair') {
      try {
        S.busy = '点検しています…'; render();
        const d = await Api.repair(src);
        S.indexed[src] = Number(d.after || 0);
        S.inbox[src] = Number(d.inbox || 0);
        // 端末に持っているぶんも、その受け口だけ取り直します
        S.rows = S.rows.filter((r) => String(r[F.SRC]) !== src);
        mergeRows(await pullAll(src), src);
        await Store.saveAll(S.rows);
        render(); renderSources();
        await syncNew(true);          // ★未読の印をそろえ直します（上と同じ理由）
        // ★「足りない」しか見ていませんでした。多いときまで
        //   「そろっています」と言ってしまい、上の赤い字と
        //   食い違って、押しても直らないように見えました
        const left = Number(d.inbox || 0) - Number(d.after || 0);
        const消した = Number(d.removed || 0) + Number(d.gone || 0);
        toast('二重や、範囲から出ていたものを ' + 消した.toLocaleString() + '通 消しました。'
          + '索引 ' + Number(d.after || 0).toLocaleString() + '通'
          + (left > 0 ? '／あと ' + left.toLocaleString() + '通 足りません。「続きを読み込む」を'
             : left < 0 ? '／範囲より ' + (-left).toLocaleString() + '通 多いままです'
             : '／そろっています'));
      } catch (err) { toast(String(err.message || err), true); }
      finally { S.busy = ''; render(); }
      return;
    }
    if (b.dataset.act === 'rebuild') {
      if (!confirm(srcName(src) + 'の索引を作り直します。\nメールは消えません。'
                 + '読み込みに時間がかかります。よろしいですか？')) return;
      try {
        await Api.rebuild(src);
        S.rows = S.rows.filter((r) => String(r[F.SRC]) !== src);
        S.indexed[src] = 0; S.done[src] = false;
        await Store.saveAll(S.rows);
        recategorize(); render(); renderSources();
        toast('作り直しました。「続きを読み込む」を押してください');
      } catch (err) { toast(String(err.message || err), true); }
    }
  });

  on('#addrSave', 'click', () => {
    saveAddrs($('#addrIn').value);
    S.folder = ''; render();
    toast('アドレスを覚えました');
  });

  on('#ruleBox', 'change', fillRuleCats);

  on('#ruleAdd', 'click', () => {
    const pat = $('#rulePat').value.trim();
    const kind = $('#ruleKind').value;
    if (kind !== 'human' && !pat) { toast('文字を入れてください', true); return; }
    Rules.list.push({
      id: 'u' + Date.now(), cat: $('#ruleCat').value, kind,
      pattern: pat.toLowerCase(), ord: Number($('#ruleOrd').value) || 5,
      box: $('#ruleBox').value,
    });
    Rules.list.sort((a, b) => a.ord - b.ord);
    Rules.bump();
    $('#rulePat').value = '';
    renderRules(); recategorize(); render();
  });

  on('#rulesBox', 'click', (e) => {
    const b = e.target.closest('[data-del]'); if (!b) return;
    Rules.list.splice(Number(b.dataset.del), 1);
    Rules.bump();
    renderRules(); recategorize(); render();
  });

  on('#rulesSave', 'click', saveRules);

  on('#tplAdd', 'click', () => {
    S.tpl.push(['u' + Date.now(), '新しいテンプレ', '', S.tpl.length + 1]);
    renderTpl();
  });
  // ---- テンプレの穴うめ ----
  on('#fillClose', 'click', closeFill);
  on('#fillGo', 'click', () => {
    const where = S.fill.where;
    fillInsert(fillBuild(), where);
    closeFill();
  });
  on('#fillRaw', 'click', () => {
    const where = S.fill.where;
    fillInsert(String(S.tpl[S.fill.i][2] || ''), where);
    closeFill();
  });
  // 滞在の「こうなります」を、いじるたびに出し直します
  on('#fillBox', 'input', fillPreview);
  on('#fillBox', 'change', (e) => {
    fillPreview();
    // 窓口で「自分で打つ」を選んだら、打つらんを出します
    const sel = e.target.closest('select[data-n]');
    if (!sel) return;
    const other = $('#f' + sel.dataset.n + 'o');
    if (other) other.hidden = sel.value !== FILL_OWN;
  });

  on('#transBtn', 'click', toggleTrans);
  on('#autoTrans', 'change', (e) => setAutoTrans(e.target.checked));
  on('#pushAgain', 'click', pushTurnOn);
  on('#pushLog', 'click', showPushLog);
  on('#pushOn', 'click', pushTurnOn);
  on('#pushOff', 'click', pushTurnOff);

  // ★上の帯の「更新」。いちばん押すものなので、設定をひらかずに押せます
  on('#syncBtn', 'click', async () => {
    if (S.demo) { toast('見本なので取り込めません'); return; }
    if (!Api.live().length) { toast('先に受け口をつないでください', true); return; }
    if (S.scanning) { toast('いま古いメールを読み込んでいます'); return; }
    if (S.syncing) return;                 // 二度押し防止
    S.syncing = 1;
    $('#syncBtn').classList.add('is-spin');
    try { await syncNew(false); }
    finally { S.syncing = 0; $('#syncBtn').classList.remove('is-spin'); }
  });
  // ★「続きを読み込む」。索引がそろっていないときだけ、一覧の上に出ます
  on('#scanBtn', 'click', () => {
    const left = Api.live().filter((src) => !S.done[src]);
    if (!left.length) { toast('もうそろっています'); return; }
    scanLoop(left[0]);
  });
  on('#tplBox', 'click', (e) => {
    const b = e.target.closest('[data-tdel]'); if (!b) return;
    S.tpl.splice(Number(b.dataset.tdel), 1);
    renderTpl();
  });
  on('#tplSave', 'click', saveTpl);

  on('#freshBtn', 'click', () => Updater.force());

  on('#themeBtn', 'click', () => {
    const cur = document.documentElement.dataset.theme;
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem(APP.storageKey + ':theme', next);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#reply').hidden) { $('#reply').hidden = true; return; }
    if (!$('#compose').hidden) { closeCompose(); return; }
    if (!$('#senders').hidden) {
      $('#senders').hidden = true; document.body.classList.remove('is-modal'); return;
    }
    if (!$('#detail').hidden) { closeDetail(); return; }
    if (!$('#settings').hidden) closeSettings();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !S.demo) syncNew(true);
  });
}

/**
 * この1通だけ、別のカテゴリーへ移します。
 *
 * ★決まりごとを直すのとは分けています。「この差出人はいつも
 *   お知らせだが、この1通だけは請求だった」ということがあるためです。
 *   決まりごとを直すと過去のぶんも動いてしまいます。
 */
async function moveCategory() {
  const key = S.openKey; if (!key) return;
  const cur = S.cat.get(key);
  // ★その1通が入っている箱で使えるカテゴリーだけを出します。
  //   会社のメールを「カード・決済」へ移せても、会社の箱には
  //   その棚が無いので、行き先が消えてしまいます
  const row = S.rows.find((x) => Rules.keyOf(x) === key);
  const cats = row ? catsOf(folderOf(row)).map((id) => CAT_BY_ID[id]).filter(Boolean) : CATS;
  const names = cats.map((c, i) => (i + 1) + '. ' + c.name).join('\n');
  const ans = prompt('どのカテゴリーへ移しますか？\n\n' + names + '\n\n番号を入れてください', '');
  const i = Number(ans) - 1;
  if (!(i >= 0 && i < cats.length)) return;
  if (cats[i].id === cur) return;
  Rules.over[key] = cats[i].id;
  recategorize();
  if (!S.demo && S.main) {
    try {
      await Api.setOver(S.main, Rules.overRows());
      await Store.set('over', Rules.overRows());
    } catch (e) { toast(String(e.message || e), true); }
  }
  closeDetail(); render();
  toast('「' + cats[i].name + '」へ移しました');
}

boot();
