(() => {
  const STORAGE_KEY = 'full-app-state-v1';
  const initialState = { entries: [], activities: [], threshold: 9, syncUrl: '', syncQueue: [], deviceId: '' };
  let state = loadState();
  let editingId = null;
  let selectedCourse = 'small';
  let selectedLaps = 1;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const foodInput = $('#foodInput');
  const composer = $('#composer');
  const editDialog = $('#editDialog');

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        ...initialState,
        ...saved,
        entries: Array.isArray(saved.entries) ? saved.entries : [],
        activities: Array.isArray(saved.activities) ? saved.activities : [],
        syncQueue: Array.isArray(saved.syncQueue) ? saved.syncQueue : [],
        deviceId: saved.deviceId || (crypto.randomUUID ? crypto.randomUUID() : `device-${Date.now()}`),
      };
    } catch {
      return { ...initialState, deviceId: crypto.randomUUID ? crypto.randomUUID() : `device-${Date.now()}` };
    }
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    render();
  }

  function dayKey(dateLike = new Date()) {
    const date = new Date(dateLike);
    date.setHours(date.getHours() - 4);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function foodLabel(score) {
    return score === 1 ? '軽め' : score === 2 ? '普通' : score === 3 ? 'がっつり' : '多すぎ';
  }

  function syncPayload(kind, record, action = 'upsert') {
    const payload = { action, kind, deviceId: state.deviceId, record: { id: record.id } };
    if (action === 'delete') return payload;
    if (kind === 'food') {
      payload.record = {
        id: record.id,
        createdAt: record.createdAt,
        day: dayKey(record.createdAt),
        raw: record.raw,
        foods: record.foods,
        score: record.score,
        label: foodLabel(record.score),
      };
    } else {
      payload.record = {
        id: record.id,
        createdAt: record.createdAt,
        day: dayKey(record.createdAt),
        course: record.course === 'large' ? '大回り' : '小回り',
        laps: record.laps,
      };
    }
    return payload;
  }

  function queueSync(payload) {
    state.syncQueue = state.syncQueue.filter((item) => !(item.kind === payload.kind && item.record.id === payload.record.id));
    state.syncQueue.push(payload);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderSettings();
    flushSyncQueue();
  }

  async function flushSyncQueue() {
    if (!state.syncUrl || !state.syncQueue.length || flushSyncQueue.running || !navigator.onLine) {
      renderSettings();
      return;
    }
    flushSyncQueue.running = true;
    renderSettings('syncing');
    try {
      while (state.syncQueue.length) {
        await fetch(state.syncUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(state.syncQueue[0]),
        });
        state.syncQueue.shift();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    } catch {
      // Keep queued records locally and retry when the app is opened or returns online.
    } finally {
      flushSyncQueue.running = false;
      renderSettings();
    }
  }

  function queueAllForSync() {
    state.syncQueue = [];
    state.entries.forEach((entry) => state.syncQueue.push(syncPayload('food', entry)));
    state.activities.forEach((activity) => state.syncQueue.push(syncPayload('exercise', activity)));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    flushSyncQueue();
  }

  function parseFoods(text) {
    return text
      .replace(/[\n\r]+/g, '、')
      .split(/\s*(?:、|,|，|・|と|それから|あと)\s*/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function formatTime(value) {
    return new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
  }

  function formatDay(key, short = false) {
    const [year, month, day] = key.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (short) return `${month}月${day}日`;
    return new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }).format(date);
  }

  function scoreFor(key) {
    return state.entries.filter((entry) => dayKey(entry.createdAt) === key).reduce((sum, entry) => sum + entry.score, 0);
  }

  function activitiesFor(key) {
    return state.activities.filter((activity) => dayKey(activity.createdAt) === key);
  }

  function statusFor(score) {
    if (score >= state.threshold) return ['食べすぎたぜえ。。。', '今日はそういう日。ゆっくりいこう。'];
    if (score >= state.threshold - 2) return ['そろそろ慎重に。', '満腹ラインが見えてきた。'];
    if (score >= 4) return ['いい感じ。', 'まだ余白あり。自分のペースで。'];
    return ['静かなスタート。', '今日も気楽に記録していこう。'];
  }

  function renderToday() {
    const today = dayKey();
    const entries = state.entries.filter((entry) => dayKey(entry.createdAt) === today).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const activities = activitiesFor(today).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const score = entries.reduce((sum, entry) => sum + entry.score, 0);
    const [message, sub] = statusFor(score);
    $('#todayDate').textContent = formatDay(today).toUpperCase();
    $('#todayScore').textContent = score;
    $('#thresholdLabel').textContent = state.threshold;
    $('#meterFill').style.width = `${Math.min(100, score / state.threshold * 100)}%`;
    $('#statusMessage').textContent = message;
    $('#statusSub').textContent = sub;
    $('#entryCount').textContent = `${entries.length}件`;
    $('#exerciseTotal').textContent = `${activities.reduce((sum, activity) => sum + activity.laps, 0)}周`;
    $('#todayExerciseList').innerHTML = activities.map(activityMarkup).join('');
    $('#scoreCard').classList.toggle('over', score >= state.threshold);
    $('#todayList').innerHTML = entries.length ? entries.map(entryMarkup).join('') : `
      <div class="empty-state"><strong>まだ何も食べていない。</strong><span>下の入力欄から、最初のログを残そう。</span></div>`;
  }

  function activityMarkup(activity, history = false) {
    const course = activity.course === 'large' ? '大回り' : '小回り';
    return `<div class="activity-row ${history ? 'history-activity' : ''}">
      <span class="course-mark ${activity.course}">${activity.course === 'large' ? '大' : '小'}</span>
      <div><strong>${course}</strong><small>${formatTime(activity.createdAt)}</small></div>
      <b>${activity.laps}<span>周</span></b>
      <button type="button" class="activity-delete" data-activity-id="${activity.id}" aria-label="${course}${activity.laps}周を削除">×</button>
    </div>`;
  }

  function entryMarkup(entry) {
    const label = entry.score === 1 ? '軽め' : entry.score === 2 ? '普通' : entry.score === 3 ? 'がっつり' : '多すぎ';
    return `<button class="entry" type="button" data-id="${entry.id}" aria-label="${escapeHtml(entry.raw)}を編集">
      <time>${formatTime(entry.createdAt)}</time>
      <div class="entry-food"><strong>${entry.foods.map(escapeHtml).join('、')}</strong><small>${label} · タップして編集</small></div>
      <span class="point-badge ${entry.score >= 4 ? 'high' : ''}">+${entry.score}</span>
    </button>`;
  }

  function renderHistory() {
    const groups = new Map();
    [...state.entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).forEach((entry) => {
      const key = dayKey(entry.createdAt);
      if (!groups.has(key)) groups.set(key, { entries: [], activities: [] });
      groups.get(key).entries.push(entry);
    });
    [...state.activities].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).forEach((activity) => {
      const key = dayKey(activity.createdAt);
      if (!groups.has(key)) groups.set(key, { entries: [], activities: [] });
      groups.get(key).activities.push(activity);
    });
    const overDays = [...groups.keys()].filter((key) => scoreFor(key) >= state.threshold).length;
    $('#totalDays').textContent = groups.size;
    $('#totalEntries').textContent = state.entries.length;
    $('#totalLaps').textContent = state.activities.reduce((sum, activity) => sum + activity.laps, 0);
    $('#overDays').textContent = overDays;
    $('#historyList').innerHTML = groups.size ? [...groups].sort(([a], [b]) => b.localeCompare(a)).map(([key, group]) => {
      const entries = group.entries;
      const activities = group.activities;
      const score = entries.reduce((sum, entry) => sum + entry.score, 0);
      const laps = activities.reduce((sum, activity) => sum + activity.laps, 0);
      return `<section class="day-group"><div class="day-header"><h2>${formatDay(key)}</h2><span class="${score >= state.threshold ? 'over-text' : ''}">${score} / ${state.threshold}${score >= state.threshold ? ' · 食べすぎ' : ''}</span></div>
        ${activities.length ? `<div class="history-exercise-head"><span>運動</span><strong>${laps}周</strong></div>${activities.map((activity) => activityMarkup(activity, true)).join('')}` : ''}
        ${entries.map(entryMarkup).join('')}
      </section>`;
    }).join('') : `<div class="empty-state"><strong>履歴はまだありません。</strong><span>記録すると、ここに日ごとに並びます。</span></div>`;
  }

  function renderSettings(mode = '') {
    $('#thresholdInput').value = state.threshold;
    $('#thresholdOutput').textContent = state.threshold;
    if (document.activeElement !== $('#syncUrl')) $('#syncUrl').value = state.syncUrl;
    const pending = state.syncQueue.length;
    const status = $('#syncStatus');
    const dot = $('#syncDot');
    dot.className = 'sync-dot';
    if (!state.syncUrl) {
      status.textContent = pending ? `${pending}件を端末内に保存中` : '未設定・端末内に保存中';
    } else if (mode === 'syncing') {
      status.textContent = `${pending}件を同期中…`;
      dot.classList.add('pending');
    } else if (pending) {
      status.textContent = `${pending}件が同期待ち`;
      dot.classList.add('pending');
    } else {
      status.textContent = '同期済み';
      dot.classList.add('ready');
    }
  }

  function render() {
    renderToday();
    renderHistory();
    renderSettings();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  function updatePreview() {
    foodInput.style.height = 'auto';
    foodInput.style.height = `${foodInput.scrollHeight}px`;
    const foods = parseFoods(foodInput.value);
    $('#parsedPreview').innerHTML = foods.length > 1 ? foods.map((food) => `<span class="food-chip">${escapeHtml(food)}</span>`).join('') : '';
  }

  function addEntry(score) {
    const raw = foodInput.value.trim();
    const foods = parseFoods(raw);
    if (!foods.length) {
      foodInput.focus();
      foodInput.animate([{ transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }], { duration: 180 });
      return;
    }
    const entry = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), raw, foods, score, createdAt: new Date().toISOString() };
    state.entries.push(entry);
    foodInput.value = '';
    updatePreview();
    persist();
    queueSync(syncPayload('food', entry));
    if (navigator.vibrate) navigator.vibrate(score >= 4 ? [20, 40, 20] : 20);
    showToast(scoreFor(dayKey()) >= state.threshold ? '食べすぎたぜえ。。。' : '記録しました');
  }

  function saveExercise() {
    const activity = {
      id: crypto.randomUUID ? crypto.randomUUID() : `activity-${Date.now()}`,
      course: selectedCourse,
      laps: selectedLaps,
      createdAt: new Date().toISOString()
    };
    state.activities.push(activity);
    persist();
    queueSync(syncPayload('exercise', activity));
    if (navigator.vibrate) navigator.vibrate(20);
    showToast(`${selectedCourse === 'large' ? '大回り' : '小回り'} ${selectedLaps}周を記録`);
    selectedLaps = 1;
    renderExerciseControls();
  }

  function renderExerciseControls() {
    $$('.course-toggle button').forEach((button) => {
      const active = button.dataset.course === selectedCourse;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    $('#lapOutput').innerHTML = `<strong>${selectedLaps}</strong><span>周</span>`;
    $('#lapMinus').disabled = selectedLaps <= 1;
  }

  function openEditor(id) {
    const entry = state.entries.find((item) => item.id === id);
    if (!entry) return;
    editingId = id;
    $('#editFood').value = entry.raw;
    $('#editScore').value = entry.score;
    editDialog.showModal();
  }

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 1700);
  }

  function switchView(viewId) {
    $$('.view').forEach((view) => view.classList.toggle('active', view.id === viewId));
    $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.view === viewId));
    composer.classList.toggle('hidden', viewId !== 'todayView');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  foodInput.addEventListener('input', updatePreview);
  $$('.weight-buttons button').forEach((button) => button.addEventListener('click', () => addEntry(Number(button.dataset.score))));
  $$('.course-toggle button').forEach((button) => button.addEventListener('click', () => {
    selectedCourse = button.dataset.course;
    renderExerciseControls();
  }));
  $('#lapMinus').addEventListener('click', () => { selectedLaps = Math.max(1, selectedLaps - 1); renderExerciseControls(); });
  $('#lapPlus').addEventListener('click', () => { selectedLaps = Math.min(99, selectedLaps + 1); renderExerciseControls(); });
  $('#saveExercise').addEventListener('click', saveExercise);
  $$('.nav-item').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.view)));
  $('#openSettings').addEventListener('click', () => switchView('settingsView'));
  $('#focusInput').addEventListener('click', () => { switchView('todayView'); setTimeout(() => foodInput.focus(), 100); });

  document.addEventListener('click', (event) => {
    const activityDelete = event.target.closest('.activity-delete');
    if (activityDelete) {
      const deleted = state.activities.find((activity) => activity.id === activityDelete.dataset.activityId);
      state.activities = state.activities.filter((activity) => activity.id !== activityDelete.dataset.activityId);
      persist();
      if (deleted) queueSync(syncPayload('exercise', deleted, 'delete'));
      showToast('運動記録を削除しました');
      return;
    }
    const entry = event.target.closest('.entry');
    if (entry) openEditor(entry.dataset.id);
  });
  $('#editForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const entry = state.entries.find((item) => item.id === editingId);
    const raw = $('#editFood').value.trim();
    if (!entry || !raw) return;
    entry.raw = raw;
    entry.foods = parseFoods(raw);
    entry.score = Number($('#editScore').value);
    editDialog.close();
    persist();
    queueSync(syncPayload('food', entry));
    showToast('更新しました');
  });
  $('#cancelEdit').addEventListener('click', () => editDialog.close());
  $('#deleteEntry').addEventListener('click', () => {
    const deleted = state.entries.find((item) => item.id === editingId);
    state.entries = state.entries.filter((item) => item.id !== editingId);
    editDialog.close();
    persist();
    if (deleted) queueSync(syncPayload('food', deleted, 'delete'));
    showToast('削除しました');
  });

  function setThreshold(value) {
    state.threshold = Math.max(5, Math.min(15, Number(value)));
    persist();
  }
  $('#thresholdInput').addEventListener('input', (event) => setThreshold(event.target.value));
  $$('.stepper button').forEach((button) => button.addEventListener('click', () => setThreshold(state.threshold + Number(button.dataset.step))));
  $('#saveSyncSettings').addEventListener('click', () => {
    const url = $('#syncUrl').value.trim();
    if (url && !/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(url)) {
      showToast('ウェブアプリURLを確認してください');
      return;
    }
    state.syncUrl = url;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (url) {
      queueAllForSync();
      showToast('同期を開始しました');
    } else {
      renderSettings();
      showToast('端末内保存に切り替えました');
    }
  });
  window.addEventListener('online', flushSyncQueue);

  render();
  renderExerciseControls();
  flushSyncQueue();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./service-worker.js');
})();
