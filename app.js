const PLAYER_MAX_HP = 5;
const MONSTER_MAX_HP = 10;
const MONSTER_ROTATION = ["🐲", "👾", "🦇", "🦂", "👹", "🧟"];
const QUESTION_TIME_LIMIT_MS = 5000;
const ANSWER_EFFECT_DELAY_MS = 500;
const LEVEL_CLEAR_DELAY_MS = 2000;
const BOSS_WARNING_DELAY_MS = 1200;
const BOSS_LEVEL_INTERVAL = 5;
const WRONG_WORDS_STORAGE_KEY = "wordMonsterWrongWords";
const LEVEL_TITLES = [
  "Vocabulary Hunter Unlocked",
  "Meaning Breaker Unlocked",
  "Grammar Knight Unlocked",
  "Reading Ranger Unlocked",
  "Context Master Unlocked",
  "Boss Arena Unlocked",
];
const DUNGEON_DEFINITIONS = [
  { id: "all", name: "전체 던전", description: "모든 단어를 섞어서 출제합니다.", type: "all" },
  ...Array.from({ length: 28 }, (_, index) => {
    const question = 18 + index;
    return {
      id: `question-${question}`,
      name: `2026년 6월 고1 ${question}번 던전`,
      description: `${question}번 문항 단어만 출제합니다.`,
      type: "question",
      question,
    };
  }),
  { id: "difficulty-easy", name: "Easy 던전", description: "Easy 난이도만 출제합니다.", type: "difficulty", difficulty: "Easy" },
  { id: "difficulty-normal", name: "Normal 던전", description: "Normal 난이도만 출제합니다.", type: "difficulty", difficulty: "Normal" },
  { id: "difficulty-hard", name: "Hard 던전", description: "Hard 난이도만 출제합니다.", type: "difficulty", difficulty: "Hard" },
  { id: "review", name: "오답 복습 던전", description: "저장된 오답만 출제합니다.", type: "review" },
];

let currentMode = "기초 모드";

const state = {
  masterWords: [],
  allWords: [],
  remainingWords: [],
  currentWord: null,
  currentQuestionMode: "basic",
  selectedDungeon: null,
  playerHp: PLAYER_MAX_HP,
  monsterHp: MONSTER_MAX_HP,
  monsterLevel: 1,
  defeatedMonsters: 0,
  score: 0,
  combo: 0,
  maxCombo: 0,
  correctCount: 0,
  wrongCount: 0,
  answered: false,
  timerMsLeft: QUESTION_TIME_LIMIT_MS,
  timerIntervalId: null,
  nextQuestionTimeoutId: null,
  isLevelTransition: false,
  reviewMode: false,
  wrongWordRecords: [],
};

const els = {
  mainTitle: document.getElementById("mainTitle"),
  currentModeText: document.getElementById("currentModeText"),
  currentDungeonText: document.getElementById("currentDungeonText"),
  startOverlay: document.getElementById("startOverlay"),
  startMessage: document.getElementById("startMessage"),
  dungeonButtons: document.getElementById("dungeonButtons"),
  levelClearOverlay: document.getElementById("levelClearOverlay"),
  levelClearCard: document.getElementById("levelClearCard"),
  levelClearEmoji: document.getElementById("levelClearEmoji"),
  levelClearTitle: document.getElementById("levelClearTitle"),
  levelClearSubtitle: document.getElementById("levelClearSubtitle"),
  expGainText: document.getElementById("expGainText"),
  nextLevelText: document.getElementById("nextLevelText"),
  bossWarningOverlay: document.getElementById("bossWarningOverlay"),
  statusText: document.getElementById("statusText"),
  timerText: document.getElementById("timerText"),
  timerBar: document.getElementById("timerBar"),
  playerHpText: document.getElementById("playerHpText"),
  monsterHpText: document.getElementById("monsterHpText"),
  playerHpBar: document.getElementById("playerHpBar"),
  monsterHpBar: document.getElementById("monsterHpBar"),
  scoreText: document.getElementById("scoreText"),
  defeatedCount: document.getElementById("defeatedCount"),
  comboText: document.getElementById("comboText"),
  correctCount: document.getElementById("correctCount"),
  wrongCount: document.getElementById("wrongCount"),
  remainingCount: document.getElementById("remainingCount"),
  monsterTitle: document.getElementById("monsterTitle"),
  monsterLevelBadge: document.getElementById("monsterLevelBadge"),
  comboBadge: document.getElementById("comboBadge"),
  monsterSprite: document.getElementById("monsterSprite"),
  battleEffect: document.getElementById("battleEffect"),
  questionBadge: document.getElementById("questionBadge"),
  difficultyBadge: document.getElementById("difficultyBadge"),
  headwordText: document.getElementById("headwordText"),
  posText: document.getElementById("posText"),
  answers: document.getElementById("answers"),
  resultPanel: document.getElementById("resultPanel"),
  resultTitle: document.getElementById("resultTitle"),
  finalCorrect: document.getElementById("finalCorrect"),
  finalWrong: document.getElementById("finalWrong"),
  finalAccuracy: document.getElementById("finalAccuracy"),
  finalGrade: document.getElementById("finalGrade"),
  finalScore: document.getElementById("finalScore"),
  finalDefeated: document.getElementById("finalDefeated"),
  finalMaxCombo: document.getElementById("finalMaxCombo"),
  finalLevel: document.getElementById("finalLevel"),
  finalDungeon: document.getElementById("finalDungeon"),
  resultMessage: document.getElementById("resultMessage"),
  restartButton: document.getElementById("restartButton"),
};

const soundEffects = {
  enabled: false,
  play(name) {
    if (!this.enabled) {
      return;
    }
    console.debug("sound effect placeholder:", name);
  },
};

const modeButtons = [...document.querySelectorAll(".mode-button")];

function setCurrentMode(mode) {
  currentMode = mode;
  els.currentModeText.textContent = `현재 모드: ${currentMode}`;
  modeButtons.forEach((button) => {
    button.classList.toggle("selected", button.dataset.mode === mode);
  });
}

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setCurrentMode(button.dataset.mode);
  });
});

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function loadWords() {
  let data;

  try {
    const response = await fetch("./game_words.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load game_words.json: ${response.status}`);
    }
    data = await response.json();
  } catch (fetchError) {
    const imported = await import("./game_words.json", { with: { type: "json" } });
    data = imported.default;
    console.warn("fetch load failed, fell back to JSON import", fetchError);
  }

  if (!data?.words || !Array.isArray(data.words)) {
    throw new Error("game_words.json 형식이 올바르지 않습니다.");
  }

  const seen = new Set();
  return data.words.filter((word) => {
    const hasHeadword = typeof word.headword === "string" && word.headword.trim() !== "";
    const hasPos = typeof word.pos === "string" && word.pos.trim() !== "";
    const hasCorrect = typeof word.correct_answer === "string" && word.correct_answer.trim() !== "";
    const hasOptions = Array.isArray(word.answer_options) && word.answer_options.length > 1;
    const includesCorrect = hasOptions && word.answer_options.includes(word.correct_answer);
    const notHeaderRow = !(word.headword === "영어" && word.correct_answer === "한국어 뜻");
    const uniqueKey = `${word.headword}__${word.pos}`;

    if (!(hasHeadword && hasPos && hasCorrect && hasOptions && includesCorrect && notHeaderRow)) {
      return false;
    }
    if (seen.has(uniqueKey)) {
      return false;
    }
    seen.add(uniqueKey);
    return true;
  });
}

function currentMonsterEmoji() {
  return MONSTER_ROTATION[(state.monsterLevel - 1) % MONSTER_ROTATION.length];
}

function comboLabel() {
  if (state.combo >= 10) return "Legendary Combo";
  if (state.combo >= 5) return "Combo x5";
  if (state.combo >= 3) return "Combo x3";
  return state.combo > 0 ? `Combo x${state.combo}` : "No Combo";
}

function isBossLevel(level) {
  return level % BOSS_LEVEL_INTERVAL === 0;
}

function nextLevelTitle(level) {
  return LEVEL_TITLES[(level - 1) % LEVEL_TITLES.length];
}

function findDungeonById(id) {
  return DUNGEON_DEFINITIONS.find((dungeon) => dungeon.id === id) ?? null;
}

function getWrongWordKey(item) {
  return `${item.headword}__${item.pos}`;
}

function loadWrongWordRecords() {
  try {
    const raw = localStorage.getItem(WRONG_WORDS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item) =>
      item &&
      typeof item.headword === "string" &&
      typeof item.correct_answer === "string" &&
      typeof item.pos === "string"
    );
  } catch (error) {
    console.warn("failed to load wrong words", error);
    return [];
  }
}

function persistWrongWordRecords(records) {
  state.wrongWordRecords = records;
  localStorage.setItem(WRONG_WORDS_STORAGE_KEY, JSON.stringify(records));
}

function hasPendingWrongWords() {
  return loadWrongWordRecords().length > 0;
}

function saveWrongWord(word, playerAnswer) {
  const current = loadWrongWordRecords();
  const key = getWrongWordKey(word);
  const existing = current.find((item) => getWrongWordKey(item) === key);
  const nextRecord = {
    headword: word.headword,
    pos: word.pos,
    correct_answer: word.correct_answer,
    player_answer: playerAnswer ?? "시간 초과",
    answer_options: Array.isArray(word.answer_options) ? word.answer_options : [],
    source_questions: Array.isArray(word.source_questions) ? word.source_questions : [],
    difficulty: word.difficulty ?? "",
    wrong_count: (existing?.wrong_count ?? 0) + 1,
    last_wrong_at: new Date().toISOString(),
  };
  const updated = current.filter((item) => getWrongWordKey(item) !== key);
  updated.push(nextRecord);
  persistWrongWordRecords(updated);
}

function removeWrongWord(word) {
  const current = loadWrongWordRecords();
  const key = getWrongWordKey(word);
  const updated = current.filter((item) => getWrongWordKey(item) !== key);
  persistWrongWordRecords(updated);
}

function buildReviewWords(allWords, wrongRecords) {
  const byKey = new Map(allWords.map((word) => [getWrongWordKey(word), word]));
  return wrongRecords
    .map((record) => byKey.get(getWrongWordKey(record)))
    .filter(Boolean);
}

function getWordsForDungeon(dungeon) {
  if (!dungeon) {
    return [];
  }

  if (dungeon.type === "all") {
    return state.masterWords;
  }

  if (dungeon.type === "question") {
    return state.masterWords.filter(
      (word) => Array.isArray(word.source_questions) && word.source_questions.includes(dungeon.question)
    );
  }

  if (dungeon.type === "difficulty") {
    return state.masterWords.filter((word) => word.difficulty === dungeon.difficulty);
  }

  if (dungeon.type === "review") {
    return buildReviewWords(state.masterWords, loadWrongWordRecords());
  }

  return [];
}

function showStartOverlay(message) {
  els.startMessage.textContent = message;
  els.startOverlay.hidden = false;
}

function hideStartOverlay() {
  els.startOverlay.hidden = true;
}

function updateDungeonText() {
  const name = state.selectedDungeon?.name ?? "선택 대기 중";
  els.currentDungeonText.textContent = `현재 던전: ${name}`;
  els.finalDungeon.textContent = name;
}

function renderDungeonButtons() {
  const locked = hasPendingWrongWords();
  els.dungeonButtons.innerHTML = "";

  DUNGEON_DEFINITIONS.forEach((dungeon) => {
    const isReview = dungeon.type === "review";
    const isLocked = locked && !isReview;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `dungeon-button${isLocked ? " locked" : ""}${isReview ? " review" : ""}`;
    button.setAttribute("aria-disabled", String(isLocked));
    button.innerHTML = `<span>${dungeon.name}${isLocked ? " - 잠김" : ""}</span><span class="sub">${dungeon.description}</span>`;
    button.addEventListener("click", () => handleDungeonSelection(dungeon.id, isLocked));
    els.dungeonButtons.appendChild(button);
  });
}

function applyModePresentation() {
  if (state.reviewMode) {
    els.mainTitle.textContent = "오답 복습 던전";
    updateStatus("이전 게임에서 틀린 단어를 모두 맞혀야 새 게임이 열립니다.");
    return;
  }
  els.mainTitle.textContent = "Word Monster Battle";
}

function showLockedStartOverlay(customMessage = null) {
  const count = loadWrongWordRecords().length;
  renderDungeonButtons();
  showStartOverlay(
    customMessage ??
      `지난번 오답 ${count}개가 남아 있습니다.\n오답 복습을 모두 통과해야 새 게임을 시작할 수 있습니다.`
  );
}

function showUnlockedStartOverlay(message = "원하는 던전을 선택해 전투를 시작하세요.") {
  renderDungeonButtons();
  showStartOverlay(message);
}

function stopQuestionTimer() {
  if (state.timerIntervalId) {
    clearInterval(state.timerIntervalId);
    state.timerIntervalId = null;
  }
}

function clearPendingNextQuestion() {
  if (state.nextQuestionTimeoutId) {
    clearTimeout(state.nextQuestionTimeoutId);
    state.nextQuestionTimeoutId = null;
  }
}

function toggleAnswerButtons(disabled) {
  [...els.answers.querySelectorAll(".answer-button")].forEach((button) => {
    button.disabled = disabled;
  });
}

function renderTimer() {
  const seconds = Math.max(0, state.timerMsLeft) / 1000;
  const ratio = Math.max(0, state.timerMsLeft) / QUESTION_TIME_LIMIT_MS;
  els.timerText.textContent = `${seconds.toFixed(1)}초`;
  els.timerBar.style.width = `${ratio * 100}%`;

  els.timerText.classList.remove("warn", "danger", "blink");
  els.timerBar.classList.remove("warn", "danger");

  if (state.timerMsLeft <= 2000) {
    els.timerText.classList.add("danger", "blink");
    els.timerBar.classList.add("danger");
  } else if (state.timerMsLeft <= 3500) {
    els.timerText.classList.add("warn");
    els.timerBar.classList.add("warn");
  }
}

function startQuestionTimer() {
  stopQuestionTimer();
  state.timerMsLeft = QUESTION_TIME_LIMIT_MS;
  renderTimer();

  const startedAt = performance.now();
  state.timerIntervalId = window.setInterval(() => {
    const elapsed = performance.now() - startedAt;
    state.timerMsLeft = Math.max(0, QUESTION_TIME_LIMIT_MS - elapsed);
    renderTimer();

    if (state.timerMsLeft <= 0) {
      stopQuestionTimer();
      handleAnswer(null);
    }
  }, 100);
}

function scheduleNextQuestion() {
  clearPendingNextQuestion();
  state.nextQuestionTimeoutId = window.setTimeout(() => {
    state.nextQuestionTimeoutId = null;
    nextQuestion();
  }, ANSWER_EFFECT_DELAY_MS);
}

function showLevelClearOverlay({ boss, expGain, nextLevel }) {
  els.levelClearOverlay.hidden = false;
  els.levelClearCard.classList.toggle("boss", boss);
  els.levelClearEmoji.textContent = boss ? "👑" : "🎉";
  els.levelClearTitle.textContent = "Congratulations!";
  els.levelClearSubtitle.textContent = boss ? "Boss Defeated!" : "Level Clear!";
  els.expGainText.textContent = `+${expGain} EXP`;
  els.nextLevelText.textContent = nextLevel;
}

function hideLevelClearOverlay() {
  els.levelClearOverlay.hidden = true;
  els.levelClearCard.classList.remove("boss");
}

function showBossWarningOverlay() {
  els.bossWarningOverlay.hidden = false;
  document.body.classList.add("boss-warning-mode", "screen-shake");
  els.monsterLevelBadge.classList.add("boss-warning-badge");
}

function hideBossWarningOverlay() {
  els.bossWarningOverlay.hidden = true;
  document.body.classList.remove("boss-warning-mode");
  els.monsterLevelBadge.classList.remove("boss-warning-badge");
}

function setClearBackgroundMode(boss) {
  document.body.classList.remove("clear-mode", "boss-clear-mode");
  document.body.classList.add(boss ? "boss-clear-mode" : "clear-mode");
}

function clearBackgroundMode() {
  document.body.classList.remove("clear-mode", "boss-clear-mode", "screen-shake");
}

function triggerScreenShake() {
  document.body.classList.remove("screen-shake");
  void document.body.offsetWidth;
  document.body.classList.add("screen-shake");
}

function showBattleEffect(text, variant) {
  els.battleEffect.textContent = text;
  els.battleEffect.className = `battle-effect ${variant}`;
  void els.battleEffect.offsetWidth;
  els.battleEffect.classList.add("show");
}

function animateMonster(type) {
  els.monsterSprite.classList.remove("hit", "attack");
  void els.monsterSprite.offsetWidth;
  els.monsterSprite.classList.add(type);
}

function renderStats() {
  renderTimer();
  els.playerHpText.textContent = `${state.playerHp} / ${PLAYER_MAX_HP}`;
  els.monsterHpText.textContent = `${state.monsterHp} / ${MONSTER_MAX_HP}`;
  els.scoreText.textContent = String(state.score);
  els.defeatedCount.textContent = String(state.defeatedMonsters);
  els.comboText.textContent = comboLabel();
  els.correctCount.textContent = String(state.correctCount);
  els.wrongCount.textContent = String(state.wrongCount);
  els.remainingCount.textContent = String(state.remainingWords.length);
  els.playerHpBar.style.width = `${(state.playerHp / PLAYER_MAX_HP) * 100}%`;
  els.monsterHpBar.style.width = `${(state.monsterHp / MONSTER_MAX_HP) * 100}%`;
  els.monsterLevelBadge.textContent = `Lv.${state.monsterLevel}`;
  els.comboBadge.textContent = comboLabel();
  els.monsterTitle.textContent = `${currentMonsterEmoji()} Word Monster`;
  els.monsterSprite.textContent = currentMonsterEmoji();
  updateDungeonText();
}

function updateStatus(message) {
  els.statusText.textContent = message;
}

function isAdvancedMode() {
  return currentMode === "advanced" || currentMode === "실전 모드";
}

function isMixedMode() {
  return currentMode === "mixed" || currentMode === "혼합 모드";
}

function canUseAdvancedQuestion(word) {
  return (
    typeof word.english_definition === "string" &&
    word.english_definition.trim() !== "" &&
    Array.isArray(word.definition_options) &&
    word.definition_options.length > 1
  );
}

function getQuestionMode(word) {
  if (isMixedMode()) {
    return canUseAdvancedQuestion(word) && Math.random() < 0.5 ? "advanced" : "basic";
  }
  if (isAdvancedMode() && canUseAdvancedQuestion(word)) {
    return "advanced";
  }
  return "basic";
}

function getQuestionPrompt(word) {
  if (state.currentQuestionMode === "advanced" && typeof word.english_definition === "string" && word.english_definition.trim() !== "") {
    return word.english_definition;
  }
  return word.headword;
}

function getQuestionOptions(word) {
  if (state.currentQuestionMode === "advanced" && Array.isArray(word.definition_options) && word.definition_options.length > 1) {
    return word.definition_options;
  }
  return word.answer_options;
}

function getCorrectChoice(word) {
  if (state.currentQuestionMode === "advanced") {
    return word.headword;
  }
  return word.correct_answer;
}

function renderQuestion(word) {
  state.currentWord = word;
  state.currentQuestionMode = getQuestionMode(word);
  state.answered = false;
  state.isLevelTransition = false;
  els.questionBadge.textContent = `문제 ${state.correctCount + state.wrongCount + 1}`;
  els.difficultyBadge.textContent = word.difficulty ?? "-";
  els.headwordText.textContent = getQuestionPrompt(word);
  els.posText.textContent = `${word.pos} · 출처 문항 ${Array.isArray(word.source_questions) ? word.source_questions.join(", ") : "-"}`;
  els.answers.innerHTML = "";

  getQuestionOptions(word).forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "answer-button";
    button.textContent = option;
    button.addEventListener("click", () => handleAnswer(option));
    els.answers.appendChild(button);
  });

  startQuestionTimer();
}

function revealAnswers(selectedAnswer) {
  const buttons = [...els.answers.querySelectorAll(".answer-button")];
  const correctChoice = getCorrectChoice(state.currentWord);
  buttons.forEach((button) => {
    button.disabled = true;
    if (button.textContent === correctChoice) {
      button.classList.add("correct");
    } else if (button.textContent === selectedAnswer) {
      button.classList.add("wrong");
    }
  });
}

function gradeFromAccuracy(accuracy) {
  if (accuracy >= 95) return "S";
  if (accuracy >= 85) return "A";
  if (accuracy >= 75) return "B";
  if (accuracy >= 60) return "C";
  if (accuracy >= 45) return "D";
  return "F";
}

function finishGame(reason, resultTitle = "게임 종료") {
  stopQuestionTimer();
  clearPendingNextQuestion();
  hideLevelClearOverlay();
  hideBossWarningOverlay();
  clearBackgroundMode();
  state.isLevelTransition = false;

  const total = state.correctCount + state.wrongCount;
  const accuracy = total === 0 ? 0 : Math.round((state.correctCount / total) * 100);

  updateStatus(`${reason} · 정답 ${state.correctCount} / 오답 ${state.wrongCount} / 정확도 ${accuracy}%`);
  els.answers.innerHTML = "";
  els.headwordText.textContent = resultTitle;
  els.posText.textContent = "던전 선택으로 돌아가 다음 전투를 준비하세요.";
  els.questionBadge.textContent = "END";
  els.difficultyBadge.textContent = "-";
  els.resultTitle.textContent = resultTitle;
  els.finalCorrect.textContent = String(state.correctCount);
  els.finalWrong.textContent = String(state.wrongCount);
  els.finalAccuracy.textContent = `${accuracy}%`;
  els.finalGrade.textContent = gradeFromAccuracy(accuracy);
  els.finalScore.textContent = String(state.score);
  els.finalDefeated.textContent = String(state.defeatedMonsters);
  els.finalMaxCombo.textContent = String(state.maxCombo);
  els.finalLevel.textContent = String(state.monsterLevel);
  els.finalDungeon.textContent = state.selectedDungeon?.name ?? "-";
  els.resultMessage.textContent = "";

  if (!state.reviewMode) {
    const wrongCount = loadWrongWordRecords().length;
    if (wrongCount > 0) {
      els.resultMessage.textContent = `이번 게임에서 틀린 단어 ${wrongCount}개가 오답 복습 던전에 저장되었습니다.\n다음 게임을 시작하려면 먼저 오답 복습을 완료해야 합니다.`;
    }
  }

  if (state.reviewMode && loadWrongWordRecords().length === 0) {
    els.restartButton.textContent = "새 게임 시작";
  } else {
    els.restartButton.textContent = "던전 선택으로 돌아가기";
  }

  els.resultPanel.hidden = false;
}

function resetGame(words, { reviewMode = false } = {}) {
  stopQuestionTimer();
  clearPendingNextQuestion();
  hideLevelClearOverlay();
  hideBossWarningOverlay();
  clearBackgroundMode();

  state.allWords = words;
  state.remainingWords = shuffle(words).map((word) => ({
    ...word,
    sessionKey: `${word.headword}__${word.pos}`,
  }));
  state.currentWord = null;
  state.playerHp = PLAYER_MAX_HP;
  state.monsterHp = MONSTER_MAX_HP;
  state.monsterLevel = 1;
  state.defeatedMonsters = 0;
  state.score = 0;
  state.combo = 0;
  state.maxCombo = 0;
  state.correctCount = 0;
  state.wrongCount = 0;
  state.answered = false;
  state.timerMsLeft = QUESTION_TIME_LIMIT_MS;
  state.isLevelTransition = false;
  state.reviewMode = reviewMode;
  state.wrongWordRecords = loadWrongWordRecords();

  els.resultPanel.hidden = true;
  els.resultMessage.textContent = "";
  applyModePresentation();
  renderStats();
  nextQuestion();
}

function handleCorrectAnswer() {
  state.correctCount += 1;
  state.combo += 1;
  state.maxCombo = Math.max(state.maxCombo, state.combo);
  state.monsterHp = Math.max(0, state.monsterHp - 1);
  state.score += 100 + Math.min(state.combo, 10) * 10;
  animateMonster("hit");
  showBattleEffect("Critical Hit!", "critical");
}

function handleWrongAnswer() {
  state.wrongCount += 1;
  state.combo = 0;
  state.playerHp = Math.max(0, state.playerHp - 1);
  animateMonster("attack");
  showBattleEffect("Monster Attack!", "damage");
}

function startLevelClearSequence() {
  if (state.monsterHp > 0) {
    return false;
  }

  stopQuestionTimer();
  clearPendingNextQuestion();
  state.isLevelTransition = true;
  state.defeatedMonsters += 1;

  const clearedLevel = state.monsterLevel;
  const boss = isBossLevel(clearedLevel);
  const expGain = boss ? 300 : 120;
  const nextLevel = clearedLevel + 1;

  state.score += expGain;
  renderStats();
  toggleAnswerButtons(true);
  triggerScreenShake();
  setClearBackgroundMode(boss);
  showBattleEffect(boss ? "Boss Vanquished!" : "Level Clear!", boss ? "boss" : "levelup");
  showLevelClearOverlay({
    boss,
    expGain,
    nextLevel: nextLevelTitle(nextLevel),
  });
  soundEffects.play(boss ? "boss-clear" : "level-clear");
  updateStatus(
    boss
      ? `보스를 처치했습니다. ${nextLevelTitle(nextLevel)}`
      : `레벨 클리어! ${nextLevelTitle(nextLevel)}`
  );

  state.nextQuestionTimeoutId = window.setTimeout(() => {
    state.nextQuestionTimeoutId = null;
    hideLevelClearOverlay();
    clearBackgroundMode();
    state.monsterLevel = nextLevel;
    state.monsterHp = MONSTER_MAX_HP;
    renderStats();

    const startNextBattle = () => {
      state.isLevelTransition = false;
      renderStats();

      if (maybeFinishGame()) {
        return;
      }
      nextQuestion();
    };

    if (isBossLevel(nextLevel)) {
      showBossWarningOverlay();
      showBattleEffect("BOSS APPROACHING", "boss");
      updateStatus("⚠ WARNING ⚠ BOSS APPROACHING · 🐉 Vocabulary Dragon");
      soundEffects.play("boss-warning");
      state.nextQuestionTimeoutId = window.setTimeout(() => {
        state.nextQuestionTimeoutId = null;
        hideBossWarningOverlay();
        clearBackgroundMode();
        startNextBattle();
      }, BOSS_WARNING_DELAY_MS);
      return;
    }

    startNextBattle();
  }, LEVEL_CLEAR_DELAY_MS);

  return true;
}

function maybeFinishGame() {
  if (state.isLevelTransition) {
    return false;
  }

  if (state.playerHp <= 0) {
    finishGame("플레이어 HP가 모두 소진되었습니다", "Game Over");
    return true;
  }

  if (state.remainingWords.length === 0) {
    if (state.reviewMode) {
      const remainingWrongWords = loadWrongWordRecords();
      if (remainingWrongWords.length === 0) {
        finishGame("오답 복습을 모두 완료했습니다", "완벽합니다!");
        els.resultMessage.textContent = "완벽합니다!\n지난 오답을 모두 정복했습니다.\n이제 새 게임을 시작할 수 있습니다.";
      } else {
        finishGame("오답 복습 세션이 종료되었습니다", "복습 종료");
        els.resultMessage.textContent = `아직 복습할 오답 ${remainingWrongWords.length}개가 남아 있습니다.`;
      }
    } else {
      finishGame("이번 세션의 문제를 모두 사용했습니다", "전투 종료");
    }
    return true;
  }

  return false;
}

function handleAnswer(selectedAnswer) {
  if (state.answered || !state.currentWord || state.isLevelTransition) {
    return;
  }

  state.answered = true;
  stopQuestionTimer();

  const timedOut = selectedAnswer === null;
  const correctChoice = getCorrectChoice(state.currentWord);
  const isCorrect = !timedOut && selectedAnswer === correctChoice;
  revealAnswers(selectedAnswer);

  if (isCorrect) {
    handleCorrectAnswer();
    if (state.reviewMode) {
      removeWrongWord(state.currentWord);
      state.wrongWordRecords = loadWrongWordRecords();
    }
    updateStatus(`Critical Hit! "${state.currentWord.headword}"의 정답은 "${correctChoice}"입니다.`);
  } else {
    handleWrongAnswer();
    saveWrongWord(state.currentWord, selectedAnswer);
    state.wrongWordRecords = loadWrongWordRecords();
    updateStatus(
      timedOut
        ? `시간 초과! 몬스터의 공격을 받았습니다. "${state.currentWord.headword}"의 정답은 "${correctChoice}"입니다.`
        : `몬스터의 반격! "${state.currentWord.headword}"의 정답은 "${correctChoice}"입니다.`
    );
  }

  renderStats();

  if (maybeFinishGame()) {
    return;
  }

  if (isCorrect && startLevelClearSequence()) {
    return;
  }

  if (state.combo >= 10) {
    updateStatus(`${els.statusText.textContent} · Legendary Combo`);
  } else if (state.combo >= 5) {
    updateStatus(`${els.statusText.textContent} · Combo x5`);
  } else if (state.combo >= 3) {
    updateStatus(`${els.statusText.textContent} · Combo x3`);
  }

  scheduleNextQuestion();
}

function nextQuestion() {
  if (maybeFinishGame()) {
    return;
  }

  const next = state.remainingWords.shift();
  if (!next) {
    finishGame("출제할 문제가 없습니다", "전투 종료");
    return;
  }

  renderStats();
  renderQuestion(next);
  updateStatus("정답을 맞혀 몬스터를 공격하세요.");
}

function handleDungeonSelection(dungeonId, locked) {
  const dungeon = findDungeonById(dungeonId);
  if (!dungeon) {
    return;
  }

  if (locked) {
    showLockedStartOverlay("아직 정복하지 못한 오답 몬스터가 남아 있습니다.\n오답 복습을 먼저 완료해 주세요.");
    updateStatus("아직 정복하지 못한 오답 몬스터가 남아 있습니다. 오답 복습을 먼저 완료해 주세요.");
    return;
  }

  if (dungeon.type === "review" && loadWrongWordRecords().length === 0) {
    showUnlockedStartOverlay("완벽합니다!\n지난 오답을 모두 정복했습니다.\n다른 던전을 선택해 새 게임을 시작하세요.");
    updateStatus("현재 복습할 오답이 없습니다.");
    return;
  }

  const words = getWordsForDungeon(dungeon);
  if (words.length === 0) {
    showUnlockedStartOverlay("선택한 던전에 출제할 단어가 없습니다.\n다른 던전을 선택해 주세요.");
    updateStatus("선택한 던전에 단어가 없습니다.");
    return;
  }

  state.selectedDungeon = dungeon;
  hideStartOverlay();
  resetGame(words, { reviewMode: dungeon.type === "review" });
  updateDungeonText();

  if (dungeon.type === "review") {
    els.mainTitle.textContent = "오답 복습 던전";
    updateStatus("이전 게임에서 틀린 단어를 모두 맞혀야 새 게임이 열립니다.");
  } else {
    updateStatus(`${dungeon.name}에 입장했습니다. 정답을 맞혀 몬스터를 공격하세요.`);
  }
}

async function init() {
  try {
    const words = await loadWords();
    if (words.length === 0) {
      throw new Error("출제 가능한 단어가 없습니다.");
    }

    state.masterWords = words;
    state.allWords = words;
    state.wrongWordRecords = loadWrongWordRecords();
    updateDungeonText();

    if (state.wrongWordRecords.length > 0) {
      showLockedStartOverlay();
    } else {
      showUnlockedStartOverlay();
    }
  } catch (error) {
    console.error(error);
    updateStatus("단어 데이터를 불러오지 못했습니다.");
    els.headwordText.textContent = "로드 실패";
    els.posText.textContent = String(error.message ?? error);
  }
}

els.restartButton.addEventListener("click", () => {
  state.selectedDungeon = null;
  updateDungeonText();
  els.resultPanel.hidden = true;

  if (hasPendingWrongWords()) {
    showLockedStartOverlay();
  } else {
    showUnlockedStartOverlay("원하는 던전을 다시 선택해 주세요.");
  }

  updateStatus("던전 선택 화면으로 돌아왔습니다.");
});

init();
