import { OPTION_REGEX } from "./constants";

/** First fenced text-mapper block body, or null. */
export function extractFirstTextMapperBlockSource(markdown: string): string | null {
    const m = markdown.match(/```text-mapper\n([\s\S]*?)```/);
    return m ? m[1] : null;
}

/** Same option pass as TextMapperParser: ignore # lines; honor option map-type city. */
export function textMapperSourceIsCity(source: string): boolean {
    const lines = source.split("\n");
    for (const line of lines) {
        if (line.startsWith("#")) continue;
        if (!OPTION_REGEX.test(line)) continue;
        const match = line.match(OPTION_REGEX);
        if (!match) continue;
        const tokens = match[1].trim().split(/\s+/);
        if (tokens[0] === "map-type" && tokens[1] === "city") {
            return true;
        }
    }
    return false;
}

/** True if the note's first text-mapper block is city mode. */
export function markdownTextMapperIsCity(markdown: string): boolean {
    const block = extractFirstTextMapperBlockSource(markdown);
    if (!block) return false;
    return textMapperSourceIsCity(block);
}
