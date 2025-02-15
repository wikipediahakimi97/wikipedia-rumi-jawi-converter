// Check which skin is being used
if (['vector-2022', 'vector'].includes(mw.config.get('skin'))) {
    // Load desktop version for Vector 2022 skin
    mw.loader.load("/w/index.php?title=Pengguna:Hakimi97/penukar-rumi-jawi-wikidata/atas-meja.js&action=raw&ctype=text/javascript");
} else if (['minerva'].includes(mw.config.get('skin'))) {
    // Load mobile version for Minerva skin
    mw.loader.load('/w/index.php?title=Pengguna:Hakimi97/penukar-rumi-jawi-wikidata/mudah-alih.js&action=raw&ctype=text/javascript');
}
