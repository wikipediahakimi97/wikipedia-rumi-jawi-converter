/**
 ** LOG:
 ** Updated on 3rd May 2025
 **
 **/

/* Convert the text from rumi to jawi script */

/* Original author: [[Pengguna:Hakimi97]] */

/* Licensed under the terms of the GNU General Public License version 3.0
* as published by the Free Software Foundation; See the
* GNU General Public License for more details.
* A copy of the GPL is available at https://www.gnu.org/licenses/gpl-3.0.txt 
*/

(() => {
  // Configuration object
  const CONFIG = {
    // Core settings
    APP: {
      CACHE_KEY: "rumiJawiData",
      CACHE_DURATION: 60 * 60 * 1000, // 1 hour
      DEBUG: false
    },
    // API endpoints
    API: {
      SPARQL: "https://query-main.wikidata.org/sparql",
      QUERY: `SELECT DISTINCT ?formId ?latn ?arab (GROUP_CONCAT(DISTINCT ?featureLabel; SEPARATOR=", ") AS ?features) 
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
		GROUP BY ?formId ?latn ?arab`
    },
    // UI related constants
    UI: {
      TEMPLATE_CLASS: "explicit-form-mapping",
      NOCONVERT_CLASS: "no-convert-text",
      TEMPLATE_DATA_ATTR: "data-form-id",
      TEMPLATE_ORIG_TEXT_ATTR: "data-rumi-text",
      SUPPORTED_SKINS: ["vector-2022", "vector", "monobook", "timeless", "minerva"]
    },
    // Conversion maps
    MAPS: {
      PUNCTUATION: {
        ",": "⹁",
        ";": "⁏",
        "?": "؟"
      }
    }
  };

  // State management
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

  // Dictionary manager
  const DictionaryManager = {
    async fetch() {
      const cached = this.loadFromCache();
      if (cached) return cached;
      
      return await this.fetchFromAPI();
    },
    
    loadFromCache() {
      try {
        const cached = localStorage.getItem(CONFIG.APP.CACHE_KEY);
        if (cached) {
          const { timestamp, data } = JSON.parse(cached);
          if (Date.now() - timestamp < CONFIG.APP.CACHE_DURATION) {
            return data;
          }
        }
      } catch (e) {
        console.warn("Cache access error:", e);
      }
      return null;
    },

    async fetchFromAPI() {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        const response = await fetch(
          `${CONFIG.API.SPARQL}?query=${encodeURIComponent(CONFIG.API.QUERY)}&format=json`, {
            headers: {
              Accept: "application/sparql-results+json",
              "User-Agent": "RumiJawiConverter/1.0"
            },
            signal: controller.signal
          }
        );
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const result = await response.json();
        const processedData = this.process(result);
        
        try {
          localStorage.setItem(CONFIG.APP.CACHE_KEY, JSON.stringify({
            timestamp: Date.now(),
            data: processedData
          }));
        } catch (e) {
          console.warn("Error storing in localStorage:", e);
        }
        
        return processedData;
      } catch (error) {
        console.error("Error fetching Rumi-Jawi data:", error);
        return { words: {}, phrases: {}, forms: {}, formMappings: {} };
      }
    },

    process(data) {
      const dictionary = {
        words: {},
        phrases: {},
        forms: {},
        formMappings: {}
      };

      data.results.bindings.forEach(({ formId, latn, arab }) => {
        const rumiText = latn.value.toLowerCase();
        const jawiText = arab.value;
        const formIdValue = formId.value;

        dictionary.forms[formIdValue] = jawiText;
        dictionary.formMappings[formIdValue] = rumiText;

        if (rumiText.includes(" ")) {
          dictionary.phrases[rumiText] = formIdValue;
        } else {
          dictionary.words[rumiText] = formIdValue;
        }
      });

      return dictionary;
    }
  };

  // Converter core
  const Converter = {
    async convert(toJawi) {
      if (!State.dictionary) {
        State.dictionary = await DictionaryManager.fetch();
      }

      TemplateManager.collectOverrides();
      TemplateManager.convert(toJawi);

      if (toJawi) {
        await this.convertToJawi();
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

      State.title.textContent = this.convertText(State.title.textContent, State.dictionary);

      const textNodes = [];
      const walker = document.createTreeWalker(
        State.content,
        NodeFilter.SHOW_TEXT, {
          acceptNode: node => {
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;

            // Skip conversion for templates and other special elements
            if (parent.tagName === "SCRIPT" || 
                parent.tagName === "STYLE" ||
                parent.classList.contains(CONFIG.UI.NOCONVERT_CLASS) ||
                parent.classList.contains(CONFIG.UI.TEMPLATE_CLASS) ||
                parent.closest("#p-navigation, .mw-portlet, .vector-menu, .mw-header")) {
              return NodeFilter.FILTER_REJECT;
            }

            return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
          }
        }
      );

      let node;
      while ((node = walker.nextNode())) {
        textNodes.push(node);
      }

      const chunkSize = 50;
      let currentIndex = 0;

      const processNextChunk = () => {
        const endIndex = Math.min(currentIndex + chunkSize, textNodes.length);

        for (let i = currentIndex; i < endIndex; i++) {
          const textNode = textNodes[i];
          if (textNode.textContent.trim()) {
            textNode.textContent = this.convertText(textNode.textContent, State.dictionary);

            let parent = textNode.parentElement;
            while (parent && !parent.classList.contains("mw-content-text")) {
              if (parent.nodeType === 1 && !parent.classList.contains(CONFIG.UI.NOCONVERT_CLASS) &&
                parent.closest("#mw-content-text")) {
                this.setRTLDirection(parent, true);
              }
              parent = parent.parentElement;
            }
          }
        }

        currentIndex = endIndex;

        if (currentIndex < textNodes.length) {
          requestAnimationFrame(processNextChunk);
        }
      };

      requestAnimationFrame(processNextChunk);
    },

    revertToRumi() {
      if (State.originalContent) {
        State.content.innerHTML = State.originalContent;
        State.title.textContent = State.originalTitle;
        this.setRTLDirection(State.content, false);
        this.setRTLDirection(State.title, false);

        const rtlElements = State.content.querySelectorAll("[dir=\"rtl\"]");
        rtlElements.forEach(el => {
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

      // Skip template override conversions in generic text conversion
      // Only used by template manager
      if (State.templateOverrides.size > 0 && false) {
        // Template-specific override logic is skipped here
      }

      const sortedPhrases = Object.keys(dict.phrases).sort((a, b) => b.length - a.length);
      if (sortedPhrases.length > 0) {
        const phraseRegex = new RegExp(
          sortedPhrases.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
          "gi"
        );
        result = result.replace(phraseRegex, match => {
          const formId = dict.phrases[match.toLowerCase()];
          return formId ? dict.forms[formId] : match;
        });
      }

      const apostropheWords = Object.keys(dict.words)
        .filter(word => word.includes("'"))
        .sort((a, b) => b.length - a.length);
      if (apostropheWords.length > 0) {
        const apostropheRegex = new RegExp(
          apostropheWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
          "gi"
        );
        result = result.replace(apostropheRegex, match => {
          const formId = dict.words[match.toLowerCase()];
          return formId ? dict.forms[formId] : match;
        });
      }

      result = result.replace(/\b\w+(?:-\w+)+\b/g, match => {
        const formId = dict.words[match.toLowerCase()];
        if (formId) return dict.forms[formId];
        
        return match.split("-")
          .map(part => {
            const partFormId = dict.words[part.toLowerCase()];
            return partFormId ? dict.forms[partFormId] : part;
          })
          .join("-");
      });

      result = result.replace(/\b[a-zA-Z\u00C0-\u024F0-9_]+\b/g, match => {
        const formId = dict.words[match.toLowerCase()];
        return formId ? dict.forms[formId] : match;
      });

      result = result.replace(/(^|[\s]+)((?:[کد])|ال)[\s]+(\S)/g, (match, spaceBefore, entity, nextChar) => {
        if (entity === "ال") {
          return `${spaceBefore}ا${"ل" + nextChar}`;
        } else {
          return `${spaceBefore}${entity}${nextChar === "ا" ? "أ" : nextChar}`;
        }
      });

      result = result.replace(/[,;?]/g, match =>
        CONFIG.MAPS.PUNCTUATION[match] || match
      );

      numbers.forEach((number, index) => {
        result = result.replace(`__NUM${index}__`, number);
      });

      return result;
    },

    setRTLDirection(element, isRTL) {
      if (!element) return;
      if (isRTL) {
        element.setAttribute("dir", "rtl");
        element.setAttribute("lang", "ms-arab");
      } else {
        element.setAttribute("dir", "ltr");
        element.setAttribute("lang", "ms");
      }
    }
  };

  // Template manager
  const TemplateManager = {
    collectOverrides() {
      const templateElements = document.querySelectorAll(`.${CONFIG.UI.TEMPLATE_CLASS}`);
      State.templateOverrides.clear();
      
      templateElements.forEach(element => {
        const rumiText = element.getAttribute(CONFIG.UI.TEMPLATE_ORIG_TEXT_ATTR)?.toLowerCase();
        const formId = element.getAttribute(CONFIG.UI.TEMPLATE_DATA_ATTR);
        
        if (rumiText && formId) {
          State.templateOverrides.set(rumiText, { formId });
        }
      });
    },

    convert(toJawi) {
      document.querySelectorAll(`.${CONFIG.UI.TEMPLATE_CLASS}`).forEach(element => {
        const rumiText = element.getAttribute(CONFIG.UI.TEMPLATE_ORIG_TEXT_ATTR);
        const formId = element.getAttribute(CONFIG.UI.TEMPLATE_DATA_ATTR);
        
        if (!this.validateFormMapping(formId, rumiText, State.dictionary)) {
          element.classList.add(CONFIG.UI.NOCONVERT_CLASS);
          element.classList.remove(CONFIG.UI.TEMPLATE_CLASS);
          return;
        }

        const newText = toJawi ? State.dictionary.forms[formId] || rumiText : rumiText;
        if (element.textContent !== newText) {
          element.textContent = newText;
          Converter.setRTLDirection(element, toJawi);
        }
      });
    },

    validateFormMapping(formId, rumiText, dict) {
      if (!formId || !rumiText || !dict.formMappings[formId]) return false;
      return dict.formMappings[formId].toLowerCase() === rumiText.toLowerCase();
    },

    initialize() {
      const potentialTemplates = document.querySelectorAll("[data-form-id]");
      potentialTemplates.forEach(element => {
        if (element.classList.contains(CONFIG.UI.TEMPLATE_CLASS)) return;
        
        const formId = element.getAttribute(CONFIG.UI.TEMPLATE_DATA_ATTR);
        if (!formId) return;
        
        if (!element.hasAttribute(CONFIG.UI.TEMPLATE_ORIG_TEXT_ATTR)) {
          element.setAttribute(CONFIG.UI.TEMPLATE_ORIG_TEXT_ATTR, element.textContent);
        }
        
        element.classList.add(CONFIG.UI.TEMPLATE_CLASS);
      });

      const noConvertElements = document.querySelectorAll("[data-no-convert]");
      noConvertElements.forEach(element => {
        if (!element.classList.contains(CONFIG.UI.NOCONVERT_CLASS)) {
          element.classList.add(CONFIG.UI.NOCONVERT_CLASS);
        }
      });
      
      console.log(`Initialized ${document.querySelectorAll(`.${CONFIG.UI.TEMPLATE_CLASS}`).length} form templates`);
      console.log(`Initialized ${document.querySelectorAll(`.${CONFIG.UI.NOCONVERT_CLASS}`).length} no-convert templates`);
    }
  };

  // UI manager
  const UIManager = {
    setupStyles() {
      const existingStyles = document.getElementById("rumi-jawi-styles");
      if (existingStyles) existingStyles.remove();
      
      const isMobile = mw.config.get("skin") === "minerva";
      const css = `
        /* Base styles for converter container */
        #ca-nstab-rkj, #ca-ui-language {
          font-family: inherit;
          font-weight: normal;
          display: block;
          margin: ${isMobile ? "8px 0" : "0"};
        }
        
        /* Label title */
        .cdx-label--title {
          font-weight: bold;
          display: block;
          margin: ${isMobile ? "0" : "4px 0"};
          padding: ${isMobile ? "8px 16px 4px" : "0"};
          color: var(--color-base, #54595d);
        }
        
        /* Radio button group */
        .cdx-radio--inline {
          display: flex;
          flex-direction: ${isMobile ? "column" : "row"};
          align-items: ${isMobile ? "flex-start" : "center"};
          ${!isMobile ? "gap: 8px;" : ""}
        }
        
        /* Radio button container */
        .cdx-radio__content {
          display: flex;
          align-items: center;
          margin: 0;
          ${isMobile ? `
            width: 100%;
            padding: 8px 16px;
          ` : ""}
        }
        
        /* Radio button label */
        .cdx-radio__label {
          display: flex;
          align-items: center;
          cursor: pointer;
          gap: ${isMobile ? "12px" : "4px"};
          ${isMobile ? "width: 100%;" : ""}
        }
        
        /* Radio input */
        .cdx-radio__input {
          ${isMobile ? `
            position: absolute;
            opacity: 0;
          ` : "margin: 0;"}
        }
        
        /* Radio icon */
        .cdx-radio__icon {
          width: ${isMobile ? "20px" : "14px"};
          height: ${isMobile ? "20px" : "14px"};
          ${isMobile ? `
            border: 2px solid var(--color-notice, #72777d);
            border-radius: 50%;
            position: relative;
            flex-shrink: 0;
          ` : ""}
        }
        
        /* Radio checked state */
        .cdx-radio__input:checked + .cdx-radio__icon {
          border-color: var(--color-progressive, #36c);
        }
        
        ${isMobile ? `
          /* Mobile-specific checked state */
          .cdx-radio__input:checked + .cdx-radio__icon:after {
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
          
          /* Mobile text styles */
          .cdx-radio__label-content {
            color: var(--color-base, #202122);
            font-size: 14px;
          }
        ` : ""}
        
        /* Label content checked state */
        .cdx-radio__input:checked ~ .cdx-radio__label-content {
          color: var(--color-progressive, #36c);
          font-weight: ${isMobile ? "500" : "bold"};
        }
        
        /* Template styles */
        .${CONFIG.UI.TEMPLATE_CLASS} {
          display: inline;
        }
        
        /* Skin-specific adjustments for Minerva */
        ${isMobile ? `
          .skin-minerva-latest #ca-nstab-rkj,
          .skin-minerva-latest #ca-ui-language {
            padding: 0 16px !important;
            width: 100%;
          }
        ` : ""}
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
        const labelContent = option.isCode ?
          `<span class="cdx-radio__label-content">${option.label}</span>` :
          `<span class="cdx-radio__label-content convertible-text" data-rumi="${option.label}">${option.label}</span>`;
        
        html += `<div class="cdx-radio__content"><label class="cdx-radio__label">
          <input type="radio" class="cdx-radio__input" name="${name}" value="${option.value}" 
            ${option.checked ? "checked" : ""} aria-checked="${option.checked}">
          <span class="cdx-radio__icon"></span>${labelContent}
          </label></div>`;
      });
      
      html += "</div></div>";
      return html;
    },

    setupControls() {
      const skin = mw.config.get("skin");
      if (!CONFIG.UI.SUPPORTED_SKINS.includes(skin)) {
        console.log(`Unsupported skin: ${skin}, no UI will be shown`);
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
      
      document.querySelectorAll("#ca-nstab-rkj, #ca-ui-language").forEach(el => el.remove());
      
      const scriptLi = document.createElement("li");
      scriptLi.id = "ca-nstab-rkj";
      scriptLi.innerHTML = this.createControlsHTML("rumi-jawi", "Penukar tulisan", [{
          value: "rumi",
          label: "Rumi",
          checked: State.script === "rumi"
        },
        {
          value: "jawi",
          label: "Jawi",
          checked: State.script === "jawi"
        }
      ]);
      
      const currentLanguage = mw.config.get("wgUserLanguage");
      const langLi = document.createElement("li");
      langLi.id = "ca-ui-language";
      langLi.innerHTML = this.createControlsHTML("ui-language", "Penukar antara muka", [{
          value: "rumi-ui",
          label: "ms-latn",
          checked: currentLanguage !== "ms-arab",
          isCode: true
        },
        {
          value: "jawi-ui",
          label: "ms-arab",
          checked: currentLanguage === "ms-arab",
          isCode: true
        }
      ]);
      
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
      document.querySelectorAll(".cdx-radio__input[name=\"rumi-jawi\"]").forEach(radio => {
        radio.addEventListener("change", async function() {
          const isJawi = this.value === "jawi";
          State.setScript(isJawi ? "jawi" : "rumi");
          
          document.querySelectorAll(".cdx-radio__input[name=\"rumi-jawi\"]").forEach(input => {
            input.setAttribute("aria-checked", input.checked.toString());
          });
          
          try {
            if (!State.dictionary) {
              State.dictionary = await DictionaryManager.fetch();
            }
            
            document.querySelectorAll(".convertible-text").forEach(element => {
              const rumiText = element.getAttribute("data-rumi");
              element.textContent = isJawi ? Converter.convertText(rumiText, State.dictionary) : rumiText;
            });
            
            await Converter.convert(isJawi);
          } catch (error) {
            console.error("Conversion error:", error);
            
            const previousState = isJawi ? "rumi" : "jawi";
            State.setScript(previousState);
            const prevRadio = document.querySelector(`input[value="${previousState}"]`);
            if (prevRadio) {
              prevRadio.checked = true;
              prevRadio.setAttribute("aria-checked", "true");
            }
          }
        });
      });
      
      document.querySelectorAll(".cdx-radio__input[name=\"ui-language\"]").forEach(radio => {
        radio.addEventListener("change", async function() {
          const language = this.value === "jawi-ui" ? "ms-arab" : "ms";
          await UIManager.setUserLanguage(language);
          window.location.reload();
        });
      });
    },

    async setUserLanguage(language) {
      try {
        await new mw.Api().saveOption("language", language);
        console.log(`Language preference set to ${language}`);
      } catch (error) {
        console.error("Failed to save language preference:", error);
      }
    },

    initialize() {
      this.setupStyles();
      this.setupControls();
    }
  };

  function initializeElements() {
    const elements = {
      content: document.querySelector("#mw-content-text"),
      title: document.querySelector(".mw-first-heading")
    };

    if (!elements.content || !elements.title) {
      throw new Error("Required content elements not found");
    }

    return elements;
  }

  function isValidContext() {
    if (mw.config.get("wgNamespaceNumber") === undefined) return false;
    if (mw.config.get("wgAction") === "edit" || mw.config.get("wgAction") === "submit" ||
        document.querySelector(".ve-active, .wikiEditor-ui") !== null ||
        mw.config.get("wgVisualEditor")?.isActive === true) {
      return false;
    }
    return true;
  }

  function initialize() {
    if (State.initialized || !isValidContext()) return;

    try {
      const elements = initializeElements();
      if (!elements) return;

      State.init(elements.content, elements.title);
      UIManager.initialize();
      TemplateManager.initialize();
      
      State.initialized = true;
      if (CONFIG.APP.DEBUG) console.log("Initialized successfully");
    } catch (error) {
      console.error("Initialization failed:", error);
    }
  }

  mw.hook("wikipage.content").add(() => initialize());
  if (document.readyState !== "loading") {
    setTimeout(initialize, 0);
  } else {
    document.addEventListener("DOMContentLoaded", initialize);
  }
})();
