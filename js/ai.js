/* ============================================================
 *  Mail Board — AI に書いてもらう
 *
 *  ★中身は Hub Board の中で動いている Claude Code です。
 *    こちらから API を直接たたいてはいません。だから
 *    **ふだんのプランの中**で動き、別の請求は立ちません。
 *
 *  ★Hub Board は道具をひとつも渡さずに Claude を動かします。
 *    返ってくるのは文面だけで、送るのは ko-dai さんです。
 *
 *  ★住所と合言葉は**端末の中**に覚えます。公開しているファイルには
 *    何も書きません（受け口の URL と同じ考えです）。
 * ---------------------------------------------------------- */

const AI = {
  _key(k) { return APP.storageKey + ':ai:' + k; },

  get(k) {
    try { return localStorage.getItem(this._key(k)) || ''; } catch (e) { return ''; }
  },
  set(k, v) {
    try {
      const t = String(v || '').trim();
      if (t) localStorage.setItem(this._key(k), t);
      else localStorage.removeItem(this._key(k));
    } catch (e) { /* 使えない置きかたもあります */ }
  },

  url() { return this.get('url'); },
  token() { return this.get('token'); },
  ready() { return !!(this.url() && this.token()); },

  /**
   * Hub Board の QR と同じ文字列を、住所と合言葉に分けます。
   *
   * ★`https://…/?t=あいことば` の形で渡せるようにしているのは、
   *   iPhone で QR から入れたものをそのまま貼れるようにするためです。
   *   2つの欄に分けて写させると、片方だけ入れ違えます。
   */
  remember(raw) {
    const s = String(raw || '').trim();
    if (!s) { this.set('url', ''); this.set('token', ''); return { ok: true, empty: true }; }
    let u;
    try { u = new URL(s); } catch (e) { return { ok: false, why: '住所の形になっていません' }; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { ok: false, why: 'http か https の住所にしてください' };
    }
    const t = u.searchParams.get('t') || '';
    if (!t) return { ok: false, why: '合言葉（?t=…）が入っていません。Hub Board の設定の QR をそのまま貼ってください' };
    // ★公開版（https）から http の Hub Board は呼べません。ブラウザが止めます
    if (location.protocol === 'https:' && u.protocol === 'http:') {
      return { ok: false, why: 'この画面は https なので、Hub Board も https の住所（Tailscale Serve のほう）にしてください' };
    }
    this.set('url', u.origin);
    this.set('token', t);
    return { ok: true };
  },

  async call(path, body) {
    const base = this.url();
    if (!base) throw new Error('Hub Board の住所が入っていません');
    const res = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: Object.assign({ 'X-Hub-Token': this.token() },
                             body === undefined ? {} : { 'Content-Type': 'application/json' }),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let d = null;
    try { d = await res.json(); } catch (e) { d = null; }
    if (!res.ok || !d || d.ok !== true) {
      throw new Error((d && d.error) || ('Hub Board につながりませんでした（' + res.status + '）'));
    }
    return d;
  },

  /**
   * 文面を書いてもらいます。すぐには返らないので、番号をもらって聞き直します。
   * onWait には「どれくらい待っているか」を渡します。
   */
  async write(m, onWait) {
    const started = await this.call('/api/mail/write', m);
    for (let i = 0; i < 100; i++) {                 // 1.5秒おきに、2分半まで
      await new Promise((r) => setTimeout(r, 1500));
      if (onWait) onWait(Math.round((i + 1) * 1.5));
      const d = await this.call('/api/mail/write/' + started.id);
      if (!d.done) continue;
      if (d.error) throw new Error(d.error);
      return String(d.text || '');
    }
    throw new Error('待っても返ってきませんでした。Mac の Hub Board が動いているか見てください');
  },

  /** 送ったものを手本として覚えてもらいます（育てる） */
  learn(m) {
    if (!this.ready()) return;
    this.call('/api/mail/learn', m).catch(() => {});   // 覚え損ねても、送信は成功しています
  },

  profile() { return this.call('/api/mail/profile').then((d) => String(d.text || '')); },
  saveProfile(t) { return this.call('/api/mail/profile', { text: String(t || '') }); },
};
