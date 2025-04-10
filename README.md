# MediaWiki Malay Latin script (ms-Latn) to Malay Arabic script (ms-Arab)
Currently, four types of converters have been developed for the conversion of main text articles on Wikipedia (these can also be utilized for other Wikimedia-related projects):

* penukar-rumi-jawi-aksara.js: Converts ms-Latn to ms-Arab on a letter-by-letter basis. While it offers the fastest conversion speed, its results are largely erroneous.
* penukar-rumi-jawi-kamus.js: Converts ms-Latn to ms-Arab on a word-by-word basis. It has the highest accuracy among the four types of converters but is the slowest in terms of conversion speed.
* penukar-rumi-jawi-hibrid.js: Converts ms-Latn to ms-Arab on a word-by-word basis using letter-number codepoint intermediaries, which are then converted into Arabic letters on a letter-by-letter basis. This method uses the smallest dictionary database to maintain accuracy while ensuring that all letters are converted without exclusion. It combines the accuracy of the kamus converter with the comprehensive coverage of the aksara converter. Theoretically, this converter should be faster than the kamus converter because the hybriddictionaryforconverter.js stores fewer entries than fulldictionaryforconverter.js.
* penukar-rumi-jawi-wikidata.js: Converts ms-Latn to ms-Arab on a word-by-word basis by utilizing the Wikidata Query Service to fetch lexicographical data (with the namespace prefix Lexeme:). The SPARQL query code has been updated to generate a table of Wikidata lexeme form id, ms form spelling variant and ms-Arab form spelling variant before conversion. This converter has the potential to be faster than the hibrid converter, with its accuracy depending heavily on Wikidata's lexicographical data. It is also compatible to both desktop (Vector-2022) and mobile (Minerva) skins.

In addition to the converters, two dictionary databases are available:

* fulldictionaryforconverter.js: Stores the dictionary for penukar-rumi-jawi-kamus.js.
* hybriddictionaryforconverter.js: Stores the dictionary for penukar-rumi-jawi-hibrid.js.
