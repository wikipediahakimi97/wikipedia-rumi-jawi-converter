/**
 ** LOG:
 ** Updated on 20th November 2024
 **
 **/

/* Change the text from rumi to jawi and IPA script */

/* Original author: [[Pengguna:Hakimi97]] (https://ms.wikipedia.org/wiki/Pengguna:Hakimi97/penukar-rumi-jawi-aksara.js) */

/* Licensed under the terms of the GNU General Public License version 3.0
* as published by the Free Software Foundation; See the
* GNU General Public License for more details.
* A copy of the GPL is available at https://www.gnu.org/licenses/gpl-3.0.txt 
*/

/*
 * Rules:
 *
 * 1. This converter converts all Malay Latin script (ms-Latn) to 
 *    Jawi script (ms-Arab) following the principle of letter-by-letter
 *    conversion.
 *
 */

if (mw.config.get('wgNamespaceNumber') === 0) {
  var cache = null;

  // Inject CSS for the toggle switch
  $('head').append(`
    <style>
      .switch {
        position: relative;
        display: inline-block;
        width: 40px;
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
        background-color: #ccc;
        transition: .4s;
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
        transition: .4s;
        border-radius: 50%;
      }
      input:checked + .slider {
        background-color: #2196F3;
      }
      input:checked + .slider:before {
        transform: translateX(20px);
      }
    </style>
  `);

  // Define mappings for Malay Latin to Jawi (example)
  var latinToJawi = {
    'sy': 'ش', 'ng': 'ڠ', 'ny': 'ڽ', 'kh': 'خ', 'gh': 'غ',
    'a': 'ا', 'b': 'ب', 'c': 'چ', 'd': 'د', 'e': '', 'é': 'ي', 'f': 'ف',
    'g': 'ݢ', 'h': 'ه', 'i': 'ي', 'j': 'ج', 'k': 'ک', 'l': 'ل',
    'm': 'م', 'n': 'ن', 'o': 'و', 'p': 'ڤ', 'q': 'ق', 'r': 'ر',
    's': 'س', 't': 'ت', 'u': 'و', 'v': 'ۏ', 'w': 'و', 'x': 'ز',
    'y': 'ي', 'z': 'ز', ' ':' '
  };

  // Define a mapping for Latin punctuation to Arabic punctuation
  var latinToArabicPunctuation = {
    ',': '،', 
    '.': '.',  
    '?': '؟', 
    '!': '!',  
    ':': ':',  
    ';': '⁏', 
    '"': '"',  
    "'": '‘',  
    '(': '(', 
    ')': ')', 
    '/': '/', 
    '-': '-',  
    ' ': ' '
  };

  // Helper function to check if a character is Arabic
  var isArabicChar = function (char) {
    return /[\u0600-\u06FF\u0750-\u077F]/.test(char);
  };

  // Function to add contextual forms in Arabic
  var applyContextualForms = function (text) {
    var words = text.split(' ');
    var processedWords = words.map(function (word) {
      var arabicWord = '';
      for (var i = 0; i < word.length; i++) {
        var char = word[i];
        var prevChar = word[i - 1] || '';
        var nextChar = word[i + 1] || '';

        if (isArabicChar(char)) {
          if (isArabicChar(prevChar) && isArabicChar(nextChar)) {
            arabicWord += char; 
          } else if (isArabicChar(prevChar)) {
            arabicWord += char; 
          } else if (isArabicChar(nextChar)) {
            arabicWord += char; 
          } else {
            arabicWord += char; 
          }
        } else {
          arabicWord += char; 
        }
      }
      return arabicWord;
    });

    return processedWords.join(' '); 
  };

  // Function to convert text to Jawi with contextual forms and punctuation conversion
  var convertToJawi = function (src) {
    var vowels = 'aiou';  
    var convertedText = '';

    if (src.length > 0) {
      var firstChar = src[0].toLowerCase();
      if (firstChar === 'e') {
        src = 'ا' + src.slice(1);
      } else if (firstChar === 'é' || firstChar === 'i') {
        src = 'اي' + src.slice(1);
      } else if (firstChar === 'o' || firstChar === 'u') {
        src = 'او' + src.slice(1);
      }
    }

    var digraphs = ['sy', 'ng', 'ny', 'kh', 'gh'];
    digraphs.forEach(function (digraph) {
      var regex = new RegExp(digraph, 'gi');
      src = src.replace(regex, function (match) {
        return latinToJawi[match.toLowerCase()];
      });
    });

    convertedText = src.split('').map(function (char, index, arr) {
      var nextChar = arr[index + 1] ? arr[index + 1] : '';
      if (char.toLowerCase() === 'e') {
        return ''; 
      }
      if (vowels.includes(char.toLowerCase()) && vowels.includes(nextChar.toLowerCase())) {
        var pair = char.toLowerCase() + nextChar.toLowerCase();
        if (['ai', 'au', 'oi', 'ui'].includes(pair)) {
          return latinToJawi[char.toLowerCase()] + 'ء';
        }
      }
      return latinToJawi[char.toLowerCase()] || char;
    }).join('');

    convertedText = convertedText.replace(/e\b/g, 'ى');
    convertedText = applyContextualForms(convertedText);
    convertedText = convertedText.replace(/[,\.\?!;:"'\(\)\/\-…]/g, function (match) {
      return latinToArabicPunctuation[match] || match;
    });

    return convertedText;
  };

  // Function to handle conversion of text nodes
  var handleTextNode = function (node) {
    var s = node.textContent.trim();
    if (s === '') return;

    s = convertToJawi(s);
    node.textContent = s;
  };

  // Add toggle switch for script conversion
  $('#p-interaction ul').append(`
    <li id="ca-nstab-rkj">
      <span>
        <a>
          <label class="switch">
            <input id="togol-rkj" type="checkbox">
            <span class="slider"></span>
          </label>
          <label for="togol-rkj" style="margin-left: 8px;">Convert to Jawi</label>
        </a>
      </span>
    </li>
  `);

  // Event handler for script conversion toggle switch change
  $('#togol-rkj').change(function () {
    var $mwContentText = $('#mw-content-text');

    if (this.checked) {
      cache = cache || $mwContentText.html();

      function processNodes(nodes) {
        nodes.forEach(function (node) {
          if (node.nodeType === 3) {
            handleTextNode(node);
          } else if (node.nodeType === 1) {
            if (node.tagName.toLowerCase() === 'a') {
              node.childNodes.forEach(function (child) {
                if (child.nodeType === 3) {
                  handleTextNode(child);
                }
              });
            } else {
              processNodes(node.childNodes);
            }
          }
        });
      }

      processNodes($mwContentText[0].childNodes);

      var htmlContent = $mwContentText.html();
      htmlContent = ensureSpaceAroundLinks(htmlContent);
      $mwContentText.html(htmlContent);

      $mwContentText.attr('dir', 'rtl').attr('class', 'mw-content-rtl');
    } else {
      if (cache !== null) {
        $mwContentText.attr('dir', 'ltr').attr('class', 'mw-content-ltr').html(cache);
        cache = null;
      }
    }
  });
}
