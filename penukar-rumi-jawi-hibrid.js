/* Change the text from rumi to jawi script. Current version is a prototype, use it with cautions! */

/* Original author: [[Pengguna:Hakimi97]] (https://ms.wikipedia.org/wiki/Pengguna:Hakimi97/penukar-rumi-jawi-hibrid.js) */

/* This dictionary converts ms-Latn to ms-Arab by theoretically obeying the following principles:
* (1) The original Rumi main text should be lowerred case first. Any punctuations that 
*     are circumfixed by numbers should remain as original Rumi style. Put the limit so 
*     that only numbers should be in LTR configuration. 
* (2) Ensure the other punctuations and whitespaces should be converted to Jawi’s version
*     first through punctuationsRumiToJawi mapping. The whitespaces must act as the word 
*     boundaries and prevent the contextual form of Jawi letters to overcross the boundaries
*     of whitespaces.
* (3) If the letter sequence from the main Rumi text matches the entries on kamus dictionary
*     (fetched from Github), the words should be converted into corresponding Jawi letters 
*     with IPA serves as intermediary through ipaToJawi mapping. 
* (4) After that, if there are adjacent Rumi letters prefixing, suffixing or circumfixing 
*     the converted Jawi letters,  the adjacent Rumi letters should be mapped to the 
*     imbuhanAwalan dictionary, and the suffixing Rumi letters should be mapped to the 
*     imbuhanAkhiran dictionary (fetch from Github link). The priority of matching 
*     imbuhanAwalan and imbuhanAkhiran should be given to the longest entries within 
*     imbuhanAwalan and imbuhanAkhiran dictionaries first (for example “menge” is more 
*     prioritized for conversion compared to “mem”). The prefix and suffix converters shall
*     be allowed to concurrently exist to circumfix the converted Jawi words through kamus 
*     dictionary. 
* (5) The resulting individual Jawi letters that has been converted through kamus, 
*     imbuhanAwalan and imbuhanAkhiran dictionaries should be linked together in contextual 
*     Arabic forms with whitespaces and punctuations treated as word boundaries.
* (6) If there are remnant Rumi letters left unconverted, by default the Rumi letters should 
*     be first detect whether got digraph or not, if got digraph then convert the digraph into
*     Jawi letters through digraphsToJawi mapping. And then the remaining unconverted Rumi 
*     letters should be converted into Jawi letters through directRumiToJawi mapping, and link
*     all converted Jawi letters produced by (8) in contextual Arabic forms with whitespaces 
*     and punctuations treated as word boundaries.
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
    'ʔ': 'ء', 'a': 'ا', 'b': 'ب', 't': 'ت', 'θ': 'ث', 'j': 'ج',
    'c': 'چ', 'ħ': 'ح', 'χ': 'خ', 'd': 'د', 'ð': 'ذ', 'r': 'ر',
    'z': 'ز', 'x': 'ز', 's': 'س', 'ʃ': 'ش', 'ṣ': 'ص', 'ḍ': 'ض',
    'ṭ': 'ط', 'ẓ': 'ظ', 'ʕ': 'ع', 'ɣ': 'غ', 'ŋ': 'ڠ', 'f': 'ف',
    'p': 'ڤ', 'q': 'ق', 'k': 'ک', 'g': 'ݢ', 'l': 'ل', 'm': 'م',
    'n': 'ن', 'ɲ': 'ڽ', 'w': 'و', 'u': 'و', 'o': 'و', 'v': 'ۏ',
    'h': 'ه', 'ẗ': 'ة', 'y': 'ي', 'i': 'ي', 'e': 'ي', 'ə': 'ى',
    'á': 'أ', 'í': 'إ', 'ý': 'ئ', 'ẃ': 'ؤ',
  };

  const punctuationsRumiToJawi = {
    ' ': ' ', '.': '.', ',': '،',
    '!': '!', '?': '؟', ':': ':', ';': '؛', '(': '(',
    ')': ')', '-': 'ـ', "'": '’', '"': '“',
  };

  const digraphsToIPA = {
    sy: 'ʃ',
    ny: 'ɲ',
    ng: 'ŋ',
    kh: 'χ',
    gh: 'ɣ',
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

  const applyPunctuationAndWhitespace = (text) => {
    return text
      .split('')
      .map((char) => punctuationsRumiToJawi[char] || char)
      .join('');
  };

  const applyAffixes = (word, isPrefix) => {
    const affixes = isPrefix ? RumiToIPA.prefixes : RumiToIPA.suffixes;
    const affixKeys = Object.keys(affixes);

    for (const affix of affixKeys) {
      const condition = isPrefix
        ? word.startsWith(affix)
        : word.endsWith(affix);

      if (condition) {
        const replacement = affixes[affix];
        return isPrefix
          ? replacement + word.slice(affix.length)
          : word.slice(0, -affix.length) + replacement;
      }
    }
    return word;
  };

  const convertDigraphsToIPA = (word) => {
    for (const digraph in digraphsToIPA) {
      word = word.replace(new RegExp(digraph, 'gi'), digraphsToIPA[digraph]);
    }
    return word;
  };

  const convertIPAtoJawi = (ipa) => {
    return ipa
      .split('')
      .map((symbol) => ipaToJawi[symbol] || symbol)
      .join('');
  };

  const processWord = (word) => {
    // Check dictionary first
    if (RumiToIPA.entries[word]) {
      return convertIPAtoJawi(RumiToIPA.entries[word]);
    }

    // Process digraphs
    word = convertDigraphsToIPA(word);

    // Apply prefixes
    word = applyAffixes(word, true);

    // Apply suffixes
    word = applyAffixes(word, false);

    // Map IPA to Jawi
    return convertIPAtoJawi(word);
  };

  const processText = (text) => {
    return text
      .split(/(\s+|[^a-zA-Z]+)/)
      .map((token) => {
        if (processedTextCache[token]) {
          return processedTextCache[token];
        }

        if (/^[a-zA-Z]+$/.test(token)) {
          const processedWord = processWord(token.toLowerCase());
          processedTextCache[token] = processedWord;
          return processedWord;
        }

        // Handle punctuation and other non-alphabetic characters
        const processedNonAlphabetic = applyPunctuationAndWhitespace(token);
        processedTextCache[token] = processedNonAlphabetic;
        return processedNonAlphabetic;
      })
      .join('');
  };

  const processContent = async ($content) => {
    $content.contents().each(async function () {
      if (this.nodeType === 3) {
        const text = this.textContent;
        if (text.trim()) {
          this.textContent = processText(text);
        }
      } else {
        await processContent($(this));
      }
    });
  };

  $('head').append(`
    <style>
      .switch { position: relative; display: inline-block; width: 40px; height: 22px; }
      .switch input { opacity: 0; width: 0; height: 0; }
      .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #c8ccd1; transition: 0.3s; border-radius: 50px; }
      .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 2px; bottom: 2px; background-color: white; transition: 0.3s; border-radius: 50%; box-shadow: 0px 2px 5px rgba(0, 0, 0, 0.2); }
      input:checked + .slider { background-color: #36c; }
      input:checked + .slider:before { transform: translateX(18px); }
    </style>
  `);

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

  $('#togol-rkj').on('change', async function () {
    if (!RumiToIPA) await loadKamusData();

    const $content = $('#mw-content-text');

    if (this.checked) {
      if (!cache) {
        cache = $content.html();
        await processContent($content);
      }
    } else {
      if (cache) {
        $content.html(cache);
      }
    }
  });
}
