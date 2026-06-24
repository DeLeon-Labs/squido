import type { PublishStatus } from "../types";

const LABELS: Record<PublishStatus, string> = {
  unpublished: "Squido: Unpublished",
  published: "Squido: Published",
  changed: "Squido: Changed",
  deleted: "Squido: Deleted locally",
  error: "Squido: Publish error",
};

export class SquidoStatusBar {
  constructor(private readonly element: HTMLElement) {
    this.clear();
  }

  setStatus(status: PublishStatus): void {
    this.element.setText(LABELS[status]);
    this.element.setAttr("aria-label", LABELS[status]);
  }

  clear(): void {
    this.element.setText("");
    this.element.removeAttribute("aria-label");
  }
}

