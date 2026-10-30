import { App, PluginSettingTab, type SettingDefinitionItem } from 'obsidian';
import type CrawlMapperPlugin from './main';

export interface CrawlMapperSettings {
  saveLocation: string;
  overlaysVisible: boolean;
}

export const DEFAULT_SETTINGS: CrawlMapperSettings = {
  saveLocation: '_saved-maps',
  overlaysVisible: true,
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
  }
}
