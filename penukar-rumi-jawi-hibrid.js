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
  let RumiToCodePoint = null;
  const processedTextCache = {};

  const rumiToCodePoints = {
    'a': 'A1', 'b': 'B0', 't': 'T0', 'j': 'J0', 'c': 'C0', 'd': 'D0',
    'r': 'R0', 'z': 'Z0', 'x': 'Z0', 's': 'S0', 'f': 'F0',
    'p': 'P0', 'q': 'Q0', 'k': 'K0', 'g': 'G0', 'l': 'L0', 'm': 'M0',
    'n': 'N0', 'w': 'W0', 'u': 'W0', 'o': 'W0', 'v': 'V0', 'h': 'H0',
    'y': 'Y0', 'i': 'Y0', 'e': 'Y0', 
  };

  const codePointsToJawi = {
    'A0': 'ء', 'A1': 'ا', 'B0': 'ب', 'T0': 'ت', 'T2': 'ث', 'J0': 'ج',
    'C0': 'چ', 'H1': 'ح', 'K1': 'خ', 'D0': 'د', 'D1': 'ذ', 'R0': 'ر',
    'Z0': 'ز', 'S0': 'س', 'S1': 'ش', 'S2': 'ص', 'D2': 'ض', 'T3': 'ط',
    'Z1': 'ظ', 'A2': 'ع', 'G1': 'غ', 'N2': 'ڠ', 'F0': 'ف', 'P0': 'ڤ',
    'Q0': 'ق', 'K0': 'ک', 'G0': 'ݢ', 'L0': 'ل', 'M0': 'م', 'N0': 'ن',
    'N1': 'ڽ', 'W0': 'و', 'V0': 'ۏ', 'H0': 'ه', 'T1': 'ة', 'Y0': 'ي',
    'E0': 'ى', 'A4': 'أ', 'I4': 'إ', 'Y4': 'ئ', 'W4': 'ؤ',
  };

  const punctuationsRumiToJawi = {
    ' ': ' ',
    '.': '.', 
    ',': '⹁',
    '!': '!',
    '?': '؟',
    ':': ':',
    ';': '⁏',
    '(': '(',
    ')': ')',
    '-': ' - ',
    "'": '’',
    '"': '“',
  };

  const digraphsToCodePoints = {
    sy: 'S1',
    ny: 'N1',
    ng: 'N2',
    kh: 'K1',
    gh: 'G1',
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
        initRumiToCodePoint();
      })
      .catch((error) => console.error(error.message));
  };

  const initRumiToCodePoint = () => {
    if (RumiToCodePoint) return;

    const sortedKamusKeys = Object.keys(kamus).sort((a, b) => b.length - a.length);

    RumiToCodePoint = {
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


  const convertCodePointsToJawi = (codePointString) => {
    return codePointString.replace(/([A-Z][0-9]+)/g, (match) => codePointsToJawi[match] || match);
  };

  const convertToCodePoints = (word) => {
    const digraphRegex = new RegExp(Object.keys(digraphsToCodePoints).join('|'), 'gi');
    word = word.replace(digraphRegex, (match) => digraphsToCodePoints[match.toLowerCase()] || match);

    return word
      .split('')
      .map((char) => rumiToCodePoints[char] || char)
      .join('');
  };

  const processWord = (word) => {
	  if (RumiToCodePoint.entries[word]) {
	    return convertCodePointsToJawi(RumiToCodePoint.entries[word]);
	  }
	
	  let result = '';
	  let start = 0;
	
	  while (start < word.length) {
	    let matchedSubstring = null;
	    let matchedJawi = null;
	
	    for (let end = word.length; end > start; end--) {
	      const substring = word.slice(start, end).toLowerCase();
	
	      if (RumiToCodePoint.entries[substring]) {
	        if (
	          !matchedSubstring ||
	          substring.length > matchedSubstring.length ||
	          (substring.length === matchedSubstring.length && substring < matchedSubstring)
	        ) {
	          matchedSubstring = substring;
	          matchedJawi = convertCodePointsToJawi(RumiToCodePoint.entries[substring]);
	        }
	      }
	    }
	
	    if (matchedSubstring) {
	      result += matchedJawi;
	      start += matchedSubstring.length;
	    } else {
	      // Process remaining characters with prefix and suffix rules
	      const remainingWord = word.slice(start).toLowerCase();
	
	      // Attempt to apply prefixes
	      const prefixMatch = Object.entries(RumiToCodePoint.prefixes).find(([prefix]) =>
	        remainingWord.startsWith(prefix)
	      );
	
	      if (prefixMatch) {
	        const [prefix, prefixCode] = prefixMatch;
	        const strippedWord = remainingWord.slice(prefix.length);
	        const baseCode = convertToCodePoints(strippedWord);
	        const prefixedCode = prefixCode + baseCode;
	        result += convertCodePointsToJawi(prefixedCode);
	        break;
	      }
	
	      // Attempt to apply suffixes
	      const suffixMatch = Object.entries(RumiToCodePoint.suffixes).find(([suffix]) =>
	        remainingWord.endsWith(suffix)
	      );
	
	      if (suffixMatch) {
	        const [suffix, suffixCode] = suffixMatch;
	        const strippedWord = remainingWord.slice(0, -suffix.length);
	        const baseCode = convertToCodePoints(strippedWord);
	        const suffixedCode = baseCode + suffixCode;
	        result += convertCodePointsToJawi(suffixedCode);
	        break;
	      }
	
	      // No match found, convert the remaining word character-by-character
	      const transformedWord = convertToCodePoints(remainingWord);
	      result += convertCodePointsToJawi(transformedWord);
	      break;
	    }
	  }
	
	  return result;
	};

	const processText = (text) => {
	  // Regex to detect numeric tokens
	  const numericPattern = /^\d+([.,]\d+)*$/;
	
	  return text
	    .split(/(\s+|[^a-zA-Z\d]+)/) // Split into tokens (words, spaces, and punctuation)
	    .map((token) => {
	      if (processedTextCache[token]) return processedTextCache[token];
	
	      if (numericPattern.test(token)) {
	        // Preserve numeric tokens
	        return (processedTextCache[token] = token);
	      }
	
	      if (/^[a-zA-Z]+$/.test(token)) {
	        // Process alphabetic words (Rumi words)
	        return (processedTextCache[token] = processWord(token));
	      }
	
	      // Apply punctuation and whitespace conversion to non-alphabetic tokens
	      return (processedTextCache[token] = applyPunctuationAndWhitespace(token));
	    })
	    .join('');
	};

  const processContent = async ($content) => {
    const textNodes = [];
    const collectTextNodes = (node) => {
      if (node.nodeType === 3 && node.textContent.trim()) textNodes.push(node);
      else $(node).contents().each(function () { collectTextNodes(this); });
    };

    collectTextNodes($content[0]);

    for (const node of textNodes) {
      node.textContent = processText(node.textContent);
    }
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
	  const $title = $('#firstHeading');
	  const $content = $('#mw-content-text');
	
	  if (!RumiToCodePoint) await loadKamusData();
	
	  if (this.checked) {
	    // Perform conversion to Jawi
	    if (!cache) {
	      cache = {
	        title: $title.html(), // Cache the original Rumi title
	        content: $content.html(), // Cache the original Rumi content
	      };
	    }
	
	    // Process title
	    $title.text(processText($title.text()));
	
	    // Process content
	    await processContent($content); // Convert and update content
	  } else {
	    // Restore to Rumi
	    if (cache) {
	      $title.html(cache.title); // Restore original title
	      $content.html(cache.content); // Restore original content
	    }
	  }
	});
}
