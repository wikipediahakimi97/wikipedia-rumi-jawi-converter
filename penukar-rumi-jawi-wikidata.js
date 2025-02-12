/**
 ** LOG:
 ** Updated on 11th Februari 2025
 **
 **/

/* Convert the text from rumi to jawi script */

/* Original author: [[Pengguna:Hakimi97]] */

/* Licensed under the terms of the GNU General Public License version 3.0
* as published by the Free Software Foundation; See the
* GNU General Public License for more details.
* A copy of the GPL is available at https://www.gnu.org/licenses/gpl-3.0.txt 
*/

if ([0, 1, 3, 4, 5, 12, 13, 14, 15].includes(mw.config.get('wgNamespaceNumber'))) {
  const CACHE = {
    content: null,
    title: null,
    processedText: new Map(),
    rumiJawi: null,
    lastFetch: 0,
    currentScript: 'rumi'
  };
  
  const CONFIG = {
    CACHE_DURATION: 24 * 60 * 60 * 1000,
    BATCH_SIZE: 100,
    MAX_REGEX_CACHE: 1000
  };

  let isInitialized = false;
  let fetchPromise = null;
  let $contentElement = null;
  let $titleElement = null;

  // Regex cache with memory management
  const REGEX_CACHE = new Map();
  const getRegex = (word) => {
    if (!REGEX_CACHE.has(word)) {
      if (REGEX_CACHE.size >= CONFIG.MAX_REGEX_CACHE) {
        const entries = Array.from(REGEX_CACHE.keys());
        for (let i = 0; i < entries.length / 2; i++) {
          REGEX_CACHE.delete(entries[i]);
        }
      }
      const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      REGEX_CACHE.set(word, new RegExp(`\\b${escapedWord}\\b`, 'gi'));
    }
    return REGEX_CACHE.get(word);
  };

  // Enhanced data processing
  const processFetchedData = (data) => {
    const maps = {
      phrasesMap: new Map(),
      pluralsMap: new Map(),
      othersMap: new Map()
    };

    data.results.bindings.forEach(({ latn, arab, feature }) => {
      const rumi = latn.value.toLowerCase();
      const jawi = arab.value;
      
      const rumiVariants = new Set([
        rumi,
        rumi.normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
        rumi.charAt(0).toUpperCase() + rumi.slice(1)
      ]);

      rumiVariants.forEach(variant => {
        if (feature?.value === 'http://www.wikidata.org/entity/Q187931') {
          maps.phrasesMap.set(variant, jawi);
        } else if (feature?.value === 'http://www.wikidata.org/entity/Q146786') {
          maps.pluralsMap.set(variant, jawi);
        } else {
          maps.othersMap.set(variant, jawi);
        }
      });
    });

    return maps;
  };

  // Improved text conversion
	const convertText = (text, maps) => {
	  if (!text) return text;
	  
	  const { phrasesMap, pluralsMap, othersMap } = maps;
	  
	  // 1. Convert phrases
	  const convertPhrases = (text) => {
	    const segments = text.split(/(\s+)/);
	    const processedSegments = [];
	    let unmatchedBuffer = [];
	    
	    const tryConvertPhrase = (segments) => {
	      const phrase = segments.join('').toLowerCase().trim();
	      return phrasesMap.get(phrase) || null;
	    };
	
	    const processBuffer = () => {
	      if (unmatchedBuffer.length > 0) {
	        unmatchedBuffer.forEach(segment => {
	          processedSegments.push(segment);
	        });
	        unmatchedBuffer = [];
	      }
	    };
	
	    segments.forEach((segment, index) => {
	      if (!segment || /^\s+$/.test(segment)) {
	        processBuffer();
	        processedSegments.push(segment);
	        return;
	      }
	
	      unmatchedBuffer.push(segment);
	      
	      for (let len = Math.min(unmatchedBuffer.length, 5); len > 0; len--) {
	        const phraseSegments = unmatchedBuffer.slice(-len);
	        const converted = tryConvertPhrase(phraseSegments);
	        
	        if (converted) {
	          unmatchedBuffer.splice(-len);
	          processBuffer();
	          processedSegments.push(converted);
	          return;
	        }
	      }
	
	      if (unmatchedBuffer.length >= 5 || index === segments.length - 1) {
	        processBuffer();
	      }
	    });
	
	    processBuffer();
	    return processedSegments.join('');
	  };
	
	  // 2. Convert plurals
	  const convertPlurals = (text) => {
	    const segments = text.split(/(\s+)/);
	    return segments.map(segment => {
	      if (!segment || /^\s+$/.test(segment)) {
	        return segment;
	      }
	      const lower = segment.toLowerCase().trim();
	      return pluralsMap.get(lower) || segment;
	    }).join('');
	  };
	
	  // 3. Convert remaining single words
	  const convertRemainingWords = (text) => {
	    const segments = text.split(/(\s+|[.,!?;:()"'\[\]{}<>\/\\|@#$%^&*_+=~`])/);
	    return segments.map(segment => {
	      if (!segment || /^\s+$/.test(segment) || /^[.,!?;:()"'\[\]{}<>\/\\|@#$%^&*_+=~`]$/.test(segment)) {
	        return segment;
	      }
	      const lower = segment.toLowerCase().trim();
	      return othersMap.get(lower) || segment;
	    }).join('');
	  };
	
	  // 4. Handle punctuation patterns - now runs last
	  const handlePunctuationPatterns = (text) => {
	    const punctuationPattern = /([.,!?;:()"'\[\]{}<>\/\\|@#$%^&*_+=~`\-])/;
	    const segments = text.split(/([\s\S])/);  // Split into individual characters
	    const processedSegments = [];
	    
	    let i = 0;
	    while (i < segments.length) {
	      const current = segments[i];
	      
	      // Skip empty segments
	      if (!current) {
	        i++;
	        continue;
	      }
	
	      // Check for punctuation-word-punctuation pattern
	      if (i > 0 && i < segments.length - 2) {
	        const prev = segments[i - 1];
	        const next = segments[i + 1];
	        
	        if (punctuationPattern.test(prev) && punctuationPattern.test(next)) {
	          // Found a pattern - collect the word (which should already be converted)
	          let word = current;
	          let j = i + 2;
	          while (j < segments.length && !punctuationPattern.test(segments[j]) && !/\s/.test(segments[j])) {
	            word += segments[j];
	            j++;
	          }
	          
	          processedSegments.push(word);  // Word should already be converted
	          i = j;
	          continue;
	        }
	      }
	      
	      // No pattern match, keep the segment as is
	      processedSegments.push(current);
	      i++;
	    }
	    
	    return processedSegments.join('');
	  };
	
	  // Apply conversions in the revised order
	  let result = text;
	  result = convertPhrases(result);
	  result = convertPlurals(result);
	  result = convertRemainingWords(result);
	  result = handlePunctuationPatterns(result);
	  
	  return result;
	};

	// Modified processTextNodes function
	const processTextNodes = (element, maps, callback) => {
	  const nodes = [];
	  const walker = document.createTreeWalker(
	    element,
	    NodeFilter.SHOW_TEXT,
	    {
	      acceptNode: (node) => {
	        const parent = node.parentElement;
	        if (parent && (
	          parent.tagName === 'SCRIPT' ||
	          parent.tagName === 'STYLE' ||
	          parent.classList.contains('no-convert') ||
	          // Don't process UI elements
	          parent.closest('#p-navigation') ||
	          parent.closest('.mw-portlet') ||
	          parent.closest('.vector-menu') ||
	          parent.closest('.mw-header')
	        )) {
	          return NodeFilter.FILTER_REJECT;
	        }
	        return NodeFilter.FILTER_ACCEPT;
	      }
	    },
	    false
	  );
	
	  let node;
	  while (node = walker.nextNode()) {
	    if (node.textContent.trim()) {
	      nodes.push(node);
	    }
	  }
	
	  for (let i = 0; i < nodes.length; i += CONFIG.BATCH_SIZE) {
	    const batch = nodes.slice(i, i + CONFIG.BATCH_SIZE);
	    requestAnimationFrame(() => {
	      batch.forEach(node => {
	        const newText = convertText(node.textContent, maps);
	        if (newText !== node.textContent) {
	          node.textContent = newText;
	          // Only set RTL on content containers
	          let element = node.parentElement;
	          while (element && !element.classList.contains('mw-content-text')) {
	            if (element.nodeType === 1 && 
	                !element.classList.contains('no-convert') &&
	                element.closest('#mw-content-text')) { // Only affect content area
	              element.setAttribute('dir', 'rtl');
	              element.setAttribute('lang', 'ms-arab');
	            }
	            element = element.parentElement;
	          }
	        }
	      });
	      
	      if (callback && i + CONFIG.BATCH_SIZE >= nodes.length) {
	        callback();
	      }
	    });
	  }
	};
	
	// Modified applyConversion function
	const applyConversion = (isJawi, maps) => {
	  if (isJawi) {
	    CACHE.content = CACHE.content || $contentElement.html();
	    CACHE.title = CACHE.title || $titleElement.text();
	    
	    // Only set RTL on content and title
	    $contentElement
	      .attr('dir', 'rtl')
	      .attr('lang', 'ms-arab');
	    
	    $titleElement
	      .attr('dir', 'rtl')
	      .attr('lang', 'ms-arab');
	    
	    requestAnimationFrame(() => {
	      processTextNodes($contentElement[0], maps, () => {
	        if ($titleElement[0]) {
	          const convertedTitle = convertText($titleElement.text(), maps);
	          $titleElement.text(convertedTitle);
	        }
	      });
	    });
	  } else {
	    if (CACHE.content) {
	      $contentElement
	        .html(CACHE.content)
	        .attr('dir', 'ltr')
	        .attr('lang', 'ms')
	        // Only reset dir/lang on content elements
	        .find('#mw-content-text [dir="rtl"]')
	        .removeAttr('dir')
	        .removeAttr('lang');
	      CACHE.content = null;
	    }
	    
	    if (CACHE.title) {
	      $titleElement
	        .text(CACHE.title)
	        .attr('dir', 'ltr')
	        .attr('lang', 'ms');
	      CACHE.title = null;
	    }
	  }
	};

  // Data fetching with improved error handling
  const fetchRumiJawiData = () => {
    const now = Date.now();
    if (CACHE.rumiJawi && now - CACHE.lastFetch < CONFIG.CACHE_DURATION) {
      return Promise.resolve(CACHE.rumiJawi);
    }

    if (fetchPromise) return fetchPromise;

    const resultUrl = 'https://query-main.wikidata.org/sparql?query=SELECT%20DISTINCT%20%3Fform%20%3Flatn%20%3Farab%20%3Ffeature%20WHERE%20%7B%0A%20%20%3Ff%20dct%3Alanguage%20wd%3AQ9237%3B%0A%20%20%20%20%20ontolex%3AlexicalForm%20%3Fform%20FILTER%20(lang(%3Flatn)%20%3D%20%22ms%22).%0A%20%20%3Fform%20ontolex%3Arepresentation%20%3Flatn%3B%0A%20%20%20%20%20ontolex%3Arepresentation%20%3Farab%20FILTER%20(lang(%3Farab)%20%3D%20%22ms-arab%22).%0A%20%20OPTIONAL%20%7B%20%3Fform%20wikibase%3AgrammaticalFeature%20%3Ffeature%20%7D%0A%20%20FILTER%20(!BOUND(%3Ffeature)%20%7C%7C%20(%3Ffeature%20!%3D%20wd%3AQ98912%20%26%26%20%3Ffeature%20!%3D%20wd%3AQ8185162))%0A%7D%20ORDER%20BY%20%3Ffeature&format=json';

    fetchPromise = fetch(resultUrl, {
      headers: {
        Accept: 'application/sparql-results+json',
        'User-Agent': 'RumiJawiConverter/1.0'
      },
      mode: 'cors'
    })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
      })
      .then(data => {
        const maps = processFetchedData(data);
        CACHE.rumiJawi = maps;
        CACHE.lastFetch = now;
        fetchPromise = null;
        return maps;
      })
      .catch(error => {
        console.error('Error fetching Rumi-Jawi data:', error);
        fetchPromise = null;
        return CACHE.rumiJawi || {
          phrasesMap: new Map(),
          pluralsMap: new Map(),
          othersMap: new Map()
        };
      });

    return fetchPromise;
  };

  // User preference handling
  const saveUserLanguagePreference = (language) => {
    return new mw.Api().saveOption("language", language)
      .then(() => console.log(`Language preference set to ${language}`))
      .catch(error => console.error("Failed to save language preference:", error));
  };

  // Initialization
  const initRumiJawi = () => {
    if (isInitialized) return Promise.resolve();
    
    return Promise.resolve().then(() => {
      if (typeof jQuery === 'undefined') throw new Error('jQuery is not loaded');
      if (typeof mw === 'undefined' || !mw.config) throw new Error('MediaWiki configuration is not available');
      
      isInitialized = true;
      console.log('Rumi-Jawi converter initialized successfully');
    }).catch(error => {
      console.error('Failed to initialize Rumi-Jawi converter:', error);
      throw error;
    });
  };

  // Radio button setup with improved styles
  const setupRadioButtons = () => {
    try {
      const $interactionMenu = $('#p-navigation ul');
      if (!$interactionMenu.length) return;
  
      // Style definitions
      const codexStyles = `
        #ca-nstab-rkj {
          font-family: sans-serif;
          font-weight: normal;
          padding: 0 !important;
          margin: 0 !important;
          border: none !important;
          background: none !important;
        }
        #ca-nstab-rkj .cdx-field {
          padding: 0;
          margin: 0;
        }
        .cdx-label--title {
          font-weight: bold;
          display: block;
          margin-bottom: 4px;
          margin-top: 4px;
        }
        .cdx-radio--inline {
          display: flex;
          flex-direction: row;
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
        .cdx-radio__label-content {
          color: inherit;
        }
        .cdx-radio__icon {
          width: 14px;
          height: 14px;
        }
        .cdx-radio__input {
          margin: 0;
        }
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
  
      $('#rumi-jawi-styles').remove();
      $('head').append(`<style id="rumi-jawi-styles">${codexStyles}</style>`);
  
      $interactionMenu.append(`
        <li id="ca-nstab-rkj">
          <div class="cdx-field">
            <label class="cdx-label cdx-label--title">
              <span class="cdx-label__text convertible-text" data-rumi="Penukar tulisan">Penukar tulisan</span>
            </label>
            <div class="cdx-radio cdx-radio--inline" role="radiogroup" aria-label="Script Selection">
              <div class="cdx-radio__content">
                <label class="cdx-radio__label">
                  <input type="radio" class="cdx-radio__input" name="rumi-jawi" value="rumi" 
                         ${CACHE.currentScript === 'rumi' ? 'checked' : ''} aria-checked="${CACHE.currentScript === 'rumi'}">
                  <span class="cdx-radio__icon" aria-hidden="true"></span>
                  <span class="cdx-radio__label-content convertible-text" data-rumi="Rumi">Rumi</span>
	              </label>
	            </div>
	            <div class="cdx-radio__content">
	              <label class="cdx-radio__label">
	                <input type="radio" class="cdx-radio__input" name="rumi-jawi" value="jawi" 
	                       ${CACHE.currentScript === 'jawi' ? 'checked' : ''} aria-checked="${CACHE.currentScript === 'jawi'}">
	                <span class="cdx-radio__icon" aria-hidden="true"></span>
	                <span class="cdx-radio__label-content convertible-text" data-rumi="Jawi">Jawi</span>
	              </label>
	            </div>
	          </div>
	        </div>
	      </li>
	      <li id="ca-ui-language">
	        <div class="cdx-field">
	          <label class="cdx-label cdx-label--title">
	            <span class="cdx-label__text convertible-text" data-rumi="Penukar antara muka">Penukar antara muka</span>
	          </label>
	          <div class="cdx-radio cdx-radio--inline" role="radiogroup" aria-label="UI Language Selection">
	            <div class="cdx-radio__content">
	              <label class="cdx-radio__label">
	                <input type="radio" class="cdx-radio__input" name="ui-language" value="rumi-ui">
	                <span class="cdx-radio__icon" aria-hidden="true"></span>
	                <span class="cdx-radio__label-content convertible-text" data-rumi="ms-latn">ms-latn</span>
	              </label>
	            </div>
	            <div class="cdx-radio__content">
	              <label class="cdx-radio__label">
	                <input type="radio" class="cdx-radio__input" name="ui-language" value="jawi-ui">
	                <span class="cdx-radio__icon" aria-hidden="true"></span>
	                <span class="cdx-radio__label-content convertible-text" data-rumi="ms-arab">ms-arab</span>
	              </label>
	            </div>
	          </div>
	        </div>
	      </li>
	    `);
	
	    // Enhanced script conversion handler with state management and label conversion
	    $('.cdx-radio__input[name="rumi-jawi"]').on('change', function() {
	      const isJawi = $(this).val() === 'jawi';
	      CACHE.currentScript = isJawi ? 'jawi' : 'rumi';
	      
	      // Update ARIA states
	      $('.cdx-radio__input[name="rumi-jawi"]').each(function() {
	        $(this).attr('aria-checked', $(this).prop('checked'));
	      });
	      
	      const initPromise = isInitialized ? Promise.resolve() : initRumiJawi();
	      
	      initPromise
	        .then(() => fetchRumiJawiData())
	        .then((maps) => {
	          // Convert UI labels
	          $('.convertible-text').each(function() {
	            const $element = $(this);
	            const rumiText = $element.attr('data-rumi');
	            if (isJawi) {
	              const jawiText = convertText(rumiText, maps);
	              $element.text(jawiText);
	            } else {
	              $element.text(rumiText);
	            }
	          });
	
	          // Apply conversion to content
	          applyConversion(isJawi, maps);
	          if (isJawi) {
	            CACHE.content = CACHE.content || $contentElement.html();
	            CACHE.title = CACHE.title || $titleElement.html();
	            $titleElement.attr('dir', 'rtl');
	            $contentElement.attr('dir', 'rtl');
	            return processTextNodes($contentElement[0], maps, () => {
	              if ($titleElement[0]) {
	                $titleElement.text(convertText($titleElement.text(), maps));
	              }
	            });
	          } else {
	            $titleElement.attr('dir', 'ltr');
	            $contentElement.attr('dir', 'ltr');
	            if (CACHE.content && CACHE.title) {
	              $contentElement.html(CACHE.content);
	              $titleElement.html(CACHE.title);
	              CACHE.content = null;
	              CACHE.title = null;
	            }
	          }
	        })
	        .catch(error => {
	          console.error('Conversion error:', error);
	          // Revert to previous state on error
	          const previousState = isJawi ? 'rumi' : 'jawi';
	          CACHE.currentScript = previousState;
	          $(`input[value="${previousState}"]`).prop('checked', true).trigger('change');
	        });
	    });
	
	    // UI language handler remains the same
	    $('.cdx-radio__input[name="ui-language"]').on('change', function() {
	      const language = $(this).val() === 'jawi-ui' ? 'ms-arab' : 'ms';
	      saveUserLanguagePreference(language).then(() => {
	        window.location.reload();
	      });
	    });
	
	    // Set initial UI language radio button state
	    const currentLanguage = mw.config.get('wgUserLanguage');
	    if (currentLanguage === 'ms-arab') {
	      $('input[name="ui-language"][value="jawi-ui"]').prop('checked', true);
	    } else {
	      $('input[name="ui-language"][value="rumi-ui"]').prop('checked', true);
	    }
	  } catch (error) {
	    console.error('Radio button setup error:', error);
	  }
	};

  // Rest of the code remains the same
  $(document).ready(() => {
    $contentElement = $('#mw-content-text').eq(0);
    $titleElement = $('#firstHeading').eq(0);
    
    if (!$contentElement.length || !$titleElement.length) {
      console.error('Content elements not found');
      return;
    }

    setupRadioButtons();
    initRumiJawi().catch(error => console.error('Initialization failed:', error));
  });
}
