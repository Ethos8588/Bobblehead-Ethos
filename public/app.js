/* ------------------------------------------------------------------
   Farewell chat — front end.

   What this does:
     1. Asks /api/chat (GET) for the page title, intro line and idle video.
     2. Loops the idle video quietly in the background.
     3. When you send a message, posts it to /api/chat and crossfades to
        whichever reaction video comes back, then crossfades home again.

   You shouldn't need to edit this. Wording and video URLs live in
   data/responses.json.
------------------------------------------------------------------- */

(function () {
  'use strict';

  var FADE_MS = 450; // keep in sync with --fade in style.css

  var els = {
    title: document.getElementById('page-title'),
    intro: document.getElementById('intro-line'),
    idle: document.getElementById('idle-video'),
    reactions: [document.getElementById('reaction-0'), document.getElementById('reaction-1')],
    placeholder: document.getElementById('stage-placeholder'),
    soundToggle: document.getElementById('sound-toggle'),
    conversation: document.querySelector('.conversation'),
    messages: document.getElementById('messages'),
    form: document.getElementById('chat-form'),
    input: document.getElementById('chat-input'),
    send: document.getElementById('chat-send'),
  };

  var state = {
    idleReady: false,
    soundOn: true,
    nextSlot: 0,        // which reaction element to load into next
    activeSlot: null,   // which reaction element is currently showing
    returnTimer: null,
    busy: false,
  };

  /* ---------------- setup ---------------- */

  function init() {
    els.reactions.forEach(function (v) {
      v.muted = false;
      v.loop = false;
      v.setAttribute('playsinline', '');
    });

    els.form.addEventListener('submit', onSubmit);
    els.soundToggle.addEventListener('click', toggleSound);

    fetch('/api/chat', { method: 'GET' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error(r.status)); })
      .then(applySettings)
      .catch(function () {
        // The page still works for text even if settings can't be loaded.
        setPlaceholder(true);
      });
  }

  function applySettings(cfg) {
    if (cfg.pageTitle) {
      els.title.textContent = cfg.pageTitle;
      document.title = cfg.pageTitle;
    }
    if (cfg.introLine) els.intro.textContent = cfg.introLine;
    if (cfg.inputPlaceholder) els.input.placeholder = cfg.inputPlaceholder;

    if (cfg.idleVideoUrl) {
      if (cfg.idlePosterUrl) els.idle.poster = cfg.idlePosterUrl;
      els.idle.src = cfg.idleVideoUrl;
      els.idle.load();
      els.idle.addEventListener('canplay', function () {
        state.idleReady = true;
        setPlaceholder(false);
      }, { once: true });
      // Autoplay is only allowed while muted; that's fine for a silent idle loop.
      els.idle.play().catch(function () { /* user gesture will start it later */ });
    } else {
      setPlaceholder(true);
    }
  }

  function setPlaceholder(show) {
    els.placeholder.hidden = !show;
  }

  /* ---------------- chat ---------------- */

  function onSubmit(event) {
    event.preventDefault();
    var text = els.input.value.trim();
    if (!text || state.busy) return;

    addBubble(text, 'from-user');
    els.input.value = '';
    setBusy(true);

    // A submit counts as a user gesture, so from here on sound is allowed.
    els.soundToggle.hidden = false;
    updateSoundToggle();

    var typing = addTyping();

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    })
      .then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) throw new Error(data.error || 'Something went wrong.');
          return data;
        });
      })
      .then(function (data) {
        typing.remove();
        addBubble(data.text, 'from-them');
        if (data.videoUrl) playReaction(data.videoUrl);
      })
      .catch(function (err) {
        typing.remove();
        addBubble(err.message || 'Couldn’t reach the server. Try again?', 'is-error');
      })
      .finally(function () {
        setBusy(false);
        els.input.focus();
      });
  }

  function setBusy(busy) {
    state.busy = busy;
    els.send.disabled = busy;
  }

  function addBubble(text, variant) {
    var li = document.createElement('li');
    li.className = 'bubble ' + variant;
    li.textContent = text;
    els.messages.appendChild(li);
    scrollToBottom();
    return li;
  }

  function addTyping() {
    var li = document.createElement('li');
    li.className = 'bubble from-them';
    li.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';
    els.messages.appendChild(li);
    scrollToBottom();
    return li;
  }

  // Only the conversation scrolls now — the video and composer stay put.
  function scrollToBottom() {
    requestAnimationFrame(function () {
      var box = els.conversation;
      if (!box) return;
      box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
    });
  }

  /* ---------------- video crossfading ---------------- */

  function playReaction(url) {
    clearTimeout(state.returnTimer);

    var incoming = els.reactions[state.nextSlot];
    var outgoing = state.activeSlot !== null ? els.reactions[state.activeSlot] : null;
    state.nextSlot = 1 - state.nextSlot;

    incoming.muted = !state.soundOn;
    incoming.src = url;
    incoming.currentTime = 0;
    incoming.load();

    var started = false;

    function show() {
      if (started) return;
      started = true;

      incoming.play().catch(function () {
        // Sound may still be blocked on some browsers — retry silently.
        incoming.muted = true;
        state.soundOn = false;
        updateSoundToggle();
        incoming.play().catch(function () {});
      });

      incoming.classList.add('is-visible');
      state.activeSlot = els.reactions.indexOf(incoming);

      if (outgoing && outgoing !== incoming) {
        outgoing.classList.remove('is-visible');
        setTimeout(function () { outgoing.pause(); }, FADE_MS);
      } else {
        // Fade the idle loop out underneath. It keeps playing so that the
        // return crossfade lands on a live frame, not a frozen one.
        els.idle.classList.remove('is-visible');
      }
    }

    incoming.addEventListener('canplay', show, { once: true });
    // Don't hang forever if the file is slow or the URL is wrong.
    setTimeout(show, 2500);

    incoming.addEventListener('ended', function () { returnToIdle(incoming); }, { once: true });
    incoming.addEventListener('error', function () {
      addBubble('(that clip didn’t load)', 'is-error');
      returnToIdle(incoming);
    }, { once: true });
  }

  function returnToIdle(reactionEl) {
    clearTimeout(state.returnTimer);

    els.idle.classList.add('is-visible');
    if (els.idle.paused) els.idle.play().catch(function () {});
    reactionEl.classList.remove('is-visible');

    state.returnTimer = setTimeout(function () {
      reactionEl.pause();
      if (state.activeSlot === els.reactions.indexOf(reactionEl)) state.activeSlot = null;
    }, FADE_MS);
  }

  /* ---------------- sound ---------------- */

  function toggleSound() {
    state.soundOn = !state.soundOn;
    els.reactions.forEach(function (v) { v.muted = !state.soundOn; });
    if (state.soundOn && state.activeSlot !== null) {
      els.reactions[state.activeSlot].play().catch(function () {});
    }
    updateSoundToggle();
  }

  function updateSoundToggle() {
    els.soundToggle.textContent = state.soundOn
      ? 'Sound is on — tap to mute'
      : 'Sound is off — tap to unmute';
    els.soundToggle.setAttribute('aria-pressed', String(state.soundOn));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
