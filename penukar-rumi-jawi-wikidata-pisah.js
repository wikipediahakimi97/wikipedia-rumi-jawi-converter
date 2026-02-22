/**
 ** LOG:
 ** Updated on 21 February 2026
 **
 **/

/* Convert the text from rumi to jawi script using WDQS
* With separated options. Penukar kandungan: Jawi/Rumi 
*                         Penukar antara muka: Jawi/Rumi
* 
*/

/* Original author: [[Pengguna:Hakimi97]] */

/* Licensed under the terms of the GNU General Public License version 3.0
* as published by the Free Software Foundation; See the
* GNU General Public License for more details.
* A copy of the GPL is available at https://www.gnu.org/licenses/gpl-3.0.txt 
*/

(() => {
	// ============================================================================
	// CONFIGURATION & CONSTANTS
	// ============================================================================
	const CONFIG = {
		CACHE_KEY: "rumiJawiData",
		CACHE_DURATION: 3600000,
		DICT_VERSION: 2,
		VERSION: "2026-02-21",
		DEBUG: false,
		SPARQL_URL: "https://query.wikidata.org/sparql",
		SPARQL_QUERY: `SELECT DISTINCT ?formId ?latn ?arab
			(GROUP_CONCAT(DISTINCT ?featureLabel; SEPARATOR=", ") AS ?features)
			WHERE {
				?lexEntry dct:language wd:Q9237; ontolex:lexicalForm ?form.
				FILTER (?form != wd:L1410361-F1)
				BIND(STRAFTER(STR(?form), "http://www.wikidata.org/entity/") AS ?formId)
				?form ontolex:representation ?latn FILTER (lang(?latn) = "ms")
				?form ontolex:representation ?arab FILTER (lang(?arab) = "ms-arab")
				OPTIONAL {
					?form wikibase:grammaticalFeature ?feature.
					?feature rdfs:label ?featureLabel FILTER (lang(?featureLabel) = "en")
				}
				FILTER (!BOUND(?feature) || (
					?feature != wd:Q98912 && ?feature != wd:Q8185162 && ?feature != wd:Q10617810
				))
			}
			GROUP BY ?formId ?latn ?arab`,
		TEMPLATE_CLASS: "mwgadget-explicit-form-mapping",
		NOCONVERT_CLASS: "mwgadget-no-convert-text",
		TEMPLATE_DATA_ATTR: "data-form-id",
		TEMPLATE_ORIG_TEXT_ATTR: "data-rumi-text",
		SKIP_CLASSES: ["IPA", "chemf", "barelink", "number"],
		PUNCTUATION_MAP: {
			",": "⹁",
			";": "⁏",
			"?": "؟"
		},
		CLITIC_MAP: new Map([["lah", "له"], ["pun", "ڤون"], ["kah", "که"], ["tah", "ته"]]),
		NASAL_RESTORE_MAP: {
			mem: { vowel: ["p", "f"], cons: [] },
			men: { vowel: ["t"], cons: [] },
			meny: { vowel: ["s"], cons: ["s"] },
			meng: { vowel: ["k"], cons: ["k"] },
			pem: { vowel: ["p", "f"], cons: [] },
			pen: { vowel: ["t"], cons: [] },
			peny: { vowel: ["s"], cons: ["s"] },
			peng: { vowel: ["k"], cons: ["k"] }
		},
		NASAL_DROP_MAP: {
			pem: "ڤ",
			pen: "ت",
			peng: "ک",
			peny: "س",
			mem: "ڤ",
			men: "ت",
			meng: "ک",
			meny: "س"
		},
		OUTER_PREFIX_PATTERNS: [
			{ rumi: "meng", cut: 4, jawi: "مڠ", nasal: true },
			{ rumi: "meny", cut: 4, jawi: "مڽ", nasal: true },
			{ rumi: "mem", cut: 3, jawi: "مم", nasal: true },
			{ rumi: "men", cut: 3, jawi: "من", nasal: true },
			{ rumi: "me", cut: 2, jawi: "م", nasal: false },
			{ rumi: "peng", cut: 4, jawi: "ڤڠ", nasal: true },
			{ rumi: "peny", cut: 4, jawi: "ڤڽ", nasal: true },
			{ rumi: "pem", cut: 3, jawi: "ڤم", nasal: true },
			{ rumi: "pen", cut: 3, jawi: "ڤن", nasal: true },
			{ rumi: "pe", cut: 2, jawi: "ڤ", nasal: false },
			{ rumi: "ber", cut: 3, jawi: "بر", nasal: false },
			{ rumi: "ter", cut: 3, jawi: "تر", nasal: false },
			{ rumi: "di", cut: 2, jawi: "د", nasal: false },
			{ rumi: "ke", cut: 2, jawi: "ک", nasal: false },
			{ rumi: "se", cut: 2, jawi: "س", nasal: false },
		],
		MIDDLE_PREFIX_PATTERNS: [
			{ rumi: "per", cut: 3, jawi: "ڤر" },
			{ rumi: "ter", cut: 3, jawi: "تر" },
		],
		INNER_PREFIX_PATTERNS: [
			{ rumi: "juru", cut: 4, jawi: "جورو" },
			{ rumi: "maha", cut: 4, jawi: "مها" },
		],
		INNER_SUFFIX_PATTERNS: [
			{ rumi: "kan", jawi: "کن" },
			{ rumi: "i", jawi: null },
			{ rumi: "an", jawi: null },
		],
		MIDDLE_SUFFIX_NYA: { rumi: "nya", jawi: "ڽ" },
		NASAL_PREFIXES: new Set(["meng", "meny", "mem", "men", "peng", "peny", "pem", "pen"]),
		HAMZA_PREFIXES: new Set(["se", "ke", "di"])
	};
	// ============================================================================
	// UTILITY MODULES
	// ============================================================================
	const Storage = {
		get: (key) => { try { return localStorage?.getItem(key); } catch { return null; } },
		set: (key, value) => { try { localStorage?.setItem(key, value); } catch {} }
	};
	const DOM = {
		setDirection: (el, isRTL) => {
			if (!el) return;
			if ((el.nodeName === "SUB" || el.nodeName === "SUP") && el.getAttribute("id")) {
				el.setAttribute("dir", "ltr");
				return;
			}
			el.setAttribute("dir", isRTL ? "rtl" : "ltr");
			el.setAttribute("lang", isRTL ? "ms-arab" : "ms");
		},
		hasSkipClass: (el) => CONFIG.SKIP_CLASSES.some(cls => el.classList?.contains(cls)),
		isSkippableElement: (el) => !el || el.classList?.contains(CONFIG.NOCONVERT_CLASS) || el.classList?.contains(CONFIG.TEMPLATE_CLASS) || (el.tagName === 'SPAN' && DOM.hasSkipClass(el)),
		createWalker: (root, acceptNode) => document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode }),
		collectNodes: (walker) => {
			const nodes = [];
			let node;
			while ((node = walker.nextNode())) nodes.push(node);
			return nodes;
		},
		setContent: (el, content, isHTML = false) => isHTML ? el.innerHTML = content : el.textContent = content
	};
	// ============================================================================
	// CACHING & NORMALIZATION
	// ============================================================================
	const normCache = new Map();
	const MAX_NORM_CACHE = 5000;
	const normMs = (str) => {
		if (!str) return str;
		if (normCache.has(str)) return normCache.get(str);
		const result = str.normalize("NFC").toLocaleLowerCase("ms");
		if (normCache.size > MAX_NORM_CACHE) normCache.clear();
		normCache.set(str, result);
		return result;
	};
	const tokenizeMalay = (text) => text.match(/[\p{L}\p{M}']+(?:-[\p{L}\p{M}']+)?|[^\p{L}\p{M}']+/gu) || [];
	// ============================================================================
	// TRIE DATA STRUCTURE
	// ============================================================================
	const Trie = {
		create: () => ({ children: Object.create(null), value: null }),
		insert: (trie, word, value) => {
			let node = trie;
			for (const ch of word) node = node.children[ch] ||= Trie.create();
			node.value = value;
		},
		lookup: (trie, word) => {
			let node = trie;
			for (const ch of word) {
				node = node.children[ch];
				if (!node) return null;
			}
			return node.value;
		},
		build: (dict, source, keyFn = k => k.toLowerCase()) => {
			const trie = Trie.create();
			for (const [key, fid] of Object.entries(source)) {
				Trie.insert(trie, keyFn(key), dict.forms[fid]);
			}
			return trie;
		},
		applyPhrase: (text, trie) => {
			text = text.normalize("NFC");
			const chars = Array.from(text);
			const normChars = chars.map(c => normMs(c));
			let i = 0,
				out = "";
			while (i < chars.length) {
				let node = trie,
					j = i,
					lastMatch = null,
					lastPos = i;
				while (j < chars.length && /[\p{L}\p{M}\s]/u.test(chars[j]) && node.children[normChars[j]]) {
					node = node.children[normChars[j]];
					j++;
					if (node.value) {
						lastMatch = node.value;
						lastPos = j;
					}
				}
				out += lastMatch !== null ? lastMatch : chars[i];
				i = lastMatch ? lastPos : i + 1;
			}
			return out;
		}
	};
	// ============================================================================
	// STATE MANAGEMENT
	// ============================================================================
	const State = {
		script: "rumi",
		dictionary: null,
		initialized: false,
		content: null,
		title: null,
		originalContent: null,
		originalTitle: null,
		init(content, title) {
			this.content = content;
			this.title = title;
			return this;
		},
		setScript(script) { this.script = script; return this; }
	};
	const LoadingState = {
		isLoading: false,
		subscribers: new Set(),
		set(val) {
			this.isLoading = val;
			this.subscribers.forEach(fn => fn(val));
		},
		subscribe(fn) { this.subscribers.add(fn); return () => this.subscribers.delete(fn); }
	};
	// ============================================================================
	// DICTIONARY MANAGEMENT
	// ============================================================================
	const DictionaryManager = {
		_pending: null,
		async fetch() {
			if (State.dictionary) return State.dictionary;
			const cached = this.loadFromCache();
			if (cached) { State.dictionary = cached; return cached; }
			if (this._pending) return this._pending;
			LoadingState.set(true);
			this._pending = (async () => {
				try { return await this.fetchFromAPI(); }
				finally { this._pending = null; if (LoadingState.isLoading) LoadingState.set(false); }
			})();
			return this._pending;
		},
		loadFromCache() {
			const cached = Storage.get(CONFIG.CACHE_KEY);
			if (!cached) return null;
			try {
				const { timestamp, version, data } = JSON.parse(cached);
				if (version !== CONFIG.DICT_VERSION) return null;
				if (timestamp && Date.now() - timestamp < CONFIG.CACHE_DURATION) return data;
			} catch (e) {
				CONFIG.DEBUG && console.warn("Cache parse failed:", e);
				try { localStorage.removeItem(CONFIG.CACHE_KEY); } catch {}
			}
			return null;
		},
		async fetchFromAPI() {
			try {
				const controller = new AbortController();
				const timeout = setTimeout(() => controller.abort(), 30000);
				try {
					const url = `${CONFIG.SPARQL_URL}?query=${encodeURIComponent(CONFIG.SPARQL_QUERY)}&format=json`;
					const response = await fetch(url, {
						headers: { Accept: "application/sparql-results+json" },
						signal: controller.signal
					});
					if (!response.ok) throw new Error(`HTTP ${response.status}`);
					const result = await response.json();
					const processedData = this.process(result);
					Storage.set(CONFIG.CACHE_KEY, JSON.stringify({
						timestamp: Date.now(),
						version: CONFIG.DICT_VERSION,
						data: processedData
					}));
					State.dictionary = processedData;
					return processedData;
				} finally {
					clearTimeout(timeout);
				}
			} catch (err) {
				CONFIG.DEBUG && console.error("Dictionary fetch failed:", err);
				const empty = { words: {}, phrases: {}, forms: {}, formMappings: {} };
				State.dictionary = empty;
				return empty;
			}
		},
		process(data) {
			const dict = { words: {}, phrases: {}, forms: {}, formMappings: {} };
			for (const { formId, latn, arab } of data?.results?.bindings ?? []) {
				if (!formId || !latn || !arab) continue;
				const rumi = normMs(latn.value);
				const jawi = arab.value;
				const fid = formId.value;
				dict.forms[fid] = jawi;
				dict.formMappings[fid] = rumi;
				(rumi.includes(" ") ? dict.phrases : dict.words)[rumi] = fid;
			}
			return dict;
		}
	};
	// ============================================================================
	// TEXT PROCESSING
	// ============================================================================
	const TextProcessor = {
		threeQuarterHamza(text) {
			if (!text) return text;
			const exceptions = {
				skip: ["القرءان"],
				force: ["چيء", "داتوء", "توء", "نيء"]
			};
			const tempMap = {};
			exceptions.skip.forEach((ex, i) => {
				const key = `__EXC${i}__`;
				tempMap[key] = ex;
				text = text.replaceAll(ex, key);
			});
			const hamzaSpan = '<span class="hamza-span">ء</span>';
			exceptions.force.forEach(word => text = text.replaceAll(word, word.replace(/ء/g, hamzaSpan)));
			text = text.replace(/([\s"'"'{\(\[<])ء(?=[\u0600-\u06FF])/g, (_, p1) => p1 + hamzaSpan).replace(/([\u0600-\u06FF])ء(?=[\u0600-\u06FF])/g, (_, p1) => p1 + hamzaSpan);
			Object.entries(tempMap).forEach(([k, ex]) => text = text.replaceAll(k, ex));
			return text;
		},
		IPASegment(text) {
			if (!text) return text;
			const wrap = (str) => `\u2066${str}\u2069`;
			text = text.replace(/(["'])?([\/\[])(<span[^>]*>[\s\S]+?<\/span>)([\/\]])\1?/g,
				(m, quote, open, inner, close) => quote ? `${quote}${wrap(open + inner + close)}${quote}` : wrap(open + inner + close));
			text = text.replace(/([\/\[])([^\]\/<>]+)([\/\]])/g, (m, open, inner, close) => {
				const isValid = (open === '/' && close === '/') || (open === '[' && close === ']');
				const hasIPA = /[\u0250-\u02AF.ˈˌ|‖]/.test(inner);
				return isValid && hasIPA ? wrap(open + inner + close) : m;
			});
			return text;
		},
		apply(text, isJawi) {
			return isJawi ? this.IPASegment(this.threeQuarterHamza(text)) : text;
		}
	};
	// ============================================================================
	// MORPHOLOGY HELPERS
	// ============================================================================
	let exactFormTrie = null,
		phraseTrie = null,
		rootTrie = null;
	const MorphologyHelpers = {
		/**
		 * Nasal assimilation: drop leading consonant from jawiRoot when outer nasal
		 * prefix (meN-/peN-) meets directly with [root].
		 */
		applyNasalAssimilation(nasalPrefix, rawRoot, jawiRoot) {
			if (!CONFIG.NASAL_RESTORE_MAP[nasalPrefix]) return jawiRoot;
			if (/^[aiueo]/.test(rawRoot)) {
				const drop = CONFIG.NASAL_DROP_MAP[nasalPrefix];
				if (drop && jawiRoot.startsWith(drop)) return jawiRoot.slice(1);
			}
			return jawiRoot;
		},
		/**
		 * applySuffixTransform: applied when [root] meets -an or -i.
		 */
		applySuffixTransform(rawRoot, jawiRoot, suffix) {
			if (!rawRoot || !jawiRoot) {
				return jawiRoot + (suffix === "an" ? "ن" : "ي");
			}
			const lastRumi = rawRoot.slice(-1);
			const cleanJawi = jawiRoot.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "");
			let baseJawi = jawiRoot;
			const lastJawi = cleanJawi.slice(-1);
			if (lastJawi === "ة") {
				if (lastRumi === "t") baseJawi = cleanJawi.slice(0, -1) + "ت";
				else if (lastRumi === "h") baseJawi = cleanJawi.slice(0, -1) + "ه";
			}
			if (suffix === "an") {
				const lastClean = baseJawi.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "").slice(-1);
				if (lastRumi === "a" && lastClean === "ا") return baseJawi + "ءن";
				if (lastRumi === "a" && lastClean !== "ا") return baseJawi + "اءن";
				if (lastRumi === "u" && lastClean === "و") return baseJawi + "ان";
				return baseJawi + "ن";
			}
			if (suffix === "i") {
				const isDiphthong = /(ai|au|oi|ei)$/i.test(rawRoot);
				const endsWithAU = (lastRumi === "a" || lastRumi === "u") && !isDiphthong;
				const lastClean = baseJawi.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "").slice(-1);
				if (endsWithAU && (lastClean === "ا" || lastClean === "و")) return baseJawi + "ءي";
				return baseJawi + "ي";
			}
			return baseJawi + suffix;
		},
		/**
		 * applySpecialPrefixRules: ke-, se-, di- (outer prefix) + [root].
		 */
		applySpecialPrefixRules(prefix, jawiRoot) {
			if (CONFIG.NASAL_PREFIXES.has(prefix) && /^ا[يو]/.test(jawiRoot)) {
				return jawiRoot.replace(/^ا([يو])/, "$1");
			}
			if (CONFIG.HAMZA_PREFIXES.has(prefix) && /^ا/.test(jawiRoot)) {
				return jawiRoot.replace(/^ا/, "أ");
			}
			return jawiRoot;
		},
		/**
		 * lookupRootWithFallback: look up raw root in rootTrie, with nasal restoration candidates.
		 */
		lookupRootWithFallback(nasalPrefix, rawRoot) {
			if (!rawRoot) return null;
			const candidates = [rawRoot];
			if (nasalPrefix && CONFIG.NASAL_RESTORE_MAP[nasalPrefix]) {
				const rules = CONFIG.NASAL_RESTORE_MAP[nasalPrefix];
				const bases = /^[aiueo]/.test(rawRoot) ? rules.vowel : rules.cons;
				for (const b of bases) candidates.push(b + rawRoot);
			}
			for (const root of candidates) {
				const found = Trie.lookup(rootTrie, root);
				if (found) return { jawi: found, rumi: root };
			}
			return null;
		},
		/**
		 * resolveRoot: unified helper — looks up root, applies nasal assimilation and
		 * special prefix rules. Returns adjusted jawiRoot + resolvedRumi, or null.
		 * nasalPrefix and outerForHamza should only be set when no middle/inner prefix exists.
		 */
		resolveRoot(outerP, middleP, innerP, rawRoot) {
			const nasalPrefix = (outerP?.nasal && !middleP && !innerP) ? outerP.rumi : null;
			const outerForHamza = (outerP && !middleP && !innerP) ? outerP.rumi : null;
			const rootResult = this.lookupRootWithFallback(nasalPrefix, rawRoot);
			if (!rootResult) return null;
			let { jawi, rumi } = rootResult;
			if (nasalPrefix) jawi = this.applyNasalAssimilation(nasalPrefix, rawRoot, jawi);
			if (outerForHamza) jawi = this.applySpecialPrefixRules(outerForHamza, jawi);
			return { jawi, rumi };
		},
		/**
		 * applyInnerSuffix: apply -kan, -i, -an to a jawi root.
		 */
		applyInnerSuffix(rawRoot, jawiRoot, suffix) {
			if (suffix === "kan") return jawiRoot + "کن";
			return this.applySuffixTransform(rawRoot, jawiRoot, suffix); // "an" | "i"
		},
		/** applyMiddleSuffix: apply -nya. */
		applyMiddleSuffix: (jawi) => jawi + CONFIG.MIDDLE_SUFFIX_NYA.jawi,
		/** applyOuterSuffix: apply clitics. */
		applyOuterSuffix(jawi, clitic) {
			const jawiClitic = CONFIG.CLITIC_MAP.get(clitic);
			return jawiClitic ? jawi + jawiClitic : jawi;
		},
		/**
		 * buildJawiFromParts: assemble full Jawi string from resolved root + affixes.
		 * Prefixes are prepended inner→middle→outer; suffixes applied inner→middle→outer.
		 */
		buildJawiFromParts(jawiRoot, resolvedRumi, outerP, middleP, innerP, suffixInfo) {
			let jawi = jawiRoot;
			if (suffixInfo.innerSuf) jawi = this.applyInnerSuffix(resolvedRumi, jawi, suffixInfo.innerSuf);
			if (suffixInfo.middleSuf) jawi = this.applyMiddleSuffix(jawi);
			if (suffixInfo.outerSuf) jawi = this.applyOuterSuffix(jawi, suffixInfo.outerSuf);
			if (innerP) jawi = innerP.jawi + jawi;
			if (middleP) jawi = middleP.jawi + jawi;
			if (outerP) jawi = outerP.jawi + jawi;
			return jawi;
		}
	};
	// ============================================================================
	// LAYERED MORPHOLOGY ENGINE
	// ============================================================================
	const LayeredMorphology = {
		_cache: new Map(),
		_redupCache: new Map(),
		_clearCacheIfNeeded(cache, limit = 3000) {
			if (cache.size > limit) cache.clear();
		},
		/**
		 * Main entry point. Returns Jawi string or null.
		 */
		convert(token) {
			const lower = normMs(token).trim();
			if (!lower || !/[\p{L}]/u.test(lower)) return null;
			if (this._cache.has(lower)) return this._cache.get(lower);
			this._clearCacheIfNeeded(this._cache);
			const result = this._tryAll(lower);
			this._cache.set(lower, result);
			return result;
		},
		_tryAll(lower) {
			// 1. Exact form lookup
			const exact = Trie.lookup(exactFormTrie, lower);
			if (exact) return exact;
			// 2. Strip trailing apostrophe
			const cleaned = lower.replace(/[']+$/, "");
			if (cleaned !== lower) {
				const e2 = Trie.lookup(exactFormTrie, cleaned);
				if (e2) return e2;
			}
			// 3. Hyphenated reduplication
			if (lower.includes("-")) {
				const redup = this._tryReduplication(lower);
				if (redup) return redup;
			}
			// 4. Full layered morphology parse
			return this._tryLayered(lower) || null;
		},
		// ── Reduplication ─────────────────────────────────────────────────────
		_tryReduplication(lower) {
			if (this._redupCache.has(lower)) return this._redupCache.get(lower);
			this._clearCacheIfNeeded(this._redupCache, 2000);
			const dashIdx = lower.indexOf("-");
			const left = lower.slice(0, dashIdx);
			const right = lower.slice(dashIdx + 1);
			if (!left || !right) { this._redupCache.set(lower, null); return null; }
			const parsed = this._parseRedupHalves(left, right);
			const result = parsed ? (parsed.hasAffix ? parsed.jawiLeft + "-" + parsed.jawiRight : parsed.jawiLeft + "٢") : null;
			this._redupCache.set(lower, result);
			return result;
		},
		_parseRedupHalves(left, right) {
			const suffixCandidates = this._candidateSuffixes(right);
			for (const outerP of this._candidateOuterPrefixes(left)) {
				const afterOuter = outerP ? left.slice(outerP.cut) : left;
				for (const middleP of this._candidateMatchingPrefixes(CONFIG.MIDDLE_PREFIX_PATTERNS, afterOuter)) {
					const afterMiddle = middleP ? afterOuter.slice(middleP.cut) : afterOuter;
					for (const innerP of this._candidateMatchingPrefixes(CONFIG.INNER_PREFIX_PATTERNS, afterMiddle)) {
						const rootLeft = innerP ? afterMiddle.slice(innerP.cut) : afterMiddle;
						if (!rootLeft) continue;
						for (const suffixInfo of suffixCandidates) {
							if (rootLeft !== suffixInfo.bareRoot) continue;
							const resolved = MorphologyHelpers.resolveRoot(outerP, middleP, innerP, rootLeft);
							if (!resolved) continue;
							const { jawi: jawiRoot, rumi: resolvedRumi } = resolved;
							const hasAffix = !!(outerP || middleP || innerP || suffixInfo.innerSuf || suffixInfo.middleSuf || suffixInfo.outerSuf);
							// Left half: prefixes only (no suffixes)
							const jawiLeft = MorphologyHelpers.buildJawiFromParts(jawiRoot, resolvedRumi, outerP, middleP, innerP, { innerSuf: null, middleSuf: null, outerSuf: null });
							// Right half: root + suffixes (no prefixes)
							const jawiRight = MorphologyHelpers.buildJawiFromParts(jawiRoot, resolvedRumi, null, null, null, suffixInfo);
							return { jawiLeft, jawiRight, hasAffix };
						}
					}
				}
			}
			return null;
		},
		// ── Full layered parse ────────────────────────────────────────────────
		_tryLayered(lower) {
			for (const suffixInfo of this._candidateSuffixes(lower)) {
				const tokenNoSuffix = this._stripSuffixes(lower, suffixInfo);
				if (tokenNoSuffix === null) continue;
				const result = this._tryPrefixCombinations(tokenNoSuffix, suffixInfo);
				if (result) return result;
			}
			return null;
		},
		_stripSuffixes(token, suffixInfo) {
			let t = token;
			if (suffixInfo.outerSuf) {
				if (!t.endsWith(suffixInfo.outerSuf)) return null;
				t = t.slice(0, -suffixInfo.outerSuf.length);
			}
			if (suffixInfo.middleSuf) {
				if (!t.endsWith("nya")) return null;
				t = t.slice(0, -3);
			}
			if (suffixInfo.innerSuf) {
				if (!t.endsWith(suffixInfo.innerSuf)) return null;
				t = t.slice(0, -suffixInfo.innerSuf.length);
			}
			return t;
		},
		_tryPrefixCombinations(tokenNoSuffix, suffixInfo) {
			for (const outerP of this._candidateOuterPrefixes(tokenNoSuffix)) {
				const afterOuter = outerP ? tokenNoSuffix.slice(outerP.cut) : tokenNoSuffix;
				for (const middleP of this._candidateMatchingPrefixes(CONFIG.MIDDLE_PREFIX_PATTERNS, afterOuter)) {
					const afterMiddle = middleP ? afterOuter.slice(middleP.cut) : afterOuter;
					for (const innerP of this._candidateMatchingPrefixes(CONFIG.INNER_PREFIX_PATTERNS, afterMiddle)) {
						const rawRoot = innerP ? afterMiddle.slice(innerP.cut) : afterMiddle;
						if (!rawRoot) continue;
						const resolved = MorphologyHelpers.resolveRoot(outerP, middleP, innerP, rawRoot);
						if (!resolved) continue;
						return MorphologyHelpers.buildJawiFromParts(resolved.jawi, resolved.rumi, outerP, middleP, innerP, suffixInfo);
					}
				}
			}
			return null;
		},
		// ── Shared prefix/suffix candidate generators ─────────────────────────
		/** Returns [null, ...matching patterns] for given patterns array and token. */
		_candidateMatchingPrefixes(patterns, token) {
			const results = [null];
			for (const p of patterns) {
				if (token.startsWith(p.rumi)) results.push(p);
			}
			return results;
		},
		/** Returns [null, ...matching outer prefix patterns] for token. */
		_candidateOuterPrefixes(token) {
			return this._candidateMatchingPrefixes(CONFIG.OUTER_PREFIX_PATTERNS, token);
		},
		/**
		 * Returns all possible suffix decompositions for a token.
		 * Each entry: { bareRoot, innerSuf, middleSuf, outerSuf }
		 */
		_candidateSuffixes(token) {
			const results = [{ bareRoot: token, innerSuf: null, middleSuf: null, outerSuf: null }];
			const innerSuffixes = CONFIG.INNER_SUFFIX_PATTERNS.map(p => p.rumi);
			const addWithInner = (base, middleSuf, outerSuf) => {
				for (const sf of innerSuffixes) {
					if (base.endsWith(sf)) {
						results.push({ bareRoot: base.slice(0, -sf.length), innerSuf: sf, middleSuf, outerSuf });
					}
				}
			};
			// With outer clitic
			for (const [clitic] of CONFIG.CLITIC_MAP) {
				if (!token.endsWith(clitic)) continue;
				const withoutOuter = token.slice(0, -clitic.length);
				// With middle suffix (nya)
				if (withoutOuter.endsWith("nya")) {
					const withoutMiddle = withoutOuter.slice(0, -3);
					addWithInner(withoutMiddle, "nya", clitic);
					results.push({ bareRoot: withoutMiddle, innerSuf: null, middleSuf: "nya", outerSuf: clitic });
				}
				addWithInner(withoutOuter, null, clitic);
				results.push({ bareRoot: withoutOuter, innerSuf: null, middleSuf: null, outerSuf: clitic });
			}
			// With middle suffix only (no outer)
			if (token.endsWith("nya")) {
				const withoutMiddle = token.slice(0, -3);
				addWithInner(withoutMiddle, "nya", null);
				results.push({ bareRoot: withoutMiddle, innerSuf: null, middleSuf: "nya", outerSuf: null });
			}
			// Inner suffix only
			addWithInner(token, null, null);
			return results;
		}
	};
	// ============================================================================
	// NUMBER & CHEMICAL FORMULA HANDLING
	// ============================================================================
	const SpecialContent = {
		shieldNumbers(text) {
			const tokens = [];
			let idx = 0;
			const tempRegex = /[+-]?\d+(?:[.,]\d+)*\s?(?:°\s?[CF]|\s?K)\b/gi;
			const numberRegex = /[+-]?\d+(?:[.,]\d+)*(?:%)/g;
			const alphaNumRegex = /\b(?=[A-Za-z0-9]*[A-Za-z])(?=[A-Za-z0-9]*\d)[A-Za-z0-9]+\b/g;
			let out = text;
			const shield = (regex) => {
				out = out.replace(regex, (m) => {
					const key = `__NUM${idx}__`;
					tokens.push(`<span class="number">${m}</span>`);
					idx++;
					return key;
				});
			};
			shield(tempRegex);
			shield(numberRegex);
			shield(alphaNumRegex);
			return { text: out, tokens };
		},
		restoreNumbers(text, tokens) {
			tokens.forEach((t, i) => { text = text.replaceAll(`__NUM${i}__`, t); });
			return text;
		},
		looksLikeChemicalFormula(text) {
			if (!text) return false;
			const CHEM_CHARS = /^[A-Za-z0-9()\[\]{}·•.\-+=±→⇌α-ωΑ-Ω]+$/;
			if (!CHEM_CHARS.test(text)) return false;
			if (!/[A-Z][a-z]?/.test(text)) return false;
			const stack = [];
			const pairs = { ')': '(', ']': '[', '}': '{' };
			for (const ch of text) {
				if ('([{'.includes(ch)) stack.push(ch);
				else if (')]}'.includes(ch)) {
					if (stack.pop() !== pairs[ch]) return false;
				}
			}
			return stack.length === 0;
		},
		isChemicalElement(textNode, subSupNode) {
			if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return false;
			const txt = textNode.textContent.trim();
			if (!txt || !this.looksLikeChemicalFormula(txt)) return false;
			if (subSupNode) {
				if (!["SUB", "SUP"].includes(subSupNode.nodeName)) return false;
				if (!/^(\d+)?[+-]?$/.test(subSupNode.textContent.trim())) return false;
			}
			return true;
		},
		wrapSpecialElements() {
			const processedNodes = new Set();
			const chemWalker = DOM.createWalker(document.body, node => {
				const parent = node.parentElement;
				if (!parent || parent.classList.contains('chemf')) return NodeFilter.FILTER_REJECT;
				return node.nextSibling && this.isChemicalElement(node, node.nextSibling) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
			});
			for (const textNode of DOM.collectNodes(chemWalker)) {
				if (processedNodes.has(textNode) || !this.isChemicalElement(textNode, textNode.nextSibling)) continue;
				const consecutiveElements = [];
				let currentNode = textNode;
				while (currentNode?.nextSibling && this.isChemicalElement(currentNode, currentNode.nextSibling)) {
					consecutiveElements.push({ text: currentNode, subSup: currentNode.nextSibling });
					currentNode = currentNode.nextSibling.nextSibling;
					while (currentNode?.nodeType === Node.TEXT_NODE && !currentNode.textContent.trim()) {
						currentNode = currentNode.nextSibling;
					}
					if (currentNode?.nodeType === Node.TEXT_NODE && !this.isChemicalElement(currentNode, currentNode.nextSibling)) break;
				}
				if (consecutiveElements.length) {
					const wrapper = document.createElement('span');
					wrapper.className = 'chemf';
					consecutiveElements[0].text.parentNode.insertBefore(wrapper, consecutiveElements[0].text);
					for (const element of consecutiveElements) {
						wrapper.appendChild(element.text);
						wrapper.appendChild(element.subSup);
						processedNodes.add(element.text);
					}
				}
			}
			const linkWalker = DOM.createWalker(document.body, node => {
				const parent = node.parentElement;
				if (!parent || parent.classList.contains('barelink')) return NodeFilter.FILTER_REJECT;
				return /^https?:\/\/\S+$/.test(node.textContent.trim()) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
			});
			for (const node of DOM.collectNodes(linkWalker)) {
				const wrapper = document.createElement('span');
				wrapper.className = 'barelink';
				wrapper.textContent = node.textContent.trim();
				node.parentNode.replaceChild(wrapper, node);
			}
		}
	};
	// ============================================================================
	// TEXT CONVERSION
	// ============================================================================
	const Converter = {
		_processing: false,
		async convert(toJawi) {
			if (CONFIG.DEBUG) {
				performance.clearMarks();
				performance.clearMeasures();
				performance.mark("convert-start");
			}
			State.dictionary = await DictionaryManager.fetch();
			this.initTries(State.dictionary);
			TemplateManager.process(toJawi);
			const convertibleEls = [...State.content.querySelectorAll('.convertible-text, .vector-toc-text')];
			for (const el of convertibleEls) {
				if (DOM.isSkippableElement(el)) continue;
				if (!el.hasAttribute('data-rumi')) {
					el.setAttribute('data-rumi', el.textContent);
				} else if (!toJawi) {
					el.setAttribute('data-rumi', el.textContent);
				}
				const rumi = el.getAttribute('data-rumi');
				const txt = TextProcessor.apply(toJawi ? this.convertText(rumi, State.dictionary) : rumi, toJawi);
				el.innerHTML = txt;
				DOM.setDirection(el, toJawi);
			}
			toJawi ? await this.convertToJawi() : this.revertToRumi();
			this.handleTableStyles(toJawi);
			if (CONFIG.DEBUG) {
				performance.mark("convert-end");
				performance.measure("Rumi→Jawi conversion", "convert-start", "convert-end");
				console.log("[Rumi-Jawi] Conversion time:", performance.getEntriesByName("Rumi→Jawi conversion")[0].duration.toFixed(2), "ms");
			}
		},
		initTries(dict) {
			LayeredMorphology._cache.clear();
			LayeredMorphology._redupCache.clear();
			exactFormTrie = Trie.build(dict, dict.words);
			phraseTrie = Trie.build(dict, dict.phrases, k => k.toLowerCase().replace(/\s+/g, " "));
			rootTrie = Trie.create();
			for (const [fid, rumi] of Object.entries(dict.formMappings)) {
				Trie.insert(rootTrie, normMs(rumi), dict.forms[fid]);
			}
		},
		async convertToJawi() {
			if (this._processing) return;
			this._processing = true;
			try {
				if (!State.originalContent) {
					State.originalContent = State.content.cloneNode(true);
					State.originalTitle = State.title.textContent;
				}
				this.preprocessKafDal();
				State.content.setAttribute('dir', 'rtl');
				State.content.setAttribute('lang', 'ms-arab');
				DOM.setDirection(State.title, true);
				const convertedTitle = this.convertText(State.title.textContent, State.dictionary);
				State.title.innerHTML = TextProcessor.apply(convertedTitle, true);
				const walker = DOM.createWalker(State.content, node => {
					const p = node.parentElement;
					if (p?.closest('[data-jawi-fixed]')) return NodeFilter.FILTER_REJECT;
					if (!p || ["SCRIPT", "STYLE"].includes(p.tagName)) return NodeFilter.FILTER_REJECT;
					if (p.closest("#p-navigation, .mw-portlet, .vector-menu, .mw-header")) return NodeFilter.FILTER_REJECT;
					let currentElement = p;
					while (currentElement && currentElement !== State.content) {
						if (DOM.isSkippableElement(currentElement) && currentElement !== State.content) return NodeFilter.FILTER_REJECT;
						currentElement = currentElement.parentElement;
					}
					return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
				});
				const textNodes = DOM.collectNodes(walker);
				let idx = 0;
				const chunk = 50;
				await new Promise(resolve => {
					const processChunk = () => {
						const end = Math.min(idx + chunk, textNodes.length);
						try {
							for (let i = idx; i < end; i++) {
								const n = textNodes[i];
								if (!n?.textContent?.trim()) continue;
								const converted = TextProcessor.apply(this.convertText(n.textContent, State.dictionary), true);
								if (converted === n.textContent) continue;
								if (converted.includes('<span')) {
									const tempDiv = document.createElement("div");
									tempDiv.innerHTML = converted;
									const isSingleSpan = tempDiv.children.length === 1 && tempDiv.childNodes.length === 1 && tempDiv.firstElementChild.tagName === 'SPAN';
									n.parentNode?.replaceChild(isSingleSpan ? tempDiv.firstElementChild : (() => {
										const span = document.createElement("span");
										span.innerHTML = converted;
										return span;
									})(), n);
								} else {
									n.textContent = converted;
								}
								let p = n.parentElement;
								while (p && p !== State.content) {
									if (p.nodeType === 1 && p.closest("#mw-content-text .mw-parser-output") && DOM.hasSkipClass(p)) {
										DOM.setDirection(p, true);
									}
									p = p.parentElement;
								}
							}
						} catch (err) {
							console.error("Chunk processing failed:", err);
							idx = textNodes.length;
							resolve();
							return;
						}
						idx += chunk;
						if (idx < textNodes.length) requestAnimationFrame(processChunk);
						else resolve();
					};
					requestAnimationFrame(processChunk);
				});
			} finally {
				this._processing = false;
			}
		},
		revertToRumi() {
			if (!State.originalContent) return;
			State.content.replaceWith(State.originalContent);
			State.content = State.originalContent;
			State.title.textContent = State.originalTitle;
			State.content.setAttribute('dir', 'ltr');
			State.content.setAttribute('lang', 'ms');
			DOM.setDirection(State.title, false);
			State.originalContent = State.originalTitle = null;
			for (const el of State.content.querySelectorAll(`.${CONFIG.TEMPLATE_CLASS}`)) {
				const rumi = el.getAttribute(CONFIG.TEMPLATE_ORIG_TEXT_ATTR);
				if (rumi) {
					el.innerHTML = rumi;
					DOM.setDirection(el, false);
				}
			}
		},
		convertText(text, dict) {
			if (!text?.trim() || !dict) return text;
			const { text: shielded, tokens: numberTokens } = SpecialContent.shieldNumbers(text);
			let result = shielded.replace(/\s+/g, " ");
			result = result.replace(/\b(ke|di)\s+([\p{L}\p{M}]+)/giu, (_, p, w) => p.toLowerCase() + w);
			result = phraseTrie ? Trie.applyPhrase(result, phraseTrie) : result;
			const wordTokens = tokenizeMalay(result);
			result = wordTokens.map(token => {
				const raw = normMs(token).trim();
				if (!/[\p{L}\p{M}]/u.test(raw)) return token;
				const converted = LayeredMorphology.convert(raw);
				return converted !== null ? converted : token;
			}).join("");
			result = result.replace(/([,;?])(?=\s|["']|$)/g, m => CONFIG.PUNCTUATION_MAP[m] || m);
			return SpecialContent.restoreNumbers(result, numberTokens);
		},
		preprocessKafDal() {
			const walker = document.createTreeWalker(State.content, NodeFilter.SHOW_TEXT, {
				acceptNode(node) {
					if (!node.parentElement || node.parentElement.closest("a")) return NodeFilter.FILTER_REJECT;
					return /\b(ke|di)\s*$/i.test(node.textContent) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
				}
			});
			for (const node of DOM.collectNodes(walker)) {
				const match = node.textContent.match(/^(.*?)(ke|di)\s*$/i);
				if (!match) continue;
				let next = node.nextSibling;
				while (next?.nodeType === Node.TEXT_NODE && !next.textContent.trim()) next = next.nextSibling;
				if (!next || next.nodeType !== 1 || !/^(A|SPAN|B|I|EM|STRONG|SMALL|MARK)$/i.test(next.tagName)) continue;
				const [, before, prep] = match;
				if (before) node.textContent = before;
				else node.remove();
				next.parentNode.insertBefore(document.createTextNode(prep.toLowerCase() === "ke" ? "ک" : "د"), next);
				next.innerHTML = TextProcessor.apply(this.convertText(next.textContent, State.dictionary), true);
				next.setAttribute("data-jawi-fixed", "1");
				const firstText = next.firstChild;
				if (firstText?.nodeType === Node.TEXT_NODE && /^ا/.test(firstText.textContent)) {
					firstText.textContent = firstText.textContent.replace(/^ا/, "أ");
				}
			}
		},
		handleTableStyles(toJawi) {
			const elements = State.content.querySelectorAll('table, table *');
			for (const el of elements) {
				if (!el.className || !/clade-\w+/i.test(el.className) || !el.style) continue;
				if (toJawi) {
					if (!el.hasAttribute('data-original-border-left')) {
						el.setAttribute('data-original-border-left', el.style.borderLeft || '');
						el.setAttribute('data-original-border-right', el.style.borderRight || '');
					}
					[el.style.borderLeft, el.style.borderRight] = [el.style.borderRight, el.style.borderLeft];
				} else if (el.hasAttribute('data-original-border-left')) {
					el.style.borderLeft = el.getAttribute('data-original-border-left') || '';
					el.style.borderRight = el.getAttribute('data-original-border-right') || '';
					el.removeAttribute('data-original-border-left');
					el.removeAttribute('data-original-border-right');
				}
			}
		}
	};
	// ============================================================================
	// TEMPLATE MANAGEMENT
	// ============================================================================
	const TemplateManager = {
		initialize() {
			for (const el of State.content.querySelectorAll("[data-form-id]")) {
				if (el.classList.contains(CONFIG.TEMPLATE_CLASS)) continue;
				const formId = el.getAttribute(CONFIG.TEMPLATE_DATA_ATTR);
				if (!formId) continue;
				if (!el.hasAttribute(CONFIG.TEMPLATE_ORIG_TEXT_ATTR)) {
					el.setAttribute(CONFIG.TEMPLATE_ORIG_TEXT_ATTR, el.textContent);
				}
				el.classList.add(CONFIG.TEMPLATE_CLASS);
			}
			for (const el of State.content.querySelectorAll("[data-no-convert]")) {
				el.classList.add(CONFIG.NOCONVERT_CLASS);
			}
		},
		process(toJawi) {
			for (const el of State.content.querySelectorAll(`.${CONFIG.TEMPLATE_CLASS}`)) {
				const rumi = el.getAttribute(CONFIG.TEMPLATE_ORIG_TEXT_ATTR);
				const formId = el.getAttribute(CONFIG.TEMPLATE_DATA_ATTR);
				if (!this.validateFormMapping(formId, rumi, State.dictionary)) {
					el.classList.add(CONFIG.NOCONVERT_CLASS);
					el.classList.remove(CONFIG.TEMPLATE_CLASS);
					continue;
				}
				const txt = TextProcessor.apply(toJawi ? State.dictionary.forms[formId] || rumi : rumi, toJawi);
				if (el.innerHTML !== txt) {
					el.innerHTML = txt;
					DOM.setDirection(el, toJawi);
				}
			}
			if (toJawi) {
				for (const el of State.content.querySelectorAll(`.${CONFIG.NOCONVERT_CLASS}`)) {
					el.innerHTML = TextProcessor.apply(el.textContent, true);
				}
			}
		},
		validateFormMapping: (formId, rumi, dict) => !!(formId && rumi && dict?.formMappings?.[formId] && dict.formMappings[formId].toLowerCase() === rumi.toLowerCase())
	};
	// ============================================================================
	// UI MANAGEMENT
	// ============================================================================
	const UIManager = {
		setupStyles() {
			document.getElementById("rumi-jawi-styles")?.remove();
			const style = document.createElement("style");
			style.id = "rumi-jawi-styles";
			style.textContent = `
				.IPA, .IPA *, .chemf, .chemf *, .barelink, .barelink *, .number, .number * { 
					direction: ltr !important; unicode-bidi: isolate !important; 
				}
				.hamza-span { vertical-align: 30%; line-height: 1.0; }
				[dir="rtl"] table.clade td.clade-label { 
					border-left: none !important; border-right: 1px solid !important; 
				}
				[dir="rtl"] table.clade td.clade-label.first { 
					border-left: none !important; border-right: none !important; 
				}
				[dir="rtl"] table.clade td.clade-label.reverse { 
					border-left: 1px solid !important; border-right: none !important; 
				}
				[dir="rtl"] table.clade td.clade-slabel { 
					border-left: none !important; border-right: 1px solid !important; 
				}
				[dir="rtl"] table.clade td.clade-slabel.last { 
					border-left: none !important; border-right: none !important; 
				}
				[dir="rtl"] table.clade td.clade-slabel.reverse { 
					border-left: 1px solid !important; border-right: none !important; 
				}
				[dir="rtl"] table.clade td.clade-bar { text-align: right !important; }
				[dir="rtl"] table.clade td.clade-bar.reverse { text-align: left !important; }
				[dir="rtl"] table.clade td.clade-leaf { text-align: right !important; }
				[dir="rtl"] table.clade td.clade-leafR { text-align: left !important; }
				[dir="rtl"] table.clade td.clade-leaf.reverse { text-align: left !important; }
				.converter-popover-content .cdx-field { margin: 0; }
			`;
			document.head.appendChild(style);
		},
		async setupControls() {
			const currentSkin = mw.config.get('skin');
			const isMinerva = currentSkin === 'minerva';
			const isMainPage = ['Laman_Utama', 'Perbincangan:Laman_Utama'].includes(mw.config.get('wgPageName'));
			const portletBar = (isMinerva && isMainPage) ? document.querySelector("#mw-content-subtitle") : document.querySelector("#p-associated-pages, #p-namespaces, #p-cactions");
			if (!portletBar) return;
			const existingPortlet = document.getElementById("ca-languageconverter");
			if (existingPortlet) {
				if (existingPortlet.__vue_app__) {
					existingPortlet.__vue_app__.unmount();
					existingPortlet.__vue_app__ = null;
				}
				existingPortlet.remove();
			}
			await mw.loader.using('@wikimedia/codex').then((require) => {
				const Vue = require('vue');
				const { CdxField, CdxRadio, CdxPopover, CdxButton, CdxProgressBar } = require('@wikimedia/codex');
				const persistentScript = Storage.get("persistentScript");
				const persistentLang = Storage.get("persistentLang");
				const currentLanguage = persistentLang || mw.config.get("wgUserLanguage");
				let portletElem, triggerElement, popoverContainer;
				if (isMinerva && isMainPage) {
					const button = document.createElement("a");
					Object.assign(button, {
						id: "ca-languageconverter",
						role: "button",
						href: "#",
						className: "cdx-button cdx-button--size-large cdx-button--fake-button " + "cdx-button--fake-button--enabled converter-button button",
						title: "WikiProjek Penukar Tulisan"
					});
					portletBar.appendChild(button);
					portletElem = triggerElement = button;
					popoverContainer = document.createElement("div");
					popoverContainer.className = "converter-popover-container";
					portletElem.parentNode.insertBefore(popoverContainer, portletElem.nextSibling);
				} else {
					mw.util.addPortletLink(portletBar.id, "#", "Tukar tulisan", "ca-languageconverter", "WikiProjek Penukar Tulisan");
					portletElem = document.getElementById("ca-languageconverter");
					if (!portletElem) return;
					triggerElement = portletElem.querySelector("a");
					if (!triggerElement) return;
					popoverContainer = document.createElement("div");
					popoverContainer.className = "converter-popover-container";
					portletElem.appendChild(popoverContainer);
				}
				const updateButtonText = (isJawi) => {
					const buttonText = isJawi ? 'توکر توليسن' : 'Tukar tulisan';
					const lang = isJawi ? 'ms-arab' : 'ms';
					triggerElement.innerHTML = `<span class="convertible-text" data-rumi="Tukar tulisan" lang="${lang}">${buttonText}</span>`;
				};
				updateButtonText(persistentScript === 'jawi');
				const converterApp = Vue.createMwApp({
					components: { CdxField, CdxRadio, CdxPopover, CdxButton, CdxProgressBar },
					data() {
						return {
							showPopover: false,
							loading: false,
							triggerElement: null,
							selectedScript: persistentScript === "jawi" ? "jawi-script" : "rumi-script",
							selectedLang: currentLanguage === "ms-arab" ? "ms-arab" : "ms",
							scriptOptions: [
								{ value: "rumi-script", label: "Rumi" },
								{ value: "jawi-script", label: "Jawi" }
							],
							langOptions: [
								{ value: "ms", label: "Rumi" },
								{ value: "ms-arab", label: "Jawi" }
							],
							labels: {
								rumi: {
									loadDictionary: "[Memuat data perkamusan]",
									contentConverter: "Penukar kandungan",
									interfaceConverter: "Penukar antara muka",
									versionCode: `(Versi kod: ${CONFIG.VERSION})`,
									rumi: "Rumi",
									jawi: "Jawi"
								},
								jawi: {
									loadDictionary: "[مموات داتا ڤرقاموسن]",
									contentConverter: "ڤنوکر کندوڠن",
									interfaceConverter: "ڤنوکر انتارا موک",
									versionCode: `(ۏرسي کود: ${CONFIG.VERSION})`,
									rumi: "رومي",
									jawi: "جاوي"
								}
							}
						};
					},
					computed: {
						currentLabels() {
							return this.selectedScript === "jawi-script" ? this.labels.jawi : this.labels.rumi;
						}
					},
					beforeUnmount() {
						if (this._unsubscribeLoading) this._unsubscribeLoading();
					},
					mounted() {
						this.triggerElement = triggerElement;
						this._unsubscribeLoading = LoadingState.subscribe((val) => { this.loading = val; });
						this.loading = LoadingState.isLoading;
						triggerElement.addEventListener("click", (e) => {
							e.preventDefault();
							this.showPopover = !this.showPopover;
						});
					},
					methods: {
						async handleScriptChange() {
							if (this.loading) return;
							const isJawi = this.selectedScript === "jawi-script";
							Storage.set("persistentScript", isJawi ? "jawi" : "rumi");
							await Converter.convert(isJawi);
							State.setScript(isJawi ? "jawi" : "rumi");
							updateButtonText(isJawi);
						},
						async handleLangChange() {
							Storage.set("persistentLang", this.selectedLang);
							try {
								await new mw.Api().saveOption("language", this.selectedLang);
							} catch (error) {
								console.error("Failed to save language preference:", error);
							}
							window.location.reload();
						},
						onUpdate(value) {
							if (CONFIG.DEBUG) console.log('Popover visibility changed:', value);
						}
					},
					template: `
						<cdx-popover
							v-model:open="showPopover"
							:anchor="triggerElement"
							placement="bottom-start"
							:render-in-place="true"
							@update:open="onUpdate"
						>
							<div class="converter-popover-content" 
								:lang="selectedScript === 'jawi-script' ? 'ms-arab' : 'ms'">
								<cdx-progress-bar
									v-if="loading"
									:inline="true"
									class="converter-loading-bar"
								/>
								<span v-if="loading">
									{{ currentLabels.loadDictionary }}
								</span>
								<cdx-field :is-fieldset="true">
									<template #label>
										<span :lang="selectedScript === 'jawi-script' ? 'ms-arab' : 'ms'">
											{{ currentLabels.contentConverter }}
										</span>
									</template>
									<cdx-radio 
										v-for="option in scriptOptions" 
										:disabled="loading"
										:key="'script-' + option.value"
										v-model="selectedScript" 
										name="script-group" 
										:input-value="option.value"
										class="cdx-radio--inline" 
										@change="handleScriptChange">
										<span :lang="selectedScript === 'jawi-script' ? 'ms-arab' : 'ms'">
											{{ currentLabels[option.label.toLowerCase()] }}
										</span>
									</cdx-radio>
								</cdx-field>
								<cdx-field :is-fieldset="true">
									<template #label>
										<span :lang="selectedScript === 'jawi-script' ? 'ms-arab' : 'ms'">
											{{ currentLabels.interfaceConverter }}
										</span>
									</template>
									<cdx-radio 
										v-for="option in langOptions" 
										:disabled="loading"
										:key="'lang-' + option.value"
										v-model="selectedLang" 
										name="lang-group" 
										:input-value="option.value"
										class="cdx-radio--inline" 
										@change="handleLangChange">
										<span :lang="selectedScript === 'jawi-script' ? 'ms-arab' : 'ms'">
											{{ currentLabels[option.label.toLowerCase()] }}
										</span>
									</cdx-radio>
								</cdx-field>
								<span :lang="selectedScript === 'jawi-script' ? 'ms-arab' : 'ms'">
									{{ currentLabels.versionCode }}
								</span>
							</div>
						</cdx-popover>
					`
				});
				popoverContainer.__vue_app__ = converterApp.mount(popoverContainer);
				portletElem.__vue_app__ = converterApp;
			});
		},
		initialize() {
			this.setupStyles();
			this.setupControls();
		}
	};
	// ============================================================================
	// INITIALIZATION
	// ============================================================================
	const checkPageContext = () => {
		try {
			return typeof mw.config.get("wgNamespaceNumber") !== "undefined" && !["edit", "submit"].includes(mw.config.get("wgAction")) && !document.querySelector(".ve-active, .wikiEditor-ui") && !mw.config.get("wgVisualEditor")?.isActive;
		} catch (e) {
			CONFIG.DEBUG && console.warn("checkPageContext failed:", e);
			return false;
		}
	};
	const getRequiredElements = () => {
		const content = document.querySelector("#mw-content-text .mw-parser-output");
		const title = document.querySelector(".mw-first-heading");
		if (!content || !title) throw new Error("Required content elements not found");
		return { content, title };
	};
	async function initializeApp() {
		if (State.initialized || !checkPageContext()) return;
		try {
			const { content, title } = getRequiredElements();
			State.init(content, title);
			UIManager.initialize();
			TemplateManager.initialize();
			SpecialContent.wrapSpecialElements();
			State.dictionary = await DictionaryManager.fetch();
			const persistentScript = Storage.get("persistentScript");
			const persistentLang = Storage.get("persistentLang");
			const userLang = persistentLang || mw.config.get("wgUserLanguage");
			const isJawi = persistentScript ? persistentScript === "jawi" : userLang === "ms-arab";
			State.setScript(isJawi ? "jawi" : "rumi");
			const setRadioChecked = (value) => {
				State.content.querySelectorAll(`.cdx-radio__input[value="${value}"]`).forEach(radio => radio.checked = true);
			};
			setRadioChecked(isJawi ? "jawi-script" : "rumi-script");
			setRadioChecked(userLang === "ms-arab" ? "ms-arab" : "ms");
			if (isJawi) await Converter.convert(true);
			State.initialized = true;
			CONFIG.DEBUG && console.log("Rumi-Jawi converter initialized successfully");
		} catch (error) {
			console.error("Initialization failed:", error);
		}
	}
	let initTimeout;
	const debouncedInit = () => {
		clearTimeout(initTimeout);
		initTimeout = setTimeout(initializeApp, 100);
	};
	if (typeof mw !== 'undefined' && mw.hook) {
		mw.hook("wikipage.content").add(debouncedInit);
	}
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", debouncedInit);
	} else {
		requestAnimationFrame(debouncedInit);
	}
})();
