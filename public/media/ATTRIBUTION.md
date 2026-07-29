# Media credits

The clips in this folder are placeholders for a study. They are short loops cut
from the Blender Foundation's open movies, which are released under
**Creative Commons Attribution 3.0** — free to use, modify and redistribute with
credit.

| file | source | credit |
|---|---|---|
| `loop-01.mp4` | *Big Buck Bunny* trailer | © 2008 Blender Foundation · [peach.blender.org](https://peach.blender.org) |
| `loop-02.mp4` | *Big Buck Bunny* trailer | © 2008 Blender Foundation · [peach.blender.org](https://peach.blender.org) |
| `loop-03.mp4` | *Big Buck Bunny* trailer | © 2008 Blender Foundation · [peach.blender.org](https://peach.blender.org) |
| `loop-04.mp4` | *Sintel* trailer | © 2010 Blender Foundation · [sintel.org](https://sintel.org) |
| `loop-05.mp4` | *Sintel* trailer | © 2010 Blender Foundation · [sintel.org](https://sintel.org) |

Licence: [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)

## What was done to them

Each is a 2–5 second window scaled to 480×270, cropped to 16:9, re-encoded at
CRF 30, silent. No audio track is kept.

The loop is seamless by crossfade rather than by palindrome: the tail is blended
back onto the head and the middle follows, so both joins are already matched.
A palindrome would have been simpler and reads as *rewind* on character
animation — a rabbit walking backwards is not a loop, it is a mistake.

Windows were chosen by sampling the trailers a frame per second and looking at
the contact sheet. Both trailers cut to title cards every two or three seconds,
so the usable runs are short and had to be found rather than guessed.

## Replacing them

`LOOPS` in `examples/002-scroll-helix/main.jsx` lists the filenames, one per
card, resolved against `public/media/`. Drop other files in and rename the list.
Anything a `<video>` element can play will work.

If you replace these, replace this file too. Nothing here should carry a credit
it has not earned.
