# MediaWiki Malay Rumi script (ms-Latn) to Malay Jawi script (ms-Arab) converter
There are four types of script converters have been conceptualized for the conversion of main text articles on Wikipedia:
* penukar-rumi-jawi-aksara.js: Converts ms-Latn to ms-Arab on a letter-by-letter basis. While it offers the fastest conversion speed, its results are largely erroneous.
* penukar-rumi-jawi-kamus.js: Converts ms-Latn to ms-Arab on a word-by-word basis. It has the highest accuracy among the four types of converters but is the slowest in terms of conversion speed.
* penukar-rumi-jawi-hibrid.js: Converts ms-Latn to ms-Arab on a word-by-word basis using letter-number codepoint intermediaries, which are then converted into Arabic letters on a letter-by-letter basis. This method uses the smallest dictionary database to maintain accuracy while ensuring that all letters are converted without exclusion. It combines the accuracy of the kamus converter with the comprehensive coverage of the aksara converter. Theoretically, this converter should be faster than the kamus converter because the hybriddictionaryforconverter.js stores fewer entries than fulldictionaryforconverter.js.
* penukar-rumi-jawi-json.js: Based on April/May 2025 update of penukar-rumi-jawi-wikidata.js. Converts ms-Latn to ms-Arab on a word-by-word basis by utilizing the JSON file generated from Wikidata Query Service through the same SPARQL query code used by the wikidata converter. The JSON file is saved at WDQSMalayLexeme.json file. It serves as a conceptual model if the WDQS could not function properly.

The converters above will utilize the following two dictionary databases, which are:
* fulldictionaryforconverter.js: Stores the dictionary data for penukar-rumi-jawi-kamus.js.
* hybriddictionaryforconverter.js: Stores the dictionary data for penukar-rumi-jawi-hibrid.js.
* WDQSMalayLexeme.json: stores the dictionary data for penukar-rumi-jawi-json.js.

Currently, there are two other script converters that are actively in development, also used for the script conversion of main text articles on Wikipedia (these can also be utilized for other Wikimedia-related projects):
* penukar-rumi-jawi-wikidata-pisah.js: Converts ms-Latn to ms-Arab on a word-by-word basis by utilizing the Wikidata Query Service to fetch lexicographical data (with the namespace prefix Lexeme:). The SPARQL query code has been updated to generate a table of Wikidata lexeme form id, ms form spelling variant and ms-Arab form spelling variant before conversion. This converter has the potential to be faster than the hibrid converter, with its accuracy depending heavily on Wikidata's lexicographical data. It is also compatible to both desktop (Vector-2022) and mobile (Minerva) skins. Compared to other converters, this converter support homograph and no-convert conversions. Consist of "Penukar kandungan" (content script conversion) and "Penukar antara muka" (interface language conversion).
* penukar-rumi-jawi-wikidata-gabung.js: Based on penukar-rumi-jawi-wikidata.js but with the merge of "Penukar kandungan" and "Penukar antara muka" into "Pilihan paparan". This should be the final public release version.



