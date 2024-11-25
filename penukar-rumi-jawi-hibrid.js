/* Change the text from rumi to jawi script. Current version is a prototype, use it with cautions! */

/* Original author: [[Pengguna:Hakimi97]] (https://ms.wikipedia.org/wiki/Pengguna:Hakimi97/penukar-rumi-jawi-hibrid.js) */

/* This dictionary converts ms-Latn to ms-Arab by theoretically obeying the following principles:
* (1) The original Rumi main text should be lowerred case first. Any punctuations 
* that are circumfixed by numbers should remain as original Rumi style. Put the 
* limit so that only numbers should be in LTR configuration. Ensure the other 
* punctuations and whitespaces should be converted to Jawi’s version first and 
* act as the word boundaries.
* (2) The individual letters from the Rumi main text must match the letter 
* sequence to the entries on kamus dictionary (located on Github). Prioritizing 
* to match the letters to the kamus entries with the most letters. After matching, 
* the words should be converted into corresponding kamusipa symbols, and the 
* kamusipa symbols should and pass through kamusipaToJawi (renamed ipaToJawi, 
* without punctuations) mapping to obtain the Jawi letters.
* (5) If there are adjacent Rumi letters prefixing, suffixing or circumfixing the 
* converted Jawi letters,  the adjacent Rumi letters should be mapped to the 
* imbuhanAwalan dictionary, and the suffixing Rumi letters should be mapped to the
* imbuhanAkhiran dictionary (fetch from Github link). The priority of matching 
* imbuhanAwalan and imbuhanAkhiran should be given to the longest entries within 
* imbuhanAwalan and imbuhanAkhiran dictionaries first (for example “menge” is more 
* prioritized for conversion compared to “mem”). The prefix and suffix converters 
* shall be allowed to concurrently exist to circumfix the converted Jawi words 
* through kamus dictionary. The resulting individual Jawi letters that has been 
* converted through kamus, imbuhanAwalan and imbuhanAkhiran dictionaries should be 
* linked together in contextual Arabic forms with whitespaces and punctuations 
* treated as word boundaries.
* (6) After conversion through kamus, imbuhanAwalan and imbuhanAkhiran dictionaries,
* if there are remnant Rumi letters left unconverted, by default the Rumi letters 
* should be first detect whether got digraph or not, if got digraph then convert
* the digraph into Jawi letters. And then the remaining unconverted Rumi letters
* should be treated as defaultipa and pass through defaultipaToJawi (similar to 
* ipaToJawi but only converts defaults Latin letters into Jawi letters), and link
* them in contextual Arabic forms with whitespaces and punctuations treated as 
* word boundaries.
*/


/* Licensed under the terms of the GNU General Public License version 3.0
* as published by the Free Software Foundation; See the
* GNU General Public License for more details.
* A copy of the GPL is available at https://www.gnu.org/licenses/gpl-3.0.txt 
*/

if ([0, 1, 3, 4, 5, 12, 13, 14, 15].includes(mw.config.get('wgNamespaceNumber'))) {
  let cache = null;
  let RumiToIPA = null;
  const processedTextCache = {};

  const ipaToJawi = {
    // Mapping of IPA to Jawi
    'ʔ': 'ء',
    'a': 'ا',
    'b': 'ب',
    't': 'ت',
    'θ': 'ث',
    'j': 'ج',
    'c': 'چ',
    'ħ': 'ح',
    'χ': 'خ',
    'd': 'د',
    'ð': 'ذ',
    'r': 'ر',
    'z': 'ز',
    'x': 'ز',
    's': 'س',
    'ʃ': 'ش',
    'ṣ': 'ص',
    'ḍ': 'ض',
    'ṭ': 'ط',
    'ẓ': 'ظ',
    'ʕ': 'ع',
    'ɣ': 'غ',
    'ŋ': 'ڠ',
    'f': 'ف',
    'p': 'ڤ',
    'q': 'ق',
    'k': 'ک',
    'g': 'ݢ',
    'l': 'ل',
    'm': 'م',
    'n': 'ن',
    'ɲ': 'ڽ',
    'w': 'و',
    'u': 'و',
    'o': 'و',
    'v': 'ۏ',
    'h': 'ه',
    'ẗ': 'ة',
    'y': 'ي',
    'i': 'ي',
    'e': 'ي',
    'ə': 'ى',
    'á': 'أ',
    'í': 'إ',
    'ý': 'ئ',
    'ẃ': 'ؤ',
    ' ': ' ',
    '.': '.',
    ',': '⹁',
    '!': '!',
    '?': '؟',
    ':': ':',
    ';': '⁏',
    '(': '(',
    ')': ')',
    '-': 'ـ',
    "'": '’',
    '"': '“',
  };

  const digraphsToJawi = {
    sy: 'ش',
    ny: 'ڽ',
    ng: 'ڠ',
    kh: 'خ',
    gh: 'غ',
  };

  const loadKamusData = () => {
    return fetch(
      'https://raw.githubusercontent.com/wikipediahakimi97/wikipedia-rumi-jawi-converter/refs/heads/main/hybriddictionaryforconverter.js'
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to fetch kamus data: ' + response.statusText);
        }
        return response.text();
      })
      .then((scriptContent) => {
        eval(scriptContent); // Load kamus, imbuhanAwalan, imbuhanAkhiran
        initRumiToIPA();
      })
      .catch((error) => console.error(error.message));
  };

  const initRumiToIPA = () => {
    if (RumiToIPA) return;

    const sortedKamusKeys = Object.keys(kamus).sort((a, b) => b.length - a.length);

    RumiToIPA = {
      entries: Object.fromEntries(
        sortedKamusKeys.map((word) => [word.toLowerCase(), kamus[word]])
      ),
      prefixes: Object.fromEntries(
        Object.keys(imbuhanAwalan)
          .sort((a, b) => b.length - a.length)
          .map((prefix) => [prefix.toLowerCase(), imbuhanAwalan[prefix]])
      ),
      suffixes: Object.fromEntries(
        Object.keys(imbuhanAkhiran)
          .sort((a, b) => b.length - a.length)
          .map((suffix) => [suffix.toLowerCase(), imbuhanAkhiran[suffix]])
      ),
    };
  };

  const convertToIPA = (word) => {
    if (processedTextCache[word]) return processedTextCache[word];

    let result = word;

    // Match against dictionary entries
    for (const entry of Object.keys(RumiToIPA.entries)) {
      if (result.startsWith(entry)) {
        result = RumiToIPA.entries[entry];
        result = applyAffixes(result);
        processedTextCache[word] = result;
        return result;
      }
    }

    // Convert remaining text
    result = convertDigraphsToIPA(word);
    result = applyAffixes(result);
    result = convertLettersToIPA(result);

    processedTextCache[word] = result;
    return result;
  };

  const applyAffixes = (word) => {
    let result = word;

    // Skip affix conversion if the word is already in the kamus dictionary
    if (Object.values(RumiToIPA.entries).includes(word)) {
      return result;
    }
    
    let prefixAdded = false;
    let suffixAdded = false;

    // Apply prefixes
    for (const prefix of Object.keys(RumiToIPA.prefixes)) {
      if (result.startsWith(prefix)) {
        result = RumiToIPA.prefixes[prefix] + result.slice(prefix.length);
        prefixAdded = true;
        break;
      }
    }

    // Apply suffixes
    for (const suffix of Object.keys(RumiToIPA.suffixes)) {
      if (result.endsWith(suffix)) {
        result = result.slice(0, -suffix.length) + RumiToIPA.suffixes[suffix];
        suffixAdded = true;
        break;
      }
    }

    // Allow circumfixing if both prefix and suffix are applicable
    if (prefixAdded && suffixAdded) {
      for (const prefix of Object.keys(RumiToIPA.prefixes)) {
        for (const suffix of Object.keys(RumiToIPA.suffixes)) {
          if (
            result.startsWith(RumiToIPA.prefixes[prefix]) &&
            result.endsWith(RumiToIPA.suffixes[suffix])
          ) {
            result =
              RumiToIPA.prefixes[prefix] +
              result.slice(
                RumiToIPA.prefixes[prefix].length,
                -RumiToIPA.suffixes[suffix].length
              ) +
              RumiToIPA.suffixes[suffix];
            break;
          }
        }
      }
    }

    return result;
  };

  // Conversion Helpers: Convert Digraphs, Letters, Contextual Formatting

  const mapIPAtoJawi =
  (ipa) => {
    return ipa
      .split('')
      .map((symbol) => ipaToJawi[symbol] || symbol)
      .join('');
  };

  const convertLettersToIPA = (word) => {
    return word
      .split('')
      .map((letter) => ipaToJawi[letter] || letter)
      .join('');
  };

  const convertDigraphsToIPA = (word) => {
    for (const digraph in digraphsToJawi) {
      const regExp = new RegExp(digraph, 'gi');
      word = word.replace(regExp, digraphsToJawi[digraph]);
    }
    return word;
  };

  const convertTextToJawi = async (text) => {
    const tokens = text.split(/(\b|\s|[%.,!?;:])/);

    return (
      await Promise.all(
        tokens.map(async (token, index, tokensArray) => {
          if (!token.trim()) return token;

          // Handle punctuation-surrounded numbers (LTR rule for numbers)
          if (isPunctuationSurroundedByNumbers(token, tokensArray, index)) {
            return `${tokensArray[index - 1]}${token}${tokensArray[index + 1]}`;
          }

          if (token === '%' && tokensArray[index - 1]?.match(/^\d+$/)) {
            return `${tokensArray[index - 1]}%`;
          }

          let ipa = convertToIPA(token.toLowerCase());
          let jawi = mapIPAtoJawi(ipa);

          // Convert Σ to three-quarter hamza
          if (jawi.includes('Σ')) {
            await mw.loader.using('mediawiki.util');
            jawi = jawi.replace(
              /Σ/g,
              '<span style="bottom: 0.26em;position: relative;">ء</span>'
            );
          }

          processedTextCache[token] = jawi;
          return jawi;
        })
      )
    ).join('');
  };

  const isPunctuationSurroundedByNumbers = (token, tokensArray, index) => {
    const isPunctuation = token.match(/[.,!?;:]/);
    const prevIsNumber = tokensArray[index - 1]?.match(/^\d+$/);
    const nextIsNumber = tokensArray[index + 1]?.match(/^\d+$/);
    return isPunctuation && prevIsNumber && nextIsNumber;
  };

  // Process content in DOM
  const processContent = async ($content) => {
    $content.contents().each(async function () {
      if (this.nodeType === 3) {
        let text = this.textContent;
        if (text.trim()) {
          text = await convertTextToJawi(text);
          this.textContent = text;
        }
      } else {
        await processContent($(this));
      }
    });
  };

  // Toggle switch slider with embedded CSS
  $('head').append(`
	<style>
      .switch {
        position: relative;
        display: inline-block;
        width: 40px;
        height: 22px;
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
        transition: 0.3s;
        border-radius: 50px;
      }
      .slider:before {
        position: absolute;
        content: "";
        height: 18px;
        width: 18px;
        left: 2px;
        bottom: 2px;
        background-color: white;
        transition: 0.3s;
        border-radius: 50%;
        box-shadow: 0px 2px 5px rgba(0, 0, 0, 0.2);
      }
      input:checked + .slider {
        background-color: #36c;
      }
      input:checked + .slider:before {
        transform: translateX(18px);
      }
      .switch input:focus + .slider {
        box-shadow: 0 0 2px 2px rgba(54, 140, 204, 0.6);
      }
	</style>
  `);

  // Append toggle to UI
  $('#p-interaction ul').append(`
    <li id="ca-nstab-rkj">
      <span>
        <label class="switch">
          <input id="togol-rkj" type="checkbox">
          <span class="slider round"></span>
        </label>
        <a><label for="togol-rkj">Papar dalam Jawi</label></a>
      </span>
    </li>
  `);

  // Toggle behavior
  $('#togol-rkj').on('change', async function () {
    if (!RumiToIPA) await loadKamusData();

    let $content = $('#mw-content-text');

    if (this.checked) {
      if (!cache) {
        cache = $content.clone(); // Backup original content
      }
      await processContent($content); // Convert to Jawi
    } else {
      if (cache) {
        $content.replaceWith(cache.clone()); // Restore original content
      }
    }
  });
}
