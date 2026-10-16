// The board, and the entropy solver from the Java project ported to the browser.
//
// The port is meant to be faithful rather than clever: the colouring rule, the
// candidate filtering and the ranking all follow Feedback, Solver and
// EntropyStrategy, so the suggestions here are the ones the desktop game makes.

(function () {
	"use strict";

	var WORD_LENGTH = 5;
	var MAX_GUESSES = 6;
	var PATTERN_COUNT = 243;
	var ALL_GREEN = 242;

	var WORDS = window.WORDLE_WORDS || [];
	var OPENING = window.WORDLE_OPENING || [];
	var N = WORDS.length;

	// Letters as 0-25 in one flat array. The inner loop of the search runs over
	// this a few million times a turn, so it stays out of string land.
	var CODES = new Uint8Array(N * WORD_LENGTH);
	var INDEX = {};

	for (var w = 0; w < N; w++) {
		INDEX[WORDS[w]] = w;
		for (var c = 0; c < WORD_LENGTH; c++) {
			CODES[w * WORD_LENGTH + c] = WORDS[w].charCodeAt(c) - 97;
		}
	}

	// ---------- Colouring ----------

	var avail = new Uint8Array(26);
	var slots = new Uint8Array(WORD_LENGTH);

	// Two passes, greens first. Gray does not mean "this letter is absent", it
	// means there are no copies left beyond the ones already coloured, so "speed"
	// against "abide" comes back with the first e yellow and the second gray.
	// One pass would rule out every answer that repeats a letter.
	function patternOf(guess, answer) {
		var g = guess * WORD_LENGTH;
		var a = answer * WORD_LENGTH;
		var i, letter;

		avail.fill(0);
		for (i = 0; i < WORD_LENGTH; i++) {
			letter = CODES[a + i];
			if (CODES[g + i] === letter) {
				slots[i] = 2;
			} else {
				slots[i] = 0;
				avail[letter]++;
			}
		}
		for (i = 0; i < WORD_LENGTH; i++) {
			if (slots[i] === 2) {
				continue;
			}
			letter = CODES[g + i];
			if (avail[letter] > 0) {
				avail[letter]--;
				slots[i] = 1;
			}
		}
		return slots[0] + slots[1] * 3 + slots[2] * 9 + slots[3] * 27 + slots[4] * 81;
	}

	function patternSymbols(pattern) {
		var out = "";
		for (var i = 0; i < WORD_LENGTH; i++) {
			out += "xyg".charAt(Math.floor(pattern / Math.pow(3, i)) % 3);
		}
		return out;
	}

	// ---------- Solver ----------

	var buckets = new Int32Array(PATTERN_COUNT);

	// A guess splits the candidates into buckets, one per colouring it can come
	// back as. A bucket holding a fraction p of them carries log2(1/p) bits, so
	// the guess is worth -sum p*log2(p) bits on average.
	function entropyOf(guess, candidates) {
		var n = candidates.length;
		var bits = 0;
		var i, count, p;

		buckets.fill(0);
		for (i = 0; i < n; i++) {
			buckets[patternOf(guess, candidates[i])]++;
		}
		for (i = 0; i < PATTERN_COUNT; i++) {
			count = buckets[i];
			if (count > 0) {
				p = count / n;
				bits -= p * Math.log(p) / Math.LN2;
			}
		}
		return bits;
	}

	// Every word is scored as a guess, not just the ones that could still be the
	// answer: a word that cannot be right may split the field better. Ties go to a
	// possible answer, which may win outright.
	function rank(candidates, limit) {
		var possible = new Uint8Array(N);
		var ranked = [];
		var i;

		for (i = 0; i < candidates.length; i++) {
			possible[candidates[i]] = 1;
		}
		for (i = 0; i < N; i++) {
			ranked.push({
				word: WORDS[i],
				bits: entropyOf(i, candidates),
				possible: possible[i] === 1
			});
		}
		ranked.sort(function (x, y) {
			if (y.bits !== x.bits) {
				return y.bits - x.bits;
			}
			if (x.possible !== y.possible) {
				return x.possible ? -1 : 1;
			}
			return x.word < y.word ? -1 : 1;
		});
		return ranked.slice(0, limit);
	}

	// Turn one scores all 2315 words against all 2315 answers. It is the same
	// ranking every game, so it is computed offline and shipped in wordle-words.js
	// rather than made the price of opening the page.
	function suggestions(candidates, limit) {
		if (candidates.length === N) {
			return OPENING.slice(0, limit).map(function (row) {
				return { word: row.word, bits: row.bits, possible: true };
			});
		}
		return rank(candidates, limit);
	}

	function bestMove(candidates) {
		if (candidates.length <= 2) {
			// Nothing worth learning: guess one, and the other one next turn.
			return {
				word: WORDS[candidates[0]],
				bits: entropyOf(candidates[0], candidates),
				possible: true
			};
		}
		return suggestions(candidates, 1)[0];
	}

	function survivors(candidates, guess, pattern) {
		var out = [];
		for (var i = 0; i < candidates.length; i++) {
			if (patternOf(guess, candidates[i]) === pattern) {
				out.push(candidates[i]);
			}
		}
		return out;
	}

	// ---------- Game state ----------

	var game;
	var botOn = true;
	var autoPlaying = false;

	function everyWord() {
		var all = [];
		for (var i = 0; i < N; i++) {
			all.push(i);
		}
		return all;
	}

	function newGame() {
		game = {
			answer: Math.floor(Math.random() * N),
			typed: "",
			rows: [],
			candidates: everyWord(),
			over: false,
			won: false
		};
		autoPlaying = false;
		say("");
		render();
		refreshBot();
	}

	function play(guess, expectedBits) {
		var before = game.candidates.length;
		var expected = expectedBits === null ? entropyOf(guess, game.candidates) : expectedBits;
		var pattern = patternOf(guess, game.answer);

		game.candidates = survivors(game.candidates, guess, pattern);
		game.rows.push({
			word: WORDS[guess],
			pattern: pattern,
			expected: expected,
			before: before,
			after: game.candidates.length
		});
		game.typed = "";

		if (pattern === ALL_GREEN) {
			game.over = true;
			game.won = true;
			say("Solved in " + game.rows.length + (game.rows.length === 1 ? " guess." : " guesses."));
		} else if (game.rows.length >= MAX_GUESSES) {
			game.over = true;
			say("Out of guesses — the word was " + WORDS[game.answer].toUpperCase() + ".");
		} else {
			say("");
		}
		render();
		refreshBot();
	}

	function submitTyped() {
		if (game.over || autoPlaying) {
			return;
		}
		if (game.typed.length < WORD_LENGTH) {
			say("Not enough letters.");
			return;
		}
		var guess = INDEX[game.typed];
		if (guess === undefined) {
			// The Java game leaves the letters in place so they can be edited.
			say("“" + game.typed.toUpperCase() + "” is not in the word list.");
			return;
		}
		play(guess, null);
	}

	function typeLetter(letter) {
		if (game.over || autoPlaying || game.typed.length >= WORD_LENGTH) {
			return;
		}
		game.typed += letter;
		say("");
		render();
	}

	function backspace() {
		if (game.over || autoPlaying || game.typed.length === 0) {
			return;
		}
		game.typed = game.typed.slice(0, -1);
		render();
	}

	// ---------- Elements ----------

	var board = document.getElementById("board");
	var keyboard = document.getElementById("keyboard");
	var message = document.getElementById("message");
	var remaining = document.getElementById("remaining");
	var candidateList = document.getElementById("candidates");
	var suggestionBody = document.getElementById("suggestionbody");
	var suggestionNote = document.getElementById("suggestionnote");
	var analysisBody = document.getElementById("analysisbody");
	var analysisWrap = document.getElementById("analysis");
	var botPanel = document.getElementById("bot");
	var playBest = document.getElementById("playbest");
	var autoButton = document.getElementById("autosolve");

	var tiles = [];
	var keys = {};

	(function buildBoard() {
		for (var r = 0; r < MAX_GUESSES; r++) {
			var row = document.createElement("div");
			row.className = "boardrow";
			tiles.push([]);
			for (var c = 0; c < WORD_LENGTH; c++) {
				var tile = document.createElement("div");
				tile.className = "tile";
				row.appendChild(tile);
				tiles[r].push(tile);
			}
			board.appendChild(row);
		}
	})();

	(function buildKeyboard() {
		var layout = ["qwertyuiop", "asdfghjkl", "↵zxcvbnm⌫"];
		for (var r = 0; r < layout.length; r++) {
			var row = document.createElement("div");
			row.className = "keyrow";
			for (var i = 0; i < layout[r].length; i++) {
				var label = layout[r].charAt(i);
				var key = document.createElement("button");
				key.type = "button";
				key.className = "key";
				key.textContent = label === "↵" ? "enter" : label;
				if (label === "↵" || label === "⌫") {
					key.className += " keywide";
					key.setAttribute("aria-label", label === "↵" ? "enter" : "backspace");
				} else {
					keys[label] = key;
				}
				key.addEventListener("click", keyPress(label));
				row.appendChild(key);
			}
			keyboard.appendChild(row);
		}
	})();

	function keyPress(label) {
		return function () {
			if (label === "↵") {
				submitTyped();
			} else if (label === "⌫") {
				backspace();
			} else {
				typeLetter(label);
			}
		};
	}

	// ---------- Rendering ----------

	function say(text) {
		message.textContent = text;
	}

	// Typing a letter repaints the board; it does not change which words are still
	// possible. Only the moves that do touch the candidate set call refreshBot(),
	// so a keystroke never sets a 2315-word search going.
	function render() {
		renderBoard();
		renderKeyboard();
		renderAnalysis();
	}

	function renderBoard() {
		for (var r = 0; r < MAX_GUESSES; r++) {
			var row = game.rows[r];
			var typed = r === game.rows.length ? game.typed : "";
			for (var c = 0; c < WORD_LENGTH; c++) {
				var tile = tiles[r][c];
				if (row) {
					tile.textContent = row.word.charAt(c);
					tile.className = "tile " + stateClass(row.pattern, c);
				} else if (c < typed.length) {
					tile.textContent = typed.charAt(c);
					tile.className = "tile filled";
				} else {
					tile.textContent = "";
					tile.className = "tile";
				}
			}
		}
	}

	function stateClass(pattern, position) {
		var state = Math.floor(pattern / Math.pow(3, position)) % 3;
		return state === 2 ? "green" : (state === 1 ? "yellow" : "gray");
	}

	function renderKeyboard() {
		var best = {};
		var order = { gray: 1, yellow: 2, green: 3 };
		var r, c, letter, state;

		for (r = 0; r < game.rows.length; r++) {
			for (c = 0; c < WORD_LENGTH; c++) {
				letter = game.rows[r].word.charAt(c);
				state = stateClass(game.rows[r].pattern, c);
				if (!best[letter] || order[state] > order[best[letter]]) {
					best[letter] = state;
				}
			}
		}
		for (letter in keys) {
			if (Object.prototype.hasOwnProperty.call(keys, letter)) {
				keys[letter].className = "key" + (best[letter] ? " " + best[letter] : "");
			}
		}
	}

	function bits(value) {
		return value.toFixed(2);
	}

	function renderAnalysis() {
		analysisWrap.hidden = game.rows.length === 0;
		analysisBody.innerHTML = "";
		for (var r = 0; r < game.rows.length; r++) {
			var row = game.rows[r];
			// What the colours actually cost the field, against what the guess was
			// worth on average before it was played.
			var learned = Math.log(row.before / row.after) / Math.LN2;
			var tr = document.createElement("tr");
			tr.appendChild(cell(row.word.toUpperCase(), "guessword"));
			tr.appendChild(squareCell(row.pattern));
			tr.appendChild(cell(bits(row.expected), "num"));
			tr.appendChild(cell(bits(learned), "num"));
			tr.appendChild(cell(row.before + " → " + row.after, "num"));
			analysisBody.appendChild(tr);
		}
	}

	// Coloured boxes rather than letters: the row already says which word it was,
	// and the shape of the colouring is what the numbers beside it explain.
	function squareCell(pattern) {
		var td = document.createElement("td");
		var symbols = patternSymbols(pattern);
		td.className = "squares";
		td.setAttribute("aria-label", symbols);
		for (var i = 0; i < symbols.length; i++) {
			var box = document.createElement("span");
			box.className = "sq " + stateClass(pattern, i);
			td.appendChild(box);
		}
		return td;
	}

	function cell(text, className) {
		var td = document.createElement("td");
		td.textContent = text;
		if (className) {
			td.className = className;
		}
		return td;
	}

	// Bumped on every move, so a search that was already running cannot paint its
	// answer over a newer position when it finishes.
	var botToken = 0;

	function refreshBot() {
		botToken++;
		var token = botToken;

		botPanel.hidden = !botOn;
		if (!botOn) {
			return;
		}

		var left = game.candidates.length;
		remaining.textContent = left === 1
			? "1 word still fits the colours."
			: left + " words still fit the colours.";
		renderCandidateList();

		playBest.disabled = game.over;
		autoButton.disabled = game.over;

		if (game.over) {
			suggestionBody.innerHTML = "";
			suggestionNote.textContent = game.won
				? "Solved. Start a new word to see the solver open again."
				: "The word was " + WORDS[game.answer].toUpperCase() + ".";
			return;
		}

		if (left === N) {
			// The one ranking that never changes; no need to make anyone wait for it.
			fillSuggestions(suggestions(game.candidates, 5));
			suggestionNote.textContent = "Scored offline: every word against every answer.";
			return;
		}

		if (left <= 2) {
			// Every guess is worth the same nothing once the field is this small, so a
			// ranking would just be the word list in alphabetical order. Show the words
			// that are actually left instead.
			fillSuggestions(game.candidates.map(function (index) {
				return { word: WORDS[index], bits: entropyOf(index, game.candidates), possible: true };
			}));
			suggestionNote.textContent = left === 1
				? "One word left, and it is the answer."
				: "Two left: nothing worth learning, so it guesses one and keeps the other for next turn.";
			return;
		}

		suggestionNote.textContent = "Scoring all " + N + " words…";
		suggestionBody.innerHTML = "";
		// Let the colours paint before the search takes the thread.
		window.setTimeout(function () {
			if (token !== botToken) {
				return;
			}
			fillSuggestions(suggestions(game.candidates, 5));
			suggestionNote.textContent = left <= 2
				? "Two or fewer left: nothing worth learning, so it just guesses one."
				: "Ties go to a word that could still be the answer.";
		}, 16);
	}

	function fillSuggestions(ranked) {
		suggestionBody.innerHTML = "";
		for (var i = 0; i < ranked.length; i++) {
			var tr = document.createElement("tr");
			tr.appendChild(cell(ranked[i].word.toUpperCase(), "guessword"));
			tr.appendChild(cell(bits(ranked[i].bits), "num"));
			tr.appendChild(cell(ranked[i].possible ? "could be the answer" : "", "light"));
			tr.appendChild(playCell(ranked[i]));
			suggestionBody.appendChild(tr);
		}
	}

	function playCell(suggestion) {
		var td = document.createElement("td");
		var button = document.createElement("button");
		button.type = "button";
		button.className = "btn btnsmall";
		button.textContent = "play";
		button.addEventListener("click", function () {
			if (!game.over && !autoPlaying) {
				play(INDEX[suggestion.word], suggestion.bits);
			}
		});
		td.appendChild(button);
		return td;
	}

	function renderCandidateList() {
		if (game.candidates.length === N) {
			// Listing thirty words off the top of an untouched list says nothing.
			candidateList.textContent = "all " + N + " words";
			return;
		}
		var shown = game.candidates.slice(0, 30);
		var text = shown.map(function (i) {
			return WORDS[i];
		}).join(", ");
		if (game.candidates.length > shown.length) {
			text += ", … (" + (game.candidates.length - shown.length) + " more)";
		}
		candidateList.textContent = text;
	}

	// ---------- Controls ----------

	document.getElementById("newgame").addEventListener("click", newGame);

	document.getElementById("showbot").addEventListener("change", function () {
		botOn = this.checked;
		refreshBot();
	});

	playBest.addEventListener("click", function () {
		if (game.over || autoPlaying) {
			return;
		}
		var move = bestMove(game.candidates);
		play(INDEX[move.word], move.bits);
	});

	autoButton.addEventListener("click", function () {
		if (game.over || autoPlaying) {
			return;
		}
		autoPlaying = true;
		step();
	});

	// Half a second between guesses: the point is to watch the candidate count
	// collapse, which is lost if all six rows appear at once.
	function step() {
		var move = bestMove(game.candidates);
		play(INDEX[move.word], move.bits);
		if (game.over) {
			autoPlaying = false;
			render();
		} else {
			window.setTimeout(step, 500);
		}
	}

	document.addEventListener("keydown", function (event) {
		if (event.ctrlKey || event.metaKey || event.altKey) {
			return;
		}
		var key = event.key;
		if (key === "Enter") {
			submitTyped();
		} else if (key === "Backspace") {
			backspace();
		} else if (key.length === 1 && key >= "a" && key <= "z") {
			typeLetter(key);
		} else if (key.length === 1 && key >= "A" && key <= "Z") {
			typeLetter(key.toLowerCase());
		} else {
			return;
		}
		event.preventDefault();
	});

	newGame();
})();
