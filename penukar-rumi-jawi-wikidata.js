(() => {
  // All namespaces should be able to be converted
  if(mw.config.get('wgNamespaceNumber') === undefined) return;

  // Skip initialization if in edit mode or Visual Editor
  if(mw.config.get('wgAction') === 'edit' ||
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
    PUNCTUATION_MAP: {
      ',': '⹁',
      ';': '⁏',
      '?': '؟'
    }
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
      if(!stringRegexCache.has(word)) {
        if(stringRegexCache.size >= CONFIG.MAX_REGEX_CACHE) {
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

      data.results.bindings.forEach(({
        latn,
        arab
      }) => {
        const rumi = latn.value.toLowerCase();
        const jawi = arab.value;
        if(rumi.includes(' ')) {
          Utils.createRumiVariants(rumi).forEach(variant => maps.phrasesMap.set(variant, jawi));
        } else {
          Utils.createRumiVariants(rumi).forEach(variant => maps.wordsMap.set(variant, jawi));
        }
      });
      return maps;
    },

    convertText(text, maps) {
      if(!text?.trim()) return text;

      const cacheKey = `${text}-${State.cache.currentScript}`;
      if(State.cache.processedText.has(cacheKey)) {
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
          `${CONFIG.SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`, {
            headers: {
              Accept: 'application/sparql-results+json',
              'User-Agent': 'RumiJawiConverter/1.0'
            },
            mode: 'cors',
            signal: controller.signal
          }
        );
        if(!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
      } finally {
        clearTimeout(timeoutId);
      }
    },

    async fetchRumiJawiData() {
      const now = Date.now();
      if(State.cache.rumiJawi && now - State.cache.lastFetch < CONFIG.CACHE_DURATION) {
        return State.cache.rumiJawi;
      }
      if(State.fetchPromise) return State.fetchPromise;
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
          if(entry.isIntersecting) {
            this.processElement(entry.target);
            this.observer.unobserve(entry.target);
          }
        });
      });
    },

    processElement(element) {
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT, {
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
      while((node = walker.nextNode())) {
        if(node.textContent.trim()) nodes.push(node);
      }
      for(let i = 0; i < nodes.length; i += CONFIG.BATCH_SIZE) {
        const batch = nodes.slice(i, i + CONFIG.BATCH_SIZE);
        requestAnimationFrame(() => this.processBatch(batch));
      }
    },

    processBatch(nodes) {
      nodes.forEach(node => {
        let nodeCache = State.nodeCacheStore.get(node);
        if(!nodeCache) {
          nodeCache = new Map();
          State.nodeCacheStore.set(node, nodeCache);
        }
        const cacheKey = `${node.textContent}-${State.cache.currentScript}`;
        if(nodeCache.has(cacheKey)) {
          node.textContent = nodeCache.get(cacheKey);
          this.updateElementDirection(node.parentElement);
          return;
        }
        const newText = TextConverter.convertText(node.textContent, State.cache.rumiJawi);
        if(newText !== node.textContent) {
          nodeCache.set(cacheKey, newText);
          node.textContent = newText;
          this.updateElementDirection(node.parentElement);
        }
      });
    },

    updateElementDirection(element) {
      while(element && !element.classList.contains('mw-content-text')) {
        if(
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
      if(!this.observer) this.initObserver();
      if(isJawi) {
        State.cache.content = State.cache.content || State.elements.content.innerHTML;
        State.cache.title = State.cache.title || State.elements.title.textContent;
        State.elements.content.setAttribute('dir', 'rtl');
        State.elements.content.setAttribute('lang', 'ms-arab');
        State.elements.title.setAttribute('dir', 'rtl');
        State.elements.title.setAttribute('lang', 'ms-arab');
        this.observer.observe(State.elements.content);
        if(State.elements.title) {
          State.elements.title.textContent = TextConverter.convertText(
            State.elements.title.textContent,
            State.cache.rumiJawi
          );
        }
      } else {
        if(State.cache.content) {
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
        if(State.cache.title) {
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
      if(!element) return null;
      if(!this.store.has(element)) {
        this.store.set(element, element);
      }
      return this.store.get(element);
    }
  };

  const UIManager = {
    elementCache: new WeakMap(),

    // Common functionality
    async saveUserLanguagePreference(language) {
      try {
        await new mw.Api().saveOption("language", language);
        console.log(`Language preference set to ${language}`);
      } catch (error) {
        console.error("Failed to save language preference:", error);
      }
    },

    getConvertibleElements() {
      if(!this.elementCache.has(document)) {
        const elements = document.querySelectorAll('.convertible-text');
        this.elementCache.set(document, elements);
      }
      return this.elementCache.get(document);
    },

    // Setup primary UI based on skin
    init() {
      const currentSkin = mw.config.get('skin');

      if(currentSkin === 'vector-2022') {
        this.setupDesktopUI();
        console.log('Vector-2022 skin detected, setting up desktop UI');
      } else if(currentSkin === 'minerva') {
        this.setupMobileUI();
        console.log('Minerva skin detected, setting up mobile UI');
      } else {
        console.log(`Unsupported skin: ${currentSkin}, no UI will be shown`);
        // Don't show any UI for unsupported skins
      }
    },

    // Desktop UI (Vector-2022)
    setupDesktopUI() {
      this.setupDesktopStyles();
      this.setupDesktopRadioButtons();
    },

    setupDesktopStyles() {
      const existingStyles = document.getElementById('rumi-jawi-styles');
      if(existingStyles) existingStyles.remove();
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

    setupDesktopRadioButtons() {
      try {
        // Specifically target Vector's navigation menu
        const interactionMenu = document.querySelector('#vector-pinned-container ul, #p-navigation ul');
        if(!interactionMenu) {
          console.log('Vector navigation container not found');
          return;
        }

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
              ${this.createDesktopRadioButton('rumi-jawi', 'rumi', 'Rumi')}
            </div>
            <div class="cdx-radio__content">
              ${this.createDesktopRadioButton('rumi-jawi', 'jawi', 'Jawi')}
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
              ${this.createDesktopRadioButton('ui-language', 'rumi-ui', 'ms-latn')}
            </div>
            <div class="cdx-radio__content">
              ${this.createDesktopRadioButton('ui-language', 'jawi-ui', 'ms-arab')}
            </div>
          </div>
        </div>
      `;

        interactionMenu.appendChild(scriptConverterLi);
        interactionMenu.appendChild(uiLanguageLi);
        this.setupDesktopEventHandlers();
        this.setInitialUILanguage();
      } catch (error) {
        console.error('Desktop radio button setup error:', error);
      }
    },

    createDesktopRadioButton(name, value, label) {
      const isChecked = (name === 'rumi-jawi' && value === State.cache.currentScript) ||
        (name === 'ui-language' &&
          ((value === 'jawi-ui' && mw.config.get('wgUserLanguage') === 'ms-arab') ||
            (value === 'rumi-ui' && mw.config.get('wgUserLanguage') !== 'ms-arab')));
      const isLanguageCode = label === 'ms-arab' || label === 'ms-latn';
      const labelContent = isLanguageCode ?
        `<span class="cdx-radio__label-content">${label}</span>` :
        `<span class="cdx-radio__label-content convertible-text" data-rumi="${label}">${label}</span>`;
      return `
      <label class="cdx-radio__label">
        <input type="radio" class="cdx-radio__input" name="${name}" value="${value}" ${isChecked ? 'checked' : ''} aria-checked="${isChecked}">
        <span class="cdx-radio__icon" aria-hidden="true"></span>
        ${labelContent}
      </label>
    `;
    },

    setupDesktopEventHandlers() {
      const rumiJawiRadios = document.querySelectorAll('.cdx-radio__input[name="rumi-jawi"]');
      rumiJawiRadios.forEach(radio => {
        radio.addEventListener('change', async function() {
          const isJawi = this.value === 'jawi';
          State.cache.currentScript = isJawi ? 'jawi' : 'rumi';
          document.querySelectorAll('.cdx-radio__input[name="rumi-jawi"]').forEach(input => {
            input.setAttribute('aria-checked', input.checked.toString());
          });
          try {
            if(!State.isInitialized) await initRumiJawi();
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
            if(prevRadio) {
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

    // Mobile UI (Minerva)
    setupMobileUI() {
      this.setupMobileStyles();
      this.setupMobileRadioButtons();
    },

    setupMobileStyles() {
      const codexStyles = `
      #ca-nstab-rkj,
      #ca-ui-language {
        font-family: sans-serif;
        font-weight: normal;
        padding: 0 !important;
        margin: 0 !important;
        border: none !important;
        background: none !important;
        display: block !important;
      }
      .skin-minerva-latest #ca-nstab-rkj,
      .skin-minerva-latest #ca-ui-language {
        margin: 8px 0 !important;
        padding: 0 16px !important;
        width: 100% !important;
        box-sizing: border-box;
      }
      .skin-minerva-latest .cdx-field {
        background-color: #fff;
        border-radius: 2px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      }
      .skin-minerva-latest .cdx-label--title {
        border-bottom: 1px solid #eaecf0;
      }
      .skin-minerva-latest .cdx-radio__content {
        border-bottom: 1px solid #eaecf0;
      }
      .skin-minerva-latest .cdx-radio__content:last-child {
        border-bottom: none;
      }
      .cdx-field {
        padding: 0;
        margin: 0;
      }
      .cdx-label--title {
        font-weight: bold;
        display: block;
        margin-bottom: 0;
        padding: 8px 16px 4px;
        color: var(--color-base, #54595d);
      }
      .cdx-radio--inline {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
      }
      .cdx-radio__content {
        display: flex;
        align-items: center;
        margin: 0;
        width: 100%;
        padding: 8px 16px;
      }
      .cdx-radio__label {
        display: flex;
        align-items: center;
        gap: 12px;
        font-weight: normal;
        cursor: pointer;
        width: 100%;
      }
      .cdx-radio__label-content {
        color: var(--color-base, #202122);
        font-size: 14px;
      }
      .cdx-radio__icon {
        width: 20px;
        height: 20px;
        border: 2px solid var(--color-notice, #72777d);
        border-radius: 50%;
        position: relative;
        flex-shrink: 0;
      }
      .cdx-radio__input {
        position: absolute;
        opacity: 0;
        cursor: pointer;
      }
      .cdx-radio__input:checked + .cdx-radio__icon {
        border-color: var(--color-progressive, #36c);
      }
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
      .cdx-radio__input:checked ~ .cdx-radio__label-content {
        color: var(--color-progressive, #36c);
        font-weight: 500;
      }
      .cdx-radio__label:hover .cdx-radio__icon {
        border-color: var(--color-progressive, #36c);
      }
    `;
      const existingStyles = document.getElementById('rumi-jawi-styles');
      if(existingStyles) existingStyles.remove();
      const styleElement = document.createElement('style');
      styleElement.id = 'rumi-jawi-styles';
      styleElement.textContent = codexStyles;
      document.head.appendChild(styleElement);
    },

    createMobileConverterControls() {
      const li = document.createElement('li');
      li.id = 'ca-nstab-rkj';
      li.innerHTML = `
      <div class="cdx-field">
        <label class="cdx-label cdx-label--title">
          <span class="cdx-label__text convertible-text" data-rumi="Penukar tulisan">Penukar tulisan</span>
        </label>
        <div class="cdx-radio cdx-radio--inline" role="radiogroup" aria-label="Script Selection">
          <div class="cdx-radio__content">
            <label class="cdx-radio__label">
              <input type="radio" class="cdx-radio__input" name="rumi-jawi" value="rumi" ${State.cache.currentScript === 'rumi' ? 'checked' : ''}>
              <span class="cdx-radio__icon"></span>
              <span class="cdx-radio__label-content convertible-text" data-rumi="Rumi">Rumi</span>
            </label>
          </div>
          <div class="cdx-radio__content">
            <label class="cdx-radio__label">
              <input type="radio" class="cdx-radio__input" name="rumi-jawi" value="jawi" ${State.cache.currentScript === 'jawi' ? 'checked' : ''}>
              <span class="cdx-radio__icon"></span>
              <span class="cdx-radio__label-content convertible-text" data-rumi="Jawi">Jawi</span>
            </label>
          </div>
        </div>
      </div>
    `;
      return li;
    },

    createMobileLanguageControls() {
      const li = document.createElement('li');
      li.id = 'ca-ui-language';
      li.innerHTML = `
      <div class="cdx-field">
        <label class="cdx-label cdx-label--title">
          <span class="cdx-label__text convertible-text" data-rumi="Penukar antara muka">Penukar antara muka</span>
        </label>
        <div class="cdx-radio cdx-radio--inline" role="radiogroup" aria-label="UI Language Selection">
          <div class="cdx-radio__content">
            <label class="cdx-radio__label">
              <input type="radio" class="cdx-radio__input" name="ui-language" value="rumi-ui">
              <span class="cdx-radio__icon"></span>
              <span class="cdx-radio__label-content" data-rumi="ms-latn">ms-latn</span>
            </label>
          </div>
          <div class="cdx-radio__content">
            <label class="cdx-radio__label">
              <input type="radio" class="cdx-radio__input" name="ui-language" value="jawi-ui">
              <span class="cdx-radio__icon"></span>
              <span class="cdx-radio__label-content" data-rumi="ms-arab">ms-arab</span>
            </label>
          </div>
        </div>
      </div>
    `;
      return li;
    },

    handleMobileScriptChange(isJawi) {
      State.cache.currentScript = isJawi ? 'jawi' : 'rumi';
      document.querySelectorAll('.cdx-radio__input[name="rumi-jawi"]').forEach(input => {
        input.setAttribute('aria-checked', input.checked.toString());
      });
      const initPromise = State.isInitialized ? Promise.resolve() : initRumiJawi();
      initPromise
        .then(() => DataFetcher.fetchRumiJawiData())
        .then(maps => {
          this.updateUIText(isJawi, maps);
          DOMHandler.applyConversion(isJawi);
        })
        .catch(error => {
          console.error('Conversion error:', error);
          const previousState = isJawi ? 'rumi' : 'jawi';
          State.cache.currentScript = previousState;
          const radioInput = document.querySelector(`input[value="${previousState}"]`);
          if(radioInput) {
            radioInput.checked = true;
            radioInput.dispatchEvent(new Event('change', {
              bubbles: true
            }));
          }
        });
    },

    updateUIText(isJawi, maps) {
      const convertibleElements = this.getConvertibleElements();
      Array.from(convertibleElements).forEach(element => {
        const rumiText = element.getAttribute('data-rumi');
        element.textContent = isJawi ? TextConverter.convertText(rumiText, maps) : rumiText;
      });
    },

    handleMobileUILanguageChange(language) {
      this.saveUserLanguagePreference(language)
        .then(() => window.location.reload())
        .catch(error => console.error("Failed to save language preference:", error));
    },

    setInitialUILanguage() {
      const currentLanguage = mw.config.get('wgUserLanguage');
      const value = currentLanguage === 'ms-arab' ? 'jawi-ui' : 'rumi-ui';
      const radio = document.querySelector(`input[name="ui-language"][value="${value}"]`);
      if(radio) radio.checked = true;
    },

    setupMobileRadioButtons() {
      try {
        // Specifically target Minerva's menu
        const menuTarget = document.querySelector('.menu');
        if(!menuTarget) {
          console.error('Mobile navigation menu not found');
          return;
        }

        // Remove existing controls if any
        const existingControls = document.querySelectorAll('#ca-nstab-rkj, #ca-ui-language');
        existingControls.forEach(control => control.remove());

        const converterControls = this.createMobileConverterControls();
        const languageControls = this.createMobileLanguageControls();

        // Create a container if needed
        let container = document.querySelector('.menu .converter-container');
        if(!container) {
          container = document.createElement('div');
          container.className = 'converter-container';
          menuTarget.appendChild(container);
        }

        container.appendChild(converterControls);
        container.appendChild(languageControls);

        // Event handlers for script selection
        document.querySelectorAll('.cdx-radio__input[name="rumi-jawi"]').forEach(radio => {
          radio.addEventListener('change', e => this.handleMobileScriptChange(e.target.value === 'jawi'));
        });

        // Event handlers for UI language selection
        document.querySelectorAll('.cdx-radio__input[name="ui-language"]').forEach(radio => {
          radio.addEventListener('change', e => this.handleMobileUILanguageChange(e.target.value === 'jawi-ui' ? 'ms-arab' : 'ms'));
        });

        this.setInitialUILanguage();
      } catch (error) {
        console.error('Mobile radio button setup error:', error);
      }
    }
  };

  // Initialize the UIManager when the document is ready
  mw.hook('wikipage.content').add(function() {
    UIManager.init();
  });

  // Helper function to check if we're in any editor view
  function isInEditorMode() {
    return mw.config.get('wgAction') === 'edit' ||
      mw.config.get('wgAction') === 'submit' ||
      document.querySelector('.ve-active') !== null ||
      document.querySelector('.wikiEditor-ui') !== null ||
      mw.config.get('wgVisualEditor')?.isActive === true;
  }

  function onDocumentReady(fn) {
    if(document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(fn, 1);
    } else {
      document.addEventListener('DOMContentLoaded', fn);
    }
  }

  onDocumentReady(() => {
    // Check again if we're in edit mode (in case the page state changed after initial load)
    if(isInEditorMode()) {
      console.log('Edit mode or Visual Editor detected - Rumi-Jawi converter disabled');
      return;
    }

    State.elements.content = document.querySelector('#mw-content-text');
    State.elements.title = document.querySelector('.mw-first-heading');
    if(!State.elements.content || !State.elements.title) {
      console.error('Content elements not found');
      return;
    }

    // Initialize based on the current skin
    if(mw.config.get('skin') === 'vector-2022' || mw.config.get('skin') === 'minerva') {
      // Only initialize on supported skins
      window.initRumiJawi = async () => {
        if(State.isInitialized) return;
        if(!window.mw?.config) throw new Error('MediaWiki configuration is not available');
        State.isInitialized = true;
        console.log('Rumi-Jawi converter initialized successfully');
      };
      window.initRumiJawi().catch(error => console.error('Initialization failed:', error));
    } else {
      console.log('Unsupported skin - Rumi-Jawi converter not initialized');
    }
  });
})();
