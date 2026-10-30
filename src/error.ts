import { MarkdownRenderChild } from "obsidian";

export class ParseError extends MarkdownRenderChild {
    constructor(containerEl: HTMLElement) {
        super(containerEl);
        containerEl.innerText = "Error!";
    }
}
