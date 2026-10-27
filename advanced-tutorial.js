/* Advanced lessons use the game's real cards and move engine. No scores or rewards. */
(function () {
  'use strict';

  const empty = () => Array(16).fill(null);
  const rhythm = (owner, symbol = 'qn', meter = '4/4', edges) => ({
    owner, meter, e: edges || [symbol, symbol, symbol, symbol], art: [null, null, null, null]
  });
  const special = (owner, name) => ({ owner, special: name });
  const fixture = (entries = {}) => Object.assign(empty(), entries);
  const normalHand = card => [card, rhythm(0, 'sn')];
  const match = (a, am, av, b, bm, bv, relation) => ({ a, am, av, b, bm, bv, relation });
  const BASIC = 'Start here', VALUES = 'Read the rhythms', SPECIALS = 'Special cards', FINISH = 'Finish a match';
  const LESSONS = [
    {
      id: 'place', chapter: BASIC, title: 'Your first card',
      look: 'You are blue. This board has 4 rows and 4 columns. Choose a card, then choose an empty square.',
      task: 'Choose the glowing blue card. Then choose the glowing empty square.',
      board: fixture({ 0: rhythm(1) }), hand: normalHand(rhythm(0)), target: 5,
      result: 'You placed a blue card! Opponents can capture it later. Finish with more cards in your color to win.',
      expect: { 0: 1, 5: 0 }
    },
    {
      id: 'touching', chapter: BASIC, title: 'Only the touching sides',
      look: 'Your new card attacks. Look at the two sides that touch. A stronger rhythm turns the red card blue. Corners do not touch.',
      task: 'Place your card beside the red card. Watch the two glowing sides.',
      board: fixture({ 0: rhythm(1), 6: rhythm(1, 'qn', '4/4', ['wn', 'sn', 'qr', 'qn']) }),
      hand: normalHand(rhythm(0, 'qn', '4/4', ['wn', 'hn', 'sn', 'qr'])), target: 5,
      edges: [[6, 3]], handEdge: 1, compare: match('hn', '4/4', 2, 'qn', '4/4', 1, '>'),
      result: 'Only the two touching sides counted: 2 beats 1. Other symbols on those cards did not join the attack. The card touching only a corner stayed red.',
      expect: { 0: 1, 5: 0, 6: 0 }
    },
    {
      id: 'equal', chapter: BASIC, title: 'Equal strength stays put',
      look: 'You must be stronger to capture. The same strength is a tie: neither card changes color.',
      task: 'Place your quarter-note card beside the other quarter-note card.',
      board: fixture({ 6: rhythm(1) }), hand: normalHand(rhythm(0)), target: 5,
      edges: [[6, 3]], handEdge: 1, compare: match('qn', '4/4', 1, 'qn', '4/4', 1, '='),
      result: '1 equals 1. Your card stayed blue, and the other card stayed red. A tied side does not capture or hit back.',
      expect: { 5: 0, 6: 1 }
    },
    {
      id: 'families', chapter: BASIC, title: 'Notes meet notes. Rests meet rests.',
      look: 'A note means sound. A rest means silence. Ordinary notes can capture notes; ordinary rests can capture rests.',
      task: 'Try your half note against the red quarter rest.',
      board: fixture({ 6: rhythm(1, 'qr') }), hand: normalHand(rhythm(0, 'hn')), target: 5,
      edges: [[6, 3]], handEdge: 1, compare: match('hn', '4/4', 2, 'qr', '4/4', 1, '≠'),
      result: 'The red card stayed red. These are different families: a note cannot capture a rest, even when its strength is higher.',
      expect: { 5: 0, 6: 1 }
    },
    {
      id: 'rests', chapter: BASIC, title: 'A rest can capture a rest',
      look: 'Rests have values too. A half rest has strength 2 on a 4/4 card. A quarter rest has strength 1.',
      task: 'Place your half-rest card beside the quarter-rest card.',
      board: fixture({ 6: rhythm(1, 'qr') }), hand: normalHand(rhythm(0, 'hr')), target: 5,
      edges: [[6, 3]], handEdge: 1, compare: match('hr', '4/4', 2, 'qr', '4/4', 1, '>'),
      result: 'Both touching symbols are rests. 2 is greater than 1, so you captured the red card.',
      expect: { 5: 0, 6: 0 }
    },
    {
      id: 'dots', chapter: VALUES, title: 'A dot adds half',
      look: 'A dot after a rhythm adds half its value. A quarter note is 1; its dot adds ½. That makes 1½.',
      task: 'Try the dotted quarter note against a plain quarter note.',
      board: fixture({ 6: rhythm(1) }), hand: normalHand(rhythm(0, 'dqn')), target: 5,
      edges: [[6, 3]], handEdge: 1, compare: match('dqn', '4/4', 1.5, 'qn', '4/4', 1, '>'),
      result: '1 + ½ = 1½. That beats 1! A dot after a rest works the same way. Staccato and legato do not give strength bonuses in this game.',
      expect: { 5: 0, 6: 0 }
    },
    {
      id: 'groups', chapter: VALUES, title: 'Count the whole group',
      look: 'A beam joins short notes into a group. Add their values: two eighth notes are ½ + ½ = 1.',
      task: 'Try the pair of eighth notes against a quarter note.',
      board: fixture({ 6: rhythm(1) }), hand: normalHand(rhythm(0, 'ee')), target: 5,
      edges: [[6, 3]], handEdge: 1, compare: match('ee', '4/4', 1, 'qn', '4/4', 1, '='),
      result: 'The pair totals 1, so this is a tie. Four sixteenths also total 1. The mixed eighth-and-sixteenth groups in this game total 1 too.',
      examples: ['ssss', 'eSS', 'SSe', 'sEs'], expect: { 5: 0, 6: 1 }
    },
    {
      id: 'cut-time', chapter: VALUES, title: 'Check the card’s meter: 2/2',
      look: 'In this game, the card’s meter changes its strength. 4/4 keeps the value. 2/2 halves it. Your half note becomes 2 ÷ 2 = 1.',
      task: 'Try your 2/2 half note against a 4/4 quarter note.',
      board: fixture({ 6: rhythm(1) }), hand: normalHand(rhythm(0, 'hn', '2/2')), target: 5,
      edges: [[6, 3]], handEdge: 1, compare: match('hn', '2/2', 1, 'qn', '4/4', 1, '='),
      result: 'Your 2/2 half note has game strength 1. The 4/4 quarter note also has strength 1. The red card stays red.',
      expect: { 5: 0, 6: 1 }
    },
    {
      id: 'six-eight', chapter: VALUES, title: 'Check the card’s meter: 6/8',
      look: 'A 6/8 card doubles the rhythm’s value in this game. Your quarter note becomes 1 × 2 = 2. Whole notes are not dealt on 6/8 cards.',
      task: 'Try your 6/8 quarter note against a 4/4 quarter note.',
      board: fixture({ 6: rhythm(1) }), hand: normalHand(rhythm(0, 'qn', '6/8')), target: 5,
      edges: [[6, 3]], handEdge: 1, compare: match('qn', '6/8', 2, 'qn', '4/4', 1, '>'),
      result: '2 beats 1. The symbols match, but the card meters are different! These multipliers are Music Triad rules, not a change to written note lengths.',
      expect: { 5: 0, 6: 0 }
    },
    {
      id: 'draw', chapter: VALUES, title: 'A new card each turn',
      look: 'A real Advanced match starts with 5 cards each. Play one card. After your opponent’s turn, you draw 1 before your next turn.',
      question: 'When do you draw your next card?',
      answers: [
        ['Before my next turn', true, 'Yes! Play → opponent plays → draw 1 → your next turn. Special cards use your turn too. These practice boards pause the normal draw-and-opponent turns.'],
        ['Every time I capture a card', false, 'Captures change colors. They do not draw cards. Your next card arrives before your next turn.']
      ], figure: 'draw'
    },
    {
      id: 'multi-rest', chapter: SPECIALS, title: 'Multi-measure Rest',
      look: 'Place this special in an empty square. It captures touching red rests. Touching notes and other special cards stay put.',
      task: 'Place Multi-measure Rest in the glowing square. Look above it for a rest.',
      board: fixture({ 1: rhythm(1, 'qr'), 4: rhythm(1), 6: special(1, 'conductor'), 9: rhythm(0, 'wr') }),
      hand: normalHand(special(0, 'mmrest')), target: 5, edges: [[1, 2]],
      result: 'The red rest above turned blue. The red note and Conductor stayed red. Your own blue rest stayed blue.',
      expect: { 1: 0, 4: 1, 5: 0, 6: 1, 9: 0 }
    },
    {
      id: 'fermata', chapter: SPECIALS, title: 'Quarter-note Fermata',
      look: 'This special captures touching red notes. It leaves rests and other special cards alone. Place it in an empty square.',
      task: 'Place Quarter-note Fermata. Find the note above the square.',
      board: fixture({ 1: rhythm(1), 4: rhythm(1, 'qr'), 6: special(1, 'mmrest') }),
      hand: normalHand(special(0, 'qfermata')), target: 5, edges: [[1, 2]],
      result: 'The red note turned blue. The red rest and Multi-measure Rest stayed red. This card chooses notes, not the biggest number.',
      expect: { 1: 0, 4: 1, 5: 0, 6: 1 }
    },
    {
      id: 'conductor', chapter: SPECIALS, title: 'Conductor',
      look: 'Conductor captures every touching red card: notes, rests, and even special cards. It only reaches the 4 squares next to it.',
      task: 'Place Conductor between the red cards.',
      board: fixture({ 1: special(1, 'mmrest'), 2: rhythm(1), 4: rhythm(1, 'qr'), 6: rhythm(1) }),
      hand: normalHand(special(0, 'conductor')), target: 5,
      result: 'Three neighbors turned blue, including the special. The far red card stayed red. Conductor cannot jump over a square or reach a corner.',
      expect: { 1: 0, 2: 1, 4: 0, 5: 0, 6: 0 }
    },
    {
      id: 'protect-specials', chapter: SPECIALS, title: 'Ordinary rhythms cannot flip specials',
      look: 'A special card has no ordinary rhythm sides. Even a strong whole note cannot capture it.',
      task: 'Try your whole-note card beside Multi-measure Rest.',
      board: fixture({ 6: special(1, 'mmrest') }), hand: normalHand(rhythm(0, 'wn')), target: 5, handEdge: 1,
      result: 'The special stayed red. Conductor and Turn can flip specials. Subito and Tacet can remove them. Ordinary notes and rests cannot capture them.',
      expect: { 5: 0, 6: 1 }
    },
    {
      id: 'subito', chapter: SPECIALS, title: 'Subito: remove one card',
      look: 'Choose Subito, then choose a card already on the board. That card disappears. Subito is used up; it does not stay on the board.',
      task: 'Choose Subito, then choose the glowing red Conductor.',
      board: fixture({ 5: special(1, 'conductor'), 6: rhythm(0) }),
      hand: normalHand(special(0, 'subito')), target: 5, action: true,
      result: 'Conductor disappeared. Your blue card stayed. Subito can remove either color, including a special, so choose carefully!',
      expect: { 5: null, 6: 0 }
    },
    {
      id: 'turn', chapter: SPECIALS, title: 'Turn: flip a whole cross',
      look: 'Place Turn in an empty square. Every other card in its whole row and column switches color. Your blue cards switch to red too!',
      task: 'Place Turn. Watch both colors along the glowing row and column.',
      board: fixture({ 0: rhythm(1), 1: rhythm(0), 4: rhythm(1), 6: special(1, 'mmrest'), 7: rhythm(0), 9: rhythm(1), 13: special(0, 'conductor') }),
      hand: normalHand(special(0, 'mordent')), target: 5, affected: [1, 4, 6, 7, 9, 13],
      result: 'The whole row and column switched colors, even the distant cards and specials. Turn itself stayed blue. The corner card stayed red.',
      expect: { 0: 1, 1: 1, 4: 0, 5: 0, 6: 0, 7: 1, 9: 0, 13: 1 }
    },
    {
      id: 'tacet', chapter: SPECIALS, title: 'Tacet: clear a small cross',
      look: 'Choose Tacet, then an occupied square. It removes that card and its immediate up, down, left, and right neighbors. Both colors disappear.',
      task: 'Choose Tacet, then choose the glowing center card.',
      board: fixture({ 0: rhythm(1), 1: rhythm(0), 4: rhythm(1), 5: special(1, 'conductor'), 6: special(0, 'mmrest'), 9: rhythm(1), 13: rhythm(1) }),
      hand: normalHand(special(0, 'tacet')), target: 5, action: true, affected: [1, 4, 6, 9],
      result: 'The center and its 4 neighbors disappeared. The diagonal card and the distant card stayed. Tacet is used up; it is not placed.',
      expect: { 0: 1, 1: null, 4: null, 5: null, 6: null, 9: null, 13: 1 }
    },
    {
      id: 'no-chain', chapter: FINISH, title: 'Captures do not make a chain',
      look: 'Only the card you play attacks. A card that turns blue does not attack again.',
      task: 'Capture the middle card. Watch the far red card.',
      board: fixture({ 6: rhythm(1), 7: rhythm(1, 'sn') }),
      hand: normalHand(rhythm(0, 'hn')), target: 5, edges: [[6, 3]], handEdge: 1,
      compare: match('hn', '4/4', 2, 'qn', '4/4', 1, '>'),
      result: '2 beat 1, so the middle card turned blue. It did not attack the far red sixteenth note. Your capture ends there.',
      expect: { 5: 0, 6: 0, 7: 1 }
    },
    {
      id: 'finish', chapter: FINISH, title: 'Win the match. Settle a tie.',
      look: 'A round ends when the board is full or both hands are empty. Count the card colors. More of your color wins. Equal totals start a fresh round of the same match.',
      question: 'The board ends with 8 blue and 8 red. What happens?',
      answers: [
        ['Clear the board and keep playing', true, 'Exactly. New hands and a clear board settle the tie. Nobody has won yet. The match continues until there is a winner.'],
        ['Both players earn a win', false, '8 and 8 is a tie. The same match continues with a clear board and new hands; a tie does not award a win.']
      ], figure: 'tie'
    },
    {
      id: 'online', chapter: FINISH, title: 'Play with a classmate',
      look: 'The host chooses Simple or Advanced before creating a room or tournament. Joining players use the host’s rules. Advanced uses this same 4 × 4 board.',
      question: 'Your friend hosts an Advanced room. Which rules will you use?',
      answers: [
        ['Advanced, just like the host', true, 'Ready! Join a game with its 4-character code. A teacher can also host a 2–4 player tournament with a 5-character code. Practice lessons do not give XP, wins, or achievements.'],
        ['Whichever mode my own menu shows', false, 'The room’s host chooses the rules for everyone. Joining an Advanced room gives you the same Advanced board and rules.']
      ], figure: 'online'
    }
  ];

  // Exporting the curriculum lets offline checks inspect the same lesson fixtures.
  if (typeof module !== 'undefined' && module.exports) module.exports = { lessons: LESSONS };
  if (typeof window === 'undefined' || !window.document) return;

  const doc = window.document;
  const STORAGE = 'music-triad-advanced-course-v2';
  const EDGE_CLASSES = ['t', 'r', 'b', 'l'];
  const SYMBOL_NAMES = {
    sn: 'sixteenth note', en: 'eighth note', qn: 'quarter note', hn: 'half note', wn: 'whole note',
    ee: 'two eighth notes', ssss: 'four sixteenth notes', eSS: 'eighth and two sixteenths',
    SSe: 'two sixteenths and an eighth', sEs: 'sixteenth, eighth, sixteenth',
    dqn: 'dotted quarter note', dhn: 'dotted half note', er: 'eighth rest', der: 'dotted eighth rest',
    qr: 'quarter rest', dqr: 'dotted quarter rest', hr: 'half rest', dhr: 'dotted half rest', wr: 'whole rest'
  };
  let active = false, index = 0, phase = 'look', run = 0, chosen = false;
  let panel, practice, hint, heading, copy, next, feedback, picker, choices, comparison, examples;
  let anchors = [], completed = [], lastMessage = '', renderObserver;
  const byId = id => doc.getElementById(id);
  const harness = () => window.musicTriadAdvancedTutorial;
  const lesson = () => LESSONS[index];
  const safeFocus = node => { if (node) node.focus({ preventScroll: true }); };
  const readSaved = () => {
    try { return JSON.parse(window.localStorage.getItem(STORAGE)) || {}; } catch (_) { return {}; }
  };
  const save = () => {
    try { window.localStorage.setItem(STORAGE, JSON.stringify({ lesson: lesson().id, completed })); } catch (_) { /* Storage is optional. */ }
  };
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const symbol = name => typeof svg === 'function' ? svg(name) : '';
  const fraction = value => ({ '.25': '¼', '0.25': '¼', '0.5': '½', '0.75': '¾', '1.5': '1½' }[String(value)] || String(value));

  function installPanel() {
    panel = doc.createElement('section');
    panel.id = 'advTutorialDialogue';
    panel.className = 'adv-course';
    panel.setAttribute('aria-labelledby', 'advTutHeading');
    panel.innerHTML = `<div class="adv-course-top"><span class="adv-course-name">Advanced practice</span><button type="button" id="advTutExit">Exit tutorial</button></div>
      <label class="adv-course-picker" for="advTutLesson">Choose a lesson <select id="advTutLesson"></select></label>
      <div class="adv-course-progress"><span id="advTutCount"></span><span id="advTutDone"></span></div>
      <h2 id="advTutHeading" tabindex="-1"></h2><p class="adv-course-stage" id="advTutStage"></p>
      <p id="advTutCopy"></p><div id="advTutComparison"></div><div id="advTutExamples"></div>
      <div id="advTutChoices" class="adv-course-choices"></div>
      <p id="advTutFeedback" class="adv-course-feedback" role="status" aria-live="polite" aria-atomic="true"></p>
      <button type="button" id="advTutNext" class="adv-course-next"></button>
      <nav class="adv-course-nav" aria-label="Tutorial navigation"><button type="button" id="advTutBack">Back</button><button type="button" id="advTutReplay">Replay lesson</button><button type="button" id="advTutHome">Home</button></nav>`;
    picker = panel.querySelector('#advTutLesson');
    let group;
    for (const [i, item] of LESSONS.entries()) {
      if (!group || group.label !== item.chapter) {
        group = doc.createElement('optgroup'); group.label = item.chapter; picker.appendChild(group);
      }
      const option = doc.createElement('option'); option.value = i; option.textContent = `${i + 1}. ${item.title}`; group.appendChild(option);
    }
    heading = panel.querySelector('#advTutHeading'); copy = panel.querySelector('#advTutCopy');
    next = panel.querySelector('#advTutNext'); feedback = panel.querySelector('#advTutFeedback');
    choices = panel.querySelector('#advTutChoices'); comparison = panel.querySelector('#advTutComparison'); examples = panel.querySelector('#advTutExamples');
    panel.querySelector('#advTutExit').onclick = () => exit(true);
    panel.querySelector('#advTutHome').onclick = () => exit(true);
    panel.querySelector('#advTutBack').onclick = () => {
      if (phase === 'feedback' || phase === 'try' || phase === 'busy') load(index);
      else if (index > 0) load(index - 1);
      else exit(true);
    };
    panel.querySelector('#advTutReplay').onclick = () => load(index);
    picker.onchange = () => load(Number(picker.value));
    next.onclick = advance;

    practice = doc.createElement('section'); practice.id = 'advTutPractice'; practice.className = 'adv-practice';
    practice.setAttribute('aria-label', 'Practice board and your cards');
    hint = doc.createElement('p'); hint.id = 'advTutBoardHint'; hint.className = 'adv-practice-hint'; hint.setAttribute('aria-live', 'polite');
    practice.appendChild(hint);
    const app = doc.querySelector('main.app');
    app.append(panel, practice);
    const hand = byId('hand'), handTitle = app.querySelector('.handtitle');
    for (const node of [app.querySelector('.legend'), byId('board'), handTitle, hand].filter(Boolean)) {
      const anchor = doc.createComment('Advanced tutorial restores this element here.');
      node.before(anchor); anchors.push([anchor, node]); practice.appendChild(node);
    }
    renderObserver = new MutationObserver(decorate);
    renderObserver.observe(byId('board'), { childList: true });
    renderObserver.observe(hand, { childList: true });
  }

  function showComparison(item) {
    if (!item.compare) { comparison.replaceChildren(); return; }
    const c = item.compare;
    const description = `Your side: ${SYMBOL_NAMES[c.a]}, ${c.am} card, strength ${c.av}. Other side: ${SYMBOL_NAMES[c.b]}, ${c.bm} card, strength ${c.bv}.`;
    comparison.innerHTML = `<div class="adv-course-math" aria-label="${escape(description)}">
      <div><span>Your side</span><span class="adv-course-symbol" aria-hidden="true">${symbol(c.a)}</span><b>${escape(fraction(c.av))}</b><small>${escape(c.am)} card</small></div>
      <strong class="adv-course-relation" aria-hidden="true">${escape(c.relation)}</strong>
      <div><span>Other side</span><span class="adv-course-symbol" aria-hidden="true">${symbol(c.b)}</span><b>${escape(fraction(c.bv))}</b><small>${escape(c.bm)} card</small></div>
      <p>${item.id === 'families' ? 'Different families: notes cannot capture rests' : 'Game strength of the touching sides'}</p></div>`;
  }

  function showFigure(item) {
    examples.replaceChildren();
    if (phase === 'feedback' && item.examples) {
      const row = doc.createElement('div'); row.className = 'adv-course-groups';
      row.setAttribute('aria-label', 'Four sixteenths and three mixed eighth-and-sixteenth groups: each totals one');
      row.innerHTML = item.examples.map(name => `<span>${symbol(name)}<b>1</b></span>`).join(''); examples.appendChild(row);
    } else if (item.figure === 'draw') {
      examples.innerHTML = '<ol class="adv-course-flow"><li>You play</li><li>Opponent plays</li><li>You draw 1</li><li>Your next turn</li></ol>';
    } else if (item.figure === 'tie') {
      examples.innerHTML = '<div class="adv-course-score-example"><span>8 blue</span><b>=</b><span>8 red</span></div>';
    } else if (item.figure === 'online') {
      examples.innerHTML = '<div class="adv-course-flow adv-course-online"><span>Host chooses rules</span><span>Everyone uses them</span></div>';
    }
  }

  function renderPanel() {
    if (!active) return;
    const item = lesson();
    panel.dataset.phase = phase; practice.dataset.phase = phase;
    picker.value = String(index); heading.textContent = item.title;
    byId('advTutCount').textContent = `Lesson ${index + 1} of ${LESSONS.length}`;
    byId('advTutDone').textContent = `${completed.length} finished`;
    byId('advTutStage').textContent = phase === 'look' ? '1 · Look' : phase === 'feedback' ? '3 · What happened?' : '2 · Your turn';
    copy.textContent = phase === 'look' ? item.look : phase === 'feedback' ? (item.result || lastMessage) : (item.question || item.task);
    feedback.textContent = phase === 'feedback' ? '' : lastMessage;
    feedback.hidden = !feedback.textContent;
    choices.replaceChildren();
    if (item.answers && phase === 'try') {
      for (const [label, correct, message] of item.answers) {
        const button = doc.createElement('button'); button.type = 'button'; button.textContent = label;
        button.onclick = () => {
          lastMessage = message;
          if (correct) complete(); else { feedback.textContent = message; feedback.hidden = false; }
        };
        choices.appendChild(button);
      }
    }
    showComparison(item); showFigure(item);
    next.hidden = phase === 'try' || phase === 'busy';
    next.disabled = false;
    next.textContent = phase === 'look' ? (item.answers ? 'Try a question' : 'Try it on the board') : index === LESSONS.length - 1 ? 'Play Advanced' : 'Next lesson';
    const task = phase === 'look' ? 'Read the short guide, then choose “Try it”.' : phase === 'feedback' ? 'Well done. Read what happened, then choose “Next lesson”.' : phase === 'busy' ? 'Watch the move. You can still replay or exit.' : chosen ? (item.action ? 'Now choose the glowing card on the board.' : 'Now choose the glowing empty square.') : item.task;
    hint.textContent = task || '';
    practice.hidden = !!item.answers;
    panel.classList.toggle('adv-course-question', !!item.answers);
    decorate();
  }

  function load(nextIndex) {
    if (!active) return;
    run++; index = Math.max(0, Math.min(LESSONS.length - 1, nextIndex)); phase = 'look'; chosen = false; lastMessage = '';
    const item = lesson();
    harness().setup(item.board || empty(), item.hand || normalHand(rhythm(0)));
    save(); renderPanel(); safeFocus(heading); panel.scrollIntoView({ block: 'start' });
  }

  function advance() {
    if (!active) return;
    if (phase === 'look') {
      phase = 'try'; lastMessage = ''; renderPanel();
      if (lesson().answers) safeFocus(choices.querySelector('button'));
      else {
        const card = byId('hand').querySelector('.pick'); safeFocus(card);
        card?.scrollIntoView({ block: 'nearest' });
      }
    } else if (phase === 'feedback') {
      if (index + 1 < LESSONS.length) load(index + 1);
      else {
        cleanup();
        // Enter an ordinary new match using the game's existing start handler.
        window.musicTriadAdvancedOnline?.setRules('advanced');
        byId('vsComputer').click();
      }
    }
  }

  function complete() {
    if (!completed.includes(lesson().id)) completed.push(lesson().id);
    phase = 'feedback'; chosen = false; save(); renderPanel();
    safeFocus(heading); panel.scrollIntoView({ block: 'start' });
  }

  function decorate() {
    if (!active || !practice) return;
    const boardEl = byId('board'), hand = byId('hand');
    const slots = [...boardEl.children], picks = [...hand.querySelectorAll('.pick')];
    practice.querySelectorAll('.adv-tut-target,.adv-tut-neighbor,.adv-tut-edge,.adv-tut-card').forEach(node => node.classList.remove('adv-tut-target', 'adv-tut-neighbor', 'adv-tut-edge', 'adv-tut-card'));
    const item = lesson();
    slots.forEach((slot, i) => {
      const old = slot.getAttribute('aria-label') || '';
      if (!slot.dataset.advOriginalLabel) slot.dataset.advOriginalLabel = old;
      slot.setAttribute('aria-label', `Row ${Math.floor(i / 4) + 1}, column ${i % 4 + 1}${i === item.target ? '. Practice target' : ''}`);
      slot.setAttribute('aria-describedby', 'advTutBoardHint');
      // Tutorial capture handlers guard actions, rather than disabling the real board.
      slot.disabled = phase !== 'try';
    });
    picks.forEach((pick, i) => {
      pick.disabled = phase !== 'try';
      pick.setAttribute('aria-label', i === 0 ? 'Practice card. Choose this card.' : 'Another card. Choose the glowing practice card for this lesson.');
      pick.setAttribute('aria-describedby', 'advTutBoardHint');
    });
    if (phase === 'look' || phase === 'try') {
      slots[item.target]?.classList.add('adv-tut-target');
      picks[0]?.classList.add('adv-tut-card');
      (item.affected || []).forEach(i => slots[i]?.classList.add('adv-tut-neighbor'));
      (item.edges || []).forEach(([i, edge]) => slots[i]?.querySelector(`.edge.${EDGE_CLASSES[edge]}`)?.classList.add('adv-tut-edge'));
      if (item.handEdge !== undefined) picks[0]?.querySelector(`.edge.${EDGE_CLASSES[item.handEdge]}`)?.classList.add('adv-tut-edge');
    }
  }

  function tell(message) {
    lastMessage = message; feedback.textContent = message; feedback.hidden = false;
  }

  function onHand(event) {
    if (!active) return;
    const pick = event.target.closest('.pick'); if (!pick) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (phase !== 'try') return;
    const at = [...byId('hand').querySelectorAll('.pick')].indexOf(pick);
    if (at !== 0) { tell('Choose the glowing practice card for this lesson. You can try other cards in a real match.'); return; }
    chosen = true; lastMessage = ''; harness().select(0); renderPanel();
    const target = byId('board').children[lesson().target]; safeFocus(target); target?.scrollIntoView({ block: 'center' });
  }

  async function onBoard(event) {
    if (!active) return;
    const slot = event.target.closest('.slot'); if (!slot) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (phase !== 'try') return;
    if (!chosen) { tell('First choose the glowing blue card below the board. Then choose the glowing target.'); return; }
    const target = [...byId('board').children].indexOf(slot);
    if (target !== lesson().target) { tell(lesson().action ? 'Choose the glowing occupied square. This special targets a card already on the board.' : 'Choose the glowing empty square. It puts the two sides we are learning about next to each other.'); return; }
    const currentRun = run, item = lesson();
    phase = 'busy'; lastMessage = ''; renderPanel();
    const moved = await harness()[item.action ? 'action' : 'place'](target);
    if (!active || currentRun !== run) return;
    if (!moved) { load(index); tell('That move was interrupted. Choose “Try it” to replay this example.'); return; }
    // Checking the actual board prevents advancing a lesson after an engine regression.
    let actual;
    try { actual = typeof board !== 'undefined' ? board : null; } catch (_) { actual = null; }
    if (actual && Object.entries(item.expect || {}).some(([i, owner]) => owner === null ? actual[i] !== null : actual[i]?.owner !== owner)) {
      load(index); tell('This example did not finish as expected. Replay the lesson to try again.'); return;
    }
    complete();
  }

  function start(requestedIndex) {
    if (!harness()) return false;
    if (active) cleanup();
    if (typeof leaveOnlineSession === 'function') leaveOnlineSession();
    window.musicTriadExitTutorial?.();
    if (typeof stopEndCue === 'function') stopEndCue();
    if (typeof stopMusic === 'function') stopMusic();
    if (typeof unlockAudio === 'function') unlockAudio();
    const saved = readSaved(); completed = Array.isArray(saved.completed) ? saved.completed.filter(id => LESSONS.some(item => item.id === id)) : [];
    const savedIndex = LESSONS.findIndex(item => item.id === saved.lesson);
    active = true; doc.body.classList.add('advanced-tutorial-active');
    harness().begin(); byId('startScreen').classList.add('hidden');
    byId('homeBtn').disabled = false; byId('homeBtn').removeAttribute('aria-disabled');
    installPanel(); load(Number.isInteger(requestedIndex) ? requestedIndex : Math.max(0, savedIndex));
    return true;
  }

  function cleanup() {
    if (!active) return;
    active = false; run++; renderObserver?.disconnect(); harness()?.stop();
    doc.body.classList.remove('advanced-tutorial-active');
    practice?.querySelectorAll('.adv-tut-target,.adv-tut-neighbor,.adv-tut-edge,.adv-tut-card').forEach(node => node.classList.remove('adv-tut-target', 'adv-tut-neighbor', 'adv-tut-edge', 'adv-tut-card'));
    practice?.querySelectorAll('[aria-describedby="advTutBoardHint"]').forEach(node => {
      node.removeAttribute('aria-describedby');
      if (node.dataset.advOriginalLabel !== undefined) {
        if (node.dataset.advOriginalLabel) node.setAttribute('aria-label', node.dataset.advOriginalLabel);
        else node.removeAttribute('aria-label');
        delete node.dataset.advOriginalLabel;
      } else node.removeAttribute('aria-label');
    });
    for (const [anchor, node] of anchors) anchor.replaceWith(node);
    anchors = []; panel?.remove(); practice?.remove(); panel = practice = null;
    const home = byId('homeBtn'); home.disabled = false; home.classList.remove('tutorial-home-locked'); home.removeAttribute('aria-disabled'); home.title = '';
    window.musicTriadAdvancedOnline?.setRules('advanced');
  }

  function exit(home = true) {
    cleanup();
    if (home && typeof goHomeScreen === 'function') goHomeScreen();
    if (home) safeFocus(byId('tutorialMode'));
  }

  window.CodaAdvancedTutorial = {
    start, exit, lessons: LESSONS,
    getState: () => ({ active, index, lessonId: lesson().id, phase, chosen, completed: [...completed] })
  };
  window.musicTriadExitAdvancedTutorial = cleanup;
  byId('tutorialMode')?.addEventListener('click', event => {
    if (!window.musicTriadAdvancedSelected?.()) return;
    event.preventDefault(); event.stopImmediatePropagation(); start();
  }, true);
  byId('hand')?.addEventListener('click', onHand, true);
  byId('board')?.addEventListener('click', onBoard, true);
  for (const id of ['homeBtn', 'new']) byId(id)?.addEventListener('click', event => {
    if (!active) return;
    event.preventDefault(); event.stopImmediatePropagation(); exit(true);
  }, true);
  doc.addEventListener('keydown', event => {
    if (!active || event.key !== 'Escape' || doc.querySelector('.modal.open')) return;
    event.preventDefault(); exit(true);
  }, true);
})();
