import { readdir, readFile, writeFile } from "node:fs/promises";
import { parse } from "opentype.js";
import { codesToUnicodeRange, getCodes } from "./lib";
import { glob } from 'tinyglobby';
import { homedir } from "node:os";
import { basename, extname, join, relative } from "node:path";

async function readCodesFromFontFile(path: string): Promise<Set<number>> {
    const font = parse(new Uint8Array(await readFile(path)).buffer);
    return getCodes(font);
}

const root = join(homedir(), 'Documents/GitHub/notofonts.github.io/fonts');

function getGithackUrl(repo: string, branch: string, path: string) {
    return `https://rawcdn.githack.com/${repo}/refs/heads/${branch}/fonts/${path}`;
}

async function* getFiles() {
    for (const file of await readdir(root)) {
        const globbed = await glob('*.ttf', {
            cwd: join(root, file, 'googlefonts/ttf')
        });

        for (const f of globbed) {
            const relpath = relative(root, file).replace(/\\/g, '/');
            const url = getGithackUrl('notofonts/notofonts.github.io', 'main', `fonnts/${relpath}`);
        
            yield [
                join(root, file, 'googlefonts/ttf', f),
                url
            ] as const;
        }
    }

    yield [
        join(homedir(), 'Downloads/NerdFontsSymbolsOnly/SymbolsNerdFont-Regular.ttf'),
        getGithackUrl('ryanoasis/nerd-fonts', 'master', 'patched-fonts/NerdFontsSymbolsOnly/SymbolsNerdFont-Regular.ttf')
    ];
}

const weightMappings = {
    ExtraBold: '800',
    ExtraLight: '200',
    SemiBold: '600',
    Thin: '100',
    Black: '900',
    Bold: 'bold',
    Light: 'light',
    Medium: '500',
    Regular: 'normal',
};

const widthMappings = [
    'Condensed',
    'ExtraCondensed',
    'SemiCondensed',
];

const fontFamilies = new Set<string>();

// https://stackoverflow.com/a/26188910
function camelPad(str: string){
    return str
        // Look for long acronyms and filter out the last letter
        .replace(/([A-Z]+)([A-Z][a-z])/g, ' $1 $2')
        // Look for lower-case letters followed by upper-case letters
        .replace(/([a-z\d])([A-Z])/g, '$1 $2')
        // Look for lower-case letters followed by numbers
        .replace(/([a-zA-Z])(\d)/g, '$1 $2')
        .replace(/^./, str => str.toUpperCase())
        // Remove any white space left around the word
        .trim();
}

let css = '';
for await (const [file, url] of getFiles()) {
    const fontName = basename(file, extname(file));

    const fontFamily = camelPad(fontName.slice(0, fontName.lastIndexOf('-')));
    const fontVariant = fontName.slice(fontName.lastIndexOf('-') + 1);
    const weightMapping = (Object.keys(weightMappings)
        .find(mapping => fontVariant.includes(mapping))) as keyof typeof weightMappings;
    const italic = fontVariant.includes('Italic');
    if (widthMappings.find(mapping => fontVariant.includes(mapping))) {
        continue; // idk waht to do with these
    }

    const ranges = codesToUnicodeRange(await readCodesFromFontFile(file));

    fontFamilies.add(fontFamily);

    css += `
@font-face {
    font-family: "${fontFamily}";
    src: url("${url}") format("truetype");
    unicode-range: ${ranges};
    font-weight: ${weightMapping ? weightMappings[weightMapping] : 'normal'};
    font-style: ${italic ? 'italic' : 'normal'};
}
`;
}

css += `
.font-sans {
    font-family:
        "Noto Sans",
        ${[...fontFamilies]
            .filter(font => !font.startsWith('Noto Serif'))
            .map(font => `"${font}"`).join(',\n        ')},
        sans-serif;
}

.font-serif {
    font-family:
        "Noto Serif",
        ${[...fontFamilies]
            .filter(font => !font.startsWith('Noto Sans'))
            .map(font => `"${font}"`).join(',\n        ')},
        serif;
}
`;

writeFile('./complete.css', css);