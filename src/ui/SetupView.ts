import { ItemView, Notice, type WorkspaceLeaf } from "obsidian";
import type SquidoPlugin from "../main";
import { renderConnectionSection } from "../settings/connectionSection";
import { renderManualPatSection } from "../settings/staticSections";
import { renderDestinationSection } from "../settings/destinationSection";
import type { ConnectionMode } from "../types";

export const SETUP_VIEW_TYPE = "squido-welcome-setup";
export const CONNECTION_OPTIONS: Array<{ mode: ConnectionMode; title: string; summary: string; explainer: string }> = [
  {
    mode: "broker", title: "Connect with GitHub",
    summary: "Managed authorization, short-lived tokens, easier setup and revocation.",
    explainer: "Squido uses its authorization broker to request temporary GitHub credentials. Your note content is sent directly to GitHub, never through Squido's servers.",
  },
  {
    mode: "pat", title: "Use my own token",
    summary: "No Squido server involvement. You manage your own GitHub PAT and its expiration.",
    explainer: "Create a fine-grained PAT limited to your selected repositories. Squido stores it using Obsidian SecretStorage and sends publishing requests directly to GitHub.",
  },
];

/** Native buttons provide Tab, Enter and Space without custom keyboard emulation. */
export function renderConnectionSelector(container: HTMLElement, mode: ConnectionMode, select: (mode: ConnectionMode) => Promise<void>): void {
  const cards = container.createDiv({ cls: "squido-connection-cards" });
  cards.setAttribute("role", "group");
  cards.setAttribute("aria-label", "GitHub connection method");
  const buttons: Array<[ConnectionMode, HTMLButtonElement]> = [];
  const panel = container.createDiv({ cls: "squido-connection-explainer" });
  panel.setAttribute("aria-live", "polite");
  const update = (selected: ConnectionMode) => {
    for (const [value, button] of buttons) {
      button.setAttribute("aria-pressed", String(value === selected));
      button.classList.toggle("is-selected", value === selected);
      button.querySelector(".squido-card-check")!.textContent = value === selected ? "✓" : "";
    }
    panel.textContent = CONNECTION_OPTIONS.find((option) => option.mode === selected)!.explainer;
  };
  for (const option of CONNECTION_OPTIONS) {
    const button = cards.createEl("button", { cls: "squido-connection-card" });
    button.type = "button";
    button.setAttribute("aria-label", `${option.title}. ${option.summary}`);
    button.createSpan({ cls: "squido-card-check", attr: { "aria-hidden": "true" } });
    button.createSpan({ cls: "squido-card-title", text: option.title });
    button.createSpan({ cls: "squido-card-summary", text: option.summary });
    button.addEventListener("click", async () => {
      for (const [, item] of buttons) item.disabled = true;
      try { await select(option.mode); update(option.mode); }
      catch { new Notice("Connection method could not be saved. The previous selection is still active."); }
      finally { for (const [, item] of buttons) item.disabled = false; }
    });
    buttons.push([option.mode, button]);
  }
  update(mode);
}

export class SetupView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private readonly plugin: SquidoPlugin) { super(leaf); }
  getViewType(): string { return SETUP_VIEW_TYPE; }
  getDisplayText(): string { return "Squido Welcome / Setup"; }
  getIcon(): string { return "upload"; }
  async onOpen(): Promise<void> { this.render(); }
  render(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass("squido-setup");
    container.createEl("h1", { text: "Welcome to Squido" });
    container.createEl("p", { text: "Publish your Obsidian notes directly to GitHub. Choose how you'd like to connect your account." });
    const mode = this.plugin.getSettings().connectionMode ?? "broker";
    renderConnectionSelector(container, mode, async (selected) => {
      await this.plugin.selectConnectionMode(selected);
      this.renderDetails(details);
    });
    const details = container.createDiv({ cls: "squido-setup-details" });
    this.renderDetails(details);
  }
  private renderDetails(container: HTMLElement): void {
    container.empty();
    const settings = this.plugin.getSettings();
    container.createEl("p", { text: "Persistent credentials use Obsidian SecretStorage. Named secrets and the community-plugin JavaScript runtime are shared: this is not per-plugin isolation or a promise of encrypted storage on macOS/iOS. Use trusted plugins, narrow repository access and expiration. Configure secrets on each device if needed." });
    if (settings.connectionMode === "pat") {
      container.createEl("h2", { text: "Personal access token" });
      container.createEl("p", { text: "In GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens, choose your repository owner and only selected repositories. Grant Contents: read and write (publishing reads existing file SHA then writes content; Metadata: read is automatic). Do not grant Actions, Administration or Workflows. Use a non-workflow destination path. Set a short expiration and replace the token before it expires. Organization approval may be required." });
      const link = container.createEl("a", { text: "Create or revoke a fine-grained PAT", href: "https://github.com/settings/personal-access-tokens" });
      link.setAttribute("rel", "noopener noreferrer"); link.setAttribute("target", "_blank");
      container.createEl("p", { text: "PAT mode never calls Squido's broker or Cloudflare, including background verification/polling. Forget token clears the local SecretStorage value; revoke access separately in GitHub. Switching mode preserves the other credential, does not revoke it, and never silently falls back." });
      renderManualPatSection(container, this.plugin, settings);
    } else {
      container.createEl("h2", { text: "GitHub App connection" });
      container.createEl("p", { text: "Install Squido's GitHub App only for selected repositories. Broker grants are device-bound, expire and rotate; installation tokens are temporary and memory-only. Disconnect This Device revokes the local broker session; remove the GitHub App under GitHub Settings → Applications to revoke installation access. The broker remains content-blind." });
      container.createEl("p", { text: "Current alpha limitation: GitHub App authorization works, but App-based publishing is not implemented. The existing broker vending scope is metadata read for repository discovery, not Contents write. Publishing is disabled in this mode rather than silently using a PAT. Choose Use my own token for publishing now." });
      renderConnectionSection(container, this.plugin, settings, () => this.render());
    }
    renderDestinationSection(container, this.plugin);
  }
}
