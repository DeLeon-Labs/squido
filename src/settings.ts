import { PluginSettingTab, Setting, type App } from "obsidian";
import type SquidoPlugin from "./main";
import type { SquidoSettings } from "./types";

export class SquidoSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: SquidoPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Squido settings" });
    containerEl.createEl("p", {
      text: "Configure the single GitHub publishing destination used by the 0.1.0-alpha MVP.",
    });

    const settings = this.plugin.getSettings();
    this.textSetting(settings, "GitHub token", "A token with Contents write access to the destination repository.", "githubToken", true);
    this.textSetting(settings, "Owner or organization", "The GitHub account that owns the repository.", "owner");
    this.textSetting(settings, "Repository", "Repository name without the owner.", "repo");
    this.textSetting(settings, "Branch", "Branch to publish to.", "branch");
    this.textSetting(settings, "Target folder", "Optional repository folder. The note filename is appended.", "targetFolder");
    this.textSetting(settings, "Default commit message", "Use {{title}} to insert the note title.", "commitMessageTemplate");
  }

  private textSetting(
    settings: SquidoSettings,
    name: string,
    description: string,
    key: keyof SquidoSettings,
    password = false,
  ): void {
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(description)
      .addText((text) => {
        text.setValue(settings[key]).onChange(async (value) => {
          settings[key] = value;
          await this.plugin.updateSettings(settings);
        });
        if (password) text.inputEl.type = "password";
      });
  }
}

