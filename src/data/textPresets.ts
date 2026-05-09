/**
 * Preset text snippets for quickly testing a font in the StyleSetter and
 * TypeSetter.
 *
 * Each preset is just a string. Its display label (the dropdown entry, and
 * what we'd save it as on disk) is derived automatically from the FIRST
 * TWO WORDS of the text — so to add a new preset you only need to append
 * a string. Keep additions short, original, and avoid copyrighted dialogue.
 */

export type TextPresetBubble = {
  /** Auto-derived from the first two words of `text`. */
  readonly label: string;
  /** The actual text to load. May contain newlines. */
  readonly text: string;
};

export type TextPresetSet = {
  readonly id: string;
  readonly name: string;
  readonly bubbles: readonly TextPresetBubble[];
};

/** Strip a token to letters/digits/apostrophe so punctuation around a word
 *  doesn't pollute the filename. Returns lower-case. */
function cleanWord(w: string): string {
  return w.replace(/[^A-Za-z0-9']+/g, '').toLowerCase();
}

/** Label = first two non-empty cleaned words joined by a space. Falls back
 *  to 'untitled' when the text contains no word characters. */
export function presetLabelFromText(text: string): string {
  const words = text
    .split(/\s+/)
    .map(cleanWord)
    .filter((w) => w.length > 0);
  if (words.length === 0) return 'untitled';
  return words.slice(0, 2).join(' ');
}

/** Filesystem-safe id (snake_case) of a preset, e.g. 'at_last'. */
export function presetIdFromText(text: string): string {
  return presetLabelFromText(text).replace(/\s+/g, '_');
}

/** Build a preset whose label is auto-derived from its text. */
function p(text: string): TextPresetBubble {
  return { label: presetLabelFromText(text), text };
}

/** Original placeholder bubbles. Big, declarative, theatrical. */
const justKiddingPlaceholder: TextPresetSet = {
  id: 'just-kidding-placeholder',
  name: 'Just Kidding (cosmic / heroic placeholder)',
  bubbles: [
    p(
      'AT LAST! THE MOMENT IS UPON US!\n\n' +
        'YOU CANNOT STOP WHAT HAS\n' +
        'ALREADY BEGUN --\n\n' +
        'BEHOLD THE POWER OF THE\n' +
        'COSMIC GAUNTLET!',
    ),
    p(
      'NO MORTAL HAND CAN UNMAKE\n' +
        'WHAT I HAVE WROUGHT!\n\n' +
        'STAND ASIDE, FOOL --\n' +
        'OR BE SWEPT AWAY LIKE THE REST!\n\n' +
        'THIS WORLD IS MINE\n' +
        'BY RIGHT OF CONQUEST!',
    ),
    p(
      'YOU SPEAK OF MERCY?\n' +
        'I HAVE FORGOTTEN THE WORD!\n\n' +
        'THE STARS THEMSELVES\n' +
        'WILL REMEMBER THIS DAY --\n\n' +
        'I AM THE STORM\n' +
        'THAT SHATTERS EMPIRES!',
    ),
    p(
      'RISE, MY BROTHERS!\n' +
        'RISE AND TAKE BACK\n' +
        'WHAT WAS STOLEN!\n\n' +
        'AND SO -- THE LAST OF\n' +
        'THE TITANS FALLS.\n\n' +
        'MEANWHILE, FAR BENEATH\n' +
        'THE SHATTERED CITY...',
    ),
    p(
      'HOURS LATER -- IN A PLACE\n' +
        'WITHOUT NAME OR NUMBER --\n' +
        'A SINGLE LIGHT FLICKERS ON.\n\n' +
        'THUS ENDS THE SAGA\n' +
        'OF THE IRON KING.\n\n' +
        '...OR DOES IT?',
    ),
  ],
};

/** Hard-boiled detective monologue & dialogue. Lower-case, terse. */
const noir: TextPresetSet = {
  id: 'noir',
  name: 'Noir / detective',
  bubbles: [
    p(
      'She walked in like she owned the place.\n' +
        'Maybe she did.\n\n' +
        'The rain hadn\'t stopped in three days.\n' +
        'Neither had my headache.\n\n' +
        '"You expecting someone?"\n' +
        '"Yeah. Trouble. You\'re early."',
    ),
    p(
      'I\'d seen that look before --\n' +
        'on a man about to lie to a priest.\n\n' +
        'Forty bucks a day, plus expenses.\n' +
        'Cheap, for what it cost me.\n\n' +
        'The dame had a voice like whiskey\n' +
        'poured over broken glass.',
    ),
    p(
      '"Where\'s the kid?"\n' +
        '"Gone."\n' +
        '"Gone where?"\n' +
        '"Gone gone."\n\n' +
        'I lit my last cigarette and watched\n' +
        'the city fall apart in slow motion.\n\n' +
        'Nobody walks away from a deal like this.\n' +
        'Not even me.',
    ),
    p(
      'Three shots. Two bodies.\n' +
        'One very long night ahead of me.\n\n' +
        'I should have stayed in bed.\n' +
        'I should have stayed in Cleveland.\n\n' +
        'Instead I was here, with a dead man\n' +
        'and a dame who wouldn\'t stop crying\n' +
        'long enough to lie to me properly.',
    ),
  ],
};

/** Cold sci-fi / mission control. Procedural, clipped. */
const sciFi: TextPresetSet = {
  id: 'sci-fi',
  name: 'Sci-fi / mission control',
  bubbles: [
    p(
      'CONTAINMENT BREACH ON DECK SEVEN.\n' +
        'ALL HANDS, EVAC.\n\n' +
        'We\'re reading 0.04 c and climbing.\n' +
        'She\'s going to make it.\n\n' +
        'Computer -- replay the last\n' +
        'sixty seconds of telemetry.',
    ),
    p(
      '"What is it?"\n' +
        '"I don\'t know yet. But it\'s alive."\n\n' +
        'Approaching the relay at mark 12-by-7.\n' +
        'Visual in three.\n\n' +
        'Coordinates locked. Firing main drive\n' +
        'in 5... 4... 3...',
    ),
    p(
      'The signal repeats every 11.7 minutes.\n' +
        'Same pattern. Same source.\n\n' +
        'Atmospheric pressure: nominal.\n' +
        'Oxygen: 19.4%.\n' +
        'Threat level: unknown.\n\n' +
        'I\'ve seen ships die.\n' +
        'This one isn\'t dying. This one is hiding.',
    ),
    p(
      'STATION TO LANDER -- COME IN, LANDER.\n' +
        '... LANDER, RESPOND.\n\n' +
        'Telemetry shows the hull is intact.\n' +
        'Life support is green across the board.\n' +
        'Crew vitals are nominal.\n\n' +
        'They just aren\'t answering.',
    ),
  ],
};

/** Slow-burn horror & weird tales. Lower volume, more dread. */
const horror: TextPresetSet = {
  id: 'horror',
  name: 'Horror / weird',
  bubbles: [
    p(
      'something is in the walls again.\n\n' +
        'it knows my name.\n\n' +
        'the dog won\'t go in the basement\n' +
        'anymore. neither will i.',
    ),
    p(
      '"Did you hear that?"\n' +
        '"Hear what?"\n' +
        '"...nothing. Forget it."\n\n' +
        'The mirror in the hall shows a room\n' +
        'that isn\'t there.\n\n' +
        'I counted the steps going down.\n' +
        'Thirteen.\n\n' +
        'Going back up: fourteen.',
    ),
    p(
      'Don\'t open the door.\n' +
        'Don\'t open the door.\n' +
        'Don\'t open the door.\n\n' +
        'It was wearing my mother\'s face.\n' +
        'It was smiling wrong.\n\n' +
        'The letter arrived in my own handwriting.\n' +
        'It was dated tomorrow.',
    ),
  ],
};

/** Quiet, mundane, slice-of-life. Tests low-energy lettering. */
const sliceOfLife: TextPresetSet = {
  id: 'slice-of-life',
  name: 'Slice of life',
  bubbles: [
    p(
      '"Did you remember the milk?"\n' +
        '"...I remembered the eggs."\n\n' +
        'The bus is late again.\n' +
        'It\'s always late on Tuesdays.\n' +
        'Why Tuesdays?\n\n' +
        '"How was school?"\n' +
        '"Fine."\n' +
        '"Anything happen?"\n' +
        '"Nope."',
    ),
    p(
      'I think the cat has been sitting\n' +
        'in this exact spot for six hours.\n\n' +
        'We could get pizza.\n' +
        'Or we could pretend the leftovers\n' +
        'are pizza.\n\n' +
        'It\'s not a big deal. It\'s really not.\n\n' +
        '...okay, it\'s a little deal.',
    ),
    p(
      'Sunday morning. Coffee.\n' +
        'No plans. No emergencies.\n' +
        'Nothing on fire.\n\n' +
        'Finally.\n\n' +
        '"You up?"\n' +
        '"No."\n' +
        '"Cool. Me neither."',
    ),
  ],
};

/** Narration / caption boxes. Long-form, past tense, scene-setting. */
const captions: TextPresetSet = {
  id: 'captions',
  name: 'Narration captions',
  bubbles: [
    p(
      'It had been three years since anyone\n' +
        'had spoken the old king\'s name aloud.\n\n' +
        'The harbor was quiet -- the kind of quiet\n' +
        'that only comes before bad weather.\n\n' +
        'She told herself she wasn\'t running.\n' +
        'She was just leaving very, very quickly.',
    ),
    p(
      'Of all the things he expected to find\n' +
        'in the desert that morning,\n' +
        'a door was not one of them.\n\n' +
        'Later, when the historians came\n' +
        'to write it down, they would call it\n' +
        '"The Quiet War."\n\n' +
        'It was anything but.',
    ),
    p(
      'The map was wrong.\n' +
        'The map had always been wrong.\n' +
        'But tonight, for the first time,\n' +
        'she noticed.\n\n' +
        'Two hundred miles south,\n' +
        'a stranger looked up at the same star\n' +
        'and made the same wish.\n\n' +
        'Neither of them got it.',
    ),
  ],
};

/** Sound effects of every shape and length. Stress-test caps and weight. */
const sfx: TextPresetSet = {
  id: 'sfx',
  name: 'Sound effects',
  bubbles: [
    p('KRAKOOM!  WHAMM!\nBRAKKA-BRAKKA-BRAKKA!'),
    p('THWIP!   SHA-KLAK!\nFWOOOOOSH'),
    p('ZZZZAP!\nthud.\ntick... tick... tick...'),
    p('drip.\ndrip.\ndrip.\n\nCRRRRRRACK!\n\nvrrrrrm-VROOM'),
    p('BLAM BLAM BLAM\nhsssssssssss\n*ahem*'),
    p('!?!?\nGLORP\nka-CHUNK'),
    p('SKREEEEEEEE\nwhump\n...silence.'),
  ],
};

/** Pangrams + punctuation + numbers. Full alphabet coverage. */
const pangrams: TextPresetSet = {
  id: 'pangrams',
  name: 'Pangrams & drills',
  bubbles: [
    p(
      'the quick brown fox jumps over the lazy dog.\n' +
        'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG.\n' +
        'Pack my box with five dozen liquor jugs.',
    ),
    p(
      'Sphinx of black quartz, judge my vow.\n' +
        'How vexingly quick daft zebras jump!\n' +
        'Jackdaws love my big sphinx of quartz.\n' +
        'Waltz, bad nymph, for quick jigs vex.',
    ),
    p(
      '0123456789\n' +
        '1 + 2 = 3,  10 x 10 = 100,  7/8 ~ 0.875\n' +
        ".,;:!?'\"-()[]{}*&@#$%/\\<>=+~^|",
    ),
    p(
      'AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz\n\n' +
        '"Hello," she said.\n' +
        '\'Hello,\' he replied.\n' +
        '-- and that was that.',
    ),
  ],
};

/** Long blocks for testing line-breaking, alignment, and layout under load. */
const longForm: TextPresetSet = {
  id: 'long-form',
  name: 'Long blocks',
  bubbles: [
    p(
      'Listen. I\'m only going to say this once,\n' +
        'so I need you to actually hear me\n' +
        'instead of nodding along like you usually do.\n\n' +
        'We are not going back. Not tonight.\n' +
        'Not tomorrow. Not ever.\n\n' +
        'Do you understand me?\n\n' +
        'There are two kinds of people in this city:\n' +
        'the ones who know what really happened\n' +
        'on the bridge that night,\n' +
        'and the ones who are still alive.\n\n' +
        'I am, as it happens, in both groups.\n' +
        'It is not a comfortable place to stand.',
    ),
    p(
      'CHAPTER ONE\n\n' +
        'In which our hero arrives,\n' +
        'discovers he is in the wrong city,\n' +
        'loses his hat, his dignity,\n' +
        'and most of his money,\n' +
        'and meets the woman who will,\n' +
        'three weeks from now,\n' +
        'try very hard to kill him.\n\n' +
        'first the lights went out.\n' +
        'then the phones.\n' +
        'then the cars on the street stopped\n' +
        'all at once, all at the same moment,\n' +
        'as if someone had simply\n' +
        'turned the world off.\n\n' +
        'and then -- nothing.\n' +
        'nothing at all.\n' +
        'for a very long time.',
    ),
  ],
};

/** Tiny one-shots merged into rapid-fire exchanges. */
const interjections: TextPresetSet = {
  id: 'interjections',
  name: 'Interjections',
  bubbles: [
    p('Hey!\nWait --\nNO.'),
    p('...what?\nOh no.\nOh, no.\nOh. No.'),
    p('YES!!\nHUH?!\nmm-hm.'),
    p('uh-uh.\nhmmmm...\n!\n?\n?!\n...\n--!\nOh.'),
  ],
};

export const textPresetSets: readonly TextPresetSet[] = (() => {
  const builtIn: TextPresetSet[] = [
    justKiddingPlaceholder,
    noir,
    sciFi,
    horror,
    sliceOfLife,
    captions,
    longForm,
    sfx,
    interjections,
    pangrams,
  ];
  // Optional per-developer local presets. The file is gitignored; if it
  // doesn't exist this glob just returns {} and we use the built-ins.
  // See textPresets.local.example.ts for the format.
  const localMods = import.meta.glob<{ default: TextPresetSet[] }>(
    './textPresets.local.ts',
    { eager: true },
  );
  const local: TextPresetSet[] = [];
  for (const mod of Object.values(localMods)) {
    if (Array.isArray(mod.default)) local.push(...mod.default);
  }
  return [...builtIn, ...local];
})();
