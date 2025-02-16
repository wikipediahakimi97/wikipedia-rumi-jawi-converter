/**
 ** LOG:
 ** Updated on 15th Februari 2025
 **
 **/

/* Convert the text from rumi to jawi script, Minerva Neue skin version */

/* Original author: [[Pengguna:Hakimi97]] */

/* Licensed under the terms of the GNU General Public License version 3.0
* as published by the Free Software Foundation; See the
* GNU General Public License for more details.
* A copy of the GPL is available at https://www.gnu.org/licenses/gpl-3.0.txt 
*/

if ([0, 1, 3, 4, 5, 6, 7, 9, 11, 12, 13, 14, 15].includes(mw.config.get('wgNamespaceNumber'))) {
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
        } else {
          maps.othersMap.set(variant, jawi);
        }
      });
    });

    return maps;
  };
  
	const convertText = (text, maps) => {
	  if (!text) return text;
	  
	  const { phrasesMap, othersMap } = maps;
	  
	  const REGEX = {
	    number: /\d+(?:[,.]\d+)*(?:\.\d+)?%?/g,
	    wordWithApostrophe: /\b\w+'\b/g,
	    hyphenated: /\b\w+(?:-\w+)+\b/g,
	    word: /\b\w+\b/g
	  };
	
	  const punctuationMap = new Map([
	    [',', '⹁'],
	    [';', '⁏'],
	    ['?', '؟']
	  ]);
	
	  // Step 1: Preserve numbers
	  const preserveNumbers = (text) => {
	    const placeholders = [];
	    let processedText = text;
	
	    processedText = processedText.replace(
	      REGEX.number,
	      (match) => {
	        const wrappedNumber = `\u2066${match}\u2069`;
	        const placeholder = `__NUM${placeholders.length}__`;
	        placeholders.push(wrappedNumber);
	        return placeholder;
	      }
	    );
	
	    return { processedText, placeholders };
	  };
	
	  // Step 2: Convert phrases (sorted by length for proper matching)
	  const convertPhrases = (text) => {
	    const sortedPhrases = [...phrasesMap.entries()]
	      .sort(([a], [b]) => b.length - a.length);
	
	    return sortedPhrases.reduce((current, [phrase, jawi]) => {
	      const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	      const pattern = new RegExp(`\\b${escapedPhrase}\\b`, 'gi');
	      return current.replace(pattern, jawi);
	    }, text);
	  };
	
	  // Step 3: Convert hyphenated words and words with apostrophes
	  const convertCompoundWords = (text) => {
	    // Handle hyphenated words
	    let result = text.replace(REGEX.hyphenated, match => {
	      // Try converting the complete word first
	      const lower = match.toLowerCase();
	      const completeConversion = othersMap.get(lower);
	      
	      if (completeConversion) {
	        return completeConversion;
	      }
	      
	      // If complete conversion fails, convert individual parts
	      const parts = match.split('-');
	      const convertedParts = parts.map(part => {
	        const partLower = part.toLowerCase();
	        return othersMap.get(partLower) || part;
	      });
	      
	      return convertedParts.join('-');
	    });
	
	    // Handle words with apostrophes
	    result = result.replace(REGEX.wordWithApostrophe, match => {
	      const withoutApostrophe = match.slice(0, -1).toLowerCase();
	      const converted = othersMap.get(withoutApostrophe);
	      return converted ? converted + "'" : match;
	    });
	
	    return result;
	  };
	
	  // Step 4: Convert individual words
	  const convertIndividualWords = (text) => {
	    return text.replace(REGEX.word, match => {
	      const lower = match.toLowerCase();
	      return othersMap.get(lower) || match;
	    });
	  };
	
	  // Step 5: Apply prefix rules
	  const applyPrefixRules = (text) => {
	    const convertAlef = char => char === 'ا' ? 'أ' : char;
	    const prefixes = {
	      ke: /(^|\s)ک\s+(\S)/g,
	      di: /(^|\s)د\s+(\S)/g
	    };
	    
	    return Object.entries(prefixes).reduce((result, [type, pattern]) => {
	      const prefix = type === 'ke' ? 'ک' : 'د';
	      return result.replace(pattern, (_, p1, p2) => 
	        `${p1}${prefix}${convertAlef(p2)}`
	      );
	    }, text);
	  };
	
	  // Step 6: Convert punctuation
	  const convertPunctuation = (text) => {
	    return text.replace(/[,;?]/g, match => 
	      punctuationMap.get(match) || match
	    );
	  };
	
	  // Main execution with proper ordering
	  const { processedText, placeholders } = preserveNumbers(text);
	  
	  // Add RLM (Right-to-Left Mark) at the start to establish RTL context
	  let result = '\u200F';
	  
	  result += processedText;
	  result = convertPhrases(result);
	  result = convertCompoundWords(result);
	  result = convertIndividualWords(result);
	  result = applyPrefixRules(result);
	  result = convertPunctuation(result);
	
	  // Restore numbers
	  return placeholders.reduce((result, number, index) => 
	    result.replace(`__NUM${index}__`, number),
	    result
	  );
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
            let element = node.parentElement;
            while (element && !element.classList.contains('mw-content-text')) {
              if (element.nodeType === 1 && 
                  !element.classList.contains('no-convert') &&
                  element.closest('#mw-content-text .mw-parser-output')) {
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
	        .find('#mw-content-text .mw-parser-output [dir="rtl"]')
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

	const setupRadioButtons = () => {
	  try {
	    // Updated selector to work with both Vector and Minerva
	    const $menuTarget = $('.vector-menu-content ul, .menu').first();
	    if (!$menuTarget.length) {
	      console.error('Navigation menu not found');
	      return;
	    }
	
	    // Style definitions - Enhanced with Minerva-specific styles
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
	      
	      /* Minerva-specific overrides */
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
	      
	      /* Rest of the styles remain the same */
	      .cdx-field {
	        padding: 0;
	        margin: 0;
	      }
	      .cdx-label--title {
	        font-weight: bold;
	        display: block;
	        margin-bottom: 0;
	        padding: 12px 16px 4px;
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
	        padding: 12px 16px;
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
	        border-color: (--color-progressive, #36c);
	      }
	    `;
	
	    // Remove existing styles if any
	    $('#rumi-jawi-styles').remove();
	    $('head').append(`<style id="rumi-jawi-styles">${codexStyles}</style>`);
	
	    // Check if elements already exist and remove them
	    $('#ca-nstab-rkj, #ca-ui-language').remove();
	
	    // Create new elements
	    const $radioButtons = $(`
	      <li id="ca-nstab-rkj">
	        <div class="cdx-field">
	          <label class="cdx-label cdx-label--title">
	            <span class="cdx-label__text convertible-text" data-rumi="Penukar tulisan">Penukar tulisan</span>
	          </label>
	          <div class="cdx-radio cdx-radio--inline" role="radiogroup" aria-label="Script Selection">
	            <div class="cdx-radio__content">
	              <label class="cdx-radio__label">
	                <input type="radio" class="cdx-radio__input" name="rumi-jawi" value="rumi" 
	                       ${CACHE.currentScript === 'rumi' ? 'checked' : ''}>
	                <span class="cdx-radio__icon"></span>
	                <span class="cdx-radio__label-content convertible-text" data-rumi="Rumi">Rumi</span>
	              </label>
	            </div>
	            <div class="cdx-radio__content">
	              <label class="cdx-radio__label">
	                <input type="radio" class="cdx-radio__input" name="rumi-jawi" value="jawi" 
	                       ${CACHE.currentScript === 'jawi' ? 'checked' : ''}>
	                <span class="cdx-radio__icon"></span>
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
	      </li>
	    `);
	
	    // For Minerva, append to the menu
	    if ($('body').hasClass('skin-minerva-latest')) {
	      const $menuContent = $('.menu');
	      // Create a container if it doesn't exist
	      let $container = $menuContent.find('.converter-container');
	      if (!$container.length) {
	        $container = $('<div class="converter-container"></div>');
	        $menuContent.append($container);
	      }
	      $container.append($radioButtons);
	    } else {
	      // For Vector and other skins, append to the navigation
	      $menuTarget.append($radioButtons);
	    }
	
	    // Event handler for script conversion (Rumi/Jawi)
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
	
	    // Event handler for UI language change
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
    $contentElement = $('#mw-content-text .mw-parser-output').eq(0);
    $titleElement = $('.mw-first-heading').eq(0);
    
    if (!$contentElement.length || !$titleElement.length) {
      console.error('Content elements not found');
      return;
    }

    setupRadioButtons();
    initRumiJawi().catch(error => console.error('Initialization failed:', error));
  });
}
