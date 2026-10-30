import { App, debounce, PluginSettingTab, type SettingDefinitionItem } from 'obsidian';
import type CrawlMapperPlugin from './main';
import { ICON_PACK_IDS } from './icon-packs';

export interface CrawlMapperSettings {
  saveLocation: string;
  overlaysVisible: boolean;
  /** Packs for maps without their own `option icons` line: "all" or pack ids. */
  defaultIconPacks: string;
}

export const DEFAULT_SETTINGS: CrawlMapperSettings = {
  saveLocation: '_saved-maps',
  overlaysVisible: true,
  defaultIconPacks: 'all',
};

export class CrawlMapperSettingTab extends PluginSettingTab {
  plugin: CrawlMapperPlugin;

  constructor(app: App, plugin: CrawlMapperPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: 'Save location',
        desc: 'Folder where PNG exports are saved. Leave empty to save next to the current note.',
        control: { type: 'text', key: 'saveLocation', placeholder: '_saved-maps' },
      },
      {
        name: 'Show overlays',
        desc: 'Show ring overlays (overlay-<color>-<ring> regions) on hex maps.',
        control: { type: 'toggle', key: 'overlaysVisible' },
      },
      {
        name: 'Default icon packs',
        desc: `Icon packs for maps without an "option icons" line: "all", or any of ${ICON_PACK_IDS.join(', ')}.`,
        control: { type: 'text', key: 'defaultIconPacks', placeholder: 'all' },
      },
    ];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === 'saveLocation') {
      const raw = typeof value === 'string' ? value : '';
      this.plugin.settings.saveLocation = raw.trim().replace(/^\/+|\/+$/g, '');
      await this.plugin.saveSettings();
      return;
    }

    await super.setControlValue(key, value);
    if (key === 'overlaysVisible') {
      this.plugin.activeMappers.forEach((mapper) => mapper.applyOverlayVisibility());
    }
    if (key === 'defaultIconPacks') {
      this.refreshMappers();
    }
  }

  // Wait for typing to pause, so maps don't re-render (and flash notes about
  // half-typed pack names) on every keystroke.
  private refreshMappers = debounce(() => this.plugin.activeMappers.forEach((mapper) => mapper.refresh()), 600, true);
}
