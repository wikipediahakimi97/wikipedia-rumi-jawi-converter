/**
 ** LOG:
 ** Updated on 3rd December 2024
 **
 **/

/* Change the text from rumi to jawi script */

/* Original author: [[Pengguna:Hakimi97]] */

/* Licensed under the terms of the GNU General Public License version 3.0
* as published by the Free Software Foundation; See the
* GNU General Public License for more details.
* A copy of the GPL is available at https://www.gnu.org/licenses/gpl-3.0.txt 
*/

if ([0, 1, 3, 4, 5, 12, 13, 14, 15].includes(mw.config.get('wgNamespaceNumber'))) {
  let cache = null;
  let titleCache = null;
  let isInitialized = false;
  const processedTextCache = {};
  const wordToJawiCache = new Map(); // Cache for individual word translations
  const endpointUrl = 'https://query.wikidata.org/sparql';
  const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';

  // Precompile regular expressions
  const WORD_BOUNDARY_REGEX = /\b/;
  const WORD_TEST_REGEX = /^[a-zA-Z]+$/; // Only alphabetic words
  const NUMBER_REGEX = /^\d+([,.]\d+)*%?$/; // Matches numbers with optional decimal and percentage
  const DECIMAL_PERCENT_REGEX = /\d+([,.]\d+)*%/; // Matches decimal numbers with percentage
  const PUNCTUATION_REGEX = /[.,!?:;()'"\-]/g;

  // Initialize the converter
  const initRumiJawi = async () => {
    if (isInitialized) return;
    
    try {
      // Check if jQuery is loaded
      if (typeof jQuery === 'undefined') {
        throw new Error('jQuery is not loaded');
      }

      // Check if mw.config is available
      if (typeof mw === 'undefined' || !mw.config) {
        throw new Error('MediaWiki configuration is not available');
      }

      isInitialized = true;
      console.log('Rumi-Jawi converter initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Rumi-Jawi converter:', error);
      throw error;
    }
  };

  // SPARQL Query Dispatcher class
  class SPARQLQueryDispatcher {
    constructor(endpoint) {
      this.endpoint = endpoint;
    }

    query(sparqlQuery) {
      const fullUrl = this.endpoint + '?query=' + encodeURIComponent(sparqlQuery);
      const headers = { 'Accept': 'application/sparql-results+json' };

      return fetch(fullUrl, { headers }).then(body => body.json());
    }
  }

  // Optimized batch processing for words
  const processBatch = async (words) => {
    // If words array is empty, return immediately
    if (!words || words.length === 0) return {};

    const BATCH_SIZE = 50; // Process 50 words at a time
    const wordToJawiMap = {};

    // Process words in batches of 50
    for (let i = 0; i < words.length; i += BATCH_SIZE) {
      const batch = words.slice(i, i + BATCH_SIZE);
      const lowercaseWords = batch.map(word => word.toLowerCase());
      
      // Create SPARQL query with multiple entry points
      const sparqlQuery = `
        SELECT * {
          VALUES ?latn { ${lowercaseWords.map(word => `"${word}"@ms`).join(' ')} }
          ?f ontolex:representation ?latn;
             ontolex:representation ?arab 
          FILTER (LANG(?arab) = "ms-arab").
        }
      `;

      const queryDispatcher = new SPARQLQueryDispatcher(endpointUrl);
      try {
        const data = await queryDispatcher.query(sparqlQuery);
        const bindings = data.results.bindings;

        bindings.forEach(binding => {
          const word = binding.latn.value.toLowerCase();
          const jawi = binding.arab.value;
          wordToJawiMap[word] = jawi;
        });
      } catch (error) {
        console.error(`Error processing batch ${i / BATCH_SIZE + 1}:`, error);
        // Continue with next batch despite error
      }
    }

    return wordToJawiMap;
  };

  const convertToJawi = async (src) => {
    if (!src || typeof src !== 'string') return src;
    if (processedTextCache[src]) return processedTextCache[src];

    try {
      // First, protect decimal numbers with percentages
      const protectedNumbers = new Map();
      let protectedText = src.replace(DECIMAL_PERCENT_REGEX, match => {
        const key = `__NUM${Math.random().toString(36).substr(2, 9)}__`;
        protectedNumbers.set(key, match);
        return key;
      });

      // Split text into words, numbers, punctuation, and existing whitespace
      const segments = protectedText.split(/(\s+|(?<=[.,!?:;()'"\-])|(?=[.,!?:;()'"\-]))/);
      const result = [];
      
      // Process complete words only
      const words = segments.filter(segment => 
        segment.trim() && // non-empty after trimming
        WORD_TEST_REGEX.test(segment) && // only alphabetic
        !NUMBER_REGEX.test(segment) // not numbers/percentages
      );
      
      const wordToJawiMap = await processBatch(words);
      
      // Process each segment while preserving exact structure
      for (let segment of segments) {
        if (!segment) continue; // Skip empty segments
        
        // Check if this is a protected number
        if (protectedNumbers.has(segment)) {
          result.push(protectedNumbers.get(segment));
          continue;
        }
        
        if (PUNCTUATION_REGEX.test(segment)) {
          // Convert punctuation without adding spaces
          result.push(convertPunctuationToArabic(segment));
        } else if (NUMBER_REGEX.test(segment)) {
          // Keep numbers and percentages as-is
          result.push(segment);
        } else if (wordToJawiMap[segment.toLowerCase()]) {
          // Convert complete words
          result.push(wordToJawiMap[segment.toLowerCase()]);
        } else {
          // Keep all other segments (including whitespace) exactly as they are
          result.push(segment);
        }
      }
      
      // Join all segments without adding any extra spaces
      let finalText = result.join('');
      
      // Handle simple percentage numbers at the end without adding spaces
      finalText = finalText.replace(/(\d+)(?![\d.])%(\s*)$/, '$2%$1');
      
      // Restore any remaining protected numbers
      protectedNumbers.forEach((value, key) => {
        finalText = finalText.replace(key, value);
      });
      
      processedTextCache[src] = finalText;
      return finalText;
    } catch (error) {
      console.error('Error in convertToJawi:', error);
      return src;
    }
  };

  const convertPunctuationToArabic = (() => {
    const punctuationMap = {
      '.': '.',
      ',': '⹁',
      '!': '!',
      '?': '؟',
      ':': ':',
      ';': '⁏',
      '(': '(',
      ')': ')',
      '-': '-',  // Removed spaces around tatweel
      '"': '"',
      "'": "'",
    };

    return (src) => {
      if (!src) return src;
      return src.replace(PUNCTUATION_REGEX, match => punctuationMap[match] || match);
    };
  })();

  const processTitleAndContent = async () => {
    try {
      const $title = $('#firstHeading');
      const $content = $('#mw-content-text');

      if (!$title.length || !$content.length) return;

      const processTextNode = async (node, isTitle = false) => {
        if (node.nodeType === 3) { // Text node
          const text = node.textContent;
          if (text && text.trim()) {
            const convertedText = await convertToJawi(text);
            if (convertedText !== text) {
              node.textContent = convertedText;
            }
          }
        } else if (node.nodeType === 1) { // Element node
          // Skip certain elements and elements with numbers or percentages
          const skipTags = ['script', 'style', 'code', 'pre'];
          if (!skipTags.includes(node.tagName.toLowerCase())) {
            // Check if the element contains only numbers or percentages
            const elementText = node.textContent.trim();
            if (!NUMBER_REGEX.test(elementText)) {
              for (let child of node.childNodes) {
                await processTextNode(child, isTitle);
              }
            }
          }
        }
      };

      // Process title and content nodes in parallel
      await Promise.all([
        processTextNode($title[0], true),
        processTextNode($content[0], false)
      ]);

      // Set RTL direction only for content, not for title
      $content.attr({
        dir: 'rtl',
        class: 'mw-content-rtl'
      });
    } catch (error) {
      console.error('Error in processTitleAndContent:', error);
    }
  };

  const setupToggleSwitch = () => {
    try {
      const $interactionMenu = $('#p-interaction ul');
      if (!$interactionMenu.length) {
        console.error('Interaction menu not found');
        return;
      }

      // Add toggle switch HTML
      $interactionMenu.append(`
        <li id="ca-nstab-rkj">
          <span>
            <label class="switch">
              <input id="togol-rkj" type="checkbox">
              <span class="slider round"></span>
            </label>
            <a><label for="togol-rkj"> Papar dalam Jawi</label></a>
          </span>
        </li>
      `);

      // Add CSS styles
      const toggleSwitchStyle = `
        .switch {
          position: relative;
          display: inline-block;
          width: 34px;
          height: 20px;
          vertical-align: middle;
        }
        .switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        .slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: #c8ccd1;
          transition: 0.4s;
          border-radius: 20px;
        }
        .slider:before {
          position: absolute;
          content: "";
          height: 14px;
          width: 14px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: 0.4s;
          border-radius: 50%;
        }
        input:checked + .slider {
          background-color: #36c;
        }
        input:checked + .slider:before {
          transform: translateX(14px);
        }
        #ca-nstab-rkj label {
          cursor: pointer;
        }
      `;
      
      $('head').append(`<style>${toggleSwitchStyle}</style>`);

      // Add toggle switch functionality
      $('#togol-rkj').on('click', async function() {
        try {
          if (this.checked) {
            if (!isInitialized) {
              await initRumiJawi();
            }

            // Store original content
            cache = cache || $('#mw-content-text').html();
            titleCache = titleCache || $('#firstHeading').html();

            // Process title and content
            await processTitleAndContent();
          } else {
            // Restore original content
            const $content = $('#mw-content-text');
            const $title = $('#firstHeading');
            
            if (cache && titleCache) {
              $content.html(cache).attr({
                dir: 'ltr',
                class: 'mw-content-ltr'
              });
              $title.html(titleCache);
              
              // Clear cache
              cache = null;
              titleCache = null;
            }
          }
        } catch (error) {
          console.error('Error toggling Rumi-Jawi converter:', error);
          this.checked = !this.checked;
        }
      });
    } catch (error) {
      console.error('Error setting up toggle switch:', error);
    }
  };

  const loadResources = async () => {
    try {
      await initRumiJawi();
      console.log('Rumi-Jawi converter resources loaded successfully');
    } catch (error) {
      console.error('Error loading Rumi-Jawi converter resources:', error);
    }
  };

  // Initialize the converter
  $(document).ready(() => {
    setupToggleSwitch();
    loadResources();
  });
}
