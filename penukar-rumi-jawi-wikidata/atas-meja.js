/**
 ** LOG:
 ** Updated on 1st March 2025
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
  // All namespaces should be able to be converted
  if (mw.config.get('wgNamespaceNumber') === undefined) return;

  // Skip initialization if in edit mode or Visual Editor
  if (mw.config.get('wgAction') === 'edit' || 
      mw.config.get('wgAction') === 'submit' ||
      document.querySelector('.ve-active') !== null ||
      document.querySelector('.wikiEditor-ui') !== null ||
      mw.config.get('wgVisualEditor')?.isActive === true) {
    console.log('Edit mode or Visual Editor detected - Rumi-Jawi converter disabled');
    return;
  }

  // Constants using Object.freeze for immutability
  const CONFIG = Object.freeze({
    CACHE_DURATION: 24 * 60 * 60 * 1000,
    BATCH_SIZE: 100,
    MAX_REGEX_CACHE: 1000,
    SPARQL_ENDPOINT: 'https://query-main.wikidata.org/sparql',
    QUERY: `SELECT DISTINCT ?form ?latn ?arab (GROUP_CONCAT(DISTINCT ?featureLabel; SEPARATOR=", ") AS ?totalFeatureLabels) WHERE {
      ?f dct:language wd:Q9237;
         ontolex:lexicalForm ?form FILTER (lang(?latn) = "ms").
      ?form ontolex:representation ?latn;
         ontolex:representation ?arab FILTER (lang(?arab) = "ms-arab").
      OPTIONAL { 
        ?form wikibase:grammaticalFeature ?feature .
        ?feature rdfs:label ?featureLabel FILTER (lang(?featureLabel) = "en").
      }
      FILTER (!BOUND(?feature) || (
        ?feature != wd:Q98912 && 
        ?feature != wd:Q8185162 && 
        ?feature != wd:Q10617810
      ))
    } 
    GROUP BY ?form ?latn ?arab`,
    PUNCTUATION_MAP: { ',': '⹁', ';': '⁏', '?': '؟' }
  });

  // Simplified state object
  const State = {
    cache: {
      content: null,
      title: null,
      processedText: new Map(),
      rumiJawi: null,
      lastFetch: 0,
      currentScript: 'rumi'
    },
    elements: {
      content: null,
      title: null
    },
    regexCache: new WeakMap(),
    nodeCacheStore: new WeakMap(),
    isInitialized: false,
    fetchPromise: null
  };

  // Cache for word-to-regex using string keys
  const stringRegexCache = new Map();

  const Utils = {
    regexEscape: str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    getRegex(word) {
      if (!stringRegexCache.has(word)) {
        if (stringRegexCache.size >= CONFIG.MAX_REGEX_CACHE) {
          const keys = [...stringRegexCache.keys()];
          keys.slice(0, Math.floor(keys.length / 2)).forEach(key => stringRegexCache.delete(key));
        }
        stringRegexCache.set(word, new RegExp(`\\b${this.regexEscape(word)}\\b`, 'gi'));
      }
      return stringRegexCache.get(word);
    },
    createRumiVariants: rumi => new Set([
      rumi,
      rumi.normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
      rumi.charAt(0).toUpperCase() + rumi.slice(1)
    ])
  };

  const TextConverter = {
    processFetchedData(data) {
      const maps = {
        phrasesMap: new Map(),
        wordsMap: new Map()
      };

      data.results.bindings.forEach(({ latn, arab }) => {
        const rumi = latn.value.toLowerCase();
        const jawi = arab.value;
        if (rumi.includes(' ')) {
          Utils.createRumiVariants(rumi).forEach(variant => maps.phrasesMap.set(variant, jawi));
        } else {
          Utils.createRumiVariants(rumi).forEach(variant => maps.wordsMap.set(variant, jawi));
        }
      });
      return maps;
    },

    convertText(text, maps) {
      if (!text?.trim()) return text;
      
      const cacheKey = `${text}-${State.cache.currentScript}`;
      if (State.cache.processedText.has(cacheKey)) {
        return State.cache.processedText.get(cacheKey);
      }

      const numberPlaceholders = [];
      const result = text
        .replace(/\d+(?:[,.]\d+)*(?:\.\d+)?%?/g, match => {
          const placeholder = `__NUM${numberPlaceholders.push(`\u2066${match}\u2069`) - 1}__`;
          return placeholder;
        })
        .replace(new RegExp([...maps.phrasesMap.keys()]
          .sort((a, b) => b.length - a.length)
          .map(Utils.regexEscape)
          .join('|'), 'gi'), match => maps.phrasesMap.get(match.toLowerCase()) || match)
        .replace(/\b'\w+\b|\b\w+'\w*\b|\b\w+'\b/g, match => 
          maps.wordsMap.get(match.toLowerCase()) || match)
        .replace(/\b\w+(?:-\w+)+\b/g, match => {
          const completeConversion = maps.wordsMap.get(match.toLowerCase());
          return completeConversion || match.split('-')
            .map(part => maps.wordsMap.get(part.toLowerCase()) || part)
            .join('-');
        })
        .replace(/\b\w+\b/g, match => maps.wordsMap.get(match.toLowerCase()) || match)
        .replace(/(^|[\s\u00A0]+)[کد][\s\u00A0]+(\S)/g, (_, p1, p2) => 
          `${p1}${_[p1.length]}${p2 === 'ا' ? 'أ' : p2}`)
        .replace(/[,;?]/g, match => CONFIG.PUNCTUATION_MAP[match] || match);

      const processedText = numberPlaceholders.reduce(
        (text, number, index) => text.replace(`__NUM${index}__`, number),
        result
      );
      State.cache.processedText.set(cacheKey, processedText);
      return processedText;
    }
  };

  const DataFetcher = {
    async fetchData(query) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      try {
        const response = await fetch(
          `${CONFIG.SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`,
          {
            headers: {
              Accept: 'application/sparql-results+json',
              'User-Agent': 'RumiJawiConverter/1.0'
            },
            mode: 'cors',
            signal: controller.signal
          }
        );
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
      } finally {
        clearTimeout(timeoutId);
      }
    },

    async fetchRumiJawiData() {
      const now = Date.now();
      if (State.cache.rumiJawi && now - State.cache.lastFetch < CONFIG.CACHE_DURATION) {
        return State.cache.rumiJawi;
      }
      if (State.fetchPromise) return State.fetchPromise;
      State.fetchPromise = this.fetchData(CONFIG.QUERY)
        .then(data => {
          const maps = TextConverter.processFetchedData(data);
          State.cache.rumiJawi = maps;
          State.cache.lastFetch = now;
          State.fetchPromise = null;
          return maps;
        })
        .catch(error => {
          console.error('Error fetching Rumi-Jawi data:', error);
          State.fetchPromise = null;
          return State.cache.rumiJawi || {
            phrasesMap: new Map(),
            wordsMap: new Map()
          };
        });
      return State.fetchPromise;
    }
  };

  const DOMHandler = {
    observer: null,

    initObserver() {
      this.observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            this.processElement(entry.target);
            this.observer.unobserve(entry.target);
          }
        });
      });
    },

    processElement(element) {
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: node => {
            const parent = node.parentElement;
            return parent && (
              parent.tagName === 'SCRIPT' ||
              parent.tagName === 'STYLE' ||
              parent.classList.contains('no-convert') ||
              parent.closest('#p-navigation, .mw-portlet, .vector-menu, .mw-header')
            ) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
          }
        }
      );

      const nodes = [];
      let node;
      while ((node = walker.nextNode())) {
        if (node.textContent.trim()) nodes.push(node);
      }
      for (let i = 0; i < nodes.length; i += CONFIG.BATCH_SIZE) {
        const batch = nodes.slice(i, i + CONFIG.BATCH_SIZE);
        requestAnimationFrame(() => this.processBatch(batch));
      }
    },

    processBatch(nodes) {
      nodes.forEach(node => {
        let nodeCache = State.nodeCacheStore.get(node);
        if (!nodeCache) {
          nodeCache = new Map();
          State.nodeCacheStore.set(node, nodeCache);
        }
        const cacheKey = `${node.textContent}-${State.cache.currentScript}`;
        if (nodeCache.has(cacheKey)) {
          node.textContent = nodeCache.get(cacheKey);
          this.updateElementDirection(node.parentElement);
          return;
        }
        const newText = TextConverter.convertText(node.textContent, State.cache.rumiJawi);
        if (newText !== node.textContent) {
          nodeCache.set(cacheKey, newText);
          node.textContent = newText;
          this.updateElementDirection(node.parentElement);
        }
      });
    },

    updateElementDirection(element) {
      while (element && !element.classList.contains('mw-content-text')) {
        if (
          element.nodeType === 1 &&
          !element.classList.contains('no-convert') &&
          element.closest('#mw-content-text')
        ) {
          element.setAttribute('dir', 'rtl');
          element.setAttribute('lang', 'ms-arab');
        }
        element = element.parentElement;
      }
    },

    async applyConversion(isJawi) {
      if (!this.observer) this.initObserver();
      if (isJawi) {
        State.cache.content = State.cache.content || State.elements.content.innerHTML;
        State.cache.title = State.cache.title || State.elements.title.textContent;
        State.elements.content.setAttribute('dir', 'rtl');
        State.elements.content.setAttribute('lang', 'ms-arab');
        State.elements.title.setAttribute('dir', 'rtl');
        State.elements.title.setAttribute('lang', 'ms-arab');
        this.observer.observe(State.elements.content);
        if (State.elements.title) {
          State.elements.title.textContent = TextConverter.convertText(
            State.elements.title.textContent, 
            State.cache.rumiJawi
          );
        }
      } else {
        if (State.cache.content) {
          State.elements.content.innerHTML = State.cache.content;
          State.elements.content.setAttribute('dir', 'ltr');
          State.elements.content.setAttribute('lang', 'ms');
          const rtlElements = State.elements.content.querySelectorAll('#mw-content-text [dir="rtl"]');
          rtlElements.forEach(el => {
            el.removeAttribute('dir');
            el.removeAttribute('lang');
          });
          State.cache.content = null;
        }
        if (State.cache.title) {
          State.elements.title.textContent = State.cache.title;
          State.elements.title.setAttribute('dir', 'ltr');
          State.elements.title.setAttribute('lang', 'ms');
          State.cache.title = null;
        }
        State.nodeCacheStore = new WeakMap();
      }
    }
  };

  const ElementCache = {
    store: new WeakMap(),
    get(selector) {
      const element = document.querySelector(selector);
      if (!element) return null;
      if (!this.store.has(element)) {
        this.store.set(element, element);
      }
      return this.store.get(element);
    }
  };

  const UIManager = {
    elementCache: new WeakMap(),
    async saveUserLanguagePreference(language) {
      try {
        await new mw.Api().saveOption("language", language);
        console.log(`Language preference set to ${language}`);
      } catch (error) {
        console.error("Failed to save language preference:", error);
      }
    },
    setupStyles() {
      const existingStyles = document.getElementById('rumi-jawi-styles');
      if (existingStyles) existingStyles.remove();
      const styles = `
        #ca-nstab-rkj {
          font-family: sans-serif;
          font-weight: normal;
          padding: 0 !important;
          margin: 0 !important;
          border: none !important;
          background: none !important;
        }
        .cdx-field { padding: 0; margin: 0; }
        .cdx-label--title {
          font-weight: bold;
          display: block;
          margin: 4px 0;
        }
        .cdx-radio--inline {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .cdx-radio__content {
          display: flex;
          align-items: center;
          margin: 0;
        }
        .cdx-radio__label {
          display: flex;
          align-items: center;
          gap: 4px;
          font-weight: normal;
          cursor: pointer;
        }
        .cdx-radio__icon {
          width: 14px;
          height: 14px;
        }
        .cdx-radio__input { margin: 0; }
        .cdx-radio__input:checked + .cdx-radio__icon {
          background-color: var(--color-progressive, #36c);
          border-color: var(--color-progressive, #36c);
        }
        .cdx-radio__input:checked ~ .cdx-radio__label-content {
          color: var(--color-progressive, #36c);
          font-weight: bold;
        }
        .cdx-radio__label:hover .cdx-radio__icon {
          border-color: var(--color-progressive, #36c);
        }
      `;
      const styleElement = document.createElement('style');
      styleElement.id = 'rumi-jawi-styles';
      styleElement.textContent = styles;
      document.head.appendChild(styleElement);
    },
    setupRadioButtons() {
      try {
        const interactionMenu = document.querySelector('#p-navigation ul');
        if (!interactionMenu) return;
        this.setupStyles();
        const scriptConverterLi = document.createElement('li');
        scriptConverterLi.id = 'ca-nstab-rkj';
        const uiLanguageLi = document.createElement('li');
        uiLanguageLi.id = 'ca-ui-language';
        scriptConverterLi.innerHTML = `
          <div class="cdx-field">
            <label class="cdx-label cdx-label--title">
              <span class="cdx-label__text convertible-text" data-rumi="Penukar tulisan">
                Penukar tulisan
              </span>
            </label>
            <div class="cdx-radio cdx-radio--inline" role="radiogroup" aria-label="Script Selection">
              <div class="cdx-radio__content">
                ${this.createRadioButton('rumi-jawi', 'rumi', 'Rumi')}
              </div>
              <div class="cdx-radio__content">
                ${this.createRadioButton('rumi-jawi', 'jawi', 'Jawi')}
              </div>
            </div>
          </div>
        `;
        uiLanguageLi.innerHTML = `
          <div class="cdx-field">
            <label class="cdx-label cdx-label--title">
              <span class="cdx-label__text convertible-text" data-rumi="Penukar antara muka">
                Penukar antara muka
              </span>
            </label>
            <div class="cdx-radio cdx-radio--inline" role="radiogroup" aria-label="UI Language Selection">
              <div class="cdx-radio__content">
                ${this.createRadioButton('ui-language', 'rumi-ui', 'ms-latn')}
              </div>
              <div class="cdx-radio__content">
                ${this.createRadioButton('ui-language', 'jawi-ui', 'ms-arab')}
              </div>
            </div>
          </div>
        `;
        interactionMenu.appendChild(scriptConverterLi);
        interactionMenu.appendChild(uiLanguageLi);
        this.setupEventHandlers();
        this.setInitialUILanguage();
      } catch (error) {
        console.error('Radio button setup error:', error);
      }
    },
    createRadioButton(name, value, label) {
      const isChecked = (name === 'rumi-jawi' && value === State.cache.currentScript) ||
                        (name === 'ui-language' &&
                         ((value === 'jawi-ui' && mw.config.get('wgUserLanguage') === 'ms-arab') ||
                          (value === 'rumi-ui' && mw.config.get('wgUserLanguage') !== 'ms-arab')));
      const isLanguageCode = label === 'ms-arab' || label === 'ms-latn';
      const labelContent = isLanguageCode
        ? `<span class="cdx-radio__label-content">${label}</span>`
        : `<span class="cdx-radio__label-content convertible-text" data-rumi="${label}">${label}</span>`;
      return `
        <label class="cdx-radio__label">
          <input type="radio" class="cdx-radio__input" name="${name}" value="${value}" ${isChecked ? 'checked' : ''} aria-checked="${isChecked}">
          <span class="cdx-radio__icon" aria-hidden="true"></span>
          ${labelContent}
        </label>
      `;
    },
    getConvertibleElements() {
      if (!this.elementCache.has(document)) {
        const elements = document.querySelectorAll('.convertible-text');
        this.elementCache.set(document, elements);
      }
      return this.elementCache.get(document);
    },
    setupEventHandlers() {
      const rumiJawiRadios = document.querySelectorAll('.cdx-radio__input[name="rumi-jawi"]');
      rumiJawiRadios.forEach(radio => {
        radio.addEventListener('change', async function() {
          const isJawi = this.value === 'jawi';
          State.cache.currentScript = isJawi ? 'jawi' : 'rumi';
          document.querySelectorAll('.cdx-radio__input[name="rumi-jawi"]').forEach(input => {
            input.setAttribute('aria-checked', input.checked.toString());
          });
          try {
            if (!State.isInitialized) await initRumiJawi();
            const maps = await DataFetcher.fetchRumiJawiData();
            const convertibleElements = UIManager.getConvertibleElements();
            Array.from(convertibleElements).forEach(element => {
              const rumiText = element.getAttribute('data-rumi');
              element.textContent = isJawi ? TextConverter.convertText(rumiText, maps) : rumiText;
            });
            DOMHandler.applyConversion(isJawi);
          } catch (error) {
            console.error('Conversion error:', error);
            const previousState = isJawi ? 'rumi' : 'jawi';
            State.cache.currentScript = previousState;
            const prevRadio = document.querySelector(`input[value="${previousState}"]`);
            if (prevRadio) {
              prevRadio.checked = true;
              prevRadio.setAttribute('aria-checked', 'true');
              prevRadio.dispatchEvent(new Event('change'));
            }
          }
        });
      });
      const uiLanguageRadios = document.querySelectorAll('.cdx-radio__input[name="ui-language"]');
      uiLanguageRadios.forEach(radio => {
        radio.addEventListener('change', async function() {
          const language = this.value === 'jawi-ui' ? 'ms-arab' : 'ms';
          await UIManager.saveUserLanguagePreference(language);
          window.location.reload();
        });
      });
    },
    setInitialUILanguage() {
      const currentLanguage = mw.config.get('wgUserLanguage');
      const value = currentLanguage === 'ms-arab' ? 'jawi-ui' : 'rumi-ui';
      const radio = document.querySelector(`input[name="ui-language"][value="${value}"]`);
      if (radio) radio.checked = true;
    }
  };

  // Helper function to check if we're in any editor view
  function isInEditorMode() {
    return mw.config.get('wgAction') === 'edit' || 
           mw.config.get('wgAction') === 'submit' ||
           document.querySelector('.ve-active') !== null ||
           document.querySelector('.wikiEditor-ui') !== null ||
           mw.config.get('wgVisualEditor')?.isActive === true;
  }

  function onDocumentReady(fn) {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(fn, 1);
    } else {
      document.addEventListener('DOMContentLoaded', fn);
    }
  }
  
  onDocumentReady(() => {
    // Check again if we're in edit mode (in case the page state changed after initial load)
    if (isInEditorMode()) {
      console.log('Edit mode or Visual Editor detected - Rumi-Jawi converter disabled');
      return;
    }
    
    State.elements.content = document.querySelector('#mw-content-text');
    State.elements.title = document.querySelector('.mw-first-heading');
    if (!State.elements.content || !State.elements.title) {
      console.error('Content elements not found');
      return;
    }
    UIManager.setupRadioButtons();
    window.initRumiJawi = async () => {
      if (State.isInitialized) return;
      if (!window.mw?.config) throw new Error('MediaWiki configuration is not available');
      State.isInitialized = true;
      console.log('Rumi-Jawi converter initialized successfully');
    };
    window.initRumiJawi().catch(error => console.error('Initialization failed:', error));
  });
})();
