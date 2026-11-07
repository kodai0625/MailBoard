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
  recounting: 0,      // いま合計を数え直している最中か
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
  return null;
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
  $('#app').dataset.busy = S.busy ? '1' : '';
  $('#busy').textContent = S.busy;
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
  try {
    S.busy = verb + 'にしています…'; render();
    for (const src of Object.keys(bySrc)) await Api.read(src, bySrc[src], read);
    applyRead(keys, read);
    await Store.saveAll(S.rows);
    S.sel.clear();
    toast(keys.length.toLocaleString() + '通を' + verb + 'にしました');
  } catch (e) {
    toast(String(e.message || e), true);
  } finally {
    S.busy = ''; render();
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
    for (const src of Object.keys(bySrc)) await Api.star(src, bySrc[src], on);
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
  const src = String(row[F.SRC] || '');
  const id = String(row[F.ID]);

  const k = CAT_BY_ID[S.cat.get(key)] || CAT_BY_ID.other;
  const why = Rules.of(row).why;

  $('#dSubj').textContent = row[F.SUBJ] || '（件名なし）';
  $('#dFrom').textContent = (row[F.NAME] || '') + ' <' + row[F.FROM] + '>';
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
    paintBody();
  } else {
    $('#dBody').srcdoc = wrapBody('<p style="color:#888">読み込んでいます…</p>', false);
  }
  try {
    if (!had) {
      const d = await Api.body(src, id);
      bodyPut(key, d);
      S._body = d;
      paintBody();
    }
    prefetchNext(key);
    if (row[F.UNREAD]) {
      // 開いたら既読。Gmail 側と食い違わないよう索引も直します
      applyRead([key], true);
      Api.read(src, [id], true).catch(() => {});
      Store.saveAll(S.rows);
      render();
    }
  } catch (e) {
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
  $('#dBody').srcdoc = wrapBody(d.html || ('<pre>' + esc(d.text || '') + '</pre>'), S.images);
  $('#imgBtn').hidden = S.images;
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
function wrapBody(html, images) {
  const csp = images
    ? "default-src 'none'; style-src 'unsafe-inline'; img-src https: data: cid:;"
    : "default-src 'none'; style-src 'unsafe-inline'; img-src data:;";
  return '<!doctype html><html><head><meta charset="utf-8">'
    + '<meta http-equiv="Content-Security-Policy" content="' + csp + '">'
    // ★リンクは新しいタブへ。指定しないと、この枠の中で
    //   広告のページが開いてしまい、メールに戻れなくなります
    + '<base target="_blank">'
    + '<style>'
    + 'html,body{margin:0;padding:14px;font:15px/1.7 -apple-system,BlinkMacSystemFont,'
    + '"Hiragino Sans","Yu Gothic",sans-serif;color:#1a1d1a;background:#fff;'
    + 'word-break:break-word;overflow-wrap:anywhere;}'
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
  if (S.aliases.length > 1) {
    from.innerHTML = S.aliases.map((a) => '<option value="' + esc(a) + '"'
      + (a === box ? ' selected' : '') + '>' + esc(a) + '</option>').join('');
    $('#rFromWrap').hidden = false;
  } else {
    $('#rFromWrap').hidden = true;
  }
  $('#rText').value = '';
  const ar = $('#rAiRow');
  if (ar) { ar.hidden = S.demo || !AI.ready(); $('#rAiNote').value = ''; }
  $('#rTpl').innerHTML = S.tpl.length
    ? S.tpl.map((t, i) => '<button class="tplchip" data-tpl="' + i + '">' + esc(t[1]) + '</button>').join('')
    : '<span class="muted">テンプレはまだありません。設定から足せます</span>';
  $('#rTpl').dataset.name = name;
  $('#reply').hidden = false;
  $('#rText').focus();
}

function useTemplate(i) {
  const t = S.tpl[i];
  if (!t) return;
  const name = $('#rTpl').dataset.name || '';
  const cur = $('#rText').value;
  const body = String(t[2] || '').replace(/\{name\}/g, name);
  $('#rText').value = cur ? cur + '\n\n' + body : body;
  $('#rText').focus();
}

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
  if (S.aliases.length > 1) {
    from.innerHTML = S.aliases
      .map((a) => '<option value="' + esc(a) + '">' + esc(a) + '</option>').join('');
    $('#cFromWrap').hidden = false;
  } else {
    $('#cFromWrap').hidden = true;
  }

  const car = $('#cAiRow');
  if (car) { car.hidden = !AI.ready(); $('#cAiNote').value = ''; }
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
function useTemplateCompose(i) {
  const t = S.tpl[i];
  if (!t) return;
  const cur = $('#cText').value;
  const body = String(t[2] || '');
  $('#cText').value = cur ? cur + '\n\n' + body : body;
  $('#cText').focus();
}

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
async function aiWrite(where) {
  const isNew = (where === 'new');
  const noteEl = $(isNew ? '#cAiNote' : '#rAiNote');
  const textEl = $(isNew ? '#cText' : '#rText');
  const btn = $(isNew ? '#cAiGo' : '#rAiGo');
  if (!noteEl || !textEl || !btn) return;

  let m;
  if (isNew) {
    m = {
      mode: 'new', box: composeBox(),
      to: $('#cTo').value.trim(), subject: $('#cSubj').value.trim(),
      note: noteEl.value.trim(),
    };
  } else {
    const row = rowByKey(S.openKey);
    if (!row) return;
    const d = S._body || {};
    m = {
      mode: 'reply', box: folderName(folderOf(row)) || '',
      from: String(row[F.FROM] || ''), fromName: String(row[F.NAME] || ''),
      subject: String(row[F.SUBJ] || ''),
      // 本文がまだ来ていなければ、索引にある冒頭だけで書いてもらいます
      body: String(d.text || '').trim() || stripTags(String(d.html || '')) || String(row[F.SNIP] || ''),
      snippet: String(row[F.SNIP] || ''),
      note: noteEl.value.trim(),
    };
  }

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
const WATCH_FOCUS_SEC = 30;   // この窓を見ている
const WATCH_BACK_SEC = 180;   // 開いてはいるが、ほかの窓が前にある

function startWatch() {
  if (S.watching) return;            // ★二重に仕掛けません
  // 5秒ごとに「そろそろ聞く時間か」だけを見ます。
  // ★こうしておくと、窓を見はじめた瞬間から短い間隔に切り替わります
  S.watching = setInterval(watchTick, 5000);
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
    for (const src of live) {
      let h = '';
      try {
        h = String((await Api.peek(src)).h || '');
      } catch (e) {
        return;                      // つながらないときは、黙って次の回に
      }
      if (!h) continue;              // 印が取れない受け口は、見張りの対象外
      const before = S.seenH[src];
      S.seenH[src] = h;
      if (before === undefined) continue;   // 1回目は、ものさしを置くだけ
      if (before !== h) { await syncNew(true); return; }
    }
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

async function syncNew(quiet) {
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
    for (const src of live) {
      const d = await Api.sync(src);
      S.indexed[src] = Number(d.indexed || 0);
      if (d.inbox) S.inbox[src] = Number(d.inbox);
      added += mergeRows(d.added || [], src);
      await addReplied(src, d.replied);
      // 未読の一覧を受け取って、こちらの印を合わせます。
      // 既読かどうかは Gmail 側でも変わるので、毎回そろえます。
      // ★合わせるのは、その受け口から来た行だけです。全部に当てると、
      //   もう片方の受け口のメールが軒並み既読になってしまいます
      const un = new Set((d.unread || []).map(String));
      for (let i = 0; i < S.rows.length; i++) {
        if (String(S.rows[i][F.SRC]) !== src) continue;
        S.rows[i][F.UNREAD] = un.has(String(S.rows[i][F.ID])) ? 1 : 0;
      }
      // フラグも同じようにそろえます。Gmail や「メール」アプリで
      // 付け外ししたものが、こちらにも出るようにするためです
      if (d.starred) {
        Array.from(S.star).forEach((k) => {
          if (k.indexOf(src + ':') === 0) S.star.delete(k);
        });
        d.starred.forEach((id) => S.star.add(src + ':' + String(id)));
        await Store.set('star', Array.from(S.star));
      }
    }
    await Store.saveAll(S.rows);
    await Store.set('fmt', Store.FMT);
    await Store.set('lastSync', Date.now());
    // 取り込んだあとに、見張りのものさしを合わせ直します
    // （取り込み中に届いたぶんを、次の回で拾えるように）
    for (const src of live) {
      try { S.seenH[src] = String((await Api.peek(src)).h || S.seenH[src] || ''); } catch (e) { /* あとで */ }
    }
    if (!quiet) toast(added ? added + '通が届いていました' : '新着はありません');
    render(); renderSources();
    recountSometimes();          // ★たまに合計を数え直します（下の説明）
  } catch (e) {
    if (!quiet) toast(String(e.message || e), true);
  } finally {
    S.busy = ''; render();
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

function openSettings() {
  $('#settings').hidden = false;
  document.body.classList.add('is-modal');
  renderSources();
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
  return '<span class="src__ver is-old">アプリと受け口の版が違います。'
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
function renderSources() {
  const box = $('#srcBox');
  if (!box) return;
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
  Updater.start();
  loadAddrs();

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

  // 端末にためてあるぶんを先に出します。通信を待たせないためです
  S.busy = '読み込んでいます…'; render();
  try {
    S.rows = await Store.loadAll();
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

  // そのあとで、受け口ごとに聞きに行きます
  try {
    S.busy = 'つないでいます…'; render();
    const aliases = [];
    for (const src of live) {
      // ★1つの受け口がつまずいても、もう片方は動かします。
      //   まとめて try で囲っていたので、個人が転ぶと会社も
      //   聞きに行けませんでした。
      try {
        const p = await Api.probe(src);
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
      } catch (e) {
        S.ok[src] = false;
        S.err[src] = String((e && e.message) || e);
      }
    }
    if (live.every((src) => !S.ok[src])) {
      throw new Error(S.err[live[0]] || 'どの受け口からも返事がありません');
    }
    S.aliases = aliases;
    await Store.set('hosts', S.hosts);

    const rr = await Api.rules(S.main);
    const oo = await Api.over(S.main);
    const tt = await Api.tpl(S.main);
    Rules.set(rr.rows); Rules.setOver(oo.rows); S.tpl = tt.rows;
    await Store.set('rules', rr.rows);
    await Store.set('over', oo.rows);
    await Store.set('tpl', tt.rows);
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

    await syncNew(true);
    $('#scanNote').hidden = live.every((src) => S.done[src]);
  } catch (e) {
    toast(String(e.message || e), true);
  } finally {
    S.busy = ''; render();
  }
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
        // ★「足りない」しか見ていませんでした。多いときまで
        //   「そろっています」と言ってしまい、上の赤い字と
        //   食い違って、押しても直らないように見えました
        const left = Number(d.inbox || 0) - Number(d.after || 0);
        const消した = Number(d.removed || 0) + Number(d.gone || 0);
        toast('二重や、範囲から出ていたものを ' + cleaned.toLocaleString() + '通 消しました。'
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
  // ★お店むけの見本を入れます。**名前が同じものは入れません**（二度押しても増えない）。
  //   入れるだけで、保存は「保存する」を押したときです
  on('#tplMise', 'click', () => {
    const have = new Set(S.tpl.map((t) => String(t[1] || '').trim()));
    let n = 0;
    TPL_MISE.forEach(([name, body]) => {
      if (have.has(name)) return;
      S.tpl.push(['m' + Date.now() + (n++), name, body, S.tpl.length + 1]);
    });
    renderTpl();
    toast(n ? n + 'つ入れました。〈1回だけ〉のところを直して「保存する」を押してください'
            : 'もう入っています');
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
