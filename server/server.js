// Office Ludo room server. The server owns all game rules and the secret boss,
// so a player's phone only ever receives what that player is allowed to know.
const http = require("http"), { WebSocketServer } = require("ws");
const srv = http.createServer((q, r) => r.end("ok"));
const wss = new WebSocketServer({ server: srv });
const rooms = {};
const JOKES = ["\"അഞ്ച് മണിക്ക് മീറ്റിംഗ് ഉണ്ട്!\" 📞", "\"ലീവ് ലെറ്റർ റിജക്റ്റഡ്!\" 📄", "\"സെർവർ ഡൗൺ ആണ്!\" 💻", "\"ഇന്ന് ഓവർടൈം!\" 🌙"];
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const seatOf = (p, n) => Math.round(p * 8 / n) % 8;
const safe = i => i % 8 === 0 || i % 8 === 4;
const chaosFor = (G, i) => G.round <= G.chaosEnd && i !== G.boss;
const say = (R, t) => { R.G.log.unshift(t); R.G.log = R.G.log.slice(0, 6); };

function view(R) {
  const G = R.G, host = R.players[R.host] && R.players[R.host].online ? R.host : R.players.findIndex(p => p.online);
  return {
    phase: !G ? "lobby" : G.over ? "over" : "play", room: R.code, host,
    players: R.players.map(p => ({ name: p.name, seat: p.seat, tokens: p.tokens, boost: p.boost, online: p.online })),
    ...(G ? { T: G.T, turn: G.turn, round: G.round, roll: G.roll, movable: G.movable, back: G.back, ev: G.ev.state, chaosEnd: G.chaosEnd, log: G.log, winner: G.winner } : {})
  };
}
function send(R, extra = {}) {
  const s = view(R), G = R.G;
  R.players.forEach((p, i) => {
    if (!p.ws || p.ws.readyState !== 1) return;
    const secret = G && G.ev.state === "on" && G.boss === i ? { end: G.ev.end } : null; // only the boss gets this
    p.ws.send(JSON.stringify({ type: "state", you: i, s, secret, ...extra }));
  });
}
function startGame(R, T) {
  const n = R.players.length;
  R.players.forEach((p, i) => { p.seat = seatOf(i, n); p.tokens = Array(T).fill(-1); p.boost = 0; p.cm = 0; });
  R.G = { T, turn: 0, round: 1, roll: null, movable: [], back: false, over: false, winner: null, boss: null, chaosEnd: 0, steps: 0, seq: 0, log: ["കളി തുടങ്ങി! എല്ലാ കരുക്കളും ആദ്യം ക്യാബിനിൽ എത്തിക്കുന്നവർ ജയിക്കും."], ev: { state: "wait", start: rnd(2, 4), len: rnd(3, 5), end: 0 } };
  send(R); sched(R);
}
function sched(R) { // offline players are auto-played so the game never stalls
  const G = R.G; if (!G || G.over) return;
  const t = G.turn;
  if (!R.players[t].online) setTimeout(() => { if (R.G === G && G.turn === t && G.roll == null && !G.over && !R.players[t].online) roll(R, t); }, 2000);
}
function roll(R, pi) {
  const G = R.G; if (!G || G.over || pi !== G.turn || G.roll != null) return;
  const P = R.players[pi], r = rnd(1, 6), seq = ++G.seq;
  G.roll = r; G.steps = r + (P.boost ? 3 : 0);
  if (P.boost) say(R, `${P.name} പ്രമോഷൻ ഉപയോഗിച്ചു: +3 ചുവട്.`);
  P.boost = 0; G.back = false;
  if (chaosFor(G, pi)) { P.cm++; if (P.cm % 3 === 0 && P.tokens.some(p => p > 0 && p < 60)) { G.back = true; say(R, `ഓഫീസ് ബഹളം! ${P.name}ന്റെ ചാട്ടം പിന്നോട്ടാണ്, വെട്ടാൻ പറ്റില്ല.`); } }
  G.movable = P.tokens.map((p, t) => t).filter(t => { const p = P.tokens[t]; return G.back ? (p > 0 && p < 60) : (p < 0 ? r === 6 : p + r <= 64); });
  send(R, { rolled: true });
  if (!G.movable.length) { say(R, `${P.name} ${r} ഇട്ടു: നീക്കാൻ ഒന്നുമില്ല.`); setTimeout(() => { if (G.seq === seq) next(R, {}); }, 1500); }
  else if (G.movable.length === 1 || !P.online) setTimeout(() => { if (G.seq === seq) pick(R, pi, G.movable[0]); }, 1300);
}
function pick(R, pi, t) {
  const G = R.G; if (!G || G.over || pi !== G.turn || G.roll == null || !G.movable.includes(t)) return;
  G.seq++;
  const P = R.players[pi], s = P.seat * 8, from = P.tokens[t], roll = G.roll, fx = [];
  let to, cap = false;
  if (from < 0) to = 0; else if (G.back) to = Math.max(0, from - roll); else to = Math.min(64, from + G.steps);
  P.tokens[t] = to;
  if (!G.back && to >= 0 && to < 60 && !safe((s + to) % 64)) {
    const idx = (s + to) % 64;
    R.players.forEach((Q, qi) => { if (qi === pi) return; Q.tokens.forEach((qp, qt) => {
      if (qp >= 0 && qp < 60 && (Q.seat * 8 + qp) % 64 === idx) {
        Q.tokens[qt] = -1; cap = true; fx.push("capture");
        say(R, `${P.name}, ${Q.name}ന്റെ കരു വെട്ടി. ${JOKES[rnd(0, 3)]}`);
        if (G.ev.state === "on" && qi === G.boss) { G.ev.state = "done"; P.boost = 1; fx.push("boss"); say(R, `${Q.name} ആയിരുന്നു ബോസ്! ${P.name}ന് പ്രമോഷൻ (അടുത്ത ഏറിൽ +3).`); }
      } }); });
  }
  const mv = { pi, t, from, to };
  if (P.tokens.every(p => p === 64)) { G.over = true; G.winner = pi; say(R, `${P.name} ജയിച്ചു! 🏆`); send(R, { mv, fx }); return; }
  G.roll = null; G.movable = [];
  if (roll === 6 || cap || to === 64) { say(R, `${P.name} വീണ്ടും ഇടുന്നു.`); send(R, { mv, fx }); sched(R); }
  else next(R, { mv, fx });
}
function next(R, extra) {
  const G = R.G; G.roll = null; G.movable = []; G.turn = (G.turn + 1) % R.players.length;
  extra.fx = extra.fx || [];
  if (G.turn === 0) {
    G.round++; const e = G.ev;
    if (e.state === "wait" && G.round >= e.start) { e.state = "on"; G.boss = rnd(0, R.players.length - 1); e.end = G.round + e.len - 1; extra.fx.push("boss"); say(R, "📣 ഓഫീസിൽ ഒരു രഹസ്യ സംഭവം തുടങ്ങി. ആർക്കോ എന്തോ അറിയാം..."); }
    else if (e.state === "on" && G.round > e.end) { e.state = "done"; G.chaosEnd = G.round + 2; extra.fx.push("boss"); say(R, `ആരും ബോസിനെ (${R.players[G.boss].name}) പിടിച്ചില്ല. ഓഫീസ് ബഹളം 3 ദിവസം: ബോസ് ഒഴികെ എല്ലാവരുടെയും മൂന്നിൽ ഒരു ചാട്ടം പിന്നോട്ട്.`); }
  }
  send(R, extra); sched(R);
}

wss.on("connection", ws => {
  let R = null, name = "";
  const err = msg => { R = null; ws.send(JSON.stringify({ type: "err", msg })); };
  const idx = () => R ? R.players.findIndex(p => p.name === name) : -1;
  ws.on("message", raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === "ping") return;
    if (m.t === "join") {
      const code = String(m.room || "").toUpperCase().slice(0, 6), nm = String(m.name || "").trim().slice(0, 14);
      if (!nm || !code) return err("പേരും റൂം കോഡും നൽകൂ");
      R = rooms[code];
      if (!R) { if (!m.create) return err("ഇങ്ങനെ ഒരു റൂം ഇല്ല"); R = rooms[code] = { code, players: [], host: 0, G: null }; }
      name = nm;
      let p = R.players.find(x => x.name === nm);
      if (p) { p.ws = ws; p.online = true; }
      else {
        if (R.G) return err("ആ കളി തുടങ്ങിക്കഴിഞ്ഞു");
        if (R.players.length >= 8) return err("റൂം നിറഞ്ഞു (പരമാവധി 8 പേർ)");
        R.players.push({ name: nm, ws, online: true, tokens: [], boost: 0, cm: 0, seat: 0 });
      }
      clearTimeout(R.t); send(R); return;
    }
    const i = idx(); if (!R || i < 0) return;
    if (m.t === "react") { const k = +m.k; if (k >= 0 && k < 5) R.players.forEach(p => p.ws && p.ws.readyState === 1 && p.ws.send(JSON.stringify({ type: "react", from: name, k }))); return; }
    if (m.t === "start" && !R.G && R.players.length >= 2 && i === view(R).host) startGame(R, Math.min(4, Math.max(2, +m.T || 2)));
    else if (m.t === "roll" && R.G) roll(R, i);
    else if (m.t === "pick" && R.G) pick(R, i, m.tok);
    else if (m.t === "again" && R.G && R.G.over) { R.G = null; send(R); }
  });
  ws.on("close", () => {
    const i = idx(); if (i < 0 || R.players[i].ws !== ws) return;
    if (!R.G) R.players.splice(i, 1); else { R.players[i].online = false; sched(R); }
    if (!R.players.some(p => p.online)) { R.t = setTimeout(() => delete rooms[R.code], 3600000); return; }
    send(R);
  });
});
srv.listen(process.env.PORT || 8080);
