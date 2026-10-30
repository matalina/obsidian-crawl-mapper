import { MarkdownPostProcessorContext, Plugin } from 'obsidian';
import { ParseError } from './error';
import { CrawlMap } from './crawl-map';
import { DEFAULT_SETTINGS, CrawlMapperSettings, CrawlMapperSettingTab } from './settings';

/** Code-block languages rendered as maps. `text-mapper` keeps older notes working. */
const CODE_BLOCK_LANGUAGES = ['crawl-mapper', 'text-mapper'];

export default class CrawlMapperPlugin extends Plugin {
  declare settings: CrawlMapperSettings;
  activeMappers: Set<CrawlMap> = new Set();

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new CrawlMapperSettingTab(this.app, this));

    for (const language of CODE_BLOCK_LANGUAGES) {
      try {
        this.registerMarkdownCodeBlockProcessor(language, (source, el, ctx) => this.processMarkdown(source, el, ctx));
      } catch (e) {
        // Another plugin (e.g. Tag and Tally) may already own this language.
        console.warn(`Crawl Mapper: could not register "${language}" code blocks`, e);
      }
    }
  }

  registerMapper(mapper: CrawlMap) {
    this.activeMappers.add(mapper);
  }

  unregisterMapper(mapper: CrawlMap) {
    this.activeMappers.delete(mapper);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<CrawlMapperSettings>);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  processMarkdown(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
    try {
      ctx.addChild(new CrawlMap(el, ctx.docId, source, this, ctx.sourcePath));
    } catch (e) {
      console.error('Crawl Mapper error', e);
      ctx.addChild(new ParseError(el));
    }
  }
}
