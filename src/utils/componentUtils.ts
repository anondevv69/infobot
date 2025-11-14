import { ActionRowBuilder, ButtonBuilder } from "discord.js";

export function combineComponentRows(
  ...groups: Array<ActionRowBuilder<ButtonBuilder>[] | undefined | null>
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (const group of groups) {
    if (!group) {
      continue;
    }
    for (const row of group) {
      if (rows.length >= 5) {
        return rows;
      }
      rows.push(row);
      if (rows.length >= 5) {
        return rows;
      }
    }
  }
  return rows;
}
