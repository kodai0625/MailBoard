/* ============================================================
 *  読み込みの世話係（サービスワーカー）
 *
 *  なぜ必要か
 *    ホーム画面に追加したアプリは、iPhone が index.html を
 *    かなり長いあいだ端末に持ち続けます。そのため、GitHub に
 *    新しいファイルを上げても、アプリを開き直すと古い画面が
 *    出てくる、ということが起きます。
 *    （画面の「更新する」を押したときだけ新しくなるのは、
 *      あのボタンが URL に印を付けて読み直しているためです）
 *
 *  ここで何をしているか
 *    ページそのもの（index.html）は、開くたびに必ず通信して
 *    新しいものを取りに行きます。通信できないときだけ、
 *    端末に控えてあるものを出します。
 *
 *    css / js / img は ?v=… という印が付いていて、中身が変われば
 *    印も変わります。つまり古い控えが混ざる心配がないので、
 *    控えがあればそれをそのまま使います（起動が速くなります）。
 *
 *  ★このファイルは 公開用を作る.py が 6474a7ae65 を版の印に
 *    書き換えてから公開されます。
 * ============================================================ */

const VERSION = '6474a7ae65';
const CACHE = 'mailboard-' + VERSION;

/* ★公開したものかどうか。
 *   公開のときだけ、上の版の印が本物（16進）に書き換わります。
 *   **Mac の確認用（localhost）では、ここが置き換わらないので印が動きません。**
 *   印が動かないと「?v= が変われば控えも変わる」という前提がくずれ、
 *   直したのに**いつまでも古いものが出続けます**
 *   （2026-11-20、ko-dai さんの Mac で起きました。開き直しても変わらなかった）。
 *   なので、公開したものでなければ**控えを使いません。** */
const BUILT = /^[0-9a-f]{6,}$/.test(VERSION);

/* 新しいこのファイルが届いたら、前のものを待たずにすぐ交代します */
self.addEventListener('install', () => {
  self.skipWaiting();
});

/* 交代したら、古い版の控えを捨てて、開いている画面をすぐ受け持ちます */
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.map((n) => (n === CACHE ? null : caches.delete(n))));
    await self.clients.claim();
  })());
});

async function keep(req, res) {
  if (!res || !res.ok || res.type === 'opaque') return res;
  const cache = await caches.open(CACHE);
  cache.put(req, res.clone());
  return res;
}

/** 通信を先に試し、だめなら控えを出す（ページ本体むけ） */
async function networkFirst(req) {
  try {
    /* ★`cache: 'reload'` ＝ ブラウザの控えを見ずに、本当に取りに行きます。
     *   GitHub Pages は「10分は控えていい」と言ってくるので、これが無いと
     *   公開した直後に開き直しても**古い index.html が返って**きました
     *   （2026-11-20）。古いブラウザでは使えないので、だめなら元のやり方に戻します。 */
    try {
      return await keep(req, await fetch(req, { cache: 'reload' }));
    } catch (e2) {
      if (e2 instanceof TypeError) return await keep(req, await fetch(req));
      throw e2;
    }
  } catch (err) {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}

/** 控えがあればそれを出し、無ければ取りに行く（?v= 付きのファイルむけ） */
async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  return keep(req, await fetch(req));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                    // 送信（同期）は素通し

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;          // Google への同期は素通し
  if (url.pathname.endsWith('/version.json')) return;  // 版の確認は必ず本物を見る

  // ページ本体は毎回通信して確かめる。ここが今回の直したところです
  if (req.mode === 'navigate') { e.respondWith(networkFirst(req)); return; }

  // 中身が変われば印（?v=）も変わるので、控えをそのまま使ってよい
  if (BUILT && url.searchParams.has('v')) { e.respondWith(cacheFirst(req)); return; }

  e.respondWith(networkFirst(req));
});

/* ============================================================
 *  プッシュ通知
 *
 *  ★**通知には中身が入っていません。**受け口から届くのは
 *    「変わったよ」の合図だけです。件名や差出人は、ここから
 *    ふだんの道（受け口）に聞きに行きます。
 *    こうすると、**メールの中身が Apple や Google の通知の道を
 *    通りません。**
 *
 *  ★合言葉は localStorage にありますが、ここ（サービスワーカー）からは
 *    読めません。だからアプリ側が IndexedDB にも写しています。
 * ========================================================== */

const DB_NAME = 'mail-board-v1';   // ★js/config.js の APP.storageKey と同じにすること

/** IndexedDB の kv から1つ読みます */
function kvGet(key) {
  return new Promise((ok) => {
    let req;
    try { req = indexedDB.open(DB_NAME); } catch (e) { ok(null); return; }
    req.onerror = () => ok(null);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) { ok(null); return; }
      try {
        const g = db.transaction('kv', 'readonly').objectStore('kv').get(key);
        g.onsuccess = () => ok(g.result || null);
        g.onerror = () => ok(null);
      } catch (e) { ok(null); }
    };
  });
}

/* ★通知といっしょに受け取ったメールの行を、端末にためておきます。
 *
 *   受け口は差出人・件名といっしょに**索引と同じ形の行**も返します。
 *   ここにためておけば、通知から開いた瞬間にアプリが一覧へ出せます
 *   （前は開いてから受け口に聞き直していて、3.8秒かかっていました。2026-11-23）。
 *   ★アプリは受け取ったら空にします。ここでは増えすぎないように切るだけです。
 *   ★どの受け口のぶんかは住所（url）で見分けます。アプリが受け口の id に直します。 */
const STASH_KEY = 'pushRows';
const STASH_MAX = 30;                  // ためておく束の数（1回の通知で受け口ごとに1束）
const STASH_ROWS = 20;                 // 1束の行の数
const STASH_WAIT_MS = 15000;           // 件名が間に合わなかったあと、行だけ待つ時間

async function stashRows(srcs, all) {
  const add = [];
  (all || []).forEach((x, i) => {
    if (!x || !x.d || !Array.isArray(x.d.rows) || !x.d.rows.length || !srcs[i]) return;
    add.push({ url: srcs[i].url, rows: x.d.rows.slice(0, STASH_ROWS), at: Date.now() });
  });
  if (!add.length) return 0;
  const old = (await kvGet(STASH_KEY)) || [];
  await kvSet(STASH_KEY, add.concat(Array.isArray(old) ? old : []).slice(0, STASH_MAX));
  return add.length;
}

/** 受け口に「いまの一言」を聞きます。だめなら null */
async function askBrief(src) {
  try {
    const res = await fetch(src.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ pin: src.pin, action: 'brief' }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    return d && d.ok ? d : null;
  } catch (e) { return null; }
}

/** IndexedDB の kv に1つ書きます（もう知らせた通を覚えるため） */
function kvSet(key, val) {
  return new Promise((ok) => {
    let req;
    try { req = indexedDB.open(DB_NAME); } catch (e) { ok(false); return; }
    req.onerror = () => ok(false);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) { ok(false); return; }
      try {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(val, key);
        tx.oncomplete = () => ok(true);
        tx.onerror = () => ok(false);
      } catch (e) { ok(false); }
    };
  });
}

const PUSH_MAX = 8;          // 一度に出す通知の数（鳴りっぱなしを防ぎます）
const WAIT_TAG = 'mailboard-new';
/* ★受け口の返事をどれくらい待つか。
 *   これを過ぎたら、件名はあきらめて「新着があります」だけを出します。
 *   ★長めにしてあります。**3秒では受け口が眠っているときに間に合わず**、
 *     結局2つ出ていました（2026-11-23）。iOS は30秒ほど待ってくれるので、
 *     ここで待ちきるほうが「通知は1つだけ」を守れます。 */
const WAIT_MS = 12000;
const ICONS = { icon: 'img/app-icon-192.png', badge: 'img/app-icon-192.png' };

/**
 * アイコンの数字（バッジ）を付け替えます。
 *
 * ★アプリを閉じているあいだに未読が増えても、画面が動かないので
 *   アプリ側からは付け替えられません。ここが受け持ちます（2026-11-22）。
 * ★ホーム画面（iPhone）や Dock（Mac）に追加したときだけ出ます。
 *   iPhone は通知を許していることが要ります。
 */
async function setBadge(n) {
  const v = Math.max(0, Number(n) || 0);
  try {
    if (v > 0) { if (self.navigator.setAppBadge) await self.navigator.setAppBadge(v); }
    else if (self.navigator.clearAppBadge) await self.navigator.clearAppBadge();
  } catch (e) { /* 付けられない置きかたもあります */ }
}

self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    /* ★件名は受け口（Apps Script）に聞きに行きます。向こうが眠っていると
     *   返事に時間がかかります。
     *
     *   ★**通知は、何があっても1通につき1つだけ**にします。
     *     はじめは「取りに行っています…」を先に出していましたが、
     *     **iPhone では、あとから出す通知で置き換わらず2つ並びます**
     *     （印をそろえても、消しに行っても消えません）。
     *     待ち時間を入れて「間に合えば出さない」ようにしても、
     *     受け口が眠っていると間に合わず、やはり2つ出ていました
     *     （2026-11-23、ko-dai さんの「また来るのでなくして」）。
     *
     *   → **先出しはやめました。**待てるだけ待って、
     *     ・間に合えば … 1通ずつ、差出人と件名で知らせます
     *     ・間に合わなければ … 「新着があります」**だけ**を出して、そこで終わります
     *       （あとから件名が届いても、もう出しません。2つ目になるので）
     *     ★何も出さないと iOS が嫌がるので、「出さない」という道は作りません。
     */
    const srcs = (await kvGet('pushSrc')) || [];
    const briefP = Promise.all(srcs.map((s) =>
      askBrief(s).then((d) => (d ? { name: s.name, d } : null))));
    // ★返事が来たら、まず行を端末にためます（上の stashRows の説明）
    const stashP = briefP.then((all) => stashRows(srcs, all)).catch(() => 0);
    const got = await Promise.race([
      briefP,
      new Promise((r) => setTimeout(() => r(null), WAIT_MS)),
    ]);
    if (got === null) {
      // 間に合いませんでした。これ1つで終わりにします
      await self.registration.showNotification('新しいメール', Object.assign({
        body: '新着があります', tag: WAIT_TAG, renotify: true,
      }, ICONS));
      /* ★通知はもう出しませんが、行は**もう少し待って受け取っておきます**。
       *   開いたときに、すぐ一覧に出せるようにするためです */
      await Promise.race([stashP, new Promise((r) => setTimeout(r, STASH_WAIT_MS))]);
      return;
    }
    /* ★通知を出す**前に**、ためておくのを終わらせます。
     *   出したあとだと、すぐ押されたときにまだ入っていないことがあります */
    await stashP;
    const live = got.filter((x) => x && x.d && x.d.n);
    /* ★受け口に聞けたぶんだけで数えます。
     *   聞けなかった受け口があっても、聞けたぶんは正しいので付け替えます。
     *   ★どこにも聞けなかったときは**触りません**（0 にすると、
     *     未読があるのにバッジが消えてしまいます）。 */
    const asked = got.filter((x) => x && x.d);
    if (asked.length) await setBadge(asked.reduce((a, x) => a + Number(x.d.n || 0), 0));

    if (!live.length) {
      // 受け口に聞けなかったとき。★消さずに、文だけ置き換えます
      await self.registration.showNotification('新しいメール', Object.assign({
        body: '新着があります', tag: WAIT_TAG, renotify: true,
      }, ICONS));
      return;
    }

    // ★**1通ずつ、送り主と件名で**知らせます（2026-11-19）。
    //   もう知らせた通は出しません。出すと、見るたびに同じ通知が並びます
    const seen = (await kvGet('pushSeen')) || [];
    const seenSet = new Set(seen.map(String));
    const fresh = [];
    live.forEach((x) => {
      (x.d.list || []).forEach((m) => {
        if (!m || !m.id || seenSet.has(String(m.id))) return;
        fresh.push({ name: x.name, m });
      });
    });

    if (!fresh.length) {
      // 新しく知らせるものが無い（もう知らせたぶんだけ）。
      // ★iOS は「通知を出さない push」を嫌うので、出したものは消さずに置き換えます
      const n = live.reduce((a, x) => a + Number(x.d.n || 0), 0);
      await self.registration.showNotification('新しいメール', Object.assign({
        body: '未読 ' + n + '通', tag: WAIT_TAG, renotify: true,
      }, ICONS));
      return;
    }

    const show = fresh.slice(0, PUSH_MAX);
    for (let i = 0; i < show.length; i++) {
      const { name, m } = show[i];
      // ★1通ごとに別の印で並べます（先出しはもうしません）
      await self.registration.showNotification(
        (m.from || '差出人なし') + '（' + name + '）', Object.assign({
          body: m.subj || '（件名なし）',
          tag: 'mail-' + m.id,
          data: { at: Date.now() },
        }, ICONS));
    }
    if (fresh.length > show.length) {
      await self.registration.showNotification('他 ' + (fresh.length - show.length) + '通', Object.assign({
        body: '新しいメールが届いています', tag: 'mailboard-more', renotify: true,
      }, ICONS));
    }
    /* ★先に出す通知は、もうありません（2026-11-23）。片づけるものもありません。 */
    // 覚えておくのは新しい200件だけ（増え続けないように）
    await kvSet('pushSeen', fresh.map((x) => String(x.m.id)).concat(seen).slice(0, 200));
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.indexOf(self.registration.scope) === 0) {
        // ★開いているものがあれば、そこへ戻して取り込ませます
        c.postMessage({ type: 'push-open' });
        return c.focus();
      }
    }
    return self.clients.openWindow(self.registration.scope);
  })());
});
