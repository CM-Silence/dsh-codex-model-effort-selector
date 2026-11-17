/** Exercise the shipped dust controller with a deterministic animation clock. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf('\n    }', start);
  assert.ok(start >= 0 && end > start, `${name} is present`);
  return source.slice(start, end + 6);
}
const buildSparkles = new Function(`const PHI = 0.6180339887498949;
  ${extract('hash01')}
  ${extract('buildSparkles')}
  return buildSparkles;`)();
const sparkles = buildSparkles(22);
assert.deepEqual(sparkles, buildSparkles(22), 'dust placement stays deterministic');
assert.ok(sparkles.every(s => s.phase > 0.04 && s.phase < 0.96), 'idle dust starts inside the rail');
assert.equal(new Set(sparkles.map(s => s.top)).size, 22, 'dust occupies independent heights');

function harness(supported = true) {
  let now = 0;
  let nextId = 0;
  const frames = new Map();
  const listeners = new Map();
  const mediaListeners = new Map();
  const attributes = new Map();
  const animations = [];
  const document = {
    hidden: false,
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: type => listeners.delete(type)
  };
  const reduced = {
    matches: false,
    addEventListener: (type, fn) => mediaListeners.set(type, fn),
    removeEventListener: type => mediaListeners.delete(type)
  };
  const paths = sparkles.map(() => supported ? {
    animate(keyframes, options) {
      const animation = {
        keyframes, options, playState: 'running', timeWrites: 0, time: 0, playbackRate: 1,
        get currentTime() { return this.time; },
        set currentTime(value) { this.time = value; this.timeWrites++; },
        pause() { this.playState = 'paused'; },
        play() { this.playState = 'running'; },
        cancel() { this.playState = 'idle'; },
        updatePlaybackRate(value) { this.playbackRate = value; }
      };
      animations.push(animation);
      return animation;
    }
  } : {});
  const rail = {
    querySelectorAll: () => paths,
    setAttribute: (key, value) => attributes.set(key, value),
    removeAttribute: key => attributes.delete(key)
  };
  const create = new Function('P', 'window', 'document', 'performance',
    'requestAnimationFrame', 'cancelAnimationFrame',
    `${extract('createDustMotion')}; return createDustMotion;`)(
    'cmes', { matchMedia: () => reduced }, document, { now: () => now },
    fn => { frames.set(++nextId, fn); return nextId; }, id => frames.delete(id));
  const motion = create(rail, sparkles);
  return {
    motion, animations, attributes, frames, document, listeners, reduced, mediaListeners,
    step(ms) {
      now += ms;
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach(fn => fn(now));
    }
  };
}

const test = harness();
const state = { active: false, fast: false, peak: true };
const update = change => { Object.assign(state, change); test.motion.setState({ ...state }); };
update({});
assert.equal(test.animations.length, 0, 'closed selectors allocate no dust animations');
update({ active: true });
assert.equal(test.animations.length, 22, 'Ultra uses one shared field');
assert.ok(test.animations.every((a, i) => a.currentTime === sparkles[i].phase * sparkles[i].travel));
assert.ok(test.animations.every(a => a.playState === 'paused'), 'Ultra has no horizontal drift');
assert.ok(test.attributes.has('data-animating'), 'Ultra keeps its vertical float running');
assert.equal(test.frames.size, 0, 'idle Ultra needs no JS animation frames');

update({ fast: true });
test.step(525);
assert.equal(test.animations[0].playbackRate, 0.5, 'Fast accelerates smoothly');
test.step(525);
assert.equal(test.animations[0].playbackRate, 1, 'Fast reaches its cruising speed');
assert.equal(test.frames.size, 0, 'steady Fast needs no JS animation frames');
assert.ok(test.animations.every(a => a.playState === 'running'));
assert.equal(test.animations[0].keyframes.at(-1).transform, 'translateX(-108%)', 'travel is right-to-left');

update({ fast: false });
test.step(425);
assert.equal(test.animations[0].playbackRate, 0.5, 'leaving Fast decelerates');
test.step(425);
assert.ok(test.animations.every(a => a.playState === 'paused'), 'dust settles in place');
assert.ok(test.attributes.has('data-animating'), 'settled Ultra continues floating');

update({ fast: true });
test.step(300);
const reversingSpeed = test.animations[0].playbackRate;
update({ fast: false });
assert.equal(test.animations[0].playbackRate, reversingSpeed, 'a reversal keeps its current speed');
assert.equal(test.frames.size, 1, 'rapid toggling has a single speed-ramp callback');
test.step(200);
update({ fast: true });
test.step(1050);
assert.equal(test.animations.length, 22, 'toggling reuses the original particles');
assert.ok(test.animations.every(a => a.timeWrites === 1), 'toggling never resets particle positions');

update({ active: false });
assert.equal(test.frames.size, 0, 'switching panes or closing stops the ramp');
assert.ok(test.animations.every(a => a.playState === 'paused'));
assert.ok(!test.attributes.has('data-animating'), 'hidden CSS animations pause too');
update({ active: true });
assert.equal(test.animations[0].playbackRate, 1, 'reopening resumes cruising');

test.document.hidden = true;
test.listeners.get('visibilitychange')();
assert.ok(test.animations.every(a => a.playState === 'paused'), 'background windows pause');
test.document.hidden = false;
test.listeners.get('visibilitychange')();
assert.ok(test.animations.every(a => a.playState === 'running'), 'foregrounding resumes');
test.reduced.matches = true;
test.mediaListeners.get('change')();
assert.equal(test.animations[0].playbackRate, 1 / 2.6, 'reduced motion slows horizontal travel');

update({ fast: false, peak: false });
test.step(850);
assert.equal(test.frames.size, 0);
assert.ok(!test.attributes.has('data-animating'), 'ordinary mode has no continuing dust animations');
update({ fast: true });
test.step(100);
test.motion.destroy();
assert.equal(test.frames.size, 0, 'unmount cancels an unfinished ramp');
assert.equal(test.listeners.size + test.mediaListeners.size, 0, 'unmount removes subscriptions');
assert.ok(test.animations.every(a => a.playState === 'idle'), 'unmount releases compositor animations');

const fallback = harness(false);
fallback.motion.setState({ active: true, fast: true, peak: true });
fallback.step(1050);
fallback.motion.destroy();
assert.equal(fallback.frames.size, 0, 'missing Web Animations support degrades cleanly');

const ticks = harness();
ticks.motion.setState({ active: true, fast: true, peak: false });
assert.ok(!ticks.attributes.has('data-fast-ticks-hidden'), 'ordinary Fast still plays the tick departure');
ticks.motion.setState({ active: true, fast: true, peak: true });
assert.ok(ticks.attributes.has('data-fast-ticks-hidden'), 'Fast Ultra hides the decorative tick layer');
ticks.motion.setState({ active: true, fast: true, peak: false });
assert.ok(ticks.attributes.has('data-fast-ticks-hidden'), 'lowering effort keeps the Ultra departure layer hidden');
ticks.motion.setState({ active: false, fast: true, peak: false });
ticks.motion.setState({ active: true, fast: true, peak: false });
assert.ok(ticks.attributes.has('data-fast-ticks-hidden'), 'reopening preserves the hidden departure layer');
ticks.motion.setState({ active: true, fast: false, peak: false });
assert.ok(!ticks.attributes.has('data-fast-ticks-hidden'), 'disabling Fast restores the decorative ticks');
ticks.motion.setState({ active: true, fast: true, peak: false });
assert.ok(!ticks.attributes.has('data-fast-ticks-hidden'), 'a fresh non-Ultra Fast activation can depart ticks');
ticks.motion.setState({ active: true, fast: true, peak: true });
ticks.motion.destroy();
assert.ok(!ticks.attributes.has('data-fast-ticks-hidden'), 'disposal clears the tick state');
console.log('motion: dust continuity, acceleration, reversal, pause, reduced motion and disposal passed');
