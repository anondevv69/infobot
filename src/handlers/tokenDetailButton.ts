import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ComponentType,
  EmbedBuilder,
} from "discord.js";
import { fetchTokensByAddress } from "../services/clanker";
import {
  buildTokenEmbed,
  extractAddressFromDetailCustomId,
  resolveUserFromToken,
} from "../utils/clankerEmbeds";

export async function handleTokenDetailButton(
  interaction: ButtonInteraction,
): Promise<void> {
  const contract = extractAddressFromDetailCustomId(interaction.customId);
  if (!contract) {
    return;
  }

  const tokens = await fetchTokensByAddress(contract);
  if (tokens.length === 0) {
    await interaction.reply({
      content: `No token details found for \`${contract}\`.`,
      ephemeral: true,
    });
    return;
  }

  const token = tokens[0];
  const user = await resolveUserFromToken(token);
  const tokenEmbed = buildTokenEmbed(
    token,
    user ? { farcasterUser: user } : undefined,
  );

  const existingEmbeds = interaction.message.embeds.map((embed) =>
    EmbedBuilder.from(embed),
  );
  const hasTokenEmbed = existingEmbeds.some(
    (embed) => embed.data.url === tokenEmbed.data.url,
  );

  const embedsToApply = hasTokenEmbed
    ? existingEmbeds
    : [...existingEmbeds, tokenEmbed];

  const updatedRows = interaction.message.components.map((row) => {
    const builder = new ActionRowBuilder<ButtonBuilder>();
    const components = ((row as unknown) as { components?: any[] }).components ?? [];
    for (const component of components) {
      if (component.type !== ComponentType.Button) {
        continue;
      }
      const button = ButtonBuilder.from(component);
      if (
        "custom_id" in component &&
        component.custom_id === interaction.customId
      ) {
        button.setDisabled(true);
      }
      builder.addComponents(button);
    }
    return builder;
  });

  await interaction.update({
    embeds: embedsToApply.map((embed) => embed.toJSON()),
    components: updatedRows.map((row) => row.toJSON()),
  });
}

