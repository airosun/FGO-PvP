// Builds public/index.html: the game page with every script inlined, plus the socket.io client for online rooms.
// Run: npm run build   (Render runs this on every deploy)
const fs = require('fs');
const path = require('path');
const src = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
let t = src('template.html');
const kits = src('kits.js').replace("if (typeof module !== 'undefined') module.exports = { KITS };", 'window.KITS = KITS;');
const parts = {
  __ROSTER__: src('roster.json'), __KITS__: kits, __ENGINE__: src('engine.js'), __ICONS__: src('icons.js'), __DESCRIBE__: src('describe.js'),
  __SCENES__: src('scenes.js'), __ROLES__: src('roles.js'), __UI__: src('ui.js'),
};
// socket.io's client is served by the server itself
t = t.replace('<script>__UI__</script>', '<script src="/socket.io/socket.io.js"></script>\n<script>__UI__</script>');
t = t.replace(/<title>[^<]*<\/title>/, '<title>Grand Order PvP</title>').replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '');
// a full document for standalone hosting
t = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta name="theme-color" content="#0c0c0d">\n' + t.replace('<div id="app"></div>', '</head>\n<body>\n<div id="app"></div>') + '\n</body>\n</html>\n';
for (const [k, v] of Object.entries(parts)) { if (!t.includes(k)) throw new Error('missing ' + k); t = t.split(k).join(v); }
fs.mkdirSync(path.join(__dirname, 'public'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'public', 'index.html'), t);
console.log('public/index.html', t.length, 'bytes');
