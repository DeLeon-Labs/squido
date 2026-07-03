import { Setting } from "obsidian";
import type SquidoPlugin from "../main";
import type { SquidoSettings } from "../types";

export type TextSettingKey = {
  [Key in keyof SquidoSettings]: SquidoSettings[Key] extends string ? Key : never;
}[keyof SquidoSettings];

export function renderTextSetting(
  containerEl: HTMLElement,
  plugin: SquidoPlugin,
  settings: SquidoSettings,
  name: string,
  description: string,
  key: TextSettingKey,
  password = false,
): void {
  new Setting(containerEl)
    .setName(name)
    .setDesc(description)
    .addText((text) => {
      text.setValue(settings[key]).onChange(async (value) => {
        settings[key] = value;
        await plugin.updateSettings(settings);
      });
      if (password) text.inputEl.type = "password";
    });
}

