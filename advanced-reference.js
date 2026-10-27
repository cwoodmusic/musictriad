/* A read-only, mode-aware reference. All values are Music Triad rules, not a new game engine. */
(function (root, factory) {
  'use strict';
  const library = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = library;
  if (root.document) {
    root.CodaAdvancedReference = library.install();
  }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const NOTES = Object.freeze([
    { id: 'sn', name: 'Sixteenth note', value: .25 },
    { id: 'en', name: 'Eighth note', value: .5 },
    { id: 'qn', name: 'Quarter note', value: 1 },
    { id: 'dqn', name: 'Dotted quarter note', value: 1.5, dotted: 'qn' },
    { id: 'hn', name: 'Half note', value: 2 },
    { id: 'dhn', name: 'Dotted half note', value: 3, dotted: 'hn' },
    { id: 'wn', name: 'Whole note', value: 4 }
  ].map(Object.freeze));
  const RESTS = Object.freeze([
    { id: 'er', name: 'Eighth rest', value: .5 },
    { id: 'der', name: 'Dotted eighth rest', value: .75, dotted: 'er' },
    { id: 'qr', name: 'Quarter rest', value: 1 },
    { id: 'dqr', name: 'Dotted quarter rest', value: 1.5, dotted: 'qr' },
    { id: 'hr', name: 'Half rest', value: 2 },
    { id: 'dhr', name: 'Dotted half rest', value: 3, dotted: 'hr' },
    { id: 'wr', name: 'Whole rest', value: 4 }
  ].map(Object.freeze));
  const GROUPS = Object.freeze([
    { id: 'ee', name: 'Two eighths', value: 1, sum: '½ + ½ = 1' },
    { id: 'ssss', name: 'Four sixteenths', value: 1, sum: '¼ + ¼ + ¼ + ¼ = 1' },
    { id: 'eSS', name: 'Eighth + two sixteenths', value: 1, sum: '½ + ¼ + ¼ = 1' },
    { id: 'SSe', name: 'Two sixteenths + eighth', value: 1, sum: '¼ + ¼ + ½ = 1' },
    { id: 'sEs', name: 'Sixteenth + eighth + sixteenth', value: 1, sum: '¼ + ½ + ¼ = 1' }
  ].map(Object.freeze));
  const METERS = Object.freeze({ '4/4': 1, '2/2': .5, '6/8': 2 });
  const CATALOG = new Map([...NOTES, ...RESTS, ...GROUPS].map(item => [item.id, item]));
  const SPECIALS = Object.freeze([
    { id: 'mmrest', name: 'Multi-measure rest', target: 'empty',
      summary: 'Capture neighboring enemy cards whose touching edge is a rest.',
      detail: 'Checks only the side that faces your new card. Other special cards are safe.',
      pattern: 'neighbors', effect: 'capture' },
    { id: 'qfermata', name: 'Quarter-note fermata', target: 'empty',
      summary: 'Capture neighboring enemy cards whose touching edge is a note.',
      detail: 'Checks only the side that faces your new card. Other special cards are safe.',
      pattern: 'neighbors', effect: 'capture' },
    { id: 'conductor', name: 'Conductor', target: 'empty',
      summary: 'Capture every neighboring enemy card, including specials.',
      detail: 'Only directly above, below, left and right. Your own neighbors stay yours.',
      pattern: 'neighbors', effect: 'capture' },
    { id: 'subito', name: 'Subito', target: 'occupied',
      summary: 'Remove one card of either color, including a special.',
      detail: 'Choose an occupied square. Subito is used up; it does not stay on the board.',
      pattern: 'one', effect: 'remove' },
    { id: 'tacet', name: 'Tacet', target: 'occupied',
      summary: 'Remove a card and its immediate neighbors: a cross of up to 5.',
      detail: 'Both colors and specials can be removed. Tacet is used up; it does not stay on the board.',
      pattern: 'cross', effect: 'remove' },
    { id: 'mordent', name: 'Turn', target: 'empty',
      summary: 'Reverse every other card in the whole row and whole column.',
      detail: 'Both colors switch sides, including specials. Your new Turn card stays yours.',
      pattern: 'row-column', effect: 'reverse' }
  ].map(Object.freeze));
  const EXAMPLES = Object.freeze([
    { id: 'longer', title: 'Compare the touching sides', a: 'hn', am: '4/4', b: 'qn', bm: '4/4',
      text: 'Both edges are notes. The half note wins.', simple: true },
    { id: 'tie', title: 'Equal values stay put', a: 'qn', am: '4/4', b: 'ee', bm: '4/4',
      text: 'One quarter and two eighths have the same value. No card flips.', simple: true },
    { id: 'different', title: 'Notes and rests do not battle', a: 'hn', am: '4/4', b: 'qr', bm: '4/4',
      text: 'A note cannot capture a rest, even with a bigger number.', simple: true },
    { id: 'meter-tie', title: 'Different meters can make a tie', a: 'hn', am: '2/2', b: 'qn', bm: '4/4',
      text: 'Use the meter printed on each card. Both sides have 1 game power.' },
    { id: 'meter-win', title: 'Apply each card’s meter', a: 'qn', am: '6/8', b: 'qn', bm: '4/4',
      text: 'The written notes match, but their game powers differ.' },
    { id: 'dot-note', title: 'A dot adds half', a: 'dqn', am: '4/4', b: 'qn', bm: '4/4',
      text: 'A dotted quarter is 1 + ½. It captures the quarter note.' },
    { id: 'dot-rest', title: 'Dotted rests work too', a: 'der', am: '4/4', b: 'er', bm: '4/4',
      text: 'An eighth rest plus half its value is ¾. It captures the eighth rest.' }
  ].map(Object.freeze));

  function format(value) {
    return ({ .125: '⅛', .25: '¼', .375: '⅜', .5: '½', .75: '¾', 1.5: '1½' })[value] || String(value);
  }
  function kind(id) { return RESTS.some(item => item.id === id) ? 'rest' : CATALOG.has(id) ? 'note' : null; }
  function power(id, meter = '4/4') {
    const item = CATALOG.get(id);
    if (!item || !Object.hasOwn(METERS, meter)) throw new Error('Unknown reference rhythm or meter.');
    return item.value * METERS[meter];
  }
  function compare(a, am, b, bm) {
    if (!kind(a) || !kind(b)) throw new Error('Compare ordinary rhythm edges only.');
    if (kind(a) !== kind(b)) return 'different-kind';
    const av = power(a, am), bv = power(b, bm);
    return av > bv ? 'capture' : av === bv ? 'tie' : 'smaller';
  }
  function escapeText(value) {
    return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
  function install() {
    const document = root.document;
    const modal = document?.getElementById('cheatModal');
    if (!modal) return { open() {}, close() {}, getState: () => ({ available: false }) };
    if (modal.dataset.triadReference === 'ready') return root.CodaAdvancedReference;
    modal.dataset.triadReference = 'ready';
    modal.classList.add('triad-reference');
    modal.setAttribute('aria-labelledby', 'triad-ref-title');
    const sections = [
      { id: 'how', label: 'How to play' },
      { id: 'values', label: 'Rhythm values' },
      { id: 'meters', label: 'Card meters', advanced: true },
      { id: 'specials', label: 'Special cards' },
      { id: 'examples', label: 'Examples' }
    ];
    let guideMode = 'simple';
    let section = 'how';
    let opener = null;
    let previousOverflow = '';
    let isOpen = false;
    modal.innerHTML = `<div class="modalbox triad-ref-shell">
      <header class="triad-ref-header"><div><p class="triad-ref-eyebrow">MUSIC TRIAD • QUICK REFERENCE</p>
      <h2 id="triad-ref-title" tabindex="-1">Your card guide</h2></div>
      <button type="button" class="triad-ref-close" data-ref-close aria-label="Close card guide">Close <span aria-hidden="true">×</span></button></header>
      <div class="triad-ref-toolbar"><div class="triad-ref-mode" role="group" aria-label="Guide rules">
      <button type="button" data-ref-mode="simple" aria-pressed="false">Simple guide</button>
      <button type="button" data-ref-mode="advanced" aria-pressed="false">Advanced guide</button></div>
      <p>Guide only. Your game rules stay the same.</p></div>
      <nav class="triad-ref-tabs" role="tablist" aria-label="Card guide sections"></nav>
      <div class="triad-ref-body" id="triad-ref-panel" role="tabpanel" tabindex="0"></div>
      </div>`;
    const shell = modal.querySelector('.triad-ref-shell');
    const body = modal.querySelector('.triad-ref-body');
    const tabs = modal.querySelector('.triad-ref-tabs');

    function notation(id) {
      const item = CATALOG.get(id);
      const plain = item?.dotted || id;
      // Reuse the real game's vector engraving; never replace notes with font glyphs.
      let markup = typeof root.svg === 'function' ? root.svg(plain) : '';
      if (!markup.includes('<svg')) return `<span class="triad-ref-glyph-label">${escapeText(item?.name || id)}</span>`;
      if (item?.dotted) markup = `<span class="triad-ref-dotted">${markup}<svg class="triad-ref-dot" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="3.5" fill="currentColor"/></svg></span>`;
      return `<span class="triad-ref-notation" role="img" aria-label="${escapeText(item?.name || 'Fermata')}">${markup}</span>`;
    }
    function meterSymbol(meter) {
      return `<span class="triad-ref-meter" role="img" aria-label="${meter}"><span>${meter[0]}</span><span>${meter[2]}</span></span>`;
    }
    function card(id, meter, side, owner) {
      const label = `${owner === 'you' ? 'Your new card' : 'Other card'}: touching ${CATALOG.get(id).name}${guideMode === 'advanced' ? `, meter ${meter}` : ''}`;
      return `<div class="triad-ref-card ${owner}" role="img" aria-label="${escapeText(label)}">
        ${guideMode === 'advanced' ? meterSymbol(meter) : ''}
        ${['top', 'right', 'bottom', 'left'].map(edge => `<span class="triad-ref-edge ${edge} ${edge === side ? 'touching' : ''}" aria-hidden="true">${notation(edge === side ? id : 'sn')}</span>`).join('')}
        <span class="triad-ref-card-center" aria-hidden="true">${owner === 'you' ? 'NEW' : 'OTHER'}</span></div>`;
    }
    function cardPair(example, large = false) {
      return `<div class="triad-ref-pair${large ? ' large' : ''}">
        <div>${card(example.a, example.am, 'right', 'you')}<p>Your new card</p></div>
        <span class="triad-ref-touch" aria-hidden="true"><span>→</span><small>touch</small></span>
        <div>${card(example.b, example.bm, 'left', 'other')}<p>Other card</p></div></div>`;
    }
    function callout(text, type = '') {
      return `<div class="triad-ref-callout ${type}">${text}</div>`;
    }
    function how() {
      const advanced = guideMode === 'advanced';
      return `<section class="triad-ref-intro"><div><p class="triad-ref-kicker">THE ONE RULE TO REMEMBER</p>
        <h3>Only compare the sides that touch.</h3>
        <p>Play beside an enemy card. Find the two touching rhythms.</p>
        <div class="triad-ref-compare-rule"><b>Notes meet notes.</b><b>Rests meet rests.</b><b>Bigger value wins.</b></div>
        <p class="triad-ref-small">Equal values? Both cards stay as they are.</p></div>
        ${cardPair(EXAMPLES[0], true)}</section>
        <div class="triad-ref-steps">
          <article><span>1</span><h4>Choose & place</h4><p>Choose a card from your hand. Put it in an empty square.${advanced ? ' Some action cards choose an occupied square instead.' : ''}</p></article>
          <article><span>2</span><h4>Check its neighbors</h4><p>Look directly up, down, left and right. Diagonal cards do not touch.</p></article>
          <article><span>3</span><h4>Capture with more</h4><p>${advanced ? 'For each matching pair, compare the game powers. Use each card’s own meter.' : 'For each matching pair, a longer rhythm captures a shorter rhythm.'}</p></article>
        </div>
        ${callout('<b>One new card attacks.</b> Captured cards do not start another attack. A stronger neighbor does not flip your new card back.')}
        <div class="triad-ref-two-cols">
          <article class="triad-ref-info"><h4>${advanced ? '16 squares. Draw each turn.' : '9 squares. Use your hand.'}</h4><p>${advanced ? 'Both players start with 5 cards. The opening player plays first. After that, each player draws 1 card at the start of their turn.' : 'Take turns placing one card. Make more cards your color by the time the board is full.'}</p></article>
          <article class="triad-ref-info"><h4>Count the board to win</h4><p>${advanced ? 'The round ends when the board is full or both hands are empty. Count the occupied cards of each color. Most cards wins.' : 'When the board is full, the player with the most cards of their color wins.'}</p>${advanced ? '<p><b>A tie starts a fresh round:</b> empty board, 5 new cards each. Keep playing until there is a winner.</p>' : ''}</article>
        </div>
        ${advanced ? callout('<b>Specials follow their own rules.</b> Ordinary rhythm cards cannot capture a special. Open <button type="button" class="triad-ref-inline" data-ref-section="specials">Special cards</button> to see what can.', 'purple') : ''}`;
    }
    function valueTable(items, title) {
      return `<section class="triad-ref-value-section"><h4>${title}</h4><table class="triad-ref-values"><thead><tr><th scope="col">Rhythm</th><th scope="col">Name</th><th scope="col">Value</th></tr></thead><tbody>${items.map(item => `<tr><td>${notation(item.id)}</td><th scope="row">${item.name}</th><td><strong>${format(item.value)}</strong></td></tr>`).join('')}</tbody></table></section>`;
    }
    function values() {
      const advanced = guideMode === 'advanced';
      const notes = NOTES.filter(item => advanced || !item.dotted);
      const rests = RESTS.filter(item => advanced || !item.dotted);
      return `<div class="triad-ref-section-heading"><p class="triad-ref-kicker">START WITH THE WRITTEN RHYTHM</p><h3>Use a quarter note as 1.</h3><p>These base values use quarter-note units. ${advanced ? 'Then multiply by the card’s meter to find its game power.' : 'Compare matching kinds: notes with notes, rests with rests.'}</p></div>
        <div class="triad-ref-two-cols">${valueTable(notes, 'Notes = sounds')}${valueTable(rests, 'Rests = silence')}</div>
        <section class="triad-ref-group-section"><h4>Beamed notes: add them together.</h4><div class="triad-ref-groups">${GROUPS.filter(item => advanced || ['ee', 'ssss'].includes(item.id)).map(item => `<article><div>${notation(item.id)}</div><h5>${item.name}</h5><p>${item.sum}</p></article>`).join('')}</div>
        ${callout('<b>All of these groups equal 1.</b> The entire group is one edge of a card.')}</section>
        ${advanced ? `<div class="triad-ref-two-cols"><article class="triad-ref-info"><h4>A dot beside a rhythm adds half.</h4><div class="triad-ref-dot-demo">${notation('dqn')}<b>1 + ½ = 1½</b></div><p>A dot works the same way beside a rest. A dotted half is 2 + 1 = 3.</p></article><article class="triad-ref-info"><h4>Do marks change game power?</h4><p><b>The dot beside a rhythm does.</b> Performance marks such as staccato or tenuto do not change power in this game; they are currently hidden on cards.</p></article></div>` : ''}`;
    }
    function meters() {
      return `<div class="triad-ref-section-heading"><p class="triad-ref-kicker">AN ADVANCED GAME RULE</p><h3>Written value × card meter = game power.</h3><p>Read the small meter in the center of <b>each</b> card.</p></div>
        <div class="triad-ref-meter-grid">${Object.entries(METERS).map(([meter, multiplier]) => `<article>${meterSymbol(meter)}<h4>Multiply by ${format(multiplier)}</h4><div>${notation('qn')}<span>1 × ${format(multiplier)} = <b>${format(multiplier)}</b></span></div><p>${meter === '4/4' ? 'Keep the base value.' : meter === '2/2' ? 'Halve the base value.' : 'Double the base value.'}</p></article>`).join('')}</div>
        ${callout('<b>This is a game power rule.</b> In real music, the written note keeps its duration. A quarter note does not become a different note in 6/8.', 'purple')}
        <article class="triad-ref-meter-example"><div><h4>Same power, different cards</h4><p>A half note in 2/2 and a quarter note in 4/4 both have 1 game power. They tie.</p><p><b>2 × ½ = 1 &nbsp; and &nbsp; 1 × 1 = 1</b></p></div>${cardPair(EXAMPLES.find(example => example.id === 'meter-tie'))}</article>
        ${callout('<b>6/8 card pool:</b> You will not draw a whole note on a 6/8 card. A whole rest can still appear.')}`;
    }
    function specialSymbol(id) {
      if (id === 'conductor') return typeof root.conductorSVG === 'function' ? root.conductorSVG() : `<svg viewBox="0 0 100 100" aria-label="conductor"><circle cx="48" cy="18" r="9" fill="currentColor"/><path d="M48 30V62M48 38L20 50M48 38L75 22M48 62L30 88M48 62L68 88M75 22L92 5" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>`;
      if (id === 'subito') return '<svg viewBox="0 0 150 72" aria-label="Subito"><text x="75" y="46" text-anchor="middle" fill="currentColor" font-family="Georgia,serif" font-weight="bold" font-size="27">SUBITO</text></svg>';
      if (id === 'mordent') return '<svg viewBox="0 0 100 65" aria-label="turn ornament"><path d="M25 42C11 52 4 34 16 22C33 5 46 28 58 36C73 49 86 42 89 30C92 16 77 10 74 22" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round"/><circle cx="25" cy="42" r="6" fill="currentColor"/><circle cx="74" cy="22" r="6" fill="currentColor"/></svg>';
      const rest = '<svg viewBox="0 0 100 65" aria-label="multi-measure rest"><path d="M14 19V46M86 19V46M16 32H84" fill="none" stroke="currentColor" stroke-width="7"/></svg>';
      if (id === 'mmrest') return rest;
      if (id === 'tacet') return `${rest}<b class="triad-ref-tacet">TACET</b>`;
      return `<div class="triad-ref-fermata-note"><svg viewBox="0 0 60 32" aria-hidden="true"><path d="M8 26A22 22 0 0 1 52 26" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="30" cy="24" r="3.5" fill="currentColor"/></svg>${notation('qn')}</div>`;
    }
    function patternGrid(special) {
      const target = 5;
      return `<div class="triad-ref-pattern" role="img" aria-label="${special.name}: ${special.pattern === 'row-column' ? 'whole row and column, not diagonals' : special.pattern === 'one' ? 'one target square' : 'target with immediate up, down, left and right neighbors'}">${Array.from({ length: 16 }, (_, index) => {
        const row = Math.floor(index / 4), column = index % 4;
        const neighbor = [1, 4, 6, 9].includes(index);
        const affected = special.pattern === 'one' ? index === target : special.pattern === 'cross' ? index === target || neighbor : special.pattern === 'row-column' ? index !== target && (row === 1 || column === 1) : neighbor;
        return `<span class="${index === target ? 'target' : ''} ${affected ? 'affected' : ''}" aria-hidden="true">${index === target ? (special.target === 'empty' ? '+' : '×') : affected ? '•' : ''}</span>`;
      }).join('')}</div>`;
    }
    function specials() {
      if (guideMode === 'simple') return `<div class="triad-ref-section-heading"><p class="triad-ref-kicker">SIMPLE MODE</p><h3>Two special advantages.</h3><p>Simple mode uses these rules. Advanced has six different special cards.</p></div>
        <div class="triad-ref-two-cols"><article class="triad-ref-special"><div class="triad-ref-special-top"><div class="triad-ref-special-icon">${notation('f')}</div><div><h4>Fermata edge</h4><span class="triad-ref-target">On a rhythm card</span></div></div><p>A fermata on a side captures when it attacks. That side is also protected from ordinary attacks.</p><p class="triad-ref-small">This edge rule belongs to Simple mode.</p></article>
        <article class="triad-ref-special"><div class="triad-ref-special-top"><div class="triad-ref-special-icon">${specialSymbol('conductor')}</div><div><h4>Conductor</h4><span class="triad-ref-target">Place on an empty square</span></div></div><p>Capture every enemy card directly above, below, left and right.</p><p class="triad-ref-small">Diagonals do not count.</p></article></div>
        ${callout('Looking for Tacet, Turn or card meters? <button type="button" class="triad-ref-inline" data-ref-switch="advanced">Read the Advanced guide.</button>')}`;
      return `<div class="triad-ref-section-heading"><p class="triad-ref-kicker">SIX ADVANCED SPECIALS</p><h3>Read the target before you play.</h3><p>Four cards go on an <b>empty square</b>. Two actions choose an <b>occupied square</b>.</p></div>
        ${callout('<b>Special protection:</b> Ordinary rhythm cards cannot capture any special. Multi-measure rest and Quarter-note fermata cannot capture specials either. Conductor, Turn, Subito and Tacet can affect them.', 'purple')}
        <div class="triad-ref-special-grid">${SPECIALS.map(special => `<article class="triad-ref-special" data-special="${special.id}"><div class="triad-ref-special-top"><div class="triad-ref-special-icon">${specialSymbol(special.id)}</div><div><h4>${special.name}</h4><span class="triad-ref-target ${special.target === 'occupied' ? 'occupied' : ''}">${special.target === 'empty' ? 'Place on an empty square' : 'Choose an occupied square'}</span></div></div><div class="triad-ref-special-effect"><div><p><b>${special.summary}</b></p><p class="triad-ref-small">${special.detail}</p></div>${patternGrid(special)}</div></article>`).join('')}</div>
        <p class="triad-ref-small triad-ref-pattern-key"><b>Mini-board key:</b> + is your new card; × is the chosen card; dots show affected squares. Empty affected squares do nothing.</p>
        ${callout('<b>Turn is a reversal, not “capture everything.”</b> Enemy cards become yours, and your cards become the enemy’s. It reaches the <b>whole</b> row and column. Tacet reaches only the immediate cross.')}`;
    }
    function calculation(id, meter) {
      const base = CATALOG.get(id).value;
      return guideMode === 'simple' ? format(base) : `${format(base)} × ${format(METERS[meter])} = ${format(power(id, meter))}`;
    }
    function examples() {
      return `<div class="triad-ref-section-heading"><p class="triad-ref-kicker">WORKED COMPARISONS</p><h3>Follow the highlighted edges.</h3><p>Blue is the card you just played. Only the two highlighted sides are being compared.</p></div>
        <div class="triad-ref-example-grid">${EXAMPLES.filter(example => guideMode === 'advanced' || example.simple).map(example => {
          const result = compare(example.a, example.am, example.b, example.bm);
          return `<article class="triad-ref-example" data-example="${example.id}"><h4>${example.title}</h4>${cardPair(example)}<div class="triad-ref-math"><span>${notation(example.a)}<b>${calculation(example.a, example.am)}</b></span><strong aria-label="${result === 'capture' ? 'greater than' : result === 'different-kind' ? 'different kinds' : 'equals'}">${result === 'capture' ? '>' : result === 'different-kind' ? '≠' : '='}</strong><span>${notation(example.b)}<b>${calculation(example.b, example.bm)}</b></span></div><p class="triad-ref-result ${result === 'capture' ? 'capture' : ''}">${result === 'capture' ? 'Capture! Other card becomes yours.' : result === 'different-kind' ? 'Different kinds. No battle.' : 'Tie. No capture.'}</p><p class="triad-ref-small">${example.text}</p></article>`;
        }).join('')}</div>`;
    }
    function validSections() { return sections.filter(item => !item.advanced || guideMode === 'advanced'); }
    function update() {
      if (!validSections().some(item => item.id === section)) section = 'how';
      modal.dataset.guideMode = guideMode;
      modal.querySelector('#triad-ref-title').textContent = `${guideMode === 'advanced' ? 'Advanced' : 'Simple'} card guide`;
      modal.querySelectorAll('[data-ref-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.refMode === guideMode)));
      tabs.innerHTML = validSections().map(item => `<button type="button" role="tab" id="triad-ref-tab-${item.id}" data-ref-section="${item.id}" aria-controls="triad-ref-panel" aria-selected="${item.id === section}" tabindex="${item.id === section ? '0' : '-1'}">${item.label}</button>`).join('');
      body.setAttribute('aria-labelledby', `triad-ref-tab-${section}`);
      body.innerHTML = ({ how, values, meters, specials, examples })[section]();
      body.scrollTop = 0;
    }
    function selectMode(mode) {
      if (!['simple', 'advanced'].includes(mode)) return;
      const focusedMode = document.activeElement?.dataset.refMode;
      guideMode = mode;
      update();
      if (focusedMode) modal.querySelector(`[data-ref-mode="${mode}"]`)?.focus();
    }
    function selectSection(next, focus = false) {
      if (!validSections().some(item => item.id === next)) return;
      section = next;
      update();
      if (focus) modal.querySelector(`#triad-ref-tab-${section}`).focus();
    }
    function close() {
      if (!isOpen) return;
      isOpen = false;
      modal.classList.remove('open');
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected && typeof opener.focus === 'function') opener.focus();
    }
    function open(options = {}) {
      if (typeof options === 'string') options = { mode: options };
      guideMode = options.mode === 'advanced' || options.mode === 'simple' ? options.mode : root.musicTriadAdvancedSelected?.() ? 'advanced' : 'simple';
      if (options.section) section = options.section;
      if (!isOpen) {
        previousOverflow = document.body.style.overflow;
        opener = options.opener || document.activeElement;
      }
      // A single reference replaces Advanced Rules, rather than layering two dialogs.
      document.getElementById('rulesModal')?.classList.remove('open');
      update();
      isOpen = true;
      modal.classList.add('open');
      document.body.style.overflow = 'hidden';
      modal.querySelector('#triad-ref-title').focus();
    }
    modal.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (button?.hasAttribute('data-ref-close') || event.target === modal) return close();
      if (button?.dataset.refMode) return selectMode(button.dataset.refMode);
      if (button?.dataset.refSwitch) return selectMode(button.dataset.refSwitch);
      if (button?.dataset.refSection) return selectSection(button.dataset.refSection, true);
    });
    tabs.addEventListener('keydown', event => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      const available = validSections();
      const index = available.findIndex(item => item.id === section);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + available.length) % available.length;
      event.preventDefault();
      selectSection(available[next].id, true);
    });
    document.addEventListener('click', event => {
      const trigger = event.target.closest('[data-open]');
      const advancedRules = trigger?.dataset.open === 'rulesModal' && root.musicTriadAdvancedSelected?.();
      if (trigger?.dataset.open !== 'cheatModal' && !advancedRules) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      open({ opener: trigger, ...(advancedRules ? { mode: 'advanced', section: 'how' } : {}) });
    }, true);
    document.addEventListener('keydown', event => {
      if (!isOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
      } else if (event.key === 'Tab') {
        const focusable = Array.from(shell.querySelectorAll('button:not([disabled]), [tabindex="0"]')).filter(element => element.getClientRects().length);
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement))) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !focusable.includes(document.activeElement))) {
          event.preventDefault(); first?.focus();
        }
      }
    }, true);
    update();
    return Object.freeze({ open, close, selectMode, selectSection, getState: () => ({ available: true, open: isOpen, mode: guideMode, section }) });
  }
  return Object.freeze({ NOTES, RESTS, GROUPS, METERS, SPECIALS, EXAMPLES, power, compare, install });
});
