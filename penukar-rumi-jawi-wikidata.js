/**
 ** LOG:
 ** Updated on 5th February 2025
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
  let cache = null;
  let titleCache = null;
  let isInitialized = false;
  const processedTextCache = {};
  
  // Cache for SPARQL query results
  let rumiJawiCache = null;
  const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  let lastFetchTime = 0;

  // Cached DOM elements
  let $contentElement = null;
  let $titleElement = null;

  // Initialize the converter
  const initRumiJawi = () => {
    if (isInitialized) return Promise.resolve();

    return new Promise((resolve, reject) => {
      try {
        if (typeof jQuery === 'undefined') {
          throw new Error('jQuery is not loaded');
        }

        if (typeof mw === 'undefined' || !mw.config) {
          throw new Error('MediaWiki configuration is not available');
        }

        isInitialized = true;
        console.log('Rumi-Jawi converter initialized successfully');
        resolve();
      } catch (error) {
        console.error('Failed to initialize Rumi-Jawi converter:', error);
        reject(error);
      }
    });
  };

  // Fetch Rumi-Jawi mapping data
  let fetchPromise = null;

  const fetchRumiJawiData = () => {
    const now = Date.now();
    if (rumiJawiCache && now - lastFetchTime < CACHE_DURATION) {
      console.log('Using cached Rumi-Jawi data');
      return Promise.resolve(rumiJawiCache);
    }

    if (fetchPromise) {
      console.log('Waiting for ongoing fetch');
      return fetchPromise;
    }

    // Static precomputed query URL
    const resultUrl = 'https://query-main.wikidata.org/sparql?query=SELECT%20DISTINCT%20%3Fform%20%3Flatn%20%3Farab%20%3Ffeature%20WHERE%20%7B%0A%20%20%3Ff%20dct%3Alanguage%20wd%3AQ9237%3B%0A%20%20%20%20%20ontolex%3AlexicalForm%20%3Fform%20FILTER%20(lang(%3Flatn)%20%3D%20%22ms%22).%0A%20%20%3Fform%20ontolex%3Arepresentation%20%3Flatn%3B%0A%20%20%20%20%20ontolex%3Arepresentation%20%3Farab%20FILTER%20(lang(%3Farab)%20%3D%20%22ms-arab%22).%0A%20%20OPTIONAL%20%7B%20%3Fform%20wikibase%3AgrammaticalFeature%20%3Ffeature%20%7D%0A%20%20FILTER%20(!BOUND(%3Ffeature)%20%7C%7C%20(%3Ffeature%20!%3D%20wd%3AQ98912%20%26%26%20%3Ffeature%20!%3D%20wd%3AQ8185162))%0A%7D%20ORDER%20BY%20%3Ffeature&format=json';

    fetchPromise = fetch(resultUrl, {
      headers: {
        Accept: 'application/sparql-results+json',
        'User-Agent': 'RumiJawiConverter/1.0'
      },
      mode: 'cors'
    })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
      })
      .then((data) => {
        const phrasesMap = new Map();
        const pluralsMap = new Map();
        const othersMap = new Map();

        data.results.bindings.forEach(({ latn, arab, feature }) => {
          const rumi = latn.value.toLowerCase();
          const jawi = arab.value;
          const featureValue = feature?.value;

          if (featureValue === 'http://www.wikidata.org/entity/Q187931') {
            phrasesMap.set(rumi, jawi);
          } else if (featureValue === 'http://www.wikidata.org/entity/Q146786') {
            pluralsMap.set(rumi, jawi);
          } else {
            othersMap.set(rumi, jawi);
          }
        });

        // Compile regex maps once and store
        const compileRegexMaps = (maps) => {
          const compiledMaps = [];
          for (const map of maps) {
            const regexMap = new Map();
            map.forEach((jawi, rumi) => {
              regexMap.set(new RegExp(`(?<!\\w)${rumi}(?!\\w)`, 'gi'), jawi);
            });
            compiledMaps.push(regexMap);
          }
          return compiledMaps;
        };

        const compiledMaps = compileRegexMaps([phrasesMap, pluralsMap, othersMap]);
        rumiJawiCache = { phrasesMap, pluralsMap, othersMap, compiledMaps };
        lastFetchTime = now;
        fetchPromise = null;
        return rumiJawiCache;
      })
      .catch((error) => {
        console.error('Error fetching Rumi-Jawi data:', error);
        fetchPromise = null;
        return (
          rumiJawiCache || {
            phrasesMap: new Map(),
            pluralsMap: new Map(),
            othersMap: new Map(),
            compiledMaps: [],
          }
        );
      });

    return fetchPromise;
  };

  // Convert text to Jawi using precompiled regex maps
  const convertToJawi = (src, { compiledMaps }) => {
    if (!src || typeof src !== 'string') return Promise.resolve(src);
    if (processedTextCache[src]) return Promise.resolve(processedTextCache[src]);

    return new Promise((resolve, reject) => {
      try {
        let finalText = src;

        compiledMaps.forEach((regexMap) => {
          regexMap.forEach((jawi, regex) => {
            finalText = finalText.replace(regex, jawi);
          });
        });

        processedTextCache[src] = finalText;
        resolve(finalText);
      } catch (error) {
        console.error('Error in convertToJawi:', error);
        reject(src);
      }
    });
  };

  // Process page title and content
  const processTextNode = (node, maps) => {
    const text = node.textContent;
    if (text && text.trim()) {
      return convertToJawi(text, maps).then((convertedText) => {
        if (convertedText !== text) {
          node.textContent = convertedText;
          if (node.parentElement) {
            node.parentElement.setAttribute('dir', 'auto');
          }
        }
      });
    }
    return Promise.resolve();
  };

  const processTitleAndContent = () => {
    return fetchRumiJawiData()
      .then(({ compiledMaps, ...maps }) => {
        if (!$titleElement || !$contentElement) return;

        const walker = document.createTreeWalker(
          $contentElement[0],
          NodeFilter.SHOW_TEXT,
          { acceptNode: () => NodeFilter.FILTER_ACCEPT }
        );

        const promises = [];
        while (walker.nextNode()) {
          promises.push(processTextNode(walker.currentNode, { compiledMaps }));
        }

        return Promise.all(promises).then(() => {
          if ($titleElement[0]) {
            return processTextNode($titleElement[0], { compiledMaps });
          }
        });
      })
      .catch((error) => {
        console.error('Error in processTitleAndContent:', error);
      });
  };

  const setupRadioButtons = () => {
    try {
      const $interactionMenu = $('#p-navigation ul');
      if (!$interactionMenu.length) return;

      // Add Codex-compliant radio buttons
      $interactionMenu.append(`
		<li id="ca-nstab-rkj">
          <div class="cdx-field">
            <label class="cdx-label cdx-label--title">
              <span class="cdx-label__text" data-rumi="Penukar aksara">Penukar aksara</span>
            </label>
            <div class="cdx-radio cdx-radio--inline">
              <div class="cdx-radio__content">
                <label class="cdx-radio__label">
                  <input type="radio" 
                    class="cdx-radio__input" 
                    name="rumi-jawi" 
                    value="rumi" 
                    checked
                  >
                  <span class="cdx-radio__icon"></span>
                  <span class="cdx-radio__label-content" data-rumi="Rumi">Rumi</span>
                </label>
              </div>
              <div class="cdx-radio__content">
                <label class="cdx-radio__label">
                  <input type="radio" 
                    class="cdx-radio__input" 
                    name="rumi-jawi" 
                    value="jawi"
                  >
                  <span class="cdx-radio__icon"></span>
                  <span class="cdx-radio__label-content" data-rumi="Jawi">Jawi</span>
                </label>
              </div>
            </div>
          </div>
        </li>
      `);

      // Add Codex-compliant typography
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
	`;
      $('head').append(`<style>${codexStyles}</style>`);

      // Handle radio button changes with proper content conversion
      $('.cdx-radio__input').on('change', function() {
        const isJawi = $(this).val() === 'jawi';
        const $labels = $('.cdx-label__text, .cdx-radio__label-content');

        // Initialize converter if needed
        const initPromise = isInitialized ? Promise.resolve() : initRumiJawi();
        
        initPromise
          .then(() => fetchRumiJawiData())
          .then(({ compiledMaps }) => {
            if (isJawi) {
              // Convert UI labels
              return Promise.all([
                convertToJawi('Penukar aksara', { compiledMaps }),
                convertToJawi('Rumi', { compiledMaps }),
                convertToJawi('Jawi', { compiledMaps })
              ]).then(([title, rumiLabel, jawiLabel]) => {
                $('.cdx-label__text').text(title);
                $('.cdx-radio__label-content').eq(0).text(rumiLabel);
                $('.cdx-radio__label-content').eq(1).text(jawiLabel);
              }).then(() => {
                // Store original content and convert
                cache = cache || $contentElement.html();
                titleCache = titleCache || $titleElement.html();
                
                $('html').attr({
                  lang: 'ms-Arab',
                  dir: 'rtl'
                });
                
                return processTitleAndContent();
              });
            } else {
              // Restore original content
              $('.cdx-label__text').text('Penukar aksara');
              $('.cdx-radio__label-content').eq(0).text('Rumi');
              $('.cdx-radio__label-content').eq(1).text('Jawi');
              
              $('html').attr({
                lang: 'ms',
                dir: 'ltr'
              });

              if (cache && titleCache) {
                $contentElement.html(cache);
                $titleElement.html(titleCache);
                cache = null;
                titleCache = null;
              }
            }
          })
          .catch(error => {
            console.error('Conversion error:', error);
            $('#ca-nstab-rkj input[value="rumi"]').prop('checked', true);
          });
      });

    } catch (error) {
      console.error('Radio button setup error:', error);
    }
  };

  $(document).ready(() => {
    // Properly initialize content elements
    $contentElement = $('#mw-content-text').eq(0);
    $titleElement = $('#firstHeading').eq(0);
    
    // Ensure elements exist
    if (!$contentElement.length || !$titleElement.length) {
      console.error('Content elements not found');
      return;
    }

    setupRadioButtons();
    initRumiJawi().catch(error => console.error('Initialization failed:', error));
  });
}
