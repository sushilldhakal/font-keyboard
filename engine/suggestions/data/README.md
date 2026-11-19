# Dictionaries

| File | What | Source and license |
| --- | --- | --- |
| `ne.json` | Nepali words, `[word, count]` | Corpus counts from Swasthani Brata Katha, Satya Harishchandra and Chanakya Niti (public domain texts); plus the stems of the Nepali spell-checking dictionary by Madan Puraskar Pustakalaya (LGPL 2.1, [LibreOffice/dictionaries ne_NP](https://github.com/LibreOffice/dictionaries/tree/master/ne_NP)) at count 1; plus `../sources/ne-extra.txt` (one-letter words, surnames, places; MIT) |
| `sa.json` | Sanskrit words | Verse lines of the Surya Siddhanta, Agni Purana and Chanakya texts in this repository |
| `bigrams.json` | Letter-pair counts over both dictionaries, used to rank spelling variants | Derived from the two files above |

The word lists are data under their own licenses (LGPL 2.1 for the ne_NP stems); the code that
uses them is MIT.

Rebuild, in this order:

```bash
node scripts/build-dictionary.mjs ne 20000 "Swasthani Brata Katha.txt" satya-harish.txt chanakya.txt
node scripts/merge-wordlist.mjs ne ne_NP.dic suggestions/sources/ne-extra.txt
node scripts/build-dictionary.mjs sa 20000 --lines "॥" … (see git history for the exact files)
node scripts/build-bigrams.mjs
```
