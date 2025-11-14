import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { getCopyValue, registerCopyValue } from "./copyStore";

export const COPY_BUTTON_PREFIX = "copy:";

export function createCopyButton(label: string, copyLabel: string, value: string): ButtonBuilder {
  const key = registerCopyValue(copyLabel, value);
  return new ButtonBuilder()
    .setCustomId(`${COPY_BUTTON_PREFIX}${key}`)
    .setStyle(ButtonStyle.Secondary)
    .setLabel(label);
}

export function buildCopyRows(buttons: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += 5) {
    const slice = buttons.slice(i, i + 5);
    if (slice.length > 0) {
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...slice));
    }
  }
  return rows;
}

export function resolveCopyPayload(customId: string): { label: string; value: string } | null {
  if (!customId.startsWith(COPY_BUTTON_PREFIX)) {
    return null;
  }
  const key = customId.slice(COPY_BUTTON_PREFIX.length);
  if (!key) {
    return null;
  }
  const payload = getCopyValue(key);
  if (!payload) {
    return null;
  }
  return { label: payload.label, value: payload.value };
}
