/**
 * Run: npx tsx src/dungeon/notation.test.ts
 */
import assert from 'node:assert/strict';
import { parseDungeon, parseRoomLine, serializeDungeon, serializeRoom } from './notation';

// --- Plain rooms render exactly as before: no display, no link ---
const plain = parseRoomLine('Entrance:3x3 n->Hall e-[unlocked]->Guardroom s->Outside')!;
assert.ok(plain);
assert.equal(plain.name, 'Entrance');
assert.equal(plain.type, 'entrance');
assert.equal(plain.display, undefined);
assert.equal(plain.linkTarget, undefined);
assert.equal(plain.exits.N?.target, 'Hall');
assert.equal(plain.exits.E?.door, 'unlocked');
assert.equal(plain.exits.S?.target, 'Outside');
// (serializer writes exits in N, S, E, W order)
assert.equal(serializeRoom(plain), 'Entrance:3x3 n->Hall s->Outside e-[unlocked]->Guardroom');

// --- "Note|Text" after the size links the room; exits are unaffected ---
const linked = parseRoomLine('Entrance:3x3 "Dungeon Entrance|Front Gate" n->Hall e-[unlocked]->Guardroom')!;
assert.ok(linked);
assert.equal(linked.name, 'Entrance');
assert.equal(linked.id, 'Entrance');
assert.equal(linked.type, 'entrance', 'room type still comes from the bare name');
assert.equal(linked.display, 'Front Gate');
assert.equal(linked.linkTarget, 'Dungeon Entrance');
assert.equal(linked.exits.N?.target, 'Hall');
assert.equal(linked.exits.E?.target, 'Guardroom');
assert.equal(linked.exits.E?.door, 'unlocked');

// Curly quotes (smart punctuation) work too.
const curly = parseRoomLine('Hall:1x6 “Long Hall|Hall” n->Junction')!;
assert.equal(curly.linkTarget, 'Long Hall');
assert.equal(curly.display, 'Hall');
assert.equal(curly.exits.N?.target, 'Junction');

// "Text" without a pipe only renames the room on the map.
const renamed = parseRoomLine('Boss:5x5 "The Throne Room"')!;
assert.equal(renamed.type, 'boss');
assert.equal(renamed.display, 'The Throne Room');
assert.equal(renamed.linkTarget, undefined);

// "Note|" falls back to the note name for the label.
const noteOnly = parseRoomLine('Crypt:3x3 "Crypt of Bones|" w-[stairs]->Catacombs')!;
assert.equal(noteOnly.linkTarget, 'Crypt of Bones');
assert.equal(noteOnly.display, 'Crypt of Bones');
assert.equal(noteOnly.exits.W?.door, 'stairs');

// A label with words that look like exits doesn't break exit parsing.
const tricky = parseRoomLine('Armory:3x2 "n-Wing Armory|s->armory" e-[open]->StoreRoom')!;
assert.equal(tricky.display, 's->armory');
assert.equal(tricky.exits.N, null);
assert.equal(tricky.exits.S, null);
assert.equal(tricky.exits.E?.door, 'open');

// --- Round trip keeps the label ---
assert.equal(
  serializeRoom(linked),
  'Entrance:3x3 "Dungeon Entrance|Front Gate" n->Hall e-[unlocked]->Guardroom',
);
assert.equal(serializeRoom(renamed), 'Boss:5x5 "The Throne Room"');
const text = ['Entrance:3x3 "Dungeon Entrance|Entrance" n->Hall', 'Hall:1x6', 'Boss:5x5 "Throne"'].join('\n');
assert.equal(serializeDungeon(parseDungeon(text)), text);

console.log('dungeon notation tests passed');
