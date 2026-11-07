"use strict";

// The MathHW homepage: topic picker, practice problems and printable worksheets.

const $ = id => document.getElementById(id);
const STORE_KEY = 'mathhw-progress';
const LEVEL_NAMES = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

// Progress is a nice extra, so it's fine if the browser won't save it.
function loadProgress() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORE_KEY));
        if (saved && Number.isFinite(saved.right) && Number.isFinite(saved.streak)) return saved;
    } catch (_) {}
    return { right: 0, streak: 0 };
}
function saveProgress() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(progress)); } catch (_) {}
}

const progress = loadProgress();
let problem = null;
let answered = false;      // only the first right answer on a problem counts
let usedHelp = false;

// ---------- Topics ----------

function fillTopics() {
    const options = Object.entries(MathHW.topics).map(([key, t]) => new Option(t.name, key));
    options.forEach(o => $('practiceTopic').add(o.cloneNode(true)));
    options.forEach(o => $('sheetTopic').add(o));

    for (const [key, topic] of Object.entries(MathHW.topics)) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'topic';
        card.innerHTML = '<span class="topic-icon"></span><span><b></b><small></small></span>';
        card.querySelector('.topic-icon').textContent = topic.icon;
        card.querySelector('b').textContent = topic.name;
        card.querySelector('small').textContent = topic.blurb;
        card.addEventListener('click', () => {
            $('practiceTopic').value = key;
            $('sheetTopic').value = key;
            newProblem();
            makeSheet();
            $('practice').scrollIntoView();
            $('answerInput').focus({ preventScroll: true });
        });
        $('topicGrid').appendChild(card);
    }
}

// ---------- Practice ----------

function showScore() {
    $('scoreRight').textContent = progress.right;
    $('scoreStreak').textContent = progress.streak;
}

function showFeedback(kind, text) {
    $('feedback').textContent = text;
    $('feedback').className = 'feedback ' + kind;
}

function showSteps() {
    const list = $('steps');
    list.textContent = '';
    problem.steps.forEach(step => {
        const item = document.createElement('li');
        item.textContent = step;
        list.appendChild(item);
    });
    list.classList.remove('hidden');
}

function newProblem() {
    problem = MathHW.newProblem($('practiceTopic').value, $('practiceLevel').value);
    answered = false;
    usedHelp = false;
    $('problemText').textContent = problem.text;
    $('answerInput').value = '';
    $('feedback').classList.add('hidden');
    $('steps').classList.add('hidden');
    $('showSteps').disabled = false;
}

function checkAnswer(event) {
    event.preventDefault();
    const typed = $('answerInput').value;
    const result = MathHW.check(problem, typed);

    if (result === 'unreadable') {
        showFeedback('wrong', 'Type a number, like 12, 3/4 or 0.5.');
    }
    else if (result === 'wrong') {
        showFeedback('wrong', 'Not quite. Try again, or see how to solve it.');
        if (!answered) { progress.streak = 0; saveProgress(); showScore(); }
    }
    else {
        const simplify = /\//.test(typed) && typed.replace(/\s/g, '') !== problem.answer.replace(/−/g, '-') && !/^-?\d+ \d+\/\d+$/.test(typed.trim());
        showFeedback('right', simplify ? `Correct! In simplest form, that’s ${problem.answer}.` : 'Correct! Nice work.');
        if (!answered && !usedHelp) {
            progress.right++;
            progress.streak++;
            saveProgress();
            showScore();
        }
        answered = true;
    }
}

// ---------- Worksheets ----------

function makeSheet() {
    const topic = $('sheetTopic').value, level = $('sheetLevel').value, count = Number($('sheetCount').value);
    const problems = [], seen = new Set();
    // Avoid repeats where we can. Some easy topics have few possible problems.
    for (let tries = 0; problems.length < count && tries < count * 40; tries++) {
        const p = MathHW.newProblem(topic, level);
        if (!seen.has(p.text)) { seen.add(p.text); problems.push(p); }
    }

    const sheet = $('sheet');
    sheet.textContent = '';
    const add = (parent, tag, className, text) => {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        parent.appendChild(el);
        return el;
    };

    add(sheet, 'h3', '', MathHW.topics[topic].name + ' Worksheet');
    const meta = add(sheet, 'div', 'sheet-meta');
    add(meta, 'span', '', LEVEL_NAMES[level] + ' · ' + problems.length + ' problems');
    add(meta, 'span', '', 'MathHW');
    const lines = add(sheet, 'div', 'sheet-lines');
    add(lines, 'span', '', 'Name:');
    add(lines, 'span', '', 'Date:');

    const list = add(sheet, 'ol', 'sheet-list');
    problems.forEach(p => add(list, 'li', '', p.text));

    if ($('sheetKey').checked) {
        const key = add(sheet, 'section', 'sheet-key');
        add(key, 'h4', '', 'Answer Key');
        const answers = add(key, 'ol');
        problems.forEach(p => add(answers, 'li', '', p.answer));
    }
}

// ---------- Dev Mode ----------
// A simple gate for the arcade page, which checks DEV_ACCESS_KEY when it opens. GitHub Pages can't
// keep real secrets, so this is only there to stop people wandering in, not to protect anything.

const DEV_PASSWORD_HASH = '9514bda5f1da3a11c1ec2b4d40252bcc327a89cc4cc0f01f673048a551333d08';
const DEV_ACCESS_KEY = 'mathhw-dev-access';

async function sha256(text) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function devMode() {
    const password = window.prompt('Enter the password');
    if (password === null) return;
    if (await sha256(password.trim()) !== DEV_PASSWORD_HASH) {
        window.alert('That password isn’t right.');
        return;
    }
    try { localStorage.setItem(DEV_ACCESS_KEY, 'yes'); } catch (_) {}
    window.location.href = 'arcade.html';
}

// ---------- Start ----------

fillTopics();
showScore();
newProblem();
makeSheet();

$('answerForm').addEventListener('submit', checkAnswer);
$('showSteps').addEventListener('click', () => {
    usedHelp = true;
    showSteps();
    $('showSteps').disabled = true;
});
$('nextProblem').addEventListener('click', () => { newProblem(); $('answerInput').focus(); });
$('practiceTopic').addEventListener('change', newProblem);
$('practiceLevel').addEventListener('change', newProblem);
['sheetTopic', 'sheetLevel', 'sheetCount', 'sheetKey'].forEach(id => $(id).addEventListener('change', makeSheet));
$('newSheet').addEventListener('click', makeSheet);
$('printSheet').addEventListener('click', () => window.print());
$('devMode').addEventListener('click', devMode);
