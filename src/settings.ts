import { PluginSettingTab, Setting, type App } from "obsidian";
import type SquidoPlugin from "./main";
import type { SquidoSettings } from "./types";

type TextSettingKey = {
  [K in keyof SquidoSettings]: SquidoSettings[K] extends string ? K : never;
}[keyof SquidoSettings] & Exclude<keyof SquidoSettings, "githubTokenSource">;

export class SquidoSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: SquidoPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Squido settings" });
    containerEl.createEl("p", {
      text: "Configure the single GitHub publishing destination used by the current alpha.",
    });

    const settings = this.plugin.getSettings();

    containerEl.createEl("h3", { text: "GitHub authentication" });
    containerEl.createEl("p", {
      text: "Device Flow is the recommended login path. Manual token entry remains available as an advanced fallback.",
    });
    containerEl.createEl("p", { text: this.plugin.secureCredentialStatus() });
    this.textSetting(settings, "OAuth Client ID", "GitHub OAuth app client ID with Device Flow enabled. No client secret is stored in Squido.", "githubOAuthClientId");
    this.textSetting(settings, "OAuth scopes", "Requested GitHub OAuth scopes. Use repo for private repositories or public_repo for public repositories only.", "githubOAuthScopes");
    new Setting(containerEl)
      .setName("Connect GitHub")
      .setDesc("Opens GitHub's device login screen and stores the returned token through secure local storage.")
      .addButton((button) => {
        button
          .setButtonText("Connect GitHub")
          .setCta()
          .onClick(() => void this.plugin.startGitHubDeviceFlow(() => this.display()));
      });

    if (settings.githubDeviceUserCode && settings.githubDeviceVerificationUri) {
      const authStatus = containerEl.createDiv({ cls: "squido-auth-status" });
      authStatus.createEl("div", { text: `GitHub code: ${settings.githubDeviceUserCode}` });
      authStatus.createEl("div", { text: `Open: ${settings.githubDeviceVerificationUri}` });
      if (settings.githubDeviceExpiresAt) authStatus.createEl("div", { text: `Expires: ${settings.githubDeviceExpiresAt}` });
    }
    if (settings.githubDeviceStatus) {
      containerEl.createEl("p", { text: settings.githubDeviceStatus });
    }
    if (settings.hasGitHubCredential || settings.githubUserLogin) {
      new Setting(containerEl)
        .setName("Connected account")
        .setDesc(connectionDescription(settings))
        .addButton((button) => {
          button
            .setButtonText("Disconnect")
            .onClick(async () => {
              await this.plugin.disconnectGitHub();
              this.display();
            });
        });
    }

    new Setting(containerEl)
      .setName("Manual GitHub token")
      .setDesc("Advanced fallback. The token is write-only and stored through secure local storage, not saved as plaintext in plugin data.")
      .addText((text) => {
        text
          .setPlaceholder(settings.hasGitHubCredential ? "Token already stored" : "Paste token")
          .onChange(async (value) => {
            const token = value.trim();
            if (!token) return;
            await this.plugin.storeManualGitHubToken(token);
            text.setValue("");
            this.display();
          });
        text.inputEl.type = "password";
      });

    containerEl.createEl("h3", { text: "Publish destination" });
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
    key: TextSettingKey,
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

function connectionDescription(settings: SquidoSettings): string {
  const account = settings.githubUserLogin ? `Connected as ${settings.githubUserLogin}` : "GitHub credential stored";
  const scopes = settings.githubTokenScopes ? `Granted scopes: ${settings.githubTokenScopes}` : "Granted scopes: not reported";
  return `${account}. Source: ${settings.githubTokenSource}. ${scopes}.`;
}
