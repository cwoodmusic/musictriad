'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ref = require('../advanced-reference.js');

test('base values cover exactly the generated advanced pool', () => {
  const generated = ['sn','en','qn','ee','ssss','eSS','SSe','sEs','dqn','hn','dhn','wn','er','der','qr','dqr','hr','dhr','wr'];
  assert.deepEqual([...ref.NOTES,...ref.RESTS,...ref.GROUPS].map(x => x.id).sort(), generated.sort());
  assert.equal(ref.power('dqn'), 1.5);
  assert.equal(ref.power('dhn'), 3);
  assert.equal(ref.power('der'), .75);
  assert.equal(ref.power('dqr'), 1.5);
  assert.equal(ref.power('dhr'), 3);
  for (const group of ref.GROUPS) assert.equal(ref.power(group.id), 1);
});

test('worked examples obey actual strict comparison and game meter rules', () => {
  assert.deepEqual(ref.METERS, {'4/4':1,'2/2':.5,'6/8':2});
  assert.equal(ref.compare('hn','4/4','qn','4/4'), 'capture');
  assert.equal(ref.compare('hn','2/2','qn','4/4'), 'tie');
  assert.equal(ref.compare('qn','6/8','qn','4/4'), 'capture');
  assert.equal(ref.compare('dqn','4/4','qn','4/4'), 'capture');
  assert.equal(ref.compare('der','4/4','er','4/4'), 'capture');
  assert.equal(ref.compare('wn','4/4','er','4/4'), 'different-kind');
  assert.equal(ref.compare('sn','4/4','qn','4/4'), 'smaller');
  assert.equal(ref.power('wr','6/8'), 8);
  assert.throws(() => ref.compare('conductor','4/4','qn','4/4'));
});

test('six specials distinguish empty placements, occupied actions and full-line reversal', () => {
  assert.equal(ref.SPECIALS.length, 6);
  assert.deepEqual(ref.SPECIALS.filter(x => x.target === 'occupied').map(x => x.id), ['subito','tacet']);
  assert.equal(ref.SPECIALS.find(x => x.id === 'mordent').name, 'Turn');
  assert.equal(ref.SPECIALS.find(x => x.id === 'mordent').pattern, 'row-column');
  assert.equal(ref.SPECIALS.find(x => x.id === 'tacet').pattern, 'cross');
  assert.match(ref.SPECIALS.find(x => x.id === 'conductor').summary, /neighboring enemy/);
  for (const special of ref.SPECIALS.filter(x => ['mmrest','qfermata'].includes(x.id))) {
    assert.match(special.detail, /Other special cards are safe/);
  }
});
