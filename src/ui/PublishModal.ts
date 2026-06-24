import { ButtonComponent, Modal, Setting, TextComponent, type App, type TFile } from "obsidian";

export class PublishModal extends Modal {
  private commitMessage: string;
  private resolveResult?: (message: string | null) => void;
  private submitted = false;

  constructor(
    app: App,
    private readonly file: TFile,
    private readonly destination: string,
    defaultCommitMessage: string,
  ) {
    super(app);
    this.commitMessage = defaultCommitMessage;
  }

  openAndWait(): Promise<string | null> {
    this.open();
    return new Promise((resolve) => {
      this.resolveResult = resolve;
    });
  }

  onOpen(): void {
    this.setTitle("Publish current note");
    this.contentEl.createEl("p", {
      text: `Publish ${this.file.path} to ${this.destination}?`,
    });

    new Setting(this.contentEl)
      .setName("Commit message")
      .setDesc("You can edit the message for this publish.")
      .addText((text: TextComponent) => {
        text
          .setPlaceholder("publish {{title}}")
          .setValue(this.commitMessage)
          .onChange((value) => { this.commitMessage = value; });
        text.inputEl.addEventListener("keydown", (event) => {
          if (event.key === "Enter") this.submit();
        });
      });

    const actions = this.contentEl.createDiv({ cls: "squido-publish-actions" });
    new ButtonComponent(actions).setButtonText("Cancel").onClick(() => this.close());
    new ButtonComponent(actions).setButtonText("Publish").setCta().onClick(() => this.submit());
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.submitted) this.resolveResult?.(null);
  }

  private submit(): void {
    const message = this.commitMessage.trim();
    if (!message) return;
    this.submitted = true;
    this.resolveResult?.(message);
    this.close();
  }
}
