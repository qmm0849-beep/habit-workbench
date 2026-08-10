const STORAGE_KEY = "habit-workbench-v1";
const cycleDays = ["1", "2", "3", "4", "5", "6", "7"];

const makeId = () => crypto.randomUUID();
const starterHabits = [
  {
    id: makeId(),
    time: "每天早上 7:30",
    place: "在卧室窗边",
    action: "阅读 5 页书",
    status: "growing",
    createdAt: new Date().toISOString(),
    startOn: dateKey(new Date()),
    focusStartedOn: dateKey(new Date()),
    checks: [],
  },
  {
    id: makeId(),
    time: "每周一、三、五下班后",
    place: "在小区花园",
    action: "快走 20 分钟",
    status: "growing",
    createdAt: new Date().toISOString(),
    startOn: dateKey(new Date()),
    checks: [],
  },
  {
    id: makeId(),
    time: "每天睡觉前",
    place: "在书桌前",
    action: "写下三件值得感谢的事",
    status: "formed",
    createdAt: new Date(Date.now() - 28 * 86400000).toISOString(),
    startOn: dateKey(new Date()),
    checks: [],
  },
];

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved?.habits)) {
      const today = dateKey(new Date());
      saved.habits.forEach((habit) => {
        habit.startOn ||= habit.focusStartedOn || habit.createdAt?.slice(0, 10) || today;
      });
      const focusStillExists = saved.habits.some((habit) => habit.id === saved.focusId);
      const focusId = focusStillExists ? saved.focusId : saved.habits[0]?.id ?? null;
      const focusedHabit = saved.habits.find((habit) => habit.id === focusId);
      if (focusedHabit && !focusedHabit.focusStartedOn) {
        focusedHabit.focusStartedOn = laterDateKey(today, focusedHabit.startOn);
      }
      return {
        habits: saved.habits,
        focusId,
        smallTasks: normalizeSmallTasks(saved.smallTasks),
        honorCount: Number.isFinite(saved.honorCount) ? Math.max(0, saved.honorCount) : 0,
      };
    }
  } catch (error) {
    console.warn("无法读取本地习惯数据", error);
  }
  return { habits: starterHabits, focusId: starterHabits[0].id, smallTasks: [], honorCount: 0 };
}

let state = loadState();
let pointerDrag = null;
let toastTimer = null;

const $ = (selector) => document.querySelector(selector);
const habitList = $("#habitList");
const taskList = $("#taskList");
const composer = $("#composer");
const fields = {
  start: $("#habitStart"),
  time: $("#habitTime"),
  place: $("#habitPlace"),
  action: $("#habitAction"),
};

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatSentence(habit) {
  return `我将在${habit.time}，${habit.place}，${habit.action}。`;
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function laterDateKey(first, second) {
  return first > second ? first : second;
}

function shortDate(key) {
  const date = new Date(`${key}T00:00:00`);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function weekNumber(date = new Date()) {
  const current = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = current.getUTCDay() || 7;
  current.setUTCDate(current.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(current.getUTCFullYear(), 0, 1));
  return Math.ceil((((current - yearStart) / 86400000) + 1) / 7);
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function normalizeSmallTasks(tasks) {
  if (!Array.isArray(tasks)) return [];
  return tasks.map((task) => {
    if (!task || typeof task.title !== "string" || !task.title.trim()) return null;
    return {
      id: typeof task.id === "string" && task.id ? task.id : makeId(),
      title: task.title.trim(),
      createdAt: task.createdAt || new Date().toISOString(),
      completedAt: task.completedAt || null,
    };
  }).filter(Boolean);
}

function normalizeImportedState(payload) {
  if (!Array.isArray(payload?.habits)) throw new Error("备份文件中没有习惯列表");
  const today = dateKey(new Date());
  const habits = payload.habits.map((habit) => {
    if (!habit || typeof habit !== "object" || !habit.time || !habit.place || !habit.action) return null;
    const startOn = /^\d{4}-\d{2}-\d{2}$/.test(habit.startOn || "")
      ? habit.startOn
      : habit.focusStartedOn || habit.createdAt?.slice(0, 10) || today;
    return {
      id: typeof habit.id === "string" && habit.id ? habit.id : makeId(),
      time: String(habit.time),
      place: String(habit.place),
      action: String(habit.action),
      status: habit.status === "formed" ? "formed" : "growing",
      createdAt: habit.createdAt || new Date().toISOString(),
      startOn,
      focusStartedOn: /^\d{4}-\d{2}-\d{2}$/.test(habit.focusStartedOn || "") ? habit.focusStartedOn : undefined,
      checks: Array.isArray(habit.checks) ? habit.checks.filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item)) : [],
    };
  }).filter(Boolean);
  if (!habits.length) throw new Error("备份文件中没有可导入的有效习惯");
  const focusId = habits.some((habit) => habit.id === payload.focusId) ? payload.focusId : habits[0].id;
  const focusedHabit = habits.find((habit) => habit.id === focusId);
  focusedHabit.focusStartedOn ||= laterDateKey(today, focusedHabit.startOn);
  const smallTasks = normalizeSmallTasks(payload.smallTasks);
  const completedCount = smallTasks.filter((task) => task.completedAt).length;
  const honorCount = Number.isFinite(payload.honorCount) ? Math.max(0, payload.honorCount) : completedCount;
  return { habits, focusId, smallTasks, honorCount };
}

function exportData() {
  const backup = {
    app: "habit-workbench",
    version: 2,
    exportedAt: new Date().toISOString(),
    habits: state.habits,
    focusId: state.focusId,
    smallTasks: state.smallTasks,
    honorCount: state.honorCount,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `habit-workbench-backup-${dateKey(new Date())}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("数据备份已导出");
}

async function importData(file) {
  try {
    const payload = JSON.parse(await file.text());
    const imported = normalizeImportedState(payload);
    const confirmed = window.confirm(`将用备份中的 ${imported.habits.length} 个习惯替换当前列表，是否继续？`);
    if (!confirmed) return;
    state = imported;
    saveState();
    render();
    showToast("习惯数据已导入");
  } catch (error) {
    console.warn("导入习惯数据失败", error);
    window.alert(`无法导入：${error.message}`);
  }
}

function emptyState() {
  const node = document.createElement("div");
  node.className = "empty-state";
  node.innerHTML = "<strong>还没有习惯</strong><p>添加一个明确而简单的行动，从本周开始。</p>";
  return node;
}

function renderTasks() {
  taskList.innerHTML = "";
  const tasks = [...state.smallTasks].sort((first, second) => Number(Boolean(first.completedAt)) - Number(Boolean(second.completedAt)));
  tasks.forEach((task) => {
    const card = $("#taskCardTemplate").content.firstElementChild.cloneNode(true);
    const complete = Boolean(task.completedAt);
    card.classList.toggle("is-complete", complete);
    card.querySelector("h3").textContent = task.title;
    card.querySelector(".task-content p").textContent = complete ? "★ 已完成 · 获得荣誉星" : "等待完成";
    const check = card.querySelector(".task-check");
    check.textContent = complete ? "★" : "✓";
    check.setAttribute("aria-label", complete ? "撤销小任务完成" : "标记小任务完成");
    check.addEventListener("click", () => toggleSmallTask(task.id));
    card.querySelector(".task-delete").addEventListener("click", () => deleteSmallTask(task.id));
    taskList.append(card);
  });
  if (!tasks.length) {
    const node = document.createElement("div");
    node.className = "empty-state task-empty";
    node.innerHTML = "<strong>暂时没有小任务</strong><p>把需要一次完成的事务记在这里。</p>";
    taskList.append(node);
  }
  $("#honorCount").textContent = state.honorCount;
}

function toggleSmallTask(id) {
  const task = state.smallTasks.find((item) => item.id === id);
  if (!task) return;
  if (task.completedAt) {
    task.completedAt = null;
    state.honorCount = Math.max(0, state.honorCount - 1);
  } else {
    task.completedAt = new Date().toISOString();
    state.honorCount += 1;
    showToast("小任务完成，获得一枚荣誉星 ★");
  }
  saveState();
  renderTasks();
}

function deleteSmallTask(id) {
  state.smallTasks = state.smallTasks.filter((task) => task.id !== id);
  saveState();
  renderTasks();
  showToast("小任务已删除");
}

function setFocus(id) {
  const habit = state.habits.find((item) => item.id === id);
  if (!habit) return;
  const today = dateKey(new Date());
  state.focusId = id;
  habit.focusStartedOn = laterDateKey(today, habit.startOn || today);
  saveState();
  render();
  showToast(habit.focusStartedOn > today ? `已设为本周专注，将于${shortDate(habit.focusStartedOn)}开始` : "已设为本周专注，今天是第 1 天");
}

function makeCard(habit, index) {
  const card = $("#habitCardTemplate").content.firstElementChild.cloneNode(true);
  const isFocus = habit.id === state.focusId;
  card.dataset.id = habit.id;
  card.classList.toggle("is-formed", habit.status === "formed");
  card.classList.toggle("is-focus", isFocus);
  card.querySelector(".habit-index").textContent = String(index + 1).padStart(2, "0");
  card.querySelector("h3").textContent = habit.action;
  card.querySelector(".habit-content p").textContent = formatSentence(habit);

  const status = card.querySelector(".habit-meta");
  status.textContent = habit.status === "formed" ? "已养成" : "养成中";
  status.classList.toggle("is-formed", habit.status === "formed");
  const startMeta = card.querySelector(".start-meta");
  startMeta.textContent = `${shortDate(habit.startOn)}开始`;
  startMeta.classList.toggle("is-future", habit.startOn > dateKey(new Date()));
  card.querySelector(".focus-tag").hidden = !isFocus;

  const focusButton = card.querySelector(".focus-habit");
  focusButton.textContent = isFocus ? "★" : "☆";
  focusButton.classList.toggle("is-active", isFocus);
  focusButton.setAttribute("aria-label", isFocus ? "当前本周专注" : "设为本周专注");
  focusButton.addEventListener("click", () => setFocus(habit.id));

  const handle = card.querySelector(".drag-handle");
  handle.addEventListener("pointerdown", (event) => {
    pointerDrag = { sourceId: habit.id, targetId: habit.id, pointerId: event.pointerId };
    handle.setPointerCapture(event.pointerId);
    card.classList.add("is-dragging");
  });
  handle.addEventListener("pointermove", (event) => {
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
    const targetCard = document.elementFromPoint(event.clientX, event.clientY)?.closest(".habit-card");
    document.querySelectorAll(".drag-over").forEach((node) => node.classList.remove("drag-over"));
    if (!targetCard || targetCard.dataset.id === habit.id) return;
    pointerDrag.targetId = targetCard.dataset.id;
    targetCard.classList.add("drag-over");
  });
  const finishPointerDrag = (event, cancelled = false) => {
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
    const { sourceId, targetId } = pointerDrag;
    card.classList.remove("is-dragging");
    document.querySelectorAll(".drag-over").forEach((node) => node.classList.remove("drag-over"));
    pointerDrag = null;
    if (!cancelled && sourceId !== targetId) reorderHabit(sourceId, targetId);
  };
  handle.addEventListener("pointerup", (event) => finishPointerDrag(event));
  handle.addEventListener("pointercancel", (event) => finishPointerDrag(event, true));

  const menu = card.querySelector(".action-menu");
  card.querySelector(".more-button").addEventListener("click", (event) => {
    event.stopPropagation();
    document.querySelectorAll(".action-menu").forEach((other) => {
      if (other !== menu) other.hidden = true;
    });
    menu.hidden = !menu.hidden;
  });

  const markButton = card.querySelector(".mark-formed");
  const restoreButton = card.querySelector(".restore-habit");
  markButton.hidden = habit.status === "formed";
  restoreButton.hidden = habit.status !== "formed";
  markButton.addEventListener("click", () => setStatus(habit.id, "formed"));
  restoreButton.addEventListener("click", () => setStatus(habit.id, "growing"));
  card.querySelector(".delete-habit").addEventListener("click", () => deleteHabit(habit.id));

  return card;
}

function reorderHabit(sourceId, targetId) {
  if (!sourceId || sourceId === targetId) return;
  const sourceIndex = state.habits.findIndex((habit) => habit.id === sourceId);
  const targetIndex = state.habits.findIndex((habit) => habit.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const [moved] = state.habits.splice(sourceIndex, 1);
  const adjustedTarget = state.habits.findIndex((habit) => habit.id === targetId);
  state.habits.splice(sourceIndex < targetIndex ? adjustedTarget + 1 : adjustedTarget, 0, moved);
  saveState();
  render();
  showToast("习惯顺序已更新");
}

function setStatus(id, status) {
  const habit = state.habits.find((item) => item.id === id);
  if (!habit) return;
  habit.status = status;
  saveState();
  render();
  showToast(status === "formed" ? "已标记为已养成" : "已改为养成中");
}

function deleteHabit(id) {
  state.habits = state.habits.filter((habit) => habit.id !== id);
  if (state.focusId === id) {
    state.focusId = state.habits[0]?.id ?? null;
    if (state.habits[0]) {
      const today = dateKey(new Date());
      state.habits[0].focusStartedOn = laterDateKey(today, state.habits[0].startOn || today);
    }
  }
  saveState();
  render();
  showToast("习惯已删除");
}

function renderFocus() {
  const focus = state.habits.find((habit) => habit.id === state.focusId);
  const title = $("#focusTitle");
  const sentence = $("#focusSentence");
  const status = $("#focusStatus");
  const checkButton = $("#checkToday");
  const now = new Date();
  const today = dateKey(now);
  let cycleStart = null;
  let elapsedDays = 0;
  let notStarted = false;
  let cycleEnded = false;

  if (!focus) {
    status.textContent = "尚未设置";
    title.textContent = "还没有本周专注";
    sentence.textContent = "在下方选择一个习惯作为本周专注。";
    checkButton.disabled = true;
    checkButton.classList.remove("is-done");
    checkButton.querySelector(".check-text").textContent = "今日完成";
  } else {
    if (!focus.focusStartedOn) {
      focus.focusStartedOn = laterDateKey(today, focus.startOn || today);
      saveState();
    }
    cycleStart = new Date(`${focus.focusStartedOn}T00:00:00`);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    elapsedDays = Math.floor((todayStart - cycleStart) / 86400000);
    notStarted = elapsedDays < 0;
    cycleEnded = elapsedDays > 6;
    const startLabel = `${cycleStart.getMonth() + 1}月${cycleStart.getDate()}日起`;
    status.textContent = `${focus.status === "formed" ? "已养成" : "养成中"} · ${startLabel}`;
    title.textContent = focus.action;
    sentence.textContent = formatSentence(focus);
    checkButton.disabled = notStarted || cycleEnded;
    const done = focus.checks?.includes(today);
    checkButton.classList.toggle("is-done", done);
    checkButton.querySelector(".check-text").textContent = notStarted ? "尚未开始" : cycleEnded ? "本周期已结束" : done ? "今天已完成" : "今日完成";
  }

  const daysUntilStart = Math.abs(elapsedDays);
  $("#focusCount").textContent = !focus
    ? "等待设置"
    : notStarted
      ? daysUntilStart === 1 ? "明天开始" : `${daysUntilStart} 天后开始`
      : cycleEnded ? "7 天周期已结束" : `第 ${elapsedDays + 1} / 7 天`;
  const track = $("#weekTrack");
  track.innerHTML = "";
  cycleDays.forEach((name, index) => {
    const date = cycleStart ? new Date(cycleStart) : new Date();
    if (cycleStart) date.setDate(cycleStart.getDate() + index);
    const cell = document.createElement("div");
    cell.className = "day-cell";
    cell.title = cycleStart ? `${date.getMonth() + 1}月${date.getDate()}日` : `第${index + 1}天`;
    if (focus && dateKey(date) === today) cell.classList.add("is-today");
    if (focus?.checks?.includes(dateKey(date))) cell.classList.add("is-done");
    cell.innerHTML = `<span>${name}</span><i class="day-bar"></i>`;
    track.append(cell);
  });
}

function render() {
  habitList.innerHTML = "";
  state.habits.forEach((habit, index) => habitList.append(makeCard(habit, index)));
  if (!state.habits.length) habitList.append(emptyState());
  $("#habitCount").textContent = state.habits.length;
  renderFocus();
  renderTasks();
}

function updateFormula() {
  const time = fields.time.value.trim() || "某个时间";
  const place = fields.place.value.trim() || "某个地点";
  const action = fields.action.value.trim() || "做一件具体的小事";
  $("#formulaPreview").innerHTML = `我将在 <strong>${escapeHtml(time)}</strong>，在 <strong>${escapeHtml(place.replace(/^在/, ""))}</strong>，<strong>${escapeHtml(action)}</strong>。`;
}

function escapeHtml(value) {
  const node = document.createElement("span");
  node.textContent = value;
  return node.innerHTML;
}

function openComposer() {
  $("#habitForm").reset();
  fields.start.min = dateKey(new Date());
  fields.start.value = dateKey(new Date());
  updateFormula();
  composer.showModal();
  setTimeout(() => fields.time.focus(), 80);
}

function closeComposer() {
  composer.close();
}

$("#openComposer").addEventListener("click", openComposer);
$("#closeComposer").addEventListener("click", closeComposer);
$("#cancelComposer").addEventListener("click", closeComposer);
composer.addEventListener("click", (event) => {
  if (event.target === composer) closeComposer();
});
Object.values(fields).forEach((field) => field.addEventListener("input", updateFormula));

$("#habitForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const habit = {
    id: makeId(),
    startOn: fields.start.value,
    time: fields.time.value.trim(),
    place: fields.place.value.trim(),
    action: fields.action.value.trim(),
    status: "growing",
    createdAt: new Date().toISOString(),
    checks: [],
  };
  state.habits.push(habit);
  if (!state.focusId) {
    state.focusId = habit.id;
    habit.focusStartedOn = laterDateKey(dateKey(new Date()), habit.startOn);
  }
  saveState();
  closeComposer();
  render();
  showToast("新习惯已加入列表");
});

$("#taskForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $("#taskTitle");
  const title = input.value.trim();
  if (!title) return;
  state.smallTasks.unshift({ id: makeId(), title, createdAt: new Date().toISOString(), completedAt: null });
  input.value = "";
  saveState();
  renderTasks();
  showToast("小任务已加入");
});

$("#checkToday").addEventListener("click", () => {
  const focus = state.habits.find((habit) => habit.id === state.focusId);
  if (!focus) return;
  const today = dateKey(new Date());
  focus.checks ??= [];
  if (focus.checks.includes(today)) {
    focus.checks = focus.checks.filter((date) => date !== today);
  } else {
    focus.checks.push(today);
    showToast("今天的行动已记下");
  }
  saveState();
  render();
});

$("#exportData").addEventListener("click", exportData);
$("#importData").addEventListener("click", () => $("#importFile").click());
$("#importFile").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (file) await importData(file);
  event.target.value = "";
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".habit-actions")) {
    document.querySelectorAll(".action-menu").forEach((menu) => { menu.hidden = true; });
  }
});

const today = new Date();
$("#todayLabel").textContent = `${today.getMonth() + 1} 月 ${today.getDate()} 日 · ${new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(today)}`;
$("#weekNumber").textContent = String(weekNumber(today)).padStart(2, "0");
render();
