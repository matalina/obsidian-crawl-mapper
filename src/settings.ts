import { App, PluginSettingTab, Setting } from 'obsidian';
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

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Save location')
      .setDesc('Folder where PNG exports are saved. Leave empty to save next to the current note.')
      .addText((text) =>
        text
          .setPlaceholder('_saved-maps')
          .setValue(this.plugin.settings.saveLocation)
          .onChange(async (value) => {
            this.plugin.settings.saveLocation = value.trim().replace(/^\/+|\/+$/g, '');
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Show overlays')
      .setDesc('Show ring overlays (overlay-<color>-<ring> regions) on hex maps.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.overlaysVisible).onChange(async (value) => {
          this.plugin.settings.overlaysVisible = value;
          await this.plugin.saveSettings();
          this.plugin.activeMappers.forEach((mapper) => mapper.applyOverlayVisibility());
        }),
      );
  }
}
