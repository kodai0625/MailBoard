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

/** 予約の窓口（ko-dai さんの指定、2026-11-20）。ここに無ければ自分で打てます */
const FILL_SITES = [
  'agoda', 'Expedia', 'American Express Travel', '楽天トラベル', 'Trip.com',
];

const FILL_SITE_WORDS = /アメックス|AMEX|American Express|FHR|一休|楽天トラベル|じゃらん|agoda|エクスペディア|Expedia|Booking|Hotels\.com|Trip\.com|公式サイト|予約媒体|予約サイト|予約元/i;
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
function fillHead(body, at) {
  if (at < 0) return '';
  const lineAt = body.lastIndexOf('\n', at) + 1;
  let head = body.slice(lineAt, at)
    .replace(/[\s\u3000：:・．.]+$/, '')
    .replace(/^[\s\u3000]+/, '')
    .replace(/^[0-9]+[．.、]\s*/, '');
  /* ★手前に**別の【　】**があると、それごと名前にしていました
   *   （「宿泊日程　：【〇月〇日（〇）】 〜」が、そのまま名前に。2026-11-20）。
   *   うしろ側を使い、何も残らなければ**行のあたまの言葉**にもどします。 */
  const close = head.lastIndexOf('】');
  if (close >= 0) {
    const after = head.slice(close + 1)
      .replace(/^[\s\u3000〜~–—、,：:]+/, '').replace(/[\s\u3000：:・．.]+$/, '');
    const open = head.indexOf('【');
    const lead = open > 0 ? head.slice(0, open).replace(/[\s\u3000：:・．.]+$/, '') : '';
    /* ★うしろ側が**文の途中**のことがあります
     *   （「【11月15日（土）】から宿泊を予約しております、【酒井 皓大】」）。
     *   句読点が入っていたり、助詞ではじまるものは名前になりません。 */
    const midSentence = /[、，。．.!?！？]/.test(after)
      || /^(から|まで|より|を|に|で|と|へ|も|は|が|の)/.test(after);
    head = (after && !midSentence) ? after : lead;
  }
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

/**
 * その【　】の**うしろ**にある短い言葉（単位）を取り出します。
 * 「【〇】泊」「【〇】名」のように、単位がうしろに来ることが多いためです。
 */
function fillTail(body, end) {
  if (end < 0) return '';
  const rest = body.slice(end);
  /* ★**同じ行の中だけ**を見ます。\s は改行も通してしまうので、
   *   「ご滞在　【…】」の次の行が「人数」だと、うしろの言葉を「人」と
   *   読み違えて、滞在のらんを人数あつかいしかけていました（2026-11-20）。 */
  const m = rest.match(/^[^\S\n]*(泊|名様|名|人|時間|時|分|円)/);
  return m ? m[1] : '';
}

/** その【　】が入っている行ぜんぶ（何のらんか分かるように見せます） */
/**
 * 【　】のうしろ、**同じ行の残り**です（「を通じて」「経由で」など）。
 *
 * ★ko-dai さんのテンプレは「【　】 を通じて」の形で、**手前に言葉がありません**。
 *   手前だけ見ていたので、予約媒体のらんだと気づけませんでした（2026-11-20）。
 */
function fillAfter(body, end) {
  if (end < 0) return '';
  let nl = body.indexOf('\n', end);
  if (nl < 0) nl = body.length;
  return body.slice(end, nl).replace(/^[\s\u3000]+/, '').replace(/[\s\u3000]+$/, '');
}

function fillLine(body, at) {
  if (at < 0) return '';
  const a = body.lastIndexOf('\n', at) + 1;
  let b = body.indexOf('\n', at);
  if (b < 0) b = body.length;
  return body.slice(a, b).replace(/[\s\u3000]+/g, ' ').trim();
}

/**
 * どんな入力にするかを決めます。
 *
 * ★**前の言葉（head）→ うしろの単位（tail）→ 見本**、の順に見ます。
 *   見本が「〇月〇日（〇）」のような伏せ字だと、見本だけでは分かりません
 *   （2026-11-20、ko-dai さんのテンプレがそうでした）。
 */
function fillKind(sample, head, tail, after) {
  const s = String(sample || '');
  const h = String(head || '');
  /* ① うしろの単位。**いちばん確かな手がかり**なので先に見ます。
   *   「宿泊日程　：【日付】 〜 【日付】 【〇】泊」では、泊数の手前の言葉も
   *   「宿泊日程」になるため、前の言葉から決めると**日付のらんになって**いました
   *   （2026-11-20）。 */
  if (/泊|名様|名|人/.test(tail || '')) return 'num';
  if (/時|分/.test(tail || '')) return 'time';
  // ② 前の言葉で決まるもの
  if (/予約媒体|予約サイト|媒体|窓口|予約元/.test(h)) return 'site';
  /* ★うしろの言葉でも決まります。「【　】 を通じて」のように、
   *   **手前に何も書いていない**テンプレがあります（2026-11-20） */
  if (/^(を通じて|を通して|を通し|経由|より予約|から予約|で予約|にて予約|booked (through|via)|through|via)/i
      .test(String(after || ''))) return 'site';
  if (/宿泊日程|ご滞在|滞在日程/.test(h)) {
    return (/[〜~–—]/.test(s) || /泊|night/i.test(s)) ? 'stay' : 'date';
  }
  if (/チェックイン|チェックアウト|日程|日付|宿泊日|来店日|ご来店/.test(h)) return 'date';
  if (/到着|出発|時刻|時間/.test(h)) return 'time';
  if (/人数|名様|大人|お子様/.test(h)) return 'num';
  if (/泊数/.test(h)) return 'num';
  if (/電話/.test(h)) return 'tel';
  if (/予約番号|confirmation/i.test(h)) return 'text';
  // ③ 見本で決める
  if (FILL_SITE_WORDS.test(s)) return 'site';
  // 「11月15日（土）〜11月16日（日）／1泊」「15–16 November 2026 (1 night)」
  if (/[〜~–—]/.test(s) && /泊|night/i.test(s)) return 'stay';
  // ★伏せ字も見分けます（「〇月〇日（〇）」「〇〇：〇〇」）
  const MASK = '[0-9０-９〇○◯◯＊*xX×]';
  if (new RegExp(MASK + '+\\s*月\\s*' + MASK + '+\\s*日').test(s)) return 'date';
  if (new RegExp(MASK + '+\\s*[:：]\\s*' + MASK + '+').test(s)) return 'time';
  if (new RegExp('^' + MASK + '+\\s*(名|名様|人)').test(s)) return 'num';
  if (new RegExp('^' + MASK + '+\\s*泊').test(s)) return 'num';
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

/** 中身が伏せ字（〇〇）か空っぽなら true。そのままでは何のらんか分かりません */
function fillIsMask(sample) {
  const bare = String(sample || '')
    .replace(/[\s\u3000〇○◯＊*×xX0-9０-９:：（）()月日年\-]/g, '');
  return !bare;
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
  // ★伏せ字（〇〇：〇〇）からは取れません
  if (/[〇○◯＊*×]/.test(s)) return null;
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
  /* ★**場所ごと**に見ます。
   *   前は同じ文字の【　】をまとめていたので、テンプレが伏せ字のとき
   *   （予約番号も予約媒体も【　】、泊数も人数も【〇】）**片方が消えて**いました
   *   （2026-11-20、ko-dai さんのテンプレで起きました）。 */
  const occ = [];
  const re = /【[^】]*】/g;
  let mm;
  while ((mm = re.exec(body))) {
    const mark = mm[0];
    occ.push({ at: mm.index, end: mm.index + mark.length, mark,
               sample: mark.slice(1, -1),
               lineAt: body.lastIndexOf('\n', mm.index) + 1,
               head: fillHead(body, mm.index),
               tail: fillTail(body, mm.index + mark.length),
               after: fillAfter(body, mm.index + mark.length),
               line: fillLine(body, mm.index) });
  }
  if (!occ.length) { fillInsert(body, where); return; }

  /* ★同じらんにまとめてよいのは、**中身が書いてある**とき
   *   （「ABC12345」「酒井 皓大」など、同じ値が2か所に出るもの）。
   *   伏せ字や空っぽは、まわりの言葉がちがえば別のらんです。 */
  const items = [];
  occ.forEach((o) => {
    const plain = !fillIsMask(o.sample);
    const key = plain ? o.mark : (o.mark + '｜' + o.head + '｜' + o.tail + '｜' + o.after);
    const had = items.find((x) => x.key === key);
    if (had) { had.where.push(o); return; }
    items.push({ key, where: [o], mark: o.mark, sample: o.sample,
                 head: o.head, tail: o.tail, after: o.after, line: o.line,
                 kind: fillKind(o.sample, o.head, o.tail, o.after),
                 ja: fillIsJa(o.sample) || fillIsJa(o.head) || fillIsJa(body) });
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
  /* ★「宿泊日程　：【日付】 〜 【日付】 【〇】泊」の形。
   *   **出る日は（入る日＋泊数）で決まります。**2回選ばせると食い違うので、
   *   出る日のらんは出しません（ko-dai さんのテンプレ。2026-11-20）。
   *   泊数が無いテンプレなら、らんは出したまま「入る日／出る日」と名前をつけます。 */
  items.forEach((it, n) => {
    if (it.kind !== 'date' || it.link) return;
    const me = it.where[0];
    let prev = -1;
    items.forEach((x, xn) => {
      if (xn === n || x.kind !== 'date' || x.link) return;
      if (x.where[0].lineAt !== me.lineAt || x.where[0].at >= me.at) return;
      prev = xn;
    });
    if (prev < 0) return;
    // 2つの日付のあいだが「〜」でつながっていること
    if (!/[〜~–—]|\bto\b/i.test(body.slice(items[prev].where[0].end, me.at))) return;
    let nights = -1;
    items.forEach((x, xn) => {
      if (x.kind === 'num' && /泊|night/i.test(x.tail || '')
          && x.where[0].lineAt === me.lineAt) nights = xn;
    });
    if (nights < 0) { items[prev].part = 'in'; it.part = 'out'; return; }
    it.link = { n: prev, part: 'out', nightsN: nights };
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
  /* ★見本だけでは、何のらんか分からないことがあります
   *   （テンプレが「〇月〇日（〇）」のような伏せ字のとき。2026-11-20）。
   *   **その行まるごと**を出せば、ひと目で分かります。 */
  const line = it.line && it.line.length > 1
    ? '<p class="muted small fill__s">この行：' + esc(it.line.slice(0, 70)) + '</p>'
    : (it.sample ? '<p class="muted small fill__s">見本：' + esc(it.sample) + '</p>' : '');
  const note = line;
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
    /* ★横に出す単位は、まず**テンプレのうしろの言葉**（「【〇】泊」の「泊」）。
     *   見本をそのまま単位にすると、見本が伏せ字のとき「〇」と出てしまい、
     *   何の数なのか分かりませんでした（2026-11-20 ko-dai さんの指摘）。 */
    const u = it.tail || (fillIsMask(it.sample) ? '' : it.sample.replace(/^\s*\d+\s*/, ''));
    input = '<div class="row fill__row">'
      + '<input type="number" id="' + id + '" data-n="' + n + '" min="1" max="99" inputmode="numeric" value="'
      + (m ? m[0] : '2') + '">'
      + (u ? '<span class="fill__u">' + esc(u) + '</span>' : '') + '</div>';
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
  /* ★テンプレに窓口のらんが2つあることがあります（「【　】を通じて」と「予約媒体：【　】」）。
   *   同じ名前だと、どちらのことか分かりません。手前の言葉があれば、そちらを使います */
  if (it.kind === 'site') return it.head || '予約した窓口';
  if (it.kind === 'stay') return (it.head || 'ご滞在') + '（チェックインと泊数）';
  /* ★数のらんは、うしろの単位を名前にします。
   *   手前の言葉が「宿泊日程」（同じ行の頭）になることがあるためです */
  if (it.kind === 'num') {
    if (it.head && !/日程|滞在|日付|チェック/.test(it.head)) return it.head;
    if (it.tail === '泊') return '泊数';
    if (/名|人/.test(it.tail || '')) return '人数';
  }
  // ★同じ行に日付が2つあるときは、どちらか分かるようにします
  if (it.part === 'in') return (it.head || '日付') + '（入る日）';
  if (it.part === 'out') return (it.head || '日付') + '（出る日）';
  // ★テンプレの手前に書いてある名前があれば、それがいちばん分かりやすい
  if (it.head) return it.head;
  // ★手前に無くても、うしろの単位で分かります（「【〇】泊」→ 泊数）
  if (it.tail === '泊') return '泊数';
  if (/名|人/.test(it.tail || '')) return '人数';
  if (/時|分/.test(it.tail || '')) return '時刻';
  if (/予約番号|confirmation/i.test(s)) return '予約番号';
  if (/到着|arrive/i.test(s)) return '到着のころ';
  if (/電話|phone|tel/i.test(s)) return '電話番号';
  if (it.kind === 'num') return '人数';
  if (it.kind === 'datetime') return '日時';
  if (it.kind === 'date') return '日付';
  if (it.kind === 'time') return '時刻';
  if (/部屋|room/i.test(s)) return 'お部屋';
  if (/朝食|breakfast/i.test(s)) return '朝食';
  // ★伏せ字（〇〇）や空っぽを名前にしても分かりません。
  //   そのときは「この行」のほうを見てもらいます
  const bare = s.replace(/[\s\u3000〇○◯＊*×xX0-9０-９:：（）()月日年]/g, '');
  if (!bare) return 'ここに入れるもの';
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
/** らん1つぶんの、入れる文字を作ります */
function fillValueOf(it, n) {
  if (it.link) {
    // 滞在から割り出します（チェックインか、チェックアウトか）
    const st = S.fill.items[it.link.n];
    const d = $('#f' + it.link.n);
    if (!d || !d.value) return '';          // ★空なら【　】を残します
    // 泊数は、滞在らんの中（…n）か、別の「泊数」のらん（nightsN）から
    const nEl = it.link.nightsN != null ? $('#f' + it.link.nightsN) : $('#f' + it.link.n + 'n');
    const nights = Number(nEl && nEl.value) || 1;
    const iso = it.link.part === 'out' ? fillAddDays(d.value, nights) : d.value;
    return fillDateIn(it.sample, iso, st.ja);
  }
  const el = $('#f' + n);
  if (!el) return '';
  if (it.kind === 'site') {
    const other = $('#f' + n + 'o');
    return el.value || (other ? other.value.trim() : '');
  }
  if (it.kind === 'stay') {
    return fillStayText(el.value, Number($('#f' + n + 'n').value) || 1, it.ja);
  }
  /* ★空のままなら「空」を返します。
   *   見本を返すと、fillBuild が【　】を外して入れ直すので、
   *   **埋めていないのに埋めたように見えて**いました（2026-11-20）。 */
  if (it.kind === 'datetime') {
    if (!el.value) return '';
    // ★見本の中の日付と時刻だけを入れ替えます（まわりの文は残します）
    return fillTimeIn(fillDateIn(it.sample, el.value, it.ja), $('#f' + n + 't').value, it.ja);
  }
  if (it.kind === 'date') return el.value ? fillDateIn(it.sample, el.value, it.ja) : '';
  if (it.kind === 'time') return el.value ? fillTimeIn(it.sample, el.value, it.ja) : '';
  if (it.kind === 'num') return el.value ? fillNumText(it.sample, el.value) : '';
  return el.value.trim();
}

/**
 * 入れたものから、テンプレの文を作ります。
 *
 * ★**場所を指して**入れ替えます。文字で探して置き換えると、
 *   同じ伏せ字（【〇】）が別の意味で使われているときに、
 *   関係ないところまで書き換えてしまいます（2026-11-20）。
 * ★空のままなら【　】を残します。消すと、埋め忘れに気づけません。
 */
function fillBuild() {
  const body = String(S.tpl[S.fill.i][2] || '');
  const puts = [];
  S.fill.items.forEach((it, n) => {
    const v = fillValueOf(it, n);
    if (!v) return;
    it.where.forEach((o) => puts.push({ at: o.at, end: o.end, v }));
  });
  // うしろから入れます（前から入れると、場所がずれます）
  puts.sort((a, b) => b.at - a.at);
  let out = body;
  puts.forEach((p2) => { out = out.slice(0, p2.at) + p2.v + out.slice(p2.end); });
  return out;
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
