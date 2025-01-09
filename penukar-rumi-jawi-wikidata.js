/**
 ** LOG:
 ** Updated on 9th January 2025
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
  const endpointUrl = 'https://query-main.wikidata.org/sparql';

  // Cache for SPARQL query results
  let rumiJawiCache = null;
  const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  let lastFetchTime = 0;

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

  // SPARQL Query Dispatcher with improved error handling
  class SPARQLQueryDispatcher {
    constructor(endpoint, options = {}) {
      this.endpoint = endpoint;
      this.timeout = options.timeout || 10000; // Default to 10 seconds
      this.maxRetries = options.maxRetries || 3;
      this.backoffFactor = options.backoffFactor || 2; // For exponential backoff
    }

    query(sparqlQuery, retryCount = 0) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const fullUrl = `${this.endpoint}?query=${encodeURIComponent(sparqlQuery)}`;
      const headers = {
        Accept: 'application/sparql-results+json',
        'User-Agent': 'RumiJawiConverter/1.0',
      };

      return fetch(fullUrl, {
        headers,
        signal: controller.signal,
        mode: 'cors',
      })
        .then((response) => {
          clearTimeout(timeoutId);
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.json();
        })
        .catch((error) => {
          if (error.name === 'AbortError' && retryCount < this.maxRetries) {
            console.log(`Retrying request (${retryCount + 1}/${this.maxRetries})`);
            this.timeout *= this.backoffFactor; // Increase timeout for next retry
            return this.query(sparqlQuery, retryCount + 1);
          }
          throw error;
        });
    }
  }

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

    const sparqlQuery = `
      SELECT DISTINCT ?form ?latn ?arab ?feature WHERE {
        ?f dct:language wd:Q9237;
           ontolex:lexicalForm ?form FILTER (lang(?latn) = "ms").
        ?form ontolex:representation ?latn;
           ontolex:representation ?arab FILTER (lang(?arab) = "ms-arab").
        OPTIONAL { ?form wikibase:grammaticalFeature ?feature }
      } ORDER BY ?feature
    `;

    const queryDispatcher = new SPARQLQueryDispatcher(endpointUrl);

    fetchPromise = queryDispatcher
      .query(sparqlQuery)
      .then((data) => {
        const phrasesMap = new Map();
        const pluralsMap = new Map();
        const othersMap = new Map();

        data.results.bindings.forEach(({ latn, arab, feature }) => {
          const rumi = latn.value.toLowerCase();
          const jawi = arab.value;
          const featureValue = feature?.value;

          if (featureValue === 'http://www.wikidata.org/entity/Q187931') {
            phrasesMap.set(rumi, jawi); // Phrases
          } else if (featureValue === 'http://www.wikidata.org/entity/Q146786') {
            pluralsMap.set(rumi, jawi); // Plurals
          } else {
            othersMap.set(rumi, jawi); // Other normal text
          }
        });

        rumiJawiCache = { phrasesMap, pluralsMap, othersMap };
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
          }
        );
      });

    return fetchPromise;
  };

  // Compile a prioritized regex map
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

  // Convert text to Jawi with strict priority handling
  const convertToJawi = (src, { phrasesMap, pluralsMap, othersMap }) => {
    if (!src || typeof src !== 'string') return Promise.resolve(src);
    if (processedTextCache[src]) return Promise.resolve(processedTextCache[src]);

    return new Promise((resolve, reject) => {
      try {
        let finalText = src;

        const applyReplacements = (map) => {
          map.forEach((jawi, rumi) => {
            const regex = new RegExp(`(?<!\\w)${rumi}(?!\\w)`, 'gi');
            finalText = finalText.replace(regex, jawi);
          });
        };

        applyReplacements(phrasesMap);
        applyReplacements(pluralsMap);
        applyReplacements(othersMap);

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
      .then((maps) => {
        const $title = $('#firstHeading');
        const $content = $('#mw-content-text');

        if (!$title.length || !$content.length) return;

        const walker = document.createTreeWalker(
          $content[0],
          NodeFilter.SHOW_TEXT,
          { acceptNode: () => NodeFilter.FILTER_ACCEPT }
        );

        const promises = [];
        while (walker.nextNode()) {
          promises.push(processTextNode(walker.currentNode, maps));
        }

        return Promise.all(promises).then(() => {
          if ($title[0]) {
            return processTextNode($title[0], maps);
          }
        });
      })
      .catch((error) => {
        console.error('Error in processTitleAndContent:', error);
      });
  };

  // Setup toggle switch
  const setupToggleSwitch = () => {
    try {
      const $interactionMenu = $('#p-interaction ul');
      if (!$interactionMenu.length) {
        console.error('Interaction menu not found');
        return;
      }

      $interactionMenu.append(`
        <li id="ca-nstab-rkj">
          <span class="toggle-container">
            <span id="toggle-label-left" class="toggle-label">Rumi</span>
            <label class="switch">
              <input id="togol-rkj" type="checkbox">
              <span class="slider round"></span>
            </label>
            <span id="toggle-label-right" class="toggle-label">Jawi</span>
          </span>
        </li>
      `);

      const toggleSwitchStyle = `
        .toggle-container {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .toggle-label {
          font-size: 14px;
          user-select: none;
        }
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

      $('#togol-rkj').on('click', function () {
        const mapsPromise = fetchRumiJawiData();

        if (this.checked) {
          (isInitialized ? Promise.resolve() : initRumiJawi())
            .then(() => {
              $('html').attr('lang', 'ms-Arab').attr('dir', 'rtl');

              return mapsPromise.then((maps) => {
                return convertToJawi('Jawi', maps).then((jawiLabel) => {
                  $('#toggle-label-left').text(jawiLabel);
                  return convertToJawi('Rumi', maps);
                });
              });
            })
            .then((rumiLabel) => {
              $('#toggle-label-right').text(rumiLabel);

              cache = cache || $('#mw-content-text').html();
              titleCache = titleCache || $('#firstHeading').html();

              return processTitleAndContent();
            })
            .catch((error) => {
              console.error('Error toggling Rumi-Jawi converter:', error);
              this.checked = false;
            });
        } else {
          $('html').attr('lang', 'ms').attr('dir', 'ltr');

          $('#toggle-label-left').text('Rumi');
          $('#toggle-label-right').text('Jawi');

          const $content = $('#mw-content-text');
          const $title = $('#firstHeading');

          if (cache && titleCache) {
            $content.html(cache).attr({
              dir: 'ltr',
              class: 'mw-content-ltr',
            });
            $title.html(titleCache);

            cache = null;
            titleCache = null;
          }
        }
      });
    } catch (error) {
      console.error('Error setting up toggle switch:', error);
    }
  };

  $(document).ready(() => {
    setupToggleSwitch();
    initRumiJawi().catch((error) => console.error('Initialization failed:', error));
  });
}
