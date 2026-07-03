import { PluginSettingTab, type App } from "obsidian";
import type SquidoPlugin from "../main";
import { renderConnectionSection } from "./connectionSection";
import { renderDeveloperSection, renderManualPatSection } from "./staticSections";

export class SquidoSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: SquidoPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    this.plugin.setConnectionStateChangeHandler(() => this.display());
    containerEl.createEl("h2", { text: "Squido settings" });
    containerEl.createEl("p", {
      text: "Connect GitHub App authentication for future connection-based publishing, or use the advanced manual token fallback for the current alpha publisher.",
    });

    const settings = this.plugin.getSettings();

    renderConnectionSection(containerEl, this.plugin, settings, () => this.display());
    renderManualPatSection(containerEl, this.plugin, settings);

    const buildInfo = this.plugin.getBuildInfo();
    if (buildInfo) renderDeveloperSection(containerEl, buildInfo);
  }
}
