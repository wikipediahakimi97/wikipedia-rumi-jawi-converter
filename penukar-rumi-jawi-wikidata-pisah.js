/**
 ** LOG:
 ** Updated on 25th June 2025
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
  // --- Utility constants ---
  const CACHE_KEY = "rumiJawiData";
  const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
  const DEBUG = false;
  const SPARQL_URL = "https://query-main.wikidata.org/sparql";
  const SPARQL_QUERY = `SELECT DISTINCT ?formId ?latn ?arab (GROUP_CONCAT(DISTINCT ?featureLabel; SEPARATOR=", ") AS ?features) 
		WHERE {
		  ?lexEntry dct:language wd:Q9237;
		           ontolex:lexicalForm ?form.
		  BIND(STRAFTER(STR(?form), "http://www.wikidata.org/entity/") AS ?formId)
		  ?form ontolex:representation ?latn FILTER (lang(?latn) = "ms")
		  ?form ontolex:representation ?arab FILTER (lang(?arab) = "ms-arab")
		  OPTIONAL { 
		    ?form wikibase:grammaticalFeature ?feature.
		    ?feature rdfs:label ?featureLabel FILTER (lang(?featureLabel) = "en")
		  }
		  FILTER (!BOUND(?feature) || (
		    ?feature != wd:Q98912 && 
		    ?feature != wd:Q8185162 && 
		    ?feature != wd:Q10617810
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

  // --- Utility functions ---
  function safeSetInnerHTML(element, content) {
    if (typeof content === 'string' && content.includes('<')) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = content;
      element.innerHTML = '';
      while (tempDiv.firstChild) element.appendChild(tempDiv.firstChild);
    } else {
      element.textContent = content;
    }
  }
  function safeSetTextContent(element, content) {
    element.textContent = content;
  }
  function setRadioChecked(value) {
    document.querySelectorAll(`.cdx-radio__input[value="${value}"]`).forEach(radio => {
      radio.checked = true;
    });
  }

  // --- State management ---
  const State = {
    script: "rumi",
    content: null,
    title: null,
    originalContent: null,
    originalTitle: null,
    dictionary: null,
    templateOverrides: new Map(),
    initialized: false,
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

  // --- Dictionary manager ---
  const DictionaryManager = {
    async fetch() {
      const cached = this.loadFromCache();
      if (cached) return cached;
      return await this.fetchFromAPI();
    },
    loadFromCache() {
      try {
        if (typeof Storage === 'undefined') return null;
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const { timestamp, data } = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_DURATION) return data;
        }
      } catch (e) {
        DEBUG && console.warn("Cache access error:", e);
      }
      return null;
    },
    async fetchFromAPI() {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        const response = await fetch(
          `${SPARQL_URL}?query=${encodeURIComponent(SPARQL_QUERY)}&format=json`, {
            headers: { Accept: "application/sparql-results+json" },
            signal: controller.signal
          }
        );
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const result = await response.json();
        const processedData = this.process(result);
        try {
          if (typeof Storage !== 'undefined') {
            localStorage.setItem(CACHE_KEY, JSON.stringify({
              timestamp: Date.now(),
              data: processedData
            }));
          }
        } catch (e) {
          DEBUG && console.warn("Error storing in localStorage:", e);
        }
        return processedData;
      } catch (error) {
        console.error("Error fetching Rumi-Jawi data:", error);
        return { words: {}, phrases: {}, forms: {}, formMappings: {} };
      }
    },
    process(data) {
      const dictionary = { words: {}, phrases: {}, forms: {}, formMappings: {} };
      if (!data?.results?.bindings) return dictionary;
      data.results.bindings.forEach(({ formId, latn, arab }) => {
        if (!formId || !latn || !arab) return;
        const rumiText = latn.value.toLowerCase();
        const jawiText = arab.value;
        const formIdValue = formId.value;
        dictionary.forms[formIdValue] = jawiText;
        dictionary.formMappings[formIdValue] = rumiText;
        (rumiText.includes(" ") ? dictionary.phrases : dictionary.words)[rumiText] = formIdValue;
      });
      return dictionary;
    }
  };

  // --- Converter core ---
  const Converter = {
    async convert(toJawi) {
      if (!State.dictionary) State.dictionary = await DictionaryManager.fetch();
      TemplateManager.collectOverrides();
      TemplateManager.convert(toJawi);

      const convertible = document.querySelectorAll('.convertible-text');
      const toc = document.querySelectorAll('.vector-toc-text');
      convertible.forEach(element => {
        const rumiText = element.getAttribute('data-rumi');
        if (rumiText) {
          let newText = toJawi ? this.convertText(rumiText, State.dictionary) : rumiText;
          if (toJawi) newText = replaceHamzaWithSpan(newText);
          safeSetInnerHTML(element, newText);
          this.setRTLDirection(element, toJawi);
        }
      });
      toc.forEach(element => {
        if (!element.hasAttribute('data-rumi')) element.setAttribute('data-rumi', element.textContent);
        const rumiText = element.getAttribute('data-rumi');
        let newText = toJawi ? this.convertText(rumiText, State.dictionary) : rumiText;
        if (toJawi) newText = replaceHamzaWithSpan(newText);
        safeSetInnerHTML(element, newText);
        this.setRTLDirection(element, toJawi);
      });

      if (toJawi) {
        await this.convertToJawi();
        const templateNodes = document.querySelectorAll(`.${UI.TEMPLATE_CLASS}, .${UI.NOCONVERT_CLASS}`);
        templateNodes.forEach(element => safeSetInnerHTML(element, replaceHamzaWithSpan(element.textContent)));
        document.querySelectorAll("*:not(script):not(style)").forEach(el => {
          if (el.childNodes.length === 1 && el.childNodes[0].nodeType === Node.TEXT_NODE && el.textContent.includes("ء")) {
            safeSetInnerHTML(el, replaceHamzaWithSpan(el.textContent));
          }
        });
      } else {
        this.revertToRumi();
      }
    },
    async convertToJawi() {
      if (!State.originalContent) {
        State.originalContent = State.content.innerHTML;
        State.originalTitle = State.title.textContent;
      }
      this.setRTLDirection(State.content, true);
      this.setRTLDirection(State.title, true);
      safeSetInnerHTML(State.title, replaceHamzaWithSpan(this.convertText(State.title.textContent, State.dictionary)));

      const walker = document.createTreeWalker(
        State.content,
        NodeFilter.SHOW_TEXT, {
          acceptNode: node => {
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            if (
              parent.tagName === "SCRIPT" ||
              parent.tagName === "STYLE" ||
              parent.classList.contains(UI.NOCONVERT_CLASS) ||
              parent.classList.contains(UI.TEMPLATE_CLASS) ||
              parent.closest("#p-navigation, .mw-portlet, .vector-menu, .mw-header")
            ) return NodeFilter.FILTER_REJECT;
            return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
          }
        }
      );
      const textNodes = [];
      let node;
      while ((node = walker.nextNode())) textNodes.push(node);

      let currentIndex = 0, chunkSize = 50;
      const processNextChunk = () => {
        const endIndex = Math.min(currentIndex + chunkSize, textNodes.length);
        for (let i = currentIndex; i < endIndex; i++) {
          const textNode = textNodes[i];
          if (textNode && textNode.textContent && textNode.textContent.trim()) {
            let converted = this.convertText(textNode.textContent, State.dictionary);
            converted = replaceHamzaWithSpan(converted);
            if (converted !== textNode.textContent && /<span[^>]*>ء<\/span>/.test(converted)) {
              const span = document.createElement("span");
              safeSetInnerHTML(span, converted);
              if (textNode.parentNode) textNode.parentNode.replaceChild(span, textNode);
            } else {
              textNode.textContent = converted;
            }
            let parent = textNode.parentElement;
            while (parent && !parent.classList.contains("mw-content-text")) {
              if (
                parent.nodeType === 1 &&
                !parent.classList.contains(UI.NOCONVERT_CLASS) &&
                parent.closest("#mw-content-text")
              ) Converter.setRTLDirection(parent, true);
              parent = parent.parentElement;
            }
          }
        }
        currentIndex = endIndex;
        if (currentIndex < textNodes.length) requestAnimationFrame(processNextChunk);
      };
      requestAnimationFrame(processNextChunk);

      document.querySelectorAll(`.${UI.TEMPLATE_CLASS}, .${UI.NOCONVERT_CLASS}`)
        .forEach(element => safeSetInnerHTML(element, replaceHamzaWithSpan(element.textContent)));
    },
    revertToRumi() {
      if (State.originalContent) {
        State.content.innerHTML = State.originalContent;
        safeSetTextContent(State.title, State.originalTitle);
        this.setRTLDirection(State.content, false);
        this.setRTLDirection(State.title, false);
        State.content.querySelectorAll("[dir=\"rtl\"]").forEach(el => {
          el.removeAttribute("dir");
          el.removeAttribute("lang");
        });
        State.originalContent = null;
        State.originalTitle = null;
      }
    },
    convertText(text, dict) {
      if (!text?.trim() || !dict) return text;
      const numbers = [];
      let result = text.replace(/\d+(?:[,.]\d+)*(?:\.\d+)?%?/g, match => {
        const placeholder = `__NUM${numbers.push(`\u2066${match}\u2069`) - 1}__`;
        return placeholder;
      });
      // Phrases
      const sortedPhrases = Object.keys(dict.phrases).sort((a, b) => b.length - a.length);
      if (sortedPhrases.length) {
        const phraseRegex = new RegExp(
          sortedPhrases.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
          "gi"
        );
        result = result.replace(phraseRegex, match => {
          const formId = dict.phrases[match.toLowerCase()];
          return formId ? dict.forms[formId] : match;
        });
      }
      // Apostrophe words
      const apostropheWords = Object.keys(dict.words).filter(word => word.includes("'")).sort((a, b) => b.length - a.length);
      if (apostropheWords.length) {
        const apostropheRegex = new RegExp(
          apostropheWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
          "gi"
        );
        result = result.replace(apostropheRegex, match => {
          const formId = dict.words[match.toLowerCase()];
          return formId ? dict.forms[formId] : match;
        });
      }
      // Hyphenated words
      result = result.replace(/\b\w+(?:-\w+)+\b/g, match => {
        const formId = dict.words[match.toLowerCase()];
        if (formId) return dict.forms[formId];
        return match.split("-").map(part => {
          const partFormId = dict.words[part.toLowerCase()];
          return partFormId ? dict.forms[partFormId] : part;
        }).join("-");
      });
      // Single words
      result = result.replace(/\b[a-zA-Z\u00C0-\u024F0-9_]+\b/g, match => {
        const formId = dict.words[match.toLowerCase()];
        return formId ? dict.forms[formId] : match;
      });
      // Special replacements
      result = result.replace(/(^|[\s]+)([کد])[\s]+(\S)/g, (match, spaceBefore, letter, nextChar) => {
        const processedNextChar = nextChar === "ا" ? "أ" : nextChar;
        return `${spaceBefore}${letter}${processedNextChar}`;
      });
      result = result.replace(/[,;?]/g, match => PUNCTUATION_MAP[match] || match);
      numbers.forEach((number, index) => {
        result = result.replace(`__NUM${index}__`, number);
      });
      return result;
    },
    setRTLDirection(element, isRTL) {
      if (!element) return;
      element.setAttribute("dir", isRTL ? "rtl" : "ltr");
      element.setAttribute("lang", isRTL ? "ms-arab" : "ms");
    }
  };

  // --- Template manager ---
  const TemplateManager = {
    collectOverrides() {
      State.templateOverrides.clear();
      document.querySelectorAll(`.${UI.TEMPLATE_CLASS}`).forEach(element => {
        const rumiText = element.getAttribute(UI.TEMPLATE_ORIG_TEXT_ATTR)?.toLowerCase();
        const formId = element.getAttribute(UI.TEMPLATE_DATA_ATTR);
        if (rumiText && formId) State.templateOverrides.set(rumiText, { formId });
      });
    },
    convert(toJawi) {
      const templates = document.querySelectorAll(`.${UI.TEMPLATE_CLASS}`);
      templates.forEach(element => {
        const rumiText = element.getAttribute(UI.TEMPLATE_ORIG_TEXT_ATTR);
        const formId = element.getAttribute(UI.TEMPLATE_DATA_ATTR);
        if (!this.validateFormMapping(formId, rumiText, State.dictionary)) {
          element.classList.add(UI.NOCONVERT_CLASS);
          element.classList.remove(UI.TEMPLATE_CLASS);
          return;
        }
        let newText = toJawi ? State.dictionary.forms[formId] || rumiText : rumiText;
        if (toJawi) newText = replaceHamzaWithSpan(newText);
        if (element.innerHTML !== newText) {
          safeSetInnerHTML(element, newText);
          Converter.setRTLDirection(element, toJawi);
        }
      });
      if (toJawi) {
        document.querySelectorAll(`.${UI.NOCONVERT_CLASS}`).forEach(element =>
          safeSetInnerHTML(element, replaceHamzaWithSpan(element.textContent))
        );
      }
    },
    validateFormMapping(formId, rumiText, dict) {
      return !!(formId && rumiText && dict?.formMappings?.[formId] && dict.formMappings[formId].toLowerCase() === rumiText.toLowerCase());
    },
    initialize() {
      document.querySelectorAll("[data-form-id]").forEach(element => {
        if (element.classList.contains(UI.TEMPLATE_CLASS)) return;
        const formId = element.getAttribute(UI.TEMPLATE_DATA_ATTR);
        if (!formId) return;
        if (!element.hasAttribute(UI.TEMPLATE_ORIG_TEXT_ATTR)) {
          element.setAttribute(UI.TEMPLATE_ORIG_TEXT_ATTR, element.textContent);
        }
        element.classList.add(UI.TEMPLATE_CLASS);
      });
      document.querySelectorAll("[data-no-convert]").forEach(element => {
        element.classList.add(UI.NOCONVERT_CLASS);
      });
      DEBUG && console.log(`Initialized ${document.querySelectorAll(`.${UI.TEMPLATE_CLASS}`).length} form templates`);
      DEBUG && console.log(`Initialized ${document.querySelectorAll(`.${UI.NOCONVERT_CLASS}`).length} no-convert templates`);
    }
  };

  // --- UI manager ---
  const UIManager = {
    setupStyles() {
      const existingStyles = document.getElementById("rumi-jawi-styles");
      if (existingStyles) existingStyles.remove();
      const skin = mw.config.get("skin");
      const isMobile = skin === "minerva";
      const isMonobook = skin === "monobook";
      const css = `
      /* Use more specific selectors with a unique namespace */
      /* Base styles for converter container */
      #n-malayscriptconverter.${UI.NAMESPACE_CLASS},
      #n-ui-language.${UI.NAMESPACE_CLASS} {
        margin: ${isMobile ? "8px 0" : "0"};
        ${isMobile ? "list-style: none;" : ""}
      }
      ${isMobile ? `.menu .${UI.NAMESPACE_CLASS}::before {
        display: none !important;
      }` : ""}
      #n-malayscriptconverter.${UI.NAMESPACE_CLASS} .cdx-label--title,
      #n-ui-language.${UI.NAMESPACE_CLASS} .cdx-label--title {
        font-weight: bold;
        font-size: inherit;
        padding: ${isMobile ? "8px 16px 4px" : "0"};
        color: ${isMobile ? "var(--color-base, #54595d);" : ""};
      }
      #n-malayscriptconverter.${UI.NAMESPACE_CLASS} .cdx-radio--inline,
      #n-ui-language.${UI.NAMESPACE_CLASS} .cdx-radio--inline {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
      }
      #n-malayscriptconverter.${UI.NAMESPACE_CLASS} .cdx-radio__content,
      #n-ui-language.${UI.NAMESPACE_CLASS} .cdx-radio__content {
        padding: ${isMobile ? "8px 16px" : "4px 0"};
      }
      #n-malayscriptconverter.${UI.NAMESPACE_CLASS} .cdx-radio__label,
      #n-ui-language.${UI.NAMESPACE_CLASS} .cdx-radio__label {
        display: flex;
        align-items: center;
        cursor: pointer;
        gap: ${isMobile ? "12px" : "4px"};
        width: 100%;
        ${isMonobook ? "position: relative;" : ""}
      }
      #n-malayscriptconverter.${UI.NAMESPACE_CLASS} .cdx-radio__input,
      #n-ui-language.${UI.NAMESPACE_CLASS} .cdx-radio__input {
        ${isMobile ? `
          position: absolute;
          opacity: 0;
        ` : "margin: 0;"}
        ${isMonobook ? "position: static; " : ""}
      }
      #n-malayscriptconverter.${UI.NAMESPACE_CLASS} .cdx-radio__icon,
      #n-ui-language.${UI.NAMESPACE_CLASS} .cdx-radio__icon {
        width: ${isMobile ? "20px" : "14px"};
        height: ${isMobile ? "20px" : "14px"};
        ${isMobile ? `
          border: 2px solid var(--color-notice, #72777d);
          border-radius: 50%;
          position: relative;
          flex-shrink: 0;
        ` : ""}
      }
      #n-malayscriptconverter.${UI.NAMESPACE_CLASS} .cdx-radio__input:checked + .cdx-radio__icon,
      #n-ui-language.${UI.NAMESPACE_CLASS} .cdx-radio__input:checked + .cdx-radio__icon {
        border-color: var(--color-progressive, #36c);
      }
      ${isMobile ? `
        #n-malayscriptconverter.${UI.NAMESPACE_CLASS} .cdx-radio__input:checked + .cdx-radio__icon:after,
        #n-ui-language.${UI.NAMESPACE_CLASS} .cdx-radio__input:checked + .cdx-radio__icon:after {
          content: '';
          position: absolute;
          width: 10px;
          height: 10px;
          background: var(--color-progressive, #36c);
          border-radius: 50%;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }
      ` : ""}
      #n-malayscriptconverter.${UI.NAMESPACE_CLASS} .cdx-radio__input:checked ~ .cdx-radio__label-content,
      #n-ui-language.${UI.NAMESPACE_CLASS} .cdx-radio__input:checked ~ .cdx-radio__label-content {
        color: var(--color-progressive, #36c);
      }
    `;
      const styleElement = document.createElement("style");
      styleElement.id = "rumi-jawi-styles";
      styleElement.textContent = css;
      document.head.appendChild(styleElement);
    },
    createControlsHTML(name, title, options) {
      let html = `<div class="cdx-field"><label class="cdx-label cdx-label--title">
        <span class="cdx-label__text convertible-text" data-rumi="${title}">${title}</span>
        </label><div class="cdx-radio--inline" role="radiogroup" aria-label="${title}">`;
      options.forEach(option => {
        html += `<div class="cdx-radio__content"><label class="cdx-radio__label">
          <input type="radio" class="cdx-radio__input" name="${name}" value="${option.value}" 
            ${option.checked ? "checked" : ""} aria-checked="${option.checked}">
          <span class="cdx-radio__icon"></span>
          <span class="cdx-radio__label-content convertible-text" data-rumi="${option.label}">${option.label}</span>
          </label></div>`;
      });
      html += "</div></div>";
      return html;
    },
    setupControls() {
      const skin = mw.config.get("skin");
      if (!UI.SUPPORTED_SKINS.includes(skin)) {
        DEBUG && console.log(`Unsupported skin: ${skin}, no UI will be shown`);
        return;
      }
      const isMobile = skin === "minerva";
      const container = isMobile ?
        document.querySelector(".menu") :
        document.querySelector("#vector-pinned-container ul, #p-navigation ul");
      if (!container) {
        console.error(`Navigation container not found for ${skin} skin`);
        return;
      }
      document.querySelectorAll("#n-malayscriptconverter, #n-ui-language").forEach(el => el.remove());

      // --- Penukar kandungan (script conversion) ---
      const scriptLi = document.createElement("li");
      scriptLi.id = "n-malayscriptconverter";
      scriptLi.className = UI.NAMESPACE_CLASS;
      const persistentScript = (typeof Storage !== 'undefined') ? localStorage.getItem("persistentScript") : null;
      const scriptOptions = [
        {
          value: "rumi-script",
          label: "Rumi",
          checked: persistentScript ? persistentScript === "rumi" : (State.script === "rumi")
        },
        {
          value: "jawi-script",
          label: "Jawi",
          checked: persistentScript ? persistentScript === "jawi" : (State.script === "jawi")
        }
      ];
      safeSetInnerHTML(scriptLi, this.createControlsHTML("rumi-jawi-script", "Penukar kandungan", scriptOptions));

      // --- Penukar antara muka (interface language) ---
      const langLi = document.createElement("li");
      langLi.id = "n-ui-language";
      langLi.className = UI.NAMESPACE_CLASS;
      const persistentLang = (typeof Storage !== 'undefined') ? localStorage.getItem("persistentLang") : null;
      const currentLanguage = persistentLang || mw.config.get("wgUserLanguage");
      const langOptions = [
        {
          value: "ms",
          label: "Rumi",
          checked: currentLanguage !== "ms-arab"
        },
        {
          value: "ms-arab",
          label: "Jawi",
          checked: currentLanguage === "ms-arab"
        }
      ];
      safeSetInnerHTML(langLi, this.createControlsHTML("rumi-jawi-lang", "Penukar antara muka", langOptions));

      if (isMobile) {
        let menuContainer = container.querySelector(".converter-container");
        if (!menuContainer) {
          menuContainer = document.createElement("div");
          menuContainer.className = "converter-container";
          container.appendChild(menuContainer);
        }
        menuContainer.appendChild(scriptLi);
        menuContainer.appendChild(langLi);
      } else {
        container.appendChild(scriptLi);
        container.appendChild(langLi);
      }
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
      try {
        await new mw.Api().saveOption("language", language);
        DEBUG && console.log(`Language preference set to ${language}`);
      } catch (error) {
        console.error("Failed to save language preference:", error);
      }
    },
    initialize() {
      this.setupStyles();
      this.setupControls();
    }
  };

  // --- Utility: Replace hamza with styled span ---
  function replaceHamzaWithSpan(text) {
    if (!text) return text;
    try {
      const skipExceptions = ["القرءان"];
      const forceCodaWords = ["چيء", "داتوء", "توء", "نيء"];
      let protectedMap = {};
      skipExceptions.forEach((ex, i) => {
        const key = `__EXC${i}__`;
        protectedMap[key] = ex;
        text = text.replace(new RegExp(ex, "g"), key);
      });
      const hamzaSpan = '<span style="vertical-align: 28%; line-height:1.0;">ء</span>';
      forceCodaWords.forEach(word => {
        const wordWithSpan = word.replace(/ء/g, hamzaSpan);
        text = text.replace(new RegExp(word, "g"), wordWithSpan);
      });
      text = text.replace(/(^|[\s\(\[\{،⹁⁏؟:;,.!?-])ء(?=[\u0600-\u06FF])/g, (match, p1) => p1 + hamzaSpan);
      text = text.replace(/([\u0600-\u06FF])ء(?=[\u0600-\u06FF])/g, (match, p1) => p1 + hamzaSpan);
      Object.entries(protectedMap).forEach(([key, ex]) => {
        text = text.replace(new RegExp(key, "g"), ex);
      });
      return text;
    } catch (error) {
      console.error("Error in replaceHamzaWithSpan:", error);
      return text;
    }
  }

  // --- Page context and initialization ---
  function checkPageContext() {
    try {
      return typeof mw.config.get("wgNamespaceNumber") !== "undefined" &&
        !["edit", "submit"].includes(mw.config.get("wgAction")) &&
        !document.querySelector(".ve-active, .wikiEditor-ui") &&
        !mw.config.get("wgVisualEditor")?.isActive;
    } catch (error) {
      console.error("Error checking page context:", error);
      return false;
    }
  }

  function getRequiredElements() {
    const contentElement = document.querySelector("#mw-content-text");
    const titleElement = document.querySelector(".mw-first-heading");
    if (!contentElement || !titleElement) throw new Error("Required content elements not found");
    return { content: contentElement, title: titleElement };
  }

  async function initializeApp() {
    if (State.initialized || !checkPageContext()) return;
    try {
      const { content, title } = getRequiredElements();
      State.init(content, title);
      UIManager.initialize();
      TemplateManager.initialize();
      const [dictionary] = await Promise.all([
        DictionaryManager.fetch()
      ]);
      State.dictionary = dictionary;
      const persistentScript = (typeof Storage !== 'undefined') ? localStorage.getItem("persistentScript") : null;
      const persistentLang = (typeof Storage !== 'undefined') ? localStorage.getItem("persistentLang") : null;
      let isJawi = false;
      if (persistentScript) {
        isJawi = persistentScript === "jawi";
      } else {
        const currentLanguage = persistentLang || mw.config.get("wgUserLanguage");
        isJawi = currentLanguage === "ms-arab";
      }
      State.setScript(isJawi ? "jawi" : "rumi");
      setRadioChecked(isJawi ? "jawi-script" : "rumi-script");
      setRadioChecked((persistentLang || mw.config.get("wgUserLanguage")) === "ms-arab" ? "ms-arab" : "ms");
      if (isJawi) await Converter.convert(true);
      State.initialized = true;
      DEBUG && console.log("Initialized successfully");
    } catch (error) {
      console.error("Initialization failed:", error);
    }
  }

  if (typeof mw !== 'undefined' && mw.hook) {
    mw.hook("wikipage.content").add(initializeApp);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeApp);
  } else {
    requestAnimationFrame(initializeApp);
  }
})();
