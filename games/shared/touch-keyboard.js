"use strict";

// An on-screen keyboard for names and lobby codes. It's built from plain buttons with no text box,
// so an iPad never slides its own keyboard up over the game. Physical keyboards work too.
//
//   showTouchKeyboard({ title: 'Your name', value: 'SAM', maxLength: 12, picks: [...], onDone(text) {}, onCancel() {} });

const KEYBOARD_ROWS = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

function addKeyboardStyles() {
    if (document.getElementById('touchKeyboardStyles')) return;
    const css = document.createElement('style');
    css.id = 'touchKeyboardStyles';
    css.textContent =
        '.tk-screen{position:fixed;inset:0;z-index:50;display:grid;place-items:center;padding:10px;background:rgba(5,7,14,.8);font-family:system-ui,-apple-system,sans-serif;' +
        'color:#f1f5f9;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:manipulation}' +
        '.tk-box{width:min(620px,100%);max-height:100%;overflow:auto;padding:14px;border:1px solid rgba(255,255,255,.15);border-radius:16px;background:#111522}' +
        '.tk-title{margin:0 0 8px;font-size:16px;font-weight:700}' +
        '.tk-value{min-height:50px;padding:8px 12px;margin-bottom:8px;border-radius:10px;background:#05070e;font:800 26px ui-monospace,monospace;letter-spacing:.08em}' +
        '.tk-value.empty{color:#64748b;font-weight:500}' +
        '.tk-picks{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}' +
        '.tk-box button{font:inherit;font-weight:700;color:#f1f5f9;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.14);border-radius:9px;cursor:pointer;touch-action:manipulation}' +
        '.tk-box button:active{background:rgba(255,255,255,.28)}' +
        '.tk-picks button{padding:7px 10px;font-size:13px}' +
        '.tk-row{display:flex;justify-content:center;gap:4px;margin-bottom:4px}' +
        '.tk-row button{flex:1 1 0;min-width:0;max-width:56px;height:clamp(38px,8vh,50px);padding:0;font-size:17px}' +
        '.tk-actions{display:flex;gap:6px;margin-top:6px}' +
        '.tk-actions button{flex:1;height:46px}' +
        '.tk-actions .tk-ok{flex:1.4;background:#f97316;border-color:#f97316}';
    document.head.appendChild(css);
}

function showTouchKeyboard(options) {
    addKeyboardStyles();
    const maxLength = options.maxLength || 12;
    let text = (options.value || '').toUpperCase().slice(0, maxLength);

    const screen = document.createElement('div');
    screen.className = 'tk-screen';
    const box = document.createElement('div');
    box.className = 'tk-box';
    screen.appendChild(box);

    const title = document.createElement('p');
    title.className = 'tk-title';
    title.textContent = options.title;
    const shown = document.createElement('div');
    box.append(title, shown);

    function refresh() {
        shown.className = 'tk-value' + (text ? '' : ' empty');
        shown.textContent = text || 'Tap the letters';
        ok.disabled = !text.trim() || (options.exactLength && text.length !== options.exactLength);
    }
    function close() {
        document.removeEventListener('keydown', onKey, true);
        screen.remove();
    }
    function press(letter) {
        if (text.length < maxLength) { text += letter; refresh(); }
    }
    function backspace() { text = text.slice(0, -1); refresh(); }
    function finish() {
        if (ok.disabled) return;
        close();
        options.onDone(text.trim());
    }
    function cancel() {
        close();
        if (options.onCancel) options.onCancel();
    }
    function button(label, action, parent, className) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        if (className) b.className = className;
        b.addEventListener('click', action);
        parent.appendChild(b);
        return b;
    }

    if (options.picks) {
        const picks = document.createElement('div');
        picks.className = 'tk-picks';
        options.picks.forEach(name => button(name, () => { text = name.slice(0, maxLength); refresh(); }, picks));
        box.appendChild(picks);
    }
    KEYBOARD_ROWS.forEach(keys => {
        const row = document.createElement('div');
        row.className = 'tk-row';
        keys.split('').forEach(letter => button(letter, () => press(letter), row));
        box.appendChild(row);
    });
    const actions = document.createElement('div');
    actions.className = 'tk-actions';
    button('Cancel', cancel, actions);
    if (!options.exactLength) button('Space', () => { if (text && !text.endsWith(' ')) press(' '); }, actions);
    button('⌫', backspace, actions);
    const ok = button(options.okLabel || 'OK', finish, actions, 'tk-ok');
    box.appendChild(actions);

    function onKey(e) {
        e.stopPropagation();
        if (e.key === 'Enter') finish();
        else if (e.key === 'Escape') cancel();
        else if (e.key === 'Backspace') backspace();
        else if (/^[a-zA-Z0-9]$/.test(e.key)) press(e.key.toUpperCase());
        else if (e.key === ' ' && !options.exactLength && text && !text.endsWith(' ')) press(' ');
        else return;
        e.preventDefault();
    }
    document.addEventListener('keydown', onKey, true);
    refresh();
    document.body.appendChild(screen);
}
