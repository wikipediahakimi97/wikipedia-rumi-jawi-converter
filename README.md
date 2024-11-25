# MediaWiki Malay Latin script (ms-Latn) to Malay Arabic script (ms-Arab)
There are three types of converters:
(1) penukar-rumi-jawi-aksara.js: Converts ms-Latn to ms-Arab on a letter-by-letter basis. It produces largely erroneous results but offers the fastest conversion speed.
(2) penukar-rumi-jawi-kamus.js: Converts ms-Latn to ms-Arab on a word-by-word basis. It has the highest accuracy among the three types of converters, but its conversion speed is the slowest.
(3) penukar-rumi-jawi-hibrid.js: Converts ms-Latn to ms-Arab on a word-by-word basis using intermediate symbols. These symbols are then converted into Arabic letters on a letter-by-letter basis. This method uses the smallest dictionary database to maintain accuracy while ensuring all letters can be converted without exclusion. However, it is the least stable converter among the three.

In addition to the converters, there are two dictionary databases:
(1) fulldictionaryforconverter.js: Stores the dictionary for penukar-rumi-jawi-kamus.js.
(2) hybriddictionaryforconverter.js: Stores the dictionary for penukar-rumi-jawi-hibrid.js.
