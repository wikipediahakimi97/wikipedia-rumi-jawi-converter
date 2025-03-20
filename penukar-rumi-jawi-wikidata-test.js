(() => {
  // Skip if not in valid context (editing mode or unsupported namespace)
  if (mw.config.get('wgNamespaceNumber') === undefined) return;
  if (mw.config.get('wgAction') === 'edit' || mw.config.get('wgAction') === 'submit' ||
      document.querySelector('.ve-active, .wikiEditor-ui') !== null ||
      mw.config.get('wgVisualEditor')?.isActive === true) {
    console.log('Edit mode detected - Rumi-Jawi converter disabled');
    return;
  }

  // Configuration
  const CONFIG = {
    CACHE_KEY: 'rumiJawiData',
    CACHE_DURATION: 24 * 60 * 60 * 1000, // 24 hours
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
  };

  // Simple state
  let currentScript = 'rumi';
  let contentElement = null;
  let titleElement = null;
  let originalContent = null;
  let originalTitle = null;
  let dictionary = null;
  let lastFetchTime = 0;
  
  // Fetch dictionary data
  async function fetchDictionary() {
    // Try to load from localStorage first
    try {
      const cached = localStorage.getItem(CONFIG.CACHE_KEY);
      if (cached) {
        const { timestamp, data } = JSON.parse(cached);
        if (Date.now() - timestamp < CONFIG.CACHE_DURATION) {
          console.log('Using cached dictionary data');
          return data;
        }
      }
    } catch (e) {
      console.warn('Error accessing localStorage:', e);
    }

    // Fetch fresh data
    console.log('Fetching dictionary data from Wikidata...');
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      const response = await fetch(
        `${CONFIG.SPARQL_ENDPOINT}?query=${encodeURIComponent(CONFIG.QUERY)}&format=json`,
        {
          headers: {
            Accept: 'application/sparql-results+json',
            'User-Agent': 'RumiJawiConverter/1.0'
          },
          signal: controller.signal
        }
      );
      
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const result = await response.json();
      const processedData = processDictionaryData(result);
      
      // Cache in localStorage
      try {
        localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({
          timestamp: Date.now(),
          data: processedData
        }));
      } catch (e) {
        console.warn('Error storing in localStorage:', e);
      }
      
      return processedData;
    } catch (error) {
      console.error('Error fetching Rumi-Jawi data:', error);
      return { words: {}, phrases: {} };
    }
  }
  
  // Process the raw data from Wikidata
  function processDictionaryData(data) {
    const words = {};
    const phrases = {};
    
    data.results.bindings.forEach(({ latn, arab }) => {
      const rumi = latn.value.toLowerCase();
      const jawi = arab.value;
      
      if (rumi.includes(' ')) {
        phrases[rumi] = jawi;
      } else {
        words[rumi] = jawi;
      }
    });
    
    return { words, phrases };
  }
  
  // Convert text from Rumi to Jawi
  function convertText(text, dict) {
    if (!text?.trim() || !dict) return text;
    
    // Store numbers to restore later
    const numbers = [];
    
    // Process text
    let result = text
      // Preserve numbers
      .replace(/\d+(?:[,.]\d+)*(?:\.\d+)?%?/g, match => {
        const placeholder = `__NUM${numbers.push(`\u2066${match}\u2069`) - 1}__`;
        return placeholder;
      });
    
    // Replace phrases (multi-word expressions) - sort by length to handle longer phrases first
    const sortedPhrases = Object.keys(dict.phrases).sort((a, b) => b.length - a.length);
    if (sortedPhrases.length > 0) {
      const phraseRegex = new RegExp(
        sortedPhrases.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
        'gi'
      );
      result = result.replace(phraseRegex, match => 
        dict.phrases[match.toLowerCase()] || match
      );
    }
    
    // Handle words with apostrophes
    result = result.replace(/\b'\w+\b|\b\w+'\w*\b|\b\w+'\b/g, match => 
      dict.words[match.toLowerCase()] || match
    );
    
    // Handle hyphenated words
    result = result.replace(/\b\w+(?:-\w+)+\b/g, match => {
      const fullMatch = dict.words[match.toLowerCase()];
      if (fullMatch) return fullMatch;
      return match.split('-')
        .map(part => dict.words[part.toLowerCase()] || part)
        .join('-');
    });
    
    // Handle single words
    result = result.replace(/\b\w+\b/g, match => 
      dict.words[match.toLowerCase()] || match
    );
    
    // Handle special cases for 'ک' and 'د'
    result = result.replace(/(^|[\s\u00A0]+)[کد][\s\u00A0]+(\S)/g, (_, p1, p2) => 
      `${p1}${_[p1.length]}${p2 === 'ا' ? 'أ' : p2}`
    );
    
    // Replace punctuation
    result = result.replace(/[,;?]/g, match => 
      CONFIG.PUNCTUATION_MAP[match] || match
    );
    
    // Restore numbers
    numbers.forEach((number, index) => {
      result = result.replace(`__NUM${index}__`, number);
    });
    
    return result;
  }
  
  // Apply RTL direction to elements
  function setRTLDirection(element, isRTL) {
    if (!element) return;
    
    if (isRTL) {
      element.setAttribute('dir', 'rtl');
      element.setAttribute('lang', 'ms-arab');
    } else {
      element.setAttribute('dir', 'ltr');
      element.setAttribute('lang', 'ms');
    }
  }
  
  // Convert page content
  async function convertPage(toJawi) {
    if (!dictionary) {
      dictionary = await fetchDictionary();
    }
    
    if (toJawi) {
      // Store original content if not already saved
      if (!originalContent) {
        originalContent = contentElement.innerHTML;
        originalTitle = titleElement.textContent;
      }
      
      // Set RTL direction
      setRTLDirection(contentElement, true);
      setRTLDirection(titleElement, true);
      
      // Convert title
      titleElement.textContent = convertText(titleElement.textContent, dictionary);
      
      // Convert content (using a more efficient approach than full DOM traversal)
      // We're using a simpler approach here that processes text in visible elements
      const textNodes = [];
      const walker = document.createTreeWalker(
        contentElement,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: node => {
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            
            // Skip elements that should not be converted
            if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE' ||
                parent.classList.contains('no-convert') ||
                parent.closest('#p-navigation, .mw-portlet, .vector-menu, .mw-header')) {
              return NodeFilter.FILTER_REJECT;
            }
            
            if (node.textContent.trim()) {
              return NodeFilter.FILTER_ACCEPT;
            }
            
            return NodeFilter.FILTER_REJECT;
          }
        }
      );
      
      let node;
      while ((node = walker.nextNode())) {
        textNodes.push(node);
      }
      
      // Process in chunks to avoid UI blocking
      const chunkSize = 50;
      for (let i = 0; i < textNodes.length; i += chunkSize) {
        setTimeout(() => {
          const chunk = textNodes.slice(i, i + chunkSize);
          chunk.forEach(textNode => {
            if (textNode.textContent.trim()) {
              textNode.textContent = convertText(textNode.textContent, dictionary);
              
              // Set RTL on parent elements
              let parent = textNode.parentElement;
              while (parent && !parent.classList.contains('mw-content-text')) {
                if (parent.nodeType === 1 && !parent.classList.contains('no-convert') && 
                    parent.closest('#mw-content-text')) {
                  setRTLDirection(parent, true);
                }
                parent = parent.parentElement;
              }
            }
          });
        }, 0);
      }
      
    } else {
      // Restore original content
      if (originalContent) {
        contentElement.innerHTML = originalContent;
        titleElement.textContent = originalTitle;
        
        setRTLDirection(contentElement, false);
        setRTLDirection(titleElement, false);
        
        // Reset direction on all elements
        const rtlElements = contentElement.querySelectorAll('[dir="rtl"]');
        rtlElements.forEach(el => {
          el.removeAttribute('dir');
          el.removeAttribute('lang');
        });
        
        originalContent = null;
        originalTitle = null;
      }
    }
  }
  
  // Set user language preference
  async function setUserLanguage(language) {
    try {
      await new mw.Api().saveOption("language", language);
      console.log(`Language preference set to ${language}`);
    } catch (error) {
      console.error("Failed to save language preference:", error);
    }
  }
  
  // Create and inject CSS styles
  function setupStyles() {
    const existingStyles = document.getElementById('rumi-jawi-styles');
    if (existingStyles) existingStyles.remove();

    const isMobile = mw.config.get('skin') === 'minerva';

    const css = `
	    /* Base styles for converter container */
	    #ca-nstab-rkj, #ca-ui-language {
	      font-family: inherit;
	      font-weight: normal;
	      display: block;
	      margin: ${isMobile ? '8px 0' : '0'};
	    }
	    
	    /* Label title */
	    .cdx-label--title {
	      font-weight: bold;
	      display: block;
	      margin: ${isMobile ? '0' : '4px 0'};
	      padding: ${isMobile ? '8px 16px 4px' : '0'};
	      color: var(--color-base, #54595d);
	    }
	    
	    /* Radio button group */
	    .cdx-radio--inline {
	      display: flex;
	      flex-direction: ${isMobile ? 'column' : 'row'};
	      align-items: ${isMobile ? 'flex-start' : 'center'};
	      ${!isMobile ? 'gap: 8px;' : ''}
	    }
	    
	    /* Radio button container */
	    .cdx-radio__content {
	      display: flex;
	      align-items: center;
	      margin: 0;
	      ${isMobile ? `
	        width: 100%;
	        padding: 8px 16px;
	      ` : ''}
	    }
	    
	    /* Radio button label */
	    .cdx-radio__label {
	      display: flex;
	      align-items: center;
	      cursor: pointer;
	      gap: ${isMobile ? '12px' : '4px'};
	      ${isMobile ? 'width: 100%;' : ''}
	    }
	    
	    /* Radio input */
	    .cdx-radio__input {
	      ${isMobile ? `
	        position: absolute;
	        opacity: 0;
	      ` : 'margin: 0;'}
	    }
	    
	    /* Radio icon */
	    .cdx-radio__icon {
	      width: ${isMobile ? '20px' : '14px'};
	      height: ${isMobile ? '20px' : '14px'};
	      ${isMobile ? `
	        border: 2px solid var(--color-notice, #72777d);
	        border-radius: 50%;
	        position: relative;
	        flex-shrink: 0;
	      ` : ''}
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
	    ` : ''}
	    
	    /* Label content checked state */
	    .cdx-radio__input:checked ~ .cdx-radio__label-content {
	      color: var(--color-progressive, #36c);
	      font-weight: ${isMobile ? '500' : 'bold'};
	    }
	    
	    /* Skin-specific adjustments for Minerva */
	    ${isMobile ? `
	      .skin-minerva-latest #ca-nstab-rkj,
	      .skin-minerva-latest #ca-ui-language {
	        padding: 0 16px !important;
	        width: 100%;
	      }
	    ` : ''}
	  `;

    const styleElement = document.createElement('style');
    styleElement.id = 'rumi-jawi-styles';
    styleElement.textContent = css;
    document.head.appendChild(styleElement);
  }
  
  // Create controls HTML
  function createControlsHTML(name, title, options) {
    let html = `<div class="cdx-field"><label class="cdx-label cdx-label--title">
      <span class="cdx-label__text convertible-text" data-rumi="${title}">${title}</span>
      </label><div class="cdx-radio--inline" role="radiogroup" aria-label="${title}">`;

    options.forEach(option => {
      const labelContent = option.isCode ?
        `<span class="cdx-radio__label-content">${option.label}</span>` :
        `<span class="cdx-radio__label-content convertible-text" data-rumi="${option.label}">${option.label}</span>`;

      html += `<div class="cdx-radio__content"><label class="cdx-radio__label">
        <input type="radio" class="cdx-radio__input" name="${name}" value="${option.value}" 
          ${option.checked ? 'checked' : ''} aria-checked="${option.checked}">
        <span class="cdx-radio__icon"></span>${labelContent}
        </label></div>`;
    });

    html += `</div></div>`;
    return html;
  }
  
  // Setup UI controls
  function setupControls() {
    const skin = mw.config.get('skin');
    const supportedSkins = ['vector-2022', 'vector', 'monobook', 'timeless', 'minerva'];
    
    if (!supportedSkins.includes(skin)) {
      console.log(`Unsupported skin: ${skin}, no UI will be shown`);
      return;
    }
    
    const isMobile = skin === 'minerva';
    const container = isMobile ?
      document.querySelector('.menu') :
      document.querySelector('#vector-pinned-container ul, #p-navigation ul');
      
    if (!container) {
      console.error(`Navigation container not found for ${skin} skin`);
      return;
    }
    
    // Remove existing controls
    document.querySelectorAll('#ca-nstab-rkj, #ca-ui-language').forEach(el => el.remove());
    
    // Create script converter control
    const scriptLi = document.createElement('li');
    scriptLi.id = 'ca-nstab-rkj';
    scriptLi.innerHTML = createControlsHTML('rumi-jawi', 'Penukar tulisan', [
      { value: 'rumi', label: 'Rumi', checked: currentScript === 'rumi' },
      { value: 'jawi', label: 'Jawi', checked: currentScript === 'jawi' }
    ]);
    
    // Create UI language control
    const currentLanguage = mw.config.get('wgUserLanguage');
    const langLi = document.createElement('li');
    langLi.id = 'ca-ui-language';
    langLi.innerHTML = createControlsHTML('ui-language', 'Penukar antara muka', [
      { value: 'rumi-ui', label: 'ms-latn', checked: currentLanguage !== 'ms-arab', isCode: true },
      { value: 'jawi-ui', label: 'ms-arab', checked: currentLanguage === 'ms-arab', isCode: true }
    ]);
    
    // Add to container
    if (isMobile) {
      let menuContainer = container.querySelector('.converter-container');
      if (!menuContainer) {
        menuContainer = document.createElement('div');
        menuContainer.className = 'converter-container';
        container.appendChild(menuContainer);
      }
      menuContainer.appendChild(scriptLi);
      menuContainer.appendChild(langLi);
    } else {
      container.appendChild(scriptLi);
      container.appendChild(langLi);
    }
    
    // Setup event handlers
    setupEventHandlers();
  }
  
  // Setup event handlers
  function setupEventHandlers() {
    // Script change handler
    document.querySelectorAll('.cdx-radio__input[name="rumi-jawi"]').forEach(radio => {
      radio.addEventListener('change', async function() {
        const isJawi = this.value === 'jawi';
        currentScript = isJawi ? 'jawi' : 'rumi';
        
        document.querySelectorAll('.cdx-radio__input[name="rumi-jawi"]').forEach(input => {
          input.setAttribute('aria-checked', input.checked.toString());
        });
        
        try {
          // Get dictionary data if needed
          if (!dictionary) {
            dictionary = await fetchDictionary();
          }
          
          // Update convertible text elements in UI
          document.querySelectorAll('.convertible-text').forEach(element => {
            const rumiText = element.getAttribute('data-rumi');
            element.textContent = isJawi ? convertText(rumiText, dictionary) : rumiText;
          });
          
          // Convert page content
          await convertPage(isJawi);
        } catch (error) {
          console.error('Conversion error:', error);
          
          // Revert to previous state
          const previousState = isJawi ? 'rumi' : 'jawi';
          currentScript = previousState;
          
          const prevRadio = document.querySelector(`input[value="${previousState}"]`);
          if (prevRadio) {
            prevRadio.checked = true;
            prevRadio.setAttribute('aria-checked', 'true');
          }
        }
      });
    });
    
    // UI language change handler
    document.querySelectorAll('.cdx-radio__input[name="ui-language"]').forEach(radio => {
      radio.addEventListener('change', async function() {
        const language = this.value === 'jawi-ui' ? 'ms-arab' : 'ms';
        await setUserLanguage(language);
        window.location.reload();
      });
    });
  }
  
  // Initialize converter
  function initialize() {
    // Find main elements
    contentElement = document.querySelector('#mw-content-text');
    titleElement = document.querySelector('.mw-first-heading');
    
    if (!contentElement || !titleElement) {
      console.error('Content elements not found');
      return;
    }
    
    // Setup UI
    setupStyles();
    setupControls();
    
    console.log('Rumi-Jawi converter initialized successfully');
  }
  
  // Initialize when page content is ready
  mw.hook('wikipage.content').add(initialize);
  
  // Initialize on document ready
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(initialize, 1);
  } else {
    document.addEventListener('DOMContentLoaded', initialize);
  }
})();
