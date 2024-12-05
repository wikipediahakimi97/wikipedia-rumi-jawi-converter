# MediaWiki Malay Latin script (ms-Latn) to Malay Arabic script (ms-Arab)
Currently, there are four types of converters that have been developed for conversion of main text articles of Wikipedia (could be utilized for other Wikimedia-related projects too):
* penukar-rumi-jawi-aksara.js: Converts ms-Latn to ms-Arab on a letter-by-letter basis. It produces largely erroneous results but offers the fastest conversion speed.
* penukar-rumi-jawi-kamus.js: Converts ms-Latn to ms-Arab on a word-by-word basis. It has the highest accuracy among the three types of converters, but its conversion speed is the slowest.
* penukar-rumi-jawi-hibrid.js: Converts ms-Latn to ms-Arab on a word-by-word basis using letter-number codepoint intermediaries. These codepoints are then converted into Arabic letters on a letter-by-letter basis. This method uses the smallest dictionary database to maintain accuracy while ensuring all letters can be converted without exclusion. It has the advantage of accuracy similar to the Kamus converter, while ensuring that all letters are converted into Jawi script like the Aksara converter. Theoretically this converter should be faster than kamus converter since the hybriddictionaryforconverter.js would store less entries than fulldictionaryforconverter.js.
* penukar-rumi-jawi-wikidata.js: Converts ms-Latn to ms-Arab on a word-by-word basis by utilizing Wikidata Query Service to fetch the Wikidata's lexicographical data (with namespace prefix Lexeme:). The SPARQL query code has been updated so that it will generate a list of ms forms with corresponding ms-arab forms prior conversion. This converter is potential to be faster than hibrid converter, with accuracy highly dependent on Wikidata's lexicographical data. 

In addition to the converters, there are two dictionary databases:
* fulldictionaryforconverter.js: Stores the dictionary for penukar-rumi-jawi-kamus.js.
* hybriddictionaryforconverter.js: Stores the dictionary for penukar-rumi-jawi-hibrid.js.
