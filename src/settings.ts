import { PluginSettingTab, Setting, type App } from "obsidian";
import type SquidoPlugin from "./main";
import type { BuildInfo, SquidoSettings } from "./types";

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

    const buildInfo = this.plugin.getBuildInfo();
    if (buildInfo) this.renderDeveloperSection(buildInfo);
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

  private renderDeveloperSection(buildInfo: BuildInfo): void {
    const details = this.containerEl.createEl("details", { cls: "squido-developer-section" });
    details.createEl("summary", { text: "Developer" });
    details.createEl("p", {
      text: "Non-release build diagnostics. This section is generated from dist/build-info.json and is hidden from production builds.",
    });

    const rows = [
      ["Version", buildInfo.version],
      ["Branch", buildInfo.branch],
      ["Commit", `${buildInfo.shortCommit} (${buildInfo.commit})`],
      ["Build timestamp", buildInfo.builtAt],
      ["Dirty state", buildInfo.dirty ? "dirty" : "clean"],
      ["Build default broker URL", buildInfo.defaultBrokerUrl ?? "not set"],
    ];

    const list = details.createEl("dl", { cls: "squido-build-info" });
    for (const [label, value] of rows) {
      list.createEl("dt", { text: label });
      list.createEl("dd", { text: value });
    }
  }
}
