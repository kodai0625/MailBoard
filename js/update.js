/* ============================================================
 *  新しい版のお知らせ
 *
 *  【なぜ要るか】
 *  ホーム画面に追加したアプリは、iPhone が index.html を
 *  かなり長く持ち続けます。新しいものを上げても、開き直すと
 *  古い画面が出る、ということが実際に起きます。
 *
 *  公開したファイルには、中身から計算した「版の印」が付きます。
 *  アプリは version.json を時々見に行き、いま開いている印と
 *  違っていたら画面下に知らせを出します。押すと読み込み直します。
 *
 *  version.json と <meta name="app-version"> は 公開する.py が付けます。
 *  手元でそのまま開いたときは印が無いので、この機能は丸ごと止まります。
 * ============================================================ */

const Updater = {
  interval: 5 * 60 * 1000,   // 5分おきに確かめる
  _checking: false,
  _started: false,
  _found: '',

  /** いま開いている版の印 */
  current() {
    const meta = document.querySelector('meta[name="app-version"]');
    return meta ? meta.content.trim() : '';
  },

  async check() {
    if (this._checking || this._found || !this.current()) return;
    this._checking = true;
    try {
      // cache: 'no-store' で、端末に残っている控えを使わず必ず取りに行く
      const res = await fetch('version.json', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      if (json.v && json.v !== this.current()) this.show(json.v);
    } catch (e) {
      /* 通信できないときは何もしない。次の機会に確かめます */
    } finally {
      this._checking = false;
    }
  },

  show(version) {
    this._found = version;
    const bar = document.getElementById('updateBar');
    if (bar) bar.hidden = false;
  },

  /** 読み込み直す。URL に印を付けて、古いページが使われないようにする */
  apply() {
    const p = new URLSearchParams(location.search);
    p.set('v', this._found);
    p.delete('t');
    location.replace(location.pathname + '?' + p.toString() + location.hash);
  },

  /**
   * 「今すぐ最新にする」
   * 端末に残っている控えを全部捨ててから読み直します。
   * ★索引（メールの一覧）は別の場所（IndexedDB）にあるので消えません。
   */
  async force() {
    try {
      if ('caches' in window) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
    } catch (e) { /* 消せなくても、下の読み直しは行います */ }
    const p = new URLSearchParams(location.search);
    p.set('t', String(Date.now()));
    p.delete('v');
    location.replace(location.pathname + '?' + p.toString() + location.hash);
  },

  /** 読み込みの世話係（sw.js）を登録する */
  registerWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
    const root = location.pathname.replace(/[^/]*$/, '');
    // updateViaCache:'none' … sw.js 自体は控えを使わず、毎回取りに行く
    navigator.serviceWorker
      .register(root + 'sw.js', { scope: root, updateViaCache: 'none' })
      .catch(() => { /* 使えない端末では、これまでどおり動きます */ });
  },

  start() {
    if (this._started || !this.current()) return;
    this._started = true;
    this.registerWorker();

    const bar = document.getElementById('updateBar');
    if (bar) bar.querySelector('button').addEventListener('click', () => this.apply());

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.check();
    });
    setInterval(() => this.check(), this.interval);
    setTimeout(() => this.check(), 4000);
  },
};
