/* ============================================================
 *  テンプレの穴うめ
 *
 *  ★テンプレの【　】を、**打たずに選べる**ようにします
 *    （2026-11-20、ko-dai さんの「カッコやスペースを消して打つのが手間」）。
 *
 *  ★テンプレの文そのものは変えません。**中の見本から種類を見分けます。**
 *    そうしないと、せっかく登録したテンプレを入れ直してもらうことになります。
 *    見分けられないものは、ふつうの文字らんになります（損をしません）。
 * ========================================================== */

/** よく使う予約の窓口。ここに無ければ、自分で打てます */
const FILL_SITES = [
  'アメックス・トラベル（FHR）', 'アメックス・トラベル',
  '一休.com', '楽天トラベル', 'じゃらん', 'agoda', 'エクスペディア',
  'Booking.com', 'Hotels.com', 'ホテル公式サイト', '電話',
];

const FILL_SITE_WORDS = /アメックス|AMEX|FHR|一休|楽天トラベル|じゃらん|agoda|エクスペディア|Expedia|Booking|Hotels\.com|公式サイト/i;
const FILL_EN_MONTH = /(January|February|March|April|May|June|July|August|September|October|November|December)/i;
const FILL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const FILL_WD = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * テンプレの中で、その【　】の**手前にある言葉**を取り出します。
 *
 * ★「　予約番号　【ABC12345】」のように、手前に名前が書いてあることが多いので、
 *   見本そのもの（ABC12345）より分かりやすい名前になります。
 * ★文の途中（「同特典では【16時】まで…」）は名前になりません。
 *   助詞で終わっていたら使いません。
 */
function fillHead(body, mark) {
  const at = body.indexOf(mark);
  if (at < 0) return '';
  const lineAt = body.lastIndexOf('\n', at) + 1;
  let head = body.slice(lineAt, at)
    .replace(/[\s\u3000：:・．.]+$/, '')
    .replace(/^[\s\u3000]+/, '')
    .replace(/^[0-9]+[．.、]\s*/, '');
  if (!head) return '';
  // 助詞で終わっていたら、それは文の途中です（名前になりません）
  if (/(は|を|が|に|へ|と|の|も|で|から|まで|より)$/.test(head)) return '';
  // 英語も同じ。「Hello. My name is」のような文の途中を名前にしないため
  if (/\b(is|are|am|was|were|be|on|at|to|from|by|for|in|of|with|around|including|and|or|the|a|an)$/i
      .test(head)) return '';
  if (/[。．.!?！？]/.test(head)) return '';
  if (head.length > 24) return '';
  return head;
}

/** 【　】の中の見本から、どんな入力にするかを決めます */
function fillKind(sample) {
  const s = String(sample || '');
  if (FILL_SITE_WORDS.test(s)) return 'site';
  // 「11月15日（土）〜11月16日（日）／1泊」「15–16 November 2026 (1 night)」
  if (/[〜~–—]/.test(s) && /泊|night/i.test(s)) return 'stay';
  const hasDate = /\d+月\s*\d+日/.test(s) || (FILL_EN_MONTH.test(s) && /\d/.test(s));
  const hasTime = /\d{1,2}\s*[:：]\s*\d{2}|\d{1,2}\s*時/.test(s) || /\d\s*(a\.?m\.?|p\.?m\.?)/i.test(s);
  if (hasDate && hasTime) return 'datetime';
  if (hasDate) return 'date';
  if (hasTime) return 'time';
  if (/^\s*\d+\s*(名|名様|人|adults?|guests?|people)/i.test(s)) return 'num';
  if (/電話|phone|tel/i.test(s)) return 'tel';
  return 'text';
}

/**
 * 英語の見本で、その日付が滞在のどちらかと同じかを見ます。
 *
 * ★日本語は「11月15日（土）」がそのまま滞在の中に出てくるので、含まれるかで足ります。
 *   英語は「15 November」と「15–16 November 2026」で形がちがうので、
 *   **日にちと月の名前**で照らし合わせます。
 */
function fillLinkEn(dateSample, staySample) {
  const dm = String(dateSample).match(/(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)/i);
  if (!dm) return null;
  if (!new RegExp(dm[2], 'i').test(staySample)) return null;
  const days = (String(staySample).match(/\b\d{1,2}\b/g) || []).map(Number);
  if (days.length < 2) return null;
  const d = Number(dm[1]);
  if (days[0] === d) return 'in';
  if (days[1] === d) return 'out';
  return null;
}

/** 見本が日本語なら true（出す形をそろえるため） */
function fillIsJa(sample) {
  return /[ぁ-んァ-ン一-龥]/.test(String(sample || ''));
}

function fillPad(n) { return (n < 10 ? '0' : '') + n; }

/** yyyy-mm-dd → 「11月15日（土）」／「15 November 2026」 */
function fillDateText(iso, ja) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (ja) return m + '月' + d + '日（' + FILL_WD[dt.getDay()] + '）';
  return d + ' ' + FILL_MONTHS[m - 1] + ' ' + y;
}

/** 「18:00」→「18:00」／「6:00 p.m.」 */
function fillTimeText(hhmm, ja) {
  if (!hhmm) return '';
  if (ja) return hhmm;
  const [h, mi] = hhmm.split(':').map(Number);
  const ap = h < 12 ? 'a.m.' : 'p.m.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + ':' + fillPad(mi) + ' ' + ap;
}

/**
 * 見本の中の「時刻のところだけ」を入れ替えます。
 *
 * ★「到着は18時ごろを予定しております。」のように、**文ぜんぶが【　】の中**
 *   のことがあります。まるごと入れ替えると、文が消えてしまいます
 *   （2026-11-20、実際そうなりました）。
 * ★見本の書き方に合わせます（「18時」なら「19時」、「6:00 p.m.」なら「7:30 p.m.」）。
 */
function fillTimeIn(sample, hhmm, ja) {
  if (!hhmm) return sample;
  const [h, mi] = hhmm.split(':').map(Number);
  /* ★「当たったかどうか」は**見つけてから**決めます。
   *   置き換えた結果が元と同じかで判断すると、**同じ時刻を選んだときだけ**
   *   「見つからなかった」ことになり、文がまるごと消えました（2026-11-20）。 */
  const ampm = /\d{1,2}\s*[:：]\s*\d{2}\s*(a\.?m\.?|p\.?m\.?)/i;
  if (ampm.test(sample)) return sample.replace(ampm, () => fillTimeText(hhmm, false));
  const colon = /\d{1,2}\s*[:：]\s*\d{2}/;
  if (colon.test(sample)) return sample.replace(colon, () => fillPad(h) + ':' + fillPad(mi));
  const ja時 = /\d{1,2}\s*時(\s*\d{1,2}\s*分)?/;
  if (ja時.test(sample)) {
    return sample.replace(ja時, () => (mi ? h + '時' + mi + '分' : h + '時'));
  }
  // 見本に時刻が見当たらない（名前だけ）なら、そのまま入れます
  return fillTimeText(hhmm, ja);
}

/** 見本の中の「日付のところだけ」を入れ替えます（考え方は時刻と同じ） */
function fillDateIn(sample, iso, ja) {
  if (!iso) return sample;
  // ★時刻と同じ理由で、先に「見つかるか」を見ます
  const jaD = /\d{1,2}\s*月\s*\d{1,2}\s*日(（.）|\(.\))?/;
  if (jaD.test(sample)) return sample.replace(jaD, () => fillDateText(iso, true));
  const enD = /\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)(\s+\d{4})?/i;
  if (enD.test(sample)) return sample.replace(enD, () => fillDateText(iso, false));
  return fillDateText(iso, ja);
}

/** iso の n 日あと */
function fillAddDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return dt.getFullYear() + '-' + fillPad(dt.getMonth() + 1) + '-' + fillPad(dt.getDate());
}

/** 滞在の書き方。見本の言葉づかいに合わせます */
function fillStayText(iso, nights, ja) {
  if (!iso || !nights) return '';
  const out = fillAddDays(iso, nights);
  if (ja) {
    return fillDateText(iso, true) + '〜' + fillDateText(out, true) + '／' + nights + '泊';
  }
  const [y1, m1, d1] = iso.split('-').map(Number);
  const [y2, m2, d2] = out.split('-').map(Number);
  const night = nights + (nights === 1 ? ' night' : ' nights');
  if (y1 === y2 && m1 === m2) {
    return d1 + '–' + d2 + ' ' + FILL_MONTHS[m1 - 1] + ' ' + y1 + ' (' + night + ')';
  }
  return fillDateText(iso, false) + ' – ' + fillDateText(out, false) + ' (' + night + ')';
}

/** きょうの yyyy-mm-dd */
function fillToday() {
  const d = new Date();
  return d.getFullYear() + '-' + fillPad(d.getMonth() + 1) + '-' + fillPad(d.getDate());
}

/**
 * 見本の中の時刻を「18:00」の形で取り出します。見つからなければ null。
 *
 * ★はじめの値に使います。見本が「16時」なのに 18:00 を初期値にしていたので、
 *   **触らずに入れると16時が18時になって**いました（2026-11-20）。
 *   テンプレの意味が変わってしまいます。
 */
function fillTimeOf(sample) {
  const s = String(sample || '');
  let m = s.match(/(\d{1,2})\s*[:：]\s*(\d{2})\s*(a\.?m\.?|p\.?m\.?)/i);
  if (m) {
    let h = Number(m[1]) % 12;
    if (/p/i.test(m[3])) h += 12;
    return fillPad(h) + ':' + m[2];
  }
  m = s.match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
  if (m) return fillPad(Number(m[1])) + ':' + m[2];
  m = s.match(/(\d{1,2})\s*時(?:\s*(\d{1,2})\s*分)?/);
  if (m) return fillPad(Number(m[1])) + ':' + fillPad(Number(m[2] || 0));
  return null;
}

/** 見本の中の泊数。見つからなければ 1 */
function fillNightsOf(sample) {
  const m = String(sample || '').match(/(\d{1,2})\s*(泊|nights?)/i);
  return m ? Math.max(1, Number(m[1])) : 1;
}

/* ---- 画面 ---- */

/**
 * テンプレを開きます。【　】が無ければ、そのまま入れます。
 *   where … 'reply' か 'new'
 */
function openFill(i, where) {
  const t = S.tpl[i];
  if (!t) return;
  const body = String(t[2] || '');
  const marks = body.match(/【[^】]*】/g) || [];
  if (!marks.length) { fillInsert(body, where); return; }

  // 同じ見本が2回出てきたら、入力らんは1つにします（予約番号など）
  const uniq = [];
  marks.forEach((m) => { if (uniq.indexOf(m) < 0) uniq.push(m); });

  const items = uniq.map((m) => {
    const sample = m.slice(1, -1);
    return { mark: m, sample, kind: fillKind(sample), ja: fillIsJa(sample),
             head: fillHead(body, m) };
  });
  // ★滞在に含まれている日付は、入力らんを出しません。
  //   「チェックイン」を2回選ばせることになり、食い違いのもとです
  items.forEach((it, n) => {
    if (it.kind !== 'date') return;
    items.forEach((st, sn) => {
      if (st.kind !== 'stay' || sn === n) return;
      const at = st.sample.indexOf(it.sample);
      if (at >= 0) {
        const sep = st.sample.search(/[〜~–—]/);
        it.link = { n: sn, part: (sep >= 0 && at > sep) ? 'out' : 'in' };
        return;
      }
      const part = fillLinkEn(it.sample, st.sample);
      if (part) it.link = { n: sn, part };
    });
  });
  S.fill = { i, where, items };

  $('#fillTitle').textContent = String(t[1] || '埋める');
  $('#fillBox').innerHTML = S.fill.items
    .map((it, n) => (it.link ? '' : fillField(it, n))).join('');
  $('#fill').hidden = false;
  document.body.classList.add('is-modal');
  // ★滞在は、入れたそばから形を見せます（何が入るのか分からないと不安なので）
  fillPreview();
}

function fillField(it, n) {
  const lab = fillLabel(it);
  const id = 'f' + n;
  const head = '<label class="lbl" for="' + id + '">' + esc(lab) + '</label>';
  const note = '<p class="muted small fill__s">見本：' + esc(it.sample) + '</p>';
  let input = '';
  if (it.kind === 'site') {
    input = '<select id="' + id + '" data-n="' + n + '">'
      + FILL_SITES.map((v) => '<option' + (it.sample.indexOf(v) >= 0 ? ' selected' : '') + '>'
          + esc(v) + '</option>').join('')
      + '<option value="">（自分で打つ）</option></select>'
      + '<input class="fill__other" id="' + id + 'o" data-n="' + n + '" hidden placeholder="窓口の名前">';
  } else if (it.kind === 'stay') {
    input = '<div class="row fill__row">'
      + '<input type="date" id="' + id + '" data-n="' + n + '" value="' + fillToday() + '">'
      + '<input type="number" id="' + id + 'n" data-n="' + n + '" min="1" max="30" value="'
      + fillNightsOf(it.sample) + '" '
      + 'inputmode="numeric" aria-label="泊数">'
      + '<span class="fill__u">泊</span></div>'
      + '<p class="muted small fill__p" id="' + id + 'p"></p>';
  } else if (it.kind === 'datetime') {
    input = '<div class="row fill__row">'
      + '<input type="date" id="' + id + '" data-n="' + n + '" value="' + fillToday() + '">'
      + '<input type="time" id="' + id + 't" data-n="' + n + '" value="'
      + (fillTimeOf(it.sample) || '18:00') + '"></div>';
  } else if (it.kind === 'date') {
    input = '<input type="date" id="' + id + '" data-n="' + n + '" value="' + fillToday() + '">';
  } else if (it.kind === 'time') {
    // ★はじめの値は**見本のまま**にします（触らなければ意味が変わりません）
    input = '<input type="time" id="' + id + '" data-n="' + n + '" value="'
      + (fillTimeOf(it.sample) || '18:00') + '">';
  } else if (it.kind === 'num') {
    const m = it.sample.match(/\d+/);
    input = '<div class="row fill__row">'
      + '<input type="number" id="' + id + '" data-n="' + n + '" min="1" max="99" inputmode="numeric" value="'
      + (m ? m[0] : '2') + '">'
      + '<span class="fill__u">' + esc(it.sample.replace(/^\s*\d+\s*/, '') || '名') + '</span></div>';
  } else {
    input = '<input type="' + (it.kind === 'tel' ? 'tel' : 'text') + '" id="' + id
      + '" data-n="' + n + '" placeholder="' + esc(it.sample) + '">';
  }
  return '<div class="fill__f">' + head + input + note + '</div>';
}

/**
 * 人数の書き方。見本の空きかたをそのまま残します。
 * 「2名」→「1名」、「2 adults」→「1 adult」。
 * ★くっつけて「1adults」になっていました（2026-11-20）。
 */
function fillNumText(sample, n) {
  const m = String(sample).match(/^\s*(\d+)(\s*)([\s\S]*)$/);
  if (!m) return String(n);
  let unit = m[3];
  if (Number(n) === 1 && /^[A-Za-z]+s$/.test(unit)) unit = unit.slice(0, -1);
  return n + m[2] + unit;
}

/** らんの名前。見本から、それらしい言葉を選びます */
function fillLabel(it) {
  const s = it.sample;
  if (it.kind === 'site') return '予約した窓口';
  if (it.kind === 'stay') return (it.head || 'ご滞在') + '（チェックインと泊数）';
  // ★テンプレの手前に書いてある名前があれば、それがいちばん分かりやすい
  if (it.head) return it.head;
  if (/予約番号|confirmation/i.test(s)) return '予約番号';
  if (/到着|arrive/i.test(s)) return '到着のころ';
  if (/電話|phone|tel/i.test(s)) return '電話番号';
  if (it.kind === 'num') return '人数';
  if (it.kind === 'datetime') return '日時';
  if (it.kind === 'date') return '日付';
  if (it.kind === 'time') return '時刻';
  if (/部屋|room/i.test(s)) return 'お部屋';
  if (/朝食|breakfast/i.test(s)) return '朝食';
  return s.length > 14 ? s.slice(0, 14) + '…' : s;
}

/** 滞在らんの「こうなります」を出し直します */
function fillPreview() {
  if (!S.fill) return;
  S.fill.items.forEach((it, n) => {
    if (it.kind !== 'stay') return;
    const d = $('#f' + n), nn = $('#f' + n + 'n'), p = $('#f' + n + 'p');
    if (!d || !nn || !p) return;
    const nights = Number(nn.value) || 1;
    let t = fillStayText(d.value, nights, it.ja) || '';
    // ★この滞在から割り出す日付があれば、それも見せます
    const uses = S.fill.items.filter((x) => x.link && x.link.n === n);
    if (t && uses.length) {
      t += '（チェックアウト ' + fillDateText(fillAddDays(d.value, nights), it.ja) + '）';
    }
    p.textContent = t;
  });
}

/** 入れたものから、テンプレの文を作ります */
function fillBuild() {
  const t = S.tpl[S.fill.i];
  let body = String(t[2] || '');
  S.fill.items.forEach((it, n) => {
    if (it.link) {
      // 滞在から割り出します（チェックインか、チェックアウトか）
      const st = S.fill.items[it.link.n];
      const d = $('#f' + it.link.n);
      const nights = Number($('#f' + it.link.n + 'n').value) || 1;
      const iso = it.link.part === 'out' ? fillAddDays(d.value, nights) : d.value;
      const v2 = fillDateIn(it.sample, iso, st.ja);
      if (v2) body = body.split(it.mark).join(v2);
      return;
    }
    const el = $('#f' + n);
    let v = '';
    if (it.kind === 'site') {
      const other = $('#f' + n + 'o');
      v = el.value || (other ? other.value.trim() : '');
    } else if (it.kind === 'stay') {
      v = fillStayText(el.value, Number($('#f' + n + 'n').value) || 1, it.ja);
    } else if (it.kind === 'datetime') {
      // ★見本の中の日付と時刻だけを入れ替えます（まわりの文は残します）
      v = fillTimeIn(fillDateIn(it.sample, el.value, it.ja), $('#f' + n + 't').value, it.ja);
    } else if (it.kind === 'date') {
      v = fillDateIn(it.sample, el.value, it.ja);
    } else if (it.kind === 'time') {
      v = fillTimeIn(it.sample, el.value, it.ja);
    } else if (it.kind === 'num') {
      v = el.value ? fillNumText(it.sample, el.value) : '';
    } else {
      v = el.value.trim();
    }
    // ★空のままなら【　】を残します。消すと、埋め忘れに気づけません
    if (v) body = body.split(it.mark).join(v);
  });
  return body;
}

/** 本文に差し込みます */
function fillInsert(body, where) {
  const isNew = where === 'new';
  const el = $(isNew ? '#cText' : '#rText');
  const name = isNew ? '' : ($('#rTpl').dataset.name || '');
  const text = String(body).replace(/\{name\}/g, name);
  el.value = el.value ? el.value + '\n\n' + text : text;
  el.focus({ preventScroll: true });
}

function closeFill() {
  $('#fill').hidden = true;
  if ($('#reply').hidden && $('#compose').hidden && $('#settings').hidden && $('#detail').hidden) {
    document.body.classList.remove('is-modal');
  }
  S.fill = null;
}
