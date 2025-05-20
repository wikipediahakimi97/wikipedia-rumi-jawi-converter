/**
 ** LOG:
 ** Updated on 19th May 2025
 **
 **/

/* Convert the text from rumi to jawi script through dictionary data in JSON format stored in GitHub */

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
      URLS: [
        "https://raw.githubusercontent.com/wikipediahakimi97/wikipedia-rumi-jawi-converter/main/WDQSMalayLexeme.json",
        "https://raw.githubusercontent.com/wikipediahakimi97/wikipedia-rumi-jawi-converter/refs/heads/main/WDQSMalayLexeme.json"
      ],
      TIMEOUT: 30000
    },
    // UI related constants
    UI: {
      TEMPLATE_CLASS: "explicit-form-mapping",
      NOCONVERT_CLASS: "no-convert-text",
      TEMPLATE_DATA_ATTR: "data-form-id",
      TEMPLATE_ORIG_TEXT_ATTR: "data-rumi-text",
      SUPPORTED_SKINS: ["vector-2022", "vector", "monobook", "timeless", "minerva"],
      NAMESPACE_CLASS: "mw-list-item"
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
          const {
            timestamp,
            data
          } = JSON.parse(cached);
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
      for (const url of CONFIG.API.URLS) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), CONFIG.API.TIMEOUT);
          
          console.log(`Attempting to fetch from: ${url}`);
          const response = await fetch(url, {
            headers: {
              Accept: "application/json",
              "User-Agent": "RumiJawiConverter/1.0"
            },
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (!response.ok) {
            console.warn(`HTTP error from ${url}: ${response.status}`);
            continue;
          }

          const result = await response.json();
          console.log("Data retrieved successfully, format:", result.hasOwnProperty('results') ? 'SPARQL' : 'Direct JSON');
          
          const processedData = this.process(result);
          console.log("Processed entries:", Object.keys(processedData.words).length);

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
          console.warn(`Error fetching from ${url}:`, error);
        }
      }

      console.error("All URLs failed, returning empty dictionary");
      return {
        words: {},
        phrases: {},
        forms: {},
        formMappings: {}
      };
    },

    process(data) {
      const dictionary = {
        words: {},
        phrases: {},
        forms: {},
        formMappings: {}
      };

      // Handle both SPARQL results format and direct JSON format
      const entries = data.results ? data.results.bindings : data;
      
      if (!Array.isArray(entries)) {
        console.error("Unexpected data format:", data);
        return dictionary;
      }

      entries.forEach(entry => {
        try {
          // Handle both formats of data structure
          const formId = entry.formId?.value || entry.formId;
          const rumiText = (entry.latn?.value || entry.latn || "").toLowerCase();
          const jawiText = entry.arab?.value || entry.arab;

          if (!formId || !rumiText || !jawiText) {
            console.warn("Skipping invalid entry:", entry);
            return;
          }

          dictionary.forms[formId] = jawiText;
          dictionary.formMappings[formId] = rumiText;

          if (rumiText.includes(" ")) {
            dictionary.phrases[rumiText] = formId;
          } else {
            dictionary.words[rumiText] = formId;
          }
        } catch (e) {
          console.warn("Error processing entry:", entry, e);
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
          State.templateOverrides.set(rumiText, {
            formId
          });
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
    // Replace the setupStyles method in UIManager with this scoped version
    setupStyles() {
      const existingStyles = document.getElementById("rumi-jawi-styles");
      if (existingStyles) existingStyles.remove();

      const isMobile = mw.config.get("skin") === "minerva";
      const isMonobook = mw.config.get("skin") === "monobook";
      const css = `
    /* Use more specific selectors with a unique namespace */
    /* Base styles for converter container */
    #n-malayscriptconverter.${CONFIG.UI.NAMESPACE_CLASS},
    #n-ui-language.${CONFIG.UI.NAMESPACE_CLASS} {
      margin: ${isMobile ? "8px 0" : "0"};
      ${isMobile ? "list-style: none;" : ""}
    }
    
    /* Fix for Minerva skin bullet points */
    ${isMobile ? `.menu .${CONFIG.UI.NAMESPACE_CLASS}::before {
      display: none !important;
    }` : ""}
    
    /* Label title */
    #n-malayscriptconverter.${CONFIG.UI.NAMESPACE_CLASS} .cdx-label--title,
    #n-ui-language.${CONFIG.UI.NAMESPACE_CLASS} .cdx-label--title {
      font-weight: bold;
      font-size: inherit;
      padding: ${isMobile ? "8px 16px 4px" : "0"};
      color: ${isMobile ? "var(--color-base, #54595d);" : ""};
    }
    
    /* Radio button group */
    #n-malayscriptconverter.${CONFIG.UI.NAMESPACE_CLASS} .cdx-radio--inline,
    #n-ui-language.${CONFIG.UI.NAMESPACE_CLASS} .cdx-radio--inline {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
    }
    
    /* Radio button container */
    #n-malayscriptconverter.${CONFIG.UI.NAMESPACE_CLASS} .cdx-radio__content,
    #n-ui-language.${CONFIG.UI.NAMESPACE_CLASS} .cdx-radio__content {
      padding: ${isMobile ? "8px 16px" : "4px 0"};
    }
    
    /* Radio button label */
    #n-malayscriptconverter.${CONFIG.UI.NAMESPACE_CLASS} .cdx-radio__label,
    #n-ui-language.${CONFIG.UI.NAMESPACE_CLASS} .cdx-radio__label {
      display: flex;
      align-items: center;
      cursor: pointer;
      gap: ${isMobile ? "12px" : "4px"};
      width: 100%;
      ${isMonobook ? "position: relative;" : ""}
    }
    
    /* Radio input */
    #n-malayscriptconverter.${CONFIG.UI.NAMESPACE_CLASS} .cdx-radio__input,
    #n-ui-language.${CONFIG.UI.NAMESPACE_CLASS} .cdx-radio__input {
      ${isMobile ? `
        position: absolute;
        opacity: 0;
      ` : "margin: 0;"}
      ${isMonobook ? "position: static; " : ""}
    }
    
    /* Radio icon */
    #n-malayscriptconverter.${CONFIG.UI.NAMESPACE_CLASS} .cdx-radio__icon,
    #n-ui-language.${CONFIG.UI.NAMESPACE_CLASS} .cdx-radio__icon {
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
    #n-malayscriptconverter.${CONFIG.UI.NAMESPACE_CLASS} .cdx-radio__input:checked + .cdx-radio__icon,
    #n-ui-language.${CONFIG.UI.NAMESPACE_CLASS} .cdx-radio__input:checked + .cdx-radio__icon {
      border-color: var(--color-progressive, #36c);
    }
    
    ${isMobile ? `
      /* Mobile-specific checked state */
      #n-malayscriptconverter.${CONFIG.UI.NAMESPACE_CLASS} .cdx-radio__input:checked + .cdx-radio__icon:after,
      #n-ui-language.${CONFIG.UI.NAMESPACE_CLASS} .cdx-radio__input:checked + .cdx-radio__icon:after {
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
    
    /* Label content checked state */
    #n-malayscriptconverter.${CONFIG.UI.NAMESPACE_CLASS} .cdx-radio__input:checked ~ .cdx-radio__label-content,
    #n-ui-language.${CONFIG.UI.NAMESPACE_CLASS} .cdx-radio__input:checked ~ .cdx-radio__label-content {
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

      document.querySelectorAll("#n-malayscriptconverter, #n-ui-language").forEach(el => el.remove());

      const scriptLi = document.createElement("li");
      scriptLi.id = "n-malayscriptconverter";
      scriptLi.className = CONFIG.UI.NAMESPACE_CLASS;
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
      langLi.id = "n-ui-language";
      langLi.className = CONFIG.UI.NAMESPACE_CLASS;
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

  function checkPageContext() {
    return (
      typeof mw.config.get("wgNamespaceNumber") !== "undefined" &&
      !["edit", "submit"].includes(mw.config.get("wgAction")) &&
      !document.querySelector(".ve-active, .wikiEditor-ui") &&
      !mw.config.get("wgVisualEditor")?.isActive
    );
  }

  function getRequiredElements() {
    const contentElement = document.querySelector("#mw-content-text");
    const titleElement = document.querySelector(".mw-first-heading");

    if (!contentElement || !titleElement) {
      throw new Error("Required content elements not found");
    }

    return {
      content: contentElement,
      title: titleElement
    };
  }

  function initializeApp() {
    if (State.initialized || !checkPageContext()) {
      return;
    }

    try {
      State.init(...Object.values(getRequiredElements()));
      UIManager.initialize();
      TemplateManager.initialize();

      State.initialized = true;
      CONFIG.APP.DEBUG && console.log("Initialized successfully");
    } catch (error) {
      console.error("Initialization failed:", error);
    }
  }

  // Initialize on dynamic content updates
  mw.hook("wikipage.content").add(initializeApp);

  // Initialize on page load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeApp);
  } else {
    requestAnimationFrame(initializeApp);
  }

})();
