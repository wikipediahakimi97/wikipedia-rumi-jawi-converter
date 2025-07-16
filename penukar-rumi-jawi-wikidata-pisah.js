/**
 ** LOG:
 ** Updated on 16th July 2025
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
  // --- Constants & Utilities ---
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

  const UI = {
    TEMPLATE_CLASS: "mw-explicit-form-mapping",
    NOCONVERT_CLASS: "mw-no-convert-text",
    TEMPLATE_DATA_ATTR: "data-form-id",
    TEMPLATE_ORIG_TEXT_ATTR: "data-rumi-text",
    SUPPORTED_SKINS: ["vector-2022", "vector", "monobook", "timeless", "minerva"],
    NAMESPACE_CLASS: "mw-list-item"
  };
  const PUNCTUATION_MAP = { ",": "⹁", ";": "⁏", "?": "؟" };

  // --- Utility Functions ---
  const safeSetInnerHTML = (el, html) => {
    if (typeof html === 'string' && html.includes('<')) {
      const d = document.createElement('div'); d.innerHTML = html;
      el.innerHTML = ''; while (d.firstChild) el.appendChild(d.firstChild);
    } else el.textContent = html;
  };
  const safeSetTextContent = (el, txt) => { el.textContent = txt; };
  const setRadioChecked = v => document.querySelectorAll(`.cdx-radio__input[value="${v}"]`).forEach(r => r.checked = true);

  function replaceHamzaWithSpan(text) {
    if (!text) return text;
    try {
      const skip = ["القرءان"], force = ["چيء", "داتوء", "توء", "نيء"];
      let map = {};
      skip.forEach((ex, i) => {
        const key = `__EXC${i}__`; map[key] = ex;
        text = text.replace(new RegExp(ex, "g"), key);
      });
      const hamzaSpan = '<span style="vertical-align: 28%; line-height:1.0;">ء</span>';
      force.forEach(word => {
        const wordWithSpan = word.replace(/ء/g, hamzaSpan);
        text = text.replace(new RegExp(word, "g"), wordWithSpan);
      });
      text = text.replace(/(^|[\s\(\[\{،⹁⁏؟:;,.!?-])ء(?=[\u0600-\u06FF])/g, (m, p1) => p1 + hamzaSpan);
      text = text.replace(/([\u0600-\u06FF])ء(?=[\u0600-\u06FF])/g, (m, p1) => p1 + hamzaSpan);
      Object.entries(map).forEach(([k, ex]) => { text = text.replace(new RegExp(k, "g"), ex); });
      return text;
    } catch (error) { console.error("Error in replaceHamzaWithSpan:", error); return text; }
  }

  function wrapIPASegmentsLTR(text) {
    if (!text) return text;
    const ipaHtmlRegex = /(["'])?([\/\[])(<span[^>]*>[\s\S]+?<\/span>)([\/\]])\1?/g;
    text = text.replace(ipaHtmlRegex, (match, quote, open, inner, close) =>
      quote ? `${quote}\u2066${open}${inner}${close}\u2069${quote}` : `\u2066${open}${inner}${close}\u2069`
    );
    const ipaPlainRegex = /([\/\[])([^\]\/<>]+)([\/\]])/g;
    const ipaSymbolRegex = /[\u0250-\u02AF.ˈˌ|‖]/;
    text = text.replace(ipaPlainRegex, (match, open, inner, close) =>
      ((open === '/' && close === '/') || (open === '[' && close === ']')) && ipaSymbolRegex.test(inner)
        ? `\u2066${open}${inner}${close}\u2069` : match
    );
    return text;
  }

  // --- State ---
  const State = {
    script: "rumi", content: null, title: null, originalContent: null, originalTitle: null,
    dictionary: null, templateOverrides: new Map(), initialized: false,
    init(content, title) { this.content = content; this.title = title; return this; },
    setScript(script) { this.script = script; return this; }
  };

  // --- Dictionary ---
  const DictionaryManager = {
    async fetch() { return this.loadFromCache() || await this.fetchFromAPI(); },
    loadFromCache() {
      try {
        if (typeof Storage === 'undefined') return null;
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const { timestamp, data } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_DURATION) return data;
        }
      } catch (e) { DEBUG && console.warn("Cache access error:", e); }
      return null;
    },
    async fetchFromAPI() {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        const response = await fetch(
          `${SPARQL_URL}?query=${encodeURIComponent(SPARQL_QUERY)}&format=json`,
          { headers: { Accept: "application/sparql-results+json" }, signal: controller.signal }
        );
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const result = await response.json();
        const processedData = this.process(result);
        try {
          if (typeof Storage !== 'undefined')
            localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: processedData }));
        } catch (e) { DEBUG && console.warn("Error storing in localStorage:", e); }
        return processedData;
      } catch (error) {
        console.error("Error fetching Rumi-Jawi data:", error);
        return { words: {}, phrases: {}, forms: {}, formMappings: {} };
      }
    },
    process(data) {
      const dict = { words: {}, phrases: {}, forms: {}, formMappings: {} };
      data?.results?.bindings?.forEach(({ formId, latn, arab }) => {
        if (!formId || !latn || !arab) return;
        const rumi = latn.value.toLowerCase(), jawi = arab.value, fid = formId.value;
        dict.forms[fid] = jawi; dict.formMappings[fid] = rumi;
        (rumi.includes(" ") ? dict.phrases : dict.words)[rumi] = fid;
      });
      return dict;
    }
  };

  // --- Converter ---
  const Converter = {
    async convert(toJawi) {
      if (!State.dictionary) State.dictionary = await DictionaryManager.fetch();
      TemplateManager.collectOverrides();
      TemplateManager.convert(toJawi);

      const updateNodes = (sel, cb) => document.querySelectorAll(sel).forEach(cb);

      updateNodes('.convertible-text', el => {
        if (el.closest('.IPA')) return;
        const rumi = el.getAttribute('data-rumi');
        if (rumi) {
          let txt = toJawi ? this.convertText(rumi, State.dictionary) : rumi;
          if (toJawi) txt = replaceHamzaWithSpan(wrapIPASegmentsLTR(txt));
          safeSetInnerHTML(el, txt);
          this.setRTLDirection(el, toJawi);
        }
      });
      updateNodes('.vector-toc-text', el => {
        if (el.closest('.IPA')) return;
        if (!el.hasAttribute('data-rumi')) el.setAttribute('data-rumi', el.textContent);
        const rumi = el.getAttribute('data-rumi');
        let txt = toJawi ? this.convertText(rumi, State.dictionary) : rumi;
        if (toJawi) txt = replaceHamzaWithSpan(wrapIPASegmentsLTR(txt));
        safeSetInnerHTML(el, txt);
        this.setRTLDirection(el, toJawi);
      });

      if (toJawi) {
        await this.convertToJawi();
        updateNodes(`.${UI.TEMPLATE_CLASS}, .${UI.NOCONVERT_CLASS}`, el => {
          if (el.closest('.IPA')) return;
          safeSetInnerHTML(el, replaceHamzaWithSpan(wrapIPASegmentsLTR(el.textContent)));
        });
        updateNodes("*:not(script):not(style)", el => {
          if (el.closest('.IPA')) return;
          if (el.childNodes.length === 1 && el.childNodes[0].nodeType === Node.TEXT_NODE && el.textContent.includes("ء"))
            safeSetInnerHTML(el, replaceHamzaWithSpan(wrapIPASegmentsLTR(el.textContent)));
        });
      } else this.revertToRumi();
    },
    async convertToJawi() {
      if (!State.originalContent) {
        State.originalContent = State.content.innerHTML;
        State.originalTitle = State.title.textContent;
      }
      this.preprocessKafDalWithLinks();
      this.setRTLDirection(State.content, true);
      this.setRTLDirection(State.title, true);
      let convertedTitle = this.convertText(State.title.textContent, State.dictionary);
      convertedTitle = replaceHamzaWithSpan(wrapIPASegmentsLTR(convertedTitle));
      safeSetInnerHTML(State.title, convertedTitle);

      const walker = document.createTreeWalker(
        State.content, NodeFilter.SHOW_TEXT, {
          acceptNode: node => {
            const p = node.parentElement;
            if (!p) return NodeFilter.FILTER_REJECT;
            if (["SCRIPT", "STYLE"].includes(p.tagName) ||
              p.classList.contains(UI.NOCONVERT_CLASS) ||
              p.classList.contains(UI.TEMPLATE_CLASS) ||
              p.closest("#p-navigation, .mw-portlet, .vector-menu, .mw-header") ||
              p.classList.contains("IPA") || p.closest(".IPA"))
              return NodeFilter.FILTER_REJECT;
            return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
          }
        }
      );
      const textNodes = [];
      let node; while ((node = walker.nextNode())) textNodes.push(node);

      let idx = 0, chunk = 50;
      const processChunk = () => {
        for (let i = idx; i < Math.min(idx + chunk, textNodes.length); i++) {
          const n = textNodes[i];
          if (n && n.textContent && n.textContent.trim()) {
            let converted = this.convertText(n.textContent, State.dictionary);
            converted = replaceHamzaWithSpan(wrapIPASegmentsLTR(converted));
            if (converted !== n.textContent && (/<span[^>]*>ء<\/span>/.test(converted) || /<span dir="ltr"/.test(converted))) {
              const span = document.createElement("span");
              safeSetInnerHTML(span, converted);
              n.parentNode && n.parentNode.replaceChild(span, n);
            } else n.textContent = converted;
            let p = n.parentElement;
            while (p && !p.classList.contains("mw-content-text")) {
              if (p.nodeType === 1 && 
                  !p.classList.contains(UI.NOCONVERT_CLASS) && 
                  p.closest("#mw-content-text") &&
                  !p.classList.contains("IPA") && 
                  !p.closest(".IPA")) {
                Converter.setRTLDirection(p, true);
              }
              p = p.parentElement;
            }
          }
        }
        idx += chunk;
        if (idx < textNodes.length) requestAnimationFrame(processChunk);
      };
      requestAnimationFrame(processChunk);

      document.querySelectorAll(`.${UI.TEMPLATE_CLASS}, .${UI.NOCONVERT_CLASS}`)
        .forEach(el => {
          if (el.closest('.IPA')) return;
          safeSetInnerHTML(el, replaceHamzaWithSpan(wrapIPASegmentsLTR(el.textContent)));
        });
    },
    revertToRumi() {
      if (State.originalContent) {
        State.content.innerHTML = State.originalContent;
        safeSetTextContent(State.title, State.originalTitle);
        this.setRTLDirection(State.content, false);
        this.setRTLDirection(State.title, false);
        State.content.querySelectorAll("[dir=\"rtl\"]").forEach(el => {
          el.removeAttribute("dir"); el.removeAttribute("lang");
        });
        State.originalContent = State.originalTitle = null;
      }
      document.querySelectorAll(`.${UI.TEMPLATE_CLASS}`).forEach(el => {
        const rumi = el.getAttribute(UI.TEMPLATE_ORIG_TEXT_ATTR);
        if (rumi) { safeSetInnerHTML(el, rumi); Converter.setRTLDirection(el, false); }
      });
    },
    convertText(text, dict) {
      if (!text?.trim() || !dict) return text;
      const numbers = [];
      let result = text.replace(/(?:\p{L}*\d+(?:[,.]\d+)*(?:\.\d+)?%?\p{L}*|\d+(?:[,.]\d+)*(?:\.\d+)?%?)/gu, m => `__NUM${numbers.push(`\u2066${m}\u2069`) - 1}__`);
      const replaceByDictKeys = (str, dictObj, type) => {
        const keys = Object.keys(dictObj).filter(type).sort((a, b) => b.length - a.length);
        if (!keys.length) return str;
        const regex = new RegExp(keys.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "gi");
        return str.replace(regex, m => dict.forms[dictObj[m.toLowerCase()]] || m);
      };
      result = replaceByDictKeys(result, dict.phrases, () => true);
      result = replaceByDictKeys(result, dict.words, w => w.includes("'"));
      result = result.replace(/\b\w+(?:-\w+)+\b/g, m => {
        const fid = dict.words[m.toLowerCase()];
        if (fid) return dict.forms[fid];
        return m.split("-").map(part => {
          const pfid = dict.words[part.toLowerCase()];
          return pfid ? dict.forms[pfid] : part;
        }).join("-");
      });
      let singleWordRegex;
      try { 
        singleWordRegex = new RegExp("(?<=^|[\\s\\p{P}\\p{S}])[\\p{L}\\p{N}_]+(?=[\\s\\p{P}\\p{S}]|$)", "gu"); 
      }
      catch { 
        singleWordRegex = /(?:^|[\s\.,;:!?\(\)\[\]{}'"'""\-–—\/\\])([\w\u00C0-\uFFFF]+)(?=[\s\.,;:!?\(\)\[\]{}'"'""\-–—\/\\]|$)/g;
      }
      if (singleWordRegex.toString().includes("(?<=")) {
        result = result.replace(singleWordRegex, m => {
          const fid = dict.words[m.toLowerCase()];
          return fid ? dict.forms[fid] : m;
        });
      } else {
        result = result.replace(singleWordRegex, (match, word, offset, string) => {
          const fid = dict.words[word.toLowerCase()];
          const converted = fid ? dict.forms[fid] : word;
          return match.replace(word, converted);
        });
      }
      result = result.replace(/\b(ک|د)\s+(ک|د)\b/g, (match, first, second) => first === second ? `${first} ${second}` : match);
      result = result.replace(/(^|[\s]+)([کد])\s+(\S+)/g, (match, space, letter, nextWord) => {
        if (nextWord.startsWith("ا")) {
          return `${space}${letter}أ${nextWord.slice(1)}`;
        }
        return `${space}${letter}${nextWord}`;
      });
      
      result = result.replace(/[,;?]/g, m => PUNCTUATION_MAP[m] || m);
      numbers.forEach((n, i) => { result = result.replace(`__NUM${i}__`, n); });
      return result;
    },
    preprocessKafDalWithLinks() {
      const walker = document.createTreeWalker(
        State.content,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: node => {
            const parent = node.parentElement;
            if (!parent || parent.tagName === 'A') return NodeFilter.FILTER_REJECT;
            const text = node.textContent;
            const hasKeDi = /\b(ke|di)\s*$/i.test(text);
            const nextSibling = node.nextSibling;
            if (hasKeDi && nextSibling && nextSibling.tagName === 'A') {
              const linkText = nextSibling.textContent.trim();
              if (!/^(ke|di)\b/i.test(linkText)) return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_REJECT;
          }
        }
      );
      const nodesToProcess = [];
      let node;
      while ((node = walker.nextNode())) nodesToProcess.push(node);
      nodesToProcess.forEach(textNode => {
        const text = textNode.textContent;
        const match = text.match(/^(.*?)\b(ke|di)\s*$/i);
        if (match) {
          const [, prefix, keDi] = match;
          const nextLink = textNode.nextSibling;
          if (nextLink && nextLink.tagName === 'A') {
            const linkText = nextLink.textContent.trim();
            if (!/^(ke|di)\b/i.test(linkText)) {
              if (prefix.trim()) {
                textNode.textContent = prefix;
              } else {
                const whitespaceMatch = prefix.match(/^\s*/);
                textNode.textContent = whitespaceMatch ? whitespaceMatch[0] : '';
              }
              nextLink.textContent = `${keDi} ${linkText}`;
            }
          }
        }
      });
    },
    setRTLDirection(el, isRTL) {
      if (!el) return;
      if (el.classList?.contains("IPA") || el.closest?.(".IPA")) {
        el.removeAttribute("dir"); 
        el.removeAttribute("lang");
        el.querySelectorAll?.("*").forEach(child => {
          child.removeAttribute("dir"); 
          child.removeAttribute("lang");
        });
        return;
      }
      el.setAttribute("dir", isRTL ? "rtl" : "ltr");
      el.setAttribute("lang", isRTL ? "ms-arab" : "ms");
      if (el.querySelector?.(".IPA")) {
        el.querySelectorAll(".IPA").forEach(ipaEl => {
          ipaEl.removeAttribute("dir");
          ipaEl.removeAttribute("lang");
          ipaEl.querySelectorAll("*").forEach(child => {
            child.removeAttribute("dir");
            child.removeAttribute("lang");
          });
        });
      }
    }
  };

  // --- Template manager ---
  const TemplateManager = {
    collectOverrides() {
      State.templateOverrides.clear();
      document.querySelectorAll(`.${UI.TEMPLATE_CLASS}`).forEach(el => {
        const rumi = el.getAttribute(UI.TEMPLATE_ORIG_TEXT_ATTR)?.toLowerCase();
        const formId = el.getAttribute(UI.TEMPLATE_DATA_ATTR);
        if (rumi && formId) State.templateOverrides.set(rumi, { formId });
      });
    },
    convert(toJawi) {
      document.querySelectorAll(`.${UI.TEMPLATE_CLASS}`).forEach(el => {
        const rumi = el.getAttribute(UI.TEMPLATE_ORIG_TEXT_ATTR);
        const formId = el.getAttribute(UI.TEMPLATE_DATA_ATTR);
        if (!this.validateFormMapping(formId, rumi, State.dictionary)) {
          el.classList.add(UI.NOCONVERT_CLASS); el.classList.remove(UI.TEMPLATE_CLASS); return;
        }
        let txt = toJawi ? State.dictionary.forms[formId] || rumi : rumi;
        if (toJawi) txt = replaceHamzaWithSpan(txt);
        if (el.innerHTML !== txt) {
          safeSetInnerHTML(el, txt);
          Converter.setRTLDirection(el, toJawi);
        }
      });
      if (toJawi)
        document.querySelectorAll(`.${UI.NOCONVERT_CLASS}`).forEach(el =>
          safeSetInnerHTML(el, replaceHamzaWithSpan(el.textContent))
        );
    },
    validateFormMapping(formId, rumi, dict) {
      return !!(formId && rumi && dict?.formMappings?.[formId] && dict.formMappings[formId].toLowerCase() === rumi.toLowerCase());
    },
    initialize() {
      document.querySelectorAll("[data-form-id]").forEach(el => {
        if (el.classList.contains(UI.TEMPLATE_CLASS)) return;
        const formId = el.getAttribute(UI.TEMPLATE_DATA_ATTR);
        if (!formId) return;
        if (!el.hasAttribute(UI.TEMPLATE_ORIG_TEXT_ATTR))
          el.setAttribute(UI.TEMPLATE_ORIG_TEXT_ATTR, el.textContent);
        el.classList.add(UI.TEMPLATE_CLASS);
      });
      document.querySelectorAll("[data-no-convert]").forEach(el => el.classList.add(UI.NOCONVERT_CLASS));
      DEBUG && console.log(`Initialized ${document.querySelectorAll(`.${UI.TEMPLATE_CLASS}`).length} form templates`);
      DEBUG && console.log(`Initialized ${document.querySelectorAll(`.${UI.NOCONVERT_CLASS}`).length} no-convert templates`);
    }
  };

  // --- UI manager ---
  const UIManager = {
    setupStyles() {
      document.getElementById("rumi-jawi-styles")?.remove();
      const skin = mw.config.get("skin"), isMobile = skin === "minerva", isMonobook = skin === "monobook";
      const css = `
        .IPA, .IPA * { direction: ltr !important; unicode-bidi: isolate !important; }
        #n-malayscriptconverter.${UI.NAMESPACE_CLASS}, #n-ui-language.${UI.NAMESPACE_CLASS} {
          margin: ${isMobile ? "8px 0" : "0"};
          ${isMobile ? "list-style: none;" : ""}
        }
        ${isMobile ? `.menu .${UI.NAMESPACE_CLASS}::before { display: none !important; }` : ""}
        #n-malayscriptconverter.${UI.NAMESPACE_CLASS} .cdx-label--title,
        #n-ui-language.${UI.NAMESPACE_CLASS} .cdx-label--title {
          font-weight: bold; font-size: inherit; padding: ${isMobile ? "8px 16px 4px" : "0"};
          color: ${isMobile ? "var(--color-base, #54595d);" : ""};
        }
        #n-malayscriptconverter.${UI.NAMESPACE_CLASS} .cdx-radio--inline,
        #n-ui-language.${UI.NAMESPACE_CLASS} .cdx-radio--inline {
          display: flex; flex-direction: column; align-items: flex-start;
        }
        #n-malayscriptconverter.${UI.NAMESPACE_CLASS} .cdx-radio__content,
        #n-ui-language.${UI.NAMESPACE_CLASS} .cdx-radio__content {
          padding: ${isMobile ? "8px 16px" : "4px 0"};
        }
        #n-malayscriptconverter.${UI.NAMESPACE_CLASS} .cdx-radio__label,
        #n-ui-language.${UI.NAMESPACE_CLASS} .cdx-radio__label {
          display: flex; align-items: center; cursor: pointer; gap: ${isMobile ? "12px" : "4px"};
          width: 100%; ${isMonobook ? "position: relative;" : ""}
        }
        #n-malayscriptconverter.${UI.NAMESPACE_CLASS} .cdx-radio__input,
        #n-ui-language.${UI.NAMESPACE_CLASS} .cdx-radio__input {
          ${isMobile ? `position: absolute; opacity: 0;` : "margin: 0;"}
          ${isMonobook ? "position: static; " : ""}
        }
        #n-malayscriptconverter.${UI.NAMESPACE_CLASS} .cdx-radio__icon,
        #n-ui-language.${UI.NAMESPACE_CLASS} .cdx-radio__icon {
          width: ${isMobile ? "20px" : "14px"}; height: ${isMobile ? "20px" : "14px"};
          ${isMobile ? `border: 2px solid var(--color-notice, #72777d); border-radius: 50%; position: relative; flex-shrink: 0;` : ""}
        }
        #n-malayscriptconverter.${UI.NAMESPACE_CLASS} .cdx-radio__input:checked + .cdx-radio__icon,
        #n-ui-language.${UI.NAMESPACE_CLASS} .cdx-radio__input:checked + .cdx-radio__icon {
          border-color: var(--color-progressive, #36c);
        }
        ${isMobile ? `
          #n-malayscriptconverter.${UI.NAMESPACE_CLASS} .cdx-radio__input:checked + .cdx-radio__icon:after,
          #n-ui-language.${UI.NAMESPACE_CLASS} .cdx-radio__input:checked + .cdx-radio__icon:after {
            content: ''; position: absolute; width: 10px; height: 10px;
            background: var(--color-progressive, #36c); border-radius: 50%;
            top: 50%; left: 50%; transform: translate(-50%, -50%);
          }
        ` : ""}
        #n-malayscriptconverter.${UI.NAMESPACE_CLASS} .cdx-radio__input:checked ~ .cdx-radio__label-content,
        #n-ui-language.${UI.NAMESPACE_CLASS} .cdx-radio__input:checked ~ .cdx-radio__label-content {
          color: var(--color-progressive, #36c);
        }
      `;
      const style = document.createElement("style");
      style.id = "rumi-jawi-styles"; style.textContent = css;
      document.head.appendChild(style);
    },
    createControlsHTML(name, title, options) {
      let html = `<div class="cdx-field"><label class="cdx-label cdx-label--title">
        <span class="cdx-label__text convertible-text" data-rumi="${title}">${title}</span>
        </label><div class="cdx-radio--inline" role="radiogroup" aria-label="${title}">`;
      options.forEach(opt => {
        html += `<div class="cdx-radio__content"><label class="cdx-radio__label">
          <input type="radio" class="cdx-radio__input" name="${name}" value="${opt.value}" 
            ${opt.checked ? "checked" : ""} aria-checked="${opt.checked}">
          <span class="cdx-radio__icon"></span>
          <span class="cdx-radio__label-content convertible-text" data-rumi="${opt.label}">${opt.label}</span>
          </label></div>`;
      });
      return html + "</div></div>";
    },
    setupControls() {
      const skin = mw.config.get("skin");
      if (!UI.SUPPORTED_SKINS.includes(skin)) { DEBUG && console.log(`Unsupported skin: ${skin}`); return; }
      const isMobile = skin === "minerva";
      const container = isMobile ?
        document.querySelector(".menu") :
        document.querySelector("#vector-pinned-container ul, #p-navigation ul");
      if (!container) { console.error(`Navigation container not found for ${skin} skin`); return; }
      document.querySelectorAll("#n-malayscriptconverter, #n-ui-language").forEach(el => el.remove());

      const scriptLi = document.createElement("li");
      scriptLi.id = "n-malayscriptconverter"; scriptLi.className = UI.NAMESPACE_CLASS;
      const persistentScript = typeof Storage !== 'undefined' ? localStorage.getItem("persistentScript") : null;
      const scriptOptions = [
        { value: "rumi-script", label: "Rumi", checked: persistentScript ? persistentScript === "rumi" : (State.script === "rumi") },
        { value: "jawi-script", label: "Jawi", checked: persistentScript ? persistentScript === "jawi" : (State.script === "jawi") }
      ];
      safeSetInnerHTML(scriptLi, this.createControlsHTML("rumi-jawi-script", "Penukar kandungan", scriptOptions));

      const langLi = document.createElement("li");
      langLi.id = "n-ui-language"; langLi.className = UI.NAMESPACE_CLASS;
      const persistentLang = typeof Storage !== 'undefined' ? localStorage.getItem("persistentLang") : null;
      const currentLanguage = persistentLang || mw.config.get("wgUserLanguage");
      const langOptions = [
        { value: "ms", label: "Rumi", checked: currentLanguage !== "ms-arab" },
        { value: "ms-arab", label: "Jawi", checked: currentLanguage === "ms-arab" }
      ];
      safeSetInnerHTML(langLi, this.createControlsHTML("rumi-jawi-lang", "Penukar antara muka", langOptions));

      if (isMobile) {
        let menuContainer = container.querySelector(".converter-container");
        if (!menuContainer) {
          menuContainer = document.createElement("div");
          menuContainer.className = "converter-container";
          container.appendChild(menuContainer);
        }
        menuContainer.appendChild(scriptLi); menuContainer.appendChild(langLi);
      } else { container.appendChild(scriptLi); container.appendChild(langLi); }
      this.setupEventHandlers();
    },
    setupEventHandlers() {
      document.querySelectorAll(".cdx-radio__input[name=\"rumi-jawi-script\"]").forEach(radio => {
        radio.addEventListener("change", async function() {
          const isJawi = this.value === "jawi-script";
          if (typeof Storage !== 'undefined') localStorage.setItem("persistentScript", isJawi ? "jawi" : "rumi");
          await Converter.convert(isJawi);
          State.setScript(isJawi ? "jawi" : "rumi");
          setRadioChecked(isJawi ? "jawi-script" : "rumi-script");
        });
      });
      document.querySelectorAll(".cdx-radio__input[name=\"rumi-jawi-lang\"]").forEach(radio => {
        radio.addEventListener("change", async function() {
          const language = this.value;
          if (typeof Storage !== 'undefined') localStorage.setItem("persistentLang", language);
          setRadioChecked(language);
          await UIManager.setUserLanguage(language);
          window.location.reload();
        });
      });
    },
    async setUserLanguage(language) {
      try { await new mw.Api().saveOption("language", language); }
      catch (error) { console.error("Failed to save language preference:", error); }
    },
    initialize() { this.setupStyles(); this.setupControls(); }
  };

  // --- Page context and initialization ---
  function checkPageContext() {
    try {
      return typeof mw.config.get("wgNamespaceNumber") !== "undefined" &&
        !["edit", "submit"].includes(mw.config.get("wgAction")) &&
        !document.querySelector(".ve-active, .wikiEditor-ui") &&
        !mw.config.get("wgVisualEditor")?.isActive;
    } catch (error) { console.error("Error checking page context:", error); return false; }
  }
  function getRequiredElements() {
    const content = document.querySelector("#mw-content-text"), title = document.querySelector(".mw-first-heading");
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
      State.dictionary = await DictionaryManager.fetch();
      const persistentScript = typeof Storage !== 'undefined' ? localStorage.getItem("persistentScript") : null;
      const persistentLang = typeof Storage !== 'undefined' ? localStorage.getItem("persistentLang") : null;
      let isJawi = persistentScript ? persistentScript === "jawi" : (persistentLang || mw.config.get("wgUserLanguage")) === "ms-arab";
      State.setScript(isJawi ? "jawi" : "rumi");
      setRadioChecked(isJawi ? "jawi-script" : "rumi-script");
      setRadioChecked((persistentLang || mw.config.get("wgUserLanguage")) === "ms-arab" ? "ms-arab" : "ms");
      if (isJawi) await Converter.convert(true);
      State.initialized = true;
      DEBUG && console.log("Initialized successfully");
    } catch (error) { console.error("Initialization failed:", error); }
  }

  if (typeof mw !== 'undefined' && mw.hook) mw.hook("wikipage.content").add(initializeApp);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initializeApp);
  else requestAnimationFrame(initializeApp);
})();
