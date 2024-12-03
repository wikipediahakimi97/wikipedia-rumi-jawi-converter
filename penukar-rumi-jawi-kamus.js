/**
 ** LOG:
 ** Updated on 27th November 2024
 **
 **/

/* Change the text from rumi to jawi script using dictionary method.*/

/* Original author: [[Pengguna:Hakimi97]] (https://ms.wikipedia.org/wiki/Pengguna:Hakimi97/penukar-rumi-jawi-kamus.js) */

/* Inspired by: [[Pengguna:Kurniasan/rumikpdjawi.js]]  This dictionary converts ms-Latn to ms-Arab through 
* fulldictionaryforconverter.js stored at github (which consists of three components: kamus (core dictionary),
* imbuhanAwalan (prefixes), imbuhanAkhiran (suffixes).
*/

/* Licensed under the terms of the GNU General Public License version 3.0
* as published by the Free Software Foundation; See the
* GNU General Public License for more details.
* A copy of the GPL is available at https://www.gnu.org/licenses/gpl-3.0.txt 
*/

/*
 * PRINSIP KAMUS:
 *
 * 1. Semua nama khas berkaitan masa, geografi dan etnolinguistik akan ditambah 
 *    pada kata dasar. Hanya nama manusia sahaja diasingkan senarai dengan 
 *    terjemahan rumi paling lazim di kedudukan paling hadapan dengan 
 *    variasi-variasi nama di belakangnya. 
 *
 * 2. Semua hamzah bebas (ء) kecuali kata serapan Arab sepatutnya berbentuk  
 *    hamzah tiga suku. Namun disebabkan masalah teknikal maka hamzah tiga suku  
 *    buat masa ini belum diperkenalkan untuk semua perkataan dalam kamus ini.
 *
 * 3. Apabila ada penambahan alif (ا) atau hamzah (ء) di hadapan imbuhan “-an”
 *    sedangkan alif atau hamzah tambahan tidak terjumpa pada kata dasarnya, 
 *    maka kesemua akan ditambah dalam senarai berikut. Selain daripada itu 
 *    semua “-an” secara automatik akan ditambah nun (ن) sahaja. 
 * 
 * 4. Semua kata dalam Kamus Dewan Perdana yang memerlukan penanda gandaan
 *    “٢” akan ditambah dalam senarai berikut (contohnya:اݢق٢). Selain itu semua
 *    perkataan lain yang tidak tersenarai akan dipapar secara lalai dengan 
 *    tanda sengkang “-” (contohnya: برنتاي-رنتاي).
 *
 * 5. Perubahan alif berhamzah (أ) dan wau berhamzah (ؤ) pada kedudukan awal 
 *    suku kata kata dasar (contohnya "سأهلي") yang tercatat dalam Kamus Dewan
 *    Perdana akan ditambah selepas dan sebaris dengan entri kata dasarnya.
 * 
 * 6. Sebarang kata yang mengalami pengguguran alif (ا) dan ain (ع) pada 
 *    kedudukan awal kata dasarnya akan ditambah berserta imbuhan di 
 *    hadapannya, contohnya "مڠهلي" dan "مڠاءيب".
 *
 * 7. Ta marbutah (ة) yang fonem akhir kata ruminya /-t/ akan bertukar kepada 
 *    ta maftuhah (ت), contohnya seperti “عاقبة” berubah kepada“عاقبتن”. Manakala
 *    ta marbutah yang fonem akhir kata ruminya /-h/ pula akan digantikan dengan
 *    huruf ha tebal (ه) sekiranya disambung dengan imbuhan akhir “-an”, “-kan” 
 *    dan “-nya”, contohnya seperti "عقيدة" berubah kepada "عقيدهن". Perubahan ini
 *    yang dirakam dalam Kamus Dewan Perdana akan ditambah selepas dan sebaris 
 *    dengan entri kata dasarnya.
 *
 */

if ([0, 1, 3, 4, 5, 12, 13, 14, 15].includes(mw.config.get('wgNamespaceNumber'))) {
  let cache = null;
  let titleCache = null;
  let RumiJawi = null;
  const processedTextCache = {};

  // Load the kamus data from GitHub
  const loadKamusData = () => {
    return fetch(
      'https://raw.githubusercontent.com/wikipediahakimi97/wikipedia-rumi-jawi-converter/refs/heads/main/fulldictionaryforconverter.js'
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to fetch kamus data: ' + response.statusText);
        }
        return response.text();
      })
      .then((scriptContent) => {
        eval(scriptContent);
      })
      .catch((error) => console.error(error.message));
  };

  // Initialize RumiJawi patterns
  const initRumiJawi = () => {
    if (RumiJawi) return;
    RumiJawi = {
      entries: Object.fromEntries(
        Object.keys(kamus).map((word) => [word, new RegExp(`\\b${word}\\b`, 'gi')])
      ),
      prefixes: Object.fromEntries(
        Object.keys(imbuhanAwalan).map((prefix) => [
          prefix,
          new RegExp(`(\\b${prefix})(\\w+)\\b`, 'gi'),
        ])
      ),
      suffixes: Object.fromEntries(
        Object.keys(imbuhanAkhiran).map((suffix) => [
          suffix,
          new RegExp(`\\b(\\w+)(${suffix})\\b`, 'i'),
        ])
      ),
    };
  };

  // Convert Rumi to Jawi
  const convertToJawi = (src, noRecursive = false) => {
    if (processedTextCache[src]) return processedTextCache[src];

    let result = src;
    if (kamus[src]) {
      result = kamus[src];
    } else if (!noRecursive) {
      result = processSuffixes(src);
    }

    processedTextCache[src] = result;
    return result;
  };

  // Process suffixes
  const processSuffixes = (src) => {
    for (const suffixKey of Object.keys(imbuhanAkhiran)) {
      src = src.replace(RumiJawi.suffixes[suffixKey], suffixProcessor);
    }
    return src;
  };

  // Prefix processor
  const prefixProcessor = (match, prefix, word) => {
    const convertedWord = convertToJawi(word);
    return convertedWord === word ? match : imbuhanAwalan[prefix.toLowerCase()] + convertedWord;
  };

  // Suffix processor
  const suffixProcessor = (match, baseWord, suffix) => {
    const convertedBase = convertToJawi(baseWord, true);
    return convertedBase === baseWord ? match : convertedBase + imbuhanAkhiran[suffix];
  };

  // Convert punctuation to Arabic equivalents
  const convertPunctuationToArabic = (src) => {
    const punctuationMap = {
      '.': '.',
      ',': '⹁',
      '!': '!',
      '?': '؟',
      ':': ':',
      ';': '⁏',
      '(': '(',
      ')': ')',
      '-': ' ـ ',
      "'": '’',
      '"': '“',
      ' ': ' ',
    };

    return src
      .replace(/(\d+)%/g, '%$1') // Adjust percentage position
      .replace(/[.,!?;()'"-]/g, (match) => punctuationMap[match] || match);
  };

  // Process content nodes
  const processContent = ($content) => {
    $content.contents().each(function () {
      if (this.nodeType === 3) {
        let text = this.textContent;
        if (text.trim()) {
          // Process the text
          for (const word of Object.keys(kamus)) {
            text = text.replace(RumiJawi.entries[word], () => kamus[word]);
          }

          for (const prefix of Object.keys(imbuhanAwalan)) {
            text = text.replace(RumiJawi.prefixes[prefix], prefixProcessor);
          }

          text = processSuffixes(text);
          text = convertPunctuationToArabic(text);

          this.textContent = text;
        }
      } else {
        processContent($(this));
      }
    });
  };

  const processTitle = () => {
    const $title = $('#firstHeading');
    let text = $title.text();

    if (text.trim()) {
      initRumiJawi();
      for (const word of Object.keys(kamus)) {
        text = text.replace(RumiJawi.entries[word], () => kamus[word]);
      }

      for (const prefix of Object.keys(imbuhanAwalan)) {
        text = text.replace(RumiJawi.prefixes[prefix], prefixProcessor);
      }

      text = processSuffixes(text);
      text = convertPunctuationToArabic(text);

      $title.text(text);
    }
  };

  // Add toggle switch
  $('#p-interaction ul').append(`
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

  // Inject CSS for the toggle switch
  const toggleSwitchStyle = `
    .switch {
      position: relative;
      display: inline-block;
      width: 34px;
      height: 20px;
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
  `;
  $('head').append(`<style>${toggleSwitchStyle}</style>`);

  // Toggle switch click handler
  $('#togol-rkj').click(function () {
    const $content = $('#mw-content-text');
    const $title = $('#firstHeading');
    if (this.checked) {
      cache = cache || $content.html();
      titleCache = titleCache || $title.html();
      initRumiJawi();
      processTitle();
      processContent($content);
      $content.attr({ dir: 'rtl', class: 'mw-content-rtl' });
    } else if (cache && titleCache) {
      $content.html(cache).attr({ dir: 'ltr', class: 'mw-content-ltr' });
      $title.html(titleCache);
      cache = null;
      titleCache = null;
    }
  });

  // Load resources
  const loadResources = () => {
    Promise.all([loadKamusData()])
      .then(() => {
        console.log('Resources loaded successfully.');
      })
      .catch((error) => console.error('Error loading resources:', error));
  };

  // Initialize
  loadResources();
}
