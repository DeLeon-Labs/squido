import { PluginSettingTab, Setting, type App } from "obsidian";
import type SquidoPlugin from "../main";
import { renderConnectionSection } from "./connectionSection";
import { renderDestinationSection } from "./destinationSection";
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
      text: "Choose an independent GitHub App or PAT connection in the dedicated Welcome / Setup tab. Switching preserves credentials; local forgetting and GitHub-side revocation are separate actions.",
    });

    const settings = this.plugin.getSettings();

    new Setting(containerEl).setName("Connection method")
      .setDesc(settings.connectionMode === "pat" ? "PAT: direct to GitHub; no broker calls." : "GitHub App: broker authorization; App publishing is not implemented yet.")
      .addButton((button) => button.setButtonText("Open Welcome / Setup").onClick(() => this.plugin.openSetup()));
    if (settings.connectionMode === "pat") renderManualPatSection(containerEl, this.plugin, settings);
    else renderConnectionSection(containerEl, this.plugin, settings, () => this.display());

    renderDestinationSection(containerEl, this.plugin);

    renderDeveloperSection(containerEl, this.plugin.getBuildInfo(), this.plugin.getBuildInfoDiagnostics());
  }
}
