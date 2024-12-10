import { access, copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
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
    return `https://cdn.jsdelivr.net/gh/${repo}@${branch}/${path}`;
}

await mkdir('./fonts', { recursive: true });

function exists(path: string): Promise<boolean> {
    return new Promise(resolve => access(path).then(() => resolve(true)).catch(() => resolve(false)));
}

async function* getFiles() {
    for (const file of await readdir(root)) {
        const globbed = await glob('*.ttf', {
            cwd: join(root, file, 'googlefonts/ttf')
        });

        for (const f of globbed) {
            const fullpath = join(root, file, 'googlefonts/ttf', f);
            
            const relpath = relative(root, fullpath).replace(/\\/g, '/');
            const url = getGithackUrl('notofonts/notofonts.github.io', 'noto-monthly-release-2024.12.01', `fonts/${relpath}`);
        
            yield [
                fullpath,
                url,
            ] as const;
        }
    }

    const nfPath = join(homedir(), 'Downloads/NerdFontsSymbolsOnly/SymbolsNerdFont-Regular.ttf');
    yield [
        nfPath,
        getGithackUrl('ryanoasis/nerd-fonts', 'master', 'patched-fonts/NerdFontsSymbolsOnly/SymbolsNerdFont-Regular.ttf'),
    ] as const;

}

const weightMappings = {
    ExtraBold: '800',
    ExtraLight: '200',
    SemiBold: '600',
    Thin: '100',
    Black: '900',
    Bold: '700',
    Light: '300',
    Medium: '500',
    Regular: '400',
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

const files = await Array.fromAsync(getFiles());

const fonts = new Map(files.map(([file, url]) => {
    const fontName = basename(file, extname(file));

    const fontFamily = camelPad(fontName.slice(0, fontName.lastIndexOf('-')));
    const fontVariant = fontName.slice(fontName.lastIndexOf('-') + 1);

    return [fontName, { fontFamily, fontVariant, file, url }]
}));

const notoSansRegularCodes = await readCodesFromFontFile(fonts.get('NotoSans-Regular')!.file);

let jsdelivrCss = '';
let ghPagesCss = '';
for (const [fontName, { fontFamily, fontVariant, file, url }] of fonts.entries()) {
    // console.log(fontName);

    const weightMapping = (Object.keys(weightMappings)
        .find(mapping => fontVariant.includes(mapping))) as keyof typeof weightMappings;
    const italic = fontVariant.includes('Italic');
    if (widthMappings.find(mapping => fontVariant.includes(mapping))) {
        continue; // idk waht to do with these
    }

    let codes = await readCodesFromFontFile(file);
    
    if (fontFamily !== 'Noto Sans' && fontFamily !== 'Noto Serif') {
        codes = codes.difference(notoSansRegularCodes);
    }

    if (codes.size === 0) {
        console.warn(`No codes: ${fontName}`);
        continue;
    }
    
    if (!await exists(join('./fonts', basename(file)))) {
        await copyFile(
            file,
            join('./fonts', basename(file)),
        );
    }

    fontFamilies.add(fontFamily);

    const ranges = codesToUnicodeRange(codes);

    jsdelivrCss += `
@font-face {
    font-family: "${fontFamily}";
    src: url("${url}") format("truetype");
    unicode-range: ${ranges};
    font-weight: ${weightMapping ? weightMappings[weightMapping] : 'normal'};
    font-style: ${italic ? 'italic' : 'normal'};
}
`;

    ghPagesCss += `
@font-face {
    font-family: "${fontFamily}";
    src: url("https://uwx.github.io/noto-and-nerd-fonts/${fontName}.ttf") format("truetype");
    unicode-range: ${ranges};
    font-weight: ${weightMapping ? weightMappings[weightMapping] : 'normal'};
    font-style: ${italic ? 'italic' : 'normal'};
}
`;
}

const suffix = `
.font-sans {
    font-family:
        /* Noto Sans */
        ${[...fontFamilies]
            .filter(font => font.startsWith('Noto Sans'))
            .map(font => `"${font}"`).join(',\n        ')},
        /* Noto Extra */
        "Noto Naskh Arabic UI",
        "Noto Nastaliq Urdu",
        "Noto Rashi Hebrew",
        "Noto Fangsong KSS Rotated",
        "Noto Fangsong KSS Vertical",
        "Noto Kufi Arabic",
        "Noto Music",
        "Noto Naskh Arabic",
        /* NF */
        "Symbols Nerd Font",
        sans-serif;
}

.font-serif {
    font-family:
        /* Noto Serif */
        ${[...fontFamilies]
            .filter(font => font.startsWith('Noto Serif'))
            .map(font => `"${font}"`).join(',\n        ')},
        /* Noto Extra */
        "Noto Naskh Arabic UI",
        "Noto Nastaliq Urdu",
        "Noto Rashi Hebrew",
        "Noto Fangsong KSS Rotated",
        "Noto Fangsong KSS Vertical",
        "Noto Kufi Arabic",
        "Noto Music",
        "Noto Naskh Arabic",
        /* NF */
        "Symbols Nerd Font",
        serif;
}
`;

writeFile('./fonts/complete-jsdelivr.css', jsdelivrCss + suffix);
writeFile('./fonts/complete.css', ghPagesCss + suffix);