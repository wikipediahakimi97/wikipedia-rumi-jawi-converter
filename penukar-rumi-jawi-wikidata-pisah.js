/**
 ** LOG:
 ** Updated on 14th September 2025
 **
 **/

/* Convert the text from rumi to jawi script using WDQS
* With separated options. Penukar kandungan: Jawi/Rumi 
*                         Penukar antara muka: Jawi/Rumi
*/

/* Original author: [[Pengguna:Hakimi97]] */

/* Licensed under the terms of the GNU General Public License version 3.0
* as published by the Free Software Foundation; See the
* GNU General Public License for more details.
* A copy of the GPL is available at https://www.gnu.org/licenses/gpl-3.0.txt 
*/

(() => {
  // --- Constants ---
  const CACHE_KEY = "rumiJawiData", CACHE_DURATION = 3600000, DEBUG = false;
  const SPARQL_URL = "https://query-main.wikidata.org/sparql";
  const SPARQL_QUERY = `SELECT DISTINCT ?formId ?latn ?arab (GROUP_CONCAT(DISTINCT ?featureLabel; SEPARATOR=", ") AS ?features) 
    WHERE {
      ?lexEntry dct:language wd:Q9237; ontolex:lexicalForm ?form.
      BIND(STRAFTER(STR(?form), "http://www.wikidata.org/entity/") AS ?formId)
      ?form ontolex:representation ?latn FILTER (lang(?latn) = "ms")
      ?form ontolex:representation ?arab FILTER (lang(?arab) = "ms-arab")
      OPTIONAL { ?form wikibase:grammaticalFeature ?feature.
        ?feature rdfs:label ?featureLabel FILTER (lang(?featureLabel) = "en") }
      FILTER (!BOUND(?feature) || (
        ?feature != wd:Q98912 && ?feature != wd:Q8185162 && ?feature != wd:Q10617810
      ))
    }
    GROUP BY ?formId ?latn ?arab`;

  const CONFIG = {
    TEMPLATE_CLASS: "mw-explicit-form-mapping",
    NOCONVERT_CLASS: "mw-no-convert-text",
    TEMPLATE_DATA_ATTR: "data-form-id",
    TEMPLATE_ORIG_TEXT_ATTR: "data-rumi-text",
    SUPPORTED_SKINS: ["vector-2022", "vector", "monobook", "timeless", "minerva"],
    NAMESPACE_CLASS: "mw-list-item",
    SKIP_CLASSES: ["IPA", "chemf", "barelink", "number"],
    PUNCTUATION_MAP: { ",": "⹁", ";": "⁏", "?": "؟" }
  };

  // --- Utilities ---
  const DOM = {
    setContent: (el, content, isHTML = false) => isHTML ? (el.innerHTML = content) : (el.textContent = content),
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
    isSkippableElement: (el) => {
      if (!el) return true;
      if (el.classList?.contains(CONFIG.NOCONVERT_CLASS) || el.classList?.contains(CONFIG.TEMPLATE_CLASS)) return true;
      if (el.tagName === 'SPAN' && DOM.hasSkipClass(el)) return true;
      return false;
    },
    createWalker: (root, acceptNode) => document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode }),
    collectNodes: (walker) => {
      const nodes = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
      return nodes;
    }
  };

  const Storage = {
    get: (key) => typeof window.Storage !== 'undefined' ? localStorage.getItem(key) : null,
    set: (key, value) => typeof window.Storage !== 'undefined' && localStorage.setItem(key, value)
  };

  // --- State & Data Management ---
  const State = {
    script: "rumi", dictionary: null, templateOverrides: new Map(), initialized: false,
    content: null, title: null, originalContent: null, originalTitle: null,
    
    init(content, title) {
      this.content = content;
      this.title = title;
      return this;
    },
    
    setScript(script) {
      this.script = script;
      return this;
    }
  };

  const DictionaryManager = {
    async fetch() {
      return this.loadFromCache() || await this.fetchFromAPI();
    },
    
    loadFromCache() {
      const cached = Storage.get(CACHE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          const { timestamp, data } = parsed || {};
          if (timestamp && Date.now() - timestamp < CACHE_DURATION) return data;
        } catch (e) {
          DEBUG && console.warn("Failed to parse cache, clearing:", e);
          try { localStorage.removeItem(CACHE_KEY); } catch (e2) {}
        }
      }
      return null;
    },
    
    async fetchFromAPI() {
      try {
        const controller = new AbortController();
        const to = setTimeout(() => controller.abort(), 30000);
        
        const response = await fetch(
          `${SPARQL_URL}?query=${encodeURIComponent(SPARQL_QUERY)}&format=json`,
          { headers: { Accept: "application/sparql-results+json" }, signal: controller.signal }
        );
        
        clearTimeout(to);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const result = await response.json();
        const processedData = this.process(result);
        
        Storage.set(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: processedData }));
        return processedData;
      } catch (err) {
        DEBUG && console.error("Dictionary fetch failed:", err);
        return { words: {}, phrases: {}, forms: {}, formMappings: {} };
      }
    },
    
    process(data) {
      const dict = { words: {}, phrases: {}, forms: {}, formMappings: {}, _regex: {} };
      for (const { formId, latn, arab } of data?.results?.bindings ?? []) {
        if (!formId || !latn || !arab) continue;
        const rumi = latn.value.toLowerCase(), jawi = arab.value, fid = formId.value;
        dict.forms[fid] = jawi;
        dict.formMappings[fid] = rumi;
        (rumi.includes(" ") ? dict.phrases : dict.words)[rumi] = fid;
      }
      
      // Build bounded regex for phrases and words (longest-first)
      const buildRegex = (obj) => {
        const keys = Object.keys(obj).sort((a,b)=>b.length-a.length).map(k=>k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        if (!keys.length) return null;
        // Use non-capturing group with word boundary anchors so we don't match inside other words.
        // For multi-word phrases, boundaries still work as keys contain spaces.
        return new RegExp(`(?:^|\\b)(${keys.join("|")})(?=\\b|$)`, "gi");
      };
      dict._regex.phrases = buildRegex(dict.phrases);
      dict._regex.words = buildRegex(dict.words);
      
      return dict;
    }
  };

  // --- Converter ---
  const Converter = {
    async convert(toJawi) {
      if (!State.dictionary) State.dictionary = await DictionaryManager.fetch();
      
      TemplateManager.process(toJawi);
      
      const convertibleEls = [
        ...document.querySelectorAll('.convertible-text'),
        ...document.querySelectorAll('.vector-toc-text')
      ];
      
      for (const el of convertibleEls) {
        if (DOM.isSkippableElement(el)) continue;
        
        if (!el.hasAttribute('data-rumi')) el.setAttribute('data-rumi', el.textContent);
        const rumi = el.getAttribute('data-rumi');
        let txt = toJawi ? this.convertText(rumi, State.dictionary) : rumi;
        if (toJawi) txt = enhanceText(txt);
        
        DOM.setContent(el, txt, true);
        DOM.setDirection(el, toJawi);
      }
      
      if (toJawi) {
        await this.convertToJawi();
        this.handleTableStyles(true);
      } else {
        this.revertToRumi();
        this.handleTableStyles(false);
      }
    },
    
    async convertToJawi() {
      if (!State.originalContent) {
        State.originalContent = State.content.innerHTML;
        State.originalTitle = State.title.textContent;
      }
      
      this.preprocessKafDal();
      // Only change direction and language on the container div itself
      State.content.setAttribute('dir', 'rtl');
      State.content.setAttribute('lang', 'ms-arab');
      DOM.setDirection(State.title, true);
      
      let convertedTitle = this.convertText(State.title.textContent, State.dictionary);
      DOM.setContent(State.title, enhanceText(convertedTitle), true);
      
      const walker = DOM.createWalker(State.content, node => {
        const p = node.parentElement;
        if (!p || ["SCRIPT", "STYLE"].includes(p.tagName)) return NodeFilter.FILTER_REJECT;
        if (p.closest("#p-navigation, .mw-portlet, .vector-menu, .mw-header")) return NodeFilter.FILTER_REJECT;
        
        let currentElement = p;
        while (currentElement && currentElement !== State.content) {
          if (DOM.isSkippableElement(currentElement)) return NodeFilter.FILTER_REJECT;
          currentElement = currentElement.parentElement;
        }
        
        return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      });
      
      const textNodes = DOM.collectNodes(walker);
      let idx = 0, chunk = 50;
      
      const processChunk = () => {
        for (let i = idx; i < Math.min(idx + chunk, textNodes.length); i++) {
          const n = textNodes[i];
          if (n?.textContent?.trim()) {
            let converted = this.convertText(n.textContent, State.dictionary);
            converted = enhanceText(converted);
            
            if (converted !== n.textContent) {
              if (converted.includes('<span')) {
                const tempDiv = document.createElement("div");
                DOM.setContent(tempDiv, converted, true);
                // If the converted content is a single span, use it directly.
                // Otherwise, wrap everything in a new span.
                if (tempDiv.children.length === 1 && tempDiv.childNodes.length === 1 && tempDiv.firstElementChild.tagName === 'SPAN') {
                    n.parentNode?.replaceChild(tempDiv.firstElementChild, n);
                } else {
                    const span = document.createElement("span");
                    DOM.setContent(span, converted, true);
                    n.parentNode?.replaceChild(span, n);
                }
              } else {
                n.textContent = converted;
              }
            }
            
            // Remove per-element direction setting, as it's now handled at container level
            // Only set direction for specific elements that need it (like IPA, numbers, etc.)
            let p = n.parentElement;
            while (p && p !== State.content) {
              if (p.nodeType === 1 && p.closest("#mw-content-text .mw-parser-output") && DOM.hasSkipClass(p)) {
                DOM.setDirection(p, true);
              }
              p = p.parentElement;
            }
          }
        }
        idx += chunk;
        if (idx < textNodes.length) requestAnimationFrame(processChunk);
      };
      
      requestAnimationFrame(processChunk);
    },
    
    revertToRumi() {
      if (State.originalContent) {
        State.content.innerHTML = State.originalContent;
        DOM.setContent(State.title, State.originalTitle);
        // Reset direction and language on the container div
        State.content.setAttribute('dir', 'ltr');
        State.content.setAttribute('lang', 'ms');
        DOM.setDirection(State.title, false);
        State.originalContent = State.originalTitle = null;
      }
      
      for (const el of document.querySelectorAll(`.${CONFIG.TEMPLATE_CLASS}`)) {
        const rumi = el.getAttribute(CONFIG.TEMPLATE_ORIG_TEXT_ATTR);
        if (rumi) {
          DOM.setContent(el, rumi, true);
          DOM.setDirection(el, false);
        }
      }
    },
    
    convertText(text, dict) {
      if (!text?.trim() || !dict) return text;
      
      const numbers = [];
      let result = text.replace(
        /(?:^|(?<=\s|[^\w]))([+\-*/^]?)([A-Z]{2,4}[$£¢€¥₹₽]|[$£¢€¥₹₽])?(?:\d{1,2}:\d{2}(?::\d{2})?(?::\d{2})?|\d+(?:[.,]\d{3})*(?:[.,]\d+)?%|\d+(?:[.,]\d+)?%|\d+\/\d+|\d+:\d+(?::\d+)*|°?\d+(?:[.,]\d+)?°?(?:[CF]|(?:\d{1,2}'(?:\d{1,2}'')?))|\d+(?:[.,]\d{3})*(?:[.,]\d+)?(?![a-zA-Z]))([+\-*/^]?)([$£¢€¥₹₽][A-Z]{2,4}|°[CF]?)?(?=\s|$|[^\w])/g,
        m => `__NUM${numbers.push(`<span class="number">${m.trim()}</span>`) - 1}__`
      );
      
      const replaceByDict = (str, dictObj, filter = () => true) => {
        const keys = Object.keys(dictObj).filter(filter).sort((a, b) => b.length - a.length);
        if (!keys.length) return str;
        const regex = new RegExp(keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "gi");
        return str.replace(regex, m => dict.forms[dictObj[m.toLowerCase()]] || m);
      };
      
      result = replaceByDict(result, dict.phrases);
      result = replaceByDict(result, dict.words, w => w.includes("'"));
      
      // Handle hyphenated words
      result = result.replace(/\b\w+(?:[\-–—]\w+)+\b/g, m => {
        const fid = dict.words[m.toLowerCase()];
        if (fid) return dict.forms[fid];
        return m.split(/[\-–—]/).map(part => {
          const pfid = dict.words[part.toLowerCase()];
          return pfid ? dict.forms[pfid] : part;
        }).join(m.includes('–') ? '–' : m.includes('—') ? '—' : '-');
      });
      
      // Handle single words
      const singleWordRegex = /(?:^|[\s\.,;:!?\(\)\[\]{}'"'""\/\\])([\w\u00C0-\uFFFF]+)(?=[\s\.,;:!?\(\)\[\]{}'"'""\/\\]|$)/g;
      result = result.replace(singleWordRegex, (match, word) => {
        const fid = dict.words[word.toLowerCase()];
        const converted = fid ? dict.forms[fid] : word;
        return match.replace(word, converted);
      });
      
      // Handle specific patterns
      result = result.replace(/\b(ک|د)\s+(ک|د)\b/g, (match, first, second) => 
        first === second ? `${first} ${second}` : match);
      result = result.replace(/(^|[\s]+)([کد])\s+(\S+)/g, (match, space, letter, nextWord) =>
        nextWord.startsWith("ا") ? `${space}${letter}أ${nextWord.slice(1)}` : `${space}${letter}${nextWord}`);
      
      // Handle punctuation with proper spacing - convert only if followed by whitespace
      result = result.replace(/([,;?])(?=\s)/g, (match, punct) => {
        const replacement = CONFIG.PUNCTUATION_MAP[punct] || punct;
        return replacement;
      });
      
      numbers.forEach((n, i) => result = result.replace(`__NUM${i}__`, n));
      return result;
    },
    
    preprocessKafDal() {
      const walker = DOM.createWalker(State.content, node => {
        const parent = node.parentElement;
        if (!parent || parent.tagName === 'A') return NodeFilter.FILTER_REJECT;
        const hasKeDi = /\b(ke|di)\s+$/i.test(node.textContent);
        const nextEl = node.nextElementSibling;
        return hasKeDi && nextEl?.tagName === 'A' && !/^(ke|di)\b/i.test(nextEl.textContent.trim()) ?
          NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      });
      
      for (const node of DOM.collectNodes(walker)) {
        const match = node.textContent.match(/^(.*?)\b(ke|di)\s+$/i);
        if (match) {
          const [, prefix, keDi] = match;
          const nextLink = node.nextElementSibling;
          if (nextLink?.tagName === 'A') {
            node.textContent = prefix;
            nextLink.textContent = `${keDi} ${nextLink.textContent.trim()}`;
          }
        }
      }
    },
    
    handleTableStyles(toJawi) {
      const elements = document.querySelectorAll('table, table *');
      for (const element of elements) {
        if (element.className && /clade-\w+/i.test(element.className) && element.style) {
          if (toJawi) {
            const borderLeft = element.style.borderLeft;
            const borderRight = element.style.borderRight;
            if (!element.hasAttribute('data-original-border-left')) {
              element.setAttribute('data-original-border-left', borderLeft || '');
              element.setAttribute('data-original-border-right', borderRight || '');
            }
            element.style.borderLeft = borderRight;
            element.style.borderRight = borderLeft;
          } else if (element.hasAttribute('data-original-border-left')) {
            element.style.borderLeft = element.getAttribute('data-original-border-left') || '';
            element.style.borderRight = element.getAttribute('data-original-border-right') || '';
            element.removeAttribute('data-original-border-left');
            element.removeAttribute('data-original-border-right');
          }
        }
      }
    }
  };

  // --- Template Manager ---
  const TemplateManager = {
    initialize() {
      for (const el of document.querySelectorAll("[data-form-id]")) {
        if (el.classList.contains(CONFIG.TEMPLATE_CLASS)) continue;
        const formId = el.getAttribute(CONFIG.TEMPLATE_DATA_ATTR);
        if (!formId) continue;
        if (!el.hasAttribute(CONFIG.TEMPLATE_ORIG_TEXT_ATTR))
          el.setAttribute(CONFIG.TEMPLATE_ORIG_TEXT_ATTR, el.textContent);
        el.classList.add(CONFIG.TEMPLATE_CLASS);
      }
      
      for (const el of document.querySelectorAll("[data-no-convert]")) 
        el.classList.add(CONFIG.NOCONVERT_CLASS);
    },
    
    process(toJawi) {
      State.templateOverrides.clear();
      
      for (const el of document.querySelectorAll(`.${CONFIG.TEMPLATE_CLASS}`)) {
        const rumi = el.getAttribute(CONFIG.TEMPLATE_ORIG_TEXT_ATTR);
        const formId = el.getAttribute(CONFIG.TEMPLATE_DATA_ATTR);
        
        if (rumi && formId) State.templateOverrides.set(rumi.toLowerCase(), { formId });
        
        if (!this.validateFormMapping(formId, rumi, State.dictionary)) {
          el.classList.add(CONFIG.NOCONVERT_CLASS);
          el.classList.remove(CONFIG.TEMPLATE_CLASS);
          continue;
        }
        
        let txt = toJawi ? State.dictionary.forms[formId] || rumi : rumi;
        if (toJawi) txt = enhanceText(txt);
        
        if (el.innerHTML !== txt) {
          DOM.setContent(el, txt, true);
          DOM.setDirection(el, toJawi);
        }
      }
      
      if (toJawi) {
        for (const el of document.querySelectorAll(`.${CONFIG.NOCONVERT_CLASS}`))
          DOM.setContent(el, enhanceText(el.textContent), true);
      }
    },
    
    validateFormMapping(formId, rumi, dict) {
      return !!(formId && rumi && dict?.formMappings?.[formId] && 
        dict.formMappings[formId].toLowerCase() === rumi.toLowerCase());
    }
  };
  
  // --- Text Processing ---
  function enhanceText(text) {
    if (!text) return text;
    
    // Handle hamza with exceptions
    const exceptions = { skip: ["القرءان"], force: ["چيء", "داتوء", "توء", "نيء"] };
    let tempMap = {};
    
    exceptions.skip.forEach((ex, i) => {
      const key = `__EXC${i}__`;
      tempMap[key] = ex;
      text = text.replaceAll(ex, key);
    });
    
    const hamzaSpan = '<span class="hamza-span">ء</span>';
    exceptions.force.forEach(word => text = text.replaceAll(word, word.replace(/ء/g, hamzaSpan)));
    
    text = text.replace(/([\s"'"'{\(\[<])ء(?=[\u0600-\u06FF])/g, (_, p1) => p1 + hamzaSpan);
    text = text.replace(/([\u0600-\u06FF])ء(?=[\u0600-\u06FF])/g, (_, p1) => p1 + hamzaSpan);
    
    Object.entries(tempMap).forEach(([k, ex]) => text = text.replaceAll(k, ex));
    
    // Handle IPA segments
    text = text.replace(/(["'])?([\/\[])(<span[^>]*>[\s\S]+?<\/span>)([\/\]])\1?/g,
      (m, quote, open, inner, close) =>
        quote ? `${quote}\u2066${open}${inner}${close}\u2069${quote}` : `\u2066${open}${inner}${close}\u2069`
    );
    text = text.replace(/([\/\[])([^\]\/<>]+)([\/\]])/g, (m, open, inner, close) =>
      ((open === '/' && close === '/') || (open === '[' && close === ']')) && /[\u0250-\u02AF.ˈˌ|‖]/.test(inner)
        ? `\u2066${open}${inner}${close}\u2069` : m
    );
    
    return text;
  }

  function isChemicalElement(textNode, subSupNode) {
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return false;
    const txt = textNode.textContent.trim();
    // A single generalized regex for chemical formulas, including complex ions and hydrates.
    const chemPattern = /^(?:[α-ω]-)?(?:[A-Z][a-z]?\d*|\((?:[A-Z][a-z]?\d*)+\)\d*|\[(?:[A-Z][a-z]?\d*|\((?:[A-Z][a-z]?\d*)+\)\d*)+\]\d*)+(?:[·-](?:[A-Z][a-z]?\d*|\d*[A-Z][a-z]?))*$/;
    if (!chemPattern.test(txt)) return false;

    if (subSupNode) {
      if (!["SUB", "SUP"].includes(subSupNode.nodeName)) return false;
      const subSupText = subSupNode.textContent.trim();
      const hasId = subSupNode.getAttribute?.("id");
      return hasId && /^(\d+)([+-])?$/.test(subSupText);
    }
    return true; // It's a chemical element part even without sub/sup
  }

  function wrapSpecialElements() {
    // Wrap chemical formulas
    const chemWalker = DOM.createWalker(document.body, node => {
      const parent = node.parentElement;
      if (!parent || parent.classList.contains('chemf')) return NodeFilter.FILTER_REJECT;
      return node.nextSibling && isChemicalElement(node, node.nextSibling) ? 
        NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    });
    
    const processedNodes = new Set();
    const textNodes = DOM.collectNodes(chemWalker);
    
    for (const textNode of textNodes) {
      if (processedNodes.has(textNode)) continue;
      
      const consecutiveElements = [];
      let currentNode = textNode;
      
      // More comprehensive chemical element validation including compounds and Greek prefixes
      if (!isChemicalElement(currentNode, currentNode.nextSibling)) continue;
      
      while (currentNode?.nextSibling && isChemicalElement(currentNode, currentNode.nextSibling)) {
        consecutiveElements.push({ text: currentNode, subSup: currentNode.nextSibling });
        currentNode = currentNode.nextSibling.nextSibling;
        
        // Skip whitespace nodes
        while (currentNode?.nodeType === Node.TEXT_NODE && !currentNode.textContent.trim()) {
          currentNode = currentNode.nextSibling;
        }
        
        // Stop if we encounter a text node that's not a chemical element
        if (currentNode?.nodeType === Node.TEXT_NODE) {
          // More comprehensive validation for next chemical element
          if (!isChemicalElement(currentNode, currentNode.nextSibling)) {
            break;
          }
        }
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
    
    // Wrap bare links
    const linkWalker = DOM.createWalker(document.body, node => {
      const parent = node.parentElement;
      return (!parent || parent.classList.contains('barelink')) ? NodeFilter.FILTER_REJECT :
        /^https?:\/\/\S+$/.test(node.textContent.trim()) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    });
    
    for (const node of DOM.collectNodes(linkWalker)) {
      const wrapper = document.createElement('span');
      wrapper.className = 'barelink';
      wrapper.textContent = node.textContent.trim();
      node.parentNode.replaceChild(wrapper, node);
    }
  }

  // --- UI Manager ---
  const UIManager = {
    setupStyles() {
      document.getElementById("rumi-jawi-styles")?.remove();
      const css = `
        .IPA, .IPA *, .chemf, .chemf *, .barelink, .barelink *, .number, .number * { 
          direction: ltr !important; unicode-bidi: isolate !important; 
        }
        .hamza-span { vertical-align: 28%; line-height: 1.0; }
        [dir="rtl"] table.clade td.clade-label { border-left: none !important; border-right: 1px solid !important; }
        [dir="rtl"] table.clade td.clade-label.first { border-left: none !important; border-right: none !important; }
        [dir="rtl"] table.clade td.clade-label.reverse { border-left: 1px solid !important; border-right: none !important; }
        [dir="rtl"] table.clade td.clade-slabel { border-left: none !important; border-right: 1px solid !important; }
        [dir="rtl"] table.clade td.clade-slabel.last { border-left: none !important; border-right: none !important; }
        [dir="rtl"] table.clade td.clade-slabel.reverse { border-left: 1px solid !important; border-right: none !important; }
        [dir="rtl"] table.clade td.clade-bar { text-align: right !important; }
        [dir="rtl"] table.clade td.clade-bar.reverse { text-align: left !important; }
        [dir="rtl"] table.clade td.clade-leaf { text-align: right !important; }
        [dir="rtl"] table.clade td.clade-leafR { text-align: left !important; }
        [dir="rtl"] table.clade td.clade-leaf.reverse { text-align: left !important; }
        .converter-container { list-style: none !important; margin-left: 1rem !important;}
        .converter-container > div { list-style: none !important;}
        .converter-container > div:last-child { border-bottom: none !important;}
        #n-languageconverter .cdx-field:nth-child(2) { margin-top: 0 !important; }
        .skin-vector:not(.skin-vector-2022) #n-languageconverter .cdx-label__label__text { font-size: 0.75em !important; line-height: 1.125em !important; }
        .skin-monobook #n-languageconverter .cdx-label__label__text { font-size: 95% !important; }
        .skin-timeless #n-languageconverter .cdx-label__label__text { font-size: 0.95em !important; }
        .skin-timeless #n-languageconverter .cdx-label__label { margin: 0 0 0 0 !important; }
      `;
      const style = document.createElement("style");
      style.id = "rumi-jawi-styles";
      style.textContent = css;
      document.head.appendChild(style);
    },

    async setupControls() {
      const skin = mw.config.get("skin");
      if (!CONFIG.SUPPORTED_SKINS.includes(skin) || document.querySelector("#n-languageconverter")) return;
      
      const isMobile = skin === "minerva";
      const container = isMobile ? 
        document.querySelector(".menu") : 
        document.querySelector("#vector-pinned-container ul, #p-navigation ul");
      
      if (!container) return;
      
      // Cleanup existing
      document.querySelectorAll("#n-languageconverter, .converter-container").forEach(el => {
        if (el.__vue_app__) {
          try { el.__vue_app__.unmount(); } catch (e) { console.warn("Failed to unmount Vue app:", e); }
        }
        el.remove();
      });
      
      await mw.loader.using('@wikimedia/codex').then((require) => {
        const Vue = require('vue');
        const { CdxField, CdxRadio } = require('@wikimedia/codex');
        
        let converterContainer;
        if (isMobile) {
          const menuContainer = document.createElement("div");
          menuContainer.className = "converter-container";
          container.appendChild(menuContainer);
          converterContainer = document.createElement("div");
          converterContainer.id = "n-languageconverter";
          menuContainer.appendChild(converterContainer);
        } else {
          converterContainer = document.createElement("li");
          converterContainer.id = "n-languageconverter";
          converterContainer.className = CONFIG.NAMESPACE_CLASS;
          container.appendChild(converterContainer);
        }
        
        const persistentScript = Storage.get("persistentScript");
        const persistentLang = Storage.get("persistentLang");
        const currentLanguage = persistentLang || mw.config.get("wgUserLanguage");
        
        const converterApp = Vue.createMwApp({
          components: { CdxField, CdxRadio },
          data() {
            return {
              selectedScript: persistentScript ? (persistentScript === "jawi" ? "jawi-script" : "rumi-script") : "rumi-script",
              selectedLang: currentLanguage === "ms-arab" ? "ms-arab" : "ms",
              scriptOptions: [{ value: "rumi-script", label: "Rumi" }, { value: "jawi-script", label: "Jawi" }],
              langOptions: [{ value: "ms", label: "Rumi" }, { value: "ms-arab", label: "Jawi" }]
            };
          },
          methods: {
            async handleScriptChange() {
              const isJawi = this.selectedScript === "jawi-script";
              Storage.set("persistentScript", isJawi ? "jawi" : "rumi");
              await Converter.convert(isJawi);
              State.setScript(isJawi ? "jawi" : "rumi");
            },
            async handleLangChange() {
              Storage.set("persistentLang", this.selectedLang);
              try { await new mw.Api().saveOption("language", this.selectedLang); } 
              catch (error) { console.error("Failed to save language preference:", error); }
              window.location.reload();
            }
          },
          template: `
            <div>
              <cdx-field :is-fieldset="true">
                <template #label>
                  <span class="convertible-text" data-rumi="Penukar kandungan">Penukar kandungan</span>
                </template>
                <cdx-radio v-for="option in scriptOptions" :key="'script-' + option.value"
                  v-model="selectedScript" name="script-group" :input-value="option.value"
                  class="cdx-radio--inline" @change="handleScriptChange">
                  <span class="convertible-text" :data-rumi="option.label">{{ option.label }}</span>
                </cdx-radio>
              </cdx-field>
              <cdx-field :is-fieldset="true">
                <template #label>
                  <span class="convertible-text" data-rumi="Penukar antara muka">Penukar antara muka</span>
                </template>
                <cdx-radio v-for="option in langOptions" :key="'lang-' + option.value"
                  v-model="selectedLang" name="lang-group" :input-value="option.value"
                  class="cdx-radio--inline" @change="handleLangChange">
                  <span class="convertible-text" :data-rumi="option.label">{{ option.label }}</span>
                </cdx-radio>
              </cdx-field>
            </div>
          `
        });
        
        try { converterContainer.__vue_app__ = converterApp.mount(converterContainer); }
        catch (error) { console.error("Failed to mount converter app:", error); }
      });
    },

    initialize() {
      this.setupStyles();
      this.setupControls();
    }
  };

  // --- Initialization ---
  function checkPageContext() {
    try {
      return typeof mw.config.get("wgNamespaceNumber") !== "undefined" &&
        !["edit", "submit"].includes(mw.config.get("wgAction")) &&
        !document.querySelector(".ve-active, .wikiEditor-ui") &&
        !mw.config.get("wgVisualEditor")?.isActive;
    } catch { return false; }
  }

  function getRequiredElements() {
    const content = document.querySelector("#mw-content-text .mw-parser-output");
    const title = document.querySelector(".mw-first-heading");
    if (!content || !title) throw new Error("Required content elements not found");
    return { content, title };
  }

  async function initializeApp() {
    if (State.initialized || !checkPageContext()) return;
    
    try {
      const { content, title } = getRequiredElements();
      State.init(content, title);
      
      UIManager.initialize();
      TemplateManager.initialize();
      wrapSpecialElements();
      
      State.dictionary = await DictionaryManager.fetch();
      
      const persistentScript = Storage.get("persistentScript");
      const persistentLang = Storage.get("persistentLang");
      const isJawi = persistentScript ? persistentScript === "jawi" : 
        (persistentLang || mw.config.get("wgUserLanguage")) === "ms-arab";
      
      State.setScript(isJawi ? "jawi" : "rumi");
      
      // Set radio buttons
      const setRadioChecked = v => document.querySelectorAll(`.cdx-radio__input[value="${v}"]`)
        .forEach(r => r.checked = true);
      setRadioChecked(isJawi ? "jawi-script" : "rumi-script");
      setRadioChecked((persistentLang || mw.config.get("wgUserLanguage")) === "ms-arab" ? "ms-arab" : "ms");
      
      if (isJawi) await Converter.convert(true);
      State.initialized = true;
      
      DEBUG && console.log("Initialized successfully");
    } catch (error) { 
      console.error("Initialization failed:", error); 
    }
  }

  // Debounced initialization
  let initTimeout;
  const debouncedInit = () => {
    clearTimeout(initTimeout);
    initTimeout = setTimeout(initializeApp, 100);
  };

  if (typeof mw !== 'undefined' && mw.hook) mw.hook("wikipage.content").add(debouncedInit);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", debouncedInit);
  else requestAnimationFrame(debouncedInit);
})();
