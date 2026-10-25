// Which SoundFont instruments become library instruments (dev tool). Give them generic names.
// [file number (numbered files 1_x.sf2, 2_y.sf2 ...), instrument name inside the .sf2, library name, family, moods, genres, overrides]
// families: PIANO EPIANO HARPSI CELESTA GLOCK MARIMBA VIBES ORGAN GUITAR BASS HARP TIMPANI STRINGS CHOIR BRASS HORN SAX OBOE FLUTE SITAR PIZZ PAD
// overrides: { v: 3 } = offered to new songs only, { tn: 2 } = true-pitch factor from tools/sf_tune.js
module.exports = [
  // [1, 'Piano 1', 'PIANO', 'PIANO', ['calm', 'sad', 'bright'], ['town', 'theme', 'credits']],
  // [1, 'Strings', 'STRINGS', 'STRINGS', ['epic', 'warm'], ['any']],
];
